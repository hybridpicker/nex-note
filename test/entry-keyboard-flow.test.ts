import assert from 'node:assert/strict';
import test from 'node:test';

import { readFileSync } from 'node:fs';

import { mountApp } from './support/app-harness.ts';
import { BASS, CLARINET_BB, scoreXml, TREBLE } from './support/entry-fixtures.ts';
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

/*
 * K8: bars from the keyboard. MuseScore `shortcuts.xml`: `insert-measure` Ins (one bar before the
 * selection), `append-measure` Ctrl+B (one bar at the end), `time-delete` Ctrl+Del (the selected bars).
 */
const barCount = (xml: string) => (xml.match(/<measure /g) ?? []).length;

test('K8: Insert puts an empty bar before the bar of the selection and selects it', () => {
  const app = mountApp(TUNE(2));
  const startXml = app.xml;
  select(app, 1);
  app.press('Insert');
  assert.equal(barCount(app.xml), 3);
  assert.deepEqual(notes(app.xml), ['m2 v1 @0 C4 quarter', 'm2 v1 @1 D4 quarter', 'm2 v1 @2 E4 quarter', 'm2 v1 @3 F4 quarter']);
  assert.deepEqual(summarizeScore(app.xml).filter((line) => / (key|time|clef) /.test(line)), ['m1 key 2', 'm1 time 4/4', 'm1 clef G2']);
  assert.equal(app.editor.selectedNote?.measureNumber, 1);
  assert.equal(app.editor.selectedNote?.isRest, true);
  app.undo();
  assert.equal(app.xml, startXml);
  app.unmount();
});

test('K8: Cmd+B appends a bar at the end and leaves the selection where it is', () => {
  const app = mountApp(TUNE());
  select(app, 2);
  const before = notes(app.xml);
  app.press('Cmd+b');
  assert.equal(barCount(app.xml), 3);
  assert.deepEqual(notes(app.xml), before);
  assert.equal(app.editor.selectedNote?.measureNumber, 1);
  assert.equal(app.editor.selectedNote?.step, 'E');
  app.unmount();
});

test('K8: Cmd+Delete removes the bar of the selection; the last bar of a score stays, with a sentence', () => {
  const app = mountApp(TUNE(2));
  const startXml = app.xml;
  select(app, 1);
  app.press('Cmd+Delete');
  assert.equal(barCount(app.xml), 1);
  assert.deepEqual(notes(app.xml), []);
  assert.deepEqual(summarizeScore(app.xml).filter((line) => / (key|time|clef) /.test(line)), ['m1 key 2', 'm1 time 4/4', 'm1 clef G2'], 'the score keeps its clef, key and time signature');
  assert.equal(app.editor.selectedNote?.measureNumber, 1);
  const oneBar = app.xml;
  app.press('Cmd+Delete');
  assert.equal(app.xml, oneBar);
  assert.match(String(app.editor.editorError ?? ''), /last bar/i);
  app.undo();
  assert.equal(app.xml, startXml);
  app.unmount();
});

/*
 * K7 (voices): MuseScore `voice-1` … `voice-4` (Ctrl+Alt+1–4) in normal mode move the selected notes
 * to that voice (`Score::changeSelectedElementsVoice`): they go where the target voice has a rest or a
 * chord of the same value, and a rest stays behind.
 */
test('K7: Cmd+Alt+2 outside note input moves the selected notes to voice 2 and leaves rests behind', () => {
  const app = mountApp(TUNE());
  const startXml = app.xml;
  select(app, 1);
  app.press('Shift+ArrowRight Cmd+Alt+2');
  const pitched = summarizeScore(app.xml).filter((line) => /^m1 v\d /.test(line) && !/ rest /.test(line));
  assert.deepEqual(pitched.sort(), ['m1 v1 @0 C4 quarter', 'm1 v1 @3 F4 quarter', 'm1 v2 @1 D4 quarter', 'm1 v2 @2 E4 quarter']);
  assert.equal(app.editor.selectedVoice, 2);
  assert.equal(app.editor.selectedNote?.step, 'D');
  assert.equal(((app.editor.selectedNote!.voiceId - 1) % 4) + 1, 2, 'the selection follows the notes into voice 2');
  app.undo();
  assert.equal(app.xml, startXml);
  app.unmount();
});

test('K7: notes are not moved onto other music of the target voice; a sentence says so', () => {
  const app = mountApp(TUNE());
  select(app, 1);
  app.press('Cmd+Alt+2');
  const moved = app.xml;
  // Voice 1 has C, rest, E, F now; moving the voice-2 D back is fine, moving E onto … nothing in the way.
  // Put a half note in voice 1 over beats 2 and 3, then try to move the voice-2 D (beat 2) onto it.
  select(app, 0);
  app.press('6');
  const blocked = app.xml;
  assert.notEqual(blocked, moved);
  app.click(selectableNotes(app.xml).find((note) => note.measureNumber === 1 && note.step === 'D' && !note.isRest)!);
  app.press('Cmd+Alt+1');
  assert.equal(app.xml, blocked, 'nothing changes');
  assert.match(String(app.editor.editorError ?? ''), /voice 1 already has/i);
  app.unmount();
});

