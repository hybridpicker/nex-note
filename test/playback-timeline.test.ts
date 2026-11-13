import assert from 'node:assert/strict';
import test from 'node:test';

import {
  beatsToSeconds,
  buildPlaybackTimeline,
  secondsToBeats,
  swingBeats,
  unswingBeats,
} from '../lib/playback-timeline.ts';

const close = (actual: number | null | undefined, expected: number, epsilon = 1e-6) => {
  assert.ok(actual != null && Math.abs(actual - expected) < epsilon, `expected ${expected}, got ${actual}`);
};

test('tempo map converts between seconds and beats across tempo changes', () => {
  const tempos = [{ bpm: 120, time: 0 }, { bpm: 60, time: 2 }];
  close(secondsToBeats(1, tempos), 2);
  close(secondsToBeats(3, tempos), 5);
  close(beatsToSeconds(5, tempos), 3);
  close(beatsToSeconds(secondsToBeats(7.25, tempos), tempos), 7.25);
});

test('locate gives positions in whole notes for 3/4, 6/8 and 4/4 measures', () => {
  // 3/4 (3 beats), 6/8 (3 beats), 4/4 (4 beats) at 60 bpm: one second per quarter.
  const timeline = buildPlaybackTimeline({
    ranges: [
      { measureNumber: 1, startBeat: 0, endBeat: 3, beats: 3, beatType: 4 },
      { measureNumber: 2, startBeat: 3, endBeat: 6, beats: 6, beatType: 8 },
      { measureNumber: 3, startBeat: 6, endBeat: 10, beats: 4, beatType: 4 },
    ],
    tempos: [{ bpm: 60, time: 0 }],
    durationSeconds: 10,
  });
  // Beat 2 of the 3/4 bar is a quarter note in: 0.25 wholes, a third of the measure.
  const second = timeline.locate(1);
  assert.equal(second.measureNumber, 1);
  close(second.positionWholes, 0.25);
  close(second.progress, 1 / 3);
  // The fourth eighth of the 6/8 bar.
  const eighth = timeline.locate(4.5);
  assert.equal(eighth.measureNumber, 2);
  close(eighth.positionWholes, 0.375);
  // Exactly on a barline the next measure starts: measure and position always agree.
  const downbeat = timeline.locate(6);
  assert.equal(downbeat.measureNumber, 3);
  close(downbeat.positionWholes, 0);
  close(timeline.locate(9.999).progress, 0.99975, 1e-4);
});

test('secondsAt resolves a repeated measure to the pass nearest the playhead', () => {
  const timeline = buildPlaybackTimeline({
    ranges: [
      { measureNumber: 1, startBeat: 0, endBeat: 4 },
      { measureNumber: 2, startBeat: 4, endBeat: 8 },
      { measureNumber: 1, startBeat: 8, endBeat: 12 },
      { measureNumber: 2, startBeat: 12, endBeat: 16 },
    ],
    tempos: [{ bpm: 120, time: 0 }],
    durationSeconds: 8,
  });
  close(timeline.secondsAt(2, 0.5), 3);
  close(timeline.secondsAt(2, 0.5, 6.5), 7);
  assert.equal(timeline.locate(5).spanIndex, 2);
  assert.equal(timeline.secondsAt(9, 0), null);
});

test('metronome clicks follow time signatures, compound meters, tempo changes and pickups', () => {
  const timeline = buildPlaybackTimeline({
    ranges: [
      { measureNumber: 0, startBeat: 0, endBeat: 1, beats: 4, beatType: 4 }, // a one-beat pickup
      { measureNumber: 1, startBeat: 1, endBeat: 4, beats: 3, beatType: 4 },
      { measureNumber: 2, startBeat: 4, endBeat: 7, beats: 6, beatType: 8 },
    ],
    tempos: [{ bpm: 60, time: 0 }, { bpm: 120, time: 4 }],
    durationSeconds: 20,
  });
  assert.deepEqual(timeline.clicks.map((click) => [Number(click.seconds.toFixed(3)), click.downbeat]), [
    [0, false], // the pickup sounds the last beat of a 4/4 bar
    [1, true], [2, false], [3, false],
    [4, true], [4.75, false], // 6/8 clicks dotted quarters, at the new tempo
  ]);
});

test('unswing maps a swung offbeat back to its written position', () => {
  const swing = { ratio: 2 / 3, unit: 'eighth' as const };
  close(swingBeats(0.5, swing), 2 / 3);
  close(unswingBeats(2 / 3, swing), 0.5);
  close(unswingBeats(swingBeats(1.3, swing), swing), 1.3);
  close(unswingBeats(1, swing), 1);
  close(unswingBeats(0.75, { ratio: 0.5, unit: 'eighth' }), 0.75);
});

test('a swung timeline highlights the offbeat when it sounds', () => {
  const swing = { ratio: 2 / 3, unit: 'eighth' as const };
  const timeline = buildPlaybackTimeline({
    ranges: [{ measureNumber: 1, startBeat: 0, endBeat: 4 }],
    tempos: [{ bpm: 60, time: 0 }],
    durationSeconds: 4,
    swing,
  });
  // The second eighth sounds at 2/3 s; the timeline reaches its written position (1/8) then.
  close(timeline.locate(2 / 3).positionWholes, 0.125);
  assert.ok(timeline.locate(0.6).positionWholes < 0.125);
  close(timeline.secondsAt(1, 0.125) ?? Number.NaN, 2 / 3);
});
