import type { RenderedMeasureLayoutOverlay } from '@/src/render-bridge/osmd/layout-plan-bridge';
import type { RenderedNote } from '@/src/render-bridge/osmd/note-selection';
import type { RenderedGhostGrid, RenderedGhostGridPoint } from '@/src/render-bridge/osmd/rendered-ghost-grid';
import {
  pitchKey,
  timestampKey,
  type InteractiveEditMap,
  type InteractiveEditMeasureMap,
  type InteractiveEditSlot,
  type InteractiveEditStaffMap,
} from '@/src/score-input/types';

interface BuildInteractiveEditMapInput {
  renderedGhostGrid: RenderedGhostGrid | null | undefined;
  measureOverlays: Array<Pick<RenderedMeasureLayoutOverlay, 'measureId' | 'measureNumber' | 'pageIndex' | 'systemIndex'>>;
  renderedNotes: Array<Pick<RenderedNote, 'note' | 'domCenter'>>;
}

interface SlotAccumulator {
  template: RenderedGhostGridPoint;
  domXs: number[];
  voices: Set<number>;
  synthetic: boolean;
}

interface PitchLaneAccumulator {
  step: string;
  alter: number;
  octave: number;
  ys: number[];
}

function createEmptyStaffMap(staffIndex: number): InteractiveEditStaffMap {
  return {
    staffIndex,
    slots: [],
    slotsByTimestamp: new Map(),
    pitchLanes: [],
    pitchLanesByPitch: new Map(),
  };
}

function createEmptyMeasureMap(input: {
  measureId: string;
  measureNumber: number;
  corePartId: string | null;
}): InteractiveEditMeasureMap {
  return {
    measureId: input.measureId,
    measureNumber: input.measureNumber,
    corePartId: input.corePartId,
    staves: [],
    stavesByIndex: new Map(),
  };
}

function ensureMeasure(
  measures: Map<string, InteractiveEditMeasureMap>,
  input: { measureId: string; measureNumber: number; corePartId: string | null },
) {
  const existing = measures.get(input.measureId);
  if (existing) return existing;
  const created = createEmptyMeasureMap(input);
  measures.set(input.measureId, created);
  return created;
}

function ensureStaff(measure: InteractiveEditMeasureMap, staffIndex: number) {
  const existing = measure.stavesByIndex.get(staffIndex);
  if (existing) return existing;
  const created = createEmptyStaffMap(staffIndex);
  measure.staves.push(created);
  measure.staves.sort((left, right) => left.staffIndex - right.staffIndex);
  measure.stavesByIndex.set(staffIndex, created);
  return created;
}

function compareSlots(left: InteractiveEditSlot, right: InteractiveEditSlot) {
  return left.ratio - right.ratio
    || left.domX - right.domX
    || left.staffIndex - right.staffIndex
    || left.id.localeCompare(right.id);
}

function buildSlotsForStaff(points: RenderedGhostGridPoint[]): InteractiveEditSlot[] {
  const byTimestamp = new Map<string, SlotAccumulator>();
  for (const point of points) {
    const key = timestampKey(point.timestampNum, point.timestampDen);
    const existing = byTimestamp.get(key);
    if (existing) {
      existing.domXs.push(point.domX);
      existing.voices.add(point.voiceId);
      existing.synthetic = existing.synthetic && point.synthetic;
      continue;
    }
    byTimestamp.set(key, {
      template: point,
      domXs: [point.domX],
      voices: new Set([point.voiceId]),
      synthetic: point.synthetic,
    });
  }

  return [...byTimestamp.values()].map((entry) => {
    const { template, domXs, voices } = entry;
    const averageX = domXs.reduce((sum, value) => sum + value, 0) / Math.max(domXs.length, 1);
    return {
      id: `slot:${template.measureId}:${template.staffIndex}:${timestampKey(template.timestampNum, template.timestampDen)}`,
      measureId: template.measureId,
      measureNumber: template.measureNumber,
      corePartId: template.corePartId,
      staffIndex: template.staffIndex,
      timestampNum: template.timestampNum,
      timestampDen: template.timestampDen,
      ratio: template.ratio,
      domX: averageX,
      voiceIds: [...voices].sort((left, right) => left - right),
      synthetic: entry.synthetic,
    };
  }).sort(compareSlots);
}

