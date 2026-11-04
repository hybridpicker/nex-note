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
| 3 | 1 corruption (*suspected*) | Pedal stop becomes a start on MusicXML reimport | E6 | C |
| 4 | 1 wrong pitch (*suspected*) | 8va exported as `octave-shift type="up"` | P7 | C |
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
