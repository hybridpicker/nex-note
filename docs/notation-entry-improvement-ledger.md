# Notation Entry Improvement Ledger

Updated: 2026-07-29

This ledger records measured mouse, touch, and Apple Pencil notation-entry
milestones. A milestone is complete only after its commit is pushed to
`origin/devel` and local `HEAD` matches the remote branch.

## Quality gates

| Metric | Target | Evidence through Milestone 1 | Status |
| --- | --- | --- | --- |
| Preview/commit parity | 100% across the regression corpus | 20 of 20 executed browser cases passed after preserving the authoritative rendered leading-rest anchor | PASS |
| Hover mutations | 0 | 0 in unit and Playwright coverage | PASS |
| Contact-preview mutations | 0 | 0 in unit and Playwright coverage | PASS |
| Cancellation mutations | 0 | 0 in unit and Playwright coverage | PASS |
| Wrong-staff commits | 0 | 0 observed in the executed corpus | PASS |
| Duplicate commits per gesture | 0 | 0 observed in the executed corpus | PASS |
| Incorrect active-voice commits | 0 | 0 observed in the executed corpus | PASS |
| Undo mismatches | 0 | 0 in covered workflows; the full workflow matrix is not yet covered | PARTIAL |
| Pointer-target failures without diagnostics | 0 | Commit misses and resolver failures publish Input Doctor or target diagnostics; corpus review is incomplete | PARTIAL |
| Mouse regressions introduced by tablet work | 0 | The deterministic beat-one mouse failure is fixed; all executed mouse regressions pass, and non-primary buttons are mutation-free | PASS |
| Tablet regressions introduced by mouse work | 0 | 6 of 6 tablet-entry Playwright cases passed, including captured toolbar mode exit | PASS |
| Stable tablet visual publications | At most one per animation frame | Tablet/coalesced moves retain only the latest sample and publish through one `requestAnimationFrame`; no runtime frame counter yet | PARTIAL |
| Full semantic regeneration during raw refinement | 0 | Session refinement is ref/state based and does not execute commands; no runtime regeneration counter yet | PARTIAL |
| Content-independent pitch mapping | Identical staff/Y mapping for blank, rest-only, and populated measures | Pure geometry tests pass; browser score-class matrix is incomplete | PARTIAL |
| Onset lock under minor horizontal drift | 100% | Unit and tablet Playwright cases pass | PASS |
| Pitch/staff hysteresis stability | 100% inside defined boundaries | Unit boundary and grand-staff lock coverage pass; physical hardware not run for this milestone | PARTIAL |

The parity denominator above excludes four semantic-grid fuzz cases that were
skipped because the opt-in `NEX_SEMANTIC_GRID_FUZZ=1` flag was not set. Those
seeds remain part of the broad corpus and must be run explicitly.

## Authoritative pipeline baseline

The current pointer path is:

1. `ScoreEditor` receives Pointer Events and converts client coordinates to the
   score container's fractional DOM coordinates.
2. OSMD/VexFlow-derived rendered geometry supplies measure overlays, staff
   details, rendered note hits, and the `RenderedGhostGrid`.
3. `InteractiveEditMap` exposes visible measure/staff/rhythmic slots and
   canonical staff pitch lanes.
4. `resolvePointerEditTarget(...)` resolves onset, staff, voice, pitch, and
   placement mode. `inspectResolvedEditTarget(...)` rejects invalid timing,
   ambiguous voice/chord targets, unsafe replacement, and overfill.
5. The visible ghost stores the accepted `ResolvedEditTarget` and publishes its
   pitch, onset, staff, voice, placement, commit X, diagnostics, and snap trace
   through `ScoreInputOverlay`.
6. Mouse `pointerdown` resolves a live guarded ghost and passes its resolved
   target to `onPlaceNoteAt(...)`. Touch/Pencil `pointerdown` stores that same
   target in `TabletEntrySession`; refinement replaces it only after another
   validated preview; `pointerup` commits the stored object without using
   release coordinates.
7. `useNoteEditor.placeNoteAt(...)` re-inspects the resolved target, builds
   commands through `buildNoteEntryCommitCommands(...)`, and executes one
   semantic history transaction.
