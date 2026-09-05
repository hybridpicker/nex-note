# Notation quality improvement program

Started: 2026-09-05. Status: four additional product iterations delivered (5–8); the program remains open with explicit acceptance blockers below.

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
- Verified iteration-3 commit/push: `189efa8e36f25246e91a09eaee7aab4f5a7ae086`;
  local HEAD matched `origin/devel`. Post-commit Mac artifact packaging and
  verification passed.
- Decision: accepted formatting-correctness increment. Next: reproduce pending
  note audition after closing the score, both during MIDI loading and during
  instrument loading; no listening-quality claim follows from scheduler tests.

## Iteration 4 — Cancel pending auditions when the score stops or closes

- Date: 2026-09-05; `devel`; base revision
  `189efa8e36f25246e91a09eaee7aab4f5a7ae086`; initially clean worktree.
- Priority/workstream: playback correctness; a delayed note could start after
  the score was closed or its audition was stopped.
- Reproduction: Chromium notation-tools fixture; select C4, hold either the
  MIDI response or instrument-loader promise, close the score with Ctrl+W,
  then complete the load. Both tests observed a late instrument start before
  the fix. Separate hook tests held a note/chord instrument load, called Stop,
  then resolved it: one/two note starts respectively instead of zero.
- Change: stopping scheduled playback invalidates pending audition generations
  without throwing away reusable loaded assets. The note-click workflow checks
  document identity after MIDI loading and before preview, so an earlier click
  cannot resume against a closed or changed score. The same document reference
  continues to protect layout cleanup.
- Focused evidence: both UI regressions failed before and passed after; both
  hook tests failed before and passed after. The hook tests await the actual
  audition promise and also prove that a new audition reuses the loaded
  instrument successfully. Added the tests to the program playback gate.
- Evidence concerns instrument-start calls, not audible output. Sound timbre,
  balance, acoustic stop latency, cursor/audio offset and listening quality
  have not been measured by these tests.
- Validation: keyboard 232, mouse 51, tablet 37, playback 37, formatting 37
  passed (394 domain executions). Full unit suite 1,074 passed. Chromium 61
  passed with zero failures, skips or flaky cases. `git diff --check` passed.
- Evidence: `test-results/notation-quality/2026-09-05T05-27-49.591Z-70626/`
  contains report.json, browser/domain logs, playback-before.log,
  playback-after.log, unit-before.log, unit-after.log and full-unit-suite.log.
- Electron: refresh repeated all units and the production build, packaged and
  verified the app. Packaged smoke selected a note in `simple.musicxml`, held
  the instrument load, invoked File > Close Score, then completed the load and
  observed zero instrument starts. The instrument was stubbed: this proves
  native app workflow/cancellation, not listening. An initial setup did not
  reach the loader; the successful run used a fresh profile and explicit app
  focus, and both logs are retained.
- Native iPad: sync, Doctor, signed Xcode build, install and launch passed on
  Director Ipad (iPad Air 13-inch M2). Physical editing and audible playback
  were not exercised because no physical interaction/listening channel is
  available. Xcode macOS target is still absent. Native logs and the Electron
  smoke script are alongside the regression evidence.
- Verified iteration-4 commit/push: `0db41d8bc883bda73a394774627d03a6fb611794`;
  local HEAD matched `origin/devel`. Post-commit notation-tool checks passed
  32/32 and Mac artifact packaging/verification passed. The local receipt is
  `test-results/notation-quality/2026-09-05T05-27-49.591Z-70626/commit-receipt.json`.
- Decision: accepted playback-correctness increment.
- Remaining program gates: timed eight-bar keyboard benchmark; broader C-clef,
  voice, zoom/view and TAB interaction corpus; physical finger/Pencil matrix;
  recorded audible synchronization, timbre/balance and output latency; reviewed
  print/PDF corpus. These are not closed by this run. No failing automated
  regression remains in the executed corpus. The next improvement should be
  selected from a concrete failure or measured friction in these open gates.


## Execution closeout — 2026-09-05

This execution is finalized at the user's request. Four bounded product
improvements were reproduced, implemented, validated, committed separately on
`devel`, pushed without force, and verified against `origin/devel`:

