import test from 'node:test';
import assert from 'node:assert/strict';

import { clickFirstEvent, documentIssues, mountEditor, voiceSummary } from './support/entry-harness.ts';
import { TREBLE, scoreXml } from './support/entry-fixtures.ts';

/*
 * Switching voices keeps the input position (MuseScore), so the cursor can fall inside a longer
 * rest of the voice switched to (iteration 27). Notes used to be rejected there, rests did not
 * move the cursor, and a value longer than the bar could not tie into the next bar.
 */

function run(script: string, measures = 2) {
  const harness = mountEditor(scoreXml({ beats: 4, beatType: 4, measures, parts: [TREBLE] }));
  clickFirstEvent(harness, {});
  const before = harness.batches.length;
  harness.press(script);
  harness.rerender();
  const result = {
    voice1: voiceSummary(harness.xml, { voice: 1 }),
    voice2: voiceSummary(harness.xml, { voice: 2 }),
    batches: harness.batches.length - before,
    issues: documentIssues(harness.xml).map((issue) => issue.code),
  };
  harness.unmount();
  return result;
}

test('a note goes into a longer rest of the voice switched back to', () => {
  const result = run('N 5 c d Cmd+Alt+2 e Cmd+Alt+1 f');
  assert.deepEqual(result.voice1, ['m1@0 C5 quarter', 'm1@1 D5 quarter', 'm1@2 r quarter', 'm1@3 F5 quarter', 'm2@0 r whole']);
  assert.deepEqual(result.voice2, ['m1@0 r half', 'm1@2 E5 quarter', 'm1@3 r quarter']);
  assert.equal(result.batches, 4);
  assert.deepEqual(result.issues, []);
});

test('a note goes into a whole-bar rest of the voice switched to, with rests kept around it', () => {
  const result = run('N Cmd+Alt+2 5 c d e Cmd+Alt+1 4 f g');
  assert.deepEqual(result.voice1, ['m1@0 r half.', 'm1@3 F4 eighth', 'm1@3.5 G4 eighth', 'm2@0 r whole']);
  assert.deepEqual(result.voice2, ['m1@0 C5 quarter', 'm1@1 D5 quarter', 'm1@2 E5 quarter', 'm1@3 r quarter']);
  assert.deepEqual(result.issues, []);
});

test('a value longer than the bar ties into the next bar from a rest of the voice switched to', () => {
  const result = run('N Cmd+Alt+2 5 c d e Cmd+Alt+1 6 f g');
  assert.deepEqual(result.voice1, ['m1@0 r half.', 'm1@3 F4 quarter~', 'm2@0 F4 quarter', 'm2@1 G4 quarter~', 'm2@2 G4 quarter', 'm2@3 r quarter']);
  assert.deepEqual(result.issues, []);
});

test('voice 2 ties into a next bar that has no voice 2 yet', () => {
  const result = run('N Cmd+Alt+2 5 c d e 6 f g');
  assert.deepEqual(result.voice2, [
    'm1@0 C5 quarter', 'm1@1 D5 quarter', 'm1@2 E5 quarter', 'm1@3 F5 quarter~',
    'm2@0 F5 quarter', 'm2@1 G5 quarter~', 'm2@2 G5 quarter', 'm2@3 r quarter',
  ]);
  assert.deepEqual(result.voice1, ['m1@0 r whole', 'm2@0 r whole']);
  assert.deepEqual(result.issues, []);
});

test('a rest over silence in the voice switched to moves the cursor to the next bar', () => {
  const result = run('N 5 c d Cmd+Alt+2 e Cmd+Alt+1 0 g');
  assert.deepEqual(result.voice1, ['m1@0 C5 quarter', 'm1@1 D5 quarter', 'm1@2 r half', 'm2@0 G5 quarter', 'm2@1 r quarter', 'm2@2 r half']);
  assert.equal(result.batches, 4);
});

test('a rest over silence moves the cursor to an onset where no event starts yet', () => {
  const result = run('N 7 c Cmd+Alt+2 5 d e Cmd+Alt+1 0 f');
  assert.deepEqual(result.voice1, ['m1@0 C5 whole', 'm2@0 r half.', 'm2@3 F5 quarter']);
  assert.deepEqual(result.voice2, ['m2@0 D5 quarter', 'm2@1 E5 quarter', 'm2@2 r half']);
  assert.deepEqual(result.issues, []);
});

test('a rest in an empty voice 2 moves the cursor past it, and the next note follows', () => {
  const result = run('N 5 c Cmd+Alt+2 0 d');
  assert.deepEqual(result.voice1, ['m1@0 C5 quarter', 'm1@1 r quarter', 'm1@2 r half', 'm2@0 r whole']);
  assert.deepEqual(result.voice2, ['m1@0 r half', 'm1@2 D5 quarter', 'm1@3 r quarter']);
});
