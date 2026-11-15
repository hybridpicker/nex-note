import { decomposeDurationDivisions, describeDuration, isRepresentableDuration } from '@/src/score-core/duration-utils';
import type { MeasureAttributes, PartNode, ScoreDocumentModel, TimedEvent } from '@/src/score-core/model/types';
import { decomposeRestSpanDivisions, isRestSpelledForMeter, resolveRestSpellingGrid } from '@/src/score-core/rest-spelling';

function cloneDocument<T>(value: T): T {
  return structuredClone(value);
}

function normalizeAttributes(attributes: MeasureAttributes[]): MeasureAttributes[] {
  return attributes.map((attribute, index) => ({
    ...attribute,
    id: attribute.id || `attr:${index}`,
    clefs: [...(attribute.clefs ?? [])].sort((a, b) => a.staffIndex - b.staffIndex),
    keyFifths: attribute.keyFifths,
    time: attribute.time,
  }));
}

type NormalizedTimeSignature = { beats: number; beatType: number; beatGroups?: number[] } | null;

function restChunksForMeter(event: TimedEvent, offset: number, divisions: number, time: NormalizedTimeSignature) {
  if (resolveRestSpellingGrid(divisions, time).compound) {
    // Compound meters (6/8, 9/8, 12/8) beat in dotted quarters: the same rule the command
    // executor writes rests with, so its output is a fixed point here.
    return isRepresentableDuration(event.durationDivisions, divisions)
      && isRestSpelledForMeter(event.durationDivisions, divisions, offset, time)
      ? [event.durationDivisions]
      : decomposeRestSpanDivisions(event.durationDivisions, divisions, 0, offset, time);
  }
  const beatDivisions = Math.max(divisions, 1);
  const crossesBeatBoundary = offset % beatDivisions !== 0
    && event.durationDivisions > beatDivisions - (offset % beatDivisions);
  return isRepresentableDuration(event.durationDivisions, divisions) && !crossesBeatBoundary
    ? [event.durationDivisions]
    : decomposeDurationDivisions(event.durationDivisions, divisions, 0, offset);
}

function normalizeRestEventDuration(
  event: TimedEvent,
  divisions: number,
  tupletEventIds: ReadonlySet<string>,
  time: NormalizedTimeSignature = null,
): TimedEvent[] {
  if (event.kind !== 'rest' || event.isChord) return [event];
  // Tuplet rests intentionally use sounding durations that are not standalone
  // binary/dotted values. Their written duration is interpreted with the
  // TupletSpan ratio and must remain one identity-bearing rhythmic unit.
  if (tupletEventIds.has(event.id)) return [event];
  // The bar offset in divisions; an event stored on another timestamp grid (a denominator other
  // than 4 x divisions) is converted, so the beat test and the fragments use the same position.
  const exactOffset = (event.timestampNum / Math.max(event.timestampDen, 1)) * Math.max(divisions, 1) * 4;
  if (!Number.isFinite(exactOffset) || Math.abs(exactOffset - Math.round(exactOffset)) > 1e-9) return [event];
  const chunks = restChunksForMeter(event, Math.round(exactOffset), divisions, time);
  if (chunks.length === 1 && event.timestampDen === Math.max(divisions * 4, 1)) {
    const duration = describeDuration(chunks[0]!, divisions);
    return [{ ...event, durationType: duration.type, isDotted: duration.dotted }];
  }
  let offset = Math.round(exactOffset);
  return chunks.map((durationDivisions, index) => {
    const duration = describeDuration(durationDivisions, divisions);
    const fragment: TimedEvent = {
      ...event,
      id: index === 0 ? event.id : `${event.id}:normalized-rest:${index}`,
      timestampNum: offset,
      timestampDen: Math.max(divisions * 4, 1),
      durationDivisions,
      durationType: duration.type,
      isDotted: duration.dotted,
    };
    offset += durationDivisions;
    return fragment;
  });
}

function rebuildIndex(document: ScoreDocumentModel): ScoreDocumentModel['index'] {
  const measureIds: ScoreDocumentModel['index']['measureIds'] = {};
  const voiceIds: ScoreDocumentModel['index']['voiceIds'] = {};
  const eventIds: ScoreDocumentModel['index']['eventIds'] = {};

  document.score.parts.forEach((part) => {
    part.staves.forEach((staff) => {
      staff.measures.forEach((measure) => {
        measureIds[measure.measureNumber] = [...(measureIds[measure.measureNumber] ?? []), measure.id];
        measure.voices.forEach((voice) => {
          voiceIds[`${measure.measureNumber}:${staff.staffIndex}:${voice.voiceId}`] = voice.id;
          voice.events.forEach((event) => {
            eventIds[`${measure.measureNumber}:${staff.staffIndex}:${voice.voiceId}:${event.timestampNum}/${event.timestampDen}`] = event.id;
          });
        });
      });
    });
  });

  return { measureIds, voiceIds, eventIds };
}

