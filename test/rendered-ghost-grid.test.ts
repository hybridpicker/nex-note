import test from 'node:test';
import assert from 'node:assert/strict';

import {
  buildRenderedGhostGrid,
  findNearestRenderedGhostPoint,
  getRenderedGhostStaffPoints,
} from '../src/render-bridge/osmd/rendered-ghost-grid.ts';
import type { RenderedNote } from '../src/render-bridge/osmd/note-selection.ts';
import type { ScoreDocumentModel } from '../src/score-core/model/types.ts';

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

function makeCoreDoc(overrides: Partial<ScoreDocumentModel> = {}): ScoreDocumentModel {
  return {
    score: { id: 's', parts: [] },
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
    ...overrides,
  } as ScoreDocumentModel;
}

function makeOverlay(
  measureId: string,
  measureNumber: number,
  rect: { x: number; y: number; width: number; height: number },
  options?: { breakBefore?: boolean },
) {
  return {
    measureId,
    measureNumber,
    domRect: rect,
    breakBefore: options?.breakBefore ?? false,
  };
}

test('buildRenderedGhostGrid keeps rests as staff snap points', () => {
  const grid = buildRenderedGhostGrid([
    makeRenderedNote({
      id: 'rest',
      measureId: 'm1',
      measureNumber: 1,
      staffIndex: 1,
      voiceId: 1,
      timestampNum: 0,
      timestampDen: 1,
      domX: 120,
      domY: 32,
      isRest: true,
    }),
  ]);

  const staffPoints = getRenderedGhostStaffPoints(grid, 'm1', 1, { includeSynthetic: true });
  assert.equal(staffPoints.length, 1);
  assert.equal(staffPoints[0]?.isRest, true);
  assert.equal(staffPoints[0]?.timestampNum, 0);
  assert.equal(staffPoints[0]?.domX, 120);
});

test('buildRenderedGhostGrid aligns same-timestamp rest snaps across piano staves', () => {
  const grid = buildRenderedGhostGrid([
    makeRenderedNote({
      id: 'upper-rest',
      measureId: 'm2s1',
      measureNumber: 2,
      staffIndex: 1,
      voiceId: 1,
      timestampNum: 0,
      timestampDen: 16,
      domX: 300,
      domY: 120,
      isRest: true,
    }),
    makeRenderedNote({
      id: 'lower-rest',
      measureId: 'm2s2',
      measureNumber: 2,
      staffIndex: 2,
      voiceId: 1,
      timestampNum: 0,
      timestampDen: 16,
      domX: 314,
      domY: 260,
      isRest: true,
    }),
  ], {
    measureOverlays: [
      {
        measureId: 'm2s1',
        measureNumber: 2,
        pageIndex: 0,
        systemIndex: 0,
        domRect: { x: 240, y: 80, width: 160, height: 100 },
        breakBefore: false,
      },
      {
        measureId: 'm2s2',
        measureNumber: 2,
        pageIndex: 0,
        systemIndex: 0,
        domRect: { x: 240, y: 200, width: 160, height: 100 },
        breakBefore: false,
      },
    ],
  });

  const upper = getRenderedGhostStaffPoints(grid, 'm2s1', 1)[0];
  const lower = getRenderedGhostStaffPoints(grid, 'm2s2', 2)[0];
  assert.ok(upper);
  assert.ok(lower);
  assert.equal(upper.domX, lower.domX);
  assert.equal(upper.domX, 307);
});

test('findNearestRenderedGhostPoint resolves within the hovered measure and staff', () => {
  const grid = buildRenderedGhostGrid([
    makeRenderedNote({
      id: 'upper-start',
      measureId: 'm1',
      measureNumber: 1,
      staffIndex: 1,
      voiceId: 1,
      timestampNum: 0,
      timestampDen: 4,
      domX: 40,
      domY: 20,
    }),
    makeRenderedNote({
      id: 'upper-late',
      measureId: 'm1',
      measureNumber: 1,
      staffIndex: 1,
      voiceId: 1,
      timestampNum: 2,
      timestampDen: 4,
      domX: 180,
      domY: 20,
    }),
    makeRenderedNote({
      id: 'lower-start',
      measureId: 'm1',
      measureNumber: 1,
      staffIndex: 2,
      voiceId: 1,
      timestampNum: 0,
      timestampDen: 4,
      domX: 60,
      domY: 90,
    }),
  ]);

  const snapped = findNearestRenderedGhostPoint(grid, {
    measureId: 'm1',
    staffIndex: 1,
    pointerX: 170,
  });

  assert.equal(snapped?.id, 'upper-late');
  assert.equal(snapped?.staffIndex, 1);
  assert.equal(snapped?.timestampNum, 2);
  assert.equal(snapped?.timestampDen, 4);
});

test('findNearestRenderedGhostPoint ignores other staves even when their subdivisions align more closely', () => {
  const grid = buildRenderedGhostGrid([
    makeRenderedNote({
      id: 'treble-16th',
      measureId: 'm1',
      measureNumber: 1,
      staffIndex: 1,
      voiceId: 1,
      timestampNum: 1,
      timestampDen: 16,
      domX: 50,
      domY: 20,
    }),
    makeRenderedNote({
      id: 'bass-half-start',
      measureId: 'm1',
      measureNumber: 1,
      staffIndex: 2,
      voiceId: 1,
      timestampNum: 0,
      timestampDen: 4,
      domX: 30,
      domY: 90,
    }),
    makeRenderedNote({
      id: 'bass-half-late',
      measureId: 'm1',
      measureNumber: 1,
      staffIndex: 2,
      voiceId: 1,
      timestampNum: 2,
      timestampDen: 4,
      domX: 150,
      domY: 90,
    }),
  ]);

  const snapped = findNearestRenderedGhostPoint(grid, {
    measureId: 'm1',
    staffIndex: 2,
    pointerX: 50,
  });

  assert.equal(snapped?.id, 'bass-half-start');
  assert.equal(snapped?.staffIndex, 2);
  assert.equal(snapped?.timestampNum, 0);
  assert.equal(snapped?.timestampDen, 4);
});

