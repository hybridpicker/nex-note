# Playback sync

How Nex Note keeps the playhead and the played-note highlight on the note the listener hears,
how this is measured, and the budgets the measurement enforces.

## Architecture

- **One timeline** (`lib/playback-timeline.ts`). Score seconds ⇄ measure and position in whole
  notes, built from the MIDI tempo map and the measure ranges (repeats unrolled by
  `lib/playback-measure-order.ts`). Audio scheduling, metronome clicks, the playhead, the
  highlight, seeking and start-from-selection all use it. Positions are in whole notes, the unit
  of score event timestamps and OSMD source timestamps, in every time signature. Swing is removed
  again when locating, so a swung offbeat is highlighted when it sounds.
- **The renderer and the timeline agree.** MuseScore and the built-in fallback renderer
  (`lib/midi-export.ts`) unroll repeats in the same order as the timeline. If a rendering did not
  unroll them, `resolveRenderedMeasureBeatRanges` falls back to the written order. D.C./D.S.
  jumps are not modelled yet; a warning is logged when the MIDI is longer than the unrolled score.
- **Audio** (`hooks/usePlayback.ts`) is scheduled against the AudioContext clock from a worker
  timer (`lib/playback-ticker.ts`, 25 ms ticks, 0.3 s look-ahead). The timer keeps running in
  hidden tabs and occluded windows. Notes are never shifted late or dropped. If the main thread is
  blocked longer than the look-ahead, the whole transport moves later, sound and picture
  together. Start, seek and start-from-note keep the AudioContext and the loaded instruments.
- **The audible clock** (`lib/playback-clock.ts`): `getOutputTimestamp()` when usable, otherwise
  `currentTime − baseLatency − outputLatency`, plus an optional per-device calibration
  (`nex-note:playback-latency-ms`, for Bluetooth outputs; there is no UI for it yet).
- **Visuals are drawn per frame, outside React** (`components/ScoreEditor.tsx`, playback loop).
  Each animation frame asks `transport.read(frameTime + refreshInterval)` what is heard when the
  frame reaches the screen, then writes the playhead as a compositor `transform`, tints the
  current onset and follows with scrolling. The loop subscribes to the transport, so it starts
  with the sound rather than after React re-renders. React state changes only once per measure,
  as a transition, for the measure display and the e2e state. The toolbar progress bar follows
  the transport the same way.
- **Engraved geometry** (`lib/playback-geometry.ts`). Every rendered onset is an anchor at its
  notehead x. Between anchors the line moves linearly in musical time, and at the end of a
  measure it glides into the next measure's first note on the same system. Seek clicks use the
  inverse mapping.
- **Instruments** load in the background once the MIDI preload finishes, from the locally served
  soundfonts only. Run `npm run soundfonts:fetch` before building Electron or iPad. Without
  local soundfonts, the first Play downloads the instruments from GitHub (about 1.5 s for a
  four-part score). `npm run ipad:doctor` and `npm run electron:verify` report missing samples.

## Sound

The signal chain is built once per AudioContext (`lib/playback-bus.ts`). Every node in it is
latency free, and nothing sits between a scheduled note and its AudioContext start time.

```
part bus: gain (mixer volume, mute) ─► StereoPanner ─► master input (×5) ─► level ─► ¼ ─► soft clipper ─► destination
          └─► reverb send 0.18 (shared) ─► Convolver ─► return ─► master input
metronome, audition ─► dry input (×5) ─────────────────────────────────────► ¼ ─► soft clipper
```

- **Loudness.** The FluidR3 samples peak at −13 to −21 dBFS, so the master gain is ×5
  (+14 dB). Velocity uses a square law (`velocityToGain`, `lib/playback-dynamics.ts`): pp (33)
  −23 dB, mf (80) −8 dB, ff (112) −2 dB. A score without dynamics plays mf (velocity 80) on
  both renderers (MuseScore, and the fallback in `lib/midi-export.ts` since it follows MuseScore),
  so an undynamic'd single line peaks at −15 to −11 dBFS before the level control.
- **Dynamics without a DynamicsCompressorNode.** Chromium's and WebKit's compressor delays its
  output by a fixed 6 ms look-ahead that no latency API reports, which would put the sound behind
  the playhead. Playback therefore uses a feed-forward compressor driven by the scheduler: each
  note's peak (its sample's measured peak × gain × pan) is known when it is scheduled, the power
  sum of the sounding notes is put through a static curve (threshold −14 dB, knee 10 dB, ratio 3,
  ceiling −2 dBFS), and the `level` gain is automated on a 5 ms grid, lowered before each note
  starts and released with a 0.25 s time constant. The plan is committed 20 ms behind the
  look-ahead edge so a note entering the window can still lower the level. A WaveShaper soft
  clipper (linear to −3 dBFS, never above −0.3 dBFS, no oversampling) catches what the estimate
  misses. Stop, seek and tempo changes drop the plan.
