import assert from 'node:assert/strict';
import test from 'node:test';
import { Midi } from '@tonejs/midi';

import { buildFallbackMidiFromMusicXml } from '../lib/midi-export.ts';
import { buildPlaybackMeasureOrder } from '../lib/playback-measure-order.ts';
import { resolveRenderedMeasureBeatRanges } from '../hooks/usePlayback.ts';
import { importMusicXmlToCore } from '../src/musicxml-adapter/import/import-musicxml.ts';

test('measure order unrolls a repeat with first and second endings', () => {
  assert.equal(buildPlaybackMeasureOrder([{}, {}]), null);
  assert.deepEqual(buildPlaybackMeasureOrder([
    {},
    { leftBarline: 'repeat-start' },
    { leftEnding: { number: '1', type: 'start' }, rightEnding: { number: '1', type: 'stop' }, rightBarline: 'repeat-end' },
    { leftEnding: { number: '2', type: 'start' }, rightEnding: { number: '2', type: 'discontinue' } },
    {},
  ]), [0, 1, 2, 1, 3, 4]);
});

function repeatScoreXml() {
  const measure = (number: number, pitch: string, barlines = '') => `
    <measure number="${number}">
      ${number === 1 ? '<attributes><divisions>1</divisions><time><beats>4</beats><beat-type>4</beat-type></time><clef><sign>G</sign><line>2</line></clef></attributes>' : ''}
      ${barlines}
      <note><pitch><step>${pitch}</step><octave>4</octave></pitch><duration>4</duration><voice>1</voice><type>whole</type></note>
    </measure>`;
  return `<?xml version="1.0" encoding="UTF-8"?>
<score-partwise version="4.0"><part-list><score-part id="P1"><part-name>Piano</part-name></score-part></part-list>
<part id="P1">
  ${measure(1, 'C', '<barline location="left"><bar-style>heavy-light</bar-style><repeat direction="forward"/></barline>')}
  ${measure(2, 'D', '<barline location="left"><ending number="1" type="start"/></barline><barline location="right"><bar-style>light-heavy</bar-style><ending number="1" type="stop"/><repeat direction="backward"/></barline>')}
  ${measure(3, 'E', '<barline location="left"><ending number="2" type="start"/></barline><barline location="right"><ending number="2" type="discontinue"/></barline>')}
</part></score-partwise>`;
}

test('the built-in MIDI renderer plays repeats in the same order as the playback timeline', () => {
  const xml = repeatScoreXml();
  const { data } = buildFallbackMidiFromMusicXml(xml) as { data: Uint8Array };
  const midi = new Midi(data);
  const notes = midi.tracks.flatMap((track) => track.notes).sort((a, b) => a.ticks - b.ticks);
  // C (m1), D (first ending), C (m1 again), E (second ending).
  assert.deepEqual(notes.map((note) => note.midi), [60, 62, 60, 64]);
  assert.deepEqual(notes.map((note) => note.time), [0, 2, 4, 6]);
});

test('the playhead follows the written order when a rendering did not unroll repeats', () => {
  const document = importMusicXmlToCore(repeatScoreXml());
  const parsedFor = (times: number[]) => ({
    rawNotes: [],
    notes: times.map((time) => ({ time, duration: 2, midi: 60, velocity: 0.8 })),
    tempos: [{ bpm: 120, time: 0 }],
    durationSeconds: 8,
    timeSignatureNumerator: 4,
    timeSignatureDenominator: 4,
  });
  // Unrolled rendering (4 measures of sound): the unrolled order.
  assert.deepEqual(resolveRenderedMeasureBeatRanges(document, parsedFor([0, 2, 4, 6])).map((range) => range.measureNumber), [1, 2, 1, 3]);
  // A rendering that played every measure once (3 measures of sound): the written order.
  assert.deepEqual(resolveRenderedMeasureBeatRanges(document, parsedFor([0, 2, 4])).map((range) => range.measureNumber), [1, 2, 3]);
});
