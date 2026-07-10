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