test('buildRenderedGhostGrid does not expose a visible snap for an empty voice rendered as a long-rest glyph', () => {
  const coreDocument = makeCoreDoc({
    score: {
      id: 's',
      parts: [{
        id: 'p1',
        sourcePartId: 'P1',
        name: 'Part',
        staves: [{
          id: 'st1',
          staffIndex: 1,
          measures: [{
            id: 'm7',
            measureNumber: 7,
            attributes: [{ id: 'a7', divisions: 1, time: { beats: 4, beatType: 4 }, clefs: [] }],
            voices: [{ id: 'v1', voiceId: 1, events: [] }],
          }],
        }],
      }],
    } as any,
  });

  const grid = buildRenderedGhostGrid([
    makeRenderedNote({
      id: 'rest-start',
      measureId: 'm7',
      measureNumber: 7,
      staffIndex: 1,
      voiceId: 1,
      timestampNum: 0,
      timestampDen: 4,
      domX: 20,
      domY: 32,
      isRest: true,
    }),
  ], {
    coreDocument,
    measureOverlays: [makeOverlay('m7', 7, { x: 0, y: 0, width: 200, height: 40 })],
    selectedDuration: '4',
  });

  const staffPoints = getRenderedGhostStaffPoints(grid, 'm7', 1);
  assert.deepEqual(staffPoints, []);

  const snapped = findNearestRenderedGhostPoint(grid, {
    measureId: 'm7',
    staffIndex: 1,
    pointerX: 24,
  });
  assert.equal(snapped, null);

  const latePointer = findNearestRenderedGhostPoint(grid, {
    measureId: 'm7',
    staffIndex: 1,
    pointerX: 150,
  });
  assert.equal(latePointer, null);
});

test('buildRenderedGhostGrid does not expose a visible whole-rest snap when the core voice is empty', () => {
  const coreDocument = makeCoreDoc({
    score: {
      id: 's',
      parts: [{
        id: 'p1',
        sourcePartId: 'P1',
        name: 'Part',
        staves: [{
          id: 'st1',
          staffIndex: 1,
          measures: [{
            id: 'm1',
            measureNumber: 1,
            attributes: [{ id: 'a1', divisions: 1, time: { beats: 4, beatType: 4 }, clefs: [] }],
            voices: [{ id: 'v1', voiceId: 1, events: [] }],
          }],
        }],
      }],
    } as any,
  });

  const grid = buildRenderedGhostGrid([
    makeRenderedNote({
      id: 'whole-rest',
      measureId: 'm1',
      measureNumber: 1,
      staffIndex: 1,
      voiceId: 1,
      timestampNum: 0,
      timestampDen: 4,
      domX: 240,
      domY: 32,
      isRest: true,
    }),
  ], {
    coreDocument,
    measureOverlays: [makeOverlay('m1', 1, { x: 100, y: 0, width: 200, height: 40 })],
    selectedDuration: '4',
  });

  const staffPoints = getRenderedGhostStaffPoints(grid, 'm1', 1, { includeSynthetic: true });
  assert.deepEqual(staffPoints, []);

  const snapped = findNearestRenderedGhostPoint(grid, {
    measureId: 'm1',
    staffIndex: 1,
    pointerX: 200,
  });
  assert.equal(snapped, null);
});

test('buildRenderedGhostGrid keeps centered whole-rest glyphs out of the visible snap grid when no core event exists', () => {
  const coreDocument = makeCoreDoc({
    score: {
      id: 's',
      parts: [{
        id: 'p1',
        sourcePartId: 'P1',
        name: 'Part',
        staves: [{
          id: 'st1',
          staffIndex: 1,
          measures: [{
            id: 'm1',
            measureNumber: 1,
            attributes: [{ id: 'a1', divisions: 1, time: { beats: 4, beatType: 4 }, clefs: [] }],
            voices: [{ id: 'v1', voiceId: 1, events: [] }],
          }],
        }],
      }],
    } as any,
  });

  const grid = buildRenderedGhostGrid([
    makeRenderedNote({
      id: 'whole-rest',
      measureId: 'm1',
      measureNumber: 1,
      staffIndex: 1,
      voiceId: 1,
      timestampNum: 0,
      timestampDen: 4,
      domX: 86,
      domY: 32,
      isRest: true,
    }),
  ], {
    coreDocument,
    measureOverlays: [makeOverlay('m1', 1, { x: 60, y: 0, width: 360, height: 40 })],
    selectedDuration: '4',
  });

  const staffPoints = getRenderedGhostStaffPoints(grid, 'm1', 1, { includeSynthetic: true });
  assert.deepEqual(staffPoints, []);
});

test('buildRenderedGhostGrid keeps completely empty measures free of visible snap points', () => {
  const coreDocument = makeCoreDoc({
    score: {
      id: 's',
      parts: [{
        id: 'p1',
        sourcePartId: 'P1',
        name: 'Part',
        staves: [{
          id: 'st1',
          staffIndex: 1,
          measures: [{
            id: 'm7',
            measureNumber: 7,
            attributes: [{ id: 'a7', divisions: 1, time: { beats: 4, beatType: 4 }, clefs: [] }],
            voices: [],
          }],
        }],
      }],
    } as any,
  });

  const grid = buildRenderedGhostGrid([], {
    coreDocument,
    measureOverlays: [makeOverlay('m7', 7, { x: 200, y: 10, width: 120, height: 40 })],
    selectedDuration: '4',
  });

  const staffPoints = getRenderedGhostStaffPoints(grid, 'm7', 1);
  assert.deepEqual(staffPoints, []);
});

