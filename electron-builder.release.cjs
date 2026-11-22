// electron-builder configuration for a Release (the Public Beta "Nex Note").
// The `build` key in package.json describes the Developer App ("Nex Note Dev"); this file overrides
// the identity, signing, notarization, targets and publishing for Releases. Used only by
// scripts/ship-release.mjs. See docs/release.md and docs/adr/0002-release-builds-signed-locally.md.

const base = require('./package.json').build;

/** @type {import('electron-builder').Configuration} */
module.exports = {
  ...base,
  appId: 'app.nex-note.desktop',
  // The AppImage tool reads `ext` only as a string, so every extension gets its own entry.
  fileAssociations: base.fileAssociations.flatMap(({ ext, ...rest }) =>
    (Array.isArray(ext) ? ext : [ext]).map((single) => ({ ...rest, ext: single }))),
  productName: 'Nex Note',
  directories: { output: 'dist/release' },
  // The standalone server traces sharp's native binary for the build Mac only. A universal app
  // cannot carry one single-arch binary, and Linux cannot load it; sharp falls back to its
  // bundled WebAssembly build (@img/sharp-wasm32) on every platform instead.
  files: [
    ...base.files,
    '!.next/standalone/node_modules/@img/sharp-darwin-*/**',
    '!.next/standalone/node_modules/@img/sharp-libvips-*/**',
    '!.next/standalone/node_modules/@img/sharp-linux*/**',
  ],
  mac: {
    ...base.mac,
    // Let electron-builder find the "Developer ID Application" identity in the login keychain
    // (CSC_NAME can pin one). Signing is required: a Release is never unsigned.
    identity: undefined,
    hardenedRuntime: true,
    gatekeeperAssess: false,
    entitlements: 'packaging/macos/entitlements.mac.plist',
    entitlementsInherit: 'packaging/macos/entitlements.mac.plist',
    // Credentials come from a notarytool keychain profile (APPLE_KEYCHAIN_PROFILE), never from files.
    notarize: true,
    minimumSystemVersion: '12.0',
    target: [
      { target: 'dmg', arch: ['universal'] },
      { target: 'zip', arch: ['universal'] },
    ],
    artifactName: 'Nex-Note-mac-${arch}.${ext}',
  },
  dmg: {
    artifactName: 'Nex-Note-mac-${arch}.${ext}',
  },
  linux: {
    ...base.linux,
    executableName: 'nex-note',
    desktop: { entry: { ...base.linux.desktop.entry, StartupWMClass: 'nex-note' } },
    // AppImage for every distribution; the tarball feeds the Omarchy Package (packaging/aur).
    target: [
      { target: 'AppImage', arch: ['x64'] },
      { target: 'tar.gz', arch: ['x64'] },
    ],
    artifactName: 'Nex-Note-linux-x86_64.${ext}',
  },
  publish: [{ provider: 'github', owner: 'hybridpicker', repo: 'nex-note', releaseType: 'release' }],
};
