# Arrangement Feature Matrix

Created: 2026-11-04 (iteration 0). Owner document for the **Completeness** half of the
[arrangement and note-entry program](arrangement-note-entry-iteration-prompt.md). The
[iteration ledger](arrangement-iteration-ledger.md) records every change to this table.
Entry-precision rows remain in the [note input parity matrix](note-input-parity-matrix.md).

## How to read this table

- Status values: `PASS`, `PARTIAL`, `MISSING`, `BLOCKED` (with a named external dependency).
- A row is `PASS` only when every applicable column is `PASS` and has automated evidence.
  `n/a` marks a column that does not apply musically.
- **Undo/Redo.** Every editor, palette, inspector and AI action goes through
  `onApplyCommands`, then `hooks/useScoreDocument.ts` `applyCommands`, then
  `executeHybridCommands` and `executeCoreCommands`. Each accepted batch is one history entry,
  using derived inverse commands where they exist and a snapshot otherwise. `1 entry` below
  means this path. Whether Redo restores the batch exactly has to be proven per workflow.
- **Render.** The column covers page view, continuous view, print preview and PDF. It is
  `PASS` only with a rendered test in all four. `unverified` means no rendered evidence exists
  for this capability yet.
- **Playback** has two paths. The primary path exports MusicXML and renders MIDI with the
  MuseScore CLI (`app/api/midi/route.ts`). The fallback is the client-side
  `lib/midi-export.ts` builder, which plays pitch, ties, graces and tuplet timing at a fixed
  velocity and does not unroll repeats. `MS` means the capability sounds only through the
  MuseScore path. That counts as `PARTIAL` because the fallback ignores it.
- **MusicXML** means nex-note export and reimport, plus a reopen in the MuseScore CLI harness
  (`npm run smoke:musescore-roundtrip`). External reopen evidence is still
  `PARTIAL / local MuseScore crash classified` for every row (see the parity matrix,
  Milestone 6).
- Source of each finding: an iteration-0 read-only code survey on 2026-11-04 at `c419c97`
  plus local `838063d`. Entries marked *suspected* are survey findings that the selecting
  iteration must first reproduce with a failing test.

Abbreviations:

| Short | Path |
| --- | --- |
| CCE | `src/score-core/commands/core-command-executor.ts` |
| EXP | `src/musicxml-adapter/export/export-core-to-musicxml.ts` |
| IMP | `src/musicxml-adapter/import/import-musicxml.ts` |
| UNE | `hooks/useNoteEditor.ts` |
| CC | Command Center |
| INS | `components/ScoreInspector.tsx` |
| PAL | `components/EditPalette.tsx` |
| NIT | `components/NoteInputToolbar.tsx` |

## Summary

| Status | Rows |
| --- | --- |
| PASS | 1 |
| PARTIAL | 43 |
| MISSING | 3 |
| BLOCKED | 0 |
| Total | 47 |

## Score and parts

