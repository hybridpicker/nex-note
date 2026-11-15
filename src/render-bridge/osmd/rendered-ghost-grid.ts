import type { RenderedMeasureLayoutOverlay } from '@/src/render-bridge/osmd/layout-plan-bridge';
import type { RenderedNote } from '@/src/render-bridge/osmd/note-selection';
import {
  findStaffMeasureById,
  findStaffMeasureByNumber,
  getIndexedEffectiveMeasureTiming,
} from '@/src/score-core/document-index';
import type { ScoreDocumentModel } from '@/src/score-core/model/types';
import {
  fractionToNumber,
  normalizeFraction,
  type Fraction,
} from '@/src/score-core/rhythm-utils';
import { timestampsEqual } from '@/src/shared/music/timestamp-match';

export interface RenderedGhostGridPoint {
  id: string;
  coreEntityId: string | null;
  corePartId: string | null;
  measureId: string;
  measureNumber: number;
  pageIndex?: number | null;
  systemIndex?: number | null;
  staffIndex: number;
  voiceId: number;
  timestampNum: number;
  timestampDen: number;
  ratio: number;
  domX: number;
  domY: number;
  isRest: boolean;
  synthetic: boolean;
}

export interface RenderedGhostStaffGrid {
  staffIndex: number;
  points: RenderedGhostGridPoint[];
  syntheticPoints: RenderedGhostGridPoint[];
  byVoiceId: Map<number, RenderedGhostGridPoint[]>;
  syntheticByVoiceId: Map<number, RenderedGhostGridPoint[]>;
}

export interface RenderedGhostMeasureGrid {
  measureId: string;
  measureNumber: number;
  corePartId: string | null;
  points: RenderedGhostGridPoint[];
  syntheticPoints: RenderedGhostGridPoint[];
  byStaffIndex: Map<number, RenderedGhostStaffGrid>;
}

export interface RenderedGhostGrid {
  byMeasureId: Map<string, RenderedGhostMeasureGrid>;
}

export interface RenderedGhostGridBuildOptions {
  coreDocument?: ScoreDocumentModel | null | undefined;
  measureOverlays?: Array<Pick<RenderedMeasureLayoutOverlay, 'measureId' | 'measureNumber' | 'domRect'> & Partial<Pick<RenderedMeasureLayoutOverlay, 'breakBefore' | 'staffDetails' | 'pageIndex' | 'systemIndex'>>> | null | undefined;
  selectedDuration?: string | null | undefined;
  isDotted?: boolean | null | undefined;
  exposeRestMeasureSlots?: boolean | null | undefined;
}

type GhostGridMeasureOverlay = Pick<RenderedMeasureLayoutOverlay, 'measureId' | 'measureNumber' | 'domRect'>
  & Partial<Pick<RenderedMeasureLayoutOverlay, 'breakBefore' | 'staffDetails' | 'pageIndex' | 'systemIndex'>>;

interface InterpolationBoundary {
  timestamp: Fraction;
  ratio: number;
  x: number;
  exact: boolean;
}

function measureHasOnlyRestEvents(
  coreDocument: ScoreDocumentModel | null | undefined,
  measureId: string,
) {
  if (!coreDocument) return false;
  for (const part of coreDocument.score.parts) {
    for (const staff of part.staves) {
      const measure = findStaffMeasureById(coreDocument, staff, measureId);
      if (!measure) continue;
      const events = measure.voices.flatMap((voice) => voice.events);
      return events.length === 0 || events.every((event) => event.kind === 'rest');
    }
  }
  return false;
}

function measureHasRenderedPitchedPoints(measure: RenderedGhostMeasureGrid) {
  return measure.points.some((point) => !point.synthetic && !point.isRest);
}

interface MeasureStaffSeed {
  measureId: string;
  measureNumber: number;
  corePartId: string | null;
  staffIndex: number;
  voiceId: number;
  domY: number;
}

interface RhythmicAnchorTick {
  timestampNum: number;
  timestampDen: number;
  timestamp: Fraction;
  isRest: boolean;
}

function comparePoints(a: RenderedGhostGridPoint, b: RenderedGhostGridPoint) {
  return a.domX - b.domX
    || a.timestampNum / Math.max(a.timestampDen, 1) - (b.timestampNum / Math.max(b.timestampDen, 1))
    || a.voiceId - b.voiceId
    || a.domY - b.domY
    || a.id.localeCompare(b.id);
}

function sortVoiceBuckets(byVoiceId: Map<number, RenderedGhostGridPoint[]>) {
  for (const [voiceId, points] of byVoiceId.entries()) {
    byVoiceId.set(voiceId, [...points].sort(comparePoints));
  }
}

export function createEmptyRenderedGhostGrid(): RenderedGhostGrid {
  return { byMeasureId: new Map() };
}

function normalizeTimestamp(num: number, den: number): Fraction {
  return normalizeFraction(num, Math.max(den, 1));
}

function timestampKey(num: number, den: number): string {
  const normalized = normalizeTimestamp(num, den);
  return `${normalized.num}/${normalized.den}`;
}

function average(values: number[]): number {
  if (values.length === 0) return 0;
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}

function ensureMeasureGrid(
  byMeasureId: Map<string, RenderedGhostMeasureGrid>,
  input: { measureId: string; measureNumber: number; corePartId: string | null },
) {
  let measure = byMeasureId.get(input.measureId);
  if (!measure) {
    measure = {
      measureId: input.measureId,
      measureNumber: input.measureNumber,
      corePartId: input.corePartId,
      points: [],
      syntheticPoints: [],
      byStaffIndex: new Map(),
    };
    byMeasureId.set(input.measureId, measure);
  }
  return measure;
}

function ensureStaffGrid(
  measure: RenderedGhostMeasureGrid,
  staffIndex: number,
) {
  let staff = measure.byStaffIndex.get(staffIndex);
  if (!staff) {
    staff = {
      staffIndex,
      points: [],
      syntheticPoints: [],
      byVoiceId: new Map(),
      syntheticByVoiceId: new Map(),
    };
    measure.byStaffIndex.set(staffIndex, staff);
  }
  return staff;
}

function insertPoint(
  byMeasureId: Map<string, RenderedGhostMeasureGrid>,
  point: RenderedGhostGridPoint,
) {
  const measure = ensureMeasureGrid(byMeasureId, {
    measureId: point.measureId,
    measureNumber: point.measureNumber,
    corePartId: point.corePartId,
  });
  if (point.synthetic) {
    measure.syntheticPoints.push(point);
  } else {
    measure.points.push(point);
  }

  const staff = ensureStaffGrid(measure, point.staffIndex);
  if (point.synthetic) {
    staff.syntheticPoints.push(point);
  } else {
    staff.points.push(point);
  }

  const voiceMap = point.synthetic ? staff.syntheticByVoiceId : staff.byVoiceId;
  const voicePoints = voiceMap.get(point.voiceId) ?? [];
  voicePoints.push(point);
  voiceMap.set(point.voiceId, voicePoints);
}

function sortGrid(byMeasureId: Map<string, RenderedGhostMeasureGrid>) {
  for (const measure of byMeasureId.values()) {
    measure.points.sort(comparePoints);
    measure.syntheticPoints.sort(comparePoints);
    for (const staff of measure.byStaffIndex.values()) {
      staff.points.sort(comparePoints);
      staff.syntheticPoints.sort(comparePoints);
      sortVoiceBuckets(staff.byVoiceId);
      sortVoiceBuckets(staff.syntheticByVoiceId);
    }
  }
}

function reindexVisibleVoiceBuckets(staff: RenderedGhostStaffGrid) {
  const byVoiceId = new Map<number, RenderedGhostGridPoint[]>();
  for (const point of staff.points) {
    const voicePoints = byVoiceId.get(point.voiceId) ?? [];
    voicePoints.push(point);
    byVoiceId.set(point.voiceId, voicePoints);
  }
  sortVoiceBuckets(byVoiceId);
  staff.byVoiceId = byVoiceId;
}

function measureDurationFraction(
  coreDocument: ScoreDocumentModel | null | undefined,
  measureId: string,
  measureNumber: number,
): Fraction | null {
  const timing = getIndexedEffectiveMeasureTiming(coreDocument, { measureId, measureNumber });
  if (!timing) return null;
  if (timing.timeSignature) {
    return normalizeFraction(timing.timeSignature.beats, Math.max(timing.timeSignature.beatType, 1));
  }
  return normalizeFraction(
    timing.durationDivisions,
    Math.max(timing.divisions, 1) * 4,
  );
}

function selectedDurationFraction(options: RenderedGhostGridBuildOptions): Fraction | null {
  const durationKey = String(options.selectedDuration ?? '');
  const denominator = Number.parseInt(durationKey, 10);
  if (!Number.isFinite(denominator) || denominator <= 0) return null;
  const base = normalizeFraction(1, denominator);
  if (!options.isDotted) return base;
  return normalizeFraction(base.num * 3, base.den * 2);
}

