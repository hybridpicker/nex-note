# User-Visible and Audible Test Plan

Updated: 2026-06-24

## Automation Gate

Before the manual matrix, run the automated gate in this order:

```bash
npm test
npm run smoke:musescore-roundtrip
npm run test:e2e:smoke
npm run test:e2e:regression
npm run build
```

`npm run smoke:musescore-roundtrip` is optional when MuseScore CLI is unavailable. When it runs, it checks source MusicXML, app-style MXL, and MSCZ create/reopen paths, retries crash-like failures, writes `summary.json` and `summary.txt` under `.nex/musescore-roundtrip-smoke-*`, and reports `passed-with-local-musescore-limit` when local MuseScore source-baseline crashes make nex-note-only crash attribution inconclusive.

If an E2E browser test fails, inspect `test-results/playwright/.../nex-note-failure-artifacts/` first. That folder now contains the captured `e2e-state.json` and the live MusicXML from the failing browser session, alongside Playwright trace, screenshot, and video artifacts.
For mouse note-input regressions, prefer the ghost-map harness in `e2e/support/ghost-map.ts`. It samples the visible ghost across a measure, records the actual timestamps the UI exposes, and then lets tests click those measured points instead of assuming a linear quarter-width layout.

For manual browser findings, run the app in debug mode and use the in-app `Report bug` button immediately after reproducing the issue. That exports the user description together with the current score, runtime state, and recent action trace for Codex/Claude triage.

This document is the manual release-validation matrix for user-visible UI behavior and audible playback behavior.

## Methodology

Every test case has three checkpoints:

1. Action: what the user does
2. See: what changes on screen, including DOM, SVG, toolbar state, badges, overlays, and score rendering
3. Hear: what changes in the audio output, if applicable

For automated mouse-entry checks, add a fourth checkpoint when relevant:

4. Measure: the sampled ghost map for the target measure is monotonic and exposes the expected timestamps before the click is committed

Pass criteria:

- A case is `PASS` only if every applicable checkpoint matches.
- Tests without an audible component explicitly state `Silent`.
- Tests with audio must be verified with speakers or headphones on.
- If notation and sound diverge, the test fails.
- Example: a pitch that renders as `E#` but still plays as `E` is `FAIL`.

## Suggested Fixtures

Run the full regression pass with at least these score types:

- one SATB piece
- one single-staff melody
- one transposing-instrument part

Recommended repo fixtures to standardize around:

- `test/fixtures/choir-lyrics.musicxml`
- `test/fixtures/piano-semantics.musicxml`
- `test/fixtures/leadsheet-repeat.musicxml`
- `test/fixtures/temp-multi-voice-runtime.musicxml`

## Suite 1: File Lifecycle

All tests in this suite are `Silent`.

| # | Action | See | Hear |
| --- | --- | --- | --- |
| 1.1 | Drop `.mxl` on welcome upload zone | Border highlights while dragging, then spinner, then score renders and filename pill appears | Silent |
| 1.2 | Drop `.pdf` | Spinner with `Converting... (PDF may take up to 60s)`, then score renders | Silent |
| 1.3 | Drop unsupported file | Red error under drop zone and no score loads | Silent |
| 1.4 | Click folder icon and pick file | OS picker opens, score replaces current, undo stack cleared | Silent |
| 1.5 | Click new-file button | Welcome screen returns and filename disappears | Silent |
| 1.6 | Click Save As | Prompt appears, filename pill updates, Library tab opens and shows new entry | Silent |
| 1.7 | Click Export ABC | `<name>.abc` downloads | Silent |
| 1.8 | Click Download MXL | `<name>.mxl` downloads | Silent |
| 1.9 | Run MuseScore roundtrip harness when MuseScore CLI is installed | Harness summary distinguishes pass, nex-note export failure, and local MuseScore crash limitation; artifacts are under `.nex/musescore-roundtrip-smoke-*` | Silent |
| 1.10 | Open MIDI export and verify round-trip | Exported file opens in external player | Plays identically in external app |
| 1.11 | Reopen a recent file | File picker is targeted and load succeeds | Silent |

## Suite 2: Selection and Preview

