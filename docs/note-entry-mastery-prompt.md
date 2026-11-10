# Iteration Prompt: Note Entry Mastery

Written: 2026-11-10, against `devel@fe64f3d`.

This file is a self-contained, re-runnable prompt for an autonomous Claude Code
session in the `nex-note` repository. Start `claude` in the repository root on
branch `devel` and paste everything below the horizontal rule as the first
message. The session loops until every exit gate holds with recorded evidence.
If a session ends early (context, crash, stop), start a new one with the same
prompt: it resumes from `docs/note-entry-mastery-ledger.md`, not from memory.

It replaces Precision tracks A and B of
[arrangement-note-entry-iteration-prompt.md](./arrangement-note-entry-iteration-prompt.md).
That program ran 39 iterations and stopped with 43 of 47 rows `PARTIAL`
([completion report](./arrangement-completion-report.md)), because it tried to
finish every notation capability at once. This one has a narrower goal: the act
of entering and correcting notes must be as exact, fast and fluent as in
MuseScore Studio 4, Dorico 5 and Finale 27.

---

## Mission

You are a senior notation-software engineer and a working arranger, operating
autonomously in `nex-note` on branch `devel`. Make note entry in Nex Note
masterly. "Masterly" is defined by the nine exit gates at the end of this
prompt, and by nothing else. You work in a loop and stop only when all nine
hold with evidence, or when every remaining item is blocked on something only
the owner can provide.

The owner is not watching. Do not ask questions mid-iteration. Decide the way
the reference programs do, record the decision in the ledger, and continue.

Scope is the entry and correction workflow: orientation, keyboard entry, mouse
entry, selection, in-place editing, the markings a musician adds while entering
(dynamics, hairpins, articulations, slurs, ties, text, lyrics, chord symbols,
key, time and clef changes), speed and trust. Out of scope unless an entry
workflow here needs it: engraving options, part layout, playback quality, new
import formats, and the remaining rows of
[arrangement-feature-matrix.md](./arrangement-feature-matrix.md).

## Rules

Re-read this section after every context compaction.

- Follow `AGENTS.md`, `docs/multi-app-development-flow.md` and the global
  instructions of the machine. Run `npm run apps:plan` before programming and
  again when the scope reaches another surface.
- Every mutation goes through the semantic command, validator and history
  pipeline (`src/score-core`, `src/score-input`, `hooks/useNoteEditor.ts`,
  `hooks/useScoreDocument.ts`). No surface-specific product fork.
- Reproduce before you fix. Every item, including every seeded finding below,
  starts with an automated test that fails for the stated reason. If a finding
  does not reproduce, record that in the ledger and drop it.
- Never weaken, skip or delete an existing assertion to make a change pass.
  Never mark a row done without automated evidence. Never claim a physical
  device, audible or external-program result you did not observe.
- An unsupported action rejects atomically with visible feedback. It never
  drops a note, shifts unrelated music or leaves a half-applied batch.
- Before implementing a reference behaviour, read it in the official source
  and cite it in the ledger: the MuseScore Studio handbook
  (`handbook.musescore.org`) and source (`github.com/musescore/MuseScore`), the
  Dorico manual (`steinberg.help`), the Finale user manual. The reference
  behaviours named in this prompt were written from memory and can be wrong in
  detail.
- Standing product decision: where the three programs differ, MuseScore Studio
  4 defaults are the contract, because the existing shortcuts already follow
  them. Dorico's caret and popovers are adopted where they add to that contract
  without breaking it. Finale conventions are an optional preset only. An
  existing Nex Note behaviour that deviates stays only if a document gives a
  reason for it; otherwise it changes to the MuseScore behaviour. Record every
  such change under "Behaviour changes" in the ledger so the owner can revert
  one.
- Synthetic fixtures only. No secrets, personal data or real scores in source,
  fixtures, logs, screenshots or commits. The repository is public.
- Git: work on `devel`, one commit per accepted iteration, English message
  ending with `Co-Authored-By: Claude <noreply@anthropic.com>`, push to
  `origin/devel`, never force-push, never touch `main`, never tag. Stage only
  the iteration's files; leave unrelated changes in the tree alone.
- Run commands that can exceed two minutes in the background. Never run two
  Playwright invocations at once: they share the dev server on port 3101.
- English for code, tests, commit messages and tracking documents.

## What you are starting from

Read first, in this order: [arrangement-completion-report.md](./arrangement-completion-report.md),
[note-input-parity-matrix.md](./note-input-parity-matrix.md),
[mouse-note-entry-musescore-parity-ledger.md](./mouse-note-entry-musescore-parity-ledger.md),
[keyboard-shortcuts.md](./keyboard-shortcuts.md),
[note-input-architecture.md](./note-input-architecture.md),
[note-entry-quality-2026-09-13.md](./note-entry-quality-2026-09-13.md).