| # | Capability | Core model | Keyboard path | Mouse path | Undo/Redo | Render | Playback | MusicXML | Automated evidence | Status | Next action |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| S1 | Add, remove, rename, reorder parts; instrument change within a part | PARTIAL: `setPartName`, `setPartAbbreviation`, `setInstrumentName`, `setPartTranspose`, `fitPartToInstrument`. No add/remove/reorder part command; `setInstrumentChange` writes only the words "Instrument: X" | CC "inspector parts instruments" (focus only) | INS parts section ("Apply part setup") | 1 entry (inverse) | unverified | instrument chosen from part name (`lib/midi-instruments.ts`); a mid-part change is ignored | names round-trip; `<instrument-change>` not modeled | `score-architecture`, `inverse-commands`, `core-command-executor` | PARTIAL | Add `addPart`/`removePart`/`movePart` core commands with inverse, then INS controls |
| S2 | Transposing instruments; concert vs transposed view; per-part key signatures | PARTIAL: `PartNode.chromaticTranspose`/`diatonicTranspose`, `setPartTranspose`; new-score templates. No concert-pitch view; `setKey` writes the same fifths to every part | MISSING | INS chromatic/diatonic fields | 1 entry | unverified | **wrong**: `sanitizeXmlForMidiExport` strips `<transpose>` and the fallback ignores it, so transposing parts sound at written pitch | `<transpose>` import/export PASS | `score-architecture`, `user-visible-exports`, `transpose-logic` | PARTIAL | Reproduce the written-pitch playback defect (priority 1, wrong pitch); then add a concert-pitch view toggle |
| S3 | Staff types: single, grand staff, TAB paired with notation, unpitched percussion, one-line rhythm staff | PARTIAL: single, grand staff and notation/TAB pairing PASS. Percussion notes are opaque `RestEvent.unpitched` events that cannot be entered and are silent. One-line staff MISSING (`staff-details` raw XML only) | TAB keys only | New Score dialog | 1 entry | unverified | percussion silent | unpitched and staff-details preserved | `unpitched-percussion-roundtrip`, `guitar-tab-semantics`, `e2e/guitar-tab-sync`, `new-score` | PARTIAL | Model staff line count; percussion entry needs a drum-map design (later) |
| S4 | Part extraction with part layout, multi-measure rests, cue notes | PARTIAL: `lib/part-extraction.ts`, `lib/parts-archive.ts` (ZIP of single-part MusicXML). No linked parts, no part-only layout, no MM rests, no cues | MISSING | INS "Open extracted part"; Electron menu "Export All Parts (ZIP)" | n/a (new document) | unverified | n/a | export only | `part-extraction`, `parts-archive` | PARTIAL | Depends on C12 (MM rests) and E4 (cue notes) |
| S5 | Score order and bracket/brace grouping | MISSING: no group model; `part-group` is kept as raw XML and forces the legacy executor | MISSING | MISSING | n/a | unverified | n/a | `part-group` pass-through; extraction drops it | `score-architecture` (pass-through only) | MISSING | Model `PartGroup` (bracket, brace, barline joining) with import/export |

## Structure

| # | Capability | Core model | Keyboard path | Mouse path | Undo/Redo | Render | Playback | MusicXML | Automated evidence | Status | Next action |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| T1 | Key signature change at any barline, mid-score and per part | PARTIAL: model stores `keyFifths` per measure, but `setKey {fifths}` is hard-wired to measure 1 of all parts | MISSING | INS key presets (C/G/D/A/F/Bb major only); EditLibrary presets | 1 entry (inverse) | unverified | n/a | per-measure `<key>` import/export PASS | `score-architecture`, `ai-pipeline` | PARTIAL | Add `measureNumber` and optional `corePartId` to `setKey`; full key list (7 sharps to 7 flats, major/minor) in INS |
| T2 | Time signature change, pickup, irregular/additive meters, cut/common time | PARTIAL: `setTimeSignature {measureNumber, beatGroups}` with rebarring; pickup only at score creation (`lib/new-score.ts`); cut/common `symbol` not modeled | MISSING | INS presets 4/4, 3/4, 6/8, 2/2; AdvancedNoteInput "Apply meter" with beat groups | 1 entry (inverse) | unverified | MIDI time signature honored | beats, beat-type, `3+2` and implicit PASS; `symbol` only kept from source | `measure-timing`, `rhythm-speller`, `note-entry-advanced`, `score-roundtrip-golden`, `playback-cursor` | PARTIAL | Model the `symbol` (common/cut); add a pickup command for an existing measure |
| T3 | Clef change at measure start and mid-measure | PARTIAL: `setClef`/`removeClefChange` at measure start; only G/F/C; mid-measure MISSING (`MeasureAttributes` has no timestamp) | MISSING | INS Treble/Bass/Alto, staff 1 only | 1 entry (inverse) | unverified | n/a | clefs incl. `clef-octave-change` PASS; only `attributes[0]` exported | `clef-octave-change`, `score-architecture` | PARTIAL | Staff selector and tenor/percussion clef in INS; then mid-measure clef model |
| T4 | Tempo marks, tempo text, metric modulation, gradual tempo changes | PARTIAL: `setTempo` (measure 1 only); `addTempoText` (part 0, no UI). Modulation and rit./accel. MISSING | MISSING | EditLibrary presets (80/120 bpm); playback tempo override | 1 entry | unverified | discrete changes honored in both paths | `<metronome>` and `<sound tempo>` PASS | `core-command-executor`, `playback-cursor`, `notation-doctor` | PARTIAL | `setTempo` at any measure and beat with INS control |
| T5 | Repeats, 1st/2nd/3rd endings, D.C., D.S., Segno, Coda, Fine, To Coda | PARTIAL: `addStartRepeat` (measure 1 only), `addEndRepeat`, `setEnding`, `setBarline` repeats. `addSegno`/`addCoda`/`addDacapo`/`addDalsegno`/`addFine`/`addToCoda` exist without UI and write plain words | CC "structure" actions | INS repeats and endings (1st/2nd only); PAL barlines | 1 entry | unverified | repeats and endings honored by the cursor timeline (2 passes); D.C./D.S. jumps ignored; fallback MIDI does not unroll | repeats and endings PASS; segno/coda exported without `<sound dacapo/segno/fine/tocoda>` | `playback-cursor`, `core-command-executor`, `score-roundtrip-golden`, `e2e/notation-tools` | PARTIAL | Emit `<sound>` jump attributes; PAL jump/marker section |
| T6 | Insert, delete, split and join measures with renumbering | PARTIAL: `insertMeasureAfter`, `deleteMeasure`, `renumberMeasures`. Split/join MISSING. Insert clones barlines, endings and breaks (*suspected* defect) | CC only | INS measure section | 1 entry (snapshot) | unverified | n/a | PASS | `inverse-commands`, `score-document-history`, `note-entry-workflows` | PARTIAL | Reproduce the cloned-barline insert defect; add split/join |
| T7 | Multi-measure rests | PARTIAL: `setMultiMeasureRest` sets a flag only, no UI; OSMD auto-generation is off | MISSING | MISSING | 1 entry | not rendered | n/a | **lost**: `<multiple-rest>` neither imported nor exported; export deletes `measure-style` except measure-repeat | `core-command-executor` | PARTIAL | Preserve `<multiple-rest>` on import/export (priority 1, data loss); then a render toggle |
| T8 | System and page breaks, rehearsal marks, measure numbers | PASS/PARTIAL: `setSystemBreak`, `setPageBreak`, `setMeasureLayoutHint`, `addRehearsalMark`, `addRehearsalMarksEvery`; measure numbering is the OSMD default only | Cmd/Ctrl+M focuses the rehearsal field | INS measure and print/layout sections | 1 entry | unverified | n/a | `<print new-system/new-page>`, staff distance, rehearsal PASS | `score-history-replay-fixtures`, `inverse-commands`, `e2e/notation-tools` | PARTIAL | Rendered break evidence in page, continuous and print views; measure-number interval setting |

