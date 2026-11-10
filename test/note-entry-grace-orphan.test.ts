import assert from 'node:assert/strict';
import test from 'node:test';

import { buildDocumentState } from '../src/score-core/commands/apply-document-commands.ts';
import { importMusicXmlToCore } from '../src/musicxml-adapter/import/import-musicxml.ts';
import { mountApp } from './support/app-harness.ts';
import { selectableNotes } from './support/entry-harness.ts';
import { FUZZ_FIXTURES, laneContents, runSequence } from './support/entry-fuzz.ts';

/*
 * F13 (docs/note-entry-mastery-ledger.md): an edit that replaced a note carrying a grace note (seen
 * with Cmd+3, whose tuplet overwrote the note) left the grace before a rest. The MusicXML importer reads a rest after a grace as a <forward>, so on the
 * next round trip the rest, and its place in a tuplet, disappeared. MuseScore keeps grace notes on
 * their chord: when the chord becomes a rest, its grace notes go with it.
 */

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

for (const [seed, actions] of [
  [309111, ['click:73', '0', '.', 'e', '6', 'Cmd+3']],
  [307321, ['click:319', 'Cmd+3', '0', '0']],
] as const) {
  // Seed 309111 failed before the fix; 307321 already passed on the code at that time and stays as a guard.
  test(`F13 fuzzer replay passes every invariant: tuplets and graces, seed ${seed}`, () => {
    assert.equal(runSequence('tuplets and graces', seed, [...actions])?.reason ?? null, null);
  });
}

test('guard (passed before the fix): a rest typed over a note in note input removes its grace note', () => {
  const app = mountApp(buildDocumentState(FUZZ_FIXTURES['tuplets and graces']!()).xml);
  try {
    const main = selectableNotes(app.xml).find((note) => note.measureNumber === 1 && !note.isRest && note.durationType === 'quarter' && note.step === 'D')!;
    assert.ok(main, 'the fixture has a D5 quarter with a grace note');
    assert.equal(importMusicXmlToCore(app.xml).graceNotes.length, 1);
    app.click(main);
    // Note input from the selected note: `0` writes a rest in its place.
    app.press('N 0');
    const core = importMusicXmlToCore(app.xml);
    assert.equal(core.graceNotes.length, 0, 'the grace note went with its main note');
    assert.deepEqual([...laneContents(buildDocumentState(app.xml).xml)], [...laneContents(app.xml)], 'a round trip keeps the music');
  } finally {
    app.unmount();
  }
});
