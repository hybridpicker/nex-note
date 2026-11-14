# Multi-app development flow

Nex Note uses a shared Next.js, React, semantic score, and server implementation
across multiple app surfaces. A change is complete only when every affected
surface is considered and the appropriate validation has been run.

## Application surfaces

| Surface | Current role | Development command | Update model |
| --- | --- | --- | --- |
| Next.js | Shared UI, product core, and server routes | `npm run dev` | Fast Refresh |
| Electron macOS | Existing local packaged Mac app | `npm run app` | Verified rebuild from the current local `devel` worktree |
| Electron Linux | Omarchy/Hyprland desktop app (`dist/linux`) | `./linux/install.sh` | Rebuild and reinstall from the worktree (`./linux/update.sh` pulls first) |
| Native iPad | Private signed standalone iPad app | `npm run ipad:sync`; optional `npm run ipad:dev` | Bundled editor for normal installs; Fast Refresh in explicit live mode |
| Xcode macOS | Planned private native Mac test app | See `macos-xcode-private-testing-prompt.md` | Must adopt the same Fast Refresh plus native rebuild split |

The native apps are not PWAs. Shared code should remain shared rather than being
copied into platform-specific forks.

## Start every programming task

Run:

```bash
npm run apps:plan
```

The planner reads the current worktree and reports which surfaces are affected,
which commands are required, and whether the Xcode macOS surface exists yet.
Run it again if the task grows into new files or platforms.

The repository's installable pre-commit hook also prints this plan before its
existing notation-tool checks. Install or refresh the tracked hooks with:

```bash
npm run hooks:install
```

## Change-to-surface matrix

| Change | Required surfaces |
| --- | --- |
| React components, global CSS, score editor, hooks, semantic core, shared assets | Next.js, Electron macOS, iPad, and Xcode macOS once implemented |
| Next.js API, AI providers, import/export, MIDI, conversion | Next.js plus every app that calls the changed route |
| Electron main process, packaging, updater, file associations | Electron macOS |
| Capacitor config, iOS project, native bootstrap, app icon, native dependency | Native iPad |
| Xcode macOS target, Swift shell, entitlements, signing | Xcode macOS |
| Documentation only | Documentation rendering and link checks |

## Validation levels

### Shared runtime change

Minimum handoff validation:

```bash
npm test
npm run build
npm run ipad:sync
npm run ipad:doctor
git diff --check
```

Also refresh the packaged Mac app with `npm run electron:refresh` when the change
affects the visible desktop product, packaged server, dependencies, assets, file
handling, or Electron integration. Use `npm run app` when the rebuilt app should
be opened immediately.

If a paired iPad is available and the change affects UI, touch, notation input,
native permissions, AI access, files, audio, orientation, or safe areas, launch
the physical app and smoke-test that flow.

### Electron-only change

Run focused Electron tests, then:

```bash
npm run electron:refresh
npm run electron:verify
```

For release-oriented DMG and ZIP output, use `npm run electron:build`.

For a DMG of the latest commit that ignores uncommitted work, use
`npm run dmg:latest` (output: `dist/dmg/Nex Note-latest.dmg`). The tracked
post-commit hook runs it in the background after every commit; see
`development.md` under “Always-current DMG”.

### iPad native change

Run:

```bash
npm run ipad:sync
npm run ipad:doctor
```

Then perform an Xcode command-line/device build and a physical-device smoke test
when the paired device and signing identity are available. Shared React/CSS code
is included in the standalone payload by `npm run ipad:sync`. It does not need a
native rebuild while `npm run ipad:dev` is running; Capacitor packages,
plist/configuration, icons, signing, and Swift changes do.

### Xcode macOS change

The target is not present yet. Its implementation contract is in
`macos-xcode-private-testing-prompt.md`. When it is created, it must add and
document `macos:init`, `macos:sync`, `macos:dev`, `macos:doctor`,
`macos:open`, and—where safe—`macos:install`. The cross-app planner must then
detect it as active rather than planned.

## AI and secret handling

Ollama and cloud-provider keys stay in the Mac development server environment
or ignored local configuration. The standalone iPad editor works without these
routes; AI and conversion features require the explicit Mac-backed live mode.
Native live requests identify themselves with the
`NexNoteNative/<version>` user-agent. Do not duplicate a key into native local
storage merely to make an app shell work.

For native AI changes, verify all three properties:

1. the native request is accepted;
2. provider authentication/model discovery succeeds;
3. a generic LAN/public browser remains disabled unless explicitly enabled.

Never print complete keys or place them in build products.

## Handoff checklist

Every programming handoff should state:

- affected surfaces;
- tests and builds that passed;
- physical/native smoke tests performed;
- whether Fast Refresh or a native rebuild delivered the change;
- surfaces not run and the exact reason;
- documentation updated for changed workflows.
