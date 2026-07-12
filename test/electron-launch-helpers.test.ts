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
  decidePackagedStartupFreshness,
  isAllowedRendererPermission,
  resolveExecutable,
  uniquePathDirectories,
} = require('../electron/launch-helpers.cjs') as typeof import('../electron/launch-helpers.cjs');

test('a stale packaged build schedules a background rebuild', () => {
  assert.deepEqual(
    decidePackagedBuildFreshness({ buildCommit: 'old-build', buildDirty: false, latestDevelCommit: 'new-devel' }),
    { action: 'rebuild', reason: 'stale-build-commit' },
  );
});

test('a dirty packaged build keeps running while the next launch retries the update', () => {
  assert.deepEqual(
    decidePackagedBuildFreshness({ buildCommit: 'local-build', buildDirty: true, latestDevelCommit: 'new-devel' }),
    { action: 'run', reason: 'dirty-local-build' },
  );
});

test('packaged startup updates before opening when the bundle is behind local HEAD', () => {
  assert.deepEqual(
    decidePackagedStartupFreshness({
      buildCommit: 'old-build',
      buildDirty: false,
      localHeadCommit: 'current-head',
      repoDirty: false,
    }),
    { action: 'update', reason: 'stale-local-build' },
  );
});

test('packaged startup opens only an exact clean local build', () => {
  assert.deepEqual(
    decidePackagedStartupFreshness({
      buildCommit: 'current-head',
      buildDirty: false,
      localHeadCommit: 'current-head',
      repoDirty: false,
    }),
    { action: 'run', reason: 'fresh-local-build' },
  );
});

test('packaged startup blocks ambiguous dirty repository and build states', () => {
  assert.deepEqual(
    decidePackagedStartupFreshness({
      buildCommit: 'current-head',
      buildDirty: false,
      localHeadCommit: 'current-head',
      repoDirty: true,
    }),
    { action: 'block', reason: 'dirty-repository' },
  );
  assert.deepEqual(
    decidePackagedStartupFreshness({
      buildCommit: 'current-head',
      buildDirty: true,
      localHeadCommit: 'current-head',
      repoDirty: false,
    }),
    { action: 'block', reason: 'dirty-packaged-build' },
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

test('Electron permissions allow MIDI only from the local renderer origin', () => {
  const rendererUrl = 'http://127.0.0.1:43123/nex-note-app';
  assert.equal(isAllowedRendererPermission('midi', 'http://127.0.0.1:43123/nex-note-app', rendererUrl), true);
  assert.equal(isAllowedRendererPermission('midiSysex', 'http://127.0.0.1:43123/nex-note-app', rendererUrl), true);
  assert.equal(isAllowedRendererPermission('midi', 'http://127.0.0.1:43124/nex-note-app', rendererUrl), false);
  assert.equal(isAllowedRendererPermission('midi', 'https://example.com', rendererUrl), false);
  assert.equal(isAllowedRendererPermission('geolocation', 'http://127.0.0.1:43123', rendererUrl), false);
});
