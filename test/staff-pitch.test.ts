import test from 'node:test';
import assert from 'node:assert/strict';

import {
  diatonicPitchIndex,
  formatPitchLabel,
  keyFifthsAlterForStep,
  pitchFromDiatonicIndex,
  resolvePitchNameEntry,
  resolveClefAtMeasure,
  resolveDiatonicIntervalAbove,
  resolveKeyFifthsAtMeasure,
  resolveMeasureAccidentalAlter,
  resolveStaffStepPitch,
  topLineDiatonicIndex,
} from '../src/score-input/staff-pitch.ts';
import type { ScoreDocumentModel } from '../src/score-core/model/types.ts';

test('topLineDiatonicIndex for treble clef = F5', () => {
  assert.equal(topLineDiatonicIndex({ sign: 'G', line: 2 }), diatonicPitchIndex('F', 5));
});

test('topLineDiatonicIndex for bass clef = A3', () => {
  assert.equal(topLineDiatonicIndex({ sign: 'F', line: 4 }), diatonicPitchIndex('A', 3));
});

test('topLineDiatonicIndex for alto clef (C on line 3) = G4', () => {
  assert.equal(topLineDiatonicIndex({ sign: 'C', line: 3 }), diatonicPitchIndex('G', 4));
});

test('topLineDiatonicIndex for tenor clef (C on line 4) = E4', () => {
  assert.equal(topLineDiatonicIndex({ sign: 'C', line: 4 }), diatonicPitchIndex('E', 4));
});

test('resolveStaffStepPitch: treble top line = F5', () => {
  const result = resolveStaffStepPitch(0, { sign: 'G', line: 2 });
  assert.equal(result.step, 'F');
  assert.equal(result.octave, 5);
});

test('resolveStaffStepPitch: treble middle line (B4) is staffStep 4', () => {
  const result = resolveStaffStepPitch(4, { sign: 'G', line: 2 });
  assert.equal(result.step, 'B');
  assert.equal(result.octave, 4);
});

test('resolveStaffStepPitch: treble bottom line (E4) is staffStep 8', () => {
  const result = resolveStaffStepPitch(8, { sign: 'G', line: 2 });
  assert.equal(result.step, 'E');
  assert.equal(result.octave, 4);
});

test('resolveStaffStepPitch: middle C (C4) sits one ledger line below treble staff (staffStep 10)', () => {
  const result = resolveStaffStepPitch(10, { sign: 'G', line: 2 });
  assert.equal(result.step, 'C');
  assert.equal(result.octave, 4);
});

test('resolveStaffStepPitch: bass top line = A3, middle C above = staffStep -2', () => {
  const top = resolveStaffStepPitch(0, { sign: 'F', line: 4 });
  assert.equal(top.step, 'A');
  assert.equal(top.octave, 3);
  const middleC = resolveStaffStepPitch(-2, { sign: 'F', line: 4 });
  assert.equal(middleC.step, 'C');
  assert.equal(middleC.octave, 4);
});

test('resolveStaffStepPitch: negative staffStep goes above the staff', () => {
  // Treble G5 sits a diatonic step above top line F5 → staffStep -1
  const g5 = resolveStaffStepPitch(-1, { sign: 'G', line: 2 });
  assert.equal(g5.step, 'G');
  assert.equal(g5.octave, 5);
});

test('formatPitchLabel uses engraved accidentals and includes the octave', () => {
  assert.equal(formatPitchLabel('F', -2, 4), 'F𝄫4');
  assert.equal(formatPitchLabel('F', -1, 4), 'F♭4');
  assert.equal(formatPitchLabel('F', 0, 4), 'F4');
  assert.equal(formatPitchLabel('F', 0, 4, { showNatural: true }), 'F♮4');
  assert.equal(formatPitchLabel('F', 1, 4), 'F♯4');
  assert.equal(formatPitchLabel('F', 2, 4), 'F𝄪4');
});

test('canonical staff geometry gives identical pitch regardless of measure contents', () => {
  const resolveFromY = (pointerY: number, topLineY: number, lineDistancePx: number) => {
    const staffStep = Math.round((pointerY - topLineY) / (lineDistancePx / 2));
    return resolveStaffStepPitch(staffStep, { sign: 'G', line: 2 });
  };
  const blankMeasurePitch = resolveFromY(132.5, 100, 10);
  const restOnlyMeasurePitch = resolveFromY(132.5, 100, 10);
  const populatedMeasurePitch = resolveFromY(132.5, 100, 10);
  assert.deepEqual(blankMeasurePitch, restOnlyMeasurePitch);
  assert.deepEqual(blankMeasurePitch, populatedMeasurePitch);
});

test('canonical pitch lanes scale with zoom and do not enforce a CSS-pixel minimum', () => {
  const resolveAtLane = (zoom: number) => {
    const topLineY = 20 * zoom;
    const lineDistancePx = 8 * zoom;
    const pointerY = topLineY + 6 * (lineDistancePx / 2);
    const staffStep = Math.round((pointerY - topLineY) / (lineDistancePx / 2));
    return resolveStaffStepPitch(staffStep, { sign: 'C', line: 4 });
  };
  assert.deepEqual(resolveAtLane(0.35), resolveAtLane(1));
  assert.deepEqual(resolveAtLane(2.5), resolveAtLane(1));
});

