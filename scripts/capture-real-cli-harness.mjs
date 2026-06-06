#!/usr/bin/env node

import { spawn } from 'node:child_process';
import { mkdir, mkdtemp, readFile, rm, stat, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

const DEFAULT_FIXTURES = [
  'e2e/fixtures/simple.musicxml',
  'test/fixtures/choir-lyrics.musicxml',
  'test/fixtures/piano-semantics.musicxml',
  'test/fixtures/leadsheet-repeat.musicxml',
];

const DEFAULT_OPERATIONS = [
  { name: 'midi', extension: 'mid' },
  { name: 'abc', extension: 'abc' },
];

const MUSESCORE_CLI = process.env.MUSESCORE_CLI
  || '/Applications/MuseScore 4.app/Contents/MacOS/mscore';

function parseArgs(argv = process.argv.slice(2)) {
  const fixtureArg = argv.find((arg) => arg.startsWith('--fixtures='));
  const outArg = argv.find((arg) => arg.startsWith('--out='));
  const fixtures = fixtureArg
    ? fixtureArg.slice('--fixtures='.length).split(',').map((entry) => entry.trim()).filter(Boolean)
    : DEFAULT_FIXTURES;
  const out = outArg?.slice('--out='.length) || `.nex/harness-real-cli-events-${new Date().toISOString().slice(0, 10)}.jsonl`;
  return { fixtures, out };
}

function createEventBase(loopId, fixturePath, operation) {
  return {
    loopId,
    file: fixturePath,
    cliSpawned: true,
    operation,
  };
}

async function runMuseScoreExport({ fixturePath, operation, extension, sequence }) {
  const absoluteFixturePath = path.join(process.cwd(), fixturePath);
  const fixtureBuffer = await readFile(absoluteFixturePath);
  const tempDir = await mkdtemp(path.join(tmpdir(), `nex-note-harness-${operation}-`));
  const outputPath = path.join(tempDir, `${path.basename(fixturePath, path.extname(fixturePath))}.${extension}`);
  const loopId = `${operation}-${sequence}`;
  const startedAt = new Date();
  const eventBase = createEventBase(loopId, fixturePath, operation);

  const spawnedEvent = {
    type: 'file_processed',
    timestamp: startedAt.toISOString(),
    ...eventBase,
    fixtureBytes: fixtureBuffer.length,
    command: MUSESCORE_CLI,
    args: [absoluteFixturePath, '-o', outputPath],
  };

  let stderr = '';
  let exitCode = -1;
  let stopReason = 'cli-error';
  let outputBytes = 0;

  try {
    await new Promise((resolve, reject) => {
      const proc = spawn(MUSESCORE_CLI, [absoluteFixturePath, '-o', outputPath], { timeout: 60_000 });
      proc.stderr.on('data', (chunk) => {
        stderr += chunk.toString();
      });
      proc.on('error', reject);
      proc.on('close', (code) => {
        exitCode = code ?? -1;
        if (code === 0) {
          stopReason = 'completed';
          resolve();
          return;
        }
        reject(new Error(`MuseScore CLI exited with ${code}: ${stderr}`));
      });
    });

    const details = await stat(outputPath);
    outputBytes = details.size;
  } catch (error) {
    stopReason = 'cli-error';
    stderr ||= String(error);
  }

  const completedAt = new Date();
  const completedEvent = {
    type: 'loop_completed',
    timestamp: completedAt.toISOString(),
    ...eventBase,
    stopReason,
    passCount: stopReason === 'completed' ? 1 : 0,
    durationMs: completedAt.valueOf() - startedAt.valueOf(),
    exitCode,
    outputBytes,
    stderr: stderr || null,
  };

  await rm(tempDir, { recursive: true, force: true });

  return {
    events: [spawnedEvent, completedEvent],
    ok: stopReason === 'completed',
  };
}

async function main(argv = process.argv.slice(2)) {
  const { fixtures, out } = parseArgs(argv);
  await mkdir(path.dirname(path.join(process.cwd(), out)), { recursive: true });

  const allEvents = [];
  let sequence = 1;
  let failureCount = 0;

  for (const fixturePath of fixtures) {
    for (const operation of DEFAULT_OPERATIONS) {
      const result = await runMuseScoreExport({
        fixturePath,
        operation: operation.name,
        extension: operation.extension,
        sequence,
      });
      allEvents.push(...result.events);
      if (!result.ok) failureCount += 1;
      sequence += 1;
    }
  }

  const outputPath = path.join(process.cwd(), out);
  const jsonl = `${allEvents.map((event) => JSON.stringify(event)).join('\n')}\n`;
  await writeFile(outputPath, jsonl, 'utf8');

  process.stdout.write(`Wrote ${allEvents.length} events to ${outputPath}\n`);
  process.stdout.write(`Loops: ${sequence - 1}, failures: ${failureCount}\n`);

  if (failureCount > 0) {
    process.exitCode = 1;
  }
}

main().catch((error) => {
  process.stderr.write(`${error instanceof Error ? error.stack ?? error.message : String(error)}\n`);
  process.exitCode = 1;
});