## Pitch and rhythm

| # | Capability | Core model | Keyboard path | Mouse path | Undo/Redo | Render | Playback | MusicXML | Automated evidence | Status | Next action |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| P1 | All durations from longa to 128th, single and double dots | PARTIAL: `durationType` + boolean `isDotted`. No 128th (`duration-utils.ts`); no double dot | `1`–`9` (64th to longa), `.` (a new value clears the dot, as in MuseScore), `Q`/`W`, `Shift+Q`/`Shift+W` | NIT duration buttons incl. breve and longa | 1 entry | unverified | MS + fallback | single and imported multiple dots round-trip (`dotCount`, iteration 9) | `note-duration-command`, `score-input-resolvers`, `rhythm-speller`, `entry-matrix` (eighths, sixteenths, dotted pairs, 3/4, 6/8) | PARTIAL | Double-dot entry (keyboard `..`, toolbar); 128th value |
| P2 | Tuplets of every ratio incl. nested and cross-beat, bracket/number styles | PARTIAL: `TupletSpan` with bracket/showNumber, `addTuplet`, nesting to 4 levels, range conversion; one bar and one voice only; style fields not editable | `Cmd/Ctrl+2`–`9` (in note input the active value is the total length at the cursor, as in MuseScore; typed pitches fill the units) | NIT ratio buttons; AdvancedNoteInput custom ratio | 1 entry | print preview and PDF tested for nested tuplets | MS + fallback | full | `nested-tuplet-render`, `note-entry-advanced`, `core-command-executor`, `entry-matrix` (eighth/sixteenth triplets, quintuplet), `e2e/notation-tools` | PARTIAL | INS bracket/number style controls |
| P3 | Ties within and across barlines and systems; tie chains through chords | PASS: `tieStart`, `toggleTie`, `setTiePlacement`; export pairs ties by pitch across barlines and chords | `T`; a keyboard value longer than the rest of the bar is split and tied at the barline (iteration 7) | PAL ties; INS placement | 1 entry | unverified across systems | MS + fallback | PASS | `inverse-commands`, `note-entry-workflows`, `entry-matrix` (barline splits), `e2e/notation-tools`, `e2e/dunhill-old-abbey-stress` | PARTIAL | Rendered tie across a system break in page/continuous/print |
| P4 | Grace notes: acciaccatura and appoggiatura, single and grouped | PARTIAL: `GraceNoteLink.slash`, `addGraceNote`, `moveGraceNote`, `removeGraceNote`, groups. UI always sends `slash: true` (no appoggiatura) | `/` | NIT button; AdvancedNoteInput grace sequence | 1 entry | rendered in e2e | MS + fallback | `<grace slash>` PASS | `note-entry-advanced`, `core-command-executor`, `e2e/notation-tools` | PARTIAL | Appoggiatura entry (keyboard + NIT) through the existing command |
| P5 | Chords any size in any voice; four voices per staff; cross-staff notes and beams | PARTIAL: `insertNoteAt.asChord`, `ChordGroup`, input voices 1–4 mapped per staff to stored MusicXML voices (`src/score-input/voice-mapping.ts`, iteration 4: a MuseScore/Finale left hand stored as voice 5 is input voice 1). Cross-staff move deletes and re-inserts on the other staff; no real cross-staff note or beam | `Shift+A`–`G`, `Alt/Option+1`–`9`, `Cmd/Ctrl+Alt/Option+1`–`4` | pointer entry, voice selector | 1 entry | unverified | MS | chord/voice/staff PASS; cross-staff beams MISSING | `score-input-resolvers`, `snap-point-contract`, `e2e/note-entry-quality`, `voice-mapping`, `entry-matrix`, `e2e/notation-tools` (voice-5 keyboard and mouse) | PARTIAL | Cross-staff note model (`staff` override per note) with export |
| P6 | Enharmonic respelling; chromatic/diatonic transposition by interval and by key; octave transposition | PARTIAL: `changeNotePitch`, `transposeChromatic`, `transposeRangeChromatic`, `transposeDocumentChromatic`. Semitones only; spelling guessed | `J`, ArrowUp/Down, Shift/Cmd+Arrow | PAL ±1/±2/±7/±12; INS range ±2/±12 | 1 entry | rendered `J` in e2e | MS | n/a (pitch data) | `accidentals`, `inverse-commands`, `e2e/notation-tools` | PARTIAL | Transpose dialog by interval (diatonic spelling) and by key |
| P7 | Octave lines 8va, 8vb, 15ma, 15mb | PARTIAL: `addOttava` 8va/8vb/15ma/15mb as `octave-shift` with the MusicXML 4.0 direction (8va/15ma = `down`) since iteration 3 | MISSING | MISSING (AI only) | 1 entry | unverified | MS | PASS: direction, size and stop survive export and reimport | `ottava-direction`, `score-roundtrip-golden` | PARTIAL | Palette section and keyboard path (CC) for octave lines over the selection |
| P8 | Tremolo (single and two-note), arpeggio, glissando, portamento | PARTIAL: `addTremolo`, `addArpeggio`, `addGlissando`, not called from any UI; no portamento | MISSING | MISSING | 1 entry | unverified | MS | full | `core-command-executor` | PARTIAL | PAL section with keyboard path through CC |
| P9 | Rests of every duration, full-measure rest, invisible rest | PARTIAL: `insertRest`, `insertRestAt`, `replaceWithRest`, `hidden` flag. No `measure="yes"` rest; no invisible toggle | `R`, `0`, `Cmd/Ctrl+Shift+Delete` (full-measure rest) | NIT; CC "insert-rest" | 1 entry | unverified | n/a | `print-object="no"` PASS; `measure="yes"` MISSING | `notation-doctor`, `user-visible-note-editor`, `core-command-executor` | PARTIAL | Visibility toggle (`V`-style) through a command; `measure="yes"` export |
| P10 | Beaming control: break, join, feathered | MISSING: `BeamGroup` is filled only by import; no beam commands | MISSING | MISSING | n/a | unverified | n/a | `<beam>` both ways | `score-roundtrip-golden` | MISSING | `setBeamMode` (auto/break/join) per event with export |

