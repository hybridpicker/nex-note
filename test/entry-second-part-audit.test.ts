import test from 'node:test';
import assert from 'node:assert/strict';

import { applyDocumentCommands, buildDocumentState } from '../src/score-core/commands/apply-document-commands.ts';
import { importMusicXmlToCore } from '../src/musicxml-adapter/import/import-musicxml.ts';
import type { ScoreCommand } from '../src/shared/schemas/score-command.ts';
import { clickFirstEvent, documentIssues, mountEditor, voiceSummary } from './support/entry-harness.ts';
import { TREBLE, scoreXml } from './support/entry-fixtures.ts';

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

function partSnapshot(xml: string, partIndex: number, measures = 2) {
  const core = importMusicXmlToCore(xml);
  const part = core.score.parts[partIndex]!;
  const ids = new Set(part.staves.flatMap((staff) => staff.measures.flatMap((measure) => measure.voices.flatMap((voice) => voice.events.map((event) => event.id)))));
  return JSON.stringify({
    events: part.staves[0]!.measures.slice(0, measures).map((measure) => ({
      directions: measure.directions.map((direction) => `${direction.kind}:${direction.value}`),
      voices: measure.voices.map((voice) => voice.events.map((event) => [
        event.kind, event.timestampNum, event.durationDivisions,
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
  ['accent after an entry', 'N 5 g Shift+.'],
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
  ['accent on the selection', 'Shift+.'],
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