test('K7: with a rest selected, or in note input, Cmd+Alt+2 only chooses the input voice', () => {
  const app = mountApp(TUNE());
  const startXml = app.xml;
  select(app, 1);
  app.press('N Cmd+Alt+2');
  assert.equal(app.xml, startXml);
  assert.equal(app.editor.selectedVoice, 2);
  app.unmount();
});

test('F49: a value key on a unit of a tuplet inside a tuplet is rejected with a sentence', () => {
  const app = mountApp(TUNE());
  select(app, 0);
  app.press('Cmd+3 Cmd+3');
  const nested = app.xml;
  assert.match(nested, /<tuplet number="2" type="start"/, 'a triplet inside a triplet');
  app.press('5');
  assert.equal(app.xml, nested, 'nothing changes');
  assert.match(String(app.editor.editorError ?? ''), /tuplet/i);
  app.unmount();
});

test('K13: the arrow keys leave a voice that ends: the selection goes on in the first voice of the staff', () => {
  const app = mountApp(scoreXml({ beats: 4, beatType: 4, measures: 3, parts: [{ ...TREBLE, content: { '1:1': quarters('CDEF'), '2:1': quarters('GABC'), '3:1': quarters('DEFG') } }] }));
  const at = () => `${app.editor.selectedNote?.measureNumber}:${app.editor.selectedNote?.timestampNum}:${app.editor.selectedNote?.isRest ? 'rest' : app.editor.selectedNote?.step}:v${((app.editor.selectedNote!.voiceId - 1) % 4) + 1}`;
  // Bar 2 goes to voice 2 as a whole; voice 2 exists in bar 2 only.
  app.click(selectableNotes(app.xml).find((note) => note.measureNumber === 2 && note.timestampNum === 0 && !note.isRest)!);
  app.press('Shift+ArrowRight Shift+ArrowRight Shift+ArrowRight Cmd+Alt+2');
  assert.equal(at(), '2:0:G:v2');
  app.press('Cmd+ArrowRight');
  assert.equal(at(), '3:0:D:v1', 'Cmd+Right goes to the next bar');
  app.press('Cmd+ArrowLeft');
  assert.equal(at(), '2:0:rest:v1', 'and back into the first voice of bar 2');
  app.press('Alt+ArrowDown');
  app.press('ArrowRight ArrowRight ArrowRight');
  assert.equal(at(), '2:12:C:v2', 'the last note of voice 2');
  app.press('ArrowRight');
  assert.equal(at(), '3:0:D:v1', 'Right goes on into bar 3');
  app.press('Cmd+ArrowLeft Alt+ArrowDown');
  assert.equal(at(), '2:0:G:v2');
  app.press('ArrowLeft');
  assert.equal(at(), '1:12:F:v1', 'Left from the first note of voice 2 goes to the note before it in voice 1');
  app.unmount();
});

test('K14: Cmd+Home and Cmd+End go to the first and the last position of the top staff, whatever the other parts hold', () => {
  const app = mountApp(scoreXml({ beats: 4, beatType: 4, measures: 4, parts: [{ ...TREBLE, id: 'P1', content: { '1:1': quarters('CDEF') } }, { ...CLARINET_BB, id: 'P2' }, { ...BASS, id: 'P3' }] }));
  app.click(selectableNotes(app.xml).find((note) => note.corePartId === 'part:P2' && note.measureNumber === 2)!);
  app.press('Cmd+Home');
  assert.equal(app.editor.selectedNote?.corePartId, 'part:P1');
  assert.equal(app.editor.selectedNote?.measureNumber, 1);
  assert.equal(app.editor.selectedNote?.step, 'C');
  assert.equal(app.editor.selectedNote?.isRest, false);
  app.press('Cmd+End');
  assert.equal(app.editor.selectedNote?.corePartId, 'part:P1');
  assert.equal(app.editor.selectedNote?.measureNumber, 4);
  app.unmount();
});

