import test from 'node:test';
import assert from 'node:assert/strict';

import { GeometryProxy, buildStaffDetailsByMeasure } from '../src/score-core/GeometryProxy.ts';
import type { RenderedMeasureLayoutOverlay } from '../src/render-bridge/osmd/layout-plan-bridge.ts';
import { buildRenderedGhostGrid } from '../src/render-bridge/osmd/rendered-ghost-grid.ts';
import type { RenderedNote } from '../src/render-bridge/osmd/note-selection.ts';
import type { ScoreDocumentModel } from '../src/score-core/model/types.ts';

/**
 * Minimal CTM + SVG/container stubs. The CTM applies a scale and translate so
 * the SVG → DOM mapping is non-trivial (catches identity-only regressions).
 *
 *   screen.x = a * svg.x + c * svg.y + e
 *   screen.y = b * svg.x + d * svg.y + f
 */
function makeContainer(opts: {
  ctm?: { a: number; b: number; c: number; d: number; e: number; f: number };
  containerRect?: { left: number; top: number };
}) {
  const ctm = opts.ctm ?? { a: 1, b: 0, c: 0, d: 1, e: 0, f: 0 };
  const containerRect = opts.containerRect ?? { left: 0, top: 0 };

  const svgLike = {
    getScreenCTM: () => ctm,
    createSVGPoint: () => {
      const point = { x: 0, y: 0 } as { x: number; y: number; matrixTransform: (m: any) => { x: number; y: number } };
      point.matrixTransform = (m) => ({
        x: m.a * point.x + m.c * point.y + m.e,
        y: m.b * point.x + m.d * point.y + m.f,
      });
      return point;
    },
  };

  const container = {
    querySelector: (sel: string) => (sel === 'svg' ? svgLike : null),
    getBoundingClientRect: () => ({ left: containerRect.left, top: containerRect.top }),
  } as unknown as HTMLElement;

  return { container, svgLike };
}

function makeGraphicalMeasure(opts: {
  measureNumber: number;
  staffIndex: number;
  absX: number;
  absY: number;
  width: number;
  height: number;
  lineCount?: number;
  staveLineYs?: number[];
}) {
  const staveLineYs = opts.staveLineYs ?? null;
  return {
    MeasureNumber: opts.measureNumber,
    ParentStaff: { Id: opts.staffIndex, stafflineCount: opts.lineCount ?? 5 },
    stave: staveLineYs ? {
      getYForLine: (index: number) => staveLineYs[index] ?? staveLineYs[staveLineYs.length - 1],
    } : undefined,
    PositionAndShape: {
      AbsolutePosition: { x: opts.absX, y: opts.absY },
      Size: { width: opts.width, height: opts.height },
    },
  };
}

function makeOsmd(measures: ReturnType<typeof makeGraphicalMeasure>[][]) {
  return { GraphicSheet: { MeasureList: measures } };
}

function makeOverlay(
  measureId: string,
  measureNumber: number,
  rect: { x: number; y: number; width: number; height: number },
): RenderedMeasureLayoutOverlay {
  return {
    measureId,
    measureNumber,
    systemIndex: 0,
    pageIndex: 0,
    widthWeight: 1,
    domRect: rect,
    breakBefore: false,
    pageBreakBefore: false,
    staffSpacing: null,
  };
}

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

test('GeometryProxy extracts staff lines through a non-identity CTM', () => {
  const { container } = makeContainer({
    ctm: { a: 2, b: 0, c: 0, d: 2, e: 10, f: 20 },
    containerRect: { left: 5, top: 7 },
  });
  const osmd = makeOsmd([[
    makeGraphicalMeasure({ measureNumber: 1, staffIndex: 1, absX: 0, absY: 0, width: 50, height: 20 }),
  ]]);
  const overlay = makeOverlay('m1', 1, { x: 5, y: 13, width: 100, height: 40 });

  const proxy = new GeometryProxy();
  proxy.update({ osmd, container, coreDocument: null, measureOverlays: [overlay] });

  const [measure] = proxy.getAugmentedMeasures();
  assert.equal(measure.isVirtual, false);
  assert.equal(measure.staffDetails.length, 1);
  const [staff] = measure.staffDetails;
  // top: svg(0,0) → screen(10,20) → container(5,13). bottom: svg(0,20) → screen(10,60) → container(5,53).
  assert.equal(staff.topLineDomY, 13);
  assert.equal(staff.bottomLineDomY, 53);
  assert.equal(staff.lineDistanceDom, 10); // (53 - 13) / 4 gaps
});

