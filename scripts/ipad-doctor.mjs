#!/usr/bin/env node

import { spawnSync } from 'node:child_process';
import { existsSync, readFileSync, statfsSync } from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import {
  buildIpadAppUrl,
  buildIpadServerOrigin,
  IPAD_LOCAL_SIGNING_PATH,
  parseLocalSigningTeam,
  probeNexNoteServer,
  resolveIpadPort,
  resolveLanAddress,
} from './ipad-dev-helpers.mjs';

const root = process.cwd();
let failed = false;

function result(label, ok, detail) {
  console.log(`${ok ? '✓' : '✗'} ${label}: ${detail}`);
  if (!ok) failed = true;
}

function commandOutput(command, args) {
  return spawnSync(command, args, {
    cwd: root,
    encoding: 'utf8',
    stdio: 'pipe',
  });
}

function resolveXcodeDeveloperDir() {
  const candidates = [
    process.env.DEVELOPER_DIR,
    '/Applications/Xcode.app/Contents/Developer',
  ].filter(Boolean);

  for (const developerDir of candidates) {
    const xcodebuildPath = path.join(developerDir, 'usr', 'bin', 'xcodebuild');
    if (existsSync(xcodebuildPath)) return developerDir;
  }
  return null;
}

async function main() {
  console.log('Nex Note iPad development doctor');
  console.log('');

  const projectExists = existsSync(path.join(root, 'ios', 'App', 'App.xcodeproj'));
  result('Native iOS project', projectExists, projectExists ? 'ready' : 'run `npm run ipad:init`');

  const xcodeDeveloperDir = resolveXcodeDeveloperDir();
  const xcode = xcodeDeveloperDir
    ? commandOutput(path.join(xcodeDeveloperDir, 'usr', 'bin', 'xcodebuild'), ['-version'])
    : { status: 1, stdout: '' };
  result(
    'Full Xcode',
    xcode.status === 0,
    xcode.status === 0
      ? xcode.stdout.trim().replace(/\n/g, ', ')
      : 'not active; install Xcode and select its developer directory',
  );

  const selectedDeveloperDir = commandOutput('xcode-select', ['-p']);
  if (xcodeDeveloperDir && selectedDeveloperDir.stdout.trim() !== xcodeDeveloperDir) {
    console.log(`○ Active developer directory: ${selectedDeveloperDir.stdout.trim()} (workflow will use ${xcodeDeveloperDir})`);
  }

  const signingPath = path.join(root, IPAD_LOCAL_SIGNING_PATH);
  if (existsSync(signingPath) && parseLocalSigningTeam(readFileSync(signingPath, 'utf8'))) {
    result('Long-lived signing team', true, `configured in ${IPAD_LOCAL_SIGNING_PATH}`);
  } else {
    console.log(`○ Long-lived signing team: not configured in ${IPAD_LOCAL_SIGNING_PATH} (a free personal team expires after 7 days)`);
  }

  const disk = statfsSync(root);
  const freeGiB = disk.bavail * disk.bsize / 1024 ** 3;
  const diskComfortable = freeGiB >= (xcode.status === 0 ? 10 : 30);
  result(
    'Free disk space',
    diskComfortable,
    `${freeGiB.toFixed(1)} GiB available${diskComfortable ? '' : '; make more room before installing Xcode/iPadOS support'}`,
  );

  let origin;
  try {
    const host = resolveLanAddress();
    origin = buildIpadServerOrigin(host, resolveIpadPort());
    result('LAN address', true, origin);
  } catch (error) {
    result('LAN address', false, error instanceof Error ? error.message : String(error));
  }

  const packages = commandOutput('npm', [
    'ls',
    '@capacitor/core',
    '@capacitor/ios',
    '@capacitor/cli',
    '--depth=0',
    '--json',
  ]);
  result('Capacitor packages', packages.status === 0, packages.status === 0 ? 'installed' : 'run `npm install`');

  if (origin) {
    if (await probeNexNoteServer(origin)) {
      result('Live development server', true, `${buildIpadAppUrl(origin)} is Nex Note`);
    } else {
      console.log('○ Live development server: not running (expected until `npm run ipad:dev`)');
    }
  }

  console.log('');
  if (failed) {
    console.log('Doctor found required setup work.');
    process.exitCode = 1;
  } else {
    console.log('The Mac is ready for iPad live development.');
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
