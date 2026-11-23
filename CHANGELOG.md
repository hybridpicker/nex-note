# Changelog

All notable changes to nex-note are documented here.

## Unreleased - 2026-11-10

### Added

- Public Beta distribution. Releases come from `main` as a universal, Developer ID–signed and notarized macOS DMG and a Linux AppImage (plus the Omarchy/Arch package `nex-note-bin`), published on GitHub Releases by `npm run ship`; `npm run release:setup` guides through the one-time signing setup. See `docs/release.md`.
- Update Check for Releases: the app asks once whether to look for updates, then offers each new Release before downloading and installing it. No usage data is sent.
- The Developer App is now "Nex Note Dev" (own bundle id, settings and Linux launcher `nex-note-dev`), so it runs beside the Public Beta. It fast-forwards a clean `devel` checkout from origin at start and hourly, then rebuilds itself. Its first start copies the previous "Nex Note" settings and library.
- New website for nex-note.com in English and German: download buttons for the visitor's system, "Try in browser", formats, privacy and AI, FAQ, Impressum and privacy policy. Until the first Release is published it says "Public Beta – coming soon" and leads to the Browser Preview; the downloads appear on their own within about ten minutes of `npm run ship`. `/de` and `/en` open the page in that language, and the logo, tab and home-screen icons are the app icon. See `docs/website.md`.
- Keyboard presets for people who come from Sibelius or Finale: the selector beside the language menu offers `Nex Note / MuseScore`, `Sibelius (keypad)`, `Sibelius (laptop)` and `Finale (Simple Entry)`. A preset changes the note-entry keys only (values, accidentals, rest, tie, intervals, voices); see `docs/keyboard-shortcuts.md`.
- The AI panel has arranger quick actions above the input: four-part setting, jazz voicing, figured bass, reharmonize, piano accompaniment, chord symbols and a range check. A click sends the request, `Alt/Option`+click puts it into the input to edit. Requests such as "zweite Stimme", "counter-melody" or "SATB" now go to the arrangement workflow.
- More files open: uncompressed MuseScore (`.mscx`), Capella (`.cap`, `.capx`), Power Tab (`.ptb`), MEI, Overture, Guitar Pro 3 (`.gp3`, `.gtp`) and MIDI karaoke (`.kar`). Sibelius, Finale and Dorico files are answered with the export step that makes them openable.
- A PDF with several pages is read completely (only the first page was). A password-protected or damaged PDF, a missing Audiveris and a page without recognizable music each get a sentence that says so.
- Instrument Record has an input profile for a guitar amp connected over USB (Positive Grid Spark MINI, REACTOR 50): `Guitar amp · USB` beside `MIC REC` turns auto gain off, writes guitar notation and listens down to B1 for drop tunings and seven-string guitars. A single input with "Spark" in its name is chosen automatically; any other amp is chosen once and remembered with the profile. In this profile every pick writes a note, the same note picked again is written again without a pause, a hammer-on, pull-off or slide writes the new note, and overtones an octave, twelfth or fifth away are ignored until the next pick. Detection on the real amp is not verified yet; see `docs/development.md` under "Note Input Sources".
- Instrument Record reads strummed chords from the guitar amp: the recognition mode `Strummed chord` (amp profile, `Alt/Option+C` steps through the modes) writes up to six notes played together at once and moves on. The bass note and every note that is no overtone of a lower string are read reliably; a doubling at the octave or twelfth can be left out, and a loud overtone can appear as an extra chord note. Checked with synthetic signals only; see `docs/development.md` under "Note Input Sources".
- `npm run dmg:latest` builds a DMG of the latest commit into `dist/dmg/Nex Note-latest.dmg` without touching the working tree; the post-commit hook runs it in the background.
- Markings are typed at the cursor: one entry field for lyrics (`Cmd/Ctrl+L`), chord symbols (`Cmd/Ctrl+K`, with `Space`, `Tab` and `Cmd/Ctrl+6` to move on), dynamics and hairpins (`Alt/Option+Shift+D`), staff, system and expression text, rehearsal marks, tempo, key, time signature, clef, repeats, barlines, endings, octave and pedal lines. A key signature can start at any bar, a clef change belongs to one part, lyrics carry melisma lines.
- Note input shows a caret in the colour of the input voice at the position of the next note, and a bar with the armed note value, dot, accidental, voice, entry mode and tuplet; every field is clickable.
- A note typed or played in note input is on screen at once: the editor draws it at the caret's place in the frame after the key, and the engraved score takes its place when it has been drawn again. In a score of 2,048 notes that is under 90 ms instead of about a second. A rest, Delete, Undo and a value change still wait for the score to be drawn again.