test('GeometryProxy prefers rendered stave lines over GraphicalMeasure height when available', () => {
  const { container } = makeContainer({
    ctm: { a: 1, b: 0, c: 0, d: 2, e: 0, f: 0 },
  });
  const osmd = makeOsmd([[
    makeGraphicalMeasure({
      measureNumber: 1,
      staffIndex: 1,
      absX: 10,
      absY: 5,
      width: 50,
      height: 6,
      staveLineYs: [20, 25, 30, 35, 40],
    }),
  ]]);
  const overlay = makeOverlay('m1', 1, { x: 10, y: 40, width: 50, height: 40 });

  const proxy = new GeometryProxy();
  proxy.update({ osmd, container, coreDocument: null, measureOverlays: [overlay] });

  const [measure] = proxy.getAugmentedMeasures();
  const [staff] = measure.staffDetails;
  assert.equal(staff.topLineDomY, 40);
  assert.equal(staff.bottomLineDomY, 80);
  assert.equal(staff.lineDistanceDom, 10);
});

test('buildStaffDetailsByMeasure keeps repeated staff indexes on separate instrument rows', () => {
  const { container } = makeContainer({});
  const osmd = makeOsmd([[
    makeGraphicalMeasure({ measureNumber: 1, staffIndex: 1, absX: 0, absY: 0, width: 100, height: 40 }),
    makeGraphicalMeasure({ measureNumber: 1, staffIndex: 1, absX: 0, absY: 80, width: 100, height: 40 }),
  ]]);

  const details = buildStaffDetailsByMeasure(osmd, container).get(1) ?? [];

  assert.equal(details.length, 2);
  assert.deepEqual(details.map((detail) => detail.staffIndex), [1, 1]);
  assert.deepEqual(details.map((detail) => detail.topLineDomY), [0, 80]);
});

test('getDetailedContext returns null outside any measure and a populated context inside', () => {
  const { container } = makeContainer({});
  const osmd = makeOsmd([[
    makeGraphicalMeasure({ measureNumber: 1, staffIndex: 1, absX: 0, absY: 0, width: 100, height: 40 }),
  ]]);
  const overlay = makeOverlay('m1', 1, { x: 0, y: 0, width: 100, height: 40 });

  const proxy = new GeometryProxy();
  proxy.update({ osmd, container, coreDocument: null, measureOverlays: [overlay] });

  assert.equal(proxy.getDetailedContext({ x: -5, y: -5 }), null);

  const ctx = proxy.getDetailedContext({ x: 50, y: 20 })!;
  assert.ok(ctx);
  assert.equal(ctx.measure.measureNumber, 1);
  assert.equal(ctx.relX, 0.5);
  assert.equal(ctx.relY, 0.5);
  assert.equal(ctx.staff?.staffIndex, 1);
  // middle of staff (y=20) → (20-0)/5 = 4 half-steps below top line.
  assert.equal(ctx.staffStep, 4);
  assert.equal(ctx.activeTuplet, null);
});

