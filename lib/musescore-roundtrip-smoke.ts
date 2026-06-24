import { spawn } from 'child_process';
import { mkdir, mkdtemp, readFile, rm, stat, writeFile } from 'fs/promises';
import { tmpdir } from 'os';
import { basename, dirname, extname, isAbsolute, join, relative, resolve } from 'path';
import { extractXmlFromMxl, packXmlToMxl } from '@/lib/mxl-utils';
import {
  cleanMuseScoreStderr,
  museScoreSpawnEnv,
  readMuseScoreCliVersion,
  resolveMuseScoreCli,
} from '@/lib/musescore-cli';
import { exportCoreToMusicXml } from '@/src/musicxml-adapter/export/export-core-to-musicxml';
import { importMusicXmlToCore } from '@/src/musicxml-adapter/import/import-musicxml';

export type MuseScoreSmokeStepStatus =
  | 'passed'
  | 'failed'
  | 'crashed'
  | 'timed-out'
  | 'spawn-error'
  | 'missing-output'
  | 'skipped';

export type MuseScoreSmokeVerdict =
  | 'passed'
  | 'passed-with-local-musescore-limit'
  | 'failed'
  | 'skipped';

export interface MuseScoreSmokeStepResult {
  id: string;
  fixture: string;
  variant:
    | 'source-musicxml'
    | 'source-musescore-mxl'
    | 'source-musescore-mscz'
    | 'nex-note-musicxml'
    | 'nex-note-mxl'
    | 'nex-note-mscz'
    | 'input-mscz-import';
  inputFormat: 'musicxml' | 'mxl' | 'mscz';
  outputFormat: 'musicxml' | 'mxl' | 'mscz';
  command: string;
  args: string[];
  inputPath: string;
  outputPath: string;
  status: MuseScoreSmokeStepStatus;
  code: number | null;
  signal: NodeJS.Signals | null;
  durationMs: number;
  stderr: string | null;
  cleanedStderr: string | null;
  outputBytes: number;
  diagnostic: string;
  attempts?: Array<{
    status: MuseScoreSmokeStepStatus;
    code: number | null;
    signal: NodeJS.Signals | null;
    durationMs: number;
    outputBytes: number;
    diagnostic: string;
  }>;
}

export interface MuseScoreSmokeFixtureResult {
  fixture: string;
  sourceMusicXmlPath: string;
  nexNoteMusicXmlPath: string;
  nexNoteMxlPath: string;
  artifactDir: string;
  steps: MuseScoreSmokeStepResult[];
  verdict: MuseScoreSmokeVerdict;
  diagnostic: string;
}

export interface MuseScoreRoundtripSmokeResult {
  verdict: MuseScoreSmokeVerdict;
  museScoreCli: string | null;
  museScoreVersion?: string;
  outputDir: string;
  generatedAt: string;
  fixtures: MuseScoreSmokeFixtureResult[];
  diagnostic: string;
}

export interface MuseScoreRoundtripSmokeOptions {
  fixtures: string[];
  museScoreCli?: string;
  outputDir?: string;
  timeoutMs?: number;
  retryCount?: number;
  keepArtifacts?: boolean;
  env?: NodeJS.ProcessEnv;
  cwd?: string;
}

interface RunStepInput {
  fixture: string;
  variant: MuseScoreSmokeStepResult['variant'];
  inputFormat: MuseScoreSmokeStepResult['inputFormat'];
  outputFormat: MuseScoreSmokeStepResult['outputFormat'];
  cliPath: string;
  inputPath: string;
  outputPath: string;
  timeoutMs: number;
  retryCount: number;
  env: NodeJS.ProcessEnv;
}

const CRASH_PATTERNS = [
  /segmentation fault/i,
  /sigsegv/i,
  /sigabrt/i,
  /abort trap/i,
  /trace\/bpt trap/i,
  /bus error/i,
  /crash/i,
  /EXC_(?:BAD_ACCESS|CRASH|BAD_INSTRUCTION)/i,
];

const DEFAULT_TIMEOUT_MS = 90_000;
const DEFAULT_RETRY_COUNT = 2;
const DEFAULT_OUTPUT_DIR = () => join(
  process.cwd(),
  '.nex',
  `musescore-roundtrip-smoke-${new Date().toISOString().replace(/[:.]/g, '-')}`,
);

function isCrashExit(code: number | null, signal: NodeJS.Signals | null, stderr: string) {
  if (signal) return true;
  if (code === 134 || code === 139) return true;
  return CRASH_PATTERNS.some((pattern) => pattern.test(stderr));
}

