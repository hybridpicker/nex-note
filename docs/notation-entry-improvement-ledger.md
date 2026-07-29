# Notation Entry Improvement Ledger

Updated: 2026-07-29

This ledger records measured mouse, touch, and Apple Pencil notation-entry
milestones. A milestone is complete only after its commit is pushed to
`origin/devel` and local `HEAD` matches the remote branch.

## Quality gates

| Metric | Target | Evidence through Milestone 6 | Status |
| --- | --- | --- | --- |
| Preview/commit parity | 100% across the regression corpus | 148 of 148 executed full-E2E cases, 23 of 23 focused pointer cases, and all four opt-in semantic-grid seeds passed after the Milestone 6 arbitration fixes | PASS |
| Hover mutations | 0 | 0 in unit and Playwright coverage | PASS |
| Contact-preview mutations | 0 | 0 in unit and Playwright coverage | PASS |
| Cancellation mutations | 0 | 0 in unit and Playwright coverage | PASS |
| Wrong-staff commits | 0 | 0 observed in the executed corpus | PASS |
| Duplicate commits per gesture | 0 | 0 observed in the executed corpus | PASS |
| Incorrect active-voice commits | 0 | 0 observed in the executed corpus | PASS |
| Undo mismatches | 0 | 0 in covered workflows; the full workflow matrix is not yet covered | PARTIAL |
| Pointer-target failures without diagnostics | 0 | Commit misses and resolver failures publish Input Doctor or target diagnostics; corpus review is incomplete | PARTIAL |
| Mouse regressions introduced by tablet work | 0 | The deterministic beat-one mouse failure is fixed; all executed mouse regressions pass, and non-primary buttons are mutation-free | PASS |
| Tablet regressions introduced by mouse work | 0 | 7 of 7 tablet-entry Playwright cases passed, including selected-note drag priority and captured toolbar mode exit | PASS |
| Stable tablet visual publications | At most one per animation frame | A 20-event burst schedules and processes one latest-sample frame and publishes at most one stable target | PASS |
| Full semantic regeneration during raw refinement | 0 | Runtime refinement metrics report zero semantic regenerations during the 20-event burst | PASS |
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
- Commit SHA: `dbb91f8551f97341e796f7f98b0f1f1a8df1c8d4`
- Push confirmation: pushed to `origin/devel`; local `HEAD` matched the remote.

## Milestone 4 — Explicit professional input state

- Date: 2026-07-29
- Starting commit: `dbb91f8551f97341e796f7f98b0f1f1a8df1c8d4`
- Observed problem: active voice, insertion policy, and chord intent were
  primarily represented by colored pressed buttons and terse `INS`, `OVR`,
  and `CHD` labels. The sidebar header omitted the inactive chord state
  entirely, so a musician had to infer whether the next action would replace,
  insert, or add a chord tone.
- Reproduction fixture: the standard notation-tools browser fixture and a
  direct `NoteInputToolbar` component render.
- Exact steps: inspect the notation controls in Navigation or Note Input,
  select voice 3, switch insertion policy, and toggle chord input.
- Input device and surface: keyboard/mouse-accessible notation controls on the
  shared Next.js/React surface.
- Baseline result: no stable state summary element existed; the new component
  regression failed with `No instances found with props:
  {"data-testid":"note-input-state-summary"}`.
- Root cause: the only combined state string used abbreviations in a collapsible
  sidebar section summary, while the compact toolbar exposed independent
  color-coded controls.
- Fix: both toolbar placements now show a persistent plain-language chip such
  as `Note Input · Voice 3 · Replace · Chord`. It carries stable mode data and
  a full accessible label, and explicitly names `Single note` when Chord is
  off. `aria-live="off"` prevents this persistent context from becoming a
  pointer-scrub announcement channel.
- Files changed:
  - `components/NoteInputToolbar.tsx`
  - `test/user-visible-components.test.ts`
  - `e2e/notation-tools.spec.ts`
  - `docs/note-input-architecture.md`
  - this ledger
- Automated evidence:
  - the exact component regression failed before implementation, then passed.
  - `npx tsx --test test/user-visible-components.test.ts` — 49 passed,
    0 failed.
  - `npx playwright test e2e/notation-tools.spec.ts --project regression
    --grep='states active voice and entry intent'` — 1 passed, 0 failed;
    the complete file passed 25/25.
  - `npx playwright test e2e/tablet-entry.spec.ts
    e2e/mouse-precision-stress.spec.ts e2e/snap-ghost-debug.spec.ts
    e2e/exhaustive-mouse-grid.spec.ts --project regression` — 22 passed,
    0 failed.
  - `npm test` — 1,071 passed, 0 failed.
  - `npm run build` — production build and TypeScript checks passed.
  - `npm run ipad:sync` and `npm run ipad:doctor` — standalone native bundle
    synchronized and native development checks passed.
  - `npm run electron:refresh` — repeated all 1,071 unit tests and the
    production build, packaged the arm64 macOS app, and verified the package.
  - `git diff --check` — passed.
