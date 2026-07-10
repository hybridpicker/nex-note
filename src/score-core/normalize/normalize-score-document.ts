import { decomposeDurationDivisions, describeDuration, isRepresentableDuration } from '@/src/score-core/duration-utils';
import type { MeasureAttributes, PartNode, ScoreDocumentModel, TimedEvent } from '@/src/score-core/model/types';

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

function normalizeRestEventDuration(event: TimedEvent, divisions: number, tupletEventIds: ReadonlySet<string>): TimedEvent[] {
  if (event.kind !== 'rest' || event.isChord) return [event];
  // Tuplet rests intentionally use sounding durations that are not standalone
  // binary/dotted values. Their written duration is interpreted with the
  // TupletSpan ratio and must remain one identity-bearing rhythmic unit.
  if (tupletEventIds.has(event.id)) return [event];
  const beatDivisions = Math.max(divisions, 1);
  const crossesBeatBoundary = event.timestampNum % beatDivisions !== 0
    && event.durationDivisions > beatDivisions - (event.timestampNum % beatDivisions);
  const chunks = isRepresentableDuration(event.durationDivisions, divisions) && !crossesBeatBoundary
    ? [event.durationDivisions]
    : decomposeDurationDivisions(event.durationDivisions, divisions, 0, event.timestampNum);
  let offset = event.timestampNum;
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
  let time: { beats: number; beatType: number } | null = null;

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
          };
        }
        if (divisions != null && time != null) return { divisions, time };
      }
    }
  }

  return { divisions, time };
}

export function normalizeScoreDocument(document: ScoreDocumentModel): ScoreDocumentModel {
  const next = cloneDocument(document);
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
            .flatMap((event) => normalizeRestEventDuration(event, effectiveDivisions, tupletEventIds))
            .sort((a, b) => (
              a.timestampNum - b.timestampNum
              || Number(a.isChord) - Number(b.isChord)
              || a.id.localeCompare(b.id)
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
  })).filter((line) => line.text);
  next.layoutHints = [...(next.layoutHints ?? [])];
  next.index = rebuildIndex(next);

  return next;
}
