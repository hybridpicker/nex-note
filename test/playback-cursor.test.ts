import test from 'node:test';
import assert from 'node:assert/strict';

import { applySwingToMidiNotes, buildMeasureBeatRanges, buildPlaybackMeasureBeatRanges, normalizeMidiNotes, resolveFullPlaybackDurationSeconds, resolvePlaybackQuarterBeatSeconds, resolvePlaybackSoundfontInstrument, resolvePlaybackTempoChangeOrigin, resolvePlaybackTempoScale, resolveStartScoreSeconds, resolveVisiblePlayheadSeconds, scoreSecondsToCursorTarget, scoreSecondsToCursorTargetForDocument } from '../hooks/usePlayback.ts';
import { resolveReachedPlaybackOnset } from '../lib/playback-highlight.ts';
import type { ScoreDocumentModel } from '../src/score-core/model/types.ts';

function makeCoreDocument(): ScoreDocumentModel {
  return {
    score: {
      id: 'score',
      parts: [{
        id: 'p1',
        sourcePartId: 'p1',
        name: 'Piano',
        abbreviation: 'Pno.',
        instrumentName: 'Piano',
        staves: [{
          staffIndex: 1,
          measures: [
            {
              id: 'm1',
              measureNumber: 1,
              attributes: [{ id: 'm1:a1', divisions: 1, time: { beats: 4, beatType: 4 }, clefs: [], keyFifths: 0 }],
              voices: [],
              directions: [],
            },
            {
              id: 'm2',
              measureNumber: 2,
              attributes: [{ id: 'm2:a1', divisions: 1, time: { beats: 3, beatType: 4 }, clefs: [], keyFifths: 0 }],
              voices: [],
              directions: [],
            },
          ],
        }],
      }],
    },
    metadata: {},
    index: { measureIds: {}, voiceIds: {}, eventIds: {} },
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
  } as unknown as ScoreDocumentModel;
}

test('guitar scores select a guitar soundfont instead of piano', () => {
  const guitarDocument = makeCoreDocument();
  guitarDocument.score.parts[0]!.name = 'Guitar + TAB';
  guitarDocument.score.parts[0]!.instrumentName = 'Guitar + TAB';

  assert.equal(resolvePlaybackSoundfontInstrument(guitarDocument), 'acoustic_guitar_nylon');
  assert.equal(resolvePlaybackSoundfontInstrument(makeCoreDocument()), 'acoustic_grand_piano');
});

function makeRepeatCoreDocument(): ScoreDocumentModel {
  const document = makeCoreDocument();
  const measures = document.score.parts[0].staves[0].measures;
  measures[0].leftBarline = 'repeat-start';
  measures[1].attributes = [{ id: 'm2:a1', divisions: 1, time: { beats: 4, beatType: 4 }, clefs: [], keyFifths: 0 }];
  measures[1].rightBarline = 'repeat-end';
  return document;
}

function makeVoltaCoreDocument(): ScoreDocumentModel {
  const document = makeCoreDocument();
  const measures = document.score.parts[0].staves[0].measures;
  measures[0].leftBarline = 'repeat-start';
  measures[1].attributes = [{ id: 'm2:a1', divisions: 1, time: { beats: 4, beatType: 4 }, clefs: [], keyFifths: 0 }];
  measures[1].leftEnding = { number: '1', type: 'start' };
  measures[1].rightEnding = { number: '1', type: 'stop' };
  measures[1].rightBarline = 'repeat-end';
  measures.push(
    {
      id: 'm3',
      measureNumber: 3,
      attributes: [{ id: 'm3:a1', divisions: 1, time: { beats: 4, beatType: 4 }, clefs: [], keyFifths: 0 }],
      voices: [],
      directions: [],
      leftEnding: { number: '2', type: 'start' },
      rightEnding: { number: '2', type: 'discontinue' },
    },
    {
      id: 'm4',
      measureNumber: 4,
      attributes: [{ id: 'm4:a1', divisions: 1, time: { beats: 4, beatType: 4 }, clefs: [], keyFifths: 0 }],
      voices: [],
      directions: [],
    },
  );
  return document;
}