8. The core document remains mutation authority. Its MusicXML projection feeds
   OSMD rendering, playback/export adapters, and subsequent geometry refresh.

The significant recomputation boundary is the mouse click path: hover owns a
validated ghost, but `pointerdown` also resolves a live candidate under
selection, rest, leading-buffer, and barline guards. This is intentionally
diagnosed, but the baseline failure below proves that a visible valid rest-snap
preview can still fail to reach mutation.

## Regression corpus inventory

| Score/input class | Current evidence | Gap |
| --- | --- | --- |
| Blank and full-measure-rest measures | Rendered-grid units, empty-score snap E2E, tablet fixture | Broader zoom/view matrix |
| Split rests and leading rests | Rendered-grid units and repeat-stable beat-one rest E2E | Broader zoom/view matrix |
| Dense passages and chords | Mouse precision second-cluster E2E, resolver units | Larger multi-voice chord ambiguity corpus |
| Voices 1-4 | Resolver and editor tests | Cross-part/staff browser matrix |
| Grand staff | Staff-lock units, piano semantic/snap fixtures | Physical touch/Pencil jitter |
| Treble, bass, alto, tenor clefs | Canonical pitch units | Browser direct-entry matrix for C clefs and clef changes |
| Accidentals and measure carry | Staff-pitch, semantic, history, and round-trip units | Direct-pointer browser matrix for every spelling |
| Ledger notes | Staff-pitch and overlay units | Browser matrix at three ledger lines above/below |
| Pickup/irregular measures | Round-trip and rhythm tests | Direct-pointer browser matrix |
| Tuplets and grace notes | Semantic/core and visible editor tests | Direct-pointer placement stress |
| Cross-measure ties | History/round-trip fixtures | Pointer-entry parity around tie endpoints |
| Paired notation/TAB | Guitar/TAB units and mouse precision E2E | Tablet and Electron TAB-heavy smoke |
| Page/continuous and zoom | Existing ghost/snap and app tests | Complete low/normal/high cross-product |
| Mouse | Precision, exhaustive grid, snap debug, non-primary-button safety | Broader modifier and rapid system-boundary matrix |
| Touch/Pencil | Session units and 5-case Playwright suite | Physical hover/no-hover/finger evidence |
| MusicXML/MuseScore/playback | Existing round-trip, MuseScore harness, and playback tests | Re-run broad interop proof after interaction fixes |

## Milestone 0 — Baseline, corpus, and observability

- Date: 2026-07-29
- Starting commit: `5b41fcc5f8bb93d19207014688995e37bec5b2ee`
- Observed problem: a visible, fully snap-aligned beat-one rest ghost in eighth
  note mode does not commit an eighth note when clicked.
- Reproduction fixture: `buildLeadingRestScore()` in
  `e2e/snap-ghost-debug.spec.ts`.
- Exact steps: boot `snap-leading-rest-eighth.musicxml`; enter Note Input;
  choose eighth-note duration; hover 6 px left of the measure-1 staff-1 voice-1
  beat-one rest snap; verify ghost notehead, effective snap, resolved target,
  and commit X are within 1 px of the same snap; click the ghost notehead.
- Input device and surface: mouse; Next.js regression surface in Chromium.
- Baseline result: the preview assertions pass, but no note event with
  `durationType === "eighth"` appears at timestamp `0`; the broad run failed
  1 of 20 executed cases, and an isolated `--repeat-each=3` run failed 3 of 3.
- Hypothesis: the click path is losing the visible rest-snap target while
  arbitrating live pointer resolution against direct rendered-rest selection or
  a click guard. The preview target itself is internally consistent.
