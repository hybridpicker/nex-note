import type { ScoreDocumentModel } from '../score-core/model/types';

const STEP_ORDER = ['C', 'D', 'E', 'F', 'G', 'A', 'B'] as const;
export type Step = typeof STEP_ORDER[number];
export type DiatonicIntervalNumber = 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9;
export type PitchNamePlacement = 'closest' | 'above';

const STEP_SEMITONES: Record<Step, number> = {
  C: 0,
  D: 2,
  E: 4,
  F: 5,
  G: 7,
  A: 9,
  B: 11,
};

export function diatonicPitchIndex(step: string, octave: number): number {
  const idx = STEP_ORDER.indexOf(step as Step);
  return octave * 7 + (idx >= 0 ? idx : 0);
}

export function pitchFromDiatonicIndex(index: number): { step: Step; octave: number } {
  const normalized = Math.max(index, 0);
  const octave = Math.floor(normalized / 7);
  const step = STEP_ORDER[((normalized % 7) + 7) % 7] ?? 'C';
  return { step, octave };
}

export function pitchChromaticIndex(pitch: { step: string; alter: number; octave: number }): number {
  const normalizedStep = pitch.step.trim().toUpperCase() as Step;
  return ((Math.trunc(pitch.octave) + 1) * 12)
    + (STEP_SEMITONES[normalizedStep] ?? STEP_SEMITONES.C)
    + Math.trunc(pitch.alter);
}

export function resolvePitchNameEntry(
  step: string,
  alter: number,
  reference: { step: string; alter: number; octave: number },
  placement: PitchNamePlacement,
): { step: Step; alter: number; octave: number } {
  const normalizedStep = step.trim().toUpperCase();
  const targetStep = STEP_ORDER.includes(normalizedStep as Step) ? normalizedStep as Step : 'C';
  const referenceOctave = Math.max(0, Math.min(9, Math.trunc(reference.octave)));
  const candidates = Array.from({ length: 10 }, (_, octave) => ({ step: targetStep, alter, octave }));
  const referenceIndex = pitchChromaticIndex(reference);

  if (placement === 'above') {
    const referenceDiatonicIndex = diatonicPitchIndex(reference.step, referenceOctave);
    return candidates.find((candidate) => diatonicPitchIndex(candidate.step, candidate.octave) > referenceDiatonicIndex)
      ?? candidates[candidates.length - 1]!;
  }

  return candidates.sort((left, right) => (
    Math.abs(pitchChromaticIndex(left) - referenceIndex)
    - Math.abs(pitchChromaticIndex(right) - referenceIndex)
    || Number(left.octave !== referenceOctave) - Number(right.octave !== referenceOctave)
    || left.octave - right.octave
  ))[0]!;
}

export interface Clef {
  sign: 'G' | 'F' | 'C';
  line: number;
  /** MusicXML clef-octave-change: -1 for an 8vb clef (e.g. tenor treble), +1 for 8va. */
  octaveChange?: number;
}

// Pitch that sits on the clef's own line (e.g. G4 on the G-clef line).
const CLEF_ANCHOR: Record<Clef['sign'], { step: Step; octave: number }> = {
  G: { step: 'G', octave: 4 },
  F: { step: 'F', octave: 3 },
  C: { step: 'C', octave: 4 },
};

// Each staff line is two diatonic steps higher than the one below it.
// line=1 is the bottom line, line=5 is the top.
export function topLineDiatonicIndex(clef: Clef): number {
  const anchor = CLEF_ANCHOR[clef.sign] ?? CLEF_ANCHOR.G;
  const anchorIndex = diatonicPitchIndex(anchor.step, anchor.octave);
  const defaultLine = clef.sign === 'G' ? 2 : clef.sign === 'F' ? 4 : 3;
  const line = Number.isFinite(clef.line) && clef.line >= 1 && clef.line <= 5 ? clef.line : defaultLine;
  const octaveChange = Number.isFinite(clef.octaveChange) ? Math.trunc(clef.octaveChange!) : 0;
  return anchorIndex + 2 * (5 - line) + 7 * octaveChange;
}

type ClefScope = { corePartId?: string | null; measureId?: string | null };

