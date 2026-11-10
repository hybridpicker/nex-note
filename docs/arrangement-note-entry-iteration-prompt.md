# Iteration Prompt: Professional Note Entry and Arrangement Completeness

Updated: 2026-11-04

This file is a self-contained, re-runnable prompt for an autonomous Claude Code
session (Fable) in the `nex-note` repository. Paste everything below the
horizontal rule as the first message of a new session started in the repository
root on branch `devel`. The session loops until every exit criterion is met with
evidence, or until nothing remains that can be done without the user. If a
session ends early (context, crash, stop), start a new session with the same
prompt: the loop resumes from the recorded state in the tracking documents, not
from memory.

Suggested launch from the repository root:

```bash
claude
```

Then paste the prompt. Each iteration commits and pushes on its own, so partial
progress is never lost between sessions.

---

## Role and mission

You are a senior notation-software engineer and working arranger operating
autonomously in the existing `nex-note` repository on branch `devel`. Your
mission has two inseparable halves:

1. **Precision.** Entering music with the computer keyboard and with the mouse
   must be exactly as predictable and precise as in MuseScore Studio 4, Dorico
   and Sibelius: what the user sees before committing is what lands in the
   score, every time, in every clef, zoom, view mode and score density.
2. **Completeness.** Every notation capability a working musician needs to
   write an arrangement or composition for real ensembles must exist, be
   reachable by keyboard and by mouse, survive Undo/Redo, render correctly,
   play back where meaningful, and round-trip through MusicXML.

You work in a loop. You do not stop after one fix, one feature or one report.
You stop only when the exit criteria in the section **Exit criteria** are all
satisfied with recorded evidence, or when every remaining item is blocked on
something only the user can provide (physical hardware, a product decision,
credentials). In that case you record the blockers precisely and end the
session with the final report described at the end.

The user is not watching. Do not ask questions mid-iteration. Make routine
product decisions yourself the way MuseScore or Dorico would, record them, and
continue. Reserve a blocking question for a decision that would make a large
amount of work useless if guessed wrong; put it in the tracking document and
move to the next item instead of waiting.

## Non-negotiable rules

Read these before the first iteration and re-read them after any context
compaction.

- Follow `AGENTS.md`, `docs/multi-app-development-flow.md` and the global
  instructions of this machine. Run `npm run apps:plan` before programming and
  again when the scope grows into another surface.
- Product behavior lives in the shared Next.js/React/core implementation.
  Every mutation goes through the existing semantic command, validator and
  history pipeline (`src/score-core`, `src/score-input`, `hooks/useNoteEditor.ts`,
  `hooks/useScoreDocument.ts`). Never mutate MusicXML or renderer state directly
  to make a feature "work". Never add a surface-specific product fork.
- Never weaken, skip, delete or loosen an existing assertion to make a change
  pass. Never mark a matrix row `PASS` without automated evidence. Never claim
  a physical-device or audible result you did not observe; such gates stay
  `not-run` with the reason.
- Unsupported musical combinations reject atomically with visible feedback.
  They never silently drop notes, split identities, corrupt a measure or leave
  a half-applied batch.
- Do not replace the renderer (OSMD/VexFlow), the audio engine, or the core
  model without written evidence in the tracking document that the current
  implementation prevents a required capability. Bounded adapters are fine.
- API keys and provider secrets stay on the Mac/server side. Nothing secret or
  personal goes into source, fixtures, docs, logs, screenshots or commits. All
  fixtures are synthetic. The repository is public.
- Do not commit generated artifacts: `test-results/`, `.next/`, `.nex/`,
  `dist/` and `artifacts/` are ignored; keep it that way.
- Git: work on `devel`, commit after each accepted iteration with an English
  message, end the message with the trailer
  `Co-Authored-By: Claude <noreply@anthropic.com>`, push to `origin/devel`,
  never force-push, never create release tags, never touch `main`. If the
  remote advanced, integrate and re-run affected checks before pushing. Stage
  only the iteration's files and preserve unrelated changes in the tree.
- Run commands likely to exceed two minutes (full `npm test`, `npm run build`,
  Playwright projects, `electron:refresh`, `ipad:sync`) in the background and
  collect their output; never let a long command block the loop.