| # | Action | See | Hear |
| --- | --- | --- | --- |
| 2.1 | Click `E4` note | Note turns blue and badge shows `E4 · m.N` | Piano `E4` preview for about 0.45s |
| 2.2 | Click empty area | Selection cleared and badge shows `No note selected` | Silent |
| 2.3 | Shift-click a later note | Range highlighted and all in-between notes tinted | Silent |
| 2.4 | Cmd-click another note | Additive selection, anchor blue, others teal | Silent |
| 2.5 | Cmd-click an already selected note | That note is deselected | Silent |
| 2.6 | Arrow Right or Left | Blue selection hops one note | Silent |
| 2.7 | Shift+Arrow Right | Range extends by one | Silent |
| 2.8 | Alt+Arrow Right | Jumps to the next measure's first note | Silent |
| 2.9 | Cmd+A | All notes in current voice highlighted | Silent |
| 2.10 | Escape | Selection cleared and note-input mode turns off | Silent |

## Suite 3: Accidentals

Canonical user scenario:

| # | Action | See | Hear |
| --- | --- | --- | --- |
| 3.1 | Click `E4` | `E4` selected in blue and badge shows `E4` | Piano `E4` preview |
| 3.2 | Click `#` in toolbar | Sharp button highlighted | Silent |
| 3.3 | Press `E` while pitch is already `E` | Note redraws as `E#` and badge shows `E#4` | Piano `E#` preview |
| 3.4 | Click Play | Playback cursor reaches that beat | That note sounds as `F` (`E#`), not `E` |

Repeat the same flow for each accidental:

| # | Accidental | Expected pitch | Expected sound |
| --- | --- | --- | --- |
| 3.5 | Flat | `Eb4` | Piano `D#` equivalent |
| 3.6 | Natural | `E4` | Piano `E` |
| 3.7 | Double-flat | `Ebb4` | Piano `D` |
| 3.8 | Double-sharp | `Ex4` | Piano `F#` |
| 3.9 | Click the same accidental again | Button deselects and note remains unchanged | Silent |
| 3.10 | Enable Note Input, arm Sharp, enter `B` | Sharp is written once; toolbar highlight clears after the successful note | Piano pitch matches B-sharp |
| 3.11 | Enter `B` again in the same measure and octave | Second B keeps the sounding sharp without a second explicit glyph | Same pitch as step 3.10 |
| 3.12 | Enter the same letter in another octave, then in the next measure | Accidental carry resets independently by octave and barline | Pitch follows that octave/measure context and key signature |
| 3.13 | Select C-sharp and press `J` three times | Spelling cycles C-sharp → D-flat → B-double-sharp → C-sharp; notehead moves but selection/entity remains | Every spelling sounds the same MIDI pitch |
| 3.14 | Select a chord or range and press `J`, then Undo/Redo | Every selected pitch advances independently in one history step | Playback pitches remain unchanged |
| 3.15 | Respell a cross-measure tied note and a paired notation/TAB note | Complete tie chain shares one spelling; TAB string/fret does not move | Sustained pitch and TAB playback remain unchanged |
| 3.16 | Select an explicitly written accidental, open Edit Palette → Accidentals, enable Courtesy, then choose no enclosure, round parentheses, and square brackets | The accidental re-engraves for each enclosure; the active controls expose `aria-pressed`; Inspector shows the same state | Silent; MIDI pitch is unchanged |
| 3.17 | Copy/Paste the marked note, export/reimport MusicXML, then Undo/Redo each Courtesy/enclosure action | `cautionary`, `parentheses`, or `bracket` survives as appropriate; one user action is one history transaction; Doctor stays clean | Source and pasted notes retain the same sounding pitch |

Manual courtesy/cautionary acceptance is automated. Automatic courtesy suggestions remain out of scope and must not silently alter a score.

## Suite 4: Pitch and Octave

| # | Action | See | Hear |
| --- | --- | --- | --- |
| 4.1 | With note selected, press `C` | Pitch glyph changes to `C` | Piano `C` preview |
| 4.2 | Arrow Up | Notehead moves up one octave on staff | Preview plays one octave higher |
| 4.3 | Arrow Down | Note moves one octave lower | Lower preview |
| 4.4 | Edit Palette `+1 semitone` | Note raises a half-step with proper accidental | Preview one semitone up |
| 4.5 | Edit Palette `+P5` | Note moves up a perfect fifth | Preview transposes up 7 semitones |
| 4.6 | Inspector range selection then `Transpose +2` | Whole range shifts up | Playback is 2 semitones higher |

## Suite 5: Duration, Dot, Rest, Tie

