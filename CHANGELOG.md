# Changelog

All notable changes to nex-note are documented here.

## Unreleased - 2026-11-10

### Fixed

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

### Changed

- `0` outside note input starts note input and writes the rest over the selected note, as in MuseScore (it used to insert a rest and push the bar's last note out).

- `R` outside note input repeats the selection after itself, as in MuseScore (it used to insert a rest and push the bar's last note out).
- Paste always overwrites the following music, as in MuseScore, Dorico and Finale.

### Validation

- 1,689 unit tests, including a seeded entry fuzzer over six synthetic scores; build; `e2e/notation-tools.spec.ts` (51) in Chromium; Electron package build and verify; `ipad:sync` and `ipad:doctor`. 14 tests of `e2e/app.spec.ts` already failed before these changes and are tracked in `docs/note-entry-mastery-ledger.md` (F15).

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
