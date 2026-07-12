#!/usr/bin/env node

import { execFileSync, spawnSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const appBundle = path.join(root, 'dist', 'macos', 'mac-arm64', 'Nex Note.app');

function run(command, args, options = {}) {
  console.log(`$ ${[command, ...args].join(' ')}`);
  execFileSync(command, args, {
    cwd: root,
    stdio: 'inherit',
    ...options,
  });
}

function output(command, args) {
  return execFileSync(command, args, {
    cwd: root,
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'inherit'],
  }).trim();
}

function ensureCleanWorktree() {
  const dirty = output('git', ['status', '--porcelain']);
  if (dirty) {
    console.error('Refusing to launch a latest-devel app from a dirty worktree.');
    console.error('Commit, stash, or discard local changes first.');
    process.exit(1);
  }
}

function quitRunningMacApp() {
  if (process.platform !== 'darwin') return;

  spawnSync('osascript', ['-e', 'tell application "Nex Note" to quit'], {
    stdio: 'ignore',
  });

  const startedAt = Date.now();
  while (Date.now() - startedAt < 10000) {
    const result = spawnSync('pgrep', ['-x', 'Nex Note'], { stdio: 'ignore' });
    if (result.status !== 0) return;
    spawnSync('sleep', ['0.5'], { stdio: 'ignore' });
  }

  console.error('Nex Note is still running after quit request; refusing to open a second copy.');
  process.exit(1);
}

function openMacApp() {
  if (process.platform !== 'darwin') {
    console.log(`Built app bundle: ${appBundle}`);
    return;
  }

  if (!existsSync(appBundle)) {
    console.error(`Expected app bundle is missing: ${appBundle}`);
    process.exit(1);
  }

  run('open', [appBundle]);
}

const packageJson = JSON.parse(readFileSync(path.join(root, 'package.json'), 'utf8'));
if (packageJson.name !== 'nex-note') {
  console.error('Run this script from the nex-note repository root.');
  process.exit(1);
}

ensureCleanWorktree();

const branch = output('git', ['branch', '--show-current']);
if (branch !== 'devel') {
  run('git', ['switch', 'devel']);
  ensureCleanWorktree();
}

run('git', ['fetch', 'origin', 'devel:refs/remotes/origin/devel']);
run('git', ['merge', '--ff-only', 'origin/devel']);

if (!existsSync(path.join(root, 'node_modules'))) {
  run('npm', ['ci']);
}

run('npm', ['run', 'electron:build']);
if (process.env.NEX_NOTE_BACKGROUND_DEVEL_UPDATE === '1') {
  console.log('Updated the packaged app in the background; it will be used on the next normal launch.');
  process.exit(0);
}
quitRunningMacApp();
openMacApp();
