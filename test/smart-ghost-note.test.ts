import test from 'node:test';
import assert from 'node:assert/strict';

import {
  applyGhostPlacementModifiers,
  buildLedgerLineSegments,
  clampPointerToMeasureInterior,
  resolveDragTransposePreview,
  resolveGhostPlacementIntent,
  resolveStickyStaffIndex,
  resolveTargetAnchor,
} from '../src/score-input/smart-ghost-note.ts';
import { detectActiveRhythmicSegment, fractionToNumber, getEffectiveDuration } from '../src/score-core/rhythm-utils.ts';
import { importMusicXmlToCore } from '../src/musicxml-adapter/import/import-musicxml.ts';
import {
  buildRenderedGhostGrid,
  findNearestRenderedGhostPoint,
  getRenderedGhostStaffPoints,
} from '../src/render-bridge/osmd/rendered-ghost-grid.ts';
import type { RenderedNote } from '../src/render-bridge/osmd/note-selection.ts';

const TUPLET_XML = `<?xml version="1.0" encoding="UTF-8"?>
<score-partwise version="3.1">
  <part-list>
    <score-part id="P1"><part-name>Piano</part-name></score-part>
  </part-list>
  <part id="P1">
    <measure number="1">
      <attributes>
        <divisions>12</divisions>
        <time><beats>4</beats><beat-type>4</beat-type></time>
        <clef><sign>G</sign><line>2</line></clef>
      </attributes>
      <note>
        <pitch><step>C</step><octave>4</octave></pitch>
        <duration>4</duration>
        <voice>1</voice>
        <type>eighth</type>
        <time-modification><actual-notes>3</actual-notes><normal-notes>2</normal-notes></time-modification>
        <notations><tuplet type="start" number="1"/></notations>
        <staff>1</staff>
      </note>
      <note>
        <pitch><step>D</step><octave>4</octave></pitch>
        <duration>4</duration>
        <voice>1</voice>
        <type>eighth</type>
        <time-modification><actual-notes>3</actual-notes><normal-notes>2</normal-notes></time-modification>
        <staff>1</staff>
      </note>
      <note>
        <pitch><step>E</step><octave>4</octave></pitch>
        <duration>4</duration>
        <voice>1</voice>
        <type>eighth</type>
        <time-modification><actual-notes>3</actual-notes><normal-notes>2</normal-notes></time-modification>
        <notations><tuplet type="stop" number="1"/></notations>
        <staff>1</staff>
      </note>
      <note>
        <pitch><step>F</step><octave>4</octave></pitch>
        <duration>12</duration>
        <voice>1</voice>
        <type>quarter</type>
        <staff>1</staff>
      </note>
      <note>
        <rest/>
        <duration>24</duration>
        <voice>1</voice>
        <type>half</type>
        <staff>1</staff>
      </note>
    </measure>
  </part>
</score-partwise>`;

function makeRenderedNote(opts: {
  id: string;
  measureId: string;
  measureNumber: number;
  staffIndex: number;
  voiceId: number;
  timestampNum: number;
  timestampDen: number;
  domX: number;
  domY: number;
  isRest?: boolean;
}): RenderedNote {
  return {
    id: opts.id,
    coreEntityId: opts.id,
    note: {
      coreEntityId: opts.id,
      coreMeasureId: opts.measureId,
      corePartId: 'p1',
      measureNumber: opts.measureNumber,
      staffIndex: opts.staffIndex,
      voiceId: opts.voiceId,
      timestampNum: opts.timestampNum,
      timestampDen: opts.timestampDen,
      step: 'C',
      octave: 4,
      alter: 0,
      isRest: Boolean(opts.isRest),
      graphicalNote: null,
    },
    svgCenter: { x: opts.domX, y: opts.domY },
    domCenter: { x: opts.domX, y: opts.domY },
    domRect: { x: opts.domX - 6, y: opts.domY - 6, width: 12, height: 12 },
    svgElement: null,
    tintElement: null,
  };
}

test('measure interior clamp creates a dead zone around barlines', () => {
  assert.deepEqual(
    clampPointerToMeasureInterior({
      pointerX: 102,
      measureLeft: 100,
      measureWidth: 80,
      paddingPx: 8,
    }),
    {
      clampedX: 108,
      safeLeft: 108,
      safeRight: 172,
      isOutOfBounds: true,
    },
  );
});