test('buildRenderedGhostGrid keeps four quarter rests as four rhythmic snap points', () => {
  const restEvents = [0, 1, 2, 3].map((beat) => ({
    id: `r${beat + 1}`,
    kind: 'rest' as const,
    measureNumber: 1,
    staffIndex: 1,
    voiceId: 1,
    timestampNum: beat,
    timestampDen: 4,
    durationDivisions: 1,
    durationType: 'quarter' as const,
    isDotted: false,
  }));
  const coreDocument = makeCoreDoc({
    score: {
      id: 's',
      parts: [{
        id: 'p1',
        sourcePartId: 'P1',
        name: 'Part',
        staves: [{
          id: 'st1',
          staffIndex: 1,
          measures: [{
            id: 'm1',
            measureNumber: 1,
            attributes: [{ id: 'a1', divisions: 1, time: { beats: 4, beatType: 4 }, clefs: [] }],
            voices: [{ id: 'v1', voiceId: 1, events: restEvents }],
          }],
        }],
      }],
    } as any,
  });

  const grid = buildRenderedGhostGrid(restEvents.map((event, index) => makeRenderedNote({
    id: event.id,
    measureId: 'm1',
    measureNumber: 1,
    staffIndex: 1,
    voiceId: 1,
    timestampNum: event.timestampNum,
    timestampDen: event.timestampDen,
    domX: 120 + (index * 40),
    domY: 32,
    isRest: true,
  })), {
    coreDocument,
    measureOverlays: [makeOverlay('m1', 1, { x: 100, y: 0, width: 200, height: 40 })],
    selectedDuration: '4',
  });

  const staffPoints = getRenderedGhostStaffPoints(grid, 'm1', 1);
  assert.deepEqual(
    staffPoints.map((point) => `${point.timestampNum}/${point.timestampDen}:${point.synthetic ? 'synthetic' : 'rendered'}`),
    ['0/4:rendered', '1/4:rendered', '2/4:rendered', '3/4:rendered'],
  );
});

test('buildRenderedGhostGrid keeps one rhythmic anchor per voice in a staff', () => {
  const coreDocument = makeCoreDoc({
    score: {
      id: 's',
      parts: [{
        id: 'p1',
        sourcePartId: 'P1',
        name: 'Part',
        staves: [{
          id: 'st1',
          staffIndex: 1,
          measures: [{
            id: 'm1',
            measureNumber: 1,
            attributes: [{ id: 'a1', divisions: 1, time: { beats: 4, beatType: 4 }, clefs: [] }],
            voices: [
              { id: 'v1', voiceId: 1, events: [{ id: 'n1', kind: 'note', measureNumber: 1, staffIndex: 1, voiceId: 1, timestampNum: 0, timestampDen: 4, durationDivisions: 1, durationType: 'quarter', isDotted: false, pitch: { step: 'C', octave: 4, alter: 0 } }] },
              { id: 'v2', voiceId: 2, events: [] },
            ],
          }],
        }],
      }],
    } as any,
  });

  const grid = buildRenderedGhostGrid([
    makeRenderedNote({
      id: 'n1',
      measureId: 'm1',
      measureNumber: 1,
      staffIndex: 1,
      voiceId: 1,
      timestampNum: 0,
      timestampDen: 4,
      domX: 120,
      domY: 32,
    }),
  ], {
    coreDocument,
    measureOverlays: [makeOverlay('m1', 1, { x: 100, y: 0, width: 200, height: 40 })],
    selectedDuration: '4',
  });

  const staffPoints = getRenderedGhostStaffPoints(grid, 'm1', 1);
  const voiceOnePoints = staffPoints.filter((point) => point.voiceId === 1);
  const voiceTwoPoints = staffPoints.filter((point) => point.voiceId === 2);

  assert.deepEqual(
    voiceOnePoints.map((point) => `${point.timestampNum}/${point.timestampDen}:${point.synthetic ? 'synthetic' : 'rendered'}`),
    ['0/4:rendered'],
  );
  assert.deepEqual(
    voiceTwoPoints.map((point) => `${point.timestampNum}/${point.timestampDen}:${point.synthetic ? 'synthetic' : 'rendered'}`),
    [],
  );

  const snapped = findNearestRenderedGhostPoint(grid, {
    measureId: 'm1',
    staffIndex: 1,
    voiceId: 2,
    pointerX: 120,
  });
  assert.equal(snapped?.voiceId, 1);
  assert.equal(snapped?.timestampNum, 0);
  assert.equal(snapped?.timestampDen, 4);
});

test('buildRenderedGhostGrid keeps system-start fallback anchors internal-only', () => {
  const coreDocument = makeCoreDoc({
    score: {
      id: 's',
      parts: [{
        id: 'p1',
        sourcePartId: 'P1',
        name: 'Part',
        staves: [{
          id: 'st1',
          staffIndex: 1,
          measures: [{
            id: 'm1',
            measureNumber: 1,
            attributes: [{ id: 'a1', divisions: 1, time: { beats: 4, beatType: 4 }, clefs: [] }],
            voices: [{ id: 'v1', voiceId: 1, events: [{
              id: 'late-note',
              kind: 'note',
              measureNumber: 1,
              staffIndex: 1,
              voiceId: 1,
              timestampNum: 2,
              timestampDen: 4,
              durationDivisions: 1,
              durationType: 'quarter',
              pitch: { step: 'C', octave: 4, alter: 0 },
            }] }],
          }],
        }],
      }],
    } as any,
  });

  const grid = buildRenderedGhostGrid([
    makeRenderedNote({
      id: 'late-note',
      measureId: 'm1',
      measureNumber: 1,
      staffIndex: 1,
      voiceId: 1,
      timestampNum: 2,
      timestampDen: 4,
      domX: 220,
      domY: 32,
    }),
  ], {
    coreDocument,
    measureOverlays: [makeOverlay('m1', 1, { x: -180, y: 10, width: 520, height: 40 }, { breakBefore: true })],
    selectedDuration: '4',
  });

  const staffPoints = getRenderedGhostStaffPoints(grid, 'm1', 1);
  assert.deepEqual(
    staffPoints.map((point) => ({
      timestamp: `${point.timestampNum}/${point.timestampDen}`,
      x: Math.round(point.domX),
      synthetic: point.synthetic,
    })),
    [
      { timestamp: '2/4', x: 220, synthetic: false },
    ],
  );

  const allPoints = getRenderedGhostStaffPoints(grid, 'm1', 1, { includeSynthetic: true });
  const internalStart = allPoints.find((point) => point.synthetic && point.timestampNum === 0 && point.timestampDen === 1);
  assert.equal(internalStart, undefined);

  const snapped = findNearestRenderedGhostPoint(grid, {
    measureId: 'm1',
    staffIndex: 1,
    pointerX: 160,
  });
  assert.equal(snapped?.timestampNum, 2);
  assert.equal(snapped?.timestampDen, 4);
  assert.equal(Math.round(snapped?.domX ?? 0), 220);
});

