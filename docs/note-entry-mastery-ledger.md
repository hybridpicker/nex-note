# Note Entry Mastery: Ledger

Program prompt: [note-entry-mastery-prompt.md](./note-entry-mastery-prompt.md). This ledger is the
live work queue and the only record a new session resumes from. Status values: `open`,
`reproduced`, `fixed`, `not reproduced`, `blocked`. No row is `fixed` without an automated test
that failed before the change for the stated reason.

Started 2026-11-10 on `devel@fe64f3d`.

## Gates

| Gate | State | Evidence |
| --- | --- | --- |
| 1 Trust | Not met | P0 rows open; the fuzzer fails on fresh seeds (F10 to F12) |
| 2 Preview equals commit | Not met | Mouse corpus not built (M7); F2 to F4, F7 open |
| 3 Speed, production build | Not met | Production latency run not done (T3) |
| 4 Orientation | Not met | O1 to O4 open; session driver not built (T2) |
| 5 Keyboard flow | Not met | Reference tasks R2 to R6 not built (T4) |
| 6 Mouse flow | Not met | R7, R8 not built; M1 to M6 open |
| 7 Every row closed | Not met | See queue |
| 8 Surfaces and exchange | Not run on a final commit | |
| 9 Independent review | Not started | |

## Tools (Iteration 0)

| ID | Tool | State |
| --- | --- | --- |
| T1 | Entry fuzzer: `test/entry-fuzz.test.ts`, `test/support/entry-fuzz.ts`. Six synthetic fixtures (single staff, grand staff with two voices, transposing part, tuplets and graces, pickup bar, three parts), 48 weighted key and click actions through the real editor and history hooks. After every action: no new validator error (covers bar sums per voice and meter), no lane outside the addressed part/staff/voice changed, note input keeps a cursor. After every sequence: Undo to the start equals the start XML, Redo to the end equals the end XML. Failures shrink to a minimal replay. `npm test` runs 12 fixed sequences; the gate run is `NEX_FUZZ_SEQUENCES=2000 NEX_FUZZ_SEED=<fresh> npx tsx --test test/entry-fuzz.test.ts` | Built. Voice-level isolation uses the selection's lanes plus the stored entry voice; a bar appended or inserted by the action may add whole-bar rests to every lane |
| T1a | App-level harness: `test/support/app-harness.ts` mounts `useScoreDocument` and `useNoteEditor` wired as `components/NexNoteApp.tsx` wires them (selection anchors in command meta, selection restore after history changes, `Cmd/Ctrl+Z` and `Cmd/Ctrl+Shift+Z` to Undo and Redo). The older `test/support/entry-harness.ts` has no history | Built |
| T2 | Browser session driver `e2e/support/entry-session.ts` | open |
| T3 | Production latency run (`npm run build`, built app, `window.__NEX_NOTE_INPUT_METRICS__` at 32, 512 and 4,096 notes) | open |
| T4 | Reference tasks R1 to R8 as fixtures with Nex Note and MuseScore key scripts and counts. R1 exists as `test/support/keyboard-passage.ts`; its MuseScore script is not written | open |

Deviation from the prompt: the tools were committed together with the F1 fix, not before it. On
the unchanged code the fuzzer's fixed `npm test` seeds already fail with F1 (`N d Cmd+z` leaves note
input without a cursor, seed 20361111 on the grand staff), so a tools-only commit would have left
`npm test` red.

## Work queue

### P0. Trust

