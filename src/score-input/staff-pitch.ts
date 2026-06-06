import type { ScoreDocumentModel } from '../score-core/model/types';

const STEP_ORDER = ['C', 'D', 'E', 'F', 'G', 'A', 'B'] as const;
export type Step = typeof STEP_ORDER[number];

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

export interface Clef {
  sign: 'G' | 'F' | 'C';
  line: number;
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
  return anchorIndex + 2 * (5 - line);
}

export function resolveClefAtMeasure(
  coreDocument: ScoreDocumentModel | null | undefined,
  measureNumber: number,
  staffIndex: number,
): Clef {
  const fallback: Clef = { sign: 'G', line: 2 };
  if (!coreDocument) return fallback;
  for (const part of coreDocument.score.parts) {
    const staff = part.staves.find((entry) => entry.staffIndex === staffIndex);
    if (!staff) continue;
    const sorted = [...staff.measures]
      .filter((measure) => measure.measureNumber <= measureNumber)
      .sort((a, b) => b.measureNumber - a.measureNumber);
    for (const measure of sorted) {
      for (const attribute of measure.attributes) {
        const clef = attribute.clefs?.find((entry) => entry.staffIndex === staffIndex);
        if (!clef?.sign || typeof clef.line !== 'number') continue;
        const sign = clef.sign.toUpperCase();
        if (sign === 'G' || sign === 'F' || sign === 'C') {
          return { sign, line: clef.line };
        }
      }
    }
  }
  return fallback;
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