### Changed

- The desktop apps run on Electron 45.4.1 (was 41, which no longer gets security fixes). macOS 13 Ventura is now the minimum for the Mac app; Electron dropped macOS 12. Saved AI keys use the asynchronous keychain calls and stay readable from earlier versions. Runtime dependencies (`next`, `@capacitor/ios`, `@xmldom/xmldom`, `sharp`, `postcss`) moved to patched versions.
- Playback: the playhead and the played-note highlight now stay on the note being heard (within one frame, no drift; measured in `docs/playback-sync.md`). One shared timeline drives sound, picture, metronome and start-from-selection. Positions are correct in 3/4, 6/8 and other non-4/4 bars, across tempo changes and repeats, and with swing. The output latency is compensated, the playhead follows the engraved notes instead of moving evenly through the bar, it no longer flashes to the end of the next bar at each barline, and it is drawn every frame outside React. Audio runs from a worker timer and keeps playing in hidden windows. Press to sound takes about 35 ms, start-from-selection no longer reloads the instruments, and the metronome follows tempo and time-signature changes. `npm run soundfonts:fetch` before a build bundles the instruments, so the first Play does not download them.
- Measures selected with the mouse are cleared by `Delete` and `Backspace` (only the toolbar and menu did that), and `Shift`- or `Cmd/Ctrl`-click on a further measure extends the measure selection instead of replacing it by one note.
- Stopping Instrument Record (`MIC REC` or MIDI) leaves note input when the recording had switched it on. It stayed on, so afterwards a digit only armed the next note value and measures could not be selected with the mouse.
- In note input `Left` and `Right` move from chord to chord. They stepped through the tones of the chord under the cursor in letter order, so after `Build chord` an arrow could stay on the same beat.
- Microphone Instrument Record reacts about 90 ms sooner: pitch detection read the older half of the analyser buffer instead of the newest samples.
- A PDF whose title page (or any page) has no staves opens: Audiveris rejected the whole file for that one page and the import failed. The readable pages are now exported from Audiveris' book file, and a notice names the skipped pages.
- macOS: after the last window was closed, opening a file from Finder, `open -a`, a second launch or `File > Open` did nothing while Nex Note kept running without a window. These now open a new window and load the file.
- A piano score with a pickup bar numbered 0 keeps its lower staff through edits: the stored file lost `<staves>` in its first bar with the second edit, the lower staff could no longer be written on and the note-input caret did not show there. A bar inserted before bar 1 leaves staves, brace and transposition on the first bar.
- While the score is drawn again after an edit, the caret and the bar frames of the previous drawing stay on screen.
- Copy and paste between parts that transpose differently keeps the sound: a flute phrase pasted into a clarinet in B flat is written a major second higher.
- A tempo typed as `Allegro q=120` keeps its word beside the metronome number, in the file as well; tempo marks of other programs in that form keep both on import.
- A slur over a selection that crosses a barline is written. After `Delete` and `Cmd/Ctrl+X` the rests that are left are selected at once, so the next key is not lost.
- Navigation: `Cmd/Ctrl+Shift+Left/Right` extends the selection by bars, `Alt/Option+Up/Down` crosses parts, `Cmd/Ctrl+Home/End` go to the top staff, the arrow keys leave a second voice where it ends, and in note input they keep the chosen voice.
- Bars from the keyboard, as in MuseScore: `Insert` puts an empty bar before the selection, `Cmd/Ctrl+B` appends one, `Cmd/Ctrl+Delete` deletes the bars of the selection. Deleting the first bar no longer loses clef, key and time signature, a bar added after a pickup is a whole bar, and new bars no longer repeat clef, key and time signature in the exported file.
- Outside note input `Cmd/Ctrl+Alt/Option+1`–`4` moves the selected notes to that voice (it only chose the input voice). In note input, and with a rest or nothing selected, it chooses the voice as before.
- A value key on a selected grace note changes the grace note; it used to rewrite the main note beside it. A rest typed on a unit of a half-note triplet keeps the unit's value, and a chord tone added to a tuplet unit behind a grace note stays in the tuplet.
- Outside note input the value keys, the dot and `Q`/`W` change the selected note or rest, as in MuseScore; they used to arm the next value only. `Alt/Option+Shift+Up/Down` moves a note by a step of the key (it moved an octave). `Backspace` in note input takes back the note just entered and puts the cursor on its place. A letter typed on a selected rest takes its octave from the note before it.
- `<` and `>` write hairpins over the selection, and the accent key is `Shift+V`, as in MuseScore; `Shift+.` (which types `>` on a US keyboard) no longer sets an accent. `Shift+N` (tenuto) and `Shift+O` (marcato) are added beside `Shift+-` and `Shift+6`.
- With a note selected, `Cmd/Ctrl+T` and `Cmd/Ctrl+M` open the entry field at the note instead of the Inspector.
- Mouse entry follows MuseScore: a click in note input adds a chord tone to a note of the armed value, replaces a note of another value and writes over a rest; it no longer inserts and pushes the bar when the pointer stands left of a notehead. `Shift`+click replaces, `Cmd/Ctrl+Shift`+click inserts, `Alt/Option`+click adds a chord tone.
- The mode buttons of the notation tools read `Standard`/`Replace`, `Chord`, `Keys`, `Pitch first` and `Lead sheet` instead of `INS`/`OVR`, `CHD`, `STEP`, `DUR` and `LEAD`; the status line names bar, beat, pitch and value instead of an onset fraction; the Inspector shows pitch, value, position, voice, stem and visibility of the selected note.

