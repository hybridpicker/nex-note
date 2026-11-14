import test from 'node:test';
import assert from 'node:assert/strict';
import { GuitarChordAnalyzer } from '@/src/score-input/guitar-chord-analyzer';
import { render, type Pluck } from './support/guitar-signal';

/** Ten overtones falling as 1/n: brighter than the tracker tests use, so overtones reach into higher notes. */
const BRIGHT = Array.from({ length: 10 }, (_, index) => 1 / (index + 1));
const BRIGHT_DECAYS = [0.9, 0.6, 0.45, 0.35, 0.3, 0.25, 0.2, 0.18, 0.16, 0.15];

interface StrumOptions {
  sampleRate?: number;
  /** Seconds between two strings of the strum. */
  spread?: number;
  /** Relative loudness per string, lowest first; the last value repeats. */
  amplitudes?: number[];
  harmonics?: number[];
  windowMs?: number;
}

/** Renders a strum and analyses the block that starts 20 ms after its last string. */
function chordOf(midis: number[], options: StrumOptions = {}) {
  const {
    sampleRate = 48_000, spread = 0.008, amplitudes = [0.2], harmonics = BRIGHT, windowMs = 180,
  } = options;
  const start = 0.1;
  const plucks: Pluck[] = midis.map((midi, index) => ({
    midi,
    at: start + index * spread,
    until: 1,
    amplitude: amplitudes[Math.min(index, amplitudes.length - 1)]!,
    harmonics,
    decays: BRIGHT_DECAYS,
  }));
  const samples = render(sampleRate, 1, plucks);
  const window = Math.round((windowMs / 1000) * sampleRate);
  const first = Math.round((start + (midis.length - 1) * spread + 0.02) * sampleRate);
  const analyzer = new GuitarChordAnalyzer(sampleRate, window);
  return analyzer.analyze(Float64Array.from(samples.subarray(first, first + window))).map((note) => note.midi);
}

const CHORDS: Array<[string, number[]]> = [
  ['E major', [40, 47, 52, 56, 59, 64]],
  ['E minor', [40, 47, 52, 55, 59, 64]],
  ['A major', [45, 52, 57, 61, 64]],
  ['A minor', [45, 52, 57, 60, 64]],
  ['D major', [50, 57, 62, 66]],
  ['D minor', [50, 57, 62, 65]],
  ['G major', [43, 47, 50, 55, 59, 67]],
  ['G7', [43, 47, 50, 55, 59, 65]],
  ['C major', [48, 52, 55, 60, 64]],
  ['F major barre', [41, 48, 53, 57, 60, 65]],
  ['B flat major barre', [46, 53, 58, 62, 65]],
  ['B7', [47, 51, 57, 59, 66]],
  ['E5 power chord', [40, 47, 52]],
];

/** A string whose fundamental lies on no overtone of a lower string of the chord cannot be mistaken for one. */
function unmistakable(midis: number[]) {
  return midis.filter((midi) => !midis.some((lower) => {
    if (lower >= midi) return false;
    const ratio = 2 ** ((midi - lower) / 12);
    const harmonic = Math.round(ratio);
    return harmonic >= 2 && Math.abs(1200 * Math.log2(ratio / harmonic)) < 35;
  }));
}

// A doubled octave and a loud overtone can look alike, so what a full chord
// yields is stated as what must hold, over several strum speeds and tunings,
// not as one exact list per chord.
const DETUNE = [0.03, -0.02, 0.04, -0.03, 0.02, -0.04];
for (const [name, midis] of CHORDS) {
  test(`a strummed ${name} keeps its bass, its pitch classes and every string that is no doubling`, () => {
    for (const sampleRate of [44_100, 48_000]) {
      for (const spread of [0.003, 0.008, 0.013, 0.02]) {
        for (const detuned of [false, true]) {
          const played = midis.map((midi, index) => midi + (detuned ? DETUNE[index]! : 0));
          const written = chordOf(played, { sampleRate, spread });
          const where = `${sampleRate} Hz, ${spread * 1000} ms between strings${detuned ? ', detuned' : ''}: ${written}`;
          assert.equal(written[0], midis[0], `bass note (${where})`);
          assert.ok(written.length <= 6, `at most six notes (${where})`);
          assert.ok(
            written.every((note) => midis.some((midi) => (note - midi) % 12 === 0)),
            `only notes of the chord, in some octave (${where})`,
          );
          assert.ok(
            unmistakable(midis).every((midi) => written.includes(midi)),
            `every string that is no doubling (${where})`,
          );
          assert.ok(
            midis.filter((midi) => !written.includes(midi)).length <= 2,
            `at most two doublings left out (${where})`,
          );
        }
      }
    }
  });
}

test('a chord without doublings is read exactly', () => {
  // C major seven in a drop voicing: no string lies on an overtone of another.
  assert.deepEqual(chordOf([48, 55, 59, 64]), [48, 55, 59, 64]);
  assert.deepEqual(chordOf([48, 55, 59, 64], { sampleRate: 44_100, spread: 0.015 }), [48, 55, 59, 64]);
});

test('strings of unequal loudness are read when none is a doubling', () => {
  assert.deepEqual(
    chordOf([48, 55, 59, 64], { amplitudes: [0.3, 0.1, 0.2, 0.08] }),
    [48, 55, 59, 64],
  );
});

test('two notes a third apart are read as two notes', () => {
  assert.deepEqual(chordOf([55, 59]), [55, 59]);
});

test('two strings an octave apart are read as two notes', () => {
  const written = chordOf([40, 52], { spread: 0.008 });
  assert.deepEqual(written.slice(0, 2), [40, 52]);
});

for (const midi of [40, 45, 50, 55, 59, 64, 76]) {
  test(`a single note (MIDI ${midi}) is not turned into a chord by its overtones`, () => {
    assert.deepEqual(chordOf([midi]), [midi]);
  });
}

test('a single low string whose second harmonic is stronger stays one note', () => {
  const weakFundamental = [0.3, 0.6, 0.4, 0.3, 0.24, 0.2, 0.17, 0.15];
  assert.deepEqual(chordOf([40], { harmonics: weakFundamental }), [40]);
});

test('silence and a block that is too short hold no chord', () => {
  const analyzer = new GuitarChordAnalyzer(48_000, 8640);
  assert.deepEqual(analyzer.analyze(new Float64Array(8640)), []);
  assert.deepEqual(analyzer.analyze(new Float64Array(32).fill(0.5)), []);
});
