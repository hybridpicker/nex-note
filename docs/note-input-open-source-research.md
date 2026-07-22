# Note Input: Open-Source Research and Implementation Decision

Updated: 2026-07-22

## Outcome

Nex Note should keep its own semantic score model and command/history pipeline. No evaluated open-source package is a safe drop-in replacement for MuseScore-grade interactive note entry in the current React, MusicXML, OSMD, playback, history, and desktop architecture.

The most effective route is:

1. Treat `N` as the primary Notation Edit / Note Input mode for both mouse and keyboard work.
2. Port MuseScore's input-state behavior, not its Qt/C++ UI.
3. Keep OSMD as the renderer and geometry source, never as the mutation authority.
4. Keep alphaTab limited to Guitar Pro/TAB import and validation.
5. Materialize rhythm spelling in the semantic document before render/export so notation, playback, selection, and MusicXML agree.
6. Use MuseScore CLI round trips as an external compatibility oracle.

Current parity scope is mouse and computer-keyboard notation editing. Hardware MIDI, sustain pedals, percussion controllers, and MIDI-device UX are deliberately excluded.

## The MuseScore behavior that matters

MuseScore separates the persistent input cursor/state from the action that commits a note. Its duration-first workflow is explicitly stateful:

- `M` selects Input by duration while note entry remains the enclosing editing workflow.
- `A`–`G`, mouse, virtual piano, or held MIDI notes prepare pitch intent.
- `Shift+A`–`G` adds notes above the last prepared tone.
- `1`–`9` or a duration toolbar click commits the complete prepared pitch set.
- If a note/chord of the same duration already exists at the cursor, the new pitch is added to that chord instead of overwriting it.
- Duplicate pitches are rejected/toggled rather than silently creating duplicate chord members.
- The cursor advances once for the complete onset, not once per chord tone.

