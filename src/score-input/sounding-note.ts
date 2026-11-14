/**
 * Source-neutral note events between a pitch source and notation entry.
 *
 * A detected note leaves the audio layer as a plain sounding MIDI number with
 * a time. Nothing here knows whether it came from the microphone path, the
 * guitar amp tracker, a MIDI keyboard or, one day, a virtual MIDI source
 * published by another app. Turning sounding pitch into written pitch is a
 * separate, explicit step (`notationMidisForInstrument`), so guitar notation
 * never depends on one particular input.
 */
export type SoundingNoteEvent =
  | { type: 'note-on'; midi: number; timeMs: number }
  | { type: 'note-off'; midi: number; timeMs: number };

/**
 * Groups note-ons into what is written together: note-ons with the same time
 * are the strings of one chord, lowest first.
 */
export function simultaneousNoteOns(events: readonly SoundingNoteEvent[]): number[][] {
  const groups: Array<{ timeMs: number; midis: number[] }> = [];
  for (const event of events) {
    if (event.type !== 'note-on') continue;
    const last = groups[groups.length - 1];
    if (last && last.timeMs === event.timeMs) last.midis.push(event.midi);
    else groups.push({ timeMs: event.timeMs, midis: [event.midi] });
  }
  return groups.map((group) => [...new Set(group.midis)].sort((left, right) => left - right));
}

/** How sounding pitch is written. Guitar music is written an octave above sounding pitch. */
export type InstrumentNotationMode = 'concert' | 'guitar';

export function notationMidisForInstrument(
  soundingMidis: number[],
  mode: InstrumentNotationMode,
) {
  const offset = mode === 'guitar' ? 12 : 0;
  return soundingMidis.map((midi) => Math.min(127, midi + offset));
}