export function resolveClefAtMeasure(
  coreDocument: ScoreDocumentModel | null | undefined,
  measureNumber: number,
  staffIndex: number,
  scope?: ClefScope,
): Clef {
  const clef = findLatestClef(coreDocument, measureNumber, staffIndex, scope, false);
  return clef && clef !== 'percussion' ? clef : { sign: 'G', line: 2 };
}

/**
 * True when the latest clef declared for the staff is a percussion clef. Such
 * staves hold unpitched notes, so a pitch derived from a staff position
 * would be meaningless and pointer pitch entry must fail closed.
 */
export function isPercussionStaffAtMeasure(
  coreDocument: ScoreDocumentModel | null | undefined,
  measureNumber: number,
  staffIndex: number,
  scope?: ClefScope,
): boolean {
  return findLatestClef(coreDocument, measureNumber, staffIndex, scope, true) === 'percussion';
}

function findLatestClef(
  coreDocument: ScoreDocumentModel | null | undefined,
  measureNumber: number,
  staffIndex: number,
  scope: ClefScope | undefined,
  detectPercussion: boolean,
): Clef | 'percussion' | null {
  if (!coreDocument) return null;
  const normalizedPartId = scope?.corePartId?.replace(/^part:/, '') ?? null;
  const matchingParts = coreDocument.score.parts.filter((part) => (
    !normalizedPartId
    || part.id === scope?.corePartId
    || part.sourcePartId === scope?.corePartId
    || part.id.replace(/^part:/, '') === normalizedPartId
    || part.sourcePartId.replace(/^part:/, '') === normalizedPartId
  ));
  const parts = matchingParts.length > 0 ? matchingParts : coreDocument.score.parts;
  const matchingStaves = parts.flatMap((part) => part.staves.filter((staff) => (
    staff.staffIndex === staffIndex
    && (!scope?.measureId || staff.measures.some((measure) => measure.id === scope.measureId))
  )));
  const staves = matchingStaves.length > 0
    ? matchingStaves
    : parts.flatMap((part) => part.staves.filter((staff) => staff.staffIndex === staffIndex));
  for (const staff of staves) {
    const sorted = [...staff.measures]
      .filter((measure) => measure.measureNumber <= measureNumber)
      .sort((a, b) => b.measureNumber - a.measureNumber);
    for (const measure of sorted) {
      for (const attribute of measure.attributes) {
        const clef = attribute.clefs?.find((entry) => entry.staffIndex === staffIndex);
        if (!clef?.sign) continue;
        const sign = clef.sign.toUpperCase();
        if (detectPercussion && sign === 'PERCUSSION') return 'percussion';
        if (typeof clef.line !== 'number') continue;
        if (sign === 'G' || sign === 'F' || sign === 'C') {
          return typeof clef.octaveChange === 'number' && clef.octaveChange !== 0
            ? { sign, line: clef.line, octaveChange: clef.octaveChange }
            : { sign, line: clef.line };
        }
      }
    }
  }
  return null;
}

// staffStep: 0 = top staff line, +1 per half line-space downward
// (i.e. going to lower pitch).
export function resolveStaffStepPitch(
  staffStep: number,
  clef: Clef,
): { step: Step; octave: number; diatonicIndex: number } {
  const topIndex = topLineDiatonicIndex(clef);
  const diatonicIndex = topIndex - Math.round(staffStep);
  const { step, octave } = pitchFromDiatonicIndex(diatonicIndex);
  return { step, octave, diatonicIndex };
}

const MUSICAL_ACCIDENTALS: Record<number, string> = {
  [-2]: '𝄫',
  [-1]: '♭',
  0: '',
  1: '♯',
  2: '𝄪',
};

export function formatPitchLabel(
  step: string,
  alter: number,
  octave: number,
  options?: { showNatural?: boolean },
) {
  const normalizedStep = step.trim().toUpperCase();
  const accidental = alter === 0 && options?.showNatural
    ? '♮'
    : MUSICAL_ACCIDENTALS[Math.trunc(alter)] ?? '';
  return `${normalizedStep}${accidental}${Math.trunc(octave)}`;
}

const SHARP_ORDER = ['F', 'C', 'G', 'D', 'A', 'E', 'B'] as const;
const FLAT_ORDER = ['B', 'E', 'A', 'D', 'G', 'C', 'F'] as const;