## Expression and articulation

| # | Capability | Core model | Keyboard path | Mouse path | Undo/Redo | Render | Playback | MusicXML | Automated evidence | Status | Next action |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| E1 | Dynamics ppp–fff, sfz, fp, rf and combinations; hairpins as lines and text | PARTIAL: `addDynamic` (pp..fff, sfz), `addWedge`. Missing ppp, fp, rf, sf; no hairpin UI. `addDynamic` scoped to the selected part since iteration 8 | CC pp..ff; focus dynamic | PAL, NIT, INS | 1 entry | rendered in e2e | MS | dynamics and wedges PASS | `e2e/notation-tools`, `e2e/app`, `score-roundtrip-golden`, `direction-staff-roundtrip` (lower-staff dynamics survive edits since iteration 2) | PARTIAL | Reproduce the multi-part scope leak (priority 1, wrong target); full dynamic set; hairpin palette |
| E2 | Articulations: staccato, staccatissimo, tenuto, accent, marcato, combinations | PASS: tag list, `toggleArticulation`, placement | `Shift+S`, `Shift+.`, `Shift+6`, `Shift+-`; staccatissimo no key | PAL, NIT, INS | 1 entry | rendered in e2e | MS | PASS | `e2e/notation-tools`, `user-visible-note-editor`, `e2e/app` | PARTIAL | QWERTZ/UK layout proof (Track A1); staccatissimo keyboard path |
| E3 | Fermata, breath mark, caesura | PARTIAL: fermata via `toggleArticulation('fermata')`; breath and caesura pass through only | MISSING | PAL, NIT (fermata) | 1 entry | unverified | MS | fermata PASS; breath/caesura pass-through | `core-command-executor`, `e2e/notation-tools` | PARTIAL | Breath and caesura through `toggleArticulation` with PAL buttons |
| E4 | Ornaments: trill with extension line, mordent, inverted mordent, turn | PARTIAL: `addOrnament` stores raw XML; no trill line command | MISSING | MISSING (AI only) | 1 entry | unverified | MS | raw `<ornaments>` preserved | `score-architecture` | PARTIAL | Typed ornament field and PAL section |
| E5 | Slurs within and across systems, nested, direction | PASS: `SlurSpan` with numbers (nesting), `setSlurPlacement` | `S` | NIT; INS placement | 1 entry | unverified across systems | n/a | PASS | `score-architecture`, `user-visible-components` | PARTIAL | Rendered cross-system slur evidence |
| E6 | Pedal marks with start/stop and retake | PARTIAL: `addPedalSpan` start/stop; import keeps `type` (start, stop, change, continue) and `number`; no retake command | MISSING | MISSING | 1 entry | unverified | MS | PASS for start/stop/change type and position (iteration 2) | `score-architecture`, `direction-staff-roundtrip`, `e2e/notation-tools` (grand-staff edit) | PARTIAL | Pedal palette entry with retake (`change`) for keyboard and mouse |
| E7 | Staff text, system text, expression text, playing techniques | PARTIAL: `addWords`, `addExpressionText` scoped to the selected part and staff since iteration 8 (still at beat 0); `addTechniqueInstruction` writes verbose text | Cmd/Ctrl+T focuses staff text | INS text field | 1 entry | unverified | no technique effect | `<words>` PASS | `user-visible-components`, `ai-pipeline` | PARTIAL | Scope staff text to the selected staff and onset; system text as a distinct kind |

