# Iterative Prompt: MuseScore-grade mouse note entry

Updated: 2026-10-03

Work in the existing repository on the `devel` branch. Make mouse note entry in
Nex Note as precise, predictable and versatile as MuseScore Studio. Work in
iterations until the exit criteria at the end are met. Do not stop after one
fix, one passing test run or one plausible-looking improvement.

Use English for code, identifiers, comments, tests, commit messages and
technical docs. Preserve unrelated worktree changes. Follow `AGENTS.md`
(multi-app invariant, required workflow, handoff gates) and the privacy rules in
the global instructions.

## Ground rules

- Product behavior lives in the shared Next.js/React/core implementation. Every
  mutation goes through the semantic command path (`InteractiveEditMap`,
  `src/score-input/*`, validator, commit resolver, `useNoteEditor`,
  `ScoreEditor`). Do not add a pixel-derived or renderer-owned mutation path.
  OSMD/VexFlow supply geometry only.
- Do not rewrite the editor around a new notation library
  (`docs/note-input-open-source-research.md`).
- Invariant to protect and extend: the visible preview (ghost note, cursor,
  highlight) equals exactly what a click commits. Hover never mutates. A failed
  or ambiguous attempt is a diagnosed no-op and never poisons later input.
- Every mouse action is one atomic Undo/Redo step and survives save, reopen and
  MusicXML/MXL roundtrip.
- Only synthetic or repository fixtures (`test/fixtures`, `e2e/fixtures`). No
  real student, staff or other personal data. Do not read external/network
  mounts.
- Browser-launching tests (Playwright, Electron, headed runs) are run by the
  operator. Write and prepare them, state the exact command, and ask the
  operator to run them and paste the result. Never claim a browser or
  device surface as verified without that evidence. Unit tests and builds you
  may run yourself.

## Source material (read first, every session)

1. `docs/note-input-parity-matrix.md`, `docs/note-input-architecture.md`,
   `docs/notation-entry-improvement-ledger.md`,
   `docs/notation-quality-program.md`, `docs/keyboard-shortcuts.md`,
   `docs/multi-app-development-flow.md`.
2. The existing mouse suites: `e2e/mouse-precision-stress.spec.ts`,
   `e2e/exhaustive-mouse-grid.spec.ts`, `e2e/semantic-grid-fuzz.spec.ts`,
   `e2e/manual-hover-fix.spec.ts`, `e2e/snap-ghost-debug.spec.ts`,
   `e2e/note-entry-quality.spec.ts`, `test/score-input-resolvers.test.ts`,
   `test/note-entry-workflows.test.ts`.
3. The current MuseScore Studio handbook (note input, selection, palettes,
   voices, accidentals, ties, tuplets, grace notes, cross-staff, TAB, percussion,
   zoom/pan, drag behavior). Verify behavior against the live handbook and
   record the URL and date per row. Do not rely on memory, and do not copy
   MuseScore source code.

## State file (create in iteration 0, update every iteration)

`docs/mouse-note-entry-musescore-parity-ledger.md` is the single source of
truth for this program. It contains:

- the capability checklist below as a table: ID, MuseScore behavior (with
  handbook link), current Nex Note behavior, gap, test evidence, surface
  evidence (web / Electron mac / Electron Linux / iPad / Xcode mac), status
  (`TODO`, `IN PROGRESS`, `PASS`, `PARTIAL`, `BLOCKED` + reason);
- an iteration log: commit SHA, what was measured, what changed, gates run and
  their results, gates not run and why, next highest-priority item.

A new session resumes from this file. Never mark a row `PASS` without a
behavioral test that fails before the fix and passes after, plus the surfaces
actually run.

## Capability checklist (seed the ledger from this; extend when the handbook shows more)

### A. Precision and targeting

- A1 Shadow note on hover in note-input mode: correct staff step, ledger lines
  far above/below, correct accidental per key signature and measure memory,
  clef-aware (treble, bass, alto, tenor, percussion, 8va/8vb clefs),
  transposing-instrument aware.
- A2 Horizontal targeting: snap to the intended rhythmic position, including
  empty measures, partially filled measures, rests, gaps between notes,
  mid-measure positions, pickup and final measures, repeats, voltas.
- A3 Staff disambiguation between adjacent staves and systems; explicit
  staff/voice lock; behavior when the pointer is between staves.
- A4 Stability across zoom (25–400 %), page vs continuous view, HiDPI,
  scrolled/offset viewports, window resize, system/page breaks, and
  repositioned layouts. No pitch or onset change merely because content
  changed elsewhere.
