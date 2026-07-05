import { NextRequest, NextResponse } from 'next/server';
import { spawn } from 'child_process';
import { writeFile, readFile, unlink, mkdir } from 'fs/promises';
import { tmpdir } from 'os';
import { join } from 'path';
import { dbg } from '@/lib/debug';
import {
  buildFallbackMidiFromMusicXml,
  cleanMuseScoreStderr,
  formatMuseScoreMidiExportError,
  sanitizeXmlForMidiExport,
} from '@/lib/midi-export';
import { museScoreSpawnEnv, resolveMuseScoreCli } from '@/lib/musescore-cli';

const MUSESCORE_EXPORT_TIMEOUT_MS = Number.parseInt(process.env.MUSESCORE_MIDI_EXPORT_TIMEOUT_MS ?? '', 10) || 30000;

function midiResponse(data: Buffer, renderer: 'musescore' | 'internal-fallback') {
  const body = new Uint8Array(data.byteLength);
  body.set(data);
  return new NextResponse(body.buffer, {
    headers: {
      'Content-Type': 'audio/midi',
      'Content-Length': String(data.length),
      'X-Nex-Note-Midi-Renderer': renderer,
    },
  });
}

function runMuseScoreMidiExport(input: {
  musescoreCli: string;
  inputPath: string;
  outputMid: string;
  tmpDir: string;
}) {
  return new Promise<void>((resolve, reject) => {
    const exportStartedAt = Date.now();
    const proc = spawn(input.musescoreCli, [input.inputPath, '-o', input.outputMid, '-f'], {
      timeout: MUSESCORE_EXPORT_TIMEOUT_MS,
      env: museScoreSpawnEnv(),
      cwd: input.tmpDir,
    });
    let stderr = '';
    proc.stderr.on('data', (d: Buffer) => { stderr += d.toString(); });
    proc.on('error', reject);
    proc.on('close', (code: number | null, signal: NodeJS.Signals | null) => {
      if (code !== 0) {
        reject(new Error(formatMuseScoreMidiExportError({
          code,
          signal,
          stderr,
          timeoutMs: MUSESCORE_EXPORT_TIMEOUT_MS,
        })));
      } else {
        dbg.midi(`MuseScore export OK exit=${code} durationMs=${Date.now() - exportStartedAt}`);
        const cleanedStderr = cleanMuseScoreStderr(stderr);
        if (cleanedStderr) dbg.midi(`MuseScore export stderr: ${cleanedStderr}`);
        resolve();
      }
    });
  });
}

export async function POST(req: NextRequest) {
  const { xml } = await req.json() as { xml: string };
  if (!xml) return NextResponse.json({ error: 'No XML provided' }, { status: 400 });

  const tmpDir = join(/* turbopackIgnore: true */ tmpdir(), `nex-note-midi-${Date.now()}`);
  await mkdir(tmpDir, { recursive: true });
  const inputPath = join(/* turbopackIgnore: true */ tmpDir, 'input.xml');
  const outputMid = join(/* turbopackIgnore: true */ tmpDir, 'output.mid');
  const startedAt = Date.now();

  try {
    const sanitized = sanitizeXmlForMidiExport(xml);
    dbg.midi(`export request xmlBytes=${Buffer.byteLength(xml, 'utf8')} sanitizedXmlBytes=${Buffer.byteLength(sanitized.xml, 'utf8')} tmpDir=${tmpDir}`);
    if (sanitized.renamedParts.length > 0 || sanitized.renamedInstruments.length > 0) {
      dbg.midi(`sanitized playback instruments parts=${JSON.stringify(sanitized.renamedParts)} instruments=${JSON.stringify(sanitized.renamedInstruments)}`);
    }
    if (sanitized.removedMalformedTieStarts > 0) {
      dbg.midi(`removed malformed tie starts count=${sanitized.removedMalformedTieStarts}`);
    }
    const metadataSummary = sanitized.strippedPlaybackMetadata;
    const metadataRemoved = Object.values(metadataSummary).some((count) => count > 0);
    if (metadataRemoved) {
      dbg.midi(`removed playback metadata ${JSON.stringify(metadataSummary)}`);
    }
    await writeFile(inputPath, sanitized.xml, 'utf-8');

    try {
      const musescoreCli = resolveMuseScoreCli();
      await runMuseScoreMidiExport({ musescoreCli, inputPath, outputMid, tmpDir });
      const midiData = await readFile(outputMid);
      dbg.midi(`response midiBytes=${midiData.length} renderer=musescore totalMs=${Date.now() - startedAt}`);
      return midiResponse(midiData, 'musescore');
    } catch (museScoreErr) {
      dbg.warn('midi', 'MuseScore MIDI export failed; using internal fallback renderer:', museScoreErr);
      const fallback = buildFallbackMidiFromMusicXml(sanitized.xml);
      dbg.midi(`response midiBytes=${fallback.data.length} renderer=internal-fallback tracks=${fallback.trackCount} notes=${fallback.noteCount} totalMs=${Date.now() - startedAt}`);
      return midiResponse(fallback.data, 'internal-fallback');
    }
  } catch (err) {
    dbg.error('midi', `export failed after ${Date.now() - startedAt}ms`, err);
    return NextResponse.json({ error: String(err) }, { status: 500 });
  } finally {
    await unlink(inputPath).catch(() => {});
    await unlink(outputMid).catch(() => {});
  }
}
