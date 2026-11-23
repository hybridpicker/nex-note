#!/usr/bin/env node

// Ships a Release (GLOSSARY.md) from this Mac. See docs/release.md and
// docs/adr/0002-release-builds-signed-locally.md.
//
//   npm run ship                     devel → main, tag, build, sign, notarize, publish, bump devel
//   npm run ship -- --dry-run        everything except pushing and publishing
//   npm run release:build            signed + notarized build of devel HEAD, no git changes
//
// Options: --skip-tests, --skip-linux, --yes (no confirmation before publishing).
//
// Order matters: the build and Apple's notarization must succeed before anything is pushed, and
// the GitHub Release must exist before `main` moves, because pushing `main` deploys nex-note.com
// and its download buttons point at the latest Release.
//
// Data: no `.env*` file is copied into the build checkout, so provider keys never enter a Release.
// Signing material stays in the login keychain; only the notarytool profile name is passed on.

import { execFileSync, spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { createReadStream, existsSync, mkdirSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import readline from 'node:readline/promises';

import {
  AUR_PACKAGE,
  NOTARY_PROFILE,
  RELEASE_ARTIFACTS,
  REPO_NAME,
  REPO_OWNER,
  UPDATE_METADATA,
  nextDevelVersion,
  parseShipArgs,
  releaseVersionFromDevel,
  renderChecksums,
  renderPkgbuild,
  renderReleaseNotes,
  renderSrcinfo,
  replaceUpdateFileEntry,
  tagForVersion,
} from './release-helpers.mjs';

const root = process.cwd();
const buildRoot = path.join(os.homedir(), 'Library', 'Caches', 'nex-note', 'release-build');
const releaseOutput = path.join(buildRoot, 'dist', 'release');
const collectedDir = path.join(root, 'dist', 'release');
const repoSlug = `${REPO_OWNER}/${REPO_NAME}`;

let options;
try {
  options = parseShipArgs(process.argv.slice(2));
} catch (error) {
  fail(error.message);
}

function fail(message) {
  console.error(`\nRelease stopped: ${message}`);
  process.exit(1);
}

function log(message) {
  console.log(`\n▸ ${message}`);
}

function git(args, cwd = root) {
  return execFileSync('git', args, { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim();
}

function tryGit(args, cwd = root) {
  try {
    return git(args, cwd);
  } catch {
    return null;
  }
}

function run(command, args, extra = {}) {
  console.log(`$ ${[command, ...args].join(' ')}`);
  execFileSync(command, args, { stdio: 'inherit', cwd: buildRoot, ...extra });
}

function commandOk(command, args) {
  return spawnSync(command, args, { stdio: 'ignore' }).status === 0;
}

function fileHash(filePath, algorithm, encoding) {
  return new Promise((resolve, reject) => {
    const hash = createHash(algorithm);
    createReadStream(filePath)
      .on('data', (chunk) => hash.update(chunk))
      .on('error', reject)
      .on('end', () => resolve(hash.digest(encoding)));
  });
}

function sha256(filePath) {
  return fileHash(filePath, 'sha256', 'hex');
}

async function confirm(question) {
  if (options.yes) return true;
  if (!process.stdin.isTTY) fail(`${question} needs a confirmation; re-run with --yes from a script`);
  const prompt = readline.createInterface({ input: process.stdin, output: process.stdout });
  const answer = await prompt.question(`\n? ${question} [y/N] `);
  prompt.close();
  return /^y/i.test(answer.trim());
}

function writeJsonVersion(filePath, version) {
  const json = JSON.parse(readFileSync(filePath, 'utf8'));
  json.version = version;
  if (json.packages?.['']) json.packages[''].version = version;
  writeFileSync(filePath, `${JSON.stringify(json, null, 2)}\n`);
}

// ── Preflight ─────────────────────────────────────────────────────────────

function preflight() {
  log('Checking the release prerequisites');
  if (process.platform !== 'darwin') fail('Releases are built on macOS (signing and notarization)');
  const packageJson = JSON.parse(readFileSync(path.join(root, 'package.json'), 'utf8'));
  if (packageJson.name !== 'nex-note') fail('run this from the nex-note repository root');

  const branch = git(['branch', '--show-current']);
  if (branch !== 'devel') fail(`Releases start from devel (current branch: ${branch || 'detached'})`);
  if (!options.buildOnly && git(['status', '--porcelain=v1', '--untracked-files=normal'])) {
    fail('the working tree is not clean; commit or stash first (the Release must match a commit)');
  }

  const version = releaseVersionFromDevel(packageJson.version);
  const tag = tagForVersion(version);

  if (!commandOk('security', ['find-identity', '-v', '-p', 'codesigning'])
    || !execFileSync('security', ['find-identity', '-v', '-p', 'codesigning'], { encoding: 'utf8' }).includes('"Developer ID Application:')) {
    fail('no "Developer ID Application" certificate in the keychain; run npm run release:setup');
  }
  if (!commandOk('xcrun', ['notarytool', 'history', '--keychain-profile', NOTARY_PROFILE])) {
    fail(`the notarytool keychain profile "${NOTARY_PROFILE}" does not authenticate; run npm run release:setup`);
  }

  const publishing = !options.buildOnly && !options.dryRun;
  if (publishing || options.dryRun) {
    if (!commandOk('gh', ['auth', 'status'])) fail('gh is not signed in (gh auth login)');
    git(['fetch', '--quiet', 'origin', 'main', 'devel', '--tags']);
    const develHead = git(['rev-parse', 'HEAD']);
    if (git(['rev-parse', 'origin/devel']) !== develHead) fail('local devel and origin/devel differ; push or pull first');
    if (tryGit(['merge-base', '--is-ancestor', 'origin/main', develHead]) === null) {
      fail('origin/main is not an ancestor of devel; main has commits devel lacks');
    }
    if (tryGit(['rev-parse', '-q', '--verify', `refs/tags/${tag}`])) fail(`tag ${tag} already exists; bump the devel version`);
    const visibility = execFileSync('gh', ['repo', 'view', repoSlug, '--json', 'visibility', '-q', '.visibility'], { encoding: 'utf8' }).trim();
    if (visibility !== 'PUBLIC') {
      const message = `${repoSlug} is ${visibility.toLowerCase()}: downloads and the Update Check need a public repository (docs/adr/0001)`;
      if (publishing) fail(message);
      console.warn(`Warning: ${message}.`);
    }
  }

  return { version, tag, develHead: git(['rev-parse', 'HEAD']) };
}

// ── Build ─────────────────────────────────────────────────────────────────

function prepareCheckout(commit) {
  log(`Preparing a clean build checkout of ${commit.slice(0, 8)}`);
  tryGit(['worktree', 'remove', '--force', buildRoot]);
  rmSync(buildRoot, { recursive: true, force: true });
  tryGit(['worktree', 'prune']);
  mkdirSync(path.dirname(buildRoot), { recursive: true });
  git(['worktree', 'add', '--detach', '--force', buildRoot, commit]);
}

function createReleaseCommit(version) {
  log(`Creating the Release commit for ${version}`);
  writeJsonVersion(path.join(buildRoot, 'package.json'), version);
  writeJsonVersion(path.join(buildRoot, 'package-lock.json'), version);
  git(['add', 'package.json', 'package-lock.json'], buildRoot);
  // Hooks would run the e2e suite and a Developer DMG build; the release build below runs the tests.
  execFileSync('git', ['commit', '--no-verify', '-m', `Release ${version}`], {
    cwd: buildRoot,
    stdio: 'inherit',
    env: { ...process.env, NEX_NOTE_SKIP_POST_COMMIT_BUILD: '1' },
  });
  return git(['rev-parse', 'HEAD'], buildRoot);
}

function buildEnv() {
  const env = { ...process.env, NEX_NOTE_RELEASE_CHANNEL: 'release', NEXT_PUBLIC_NEX_NOTE_GIT_BRANCH: 'main', APPLE_KEYCHAIN_PROFILE: NOTARY_PROFILE };
  delete env.NEX_NOTE_STARTUP_LOCAL_REFRESH;
  delete env.CSC_IDENTITY_AUTO_DISCOVERY;
  return env;
}

function soundfontCount(directory) {
  const dir = path.join(directory, 'public', 'soundfonts', 'FluidR3_GM');
  return existsSync(dir) ? readdirSync(dir).filter((name) => name.endsWith('-mp3.js')).length : 0;
}

async function buildRelease(version) {
  const env = buildEnv();
  log('Installing dependencies');
  run('npm', ['ci'], { env });
  log('Fetching the bundled playback samples');
  run('npm', ['run', 'soundfonts:fetch'], { env });
  if (soundfontCount(buildRoot) === 0) fail('no playback samples were fetched; a Release must play offline');
  if (!options.skipTests) {
    log('Running the test suite');
    run('npm', ['test'], { env });
  }
  log('Building the web bundle (Release channel)');
  run('npm', ['run', 'build'], { env });
  run('npm', ['run', 'electron:prep'], { env });

  const versionOverride = options.buildOnly ? [`-c.extraMetadata.version=${version}`] : [];
  log('Building, signing and notarizing the universal macOS app (Apple notarization takes a few minutes)');
  run('npx', ['electron-builder', '--config', 'electron-builder.release.cjs', '--mac', '--publish', 'never', ...versionOverride], { env });
  await notarizeMacDmg();
  if (!options.skipLinux) {
    log('Building the Linux AppImage and tarball');
    run('npx', ['electron-builder', '--config', 'electron-builder.release.cjs', '--linux', '--publish', 'never', ...versionOverride], { env });
  }
}

function developerIdIdentity() {
  const line = execFileSync('security', ['find-identity', '-v', '-p', 'codesigning'], { encoding: 'utf8' })
    .split('\n')
    .find((entry) => entry.includes('"Developer ID Application:'));
  const hash = line?.trim().split(/\s+/)[1];
  if (!hash) fail('no "Developer ID Application" certificate in the keychain; run npm run release:setup');
  return hash;
}

// electron-builder signs, notarizes and staples the app inside the DMG, but not the DMG itself.
// A Release DMG is signed, notarized and stapled too, so Gatekeeper accepts it offline on first open.
async function notarizeMacDmg() {
  const dmgPath = path.join(releaseOutput, RELEASE_ARTIFACTS.macDmg);
  log('Signing, notarizing and stapling the DMG (Apple notarization takes a few minutes)');
  const identity = developerIdIdentity();
  // Apple's timestamp server occasionally answers without a timestamp; sign again until it has one.
  let stamped = false;
  for (let attempt = 1; attempt <= 3 && !stamped; attempt += 1) {
    if (attempt > 1) console.log(`Timestamp missing, signing again (attempt ${attempt} of 3)`);
    spawnSync('codesign', ['--force', '--sign', identity, '--timestamp', dmgPath], { stdio: 'inherit' });
    const details = spawnSync('codesign', ['-dvv', dmgPath], { encoding: 'utf8' });
    stamped = details.status === 0 && /^Timestamp=/m.test(details.stderr);
  }
  if (!stamped) fail('the DMG could not be signed with a secure timestamp');

  console.log(`$ xcrun notarytool submit ${dmgPath} --keychain-profile ${NOTARY_PROFILE} --wait`);
  const submission = spawnSync('xcrun', ['notarytool', 'submit', dmgPath, '--keychain-profile', NOTARY_PROFILE,
    '--wait', '--output-format', 'json'], { encoding: 'utf8', cwd: buildRoot });
  let result = {};
  try { result = JSON.parse(submission.stdout); } catch { /* reported below */ }
  if (result.status !== 'Accepted') {
    fail(`Apple did not accept the DMG (status ${result.status || 'unknown'}); run xcrun notarytool log ${result.id || '<id>'} --keychain-profile ${NOTARY_PROFILE}`);
  }
  run('xcrun', ['stapler', 'staple', dmgPath]);

  const metadataPath = path.join(releaseOutput, 'latest-mac.yml');
  const sha512 = await fileHash(dmgPath, 'sha512', 'base64');
  writeFileSync(metadataPath, replaceUpdateFileEntry(readFileSync(metadataPath, 'utf8'), RELEASE_ARTIFACTS.macDmg,
    { sha512, size: statSync(dmgPath).size }));
  // The DMG's blockmap describes the unstapled file; the Update Check downloads the ZIP, not the DMG.
  rmSync(`${dmgPath}.blockmap`, { force: true });
}

function verifyMacRelease(expectedCommit) {
  log('Verifying signature, notarization and build stamp');
  const appPath = path.join(releaseOutput, 'mac-universal', 'Nex Note.app');
  if (!existsSync(appPath)) fail(`expected app bundle is missing: ${appPath}`);
  run('codesign', ['--verify', '--deep', '--strict', '--verbose=2', appPath]);
  run('spctl', ['--assess', '--type', 'execute', '--verbose=2', appPath]);
  run('xcrun', ['stapler', 'validate', appPath]);
  const dmgPath = path.join(releaseOutput, RELEASE_ARTIFACTS.macDmg);
  run('codesign', ['--verify', '--strict', '--verbose=2', dmgPath]);
  run('xcrun', ['stapler', 'validate', dmgPath]);
  run('spctl', ['--assess', '--type', 'open', '--context', 'context:primary-signature', '--verbose=2', dmgPath]);

  const stampPath = path.join(appPath, 'Contents', 'Resources', 'app', '.next', 'standalone', 'nex-note-build.json');
  const stamp = JSON.parse(readFileSync(stampPath, 'utf8'));
  if (stamp.channel !== 'release') fail(`the app is stamped for the ${stamp.channel} channel`);
  if (stamp.gitCommit !== expectedCommit) fail(`the app is stamped ${stamp.gitCommit}, expected ${expectedCommit}`);
  if (stamp.sourceRepo) fail('the Release build info contains a local checkout path');
  if (soundfontCount(path.join(appPath, 'Contents', 'Resources', 'app', '.next', 'standalone')) === 0) {
    fail('the packaged app has no playback samples');
  }
  const envLeak = readdirSync(path.join(appPath, 'Contents', 'Resources', 'app'), { recursive: true })
    .map(String)
    .filter((entry) => /(^|\/)\.env(\.|$)/.test(entry) && !entry.endsWith('.example'));
  if (envLeak.length) fail(`the app contains environment files: ${envLeak.join(', ')}`);
}

async function collectArtifacts(version) {
  log('Collecting artifacts and checksums');
  const wanted = [
    RELEASE_ARTIFACTS.macDmg,
    RELEASE_ARTIFACTS.macZip,
    ...(options.skipLinux ? [] : [RELEASE_ARTIFACTS.linuxAppImage, RELEASE_ARTIFACTS.linuxTarball]),
  ];
  const metadata = UPDATE_METADATA.filter((name) => existsSync(path.join(releaseOutput, name)));
  const blockmaps = readdirSync(releaseOutput).filter((name) => name.endsWith('.blockmap'));
  for (const name of wanted) {
    if (!existsSync(path.join(releaseOutput, name))) fail(`missing artifact ${name}`);
  }
  if (!metadata.includes('latest-mac.yml')) fail('electron-builder wrote no latest-mac.yml; the Update Check would find nothing');

  rmSync(collectedDir, { recursive: true, force: true });
  mkdirSync(collectedDir, { recursive: true });
  const checksums = [];
  for (const name of [...wanted, ...metadata, ...blockmaps]) {
    execFileSync('cp', ['-c', path.join(releaseOutput, name), path.join(collectedDir, name)]);
    if (wanted.includes(name)) checksums.push({ name, sha256: await sha256(path.join(collectedDir, name)) });
  }
  const checksumText = renderChecksums(checksums);
  writeFileSync(path.join(collectedDir, 'SHA256SUMS'), checksumText);
  writeFileSync(path.join(collectedDir, 'RELEASE_NOTES.md'), renderReleaseNotes({ version, checksums: checksumText }));

  if (!options.skipLinux) {
    const aur = {
      version,
      tarballSha256: checksums.find((entry) => entry.name === RELEASE_ARTIFACTS.linuxTarball).sha256,
      iconSha256: await sha256(path.join(buildRoot, 'assets', 'app-icon.png')),
      mimeSha256: await sha256(path.join(buildRoot, 'linux', 'nex-note.xml')),
    };
    const aurDir = path.join(collectedDir, 'aur');
    mkdirSync(aurDir, { recursive: true });
    writeFileSync(path.join(aurDir, 'PKGBUILD'), renderPkgbuild(aur));
    writeFileSync(path.join(aurDir, '.SRCINFO'), renderSrcinfo(aur));
  }
  return [...wanted, ...metadata, ...blockmaps, 'SHA256SUMS'];
}

// ── Publish ───────────────────────────────────────────────────────────────

function publish({ version, tag, releaseCommit, assets }) {
  log(`Publishing ${tag}`);
  // 1. The tag alone does not deploy anything.
  run('git', ['tag', '-a', tag, releaseCommit, '-m', `Nex Note ${version} (Public Beta)`], { cwd: root });
  run('git', ['push', 'origin', `refs/tags/${tag}`], { cwd: root });
  // 2. Draft, upload, then publish, so a half-uploaded Release is never "latest".
  run('gh', ['release', 'create', tag, '--repo', repoSlug, '--draft', '--title', `Nex Note ${version} (Public Beta)`,
    '--notes-file', path.join(collectedDir, 'RELEASE_NOTES.md'), '--verify-tag'], { cwd: root });
  run('gh', ['release', 'upload', tag, '--repo', repoSlug, '--clobber', ...assets.map((name) => path.join(collectedDir, name))], { cwd: root });
  run('gh', ['release', 'edit', tag, '--repo', repoSlug, '--draft=false', '--latest'], { cwd: root });
  // 3. Moving main deploys nex-note.com, whose buttons now resolve to this Release.
  run('git', ['push', 'origin', `${releaseCommit}:refs/heads/main`], { cwd: root });
}

function startNextDevelVersion({ version, releaseCommit }) {
  const next = nextDevelVersion(version);
  log(`Moving devel to ${next}`);
  run('git', ['merge', '--ff-only', releaseCommit], { cwd: root });
  writeJsonVersion(path.join(root, 'package.json'), next);
  writeJsonVersion(path.join(root, 'package-lock.json'), next);
  run('git', ['add', 'package.json', 'package-lock.json'], { cwd: root });
  execFileSync('git', ['commit', '--no-verify', '-m', `Start ${next} on devel`], {
    cwd: root,
    stdio: 'inherit',
    env: { ...process.env, NEX_NOTE_SKIP_POST_COMMIT_BUILD: '1' },
  });
  run('git', ['push', 'origin', 'devel'], { cwd: root });
}

function publishAur(version) {
  const aurClone = process.env.NEX_NOTE_AUR_CLONE;
  const aurDir = path.join(collectedDir, 'aur');
  if (!aurClone) {
    console.log(`\nOmarchy Package: PKGBUILD and .SRCINFO are in ${aurDir}.`);
    console.log(`Set NEX_NOTE_AUR_CLONE to a clone of ssh://aur@aur.archlinux.org/${AUR_PACKAGE}.git to publish it from here.`);
    return;
  }
  log(`Updating the ${AUR_PACKAGE} AUR package`);
  for (const name of ['PKGBUILD', '.SRCINFO']) execFileSync('cp', [path.join(aurDir, name), path.join(aurClone, name)]);
  run('git', ['add', 'PKGBUILD', '.SRCINFO'], { cwd: aurClone });
  run('git', ['commit', '-m', `Update to ${version}`], { cwd: aurClone });
  run('git', ['push', 'origin', 'HEAD:master'], { cwd: aurClone });
}

// ── Main ──────────────────────────────────────────────────────────────────

const { version, tag, develHead } = preflight();
console.log(`\nRelease ${version} from devel@${develHead.slice(0, 8)}${options.buildOnly ? ' (build only)' : options.dryRun ? ' (dry run)' : ''}.`);

prepareCheckout(develHead);
const releaseCommit = options.buildOnly ? develHead : createReleaseCommit(version);
await buildRelease(version);
verifyMacRelease(releaseCommit);
const assets = await collectArtifacts(version);

console.log(`\nArtifacts in ${collectedDir}:`);
for (const name of assets) console.log(`  ${name}`);

if (options.buildOnly || options.dryRun) {
  console.log(`\nNothing was pushed or published. The Release commit ${options.dryRun ? releaseCommit.slice(0, 8) + ' exists only in the build checkout' : 'was not created'}.`);
  process.exit(0);
}

// The build takes about an hour. If main or devel moved on origin meanwhile, main could not be
// fast-forwarded to the Release commit after the Release is already public, so stop here instead.
function assertBranchesStillFastForward(releaseCommit) {
  git(['fetch', '--quiet', 'origin', 'main', 'devel']);
  for (const branch of ['main', 'devel']) {
    if (tryGit(['merge-base', '--is-ancestor', `origin/${branch}`, releaseCommit]) === null) {
      fail(`origin/${branch} moved while the Release was built; nothing was published. Run npm run ship again.`);
    }
  }
}

assertBranchesStillFastForward(releaseCommit);
if (!await confirm(`Publish ${tag}: push the tag, create the GitHub Release, move main (deploys nex-note.com) and bump devel?`)) {
  console.log('Stopped before publishing. Run npm run ship again to start over.');
  process.exit(0);
}
assertBranchesStillFastForward(releaseCommit);
publish({ version, tag, releaseCommit, assets });
startNextDevelVersion({ version, releaseCommit });
publishAur(version);
console.log(`\nReleased Nex Note ${version}: https://github.com/${repoSlug}/releases/tag/${tag}`);
