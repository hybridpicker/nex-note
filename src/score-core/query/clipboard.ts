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

function buildStaffTimeline(staff: StaffNode): StaffTimelineEntry[] {
  let startOffset = 0;

  return staff.measures.map((measure) => {
    const timing = getEffectiveMeasureTimingFromStaff(staff, {
      measureNumber: measure.measureNumber,
    });
    const entry = {
      measure,
      startOffset,
      durationDivisions: timing?.durationDivisions ?? Math.max(1, (measure.attributes[0]?.divisions ?? 1) * 4),
      divisions: timing?.divisions ?? measure.attributes[0]?.divisions ?? 1,
    };
    startOffset += entry.durationDivisions;
    return entry;
  });
}

function getTimelineEntryForMeasure(
  timeline: StaffTimelineEntry[],
  measureNumber: number,
) {
  return timeline.find((entry) => entry.measure.measureNumber === measureNumber) ?? null;
}

function buildDirectionEntries(document: ScoreDocumentModel, staffIndices: Set<number>, partId: string) {
  const timedDirectionKinds = new Set(['wedge', 'octave-shift', 'pedal', 'dynamics']);
  const directionEntries: Array<{
    sourceStaffIndex: number;
    absStart: number;
    direction: DirectionNode;
  }> = [];

  document.score.parts.filter(part => part.id === partId).forEach((part) => {
    part.staves.forEach((staff) => {
      if (!staffIndices.has(staff.staffIndex)) return;
      const timeline = buildStaffTimeline(staff);
      timeline.forEach((entry) => {
        entry.measure.directions.forEach((direction) => {
          if (!timedDirectionKinds.has(direction.kind)) return;
          if (direction.staffIndex != null && direction.staffIndex !== staff.staffIndex) return;
          directionEntries.push({
            sourceStaffIndex: staff.staffIndex,
            absStart: entry.startOffset + (direction.timestampNum ?? 0),
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
  const grids = new Set(selectedRefs.flatMap(ref => ref.staff.measures.map(measure => getEffectiveMeasureTimingFromStaff(ref.staff, { measureNumber: measure.measureNumber })?.divisions ?? 1)));
  if (grids.size !== 1) return null;
  const sourceDivisions = [...grids][0]!;
  const graceIds = new Set(document.graceNotes.map(g => g.eventId));
  for (const ref of [...selectedRefs]) {
    if (ref.event.durationDivisions <= 0) continue;
    for (const grace of ref.voice.events.filter(e => graceIds.has(e.id) && e.timestampNum === ref.event.timestampNum)) {
      if (!selectedRefs.some(other => other.event.id === grace.id)) selectedRefs.push({ ...ref, event: grace });
    }
  }


  const copiedEvents = selectedRefs.map((ref) => {
    const timeline = buildStaffTimeline(ref.staff);
    const measureEntry = getTimelineEntryForMeasure(timeline, ref.measure.measureNumber);
    if (!measureEntry) return null;

    return {
      sourceStaffIndex: ref.staff.staffIndex,
      sourceVoiceId: ref.voice.voiceId,
      absStart: measureEntry.startOffset + timestampToDivisionsOffset(
        measureEntry.divisions,
        ref.event.timestampNum,
        ref.event.timestampDen,
      ),
      event: structuredClone(ref.event),
    };
  }).filter((entry): entry is NonNullable<typeof entry> => Boolean(entry));
  if (copiedEvents.length === 0) return null;

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

  const timedDirections = buildDirectionEntries(document, selectedStaffIndices, selectedRefs[0]!.part.id)
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
