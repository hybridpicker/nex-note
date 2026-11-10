# Note Entry Mastery: Ledger

Program prompt: [note-entry-mastery-prompt.md](./note-entry-mastery-prompt.md). This ledger is the
live work queue and the only record a new session resumes from. Status values: `open`,
`reproduced`, `fixed`, `not reproduced`, `blocked`. No row is `fixed` without an automated test
that failed before the change for the stated reason.

Started 2026-11-10 on `devel@fe64f3d`.

## Handoff (end of session 1, 2026-11-10)

Seven iterations, all on the Trust gate. Fixed: F1, F5, F6, F8 to F13, F18 (a regression of F13's fix, found by the pre-commit hook and bisected). Next session, in this order:

1. P0 rows without a browser: F16 (`0` outside note input pushes the bar), F17 (letter after an
   armed dotted value enters nothing), F14 (stray `<backup>`).
2. F15: triage the 14 `e2e/app.spec.ts` failures that predate this program, one by one.
3. T2, the browser session driver, then the browser-only P0 rows F2, F3, F4, F7.
4. The 2,000-sequence fuzzer gate run with a fresh seed (gate 1), then T3 and P1.

Verification habit that matters here: the pre-commit hook runs only `e2e/notation-tools.spec.ts`
and the post-commit hook runs `electron:build`; `e2e/app.spec.ts` and the mouse suites must be run
by hand for any change to entry behaviour. Chain ledger edits with `&&` so a failed edit stops the
commit (iteration 4 lost its ledger row this way).

## Gates

| Gate | State | Evidence |
| --- | --- | --- |
| 1 Trust | Not met | P0 rows open (F2 to F7, F13, F14); the fuzzer still fails on fresh seeds with F13 |
| 2 Preview equals commit | Not met | Mouse corpus not built (M7); F2 to F4, F7 open |
| 3 Speed, production build | Not met | Production latency run not done (T3) |
| 4 Orientation | Not met | O1 to O4 open; session driver not built (T2) |
| 5 Keyboard flow | Not met | Reference tasks R2 to R6 not built (T4) |
| 6 Mouse flow | Not met | R7, R8 not built; M1 to M6 open |
| 7 Every row closed | Not met | See queue |
| 8 Surfaces and exchange | Not met | On `6ea4454`: `npm test` 1,689 passed, `npm run build`, `git diff --check`, `npm run ipad:sync` and `npm run ipad:doctor` passed; every commit of session 1 passed the pre-commit `e2e/notation-tools.spec.ts` (51) and the post-commit `electron:build` + `electron:verify`. Not run: `notation-quality-cycle --browser`, reference-fixture MusicXML/MXL round trips (no reference tasks yet), physical iPad, Linux Electron; the Xcode macOS target does not exist |
| 9 Independent review | Not started | |

## Tools (Iteration 0)

| ID | Tool | State |
| --- | --- | --- |
| T1 | Entry fuzzer: `test/entry-fuzz.test.ts`, `test/support/entry-fuzz.ts`. Six synthetic fixtures (single staff, grand staff with two voices, transposing part, tuplets and graces, pickup bar, three parts), 48 weighted key and click actions through the real editor and history hooks. After every action: no new validator error (covers bar sums per voice and meter), no lane outside the addressed part/staff/voice changed, note input keeps a cursor. After every sequence: Undo to the start equals the start XML, Redo to the end equals the end XML. Failures shrink to a minimal replay. `npm test` runs 12 fixed sequences; the gate run is `NEX_FUZZ_SEQUENCES=2000 NEX_FUZZ_SEED=<fresh> npx tsx --test test/entry-fuzz.test.ts` | Built. Voice-level isolation uses the selection's lanes plus the stored entry voice; a bar appended or inserted by the action may add whole-bar rests to every lane |
| T1 (iteration 3) | New invariant after every action: the stored XML holds the music the model holds (a re-export gives the same lanes, including tuplet membership). A byte comparison is too strict because of F14 | Built |
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
| F1 | Undo during note input loses the cursor; letters, arrows and new values do nothing afterwards | `test/note-entry-cursor-trust.test.ts` (4 tests failed before: cursor `none`), fuzzer seed 20361111 | fixed | `cfe1f27` |
| F2 | Mouse preview and commit disagree (ghost A4, commit D5); busy bar pushes the canvas ~12 px | needs T2 | open | |
| F3 | Page stops answering after a mouse commit; 404 for `/soundfonts/FluidR3_GM/flute-mp3.js` | needs T2 | open | |
| F4 | Two clicks on a valid ghost commit nothing. Reproduced intermittently 2026-11-10 by `e2e/app.spec.ts:2084` ("mouse note input shows a ghost preview and places a snapped note"): the click on the visible ghost left 4 notes instead of 5, in 1 of 3 runs on `a2cfbcc` plus the F6 change; it passed in the one run on `fe64f3d` | `e2e/app.spec.ts:2084` (intermittent) | reproduced | |
| F5 | `R` in normal mode on a full 4/4 bar inserts a rest and drops the bar's last note. Reproduced in the app harness 2026-11-10 (C D E F, `R` on C gave C r D E) | `test/note-entry-repeat-selection.test.ts` (3 of 4 failed before; the end-of-score guard passed). `R` outside note input now repeats the selection after itself in overwrite mode and selects the copy; handbook: `R` "Repeat selection" | fixed | `a2cfbcc` |
| F6 | Default entry mode is `insert`; paste pushes notes over the barline. Reproduced 2026-11-10: copy C D E, paste at bar 2 of G F E D gave C D E G and pushed F E D into bar 3 | `test/note-entry-default-mode.test.ts` (default-mode case failed before). Paste now always overwrites. The default mode itself was not changed, see Decisions | fixed | iteration 5 |
| F7 | Zoom-dependent mouse evidence predates the zoom fix | needs T2 | open | |
| F8 | (fuzzer, seed 20761115, "three parts": `N f W`) `W` in note input lengthens the note just entered and the cursor is lost: the commit records the old cursor slot as the selection, the longer note absorbs it, the restore clears the selection | `test/note-entry-cursor-trust.test.ts` "W in note input lengthens…" (failed before: cursor `none`) | fixed | `cfe1f27` |
| F9 | Shortening a note (`Q`, or any shorter value through `changeNoteDuration`) moves the rest of the bar earlier instead of leaving a rest; wrong onsets for unrelated music | `test/note-entry-cursor-trust.test.ts` "W in note input over following notes…" (failed before: E5 at beat 2 instead of 3) | fixed | `2006cfa` |
| F10 | (fuzzer, seed base 7301) Crash `Cannot read properties of undefined (reading 'octave')`. Replays: single staff `["click:397","/","click:879","b","d","g","click:427","0","N","e"]`; transposing `["click:77","Shift+ArrowLeft","a","g","c","Delete","Shift+ArrowUp"]`; pickup `["click:39","c","Cmd+c","Cmd+v","J"]` | `test/note-entry-document-trust.test.ts`: the three replays and a core test (all threw before). Two causes: `changeNotePitch` on a rest read the rest's missing pitch, and the editor's selection kept a copy that still said "note" after `0` or Delete replaced it with a rest. The core now rejects a pitch change on a rest (`pitch_command_rejected`), and the editor refreshes its selection, last entry and range anchor from the document by entity id whenever the document changes | fixed | iteration 3 |
| F11 | (fuzzer, seed 107311, grand staff) `3 N e Q` deletes the voice-2 half notes on beat 3 of bars 1 and 2 of the right hand: lost music in another voice | `test/note-entry-document-trust.test.ts` replay and "F11: a finer value…" (failed before: voice 2 lost both beat-3 halves, bar 1 lost C5 and D5). Cause: a finer value rescaled the division grid of one staff only; MusicXML has one `<divisions>` per part, so the export wrote the other staff's grid. `setStaffDivisionsAtMeasure` now rescales every staff of the part; the two tuplet paths that scaled each staff by a relative factor now pass one absolute grid | fixed | iteration 3 |
| F12 | (fuzzer) An edit in one lane respells the rests of another voice or part (same total, different rest values and onsets). Replays: tuplets `["click:319","Cmd+3","0","0","f","W","click:422","d"]` (voice 1 changes on an edit in voice 2); three parts `["click:311","5","Shift+e","Q","click:199","d"]` (part P2 changes on an edit in P1) | `test/note-entry-document-trust.test.ts`: replays `pickup bar` 409108 `["N","3","ArrowRight","e","6","0"]` and `three parts` 509106 `["click:36","Cmd+3","Delete"]`, and "F12: the stored XML is what the document model exports…" (all failed before). Cause: the hybrid executor exported XML from the raw execution result, while the document state kept the normalized model, which splits rests at beats; the next edit anywhere re-exported them. The XML is now exported from the normalized model. With the fix, 120 fresh sequences (seed 9100) leave one fixture failing the new fixed-point invariant (F13); without it, five of six fail | fixed | iteration 3 |
| F13 | (fuzzer, new fixed-point invariant) A grace note was left before a rest when an edit replaced its main note: in replay 309111 `["click:73","0",".","e","6","Cmd+3"]` the half-note triplet built by `Cmd+3` overwrote the D5 that carried the grace. The importer reads a rest after a grace as `<forward>`, so the next round trip dropped a tuplet member. First diagnosed as missing tuplet stop markers; the diff showed the grace | `test/note-entry-grace-orphan.test.ts` (replay 309111 failed before; replay 307321 and a direct note-input case passed before and stay as guards). `executeCoreCommands` now removes a grace whose main event this edit turned into a rest or removed (MuseScore keeps graces on their chord); graces that already stood before a rest are left alone | fixed | iteration 6 |
| F14 | (low) After voice-2 entry the exporter writes a trailing `<backup>` with nothing after it; a re-export drops it. Not musical, but the file changes on the next unrelated edit. Replay: `single staff` 9105 `["click:918","Cmd+Alt+2","f"]` | byte comparison of stored and re-exported XML | reproduced | |
| F16 | `0` outside note input inserts a rest before the selected note and pushes the bar later, cutting the last note: in the tuplet fixture a tied half A5 became a tied quarter. Same class as F5. Check MuseScore's normal-mode `0` (the handbook's Del replaces with a rest) before changing it | replay above, steps `click:73` `0` | reproduced | |
| F17 | After `click:73 0 .` (a dotted value armed on a rest before a note with a grace), `e` switches note input on but enters nothing and the cursor stays; check whether a rejection message is shown | replay 309111 steps 1 to 4 | reproduced | |
| F18 | `e2e/notation-tools.spec.ts:1990` "eight-bar keyboard replacement preserves correction and MusicXML reopen" failed intermittently after reopening the exported `.mxl`: `page.evaluate: Execution context was destroyed, most likely because of a navigation`; the server log shows the main page loading again where passing runs call `apply-operations`. Introduced by `6ea4454` (F13): 8 of 12 passed there, 24 of 24 on `fe64f3d`, `2006cfa`, `db9011f`, `a2cfbcc` and `b1de120` | Bisection with `--repeat-each`. The grace prune read `graceNotes` without the `?? []` the rest of the code uses for documents that lack the field; with the guard 18 of 18 passed. The exact path that reached the prune without `graceNotes` is not proven | fixed | iteration 7 |
| F15 | 14 tests of `e2e/app.spec.ts` already fail on `fe64f3d` (before this program), Chromium on macOS, 2026-11-10: lines 1321, 1819, 1907, 1935, 1981, 2963, 3291, 3606, 3674, 3720, 3769, 3858, 3917, 3947 (polyphonic clicks, shortcut matrix incl. `Shift+ArrowUp` on a voice-2 entry, double accidentals, advance after entry, replace/insert-between/chord flows, Alt-click voice, replace drag, duration-first arrows, lower-staff rests, Doctor multi-voice, chord input, articulation shortcuts, inspector/palette, tuplet tools). The program's earlier completion report ran only `e2e/notation-tools.spec.ts`, which the pre-commit hook also runs. Each one is a real defect or a stale test; triage one by one | full `app.spec.ts` run on `fe64f3d` with the sources of that commit: 40 passed, 14 failed | reproduced | |

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
| 5 | Paste always overwrites the music after the paste position; in the default mode it used to push it later. An insert-paste is no longer reachable from the UI (the core still supports `mode: 'insert'`) | MuseScore, Dorico and Finale paste overwrites |
| 4 | `R` outside note input repeats the selection (was: insert a rest after it) | Handbook shortcut table, "Repeat selection" |
| 2 | A shorter value no longer moves the following notes of the bar earlier; the freed time becomes rests after the note | MuseScore `Score::changeCRlen` |

