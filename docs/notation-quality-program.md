# Notation quality improvement program

Started: 2026-09-05. Status: automated baseline established; physical and usability gates open.

## Objective and evidence

Make everyday notation reliable, quick and comfortable across laptop keyboard,
mouse and native iPad, with synchronized playback and publication-quality layout.
“Gold standard” is the product ambition, not a verified competitive claim.
Automated regressions, measured usability and physical-device validation are
separate evidence. Passing one does not imply passing the others.

Build on the [entry ledger](notation-entry-improvement-ledger.md),
[input parity matrix](note-input-parity-matrix.md) and
[cross-app workflow](multi-app-development-flow.md). Historical passes retain
their original dates and scope; they are not current baseline measurements.

## Iteration contract

1. Measure: run the relevant gates and reproduce the workflow on a fixed score.
   Record commit, dirty tree, surface, input device, fixture and exact actions.
2. Select: fix score corruption, lost work or incorrect pitches first, then
   blocked workflows, then task speed and presentation. Select one bounded
   problem with an observable before/after result.
3. Reproduce: add a failing behavioral regression where automation can observe
   the defect. For usability issues, record task time, actions and corrections.
4. Improve: implement through the shared semantic core and UI. Preserve atomic
   Undo/Redo and MusicXML roundtrip. Avoid surface-specific product forks.
5. Verify: rerun the failing case, its domain gate and all affected app checks.
   A fix that breaks another input method cannot graduate.
6. Record: publish evidence, remaining gaps and the next highest-priority issue.
   A failing or unexecuted gate stays visible; never substitute launch success
   for successful editing, listening or Pencil interaction.
7. Commit and push: after the applicable validation passes, stage only the
   iteration's changes, commit with an English message on `devel`, and push to
   `origin/devel`. Preserve unrelated work and never force-push. If the remote
   has advanced, integrate its changes and rerun affected checks before pushing.
   Verify that local `HEAD` matches the remote `devel` tip and report the commit
   SHA. An iteration is complete only after that verification; a failed push
   remains an explicit outstanding step.

Repeat this loop in small increments. This document does not schedule unattended
runs or authorize an external release. Follow existing branch and release rules.

## Five workstreams and acceptance criteria

Targets below are provisional engineering targets, not measured results. Collect
the first physical baseline before adjusting them; record any adjustment.

| Area | Repeatable user task | Correctness gate | Experience measurement / target |
| --- | --- | --- | --- |
| Laptop keyboard | Enter an eight-bar passage with rests, accidentals, a chord, tie and triplet; correct one note; Undo/Redo; export/reopen | Exact pitch, rhythm, voice and history; text fields retain ordinary typing; held keys do not duplicate transport actions | Complete without reaching for the mouse; record seconds, keystrokes and corrections over three runs; compare median against baseline |
| Mouse | Enter the same passage; replace a note, add a chord tone and edit both piano staves at 75%, 100%, 150% zoom | Visible preview equals committed onset/staff/pitch/voice; zero hover mutations and duplicate commits | Zero wrong-target commits in the fixed corpus; measure task time and correction count; target p95 visible preview response <= 50 ms on recorded hardware |
| Tablet | Enter/correct a four-bar grand-staff passage with finger and Pencil in portrait/landscape, page/continuous view; cancel a gesture; scroll and zoom | Preview/refine/release commits once; cancellation commits nothing; navigation preserves score; selected-note gestures retain priority | Zero accidental entries while navigating; physical finger and Pencil passes separately; target p95 preview response <= 50 ms; emulated Pointer Events do not satisfy this gate |
| Playback and sounds | Play from selection; pause/resume/seek; change tempo; play repeats, ties, mixed meter and multiple instruments; test offline output | Correct onsets/durations, instrument mapping and cursor position; no hanging notes after stop/seek | Record audio and screen together; target p95 cursor-to-audible-onset offset <= 50 ms after accounting for output latency; inspect 60 seconds for drift; assess timbre/balance by listening |
| Formatting | Format piano, choir and leadsheet scores: page/system breaks, spacing, staff distance and text; Undo/Redo; save/reopen; PDF | Formatting persists without altering musical content; deterministic projection and successful export | Zero clipped glyphs, overlapping lyrics or detached markings in the reviewed corpus; inspect every PDF page at print scale; record clicks and task time |

