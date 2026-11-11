# Note Input Architecture (Interactive Edit Map)

This document describes the deterministic note-input pipeline introduced for pointer and keyboard note entry.

## Goals

- one canonical target model for preview and commit
- shared commit path for mouse and keyboard
- deterministic X/Y resolution with explicit failure (`no commit`) on ambiguity
- canonical rhythmic targeting for every visible measure, including measures that only render a whole-measure rest
- fail-closed behavior for replace, insert, and chord workflows when the requested slot is not semantically valid
- preview/commit parity: a visible valid ghost must resolve to the same semantic target that commit uses
- small, testable modules instead of monolithic input logic in `ScoreEditor`

## Module Responsibilities

- [src/score-input/types.ts](../src/score-input/types.ts)
  - canonical data contracts:
  - `InteractiveEditMap`
  - `ResolvedEditTarget`
  - timestamp/pitch normalization helpers

- [src/score-input/edit-map.ts](../src/score-input/edit-map.ts)
  - builds a visible-scope map of:
  - measures -> staves -> slots (X/rhythm)
  - measures -> staves -> pitch lanes (Y/pitch)
  - emits diagnostics for missing or incomplete visible mapping

- [src/score-input/pointer-resolver.ts](../src/score-input/pointer-resolver.ts)
  - resolves pointer candidates into `ResolvedEditTarget`
  - validates measure/staff/slot visibility
  - rejects ambiguous non-insert voice targets (`null` instead of wrong-voice commit)

- [src/score-input/keyboard-resolver.ts](../src/score-input/keyboard-resolver.ts)
  - resolves keyboard intent (`replace` / `insert` / `chord`)
  - resolves X from anchor slot or relative insert timing
  - resolves voice deterministically from active voice + mode rules

- [src/score-input/note-entry-validator.ts](../src/score-input/note-entry-validator.ts)
  - validates resolved targets against canonical measure timing before mutation
  - rejects overfill, missing replace targets, incompatible slot coverage, and unsafe fragmented states
  - preserves explicitly validated overflow only when the rendered/synthetic snap evidence proves the target is an intended insert slot
  - annotates targets with replacement diagnostics so preview and commit share the same acceptance rules

- [src/score-input/commit-resolver.ts](../src/score-input/commit-resolver.ts)
  - single command generation entrypoint for resolved targets
  - maps to semantic commands (`changeNotePitch`, `changeNoteDuration`, `insertNote`, `insertNoteAt`)

- [src/shared/music/accidentals.ts](../src/shared/music/accidentals.ts) and [src/score-input/staff-pitch.ts](../src/score-input/staff-pitch.ts)
  - model explicit written standard accidentals separately from sounding pitch alter
  - resolve unarmed keyboard and mouse pitches from the latest same-staff, same-step, same-octave accidental earlier in the measure, then fall back to the effective key signature
  - map internal double-flat spelling to MusicXML `flat-flat` without losing semantic identity
  - enumerate conventional double-flat through double-sharp spellings for the same MIDI pitch and cycle them by diatonic staff position

- [src/score-core/query/note-editor.ts](../src/score-core/query/note-editor.ts)
  - expands a respell target to its complete same-part/staff/voice tied pitch chain before command construction
  - preserves the visible semantic selection while hidden tie continuations join the same atomic command batch

## Runtime Integration

