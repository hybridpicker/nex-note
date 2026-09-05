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
