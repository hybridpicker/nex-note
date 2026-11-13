#!/usr/bin/env node

import { createRequire } from 'node:module';
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';

const require = createRequire(import.meta.url);
const { describeBuildState, getLocalBuildState } = require('../electron/build-state.cjs');
const root = process.cwd();
const buildInfoPath = path.join(
  root,
  'dist',
  'macos',
  'mac-arm64',
  'Nex Note.app',
  'Contents',
  'Resources',
  'app',
  '.next',
  'standalone',
  'nex-note-build.json',
);

function fail(message) {
  console.error(`Electron package verification failed: ${message}`);
  process.exit(1);
}

let buildInfo;
try {
  buildInfo = JSON.parse(readFileSync(buildInfoPath, 'utf8'));
} catch (error) {
  fail(`could not read ${buildInfoPath}: ${error instanceof Error ? error.message : String(error)}`);
}

const localBuildState = getLocalBuildState(root);
if (localBuildState.gitBranch !== 'devel') {
  fail(`local app verification requires devel (current branch: ${localBuildState.gitBranch || 'detached HEAD'})`);
}
if (!buildInfo?.sourceFingerprint) fail('the packaged build has no local source fingerprint');
if (buildInfo.sourceFingerprint !== localBuildState.sourceFingerprint) {
  fail(
    `bundle fingerprint ${buildInfo.sourceFingerprint} does not match local source `
    + localBuildState.sourceFingerprint,
  );
}

// Offline playback samples are optional in git but belong in the app: without them every first
// Play of an instrument downloads it from GitHub (about 1.5 s before the first note).
const packagedSoundfonts = path.join(path.dirname(buildInfoPath), 'public', 'soundfonts', 'FluidR3_GM');
const packagedSoundfontCount = existsSync(packagedSoundfonts)
  ? readdirSync(packagedSoundfonts).filter((name) => name.endsWith('-mp3.js')).length
  : 0;
if (packagedSoundfontCount === 0) {
  console.warn('Warning: the packaged app has no offline playback samples; run `npm run soundfonts:fetch` before building.');
}

console.log(`Verified packaged Nex Note app from ${describeBuildState(localBuildState)}.`);
