# Arrangement and note entry program: completion report

Status on 2026-11-04: **stopped at the owner's request. The exit criteria are not met.** The program
ran 31 iterations on `devel`. It fixed many data-loss and wrong-target defects in note entry, but the
feature matrix is still mostly `PARTIAL`. Per-iteration evidence is in
[arrangement-iteration-ledger.md](arrangement-iteration-ledger.md), and the open work is its backlog.

## Exit criteria

| # | Criterion | State |
| --- | --- | --- |
| 1 | Every matrix row `PASS` or `BLOCKED` | **Not met:** 1 `PASS`, 43 `PARTIAL`, 3 `MISSING` |
| 2 | Four keyboard passages on US, QWERTZ and UK | **Not met:** no passage fixture exists yet |
| 3 | Mouse corpus matrix in Chromium and Electron | **Not met:** corpus not built |
| 4 | Gates on the final code commit | **Met** for `7f82975`, see below |
| 5 | Every fixture round-trips through MusicXML, MXL and MuseScore | **Not met:** checked for individual features only |
| 6 | Latency budgets for small, medium and large scores | **Not met:** not measured against the budgets |
| 7 | Docs current and `HEAD` equal to `origin/devel` | Docs reflect the entry behaviour changed here. The parity matrix was not fully re-audited |

## 1. Matrix summary

| Status | Rows |
| --- | --- |
| PASS | 1 (X2, held keys) |
| PARTIAL | 43 |
| MISSING | 3 |
| BLOCKED | 0 |

The `MISSING` rows are S5 (score order and bracket/brace groups), P10 (beaming control) and W2
(explode and implode). No row is blocked on you; everything open is remaining implementation work.

## 2. Precision evidence

**Keyboard passages: none of the four exist.** Passage 1 also has a product gap: dynamics have no
keyboard path that a script can use (backlog 31). Layout resolution for US, UK and QWERTZ is covered by
unit tests in `test/keyboard-layout.test.ts`, but not through a full passage.

**Mouse corpus: not built** (backlog 15). Pointer entry is covered only by the existing browser suite.

**Latency: no budget table.** Backlog 22 is open.

**What is covered: keyboard entry in many settings, through the real editor hook.**

| Test file | Coverage |
| --- | --- |
| `test/entry-matrix.test.ts` | Eighths, sixteenths, dots and triplets across voices, grand staff and parts |
| `test/entry-split-values.test.ts` | Values that cross a beat, in voice 2, left hand, a transposing part, 3/4, 6/8 and `M` mode |
| `test/entry-rest-in-trailing-bar.test.ts` | Rests that start a bar, in every lane |
| `test/entry-cross-voice-cursor.test.ts`, `test/entry-m-register.test.ts` | Voice changes and register |
| `test/entry-cursor-target.test.ts` | MIDI and `M` commits after a typed letter |
| `test/entry-beyond-score.test.ts` | Entry past the end of the score |
| `test/entry-second-part-audit.test.ts` | 38 keyboard actions and 11 commands in a second part leave the first part unchanged |

These tests found real defects, most of them late in the run, so more of this class may remain,
especially in paths the audit did not cover.

## 3. Surfaces

Run on `7f82975`:

| Gate | Result |
| --- | --- |
| `node scripts/notation-quality-cycle.mjs --browser` | Automated groups passed; browser 97 passed, 0 failed |
| `npm run test:e2e:doctor` | 5 passed |
| `npm run electron:refresh` | 1,458 tests passed; build and packaged app verified |
| `npm run ipad:sync`, `npm run ipad:doctor` | Passed |

Not run:

- **Physical iPad:** not used in this program.
- **MIDI hardware:** MIDI behaviour is tested through the `insertMidiChord` entry point, not with a
  device.
- **Audible playback:** transposing pitch was checked in generated MIDI data, not by listening.
- **Xcode macOS target:** it does not exist.
- **Linux Electron:** not run in this program.

Known limitations:

- `tsc --noEmit` is clean for application code. Pre-existing type errors remain in `e2e/` and `test/`
  (backlog 23).
- The local MuseScore 4.7.3 CLI aborts nondeterministically in some conversions (`SIGABRT: mutex lock
  failed`), so its evidence is partial.
- GitHub reported 86 Dependabot vulnerabilities on the default branch during a push. They were not
  triaged here.

## 4. Commits

Commits since `838063d`, oldest first; each iteration is recorded in the ledger.