function buildRestMeasureSlotAnchors(duration: Fraction, slotDuration: Fraction | null): RhythmicAnchorTick[] {
  const anchors: RhythmicAnchorTick[] = [{
    timestampNum: 0,
    timestampDen: 1,
    timestamp: normalizeFraction(0, 1),
    isRest: true,
  }];
  if (!slotDuration || fractionToNumber(slotDuration) <= 0) return anchors;

  let cursor = normalizeFraction(slotDuration.num, slotDuration.den);
  const measureEnd = fractionToNumber(duration);
  while (fractionToNumber(cursor) < measureEnd - 1e-9) {
    anchors.push({
      timestampNum: cursor.num,
      timestampDen: cursor.den,
      timestamp: cursor,
      isRest: true,
    });
    cursor = normalizeFraction(
      (cursor.num * slotDuration.den) + (slotDuration.num * cursor.den),
      cursor.den * slotDuration.den,
    );
  }
  return anchors;
}

function lcm(left: number, right: number) {
  const gcd = (a: number, b: number): number => (b ? gcd(b, a % b) : Math.abs(a) || 1);
  return Math.max(1, (Math.abs(left) * Math.abs(right)) / gcd(left, right));
}

function eventEndTimestamp(event: { timestampNum: number; timestampDen: number; durationDivisions: number }, divisions: number) {
  const durationDen = Math.max(1, divisions * 4);
  const commonDen = lcm(Math.max(1, event.timestampDen), durationDen);
  return normalizeFraction(
    Math.round((event.timestampNum / Math.max(1, event.timestampDen)) * commonDen)
      + Math.round((Math.max(0, event.durationDivisions) / durationDen) * commonDen),
    commonDen,
  );
}

function voiceHasSingleFullMeasureEvent(input: {
  voice: { events: Array<{
    id: string;
    isChord?: boolean;
    timestampNum: number;
    timestampDen: number;
    durationDivisions: number;
  }> };
  divisions: number;
  measureDuration: Fraction;
}) {
  const timelineEvents = input.voice.events.filter((event) => !event.isChord);
  if (timelineEvents.length !== 1) return false;
  const event = timelineEvents[0]!;
  const start = normalizeTimestamp(event.timestampNum, event.timestampDen);
  if (Math.abs(fractionToNumber(start)) > 1e-9) return false;
  const end = eventEndTimestamp(event, input.divisions);
  return fractionToNumber(end) >= fractionToNumber(input.measureDuration) - 1e-9;
}

function addSilentSpanSlotAnchors(input: {
  anchors: Map<string, RhythmicAnchorTick>;
  start: Fraction;
  end: Fraction;
  slotDuration: Fraction | null;
}) {
  const startRatio = fractionToNumber(input.start);
  const endRatio = fractionToNumber(input.end);
  const slotRatio = input.slotDuration ? fractionToNumber(input.slotDuration) : 0;
  if (!(slotRatio > 0) || endRatio <= startRatio + 1e-9) return;

  // Element-anchor rule: a silent span's only legal input target is its start.
  const timestamp = normalizeFraction(input.start.num, input.start.den);
  const key = timestampKey(timestamp.num, timestamp.den);
  if (input.anchors.has(key)) return;
  input.anchors.set(key, {
    timestampNum: timestamp.num,
    timestampDen: timestamp.den,
    timestamp,
    isRest: true,
  });
}

function collectVoiceEventAnchors(voice: { events: Array<{
  id: string;
  kind: string;
  isChord?: boolean;
  timestampNum: number;
  timestampDen: number;
}> }): RhythmicAnchorTick[] {
  const byTimestamp = new Map<string, RhythmicAnchorTick>();
  for (const event of voice.events) {
    if (event.isChord) continue;
    const timestamp = normalizeTimestamp(event.timestampNum, event.timestampDen);
    const key = timestampKey(event.timestampNum, event.timestampDen);
    const existing = byTimestamp.get(key);
    const next = {
      timestampNum: event.timestampNum,
      timestampDen: event.timestampDen,
      timestamp,
      isRest: event.kind === 'rest',
    };
    if (!existing || (existing.isRest && event.kind === 'note')) {
      byTimestamp.set(key, next);
    }
  }

  return [...byTimestamp.values()].sort((left, right) => (
    fractionToNumber(left.timestamp) - fractionToNumber(right.timestamp)
    || Number(left.isRest) - Number(right.isRest)
  ));
}

function resolveCoreMeasure(input: {
  coreDocument: ScoreDocumentModel;
  measureId: string;
  measureNumber: number;
  staffIndex: number;
}) {
  for (const part of input.coreDocument.score.parts) {
    for (const staff of part.staves) {
      if (staff.staffIndex !== input.staffIndex) continue;
      const measure = findStaffMeasureById(input.coreDocument, staff, input.measureId);
      if (measure) return measure;
    }
  }
  for (const part of input.coreDocument.score.parts) {
    for (const staff of part.staves) {
      if (staff.staffIndex !== input.staffIndex) continue;
      const measure = findStaffMeasureByNumber(input.coreDocument, staff, input.measureNumber);
      if (measure) return measure;
    }
  }
  return null;
}

function collectCoreRealRhythmicAnchors(input: {
  coreDocument: ScoreDocumentModel;
  measureId: string;
  measureNumber: number;
  staffIndex: number;
  voiceId: number;
}): RhythmicAnchorTick[] {
  const measure = resolveCoreMeasure(input);
  if (!measure) return [];
  const voice = measure.voices.find((entry) => entry.voiceId === input.voiceId) ?? null;
  if (!voice || voice.events.length === 0) return [];
  const byTimestamp = new Map(
    collectVoiceEventAnchors(voice).map((anchor) => [timestampKey(anchor.timestampNum, anchor.timestampDen), anchor] as const),
  );
  const timing = getIndexedEffectiveMeasureTiming(input.coreDocument, {
    measureId: input.measureId,
    measureNumber: input.measureNumber,
    staffIndex: input.staffIndex,
  });
  const divisions = Math.max(1, timing?.divisions ?? 1);
  const measureEnd = measureDurationFraction(input.coreDocument, input.measureId, input.measureNumber);
  if (measureEnd) {
    const timelineEvents = voice.events
      .filter((event) => !event.isChord)
      .sort((left, right) => (
        fractionToNumber(normalizeTimestamp(left.timestampNum, left.timestampDen))
        - fractionToNumber(normalizeTimestamp(right.timestampNum, right.timestampDen))
        || left.id.localeCompare(right.id)
      ));
    let cursor = normalizeFraction(0, 1);
    let trailingEventKind: string | null = null;
    for (const event of timelineEvents) {
      const end = eventEndTimestamp(event, divisions);
      if (fractionToNumber(end) > fractionToNumber(cursor)) {
        cursor = end;
        trailingEventKind = event.kind;
      }
    }
    if (
      trailingEventKind === 'rest'
      && fractionToNumber(cursor) > 1e-9
      && fractionToNumber(cursor) < fractionToNumber(measureEnd) - 1e-9
    ) {
      const key = timestampKey(cursor.num, cursor.den);
      if (!byTimestamp.has(key)) {
        byTimestamp.set(key, {
          timestampNum: cursor.num,
          timestampDen: cursor.den,
          timestamp: cursor,
          isRest: true,
        });
      }
    }
  }
  return [...byTimestamp.values()].sort((left, right) => (
    fractionToNumber(left.timestamp) - fractionToNumber(right.timestamp)
    || Number(left.isRest) - Number(right.isRest)
  ));
}

