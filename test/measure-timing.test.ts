import test from 'node:test';
import assert from 'node:assert/strict';

import { createNewScoreXml } from '../lib/new-score.ts';
import { importMusicXmlToCore } from '../src/musicxml-adapter/import/import-musicxml.ts';
import { applyCoreCommands } from '../src/score-core/commands/core-command-executor.ts';
import { getEffectiveMeasureTiming } from '../src/score-core/measure-timing.ts';

function buildBlankPianoXml(measureCount = 2) {
  return createNewScoreXml({
    instrumentIds: ['piano'],
    title: 'Blank Piano Timing',
    subtitle: '',
    composer: '',
    lyricist: '',
    copyright: '',
    keySignatureId: 'c-major',
    timeBeats: 4,
    timeBeatType: 4,
    tempo: {
      bpm: 120,
      beatUnit: 'quarter',
      showMarking: false,
    },
    measureCount,
    pickup: {
      enabled: false,
      beats: 1,
      beatType: 4,
    },
  });
}

test('effective measure timing inherits 4/4 and divisions into later blank measures', () => {
  const core = importMusicXmlToCore(buildBlankPianoXml());
  const timing = getEffectiveMeasureTiming(core, { measureNumber: 2, staffIndex: 1 });

  assert.ok(timing);
  assert.deepEqual(timing.timeSignature, { beats: 4, beatType: 4 });
  assert.equal(timing.divisions, 8);
  assert.equal(timing.durationDivisions, 32);
  assert.equal(timing.durationRatio, 1);
});

test('out-of-range absolute insert is clamped and cannot balloon a later blank measure', () => {
  const core = importMusicXmlToCore(buildBlankPianoXml());
  const next = applyCoreCommands(core, [{
    type: 'insertNoteAt',
    schemaVersion: 1,
    category: 'content',
    target: { scope: 'document' },
    payload: {},
    measureNumber: 2,
    staffIndex: 1,
    voiceId: 1,
    timestampNum: 9,
    timestampDen: 4,
    step: 'C',
    octave: 5,
    alter: 0,
    durationType: 'quarter',
    isDotted: false,
  }]);
  const measure = next.score.parts[0]?.staves[0]?.measures[1];
  const voice = measure?.voices.find((entry) => entry.voiceId === 1);

  assert.ok(measure);
  assert.ok(voice);
  assert.deepEqual(
    voice.events.map((event) => ({ kind: event.kind, start: event.timestampNum, duration: event.durationDivisions })),
    [
      { kind: 'rest', start: 0, duration: 8 },
      { kind: 'rest', start: 8, duration: 8 },
      { kind: 'rest', start: 16, duration: 8 },
      { kind: 'note', start: 24, duration: 8 },
    ],
  );
  assert.equal(
    Math.max(...voice.events.map((event) => event.timestampNum + event.durationDivisions)),
    32,
  );
  assert.equal(getEffectiveMeasureTiming(next, { measureNumber: 2, staffIndex: 1 })?.durationDivisions, 32);
});
