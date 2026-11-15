import {
  buildNotatableDurations,
  describeDuration,
  describeDurationStrict,
  type DurationCandidate,
  type NotatableDuration,
} from '@/src/score-core/duration-utils';
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

export interface TupletRatio {
  actualNotes: number;
  normalNotes: number;
}

function buildTupletRatioMap(document: ScoreDocumentModel): Map<string, TupletRatio> {
  const ratios = new Map<string, TupletRatio>();
  // Nested tuplets multiply, as in the MusicXML <time-modification> export.
  for (const tuplet of document.tuplets ?? []) {
    const actualNotes = tuplet.actualNotes && tuplet.actualNotes > 0 ? tuplet.actualNotes : 1;
    const normalNotes = tuplet.normalNotes && tuplet.normalNotes > 0 ? tuplet.normalNotes : 1;
    for (const eventId of tuplet.eventIds) {
      const current = ratios.get(eventId) ?? { actualNotes: 1, normalNotes: 1 };
      ratios.set(eventId, {
        actualNotes: current.actualNotes * actualNotes,
        normalNotes: current.normalNotes * normalNotes,
      });
    }
  }
  return ratios;
}

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
  /** The 4/4 half-bar, which a single value starting on beat 1 may cross. */
  halfBar?: boolean;
}

interface MetricValueUnits {
  /** The felt beat: a quarter in 4/4, a half in 2/2, a dotted quarter in 6/8. */
  pulseDivisions: number;
  /** The written beat unit of the time signature (an eighth in 6/8). */
  beatDivisions: number;
}

function buildMetricValueUnits(input: { beats: number; beatType: number; divisions: number }): MetricValueUnits {
  const beatDivisions = Math.max(1, Math.round((4 * Math.max(input.divisions, 1)) / input.beatType));
  const compoundMeter = input.beatType === 8 && input.beats >= 6 && input.beats % 3 === 0;
  return {
    pulseDivisions: compoundMeter ? beatDivisions * 3 : beatDivisions,
    beatDivisions,
  };
}

/**
 * The single value for one spelled fragment. Two dots count only for an
 * unsplit event that already declares that spelling (imported MusicXML);
 * every other fragment is a plain or single-dotted value.
 */
function describeFragmentValue(input: {
  event: TimedEvent;
  durationDivisions: number;
  divisions: number;
  tuplet?: TupletRatio;
}): NotatableDuration | null {
  const single = describeDurationStrict(input.durationDivisions, input.divisions, { tuplet: input.tuplet });
  if (single) return single;
  const declaredDots = input.event.dotCount ?? 0;
  if (declaredDots >= 2 && input.durationDivisions === input.event.durationDivisions) {
    const multiDotted = describeDurationStrict(input.durationDivisions, input.divisions, { tuplet: input.tuplet, maxDots: 2 });
    if (multiDotted && multiDotted.dotCount === declaredDots && multiDotted.type === input.event.durationType) {
      return multiDotted;
    }
  }
  return null;
}

/**
 * Splits a span that is not a single value into tied single values, largest
 * first, with every tie on a pulse boundary when the value is a pulse or
 * longer, and every shorter value starting on its own subdivision grid
 * (Gould, Behind Bars: "show the beat"). Returns the interior split points,
 * or `null` when the grid cannot express the span with standard values.
 */
