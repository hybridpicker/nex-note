# Arrangement Iteration Ledger

Started: 2026-11-04. This ledger is the report for the
[arrangement and note-entry program](arrangement-note-entry-iteration-prompt.md). Every
iteration appends one record. The [feature matrix](arrangement-feature-matrix.md) holds the
current status of each capability, and the
[note input parity matrix](note-input-parity-matrix.md) holds entry precision.

## Record template

Taken from [notation-quality-program.md](notation-quality-program.md), with the extra fields
this program needs:

- Iteration / date / starting SHA / dirty-tree state:
- Track (A keyboard, B mouse, C completeness) and matrix row:
- Problem and observable baseline (failing test output, counts, timings):
- Hypothesis and bounded change; files touched:
- Regression evidence before and after (commands and results):
- Cross-app tests and builds actually run; surfaces not run and why:
- Documentation updated:
- Commit SHA / push result / verified remote devel SHA:
- Decision: accepted, needs revision, or blocked on named evidence:
- Next item selected:

The Xcode macOS target does not exist yet. Every record states that explicitly instead of
leaving the surface out. Physical iPad, Apple Pencil, hardware MIDI and acoustic latency gates
stay `not-run` unless they were actually run; the steps for the owner are in
[notation-quality-participation.md](notation-quality-participation.md).

## Ordered backlog

Selection follows the program order: (1) data loss, corruption, wrong pitch, wrong onset,
wrong voice or broken Undo; (2) keyboard and mouse precision defects; (3) the highest
`MISSING` row with its dependencies at `PASS`; (4) the highest `PARTIAL` row; (5) latency and
presentation. Items marked *suspected* come from the iteration-0 code survey. Each one is
reproduced with a failing test before any change; if it does not reproduce, it is recorded
as not reproduced and dropped.

| Order | Priority class | Item | Matrix row | Track |
| --- | --- | --- | --- | --- |
| 1 | 1 wrong mutation | QWERTZ Cmd/Ctrl+Y runs Undo instead of Redo (web, iPad) | X1 | A |
| 2 | 2 precision | Layout-aware resolver for accidentals, articulations, digits, grace and the QWERTY piano on US, UK, QWERTZ; held-key repeat guard; Alt/Option+1–6 TAB string on macOS | X1, X2 | A |
| 2a | 1 data loss (**reproduced** in iteration 1) | Any core edit of a grand-staff score deletes every lower-staff dynamic and pedal: core export writes beat-0 directions only from the first staff's measure; mid-measure directions import without a position | E1, E6, E7 | C |
| 3 | 1 corruption (**fixed in iteration 2**) | Pedal stop becomes a start on MusicXML reimport | E6 | C |
| 4 | 1 wrong pitch (**fixed in iteration 3**) | 8va exported as `octave-shift type="up"` | P7 | C |
| 4b | 1/2 owner request 2026-11-04 (**in progress, iterations 4–7**) | Entry correctness matrix: eighths, sixteenths, dotted values and triplets entered by keyboard and mouse in voices 1–4, multi-voice staves, grand staff, several parts and different (including transposing) instruments; exact expected fixtures, one Undo entry per action | P1, P2, P5, parity matrix | A/B |
| 5 | 1 data loss (**fixed in iteration 9**) | Double dots collapse to one dot on import | P1 | C |
| 6 | 1 wrong target (**fixed in iteration 8**) | `addDynamic`, `setHarmonyAt`, `fillSlashMeasure`, `addWords` write to every part with the same staff index | E1, L1, L2, E7 | C |
| 7 | 1 invalid output (**fixed in iteration 10**) | N.C. exported as `<root-step>N</root-step>` without `<kind>` | L1 | C |
| 8 | 1 wrong onset (**fixed in iteration 2**) | Mid-bar chord symbols move to beat 1 on reimport | L1 | C |
| 9 | 1 corruption (**fixed in iteration 11**) | `setCueNote` clears `durationType` | L4 | C |
| 10 | 1 wrong data (**fixed in iteration 14**) | `addGuitarBend` ignores `bendSemitones`; `addGuitarTap` stores a hammer-on | L5 | C |
| 11 | 1 data loss (**lyrics fixed in iteration 18**; `<multiple-rest>` did not reproduce) | `<multiple-rest>`, lyric `<extend>` and `<elision>` dropped on round trip | T7, L3 | C |
| 12 | 1 wrong pitch (**fixed in iteration 12**) | Transposing parts play back at written pitch | S2 | C |
| 13 | 1 wrong target (**fixed in iteration 19**) | Inserted measures clone barlines, endings and breaks | T6 | C |
| 14 | 2 precision (**passage 1 done in iteration 37**; passages 2 to 4 not built) | Scripted keyboard passage 1 (eight bars, treble) as a fixture with an exact keystroke script on three layouts | parity matrix | A |
| 15 | 2 precision | Mouse corpus: C-clef, clef change, pickup, dense multi-voice, grand staff with three ledger lines | parity matrix | B |
| 16 | 3 missing | Beaming control (break/join) | P10 | C |
| 17 | 3 missing | Score order and bracket/brace groups | S5 | C |
| 18 | 3 missing | Cue notes (model, render, export) | L4 | C |
| 19 | 3 missing | Explode/implode (after add-part in S1) | W2 | C |
| 20 | 4 partial | Key change at any measure, per part (T1); full key list | T1 | C |
| 21 | 4 partial | Remaining PARTIAL rows in matrix order | all | C |
| 22 | 5 latency | Medium/large score edit and preview budgets (`scripts/benchmark-note-entry.ts`) | parity matrix | A/B |
| 23 | 4 hygiene | `tsc --noEmit` reports pre-existing type errors in `e2e/` and `test/` (for example `e2e/dunhill-old-abbey-stress.spec.ts`, `test/electron-launch-helpers.test.ts`) | n/a | — |
| 24 | **fixed in iteration 20** (Doctor false positive) | In strict-Doctor mode an edit in bar 1 is blocked by a new "projection fragment crosses strong beat" error on a following bar whose rests are `<rest measure="yes"/>` with `<type>whole</type>`, or two half rests. Decide whether this is a Doctor false positive or a re-spelling defect; normal mode does not block | T7, P9 | C |
| 25 | 2 precision (**fixed in iteration 24**) | Range selection with Shift+Arrow after an entry starts at the cursor slot instead of the note just entered (slur ranges start one slot late versus MuseScore) | E5 | A |
| 26 | 1 data loss (**fixed in iteration 26**) | A MIDI key or `M`-mode commit after a typed letter replaces the note just entered instead of writing at the cursor | parity matrix | A |
| 27 | 1 wrong pitch (**fixed in iteration 27**) | First `M`-mode pitch ignores the clef-middle-line rule; step-time entry after a voice change takes its octave from the other voice (MuseScore looks only in the entry voice) | parity matrix | A |
| 30 | 1 invalid output (**fixed in iteration 28**) | `insertMeasureAfter` writes an empty `<measure>` with no rest in any staff | T6 | C |
| 31 | 2 precision (**fixed in iteration 36**) | Dynamics have no keyboard path that passage 1 can script (`Cmd/Ctrl+D` is duplicate here, add-dynamic in MuseScore) | E1, parity matrix | A |
| 29 | 1 data loss (**fixed in iteration 31**) | Typing past the last position of the score replaces the last note | parity matrix | A |
| 32 | 1 wrong onset, wrong target (**fixed in iteration 29**) | A rest typed in a rest-only bar after the last note is erased; left-hand rests in later bars are deleted; a rest in a later part moves the cursor to the first part | P1, S1, parity matrix | A |
| 33 | 1 wrong target (**fixed in iteration 30**) | Audit: every keyboard action in a second part must leave the first part untouched (several hook commands carry no part) | E2, S1 | A |
| 34 | 1 wrong target (**fixed in iteration 32**) | Removing a text direction removes the same text from every part; the visual selection does not carry its part, so the click must pass it | E7, S1 | C |

## Iteration 0 — Feature matrix and baseline

- Iteration / date / starting SHA / dirty-tree state: 0 / 2026-11-04 / local `838063d`
  (two unpushed local commits rebased onto `origin/devel` `c419c97`; the README conflict was
  resolved by keeping the public README and moving the remote's Linux desktop section into
  `docs/development.md`). Dirty tree before this iteration: `docs/README.md` (one index line)
  and the untracked program prompt `docs/arrangement-note-entry-iteration-prompt.md`. Both
  belong to the owner and are left unstaged.
- Track and matrix row: C, all rows (matrix creation).
- Problem and observable baseline:
  - `node_modules` was absent and the login shell's `npm` wrapper recursed (`_load_nvm`).
    Commands were run with Node v24.15.0 on `PATH`, after `npm ci`.
  - `npm test`: 1,161 tests, 1,160 passed, 1 failed. `NotationToolbar exposes microphone
    Instrument Record detection` expected `Alt(/Option)+C`, but the formatter introduced in
    `f2e9858` renders `Option+C` on macOS.
  - `npm run test:e2e:notation-tools`: the first run failed all 34 cases because the
    Playwright `ffmpeg` binary was missing (`npx playwright install ffmpeg` fixed this). The
    rerun gave 33 passed and 1 failed: `notation toolbar states active voice` looked up
    unformatted tooltips (`Cmd/Ctrl+Alt/Option+3`), but the UI shows `Cmd+Option+3`.
- Hypothesis and bounded change:
  - Both failures come from platform-formatted shortcut hints. The assertions now compare
    against `formatShortcutHint(...)` for the host platform. This is an exact match, not a
    looser pattern.
  - Created `docs/arrangement-feature-matrix.md` (47 rows: 42 PARTIAL, 5 MISSING) and this
    ledger.
  - Files: `test/user-visible-components.test.ts`, `e2e/notation-tools.spec.ts`, the two
    documents.
- Regression evidence after:
  - `npx tsx --test test/user-visible-components.test.ts`: 49 passed.
  - The toolbar Playwright case passed.
- Cross-app tests and builds run: none. This iteration changes tests and documentation only;
  `npm run apps:plan` reported documentation-only. Electron, iPad and the Xcode macOS target
  (which does not exist) were not run for that reason.
- Documentation updated: matrix and ledger created.
- Commit SHA / push result / verified remote devel SHA: recorded in the iteration 1 record,
  because a commit cannot contain its own SHA.
- Decision: accepted.
- Next item selected: backlog order 1 and 2 (Track A1, layout-aware shortcut identity).

## Iteration 1 — Layout-aware shortcut identity (QWERTZ Redo ran Undo)

- Iteration / date / starting SHA / dirty-tree state: 1 / 2026-11-04 / `02b4be7` (verified
  equal to `origin/devel` after the iteration 0 push). Owner files `docs/README.md` and
  `docs/arrangement-note-entry-iteration-prompt.md` left unstaged.
- Track and matrix row: A (keyboard precision); X1, X2.
- Problem and observable baseline:
  - `NexNoteApp` matched letters as `key === 'z' || code === 'KeyZ'`. On QWERTZ the printed Y is
    the physical `KeyZ`, so Cmd/Ctrl+Y (Redo) ran **Undo** in the web and iPad surfaces. Electron
    uses menu accelerators and was not affected.
  - Held keys auto-repeated every note-editor action. New hook test: a held `e` committed 4
    extra batches (`actual: 5, expected: 1`).
  - Duration digits fell back to the physical digit row even with Shift, so QWERTZ Shift+7 (`/`)
    and US Shift+1 (`!`) selected durations (`actual: '64', expected: '4'`).
  - macOS `Option+3` in TAB mode entered fret 3 instead of selecting string 3
    (`actual: 1, expected: 3`).
  - QWERTZ Shift+ß (`?`) matched tenuto through `code === 'Minus'`.
  - The new e2e case failed on the old code at the held-key assertion
    (`e2e/notation-tools.spec.ts`, QWERTZ case).