- **Computed levels** (offline mixdown of the decoded samples with these constants). A single
  mf (velocity 80) note, median over C2–C6 of each shipped set: piano −15.1 dBFS, contrabass
  −14.4, flute −14.0, electric guitar −13.9, harp −13.5, bassoon and cello −13.3, clarinet −13.1,
  violin −12.9, viola −12.8, trumpet and organ −12.7, choir and guitars −12.6, alto sax and oboe
  −12.5, trombone −12.4, tuba and electric bass −12.3, horn −11.1 (drum sample −10.4). A rendered
  mf solo line (attack envelope included): piano −15.3, flute −14.4, violin −13.9. Four parts ×
  six-note chord at mf +0.6 dBFS
  before the level control and −5.7 after; at ff +6.4 / −3.7; with accents and mixer volume 1.5
  +12.1 / −1.9 dBFS (the old chain: −3.9 dBFS straight into the output).
- **Long notes** (`lib/sample-loop.ts`). Every sample is about 3.1 s long without loop points.
  After an instrument loads, sustaining instruments (strings, winds, brass, organ, choir) get a
  baked constant-power crossfade loop (loopEnd 3.0 s, crossfade 0.3 s, loopStart near 1.0 s,
  moved up to 12 ms to meet the waveform in phase; the fade is equal-power for uncorrelated and
  equal-gain for in-phase material). Notes longer than 2.8 s play with `loop: true` and those
  loop points. Every sample also gets a 50 ms cosine fade at its end. This takes about 25 ms of
  main-thread time per instrument (88 samples, MacBook).
- **Sustain pedal.** CC64 is read while parsing the MIDI (`lib/playback-midi-controllers.ts`):
  a note released while the pedal is down sounds until the pedal lifts; a pitch struck again
  ends the held note at the new onset.
- **Space.** Each part has its own bus. Mixer volume and mute ramp over 20 ms, so muting during
  playback also silences ringing notes. With several parts the score is seated by instrument
  (violin −0.35, viola +0.1, cello +0.3, bass +0.4, flute −0.1, oboe +0.1, clarinet −0.15,
  bassoon +0.15, horn −0.25, trumpet +0.2, trombone +0.3, tuba +0.35, harp −0.4; parts of the
  same instrument spread by 0.15); a single part stays centred. The reverb impulse response is
  generated at run time (`lib/reverb-ir.ts`: decorrelated stereo noise, RT60 1.6 s, 12 ms
  pre-delay, high frequencies decaying faster, unit energy). Without StereoPannerNode or
  ConvolverNode the parts stay dry and centred.
- **Metronome.** A rendered 40 ms woodblock-like click (`lib/drum-synth.ts`), 2.2 kHz and gain
  0.2 on beat 1, 1.6 kHz and gain 0.13 otherwise, with a 5 ms release: −12 / −16 dBFS peak.
- **Drums.** Percussion tracks (MIDI channel 10) play a synthesized General MIDI kit
  (`lib/drum-synth.ts`, every key 35–81, at most 16 nodes per hit) instead of the pitched
  `synth_drum` sample. Under the e2e instrument loader they still go to the loader.
- **Audition** plays the sounding pitch (the part's chromatic transposition plus 12 × octave
  change), dry and centred: decaying instruments ring 1.0 s, sustained ones the note length at
  the tempo, at most 0.8 s. A note click starts the audition before the MIDI is loaded.
- **iOS.** A context in WebKit's `interrupted` state is resumed like a suspended one, and on
  `statechange` while playback runs.

- **Fermatas and tempo events.** Both renderers hold a fermata by halving the tempo for the
  note's span. The timeline is built from the MIDI's own tempo map, so the playhead, the highlight
  and the metronome slow down with the sound (`test/playback-fermata-playhead.test.ts`).
- **Tracks to parts.** Both renderers write one track per staff with notes, and the fallback a
  separate channel-10 track for a staff's unpitched notes. `resolvePlaybackTrackPart` maps tracks
  by that order; otherwise by exact name, then the longest contained name ("Violin II" is not
  "Violin I"), and an unnamed percussion track to the only drum part.

None of this has been verified by listening yet.

## Measuring: the sync probe

The probe is `lib/playback-sync-probe.ts`. It is dormant until you enable it with `?syncProbe=1`,
by setting the localStorage key `nex-note:sync-probe` to `1`, or with
`window.__NEX_NOTE_SYNC_PROBE_REQUEST__` before boot. It records:

- every scheduled note with its ideal and actual AudioContext time;
- every highlight change;
- the rendered note geometry;
- one post-paint sample per frame with the playhead rect and the output clock.

`window.__NEX_NOTE_SYNC_PROBE__.report()` returns the statistics in any surface's web inspector
(Safari Web Inspector for the iPad).

