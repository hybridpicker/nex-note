#!/usr/bin/env node

import { execFileSync, spawnSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';

const require = createRequire(import.meta.url);
const { describeBuildState, getLocalBuildState } = require('../electron/build-state.cjs');
const root = process.cwd();
const appBundle = path.join(root, 'dist', 'macos', 'mac-arm64', 'Nex Note.app');
const packageJsonPath = path.join(root, 'package.json');
const args = new Set(process.argv.slice(2));
const shouldLaunch = !args.has('--no-launch');
const skipTests = args.has('--skip-tests');
const startedByPackagedApp = process.env.NEX_NOTE_STARTUP_LOCAL_REFRESH === '1';

function run(command, commandArgs, options = {}) {
  console.log(`$ ${[command, ...commandArgs].join(' ')}`);
  execFileSync(command, commandArgs, {
    cwd: root,
    stdio: 'inherit',
    ...options,
  });
}

function fail(message) {
  console.error(`Local app refresh failed: ${message}`);
  process.exit(1);
}

function findPackagedAppPids() {
  if (process.platform !== 'darwin') return [];
  const executable = path.join(appBundle, 'Contents', 'MacOS', 'Nex Note');
  const result = spawnSync('ps', ['-axo', 'pid=,command='], { encoding: 'utf8' });
  if (result.status !== 0) return [];

  return result.stdout
    .split('\n')
    .map((line) => line.trim().match(/^(\d+)\s+(.+)$/))
    .filter((match) => match?.[2] === executable)
    .map((match) => Number(match[1]));
}

function quitPackagedMacApp() {
  if (process.platform !== 'darwin' || startedByPackagedApp) return;

  spawnSync('osascript', ['-e', `tell application "${appBundle}" to quit`], {
    stdio: 'ignore',
  });

  const startedAt = Date.now();
  while (Date.now() - startedAt < 10000) {
    const pids = findPackagedAppPids();
    if (pids.length === 0) return;
    if (Date.now() - startedAt >= 2000) {
      for (const pid of pids) {
        try {
          process.kill(pid, 'SIGTERM');
        } catch (error) {
          if (error?.code !== 'ESRCH') throw error;
        }
      }
    }
    spawnSync('sleep', ['0.25'], { stdio: 'ignore' });
  }

  fail('the packaged Nex Note app is still running');
}

function openPackagedMacApp() {
  if (!shouldLaunch) return;
  if (!existsSync(appBundle)) fail(`expected app bundle is missing: ${appBundle}`);
  if (process.platform === 'darwin') {
    run('open', [appBundle]);
  } else {
    console.log(`Built app bundle: ${appBundle}`);
  }
}

if (!existsSync(packageJsonPath)) fail('run this command from the nex-note repository root');
const packageJson = JSON.parse(readFileSync(packageJsonPath, 'utf8'));
if (packageJson.name !== 'nex-note') fail('run this command from the nex-note repository root');

const initialState = getLocalBuildState(root);
if (initialState.gitBranch !== 'devel') {
  fail(`the local app workflow only builds devel (current branch: ${initialState.gitBranch || 'detached HEAD'})`);
}

console.log(`Refreshing the packaged app from ${describeBuildState(initialState)}.`);

if (!existsSync(path.join(root, 'node_modules'))) run('npm', ['ci']);
if (!skipTests) run('npm', ['test']);
run('npm', ['run', 'build']);

const builtState = getLocalBuildState(root);
if (builtState.sourceFingerprint !== initialState.sourceFingerprint) {
  fail('the local source changed while tests or the production build were running; retry from a stable working tree');
}

quitPackagedMacApp();
run('npm', ['run', 'electron:prep']);
run('npx', ['electron-builder', '--mac', 'dir']);
run('npm', ['run', 'electron:verify']);
openPackagedMacApp();

console.log(`Packaged Nex Note is current for ${describeBuildState(builtState)}.`);
