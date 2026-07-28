#!/usr/bin/env node

import { spawn, spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import {
  buildIpadAppUrl,
  buildIpadServerOrigin,
  probeNexNoteServer,
  resolveIpadPort,
  resolveLanAddress,
} from './ipad-dev-helpers.mjs';

const root = process.cwd();
const capBin = path.join(root, 'node_modules', '.bin', 'cap');
const nextBin = path.join(root, 'node_modules', '.bin', 'next');
const syncOnly = process.argv.includes('--sync-only');
const noOpen = process.argv.includes('--no-open');

function run(command, args, options = {}) {
  const result = spawnSync(command, args, {
    cwd: root,
    encoding: 'utf8',
    stdio: options.capture ? 'pipe' : 'inherit',
    env: options.env ?? process.env,
  });
  return result;
}

function ensureSuccess(result, label) {
  if (result.status === 0) return;
  const detail = result.stderr?.trim() || result.stdout?.trim();
  throw new Error(`${label} failed${detail ? `: ${detail}` : '.'}`);
}

async function waitForServer(origin, child) {
  const deadline = Date.now() + 120_000;
  while (Date.now() < deadline) {
    if (child.exitCode !== null) {
      throw new Error(`The Next.js development server exited with code ${child.exitCode}.`);
    }
    if (await probeNexNoteServer(origin)) return;
    await new Promise((resolve) => setTimeout(resolve, 500));
  }
  throw new Error(`Timed out waiting for ${buildIpadAppUrl(origin)}.`);
}

function hasFullXcode() {
  return Boolean(resolveXcodeDeveloperDir());
}

function resolveXcodeDeveloperDir() {
  const candidates = [
    process.env.DEVELOPER_DIR,
    '/Applications/Xcode.app/Contents/Developer',
  ].filter(Boolean);

  for (const developerDir of candidates) {
    const xcodebuild = path.join(developerDir, 'usr', 'bin', 'xcodebuild');
    if (!existsSync(xcodebuild)) continue;
    const result = run(xcodebuild, ['-version'], { capture: true });
    if (result.status === 0) return developerDir;
  }
  return null;
}

async function main() {
  if (!existsSync(capBin) || !existsSync(nextBin)) {
    throw new Error('Dependencies are missing. Run `npm install` first.');
  }
  if (!existsSync(path.join(root, 'ios', 'App', 'App.xcodeproj'))) {
    throw new Error('The iOS project is missing. Run `npm run ipad:init` first.');
  }

  const host = resolveLanAddress();
  const port = resolveIpadPort();
  const origin = buildIpadServerOrigin(host, port);
  const appUrl = buildIpadAppUrl(origin);
  const xcodeDeveloperDir = resolveXcodeDeveloperDir();
  const liveReloadEnv = {
    ...process.env,
    NEX_NOTE_IPAD_SERVER_URL: origin,
    ...(xcodeDeveloperDir ? { DEVELOPER_DIR: xcodeDeveloperDir } : {}),
  };

  console.log(`Preparing the native iPad app for ${appUrl}`);
  ensureSuccess(run(capBin, ['sync', 'ios'], { env: liveReloadEnv }), 'Capacitor sync');
  ensureSuccess(
    run(process.execPath, [path.join(root, 'scripts', 'configure-ipad-project.mjs')]),
    'iPad project configuration',
  );

  if (syncOnly) {
    console.log('Native project sync complete.');
    return;
  }

  if (!hasFullXcode()) {
    throw new Error(
      'Full Xcode was not found. Install Xcode in /Applications, open it once, then retry.',
    );
  }

  let server = null;
  if (!(await probeNexNoteServer(origin))) {
    server = spawn(
      nextBin,
      ['dev', '--webpack', '--hostname', '0.0.0.0', '--port', String(port)],
      {
        cwd: root,
        env: {
          ...process.env,
          NEX_NOTE_ALLOWED_DEV_ORIGIN: host,
        },
        stdio: 'inherit',
      },
    );
    await waitForServer(origin, server);
  } else {
    console.log(`Reusing the development server already reachable at ${appUrl}`);
  }

  console.log('');
  console.log('Nex Note iPad live mode is ready.');
  console.log(`iPad URL: ${appUrl}`);
  console.log('Keep this terminal open. Saved code changes will appear through Next.js Fast Refresh.');

  if (!noOpen) {
    ensureSuccess(run(capBin, ['open', 'ios'], { env: liveReloadEnv }), 'Opening Xcode');
  }

  const stop = () => {
    if (server && server.exitCode === null) server.kill('SIGTERM');
    process.exit(0);
  };
  process.on('SIGINT', stop);
  process.on('SIGTERM', stop);

  if (server) {
    await new Promise((resolve) => server.once('exit', resolve));
  } else {
    await new Promise(() => {});
  }
}

main().catch((error) => {
  console.error(`iPad development setup failed: ${error instanceof Error ? error.message : String(error)}`);
  process.exitCode = 1;
});
