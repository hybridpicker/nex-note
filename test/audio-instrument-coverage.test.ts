import assert from 'node:assert/strict';
import test from 'node:test';

import { MIDI_INSTRUMENTS } from '../lib/midi-instruments.ts';
import { AUTO_PAN_TABLE, resolveAutoPanTable } from '../lib/playback-bus.ts';
import { INSTRUMENT_ENVELOPES, isSustainingInstrument, isSustainingSoundfont } from '../lib/sample-loop.ts';

const ids = Object.keys(MIDI_INSTRUMENTS) as Array<keyof typeof MIDI_INSTRUMENTS>;

test('every instrument has a seat in the auto-seating pan table', () => {
  for (const id of ids) {
    const pan = (AUTO_PAN_TABLE as Record<string, number>)[id];
    assert.equal(typeof pan, 'number', `${id} has no pan value`);
    assert.ok(pan >= -1 && pan <= 1, `${id} pan ${pan}`);
  }
  assert.deepEqual(Object.keys(AUTO_PAN_TABLE).filter((id) => !(id in MIDI_INSTRUMENTS)), [], 'no pan for unknown ids');
});

test('every instrument is classified as sustaining or decaying, like the soundfont set it plays', () => {
  for (const id of ids) {
    const envelope = (INSTRUMENT_ENVELOPES as Record<string, string>)[id];
    assert.ok(envelope === 'sustaining' || envelope === 'decaying', `${id} has no envelope class`);
    // Loops are baked per soundfont set: a sustaining instrument on a decaying set would cut off.
    assert.equal(isSustainingInstrument(id), isSustainingSoundfont(MIDI_INSTRUMENTS[id].soundfont), `${id} (${MIDI_INSTRUMENTS[id].soundfont})`);
  }
  assert.deepEqual(Object.keys(INSTRUMENT_ENVELOPES).filter((id) => !(id in MIDI_INSTRUMENTS)), []);
});

test('the new instruments sit with their families', () => {
  const near = (id: string, family: string, tolerance: number) => {
    const table = AUTO_PAN_TABLE as Record<string, number>;
    assert.ok(Math.abs(table[id]! - table[family]!) <= tolerance, `${id} ${table[id]} vs ${family} ${table[family]}`);
  };
  for (const sax of ['sax-soprano', 'sax-tenor', 'sax-baritone']) near(sax, 'sax-alto-eb', 0.2);
  near('cornet', 'trumpet-bb', 0.1);
  near('flugelhorn', 'trumpet-bb', 0.1);
  near('euphonium', 'trombone', 0.1);
  near('piccolo', 'flute', 0.1);
  near('english-horn', 'oboe', 0.1);
  near('contrabassoon', 'bassoon', 0.1);
  for (const mallet of ['celesta', 'glockenspiel', 'vibraphone', 'marimba', 'xylophone', 'harpsichord', 'timpani', 'banjo']) {
    assert.equal(isSustainingInstrument(mallet), false, `${mallet} decays`);
  }
  for (const held of ['accordion', 'strings', 'piccolo', 'recorder', 'english-horn', 'contrabassoon', 'cornet', 'flugelhorn', 'euphonium']) {
    assert.equal(isSustainingInstrument(held), true, `${held} sustains`);
  }
  const band = resolveAutoPanTable([{ id: 'a', instrumentId: 'cornet' }, { id: 'b', instrumentId: 'euphonium' }]);
  assert.deepEqual([band.get('a'), band.get('b')], [0.15, 0.3]);
});
