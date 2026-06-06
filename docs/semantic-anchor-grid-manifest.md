# Semantic Anchor Grid Manifest

## Professional Notation Editor Quality Bar

The Semantic Anchor Grid must not merely look acceptable in debug mode. It must behave like a professional notation editor input layer.

The target quality level is comparable to established score editors such as MuseScore: input zones must feel predictable, musically correct, layout-stable, and robust across the whole score.

A click inside a semantic zone must deterministically resolve to:

- the correct rendered measure
- the correct staff
- the correct voice or explicit voice ambiguity state
- the correct musical timestamp
- the correct rhythmic duration or input span
- the correct underlying OSMD/Core anchor
- the correct editing action: insert, replace, chord-add, rest-edit, or no-op

No click may succeed merely because a visual rectangle happened to be there. The rectangle must represent a real musical input opportunity.

## Professional Editor Principles

### 1. Musical Semantics First

The grid is not a visual overlay system. It is the editor's semantic input map.

Therefore:

- visual boxes are only the rendered form of musical semantics
- noteheads do not define clickable geometry
- staff overlays do not define independent X geometry
- rhythm, measure duration, and real events define horizontal input spans
- staff geometry defines only vertical ownership

If the visual grid and the musical model disagree, the model or mapping is wrong and must be fixed.

### 2. Deterministic Hit Resolution

For every mouse click or keyboard-assisted note-entry action, the editor must be able to explain exactly what was selected.

Required resolution object:

```ts
type SemanticHitResolution = {
  pageIndex: number;
  systemIndex: number;
  measureIndex: number;
  partIndex: number;
  staffIndex: number;
  voiceIndex?: number;
  voiceAmbiguity?: unknown;
  timestamp: string;
  duration: string;
  anchorId?: string;
  eventId?: string;
  inputMode: string;
  actionType: 'insert' | 'replace' | 'chord-add' | 'rest-edit' | 'no-op';
  confidence: number;
  rejectionReason?: string;
};
```

There must be no silent fallback to a nearby staff, nearby measure, or nearby anchor unless that fallback is explicitly defined and reported.

Invalid examples:

- clicking the bass staff but inserting into treble
- clicking measure 2 but modifying measure 1 or 3
- clicking a chord slot but creating a new independent notehead at the same timestamp
- clicking a protected clef/time-signature area and creating a note
- clicking a full-rest zone and resolving to an unrelated pitched anchor

### 2.1 Snap-Locked Note Input

Pointer note input is horizontally discrete. The pointer may move freely, and its X position may select the nearest legal rhythmic slot, but the visible ghost notehead and the eventual commit target must stay on the rendered snap-grid point for that slot.

Required invariant:

- every visible note-input ghost has a matching rendered snap point for its measure, staff, voice, and timestamp
- the ghost notehead X equals that snap point X within rendering tolerance
- the commit target X equals that snap point X within rendering tolerance
- if the matching snap point cannot be found, the editor shows no ghost and performs no pointer commit

Invalid examples:

- using raw pointer X as a fallback ghost position
- using raw pointer X as a fallback commit position
- accepting a semantic anchor whose timestamp has no rendered snap point
- allowing debug mode to pass while the yellow snap dot and visible ghost notehead are horizontally separated

### 3. Layout Independence

The grid must survive layout changes.

It must remain correct under:

- browser zoom
- OSMD re-render
- score resize
- different page widths
- different system breaks
- hidden or shown visual-debug overlays
- retina/high-DPI displays
- scrolling
- selected note states
- hover states
- active REPLACE bubbles

The semantic geometry must be recomputed from the rendered score/model after layout changes. It must not rely on stale DOM rectangles.

All geometry comparisons must use one normalized coordinate space. The debug report must state which coordinate space is used.

### 4. System-Start Protection

System-start protection is a professional-editor invariant.

At every rendered system start, not just measure 1, the left-side notation area is protected.

Protected notation includes:

- clef
- key signature
- time signature
- cautionary clef/signature
- any leading non-input notation before the first musical input area

The protection applies equally to:

- pitched measures
- full-rest measures
- empty-looking measures
- treble staff
- bass staff
- later systems
- reflowed systems after layout changes

A full-rest measure at a system start still has exactly one input zone, but that zone starts after the protected notation area.

System-start protection must not be derived only from the first rendered notehead. OCR or tight engraving can place that notehead visually inside the clef/key/time-signature region. The first input boundary is the later of:

```text
first real anchor X
minimum leading-notation inset
```

This prevents a too-early note or rest anchor from shortening the protected region and hiding a system-start hitbox error.

Correct:

```text
left = sharedProtectedStartX
right = measureRight
```

Incorrect:

