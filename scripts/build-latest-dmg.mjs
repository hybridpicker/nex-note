#!/usr/bin/env node

// Builds a macOS DMG from the latest *committed* state without touching the working tree.
//
// The commit is checked out into a temporary detached git worktree outside the repository, so
// uncommitted work in progress (and a dev server or test run using `.next/`) is neither included
// nor disturbed. The result lands in `dist/dmg/`:
//
//   Nex Note-<version>-<branch>-<commit>-<arch>.dmg   one file per built commit
//   Nex Note-latest.dmg                               always the newest build
//   latest.json                                       what the newest build contains
//
// Usage: npm run dmg:latest [-- --ref <commit|branch> --force --background --keep <n>]

import { execFileSync, spawn } from 'node:child_process';
import { createHash } from 'node:crypto';
import {
  closeSync,
  copyFileSync,
  createReadStream,
  existsSync,
  linkSync,
  mkdirSync,
  openSync,
  readFileSync,
  readdirSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  LATEST_DMG_NAME,
  MANIFEST_NAME,
  dmgFileName,
  isManifestCurrent,
  parseLatestDmgArgs,
  updateBuildHistory,
} from './latest-dmg-helpers.mjs';

const root = process.cwd();
const scriptPath = fileURLToPath(import.meta.url);
const outputDir = path.join(root, 'dist', 'dmg');
const manifestPath = path.join(outputDir, MANIFEST_NAME);
const lockPath = path.join(outputDir, '.build.lock');
const logPath = path.join(outputDir, 'build.log');
const buildRoot = path.join(os.homedir(), 'Library', 'Caches', 'nex-note', 'dmg-build');
const arch = process.arch;

function fail(message) {
  console.error(`Latest DMG build failed: ${message}`);
  process.exit(1);
}