function collectCoreSyntheticSlotAnchors(input: {
  coreDocument: ScoreDocumentModel;
  measureId: string;
  measureNumber: number;
  staffIndex: number;
  voiceId: number;
  measureDuration: Fraction;
  slotDuration: Fraction | null;
}): RhythmicAnchorTick[] {
  if (!input.slotDuration) return [];
  const measure = resolveCoreMeasure(input);
  if (!measure) {
    return buildRestMeasureSlotAnchors(input.measureDuration, input.slotDuration);
  }
  const voice = measure.voices.find((entry) => entry.voiceId === input.voiceId) ?? null;
  if (!voice || voice.events.length === 0) {
    return buildRestMeasureSlotAnchors(input.measureDuration, input.slotDuration);
  }
  const timing = getIndexedEffectiveMeasureTiming(input.coreDocument, {
    measureId: input.measureId,
    measureNumber: input.measureNumber,
    staffIndex: input.staffIndex,
  });
  const divisions = Math.max(1, timing?.divisions ?? 1);
  if (voiceHasSingleFullMeasureEvent({
    voice,
    divisions,
    measureDuration: input.measureDuration,
  })) {
    return collectVoiceEventAnchors(voice);
  }
  const hasOnlyRests = voice.events.every((event) => event.kind === 'rest' || event.isChord);
  if (hasOnlyRests) return buildRestMeasureSlotAnchors(input.measureDuration, input.slotDuration);
  const measureEnd = input.measureDuration;
  const byTimestamp = new Map(
    collectVoiceEventAnchors(voice).map((anchor) => [timestampKey(anchor.timestampNum, anchor.timestampDen), anchor] as const),
  );
  const timelineEvents = voice.events
    .filter((event) => !event.isChord)
    .sort((left, right) => (
      fractionToNumber(normalizeTimestamp(left.timestampNum, left.timestampDen))
      - fractionToNumber(normalizeTimestamp(right.timestampNum, right.timestampDen))
      || left.id.localeCompare(right.id)
    ));

  let cursor = normalizeFraction(0, 1);
  for (const event of timelineEvents) {
    const start = normalizeTimestamp(event.timestampNum, event.timestampDen);
    addSilentSpanSlotAnchors({
      anchors: byTimestamp,
      start: cursor,
      end: start,
      slotDuration: input.slotDuration,
    });
    const end = eventEndTimestamp(event, divisions);
    if (fractionToNumber(end) > fractionToNumber(cursor)) {
      cursor = end;
    }
  }
  addSilentSpanSlotAnchors({
    anchors: byTimestamp,
    start: cursor,
    end: measureEnd,
    slotDuration: input.slotDuration,
  });

  const anchors = [...byTimestamp.values()].sort((left, right) => (
    fractionToNumber(left.timestamp) - fractionToNumber(right.timestamp)
    || Number(left.isRest) - Number(right.isRest)
    || left.timestampNum - right.timestampNum
    || left.timestampDen - right.timestampDen
  ));
  return anchors.length > 0 ? anchors : [{
    timestampNum: 0,
    timestampDen: 1,
    timestamp: normalizeFraction(0, 1),
    isRest: true,
  }];
}

function buildRenderedBoundaryMap(
  measure: RenderedGhostMeasureGrid,
  options?: { includeRests?: boolean },
): Map<string, InterpolationBoundary> {
  const grouped = new Map<string, { timestamp: Fraction; xs: number[] }>();
  for (const point of measure.points) {
    if (point.synthetic) continue;
    if (options?.includeRests === false && point.isRest) continue;
    const timestamp = normalizeTimestamp(point.timestampNum, point.timestampDen);
    const key = timestampKey(timestamp.num, timestamp.den);
    const entry = grouped.get(key) ?? { timestamp, xs: [] };
    entry.xs.push(point.domX);
    grouped.set(key, entry);
  }

  const out = new Map<string, InterpolationBoundary>();
  for (const [key, entry] of grouped.entries()) {
    out.set(key, {
      timestamp: entry.timestamp,
      ratio: fractionToNumber(entry.timestamp),
      x: average(entry.xs),
      exact: true,
    });
  }
  return out;
}

function setBoundary(
  map: Map<string, InterpolationBoundary>,
  boundary: InterpolationBoundary,
) {
  const key = timestampKey(boundary.timestamp.num, boundary.timestamp.den);
  const existing = map.get(key);
  if (!existing || (boundary.exact && !existing.exact)) {
    map.set(key, boundary);
  }
}

function extrapolateBoundaryX(
  left: InterpolationBoundary,
  right: InterpolationBoundary,
  targetRatio: number,
) {
  if (Math.abs(right.ratio - left.ratio) < 1e-6) return right.x;
  const t = (targetRatio - left.ratio) / (right.ratio - left.ratio);
  return left.x + ((right.x - left.x) * t);
}

function resolveOverlayContentBounds(
  overlay: (Pick<RenderedMeasureLayoutOverlay, 'measureNumber' | 'domRect'> & Partial<Pick<RenderedMeasureLayoutOverlay, 'breakBefore'>>) | null,
) {
  if (!overlay) return null;
  const trailingInset = 0;
  const startX = Math.max(0, overlay.domRect.x);
  const endX = Math.max(startX, overlay.domRect.x + overlay.domRect.width - trailingInset);
  return { startX, endX };
}

function inferVisualSystemBreaks(
  overlays: readonly GhostGridMeasureOverlay[],
): GhostGridMeasureOverlay[] {
  if (overlays.length < 2) return [...overlays];

  const ordered = [...overlays].sort((left, right) => (
    left.measureNumber - right.measureNumber
    || left.domRect.y - right.domRect.y
    || left.domRect.x - right.domRect.x
    || left.measureId.localeCompare(right.measureId)
  ));
  const breakBeforeById = new Map<string, boolean>();

  for (let index = 0; index < ordered.length; index += 1) {
    const overlay = ordered[index]!;
    const previous = ordered[index - 1];
    if (!previous) {
      breakBeforeById.set(overlay.measureId, Boolean(overlay.breakBefore));
      continue;
    }

    const yDelta = overlay.domRect.y - previous.domRect.y;
    const rowAdvanceThreshold = Math.max(
      12,
      Math.min(Math.max(previous.domRect.height, 0), Math.max(overlay.domRect.height, 0)) * 0.45,
    );
    const leftResetTolerance = Math.max(16, Math.min(previous.domRect.width, overlay.domRect.width) * 0.25);
    const visuallyWrapped = yDelta > rowAdvanceThreshold
      && overlay.domRect.x <= previous.domRect.x + leftResetTolerance;
    breakBeforeById.set(overlay.measureId, Boolean(overlay.breakBefore || visuallyWrapped));
  }

  return overlays.map((overlay) => (
    breakBeforeById.get(overlay.measureId)
      ? { ...overlay, breakBefore: true }
      : overlay
  ));
}

function buildInterpolationBoundaries(
  measure: RenderedGhostMeasureGrid,
  overlay: (Pick<RenderedMeasureLayoutOverlay, 'measureNumber' | 'domRect'> & Partial<Pick<RenderedMeasureLayoutOverlay, 'breakBefore'>>) | null,
  duration: Fraction,
  options?: { includeRests?: boolean; ignoreExactBoundaries?: boolean },
): InterpolationBoundary[] {
  const boundaries = new Map<string, InterpolationBoundary>();
  const exactBoundaries = options?.ignoreExactBoundaries
    ? []
    : [...buildRenderedBoundaryMap(measure, options).values()]
    .sort((a, b) => a.ratio - b.ratio || a.x - b.x);
  const durationRatio = fractionToNumber(duration);

  const estimateBoundaryX = (
    edge: 'start' | 'end',
    fallbackStartX: number,
    fallbackEndX: number,
  ) => {
    if (exactBoundaries.length >= 2) {
      const left = edge === 'start'
        ? exactBoundaries[0]!
        : exactBoundaries[exactBoundaries.length - 2]!;
      const right = edge === 'start'
        ? exactBoundaries[1]!
        : exactBoundaries[exactBoundaries.length - 1]!;
      const targetRatio = edge === 'start' ? 0 : durationRatio;
      return clamp(
        extrapolateBoundaryX(left, right, targetRatio),
        fallbackStartX,
        fallbackEndX,
      );
    }

    const only = exactBoundaries[0] ?? null;
    if (!only) return edge === 'start' ? fallbackStartX : fallbackEndX;
    if (only.ratio <= 1e-6 || only.ratio >= durationRatio - 1e-6) {
      return edge === 'start' ? fallbackStartX : fallbackEndX;
    }

    if (edge === 'start') {
      const normalizedRatio = only.ratio / Math.max(durationRatio, 1e-6);
      const estimated = (only.x - (normalizedRatio * fallbackEndX))
        / Math.max(1 - normalizedRatio, 1e-6);
      return clamp(estimated, fallbackStartX, Math.min(fallbackEndX, only.x));
    }

    const ratio = only.ratio / Math.max(durationRatio, 1e-6);
    const estimated = fallbackStartX + ((only.x - fallbackStartX) / Math.max(ratio, 1e-6));
    return clamp(estimated, Math.max(fallbackStartX, only.x), fallbackEndX);
  };

  if (overlay) {
    const bounds = resolveOverlayContentBounds(overlay);
    const fallbackStartX = bounds?.startX ?? Math.max(overlay.domRect.x, 0);
    const fallbackEndX = bounds?.endX ?? Math.max(fallbackStartX, overlay.domRect.x + overlay.domRect.width);
    setBoundary(boundaries, {
      timestamp: normalizeFraction(0, 1),
      ratio: 0,
      x: estimateBoundaryX('start', fallbackStartX, fallbackEndX),
      exact: false,
    });
    setBoundary(boundaries, {
      timestamp: duration,
      ratio: fractionToNumber(duration),
      x: estimateBoundaryX('end', fallbackStartX, fallbackEndX),
      exact: false,
    });
  }

  for (const boundary of exactBoundaries) {
    setBoundary(boundaries, boundary);
  }

  return [...boundaries.values()].sort((a, b) => a.ratio - b.ratio || a.x - b.x);
}