test('buildRenderedGhostGrid keeps rendered first-measure note snaps on the visible notehead', () => {
  const coreDocument = makeCoreDoc({
    score: {
      id: 's',
      parts: [{
        id: 'p1',
        sourcePartId: 'P1',
        name: 'Part',
        staves: [{
          id: 'st1',
          staffIndex: 1,
          measures: [{
            id: 'm1',
            measureNumber: 1,
            attributes: [{ id: 'a1', divisions: 1, time: { beats: 4, beatType: 4 }, clefs: [] }],
            voices: [{ id: 'v1', voiceId: 1, events: [{
              id: 'n1',
              kind: 'note',
              measureNumber: 1,
              staffIndex: 1,
              voiceId: 1,
              timestampNum: 0,
              timestampDen: 4,
              durationDivisions: 1,
              durationType: 'quarter',
              pitch: { step: 'C', octave: 4, alter: 0 },
            }] }],
          }],
        }],
      }],
    } as any,
  });

  const grid = buildRenderedGhostGrid([
    makeRenderedNote({
      id: 'n1',
      measureId: 'm1',
      measureNumber: 1,
      staffIndex: 1,
      voiceId: 1,
      timestampNum: 0,
      timestampDen: 4,
      domX: 100,
      domY: 32,
    }),
  ], {
    coreDocument,
    measureOverlays: [makeOverlay('m1', 1, { x: 100, y: 10, width: 240, height: 40 }, { breakBefore: true })],
    selectedDuration: '4',
  });

  const staffPoints = getRenderedGhostStaffPoints(grid, 'm1', 1);
  assert.equal(Math.round(staffPoints[0]?.domX ?? 0), 100);
});

test('buildRenderedGhostGrid keeps a sparse late-note system-start snap on the visible note', () => {
  const coreDocument = makeCoreDoc({
    score: {
      id: 's',
      parts: [{
        id: 'p1',
        sourcePartId: 'P1',
        name: 'Part',
        staves: [{
          id: 'st1',
          staffIndex: 1,
          measures: [{
            id: 'm1',
            measureNumber: 1,
            attributes: [{ id: 'a1', divisions: 1, time: { beats: 4, beatType: 4 }, clefs: [] }],
            voices: [{ id: 'v1', voiceId: 1, events: [{
              id: 'late-note',
              kind: 'note',
              measureNumber: 1,
              staffIndex: 1,
              voiceId: 1,
              timestampNum: 3,
              timestampDen: 4,
              durationDivisions: 1,
              durationType: 'quarter',
              pitch: { step: 'F', octave: 4, alter: 0 },
            }] }],
          }],
        }],
      }],
    } as any,
  });

  const grid = buildRenderedGhostGrid([
    makeRenderedNote({
      id: 'late-note',
      measureId: 'm1',
      measureNumber: 1,
      staffIndex: 1,
      voiceId: 1,
      timestampNum: 3,
      timestampDen: 4,
      domX: 238,
      domY: 32,
    }),
  ], {
    coreDocument,
    measureOverlays: [makeOverlay('m1', 1, { x: 90, y: 10, width: 190, height: 40 }, { breakBefore: true })],
    selectedDuration: '4',
  });

  const staffPoints = getRenderedGhostStaffPoints(grid, 'm1', 1);
  assert.deepEqual(
    staffPoints.map((point) => ({
      timestamp: `${point.timestampNum}/${point.timestampDen}`,
      x: Math.round(point.domX),
      synthetic: point.synthetic,
    })),
    [
      { timestamp: '3/4', x: 238, synthetic: false },
    ],
  );
});

test('buildRenderedGhostGrid keeps sparse first-measure note snaps on rendered noteheads', () => {
  const coreDocument = makeCoreDoc({
    score: {
      id: 's',
      parts: [{
        id: 'p1',
        sourcePartId: 'P1',
        name: 'Part',
        staves: [{
          id: 'st1',
          staffIndex: 1,
          measures: [{
            id: 'm1',
            measureNumber: 1,
            attributes: [{ id: 'a1', divisions: 1, time: { beats: 4, beatType: 4 }, clefs: [] }],
            voices: [{ id: 'v1', voiceId: 1, events: [
              {
                id: 'n1',
                kind: 'note',
                measureNumber: 1,
                staffIndex: 1,
                voiceId: 1,
                timestampNum: 0,
                timestampDen: 4,
                durationDivisions: 1,
                durationType: 'quarter',
                pitch: { step: 'C', octave: 4, alter: 0 },
              },
              {
                id: 'n2',
                kind: 'note',
                measureNumber: 1,
                staffIndex: 1,
                voiceId: 1,
                timestampNum: 2,
                timestampDen: 4,
                durationDivisions: 1,
                durationType: 'quarter',
                pitch: { step: 'E', octave: 4, alter: 0 },
              },
            ] }],
          }],
        }],
      }],
    } as any,
  });

  const grid = buildRenderedGhostGrid([
    makeRenderedNote({
      id: 'n1',
      measureId: 'm1',
      measureNumber: 1,
      staffIndex: 1,
      voiceId: 1,
      timestampNum: 0,
      timestampDen: 4,
      domX: 190,
      domY: 32,
    }),
    makeRenderedNote({
      id: 'n2',
      measureId: 'm1',
      measureNumber: 1,
      staffIndex: 1,
      voiceId: 1,
      timestampNum: 2,
      timestampDen: 4,
      domX: 360,
      domY: 32,
    }),
  ], {
    coreDocument,
    measureOverlays: [makeOverlay('m1', 1, { x: 0, y: 0, width: 500, height: 40 }, { breakBefore: true })],
    selectedDuration: '4',
  });

  const staffPoints = getRenderedGhostStaffPoints(grid, 'm1', 1);
  assert.deepEqual(
    staffPoints.map((point) => ({
      timestamp: `${point.timestampNum}/${point.timestampDen}`,
      x: Math.round(point.domX),
      synthetic: point.synthetic,
    })),
    [
      { timestamp: '0/4', x: 190, synthetic: false },
      { timestamp: '2/4', x: 360, synthetic: false },
    ],
  );
});

