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

## Runtime Integration

- [components/ScoreEditor.tsx](../components/ScoreEditor.tsx)
  - builds and refreshes `InteractiveEditMap` from rendered geometry
  - binds ghost targets to resolved targets (`resolvedTarget` on ghost state)
  - validates ghost candidates against canonical timing, not just rendered anchors
  - pointer commit now consumes the same resolved model used for ghost preview
  - stale visible ghosts are not allowed to commit after live resolution invalidates them
  - rest-only internal slots are commit-capable only when the ghost target carries matching rendered/synthetic snap evidence and validator diagnostics
  - final horizontal placement is snap-derived: after target resolution, `previewLeft` is recomputed as `canonicalSnapX - noteheadCenterX`, and `resolvedTarget.domX` is the commit X

- [hooks/useNoteEditor.ts](../hooks/useNoteEditor.ts)
  - keyboard entry resolves through `resolveKeyboardEditTarget(...)`
  - pointer and keyboard both commit through `buildNoteEntryCommitCommands(...)`
  - commit is rejected before mutation when target validation fails
  - no-op clicked-note commits refresh the active note-input anchor so the next keyboard entry starts from the clicked note, not a stale cursor

- [components/ScoreInputOverlay.tsx](../components/ScoreInputOverlay.tsx)
  - ghost overlay now exposes mode/voice diagnostics via:
  - `data-ghost-mode`
  - `data-ghost-voice`
  - `data-ghost-diagnostics`

## Deterministic Resolution Rules

- explicit placement modes: `replace`, `insert`, `chord`
- explicit active voice input
- X (slot/onset) and Y (pitch lane) resolved independently
- X is snap-locked: every visible ghost and every pointer commit must use the rendered snap-grid X for its timestamp. Pointer X may choose the nearest legal slot, but it must never become the notehead/commit X.
- the resolved horizontal coordinate is single-source: `RenderedGhostGrid` feeds `InteractiveEditMap`, `InteractiveEditMap` resolves `ResolvedEditTarget.domX`, and `ScoreEditor` rebases the visual ghost to that same X
- final visual placement is always `previewLeft = canonicalSnapX - noteheadCenterX`
- If no rendered or explicitly synthetic snap-grid point exists for the resolved timestamp/staff/voice, pointer note input fails closed: no ghost and no commit.
- ambiguous or non-visible targets resolve to `null` (fail-closed)
- full-measure notes and full-measure rests are atomic: they expose only the element start anchor, and synthetic/internal beat slots inside them are invalid
- replace mode is only valid when a replaceable event covers the target slot
- insert mode is only valid when the requested duration fits the measure/voice capacity without unsafe overflow
- insert mode may preserve overflow only for an explicitly validated target, such as a proven rest-only internal slot or trailing silent snap, where preview and commit share the same snap evidence
- failed attempts must not mutate the measure or degrade future targeting in that measure

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

## Test Coverage

- unit:
  - [test/score-input-edit-map.test.ts](../test/score-input-edit-map.test.ts)
  - [test/score-input-resolvers.test.ts](../test/score-input-resolvers.test.ts)
  - atomic beat-1 targeting in full-measure note/rest measures
  - replace rejection when no valid replace target exists
  - overfill rejection in insert mode
  - preview/commit parity for the same resolved input
  - beat-1 rest plus eighth-note mouse entry keeps visible notehead X and commit X on the same rendered rest snap

- e2e:
  - mouse entry into empty measures via measured canonical ghost slots
  - ghost preview timestamp parity with committed note placement
  - beat-1 rest/eighth-note hover and click regression in `e2e/snap-ghost-debug.spec.ts`
  - keyboard flows: replace, insert-between, chord entry
  - zoom/view-mode stability for post-layout note commit
  - cross-measure multi-click ghost sequences in blank piano measures
  - step-time anchor validation for standard notation and TAB fret entry
  - existing multi-voice and mouse note-entry regressions remain in `e2e/app.spec.ts`

## Current Limitations / Follow-ups

- `InteractiveEditMap` is intentionally visible-scope: unresolved offscreen regions are not commit targets until rendered.
- keyboard insert timing is anchor-driven and deterministic; no heuristic cross-staff fallback is performed.
- ambiguous voice targets are intentionally rejected rather than auto-corrected.
- arbitrary overflow placement remains unsupported for note entry; unsupported overflow attempts are rejected instead of being auto-rewritten into a broken measure state.
- rest-only internal slots are intentionally narrow: they require real split-rest structure, validator approval, and matching ghost/commit diagnostics before mutation. A single full-measure rest never qualifies.
