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
  assert.equal(parseMidiNoteOn([0x90, 64, Number.NaN]), null);
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

import { MidiStepAccumulator, parseMidiInputMessage } from '@/src/score-input/midi-input';

test('held and rolled MIDI chords commit once on final physical release, independent of sustain', () => {
  const input = new MidiStepAccumulator();
  for (const data of [[0x90, 60, 90], [0xb0, 64, 127], [0x90, 64, 80], [0x90, 67, 75], [0x80, 60, 0], [0x90, 64, 0]]) {
    assert.deepEqual(input.accept(data), []);
  }
  assert.deepEqual(input.accept([0x80, 67, 0]), [[60, 64, 67]]);
  assert.deepEqual(input.accept([0xb0, 64, 0]), []);
  assert.deepEqual(input.accept([0x80, 67, 0]), []);
});

test('repeated MIDI attacks remain separate onsets; cancellation and channel reset discard pending chords', () => {
  const input = new MidiStepAccumulator();
  input.accept([0x90, 60, 90]);
  assert.deepEqual(input.accept([0x90, 60, 100]), [[60]]);
  assert.deepEqual(input.accept([0x80, 60, 0]), [[60]]);
  input.accept([0x90, 64, 90]);
  input.reset();
  assert.deepEqual(input.accept([0x80, 64, 0]), []);
  input.accept([0x90, 60, 90]);
  input.accept([0xb0, 123, 0]);
  assert.deepEqual(input.accept([0x80, 60, 0]), []);
  for (const bytes of [[0x90, 60.5, 90], [0x90, 60, 256], [0x190, 60, 90], [0x90, NaN, 90]]) {
    assert.equal(parseMidiInputMessage(bytes), null);
  }
});
