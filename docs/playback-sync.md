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
between frames, so `frameGaps` reports main-thread stalls separately.

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
