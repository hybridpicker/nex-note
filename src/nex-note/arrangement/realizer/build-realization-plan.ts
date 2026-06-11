import type { DocumentState } from '@/src/score-core/commands/apply-document-commands';
import type { NoteEvent, ScoreDocumentModel } from '@/src/score-core/model/types';
import type { ArrangementSpec, HarmonicPlanCandidate, VoicingCandidate, VoicingSlice } from '@/src/nex-note/arrangement/spec';
import type { RealizationMirrorTarget, RealizationPlan, RealizationTarget, RealizedSpanEvent, RealizerIssue } from '@/src/nex-note/arrangement/realizer/spec';
import {
  describeGuitarPlacementFailure,
  findPairedTabSourceNote,
  guitarPlacementForPitch,
  isTabStaffForArrangement,
} from '@/src/nex-note/arrangement/guitar-tab-pairing';

interface Fraction {
  num: number;
  den: number;
}

const DURATION_CANDIDATES: Array<{ value: Fraction; durationType: string; isDotted: boolean }> = [
  { value: { num: 3, den: 2 }, durationType: 'whole', isDotted: true },
  { value: { num: 1, den: 1 }, durationType: 'whole', isDotted: false },
  { value: { num: 3, den: 4 }, durationType: 'half', isDotted: true },
  { value: { num: 1, den: 2 }, durationType: 'half', isDotted: false },
  { value: { num: 3, den: 8 }, durationType: 'quarter', isDotted: true },
  { value: { num: 1, den: 4 }, durationType: 'quarter', isDotted: false },
  { value: { num: 3, den: 16 }, durationType: 'eighth', isDotted: true },
  { value: { num: 1, den: 8 }, durationType: 'eighth', isDotted: false },
  { value: { num: 3, den: 32 }, durationType: '16th', isDotted: true },
  { value: { num: 1, den: 16 }, durationType: '16th', isDotted: false },
  { value: { num: 3, den: 64 }, durationType: '32nd', isDotted: true },
  { value: { num: 1, den: 32 }, durationType: '32nd', isDotted: false },
  { value: { num: 3, den: 128 }, durationType: '64th', isDotted: true },
  { value: { num: 1, den: 64 }, durationType: '64th', isDotted: false },
];

function gcd(a: number, b: number): number {
  let left = Math.abs(a);
  let right = Math.abs(b);
  while (right !== 0) {
    const next = left % right;
    left = right;
    right = next;
  }
  return left || 1;
}

function normalizeFraction(fraction: Fraction): Fraction {
  if (fraction.num === 0) return { num: 0, den: 1 };
  const divisor = gcd(fraction.num, fraction.den);
  const den = Math.max(1, fraction.den / divisor);
  const num = fraction.num / divisor;
  return den < 0 ? { num: -num, den: -den } : { num, den };
}

function addFractions(left: Fraction, right: Fraction): Fraction {
  return normalizeFraction({
    num: left.num * right.den + right.num * left.den,
    den: left.den * right.den,
  });
}

function subtractFractions(left: Fraction, right: Fraction): Fraction {
  return normalizeFraction({
    num: left.num * right.den - right.num * left.den,
    den: left.den * right.den,
  });
}

function compareFractions(left: Fraction, right: Fraction) {
  return left.num * right.den - right.num * left.den;
}

function fractionEquals(left: Fraction, right: Fraction) {
  const normalizedLeft = normalizeFraction(left);
  const normalizedRight = normalizeFraction(right);
  return normalizedLeft.num === normalizedRight.num && normalizedLeft.den === normalizedRight.den;
}

function beatToMeasureOffset(slice: Pick<VoicingSlice, 'beatNum' | 'beatDen'>): Fraction {
  return normalizeFraction({
    num: Math.max(0, slice.beatNum - 1),
    den: Math.max(1, slice.beatDen),
  });
}

function fractionToTimestamp(offset: Fraction) {
  const normalized = normalizeFraction(offset);
  return {
    timestampNum: Math.max(0, normalized.num),
    timestampDen: Math.max(1, normalized.den),
  };
}

function noteMidi(pitch: { step: string; alter: number; octave: number }) {
  const stepToSemitone: Record<string, number> = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 };
  return (stepToSemitone[pitch.step] ?? 0) + pitch.alter + (pitch.octave + 1) * 12;
}