| SHA | Change |
| --- | --- |
| `02b4be7` | Add arrangement feature matrix and iteration ledger; fix platform tooltip assertions |
| `1405c73` | Resolve shortcuts by keyboard layout and ignore held entry keys |
| `7b7d333` | Keep lower-staff directions, their positions and pedal types through edits |
| `e90d784` | Write octave lines with the MusicXML direction and add 15ma/15mb |
| `b929eec` | Enter staff-relative voices on MuseScore/Finale-numbered staves |
| `08c14c4` | Clear the augmentation dot when a new note value is chosen |
| `5191351` | Create tuplets at the cursor from the active duration during note input |
| `f8edee1` | Split keyboard values longer than the bar at the barline and tie them |
| `6adaf6e` | Keep dynamics, chord symbols, slash fills and staff text in their instrument |
| `e574252` | Keep both dots of double-dotted notes and rests |
| `7e0f8ce` | Export N.C. and 6/9 chord symbols as valid MusicXML harmonies |
| `9f24cc3` | Mark cue notes with `<cue/>` instead of deleting their note value |
| `f0815e5` | Play transposing instruments at sounding pitch |
| `6f201d0` | Import guitar data only for notes with a real string and fret |
| `4a4946e` | Keep guitar bend amounts and write taps as `<tap/>` |
| `de7602c` | Start entry in another voice at the input cursor |
| `6b26a9d` | Continue entry into a bar where the active voice does not exist yet |
| `278cd81` | Add Shift chord tones to the note just entered, as MuseScore does |
| `6723b9b` | Keep lyric extenders and elisions through import, export and edits |
| `02860eb` | Insert plain measures and keep layout breaks on their bars |
| `e6a1322` | Stop the strict Doctor from rejecting whole-bar notes and rests |
| `d32b138` | Resolve the first note of a passage from the clef's middle line |
| `f937cb7` | Write grace notes before their main note at the same onset |
| `1cb6398` | Act on the note just entered for selection keys during note input |
| `e49fd4c` | Start Shift+Arrow ranges at the note just entered |
| `8ea09ad` | Keep the full length of values the rhythm speller splits |
| `439f84a` | Send MIDI keys and M commits after a typed letter to the cursor |
| `5ad52d4` | Resolve typed letters in the entry voice and enter inside its rests |
| `73566f9` | Give inserted measures a whole-bar rest in every staff |
| `3bf273a` | Keep typed rests in trailing bars and in their own part |
| `36fe7ab` | Keep note commands in the part they were aimed at |
| `7f82975` | Append a bar for entry past the end of the score |

## 5. Physical checks for you

**iPad.** Run `npm run ipad:sync`, then `npm run ipad:open`, and launch on the paired iPad from Xcode
(see [ipad-private-testing.md](ipad-private-testing.md)). With a hardware keyboard, in a new two-part
score:

1. In the second part, press `N`, `4`, `C`, `5`, `D`, `E`. Expect an eighth C, a quarter D drawn as two
   tied eighths, and E after it.
2. Select a note in the second part and press `Delete`. Expect the first part to stay unchanged.
3. Finish a bar, press `0`, then a letter. Expect a quarter rest and the note on beat 2 of the next bar.
4. Type past the last bar of the score. Expect a new bar, and one Undo to remove both the note and the bar.

**MIDI keyboard.** In note input, type C, then play D on the keyboard. Expect C to stay and D to follow
it. Play a chord next and expect it at the following position.

**Audio.** Play a B-flat clarinet part with a written D5. Expect to hear concert C5.

## 6. Decisions made without you

Each can be revisited:

- **`Cmd/Ctrl+D` stays Duplicate.** MuseScore uses it for add-dynamic. Dynamics therefore have no
  shortcut yet, which is what blocks passage 1.
- **Off-beat values stay split into tied notes,** following nex-note's existing rhythm speller. I did
  not compare this spelling with MuseScore.
- **Two adjacent rests before a note may merge** (two quarters become a half rest). The onset is
  unaffected.
- **A rest over silence in another voice changes nothing in the document** and only moves the cursor.
  If no event starts at that onset, the cursor keeps its lane at a position without an event.
- **Commands without a part keep their old first-part meaning,** so existing callers such as AI
  operations do not change. A missing part in a new caller would therefore still hit the first part.
- **Removing a text direction still removes the same text from every part** (backlog 34), because a
  selected text does not yet know its part.
- **Mouse entry still rejects values longer than the bar,** because its preview shows one note.
- **`T` at the very end of the score was not tested.**

## Next steps

In priority order:

1. Backlog 34: removing a text direction in one part only.
2. A dynamics shortcut, then keyboard passage 1 on all three layouts (backlog 31, 14).
3. The mouse corpus (backlog 15).
4. The `MISSING` rows: S5, P10 and W2.
5. Latency budgets (backlog 22).