- Files changed: this ledger.
- Automated evidence:
  - `npx tsx --test test/tablet-entry-session.test.ts test/staff-pitch.test.ts test/score-input-edit-map.test.ts test/score-input-resolvers.test.ts test/smart-ghost-note.test.ts test/rendered-ghost-grid.test.ts`
    — 120 passed, 0 failed.
  - `npx playwright test e2e/tablet-entry.spec.ts e2e/mouse-precision-stress.spec.ts e2e/snap-ghost-debug.spec.ts e2e/exhaustive-mouse-grid.spec.ts e2e/semantic-grid-fuzz.spec.ts --project regression`
    — 19 passed, 1 failed, 4 skipped.
  - `npx playwright test e2e/snap-ghost-debug.spec.ts --project regression --grep 'beat-one rest with eighth-note mouse entry previews and commits on the rest snap' --repeat-each=3`
    — 0 passed, 3 failed.
- Deterministic failure artifacts:
  - `test-results/playwright/snap-ghost-debug-beat-one--4da90-nd-commits-on-the-rest-snap-regression/test-failed-1.png`
  - `test-results/playwright/snap-ghost-debug-beat-one--4da90-nd-commits-on-the-rest-snap-regression/video.webm`
  - `test-results/playwright/snap-ghost-debug-beat-one--4da90-nd-commits-on-the-rest-snap-regression/trace.zip`
  - `test-results/playwright/snap-ghost-debug-beat-one--4da90-nd-commits-on-the-rest-snap-regression/error-context.md`
- Physical-device evidence: not run. Baseline documentation does not change
  the runtime; the existing 2026-07-28 device record remains authoritative.
- Performance evidence: source inspection confirms latest-sample
  `requestAnimationFrame` publication for tablet/coalesced moves. Runtime frame
  and regeneration counters remain a later observability gap.
- Remaining risks: the deterministic mouse parity defect is P1. C-clef,
  multi-voice, tuplet/grace, view/zoom, and physical-iPad cross-products are not
  yet complete. Semantic-grid fuzz was not enabled in this run.
- Commit SHA: `713b3ee0de96e23e64694baf6fa2248b542090f4`
- Push confirmation: pushed to `origin/devel`; local `HEAD` matched the remote.

## Milestone 1 — Preview/commit parity

- Date: 2026-07-29
- Starting commit: `713b3ee0de96e23e64694baf6fa2248b542090f4`
- Reproduction fixture and steps: the Milestone 0
  `buildLeadingRestScore()` mouse workflow, unchanged.
- Root cause: the renderer placed the leading rest at X `191.25`, but
  `normalizeSystemStartProtectedAnchors(...)` clamped its timestamp-zero anchor
  to X `229.82`, the left edge of the following C4 notehead. Semantic snap
  diagnostics repeated that clamp, while the generic protected-region overlay
  guard hid the corrected target. A click at the clamped position correctly
  selected the existing C4 under the pointer, so no eighth-note insertion or
  history transaction occurred.
- Fix: a real core-backed leading-rest glyph is now authoritative when it is
  past the system-start modifier guard, inside its measure, before the earliest
  pitched onset, and its rendered right edge remains safely before the first
  protected/pitched rectangle. First-measure normalization, semantic snap
  diagnostics, and overlay protection all preserve that exact target. Invalid,
  stale, synthetic, and modifier-overlapping rest anchors remain clamped or
  rejected.
- Selection contract: direct notehead selection and drag retain priority. The
  fix removes the false notehead overlap instead of weakening selection
  arbitration or recomputing a different commit target.
- Files changed:
  - `src/render-bridge/osmd/rendered-ghost-grid.ts`
  - `components/ScoreEditor.tsx`
  - `test/rendered-ghost-grid.test.ts`
  - `docs/note-input-architecture.md`
  - this ledger