test('whole-rest grid snap resolves a rest anchor to replace instead of synthetic insert', () => {
  const grid = buildRenderedGhostGrid([
    makeRenderedNote({
      id: 'whole-rest-beat-3',
      measureId: 'm1',
      measureNumber: 1,
      staffIndex: 1,
      voiceId: 1,
      timestampNum: 2,
      timestampDen: 4,
      domX: 160,
      domY: 30,
      isRest: true,
    }),
  ]);

  const snapped = findNearestRenderedGhostPoint(grid, {
    measureId: 'm1',
    staffIndex: 1,
    pointerX: 160,
  });
  assert.equal(snapped?.isRest, true);
  assert.equal(snapped?.timestampNum, 2);
  assert.equal(snapped?.timestampDen, 4);

  const anchors = getRenderedGhostStaffPoints(grid, 'm1', 1).map((point) => ({
    ratio: point.ratio,
    x: point.domX,
    voiceId: point.voiceId,
    kind: 'main' as const,
    isRest: point.isRest,
    timestampNum: point.timestampNum,
    timestampDen: point.timestampDen,
  }));

  const intent = resolveGhostPlacementIntent({
    pointerX: 160,
    snappedRatio: snapped?.ratio ?? 0.5,
    slotDuration: 0.25,
    segmentStartRatio: 0,
    maxStartRatio: 3.75,
    anchors,
  });

  assert.equal(intent.anchor?.isRest, true);
  assert.equal(intent.mode, 'replace');
  assert.equal(intent.targetRatio, 0.5);
});

test('whole-rest placement uses the active voice as the target voice', () => {
  const intent = resolveGhostPlacementIntent({
    pointerX: 160,
    snappedRatio: 0,
    slotDuration: 0.25,
    segmentStartRatio: 0,
    maxStartRatio: 0.75,
    activeVoiceId: 3,
    anchors: [{
      ratio: 0,
      x: 160,
      voiceId: 1,
      kind: 'main',
      isRest: true,
      timestampNum: 0,
      timestampDen: 4,
    }],
  });

  assert.equal(intent.mode, 'replace');
  assert.equal(intent.anchor?.voiceId, 1);
  assert.equal(intent.targetVoiceId, 3);
});

test('horizontal intent resolves insert, replace, and chord zones around an onset', () => {
  const anchors = [{ ratio: 1, x: 120 }];

  assert.equal(resolveGhostPlacementIntent({
    pointerX: 100,
    snappedRatio: 1,
    slotDuration: 0.25,
    segmentStartRatio: 0,
    maxStartRatio: 3.75,
    anchors,
  }).mode, 'insert');

  const replace = resolveGhostPlacementIntent({
    pointerX: 120,
    snappedRatio: 1,
    slotDuration: 0.25,
    segmentStartRatio: 0,
    maxStartRatio: 3.75,
    anchors,
  });
  assert.equal(replace.mode, 'replace');
  assert.equal(replace.targetRatio, 1);

  const chord = resolveGhostPlacementIntent({
    pointerX: 128,
    snappedRatio: 1,
    slotDuration: 0.25,
    segmentStartRatio: 0,
    maxStartRatio: 3.75,
    anchors,
  });
  assert.equal(chord.mode, 'chord');
  assert.equal(chord.targetRatio, 1);
});

test('insert intent uses the active voice when entering beside another voice anchor', () => {
  const intent = resolveGhostPlacementIntent({
    pointerX: 106,
    snappedRatio: 1,
    slotDuration: 0.25,
    segmentStartRatio: 0,
    maxStartRatio: 3.75,
    activeVoiceId: 2,
    anchors: [{
      ratio: 1,
      x: 120,
      voiceId: 1,
      kind: 'main',
      isRest: false,
    }],
  });

  assert.equal(intent.mode, 'insert');
  assert.equal(intent.anchor?.voiceId, 1);
  assert.equal(intent.targetVoiceId, 2);
});

test('mouse note-entry modifiers explicitly override horizontal placement intent', () => {
  const base = {
    placementMode: 'replace' as const,
    timestampNum: 1,
    timestampDen: 4,
  };

  assert.equal(applyGhostPlacementModifiers(base, {})?.placementMode, 'replace');
  assert.equal(applyGhostPlacementModifiers(base, { shiftKey: true })?.placementMode, 'insert');
  assert.equal(applyGhostPlacementModifiers(base, { altKey: true })?.placementMode, 'chord');
  assert.equal(applyGhostPlacementModifiers(base, { shiftKey: true, altKey: true })?.placementMode, 'chord');
  assert.equal(applyGhostPlacementModifiers(null, { shiftKey: true }), null);
});

test('ledger lines are produced only outside the five-line staff', () => {
  const lines = buildLedgerLineSegments({
    staffStep: -4,
    lineCount: 5,
    topLineDomY: 100,
    lineDistanceDom: 12,
    previewTop: 60,
    noteheadCenterX: 16,
  });
  assert.equal(lines.length, 2);
  assert.deepEqual(lines.map((line) => Math.round(line.y)), [28, 16]);

  assert.equal(buildLedgerLineSegments({
    staffStep: 4,
    lineCount: 5,
    topLineDomY: 100,
    lineDistanceDom: 12,
    previewTop: 60,
    noteheadCenterX: 16,
  }).length, 0);
});

