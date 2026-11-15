import assert from 'node:assert/strict';
import test from 'node:test';

import { act } from 'react-test-renderer';

import { isTextEntryTarget, isTypingTarget } from '../hooks/useNoteEditor.ts';
import { createDefaultNewScoreDraft, createNewScoreXml } from '../lib/new-score.ts';
import { applyDocumentCommands, buildDocumentState } from '../src/score-core/commands/apply-document-commands.ts';
import { buildClipboardPayloadFromSelection } from '../src/score-core/query/clipboard.ts';
import { mountApp } from './support/app-harness.ts';
import { PIANO, scoreXml, TREBLE } from './support/entry-fixtures.ts';
import { keyEvent, mountEditor, selectableNotes, selectableNotesOf } from './support/entry-harness.ts';
import { summarizeScore } from './support/score-summary.ts';

/*
 * Editor-layer regressions (synthetic scores only):
 * - A selection of several notes edits exactly those notes. A range command covers every event of
 *   one lane between its ends, so Cmd-click selections with gaps, selections over two staves and
 *   over two voices are sent as per-note commands (or one range per contiguous run), in ONE batch.
 * - Copy works on the grid of the copied bars; a staff with a finer bar elsewhere no longer blocks it,
 *   and a Cut whose copy failed keeps the music.
 * - Keys typed while a <select>, listbox or combobox has the focus do not reach the score.
 */

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const q = (step: string, octave: number, voice = 1, staff = 0, duration = 4) => (
  `<note><pitch><step>${step}</step><octave>${octave}</octave></pitch><duration>${duration}</duration><voice>${voice}</voice><type>quarter</type>${staff ? `<staff>${staff}</staff>` : ''}</note>`
);
const chordTone = (step: string, octave: number) => (
  `<note><chord/><pitch><step>${step}</step><octave>${octave}</octave></pitch><duration>4</duration><voice>1</voice><type>quarter</type></note>`
);
const lines = (xml: string) => summarizeScore(xml).filter((line) => / v\d+ @/.test(line));
const pitchesOf = (xml: string, prefix: string) => lines(xml).filter((line) => line.startsWith(prefix)).map((line) => line.split(' ').at(-2));

const CDEF = () => scoreXml({ beats: 4, beatType: 4, measures: 2, parts: [{ ...TREBLE, content: { '1:1': q('C', 5) + q('D', 5) + q('E', 5) + q('F', 5) } }] });
const PIANO_BAR = () => scoreXml({ beats: 4, beatType: 4, measures: 1, parts: [{ ...PIANO, content: {
  '1:1': q('C', 5, 1, 1) + q('D', 5, 1, 1) + q('E', 5, 1, 1) + q('F', 5, 1, 1),
  '1:2': q('C', 3, 5, 2) + q('D', 3, 5, 2) + q('E', 3, 5, 2) + q('F', 3, 5, 2),
} }] });
const TWO_VOICES = () => scoreXml({ beats: 4, beatType: 4, measures: 1, parts: [{ ...TREBLE, content: {
  '1:1': q('C', 5) + q('D', 5) + q('E', 5) + q('F', 5) + '<backup><duration>16</duration></backup>' + q('A', 4, 2) + q('B', 4, 2) + q('C', 4, 2) + q('D', 4, 2),
} }] });

function cmdClickFirstAndLast(app: ReturnType<typeof mountApp>) {
  const notes = selectableNotes(app.xml).filter((note) => note.measureNumber === 1 && !note.isRest);
  app.click(notes[0]!);
  app.click(notes[3]!, { additive: true });
  assert.equal(app.editor.selectedNotes.length, 2);
}

test('Cmd-click C and F, Delete: only those two become rests, one Undo restores both', () => {
  const app = mountApp(CDEF());
  const before = lines(app.xml);
  const depth = app.doc.historyDepth;
  cmdClickFirstAndLast(app);
  app.press('Delete');
  assert.deepEqual(lines(app.xml).filter((line) => line.startsWith('m1 ')), [
    'm1 v1 @0 rest quarter', 'm1 v1 @1 D5 quarter', 'm1 v1 @2 E5 quarter', 'm1 v1 @3 rest quarter',
  ]);
  assert.equal(app.doc.historyDepth, depth + 1, 'the delete is one undo step');
  app.undo();
  assert.deepEqual(lines(app.xml), before);
  app.unmount();
});