- Automated evidence:
  - `npx tsx --test test/rendered-ghost-grid.test.ts` — 26 passed, 0 failed;
    the new regression failed before the implementation with expected X `191`
    and actual X `230`.
  - `npx tsx --test test/tablet-entry-session.test.ts test/staff-pitch.test.ts test/score-input-edit-map.test.ts test/score-input-resolvers.test.ts test/smart-ghost-note.test.ts test/rendered-ghost-grid.test.ts test/user-visible-note-editor.test.ts`
    — 282 passed, 0 failed.
  - isolated beat-one Playwright regression with `--repeat-each=3` — 3 passed,
    0 failed; ghost notehead, effective snap, resolved target, and commit X all
    measured `191.25`.
  - `npx playwright test e2e/tablet-entry.spec.ts e2e/mouse-precision-stress.spec.ts e2e/snap-ghost-debug.spec.ts e2e/exhaustive-mouse-grid.spec.ts --project regression`
    — 20 passed, 0 failed.
  - `npm test` — 1,070 passed, 0 failed.
  - `npm run build` — production build and TypeScript checks passed.
  - `npm run ipad:sync` and `npm run ipad:doctor` — standalone native bundle
    synchronized; native project, Xcode, disk, LAN, and Capacitor checks passed.
  - `npm run electron:refresh` — repeated all 1,070 unit tests and the
    production build, packaged the arm64 macOS app, and verified the package.
  - `git diff --check` — passed.
- Physical-device evidence: not run. This milestone corrects shared rendered
  geometry and pointer arbitration; native sync/doctor validation is required
  before commit, while physical touch/Pencil evidence remains Milestone 7.
- Performance evidence: no work was added to the raw pointer-move or
  animation-frame publication loops. The new checks execute while building or
  consuming rendered geometry.
- Remaining risks: C-clef, multi-voice, tuplet/grace, complete view/zoom, and
  physical-iPad cross-products remain incomplete. Existing fixture diagnostics
  for hidden strong beats remain visible in broad browser logs and require
  separate evidence before they are treated as an entry defect.
- Commit SHA: `990f6900dd2efb36279a885ccd06b156535ea29b`
- Push confirmation: pushed to `origin/devel`; local `HEAD` matched the remote.

## Milestone 2 — Professional mouse entry

- Date: 2026-07-29
- Starting commit: `990f6900dd2efb36279a885ccd06b156535ea29b`
- Observed problem: right-clicking a valid visible shadow note in `N` mode
  committed it as though the primary button had been pressed. Follow-up
  modifier inspection found the same missing context-menu distinction for
  macOS Control-click.
- Reproduction fixture: the blank four-measure grand-staff score in
  `e2e/mouse-precision-stress.spec.ts`.
- Exact steps: enter Note Input, choose quarter duration, hover a valid
  measure-1 bass-staff E2 shadow note, then right-click or Control-click its
  visible notehead.
- Input device and surface: mouse secondary button; Next.js regression surface
  in Chromium.
- Baseline result: the measured right-click inserted E2, changed the MusicXML,
  increased history depth from 0 to 1, and enabled Undo. The Control-click path
  had no separate guard before the fix.
- Root cause: `handlePointerDown(...)` gated double-click TAB editing and drag
  creation by `button === 0`, but the shared note-input commit block had no
  primary-button guard.
- Fix: note-input pointer handling now returns before focus, selection, target
  arbitration, `preventDefault`, or commit when `button !== 0` or a mouse
  Control-click is received. This also makes stylus barrel and middle-button
  presses safe while preserving the platform context-menu gesture.
- Files changed:
  - `components/ScoreEditor.tsx`
  - `e2e/mouse-precision-stress.spec.ts`
  - `docs/note-input-architecture.md`
  - this ledger
- Automated evidence:
  - the new exact Playwright regression failed before the fix with one inserted
    E2 and one history transaction; its final form covers both right-click and
    a held-Control primary click.
  - `npx playwright test e2e/mouse-precision-stress.spec.ts --project regression`
    — 4 passed, 0 failed.
  - `npx playwright test e2e/tablet-entry.spec.ts e2e/mouse-precision-stress.spec.ts e2e/snap-ghost-debug.spec.ts e2e/exhaustive-mouse-grid.spec.ts --project regression`
    — 21 passed, 0 failed.
  - `npm test` — 1,070 passed, 0 failed.
  - `npm run build` — production build and TypeScript checks passed.
  - `npm run ipad:sync` and `npm run ipad:doctor` — standalone native bundle
    synchronized and the native development checks passed.
  - `npm run electron:refresh` — repeated all 1,070 unit tests and the
    production build, packaged the arm64 macOS app, and verified the package.
  - `git diff --check` — passed.
- Physical-device evidence: not run. Mouse secondary-button behavior is local;
  the shared pointer guard will still be synchronized and checked in the native
  iPad bundle.
