#!/usr/bin/env node

import { cpSync, existsSync, mkdirSync, rmSync, writeFileSync } from 'fs';
import { execFileSync } from 'child_process';
import { createRequire } from 'module';
import { join } from 'path';

const require = createRequire(import.meta.url);
const { describeBuildState, getLocalBuildState } = require('../electron/build-state.cjs');
const root = process.cwd();
const standaloneDir = join(root, '.next', 'standalone');
const staticSource = join(root, '.next', 'static');
const staticTargetRoot = join(standaloneDir, '.next');
const staticTarget = join(staticTargetRoot, 'static');
const publicSource = join(root, 'public');
const publicTarget = join(standaloneDir, 'public');

if (!existsSync(standaloneDir)) {
  console.warn('Standalone build directory not found; skipping asset sync.');
  process.exit(0);
}

mkdirSync(staticTargetRoot, { recursive: true });
if (existsSync(staticTarget)) rmSync(staticTarget, { recursive: true, force: true });
cpSync(staticSource, staticTarget, { recursive: true });

if (existsSync(publicSource)) {
  if (existsSync(publicTarget)) rmSync(publicTarget, { recursive: true, force: true });
  cpSync(publicSource, publicTarget, { recursive: true });
}

function git(args) {
  try {
    return execFileSync('git', args, {
      cwd: root,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
    }).trim();
  } catch {
    return null;
  }
}

// Releases are stamped by the release pipeline (scripts/ship-release.mjs); every other build is the
// Developer App, which records its checkout so a Linux install outside the repo can still find it.
const channel = process.env.NEX_NOTE_RELEASE_CHANNEL === 'release' ? 'release' : 'developer';
const localBuildState = getLocalBuildState(root);
const buildInfo = {
  app: 'nex-note',
  channel,
  buildTime: new Date().toISOString(),
  ...localBuildState,
  ...(channel === 'developer'
    ? { originDevelCommit: git(['rev-parse', 'origin/devel']), sourceRepo: root }
    : {}),
};

writeFileSync(
  join(standaloneDir, 'nex-note-build.json'),
  `${JSON.stringify(buildInfo, null, 2)}\n`,
);

console.log('Synced Next standalone static and public assets.');
console.log(`Stamped standalone build from ${describeBuildState(localBuildState)}.`);
