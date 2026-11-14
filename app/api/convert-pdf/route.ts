import { NextRequest, NextResponse } from 'next/server';
import { spawn } from 'child_process';
import { PDFDocument } from 'pdf-lib';
import { writeFile, readFile, unlink, mkdir, rm, readdir } from 'fs/promises';
import { tmpdir } from 'os';
import { basename, delimiter, dirname, extname, join } from 'path';
import { extractXmlFromMxl } from '@/lib/mxl-utils';
import { classifyScoreImport, describeUnsupportedScoreImport } from '@/lib/score-import-formats';
import { describeOmrFailure, inspectPdfForImport } from '@/lib/pdf-import-preflight';
import { describeSkippedPdfPages, parseInvalidAudiverisSheets } from '@/lib/omr-partial-export';
import {
  buildScoreImageBatchBaseName,
  isPdfEmbeddableScoreImageFilename,
  isScoreImageFilename,
  sortScoreImagePages,
} from '@/lib/score-image-pages';
import { analyzeMidiBuffer } from '@/src/nex-note/midi/analyze-midi';
import { applyMidiImportLayout } from '@/src/nex-note/midi/apply-midi-import-layout';
import { convertGuitarProBufferToTabbedMusicXml } from '@/lib/alphatab-guitar-pro-import';
import { formatMuseScoreConversionError, museScoreSpawnEnv, readMuseScoreCliVersion, resolveMuseScoreCli } from '@/lib/musescore-cli';
import {
  formatMsczVersionMismatchError,
  inspectMsczArchive,
  type MsczArchiveInfo,
  shouldRejectMsczForCliVersion,
} from '@/lib/mscz-utils';
import {
  GUITAR_PRO_IMPORT_FIDELITY_PROMPT,
  collectGuitarProTechniqueFallbackWarnings,
  ensureGuitarProTabStaves,
  musicXmlHasTabStaff,
  normalizeConvertedMusicXml,
  stripTabParts,
} from '@/lib/guitar-pro-import-contract';

const PDF_TO_MUSESCORE_SCRIPT = process.env.PDF_TO_MUSESCORE_SCRIPT
  || `${process.env.HOME}/Coding/musescore/scripts/pdf-to-musescore.sh`;
const AUDIVERIS_JAVA = process.env.AUDIVERIS_JAVA
  || '/Applications/Audiveris.app/Contents/runtime/Contents/Home/bin/java';
const AUDIVERIS_APP_DIR = process.env.AUDIVERIS_APP_DIR
  || '/Applications/Audiveris.app/Contents/app';
const AUDIVERIS_TESSERACT_CONSTANT = 'org.audiveris.omr.text.tesseract.TesseractOCR.TESSDATA_PREFIX';
const MAX_IMAGE_BATCH_PAGES = 64;
// Audiveris rasterizes PDF input at roughly 300 DPI; this keeps source pixels 1:1.
const PDF_POINTS_PER_IMAGE_PIXEL = 72 / 300;

let museScoreVersionCache: Promise<string | undefined> | undefined;

function isUploadedFile(value: unknown): value is File {
  return Boolean(value)
    && typeof value === 'object'
    && typeof (value as File).name === 'string'
    && typeof (value as File).arrayBuffer === 'function';
}

function parseOptionalTextField(value: FormDataEntryValue | null) {
  return typeof value === 'string' ? value.trim() : '';
}

