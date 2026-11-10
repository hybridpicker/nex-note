import assert from 'node:assert/strict';
import test from 'node:test';

import { buildDocumentState } from '../src/score-core/commands/apply-document-commands.ts';
import { importMusicXmlToCore } from '../src/musicxml-adapter/import/import-musicxml.ts';
import { mountApp, type AppHarness } from './support/app-harness.ts';
import { selectableNotesOf, voiceSummary } from './support/entry-harness.ts';
import { FUZZ_FIXTURES, runSequence } from './support/entry-fuzz.ts';

/*
 * Findings of the byte-level fixed-point invariant (docs/note-entry-mastery-ledger.md, iteration 9):
 * after every action the stored MusicXML must be what import and export give back, byte for byte.
 * Each replay failed on the code before the fix named in its row.
 *
 * F22  a letter on a selected tuplet rest outside note input broke the tuplet
 * F22b `T` (or `0`) with another value on a tuplet unit left orphaned units and dotted-64th rests
 * F23  a tie into a note with a grace note of the same pitch ended on the grace after a re-export
 * F24  paste merged a tied pair with chord tones elsewhere in the voice and overfilled that bar
 * F25  paste respelled tied notes outside the pasted span and emptied trailing rest bars
 * F26  Delete on a note with a grace note left the grace alone in a hidden gap
 * F27  `T` onto a tuplet unit of the armed value wrote the plain value over the following units
 * F28  a tie stayed on a note when the note it ran into was replaced, because a grace note of the
 *      same pitch stood there until the end of the edit
 * F29  Undo of the first entry of a voice in a bar left note input without a cursor
 * F30  (iteration 10) a plain note after a tuplet respelled the tuplet's rests; a chord tone took the
 *      armed value instead of the chord's; a letter with another value on a tuplet unit, or a value
 *      reaching into a tuplet, cut the tuplet; grace notes joined the beams of the main notes
 * F32  (iteration 11) Delete on a tuplet unit left plain rests of made-up values; R or copy of one
 *      chord tone pasted a chord tone without its note and shifted another voice; slur ends changed
 *      order on re-export; a note from another voice's cursor cut a tuplet; a chord tone on a note
 *      with a grace note took the grace note's value
 * F34  (iteration 12) Q on a tuplet unit wrote a plain shorter note and a rest of an odd value;
 *      Shift+S lost a cursor that stood inside a longer rest of another voice
 * F33  a bar appended during entry copied the <divisions> of the bar before it, as it stood before
 *      that export; the file then stated a grid its notes did not use
 */

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const REPLAYS: Array<[string, number, string[]]> = [
  ['single staff', 771114, ['click:437', 'Cmd+ArrowRight', 'Cmd+3', 'c']],
  ['three parts', 1271115, ['click:569', 'Cmd+3', 'b']],
  ['grand staff, two voices', 871114, ['N', 'T', '/']],
  ['transposing part', 971105, ['N', 'T', 'Cmd+c', 'Shift+e', 'Cmd+ArrowRight', 'Cmd+v']],
  ['tuplets and graces', 1071113, ['3', 'N', 'T']],
  ['tuplets and graces', 1071116, ['N', 'Delete']],
  ['three parts', 1271115, ['click:569', 'b', '6', 'Cmd+3', 'b', 'g', 'T']],
  ['pickup bar', 1171108, ['N', 'N', 'Delete', 'Cmd+Alt+2', '.', 'a', 'e', 'b', '5', 'f', 'a', 'b', 'a', '0', 'a', 'Cmd+z']],
  // Iteration 10 (F30).
  ['single staff', 3305512, ['N', '3', 'Cmd+3', '0', 'c', 'T', 'c']],
  ['transposing part', 3505504, ['click:75', 'Backspace', '.', 'g', 'Shift+g', 'ArrowDown', 'Cmd+3']],
  ['single staff', 3305529, ['6', 'N', 'Cmd+3', '4', 'f']],
  ['grand staff, two voices', 3405511, ['.', 'N', 'Cmd+3', 'N', 'e']],
  ['transposing part', 3505516, ['click:884', 'Cmd+3', '5', 'e']],
  ['single staff', 48200018, ['N', 'c', 'f', 'f', 'd', 'f', 'd', 'ArrowRight', 'f', 'f', 'Cmd+3', 'Q', '5', 'f']],
  ['three parts', 48700000, ['N', 'g', 'e', 'f', '.', 'f', 'e', '/', '/']],
  // Iteration 11 (F32).
  ['grand staff, two voices', 91830016, ['click:487', 'Delete', 'd', 'Shift+e', 'J', 'N', 'R']],
  ['transposing part', 91930096, ['click:310', 'Cmd+3', 'b', 'Delete', 'Cmd+Alt+2', 'b', 'Shift+e']],
  ['tuplets and graces', 92030068, ['click:814', 'Backspace', '6', 'e', 'Shift+g', 'click:409', 'ArrowLeft', 'W', 'f', 'Backspace']],
  ['pickup bar', 92130060, ['click:924', 'ArrowLeft', 's', 'Shift+ArrowLeft', 's']],
  ['transposing part', 15750091, ['click:252', 'ArrowRight', 'Shift+ArrowLeft', 'd', 'Cmd+Alt+2', 'Cmd+3', 'f', 'Cmd+Alt+1', 'g']],
  ['tuplets and graces', 15850069, ['N', 'ArrowRight', 'Shift+ArrowLeft', 'Shift+g', 'Delete']],
  // Iteration 12 (F34).
  ['transposing part', 7970031, ['N', 'W', 'Cmd+Alt+2', 'c', 'R', '0', 'Shift+s']],
  ['tuplets and graces', 8070046, ['Cmd+Alt+2', 'N', 'e', 'c', 'click:907', 'Cmd+z', 'f', 'ArrowRight', 'Q', 'f', 'ArrowLeft', '5', 'e']],
  ['grand staff, two voices', 62140015, ['click:512', 'a', 'd', 'a', 'a', '3', 'f', 'Cmd+z', 'Cmd+3', 'click:738', 'g', 'Cmd+3']],
  ['grand staff, two voices', 871114, ['Cmd+Alt+2', 'N', 'a', 'Backspace', 'Cmd+c', 'd', 'g', 'd', 'T', '/', 'a', 'f', 'd', 'click:528', 'Cmd+v', 'Shift+ArrowLeft', 'e']],
];
for (const [fixture, seed, actions] of REPLAYS) {
  test(`fuzzer replay passes every invariant: ${fixture}, seed ${seed}`, () => {
    assert.equal(runSequence(fixture, seed, [...actions])?.reason ?? null, null);
  });
}

