import { getEffectiveMeasureTimingFromStaff } from '@/src/score-core/measure-timing';
import type { DirectionNode, ScoreDocumentModel, StaffNode } from '@/src/score-core/model/types';
import { findEventReference, type ScoreEventLocator } from '@/src/score-core/query/note-editor';
import type { ScoreClipboardPayload } from '@/src/shared/schemas/clipboard';

interface StaffTimelineEntry {
  measure: StaffNode['measures'][number];
  startOffset: number;
  durationDivisions: number;
  divisions: number;
}

function timestampToDivisionsOffset(
  divisions: number,
  timestampNum: number,
  timestampDen: number,
) {
  return Math.max(0, Math.round((timestampNum / Math.max(timestampDen, 1)) * divisions * 4));
}

/** The largest grid a copy may use; the paste side refuses the same limit. */
const MAX_CLIPBOARD_GRID = 1048576;

function greatestCommonDivisor(left: number, right: number): number {
  let a = Math.abs(left);
  let b = Math.abs(right);
  while (b) [a, b] = [b, a % b];
  return a;
}

function leastCommonMultiple(left: number, right: number) {
  return (left / greatestCommonDivisor(left, right)) * right;
}

function measureTiming(staff: StaffNode, measure: StaffNode['measures'][number]) {
  const timing = getEffectiveMeasureTimingFromStaff(staff, {
    measureId: measure.id,
    measureNumber: measure.measureNumber,
  });
  return {
    durationDivisions: timing?.durationDivisions ?? Math.max(1, (measure.attributes[0]?.divisions ?? 1) * 4),
    divisions: timing?.divisions ?? measure.attributes[0]?.divisions ?? 1,
  };
}

/**
 * The staff's bars on one common `grid` (divisions per quarter), counted from the bar at
 * `originIndex`. A staff whose bars use different `<divisions>` would otherwise mix grids on one
 * timeline. Bars inside the copied span get whole numbers because `grid` is a multiple of their
 * divisions; offsets outside it only need to stay outside the copied span.
 */
function buildStaffTimeline(staff: StaffNode, grid: number, originIndex: number): StaffTimelineEntry[] {
  const entries = staff.measures.map((measure) => {
    const timing = measureTiming(staff, measure);
    return {
      measure,
      startOffset: 0,
      durationDivisions: (timing.durationDivisions * grid) / timing.divisions,
      divisions: timing.divisions,
    };
  });
  let offset = 0;
  for (let index = originIndex; index < entries.length; index += 1) {
    entries[index]!.startOffset = offset;
    offset += entries[index]!.durationDivisions;
  }
  offset = 0;
  for (let index = Math.min(originIndex, entries.length) - 1; index >= 0; index -= 1) {
    offset -= entries[index]!.durationDivisions;
    entries[index]!.startOffset = offset;
  }
  return entries;
}

function buildDirectionEntries(
  document: ScoreDocumentModel,
  staffIndices: Set<number>,
  partId: string,
  grid: number,
  originIndex: number,
) {
  const timedDirectionKinds = new Set(['wedge', 'octave-shift', 'pedal', 'dynamics']);
  const directionEntries: Array<{
    sourceStaffIndex: number;
    absStart: number;
    direction: DirectionNode;
  }> = [];

  document.score.parts.filter(part => part.id === partId).forEach((part) => {
    part.staves.forEach((staff) => {
      if (!staffIndices.has(staff.staffIndex)) return;
      const timeline = buildStaffTimeline(staff, grid, originIndex);
      timeline.forEach((entry) => {
        entry.measure.directions.forEach((direction) => {
          if (!timedDirectionKinds.has(direction.kind)) return;
          if (direction.staffIndex != null && direction.staffIndex !== staff.staffIndex) return;
          directionEntries.push({
            sourceStaffIndex: staff.staffIndex,
            absStart: entry.startOffset + timestampToDivisionsOffset(
              grid,
              direction.timestampNum ?? 0,
              direction.timestampDen ?? Math.max(entry.divisions * 4, 1),
            ),
            direction: structuredClone(direction),
          });
        });
      });
    });
  });

  const pairedSpanKinds = new Set(['wedge', 'octave-shift', 'pedal']);
  const pairedIds = new Set<string>();
  const groupedSpans = new Map<string, typeof directionEntries>();

  directionEntries.forEach((entry) => {
    if (!pairedSpanKinds.has(entry.direction.kind) || entry.direction.number == null) return;
    const key = `${entry.sourceStaffIndex}:${entry.direction.kind}:${entry.direction.number}`;
    const group = groupedSpans.get(key) ?? [];
    group.push(entry);
    groupedSpans.set(key, group);
  });

  groupedSpans.forEach((group) => {
    const hasStart = group.some((entry) => entry.direction.value !== 'stop');
    const hasStop = group.some((entry) => entry.direction.value === 'stop');
    if (!hasStart || !hasStop) return;
    group.forEach((entry) => pairedIds.add(entry.direction.id));
  });

  return directionEntries.filter((entry) => {
    if (!pairedSpanKinds.has(entry.direction.kind)) return true;
    return pairedIds.has(entry.direction.id);
  });
}

