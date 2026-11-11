export type GhostPlacementMode = 'replace' | 'chord' | 'insert';
export type GhostAnchorKind = 'main' | 'grace';

export interface MeasureInteriorInput {
  pointerX: number;
  measureLeft: number;
  measureWidth: number;
  paddingPx?: number;
}

export interface MeasureInteriorResult {
  clampedX: number;
  safeLeft: number;
  safeRight: number;
  isOutOfBounds: boolean;
}

export interface GhostAnchorPoint {
  ratio: number;
  x: number;
  voiceId?: number;
  kind?: GhostAnchorKind;
  hitRadiusPx?: number;
  priority?: number;
  isRest?: boolean;
  timestampNum?: number;
  timestampDen?: number;
}

export interface GhostPlacementIntentInput {
  pointerX: number;
  snappedRatio: number;
  slotDuration: number;
  segmentStartRatio: number;
  maxStartRatio: number;
  anchors: GhostAnchorPoint[];
  noteheadWidth?: number;
  activeVoiceId?: number | null;
  graceHitRadiusPx?: number;
  baseHitRadiusPx?: number;
}

export interface GhostPlacementIntent {
  mode: GhostPlacementMode;
  targetRatio: number;
  anchor: GhostAnchorPoint | null;
  targetVoiceId: number | null;
}

export interface GhostPlacementModifierState {
  shiftKey?: boolean;
  altKey?: boolean;
  metaKey?: boolean;
  ctrlKey?: boolean;
}

export interface LedgerLineSegment {
  y: number;
  x1: number;
  x2: number;
}

export interface StickyStaffInput {
  pointerY: number;
  currentStaffIndex: number | null;
  staffCenters: number[];
  hysteresisRatio?: number;
}

function clamp(value: number, min: number, max: number) {
  return Math.min(Math.max(value, min), max);
}

export function resolveStickyStaffIndex(input: StickyStaffInput): number | null {
  const { pointerY, currentStaffIndex, staffCenters } = input;
  if (staffCenters.length === 0) return null;

  const nearestIndex = staffCenters.reduce((bestIndex, center, index) => (
    Math.abs(center - pointerY) < Math.abs(staffCenters[bestIndex]! - pointerY) ? index : bestIndex
  ), 0);
  if (currentStaffIndex == null || currentStaffIndex < 0 || currentStaffIndex >= staffCenters.length) {
    return nearestIndex;
  }
  if (nearestIndex === currentStaffIndex) return currentStaffIndex;

  const currentCenter = staffCenters[currentStaffIndex]!;
  const candidateCenter = staffCenters[nearestIndex]!;
  const midpoint = (currentCenter + candidateCenter) / 2;
  const hysteresis = Math.abs(candidateCenter - currentCenter) * Math.max(input.hysteresisRatio ?? 0.15, 0);
  if (candidateCenter > currentCenter) {
    return pointerY > midpoint + hysteresis ? nearestIndex : currentStaffIndex;
  }
  return pointerY < midpoint - hysteresis ? nearestIndex : currentStaffIndex;
}

export function clampPointerToMeasureInterior(input: MeasureInteriorInput): MeasureInteriorResult {
  const { pointerX, measureLeft, measureWidth } = input;
  const paddingPx = Math.max(input.paddingPx ?? 8, 0);
  const measureRight = measureLeft + Math.max(measureWidth, 1);
  const safeLeft = Math.min(measureLeft + paddingPx, measureRight);
  const safeRight = Math.max(measureRight - paddingPx, safeLeft);
  const isOutOfBounds = pointerX < safeLeft || pointerX > safeRight;
  return {
    clampedX: clamp(pointerX, safeLeft, safeRight),
    safeLeft,
    safeRight,
    isOutOfBounds,
  };
}