function drive(fixture: string, actions: string[]): AppHarness {
  const app = mountApp(buildDocumentState(FUZZ_FIXTURES[fixture]!()).xml);
  for (const action of actions) {
    if (action.startsWith('click:')) {
      const notes = selectableNotesOf(app.doc.coreDocument!);
      app.click(notes[Number(action.slice(6)) % notes.length]!);
    } else {
      app.press(action);
    }
  }
  return app;
}

test('F22: a letter on a selected triplet rest enters a triplet note and keeps the triplet', () => {
  const app = drive('three parts', ['click:569', 'Cmd+3', 'b']);
  try {
    const core = importMusicXmlToCore(app.xml);
    assert.deepEqual(core.tuplets.map((tuplet) => tuplet.eventIds.length), [3]);
    assert.equal(app.editor.noteInputMode, true);
  } finally {
    app.unmount();
  }
});

test('F22b: T with another value on the first note of a triplet removes the triplet as a whole', () => {
  const app = drive('tuplets and graces', ['3', 'N', 'T']);
  try {
    assert.equal(importMusicXmlToCore(app.xml).tuplets.length, 0, 'no orphaned tuplet unit');
    assert.deepEqual(
      voiceSummary(app.xml, {}).filter((line) => line.startsWith('m1@') && !line.includes('B4')),
      ['m1@0 E5 eighth', 'm1@0 D5 quarter~', 'm1@1 D5 16th', 'm1@1.25 r eighth.', 'm1@2 A5 half~'],
      'the grace note E5 is not tied and not copied into the tied note',
    );
  } finally {
    app.unmount();
  }
});