/**
 * How far a part's written pitch stands from its sound, in semitones and in staff steps, octaves
 * included. A clarinet in B flat: -2 and -1 (it sounds a major second below what is written).
 */
export function partTransposition(part: { chromaticTranspose?: number; diatonicTranspose?: number; transposeOctaveChange?: number }) {
  const octaves = part.transposeOctaveChange ?? 0;
  const chromatic = part.chromaticTranspose ?? 0;
  const diatonic = part.diatonicTranspose ?? Math.round((chromatic * 7) / 12);
  return { chromatic: chromatic + 12 * octaves, diatonic: diatonic + 7 * octaves };
}

const STEP_NAMES = ['C', 'D', 'E', 'F', 'G', 'A', 'B'];
const STEP_SEMITONES = [0, 2, 4, 5, 7, 9, 11];

/** A pitch moved by an interval of `diatonic` staff steps and `chromatic` semitones. */
export function transposePitchByInterval<T extends { step: string; alter: number; octave: number }>(pitch: T, diatonic: number, chromatic: number): T {
  const stepIndex = STEP_NAMES.indexOf(pitch.step);
  if (stepIndex < 0 || (diatonic === 0 && chromatic === 0)) return pitch;
  const midi = pitch.octave * 12 + STEP_SEMITONES[stepIndex]! + pitch.alter + chromatic;
  let position = pitch.octave * 7 + stepIndex + diatonic;
  let alter = midi - (Math.floor(position / 7) * 12 + STEP_SEMITONES[((position % 7) + 7) % 7]!);
  // More than a double accidental is not a spelling: take the neighbouring letter.
  while (alter > 2) { position += 1; alter = midi - (Math.floor(position / 7) * 12 + STEP_SEMITONES[((position % 7) + 7) % 7]!); }
  while (alter < -2) { position -= 1; alter = midi - (Math.floor(position / 7) * 12 + STEP_SEMITONES[((position % 7) + 7) % 7]!); }
  return { ...pitch, step: STEP_NAMES[((position % 7) + 7) % 7]!, alter, octave: Math.floor(position / 7) };
}