test('getDetailedContext snaps musical time from the rendered ghost grid instead of linear measure width', () => {
  const { container } = makeContainer({});
  const osmd = makeOsmd([[
    makeGraphicalMeasure({ measureNumber: 1, staffIndex: 1, absX: 0, absY: 0, width: 200, height: 40 }),
  ]]);
  const overlay = makeOverlay('m1', 1, { x: 0, y: 0, width: 200, height: 40 });
  const renderedGhostGrid = buildRenderedGhostGrid([
    makeRenderedNote({
      id: 'rest-start',
      measureId: 'm1',
      measureNumber: 1,
      staffIndex: 1,
      voiceId: 1,
      timestampNum: 0,
      timestampDen: 4,
      domX: 30,
      domY: 20,
      isRest: true,
    }),
    makeRenderedNote({
      id: 'beat-two',
      measureId: 'm1',
      measureNumber: 1,
      staffIndex: 1,
      voiceId: 1,
      timestampNum: 1,
      timestampDen: 4,
      domX: 150,
      domY: 20,
    }),
  ]);

  const proxy = new GeometryProxy();
  proxy.update({ osmd, container, coreDocument: null, measureOverlays: [overlay], renderedGhostGrid });

  const ctx = proxy.getDetailedContext({ x: 142, y: 20 })!;
  assert.ok(ctx.snapPoint);
  assert.equal(ctx.snapPoint?.timestampNum, 1);
  assert.equal(ctx.snapPoint?.timestampDen, 4);
  assert.deepEqual(ctx.musicalTime, { num: 1, den: 4 });
});

test('getDetailedContext uses non-linear rendered X positions for wide-chord snapping in 4/4', () => {
  const { container } = makeContainer({});
  const osmd = makeOsmd([[
    makeGraphicalMeasure({ measureNumber: 1, staffIndex: 1, absX: 0, absY: 0, width: 200, height: 40 }),
  ]]);
  const overlay = makeOverlay('m1', 1, { x: 0, y: 0, width: 200, height: 40 });
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
            voices: [],
          }],
        }],
      }],
    } as any,
  });
  const renderedGhostGrid = buildRenderedGhostGrid([
    makeRenderedNote({
      id: 'beat1-wide-chord',
      measureId: 'm1',
      measureNumber: 1,
      staffIndex: 1,
      voiceId: 1,
      timestampNum: 0,
      timestampDen: 4,
      domX: 10,
      domY: 20,
    }),
    makeRenderedNote({
      id: 'beat2-note',
      measureId: 'm1',
      measureNumber: 1,
      staffIndex: 1,
      voiceId: 1,
      timestampNum: 1,
      timestampDen: 4,
      domX: 150,
      domY: 20,
    }),
    makeRenderedNote({
      id: 'beat3-note',
      measureId: 'm1',
      measureNumber: 1,
      staffIndex: 1,
      voiceId: 1,
      timestampNum: 2,
      timestampDen: 4,
      domX: 175,
      domY: 20,
    }),
    makeRenderedNote({
      id: 'beat4-note',
      measureId: 'm1',
      measureNumber: 1,
      staffIndex: 1,
      voiceId: 1,
      timestampNum: 3,
      timestampDen: 4,
      domX: 190,
      domY: 20,
    }),
  ]);

  const linearProxy = new GeometryProxy();
  linearProxy.update({ osmd, container, coreDocument, measureOverlays: [overlay] });
  const linearMidpoint = linearProxy.getDetailedContext({ x: 100, y: 20 })!;
  assert.equal(linearMidpoint.relX, 0.5);
  assert.equal(linearMidpoint.snapPoint, null);
  assert.deepEqual(linearMidpoint.musicalTime, { num: 240, den: 480 });

  const proxy = new GeometryProxy();
  proxy.update({ osmd, container, coreDocument, measureOverlays: [overlay], renderedGhostGrid });

  const nearBeat2 = proxy.getDetailedContext({ x: 148, y: 20 })!;
  assert.deepEqual(nearBeat2.musicalTime, { num: 1, den: 4 });
  assert.equal(nearBeat2.snapPoint?.id, 'beat2-note');
  assert.equal(nearBeat2.snapPoint?.domX, 150);

  const midpoint = proxy.getDetailedContext({ x: 100, y: 20 })!;
  assert.equal(midpoint.relX, 0.5, 'the hover stays at the mathematical middle of the measure');
  assert.deepEqual(midpoint.musicalTime, { num: 1, den: 4 });
  assert.equal(midpoint.snapPoint?.id, 'beat2-note');
  assert.equal(midpoint.snapPoint?.timestampNum, 1);
  assert.equal(midpoint.snapPoint?.timestampDen, 4);
  assert.equal(midpoint.snapPoint?.domX, 150);
  assert.notDeepEqual(midpoint.musicalTime, linearMidpoint.musicalTime);
});

