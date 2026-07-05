import test from 'node:test';
import assert from 'node:assert/strict';

import { chooseGuitarFingeringForPitch, fretForMidiOnString, resolveGuitarFretPitch, resolveGuitarTuning } from '../src/score-input/guitar-fretboard.ts';

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

test('fretForMidiOnString finds the fret that keeps the pitch on the target string', () => {
  // B4 (midi 71): 7th fret on the high E string ↔ 12th fret on the B string.
  assert.equal(fretForMidiOnString(71, 1), 7);
  assert.equal(fretForMidiOnString(71, 2), 12);
  assert.equal(fretForMidiOnString(71, 3), 16);
  assert.equal(fretForMidiOnString(71, 4), 21);
});

test('fretForMidiOnString rejects strings that cannot reach the pitch', () => {
  // B4 is beyond the 24th fret on the A and low E strings.
  assert.equal(fretForMidiOnString(71, 5), null);
  assert.equal(fretForMidiOnString(71, 6), null);
  // E2 sits below the open pitch of every string but the low E.
  assert.equal(fretForMidiOnString(40, 6), 0);
  assert.equal(fretForMidiOnString(40, 5), null);
});

test('fretForMidiOnString honors alternate tunings', () => {
  // D2 (midi 38) is the open 6th string in drop D but unreachable in standard.
  assert.equal(fretForMidiOnString(38, 6, resolveGuitarTuning('drop-d')), 0);
  assert.equal(fretForMidiOnString(38, 6), null);
});

test('chooseGuitarFingeringForPitch keeps a reachable preferred string', () => {
  assert.deepEqual(
    chooseGuitarFingeringForPitch({ step: 'D', alter: 0, octave: 4 }, undefined, 2),
    { string: 2, fret: 3 },
  );
});

test('chooseGuitarFingeringForPitch falls back to a low playable fret', () => {
  assert.deepEqual(
    chooseGuitarFingeringForPitch({ step: 'G', alter: 0, octave: 2 }, undefined, 5),
    { string: 6, fret: 3 },
  );
});
