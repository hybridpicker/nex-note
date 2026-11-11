import test from 'node:test';
import assert from 'node:assert/strict';

import { applyDocumentCommands, buildDocumentState } from '../src/score-core/commands/apply-document-commands.ts';
import { importMusicXmlToCore } from '../src/musicxml-adapter/import/import-musicxml.ts';
import type { ScoreCommand } from '../src/shared/schemas/score-command.ts';
import { act } from 'react-test-renderer';
import { clickFirstEvent, documentIssues, mountEditor, selectableNotes, voiceSummary } from './support/entry-harness.ts';
import { PIANO, TREBLE, scoreXml } from './support/entry-fixtures.ts';

/*
 * Every action in a later part changes that part only (iteration 30). Several note commands carried
 * no part and the executor looked them up in the first part with the same bar number: Delete on an
 * oboe note deleted the flute's note, and articulations, stems and slurs landed on the flute.
 */

const quarters = ['C', 'D', 'E', 'F']
  .map((step) => `<note><pitch><step>${step}</step><octave>5</octave></pitch><duration>4</duration><voice>1</voice><type>quarter</type></note>`)
  .join('');
const DUET = scoreXml({
  beats: 4,
  beatType: 4,
  measures: 2,
  parts: [
    { ...TREBLE, content: { '1:1': quarters, '2:1': quarters } },
    { ...TREBLE, id: 'P2', name: 'Oboe', content: { '1:1': quarters, '2:1': quarters } },
  ],
});

const gcd = (a: number, b: number): number => (b === 0 ? Math.abs(a) : gcd(b, a % b));
/** Musical time as a reduced fraction of a whole note, so a part-wide change of divisions is not a change. */
const reduced = (num: number, den: number) => `${num / gcd(num, den)}/${den / gcd(num, den)}`;

function partSnapshot(xml: string, partIndex: number, measures = 2, staffOffset = 0, musical = false) {
  const core = importMusicXmlToCore(xml);
  const part = core.score.parts[partIndex]!;
  const ids = new Set(part.staves[staffOffset]!.measures.flatMap((measure) => measure.voices.flatMap((voice) => voice.events.map((event) => event.id))));
  return JSON.stringify({
    events: part.staves[staffOffset]!.measures.slice(0, measures).map((measure) => ({
      directions: measure.directions.map((direction) => `${direction.kind}:${direction.value}`),
      voices: measure.voices.map((voice) => voice.events.map((event) => [
        event.kind,
        musical ? reduced(event.timestampNum, event.timestampDen) : event.timestampNum,
        musical ? reduced(event.durationDivisions * 4, event.timestampDen) : event.durationDivisions,
        event.kind === 'note' ? `${event.pitch.step}${event.pitch.alter}${event.pitch.octave}` : '',
        event.articulations ?? [], Boolean(event.tieStart), event.stem ?? '', event.notehead ?? '', event.isChord,
      ])),
    })),
    slurs: core.slurs.filter((slur) => ids.has(slur.startEventId ?? '') || ids.has(slur.stopEventId ?? '')).length,
    lyrics: core.lyricLines.filter((line) => ids.has(line.eventId)).length,
    graces: core.graceNotes.filter((grace) => ids.has(grace.eventId)).length,
    tuplets: core.tuplets.filter((tuplet) => tuplet.eventIds.some((id) => ids.has(id))).length,
    fermatas: [...core.fermataEventIds].filter((id) => ids.has(id)).length,
    tremolos: core.tremolos.filter((tremolo) => ids.has(tremolo.eventId)).length,
    arpeggios: core.arpeggios.filter((arpeggio) => ids.has(arpeggio.eventId)).length,
    glissandos: core.glissandos.filter((line) => ids.has(line.startEventId ?? '')).length,
  });
}