test('getDetailedContext honors preferred staff until hysteresis is exceeded', () => {
  const { container } = makeContainer({});
  const osmd = makeOsmd([[
    makeGraphicalMeasure({ measureNumber: 1, staffIndex: 1, absX: 0, absY: 0, width: 100, height: 40 }),
    makeGraphicalMeasure({ measureNumber: 1, staffIndex: 2, absX: 0, absY: 60, width: 100, height: 40 }),
  ]]);
  const overlay = makeOverlay('m1', 1, { x: 0, y: 0, width: 100, height: 100 });

  const proxy = new GeometryProxy();
  proxy.update({ osmd, container, coreDocument: null, measureOverlays: [overlay] });

  const sticky = proxy.getDetailedContext({ x: 50, y: 52 }, { preferredStaffIndex: 1, hysteresisPx: 8 })!;
  assert.equal(sticky.staff?.staffIndex, 1);

  const switched = proxy.getDetailedContext({ x: 50, y: 70 }, { preferredStaffIndex: 1, hysteresisPx: 8 })!;
  assert.equal(switched.staff?.staffIndex, 2);
});

test('getDetailedContext isolates rendered ghost snapping to the hovered staff in a grand staff', () => {
  const { container } = makeContainer({});
  const osmd = makeOsmd([[
    makeGraphicalMeasure({ measureNumber: 1, staffIndex: 1, absX: 0, absY: 0, width: 200, height: 40 }),
    makeGraphicalMeasure({ measureNumber: 1, staffIndex: 2, absX: 0, absY: 70, width: 200, height: 40 }),
  ]]);
  const overlay = makeOverlay('m1', 1, { x: 0, y: 0, width: 200, height: 110 });
  const renderedGhostGrid = buildRenderedGhostGrid([
    makeRenderedNote({
      id: 'treble-16th-1',
      measureId: 'm1',
      measureNumber: 1,
      staffIndex: 1,
      voiceId: 1,
      timestampNum: 0,
      timestampDen: 4,
      domX: 20,
      domY: 20,
    }),
    makeRenderedNote({
      id: 'treble-16th-2',
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
      id: 'treble-16th-3',
      measureId: 'm1',
      measureNumber: 1,
      staffIndex: 1,
      voiceId: 1,
      timestampNum: 2,
      timestampDen: 16,
      domX: 80,
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

  const proxy = new GeometryProxy();
  proxy.update({ osmd, container, coreDocument: null, measureOverlays: [overlay], renderedGhostGrid });

  const ctx = proxy.getDetailedContext({ x: 50, y: 88 })!;
  assert.equal(ctx.staff?.staffIndex, 2);
  assert.equal(ctx.snapPoint?.id, 'bass-half-start');
  assert.equal(ctx.snapPoint?.staffIndex, 2);
  assert.equal(ctx.snapPoint?.timestampNum, 0);
  assert.equal(ctx.snapPoint?.timestampDen, 4);
});

test('getDetailedContext does not borrow snap points from another staff when the hovered staff is empty', () => {
  const { container } = makeContainer({});
  const osmd = makeOsmd([[
    makeGraphicalMeasure({ measureNumber: 1, staffIndex: 1, absX: 0, absY: 0, width: 200, height: 40 }),
    makeGraphicalMeasure({ measureNumber: 1, staffIndex: 2, absX: 0, absY: 70, width: 200, height: 40 }),
  ]]);
  const overlay = makeOverlay('m1', 1, { x: 0, y: 0, width: 200, height: 110 });
  const coreDocument = makeCoreDoc({
    score: {
      id: 's',
      parts: [{
        id: 'p1',
        staves: [{
          id: 'st2',
          staffIndex: 2,
          measures: [{
            id: 'm1',
            measureNumber: 1,
            attributes: [{ id: 'a1', divisions: 1, time: { beats: 4, beatType: 4 }, clefs: [] }],
            voices: [],
          }],
        }],
      }],
    } as any,
  });
  const renderedGhostGrid = buildRenderedGhostGrid([
    makeRenderedNote({
      id: 'treble-quarter-1',
      measureId: 'm1',
      measureNumber: 1,
      staffIndex: 1,
      voiceId: 1,
      timestampNum: 0,
      timestampDen: 4,
      domX: 30,
      domY: 20,
    }),
    makeRenderedNote({
      id: 'treble-quarter-2',
      measureId: 'm1',
      measureNumber: 1,
      staffIndex: 1,
      voiceId: 1,
      timestampNum: 2,
      timestampDen: 4,
      domX: 150,
      domY: 20,
    }),
  ]);

  const proxy = new GeometryProxy();
  proxy.update({ osmd, container, coreDocument, measureOverlays: [overlay], renderedGhostGrid });

  const ctx = proxy.getDetailedContext({ x: 150, y: 90 })!;
  assert.equal(ctx.staff?.staffIndex, 2);
  assert.equal(ctx.snapPoint, null);
  assert.deepEqual(ctx.musicalTime, { num: 360, den: 480 });
});

test('getDetailedContext keeps empty measures anchorless in the visible snap grid', () => {
  const { container } = makeContainer({});
  const osmd = makeOsmd([[
    makeGraphicalMeasure({ measureNumber: 7, staffIndex: 1, absX: 200, absY: 0, width: 120, height: 40 }),
  ]]);
  const overlay = makeOverlay('m7', 7, { x: 200, y: 0, width: 120, height: 40 });
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
  const renderedGhostGrid = buildRenderedGhostGrid([], {
    coreDocument,
    measureOverlays: [overlay],
    selectedDuration: '4',
  });

  const proxy = new GeometryProxy();
  proxy.update({ osmd, container, coreDocument, measureOverlays: [overlay], renderedGhostGrid });

  const ctx = proxy.getDetailedContext({ x: 292, y: 20 })!;
  assert.equal(ctx.staff?.staffIndex, 1);
  assert.equal(ctx.snapPoint, null);
});

test('empty-bar fallback synthesizes a virtual overlay from OSMD bounds', () => {
  const { container } = makeContainer({});
  const osmd = makeOsmd([[
    makeGraphicalMeasure({ measureNumber: 7, staffIndex: 1, absX: 200, absY: 0, width: 80, height: 40 }),
  ]]);
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
            id: 'm7-core',
            measureNumber: 7,
            attributes: [],
            voices: [],
          }],
        }],
      }],
    } as any,
  });

  const proxy = new GeometryProxy();
  proxy.update({ osmd, container, coreDocument, measureOverlays: [] });

  const [measure] = proxy.getAugmentedMeasures();
  assert.equal(measure.isVirtual, true);
  assert.equal(measure.measureNumber, 7);
  assert.equal(measure.measureId, 'm7-core');
  assert.deepEqual(measure.domRect, { x: 200, y: 0, width: 80, height: 40 });

  const ctx = proxy.getDetailedContext({ x: 240, y: 20 });
  assert.ok(ctx);
  assert.equal(ctx.measure.isVirtual, true);
});