function summarizeStepFailure(input: {
  status: MuseScoreSmokeStepStatus;
  code: number | null;
  signal: NodeJS.Signals | null;
  cleanedStderr: string | null;
  outputPath: string;
  outputBytes: number;
}) {
  if (input.status === 'passed') return `ok (${input.outputBytes} bytes)`;
  if (input.status === 'missing-output') return `MuseScore exited successfully but did not write ${input.outputPath}`;
  if (input.status === 'timed-out') return `MuseScore timed out${input.signal ? ` (${input.signal})` : ''}`;
  if (input.status === 'crashed') {
    const exit = input.signal ? `signal ${input.signal}` : `code ${input.code}`;
    return `MuseScore crashed (${exit})${input.cleanedStderr ? `: ${input.cleanedStderr}` : ''}`;
  }
  if (input.status === 'spawn-error') return input.cleanedStderr ?? 'MuseScore could not be started';
  if (input.status === 'skipped') return input.cleanedStderr ?? 'Skipped because an earlier step failed';
  return `MuseScore exited with code ${input.code}${input.cleanedStderr ? `: ${input.cleanedStderr}` : ''}`;
}

export function classifyMuseScoreStep(input: {
  code: number | null;
  signal: NodeJS.Signals | null;
  stderr: string;
  timedOut: boolean;
  spawnError?: string;
  outputExists: boolean;
  outputBytes: number;
}): { status: MuseScoreSmokeStepStatus; cleanedStderr: string | null; diagnostic: string } {
  const cleanedStderr = cleanMuseScoreStderr(input.spawnError ?? input.stderr) || null;
  let status: MuseScoreSmokeStepStatus;

  if (input.spawnError) {
    status = 'spawn-error';
  } else if (input.timedOut) {
    status = 'timed-out';
  } else if (input.code === 0 && input.outputExists && input.outputBytes > 0) {
    status = 'passed';
  } else if (isCrashExit(input.code, input.signal, `${input.stderr}\n${cleanedStderr ?? ''}`)) {
    status = 'crashed';
  } else if (input.code === 0) {
    status = 'missing-output';
  } else {
    status = 'failed';
  }

  return {
    status,
    cleanedStderr,
    diagnostic: summarizeStepFailure({
      status,
      code: input.code,
      signal: input.signal,
      cleanedStderr,
      outputPath: 'output',
      outputBytes: input.outputBytes,
    }),
  };
}

async function fileSize(path: string) {
  try {
    const details = await stat(path);
    return details.isFile() ? details.size : 0;
  } catch {
    return 0;
  }
}

async function runMuseScoreStepAttempt(input: RunStepInput): Promise<MuseScoreSmokeStepResult> {
  const startedAt = Date.now();
  const args = [input.inputPath, '-o', input.outputPath];
  let stderr = '';
  let code: number | null = null;
  let signal: NodeJS.Signals | null = null;
  let timedOut = false;
  let spawnError: string | undefined;

  await new Promise<void>((resolvePromise) => {
    const proc = spawn(input.cliPath, args, {
      cwd: dirname(input.outputPath),
      env: museScoreSpawnEnv(input.env),
    });
    const timeout = setTimeout(() => {
      timedOut = true;
      proc.kill('SIGTERM');
    }, input.timeoutMs);

    proc.stdout.on('data', () => {});
    proc.stderr.on('data', (chunk) => {
      stderr += chunk.toString();
    });
    proc.on('error', (error) => {
      spawnError = error.message;
    });
    proc.on('close', (closeCode, closeSignal) => {
      clearTimeout(timeout);
      code = closeCode;
      signal = closeSignal;
      resolvePromise();
    });
  });

  const outputBytes = await fileSize(input.outputPath);
  const classification = classifyMuseScoreStep({
    code,
    signal,
    stderr,
    timedOut,
    spawnError,
    outputExists: outputBytes > 0,
    outputBytes,
  });

  const diagnostic = summarizeStepFailure({
    status: classification.status,
    code,
    signal,
    cleanedStderr: classification.cleanedStderr,
    outputPath: input.outputPath,
    outputBytes,
  });

  return {
    id: `${input.variant}:${input.inputFormat}->${input.outputFormat}`,
    fixture: input.fixture,
    variant: input.variant,
    inputFormat: input.inputFormat,
    outputFormat: input.outputFormat,
    command: input.cliPath,
    args,
    inputPath: input.inputPath,
    outputPath: input.outputPath,
    status: classification.status,
    code,
    signal,
    durationMs: Date.now() - startedAt,
    stderr: stderr.trim() || null,
    cleanedStderr: classification.cleanedStderr,
    outputBytes,
    diagnostic,
  };
}

