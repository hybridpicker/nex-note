#!/usr/bin/env node

import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import path from 'node:path';

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

function git(args) {
  return execFileSync('git', args, {
    cwd: root,
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'inherit'],
  }).trim();
}

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

const headCommit = git(['rev-parse', 'HEAD']);
const worktreeStatus = git(['status', '--porcelain']);
if (worktreeStatus) fail('the repository has uncommitted changes');
if (buildInfo?.dirty) fail('the packaged build is stamped as dirty');
if (!buildInfo?.gitCommit) fail('the packaged build has no git commit stamp');
if (buildInfo.gitCommit !== headCommit) {
  fail(`bundle commit ${buildInfo.gitCommit} does not match HEAD ${headCommit}`);
}

console.log(`Verified packaged Nex Note app at commit ${headCommit}.`);