| Iteration | Delivered improvement | Verified commit |
| --- | --- | --- |
| 1 | Keep text Undo/Redo out of score history | `b94c8c57b5983d58590f3ce748d82c37a6619bfc` |
| 2 | Cancel existing-note drags on capture loss | `488032a92c570723d593e63e5ced49374b3407f0` |
| 3 | Reject layout cleanup prepared for an obsolete document | `189efa8e36f25246e91a09eaee7aab4f5a7ae086` |
| 4 | Cancel auditions awaiting MIDI or instrument loading | `0db41d8bc883bda73a394774627d03a6fb611794` |

Final product validation passed 1,074 unit tests, 394 focused domain executions
and 61 browser tests, with no failures or skips in those runs. Production builds,
Electron refresh/package verification and the documented native Electron smoke
flows passed. iPad sync, Doctor, signed device build, installation and launch
passed. Detailed evidence and limitations remain in the iteration records above.

The broader quality program is not certified complete: physical finger/Pencil
interaction, audible synchronization and timbre, timed keyboard tasks, expanded
pointer matrices, and reviewed print/PDF output remain open. The Xcode macOS
target is absent. No unperformed manual check is counted as passed.

No temporary branches or worktrees were created. The worktree was clean and
local HEAD matched the remote product tip before this documentation closeout.
This closeout changes documentation only; its diff and recorded commit IDs were
checked without repeating product tests or native builds. The final handoff
reports the separate closeout commit after its push is verified.

## Iteration 5 — Preserve spaces in editable text

- Date: 2026-09-05; `devel`; starting revision
  `8f8149cb34128523ae250f0460fe4722f0e54209`; initially clean worktree.
- Concrete defect: Chromium typing `first second` into contenteditable produced
  `firstsecond`: global Space intercepted text and could start transport.
  Input and textarea controls already yielded correctly.
- Before evidence: the added browser regression failed on exact text content.
  After: typing spaces, held-Space transport, and text-history tests passed 3/3.
  Returning focus to the score still starts/pauses transport. XML remains exact.
- Bounded change: reuse the existing text-focus predicate for Space. No score,
  history, pitch, timing or document serialization implementation changed.
- Evidence: `test-results/notation-quality/continuation-2026-09-05/` contains
  focus-before.log and focus-after.log. Full domain/browser evidence is under
  `test-results/notation-quality/2026-09-05T05-51-09.092Z-98350/`.
- Physical participation instructions are in
  [notation-quality-participation.md](notation-quality-participation.md).
  These are pending tasks, not reported passes or substitute measurements.
- Cross-app validation and commit receipt are recorded below after execution.
- Next reproduced defect: print media hides the complete score preview for
  piano, choir and leadsheet. The initial PDFs are failed evidence, not approved
  outputs. This independent print defect is reserved for the next iteration.
- Validation: 1,074 unit tests, 394 domain executions and 62 Chromium tests
  passed, zero failures/skips in those suites. Electron refresh performed the
  production build, package creation and fingerprint verification. Packaged
  Electron entered `first second` in input, textarea and contenteditable, kept
  transport stopped, and passed native text and score Undo/Redo.
- iPad: sync, Doctor and signed Xcode device build passed. Installed on connected
  Director Ipad, iPad Air 13-inch M2. Physical input remains unperformed: the
  available device tools provide delivery, not finger/Pencil manipulation.
  Xcode macOS target remains absent. No listening or task-time pass is claimed.
- The separate new print corpus failed 3/3 before its reserved fix; those
  failures are not hidden by the existing cycle's pass.
- App logs and the reproducible Electron smoke script are beside focus evidence.
  `git diff --check` passed. Commit/remote verification follows this record.

- Verified iteration-5 commit/push: `653e186f3bb7d9805b9e7f4daad931ec58e24d8d`;
  local HEAD matched remote `devel`. The hook passed 33 notation tests and
  post-commit Mac artifact build/verification. Native launch was attempted but
  iPadOS rejected it because Director Ipad was locked; installation passed.

## Iteration 6 — Keep notation visible in page and print views

- Date: 2026-09-05; base `653e186f3bb7d9805b9e7f4daad931ec58e24d8d`.
- Before: all three A4 PDFs (piano-semantics, choir-lyrics, leadsheet-repeat)
  omitted notation. The print CSS hid the first score-column child, which is
  now the score stage because the toolbar is absent in print view. A transient
  workspace status could still print. The three rendered regressions failed
  on hidden noteheads after switching to print media.
