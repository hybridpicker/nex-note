import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, readFileSync, writeFileSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createRequire } from 'node:module';

import {
  RELEASE_ARTIFACTS,
  nextDevelVersion,
  parseShipArgs,
  releaseVersionFromDevel,
  renderChecksums,
  renderPkgbuild,
  renderReleaseNotes,
  renderSrcinfo,
  tagForVersion,
} from '../scripts/release-helpers.mjs';

const require = createRequire(import.meta.url);
const channel = require('../electron/channel.cjs');
const updates = require('../electron/release-updates.cjs');
const developerSync = require('../electron/developer-sync.cjs');
const releaseConfig = require('../electron-builder.release.cjs');
const packageJson = require('../package.json');

test('devel versions carry -dev and Releases drop it', () => {
  assert.equal(releaseVersionFromDevel('0.1.0-dev'), '0.1.0');
  assert.equal(nextDevelVersion('0.1.0'), '0.1.1-dev');
  assert.equal(tagForVersion('0.1.0'), 'v0.1.0');
  assert.throws(() => releaseVersionFromDevel('0.1.0'), /-dev/);
  assert.throws(() => releaseVersionFromDevel('0.1.0-beta'), /-dev/);
  assert.throws(() => nextDevelVersion('0.1.0-dev'), /no suffix/);
});

// devel always carries a -dev version; the Release commit that ship builds carries the plain one.
test('the package version is a -dev version on devel and a plain one in a Release build', () => {
  const expected = process.env.NEX_NOTE_RELEASE_CHANNEL === 'release' ? /^\d+\.\d+\.\d+$/ : /^\d+\.\d+\.\d+-dev$/;
  assert.match(packageJson.version, expected);
});

test('ship options reject unknown and conflicting flags', () => {
  assert.deepEqual(parseShipArgs(['--dry-run', '--skip-tests']), {
    buildOnly: false, dryRun: true, skipTests: true, yes: false, skipLinux: false,
  });
  assert.throws(() => parseShipArgs(['--publish']), /unknown option/);
  assert.throws(() => parseShipArgs(['--build-only', '--dry-run']), /cannot be combined/);
});

test('checksums are sorted and use the sha256sum format', () => {
  assert.equal(
    renderChecksums([{ name: 'b.AppImage', sha256: 'bb' }, { name: 'a.dmg', sha256: 'aa' }]),
    'aa  a.dmg\nbb  b.AppImage\n',
  );
  const notes = renderReleaseNotes({ version: '0.1.0', checksums: 'aa  a.dmg\n' });
  assert.match(notes, /Public Beta/);
  assert.match(notes, /yay -S nex-note-bin/);
  assert.match(notes, /blob\/v0\.1\.0\/CHANGELOG\.md/);
});

test('the Omarchy Package installs the tagged tarball with pinned checksums', () => {
  const input = { version: '0.1.0', tarballSha256: 'a'.repeat(64), iconSha256: 'b'.repeat(64), mimeSha256: 'c'.repeat(64) };
  const pkgbuild = renderPkgbuild(input);
  assert.match(pkgbuild, /^pkgname=nex-note-bin$/m);
  assert.match(pkgbuild, /^pkgver=0\.1\.0$/m);
  assert.match(pkgbuild, /releases\/download\/v\$\{pkgver\}\/Nex-Note-linux-x86_64\.tar\.gz/);
  assert.ok(pkgbuild.includes(`'${'a'.repeat(64)}'`));
  assert.match(pkgbuild, /StartupWMClass=nex-note$/m);
  assert.doesNotMatch(pkgbuild, /@/, 'no plain e-mail address in the public PKGBUILD');
  const srcinfo = renderSrcinfo(input);
  assert.match(srcinfo, /^\tsource = Nex-Note-linux-x86_64-0\.1\.0\.tar\.gz::https:\/\/github\.com\/hybridpicker\/nex-note\/releases\/download\/v0\.1\.0\//m);
  assert.match(srcinfo, /^pkgname = nex-note-bin$/m);
});

test('the Release config is the signed, notarized, universal "Nex Note"', () => {
  assert.equal(releaseConfig.productName, 'Nex Note');
  assert.equal(releaseConfig.appId, 'app.nex-note.desktop');
  assert.equal(releaseConfig.mac.identity, undefined);
  assert.equal(releaseConfig.mac.hardenedRuntime, true);
  assert.equal(releaseConfig.mac.notarize, true);
  assert.deepEqual(releaseConfig.mac.target.map((entry: { arch: string[] }) => entry.arch), [['universal'], ['universal']]);
  assert.equal(releaseConfig.mac.artifactName.replace('${arch}', 'universal').replace('${ext}', 'dmg'), RELEASE_ARTIFACTS.macDmg);
  assert.equal(releaseConfig.linux.artifactName.replace('${ext}', 'AppImage'), RELEASE_ARTIFACTS.linuxAppImage);
  assert.equal(releaseConfig.linux.executableName, 'nex-note');
  assert.equal(releaseConfig.publish[0].provider, 'github');
  assert.ok(existsSync(releaseConfig.mac.entitlements));
});

test('the package.json build is the Developer App and stays unsigned', () => {
  assert.equal(packageJson.build.productName, 'Nex Note Dev');
  assert.equal(packageJson.build.appId, 'app.nex-note.desktop.dev');
  assert.equal(packageJson.build.mac.identity, null);
  assert.equal(packageJson.build.linux.executableName, 'nex-note-dev');
});

test('only a packaged build stamped "release" is a Release', () => {
  assert.equal(channel.resolveChannel({ isPackaged: true, buildInfo: { channel: 'release' } }), 'release');
  assert.equal(channel.resolveChannel({ isPackaged: true, buildInfo: { channel: 'developer' } }), 'developer');
  assert.equal(channel.resolveChannel({ isPackaged: true, buildInfo: null }), 'developer');
  assert.equal(channel.resolveChannel({ isPackaged: false, buildInfo: { channel: 'release' } }), 'developer');
  assert.equal(channel.appNameForChannel('release'), 'Nex Note');
  assert.equal(channel.appNameForChannel('developer'), 'Nex Note Dev');
});

test('the Developer App copies the old user data once and skips caches and locks', () => {
  const appData = mkdtempSync(join(tmpdir(), 'nex-channel-'));
  const source = join(appData, 'Nex Note');
  mkdirSync(join(source, 'Local Storage'), { recursive: true });
  mkdirSync(join(source, 'Cache'), { recursive: true });
  writeFileSync(join(source, 'Local Storage', 'leveldb'), 'library');
  writeFileSync(join(source, 'Cache', 'blob'), 'cache');
  writeFileSync(join(source, 'SingletonLock'), 'lock');

  assert.deepEqual(channel.migrateDeveloperUserData({ appDataPath: appData, channel: 'release' }), { migrated: false, reason: 'not-developer' });
  assert.deepEqual(channel.migrateDeveloperUserData({ appDataPath: appData, channel: 'developer' }), { migrated: true, reason: 'copied' });
  const target = join(appData, 'Nex Note Dev');
  assert.equal(readFileSync(join(target, 'Local Storage', 'leveldb'), 'utf8'), 'library');
  assert.equal(existsSync(join(target, 'Cache')), false);
  assert.equal(existsSync(join(target, 'SingletonLock')), false);
  assert.deepEqual(channel.migrateDeveloperUserData({ appDataPath: appData, channel: 'developer' }), { migrated: false, reason: 'target-exists' });
});

test('in-app updates exist on macOS and for the AppImage only', () => {
  assert.equal(updates.resolveUpdateSupport({ platform: 'darwin', env: {} }), 'in-app');
  assert.equal(updates.resolveUpdateSupport({ platform: 'linux', env: { APPIMAGE: '/home/u/Nex.AppImage' } }), 'in-app');
  assert.equal(updates.resolveUpdateSupport({ platform: 'linux', env: {} }), 'package-manager');
  assert.equal(updates.resolveUpdateSupport({ platform: 'win32', env: {} }), 'unsupported');
});

test('update preferences start undecided and round-trip', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'nex-updates-'));
  assert.deepEqual(await updates.readPreferences(dir), { automaticChecks: null });
  await updates.writePreferences(dir, { automaticChecks: false, extra: 'ignored' });
  assert.deepEqual(JSON.parse(readFileSync(join(dir, updates.PREFERENCES_FILE), 'utf8')), { automaticChecks: false });
  assert.deepEqual(await updates.readPreferences(dir), { automaticChecks: false });
  assert.equal(updates.stringsForLocale('de-AT').consentYes, 'Automatisch suchen');
  assert.equal(updates.stringsForLocale('fr').consentYes, 'Check automatically');
});

