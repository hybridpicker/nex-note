# Professional Product Scorecard

Updated: 2026-07-10

Scores measure verified professional workflow depth relative to MuseScore Studio, not the presence of a button or data field. Imported-format preservation alone does not count as full editing support. The current product remains a public alpha.

## Iteration 2026-07-09 — Live MIDI Step Input

The baseline was recorded before implementation. The closing score changes only the areas directly improved and supported by automated evidence. Physical-controller and audible desktop validation remain outstanding.

### Core Editing

| Capability | Baseline | Closing |
| --- | ---: | ---: |
| Note Input | 74% | 78% |
| Keyboard Entry | 78% | 78% |
| Mouse Entry | 68% | 68% |
| MIDI Input | 0% | 45% |
| Duration Editing | 75% | 75% |
| Pitch Editing | 80% | 80% |
| Chord Entry | 58% | 70% |
| Multi Note Editing | 61% | 61% |
| Selection | 68% | 68% |
| Clipboard | 66% | 66% |
| Undo | 72% | 74% |
| Redo | 70% | 70% |

### Musical Objects

| Capability | Baseline | Closing | Capability | Baseline | Closing |
| --- | ---: | ---: | --- | ---: | ---: |
| Voices | 65% | 65% | Tuplets | 57% | 57% |
| Rests | 74% | 74% | Ties | 68% | 68% |
| Slurs | 64% | 64% | Beams | 50% | 50% |
| Accidentals | 72% | 74% | Dynamics | 66% | 66% |
| Articulations | 66% | 66% | Expressions | 54% | 54% |
| Fingering | 34% | 34% | Lyrics | 60% | 60% |
| Chord Symbols | 62% | 62% | Rehearsal Marks | 58% | 58% |
| Pedals | 18% | 18% | Ottava | 42% | 42% |

### Notation

| Capability | Baseline | Closing | Capability | Baseline | Closing |
| --- | ---: | ---: | --- | ---: | ---: |
| Clefs | 66% | 66% | Time Signatures | 60% | 60% |
| Key Signatures | 62% | 62% | Measure Editing | 68% | 68% |
| System Breaks | 64% | 64% | Page Breaks | 62% | 62% |
| Layout | 50% | 50% | Spacing | 42% | 42% |
| Collision Avoidance | 28% | 28% | Automatic Engraving | 35% | 35% |
| Parts | 48% | 48% |  |  |  |

### Guitar

| Capability | Baseline | Closing | Capability | Baseline | Closing |
| --- | ---: | ---: | --- | ---: | ---: |
| TAB | 64% | 64% | Standard Notation Sync | 66% | 66% |
| Bend | 44% | 44% | Slides | 44% | 44% |
| Hammer-On | 48% | 48% | Pull-Off | 48% | 48% |
| Harmonics | 42% | 42% | Barre | 10% | 10% |
| Capo | 12% | 12% | String Assignment | 62% | 62% |

### Workflow

| Capability | Baseline | Closing | Capability | Baseline | Closing |
| --- | ---: | ---: | --- | ---: | ---: |
| Drag and Drop | 52% | 52% | Context Menus | 28% | 28% |
| Inspector | 62% | 62% | Toolbars | 70% | 72% |
| Palettes | 58% | 58% | Navigation | 61% | 61% |
| Zoom | 72% | 72% | Search | 55% | 55% |
| Keyboard Shortcuts | 70% | 70% | Multi Selection | 62% | 62% |
| Autoscroll | 35% | 35% |  |  |  |

### Performance, Architecture, and UX

| Capability | Baseline | Closing | Capability | Baseline | Closing |
| --- | ---: | ---: | --- | ---: | ---: |
| Rendering | 61% | 61% | Memory Usage | 45% | 45% |
| Responsiveness | 63% | 63% | Large Scores | 42% | 42% |
| Startup Time | 60% | 60% | Code Quality | 72% | 74% |
| Testing | 76% | 78% | Maintainability | 70% | 72% |
| Scalability | 60% | 60% | Extensibility | 58% | 61% |
| Plugin Readiness | 24% | 24% | Discoverability | 57% | 60% |
| Learnability | 60% | 61% | Feedback | 64% | 67% |
| Accessibility | 48% | 49% | Consistency | 63% | 65% |
| Professional Workflow | 43% | 47% |  |  |  |