function buildPitchLanesForStaff(
  measureId: string,
  measureNumber: number,
  corePartId: string | null,
  staffIndex: number,
  renderedNotes: Array<Pick<RenderedNote, 'note' | 'domCenter'>>,
) {
  const byPitch = new Map<string, PitchLaneAccumulator>();
  for (const rendered of renderedNotes) {
    if (rendered.note.coreMeasureId !== measureId) continue;
    if (rendered.note.staffIndex !== staffIndex) continue;
    if (rendered.note.isRest) continue;

    const key = pitchKey(rendered.note.step, rendered.note.alter, rendered.note.octave);
    const existing = byPitch.get(key);
    if (existing) {
      existing.ys.push(rendered.domCenter.y);
      continue;
    }
    byPitch.set(key, {
      step: rendered.note.step,
      alter: rendered.note.alter,
      octave: rendered.note.octave,
      ys: [rendered.domCenter.y],
    });
  }

  return [...byPitch.entries()].map(([key, lane]) => ({
    id: `lane:${measureId}:${staffIndex}:${key}`,
    measureId,
    measureNumber,
    corePartId,
    staffIndex,
    step: lane.step,
    alter: lane.alter,
    octave: lane.octave,
    avgDomY: lane.ys.reduce((sum, value) => sum + value, 0) / Math.max(lane.ys.length, 1),
    sampleCount: lane.ys.length,
  })).sort((left, right) => (
    left.avgDomY - right.avgDomY
    || left.step.localeCompare(right.step)
    || left.octave - right.octave
    || left.alter - right.alter
  ));
}

export function createEmptyInteractiveEditMap(): InteractiveEditMap {
  return {
    measures: new Map(),
    measureOrder: [],
    diagnostics: [],
  };
}

export function buildInteractiveEditMap(input: BuildInteractiveEditMapInput): InteractiveEditMap {
  const measures = new Map<string, InteractiveEditMeasureMap>();
  const diagnostics: string[] = [];

  const overlayOrder = [...input.measureOverlays]
    .sort((left, right) => (
      left.pageIndex - right.pageIndex
      || left.systemIndex - right.systemIndex
      || left.measureNumber - right.measureNumber
      || left.measureId.localeCompare(right.measureId)
    ));

  for (const overlay of overlayOrder) {
    ensureMeasure(measures, {
      measureId: overlay.measureId,
      measureNumber: overlay.measureNumber,
      corePartId: null,
    });
  }

  for (const measure of input.renderedGhostGrid?.byMeasureId.values() ?? []) {
    const targetMeasure = ensureMeasure(measures, {
      measureId: measure.measureId,
      measureNumber: measure.measureNumber,
      corePartId: measure.corePartId,
    });
    if (targetMeasure.corePartId == null && measure.corePartId != null) {
      targetMeasure.corePartId = measure.corePartId;
    }

    for (const [staffIndex, staffGrid] of measure.byStaffIndex.entries()) {
      const staff = ensureStaff(targetMeasure, staffIndex);
      const slots = buildSlotsForStaff(staffGrid.points);
      staff.slots = slots;
      staff.slotsByTimestamp = new Map(slots.map((slot) => [timestampKey(slot.timestampNum, slot.timestampDen), slot] as const));
    }
  }

  for (const measure of measures.values()) {
    for (const staff of measure.staves) {
      const lanes = buildPitchLanesForStaff(
        measure.measureId,
        measure.measureNumber,
        measure.corePartId,
        staff.staffIndex,
        input.renderedNotes,
      );
      staff.pitchLanes = lanes;
      staff.pitchLanesByPitch = new Map(lanes.map((lane) => [pitchKey(lane.step, lane.alter, lane.octave), lane] as const));
      if (staff.slots.length === 0) {
        diagnostics.push(`measure:${measure.measureId}:staff:${staff.staffIndex}:no-slots`);
      }
    }

    if (measure.staves.length === 0) {
      diagnostics.push(`measure:${measure.measureId}:no-staves`);
    }
  }

  const overlayMeasureIds = new Set(overlayOrder.map((overlay) => overlay.measureId));
  for (const measureId of measures.keys()) {
    if (!overlayMeasureIds.has(measureId)) {
      diagnostics.push(`measure:${measureId}:missing-overlay`);
    }
  }

  const measureOrder = overlayOrder.map((overlay) => overlay.measureId);
  for (const measureId of measures.keys()) {
    if (!measureOrder.includes(measureId)) {
      measureOrder.push(measureId);
    }
  }

  return {
    measures,
    measureOrder,
    diagnostics,
  };
}
