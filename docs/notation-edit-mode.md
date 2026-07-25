# Notation Edit Mode (`N`)

Updated: 2026-07-22

`N` is the primary gateway for entering and editing notation with either the mouse or keyboard. The toolbar shows `EDIT N` while it is active. Press `N` again or `Escape` to leave it.

## Direct note-name entry

1. Select a note, rest, or valid measure anchor with the mouse.
2. Press `N`.
3. Choose voice 1–4 if needed (`Cmd/Ctrl+Alt/Option+1`–`4`).
4. Choose a duration with `1`–`9` or the duration toolbar.
5. Enter `A`–`G`; the closest practical octave is chosen.
6. Use `Shift+A`–`G` to add chord tones above the current chord.

Mouse entry uses the same active duration, accidental, voice, insert/overwrite state, and chord state. The visible ghost must resolve to a valid semantic slot before a click can mutate the score.

## Duration-first entry

While Notation Edit Mode is active, press `M` or click `DUR`:

1. Press `A`–`G` to prepare the first pitch.
2. Press `Shift+A`–`G`, or Shift-click the visible A–G pitch buttons, to prepare additional chord tones from bottom to top.
3. Confirm the active pitch on the score cursor and the complete prepared chord in the toolbar, for example `DUR C4+E4+G4`.
4. Press `1`–`9` or click a duration button to commit the complete onset once.

Press `0` or click the rest control to prepare `DUR REST`; the rest is not committed until a duration is chosen. `ArrowUp`/`ArrowDown` moves the active prepared pitch chromatically by one semitone, `Ctrl/Cmd+ArrowUp`/`ArrowDown` moves it by an octave, and `Backspace` removes the last prepared chord tone before it touches score content.

Clicking a notehead in duration-first mode moves the score anchor without committing. Clicking blank score space is selection-only; it cannot use a hidden mouse ghost. Leave duration-first mode with `M` when you want ordinary hover-and-click placement.

If the cursor already contains a chord with the selected duration, only missing pitches are added. Current parity work deliberately targets mouse and computer-keyboard editing; hardware MIDI is outside this effort.

## Core shortcuts

| Shortcut | Action |
| --- | --- |
| `N` | Toggle Notation Edit / Note Input mode |
| `M` | Toggle duration-first input inside notation editing |
| `A`–`G` | Enter a note, or prepare a pitch in duration-first input |
| `Shift+A`–`G` | Add a chord tone above the current highest tone |
| `1`–`9` | Select a duration; in duration-first input, commit the prepared onset |
| `.` | Toggle augmentation dot |
| `0` | Insert a rest; in duration-first input, prepare `DUR REST` |
| `ArrowUp` / `ArrowDown` | Move the duration-first pitch cursor by one staff step |
| `Ctrl/Cmd+ArrowUp` / `ArrowDown` | Move the duration-first pitch cursor by one octave |
| `Backspace` | Remove the last prepared chord tone before deleting score content |
| `R` | Repeat the last input, or insert a rest when no previous input exists |
| `Cmd/Ctrl+Alt/Option+1`–`4` | Select voice 1–4 |
| `Cmd/Ctrl+Shift+H` | Toggle persistent chord input |
| `P` | Toggle the two-octave QWERTY piano input surface |
| `T` | Create the next tied note or complete tied chord |
| `Escape` | Leave Notation Edit Mode and clear the selection |

## Mouse modifiers

| Modifier | Action |
| --- | --- |
| Click a valid ghost | Replace or insert at the resolved rhythmic slot |
| `Alt/Option+Click` | Force chord placement at a note onset |
| `Shift+Click` | Extend selection or request insert placement, depending on the visible target |
| `Cmd/Ctrl+Click` | Add to the semantic selection |

Invalid, ambiguous, or measure-overflow targets fail closed and leave the score unchanged.
