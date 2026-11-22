import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import {
  ALL_RELEASES_URL,
  LINUX_APPIMAGE_URL,
  OMARCHY_INSTALL_COMMAND,
  RELEASE_DMG_URL,
  RELEASE_LINKS,
  RELEASE_VERSION,
} from '../lib/site/release-links.ts';

test('release version follows package.json', () => {
  const pkg = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8'));
  assert.equal(RELEASE_VERSION, pkg.version);
  assert.equal(RELEASE_LINKS.version, pkg.version);
});

test('download links use the stable GitHub latest-release redirects', () => {
  assert.equal(RELEASE_DMG_URL, 'https://github.com/hybridpicker/nex-note/releases/latest/download/Nex-Note-mac-universal.dmg');
  assert.equal(LINUX_APPIMAGE_URL, 'https://github.com/hybridpicker/nex-note/releases/latest/download/Nex-Note-linux-x86_64.AppImage');
  assert.equal(ALL_RELEASES_URL, 'https://github.com/hybridpicker/nex-note/releases/latest');
  assert.equal(OMARCHY_INSTALL_COMMAND, 'yay -S nex-note-bin');
});
