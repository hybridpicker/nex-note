import test from 'node:test';
import assert from 'node:assert/strict';
import { act } from 'react-test-renderer';

import { applyDocumentCommands, buildDocumentState } from '../src/score-core/commands/apply-document-commands.ts';
import { importMusicXmlToCore } from '../src/musicxml-adapter/import/import-musicxml.ts';
import { mountEditor, selectableNotes } from './support/entry-harness.ts';
import { TREBLE, scoreXml } from './support/entry-fixtures.ts';

/*
 * Backlog 34: removing a text direction removed the same text from every part, because the visual
 * selection did not know its part. The click now carries the part into removeDirection.
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

function wordsPerPart(xml: string, measureNumber = 1) {
  return importMusicXmlToCore(xml).score.parts.map((part) => part.staves[0]!.measures
    .find((measure) => measure.measureNumber === measureNumber)!.directions
    .filter((direction) => direction.kind === 'words')
    .map((direction) => direction.value));
}

function withDolceInBothParts() {
  const state = buildDocumentState(DUET);
  const [p1, p2] = state.coreDocument!.score.parts.map((part) => part.id);
  return applyDocumentCommands(state, [
    { type: 'addWords', measureNumber: 1, text: 'dolce', corePartId: p1 },
    { type: 'addWords', measureNumber: 1, text: 'dolce', corePartId: p2 },
  ] as never);
}

test('fixture: the same text sits in both parts', () => {
  assert.deepEqual(wordsPerPart(withDolceInBothParts().xml), [['dolce'], ['dolce']]);
});

for (const [label, partIndex, expected] of [
  ['the second part', 1, [['dolce'], []]],
  ['the first part', 0, [[], ['dolce']]],
] as const) {
  test(`removeDirection scoped to ${label} leaves the other part unchanged`, () => {
    const state = withDolceInBothParts();
    const partId = state.coreDocument!.score.parts[partIndex]!.id;
    const result = applyDocumentCommands(state, [
      { type: 'removeDirection', measureNumber: 1, staffIndex: 1, kind: 'words', text: 'dolce', corePartId: partId },
    ] as never);
    assert.deepEqual(wordsPerPart(result.xml), expected);
  });

  test(`deleting a clicked text in ${label} removes it there only (one Undo entry)`, () => {
    const harness = mountEditor(withDolceInBothParts().xml);
    const partId = importMusicXmlToCore(harness.xml).score.parts[partIndex]!.id;
    // As in the app: a click on a text also resolves the nearest note, and the click is visual-only.
    const nearest = selectableNotes(harness.xml).find((note) => note.corePartId === partId && note.measureNumber === 1)!;
    act(() => {
      harness.current.handleNoteClick(nearest, {
        visualOnly: true,
        visualText: 'dolce',
        visualMeasureNumber: 1,
        visualStaffIndex: 1,
        visualPartId: partId,
      } as never);
    });
    harness.rerender();
    const before = harness.batches.length;
    harness.press('Delete');
    harness.rerender();
    assert.deepEqual(wordsPerPart(harness.xml), expected);
    assert.equal(harness.batches.length, before + 1, 'one user action is one command batch');
    harness.unmount();
  });
}