- Second visibility reproduction: the page-view wrapper used shrink-to-fit
  sizing around an asynchronously rendered score. The blank C-clef piano page
  collapsed to about 100 px, clipping notation and preventing visible-ghost
  commits. Screenshot and failing mouse baseline are retained.
- Change: preserve the score stage in print CSS, hide workspace status from
  paper output, and give page view an explicit available width capped at the
  existing 1120 px maximum. No semantic score or pitch rules changed.
- Print regression: 3/3 pass after the fix. All three single-page A4 PDFs were
  rendered to PNG and visually inspected: notation, lyrics, harmony, slur and
  repeats are present; no page-edge clipping, lyric overlaps or UI status is
  visible in this short corpus. This does not certify multipage pagination.
- Expanded input evidence is recorded separately from physical timing. Initial
  mouse experiments used a missing voice 2 and cannot certify populated-voice
  entry; the final fixture supplies explicit full-measure rests in both voices.
  The first six baseline cases executed before a post-commit server shutdown;
  the last six failed on unavailable server and are infrastructure failures.
- Evidence root: `test-results/notation-quality/continuation-2026-09-05/`.
  `print-before`, `print-after`, source PDFs/PNG previews, mouse-matrix,
  mouse-probe and expanded-probe retain the failed and successful observations.
- Cross-app validation, final expanded results and commit receipt follow below.

- Validation on the combined continuation worktree (iterations 6–8): all 1,076
  unit tests and 396 domain executions passed. The expanded 75-case browser
  run passed 74 cases; its remaining failure was a test polling empty XML before
  asynchronous reopen completed. After waiting for loaded XML, the eight-bar
  download/reopen case passed. The separate print/page corpus passed 4/4.
  TAB passed all nine cases across the run and an isolated rerun: its 75% page
  case was interrupted by a Next.js full reload on the first run. No physical
  timing claim is derived from these automated tests.
- Production build and Electron refresh/package verification passed. Actual
  packaged Electron page editing, rest-to-A4 entry, correction, native menu
  Undo/Redo and print-media notation passed. iPad sync, Doctor, signed device
  build and installation passed; launch failed because the iPad is locked.
  Finger/Pencil editing is not performed. The Xcode macOS target is absent.
- Additional formatting evidence: command-level system/page-break flags,
  staffSpacing=124, collisionPolicy=open and staff text survive NXN disk
  serialization/reopen for all three fixtures; voice/event data is unchanged.
  This checks serialized document values (ignoring absent undefined fields),
  not UI editing, multipage layout or manual save/reopen. Break flags were
  placed on measure 1 because the piano fixture contains only one measure.
- Final logs: `electron-refresh-final.log`, `electron-edit-smoke.log`,
  `ipad-*-final.log`, `final-focused.log`, `tab75-final.log`, and
  `format-persistence.log` in the continuation evidence root. Domain report:
  `test-results/notation-quality/2026-09-05T06-34-09.594Z-33918/report.json`.
- Validation explicitly covered the combined worktree before staging separate
  bounded commits. Repeated hooks may reuse this unchanged-code evidence;
  no hook skip stands in for the required app checks. `git diff --check` passed.

- Iteration-6 commit `4668ccf5dd6b0ce49916b8d36a1fd5298a6c112b` was pushed
  without force and verified equal to remote devel. Final notation hook: 34/34
  passed after replacing a forced-click test race with actionability waiting.
  The repeated post-commit packaging hook was skipped because refresh had
  already built and verified the identical runtime; final packaging follows
  the last continuation commit.

## Iteration 7 — Preserve the selected voice in pointer entry

- Date: 2026-09-05. Concrete defect: after choosing voice 2 in a C-clef
  score with explicit voice-2 rests, the settled preview offered a voice-1
  chord and committed into voice 1. The visible note's rendered anchor could
  override the selected voice. This is incorrect musical content, not latency.
- Before evidence: `voice-settled.log` and its browser artifacts reproduce the
  wrong voice after geometry settles; the added onset-refinement unit test
  failed with voice 1 where voice 2 was expected. Early searches with an
  absent voice or a too-narrow x range are exploratory failures, not this proof.
