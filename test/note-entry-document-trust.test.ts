import assert from 'node:assert/strict';
import test from 'node:test';

import { buildDocumentState, applyDocumentCommands } from '../src/score-core/commands/apply-document-commands.ts';
import { mountApp } from './support/app-harness.ts';
import { selectableNotes, voiceSummary } from './support/entry-harness.ts';
import { FUZZ_FIXTURES, laneContents, runSequence } from './support/entry-fuzz.ts';
import { scoreXml, TREBLE } from './support/entry-fixtures.ts';

/*
 * F10 to F12 in docs/note-entry-mastery-ledger.md, found by the entry fuzzer. Each fuzzer replay is
 * kept as a deterministic case; the focused tests name the defect.
 */

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const quarter = (step: string, octave: number) => `<note><pitch><step>${step}</step><octave>${octave}</octave></pitch><duration>4</duration><voice>1</voice><type>quarter</type></note>`;
const BAR = quarter('C', 5) + quarter('D', 5) + quarter('E', 5) + quarter('F', 5);
const QUARTERS = scoreXml({ beats: 4, beatType: 4, measures: 2, parts: [{ ...TREBLE, content: { '1:1': BAR, '2:1': BAR } }] });

const REPLAYS: Array<[string, string, number, string[]]> = [
  ['F10', 'single staff', 7356, ['click:397', '/', 'click:879', 'b', 'd', 'g', 'click:427', '0', 'N', 'e']],
  ['F10', 'transposing part', 207307, ['click:77', 'Shift+ArrowLeft', 'a', 'g', 'c', 'Delete', 'Shift+ArrowUp']],
  ['F10', 'pickup bar', 407364, ['click:39', 'c', 'Cmd+c', 'Cmd+v', 'J']],
  ['F11', 'grand staff, two voices', 107311, ['3', 'N', 'e', 'Q']],
  ['F12', 'three parts', 507309, ['click:311', '5', 'Shift+e', 'Q', 'click:199', 'd']],
  ['F12', 'pickup bar', 409108, ['N', '3', 'ArrowRight', 'e', '6', '0']],
  ['F12', 'three parts', 509106, ['click:36', 'Cmd+3', 'Delete']],
];

for (const [id, fixture, seed, actions] of REPLAYS) {
  test(`${id} fuzzer replay passes every invariant: ${fixture}, seed ${seed}`, () => {
    const failure = runSequence(fixture, seed, actions);
    assert.equal(failure?.reason ?? null, null);
  });
}

test('F10: a pitch change aimed at a rest is rejected, not a crash, and the rest stays a rest', () => {
  const state = buildDocumentState(scoreXml({ beats: 4, beatType: 4, measures: 1, parts: [TREBLE] }));
  const result = applyDocumentCommands(state, [{
    type: 'changeNotePitch', measureNumber: 1, staffIndex: 1, voiceId: 1, timestampNum: 0, timestampDen: 16, step: 'E', octave: 5, alter: 0,
  }]);
  assert.ok(result.diagnostics.some((issue) => issue.code === 'pitch_command_rejected'));
  assert.equal(result.xml, state.xml);
});

test('F10 guard (passed before the fix): after Delete the selection is the rest, so octave and respell keys change nothing', () => {
  const app = mountApp(QUARTERS);
  try {
    app.click(selectableNotes(app.xml)[1]!);
    app.press('Delete');
    assert.equal(app.editor.selectedNote?.isRest, true, 'the selection describes the rest Delete left');
    const afterDelete = app.xml;
    app.press('Shift+ArrowUp J ArrowUp');
    assert.equal(app.xml, afterDelete);
  } finally {
    app.unmount();
  }
});

test('F11: a finer value in one staff of a grand staff keeps both staves on one division grid', () => {
  const xml = FUZZ_FIXTURES['grand staff, two voices']!();
  const app = mountApp(buildDocumentState(xml).xml);
  try {
    const before = { v2: voiceSummary(app.xml, { voice: 2 }), lh: voiceSummary(app.xml, { staff: 2, voice: 5 }) };
    app.press('3 N e Q');
    assert.deepEqual(voiceSummary(app.xml, { voice: 1 }).filter((line) => line.startsWith('m1@')), [
      'm1@0 E5 32nd', 'm1@0.125 r 32nd', 'm1@0.25 r eighth.', 'm1@1 D5 quarter', 'm1@2 C5 quarter', 'm1@3 D5 quarter',
    ]);
    assert.deepEqual(voiceSummary(app.xml, { voice: 2 }), before.v2, 'voice 2 keeps its half notes');
    assert.deepEqual(voiceSummary(app.xml, { staff: 2, voice: 5 }), before.lh, 'the left hand keeps its onsets');
  } finally {
    app.unmount();
  }
});

test('F12: the stored XML is what the document model exports, after every kind of edit', () => {
  const app = mountApp(buildDocumentState(FUZZ_FIXTURES['pickup bar']!()).xml);
  try {
    for (const step of ['N', '3', 'ArrowRight', 'e', '6', '0']) {
      if (step.startsWith('click:')) {
        const notes = selectableNotes(app.xml);
        app.click(notes[Number(step.slice(6)) % notes.length]!);
      } else {
        app.press(step);
      }
      assert.deepEqual([...laneContents(buildDocumentState(app.xml).xml)], [...laneContents(app.xml)], `after ${step}, the re-exported music differs from the stored XML`);
    }
  } finally {
    app.unmount();
  }
});
