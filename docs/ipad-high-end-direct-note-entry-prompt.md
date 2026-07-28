# Implementation Prompt: High-End Direct Note Entry for iPad

Updated: 2026-07-27

## Role

You are working in the existing `nex-note` repository. Implement a production-quality, tablet-first direct note-entry interaction for standard notation staves. The result must feel predictable with a finger and excellent with Apple Pencil, while preserving the existing mouse, keyboard, MIDI, microphone, TAB, semantic command, history, validation, and MusicXML behavior.

Do not stop at a visual mockup. Implement the interaction, automated tests, diagnostics, and hardware-QA instructions. Inspect the current implementation before editing and preserve unrelated user changes.

## Product problem

The current score engine already computes a ghost note from pointer coordinates, but tablet users cannot reliably predict which pitch will be committed:

- A finger covers the staff line or space being targeted.
- A touch has no useful pre-contact hover phase on most devices.
- Direct note entry currently commits during `pointerdown`, before a touch user can see and refine the candidate.
- The overlay already formats the candidate pitch, but exposes it only through a `data-ghost-pitch` attribute instead of visible UI.
- Pitch calibration can vary according to rendered notes in the current measure. Vertical pitch selection must not change merely because a measure is empty or populated.
- The score viewport currently advertises `touch-action: pan-x pan-y`, so the browser can take over a gesture before a direct-entry refinement session is complete.

The invariant to deliver is:

> Before mutation, the user can see and optionally hear the exact pitch, onset, voice, duration, accidental, and placement mode that will be committed. The note committed on release is exactly the last stable preview target.

## Research-derived decisions

Use these interaction patterns, without copying proprietary source code:

- Sibelius for Mobile: Apple Pencil hard-press produces a shadow note; vertical movement changes pitch, horizontal movement changes rhythmic location, and lifting commits. Pencil tilt can modify accidentals and duration, but tilt is not required for this implementation.
- Symphony Pro: precise insertion uses a press-and-drag crosshair, continuously previews the note/chord, audibly previews candidate changes, and commits on release.
- MuseScore Studio: direct staff entry shows a shadow-note preview before commit. Its documentation also acknowledges ambiguity when clicks are far between adjacent staves, so explicit staff locking is required.
- Dorico for iPad: avoids much direct-touch ambiguity by using a persistent caret/rhythmic grid and an on-screen instrument panel. Preserve nex-note's existing caret and alternative input sources; this task improves the direct-staff path rather than replacing those paths.
- StaffPad: separates Pencil precision from touch navigation and uses adaptive tools to reduce clutter. Do not add handwriting recognition in this task.
- Apple Human Interface Guidelines: hover previews should help people predict the result, must not trigger actions, and should remain visually stable rather than changing meaning with hover distance.
- Precise-touch research: finger occlusion and ambiguity are reduced by a non-occluded callout, take-off selection, and continuous visual feedback.

Primary references:

- https://resources.avid.com/SupportFiles/Sibelius/2025.10/Using_Sibelius_for_mobile.pdf
- https://kb.avid.com/pkb/articles/en_US/How_To/How-to-use-my-Apple-Pencil-in-Sibelius-for-iPad
- https://symphonypro.net/manual
- https://handbook.musescore.org/de/basics/entering-notes-and-rests
- https://www.steinberg.help/r/dorico-for-ipad/6.1/en/dorico/topics/write_mode/write_mode_note_input/write_mode_note_input_inputting_notes_t.html
- https://developer.apple.com/design/human-interface-guidelines/apple-pencil-and-scribble
- https://developer.apple.com/documentation/UIKit/adopting-hover-support-for-apple-pencil
- https://webkit.org/blog/16301/webkit-features-in-safari-18-2/
- https://webkit.org/blog/17640/webkit-features-for-safari-26-2/
- https://projects.csail.mit.edu/hci-reading/papers/chi2007-vogel.pdf

## Scope

Implement:

