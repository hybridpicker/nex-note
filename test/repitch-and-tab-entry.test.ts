import test from 'node:test';
import assert from 'node:assert/strict';

import {
  enterRepitchMode,
  exitRepitchMode,
  buildRepitchPitchCommand,
  advanceRepitchCursor,
  resolveRepitchPitchFromKey,
  resolveQwertyPianoKey,
  type RepitchState,
} from '../src/score-input/repitch-mode.ts';

import {
  createGuitarTabBuffer,
  resolveGuitarTabKey,
  processTabDigit,
  commitTabFret,
  resolveFretDigitKey,
  resolveTabStringNavigation,
  navigateTabString,
  type GuitarTabBufferState,
} from '../src/score-input/guitar-tab-entry.ts';

import { importMusicXmlToCore } from '../src/musicxml-adapter/import/import-musicxml.ts';

// --- Repitch mode tests ---

test('enterRepitchMode creates active state at anchor position', () => {
  const state = enterRepitchMode({
    measureNumber: 3,
    staffIndex: 1,
    voiceId: 1,
    timestampNum: 1,
    timestampDen: 4,
    coreMeasureId: 'm3',
    corePartId: 'P1',
  });

  assert.equal(state.active, true);
  assert.equal(state.measureNumber, 3);
  assert.equal(state.staffIndex, 1);
  assert.equal(state.voiceId, 1);
  assert.equal(state.currentTimestampNum, 1);
  assert.equal(state.currentTimestampDen, 4);
  assert.equal(state.coreMeasureId, 'm3');
  assert.equal(state.corePartId, 'P1');
});

test('exitRepitchMode creates inactive state', () => {
  const state = exitRepitchMode();
  assert.equal(state.active, false);
});

test('buildRepitchPitchCommand generates changeNotePitch command', () => {
  const state = enterRepitchMode({
    measureNumber: 2,
    staffIndex: 1,
    voiceId: 2,
    timestampNum: 3,
    timestampDen: 8,
  });

  const cmd = buildRepitchPitchCommand(state, { step: 'G', octave: 5, alter: -1 });

  assert.equal(cmd.type, 'changeNotePitch');
  assert.equal(cmd.measureNumber, 2);
  assert.equal(cmd.staffIndex, 1);
  assert.equal(cmd.voiceId, 2);
  assert.equal(cmd.timestampNum, 3);
  assert.equal(cmd.timestampDen, 8);
  assert.equal(cmd.step, 'G');
  assert.equal(cmd.octave, 5);
  assert.equal(cmd.alter, -1);
});

test('advanceRepitchCursor advances to next note in same voice', () => {
  const XML = `<?xml version="1.0" encoding="UTF-8"?>
<score-partwise version="3.1">
  <part-list><score-part id="P1"><part-name>Test</part-name></score-part></part-list>
  <part id="P1">
    <measure number="1">
      <attributes><divisions>1</divisions><time><beats>4</beats><beat-type>4</beat-type></time><clef><sign>G</sign><line>2</line></clef></attributes>
      <note><pitch><step>C</step><octave>4</octave></pitch><duration>1</duration><voice>1</voice><type>quarter</type><staff>1</staff></note>
      <note><pitch><step>D</step><octave>4</octave></pitch><duration>1</duration><voice>1</voice><type>quarter</type><staff>1</staff></note>
      <note><pitch><step>E</step><octave>4</octave></pitch><duration>1</duration><voice>1</voice><type>quarter</type><staff>1</staff></note>
      <note><pitch><step>F</step><octave>4</octave></pitch><duration>1</duration><voice>1</voice><type>quarter</type><staff>1</staff></note>
    </measure>
  </part>
</score-partwise>`;

  const doc = importMusicXmlToCore(XML);
  const state = enterRepitchMode({
    measureNumber: 1,
    staffIndex: 1,
    voiceId: 1,
    timestampNum: 0,
    timestampDen: 4,
  });

  const next = advanceRepitchCursor(state, doc);
  assert.ok(next);
  assert.equal(next!.active, true);
  assert.equal(next!.measureNumber, 1);
  assert.equal(next!.currentTimestampNum, 1);
});

test('advanceRepitchCursor returns null at last note', () => {
  const XML = `<?xml version="1.0" encoding="UTF-8"?>
<score-partwise version="3.1">
  <part-list><score-part id="P1"><part-name>Test</part-name></score-part></part-list>
  <part id="P1">
    <measure number="1">
      <attributes><divisions>1</divisions><time><beats>4</beats><beat-type>4</beat-type></time><clef><sign>G</sign><line>2</line></clef></attributes>
      <note><pitch><step>C</step><octave>4</octave></pitch><duration>4</duration><voice>1</voice><type>whole</type><staff>1</staff></note>
    </measure>
  </part>
</score-partwise>`;

  const doc = importMusicXmlToCore(XML);
  const state = enterRepitchMode({
    measureNumber: 1,
    staffIndex: 1,
    voiceId: 1,
    timestampNum: 0,
    timestampDen: 4,
  });

  const next = advanceRepitchCursor(state, doc);
  assert.equal(next, null);
});

test('resolveRepitchPitchFromKey maps A-G to pitch intents', () => {
  assert.deepEqual(resolveRepitchPitchFromKey('C'), { step: 'C', octave: 4, alter: 0 });
  assert.deepEqual(resolveRepitchPitchFromKey('a'), { step: 'A', octave: 4, alter: 0 });
  assert.deepEqual(resolveRepitchPitchFromKey('G'), { step: 'G', octave: 4, alter: 0 });
});