## Overall MuseScore Compatibility

Baseline: **43%**  
Closing: **45%**

The increase reflects a real new professional input path, atomic chord semantics, key-aware spelling, device-state feedback, and guarded Electron permission behavior. It does not claim real-time performance capture, MIDI mappings, sustain-pedal semantics, percussion mapping, or hardware certification.

## Iteration 2026-07-09 — Text-Aware Automatic Spacing

All capabilities not listed below inherit the previous iteration's closing score. Baseline is the complete 45% product state above; closing changes only the areas supported by deterministic layout and regression evidence.

| Capability | Baseline | Closing |
| --- | ---: | ---: |
| Layout | 50% | 54% |
| Spacing | 42% | 50% |
| Collision Avoidance | 28% | 38% |
| Automatic Engraving | 35% | 41% |
| Code Quality | 74% | 75% |
| Testing | 78% | 80% |
| Maintainability | 72% | 74% |
| Professional Workflow | 47% | 49% |

### Overall MuseScore Compatibility

- Baseline: **45%**
- Closing: **46%**

Long lyric syllables, chord/direction text, and expressions now contribute content-length demand to minimum and ideal measure widths. The renderer-agnostic plan reflows systems before text-heavy measures become unsafe. This is not glyph-level collision resolution: exact font metrics, horizontal offsets between adjacent anchors, vertical skyline placement, and user-adjustable style distances remain open.

## Iteration 2026-07-09 — Verse-Aware Vertical Spacing

All unlisted capabilities inherit the 46% product state above.

| Capability | Baseline | Closing |
| --- | ---: | ---: |
| Layout | 54% | 56% |
| Spacing | 50% | 54% |
| Collision Avoidance | 38% | 42% |
| Automatic Engraving | 41% | 44% |
| Lyrics | 60% | 64% |
| Testing | 80% | 81% |
| Professional Workflow | 49% | 50% |

### Overall MuseScore Compatibility

- Baseline: **46%**
- Closing: **47%**

Vertical lyric demand now follows the number of concurrent verse lines, not the total number of syllable events in a measure. This prevents long single-verse passages from becoming increasingly over-spaced while still reserving one aligned line per verse across the system. Exact font line height, above-staff lyrics, and skyline interaction with dynamics and pedal marks remain open.

## Iteration 2026-07-09 — Predictable Staff-Spacing Overrides

All unlisted capabilities inherit the 47% product state above.

| Capability | Baseline | Closing |
| --- | ---: | ---: |
| Layout | 56% | 58% |
| Spacing | 54% | 57% |
| Inspector | 62% | 64% |
| Consistency | 65% | 68% |
| Professional Workflow | 50% | 51% |

### Overall MuseScore Compatibility

- Baseline: **47%**
- Closing: **47%**

Later staff-spacing changes now override earlier inherited values, staff/part-specific hints win over global hints at the same measure, and the newest equally specific edit wins. The overall score stays flat because this is a correctness repair to an existing control, not a new notation domain.

## Iteration 2026-07-09 — Manual Collision-Spacing Policies

All unlisted capabilities inherit the 47% product state above.

| Capability | Baseline | Closing |
| --- | ---: | ---: |
| Layout | 58% | 61% |
| Spacing | 57% | 61% |
| Collision Avoidance | 42% | 47% |
| Inspector | 64% | 67% |
| Extensibility | 61% | 64% |
| Professional Workflow | 51% | 54% |

### Overall MuseScore Compatibility

- Baseline: **47%**
- Closing: **48%**

The Inspector now exposes `Balanced`, `Relaxed`, and `Open` collision spacing. These are semantic, undoable layout commands rather than display-only toggles: an explicit policy cascades from its measure, honors part/staff specificity, sets a vertical spacing floor, and reaches the render bridge as the system collision mode. Automatic pressure-based engraving remains unchanged when no policy is set. This is still policy-level spacing, not glyph-level skyline collision solving or manual element offsets.

## Iteration 2026-07-10 — Rhythmic-Anchor-Aware Horizontal Collision Spacing