export function buildClipboardPayloadFromSelection(
  document: ScoreDocumentModel | null | undefined,
  selection: ScoreEventLocator[],
): ScoreClipboardPayload | null {
  if (!document || selection.length === 0) return null;

  const selectedRefs = selection
    .map((locator) => findEventReference(document, locator))
    .filter((entry): entry is NonNullable<typeof entry> => Boolean(entry));
  if (selectedRefs.length === 0) return null;
  if (new Set(selectedRefs.map(ref => ref.part.id)).size !== 1) return null;
  // One grid for the copy: the least common multiple of the divisions of the bars the selection
  // spans, in every staff it touches. Other bars of the staff do not matter: one triplet entered in
  // a later bar used to make every copy in the staff fail. The paste rescales from this grid.
  const measureIndices = selectedRefs.map(ref => ref.staff.measures.indexOf(ref.measure));
  if (measureIndices.some(index => index < 0)) return null;
  const firstMeasureIndex = Math.min(...measureIndices);
  const lastMeasureIndex = Math.max(...measureIndices);
  let sourceDivisions = 1;
  for (const staff of new Set(selectedRefs.map(ref => ref.staff))) {
    for (const measure of staff.measures.slice(firstMeasureIndex, lastMeasureIndex + 1)) {
      sourceDivisions = leastCommonMultiple(sourceDivisions, measureTiming(staff, measure).divisions);
    }
  }
  if (!Number.isSafeInteger(sourceDivisions) || sourceDivisions > MAX_CLIPBOARD_GRID) return null;
  const graceIds = new Set(document.graceNotes.map(g => g.eventId));
  for (const ref of [...selectedRefs]) {
    if (ref.event.durationDivisions <= 0) continue;
    for (const grace of ref.voice.events.filter(e => graceIds.has(e.id) && e.timestampNum === ref.event.timestampNum)) {
      if (!selectedRefs.some(other => other.event.id === grace.id)) selectedRefs.push({ ...ref, event: grace });
    }
  }


  const timelines = new Map<StaffNode, StaffTimelineEntry[]>();
  const copiedEvents = selectedRefs.map((ref) => {
    let timeline = timelines.get(ref.staff);
    if (!timeline) {
      timeline = buildStaffTimeline(ref.staff, sourceDivisions, firstMeasureIndex);
      timelines.set(ref.staff, timeline);
    }
    const measureEntry = timeline.find((entry) => entry.measure === ref.measure);
    if (!measureEntry) return null;

    const event = structuredClone(ref.event);
    // The event's duration is in its own bar's divisions; the payload holds the copy's grid.
    event.durationDivisions = (event.durationDivisions * sourceDivisions) / measureEntry.divisions;
    return {
      sourceStaffIndex: ref.staff.staffIndex,
      sourceVoiceId: ref.voice.voiceId,
      absStart: measureEntry.startOffset + timestampToDivisionsOffset(
        sourceDivisions,
        ref.event.timestampNum,
        ref.event.timestampDen,
      ),
      event,
    };
  }).filter((entry): entry is NonNullable<typeof entry> => Boolean(entry));
  if (copiedEvents.length === 0) return null;

  // Chord tones copied without the note that carries their chord (one tone of a chord selected):
  // the lowest-ordered copy at that onset becomes the carrying note, or the paste would write a
  // chord tone with nothing under it.
  const onsetKey = (entry: (typeof copiedEvents)[number]) => `${entry.sourceStaffIndex}:${entry.sourceVoiceId}:${entry.absStart}`;
  const onsetsWithRoot = new Set(copiedEvents
    .filter((entry) => !entry.event.isChord && !graceIds.has(entry.event.id))
    .map(onsetKey));
  const promoted = new Set<string>();
  for (const entry of copiedEvents) {
    if (!entry.event.isChord || graceIds.has(entry.event.id)) continue;
    const key = onsetKey(entry);
    if (onsetsWithRoot.has(key) || promoted.has(key)) continue;
    entry.event.isChord = false;
    promoted.add(key);
  }

  const clipStart = copiedEvents.reduce((min, entry) => Math.min(min, entry.absStart), Number.POSITIVE_INFINITY);
  const clipEnd = copiedEvents.reduce(
    (max, entry) => Math.max(max, entry.absStart + entry.event.durationDivisions),
    clipStart,
  );
  const selectedEventIds = new Set(copiedEvents.map((entry) => entry.event.id));
  if (document.tuplets.some(t => t.eventIds.some(id => selectedEventIds.has(id)) && !t.eventIds.every(id => selectedEventIds.has(id)))) return null;

  const selectedStaffIndices = new Set(copiedEvents.map((entry) => entry.sourceStaffIndex));

  const noteSpanners = document.slurs
    .filter((slur) => (
      (slur.startEventId && selectedEventIds.has(slur.startEventId))
      || (slur.stopEventId && selectedEventIds.has(slur.stopEventId))
    ))
    .map((slur) => structuredClone(slur));

  const timedDirections = buildDirectionEntries(document, selectedStaffIndices, selectedRefs[0]!.part.id, sourceDivisions, firstMeasureIndex)
    .filter((entry) => entry.absStart >= clipStart && entry.absStart <= clipEnd)
    .map((entry) => ({
      sourceStaffIndex: entry.sourceStaffIndex,
      absStart: entry.absStart - clipStart,
      direction: entry.direction,
    }));

  const lanes = copiedEvents
    .reduce<Map<string, { sourceStaffIndex: number; sourceVoiceId: number }>>((map, entry) => {
      const key = `${entry.sourceStaffIndex}:${entry.sourceVoiceId}`;
      if (!map.has(key)) {
        map.set(key, {
          sourceStaffIndex: entry.sourceStaffIndex,
          sourceVoiceId: entry.sourceVoiceId,
        });
      }
      return map;
    }, new Map())
    .values();

  return {
    kind: 'score-content',
    version: 1,
    sourceDivisions,
    sourceTranspose: partTransposition(selectedRefs[0]!.part),
    tuplets: document.tuplets.filter(t => t.eventIds.every(id => selectedEventIds.has(id))).map(t => structuredClone(t)),
    graceNotes: document.graceNotes.filter(g => selectedEventIds.has(g.eventId)).map(g => structuredClone(g)),
    durationDivisions: Math.max(1, clipEnd - clipStart),
    lanes: [...lanes].sort((left, right) => (
      left.sourceStaffIndex - right.sourceStaffIndex
      || left.sourceVoiceId - right.sourceVoiceId
    )),
    timeline: copiedEvents
      .map((entry) => ({
        sourceStaffIndex: entry.sourceStaffIndex,
        sourceVoiceId: entry.sourceVoiceId,
        absStart: entry.absStart - clipStart,
        event: entry.event,
      }))
      .sort((left, right) => (
        left.absStart - right.absStart
        || left.sourceStaffIndex - right.sourceStaffIndex
        || left.sourceVoiceId - right.sourceVoiceId
        || Number(right.event.durationDivisions === 0) - Number(left.event.durationDivisions === 0)
        || Number(left.event.isChord) - Number(right.event.isChord)
        || (left.event.durationDivisions === 0 && right.event.durationDivisions === 0 ? 0 : left.event.id.localeCompare(right.event.id))
      )),
    noteSpanners,
    timedDirections,
  };
}