| # | Action | See | Hear |
| --- | --- | --- | --- |
| 5.1 | Keys `1` to `9` | Duration button highlight cycles from 64th through breve and longa | Silent |
| 5.2 | Note input on, press `5`, then `G` | Quarter-note `G` inserted and cursor advances | Piano `G` plays |
| 5.3 | Press `.` | Dot button toggles and last inserted note becomes dotted | Silent |
| 5.4 | Press `R` | Rest glyph inserted | Silent |
| 5.5 | Press `T` between two same-pitch notes | Tie arc drawn | Playback does not retrigger second notehead |
| 5.6 | Press `T` again | Tie removed | Silent |
| 5.7 | Select an existing tie-start note and set Tie below/above in the Inspector | Tie arc moves below/above and survives reload/export | Silent |
| 5.8 | Press `S` over two or more notes | Slur arc drawn | Silent |
| 5.9 | Grace-note button | Small grace note drawn before anchor | On playback, grace note precedes main note |
| 5.10 | Select the first note after a barline in 5/8 and press `/`, then Undo/Redo | A separate small grace note appears before the unchanged anchor; both measures remain balanced and Doctor stays clean | Main-note timing is unchanged |
| 5.11 | Select exactly one quarter note at the start of a later 5/8 measure and press `Cmd/Ctrl+3`, then Undo/Redo | The anchor becomes the first of three eighth-note triplet units followed by two editable rests; measure balance, selection, and Doctor remain stable | Group playback still occupies the original quarter-note duration |

Regression note for `5.5`:

- Verify after commit `7e1fdcc` that tie markers are not doubled in MIDI export.

## Suite 6: Articulations and Dynamics

For each articulation, record whether playback is audible or visual-only by design.

| Articulation | Action | See | Hear |
| --- | --- | --- | --- |
| Staccato | Select note and apply from toolbar or palette | Dot above or below note | Shorter note on playback if engine applies it |
| Staccatissimo | Select note and apply from palette | Wedge above note | Very short if engine applies it |
| Accent | Select note and apply from toolbar | Accent mark | Louder if engine applies it |
| Marcato | Select note and apply from toolbar | Marcato mark | Louder or sharper if engine applies it |
| Tenuto | Select note and apply from toolbar | Tenuto line | Full-length if engine applies it |
| Fermata | Select note and apply from palette | Fermata over note | Held note if engine applies it |

Placement check: import or create an articulated note, select it, use Inspector -> Selection to set the articulation or fermata below and above, then export/reimport MusicXML. The mark should visibly move and the MusicXML should retain the placement attribute.

Dynamics:

- `pp` through `fff` and `sfz` should appear below the staff.
- On playback, loudness should change for following notes if the engine applies dynamics.
- If dynamics are not rendered into playback, record them as `visual-only by design`.

## Suite 7: Voices, Barlines, Grace Notes

This suite is primarily visual unless playback is explicitly part of the case.

- Voice toggles `V1` to `V4`: new notes enter the chosen voice and stems flip accordingly.
- Barline palette: each supported barline type renders correctly at the selected measure.
- Repeat start and end plus first and second endings render volta brackets correctly.

## Suite 8: Undo and Redo

| # | Action | See | Hear |
| --- | --- | --- | --- |
| 8.1 | Make an edit, then Cmd+Z | Edit reverts and score rerenders | Silent |
| 8.2 | Cmd+Shift+Z | Edit reapplies | Silent |
| 8.3 | Undo when stack is empty | Button disabled or grayed out and no-op | Silent |
| 8.4 | Perform more than 100 edits, then undo to end | Oldest entries dropped according to `MAX_HISTORY=100` | Silent |
| 8.5 | Type `undo` in chat | Edit reverts through AI acknowledgment path | Silent |

## Suite 9: Playback

This suite is critical and audible.

| # | Action | See | Hear |
| --- | --- | --- | --- |
| 9.1 | Click Play | Play icon changes to Pause, progress bar appears, measure counter updates, notes tint blue at cursor | Piano soundfont plays the score |
| 9.2 | Select a note, then click Play | Starts at that note | Plays from that beat |
| 9.3 | Press Space while playing | Playback pauses and progress freezes | Audio stops mid-note |
| 9.4 | Press Space again | Playback resumes | Audio resumes |
| 9.5 | Click Stop | Progress clears and `Ready` is shown | Silent |
| 9.6 | Click progress bar mid-score | Cursor jumps | Audio resumes from new beat |
| 9.7 | Drag tempo slider during playback | BPM readout updates | Tempo changes in real time |
| 9.8 | Enable metronome, then click Play | Metronome icon active | Click on each beat, 1200 Hz downbeat and 900 Hz upbeat |
| 9.9 | Let playback reach end | `Ready` shown | Silent after last note |
| 9.10 | Click Play before soundfont is ready | Spinner on Play button | Silence until loaded, then playback starts |

## Suite 10: AI and Layout