test('resolveRepitchPitchFromKey returns null for non-pitch keys', () => {
  assert.equal(resolveRepitchPitchFromKey('1'), null);
  assert.equal(resolveRepitchPitchFromKey('H'), null);
  assert.equal(resolveRepitchPitchFromKey(''), null);
  assert.equal(resolveRepitchPitchFromKey('Shift'), null);
});

// --- QWERTY Piano tests ---

test('resolveQwertyPianoKey maps Z to C4', () => {
  const result = resolveQwertyPianoKey('z');
  assert.ok(result);
  assert.equal(result!.step, 'C');
  assert.equal(result!.octave, 4);
  assert.equal(result!.alter, 0);
});

test('resolveQwertyPianoKey maps S to C#4', () => {
  const result = resolveQwertyPianoKey('s');
  assert.ok(result);
  assert.equal(result!.step, 'C');
  assert.equal(result!.alter, 1);
  assert.equal(result!.octave, 4);
});

test('resolveQwertyPianoKey maps Q to C5 (upper octave)', () => {
  const result = resolveQwertyPianoKey('q');
  assert.ok(result);
  assert.equal(result!.step, 'C');
  assert.equal(result!.octave, 5);
  assert.equal(result!.alter, 0);
});

test('resolveQwertyPianoKey maps all 24 chromatic keys in two octaves', () => {
  const lowerOctave = ['z', 's', 'x', 'd', 'c', 'v', 'g', 'b', 'h', 'n', 'j', 'm'];
  const upperOctave = ['q', '2', 'w', '3', 'e', 'r', '5', 't', '6', 'y', '7', 'u'];

  for (const key of lowerOctave) {
    const result = resolveQwertyPianoKey(key);
    assert.ok(result, `Key '${key}' should map to a pitch`);
    assert.equal(result!.octave, 4, `Key '${key}' should be octave 4`);
  }

  for (const key of upperOctave) {
    const result = resolveQwertyPianoKey(key);
    assert.ok(result, `Key '${key}' should map to a pitch`);
    assert.equal(result!.octave, 5, `Key '${key}' should be octave 5`);
  }
});

test('resolveQwertyPianoKey returns null for unmapped keys', () => {
  assert.equal(resolveQwertyPianoKey('1'), null);
  assert.equal(resolveQwertyPianoKey('a'), null);
  assert.equal(resolveQwertyPianoKey('p'), null);
  assert.equal(resolveQwertyPianoKey('Enter'), null);
});

test('resolveQwertyPianoKey handles uppercase', () => {
  const result = resolveQwertyPianoKey('Z');
  assert.ok(result);
  assert.equal(result!.step, 'C');
  assert.equal(result!.octave, 4);
});

// --- Guitar Tab Entry tests ---

test('createGuitarTabBuffer initializes with defaults', () => {
  const state = createGuitarTabBuffer();
  assert.equal(state.buffer, '');
  assert.equal(state.string, 1);
  assert.equal(state.tuning, 'standard');
  assert.equal(state.pending, false);
});

test('createGuitarTabBuffer accepts custom string and tuning', () => {
  const state = createGuitarTabBuffer(3, 'drop-d');
  assert.equal(state.string, 3);
  assert.equal(state.tuning, 'drop-d');
});

test('resolveFretDigitKey returns digit for number keys', () => {
  assert.equal(resolveFretDigitKey('0'), 0);
  assert.equal(resolveFretDigitKey('5'), 5);
  assert.equal(resolveFretDigitKey('9'), 9);
});

test('resolveFretDigitKey returns null for non-digit keys', () => {
  assert.equal(resolveFretDigitKey('a'), null);
  assert.equal(resolveFretDigitKey('ArrowUp'), null);
  assert.equal(resolveFretDigitKey('Enter'), null);
});

test('resolveTabStringNavigation returns up/down for arrow keys', () => {
  assert.equal(resolveTabStringNavigation('ArrowUp'), 'up');
  assert.equal(resolveTabStringNavigation('ArrowDown'), 'down');
  assert.equal(resolveTabStringNavigation('ArrowLeft'), null);
  assert.equal(resolveTabStringNavigation('a'), null);
});

test('navigateTabString moves up and down with wrap-around', () => {
  assert.equal(navigateTabString(1, 'up'), 6);   // wrap to highest string
  assert.equal(navigateTabString(2, 'up'), 1);
  assert.equal(navigateTabString(6, 'down'), 1);  // wrap to lowest string
  assert.equal(navigateTabString(3, 'down'), 4);
  assert.equal(navigateTabString(4, 'up'), 3);
});

test('commitTabFret produces setGuitarFret command and advances string', () => {
  const state = createGuitarTabBuffer(1, 'standard');
  const result = commitTabFret(state, 3, 1, 1, 1, 0, 4);

  assert.equal(result.command.type, 'setGuitarFret');
  assert.equal(result.command.string, 1);
  assert.equal(result.command.fret, 3);
  assert.equal(result.command.measureNumber, 1);
  assert.equal(result.nextState.string, 2); // auto-advanced to next string
  assert.equal(result.nextState.buffer, '');
});

test('commitTabFret wraps from string 6 to string 1', () => {
  const state = createGuitarTabBuffer(6, 'standard');
  const result = commitTabFret(state, 5, 1, 1, 1, 0, 4);

  assert.equal(result.nextState.string, 1);
});

test('commitTabFret passes through tuning and techniques', () => {
  const state = createGuitarTabBuffer(2, 'drop-d');
  const result = commitTabFret(state, 7, 2, 1, 1, 1, 4, 'open-g', ['slide']);

  assert.equal((result.command as unknown as Record<string, unknown>).tuning, 'open-g');
  assert.deepEqual((result.command as unknown as Record<string, unknown>).techniques, ['slide']);
});