test('Cmd-click C and F, ArrowUp: D and E stay, one Undo restores both', () => {
  const app = mountApp(CDEF());
  const before = lines(app.xml);
  const depth = app.doc.historyDepth;
  cmdClickFirstAndLast(app);
  app.press('ArrowUp');
  assert.deepEqual(pitchesOf(app.xml, 'm1 '), ['C#5', 'D5', 'E5', 'F#5']);
  assert.equal(app.doc.historyDepth, depth + 1);
  app.undo();
  assert.deepEqual(lines(app.xml), before);
  app.unmount();
});

test('a contiguous Shift range in one lane still goes out as one range command', () => {
  const h = mountEditor(CDEF());
  const notes = selectableNotes(h.xml).filter((note) => note.measureNumber === 1 && !note.isRest);
  act(() => h.current.handleNoteClick(notes[1]!)); h.rerender();
  act(() => h.current.handleNoteClick(notes[2]!, { range: true })); h.rerender();
  h.press('ArrowUp');
  assert.deepEqual(h.batches.at(-1)!.map((command) => command.type), ['transposeRangeChromatic']);
  assert.deepEqual(pitchesOf(h.xml, 'm1 '), ['C5', 'D#5', 'F5', 'F5']);
  h.press('Delete');
  assert.deepEqual(h.batches.at(-1)!.map((command) => command.type), ['deleteRange']);
  assert.deepEqual(pitchesOf(h.xml, 'm1 '), ['C5', 'rest', 'rest', 'F5']);
  h.unmount();
});

test('both piano staves selected: ArrowUp and Delete change both staves in one undo step', () => {
  for (const key of ['ArrowUp', 'Delete']) {
    const app = mountApp(PIANO_BAR());
    const before = lines(app.xml);
    const depth = app.doc.historyDepth;
    const notes = selectableNotes(app.xml).filter((note) => !note.isRest);
    app.click(notes[0]!, { selectionNotes: notes });
    assert.equal(app.editor.selectedNotes.length, 8);
    app.press(key);
    if (key === 'ArrowUp') {
      assert.deepEqual(lines(app.xml), [
        's1 m1 v1 @0 C#5 quarter', 's1 m1 v1 @1 D#5 quarter', 's1 m1 v1 @2 F5 quarter', 's1 m1 v1 @3 F#5 quarter',
        's2 m1 v1 @0 C#3 quarter', 's2 m1 v1 @1 D#3 quarter', 's2 m1 v1 @2 F3 quarter', 's2 m1 v1 @3 F#3 quarter',
      ]);
    } else {
      assert.deepEqual(lines(app.xml).filter((line) => !line.includes(' rest ')), [], 'no note is left on either staff');
    }
    assert.equal(app.doc.historyDepth, depth + 1);
    app.undo();
    assert.deepEqual(lines(app.xml), before);
    app.unmount();
  }
});

test('one note in each staff selected: ArrowUp moves exactly those two', () => {
  const h = mountEditor(PIANO_BAR());
  const notes = selectableNotes(h.xml).filter((note) => !note.isRest);
  const upper = notes.filter((note) => note.staffIndex === 1);
  const lower = notes.filter((note) => note.staffIndex === 2);
  act(() => h.current.handleNoteClick(upper[0]!)); h.rerender();
  act(() => h.current.handleNoteClick(lower[3]!, { range: true })); h.rerender();
  h.press('ArrowUp');
  assert.deepEqual(pitchesOf(h.xml, 's1 '), ['C#5', 'D5', 'E5', 'F5']);
  assert.deepEqual(pitchesOf(h.xml, 's2 '), ['C3', 'D3', 'E3', 'F#3']);
  assert.equal(h.batches.length, 1);
  h.unmount();
});