1. Predictive Apple Pencil hover where supported.
2. Press-drag-release direct entry for Pencil and touch.
3. A stable shadow note, pitch label, pitch lane indicator, and finger-safe pitch loupe.
4. Optional, rate-limited audible preview when the stable candidate pitch changes.
5. Deterministic vertical pitch lanes derived from staff geometry.
6. Staff locking and hysteresis that prevent accidental jumps.
7. Exact preview/commit parity.
8. Automated unit, component, and Playwright coverage.
9. A concise physical-iPad QA checklist.

Do not implement:

- Music handwriting recognition.
- A general notation-toolbar redesign.
- A replacement score renderer.
- A new semantic mutation path.
- Pencil tilt, squeeze, barrel roll, or double-tap as required controls.
- Destructive hover actions.
- A native iOS bridge unless feature detection and physical-device evidence prove that the WKWebView Pointer Events path is insufficient.

## Preserve the existing architecture

The existing pipeline remains authoritative:

1. Pointer coordinates and rendered geometry produce a ghost candidate.
2. `InteractiveEditMap` and `resolvePointerEditTarget(...)` bind it to a validated `ResolvedEditTarget`.
3. The visible preview carries that exact resolved target.
4. `onPlaceNoteAt(...)` commits through the existing command/history pipeline.

Do not create a tablet-only command executor or mutate MusicXML directly.

Relevant files include:

- `components/ScoreEditor.tsx`
- `components/ScoreInputOverlay.tsx`
- `src/score-input/staff-pitch.ts`
- `src/score-input/pointer-resolver.ts`
- `src/score-input/pointer-entry-mode.ts`
- `src/score-input/smart-ghost-note.ts`
- `src/score-input/edit-map.ts`
- `app/globals.css`
- `components/NexNoteApp.tsx`
- the current note-input unit and Playwright suites

Prefer extracting the new pointer-session state machine into a small pure module such as:

- `src/score-input/tablet-entry-session.ts`

Keep rendering and event wiring in React, but keep transition rules pure and directly testable.

## Required interaction model

### Input-type matrix

| Input | Preview | Refinement | Commit |
| --- | --- | --- | --- |
| Mouse/trackpad | Existing hover ghost | Move pointer before click | Preserve current click behavior |
| Apple Pencil with hover | Shadow note and pitch chip before contact | Contact and drag in X/Y | Pointer up |
| Apple Pencil without hover | Shadow note and loupe immediately on contact | Drag in X/Y | Pointer up |
| Finger | Shadow note and offset loupe immediately on contact | Drag in X/Y | Pointer up |

Hover must never commit.

For touch and Pencil, `pointerdown` starts a prospective entry session and must not mutate the score. `pointerup` commits the session's last stable, validated target. `pointercancel`, lost capture, Escape, mode exit, invalid target, or leaving the permitted capture area cancels without mutation.

Do not require a long-press delay. A tap commits on release; holding and dragging simply gives the user time to refine the same prospective action.

Existing-note selection and existing-note drag must retain priority over blank-staff insertion unless explicit chord/insert intent already says otherwise.

### Prospective entry state machine

Model at least:

- `idle`
- `hovering`
- `contact-preview`
- `refining`
- `committing`
- `cancelled`

The session owns:

- pointer ID and pointer type
- initial and latest client/DOM coordinates
- initial staff identity
- initial resolved rhythmic slot
- stable pitch lane
- last validated ghost target
- last validated `ResolvedEditTarget`
- whether X refinement has intentionally activated
- whether the candidate has moved
- the last audibly previewed pitch and preview timestamp

Use pointer capture for contact sessions.

### Take-off selection

This is mandatory:

- Resolve and display a candidate on pointer down.
- Update the candidate during captured pointer moves.
- On pointer up, commit the last stable preview target.
- Do not recompute a different semantic target from release jitter.
- If there is no stable validated preview target, do not commit.

This provides a visible correction window and ensures that preview and result cannot diverge.

## Deterministic pitch-lane model

Pitch must be derived from the rendered staff, not from the notes currently present in a measure:

```text
halfStepPx = lineDistanceDom / 2
rawStaffStep = (pointerY - topLineDomY) / halfStepPx
staffStep = round(rawStaffStep)
snappedY = topLineDomY + staffStep * halfStepPx
pitch = resolveStaffStepPitch(staffStep, activeClef)
```