### Fixed

- In a score with a pickup bar the mouse preview was missing or drawn in the neighbouring bar, and a click could enter its note one bar late.
- After undoing a note entered with the mouse, the next click in that bar previewed a chord tone on the note that was gone and entered nothing.
- Undo during note input lost the input cursor, so later keys did nothing; Undo and Redo now keep it.
- `W` in note input lost the cursor; `Q`/`W` now change the note just entered and move the cursor past it.
- A shorter note value moved the rest of the bar earlier; the freed time now becomes rests.
- A finer value in one staff of a grand staff deleted notes of the other voice and of the bar.
- Three crashes when a pitch change reached a note that had become a rest.
- The saved MusicXML could spell rests differently from the score on screen.
- A grace note left in front of a rest was lost, together with its tuplet place, on reopening.

- In note input a value longer than the note at the cursor was rejected when notes followed in the bar; it now overwrites them, as in MuseScore.

- A letter typed on a triplet rest broke the triplet; `T` onto a triplet note wrote wrong values.
- Delete on a note with a grace note left a hidden gap in the bar.
- Paste rewrote tied notes elsewhere in the voice and could overfill a bar that held a tied chord.
- A tie could move onto a grace note, or stay behind after its second note was replaced.
- Undo of the first note of a voice in a bar lost the input cursor.
- The saved file could contain a stray `<backup>` that vanished on the next edit.

- A note typed after or into a triplet could respell or cut the triplet; a chord tone could get a different length than its chord.

- A bar added while entering notes could be saved with a wrong `<divisions>` value and reopen with wrong note lengths.
- Delete on a triplet note left rests of odd values; repeating or copying one tone of a chord could shift another voice.

- The score moved 12 px down as soon as a note was selected, so a mouse click could land two staff steps away from its preview.
- `Q`/`W` and the value keys on a triplet note broke the triplet; they now work inside it.
- A command-center command for a palette section did nothing while the notation tools were collapsed.

- In note input a letter typed in another voice only changed the pitch of that voice's note; it now writes the armed value and moves on.
- `Cmd/Ctrl+3` with the cursor at the end of the score replaced the last note.

- The mouse preview could change pitch and mode without the pointer moving, and under load a click then inserted a different note and pushed the bar's last note out.

- Every edit is faster in larger scores: the MusicXML export no longer copies and re-parses the whole score (about eight times faster at 4,096 notes).

### Changed

