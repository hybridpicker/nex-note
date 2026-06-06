import { NextRequest, NextResponse } from 'next/server';
import { spawn } from 'child_process';
import { writeFile, readFile, unlink, mkdir } from 'fs/promises';
import { tmpdir } from 'os';
import { join } from 'path';
import { dbg } from '@/lib/debug';
import { cleanMuseScoreStderr, formatMuseScoreMidiExportError, sanitizeXmlForMidiExport } from '@/lib/midi-export';
import { museScoreSpawnEnv, resolveMuseScoreCli } from '@/lib/musescore-cli';

const MUSESCORE_EXPORT_TIMEOUT_MS = 180000;

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
    const musescoreCli = resolveMuseScoreCli();

    await new Promise<void>((resolve, reject) => {
      const exportStartedAt = Date.now();
      const proc = spawn(musescoreCli, [inputPath, '-o', outputMid, '-f'], {
        timeout: MUSESCORE_EXPORT_TIMEOUT_MS,
        env: museScoreSpawnEnv(),
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

    const midiData = await readFile(outputMid);
    dbg.midi(`response midiBytes=${midiData.length} totalMs=${Date.now() - startedAt}`);

    return new NextResponse(midiData, {
      headers: {
        'Content-Type': 'audio/midi',
        'Content-Length': String(midiData.length),
      },
    });
  } catch (err) {
    dbg.error('midi', `export failed after ${Date.now() - startedAt}ms`, err);
    return NextResponse.json({ error: String(err) }, { status: 500 });
  } finally {
    await unlink(inputPath).catch(() => {});
    await unlink(outputMid).catch(() => {});
  }
}