function findPartEffectiveTiming(part: PartNode, measureNumber: number) {
  let divisions: number | null = null;
  let time: { beats: number; beatType: number; beatGroups?: number[] } | null = null;

  for (const staff of part.staves) {
    const measureIndex = staff.measures.findIndex((measure) => measure.measureNumber === measureNumber);
    if (measureIndex < 0) continue;

    for (let index = measureIndex; index >= 0; index -= 1) {
      const attributes = staff.measures[index]?.attributes ?? [];
      for (let attributeIndex = attributes.length - 1; attributeIndex >= 0; attributeIndex -= 1) {
        const attribute = attributes[attributeIndex]!;
        if (divisions == null && typeof attribute.divisions === 'number' && attribute.divisions > 0) {
          divisions = attribute.divisions;
        }
        if (time == null && attribute.time?.beats && attribute.time.beatType) {
          time = {
            beats: attribute.time.beats,
            beatType: attribute.time.beatType,
            ...(attribute.time.beatGroups ? { beatGroups: [...attribute.time.beatGroups] } : {}),
          };
        }
        if (divisions != null && time != null) return { divisions, time };
      }
    }
  }

  return { divisions, time };
}

export function normalizeScoreDocument(document: ScoreDocumentModel): ScoreDocumentModel {
  return normalizeScoreDocumentInPlace(cloneDocument(document));
}

/**
 * Normalizes `document` in place and returns it. Only for a document the caller exclusively owns
 * and has not published yet, such as the fresh clone the command executor returns; every other
 * caller must use `normalizeScoreDocument`, which normalizes a copy.
 *
 * Mutated in place: the document root, every part (names), every measure (`attributes`) and every
 * voice (`events`). Events, beams, slurs and other link objects are not mutated.
 */
export function normalizeScoreDocumentInPlace(document: ScoreDocumentModel): ScoreDocumentModel {
  const next = document;
  const tupletEventIds = new Set((next.tuplets ?? []).flatMap((tuplet) => tuplet.eventIds));

  next.metadata = {
    title: next.metadata.title?.trim() || undefined,
    subtitle: next.metadata.subtitle?.trim() || undefined,
    arranger: next.metadata.arranger?.trim() || undefined,
    composer: next.metadata.composer?.trim() || undefined,
  };

  next.score.parts.forEach((part) => {
    part.name = part.name.trim() || part.sourcePartId;
    part.abbreviation = part.abbreviation?.trim() || undefined;
    part.instrumentName = part.instrumentName?.trim() || undefined;

    part.staves.forEach((staff) => {
      let effectiveDivisions = 1;
      staff.measures.forEach((measure) => {
        measure.attributes = normalizeAttributes(measure.attributes);
        const partTiming = findPartEffectiveTiming(part, measure.measureNumber);
        effectiveDivisions = measure.attributes[0]?.divisions ?? partTiming.divisions ?? effectiveDivisions;
        measure.voices.forEach((voice) => {
          voice.events = voice.events
            .flatMap((event) => normalizeRestEventDuration(event, effectiveDivisions, tupletEventIds, partTiming.time))
            .sort((a, b) => (
              a.timestampNum - b.timestampNum
              || Number(b.durationDivisions === 0) - Number(a.durationDivisions === 0)
              || Number(a.isChord) - Number(b.isChord)
              || (a.durationDivisions === 0 && b.durationDivisions === 0 ? 0 : a.id.localeCompare(b.id))
            ));
        });
      });
    });
  });

  next.slurs = [...(next.slurs ?? [])];
  next.beams = [...(next.beams ?? [])];
  next.tuplets = [...(next.tuplets ?? [])];
  next.chordGroups = [...(next.chordGroups ?? [])];
  next.graceNotes = [...(next.graceNotes ?? [])];
  next.lyricLines = [...(next.lyricLines ?? [])].map((line) => ({
    ...line,
    text: line.text.trim(),
  })).filter((line) => line.text || line.extend);
  next.layoutHints = [...(next.layoutHints ?? [])];
  next.index = rebuildIndex(next);

  return next;
}