```text
left = systemLeft
left = clefLeft
left = timeSignatureLeft
left = measureLeft including clef/time-signature area
```

### 5. Shared X Mapping, Not Blind Shared Slot Lists

Each rendered measure must have one canonical time-to-x mapping:

```text
x(t) = measureXStart + (t / measureDuration) * availableWidth
```

This mapping is shared across the grand staff. Actual slots remain event-driven per staff and voice.

Examples:

- treble has four quarter notes, bass has a full-measure rest:
  - treble gets four quarter-width slots
  - bass gets one full-measure rest slot
  - both use the same canonical time-to-x mapping
- treble and bass both have full-measure rests:
  - both get one full-width slot
  - their X edges must match exactly
- treble and bass have equivalent events at the same timestamp and duration:
  - their X edges must match exactly

The implementation must not force every staff to inherit every other staff's slot list. That would create phantom zones.

### 6. No Phantom Zones

A professional note editor must never invent clickable time merely to make a grid look regular.

Allowed slot sources:

- real note
- real rest
- real chord
- real voice event
- real OSMD/Core anchor
- real full-measure rest

Forbidden slot sources:

- visual whitespace
- optical notehead distance
- automatic quarter grid
- automatic eighth grid
- guessed missing rest
- stretched previous note
- stretched last slot without a real event reaching the end

If a rhythmic gap exists and no real event owns it, the gap must remain non-clickable and must be reported as an uncovered gap.

### 7. Boundary Linking Must Be Musical

Linked boundaries are only allowed between musically adjacent real events.

Given two slots A and B:

```text
AEnd = A.timestamp + A.duration
BStart = B.timestamp
```

If `AEnd` equals `BStart`, within exact musical Fraction tolerance:

```text
B.left = A.right
```

If `AEnd` is less than `BStart` and no real rest/event covers the gap:

```text
B.left = rawLeft
the gap remains non-clickable
the debug report records an uncovered rhythmic gap
```

The implementation must never link across a missing event just to remove a visual gap.

The last slot may snap to `measureXEnd` only if:

- `slot.timestamp + slot.duration == measureDuration`
- or the slot is a real full-measure rest/event

### 8. Chords and Overdraw

Chord tones at the same timestamp must not create stacked clickable rectangles.

A chord is one semantic time slot with multiple noteheads or anchors.

If multiple anchors resolve to the same visible rectangle, the production layer must render one clickable rectangle with metadata for all anchors.

Debug mode may expose duplicate candidates, but then it must mark them as overdraw errors using:

```css
[data-semantic-anchor-overlap-debug]
```

Darkened blue regions caused by multiple stacked boxes are invalid unless accompanied by an explicit red dashed overdraw diagnostic.

### 9. Staff Ownership Must Be Exact

The Y geometry must make staff ownership unambiguous.

For grand staff:

- upper staff boxes end at the midpoint between staff centers
- lower staff boxes start at that midpoint
- upper and lower boxes must not overlap
- a click in the upper region must not resolve to lower staff
- a click in the lower region must not resolve to upper staff

If a click occurs exactly on a staff boundary, the behavior must be deterministic and documented.

Valid examples:

- boundary click resolves to nearest staff center
- boundary click is rejected as ambiguous

Silent random resolution is not acceptable.

### 10. Voice Ambiguity Must Be Explicit

Multiple voices at the same timestamp are musically valid.

The editor must not hide ambiguity behind stacked invisible boxes.

If several voices share the same timestamp:

- the grid may expose a single visible zone
- the hit resolution must include either a chosen voice or an explicit `voiceAmbiguity` state
- chord-add versus new-voice insertion must be decided by editor mode, not by accidental DOM stacking

Identical visible hitboxes on the same staff are not allowed as production behavior.

When several voices on the same staff overlap in time, the visible input layer must still partition by real onset timestamps, not by voice duration. A long event in one voice may contribute semantic metadata to the onset, but it must not draw a full-width blue rectangle over later real onsets in another voice. The canonical visible key for overdraw prevention is:

```text
measure + staff + timestamp + rendered rect
```

Voice remains resolution metadata. It is not allowed to create a second production hitbox in the same staff-time column.

### 11. Debug Must Prove the Invariants

The debug report must not simply say `issueCount=0`. It must prove the relevant invariants.

For every rendered measure, report:

- pageIndex
- systemIndex
- measureIndex
- partIndex
- isSystemStartMeasure
- measureLeft
- measureRight
- measureXStart
- measureXEnd
- availableWidth
- measureDuration
- xStartReason
- sharedProtectedStartX
- leadingModifierRects
- slotCount
- staffCount
- hasFullMeasureRest
- firstSlotLeft
- lastSlotRight
- uncoveredGapCount
- duplicateRectCount
- overdrawCount
- verticalOverlapCount
- sharedXViolationCount
- protectedNotationOverlapCount