export async function POST(req: NextRequest) {
  const formData = await req.formData();
  const fileValue = formData.get('file');
  const file = isUploadedFile(fileValue) ? fileValue : null;
  const imagePageFiles = formData.getAll('files').filter(isUploadedFile);
  const batchName = parseOptionalTextField(formData.get('batchName'));
  const uploadFiles = imagePageFiles.length > 0 ? imagePageFiles : (file ? [file] : []);

  if (uploadFiles.length === 0) return NextResponse.json({ error: 'No file uploaded' }, { status: 400 });
  if (uploadFiles.length > 1) {
    return convertImagePageBatch(uploadFiles, batchName);
  }

  const [singleFile] = uploadFiles;
  if (!singleFile) return NextResponse.json({ error: 'No file uploaded' }, { status: 400 });
  const lower = singleFile.name.toLowerCase();
  const origExt = lower.split('.').pop() ?? 'tmp';
  const kind = classifyScoreImport(lower);
  // A .nxn project is read in the app itself and never reaches the converters.
  const fmt = kind === 'nxn' ? 'unsupported' : kind;

  if (fmt === 'unsupported') {
    return NextResponse.json({ error: describeUnsupportedScoreImport(singleFile.name) }, { status: 415 });
  }
  const tmpDir = join(tmpdir(), `nex-note-${Date.now()}`);
  await mkdir(tmpDir, { recursive: true });
  const inputExt = fmt === 'gp' || fmt === 'midi' || fmt === 'image' || fmt === 'musescore-cli' ? origExt : fmt;
  const inputPath = join(tmpDir, `input.${inputExt}`);
  const outputMxl = join(tmpDir, 'output.mxl');

  try {
    const buffer = Buffer.from(await singleFile.arrayBuffer());
    await writeFile(inputPath, buffer);

    if (fmt === 'mxl') {
      // Already MXL — extract XML directly
      const { xml: rawXml } = await extractXmlFromMxl(buffer);
      return NextResponse.json({ xml: stripTabParts(rawXml), filename: singleFile.name });
    }

    if (fmt === 'xml') {
      return NextResponse.json({ xml: stripTabParts(buffer.toString('utf-8')), filename: singleFile.name });
    }

    if (fmt === 'mscz') {
      // MuseScore file — convert to MXL via MuseScore CLI
      const archive = await inspectMsczArchive(buffer).catch(() => undefined);
      await assertMsczSupportedByServerMuseScore(archive);
      const xml = await runMscoreToMxl(inputPath, outputMxl, { archive });
      return NextResponse.json({ xml, filename: singleFile.name.replace(/\.mscz$/i, '.mxl') });
    }

    if (fmt === 'musescore-cli') {
      // Formats MuseScore reads itself: uncompressed MuseScore, Capella, Power Tab, MEI, Overture …
      const xml = await runMscoreToMxl(inputPath, outputMxl);
      return NextResponse.json({ xml, filename: singleFile.name.replace(/\.[^.]+$/, '.mxl') });
    }

    if (fmt === 'gp') {
      // Guitar Pro import keeps MuseScore output when it contains TAB data.
      // Some .gp files lose every string/fret marker in MuseScore; in that case
      // alphaTab reads the source file directly and writes a TAB-preserving XML.
      let xml: string;
      let source: 'musescore' | 'alphatab-fallback' = 'musescore';
      try {
        xml = ensureGuitarProTabStaves(await runMscoreToMxl(inputPath, outputMxl, { preserveTabs: true }));
        if (!musicXmlHasTabStaff(xml)) {
          xml = await convertGuitarProBufferToTabbedMusicXml(buffer);
          source = 'alphatab-fallback';
        }
      } catch (err) {
        xml = await convertGuitarProBufferToTabbedMusicXml(buffer);
        source = 'alphatab-fallback';
        console.warn('MuseScore Guitar Pro conversion failed; used alphaTab fallback instead.', err);
      }
      return NextResponse.json({
        xml,
        filename: singleFile.name.replace(/\.[^.]+$/, '.mxl'),
        importContract: {
          prompt: GUITAR_PRO_IMPORT_FIDELITY_PROMPT,
          preservedTabs: musicXmlHasTabStaff(xml),
          source,
          warnings: collectGuitarProTechniqueFallbackWarnings(xml),
        },
      });
    }

    if (fmt === 'midi') {
      // MIDI has no native notation layout, so MuseScore does the quantization
      // and spelling pass before Nex Note imports the resulting MusicXML.
      const analysis = analyzeMidiBuffer(buffer);
      const xml = await runMscoreToMxl(inputPath, outputMxl);
      const layout = applyMidiImportLayout(xml, analysis);
      return NextResponse.json({
        xml: layout.xml,
        filename: singleFile.name.replace(/\.[^.]+$/, '.mxl'),
        midiAnalysis: analysis,
        midiLayout: {
          profile: layout.profile,
          systemBreakCount: layout.systemBreaks.length,
          pageBreakCount: layout.pageBreaks.length,
          staffSpacingCount: layout.staffSpacingMeasures.length,
        },
      });
    }

    if (fmt === 'pdf') {
      const { xml, pageCount, warnings } = await convertPdf(buffer, inputPath, tmpDir, outputMxl);
      return NextResponse.json({
        xml,
        filename: singleFile.name.replace(/\.[^.]+$/i, '.mxl'),
        pageCount,
        ...(warnings.length > 0 ? { warnings } : {}),
      });
    }

    // Image OMR: run the configured Audiveris conversion script.
    const xml = await runOmrConversion(inputPath, tmpDir, outputMxl);
    return NextResponse.json({ xml, filename: singleFile.name.replace(/\.[^.]+$/i, '.mxl') });
  } catch (err) {
    const message = fmt === 'image' ? describeOmrFailure(err) : err instanceof Error ? err.message : String(err);
    console.warn('Score import conversion failed', {
      filename: singleFile.name,
      format: fmt,
      size: singleFile.size,
      message,
    });
    return NextResponse.json({ error: message }, { status: 500 });
  } finally {
    // Cleanup temp files
    await unlink(inputPath).catch(() => {});
    await unlink(outputMxl).catch(() => {});
    await rm(tmpDir, { recursive: true, force: true }).catch(() => {});
  }
}

