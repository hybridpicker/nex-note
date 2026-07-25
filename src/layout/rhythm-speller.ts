import { describeDuration } from '@/src/score-core/duration-utils';
import { getEffectiveMeasureTimingFromStaff } from '@/src/score-core/measure-timing';
import type { ScoreDocumentModel, StaffNode, TimedEvent } from '@/src/score-core/model/types';
import type {
  MeasureSpellingHints,
  RhythmSpellingFragment,
  RhythmSpellingFragmentWithEvent,
  RhythmSpellingMeasureKey,
  RhythmSpellingProjection,
  RhythmSpellingProjectionDiagnostic,
  RhythmSpellingVoiceProjection,
} from '@/src/layout/types';

export type MeasureSpellingHintMap = Record<string, MeasureSpellingHints>;

export function measureSpellingHintKey(input: RhythmSpellingMeasureKey) {
  return `${input.partId}:${input.staffIndex}:${input.measureNumber}`;
}

function eventStartDivisions(event: TimedEvent, divisions: number) {
  return Math.max(0, Math.round((event.timestampNum / Math.max(event.timestampDen, 1)) * divisions * 4));
}

function normalizeSplitPoints(points: number[], start: number, end: number) {
  return [...new Set(points
    .map((point) => Math.trunc(point))
    .filter((point) => point > start && point < end))]
    .sort((left, right) => left - right);
}

interface MetricSplitPoint {
  point: number;
  strength: 'hard' | 'pulse';
  gridDivisions: number;
}

function buildMetricSplitPoints(input: {
  beats: number;
  beatType: number;
  beatGroups?: number[];
  divisions: number;
  measureDurationDivisions: number;
}) {
  const quarterDivisions = Math.max(input.divisions, 1);
  const beatDivisions = Math.max(1, Math.round((4 * quarterDivisions) / input.beatType));

  const pulseDivisions = input.beatType === 8 && input.beats >= 6 && input.beats % 3 === 0
    ? beatDivisions * 3
    : beatDivisions;
  const points: MetricSplitPoint[] = [];
  const compoundMeter = input.beatType === 8 && input.beats >= 6 && input.beats % 3 === 0;
  const additiveGroups = input.beatGroups?.filter((group) => Number.isInteger(group) && group > 0);
  const hasAdditiveGrouping = Boolean(
    additiveGroups
    && additiveGroups.length > 1
    && additiveGroups.reduce((sum, group) => sum + group, 0) === input.beats,
  );

  if (hasAdditiveGrouping && additiveGroups) {
    let cumulativeBeats = 0;
    for (const group of additiveGroups.slice(0, -1)) {
      cumulativeBeats += group;
      points.push({
        point: cumulativeBeats * beatDivisions,
        strength: 'hard',
        gridDivisions: group * beatDivisions,
      });
    }
  } else if (compoundMeter) {
    for (let point = pulseDivisions; point < input.measureDurationDivisions; point += pulseDivisions) {
      points.push({ point, strength: 'hard', gridDivisions: pulseDivisions });
    }
  } else {
    // In simple meters, a value that begins between beats should not hide the
    // next beat boundary. Values that begin on a beat remain intact, so common
    // on-beat quarters, halves, and dotted values are not over-split.
    for (let point = beatDivisions; point < input.measureDurationDivisions; point += beatDivisions) {
      points.push({ point, strength: 'pulse', gridDivisions: beatDivisions });
    }
  }

  // In common time the half-bar is a hard visual boundary even for a value
  // that began cleanly on beat 2. This is the most visible Gould/MuseScore
  // regrouping rule and prevents beat 3 from disappearing inside syncopation.
  if (input.beats === 4 && input.beatType === 4) {
    const halfBar = 2 * quarterDivisions;
    const existing = points.find((entry) => entry.point === halfBar);
    if (existing) existing.strength = 'hard';
    else points.push({ point: halfBar, strength: 'hard', gridDivisions: pulseDivisions });
  }

  // Compound meters expose their dotted-beat grouping. In 6/8 this makes the
  // 3+3 structure explicit; 9/8 and 12/8 receive the same pulse treatment.
  return points.sort((left, right) => left.point - right.point);
}