function decomposeSpanIntoSingleValues(input: {
  start: number;
  end: number;
  divisions: number;
  units: MetricValueUnits;
}): number[] | null {
  const candidates = buildNotatableDurations(input.divisions);
  if (candidates.length === 0) return null;
  const pulse = Math.max(input.units.pulseDivisions, 1);
  const subUnit = Math.max(input.units.beatDivisions, 1);
  const startsAligned = (candidate: NotatableDuration, position: number) => {
    if (candidate.value >= pulse) return position % pulse === 0;
    if (candidate.dotCount === 0) return position % Math.min(candidate.value, subUnit) === 0;
    // A dotted value starts on the grid of the next larger plain value
    // (a dotted eighth on a quarter-note beat, a dotted sixteenth on an eighth).
    const grid = candidate.baseValue * 2;
    return Number.isInteger(grid) && position % grid === 0;
  };
  const points: number[] = [];
  let position = input.start;
  while (position < input.end) {
    const remaining = input.end - position;
    const exact = candidates.find((candidate) => candidate.value === remaining);
    const next = exact && startsAligned(exact, position)
      ? exact
      : candidates.find((candidate) => (
          candidate.value <= remaining
          && startsAligned(candidate, position)
          && (candidate.value < pulse || (position + candidate.value) % pulse === 0)
        ))
        ?? candidates.find((candidate) => candidate.value <= remaining);
    if (!next) return null;
    position += next.value;
    if (position < input.end) points.push(position);
  }
  return points;
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
  // A note that starts on beat 1 and is one value (dotted half, double-dotted
  // half, whole) is exempt: it is correct 4/4 notation (see `halfBar`).
  if (input.beats === 4 && input.beatType === 4) {
    const halfBar = 2 * quarterDivisions;
    const existing = points.find((entry) => entry.point === halfBar);
    if (existing) {
      existing.strength = 'hard';
      existing.halfBar = true;
    } else points.push({ point: halfBar, strength: 'hard', gridDivisions: pulseDivisions, halfBar: true });
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
  valueUnits: MetricValueUnits;
  tuplet?: TupletRatio;
  hints?: MeasureSpellingHints;
}): RhythmSpellingFragmentWithEvent[] {
  const start = eventStartDivisions(input.event, input.divisions);
  const end = start + Math.max(input.event.durationDivisions, 0);
  const spansFullMeasure = start === 0 && end === input.measureDurationDivisions;
  // A dotted half, double-dotted half or whole note on beat 1 of 4/4 is one
  // correct value; only a value starting later must show the half-bar.
  const singleValueOnDownbeat = start === 0
    && input.event.kind === 'note'
    && describeFragmentValue({
      event: input.event,
      durationDivisions: end - start,
      divisions: input.divisions,
      tuplet: input.tuplet,
    }) !== null;
  const metricPoints = spansFullMeasure
    ? []
    : input.metricSplitPoints
      .filter((boundary) => !(boundary.halfBar && singleValueOnDownbeat))
      .filter((boundary) => boundary.strength === 'hard' || start % Math.max(boundary.gridDivisions, 1) !== 0)
      .map((boundary) => boundary.point);
  const splitPoints = normalizeSplitPoints([
    ...metricPoints,
    ...(input.hints?.forceSplitAt ?? []),
  ], start, end);
  const metricBoundaries = [start, ...splitPoints, end];
  // A metric fragment that is still not one notatable value (for example the
  // 1.75-beat remainder of a long note carried over a barline) becomes tied
  // single values. Tuplet members keep their written value: they are never
  // materialized here and their grid is not the measure grid.
  // A rest that fills the whole bar is a whole-bar rest in any meter.
  const boundaries = input.tuplet || (spansFullMeasure && input.event.kind === 'rest')
    ? metricBoundaries
    : metricBoundaries.flatMap((fragmentStart, index) => {
        if (index === metricBoundaries.length - 1) return [fragmentStart];
        const fragmentEnd = metricBoundaries[index + 1]!;
        const length = fragmentEnd - fragmentStart;
        if (length <= 0 || describeFragmentValue({
          event: input.event,
          durationDivisions: length,
          divisions: input.divisions,
        })) return [fragmentStart];
        const interior = decomposeSpanIntoSingleValues({
          start: fragmentStart,
          end: fragmentEnd,
          divisions: input.divisions,
          units: input.valueUnits,
        });
        return [fragmentStart, ...(interior ?? [])];
      });

  return boundaries.slice(0, -1).map((fragmentStart, index) => {
    const fragmentEnd = boundaries[index + 1]!;
    const durationDivisions = Math.max(fragmentEnd - fragmentStart, 0);
    const described = describeFragmentValue({
      event: input.event,
      durationDivisions,
      divisions: input.divisions,
      tuplet: input.tuplet,
    }) ?? describeDuration(durationDivisions, input.divisions);
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
  /** Tuplet ratio per event id; tuplet members are judged in their tuplet context. */
  tupletRatios?: ReadonlyMap<string, TupletRatio>;
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
  const valueUnits = buildMetricValueUnits({ beats: time.beats, beatType: time.beatType, divisions });
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
      (input.hints?.preserveImportedSpelling || event.preservedXml?.notationChildren?.some(xml => xml.includes('nex-note:literal-duration')))
        ? preserveImportedFragments({ event, divisions })
        : splitEventAtMetricBoundaries({
            event,
            divisions,
            measureDurationDivisions,
            metricSplitPoints,
            valueUnits,
            tuplet: input.tupletRatios?.get(event.id),
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

  const tupletRatios = buildTupletRatioMap(document);
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
            tupletRatios,
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
 * True for a note that an editing path stored with the legacy fallback value
 * of `describeDuration` (the smallest value, for a duration that is no single
 * value), such as the remainder of a long note carried over a barline. Its
 * type and duration disagree, so drawing and export are wrong until it is
 * spelled as tied single values. Imported values carry their own MusicXML
 * type and are not matched.
 */
const fallbackSpellingCache = new Map<number, { singleValues: Set<number>; fallback: DurationCandidate }>();

function hasUnnotatableFallbackSpelling(event: TimedEvent, divisions: number) {
  if (event.kind !== 'note' || event.durationDivisions <= 0) return false;
  if ((event.dotCount ?? 0) > 1) return false;
  let cached = fallbackSpellingCache.get(divisions);
  if (!cached) {
    cached = {
      singleValues: new Set(buildNotatableDurations(divisions).map((candidate) => candidate.value)),
      // `describeDuration` of a duration that is no candidate value.
      fallback: describeDuration(-1, divisions),
    };
    fallbackSpellingCache.set(divisions, cached);
  }
  if (cached.singleValues.has(event.durationDivisions)) return false;
  if (event.durationType !== cached.fallback.type || Boolean(event.isDotted) !== cached.fallback.dotted) return false;
  if (event.durationDivisions === cached.fallback.value) return false;
  return !event.preservedXml?.notationChildren?.some((xml) => xml.includes('nex-note:literal-duration'));
}

/**
 * Materialize the projection for edited measures so OSMD, MusicXML export,
 * playback, and subsequent editing all observe the same tied fragments.
 * Imported measures remain untouched until a rhythmic command targets them.
 * A note stored with an impossible fallback value (see
 * `hasUnnotatableFallbackSpelling`) is spelled wherever it is, because the
 * command that wrote it may have targeted a different measure.
 */
export function applyRhythmSpellingToDocument(
  document: ScoreDocumentModel,
  targets: RhythmSpellingTarget[],
): AppliedRhythmSpellingResult {
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
      // Effective divisions, walked forward (the last <divisions> of a bar wins).
      let staffDivisions = 1;
      for (const measure of staff.measures) {
        for (const attribute of measure.attributes ?? []) {
          if (typeof attribute.divisions === 'number' && attribute.divisions > 0) staffDivisions = attribute.divisions;
        }
        const measureDivisions = staffDivisions;
        const measureTargeted = isTargeted(part.id, staff.staffIndex, measure.measureNumber);
        const needsRepair = (event: TimedEvent) => (
          !excludedEventIds.has(event.id) && hasUnnotatableFallbackSpelling(event, measureDivisions)
        );
        if (!measureTargeted && !measure.voices.some((voice) => voice.events.some(needsRepair))) continue;

        for (const voice of measure.voices) {
          voice.events = voice.events.flatMap((event, eventIndex) => {
            if (!(measureTargeted && isEventTargeted(part.id, event)) && !needsRepair(event)) return [event];
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
              // Spelling fragments are single values; a multi-dot count belongs to the source only.
              delete next.dotCount;
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
