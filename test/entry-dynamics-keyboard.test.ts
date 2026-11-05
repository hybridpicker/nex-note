import test from 'node:test';
import assert from 'node:assert/strict';
import { act } from 'react-test-renderer';

import { importMusicXmlToCore } from '../src/musicxml-adapter/import/import-musicxml.ts';
import { clickFirstEvent, documentIssues, keyEvent, mountEditor, voiceSummary } from './support/entry-harness.ts';
import { TREBLE, scoreXml } from './support/entry-fixtures.ts';

/*
 * Dynamics from the keyboard (backlog 31). Cmd/Ctrl+D stays Duplicate (MuseScore's add-dynamic is
 * Ctrl+D). `Alt/Option+.` makes the dynamic louder and `Alt/Option+,` softer, like MuseScore's
 * increase-dynamic / decrease-dynamic (src/app/configs/data/shortcuts.xml). Without a dynamic the step
 * starts from mf. It acts on the note just entered in note input, else on the selection.
 */

const quarters = ['C', 'D', 'E', 'F']
  .map((step) => `<note><pitch><step>${step}</step><octave>5</octave></pitch><duration>4</duration><voice>1</voice><type>quarter</type></note>`)
  .join('');
const SCORE = scoreXml({ beats: 4, beatType: 4, measures: 2, parts: [TREBLE, { ...TREBLE, id: 'P2', name: 'Oboe' }].map((part) => ({ ...part, content: { '1:1': quarters, '2:1': quarters } })) });
const SINGLE = scoreXml({ beats: 4, beatType: 4, measures: 2, parts: [{ ...TREBLE, content: { '1:1': quarters, '2:1': quarters } }] });

function dynamics(xml: string, partIndex = 0) {
  return importMusicXmlToCore(xml).score.parts[partIndex]!.staves[0]!.measures.flatMap((measure) => measure.directions
    .filter((direction) => direction.kind === 'dynamics')
    .map((direction) => `m${measure.measureNumber}@${direction.timestampNum}/${direction.timestampDen} ${direction.value}`));
}

test('Alt+. after an entry enters f on the note just entered and the cursor stays', () => {
  const harness = mountEditor(scoreXml({ beats: 4, beatType: 4, measures: 1, parts: [TREBLE] }));
  harness.press('N 5 c Alt+. d');
  harness.rerender();
  assert.deepEqual(dynamics(harness.xml), ['m1@0/16 f']);
  assert.deepEqual(voiceSummary(harness.xml, {}).slice(0, 2), ['m1@0 C5 quarter', 'm1@1 D5 quarter']);
  harness.unmount();
});

test('Alt+, steps softer from mf to mp and again to p', () => {
  const harness = mountEditor(scoreXml({ beats: 4, beatType: 4, measures: 1, parts: [TREBLE] }));
  harness.press('N 5 c Alt+,');
  harness.rerender();
  assert.deepEqual(dynamics(harness.xml), ['m1@0/16 mp']);
  harness.press('Alt+,');
  harness.rerender();
  assert.deepEqual(dynamics(harness.xml), ['m1@0/16 p']);
  harness.unmount();
});

test('on a selection each press steps one level and stops at fff without an empty Undo entry', () => {
  const harness = mountEditor(SINGLE);
  clickFirstEvent(harness, {});
  harness.press('Alt+. Alt+. Alt+. Alt+.');
  harness.rerender();
  assert.deepEqual(dynamics(harness.xml), ['m1@0/16 fff']);
  const before = harness.batches.length;
  harness.press('Alt+.');
  harness.rerender();
  assert.equal(harness.batches.length, before);
  harness.unmount();
});

test('a range selection steps every note of the range, one Undo entry', () => {
  const harness = mountEditor(SINGLE);
  clickFirstEvent(harness, {});
  harness.press('Shift+ArrowRight');
  const before = harness.batches.length;
  harness.press('Alt+.');
  harness.rerender();
  assert.equal(harness.batches.length - before, 1);
  assert.deepEqual(dynamics(harness.xml), ['m1@0/16 f', 'm1@4/16 f']);
  harness.unmount();
});

test('the dynamic goes to the targeted part only', () => {
  const harness = mountEditor(SCORE);
  clickFirstEvent(harness, { partIndex: 1 });
  harness.press('Alt+.');
  harness.rerender();
  assert.deepEqual(dynamics(harness.xml, 0), []);
  assert.deepEqual(dynamics(harness.xml, 1), ['m1@0/16 f']);
  assert.equal(harness.current.selectedNote?.corePartId, 'part:P2');
  harness.unmount();
});

test('Cmd+D still duplicates', () => {
  const harness = mountEditor(SINGLE);
  clickFirstEvent(harness, {});
  harness.press('Cmd+d');
  harness.rerender();
  assert.deepEqual(dynamics(harness.xml), []);
  harness.unmount();
});

// Real key and code values: the physical code is Period/Comma on all three layouts; macOS Option
// replaces the printed character.
const LAYOUT_EVENTS: Array<[string, { key: string; code: string }]> = [
  ['US/UK/QWERTZ Windows or Linux Alt+.', { key: '.', code: 'Period' }],
  ['US, UK and QWERTZ macOS Option+.', { key: '≥', code: 'Period' }],
];
for (const [label, event] of LAYOUT_EVENTS) {
  test(`louder works for ${label}`, () => {
    const harness = mountEditor(SINGLE);
    clickFirstEvent(harness, {});
    act(() => {
      harness.current.handleKeyDown({ ...keyEvent('Alt+.'), ...event } as unknown as KeyboardEvent);
    });
    harness.rerender();
    assert.deepEqual(dynamics(harness.xml), ['m1@0/16 f']);
    assert.deepEqual(documentIssues(harness.xml), []);
    harness.unmount();
  });
}
test('softer works for a macOS Option+, event', () => {
  const harness = mountEditor(SINGLE);
  clickFirstEvent(harness, {});
  act(() => {
    harness.current.handleKeyDown({ ...keyEvent('Alt+,'), key: '≤', code: 'Comma' } as unknown as KeyboardEvent);
  });
  harness.rerender();
  assert.deepEqual(dynamics(harness.xml), ['m1@0/16 mp']);
  harness.unmount();
});