test('scoreSecondsToCursorTarget maps score time to measure-local cursor positions', () => {
  const parsed = {
    rawNotes: [],
    notes: [],
    tempos: [{ bpm: 120, time: 0 }],
    durationSeconds: 16,
    timeSignatureNumerator: 4,
  };

  assert.deepEqual(scoreSecondsToCursorTarget(0, parsed), {
    measureNumber: 1,
    timestampNum: 0,
    timestampDen: 64,
  });

  assert.deepEqual(scoreSecondsToCursorTarget(1, parsed), {
    measureNumber: 1,
    timestampNum: 32,
    timestampDen: 64,
  });

  assert.deepEqual(scoreSecondsToCursorTarget(4, parsed), {
    measureNumber: 3,
    timestampNum: 0,
    timestampDen: 64,
  });
});

test('resolveReachedPlaybackOnset does not pre-highlight a future note', () => {
  const notes = [
    { id: 'previous', timestampNum: 16, timestampDen: 64 },
    { id: 'future', timestampNum: 32, timestampDen: 64 },
  ];

  assert.equal(resolveReachedPlaybackOnset(notes, 31 / 64)?.id, 'previous');
  assert.equal(resolveReachedPlaybackOnset(notes, 32 / 64)?.id, 'future');
});

test('resolveReachedPlaybackOnset returns no active note before the first onset', () => {
  const notes = [
    { id: 'first', timestampNum: 24, timestampDen: 64 },
    { id: 'second', timestampNum: 40, timestampDen: 64 },
  ];

  assert.equal(resolveReachedPlaybackOnset(notes, 20 / 64), null);
});

test('scoreSecondsToCursorTarget stays stable across tempo changes', () => {
  const parsed = {
    rawNotes: [],
    notes: [],
    tempos: [
      { bpm: 120, time: 0 },
      { bpm: 60, time: 2 },
    ],
    durationSeconds: 10,
    timeSignatureNumerator: 4,
  };

  assert.deepEqual(scoreSecondsToCursorTarget(3, parsed), {
    measureNumber: 2,
    timestampNum: 16,
    timestampDen: 64,
  });

  assert.deepEqual(scoreSecondsToCursorTarget(5, parsed), {
    measureNumber: 2,
    timestampNum: 48,
    timestampDen: 64,
  });
});

test('scoreSecondsToCursorTarget uses the MIDI time-signature denominator', () => {
  const parsed = {
    rawNotes: [],
    notes: [],
    tempos: [{ bpm: 120, time: 0 }],
    durationSeconds: 8,
    timeSignatureNumerator: 6,
    timeSignatureDenominator: 8,
  };

  assert.deepEqual(scoreSecondsToCursorTarget(1.5, parsed), {
    measureNumber: 2,
    timestampNum: 0,
    timestampDen: 64,
  });
});

test('buildMeasureBeatRanges respects per-measure time signatures from the score document', () => {
  const coreDocument = makeCoreDocument();
  const parsed = {
    rawNotes: [],
    notes: [],
    tempos: [{ bpm: 120, time: 0 }],
    durationSeconds: 8,
    timeSignatureNumerator: 4,
    timeSignatureDenominator: 4,
  };

  assert.deepEqual(buildMeasureBeatRanges(coreDocument, parsed), [
    { measureNumber: 1, startBeat: 0, endBeat: 4 },
    { measureNumber: 2, startBeat: 4, endBeat: 7 },
  ]);
});

test('buildPlaybackMeasureBeatRanges expands simple repeats for Play-button seeking', () => {
  const coreDocument = makeRepeatCoreDocument();
  const parsed = {
    rawNotes: [],
    notes: [],
    tempos: [{ bpm: 120, time: 0 }],
    durationSeconds: 8,
    timeSignatureNumerator: 4,
    timeSignatureDenominator: 4,
  };

  assert.deepEqual(buildPlaybackMeasureBeatRanges(coreDocument, parsed), [
    { measureNumber: 1, startBeat: 0, endBeat: 4 },
    { measureNumber: 2, startBeat: 4, endBeat: 8 },
    { measureNumber: 1, startBeat: 8, endBeat: 12 },
    { measureNumber: 2, startBeat: 12, endBeat: 16 },
  ]);

  assert.equal(resolveStartScoreSeconds({
    parsed,
    selectedNote: null,
    selectedMeasureNumbers: [2],
    currentScoreSeconds: 0,
    coreDocument,
    justOpened: false,
  }), 2);
  assert.deepEqual(scoreSecondsToCursorTargetForDocument(4.25, parsed, coreDocument), {
    measureNumber: 1,
    timestampNum: 8,
    timestampDen: 64,
  });
});

