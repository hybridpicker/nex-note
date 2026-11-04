import test from 'node:test';
import assert from 'node:assert/strict';
import { act } from 'react-test-renderer';

import { clickFirstEvent, documentIssues, mountEditor, voiceSummary } from './support/entry-harness.ts';
import { TREBLE, scoreXml } from './support/entry-fixtures.ts';

/*
 * MIDI keys and pitch-before-duration (M) commits go to the input cursor (iteration 26). After a
 * typed letter the last input is the note just entered, which stays the octave reference, but
 * these paths used it as their target, so the next MIDI key or M commit replaced that note.
 */

const D5 = { midi: 74, step: 'D', octave: 5, alter: 0 };
const F5 = { midi: 77, step: 'F', octave: 5, alter: 0 };
const A5 = { midi: 81, step: 'A', octave: 5, alter: 0 };

const quarters = ['C', 'D', 'E', 'F']
  .map((step) => `<note><pitch><step>${step}</step><octave>5</octave></pitch><duration>4</duration><voice>1</voice><type>quarter</type></note>`)
  .join('');

function mountOneBar(xml = scoreXml({ beats: 4, beatType: 4, measures: 1, parts: [TREBLE] })) {
  const harness = mountEditor(xml);
  clickFirstEvent(harness, {});
  return harness;
}

function playMidi(harness: ReturnType<typeof mountEditor>, pitches: typeof D5[]) {
  act(() => {
    harness.current.insertMidiChord(pitches);
  });
  harness.rerender();
}

test('a MIDI key after a typed letter goes to the cursor and keeps the typed note', () => {
  const harness = mountOneBar();
  harness.press('N 5 c');
  const before = harness.batches.length;
  playMidi(harness, [D5]);
  assert.deepEqual(voiceSummary(harness.xml, {}), ['m1@0 C5 quarter', 'm1@1 D5 quarter', 'm1@2 r half']);
  assert.equal(harness.batches.length - before, 1);
  harness.unmount();
});

test('letters and MIDI keys alternate without losing notes', () => {
  const harness = mountOneBar();
  harness.press('N 5 c');
  playMidi(harness, [D5]);
  harness.press('e');
  playMidi(harness, [F5]);
  assert.deepEqual(voiceSummary(harness.xml, {}), ['m1@0 C5 quarter', 'm1@1 D5 quarter', 'm1@2 E5 quarter', 'm1@3 F5 quarter']);
  harness.unmount();
});

test('a MIDI chord after a typed letter goes to the cursor', () => {
  const harness = mountOneBar();
  harness.press('N 5 c');
  playMidi(harness, [D5, F5, A5]);
  assert.deepEqual(voiceSummary(harness.xml, {}), [
    'm1@0 C5 quarter', 'm1@1 D5 quarter', 'm1@1 F5(chord) quarter', 'm1@1 A5(chord) quarter', 'm1@2 r half',
  ]);
  harness.unmount();
});

test('a MIDI key after a typed off-beat value follows its tied tail', () => {
  const harness = mountOneBar();
  harness.press('N 4 c 5 d');
  playMidi(harness, [F5]);
  assert.deepEqual(voiceSummary(harness.xml, {}), [
    'm1@0 C5 eighth', 'm1@0.5 D5 eighth~', 'm1@1 D5 eighth', 'm1@1.5 F5 eighth~', 'm1@2 F5 eighth', 'm1@2.5 r eighth', 'm1@3 r quarter',
  ]);
  assert.deepEqual(documentIssues(harness.xml), []);
  harness.unmount();
});

test('a MIDI key in voice 2 after a typed voice 2 note keeps both and leaves voice 1 alone', () => {
  const xml = scoreXml({ beats: 4, beatType: 4, measures: 1, parts: [{ ...TREBLE, content: { '1:1': quarters } }] });
  const harness = mountOneBar(xml);
  harness.press('N Cmd+Alt+2 5 c');
  playMidi(harness, [D5]);
  assert.deepEqual(voiceSummary(harness.xml, { voice: 1 }), ['m1@0 C5 quarter', 'm1@1 D5 quarter', 'm1@2 E5 quarter', 'm1@3 F5 quarter']);
  assert.deepEqual(voiceSummary(harness.xml, { voice: 2 }), ['m1@0 C5 quarter', 'm1@1 D5 quarter', 'm1@2 r half']);
  harness.unmount();
});

test('switching to pitch-before-duration after an entry commits at the cursor', () => {
  const harness = mountOneBar();
  harness.press('N 4 c M d 5 e 5');
  assert.deepEqual(voiceSummary(harness.xml, {}), [
    'm1@0 C5 eighth', 'm1@0.5 D5 eighth~', 'm1@1 D5 eighth', 'm1@1.5 E5 eighth~', 'm1@2 E5 eighth', 'm1@2.5 r eighth', 'm1@3 r quarter',
  ]);
  harness.unmount();
});

test('the prepared pitch of pitch-before-duration repeats the last entered note at the cursor', () => {
  const harness = mountOneBar();
  harness.press('N 5 c M 5');
  assert.deepEqual(voiceSummary(harness.xml, {}), ['m1@0 C5 quarter', 'm1@1 C5 quarter', 'm1@2 r half']);
  harness.unmount();
});

test('MIDI entry on its own still advances one value at a time', () => {
  const harness = mountOneBar();
  harness.press('N 5');
  playMidi(harness, [D5]);
  playMidi(harness, [F5]);
  assert.deepEqual(voiceSummary(harness.xml, {}), ['m1@0 D5 quarter', 'm1@1 F5 quarter', 'm1@2 r half']);
  harness.unmount();
});
