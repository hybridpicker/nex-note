# Mouse Note Entry — MuseScore Parity Ledger

Program prompt: [mouse-note-entry-musescore-parity-prompt.md](mouse-note-entry-musescore-parity-prompt.md).
Single source of truth for the program. A new session resumes from the iteration log.

Rules: no row is `PASS` without a behavioral test that fails before the fix and
passes after, plus the surfaces actually run. Browser/device surfaces are run by
the operator; nothing below claims them as verified.

Evidence legend: "code" = read in this repo on 2026-10-03 (`devel@461aea4`);
"handbook" = fetched 2026-10-03 from `handbook.musescore.org` (page summaries came
from a fetch-time summarizer, so exact wording must be re-checked in the audit
iteration before a row is promoted). "unsurveyed" = not yet inspected; the
current-behavior cell is a placeholder, not a finding.

## Handbook sources (fetched 2026-10-03)

- Entering notes and rests: <https://handbook.musescore.org/basics/entering-notes-and-rests>
- Selecting elements: <https://handbook.musescore.org/basics/selecting-elements>
- Editing notes and rests: <https://handbook.musescore.org/basics/editing-notes-and-rests>
- Palettes: <https://handbook.musescore.org/basics/using-the-palettes>
- Multiple voices: <https://handbook.musescore.org/basics/working-with-multiple-voices>
- Tuplets: <https://handbook.musescore.org/notation/rhythm-meter-and-measures/tuplets>
- Cross-staff: <https://handbook.musescore.org/idiomatic-notation/keyboard/cross-staff-notation>
- TAB entry: <https://handbook.musescore.org/idiomatic-notation/guitar/entering-and-editing-tablature-notation>
- Percussion entry: <https://handbook.musescore.org/idiomatic-notation/percussion/inputting-percussion-notation>

## Decisions needing the operator

1. **Click on an existing note in note-input mode.** Handbook: clicking adds to the
   chord at that position; Shift+click replaces. Nex Note: plain click replaces;
   Alt+click is chord placement; Shift+click is insert placement
   (`docs/keyboard-shortcuts.md:174-176`, `components/ScoreEditor.tsx:2685-2699`).
   This is a deliberate product difference that predates this program. Changing it
   would alter existing user workflows and the e2e suites, so it is NOT changed
   without an explicit decision. Recorded as B2 `PARTIAL`.

## Capability table

Surfaces: W = web, EM = Electron mac, EL = Electron Linux, iP = iPad, X = Xcode mac.
Surface evidence is `none` everywhere until the operator runs suites.

### A. Precision and targeting