- [components/ScoreEditor.tsx](../components/ScoreEditor.tsx)
  - builds and refreshes `InteractiveEditMap` from rendered geometry
  - binds ghost targets to resolved targets (`resolvedTarget` on ghost state)
  - validates ghost candidates against canonical timing, not just rendered anchors
  - pointer commit now consumes the same resolved model used for ghost preview
  - stale visible ghosts are not allowed to commit after live resolution invalidates them
  - rest-only internal slots are commit-capable only when the ghost target carries matching rendered/synthetic snap evidence and validator diagnostics
  - semantic snap diagnostics and protected-region checks preserve a validated
    first-slot rendered-rest target rather than moving it onto, or hiding it
    behind, the following pitched note
  - tablet cancellation through pointer cancellation, lost capture, Escape, or
    mode exit clears the prospective session and locked ghost; mode exit also
    releases the exact captured pointer before navigation resumes
  - loss of capture also discards a matching existing-note pitch or TAB drag
    for mouse, touch, and pen; a later release cannot commit it, and an unrelated
    pointer ID cannot cancel the active drag
  - touch and Pencil refinement retain only the latest queued Pointer Event and
    process it in one animation-frame callback; runtime metrics expose raw
    events, scheduled/processed frames, stable-target publications, latest/max
    sample latency, and semantic document regeneration during an active session
  - final horizontal placement is snap-derived: after target resolution, `previewLeft` is recomputed as `canonicalSnapX - noteheadCenterX`, and `resolvedTarget.domX` is the commit X

- [hooks/useNoteEditor.ts](../hooks/useNoteEditor.ts)
  - keyboard entry resolves through `resolveKeyboardEditTarget(...)`
  - pointer and keyboard both commit through `buildNoteEntryCommitCommands(...)`
  - commit is rejected before mutation when target validation fails
  - no-op clicked-note commits refresh the active note-input anchor so the next keyboard entry starts from the clicked note, not a stale cursor
  - tied-note input resolves the next rhythmic slot, validates chord replacement explicitly, clones the complete same-voice source chord at the active duration, toggles every tie by semantic pitch identity, and commits the whole action as one history transaction
  - entering Note Input clears selection-derived accidental state; an explicitly armed standard accidental is consumed only after one successful pitched commit, while subsequent matching pitches use measure carry without emitting another explicit glyph

- [components/ScoreInputOverlay.tsx](../components/ScoreInputOverlay.tsx)
  - ghost overlay now exposes mode/voice diagnostics via:
  - `data-ghost-mode`
  - `data-ghost-voice`
  - `data-ghost-diagnostics`

- [components/NoteInputToolbar.tsx](../components/NoteInputToolbar.tsx)
  - publishes one persistent, plain-language input-state summary on both the
    compact toolbar and sidebar surfaces
  - states navigation versus Note Input, active voice, Insert versus Replace,
    and Chord versus Single note without depending on active-button color
  - deliberately uses `aria-live="off"` so pitch refinement and pointer
    scrubbing never turn the summary into a high-frequency announcement stream

## Deterministic Resolution Rules

- explicit placement modes: `replace`, `insert`, `chord`
- explicit active voice input
- direct note input accepts the primary pointer button except for mouse
  Control-click; secondary, middle, stylus-barrel, and macOS Control-click
  presses do not enter selection/commit arbitration, do not prevent the
  platform context-menu gesture, and do not mutate document history
- `T` in note-input mode is a create-and-advance action, not the normal-mode tie toggle; a source chord produces a complete tied target chord
- X (slot/onset) and Y (pitch lane) resolved independently
- X is snap-locked: every visible ghost and every pointer commit must use the rendered snap-grid X for its timestamp. Pointer X may choose the nearest legal slot, but it must never become the notehead/commit X.
- the resolved horizontal coordinate is single-source: `RenderedGhostGrid` feeds `InteractiveEditMap`, `InteractiveEditMap` resolves `ResolvedEditTarget.domX`, and `ScoreEditor` rebases the visual ghost to that same X
- a core-backed leading-rest glyph is the authoritative timestamp-zero anchor
  when it lies beyond the system-start modifier guard, within the measure, and
  safely before the first pitched anchor; a stale, synthetic, modifier-overlap,
  or notehead-overlap candidate is still clamped or rejected
