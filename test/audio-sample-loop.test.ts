import assert from 'node:assert/strict';
import test from 'node:test';

import {
  LOOP_MIN_NOTE_SECONDS,
  SAMPLE_END_FADE_SECONDS,
  SAMPLE_LOOP,
  LOOP_START_SEARCH_SECONDS,
  applyEndFade,
  bakeCrossfadeLoop,
  canBakeLoop,
  findAlignedLoopStart,
  isSustainingSoundfont,
  prepareSoundfontBuffers,
  shouldLoopNote,
} from '../lib/sample-loop.ts';
import { FakeAudioBuffer } from './support/audio-fake-context.ts';

const SR = 8000;
const LENGTH = Math.round(3.16 * SR); // every FluidR3 sample is about 3.1 s

function random(seed: number) {
  let state = seed >>> 0;
  return () => {
    state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
    return (state / 4294967296) * 2 - 1;
  };
}

function noise(seed = 1) {
  const next = random(seed);
  return Float32Array.from({ length: LENGTH }, () => next() * 0.3);
}

function sine(frequency = 220) {
  return Float32Array.from({ length: LENGTH }, (_, index) => 0.4 * Math.sin((2 * Math.PI * frequency * index) / SR));
}

/** What a looping AudioBufferSourceNode plays: to loopEnd, then from loopStart again. */
function playLooped(data: Float32Array, seconds: number) {
  const start = Math.round(SAMPLE_LOOP.loopStart * SR);
  const end = Math.round(SAMPLE_LOOP.loopEnd * SR);
  const out = new Float32Array(Math.round(seconds * SR));
  let position = 0;
  for (let index = 0; index < out.length; index += 1) {
    out[index] = data[position]!;
    position += 1;
    if (position >= end) position = start;
  }
  return out;
}

function rmsDb(data: Float32Array, from: number, to: number) {
  let energy = 0;
  for (let index = from; index < to; index += 1) energy += data[index]! ** 2;
  return 10 * Math.log10(energy / (to - from));
}

function maxStep(data: Float32Array, from = 1, to = data.length) {
  let step = 0;
  for (let index = Math.max(1, from); index < to; index += 1) step = Math.max(step, Math.abs(data[index]! - data[index - 1]!));
  return step;
}

test('sustaining instruments loop; plucked and struck ones fade out', () => {
  for (const name of ['violin', 'viola', 'cello', 'contrabass', 'flute', 'oboe', 'clarinet', 'bassoon', 'alto_sax', 'tenor_sax', 'trumpet', 'french_horn', 'trombone', 'tuba', 'church_organ', 'choir_aahs', 'string_ensemble_1']) {
    assert.equal(isSustainingSoundfont(name), true, name);
  }
  for (const name of ['acoustic_grand_piano', 'acoustic_guitar_nylon', 'acoustic_guitar_steel', 'electric_guitar_clean', 'orchestral_harp', 'electric_bass_finger', 'acoustic_bass', 'pizzicato_strings', 'synth_drum', '']) {
    assert.equal(isSustainingSoundfont(name), false, name);
  }
  assert.equal(shouldLoopNote(LOOP_MIN_NOTE_SECONDS), false);
  assert.equal(shouldLoopNote(3), true);
  assert.equal(shouldLoopNote(1), false);
});

// An equal-power crossfade of two correlated (in-phase) signals can rise by up to 3 dB inside the
// fade, so sample-to-sample steps there may grow by up to √2; a discontinuity would be far larger.
const CROSSFADE_STEP_ALLOWANCE = Math.SQRT2 * 1.02;

test('a looped sine has no step at the seam', () => {
  const data = sine();
  const naturalStep = maxStep(data);
  assert.equal(bakeCrossfadeLoop(data, SR), true);
  const played = playLooped(data, 8);
  const end = Math.round(SAMPLE_LOOP.loopEnd * SR);
  // At the seam (loopEnd -> loopStart) the next sample continues the previous one.
  const seam = Math.abs(played[end]! - played[end - 1]!);
  assert.ok(seam <= naturalStep * 1.02, `seam step ${seam} vs natural ${naturalStep}`);
  // The loop wraps three times in 8 s; nowhere is there a jump.
  assert.ok(maxStep(played) <= naturalStep * CROSSFADE_STEP_ALLOWANCE, `max step ${maxStep(played)} vs natural ${naturalStep}`);
});

test('a looped noise keeps its level across the crossfade and the seam (within 1 dB)', () => {
  const data = noise(7);
  const reference = rmsDb(data, Math.round(0.5 * SR), Math.round(2.5 * SR));
  bakeCrossfadeLoop(data, SR);
  const played = playLooped(data, 10);
  const window = Math.round(0.05 * SR);
  for (let from = Math.round(0.5 * SR); from + window < played.length; from += window / 2) {
    const level = rmsDb(played, from, from + window);
    assert.ok(Math.abs(level - reference) <= 1, `RMS at ${(from / SR).toFixed(3)} s is ${level.toFixed(2)} dB, reference ${reference.toFixed(2)} dB`);
  }
});

