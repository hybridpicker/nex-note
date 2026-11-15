# Development Guide

This guide collects the setup, configuration, app-shell, and validation details for working on nex-note. The [README](../README.md) gives the short overview.

## Configuration

Copy `.env.local.example` to `.env.local` and fill only the providers you use.

| Variable | Purpose |
| --- | --- |
| `OLLAMA_API_KEY` | Optional Ollama Cloud key; leave empty for local Ollama at `http://localhost:11434`. |
| `OPENAI_API_KEY` | OpenAI API key, consumed only by the server-side provider adapter. |
| `OPENAI_MODEL` | Optional server-side OpenAI model override; defaults to `gpt-5.6-sol`. |
| `ANTHROPIC_API_KEY` | Claude provider key. |
| `CLAUDE_MODEL` | Claude model override. |
| `GEMINI_API_KEY` | Gemini provider key. |
| `PDF_TO_MUSESCORE_SCRIPT` | Custom PDF-to-MuseScore conversion script path. |
| `MUSESCORE_CLI` | Custom MuseScore CLI path. |
| `NEXT_PUBLIC_NEX_NOTE_EMBED_DATA_ENDPOINT` | Optional same-origin embed data endpoint. Supports `{entry}` or `{entryId}` placeholders. |
| `NEX_NOTE_ENABLE_LOCAL_AGENT` | Set to `true` to enable the localhost-only semantic agent interface. |
| `NEX_NOTE_AGENT_SECRET` | Long per-session bearer secret required by the local agent interface. |

Restart the dev server after editing `.env.local`; Next.js reads env vars at startup.

The app opening screen includes an AI readiness panel. It checks local Ollama model discovery, shows whether Claude or Gemini keys are saved in local AI settings, and keeps local helper workflows visible even when no provider is connected.

OpenAI uses the official JavaScript/TypeScript SDK and Responses API. The model is configurable in AI settings, including custom model IDs; `OPENAI_MODEL` is an optional server-side override. The current instruction, compact score/selection context, and recent assistant context are sent to the provider. Output is still untrusted: nex-note repairs and validates it as `ScoreCommand` data and preserves its normal preview, confirmation, validator, semantic-execution, and undo workflow. OpenAI has no raw MusicXML mutation route.

## Local Codex/Agent Interface

The current foundation is an authenticated localhost HTTP tool service at `/api/local-agent`; it is not yet a production-ready MCP server. Enable it locally with `NEX_NOTE_ENABLE_LOCAL_AGENT=true` and a long random `NEX_NOTE_AGENT_SECRET`.

Calls use `Authorization: Bearer <secret>` and JSON containing `tool`, the live `scoreKey`, and tool `arguments`. Tools are `get_score_summary`, `get_selection`, `validate_score`, `plan_score_commands`, `preview_score_commands`, `apply_score_preview`, `discard_score_preview`, and `export_score`.

The interface is disabled unless explicitly enabled, accepts only localhost hostnames, uses five-minute one-use preview IDs, rejects stale revisions, and permits exports only to `.nex/agent-exports` with safe basenames. It exposes no shell, URL fetch, arbitrary read/write, XML patch, or unrestricted path tool. Workflow: inspect score → inspect selection → plan → preview → user confirms → apply → validate → export.

Known limitation: agent apply currently updates the server-side live score session and its server undo availability, but does not push that update into an already-open browser tab's React undo stack. MCP transport and browser/desktop event synchronization remain follow-up work.

## Iframe Embedding

nex-note can boot directly inside a host iframe and fetch score data from the same browser origin:

```html
<iframe src="/nex-note-app/?embed=1&entry=score-123"></iframe>
```

The embed data endpoint must return JSON:

```json
{ "success": true, "xml": "<score-partwise ...", "filename": "score.musicxml" }
```

By default, nex-note requests `/api/nex-note/score-data?entry=<entry>`. Hosts can override this per iframe:

```html
<iframe src="/nex-note-app/?embed=1&entry=score-123&scoreDataUrl=/api/scores/{entry}/nex-note-data"></iframe>
```

For score-only embeds, add `chrome=0`:

```html
<iframe src="/nex-note-app/?embed=1&chrome=0&entry=score-123&scoreDataUrl=/api/scores/{entry}/nex-note-data"></iframe>
```

`chrome=0` hides the full nex-note app chrome and renders only the score. During embed startup, nex-note shows a minimal loading bar instead of the normal app index or welcome UI.

Supported endpoint query parameters are `scoreDataUrl`, `scoreDataEndpoint`, `dataUrl`, `dataEndpoint`, and `endpoint`. The legacy `jarvisEmbed=1&entry=<entry>` URL remains supported and uses `/api/guitar-mentor/knowledge/<entry>/nex-note-data/`.

