import assert from 'node:assert/strict';
import test from 'node:test';

import { readFileSync } from 'node:fs';

import { mountApp } from './support/app-harness.ts';
import { scoreXml, TREBLE } from './support/entry-fixtures.ts';
import { selectableNotes } from './support/entry-harness.ts';
import { summarizeScore } from './support/score-summary.ts';

/*
 * Keyboard flow rows K1 to K3 of docs/note-entry-mastery-ledger.md, each after MuseScore:
 * K1  handbook, "Editing notes and rests": the duration keys "change the duration of one or more
 *     selected notes in normal mode"; `Score::changeCRlen` (shorter leaves rests, longer overwrites).
 * K2  `shortcuts.xml`: `pitch-up-diatonic` Alt+Shift+Up, `pitch-down-diatonic` Alt+Shift+Down.
 * K3  `Score::cmdDeleteSelection`: in note entry the input position goes to the deleted chord's place.
 */

const quarters = (steps: string) => steps.split('').map((step) => (
  `<note><pitch><step>${step}</step><octave>4</octave></pitch><duration>4</duration><voice>1</voice><type>quarter</type></note>`
)).join('');
const TUNE = (fifths = 0) => scoreXml({ beats: 4, beatType: 4, measures: 2, fifths, parts: [{ ...TREBLE, content: { '1:1': quarters('CDEF') } }] });
const notes = (xml: string) => summarizeScore(xml).filter((line) => / v1 /.test(line));
const select = (app: ReturnType<typeof mountApp>, beat: number) => {
  app.click(selectableNotes(app.xml).find((note) => note.measureNumber === 1 && note.timestampNum === beat * 4 && !note.isRest)!);
};

test('K1: a duration key in normal mode changes the value of the selected note', () => {
  const app = mountApp(TUNE());
  select(app, 1);
  app.press('4');
  assert.deepEqual(notes(app.xml), ['m1 v1 @0 C4 quarter', 'm1 v1 @1 D4 eighth', 'm1 v1 @1.5 rest eighth', 'm1 v1 @2 E4 quarter', 'm1 v1 @3 F4 quarter'], 'shorter: a rest fills the freed time');
  app.undo();
  select(app, 1);
  app.press('6');
  assert.deepEqual(notes(app.xml), ['m1 v1 @0 C4 quarter', 'm1 v1 @1 D4 half', 'm1 v1 @3 F4 quarter'], 'longer: the next note is overwritten');
  app.unmount();
});

test('K1: the dot key and W and Q in normal mode act on the selected note', () => {
  const app = mountApp(TUNE());
  select(app, 0);
  app.press('.');
  assert.deepEqual(notes(app.xml).slice(0, 2), ['m1 v1 @0 C4 quarter.', 'm1 v1 @1.5 rest eighth']);
  app.undo();
  select(app, 2);
  app.press('W');
  assert.deepEqual(notes(app.xml), ['m1 v1 @0 C4 quarter', 'm1 v1 @1 D4 quarter', 'm1 v1 @2 E4 half']);
  app.press('Q');
  assert.deepEqual(notes(app.xml), ['m1 v1 @0 C4 quarter', 'm1 v1 @1 D4 quarter', 'm1 v1 @2 E4 quarter', 'm1 v1 @3 rest quarter']);
  app.unmount();
});

test('K2: Alt+Shift+Up and Down move the selected note by a step of the key', () => {
  const app = mountApp(TUNE(2)); // D major: F and C are sharp
  select(app, 2); // E4
  app.press('Alt+Shift+ArrowUp');
  assert.equal(notes(app.xml)[2], 'm1 v1 @2 F#4 quarter', 'E to F sharp in D major');
  app.press('Alt+Shift+ArrowUp');
  assert.equal(notes(app.xml)[2], 'm1 v1 @2 G4 quarter');
  app.press('Alt+Shift+ArrowDown Alt+Shift+ArrowDown Alt+Shift+ArrowDown Alt+Shift+ArrowDown');
  assert.equal(notes(app.xml)[2], 'm1 v1 @2 C#4 quarter');
  app.unmount();
});

test('K3: Backspace in note input takes back the note just entered and puts the cursor on its place', () => {
  const app = mountApp(scoreXml({ beats: 4, beatType: 4, measures: 2, parts: [{ ...TREBLE }] }));
  app.press('N 5 c d e');
  app.press('Backspace');
  assert.deepEqual(notes(app.xml).filter((line) => !/rest/.test(line)), ['m1 v1 @0 C5 quarter', 'm1 v1 @1 D5 quarter']);
  assert.equal(app.editor.selectedNote?.timestampNum, 8, 'the cursor stands on beat 3 again');
  app.press('f');
  assert.deepEqual(notes(app.xml).filter((line) => !/rest/.test(line)), ['m1 v1 @0 C5 quarter', 'm1 v1 @1 D5 quarter', 'm1 v1 @2 F5 quarter']);
  app.press('Backspace Backspace');
  assert.deepEqual(notes(app.xml).filter((line) => !/rest/.test(line)), ['m1 v1 @0 C5 quarter'], 'each Backspace steps one note back');
  assert.equal(app.editor.selectedNote?.timestampNum, 4);
  app.unmount();
});

