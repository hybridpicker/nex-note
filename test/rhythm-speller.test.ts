import test from 'node:test';
import assert from 'node:assert/strict';

import { buildRhythmSpellingProjection } from '../src/layout/rhythm-speller.ts';
import type { ScoreDocumentModel } from '../src/score-core/model/types.ts';

function buildHalfNoteOnBeatTwoDocument(input: { tieStart?: boolean } = {}): ScoreDocumentModel {
  return {
    score: {
      id: 'score:test',
      parts: [{
        id: 'P1',
        sourcePartId: 'P1',
        name: 'Piano',
        staves: [{
          id: 'P1:S1',
          staffIndex: 1,
          measures: [{
            id: 'P1:S1:M1',
            measureNumber: 1,
            voices: [{
              id: 'P1:S1:M1:V1',
              voiceId: 1,
              events: [{
                id: 'event:half-on-beat-two',
                kind: 'note',
                measureNumber: 1,
                staffIndex: 1,
                voiceId: 1,
                timestampNum: 1,
                timestampDen: 4,
                durationDivisions: 2,
                durationType: 'half',
                isChord: false,
                tieStart: input.tieStart,
                pitch: {
                  step: 'D',
                  alter: 0,
                  octave: 4,
                },
              }],
            }],
            directions: [],
            attributes: [{
              id: 'attr:m1',
              divisions: 1,
              time: {
                beats: 4,
                beatType: 4,
              },
              clefs: [{
                staffIndex: 1,
                sign: 'G',
                line: 2,
              }],
            }],
          }],
        }],
      }],
    },
    metadata: {},
    index: {
      measureIds: { 1: ['P1:S1:M1'] },
      voiceIds: { 'P1:S1:M1:1': 'P1:S1:M1:V1' },
      eventIds: { 'event:half-on-beat-two': 'event:half-on-beat-two' },
    },
    slurs: [],
    beams: [],
    tuplets: [],
    chordGroups: [],
    graceNotes: [],
    lyricLines: [],
    layoutHints: [],
    tremolos: [],
    glissandos: [],
    arpeggios: [],
    fermataEventIds: new Set(),
    revision: 1,
  };
}

test('rhythm speller splits a logical half note crossing the 4/4 half-bar', () => {
  const projection = buildRhythmSpellingProjection(buildHalfNoteOnBeatTwoDocument());
  const voice = projection.voices[0];

  assert.equal(projection.diagnostics.length, 0);
  assert.equal(voice?.fragments.length, 2);
  assert.deepEqual(voice?.fragments.map((fragment) => ({
    sourceEventId: fragment.sourceEventId,
    startDivisions: fragment.startDivisions,
    durationDivisions: fragment.durationDivisions,
    durationType: fragment.durationType,
    tieStart: Boolean(fragment.tieStart),
    tieStop: Boolean(fragment.tieStop),
  })), [
    {
      sourceEventId: 'event:half-on-beat-two',
      startDivisions: 1,
      durationDivisions: 1,
      durationType: 'quarter',
      tieStart: true,
      tieStop: false,
    },
    {
      sourceEventId: 'event:half-on-beat-two',
      startDivisions: 2,
      durationDivisions: 1,
      durationType: 'quarter',
      tieStart: false,
      tieStop: true,
    },
  ]);
});

test('rhythm speller preserves a core tie start on the final projected fragment', () => {
  const projection = buildRhythmSpellingProjection(buildHalfNoteOnBeatTwoDocument({ tieStart: true }));
  const voice = projection.voices[0];

  assert.equal(projection.diagnostics.length, 0);
  assert.equal(voice?.fragments.length, 2);
  assert.deepEqual(voice?.fragments.map((fragment) => ({
    sourceEventId: fragment.sourceEventId,
    startDivisions: fragment.startDivisions,
    durationDivisions: fragment.durationDivisions,
    durationType: fragment.durationType,
    tieStart: Boolean(fragment.tieStart),
    tieStop: Boolean(fragment.tieStop),
  })), [
    {
      sourceEventId: 'event:half-on-beat-two',
      startDivisions: 1,
      durationDivisions: 1,
      durationType: 'quarter',
      tieStart: true,
      tieStop: false,
    },
    {
      sourceEventId: 'event:half-on-beat-two',
      startDivisions: 2,
      durationDivisions: 1,
      durationType: 'quarter',
      tieStart: true,
      tieStop: true,
    },
  ]);
});
