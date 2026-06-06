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