## Lead sheet and rhythm section

| # | Capability | Core model | Keyboard path | Mouse path | Undo/Redo | Render | Playback | MusicXML | Automated evidence | Status | Next action |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| L1 | Chord symbols: extensions, alterations, slash chords, polychords, N.C.; transposition with the part | PARTIAL: harmony direction string; `setHarmonyAt`, `addChords`; whole-score transpose moves chords. Range, note and part transposition do not. `setHarmonyAt` scoped to the selected part since iteration 8 | Cmd/Ctrl+K inline chord field | NIT chord field; lead-sheet toggle | 1 entry | rendered in e2e | n/a | root/kind/bass PASS; altered chords exported as `<words>`; N.C. exports as `kind none` and 6/9 keeps its added 9th since iteration 10; `<degree>` ignored; mid-bar onset now imported from the measure cursor (iteration 2) | `core-command-executor`, `score-roundtrip-golden`, `e2e/inline-chord-visibility` | PARTIAL | Export altered and added-tone chords (7b9, 7#11, add9) as `<harmony>` with `<degree>` instead of `<words>`; import `<degree>` |
| L2 | Slash notation, rhythmic slashes with stems, kicks above the staff | PARTIAL: `notehead: 'slash'`, `fillSlashMeasure`, `setNoteStyle`. `fillSlashMeasure` scoped to the selected part since iteration 8 | `Cmd/Ctrl+/`, `Shift+X` | NIT slash button | 1 entry | unverified | slashes sound as pitched notes | `<notehead>slash` PASS | `core-command-executor`, `e2e/notation-tools` | PARTIAL | Reproduce the multi-part fill (priority 1); mute slash noteheads in playback |
| L3 | Lyrics: verses, hyphenation, melisma extenders, elisions | PARTIAL: `lyrics[]`, `setLyricLine`, `addLyric` (verse 1), `removeLyricLine`. INS sends `syllabic: 'single'` always | CC "focus lyric line"; no lyric entry mode | INS lyrics fields | 1 entry | unverified | n/a | verse/syllabic/text PASS; `<extend>` and `<elision>` **lost** | `score-architecture`, `score-roundtrip-golden`, `user-visible-components` | PARTIAL | Preserve `<extend>` on import/export (priority 1, data loss); then a lyric entry mode |
| L4 | Cue notes and cue-size staves | PARTIAL: `setCueNote` marks a note with the preserved `<cue/>` fragment and keeps its value (iteration 11); rests and grace notes are rejected; no cue-size staves | MISSING | MISSING | 1 entry | unverified (cue size) | fallback plays cues | `<cue/>` round-trip PASS | `cue-note-command`, `score-architecture` (pass-through) | PARTIAL | Cue toggle in PAL with a keyboard path; silence cues in the fallback MIDI |
| L5 | Guitar: TAB, fingering, string numbers, capo, bends, hammer-on, pull-off, slide, vibrato, palm mute, let ring | PARTIAL: `NoteEvent.guitar`, `setGuitarFret`, `toggleGuitarTechnique`, linked TAB. *Suspected*: `addGuitarBend` ignores `bendSemitones`; `addGuitarTap` stores hammer-on. Fingering raw XML only; capo MISSING | TAB button, `Alt/Option+1`–`6`, digits | NIT technique buttons, tuning selector | 1 entry | rendered TAB in e2e | techniques ignored | `<technical>` PASS; bend-alter always 1 | `guitar-tab-semantics`, `repitch-and-tab-entry`, `guitar-pro-import-contract`, `e2e/guitar-tab-sync` | PARTIAL | Reproduce the bend and tap defects (priority 1, wrong data) |

