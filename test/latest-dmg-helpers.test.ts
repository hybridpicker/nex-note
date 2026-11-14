import test from 'node:test';
import assert from 'node:assert/strict';

import {
  LATEST_DMG_NAME,
  dmgFileName,
  isManifestCurrent,
  parseLatestDmgArgs,
  sanitizeLabel,
  updateBuildHistory,
} from '../scripts/latest-dmg-helpers.mjs';

const commitA = 'a'.repeat(40);
const commitB = 'b'.repeat(40);
const commitC = 'c'.repeat(40);

test('the DMG name carries version, branch and short commit', () => {
  assert.equal(
    dmgFileName({ version: '0.0.7', branch: 'devel', commit: '80db9dc1ffffffff', arch: 'arm64' }),
    'Nex Note-0.0.7-devel-80db9dc1-arm64.dmg',
  );
});

test('branch names become safe file name parts', () => {
  assert.equal(sanitizeLabel('feature/new keys'), 'feature-new-keys');
  assert.equal(sanitizeLabel(''), 'detached');
  assert.equal(sanitizeLabel('../..'), '..-..');
  assert.doesNotMatch(dmgFileName({ version: '1', branch: 'a/b', commit: commitA, arch: 'arm64' }), /\//);
});

test('arguments are parsed and bad ones are rejected', () => {
  assert.deepEqual(parseLatestDmgArgs([]), {
    ref: 'HEAD', force: false, background: false, keep: 3, keepWorktree: false,
  });
  assert.equal(parseLatestDmgArgs(['--ref', 'main']).ref, 'main');
  assert.equal(parseLatestDmgArgs(['--keep', '5', '--force']).keep, 5);
  assert.throws(() => parseLatestDmgArgs(['--keep', '0']), /--keep/);
  assert.throws(() => parseLatestDmgArgs(['--ref']), /--ref/);
  assert.throws(() => parseLatestDmgArgs(['--nope']), /unknown option/);
});

test('a manifest is current only for the same commit with both files present', () => {
  const manifest = { commit: commitA, dmg: 'a.dmg' };
  assert.equal(isManifestCurrent(manifest, { commit: commitA, existingFiles: ['a.dmg', LATEST_DMG_NAME] }), true);
  assert.equal(isManifestCurrent(manifest, { commit: commitB, existingFiles: ['a.dmg', LATEST_DMG_NAME] }), false);
  assert.equal(isManifestCurrent(manifest, { commit: commitA, existingFiles: ['a.dmg'] }), false);
  assert.equal(isManifestCurrent(null, { commit: commitA, existingFiles: [] }), false);
});

test('the history keeps the newest builds and names the files to delete', () => {
  const previous = [
    { commit: commitB, dmg: 'b.dmg' },
    { commit: commitA, dmg: 'a.dmg' },
  ];
  const { builds, pruned } = updateBuildHistory(previous, { commit: commitC, dmg: 'c.dmg' }, 2);
  assert.deepEqual(builds.map((build) => build.dmg), ['c.dmg', 'b.dmg']);
  assert.deepEqual(pruned, ['a.dmg']);
});

test('rebuilding a commit replaces its entry without deleting its file', () => {
  const previous = [{ commit: commitA, dmg: 'a.dmg' }];
  const { builds, pruned } = updateBuildHistory(previous, { commit: commitA, dmg: 'a.dmg' }, 1);
  assert.equal(builds.length, 1);
  assert.deepEqual(pruned, []);
});
