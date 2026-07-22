import type {
  MeasureAttributes,
  MeasureNode,
  PartNode,
  ScoreDocumentModel,
  StaffNode,
} from '@/src/score-core/model/types';

export interface EffectiveTimeSignature {
  beats: number;
  beatType: number;
  beatGroups?: number[];
}

export interface EffectiveMeasureTiming {
  part: PartNode;
  staff: StaffNode;
  measure: MeasureNode;
  measureIndex: number;
  divisions: number;
  timeSignature: EffectiveTimeSignature | null;
  durationDivisions: number;
  durationRatio: number;
}

export type EffectiveStaffMeasureTiming = Omit<EffectiveMeasureTiming, 'part'>;

function findMeasureIndex(
  staff: StaffNode,
  input: { measureId?: string | null; measureNumber?: number | null },
) {
  if (input.measureId) {
    return staff.measures.findIndex((measure) => measure.id === input.measureId);
  }
  if (typeof input.measureNumber === 'number') {
    return staff.measures.findIndex((measure) => measure.measureNumber === input.measureNumber);
  }
  return -1;
}

function findEffectiveAttributeValue<T>(
  staff: StaffNode,
  measureIndex: number,
  read: (attribute: MeasureAttributes) => T | null,
) {
  for (let index = measureIndex; index >= 0; index -= 1) {
    const attributes = staff.measures[index]?.attributes ?? [];
    for (let attributeIndex = attributes.length - 1; attributeIndex >= 0; attributeIndex -= 1) {
      const value = read(attributes[attributeIndex]!);
      if (value != null) return value;
    }
  }
  return null;
}

function measureRhythmicDuration(measure: MeasureNode) {
  return measure.voices.reduce((maxDuration, voice) => {
    const voiceDuration = voice.events.reduce((voiceMax, event) => (
      event.isChord ? voiceMax : Math.max(voiceMax, event.timestampNum + event.durationDivisions)
    ), 0);
    return Math.max(maxDuration, voiceDuration);
  }, 0);
}

export function buildEffectiveMeasureTimingsFromStaff(staff: StaffNode): EffectiveStaffMeasureTiming[] {
  const timings: EffectiveStaffMeasureTiming[] = [];
  let divisions = 1;
  let timeSignature: EffectiveTimeSignature | null = null;

  staff.measures.forEach((measure, measureIndex) => {
    for (const attribute of measure.attributes) {
      if (typeof attribute.divisions === 'number' && attribute.divisions > 0) {
        divisions = attribute.divisions;
      }
      if (attribute.time?.beats && attribute.time.beatType) {
        timeSignature = {
          beats: attribute.time.beats,
          beatType: attribute.time.beatType,
          ...(attribute.time.beatGroups ? { beatGroups: [...attribute.time.beatGroups] } : {}),
        };
      }
    }

    const durationDivisions = timeSignature
      ? Math.max(1, Math.round((timeSignature.beats * divisions * 4) / timeSignature.beatType))
      : Math.max(1, divisions * 4);
    const implicitDurationDivisions = measure.implicit ? measureRhythmicDuration(measure) : 0;
    const effectiveDurationDivisions = implicitDurationDivisions > 0
      ? Math.min(durationDivisions, implicitDurationDivisions)
      : durationDivisions;
    timings.push({
      staff,
      measure,
      measureIndex,
      divisions,
      timeSignature: timeSignature ? { ...timeSignature } : null,
      durationDivisions: effectiveDurationDivisions,
      durationRatio: effectiveDurationDivisions / Math.max(divisions * 4, 1),
    });
  });

  return timings;
}

export function getEffectiveMeasureTimingFromStaff(
  staff: StaffNode,
  input: { measureId?: string | null; measureNumber?: number | null },
) {
  const measureIndex = findMeasureIndex(staff, input);
  if (measureIndex < 0) return null;

  const measure = staff.measures[measureIndex]!;
  const divisions = findEffectiveAttributeValue(staff, measureIndex, (attribute) => (
    typeof attribute.divisions === 'number' && attribute.divisions > 0 ? attribute.divisions : null
  )) ?? 1;
  const timeSignature = findEffectiveAttributeValue<EffectiveTimeSignature>(staff, measureIndex, (attribute) => (
    attribute.time?.beats && attribute.time.beatType
      ? {
        beats: attribute.time.beats,
        beatType: attribute.time.beatType,
        ...(attribute.time.beatGroups ? { beatGroups: [...attribute.time.beatGroups] } : {}),
      }
      : null
  ));
  const durationDivisions = timeSignature
    ? Math.max(1, Math.round((timeSignature.beats * divisions * 4) / timeSignature.beatType))
    : Math.max(1, divisions * 4);
  const implicitDurationDivisions = measure.implicit ? measureRhythmicDuration(measure) : 0;
  const effectiveDurationDivisions = implicitDurationDivisions > 0
    ? Math.min(durationDivisions, implicitDurationDivisions)
    : durationDivisions;

  return {
    staff,
    measure,
    measureIndex,
    divisions,
    timeSignature,
    durationDivisions: effectiveDurationDivisions,
    durationRatio: effectiveDurationDivisions / Math.max(divisions * 4, 1),
  };
}

export function getEffectiveMeasureTiming(
  document: ScoreDocumentModel | null | undefined,
  input: {
    measureId?: string | null;
    measureNumber?: number | null;
    staffIndex?: number | null;
    partId?: string | null;
  },
): EffectiveMeasureTiming | null {
  if (!document) return null;

  for (const part of document.score.parts) {
    if (input.partId && part.id !== input.partId && part.sourcePartId !== input.partId) continue;
    for (const staff of part.staves) {
      if (input.staffIndex != null && staff.staffIndex !== input.staffIndex) continue;
      const timing = getEffectiveMeasureTimingFromStaff(staff, input);
      if (timing) {
        return {
          ...timing,
          part,
        };
      }
    }
  }

  return null;
}
