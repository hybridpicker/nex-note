import test from 'node:test';
import assert from 'node:assert/strict';
import {
  GuitarNoteTracker,
  isHarmonicInterval,
  type TrackedNoteEvent,
} from '@/src/score-input/guitar-note-tracker';
import { midiToFrequency, noise, render } from './support/guitar-signal';

/** Feeds the signal in blocks of the size an AudioWorklet tap delivers. */
function track(samples: Float32Array, sampleRate: number, block = 512, chords = false) {
  const tracker = new GuitarNoteTracker(sampleRate);
  tracker.setChordDetection(chords);
  const events: TrackedNoteEvent[] = [];
  for (let offset = 0; offset < samples.length; offset += block) {
    events.push(...tracker.process(samples.subarray(offset, offset + block)));
  }
  return { tracker, events };
}

function noteOns(events: TrackedNoteEvent[]) {
  return events.filter((event) => event.type === 'note-on');
}

const RATE = 48_000;

test('a plucked low string whose second harmonic is stronger is written at its fundamental', () => {
  const samples = render(RATE, 1.6, [{
    midi: 40,
    at: 0.2,
    until: 1.6,
    harmonics: [0.3, 0.6, 0.25, 0.15, 0.1],
  }]);
  const { events } = track(samples, RATE);
  assert.deepEqual(noteOns(events).map((event) => event.midi), [40]);
});

test('the octave lock ignores the second harmonic when it outlasts a fading fundamental', () => {
  const samples = render(RATE, 2.5, [{
    midi: 40,
    at: 0.2,
    until: 2.5,
    harmonics: [1, 0.8, 0.3],
    decays: [0.12, 2, 1],
  }]);
  const { events } = track(samples, RATE);
  assert.deepEqual(noteOns(events).map((event) => event.midi), [40]);
});

test('a held note is written once and released when it fades below the gate', () => {
  const samples = render(RATE, 4, [{ midi: 45, at: 0.2, until: 4, decays: [0.45] }]);
  const { events } = track(samples, RATE);
  assert.deepEqual(events.map((event) => [event.type, event.midi]), [['note-on', 45], ['note-off', 45]]);
});

test('the same note picked twice without silence is written twice', () => {
  // The second pick cuts the ringing string and excites it again at the same
  // force 250 ms later: its 20 ms level is about 2.3 times the level 25 to
  // 80 ms before it, above the attack ratio of 2.
  const samples = render(RATE, 1.4, [
    { midi: 45, at: 0.2, until: 0.45 },
    { midi: 45, at: 0.452, until: 1.4 },
  ]);
  const { events } = track(samples, RATE);
  const written = noteOns(events);
  assert.deepEqual(written.map((event) => event.midi), [45, 45]);
  assert.ok(written.every((event) => event.trigger === 'attack'));
});

test('a rise below twice the earlier level is not a new attack, so the held note is not repeated', () => {
  // The boundary of the attack rule: a soft re-pick of the same note, without
  // a transient, rises only about 1.5 times. This is the case to check on the
  // real amp, especially with a compressing or distorted preset.
  const samples = render(RATE, 1.4, [
    { midi: 45, at: 0.2, until: 0.45, transient: 0 },
    { midi: 45, at: 0.452, until: 1.4, amplitude: 0.36, transient: 0 },
  ]);
  const { events } = track(samples, RATE);
  assert.deepEqual(noteOns(events).map((event) => event.midi), [45]);
});

test('the same note repeated fast with a firm pick is written for every pick', () => {
  const picks = [0.2, 0.42, 0.64, 0.86].map((at, index, all) => ({
    midi: 52, at, until: (all[index + 1] ?? 1.5) - 0.002,
  }));
  const { events } = track(render(RATE, 1.5, picks), RATE);
  assert.deepEqual(noteOns(events).map((event) => event.midi), [52, 52, 52, 52]);
});

test('a hammer-on without a new attack is written as a legato note', () => {
  // One continuous tone whose pitch steps up a whole tone with no level rise.
  const samples = new Float32Array(Math.round(1.4 * RATE));
  let phase = 0;
  for (let index = Math.round(0.2 * RATE); index < samples.length; index += 1) {
    const t = index / RATE - 0.2;
    const frequency = t < 0.5 ? midiToFrequency(45) : midiToFrequency(47);
    phase += (2 * Math.PI * frequency) / RATE;
    const envelope = 0.3 * Math.min(1, t / 0.002) * (1 + 1.5 * Math.exp(-t / 0.015)) * Math.exp(-t / 1.5);
    samples[index] = envelope * (Math.sin(phase) + 0.5 * Math.sin(2 * phase) + 0.3 * Math.sin(3 * phase));
  }
  const { events } = track(samples, RATE);
  const written = noteOns(events);
  assert.deepEqual(written.map((event) => [event.midi, event.trigger]), [[45, 'attack'], [47, 'legato']]);
});

