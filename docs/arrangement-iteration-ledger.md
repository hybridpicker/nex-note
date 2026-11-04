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
| 4 | 1 wrong pitch (*suspected*) | 8va exported as `octave-shift type="up"` | P7 | C |
| 4b | 1/2 owner request 2026-11-04 | Entry correctness matrix: eighths, sixteenths, dotted values and triplets entered by keyboard and mouse in voices 1–4, multi-voice staves, grand staff, several parts and different (including transposing) instruments; exact expected fixtures, one Undo entry per action | P1, P2, P5, parity matrix | A/B |
| 5 | 1 data loss (*suspected*) | Double dots collapse to one dot on import | P1 | C |
| 6 | 1 wrong target (*suspected*) | `addDynamic`, `setHarmonyAt`, `fillSlashMeasure`, `addWords` write to every part with the same staff index | E1, L1, L2, E7 | C |
| 7 | 1 invalid output (*suspected*) | N.C. exported as `<root-step>N</root-step>` without `<kind>` | L1 | C |
| 8 | 1 wrong onset (*suspected*) | Mid-bar chord symbols move to beat 1 on reimport | L1 | C |
| 9 | 1 corruption (*suspected*) | `setCueNote` clears `durationType` | L4 | C |
| 10 | 1 wrong data (*suspected*) | `addGuitarBend` ignores `bendSemitones`; `addGuitarTap` stores a hammer-on | L5 | C |
| 11 | 1 data loss (*suspected*) | `<multiple-rest>`, lyric `<extend>` and `<elision>` dropped on round trip | T7, L3 | C |
| 12 | 1 wrong pitch (*suspected*) | Transposing parts play back at written pitch | S2 | C |
| 13 | 1 wrong target (*suspected*) | Inserted measures clone barlines, endings and breaks | T6 | C |
| 14 | 2 precision | Scripted keyboard passage 1 (eight bars, treble) as a fixture with an exact keystroke script on three layouts | parity matrix | A |
| 15 | 2 precision | Mouse corpus: C-clef, clef change, pickup, dense multi-voice, grand staff with three ledger lines | parity matrix | B |
| 16 | 3 missing | Beaming control (break/join) | P10 | C |
| 17 | 3 missing | Score order and bracket/brace groups | S5 | C |
| 18 | 3 missing | Cue notes (model, render, export) | L4 | C |
| 19 | 3 missing | Explode/implode (after add-part in S1) | W2 | C |
| 20 | 4 partial | Key change at any measure, per part (T1); full key list | T1 | C |
| 21 | 4 partial | Remaining PARTIAL rows in matrix order | all | C |
| 22 | 5 latency | Medium/large score edit and preview budgets (`scripts/benchmark-note-entry.ts`) | parity matrix | A/B |

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