interface ContentBounds {
  startX: number;
  endX: number;
}

const SYSTEM_START_PROTECTED_MIN_INSET_PX = 48;
const SYSTEM_START_PROTECTED_MAX_INSET_PX = 72;
const SYSTEM_START_PROTECTED_WIDTH_RATIO = 0.3;
const SYSTEM_START_LEADING_GUARD_PX = 14;
const FIRST_MEASURE_DOWNBEAT_RIGHT_SHIFT_RATIO = 0.1;
const RENDERED_REST_GLYPH_PRESERVE_THRESHOLD_PX = 6;
const COMPRESSED_RHYTHMIC_SPAN_RATIO = 0.75;

function systemStartProtectedStartX(
  overlay: (Pick<RenderedMeasureLayoutOverlay, 'measureNumber' | 'domRect'> & Partial<Pick<RenderedMeasureLayoutOverlay, 'breakBefore'>>) | null,
) {
  if (!overlay || (!overlay.breakBefore && overlay.measureNumber !== 1)) return null;
  const bounds = resolveOverlayContentBounds(overlay);
  if (!bounds) return null;
  const availableWidth = Math.max(bounds.endX - bounds.startX, 0);
  const inset = Math.min(
    Math.max(SYSTEM_START_PROTECTED_MIN_INSET_PX, availableWidth * SYSTEM_START_PROTECTED_WIDTH_RATIO),
    SYSTEM_START_PROTECTED_MAX_INSET_PX,
    availableWidth,
  );
  return Math.min(bounds.startX + inset, bounds.endX);
}

function normalizeSystemStartProtectedAnchors(
  byMeasureId: Map<string, RenderedGhostMeasureGrid>,
  options: RenderedGhostGridBuildOptions,
  renderedNotes: RenderedNote[] = [],
) {
  const measureOverlays = new Map(
    (options.measureOverlays ?? []).map((overlay) => [overlay.measureId, overlay] as const),
  );
  const semanticStartByMeasure = new Map<string, number>();
  const semanticStartByStaff = new Map<string, number>();
  const earliestPitchedRatioByStaff = new Map<string, number>();
  const renderedRestByCoreEntityId = new Map<string, RenderedNote>();
  for (const renderedNote of renderedNotes) {
    if (!renderedNote.note.coreMeasureId) continue;
    if (renderedNote.note.isRest) {
      if (renderedNote.coreEntityId) {
        renderedRestByCoreEntityId.set(renderedNote.coreEntityId, renderedNote);
      }
      continue;
    }
    const overlay = measureOverlays.get(renderedNote.note.coreMeasureId) ?? null;
    if (!overlay || (!overlay.breakBefore && overlay.measureNumber !== 1)) continue;
    const measureRight = overlay.domRect.x + overlay.domRect.width;
    const guardX = Math.min(
      measureRight - 1,
      overlay.domRect.x + Math.min(SYSTEM_START_LEADING_GUARD_PX, Math.max(overlay.domRect.width, 0)),
    );
    const noteheadLeftX = Math.max(
      renderedNote.domRect.x,
      renderedNote.domCenter.x - RENDERED_REST_GLYPH_PRESERVE_THRESHOLD_PX,
    );
    const semanticStartX = clamp(
      Math.max(guardX, noteheadLeftX),
      overlay.domRect.x,
      measureRight - 1,
    );
    const measureCurrent = semanticStartByMeasure.get(renderedNote.note.coreMeasureId);
    semanticStartByMeasure.set(
      renderedNote.note.coreMeasureId,
      measureCurrent == null ? semanticStartX : Math.min(measureCurrent, semanticStartX),
    );
    const staffKey = `${renderedNote.note.coreMeasureId}:${renderedNote.note.staffIndex}`;
    const staffCurrent = semanticStartByStaff.get(staffKey);
    semanticStartByStaff.set(
      staffKey,
      staffCurrent == null ? semanticStartX : Math.min(staffCurrent, semanticStartX),
    );
    const pitchedRatio = renderedNote.note.timestampNum / Math.max(renderedNote.note.timestampDen, 1);
    const earliestPitchedRatio = earliestPitchedRatioByStaff.get(staffKey);
    earliestPitchedRatioByStaff.set(
      staffKey,
      earliestPitchedRatio == null ? pitchedRatio : Math.min(earliestPitchedRatio, pitchedRatio),
    );
  }

  const preservedRenderedRestIds = new Set<string>();
  for (const [measureId, measure] of byMeasureId.entries()) {
    if (
      !measureHasRenderedPitchedPoints(measure)
      && measureHasOnlyRestEvents(options.coreDocument, measureId)
    ) {
      continue;
    }
    const fallbackProtectedStartX = systemStartProtectedStartX(measureOverlays.get(measureId) ?? null);
    for (const point of measure.points) {
      if (!point.isRest) continue;
      const staffKey = `${measureId}:${point.staffIndex}`;
      const protectedStartX = semanticStartByStaff.get(staffKey)
        ?? semanticStartByMeasure.get(measureId)
        ?? fallbackProtectedStartX;
      if (protectedStartX == null) continue;
      const overlay = measureOverlays.get(measureId) ?? null;
      const renderedRest = point.coreEntityId
        ? renderedRestByCoreEntityId.get(point.coreEntityId) ?? null
        : null;
      const earliestPitchedRatio = earliestPitchedRatioByStaff.get(staffKey);
      if (overlay && renderedRest && earliestPitchedRatio != null && point.ratio < earliestPitchedRatio - 1e-6) {
        const measureRight = overlay.domRect.x + overlay.domRect.width;
        const guardX = Math.min(
          measureRight - 1,
          overlay.domRect.x + Math.min(SYSTEM_START_LEADING_GUARD_PX, Math.max(overlay.domRect.width, 0)),
        );
        const renderedRestRightX = renderedRest.domRect.x + renderedRest.domRect.width;
        const renderedRestX = renderedRest.domCenter.x;
        if (
          renderedRestX >= guardX - 0.75
          && renderedRestX <= measureRight - 1
          && renderedRestRightX <= protectedStartX - 1
        ) {
          point.domX = renderedRestX;
          preservedRenderedRestIds.add(point.id);
          continue;
        }
      }
      if (point.domX < protectedStartX) {
        point.domX = protectedStartX;
      }
    }
  }
  return preservedRenderedRestIds;
}

function normalizeFirstMeasureDownbeatSnapAnchors(
  byMeasureId: Map<string, RenderedGhostMeasureGrid>,
  options: RenderedGhostGridBuildOptions,
  preservedRenderedRestIds: ReadonlySet<string> = new Set(),
) {
  const measureOverlays = new Map(
    (options.measureOverlays ?? []).map((overlay) => [overlay.measureId, overlay] as const),
  );

  for (const [measureId, measure] of byMeasureId.entries()) {
    if (measure.measureNumber !== 1) continue;
    const overlay = measureOverlays.get(measureId) ?? null;
    const bounds = resolveOverlayContentBounds(overlay);
    if (!bounds) continue;
    const protectedStartX = systemStartProtectedStartX(overlay);
    const hasRenderedPitchedPoints = measureHasRenderedPitchedPoints(measure);

    const width = Math.max(bounds.endX - bounds.startX, 0);
    const centerX = bounds.startX + (width / 2);
    const rightShift = width * FIRST_MEASURE_DOWNBEAT_RIGHT_SHIFT_RATIO;

    for (const point of measure.points) {
      if (!point.isRest) continue;
      const timestamp = normalizeTimestamp(point.timestampNum, point.timestampDen);
      if (timestamp.num !== 0) continue;
      if (preservedRenderedRestIds.has(point.id)) continue;
      if (hasRenderedPitchedPoints && protectedStartX != null && point.domX >= protectedStartX - 0.75) continue;

      if (!(rightShift > 0) || point.domX >= centerX) continue;

      point.domX = Math.min(centerX, point.domX + rightShift);
    }
  }
}

