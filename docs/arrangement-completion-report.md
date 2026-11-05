# Arrangement and note entry program: completion report

Status on 2026-11-05: **the exit criteria are still not met.** The program ran 31 iterations on `devel`
and was stopped at the owner's request on 2026-11-04. On 2026-11-05 a follow-up fixed the open items listed
in section 7 (iterations 32 to 38). It fixed many data-loss and wrong-target defects in note entry, but the
feature matrix is still mostly `PARTIAL`. Per-iteration evidence is in
[arrangement-iteration-ledger.md](arrangement-iteration-ledger.md), and the open work is its backlog.

## Exit criteria

| # | Criterion | State |
| --- | --- | --- |
| 1 | Every matrix row `PASS` or `BLOCKED` | **Not met:** 1 `PASS`, 43 `PARTIAL`, 3 `MISSING` |
| 2 | Four keyboard passages on US, QWERTZ and UK | **Not met:** passage 1 exists and passes on all three layouts and in Chromium; passages 2 to 4 do not exist |
| 3 | Mouse corpus matrix in Chromium and Electron | **Not met:** corpus not built |
| 4 | Gates on the final code commit | **Met** for `fa87a81` (the last code commit; `2e46ebe` and the report commit are documentation), see below |
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

**Keyboard passages: one of four exists.** Passage 1 (eight bars, treble, mixed values, dots, a rest, two
accidentals, a tie over a barline, a triplet, a chord, a grace note, a dynamic, a slur and an accent) runs
on the real `key` and `code` values of US, UK and QWERTZ with zero corrections and equals its fixture
exactly (`test/keyboard-passage-1.test.ts`, `test/support/keyboard-passage.ts`), and once in Chromium under
strict Doctor (US only; Playwright cannot switch the physical layout). Passages 2 to 4 are not built.

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
| `test/entry-second-part-audit.test.ts` | 40 keyboard actions and 14 commands in a second part, plus copy, cut, paste, range delete, pointer entry and selection, palette and Command Center calls and repeat-last-input, on three layouts (second of two parts, lower staff of a grand staff, middle of three parts), leave every other staff unchanged and keep the cursor |
| `test/direction-part-scope.test.ts` | A text direction is removed from the clicked part only |
| `test/entry-slur-in-input.test.ts` | `S` during note input and the cursor after a range slur |
| `test/entry-tie-beyond-score.test.ts` | `T` at the end of the score |
| `test/entry-dynamics-keyboard.test.ts` | `Alt/Option+.` and `Alt/Option+,` |
| `test/import-slur-across-barline.test.ts` | A slur across a barline imports as one slur |

These tests found real defects, most of them late in the run, so more of this class may remain,
especially in paths the audit did not cover.

## 3. Surfaces

Run on `fa87a81` (2026-11-05; `npm test` 1,646 passed; build passed):

| Gate | Result |
| --- | --- |
| `node scripts/notation-quality-cycle.mjs --browser` | Automated groups (playback, formatting, browser) passed; manual gates not run |
| `npm run test:e2e:doctor` | 5 passed |
| `npm run electron:refresh` | Passed; packaged app verified as current |
| `tsc --noEmit` | Application code clean; 41 known errors remain in `e2e/` and `test/` (backlog 23) |
| `git diff --check` | Clean |
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
- GitHub reports 86 open Dependabot alerts. They are triaged in
  [dependency-security-triage.md](dependency-security-triage.md); nothing was upgraded. `next` 16.2.11 has
  five critical alerts and needs the owner's decision.

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
| `63c41a8` | Keep text directions in the part they were clicked in |
| `d7bb40c` | Keep range edits and slur placement in the part they were aimed at |
| `ed7983f` | Keep a slur open during note input and keep the cursor after a range slur |
| `25cb54a` | Append a bar when T ties past the end of the score |
| `38234c3` | Add Alt/Option+. and Alt/Option+, to step a dynamic from the keyboard |
| `fa87a81` | Add keyboard passage 1 on three layouts and keep slurs across barlines |
| `2e46ebe` | Add the dependency security triage |

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

- **`Cmd/Ctrl+D` stays Duplicate.** MuseScore uses it for add-dynamic. Dynamics now use
  `Alt/Option+.` (louder) and `Alt/Option+,` (softer); a note without a dynamic starts from `mf`.
- **Off-beat values stay split into tied notes,** following nex-note's existing rhythm speller. I did
  not compare this spelling with MuseScore.
- **Two adjacent rests before a note may merge** (two quarters become a half rest). The onset is
  unaffected.
- **A rest over silence in another voice changes nothing in the document** and only moves the cursor.
  If no event starts at that onset, the cursor keeps its lane at a position without an event.
- **Commands without a part keep their old first-part meaning,** so existing callers such as AI
  operations do not change. A missing part in a new caller would therefore still hit the first part.
- **Mouse entry still rejects values longer than the bar,** because its preview shows one note.
- **`T` at the end of the score appends a bar**, as MuseScore's `cmdAddTie` does.
- **A slur opened with `S` in note input extends with each entered note,** also after a `Shift+Arrow`
  range slur, because MuseScore's code does (the source states no intent). It has no visual marker yet.

## 7. Follow-up on 2026-11-05

Fixed (ledger iterations 32 to 38):

1. Backlog 34: text directions stay in their part.
2. Multi-part audit extended to copy, cut, paste, range delete, pointer entry and selection, the Edit
   Palette, the Command Center, the Inspector and repeat-last-input, on a grand staff's lower staff and a
   three-part score. Leaks fixed: range operations (delete, ripple delete, transpose, clear articulations)
   and the Inspector's slur edited the first part as well.
3. `S` during note input and the lost cursor after a range slur.
4. `T` at the end of the score.
5. Dynamics from the keyboard (backlog 31).
6. Keyboard passage 1 (backlog 14), which also exposed and fixed an import defect: slurs across a barline
   were split into two half slurs on reopening a file.
7. Dependabot triage (document only).

Found and not fixed:

- A slur left open in note input has no visual marker.
- Passages 2 to 4, the mouse corpus, the `MISSING` rows (S5, P10, W2) and the latency budgets were not
  started, as instructed.
- Not checked: the physical iPad, MIDI hardware and audible playback. The Xcode macOS target does not exist.
  Linux Electron was not run.

## Next steps

In priority order:

1. The owner's decision on the `next` upgrade (critical alerts), then `@xmldom/xmldom` and Electron.
2. Keyboard passages 2 to 4 (backlog 14).
3. The mouse corpus (backlog 15).
4. The `MISSING` rows: S5, P10 and W2.
5. Latency budgets (backlog 22).