Use existing fixtures first: `test/fixtures/piano-semantics.musicxml`,
`choir-lyrics.musicxml`, `leadsheet-repeat.musicxml`,
`repeat-ending-sequence.musicxml`, `cross-measure-tie.musicxml`, and
`e2e/fixtures/little-walk-guitar-tab.musicxml`. Extend with dense multi-voice,
pickup, clef-change and long-score cases as defects demand. Preserve fixtures
and instructions so before/after task measurements remain comparable.

## Executable regression cycle

From the repository root:

```bash
node scripts/notation-quality-cycle.mjs
node scripts/notation-quality-cycle.mjs --browser
```

The default runs five named groups of existing unit/behavior tests. The browser
option also runs notation tools, mouse precision, tablet gestures, snap/ghost
and explicitly enabled semantic-grid fuzz tests. Each run creates a timestamped
directory under `test-results/notation-quality/` with per-gate logs, revision and
worktree information, duration, commands and `report.json`. Browser runs retain
JSON results and failure artifacts in the same directory. A failed gate causes
a nonzero exit code; browser skips/flaky cases are incomplete and also nonzero.
Without browser execution the report is explicitly partial. The runner continues
through independent failed gates so one issue does not hide another workstream.

These groups reuse overlapping tests intentionally: cross-input contracts must
remain covered. They do not measure typing speed, touch ergonomics, real sound
quality, hardware latency or printed engraving. Browser formatting coverage is
currently limited to notation markings; layout units do not prove visual quality.
The runner leaves all physical/manual gates `not-run` and never declares product
readiness. Attach manual evidence to the iteration record separately.

Browser prerequisites are the repository's installed dependencies and Chrome at
the path configured in `playwright.config.ts`. Do not run conflicting Next.js
builds or native packaging against the same `.next` directory during E2E.

After a shared product change, the runner supplements, not replaces:

```bash
npm run apps:plan
npm test
npm run build
npm run electron:refresh
npm run ipad:sync
npm run ipad:doctor
git diff --check
```

Launch/smoke-test the refreshed Electron app and paired physical iPad for affected
flows. Once the Xcode macOS target exists, add its required sync, doctor, Xcode
build and app smoke test. Record unavailable surfaces and reasons explicitly.

## Initial ordered backlog

| Priority | Work item | Exit evidence |
| --- | --- | --- |
| 1 | Establish current five-domain automated baseline and reproduce any failures | Timestamped run and individual failure records; fix deterministic correctness failures before adding features |
| 2 | Complete keyboard-only eight-bar benchmark, including focus and shortcut conflicts | Three timed runs, exact score comparison and regressions for observed defects |
| 3 | Expand mouse view/zoom, C-clef and multi-voice preview/commit matrix | Fixed-corpus rendered tests; zero wrong targets; atomic history |
| 4 | Close physical finger/Pencil gaps from existing entry ledger | Real native iPad gesture matrix with hardware/orientation records |
| 5 | Measure audible transport sync, seek/tempo behavior and instrument balance | Audio/video evidence, offset distribution and listening notes; fix measured errors |
| 6 | Add rendered formatting/PDF acceptance coverage and improve the highest-friction controls | Before/after score and page images, persistent layout and measured task improvement |

Promote any newly reproduced data-loss, pitch or timing defect above this order.
Do not introduce sound-library or renderer replacements without evidence that the
current implementation prevents the target workflow.

## Iteration record template

