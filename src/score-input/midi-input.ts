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

export type MidiInputMessage =
  | { type: 'on' | 'off'; channel: number; note: number; velocity: number }
  | { type: 'sustain'; channel: number; down: boolean }
  | { type: 'reset'; channel: number };

/** Strict channel-message parsing; malformed bytes must never become pitches. */
export function parseMidiInputMessage(data: ArrayLike<number>): MidiInputMessage | null {
  if (data.length < 3) return null;
  const [status, first, second] = [Number(data[0]), Number(data[1]), Number(data[2])];
  if (!Number.isInteger(status) || status < 0x80 || status > 0xef
    || ![first, second].every(value => Number.isInteger(value) && value >= 0 && value <= 127)) return null;
  const channel = status & 15;
  const kind = status & 0xf0;
  if (kind === 0x80 || kind === 0x90) {
    return { type: kind === 0x80 || second === 0 ? 'off' : 'on', channel, note: first, velocity: second };
  }
  if (kind === 0xb0 && first === 64) return { type: 'sustain', channel, down: second >= 64 };
  if (kind === 0xb0 && [120, 121, 123].includes(first)) return { type: 'reset', channel };
  return null;
}

/** Step-time chords end on physical key release. Sustain never advances or prolongs notation. */
export class MidiStepAccumulator {
  private held = new Set<string>();
  private pending = new Set<number>();

  reset() { this.held.clear(); this.pending.clear(); }

  accept(data: ArrayLike<number>): number[][] {
    const message = parseMidiInputMessage(data);
    if (!message || message.type === 'sustain') return [];
    if (message.type === 'reset') { this.reset(); return []; }
    const key = `${message.channel}:${message.note}`;
    if (message.type === 'on') {
      const completed: number[][] = [];
      // A repeated attack is a new onset, even if a device omitted Note Off.
      if (this.held.has(key) && this.pending.size) {
        completed.push([...this.pending].sort((a, b) => a - b));
        this.reset();
      }
      this.held.add(key);
      this.pending.add(message.note);
      return completed;
    }
    if (!this.held.delete(key)) return [];
    if (this.held.size || !this.pending.size) return [];
    const chord = [...this.pending].sort((a, b) => a - b);
    this.pending.clear();
    return [chord];
  }
}