## Assertion changes

| Iteration | Test | Change | Reason |
| --- | --- | --- | --- |
| 3 | `test/entry-split-values.test.ts` "piano left hand (stored voice 5)…" | Expected `m1@1.75 r eighth` became `m1@1.75 r 16th`, `m1@2 r 16th` | The model always held the rest split at beat 3; the old expectation read the stale XML that F12 left behind. Same strictness, the spelling MuseScore uses for a rest across a beat |

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
- **The default entry mode keeps its value (F6).** Changing the default from `insert` to `overwrite`
  was tried in iteration 5: `npm test` passed after small fixes, but 17 of 98 entry-related browser
  tests failed, all in `e2e/app.spec.ts` (shortcut matrix, voices, mouse chord and replace flows,
  lower-staff rests, tuplet tools). The resolvers explain it: the mode named `insert` is the one tuned
  to MuseScore's everyday behaviour (a letter in the cursor's voice replaces,
  `src/score-input/keyboard-resolver.ts` `resolveKeyboardPlacementMode`; a plain click on a note adds a
  chord tone, `src/score-input/pointer-entry-mode.ts`; other voices use the cross-voice path), while
  `overwrite` is a stricter replace-everywhere variant. The user-visible defect was paste, which
  inherited the mode; paste now always overwrites. The label `INS` for MuseScore's default behaviour
  is misleading; renaming the modes (not their behaviour) belongs to O3.