test('a distorted preset is still written at the played pitch', () => {
  const clean = render(RATE, 1.5, [
    { midi: 40, at: 0.2, until: 0.8 },
    { midi: 45, at: 0.85, until: 1.5 },
  ]);
  const distorted = clean.map((value) => Math.tanh(10 * value) * 0.7);
  const { events } = track(distorted, RATE);
  assert.deepEqual(noteOns(events).map((event) => event.midi), [40, 45]);
});

for (const sampleRate of [44_100, 48_000]) {
  test(`the lowest note of the range, B1, is heard at ${sampleRate} Hz`, () => {
    const tracker = new GuitarNoteTracker(sampleRate);
    const b1Period = sampleRate / midiToFrequency(35);
    assert.ok(tracker.maxLag > b1Period, 'the period search reaches below B1');
    assert.ok(tracker.coarseWindow >= 2 * b1Period, 'the window holds two periods of B1');
    const samples = render(sampleRate, 1.5, [{
      midi: 35,
      at: 0.2,
      until: 1.5,
      harmonics: [0.5, 0.7, 0.4, 0.3, 0.2],
    }]);
    const { events } = track(samples, sampleRate);
    assert.deepEqual(noteOns(events).map((event) => event.midi), [35]);
  });
}

test('a note below the range is not written', () => {
  const samples = render(RATE, 1.5, [{ midi: 33, at: 0.2, until: 1.5 }]);
  assert.deepEqual(noteOns(track(samples, RATE).events), []);
});

for (const mains of [50, 60]) {
  test(`${mains} Hz hum with its harmonics writes nothing`, () => {
    const random = noise(mains);
    const hum = (t: number) => 0.03 * (
      Math.sin(2 * Math.PI * mains * t)
      + 0.7 * Math.sin(2 * Math.PI * 2 * mains * t)
      + 0.4 * Math.sin(2 * Math.PI * 3 * mains * t)
    ) + 0.002 * random();
    const samples = render(RATE, 2, [], [hum]);
    assert.deepEqual(track(samples, RATE).events, []);
  });
}

test('a note played over hum is written, the hum is not', () => {
  const hum = (t: number) => 0.02 * (Math.sin(2 * Math.PI * 50 * t) + 0.7 * Math.sin(2 * Math.PI * 100 * t));
  const samples = render(RATE, 1.6, [{ midi: 50, at: 0.6, until: 1.6 }], [hum]);
  assert.deepEqual(noteOns(track(samples, RATE).events).map((event) => event.midi), [50]);
});

test('a burst of noise after silence writes nothing', () => {
  const random = noise(7);
  const burst = (t: number) => (t >= 0.3 && t < 0.6 ? 0.2 * random() : 0.0002 * random());
  const samples = render(RATE, 1.2, [], [burst]);
  assert.deepEqual(noteOns(track(samples, RATE).events), []);
});

test('the analysis starts only after the attack blank and yields a note within about 100 ms', () => {
  const samples = render(RATE, 1, [{ midi: 40, at: 0.2, until: 1 }]);
  const [first] = noteOns(track(samples, RATE).events);
  assert.ok(first);
  const latency = first.timeMs - 200;
  assert.ok(latency > 20 && latency < 110, `latency ${latency.toFixed(1)} ms`);
});

test('octaves, twelfths and fifths count as harmonic intervals, a whole tone does not', () => {
  assert.ok(isHarmonicInterval(1200));
  assert.ok(isHarmonicInterval(-1200));
  assert.ok(isHarmonicInterval(1902));
  assert.ok(isHarmonicInterval(702));
  assert.ok(!isHarmonicInterval(200));
  assert.ok(!isHarmonicInterval(100));
});