test('two-voice bar: a click selecting both voices at beat 1 edits only those two notes', () => {
  for (const key of ['ArrowUp', 'Delete']) {
    const app = mountApp(TWO_VOICES());
    const before = lines(app.xml);
    const notes = selectableNotes(app.xml).filter((note) => !note.isRest);
    const clicked = notes.find((note) => note.voiceId === 1 && note.timestampNum === 0)!;
    app.click(clicked, { selectionNotes: notes.filter((note) => note.timestampNum === 0) });
    app.press(key);
    const changed = key === 'ArrowUp' ? ['C#5', 'A#4'] : ['rest', 'rest'];
    assert.deepEqual(pitchesOf(app.xml, 'm1 v1'), [changed[0], 'D5', 'E5', 'F5']);
    assert.deepEqual(pitchesOf(app.xml, 'm1 v2'), [changed[1], 'B4', 'C4', 'D4']);
    app.undo();
    assert.deepEqual(lines(app.xml), before);
    app.unmount();
  }
});

test('two tones of a three-note chord selected: ArrowUp leaves the third tone alone', () => {
  const h = mountEditor(scoreXml({ beats: 4, beatType: 4, measures: 1, parts: [{ ...TREBLE, content: {
    '1:1': q('C', 5) + chordTone('E', 5) + chordTone('G', 5) + q('D', 5, 1, 0, 12),
  } }] }));
  const chord = selectableNotes(h.xml).filter((note) => note.timestampNum === 0 && !note.isRest);
  const c = chord.find((note) => note.step === 'C')!;
  const g = chord.find((note) => note.step === 'G')!;
  act(() => h.current.handleNoteClick(c)); h.rerender();
  act(() => h.current.handleNoteClick(g, { additive: true })); h.rerender();
  h.press('ArrowUp');
  const onset = summarizeScore(h.xml).filter((line) => line.startsWith('m1 v1 @0'));
  assert.ok(onset.some((line) => line.includes('C#5')), onset.join('\n'));
  assert.ok(onset.some((line) => /[ +]E5 /.test(line)), `E5 must not move:\n${onset.join('\n')}`);
  assert.ok(onset.some((line) => line.includes('G#5')), onset.join('\n'));
  h.unmount();
});

test('ripple delete of a Cmd-click selection removes only the selected notes', () => {
  const app = mountApp(CDEF());
  const depth = app.doc.historyDepth;
  cmdClickFirstAndLast(app);
  app.press('Shift+Delete');
  assert.deepEqual(pitchesOf(app.xml, 'm1 ').filter((pitch) => pitch !== 'rest'), ['D5', 'E5']);
  assert.equal(app.doc.historyDepth, depth + 1);
  app.unmount();
});

test('Copy after an eighth triplet in bar 3 succeeds anywhere in the staff', () => {
  const draft = { ...createDefaultNewScoreDraft(), instrumentIds: ['flute'], measureCount: 4 };
  const h = mountEditor(createNewScoreXml(draft as Parameters<typeof createNewScoreXml>[0]));
  act(() => h.current.handleNoteClick(selectableNotes(h.xml).find((note) => note.measureNumber === 3)!)); h.rerender();
  h.press('N Cmd+3 4 g g g Escape');
  const grids = new Set([...h.xml.matchAll(/<divisions>(\d+)<\/divisions>/g)].map((match) => match[1]));
  assert.ok(grids.size > 1, 'the triplet bar has its own <divisions>');
  act(() => h.current.handleNoteClick(selectableNotes(h.xml).find((note) => note.measureNumber === 1)!)); h.rerender();
  h.press('Cmd+c');
  assert.equal(h.current.editorError, null);
  assert.equal(h.current.clipboardCount, 1, 'the clipboard holds the copied rest');
  // Cut of the same kind of selection now copies and deletes.
  act(() => h.current.handleNoteClick(selectableNotes(h.xml).find((note) => note.measureNumber === 2)!)); h.rerender();
  h.press('Cmd+x');
  assert.equal(h.current.editorError, null);
  assert.equal(h.current.clipboardCount, 1);
  h.unmount();
});

