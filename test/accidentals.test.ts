import test from 'node:test';
import assert from 'node:assert/strict';

import { pitchToMidi, resolveNextEnharmonicPitch } from '../src/shared/music/accidentals.ts';

test('enharmonic cycling preserves sounding MIDI and returns after all conventional spellings', () => {
  const start = { step: 'C', alter: 1, octave: 4 };
  const first = resolveNextEnharmonicPitch(start);
  const second = resolveNextEnharmonicPitch(first);
  const third = resolveNextEnharmonicPitch(second);

  assert.deepEqual(first, { step: 'D', alter: -1, octave: 4 });
  assert.deepEqual(second, { step: 'B', alter: 2, octave: 3 });
  assert.deepEqual(third, start);
  assert.deepEqual([start, first, second, third].map(pitchToMidi), [61, 61, 61, 61]);
});

test('enharmonic cycling handles natural and double-accidental octave boundaries', () => {
  const c4 = { step: 'C', alter: 0, octave: 4 };
  const dDoubleFlat4 = resolveNextEnharmonicPitch(c4);
  const bSharp3 = resolveNextEnharmonicPitch(dDoubleFlat4);

  assert.deepEqual(dDoubleFlat4, { step: 'D', alter: -2, octave: 4 });
  assert.deepEqual(bSharp3, { step: 'B', alter: 1, octave: 3 });
  assert.deepEqual(resolveNextEnharmonicPitch(bSharp3), c4);
  assert.equal(pitchToMidi(dDoubleFlat4), pitchToMidi(c4));
  assert.equal(pitchToMidi(bSharp3), pitchToMidi(c4));
});

test('enharmonic cycling is safe at the supported octave boundaries', () => {
  const low = { step: 'C', alter: -2, octave: 0 };
  const high = { step: 'B', alter: 2, octave: 9 };

  assert.equal(pitchToMidi(resolveNextEnharmonicPitch(low)), pitchToMidi(low));
  assert.equal(pitchToMidi(resolveNextEnharmonicPitch(high)), pitchToMidi(high));
});