What is already strong, and must not regress: letter entry with octave
inference, one-shot accidentals with measure carry, `J` respelling, ties and
chords, tuplets from the cursor, grace notes, voices 1 to 4, the
duration-before-pitch mode `M`, MIDI step entry, QWERTZ and UK layouts,
barline splitting, atomic Undo, and the snap-locked mouse ghost with its pitch
chip and placement label.

### Seeded findings (2026-11-10)

Evidence labels: **probe** = observed that day by driving the dev server in
headless Chromium with synthetic scores (a four-bar flute score of quarter
notes, and an eight-bar empty one); **code** = read in the source; **doc** =
recorded in an existing ledger. Probe results come from single runs. Treat
each one as a lead to reproduce, in order.

**P0. Trust: wrong result, lost input or lost music**

| ID | Finding | Evidence | Reference behaviour |
| --- | --- | --- | --- |
| F1 | Undo during note input loses the cursor. After `N 5 A B C` and `Cmd/Ctrl+Z` the selection is empty; letters, `ArrowLeft`, `Backspace` and a new value plus letter all do nothing. `Esc` then `N` restarts at bar 1, beat 1, and the next letter overwrites the first note of the score | probe | The cursor returns to the position of the undone note and typing continues |
| F2 | Mouse preview and commit disagree. In an empty bar the ghost reported A4; a click at the same pointer position committed D5. Likely cause: a busy bar appears under the transport row and pushes the score canvas down about 12 px (canvas top at 162 px idle, 174 px while busy), which is more than two staff steps | probe | The committed pitch equals the last visible preview. The score never moves under a resting pointer |
| F3 | The page stopped answering after a mouse commit until the 240 s test timeout. Same symptom as the documented flake in `e2e/mouse-precision-stress.spec.ts` ("prepares audio before commit", 45 s). The dev server answered 404 for `/soundfonts/FluidR3_GM/flute-mp3.js` in that run | probe, doc | Entry never waits on audio. A missing sound costs the audition, nothing else |
| F4 | In another run, two clicks on a visible, valid ghost in an empty bar committed nothing within 700 ms each. Possibly the same cause as F3 | probe | One click, one note |
| F5 | `R` in normal mode on a selected note in a full 4/4 bar inserted a quarter rest after it; the bar's last note disappeared | probe | No music is lost. In MuseScore `R` repeats the selection |
| F6 | The default entry mode is `insert` (`hooks/useNoteEditor.ts:962`). Pasting three quarters at bar 2 pushed the following notes over the barline into bar 3 | probe, code | Overwrite is the default in all three programs; insert is an explicit mode |
| F7 | Zoom-dependent mouse evidence predates the fix that made zoom scale the score, and was only partly re-run (mouse ledger, row A4) | doc | Preview equals commit at 50 to 200 % zoom |

**P1. Speed**

| ID | Finding | Evidence | Reference behaviour |
| --- | --- | --- | --- |
| S1 | Visible edit, median / p95: 54 / 127 ms at 32 notes, 455 / 495 ms at 512 notes, 3,851 / 4,781 ms at 4,096 notes. Pointer preview at 4,096 notes: 158 / 167 ms. Measured on the dev server in September 2026 | doc | An entered note appears at once in a score of any size |
| S2 | Every edit runs the semantic command over the whole document (443 ms at 4,096 notes), then reloads and re-renders the whole OSMD score (`loadAndRenderOsmd` in `components/ScoreEditor.tsx`; no measure-range or viewport-limited rendering is used) | doc, code | Cost depends on the edited bar, not on the score |

**P2. Orientation: the user cannot see the state**

| ID | Finding | Evidence | Reference behaviour |
| --- | --- | --- | --- |
| O1 | Keyboard entry has no caret. After typing, the note just entered is blue and nothing marks where the next note will land. The `onset-caret` exists only inside the mouse ghost (`components/ScoreInputOverlay.tsx`) | probe, code | MuseScore: a voice-coloured cursor bar at the input position. Dorico: caret plus rhythmic grid |
| O2 | The armed state is invisible. The tools panel is closed by default, so after `N` nothing on screen shows the active note value, dot, accidental, voice or entry mode | probe | All three programs keep a note-input bar in view |
| O3 | Labels are cryptic or internal: `INS`, `CHD`, `STEP`, `DUR`, `LEAD`; the hover label says "Multi-voice" over an existing voice-1 note while voice 1 is active; the Inspector opens with "Phase 1 foundation: score-wide commands…" and offers only the courtesy accidental for a selected note (no value, pitch, voice, stem or visibility) | probe | Plain musical terms; properties of the selection in the inspector |
| O4 | Not established: that the input position stays in view during long entry in page and continuous view at 200 % zoom. The status line shows the position as a raw fraction (`0/16`), not as a beat | probe | The view follows the caret. The status line names bar, beat, pitch and value |