| ID | MuseScore behavior | Current Nex Note behavior | Gap | Tests | Surfaces | Status |
| --- | --- | --- | --- | --- | --- | --- |
| A1 | Shadow note, ledger lines, accidental, clef-aware incl. 8va/8vb, transposing | Clef model is `G`/`F`/`C` + line + `octaveChange` (iteration 1: import, model, export and `topLineDiatonicIndex` now honor MusicXML `clef-octave-change`). Percussion staves now reject pointer pitch entry with `percussion-staff-pitch-entry-unsupported` (iteration 2; `isPercussionStaffAtMeasure`) instead of resolving as treble. Key-sig/measure-memory accidentals exist (parity matrix). | Transposing instruments unsurveyed; ghost on an 8vb staff not yet seen in a browser; `lib/new-score.ts` cannot create 8vb clefs | `test/clef-octave-change.test.ts` (6 tests; 5 failed before the fix), `test/staff-pitch.test.ts` | none (browser not run) | PARTIAL |
| A2 | Snap to intended rhythmic position incl. empty/partial/rests/pickup/repeats | Slot snap via `InteractiveEditMap`; atomic full-measure anchors; rest-only internal slots narrow (architecture doc) | Pickup/final measure and volta classes lack direct pointer matrix | `test/score-input-edit-map.test.ts`, `e2e/exhaustive-mouse-grid.spec.ts`, `e2e/semantic-grid-fuzz.spec.ts` | none | PARTIAL |
| A3 | Staff disambiguation; between-staves behavior | Staff hysteresis (`ghostStaffHysteresisPx`); explicit staff/voice lock unsurveyed | unsurveyed | `e2e/mouse-precision-stress.spec.ts` | none | TODO |
| A4 | Stable across zoom/view/HiDPI/resize | **Found 2026-10-03 via the operator-run zoom probe:** the zoom control, shortcuts and wheel zoom never scaled the score, because OSMD 1.9.9 ignores a `zoom` constructor option and the repo never set `osmd.Zoom` (notehead width and `viewBox` identical at 100/110/200 %). First attempt (setting `osmd.Zoom` in `initializeOsmd`) did nothing because OSMD `load()` calls `reset()` which sets zoom back to 1; fixed by setting `osmd.Zoom` after `load()` and before `render()` in `loadAndRenderOsmd`. Verified by the zoom probe: notehead 12.02 -> 13.22 px and SVG height 969 -> 1066 at 110 % (headless Chromium on Linux). Consequence: every earlier zoom-dependent result (grid specs at 75-200 %, geometry at zoom != 100) exercised the unscaled layout and must be re-run | All zoom-dependent browser evidence is invalid until re-run; forced system breaks may overflow at high zoom; HiDPI/resize unsurveyed | `e2e/exhaustive-mouse-grid.spec.ts` (invalid until re-run), `e2e/score-navigation.spec.ts` (new probe test) | none | IN PROGRESS |
| A5 | Hit-test every element class, overlap priority, px tolerance | Notes, rests and measures are selectable by click; chord symbols open an inline editor on double-click (`resolveHarmonyEditTarget`, `ScoreEditor.tsx:12872`); other visual elements go through `selectedVisual`. A per-class list, pixel tolerance and overlap priority are not yet surveyed | Per-class coverage unknown | `test/rendered-selection-target.test.ts` | none | TODO |
| A6 | Preview/commit/status/audition/export agree | Ghost bound to resolved target; `data-ghost-*` diagnostics (architecture doc) | Status text content unsurveyed | `test/smart-ghost-note.test.ts`, `e2e/snap-ghost-debug.spec.ts` | none | PARTIAL |

### B. Entering material

| ID | MuseScore behavior | Current Nex Note behavior | Gap | Tests | Surfaces | Status |
| --- | --- | --- | --- | --- | --- | --- |
| B1 | Click enters note; rest replaced; beyond-measure rules | Implemented via resolver/validator; overflow fails closed | Beyond-measure behavior differs by design (rejects) | `test/score-input-resolvers.test.ts` | none | PARTIAL |
| B2 | Click adds to chord; Shift replaces; remove chord tone | Modifiers are inverted relative to the handbook (see Decision 1). Removing one chord tone: click-select the tone, then Delete deletes only that tone (`isSingleOnsetChordVisualSelection`, `hooks/useNoteEditor.ts:1299-1318`); there is no mouse-only path because no context menu exists | Product decision; no mouse-only tone removal | `test/smart-ghost-note.test.ts`, `test/user-visible-note-editor.test.ts` | none | PARTIAL |
| B3 | 64th–longa, dots, tuplets, grace, ties, insert/overwrite | Keyboard/toolbar paths per parity matrix; mouse-only palette completeness unsurveyed | unsurveyed | `test/note-entry-advanced.test.ts` | none | TODO |
| B4 | Pre-entry accidentals, one-shot | One-shot, measure carry, respell `J` (parity matrix PASS rows) | Mouse parity evidence only via shared resolver | `test/staff-pitch.test.ts`, `e2e/notation-tools.spec.ts` | none | PARTIAL |
| B5 | Voices 1–4, color, stem direction | Cmd/Ctrl+Alt+1..4, `data-ghost-voice` | Cross-staff voice proof pending | `test/user-visible-note-editor.test.ts` | none | PARTIAL |
| B6 | Grand staff / cross-staff entry | Cross-staff move exists; drag across staves exists (`ScoreEditor.tsx:12355-12406`) | unsurveyed for ranges/warnings | `e2e/app.spec.ts` | none | PARTIAL |
| B7 | TAB fret on string line; drum pad entry | TAB fret entry follows anchors. Iteration 2: MusicXML `<unpitched>` notes were imported as rests and exported as `<rest/>` (drum parts silently lost; `<instrument>` links dropped on all notes); now preserved as opaque rest-kind events with `unpitched` display data and `afterDuration` XML, chords included. Pointer entry on percussion staves fails closed. No drum-pad or percussion-staff entry exists. | Percussion mouse entry absent; unpitched notes are modeled as rest-kind (silent in playback, not editable as notes) | `test/unpitched-percussion-roundtrip.test.ts` (5 tests; all failed before, guard test proven failing without the guard), `e2e/guitar-tab-sync.spec.ts` | none | PARTIAL |
| B8 | Meter edge cases reject atomically with reason | Atomic rejection with diagnostics | Visible reason text unsurveyed | `test/rhythm-speller.test.ts` | none | PARTIAL |