test('F22b: a value that does not fit on a later tuplet note is rejected whole, with a sentence', () => {
  const app = drive('tuplets and graces', ['3', 'N', 'ArrowRight', 'ArrowRight', 'ArrowRight']);
  const warn = console.warn;
  console.warn = () => {};
  try {
    const cursor = app.editor.selectedNote!;
    assert.ok(importMusicXmlToCore(app.xml).tuplets.some((tuplet) => tuplet.eventIds.includes(cursor.coreEntityId ?? '')), 'the cursor is on a later tuplet note');
    const before = app.xml;
    app.press('0');
    assert.equal(app.xml, before, 'nothing is half applied');
    assert.match(app.editor.editorError ?? '', /tuplet/i);
  } finally {
    console.warn = warn;
    app.unmount();
  }
});

test('F23: a tie into a note with a grace note of the same pitch stays on the main note', () => {
  const app = drive('grand staff, two voices', ['N', 'T', '/']);
  try {
    assert.equal(buildDocumentState(app.xml).xml, app.xml);
    assert.doesNotMatch(app.xml, /<grace[^>]*\/>(?:(?!<\/note>).)*<tie type="stop"\/>/s, 'the grace note carries no tie stop');
  } finally {
    app.unmount();
  }
});

test('F24, F25: paste leaves tied notes and rest bars outside the pasted span alone', () => {
  const chord = drive('transposing part', ['N', 'T', 'Cmd+c', 'Shift+e', 'Cmd+ArrowRight', 'Cmd+v']);
  try {
    assert.deepEqual(
      voiceSummary(chord.xml, {}).filter((line) => line.startsWith('m1@')),
      ['m1@0 D5 quarter~', 'm1@1 D5 quarter', 'm1@1 E5(chord) quarter', 'm1@2 F5 quarter', 'm1@3 G5 quarter'],
      'the chord tone keeps its note and G5 stays in the bar',
    );
  } finally {
    chord.unmount();
  }
  const plain = drive('transposing part', ['N', 'T', 'Cmd+c', 'Cmd+ArrowRight', 'Cmd+v']);
  try {
    const lines = voiceSummary(plain.xml, {});
    assert.deepEqual(lines.filter((line) => line.startsWith('m1@')), ['m1@0 D5 quarter~', 'm1@1 D5 quarter', 'm1@2 F5 quarter', 'm1@3 G5 quarter']);
    assert.ok(lines.includes('m4@0 r whole'), 'the last bar keeps its whole-bar rest');
  } finally {
    plain.unmount();
  }
});

test('F26: Delete on a note with a grace note leaves a visible rest and no grace', () => {
  const app = drive('tuplets and graces', ['N', 'Delete']);
  try {
    assert.equal(voiceSummary(app.xml, {})[0], 'm1@0 r quarter');
    assert.equal(importMusicXmlToCore(app.xml).graceNotes.length, 0);
    assert.doesNotMatch(app.xml, /<forward>|print-object="no"/);
  } finally {
    app.unmount();
  }
});

test('F27: T onto a triplet unit of the armed value writes a triplet note', () => {
  const app = drive('three parts', ['click:569', 'b', '6', 'Cmd+3', 'b', 'g', 'T']);
  try {
    assert.deepEqual(
      voiceSummary(app.xml, { partIndex: 2 }).filter((line) => line.startsWith('m3@')),
      ['m3@0 B2 quarter', 'm3@0.667 G2 quarter~', 'm3@1.333 G2 quarter', 'm3@2 r half'],
    );
    assert.deepEqual(importMusicXmlToCore(app.xml).tuplets.map((tuplet) => tuplet.eventIds.length), [3]);
  } finally {
    app.unmount();
  }
});

test('F28: a paste over the tied-to note takes the tie off the note before it', () => {
  const app = drive('grand staff, two voices', ['Cmd+Alt+2', 'N', 'a', 'Backspace', 'Cmd+c', 'd', 'g', 'd', 'T', '/', 'a', 'f', 'd', 'click:528', 'Cmd+v']);
  try {
    assert.deepEqual(
      voiceSummary(app.xml, { voice: 2 }).filter((line) => line.startsWith('m1@')),
      ['m1@0 D4 quarter', 'm1@1 G4 quarter', 'm1@2 D4 quarter', 'm1@3 r quarter'],
    );
  } finally {
    app.unmount();
  }
});