- Date / revision / worktree:
- Workstream / concrete problem:
- Fixture / actions / surface / device:
- Baseline result (correctness, seconds, actions, corrections or latency):
- Hypothesis and bounded change:
- Regression evidence before and after:
- Cross-app tests/builds and actual smoke tests:
- Manual/physical gates not run and reason:
- Artifacts:
- Commit SHA / push result / verified remote devel SHA:
- Decision: accepted increment, needs revision, or blocked on named evidence:
- Next issue:

## Iteration 0 — Current regression baseline

- Date: 2026-09-05; branch: `devel`; base revision:
  `64f1083105afb6ce53805eb338809f81e8ee8a05`.
- Change: added this cross-domain process and an executable evidence runner;
  linked it from the README. No shared product runtime, dependency, shell or
  native configuration changed.
- Focused gates: keyboard 232, mouse 51, tablet 37, playback 35, formatting 37
  tests passed: 392 executions, zero failures or skips.
- Rendered Chromium baseline: 51 passed in 3.8 minutes, zero failures, skips or
  flaky cases, including all four explicitly enabled semantic-grid fuzz seeds.
- Full `npm test`: 1,072 passed, zero failures or skips. These include the focused
  tests and should not be added to them as unique coverage.
- Runner validation: actual unit/browser run, Node syntax check, help output and
  unknown-option rejection (exit 2) passed. Local documentation links checked.
- Local evidence:
  `test-results/notation-quality/2026-09-05T04-34-55.624Z-6745/report.json`,
  `browser-results.json`, per-domain logs and `full-unit-suite.log` in that same
  directory. Generated evidence is ignored by Git; this record preserves the
  outcome for future checkouts.
- Surfaces: Next.js/Chromium rendered workflows executed. Electron and native
  iPad builds/sync/smoke tests were not run because this increment changes only
  local quality tooling and documentation. Product production build was not
  required for the same reason. Xcode macOS target is absent. None of these
  unexecuted surfaces is certified by the browser baseline.
- Physical iPad/Pencil, audible playback, task timing and print/PDF visual
  checks: not run in this automated baseline. Existing browser tests use
  simulated input/audio and cannot provide these measurements.
- Decision: baseline increment accepted; no deterministic product defect was
  found in the executed corpus. No product usability improvement or competitive
  superiority is claimed by this increment.
- Next iteration: execute the eight-bar keyboard benchmark, capture focus and
  correction friction, and implement the highest-impact reproduced issue.
  Physical-device and listening measurements remain required workstreams.

## Iteration 1 — Keep text corrections out of score history

- Date: 2026-09-05; branch `devel`; starting revision
  `5ae0e17060f85215c59b8eaa495f7b3d9d6892dc`; initially clean worktree.
- Priority/workstream: lost-work prevention during keyboard text correction;
  shared history protects edits entered by keyboard, mouse, or touch and layout
  changes alike.
- Reproduction: Chromium, notation-tools two-bar piano fixture; select first C4,
  press ArrowUp (C-sharp4), focus a text input, type `draft`, press Ctrl+Z.
  Before the fix, the score silently reverted C-sharp4 to C4. This is a
  deterministic behavioral regression, not a timed eight-bar benchmark.
- Change: browser/native-webview score Undo/Redo yields to input, textarea and
  contenteditable focus. Electron menu commands route focused text history to
  native webContents undo/redo; menu availability no longer depends on score
  history, because native text can have independent history. Score history and
  semantic commands remain unchanged.
- Regression: new browser test failed before the fix on the exact MusicXML pitch
  difference and passed afterward. Tests cover all three editable target kinds,
  score Undo/Redo after leaving the field, and Electron renderer menu routing
  with actual browser text undo/redo through a stubbed bridge.
- Automated domain cycle: keyboard 232, mouse 51, tablet 37, playback 35,
  formatting 37 passed; Chromium 53 passed, zero failures/skips/flaky cases,
  including four semantic-grid seeds. Full unit suite: 1,072 passed.
