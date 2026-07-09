export interface MidiPitch {
  midi: number;
  step: string;
  octave: number;
  alter: number;
}

export interface MidiNoteOn {
  channel: number;
  note: number;
  velocity: number;
}

const SHARP_PITCHES = [
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

const FLAT_PITCHES = [
  { step: 'C', alter: 0 },
  { step: 'D', alter: -1 },
  { step: 'D', alter: 0 },
  { step: 'E', alter: -1 },
  { step: 'E', alter: 0 },
  { step: 'F', alter: 0 },
  { step: 'G', alter: -1 },
  { step: 'G', alter: 0 },
  { step: 'A', alter: -1 },
  { step: 'A', alter: 0 },
  { step: 'B', alter: -1 },
  { step: 'B', alter: 0 },
] as const;

export function parseMidiNoteOn(data: ArrayLike<number>): MidiNoteOn | null {
  if (data.length < 3) return null;
  const rawStatus = Number(data[0]);
  const note = Number(data[1]);
  const velocity = Number(data[2]);
  if (![rawStatus, note, velocity].every(Number.isFinite)) return null;
  const status = rawStatus & 0xff;
  const command = status & 0xf0;
  if (command !== 0x90 || velocity <= 0) return null;
  if (note < 0 || note > 127) return null;
  return {
    channel: status & 0x0f,
    note: Math.trunc(note),
    velocity: Math.max(1, Math.min(127, Math.trunc(velocity))),
  };
}

export function midiNoteToPitch(midiNote: number, preferFlats = false): MidiPitch {
  const midi = Number.isFinite(midiNote)
    ? Math.max(0, Math.min(127, Math.trunc(midiNote)))
    : 60;
  const pitchClass = ((midi % 12) + 12) % 12;
  const spelling = (preferFlats ? FLAT_PITCHES : SHARP_PITCHES)[pitchClass] ?? SHARP_PITCHES[0];
  return {
    midi,
    step: spelling.step,
    alter: spelling.alter,
    octave: Math.floor(midi / 12) - 1,
  };
}

export function normalizeMidiChord(notes: Iterable<number>, preferFlats = false): MidiPitch[] {
  return [...new Set([...notes]
    .filter((note) => Number.isFinite(note) && note >= 0 && note <= 127)
    .map((note) => Math.trunc(note)))]
    .sort((left, right) => left - right)
    .map((note) => midiNoteToPitch(note, preferFlats));
}

export function preferFlatsForKeySignature(keyFifths: number | null | undefined) {
  return Number.isFinite(keyFifths) && Number(keyFifths) < 0;
}
