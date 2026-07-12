export interface GuitarStringTuning {
  string: 1 | 2 | 3 | 4 | 5 | 6;
  label: string;
  openMidi: number;
}

export type GuitarTuningId = 'standard' | 'drop-d' | 'dadgad' | 'open-g';

export interface GuitarTuningPreset {
  id: GuitarTuningId;
  label: string;
  strings: GuitarStringTuning[];
}

export interface GuitarFretPitch {
  string: 1 | 2 | 3 | 4 | 5 | 6;
  fret: number;
  step: string;
  octave: number;
  alter: number;
  label: string;
  midi: number;
}

export const STANDARD_GUITAR_TUNING: GuitarStringTuning[] = [
  { string: 1, label: 'E4', openMidi: 64 },
  { string: 2, label: 'B3', openMidi: 59 },
  { string: 3, label: 'G3', openMidi: 55 },
  { string: 4, label: 'D3', openMidi: 50 },
  { string: 5, label: 'A2', openMidi: 45 },
  { string: 6, label: 'E2', openMidi: 40 },
];

export const GUITAR_TUNINGS: GuitarTuningPreset[] = [
  { id: 'standard', label: 'Standard EADGBE', strings: STANDARD_GUITAR_TUNING },
  {
    id: 'drop-d',
    label: 'Drop D',
    strings: [
      { string: 1, label: 'E4', openMidi: 64 },
      { string: 2, label: 'B3', openMidi: 59 },
      { string: 3, label: 'G3', openMidi: 55 },
      { string: 4, label: 'D3', openMidi: 50 },
      { string: 5, label: 'A2', openMidi: 45 },
      { string: 6, label: 'D2', openMidi: 38 },
    ],
  },
  {
    id: 'dadgad',
    label: 'DADGAD',
    strings: [
      { string: 1, label: 'D4', openMidi: 62 },
      { string: 2, label: 'A3', openMidi: 57 },
      { string: 3, label: 'G3', openMidi: 55 },
      { string: 4, label: 'D3', openMidi: 50 },
      { string: 5, label: 'A2', openMidi: 45 },
      { string: 6, label: 'D2', openMidi: 38 },
    ],
  },
  {
    id: 'open-g',
    label: 'Open G',
    strings: [
      { string: 1, label: 'D4', openMidi: 62 },
      { string: 2, label: 'B3', openMidi: 59 },
      { string: 3, label: 'G3', openMidi: 55 },
      { string: 4, label: 'D3', openMidi: 50 },
      { string: 5, label: 'G2', openMidi: 43 },
      { string: 6, label: 'D2', openMidi: 38 },
    ],
  },
];

export function resolveGuitarTuning(id: string | null | undefined) {
  return GUITAR_TUNINGS.find((tuning) => tuning.id === id) ?? GUITAR_TUNINGS[0];
}

const SHARP_PITCH_CLASSES: Array<{ step: string; alter: number }> = [
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
];

function clampFret(fret: number) {
  if (!Number.isFinite(fret)) return 0;
  return Math.max(0, Math.min(24, Math.trunc(fret)));
}

export const MAX_GUITAR_FRET = 24;

export function pitchToMidi(pitch: { step: string; alter?: number; octave: number }) {
  const semitoneByStep: Record<string, number> = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 };
  return ((pitch.octave + 1) * 12) + (semitoneByStep[pitch.step.toUpperCase()] ?? 0) + (pitch.alter ?? 0);
}

/** Guitar standard notation is written one octave above its sounding pitch. */
export function guitarWrittenToSoundingPitch<T extends { step: string; alter?: number; octave: number }>(pitch: T): T {
  return { ...pitch, octave: pitch.octave - 1 };
}

/** Convert a sounding guitar/TAB pitch to conventional guitar notation. */
export function guitarSoundingToWrittenPitch<T extends { step: string; alter?: number; octave: number }>(pitch: T): T {
  return { ...pitch, octave: pitch.octave + 1 };
}

/**
 * Fret that produces `midi` on the given string, or null when the pitch is
 * not reachable there (below the open string or beyond the last fret).
 */
export function fretForMidiOnString(
  midi: number,
  string: 1 | 2 | 3 | 4 | 5 | 6,
  tuning: GuitarStringTuning[] | GuitarTuningPreset = STANDARD_GUITAR_TUNING,
): number | null {
  const strings = Array.isArray(tuning) ? tuning : tuning.strings;
  const stringTuning = strings.find((candidate) => candidate.string === string);
  if (!stringTuning || !Number.isFinite(midi)) return null;
  const fret = Math.round(midi) - stringTuning.openMidi;
  return fret >= 0 && fret <= MAX_GUITAR_FRET ? fret : null;
}

export function chooseGuitarFingeringForPitch(
  pitch: { step: string; alter?: number; octave: number },
  tuning: GuitarStringTuning[] | GuitarTuningPreset = STANDARD_GUITAR_TUNING,
  preferredString?: 1 | 2 | 3 | 4 | 5 | 6,
): { string: 1 | 2 | 3 | 4 | 5 | 6; fret: number } | null {
  const midi = pitchToMidi(pitch);
  if (preferredString) {
    const fret = fretForMidiOnString(midi, preferredString, tuning);
    if (fret != null) return { string: preferredString, fret };
  }

  const strings = Array.isArray(tuning) ? tuning : tuning.strings;
  const candidates = strings
    .map((stringTuning) => ({
      string: stringTuning.string,
      fret: fretForMidiOnString(midi, stringTuning.string, tuning),
    }))
    .filter((candidate): candidate is { string: 1 | 2 | 3 | 4 | 5 | 6; fret: number } => candidate.fret != null);

  if (candidates.length === 0) return null;

  return candidates.sort((left, right) => (
    left.fret - right.fret
    || left.string - right.string
  ))[0] ?? null;
}

export function resolveGuitarFretPitch(
  string: 1 | 2 | 3 | 4 | 5 | 6,
  fret: number,
  tuning: GuitarStringTuning[] | GuitarTuningPreset = STANDARD_GUITAR_TUNING,
): GuitarFretPitch {
  const strings = Array.isArray(tuning) ? tuning : tuning.strings;
  const stringTuning = strings.find((candidate) => candidate.string === string) ?? strings[0];
  const normalizedFret = clampFret(fret);
  const midi = stringTuning.openMidi + normalizedFret;
  const pitchClass = ((midi % 12) + 12) % 12;
  const pitch = SHARP_PITCH_CLASSES[pitchClass] ?? SHARP_PITCH_CLASSES[0];
  const octave = Math.floor(midi / 12) - 1;
  const accidental = pitch.alter === 1 ? '#' : pitch.alter === -1 ? 'b' : '';
  return {
    string,
    fret: normalizedFret,
    step: pitch.step,
    octave,
    alter: pitch.alter,
    label: `${pitch.step}${accidental}${octave}`,
    midi,
  };
}
