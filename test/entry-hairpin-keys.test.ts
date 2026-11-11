import assert from 'node:assert/strict';
import test from 'node:test';

import { mountApp } from './support/app-harness.ts';
import { scoreXml, TREBLE } from './support/entry-fixtures.ts';
import { selectableNotes } from './support/entry-harness.ts';
import { summarizeScore } from './support/score-summary.ts';

/*
 * K5a in docs/note-entry-mastery-ledger.md. MuseScore's default keys (`shortcuts.xml`): `<` crescendo
 * hairpin, `>` diminuendo hairpin, Shift+V accent, Shift+N tenuto, Shift+O marcato, Shift+S staccato.
 * `>` is Shift+Period on a US keyboard, which Nex Note used for the accent.
 */

const EMPTY = scoreXml({ beats: 4, beatType: 4, measures: 2, parts: [{ ...TREBLE }] });
const marks = (xml: string, pattern: RegExp) => summarizeScore(xml).filter((line) => pattern.test(line));

test('K5a: < writes a crescendo hairpin over the selected range, up to the end of its last note', () => {
  const app = mountApp(EMPTY);
  app.press('N 5 c d e f Shift+ArrowLeft Shift+ArrowLeft Shift+,');
  assert.deepEqual(marks(app.xml, /wedge/), ['m1 @1 wedge crescendo', 'm1 @4 wedge stop']);
  app.undo();
  assert.deepEqual(marks(app.xml, /wedge/), [], 'one Undo step');
  app.unmount();
});

test('K5a: > on a single note writes a diminuendo hairpin to the end of that note, and no accent', () => {
  const app = mountApp(EMPTY);
  app.press('N 6 c d Escape');
  app.click(selectableNotes(app.xml).find((note) => !note.isRest && note.timestampNum === 0)!);
  app.press('Shift+.');
  assert.deepEqual(marks(app.xml, /wedge/), ['m1 @0 wedge diminuendo', 'm1 @2 wedge stop']);
  assert.deepEqual(marks(app.xml, /accent/), []);
  app.unmount();
});

test('K5a: Shift+V accent, Shift+N tenuto, Shift+O marcato act on the note just entered; N alone still toggles note input', () => {
  const app = mountApp(EMPTY);
  app.press('N 5 c Shift+v d Shift+n e Shift+o f Shift+s');
  assert.deepEqual(marks(app.xml, /m1 v1/), [
    'm1 v1 @0 C5 quarter [accent]', 'm1 v1 @1 D5 quarter [tenuto]', 'm1 v1 @2 E5 quarter [strong-accent]', 'm1 v1 @3 F5 quarter [staccato]',
  ]);
  assert.equal(app.editor.noteInputMode, true, 'Shift+N did not leave note input');
  app.press('N');
  assert.equal(app.editor.noteInputMode, false);
  app.unmount();
});
