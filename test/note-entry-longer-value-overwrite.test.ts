import assert from 'node:assert/strict';
import test from 'node:test';

import { buildDocumentState } from '../src/score-core/commands/apply-document-commands.ts';
import { mountApp, type AppHarness } from './support/app-harness.ts';
import { selectableNotes, voiceSummary } from './support/entry-harness.ts';
import { scoreXml, TREBLE } from './support/entry-fixtures.ts';
import { importMusicXmlToCore } from '../src/musicxml-adapter/import/import-musicxml.ts';
import { FUZZ_FIXTURES, runSequence } from './support/entry-fuzz.ts';

/*
 * F19 (docs/note-entry-mastery-ledger.md): in note input a value longer than the note at the cursor
 * was rejected when a note followed inside the bar (`blocking-event`), although the same key
 * overwrote across a barline. MuseScore `Score::setNoteRest` makes a gap of the entered value
 * (`makeGap`) and writes the note over whatever stood there.
 *
 * F17: the same key in front of a tuplet entered nothing. `makeGap` removes a tuplet the gap reaches
 * as a whole and fills what is left of it with rests; the entry does the same.
 *
 * Spelling: a value that crosses the middle of a 4/4 bar is written as tied notes, as every entry
 * into an empty bar already is (ledger row F20).
 */

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const quarter = (step: string, octave: number) => `<note><pitch><step>${step}</step><octave>${octave}</octave></pitch><duration>4</duration><voice>1</voice><type>quarter</type></note>`;
const XML = scoreXml({
  beats: 4, beatType: 4, measures: 2,
  parts: [{ ...TREBLE, content: { '1:1': quarter('C', 5) + quarter('D', 5) + quarter('E', 5) + quarter('F', 5), '2:1': quarter('G', 5) + quarter('A', 5) + quarter('B', 5) + quarter('C', 6) } }],
});
const BAR2 = ['m2@0 G5 quarter', 'm2@1 A5 quarter', 'm2@2 B5 quarter', 'm2@3 C6 quarter'];

const summary = (app: AppHarness) => voiceSummary(app.xml, {});
const click = (app: AppHarness, index: number) => app.click(selectableNotes(app.xml)[index]!);

test('F19: a half note typed on a quarter overwrites the following quarter', () => {
  const app = mountApp(XML);
  try {
    click(app, 1);
    app.press('N 6 a');
    assert.deepEqual(summary(app), ['m1@0 C5 quarter', 'm1@1 A4 quarter~', 'm1@2 A4 quarter', 'm1@3 F5 quarter', ...BAR2]);
    assert.equal(app.editor.editorError, null);
    app.press('5 b');
    assert.deepEqual(summary(app).slice(0, 4), ['m1@0 C5 quarter', 'm1@1 A4 quarter~', 'm1@2 A4 quarter', 'm1@3 B4 quarter'], 'the cursor stands after the half note');
  } finally {
    app.unmount();
  }
});

test('F19: a dotted quarter leaves the rest of the cut note as a rest', () => {
  const app = mountApp(XML);
  try {
    click(app, 1);
    app.press('N 5 . a');
    assert.deepEqual(summary(app), ['m1@0 C5 quarter', 'm1@1 A4 quarter~', 'm1@2 A4 eighth', 'm1@2.5 r eighth', 'm1@3 F5 quarter', ...BAR2]);
  } finally {
    app.unmount();
  }
});

test('F19: the overwrite is one Undo step', () => {
  const app = mountApp(XML);
  try {
    click(app, 1);
    const before = app.xml;
    app.press('N 6 a Cmd+z');
    assert.equal(app.xml, before);
  } finally {
    app.unmount();
  }
});

test('F17: a value that reaches into a tuplet removes the tuplet as a whole', () => {
  const app = mountApp(buildDocumentState(FUZZ_FIXTURES['tuplets and graces']!()).xml);
  try {
    const notes = selectableNotes(app.xml);
    app.click(notes[73 % notes.length]!);
    app.press('0 . e');
    assert.equal(app.editor.editorError, null);
    assert.deepEqual(
      voiceSummary(app.xml, {}).filter((line) => line.startsWith('m1@') && !line.includes('B4')),
      ['m1@0 r quarter', 'm1@1 E5 quarter~', 'm1@2 E5 eighth', 'm1@2.5 r eighth', 'm1@3 r quarter'],
    );
    assert.equal(importMusicXmlToCore(app.xml).tuplets.length, 0, 'no tuplet member is left behind');
    assert.ok(app.editor.selectedNote, 'the cursor is defined');
  } finally {
    app.unmount();
  }
});

test('F17 fuzzer replay passes every invariant', () => {
  assert.equal(runSequence('tuplets and graces', 309111, ['click:73', '0', '.', 'e', '6', 'Cmd+3'])?.reason ?? null, null);
});