function git(args, cwd = root) {
  return execFileSync('git', args, { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim();
}

function run(command, args, options = {}) {
  console.log(`$ ${[command, ...args].join(' ')}`);
  execFileSync(command, args, { stdio: 'inherit', ...options });
}

function readManifest() {
  try {
    return JSON.parse(readFileSync(manifestPath, 'utf8'));
  } catch {
    return null;
  }
}

function sha256(filePath) {
  return new Promise((resolve, reject) => {
    const hash = createHash('sha256');
    createReadStream(filePath)
      .on('data', (chunk) => hash.update(chunk))
      .on('error', reject)
      .on('end', () => resolve(hash.digest('hex')));
  });
}

function processIsAlive(pid) {
  try {
    process.kill(pid, 0);
    return true;
  } catch (error) {
    return error?.code === 'EPERM';
  }
}

// Returns false when another build already holds the lock.
function acquireLock() {
  for (let attempt = 0; attempt < 2; attempt += 1) {
    try {
      const handle = openSync(lockPath, 'wx');
      writeFileSync(handle, `${process.pid}\n`);
      closeSync(handle);
      return true;
    } catch (error) {
      if (error?.code !== 'EEXIST') throw error;
      const owner = Number(readFileSync(lockPath, 'utf8').trim());
      if (Number.isInteger(owner) && owner > 0 && processIsAlive(owner)) return false;
      rmSync(lockPath, { force: true });
    }
  }
  return false;
}

function releaseLock() {
  try {
    if (Number(readFileSync(lockPath, 'utf8').trim()) === process.pid) rmSync(lockPath, { force: true });
  } catch {
    // The lock is already gone.
  }
}

function removeBuildWorktree() {
  try {
    git(['worktree', 'remove', '--force', buildRoot]);
  } catch {
    rmSync(buildRoot, { recursive: true, force: true });
  }
  try {
    git(['worktree', 'prune']);
  } catch {
    // Pruning is housekeeping only.
  }
}

// `cp -c` clones files copy-on-write on APFS: fast, and it takes no extra disk space.
function cloneDirectory(source, target) {
  mkdirSync(path.dirname(target), { recursive: true });
  try {
    execFileSync('cp', ['-c', '-R', source, target], { stdio: 'ignore' });
  } catch {
    rmSync(target, { recursive: true, force: true });
    execFileSync('cp', ['-R', source, target], { stdio: 'inherit' });
  }
}

function installDependencies(commit) {
  const rootLock = path.join(root, 'package-lock.json');
  const rootModules = path.join(root, 'node_modules');
  const committedLock = git(['show', `${commit}:package-lock.json`]);
  const sameLock = existsSync(rootLock) && readFileSync(rootLock, 'utf8').trim() === committedLock;

  if (sameLock && existsSync(rootModules)) {
    console.log('Reusing the installed node_modules (package-lock.json is unchanged).');
    cloneDirectory(rootModules, path.join(buildRoot, 'node_modules'));
    return;
  }
  run('npm', ['ci'], { cwd: buildRoot });
}

// Offline playback samples are not in git (`npm run soundfonts:fetch`), but belong in the app.
function copyUntrackedRuntimeAssets() {
  const soundfonts = path.join(root, 'public', 'soundfonts');
  if (existsSync(soundfonts)) cloneDirectory(soundfonts, path.join(buildRoot, 'public', 'soundfonts'));
  else console.warn('public/soundfonts is missing; the DMG will not contain offline playback samples.');
}

function resolveBranchLabel(ref, commit) {
  const current = git(['branch', '--show-current']);
  if (current && git(['rev-parse', 'HEAD']) === commit) return current;
  try {
    const symbolic = git(['rev-parse', '--abbrev-ref', ref]);
    if (symbolic && symbolic !== 'HEAD') return symbolic;
  } catch {
    // Not a branch name.
  }
  return 'detached';
}

async function buildCommit({ ref, commit, keep, keepWorktree }) {
  const branch = resolveBranchLabel(ref, commit);
  const version = JSON.parse(git(['show', `${commit}:package.json`])).version;
  const targetName = dmgFileName({ version, branch, commit, arch });
  console.log(`Building ${targetName} from ${branch}@${commit.slice(0, 8)}.`);

  removeBuildWorktree();
  mkdirSync(path.dirname(buildRoot), { recursive: true });
  git(['worktree', 'add', '--detach', '--force', buildRoot, commit]);

  try {
    installDependencies(commit);
    copyUntrackedRuntimeAssets();

    // No `.env*` file is copied: provider keys stay on this Mac and never enter a build product.
    const env = { ...process.env, NEXT_PUBLIC_NEX_NOTE_GIT_BRANCH: branch };
    delete env.NEX_NOTE_STARTUP_LOCAL_REFRESH;
    run('npm', ['run', 'build'], { cwd: buildRoot, env });
    run('npm', ['run', 'electron:prep'], { cwd: buildRoot, env });
    run('npx', ['electron-builder', '--mac', 'dmg', '--publish', 'never'], { cwd: buildRoot, env });

    const builtDir = path.join(buildRoot, 'dist', 'macos');
    const appDir = readdirSync(builtDir).find((name) => name.startsWith('mac'));
    const buildInfoPath = path.join(
      builtDir, appDir ?? 'mac', 'Nex Note Dev.app', 'Contents', 'Resources', 'app',
      '.next', 'standalone', 'nex-note-build.json',
    );
    const buildInfo = JSON.parse(readFileSync(buildInfoPath, 'utf8'));
    if (buildInfo.gitCommit !== commit) fail(`the bundle is stamped ${buildInfo.gitCommit}, expected ${commit}`);
    if (buildInfo.dirty) fail('the build worktree was not clean; the DMG would not match the commit');

    const builtDmg = readdirSync(builtDir).find((name) => name.endsWith('.dmg'));
    if (!builtDmg) fail(`electron-builder produced no DMG in ${builtDir}`);

    const target = path.join(outputDir, targetName);
    const latest = path.join(outputDir, LATEST_DMG_NAME);
    rmSync(target, { force: true });
    copyFileSync(path.join(builtDir, builtDmg), target);
    rmSync(latest, { force: true });
    try {
      linkSync(target, latest);
    } catch {
      copyFileSync(target, latest);
    }

    const build = {
      version,
      branch,
      commit,
      arch,
      builtAt: new Date().toISOString(),
      dmg: targetName,
      sha256: await sha256(target),
    };
    const { builds, pruned } = updateBuildHistory(readManifest()?.builds, build, keep);
    for (const name of pruned) rmSync(path.join(outputDir, path.basename(name)), { force: true });
    writeFileSync(manifestPath, `${JSON.stringify({ ...build, latest: LATEST_DMG_NAME, builds }, null, 2)}\n`);
    console.log(`Latest DMG: ${latest}`);
    console.log(`Versioned copy: ${target}`);
  } finally {
    if (!keepWorktree) removeBuildWorktree();
  }
}

function startInBackground(argv) {
  mkdirSync(outputDir, { recursive: true });
  const log = openSync(logPath, 'a');
  const child = spawn(process.execPath, [scriptPath, ...argv.filter((arg) => arg !== '--background')], {
    cwd: root,
    detached: true,
    stdio: ['ignore', log, log],
  });
  child.unref();
  console.log(`Building the latest DMG in the background (pid ${child.pid}). Log: ${logPath}`);
}

async function main() {
  if (process.platform !== 'darwin') fail('DMG files can only be built on macOS');
  if (!existsSync(path.join(root, 'package.json'))
    || JSON.parse(readFileSync(path.join(root, 'package.json'), 'utf8')).name !== 'nex-note') {
    fail('run this command from the nex-note repository root');
  }

  let options;
  try {
    options = parseLatestDmgArgs(process.argv.slice(2));
  } catch (error) {
    fail(error.message);
  }

  if (options.background) {
    startInBackground(process.argv.slice(2));
    return;
  }

  mkdirSync(outputDir, { recursive: true });
  if (!acquireLock()) {
    // The running build re-reads the ref when it finishes, so this commit is not lost.
    console.log('Another latest-DMG build is running; it will pick up this commit when it finishes.');
    return;
  }
  process.on('exit', releaseLock);
  for (const signal of ['SIGINT', 'SIGTERM']) process.on(signal, () => process.exit(1));

  // Commits can arrive while a build runs. Build again until the ref stands still.
  let force = options.force;
  for (let round = 0; round < 5; round += 1) {
    const commit = git(['rev-parse', '--verify', `${options.ref}^{commit}`]);
    const current = isManifestCurrent(readManifest(), { commit, existingFiles: readdirSync(outputDir) });
    if (current && !force) {
      console.log(`The latest DMG already contains ${commit.slice(0, 8)}: ${path.join(outputDir, LATEST_DMG_NAME)}`);
      return;
    }
    console.log(`\n[${new Date().toISOString()}] latest DMG build for ${commit.slice(0, 8)}`);
    await buildCommit({ ...options, commit });
    force = false;
  }
}

await main();