function partMatchesId(part: ScoreDocumentModel['score']['parts'][number], partId: string) {
  return part.id === partId
    || part.sourcePartId === partId
    || `part:${part.sourcePartId}` === partId;
}

function resolvePartByPrimaryVoice(coreDocument: ScoreDocumentModel) {
  return coreDocument.score.parts
    .flatMap((part, partIndex) => part.staves.flatMap((staff) => {
      const noteEvents = staff.measures.flatMap((measure) => (
        measure.voices.flatMap((voice) => voice.events.filter((event) => event.kind === 'note'))
      ));
      if (noteEvents.length === 0) return [];
      const averageMidi = noteEvents.reduce((sum, event) => (
        sum + (event.kind === 'note' ? noteMidi(event.pitch) : 0)
      ), 0) / noteEvents.length;
      return [{ part, partIndex, staffIndex: staff.staffIndex, noteCount: noteEvents.length, averageMidi }];
    }))
    .sort((left, right) => (
      right.noteCount - left.noteCount
      || right.averageMidi - left.averageMidi
      || left.staffIndex - right.staffIndex
      || left.partIndex - right.partIndex
    ))[0]?.part ?? coreDocument.score.parts[0] ?? null;
}

function resolveTargetPart(coreDocument: ScoreDocumentModel | null, spec: ArrangementSpec): { target: RealizationTarget | null; issues: RealizerIssue[] } {
  if (!coreDocument) {
    return {
      target: null,
      issues: [{ code: 'missing-core-document', severity: 'error', message: 'Cannot materialize arrangement notes without a core score document.' }],
    };
  }

  const requestedPartId = spec.sourceMelody.partId;
  const requestedPart = requestedPartId
    ? coreDocument.score.parts.find((entry) => partMatchesId(entry, requestedPartId))
    : null;
  const part = requestedPart ?? resolvePartByPrimaryVoice(coreDocument);
  const staff = part?.staves.find((entry) => entry.staffIndex === 1) ?? part?.staves[0];
  if (!part || !staff) {
    return {
      target: null,
      issues: [{ code: 'missing-target-staff', severity: 'error', message: 'Could not resolve a target staff for arrangement materialization.' }],
    };
  }

  return {
    target: {
      partId: spec.sourceMelody.partId ?? part.sourcePartId,
      corePartId: part.id,
      staffIndex: staff.staffIndex,
      voiceIds: [],
      measureRange: { start: 1, end: 1 },
      mode: 'replace-range',
    },
    issues: [],
  };
}

function buildMeasureTimingMap(staff: ScoreDocumentModel['score']['parts'][number]['staves'][number]) {
  const sortedMeasures = [...staff.measures].sort((left, right) => left.measureNumber - right.measureNumber);
  const timing = new Map<number, { duration: Fraction; start: Fraction }>();
  let currentBeats = 4;
  let currentBeatType = 4;
  let cursor: Fraction = { num: 0, den: 1 };

  for (const measure of sortedMeasures) {
    const time = measure.attributes.find((attribute) => attribute.time)?.time;
    if (time?.beats && time?.beatType) {
      currentBeats = time.beats;
      currentBeatType = time.beatType;
    }
    const duration = normalizeFraction({ num: currentBeats, den: currentBeatType });
    timing.set(measure.measureNumber, { duration, start: cursor });
    cursor = addFractions(cursor, duration);
  }

  return timing;
}

function describeDuration(duration: Fraction) {
  const normalized = normalizeFraction(duration);
  const candidate = DURATION_CANDIDATES.find((entry) => fractionEquals(entry.value, normalized));
  return candidate ?? null;
}

