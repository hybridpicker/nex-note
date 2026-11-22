import { NextRequest, NextResponse } from 'next/server';
import { spawn } from 'child_process';
import { writeFile, readFile, unlink, mkdir } from 'fs/promises';
import { tmpdir } from 'os';
import { join } from 'path';
import { musicXmlToAbc } from '@/lib/abc-export';
import { museScoreSpawnEnv, resolveMuseScoreCli } from '@/lib/musescore-cli';

export async function POST(req: NextRequest) {
  const { xml, filename } = await req.json() as { xml: string; filename?: string };
  if (!xml) return NextResponse.json({ error: 'No XML provided' }, { status: 400 });

  const tmpDir = join(tmpdir(), `nex-note-abc-${Date.now()}`);
  await mkdir(tmpDir, { recursive: true });
  const inputPath = join(tmpDir, 'input.xml');
  const outputAbc = join(tmpDir, 'output.abc');

  try {
    await writeFile(inputPath, xml, 'utf-8');
    let museScoreError = '';
    // MuseScore is asked first and Nex Note's own exporter answers when it fails. A hanging command
    // line used to hold the export for 60 s, and the spawn timeout alone does not end the wait when
    // the program leaves a child behind (F43 in docs/note-entry-mastery-ledger.md).
    const cliTimeoutMs = Math.max(500, Number(process.env.NEX_ABC_CLI_TIMEOUT_MS) || 10_000);
    const museScoreCli = (() => {
      try {
        return resolveMuseScoreCli();
      } catch (err) {
        // No MuseScore on this machine: Nex Note's own exporter answers below.
        museScoreError = err instanceof Error ? err.message : String(err);
        return null;
      }
    })();
    if (museScoreCli) await new Promise<void>((resolve) => {
      let settled = false;
      const finish = () => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        resolve();
      };
      const proc = spawn(museScoreCli, [inputPath, '-o', outputAbc], {
        env: museScoreSpawnEnv(),
        cwd: tmpDir,
      });
      const timer = setTimeout(() => {
        museScoreError = `MuseScore did not answer within ${cliTimeoutMs} ms`;
        proc.kill('SIGKILL');
        finish();
      }, cliTimeoutMs);
      let stderr = '';
      proc.stderr.on('data', (d: Buffer) => { stderr += d.toString(); });
      proc.on('error', (err: Error) => {
        museScoreError = err.message;
        finish();
      });
      proc.on('close', (code: number | null) => {
        if (code !== 0 && !settled) museScoreError = `MuseScore ABC export failed (exit ${code}): ${stderr}`;
        finish();
      });
    });
    let abc = '';
    try {
      abc = await readFile(outputAbc, 'utf-8');
    } catch {
      abc = '';
    }
    if (!abc.trim()) {
      abc = musicXmlToAbc(xml, filename);
      if (!abc.trim()) {
        throw new Error(museScoreError || 'ABC export failed');
      }
    }
    const baseName = (filename ?? 'score').replace(/\.(mxl|xml|mscz|pdf|gp[456x]?)$/i, '');

    return new NextResponse(abc, {
      headers: {
        'Content-Type': 'text/plain; charset=utf-8',
        'Content-Disposition': `attachment; filename="${baseName}.abc"`,
      },
    });
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  } finally {
    await unlink(inputPath).catch(() => {});
    await unlink(outputAbc).catch(() => {});
  }
}
