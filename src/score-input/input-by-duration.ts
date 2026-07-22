import type { MidiPitch } from '@/src/score-input/midi-input';
import type { WrittenAccidental } from '@/src/shared/music/accidentals';

const STEP_SEMITONES: Record<string, number> = {
  C: 0,
  D: 2,
  E: 4,
  F: 5,
  G: 7,
  A: 9,
  B: 11,
};

export interface PreparedDurationPitch extends MidiPitch {
  writtenAccidental?: WrittenAccidental;
}

export function writtenPitchToMidi(step: string, octave: number, alter: number): number {
  const pitchClass = STEP_SEMITONES[step.toUpperCase()] ?? 0;
  return Math.max(0, Math.min(127, ((octave + 1) * 12) + pitchClass + alter));
}

export function prepareDurationPitch(input: {
  step: string;
  octave: number;
  alter: number;
  writtenAccidental?: WrittenAccidental;
}): PreparedDurationPitch {
  return {
    ...input,
    midi: writtenPitchToMidi(input.step, input.octave, input.alter),
  };
}

export function updatePreparedDurationPitches(
  current: PreparedDurationPitch[],
  pitch: PreparedDurationPitch,
  mode: 'replace' | 'add',
): PreparedDurationPitch[] {
  if (mode === 'replace') return [pitch];
  return [...new Map([...current, pitch].map((entry) => [entry.midi, entry])).values()]
    .sort((left, right) => left.midi - right.midi);
}

export function formatPreparedDurationPitches(pitches: PreparedDurationPitch[]): string {
  return pitches
    .map((pitch) => {
      const accidental = pitch.alter === 2
        ? '𝄪'
        : pitch.alter === 1
          ? '♯'
          : pitch.alter === -1
            ? '♭'
            : pitch.alter === -2
              ? '𝄫'
              : '';
      return `${pitch.step}${accidental}${pitch.octave}`;
    })
    .join('+');
}
