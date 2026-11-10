import assert from 'node:assert/strict';
import test from 'node:test';

import { mountApp, type AppHarness } from './support/app-harness.ts';
import { selectableNotes, voiceSummary } from './support/entry-harness.ts';
import { scoreXml, TREBLE } from './support/entry-fixtures.ts';

/*
 * F5 (docs/note-entry-mastery-ledger.md): `R` outside note input inserted a rest after the selected
 * note and pushed the bar's last note out. MuseScore binds `R` to "Repeat selection": the selection is
 * written again directly after itself, over what follows, and the copy becomes the selection.
 */

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const quarter = (step: string, octave: number) => `<note><pitch><step>${step}</step><octave>${octave}</octave></pitch><duration>4</duration><voice>1</voice><type>quarter</type></note>`;
const XML = scoreXml({
  beats: 4, beatType: 4, measures: 2,
  parts: [{ ...TREBLE, content: { '1:1': quarter('C', 5) + quarter('D', 5) + quarter('E', 5) + quarter('F', 5), '2:1': quarter('G', 5) + quarter('A', 5) + quarter('B', 5) + quarter('C', 6) } }],
});

const summary = (app: AppHarness) => voiceSummary(app.xml, {}).map((line) => line.replace(' quarter', ''));
const click = (app: AppHarness, index: number) => app.click(selectableNotes(app.xml)[index]!);

test('R repeats a selected note over the next one and selects the copy', () => {
  const app = mountApp(XML);
  try {
    click(app, 0);
    app.press('R');
    assert.deepEqual(summary(app).slice(0, 4), ['m1@0 C5', 'm1@1 C5', 'm1@2 E5', 'm1@3 F5'], 'no note is pushed out of the bar');
    app.press('R');
    assert.deepEqual(summary(app).slice(0, 4), ['m1@0 C5', 'm1@1 C5', 'm1@2 C5', 'm1@3 F5'], 'the copy was selected, so R continues');
    assert.equal(app.editor.clipboardCount, 0, 'the clipboard is untouched');
  } finally {
    app.unmount();
  }
});

test('R on the last note of a bar repeats it at the start of the next bar', () => {
  const app = mountApp(XML);
  try {
    click(app, 3);
    app.press('R');
    assert.deepEqual(summary(app), ['m1@0 C5', 'm1@1 D5', 'm1@2 E5', 'm1@3 F5', 'm2@0 F5', 'm2@1 A5', 'm2@2 B5', 'm2@3 C6']);
  } finally {
    app.unmount();
  }
});

test('R repeats a range after its end', () => {
  const app = mountApp(XML);
  try {
    click(app, 0);
    app.press('Shift+ArrowRight R');
    assert.deepEqual(summary(app).slice(0, 4), ['m1@0 C5', 'm1@1 D5', 'm1@2 C5', 'm1@3 D5']);
  } finally {
    app.unmount();
  }
});

test('R at the end of the score changes nothing', () => {
  const app = mountApp(XML);
  try {
    click(app, 7);
    const before = app.xml;
    app.press('R');
    assert.equal(app.xml, before);
  } finally {
    app.unmount();
  }
});
