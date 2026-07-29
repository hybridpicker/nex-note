# Physical iPad Direct-Entry QA

Updated: 2026-07-28

## Purpose

Use this checklist on a physical iPad build after `npm run ipad:sync`. Browser
automation verifies the Pointer Events contract, but cannot prove Apple Pencil
hover delivery or WKWebView hardware behavior.

Record the iPad model, iPadOS version, Pencil model, Nex Note build, orientation,
view mode, and zoom for every run. Attach a short screen recording for failures
and include the overlay's `data-ghost-snap-trace` value when possible.

## Required device matrix

| Device/runtime | Status | Notes |
| --- | --- | --- |
| Hover-capable iPad + compatible Apple Pencil | Not run in this workspace | Confirm `pointerType="pen"` hover moves arrive with `buttons=0` before contact. |
| iPad + Apple Pencil without hover | Not run in this workspace | Confirm contact immediately shows the shadow note and loupe fallback. |
| Finger-only iPad entry | Partially run on iPad Air 13-inch (M2) | Standalone native launch passed; complete the entry gesture and audible-playback rows manually after unlocking the device. |

Do not mark the hardware pass complete until all available rows have an exact
device and OS version plus pass/fail evidence. If hover events do not arrive in
the supported WKWebView, capture the event trace before considering a native
`UIHoverGestureRecognizer` bridge.

## Scenario matrix

Repeat the core checks in portrait and landscape, page and continuous view, and
low/normal/high zoom.

- Treble, bass, and grand staff.
- Blank, rest-only, dense, chordal, multi-voice, tuplet, and grace-note measures.
- Every staff line and space, then at least three ledger lines above and below.
- A sharp key signature and a flat key signature, including carried and armed
  accidentals.
- Slow single-lane refinement and fast pitch scrubbing.
- Score panning and zooming before entering note-input mode, after leaving it,
  and with the app's visible zoom/view controls while note input owns one-finger
  gestures.

For every case:

1. Hover with Pencil when supported. Verify a shadow note, pitch chip, lane, and
   onset caret appear without changing the document or history.
2. Touch down on blank staff. Verify the document and Undo state remain
   unchanged and the loupe does not sit under the finger.
3. Drift slightly in X while changing Y. Verify pitch changes by exact diatonic
   lanes while onset remains fixed.
4. Drag intentionally in X. Verify the onset changes only after the intent
   threshold and the caret follows it.
5. Jitter near a line/space boundary and between grand-staff rows. Verify the
   lane and staff remain locked until the visible hysteresis boundary is crossed.
6. Read the preview pitch, timestamp, voice, duration/dot, accidental, and
   placement label, then lift with a small release wobble.
7. Inspect the committed note. Preview pitch and onset must equal the committed
   values, with exactly one mutation and no unrelated staff jump.
8. Undo once. The exact prior MusicXML/document state must return.
9. Enable input audition and repeat slow/fast refinement. Sound must change only
   with the stable sounding pitch, previous previews must not accumulate, and
   playback cursor state must not move.
10. Trigger cancellation with Escape, a system gesture/pointer cancellation,
    mode exit, and leaving the score capture area. None may mutate the score;
    each path must release pointer capture and clear the locked preview before
    navigation resumes.
11. Press an existing notehead and drag it. It must select/transpose that note
    without inserting an extra note.
12. Select a note and verify the native contextual action bar appears above the
    safe area. Tap **Delete note** without a hardware keyboard. The selected
    pitch must be removed through the normal semantic/history path, a rhythmic
    rest must remain when required, and one Undo must restore the note.

## Standalone launch and optional live-mode checks

1. Run `npm run ipad:sync`, build in Xcode, and install that build.
2. Stop every Nex Note server on the Mac and launch the installed app.
3. Confirm the editor opens directly and never shows the Mac-server connection
   screen.
4. Import a MusicXML file, tap Play, and confirm playback starts without
   `/api/midi`; the client-side MIDI fallback must drive the score.
5. For the separate live-development configuration, run `npm run ipad:dev`,
   build in Xcode, stop the server, and confirm the connection screen retries
   the generated URL. Restart the server and confirm it reconnects.

## Automated evidence available before hardware QA

- `npx tsx --test test/tablet-entry-session.test.ts test/staff-pitch.test.ts`
- `npx tsx --test --test-name-pattern='ScoreInputOverlay' test/user-visible-components.test.ts`
- `npx playwright test e2e/tablet-entry.spec.ts --project regression`
- `npx playwright test e2e/ipad-native.spec.ts --project smoke`
- `npm test`
- `npm run build`

The dedicated Playwright spec constructs touch and pen Pointer Events and covers
take-off commit, release jitter, cancellation, pen hover/contact continuity, and
the existing mouse click contract. It is not a substitute for the device matrix
above.

## Local validation record

Recorded on 2026-07-28:

- `npm test`: 1,069 passed, 0 failed.
- `npm run build`: production build and TypeScript validation passed.
- `npx playwright test e2e/tablet-entry.spec.ts --project regression`: 5 passed.
- `npx playwright test e2e/ipad-native.spec.ts --project smoke`: 2 passed.
- Standalone bundle smoke: the editor loaded with no Next server and client-side
  MIDI playback scheduled notes after `/api/midi` was unavailable.
- `npm run electron:refresh`: packaged Electron app rebuilt and verified.
- `npm run ipad:sync`: generated and synchronized the standalone editor payload;
  generated `capacitor.config.json` contained no `server` section.
- `npm run ipad:doctor`: Xcode 26.6, Capacitor dependencies, LAN configuration,
  native project, and available disk checks passed.
- Physical iPad Air 13-inch (M2): signed device build and installation passed.
  A standalone build launched with Mac servers stopped and loaded
  `capacitor://localhost`. The final audio-enabled build was installed; its
  automated post-install launch was blocked only because the device had locked.
- `git diff --check`: passed.

Apple Pencil hover/contact behavior, hands-on finger entry, audible speaker
output, and the final touch deletion gesture still require a manual unlocked
device pass. Automated touch coverage and the signed device build do not replace
those hardware observations.