const KEYBOARD: Array<[string, string]> = [
  ['a typed letter', 'N 5 g'],
  ['a typed rest', 'N 5 0'],
  ['eighths', 'N 4 g a b'],
  ['a tied note', 'N 5 g T'],
  ['a Shift chord tone', 'N 5 g Shift+b'],
  ['accent after an entry', 'N 5 g Shift+v'],
  ['staccato after an entry', 'N 5 g Shift+s'],
  ['tenuto after an entry', 'N 5 g Shift+-'],
  ['marcato after an entry', 'N 5 g Shift+6'],
  ['grace after an entry', 'N 5 g /'],
  ['respell after an entry', 'N 5 + g j'],
  ['stem after an entry', 'N 5 g x'],
  ['slash notehead after an entry', 'N 5 g Shift+x'],
  ['a tuplet at the cursor', 'N 5 Cmd+3 c d e'],
  ['an interval', 'N 5 g Alt+3'],
  ['a slur over entered notes', 'N 4 c d e Shift+ArrowLeft s'],
  ['an octave change after an entry', 'N 5 g Cmd+ArrowUp'],
  ['pitch-before-duration', 'N M g 5'],
  ['accent on the selection', 'Shift+v'],
  ['staccato on the selection', 'Shift+s'],
  ['tenuto on the selection', 'Shift+-'],
  ['marcato on the selection', 'Shift+6'],
  ['stem on the selection', 'x'],
  ['slash notehead on the selection', 'Shift+x'],
  ['respell on the selection', 'j'],
  ['a slur on a selected range', 'Shift+ArrowRight s'],
  ['a slur from one selected note', 's'],
  ['Delete', 'Delete'],
  ['ripple delete', 'Shift+Delete'],
  ['clear voice in the bar', 'Cmd+Shift+Delete'],
  ['duplicate', 'Cmd+d'],
  ['pitch up', 'ArrowUp'],
  ['octave up', 'Cmd+ArrowUp'],
  ['grace on the selection', '/'],
  ['a tuplet on the selection', 'Cmd+3'],
  ['an interval on the selection', 'Alt+3'],
  ['a sharp on the selection', '+'],
  ['a flat on the selection', '-'],
  ['a louder dynamic after an entry', 'N 5 g Alt+.'],
  ['a softer dynamic on the selection', 'Alt+,'],
];

for (const [label, script] of KEYBOARD) {
  test(`${label} in the second part changes only the second part [${script}]`, () => {
    const harness = mountEditor(DUET);
    clickFirstEvent(harness, { partIndex: 1 });
    const firstBefore = partSnapshot(harness.xml, 0);
    const secondBefore = partSnapshot(harness.xml, 1);
    harness.press(script);
    harness.rerender();
    assert.equal(partSnapshot(harness.xml, 0), firstBefore, 'the first part must not change');
    assert.notEqual(partSnapshot(harness.xml, 1), secondBefore, 'the second part must change');
    const cursorPart = harness.current.selectedNote?.corePartId;
    if (cursorPart) assert.equal(cursorPart, 'part:P2', 'the cursor stays in the second part');
    assert.deepEqual(documentIssues(harness.xml), []);
    harness.unmount();
  });
}

test('a bar appended by an overflowing edit has a whole-bar rest in the other part', () => {
  const harness = mountEditor(DUET);
  clickFirstEvent(harness, { partIndex: 1 });
  harness.press('Cmd+d');
  harness.rerender();
  assert.deepEqual(voiceSummary(harness.xml, { partIndex: 0 }).at(-1), 'm3@0 r whole');
  harness.unmount();
});