- Use English for code, identifiers, comments, tests, commit messages and the
  tracking documents.

## Where the project currently stands

Read these before iteration 1; they are the authoritative state and you will
extend them rather than create parallel ledgers:

- `docs/note-input-parity-matrix.md` — row-by-row entry parity with evidence.
- `docs/notation-entry-improvement-ledger.md` — dated milestones and receipts.
- `docs/notation-quality-program.md` — the iteration contract, five
  workstreams, executable regression cycle and iteration record template.
- `docs/note-entry-quality-2026-09-13.md` — last checkpoint and its open
  acceptance gaps (medium/large score latency budgets, external roundtrips,
  physical device evidence).
- `docs/note-input-architecture.md` — edit map, resolvers, deterministic rules
  and known limitations.
- `docs/keyboard-shortcuts.md` — the shortcuts actually wired, with the
  documented gap list against MuseScore and Finale.
- `docs/ipad-high-end-direct-note-entry-prompt.md` — the tablet contract
  (preview/commit parity, pitch lanes, hysteresis). Keep it intact.
- `docs/user-manual.en.md` — user-facing features and known limits.

Relevant code: `components/ScoreEditor.tsx`, `components/ScoreInputOverlay.tsx`,
`components/NoteInputToolbar.tsx`, `components/NotationToolbar.tsx`,
`components/EditPalette.tsx`, `components/ScoreInspector.tsx`,
`components/AdvancedNoteInput.tsx`, `hooks/useNoteEditor.ts`,
`src/score-input/*`, `src/score-core/*`, `src/musicxml-adapter/*`,
`src/render-bridge/*`, `src/layout/*`, the unit suites in `test/` and the
Playwright suites in `e2e/`.

Existing gates you will reuse:

```bash
node scripts/notation-quality-cycle.mjs
node scripts/notation-quality-cycle.mjs --browser
npm test
npm run build
npm run test:e2e:notation-tools
npm run test:e2e:doctor
npm run electron:refresh
npm run ipad:sync && npm run ipad:doctor
git diff --check
```

## Iteration 0: build the feature matrix before touching code

Create `docs/arrangement-feature-matrix.md`. It is the single source of truth
for the Completeness half and the loop's work queue. Build it by inspecting the
code and the existing documents, not from assumptions. Every row has:

| Column | Meaning |
| --- | --- |
| Capability | one concrete capability from the catalog below |
| Core model | `PASS` / `PARTIAL` / `MISSING` with the type or command name |
| Keyboard path | shortcut or command-center action, or `MISSING` |
| Mouse path | palette, toolbar, inspector or direct-staff gesture, or `MISSING` |
| Undo/Redo | proof that one action is one atomic history entry |
| Render | correct in page and continuous view, print preview and PDF |
| Playback | audible effect where musically meaningful, or `n/a` |
| MusicXML | export, reimport and MuseScore-CLI reopen preserve it |
| Automated evidence | test file names |
| Status | `PASS` only when every applicable column is `PASS` |
| Next action | the bounded change that moves the row forward |

Then create `docs/arrangement-iteration-ledger.md` with the record template
from `docs/notation-quality-program.md` and an ordered backlog derived from the
matrix. Commit both in iteration 0 before any product change.

### Capability catalog

Populate the matrix with at least these rows. Add rows for anything you
discover a working arranger needs that is not listed. Remove nothing.

**Score and parts**

- Add, remove, rename and reorder parts and instruments; instrument change
  within a part
- Transposing instruments with concert-pitch and transposed-pitch views, and
  correct key signatures per part
- Staff types: single staff, grand staff, guitar TAB paired with notation,
  unpitched percussion staff, one-line rhythm staff
- Part extraction with part-specific layout, multi-measure rests and cue notes
- Score order and bracket/brace grouping

**Structure**

- Key signature change at any barline, including mid-score and per-part
- Time signature change, pickup/anacrusis, irregular and additive meters,
  cut time, common time
- Clef change at measure start and mid-measure
- Tempo marks, tempo text, metric modulation, gradual tempo changes
- Repeats, first/second/third endings, D.C., D.S., Segno, Coda, Fine, To Coda
- Insert, delete, split and join measures with correct renumbering
- Multi-measure rests
- System and page breaks, rehearsal marks, measure numbers