Embed startup loads MusicXML into the editor first. Playback and `/api/midi` generation are not required for initial rendering.

## macOS Desktop App

Development shell:

```bash
npm run electron:dev
```

Build, verify, and open the local macOS app from the current `devel` worktree:

```bash
npm run app
```

This is the normal packaged-app test workflow. It runs the test suite, creates a production Next.js build, refreshes only the `.app` bundle at `dist/macos/mac-arm64/Nex Note.app`, verifies that the embedded source fingerprint matches the current local worktree, and opens that exact bundle. Committed, staged, unstaged, and untracked local source changes are included. If the source changes while the tests or build are running, the refresh fails instead of stamping a mixed build as current.

Opening the repo-local `.app` from Finder performs the same fingerprint check before the product window opens. A stale or legacy bundle shows a refresh window, runs the guarded local workflow, and restarts into the verified build. The refresh log is stored at `.nex/electron-local-refresh.log`.

The packaged app starts its embedded Next.js server as an Electron utility process. On macOS this server remains part of Nex Note and must not appear as a second generic `exec` application or Dock item. The development command `npm run electron:dev` remains attached to its launching terminal so that development logs stay visible.

For a refresh without opening the app:

```bash
npm run electron:refresh
```

`npm run electron:latest` remains available when you explicitly want to fetch and fast-forward to the latest pushed `origin/devel` before running the local refresh. It requires a clean worktree. Use `npm run electron:build` only for release-oriented DMG and ZIP artifacts.

### Always-current DMG

```bash
npm run dmg:latest
```

builds a DMG from the latest **commit** (`HEAD`), not from the working tree. The commit is checked out into a temporary detached git worktree under `~/Library/Caches/nex-note/dmg-build`, built there and removed again. Uncommitted work in progress is not included, and a running dev server, test run or second coding session in the repository is not disturbed. `node_modules` is cloned copy-on-write from the repository when `package-lock.json` is unchanged; otherwise the build runs `npm ci`. No `.env*` file is copied, so provider keys never enter the image. `public/soundfonts` is copied when present.

Output in `dist/dmg/`:

| File | Content |
| --- | --- |
| `Nex Note-latest.dmg` | always the newest build |
| `Nex Note-<version>-<branch>-<commit>-<arch>.dmg` | one image per built commit; the newest three are kept (`--keep <n>`) |
| `latest.json` | version, branch, commit, build time and SHA-256 of the newest image, plus the kept history |
| `build.log` | output of background builds |

The command does nothing when the newest image already contains the commit (`--force` rebuilds). `--ref <commit|branch>` builds something other than `HEAD`. `--background` detaches the build and writes to `build.log`. Only one build runs at a time; a build that finishes re-reads the ref and builds again when new commits arrived in the meantime.

The tracked `post-commit` hook (`npm run hooks:install`) starts `npm run dmg:latest -- --background` after every commit on macOS, so `dist/dmg/Nex Note-latest.dmg` follows the branch without blocking the commit. Set `NEX_NOTE_SKIP_POST_COMMIT_BUILD=1` to skip it. The image is unsigned like every local build: on another Mac, open it with right-click → Open the first time.

### Packaged Launch Guardrails

The Electron startup path is intentionally split between the thin entrypoint at `electron/main.cjs` and testable launch helpers in `electron/launch-helpers.cjs`.

Those helpers own:

- Finder-safe child process `PATH` construction for `git`, `npm`, and the Next dev server.
- executable resolution before spawning updater commands.
- local source fingerprint comparison before packaged startup.

`electron/main.cjs` owns the packaged server lifecycle. It uses `utilityProcess.fork`, forwards server output into the Electron log, restarts the server after an unexpected exit, and terminates it when the app quits. Do not replace this with a second `process.execPath` launch in Node mode: macOS may register that executable as a separate generic `exec` application.

Local `devel` is the authority for the repo-local app; startup never fetches or merges a remote branch. The fingerprint includes `HEAD`, tracked changes, untracked files, and local environment files without storing environment-file contents in the bundle. If automated refresh fails, Nex Note reports the log path and opens the last packaged build so a test or compiler failure does not make the app unusable.

Do not move these rules back into untested inline startup code. Update `test/electron-launch-helpers.test.ts` when changing packaged launch, server lifecycle, updater, or macOS PATH behavior.

Current desktop status: useful for local testing and founder alpha builds, not yet a polished signed/notarized distribution. The current package configuration builds macOS `dmg` and `zip` artifacts with `identity: null`, so the output is unsigned/ad-hoc unless a signing identity and notarization workflow are added.