function normalizeCompressedRhythmicSnapSpacing(
  byMeasureId: Map<string, RenderedGhostMeasureGrid>,
  options: RenderedGhostGridBuildOptions,
) {
  const measureOverlays = new Map(
    (options.measureOverlays ?? []).map((overlay) => [overlay.measureId, overlay] as const),
  );

  for (const [measureId, measure] of byMeasureId.entries()) {
    const overlay = measureOverlays.get(measureId) ?? null;
    const bounds = resolveOverlayContentBounds(overlay);
    const duration = measureDurationFraction(options.coreDocument, measureId, measure.measureNumber);
    if (!bounds || !duration) continue;
    if (!(measure.measureNumber === 1 || overlay?.breakBefore)) continue;
    const durationRatio = fractionToNumber(duration);
    if (!(durationRatio > 0)) continue;

    for (const staff of measure.byStaffIndex.values()) {
      const realPoints = staff.points
        .filter((point) => !point.synthetic && Number.isFinite(point.domX))
        .sort((left, right) => (
          left.ratio - right.ratio
          || left.domX - right.domX
          || left.voiceId - right.voiceId
          || left.id.localeCompare(right.id)
        ));
      const distinctRatios = [...new Set(realPoints.map((point) => Math.round(point.ratio * 1_000_000) / 1_000_000))];
      if (distinctRatios.length < 2) continue;

      const firstRatio = distinctRatios[0]!;
      const lastRatio = distinctRatios[distinctRatios.length - 1]!;
      if (lastRatio <= firstRatio) continue;

      const firstPoints = realPoints.filter((point) => Math.abs(point.ratio - firstRatio) <= 1e-6);
      const lastPoints = realPoints.filter((point) => Math.abs(point.ratio - lastRatio) <= 1e-6);
      const firstX = average(firstPoints.map((point) => point.domX));
      const lastX = average(lastPoints.map((point) => point.domX));
      const availableWidth = Math.max(bounds.endX - firstX, 0);
      if (!(availableWidth > 24)) continue;

      const normalizedLastRatio = Math.min(lastRatio, durationRatio);
      const expectedLastX = firstX
        + (availableWidth * ((normalizedLastRatio - firstRatio) / Math.max(durationRatio - firstRatio, 1e-6)));
      const expectedSpan = expectedLastX - firstX;
      const actualSpan = lastX - firstX;
      if (!(expectedSpan > 18) || actualSpan >= expectedSpan * COMPRESSED_RHYTHMIC_SPAN_RATIO) continue;

      for (const point of staff.points) {
        if (!point.isRest) continue;
        if (point.ratio < firstRatio - 1e-6) continue;
        const normalizedRatio = Math.min(point.ratio, durationRatio);
        const normalized = firstX
          + (availableWidth * ((normalizedRatio - firstRatio) / Math.max(durationRatio - firstRatio, 1e-6)));
        point.domX = clamp(normalized, firstX, bounds.endX);
      }
    }
  }
}

function normalizeRestSnapChronology(
  byMeasureId: Map<string, RenderedGhostMeasureGrid>,
  options: RenderedGhostGridBuildOptions,
) {
  const measureOverlays = new Map(
    (options.measureOverlays ?? []).map((overlay) => [overlay.measureId, overlay] as const),
  );

  for (const [measureId, measure] of byMeasureId.entries()) {
    if (!measureHasRenderedPitchedPoints(measure)) continue;
    const bounds = resolveOverlayContentBounds(measureOverlays.get(measureId) ?? null);

    for (const staff of measure.byStaffIndex.values()) {
      const realPoints = staff.points
        .filter((point) => !point.synthetic && Number.isFinite(point.domX))
        .sort((left, right) => (
          left.ratio - right.ratio
          || left.domX - right.domX
          || left.id.localeCompare(right.id)
        ));
      const ratios = [...new Set(realPoints.map((point) => Math.round(point.ratio * 1_000_000) / 1_000_000))];
      for (let index = 0; index < ratios.length - 1; index += 1) {
        const ratio = ratios[index]!;
        const current = realPoints.filter((point) => Math.abs(point.ratio - ratio) <= 1e-6);
        if (current.some((point) => !point.isRest)) continue;
        const rests = current.filter((point) => point.isRest);
        if (rests.length === 0) continue;

        const later = realPoints.filter((point) => point.ratio > ratio + 1e-6);
        const nextX = Math.min(...later.map((point) => point.domX));
        if (!Number.isFinite(nextX)) continue;

        for (const rest of rests) {
          if (rest.domX <= nextX - 4) continue;
          rest.domX = Math.max(bounds?.startX ?? Number.NEGATIVE_INFINITY, nextX - 4);
        }
      }
    }
  }
}

function normalizeCrossStaffRhythmicSnapX(
  byMeasureId: Map<string, RenderedGhostMeasureGrid>,
  options: RenderedGhostGridBuildOptions,
) {
  const measureOverlays = new Map(
    (options.measureOverlays ?? []).map((overlay) => [overlay.measureId, overlay] as const),
  );
  const groups = new Map<string, RenderedGhostGridPoint[]>();

  for (const measure of byMeasureId.values()) {
    const overlay = measureOverlays.get(measure.measureId) ?? null;
    for (const point of measure.points) {
      if (point.synthetic || !Number.isFinite(point.domX)) continue;
      const timestamp = normalizeTimestamp(point.timestampNum, point.timestampDen);
      const key = [
        overlay?.pageIndex ?? 'page',
        overlay?.systemIndex ?? 'system',
        point.corePartId ?? measure.corePartId ?? 'partless',
        measure.measureNumber,
        timestamp.num,
        timestamp.den,
      ].join(':');
      const group = groups.get(key) ?? [];
      group.push(point);
      groups.set(key, group);
    }
  }

  for (const group of groups.values()) {
    const staffCount = new Set(group.map((point) => point.staffIndex)).size;
    if (staffCount < 2) continue;
    const pitched = group.filter((point) => !point.isRest);
    if (
      pitched.length === 0
      && group.some((point) => {
        const measure = byMeasureId.get(point.measureId);
        return measure ? measureHasRenderedPitchedPoints(measure) : false;
      })
    ) {
      continue;
    }
    const canonicalSources = pitched.length > 0 ? pitched : group;
    const canonicalX = average(canonicalSources.map((point) => point.domX));
    if (!Number.isFinite(canonicalX)) continue;

    for (const point of group) {
      if (!point.isRest) continue;
      point.domX = canonicalX;
    }
  }
}

function fallbackRestOnlyContentBounds(
  overlayBounds: ContentBounds,
  options?: { systemStart?: boolean },
): ContentBounds {
  const width = Math.max(overlayBounds.endX - overlayBounds.startX, 0);
  const leftInset = options?.systemStart
    ? Math.min(Math.max(width * 0.2, 120), 180, width * 0.42)
    : Math.min(Math.max(width * 0.08, 24), 40, width * 0.25);
  return {
    startX: Math.min(overlayBounds.startX + leftInset, overlayBounds.endX),
    endX: overlayBounds.endX,
  };
}

function inferRestOnlyContentBounds(
  byMeasureId: Map<string, RenderedGhostMeasureGrid>,
  options: RenderedGhostGridBuildOptions,
): Map<string, ContentBounds> {
  const result = new Map<string, ContentBounds>();
  const measureOverlays = new Map(
    (options.measureOverlays ?? []).map((overlay) => [overlay.measureId, overlay] as const),
  );

  for (const [measureId, measure] of byMeasureId.entries()) {
    if (measureHasRenderedPitchedPoints(measure)) continue;
    if (!measureHasOnlyRestEvents(options.coreDocument, measureId)) continue;
    const overlay = measureOverlays.get(measureId) ?? null;
    const overlayBounds = resolveOverlayContentBounds(overlay);
    if (!overlayBounds) continue;
    const systemStart = Boolean(overlay?.breakBefore || measure.measureNumber === 1);

    const renderedRestXs = measure.points
      .filter((p) => !p.synthetic && p.isRest)
      .map((p) => p.domX);

    if (renderedRestXs.length === 0) {
      result.set(measureId, fallbackRestOnlyContentBounds(overlayBounds, { systemStart }));
      continue;
    }

    // OSMD centers whole-measure rest glyphs in the content area:
    //   restX ≈ (contentStart + overlayEnd) / 2
    //   → contentStart = 2 * restX - overlayEnd
    const avgRestX = average(renderedRestXs);
    if (avgRestX < overlayBounds.startX - 1 || avgRestX > overlayBounds.endX + 1) {
      result.set(measureId, fallbackRestOnlyContentBounds(overlayBounds, { systemStart }));
      continue;
    }

    result.set(measureId, fallbackRestOnlyContentBounds(overlayBounds, { systemStart }));
  }

  return result;
}