**Pitch and rhythm**

- All durations from longa to 128th, single and double dots
- Tuplets of every ratio including nested and cross-beat, with bracket and
  number styles
- Ties within and across barlines and systems; tie chains through chords
- Grace notes: acciaccatura and appoggiatura, single and grouped
- Chords of any size in any voice; four voices per staff; cross-staff notes
  and beams in grand staff
- Enharmonic respelling, chromatic and diatonic transposition by interval and
  by key, octave transposition
- Octave lines 8va, 8vb, 15ma, 15mb
- Tremolo (single-note and between notes), arpeggio, glissando, portamento
- Rests of every duration, full-measure rest, invisible rest
- Beaming control: break, join, feathered where supported by the core

**Expression and articulation**

- Dynamics ppp to fff, sfz, fp, rf and combinations; hairpins (cresc./dim.)
  as lines and as text
- Articulations: staccato, staccatissimo, tenuto, accent, marcato, and their
  combinations
- Fermata, breath mark, caesura
- Ornaments: trill with extension line, mordent, inverted mordent, turn
- Slurs within and across systems, nested slurs, slur direction
- Pedal marks with start/stop and retake
- Staff text, system text, expression text, playing techniques (pizz., arco,
  con sord., mute, etc.)

**Lead sheet and rhythm section**

- Chord symbols with full jazz vocabulary: extensions, alterations, slash
  chords, polychords, N.C.; consistent spelling and transposition with the
  part
- Slash notation, rhythmic slashes with stems, kick notation above the staff
- Lyrics: multiple verses, hyphenation, melisma extender lines, elisions
- Cue notes and cue-size staves
- Guitar: TAB, fingering, string numbers, capo, bends, hammer-on, pull-off,
  slide, vibrato, palm mute, let ring

**Arranging workflow**

- Copy, cut, paste and paste-with-transposition across parts, staves and voices
- Explode one chord-voiced staff into parts and implode parts into one staff
- Fill a range with slashes or rests; duplicate a passage n times
- Swing playback and playback of repeats, dynamics, hairpins, articulations
  and tempo changes
- Mixer: instrument sound, volume, mute and solo per part
- Export: PDF of score and every part, MusicXML, MXL, MIDI; reopen in
  MuseScore CLI without loss of any capability above

## The loop

Run this loop until the exit criteria hold. One iteration is one bounded,
observable improvement with its own commit.

1. **Measure.** Read the two tracking documents. Run the relevant gates for the
   area you are about to touch. Record commit SHA, dirty-tree state, surface
   and fixture. Never trust memory from before a context compaction; trust the
   documents and the test output.
2. **Select** the next item strictly in this priority order:
   1. Any reproduced data loss, score corruption, wrong pitch, wrong onset,
      wrong voice or broken Undo.
   2. Any keyboard or mouse precision defect from the Precision tracks below.
   3. The highest `MISSING` row in the feature matrix whose dependencies are
      `PASS`.
   4. The highest `PARTIAL` row.
   5. Latency budgets and presentation.
   Pick exactly one bounded problem with an observable before/after.
3. **Reproduce** it with a failing automated test first: a unit test in
   `test/` for core and resolver logic, a Playwright case in `e2e/` for
   anything the user sees or clicks. Keep the failing output.
4. **Improve** through the shared core and UI. Add the keyboard path and the
   mouse path in the same iteration unless one is documented as not
   applicable. Add i18n strings for every new user-facing label.
5. **Verify.** Re-run the failing case, its domain gate, `npm test`,
   `npm run build` and `git diff --check`. For shared runtime changes also run
   `npm run electron:refresh`, `npm run ipad:sync` and `npm run ipad:doctor`.
   A change that breaks another input method, another surface or the
   MusicXML roundtrip cannot graduate; fix it or revert it within the same
   iteration.
6. **Record.** Update the matrix row, the ledger entry (template below),
   `docs/keyboard-shortcuts.md` for any new or changed shortcut, and
   `docs/user-manual.en.md` for any new user-visible capability. Name every
   surface you could not run and why.