test('F29: Undo of the first voice-2 entry in a bar keeps the cursor at its onset', () => {
  const app = drive('pickup bar', ['N', 'N', 'Delete', 'Cmd+Alt+2', '.', 'a', 'e', 'b', '5', 'f', 'a', 'b', 'a', '0', 'a']);
  try {
    const after = voiceSummary(app.xml, { voice: 2 });
    app.press('Cmd+z');
    const cursor = app.editor.selectedNote;
    assert.ok(cursor, 'note input keeps a cursor');
    assert.deepEqual([cursor.measureNumber, cursor.timestampNum / cursor.timestampDen], [4, 0.25]);
    app.press('a');
    assert.deepEqual(voiceSummary(app.xml, { voice: 2 }), after, 'the same key enters the same note again');
  } finally {
    app.unmount();
  }
});

test('F30: a plain note typed after a triplet leaves the triplet rests as they are', () => {
  const app = drive('single staff', ['N', '3', 'Cmd+3', '0', 'c', 'T', 'c']);
  try {
    assert.deepEqual(importMusicXmlToCore(app.xml).tuplets.map((tuplet) => tuplet.eventIds.length), [3]);
    assert.deepEqual(voiceSummary(app.xml, {}).slice(0, 4), ['m1@0 r 32nd', 'm1@0.083 C5 32nd~', 'm1@0.167 C5 32nd', 'm1@0.25 C5 32nd']);
  } finally {
    app.unmount();
  }
});

test('F30: a chord tone takes the value of its chord, not the armed value', () => {
  const app = drive('transposing part', ['click:75', 'Backspace', '.', 'g', 'Shift+g']);
  try {
    assert.deepEqual(voiceSummary(app.xml, {}).filter((line) => line.startsWith('m2@0 ')), ['m2@0 G4 eighth', 'm2@0 G5(chord) eighth']);
  } finally {
    app.unmount();
  }
});

test('F30: another value on the first unit of a triplet removes it; on a later unit it is rejected', () => {
  const first = drive('single staff', ['6', 'N', 'Cmd+3', '4', 'f']);
  try {
    assert.equal(importMusicXmlToCore(first.xml).tuplets.length, 0);
    assert.deepEqual(voiceSummary(first.xml, {}).slice(0, 3), ['m1@0 F4 eighth', 'm1@0.5 r eighth', 'm1@1 r quarter']);
  } finally {
    first.unmount();
  }
  const warn = console.warn;
  console.warn = () => {};
  const later = drive('single staff', ['6', 'N', 'Cmd+3', '4', 'ArrowRight']);
  try {
    const before = later.xml;
    later.press('f');
    assert.equal(later.xml, before);
    assert.match(later.editor.editorError ?? '', /tuplet/i);
  } finally {
    console.warn = warn;
    later.unmount();
  }
});

test('F30: a value that starts before a triplet and reaches into it removes the triplet as a whole', () => {
  const app = drive('single staff', ['N', 'c', 'f', 'f', 'd', 'f', 'd', 'ArrowRight', 'f', 'f', 'Cmd+3', 'Q', '5', 'f']);
  try {
    assert.equal(importMusicXmlToCore(app.xml).tuplets.length, 0);
    assert.deepEqual(
      voiceSummary(app.xml, {}).filter((line) => line.startsWith('m3@')),
      ['m3@0 F5 eighth', 'm3@0.5 F5 eighth~', 'm3@1 F5 eighth', 'm3@1.5 r eighth', 'm3@2 r half'],
    );
  } finally {
    app.unmount();
  }
});

test('F32: Delete on a triplet note leaves a triplet rest of the same value', () => {
  const app = drive('transposing part', ['click:310', 'Cmd+3', 'b', 'ArrowLeft', 'Delete']);
  try {
    assert.deepEqual(voiceSummary(app.xml, {}).filter((line) => line.startsWith('m3@')), ['m3@0 A5 half', 'm3@2 r quarter', 'm3@2.667 r quarter', 'm3@3.333 r quarter']);
    assert.deepEqual(importMusicXmlToCore(app.xml).tuplets.map((tuplet) => tuplet.eventIds.length), [3]);
  } finally {
    app.unmount();
  }
});