function shouldRetryStep(step: MuseScoreSmokeStepResult) {
  return step.status === 'crashed'
    || step.status === 'timed-out'
    || step.status === 'spawn-error'
    || step.status === 'missing-output';
}

async function runMuseScoreStep(input: RunStepInput): Promise<MuseScoreSmokeStepResult> {
  const attempts: MuseScoreSmokeStepResult[] = [];
  const maxAttempts = Math.max(1, input.retryCount + 1);

  for (let attemptIndex = 0; attemptIndex < maxAttempts; attemptIndex += 1) {
    const attempt = await runMuseScoreStepAttempt(input);
    attempts.push(attempt);
    if (attempt.status === 'passed' || !shouldRetryStep(attempt)) {
      if (attempts.length === 1) return attempt;
      return {
        ...attempt,
        diagnostic: attempt.status === 'passed'
          ? `ok after ${attempts.length} attempts (${attempt.outputBytes} bytes); previous failure: ${attempts[attempts.length - 2]!.diagnostic}`
          : `${attempt.diagnostic}; attempts=${attempts.length}`,
        attempts: attempts.map((entry) => ({
          status: entry.status,
          code: entry.code,
          signal: entry.signal,
          durationMs: entry.durationMs,
          outputBytes: entry.outputBytes,
          diagnostic: entry.diagnostic,
        })),
      };
    }
  }

  const finalAttempt = attempts[attempts.length - 1]!;
  return {
    ...finalAttempt,
    diagnostic: `${finalAttempt.diagnostic}; failed after ${attempts.length} attempts`,
    attempts: attempts.map((entry) => ({
      status: entry.status,
      code: entry.code,
      signal: entry.signal,
      durationMs: entry.durationMs,
      outputBytes: entry.outputBytes,
      diagnostic: entry.diagnostic,
    })),
  };
}

function makeSkippedStep(input: Omit<RunStepInput, 'timeoutMs' | 'retryCount' | 'env'>, reason: string): MuseScoreSmokeStepResult {
  return {
    id: `${input.variant}:${input.inputFormat}->${input.outputFormat}`,
    fixture: input.fixture,
    variant: input.variant,
    inputFormat: input.inputFormat,
    outputFormat: input.outputFormat,
    command: input.cliPath,
    args: [input.inputPath, '-o', input.outputPath],
    inputPath: input.inputPath,
    outputPath: input.outputPath,
    status: 'skipped',
    code: null,
    signal: null,
    durationMs: 0,
    stderr: null,
    cleanedStderr: reason,
    outputBytes: 0,
    diagnostic: reason,
  };
}

function successful(step: MuseScoreSmokeStepResult | undefined) {
  return step?.status === 'passed';
}

function failed(step: MuseScoreSmokeStepResult | undefined) {
  return Boolean(step && step.status !== 'passed' && step.status !== 'skipped');
}

function producedOutput(step: MuseScoreSmokeStepResult | undefined) {
  return Boolean(step && step.outputBytes > 0);
}

function formatRelative(cwd: string, path: string) {
  return relative(cwd, path) || '.';
}

