// Which desktop app this build is: a Release (the Public Beta "Nex Note", updated from GitHub
// Releases) or the Developer App ("Nex Note Dev", rebuilt from the local `devel` checkout).
// See GLOSSARY.md. The channel is stamped into `nex-note-build.json` at build time by
// scripts/sync-standalone-assets.mjs (NEX_NOTE_RELEASE_CHANNEL=release for Releases).

const fs = require('node:fs');
const path = require('node:path');

const RELEASE_CHANNEL = 'release';
const DEVELOPER_CHANNEL = 'developer';

const APP_NAMES = Object.freeze({
  [RELEASE_CHANNEL]: 'Nex Note',
  [DEVELOPER_CHANNEL]: 'Nex Note Dev',
});

// Chromium writes these per process; copying them would carry stale locks or caches.
const USER_DATA_COPY_EXCLUDES = new Set([
  'SingletonLock',
  'SingletonCookie',
  'SingletonSocket',
  'Cache',
  'Code Cache',
  'GPUCache',
  'DawnCache',
  'DawnGraphiteCache',
  'DawnWebGPUCache',
  'GrShaderCache',
  'ShaderCache',
  'Crashpad',
  'logs',
  // Encrypted with the other app's keychain entry; unreadable here. Keys migrate from localStorage instead.
  'ai-provider-keys.json',
]);

function normalizeChannel(value) {
  return value === RELEASE_CHANNEL ? RELEASE_CHANNEL : DEVELOPER_CHANNEL;
}

function readBuildInfoSync(appPath, fileSystem = fs) {
  try {
    const raw = fileSystem.readFileSync(path.join(appPath, '.next', 'standalone', 'nex-note-build.json'), 'utf8');
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

// Unpackaged runs (electron:dev) and every build without a stamp count as the Developer App, so a
// Release can only come from the release pipeline.
function resolveChannel({ isPackaged, buildInfo }) {
  if (!isPackaged) return DEVELOPER_CHANNEL;
  return normalizeChannel(buildInfo?.channel);
}

function appNameForChannel(channel) {
  return APP_NAMES[normalizeChannel(channel)];
}

// Before the Developer App had its own name it used "Nex Note"'s user data. On its first start the
// Developer App copies that folder once, so the owner's library and settings carry over; the
// original stays in place for the Public Beta.
function migrateDeveloperUserData({ appDataPath, channel, fileSystem = fs }) {
  if (normalizeChannel(channel) !== DEVELOPER_CHANNEL) return { migrated: false, reason: 'not-developer' };
  const source = path.join(appDataPath, APP_NAMES[RELEASE_CHANNEL]);
  const target = path.join(appDataPath, APP_NAMES[DEVELOPER_CHANNEL]);
  if (fileSystem.existsSync(target)) return { migrated: false, reason: 'target-exists' };
  if (!fileSystem.existsSync(source)) return { migrated: false, reason: 'no-source' };
  fileSystem.cpSync(source, target, {
    recursive: true,
    errorOnExist: false,
    filter: (entry) => !USER_DATA_COPY_EXCLUDES.has(path.basename(entry)),
  });
  return { migrated: true, reason: 'copied' };
}

module.exports = {
  APP_NAMES,
  DEVELOPER_CHANNEL,
  RELEASE_CHANNEL,
  appNameForChannel,
  migrateDeveloperUserData,
  normalizeChannel,
  readBuildInfoSync,
  resolveChannel,
};
