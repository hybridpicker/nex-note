import {
  buildEffectiveMeasureTimingsFromStaff,
  type EffectiveMeasureTiming,
  type EffectiveStaffMeasureTiming,
} from '@/src/score-core/measure-timing';
import type { MeasureNode, PartNode, ScoreDocumentModel, StaffNode } from '@/src/score-core/model/types';

/*
 * Cached lookup index over a published score document.
 *
 * Render, selection and geometry code asks "which staff holds measure X" or "what is the timing of
 * measure X" once per rendered note or measure. Answered by scanning the document, that is
 * O(measures) per question and O(measures^2) per render. This index answers them in O(1) after
 * one O(measures) build per document object.
 *
 * The cache is keyed by document identity (WeakMap). Published documents are treated as
 * immutable: every edit produces a new document object (the command executor works on its own
 * clone). Do NOT use these helpers on a document that is being mutated, for example inside the
 * command executor, the rhythm speller or normalization. As a safety net every lookup checks the
 * part, staff and measure arrays (identity and length) in O(parts + staves) and rebuilds the index
 * when they changed; edits that keep those arrays (renumbering a measure in place, changing
 * attributes) are NOT detected.
 *
 * Every helper returns exactly what the linear scan it replaces returned, including "first match
 * in part/staff/measure order" when ids or numbers repeat.
 */

export interface IndexedMeasureLocation {
  part: PartNode;
  partIndex: number;
  staff: StaffNode;
  /** Position of the staff in document order (parts, then their staves). */
  staffOrder: number;
  measure: MeasureNode;
  measureIndex: number;
}

interface IndexedStaff {
  part: PartNode;
  partIndex: number;
  staff: StaffNode;
  staffOrder: number;
  measures: MeasureNode[];
  measureCount: number;
  /** First measure index per id within this staff. */
  firstIndexById: Map<string, number>;
  /** First measure index per measure number within this staff (NaN numbers are never indexed). */
  firstIndexByNumber: Map<unknown, number>;
  timings: EffectiveStaffMeasureTiming[] | null;
}

interface IndexedPart {
  part: PartNode;
  staves: StaffNode[];
  staffCount: number;
}

export interface DocumentIndex {
  readonly parts: PartNode[];
  readonly partCount: number;
  readonly indexedParts: IndexedPart[];
  readonly staves: IndexedStaff[];
  readonly staffByNode: Map<StaffNode, IndexedStaff>;
  /** Per measure id: the first occurrence in every staff, in document staff order. */
  readonly locationsById: Map<string, IndexedMeasureLocation[]>;
  /** Per measure number: the first occurrence in every staff, in document staff order. */
  readonly locationsByNumber: Map<unknown, IndexedMeasureLocation[]>;
}

const documentIndexCache = new WeakMap<ScoreDocumentModel, DocumentIndex>();

function isNaNNumber(value: unknown) {
  return typeof value === 'number' && value !== value;
}

function pushLocation(map: Map<unknown, IndexedMeasureLocation[]>, key: unknown, location: IndexedMeasureLocation) {
  const list = map.get(key);
  if (list) list.push(location);
  else map.set(key, [location]);
}

function buildDocumentIndex(document: ScoreDocumentModel): DocumentIndex {
  const parts = document.score.parts;
  const indexedParts: IndexedPart[] = [];
  const staves: IndexedStaff[] = [];
  const staffByNode = new Map<StaffNode, IndexedStaff>();
  const locationsById = new Map<string, IndexedMeasureLocation[]>();
  const locationsByNumber = new Map<unknown, IndexedMeasureLocation[]>();
  let staffOrder = 0;

  parts.forEach((part, partIndex) => {
    indexedParts.push({ part, staves: part.staves, staffCount: part.staves.length });
    for (const staff of part.staves) {
      const entry: IndexedStaff = {
        part,
        partIndex,
        staff,
        staffOrder,
        measures: staff.measures,
        measureCount: staff.measures.length,
        firstIndexById: new Map(),
        firstIndexByNumber: new Map(),
        timings: null,
      };
      staff.measures.forEach((measure, measureIndex) => {
        const location = { part, partIndex, staff, staffOrder, measure, measureIndex };
        if (!entry.firstIndexById.has(measure.id)) {
          entry.firstIndexById.set(measure.id, measureIndex);
          pushLocation(locationsById as Map<unknown, IndexedMeasureLocation[]>, measure.id, location);
        }
        if (!isNaNNumber(measure.measureNumber) && !entry.firstIndexByNumber.has(measure.measureNumber)) {
          entry.firstIndexByNumber.set(measure.measureNumber, measureIndex);
          pushLocation(locationsByNumber, measure.measureNumber, location);
        }
      });
      staves.push(entry);
      if (!staffByNode.has(staff)) staffByNode.set(staff, entry);
      staffOrder += 1;
    }
  });

  return { parts, partCount: parts.length, indexedParts, staves, staffByNode, locationsById, locationsByNumber };
}