**P3. Keyboard flow**

| ID | Finding | Evidence | Reference behaviour |
| --- | --- | --- | --- |
| K1 | In normal mode `1` to `9`, `Q`, `W` and `.` do not change a selected note. They only arm the next entry value | probe, code | MuseScore changes the selected note's value |
| K2 | No diatonic step. `Alt+Shift+Up` moved D4 to D5, through the `Shift+Arrow` octave binding | probe | MuseScore: `Alt+Shift+Up/Down` moves by a scale step |
| K3 | `Backspace` in note input does not step back over the note just entered | probe | MuseScore: removes the last entered note and moves the cursor back (verify) |
| K4 | No lyric entry mode. Lyrics are typed into Inspector fields and always stored as `single` | code, doc | MuseScore `Cmd/Ctrl+L`, Dorico `Shift+L`: Space to the next syllable, `-` hyphen, `_` melisma, Down for the next verse |
| K5 | No entry at the cursor for dynamics, hairpins, tempo, key, time signature, clef, staff and system text, rehearsal marks, octave lines, repeats and barlines. Each needs a trip to the Inspector. The key list has six majors and applies to bar 1 only. Hairpins, octave lines, ornaments, tremolo, arpeggio and pedal have core commands and no user interface at all | code, doc | Dorico popovers (`Shift+D`, `T`, `K`, `M`, `C`, `X`, `R`, `B`, `O`). MuseScore: `<` and `>` hairpins, `Cmd/Ctrl+T` text at the note, palette search |
| K6 | Chord symbols: `Cmd/Ctrl+K` opens the field at one note. Not established: Space and Tab to move to the next beat and bar while typing | code | MuseScore: Space next beat, Tab next bar |
| K7 | No beam commands, no "move selection to voice n", no "exchange voices", no "select similar", no selection filter. `Cmd/Ctrl+A` selects the active voice only | code | All present in the three programs |
| K8 | No keys for inserting, appending or deleting bars | code | MuseScore `Ins`, `Cmd/Ctrl+B`, `Cmd/Ctrl+Backspace` |
| K9 | Shortcuts cannot be changed by the user | code | All three programs offer this, with conflict detection |
| K10 | Only one of four scripted keyboard passages exists | doc | n/a |

**P4. Mouse flow**

| ID | Finding | Evidence | Reference behaviour |
| --- | --- | --- | --- |
| M1 | No context menu on any score element (`onContextMenu`: 0 hits) | probe, code | Right-click menu per element type |
| M2 | No rectangle selection. `Shift`+drag did nothing | probe, code | MuseScore `Shift`+drag; Dorico marquee tool |
| M3 | Palettes apply by click only: no drag onto the score, no search. They lack the items named in K5 | code | Click, double-click and drag apply; search field |
| M4 | A plain click on an existing note in note input replaces it; chord placement needs `Alt`. The mouse ledger records this as the opposite of MuseScore and as an open owner decision | doc | Settle it under the standing decision above |
| M5 | Mouse entry rejects a value longer than the rest of the bar; the keyboard splits and ties it | doc | The same input gives the same result on both paths |
| M6 | Not surveyed: handles for the ends of slurs, hairpins, octave lines and pedal lines | doc | Draggable ends with keyboard equivalents |
| M7 | The mouse corpus matrix from the previous program was never built | doc | n/a |

Not in this program, with the reason: percussion staff entry (needs a drum-map
design; keep it failing closed as today) and the hardware gates (iPad, Apple
Pencil, MIDI device, audible playback), which only the owner can run.

## Iteration 0

1. Create `docs/note-entry-mastery-ledger.md`. Copy the seeded table into it as
   the live work queue with the columns: ID, finding, reproduction test,
   status (`open`, `reproduced`, `fixed`, `not reproduced`, `blocked`), commit.
   Add the sections "Behaviour changes", "Decisions" and "Iteration log".