Required `xStartReason` values:

- `system-start-protected`
- `system-start-no-leading-modifier-detected`
- `measure-leading-modifier-protected`
- `normal-measure-left`
- `fallback`

An issue count of zero is valid only if all of these categories are checked.

### 12. Visual Debug Must Be Diagnostic, Not Decorative

When `visual-debug=true` is active:

- blue boxes show production semantic hitboxes
- red vertical guard lines show canonical measure input boundaries
- red dashed boxes show duplicate/overdraw/overlap errors
- protected clef/key/time regions should be inspectable
- system-start protection should be visually obvious

Required debug selectors:

```css
[data-semantic-anchor-debug]
[data-semantic-anchor-guard-debug]
[data-semantic-anchor-overlap-debug]
[data-semantic-anchor-protected-debug]
```

The debug layer must make it visually impossible to miss a box covering a protected clef/time-signature region.

#### Implemented Debug Report Contract

When `visual-debug=true` is active, the editor exposes the current semantic grid report on:

- `window.__NEX_NOTE_SEMANTIC_GRID__`
- `window.__NEX_NOTE_SEMANTIC_GRID_ERRORS__`

Console/browser helpers:

- `copySemanticGridDebug()` copies the complete semantic grid report.
- `showSemanticGridErrors()` opens the compact semantic-grid error panel and returns the current error summary.
- `copySemanticGridErrors()` copies the compact error summary.
- `hideSemanticGridErrors()` closes the semantic-grid error panel.

If layout errors exist, the compact panel opens automatically. The panel intentionally stays small and includes a `Copy` button so user-side browser findings can be copied directly into an issue or chat.

The error summary must include a top-level `layout` subsection:

```ts
layout: {
  issueCount: number;
  overdrawCount: number;
  protectedNotationOverlapCount: number;
  affectedMeasures: number[];
  affectedStaves: number[];
  overdraw: Array<{
    kind: 'overdraw' | 'protected-overlap' | 'protected-anchor-overlap' | 'protected-visual-overlap';
    message: string;
    measures: number[];
    staff: number;
    left: number;
    right: number;
    top: number;
    bottom: number;
    width: number;
    height: number;
    contributors: Array<{
      measure: number;
      staff: number;
      voice: number;
      timestamp: string;
      label: string;
      left: number;
      right: number;
      top: number;
      bottom: number;
    }>;
  }>;
}
```

Each red dashed visual overdraw marker must correspond to one `layout.overdraw` item. The marker carries:

- `data-semantic-anchor-overlap-debug="true"`
- `data-semantic-anchor-layout-error="overdraw"`, `data-semantic-anchor-layout-error="protected-overlap"`, `data-semantic-anchor-layout-error="protected-anchor-overlap"`, or `data-semantic-anchor-layout-error="protected-visual-overlap"`
- `data-semantic-anchor-overlap-measures`
- `data-semantic-anchor-overlap-staff`
- `data-semantic-anchor-overlap-message`

Protected-region collisions are layout errors, not secondary warnings. If a blue semantic hitbox intersects a protected clef/key/time-signature region, the report must emit a `protected-overlap` layout item and the visual layer must draw it with the same red dashed diagnostic selector used for overdraw. If the protected region intersects an actual rendered anchor or notehead, even when the production hitbox starts at the guard line, the report must emit `protected-anchor-overlap`. If the protected region intersects the full rendered event geometry, including beams, stems, flags, rests, or other non-notehead glyphs, the report must emit `protected-visual-overlap`. The compact debug panel's Layout section must count protected overlaps separately from voice/box overdraw so a system-start sliver cannot hide behind `overdraw=0`.

The visual marker is intentionally terse; the report is the source of truth for debugging details.

### 12.1 Reflow-Safe Measure Snapping

The rendered OSMD page can reflow differently at different browser widths. Therefore, any post-render measure snapping must group measures by their actual visible DOM staff row, not by stale renderer-agnostic bridge `pageIndex` or `systemIndex` values.

Required behavior:

- derive canonical measure rectangles from rendered `g.vf-measure` DOM geometry in one normalized container coordinate space
- map those rectangles back to core measure ids by visual order, staff order, and measure number
- snap adjacent barline edges only within the same visible staff row and staff index
- keep treble/bass X mapping shared for the same rendered measure, but keep Y ownership staff-local
- rerun layout overdraw diagnostics after every OSMD render, resize, and score mutation

Forbidden behavior:

