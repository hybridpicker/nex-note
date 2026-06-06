import test from 'node:test';
import assert from 'node:assert/strict';

import { resolveDragTransposePitch } from '../src/score-input/transpose-logic.ts';

test('same staff-step drag yields different chromatic and diatonic pitches', () => {
  const startNote = { step: 'C', alter: 0, octave: 4 };

  const diatonic = resolveDragTransposePitch({
    note: startNote,
    deltaStaffSteps: 2,
    mode: 'diatonic',
    keyFifths: 0,
  });
  const chromatic = resolveDragTransposePitch({
    note: startNote,
    deltaStaffSteps: 2,
    mode: 'chromatic',
    keyFifths: 0,
  });

  assert.equal(diatonic.pitch, 64);
  assert.equal(diatonic.spelling, 'E');
  assert.equal(chromatic.pitch, 62);
  assert.notEqual(chromatic.pitch, diatonic.pitch);
});

test('diatonic transpose respects key signature spelling', () => {
  const result = resolveDragTransposePitch({
    note: { step: 'G', alter: 0, octave: 4 },
    deltaStaffSteps: 1,
    mode: 'diatonic',
    keyFifths: -3,
  });

  assert.equal(result.pitch, 68);
  assert.equal(result.spelling, 'Ab');
});