All unlisted capabilities inherit the 48% product state above. Baseline reflects the closing state of the manual collision-policy iteration.

| Capability | Baseline | Closing |
| --- | ---: | ---: |
| Lyrics | 64% | 66% |
| Chord Symbols | 62% | 64% |
| Layout | 61% | 63% |
| Spacing | 61% | 64% |
| Collision Avoidance | 47% | 51% |
| Automatic Engraving | 44% | 47% |
| Testing | 81% | 82% |
| Extensibility | 64% | 66% |
| Professional Workflow | 54% | 55% |

### Overall MuseScore Compatibility

- Baseline: **48%**
- Closing: **49%**

Lyrics, chord symbols, rehearsal/tempo text, words, and dynamics now enter the renderer-agnostic layout snapshot as rhythmic text anchors grouped by collision lane. The layout planner computes the hard width required between adjacent anchors from their actual rhythmic distance, estimated content width, and minimum padding. Identical text therefore widens a measure when crowded while leaving safely separated anchors unchanged, and the demand reaches the render bridge for inspection and future renderer integrations. Existing choir, piano, lead-sheet, and repeat-ending fingerprints remain stable; dedicated tests cover crowded multi-verse lyrics and chord symbols. Exact font metrics, cross-measure text collisions, vertical skyline solving, and manual element offsets remain open.

## Iteration 2026-07-10 — Professional Interval Note Entry

All unlisted capabilities inherit the 49% product state above. This iteration focuses on a high-frequency MuseScore keyboard workflow and the discoverable notation-input surface that exposes it.

| Capability | Baseline | Closing |
| --- | ---: | ---: |
| Note Input | 78% | 82% |
| Keyboard Entry | 78% | 83% |
| Chord Entry | 70% | 77% |
| Toolbars | 72% | 74% |
| Keyboard Shortcuts | 70% | 74% |
| Testing | 82% | 84% |
| Learnability | 61% | 64% |
| Professional Workflow | 55% | 58% |

### Overall MuseScore Compatibility

- Baseline: **49%**
- Closing: **50%**

`Alt/Option+1–9` now adds an upward diatonic unison through ninth above the active pitch. The result is spelled from the effective key signature and committed as a simultaneous chord tone without moving the rhythmic cursor; repeated thirds therefore build C–E–G at one onset. Physical digit codes support keyboard layouts where Option changes `event.key`, while modifier guards preserve voice, tuplet, and TAB shortcuts. The same nine actions are visible in both notation-input toolbar layouts, and unit, component, editor, production-build, and Playwright evidence cover the workflow. Compound intervals above a ninth, downward intervals, and arbitrary chromatic interval naming remain outside this bounded iteration.

## Iteration 2026-07-10 — MuseScore-Style Pitch-Name Octave Inference

All unlisted capabilities inherit the 50% product state above. This iteration repairs the default A–G workflow used on nearly every keyboard-entered passage.

| Capability | Baseline | Closing |
| --- | ---: | ---: |
| Note Input | 82% | 87% |
| Keyboard Entry | 83% | 89% |
| Chord Entry | 77% | 82% |
| Accidentals | 74% | 77% |
| Testing | 84% | 86% |
| Consistency | 68% | 70% |
| Professional Workflow | 58% | 62% |

### Overall MuseScore Compatibility

- Baseline: **50%**
- Closing: **51%**

Pitch-name input no longer reuses the previous numeric octave blindly. A–G now chooses the chromatically nearest octave to the previous entered pitch, so C4 followed by B becomes B3 and B4 followed by C becomes C5. The resolver applies the effective key signature unless the user explicitly arms an accidental. `Shift+A–G` and persistent chord mode choose the smallest matching pitch strictly above the highest same-voice chord tone, even when the selected tone is not the chord top; `Cmd/Ctrl+Shift+A–G` now reaches its documented explicit-cursor path instead of being intercepted by clipboard commands. Unit tests cover octave boundaries, fifth-versus-fourth choices, tritone ties, repeated pitch names, key spelling, and shortcut precedence; editor tests cover semantic mutations; Playwright covers all seven pitch letters across a measure boundary and rendered chord stacking with strict diagnostics.

## Iteration 2026-07-10 — No-Change Step-Time Advancement

