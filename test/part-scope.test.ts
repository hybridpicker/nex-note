import test from 'node:test';
import assert from 'node:assert/strict';
import { act } from 'react-test-renderer';

import { applyDocumentCommands, buildDocumentState } from '../src/score-core/commands/apply-document-commands.ts';
import { importMusicXmlToCore } from '../src/musicxml-adapter/import/import-musicxml.ts';
import type { ScoreCommand } from '../src/shared/schemas/score-command.ts';
import { clickFirstEvent, mountEditor } from './support/entry-harness.ts';
import { BASS, TREBLE, scoreXml } from './support/entry-fixtures.ts';

/*
 * Part scope (iteration 8): dynamics, chord symbols, slash fills and staff text aimed at one
 * instrument change only that instrument. Synthetic flute + cello score.
 */

const FLUTE_AND_CELLO = scoreXml({
  beats: 4,
  beatType: 4,
  measures: 1,
  parts: [
    { ...TREBLE, content: { '1:1': '<note><pitch><step>C</step><octave>5</octave></pitch><duration>16</duration><voice>1</voice><type>whole</type></note>' } },
    { ...BASS, content: { '1:1': '<note><pitch><step>C</step><octave>3</octave></pitch><duration>16</duration><voice>1</voice><type>whole</type></note>' } },
  ],
});

function partSummary(xml: string) {
  return importMusicXmlToCore(xml).score.parts.map((part) => {
    const measure = part.staves[0]!.measures[0]!;
    const directions = measure.directions.map((direction) => `${direction.kind}:${direction.value}`).sort();
    const events = measure.voices.flatMap((voice) => voice.events)
      .map((event) => (event.kind === 'note' ? `${event.pitch.step}${event.pitch.octave}${event.notehead === 'slash' ? '/' : ''}` : 'r'));
    return { directions, events };
  });
}

const cello = buildDocumentState(FLUTE_AND_CELLO).coreDocument!.score.parts[1]!.id;
const locator = { measureNumber: 1, staffIndex: 1, voiceId: 1, timestampNum: 0, timestampDen: 16 };
const SCOPED: Array<[string, ScoreCommand]> = [
  ['addDynamic', { type: 'addDynamic', dynamic: 'f', corePartId: cello, ...locator } as ScoreCommand],
  ['setHarmonyAt', { type: 'setHarmonyAt', value: 'G7', corePartId: cello, measureNumber: 1, staffIndex: 1, timestampNum: 0, timestampDen: 4 }],
  ['fillSlashMeasure', { type: 'fillSlashMeasure', corePartId: cello, measureNumber: 1, staffIndex: 1, voiceId: 1, stem: 'none' }],
  ['addWords', { type: 'addWords', text: 'pizz.', corePartId: cello, staffIndex: 1, measureNumber: 1 }],
  ['addExpressionText', { type: 'addExpressionText', text: 'dolce', corePartId: cello, staffIndex: 1, measureNumber: 1 }],
];

for (const [name, command] of SCOPED) {
  test(`${name} aimed at the cello changes only the cello`, () => {
    const before = partSummary(buildDocumentState(FLUTE_AND_CELLO).xml);
    const after = partSummary(applyDocumentCommands(buildDocumentState(FLUTE_AND_CELLO), [command]).xml);
    assert.deepEqual(after[0], before[0], 'flute untouched');
    assert.notDeepEqual(after[1], before[1], 'cello changed');
  });
}

test('without a part, staff text keeps its score-wide meaning', () => {
  const after = partSummary(applyDocumentCommands(buildDocumentState(FLUTE_AND_CELLO), [
    { type: 'addWords', text: 'Tutti', measureNumber: 1 },
  ]).xml);
  assert.ok(after.every((part) => part.directions.includes('words:Tutti')));
});

test('dynamics, chord symbols and slash fills from the editor stay in the selected instrument', () => {
  const harness = mountEditor(FLUTE_AND_CELLO);
  try {
    clickFirstEvent(harness, { partIndex: 1 });
    act(() => {
      harness.current.addDynamic('mp');
    });
    harness.rerender();
    act(() => {
      harness.current.setHarmonyAtSelection('Dm7');
    });
    harness.rerender();
    harness.press('Cmd+/');
    const [flute, celloPart] = partSummary(harness.xml);
    assert.deepEqual(flute, partSummary(buildDocumentState(FLUTE_AND_CELLO).xml)[0], 'flute untouched');
    assert.ok(celloPart!.directions.includes('dynamics:mp'), JSON.stringify(celloPart));
    assert.ok(celloPart!.directions.includes('harmony:Dm7'), JSON.stringify(celloPart));
    assert.ok(celloPart!.events.every((event) => event.endsWith('/')), JSON.stringify(celloPart));
  } finally {
    harness.unmount();
  }
});