| ID | Finding | Reproduction test | Status | Commit |
| --- | --- | --- | --- | --- |
| F1 | Undo during note input loses the cursor; letters, arrows and new values do nothing afterwards | `test/note-entry-cursor-trust.test.ts` (4 tests failed before: cursor `none`), fuzzer seed 20361111 | fixed | see log, iteration 1 |
| F2 | Mouse preview and commit disagree (ghost A4, commit D5); busy bar pushes the canvas ~12 px | needs T2 | open | |
| F3 | Page stops answering after a mouse commit; 404 for `/soundfonts/FluidR3_GM/flute-mp3.js` | needs T2 | open | |
| F4 | Two clicks on a valid ghost commit nothing | needs T2 | open | |
| F5 | `R` in normal mode on a full 4/4 bar inserts a rest and drops the bar's last note | | open | |
| F6 | Default entry mode is `insert`; paste pushes notes over the barline | | open | |
| F7 | Zoom-dependent mouse evidence predates the zoom fix | needs T2 | open | |
| F8 | (fuzzer, seed 20761115, "three parts": `N f W`) `W` in note input lengthens the note just entered and the cursor is lost: the commit records the old cursor slot as the selection, the longer note absorbs it, the restore clears the selection | `test/note-entry-cursor-trust.test.ts` "W in note input lengthens…" (failed before: cursor `none`) | fixed | iteration 0+1 |
| F9 | Shortening a note (`Q`, or any shorter value through `changeNoteDuration`) moves the rest of the bar earlier instead of leaving a rest; wrong onsets for unrelated music | app harness: `N 5 g W Q` gives E5 at beat 2 instead of 3 | reproduced | |
| F10 | (fuzzer, seed base 7301) Crash `Cannot read properties of undefined (reading 'octave')`. Replays: single staff `["click:397","/","click:879","b","d","g","click:427","0","N","e"]`; transposing `["click:77","Shift+ArrowLeft","a","g","c","Delete","Shift+ArrowUp"]`; pickup `["click:39","c","Cmd+c","Cmd+v","J"]` | fuzzer replays | reproduced | |
| F11 | (fuzzer, seed 107311, grand staff) `3 N e Q` deletes the voice-2 half notes on beat 3 of bars 1 and 2 of the right hand: lost music in another voice | fuzzer replay `["3","N","e","Q"]` | reproduced | |
| F12 | (fuzzer) An edit in one lane respells the rests of another voice or part (same total, different rest values and onsets). Replays: tuplets `["click:319","Cmd+3","0","0","f","W","click:422","d"]` (voice 1 changes on an edit in voice 2); three parts `["click:311","5","Shift+e","Q","click:199","d"]` (part P2 changes on an edit in P1) | fuzzer replays | reproduced | |

### P1. Speed

| ID | Finding | Reproduction test | Status | Commit |
| --- | --- | --- | --- | --- |
| S1 | Visible edit 455/495 ms at 512 notes, 3,851/4,781 ms at 4,096 (dev server, Sept 2026) | needs T3 | open | |
| S2 | Every edit runs the semantic command over the whole document and re-renders the whole OSMD score | needs T3 | open | |

### P2. Orientation

| ID | Finding | Reproduction test | Status | Commit |
| --- | --- | --- | --- | --- |
| O1 | No keyboard caret | needs T2 | open | |
| O2 | Armed state invisible with the tools panel closed | needs T2 | open | |
| O3 | Cryptic labels (`INS`, `CHD`, `STEP`, `DUR`, `LEAD`); wrong "Multi-voice" hover label; inspector has no note properties | | open | |
| O4 | View-follow during long entry not established; status line shows a raw fraction | needs T2 | open | |

### P3. Keyboard flow

| ID | Finding | Reproduction test | Status | Commit |
| --- | --- | --- | --- | --- |
| K1 | Normal mode: `1`–`9`, `Q`, `W`, `.` do not change a selected note. Confirmed 2026-11-10 in the app harness: `W` on a selected quarter leaves it a quarter. Handbook: 1–9 "change the duration of one or more selected notes in normal mode", "W to double the duration" | | reproduced | |
| K2 | No diatonic step; `Alt+Shift+Up` moves an octave. Handbook: "Alt+Shift+Up - move pitch up a step diatonically" | | open | |
| K3 | `Backspace` in note input does not step back. Handbook pages do not state MuseScore's behaviour; check the source before implementing | | open | |
| K4 | No lyric entry mode. Handbook: `Ctrl+L`; Space next syllable, `-` hyphen, `_` melisma, Down next verse | | open | |
| K5 | No entry at the cursor for dynamics, hairpins, tempo, key, time, clef, text, rehearsal marks, octave lines, repeats, barlines | | open | |
| K6 | Chord symbols: Space/Tab advance not established. Handbook: Space "Next text element"; Tab not stated | | open | |
| K7 | No beam commands, move to voice n, exchange voices, select similar, selection filter | | open | |
| K8 | No keys for insert, append, delete bars. Handbook: `Ins`, `Ctrl+B`, `Ctrl+Del` | | open | |
| K9 | Shortcuts not user-configurable | | open | |
| K10 | Only one of four scripted keyboard passages exists | | open | |

