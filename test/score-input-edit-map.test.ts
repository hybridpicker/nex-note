import test from 'node:test';
import assert from 'node:assert/strict';

import { buildInteractiveEditMap } from '../src/score-input/edit-map.ts';
import { buildRenderedGhostGrid } from '../src/render-bridge/osmd/rendered-ghost-grid.ts';
import type { RenderedNote } from '../src/render-bridge/osmd/note-selection.ts';

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
  step: string;
  octave: number;
  alter?: number;
}) {
  const rendered: RenderedNote = {
    id: input.id,
    coreEntityId: input.id,
    note: {
      coreEntityId: input.id,
      coreMeasureId: input.measureId,
      corePartId: 'P1',
      measureNumber: input.measureNumber,
      staffIndex: input.staffIndex,
      voiceId: input.voiceId,
      timestampNum: input.timestampNum,
      timestampDen: input.timestampDen,
      step: input.step,
      octave: input.octave,
      alter: input.alter ?? 0,
      isRest: false,
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

test('buildInteractiveEditMap builds deterministic slots and pitch lanes for visible staff', () => {
  const renderedNotes: RenderedNote[] = [
    makeRenderedNote({
      id: 'n1',
      measureId: 'm1',
      measureNumber: 1,
      staffIndex: 1,
      voiceId: 1,
      timestampNum: 0,
      timestampDen: 4,
      domX: 120,
      domY: 40,
      step: 'C',
      octave: 4,
    }),
    makeRenderedNote({
      id: 'n2',
      measureId: 'm1',
      measureNumber: 1,
      staffIndex: 1,
      voiceId: 2,
      timestampNum: 0,
      timestampDen: 4,
      domX: 126,
      domY: 64,
      step: 'E',
      octave: 3,
    }),
    makeRenderedNote({
      id: 'n3',
      measureId: 'm1',
      measureNumber: 1,
      staffIndex: 1,
      voiceId: 1,
      timestampNum: 1,
      timestampDen: 4,
      domX: 190,
      domY: 44,
      step: 'D',
      octave: 4,
    }),
  ];

  const renderedGhostGrid = buildRenderedGhostGrid(renderedNotes);
  const editMap = buildInteractiveEditMap({
    renderedGhostGrid,
    renderedNotes,
    measureOverlays: [{
      measureId: 'm1',
      measureNumber: 1,
      pageIndex: 0,
      systemIndex: 0,
    }],
  });

  assert.equal(editMap.measureOrder.length, 1);
  assert.equal(editMap.measureOrder[0], 'm1');
  assert.equal(editMap.diagnostics.length, 0);

  const measure = editMap.measures.get('m1');
  assert.ok(measure);
  const staff = measure.stavesByIndex.get(1);
  assert.ok(staff);
  assert.equal(staff.slots.length, 2);

  const firstSlot = staff.slots[0]!;
  assert.equal(firstSlot.timestampNum, 0);
  assert.equal(firstSlot.timestampDen, 4);
  assert.deepEqual(firstSlot.voiceIds, [1, 2]);

  const secondSlot = staff.slots[1]!;
  assert.equal(secondSlot.timestampNum, 1);
  assert.equal(secondSlot.timestampDen, 4);
  assert.deepEqual(secondSlot.voiceIds, [1]);

  const laneIds = staff.pitchLanes.map((lane) => `${lane.step}${lane.octave}:${lane.alter}`);
  assert.deepEqual(laneIds, ['C4:0', 'D4:0', 'E3:0']);
});