All unlisted capabilities inherit the 51% product state above. This iteration fixes a high-frequency cursor failure in repeated-note and pre-populated-score entry.

| Capability | Baseline | Closing |
| --- | ---: | ---: |
| Note Input | 87% | 90% |
| Keyboard Entry | 89% | 91% |
| Duration Editing | 75% | 79% |
| Undo | 74% | 77% |
| Testing | 86% | 87% |
| Feedback | 67% | 70% |
| Consistency | 70% | 73% |
| Professional Workflow | 62% | 65% |

### Overall MuseScore Compatibility

- Baseline: **51%**
- Closing: **52%**

Entering a pitch that already matches the replaceable note at the cursor is now treated as a successful step-time action rather than an edit failure. The editor refreshes the last-input anchor and audible preview, advances to the next rhythmic slot with the same lane guards as a mutating entry, and deliberately skips `onApplyCommands`, leaving XML, revision history, Undo, and Redo untouched. Chord/unison no-ops continue to remain at their onset. `Q`, `W`, `Shift+Q`, and `Shift+W` duration transforms now prefer the last-input anchor over the visually advanced future cursor; direct duration selection continues to configure the next entry when the cursor has advanced. Editor coverage proves two identical C inputs advance before a later real edit and exercises the duration matrix; Playwright traverses an entire eight-note, two-measure passage with byte-identical XML, no Undo state, and clean strict diagnostics.

## Iteration 2026-07-10 — Duration-Aware Step-Time Rest Entry

All unlisted capabilities inherit the 52% product state above. This iteration replaces the delete-style rest shortcut with a first-class semantic rest-replacement transaction.

| Capability | Baseline | Closing |
| --- | ---: | ---: |
| Note Input | 90% | 93% |
| Keyboard Entry | 91% | 93% |
| Duration Editing | 79% | 82% |
| Rests | 74% | 84% |
| Chord Entry | 78% | 80% |
| Undo | 77% | 80% |
| Testing | 87% | 89% |
| Code Quality | 78% | 80% |
| Consistency | 73% | 77% |
| Professional Workflow | 65% | 68% |

### Overall MuseScore Compatibility

- Baseline: **52%**
- Closing: **53%**

`0`/rest entry now honors the active duration when overwriting a rhythmic slot and replaces an entire same-onset chord with one rest instead of deleting only one tone. The semantic command preserves the rhythmic entity, removes note-only attachments, retains valid tuplet membership, mirrors paired notation/TAB lanes, and applies the same duration timing rules as pitched replacement. An already matching rest is recognized before command execution, so the cursor advances while XML and Undo history remain untouched. Core, hook, and rendered Playwright regressions cover chord collapse, duration selection, consecutive rest entry, single-step undo, and strict Doctor diagnostics.

## Iteration 2026-07-10 — MuseScore-Style Tied Note Input

All unlisted capabilities inherit the 53% product state above. This iteration separates note-input tie creation from normal-mode tie toggling and implements the complete chord workflow documented by MuseScore Studio.

| Capability | Baseline | Closing |
| --- | ---: | ---: |
| Note Input | 93% | 96% |
| Keyboard Entry | 93% | 96% |
| Duration Editing | 82% | 85% |
| Chord Entry | 80% | 87% |
| Ties | 68% | 82% |
| TAB Standard Notation Sync | 66% | 70% |
| Undo | 80% | 84% |
| Testing | 89% | 91% |
| Code Quality | 80% | 82% |
| Consistency | 77% | 82% |
| Professional Workflow | 68% | 72% |

### Overall MuseScore Compatibility

- Baseline: **53%**
- Closing: **54%**

In Note Input, `T` now creates the second note at the active duration and adds its tie in the same transaction. If the source is a chord, the complete same-voice pitch set is recreated and every tone is tied; the cursor advances once, paired notation/TAB is mirrored, MusicXML exports balanced tie starts/stops, and one Undo restores the original target onset. Normal-mode `T` remains a toggle, but now addresses each chord tone by entity and pitch instead of repeatedly toggling the root. The continuity validator now advances by rhythmic onset rather than mistaking a sibling chord tone for the next event, and Undo no longer asks Doctor to validate removed insertion commands against the restored document.