- Performance evidence: rejected non-primary presses return before geometry,
  React state, or semantic work.
- Remaining risks: broader Shift/Cmd/Ctrl/Alt browser coverage and rapid entry
  across system boundaries remain incomplete. Physical Pencil barrel behavior
  is not claimed without hardware evidence.
- Commit SHA: `89eab0e4700dbb70fd53f022c7d8d33c33433692`
- Push confirmation: pushed to `origin/devel`; local `HEAD` matched the remote.

## Milestone 3 — Apple Pencil and touch refinement

- Date: 2026-07-29
- Starting commit: `89eab0e4700dbb70fd53f022c7d8d33c33433692`
- Observed problem: exiting Note Input from the toolbar during an active touch
  preview cancelled the semantic session but left the pointer captured by the
  score viewport and retained the locked ghost reference.
- Reproduction fixture: `simple.musicxml` with the deterministic Pointer Events
  capture probe in `e2e/tablet-entry.spec.ts`.
- Exact steps: enter Note Input, touch a valid blank-staff target, verify
  contact-preview and capture for pointer ID 57, click the Note Input toolbar
  toggle, then release the original touch.
- Input device and surface: synthetic touch Pointer Events exercising the
  shared browser/WKWebView path in Chromium.
- Baseline result: mode exited and XML remained unchanged, but
  `hasPointerCapture(57)` stayed true after the session reached `cancelled`.
- Root cause: pointer-cancel, lost-capture, and Escape handlers released
  capture, while the reactive `noteInputMode === false` cleanup only cancelled
  session state.
- Fix: mode-exit cleanup now snapshots the active session, nulls it, releases
  its exact captured pointer, clears the visible-ghost lock and staff-switch
  pulse, then resets preview and drag state. The subsequent pointer-up has no
  session and cannot commit.
- Files changed:
  - `components/ScoreEditor.tsx`
  - `e2e/tablet-entry.spec.ts`
  - `docs/note-input-architecture.md`
  - `docs/ipad-direct-entry-qa.md`
  - this ledger
- Automated evidence:
  - the new exact regression failed before the fix because pointer ID 57
    remained captured.
  - `npx playwright test e2e/tablet-entry.spec.ts --project regression` —
    6 passed, 0 failed.
  - `npx playwright test e2e/tablet-entry.spec.ts e2e/mouse-precision-stress.spec.ts e2e/snap-ghost-debug.spec.ts e2e/exhaustive-mouse-grid.spec.ts --project regression`
    — 22 passed, 0 failed.
  - `npm test` — 1,070 passed, 0 failed.
  - `npm run build` — production build and TypeScript checks passed.
  - `npm run ipad:sync` and `npm run ipad:doctor` — standalone native bundle
    synchronized and native development checks passed.
  - `npm run electron:refresh` — repeated all 1,070 unit tests and the
    production build, packaged the arm64 macOS app, and verified the package.
  - `git diff --check` — passed.
- Physical-device evidence: not run. The test exercises the shared Pointer
  Events contract with deterministic capture instrumentation; real WKWebView,
  finger, and Pencil behavior remains unclaimed until Milestone 7.
- Performance evidence: cleanup adds no pointer-move work and removes stale
  capture/lock state immediately when the mode changes.
- Remaining risks: physical hover/no-hover behavior, two-finger navigation,
  orientation changes during contact, and real system-gesture takeover still
  require device evidence.
- Commit SHA: pending the Milestone 3 commit.
- Push confirmation: pending.

## Ranked open findings

| Severity | Finding | Next evidence-driven milestone |
| --- | --- | --- |
| P2 | Runtime counters do not yet prove one stable visual publication per frame or zero semantic regeneration during refinement | Milestone 5 observability and performance instrumentation |
| P2 | Several corpus classes have semantic/unit evidence but not a full direct-pointer browser matrix | Milestones 2–6 corpus expansion |
| P2 | Apple Pencil hover/no-hover and hands-on finger refinement remain unverified on unlocked physical hardware | Milestone 7 physical iPad evidence |
