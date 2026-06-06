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

function strongMetricSplitPoints(input: {
  beats: number;
  beatType: number;
  divisions: number;
  measureDurationDivisions: number;
}) {
  const quarterDivisions = Math.max(input.divisions, 1);
  const beatDivisions = Math.max(1, Math.round((4 * quarterDivisions) / input.beatType));

  // Skeleton Gould-style meter map. The first hard rule is the 4/4 half-bar:
  // do not hide beat 3 inside a longer value that started on beat 2.
  if (input.beats === 4 && input.beatType === 4) {
    return [2 * quarterDivisions];
  }

  // Conservative default for compound or unfamiliar meters: expose the bar
  // midpoint only when it falls exactly on the current beat grid.
  const midpoint = input.measureDurationDivisions / 2;
  return Number.isInteger(midpoint) && midpoint % beatDivisions === 0 ? [midpoint] : [];
}

function splitEventAtMetricBoundaries(input: {
  event: TimedEvent;
  divisions: number;
  measureDurationDivisions: number;
  metricSplitPoints: number[];
  hints?: MeasureSpellingHints;
}): RhythmSpellingFragmentWithEvent[] {
  const start = eventStartDivisions(input.event, input.divisions);
  const end = start + Math.max(input.event.durationDivisions, 0);
  const splitPoints = normalizeSplitPoints([
    ...input.metricSplitPoints,
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
  const metricSplitPoints = strongMetricSplitPoints({
    beats: time.beats,
    beatType: time.beatType,
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