## Arranging workflow

| # | Capability | Core model | Keyboard path | Mouse path | Undo/Redo | Render | Playback | MusicXML | Automated evidence | Status | Next action |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| W1 | Copy, cut, paste, paste-with-transposition across parts, staves, voices | PARTIAL: `ScoreClipboardPayload`, `pasteContent` (insert/overwrite). Copy within one part; one-voice clipboard keeps its source voice; linked TAB paste rejected; paste-with-transposition MISSING | `Cmd/Ctrl+C/X/V` | PAL selection actions | 1 entry (cut = copy + delete) | unverified | n/a | n/a | `note-entry-workflows`, `note-entry-advanced`, `note-editor-selection` | PARTIAL | Paste into the active voice; paste-with-transposition option |
| W2 | Explode a chord staff into parts; implode parts into one staff | MISSING | MISSING | MISSING | n/a | n/a | n/a | n/a | none | MISSING | `explodeChords`/`implodeParts` core commands (depends on S1 add-part) |
| W3 | Fill a range with slashes or rests; duplicate a passage n times | PARTIAL: `fillSlashMeasure` (one bar), `clearMeasureVoice` (one bar), `deleteRange`, `duplicateNote` per note (rejects ties, chords, tuplets) | `Cmd/Ctrl+/`, `Cmd/Ctrl+Shift+Delete`, `Cmd/Ctrl+D` | NIT | 1 entry | unverified | n/a | n/a | `note-entry-workflows`, `note-entry-advanced` | PARTIAL | Range fill; passage duplicate with count |
| W4 | Swing playback; playback of repeats, dynamics, hairpins, articulations, tempo changes | PARTIAL: `setSwing` (no UI), client swing; repeats unrolled by the cursor only; dynamics/articulations MS only | MISSING | MISSING (swing) | 1 entry | n/a | PARTIAL | `<swing>` PASS | `playback-cursor`, `playback-cancellation`, `core-command-executor` | PARTIAL | Unroll repeats in the fallback MIDI so cursor and audio agree |
| W5 | Mixer: instrument sound, volume, mute, solo per part | PARTIAL: `lib/playback-mixer.ts` volume/mute/solo, applied at scheduling; not saved; sound chosen only by instrument-name text | MISSING | `components/PlaybackMixer.tsx` popover | n/a (view state) | n/a | PASS for volume/mute/solo | n/a | `playback-mixer`, `midi-instruments` | PARTIAL | Explicit GM program picker per part |
| W6 | Export PDF of score and every part, MusicXML, MXL, MIDI; reopen in MuseScore CLI | PARTIAL: score PDF via print view and Electron `printToPDF`; parts ZIP (MusicXML); MXL download; no part PDFs; no user MIDI export | Cmd/Ctrl+Shift+E (Electron PDF) | File menu, Electron menu | n/a | print PDF tested | n/a | harness `npm run smoke:musescore-roundtrip`, local MuseScore crashes classified | `parts-archive`, `part-extraction`, `user-visible-exports`, `e2e/print-output`, `musescore-roundtrip-smoke` | PARTIAL | User-facing `.mid` export from the existing MIDI builder |