- Physical-device evidence: not run. The state treatment is shared and will be
  synchronized into the native shell, but a real iPad claim is deferred to
  Milestone 7.
- Performance evidence: the summary derives from existing render state and
  adds no pointer listeners, geometry reads, semantic regeneration, or live
  announcements.
- Remaining risks: localization of the new state vocabulary and physical
  readability at iPad scale still need separate evidence.
- Commit SHA: `31646bbc9d853dfb8d0a8067e8b9bb35e59ed681`
- Push confirmation: pushed to `origin/devel`; local `HEAD` matched the remote.

## Milestone 5 — Performance, accessibility, and resilience

- Date: 2026-07-29
- Starting commit: `31646bbc9d853dfb8d0a8067e8b9bb35e59ed681`
- Observed problem: touch and Pencil pointer moves were already coalesced onto a
  latest-event animation-frame path, but the runtime exposed no proof that a
  burst scheduled and processed only one frame, published at most one stable
  target, or avoided semantic document regeneration. Latency was therefore an
  assumption rather than a measurement.
- Reproduction fixture: `simple.musicxml` in `e2e/tablet-entry.spec.ts`.
- Exact steps: start one touch contact on a blank valid staff position, dispatch
  20 refinement moves synchronously in a single browser task, wait two browser
  frames, and inspect runtime refinement metrics before cancellation.
- Input device and surface: synthetic touch Pointer Events on the shared
  browser/WKWebView path.
- Baseline result: the exact regression received `null` because no pointer
  refinement metrics interface existed.
- Root cause: the latest-sample RAF mechanism had behavioral coverage but no
  counters for raw events, scheduling, processing, stable publication,
  latency, or semantic regeneration during contact.
- Fix: each tablet session now resets a lightweight metrics record. Raw
  touch/Pencil events replace the queued sample, only the first event schedules
  the frame, and the frame records latest-sample latency immediately before
  processing. Stable semantic-preview changes and XML regeneration during an
  active contact are counted separately. A read-only browser getter exposes a
  snapshot for diagnostics and removes itself when the editor unmounts.
- Accessibility/resilience audit:
  - pitch chips retain localized readable labels but are neither a status role
    nor an ARIA live region, so scrubbed lanes are not announced continuously;
  - the existing `prefers-reduced-motion: reduce` rule collapses all preview
    animation and transition durations;
  - pointer, resize, scroll, wheel, keyboard, capture, and custom listeners
    inspected in `ScoreEditor` all retain matching cleanup paths;
  - per-pitch audition remains deduplicated and interval-gated by the tablet
    session reducer.
- Files changed:
  - `components/ScoreEditor.tsx`
  - `e2e/tablet-entry.spec.ts`
  - `test/user-visible-components.test.ts`
  - `docs/note-input-architecture.md`
  - `docs/ipad-direct-entry-qa.md`
  - this ledger
- Automated evidence:
  - the exact browser regression failed before instrumentation because the
    getter was absent, then passed with 20 raw events, 1 scheduled frame,
    1 processed latest sample, no more than 1 stable publication, 0 semantic
    regenerations, and unchanged MusicXML.
  - `npx tsx --test test/tablet-entry-session.test.ts
    test/user-visible-components.test.ts` — 61 passed, 0 failed.
  - `npx playwright test e2e/tablet-entry.spec.ts --project regression` —
    7 passed, 0 failed.
  - `npx playwright test e2e/tablet-entry.spec.ts
    e2e/mouse-precision-stress.spec.ts e2e/snap-ghost-debug.spec.ts
    e2e/exhaustive-mouse-grid.spec.ts --project regression` — 23 passed,
    0 failed.
  - `npm test` — 1,071 passed, 0 failed.
  - `npm run build` — production build and TypeScript checks passed.
  - `npm run ipad:sync` and `npm run ipad:doctor` — standalone native bundle
    synchronized and native development checks passed.
  - `npm run electron:refresh` — repeated all 1,071 unit tests and the
    production build, packaged the arm64 macOS app, and verified the package.
  - `git diff --check` — passed.
- Physical-device evidence: not run. Browser RAF and Pointer Event evidence
  covers the shared runtime; physical Pencil latency remains a Milestone 7
  claim.
- Performance evidence: deterministic counter assertions above plus recorded
  non-negative latest/max sample latency; no raw event creates React state.
- Remaining risks: WebKit scheduling under real Pencil load and long-session
  memory/audio behavior still need physical-device observation.
- Commit SHA: `586988b1f75515b96c4df04788d33b734636dbfe`
- Push confirmation: pushed to `origin/devel`; local `HEAD` matched the remote.

## Milestone 6 — Cross-surface and interoperability proof

- Date: 2026-07-29
- Starting commit: `586988b1f75515b96c4df04788d33b734636dbfe`
- Observed problem: the first broad E2E run exposed two load-sensitive workflow
  failures and seven deterministic notation-entry failures. The deterministic
  set covered a blank-measure follow-up, a fourth-chord placement, a rapid
  multi-click boundary, clicked-pitch activation in another voice, direct and
  chord-tone drag arbitration, and the long Dunhill workflow plus its dependent
  transform scenario.