test('real overlays take precedence and virtuals only fill missing measures', () => {
  const { container } = makeContainer({});
  const osmd = makeOsmd([[
    makeGraphicalMeasure({ measureNumber: 1, staffIndex: 1, absX: 0, absY: 0, width: 100, height: 40 }),
    makeGraphicalMeasure({ measureNumber: 2, staffIndex: 1, absX: 100, absY: 0, width: 100, height: 40 }),
  ]]);
  const overlay1 = makeOverlay('m1-core', 1, { x: 0, y: 0, width: 100, height: 40 });
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
            { id: 'm1-core', measureNumber: 1, attributes: [], voices: [] },
            { id: 'm2-core', measureNumber: 2, attributes: [], voices: [] },
          ],
        }],
      }],
    } as any,
  });

  const proxy = new GeometryProxy();
  proxy.update({ osmd, container, coreDocument, measureOverlays: [overlay1] });

  const measures = proxy.getAugmentedMeasures();
  assert.equal(measures.length, 2);
  const real = measures.find((m) => m.measureNumber === 1)!;
  const virtual = measures.find((m) => m.measureNumber === 2)!;
  assert.equal(real.isVirtual, false);
  assert.equal(real.measureId, 'm1-core');
  assert.equal(virtual.isVirtual, true);
  assert.equal(virtual.measureId, 'm2-core');
});

