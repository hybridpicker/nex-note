import assert from 'node:assert/strict';
import test from 'node:test';

import { mountApp, type AppHarness } from './support/app-harness.ts';
import { selectableNotes, voiceSummary } from './support/entry-harness.ts';
import { scoreXml, TREBLE } from './support/entry-fixtures.ts';

/*
 * F1 (docs/note-entry-mastery-ledger.md): Undo during note input must put the input cursor back at
 * the position of the undone entry, and typing must continue from there. Before the fix the
 * selection was empty after Undo and every later letter, arrow or Backspace did nothing.
 */

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const quarter = (step: string, octave: number) => `<note><pitch><step>${step}</step><octave>${octave}</octave></pitch><duration>4</duration><voice>1</voice><type>quarter</type></note>`;
const BAR = quarter('C', 5) + quarter('D', 5) + quarter('E', 5) + quarter('F', 5);
const FOUR_BARS_OF_QUARTERS = scoreXml({ beats: 4, beatType: 4, measures: 4, parts: [{ ...TREBLE, content: { '1:1': BAR, '2:1': BAR, '3:1': BAR, '4:1': BAR } }] });
const EIGHT_EMPTY_BARS = scoreXml({ beats: 4, beatType: 4, measures: 8, parts: [TREBLE] });

function cursor(app: AppHarness) {
  const note = app.editor.selectedNote;
  if (!note) return 'none';
  const onset = Math.round((note.timestampNum / Math.max(note.timestampDen, 1)) * 4 * 1000) / 1000;
  return `m${note.measureNumber}@${onset} ${note.isRest ? 'rest' : `${note.step}${note.octave}`}`;
}

const bar = (app: AppHarness, measure: number) => voiceSummary(app.xml, {}).filter((line) => line.startsWith(`m${measure}@`));

test('Undo in note input returns the cursor to the undone note and typing continues there', () => {
  const app = mountApp(FOUR_BARS_OF_QUARTERS);
  try {
    app.press('N 5 a b c');
    assert.equal(cursor(app), 'm1@3 F5');
    app.press('Cmd+z');
    assert.equal(app.editor.noteInputMode, true);
    assert.equal(cursor(app), 'm1@2 E5', 'the cursor is at the position of the undone C');
    app.press('d');
    assert.deepEqual(bar(app, 1), ['m1@0 A4 quarter', 'm1@1 B4 quarter', 'm1@2 D5 quarter', 'm1@3 F5 quarter'],
      'D lands where C was, in the register of the B before it');
    assert.equal(cursor(app), 'm1@3 F5');
  } finally {
    app.unmount();
  }
});

test('Undo twice steps the cursor back twice, and Redo moves it forward again', () => {
  const app = mountApp(EIGHT_EMPTY_BARS);
  try {
    app.press('N 5 c d e');
    app.press('Cmd+z Cmd+z');
    assert.equal(cursor(app), 'm1@1 rest');
    assert.deepEqual(bar(app, 1).map((line) => line.split(' ').slice(0, 2).join(' ')), ['m1@0 C5', 'm1@1 r', 'm1@2 r']);
    app.press('Cmd+Shift+z');
    assert.equal(cursor(app), 'm1@2 rest', 'Redo puts the cursor after the redone D');
    app.press('f');
    assert.deepEqual(bar(app, 1), ['m1@0 C5 quarter', 'm1@1 D5 quarter', 'm1@2 F5 quarter', 'm1@3 r quarter'],
      'F follows the redone D, nearest to it');
  } finally {
    app.unmount();
  }
});

test('after Undo in note input the arrow keys and a new value keep working', () => {
  const app = mountApp(EIGHT_EMPTY_BARS);
  try {
    app.press('N 5 c d e Cmd+z');
    assert.equal(cursor(app), 'm1@2 rest');
    app.press('ArrowLeft');
    assert.equal(cursor(app), 'm1@1 D5', 'ArrowLeft moves from the restored cursor');
    app.press('ArrowRight');
    app.press('4 g');
    assert.deepEqual(bar(app, 1).slice(0, 3), ['m1@0 C5 quarter', 'm1@1 D5 quarter', 'm1@2 G5 eighth']);
  } finally {
    app.unmount();
  }
});

test('Undo of a rest typed over a note returns the cursor to that note', () => {
  // A rest typed over silence changes nothing and is no Undo step, so the rest replaces a note here.
  const app = mountApp(FOUR_BARS_OF_QUARTERS);
  try {
    app.press('N 5 c 0');
    assert.deepEqual(bar(app, 1).slice(0, 2), ['m1@0 C5 quarter', 'm1@1 r quarter']);
    app.press('Cmd+z');
    assert.equal(cursor(app), 'm1@1 D5');
    app.press('e');
    assert.deepEqual(bar(app, 1).slice(0, 2), ['m1@0 C5 quarter', 'm1@1 E5 quarter']);
  } finally {
    app.unmount();
  }
});

test('Undo and Redo outside note input keep restoring the selection they recorded', () => {
  const app = mountApp(FOUR_BARS_OF_QUARTERS);
  try {
    // Select the first note, raise it a semitone, undo: the note stays selected.
    app.click(selectableNotes(app.xml)[0]!);
    assert.equal(cursor(app), 'm1@0 C5');
    app.press('ArrowUp');
    assert.equal(cursor(app), 'm1@0 C5', 'C# keeps step C');
    app.press('Cmd+z');
    assert.equal(cursor(app), 'm1@0 C5');
    assert.equal(app.editor.noteInputMode, false);
  } finally {
    app.unmount();
  }
});

/*
 * F8 (found by the entry fuzzer, seed 20761115 on "three parts": N f W). In note input, W doubles
 * the value of the note just entered. The commit recorded the old cursor slot as the selection; the
 * longer note absorbed that slot, so restoring it cleared the selection and the cursor was gone.
 */

test('W in note input lengthens the note just entered and the cursor moves past it', () => {
  const app = mountApp(EIGHT_EMPTY_BARS);
  try {
    app.press('N 5 c W');
    assert.deepEqual(bar(app, 1)[0], 'm1@0 C5 half');
    assert.equal(cursor(app), 'm1@2 rest');
    app.press('d');
    assert.deepEqual(bar(app, 1).slice(0, 2), ['m1@0 C5 half', 'm1@2 D5 half'], 'D takes the doubled value at beat 3');
  } finally {
    app.unmount();
  }
});

test('W in note input over following notes keeps a cursor on the next remaining note', () => {
  const app = mountApp(FOUR_BARS_OF_QUARTERS);
  try {
    app.press('N 5 g W');
    assert.deepEqual(bar(app, 1), ['m1@0 G4 half', 'm1@2 E5 quarter', 'm1@3 F5 quarter']);
    assert.equal(cursor(app), 'm1@2 E5');
    app.press('Q');
    // F9: the freed beat becomes a rest; E and F keep their onsets (MuseScore Score::changeCRlen).
    assert.deepEqual(bar(app, 1), ['m1@0 G4 quarter', 'm1@1 r quarter', 'm1@2 E5 quarter', 'm1@3 F5 quarter']);
    assert.notEqual(cursor(app), 'none');
  } finally {
    app.unmount();
  }
});
