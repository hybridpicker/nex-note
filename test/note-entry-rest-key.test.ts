import assert from 'node:assert/strict';
import test from 'node:test';

import { mountApp, type AppHarness } from './support/app-harness.ts';
import { selectableNotes, voiceSummary } from './support/entry-harness.ts';
import { scoreXml, TREBLE } from './support/entry-fixtures.ts';

/*
 * F16 (docs/note-entry-mastery-ledger.md): `0` outside note input inserted a rest at the selected
 * note and pushed the rest of the bar later, cutting its last note. MuseScore binds `0` to
 * ENTER_REST_COMMAND, `NotationInteraction::putRestToSelection`: outside note input it starts note
 * input at the selection and calls `Score::enterRest`, which writes a rest of the armed value over the
 * selected position (`setNoteRest`) and moves the input position after it.
 */

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const quarter = (step: string, octave: number) => `<note><pitch><step>${step}</step><octave>${octave}</octave></pitch><duration>4</duration><voice>1</voice><type>quarter</type></note>`;
const XML = scoreXml({
  beats: 4, beatType: 4, measures: 2,
  parts: [{ ...TREBLE, content: { '1:1': quarter('C', 5) + quarter('D', 5) + quarter('E', 5) + quarter('F', 5), '2:1': quarter('G', 5) + quarter('A', 5) + quarter('B', 5) + quarter('C', 6) } }],
});

const summary = (app: AppHarness) => voiceSummary(app.xml, {}).map((line) => line.replace(' quarter', ''));
const click = (app: AppHarness, index: number) => app.click(selectableNotes(app.xml)[index]!);

test('0 outside note input writes a rest over the selected note and keeps the bar', () => {
  const app = mountApp(XML);
  try {
    click(app, 1);
    app.press('0');
    assert.deepEqual(summary(app).slice(0, 4), ['m1@0 C5', 'm1@1 r', 'm1@2 E5', 'm1@3 F5'], 'no note is pushed out of the bar');
    assert.equal(app.editor.noteInputMode, true, 'note input starts at the selection, as in MuseScore');
    app.press('a');
    // The octave comes from C5, the note before the cursor, as the rest replaced D5.
    assert.deepEqual(summary(app).slice(0, 4), ['m1@0 C5', 'm1@1 r', 'm1@2 A4', 'm1@3 F5'], 'the cursor stands after the rest');
  } finally {
    app.unmount();
  }
});

test('0 outside note input uses the armed value', () => {
  const app = mountApp(XML);
  try {
    click(app, 0);
    app.press('6 0');
    assert.deepEqual(summary(app).slice(0, 3), ['m1@0 r half', 'm1@2 E5', 'm1@3 F5'], 'a half rest overwrites C and D');
    assert.deepEqual(summary(app).slice(3), ['m2@0 G5', 'm2@1 A5', 'm2@2 B5', 'm2@3 C6'], 'the next bar is untouched');
  } finally {
    app.unmount();
  }
});

test('0 outside note input is one Undo step', () => {
  const app = mountApp(XML);
  try {
    click(app, 2);
    const before = app.xml;
    app.press('0 Cmd+z');
    assert.equal(app.xml, before);
  } finally {
    app.unmount();
  }
});