test('tuplet detection splits spans that cross measure boundaries', () => {
  const { container } = makeContainer({});
  const osmd = makeOsmd([[
    makeGraphicalMeasure({ measureNumber: 1, staffIndex: 1, absX: 0, absY: 0, width: 100, height: 40 }),
    makeGraphicalMeasure({ measureNumber: 2, staffIndex: 1, absX: 100, absY: 0, width: 100, height: 40 }),
  ]]);
  const overlays = [
    makeOverlay('m1-core', 1, { x: 0, y: 0, width: 100, height: 40 }),
    makeOverlay('m2-core', 2, { x: 100, y: 0, width: 100, height: 40 }),
  ];

  const makeEvent = (id: string, measureNumber: number, tsNum: number) => ({
    id, kind: 'note' as const, measureNumber, staffIndex: 1, voiceId: 1,
    timestampNum: tsNum, timestampDen: 4, durationDivisions: 1, isChord: false,
    pitch: { step: 'C', alter: 0, octave: 4 },
  });

  const coreDocument = makeCoreDoc({
    score: {
      id: 's',
      parts: [{
        id: 'p1', sourcePartId: 'P1', name: 'Part',
        staves: [{
          id: 'st1', staffIndex: 1,
          measures: [
            {
              id: 'm1-core', measureNumber: 1,
              attributes: [{ id: 'a1', divisions: 1, time: { beats: 4, beatType: 4 }, clefs: [] }],
              voices: [{ id: 'v1', voiceId: 1, events: [makeEvent('e1', 1, 3)] }],
            },
            {
              id: 'm2-core', measureNumber: 2,
              attributes: [{ id: 'a2', divisions: 1, time: { beats: 4, beatType: 4 }, clefs: [] }],
              voices: [{ id: 'v2', voiceId: 1, events: [makeEvent('e2', 2, 0), makeEvent('e3', 2, 1)] }],
            },
          ],
        }],
      }],
    } as any,
    tuplets: [{ id: 't1', number: 1, eventIds: ['e1', 'e2', 'e3'], actualNotes: 3, normalNotes: 2 }],
  });

  const proxy = new GeometryProxy();
  proxy.update({ osmd, container, coreDocument, measureOverlays: overlays });

  const m1 = proxy.getAugmentedMeasures().find((m) => m.measureNumber === 1)!;
  const m2 = proxy.getAugmentedMeasures().find((m) => m.measureNumber === 2)!;
  assert.equal(m1.activeTuplets.length, 1, 'tuplet appears in measure 1');
  assert.equal(m2.activeTuplets.length, 1, 'and is also split into measure 2');
  assert.equal(m1.activeTuplets[0].tupletId, 't1');
  assert.equal(m2.activeTuplets[0].tupletId, 't1');
  assert.deepEqual(m1.activeTuplets[0].eventIds, ['e1']);
  assert.deepEqual(m2.activeTuplets[0].eventIds, ['e2', 'e3']);
});

