# Nex Note Repository Instructions

## Multi-app development invariant

Nex Note has one shared product core and multiple application surfaces:

1. the Next.js web/development surface;
2. the existing Electron macOS app and the Electron Linux app (Omarchy;
   `linux/`, `docs/linux-pro-roadmap.md`);
3. the native Capacitor iPad app;
4. the planned Xcode macOS app described in
   `docs/macos-xcode-private-testing-prompt.md`.

The iPad app and the Xcode macOS app are native test shells, not PWAs. Do not
replace a native app workflow with a PWA, Safari installation, or home-screen
shortcut.

Changes to shared UI, score editing, rendering, AI, import/export, server routes,
configuration, dependencies, or assets must be evaluated for every application
surface. Do not silently validate only the browser when shared product behavior
changed.

## Required workflow

Before programming:

1. Run `npm run apps:plan` to identify affected application surfaces.
2. Inspect `git status` and preserve unrelated changes.
3. Read `docs/multi-app-development-flow.md` when changing application shells,
   build scripts, native configuration, provider access, or shared UI.

During programming:

1. Keep product behavior in the shared Next.js/React/core implementation unless
   a capability genuinely requires native code.
2. Keep API keys and provider secrets on the Mac/server side. Never place them
   in the iOS bundle, generated web assets, Xcode project, source control, or
   logs.
3. Preserve the native `NexNoteNative/<version>` user-agent path when native
   shells need local AI routes over a LAN.
4. Update tests and the relevant app documentation in the same change.
5. Re-run `npm run apps:plan` if the scope expands into another surface.

Before handoff:

1. Run focused tests while iterating.
2. For shared runtime changes, run `npm test` and `npm run build`.
3. For Electron/macOS behavior or packaging changes, run the relevant Electron
   tests and `npm run electron:refresh` (the Developer App "Nex Note Dev").
   `npm run dmg:latest` builds a Developer DMG of the latest commit outside
   the working tree and is safe while another session is working. Public
   Releases are built only by `npm run release:build` / `npm run ship`
   (`electron-builder.release.cjs`); keep it in step with `package.json`'s
   `build`.
4. For shared user-visible, native-access, dependency, or iPad changes, run
   `npm run ipad:sync` and `npm run ipad:doctor`. When a paired iPad is
   available, launch it and smoke-test the affected flow on the physical device.
5. Once the Xcode macOS target exists, run its `macos:sync`, `macos:doctor`,
   command-line Xcode build, and real app smoke test for every affected shared
   runtime change.
6. Run `git diff --check`.
7. Report which surfaces were verified and explicitly name any surface that
   could not be run, with the reason.

Documentation-only work does not require rebuilding every app. Native-only work
does not require unrelated release packaging. Validation should be proportional,
but an affected surface must never be omitted without explanation.

## Current source of truth

- Cross-app workflow: `docs/multi-app-development-flow.md`
- Electron/macOS workflow: `README.md` under “macOS Desktop App”
- Native iPad workflow: `docs/ipad-private-testing.md`
- Public Beta Releases (signing, `npm run ship`, Release vs. Developer App):
  `docs/release.md`; vocabulary in `GLOSSARY.md`, decisions in `docs/adr/`
- Public website (nex-note.com): `docs/website.md`
- Planned Xcode macOS implementation:
  `docs/macos-xcode-private-testing-prompt.md`