- Baseline result: `npm run test:e2e` completed with 139 passed, 4 skipped, and
  9 failed. Bounded reruns cleared the two load-sensitive file-workflow cases
  and reproduced the seven notation failures.
- Root causes:
  - window-level native listeners were replaced through passive-effect cleanup,
    leaving a short post-render interval where a rapid click could execute the
    previous score geometry and semantic-document closure;
  - broad glyph hit boxes could steal an explicit visible ghost at another
    semantic onset, while chord-tone drag protection was not scoped to the
    active selected tone;
  - default voice 1 treated a rendered note in another voice differently from
    voices 2–4, so pitch retargeting could silently activate the clicked voice.
- Fix:
  - stable window listeners now dispatch through render-updated handler refs,
    and tablet take-off dispatches through the latest commit callback;
  - pointer arbitration gives an active same-onset SVG notehead selection/drag
    priority, while a visible ghost at another onset or over an unselected chord
    tone remains actionable;
  - cross-voice rendered-note targeting now preserves the selected input voice
    consistently for every voice, including voice 1.
- Files changed:
  - `components/ScoreEditor.tsx`
  - `src/score-input/pointer-entry-mode.ts`
  - `test/score-input-resolvers.test.ts`
  - `docs/note-input-parity-matrix.md`
  - this ledger
- Automated evidence:
  - resolver regression file — 44 passed, 0 failed.
  - repaired focused workflows, full Dunhill workflow, and dependent transform
    workflow — all passed in bounded reruns.
  - `npm run test:e2e` — 148 passed, 4 opt-in fuzz cases skipped, 0 failed in
    26.5 minutes; the full Dunhill Melody stress passed in 12.9 minutes.
  - pointer corpus (`tablet-entry`, `mouse-precision-stress`,
    `snap-ghost-debug`, `exhaustive-mouse-grid`) — 23 passed, 0 failed.
  - opt-in semantic-grid seeds 1000–1003 — 4 passed, 0 failed.
  - Guitar/TAB smoke — 4 passed, 0 failed.
  - interoperability corpus covering MusicXML export/reimport, golden
    roundtrips, Guitar Pro/TAB semantics, playback cursor, history replay,
    inverse commands, and MuseScore classification — 142 passed, 0 failed.
  - `npm test` — 1,072 passed, 0 failed.
  - `npm run build` — production build and TypeScript checks passed.
  - `npm run ipad:sync` and `npm run ipad:doctor` — standalone bundle
    synchronized; native project, Xcode 26.6, Capacitor packages, LAN
    configuration, and disk checks passed.
  - `npm run electron:refresh` — repeated all 1,072 unit tests and the
    production build, packaged the arm64 macOS app, and verified its source
    fingerprint. The packaged app then launched its embedded Next server and
    renderer process and quit cleanly.
  - strict Doctor assertions in the rendered notation-tool corpus passed.
    Imported stress fixtures still surface their expected pre-existing rhythm
    projection diagnostics; those fixture findings were not reclassified as
    clean documents.
  - `git diff --check` — passed.
- MuseScore evidence:
  - MuseScore 4.7.3 returned the aggregate harness verdict
    `passed-with-local-musescore-limit`, but this is **not** recorded as a Nex
    Note interoperability pass.
  - The first final run contained a `piano-semantics` Nex Note MXL reopen
    `SIGABRT` while one source baseline path reopened. An exact rerun with four
    attempts reopened the Nex Note MXL successfully while source MXL conversion
    and reopen steps crashed with the same `mutex lock failed` error. The
    behavior is nondeterministic and remains an external-tool limitation rather
    than proof of product correctness.
  - Full-run artifacts:
    `.nex/musescore-roundtrip-smoke-2026-07-29T07-33-17-982Z`.
    Exact-rerun artifacts:
    `.nex/musescore-roundtrip-smoke-2026-07-29T07-35-00-196Z`.
- Surface evidence:
  - Next.js shared runtime — full browser and production-build proof passed.
  - Electron macOS — packaged, fingerprint-verified, and launch-process smoke
    passed; audible hands-on output was not claimed.
  - Native iPad — standalone bundle synchronization and Doctor passed;
    physical-device gesture evidence is Milestone 7.
  - Xcode macOS — not run because the target remains planned and is not present.
- Remaining risks: hands-on Pencil/finger behavior and audible hardware output
  remain unverified. MuseScore CLI stability prevents a clean external-oracle
  pass on this Mac, and broader per-workflow export/history matrix rows can
  still grow.
- Commit SHA: pending the Milestone 6 commit.
- Push confirmation: pending.

## Ranked open findings

| Severity | Finding | Next evidence-driven milestone |
| --- | --- | --- |
| P2 | Several corpus classes have semantic/unit evidence but not a full direct-pointer browser matrix | Milestones 2–6 corpus expansion |
| P2 | Apple Pencil hover/no-hover and hands-on finger refinement remain unverified on unlocked physical hardware | Milestone 7 physical iPad evidence |
