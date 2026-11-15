export interface DurationCandidate {
  value: number;
  type: string;
  dotted: boolean;
}

export function buildDurationCandidates(divisions: number): DurationCandidate[] {
  const quarter = Math.max(divisions, 1);
  return [
    { value: quarter * 4, type: 'whole', dotted: false },
    { value: quarter * 3, type: 'half', dotted: true },
    { value: quarter * 2, type: 'half', dotted: false },
    { value: Math.round(quarter * 1.5), type: 'quarter', dotted: true },
    { value: quarter, type: 'quarter', dotted: false },
    { value: Math.round(quarter * 0.75), type: 'eighth', dotted: true },
    { value: Math.round(quarter / 2), type: 'eighth', dotted: false },
    { value: Math.round(quarter * 0.375), type: '16th', dotted: true },
    { value: Math.round(quarter / 4), type: '16th', dotted: false },
    { value: Math.round(quarter * 0.1875), type: '32nd', dotted: true },
    { value: Math.round(quarter / 8), type: '32nd', dotted: false },
    { value: Math.round(quarter * 0.09375), type: '64th', dotted: true },
    { value: Math.round(quarter / 16), type: '64th', dotted: false },
  ].filter((candidate) => candidate.value > 0)
    .sort((a, b) => b.value - a.value);
}

export function describeDuration(durationDivisions: number, divisions: number): DurationCandidate {
  const candidates = buildDurationCandidates(divisions);
  return candidates.find((candidate) => candidate.value === durationDivisions)
    ?? candidates[candidates.length - 1]
    ?? { value: 1, type: '64th', dotted: false };
}

export interface NotatableDuration extends DurationCandidate {
  /** Number of augmentation dots (0, 1 or 2). `dotted` is true for one or more dots. */
  dotCount: number;
  /** Divisions of the undotted head value inside the tuplet context (e.g. an eighth for a dotted eighth). */
  baseValue: number;
}

export interface NotatableDurationOptions {
  /** Highest number of augmentation dots that counts as a single value. Defaults to 1. */
  maxDots?: 0 | 1 | 2;
  /** Tuplet ratio: `actualNotes` values in the time of `normalNotes`. */
  tuplet?: { actualNotes: number; normalNotes: number };
}

const NOTATABLE_HEAD_VALUES: Array<{ type: string; quarters: number }> = [
  { type: 'whole', quarters: 4 },
  { type: 'half', quarters: 2 },
  { type: 'quarter', quarters: 1 },
  { type: 'eighth', quarters: 1 / 2 },
  { type: '16th', quarters: 1 / 4 },
  { type: '32nd', quarters: 1 / 8 },
  { type: '64th', quarters: 1 / 16 },
];

/**
 * Every single notatable value (head value plus at most `maxDots` dots, scaled
 * by an optional tuplet ratio) whose length is an exact whole number of
 * divisions, largest first. Unlike `buildDurationCandidates`, nothing is
 * rounded, so a value the grid cannot express is simply absent.
 */
export function buildNotatableDurations(divisions: number, options: NotatableDurationOptions = {}): NotatableDuration[] {
  const quarter = Math.max(divisions, 1);
  const maxDots = options.maxDots ?? 1;
  const actual = options.tuplet && options.tuplet.actualNotes > 0 ? options.tuplet.actualNotes : 1;
  const normal = options.tuplet && options.tuplet.normalNotes > 0 ? options.tuplet.normalNotes : 1;
  const ratio = normal / actual;
  const result: NotatableDuration[] = [];
  for (const head of NOTATABLE_HEAD_VALUES) {
    const base = quarter * head.quarters * ratio;
    for (let dots = 0; dots <= maxDots; dots += 1) {
      const value = base * (2 - 1 / 2 ** dots);
      if (value < 1 || Math.abs(value - Math.round(value)) > 1e-9) continue;
      result.push({
        value: Math.round(value),
        type: head.type,
        dotted: dots > 0,
        dotCount: dots,
        baseValue: base,
      });
    }
  }
  return result.sort((left, right) => right.value - left.value || left.dotCount - right.dotCount);
}

/**
 * Strict counterpart of `describeDuration`: returns the single notatable value
 * for an exact duration, or `null` when the duration needs tied values. It
 * never falls back to the smallest value.
 */
export function describeDurationStrict(
  durationDivisions: number,
  divisions: number,
  options: NotatableDurationOptions = {},
): NotatableDuration | null {
  if (!Number.isInteger(durationDivisions) || durationDivisions <= 0) return null;
  return buildNotatableDurations(divisions, options).find((candidate) => candidate.value === durationDivisions) ?? null;
}

export function isRepresentableDuration(durationDivisions: number, divisions: number): boolean {
  return buildDurationCandidates(divisions).some((candidate) => candidate.value === durationDivisions);
}

/**
 * Decomposes a duration span into standard notation chunks aligned to the beat grid.
 * Pass preferredChunkDivisions > 0 to bias toward a specific chunk size (e.g. quarter note).
 */
export function decomposeDurationDivisions(
  durationDivisions: number,
  divisions: number,
  preferredChunkDivisions = 0,
  startOffset = 0,
): number[] {
  const chunks: number[] = [];
  const candidates = buildDurationCandidates(divisions);
  const preferred = preferredChunkDivisions > 0
    ? candidates.find((candidate) => candidate.value === preferredChunkDivisions) ?? null
    : null;
  let remaining = Math.max(0, durationDivisions);
  let offset = Math.max(0, startOffset);
  const beatDivisions = Math.max(divisions, 1);
  const strongGroupDivisions = beatDivisions * 2;
  const splitToBeatGrid = offset % beatDivisions !== 0;

  while (remaining > 0) {
    const beatRemainder = offset % beatDivisions;
    const boundaryFill = beatRemainder > 0 ? beatDivisions - beatRemainder : 0;
    const beatGridFill = splitToBeatGrid
      && boundaryFill === 0
      && strongGroupDivisions > beatDivisions
      && offset % strongGroupDivisions !== 0
      && remaining > beatDivisions
      ? beatDivisions
      : 0;
    const preferredCandidate = preferred
      && !(splitToBeatGrid && strongGroupDivisions > beatDivisions && offset % strongGroupDivisions === 0)
      ? preferred
      : null;
    const target = boundaryFill > 0 && boundaryFill < remaining ? boundaryFill : remaining;
    const next = beatGridFill > 0
      ? { value: beatGridFill, type: 'quarter', dotted: false }
      : (preferredCandidate && preferredCandidate.value <= target)
        ? preferredCandidate
        : candidates.find((candidate) => candidate.value <= target)
          ?? { value: 1, type: '64th', dotted: false };
    chunks.push(next.value);
    remaining -= next.value;
    offset += next.value;
  }

  return chunks;
}
