import { spawn } from 'node:child_process';
import { createWriteStream, existsSync } from 'node:fs';
import { chmod, mkdir, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';
import { NextRequest, NextResponse } from 'next/server';
import { buildCodexArgs, buildTerminalScript } from '@/lib/codex-handoff-route';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const MAX_PROMPT_LENGTH = 350_000;

function isLocalHost(hostHeader: string | null) {
  if (!hostHeader) return false;
  const host = hostHeader.startsWith('[')
    ? hostHeader.slice(1, hostHeader.indexOf(']')).toLowerCase()
    : hostHeader.split(':')[0]?.toLowerCase();
  return host === 'localhost' || host === '127.0.0.1' || host === '::1';
}

function resolveCodexCommand() {
  if (process.env.CODEX_CLI_PATH) return process.env.CODEX_CLI_PATH;
  const candidates = [
    '/opt/homebrew/bin/codex',
    '/usr/local/bin/codex',
  ];
  return candidates.find((candidate) => existsSync(candidate)) ?? 'codex';
}

function safeId(input: string) {
  return input.replace(/[^a-zA-Z0-9._-]/g, '-').slice(0, 120);
}

export async function POST(req: NextRequest) {
  const bridgeEnabled = process.env.NEX_NOTE_ENABLE_CODEX_BRIDGE === 'true';
  if (!bridgeEnabled && process.env.NODE_ENV === 'production') {
    return NextResponse.json({ ok: false, error: 'Codex bridge is disabled in production.' }, { status: 403 });
  }
  if (!bridgeEnabled && !isLocalHost(req.headers.get('host'))) {
    return NextResponse.json({ ok: false, error: 'Codex bridge only accepts localhost requests.' }, { status: 403 });
  }

  try {
    const body = await req.json() as {
      prompt?: unknown;
      report?: unknown;
      signature?: unknown;
      openTerminal?: unknown;
    };
    const prompt = typeof body.prompt === 'string' ? body.prompt : '';
    if (!prompt.trim()) {
      return NextResponse.json({ ok: false, error: 'prompt required' }, { status: 400 });
    }
    if (prompt.length > MAX_PROMPT_LENGTH) {
      return NextResponse.json({ ok: false, error: 'prompt too large' }, { status: 413 });
    }

    const now = new Date().toISOString();
    const hash = crypto.createHash('sha256')
      .update(typeof body.signature === 'string' ? body.signature : prompt)
      .digest('hex')
      .slice(0, 12);
    const handoffId = safeId(`${now.replace(/[:.]/g, '-')}-${hash}`);
    const dir = path.join(process.cwd(), '.nex', 'codex-handoffs', handoffId);
    await mkdir(dir, { recursive: true });

    const promptPath = path.join(dir, 'prompt.md');
    const reportPath = path.join(dir, 'doctor-report.json');
    const logPath = path.join(dir, 'codex.log');
    const errorLogPath = path.join(dir, 'codex.err.log');
    const outputPath = path.join(dir, 'codex-final.md');
    const metadataPath = path.join(dir, 'metadata.json');
    const scriptPath = path.join(dir, 'run-codex.command');

    await writeFile(promptPath, prompt, 'utf8');
    await writeFile(reportPath, JSON.stringify(body.report ?? null, null, 2), 'utf8');
    await writeFile(metadataPath, JSON.stringify({
      id: handoffId,
      createdAt: now,
      cwd: process.cwd(),
      promptPath,
      reportPath,
      logPath,
      errorLogPath,
      outputPath,
      scriptPath,
      signature: typeof body.signature === 'string' ? body.signature : null,
    }, null, 2), 'utf8');

    const codexCommand = resolveCodexCommand();
    const terminalScript = buildTerminalScript({
      handoffId,
      codexCommand,
      cwd: process.cwd(),
      promptPath,
      logPath,
      errorLogPath,
      outputPath,
    });
    await writeFile(scriptPath, terminalScript, 'utf8');
    await chmod(scriptPath, 0o755);

    if (body.openTerminal !== false && os.platform() === 'darwin') {
      const terminal = spawn('open', ['-a', 'Terminal', scriptPath], {
        cwd: process.cwd(),
        detached: true,
        stdio: 'ignore',
      });
      terminal.unref();

      return NextResponse.json({
        ok: true,
        mode: 'terminal',
        id: handoffId,
        pid: terminal.pid,
        command: 'open',
        args: ['-a', 'Terminal', scriptPath],
        promptPath,
        reportPath,
        logPath,
        errorLogPath,
        outputPath,
        scriptPath,
      });
    }

    const stdout = createWriteStream(logPath, { flags: 'a' });
    const stderr = createWriteStream(errorLogPath, { flags: 'a' });
    const args = buildCodexArgs({
      cwd: process.cwd(),
      outputPath,
    });
    const child = spawn(codexCommand, args, {
      cwd: process.cwd(),
      detached: true,
      stdio: ['pipe', 'pipe', 'pipe'],
      env: process.env,
    });

    child.stdout.pipe(stdout);
    child.stderr.pipe(stderr);
    child.stdin.end(prompt);
    child.unref();

    return NextResponse.json({
      ok: true,
      id: handoffId,
      pid: child.pid,
      command: codexCommand,
      args,
      promptPath,
      reportPath,
      logPath,
      errorLogPath,
      outputPath,
      scriptPath,
    });
  } catch (err) {
    return NextResponse.json({ ok: false, error: String(err) }, { status: 500 });
  }
}