| # | Action | See | Hear |
| --- | --- | --- | --- |
| 10.1 | Chat `remove dynamics` and wait for AI plan | `Thinking...`, then confirmation bubble, then input placeholder changes to `Type apply to confirm...` | Silent |
| 10.2 | Type `apply` | Commands applied and dynamics disappear from score | Silent |
| 10.3 | Type `cancel` | Preview discarded and score unchanged | Silent |
| 10.4 | Click layout button | Spinner, then confirmation dialog, then apply path | Silent |
| 10.5 | Send chat with notes selected | AI edits affect only the selection | Silent |
| 10.6 | Switch provider among Claude, Gemini, Ollama, Benchmark | Provider badge color changes and Ollama shows model dropdown | Silent |
| 10.7 | Add custom Ollama model `llama3:8b` and confirm | Model appears in dropdown | Silent |

Known-song catalog import is not enabled yet. Before enabling it, add browser coverage for the matrix in [ai-song-source-catalogs.md](./ai-song-source-catalogs.md):

- Allowed public-domain or compatible Creative Commons candidate: source picker appears, license/attribution are visible, import renders a valid score, and playback matches the imported melody.
- Blocked or unknown source: no score mutation occurs and the chat asks for an allowed source or user-provided import file.
- Multiple versions: the app requires explicit user selection before import.

## Suite 11: Inspector and Score Metadata

Run the following and document visual or audible outcomes where relevant:

- Title and composer fields: Apply and confirm rendered header updates.
- Key preset `C`, `G`, `D`, `A`, `F`, `Bb`: key signature changes visually, then play the first measure to confirm pitches sound correctly.
- Time signature preset: time-signature glyph changes and measures reflow.
- Clef preset `Treble`, `Bass`, `Alto`: clef changes, then play to confirm pitch behavior matches product intent.
- Repeats and first and second endings: render correctly, then confirm playback actually takes the repeat.
- Insert measure, delete measure, system break, page break: score reflows correctly.
- Rehearsal mark and staff text: appear at the target measure.
- Lyrics: select note, enter lyric, apply, and confirm syllable appears under note.
- Part setup name, abbreviation, transpose: part label updates and transposed instruments show shifted notation while preserving intended sounding pitch.

Clef behavior note:

- Document the expected design before treating it as a failure.
- Treble-to-bass clef changes may be visual-only or may imply transposition depending on intended product behavior.

## Suite 12: Keyboard Shortcut Matrix

Run every shortcut from the reference table while focus is not in an input field.

For each shortcut, confirm:

- the action fires when focus is outside inputs
- nothing fires when focus is in chat or another text input
- nothing fires while a modal prompt or confirm dialog is open

## Suite 13: Library and Presets

All tests in this suite are `Silent`.

- Auto-save: edit loaded score, wait 900 ms, open Library tab, and confirm entry updated.
- Library filter input: list narrows as expected.
- Favorites toggle: only starred entries remain visible.
- Preset save: prompt for name and confirm the preset appears under `Saved`.
- Preset delete: preset disappears.
- Apply built-in preset: score updates immediately.

## Suite 14: Responsive and Edge Cases

- Collapse and expand the right sidebar with the chevron.
- Verify toolbar overflow remains usable on a narrow viewport.
- Load a score with more than 100 measures and confirm playback cursor stays in sync and scrolling follows it.
- Load empty or malformed XML and confirm graceful error handling instead of crash.
- Open multiple files in sequence and confirm there is no stale selection, stale filename, or obvious memory leak behavior.

## Suite 15: Cross-Cutting Regression Guards

Pin these recent fixes and verify they remain true:

- `7e1fdcc`: tie export markers not visible in export preview
- `1c1214e`: MIDI export playback sanitization, exported MIDI plays cleanly in external player with no ghost notes or duplicated events
- `fdc470e`: editor note-input icons render correctly and scale at default zoom
- `f43bf64`: new layout design, toolbar groups do not overlap at 1280 px width

## Execution Strategy

1. Smoke tier, about 10 minutes:
   - automated prerequisite: `npm run test:e2e:smoke`
   - `1.1`
   - `2.1`
   - `3.1` through `3.4`
   - `9.1` through `9.5`
   - If any of these fail, stop and fix before continuing.
2. Full regression, about 60 to 90 minutes:
   - automated prerequisite: `npm run test:e2e:regression`
   - run all suites in order using the standardized fixture set
3. Audio-only pass, about 15 minutes:
   - re-run every row with a `Hear` column using headphones
4. Automation candidates:
   - Suite `8`
   - Suite `11`
   - Suite `15`
   - good fit for Jest plus jsdom plus MIDI-output diffing
   - visual suites remain manual unless Playwright plus snapshot rendering is added
