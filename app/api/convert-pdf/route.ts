import { NextRequest, NextResponse } from 'next/server';
import { spawn } from 'child_process';
import { writeFile, readFile, unlink, mkdir, rm, readdir } from 'fs/promises';
import { tmpdir } from 'os';
import { basename, dirname, extname, join } from 'path';
import { extractXmlFromMxl } from '@/lib/mxl-utils';
import { analyzeMidiBuffer } from '@/src/nex-note/midi/analyze-midi';
import { applyMidiImportLayout } from '@/src/nex-note/midi/apply-midi-import-layout';
import { convertGuitarProBufferToTabbedMusicXml } from '@/lib/alphatab-guitar-pro-import';
import { formatMuseScoreConversionError, museScoreSpawnEnv, resolveMuseScoreCli } from '@/lib/musescore-cli';
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

export async function POST(req: NextRequest) {
  const formData = await req.formData();
  const file = formData.get('file') as File | null;

  if (!file) return NextResponse.json({ error: 'No file uploaded' }, { status: 400 });

  const lower = file.name.toLowerCase();
  const origExt = lower.split('.').pop() ?? 'tmp';
  const fmt = lower.endsWith('.mxl') ? 'mxl'
    : /\.(xml|musicxml)$/.test(lower) ? 'xml'
    : lower.endsWith('.mscz') ? 'mscz'
    : /\.(mid|midi)$/.test(lower) ? 'midi'
    : /\.(gp[456x]?)$/.test(lower) ? 'gp'
    : lower.endsWith('.pdf') ? 'pdf'
    : /\.(png|jpe?g|tiff?|webp|bmp|heic|heif)$/.test(lower) ? 'image'
    : 'unsupported';

  if (fmt === 'unsupported') {
    return NextResponse.json({ error: `Unsupported import format for ${file.name}` }, { status: 415 });
  }
  const tmpDir = join(tmpdir(), `nex-note-${Date.now()}`);
  await mkdir(tmpDir, { recursive: true });
  const inputExt = fmt === 'gp' || fmt === 'midi' || fmt === 'image' ? origExt : fmt;
  const inputPath = join(tmpDir, `input.${inputExt}`);
  const outputMxl = join(tmpDir, 'output.mxl');

  try {
    const buffer = Buffer.from(await file.arrayBuffer());
    await writeFile(inputPath, buffer);

    if (fmt === 'mxl') {
      // Already MXL — extract XML directly
      const { xml: rawXml } = await extractXmlFromMxl(buffer);
      return NextResponse.json({ xml: stripTabParts(rawXml), filename: file.name });
    }

    if (fmt === 'xml') {
      return NextResponse.json({ xml: stripTabParts(buffer.toString('utf-8')), filename: file.name });
    }

    if (fmt === 'mscz') {
      // MuseScore file — convert to MXL via MuseScore CLI
      const xml = await runMscoreToMxl(inputPath, outputMxl);
      return NextResponse.json({ xml, filename: file.name.replace(/\.mscz$/i, '.mxl') });
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
        filename: file.name.replace(/\.[^.]+$/, '.mxl'),
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
        filename: file.name.replace(/\.[^.]+$/, '.mxl'),
        midiAnalysis: analysis,
        midiLayout: {
          profile: layout.profile,
          systemBreakCount: layout.systemBreaks.length,
          pageBreakCount: layout.pageBreaks.length,
          staffSpacingCount: layout.staffSpacingMeasures.length,
        },
      });
    }

    // PDF/image OMR: run the configured Audiveris conversion script.
    const xml = await runOmrConversion(inputPath, tmpDir, outputMxl);
    return NextResponse.json({ xml, filename: file.name.replace(/\.[^.]+$/i, '.mxl') });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.warn('Score import conversion failed', {
      filename: file.name,
      format: fmt,
      size: file.size,
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

function runMscoreToMxl(inputPath: string, outputMxl: string, options: { preserveTabs?: boolean } = {}): Promise<string> {
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

function runOmrConversion(inputPath: string, outDir: string, outputMxl: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const proc = spawn('bash', [PDF_TO_MUSESCORE_SCRIPT, inputPath, outDir], {
      timeout: 120000,
      cwd: outDir,
    });

    let stderr = '';
    proc.stderr.on('data', (d) => { stderr += d.toString(); });

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
