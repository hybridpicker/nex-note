import type { SelectedNote } from '@/hooks/useNoteEditor';

export type DragTransposeMode = 'chromatic' | 'diatonic';

const STEP_ORDER = ['C', 'D', 'E', 'F', 'G', 'A', 'B'] as const;
const STEP_TO_SEMITONE: Record<string, number> = {
  C: 0,
  D: 2,
  E: 4,
  F: 5,
  G: 7,
  A: 9,
  B: 11,
};

const CHROMA_TO_SHARPS = [
  { step: 'C', alter: 0, spelling: 'C' },
  { step: 'C', alter: 1, spelling: 'C#' },
  { step: 'D', alter: 0, spelling: 'D' },
  { step: 'D', alter: 1, spelling: 'D#' },
  { step: 'E', alter: 0, spelling: 'E' },
  { step: 'F', alter: 0, spelling: 'F' },
  { step: 'F', alter: 1, spelling: 'F#' },
  { step: 'G', alter: 0, spelling: 'G' },
  { step: 'G', alter: 1, spelling: 'G#' },
  { step: 'A', alter: 0, spelling: 'A' },
  { step: 'A', alter: 1, spelling: 'A#' },
  { step: 'B', alter: 0, spelling: 'B' },
] as const;

const SHARP_ORDER = ['F', 'C', 'G', 'D', 'A', 'E', 'B'] as const;
const FLAT_ORDER = ['B', 'E', 'A', 'D', 'G', 'C', 'F'] as const;

function clamp(value: number, min: number, max: number) {
  return Math.min(Math.max(value, min), max);
}

function noteToMidi(step: string, alter: number, octave: number) {
  return (STEP_TO_SEMITONE[step] ?? 0) + alter + ((octave + 1) * 12);
}

function defaultAlterForStep(step: string, keyFifths: number) {
  if (keyFifths > 0) return SHARP_ORDER.slice(0, keyFifths).includes(step as typeof SHARP_ORDER[number]) ? 1 : 0;
  if (keyFifths < 0) return FLAT_ORDER.slice(0, Math.abs(keyFifths)).includes(step as typeof FLAT_ORDER[number]) ? -1 : 0;
  return 0;
}

function spelling(step: string, alter: number) {
  const accidental = alter === 1 ? '#'
    : alter === -1 ? 'b'
      : alter === 2 ? 'x'
        : alter === -2 ? 'bb'
          : '';
  return `${step}${accidental}`;
}

export interface ResolvedTransposePitch {
  step: string;
  alter: number;
  octave: number;
  pitch: number;
  spelling: string;
}

export function resolveDragTransposePitch(input: {
  note: Pick<SelectedNote, 'step' | 'alter' | 'octave'>;
  deltaStaffSteps: number;
  mode: DragTransposeMode;
  keyFifths?: number;
}): ResolvedTransposePitch {
  const { note, deltaStaffSteps, mode } = input;

  if (mode === 'chromatic') {
    const midi = clamp(noteToMidi(note.step, note.alter, note.octave) + deltaStaffSteps, 0, 127);
    const mapped = CHROMA_TO_SHARPS[((midi % 12) + 12) % 12] ?? CHROMA_TO_SHARPS[0];
    const octave = Math.floor(midi / 12) - 1;
    return {
      step: mapped.step,
      alter: mapped.alter,
      octave,
      pitch: midi,
      spelling: mapped.spelling,
    };
  }

  const startIndex = (note.octave * STEP_ORDER.length) + Math.max(STEP_ORDER.indexOf(note.step as typeof STEP_ORDER[number]), 0);
  const nextIndex = Math.max(startIndex + deltaStaffSteps, 0);
  const octave = Math.floor(nextIndex / STEP_ORDER.length);
  const step = STEP_ORDER[((nextIndex % STEP_ORDER.length) + STEP_ORDER.length) % STEP_ORDER.length] ?? 'C';
  const alter = defaultAlterForStep(step, input.keyFifths ?? 0);
  return {
    step,
    alter,
    octave,
    pitch: noteToMidi(step, alter, octave),
    spelling: spelling(step, alter),
  };
}
