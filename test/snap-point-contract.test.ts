import test from 'node:test';
import assert from 'node:assert/strict';

import { buildRenderedGhostGrid, getRenderedGhostStaffPoints } from '../src/render-bridge/osmd/rendered-ghost-grid.ts';
import type { RenderedNote } from '../src/render-bridge/osmd/note-selection.ts';
import type { ScoreDocumentModel } from '../src/score-core/model/types.ts';
import { buildInteractiveEditMap } from '../src/score-input/edit-map.ts';
import { resolvePointerEditTarget } from '../src/score-input/pointer-resolver.ts';

function makeRenderedNote(input: {
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
}) {
  const rendered: RenderedNote = {
    id: input.id,
    coreEntityId: input.id,
    note: {
      coreEntityId: input.id,
      coreMeasureId: input.measureId,
      corePartId: 'p1',
      measureNumber: input.measureNumber,
      staffIndex: input.staffIndex,
      voiceId: input.voiceId,
      timestampNum: input.timestampNum,
      timestampDen: input.timestampDen,
      step: 'C',
      octave: 4,
      alter: 0,
      isRest: Boolean(input.isRest),
      graphicalNote: null,
    },
    svgCenter: { x: input.domX, y: input.domY },
    domCenter: { x: input.domX, y: input.domY },
    domRect: { x: input.domX - 6, y: input.domY - 6, width: 12, height: 12 },
    svgElement: null,
    tintElement: null,
  };
  return rendered;
}

function makeCoreDoc(measureVoices: Array<{ voiceId: number; events: any[] }>): ScoreDocumentModel {
  return {
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
            voices: measureVoices.map((voice) => ({ id: `v${voice.voiceId}`, voiceId: voice.voiceId, events: voice.events })),
          }],
        }],
      }],
    } as any,
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
  } as ScoreDocumentModel;
}

function makeEvent(input: {
  id: string;
  kind: 'note' | 'rest';
  voiceId: number;
  timestampNum: number;
  timestampDen: number;
  durationDivisions: number;
  durationType: string;
  isChord?: boolean;
}) {
  return {
    id: input.id,
    kind: input.kind,
    measureNumber: 1,
    staffIndex: 1,
    voiceId: input.voiceId,
    timestampNum: input.timestampNum,
    timestampDen: input.timestampDen,
    durationDivisions: input.durationDivisions,
    durationType: input.durationType,
    isChord: input.isChord ?? false,
    ...(input.kind === 'note' ? { pitch: { step: 'C', octave: 4, alter: 0 } } : {}),
  };
}

function buildCase(input: {
  voices: Array<{ voiceId: number; events: any[] }>;
  renderedNotes: RenderedNote[];
}) {
  return buildRenderedGhostGrid(input.renderedNotes, {
    coreDocument: makeCoreDoc(input.voices),
    measureOverlays: [{
      measureId: 'm1',
      measureNumber: 1,
      domRect: { x: 100, y: 0, width: 320, height: 40 },
      breakBefore: false,
    }],
    selectedDuration: '4',
    exposeRestMeasureSlots: true,
  });
}

function assertVisibleContract(
  grid: ReturnType<typeof buildRenderedGhostGrid>,
  expected: Record<number, string[]>,
) {
  const allPoints = getRenderedGhostStaffPoints(grid, 'm1', 1, { includeSynthetic: true });
  const visible = getRenderedGhostStaffPoints(grid, 'm1', 1);
  assert.equal(visible.some((point) => point.synthetic), false);
  for (const [voiceIdText, timestamps] of Object.entries(expected)) {
    const voiceId = Number(voiceIdText);
    const voiceVisible = visible.filter((point) => point.voiceId === voiceId);
    assert.equal(voiceVisible.length, timestamps.length);
    assert.deepEqual(
      voiceVisible.map((point) => `${point.timestampNum}/${point.timestampDen}`),
      timestamps,
    );
    assert.equal(new Set(voiceVisible.map((point) => `${point.timestampNum}/${point.timestampDen}`)).size, voiceVisible.length);
  }
  assert.ok(allPoints.length >= visible.length);
}

