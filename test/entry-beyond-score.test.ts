import test from 'node:test';
import assert from 'node:assert/strict';
import { act } from 'react-test-renderer';

import { importMusicXmlToCore } from '../src/musicxml-adapter/import/import-musicxml.ts';
import { clickFirstEvent, documentIssues, mountEditor, selectableNotes, voiceSummary } from './support/entry-harness.ts';
import { BASS, PIANO, TREBLE, scoreXml } from './support/entry-fixtures.ts';

/*
 * Typing past the last position of the score appends one bar and writes there, in one Undo step
 * (iteration 28). MuseScore: NoteInput::addPitch with is.beyondScore() calls appendMeasures(1).
 * nex-note used to leave the cursor on the last note, so the next letter replaced it.
 */

const oneBar = (parts = [TREBLE]) => scoreXml({ beats: 4, beatType: 4, measures: 1, parts });
const measureCount = (xml: string, partIndex = 0) => importMusicXmlToCore(xml).score.parts[partIndex]!.staves[0]!.measures.length;

function start(xml = oneBar(), where: { partIndex?: number; staff?: number; voice?: number } = {}) {
  const harness = mountEditor(xml);
  clickFirstEvent(harness, where);
  return harness;
}

test('the next letter after the last position appends a bar and keeps the last note', () => {
  const harness = start();
  harness.press('N 5 c d e f');
  assert.equal(measureCount(harness.xml), 1);
  const before = harness.batches.length;
  harness.press('g');
  harness.rerender();
  assert.deepEqual(voiceSummary(harness.xml, {}), [
    'm1@0 C5 quarter', 'm1@1 D5 quarter', 'm1@2 E5 quarter', 'm1@3 F5 quarter',
    'm2@0 G5 quarter', 'm2@1 r quarter', 'm2@2 r half',
  ]);
  assert.equal(harness.batches.length - before, 1, 'the new bar and its note are one Undo step');
  assert.deepEqual(documentIssues(harness.xml), []);
  harness.unmount();
});

test('entry keeps going through several appended bars', () => {
  const harness = start();
  harness.press('N 7 c d e');
  harness.rerender();
  assert.deepEqual(voiceSummary(harness.xml, {}), ['m1@0 C5 whole', 'm2@0 D5 whole', 'm3@0 E5 whole']);
  harness.unmount();
});

test('a value that fills the last bar through tied eighths still appends after its tail', () => {
  const harness = start();
  harness.press('N 5 c d e 4 f 5 g');
  harness.rerender();
  assert.deepEqual(voiceSummary(harness.xml, {}).slice(0, 5), [
    'm1@0 C5 quarter', 'm1@1 D5 quarter', 'm1@2 E5 quarter', 'm1@3 F5 eighth', 'm1@3.5 r eighth',
  ]);
  harness.unmount();
});

test('a rest past the last position appends a bar, and the next note follows it', () => {
  const harness = start();
  harness.press('N 5 c d e f 0 g');
  harness.rerender();
  assert.deepEqual(voiceSummary(harness.xml, {}), [
    'm1@0 C5 quarter', 'm1@1 D5 quarter', 'm1@2 E5 quarter', 'm1@3 F5 quarter',
    'm2@0 r quarter', 'm2@1 G5 quarter', 'm2@2 r half',
  ]);
  harness.unmount();
});

test('a rest as the last value of the score also appends for the next note', () => {
  const harness = start();
  harness.press('N 5 c d e 0 f');
  harness.rerender();
  assert.deepEqual(voiceSummary(harness.xml, {}), [
    'm1@0 C5 quarter', 'm1@1 D5 quarter', 'm1@2 E5 quarter', 'm1@3 r quarter',
    'm2@0 F5 quarter', 'm2@1 r quarter', 'm2@2 r half',
  ]);
  harness.unmount();
});

test('an accidental applies to the note in the appended bar and is used up', () => {
  const harness = start();
  harness.press('N 7 c + d e');
  harness.rerender();
  assert.deepEqual(voiceSummary(harness.xml, {}), ['m1@0 C5 whole', 'm2@0 D#5 whole', 'm3@0 E5 whole']);
  harness.unmount();
});

