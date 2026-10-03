import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';

import { importMusicXmlToCore } from '../src/musicxml-adapter/import/import-musicxml.ts';
import { exportCoreToMusicXml } from '../src/musicxml-adapter/export/export-core-to-musicxml.ts';
import type { ScoreDocumentModel } from '../src/score-core/model/types.ts';

function loadFixture(name: string) {
  return readFileSync(path.join(process.cwd(), 'test', 'fixtures', name), 'utf8');
}

function eventSignature(doc: ScoreDocumentModel) {
  return doc.score.parts.flatMap((part) => part.staves.flatMap((staff) => staff.measures.flatMap((measure) => (
    measure.voices.flatMap((voice) => voice.events.map((event) => [
      measure.measureNumber,
      staff.staffIndex,
      voice.voiceId,
      event.kind,
      event.kind === 'note' ? `${event.pitch.step}${event.pitch.alter}/${event.pitch.octave}` : '-',
      `${event.timestampNum}/${event.timestampDen}`,
      event.durationDivisions,
      event.isChord ? 'chord' : 'single',
      event.tieStart ? 'tie' : '',
    ].join(' ')))
  ))));
}

for (const fixture of [
  'tuplet-grace-tie-transposing.musicxml',
  'piano-semantics.musicxml',
  'cross-measure-tie.musicxml',
  'choir-lyrics.musicxml',
  'leadsheet-repeat.musicxml',
]) {
  test(`${fixture}: import -> export -> import keeps every event`, () => {
    const source = loadFixture(fixture);
    const first = importMusicXmlToCore(source);
    const second = importMusicXmlToCore(exportCoreToMusicXml(source, first));
    assert.deepEqual(eventSignature(second), eventSignature(first));
  });
}

test('the tuplet/grace/tie fixture keeps its classes after import', () => {
  const doc = importMusicXmlToCore(loadFixture('tuplet-grace-tie-transposing.musicxml'));
  assert.equal(doc.graceNotes.length, 1);
  assert.ok(doc.tuplets.length >= 1, 'tuplet group imported');
  assert.equal(doc.score.parts[0]!.chromaticTranspose, -2);
});