### C. Editing with the mouse

| ID | MuseScore behavior | Current Nex Note behavior | Gap | Tests | Surfaces | Status |
| --- | --- | --- | --- | --- | --- | --- |
| C1 | Click, Shift range, Ctrl list, Shift+drag rectangle, Esc | Click, Shift range, Ctrl/Cmd additive exist (measure and note); **no rubber-band/marquee** (grep: 0 hits). Handbook: Shift+drag draws a rectangle, which collides with the existing Shift+click blank-area measure range, so the design needs a drag threshold | Rectangle selection missing | `test/note-editor-selection.test.ts` | none | BLOCKED: needs an interactive browser loop to tune the drag threshold against the existing Shift+click handler (`ScoreEditor.tsx` ~13830-13960); operator to run a headed session or approve a blind implementation |
| C2 | Drag vertical for pitch, cross-staff, cancel | Drag pitch with diatonic/chromatic modes (`transpose-logic.ts:65`), pointer-capture loss cancels (architecture doc) | Handbook silent on drag modifiers: verify in live app; horizontal drag/copy unsurveyed | `test/transpose-logic.test.ts` | none | PARTIAL |
| C3 | Cut/copy/paste/duplicate/repeat, context menu | Clipboard/duplicate exist; **no `contextmenu` handler in `ScoreEditor.tsx`** | Mouse context menu missing | `test/user-visible-note-editor.test.ts` | none | TODO |
| C4 | Palette click-apply and drag-drop with drop indicator | Click-apply on the selection via `EditPalette.tsx`. **No drag-and-drop**: `onDrop`/`draggable`/`dataTransfer` have 0 hits in ScoreEditor, ScoreInputOverlay, EditPalette, NoteInputToolbar (code, 2026-10-03) | Drag-drop with drop indicator absent | `test/user-visible-components.test.ts` | none | TODO |
| C5 | Spanners via palette/drag, end handles | unsurveyed | unsurveyed | none known | none | TODO |
| C6 | Handles for stems/beams/ties/slurs/offsets | unsurveyed | unsurveyed | none known | none | TODO |
| C7 | Context menu per element | Absent (see C3) | Absent | none | none | TODO |

### D. Navigation and feedback

| ID | MuseScore behavior | Current Nex Note behavior | Gap | Tests | Surfaces | Status |
| --- | --- | --- | --- | --- | --- | --- |
| D1 | Wheel scroll, pointer-anchored zoom, pan | Iteration 3: Ctrl/Cmd+wheel captures the score point under the pointer and restores it after the async OSMD re-render (`src/score-input/zoom-anchor.ts`, `ScoreEditor.tsx`). Keyboard/button zoom is not anchored. Shift+wheel horizontal scroll. | Middle-drag pan unsurveyed; browser behavior unproven; max zoom is 300 % (prompt asks 400 %, product decision) | `test/zoom-anchor.test.ts` (math; failed before module existed), `e2e/score-navigation.spec.ts` new test (operator) | web (Linux headless Chromium, 2026-10-03): `score-navigation.spec.ts` 4/4 incl. anchored zoom | PARTIAL |
| D2 | Status line detail | Plain-language input-state summary in toolbar. Iteration 5: the ghost pitch chip's accessible label now also names MIDI number, voice, staff and measure in all five languages (`note.pitchPreviewDetail`). Beat position, duration text and concert-vs-written pitch are not in the label. | Beat/duration/concert pitch absent; visible chip text still shows only the pitch; screen-reader behavior unrun | `test/i18n.test.ts` (new test failed before the key existed), `test/user-visible-components.test.ts` | none | PARTIAL |
| D3 | Cursor shapes, color-independent voice/selection | System cursor is hidden (`cursor-none`) while a ghost or drag preview is shown, otherwise default (`ScoreEditor.tsx:16444`); no tool-specific cursor shapes. Voice-colored ghost + plain-language mode summary exist | Cursor shapes per tool absent | none known | none | PARTIAL |
| D4 | Audition on entry | Optional audition via `previewNote` when `inputAuditionEnabled` (`NexNoteApp.tsx:4761`); hanging-note cases after cancel/stop/seek/close unsurveyed | Hanging-note behavior unproven | `test/playback-cancellation.test.ts` | none | PARTIAL |
| D5 | Touch/Pencil share resolver | Shared tablet session (`tablet-entry-session.ts`) | Physical device unrun | `e2e/tablet-entry.spec.ts`, `test/tablet-entry-session.test.ts` | none | PARTIAL |