async function convertImagePageBatch(files: File[], requestedBatchName: string) {
  if (files.length > MAX_IMAGE_BATCH_PAGES) {
    return NextResponse.json({
      error: `Multi-image score imports support up to ${MAX_IMAGE_BATCH_PAGES} pages at a time.`,
    }, { status: 413 });
  }

  const nonImage = files.find((file) => !isScoreImageFilename(file.name));
  if (nonImage) {
    return NextResponse.json({
      error: `Multi-file score import only supports image pages. ${nonImage.name} is not an image import.`,
    }, { status: 415 });
  }

  const unsupported = files.find((file) => !isPdfEmbeddableScoreImageFilename(file.name));
  if (unsupported) {
    return NextResponse.json({
      error: `Multi-image score import currently supports PNG and JPEG pages. Convert ${unsupported.name} to PNG/JPEG or import it by itself.`,
    }, { status: 415 });
  }

  const sortedFiles = sortScoreImagePages(files);
  const batchBaseName = sanitizeOutputBaseName(requestedBatchName) || buildScoreImageBatchBaseName(sortedFiles);
  const tmpDir = join(tmpdir(), `nex-note-${Date.now()}`);
  const inputPath = join(tmpDir, 'image-pages.pdf');
  const outputMxl = join(tmpDir, 'output.mxl');

  await mkdir(tmpDir, { recursive: true });
  try {
    await writeImagePagesPdf(sortedFiles, inputPath);
    const { xml, skippedSheets } = await runOmrAllSheets(inputPath, tmpDir, outputMxl);
    const skipped = describeSkippedPdfPages(skippedSheets, sortedFiles.length);
    return NextResponse.json({
      xml,
      filename: `${batchBaseName}.mxl`,
      ...(skipped ? { warnings: [skipped] } : {}),
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.warn('Multi-image score import conversion failed', {
      filename: batchBaseName,
      pageCount: sortedFiles.length,
      size: sortedFiles.reduce((sum, file) => sum + file.size, 0),
      message,
    });
    return NextResponse.json({ error: message }, { status: 500 });
  } finally {
    await unlink(inputPath).catch(() => {});
    await unlink(outputMxl).catch(() => {});
    await rm(tmpDir, { recursive: true, force: true }).catch(() => {});
  }
}

function sanitizeOutputBaseName(name: string) {
  return name
    .replace(/[\\/:*?"<>|]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

async function writeImagePagesPdf(files: File[], outputPath: string) {
  const pdf = await PDFDocument.create();
  for (const file of files) {
    const bytes = Buffer.from(await file.arrayBuffer());
    const image = /\.png$/i.test(file.name)
      ? await pdf.embedPng(bytes)
      : await pdf.embedJpg(bytes);
    const width = image.width * PDF_POINTS_PER_IMAGE_PIXEL;
    const height = image.height * PDF_POINTS_PER_IMAGE_PIXEL;
    const page = pdf.addPage([width, height]);
    page.drawImage(image, {
      x: 0,
      y: 0,
      width,
      height,
    });
  }

  await writeFile(outputPath, await pdf.save());
}

async function getServerMuseScoreVersion() {
  if (!museScoreVersionCache) {
    museScoreVersionCache = readMuseScoreCliVersion(resolveMuseScoreCli());
  }
  return museScoreVersionCache;
}

async function assertMsczSupportedByServerMuseScore(archive: MsczArchiveInfo | undefined) {
  const cliVersion = await getServerMuseScoreVersion();
  if (cliVersion && shouldRejectMsczForCliVersion(archive, cliVersion)) {
    throw new Error(formatMsczVersionMismatchError({ archive: archive!, cliVersion }));
  }
}

function runMscoreToMxl(inputPath: string, outputMxl: string, options: { preserveTabs?: boolean; archive?: MsczArchiveInfo } = {}): Promise<string> {
  return new Promise((resolve, reject) => {
    const timeoutMs = 60000;
    const proc = spawn(resolveMuseScoreCli(), [inputPath, '-o', outputMxl], {
      timeout: timeoutMs,
      env: museScoreSpawnEnv(),
      cwd: dirname(outputMxl),
    });

    let stderr = '';
    proc.stderr.on('data', (d) => { stderr += d.toString(); });
    proc.on('error', reject);

    proc.on('close', async (code, signal) => {
      if (code !== 0) {
        const cliVersion = await getServerMuseScoreVersion().catch(() => undefined);
        if (cliVersion && shouldRejectMsczForCliVersion(options.archive, cliVersion)) {
          reject(new Error(formatMsczVersionMismatchError({ archive: options.archive!, cliVersion })));
          return;
        }
        reject(new Error(formatMuseScoreConversionError({ code, signal, stderr, timeoutMs })));
        return;
      }
      try {
        const mxlBuffer = await readFile(outputMxl);
        const { xml } = await extractXmlFromMxl(mxlBuffer);
        resolve(normalizeConvertedMusicXml(xml, options));
      } catch (err) {
        reject(new Error(`Could not read MuseScore output: ${err}`));
      }
    });
  });
}

/**
 * A PDF is read page by page. Encrypted or empty files are refused with a reason up front. Every
 * page goes through Audiveris; when that direct run is not possible on this machine, the configured
 * script still converts the first page and the answer says so.
 */
async function convertPdf(buffer: Buffer, inputPath: string, outDir: string, outputMxl: string) {
  const preflight = await inspectPdfForImport(buffer);
  if (!preflight.ok) throw new Error(preflight.message);
  const warnings: string[] = [];

  if (preflight.pageCount > 1) {
    try {
      const { xml, skippedSheets } = await runOmrAllSheets(inputPath, outDir, outputMxl);
      const skipped = describeSkippedPdfPages(skippedSheets, preflight.pageCount);
      if (skipped) warnings.push(skipped);
      return { xml, pageCount: preflight.pageCount, warnings };
    } catch (error) {
      console.warn('Audiveris could not read every page; falling back to the first page.', error);
      warnings.push(`Only page 1 of ${preflight.pageCount} was imported: ${describeOmrFailure(error)}`);
    }
  }

  try {
    const xml = await runOmrConversion(inputPath, outDir, outputMxl);
    return { xml, pageCount: preflight.pageCount, warnings };
  } catch (error) {
    throw new Error(describeOmrFailure(error));
  }
}

async function runOmrConversion(
  inputPath: string,
  outDir: string,
  outputMxl: string,
  options: { allSheets?: boolean } = {},
): Promise<string> {
  if (options.allSheets) {
    return (await runOmrAllSheets(inputPath, outDir, outputMxl)).xml;
  }

  return new Promise((resolve, reject) => {
    const proc = spawn('bash', [PDF_TO_MUSESCORE_SCRIPT, inputPath, outDir], {
      timeout: 120000,
      cwd: outDir,
    });

    let stderr = '';
    proc.stderr.on('data', (d) => { stderr += d.toString(); });
    proc.on('error', reject);

    proc.on('close', async (code) => {
      if (code !== 0) {
        reject(new Error(`pdf-to-musescore.sh failed (exit ${code}): ${stderr}`));
        return;
      }
      try {
        const mxlBuffer = await readOmrOutputMxl(outDir, inputPath, outputMxl);
        const { xml } = await extractXmlFromMxl(mxlBuffer);
        resolve(xml);
      } catch (err) {
        reject(new Error(`Could not read output MXL: ${err}`));
      }
    });
  });
}

/**
 * Reads every page. Audiveris rejects the whole book when one page has no staves (a title page);
 * the pages it did read are kept in its book file, so those are exported and the rest is reported.
 */
async function runOmrAllSheets(
  inputPath: string,
  outDir: string,
  outputMxl: string,
): Promise<{ xml: string; skippedSheets: number[] }> {
  let output: string;
  try {
    output = await runAudiverisAllSheets(inputPath, outDir);
  } catch (error) {
    const skippedSheets = parseInvalidAudiverisSheets(processOutputOf(error));
    if (skippedSheets.length === 0) throw error;
    try {
      await exportAudiverisBook(inputPath, outDir);
      const { xml } = await extractXmlFromMxl(await readOmrOutputMxl(outDir, inputPath, outputMxl));
      return { xml, skippedSheets };
    } catch (exportError) {
      console.warn('Audiveris could not export the readable pages.', exportError);
      throw error;
    }
  }
  const { xml } = await extractXmlFromMxl(await readOmrOutputMxl(outDir, inputPath, outputMxl));
  return { xml, skippedSheets: parseInvalidAudiverisSheets(output) };
}

async function resolveAudiverisJavaArgs() {
  const [classpath, tesseractPrefix] = await Promise.all([
    resolveAudiverisClasspath(),
    resolveTesseractPrefix(),
  ]);
  return { classpath, tesseractPrefix };
}

async function exportAudiverisBook(inputPath: string, outDir: string) {
  const bookPath = join(outDir, `${basename(inputPath, extname(inputPath))}.omr`);
  const { classpath, tesseractPrefix } = await resolveAudiverisJavaArgs();
  await runProcess(AUDIVERIS_JAVA, [
    '-cp',
    classpath,
    `-Djna.library.path=${join(tesseractPrefix, 'lib')}`,
    'Audiveris',
    '-batch',
    '-export',
    '-output',
    outDir,
    '--',
    bookPath,
  ], {
    cwd: outDir,
    timeoutMs: 120000,
    errorPrefix: 'Audiveris export of the readable pages failed',
  });
}

async function runAudiverisAllSheets(inputPath: string, outDir: string) {
  const timeoutMs = 300000;
  const { classpath, tesseractPrefix } = await resolveAudiverisJavaArgs();
  const tesseractData = process.env.AUDIVERIS_TESSDATA_PREFIX
    || process.env.TESSDATA_PREFIX
    || join(tesseractPrefix, 'share', 'tessdata');

  return runProcess(AUDIVERIS_JAVA, [
    '-cp',
    classpath,
    `-Djna.library.path=${join(tesseractPrefix, 'lib')}`,
    'Audiveris',
    '-batch',
    '-transcribe',
    '-export',
    '-constant',
    `${AUDIVERIS_TESSERACT_CONSTANT}=${tesseractData}`,
    '-output',
    outDir,
    '--',
    inputPath,
  ], {
    cwd: outDir,
    timeoutMs,
    errorPrefix: 'Audiveris multi-page OMR failed',
  });
}

async function resolveAudiverisClasspath() {
  const entries = await readdir(AUDIVERIS_APP_DIR);
  const jars = entries
    .filter((name) => name.toLowerCase().endsWith('.jar'))
    .sort()
    .map((name) => join(AUDIVERIS_APP_DIR, name));

  if (jars.length === 0) {
    throw new Error(`No Audiveris jars were found in ${AUDIVERIS_APP_DIR}`);
  }
  return jars.join(delimiter);
}

async function resolveTesseractPrefix() {
  const configured = process.env.AUDIVERIS_TESSERACT_PREFIX
    || process.env.TESSERACT_PREFIX;
  if (configured) return configured;

  for (const brew of ['brew', '/opt/homebrew/bin/brew', '/usr/local/bin/brew']) {
    try {
      return await readCommandStdout(brew, ['--prefix', 'tesseract']);
    } catch {
      // Try the next common Homebrew location.
    }
  }

  throw new Error('Could not resolve Tesseract for Audiveris. Set AUDIVERIS_TESSERACT_PREFIX or install Homebrew tesseract.');
}

function readCommandStdout(command: string, args: string[]) {
  return new Promise<string>((resolve, reject) => {
    const proc = spawn(command, args, { timeout: 10000 });
    let stdout = '';
    let stderr = '';
    proc.stdout.on('data', (data) => { stdout += data.toString(); });
    proc.stderr.on('data', (data) => { stderr += data.toString(); });
    proc.on('error', reject);
    proc.on('close', (code, signal) => {
      if (code !== 0) {
        reject(new Error(`${command} ${args.join(' ')} failed (exit ${code}, signal ${signal ?? 'none'}): ${stderr}`));
        return;
      }
      resolve(stdout.trim());
    });
  });
}

/** Full console output a failed `runProcess` call carried, or the error text. */
function processOutputOf(error: unknown) {
  if (error && typeof error === 'object' && typeof (error as { processOutput?: unknown }).processOutput === 'string') {
    return (error as { processOutput: string }).processOutput;
  }
  return error instanceof Error ? error.message : String(error);
}

/** Runs a command and resolves with its full stdout and stderr. */
function runProcess(
  command: string,
  args: string[],
  options: { cwd: string; timeoutMs: number; errorPrefix: string },
) {
  return new Promise<string>((resolve, reject) => {
    const proc = spawn(command, args, {
      timeout: options.timeoutMs,
      cwd: options.cwd,
    });

    let stdout = '';
    let stderr = '';
    proc.stdout.on('data', (data) => { stdout += data.toString(); });
    proc.stderr.on('data', (data) => { stderr += data.toString(); });
    proc.on('error', reject);
    proc.on('close', (code, signal) => {
      if (code !== 0) {
        const error = new Error(`${options.errorPrefix} (exit ${code}, signal ${signal ?? 'none'}): ${formatProcessOutput(stdout, stderr)}`);
        reject(Object.assign(error, { processOutput: `${stdout}\n${stderr}` }));
        return;
      }
      resolve(`${stdout}\n${stderr}`);
    });
  });
}

function formatProcessOutput(stdout: string, stderr: string) {
  const combined = [stdout.trim(), stderr.trim()].filter(Boolean).join('\n');
  return combined.slice(-5000);
}

async function readOmrOutputMxl(outDir: string, inputPath: string, outputMxl: string) {
  const defaultOutput = join(outDir, `${basename(inputPath, extname(inputPath))}.mxl`);
  for (const candidate of [outputMxl, defaultOutput]) {
    try {
      return await readFile(candidate);
    } catch {
      // Try the next known output name before falling back to scanning.
    }
  }

  const exported = (await readdir(outDir))
    .filter((name) => name.toLowerCase().endsWith('.mxl'))
    .sort();
  if (exported.length === 0) {
    throw new Error('No .mxl file was produced by the OMR converter');
  }
  return readFile(join(outDir, exported[0]));
}