## Linux Desktop App (Omarchy / Hyprland)

The Electron app also runs as a native Linux app, tuned for tiling Wayland desktops such as Omarchy.

```bash
./linux/install.sh              # build and install to ~/.local/opt/nex-note (no root)
./linux/install.sh --no-build   # reinstall the existing dist/linux build
./linux/install.sh --uninstall  # remove app, launcher, icons and MIME entries
./linux/update.sh               # git pull, rebuild, reinstall
nex-note score.mxl              # open a file in the running instance
```

- **Window:** native Wayland (`--ozone-platform-hint=auto`), frameless and tiled; Wayland `app_id`/window class is `nex-note` for Hyprland rules (`hyprctl clients`). Set `NEX_NOTE_LINUX_FRAME=1` for a window frame. The minimum window size is 640x480 so tiles fit; in narrow windows the header stays on one line and moves provider, language and keyboard-preset controls into an overflow menu.
- **Menus and shortcuts:** the native menu bar is hidden, so the in-app File/Edit/View menus stay visible and the main process handles the file, zoom, find and command-center shortcuts itself (editing keys stay with the page). Shortcut labels show Ctrl/Alt.
- **Files:** the installer registers MIME types for `.nxn`, `.mscz`, `.mxl` and Guitar Pro; files opened from the file manager or the command line are delivered once the renderer is ready.
- **Playback samples:** `npm run soundfonts:fetch` (run by the installer) downloads the FluidR3_GM instruments (MIT, about 53 MB) into `public/soundfonts`; playback uses them first, then the remote host, then oscillator tones.
- **Export:** File > Export PDF... (Ctrl+Shift+E) writes a vector A4 PDF (tagged, fonts embedded) through Chromium `printToPDF`; File > Export All Parts (ZIP) writes one single-part MusicXML per part.
- **Notation font:** Bravura (SMuFL) is the default; View > Notation Font offers Petaluma and Gonville, applied at next start.
- **Mixer and MIDI:** the toolbar "Mixer" sets volume, mute and solo per part; the MIDI port list is re-read every 3 seconds and on window focus because Chromium does not reliably report ALSA/PipeWire hotplug.
- **AppImage (untested):** `npm run electron:build:linux:appimage`.

Roadmap, verification status and open gaps: [Linux professional-editor roadmap](./linux-pro-roadmap.md). AI provider keys stay per machine (`.env.local.example`).

## Multi-app Development

Shared Nex Note work must keep the web core, Electron macOS app, native iPad
app, and the planned Xcode macOS app aligned. Start programming tasks with:

```bash
npm run apps:plan
```

The command examines the current worktree and reports the affected app surfaces
and required validation. Shared runtime changes normally require the full test
suite and production build, an Electron refresh when desktop behavior is
affected, iPad synchronization/doctor checks, and a physical-device smoke test
when the paired iPad is available.

See [Multi-app Development Flow](./multi-app-development-flow.md) for the
change matrix, validation levels, AI-secret rules, and handoff checklist.

## Private iPad App

Nex Note includes a native Capacitor iPad shell for private physical-device
testing. It is not a PWA. A normal iPad sync bundles the shared editor into the
native app, so score editing, touch deletion, file import, and playback launch
without the Mac or a LAN connection. Server-backed AI and conversion tools stay
on the Mac and are available in the optional live-development mode.

After installing full Xcode:

```bash
npm install
npm run ipad:doctor
npm run ipad:sync
npm run ipad:open
```

Select the connected iPad, choose the personal signing team, and press Run. The
installed standalone build does not need a terminal to remain open. Use
`npm run ipad:dev` instead when Fast Refresh and Mac-hosted routes are required;
that explicit mode starts the LAN server and opens Xcode. Selected notes and
rests expose a persistent touch-sized **Delete note** action, and playback
activates the native iOS audio session plus a client-side MIDI fallback.

See [Private iPad Testing](./ipad-private-testing.md) for the one-time Xcode,
signing, Developer Mode, local-network, and troubleshooting steps.

Founder build available on request. The request path is intentionally manual until signing, notarization, and compatibility reporting are ready for broader distribution.

Founder build path:

```bash
git switch devel
npm install
npm run app
```

`npm run app` produces the verified `.app` bundle under `dist/macos`. Use `npm run electron:latest` first only when the founder build must be based on the latest pushed remote commit. Use `npm run electron:build` when you also need the macOS archive and disk-image release artifacts.

## Branch And Version Workflow

