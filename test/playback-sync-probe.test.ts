import assert from 'node:assert/strict';
import test from 'node:test';

import { analyzePlaybackSync, selectedNoteMidi, summarizeOffsets, type SyncProbeRecording } from '../lib/playback-sync-probe.ts';

const FRAME = 1000 / 60;

/**
 * A synthetic run: notes every 500 ms; the output clock maps context time t to performance time
 * 1000 + t*1000. `visualLagMs` delays the picture relative to the sound.
 */
function syntheticRecording(visualLagMs: number): SyncProbeRecording {
  const onsets = [0, 0.5, 1, 1.5].map((seconds, index) => ({ seconds, midi: 60 + index }));
  const audio = onsets.map((onset) => ({
    midi: onset.midi,
    partId: 'P1',
    scoreSeconds: onset.seconds,
    idealAc: onset.seconds,
    startAc: onset.seconds,
    nowAc: onset.seconds - 0.2,
    at: 1000 + onset.seconds * 1000 - 200,
  }));
  const frames = Array.from({ length: 140 }, (_, index) => {
    const t = 900 + index * FRAME;
    // The frame begun at t is on screen at t + FRAME: it shows what is heard at t + FRAME - lag.
    const shownSeconds = Math.max(0, (t + FRAME - visualLagMs - 1000) / 1000);
    return {
      t,
      sampledAt: t + 4,
      playhead: { x: 100 + shownSeconds * 200, y: 10, height: 40, measureNumber: 1 },
      clock: { contextTime: (t - 1000) / 1000, performanceTime: t, currentTime: (t - 1000) / 1000 + 0.02, baseLatency: 0.005, outputLatency: 0.015 },
    };
  });
  const visual = onsets.map((onset) => ({
    // The highlight changes inside the rAF callback of the frame that is shown at the onset.
    at: 1000 + onset.seconds * 1000 + visualLagMs - FRAME + 1,
    measureNumber: 1,
    positionWholes: onset.seconds / 2,
    pitches: [onset.midi],
  }));
  const geometry = onsets.map((onset) => ({ measureNumber: 1, positionWholes: onset.seconds / 2, midi: onset.midi, x: 100 + onset.seconds * 200, y: 20 }));
  return { audio, visual, geometry, frames, marks: [{ at: 960, kind: 'press' }] };
}

const expected = [0, 0.5, 1, 1.5].map((seconds, index) => ({ measureNumber: 1, positionWholes: seconds / 2, pitches: [60 + index] }));

test('the analysis reports near-zero offsets for a picture that follows the sound', () => {
  const report = analyzePlaybackSync(syntheticRecording(0), expected);
  assert.equal(report.audio.missingOnsets, 0);
  assert.equal(report.highlight.count, 4);
  assert.ok(Math.abs(report.highlight.median ?? Infinity) <= FRAME, JSON.stringify(report.highlight));
  assert.ok(Math.abs(report.playhead.median ?? Infinity) <= 1, JSON.stringify(report.playhead));
  assert.equal(report.playhead.backwardJumps, 0);
  assert.equal(report.start?.pressToFirstSoundMs, 40);
  assert.deepEqual(report.outputLatencyMs, { base: 5, output: 15 });
});

test('the analysis measures a late picture', () => {
  const report = analyzePlaybackSync(syntheticRecording(100), expected);
  assert.ok(Math.abs((report.playhead.median ?? 0) - 100) <= 1, JSON.stringify(report.playhead));
  assert.ok(Math.abs((report.highlight.median ?? 0) - 100) <= FRAME, JSON.stringify(report.highlight));
});

test('skipped and late notes and missing onsets are counted', () => {
  const recording = syntheticRecording(0);
  recording.audio[1] = { ...recording.audio[1]!, startAc: recording.audio[1]!.idealAc + 0.05 };
  recording.audio[2] = { ...recording.audio[2]!, skipped: true };
  const report = analyzePlaybackSync(recording, expected);
  assert.equal(report.audio.skipped, 1);
  assert.equal(report.audio.shiftedLate, 1);
  assert.equal(report.audio.maxLateMs, 50);
  assert.equal(report.audio.missingOnsets, 1);
});

test('offset statistics include drift over time', () => {
  const stats = summarizeOffsets([0, 1, 2, 3].map((minute) => ({ at: minute * 60_000, offset: minute * 10 })));
  assert.equal(stats.driftMsPerMinute, 10);
  assert.equal(stats.median, 15);
  assert.equal(stats.maxAbs, 30);
});

test('written pitches map to MIDI numbers', () => {
  assert.equal(selectedNoteMidi({ step: 'C', octave: 4, alter: 0 }), 60);
  assert.equal(selectedNoteMidi({ step: 'F', octave: 3, alter: 1 }), 54);
  assert.equal(selectedNoteMidi({ isRest: true, step: 'C', octave: 4 }), null);
});

test('drift leaves out the start onset, which is on screen from the moment Play is pressed', () => {
  const samples = [
    { at: 0, offset: -15, start: true },
    ...Array.from({ length: 10 }, (_, index) => ({ at: (index + 1) * 1000, offset: 5 })),
  ];
  const stats = summarizeOffsets(samples);
  assert.equal(stats.driftMsPerMinute, 0);
  assert.equal(stats.count, 11);
  assert.equal(stats.maxAbs, 15);
});

test('a playhead crossing at a barline on the same system is interpolated between frames', () => {
  // Onsets at 0, 0.5 s (measure 1) and 1, 1.5 s (measure 2). The frame grid is 7 ms off the
  // onsets, so a crossing credited to the next whole frame would read up to a frame late.
  const recording = syntheticRecording(0);
  const barlineX = 100 + 1 * 200;
  recording.frames = recording.frames.map((frame) => {
    const t = frame.t + 7;
    const shownSeconds = Math.max(0, (t + FRAME - 1000) / 1000);
    const x = 100 + shownSeconds * 200;
    return {
      ...frame,
      t,
      sampledAt: t + 4,
      playhead: { x, y: 10, height: 40, measureNumber: x >= barlineX ? 2 : 1 },
      clock: { ...frame.clock!, contextTime: (t - 1000) / 1000, performanceTime: t },
    };
  });
  const remap = <T extends { measureNumber: number; positionWholes: number }>(entry: T): T => (
    entry.positionWholes >= 0.5 ? { ...entry, measureNumber: 2, positionWholes: entry.positionWholes - 0.5 } : entry
  );
  recording.visual = recording.visual.map(remap);
  recording.geometry = recording.geometry.map(remap);
  const barlineExpected = expected.map(remap);
  const report = analyzePlaybackSync(recording, barlineExpected);
  const downbeat = report.perOnset.find((onset) => onset.measureNumber === 2 && onset.positionWholes === 0);
  assert.ok(downbeat && Math.abs(downbeat.playheadOffsetMs ?? Infinity) <= 1, JSON.stringify(report.perOnset));
});
