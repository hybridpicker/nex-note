import test from 'node:test';
import assert from 'node:assert/strict';

import {
  formatPreparedDurationPitches,
  prepareDurationPitch,
  updatePreparedDurationPitches,
} from '../src/score-input/input-by-duration.ts';

test('duration-input pitch preparation uses standard MIDI octave numbering', () => {
  assert.equal(prepareDurationPitch({ step: 'C', octave: 4, alter: 0 }).midi, 60);
  assert.equal(prepareDurationPitch({ step: 'F', octave: 4, alter: 1 }).midi, 66);
});

test('duration-input chord preparation is ordered and deduplicated', () => {
  const c4 = prepareDurationPitch({ step: 'C', octave: 4, alter: 0 });
  const e4 = prepareDurationPitch({ step: 'E', octave: 4, alter: 0 });
  const g4 = prepareDurationPitch({ step: 'G', octave: 4, alter: 0 });
  const prepared = updatePreparedDurationPitches(
    updatePreparedDurationPitches([g4, c4], e4, 'add'),
    c4,
    'add',
  );

  assert.deepEqual(prepared.map((pitch) => pitch.midi), [60, 64, 67]);
  assert.equal(formatPreparedDurationPitches(prepared), 'C4+E4+G4');
});