- grouping barline snapping only by bridge `systemIndex`
- snapping measures across different visible systems after browser-width reflow
- using old OSMD/bridge horizontal groups after the DOM has changed
- hiding 1px/darker blue or large overdraw regions without a corresponding `layout.overdraw` report

Regression evidence for this invariant should include multiple viewport widths. The current smoke width set is:

- 760 px
- 860 px
- 980 px
- 1100 px
- 1280 px
- 1416 px
- 1536 px

At every width, `window.__NEX_NOTE_SEMANTIC_GRID__.layout.issueCount` and `layout.overdrawCount` must be `0`.

### 13. Whole-Score Acceptance

Do not validate only the first system or the currently failing E2E step.

A professional notation editor input layer must be checked across:

- first system
- later systems
- first measure of every system
- normal follow-up measures
- empty measures
- full-rest measures
- mixed rhythmic measures
- chord input measures
- bass staff input
- treble staff input
- selected and unselected states
- hover and non-hover states

Screenshots must be taken without active hover, without REPLACE bubble, and without selection artifacts unless the purpose is specifically to test active-state behavior.

Required screenshots:

- full-score clean debug screenshot
- system 1 clean debug screenshot
- later system-start clean debug screenshot
- empty-measure/full-rest screenshot
- mixed-rhythm screenshot
- chord-input screenshot
- failing E2E step screenshot

### 14. Interaction Acceptance

The grid is not accepted until actual input behavior matches the visual grid.

For representative zones, test:

- click treble full-rest zone
- click bass full-rest zone
- click first measure after clef/time-signature
- click first measure of later system
- click normal follow-up measure
- click mixed-rhythm quarter slot
- click half-note slot
- click eighth-note/chord slot
- click protected clef/time-signature area and verify no note is created
- click chord slot and verify chord-add behavior
- click lower staff in the known failing Step 8 area and verify the note lands in the bass staff/core model

For each interaction, compare:

- intended staff
- actual staff
- intended measure
- actual measure
- intended timestamp
- actual timestamp
- intended pitch/action
- actual Core result

### 15. Regression Protection

Add or update automated checks so this class of bug cannot return.

At minimum:

- unit test for system-start full-rest measure
- unit test for later-system clef protection
- unit test for full-rest no-subdivision
- unit test for mixed rhythm proportional slot widths
- unit test for chord timestamp deduplication
- unit test for no identical stacked rectangles
- unit test for staff Y non-overlap
- regression check for reflow-safe visible-row barline snapping at multiple viewport widths
- E2E assertion that clicking protected notation does not create notes
- E2E assertion that bass-staff chord input lands in bass staff

Tests should check geometry numerically, not only screenshot appearance.

### 16. Professional Failure Policy

If the implementation cannot confidently map a click to a valid semantic target, it must reject the click or report ambiguity.

It must not guess.

Wrong note entry is worse than no note entry.

A professional editor must prefer:

- no-op with diagnostic
- explicit ambiguity
- visible debug warning

over:

- silent insertion into wrong staff
- silent insertion into wrong measure
- silent chord misclassification
- silent fallback to nearest anchor

## Non-Negotiable Invalid States

The following states are professional-quality blockers:

- any blue hitbox overlaps clef/key/time-signature protected notation
- later system starts are not protected
- full-rest at system start begins before `protectedStartX`
- full-rest measure is subdivided without real events
- normal follow-up measure starts late without a protected-modifier reason
- treble and bass derive different X mapping for the same measure
- measures are snapped across different visible systems after browser-width reflow
- staff 1 and staff 2 overlap vertically
- chord tones create stacked clickable rectangles
- darkened blue overdraw appears without red dashed diagnostic
- linked boundaries stretch across missing events
- last slot is stretched to measure end without a real event reaching measure end
- click in bass staff resolves to treble staff
- click in protected notation creates a note
- debug report says `issueCount=0` while any invariant above is false

## Acceptance Standard

The Semantic Anchor Grid is only complete when all are true:

1. The debug report explicitly checks all professional invariants.
2. `issueCount=0` is meaningful because all invariant categories are included.
3. Clean screenshots across the whole score show no blue zone over protected notation.
4. Red guard lines match the intended input boundaries.
5. Full-rest measures are not subdivided.
6. Mixed rhythms are proportional by musical duration.
7. Chords produce one visible X-zone per timestamp.
8. Staff Y ownership is unambiguous.
9. Actual click/input behavior matches the visual grid.
10. The known failing bass chord-input case is either fixed or isolated with a precise Core/anchor-resolution diagnosis.

Do not consider the task finished based on visual appearance alone.

Do not consider the task finished based on `issueCount=0` alone.

Do not commit until the whole-score visual evidence and targeted interaction checks support the implementation.