- final visual placement is always `previewLeft = canonicalSnapX - noteheadCenterX`
- If no rendered or explicitly synthetic snap-grid point exists for the resolved timestamp/staff/voice, pointer note input fails closed: no ghost and no commit.
- ambiguous or non-visible targets resolve to `null` (fail-closed)
- full-measure notes and full-measure rests are atomic: they expose only the element start anchor, and synthetic/internal beat slots inside them are invalid
- replace mode is only valid when a replaceable event covers the target slot
- insert mode is only valid when the requested duration fits the measure/voice capacity without unsafe overflow
- insert mode may preserve overflow only for an explicitly validated target, such as a proven rest-only internal slot or trailing silent snap, where preview and commit share the same snap evidence
- failed attempts must not mutate the measure or degrade future targeting in that measure
- an armed accidental is one-shot state, but its sounding alter carries to later matching staff positions in the measure across voices; octave changes and barlines reset that carry to their own context
- explicit accidental glyph and sounding alter must agree; command normalization rejects mismatches and the document validator exposes `written_accidental_pitch_mismatch` to strict Doctor
- cautionary intent and accidental enclosure are pitch-neutral note metadata; `setAccidentalDisplay` accepts only `none`, `round`, or `square`, requires an explicitly written glyph at execution, and maps to MusicXML `cautionary`, `parentheses`, and `bracket`
- enharmonic respelling must preserve sounding MIDI and event IDs; same-MIDI paired TAB edits preserve the existing string/fret rather than recalculating fingering

## Diagnostics

- score canvas diagnostics:
  - `data-edit-map-measure-count`
  - `data-edit-map-diagnostics`
- ghost diagnostics:
  - `data-ghost-mode`
  - `data-ghost-voice`
  - `data-ghost-diagnostics`
  - `data-ghost-commit-x`
  - `data-ghost-snap-trace`, including `effectiveSnap.x`, `resolvedTarget.domX`, `deltas.visibleNoteheadToSnap`, and `deltas.commitToSnap`
  - existing ghost pitch/timestamp attributes remain available
- validator diagnostics:
  - resolved slot, mode, rejection reasons, and existing-event metadata are available on inspected targets during tests and debug logging

Measured milestone results, corpus gaps, deterministic failure artifacts, and
the authoritative pointer-to-history pipeline are tracked in
[notation-entry-improvement-ledger.md](notation-entry-improvement-ledger.md).

## Test Coverage

- unit:
  - [test/score-input-edit-map.test.ts](../test/score-input-edit-map.test.ts)
  - [test/score-input-resolvers.test.ts](../test/score-input-resolvers.test.ts)
  - atomic beat-1 targeting in full-measure note/rest measures
  - replace rejection when no valid replace target exists
  - overfill rejection in insert mode
  - preview/commit parity for the same resolved input
  - standard accidental matrix (double-flat through double-sharp), one-shot arming, measure carry across voices, octave/barline reset, explicit-natural and MusicXML roundtrip fidelity
  - accidental entity identity, copy/paste preservation, paired notation/TAB mirroring, inverse-command restoration, and stale-glyph cleanup after transposition
  - `J` cycles natural, single-, and double-accidental spellings, preserves MIDI/entity identity, expands cross-measure ties, keeps paired TAB fingering, and groups selections into one Undo/Redo transaction
  - grace entry creates a distinct zero-duration semantic event before the selected anchor; the rhythmic anchor retains its identity and duration, paired notation/TAB receives a matching grace entity, and MusicXML cursor advancement uses the main event rather than the grace event
  - tuplet entry divides one semantic rhythmic slot rather than labeling a pre-existing range: the first note/chord/rest keeps its IDs, remaining equal units are rests ready for entry, the part division grid is rescaled exactly, paired notation/TAB receives a separate same-number span, and unsafe range/tie requests return `tuplet_command_rejected`; custom nested ratios and eligible range conversion are described in `note-entry-quality-2026-09-13.md`
  - beat-1 rest plus eighth-note mouse entry keeps visible notehead X and commit X on the same rendered rest snap
  - system-start normalization preserves a safely separated core-backed
    leading rest while continuing to clamp invalid, stale, or
    modifier-overlapping candidates