function normalizeRestAnchorPositions(
  byMeasureId: Map<string, RenderedGhostMeasureGrid>,
  options: RenderedGhostGridBuildOptions,
  restOnlyContentBounds: Map<string, ContentBounds>,
) {
  const measureOverlays = new Map(
    (options.measureOverlays ?? []).map((overlay) => [overlay.measureId, overlay] as const),
  );

  for (const [measureId, measure] of byMeasureId.entries()) {
    const duration = measureDurationFraction(options.coreDocument, measureId, measure.measureNumber);
    if (!duration || fractionToNumber(duration) <= 0) continue;

    const overlay = measureOverlays.get(measureId) ?? null;
    const restOnlyMeasure = !measureHasRenderedPitchedPoints(measure)
      && measureHasOnlyRestEvents(options.coreDocument, measureId);

    // For rest-only measures, use pre-computed content bounds inferred from original rest positions.
    // This is idempotent: the same bounds apply on both normalisation passes.
    const contentBounds = restOnlyMeasure
      ? (restOnlyContentBounds.get(measureId) ?? resolveOverlayContentBounds(overlay))
      : null;

    if (!contentBounds && !overlay) continue;

    const boundaries = contentBounds
      ? null
      : buildInterpolationBoundaries(measure, overlay, duration, { includeRests: false });

    for (const point of measure.points) {
      if (point.synthetic || !point.isRest) continue;
      const timestamp = normalizeTimestamp(point.timestampNum, point.timestampDen);
      const timestampRatio = fractionToNumber(timestamp);
      const resolvedX = contentBounds
        ? contentBounds.startX
          + ((contentBounds.endX - contentBounds.startX)
            * (timestampRatio / Math.max(fractionToNumber(duration), 1e-6)))
        : interpolateBoundaryX(boundaries!, timestamp);
      if (resolvedX == null || !Number.isFinite(resolvedX)) continue;

      if (!contentBounds && Number.isFinite(point.domX) && point.domX > resolvedX + RENDERED_REST_GLYPH_PRESERVE_THRESHOLD_PX) {
        const nextBoundary = boundaries!
          .filter((boundary) => boundary.ratio > timestampRatio + 1e-6)
          .sort((left, right) => left.ratio - right.ratio || left.x - right.x)[0] ?? null;
        const upperX = nextBoundary ? Math.max(resolvedX, nextBoundary.x - 4) : Number.POSITIVE_INFINITY;
        point.domX = Math.min(point.domX, upperX);
        continue;
      }

      point.domX = resolvedX;
    }
  }
}

function augmentWithMissingCoreNoteAnchors(
  byMeasureId: Map<string, RenderedGhostMeasureGrid>,
  options: RenderedGhostGridBuildOptions,
) {
  const coreDocument = options.coreDocument;
  if (!coreDocument) return;

  const measureOverlays = new Map(
    (options.measureOverlays ?? []).map((overlay) => [overlay.measureId, overlay] as const),
  );

  for (const part of coreDocument.score.parts) {
    for (const staff of part.staves) {
      for (const coreMeasure of staff.measures) {
        if (!byMeasureId.has(coreMeasure.id) && !measureOverlays.has(coreMeasure.id)) continue;

        const measureGrid = ensureMeasureGrid(byMeasureId, {
          measureId: coreMeasure.id,
          measureNumber: coreMeasure.measureNumber,
          corePartId: part.id,
        });
        const duration = measureDurationFraction(coreDocument, coreMeasure.id, coreMeasure.measureNumber);
        if (!duration || fractionToNumber(duration) <= 0) continue;

        const overlay = measureOverlays.get(coreMeasure.id) ?? null;
        const boundaries = buildInterpolationBoundaries(
          measureGrid,
          overlay,
          duration,
          { includeRests: false },
        );
        if (boundaries.length === 0) continue;

        const staffGrid = measureGrid.byStaffIndex.get(staff.staffIndex) ?? null;
        const staffDomY = average((staffGrid?.points ?? measureGrid.points)
          .filter((point) => point.staffIndex === staff.staffIndex)
          .map((point) => point.domY));
        const overlayDomY = overlay ? overlay.domRect.y + (overlay.domRect.height / 2) : 0;
        const domY = staffDomY || overlayDomY;

        for (const voice of coreMeasure.voices) {
          for (const event of voice.events) {
            if (event.kind !== 'note') continue;
            const alreadyMapped = (staffGrid?.points ?? []).some((point) => (
              point.coreEntityId === event.id
              || (
                !point.isRest
                && point.voiceId === event.voiceId
                && timestampsEqual(point.timestampNum, point.timestampDen, event.timestampNum, event.timestampDen)
              )
            ));
            if (alreadyMapped) continue;

            const timestamp = normalizeTimestamp(event.timestampNum, event.timestampDen);
            const domX = interpolateBoundaryX(boundaries, timestamp);
            if (domX == null || !Number.isFinite(domX)) continue;

            insertPoint(byMeasureId, {
              id: `core:${event.id}`,
              coreEntityId: event.id,
              corePartId: part.id,
              measureId: coreMeasure.id,
              measureNumber: coreMeasure.measureNumber,
              staffIndex: event.staffIndex,
              voiceId: event.voiceId,
              timestampNum: event.timestampNum,
              timestampDen: event.timestampDen,
              ratio: fractionToNumber(timestamp),
              domX,
              domY,
              isRest: false,
              synthetic: false,
            });
          }
        }
      }
    }
  }
}

function interpolateBoundaryX(
  boundaries: InterpolationBoundary[],
  target: Fraction,
): number | null {
  if (boundaries.length === 0) return null;
  const targetRatio = fractionToNumber(target);

  let previous = boundaries[0]!;
  let next = boundaries[boundaries.length - 1]!;
  for (const boundary of boundaries) {
    if (boundary.ratio <= targetRatio) previous = boundary;
    if (boundary.ratio >= targetRatio) {
      next = boundary;
      break;
    }
  }

  if (Math.abs(next.ratio - previous.ratio) < 1e-6) return next.x;
  const t = (targetRatio - previous.ratio) / (next.ratio - previous.ratio);
  return previous.x + ((next.x - previous.x) * t);
}

function buildStaffSeeds(
  renderedNotes: RenderedNote[],
  coreDocument: ScoreDocumentModel | null | undefined,
  measureOverlays: Map<string, GhostGridMeasureOverlay>,
): Map<string, MeasureStaffSeed[]> {
  const renderedDomY = new Map<string, number[]>();
  const byMeasureId = new Map<string, Map<string, MeasureStaffSeed>>();

  const upsert = (seed: Omit<MeasureStaffSeed, 'domY'> & { domY?: number | null }) => {
    let byStaffVoice = byMeasureId.get(seed.measureId);
    if (!byStaffVoice) {
      byStaffVoice = new Map();
      byMeasureId.set(seed.measureId, byStaffVoice);
    }

    const seedKey = `${seed.staffIndex}:${seed.voiceId}`;
    const existing = byStaffVoice.get(seedKey);
    const overlay = measureOverlays.get(seed.measureId) ?? null;
    const overlayCenterY = overlay ? overlay.domRect.y + (overlay.domRect.height / 2) : 0;
    const staffDetailY = overlay?.staffDetails
      ?.filter((detail) => detail.staffIndex === seed.staffIndex)
      .sort((left, right) => (
        Math.abs(((left.topLineDomY + left.bottomLineDomY) / 2) - overlayCenterY)
        - Math.abs(((right.topLineDomY + right.bottomLineDomY) / 2) - overlayCenterY)
      ))[0];
    const fallbackDomY = staffDetailY
      ? (staffDetailY.topLineDomY + staffDetailY.bottomLineDomY) / 2
      : overlayCenterY;
    const averagedDomY = average(renderedDomY.get(`${seed.measureId}:${seed.staffIndex}`) ?? []);
    const domY = seed.domY != null ? seed.domY : (averagedDomY || fallbackDomY);

    if (existing) {
      existing.measureNumber = seed.measureNumber;
      existing.corePartId = existing.corePartId ?? seed.corePartId;
      existing.voiceId = existing.voiceId || seed.voiceId;
      existing.domY = existing.domY || domY;
      return;
    }

    byStaffVoice.set(seedKey, {
      ...seed,
      domY,
    });
  };

  for (const renderedNote of renderedNotes) {
    const measureId = renderedNote.note.coreMeasureId;
    if (!measureId) continue;
    const renderedKey = `${measureId}:${renderedNote.note.staffIndex}`;
    const ys = renderedDomY.get(renderedKey) ?? [];
    ys.push(renderedNote.domCenter.y);
    renderedDomY.set(renderedKey, ys);

    upsert({
      measureId,
      measureNumber: renderedNote.note.measureNumber,
      corePartId: renderedNote.note.corePartId ?? null,
      staffIndex: renderedNote.note.staffIndex,
      voiceId: renderedNote.note.voiceId,
      domY: renderedNote.domCenter.y,
    });
  }

  if (coreDocument) {
    for (const part of coreDocument.score.parts) {
      for (const staff of part.staves) {
        for (const measure of staff.measures) {
          if (!measureOverlays.has(measure.id) && !byMeasureId.has(measure.id)) continue;
          const voices = measure.voices.length > 0
            ? measure.voices
            : [{ voiceId: 1 }];
          for (const voice of voices) {
            upsert({
              measureId: measure.id,
              measureNumber: measure.measureNumber,
              corePartId: part.id,
              staffIndex: staff.staffIndex,
              voiceId: voice.voiceId,
            });
          }
        }
      }
    }
  }

  return new Map(
    [...byMeasureId.entries()].map(([measureId, byStaffVoice]) => [measureId, [...byStaffVoice.values()]])
  );
}