- Hypothesis and bounded change:
  - Letter shortcuts follow the printed character. Symbol shortcuts follow the produced
    character. `Shift+<key>` and Alt/Option shortcuts use the physical base key, taken from
    `navigator.keyboard.getLayoutMap()` where available, then built-in US/UK/DE tables, then
    codes that are stable across all three layouts.
  - Only navigation keys may auto-repeat.
  - Files: `src/score-input/keyboard-layout.ts` (new), `src/score-input/keyboard-resolver.ts`,
    `src/score-input/repitch-mode.ts`, `hooks/useNoteEditor.ts`, `components/NexNoteApp.tsx`,
    `test/keyboard-layout.test.ts` (new), `test/user-visible-note-editor.test.ts`,
    `e2e/notation-tools.spec.ts`.
  - Product decision: the QWERTY piano is positional (US letter names), so on QWERTZ the
    printed-Y key plays C4.
  - Product decision: Delete/Backspace no longer auto-repeat in the note editor. This
    protects against accidental mass deletion, unlike MuseScore. Revisit if users ask for
    held Backspace.
- Regression evidence before and after:
  - Three hook tests and the QWERTZ e2e case failed before the change and pass after.
  - `test/keyboard-layout.test.ts`: 91 passed.
  - Focused keyboard suites: 377 passed.
  - `npm test`: 1,255 passed, 0 failed.
  - `npm run build`: passed.
  - `npm run test:e2e:notation-tools`: 35 passed.
- Cross-app tests and builds actually run:
  - `npm run electron:refresh`: unit, build and packaged arm64 app verified as current.
  - `npm run ipad:sync` and `npm run ipad:doctor`: passed.
  - Not run: interactive keyboard smoke in the packaged Electron window (no automation channel
    for physical layouts); physical iPad with a hardware QWERTZ keyboard; the Xcode macOS
    target, which does not exist.
- Documentation updated: `docs/keyboard-shortcuts.md` (new "Keyboard layouts" section),
  `docs/user-manual.en.md` (Note Input), feature matrix X1 and X2, this ledger.
- Iteration 0 commit: `02b4be7`, pushed; `origin/devel` verified equal to local `HEAD`.
- Commit SHA / push result / verified remote devel SHA: recorded in the iteration 2 record.
- Decision: accepted. X2 is PASS. X1 stays PARTIAL until the scripted passages run on all
  three layouts and the WebKit `Option+Shift+0` gap is checked on hardware.
- Next item selected: backlog 2a. It was found during iteration-2 research with a probe
  script: on an imported grand-staff fixture, one `changeNotePitch` on staff 1 removed all
  staff-2 `<dynamics>` and `<pedal>` elements from the document. It is priority class 1 and
  ahead of every other item.

## Iteration 2 — Lower-staff directions survive edits and round trips

- Iteration / date / starting SHA / dirty-tree state: 2 / 2026-11-04 / `1405c73` (equal to
  `origin/devel`). Owner files left unstaged as before.
- Track and matrix row: C; E1 (dynamics), E6 (pedal), E7 (text), L1 (chord symbol onset).
- Problem and observable baseline:
  - On a synthetic grand-staff bar, one `changeNotePitch` on staff 1 removed every staff-2
    `<dynamics>` and `<pedal>` from the document. Core export wrote beat-0 directions only from
    the first staff's measure.
  - Import gave mid-measure directions and harmonies no position. They counted only
    `<offset>` and ignored the measure cursor, so a pedal change on beat 3 moved to beat 1.
  - `<pedal>` imported with an empty value and no number, so every stop re-exported as
    `type="start"`.
  - `addPedalSpan` on staff 2 reported success but wrote nothing.
  - The export loop emitted each mid-measure direction once per voice of its staff.
  - Evidence: all five new tests in `test/direction-staff-roundtrip.test.ts` failed. The new
    e2e case failed on the old adapters at `toMatch(/<dynamics>…<mf\/>/)`.
- Hypothesis and bounded change:
  - Import: a measure-cursor walk (notes advance it, chord tones and grace notes do not,
    `<backup>` and `<forward>` move it) gives each `<direction>` and `<harmony>` its musical
    position. `<offset>` stays visual, as MusicXML 4.0 defines it; earlier nex-note files wrote
    position plus an equal offset, and a compatibility test proves those still reimport at the
    same beat. `<pedal>` keeps its `type` and `number`.
  - Export: directions come from every staff's measure, de-duplicated by id. Beat-0 directions
    are written at the measure start. Mid-measure directions are written once each at their
    exact position (`<forward>`, the direction, one `<backup>`), and no longer per voice.
  - Files: `src/musicxml-adapter/import/import-musicxml.ts`,
    `src/musicxml-adapter/export/export-core-to-musicxml.ts`,
    `test/direction-staff-roundtrip.test.ts` (new), `test/score-architecture.test.ts`,
    `e2e/notation-tools.spec.ts`.
  - Changed assertion: the sync-point test asserted the old `<offset>2</offset>` encoding. It
    now asserts the reimported musical position (2/4). This is stricter about behavior and
    independent of the encoding.
- Regression evidence before and after:
  - 6 direction tests: 0 of 5 passed before; 6 of 6 after, including the compatibility case.
  - `npm test`: 1,261 passed, 0 failed.
  - New grand-staff e2e case: failed before, passed after.
  - `npm run build`: passed.
  - `node scripts/notation-quality-cycle.mjs --browser`: keyboard, mouse, tablet, playback
    and formatting passed. Browser: 82 passed, 1 failed. The failure was
    `tablet-entry.spec.ts` "Pencil focus layout": it looked for the unformatted
    `Undo (Cmd/Ctrl+Z)`, while macOS shows `Undo (Cmd+Z)`. This is the same platform-label class
    as iteration 0 and not caused by this change. It now uses the title-prefix locator from
    `2f3b431` and passes.
- Cross-app tests and builds actually run:
  - `npm run electron:refresh`: unit, build and packaged arm64 app verified.
  - `npm run ipad:sync` and `npm run ipad:doctor`: passed.
  - Not run: MuseScore CLI reopen of the new grand-staff fixture (scheduled with the entry-matrix
    fixtures); physical iPad; the Xcode macOS target, which does not exist.
- Documentation updated: matrix E1, E6, E7 and L1; this ledger.
- Iteration 1 commit: `1405c73`, pushed; remote verified equal.
- Commit SHA / push result / verified remote devel SHA: recorded in the iteration 3 record.
- Decision: accepted.
- Next item selected: backlog 4 (8va direction), then 4b (entry matrix). The entry-matrix
  exploration has already reproduced four entry defects; see iteration 3.
- Owner request recorded (2026-11-04, mid-iteration): "pay attention to correct entry of
  eighths and sixteenths in many settings: voices, multi-voice, several and different
  instruments; make it really solid." Scheduled as backlog 4b, directly after the 8va fix.

## Iteration 3 — Octave lines use the MusicXML direction; 15ma and 15mb

- Iteration / date / starting SHA / dirty-tree state: 3 / 2026-11-04 / `7b7d333` (equal to
  `origin/devel`). Owner files and the iteration-4 work file `src/score-input/voice-mapping.ts`
  left unstaged.
- Track and matrix row: C; P7.
- Problem and observable baseline:
  - `addOttava` wrote 8va as `octave-shift type="up"` and 8vb as `"down"`. MusicXML 4.0 defines
    `octave-shift` from the written pitch data: notes printed an octave higher (8va) are a shift
    "down". The importer already defaulted to that meaning, so an 8va added in nex-note rendered
    and exported as an 8vb, and other applications displaced the notes two octaves from the
    intent.
  - 15ma/15mb were not accepted.
  - `test/score-roundtrip-golden.test.ts` asserted the reversed `type="up"`.
  - New `test/ottava-direction.test.ts`: 6 of 7 failed before the change.
- Hypothesis and bounded change:
  - Map 8va/15ma to `down` and 8vb/15mb to `up`, with size 8 or 15 and a matching stop.
  - Default placement is above for 8va/15ma and below for 8vb/15mb.
  - The schema accepts 15ma/15mb; the AI command catalog in `lib/prompts.ts` documents the
    kinds.
  - Corrected assertion: the golden test now expects `type="down"` for 8va and asserts that no
    `type="up"` is written. This corrects a wrong expectation against the MusicXML definition
    and is stricter than before.
  - Files: `src/score-core/commands/core-command-executor.ts`,
    `src/shared/schemas/score-command.ts`, `lib/prompts.ts`,
    `test/score-roundtrip-golden.test.ts`, `test/ottava-direction.test.ts` (new).
- Regression evidence before and after: ottava tests 1/7 before, 7/7 after; golden suite
  passes; `npm test` 1,268 passed, 0 failed.
- Cross-app tests and builds actually run:
  - `npm run build`: passed.
  - `npm run test:e2e:notation-tools`: 36 passed.
  - `npm run electron:refresh`: 1,268 unit tests, build and packaged app verified.
  - `npm run ipad:sync` and `npm run ipad:doctor`: passed.
  - Not run: rendered visual check of an octave bracket (there is no UI path yet; P7 keyboard
    and mouse are MISSING); MuseScore CLI reopen; physical iPad; the Xcode macOS target, which
    does not exist.
- Documentation updated: matrix P7, `lib/prompts.ts` command catalog, this ledger.
- Iteration 2 commit: `7b7d333`, pushed; remote verified equal.
- Commit SHA / push result / verified remote devel SHA: recorded in the iteration 4 record.
- Decision: accepted.
- Next item selected: backlog 4b, entry matrix. Exploration with `test/entry-matrix.test.ts`
  reproduced four entry defects:
  1. wrong voice on MuseScore/Finale piano left hands (stored voice 5);
  2. the dot survives a duration change;
  3. Cmd/Ctrl+3 during entry ignores the active duration, and typing into a tuplet slot
     corrupts the group;
  4. a value longer than the rest of the bar is rejected instead of split and tied.
  The wrong-voice defect is priority 1 and goes first.

## Iteration 4 — Staff-relative input voices (MuseScore/Finale piano left hand)

- Iteration / date / starting SHA / dirty-tree state: 4 / 2026-11-04 / `e90d784` (equal to
  `origin/devel`). Owner files left unstaged.
- Track and matrix row: A and B (keyboard and mouse precision, priority class 1, wrong voice);
  P5, parity matrix "voices 1-4".
- Problem and observable baseline:
  - MuseScore and Finale export a piano left hand as MusicXML voice 5 (staff n uses voices
    4(n−1)+1 … 4n). nex-note set the input voice from a click only for stored voices 1–4, and used
    the input voice directly as the stored voice.
  - Effect: typing or clicking on such a lower staff created a new voice 1 beside the existing
    voice 5, so every bar gained a second voice.
  - Evidence: in the entry matrix, the scenarios "piano left hand stored as MusicXML voice 5"
    and "second voice is stored as MusicXML voice 6" failed. The new e2e case failed on the old
    code with two lower-staff voices (`Expected - 1, Received + 2`).
- Hypothesis and bounded change:
  - New `src/score-input/voice-mapping.ts`: `inputVoiceOf(stored)` and
    `storedVoiceFor(document, staff, inputVoice)`. The latter uses the voice that already
    represents the input voice on that staff, else the staff's numbering band, else the input
    voice.
  - The core model and export keep the stored numbers, so files round-trip unchanged.
  - `useNoteEditor`: clicks set the input voice through `inputVoiceOf`; every keyboard target
    (notes, rests, chords, slash fill, pitch replacement in another voice) uses
    `storedInputVoiceAt(anchor)`.
  - `ScoreEditor`: hover, click and ghost-refresh translate the input voice once, from the staff
    under the pointer (`resolveStoredInputVoiceAtPoint`).
  - For staves numbered 1–4 the mapping is the identity, so existing fixtures behave exactly as
    before.
  - New tests: `test/voice-mapping.test.ts`, `test/entry-matrix.test.ts` with the harness in
    `test/support/` (12 keyboard scenarios; 3 open defects marked `todo` with their iteration),
    and an e2e case for keyboard and mouse entry on a voice-5 left hand.
- Regression evidence before and after:
  - Entry matrix voice scenarios: failed before, pass after.
  - e2e voice-5 case: failed before, passes after.
  - `npm test`: passed.
  - `npm run build`: passed.
  - `tsc --noEmit` for application sources: clean. Pre-existing type errors remain in `e2e/` and
    `test/` files that the production build does not compile; recorded as backlog item 23.