test('the Update Check asks once, then remembers the answer', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'nex-consent-'));
  const prompts: string[] = [];
  const app = { getLocale: () => 'en-US', getPath: () => dir, getVersion: () => '0.1.0' };
  const dialog = { showMessageBox: async (options: { message: string }) => { prompts.push(options.message); return { response: 1 }; } };
  const controller = updates.createReleaseUpdateController({
    app, dialog, getWindow: () => null, loadUpdater: () => { throw new Error('must not load when declined'); }, platform: 'darwin', env: {},
  });
  await controller.start();
  assert.deepEqual(prompts, ['Check for updates automatically?']);
  assert.equal(controller.automaticChecks, false);
  await controller.start();
  assert.equal(prompts.length, 1, 'no second consent prompt');
});

test('the Developer App only fast-forwards a clean devel checkout', () => {
  const decide = developerSync.decideDeveloperSync;
  assert.deepEqual(decide({ branch: 'devel', dirty: false, behind: 3, ahead: 0 }), { action: 'fast-forward', reason: 'behind-origin' });
  assert.equal(decide({ branch: 'devel', dirty: true, behind: 3, ahead: 0 }).reason, 'dirty-working-tree');
  assert.equal(decide({ branch: 'devel', dirty: false, behind: 3, ahead: 1 }).reason, 'diverged');
  assert.equal(decide({ branch: 'devel', dirty: true, behind: 0, ahead: 0 }).reason, 'up-to-date');
  assert.equal(decide({ branch: 'main', dirty: false, behind: 3, ahead: 0 }).reason, 'not-devel');
  assert.deepEqual(developerSync.developerRefreshCommand('linux'), { command: 'bash', args: ['linux/install.sh'] });
  assert.deepEqual(developerSync.developerRefreshCommand('darwin'), { command: 'npm', args: ['run', 'electron:refresh'] });
});

test('devel sync runs fetch, then fast-forwards and reports the commit count', async () => {
  const calls: string[] = [];
  const fakeGit = async (_root: string, args: string[]) => {
    calls.push(args.join(' '));
    if (args[0] === 'branch') return 'devel';
    if (args[0] === 'status') return '';
    if (args[0] === 'rev-list') return '0\t2';
    return '';
  };
  assert.deepEqual(await developerSync.syncDeveloperCheckout('/repo', fakeGit), { changed: true, reason: 'behind-origin', commits: 2 });
  assert.ok(calls.includes('merge --ff-only --quiet origin/devel'));

  const offline = async (_root: string, args: string[]) => {
    if (args[0] === 'branch') return 'devel';
    throw new Error('network down');
  };
  assert.deepEqual(await developerSync.syncDeveloperCheckout('/repo', offline), { changed: false, reason: 'git-failed' });
});