function augmentWithInterpolatedTicks(
  byMeasureId: Map<string, RenderedGhostMeasureGrid>,
  renderedNotes: RenderedNote[],
  options: RenderedGhostGridBuildOptions,
  restOnlyContentBounds: Map<string, ContentBounds>,
) {
  if (!options.coreDocument) return;

  const measureOverlays = new Map(
    (options.measureOverlays ?? []).map((overlay) => [overlay.measureId, overlay] as const),
  );
  const staffSeeds = buildStaffSeeds(renderedNotes, options.coreDocument, measureOverlays);

  for (const [measureId, seeds] of staffSeeds.entries()) {
    const firstSeed = seeds[0];
    if (!firstSeed) continue;

    const measure = ensureMeasureGrid(byMeasureId, {
      measureId,
      measureNumber: firstSeed.measureNumber,
      corePartId: firstSeed.corePartId,
    });
    const duration = measureDurationFraction(options.coreDocument, measureId, measure.measureNumber);
    if (!duration || fractionToNumber(duration) <= 0) continue;
    const restOnlyMeasure = !measureHasRenderedPitchedPoints(measure)
      && measureHasOnlyRestEvents(options.coreDocument, measureId);
    const overlay = measureOverlays.get(measureId) ?? null;

    const realAnchorsByVoice = new Map<number, RhythmicAnchorTick[]>();
    const syntheticAnchorsByVoice = new Map<number, RhythmicAnchorTick[]>();
    const slotDuration = options.exposeRestMeasureSlots ? selectedDurationFraction(options) : null;
    for (const seed of seeds) {
      realAnchorsByVoice.set(seed.voiceId, collectCoreRealRhythmicAnchors({
        coreDocument: options.coreDocument,
        measureId,
        measureNumber: measure.measureNumber,
        staffIndex: seed.staffIndex,
        voiceId: seed.voiceId,
      }));
      syntheticAnchorsByVoice.set(seed.voiceId, collectCoreSyntheticSlotAnchors({
        coreDocument: options.coreDocument,
        measureId,
        measureNumber: measure.measureNumber,
        staffIndex: seed.staffIndex,
        voiceId: seed.voiceId,
        measureDuration: duration,
        slotDuration,
      }));
    }
    const targetTicks = [...realAnchorsByVoice.values(), ...syntheticAnchorsByVoice.values()].flat();
    if (targetTicks.length === 0) continue;

    // For rest-only measures, use the pre-computed content bounds directly so that
    // the beat grid inherits the OSMD-centering-derived content start, and rendered
    // notes in measures with no core events don't skew the extrapolation.
    const precomputedBounds = restOnlyMeasure ? restOnlyContentBounds.get(measureId) : undefined;
    const boundaries = precomputedBounds
      ? ([
          { timestamp: normalizeFraction(0, 1), ratio: 0, x: precomputedBounds.startX, exact: true },
          { timestamp: duration, ratio: fractionToNumber(duration), x: precomputedBounds.endX, exact: false },
        ] as InterpolationBoundary[])
      : buildInterpolationBoundaries(
          measure,
          overlay,
          duration,
          { includeRests: false, ignoreExactBoundaries: false },
        );
    if (boundaries.length === 0) continue;

    const exactMeasureXs = restOnlyMeasure ? new Map() : buildRenderedBoundaryMap(measure, { includeRests: false });

    for (const seed of seeds) {
      const realAnchors = realAnchorsByVoice.get(seed.voiceId) ?? [];
      const syntheticAnchors = syntheticAnchorsByVoice.get(seed.voiceId) ?? [];
      if (realAnchors.length === 0 && syntheticAnchors.length === 0) continue;
      const staff = measure.byStaffIndex.get(seed.staffIndex) ?? null;
      const exactStaffKeys = new Set(
        (staff?.points ?? [])
          .filter((point) => !point.synthetic && point.voiceId === seed.voiceId)
          .map((point) => timestampKey(point.timestampNum, point.timestampDen)),
      );

      for (const anchor of realAnchors) {
        const key = timestampKey(anchor.timestampNum, anchor.timestampDen);
        const staffPointsAtTick = (staff?.points ?? [])
          .filter((point) => (
            point.voiceId === seed.voiceId
            && timestampKey(point.timestampNum, point.timestampDen) === key
          ));
        if (staffPointsAtTick.some((point) => !point.synthetic && !point.isRest)) continue;

        const resolvedX = exactMeasureXs.get(key)?.x ?? interpolateBoundaryX(boundaries, anchor.timestamp);
        if (resolvedX == null || !Number.isFinite(resolvedX)) continue;

        const restPointsAtTick = staffPointsAtTick.filter((point) => !point.synthetic && point.isRest);
        if (restPointsAtTick.length > 0) {
          for (const point of restPointsAtTick) {
            point.domX = resolvedX;
          }
          exactStaffKeys.add(key);
          continue;
        }

        if (exactStaffKeys.has(key)) continue;

        insertPoint(byMeasureId, {
          id: `anchor:${measureId}:${seed.staffIndex}:${seed.voiceId}:${key}`,
          coreEntityId: null,
          corePartId: seed.corePartId,
          measureId,
          measureNumber: measure.measureNumber,
          staffIndex: seed.staffIndex,
          voiceId: seed.voiceId,
          timestampNum: anchor.timestampNum,
          timestampDen: anchor.timestampDen,
          ratio: fractionToNumber(anchor.timestamp),
          domX: resolvedX,
          domY: seed.domY,
          isRest: anchor.isRest,
          synthetic: false,
        });
        exactStaffKeys.add(key);
      }

      for (const anchor of syntheticAnchors) {
        const key = timestampKey(anchor.timestampNum, anchor.timestampDen);
        if (exactStaffKeys.has(key)) continue;
        const syntheticPointsAtTick = (staff?.syntheticPoints ?? [])
          .filter((point) => (
            point.voiceId === seed.voiceId
            && timestampKey(point.timestampNum, point.timestampDen) === key
          ));
        if (syntheticPointsAtTick.length > 0) continue;

        const resolvedX = exactMeasureXs.get(key)?.x ?? interpolateBoundaryX(boundaries, anchor.timestamp);
        if (resolvedX == null || !Number.isFinite(resolvedX)) continue;

        insertPoint(byMeasureId, {
          id: `synthetic:${measureId}:${seed.staffIndex}:${seed.voiceId}:${key}`,
          coreEntityId: null,
          corePartId: seed.corePartId,
          measureId,
          measureNumber: measure.measureNumber,
          staffIndex: seed.staffIndex,
          voiceId: seed.voiceId,
          timestampNum: anchor.timestampNum,
          timestampDen: anchor.timestampDen,
          ratio: fractionToNumber(anchor.timestamp),
          domX: resolvedX,
          domY: seed.domY,
          isRest: anchor.isRest,
          synthetic: true,
        });
      }
    }
  }
}

function pruneVisiblePointsAgainstCoreAnchors(
  byMeasureId: Map<string, RenderedGhostMeasureGrid>,
  coreDocument: ScoreDocumentModel,
) {
  for (const measure of byMeasureId.values()) {
    for (const staff of measure.byStaffIndex.values()) {
      const allowedByVoice = new Map<number, Set<string>>();
      for (const voiceId of new Set([...staff.byVoiceId.keys(), ...staff.syntheticByVoiceId.keys()])) {
        allowedByVoice.set(
          voiceId,
          new Set(
            collectCoreRealRhythmicAnchors({
              coreDocument,
              measureId: measure.measureId,
              measureNumber: measure.measureNumber,
              staffIndex: staff.staffIndex,
              voiceId,
            }).map((anchor) => timestampKey(anchor.timestampNum, anchor.timestampDen)),
          ),
        );
      }

      const seenVisibleAnchors = new Set<string>();
      staff.points = staff.points.filter((point) => {
        const key = timestampKey(point.timestampNum, point.timestampDen);
        if (!(allowedByVoice.get(point.voiceId)?.has(key) ?? false)) return false;
        const scopedKey = `${point.voiceId}:${key}`;
        if (seenVisibleAnchors.has(scopedKey)) return false;
        seenVisibleAnchors.add(scopedKey);
        return true;
      });
      reindexVisibleVoiceBuckets(staff);
    }

    measure.points = [...measure.byStaffIndex.values()]
      .flatMap((staff) => staff.points)
      .sort(comparePoints);
  }
}