- **Push to `origin/devel` held.** Local `devel` was two commits ahead of `origin/devel` at the
  start (`c463b71`, `fe64f3d`, by the owner). `c463b71` adds `DEVELOPMENT_TEAM` to the tracked Xcode
  project and `fe64f3d` moves it into an untracked local file on purpose. Pushing `devel` would
  publish that identifier in the public history, so the program's commits stay local until the owner
  decides (blocked on the owner: push as is, or rewrite those two commits first).

## Iteration log

| # | Commit | Measured | Changed | Gates run | Not run |
| --- | --- | --- | --- | --- | --- |
| 0+1 | `cfe1f27` | F1 reproduced in the app harness: after `N 5 a b c` and Undo the selection is empty, `d` does nothing. Fuzzer then found F8 (fixed here, because a fixed `npm test` seed hits it) and F9 to F12 | Ledger; app harness; entry fuzzer; F8: `changeNoteDuration` in note input moves the cursor past the changed note and records no stale selection; history transactions carry `undoSelectionAnchor`/`redoSelectionAnchor`; note-input commits record the cursor before and after the entry; `restoreSelection(anchor, reason)` re-derives the last entered note after Undo/Redo | focused tests; fuzzer fixed seeds; `npm test` (1,668 passed); `npm run build`; `git diff --check`; pre-commit hook: `e2e/notation-tools.spec.ts` 51 passed in Chromium; post-commit hook: `electron:build` and `electron:verify` passed | `ipad:sync`/`ipad:doctor` (run at the end of the batch) |
| 2 | `2006cfa` | `N 5 g W Q` on a bar of quarters: E5 and F5 moved to beats 2 and 3 | `applyDurationChangeToVoice` no longer calls `shiftEventsAfter` when a value gets shorter; the gap is filled with rests | focused tests; `npm test` (1,669 passed); pre-commit hook `e2e/notation-tools.spec.ts` 51 passed; post-commit `electron:build` + `electron:verify` passed | iPad (run at the end of the batch) |
| 3 | `db9011f` | Fuzzer replays for F10 (3 crashes), F11 (voice 2 lost) and F12 (stored XML differs from the model) | Core rejects a pitch change on a rest; editor refreshes its selection from the document; division grids change per part; XML exported from the normalized model; new fixed-point invariant in the fuzzer | focused tests (11, 7 failed before); `npm test` 1,680 passed; `npm run build`; `git diff --check`; fuzzer 120 fresh sequences with and without the export fix; pre-commit Chromium 51 passed; post-commit Electron build verified | iPad (end of batch) |
| 4 | `a2cfbcc` | F5 reproduced in the app harness | `repeatSelection` (copy without the clipboard, paste in overwrite mode after the last selected event); `pastePayloadAt` shared with paste | focused 4 tests (3 failed before); `npm test` 1,684 passed; pre-commit Chromium 51 passed; post-commit Electron build verified. This ledger row and the F5 status were written in iteration 5: the ledger edit of iteration 4 failed on a stale match and the commit went ahead without it | iPad (end of batch) |
| 5 | `b1de120` | F6 reproduced in the app harness. A default-mode flip broke 17 browser tests and was reverted (see Decisions) | Paste passes `mode: 'overwrite'` | focused 2 tests (1 failed before); `npm test` 1,686 passed; full `e2e/app.spec.ts` on this change: 38 passed, 16 failed; pre-commit Chromium 51 passed, post-commit Electron verified; the same file on `fe64f3d` sources: 40 passed, 14 failed (F15). The two extra failures re-run twice each: file lifecycle passed both times (flaky download wait), `:2084` failed once (F4) | iPad (end of batch) |
| 6 | `6ea4454` | F13 replay 309111 failed the fixed-point invariant | `pruneGracesWithoutMainNote` at the end of `executeCoreCommands`; found F16 and F17 while diagnosing | focused 3 tests (1 failed before); `npm test` 1,689 passed; first version of the prune broke 6 grace tests (it missed graces stored after their main event before normalization) and was corrected before commit; pre-commit Chromium 51 passed, post-commit Electron verified; `ipad:sync` and `ipad:doctor` passed on this commit | — |
| 7 | (this commit) | F18 bisected to `6ea4454` | `graceNotes ?? []` in the grace prune; in the same commit: handoff section, docs index, the program prompts (`note-entry-mastery-prompt.md`, `arrangement-note-entry-iteration-prompt.md`) committed; push to `origin/devel` on the owner's instruction | `--repeat-each` runs above; `npm test` 1,689 passed | — |
