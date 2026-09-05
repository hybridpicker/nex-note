# Remaining notation quality evidence

Status: unperformed until a tester records results. Use the revision installed
by the current iteration, and attach the full SHA, surface, OS, input hardware,
view, zoom, recording filename, exported score and any failure timestamps.
Automation and launch receipts do not satisfy these tasks.

## Keyboard: three comparable runs

Create a fresh eight-bar 4/4 treble score in C major, voice 1. Use quarter notes
unless specified. Enter the following fixed passage using the keyboard:

1. C4 D4 E4 F4.
2. G4, quarter rest, A4 B4.
3. C5 B4 A4 G4.
4. F-sharp4 G4 A4 B4.
5. C4/E4/G4 quarter chord, D4 E4 F4.
6. G4 quarter tied to G4 quarter, A4 B4.
7. C5 D5 E5 eighth-note triplet occupying one quarter; F5 G5 A5 quarters.
8. G5 F5 E5 D5; correct the last note to E-flat5 with chromatic arrows.

Record the starting focus and how you reach the first slot. Include this setup
in the action log, separately from entry time. Undo and Redo the correction;
verify only the final pitch changes. Focus a text field, type `first second`,
and use text Undo/Redo; verify spaces remain text and score/transport stay
unchanged. Return to the score and hold Space: one start or pause, no repeated
transport toggles. Export MusicXML, close, reopen the export and compare all
eight bars, including chord, accidental, rest, tie, triplet, voice and correction.

Record seconds, physical keystrokes, mouse reaches, corrections and failures
for three fresh runs. Report the median; automated key dispatch timings must
not be substituted. Preserve the exported file from each run.

## Native iPad: tester must perform these gestures

Open the installed **native Nex Note app**, not Safari. Record iPad model,
iPadOS, Pencil model and whether hover is supported. Create a four-bar piano
score and record a screen video. Repeat separately with finger and Pencil in
portrait/page, landscape/page, portrait/continuous and landscape/continuous.
At 75%, 100% and 150% zoom:

1. In Note Input, touch upper-staff C4, refine to E4 and release. Verify one
   E4 is committed; Undo removes exactly one entry and Redo restores it.
2. Enter lower-staff C3, correct it to D3, then Undo/Redo the correction.
3. Begin a blank-slot preview and cancel by leaving Note Input before release.
   Verify no new note and no new Undo transaction.
4. Begin a selected-note drag, interrupt it with app/system navigation, return
   and release. Verify the original pitch survives; report if takeover cannot
   be produced, rather than recording a pass.
5. Pan and pinch with two fingers; leave and return to the app. Verify no
   accidental entry, loss of score, duplicate commit or stuck preview.
6. Rotate during contact, release, then make a fresh entry. Record whether the
   interrupted gesture cancels cleanly and the fresh preview matches its pitch.
7. Export, close and reopen the score. Compare both staves and final history
   results. Retain export and recording; list each matrix cell as pass/fail/not-run.

For latency, use an external high-frame-rate recording that sees the contact
and display together; report frame rate, sample count and p95. Screen recording
alone cannot measure physical contact-to-preview latency.

## Audible playback: tester must listen and record

On the refreshed Electron app and separately the native iPad, record display
and actual output audio on a common timebase. Name speakers/headphones, wired
or Bluetooth route, audio interface and sample rate. Do not use instrument
start counters as audio evidence.

1. Open `piano-semantics.musicxml`; start at a selected note, pause, resume,
   seek backward and forward, stop, then wait two seconds. Listen for hanging
   or late notes and verify cursor/selected start agree with the sounded pitch.
2. Repeat with `cross-measure-tie.musicxml` and
   `repeat-ending-sequence.musicxml`; ties must sustain and endings/repeats
   must follow the score. Repeat mixed-meter coverage with a score that has
   explicit meter changes; name that fixture.
3. While playing, change tempo 120 -> 60 -> 180 BPM; check continuity and
   sustain, then stop during loading and again after sound begins.
4. Record at least 60 seconds. Mark audible attacks and cursor crossings;
   report sample count, output-latency calibration, p95 absolute offset and
   first-to-last drift. Target <= 50 ms after calibrated output latency.
5. Listen to piano, choir and leadsheet separately and together where the
   score contains multiple parts. Note timbre, clipping, missing voices,
   balance, uncomfortable attacks and dynamics at a fixed output volume.
6. Disconnect networking and repeat Play/Stop after restart. Record whether
   cached soundfonts or oscillator fallback are heard, and whether the user
   receives an actionable message when output is unavailable.

## Formatting and print review

For each of `piano-semantics.musicxml`, `choir-lyrics.musicxml` and
`leadsheet-repeat.musicxml`, add a system/page break where the score has another
bar, change spacing and staff distance, and add staff text. Record the exact
values and clicks. Undo/Redo; save, close and reopen; compare all settings and
musical events. Use Print Score and save A4 PDF, recording scaling and margins.
Inspect every page at 100% and print scale for clipped glyphs, lyric collisions,
detached markings, missing systems, blank extra pages and changes in spacing.
Retain before/after MusicXML or NXN and PDFs. A short fixture pass does not prove
long-score pagination; add a named multipage fixture before closing that gate.
