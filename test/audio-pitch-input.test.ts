import test from 'node:test';
import assert from 'node:assert/strict';
import {
  detectPitchesFromSpectrum,
  MicrophoneNoteGate,
} from '@/src/score-input/audio-pitch-input';

const SAMPLE_RATE = 48_000;
const FFT_SIZE = 16_384;

function midiToFrequency(midi: number) {
  return 440 * (2 ** ((midi - 69) / 12));
}

function syntheticSpectrum(notes: Array<{ midi: number; levelDb?: number }>) {
  const spectrum = new Float32Array(FFT_SIZE / 2);
  spectrum.fill(-105);
  const binWidth = SAMPLE_RATE / FFT_SIZE;
  for (const { midi, levelDb = -30 } of notes) {
    const fundamental = midiToFrequency(midi);
    for (let harmonic = 1; harmonic <= 4; harmonic += 1) {
      const bin = Math.round((fundamental * harmonic) / binWidth);
      if (bin >= spectrum.length) continue;
      spectrum[bin] = levelDb - (harmonic - 1) * 9;
      if (bin > 0) spectrum[bin - 1] = spectrum[bin] - 5;
      if (bin + 1 < spectrum.length) spectrum[bin + 1] = spectrum[bin] - 5;
    }
  }
  return spectrum;
}

test('microphone spectrum detection resolves one played pitch without writing its overtones', () => {
  const detected = detectPitchesFromSpectrum(
    syntheticSpectrum([{ midi: 60 }]),
    { sampleRate: SAMPLE_RATE, fftSize: FFT_SIZE },
  );
  assert.deepEqual(detected.map((pitch) => pitch.midi), [60]);
});

test('microphone spectrum detection resolves a simultaneous triad as ordered pitches', () => {
  const detected = detectPitchesFromSpectrum(
    syntheticSpectrum([{ midi: 60 }, { midi: 64 }, { midi: 67 }]),
    { sampleRate: SAMPLE_RATE, fftSize: FFT_SIZE },
  );
  assert.deepEqual(detected.map((pitch) => pitch.midi), [60, 64, 67]);
});

test('microphone spectrum detection ignores background below the notation threshold', () => {
  const detected = detectPitchesFromSpectrum(
    syntheticSpectrum([{ midi: 69, levelDb: -98 }]),
    { sampleRate: SAMPLE_RATE, fftSize: FFT_SIZE },
  );
  assert.deepEqual(detected, []);
});

test('microphone spectrum detection accepts a quiet instrument tone above its local noise floor', () => {
  const detected = detectPitchesFromSpectrum(
    syntheticSpectrum([{ midi: 57, levelDb: -80 }]),
    { sampleRate: SAMPLE_RATE, fftSize: FFT_SIZE },
  );
  assert.deepEqual(detected.map((pitch) => pitch.midi), [57]);
});

test('microphone note gate emits a stable attack once and rearms after silence', () => {
  const gate = new MicrophoneNoteGate({ settleMs: 100, releaseMs: 150 });
  assert.equal(gate.push([60], 0), null);
  assert.equal(gate.push([60], 80), null);
  assert.deepEqual(gate.push([60], 110), [60]);
  assert.equal(gate.push([60], 260), null);
  assert.equal(gate.push([], 300), null);
  assert.equal(gate.push([], 460), null);
  assert.equal(gate.push([60], 470), null);
  assert.deepEqual(gate.push([60], 580), [60]);
});

test('microphone note gate waits for a stable chord and ignores chord releases', () => {
  const gate = new MicrophoneNoteGate({ settleMs: 100 });
  assert.equal(gate.push([60], 0), null);
  assert.equal(gate.push([60, 64, 67], 60), null);
  assert.deepEqual(gate.push([60, 64, 67], 120), [60, 64, 67]);
  assert.equal(gate.push([67, 60, 64], 230), null);
  assert.equal(gate.push([60, 64], 360), null);
  assert.equal(gate.push([60], 470), null);
});

test('microphone note gate keeps stable tones when weak spectral candidates fluctuate', () => {
  const gate = new MicrophoneNoteGate({ settleMs: 120 });
  assert.equal(gate.push([60, 71], 0), null);
  assert.equal(gate.push([60, 67], 50), null);
  assert.equal(gate.push([60, 64], 100), null);
  assert.deepEqual(gate.push([60, 64], 140), [60]);
});
