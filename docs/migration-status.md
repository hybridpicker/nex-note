# Migration Status

## Core Execution Support

Currently executed through the core-model path:

- Metadata: `setTitle`, `setSubtitle`, `setComposer`, `setArranger`
- Attributes: `setKey`, `setTimeSignature`, `setClef`, `setPartTranspose`
- Part metadata: `setPartName`, `setPartAbbreviation`, `setInstrumentName`
- Structure: `insertMeasureAfter`, `deleteMeasure`
- Content: `changeNotePitch`, `deleteNote`, `insertNote`, `insertRest`, `insertNoteAt`, `insertRestAt`, `transposeChromatic`
- Range content: `deleteRange`, `transposeRangeChromatic`
- Notation: `toggleArticulation`, `clearArticulations`, `clearRangeArticulations`, `toggleTie`, `addDynamic`, `setBarline`, `addLyric`, `setLyricLine`, `setMeasureLayoutHint`
- Legacy cleanup / structure: `removeArticulations`, `setTempo`, `addStartRepeat`, `addEndRepeat`, `addVolta2`, `setEnding`, `addChords`, `addRehearsalMark`, `addWords`, `setSystemBreak`, `setPageBreak`, `duplicateNote`

Still on legacy XML fallback:
- none in the current public command set

## Core Model Coverage

Represented in `ScoreDocumentModel` today:

- score metadata
- parts, staves, measures, voices
- note/rest events with timing and durations
- basic measure attributes
- part transposition
- simple directions
- articulations, tie start state, lyrics
- lyric lines with verse numbers
- right barline state
- slurs
- beams
- tuplets
- chord groups
- grace notes
- measure layout hints

Not yet fully modeled:

- repeat/volta semantics
- page/system layout policies beyond explicit hints
- collision-aware engraving state

## Validation Coverage

Implemented validators today:

- missing core document
- no parts / no staves
- invalid measure number
- descending measure order
- invalid time signature values
- suspicious transpose range
- empty voices
- measure balance by voice
- overlapping events inside a voice
- mismatched total voice durations in a measure
- tie-start continuity
- lyric syllabic continuity
- lyric-line target continuity
- layout hint sanity checks

Missing next:

- tie continuity across measure boundaries
- stronger multi-voice rhythmic validation
- tuplet-aware rhythm validation
- repeat/ending consistency

## Next Milestones

- add direct core commands for slurs, beams, tuplets, chord groups, and grace notes
- move remaining legacy structure commands to core semantics
- deepen range/block editing beyond note-only selections
- replace low-confidence AI execution with richer preview/confirmation UX
- deepen renderer abstraction beyond the current OSMD bridge

## Undo / Redo Status

Current state:

- command entries are replayed from a baseline document instead of storing a full snapshot per edit
- snapshots remain for `replaceXml` / load-style boundaries and safety recovery
- hook behavior is now core-first with XML re-derived during command replay

Still missing:

- command transaction log with reversible operations
- inverse-command or patch-based undo
- selective redo/branch handling beyond linear stacks

## AI Pipeline Status

Current state:

- structured AI context includes score summary, diagnostics, capabilities, and optional selection
- chat execution is split into prompt/context, parsing, planning assessment, repair, and execution
- low-confidence responses with unresolved ambiguities can now return `requiresConfirmation: true`
- invalid AI commands can be dropped during repair instead of failing the whole batch
- AI results report `affectedMeasures` back to the UI

Still missing:

- richer diagnostics and confirmation UI before apply
- deeper multi-step planning over inspector/range workflows
- validator-driven retry/repair loops
- model-specific routing and capability weighting

## Renderer / Selection Status

Current state:

- OSMD selection now passes through a render-bridge module instead of editor-local matching
- rendered notes can be enriched with `coreEntityId`, `coreVoiceId`, and `coreMeasureId`
- selection matching prefers core IDs and falls back to measure/staff/voice/timestamp locators
- overlay positioning and hit-testing remain compatible with the current OSMD DOM path
- editor selection now carries `entityIds`, `anchor`, `range`, and part/staff/voice context
- shift-click range selection and multi-overlay rendering are in place

Still missing:

- a renderer-agnostic selection abstraction above OSMD specifics
- glyph mapping beyond note events and simple overlays
- layout-aware core-to-render synchronization for non-note notation objects
