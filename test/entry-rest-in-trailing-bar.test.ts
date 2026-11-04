import test from 'node:test';
import assert from 'node:assert/strict';

import { clickFirstEvent, documentIssues, mountEditor, voiceSummary } from './support/entry-harness.ts';
import { BASS, PIANO, TREBLE, scoreXml } from './support/entry-fixtures.ts';

/*
 * Rest-only bars after the last note are rewritten as whole-bar rests (iteration 29). This also
 * erased a rest value just typed into such a bar, so "c d e f 0 g" lost the rest and put G in the
 * wrong place. It also deleted the rests of a left-hand staff, whose main voice is stored as 5. A
 * rest in a later part also moved the cursor to the first part, so the next note went there.
 */

const quarters = (octave: number) => ['C', 'D', 'E', 'F']
  .map((step) => `<note><pitch><step>${step}</step><octave>${octave}</octave></pitch><duration>4</duration><voice>1</voice><type>quarter</type></note>`)
  .join('');

function run(script: string, xml = scoreXml({ beats: 4, beatType: 4, measures: 3, parts: [TREBLE] }), where: { partIndex?: number; staff?: number; voice?: number; measure?: number } = {}) {
  const harness = mountEditor(xml);
  clickFirstEvent(harness, where);
  harness.press(script);
  harness.rerender();
  const read = (lane: { partIndex?: number; staff?: number; voice?: number }) => voiceSummary(harness.xml, lane);
  const issues = documentIssues(harness.xml).map((issue) => issue.code);
  return { read, issues, close: () => harness.unmount() };
}

test('a rest that starts the next bar stays, and the next note follows it', () => {
  const result = run('N 5 c d e f 0 g');
  assert.deepEqual(result.read({}), [
    'm1@0 C5 quarter', 'm1@1 D5 quarter', 'm1@2 E5 quarter', 'm1@3 F5 quarter',
    'm2@0 r quarter', 'm2@1 G5 quarter', 'm2@2 r half',
    'm3@0 r whole',
  ]);
  assert.deepEqual(result.issues, []);
  result.close();
});

test('eighth and sixteenth rests that start the next bar keep their values', () => {
  const eighth = run('N 5 c d e f 4 0 g');
  assert.deepEqual(eighth.read({}).slice(4, 7), ['m2@0 r eighth', 'm2@0.5 G5 eighth', 'm2@1 r quarter']);
  eighth.close();
  const sixteenth = run('N 5 c d e f 3 0 g');
  assert.deepEqual(sixteenth.read({}).slice(4, 6), ['m2@0 r 16th', 'm2@0.25 G5 16th']);
  sixteenth.close();
});

test('a dotted rest that starts the next bar keeps its value', () => {
  const result = run('N 5 c d e f . 0 4 g');
  assert.deepEqual(result.read({}).slice(4, 6), ['m2@0 r quarter.', 'm2@1.5 G5 eighth']);
  result.close();
});

test('two rests, then a note, in a trailing bar', () => {
  const result = run('N 5 c d e f 0 0 g');
  // The two quarter rests before the note merge into a half rest, the same music; G is on beat 3.
  assert.deepEqual(result.read({}).slice(4, 7), ['m2@0 r half', 'm2@2 G5 quarter', 'm2@3 r quarter']);
  result.close();
});

test('clicking the rest of a trailing bar and starting with a rest', () => {
  const xml = scoreXml({ beats: 4, beatType: 4, measures: 3, parts: [{ ...TREBLE, content: { '1:1': quarters(5) } }] });
  const result = run('N 5 0 g', xml, { measure: 2 });
  assert.deepEqual(result.read({}).slice(4), ['m2@0 r quarter', 'm2@1 G5 quarter', 'm2@2 r half', 'm3@0 r whole']);
  result.close();
});

test('later rest-only bars stay plain whole-bar rests', () => {
  const result = run('N 5 c d e f 0');
  assert.deepEqual(result.read({}).at(-1), 'm3@0 r whole');
  result.close();
});

test('the left hand keeps its rests in later bars and can start a bar with a rest', () => {
  const xml = scoreXml({ beats: 4, beatType: 4, measures: 3, parts: [PIANO] });
  const notes = run('N 7 c', xml, { staff: 2, voice: 5 });
  assert.deepEqual(notes.read({ staff: 2, voice: 5 }), ['m1@0 C3 whole', 'm2@0 r whole', 'm3@0 r whole']);
  assert.deepEqual(notes.read({ staff: 1 }), ['m1@0 r whole', 'm2@0 r whole', 'm3@0 r whole']);
  notes.close();
  const rest = run('N 7 c 5 0 d', xml, { staff: 2, voice: 5 });
  assert.deepEqual(rest.read({ staff: 2, voice: 5 }), ['m1@0 C3 whole', 'm2@0 r quarter', 'm2@1 D3 quarter', 'm2@2 r half', 'm3@0 r whole']);
  rest.close();
});

test('voice 2 starts its next bar with a rest', () => {
  const result = run('N Cmd+Alt+2 7 c 5 0 d');
  assert.deepEqual(result.read({ voice: 2 }), ['m1@0 C5 whole', 'm2@0 r quarter', 'm2@1 D5 quarter', 'm2@2 r half']);
  assert.deepEqual(result.read({ voice: 1 }), ['m1@0 r whole', 'm2@0 r whole', 'm3@0 r whole']);
  result.close();
});

test('another part starts its next bar with a rest and the first part stays untouched', () => {
  const xml = scoreXml({ beats: 4, beatType: 4, measures: 3, parts: [TREBLE, { ...BASS, id: 'P2' }] });
  const result = run('N 7 c 5 0 d', xml, { partIndex: 1 });
  assert.deepEqual(result.read({ partIndex: 1 }), ['m1@0 C3 whole', 'm2@0 r quarter', 'm2@1 D3 quarter', 'm2@2 r half', 'm3@0 r whole']);
  assert.deepEqual(result.read({ partIndex: 0 }), ['m1@0 r whole', 'm2@0 r whole', 'm3@0 r whole']);
  result.close();
});