function splitEventAtMetricBoundaries(input: {
  event: TimedEvent;
  divisions: number;
  measureDurationDivisions: number;
  metricSplitPoints: MetricSplitPoint[];
  hints?: MeasureSpellingHints;
}): RhythmSpellingFragmentWithEvent[] {
  const start = eventStartDivisions(input.event, input.divisions);
  const end = start + Math.max(input.event.durationDivisions, 0);
  const spansFullMeasure = start === 0 && end === input.measureDurationDivisions;
  const metricPoints = spansFullMeasure
    ? []
    : input.metricSplitPoints
      .filter((boundary) => boundary.strength === 'hard' || start % Math.max(boundary.gridDivisions, 1) !== 0)
      .map((boundary) => boundary.point);
  const splitPoints = normalizeSplitPoints([
    ...metricPoints,
    ...(input.hints?.forceSplitAt ?? []),
  ], start, end);
  const boundaries = [start, ...splitPoints, end];

  return boundaries.slice(0, -1).map((fragmentStart, index) => {
    const fragmentEnd = boundaries[index + 1]!;
    const durationDivisions = Math.max(fragmentEnd - fragmentStart, 0);
    const described = describeDuration(durationDivisions, input.divisions);
    const hasPrevious = index > 0;
    const hasNext = index < boundaries.length - 2;
    const fragment: RhythmSpellingFragment = {
      sourceEventId: input.event.id,
      fragmentId: `${input.event.id}:spell:${index}`,
      startDivisions: fragmentStart,
      durationDivisions,
      durationType: described.type,
      isDotted: described.dotted || undefined,
      tieStart: input.event.kind === 'note' && (hasNext || (!hasNext && input.event.tieStart)) ? true : undefined,
      tieStop: input.event.kind === 'note' && hasPrevious ? true : undefined,
    };
    return {
      ...fragment,
      event: input.event,
    };
  }).filter((fragment) => fragment.durationDivisions > 0);
}

function preserveImportedFragments(input: {
  event: TimedEvent;
  divisions: number;
}): RhythmSpellingFragmentWithEvent[] {
  const described = describeDuration(input.event.durationDivisions, input.divisions);
  return [{
    sourceEventId: input.event.id,
    fragmentId: `${input.event.id}:preserved:0`,
    startDivisions: eventStartDivisions(input.event, input.divisions),
    durationDivisions: input.event.durationDivisions,
    durationType: input.event.durationType ?? described.type,
    isDotted: (input.event.isDotted ?? described.dotted) || undefined,
    tieStart: input.event.tieStart || undefined,
    event: input.event,
  }];
}

export function spellVoiceRhythm(input: {
  partId: string;
  staff: StaffNode;
  measureNumber: number;
  voiceId: number;
  events: TimedEvent[];
  hints?: MeasureSpellingHints;
}): RhythmSpellingVoiceProjection {
  const timing = getEffectiveMeasureTimingFromStaff(input.staff, {
    measureNumber: input.measureNumber,
  });
  const divisions = timing?.divisions ?? 1;
  const measureDurationDivisions = timing?.durationDivisions ?? divisions * 4;
  const time = timing?.timeSignature ?? { beats: 4, beatType: 4 };
  const metricSplitPoints = buildMetricSplitPoints({
    beats: time.beats,
    beatType: time.beatType,
    beatGroups: time.beatGroups,
    divisions,
    measureDurationDivisions,
  });
  const sortedEvents = [...input.events].sort((left, right) => (
    eventStartDivisions(left, divisions) - eventStartDivisions(right, divisions)
    || Number(left.isChord) - Number(right.isChord)
    || left.id.localeCompare(right.id)
  ));

  return {
    partId: input.partId,
    staffIndex: input.staff.staffIndex,
    measureNumber: input.measureNumber,
    voiceId: input.voiceId,
    divisions,
    measureDurationDivisions,
    fragments: sortedEvents.flatMap((event) => (
      input.hints?.preserveImportedSpelling
        ? preserveImportedFragments({ event, divisions })
        : splitEventAtMetricBoundaries({
            event,
            divisions,
            measureDurationDivisions,
            metricSplitPoints,
            hints: input.hints,
          })
    )),
  };
}

export function buildRhythmSpellingProjection(
  document: ScoreDocumentModel | null,
  hints: MeasureSpellingHintMap = {},
): RhythmSpellingProjection {
  const diagnostics: RhythmSpellingProjectionDiagnostic[] = [];
  const voices: RhythmSpellingVoiceProjection[] = [];

  if (!document) {
    diagnostics.push({
      level: 'error',
      code: 'projection_missing_core_document',
      message: 'No core score document is available for rhythm spelling.',
    });
    return {
      schemaVersion: 1,
      kind: 'nex-note-rhythm-spelling-projection',
      generatedAt: new Date().toISOString(),
      voices,
      diagnostics,
    };
  }

  for (const part of document.score.parts) {
    for (const staff of part.staves) {
      for (const measure of staff.measures) {
        const measureKey = measureSpellingHintKey({
          partId: part.id,
          staffIndex: staff.staffIndex,
          measureNumber: measure.measureNumber,
        });
        const measureHints = hints[measureKey];
        for (const voice of measure.voices) {
          voices.push(spellVoiceRhythm({
            partId: part.id,
            staff,
            measureNumber: measure.measureNumber,
            voiceId: voice.voiceId,
            events: voice.events,
            hints: measureHints,
          }));
        }
      }
    }
  }

  return {
    schemaVersion: 1,
    kind: 'nex-note-rhythm-spelling-projection',
    generatedAt: new Date().toISOString(),
    voices,
    diagnostics,
  };
}