- e2e:
  - mouse entry into empty measures via measured canonical ghost slots
  - right-click and macOS Control-click on a valid shadow note leave MusicXML,
    history depth, Undo availability, and note count unchanged
  - toolbar mode exit during touch contact cancels the preview, releases pointer
    capture, and leaves subsequent pointer-up mutation-free
  - ghost preview timestamp parity with committed note placement
  - beat-1 rest/eighth-note hover and click regression in `e2e/snap-ghost-debug.spec.ts`
  - keyboard flows: replace, insert-between, chord entry
  - zoom/view-mode stability for post-layout note commit
  - cross-measure multi-click ghost sequences in blank piano measures
  - step-time anchor validation for standard notation and TAB fret entry
  - existing multi-voice and mouse note-entry regressions remain in `e2e/app.spec.ts`
  - rendered sharp-button feedback, sounding MIDI value, atomic two-step Undo/Redo, MusicXML glyph count, and clean strict Doctor in `e2e/notation-tools.spec.ts`

## Current Limitations / Follow-ups

- `InteractiveEditMap` is intentionally visible-scope: unresolved offscreen regions are not commit targets until rendered.
- keyboard insert timing is anchor-driven and deterministic; no heuristic cross-staff fallback is performed.
- ambiguous voice targets are intentionally rejected rather than auto-corrected.
- arbitrary overflow placement remains unsupported for note entry; unsupported overflow attempts are rejected instead of being auto-rewritten into a broken measure state.
- rest-only internal slots are intentionally narrow: they require real split-rest structure, validator approval, and matching ghost/commit diagnostics before mutation. A single full-measure rest never qualifies.
- broad editorial courtesy rules and view-specific concert/transposed `Cmd/Ctrl+J` respelling remain limited; the September previous-bar/always cautionary policy and explicit accidental glyph/enclosure intent use the semantic command path.


## September 2026 command and transport extensions

See [the implementation and evidence report](note-entry-quality-2026-09-13.md).
Prepared command proposals are baseline/fingerprint checked before history reuse;
semantic rejection rolls back the entire batch. `editRhythm` supplies bounded
voice/instrument/score time shifts, `replaceMidiPassage` applies reviewed takes,
and nested tuplets retain individual ratios with combined sounding duration.
The clipboard transports complete tuplets/graces with a source division grid.

`useMidiInput` selects one Web MIDI or CoreMIDI-backed port. `MidiStepAccumulator`
collects physical held keys, while `MidiTakeRecorder` and `useMidiRecording`
retain/quantize real-time events. Native code only transports device IDs, message
bytes and timestamp age. Both paths enter the existing shared semantic/history
pipeline. Opt-in stage metrics contain numeric durations only.

Nested bracket drawing is a bounded OSMD adapter correction: its native
per-note combined ratio cannot display independent nested ratios. Both the main
editor and print preview hide only affected native brackets in its render-only XML and draws
core-ratio brackets using rendered DOM positions converted into SVG coordinates.
Semantic/export XML is untouched. Browser assertions check both labels and
in-canvas geometry; ordinary tuplets retain the original rendering path.


Finalization keeps the renderer and core boundaries intact. Layout-only print
controls are projected into the current XML without another musical export.
VexFlow outline bounds use a bounded pure-geometry cache. Neither optimization
removes notes or skips commit validation. Printing is gated by the exact rendered
XML, with scalable SVG view boxes. History stores immutable result snapshots and
advances its base when the 100-entry window discards a prefix. MIDI access and
port-binding generations reject stale callbacks; recorder arming consumes input
before audio permission completes, and take application checks document identity.

## November 2026 trust invariants

Added by the note-entry mastery program (`docs/note-entry-mastery-ledger.md`, rows F1 to F18). Each
is covered by a test in `test/note-entry-*.test.ts` and by the entry fuzzer
(`test/entry-fuzz.test.ts`, `test/support/entry-fuzz.ts`), which drives the real editor and history
hooks through `test/support/app-harness.ts`.

