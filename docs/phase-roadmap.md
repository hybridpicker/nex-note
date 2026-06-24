# Product Roadmap: Phase 1 to Phase 5

This document is the initial delivery roadmap, not the current progress tracker.

## Purpose

This roadmap turns the architectural direction of `nex-note` into a delivery sequence.

The goal is not just to add features. The goal is to move the product from an AI-assisted MusicXML editor toward a professional notation system with:

- a reliable semantic score core
- a replaceable rendering and engraving stack
- fast professional editing workflows
- AI as an accelerator, not as a fragile dependency

The phases below are intentionally sequential. Later phases depend on earlier phases being operational, testable, and stable.

## Delivery Principles

- Every phase must end in a usable product increment.
- Core model and command execution take priority over direct format patching.
- MusicXML remains an import/export boundary, not the source of truth.
- AI should operate on semantic commands and validated context, never on raw XML mutations.
- Rendering quality is a product requirement, not a cosmetic follow-up.

## Phase 1: Core Stabilization

### Goal

Make `nex-note` a reliable semantic score editor with consistent execution, validation, and history behavior.

### Focus

- treat `ScoreDocumentModel` as the canonical notation state
- ensure all public edit actions flow through the centralized command pipeline
- expand validation coverage for rhythm, ties, repeats, endings, and multi-voice consistency
- prepare the history system for reversible transactions and stable selection restoration
- keep entity identity stable across import, edit, undo, redo, and export

### Deliverables

- all current editing features execute through `score-core`
- no new legacy XML mutation paths are introduced
- validation diagnostics cover the most common notation integrity failures
- command replay is trustworthy across realistic imported scores
- tests cover roundtrip, replay, and semantic integrity for representative fixtures

### Exit Criteria

- a score can be imported, edited repeatedly, undone, redone, exported, and reloaded without structural drift
- diagnostics catch common semantic issues before they corrupt downstream editing

### Risks

- hidden XML-era assumptions in the UI or API routes
- unstable entity mapping during replay
- uneven command coverage between direct editing, inspector editing, and AI editing

## Phase 2: Engraving and Layout Engine

### Goal

Introduce product-owned layout behavior so the app is no longer visually constrained by renderer defaults.

### Focus

- add a layout and engraving layer between core state and renderer output
- model spacing, beams, stem direction, lyric placement, slur and tie shaping, and collision policy
- make system and page breaking rule-driven
- reduce direct dependence on OSMD-specific editor assumptions

### Deliverables

- a dedicated layout module with renderer-facing positioning data
- visual regression coverage for reference scores
- stable placement behavior for common notation objects

### Exit Criteria

- representative piano, leadsheet, and vocal scores render cleanly with minimal manual intervention
- layout behavior is reproducible and testable

### Risks

- overfitting to OSMD internals instead of defining renderer-agnostic layout data
- mixing notation semantics with visual placement state

## Phase 3: Pro Notation Coverage

### Goal

Deepen notation semantics until the editor can handle real arrangement and publishing use cases.

### Focus

- complete repeat and volta semantics
- deepen handling of slurs, tuplets, grace notes, chord groups, cross-staff behavior, and expressive directions
- improve import and export robustness for complex MusicXML
- extend part, instrument, and structural notation support

### Deliverables

- richer core entities and command families
- expanded fixture library across score types
- fewer workflows that require repair in external notation software

### Exit Criteria

- a medium-complexity score can be edited in `nex-note` without requiring routine cleanup elsewhere

### Risks

- adding notation objects without enough validation and normalization support
- command model fragmentation across similar notation concepts

## Phase 4: Professional Workflow and UX

### Goal

Make the product fast and comfortable enough for everyday notation work.

### Focus

- accelerate keyboard-first note entry and navigation
- improve range editing, multi-selection, filtering, and batch actions
- tighten integration between canvas editing, inspector editing, and structured commands
- add workflow-level features such as style presets, layout presets, and stronger part-oriented editing

### Deliverables

- faster direct editing flow than chat for common notation tasks
- stronger inspector and palette workflows
- better selection persistence and edit affordances

### Exit Criteria

- an experienced user can complete common editing tasks efficiently without depending on chat

### Risks

- building UX affordances on top of still-unstable selection or command behavior
- spreading effort across many small UX improvements before core workflow bottlenecks are fixed

## Phase 5: AI as Professional Acceleration

### Goal

Turn AI into a trusted assistant for batch edits, cleanup, and planning over a reliable notation system.

### Focus

- route AI exclusively through validated semantic command generation
- add preview and confirmation UX for risky edits
- use validator-driven repair loops and confidence thresholds
- specialize AI flows for cleanup, notation repair, structural edits, lyrics, and layout assistance

