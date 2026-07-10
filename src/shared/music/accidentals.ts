export type WrittenAccidental = 'double-sharp' | 'sharp' | 'natural' | 'flat' | 'double-flat';

export interface EnharmonicPitch {
  step: string;
  alter: number;
  octave: number;
}

const DIATONIC_STEPS = ['C', 'D', 'E', 'F', 'G', 'A', 'B'] as const;
const NATURAL_SEMITONES: Record<(typeof DIATONIC_STEPS)[number], number> = {
  C: 0,
  D: 2,
  E: 4,
  F: 5,
  G: 7,
  A: 9,
  B: 11,
};

const WRITTEN_ACCIDENTALS = new Set<WrittenAccidental>(['double-sharp', 'sharp', 'natural', 'flat', 'double-flat']);

export function isWrittenAccidental(value: unknown): value is WrittenAccidental {
  return typeof value === 'string' && WRITTEN_ACCIDENTALS.has(value as WrittenAccidental);
}

export function writtenAccidentalToAlter(accidental: WrittenAccidental | null | undefined): number {
  if (accidental === 'double-sharp') return 2;
  if (accidental === 'sharp') return 1;
  if (accidental === 'flat') return -1;
  if (accidental === 'double-flat') return -2;
  return 0;
}

export function writtenAccidentalToMusicXml(accidental: WrittenAccidental): string {
  return accidental === 'double-flat' ? 'flat-flat' : accidental;
}

export function musicXmlToWrittenAccidental(value: string | null | undefined): WrittenAccidental | undefined {
  const normalized = (value ?? '').trim().toLowerCase();
  if (normalized === 'flat-flat') return 'double-flat';
  if (
    normalized === 'double-sharp'
    || normalized === 'sharp'
    || normalized === 'natural'
    || normalized === 'flat'
  ) {
    return normalized;
  }
  return undefined;
}

export function pitchToMidi(pitch: EnharmonicPitch): number {
  const step = pitch.step.toUpperCase() as (typeof DIATONIC_STEPS)[number];
  const natural = NATURAL_SEMITONES[step];
  if (natural == null) return Number.NaN;
  return (pitch.octave + 1) * 12 + natural + pitch.alter;
}

/**
 * Cycles to the next conventional spelling for the same sounding MIDI pitch.
 * Spellings are ordered upward by diatonic staff position and are limited to
 * standard double-flat through double-sharp accidentals.
 */
export function resolveNextEnharmonicPitch(pitch: EnharmonicPitch): EnharmonicPitch {
  const midi = pitchToMidi(pitch);
  if (!Number.isFinite(midi)) return { ...pitch };

  const spellings = DIATONIC_STEPS.flatMap((step, stepIndex) => {
    const candidates: Array<EnharmonicPitch & { diatonicIndex: number }> = [];
    for (let octave = Math.max(0, pitch.octave - 1); octave <= Math.min(9, pitch.octave + 1); octave += 1) {
      const alter = midi - ((octave + 1) * 12 + NATURAL_SEMITONES[step]);
      if (alter < -2 || alter > 2) continue;
      candidates.push({ step, alter, octave, diatonicIndex: octave * 7 + stepIndex });
    }
    return candidates;
  }).sort((left, right) => left.diatonicIndex - right.diatonicIndex);

  if (spellings.length < 2) return { ...pitch };
  const currentIndex = spellings.findIndex((candidate) => (
    candidate.step === pitch.step.toUpperCase()
    && candidate.alter === pitch.alter
    && candidate.octave === pitch.octave
  ));
  const next = spellings[(currentIndex < 0 ? 0 : currentIndex + 1) % spellings.length]!;
  return { step: next.step, alter: next.alter, octave: next.octave };
}