test('a copy over bars with different divisions is on their common grid and pastes into another grid', () => {
  // Bar 1 on divisions 4, bar 2 on divisions 3.
  const source = buildDocumentState(scoreXml({ beats: 4, beatType: 4, measures: 3, parts: [{ ...TREBLE, content: {
    '1:1': q('C', 5) + q('D', 5) + q('E', 5) + q('F', 5),
    '2:1': `<attributes><divisions>3</divisions></attributes>${q('G', 5, 1, 0, 3)}${q('A', 5, 1, 0, 3)}<note><pitch><step>B</step><octave>5</octave></pitch><duration>6</duration><voice>1</voice><type>half</type></note>`,
  } }] }));
  const notes = selectableNotesOf(source.coreDocument!).filter((note) => !note.isRest);
  const picked = notes.filter((note) => (note.measureNumber === 1 && 'EF'.includes(note.step)) || (note.measureNumber === 2 && 'GA'.includes(note.step)));
  assert.equal(picked.length, 4);
  const payload = buildClipboardPayloadFromSelection(source.coreDocument, picked.map((note) => ({
    coreEntityId: note.coreEntityId ?? null,
    coreMeasureId: note.coreMeasureId ?? null,
    corePartId: note.corePartId ?? null,
    measureNumber: note.measureNumber,
    staffIndex: note.staffIndex,
    voiceId: note.voiceId,
    timestampNum: note.timestampNum,
    timestampDen: note.timestampDen,
  })));
  assert.ok(payload, 'the copy succeeds');
  assert.equal(payload.sourceDivisions, 12, 'the least common multiple of 4 and 3');
  assert.deepEqual(payload.timeline.map((entry) => [entry.absStart, entry.event.durationDivisions]), [[0, 12], [12, 12], [24, 12], [36, 12]]);
  assert.equal(payload.durationDivisions, 48);

  // Paste into a score whose bars sit on divisions 6, at bar 2 beat 1.
  const target = buildDocumentState(scoreXml({ beats: 4, beatType: 4, measures: 3, divisions: 6, parts: [{ ...TREBLE }] }));
  const pasted = applyDocumentCommands(target, [{
    type: 'pasteContent',
    targetPartId: 'P1',
    targetStaffIndex: 1,
    targetOffset: { measureNumber: 2, timestampNum: 0, timestampDen: 1 },
    clipboardData: payload,
    mode: 'overwrite',
  }]);
  assert.deepEqual(lines(pasted.xml), [
    'm2 v1 @0 E5 quarter', 'm2 v1 @1 F5 quarter', 'm2 v1 @2 G5 quarter', 'm2 v1 @3 A5 quarter',
  ]);

  // And back into the source staff, over bar 3 (divisions 3 there).
  const again = applyDocumentCommands(source, [{
    type: 'pasteContent',
    targetPartId: 'P1',
    targetStaffIndex: 1,
    targetOffset: { measureNumber: 3, timestampNum: 0, timestampDen: 1 },
    clipboardData: payload,
    mode: 'overwrite',
  }]);
  assert.deepEqual(lines(again.xml).filter((line) => line.startsWith('m3 ')), [
    'm3 v1 @0 E5 quarter', 'm3 v1 @1 F5 quarter', 'm3 v1 @2 G5 quarter', 'm3 v1 @3 A5 quarter',
  ]);
});

test('a failed copy keeps the music on Cut (keyboard and menu)', () => {
  // One note of a triplet is an incomplete tuplet: Copy refuses it.
  const tripletEighth = (step: string, tuplet: string) => (
    `<note><pitch><step>${step}</step><octave>4</octave></pitch><duration>2</duration><voice>1</voice><type>eighth</type><time-modification><actual-notes>3</actual-notes><normal-notes>2</normal-notes></time-modification>${tuplet ? `<notations><tuplet type="${tuplet}"/></notations>` : ''}</note>`
  );
  const xml = scoreXml({ beats: 4, beatType: 4, measures: 2, divisions: 6, parts: [{ ...TREBLE, content: {
    '1:1': tripletEighth('G', 'start') + tripletEighth('A', '') + tripletEighth('B', 'stop') + q('C', 5, 1, 0, 6)
      + '<note><pitch><step>D</step><octave>5</octave></pitch><duration>12</duration><voice>1</voice><type>half</type></note>',
  } }] });
  for (const via of ['keyboard', 'menu'] as const) {
    const h = mountEditor(xml);
    const before = h.xml;
    const tripletNote = selectableNotes(h.xml).find((note) => note.measureNumber === 1 && note.step === 'A' && !note.isRest)!;
    act(() => h.current.handleNoteClick(tripletNote)); h.rerender();
    if (via === 'keyboard') h.press('Cmd+x');
    else { act(() => h.current.cutSelection()); h.rerender(); }
    assert.equal(h.current.clipboardCount, 0);
    assert.match(h.current.editorError ?? '', /Copy requires complete tuplets/);
    assert.equal(h.xml, before, `${via}: the notes stay`);
    h.unmount();
  }
});

