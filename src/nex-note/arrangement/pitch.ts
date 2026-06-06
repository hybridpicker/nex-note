export type PitchStep = 'C' | 'D' | 'E' | 'F' | 'G' | 'A' | 'B';

export interface WrittenPitch {
  step: PitchStep;
  alter: number;
  octave: number;
}

const STEP_TO_SEMITONE: Record<PitchStep, number> = {
  C: 0,
  D: 2,
  E: 4,
  F: 5,
  G: 7,
  A: 9,
  B: 11,
};

export function buildWrittenPitch(step: PitchStep, octave: number, alter = 0): WrittenPitch {
  return { step, octave, alter };
}

export function pitchToMidi(pitch: WrittenPitch) {
  return STEP_TO_SEMITONE[pitch.step] + pitch.alter + ((pitch.octave + 1) * 12);
}

export function pitchLabel(pitch: WrittenPitch) {
  const accidental = pitch.alter === 2
    ? 'x'
    : pitch.alter === 1
      ? '#'
      : pitch.alter === -1
        ? 'b'
        : pitch.alter === -2
          ? 'bb'
          : '';
  return `${pitch.step}${accidental}${pitch.octave}`;
}

export function motionDirection(previous: WrittenPitch, next: WrittenPitch) {
  const delta = pitchToMidi(next) - pitchToMidi(previous);
  if (delta === 0) return 0;
  return delta > 0 ? 1 : -1;
}

export function semitoneDistance(lower: WrittenPitch, upper: WrittenPitch) {
  return pitchToMidi(upper) - pitchToMidi(lower);
}

export function intervalClass(left: WrittenPitch, right: WrittenPitch) {
  return Math.abs(semitoneDistance(left, right)) % 12;
}

export function isPerfectFifth(left: WrittenPitch, right: WrittenPitch) {
  return intervalClass(left, right) === 7;
}

export function isPerfectOctaveOrUnison(left: WrittenPitch, right: WrittenPitch) {
  return intervalClass(left, right) === 0;
}