export function buildRenderedGhostGrid(
  renderedNotes: RenderedNote[],
  options?: RenderedGhostGridBuildOptions,
): RenderedGhostGrid {
  const byMeasureId = new Map<string, RenderedGhostMeasureGrid>();
  const buildOptions = options
    ? {
        ...options,
        measureOverlays: inferVisualSystemBreaks(options.measureOverlays ?? []),
      }
    : undefined;

  for (const renderedNote of renderedNotes) {
    const measureId = renderedNote.note.coreMeasureId;
    if (!measureId) continue;

    const point: RenderedGhostGridPoint = {
      id: renderedNote.id,
      coreEntityId: renderedNote.coreEntityId ?? null,
      corePartId: renderedNote.note.corePartId ?? null,
      measureId,
      measureNumber: renderedNote.note.measureNumber,
      staffIndex: renderedNote.note.staffIndex,
      voiceId: renderedNote.note.voiceId,
      timestampNum: renderedNote.note.timestampNum,
      timestampDen: renderedNote.note.timestampDen,
      ratio: renderedNote.note.timestampNum / Math.max(renderedNote.note.timestampDen, 1),
      domX: renderedNote.domCenter.x,
      domY: renderedNote.domCenter.y,
      isRest: renderedNote.note.isRest,
      synthetic: false,
    };

    insertPoint(byMeasureId, point);
  }

  if (buildOptions) {
    const restOnlyContentBounds = inferRestOnlyContentBounds(byMeasureId, buildOptions);
    normalizeRestAnchorPositions(byMeasureId, buildOptions, restOnlyContentBounds);
    normalizeSystemStartProtectedAnchors(byMeasureId, buildOptions, renderedNotes);
    augmentWithMissingCoreNoteAnchors(byMeasureId, buildOptions);
    normalizeRestAnchorPositions(byMeasureId, buildOptions, restOnlyContentBounds);
    augmentWithInterpolatedTicks(byMeasureId, renderedNotes, buildOptions, restOnlyContentBounds);
    const preservedRenderedRestIds = normalizeSystemStartProtectedAnchors(byMeasureId, buildOptions, renderedNotes);
    normalizeFirstMeasureDownbeatSnapAnchors(byMeasureId, buildOptions, preservedRenderedRestIds);
    normalizeCompressedRhythmicSnapSpacing(byMeasureId, buildOptions);
    normalizeRestSnapChronology(byMeasureId, buildOptions);
    normalizeCrossStaffRhythmicSnapX(byMeasureId, buildOptions);
    if (buildOptions.coreDocument) {
      pruneVisiblePointsAgainstCoreAnchors(byMeasureId, buildOptions.coreDocument);
    }
  }

  if (buildOptions?.coreDocument) {
    assertVisibleSnapPointContract(byMeasureId, buildOptions.coreDocument);
  }

  sortGrid(byMeasureId);

  return { byMeasureId };
}

function assertVisibleSnapPointContract(
  byMeasureId: Map<string, RenderedGhostMeasureGrid>,
  coreDocument: ScoreDocumentModel,
) {
  const scopes = new Map<string, { measureId: string; measureNumber: number; staffIndex: number; voiceId: number }>();
  for (const part of coreDocument.score.parts) {
    for (const staff of part.staves) {
      for (const measure of staff.measures) {
        const renderedMeasure = byMeasureId.get(measure.id);
        if (!renderedMeasure?.byStaffIndex.has(staff.staffIndex)) continue;
        for (const voice of measure.voices) {
          scopes.set(
            `${measure.id}:${staff.staffIndex}:${voice.voiceId}`,
            { measureId: measure.id, measureNumber: measure.measureNumber, staffIndex: staff.staffIndex, voiceId: voice.voiceId },
          );
        }
      }
    }
  }
  for (const measure of byMeasureId.values()) {
    for (const staff of measure.byStaffIndex.values()) {
      for (const voiceId of new Set([...staff.byVoiceId.keys(), ...staff.syntheticByVoiceId.keys()])) {
        scopes.set(`${measure.measureId}:${staff.staffIndex}:${voiceId}`, {
          measureId: measure.measureId,
          measureNumber: measure.measureNumber,
          staffIndex: staff.staffIndex,
          voiceId,
        });
      }
    }
  }

  for (const scope of scopes.values()) {
    const timestampSort = (left: string, right: string) => {
      const [leftNumText, leftDenText] = left.split('/');
      const [rightNumText, rightDenText] = right.split('/');
      const leftNum = Number.parseInt(leftNumText ?? '0', 10);
      const leftDen = Math.max(Number.parseInt(leftDenText ?? '1', 10), 1);
      const rightNum = Number.parseInt(rightNumText ?? '0', 10);
      const rightDen = Math.max(Number.parseInt(rightDenText ?? '1', 10), 1);
      return (leftNum / leftDen) - (rightNum / rightDen) || left.localeCompare(right);
    };
    const expected = collectCoreRealRhythmicAnchors({
      coreDocument,
      measureId: scope.measureId,
      measureNumber: scope.measureNumber,
      staffIndex: scope.staffIndex,
      voiceId: scope.voiceId,
    }).map((anchor) => timestampKey(anchor.timestampNum, anchor.timestampDen)).sort(timestampSort);
    const actualPoints = getRenderedGhostStaffPoints(
      { byMeasureId },
      scope.measureId,
      scope.staffIndex,
    ).filter((point) => point.voiceId === scope.voiceId);
    const actual = actualPoints.map((point) => timestampKey(point.timestampNum, point.timestampDen)).sort(timestampSort);
    const duplicates = new Set<string>();
    const seen = new Set<string>();
    for (const key of actual) {
      if (seen.has(key)) duplicates.add(key);
      seen.add(key);
    }
    if (duplicates.size > 0 || actual.length !== expected.length || actual.some((key, index) => key !== expected[index])) {
      throw new Error(
        `Snap point contract violation at ${scope.measureId} staff ${scope.staffIndex} voice ${scope.voiceId}: `
        + `visible=[${actual.join(', ')}] expected=[${expected.join(', ')}] duplicates=[${[...duplicates].join(', ')}]`,
      );
    }
  }
}

export function getRenderedGhostMeasure(
  grid: RenderedGhostGrid | null | undefined,
  measureId: string | null | undefined,
): RenderedGhostMeasureGrid | null {
  if (!grid || !measureId) return null;
  return grid.byMeasureId.get(measureId) ?? null;
}

export function getRenderedGhostStaffPoints(
  grid: RenderedGhostGrid | null | undefined,
  measureId: string | null | undefined,
  staffIndex: number | null | undefined,
  options?: { includeSynthetic?: boolean },
): RenderedGhostGridPoint[] {
  const measure = getRenderedGhostMeasure(grid, measureId);
  if (!measure) return [];
  if (staffIndex == null) {
    const measurePoints = measure.points ?? [];
    const syntheticMeasurePoints = measure.syntheticPoints ?? [];
    return options?.includeSynthetic
      ? [...measurePoints, ...syntheticMeasurePoints].sort(comparePoints)
      : measurePoints;
  }
  const staff = measure.byStaffIndex.get(staffIndex);
  if (!staff) return [];
  const staffPoints = staff.points ?? [];
  const syntheticStaffPoints = staff.syntheticPoints ?? [];
  return options?.includeSynthetic
    ? [...staffPoints, ...syntheticStaffPoints].sort(comparePoints)
    : staffPoints;
}

export function findNearestRenderedGhostPoint(
  grid: RenderedGhostGrid | null | undefined,
  input: {
    measureId: string | null | undefined;
    pointerX: number;
    staffIndex?: number | null;
    voiceId?: number | null;
    allowMeasureFallback?: boolean;
  },
): RenderedGhostGridPoint | null {
  const measure = getRenderedGhostMeasure(grid, input.measureId);
  if (!measure) return null;

  const staffPoints = input.staffIndex != null
    ? (measure.byStaffIndex.get(input.staffIndex)?.points ?? [])
    : [];
  const candidates = staffPoints.length > 0
    ? staffPoints
    : input.allowMeasureFallback === false && input.staffIndex != null
      ? []
      : measure.points;
  const voiceCandidates = input.voiceId != null
    ? candidates.filter((point) => point.voiceId === input.voiceId)
    : [];
  const scopedCandidates = voiceCandidates.length > 0 ? voiceCandidates : candidates;
  if (scopedCandidates.length === 0) return null;
  return scopedCandidates.reduce((best, point) => {
    if (!best) return point;
    const bestScore = Math.abs(best.domX - input.pointerX)
      + (best.synthetic ? 3 : 0)
      - (input.voiceId != null && best.voiceId === input.voiceId ? 2 : 0);
    const pointScore = Math.abs(point.domX - input.pointerX)
      + (point.synthetic ? 3 : 0)
      - (input.voiceId != null && point.voiceId === input.voiceId ? 2 : 0);
    if (pointScore !== bestScore) return pointScore < bestScore ? point : best;
    return comparePoints(point, best) < 0 ? point : best;
  }, null as RenderedGhostGridPoint | null);
}