test('buildRenderedGhostGrid keeps compressed rendered note snaps on visible noteheads', () => {
  const coreDocument = makeCoreDoc({
    score: {
      id: 's',
      parts: [{
        id: 'p1',
        sourcePartId: 'P1',
        name: 'Part',
        staves: [{
          id: 'st1',
          staffIndex: 1,
          measures: [{
            id: 'm1',
            measureNumber: 1,
            attributes: [{ id: 'a1', divisions: 8, time: { beats: 2, beatType: 4 }, clefs: [] }],
            voices: [{ id: 'v1', voiceId: 1, events: [
              {
                id: 'n1',
                kind: 'note',
                measureNumber: 1,
                staffIndex: 1,
                voiceId: 1,
                timestampNum: 0,
                timestampDen: 32,
                durationDivisions: 8,
                durationType: 'quarter',
                pitch: { step: 'C', octave: 5, alter: 0 },
              },
              {
                id: 'n2',
                kind: 'note',
                measureNumber: 1,
                staffIndex: 1,
                voiceId: 1,
                timestampNum: 8,
                timestampDen: 32,
                durationDivisions: 4,
                durationType: 'eighth',
                pitch: { step: 'D', octave: 5, alter: 0 },
              },
              {
                id: 'r1',
                kind: 'rest',
                measureNumber: 1,
                staffIndex: 1,
                voiceId: 1,
                timestampNum: 12,
                timestampDen: 32,
                durationDivisions: 4,
                durationType: 'eighth',
              },
            ] }],
          }],
        }],
      }],
    } as any,
  });

  const grid = buildRenderedGhostGrid([
    makeRenderedNote({
      id: 'n1',
      measureId: 'm1',
      measureNumber: 1,
      staffIndex: 1,
      voiceId: 1,
      timestampNum: 0,
      timestampDen: 32,
      domX: 190,
      domY: 32,
    }),
    makeRenderedNote({
      id: 'n2',
      measureId: 'm1',
      measureNumber: 1,
      staffIndex: 1,
      voiceId: 1,
      timestampNum: 8,
      timestampDen: 32,
      domX: 208,
      domY: 32,
    }),
    makeRenderedNote({
      id: 'r1',
      measureId: 'm1',
      measureNumber: 1,
      staffIndex: 1,
      voiceId: 1,
      timestampNum: 12,
      timestampDen: 32,
      domX: 217,
      domY: 32,
      isRest: true,
    }),
  ], {
    coreDocument,
    measureOverlays: [makeOverlay('m1', 1, { x: 180, y: 0, width: 134, height: 40 }, { breakBefore: true })],
    selectedDuration: '8',
  });

  const staffPoints = getRenderedGhostStaffPoints(grid, 'm1', 1);
  assert.deepEqual(
    staffPoints.filter((point) => !point.synthetic).map((point) => ({
      timestamp: `${point.timestampNum}/${point.timestampDen}`,
      x: Math.round(point.domX),
    })),
    [
      { timestamp: '0/32', x: 190 },
      { timestamp: '8/32', x: 208 },
      { timestamp: '12/32', x: 283 },
    ],
  );
});

test('buildRenderedGhostGrid repositions a trailing rest anchor from note-derived timing', () => {
  const coreDocument = makeCoreDoc({
    score: {
      id: 's',
      parts: [{
        id: 'p1',
        sourcePartId: 'P1',
        name: 'Part',
        staves: [{
          id: 'st1',
          staffIndex: 1,
          measures: [{
            id: 'm1',
            measureNumber: 1,
            attributes: [{ id: 'a1', divisions: 8, time: { beats: 4, beatType: 4 }, clefs: [] }],
            voices: [{ id: 'v1', voiceId: 1, events: [
              {
                id: 'n1',
                kind: 'note',
                measureNumber: 1,
                staffIndex: 1,
                voiceId: 1,
                timestampNum: 0,
                timestampDen: 32,
                durationDivisions: 8,
                durationType: 'quarter',
                isChord: false,
                pitch: { step: 'E', octave: 5, alter: 0 },
              },
              {
                id: 'n2',
                kind: 'note',
                measureNumber: 1,
                staffIndex: 1,
                voiceId: 1,
                timestampNum: 8,
                timestampDen: 32,
                durationDivisions: 8,
                durationType: 'quarter',
                isChord: false,
                pitch: { step: 'E', octave: 5, alter: 0 },
              },
              {
                id: 'r1',
                kind: 'rest',
                measureNumber: 1,
                staffIndex: 1,
                voiceId: 1,
                timestampNum: 16,
                timestampDen: 32,
                durationDivisions: 16,
                durationType: 'half',
                isChord: false,
              },
            ] }],
          }],
        }],
      }],
    } as any,
  });

  const grid = buildRenderedGhostGrid([
    makeRenderedNote({
      id: 'n1',
      measureId: 'm1',
      measureNumber: 1,
      staffIndex: 1,
      voiceId: 1,
      timestampNum: 0,
      timestampDen: 32,
      domX: 250,
      domY: 32,
    }),
    makeRenderedNote({
      id: 'n2',
      measureId: 'm1',
      measureNumber: 1,
      staffIndex: 1,
      voiceId: 1,
      timestampNum: 8,
      timestampDen: 32,
      domX: 275,
      domY: 32,
    }),
    makeRenderedNote({
      id: 'r1',
      measureId: 'm1',
      measureNumber: 1,
      staffIndex: 1,
      voiceId: 1,
      timestampNum: 16,
      timestampDen: 32,
      domX: 225,
      domY: 32,
      isRest: true,
    }),
  ], {
    coreDocument,
    measureOverlays: [makeOverlay('m1', 1, { x: 180, y: 0, width: 180, height: 40 }, { breakBefore: true })],
    selectedDuration: '4',
  });

  const staffPoints = getRenderedGhostStaffPoints(grid, 'm1', 1);
  const halfRest = staffPoints.find((point) => point.isRest && point.timestampNum === 16 && point.timestampDen === 32);
  assert.ok(halfRest);
  assert.ok(halfRest.domX > 275, `expected trailing rest anchor after second note, got ${halfRest.domX}`);
});

