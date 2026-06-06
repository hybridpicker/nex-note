import {
  clampVoiceId,
  pitchKey,
  timestampKey,
  type EditPlacementMode,
  type InteractiveEditMap,
  type InteractiveEditSlot,
  type ResolvedEditTarget,
} from '@/src/score-input/types';

export interface PointerEditCandidate {
  measureId: string | null;
  corePartId: string | null;
  measureNumber: number;
  staffIndex: number;
  voiceId: number;
  timestampNum: number;
  timestampDen: number;
  domX?: number | null;
  mode: EditPlacementMode;
  step: string;
  octave: number;
  alter: number;
  allowUnoccupiedVoice?: boolean;
}

export interface ResolvePointerEditTargetInput {
  editMap: InteractiveEditMap;
  candidate: PointerEditCandidate | null;
}

function normalizeStep(step: string) {
  const normalized = step.trim().toUpperCase();
  return /^[A-G]$/.test(normalized) ? normalized : null;
}

function fractionValue(num: number, den: number) {
  return num / Math.max(den, 1);
}

function resolveNearestSlot(
  slots: InteractiveEditSlot[],
  candidate: PointerEditCandidate,
): InteractiveEditSlot | null {
  if (slots.length === 0) return null;

  const candidateX = typeof candidate.domX === 'number' && Number.isFinite(candidate.domX)
    ? candidate.domX
    : null;
  if (candidateX != null) {
    const sorted = [...slots].sort((left, right) => left.domX - right.domX || left.ratio - right.ratio);
    const gaps = sorted
      .slice(1)
      .map((slot, index) => Math.abs(slot.domX - sorted[index]!.domX))
      .filter((gap) => Number.isFinite(gap) && gap > 0.5);
    const medianGap = gaps.length > 0
      ? [...gaps].sort((left, right) => left - right)[Math.floor(gaps.length / 2)]!
      : 32;
    const tolerancePx = Math.max(18, Math.min(96, (medianGap * 0.58) + 6));
    const nearest = sorted.reduce<InteractiveEditSlot | null>((best, slot) => {
      if (!best) return slot;
      const bestDistance = Math.abs(best.domX - candidateX);
      const slotDistance = Math.abs(slot.domX - candidateX);
      if (slotDistance !== bestDistance) return slotDistance < bestDistance ? slot : best;
      return Math.abs(slot.ratio - fractionValue(candidate.timestampNum, candidate.timestampDen))
        < Math.abs(best.ratio - fractionValue(candidate.timestampNum, candidate.timestampDen))
        ? slot
        : best;
    }, null);
    if (!nearest || Math.abs(nearest.domX - candidateX) > tolerancePx) return null;
    return nearest;
  }

  const targetRatio = fractionValue(candidate.timestampNum, candidate.timestampDen);
  const nearest = slots.reduce<InteractiveEditSlot | null>((best, slot) => {
    if (!best) return slot;
    return Math.abs(slot.ratio - targetRatio) < Math.abs(best.ratio - targetRatio) ? slot : best;
  }, null);
  if (!nearest || Math.abs(nearest.ratio - targetRatio) > (1 / 64)) return null;
  return nearest;
}

export function resolvePointerEditTarget(input: ResolvePointerEditTargetInput): ResolvedEditTarget | null {
  const candidate = input.candidate;
  if (!candidate?.measureId) return null;

  const step = normalizeStep(candidate.step);
  if (!step) return null;

  const diagnostics: string[] = [];
  const measure = input.editMap.measures.get(candidate.measureId);
  if (!measure) {
    diagnostics.push(`measure-not-visible:${candidate.measureId}`);
    return null;
  }

  const staff = measure.stavesByIndex.get(candidate.staffIndex);
  if (!staff) {
    diagnostics.push(`staff-not-visible:${candidate.measureId}:${candidate.staffIndex}`);
    return null;
  }

  const requestedTimestampKey = timestampKey(candidate.timestampNum, candidate.timestampDen);
  const exactSlot = staff.slotsByTimestamp.get(requestedTimestampKey) ?? null;
  const nearestSlot = resolveNearestSlot(staff.slots, candidate);
  const candidateX = typeof candidate.domX === 'number' && Number.isFinite(candidate.domX)
    ? candidate.domX
    : null;
  const nearestCanOverrideExact = Boolean(nearestSlot && (!nearestSlot.synthetic || exactSlot?.synthetic));
  const slot = exactSlot && nearestSlot && candidateX != null && nearestCanOverrideExact
    && Math.abs(nearestSlot.domX - candidateX) + 6 < Math.abs(exactSlot.domX - candidateX)
    ? nearestSlot
    : exactSlot ?? nearestSlot;
  if (!slot) {
    diagnostics.push(`slot-not-visible:${candidate.measureId}:${candidate.staffIndex}:${candidate.timestampNum}/${candidate.timestampDen}`);
    return null;
  }
  if (!exactSlot || slot !== exactSlot) {
    diagnostics.push(
      `slot-snapped:${candidate.measureId}:${candidate.staffIndex}:${requestedTimestampKey}->${timestampKey(slot.timestampNum, slot.timestampDen)}`,
    );
  }

  const requestedVoiceId = clampVoiceId(candidate.voiceId);
  const resolvedVoiceId = (() => {
    if (candidate.mode === 'insert') return requestedVoiceId;
    if (slot.voiceIds.includes(requestedVoiceId)) return requestedVoiceId;
    if (candidate.allowUnoccupiedVoice) {
      diagnostics.push(`voice-unoccupied-allowed:${candidate.measureId}:${candidate.staffIndex}:${requestedVoiceId}`);
      return requestedVoiceId;
    }
    if (slot.voiceIds.length === 1) {
      diagnostics.push(`voice-coerced:${candidate.measureId}:${candidate.staffIndex}:${requestedVoiceId}->${slot.voiceIds[0]}`);
      return slot.voiceIds[0]!;
    }
    return null;
  })();
  if (resolvedVoiceId == null) {
    diagnostics.push(`voice-ambiguity:${candidate.measureId}:${candidate.staffIndex}:${slot.timestampNum}/${slot.timestampDen}`);
    return null;
  }

  if (staff.pitchLanes.length > 0) {
    const lane = staff.pitchLanesByPitch.get(pitchKey(step, candidate.alter, candidate.octave));
    if (!lane) {
      diagnostics.push(`pitch-lane-miss:${candidate.measureId}:${candidate.staffIndex}:${step}${candidate.alter}:${candidate.octave}`);
    }
  }

  return {
    source: 'pointer',
    mode: candidate.mode,
    measureId: measure.measureId,
    corePartId: candidate.corePartId ?? measure.corePartId ?? null,
    measureNumber: measure.measureNumber,
    staffIndex: staff.staffIndex,
    voiceId: resolvedVoiceId,
    timestampNum: slot.timestampNum,
    timestampDen: slot.timestampDen,
    ratio: slot.ratio,
    domX: slot.domX,
    allowOccupiedInsert: candidate.mode === 'insert',
    step,
    octave: candidate.octave,
    alter: candidate.alter,
    diagnostics,
  };
}