## Added rows (discovered needs)

| # | Capability | Core model | Keyboard path | Mouse path | Undo/Redo | Render | Playback | MusicXML | Automated evidence | Status | Next action |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| X1 | Keyboard layout independence (US-QWERTY, German/Austrian QWERTZ, UK) for every documented shortcut | PARTIAL: `src/score-input/keyboard-layout.ts` (layout map, US/UK/DE tables, stable codes) and layout-aware resolvers in `keyboard-resolver.ts` for letters, accidentals, articulations, digits, tuplets, history and the positional QWERTY piano. Open: macOS QWERTZ `Option+Shift+0` without a layout map (WebKit) | n/a | n/a | n/a | n/a | n/a | n/a | `keyboard-layout` (91 cases: 3 layouts x macOS/PC x with/without map), `user-visible-note-editor` (Shift+7, Option+digit TAB string), `e2e/notation-tools` (QWERTZ sharp, Undo/Redo) | PARTIAL | Run the scripted keyboard passages on all three layouts (backlog 14); the remaining WebKit gap needs a hardware-keyboard check on iPad |
| X2 | Held keys never repeat entry, edit or transport actions | PASS: `isRepeatableNavigationKey` guard in `useNoteEditor` `handleKeyDown`; Space and workspace keys already ignored `repeat` | n/a | n/a | n/a | n/a | n/a | n/a | `keyboard-layout`, `user-visible-note-editor` (held note/rest/Delete/N), `e2e/notation-tools` (held Space, held QWERTZ note key) | PASS | none |
| X3 | Measure-repeat signs (one- and two-bar) | PARTIAL: export keeps `measure-repeat` style | MISSING | MISSING | n/a | unverified | unverified | `measure-repeat` preserved | none | PARTIAL | Survey the import path; add a command |
| X4 | Barline styles (double, final, dashed) at any barline | PARTIAL: `setBarline` double/final/repeat | CC barline actions | PAL barlines | 1 entry (inverse) | unverified | n/a | PASS | `core-command-executor`, `inverse-commands` | PARTIAL | Rendered evidence; dashed/tick styles |
| X5 | Note visibility, color and size (cue size) per note | PARTIAL: `hidden` flag only | MISSING | MISSING | 1 entry | unverified | hidden notes skipped by fallback | `print-object` PASS | `notation-doctor` | PARTIAL | Shares the P9 visibility command |
| X6 | Score title, subtitle, composer, arranger, lyricist credits | unverified in iteration 0 | unverified | INS score setup (to verify) | unverified | unverified | n/a | unverified | none recorded | PARTIAL | Survey and record evidence |

## Coverage note

Every catalog item from the program prompt has a row. Combined catalog items stay in one row
and are split only when an iteration needs a separate status: concert pitch (S2), staff types
(S3), endings and jumps (T5), breaks and numbering (T8), lyrics (L3), guitar (L5), mixer (W5),
export formats (W6). Recount the summary from the table whenever a status changes.