- `0` outside note input starts note input and writes the rest over the selected note, as in MuseScore (it used to insert a rest and push the bar's last note out).

- `R` outside note input repeats the selection after itself, as in MuseScore (it used to insert a rest and push the bar's last note out).
- Paste always overwrites the following music, as in MuseScore, Dorico and Finale.

- Playback sound: every part has its own place in the stereo picture and a share of a common room reverb; loudness follows the written dynamics with a wider range and is about 19 dB louder overall without clipping. Long notes of sustaining instruments (strings, winds, organ) hold for their written length instead of stopping after about three seconds, and notes end with a short fade instead of a click. The sustain pedal is played. Percussion staves sound (a built-in drum kit for General MIDI notes 35 to 81); they were silent. The metronome click is a woodblock. See "Sound" in `docs/playback-sync.md`.
- Parts get the instrument they name: 21 more instrument names and MIDI programs map to the bundled sounds, and a part without a sound of its own no longer falls back to the piano when the file names its program.
- A note clicked in the score sounds at once and at its sounding pitch in transposing parts; it used to wait for the playback data to load.
- When MuseScore is not installed, or on the iPad, the built-in playback renderer now plays accents, staccato, marcato, sforzato and dynamics like the MuseScore rendering does.
- Entering a note with the mouse or pen draws the score once instead of twice, so large scores respond about twice as fast after a click (4,096 notes: about 2.3 s of blocked time instead of 4.9 s on the development server). Changing the note value and moving the pointer over a large score are faster as well.
- The header stays on one line: below 1200 px (and on the iPad in portrait) the provider, language and keyboard-preset controls move into an overflow menu at the right end. The notation toolbar scrolls sideways instead of cutting buttons off. Every control shows a focus ring when reached with the keyboard, and buttons are at least 44 px high on touch screens.
- Note input bar, on-score input overlay, welcome screen and upload area have larger text and stronger contrast; the colour of voice 2 is a clearer blue-violet.
- `Cmd/Ctrl+T`, `M`, `N` and `W` no longer fire while typing in a text field.

### Fixed

- After a click or Undo the mouse preview could show, and a click could be placed on, the score as it was before the edit while the new score was still being drawn. The preview now waits for the new drawing, and a click in that moment is ignored instead of entering a note in the wrong place.
- The played-note highlight is centred on the sound (about half a frame early or late) instead of trailing it by up to one frame.
- An embedded score (iframe) could stay on its loading bar and never show the music.
- `Esc` closes the command center even before its search field has focus; the provider menu no longer lays its entries out in a row.
- Playback could fail when MuseScore crashed on exit although it had already written a complete MIDI file; the file is now used.
- Transposing a range in a part with tablature left the tablature on the old frets.
- Paste into a grand staff or several parts could put all lanes into one staff; each copied staff now lands on its own staff.
- Copy over bars with different internal grids could change note lengths in the pasted music.
- Cut removed the selection even when copying it had failed.
- Transposing a selection that spans several staves or voices moved only part of it.
- A tie could stay on a note whose partner was replaced by a rest; rests in 6/8 and other compound metres were split on the quarter-note grid.
- A note could keep the written value of its old length after an edit (a quarter shown as a half).
- A dotted half note on beat 1 of a 4/4 bar was split into two tied notes.
- Inserted bars could share an internal id with an existing bar, which changed note lengths; rests beyond the end of the last bar were appended to it.
- The saved MusicXML could carry a `<divisions>` value that no longer matched the bar's notes, so the file reopened with different lengths.

### Validation

- 1,689 unit tests, including a seeded entry fuzzer over six synthetic scores; build; `e2e/notation-tools.spec.ts` (51) in Chromium; Electron package build and verify; `ipad:sync` and `ipad:doctor`. 14 tests of `e2e/app.spec.ts` already failed before these changes and are tracked in `docs/note-entry-mastery-ledger.md` (F15).
- 2026-11-15 (sound, speed, core and interface pass): 2,132 unit tests; build; the complete `smoke` and `regression` end-to-end projects in Chromium: 298 passed, 3 failed, 6 skipped. The three failures: `e2e/notation-tools.spec.ts` "eight-bar keyboard replacement ..." (F55 in `docs/note-entry-mastery-ledger.md`, passed in the run before) and two playback probe scenarios over the playhead drift budget (`small` 5.5 against 5 ms/min, `start from a selected note` 30.8 over nine notes; see `docs/playback-sync.md`). `electron:refresh` with package verify, `ipad:sync` and `ipad:doctor` passed; nothing was tried on a physical iPad or on Linux.

## Unreleased - 2026-10-02

### Added

- Linux (Omarchy/Hyprland) desktop app: native Wayland, tiled frameless window, installer/update/uninstall scripts, `nex-note` launcher, MIME types and icon entry.
- Vector A4 PDF export (File > Export PDF..., Ctrl+Shift+E) and Export All Parts (ZIP).
- Per-part playback mixer (volume, mute, solo).
- Selectable notation font (Bravura default, Petaluma, Gonville), applied at next start.
- Offline-first playback samples via `npm run soundfonts:fetch` (FluidR3_GM).
- MIDI port rescan on a 3-second timer and window focus for unreliable ALSA/PipeWire hotplug events.

### Fixed

- Files passed on the command line or opened from the file manager were lost when sent before the renderer had registered its listener; delivery now waits for a renderer-ready signal.
- Menu accelerators did not fire on Linux with the native menu bar hidden; the main process now handles file, zoom, find and command-center shortcuts.
- Shortcut labels showed Cmd/Option on Linux in many places; they are now formatted centrally in `translate()`.
- Print/PDF output used US Letter with a dark page margin; it now uses A4 with zero page margin.
- Removed a stale machine-specific MuseScore path.

### Validation

- 1,135 unit tests pass. Verified in the packaged Linux app with a synthetic score: window class and native Wayland, command-line file open, key chords reaching the main process, export handler output (A4, tagged, vector). The GTK save dialog and mixer/notation-font menus were not exercised by hand.

## 0.0.7 - 2026-07-25

### Changed

- Plain Arrow Up and Arrow Down now always move pitch chromatically by exactly one semitone throughout Note Input.
- The duration-first prepared-pitch cursor now uses the same chromatic behavior as active existing notes and chord tones instead of moving by diatonic staff steps.

### Validation

- Added hook and browser regressions for the prepared cursor sequence C4 → C-sharp4 → D4 → C-sharp4 without committing score content.

## 0.0.6 - 2026-07-25

### Fixed

- Arrow Up and Arrow Down now repitch the active individual tone in a chord created during the current Note Input session.
- Chromatic transpose commands carry pitch identity as a fallback when subsequent chord insertion has regenerated the active tone's semantic entity ID.
- The transposed tone is resolved back to its canonical entity so repeated arrow presses keep only that chord tone active.

### Validation

- Added hook and browser regressions that build a C–E–G chord through the visible interval-entry workflow, repitch only the active G to G-sharp, and restore it with the next keypress.

## 0.0.5 - 2026-07-25

### Fixed

- Arrow Up and Arrow Down in Note Input now transpose every pitched note in an explicit multi-note or chord selection together instead of collapsing the edit to one active tone.
- Repeated chromatic-arrow presses keep the complete moved selection active.

### Validation

- Added hook and browser regressions for multi-note Note Input transposition, including repeated keypresses and selection preservation.

## 0.0.4 - 2026-07-25

### Fixed

- Re-entering Note Input now promotes the currently selected existing note to the active input note, so Arrow Up and Arrow Down repitch that note instead of a stale note from an earlier input session.
- Local app launch verification now distinguishes the packaged Nex Note build from a stale Electron development wrapper registered under the same display name.

### Validation

- Added unit, browser, and packaged Electron coverage for selecting a different note between Note Input sessions and repitching it chromatically.

## 0.0.3 - 2026-07-25

### Fixed

- Arrow Up and Arrow Down now repitch the active existing note by one chromatic semitone per press in Note Input, even when input-by-duration is armed, while preserving prepared-pitch navigation when no existing pitched note is active.

### Validation

- All 992 unit and integration tests pass.
- The focused browser regression and the Next.js production build pass.

## 0.0.2 - 2026-07-23

### Changed

- Added MuseScore-style multi-note selection feedback so every selected chord tone remains visibly active.
- Added live ghost-note feedback while dragging notes vertically.
- Changed replace dragging to repitch the addressed note or chord tone in place instead of creating another event.
- Restored first-note and repeated multi-note mouse entry, including Guitar + TAB synchronization.
- Improved contextual TAB voicing and standard-notation octave mirroring.
- Prevented menus, dialogs, and other interactive overlays from leaking pointer events into the score.
- Upgraded Next.js to 16.2.11 and refreshed security overrides; the production dependency audit is clean.

### Validation

- 991 unit and integration tests pass.
- Coverage gates pass at 85.59% lines, 78.13% branches, and 86.74% functions.
- The production build and all 30 browser smoke tests pass.
- Long-form chord and score-transformation stress workflows pass with updated rhythmic-anchor fixtures.
- The MuseScore 4.7.3 roundtrip harness exits successfully with `passed-with-local-musescore-limit`; the local MuseScore installation remains intermittently crash-unstable on source baselines.
