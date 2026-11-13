import assert from 'node:assert/strict';
import test from 'node:test';

import { createAudibleClock, declaredOutputLatencySeconds } from '../lib/playback-clock.ts';

const close = (actual: number, expected: number, epsilon = 1e-6) => {
  assert.ok(Math.abs(actual - expected) < epsilon, `expected ${expected}, got ${actual}`);
};

test('the audible clock follows the output timestamp and extrapolates it smoothly', () => {
  let nowMs = 1_000;
  const ac = {
    currentTime: 10.04,
    baseLatency: 0.005,
    outputLatency: 0.016,
    // Sample 10.0 leaves the speaker at performance time 990 ms.
    getOutputTimestamp: () => ({ contextTime: 10, performanceTime: 990 }),
  };
  const clock = createAudibleClock(ac, { now: () => nowMs });
  close(clock.audibleTime(), 10.01);
  close(clock.audibleTime(1_016.7), 10.0267);
  assert.equal(clock.source(), 'output-timestamp');
  close(clock.latencySeconds(), 0.03);
  nowMs = 1_005;
  close(clock.audibleTime(), 10.015);
});

test('without an output timestamp the clock subtracts the declared latency', () => {
  const ac = { currentTime: 5, baseLatency: 0.01, outputLatency: 0.02 };
  const clock = createAudibleClock(ac, { now: () => 0 });
  close(clock.audibleTime(), 4.97);
  assert.equal(clock.source(), 'declared-latency');
  close(declaredOutputLatencySeconds({ baseLatency: Number.NaN, outputLatency: undefined }), 0);
});

test('an implausible output timestamp falls back to the declared latency', () => {
  const ac = {
    currentTime: 5,
    baseLatency: 0.01,
    outputLatency: 0,
    // WebKit before the first render callback, or a timestamp ahead of the render clock.
    getOutputTimestamp: () => ({ contextTime: 0, performanceTime: 0 }),
  };
  const clock = createAudibleClock(ac, { now: () => 100 });
  close(clock.audibleTime(), 4.99);
  const ahead = createAudibleClock({ ...ac, getOutputTimestamp: () => ({ contextTime: 6, performanceTime: 100 }) }, { now: () => 100 });
  close(ahead.audibleTime(), 4.99);
});

test('the render clock is extrapolated between its callback steps', () => {
  let nowMs = 0;
  const ac = { currentTime: 1, baseLatency: 0, outputLatency: 0 };
  const clock = createAudibleClock(ac, { now: () => nowMs });
  close(clock.audibleTime(), 1);
  nowMs = 8; // currentTime has not advanced yet
  close(clock.audibleTime(), 1.008);
  nowMs = 500; // a stalled context is not extrapolated forever
  close(clock.audibleTime(), 1.1);
});

test('a latency calibration delays the picture by the calibrated amount', () => {
  const ac = { currentTime: 2, getOutputTimestamp: () => ({ contextTime: 1.98, performanceTime: 50 }) };
  const clock = createAudibleClock(ac, { now: () => 50, calibrationSeconds: () => 0.15 });
  close(clock.audibleTime(), 1.83);
  close(clock.latencySeconds(), 0.17);
});