test('K12: a letter typed on a selected rest takes its octave from the note before it in the voice', () => {
  // C5 D5 E5 F5 with the last note deleted: G is nearest to E5 as G5, not G4 (nearest to the middle line).
  const tune = scoreXml({
    beats: 4, beatType: 4, measures: 2,
    parts: [{ ...TREBLE, content: { '1:1': quarters('CDEF').replace(/<octave>4<\/octave>/g, '<octave>5</octave>') } }],
  });
  const direct = mountApp(tune);
  direct.click(selectableNotes(direct.xml).find((note) => note.measureNumber === 1 && note.timestampNum === 12)!);
  direct.press('Delete g');
  assert.equal(notes(direct.xml)[3], 'm1 v1 @3 G5 quarter');
  direct.unmount();

  // The same through N: both ways of starting note input on that rest agree.
  const viaN = mountApp(tune);
  viaN.click(selectableNotes(viaN.xml).find((note) => note.measureNumber === 1 && note.timestampNum === 12)!);
  viaN.press('Delete N g');
  assert.equal(notes(viaN.xml)[3], 'm1 v1 @3 G5 quarter');
  viaN.unmount();
});

test('F45: a value key on a selected grace note changes the grace note and leaves the main note alone', () => {
  // Synthetic fixture: a grace E5 before a quarter D5, then a triplet.
  const app = mountApp(readFileSync(new URL('./fixtures/tuplet-grace-tie-transposing.musicxml', import.meta.url), 'utf8'));
  const startXml = app.xml;
  const bar1 = () => summarizeScore(app.xml).filter((line) => /m1 v1 @(0|1) /.test(line));
  const before = bar1();
  const grace = selectableNotes(app.xml).find((note) => note.measureNumber === 1 && note.timestampNum === 0 && note.step === 'E')!;
  app.click(grace);
  app.press('3');
  assert.deepEqual(bar1().filter((line) => !/ E5 /.test(line)), before.filter((line) => !/ E5 /.test(line)), 'the main note and the triplet keep their values');
  assert.match(app.xml, /<grace[^>]*\/><pitch><step>E<\/step><octave>5<\/octave><\/pitch><voice>1<\/voice><type>16th<\/type>/, 'the grace note is a sixteenth');
  app.press('.');
  assert.deepEqual(bar1().filter((line) => !/ E5 /.test(line)), before.filter((line) => !/ E5 /.test(line)), 'a dot on the grace note moves nothing either');
  app.undo();
  app.undo();
  assert.equal(app.xml, startXml);
  app.unmount();
});

test('K1: Cmd+W and Cmd+Q are not value keys', () => {
  // Found by `e2e/notation-tools.spec.ts` "closing the score cancels an audition waiting for MIDI":
  // Ctrl+W on a selected note doubled its value before the score closed.
  const app = mountApp(TUNE());
  select(app, 1);
  const before = app.xml;
  app.press('Cmd+w');
  app.press('Cmd+q');
  assert.equal(app.xml, before);
  app.unmount();
});

test('F47: a rest typed on a unit of a half-note triplet is a half-note unit', () => {
  const app = mountApp(TUNE());
  select(app, 0);
  app.press('7 Cmd+3');
  assert.equal((app.xml.match(/<type>half<\/type><time-modification>/g) ?? []).length, 3, 'a whole note becomes a triplet of halves');
  app.press('0');
  assert.equal((app.xml.match(/<rest\/><duration>\d+<\/duration><voice>1<\/voice><type>half<\/type><time-modification>/g) ?? []).length, 3, 'three half-note rests in the triplet');
  assert.doesNotMatch(app.xml, /<type>64th<\/type>/);
  app.unmount();
});

test('F48: a chord tone added to a tuplet unit behind a grace note belongs to the tuplet', () => {
  const app = mountApp(TUNE());
  select(app, 0);
  app.press('Cmd+3 N e / Shift+g');
  const unit = notes(app.xml).filter((line) => / @0 /.test(line));
  assert.equal(unit.length, 3, unit.join(' | '));
  assert.match(unit.join(' | '), /E\d eighth \[grace\]/);
  assert.match(unit.join(' | '), /E\d eighth \[3:2\]/);
  assert.match(unit.join(' | '), /\+G\d eighth \[3:2\]/, 'the chord tone is a unit of the triplet');
  app.unmount();
});