2. Build the measurement tools before any fix, because the gates depend on
   them:
   - **Entry fuzzer** (`test/entry-fuzz.test.ts`): seeded random sequences of
     entry and edit actions through the real editor hook, on at least six
     fixtures (single staff, grand staff with two voices, transposing part,
     tuplets and graces, pickup bar, three parts). After every action: each
     bar of each voice sums to its meter, no event outside the addressed part,
     staff and voice changed, the cursor is defined. After each sequence: Undo
     to the start gives the starting document exactly, Redo to the end gives
     the end document exactly. A failing seed prints a minimal replay script.
   - **Browser session driver** (`e2e/support/entry-session.ts`): boots a
     fixture, sends keys and pointer actions, reads the document, the ghost
     and the caret, and saves a screenshot per step. Use it for every
     user-visible claim and for the play-throughs below.
   - **Production latency run**: `npm run build`, start the built app, and
     measure with the existing `window.__NEX_NOTE_INPUT_METRICS__` stages at
     32, 512 and 4,096 notes. Dev-server numbers do not count for gate 3.
3. Write the eight reference tasks (next section) as fixtures with their Nex
   Note key scripts and, beside each, the MuseScore Studio 4 key script for the
   same result, taken from the handbook, with both key counts.
4. Commit the ledger, the tools and the tasks before any product change.

## Reference tasks

Each has an expected fixture and is entered from an empty score of the right
shape.

| Task | Content |
| --- | --- |
| R1 | Eight bars, treble: the existing passage 1 |
| R2 | Sixteen-bar lead sheet: melody, a chord symbol on every bar or half bar including alterations and slash chords, two verses of lyrics with hyphens and one melisma, a repeat with first and second ending |
| R3 | Sixteen bars of piano in 3/4 with a pickup: two voices in the right hand, left hand, key change at bar 9, a clef change in the left hand, dynamics, two hairpins, slurs, pedal |
| R4 | Four-part transposing ensemble, eight bars: one phrase entered once, copied to the other parts, adjusted per part, viewed transposed |
| R5 | Corrections on a given sixteen-bar score: change a rhythm inside a bar, re-pitch a phrase keeping its rhythm, move a phrase one beat later, move a phrase to voice 2, delete a bar, insert two bars, change one note's value in normal mode |
| R6 | Markup pass on given notes: dynamics, hairpins, slurs, articulations, a tempo mark, a rehearsal mark, staff text |
| R7 | R1 with the mouse only: toolbar or palette for values and accidentals, clicks on the staff for notes |
| R8 | R6 with the mouse only: palettes, context menu, drag |

## The loop

One iteration is one bounded, observable improvement with its own commit.

1. **Measure.** Read the ledger. Record the commit, the tree state and the
   gate results that concern the item.
2. **Select** strictly in this order: any reproduced wrong pitch, wrong onset,
   wrong voice, wrong part, lost music, lost cursor or broken Undo (seeded P0,
   fuzzer failures, review findings); then P1; then P2; then P3; then P4.
   Within a class, pick the item that blocks the most reference tasks.
3. **Reproduce** with a failing test: a unit test for core and resolver logic,
   a browser case through the session driver for anything visible. Keep the
   failing output for the ledger.
4. **Improve** in the shared core and UI. A new command gets its keyboard path,
   its mouse path, a Command Center entry, translated labels and a tooltip that
   names the shortcut, in the same iteration.
5. **Verify.** The failing case, its suite, the fuzzer with fresh seeds,
   `npm test`, `npm run build`, `git diff --check`. For shared runtime changes
   also `npm run electron:refresh`, `npm run ipad:sync` and
   `npm run ipad:doctor`. A change that breaks another input path or surface is
   fixed or reverted inside the iteration.
6. **Record** the ledger row and log entry, `docs/keyboard-shortcuts.md` for a
   new or changed shortcut, and `docs/user-manual.en.md` for a new or changed
   behaviour.
7. **Commit and push.** Verify that local `HEAD` equals `origin/devel` and
   write the SHA into the ledger.
8. **Play through** after every fifth iteration, and whenever the queue looks
   empty: enter one reference task in the real app through the session driver,
   step by step, and look at every screenshot as a musician would. Anything
   that is wrong, slow, unclear or takes more keys than the MuseScore script
   becomes a new ledger row. The seeded list above came from forty minutes of
   this; expect it to be incomplete.
9. Continue with step 1. Do not report to the owner between iterations.

## Direction for the hard parts

**Speed (S1, S2).** The budgets in gate 3 cannot be met by tuning the full
re-render. Attack in this order and measure after each step: (1) draw the
entered note at once from the already resolved snap position, as a pending
note in the overlay, and reconcile when the real render lands, with no visible
jump; (2) limit the semantic export and the re-render to the edited bars or
system, for example with measure-range rendering or one renderer instance per
system, and reuse untouched systems; (3) render only the systems near the
viewport. The earlier rule against replacing the renderer is relaxed to this:
restructure how OSMD is driven as far as needed. If all three steps are
implemented and measured and a budget still fails, write the numbers and the
options into the ledger under "Decisions" as blocked on the owner; do not
lower the budget and do not swap the renderer on your own.