test('snap-point contract', async (t) => {
  await t.test('whole rest', () => {
    const grid = buildCase({
      voices: [{ voiceId: 1, events: [makeEvent({ id: 'r1', kind: 'rest', voiceId: 1, timestampNum: 0, timestampDen: 4, durationDivisions: 4, durationType: 'whole' })] }],
      renderedNotes: [makeRenderedNote({ id: 'r1', measureId: 'm1', measureNumber: 1, staffIndex: 1, voiceId: 1, timestampNum: 0, timestampDen: 4, domX: 210, domY: 30, isRest: true })],
    });
    assertVisibleContract(grid, { 1: ['0/4'] });
  });

  await t.test('whole note', () => {
    const grid = buildCase({
      voices: [{ voiceId: 1, events: [makeEvent({ id: 'n1', kind: 'note', voiceId: 1, timestampNum: 0, timestampDen: 4, durationDivisions: 4, durationType: 'whole' })] }],
      renderedNotes: [makeRenderedNote({ id: 'n1', measureId: 'm1', measureNumber: 1, staffIndex: 1, voiceId: 1, timestampNum: 0, timestampDen: 4, domX: 180, domY: 30 })],
    });
    assertVisibleContract(grid, { 1: ['0/4'] });
  });

  await t.test('two half rests', () => {
    const grid = buildCase({
      voices: [{ voiceId: 1, events: [
        makeEvent({ id: 'r1', kind: 'rest', voiceId: 1, timestampNum: 0, timestampDen: 4, durationDivisions: 2, durationType: 'half' }),
        makeEvent({ id: 'r2', kind: 'rest', voiceId: 1, timestampNum: 2, timestampDen: 4, durationDivisions: 2, durationType: 'half' }),
      ] }],
      renderedNotes: [
        makeRenderedNote({ id: 'r1', measureId: 'm1', measureNumber: 1, staffIndex: 1, voiceId: 1, timestampNum: 0, timestampDen: 4, domX: 150, domY: 30, isRest: true }),
        makeRenderedNote({ id: 'r2', measureId: 'm1', measureNumber: 1, staffIndex: 1, voiceId: 1, timestampNum: 2, timestampDen: 4, domX: 280, domY: 30, isRest: true }),
      ],
    });
    assertVisibleContract(grid, { 1: ['0/4', '2/4'] });
  });

  await t.test('four quarter rests', () => {
    const grid = buildCase({
      voices: [{ voiceId: 1, events: [0, 1, 2, 3].map((beat) => makeEvent({ id: `r${beat}`, kind: 'rest', voiceId: 1, timestampNum: beat, timestampDen: 4, durationDivisions: 1, durationType: 'quarter' })) }],
      renderedNotes: [0, 1, 2, 3].map((beat) => makeRenderedNote({ id: `r${beat}`, measureId: 'm1', measureNumber: 1, staffIndex: 1, voiceId: 1, timestampNum: beat, timestampDen: 4, domX: 140 + (beat * 60), domY: 30, isRest: true })),
    });
    assertVisibleContract(grid, { 1: ['0/4', '1/4', '2/4', '3/4'] });
  });

  await t.test('half rest plus two quarter rests', () => {
    const grid = buildCase({
      voices: [{ voiceId: 1, events: [
        makeEvent({ id: 'r1', kind: 'rest', voiceId: 1, timestampNum: 0, timestampDen: 4, durationDivisions: 2, durationType: 'half' }),
        makeEvent({ id: 'r2', kind: 'rest', voiceId: 1, timestampNum: 2, timestampDen: 4, durationDivisions: 1, durationType: 'quarter' }),
        makeEvent({ id: 'r3', kind: 'rest', voiceId: 1, timestampNum: 3, timestampDen: 4, durationDivisions: 1, durationType: 'quarter' }),
      ] }],
      renderedNotes: [
        makeRenderedNote({ id: 'r1', measureId: 'm1', measureNumber: 1, staffIndex: 1, voiceId: 1, timestampNum: 0, timestampDen: 4, domX: 150, domY: 30, isRest: true }),
        makeRenderedNote({ id: 'r2', measureId: 'm1', measureNumber: 1, staffIndex: 1, voiceId: 1, timestampNum: 2, timestampDen: 4, domX: 270, domY: 30, isRest: true }),
        makeRenderedNote({ id: 'r3', measureId: 'm1', measureNumber: 1, staffIndex: 1, voiceId: 1, timestampNum: 3, timestampDen: 4, domX: 330, domY: 30, isRest: true }),
      ],
    });
    assertVisibleContract(grid, { 1: ['0/4', '2/4', '3/4'] });
  });

  await t.test('quarter rest plus half rest plus quarter rest', () => {
    const grid = buildCase({
      voices: [{ voiceId: 1, events: [
        makeEvent({ id: 'r1', kind: 'rest', voiceId: 1, timestampNum: 0, timestampDen: 4, durationDivisions: 1, durationType: 'quarter' }),
        makeEvent({ id: 'r2', kind: 'rest', voiceId: 1, timestampNum: 1, timestampDen: 4, durationDivisions: 2, durationType: 'half' }),
        makeEvent({ id: 'r3', kind: 'rest', voiceId: 1, timestampNum: 3, timestampDen: 4, durationDivisions: 1, durationType: 'quarter' }),
      ] }],
      renderedNotes: [
        makeRenderedNote({ id: 'r1', measureId: 'm1', measureNumber: 1, staffIndex: 1, voiceId: 1, timestampNum: 0, timestampDen: 4, domX: 130, domY: 30, isRest: true }),
        makeRenderedNote({ id: 'r2', measureId: 'm1', measureNumber: 1, staffIndex: 1, voiceId: 1, timestampNum: 1, timestampDen: 4, domX: 220, domY: 30, isRest: true }),
        makeRenderedNote({ id: 'r3', measureId: 'm1', measureNumber: 1, staffIndex: 1, voiceId: 1, timestampNum: 3, timestampDen: 4, domX: 340, domY: 30, isRest: true }),
      ],
    });
    assertVisibleContract(grid, { 1: ['0/4', '1/4', '3/4'] });
  });

  await t.test('mixed notes and rests', () => {
    const grid = buildCase({
      voices: [{ voiceId: 1, events: [
        makeEvent({ id: 'n1', kind: 'note', voiceId: 1, timestampNum: 0, timestampDen: 4, durationDivisions: 1, durationType: 'quarter' }),
        makeEvent({ id: 'r1', kind: 'rest', voiceId: 1, timestampNum: 1, timestampDen: 4, durationDivisions: 2, durationType: 'half' }),
        makeEvent({ id: 'n2', kind: 'note', voiceId: 1, timestampNum: 3, timestampDen: 4, durationDivisions: 1, durationType: 'quarter' }),
      ] }],
      renderedNotes: [
        makeRenderedNote({ id: 'n1', measureId: 'm1', measureNumber: 1, staffIndex: 1, voiceId: 1, timestampNum: 0, timestampDen: 4, domX: 130, domY: 30 }),
        makeRenderedNote({ id: 'r1', measureId: 'm1', measureNumber: 1, staffIndex: 1, voiceId: 1, timestampNum: 1, timestampDen: 4, domX: 220, domY: 30, isRest: true }),
        makeRenderedNote({ id: 'n2', measureId: 'm1', measureNumber: 1, staffIndex: 1, voiceId: 1, timestampNum: 3, timestampDen: 4, domX: 340, domY: 30 }),
      ],
    });
    assertVisibleContract(grid, { 1: ['0/4', '1/4', '3/4'] });
  });

  await t.test('multi-voice measure', () => {
    const grid = buildCase({
      voices: [
        { voiceId: 1, events: [makeEvent({ id: 'n1', kind: 'note', voiceId: 1, timestampNum: 0, timestampDen: 4, durationDivisions: 4, durationType: 'whole' })] },
        { voiceId: 2, events: [
          makeEvent({ id: 'r1', kind: 'rest', voiceId: 2, timestampNum: 0, timestampDen: 4, durationDivisions: 2, durationType: 'half' }),
          makeEvent({ id: 'r2', kind: 'rest', voiceId: 2, timestampNum: 2, timestampDen: 4, durationDivisions: 2, durationType: 'half' }),
        ] },
      ],
      renderedNotes: [
        makeRenderedNote({ id: 'n1', measureId: 'm1', measureNumber: 1, staffIndex: 1, voiceId: 1, timestampNum: 0, timestampDen: 4, domX: 150, domY: 24 }),
        makeRenderedNote({ id: 'r1', measureId: 'm1', measureNumber: 1, staffIndex: 1, voiceId: 2, timestampNum: 0, timestampDen: 4, domX: 150, domY: 40, isRest: true }),
        makeRenderedNote({ id: 'r2', measureId: 'm1', measureNumber: 1, staffIndex: 1, voiceId: 2, timestampNum: 2, timestampDen: 4, domX: 300, domY: 40, isRest: true }),
      ],
    });
    assertVisibleContract(grid, { 1: ['0/4'], 2: ['0/4', '2/4'] });
  });

  await t.test('chord input on an existing notehead keeps the semantic commit on the visible anchor', () => {
    const renderedNote = makeRenderedNote({ id: 'n1', measureId: 'm1', measureNumber: 1, staffIndex: 1, voiceId: 1, timestampNum: 0, timestampDen: 4, domX: 160, domY: 30 });
    const grid = buildCase({
      voices: [{ voiceId: 1, events: [
        makeEvent({ id: 'n1', kind: 'note', voiceId: 1, timestampNum: 0, timestampDen: 4, durationDivisions: 1, durationType: 'quarter' }),
        makeEvent({ id: 'n1-chord', kind: 'note', voiceId: 1, timestampNum: 0, timestampDen: 4, durationDivisions: 1, durationType: 'quarter', isChord: true }),
      ] }],
      renderedNotes: [renderedNote],
    });
    assertVisibleContract(grid, { 1: ['0/4'] });
    const visiblePoint = getRenderedGhostStaffPoints(grid, 'm1', 1)[0]!;

    const editMap = buildInteractiveEditMap({
      renderedGhostGrid: grid,
      renderedNotes: [renderedNote],
      measureOverlays: [{ measureId: 'm1', measureNumber: 1, pageIndex: 0, systemIndex: 0 }],
    });
    const resolved = resolvePointerEditTarget({
      editMap,
      candidate: {
        measureId: 'm1',
        corePartId: 'p1',
        measureNumber: 1,
        staffIndex: 1,
        voiceId: 1,
        timestampNum: 0,
        timestampDen: 4,
        domX: 160,
        mode: 'chord',
        step: 'E',
        octave: 4,
        alter: 0,
      },
    });
    assert.ok(resolved);
    assert.equal(`${resolved.timestampNum}/${resolved.timestampDen}`, '0/4');
    assert.equal(resolved.domX, visiblePoint.domX);
  });
});