### E. Robustness

| ID | Requirement | Current Nex Note behavior | Gap | Tests | Surfaces | Status |
| --- | --- | --- | --- | --- | --- | --- |
| E1 | Zero wrong-target commits on every fixture class | Fixtures: `test/fixtures` has choir, cross-measure tie, leadsheet/repeats/volta, piano, multi-voice, and (iteration 4) `tuplet-grace-tie-transposing.musicxml`; `e2e/fixtures` has simple + guitar TAB. Import->export->import keeps every event on five fixtures (characterization, no defect found) | **No fixtures** yet for percussion pointer grids, large orchestral; pointer grid/fuzz specs do not use the new fixture | `test/mouse-fixture-roundtrip.test.ts` (passed first run; characterization, not a fix), grid/fuzz specs | none | PARTIAL |
| E2 | p95 preview ≤ 50 ms | Small-score budgets pass; medium/large missed (parity matrix, Sept 2026) | Medium/large over budget | `e2e/note-entry-performance.spec.ts` | none | PARTIAL |
| E3 | No stale ghost/duplicate commit after change | Blur/hidden cancellation, stale ghost commit rejection (architecture doc) | Undo/resize cases unsurveyed | `e2e/mouse-precision-stress.spec.ts` | none | PARTIAL |
| E4 | Keyboard parity, a11y for ghost | Keyboard entry complete; ghost preview has an `aria-label` (`note.pitchPreview`, `ScoreInputOverlay.tsx:417`) | Screen-reader behavior unrun; mouse-only operations without keyboard equivalents (rectangle select, context menu) are absent anyway | none known | none | PARTIAL |

## Gap ranking (severity order from the program prompt)

1. A1 percussion clef mapped as treble, transposing instruments (wrong pitch committed); octave-change clefs fixed in iteration 1 pending browser evidence.
2. E1 missing fixture classes (blocks proving zero wrong-target commits).
3. B7 percussion entry absent (blocked workflow).
4. C1 no rectangle selection, C3/C7 no context menu (blocked workflow).
5. D1/A4 zoom not pointer-anchored (ambiguity; targets shift under pointer).
6. Remaining `TODO` rows still need a code survey (A3, A5, B3, C4–C6, D3, D4, E4).

## Iteration log