export function resolveTargetAnchor(input: {
  pointerX: number;
  anchors: GhostAnchorPoint[];
  activeVoiceId?: number | null;
  graceHitRadiusPx?: number;
  baseHitRadiusPx?: number;
}): GhostAnchorPoint | null {
  const activeVoiceId = input.activeVoiceId ?? null;
  const graceHitRadiusPx = Math.max(input.graceHitRadiusPx ?? 10, 0);
  const baseHitRadiusPx = Math.max(input.baseHitRadiusPx ?? 8, 0);

  let best: { anchor: GhostAnchorPoint; score: number } | null = null;
  for (const anchor of input.anchors) {
    const distance = Math.abs(anchor.x - input.pointerX);
    const radius = Math.max(
      anchor.hitRadiusPx ?? (anchor.kind === 'grace' ? graceHitRadiusPx : baseHitRadiusPx),
      0,
    );
    if (distance > radius) continue;

    let score = distance;
    if (anchor.kind === 'grace') score -= Math.min(graceHitRadiusPx * 0.6, 4);
    if (activeVoiceId != null && anchor.voiceId === activeVoiceId) score -= 2;
    score -= Math.max(anchor.priority ?? 0, 0) * 0.25;
    if (!best || score < best.score) {
      best = { anchor, score };
    }
  }

  return best?.anchor ?? null;
}

export function resolveGhostPlacementIntent(input: GhostPlacementIntentInput): GhostPlacementIntent {
  const {
    pointerX,
    snappedRatio,
    segmentStartRatio,
    maxStartRatio,
    anchors,
  } = input;
  const noteheadWidth = Math.max(input.noteheadWidth ?? 12, 6);
  const threshold = noteheadWidth * 0.38;
  const sortedAnchors = anchors
    .filter((anchor) => Number.isFinite(anchor.ratio) && Number.isFinite(anchor.x))
    .sort((a, b) => a.x - b.x || a.ratio - b.ratio);
  const withinReach = resolveTargetAnchor({
    pointerX,
    anchors: sortedAnchors,
    activeVoiceId: input.activeVoiceId,
    graceHitRadiusPx: input.graceHitRadiusPx ?? (noteheadWidth * 1.75),
    baseHitRadiusPx: input.baseHitRadiusPx ?? (noteheadWidth * 1.25),
  });
  // A pointer between two onsets belongs to the nearer one, as MuseScore's `Score::getPosition`
  // gives a click to the nearest segment. It does not open an insert point between them (M4).
  // The onset itself is the one the rendered grid snapped to; the intent names the note or rest
  // standing there, so that onset and place of the preview belong to the same event.
  const allMainAnchors = sortedAnchors.filter((anchor) => anchor.kind !== 'grace');
  const atSnappedOnset = allMainAnchors.filter((anchor) => Math.abs(anchor.ratio - snappedRatio) < 1e-6);
  const mainAnchors = atSnappedOnset.length > 0 ? atSnappedOnset : allMainAnchors;
  const nearest = withinReach ?? (mainAnchors.length > 0
    ? mainAnchors.reduce((best, anchor) => {
        const distance = Math.abs(anchor.x - pointerX);
        const bestDistance = Math.abs(best.x - pointerX);
        if (distance < bestDistance - 0.5) return anchor;
        if (Math.abs(distance - bestDistance) <= 0.5 && input.activeVoiceId != null
          && anchor.voiceId === input.activeVoiceId && best.voiceId !== input.activeVoiceId) return anchor;
        return best;
      })
    : null);

  if (!nearest) {
    return {
      mode: 'insert',
      targetRatio: clamp(snappedRatio, segmentStartRatio, maxStartRatio),
      anchor: null,
      targetVoiceId: null,
    };
  }

  const dx = withinReach ? pointerX - nearest.x : 0;
  if (nearest.isRest) {
    return {
      mode: 'replace',
      targetRatio: nearest.ratio,
      anchor: nearest,
      targetVoiceId: input.activeVoiceId ?? nearest.voiceId ?? null,
    };
  }
  if (dx < -threshold) {
    return {
      mode: 'insert',
      targetRatio: nearest.ratio,
      anchor: nearest,
      targetVoiceId: input.activeVoiceId ?? nearest.voiceId ?? null,
    };
  }
  if (dx > threshold) {
    return {
      mode: 'chord',
      targetRatio: nearest.ratio,
      anchor: nearest,
      targetVoiceId: nearest.voiceId ?? null,
    };
  }
  return {
    mode: 'replace',
    targetRatio: nearest.ratio,
    anchor: nearest,
    targetVoiceId: nearest.voiceId ?? null,
  };
}

