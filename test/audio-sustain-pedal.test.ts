import assert from 'node:assert/strict';
import test from 'node:test';
import { Midi } from '@tonejs/midi';

import { SUSTAIN_PEDAL_CONTROLLER, applySustainPedal, sustainPedalIntervals } from '../lib/playback-midi-controllers.ts';

const end = (note: { time: number; duration: number }) => Number((note.time + note.duration).toFixed(6));

test('pedal 6.0-7.5 s makes the notes starting at 6.0, 6.5 and 7.0 end at 7.5', () => {
  const notes = [
    { time: 6.0, duration: 0.4, midi: 60 },
    { time: 6.5, duration: 0.4, midi: 64 },
    { time: 7.0, duration: 0.4, midi: 67 },
  ];
  const pedal = [{ time: 6.0, value: 1 }, { time: 7.5, value: 0 }];
  const sustained = applySustainPedal(notes, pedal);
  assert.deepEqual(sustained.map(end), [7.5, 7.5, 7.5]);
  assert.deepEqual(notes.map(end), [6.4, 6.9, 7.4], 'the input is not changed');
});

test('notes released outside the pedal keep their length; notes longer than the pedal too', () => {
  const pedal = [{ time: 1, value: 1 }, { time: 2, value: 0 }];
  const sustained = applySustainPedal([
    { time: 0, duration: 0.5, midi: 60 }, // released before the pedal goes down
    { time: 1.5, duration: 1.5, midi: 62 }, // released after the pedal lifts
    { time: 2.5, duration: 0.2, midi: 64 }, // after the pedal
  ], pedal);
  assert.deepEqual(sustained.map(end), [0.5, 3, 2.7]);
});

test('a re-struck pitch ends the held note at the new onset', () => {
  const pedal = [{ time: 0, value: 1 }, { time: 4, value: 0 }];
  const sustained = applySustainPedal([
    { time: 0, duration: 0.5, midi: 60 },
    { time: 1, duration: 0.5, midi: 60 },
    { time: 2, duration: 0.5, midi: 62 },
  ], pedal);
  assert.deepEqual(sustained.map(end), [1, 4, 4]);
});

test('pedal values are read as down from 64/127; repeated downs and a pedal left down', () => {
  assert.deepEqual(sustainPedalIntervals([
    { time: 0, value: 0.6 },
    { time: 0.5, value: 1 }, // already down
    { time: 1, value: 0.2 },
    { time: 2, value: 0.49 }, // still up
    { time: 3, value: 0.51 },
  ]), [{ down: 0, up: 1 }, { down: 3, up: Number.POSITIVE_INFINITY }]);
  const held = applySustainPedal([
    { time: 3, duration: 0.5, midi: 60 },
    { time: 3.2, duration: 1.8, midi: 64 },
  ], [{ time: 3, value: 1 }]);
  assert.deepEqual(held.map(end), [5, 5], 'a pedal that never lifts holds to the last note-off');
  assert.deepEqual(applySustainPedal([{ time: 0, duration: 1, midi: 60 }], []).map(end), [1]);
});

test('CC64 written by @tonejs/midi is read back as pedal events', () => {
  const midi = new Midi();
  const track = midi.addTrack();
  track.addNote({ midi: 60, time: 6.0, duration: 0.4 });
  track.addNote({ midi: 64, time: 6.5, duration: 0.4 });
  track.addCC({ number: SUSTAIN_PEDAL_CONTROLLER, time: 6.0, value: 1 });
  track.addCC({ number: SUSTAIN_PEDAL_CONTROLLER, time: 7.5, value: 0 });
  const parsed = new Midi(midi.toArray());
  const events = parsed.tracks[0]!.controlChanges[SUSTAIN_PEDAL_CONTROLLER] ?? [];
  const notes = parsed.tracks[0]!.notes.map((note) => ({ time: note.time, duration: note.duration, midi: note.midi }));
  const sustained = applySustainPedal(notes, events.map((event) => ({ time: event.time, value: event.value })));
  sustained.forEach((note) => assert.ok(Math.abs(end(note) - 7.5) < 0.01, `ends at ${end(note)}`));
});