const P2 = buildDocumentState(DUET).coreDocument!.score.parts[1]!.id;
const at = (timestampNum: number, measureNumber = 1) => ({ measureNumber, staffIndex: 1, voiceId: 1, timestampNum, timestampDen: 16 });
const COMMANDS: Array<[string, Record<string, unknown>]> = [
  ['toggleSlur without a stop', { type: 'toggleSlur', corePartId: P2, ...at(0) }],
  ['toggleSlur with a stop', { type: 'toggleSlur', corePartId: P2, ...at(0), stopLocator: at(8) }],
  ['addLyric', { type: 'addLyric', corePartId: P2, ...at(0), text: 'la', verseNumber: 1 }],
  ['setLyricLine', { type: 'setLyricLine', corePartId: P2, ...at(0), text: 'la', verseNumber: 1 }],
  ['addFermata', { type: 'addFermata', corePartId: P2, ...at(0) }],
  ['addTremolo', { type: 'addTremolo', corePartId: P2, ...at(0), lines: 2, tremoloType: 'single' }],
  ['addArpeggio', { type: 'addArpeggio', corePartId: P2, ...at(0) }],
  ['addGlissando', { type: 'addGlissando', start: { ...at(0), corePartId: P2 }, stop: { ...at(4), corePartId: P2 } }],
  ['rippleDelete', { type: 'rippleDelete', corePartId: P2, ...at(0) }],
  ['toggleArticulation', { type: 'toggleArticulation', corePartId: P2, ...at(0), articulation: 'accent' }],
  ['toggleStemDirection', { type: 'toggleStemDirection', corePartId: P2, ...at(0) }],
  ['transposeRangeChromatic (as the Inspector and the hook send it)', { type: 'transposeRangeChromatic', semitones: 2, range: { start: { corePartId: P2, ...at(0) }, end: { corePartId: P2, ...at(8) } } }],
  ['deleteRange (as the hook sends it)', { type: 'deleteRange', range: { start: { corePartId: P2, ...at(0) }, end: { corePartId: P2, ...at(8) } } }],
  ['rippleDeleteRange (as the hook sends it)', { type: 'rippleDeleteRange', range: { start: { corePartId: P2, ...at(0) }, end: { corePartId: P2, ...at(4) } } }],
];

for (const [label, command] of COMMANDS) {
  test(`the ${label} command honours its part`, () => {
    const state = buildDocumentState(DUET);
    const firstBefore = partSnapshot(state.xml, 0);
    const secondBefore = partSnapshot(state.xml, 1);
    const result = applyDocumentCommands(state, [command as unknown as ScoreCommand]);
    assert.equal(partSnapshot(result.xml, 0), firstBefore, 'the first part must not change');
    assert.notEqual(partSnapshot(result.xml, 1), secondBefore, 'the second part must change');
  });
}

/*
 * Iteration 33: the remaining ways to edit notes (copy, cut and paste, range delete, pointer entry
 * and selection, the Edit Palette, the Command Center, repeat-last-input), and two more layouts: the
 * lower staff of a grand staff, and the middle part of three. Every action must change the targeted
 * staff only, and the cursor must stay in it. The Inspector sends commands, covered further below.
 */

const staffQuarters = (staff: number, voice: number, grand: boolean) => ['C', 'D', 'E', 'F']
  .map((step) => `<note><pitch><step>${step}</step><octave>5</octave></pitch><duration>4</duration><voice>${voice}</voice><type>quarter</type>${grand ? `<staff>${staff}</staff>` : ''}</note>`)
  .join('');

interface Scenario {
  name: string;
  xml: string;
  /** Every (part, staff) pair of the score, by index. */
  staves: Array<[part: number, staff: number]>;
  target: { partIndex: number; staff: number; voice: number };
}

const GRAND_DUO: Scenario = {
  name: 'lower staff of a grand staff',
  xml: scoreXml({
    beats: 4,
    beatType: 4,
    measures: 2,
    parts: [
      { ...TREBLE, content: { '1:1': quarters, '2:1': quarters } },
      {
        ...PIANO,
        id: 'P2',
        content: {
          '1:1': staffQuarters(1, 1, true), '2:1': staffQuarters(1, 1, true),
          '1:2': staffQuarters(2, 5, true), '2:2': staffQuarters(2, 5, true),
        },
      },
    ],
  }),
  staves: [[0, 0], [1, 0], [1, 1]],
  target: { partIndex: 1, staff: 2, voice: 5 },
};

const TRIO: Scenario = {
  name: 'middle part of three',
  xml: scoreXml({
    beats: 4,
    beatType: 4,
    measures: 2,
    parts: [
      { ...TREBLE, content: { '1:1': quarters, '2:1': quarters } },
      { ...TREBLE, id: 'P2', name: 'Oboe', content: { '1:1': quarters, '2:1': quarters } },
      { ...TREBLE, id: 'P3', name: 'Clarinet', content: { '1:1': quarters, '2:1': quarters } },
    ],
  }),
  staves: [[0, 0], [1, 0], [2, 0]],
  target: { partIndex: 1, staff: 1, voice: 1 },
};