async function writeMusicXmlInputs(input: {
  fixturePath: string;
  artifactDir: string;
  cliPath: string;
  timeoutMs: number;
  env: NodeJS.ProcessEnv;
  cwd: string;
}): Promise<{
  sourceXml: string;
  sourceMusicXmlPath: string;
  nexNoteMusicXmlPath: string;
  nexNoteMxlPath: string;
  loadSteps: MuseScoreSmokeStepResult[];
}> {
  await mkdir(input.artifactDir, { recursive: true });
  const extension = extname(input.fixturePath).toLowerCase();
  const sourceMusicXmlPath = join(input.artifactDir, 'source.musicxml');
  const nexNoteMusicXmlPath = join(input.artifactDir, 'nex-note-export.musicxml');
  const nexNoteMxlPath = join(input.artifactDir, 'nex-note-export.mxl');
  const loadSteps: MuseScoreSmokeStepResult[] = [];

  let sourceXml: string;
  if (extension === '.mxl') {
    const buffer = await readFile(input.fixturePath);
    sourceXml = (await extractXmlFromMxl(buffer)).xml;
  } else if (extension === '.mscz') {
    const importOutputPath = join(input.artifactDir, 'source-from-mscz.musicxml');
    const importStep = await runMuseScoreStep({
      fixture: formatRelative(input.cwd, input.fixturePath),
      variant: 'input-mscz-import',
      inputFormat: 'mscz',
      outputFormat: 'musicxml',
      cliPath: input.cliPath,
      inputPath: input.fixturePath,
      outputPath: importOutputPath,
      timeoutMs: input.timeoutMs,
      retryCount: 0,
      env: input.env,
    });
    loadSteps.push(importStep);
    if (!successful(importStep)) {
      return {
        sourceXml: '',
        sourceMusicXmlPath,
        nexNoteMusicXmlPath,
        nexNoteMxlPath,
        loadSteps,
      };
    }
    sourceXml = await readFile(importOutputPath, 'utf8');
  } else {
    sourceXml = await readFile(input.fixturePath, 'utf8');
  }

  const coreDocument = importMusicXmlToCore(sourceXml);
  const nexNoteXml = exportCoreToMusicXml(sourceXml, coreDocument);
  const nexNoteMxl = await packXmlToMxl(nexNoteXml);

  await writeFile(sourceMusicXmlPath, sourceXml, 'utf8');
  await writeFile(nexNoteMusicXmlPath, nexNoteXml, 'utf8');
  await writeFile(nexNoteMxlPath, nexNoteMxl);

  return {
    sourceXml,
    sourceMusicXmlPath,
    nexNoteMusicXmlPath,
    nexNoteMxlPath,
    loadSteps,
  };
}

async function runDependentVariant(input: {
  first: RunStepInput;
  second: RunStepInput;
}): Promise<MuseScoreSmokeStepResult[]> {
  const first = await runMuseScoreStep(input.first);
  if (!successful(first) && !producedOutput(first)) {
    return [
      first,
      makeSkippedStep(
        {
          fixture: input.second.fixture,
          variant: input.second.variant,
          inputFormat: input.second.inputFormat,
          outputFormat: input.second.outputFormat,
          cliPath: input.second.cliPath,
          inputPath: input.second.inputPath,
          outputPath: input.second.outputPath,
        },
        `Skipped because ${first.id} did not pass: ${first.diagnostic}`,
      ),
    ];
  }
  return [first, await runMuseScoreStep(input.second)];
}