- A5 Hit-testing of existing elements: notes, noteheads in chords, rests,
  stems, beams, ties, slurs, accidentals, articulations, dynamics, lyrics,
  chord symbols, barlines, clefs, key/time signatures; correct priority when
  elements overlap; tolerance sized in screen pixels.
- A6 Preview/commit parity: ghost, status text (pitch, duration, voice,
  accidental), commit, selection, playback audition and export all agree.

### B. Entering material with the mouse

- B1 Click on staff enters the note with the current duration, dot, accidental
  and voice; click on a rest replaces it; click beyond the written measure
  follows documented measure-fill behavior.
- B2 Add to chord with the mouse (documented modifier or click on an existing
  chord position); stack intervals; remove one chord tone.
- B3 Duration palette from 64th to longa, dots (1–3), rests, tuplets (duplet to
  nonuplet and custom ratios, nested), grace notes (acciaccatura,
  appoggiatura, groups), ties across barlines, repeated-note entry, insert vs
  overwrite mode.
- B4 Pre-entry accidentals (flat, natural, sharp, double), applying only to the
  next note, with MuseScore-equivalent measure rules; respell.
- B5 Voices 1–4 with mouse: correct stem direction, rest handling, preview
  color by voice, entry staying in the selected voice.
- B6 Multi-staff and cross-staff: grand staff, choir, ensemble; cross-staff
  entry/move; staff lock; instrument-specific ranges and warnings.
- B7 TAB and percussion/drum staves with the mouse: fret entry on string lines,
  drum pad / staff-position entry, linked standard+TAB staves stay in sync.
- B8 Rhythm correction and meter edge cases: ties over barlines, compound
  meters, mixed meters, changing meters, beam groups; failures reject
  atomically with a visible reason.

### C. Editing existing material with the mouse

- C1 Selection: click, Shift+click range, Ctrl/Cmd+click list, rubber-band
  rectangle, select whole measure/system/staff, selection feedback, deselect.
- C2 Drag note vertically to change pitch (diatonic snap, modifier for
  chromatic/octave), drag horizontally where meaningful (move/copy with
  modifier), drag across staves, drag to another measure; live preview, cancel
  with Escape or lost pointer capture, single Undo step.
- C3 Delete, cut, copy, paste, duplicate, repeat, and swap voice by mouse and
  context menu.
- C4 Drag-and-drop or click-apply from palettes: articulations, ornaments,
  dynamics, hairpins, slurs, clefs, key and time signatures, tempo, text, chord
  symbols, lyrics, fingerings, barlines, repeats, tuplets. Apply to a single
  note or a selected range with identical semantics.
- C5 Spanners: create slur/hairpin/ottava/pedal/line over a selection or by
  drag; drag end handles; extend or shorten; correct behavior across systems.
- C6 Direct manipulation handles for stems, beams, ties, slurs, offsets;
  reset to default; persistence through save and reopen.
- C7 Context menu and right-click behavior on every element class.

### D. Navigation and feedback

- D1 Scroll, Ctrl/Cmd+wheel zoom anchored at the pointer, middle-drag/hand
  pan, keyboard + mouse mixed use without mode confusion.
- D2 Status line / tooltip feedback: pitch name, octave, MIDI number,
  duration, voice, staff, measure and beat, concert vs written pitch.
- D3 Cursor shapes and mode indicators matching the active tool; visible,
  accessible, color-independent voice and selection indication.
- D4 Audition on entry/hover-commit (optional), without hanging notes after
  cancel, stop, seek or score close.
- D5 Touch/Pencil and mouse share the same resolver; mouse behavior must not
  regress native iPad behavior (`e2e/tablet-entry.spec.ts`).

### E. Robustness and performance

- E1 Zero wrong-target commits across the exhaustive grid and fuzz corpora at
  75/100/150/200 % zoom and on every fixture class (piano, choir, leadsheet,
  repeats, cross-measure tie, tuplets, grace notes, TAB, percussion,
  transposing, multi-voice, large orchestral score).
- E2 p95 visible preview response ≤ 50 ms on recorded hardware for small and
  medium scores; record large-score numbers honestly and improve them.
- E3 No duplicate commits, stuck pointer states, stale ghost after document
  change, blur, tab hide, resize, or undo.
- E4 Accessibility: keyboard parity for every mouse operation, focus
  visibility, screen-reader labels for ghost/status where feasible.