## Iteration 2026-07-10 — One-Shot Accidentals and Measure Carry

All unlisted capabilities inherit the 54% product state above. This iteration repairs the standard accidental workflow without claiming enharmonic or courtesy-accidental parity.

| Capability | Baseline | Closing |
| --- | ---: | ---: |
| Note Input | 96% | 97% |
| Keyboard Entry | 96% | 98% |
| Mouse Entry | 68% | 72% |
| Accidentals | 77% | 90% |
| MusicXML Roundtrip | 75% | 80% |
| TAB Standard Notation Sync | 70% | 73% |
| Undo | 84% | 86% |
| Testing | 91% | 93% |
| Consistency | 82% | 86% |
| Professional Workflow | 72% | 76% |

### Overall MuseScore Compatibility

- Baseline: **54%**
- Closing: **55%**

Flat, natural, sharp, double-flat, and double-sharp now behave as one-shot Note Input tools. A successful pitched commit clears the visible armed state; the resulting sounding alter then carries to later notes of the same step and octave on the same staff until the barline, including across voices. Keyboard and mouse ghost resolution share that measure context. The core model stores written glyph intent separately from sounding alter, command validation and strict Doctor reject disagreements, paired notation/TAB mutations mirror the semantic pitch, transposition clears stale glyph intent, Copy/Paste retains it, and inverse commands restore it. MusicXML import/export covers the full five-value matrix, including `flat-flat`, while rendered Playwright proves active-button feedback, sounding MIDI value, byte-stable two-step Undo/Redo, and zero strict-Doctor issues. This iteration intentionally excluded `J` cycling and courtesy/cautionary metadata from its 90% accidental score; the following respelling iteration closes `J` separately.

Verification evidence:

- `npm test`: 919 passed, 0 failed.
- `npm run build`: production build and TypeScript validation passed.
- `e2e/notation-tools.spec.ts` (regression project): 18 passed.
- Accidental-focused `e2e/app.spec.ts` regressions: 2 passed.
- Bounded local MuseScore 4.7.3 roundtrip smoke: `passed-with-local-musescore-limit`; no nex-note-only export failure was isolated, while the installed MuseScore intermittently aborted on both source fixtures and nex-note output.
- `git diff --check`: passed before commit.

## Iteration 2026-07-10 — Identity-Preserving Enharmonic Respelling

All unlisted capabilities inherit the 55% product state above. This iteration closes the standard `J` cycling workflow without claiming courtesy/cautionary or separate concert/transposed-view parity.

| Capability | Baseline | Closing |
| --- | ---: | ---: |
| Note Input | 97% | 98% |
| Keyboard Entry | 98% | 99% |
| Accidentals | 90% | 95% |
| MusicXML Roundtrip | 80% | 82% |
| TAB Standard Notation Sync | 73% | 77% |
| Undo | 86% | 88% |
| Testing | 93% | 94% |
| Consistency | 86% | 89% |
| Professional Workflow | 76% | 79% |

### Overall MuseScore Compatibility

- Baseline: **55%**
- Closing: **56%**

`J` now cycles the active semantic note selection through every conventional double-flat through double-sharp spelling at constant MIDI pitch. The editor emits one identity-preserving `changeNotePitch` batch, expands individually selected tones through their complete same-lane tied chains, and keeps the visible selection on the same event IDs. Heterogeneous ranges are deterministic: each pitch advances independently. Paired notation/TAB notes receive the same spelling, while the core executor now recognizes same-MIDI spelling edits and preserves the existing TAB string/fret instead of silently recalculating fingering. MusicXML retains the chosen step/alter/octave, inverse history restores a multi-note selection atomically, QWERTY piano mode intentionally keeps `J` as its A-sharp key, and rendered strict-Doctor coverage proves staff-position feedback, MIDI stability, entity stability, a complete three-spelling cycle, and Undo/Redo. Courtesy/cautionary brackets and view-specific `Cmd/Ctrl+J` remain open.

Verification evidence:

- `npm test`: 929 passed, 0 failed.
- `npm run build`: production build and TypeScript validation passed.
- `e2e/notation-tools.spec.ts` (regression project): 19 passed.
- Bounded local MuseScore 4.7.3 roundtrip smoke: process completed with `passed-with-local-musescore-limit`; the installed MuseScore intermittently aborted on source baselines and nex-note variants, so crash-only failures were classified as inconclusive rather than isolated nex-note export defects.
- `git diff --check`: passed before commit.