export function keyFifthsAlterForStep(fifths: number | null | undefined, step: string): number {
  const normalizedStep = step.trim().toUpperCase();
  const safeFifths = Math.max(-7, Math.min(7, Math.trunc(fifths ?? 0)));
  if (!STEP_ORDER.includes(normalizedStep as Step) || safeFifths === 0) return 0;

  if (safeFifths > 0) {
    return SHARP_ORDER.slice(0, safeFifths).includes(normalizedStep as typeof SHARP_ORDER[number])
      ? 1
      : 0;
  }

  return FLAT_ORDER.slice(0, Math.abs(safeFifths)).includes(normalizedStep as typeof FLAT_ORDER[number])
    ? -1
    : 0;
}

export function resolveMeasureAccidentalAlter(
  document: ScoreDocumentModel | null | undefined,
  input: {
    corePartId?: string | null;
    measureNumber: number;
    staffIndex: number;
    timestampNum: number;
    timestampDen: number;
    step: string;
    octave: number;
  },
): number {
  const targetTime = input.timestampNum / Math.max(input.timestampDen, 1);
  const normalizedPartId = input.corePartId?.replace(/^part:/, '') ?? null;
  const parts = document?.score.parts.filter((part) => (
    !normalizedPartId
    || part.id === input.corePartId
    || part.sourcePartId === input.corePartId
    || part.id.replace(/^part:/, '') === normalizedPartId
    || part.sourcePartId.replace(/^part:/, '') === normalizedPartId
  )) ?? [];

  const preceding = parts
    .flatMap((part) => part.staves)
    .filter((staff) => staff.staffIndex === input.staffIndex)
    .flatMap((staff) => staff.measures)
    .filter((measure) => measure.measureNumber === input.measureNumber)
    .flatMap((measure) => measure.voices)
    .flatMap((voice) => voice.events)
    .filter((event) => (
      event.kind === 'note'
      && event.pitch.step === input.step
      && event.pitch.octave === input.octave
      && (event.timestampNum / Math.max(event.timestampDen, 1)) < targetTime
    ))
    .sort((left, right) => (
      (right.timestampNum / Math.max(right.timestampDen, 1))
      - (left.timestampNum / Math.max(left.timestampDen, 1))
      || right.voiceId - left.voiceId
      || right.id.localeCompare(left.id)
    ));

  if (preceding[0]?.kind === 'note') return preceding[0].pitch.alter;
  return keyFifthsAlterForStep(
    resolveKeyFifthsAtMeasure(document, {
      measureNumber: input.measureNumber,
      staffIndex: input.staffIndex,
      partId: input.corePartId,
    }),
    input.step,
  );
}

export function resolveKeyFifthsAtMeasure(
  coreDocument: ScoreDocumentModel | null | undefined,
  input: { measureNumber: number; staffIndex: number; partId?: string | null },
) {
  if (!coreDocument) return 0;
  const matchingParts = coreDocument.score.parts.filter((part) => (
    !input.partId || part.id === input.partId || part.sourcePartId === input.partId
  ));
  const parts = matchingParts.length > 0 ? matchingParts : coreDocument.score.parts;

  for (const part of parts) {
    const staff = part.staves.find((entry) => entry.staffIndex === input.staffIndex);
    if (!staff) continue;
    let keyFifths = 0;
    for (const measure of [...staff.measures].sort((left, right) => left.measureNumber - right.measureNumber)) {
      if (measure.measureNumber > input.measureNumber) break;
      for (const attribute of measure.attributes) {
        if (typeof attribute.keyFifths === 'number') keyFifths = attribute.keyFifths;
      }
    }
    return keyFifths;
  }
  return 0;
}

export function resolveDiatonicIntervalAbove(
  pitch: { step: string; alter: number; octave: number },
  interval: DiatonicIntervalNumber,
  keyFifths: number,
) {
  const diatonicSteps = Math.max(0, Math.min(8, interval - 1));
  if (diatonicSteps === 0) return { ...pitch };
  const maximumIndex = diatonicPitchIndex('B', 9);
  const targetIndex = Math.min(maximumIndex, diatonicPitchIndex(pitch.step, pitch.octave) + diatonicSteps);
  const target = pitchFromDiatonicIndex(targetIndex);
  return {
    ...target,
    alter: keyFifthsAlterForStep(keyFifths, target.step),
  };
}