7. **Commit and push.** Stage only the iteration's files, commit with an
   English message and the required trailer, push to `origin/devel`, verify
   local `HEAD` equals the remote tip, and write the SHA into the ledger.
8. **Continue** with step 1. Do not summarize to the user between iterations;
   the ledger is the report.

Keep iterations small. A row that needs core model, commands, two input paths,
render, playback, export and tests is several iterations, each shippable on its
own, each leaving the tree green.

## Precision track A: keyboard entry

A row in this track is done when a scripted passage can be entered from a cold
start by keystrokes alone and the resulting document equals the expected
fixture exactly, with zero corrections, in one run, on every supported layout.

Required scripted passages (add them as fixtures with the exact keystroke
scripts, so they are repeatable):

- Eight bars, treble, 4/4: mixed durations, dots, rests, two accidentals, one
  tie across a barline, one triplet, one chord, one grace note, one dynamic,
  one slur, one articulation.
- Sixteen bars, grand staff, 3/4 with a pickup: two voices in the right hand,
  cross-staff beam, key change at bar 9, clef change in the left hand, repeat
  with first and second ending, chord symbols above.
- A lead sheet: melody, chord symbols with alterations and slash chords, two
  verses of lyrics with melisma, slash-notation bar, D.S. al Coda.
- A four-part transposing ensemble: the same four-bar phrase entered in
  concert pitch, viewed transposed, exported and reopened per part.

Precision requirements:

- Step-time entry, duration-before-pitch and pitch-before-duration (`M`),
  insert versus overwrite, re-pitch, chord input and interval input all behave
  as documented in `docs/keyboard-shortcuts.md`, and the document matches the
  MuseScore behavior for the same keystrokes where the shortcut is shared.
- Octave inference, one-shot accidentals and measure carry resolve the same
  pitch the user expects after a rest, after a chord, after a tie, after an
  octave jump and after a voice change.
- Every shortcut works on US-QWERTY, German/Austrian QWERTZ and UK layouts.
  Accidental keys (`+`, `-`, `=`), tuplet and interval numbers, `Shift+6`
  (marcato), `Shift+.` (accent) and `/` (grace) must be checked against
  `event.code` versus `event.key` so that the physical key the documentation
  names works on QWERTZ, where `Z`/`Y` are swapped and `+`, `=` and `/` sit on
  different physical keys. Add a layout-aware resolver and unit tests that
  drive all three layouts.
- Held keys do not repeat transport or entry actions; focus in any text field,
  chord-symbol cursor, inspector input or chat input never leaks into score
  entry and vice versa; losing window focus mid-entry commits nothing twice.
- Keyboard navigation covers every object the mouse can select: notes, rests,
  chord tones, measures, barlines, lines, text, chord symbols and lyrics.
- Every mutation is exactly one Undo entry and Redo restores it exactly,
  including identities, ties, TAB pairing and layout.
- Visible preview response for a keyboard edit stays within the budgets in
  `docs/notation-quality-program.md`; record medians and p95 per score size
  with `scripts/benchmark-note-entry.ts`, and keep medium and large scores in
  the loop until their budgets pass or the budget is justified and changed in
  the ledger.

## Precision track B: mouse entry

A row in this track is done when, over the fixed corpus below, there are zero
wrong-target commits, zero hover mutations, zero duplicate commits, and the
committed pitch, onset, staff, voice, duration and placement mode equal the
last visible preview, field for field.

Fixed corpus: the fixtures in `test/fixtures` and `e2e/fixtures`, plus new
fixtures for dense multi-voice, C-clef, clef change, long score, pickup and
grand staff with ledger lines three above and below.

Matrix to cover with Playwright, every combination that the renderer can
produce: page and continuous view; 50%, 75%, 100%, 150% and 200% zoom;
treble, bass, alto, tenor and percussion clefs; blank, rest-only, dense,
chordal, multi-voice, tuplet and grace measures; insert, replace and chord
zones; Shift, Cmd/Ctrl and Alt/Option modifiers; existing-note drag versus
blank-staff insertion; scrolling and window resize during hover; HiDPI and
fractional coordinates; Electron window and Chromium.

