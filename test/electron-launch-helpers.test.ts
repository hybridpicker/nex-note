import test from 'node:test';
import assert from 'node:assert/strict';
import { chmodSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { delimiter, join } from 'node:path';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const {
  buildChildProcessEnv,
  decidePackagedBuildFreshness,
  resolveExecutable,
  uniquePathDirectories,
} = require('../electron/launch-helpers.cjs') as typeof import('../electron/launch-helpers.cjs');

test('dirty repo-local packaged builds run instead of entering the updater loop', () => {
  assert.deepEqual(
    decidePackagedBuildFreshness({
      buildCommit: 'local-work',
      buildDirty: true,
      latestDevelCommit: 'origin-devel',
    }),
    {
      action: 'run',
      reason: 'dirty-local-build',
    },
  );
});

test('clean stale packaged builds request a rebuild from latest devel', () => {
  assert.deepEqual(
    decidePackagedBuildFreshness({
      buildCommit: 'old-build',
      buildDirty: false,
      latestDevelCommit: 'new-devel',
    }),
    {
      action: 'rebuild',
      reason: 'stale-build-commit',
    },
  );
});

test('clean packaged builds at origin/devel run normally', () => {
  assert.deepEqual(
    decidePackagedBuildFreshness({
      buildCommit: 'same-commit',
      buildDirty: false,
      latestDevelCommit: 'same-commit',
    }),
    {
      action: 'run',
      reason: 'fresh-build',
    },
  );
});

test('packaged launch PATH keeps inherited directories and adds macOS binary defaults', () => {
  const env = buildChildProcessEnv({}, {
    HOME: '/Users/tester',
    PATH: `/custom/bin${delimiter}/usr/bin`,
  });

  assert.match(env.PATH, /\/custom\/bin/);
  assert.match(env.PATH, /\/usr\/bin/);
  if (process.platform === 'darwin') {
    assert.match(env.PATH, /\/opt\/homebrew\/bin/);
    assert.match(env.PATH, /\/usr\/local\/bin/);
    assert.match(env.PATH, /\/Users\/tester\/\.homebrew\/bin/);
  }
});

test('resolveExecutable finds commands from a Finder-style sparse PATH', async () => {
  const directory = mkdtempSync(join(tmpdir(), 'nex-note-electron-path-'));
  const executable = join(directory, 'nex-note-tool');
  writeFileSync(executable, '#!/bin/sh\nexit 0\n');
  chmodSync(executable, 0o755);

  const resolved = await resolveExecutable('nex-note-tool', {
    HOME: '/Users/tester',
    PATH: directory,
  });

  assert.equal(resolved, executable);
});

test('uniquePathDirectories removes empty and duplicate PATH entries', () => {
  assert.deepEqual(
    uniquePathDirectories(['/bin', '', '/usr/bin', '/bin', '/usr/bin', '/custom/bin']),
    ['/bin', '/usr/bin', '/custom/bin'],
  );
});