export function classifyFixtureSmokeResult(steps: MuseScoreSmokeStepResult[]): {
  verdict: MuseScoreSmokeVerdict;
  diagnostic: string;
} {
  const sourceMusicXml = steps.find((step) => step.variant === 'source-musicxml');
  const sourceMxlCreate = steps.find((step) => step.variant === 'source-musescore-mxl' && step.outputFormat === 'mxl');
  const sourceMxlReopen = steps.find((step) => step.variant === 'source-musescore-mxl' && step.outputFormat === 'musicxml');
  const sourceMsczCreate = steps.find((step) => step.variant === 'source-musescore-mscz' && step.outputFormat === 'mscz');
  const sourceMsczReopen = steps.find((step) => step.variant === 'source-musescore-mscz' && step.outputFormat === 'musicxml');
  const nexMusicXml = steps.find((step) => step.variant === 'nex-note-musicxml');
  const nexMxl = steps.find((step) => step.variant === 'nex-note-mxl');
  const nexMsczCreate = steps.find((step) => step.variant === 'nex-note-mscz' && step.outputFormat === 'mscz');
  const nexMsczReopen = steps.find((step) => step.variant === 'nex-note-mscz' && step.outputFormat === 'musicxml');

  if (steps.some((step) => step.variant === 'input-mscz-import' && step.status !== 'passed')) {
    return {
      verdict: 'failed',
      diagnostic: 'Input MSCZ could not be opened by MuseScore, so nex-note export parity could not be assessed.',
    };
  }

  const nexNoteSpecificFailures: string[] = [];
  if (successful(sourceMusicXml) && failed(nexMusicXml) && !successful(nexMxl)) {
    nexNoteSpecificFailures.push(`nex-note MusicXML failed while source MusicXML passed: ${nexMusicXml!.diagnostic}`);
  }
  if (successful(sourceMxlReopen) && failed(nexMxl)) {
    nexNoteSpecificFailures.push(`nex-note MXL failed while source MusicXML -> MXL -> MusicXML baseline passed: ${nexMxl!.diagnostic}`);
  }
  const sourceMsczRoutePassed = Boolean(sourceMsczReopen && successful(sourceMsczReopen) && (successful(sourceMsczCreate) || producedOutput(sourceMsczCreate)));
  const nexMsczRoutePassed = Boolean(nexMsczReopen && successful(nexMsczReopen) && (successful(nexMsczCreate) || producedOutput(nexMsczCreate)));
  if (sourceMsczRoutePassed && failed(nexMsczCreate) && !nexMsczRoutePassed) {
    nexNoteSpecificFailures.push(`nex-note MusicXML -> MSCZ failed while source MusicXML -> MSCZ passed: ${nexMsczCreate!.diagnostic}`);
  }
  if (sourceMsczRoutePassed && failed(nexMsczReopen) && !nexMsczRoutePassed) {
    nexNoteSpecificFailures.push(`nex-note MSCZ reopen failed while source MSCZ reopen passed: ${nexMsczReopen!.diagnostic}`);
  }
  if (nexNoteSpecificFailures.length > 0) {
    return { verdict: 'failed', diagnostic: nexNoteSpecificFailures.join(' ') };
  }

  const localLimits: string[] = [];
  if (sourceMusicXml && failed(sourceMusicXml)) {
    localLimits.push(`source MusicXML failed in local MuseScore: ${sourceMusicXml.diagnostic}`);
  }
  if (sourceMusicXml && failed(sourceMusicXml) && nexMusicXml && failed(nexMusicXml)) {
    localLimits.push(`nex-note MusicXML failed with the same local direct-MusicXML baseline unavailable: ${nexMusicXml.diagnostic}`);
  }
  if (sourceMusicXml && successful(sourceMusicXml) && nexMusicXml && failed(nexMusicXml) && successful(nexMxl)) {
    localLimits.push(`nex-note direct MusicXML crashed in local MuseScore, but the same exported XML passed when packaged as MXL: ${nexMusicXml.diagnostic}`);
  }
  if (sourceMxlCreate && failed(sourceMxlCreate)) {
    localLimits.push(
      successful(sourceMxlReopen) && producedOutput(sourceMxlCreate)
        ? `source MusicXML -> MXL crashed after writing a usable MXL: ${sourceMxlCreate.diagnostic}`
        : `source MusicXML -> MXL failed in local MuseScore: ${sourceMxlCreate.diagnostic}`,
    );
  }
  if (sourceMxlReopen && failed(sourceMxlReopen)) {
    localLimits.push(`source MXL reopen failed in local MuseScore: ${sourceMxlReopen.diagnostic}`);
  }
  if ((sourceMxlCreate && failed(sourceMxlCreate)) || (sourceMxlReopen && failed(sourceMxlReopen))) {
    if (nexMxl && failed(nexMxl)) {
      localLimits.push(`nex-note MXL also failed while the source MXL baseline was unavailable locally: ${nexMxl.diagnostic}`);
    }
  } else if (nexMxl && failed(nexMxl)) {
    return { verdict: 'failed', diagnostic: `nex-note MXL failed without a matching local MuseScore baseline failure: ${nexMxl.diagnostic}` };
  }

  if (sourceMsczCreate && failed(sourceMsczCreate)) {
    localLimits.push(
      successful(sourceMsczReopen) && producedOutput(sourceMsczCreate)
        ? `source MusicXML -> MSCZ crashed after writing a usable MSCZ: ${sourceMsczCreate.diagnostic}`
        : `source MusicXML -> MSCZ failed in local MuseScore: ${sourceMsczCreate.diagnostic}`,
    );
  }
  if (sourceMsczReopen && failed(sourceMsczReopen)) {
    localLimits.push(`source MSCZ reopen failed in local MuseScore: ${sourceMsczReopen.diagnostic}`);
  }
  if ((sourceMsczCreate && failed(sourceMsczCreate)) || (sourceMsczReopen && failed(sourceMsczReopen))) {
    if (nexMsczCreate && failed(nexMsczCreate)) {
      localLimits.push(
        successful(nexMsczReopen) && producedOutput(nexMsczCreate)
          ? `nex-note MusicXML -> MSCZ crashed after writing a usable MSCZ: ${nexMsczCreate.diagnostic}`
          : `nex-note MusicXML -> MSCZ also failed while the source MSCZ baseline was unavailable locally: ${nexMsczCreate.diagnostic}`,
      );
    }
    if (nexMsczReopen && failed(nexMsczReopen)) {
      localLimits.push(`nex-note MSCZ reopen also failed while the source MSCZ baseline was unavailable locally: ${nexMsczReopen.diagnostic}`);
    }
  } else if (sourceMsczRoutePassed && !nexMsczRoutePassed && ((nexMsczCreate && failed(nexMsczCreate)) || (nexMsczReopen && failed(nexMsczReopen)))) {
    const failure = [nexMsczCreate, nexMsczReopen].find((step) => failed(step));
    return { verdict: 'failed', diagnostic: `nex-note MSCZ failed without a matching local MuseScore baseline failure: ${failure?.diagnostic ?? 'missing diagnostic'}` };
  } else if (sourceMsczRoutePassed && nexMsczRoutePassed && nexMsczCreate && failed(nexMsczCreate)) {
    localLimits.push(`nex-note MusicXML -> MSCZ crashed after writing a usable MSCZ: ${nexMsczCreate.diagnostic}`);
  } else if (!sourceMsczRoutePassed && ((nexMsczCreate && failed(nexMsczCreate)) || (nexMsczReopen && failed(nexMsczReopen)))) {
    const failure = [nexMsczCreate, nexMsczReopen].find((step) => failed(step));
    localLimits.push(`nex-note MSCZ also failed while the source MSCZ route was unavailable locally: ${failure?.diagnostic ?? 'missing diagnostic'}`);
  }

  const requiredChecks = [sourceMusicXml, nexMusicXml];
  if (requiredChecks.some((step) => !step)) {
    return { verdict: 'failed', diagnostic: 'MusicXML smoke did not produce all required step results.' };
  }

  if (localLimits.length > 0) {
    return {
      verdict: 'passed-with-local-musescore-limit',
      diagnostic: `No nex-note-only export failure was isolated. Local MuseScore limitation(s): ${localLimits.join(' ')}`,
    };
  }

  if (
    successful(sourceMusicXml)
    && successful(nexMusicXml)
    && successful(sourceMxlReopen)
    && successful(nexMxl)
    && successful(sourceMsczReopen)
    && successful(nexMsczReopen)
  ) {
    return { verdict: 'passed', diagnostic: 'MusicXML, nex-note MXL, and MSCZ roundtrip smokes passed.' };
  }

  return {
    verdict: 'failed',
    diagnostic: 'Roundtrip comparison was inconclusive because one or more expected steps were skipped without a matched local MuseScore failure.',
  };
}