function findPairedTabTarget(coreDocument: ScoreDocumentModel, target: RealizationTarget): RealizationTarget | null {
  const sourcePart = coreDocument.score.parts.find((part) => part.id === target.corePartId);
  if (!sourcePart || isTabStaffForArrangement(sourcePart, target.staffIndex)) return null;
  const sourcePartIndex = coreDocument.score.parts.findIndex((part) => part.id === sourcePart.id);
  const paired = coreDocument.score.parts
    .flatMap((part, partIndex) => part.staves.map((staff) => ({
      part,
      partIndex,
      staff,
      isTab: isTabStaffForArrangement(part, staff.staffIndex),
    })))
    .filter((candidate) => (
      candidate.isTab
      && !(candidate.part.id === target.corePartId && candidate.staff.staffIndex === target.staffIndex)
    ))
    .sort((left, right) => (
      Number(left.part.id !== sourcePart.id) - Number(right.part.id !== sourcePart.id)
      || Math.abs(left.staff.staffIndex - target.staffIndex) - Math.abs(right.staff.staffIndex - target.staffIndex)
      || Math.abs(left.partIndex - sourcePartIndex) - Math.abs(right.partIndex - sourcePartIndex)
    ))[0];

  if (!paired) return null;
  return {
    partId: paired.part.sourcePartId,
    corePartId: paired.part.id,
    staffIndex: paired.staff.staffIndex,
    voiceIds: [...target.voiceIds],
    measureRange: { ...target.measureRange },
    mode: 'replace-range',
  };
}

function findExistingSourceNoteForEvent(
  coreDocument: ScoreDocumentModel,
  target: RealizationTarget,
  event: RealizedSpanEvent,
) {
  const sourcePart = coreDocument.score.parts.find((part) => part.id === target.corePartId);
  const sourceStaff = sourcePart?.staves.find((staff) => staff.staffIndex === target.staffIndex);
  const measure = sourceStaff?.measures.find((entry) => entry.measureNumber === event.measureNumber);
  const note = measure?.voices
    .find((voice) => voice.voiceId === event.voiceId)
    ?.events.find((candidate): candidate is NoteEvent => (
      candidate.kind === 'note'
      && candidate.timestampNum * event.timestampDen === event.timestampNum * candidate.timestampDen
    ));
  if (!sourcePart || !measure || !note) return null;
  return {
    partId: sourcePart.sourcePartId,
    corePartId: sourcePart.id,
    partName: sourcePart.name,
    note,
    measure,
  };
}

function buildPairedTabMirrorTarget(params: {
  documentState: DocumentState;
  target: RealizationTarget;
  events: RealizedSpanEvent[];
  issues: RealizerIssue[];
}): RealizationMirrorTarget | null {
  const coreDocument = params.documentState.coreDocument;
  if (!coreDocument) return null;
  const mirrorTarget = findPairedTabTarget(coreDocument, params.target);
  if (!mirrorTarget) return null;

  const events = params.events.flatMap((event) => {
    if (event.kind !== 'note' || !event.pitch) return [];
    const existingSource = findExistingSourceNoteForEvent(coreDocument, params.target, event);
    const sourceGuitar = existingSource ? findPairedTabSourceNote(params.documentState, existingSource)?.note.guitar : undefined;
    const guitar = guitarPlacementForPitch(event.pitch, sourceGuitar);
    if (!guitar) {
      params.issues.push({
        code: 'paired-tab-not-mirrored',
        severity: 'warning',
        message: `Could not mirror measure ${event.measureNumber}, voice ${event.voiceId} to paired TAB staff: ${describeGuitarPlacementFailure(event.pitch)}.`,
      });
      return [];
    }
    return [{
      ...event,
      kind: 'note' as const,
      staffIndex: mirrorTarget.staffIndex,
      pitch: event.pitch,
      guitar,
    }];
  });

  return { target: mirrorTarget, events };
}