test('drag transpose preview supports chromatic and diatonic stepping', () => {
  const chromatic = resolveDragTransposePreview({
    startStep: 'C',
    startAlter: 0,
    startOctave: 4,
    startStaffStep: 4,
    currentStaffStep: 2,
    mode: 'chromatic',
  });
  assert.deepEqual(chromatic, {
    step: 'D',
    alter: 0,
    octave: 4,
    semitoneDelta: 2,
  });

  const diatonic = resolveDragTransposePreview({
    startStep: 'B',
    startAlter: -1,
    startOctave: 4,
    startStaffStep: 6,
    currentStaffStep: 4,
    mode: 'diatonic',
  });
  assert.deepEqual(diatonic, {
    step: 'D',
    alter: -1,
    octave: 5,
    semitoneDelta: 3,
  });
});

test('staff target remains stable inside inter-staff hysteresis band', () => {
  assert.equal(resolveStickyStaffIndex({
    pointerY: 55,
    currentStaffIndex: 0,
    staffCenters: [0, 100],
    hysteresisRatio: 0.15,
  }), 0);

  assert.equal(resolveStickyStaffIndex({
    pointerY: 70,
    currentStaffIndex: 0,
    staffCenters: [0, 100],
    hysteresisRatio: 0.15,
  }), 1);
});

test('replace intent prefers active voice when two voices share an onset', () => {
  const intent = resolveGhostPlacementIntent({
    pointerX: 102,
    snappedRatio: 1,
    slotDuration: 0.25,
    segmentStartRatio: 0,
    maxStartRatio: 3.75,
    activeVoiceId: 2,
    anchors: [
      { ratio: 1, x: 100, voiceId: 1, kind: 'main' },
      { ratio: 1, x: 100, voiceId: 2, kind: 'main' },
    ],
  });

  assert.equal(intent.mode, 'replace');
  assert.equal(intent.targetVoiceId, 2);
  assert.equal(intent.anchor?.voiceId, 2);
});

test('rest anchors resolve to replace instead of chord', () => {
  const intent = resolveGhostPlacementIntent({
    pointerX: 128,
    snappedRatio: 1,
    slotDuration: 0.25,
    segmentStartRatio: 0,
    maxStartRatio: 3.75,
    anchors: [
      { ratio: 1, x: 120, voiceId: 1, kind: 'main', isRest: true },
    ],
  });

  assert.equal(intent.mode, 'replace');
  assert.equal(intent.targetRatio, 1);
  assert.equal(intent.anchor?.isRest, true);
});

test('barline dead-zone marks out-of-bounds hover before grid snapping to a barline anchor', () => {
  const safePointer = clampPointerToMeasureInterior({
    pointerX: 100,
    measureLeft: 100,
    measureWidth: 80,
    paddingPx: 8,
  });
  assert.equal(safePointer.isOutOfBounds, true);
  assert.equal(safePointer.clampedX, 108);

  const grid = buildRenderedGhostGrid([
    makeRenderedNote({
      id: 'barline-anchor',
      measureId: 'm1',
      measureNumber: 1,
      staffIndex: 1,
      voiceId: 1,
      timestampNum: 0,
      timestampDen: 4,
      domX: 100,
      domY: 24,
    }),
    makeRenderedNote({
      id: 'safe-first-anchor',
      measureId: 'm1',
      measureNumber: 1,
      staffIndex: 1,
      voiceId: 1,
      timestampNum: 1,
      timestampDen: 4,
      domX: 110,
      domY: 24,
    }),
  ]);

  const snapped = findNearestRenderedGhostPoint(grid, {
    measureId: 'm1',
    staffIndex: 1,
    pointerX: safePointer.clampedX,
  });

  assert.equal(snapped?.id, 'safe-first-anchor');
  assert.equal(snapped?.timestampNum, 1);
  assert.equal(snapped?.timestampDen, 4);
});

test('tuplet quantization switches exactly at tuplet boundaries', () => {
  const core = importMusicXmlToCore(TUPLET_XML);
  const measureId = core.score.parts[0]!.staves[0]!.measures[0]!.id;

  const insideTuplet = detectActiveRhythmicSegment(
    core,
    measureId,
    1,
    1,
    { num: 1, den: 12 },
  );
  const outsideTuplet = detectActiveRhythmicSegment(
    core,
    measureId,
    1,
    1,
    { num: 2, den: 4 },
  );

  assert.equal(insideTuplet.type, 'tuplet');
  assert.equal(outsideTuplet.type, 'base');
  assert.ok(fractionToNumber(getEffectiveDuration('8', false, insideTuplet)) < fractionToNumber(getEffectiveDuration('8', false, outsideTuplet)));
});

test('grace anchor is preferred over main-note anchor within grace hit radius', () => {
  const target = resolveTargetAnchor({
    pointerX: 96,
    anchors: [
      { ratio: 0.9, x: 90, kind: 'grace', voiceId: 1 },
      { ratio: 1, x: 100, kind: 'main', voiceId: 1 },
    ],
    graceHitRadiusPx: 8,
    baseHitRadiusPx: 6,
  });

  assert.equal(target?.kind, 'grace');
});