Conventions: a frame begun at rAF time `t` is on screen at `t + refresh interval`, and a note is
heard when the output clock reaches its start time. Offsets are picture minus sound, in
milliseconds. The resolution is one frame. Crossing times of the playhead are interpolated
between frames, also across a barline on the same system (the line glides into the next
measure's first note), so `frameGaps` reports main-thread stalls separately. Drift is the
least-squares slope without the run's first onset: that note is on screen from the moment Play is
pressed, and its timing is reported as `start`. An onset scheduled in the look-ahead but cut off
by Stop is neither heard nor counted.

```
NEX_E2E_NO_ARTIFACTS=1 npx playwright test e2e/playback-sync.spec.ts --project regression
NEX_SYNC_PROBE_REPORT_ONLY=1 NEX_SYNC_PROBE_LABEL=mylabel ...   # numbers only, results in test-results/playback-sync/
NEX_SYNC_PROBE_ELECTRON=1 ...                                   # also inside the Electron shell (own temporary profile)
```

Scenarios: small 4/4 score, dense grand staff, long four-part score (40 measures), time
signature/tempo/repeat structure, start from a selected note, first Play of an idle score, and
dense score with a busy main thread (45 ms tasks every 120 ms).

## Budgets

| Metric | Budget |
| --- | --- |
| Median offset, highlight and playhead | ≤ 10 ms |
| p95 \|offset\| | ≤ 20 ms |
| max \|offset\| | ≤ 34 ms (two frames) |
| Drift | ≤ 5 ms/min |
| Press to first sound (loaded score) | ≤ 100 ms |
| Skipped notes, late-shifted notes, missing onsets | 0 |

## Results (2026-11-13, MacBook, headless Chrome unless noted)

Before is the previous implementation, after is this one. Highlight and playhead show
median / p95 / max in ms.

| Scenario | Highlight before | Highlight after | Playhead before | Playhead after |
| --- | --- | --- | --- | --- |
| Small | 48 / 106 / 156 | 10 / 10 / 10 | −294 / 1750 / 1811, 13 backward jumps | 0 / 10 / 10, 0 jumps |
| Dense | 50 / 98 / 127, 20 missing | 8 / 15 / 18 | 107 / 1748 / 1987 | 0 / 3 / 18 |
| Structure (3/4→6/8→2/4→4/4, tempo change, repeat with voltas) | 41 / 281 / 281 | 5 / 15 / 16 | 236 / 1258 / 1336 | 0 / 14 / 16 |
| Long, 4 parts | 109 / 209 / 225, 109 missing, 20 fps | 11 / 16 / 40, 60 fps | 227 / 1258 / 1859 | 0 / 15 / 32 |
| From selection (beat 2 of a 3/4 bar) | −205 / 1167, wrong start position | 3 / 14 / 14 | 293 / 1307 | 0 / 14 / 14 |
| Dense, busy main thread | 86 / 156 / 180, 53 missing | 9 / 31 / 64 | −83 / 1853 / 1981 | 0 / 5 / 42 |
| Electron, small (CoreAudio, 18 ms output latency) | not measured | 15 / 15 / 19 | not measured | 1 / 15 / 19 |
| Electron, long | not measured | 11 / 12 / 29 | not measured | 1 / 4 / 13 |

Start latency, warm: 38–50 ms before (the first note was due "now" and the playhead moved
90–230 ms after the sound); 34–38 ms after, with the playhead moving within one or two frames
of the sound. Start from selection: 390–585 ms before, because the AudioContext was closed and
the instruments reloaded; 35 ms after. First Play of an idle score: 37 ms with local
soundfonts, 1553 ms without them. The before numbers were measured without local soundfonts,
and their "cold" figures of 2.4–5.5 s include the MuseScore export because Play was pressed
right after opening.

Known limit: under a deliberately busy main thread (45 ms tasks), frames are missed, so the
highlight can show up to about three frames late. A compositor-driven (WAAPI) playhead could
keep the line moving during such stalls, but the probe cannot observe compositor frames, so
that is left for later.

### Update 2026-11-15

The highlight onset is now read half a frame ahead of the playhead (`playbackHighlightLeadMs`,
1.5 frame intervals against 1), so its error is centred on the sound instead of lying between
0 and +1 frame. Highlight median / p95 in ms, same machine, headless Chrome, before → after:
small 9.8 / 10 → 4.3 / 4.6, dense 7.5 / 15 → −0.3 / 8.5, structure 10.8 / 15.4 → 1.8 / 8.8,
long 4.8 / 13 → −1.9 / 6.6, from selection 11.4 / 11.4 → −8.1 / 8.1, busy 7.6 / 25.9 → −1.5 / 23.8.
The probe itself changed on the same day (drift without the start onset, interpolated barline
crossings; see "Measuring"), so these numbers are not comparable with the table above.

Over budget in the full end-to-end runs of that day, budgets unchanged:

- Playhead drift of short runs: small 5.4 to 5.5 ms/min in two of four runs, from selection
  14.1 and 30.8 ms/min over nine onsets. A regression line over a few seconds of music is
  sensitive to single frames; whether this is measurement noise or a real slope is not settled.
- Structure: highlight drift 5.9 ms/min in one run.
- Busy main thread: highlight p95 23.8 to 25.9 ms (the known limit above).

The new sound engine (bus, reverb, loops, drum kit) did not change these numbers: skipped,
late-shifted and missing notes stay at 0, press to first sound is 34 to 43 ms.
