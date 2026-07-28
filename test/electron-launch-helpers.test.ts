import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { chmodSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { delimiter, join } from 'node:path';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const {
  buildChildProcessEnv,
  decideLocalBuildFreshness,
  isAllowedRendererPermission,
  resolveExecutable,
  uniquePathDirectories,
} = require('../electron/launch-helpers.cjs') as typeof import('../electron/launch-helpers.cjs');
const { getLocalBuildState } = require('../electron/build-state.cjs') as typeof import('../electron/build-state.cjs');

test('a stale packaged build requires a local refresh', () => {
  assert.deepEqual(
    decideLocalBuildFreshness({ buildFingerprint: 'old-build', localFingerprint: 'current-local-source' }),
    { action: 'refresh', reason: 'stale-local-build' },
  );
});

test('a matching local source fingerprint opens the packaged build', () => {
  assert.deepEqual(
    decideLocalBuildFreshness({ buildFingerprint: 'current-local-source', localFingerprint: 'current-local-source' }),
    { action: 'run', reason: 'fresh-local-build' },
  );
});

test('a legacy packaged build without a source fingerprint is refreshed', () => {
  assert.deepEqual(
    decideLocalBuildFreshness({ buildFingerprint: null, localFingerprint: 'current-local-source' }),
    { action: 'refresh', reason: 'missing-build-fingerprint' },
  );
});

test('the packaged app checks local devel before opening the product window', () => {
  const mainSource = readFileSync(new URL('../electron/main.cjs', import.meta.url), 'utf8');
  const refreshCheck = mainSource.indexOf('if (await ensurePackagedBuildMatchesLocalDevel()) return;');
  const openWindow = mainSource.indexOf('await createWindow();', refreshCheck);

  assert.ok(refreshCheck >= 0);
  assert.ok(openWindow > refreshCheck);
  assert.doesNotMatch(mainSource, /fetch.*origin.*devel/);
});

test('the Electron application menu exposes the platform quit accelerator', () => {
  const mainSource = readFileSync(new URL('../electron/main.cjs', import.meta.url), 'utf8');
  const quitItems = [...mainSource.matchAll(
    /role: 'quit',[\s\S]*?accelerator: 'CommandOrControl\+Q'/g,
  )];

  assert.equal(quitItems.length, 2);
});

test('the packaged Next server runs invisibly and automatically restarts after an unexpected exit', () => {
  const mainSource = readFileSync(new URL('../electron/main.cjs', import.meta.url), 'utf8');

  assert.match(mainSource, /utilityProcess\.fork\(serverPath/);
  assert.match(mainSource, /serviceName: 'Nex Note Server'/);
  assert.doesNotMatch(mainSource, /ELECTRON_RUN_AS_NODE/);
  assert.match(mainSource, /child\.once\('exit'/);
  assert.match(mainSource, /launchPackagedServer\(port\)/);
  assert.match(mainSource, /quitting \|\| isElectronDevRuntime\(\)/);
});

test('the latest-devel launcher refreshes only the app bundle', () => {
  const launcher = readFileSync(new URL('../scripts/launch-latest-devel-app.mjs', import.meta.url), 'utf8');

  assert.match(launcher, /run\('npm', \['run', 'electron:refresh'\]\);/);
  assert.doesNotMatch(launcher, /run\('npm', \['run', 'electron:build'\]\);/);
});

test('the local app workflow tests and builds the current worktree without fetching', () => {
  const launcher = readFileSync(new URL('../scripts/refresh-local-electron-app.mjs', import.meta.url), 'utf8');

  assert.match(launcher, /run\('npm', \['test'\]\);/);
  assert.match(launcher, /run\('npm', \['run', 'build'\]\);/);
  assert.match(launcher, /electron-builder', '--mac', 'dir'/);
  assert.match(launcher, /sourceFingerprint !== initialState\.sourceFingerprint/);
  assert.match(launcher, /match\?\.\[2\] === executable/);
  assert.match(launcher, /process\.kill\(pid, 'SIGTERM'\)/);
  assert.doesNotMatch(launcher, /fetch/);
  assert.doesNotMatch(launcher, /merge/);
});

test('local build fingerprints include tracked, untracked, and ignored env changes', () => {
  const directory = mkdtempSync(join(tmpdir(), 'nex-note-build-state-'));
  const git = (args: string[]) => execFileSync('git', args, { cwd: directory, stdio: 'ignore' });
  git(['init', '-b', 'devel']);
  git(['config', 'user.name', 'Nex Note Test']);
  git(['config', 'user.email', 'test@nex-note.local']);
  writeFileSync(join(directory, '.gitignore'), '.env.local\n');
  writeFileSync(join(directory, 'source.ts'), 'export const value = 1;\n');
  git(['add', '.gitignore', 'source.ts']);
  git(['commit', '-m', 'Initial test fixture']);

  const clean = getLocalBuildState(directory);
  writeFileSync(join(directory, 'source.ts'), 'export const value = 2;\n');
  const tracked = getLocalBuildState(directory);
  writeFileSync(join(directory, 'new-source.ts'), 'export const extra = true;\n');
  const untracked = getLocalBuildState(directory);
  writeFileSync(join(directory, '.env.local'), 'NEX_NOTE_TEST_VALUE=one\n');
  const firstEnv = getLocalBuildState(directory);
  writeFileSync(join(directory, '.env.local'), 'NEX_NOTE_TEST_VALUE=two\n');
  const secondEnv = getLocalBuildState(directory);

  assert.notEqual(clean.sourceFingerprint, tracked.sourceFingerprint);
  assert.notEqual(tracked.sourceFingerprint, untracked.sourceFingerprint);
  assert.notEqual(untracked.sourceFingerprint, firstEnv.sourceFingerprint);
  assert.notEqual(firstEnv.sourceFingerprint, secondEnv.sourceFingerprint);
  assert.equal(clean.gitBranch, 'devel');
  assert.equal(clean.dirty, false);
  assert.equal(tracked.dirty, true);
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

test('Electron permissions allow MIDI and microphone-only media from the local renderer origin', () => {
  const rendererUrl = 'http://127.0.0.1:43123/nex-note-app';
  assert.equal(isAllowedRendererPermission('midi', 'http://127.0.0.1:43123/nex-note-app', rendererUrl), true);
  assert.equal(isAllowedRendererPermission('midiSysex', 'http://127.0.0.1:43123/nex-note-app', rendererUrl), true);
  assert.equal(isAllowedRendererPermission('media', 'http://127.0.0.1:43123/nex-note-app', rendererUrl, { mediaTypes: ['audio'] }), true);
  assert.equal(isAllowedRendererPermission('media', 'http://127.0.0.1:43123/nex-note-app', rendererUrl, { mediaTypes: ['video'] }), false);
  assert.equal(isAllowedRendererPermission('media', 'http://127.0.0.1:43123/nex-note-app', rendererUrl, { mediaTypes: ['audio', 'video'] }), false);
  assert.equal(isAllowedRendererPermission('midi', 'http://127.0.0.1:43124/nex-note-app', rendererUrl), false);
  assert.equal(isAllowedRendererPermission('media', 'https://example.com', rendererUrl, { mediaTypes: ['audio'] }), false);
  assert.equal(isAllowedRendererPermission('midi', 'https://example.com', rendererUrl), false);
  assert.equal(isAllowedRendererPermission('geolocation', 'http://127.0.0.1:43123', rendererUrl), false);
});
