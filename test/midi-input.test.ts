import test from 'node:test';
import assert from 'node:assert/strict';
import {
  midiNoteToPitch,
  normalizeMidiChord,
  parseMidiNoteOn,
  preferFlatsForKeySignature,
} from '@/src/score-input/midi-input';

test('MIDI note-on parsing accepts pitched key presses and rejects release messages', () => {
  assert.deepEqual(parseMidiNoteOn([0x92, 60, 96]), { channel: 2, note: 60, velocity: 96 });
  assert.equal(parseMidiNoteOn([0x82, 60, 64]), null);
  assert.equal(parseMidiNoteOn([0x92, 60, 0]), null);
  assert.equal(parseMidiNoteOn([0xb0, 64, 127]), null);
});

test('MIDI pitch spelling follows the active key signature preference', () => {
  assert.deepEqual(midiNoteToPitch(61, false), { midi: 61, step: 'C', octave: 4, alter: 1 });
  assert.deepEqual(midiNoteToPitch(61, true), { midi: 61, step: 'D', octave: 4, alter: -1 });
  assert.equal(preferFlatsForKeySignature(-3), true);
  assert.equal(preferFlatsForKeySignature(2), false);
});

test('simultaneous MIDI notes become one ordered, de-duplicated chord', () => {
  assert.deepEqual(
    normalizeMidiChord([67, 60, 64, 60]).map((pitch) => `${pitch.step}${pitch.octave}`),
    ['C4', 'E4', 'G4'],
  );
});