- Change: horizontal rendered-onset refinement cannot switch voices. When a
  shared rendered anchor belongs to another voice, rebind its entry candidate
  to the selected voice and discard the old resolved target so the semantic
  entry resolver validates it again in the intended lane.
- After: 12 Chromium cases pass for alto/tenor C-clefs, page/continuous-vertical
  views and 75/100/150% zoom. Each enters C4 in voice 1 and E4 in voice 2 at
  onset zero, checks exact preview/commit voice and pitch, verifies unchanged
  XML on hover, and checks exact XML Undo/Redo. Existing grand-staff/chord
  pointer regressions passed in the same cycle. TAB coverage is in iteration 6.
- Actual packaged Electron independently entered C4/E4 into voices 1/2 in
  C-clef page view and verified unchanged XML on hover. This is automated
  native desktop editing, not a physical mouse task-time measurement.
- Validation: the 1,076-unit, 396-domain, build/refresh, iPad sync/Doctor/signed
  build/install evidence recorded in iteration 6 covers this unchanged shared
  implementation. Evidence: `voice-lock.log`, `electron-voice-smoke.log`, and
  the 12 matrix passes in the 06-26 browser report. Native iPad physical input
  remains blocked by device lock and unavailable finger/Pencil participation;
  Xcode macOS target is absent. No latency or usability speed gate is closed.

- Iteration-7 commit `d924c9a495b253b81e42a149271e1f5ce6835a03` was pushed
  without force and verified equal to remote devel. Duplicate notation and
  packaging hooks reused the completed unchanged-runtime evidence above.

## Iteration 8 — Continue the melodic register after a rest

- Date: 2026-09-05. Before: the eight-bar keyboard corpus entered G4, rest, A3
  instead of A4. Comparing note names alone hid the defect; exact MIDI pitches
  exposed it and the remainder of the passage inherited the wrong register.
  The rest's placeholder pitch was being used as the melodic reference.
- Change: when the input reference is a rest, derive the preceding pitched note
  from the current semantic lane. Include the current document in the keyboard
  callback dependencies so history and navigation cannot retain stale content.
- After: the 32-event, eight-bar replacement corpus checks every MIDI pitch,
  including the rest and following A4. A final semitone correction yields D#6;
  exact XML Undo/Redo passes. The app downloads an actual MXL file, closes the
  score, imports that file and retains all expected pitches. Strict Doctor is
  clean. This is not the complete blank-entry chord/tie/triplet benchmark.
- Test-harness corrections are distinguished from product defects: a new hook
  unit originally batched selection and input-mode activation into one React
  act, selecting the default note. Separate actions fixed that setup. Reopen
  polling now waits for loaded XML before invoking the nonempty XML parser.
  Neither harness failure is claimed as a product improvement. The commit hook
  also exposed an existing forced-click race during notehead redraw. The shared
  test helper now uses Playwright actionability waits; the failed artifact is
  retained in `commit6-palette-failure` and the notation suite is rerun.
- Validation: all 1,076 unit tests and 396 domain executions passed after those
  corrections. The expanded browser run passed 74/75 before correcting reopen
  polling; its final eight-bar rerun passed. The commit-6 retry hook passed all 34 notation tests with the final
  implementation and actionability helper. Packaged Electron independently
  verifies G4/rest/A4, correction and native Undo/Redo. Production build,
  Electron refresh and iPad sync/Doctor/signed build/install passed on the same
  runtime worktree. iPad launch remains locked; physical entry remains not-run.
- Evidence: `keyboard-pitch-after.log`, `rest-unit-after.log`,
  `final-focused.log`, `electron-edit-smoke.log`, `electron-refresh-final.log`,
  `domains-final.log` and `ipad-*-final.log` in the continuation evidence root.

## Continuation handoff — open gates remain open

This execution delivered product fixes; it does not complete the quality
program. The following is the current acceptance status, not a replacement for
recorded historical results.

