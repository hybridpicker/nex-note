import assert from 'node:assert/strict';
import test from 'node:test';

import { applyDocumentCommands, buildDocumentState } from '../src/score-core/commands/apply-document-commands.ts';
import type { ScoreCommand } from '../src/shared/schemas/score-command.ts';
import { mountApp } from './support/app-harness.ts';
import { PIANO, scoreXml } from './support/entry-fixtures.ts';
import { REFERENCE_TASKS } from './support/reference-tasks.ts';

/*
 * O5 in docs/note-entry-mastery-ledger.md. A file whose pickup bar is numbered 0 is stored with its
 * bars numbered from 1. The document kept the numbers of the file it was read from, and the export
 * looked up each bar of the stored file by them: from the second export on every bar was built from
 * the bar before it, and the pickup from nothing. What the export does not write itself moved one bar
 * later with every edit. In a piano part that is <staves>: the first bar lost it, the renderer read a
 * part of one staff, and nothing could be placed on the lower staff (no caret from the third bar on).
 */

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const measures = (xml: string) => [...xml.matchAll(/<measure number="(\d+)"[^>]*>(.*?)<\/measure>/gs)].map((match) => ({ number: Number(match[1]), body: match[2]! }));
const barsWithStaves = (xml: string) => measures(xml).filter((measure) => measure.body.includes('<staves>')).map((measure) => measure.number);
const barsWithAttributes = (xml: string) => measures(xml).filter((measure) => measure.body.includes('<attributes>')).map((measure) => measure.number);

function numbersOfModel(state: { coreDocument: ReturnType<typeof buildDocumentState>['coreDocument'] }) {
  return state.coreDocument!.score.parts[0]!.staves[0]!.measures.map((measure) => `${measure.measureNumber}:${measure.sourceMeasureNumber}`);
}

test('O5: a piano score with a pickup numbered 0 keeps <staves> in its first bar through edits in the lower staff', () => {
  const start = REFERENCE_TASKS.find((task) => task.id === 'R3')!.start();
  assert.match(start, /<measure number="0" implicit="yes">/, 'the fixture numbers its pickup 0');
  const app = mountApp(start);
  try {
    assert.deepEqual(barsWithStaves(app.xml), [1]);
    app.press('Cmd+Home N Alt+ArrowDown 5 0 6 . c');
    assert.deepEqual(barsWithStaves(app.xml), [1], '<staves> stays in the first bar');
    assert.deepEqual(barsWithAttributes(app.xml), [1], 'no other bar repeats the attributes of the first');
    app.press('g');
    assert.deepEqual(barsWithStaves(app.xml), [1]);
    assert.deepEqual(barsWithAttributes(app.xml), [1]);
    assert.equal(buildDocumentState(app.xml).xml, app.xml, 'the stored file is a fixed point of import and export');
  } finally {
    app.unmount();
  }
});

test('O5: the document names every bar by its number in the stored file, also after bars are inserted', () => {
  const start = REFERENCE_TASKS.find((task) => task.id === 'R3')!.start();
  const loaded = buildDocumentState(start);
  assert.deepEqual(numbersOfModel(loaded).slice(0, 3), ['1:1', '2:2', '3:3']);
  const inserted = applyDocumentCommands(loaded, [{ type: 'insertMeasureBefore', measureNumber: 3 } as ScoreCommand]);
  assert.deepEqual(numbersOfModel(inserted).slice(0, 5), ['1:1', '2:2', '3:3', '4:4', '5:5']);
  assert.deepEqual(measures(inserted.xml).map((measure) => measure.number).slice(0, 5), [1, 2, 3, 4, 5]);
});

test('O5: a bar inserted before bar 1 of a piano score leaves <staves> in the first bar', () => {
  const piano = scoreXml({ beats: 3, beatType: 4, measures: 3, parts: [{ ...PIANO }] });
  const loaded = buildDocumentState(piano);
  const inserted = applyDocumentCommands(loaded, [{ type: 'insertMeasureBefore', measureNumber: 1 } as ScoreCommand]);
  assert.deepEqual(barsWithStaves(inserted.xml), [1]);
  const again = applyDocumentCommands(inserted, [{ type: 'insertMeasureBefore', measureNumber: 3 } as ScoreCommand]);
  assert.deepEqual(barsWithStaves(again.xml), [1]);
  assert.equal(buildDocumentState(again.xml).coreDocument!.score.parts[0]!.staves.length, 2);
});