test('tuplet hover metadata stays scoped to its instrument when local staff indexes repeat', () => {
  const { container } = makeContainer({});
  const osmd = makeOsmd([[
    makeGraphicalMeasure({ measureNumber: 1, staffIndex: 1, absX: 0, absY: 0, width: 100, height: 40 }),
    makeGraphicalMeasure({ measureNumber: 1, staffIndex: 1, absX: 0, absY: 70, width: 100, height: 40 }),
  ]]);
  const overlays = [
    makeOverlay('upper-m1', 1, { x: 0, y: 0, width: 100, height: 40 }),
    makeOverlay('lower-m1', 1, { x: 0, y: 70, width: 100, height: 40 }),
  ];
  const upperEvents = [0, 1, 2].map((timestampNum) => ({
    id: `upper-e${timestampNum + 1}`,
    kind: 'note' as const,
    measureNumber: 1,
    staffIndex: 1,
    voiceId: 1,
    timestampNum,
    timestampDen: 12,
    durationDivisions: 1,
    durationType: 'eighth',
    pitch: { step: 'C', alter: 0, octave: 4 },
  }));
  const lowerEvent = {
    id: 'lower-e1',
    kind: 'note' as const,
    measureNumber: 1,
    staffIndex: 1,
    voiceId: 1,
    timestampNum: 0,
    timestampDen: 4,
    durationDivisions: 4,
    durationType: 'whole',
    pitch: { step: 'C', alter: 0, octave: 3 },
  };
  const coreDocument = makeCoreDoc({
    score: {
      id: 's',
      parts: [
        {
          id: 'upper', sourcePartId: 'P1', name: 'Upper',
          staves: [{
            id: 'upper-st1', staffIndex: 1,
            measures: [{
              id: 'upper-m1', measureNumber: 1,
              attributes: [{ id: 'upper-a1', divisions: 3, time: { beats: 4, beatType: 4 }, clefs: [] }],
              voices: [{ id: 'upper-v1', voiceId: 1, events: upperEvents }],
            }],
          }],
        },
        {
          id: 'lower', sourcePartId: 'P2', name: 'Lower',
          staves: [{
            id: 'lower-st1', staffIndex: 1,
            measures: [{
              id: 'lower-m1', measureNumber: 1,
              attributes: [{ id: 'lower-a1', divisions: 1, time: { beats: 4, beatType: 4 }, clefs: [] }],
              voices: [{ id: 'lower-v1', voiceId: 1, events: [lowerEvent] }],
            }],
          }],
        },
      ],
    } as any,
    tuplets: [{ id: 'upper-t1', number: 1, eventIds: upperEvents.map((event) => event.id), actualNotes: 3, normalNotes: 2 }],
  });

  const proxy = new GeometryProxy();
  proxy.update({ osmd, container, coreDocument, measureOverlays: overlays });

  const upperContext = proxy.getDetailedContext({ x: 5, y: 20 });
  const lowerContext = proxy.getDetailedContext({ x: 5, y: 90 });
  assert.equal(upperContext?.measure.measureId, 'upper-m1');
  assert.equal(upperContext?.activeTuplet?.tupletId, 'upper-t1');
  assert.equal(lowerContext?.measure.measureId, 'lower-m1');
  assert.equal(lowerContext?.activeTuplet, null);
  assert.deepEqual(lowerContext?.measure.activeTuplets, []);
});

test('parallel parts with identical measure numbers resolve to distinct measureIds (anchor-drift regression)', () => {
  // Two instruments (flute staff 1, oboe staff 2) both have an empty measure 5.
  // Before the fix, measureIdentityFor() returned the first part's measureId
  // for both staves, reproducing the e16829f drift.
  const { container } = makeContainer({});
  const osmd = makeOsmd([[
    makeGraphicalMeasure({ measureNumber: 5, staffIndex: 1, absX: 0, absY: 0, width: 100, height: 40 }),
    makeGraphicalMeasure({ measureNumber: 5, staffIndex: 2, absX: 0, absY: 60, width: 100, height: 40 }),
  ]]);
  const coreDocument = makeCoreDoc({
    score: {
      id: 's',
      parts: [
        {
          id: 'flute', sourcePartId: 'P1', name: 'Flute',
          staves: [{
            id: 'flute-st1', staffIndex: 1,
            measures: [{ id: 'flute-m5', measureNumber: 5, attributes: [], voices: [] }],
          }],
        },
        {
          id: 'oboe', sourcePartId: 'P2', name: 'Oboe',
          staves: [{
            id: 'oboe-st2', staffIndex: 2,
            measures: [{ id: 'oboe-m5', measureNumber: 5, attributes: [], voices: [] }],
          }],
        },
      ],
    } as any,
  });

  const proxy = new GeometryProxy();
  proxy.update({ osmd, container, coreDocument, measureOverlays: [] });

  const measures = proxy.getAugmentedMeasures();
  assert.equal(measures.length, 2, 'one virtual overlay per part, not merged');

  const fluteCtx = proxy.getDetailedContext({ x: 50, y: 20 })!;
  const oboeCtx = proxy.getDetailedContext({ x: 50, y: 80 })!;
  assert.ok(fluteCtx);
  assert.ok(oboeCtx);
  assert.equal(fluteCtx.measure.measureId, 'flute-m5');
  assert.equal(oboeCtx.measure.measureId, 'oboe-m5');
  assert.notEqual(fluteCtx.measure.measureId, oboeCtx.measure.measureId);
});