test('buildRenderedGhostGrid infers visual system starts before clamping leading rest snaps', () => {
  const coreDocument = makeCoreDoc({
    score: {
      id: 's',
      parts: [{
        id: 'p1',
        sourcePartId: 'P1',
        name: 'Part',
        staves: [{
          id: 'st1',
          staffIndex: 1,
          measures: [
            {
              id: 'm1',
              measureNumber: 1,
              attributes: [{ id: 'a1', divisions: 8, time: { beats: 4, beatType: 4 }, clefs: [] }],
              voices: [{ id: 'v1', voiceId: 1, events: [{
                id: 'n1',
                kind: 'note',
                measureNumber: 1,
                staffIndex: 1,
                voiceId: 1,
                timestampNum: 0,
                timestampDen: 32,
                durationDivisions: 8,
                durationType: 'quarter',
                pitch: { step: 'C', octave: 5, alter: 0 },
              }] }],
            },
            {
              id: 'm2',
              measureNumber: 2,
              attributes: [{ id: 'a2', divisions: 8, time: { beats: 4, beatType: 4 }, clefs: [] }],
              voices: [{ id: 'v2', voiceId: 1, events: [
                {
                  id: 'r2',
                  kind: 'rest',
                  measureNumber: 2,
                  staffIndex: 1,
                  voiceId: 1,
                  timestampNum: 0,
                  timestampDen: 32,
                  durationDivisions: 12,
                  durationType: 'quarter',
                  isDotted: true,
                },
                {
                  id: 'n2',
                  kind: 'note',
                  measureNumber: 2,
                  staffIndex: 1,
                  voiceId: 1,
                  timestampNum: 12,
                  timestampDen: 32,
                  durationDivisions: 8,
                  durationType: 'quarter',
                  pitch: { step: 'D', octave: 5, alter: 0 },
                },
              ] }],
            },
          ],
        }],
      }],
    } as any,
  });

  const grid = buildRenderedGhostGrid([
    makeRenderedNote({
      id: 'n1',
      measureId: 'm1',
      measureNumber: 1,
      staffIndex: 1,
      voiceId: 1,
      timestampNum: 0,
      timestampDen: 32,
      domX: 210,
      domY: 32,
    }),
    makeRenderedNote({
      id: 'r2',
      measureId: 'm2',
      measureNumber: 2,
      staffIndex: 1,
      voiceId: 1,
      timestampNum: 0,
      timestampDen: 32,
      domX: 105,
      domY: 132,
      isRest: true,
    }),
    makeRenderedNote({
      id: 'n2',
      measureId: 'm2',
      measureNumber: 2,
      staffIndex: 1,
      voiceId: 1,
      timestampNum: 12,
      timestampDen: 32,
      domX: 214,
      domY: 132,
    }),
  ], {
    coreDocument,
    measureOverlays: [
      makeOverlay('m1', 1, { x: 180, y: 0, width: 130, height: 40 }),
      makeOverlay('m2', 2, { x: 100, y: 100, width: 220, height: 40 }),
    ],
    selectedDuration: '4',
  });

  const leadingRest = getRenderedGhostStaffPoints(grid, 'm2', 1)
    .find((point) => point.id === 'r2');
  assert.ok(leadingRest);
  assert.ok(leadingRest.domX >= 166, `expected leading rest snap outside clef area, got ${leadingRest.domX}`);
});

test('buildRenderedGhostGrid keeps a narrow system-start whole-rest measure to one rhythmic snap', () => {
  const coreDocument = makeCoreDoc({
    score: {
      id: 's',
      parts: [{
        id: 'p1',
        sourcePartId: 'P1',
        name: 'Part',
        staves: [{
          id: 'st1',
          staffIndex: 1,
          measures: [{
            id: 'm3',
            measureNumber: 3,
            attributes: [{ id: 'a3', divisions: 1, time: { beats: 4, beatType: 4 }, clefs: [] }],
            voices: [{ id: 'v1', voiceId: 1, events: [{ id: 'r1', kind: 'rest', measureNumber: 3, staffIndex: 1, voiceId: 1, timestampNum: 0, timestampDen: 4, durationDivisions: 4, durationType: 'whole', isDotted: false }] }],
          }],
        }],
      }],
    } as any,
  });

  const grid = buildRenderedGhostGrid([
    makeRenderedNote({
      id: 'whole-rest',
      measureId: 'm3',
      measureNumber: 3,
      staffIndex: 1,
      voiceId: 1,
      timestampNum: 0,
      timestampDen: 4,
      domX: 373,
      domY: 32,
      isRest: true,
    }),
  ], {
    coreDocument,
    measureOverlays: [makeOverlay('m3', 3, { x: 337, y: 0, width: 71, height: 40 }, { breakBefore: true })],
    selectedDuration: '4',
  });

  const staffPoints = getRenderedGhostStaffPoints(grid, 'm3', 1);
  const xs = staffPoints.map((point) => Math.round(point.domX));
  assert.deepEqual(
    staffPoints.map((point) => `${point.timestampNum}/${point.timestampDen}`),
    ['0/4'],
  );
  assert.ok(xs[0]! >= 337);

  const snapped = findNearestRenderedGhostPoint(grid, {
    measureId: 'm3',
    staffIndex: 1,
    pointerX: xs[0]!,
  });
  assert.equal(snapped?.timestampNum, 0);
  assert.equal(snapped?.timestampDen, 4);
});

