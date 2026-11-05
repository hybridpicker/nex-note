import test from 'node:test';
import assert from 'node:assert/strict';

import { importMusicXmlToCore } from '../src/musicxml-adapter/import/import-musicxml.ts';
import { documentIssues, mountEditor, voiceSummary } from './support/entry-harness.ts';
import { TREBLE, scoreXml } from './support/entry-fixtures.ts';

/*
 * Slurs during note input follow MuseScore (NotationActionController::addSlur, NotationInteraction::
 * doAddSlur, NoteInput::addPitch, read from musescore/MuseScore main):
 *  - S on the note just entered starts a slur that every following entered note extends;
 *  - S again ends it (resetSlur);
 *  - S on a Shift+Arrow range slurs the range, and that slur is then the input slur too;
 *  - the input cursor does not move when a range is selected, so the next entry follows the last note.
 */

const EMPTY = scoreXml({ beats: 4, beatType: 4, measures: 3, parts: [TREBLE] });

function slurs(xml: string) {
  const core = importMusicXmlToCore(xml);
  const names = new Map<string, string>();
  for (const part of core.score.parts) for (const staff of part.staves) for (const measure of staff.measures) for (const voice of measure.voices) {
    for (const event of voice.events) {
      if (event.kind === 'note') names.set(event.id, `${event.pitch.step}${event.pitch.octave}@m${measure.measureNumber}`);
    }
  }
  return core.slurs.map((slur) => `${names.get(slur.startEventId ?? '')}>${names.get(slur.stopEventId ?? '')}`);
}

function run(script: string) {
  const harness = mountEditor(EMPTY);
  harness.press(script);
  harness.rerender();
  const result = { xml: harness.xml, batches: harness.batches.length, harness };
  return result;
}

test('S after an entry starts a slur that later notes extend, and S ends it', () => {
  const { harness, xml } = run('N 4 c s d e f s g');
  assert.deepEqual(slurs(xml), ['C5@m1>F5@m1']);
  assert.deepEqual(voiceSummary(xml, {}).filter((line) => !line.includes(' r ')), [
    'm1@0 C5 eighth', 'm1@0.5 D5 eighth', 'm1@1 E5 eighth', 'm1@1.5 F5 eighth', 'm1@2 G5 eighth',
  ]);
  assert.deepEqual(documentIssues(xml), []);
  harness.unmount();
});

test('each extension is part of the entry that made it: one Undo step per note', () => {
  const harness = mountEditor(EMPTY);
  harness.press('N 4 c s d');
  harness.rerender();
  const afterD = harness.batches.at(-1)!;
  assert.ok(afterD.some((command) => command.type === 'toggleSlur'), 'the slur is part of the same batch as the note');
  assert.deepEqual(slurs(harness.xml), ['C5@m1>D5@m1']);
  harness.unmount();
});

test('a slur left open when note input ends keeps its last end note', () => {
  const { harness, xml } = run('N 4 c s d e Escape');
  assert.deepEqual(slurs(xml), ['C5@m1>E5@m1']);
  harness.unmount();
});

test('a Shift+Arrow slur over entered notes keeps the input cursor: the next entry follows the last note', () => {
  const { harness, xml } = run('N 4 c d e f Shift+ArrowLeft Shift+ArrowLeft Shift+ArrowLeft s 6 g');
  // MuseScore: the range slur becomes the input slur, so the next entered note extends it.
  assert.deepEqual(slurs(xml), ['C5@m1>G5@m1']);
  assert.deepEqual(voiceSummary(xml, {}).filter((line) => !line.includes(' r ')), [
    'm1@0 C5 eighth', 'm1@0.5 D5 eighth', 'm1@1 E5 eighth', 'm1@1.5 F5 eighth', 'm1@2 G5 half',
  ]);
  assert.deepEqual(documentIssues(xml), []);
  harness.unmount();
});