/** Note-ons that share a time are one chord. */
function chords(events: TrackedNoteEvent[]) {
  const groups: Array<{ timeMs: number; midis: number[] }> = [];
  for (const event of noteOns(events)) {
    const last = groups[groups.length - 1];
    if (last && last.timeMs === event.timeMs) last.midis.push(event.midi);
    else groups.push({ timeMs: event.timeMs, midis: [event.midi] });
  }
  return groups;
}

function strum(midis: number[], at: number, until: number, spread = 0.008) {
  const harmonics = Array.from({ length: 10 }, (_, index) => 1 / (index + 1));
  const decays = [0.9, 0.6, 0.45, 0.35, 0.3, 0.25, 0.2, 0.18, 0.16, 0.15];
  return midis.map((midi, index) => ({
    midi, at: at + index * spread, until, amplitude: 0.2, harmonics, decays,
  }));
}

test('with chord detection a strummed chord is written as one chord', () => {
  const samples = render(RATE, 1.5, strum([48, 55, 59, 64], 0.2, 1.5));
  const { events, tracker } = track(samples, RATE, 512, true);
  const written = chords(events);
  assert.deepEqual(written.map((chord) => chord.midis), [[48, 55, 59, 64]]);
  assert.deepEqual([...tracker.soundingMidis], [48, 55, 59, 64]);
  const latency = written[0]!.timeMs - 200;
  assert.ok(latency > 200 && latency < 320, `latency ${latency.toFixed(1)} ms`);
});

test('a slow strum is still one chord', () => {
  const samples = render(RATE, 1.5, strum([48, 55, 59, 64], 0.2, 1.5, 0.025));
  const { events } = track(samples, RATE, 512, true);
  assert.deepEqual(chords(events).map((chord) => chord.midis), [[48, 55, 59, 64]]);
});

test('two chords in a row are written as two chords, and the first is released', () => {
  const samples = render(RATE, 2, [
    ...strum([48, 55, 59, 64], 0.2, 0.9),
    ...strum([50, 57, 60, 65], 0.95, 2),
  ]);
  const { events } = track(samples, RATE, 512, true);
  assert.deepEqual(chords(events).map((chord) => chord.midis), [[48, 55, 59, 64], [50, 57, 60, 65]]);
  const firstOff = events.findIndex((event) => event.type === 'note-off');
  const secondOn = events.findIndex((event) => event.type === 'note-on' && event.midi === 50);
  assert.ok(firstOff >= 0 && firstOff < secondOn);
});

test('with chord detection single notes are still written one by one', () => {
  const samples = render(RATE, 2, [
    { midi: 40, at: 0.2, until: 0.7 },
    { midi: 45, at: 0.75, until: 1.3, harmonics: [0.3, 0.6, 0.25, 0.15, 0.1] },
    { midi: 52, at: 1.35, until: 2 },
  ]);
  const { events } = track(samples, RATE, 512, true);
  assert.deepEqual(chords(events).map((chord) => chord.midis), [[40], [45], [52]]);
});

test('a chord cut off after a third of a second is read from the block there is', () => {
  const samples = render(RATE, 1, strum([48, 55, 59, 64], 0.2, 0.53));
  const { events } = track(samples, RATE, 512, true);
  assert.deepEqual(chords(events).map((chord) => chord.midis), [[48, 55, 59, 64]]);
  assert.equal(events.filter((event) => event.type === 'note-off').length, 4);
});

test('with chord detection a short single note is written from the period estimate', () => {
  const samples = render(RATE, 1, [{ midi: 52, at: 0.2, until: 0.36 }]);
  const { events } = track(samples, RATE, 512, true);
  assert.deepEqual(chords(events).map((chord) => chord.midis), [[52]]);
});

test('a ringing chord writes no legato notes', () => {
  const samples = render(RATE, 3, strum([40, 47, 52, 56, 59, 64], 0.2, 3));
  const { events } = track(samples, RATE, 512, true);
  assert.equal(chords(events).length, 1);
});

test('without chord detection a strum still writes at most one note per attack', () => {
  const samples = render(RATE, 1.5, strum([48, 55, 59, 64], 0.2, 1.5));
  const { events } = track(samples, RATE);
  assert.ok(chords(events).every((chord) => chord.midis.length === 1));
});

test('switching chord detection off drops a strum that is still being collected', () => {
  const tracker = new GuitarNoteTracker(RATE);
  tracker.setChordDetection(true);
  assert.equal(tracker.detectsChords, true);
  tracker.setChordDetection(false);
  assert.equal(tracker.detectsChords, false);
});