const DUET_SCENARIO: Scenario = {
  name: 'second of two parts',
  xml: DUET,
  staves: [[0, 0], [1, 0]],
  target: { partIndex: 1, staff: 1, voice: 1 },
};

function auditAction(scenario: Scenario, label: string, run: (harness: ReturnType<typeof mountEditor>) => void, options?: { mustChange?: boolean }) {
  test(`${label}: ${scenario.name} changes only the target`, () => {
    const harness = mountEditor(scenario.xml);
    clickFirstEvent(harness, scenario.target);
    const targetIndex = scenario.staves.findIndex(([part, staff]) => part === scenario.target.partIndex && staff === scenario.target.staff - 1);
    const before = scenario.staves.map(([part, staff]) => partSnapshot(harness.xml, part, 2, staff, true));
    run(harness);
    harness.rerender();
    scenario.staves.forEach(([part, staff], index) => {
      const after = partSnapshot(harness.xml, part, 2, staff, true);
      if (index === targetIndex) {
        if (options?.mustChange !== false) assert.notEqual(after, before[index], 'the target must change');
      } else {
        assert.equal(after, before[index], `part ${part} staff ${staff + 1} must not change`);
      }
    });
    const cursor = harness.current.selectedNote;
    if (cursor?.corePartId) {
      assert.equal(cursor.corePartId, `part:${['P1', 'P2', 'P3'][scenario.target.partIndex]}`, 'the cursor stays in the target part');
      assert.equal(cursor.staffIndex, scenario.target.staff, 'the cursor stays in the target staff');
    }
    assert.deepEqual(documentIssues(harness.xml), []);
    harness.unmount();
  });
}

function clickEvent(harness: ReturnType<typeof mountEditor>, scenario: Scenario, measure: number, options?: { additive?: boolean; range?: boolean }) {
  const core = importMusicXmlToCore(harness.xml);
  const partId = core.score.parts[scenario.target.partIndex]!.id;
  const note = selectableNotes(harness.xml).find((entry) => (
    entry.corePartId === partId && entry.staffIndex === scenario.target.staff
    && entry.voiceId === scenario.target.voice && entry.measureNumber === measure
  ))!;
  act(() => { harness.current.handleNoteClick(note, options); });
  harness.rerender();
}

