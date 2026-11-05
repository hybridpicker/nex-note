import test from 'node:test';
import assert from 'node:assert/strict';

import { importMusicXmlToCore } from '../src/musicxml-adapter/import/import-musicxml.ts';
import { clickFirstEvent, documentIssues, mountEditor, voiceSummary } from './support/entry-harness.ts';
import { TREBLE, scoreXml } from './support/entry-fixtures.ts';

/*
 * T on the last position of the score (iteration 35). MuseScore EditTie::cmdAddTie (read from
 * musescore/MuseScore main, src/engraving/editing/edittie.cpp): it moves the input position to the
 * next slot, and `if (is.beyondScore()) { score->appendMeasures(1); is.moveToNextInputPos(); }`, then
 * adds the tied note there. So the tie appends one bar and writes in it.
 */

const oneBar = scoreXml({ beats: 4, beatType: 4, measures: 1, parts: [TREBLE] });
const measureCount = (xml: string) => importMusicXmlToCore(xml).score.parts[0]!.staves[0]!.measures.length;

function start() {
  const harness = mountEditor(oneBar);
  clickFirstEvent(harness, {});
  return harness;
}

test('T after a note in the last position appends a bar with the tied note, in one Undo step', () => {
  const harness = start();
  harness.press('N 5 c d e f');
  const before = harness.batches.length;
  harness.press('T');
  harness.rerender();
  assert.equal(measureCount(harness.xml), 2);
  assert.deepEqual(voiceSummary(harness.xml, {}).slice(3, 6), ['m1@3 F5 quarter~', 'm2@0 F5 quarter', 'm2@1 r quarter']);
  assert.equal(harness.batches.length - before, 1, 'the new bar, the note and the tie are one batch');
  assert.deepEqual(documentIssues(harness.xml), []);
  harness.press('g');
  harness.rerender();
  assert.equal(voiceSummary(harness.xml, {}).find((line) => line.startsWith('m2@1')), 'm2@1 G5 quarter');
  harness.unmount();
});

test('T after a chord in the last position ties every note of the chord', () => {
  const harness = start();
  harness.press('N 5 c d e f Shift+a T');
  harness.rerender();
  assert.equal(measureCount(harness.xml), 2);
  const lines = voiceSummary(harness.xml, {});
  assert.ok(lines.includes('m1@3 F5 quarter~'));
  assert.ok(lines.includes('m1@3 A5(chord) quarter~'));
  assert.ok(lines.includes('m2@0 F5 quarter'));
  assert.ok(lines.includes('m2@0 A5(chord) quarter'));
  assert.deepEqual(documentIssues(harness.xml), []);
  harness.unmount();
});

test('T in voice 2 at the last position appends a bar for voice 2 only', () => {
  const harness = start();
  harness.press('N Cmd+Alt+2 7 c T');
  harness.rerender();
  assert.equal(measureCount(harness.xml), 2);
  assert.deepEqual(voiceSummary(harness.xml, { voice: 2 }), ['m1@0 C5 whole~', 'm2@0 C5 whole']);
  assert.deepEqual(voiceSummary(harness.xml, { voice: 1 }), ['m1@0 r whole', 'm2@0 r whole']);
  assert.deepEqual(documentIssues(harness.xml), []);
  harness.unmount();
});

test('T after a rest in the last position changes nothing', () => {
  const harness = start();
  harness.press('N 5 c d e 0');
  const xml = harness.xml;
  harness.press('T');
  harness.rerender();
  assert.equal(harness.xml, xml);
  harness.unmount();
});