### Deliverables

- safe AI previews with affected-measure reporting
- stronger task-specific planning and repair behavior
- measurable time savings on repetitive notation work

### Exit Criteria

- AI speeds up professional workflows without lowering trust in notation correctness

### Risks

- masking core product gaps with AI instead of fixing them
- over-automating edits that should remain explicit and inspectable

## Recommended Execution Order

1. Phase 1
2. Phase 2
3. Phase 3
4. Phase 4
5. Phase 5

This order is strict by design. A notation product that skips ahead to AI or surface UX before core and layout maturity usually becomes harder to stabilize later.

## Current Active Phase

Phase 8 implementation closeout is now covered by the current repository state. The repository is in release-hardening mode rather than roadmap-buildout mode.

Completed in the current Phase 1 pass:

1. expanded validation for cross-measure ties, tuplets, repeat or ending consistency, and multi-voice rhythm gaps
2. audited public edit paths and normalized benchmark execution onto the core command pipeline
3. introduced transaction-oriented history metadata
4. preserved semantic selection anchors across history-driven document changes
5. added compatibility-shim warnings so new work is less likely to reintroduce XML-first paths
6. documented validator severity conventions and aligned validator diagnostics to a shared severity map
7. expanded fixtures, roundtrip coverage, and replay tests for repeat, ending, tuplet, and cross-measure tie scenarios

Phase 2 closeout is now covered by the current repository state:

1. a renderer-agnostic layout module now derives system and page grouping from semantic score content
2. renderer-facing bridge and projected document export paths now materialize break and spacing decisions before OSMD load
3. representative choir, piano, leadsheet, and repeat-ending reference scores now have stable layout and render-near regression coverage

Phase 3 closeout is now covered by the current repository state:

1. `MeasureNode.ending` replaced with `leftEnding` and `rightEnding` for correct volta bracket placement
2. `ending_without_repeat` false positives eliminated; multi-number endings (`"1,2"`) validated correctly
3. `dangling_slur`, `dangling_grace_note`, `dangling_beam` referential-integrity diagnostics added
4. Crescendo/decrescendo wedge and octave-shift directions now roundtrip correctly through import and export
5. `addTuplet`, `addGraceNote`, `removeGraceNote`, and `addWedge` commands added to the core command pipeline
6. Six fixtures, 114 tests pass — exit criterion met

Phase 5 closeout is now covered by the current repository state:

1. AI command generation now stays on the semantic command pipeline with structured score context, affected-measure reporting, confidence, ambiguities, and plan metadata
2. risky AI edits now pause in a preview-and-confirm state before mutating the score
3. validator-driven repair loops now attempt one semantic correction pass before apply when new diagnostics are introduced
4. failed repair attempts now fall back to explicit confirmation with visible validator findings

Phase 6 closeout is now covered by the current repository state:

1. task-specialized AI workflows now route cleanup, notation repair, structural edits, lyrics, and layout requests through the existing semantic command pipeline
2. workflow-aware prompt guidance and plan normalization now make previews clearer without adding a second AI subsystem
3. risky layout and cleanup flows remain confirmation-gated

Phase 7 implementation slices are now covered by the current repository state:

1. inspector batch actions now cover richer selection work such as wider-range transposition, articulation toggles, dynamic application, and phrase slurring
2. professional editing affordances continue to stay on the shared command path instead of forking into UI-local mutation logic

Phase 8 closeout is now covered by the current repository state:

1. standard multi-voice MusicXML with `<backup>` and `<forward>` no longer forces legacy fallback by itself
2. remaining unsafe roundtrip tags remain explicit and documented
3. selected tie starts now expose semantic above/below placement through the Inspector, persist in the core model, and roundtrip through MusicXML `<tied placement="...">`
4. `npm test`, `npm run build`, and MuseScore CLI MusicXML -> MXL -> MusicXML smoke were rerun on 2026-06-24
5. `npm run smoke:musescore-roundtrip` now captures source MusicXML, app-style MXL, and MSCZ create/reopen steps with retries, artifacts, and local-MuseScore crash classification
6. core MusicXML export no longer appends empty root metadata such as trailing `<identification/>` after `<part>`

Highest-value remaining work:

1. execute the representative manual validation pass on real scores
2. rerun native MSCZ compatibility validation on a stable MuseScore CLI install; local MuseScore 4.7.3 currently SIGABRTs intermittently even on source-baseline conversions, so MSCZ parity remains accepted but not proven
3. make the final release decision with an explicit accepted-limitations list instead of implicit roadmap leftovers