test('F32: R on one tone of a chord writes that note and leaves the other voice alone', () => {
  const app = drive('grand staff, two voices', ['click:487', 'Delete', 'd', 'Shift+e', 'J', 'N']);
  try {
    const voice2 = voiceSummary(app.xml, { voice: 2 });
    app.press('R');
    assert.deepEqual(voiceSummary(app.xml, { voice: 2 }), voice2, 'voice 2 is untouched');
    assert.deepEqual(
      voiceSummary(app.xml, {}).filter((line) => line.startsWith('m2@')),
      ['m2@0 E5 quarter', 'm2@1 D5 quarter', 'm2@1 Fb5(chord) quarter', 'm2@2 Fb5 quarter', 'm2@3 D5 quarter'],
    );
  } finally {
    app.unmount();
  }
});

test('F32: a note typed at another voice\'s cursor inside a tuplet is rejected whole', () => {
  const app = drive('transposing part', ['click:252', 'ArrowRight', 'Shift+ArrowLeft', 'd', 'Cmd+Alt+2', 'Cmd+3', 'f', 'Cmd+Alt+1']);
  const warn = console.warn;
  console.warn = () => {};
  try {
    const before = app.xml;
    app.press('g');
    assert.equal(app.xml, before);
    assert.match(app.editor.editorError ?? '', /tuplet/i);
  } finally {
    console.warn = warn;
    app.unmount();
  }
});

test('F32: a chord tone on a note with a grace note takes the main note\'s value', () => {
  const app = drive('tuplets and graces', ['N', 'ArrowRight', 'Shift+ArrowLeft', 'Shift+g']);
  try {
    assert.deepEqual(voiceSummary(app.xml, {}).slice(0, 3), ['m1@0 E5 eighth', 'm1@0 D5 quarter', 'm1@0 G5(chord) quarter']);
  } finally {
    app.unmount();
  }
});

test('F33: an appended bar does not copy the <divisions> of the bar before it', () => {
  const app = drive('grand staff, two voices', ['click:512', 'a', 'd', 'a', 'a', '3', 'f', 'Cmd+z', 'Cmd+3', 'click:738', 'g', 'Cmd+3']);
  try {
    const bar5 = /<measure number="5">(.*?)<\/measure>/s.exec(app.xml)![1]!;
    assert.doesNotMatch(bar5, /<divisions>/, 'bar 5 states no grid of its own');
    // The whole note of bar 5 is still a whole note after reopening the file.
    const reopened = importMusicXmlToCore(app.xml).score.parts[0]!.staves[0]!.measures[4]!.voices[0]!.events[0]!;
    assert.equal(reopened.durationType, 'whole');
    assert.equal(reopened.durationDivisions / (reopened.timestampDen / 4), 4, 'four quarters long');
  } finally {
    app.unmount();
  }
});

test('F34: Q and W change a triplet note inside the triplet', () => {
  const app = drive('tuplets and graces', ['N', 'ArrowRight', 'ArrowRight', 'Q']);
  const warn = console.warn;
  console.warn = () => {};
  try {
    const bar1 = () => voiceSummary(app.xml, {}).filter((line) => line.startsWith('m1@1'));
    assert.deepEqual(bar1(), ['m1@1 E5 16th', 'm1@1.167 r 16th', 'm1@1.333 F#5 eighth', 'm1@1.667 G5 eighth'], 'a triplet 16th and a triplet 16th rest');
    assert.deepEqual(importMusicXmlToCore(app.xml).tuplets.map((tuplet) => tuplet.eventIds.length), [4]);
    app.press('W');
    assert.deepEqual(bar1(), ['m1@1 E5 eighth', 'm1@1.333 F#5 eighth', 'm1@1.667 G5 eighth'], 'W takes the rest unit back');
    const before = app.xml;
    app.press('W');
    assert.equal(app.xml, before, 'a value that would grow over the next note is rejected whole');
    assert.match(app.editor.editorError ?? '', /tuplet/i);
  } finally {
    console.warn = warn;
    app.unmount();
  }
});

test('F34: Shift+S keeps a cursor that stands inside a longer rest of another voice', () => {
  const app = drive('transposing part', ['N', 'W', 'Cmd+Alt+2', 'c', 'R', '0']);
  try {
    const cursor = app.editor.selectedNote!;
    app.press('Shift+s');
    assert.ok(app.editor.selectedNote, 'note input keeps its cursor');
    assert.deepEqual(
      [app.editor.selectedNote.measureNumber, app.editor.selectedNote.timestampNum / app.editor.selectedNote.timestampDen],
      [cursor.measureNumber, cursor.timestampNum / cursor.timestampDen],
    );
  } finally {
    app.unmount();
  }
});