test('keys typed while a <select> has the focus do not reach the score', () => {
  const h = mountEditor(scoreXml({ beats: 4, beatType: 4, measures: 1, parts: [{ ...TREBLE, content: {
    '1:1': '<note><pitch><step>C</step><octave>5</octave></pitch><duration>16</duration><voice>1</voice><type>whole</type></note>',
  } }] }));
  act(() => h.current.handleNoteClick(selectableNotes(h.xml).find((note) => !note.isRest)!)); h.rerender();
  const before = h.xml;
  let prevented = 0;
  for (const [token, target] of [
    ['ArrowUp', { tagName: 'SELECT', isContentEditable: false, closest: () => null }],
    ['d', { tagName: 'SELECT', isContentEditable: false, closest: () => null }],
    ['ArrowDown', { tagName: 'DIV', isContentEditable: false, getAttribute: (name: string) => (name === 'role' ? 'listbox' : null), closest: () => null }],
    ['Delete', { tagName: 'BUTTON', isContentEditable: false, getAttribute: () => null, closest: (selector: string) => (selector.includes('combobox') ? {} : null) }],
  ] as const) {
    const event = keyEvent(token) as unknown as { target: unknown; preventDefault: () => void };
    event.target = target;
    event.preventDefault = () => { prevented += 1; };
    act(() => h.current.handleKeyDown(event as unknown as KeyboardEvent)); h.rerender();
  }
  assert.equal(h.xml, before);
  assert.equal(prevented, 0);
  // Copy still works from a focused select: a select has no use for Cmd+C.
  const copy = keyEvent('Cmd+c') as unknown as { target: unknown };
  copy.target = { tagName: 'SELECT', isContentEditable: false, closest: () => null };
  act(() => h.current.handleKeyDown(copy as unknown as KeyboardEvent)); h.rerender();
  assert.equal(h.current.clipboardCount, 1);
  h.unmount();
});

test('text-entry targets: fields, selects, listboxes and comboboxes; typing targets: fields only', () => {
  const div = { tagName: 'DIV', isContentEditable: false, getAttribute: () => null, closest: () => null };
  assert.equal(isTextEntryTarget({ ...div, tagName: 'INPUT' } as unknown as EventTarget), true);
  assert.equal(isTextEntryTarget({ ...div, tagName: 'TEXTAREA' } as unknown as EventTarget), true);
  assert.equal(isTextEntryTarget({ ...div, isContentEditable: true } as unknown as EventTarget), true);
  assert.equal(isTextEntryTarget({ ...div, tagName: 'SELECT' } as unknown as EventTarget), true);
  assert.equal(isTextEntryTarget({ ...div, getAttribute: (name: string) => (name === 'role' ? 'combobox' : null) } as unknown as EventTarget), true);
  assert.equal(isTextEntryTarget({ ...div, closest: (selector: string) => (selector.includes('listbox') ? {} : null) } as unknown as EventTarget), true);
  assert.equal(isTextEntryTarget(div as unknown as EventTarget), false);
  assert.equal(isTextEntryTarget(null), false);
  assert.equal(isTypingTarget({ ...div, tagName: 'INPUT' } as unknown as EventTarget), true);
  assert.equal(isTypingTarget({ ...div, isContentEditable: true } as unknown as EventTarget), true);
  assert.equal(isTypingTarget({ ...div, tagName: 'SELECT' } as unknown as EventTarget), false);
  assert.equal(isTypingTarget(div as unknown as EventTarget), false);
});