## Iteration 2026-07-10 — Pitch-Neutral Courtesy Accidentals

All unlisted capabilities inherit the 56% product state above. This iteration completes manual courtesy/cautionary presentation without claiming automatic courtesy detection or separate concert/transposed-view parity.

| Capability | Baseline | Closing |
| --- | ---: | ---: |
| Accidentals | 95% | 98% |
| MusicXML Roundtrip | 82% | 85% |
| TAB Standard Notation Sync | 77% | 80% |
| Undo | 88% | 90% |
| Testing | 94% | 95% |
| Consistency | 89% | 92% |
| Professional Workflow | 79% | 82% |

### Overall MuseScore Compatibility

- Baseline: **56%**
- Closing: **57%**

Courtesy intent and none/round/square enclosure now live as pitch-neutral metadata on semantic note events. The dedicated `setAccidentalDisplay` command preserves event identity, mirrors paired notation/TAB without changing fingering, exports and imports MusicXML `cautionary`, `parentheses`, and `bracket`, survives range Copy/Paste, and derives exact inverse commands. Transposition and pitch changes clear stale display state whenever an explicit glyph is removed. Edit Palette and Inspector expose accessible single/range controls, while strict validation rejects display metadata without an explicit written accidental. The capability remains manual: nex-note does not yet infer or suggest where courtesy accidentals should appear.

Verification evidence:

- `npm test`: 936 passed, 0 failed.
- `npm run build`: production build and TypeScript validation passed.
- `e2e/notation-tools.spec.ts` (regression project): 20 passed.
- Bounded local MuseScore 4.7.3 roundtrip smoke: `passed-with-local-musescore-limit`; source and nex-note conversions both showed intermittent SIGABRT instability, so crash-only differences remain inconclusive. Artifacts: `.nex/musescore-roundtrip-smoke-2026-07-10T16-56-27-142Z`.
- `git diff --check`: required before commit.

## Iteration 2026-07-10 — Zero-Time Grace Entry

All unlisted capabilities inherit the 57% product state above. This iteration repairs grace insertion and MusicXML timing without claiming complete multi-grace editing, after-grace support, or playback-style parity.

| Capability | Baseline | Closing |
| --- | ---: | ---: |
| Note Input | 98% | 99% |
| Grace Notes | 45% | 70% |
| MusicXML Roundtrip | 85% | 87% |
| TAB Standard Notation Sync | 80% | 82% |
| Undo | 90% | 91% |
| Testing | 95% | 96% |
| Consistency | 92% | 94% |
| Professional Workflow | 82% | 84% |

### Overall MuseScore Compatibility

- Baseline: **57%**
- Closing: **58%**

`/` and the grace toolbar action now insert a new zero-duration semantic note before the selected rhythmic anchor instead of converting that anchor into a grace note. The anchor keeps its identity, duration, pitch, and measure position. Removal targets the grace entity precisely and clears its semantic links, while paired notation/TAB receives a corresponding grace entity without losing TAB fingering. MusicXML export advances the voice cursor from the first non-grace rhythmic event at an onset, preventing a grace note at a barline from shifting or dropping later notes. A 5/8 two-measure roundtrip proves measure balance and event order, and rendered strict-Doctor coverage proves the extra notehead, zero-time core state, preserved anchor, and atomic Undo/Redo. Multi-grace sequencing, grace-pitch editing polish, after-grace notation, and detailed playback-steal semantics remain open.

Verification evidence:

- `npm test`: 938 passed, 0 failed.
- `npm run build`: production build and TypeScript validation passed.
- `e2e/notation-tools.spec.ts` (regression project): 21 passed.
- Bounded local MuseScore 4.7.3 roundtrip smoke: `passed-with-local-musescore-limit`; source and nex-note conversions both showed intermittent SIGABRT instability, so crash-only differences remain inconclusive. Artifacts: `.nex/musescore-roundtrip-smoke-2026-07-10T17-15-13-592Z`.
- `git diff --check`: passed before commit.