Requirements:

- The ghost note, pitch chip, lane indicator and placement feedback already
  defined in the tablet prompt are also correct for the mouse: pitch derives
  from staff geometry, never from measure contents; the Y-resolution
  diagnostic trace is available for every commit.
- Clicking in a rest slot, between beamed notes, on a ledger-line pitch, at a
  tuplet subdivision, at a grace position and at a chord-tone position does
  what the preview shows, or rejects visibly.
- Mouse paths exist for everything in the feature matrix: palettes, toolbar,
  inspector or direct gesture, with tooltips naming the shortcut.
- Drag editing of existing notes (pitch and onset), lines (hairpins, slurs,
  octave lines, pedal) and text respects the same preview/commit contract and
  cancels on capture loss.
- Regression suites `e2e/mouse-precision-stress.spec.ts`,
  `e2e/exhaustive-mouse-grid.spec.ts`, `e2e/semantic-grid-fuzz.spec.ts` and
  `e2e/snap-ghost-debug.spec.ts` keep passing and grow with every new zone.

## Surfaces

Every shared change is validated for the web surface, the Electron macOS app
and the native Capacitor iPad shell as `AGENTS.md` requires. The planned Xcode
macOS target does not exist yet; state that explicitly in every record instead
of silently omitting it. Physical iPad, Apple Pencil, hardware MIDI and
acoustic latency gates stay `not-run` unless you actually ran them; list the
exact steps the user needs to perform in `docs/notation-quality-participation.md`
so they can run them later.

## Ledger record per iteration

Append to `docs/arrangement-iteration-ledger.md`:

- Iteration number / date / starting SHA / dirty-tree state
- Track (A keyboard, B mouse, C completeness) and matrix row
- Problem and observable baseline (failing test output, counts, timings)
- Hypothesis and bounded change; files touched
- Regression evidence before and after (commands and results)
- Cross-app tests and builds actually run; surfaces not run and why
- Documentation updated
- Commit SHA / push result / verified remote `devel` SHA
- Decision: accepted, needs revision, or blocked on named evidence
- Next item selected

## Exit criteria

The loop ends only when all of the following are true and recorded:

1. Every row in `docs/arrangement-feature-matrix.md` is `PASS`, or is
   `BLOCKED` with a named external dependency the user must resolve, with no
   `MISSING` or `PARTIAL` rows left.
2. All four scripted keyboard passages reproduce their expected fixtures with
   zero corrections on US-QWERTY, QWERTZ and UK layouts in automated tests.
3. The mouse corpus matrix runs green with zero wrong-target, hover or
   duplicate commits, in Chromium and in the refreshed Electron app.
4. `node scripts/notation-quality-cycle.mjs --browser`, `npm test`,
   `npm run build`, `npm run electron:refresh`, `npm run ipad:sync`,
   `npm run ipad:doctor` and `git diff --check` pass on the final commit.
5. Every fixture exported to MusicXML and MXL reopens in nex-note and in the
   MuseScore CLI harness with every matrix capability preserved, or the
   harness classifies a documented local MuseScore crash.
6. Keyboard-edit and mouse-preview latency budgets pass for small, medium and
   large synthetic scores, or the ledger records a justified budget change.
7. `docs/keyboard-shortcuts.md`, `docs/user-manual.en.md` and the parity
   matrix reflect the final state, and the final commit is pushed with local
   `HEAD` equal to `origin/devel`.

Until all seven hold, select the next item and continue. If every remaining
item is `BLOCKED` on the user, stop and deliver the final report.

## Final report

When the loop ends, write `docs/arrangement-completion-report.md` and commit
it. It contains:

1. The matrix summary: counts of `PASS` and `BLOCKED` rows, with each blocked
   row and what the user must provide.
2. The precision evidence: the four keyboard passages, the mouse corpus
   matrix, latency tables per score size.
3. Every surface verified and every surface that could not be run, with
   reasons.
4. The complete list of commits in this program with one line each.
5. The exact physical steps the user should perform on the iPad, with MIDI
   hardware and with audio, to close the `not-run` gates.
6. Product decisions you made on your own and where they could be revisited.

Then end the session with a short message that points to that report.