Requirements:

- `StaffDetail.topLineDomY`, `lineDistanceDom`, `lineCount`, staff identity, and the effective clef are the canonical Y source.
- The same staff, Y coordinate, clef, zoom, and layout must produce the same diatonic pitch whether the measure is empty, contains rests, or contains pitches.
- Existing rendered-note samples may be used only to validate or correct a staff-wide geometry offset during layout construction. They must not switch the runtime pitch algorithm based on measure contents.
- Remove runtime dependence on arbitrary notehead bounding-box medians for the normal direct-entry lane.
- Do not impose a hard minimum pitch-lane size that contradicts the actual rendered `halfStepPx`.
- Preserve current accidental resolution from key signature, measure carry, and an explicitly armed accidental.
- Show ledger lines for the candidate before commit.
- Add a Y-resolution diagnostic trace with raw Y, top-line Y, half-step size, raw and stable staff step, clef, staff ID, resolved pitch, and whether hysteresis held the previous lane.

If the canonical staff geometry is wrong, fix or harden that geometry source. Do not hide incorrect geometry with content-dependent pitch guessing.

## Stability and hysteresis

### Vertical lane hysteresis

Initial contact chooses the nearest lane. Store the contact-to-lane-center offset so the candidate does not jump as soon as movement begins.

After initial selection:

- Keep the current pitch until the effective pointer crosses an adaptive boundary beyond the lane midpoint.
- Use a Schmitt-trigger-style threshold based on the actual `halfStepPx`.
- Add a small pointer-type-specific noise floor for touch, without making adjacent lanes unreachable at low zoom.
- Once the stable lane changes, update the ghost, label, loupe, diagnostics, and audible preview together.

Do not debounce visual movement with a noticeable time delay. Stabilize spatially, not temporally.

### Horizontal intent hysteresis

Pitch refinement must not accidentally change the rhythmic onset because a finger drifts sideways.

- Lock X to the initial resolved slot at contact.
- Activate horizontal refinement only after intentional horizontal movement exceeds an adaptive threshold derived from rendered rhythmic-slot spacing, with a sensible CSS-pixel floor.
- After X refinement activates, resolve through the existing rendered ghost grid and edit map.
- Keep X and Y independently adjustable after intentional X movement.
- Show the resolved onset with a thin vertical caret/crosshair.

### Staff locking

- Lock the session to the staff chosen on pointer down.
- Keep that staff while the pointer remains inside its expanded capture region.
- Switch staff only after crossing the midpoint toward another staff plus explicit hysteresis.
- When switching, pulse or otherwise clearly animate the staff/pitch preview once.
- Never jump between the upper and lower staves of a grand staff from minor vertical jitter.
- An invalid cross-staff drag cancels or holds the last valid target; it must not commit to an unrelated staff.

## Visual feedback

Extend `ScoreInputOverlay`, reusing the existing engraved ghost glyph and voice palette.

### Always-visible pitch chip

The overlay already computes a pitch string. Render it visibly:

- Use musical accidentals: `♭`, `♯`, `♮`, `𝄫`, `𝄪`, not ASCII `b`, `#`, `bb`, or `x`.
- Include octave, for example `F♯4`.
- Keep the chip close to the shadow note for hover/mouse/Pencil.
- Position adaptively so it does not cover the notehead, clef, or screen edge.
- The label must update atomically with the ghost.

### Pitch lane indicator

Show a subtle horizontal highlight centered on the selected line/space near the candidate. It must:

- Make line-versus-space selection obvious.
- Stay visually subordinate to the score.
- Follow the actual snapped Y position.
- Avoid obscuring existing notation.

### Finger-safe pitch loupe

During finger contact, and optionally during Pencil contact when hover is unavailable, show a non-occluded callout:

- Place it above and offset from the contact point; flip below or to the other side near viewport edges.
- Render a magnified mini-staff centered on the stable candidate.
- Show the same engraved candidate note, ledger lines if needed, and the pitch chip.
- Optionally show the immediately adjacent pitch above and below as faint guides.
- Keep the callout stable; do not scale or change semantic meaning with Pencil hover distance.
- Hide it after commit/cancel.