test('a tonal sample is looped in phase, so the crossfade keeps its level', () => {
  // 233.3 Hz: the nominal loop (2.0 s) holds 466.6 periods, so the nominal crossfade would blend
  // two segments 0.6 period apart and partly cancel.
  const frequency = 233.3;
  const data = Float32Array.from({ length: LENGTH }, (_, index) => 0.4 * Math.sin((2 * Math.PI * frequency * index) / SR));
  const loopStart = findAlignedLoopStart([data], SR);
  const periods = (SAMPLE_LOOP.loopEnd - loopStart) * frequency;
  assert.ok(Math.abs(periods - Math.round(periods)) < 0.05, `the loop holds ${periods.toFixed(3)} periods`);
  const naturalStep = maxStep(data);
  bakeCrossfadeLoop(data, SR, { ...SAMPLE_LOOP, loopStart });
  const start = Math.round(loopStart * SR);
  const end = Math.round(SAMPLE_LOOP.loopEnd * SR);
  const out = new Float32Array(SR * 6);
  let position = 0;
  for (let index = 0; index < out.length; index += 1) {
    out[index] = data[position]!;
    position += 1;
    if (position >= end) position = start;
  }
  const reference = 10 * Math.log10(0.4 ** 2 / 2);
  const window = Math.round(0.05 * SR);
  for (let from = Math.round(0.5 * SR); from + window < out.length; from += window) {
    const level = rmsDb(out, from, from + window);
    assert.ok(Math.abs(level - reference) <= 0.5, `RMS at ${(from / SR).toFixed(2)} s: ${level.toFixed(2)} dB`);
  }
  assert.ok(maxStep(out) <= naturalStep * 1.05, 'in phase: no step anywhere');
});

test('a note that plays through the loop region without looping hears no seam', () => {
  const data = sine(330);
  const naturalStep = maxStep(data);
  bakeCrossfadeLoop(data, SR);
  const end = Math.round(SAMPLE_LOOP.loopEnd * SR);
  assert.ok(Math.abs(data[end]! - data[end - 1]!) <= naturalStep * 1.02, 'continuous across loopEnd');
  assert.ok(maxStep(data) <= naturalStep * CROSSFADE_STEP_ALLOWANCE, 'continuous to the end of the sample');
});

test('the end fade reaches silence at the last frame without a step', () => {
  const data = new Float32Array(LENGTH).fill(0.5);
  applyEndFade(data, SR);
  assert.equal(data[data.length - 1], 0);
  assert.equal(data[0], 0.5);
  const frames = Math.round(SAMPLE_END_FADE_SECONDS * SR);
  assert.ok(Math.abs(data[data.length - frames - 1]! - 0.5) < 1e-9, 'untouched before the fade');
  assert.ok(maxStep(data) < 0.5 * (Math.PI / frames), 'cosine fade without a step');
});

test('prepareSoundfontBuffers loops sustaining samples in place and fades all of them', () => {
  const make = (fill: (data: Float32Array) => void) => {
    const buffer = new FakeAudioBuffer(2, LENGTH, SR);
    fill(buffer.getChannelData(0));
    fill(buffer.getChannelData(1));
    return buffer;
  };
  const violin = { 60: make((data) => data.set(sine(262))), 61: make((data) => data.set(sine(277))) };
  const looped = prepareSoundfontBuffers(violin, 'violin');
  assert.deepEqual([...looped.keys()].sort(), [60, 61]);
  for (const loop of looped.values()) {
    assert.equal(loop.loopEnd, SAMPLE_LOOP.loopEnd);
    assert.ok(Math.abs(loop.loopStart - SAMPLE_LOOP.loopStart) <= LOOP_START_SEARCH_SECONDS + 1e-9);
  }
  assert.ok(Math.abs(violin[60].getChannelData(1)[LENGTH - 1]!) < 1e-12, 'faded at the end');

  const piano = { 60: make((data) => data.set(sine(262))) };
  const before = piano[60].getChannelData(0).slice(0, Math.round(3.0 * SR));
  assert.equal(prepareSoundfontBuffers(piano, 'acoustic_grand_piano').size, 0, 'decaying samples do not loop');
  assert.deepEqual(piano[60].getChannelData(0).slice(0, Math.round(3.0 * SR)), before, 'a decaying sample only changes in its last 50 ms');

  const short = { 60: new FakeAudioBuffer(1, Math.round(2 * SR), SR) };
  assert.equal(canBakeLoop(short[60].length, SR), false);
  assert.equal(prepareSoundfontBuffers(short, 'violin').size, 0, 'a sample shorter than loopEnd cannot loop');
  assert.equal(prepareSoundfontBuffers({ 60: { not: 'a buffer' } }, 'violin').size, 0);
  assert.equal(prepareSoundfontBuffers(undefined, 'violin').size, 0);
});