export function buildRealizationPlan(params: {
  documentState: DocumentState;
  spec: ArrangementSpec;
  voicingCandidate: VoicingCandidate;
  harmonicCandidate?: HarmonicPlanCandidate;
}): { plan: RealizationPlan | null; issues: RealizerIssue[] } {
  const { documentState, spec, voicingCandidate, harmonicCandidate } = params;
  const targetResolution = resolveTargetPart(documentState.coreDocument, spec);
  const issues: RealizerIssue[] = [...targetResolution.issues];
  const target = targetResolution.target;
  if (!target || !documentState.coreDocument) return { plan: null, issues };

  const part = documentState.coreDocument.score.parts.find((entry) => entry.id === target.corePartId);
  const staff = part?.staves.find((entry) => entry.staffIndex === target.staffIndex) ?? null;
  if (!staff) {
    return {
      plan: null,
      issues: [...issues, { code: 'missing-target-staff', severity: 'error', message: 'Could not resolve the target staff for note materialization.' }],
    };
  }

  const slices = [...voicingCandidate.slices].sort((left, right) => (
    left.measure - right.measure
    || compareFractions(beatToMeasureOffset(left), beatToMeasureOffset(right))
  ));
  if (slices.length === 0) {
    return {
      plan: null,
      issues: [...issues, { code: 'empty-voicing', severity: 'error', message: 'Cannot realize an empty voicing candidate.' }],
    };
  }

  const timingMap = buildMeasureTimingMap(staff);
  const voiceIds = [...new Set(
    slices.flatMap((slice) => slice.voices.map((voice) => voice.voiceIndex)),
  )].sort((left, right) => left - right);
  target.voiceIds = voiceIds;
  target.measureRange = {
    start: Math.min(...slices.map((slice) => slice.measure)),
    end: Math.max(...slices.map((slice) => slice.measure)),
  };

  const rawEvents: RealizedSpanEvent[] = [];

  for (let index = 0; index < slices.length; index += 1) {
    const slice = slices[index]!;
    const nextSlice = slices[index + 1];
    const measureTiming = timingMap.get(slice.measure);
    if (!measureTiming) {
      issues.push({
        code: 'missing-measure-timing',
        severity: 'error',
        message: `Missing measure timing for measure ${slice.measure}.`,
      });
      continue;
    }
    const startOffset = beatToMeasureOffset(slice);
    if (compareFractions(startOffset, measureTiming.duration) >= 0) {
      issues.push({
        code: 'non-monotonic-slices',
        severity: 'error',
        message: `Slice at measure ${slice.measure} starts outside the measure duration.`,
      });
      continue;
    }

    const sliceStartAbsolute = addFractions(measureTiming.start, startOffset);
    const sliceEndAbsolute = nextSlice
      ? (() => {
          const nextTiming = timingMap.get(nextSlice.measure);
          if (!nextTiming) return addFractions(measureTiming.start, measureTiming.duration);
          return addFractions(nextTiming.start, beatToMeasureOffset(nextSlice));
        })()
      : addFractions(measureTiming.start, measureTiming.duration);

    if (compareFractions(sliceEndAbsolute, sliceStartAbsolute) <= 0) {
      issues.push({
        code: 'non-monotonic-slices',
        severity: 'error',
        message: `Voicing slices are not strictly increasing around measure ${slice.measure}.`,
      });
      continue;
    }

    const duration = subtractFractions(sliceEndAbsolute, sliceStartAbsolute);
    const described = describeDuration(duration);
    if (!described) {
      issues.push({
        code: 'unsupported-duration',
        severity: 'error',
        message: `Unsupported slice duration ${duration.num}/${duration.den} starting at measure ${slice.measure}.`,
      });
      continue;
    }

    for (const voiceId of voiceIds) {
      const voice = slice.voices.find((entry) => entry.voiceIndex === voiceId);
      const timestamp = fractionToTimestamp(startOffset);
      rawEvents.push({
        kind: voice?.pitch ? 'note' : 'rest',
        measureNumber: slice.measure,
        staffIndex: target.staffIndex,
        voiceId,
        timestampNum: timestamp.timestampNum,
        timestampDen: timestamp.timestampDen,
        durationType: described.durationType,
        isDotted: described.isDotted,
        pitch: voice?.pitch ?? undefined,
        sourceSliceIndex: index,
      });
    }
  }

  const fatalIssues = issues.filter((issue) => issue.severity === 'error');
  if (fatalIssues.length > 0) {
    return { plan: null, issues };
  }

  const pairedTabMirror = buildPairedTabMirrorTarget({
    documentState,
    target,
    events: rawEvents,
    issues,
  });

  const plan: RealizationPlan = {
    spec,
    harmonicCandidate: harmonicCandidate
      ? { candidateId: harmonicCandidate.candidateId, summary: harmonicCandidate.summary }
      : undefined,
    voicingCandidate: { candidateId: voicingCandidate.candidateId, summary: voicingCandidate.summary },
    target,
    events: rawEvents,
    ...(pairedTabMirror ? { mirrors: [pairedTabMirror] } : {}),
  };

  return { plan, issues };
}
