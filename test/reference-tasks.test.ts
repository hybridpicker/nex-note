import assert from 'node:assert/strict';
import test from 'node:test';

import { mountApp } from './support/app-harness.ts';
import { REFERENCE_TASKS, bar, referenceTask } from './support/reference-tasks.ts';
import { summarizeScore } from './support/score-summary.ts';

/* Reference tasks (T4, gates 5 and 6 of docs/note-entry-mastery-ledger.md): the part that needs no browser. */

test('T4: the compact notation of expected results expands to summary lines', () => {
  assert.deepEqual(bar('m1', 'C5q D5e E5e F5q. G5e'), [
    'm1 v1 @0 C5 quarter', 'm1 v1 @1 D5 eighth', 'm1 v1 @1.5 E5 eighth', 'm1 v1 @2 F5 quarter.', 'm1 v1 @3.5 G5 eighth',
  ]);
  assert.deepEqual(bar('s1 m2', 'C5q +E5q (D5e) D5q[accent] {C5e D5e E5e} E5q~', 2), [
    's1 m2 v2 @0 C5 quarter', 's1 m2 v2 @0 +E5 quarter', 's1 m2 v2 @1 D5 eighth [grace]', 's1 m2 v2 @1 D5 quarter [accent]',
    's1 m2 v2 @2 C5 eighth [3:2]', 's1 m2 v2 @2.333 D5 eighth [3:2]', 's1 m2 v2 @2.667 E5 eighth [3:2]', 's1 m2 v2 @3 E5 quarter [tie]',
  ]);
});

test('T4 R1: the key script reproduces the fixture exactly (keys through the editor hook)', () => {
  const task = referenceTask('R1');
  const harness = mountApp(task.start());
  harness.press(task.nex.join(' '));
  assert.deepEqual(summarizeScore(harness.xml).sort(), [...task.expected!].sort());
  harness.unmount();
});

test('T4: every Nex Note script needs at most 110 % of the keys of its MuseScore script', () => {
  for (const task of REFERENCE_TASKS) {
    if (task.nex.length === 0) continue;
    const ratio = task.nex.length / task.musescore.length;
    assert.ok(ratio <= 1.1, `${task.id}: ${task.nex.length} keys against MuseScore's ${task.musescore.length} (${Math.round(ratio * 100)} %)`);
  }
});