test('buildPlaybackMeasureBeatRanges skips first endings on the repeat pass and enters second endings', () => {
  const coreDocument = makeVoltaCoreDocument();
  const parsed = {
    rawNotes: [],
    notes: [],
    tempos: [{ bpm: 120, time: 0 }],
    durationSeconds: 10,
    timeSignatureNumerator: 4,
    timeSignatureDenominator: 4,
  };

  assert.deepEqual(buildPlaybackMeasureBeatRanges(coreDocument, parsed), [
    { measureNumber: 1, startBeat: 0, endBeat: 4 },
    { measureNumber: 2, startBeat: 4, endBeat: 8 },
    { measureNumber: 1, startBeat: 8, endBeat: 12 },
    { measureNumber: 3, startBeat: 12, endBeat: 16 },
    { measureNumber: 4, startBeat: 16, endBeat: 20 },
  ]);
  assert.equal(resolveStartScoreSeconds({
    parsed,
    selectedNote: null,
    selectedMeasureNumbers: [3],
    currentScoreSeconds: 0,
    coreDocument,
    justOpened: false,
  }), 6);
});

test('resolveStartScoreSeconds prefers the earliest selected measure when no note is selected', () => {
  const coreDocument = makeCoreDocument();
  const parsed = {
    rawNotes: [],
    notes: [],
    tempos: [{ bpm: 120, time: 0 }],
    durationSeconds: 8,
    timeSignatureNumerator: 4,
    timeSignatureDenominator: 4,
  };

  assert.equal(resolveStartScoreSeconds({
    parsed,
    selectedNote: null,
    selectedMeasureNumbers: [2],
    currentScoreSeconds: 1.4,
    coreDocument,
    justOpened: false,
  }), 2);
});

test('resolveStartScoreSeconds prefers the selected note over a stale playback position', () => {
  const coreDocument = makeCoreDocument();
  const parsed = {
    rawNotes: [],
    notes: [],
    tempos: [{ bpm: 120, time: 0 }],
    durationSeconds: 8,
    timeSignatureNumerator: 4,
    timeSignatureDenominator: 4,
  };

  assert.equal(resolveStartScoreSeconds({
    parsed,
    selectedNote: {
      measureNumber: 2,
      staffIndex: 1,
      voiceId: 1,
      timestampNum: 0,
      timestampDen: 4,
      step: 'C',
      octave: 4,
      alter: 0,
      isRest: false,
    } as never,
    selectedMeasureNumbers: [],
    currentScoreSeconds: 6.5,
    coreDocument,
    justOpened: false,
  }), 2);
});

test('resolveStartScoreSeconds falls back to time zero when the project just opened or the playhead is at the end', () => {
  const parsed = {
    rawNotes: [],
    notes: [],
    tempos: [{ bpm: 120, time: 0 }],
    durationSeconds: 8,
    timeSignatureNumerator: 4,
    timeSignatureDenominator: 4,
  };

  assert.equal(resolveStartScoreSeconds({
    parsed,
    selectedNote: null,
    selectedMeasureNumbers: [],
    currentScoreSeconds: 2.25,
    coreDocument: null,
    justOpened: true,
  }), 0);

  assert.equal(resolveStartScoreSeconds({
    parsed,
    selectedNote: null,
    selectedMeasureNumbers: [],
    currentScoreSeconds: 7.999,
    coreDocument: null,
    justOpened: false,
  }), 0);
});

