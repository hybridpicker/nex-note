import test from 'node:test';
import assert from 'node:assert/strict';

import { applyRhythmSpellingToDocument, buildRhythmSpellingProjection } from '../src/layout/rhythm-speller.ts';
import { executeCoreCommands } from '../src/score-core/commands/core-command-executor.ts';
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

test('rhythm speller preserves a full-measure whole note as one glyph event', () => {
  const document = buildHalfNoteOnBeatTwoDocument();
  const event = document.score.parts[0]!.staves[0]!.measures[0]!.voices[0]!.events[0]!;
  event.timestampNum = 0;
  event.timestampDen = 4;
  event.durationDivisions = 4;
  event.durationType = 'whole';

  const projection = buildRhythmSpellingProjection(document);
  const fragments = projection.voices[0]?.fragments ?? [];

  assert.equal(fragments.length, 1);
  assert.deepEqual(fragments.map((fragment) => ({
    start: fragment.startDivisions,
    duration: fragment.durationDivisions,
    type: fragment.durationType,
    tieStart: Boolean(fragment.tieStart),
    tieStop: Boolean(fragment.tieStop),
  })), [{
    start: 0,
    duration: 4,
    type: 'whole',
    tieStart: false,
    tieStop: false,
  }]);
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

test('rhythm speller exposes the dotted-beat boundary in compound 6/8', () => {
  const document = buildHalfNoteOnBeatTwoDocument();
  const measure = document.score.parts[0]!.staves[0]!.measures[0]!;
  measure.attributes[0]!.divisions = 2;
  measure.attributes[0]!.time = { beats: 6, beatType: 8 };
  const event = measure.voices[0]!.events[0]!;
  event.timestampNum = 1;
  event.timestampDen = 8;
  event.durationDivisions = 4;
  event.durationType = 'half';

  const projection = buildRhythmSpellingProjection(document);
  assert.deepEqual(projection.voices[0]?.fragments.map((fragment) => ({
    start: fragment.startDivisions,
    duration: fragment.durationDivisions,
    type: fragment.durationType,
  })), [
    { start: 1, duration: 2, type: 'quarter' },
    { start: 3, duration: 2, type: 'quarter' },
  ]);
});

test('rhythm speller exposes a crossed beat in simple 3/4 without splitting an on-beat value', () => {
  const offbeatDocument = buildHalfNoteOnBeatTwoDocument();
  const offbeatMeasure = offbeatDocument.score.parts[0]!.staves[0]!.measures[0]!;
  offbeatMeasure.attributes[0]!.divisions = 2;
  offbeatMeasure.attributes[0]!.time = { beats: 3, beatType: 4 };
  const offbeatEvent = offbeatMeasure.voices[0]!.events[0]!;
  offbeatEvent.timestampNum = 1;
  offbeatEvent.timestampDen = 8;
  offbeatEvent.durationDivisions = 2;
  offbeatEvent.durationType = 'quarter';

  const offbeatProjection = buildRhythmSpellingProjection(offbeatDocument);
  assert.deepEqual(offbeatProjection.voices[0]?.fragments.map((fragment) => ({
    start: fragment.startDivisions,
    duration: fragment.durationDivisions,
    type: fragment.durationType,
  })), [
    { start: 1, duration: 1, type: 'eighth' },
    { start: 2, duration: 1, type: 'eighth' },
  ]);

  const onBeatDocument = structuredClone(offbeatDocument);
  const onBeatEvent = onBeatDocument.score.parts[0]!.staves[0]!.measures[0]!.voices[0]!.events[0]!;
  onBeatEvent.timestampNum = 1;
  onBeatEvent.timestampDen = 4;
  onBeatEvent.durationDivisions = 4;
  onBeatEvent.durationType = 'half';
  assert.equal(buildRhythmSpellingProjection(onBeatDocument).voices[0]?.fragments.length, 1);
});

test('rhythm speller honors explicit additive grouping in 3+2/8', () => {
  const document = buildHalfNoteOnBeatTwoDocument();
  const measure = document.score.parts[0]!.staves[0]!.measures[0]!;
  measure.attributes[0]!.divisions = 2;
  measure.attributes[0]!.time = { beats: 5, beatType: 8, beatGroups: [3, 2] };
  const event = measure.voices[0]!.events[0]!;
  event.timestampNum = 1;
  event.timestampDen = 8;
  event.durationDivisions = 4;
  event.durationType = 'half';

  const projection = buildRhythmSpellingProjection(document);
  assert.deepEqual(projection.voices[0]?.fragments.map((fragment) => ({
    start: fragment.startDivisions,
    duration: fragment.durationDivisions,
    type: fragment.durationType,
  })), [
    { start: 1, duration: 2, type: 'quarter' },
    { start: 3, duration: 2, type: 'quarter' },
  ]);
});

test('materialized rhythm spelling creates real tied score events for rendering and export', () => {
  const document = buildHalfNoteOnBeatTwoDocument();
  const result = applyRhythmSpellingToDocument(document, [{
    partId: 'P1',
    staffIndex: 1,
    measureNumber: 1,
    voiceId: 1,
    timestampNum: 1,
    timestampDen: 4,
  }]);
  const events = document.score.parts[0]!.staves[0]!.measures[0]!.voices[0]!.events;

  assert.deepEqual(result, { splitEventCount: 1, createdFragmentCount: 1 });
  assert.deepEqual(events.map((event) => ({
    id: event.id,
    timestamp: `${event.timestampNum}/${event.timestampDen}`,
    duration: event.durationDivisions,
    type: event.durationType,
    tieStart: Boolean(event.tieStart),
  })), [
    {
      id: 'event:half-on-beat-two',
      timestamp: '1/4',
      duration: 1,
      type: 'quarter',
      tieStart: true,
    },
    {
      id: 'event:half-on-beat-two:spell:0:1',
      timestamp: '2/4',
      duration: 1,
      type: 'quarter',
      tieStart: false,
    },
  ]);
});

test('materialized rhythm spelling repairs stop endpoints and keeps first-fragment marks anchored', () => {
  const document = buildHalfNoteOnBeatTwoDocument();
  const event = document.score.parts[0]!.staves[0]!.measures[0]!.voices[0]!.events[0]!;
  event.articulations = ['accent'];
  event.lyrics = [{ verseNumber: 1, text: 'hold' }];
  document.slurs = [{ id: 'slur:1', number: 1, startEventId: 'source:start', stopEventId: event.id }];
  document.glissandos = [{ id: 'gliss:1', number: 1, startEventId: 'source:start', stopEventId: event.id }];
  document.tremolos = [{ id: 'tremolo:1', eventId: event.id, lines: 2, type: 'stop' }];
  document.arpeggios = [{ id: 'arpeggio:1', eventId: event.id, direction: 'up' }];
  document.fermataEventIds.add(event.id);

  applyRhythmSpellingToDocument(document, [{
    partId: 'P1',
    staffIndex: 1,
    measureNumber: 1,
    voiceId: 1,
    timestampNum: 1,
    timestampDen: 4,
  }]);

  const events = document.score.parts[0]!.staves[0]!.measures[0]!.voices[0]!.events;
  const first = events[0]!;
  const last = events[events.length - 1]!;
  assert.equal(document.slurs[0]?.stopEventId, last.id);
  assert.equal(document.glissandos[0]?.stopEventId, last.id);
  assert.equal(document.tremolos[0]?.eventId, last.id);
  assert.equal(document.arpeggios[0]?.eventId, first.id);
  assert.equal(document.fermataEventIds.has(first.id), true);
  assert.deepEqual(first.articulations, ['accent']);
  assert.deepEqual(last.articulations, []);
  assert.equal(first.lyrics[0]?.text, 'hold');
  assert.deepEqual(last.lyrics, []);
});

test('core rhythmic commands materialize rhythm spelling before beam and tie repair', () => {
  const document = buildHalfNoteOnBeatTwoDocument();
  const execution = executeCoreCommands(document, [{
    type: 'changeNotePitch',
    coreEntityId: 'event:half-on-beat-two',
    coreMeasureId: 'P1:S1:M1',
    corePartId: 'P1',
    measureNumber: 1,
    staffIndex: 1,
    voiceId: 1,
    timestampNum: 1,
    timestampDen: 4,
    step: 'D',
    octave: 4,
    alter: 0,
  }, {
    type: 'changeNoteDuration',
    coreEntityId: 'event:half-on-beat-two',
    coreMeasureId: 'P1:S1:M1',
    corePartId: 'P1',
    measureNumber: 1,
    staffIndex: 1,
    voiceId: 1,
    timestampNum: 1,
    timestampDen: 4,
    durationType: 'half',
    isDotted: false,
  }]);
  const events = execution.coreDocument.score.parts[0]!.staves[0]!.measures[0]!.voices[0]!.events
    .filter((event) => event.kind === 'note');

  assert.equal(events.length, 2);
  assert.equal(events[0]?.tieStart, true);
  assert.equal(events[1]?.id, 'event:half-on-beat-two:spell:1:1');
});