| Gate | Recorded evidence added | Unresolved blocker / work needed |
| --- | --- | --- |
| Keyboard | Text spaces/focus, eight-bar exact-pitch replacement, correction, atomic history, actual MXL export/reopen; native Electron editing/history | The complete blank-entry passage combining chords, ties and triplets and three human timed runs have not been performed. No end-to-end task-time baseline exists. |
| Mouse | Alto/tenor C-clefs × two populated voices × two views × three zoom levels, exact ghost/commit and history; nine TAB tests; packaged C-clef editing | Full eight-bar mouse passage and measured physical preview latency/task time remain unperformed; the finite automated corpus cannot certify all scores. |
| Native iPad | Synced standalone shell, Doctor, signed build and installation; existing simulated cancellation regressions pass | Connected Director Ipad is locked and launch was rejected. Finger and Pencil entry/cancellation/navigation/orientation and physical latency require the tester; no native editing pass is claimed. |
| Playback | 37 playback domain executions pass, including existing cancellation/transport scheduling contracts | Actual audio/cursor synchronization, stop/seek/tempo listening, calibrated latency, 60-second drift, timbre, balance and offline listening remain unperformed. Instrument stubs are not audio evidence. |
| Formatting | Three rendered A4 PDFs visually reviewed; print visibility fixed; three command-level NXN disk roundtrips preserve format values and musical events | Full UI formatting/Undo/Redo/save/reopen corpus, manual click/time measurements and a named multipage print corpus remain unperformed. Short single-page PDFs do not close this gate. |

The tester must follow [the participation checklist](notation-quality-participation.md),
provide the named exports/recordings and mark each matrix cell pass/fail/not-run.
For iPad, unlock the installed native app before starting. For playback, provide
actual output audio and screen on one timebase with route/latency calibration.
These are required user actions, not approvals for already completed fixes.
The Xcode macOS target does not exist, so its build and editing checks cannot run.
No temporary branch or worktree was created. Commit receipts follow below.

The final keyboard commit uses the already-passing 34-case notation hook and
runs the normal post-commit macOS artifact build. Its full SHA, push and remote
comparison are recorded in the execution handoff and local
`test-results/notation-quality/continuation-2026-09-05/iteration-8-verification.json`.
The iPad installation contains the tested final runtime from the pre-commit
worktree; its provenance is `653e186f+local`, not a claim that a clean final Git
revision was physically edited on the device.

## Iteration 9 — Delete linked guitar notation and TAB together

- User reproduction: notes entered in Guitar + TAB create frets automatically,
  but deleting the notation leaves the TAB behind. The two direct core deletion
  tests reproduced this. Browser Delete/Backspace also reproduced it after the
  initial core fix: scores with staff-details still used the legacy XML path.
- Change: single-note and range deletion resolve the paired pitch before
  mutation and update both staves in one command/history transaction. Chord
  deletion retains the other tones and promotes a remaining root. An unmatched
  pitch is not deleted. Staff-details scores use the core deletion path, with
  preservation/export regression coverage.
- The chord regression also exposed duplicate IDs when replacing a rest and
  adding a tone within one millisecond. Inserted IDs now check existing IDs in
  the measure; the regression freezes Date.now to exercise that collision.
- Validation: 1,082 unit tests passed. All 11 guitar/TAB Chromium cases passed,
  including Delete/Backspace, visible fret removal and exact XML Undo/Redo.
  The first browser run had one unrelated Next.js JSON/500 failure; the final
  run passed all cases. Core tests also cover TAB-to-notation deletion, range
  boundaries, retained chord tones, mismatched pitches and export/reopen with
  six-line staff-details preserved. Evidence: `test-results/tab-delete/`.
- Before refreshing the user's running Mac app, saved and verified a native
  NXN backup in Downloads: `Guitar TAB before deletion fix 2026-09-05.nxn`.
  This fix synchronizes subsequent deletions; it does not infer and purge
  unmatched TAB notes already left by earlier edits.
- Cross-app build, packaged editing and delivery results follow in the task
  handoff. Physical iPad interaction remains a separate required check; app
  delivery never counts as finger/Pencil editing. The broader gates above
  remain open, and the planned Xcode macOS target remains absent.
- App validation: production build and Electron refresh passed. In the actual
  packaged Mac app, opened a dedicated guitar/TAB fixture, selected C4 with
  Control+Home, pressed Backspace, then used native Edit > Undo and Redo.
  Note/fret disappeared, returned together, and disappeared together again.
  Exported NXN was parsed and verified to contain only rests on both staves
  (`native-result.nxn`, `native-smoke.log`). This did not edit the user's score.
