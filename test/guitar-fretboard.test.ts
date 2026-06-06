import test from 'node:test';
import assert from 'node:assert/strict';

import { resolveGuitarFretPitch, resolveGuitarTuning } from '../src/score-input/guitar-fretboard.ts';

test('resolveGuitarFretPitch maps standard guitar strings and frets to score pitches', () => {
  assert.deepEqual(
    resolveGuitarFretPitch(6, 0),
    { string: 6, fret: 0, step: 'E', octave: 2, alter: 0, label: 'E2', midi: 40 },
  );
  assert.deepEqual(
    resolveGuitarFretPitch(5, 3),
    { string: 5, fret: 3, step: 'C', octave: 3, alter: 0, label: 'C3', midi: 48 },
  );
  assert.deepEqual(
    resolveGuitarFretPitch(3, 1),
    { string: 3, fret: 1, step: 'G', octave: 3, alter: 1, label: 'G#3', midi: 56 },
  );
});

test('resolveGuitarFretPitch honors alternate guitar tunings', () => {
  assert.deepEqual(
    resolveGuitarFretPitch(6, 0, resolveGuitarTuning('drop-d')),
    { string: 6, fret: 0, step: 'D', octave: 2, alter: 0, label: 'D2', midi: 38 },
  );
  assert.deepEqual(
    resolveGuitarFretPitch(1, 0, resolveGuitarTuning('dadgad')),
    { string: 1, fret: 0, step: 'D', octave: 4, alter: 0, label: 'D4', midi: 62 },
  );
  assert.deepEqual(
    resolveGuitarFretPitch(5, 0, resolveGuitarTuning('open-g')),
    { string: 5, fret: 0, step: 'G', octave: 2, alter: 0, label: 'G2', midi: 43 },
  );
});