## Iteration loop (repeat until exit criteria are met)

Each iteration is one bounded improvement with an observable before/after.

1. **Orient.** Run `npm run apps:plan` and `git status`. Read the ledger and
   pick up the log's "next" item. Re-run `npm run apps:plan` if scope widens.
2. **Measure.** Reproduce the target behavior on a fixed fixture. Compare it
   with the MuseScore handbook behavior. Record commit, fixture, zoom, view mode
   and exact actions. Prefer deterministic geometry tests over screenshots
   alone; when a visual check is required, prepare it for the operator.
3. **Select.** Priority order: score corruption or lost work > wrong
   pitch/onset/voice committed > blocked workflow > ambiguity without feedback >
   speed and polish. One row or one coherent slice per iteration.
4. **Reproduce.** Add a failing regression first (unit test in `test/`, or an
   e2e spec for the operator to run). Confirm it fails for the intended reason.
5. **Implement** through the shared semantic core. Keep the diff small. Update
   keyboard-shortcut docs, user manuals (`docs/user-manual*.md`, all five
   languages when user-visible text changes; `lib/i18n.tsx`) and the parity
   matrix in the same change.
6. **Verify.**
   - Always: focused tests, then `npm test` and `npm run build` for shared
     runtime changes, and `git diff --check`.
   - Shared user-visible or native-access change: `npm run ipad:sync`,
     `npm run ipad:doctor`; Electron changes: `npm run electron:refresh`.
   - Hand the operator the exact Playwright/Electron commands for the touched
     specs (for example `npx playwright test e2e/mouse-precision-stress.spec.ts
     --project regression`) and wait for their results before a row becomes
     `PASS` on a browser or app surface.
   - A change that breaks another input method (keyboard, MIDI, touch, Pencil)
     does not graduate.
7. **Record.** Update the ledger row, the iteration log, the parity matrix, and
   list gates that were not run with the reason. Failing gates stay visible.
8. **Commit.** Stage only this iteration's files and commit on `devel` with an
   English message and the repository's attribution trailer. Push to
   `origin/devel` only as the existing notation quality program already
   authorizes for `devel`; never force-push, integrate remote changes and
   re-verify first, and report the pushed SHA. If push is not possible, state
   it as an open step.
9. **Re-plan.** Choose the next row. Re-rank the backlog when new defects
   surface. Do not ask for permission between iterations; stop only for a
   decision that genuinely belongs to the operator (e.g. a product trade-off
   with no handbook answer, a dependency addition, a missing credential or
   device).

## Escalation rules

- A row that cannot be completed on a surface (no iPad, no Xcode target, no
  MIDI hardware, MuseScore crash) becomes `BLOCKED` with the reason and the
  operator action needed. Continue with the next row.
- If three consecutive iterations fail to move the same row, stop iterating
  on it, write down what was tried and the hypothesis, and switch rows.
- If a MuseScore behavior is ambiguous or differs between versions, record both
  and pick the documented current-version behavior unless it conflicts with an
  existing Nex Note invariant; note the decision in the ledger.

## Exit criteria (the only way to finish)

The program is finished only when all of the following hold at the same commit:

1. Every ledger row is `PASS` or `BLOCKED` with a reason the operator has
   acknowledged. No `TODO`, `IN PROGRESS` or unexplained `PARTIAL` rows.
2. `npm test` and `npm run build` pass; `git diff --check` is clean.
3. The operator-run mouse suites (precision stress, exhaustive grid, semantic
   grid fuzz, hover, ghost debug, note-entry quality, tablet entry,
   performance) pass at that commit, with their output recorded in the ledger.
4. `npm run ipad:sync` and `npm run ipad:doctor` pass; Electron refresh passes;
   surfaces not run (physical iPad, Xcode macOS target, Linux packaging) are
   named with reasons.
5. A final **audit iteration** is done with fresh eyes: re-read the whole
   checklist against the live MuseScore handbook, run a scripted
   "enter a 16-bar piano piece with the mouse only" task on three fixtures
   (task time, clicks, corrections, wrong-target commits = 0), and confirm no
   regression in keyboard, MIDI and touch entry.
6. The final report states what was verified on which surface, what was not,
   and every residual difference from MuseScore. It does not claim "full
   MuseScore parity" or compliance beyond the recorded evidence.

Begin with iteration 0: create the ledger from the checklist, fill the "current
behavior" column from the code and existing tests, rank the gaps, and start
iteration 1 on the highest-priority gap.
