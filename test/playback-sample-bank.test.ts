import test from 'node:test';
import assert from 'node:assert/strict';

import { midiNumberToPitchName, resolvePlaybackSampleFilename } from '../lib/playback-sample-bank.ts';
import { findUserTemplateForSamplePlayback, parseUserTemplateIndex } from '../lib/score-templates.ts';
import type { UserTemplateSampleBank } from '../lib/score-templates.ts';
import type { ScoreDocumentModel } from '../src/score-core/model/types.ts';

const document = {
  metadata: { title: 'St. Poeltner Glockenspiel' },
  score: {
    id: 'score:root',
    parts: [
      { id: 'part:P1', sourcePartId: 'P1', name: 'Singing bowls', instrumentName: 'Singing bowls', staves: [] },
      { id: 'part:P2', sourcePartId: 'P2', name: 'Glockenspiel I', instrumentName: 'Glockenspiel I', staves: [] },
      { id: 'part:P3', sourcePartId: 'P3', name: 'Glockenspiel II', instrumentName: 'Glockenspiel II', staves: [] },
    ],
  },
} as unknown as ScoreDocumentModel;

const sampleBank: UserTemplateSampleBank = {
  directory: 'Private_Samples',
  scoreTitle: 'St. Poeltner Glockenspiel',
  parts: [
    { partNames: ['Singing bowls'], samples: { C1: '01-C1.wav', E1: '02-E1.wav', G1: '03-G1.wav' } },
    { partNames: ['Glockenspiel I', 'Glockenspiel II'], samples: { C2: '04-c2.wav', D2: '05-d2.wav', C6: '51-c6.wav' } },
  ],
};

test('template sample playback resolves exact part and pitch mappings only', () => {
  assert.equal(resolvePlaybackSampleFilename(sampleBank, document, 'P1', 24), '01-C1.wav');
  assert.equal(resolvePlaybackSampleFilename(sampleBank, document, 'part:P2', 36), '04-c2.wav');
  assert.equal(resolvePlaybackSampleFilename(sampleBank, document, 'P3', 84), '51-c6.wav');
  assert.equal(resolvePlaybackSampleFilename(sampleBank, document, 'P2', 37), null, 'missing C#2 stays silent');
  assert.equal(resolvePlaybackSampleFilename(sampleBank, document, 'P2', 24), null, 'glockenspiel cannot use bowl samples');
  assert.equal(resolvePlaybackSampleFilename(sampleBank, document, 'P1', 36), null, 'bowls cannot use glockenspiel samples');
  assert.equal(resolvePlaybackSampleFilename(sampleBank, document, 'P2', 85), null, 'notes above C6 stay silent');
});

test('a part can layer a second exact-pitch sample mapping', () => {
  const layeredBank: UserTemplateSampleBank = {
    ...sampleBank,
    parts: [
      ...sampleBank.parts,
      { partNames: ['Singing bowls'], samples: { C4: '27-c4.wav', C6: '51-c6.wav' } },
    ],
  };

  assert.equal(resolvePlaybackSampleFilename(layeredBank, document, 'P1', 24), '01-C1.wav');
  assert.equal(resolvePlaybackSampleFilename(layeredBank, document, 'P1', 60), '27-c4.wav');
  assert.equal(resolvePlaybackSampleFilename(layeredBank, document, 'P1', 84), '51-c6.wav');
  assert.equal(resolvePlaybackSampleFilename(layeredBank, document, 'P1', 37), null);
});

test('MIDI pitch names use the sample-bank octave convention', () => {
  assert.equal(midiNumberToPitchName(24), 'C1');
  assert.equal(midiNumberToPitchName(36), 'C2');
  assert.equal(midiNumberToPitchName(84), 'C6');
  assert.equal(midiNumberToPitchName(128), null);
});

test('indexed local sample banks are validated and activated by score title', () => {
  const [template] = parseUserTemplateIndex(JSON.stringify({
    templates: [{
      id: 'private-samples',
      name: 'St. Poeltner Glockenspiel',
      filename: 'Private.musicxml',
      sampleBank: {
        ...sampleBank,
        parts: [
          ...sampleBank.parts,
          { partNames: ['Unsafe'], samples: { C4: '../outside.wav', D4: 'valid.wav' } },
        ],
      },
    }],
  }), [{ filename: 'Private.musicxml' }], 'Nex Note');

  assert.equal(template.sampleBank?.parts[2].samples.C4, undefined);
  assert.equal(template.sampleBank?.parts[2].samples.D4, 'valid.wav');
  assert.equal(findUserTemplateForSamplePlayback([template], document), template);
  assert.equal(findUserTemplateForSamplePlayback([template], {
    ...document,
    metadata: { title: 'Different score' },
  }), null);
});
