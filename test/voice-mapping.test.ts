import test from 'node:test';
import assert from 'node:assert/strict';

import { importMusicXmlToCore } from '../src/musicxml-adapter/import/import-musicxml.ts';
import { inputVoiceOf, isInputVoice, storedVoiceFor } from '../src/score-input/voice-mapping.ts';
import { PIANO, TREBLE, scoreXml } from './support/entry-fixtures.ts';

const MUSESCORE_PIANO = importMusicXmlToCore(scoreXml({ beats: 4, beatType: 4, measures: 1, parts: [PIANO] }));
const NEX_NOTE_PIANO = importMusicXmlToCore(scoreXml({ beats: 4, beatType: 4, measures: 1, parts: [{
  ...PIANO,
  content: {
    '1:1': '<note><rest measure="yes"/><duration>16</duration><voice>1</voice><staff>1</staff></note>',
    '1:2': '<note><rest measure="yes"/><duration>16</duration><voice>1</voice><staff>2</staff></note>',
  },
}] }));

test('stored voices map to input voices 1-4 per staff', () => {
  assert.deepEqual([1, 2, 3, 4, 5, 6, 7, 8, 9].map(inputVoiceOf), [1, 2, 3, 4, 1, 2, 3, 4, 1]);
  assert.equal(isInputVoice(5, 1), true);
  assert.equal(isInputVoice(6, 1), false);
});

test('MuseScore/Finale numbering: the lower piano staff stores input voices as 5-8', () => {
  const lower = { corePartId: MUSESCORE_PIANO.score.parts[0]!.id, staffIndex: 2 };
  assert.deepEqual([1, 2, 3, 4].map((voice) => storedVoiceFor(MUSESCORE_PIANO, lower, voice)), [5, 6, 7, 8]);
  const upper = { corePartId: MUSESCORE_PIANO.score.parts[0]!.id, staffIndex: 1 };
  assert.deepEqual([1, 2, 3, 4].map((voice) => storedVoiceFor(MUSESCORE_PIANO, upper, voice)), [1, 2, 3, 4]);
});

test('nex-note numbering: voice 1 on every staff stays voice 1-4', () => {
  const lower = { corePartId: NEX_NOTE_PIANO.score.parts[0]!.id, staffIndex: 2 };
  assert.deepEqual([1, 2, 3, 4].map((voice) => storedVoiceFor(NEX_NOTE_PIANO, lower, voice)), [1, 2, 3, 4]);
});

test('a staff without events and a missing document fall back to the input voice', () => {
  const empty = importMusicXmlToCore(scoreXml({ beats: 4, beatType: 4, measures: 1, parts: [TREBLE] }));
  assert.equal(storedVoiceFor(empty, { corePartId: empty.score.parts[0]!.id, staffIndex: 1 }, 2), 2);
  assert.equal(storedVoiceFor(null, { staffIndex: 2 }, 3), 3);
});