- iPad sync and Doctor passed. Xcode compilation reached CodeSign, which failed
  twice with `errSecInternalComponent` signing App.debug.dylib. Device tools
  accepted installation and launch of the existing derived-data app afterward,
  but that is not a successful fresh signed build or validated delivery of this
  fix. Physical iPad editing remains unperformed and fresh signing is blocked.
- Final notation pre-commit and macOS packaging hooks, commit SHA and remote
  verification are recorded in `test-results/tab-delete/` and the task handoff.
  No temporary worktree or branch was created; unrelated files were untouched.

## Iteration 10 — Prepare audition audio before the first mouse entry

- User report: a long delay between a mouse click and its visible note. The
  current exported user score has 32 empty Guitar + TAB measures at 100%,
  continuous-vertical view. A matching synthetic score was profiled without
  changing the user's document.
- Before: the first preview constructed AudioContext synchronously inside the
  pointer commit handler. The CPU profile attributed about 187 ms to getAc in
  the initial run. The first measurement (164.5 ms) started at document capture
  and missed the editor's earlier window-capture handler; it is not the full
  click-latency baseline. Corrected measurement installs window capture before
  application startup and measures through the next two animation frames after
  the notehead appears. Three cold runs: 270.7, 274.3, 312.4 ms.
- Change: entering Note Input calls the existing non-sounding audio prewarm in
  that activation gesture. Subsequent note commits reuse the context and
  instrument. This moves audio initialization to mode activation; it does not
  make initialization itself free. Direct entry auditions now honor the input
  audition preference instead of creating audio even when disabled.
- After, same automated 32-bar Chrome protocol: 66.5, 69.8, 70.9 ms. Median
  improved from 274.3 to 69.8 ms (about 75%). These three runs do not establish
  physical input p95, native-device latency or the <=50 ms experience gate.
  A multi-second delay was not reproduced in this corpus.
- Two behavioral browser regressions failed before the fix: audio was not
  prepared on mode entry, and muted entry still created/played audio. The new
  assertions require preparation with zero starts, context reuse on a real
  mouse commit, correct notation, and zero contexts/loads/starts when muted.
  Start counts only verify scheduling/silence contracts, not listening quality.
- Evidence root: `test-results/mouse-latency/`, including cold.log, warm.log,
  initial and post-fix CPU profiles, diagnostic source, and contracts-before.
  Current score backup: Downloads/Guitar before latency fix 2026-09-05.nxn.
  All earlier unperformed physical/listening gates remain open. Build, native
  smoke, final regression and push receipts follow in the execution handoff.

- Validation: all five automated domain groups passed (396 overlapping test
  executions); all 77 browser regressions passed without retries, failures or
  skips, including the two new audio-preparation contracts. Report:
  `test-results/notation-quality/2026-09-05T08-08-21.666Z-96787/report.json`.
  `electron:refresh` passed all 1,082 unit tests, production TypeScript/build,
  packaging and package verification.
- Actual packaged Electron editing: opened a separate 32-bar Guitar + TAB
  fixture, enabled Note Input with N and clicked written C4. The note and
  string-5/fret-3 TAB appeared together. Native Edit > Undo removed both and
  Redo restored both. Native NXN export was parsed and asserted to contain
  exactly that note on each staff (written C4, sounding C3). This is editing
  evidence, not a native latency benchmark or listening test. See
  `native-result.nxn`, `native-smoke.log` and the CUA transcript.
- iPad sync and Doctor passed. The fresh Xcode device build again failed at
  CodeSign of App.debug.dylib with `errSecInternalComponent`; this run did not
  install an older artifact as a substitute. Fresh iPad delivery and physical
  editing remain blocked. The Xcode macOS target is still absent.
- Remaining user check for this report: in the updated Mac app, enable Note
  Input, click five successive quarter notes, exit/re-enter Note Input and
  repeat. Record whether only the first click or every click lags; include
  score file, view/zoom and a screen recording showing the pointer and notes.
  Exact physical iPad/listening and other open-gate requirements remain in
  `notation-quality-participation.md`; the quality program is not complete.
- The 34-case notation pre-commit suite is reused from the successful 77-case
  run above; no runtime changes followed it. The normal post-commit macOS
  artifact build stamps the final revision. Commit/push and remote equality
  receipts are stored under `test-results/mouse-latency/verification.json`.