test('pitchFromDiatonicIndex round-trips through diatonicPitchIndex', () => {
  for (const step of ['C', 'D', 'E', 'F', 'G', 'A', 'B'] as const) {
    for (let octave = 0; octave <= 8; octave += 1) {
      const idx = diatonicPitchIndex(step, octave);
      const pitch = pitchFromDiatonicIndex(idx);
      assert.equal(pitch.step, step);
      assert.equal(pitch.octave, octave);
    }
  }
});

function buildDocWithClef(sign: 'G' | 'F' | 'C', line: number, staffIndex = 1): ScoreDocumentModel {
  return {
    score: {
      parts: [{
        id: 'P1',
        sourcePartId: 'P1',
        name: 'Part 1',
        abbreviation: null,
        staves: [{
          staffIndex,
          measures: [{
            id: 'm1',
            measureNumber: 1,
            voices: [],
            directions: [],
            attributes: [{
              id: 'a1',
              keyFifths: 0,
              clefs: [{ staffIndex, sign, line }],
            }],
          }],
        }],
      }],
    },
    index: { measureIds: {}, voiceIds: {}, eventIds: {} },
  } as unknown as ScoreDocumentModel;
}

test('resolveClefAtMeasure returns declared clef', () => {
  const doc = buildDocWithClef('F', 4);
  const clef = resolveClefAtMeasure(doc, 1, 1);
  assert.equal(clef.sign, 'F');
  assert.equal(clef.line, 4);
});

test('resolveClefAtMeasure falls back to treble when no clef is declared', () => {
  const clef = resolveClefAtMeasure(null, 1, 1);
  assert.equal(clef.sign, 'G');
  assert.equal(clef.line, 2);
});

test('resolveClefAtMeasure picks up a clef from a previous measure', () => {
  const doc = buildDocWithClef('F', 4);
  // add a second measure without a clef declaration
  doc.score.parts[0]!.staves[0]!.measures.push({
    id: 'm2',
    measureNumber: 2,
    voices: [],
    directions: [],
    attributes: [],
  } as never);
  const clef = resolveClefAtMeasure(doc, 2, 1);
  assert.equal(clef.sign, 'F');
});

test('resolveClefAtMeasure isolates parallel instruments with the same local staff index', () => {
  const upper = buildDocWithClef('G', 2);
  const lower = buildDocWithClef('F', 4).score.parts[0]!;
  lower.id = 'P2';
  lower.sourcePartId = 'P2';
  lower.staves[0]!.measures[0]!.id = 'lower-m1';
  upper.score.parts[0]!.staves[0]!.measures[0]!.id = 'upper-m1';
  upper.score.parts.push(lower);

  const lowerClef = resolveClefAtMeasure(upper, 1, 1, {
    corePartId: 'P2',
    measureId: 'lower-m1',
  });
  assert.deepEqual(lowerClef, { sign: 'F', line: 4 });
});

test('keyFifthsAlterForStep resolves default mouse-entry accidentals from key signature', () => {
  assert.equal(keyFifthsAlterForStep(1, 'F'), 1);
  assert.equal(keyFifthsAlterForStep(3, 'G'), 1);
  assert.equal(keyFifthsAlterForStep(3, 'B'), 0);
  assert.equal(keyFifthsAlterForStep(-2, 'B'), -1);
  assert.equal(keyFifthsAlterForStep(-2, 'E'), -1);
  assert.equal(keyFifthsAlterForStep(-2, 'A'), 0);
});

test('resolveMeasureAccidentalAlter carries the latest staff accidental across voices and resets at the barline', () => {
  const doc = buildDocWithClef('G', 2);
  const firstMeasure = doc.score.parts[0]!.staves[0]!.measures[0]!;
  firstMeasure.attributes[0]!.keyFifths = 1;
  firstMeasure.voices = [{
    id: 'voice:1',
    voiceId: 1,
    events: [{
      id: 'event:f-natural',
      kind: 'note',
      measureNumber: 1,
      staffIndex: 1,
      voiceId: 1,
      timestampNum: 1,
      timestampDen: 4,
      durationDivisions: 1,
      durationType: 'quarter',
      isChord: false,
      pitch: { step: 'F', alter: 0, octave: 4 },
      writtenAccidental: 'natural',
    }],
  }, {
    id: 'voice:2',
    voiceId: 2,
    events: [{
      id: 'event:f-double-sharp',
      kind: 'note',
      measureNumber: 1,
      staffIndex: 1,
      voiceId: 2,
      timestampNum: 2,
      timestampDen: 4,
      durationDivisions: 1,
      durationType: 'quarter',
      isChord: false,
      pitch: { step: 'F', alter: 2, octave: 4 },
      writtenAccidental: 'double-sharp',
    }],
  }];
  doc.score.parts[0]!.staves[0]!.measures.push({
    id: 'm2',
    measureNumber: 2,
    voices: [],
    directions: [],
    attributes: [],
  } as never);

  const resolve = (measureNumber: number, timestampNum: number, octave = 4) => resolveMeasureAccidentalAlter(doc, {
    corePartId: 'P1',
    measureNumber,
    staffIndex: 1,
    timestampNum,
    timestampDen: 4,
    step: 'F',
    octave,
  });

  assert.equal(resolve(1, 0), 1, 'key signature applies before the first explicit accidental');
  assert.equal(resolve(1, 2), 0, 'a natural carries to a later onset on the same staff');
  assert.equal(resolve(1, 3), 2, 'the latest cross-voice accidental wins for the same pitch and octave');
  assert.equal(resolve(1, 3, 5), 1, 'accidental carry is octave-specific');
  assert.equal(resolve(2, 1), 1, 'the barline resets accidental carry to the key signature');
});