- `devel` is the active development branch for local app work, Electron/macOS packaging, and alpha hardening.
- `main` is the live website/web-alpha deployment branch for `https://nex-note.com`.
- The website deployment follows `main` automatically after each push.
- Versions use the `0.0.x` alpha series.
- The first public alpha is `0.0.1`.
- After a finished development cycle is merged from `devel` into `main`, bump to the next patch version, for example `0.0.2`.
- Keep version bumps in `package.json` and `package-lock.json` together.

Typical website deployment flow:

```bash
git switch devel
# work, test, commit
git push origin devel

git switch main
git merge --ff-only devel
git push origin main
git switch devel
```

Pushing `main` updates the website/web alpha after the next deployment run. macOS app artifacts are still built and distributed separately.

## Note Input Sources

Instrument Record (`MIC REC`, `hooks/useMicrophonePitchInput.ts`) has two input profiles. Both end in the same notation step.

- **Microphone** (default, unchanged behavior): `getUserMedia` with auto gain on, an `AnalyserNode` (fftSize 8192) polled every 46 ms on `requestAnimationFrame`, `detectPitchFromTimeDomain` (YIN over the newest 4096 samples; it used to read the oldest half, about 90 ms stale) and `MicrophoneNoteGate`. Range E2 to E6.
- **Guitar amp · USB** (`src/score-input/instrument-input-profile.ts`): for an amp such as the Spark MINI or REACTOR 50 that appears as a USB audio input. Auto gain, echo cancellation and noise suppression off; guitar notation; range B1 to E6; the input is chosen automatically when exactly one real input (not Chromium's `default`/`communications` aliases) has "Spark" in its label, otherwise by hand, and the choice is remembered in `localStorage` with the profile. Samples reach the tracker gap-free through an AudioWorklet loaded from a Blob URL (`lib/audio-sample-tap.ts`, 512-sample blocks, ScriptProcessor fallback), so detection does not depend on `requestAnimationFrame`. The same code serves Electron and the iPad WKWebView; no native code is involved. The Electron permission handler already allows audio-only media requests and needed no change.
- **`GuitarNoteTracker`** (`src/score-input/guitar-note-tracker.ts`, pure, tested with synthetic signals in `test/guitar-note-tracker.test.ts`): takes the ideas of AmpBench's tuner tracker without its tuning parts (no smoothing, no 1.5 s hold, no phase measurement). Every 5 ms it measures the 20 ms RMS; the gate opens above −60 dBFS and closes below −66 dBFS. An attack is a rise of at least 2× over the level 25 to 80 ms earlier; only an attack writes a note, so hum that is present from the start or a slowly rising level writes nothing. After an attack 20 ms are left out. The period comes from the McLeod NSDF (autocorrelation by FFT) over two periods of 55 Hz: 1750 samples at 48 kHz and 1608 at 44.1 kHz (36 ms), against a B1 period of 778 and 714 samples. An estimate only counts once the window has searched the octave below it. Three estimates within 30 cents lock a note and write it; while it sounds, estimates an octave, twelfth or fifth away are taken for overtones until the next attack, and four agreeing estimates of another pitch are a legato note (hammer-on, pull-off, slide).
- **Strummed chords** (`src/score-input/guitar-chord-analyzer.ts`, pure, tested in `test/guitar-chord-analyzer.test.ts`): the recognition mode `Strummed chord` (`strum`, amp profile only) calls `GuitarNoteTracker.setChordDetection(true)`. An attack then starts a block instead of writing the period estimate: the block begins 80 ms after the first attack (`strumSettleMs`; the later strings of a strum raise the level too little to be seen as attacks, and a string that starts inside the block smears its partials), further attacks within 120 ms belong to the same strum, and after 180 ms (`chordWindowMs`) the block is Hann-windowed, zero-padded and read as a spectrum. Peaks are read from the lowest upwards. A peak on no overtone of a lower accepted peak is a string. A peak on an overtone (octave, twelfth, …) is a string only when it stands above what the lower strings alone would show there: with one or two unmistakable strings that is measured from the lower string's neighbouring overtones at the candidate's second and third partial; in a fuller chord, where those neighbours are shared, the candidate's first three partials are compared with overtones falling as 1/m in amplitude (median of three, threshold 1.5 in power). At most six notes are kept, and they leave the tracker as note-ons with the same time, which `simultaneousNoteOns` groups into one write. Fewer than two notes in the block leave the answer to the period estimate, so single notes are written as before, only about 260 ms after the attack instead of about 70 ms. A block cut short by the next attack or by the end of the sound is read when at least 120 ms long.
- **Limits of chord detection:** two strings on one frequency add or cancel depending on their phase, so a doubling at the octave or twelfth is a judgement, not a measurement. Over thirteen chord shapes, four strum speeds, two sample rates and a slight detuning, the synthetic tests require the bass note, only pitch classes of the chord, every string that is no doubling and at most two missing doublings; they do not require exact doublings. The synthetic strings follow the same 1/m overtone fall the full-chord rule assumes, which a real string follows only roughly, so more overtone notes are to be expected on a real guitar. Low strings less than a minor third apart are not resolved in a 180 ms block. Not verified: any real guitar or amp, distorted presets (combination tones), and the microphone profile, which does not offer the mode.
- **Source-neutral events** (`src/score-input/sounding-note.ts`): detected notes leave the audio layer as `SoundingNoteEvent`s, a sounding MIDI number and a time, with no trace of the device or profile. `notationMidisForInstrument` turns sounding into written pitch as a separate step, so guitar notation is not tied to the amp profile; the microphone profile offers it too.
- **Verification status:** the tracker is covered by synthetic signals only (second harmonic stronger than the fundamental, the same note twice without silence, a legato change, a distorted signal, B1 at 44.1 and 48 kHz, 50 and 60 Hz hum, a noise burst). In headless Chromium the Blob-URL worklet delivered every sample and a plucked oscillator tone was written about 70 ms after its attack. Not verified: the real amp, the automatic Spark choice (the amp's USB device name has not been seen), Electron and the iPad with a USB amp, and detection while the window is hidden.
- **Known limit of the attack rule:** on synthetic plucks an equal-force re-pick 180 to 250 ms later rises 1.8× to 2.3×, right at the threshold, and under heavy synthetic distortion only about 1.1×. Same-note repeats on compressed or distorted presets are therefore the first thing to check with a real take before tuning `attackRatio`.

Not chosen now: AmpBench publishing its detected notes as a virtual MIDI source, which the existing MIDI input would pick up unchanged. It would work on macOS only (a CoreMIDI virtual source has no counterpart for the iPad app or the Linux app), it needs two apps running at the same time, and AmpBench's tracker serves a tuner: it smooths, holds a value for 1.5 s and measures phase for tenths of a cent, which costs latency and hides the repeated attacks note entry needs. Nothing here stands in its way: such notes would arrive as ordinary MIDI note-ons, and because an amp sends sounding pitch, the MIDI path would only need the same `notationMidisForInstrument` step to write guitar notation.

## Testing

Determine the affected application surfaces before selecting checks:

```bash
npm run apps:plan
```

Run the core checks before merging release-sensitive work:

```bash
npm test
npm run smoke:musescore-roundtrip
npm run test:coverage:check
npm run build
```

Use Playwright for browser coverage:

```bash
npm run test:e2e:smoke
npm run test:e2e:regression
```

For desktop artifacts, also run:

```bash
npm run electron:build
```

`npm test` includes `node --check` for `electron/main.cjs` and `electron/launch-helpers.cjs`, plus regression coverage for packaged launch freshness decisions, the invisible utility-process server, and Finder-style macOS `PATH` handling. For macOS app launch changes, also verify a normal `open dist/macos/mac-arm64/Nex\ Note.app` starts one visible Nex Note application, does not register a separate `exec` application, and starts a packaged Next server on `127.0.0.1`.

Current validation snapshot:

- `npm test`: 991 tests passed on 2026-07-23.
- `npm run test:coverage:check`: passed on 2026-07-23 with 85.59% lines, 78.13% branches, and 86.74% functions.
- `npm run build`: passed with Next 16.2.11 on 2026-07-23.
- `npm run test:e2e:smoke`: 30 tests passed on 2026-07-23.
- Bounded `npm run smoke:musescore-roundtrip -- --timeout-ms=15000 --retries=0`: completed with `passed-with-local-musescore-limit` on 2026-07-23; MuseScore 4.7.3 intermittently aborted on source and generated variants, so crash-only results remain inconclusive rather than nex-note export failures.
- `npm audit --omit=dev`: passed with 0 vulnerabilities on 2026-07-23.

## Release Readiness

Before publishing a tagged release or distributing desktop artifacts, verify:

- Unit/integration tests pass.
- Coverage gate passes.
- Production build passes.
- macOS Electron build passes if shipping desktop artifacts.
- Manual smoke covers import, note input, playback, AI preview/apply, `.mxl` export, and a MuseScore round-trip.
- Local-only debug/developer routes are removed, gated, or clearly documented.

Known final-release blockers: notarization, signing identity selection, final icon validation, public binary packaging, and stronger hardening around local debug endpoints.
