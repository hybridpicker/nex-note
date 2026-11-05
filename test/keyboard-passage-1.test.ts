import test from 'node:test';
import assert from 'node:assert/strict';

import type { KeyboardLayoutId } from '../src/score-input/keyboard-layout.ts';
import { documentIssues, layoutKeyEvent, mountEditor } from './support/entry-harness.ts';
import { TREBLE, scoreXml } from './support/entry-fixtures.ts';
import { PASSAGE_1, PASSAGE_1_EXPECTED, summarize } from './support/keyboard-passage.ts';

/*
 * Keyboard passage 1: eight bars of 4/4 in treble, entered with one keystroke script and no
 * corrections, on the real key and code values of the US, UK and German/Austrian QWERTZ layouts.
 * The result must equal the expected fixture exactly on every layout.
 */

const EMPTY = scoreXml({ beats: 4, beatType: 4, measures: 8, parts: [TREBLE] });

function enter(layout: KeyboardLayoutId) {
  const harness = mountEditor(EMPTY, { layout });
  const batchesBefore = harness.batches.length;
  harness.press(PASSAGE_1);
  harness.rerender();
  const result = { xml: harness.xml, summary: summarize(harness.xml), corrections: harness.batches.slice(batchesBefore).flat().filter((command) => command.type === 'deleteNote').length };
  harness.unmount();
  return result;
}

const LAYOUTS: KeyboardLayoutId[] = ['us', 'uk', 'de'];
const results = new Map<KeyboardLayoutId, ReturnType<typeof enter>>();

for (const layout of LAYOUTS) {
  test(`passage 1 on the ${layout.toUpperCase()} layout equals the expected fixture exactly`, () => {
    const result = enter(layout);
    results.set(layout, result);
    assert.deepEqual(result.summary, PASSAGE_1_EXPECTED);
    assert.equal(result.corrections, 0, 'no correction was needed');
    assert.deepEqual(documentIssues(result.xml), []);
  });
}

test('passage 1 gives byte-identical MusicXML on US, UK and QWERTZ', () => {
  const [us, uk, de] = LAYOUTS.map((layout) => results.get(layout) ?? enter(layout));
  assert.equal(uk!.xml, us!.xml);
  assert.equal(de!.xml, us!.xml);
});

test('the script has no correction keys (Delete, Backspace, Undo, Redo, Escape before the end)', () => {
  const forbidden = /^(Delete|Backspace|Cmd\+z|Cmd\+y|Cmd\+Shift\+z|Ctrl\+z|Ctrl\+y|Escape)$/i;
  assert.deepEqual(PASSAGE_1.split(/\s+/).filter((token) => forbidden.test(token)), []);
});

test('the layout events carry the real key and code values of each layout', () => {
  const pick = (token: string, layout: KeyboardLayoutId) => {
    const event = layoutKeyEvent(token, layout);
    return `${event.key}|${event.code}|${event.shiftKey ? 'shift' : ''}${event.altKey ? 'alt' : ''}${event.metaKey ? 'meta' : ''}`;
  };
  assert.equal(pick('+', 'us'), '+|Equal|shift');
  assert.equal(pick('+', 'uk'), '+|Equal|shift');
  assert.equal(pick('+', 'de'), '+|BracketRight|');
  assert.equal(pick('-', 'us'), '-|Minus|');
  assert.equal(pick('-', 'de'), '-|Slash|');
  assert.equal(pick('/', 'us'), '/|Slash|');
  assert.equal(pick('/', 'de'), '/|Digit7|shift');
  assert.equal(pick('Shift+.', 'us'), '>|Period|shift');
  assert.equal(pick('Shift+.', 'de'), ':|Period|shift');
  assert.equal(pick('Alt+.', 'de'), '.|Period|alt');
  assert.equal(pick('Cmd+3', 'uk'), '3|Digit3|meta');
  assert.equal(pick('Shift+e', 'de'), 'E|KeyE|shift');
});