test('resolveDiatonicIntervalAbove spells intervals from the active key signature', () => {
  assert.deepEqual(
    resolveDiatonicIntervalAbove({ step: 'C', alter: 0, octave: 4 }, 3, 0),
    { step: 'E', alter: 0, octave: 4 },
  );
  assert.deepEqual(
    resolveDiatonicIntervalAbove({ step: 'D', alter: 0, octave: 4 }, 3, 0),
    { step: 'F', alter: 0, octave: 4 },
  );
  assert.deepEqual(
    resolveDiatonicIntervalAbove({ step: 'E', alter: 0, octave: 4 }, 2, 1),
    { step: 'F', alter: 1, octave: 4 },
  );
  assert.deepEqual(
    resolveDiatonicIntervalAbove({ step: 'B', alter: 0, octave: 4 }, 9, -1),
    { step: 'C', alter: 0, octave: 6 },
  );
});

test('resolveDiatonicIntervalAbove preserves the exact pitch for a unison', () => {
  assert.deepEqual(
    resolveDiatonicIntervalAbove({ step: 'C', alter: 1, octave: 4 }, 1, -3),
    { step: 'C', alter: 1, octave: 4 },
  );
});

test('resolveKeyFifthsAtMeasure inherits the latest key signature for the target part and staff', () => {
  const doc = buildDocWithClef('G', 2);
  doc.score.parts[0]!.staves[0]!.measures[0]!.attributes[0]!.keyFifths = 2;
  doc.score.parts[0]!.staves[0]!.measures.push({
    id: 'm2',
    measureNumber: 2,
    voices: [],
    directions: [],
    attributes: [],
  } as never);
  doc.score.parts[0]!.staves[0]!.measures.push({
    id: 'm3',
    measureNumber: 3,
    voices: [],
    directions: [],
    attributes: [{ id: 'a3', keyFifths: -3, clefs: [] }],
  } as never);

  assert.equal(resolveKeyFifthsAtMeasure(doc, { measureNumber: 2, staffIndex: 1, partId: 'P1' }), 2);
  assert.equal(resolveKeyFifthsAtMeasure(doc, { measureNumber: 3, staffIndex: 1, partId: 'P1' }), -3);
});

test('resolvePitchNameEntry chooses the chromatically closest octave for melodic letter entry', () => {
  assert.deepEqual(
    resolvePitchNameEntry('C', 0, { step: 'B', alter: 0, octave: 4 }, 'closest'),
    { step: 'C', alter: 0, octave: 5 },
  );
  assert.deepEqual(
    resolvePitchNameEntry('B', 0, { step: 'C', alter: 0, octave: 4 }, 'closest'),
    { step: 'B', alter: 0, octave: 3 },
  );
  assert.deepEqual(
    resolvePitchNameEntry('G', 0, { step: 'C', alter: 0, octave: 4 }, 'closest'),
    { step: 'G', alter: 0, octave: 3 },
  );
  assert.deepEqual(
    resolvePitchNameEntry('F', 1, { step: 'C', alter: 0, octave: 4 }, 'closest'),
    { step: 'F', alter: 1, octave: 4 },
  );
});

test('resolvePitchNameEntry places chord pitch names strictly above the reference tone', () => {
  assert.deepEqual(
    resolvePitchNameEntry('C', 0, { step: 'B', alter: 0, octave: 4 }, 'above'),
    { step: 'C', alter: 0, octave: 5 },
  );
  assert.deepEqual(
    resolvePitchNameEntry('B', -1, { step: 'G', alter: 0, octave: 4 }, 'above'),
    { step: 'B', alter: -1, octave: 4 },
  );
  assert.deepEqual(
    resolvePitchNameEntry('G', 0, { step: 'G', alter: 0, octave: 4 }, 'above'),
    { step: 'G', alter: 0, octave: 5 },
  );
  assert.deepEqual(
    resolvePitchNameEntry('C', -1, { step: 'B', alter: 0, octave: 4 }, 'above'),
    { step: 'C', alter: -1, octave: 5 },
  );
});