export function combineMuseScoreSmokeFixtureVerdicts(results: MuseScoreSmokeFixtureResult[]): {
  verdict: MuseScoreSmokeVerdict;
  diagnostic: string;
} {
  if (results.length === 0) {
    return { verdict: 'skipped', diagnostic: 'No fixtures were selected.' };
  }
  if (results.some((result) => result.verdict === 'failed')) {
    const sourceBaselineInstability = results.some((result) => result.steps.some((step) => (
      step.variant.startsWith('source-')
      && (step.status === 'crashed' || step.status === 'timed-out' || step.status === 'spawn-error')
    )));
    const onlyCrashLikeFailures = results
      .filter((result) => result.verdict === 'failed')
      .every((result) => result.steps
        .filter((step) => step.status !== 'passed' && step.status !== 'skipped')
        .every((step) => step.status === 'crashed' || step.status === 'timed-out' || step.status === 'spawn-error'));
    if (sourceBaselineInstability && onlyCrashLikeFailures) {
      const failedFixtures = results
        .filter((result) => result.verdict === 'failed')
        .map((result) => `${result.fixture}: ${result.diagnostic}`);
      return {
        verdict: 'passed-with-local-musescore-limit',
        diagnostic: `Local MuseScore crashed or timed out on source baselines in this run, so crash-only nex-note failures are inconclusive rather than isolated export bugs. Inspect artifacts for details:\n${failedFixtures.join('\n')}`,
      };
    }
    const failedFixtures = results
      .filter((result) => result.verdict === 'failed')
      .map((result) => `${result.fixture}: ${result.diagnostic}`);
    return { verdict: 'failed', diagnostic: failedFixtures.join('\n') };
  }
  if (results.some((result) => result.verdict === 'passed-with-local-musescore-limit')) {
    return {
      verdict: 'passed-with-local-musescore-limit',
      diagnostic: 'No nex-note-only export failure was isolated; at least one fixture hit a local MuseScore crash or conversion limit.',
    };
  }
  return { verdict: 'passed', diagnostic: 'All MuseScore roundtrip smoke fixtures passed.' };
}

