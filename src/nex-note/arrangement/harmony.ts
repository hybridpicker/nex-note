import type { PitchStep, WrittenPitch } from '@/src/nex-note/arrangement/pitch';
import { pitchToMidi } from '@/src/nex-note/arrangement/pitch';
import type { HarmonicFunctionLabel, PitchClassSpelling, TonalCenter } from '@/src/nex-note/arrangement/spec';

const STEP_TO_SEMITONE: Record<PitchStep, number> = {
  C: 0,
  D: 2,
  E: 4,
  F: 5,
  G: 7,
  A: 9,
  B: 11,
};

const STEP_SEQUENCE: PitchStep[] = ['C', 'D', 'E', 'F', 'G', 'A', 'B'];
const MAJOR_TONICS_BY_FIFTHS: Record<number, PitchClassSpelling> = {
  '-7': { step: 'C', alter: -1 },
  '-6': { step: 'G', alter: -1 },
  '-5': { step: 'D', alter: -1 },
  '-4': { step: 'A', alter: -1 },
  '-3': { step: 'E', alter: -1 },
  '-2': { step: 'B', alter: -1 },
  '-1': { step: 'F', alter: 0 },
  0: { step: 'C', alter: 0 },
  1: { step: 'G', alter: 0 },
  2: { step: 'D', alter: 0 },
  3: { step: 'A', alter: 0 },
  4: { step: 'E', alter: 0 },
  5: { step: 'B', alter: 0 },
  6: { step: 'F', alter: 1 },
  7: { step: 'C', alter: 1 },
};

export function pitchClassToSemitone(spelling: PitchClassSpelling) {
  return ((STEP_TO_SEMITONE[spelling.step] + spelling.alter) % 12 + 12) % 12;
}

export function matchesPitchClassSpelling(pitch: WrittenPitch, spelling: PitchClassSpelling) {
  return pitch.step === spelling.step && pitch.alter === spelling.alter;
}

export function tonicPitchClassMatches(pitch: WrittenPitch, tonalCenter?: TonalCenter | null) {
  if (!tonalCenter) return false;
  return matchesPitchClassSpelling(pitch, tonalCenter.tonic);
}

export function buildLeadingToneSpelling(tonalCenter: TonalCenter): PitchClassSpelling {
  const tonicIndex = STEP_SEQUENCE.indexOf(tonalCenter.tonic.step);
  const leadingStep = STEP_SEQUENCE[(tonicIndex + STEP_SEQUENCE.length - 1) % STEP_SEQUENCE.length] ?? 'B';
  const naturalSemitone = STEP_TO_SEMITONE[leadingStep];
  const targetSemitone = (pitchClassToSemitone(tonalCenter.tonic) + 11) % 12;
  let alter = targetSemitone - naturalSemitone;
  if (alter <= -6) alter += 12;
  if (alter >= 6) alter -= 12;
  return { step: leadingStep, alter };
}

export function isDominantFunction(functionLabel?: HarmonicFunctionLabel) {
  return functionLabel === 'dominant'
    || functionLabel === 'secondary-dominant'
    || functionLabel === 'applied-leading-tone'
    || functionLabel === 'subV';
}

export function isPitchWithinRange(pitch: WrittenPitch, range: { min: WrittenPitch; max: WrittenPitch }) {
  const midi = pitchToMidi(pitch);
  return midi >= pitchToMidi(range.min) && midi <= pitchToMidi(range.max);
}

export function tonalCenterFromKeyFifths(fifths: number, mode: TonalCenter['mode'] = 'major'): TonalCenter {
  const clamped = Math.max(-7, Math.min(7, Math.round(fifths)));
  return {
    tonic: MAJOR_TONICS_BY_FIFTHS[clamped] ?? MAJOR_TONICS_BY_FIFTHS[0]!,
    mode,
  };
}