- Cross-app tests and builds actually run:
  - `node scripts/notation-quality-cycle.mjs --browser`: all five unit groups passed; browser
    84 passed, 0 failed (includes mouse-precision-stress, snap-ghost-debug, tablet-entry and
    the semantic-grid fuzz).
  - `npm run test:e2e:doctor` (exhaustive mouse grid and fuzz): 5 passed.
  - `npm run electron:refresh`: 1,284 tests (1,281 passed, 3 `todo`, 0 failed), build and
    packaged app verified.
  - `npm run ipad:sync` and `npm run ipad:doctor`: passed.
  - Not run: physical iPad Pencil entry on a voice-5 left hand; the Xcode macOS target, which
    does not exist.
- Documentation updated: matrix P5, parity matrix "voices 1-4", this ledger.
- Iteration 3 commit: `e90d784`, pushed; remote verified equal.
- Commit SHA / push result / verified remote devel SHA: recorded in the iteration 5 record.
- Decision: accepted.
- Next item selected: iteration 5, the dot reset (MuseScore reference verified in its source).

### External MuseScore evidence for iterations 2 and 3 (2026-11-04)

Command: `npx tsx scripts/musescore-roundtrip-smoke.ts` with three synthetic fixtures:
- a grand-staff file after a right-hand edit, with left-hand pedal start/change/stop and a
  dynamic;
- octave lines 8va, 8vb, 15ma and 15mb;
- an empty MuseScore-numbered piano.

Local MuseScore 4.7.3 again aborted nondeterministically in several conversion steps
(`SIGABRT: mutex lock failed`). This is the local crash class already classified in the parity
matrix, not a nex-note export failure. The steps that completed:
- MuseScore's re-exports of the edited grand-staff file (from MusicXML, MXL and MSCZ) keep the
  pedal `start`, `change` and `stop` and the lower-staff dynamic.
- MuseScore's re-export of the octave-line file writes the opening `octave-shift` of 8va, 8vb,
  15ma and 15mb as `down 8`, `up 8`, `down 15`, `up 15`. That is the same direction convention
  as nex-note since iteration 3.

The stop elements of the octave lines did not appear in the MuseScore re-exports scanned. Visual
confirmation of the brackets in MuseScore was not possible headless; this remains open under P7.

## Iteration 5 — A new note value clears the augmentation dot

- Iteration / date / starting SHA / dirty-tree state: 5 / 2026-11-04 / `b929eec` (equal to
  `origin/devel`). Owner files left unstaged.
- Track and matrix row: A (keyboard precision); P1.
- Problem and observable baseline:
  - `4 . c 3 d 4 . e` produced a dotted sixteenth D (spelled 16th tied to 32nd) and an
    undotted eighth E, because the dot survived the duration change and the second `.` turned
    it off.
  - Entry-matrix scenario "dotted eighth and sixteenth pairs" failed.
- Reference: MuseScore `src/engraving/editing/noteinput.cpp` (branch `main`),
  `NoteInput::setDuration` calls `is.setDots(0)`; only by-duration and rhythm entry restore the
  previous dots. The handbook does not state the rule. It was read from source on 2026-11-04 via
  the GitHub API.
- Hypothesis and bounded change:
  - Step-time duration keys and the toolbar entry-duration path clear the dot.
  - Duration-first input (`M`) is unchanged: its dot is set before the committing duration key.
  - Corrected assertion: `MuseScore-style keyboard entry supports repeat, octave, and voice
    shortcuts` expected the dot to stay after `6 . C 3`; it now expects `false`, with the
    MuseScore source reference in the test.
  - Files: `hooks/useNoteEditor.ts`, `test/user-visible-note-editor.test.ts`,
    `test/entry-matrix.test.ts`.
- Regression evidence before and after:
  - Dotted-pair scenario: failed before, passes after.
  - New toolbar dot test passes.
  - New matrix scenario "duration-first input (M) keeps a dot" passes; it also passed on the
    old code, as a guard.
  - `npm test`: 1,284 passed, 2 `todo`, 0 failed.
  - `npm run build`: passed.
- Cross-app tests and builds: run once on the iteration 5–7 stack before pushing; see the
  iteration 7 record.
- Documentation updated: `docs/user-manual.en.md`, `docs/keyboard-shortcuts.md` (`.` row),
  this ledger.
- Iteration 4 commit: `b929eec`, pushed; remote verified equal.
- Decision: accepted (pending the stack gates).
- Next item selected: iteration 6, tuplets during note input.

## Iteration 6 — Tuplets during note input (MuseScore semantics)

- Iteration / date / starting SHA / dirty-tree state: 6 / 2026-11-04 / `08c14c4` (local, on
  top of `b929eec`). Owner files left unstaged.
- Track and matrix row: A (keyboard precision), C; P2.
- Problem and observable baseline:
  - In note input, Cmd/Ctrl+3 divided the selected element (a whole-bar rest) instead of
    using the active duration, and was rejected.
  - Typing into a tuplet slot committed a normal eighth that broke the group: after `c`, the
    tuplet showed `C4 eighth | r 32nd.`.
  - Entry-matrix scenario "eighth triplet from a quarter and Cmd+3" failed. The new e2e case
    failed on the old hook.