test('buildRenderedGhostGrid keeps a whole-rest measure to one snap when rest slots are exposed', () => {
  const coreDocument = makeCoreDoc({
    score: {
      id: 's',
      parts: [{
        id: 'p1',
        sourcePartId: 'P1',
        name: 'Part',
        staves: [{
          id: 'st1',
          staffIndex: 1,
          measures: [{
            id: 'm3',
            measureNumber: 3,
            attributes: [{ id: 'a3', divisions: 1, time: { beats: 4, beatType: 4 }, clefs: [] }],
            voices: [{ id: 'v1', voiceId: 1, events: [{ id: 'r1', kind: 'rest', measureNumber: 3, staffIndex: 1, voiceId: 1, timestampNum: 0, timestampDen: 4, durationDivisions: 4, durationType: 'whole', isDotted: false }] }],
          }],
        }],
      }],
    } as any,
  });

  const grid = buildRenderedGhostGrid([
    makeRenderedNote({
      id: 'whole-rest',
      measureId: 'm3',
      measureNumber: 3,
      staffIndex: 1,
      voiceId: 1,
      timestampNum: 0,
      timestampDen: 4,
      domX: 373,
      domY: 32,
      isRest: true,
    }),
  ], {
    coreDocument,
    measureOverlays: [makeOverlay('m3', 3, { x: 337, y: 0, width: 120, height: 40 }, { breakBefore: true })],
    selectedDuration: '4',
    exposeRestMeasureSlots: true,
  });

  const staffPoints = getRenderedGhostStaffPoints(grid, 'm3', 1);
  assert.deepEqual(
    staffPoints.map((point) => `${point.timestampNum}/${point.timestampDen}`),
    ['0/4'],
  );
});

test('buildRenderedGhostGrid maps rest-only measures from existing rhythmic rests', () => {
  const coreDocument = makeCoreDoc({
    score: {
      id: 's',
      parts: [{
        id: 'p1',
        sourcePartId: 'P1',
        name: 'Part',
        staves: [{
          id: 'st1',
          staffIndex: 1,
          measures: [{
            id: 'm4',
            measureNumber: 4,
            attributes: [{ id: 'a4', divisions: 2, time: { beats: 4, beatType: 4 }, clefs: [] }],
            voices: [{ id: 'v1', voiceId: 1, events: [
              { id: 'r1', kind: 'rest', measureNumber: 4, staffIndex: 1, voiceId: 1, timestampNum: 0, timestampDen: 8, durationDivisions: 4, durationType: 'half' },
              { id: 'r2', kind: 'rest', measureNumber: 4, staffIndex: 1, voiceId: 1, timestampNum: 4, timestampDen: 8, durationDivisions: 2, durationType: 'quarter' },
              { id: 'r3', kind: 'rest', measureNumber: 4, staffIndex: 1, voiceId: 1, timestampNum: 6, timestampDen: 8, durationDivisions: 2, durationType: 'quarter' },
            ] }],
          }],
        }],
      }],
    } as any,
  });

  const grid = buildRenderedGhostGrid([
    makeRenderedNote({
      id: 'r1',
      measureId: 'm4',
      measureNumber: 4,
      staffIndex: 1,
      voiceId: 1,
      timestampNum: 0,
      timestampDen: 8,
      domX: 140,
      domY: 32,
      isRest: true,
    }),
    makeRenderedNote({
      id: 'r2',
      measureId: 'm4',
      measureNumber: 4,
      staffIndex: 1,
      voiceId: 1,
      timestampNum: 4,
      timestampDen: 8,
      domX: 220,
      domY: 32,
      isRest: true,
    }),
    makeRenderedNote({
      id: 'r3',
      measureId: 'm4',
      measureNumber: 4,
      staffIndex: 1,
      voiceId: 1,
      timestampNum: 6,
      timestampDen: 8,
      domX: 280,
      domY: 32,
      isRest: true,
    }),
  ], {
    coreDocument,
    measureOverlays: [makeOverlay('m4', 4, { x: 100, y: 0, width: 240, height: 40 })],
    selectedDuration: '4',
    exposeRestMeasureSlots: true,
  });

  const staffPoints = getRenderedGhostStaffPoints(grid, 'm4', 1);
  assert.deepEqual(
    staffPoints.map((point) => `${point.timestampNum}/${point.timestampDen}`),
    ['0/8', '4/8', '6/8'],
  );
});

test('buildRenderedGhostGrid does not add later quarter anchors across a mixed note-plus-rest measure', () => {
  const coreDocument = makeCoreDoc({
    score: {
      id: 's',
      parts: [{
        id: 'p1',
        sourcePartId: 'P1',
        name: 'Part',
        staves: [{
          id: 'st1',
          staffIndex: 1,
          measures: [{
            id: 'm2',
            measureNumber: 2,
            attributes: [{ id: 'a2', divisions: 8, time: { beats: 4, beatType: 4 }, clefs: [] }],
            voices: [{ id: 'v1', voiceId: 1, events: [
              {
                id: 'n1',
                kind: 'note',
                measureNumber: 2,
                staffIndex: 1,
                voiceId: 1,
                timestampNum: 0,
                timestampDen: 32,
                durationDivisions: 8,
                durationType: 'quarter',
                pitch: { step: 'D', octave: 5, alter: 0 },
              },
              {
                id: 'r1',
                kind: 'rest',
                measureNumber: 2,
                staffIndex: 1,
                voiceId: 1,
                timestampNum: 8,
                timestampDen: 32,
                durationDivisions: 24,
                durationType: 'half',
                isDotted: true,
              },
            ] }],
          }],
        }],
      }],
    } as any,
  });

  const grid = buildRenderedGhostGrid([
    makeRenderedNote({
      id: 'n1',
      measureId: 'm2',
      measureNumber: 2,
      staffIndex: 1,
      voiceId: 1,
      timestampNum: 0,
      timestampDen: 32,
      domX: 340,
      domY: 345,
    }),
    makeRenderedNote({
      id: 'r1',
      measureId: 'm2',
      measureNumber: 2,
      staffIndex: 1,
      voiceId: 1,
      timestampNum: 8,
      timestampDen: 32,
      domX: 358,
      domY: 345,
      isRest: true,
    }),
  ], {
    coreDocument,
    measureOverlays: [makeOverlay('m2', 2, { x: 331, y: 332, width: 71, height: 41 })],
    selectedDuration: '4',
  });

  const staffPoints = getRenderedGhostStaffPoints(grid, 'm2', 1);
  assert.deepEqual(staffPoints.map((point) => ({ ts: `${point.timestampNum}/${point.timestampDen}`, x: Math.round(point.domX), synthetic: point.synthetic })), [
    { ts: '0/32', x: 340, synthetic: false },
    { ts: '8/32', x: 356, synthetic: false },
  ]);

  const snapped = findNearestRenderedGhostPoint(grid, {
    measureId: 'm2',
    staffIndex: 1,
    pointerX: 371,
  });
  assert.equal(snapped?.timestampNum, 8);
  assert.equal(snapped?.timestampDen, 32);
  assert.equal(snapped?.synthetic, false);
});

