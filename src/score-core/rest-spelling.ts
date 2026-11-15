import { buildDurationCandidates } from '@/src/score-core/duration-utils';
import type { EffectiveTimeSignature } from '@/src/score-core/measure-timing';

/**
 * Rest spelling on the beat grid of the bar's meter. Shared by the command executor (rests it
 * writes) and the document normalizer (rests it accepts or re-splits), so a document the executor
 * produced is a fixed point of normalization and of an export -> import round trip.
 */

export type RestSpellingGrid = {
  beatDivisions: number;
  strongGroupDivisions: number;
  /** Sub-beat pulse a rest must not cross (the eighth of a compound beat); 0 when unused. */
  pulseDivisions: number;
  /** Compound meter: a rest longer than a beat must be a whole number of dotted beats. */
  compound: boolean;
};

/**
 * The beat grid rests are spelled on. Quarter-note meters (and every meter
 * that is not x/8 or x/16) keep the quarter beat and the half-note strong
 * group. Simple x/8 meters (3/8, 5/8, 7/8) beat in eighths; compound meters
 * (6/8, 9/8, 12/8) beat in dotted quarters and group two beats.
 */
export function resolveRestSpellingGrid(
  divisions: number,
  timeSignature?: EffectiveTimeSignature | null,
): RestSpellingGrid {
  const quarter = Math.max(divisions, 1);
  const quarterGrid: RestSpellingGrid = {
    beatDivisions: quarter,
    strongGroupDivisions: quarter * 2,
    pulseDivisions: 0,
    compound: false,
  };
  if (!timeSignature || (timeSignature.beatType !== 8 && timeSignature.beatType !== 16)) return quarterGrid;
  const unit = (quarter * 4) / timeSignature.beatType;
  if (!Number.isInteger(unit) || unit < 1) return quarterGrid;
  const compound = timeSignature.beats > 3 && timeSignature.beats % 3 === 0;
  if (!compound) {
    return { beatDivisions: unit, strongGroupDivisions: unit * 2, pulseDivisions: 0, compound: false };
  }
  return { beatDivisions: unit * 3, strongGroupDivisions: unit * 6, pulseDivisions: unit, compound: true };
}

/**
 * Splits a rest span that starts `startOffset` divisions into its bar into rest values on the
 * bar's beat grid. `preferredChunkDivisions` biases toward one value where it fits the grid.
 */
export function decomposeRestSpanDivisions(
  durationDivisions: number,
  divisions: number,
  preferredChunkDivisions: number,
  startOffset: number,
  timeSignature?: EffectiveTimeSignature | null,
) {
  const chunks: number[] = [];
  const candidates = buildDurationCandidates(divisions);
  const preferred = preferredChunkDivisions > 0
    ? candidates.find((candidate) => candidate.value === preferredChunkDivisions) ?? null
    : null;
  const grid = resolveRestSpellingGrid(divisions, timeSignature);
  const { beatDivisions, strongGroupDivisions, pulseDivisions } = grid;
  let remaining = Math.max(0, durationDivisions);
  let offset = Math.max(0, startOffset);

  while (remaining > 0) {
    const pulseRemainder = pulseDivisions > 0 ? offset % pulseDivisions : 0;
    const pulseBoundaryFill = pulseRemainder > 0 ? pulseDivisions - pulseRemainder : 0;
    const beatRemainder = offset % beatDivisions;
    const beatBoundaryFill = beatRemainder > 0 ? beatDivisions - beatRemainder : 0;
    const strongRemainder = strongGroupDivisions > beatDivisions ? offset % strongGroupDivisions : 0;
    const strongBoundaryFill = strongRemainder > 0 ? strongGroupDivisions - strongRemainder : 0;
    const limitedToBoundary = pulseBoundaryFill > 0 && pulseBoundaryFill < remaining
      ? pulseBoundaryFill
      : beatBoundaryFill > 0 && beatBoundaryFill < remaining
        ? beatBoundaryFill
        : strongBoundaryFill > 0 && strongBoundaryFill < remaining
          ? strongBoundaryFill
          : 0;
    const target = limitedToBoundary > 0 ? limitedToBoundary : remaining;
    const fits = (candidate: { value: number }) => (
      candidate.value <= target
      // A compound-meter rest covers part of one beat or whole dotted beats.
      && (!grid.compound || candidate.value <= beatDivisions || candidate.value % beatDivisions === 0)
    );
    const next = preferred && fits(preferred)
      ? preferred
      : candidates.find(fits) ?? { value: 1, type: '64th', dotted: false };
    chunks.push(next.value);
    remaining -= next.value;
    offset += next.value;
  }

  return chunks;
}

/** Whether one rest of `durationDivisions` at `startOffset` is already spelled on the meter's grid. */
export function isRestSpelledForMeter(
  durationDivisions: number,
  divisions: number,
  startOffset: number,
  timeSignature?: EffectiveTimeSignature | null,
) {
  const chunks = decomposeRestSpanDivisions(durationDivisions, divisions, durationDivisions, startOffset, timeSignature);
  return chunks.length === 1 && chunks[0] === durationDivisions;
}
