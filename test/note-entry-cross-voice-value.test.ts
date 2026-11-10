import assert from 'node:assert/strict';
import test from 'node:test';

import { buildDocumentState } from '../src/score-core/commands/apply-document-commands.ts';
import { mountApp } from './support/app-harness.ts';
import { voiceSummary } from './support/entry-harness.ts';
import { FUZZ_FIXTURES } from './support/entry-fuzz.ts';

/*
 * F35 (docs/note-entry-mastery-ledger.md): in note input, a letter typed in another voice at an
 * onset where that voice already had a note only changed the pitch. The armed value was not
 * written and the cursor stayed. MuseScore enters the armed value in the input voice and moves on
 * (Score::cmdAddPitch -> setNoteRest with the input state's duration).
 */

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const bar1 = (xml: string, voice: number) => voiceSummary(xml, { voice }).filter((line) => line.startsWith('m1@'));

test('F35: a letter in another voice writes the armed value over that voice and advances', () => {
  const app = mountApp(buildDocumentState(FUZZ_FIXTURES['grand staff, two voices']!()).xml);
  try {
    assert.deepEqual(bar1(app.xml, 2), ['m1@0 C4 half', 'm1@2 G4 half'], 'fixture: voice 2 holds two half notes');
    const voice1 = bar1(app.xml, 1);
    app.press('N Cmd+Alt+2 5 a');
    assert.deepEqual(bar1(app.xml, 2), ['m1@0 A3 quarter', 'm1@1 r quarter', 'm1@2 G4 half'], 'a quarter A, the rest of the half is a rest');
    assert.deepEqual(bar1(app.xml, 1), voice1, 'voice 1 is untouched');
    const cursor = app.editor.selectedNote!;
    assert.equal(cursor.timestampNum / cursor.timestampDen, 0.25, 'the cursor stands on beat 2');
    app.press('b');
    assert.deepEqual(bar1(app.xml, 2), ['m1@0 A3 quarter', 'm1@1 B3 quarter', 'm1@2 G4 half'], 'the next letter continues in voice 2');
  } finally {
    app.unmount();
  }
});

test('F35: the cross-voice entry is one Undo step and Undo returns the cursor', () => {
  const app = mountApp(buildDocumentState(FUZZ_FIXTURES['grand staff, two voices']!()).xml);
  try {
    app.press('N Cmd+Alt+2 5');
    const before = app.xml;
    app.press('a Cmd+z');
    assert.equal(app.xml, before);
    const cursor = app.editor.selectedNote!;
    assert.equal(cursor.timestampNum / cursor.timestampDen, 0);
  } finally {
    app.unmount();
  }
});