Use test IDs and semantic data attributes:

- `data-testid="pitch-loupe"`
- `data-testid="pitch-chip"`
- `data-tablet-entry-phase`
- `data-preview-pointer-type`
- stable pitch, staff, timestamp, voice, and placement attributes

### Placement feedback

Preserve the existing insert/replace/chord and voice color feedback. The overlay must make the following unambiguous before release:

- pitch
- rhythmic slot
- active voice
- duration and dot
- accidental
- insert/replace/chord

Do not display internal abbreviations such as `INS`, `OVR`, or `CHD` in the loupe. Use localized user-facing labels or icons.

## Audible preview

Wire a non-mutating preview callback from `NexNoteApp`/playback into the prospective session.

- Trigger only when the stable candidate sounding pitch changes.
- Do not retrigger from pointer noise inside the same lane.
- Rate-limit rapid scrubbing and stop/reuse the previous preview voice so notes do not accumulate.
- Keep the UI responsive; audio loading must not block visual preview.
- Respect an existing or new user preference for input audition.
- Do not add score history entries or alter playback cursor state.
- If audio is unavailable, visual entry remains fully functional.

## Touch and scrolling behavior

The browser must not cancel a captured note-entry refinement in favor of page scrolling.

Implement an explicit score gesture policy for active note input:

- Pencil contact performs direct note entry.
- One-finger direct entry follows the interaction above when finger entry is enabled.
- Two-finger gestures remain available for navigation/zoom, or provide an equally discoverable navigation gesture.
- Outside note input, preserve normal one-finger score panning.
- Do not globally disable standard gestures for the entire application.

Because `touch-action` is decided at gesture start, changing it only after `pointerdown` is insufficient. Design the score input surface and gesture ownership accordingly. Use `pointerType` and feature detection, not user-agent sniffing.

Use coalesced events where available for smooth movement, but resolve only the most recent relevant point per animation frame. Fractional Pointer Event coordinates should be preserved.

## Apple Pencil hover

Use web Pointer Events first:

- Detect capability rather than assuming a specific iPad model.
- Restrict the rich pre-contact preview to `pointerType === "pen"` when possible.
- A hover move with no pressed buttons can update the prospective ghost but cannot mutate.
- Contact transitions the existing hover candidate into the captured contact session without a visual jump.
- Ignore hover height for semantic selection. It may influence opacity subtly only if that does not make the preview distracting.
- Do not require `altitudeAngle`, `azimuthAngle`, pressure, tilt, or hover support for core entry.

The Capacitor app runs in WKWebView. Validate the web path on physical hardware. Add a native `UIHoverGestureRecognizer` bridge only if physical evidence shows that required Pencil hover data is unavailable or unreliable in the supported WKWebView runtime. If a native bridge is added, keep the same web state-machine contract and document the fallback.

## Performance requirements

- No score mutation during hover/contact preview.
- No full MusicXML regeneration on pointer move.
- No full score rerender on pointer move.
- Process visual pointer updates at most once per animation frame.
- Keep the overlay within one frame of the latest stable pointer candidate under normal load.
- Cache staff pitch-grid geometry per rendered layout revision.
- Invalidate the cache only when layout, zoom, view mode, score geometry, or relevant clef/staff data changes.
- Avoid React state churn for raw coalesced samples; store raw session data in refs and publish only stable candidate changes.

## Accessibility and preferences

- The pitch chip must remain readable at normal iPad viewing distance.
- Respect reduced-motion preferences.
- Do not rely on color alone for voice or placement meaning.
- Add localized strings for pitch preview, insert/replace/chord, and input-audition preference.
- Avoid an ARIA live announcement on every scrubbed lane. If announcements are added, announce only a settled/committed candidate or throttle them heavily.
- Preserve full keyboard-only note entry.

## Tests

### Pure unit tests

Add tests for:

