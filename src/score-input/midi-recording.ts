import { parseMidiInputMessage } from './midi-input';
export interface RecordedMidiNote { midi: number; channel: number; startMs: number; endMs: number; velocity: number }
export interface QuantizedMidiNote { midi: number; startTick: number; durationTicks: number }

export class MidiTakeRecorder {
  private held = new Map<string, Omit<RecordedMidiNote, 'endMs'>>();
  private notes: RecordedMidiNote[] = [];
  constructor(readonly startMs: number) {}
  accept(data: ArrayLike<number>, atMs: number) {
    const message = parseMidiInputMessage(data);
    if (!message || message.type === 'sustain' || !Number.isFinite(atMs)) return;
    if (message.type === 'reset') { this.held.clear(); return; }
    const key = `${message.channel}:${message.note}`;
    const previous = this.held.get(key);
    if (previous && atMs > previous.startMs) this.notes.push({ ...previous, endMs: atMs });
    this.held.delete(key);
    if (message.type === 'on' && atMs >= this.startMs) this.held.set(key, { midi: message.note, channel: message.channel, startMs: atMs, velocity: message.velocity });
  }
  finish(atMs: number): RecordedMidiNote[] {
    for (const note of this.held.values()) if (atMs > note.startMs) this.notes.push({ ...note, endMs: atMs });
    this.held.clear();
    return this.notes.slice().sort((a,b) => a.startMs - b.startMs || a.midi - b.midi);
  }
}

/** Quantization is always recalculated from the original take, never from rounded notes. */
export function quantizeMidiTake(notes: RecordedMidiNote[], startMs: number, bpm: number, ticksPerQuarter: number): QuantizedMidiNote[] {
  if (!Number.isFinite(bpm) || bpm < 20 || bpm > 300 || ![1,2,4,8].includes(ticksPerQuarter)) throw new Error('Invalid tempo or quantization');
  const tickMs = 60000 / bpm / ticksPerQuarter;
  const result = notes.map(note => {
    const startTick = Math.max(0, Math.round((note.startMs - startMs) / tickMs));
    const endTick = Math.max(startTick + 1, Math.round((note.endMs - startMs) / tickMs));
    return { midi: note.midi, startTick, durationTicks: endTick - startTick };
  }).sort((a,b) => a.startTick - b.startTick || a.midi - b.midi);
  const groups = new Map<number, QuantizedMidiNote[]>();
  for (const note of result) {
    const group = groups.get(note.startTick) ?? [];
    if (!group.some(n => n.midi === note.midi)) group.push(note);
    groups.set(note.startTick, group);
  }
  const onsets = [...groups.keys()];
  return onsets.flatMap((onset, index) => {
    const chord = groups.get(onset)!;
    const duration = Math.max(...chord.map(n => n.durationTicks));
    // Step-like chord notation uses a shared gate and ends before the next onset.
    const next = onsets[index + 1];
    return chord.map(n => ({ ...n, durationTicks: next == null ? duration : Math.min(duration, next - onset) }));
  });
}