test('buildRenderedGhostGrid keeps a leading rest snap before following note anchors', () => {
  const coreDocument = makeCoreDoc({
    score: {
      id: 's',
      parts: [{
        id: 'p1',
        sourcePartId: 'P1',
        name: 'Part',
        staves: [{
          id: 'st1',
          staffIndex: 1,
          measures: [{
            id: 'm24',
            measureNumber: 24,
            attributes: [{ id: 'a24', divisions: 8, time: { beats: 7, beatType: 8 }, clefs: [] }],
            voices: [{ id: 'v1', voiceId: 1, events: [
              {
                id: 'r0',
                kind: 'rest',
                measureNumber: 24,
                staffIndex: 1,
                voiceId: 1,
                timestampNum: 0,
                timestampDen: 32,
                durationDivisions: 4,
                durationType: 'eighth',
              },
              {
                id: 'n1',
                kind: 'note',
                measureNumber: 24,
                staffIndex: 1,
                voiceId: 1,
                timestampNum: 4,
                timestampDen: 32,
                durationDivisions: 4,
                durationType: 'eighth',
                pitch: { step: 'D', octave: 5, alter: 0 },
              },
            ] }],
          }],
        }],
      }],
    } as any,
  });

  const grid = buildRenderedGhostGrid([
    makeRenderedNote({
      id: 'r0',
      measureId: 'm24',
      measureNumber: 24,
      staffIndex: 1,
      voiceId: 1,
      timestampNum: 0,
      timestampDen: 32,
      domX: 578,
      domY: 96,
      isRest: true,
    }),
    makeRenderedNote({
      id: 'n1',
      measureId: 'm24',
      measureNumber: 24,
      staffIndex: 1,
      voiceId: 1,
      timestampNum: 4,
      timestampDen: 32,
      domX: 138,
      domY: 80,
    }),
  ], {
    coreDocument,
    measureOverlays: [makeOverlay('m24', 24, { x: 112, y: 64, width: 526, height: 80 }, { breakBefore: true })],
    selectedDuration: '4',
  });

  const staffPoints = getRenderedGhostStaffPoints(grid, 'm24', 1);
  const rest = staffPoints.find((point) => point.isRest && point.timestampNum === 0);
  const note = staffPoints.find((point) => !point.isRest && point.timestampNum === 4);
  assert.ok(rest);
  assert.ok(note);
  assert.ok(rest.domX < note.domX, `rest x=${rest.domX} note x=${note.domX}`);
});

test('buildRenderedGhostGrid exposes trailing rest-end anchors without synthetic visible slots', () => {
  const coreDocument = makeCoreDoc({
    score: {
      id: 's',
      parts: [{
        id: 'p1',
        sourcePartId: 'P1',
        name: 'Part',
        staves: [{
          id: 'st1',
          staffIndex: 1,
          measures: [{
            id: 'm1',
            measureNumber: 1,
            attributes: [{ id: 'a1', divisions: 8, time: { beats: 3, beatType: 4 }, clefs: [] }],
            voices: [{ id: 'v1', voiceId: 1, events: [
              {
                id: 'n1',
                kind: 'note',
                measureNumber: 1,
                staffIndex: 1,
                voiceId: 1,
                timestampNum: 0,
                timestampDen: 32,
                durationDivisions: 8,
                durationType: 'quarter',
                pitch: { step: 'G', octave: 4, alter: 0 },
              },
              {
                id: 'n2',
                kind: 'note',
                measureNumber: 1,
                staffIndex: 1,
                voiceId: 1,
                timestampNum: 8,
                timestampDen: 32,
                durationDivisions: 4,
                durationType: 'eighth',
                pitch: { step: 'B', octave: 4, alter: 0 },
              },
              {
                id: 'r1',
                kind: 'rest',
                measureNumber: 1,
                staffIndex: 1,
                voiceId: 1,
                timestampNum: 12,
                timestampDen: 32,
                durationDivisions: 4,
                durationType: 'eighth',
              },
            ] }],
          }],
        }],
      }],
    } as any,
  });

  const grid = buildRenderedGhostGrid([
    makeRenderedNote({
      id: 'n1',
      measureId: 'm1',
      measureNumber: 1,
      staffIndex: 1,
      voiceId: 1,
      timestampNum: 0,
      timestampDen: 32,
      domX: 220,
      domY: 32,
    }),
    makeRenderedNote({
      id: 'n2',
      measureId: 'm1',
      measureNumber: 1,
      staffIndex: 1,
      voiceId: 1,
      timestampNum: 8,
      timestampDen: 32,
      domX: 280,
      domY: 32,
    }),
    makeRenderedNote({
      id: 'r1',
      measureId: 'm1',
      measureNumber: 1,
      staffIndex: 1,
      voiceId: 1,
      timestampNum: 12,
      timestampDen: 32,
      domX: 310,
      domY: 32,
      isRest: true,
    }),
  ], {
    coreDocument,
    measureOverlays: [makeOverlay('m1', 1, { x: 180, y: 0, width: 240, height: 40 }, { breakBefore: true })],
    selectedDuration: '4',
    exposeRestMeasureSlots: true,
  });

  const staffPoints = getRenderedGhostStaffPoints(grid, 'm1', 1, { includeSynthetic: true });
  const trailingRestEndAnchor = staffPoints.find((point) => (
    !point.synthetic
    && point.isRest
    && point.timestampNum === 1
    && point.timestampDen === 2
  ));
  assert.ok(trailingRestEndAnchor, 'expected a visible rest-end anchor at beat 3 in the trailing gap');
  assert.ok(trailingRestEndAnchor.domX > 300, `expected trailing rest-end anchor after visible rest, got ${trailingRestEndAnchor.domX}`);
  assert.equal(
    staffPoints.some((point) => (
      point.synthetic
      && point.timestampNum === 1
      && point.timestampDen === 2
    )),
    false,
  );
});
