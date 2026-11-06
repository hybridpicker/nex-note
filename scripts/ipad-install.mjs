#!/usr/bin/env node

import { spawnSync } from 'node:child_process';
import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import process from 'node:process';
import {
  earliestDate,
  IPAD_LOCAL_SIGNING_PATH,
  parseLocalSigningTeam,
  parseProvisioningProfile,
  selectConnectedIpad,
} from './ipad-dev-helpers.mjs';

const root = process.cwd();
const bundleId = 'app.nexnote.ipad';
const buildRoot = path.join(root, 'ios', 'App', 'build');
const appPath = path.join(buildRoot, 'Build', 'Products', 'Release-iphoneos', 'App.app');
const developerDir = [
  process.env.DEVELOPER_DIR,
  '/Applications/Xcode.app/Contents/Developer',
].filter(Boolean).find((candidate) => existsSync(path.join(candidate, 'usr', 'bin', 'xcodebuild')));
const toolEnv = { ...process.env, ...(developerDir ? { DEVELOPER_DIR: developerDir } : {}) };

function run(command, args, options = {}) {
  const outcome = spawnSync(command, args, {
    cwd: root,
    env: toolEnv,
    encoding: 'utf8',
    stdio: options.capture ? 'pipe' : 'inherit',
  });
  if (outcome.error) throw outcome.error;
  if (outcome.status !== 0) {
    throw new Error(`${command} ${args[0] ?? ''} failed with exit code ${outcome.status}.`);
  }
  return outcome.stdout;
}

function findConnectedIpad() {
  const tempDir = mkdtempSync(path.join(os.tmpdir(), 'nex-note-ipad-'));
  const jsonPath = path.join(tempDir, 'devices.json');
  try {
    run('xcrun', ['devicectl', 'list', 'devices', '--quiet', '--json-output', jsonPath], {
      capture: true,
    });
    return selectConnectedIpad(
      JSON.parse(readFileSync(jsonPath, 'utf8')),
      process.env.NEX_NOTE_IPAD_DEVICE,
    );
  } finally {
    rmSync(tempDir, { recursive: true, force: true });
  }
}

function readSigningCertificateExpiration() {
  const tempDir = mkdtempSync(path.join(os.tmpdir(), 'nex-note-ipad-'));
  const prefix = path.join(tempDir, 'cert');
  try {
    run('codesign', ['-d', `--extract-certificates=${prefix}`, appPath], { capture: true });
    const output = run(
      'openssl',
      ['x509', '-inform', 'DER', '-in', `${prefix}0`, '-noout', '-enddate'],
      { capture: true },
    );
    return new Date(output.trim().replace(/^notAfter=/, ''));
  } finally {
    rmSync(tempDir, { recursive: true, force: true });
  }
}

function main() {
  const skipSync = process.argv.includes('--skip-sync');
  const signingPath = path.join(root, IPAD_LOCAL_SIGNING_PATH);
  const team = existsSync(signingPath)
    ? parseLocalSigningTeam(readFileSync(signingPath, 'utf8'))
    : null;
  if (!team) {
    throw new Error(
      `${IPAD_LOCAL_SIGNING_PATH} must set DEVELOPMENT_TEAM to the paid Apple Developer team. `
      + 'See docs/ipad-private-testing.md.',
    );
  }

  const device = findConnectedIpad();
  console.log(`Installing Nex Note on ${device.name}.`);

  if (!skipSync) run(process.execPath, ['scripts/ipad-dev.mjs', '--sync-only']);

  run('xcodebuild', [
    '-project', 'ios/App/App.xcodeproj',
    '-scheme', 'App',
    '-configuration', 'Release',
    '-destination', `id=${device.udid}`,
    '-derivedDataPath', buildRoot,
    '-allowProvisioningUpdates',
    '-allowProvisioningDeviceRegistration',
    '-quiet',
    'build',
  ]);

  const profile = parseProvisioningProfile(run(
    'security',
    ['cms', '-D', '-i', path.join(appPath, 'embedded.mobileprovision')],
    { capture: true },
  ));
  if (profile.isShortLived) {
    throw new Error(
      `Refusing to install: the build used a ${profile.lifetimeDays}-day profile from a free `
      + `personal team. Check DEVELOPMENT_TEAM in ${IPAD_LOCAL_SIGNING_PATH}.`,
    );
  }

  run('xcrun', ['devicectl', 'device', 'install', 'app', '--device', device.identifier, appPath]);
  run('xcrun', ['devicectl', 'device', 'process', 'launch', '--device', device.identifier, bundleId]);

  console.log('');
  const validUntil = earliestDate(profile.expiration, readSigningCertificateExpiration());
  console.log(`Nex Note is installed and valid until ${validUntil.toISOString().slice(0, 10)}.`);
}

try {
  main();
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
}
