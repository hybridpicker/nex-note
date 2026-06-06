export interface PlaybackHighlightCandidate {
  timestampNum: number;
  timestampDen: number;
}

const PLAYBACK_HIGHLIGHT_EPSILON = 1 / 512;

export function resolveReachedPlaybackOnset<T extends PlaybackHighlightCandidate>(
  candidates: T[],
  progressWithinMeasure: number,
): T | null {
  return candidates.reduce<T | null>((best, candidate) => {
    const candidatePosition = candidate.timestampNum / Math.max(candidate.timestampDen, 1);
    if (candidatePosition > progressWithinMeasure + PLAYBACK_HIGHLIGHT_EPSILON) return best;
    if (!best) return candidate;
    const bestPosition = best.timestampNum / Math.max(best.timestampDen, 1);
    return candidatePosition > bestPosition ? candidate : best;
  }, null);
}