**Stability under the pointer (F2).** No status, progress or toolbar element
may change the position of the score canvas. Reserve its space or overlay it.
Add a browser test that keeps the pointer still on a ghost while the app goes
busy and idle, and asserts the same ghost pitch and the same committed pitch.

**Caret and note-input bar (O1, O2).** One caret for keyboard, mouse and MIDI
entry, drawn at the input position in the voice colour, visible from the
moment `N` is pressed, in every view and zoom, and kept in view by scrolling.
A compact bar that appears with note input and shows value, dot, accidental,
voice, entry mode and tuplet state, with every control clickable, without
opening the tools panel.

**Popovers (K4 to K6).** One shared inline-entry component anchored at the
caret or selection: opens on a key, takes typed text, shows the parsed result
before commit, `Enter` commits as one Undo step, `Esc` cancels without a trace,
Space and Tab advance where the reference programs do. Lyrics, chord symbols,
dynamics and hairpins, tempo, key, time signature, clef, text, rehearsal marks,
octave lines, repeats and barlines all use it.

## Exit gates

The loop ends only when all nine hold on the final commit and the ledger
records the evidence for each.

1. **Trust.** Every P0 row is `fixed` or `not reproduced`. The entry fuzzer
   passes 2,000 fresh seeded sequences of at least 40 actions each across its
   fixtures.
2. **Preview equals commit.** Over a mouse corpus of treble, bass, alto and
   tenor clef, clef change, pickup, dense two-voice, tuplet, grace and grand
   staff with three ledger lines, in page and continuous view at 50, 100 and
   200 % zoom: zero commits that differ from the last preview in pitch, onset,
   staff, voice or value; zero commits on hover; zero duplicates. The score
   canvas does not move while the app changes between idle and busy.
3. **Speed, production build.** Keyboard visible edit p95 at most 100 ms at 32
   and 512 notes and 150 ms at 4,096 notes. Pointer preview p95 at most 33 ms
   at all three sizes. A burst of ten keys per second for five seconds yields
   exactly the expected document, with no dropped or reordered key. Or the
   speed item is recorded as blocked on the owner as described above.
4. **Orientation.** At every step of R1 to R6 a caret marks the input position
   inside the viewport and the armed value, dot, accidental, voice and mode are
   on screen, proven by the session driver.
5. **Keyboard flow.** R1 to R6 reproduce their fixtures exactly by keys alone,
   with no pointer action and no focus in the Inspector, on US, UK and QWERTZ
   layouts. Each Nex Note script needs at most 110 % of the keys of its
   MuseScore script.
6. **Mouse flow.** R7 and R8 reproduce their fixtures exactly by pointer alone.
   Rows M1 to M6 are `fixed`.
7. **Every row closed.** No `open` or `reproduced` row remains in the ledger,
   including rows added by play-throughs and reviews. `blocked` needs a named
   thing only the owner can provide.
8. **Surfaces and exchange.** `npm test`, `npm run build`,
   `node scripts/notation-quality-cycle.mjs --browser`,
   `npm run electron:refresh`, `npm run ipad:sync`, `npm run ipad:doctor` and
   `git diff --check` pass. Every reference fixture survives MusicXML and MXL
   export and reimport unchanged. Surfaces that were not run are named with the
   reason.
9. **Independent review.** Start a fresh subagent that has none of your
   context. Give it the session driver, the reference tasks, the manual and
   this instruction: "You are a professional copyist who uses MuseScore, Dorico
   and Finale daily. Enter and correct music in this app for real. Report
   everything that is wrong, imprecise, slow, unclear or slower to do than in
   those programs, with steps to reproduce." Every finding becomes a ledger
   row. The gate holds after two consecutive rounds, each with a new subagent,
   that produce no finding of wrong result, lost input, or missing workflow.

Until all nine hold, select the next item and continue.

## Final report

When the loop ends, write `docs/note-entry-mastery-report.md`, commit and push
it, and end the session with a short message that points to it. It contains:
the state of each gate with its evidence; the latency table before and after;
the key counts of R1 to R6 beside the MuseScore counts; the list of behaviour
changes the owner may want to revert; every blocked row with what is needed;
the surfaces verified and not verified; the physical checks for iPad, MIDI
keyboard and audio as exact steps; and one line per commit.