for (const scenario of [DUET_SCENARIO, GRAND_DUO, TRIO]) {
  for (const [label, script] of KEYBOARD) {
    if (scenario === DUET_SCENARIO) continue;
    auditAction(scenario, `${label} [${script}]`, (harness) => harness.press(script));
  }

  auditAction(scenario, 'repeat-last-input', (harness) => harness.press('N 5 g R'));
  auditAction(scenario, 'copy then paste into the next bar', (harness) => {
    harness.press('ArrowUp Cmd+c');
    clickEvent(harness, scenario, 2);
    harness.press('Cmd+v');
  });
  auditAction(scenario, 'cut', (harness) => harness.press('Cmd+x'));
  auditAction(scenario, 'cut then paste into the next bar', (harness) => {
    harness.press('ArrowUp Cmd+x');
    clickEvent(harness, scenario, 2);
    harness.press('Cmd+v');
  });
  auditAction(scenario, 'range delete by keyboard', (harness) => harness.press('Shift+ArrowRight Shift+ArrowRight Delete'));
  auditAction(scenario, 'range delete by pointer (shift-click)', (harness) => {
    clickEvent(harness, scenario, 2, { range: true });
    harness.press('Delete');
  });
  auditAction(scenario, 'additive pointer selection then Delete', (harness) => {
    clickEvent(harness, scenario, 2, { additive: true });
    harness.press('Delete');
  });
  auditAction(scenario, 'range selection then transpose', (harness) => {
    clickEvent(harness, scenario, 2, { range: true });
    harness.press('ArrowUp');
  });
  auditAction(scenario, 'pointer entry replacing a note', (harness) => {
    const core = importMusicXmlToCore(harness.xml);
    const part = core.score.parts[scenario.target.partIndex]!;
    const note = selectableNotes(harness.xml).find((entry) => (
      entry.corePartId === part.id && entry.staffIndex === scenario.target.staff
      && entry.voiceId === scenario.target.voice && entry.measureNumber === 2 && entry.timestampNum === 4
    ))!;
    act(() => {
      harness.current.placeNoteAt({
        source: 'pointer',
        mode: 'replace',
        measureId: note.coreMeasureId ?? null,
        corePartId: note.corePartId ?? null,
        measureNumber: note.measureNumber,
        staffIndex: note.staffIndex,
        voiceId: note.voiceId,
        timestampNum: note.timestampNum,
        timestampDen: note.timestampDen,
        ratio: note.timestampNum / note.timestampDen,
        domX: null,
        step: 'A',
        octave: 5,
        alter: 0,
        diagnostics: [],
      });
    });
  });
  // The Edit Palette and the Command Center call these hook methods on the current selection.
  const palette: Array<[string, (editor: ReturnType<typeof mountEditor>['current']) => void]> = [
    ['palette accent', (editor) => editor.toggleArticulation('accent')],
    ['palette staccato', (editor) => editor.toggleArticulation('staccato')],
    ['palette clear articulations after accent', (editor) => { editor.toggleArticulation('accent'); }],
    ['palette dynamic', (editor) => editor.addDynamic('mf')],
    ['palette slur on a range', (editor) => editor.toggleSlur()],
    ['palette transpose up a semitone', (editor) => editor.transposeSemitones(1)],
    ['palette transpose down an octave', (editor) => editor.transposeSemitones(-12)],
    ['palette duplicate', (editor) => editor.duplicateSelection()],
    ['palette delete', (editor) => editor.deleteSelectedNote()],
    ['palette cut', (editor) => editor.cutSelection()],
    ['palette fill slash', (editor) => editor.fillSlashMeasure()],
    ['command center rest', (editor) => editor.insertRest()],
  ];
  for (const [label, run] of palette) {
    auditAction(scenario, label, (harness) => {
      if (label.includes('slur')) harness.press('Shift+ArrowRight');
      act(() => { run(harness.current); });
    });
  }
  auditAction(scenario, 'palette tie', (harness) => {
    harness.press('N 5 g');
    harness.press('Escape');
    act(() => { harness.current.toggleTie(); });
  }, { mustChange: false });
  auditAction(scenario, 'palette clear articulations', (harness) => {
    harness.press('Shift+v');
    harness.rerender();
    act(() => { harness.current.clearArticulations(); });
  }, { mustChange: false });
  auditAction(scenario, 'palette paste', (harness) => {
    harness.press('ArrowUp Cmd+c');
    clickEvent(harness, scenario, 2);
    act(() => { harness.current.pasteClipboard(); });
  });
}

test('setSlurPlacement finds the stop note in its own part (the Inspector command)', () => {
  const withSlurs = applyDocumentCommands(buildDocumentState(DUET), [
    { type: 'toggleSlur', corePartId: P2, ...at(0), stopLocator: at(8) },
    { type: 'toggleSlur', corePartId: buildDocumentState(DUET).coreDocument!.score.parts[0]!.id, ...at(0), stopLocator: at(8) },
  ] as unknown as ScoreCommand[]);
  const result = applyDocumentCommands(withSlurs, [
    { type: 'setSlurPlacement', corePartId: P2, ...at(0), stopLocator: at(8), placement: 'below' },
  ] as unknown as ScoreCommand[]);
  const slurs = result.coreDocument!.slurs;
  assert.equal(slurs.length, 2);
  const placed = slurs.filter((slur) => slur.placement === 'below');
  assert.equal(placed.length, 1, 'only the oboe slur is placed below');
  assert.ok(placed[0]!.startEventId?.includes('P2'), 'the placed slur belongs to the second part');
});
