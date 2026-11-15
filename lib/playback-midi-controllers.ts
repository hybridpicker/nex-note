// MIDI controllers that change how long notes sound. Only the sustain pedal (CC64) is read for
// now; CC2 (breath) and others are ignored.

export const SUSTAIN_PEDAL_CONTROLLER = 64;
const PEDAL_DOWN_THRESHOLD = 0.5; // @tonejs/midi normalises controller values to 0..1 (64/127 = down)
const EPSILON_S = 1e-6;

export interface PedalEvent {
  time: number;
  /** Controller value, 0..1. */
  value: number;
}

export interface PedalInterval {
  down: number;
  up: number;
}

export interface PedalNote {
  time: number;
  duration: number;
  midi: number;
}

/** Pedal-down intervals; a pedal still down at the end of the track never lifts (up = Infinity). */
export function sustainPedalIntervals(events: readonly PedalEvent[] | null | undefined): PedalInterval[] {
  const sorted = [...(events ?? [])]
    .filter((event) => Number.isFinite(event.time) && Number.isFinite(event.value))
    .sort((left, right) => left.time - right.time);
  const intervals: PedalInterval[] = [];
  let downAt: number | null = null;
  for (const event of sorted) {
    const isDown = event.value >= PEDAL_DOWN_THRESHOLD;
    if (isDown && downAt == null) downAt = event.time;
    if (!isDown && downAt != null) {
      if (event.time > downAt) intervals.push({ down: downAt, up: event.time });
      downAt = null;
    }
  }
  if (downAt != null) intervals.push({ down: downAt, up: Number.POSITIVE_INFINITY });
  return intervals;
}

/**
 * Applies the sustain pedal to one track's notes: a note released while the pedal is down sounds
 * on until the next pedal-up, and a pitch struck again while it is held by the pedal ends the
 * held note at the new onset. Returns new note objects; the input is not changed.
 */
export function applySustainPedal<T extends PedalNote>(notes: readonly T[], pedalEvents: readonly PedalEvent[] | null | undefined): T[] {
  const intervals = sustainPedalIntervals(pedalEvents);
  if (intervals.length === 0) return notes.slice();

  const lastNoteOff = notes.reduce((latest, note) => Math.max(latest, note.time + note.duration), 0);
  const sustained = notes.map((note) => {
    const end = note.time + note.duration;
    const interval = intervals.find((candidate) => end > candidate.down + EPSILON_S && end < candidate.up - EPSILON_S);
    if (!interval) return { note: { ...note }, originalEnd: end, sustainedEnd: end };
    // A pedal that never lifts holds the note to the track's last note-off, not forever.
    const sustainedEnd = Number.isFinite(interval.up) ? interval.up : Math.max(end, lastNoteOff);
    return { note: { ...note }, originalEnd: end, sustainedEnd };
  });

  const byPitch = new Map<number, typeof sustained>();
  sustained.forEach((entry) => {
    const group = byPitch.get(entry.note.midi) ?? [];
    group.push(entry);
    byPitch.set(entry.note.midi, group);
  });
  byPitch.forEach((group) => {
    group.sort((left, right) => left.note.time - right.note.time);
    group.forEach((entry, index) => {
      const next = group.slice(index + 1).find((candidate) => candidate.note.time > entry.note.time + EPSILON_S);
      if (next && entry.sustainedEnd > next.note.time) {
        entry.sustainedEnd = Math.max(entry.originalEnd, next.note.time);
      }
    });
  });

  return sustained.map(({ note, sustainedEnd }) => ({ ...note, duration: Math.max(note.duration, sustainedEnd - note.time) }));
}