- Hypothesis and bounded change:
  - In note input, Cmd/Ctrl+2..9 builds one batch at the cursor: `replaceWithRest` with the
    active duration (the tuplet's total length, as in MuseScore), then `addTuplet` anchored at
    that onset.
  - The cursor moves to the first unit, and the entry value becomes the unit (the total halved
    once per power of two of the normal count).
  - A typed pitch (or a Shift chord tone) on a tuplet slot of the same unit value commits
    through the existing `editTupletUnit` command, so the ratio and identities are kept.
  - Outside note input the old "divide the selected element" behavior is unchanged.
  - Files: `hooks/useNoteEditor.ts`, `test/entry-matrix.test.ts`,
    `e2e/notation-tools.spec.ts`.
- Regression evidence before and after:
  - Entry matrix: eighth triplet, sixteenth triplet (eighth + Cmd+3) and sixteenth quintuplet
    (quarter + Cmd+5) pass, each with one batch per action.
  - e2e "a quarter and Cmd/Ctrl+3 during note input": failed before, passes after, with a
    clean strict Doctor.
  - `npm test`: 1,287 passed, 1 `todo`, 0 failed.
  - `npm run build`: passed; application `tsc` clean.
- Cross-app tests and builds: run on the stack; see iteration 7.
- Documentation updated: `docs/user-manual.en.md` (tuplets during note input),
  `docs/keyboard-shortcuts.md` (Cmd/Ctrl+2..9 row), matrix P2, this ledger.
- Decision: accepted (pending the stack gates).
- Next item selected: iteration 7, splitting at the barline.

## Iteration 7 — Keyboard values longer than the bar are split and tied at the barline

- Iteration / date / starting SHA / dirty-tree state: 7 / 2026-11-04 / `5191351` (local).
  Owner files left unstaged.
- Track and matrix row: A (keyboard precision); P3, entry matrix.
- Problem and observable baseline:
  - A quarter typed on the last eighth of a 4/4 bar was rejected (`overflow-rejected`).
    MuseScore splits it at the barline and ties it into the next bar.
  - Entry-matrix scenario "a quarter entered on the last eighth" failed. The new e2e case
    failed on the old hook.
- Hypothesis and bounded change:
  - When keyboard step-time entry in replace mode overflows the bar and both parts (rest of the
    bar, remainder) are single, possibly dotted values, commit one batch: `replaceWithRest` and
    `insertNoteAt` for each part, plus `toggleTie`. The cursor advances after the second part.
  - Other lengths, tuplet slots and the last bar keep the visible rejection.
  - Product decision: pointer entry keeps rejecting overlong values, because its ghost previews
    a single-bar note and preview must equal commit. The existing mouse overfill tests are
    unchanged.
  - Files: `hooks/useNoteEditor.ts`, `test/entry-matrix.test.ts`,
    `e2e/notation-tools.spec.ts`.
- Regression evidence before and after:
  - Matrix scenarios that now pass: quarter on the last eighth (eighth~eighth), dotted quarter
    on the last eighth (eighth~quarter), half on beat 3 of 3/4 (quarter~quarter).
  - A sixteenth-plus-11/16 split is rejected with the document unchanged.
  - e2e: split, tie, strict Doctor clean, and one Undo restores the bar.
  - `npm test`: 1,291 passed, 0 `todo`, 0 failed.
  - `npm run build`: passed; application `tsc` clean.
- Found while writing the e2e case (not caused by this change, recorded as backlog 24): strict
  Doctor blocks edits when a later bar holds a whole-bar rest written as `measure="yes"` or as two
  half rests.
- Documentation updated: `docs/user-manual.en.md` (values across the barline), matrix P3,
  this ledger.
- Cross-app gates for the iteration 5–7 stack, run on `3d9c753` before pushing:
  - `node scripts/notation-quality-cycle.mjs --browser`: all unit groups passed; browser 86
    passed, 0 failed.
  - `npm run test:e2e:doctor`: 5 passed.
  - `npm run electron:refresh`: 1,291 tests passed, build and packaged app verified.
  - `npm run ipad:sync` and `npm run ipad:doctor`: passed.
  - Not run: physical iPad; hardware MIDI; the Xcode macOS target, which does not exist.
- Commit SHAs: iteration 5 `08c14c4`, iteration 6 `5191351`, iteration 7 is this commit. All
  three were pushed together after these gates; the remote SHA is verified in the iteration 8
  record.
- Decision: iterations 5, 6 and 7 accepted.
- Next item selected: iteration 8, part scope for dynamics, chord symbols, slash fills and
  staff text (reproduced: they wrote into every part).

## Iteration 8 — Dynamics, chord symbols, slash fills and staff text stay in their instrument

- Iteration / date / starting SHA / dirty-tree state: 8 / 2026-11-04 / `f8edee1` (equal to
  `origin/devel`). Owner files left unstaged.
- Track and matrix row: C (priority class 1, wrong target); E1, E7, L1, L2.
- Problem and observable baseline:
  - In a flute and cello score, `addDynamic`, `setHarmonyAt`, `addWords` and
    `addExpressionText` aimed at the cello also wrote into the flute.
  - `fillSlashMeasure` replaced the flute's bar with slashes.
  - The commands had no part field; the editor and Inspector sent none.
  - Evidence: new `test/part-scope.test.ts` passed 1/7 before (only the score-wide default
    case); the new e2e case (palette `F` on the cello) failed on the old code.
- Hypothesis and bounded change:
  - Optional `corePartId` (and `staffIndex` for text) on these commands. A
    `commandTargetsPart` helper accepts the core id ("part:P1") or the MusicXML id ("P1").
  - Without a part the score-wide meaning is unchanged (AI and system-wide text).
  - The editor (`addDynamic`, `setHarmonyAtSelection`, `fillSlashMeasure`) and the Inspector
    (dynamics, staff and expression text) pass the selected note's part, and its staff for
    text.
  - Updated assertion: the Inspector component test now expects the part and staff fields in
    the emitted commands.
  - Files: `src/score-core/commands/core-command-executor.ts`,
    `src/shared/schemas/score-command.ts`, `hooks/useNoteEditor.ts`,
    `components/ScoreInspector.tsx`, `test/part-scope.test.ts` (new),
    `test/user-visible-components.test.ts`, `e2e/notation-tools.spec.ts`.
- Regression evidence before and after: part-scope 1/7 before, 7/7 after; e2e failed before,
  passes after; `npm test` 1,298 passed after the Inspector expectation update; build passed;
  application `tsc` clean.
- Cross-app tests and builds: run on the iteration 8–11 stack.
- Documentation updated: `docs/user-manual.en.md`, matrix E1, E7, L1, L2, this ledger.
- Iteration 5–7 commits pushed: remote `devel` verified at `f8edee1`.
- Decision: accepted (pending the stack gates).

## Iteration 9 — Double-dotted values keep both dots

- Iteration / date / starting SHA / dirty-tree state: 9 / 2026-11-04 / `6adaf6e` (local).
- Track and matrix row: C (priority class 1, data loss); P1.
- Problem and observable baseline:
  - A double-dotted quarter (14 of 8 divisions) imported as `isDotted: true` and re-exported
    with one `<dot/>`. Other applications then draw a dotted quarter whose length disagrees with
    its duration, and nex-note reported `event_duration_notation_mismatch`.
  - In the browser's strict-Doctor mode, any file with double dots was additionally blocked
    from editing (`projection_unexportable_duration 14`).
  - New `test/double-dot-roundtrip.test.ts` passed 1/3 before.
- Hypothesis and bounded change:
  - `dotCount` on events (set only for two or more dots), read on import.
  - Export writes that count only while the stored duration still equals the multi-dotted
    value. The validator applies the same condition, so a later value change can never write
    or report a stale double dot.
  - Rhythm-speller fragments drop `dotCount`. The Doctor projection rule accepts a fragment
    that is exactly an imported multi-dotted event.
  - Files: `src/score-core/model/types.ts`, `src/musicxml-adapter/import/import-musicxml.ts`,
    `src/musicxml-adapter/export/export-core-to-musicxml.ts`,
    `src/score-core/validation/validate-score-document.ts`, `src/layout/rhythm-speller.ts`,
    `src/debug/doctor/document-doctor.ts`, `test/double-dot-roundtrip.test.ts` (new),
    `e2e/notation-tools.spec.ts`.
  - Not changed: entering double dots from the keyboard or toolbar (P1 stays PARTIAL), and
    128th notes.
- Regression evidence before and after: unit 1/3 before, 3/3 after; e2e (Doctor-clean load,
  neighbour edit keeps four dots) passes; `npm test` passed; build passed.
- Cross-app tests and builds: run on the iteration 8–11 stack.
- Documentation updated: matrix P1, this ledger.
- Decision: accepted (pending the stack gates).

## Iteration 10 — N.C. and 6/9 chord symbols export as valid MusicXML

- Iteration / date / starting SHA / dirty-tree state: 10 / 2026-11-04 / `e574252` (local).
- Track and matrix row: C (priority class 1, invalid output and data loss); L1.
- Problem and observable baseline:
  - N.C. was written as `<harmony><root><root-step>N</root-step></root></harmony>` with no
    `<kind>`. That is invalid MusicXML, and it reimported as a chord named "N".
  - `C6/9` lost "/9": the slash was taken for a bass note and the 9 dropped, so it reimported
    as `C6`.
  - Altered chords (C7b9, Bb7#11) are still written as plain `<words>`; this is a larger,
    separate item (L1 next action).
  - Mid-bar chord positions already survive since iteration 2 (the probe confirmed beat 2
    stays at beat 2).
  - New `test/harmony-no-chord.test.ts` passed 1/4 before; the new e2e case failed on the old
    adapters.
- Hypothesis and bounded change:
  - N.C., NC, N.C and "no chord" export as the MuseScore form: an empty-text root and
    `<kind text="N.C.">none</kind>`. Import reads `kind none` back as N.C.
  - A slash is a bass note only when a plain note name follows. `6/9` (and `69`, `m6/9`)
    exports as `major-sixth`/`minor-sixth` with text "6/9" and an added 9th degree.
  - Whole-score transposition keeps N.C. and turns C6/9 into D6/9 (tested).
  - Files: `src/musicxml-adapter/export/export-core-to-musicxml.ts`,
    `src/musicxml-adapter/import/import-musicxml.ts`, `test/harmony-no-chord.test.ts` (new),
    `e2e/notation-tools.spec.ts`.
- Regression evidence before and after: unit 1/4 before, 4/4 after; e2e through the inline
  chord field failed before, passes after; `npm test` 1,305 passed; build passed.
- Cross-app tests and builds: run on the iteration 8–11 stack.
- Documentation updated: matrix L1, this ledger.
- Decision: accepted (pending the stack gates).

## Iteration 11 — `setCueNote` marks cue notes instead of deleting their value

- Iteration / date / starting SHA / dirty-tree state: 11 / 2026-11-04 / `7e0f8ce` (local).
- Track and matrix row: C (priority class 1, corruption); L4.
- Problem and observable baseline: `setCueNote` (reachable through the AI command catalog) set
  `durationType` to undefined and cleared the dot, leaving a note with no notated value. New
  `test/cue-note-command.test.ts` passed 0/3 before.
- Hypothesis and bounded change:
  - A cue note keeps its value and duration and is marked with `<cue/>` before the pitch, the
    same fragment the importer already preserves.
  - `isCue: false` removes the mark.
  - Rests and grace notes are rejected with a `cue_command_rejected` diagnostic and no change
    (MusicXML allows either grace or cue).
  - Files: `src/score-core/commands/core-command-executor.ts`,
    `test/cue-note-command.test.ts` (new).
  - Still missing: cue-size rendering evidence, keyboard and mouse paths, silencing cues in
    the fallback MIDI.
- Regression evidence before and after: 0/3 before, 3/3 after; `npm test` 1,308 passed; build
  passed.
- Cross-app tests and builds: run on the iteration 8–11 stack.
- Documentation updated: matrix L4 (MISSING to PARTIAL), this ledger.
- Decision: accepted (pending the stack gates).
- Cross-app gates for the iteration 8–11 stack, run on the iteration 11 commit before pushing:
  - `node scripts/notation-quality-cycle.mjs --browser`: all unit groups passed; browser 89
    passed, 0 failed.
  - `npm run test:e2e:doctor`: 5 passed.
  - `npm run electron:refresh`: 1,308 tests passed, build and packaged app verified.
  - `npm run ipad:sync` and `npm run ipad:doctor`: passed.
  - Not run: physical iPad; the Xcode macOS target, which does not exist.
- Commit SHAs: iteration 8 `6adaf6e`, 9 `e574252`, 10 `7e0f8ce`, 11 is this commit; pushed
  together after these gates.
- Decision: iterations 8–11 accepted.
- Next item selected: iteration 12, transposing parts and playback pitch (S2). Before changing
  anything, the local MuseScore CLI will render a B-flat clarinet to MIDI with and without
  `<transpose>`.

## Iteration 12 — Transposing instruments play back at sounding pitch

- Iteration / date / starting SHA / dirty-tree state: 12 / 2026-11-04 / `9f24cc3` (equal to
  `origin/devel`). Owner files left unstaged.
- Track and matrix row: C (priority class 1, wrong audible pitch); S2, W4.
- Problem and observable baseline, measured with the local MuseScore 4.7.3 CLI:
  - A B-flat clarinet's written D5 renders as MIDI 72 (correct sounding C5) with
    `<transpose>`, and as 74 without it.
  - `sanitizeXmlForMidiExport` stripped `<transpose>` before rendering, so the app played 74.
  - The fallback MIDI builder ignored transposition entirely (74; a guitar's `octave-change -1`
    was also ignored).
  - The importer did not model `<octave-change>`, and a transposition created by nex-note was
    written as `<chromatic>` before `<diatonic>`, which violates MusicXML element order.
  - The stripping came with the initial relaunch commit and had no recorded reason; the
    MuseScore run shows no double transposition when the element is kept.
  - New `test/transposing-playback.test.ts`: 0/4 before.
- Hypothesis and bounded change:
  - Keep `<transpose>` in the playback XML.
  - Model `transposeOctaveChange` on parts.
  - The fallback MIDI plays written + chromatic + 12 × octave-change.
  - Export rebuilds `<transpose>` children in schema order (diatonic, chromatic,
    octave-change) and keeps any others.
  - Corrected assertions in `test/user-visible-exports.test.ts`: the sanitizer test asserted
    that `<transpose>` was removed, and the fallback test expected written pitch 65 for a part
    with chromatic +2; both now assert sounding behavior (kept element, 67).
  - Files: `lib/midi-export.ts`, `src/score-core/model/types.ts`,
    `src/musicxml-adapter/import/import-musicxml.ts`,
    `src/musicxml-adapter/export/export-core-to-musicxml.ts`,
    `test/transposing-playback.test.ts` (new), `test/user-visible-exports.test.ts`.
- Regression evidence before and after:
  - Unit 0/4 before, 4/4 after.
  - After the change, the MuseScore CLI renders the app's sanitized XML as 72, and the fallback
    builder gives 72.
  - `npm test`: 1,312 passed.
  - `npm run build`: passed.
- Not verified: audible output on speakers (this needs the owner's listening check; see the
  participation guide).
- Documentation updated: matrix S2, this ledger.
- Cross-app tests and builds actually run:
  - `node scripts/notation-quality-cycle.mjs --browser`: all groups passed; browser 89
    passed, 0 failed.
  - `npm run electron:refresh`: 1,312 tests passed, build and packaged app verified.
  - `npm run ipad:sync` and `npm run ipad:doctor`: passed.
  - Not run: listening test on speakers; physical iPad; the Xcode macOS target, which does not
    exist.
- Iteration 8–11 commits pushed: remote `devel` verified at `9f24cc3`.
- Commit SHA / push result: this commit, pushed after the gates; the remote SHA is recorded in
  the iteration 13 record.
- Decision: accepted.
- Next item selected: iteration 13. A probe found a priority-1 corruption: a violin trill line
  (`<wavy-line>`) imported as guitar string 1, fret 0, exported a fabricated `<technical>`, and
  after an edit turned the wavy-line stop into a second start.

## Iteration 13 — Ornament lines and standard-notation marks are not TAB data

- Iteration / date / starting SHA / dirty-tree state: 13 / 2026-11-04 / `f0815e5` (equal to
  `origin/devel`).
- Track and matrix row: C (priority class 1, corruption); E4, L5.
- Problem and observable baseline:
  - `readGuitarTechnical` created guitar data (string 1, fret 0) whenever a note had any
    technique and no string or fret. A violin trill line (`<wavy-line>`) counted as vibrato, so
    the note exported a fabricated `<technical><string>1</string><fret>0</fret>`.
  - After any edit, the wavy-line stop became a second start, breaking the trill line.
  - Standard-notation hammer-on and bowing marks were affected the same way.
  - New `test/ornament-guitar-separation.test.ts`: 1/3 before (only the real-TAB case passed).
- Hypothesis and bounded change: guitar data requires a real string (1–6) and fret. Without
  them the techniques stay in the preserved notation XML, which already round-trips
  `<ornaments>` and `<technical>` verbatim. File:
  `src/musicxml-adapter/import/import-musicxml.ts`.
- Regression evidence before and after: 1/3 before, 3/3 after; the guitar suites (TAB
  semantics, Guitar Pro import, repitch, fretboard, golden, architecture) pass; `npm test`
  1,315 passed; build passed.
- Cross-app tests and builds: run on the iteration 13–14 stack.
- Documentation updated: this ledger.
- Iteration 12 pushed: remote `devel` verified at `f0815e5`.
- Decision: accepted (pending the stack gates).

## Iteration 14 — Guitar bends keep their amount; taps are taps

- Iteration / date / starting SHA / dirty-tree state: 14 / 2026-11-04 / `6f201d0` (local).
- Track and matrix row: C (priority class 1, wrong data); L5.
- Problem and observable baseline:
  - `addGuitarBend` ignored `bendSemitones`; export always wrote `<bend-alter>1</bend-alter>`;
    import dropped the amount. An imported full-step bend (2) therefore exported as a half step.
  - `addGuitarTap` stored a hammer-on instead of MusicXML `<tap/>`.
  - Both commands invented string 1, fret 0 for notes without TAB data.
  - New `test/guitar-bend-tap.test.ts`: 0/4 before.
- Hypothesis and bounded change:
  - `guitar.bendAlter` (semitones; omitted for the default 1) is imported from `<bend-alter>`
    and exported.
  - `tap` is a technique kind, read from and written as `<tap/>`.
  - Both commands reject notes without TAB data (`guitar_command_rejected`, no change).
  - Corrected assertions in `test/core-command-executor.test.ts`: the old tests bent an
    untabbed note (relying on the invented string 1, fret 0) and expected tap to store a
    hammer-on. They now use a TAB note (string 3, fret 5), assert that the string and fret are
    kept, and expect `tap`.
  - Files: `src/score-core/model/types.ts`, `src/musicxml-adapter/import/import-musicxml.ts`,
    `src/musicxml-adapter/export/export-core-to-musicxml.ts`,
    `src/score-core/commands/core-command-executor.ts`, `test/guitar-bend-tap.test.ts` (new),
    `test/core-command-executor.test.ts`.
- Regression evidence before and after: 0/4 before, 4/4 after; guitar suites pass;
  `npm test` passed after the test correction; build passed; application `tsc` clean.
- Cross-app tests and builds: run on the iteration 13–14 stack.
- Documentation updated: matrix L5, this ledger.
- Decision: accepted (pending the stack gates).
- Cross-app gates for the iteration 13–14 stack, run before pushing:
  - `node scripts/notation-quality-cycle.mjs --browser`: all groups passed; browser 89
    passed, 0 failed.
  - `npm run electron:refresh`: 1,319 tests passed, build and packaged app verified.
  - `npm run ipad:sync` and `npm run ipad:doctor`: passed.
  - Not run: physical iPad; Guitar Pro hardware workflows; the Xcode macOS target, which does
    not exist.
- Commit SHAs: iteration 13 `6f201d0`, iteration 14 is this commit; pushed together.
- Decision: iterations 13 and 14 accepted.
- Next item selected: entry-matrix batch 2 (owner request): chords in voice 2, voices 3 and 4,
  accidental carry across voices, the middle instrument of three, rests and triplets in voice 2,
  a left-hand second voice in sixteenths, voice 2 across the barline.

## Iteration 15 — Entry in another voice starts at the input cursor

- Iteration / date / starting SHA / dirty-tree state: 15 / 2026-11-04 / `4a4946e` (equal to
  `origin/devel`).
- Track and matrix row: A (keyboard precision, priority class 1, wrong onset); P5.
- Problem and observable baseline (entry-matrix batch 2):
  - After entering a note, the cursor (selection) correctly moves to the next slot. But when the
    active voice had no note there, a pitch fell back to `insertNote(insertAtCursor)`, which
    used `lastNoteInputRef`, the note just entered. Examples: after `c d` in voice 3, voice 4
    started at beat 1.5 instead of 2; a piano left-hand second voice typed after a quarter
    started at beat 1.
  - A rest typed in another voice was inserted after the anchor (`insertRest` with
    `afterTimestamp`), one slot late.
  - Four new matrix scenarios failed on the old hook; the new e2e case failed on the old hook.
- Hypothesis and bounded change:
  - The cross-voice pitch path passes the cursor as the explicit entry target.
  - A cross-voice rest uses `insertRestAt` at the cursor's onset in the stored voice; its
    advance locator uses that onset.
  - This is MuseScore's rule: the input position does not change when the voice changes.
  - File: `hooks/useNoteEditor.ts`. Tests: `test/entry-matrix.test.ts` (voices 3 and 4, voice-2
    rest and triplet, piano left-hand second voice, accidental carry across voices, middle of
    three instruments), `test/support/entry-harness.ts` (the `+` key is no longer parsed as a
    modifier separator), `e2e/notation-tools.spec.ts`.
- Regression evidence before and after: 4 matrix scenarios failed before and pass after; e2e
  failed before, passes after; `npm test` 1,324 passed, 2 `todo`; build passed.
- Cross-app tests and builds: run on the iteration 15–17 stack.
- Documentation updated: this ledger.
- Decision: accepted (pending the stack gates).
- Next: iteration 16 (advance into a bar where the active voice does not exist), then iteration
  17. For 17, MuseScore source `NoteInput::addPitch(step, addFlag)` adds a Shift chord tone to
  `score->selection().element()`, which after an entry is the note just entered; nex-note's
  selection is the next slot instead.

## Iteration 16 — Entry continues into a bar where the active voice does not exist yet

- Iteration / date / starting SHA / dirty-tree state: 16 / 2026-11-04 / `de7602c` (local).
- Track and matrix row: A (priority class 1, data loss); P5.
- Problem and observable baseline: voice-2 eighths typed past the end of bar 1 stayed on the
  last eighth, because bar 2 had no voice 2 and the advance stayed in the same lane. Each
  further key overwrote that eighth (`c d e` ended as E6 on beat 4.5). The matrix scenario
  failed (todo), and the new e2e case failed on the old hook.
- Hypothesis and bounded change: `findNextInputPosition` falls back to the start of the next bar
  on the same staff when the active voice has no next slot; `isLocalNoteInputAdvance` accepts
  that position. The cross-voice path from iteration 15 then writes into the active voice at
  that onset. File: `hooks/useNoteEditor.ts`.
- Regression evidence before and after: scenario passes (todo removed); e2e failed before,
  passes after; `npm test` 1,325 passed, 1 `todo`; build passed.
- Cross-app tests and builds: run on the iteration 15–17 stack.
- Documentation updated: this ledger.
- Decision: accepted (pending the stack gates).

## Iteration 17 — Shift chord tones and the octave after a chord follow MuseScore

- Iteration / date / starting SHA / dirty-tree state: 17 / 2026-11-04 / `6b26a9d` (local).
- Track and matrix row: A (keyboard precision, MuseScore parity); P5, parity "A-G pitch input".
- Problem and observable baseline:
  - Shift+A–G added the tone to the note at the cursor, which is the *next* slot after an entry.
    Typing `c Shift+e` into empty bars therefore failed with `chord-missing-anchor`, and over
    existing notes the tone landed on the following note.
  - MuseScore (`src/engraving/editing/noteinput.cpp`, branch `main`):
    - `NoteInput::addPitch(step, addFlag)` adds to `score->selection().element()`, which after
      an entry is the note just entered;
    - `resolveNoteInputParams` places it above that chord's `upNote()`;
    - a plain letter is resolved nearest to the previous chord's `downNote()`.
  - The voice-2 Shift scenario in the matrix failed.
- Hypothesis and bounded change:
  - Shift chord tones use the last entered note (`lastNoteInputRef`, which is the clicked note
    before any entry) as the chord anchor, and the selection is put back on the input cursor
    afterwards.
  - The octave reference for a plain letter after a chord is the chord's lowest same-voice note.
  - Explicit chord-input mode and Cmd/Ctrl+Shift insertion are unchanged.
  - Corrected assertions, now with the source reference: the unit test "A-G note input chooses
    the closest octave and Shift+A-G stacks above the chord" and the e2e "letter-name input …
    stacks Shift pitches" asserted the old next-slot behavior (D4/E4 + B4 + C5 on beat 3). They
    now assert A3 + B3 + C4 on beat 2, beat 3 unchanged, and the cursor on beat 3.
  - Files: `hooks/useNoteEditor.ts`, `test/entry-matrix.test.ts`,
    `test/user-visible-note-editor.test.ts`, `e2e/notation-tools.spec.ts`.
- Regression evidence before and after: the matrix voice-2 chord scenario passes (C5+E5,
  G4+B4); `npm test` 1,326 passed, 0 `todo`; build passed; application `tsc` clean.
- Cross-app tests and builds: run on the iteration 15–17 stack.
- Documentation updated: `docs/keyboard-shortcuts.md` (Shift+A–G row, voice-change note),
  `docs/user-manual.en.md` (chords, voices while entering), parity matrix "A-G pitch input",
  this ledger.
- Decision: accepted (pending the stack gates).
- Cross-app gates for the iteration 15–17 stack, run before pushing:
  - `node scripts/notation-quality-cycle.mjs --browser`: all groups passed; browser 91
    passed, 0 failed.
  - `npm run test:e2e:doctor`: 5 passed.
  - `npm run electron:refresh`: 1,326 tests passed, build and packaged app verified.
  - `npm run ipad:sync` and `npm run ipad:doctor`: passed.
  - Not run: physical iPad hardware keyboard; the Xcode macOS target, which does not exist.
- Commit SHAs: iteration 15 `de7602c`, 16 `6b26a9d`, 17 is this commit; pushed together.
- Decision: iterations 15–17 accepted.
- Next item selected: round-trip losses for lyric extenders and elisions, multi-measure rests,
  and the suspected barline and ending cloning when a measure is inserted (backlog 11 and 13).

## Iteration 18 — Lyric melisma extenders and elisions survive round trips and edits

- Iteration / date / starting SHA / dirty-tree state: 18 / 2026-11-04 / `278cd81` (equal to
  `origin/devel`).
- Track and matrix row: C (priority class 1, data loss); L3.
- Problem and observable baseline (probe on a synthetic two-verse bar):
  - All 4 `<extend>` and the `<elision>` were lost on export.
  - Extender-only lyrics (a melisma continuing in verse 2) were dropped, so verse-2 lyric
    elements fell from 3 to 1.
  - The normalizer also discarded lyric lines with empty text.
  - `<multiple-rest>` did not reproduce as lost; it is kept in this probe.
  - New `test/lyric-extend-elision.test.ts`: 0/2 before.
- Hypothesis and bounded change:
  - `LyricLine` gains `elisions` (elision, syllabic, text) and `extend`
    (start/stop/continue/plain).
  - The importer walks each `<lyric>` in MusicXML order and keeps extender-only syllables.
  - The exporter writes `syllabic, text, (elision, syllabic, text)*, extend`.
  - The normalizer keeps lines with an extender.
  - Files: `src/score-core/model/types.ts`, `src/musicxml-adapter/import/import-musicxml.ts`,
    `src/musicxml-adapter/export/export-core-to-musicxml.ts`,
    `src/score-core/normalize/normalize-score-document.ts`,
    `test/lyric-extend-elision.test.ts` (new), `e2e/notation-tools.spec.ts`.
  - Still missing: entering extenders and elisions from the Inspector or a lyric entry mode
    (L3 stays PARTIAL).
- Regression evidence before and after: unit 0/2 before, 2/2 after; the e2e case (edit next to
  the lyrics keeps start/stop extenders and the elision) passes; `npm test` 1,328 passed; build
  passed.
- Cross-app tests and builds: run on the iteration 18–19 stack.
- Documentation updated: matrix L3, this ledger.
- Decision: accepted (pending the stack gates).

## Iteration 19 — An inserted measure is a plain bar; breaks stay on their bars

- Iteration / date / starting SHA / dirty-tree state: 19 / 2026-11-04 / `6723b9b` (local).
- Track and matrix row: C (priority class 1, wrong data); T6, T8.
- Problem and observable baseline:
  - `insertMeasureAfter` cloned the source bar's repeat barlines, endings, final barline,
    system and page breaks, and measure-repeat marks. Inserting after a first-ending bar
    produced two backward repeats and two first-ending starts.
  - Layout hints are stored by measure number and were not shifted on insert or delete, so a
    system break moved to a different bar.
  - Appending after the final bar left the final barline in the middle of the score.
  - New `test/insert-measure-structure.test.ts`: 0/4 before.
- Hypothesis and bounded change:
  - The clone clears barlines, endings, print breaks, measure-repeat and multi-rest flags.
  - Appending after a final barline moves it to the new last bar.
  - `shiftLayoutHintsAfterMeasure` shifts hints after an inserted bar, and removes the deleted
    bar's hints while shifting later ones.
  - File: `src/score-core/commands/core-command-executor.ts`.
- Regression evidence before and after: 0/4 before, 5/5 after (including the deletion case);
  inverse-command and history suites pass; `npm test` 1,333 passed. The first build attempt
  failed on a narrowed return type (`rightBarline: undefined`), fixed by an explicit annotation;
  then build passed and application `tsc` was clean.
- Cross-app tests and builds: run on the iteration 18–19 stack.
- Documentation updated: matrix T6, this ledger.
- Decision: accepted (pending the stack gates).
- Cross-app gates for the iteration 18–19 stack, run before pushing:
  - `node scripts/notation-quality-cycle.mjs --browser`: all groups passed; browser 92
    passed, 0 failed.
  - `npm run electron:refresh`: 1,333 tests passed, build and packaged app verified.
  - `npm run ipad:sync` and `npm run ipad:doctor`: passed.
  - Not run: physical iPad; the Xcode macOS target, which does not exist.
- Commit SHAs: iteration 18 `6723b9b`, 19 is this commit; pushed together.
- Decision: iterations 18 and 19 accepted.
- Next item selected: backlog 24, now diagnosed. The strict-Doctor strong-beat rule reports
  every value that fills a whole 4/4 bar (whole rest, whole note), which the rhythm speller
  deliberately leaves unsplit (`spansFullMeasure`), so strict mode blocks editing of such files.

## Iteration 20 — Strict Doctor accepts whole-bar notes and rests

- Iteration / date / starting SHA / dirty-tree state: 20 / 2026-11-04 / `02860eb` (equal to
  `origin/devel`).
- Track and matrix row: tooling correctness (backlog 24); T7, P9.
- Problem and observable baseline:
  - `projection.strong-beat-visible` reported any projection fragment crossing the 4/4 half-bar,
    including values that fill the whole bar. The rhythm speller deliberately leaves those
    unsplit (`spansFullMeasure`).
  - So every whole-bar rest or whole note was a strict-Doctor error, and in strict mode
    (`?doctor=strict`, used by the e2e suite) any edit next to one was blocked.
  - The new unit test (whole-bar case) failed; the new e2e case failed on the old Doctor.
- Hypothesis and bounded change: the rule skips fragments that start at 0 and span the
  measure, mirroring the speller. A fragment that crosses the half-bar inside the bar is still
  reported (guard test). File: `src/debug/doctor/document-doctor.ts`.
- Regression evidence before and after: unit 1/2 before, 2/2 after; existing Doctor suite
  passes; e2e (Doctor-clean load and edit next to a whole-bar rest) failed before, passes
  after; `npm test` 1,335 passed; build passed.
- Documentation updated: this ledger.
- Cross-app tests and builds actually run:
  - `node scripts/notation-quality-cycle.mjs --browser`: all groups passed; browser 93
    passed, 0 failed.
  - `npm run electron:refresh`: 1,335 tests passed, build and packaged app verified.
  - `npm run ipad:sync` and `npm run ipad:doctor`: passed.
  - Not run: physical iPad; the Xcode macOS target, which does not exist.
- Commit SHA / push result: this commit, pushed after the gates.
- Decision: accepted.
- Next item selected: the first-note register by clef. A rest's octave reference is a fixed C4
  placeholder, so with no earlier note in the voice the first letter resolves against C4 on
  every staff (C4 on a bass staff). MuseScore (`resolveNoteInputParams`) uses the clef's middle
  line when no previous chord exists.

## Iteration 21 — The first note of a passage follows the clef's register

- Iteration / date / starting SHA / dirty-tree state: 21 / 2026-11-04 / `e6a1322` (equal to
  `origin/devel`).
- Track and matrix row: A (keyboard precision, MuseScore parity); parity "A-G pitch input", S3.
- Problem and observable baseline:
  - A rest's selection entry carries a placeholder pitch, C4. With no earlier note in the voice,
    the first letter was resolved nearest to C4 on every staff.
  - In a fresh cello bar, `c d e` gave C4 D4 E4 (ledger lines above the bass staff); the e2e
    case shows this on the old hook.
  - MuseScore (`NoteInput::resolveNoteInputParams`, branch `main`) walks back through rests to
    the previous chord, and otherwise uses the clef's middle line (`line2pitch(4, clef)`).
- Hypothesis and bounded change:
  - `clefMiddleLineReference` derives the reference from the effective clef: treble B4, bass
    D3, alto C4, tenor A3, octave clefs shifted.
  - It is used when no preceding note exists in the lane, and for typing on a selected rest
    outside note input.
  - File: `hooks/useNoteEditor.ts`.
  - Updated expectations:
    - the entry-matrix scenarios that start on a rest (my own expectations from earlier
      iterations, which recorded the old C4 register) now expect C5 for treble and C3 for bass
      staves, through a register-aware `eighthScale` helper;
    - the unit test "note input previews and highlights the entered note while advancing the
      input cursor" now expects C5/D5 for a fresh treble bar, with the source reference.
- Regression evidence before and after:
  - `npm test`: 1,335 passed.
  - `npm run test:e2e:notation-tools`: 46 passed.
  - The new bass-clef e2e case (C3 D3 E3) failed on the old hook (C4 D4 …) and passes.
  - Build passed; application `tsc` clean.
- Documentation updated: `docs/user-manual.en.md` (pitch entry), `docs/keyboard-shortcuts.md`,
  parity matrix "A-G pitch input", this ledger.
- Cross-app tests and builds actually run:
  - `node scripts/notation-quality-cycle.mjs --browser`: all groups passed; browser 94
    passed, 0 failed.
  - `npm run test:e2e:doctor`: 5 passed.
  - `npm run electron:refresh`: 1,335 tests passed, build and packaged app verified.
  - `npm run ipad:sync` and `npm run ipad:doctor`: passed.
  - Not run: physical iPad; the Xcode macOS target, which does not exist.
- Commit SHA / push result: this commit, pushed after the gates.
- Decision: accepted.
- Next item selected: probe which note the articulation, grace, slur and respell keys act on
  right after an entry in note input. MuseScore selects the note just entered; nex-note's
  selection is the next slot.

## Iteration 22 — Grace notes stay with their main note after later edits

- Iteration / date / starting SHA / dirty-tree state: 22 / 2026-11-04 / `d32b138` (equal to
  `origin/devel`). In-progress iteration-23 hook changes were stashed while this iteration was
  verified.
- Track and matrix row: C (priority class 1, wrong data); P4.
- Problem and observable baseline:
  - Found while probing note-input commands. After a grace note was added before C, a later
    entry in the same bar (`insertNoteAt` D) re-sorted the voice by id within the onset, and
    export wrote the grace after C.
  - A MusicXML grace belongs to the following note, so on reimport the grace moved to D.
  - New `test/grace-order-export.test.ts` failed (`C before D`).
- Hypothesis and bounded change: within one onset, export writes grace events before the main
  note and its chord tones, keeping the graces' order. File:
  `src/musicxml-adapter/export/export-core-to-musicxml.ts`.
- Regression evidence before and after: failed before, passes after; grace, executor and golden
  suites pass; `npm test` passed; build passed.
- Cross-app tests and builds: run on the iteration 22–23 stack.
- Documentation updated: this ledger.

## Iteration 23 — In note input, selection keys act on the note just entered

- Iteration / date / starting SHA / dirty-tree state: 23 / 2026-11-04 / `f937cb7` (local).
- Track and matrix row: A (keyboard precision, MuseScore parity); E2, P4, P6.
- Problem and observable baseline (probe):
  - After `c`, `Shift+.` accented nothing (the cursor is a rest).
  - After `c d`, `Shift+s` put staccato on the following rest.
  - After `c`, `/` added no grace note.
  - `+ c j` did not respell.
  - MuseScore selects the note just entered (see iteration 17), so these keys act on it. New
    `test/note-input-selection-targets.test.ts`: 0/5 before.
- Hypothesis and bounded change:
  - `resolveEditTargets` returns the last entered note when, in note input, the selection is
    just the input cursor; explicit range selections are kept.
  - `toggleArticulation`, `addGraceNoteAtSelection`, `respellEnharmonically`,
    `toggleStemDirection` and `toggleSlashNotehead` use it.
  - The key handler restores the cursor selection afterwards.
  - The harness now derives US key and code for punctuation (`Shift+.` gives `>` / `Period`).
  - Files: `hooks/useNoteEditor.ts`, `test/support/entry-harness.ts`,
    `test/note-input-selection-targets.test.ts` (new).
  - Not changed: a Shift+Arrow range built after an entry still starts at the cursor slot
    (slur ranges therefore start one slot later than in MuseScore); recorded as open work.
- Regression evidence before and after: 0/5 before, 5/5 after; `npm test` 1,341 passed;
  `npm run test:e2e:notation-tools` 47 passed; build passed; application `tsc` clean.
- Cross-app tests and builds: run on the iteration 22–23 stack.
- Documentation updated: `docs/keyboard-shortcuts.md`, `docs/user-manual.en.md`, this ledger.
- Cross-app gates for the iteration 22–23 stack, run before pushing:
  - `node scripts/notation-quality-cycle.mjs --browser`: all automated groups passed; browser
    94 passed, 0 failed.
  - `npm run test:e2e:doctor`: 5 passed.
  - `npm run electron:refresh`: 1,341 tests passed; build and packaged app verified.
  - `npm run ipad:sync` and `npm run ipad:doctor`: passed.
  - Not run: physical iPad; the Xcode macOS target, which does not exist.
- Commit SHA / push result: iterations 22 and 23 pushed to `origin/devel` after these gates.
- Decision: accepted.
- Next item selected: backlog 25 (Shift+Arrow range after an entry).

## Iteration 24 — Shift+Arrow ranges after an entry start at the note just entered

- Iteration / date / starting SHA / dirty-tree state: 24 / 2026-11-04 / `cc97cd6` (pushed).
  Dirty tree: only the owner files `docs/README.md` and the untracked program prompt.
- Track and matrix row: A (keyboard precision, MuseScore parity); E5.
- Problem and observable baseline: after `c d e`, two `Shift+Left` and `S` slurred D to E
  instead of C to E; one `Shift+Left` selected E and the cursor rest. MuseScore extends the
  selection from the note just entered. Two new cases in
  `test/note-input-selection-targets.test.ts` failed (`D5-E5`; `['E5', 'C4']`).
- Hypothesis and bounded change: in note input, when the edit target is the note just entered
  (not the cursor slot), the first `Shift+Arrow` makes that note the range anchor and focus.
  File: `hooks/useNoteEditor.ts` (`extendSelection`).
- Regression evidence before and after: 0/2 before, 2/2 after; `npm test` passed; application
  `tsc` clean.
- Cross-app tests and builds: run on the iteration 24–26 stack.
- Documentation updated: `docs/keyboard-shortcuts.md`, `docs/user-manual.en.md`, this ledger.
- Decision: accepted.

## Iteration 25 — Values split by the rhythm speller keep their full length

- Iteration / date / starting SHA / dirty-tree state: 25 / 2026-11-04 / iteration 24 (local).
- Track and matrix row: A, priority class 1 (data loss, wrong onset); P1, P2, P5 and the
  owner request for eighths and sixteenths in every setting (backlog 4b).
- Problem and observable baseline (probe while scripting passage 1):
  - The speller writes a value that crosses a beat as tied notes or several rests. The input
    cursor then moved to the value's own tail, and the next entry overwrote it.
  - `4 c 5 d e` gave an eighth D and put E on beat 2; `3 c 5 d e` turned the quarter D into
    an untied dotted eighth; `4 c 5 0 d` shortened the quarter rest to an eighth; `4 c 6 d e`
    rejected E.
  - The same happened in voice 2, in the piano left hand, in a transposing middle part, in
    3/4 and in pitch-before-duration (`M`) mode.
  - Barline splits and tuplet members were already correct.
  - New `test/entry-split-values.test.ts`: 3/16 before (the three already-correct cases).
- Hypothesis and bounded change:
  - After an entry, the next input position skips the entered value's own fragments: tied
    same-pitch notes, or rests, that start before the value's nominal end in the same bar.
  - Tuplet members are not followed (the speller never splits them).
  - `M` mode passes its explicit duration.
  - File: `hooks/useNoteEditor.ts` (`findNextInputPosition`,
    `enteredValueLastFragmentOnset`, `commitNoteInputUpdate`, `insertMidiChord`,
    `insertRest`).
- Regression evidence before and after: 3/16 before, 16/16 after; `npm test` 1,359 passed; build
  passed; application `tsc` clean. New browser case in `e2e/notation-tools.spec.ts` passes under
  strict Doctor.
- Found and not changed (new backlog 26, 27):
  - A MIDI key or `M`-mode commit after a typed letter replaces the note just entered
    (`4 c M d 5` replaces C).
  - The first `M`-mode pitch ignores the clef-middle-line rule of iteration 21 (D4 instead of
    D5 in treble).
- Cross-app tests and builds: run on the iteration 24–26 stack.
- Documentation updated: `docs/keyboard-shortcuts.md`, `docs/user-manual.en.md`, this ledger.
- Decision: accepted.

## Iteration 26 — MIDI keys and `M` commits after a typed letter go to the cursor

- Iteration / date / starting SHA / dirty-tree state: 26 / 2026-11-04 / iteration 25 (local).
- Track and matrix row: A, priority class 1 (data loss); parity matrix "MIDI input" and
  "pitch-before-duration".
- Problem and observable baseline:
  - `insertMidiChord` targeted the last input. After a typed letter that is the note just
    entered, not the cursor (it stays the octave reference).
  - Typing C and then playing D on a MIDI keyboard replaced C. `4 c M d 5` replaced C the same
    way, and the MIDI chord, voice 2 and off-beat cases lost notes too.
  - New `test/entry-cursor-target.test.ts`: 1/8 before (MIDI entry on its own).
- Hypothesis and bounded change: `insertMidiChord` and `commitPreparedDurationPitches` use the
  input cursor first and the last input only as a fallback. MIDI-only entry is unchanged because
  it already kept both on the same slot. File: `hooks/useNoteEditor.ts`.
- Regression evidence before and after: 1/8 before, 8/8 after; `npm test` passed; build passed;
  application `tsc` clean. Physical MIDI hardware was not used: the tests call the hook's
  `insertMidiChord` entry point with pitches.
- Cross-app tests and builds: run on the iteration 24–26 stack.
- Documentation updated: this ledger.
- Decision: accepted.

## Iteration 27 — Typed letters take their register from the entry voice

- Iteration / date / starting SHA / dirty-tree state: 27 / 2026-11-04 / iteration 26 (local).
- Track and matrix row: A, priority class 1 (wrong pitch); parity matrix "A-G pitch input",
  "pitch-before-duration", voices.
- Problem and observable baseline:
  - Step-time entry after a voice change resolved the letter against the last input, which is
    a note in the other voice. With voice 1 at C4, the first C in an empty voice 2 was C4.
  - `M` started from a fixed C4 on a rest, so `N M d 5` gave D4 in treble and in bass clef.
  - MuseScore (`NoteInput::resolveNoteInputParams`, read from the source) looks for the previous
    chord in the entry track only and otherwise uses the clef's reference line.
  - New `test/entry-m-register.test.ts` failed before.
  - Found with the first test: the voice switched back to could not be entered at all when the
    kept cursor fell inside one of its longer rests. Notes were rejected (`target-inside-rest`), a
    rest left the cursor in place so the next note started a beat early, and a value longer than
    the bar could not tie over (also for voice 2 when the next bar has no voice 2 yet).
- Hypothesis and bounded change: new `laneRegisterReference`: the preceding pitched note in the
  entry voice, else the clef's middle line. Step-time letters use it when the last input is a
  rest or not in the entry voice. `M` uses it for its first prepared pitch, for letters without
  a prepared pitch, for the cursor arrows and when leaving a prepared rest. Shift chord tones are
  unchanged (they go to the note just entered).
  - Cross-voice cursor: keyboard targets carry `keyboard-cross-voice-cursor`, which the validator
    accepts inside a rest, including a whole-bar rest. Pointer entry is unchanged.
  - A rest over silence changes nothing in the document and moves the cursor past the value
    (`findCursorAfterSilentValue`); if no event starts there, the cursor keeps its lane at that
    onset.
  - The barline split also runs from a cross-voice cursor and creates a missing next-bar voice.
  - Files: `hooks/useNoteEditor.ts`, `src/score-input/keyboard-resolver.ts`,
    `src/score-input/note-entry-validator.ts`, `test/entry-cross-voice-cursor.test.ts` (new).
- Corrected existing assertions (exact values, no loosening; the source above is the evidence):
  - `test/user-visible-note-editor.test.ts`, "duration-first three-note entry stays atomic and
    isolated in voice 2": voice 2 is empty, so C4 E4 G4 becomes C5 E5 G5. The isolation, duration
    and one-Undo-entry assertions are unchanged.
  - Same file, "note input can insert pitched notes, rests, and overwrite the selected slot": B
    in empty voice 2 is B4, so the octave key gives B5, not B4.
  - `test/entry-matrix.test.ts`, `N M e . 5`: E4 becomes E5 (`N 5 e` already gave E5).
- Regression evidence before and after: new tests pass (the register and cross-voice cases failed
  before); `npm test` 1,381 passed; build passed; application `tsc` clean. New browser case in
  `e2e/notation-tools.spec.ts` passes under strict Doctor.
- Found and not changed (new backlog 29): typing past the last position of the score replaces the
  last note. MuseScore's rule still has to be read before changing it.
- Cross-app tests and builds: run on the iteration 24–27 stack.
- Documentation updated: `docs/keyboard-shortcuts.md`, `docs/user-manual.en.md`, this ledger.
- Decision: accepted.

## Iteration 28 — Inserted measures hold a whole-bar rest

- Iteration / date / starting SHA / dirty-tree state: 28 / 2026-11-04 / `5ad52d4` (local).
- Track and matrix row: C, priority class 1 (invalid output); T6.
- Problem and observable baseline: found while probing entry past the end of the score.
  `insertMeasureAfter` wrote `<measure>` with attributes and no note or rest, in every staff. The
  bar had no duration, nothing to select, and second voices stayed as empty lanes. The existing
  tests only counted notes, so they passed. Four new cases in
  `test/insert-measure-structure.test.ts` cover this.
- Hypothesis and bounded change: each staff of the new bar gets a whole-bar rest in its first voice
  (voice 5 on a left-hand staff) and no other voice, using the existing `buildRestEventsForSpan`.
  File: `src/score-core/commands/core-command-executor.ts`.
- Regression evidence before and after: new cases pass; `npm test` 1,385 passed; build passed;
  application `tsc` clean.
- Cross-app tests and builds: run on the iteration 24–29 stack.
- Documentation updated: this ledger.
- Decision: accepted.

## Iteration 29 — Rests typed in trailing bars stay, and rests stay in their part

- Iteration / date / starting SHA / dirty-tree state: 29 / 2026-11-04 / `73566f9` (local).
- Track and matrix row: A, priority class 1 (data loss, wrong onset, wrong target); P1, S1, owner
  request for eighths and sixteenths across voices and instruments.
- Problem and observable baseline (found while testing entry past the end of the score):
  - `pruneTrailingRestOnlyMeasuresForVoice` rewrites every rest-only bar after the last note as a
    whole-bar rest, including the bar just edited. `c d e f 0 g` lost the rest and G did not land
    on beat 2 of the next bar. This is a common way to start a bar.
  - For any voice other than 1 the same function deletes rests. A left-hand staff, whose main
    voice is stored as 5, lost its rests in every later bar.
  - `insertRest` resolved the entered rest without its part. After a rest in a later part the
    cursor jumped to the first part, and the next note went into the wrong instrument.
  - New `test/entry-rest-in-trailing-bar.test.ts`: 2/9 before.
- Hypothesis and bounded change:
  - Duration edits keep the rhythm of the edited bar (`keepMeasureRhythm`); other trailing bars
    are still rewritten.
  - The staff's lowest voice in a bar counts as its main voice and keeps a whole-bar rest. Only
    secondary voices may disappear from a bar.
  - `insertRest` and its entered locator carry the part and measure.
  - Files: `src/score-core/commands/core-command-executor.ts`, `hooks/useNoteEditor.ts`.
- Regression evidence before and after: 2/9 before, 9/9 after; `npm test` passed; build passed;
  application `tsc` clean.
- Cross-app tests and builds: run on the iteration 24–30 stack.
- Documentation updated: `docs/user-manual.en.md`, this ledger.
- Decision: accepted.

## Iteration 30 — Note commands stay in their part

- Iteration / date / starting SHA / dirty-tree state: 30 / 2026-11-04 / `3bf273a` (local).
- Track and matrix row: A and C, priority class 1 (data loss, wrong target); E2, S1, owner request
  for several and different instruments.
- Problem and observable baseline: a keyboard audit in a second part of a two-part score.
  - Accent, staccato, tenuto, marcato, stem, slash notehead, Delete, ripple delete, clear voice and
    slurs all changed the first part and left the second untouched. Delete on an oboe note deleted
    the flute's note.
  - Cause in two layers: 12 hook commands and `toggleSlur` sent no part, and the executor looked up
    22 command types plus wedges, pedals, ottavas and glissandos in the first part with that bar
    number, even when a part was given.
  - The Inspector's lyric, articulation, tie and slur commands sent no part either.
  - "Clear selected measures" looped over every part but sent unscoped deletes, so other parts were
    not cleared.
  - A bar appended by an overflowing edit (`duplicate`) had no rest in the other parts.
  - New `test/entry-second-part-audit.test.ts` covers 38 keyboard actions and 11 commands.
- Hypothesis and bounded change: the executor passes the command's scope in every lookup
  (`commandScope`), and `ensureMeasure` and `findNextNoteEvent` honour a part. The hook, Inspector
  and app send the part. Appended bars share `buildAppendedBar`. Commands without a part keep their
  first-part meaning for existing callers. Files: `src/score-core/commands/core-command-executor.ts`,
  `hooks/useNoteEditor.ts`, `components/ScoreInspector.tsx`, `components/NexNoteApp.tsx`.
- Corrected existing assertions (added strictness, nothing loosened): the exact Inspector commands in
  `test/user-visible-components.test.ts` (`setLyricLine`, `setArticulationPlacement`,
  `setTiePlacement`, `setSlurPlacement`) now include `corePartId: 'part:P1'`.
- Regression evidence before and after: audit run before the fix showed the leaks listed above; all
  cases pass after; `npm test` passed; build passed; application `tsc` clean. New browser case in
  `e2e/notation-tools.spec.ts` passes under strict Doctor.
- Found and not changed (new backlog 34): removing a text direction removes the same text from every
  part. The selection of a text does not know its part yet.
- Cross-app tests and builds: run on the iteration 24–31 stack.
- Documentation updated: this ledger.
- Decision: accepted.

## Iteration 31 — Entry past the end of the score appends a bar

- Iteration / date / starting SHA / dirty-tree state: 31 / 2026-11-04 / iteration 30 (local).
- Track and matrix row: A, priority class 1 (data loss); parity matrix.
- Problem and observable baseline: after the last position of the score the cursor stayed on the last
  note, so the next letter replaced it. MuseScore (`NoteInput::addPitch` with `is.beyondScore()`, read
  from the source) calls `appendMeasures(1)` and writes in the new bar. New
  `test/entry-beyond-score.test.ts` failed before.
- Hypothesis and bounded change: an entry with no next slot marks the input as past the end. The next
  plain letter, rest, MIDI key or `M` commit appends one bar and writes there in one command batch, so
  one Undo step. A click or navigation clears the mark, and it is re-checked against the document so
  Undo cannot leave it stale. Shift chord tones still go to the last note. File:
  `hooks/useNoteEditor.ts`.
- Regression evidence before and after: 14/14 after; `npm test` 1,458 passed; build passed; application
  `tsc` clean.
- Not tested: `T` at the very end of the score.
- Cross-app tests and builds: run on the iteration 24–31 stack.
- Documentation updated: `docs/keyboard-shortcuts.md`, `docs/user-manual.en.md`, this ledger.
- Decision: accepted.

## Iteration 32 — Text directions stay in their part

- Iteration / date / starting SHA / dirty-tree state: 32 / 2026-11-05 / `f367d72` (local). Dirty tree: the
  owner's `docs/README.md` and the untracked iteration prompt, both left alone.
- Track and matrix row: C, priority class 1 (wrong target); E7, S1. The row status stays `PARTIAL`.
- Problem and observable baseline: `removeDirection` looked at every part, so deleting a clicked text
  removed the same text in the same bar from all parts. New `test/direction-part-scope.test.ts`
  (same text in both parts, remove from either one) failed 2/2 core cases before.
- Hypothesis and bounded change: the click carries the part (`visualPartId`, taken from the clicked or
  nearest note) through `NoteClickOptions` and the visual selection into the `removeDirection` command
  (`corePartId`), and the executor skips other parts. `findDirectionByText` takes the part too. The
  command without a part keeps its old meaning for existing callers (AI operations).
  Files: `components/ScoreEditor.tsx`, `components/NexNoteApp.tsx`, `hooks/useNoteEditor.ts`,
  `src/score-core/commands/core-command-executor.ts`, `src/score-core/query/note-editor.ts`,
  `src/shared/schemas/score-command.ts`.
- Regression evidence before and after: 5/5 after; the existing `removeDirection` case in
  `test/score-architecture.test.ts` is unchanged and passes. One user action is one command batch.
- Decision: accepted.

## Iteration 33 — Multi-part audit of the remaining editing paths

- Iteration / date / starting SHA / dirty-tree state: 33 / 2026-11-05 / `63c41a8` (local). The owner's
  uncommitted docs stay untouched.
- Track and matrix row: A and C, priority class 1 (wrong target); E2, S1. The rows stay `PARTIAL`.
- Problem and observable baseline: `test/entry-second-part-audit.test.ts` covered 38 keyboard actions and
  11 commands in the second of two parts. It now also runs every keyboard action, copy, cut and paste
  (Cmd+C/X/V, and the palette's paste), keyboard and pointer range delete, additive and range pointer
  selection, pointer entry (`placeNoteAt`), repeat-last-input and the hook calls behind the Edit Palette
  and the Command Center (articulations, dynamic, slur, transpose, duplicate, delete, cut, slash fill,
  rest) against three layouts: the second of two parts, the lower staff of a grand staff (the target
  is staff 2 of a piano part, checked against its own staff 1 and the other part), and the middle part
  of three. The cursor must stay in the targeted part and staff. 202 cases; 13 failed before the fix.
- Leaks found and fixed:
  - Range operations (range delete, ripple delete of a range, transposing a range, clearing a range's
    articulations) sent locators with no part. With a range selected in the second part, the first
    part was edited too. The hook and the Inspector now put the part into both ends of the range
    (`selectionRange`, `buildSelectionRange`); the executor already honoured it.
  - The Inspector's "Toggle slur" sent no part, and `setSlurPlacement` looked up its stop note in the
    first part with that bar number, so a placement on a second-part slur missed. Both now carry
    and use the part.
- Not a leak (the test normalises it): a tuplet in one staff re-divides every staff of the same part so
  the staves share one `divisions` value. The raw timestamps of the other staff change, its musical
  times do not. The audit compares reduced fractions of a whole note. Documented in the test.
- Corrected existing assertion (added strictness, nothing loosened): the exact range command in
  `test/user-visible-components.test.ts` for the Inspector now includes `corePartId: 'part:P1'`.
- Found and not changed: the palette's Tie button needs two notes of equal pitch to change anything, so
  the audit asserts only that no other staff changes; the keyboard `T` case asserts the change.
- Regression evidence before and after: 202/202 after; `test/user-visible-components.test.ts` passes.
- Files: `hooks/useNoteEditor.ts`, `components/ScoreInspector.tsx`,
  `src/score-core/commands/core-command-executor.ts`, tests.
- Decision: accepted.

## Iteration 34 — Slurs during note input

- Iteration / date / starting SHA / dirty-tree state: 34 / 2026-11-05 / `d7bb40c` (local). The owner's
  uncommitted docs stay untouched.
- Track and matrix row: A, priority class 2 (precision, input cursor lost); E5, parity matrix.
- Problem and observable baseline: `N 4 c s d e f s` created no slur (`S` needs a selection and the
  cursor slot has none). After a `Shift+Arrow` slur over entered notes the selection stayed a range, so
  the next entry targeted its start and was rejected. New `test/entry-slur-in-input.test.ts`: 0/4 before.
- MuseScore (read from `musescore/MuseScore` main, not memory):
  - `NotationActionController::addSlur` (`notationscene/internal/notationactioncontroller.cpp`): in note
    input with an open slur it calls `resetSlur()`; otherwise `addSlurToSelection()`.
  - `NotationInteraction::doAddSlur` (`notation/internal/notationinteraction.cpp`): a range slurs
    first to last; a single note starts a slur with no end; in note input the result is stored with
    `NoteInput::addSlur`, i.e. `InputState::setSlur`.
  - `NoteInput::addPitch` (`engraving/editing/noteinput.cpp`): `if (is.slur())` the slur's end element
    becomes the note just entered. `endNoteInput` clears the slur.
  - The source does not state whether a range slur extended by later notes is intended; it follows from
    the code above, so nex-note matches the code.
- Hypothesis and bounded change: `inputSlurRef` holds the open slur (start, last end). `S` in note input
  closes it, or opens one on the note just entered, or slurs a range and opens it. `commitNoteInputUpdate`
  appends the `toggleSlur` commands (remove the previous span, add start to the new note) to the entry's
  own batch, so each note is one Undo step. A `Shift+Arrow` range remembers the cursor slot it started from
  (`rangeCursorRef`); `keepingInputCursor` restores it after an action on the range, so the next entry
  follows the last note. Both refs clear when note input ends or a note is selected.
  Files: `hooks/useNoteEditor.ts`, `test/entry-slur-in-input.test.ts`, `docs/keyboard-shortcuts.md`,
  `docs/user-manual.en.md`.
- Regression evidence before and after: 4/4 after; all `entry-*`, user-visible and note-editor tests
  (493) pass.
- Not covered: an open slur does not follow entries that jump to another part, staff or voice (they are
  skipped), and rests do not extend it. The open slur has no visual marker yet.
- Decision: accepted.

## Iteration 35 — T at the end of the score

- Iteration / date / starting SHA / dirty-tree state: 35 / 2026-11-05 / `ed7983f` (local). The owner's
  uncommitted docs stay untouched.
- Track and matrix row: A, priority class 1 (silent no-op at the end of a score); parity matrix.
- Problem and observable baseline: `T` with the note in the last position found no next slot and was
  rejected without any change. New `test/entry-tie-beyond-score.test.ts` (a note, a chord, voice 2, a rest):
  3 of 4 failed before; the rest case already did nothing, as intended.
- MuseScore (`EditTie::cmdAddTie`, `src/engraving/editing/edittie.cpp`, read from `main`): it moves the
  input position to the next slot and, `if (is.beyondScore())`, calls `score->appendMeasures(1)` and moves
  again, then adds the note there and ties to it. For a rest there is no note to tie
  (`cmdTieNoteList` only lists notes), so nothing happens.
- Hypothesis and bounded change: when `T` finds no next slot and the input is past the end
  (`beyondScoreCursor`), it reuses `enterBeyondScore` with the source chord's pitches and the ties as
  following commands, so the new bar, the notes and the ties are one batch and one Undo step. Voice 2
  gets a bar for voice 2 only. File: `hooks/useNoteEditor.ts`.
- Regression evidence before and after: 4/4 after; all `entry-*` and user-visible note-editor tests (464)
  pass; application `tsc` clean.
- Documentation updated: `docs/keyboard-shortcuts.md`, `docs/user-manual.en.md`, this ledger.
- Decision: accepted.

## Iteration 36 — Dynamics from the keyboard

- Iteration / date / starting SHA / dirty-tree state: 36 / 2026-11-05 / `25cb54a` (local). The owner's
  uncommitted docs stay untouched.
- Track and matrix row: A, priority class 2; E1, parity matrix. The row stays `PARTIAL`.
- Problem and observable baseline: backlog 31. No key entered a dynamic, so a scripted passage could not.
  `test/entry-dynamics-keyboard.test.ts` failed before (no handler for the keys).
- MuseScore (`src/app/configs/data/shortcuts.xml`, read from `main`): `add-dynamic` is `Ctrl+D`,
  `increase-dynamic` is `Alt+.`, `decrease-dynamic` is `Alt+,`. Those increase/decrease actions change an
  existing dynamic; the source does not say what they do on a note without one, so nex-note defines it
  (start from `mf`).
- Hypothesis and bounded change: `Cmd/Ctrl+D` stays Duplicate. `Alt/Option+.` and `Alt/Option+,` call the
  new `stepDynamic`, which moves the dynamic of the note just entered (note input) or of the selection one
  step along `pp p mp mf f ff fff`, one batch per press, each note in its own part. The handler matches the
  physical codes `Period`/`Comma` (identical on US, UK and German/Austrian), or the printed `.`/`,`, so
  macOS Option glyphs work. The key was free: no handler used Alt with these keys.
  Files: `hooks/useNoteEditor.ts`, `test/entry-dynamics-keyboard.test.ts`,
  `test/entry-second-part-audit.test.ts` (two more audit actions), `docs/keyboard-shortcuts.md`,
  `docs/user-manual.en.md`.
- Regression evidence before and after: new file 9/9 after (a first expectation for `Alt+,` was wrong:
  `mf` softer is `mp`, not `p`; corrected in my own new test, not an existing one); second-part audit 217
  cases pass.
- Not checked: a QWERTZ Mac with real hardware; the Option glyphs come from the handler tests, not a device.
- Decision: accepted.

## Iteration 37 — Keyboard passage 1 on US, UK and QWERTZ

- Iteration / date / starting SHA / dirty-tree state: 37 / 2026-11-05 / `38234c3` (local). The owner's
  uncommitted docs stay untouched.
- Track and matrix row: A and C, priority class 1 for the defect found, 2 for the passage; parity matrix.
- What was built:
  - `test/support/keyboard-passage.ts`: one script (`PASSAGE_1`) and the exact expected result
    (`PASSAGE_1_EXPECTED`): eight bars, treble, 4/4, mixed durations, a dotted quarter, a rest, two
    accidentals (G sharp, B flat), a tie across a barline, an eighth triplet, a three-note chord, a grace
    note, a dynamic (`f`), an accent, and a slur from bar 6 into bar 7. The expected lines were checked by
    hand against the keystrokes before they were frozen (the first run exposed the slur defect below).
  - `layoutKeyEvent` and a `layout` option for `mountEditor` in `test/support/entry-harness.ts`: each token
    becomes the `key` and `code` a real keyboard of that layout sends, taken from the tables in
    `src/score-input/keyboard-layout.ts` (US `+` is Shift+`=`; QWERTZ `+` is `BracketRight` unshifted, `-`
    is `Slash`, `/` is Shift+7, Shift+`.` types `:`), and installs that layout's map as the active layout
    context, as the browser's layout map does.
  - `test/keyboard-passage-1.test.ts`: the script runs on US, UK and QWERTZ; each must equal the fixture
    exactly with zero corrections (the script has no Delete, Backspace, Undo, Redo or Escape), and the three
    layouts must produce byte-identical MusicXML.
  - `e2e/notation-tools.spec.ts`: the same script in Chromium under strict Doctor (US layout only; Playwright
    cannot switch the physical layout), and the result equals the same fixture.
- Defect found and fixed: a slur from one bar into the next was imported as two half slurs (a start without a
  stop and a stop without a start), because `buildVoices` tracked open slurs per measure. Reopening a saved
  file therefore lost the pairing of every barline-crossing slur. Open slurs are now kept per part for the
  whole import (`openSlursByPart`). New `test/import-slur-across-barline.test.ts` (2 cases) failed before.
  File: `src/musicxml-adapter/import/import-musicxml.ts`.
- Regression evidence before and after: passage 6/6 and import 2/2 after; the browser case passes (13.8 s).
- Not covered: Mac Option glyphs and real hardware layouts; the German Mac Option+Shift+0 limit stays as
  documented. Passages 2, 3 and 4 do not exist.
- Decision: accepted.

## Gates for the iteration 24–31 stack and program stop

- Run on `7f82975`:
  - `node scripts/notation-quality-cycle.mjs --browser`: all automated groups passed; browser 97
    passed, 0 failed.
  - `npm run test:e2e:doctor`: 5 passed.
  - `npm run electron:refresh`: 1,458 tests passed; build and packaged app verified.
  - `npm run ipad:sync` and `npm run ipad:doctor`: passed.
  - Not run: physical iPad, MIDI hardware, audible playback; the Xcode macOS target does not exist.
- The owner asked to end the program here. The exit criteria are not met; see
  `docs/arrangement-completion-report.md`.