- Evidence directory:
  `test-results/notation-quality/2026-09-05T04-50-21.647Z-25829/` contains
  report.json, browser-results.json, history-before.log, history-after.log,
  full-unit-suite.log and domain logs. Generated artifacts are ignored by Git.
- App checks: `npm run electron:refresh` repeated all 1,072 tests, completed
  `npm run build`, packaged arm64 Electron, and verified the source fingerprint.
  A real packaged-Electron Playwright smoke loaded `piano-semantics.musicxml`,
  changed a note, exercised native menu Undo/Redo in input, textarea and editable
  div, and verified exact score XML plus score Undo/Redo after focus left text.
  This is executed native edit behavior, not a listening or visual-quality pass.
- Native iPad: sync and Doctor passed; Xcode 26.6 signed Debug device build
  passed with the existing team supplied only on the command line. Installed
  and launched `app.nexnote.ipad` on connected Director Ipad, iPad Air 13-inch
  (M2). Delivery/launch passed; physical text editing, finger/Pencil, orientation,
  and navigation smoke tests were not run because no physical input channel is
  available. Xcode macOS remains absent, so its build/smoke is not applicable.
- Audible playback, output latency, print/PDF review and timed keyboard task
  remain not run. No new sound, engraving, or physical usability claim is made.
- Additional local evidence: `electron-refresh.log`, `electron-smoke.log`,
  `ipad-sync.log`, `ipad-doctor.log`, `ipad-build.log`, `ipad-install.log`,
  `ipad-launch.log`, and the Electron smoke script in the evidence directory.
- `git diff --check` passed. Commit/push receipt is saved beside the evidence
  after commit; the exact verified SHA is reported in the execution handoff.
- Verified iteration-1 commit/push: `b94c8c57b5983d58590f3ce748d82c37a6619bfc`;
  local HEAD matched `origin/devel` after push. Post-commit Mac artifact build
  and package verification also passed.
- Decision: accepted automated correctness increment with the named physical
  gates open. Next issue: reproduce capture loss during an existing-note drag;
  capture-loss cleanup currently handles tablet note-entry sessions only.

## Iteration 2 — Abandon existing-note drags on capture loss

- Date: 2026-09-05; `devel`; base revision
  `b94c8c57b5983d58590f3ce748d82c37a6619bfc`; initially clean worktree.
- Priority/workstreams: incorrect pitch after an interrupted mouse/touch/pen
  gesture. Shared cancellation now covers existing-note drags, including the
  shared TAB-drag session, as well as tablet insertion sessions.
- Reproduction: `e2e/fixtures/simple.musicxml`, Chromium; enter N mode, contact
  the first C4, refine 24 pixels upward, lose pointer capture, then release.
  All three synthetic pointer types changed C4 to F4 after capture was lost.
  New tests failed 3/3 on the exact XML pitch difference before the fix.
- Change: `lostpointercapture` discards the matching drag session and preview.
  An unrelated pointer ID does not cancel the active drag. No semantic command
  executes on cancellation; no history or projection implementation changed.
- Focused regression: tablet-entry suite 10/10 passed, including touch, pen and
  mouse cancellation, normal subsequent drag with unrelated capture loss, and
  exact MusicXML Undo/Redo. The capture probe is simulated input, not physical
  finger/Pencil evidence. TAB uses the same cancelled session; a TAB-specific
  cancellation gesture has not been exercised.
- Five-domain cycle passed: keyboard 232, mouse 51, tablet 37, playback 35,
  formatting 37; rendered Chromium 56 passed, no skips/failures/flaky cases.
  Full unit suite: 1,072 passed.
- Evidence: `test-results/notation-quality/2026-09-05T05-02-52.699Z-39966/`,
  including report.json, domain/browser logs, drag-before.log, drag-after.log,
  full-unit-suite.log and native logs. Generated artifacts are ignored by Git.