| # | Commit | Measured | Changed | Gates run | Gates not run | Next |
| --- | --- | --- | --- | --- | --- | --- |
| 0 | (uncommitted) | Code read for A1, A4, B2, B7, C1–C3, D1, E1; handbook pages fetched | Created this ledger | `npm run apps:plan` (reported only "Changed paths: 12", no surface list) | Unit/build/e2e not applicable (docs only) | Iteration 1: A1 clef octave change, failing test first |
| 1 | 6de9ca2 | `clef-octave-change` was dropped by import and export (a tenor treble-8 staff exported as plain treble: score corruption) and ignored by the mouse pitch resolver (octave-off ghost/commit) | Model field, import, export, resolver; 6 tests, 5 failed first for the intended reason | focused tests 31/31; `node --import tsx --test test/*.test.ts` 1141/1141; `npm run build`; `git diff --check`; `npm run ipad:sync` | `npm run ipad:doctor` fails here (no Xcode, no LAN IPv4; host is Linux); `electron:refresh` not run (macOS packaging, operator); no Playwright/Electron/iPad run; the `npm test` script could not start because the `tsx` CLI's IPC socket is blocked by the sandbox, so `node --import tsx --test` was used | Operator renders a treble-8vb fixture and hovers/clicks; then A1 percussion clef, then E1 fixtures |
| 2 | c83cf79 | Drum MusicXML (`<unpitched>`, `<instrument>`) round-tripped as rests (score corruption); mouse clicks on a percussion staff resolved pitches as treble | `unpitched` + `afterDuration` model/import/export (chords too); validator guard | focused 5/5; `node --import tsx --test test/*.test.ts` 1146/1146; `npm run build`; `git diff --check` | Same as iteration 1: no browser/Electron/iPad run, `ipad:sync`/`doctor`/`electron:refresh` not re-run (no native code touched; operator should re-run on macOS); rendering of drum noteheads in OSMD after export not seen in a browser | Operator verifies a drum fixture renders; then E1 fixtures (tuplet, grace, percussion, transposing) and unsurveyed rows |
| 3 | 18bcb27 | Wheel zoom stepped without a pointer anchor; each zoom rebuilds OSMD asynchronously, so scroll must be restored after render | Pure anchor math + wiring after render; docs line | `node --import tsx --test test/*.test.ts` 1150/1150; `npm run build`; `git diff --check`; tsc on src clean | **Operator must run:** `npx playwright test e2e/score-navigation.spec.ts --project regression -g "keeps the score point under the pointer"` and paste the result; eslint not installed (npm 403), not run; iPad/Electron not re-run (shared UI change: `ipad:sync` + `ipad:doctor` + `electron:refresh` owed on macOS); touch pinch not touched | After the operator result: D1 PASS or fix; then E1 fixtures |
| 4 | d2f1829 | Fixture classes missing; probed roundtrip fidelity for tuplet, grace, cross-barline tie, 2 voices, transposing | Added `tuplet-grace-tie-transposing.musicxml`, `test/mouse-fixture-roundtrip.test.ts` (6 pass first run, no defect), surveyed C4/D3/D4/E4 | focused 6/6; full unit suite and build run in iteration 5 commit | e2e grid/fuzz not extended to the new fixture (operator run needed anyway) | Rectangle selection (C1) |
| 5 | 60c438b | Ghost chip label gave pitch only | Detail aria-label + 5-language key; C1 marked BLOCKED | `node --import tsx --test test/*.test.ts` 1157/1157; `npm run build`; `git diff --check`; tsc src clean | Screen-reader check, e2e, iPad/Electron not run; user manuals not updated (label is screen-reader-only) | Survey A3/A5/B3/B2 remainder; E2 performance |
| 6 | 4084999 | Anchored zoom test: SVG, notehead width and viewBox unchanged at 100/110/200 % (probe output from the operator), svg replaced on each change, no console errors | `osmd.Zoom = zoomPercent / 100` in `initializeOsmd` | `node --import tsx --test test/*.test.ts` 1157/1157; `npm run build`; `git diff --check` | **Operator must re-run** the zoom test and the zoom-dependent suites (`exhaustive-mouse-grid`, `mouse-precision-stress`, `snap-ghost-debug`, `manual-hover-fix`, `note-entry-quality`) because zoom now actually scales the layout and their earlier passes did not exercise it; no iPad/Electron run | After results: D1/A4 PASS or fix |
| 7 | (this commit) | Zoom-dependent suites after the zoom fix, run by the assistant at the operator's request (Linux, headless Chromium, 2026-10-03): `manual-hover-fix`, `snap-ghost-debug`, `mouse-precision-stress`, `note-entry-quality`, `exhaustive-mouse-grid` = **37 passed, 8 failed** (28.9 min) | Ledger only | See left | Failures: 6 wait for `button[title="Undo (Cmd/Ctrl+Z)"]` (tooltip text is platform-specific; this Linux build shows `Undo (Ctrl+Z)`), 1 `mouse-precision-stress` audition=false timed out reading the ghost (audition=true passed), 1 `software latency corpus large` hit its 180 s timeout. All 8 ran at 100 % zoom, where the zoom fix changes nothing (zoom 1.0), so a zoom cause is unlikely, but no pre-fix baseline was run to prove it. The 75 % and 150 % precision cases and the grid cases passed. iPad/Electron/macOS not run | Decide: fix the Linux Undo-title selector in the e2e helpers; get a baseline on the pre-zoom commit for the other 2 |

Note: two survey subagents were used; the first report never reached this session
and the second was stopped by the operator, so every "current behavior" cell above
comes from direct reads/greps, and unsurveyed cells are labeled as such.