test('the left hand of a grand staff appends for both staves', () => {
  const harness = start(oneBar([PIANO]), { staff: 2, voice: 5 });
  harness.press('N 7 c d');
  harness.rerender();
  assert.deepEqual(voiceSummary(harness.xml, { staff: 2, voice: 5 }), ['m1@0 C3 whole', 'm2@0 D3 whole']);
  assert.deepEqual(voiceSummary(harness.xml, { staff: 1 }), ['m1@0 r whole', 'm2@0 r whole']);
  harness.unmount();
});

test('every part gets the appended bar, and only the entered part gets the note', () => {
  const harness = start(oneBar([TREBLE, { ...BASS, id: 'P2' }]), { partIndex: 1 });
  harness.press('N 7 c d');
  harness.rerender();
  assert.deepEqual(voiceSummary(harness.xml, { partIndex: 1 }), ['m1@0 C3 whole', 'm2@0 D3 whole']);
  assert.deepEqual(voiceSummary(harness.xml, { partIndex: 0 }), ['m1@0 r whole', 'm2@0 r whole']);
  assert.equal(measureCount(harness.xml, 0), 2);
  assert.equal(measureCount(harness.xml, 1), 2);
  harness.unmount();
});

test('voice 2 past the last position appends a bar for voice 2', () => {
  const harness = start();
  harness.press('N Cmd+Alt+2 7 c d');
  harness.rerender();
  assert.deepEqual(voiceSummary(harness.xml, { voice: 2 }), ['m1@0 C5 whole', 'm2@0 D5 whole']);
  assert.deepEqual(voiceSummary(harness.xml, { voice: 1 }), ['m1@0 r whole', 'm2@0 r whole']);
  harness.unmount();
});

test('a MIDI chord past the last position appends a bar', () => {
  const harness = start();
  harness.press('N 7 c');
  act(() => {
    harness.current.insertMidiChord([{ midi: 74, step: 'D', octave: 5, alter: 0 }, { midi: 77, step: 'F', octave: 5, alter: 0 }]);
  });
  harness.rerender();
  assert.deepEqual(voiceSummary(harness.xml, {}), ['m1@0 C5 whole', 'm2@0 D5 whole', 'm2@0 F5(chord) whole']);
  harness.unmount();
});

test('a pitch-before-duration commit past the last position appends a bar', () => {
  const harness = start();
  harness.press('N 7 c M d 5 e 5');
  harness.rerender();
  assert.deepEqual(voiceSummary(harness.xml, {}), ['m1@0 C5 whole', 'm2@0 D5 quarter', 'm2@1 E5 quarter', 'm2@2 r half']);
  harness.unmount();
});

test('a Shift chord tone on the last note stays in the bar, and the next letter appends', () => {
  const harness = start();
  harness.press('N 7 c Shift+e d');
  harness.rerender();
  assert.deepEqual(voiceSummary(harness.xml, {}), ['m1@0 C5 whole', 'm1@0 E5(chord) whole', 'm2@0 D5 whole']);
  harness.unmount();
});

test('clicking the last note and typing overwrites it, and does not append', () => {
  const harness = start();
  harness.press('N 7 c');
  const last = selectableNotes(harness.xml).find((note) => note.measureNumber === 1 && !note.isRest)!;
  act(() => {
    harness.current.handleNoteClick(last);
  });
  harness.rerender();
  harness.press('d');
  harness.rerender();
  assert.deepEqual(voiceSummary(harness.xml, {}), ['m1@0 D5 whole']);
  harness.unmount();
});

test('stepping back with the arrow and typing overwrites instead of appending', () => {
  const harness = start();
  harness.press('N 5 c d e f ArrowLeft g');
  harness.rerender();
  assert.equal(measureCount(harness.xml), 1);
  assert.deepEqual(voiceSummary(harness.xml, {}), ['m1@0 C5 quarter', 'm1@1 D5 quarter', 'm1@2 G5 quarter', 'm1@3 F5 quarter']);
  harness.unmount();
});
