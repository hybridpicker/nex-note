import test from 'node:test';
import assert from 'node:assert/strict';

import {
  buildAppSurfacePlan,
  classifyAppSurfaces,
} from '../scripts/app-surface-plan.mjs';

test('shared UI changes affect every current and planned app surface', () => {
  const result = classifyAppSurfaces(['components/ScoreEditor.tsx']);

  assert.equal(result.shared, true);
  assert.equal(result.web, true);
  assert.equal(result.electron, true);
  assert.equal(result.ipad, true);
  assert.equal(result.macosXcode, true);
  assert.match(buildAppSurfacePlan(result).join('\n'), /planned but not implemented/);
});

test('iOS-only changes do not force unrelated Electron packaging', () => {
  const result = classifyAppSurfaces(['ios/App/App/Info.plist']);

  assert.equal(result.shared, false);
  assert.equal(result.ipad, true);
  assert.equal(result.electron, false);
  assert.equal(result.macosXcode, false);
});

test('documentation-only changes do not require application rebuilds', () => {
  const result = classifyAppSurfaces([
    'README.md',
    'docs/multi-app-development-flow.md',
  ]);
  const plan = buildAppSurfacePlan(result).join('\n');

  assert.equal(result.docsOnly, true);
  assert.match(plan, /Documentation-only/);
  assert.doesNotMatch(plan, /npm run build/);
});

test('the latest-DMG builder counts as Electron packaging', () => {
  const result = classifyAppSurfaces(['scripts/build-latest-dmg.mjs']);

  assert.equal(result.electron, true);
  assert.equal(result.shared, false);
  assert.equal(result.ipad, false);
});

test('active Xcode macOS workflow replaces the planned-state reminder', () => {
  const result = classifyAppSurfaces(['lib/ai-providers.ts'], {
    macosXcodeAvailable: true,
  });
  const plan = buildAppSurfacePlan(result).join('\n');

  assert.match(plan, /run the macos sync\/doctor\/build\/smoke workflow/);
  assert.doesNotMatch(plan, /planned but not implemented/);
});