This is documented in the [MuseScore Input by duration handbook](https://handbook.musescore.org/basics/input-by-duration-mode). The current source implements the same rule in [`noteinput.cpp`](https://github.com/musescore/MuseScore/blob/main/src/engraving/editing/noteinput.cpp): the input state owns the requested duration and pitch set; matching-duration chord/rest inspection decides between adding to a chord and replacing/creating an onset; chord insertion deduplicates an existing pitch. MuseScore is GPL-3.0 and its full C++/Qt editor is far too large and tightly coupled to embed as a web component, but its state-machine behavior is an excellent reference.

## Required Nex Note interaction contract

### Primary `N` mode

`N` is the single gateway for notation editing. When active:

- Mouse hover shows only validated rhythmic/pitch targets.
- Mouse click replaces, inserts, or stacks according to the visible target and modifier.
- `A`–`G` performs nearest-octave pitch entry.
- `Shift+A`–`G` stacks chord tones above the current highest tone.
- `1`–`9`, dot, rests, voices 1–4, ties, tuplets, accidentals, and navigation remain available.
- `Escape` leaves input mode and clears its subsidiary modes.

### Duration-first method inside `N`

`M`/`DUR` changes the input method, not the owning editor mode. It prepares a pitch or chord, displays that prepared set, and commits it only when a duration is chosen. Toolbar clicks and keyboard duration shortcuts must call the same transaction path.

### Rhythm presentation

The semantic duration is not always the correct visual notation. A logical duration crossing a strong metric boundary must become tied notated fragments. Initial hard rules are:

- In 4/4, do not conceal the half-bar boundary.
- In compound 6/8, 9/8, and 12/8, expose dotted-beat grouping.
- Preserve a pre-existing outgoing tie on the final fragment.
- Keep the original event ID on the first fragment so selection/history remain stable.
- Do not respell tuplets, grace notes, or untouched imported measures implicitly.

## Open-source candidates

| Project | What it provides | Fit for Nex Note | Decision |
| --- | --- | --- | --- |
| [MuseScore Studio](https://github.com/musescore/MuseScore) | Full WYSIWYG editor, four voices, mouse/keyboard/MIDI entry, mature MusicXML, playback, print; GPL-3.0 | Best behavioral and compatibility reference, but C++/Qt architecture and GPL coupling make embedding or partial transplantation impractical | Use handbook/source behavior and CLI round-trip oracle; do not embed |
| [Smoosic](https://github.com/Smoosic/Smoosic) | TypeScript browser editor, serializable musical object model, voices, interactive UI, playback, MusicXML/MIDI import/export; principally MIT with an additional repository license file | Closest web-editor comparison. Its separation of serializable data, rendering, and view operations validates Nex Note's architecture. Replacing the existing core/history/OSMD bridge would be a high-risk migration, and its docs acknowledge ongoing import/export work | Reuse design ideas and compare behavior; do not replace the core now |
| [Denemo](https://www.denemo.org/) | GPL desktop editor using LilyPond, numeric-key rhythm instrument, pitches-first workflow | Strong proof that pitches-first/rhythm-first entry is productive; excellent engraving and batch-validation reference | Use interaction ideas and optional external engraving QA; no web embedding |
| [OpenSheetMusicDisplay](https://github.com/opensheetmusicdisplay/opensheetmusicdisplay) | BSD-3-Clause TypeScript MusicXML renderer built on VexFlow, already used by Nex Note | Its own documentation says it is a renderer, not a full interactive editor. It is appropriate for render geometry and SVG output, not edit semantics | Retain as renderer/geometry bridge |
| [Smoosic's VexFlow stack](https://www.vexflow.com/) | MIT JavaScript SVG/canvas notation rendering API | Low-level renderer, not a persistent editor model or transaction system | Continue consuming through OSMD; no direct migration |
| [alphaTab](https://alphatab.net/docs/reference/score/) | Rich semantic `Score > Track > Staff > Bar > Voice > Beat > Note` model, Guitar Pro/TAB rendering and playback | Excellent for Guitar Pro and TAB. Official docs warn that direct mutation can break internal consistency unless the model is properly finalized | Keep for import/TAB validation; do not make it the general notation editor |
| [Verovio](https://www.verovio.org/) | MEI-first engraving toolkit with MusicXML/Humdrum support and JavaScript/Python toolkits | Strong independent renderer and MEI interoperability option, but not an interactive editing application | Consider as a future render/round-trip oracle, not the edit core |
| LilyPond | Text-to-engraving engine with extremely mature automatic notation | High-quality print/engraving oracle but not a browser WYSIWYG editing surface | Optional export/QA backend only |

## Why Smoosic is not being adopted wholesale

Smoosic is the only investigated browser project that combines a serializable music model, operations layer, interactive mappings, asynchronous layout, voices, MIDI, playback, and MusicXML. That makes it valuable evidence, not a trivial dependency swap.

A replacement would require migrating or duplicating:

- Nex Note's semantic entity IDs and selection anchors.
- Command validation, inverse commands, undo/redo, and clipboard schema.
- Existing MusicXML preservation and round-trip logic.
- OSMD rendered-geometry mapping and pointer validation.
- Paired notation/TAB semantics and alphaTab import behavior.
- Playback cursors, collaboration/AI command consumers, desktop packaging, and tests.

The migration risk is much larger than adapting the proven input-state rules. A bounded prototype could still compare Smoosic's layout and selection behavior on a fixed corpus, but it should not block the current editor improvements.

## Implemented in this pass

- `N` remains the primary mouse/keyboard Notation Edit mode.
- `M` and the visible `DUR` control select duration-first input within note input.
- Prepared pitch/chord state is visible in the toolbar.
- A voice-colored, non-committing pitch cursor is rendered at the active score anchor and cannot be mistaken for a mouse commit ghost.
- Prepared rests remain non-destructive until a duration is selected.
- Arrow keys move the prepared pitch cursor; Ctrl/Cmd+Arrow moves it by an octave; Backspace removes the latest prepared chord tone.
- Plain `A`–`G` or a pitch-button click replaces the prepared pitch; `Shift+A`–`G` or a Shift-click builds an ordered chord above it.
- A duration shortcut or mouse click commits the chord as one semantic transaction and advances once.
- Matching-duration existing chords are extended; already-present pitches are removed from the pending commit.
- Generated core event IDs are collision-resistant within atomic chord batches.
- Meter-aware rhythm spelling now supports crossed beats in simple meters, the 4/4 half-bar, compound dotted-beat boundaries, and explicit additive groups such as 3+2/8.
- Additive beat groups survive MusicXML import, export, and re-import; malformed groupings remain visible to validation.
- Slur, glissando, and stop-tremolo endpoints move to the final tied fragment while first-fragment marks stay anchored.
- Rhythm spelling is materialized only for the exact onsets touched by a note-entry batch, preserving untouched imported spelling and unrelated events.

## Follow-up roadmap

### Priority 1: harden `N` mode

- Run a dense-score pointer matrix: full-measure rests, overlapping voices, tuplets, grace notes, pickup bars, cross-staff notation, and TAB pairs.
- Add app-level keyboard/mouse tests for three-note chords in voices 2–4.
- Keep MIDI work outside the current mouse/keyboard parity scope.

### Priority 2: broaden rhythm spelling

- Add a user-facing grouping editor for ungrouped 5/8 and 7/8 instead of guessing between valid accent maps.
- Add corpus comparison against MuseScore-rendered MusicXML.

### Priority 3: interoperability and accessibility

- Add repeatable MuseScore CLI golden files for mouse, keyboard, voices, tuplets, and ties.
- Evaluate Verovio as an independent semantic/rendering oracle.
- Give every input mode and prepared pitch cursor an ARIA-live description and fully keyboard-operable toolbar state.

## Acceptance criteria

The work is complete only when all of the following hold:

- `N` reliably enables/disables notation entry without requiring a mouse-only setup step.
- A mouse-only user can select voice, pitch, duration, accidental, rest, and chord intent.
- A keyboard-only user can enter a three-note chord with correct octave and duration without losing the cursor.
- An existing same-duration onset gains only missing chord tones.
- Multi-voice entry changes only the active voice.
- Strong metric boundaries render/export as tied fragments without changing playback duration.
- Exported MusicXML reimports into Nex Note and MuseScore with equivalent pitches, onsets, voices, durations, and ties.