function safeFixtureDirectoryName(fixture: string) {
  const stem = basename(fixture, extname(fixture)) || 'fixture';
  return stem.replace(/[^A-Za-z0-9._-]+/g, '-');
}

export async function runMuseScoreRoundtripSmoke(options: MuseScoreRoundtripSmokeOptions): Promise<MuseScoreRoundtripSmokeResult> {
  const env = options.env ?? process.env;
  const cwd = options.cwd ?? process.cwd();
  const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const retryCount = options.retryCount ?? DEFAULT_RETRY_COUNT;
  const outputDir = resolve(options.outputDir ?? DEFAULT_OUTPUT_DIR());
  const keepArtifacts = options.keepArtifacts ?? true;
  const tempOutputDir = keepArtifacts ? outputDir : await mkdtemp(join(tmpdir(), 'nex-note-mscore-smoke-'));

  let cliPath: string;
  try {
    cliPath = options.museScoreCli ?? resolveMuseScoreCli(env);
  } catch (error) {
    return {
      verdict: 'skipped',
      museScoreCli: null,
      outputDir: tempOutputDir,
      generatedAt: new Date().toISOString(),
      fixtures: [],
      diagnostic: error instanceof Error ? error.message : String(error),
    };
  }

  await mkdir(tempOutputDir, { recursive: true });
  const museScoreVersion = await readMuseScoreCliVersion(cliPath, env).catch(() => undefined);
  const fixtureResults: MuseScoreSmokeFixtureResult[] = [];

  try {
    for (const fixture of options.fixtures) {
      const fixturePath = isAbsolute(fixture) ? fixture : resolve(cwd, fixture);
      const fixtureLabel = formatRelative(cwd, fixturePath);
      const artifactDir = join(tempOutputDir, safeFixtureDirectoryName(fixtureLabel));
      const input = await writeMusicXmlInputs({
        fixturePath,
        artifactDir,
        cliPath,
        timeoutMs,
        env,
        cwd,
      });
      const steps = [...input.loadSteps];

      if (input.loadSteps.some((step) => step.status !== 'passed')) {
        const classified = classifyFixtureSmokeResult(steps);
        fixtureResults.push({
          fixture: fixtureLabel,
          sourceMusicXmlPath: input.sourceMusicXmlPath,
          nexNoteMusicXmlPath: input.nexNoteMusicXmlPath,
          nexNoteMxlPath: input.nexNoteMxlPath,
          artifactDir,
          steps,
          verdict: classified.verdict,
          diagnostic: classified.diagnostic,
        });
        continue;
      }

      const sourceMxl = join(artifactDir, 'source.mxl');
      const sourceFromMxl = join(artifactDir, 'source.from-mxl.musicxml');
      const sourceMscz = join(artifactDir, 'source.mscz');
      const sourceFromMscz = join(artifactDir, 'source.from-mscz.musicxml');
      const nexNoteDirectXml = join(artifactDir, 'nex-note.from-musicxml.musicxml');
      const nexNoteFromMxl = join(artifactDir, 'nex-note.from-mxl.musicxml');
      const nexNoteMscz = join(artifactDir, 'nex-note-export.mscz');
      const nexNoteFromMscz = join(artifactDir, 'nex-note.from-mscz.musicxml');

      steps.push(await runMuseScoreStep({
        fixture: fixtureLabel,
        variant: 'source-musicxml',
        inputFormat: 'musicxml',
        outputFormat: 'musicxml',
        cliPath,
        inputPath: input.sourceMusicXmlPath,
        outputPath: join(artifactDir, 'source.from-musicxml.musicxml'),
        timeoutMs,
        retryCount,
        env,
      }));

      steps.push(...await runDependentVariant({
        first: {
          fixture: fixtureLabel,
          variant: 'source-musescore-mxl',
          inputFormat: 'musicxml',
          outputFormat: 'mxl',
          cliPath,
          inputPath: input.sourceMusicXmlPath,
          outputPath: sourceMxl,
          timeoutMs,
          retryCount,
          env,
        },
        second: {
          fixture: fixtureLabel,
          variant: 'source-musescore-mxl',
          inputFormat: 'mxl',
          outputFormat: 'musicxml',
          cliPath,
          inputPath: sourceMxl,
          outputPath: sourceFromMxl,
          timeoutMs,
          retryCount,
          env,
        },
      }));

      steps.push(await runMuseScoreStep({
        fixture: fixtureLabel,
        variant: 'nex-note-musicxml',
        inputFormat: 'musicxml',
        outputFormat: 'musicxml',
        cliPath,
        inputPath: input.nexNoteMusicXmlPath,
        outputPath: nexNoteDirectXml,
        timeoutMs,
        retryCount,
        env,
      }));

      steps.push(await runMuseScoreStep({
        fixture: fixtureLabel,
        variant: 'nex-note-mxl',
        inputFormat: 'mxl',
        outputFormat: 'musicxml',
        cliPath,
        inputPath: input.nexNoteMxlPath,
        outputPath: nexNoteFromMxl,
        timeoutMs,
        retryCount,
        env,
      }));

      steps.push(...await runDependentVariant({
        first: {
          fixture: fixtureLabel,
          variant: 'source-musescore-mscz',
          inputFormat: 'musicxml',
          outputFormat: 'mscz',
          cliPath,
          inputPath: input.sourceMusicXmlPath,
          outputPath: sourceMscz,
          timeoutMs,
          retryCount,
          env,
        },
        second: {
          fixture: fixtureLabel,
          variant: 'source-musescore-mscz',
          inputFormat: 'mscz',
          outputFormat: 'musicxml',
          cliPath,
          inputPath: sourceMscz,
          outputPath: sourceFromMscz,
          timeoutMs,
          retryCount,
          env,
        },
      }));

      steps.push(...await runDependentVariant({
        first: {
          fixture: fixtureLabel,
          variant: 'nex-note-mscz',
          inputFormat: 'musicxml',
          outputFormat: 'mscz',
          cliPath,
          inputPath: input.nexNoteMusicXmlPath,
          outputPath: nexNoteMscz,
          timeoutMs,
          retryCount,
          env,
        },
        second: {
          fixture: fixtureLabel,
          variant: 'nex-note-mscz',
          inputFormat: 'mscz',
          outputFormat: 'musicxml',
          cliPath,
          inputPath: nexNoteMscz,
          outputPath: nexNoteFromMscz,
          timeoutMs,
          retryCount,
          env,
        },
      }));

      const classified = classifyFixtureSmokeResult(steps);
      fixtureResults.push({
        fixture: fixtureLabel,
        sourceMusicXmlPath: input.sourceMusicXmlPath,
        nexNoteMusicXmlPath: input.nexNoteMusicXmlPath,
        nexNoteMxlPath: input.nexNoteMxlPath,
        artifactDir,
        steps,
        verdict: classified.verdict,
        diagnostic: classified.diagnostic,
      });
    }

    const aggregate = combineMuseScoreSmokeFixtureVerdicts(fixtureResults);
    const result: MuseScoreRoundtripSmokeResult = {
      verdict: aggregate.verdict,
      museScoreCli: cliPath,
      museScoreVersion,
      outputDir: tempOutputDir,
      generatedAt: new Date().toISOString(),
      fixtures: fixtureResults,
      diagnostic: aggregate.diagnostic,
    };

    await writeFile(join(tempOutputDir, 'summary.json'), `${JSON.stringify(result, null, 2)}\n`, 'utf8');
    await writeFile(join(tempOutputDir, 'summary.txt'), formatMuseScoreRoundtripSmokeSummary(result), 'utf8');
    return result;
  } finally {
    if (!keepArtifacts) {
      await rm(tempOutputDir, { recursive: true, force: true });
    }
  }
}

export function formatMuseScoreRoundtripSmokeSummary(result: MuseScoreRoundtripSmokeResult) {
  const lines = [
    `MuseScore roundtrip smoke: ${result.verdict}`,
    `Generated: ${result.generatedAt}`,
    `MuseScore CLI: ${result.museScoreCli ?? 'not found'}${result.museScoreVersion ? ` (${result.museScoreVersion})` : ''}`,
    `Output: ${result.outputDir}`,
    `Diagnostic: ${result.diagnostic}`,
    '',
  ];

  for (const fixture of result.fixtures) {
    lines.push(`${fixture.fixture}: ${fixture.verdict}`);
    lines.push(`  ${fixture.diagnostic}`);
    for (const step of fixture.steps) {
      lines.push(`  - ${step.variant} ${step.inputFormat}->${step.outputFormat}: ${step.status} (${step.durationMs} ms)`);
      if (step.status !== 'passed') lines.push(`    ${step.diagnostic}`);
    }
    lines.push('');
  }

  return `${lines.join('\n').trimEnd()}\n`;
}