test('F53: a phrase copied to a transposing part keeps its sounding pitch', () => {
  // Flute (concert pitch), clarinet in B flat (written a major second above its sound), cello.
  const app = mountApp(scoreXml({ beats: 4, beatType: 4, measures: 2, parts: [
    { ...TREBLE, id: 'P1', content: { '1:1': quarters('CDEF').replace(/<octave>4/g, '<octave>5') } },
    { ...CLARINET_BB, id: 'P2' },
    { ...BASS, id: 'P3' },
  ] }));
  const startXml = app.xml;
  app.press('Cmd+Home Shift+ArrowRight Shift+ArrowRight Shift+ArrowRight Cmd+c');
  app.click(selectableNotes(app.xml).find((note) => note.corePartId === 'part:P2' && note.measureNumber === 1)!);
  app.press('Cmd+v');
  const pitches = (part: string) => summarizeScore(app.xml).filter((line) => line.startsWith(`${part} m1 v`) && !/ rest /.test(line)).map((line) => line.split(' ')[4]);
  assert.deepEqual(pitches('P2'), ['D5', 'E5', 'F#5', 'G5'], 'written a major second higher: the clarinet sounds C D E F');
  // Back into the flute from the clarinet: the flute gets what the clarinet sounds.
  app.press('Cmd+c');
  app.click(selectableNotes(app.xml).find((note) => note.corePartId === 'part:P3' && note.measureNumber === 1)!);
  app.press('Cmd+v');
  assert.deepEqual(pitches('P3'), ['C5', 'D5', 'E5', 'F5'], 'concert pitch again in a part that does not transpose');
  app.undo();
  app.undo();
  assert.equal(app.xml, startXml);
  app.unmount();
});

test('K15: Cmd+Shift+Right extends the selection to the first note of the next bar, Cmd+Shift+Left takes it back', () => {
  // MuseScore `select-next-measure` / `select-prev-measure` (Ctrl+Shift+Right / Left).
  const app = mountApp(scoreXml({ beats: 4, beatType: 4, measures: 3, parts: [{ ...TREBLE, content: { '1:1': quarters('CDEF'), '2:1': quarters('GABC'), '3:1': quarters('DEFG') } }] }));
  select(app, 0);
  app.press('Cmd+Shift+ArrowRight');
  assert.equal(app.editor.selectedNotes.length, 5, 'bar 1 and the first note of bar 2');
  assert.equal(app.editor.selectedNote?.measureNumber, 2);
  app.press('Cmd+Shift+ArrowRight');
  assert.equal(app.editor.selectedNotes.length, 9);
  app.press('Cmd+Shift+ArrowLeft');
  assert.equal(app.editor.selectedNotes.length, 5);
  app.unmount();
});

test('K16: Alt+Down and Alt+Up go to the staff below and above, across parts, at the same time in the bar', () => {
  // MuseScore `down-chord` / `up-chord` (Alt+Down / Alt+Up).
  const app = mountApp(scoreXml({ beats: 4, beatType: 4, measures: 2, parts: [
    { ...TREBLE, id: 'P1', content: { '1:1': quarters('CDEF') } },
    { ...CLARINET_BB, id: 'P2' },
    { ...BASS, id: 'P3', content: { '1:1': `<note><pitch><step>C</step><octave>3</octave></pitch><duration>8</duration><voice>1</voice><type>half</type></note><note><pitch><step>G</step><octave>2</octave></pitch><duration>8</duration><voice>1</voice><type>half</type></note>` } },
  ] }));
  const at = () => `${app.editor.selectedNote?.corePartId}:${app.editor.selectedNote?.timestampNum}:${app.editor.selectedNote?.isRest ? 'rest' : app.editor.selectedNote?.step}`;
  select(app, 3);
  assert.equal(at(), 'part:P1:12:F');
  app.press('Alt+ArrowDown');
  assert.equal(at(), 'part:P2:0:rest', 'the whole-bar rest of the clarinet sounds at beat 4');
  app.press('Alt+ArrowDown');
  assert.equal(at(), 'part:P3:0:C', 'from the rest, which starts on beat 1: what stands there in the cello');
  app.press('Alt+ArrowDown');
  assert.equal(at(), 'part:P3:0:C', 'the bottom staff is the end');
  app.press('ArrowRight Alt+ArrowUp');
  assert.equal(at(), 'part:P2:0:rest', 'from beat 3 of the cello up: the rest that sounds there');
  app.press('Alt+ArrowUp');
  assert.equal(at(), 'part:P1:0:C');
  app.unmount();
});

test('K17: in note input the arrow keys move the cursor and keep the chosen voice', () => {
  const app = mountApp(scoreXml({ beats: 4, beatType: 4, measures: 3, parts: [{ ...TREBLE, content: { '1:1': quarters('CDEF'), '2:1': quarters('GABC') } }] }));
  select(app, 0);
  app.press('N Cmd+Alt+2 Cmd+ArrowRight');
  assert.equal(app.editor.selectedVoice, 2, 'Cmd+Right keeps voice 2');
  app.press('ArrowRight ArrowLeft Cmd+Home Cmd+ArrowRight');
  assert.equal(app.editor.selectedVoice, 2, 'so do Right, Left and Cmd+Home');
  app.press('5 e');
  assert.deepEqual(summarizeScore(app.xml).filter((line) => /^m2 v2 /.test(line) && !/ rest /.test(line)), ['m2 v2 @0 E5 quarter'], 'the note goes into voice 2 of bar 2 (first note of the voice: nearest the middle line)');
  assert.equal(notes(app.xml).filter((line) => /^m2 v1 /.test(line)).length, 4, 'voice 1 of bar 2 is untouched');
  app.unmount();
});