- Electron: refresh repeated all units and the production build, packaged and
  verified the app. Native packaged smoke on `simple.musicxml` used actual
  Playwright mouse input and native pointer capture: release capture during a
  drag, release the button, verify unchanged XML; then perform a normal drag
  and verify Undo restores the exact XML. Passed. Earlier smoke attempts did
  not establish the intended captured drag; their logs are retained, and no
  pass is attributed to them. The successful setup explicitly focuses the app,
  loads the fixed fixture and enters Note Input before the gesture.
- iPad: sync, Doctor, signed Xcode device build, install and launch passed on
  connected Director Ipad (iPad Air 13-inch M2). Physical finger/Pencil drag,
  cancellation, orientation and navigation checks were not run: no physical
  interaction channel is available. Xcode macOS target remains absent.
- Audible playback/latency, print-quality review and task timing were not run;
  these independent manual gates remain open.
- `git diff --check` passed. Commit/push receipt is recorded in the evidence
  directory after remote verification and the verified SHA is in the handoff.
- Verified iteration-2 commit/push: `488032a92c570723d593e63e5ced49374b3407f0`;
  local HEAD matched `origin/devel`. Post-commit Mac artifact packaging and
  verification passed.
- Decision: accepted correctness increment; physical native gesture gate open.
  Next issue: delayed layout cleanup may apply commands to a different score
  opened while the request was pending. Reproduce the current confirmation
  response path before selecting an implementation.

## Iteration 3 — Bind pending layout cleanup to its source document

- Date: 2026-09-05; `devel`; base revision
  `488032a92c570723d593e63e5ced49374b3407f0`; initially clean worktree.
- Priority/workstream: formatting commands targeting the wrong document after
  an asynchronous response. This also protects intervening keyboard/mouse/touch
  edits from stale cleanup assumptions.
- Reproduction: Chromium notation-tools fixture; request layout cleanup, hold
  the response, then either edit C4 with ArrowUp or load the four-bar playback
  fixture. Deliver the current confirmation-style response with a page-break
  command for bar 2 and accept it. Before the fix, both changed documents
  acquired the obsolete page break. Selection-only changes remained valid.
- Before evidence: two failures on exact XML differences, one selection-only
  pass. After: all three pass. The response is deliberately stubbed/delayed;
  no external AI model or service was required to reproduce the client race.
- Change: retain the requested immutable core document and compare it with the
  current document before offering or applying the result. On mismatch, keep
  the current score and explain that cleanup must be rerun for this version.
  Selection changes do not invalidate the document. This also guards the
  legacy direct-XML response branch, though the regression exercises the
  current confirmation response contract.
- Fresh cleanup still applies its page break; MusicXML parsing, atomic Undo
  and Redo pass. No renderer, spacing rules or engraving algorithms changed;
  this is formatting correctness, not a print-quality or visual-polish claim.
- Validation: five domain gates passed (392 executions); full unit suite 1,072
  passed; Chromium 59 passed, zero failures, skips or flaky cases. Evidence:
  `test-results/notation-quality/2026-09-05T05-15-32.802Z-56227/`, including
  report.json, layout-before.log, layout-after.log and full-unit-suite.log.
- Electron refresh repeated the units and production build, packaged and
  verified the app. Packaged-Electron smoke held the cleanup response, loaded
  `choir-lyrics.musicxml` after `piano-semantics.musicxml`, then delivered the
  old commands and verified the replacement score XML was unchanged. Passed.
- Native iPad: sync, Doctor, signed Xcode build, installation and launch passed
  on Director Ipad (iPad Air 13-inch M2). Hands-on editing/formatting on iPad was
  not run because no physical input channel is available. Xcode macOS is absent.
- Physical finger/Pencil, audible playback, latency, timed entry and print/PDF
  review remain not run. Native delivery does not close these manual gates.
- Native logs and the Electron smoke script are in the same evidence directory.
  `git diff --check` passed; commit/push receipt follows remote verification.
- Decision: accepted formatting-correctness increment. Next: reproduce pending
  note audition after closing the score, both during MIDI loading and during
  instrument loading; no listening-quality claim follows from scheduler tests.