- **History restores the input cursor.** A transaction carries `undoSelectionAnchor` and
  `redoSelectionAnchor` next to `selectionAnchor` (`hooks/useScoreDocument.ts`). Note-input commits
  record the cursor before and after the entry; `restoreSelection(anchor, reason)` in
  `hooks/useNoteEditor.ts` re-derives the last entered note (the event before the cursor in its
  voice) after Undo or Redo and drops the open input slur.
- **The selection never describes a stale event.** When the document changes, the selection, the
  last entry and the range anchor are refreshed from the document by entity id, so a note that
  became a rest is addressed as a rest. The core also rejects `changeNotePitch` on a rest
  (`pitch_command_rejected`).
- **One division grid per part.** `setStaffDivisionsAtMeasure` rescales every staff of the part,
  because MusicXML has one `<divisions>` per part; rescaling one staff of a grand staff corrupted the
  other staff's onsets on export.
- **The stored XML is exported from the normalized model** (`hybrid-command-executor.ts`), so the
  file and the model hold the same music. The fuzzer checks after every action that a re-export
  gives the same lanes, including tuplet membership.
- **A shorter value fills with rests** instead of moving the rest of the bar
  (`applyDurationChangeToVoice`).
- **Grace notes go with their main note.** At the end of `executeCoreCommands`, a grace whose main
  event the edit turned into a rest or removed is deleted with its links; graces that already stood
  before a rest are left alone.
- **Paste overwrites** in every entry mode; `R` outside note input is Repeat selection.

## November 2026 pending note and render window

Gate 3 of [note-entry-mastery-ledger.md](./note-entry-mastery-ledger.md); numbers and open decisions
are there under "Latency" and "Decisions".

**Pending note.** The document changes synchronously with the key; the engraver then draws the whole
score again, which takes as long as the score is large. Between the two the editor shows the entered
note itself.

- `hooks/useNoteEditor.ts` (`commitNoteInputUpdate`) publishes every pitched note entered by key or
  MIDI to `src/score-input/pending-entry.ts`, with the revision of the document that holds it. Mouse
  entry publishes nothing: its preview is at the place already, and a click keeps its timing.
- `components/ScoreEditor.tsx` draws the entries whose revision is newer than the drawing on screen
  (`pendingEntriesFor`), each at the place the caret logic gives for its position
  (`resolveInputPlace`), with `components/PendingNoteGlyph.tsx`. The glyph is plain SVG in staff
  spaces, drawn in the same pass: the engraved preview glyph is asynchronous and would miss the frame.
- The render effect waits for the frame that shows the pending note (`afterNextPaint`) before it
  starts the engraver, and settles the entries when its drawing has landed (`settlePendingEntries`).
  Any other change of the document (Undo, another command) clears them.

**What stays during a redraw.** The bar and system overlays, the staff geometry and
`lastRenderGeometryRef` (snap grid, staff details and overlays of the last complete drawing) stay
until the new drawing replaces them; the caret and the pending notes are placed with them. The snap
grid, edit map, rendered notes and ghost index that the pointer works with are empty during the
redraw. `renderedRevisionRef` is -1 from the start of a redraw until it has landed; the resize
handler (`syncRenderedMap`) does nothing in that time. It used to rebuild every map from the old
drawing after each change of the document, before the next frame, for a result the redraw replaced.

**Render window (built, not connected).** `src/render-bridge/osmd/render-window.ts` cuts the bars of
whole systems out of the stored MusicXML as text (`buildRenderWindowXml`): the bars keep their numbers
and content, and the first is given the divisions, key, time signature (not printed), clefs, staves
and transposition that hold there. `resolveRenderWindow` picks the systems around a focus with a
margin; `documentAllowsRenderWindow` excludes scores with octave lines or bar repeats, whose drawing
depends on bars before the window. The score view still gives the engraver the whole score.

**Bar numbers of a stored file.** The export numbers bars as the document counts them (a pickup is
bar 1). After every export the document takes those numbers as its `sourceMeasureNumber`
(`adoptExportedMeasureNumbers`), because the next export finds each bar of the file by it. A file
read with a pickup numbered 0 otherwise builds every bar from the bar before it from the second
export on (O5 in the ledger).