function indexIsCurrent(index: DocumentIndex, document: ScoreDocumentModel) {
  const parts = document.score.parts;
  if (parts !== index.parts || parts.length !== index.partCount) return false;
  for (let partIndex = 0; partIndex < index.indexedParts.length; partIndex += 1) {
    const indexed = index.indexedParts[partIndex]!;
    if (parts[partIndex] !== indexed.part) return false;
    if (indexed.part.staves !== indexed.staves || indexed.staves.length !== indexed.staffCount) return false;
  }
  for (const entry of index.staves) {
    if (entry.staff.measures !== entry.measures || entry.measures.length !== entry.measureCount) return false;
  }
  return true;
}

/** The cached index of a published (immutable) document. See the module comment. */
export function getDocumentIndex(document: ScoreDocumentModel): DocumentIndex {
  const cached = documentIndexCache.get(document);
  if (cached && indexIsCurrent(cached, document)) return cached;
  const built = buildDocumentIndex(document);
  documentIndexCache.set(document, built);
  return built;
}

/** First staff (document order) that holds a measure with this id. */
export function findMeasureLocationById(
  document: ScoreDocumentModel | null | undefined,
  measureId: string,
): IndexedMeasureLocation | null {
  if (!document) return null;
  return getDocumentIndex(document).locationsById.get(measureId)?.[0] ?? null;
}

/** Same as `staff.measures.find((measure) => measure.measureNumber === measureNumber)`. */
export function findStaffMeasureByNumber(
  document: ScoreDocumentModel | null | undefined,
  staff: StaffNode,
  measureNumber: number,
): MeasureNode | undefined {
  const entry = document ? getDocumentIndex(document).staffByNode.get(staff) : undefined;
  if (!entry) return staff.measures.find((measure) => measure.measureNumber === measureNumber);
  const measureIndex = entry.firstIndexByNumber.get(measureNumber);
  return measureIndex == null ? undefined : staff.measures[measureIndex];
}

/** Same as `staff.measures.find((measure) => measure.id === measureId)`. */
export function findStaffMeasureById(
  document: ScoreDocumentModel | null | undefined,
  staff: StaffNode,
  measureId: string | null | undefined,
): MeasureNode | undefined {
  const entry = document ? getDocumentIndex(document).staffByNode.get(staff) : undefined;
  if (!entry) return staff.measures.find((measure) => measure.id === measureId);
  const measureIndex = entry.firstIndexById.get(measureId as string);
  return measureIndex == null ? undefined : staff.measures[measureIndex];
}

function timingAt(entry: IndexedStaff, measureIndex: number): EffectiveMeasureTiming {
  entry.timings ??= buildEffectiveMeasureTimingsFromStaff(entry.staff);
  const timing = entry.timings[measureIndex]!;
  // A fresh object per call (callers own their result, as with the uncached helper).
  return {
    staff: timing.staff,
    measure: timing.measure,
    measureIndex: timing.measureIndex,
    divisions: timing.divisions,
    timeSignature: timing.timeSignature
      ? {
        beats: timing.timeSignature.beats,
        beatType: timing.timeSignature.beatType,
        ...(timing.timeSignature.beatGroups ? { beatGroups: [...timing.timeSignature.beatGroups] } : {}),
      }
      : null,
    durationDivisions: timing.durationDivisions,
    durationRatio: timing.durationRatio,
    part: entry.part,
  };
}

/**
 * Indexed equivalent of `getEffectiveMeasureTiming` for published documents. Returns a
 * deep-equal result. Not for documents under mutation (see the module comment).
 */
export function getIndexedEffectiveMeasureTiming(
  document: ScoreDocumentModel | null | undefined,
  input: {
    measureId?: string | null;
    measureNumber?: number | null;
    staffIndex?: number | null;
    partId?: string | null;
  },
): EffectiveMeasureTiming | null {
  if (!document) return null;
  const index = getDocumentIndex(document);
  let candidates: IndexedMeasureLocation[] | undefined;
  if (input.measureId) candidates = index.locationsById.get(input.measureId);
  else if (typeof input.measureNumber === 'number') candidates = index.locationsByNumber.get(input.measureNumber);
  else return null;
  if (!candidates) return null;

  for (const location of candidates) {
    const { part, staff } = location;
    // Same filters, in the same part/staff order, as the linear `getEffectiveMeasureTiming`.
    if (input.partId && part.id !== input.partId && part.sourcePartId !== input.partId) continue;
    if (input.staffIndex != null && staff.staffIndex !== input.staffIndex) continue;
    return timingAt(index.staves[location.staffOrder]!, location.measureIndex);
  }
  return null;
}
