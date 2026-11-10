import assert from 'node:assert/strict';
import test from 'node:test';

import { mountApp, type AppHarness } from './support/app-harness.ts';
import { selectableNotes, voiceSummary } from './support/entry-harness.ts';
import { scoreXml, TREBLE } from './support/entry-fixtures.ts';

/*
 * F6 (docs/note-entry-mastery-ledger.md): paste used the editor's entry mode, whose default is named
 * insert, so pasting three quarters at bar 2 pushed the rest of bar 2 over the barline into bar 3.
 * Paste overwrites in MuseScore Studio, Dorico and Finale, and now in Nex Note in every entry mode.
 */

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const quarters = (steps: string, octave: number) => steps.split('').map((step) => `<note><pitch><step>${step}</step><octave>${octave}</octave></pitch><duration>4</duration><voice>1</voice><type>quarter</type></note>`).join('');
const XML = scoreXml({ beats: 4, beatType: 4, measures: 3, parts: [{ ...TREBLE, content: { '1:1': quarters('CDEF', 5), '2:1': quarters('GFED', 5) } }] });

const summary = (app: AppHarness) => voiceSummary(app.xml, {}).map((line) => line.replace(' quarter', ''));

function copyFirstThreeAndPasteAtBar2(app: AppHarness) {
  app.click(selectableNotes(app.xml)[0]!);
  app.press('Shift+ArrowRight Shift+ArrowRight Cmd+c');
  app.click(selectableNotes(app.xml)[4]!);
  app.press('Cmd+v');
}

test('paste overwrites in the default entry mode: bar 3 is untouched', () => {
  const app = mountApp(XML);
  try {
    copyFirstThreeAndPasteAtBar2(app);
    assert.deepEqual(summary(app), [
      'm1@0 C5', 'm1@1 D5', 'm1@2 E5', 'm1@3 F5',
      'm2@0 C5', 'm2@1 D5', 'm2@2 E5', 'm2@3 D5',
      'm3@0 r whole',
    ]);
  } finally {
    app.unmount();
  }
});

test('paste also overwrites after the entry mode is toggled', () => {
  const app = mountApp(XML);
  try {
    app.press('I');
    copyFirstThreeAndPasteAtBar2(app);
    assert.deepEqual(summary(app).slice(4, 9), ['m2@0 C5', 'm2@1 D5', 'm2@2 E5', 'm2@3 D5', 'm3@0 r whole']);
  } finally {
    app.unmount();
  }
});