test('parallel parts with identical local staff indexes resolve by rendered row order', () => {
  const { container } = makeContainer({});
  const osmd = makeOsmd([[
    makeGraphicalMeasure({ measureNumber: 1, staffIndex: 1, absX: 0, absY: 0, width: 100, height: 40 }),
    makeGraphicalMeasure({ measureNumber: 1, staffIndex: 1, absX: 0, absY: 60, width: 100, height: 40 }),
  ]]);
  const coreDocument = makeCoreDoc({
    score: {
      id: 's',
      parts: [
        {
          id: 'upper', sourcePartId: 'P1', name: 'Upper',
          staves: [{
            id: 'upper-st1', staffIndex: 1,
            measures: [{ id: 'upper-m1', measureNumber: 1, attributes: [], voices: [] }],
          }],
        },
        {
          id: 'lower', sourcePartId: 'P2', name: 'Lower',
          staves: [{
            id: 'lower-st1', staffIndex: 1,
            measures: [{ id: 'lower-m1', measureNumber: 1, attributes: [], voices: [] }],
          }],
        },
      ],
    } as any,
  });

  const proxy = new GeometryProxy();
  proxy.update({ osmd, container, coreDocument, measureOverlays: [] });

  const measures = proxy.getAugmentedMeasures();
  assert.equal(measures.length, 2, 'one virtual overlay per part despite duplicate local staffIndex');

  const upperCtx = proxy.getDetailedContext({ x: 50, y: 20 })!;
  const lowerCtx = proxy.getDetailedContext({ x: 50, y: 80 })!;
  assert.ok(upperCtx);
  assert.ok(lowerCtx);
  assert.equal(upperCtx.measure.measureId, 'upper-m1');
  assert.equal(lowerCtx.measure.measureId, 'lower-m1');
});

test('invalidate clears state and getDetailedContext returns null', () => {
  const { container } = makeContainer({});
  const osmd = makeOsmd([[
    makeGraphicalMeasure({ measureNumber: 1, staffIndex: 1, absX: 0, absY: 0, width: 100, height: 40 }),
  ]]);
  const overlay = makeOverlay('m1', 1, { x: 0, y: 0, width: 100, height: 40 });

  const proxy = new GeometryProxy();
  proxy.update({ osmd, container, coreDocument: null, measureOverlays: [overlay] });
  assert.equal(proxy.isValid(), true);
  proxy.invalidate();
  assert.equal(proxy.isValid(), false);
  assert.equal(proxy.getDetailedContext({ x: 50, y: 20 }), null);
});

test('fail-closed: no SVG in container yields empty staff details but still augments measures', () => {
  const container = {
    querySelector: () => null,
    getBoundingClientRect: () => ({ left: 0, top: 0 }),
  } as unknown as HTMLElement;
  const osmd = makeOsmd([[
    makeGraphicalMeasure({ measureNumber: 1, staffIndex: 1, absX: 0, absY: 0, width: 100, height: 40 }),
  ]]);
  const overlay = makeOverlay('m1', 1, { x: 0, y: 0, width: 100, height: 40 });

  const proxy = new GeometryProxy();
  proxy.update({ osmd, container, coreDocument: null, measureOverlays: [overlay] });

  const [measure] = proxy.getAugmentedMeasures();
  assert.equal(measure.staffDetails.length, 0);
  const ctx = proxy.getDetailedContext({ x: 50, y: 20 })!;
  assert.equal(ctx.staff, null);
  assert.equal(ctx.staffStep, null);
});