test('resolveVisiblePlayheadSeconds stays aligned with audible score time during playback', () => {
  const parsed = {
    rawNotes: [],
    notes: [],
    tempos: [{ bpm: 120, time: 0 }],
    durationSeconds: 2,
    timeSignatureNumerator: 4,
    timeSignatureDenominator: 4,
  };

  assert.equal(resolveVisiblePlayheadSeconds(1, parsed, false), 1);
  assert.equal(resolveVisiblePlayheadSeconds(1, parsed, true), 1);
  assert.equal(resolveVisiblePlayheadSeconds(1.99, parsed, true), 1.99);
});

test('playback tempo override speeds up note and metronome timing', () => {
  const parsed = {
    rawNotes: [],
    notes: [],
    tempos: [{ bpm: 120, time: 0 }],
    durationSeconds: 8,
    timeSignatureNumerator: 4,
    timeSignatureDenominator: 4,
  };

  assert.equal(resolvePlaybackTempoScale(parsed, null), 1);
  assert.equal(Number(resolvePlaybackTempoScale(parsed, 170).toFixed(3)), 1.417);
  assert.equal(Number(resolvePlaybackQuarterBeatSeconds(parsed, 170).toFixed(3)), 0.353);
});

test('playback tempo changes preserve the current score position', () => {
  const parsed = {
    rawNotes: [],
    notes: [],
    tempos: [{ bpm: 120, time: 0 }],
    durationSeconds: 8,
    timeSignatureNumerator: 4,
    timeSignatureDenominator: 4,
  };

  const changed = resolvePlaybackTempoChangeOrigin({
    parsed,
    currentAcSeconds: 12,
    originAcSeconds: 10,
    currentTempoOverride: null,
    nextTempoOverride: 170,
  });
  const nextScale = resolvePlaybackTempoScale(parsed, 170);

  assert.equal(changed.currentScoreSeconds, 2);
  assert.equal(Number(((12 - changed.originAcSeconds) * nextScale).toFixed(3)), 2);
});

test('resolveFullPlaybackDurationSeconds includes silent trailing measures', () => {
  const coreDocument = makeCoreDocument();
  const parsed = {
    rawNotes: [{ time: 0, midi: 60, duration: 0.5, velocity: 0.8 }],
    notes: [{ time: 0, midi: 60, duration: 0.5, velocity: 0.8 }],
    tempos: [{ bpm: 120, time: 0 }],
    durationSeconds: 1,
    timeSignatureNumerator: 4,
    timeSignatureDenominator: 4,
  };

  assert.equal(resolveFullPlaybackDurationSeconds(coreDocument, parsed), 3.5);
});

test('normalizeMidiNotes folds simultaneous identical pitches into one louder playable note', () => {
  const normalized = normalizeMidiNotes([
    { time: 0, midi: 60, duration: 0, velocity: 0.63 },
    { time: 0, midi: 60, duration: 1.99, velocity: 0.63 },
    { time: 0.5, midi: 62, duration: 0.5, velocity: 0.5 },
  ]);

  assert.deepEqual(normalized, [
    { time: 0, midi: 60, duration: 1.99, velocity: 0.63, multiplicity: 2 },
    { time: 0.5, midi: 62, duration: 0.5, velocity: 0.5, multiplicity: 1 },
  ]);
});

test('applySwingToMidiNotes delays offbeat eighth notes for imported swing playback', () => {
  const swung = applySwingToMidiNotes([
    { time: 0, midi: 60, duration: 0.5, velocity: 0.8 },
    { time: 0.25, midi: 62, duration: 0.25, velocity: 0.8 },
    { time: 0.5, midi: 64, duration: 0.5, velocity: 0.8 },
    { time: 0.75, midi: 65, duration: 0.25, velocity: 0.8 },
  ], { tempos: [{ bpm: 120, time: 0 }] }, 2 / 3, 'eighth');

  assert.deepEqual(swung.map((note) => Number(note.time.toFixed(3))), [0, 0.333, 0.5, 0.833]);
  assert.deepEqual(swung.map((note) => Number(note.duration.toFixed(3))), [0.5, 0.167, 0.5, 0.167]);
});