export interface RhythmSpellingTarget {
  partId?: string | null;
  measureNumber: number;
  staffIndex: number;
  voiceId: number;
  timestampNum: number;
  timestampDen: number;
}

export interface AppliedRhythmSpellingResult {
  splitEventCount: number;
  createdFragmentCount: number;
}

/**
 * Materialize the projection for edited measures so OSMD, MusicXML export,
 * playback, and subsequent editing all observe the same tied fragments.
 * Imported measures remain untouched until a rhythmic command targets them.
 */
export function applyRhythmSpellingToDocument(
  document: ScoreDocumentModel,
  targets: RhythmSpellingTarget[],
): AppliedRhythmSpellingResult {
  if (targets.length === 0) return { splitEventCount: 0, createdFragmentCount: 0 };

  const excludedEventIds = new Set([
    ...document.tuplets.flatMap((tuplet) => tuplet.eventIds),
    ...document.graceNotes.map((graceNote) => graceNote.eventId),
  ]);
  const lastFragmentBySource = new Map<string, string>();
  let splitEventCount = 0;
  let createdFragmentCount = 0;

  const isTargeted = (partId: string, staffIndex: number, measureNumber: number) => targets.some((target) => (
    (!target.partId || target.partId === partId)
    && target.staffIndex === staffIndex
    && target.measureNumber === measureNumber
  ));
  const isEventTargeted = (partId: string, event: TimedEvent) => targets.some((target) => (
    (!target.partId || target.partId === partId)
    && target.staffIndex === event.staffIndex
    && target.measureNumber === event.measureNumber
    && target.voiceId === event.voiceId
    && target.timestampNum * event.timestampDen === event.timestampNum * target.timestampDen
  ));

  for (const part of document.score.parts) {
    for (const staff of part.staves) {
      for (const measure of staff.measures) {
        if (!isTargeted(part.id, staff.staffIndex, measure.measureNumber)) continue;

        for (const voice of measure.voices) {
          voice.events = voice.events.flatMap((event, eventIndex) => {
            if (!isEventTargeted(part.id, event)) return [event];
            // Evaluate one event at a time. Legacy/imported documents can
            // temporarily contain duplicate IDs during an atomic chord batch;
            // ID-keyed grouping would otherwise multiply those chord tones.
            const eventProjection = spellVoiceRhythm({
              partId: part.id,
              staff,
              measureNumber: measure.measureNumber,
              voiceId: voice.voiceId,
              events: [event],
            });
            const fragments = eventProjection.fragments;
            if (fragments.length <= 1 || excludedEventIds.has(event.id)) return [event];

            splitEventCount += 1;
            createdFragmentCount += fragments.length - 1;
            const materialized = fragments.map((fragment, index) => {
              const next = structuredClone(event);
              next.id = index === 0 ? event.id : `${event.id}:spell:${eventIndex}:${index}`;
              next.timestampNum = fragment.startDivisions;
              next.timestampDen = Math.max(eventProjection.divisions * 4, 1);
              next.durationDivisions = fragment.durationDivisions;
              next.durationType = fragment.durationType;
              next.isDotted = fragment.isDotted || undefined;
              next.tieStart = event.kind === 'note' ? fragment.tieStart || undefined : undefined;
              if (index > 0) {
                next.articulations = [];
                next.articulationPlacements = undefined;
                next.lyrics = [];
                next.preservedXml = undefined;
                if (next.kind === 'note') {
                  next.writtenAccidental = undefined;
                  next.accidentalCautionary = undefined;
                  next.accidentalEnclosure = undefined;
                }
              }
              return next;
            });
            lastFragmentBySource.set(event.id, materialized[materialized.length - 1]!.id);
            return materialized;
          });
        }
      }
    }
  }

  if (lastFragmentBySource.size > 0) {
    document.slurs = document.slurs.map((slur) => ({
      ...slur,
      stopEventId: slur.stopEventId ? lastFragmentBySource.get(slur.stopEventId) ?? slur.stopEventId : slur.stopEventId,
    }));
    document.glissandos = document.glissandos.map((glissando) => ({
      ...glissando,
      stopEventId: glissando.stopEventId
        ? lastFragmentBySource.get(glissando.stopEventId) ?? glissando.stopEventId
        : glissando.stopEventId,
    }));
    document.tremolos = document.tremolos.map((tremolo) => ({
      ...tremolo,
      eventId: tremolo.type === 'stop'
        ? lastFragmentBySource.get(tremolo.eventId) ?? tremolo.eventId
        : tremolo.eventId,
    }));
  }

  return { splitEventCount, createdFragmentCount };
}

export function invalidateMeasureImportedSpelling(
  hints: MeasureSpellingHintMap,
  key: RhythmSpellingMeasureKey,
): MeasureSpellingHintMap {
  const next = { ...hints };
  const id = measureSpellingHintKey(key);
  const current = next[id];
  if (!current) return next;
  next[id] = {
    ...current,
    preserveImportedSpelling: false,
  };
  return next;
}