- every prospective-session state transition
- hover never committing
- pointer down for touch/Pencil not committing
- pointer up committing exactly the last stable preview target
- pointer cancel/lost capture/mode exit committing nothing
- release jitter not changing the committed target
- vertical lane hysteresis near every line/space boundary
- initial grab offset preventing a first-move jump
- horizontal slot lock during vertical pitch refinement
- intentional X movement activating rhythmic refinement
- staff lock and explicit staff switching
- pitch label formatting with all supported accidentals
- blank and populated measures resolving the same pitch at the same staff/Y
- treble, bass, alto/tenor C clefs and clef changes
- key signatures and measure accidental carry
- ledger-line pitches above and below the staff
- zoom-dependent geometry without a hardcoded pitch-step distortion

### Component tests

Verify:

- visible `pitch-chip`
- contact-only `pitch-loupe`
- correct placement label and voice marker
- adaptive loupe edge placement
- no loupe in ordinary mouse hover
- reduced-motion behavior
- test/data attributes match the rendered ghost

### Playwright tests

Add a dedicated tablet entry spec. Use Pointer Events with `pointerType: "touch"` and `"pen"` where Playwright supports them; use explicit DOM event construction when needed.

Required scenarios:

1. Touch `pointerdown` shows ghost/chip/loupe and leaves the document unchanged.
2. Moving vertically changes the visible pitch by exact diatonic lanes.
3. Moving vertically with small horizontal drift preserves the onset.
4. Moving intentionally horizontally changes the onset only after threshold.
5. `pointerup` commits exactly `data-ghost-pitch`, timestamp, voice, and mode from the last preview.
6. `pointercancel` commits nothing.
7. Pen hover shows a preview and commits nothing.
8. Pen contact inherits the hover target without jumping.
9. Existing-note selection/drag does not create an extra note.
10. Grand-staff movement does not jump staves under jitter.
11. Blank measure, rest-only measure, and populated measure produce identical pitch mapping.
12. The current mouse hover/click contract still passes.

Run and preserve:

- relevant note-input unit tests
- `npm test`
- `npm run build`
- targeted Playwright tests
- existing ghost/snap/semantic-grid regression suites proportionate to the changes

Do not weaken existing assertions or skip failing legacy tests to make the new interaction pass.

## Physical iPad QA

Document results for at least:

- an iPad/Apple Pencil combination with hover support, if available
- an iPad/Apple Pencil combination without hover, or an explicit no-hover fallback test
- finger-only entry
- portrait and landscape
- page and continuous view
- low, normal, and high zoom
- treble, bass, and grand staff
- blank, dense, chordal, multi-voice, tuplet, and grace-note measures
- pitches on every staff line and space plus at least three ledger lines above and below
- a key signature with sharps and one with flats
- slow refinement and fast pitch scrubbing
- panning/zooming before, during, and after note-input mode

For each case verify visually and semantically:

- preview pitch equals committed pitch
- preview onset equals committed onset
- no accidental staff jump
- no duplicate commit
- Undo restores the exact prior document
- playback/audition matches the candidate sounding pitch

## Definition of done

The task is complete only when:

- A finger user can press anywhere on a valid staff area, see an unobscured magnified candidate, drag to the intended line or space, and release to commit.
- An Apple Pencil user sees a predictive shadow note before contact when hardware/runtime hover supports it.
- No touch or Pencil mutation occurs on pointer down.
- The committed semantic target is object-identical or field-identical to the last validated preview target; it is never freshly guessed from pointer-up coordinates.
- Vertical pitch mapping is independent of measure contents.
- Minor vertical jitter cannot change pitch and minor horizontal jitter cannot change onset.
- The existing mouse, keyboard, MIDI, microphone, TAB, selection, history, validation, and MusicXML workflows continue to pass.
- The implementation is verified by automated tests and a documented physical-iPad pass.

## Final handoff

Report:

1. The interaction behavior delivered.
2. The exact files changed.
3. The pitch-lane source of truth and preview/commit invariant.
4. Automated test commands and results.
5. Physical iPad devices and scenarios tested.
6. Any remaining hardware-specific limitations, especially hover behavior in WKWebView.
