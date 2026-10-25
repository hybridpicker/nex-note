# Prompt: Native macOS Xcode private-testing app

Work in the existing nex-note repository checkout on
the current `devel` branch. Build a private, native macOS test app in Xcode for
the existing Nex Note application. This is not a PWA and must not replace,
remove, or break the existing Electron app while the Xcode variant is still
being evaluated.

Start by reading the repository instructions and inspecting the existing
Electron, Next.js, Capacitor iPad, signing, live-development, and latest-devel
workflows. Preserve unrelated and pre-existing worktree changes. Use English
for source code, identifiers, comments, tests, and technical documentation.

## Goal

Create an Xcode-managed macOS app that:

- runs as a real signed `.app` bundle for private testing;
- presents the current Nex Note interface in a native macOS window;
- always uses the latest saved local `devel` source during development;
- receives web-code changes through Next.js Fast Refresh without rebuilding the
  native shell;
- has an explicit sync/build/install path for native-shell changes;
- can be launched and tested locally without App Store distribution;
- keeps the current Electron application fully functional as a fallback;
- reuses the same local server-side Ollama/API configuration without embedding
  secrets in JavaScript, generated assets, source control, or the app bundle.

## Architecture

First determine the smallest reliable architecture for this repository. Prefer
a thin Swift/SwiftUI macOS shell with `WKWebView` that loads the local Nex Note
development URL, unless an existing supported Xcode target can be reused
cleanly. Do not add a PWA, browser shortcut, or website wrapper installed
through Safari.

The native shell should:

- use bundle identifier `app.nexnote.macos` unless the existing signing setup
  requires a safer non-conflicting identifier;
- use the existing Nex Note icon and product name;
- load `http://127.0.0.1:3000/nex-note-app/` in private live-development mode;
- use an app-specific user-agent suffix such as
  `NexNoteNative/0.0.7`, derived from `package.json`;
- show a friendly native connection screen when the local development server
  is unavailable and retry automatically;
- allow microphone access, local networking, file import/export, downloads,
  keyboard shortcuts, copy/paste, printing, and links in a macOS-appropriate
  way;
- size the initial window sensibly for a notation editor and remember window
  size where appropriate;
- use standard macOS title-bar, full-screen, resize, minimize, and close
  behavior;
- avoid exposing development badges or the Next.js `N` indicator;
- preserve the existing Nex Note responsive layout and notation behavior.

## Automatic latest-devel workflow

Implement and document commands analogous to the iPad workflow:

- `npm run macos:init`
- `npm run macos:sync`
- `npm run macos:dev`
- `npm run macos:doctor`
- `npm run macos:open`
- `npm run macos:install` if a safe automated local install is practical

`npm run macos:dev` should:

1. verify Node, dependencies, full Xcode, free disk space, the Xcode project,
   signing readiness, and the expected `devel` worktree;
2. synchronize generated native configuration without overwriting manual Xcode
   changes;
3. start or reuse the Nex Note Next.js development server on localhost;
4. preserve the current shell environment so the already configured
   server-side Ollama/API access remains available;
5. wait until `/nex-note-app/` is reachable;
6. build and launch the Xcode macOS app when needed;
7. keep the server process alive and print the exact current URL and state;
8. provide Fast Refresh for saved web changes;
9. cleanly stop child processes on exit without terminating unrelated servers.

Do not hard-code API keys, signing certificates, passwords, the user home
directory, or volatile device-specific paths. If local signing metadata is
needed, keep it in a clearly documented ignored local configuration file or
detect it from Xcode. Never print secret values.

## AI and Ollama

Reuse the existing Next.js server-side provider flow. Confirm that:

- the macOS native user-agent is accepted by the existing native AI access
  check, or update that check narrowly with tests;
- Ollama model discovery works from the macOS Xcode app;
- a real minimal provider request reaches the configured Ollama endpoint;
- the key remains on the Mac/server side and is absent from the Xcode project,
  compiled resources, generated web assets, logs, and Git diff;
- generic LAN/public browser requests remain disabled unless explicitly
  enabled.

## Quality and safety requirements

- Inspect `git status` before editing and preserve unrelated changes.
- Reuse existing scripts, helpers, icons, test patterns, and documentation.
- Keep generated artifacts and DerivedData out of Git.
- Make setup scripts idempotent.
- Do not delete or migrate the Electron workflow.
- Add focused unit tests for URL selection, environment handling, native
  user-agent detection, process reuse, and doctor output.
- Run the relevant unit tests, `npm run build`, `git diff --check`, the macOS
  doctor, and an Xcode command-line build.
- Launch the signed app and perform a real smoke test: welcome screen, New
  Score, score rendering, note input, keyboard shortcut, resize, full screen,
  Ollama model discovery, and relaunch.
- Confirm that a saved web-code change appears in the running Xcode app without
  rebuilding the native target.
- Report any remaining limitation rather than hiding it.

## Completion report

At the end, provide:

- the chosen architecture and why it fits this repository;
- the exact files and scripts added or changed;
- the exact one-command daily development workflow;
- how native changes differ from web-code Fast Refresh;
- signing and installation status;
- Ollama/API verification without revealing keys;
- all test/build/smoke-test results;
- any manual step still required;
- confirmation that the existing Electron app remains intact.

Continue iteratively until the signed Xcode app is running successfully and the
latest-devel workflow has been demonstrated. Do not stop after merely creating
an Xcode project or showing that it compiles.