export function applyGhostPlacementModifiers<T extends { placementMode: GhostPlacementMode }>(
  target: T | null,
  modifiers: GhostPlacementModifierState,
): T | null {
  if (!target) return null;
  // MuseScore: a click adds to the chord, Shift+click replaces, Ctrl/Cmd+Shift+click inserts
  // (handbook "Entering notes and rests"; M4 in docs/note-entry-mastery-ledger.md).
  if (modifiers.altKey) return { ...target, placementMode: 'chord' };
  if (modifiers.shiftKey && (modifiers.metaKey || modifiers.ctrlKey)) return { ...target, placementMode: 'insert' };
  if (modifiers.shiftKey) return { ...target, placementMode: 'replace' };
  return target;
}

export function buildLedgerLineSegments(input: {
  staffStep: number | null;
  lineCount: number;
  topLineDomY: number;
  lineDistanceDom: number;
  previewTop: number;
  noteheadCenterX: number;
  noteheadWidth?: number;
}): LedgerLineSegment[] {
  const { staffStep, lineCount, topLineDomY, lineDistanceDom, previewTop, noteheadCenterX } = input;
  if (staffStep == null || !Number.isFinite(lineDistanceDom) || lineDistanceDom <= 0) return [];

  const topLineStep = 0;
  const bottomLineStep = Math.max((lineCount - 1) * 2, 0);
  const halfStep = lineDistanceDom / 2;
  const noteheadWidth = Math.max(input.noteheadWidth ?? 11, 8);
  const x1 = noteheadCenterX - (noteheadWidth / 2) - 3;
  const x2 = noteheadCenterX + (noteheadWidth / 2) + 3;
  const segments: LedgerLineSegment[] = [];

  if (staffStep < topLineStep) {
    for (let step = -2; step >= staffStep; step -= 2) {
      segments.push({
        y: (topLineDomY + (step * halfStep)) - previewTop,
        x1,
        x2,
      });
    }
  } else if (staffStep > bottomLineStep) {
    for (let step = bottomLineStep + 2; step <= staffStep; step += 2) {
      segments.push({
        y: (topLineDomY + (step * halfStep)) - previewTop,
        x1,
        x2,
      });
    }
  }

  return segments;
}

const STEP_TO_SEMITONE: Record<string, number> = {
  C: 0,
  D: 2,
  E: 4,
  F: 5,
  G: 7,
  A: 9,
  B: 11,
};

const MIDI_TO_PITCH = [
  { step: 'C', alter: 0 },
  { step: 'C', alter: 1 },
  { step: 'D', alter: 0 },
  { step: 'D', alter: 1 },
  { step: 'E', alter: 0 },
  { step: 'F', alter: 0 },
  { step: 'F', alter: 1 },
  { step: 'G', alter: 0 },
  { step: 'G', alter: 1 },
  { step: 'A', alter: 0 },
  { step: 'A', alter: 1 },
  { step: 'B', alter: 0 },
] as const;

function midiNumber(step: string, alter: number, octave: number) {
  return ((octave + 1) * 12) + (STEP_TO_SEMITONE[step] ?? 0) + alter;
}

export function resolveDragTransposePreview(input: {
  startStep: string;
  startAlter: number;
  startOctave: number;
  startStaffStep: number;
  currentStaffStep: number;
  mode: 'chromatic' | 'diatonic';
}) {
  const deltaSteps = input.startStaffStep - input.currentStaffStep;
  if (input.mode === 'diatonic') {
    const stepOrder = ['C', 'D', 'E', 'F', 'G', 'A', 'B'] as const;
    const startIndex = (input.startOctave * stepOrder.length) + Math.max(stepOrder.indexOf(input.startStep as typeof stepOrder[number]), 0);
    const nextIndex = Math.max(startIndex + deltaSteps, 0);
    const octave = Math.floor(nextIndex / stepOrder.length);
    const step = stepOrder[((nextIndex % stepOrder.length) + stepOrder.length) % stepOrder.length] ?? 'C';
    return {
      step,
      alter: input.startAlter,
      octave,
      semitoneDelta: midiNumber(step, input.startAlter, octave) - midiNumber(input.startStep, input.startAlter, input.startOctave),
    };
  }

  const startMidi = midiNumber(input.startStep, input.startAlter, input.startOctave);
  const nextMidi = Math.max(startMidi + deltaSteps, 0);
  const octave = Math.floor(nextMidi / 12) - 1;
  const pitch = MIDI_TO_PITCH[((nextMidi % 12) + 12) % 12] ?? MIDI_TO_PITCH[0];
  return {
    step: pitch.step,
    alter: pitch.alter,
    octave,
    semitoneDelta: nextMidi - startMidi,
  };
}