### P4. Mouse flow

| ID | Finding | Reproduction test | Status | Commit |
| --- | --- | --- | --- | --- |
| M1 | No context menu on score elements | | open | |
| M2 | No rectangle selection | | open | |
| M3 | Palettes: click only, no drag, no search, missing items | | open | |
| M4 | Plain click on an existing note in note input replaces it. Handbook: "clicking will add notes to the chord"; "To replace existing notes instead, hold Shift". Under the standing decision this changes to MuseScore's behaviour | | open | |
| M5 | Mouse entry rejects values longer than the bar; keyboard splits and ties | | open | |
| M6 | Spanner end handles not surveyed | | open | |
| M7 | Mouse corpus matrix not built | | open | |

## Reference sources read

- MuseScore Studio handbook, fetched 2026-11-10: entering-notes-and-rests, editing-notes-and-rests,
  appendix/all-keyboard-shortcuts, selecting-elements (`handbook.musescore.org/basics/...`).
- MuseScore source, `github.com/musescore/MuseScore` `main@8b35869b`, fetched 2026-11-10:
  `src/engraving/editing/cmd.cpp` `Score::changeCRlen` (shorter: "make shorter and fill with rest";
  longer: `splitGapToMeasureBoundaries` and `makeGap`, i.e. overwrite and tie across the barline),
  `src/engraving/editing/editduration.cpp` `EditDuration::incDecDuration` (Q/W act on the selection;
  in note input that is the note just entered), `src/notation/internal/notationinteraction.cpp`
  `increaseDecreaseDuration`.
- The handbook does not state where the cursor goes after Undo in note input, nor what Backspace
  does there.

## Behaviour changes

Each can be reverted on request.

| Iteration | Change | Reference |
| --- | --- | --- |

## Decisions

- **Cursor after Undo and Redo in note input.** Undo puts the cursor on the position the undone
  entry was made at; Redo puts it after the redone entry. The note before the cursor in its voice
  becomes the "last entered" note (register of the next letter, target of the selection keys). An
  open input slur and the past-the-end flag are dropped on Undo/Redo. The handbook is silent; this
  follows MuseScore's practice of restoring the input state with the undo step (not verified in
  source).
- **Q/W in note input** keep acting on the note just entered (MuseScore `incDecDuration` acts on the
  selection, which in note input is that note). After a change the cursor moves past the changed
  note.
- **Push to `origin/devel` held.** Local `devel` was two commits ahead of `origin/devel` at the
  start (`c463b71`, `fe64f3d`, by the owner). `c463b71` adds `DEVELOPMENT_TEAM` to the tracked Xcode
  project and `fe64f3d` moves it into an untracked local file on purpose. Pushing `devel` would
  publish that identifier in the public history, so the program's commits stay local until the owner
  decides (blocked on the owner: push as is, or rewrite those two commits first).

## Iteration log

| # | Commit | Measured | Changed | Gates run | Not run |
| --- | --- | --- | --- | --- | --- |
| 0+1 | (this commit) | F1 reproduced in the app harness: after `N 5 a b c` and Undo the selection is empty, `d` does nothing. Fuzzer then found F8 (fixed here, because a fixed `npm test` seed hits it) and F9 to F12 | Ledger; app harness; entry fuzzer; F8: `changeNoteDuration` in note input moves the cursor past the changed note and records no stale selection; history transactions carry `undoSelectionAnchor`/`redoSelectionAnchor`; note-input commits record the cursor before and after the entry; `restoreSelection(anchor, reason)` re-derives the last entered note after Undo/Redo | focused tests; fuzzer fixed seeds; `npm test`; `npm run build`; `git diff --check` | browser, Electron, iPad (see log entry 3) |
