import { Midi } from '@tonejs/midi';

export type MidiImportProfile = 'piano' | 'lead-sheet' | 'ensemble' | 'drums' | 'general';
export type MidiQuantization = 'auto' | '1/8' | '1/16' | '1/32';

export interface MidiTrackAnalysis {
  index: number;
  name: string;
  channel: number | null;
  instrument: string;
  noteCount: number;
  minMidi: number | null;
  maxMidi: number | null;
  monophonicRatio: number;
  averageVelocity: number;
}

export interface MidiImportAnalysis {
  format: 'midi';
  durationSeconds: number;
  ppq: number;
  tempoBpm: number | null;
  timeSignature: { beats: number; beatType: number } | null;
  trackCount: number;
  noteCount: number;
  profile: MidiImportProfile;
  quantization: MidiQuantization;
  allowTuplets: boolean;
  preservePerformanceTiming: boolean;
  tracks: MidiTrackAnalysis[];
  summary: string;
  plan: string[];
  warnings: string[];
}

function round(value: number, decimals = 2) {
  const scale = 10 ** decimals;
  return Math.round(value * scale) / scale;
}

function resolveTrackName(track: Midi['tracks'][number], index: number) {
  return track.name?.trim() || track.instrument.name || `Track ${index + 1}`;
}

function computeMonophonicRatio(notes: Midi['tracks'][number]['notes']) {
  if (notes.length <= 1) return 1;
  const sorted = [...notes].sort((a, b) => a.time - b.time || b.duration - a.duration);
  let nonOverlapping = 0;
  let previousEnd = -Infinity;
  for (const note of sorted) {
    if (note.time >= previousEnd - 0.01) nonOverlapping += 1;
    previousEnd = Math.max(previousEnd, note.time + note.duration);
  }
  return nonOverlapping / sorted.length;
}

function recommendQuantization(midi: Midi, shortestNoteSeconds: number | null): MidiQuantization {
  const tempo = midi.header.tempos[0]?.bpm ?? 120;
  if (!shortestNoteSeconds || shortestNoteSeconds <= 0) return 'auto';
  const quarterSeconds = 60 / tempo;
  const shortestInQuarters = shortestNoteSeconds / quarterSeconds;
  if (shortestInQuarters <= 0.18) return '1/32';
  if (shortestInQuarters <= 0.38) return '1/16';
  return '1/8';
}

function inferProfile(tracks: MidiTrackAnalysis[]): MidiImportProfile {
  const soundingTracks = tracks.filter((track) => track.noteCount > 0);
  const drumTracks = soundingTracks.filter((track) => track.channel === 9 || /drum|percussion/i.test(track.instrument));
  if (soundingTracks.length > 0 && drumTracks.length / soundingTracks.length >= 0.6) return 'drums';
  if (soundingTracks.length === 1) {
    const track = soundingTracks[0]!;
    const range = track.minMidi != null && track.maxMidi != null ? track.maxMidi - track.minMidi : 0;
    if (/piano|keyboard/i.test(track.instrument) || range >= 32 || track.monophonicRatio < 0.72) return 'piano';
    if (track.monophonicRatio > 0.88) return 'lead-sheet';
  }
  if (soundingTracks.length === 2 && soundingTracks.some((track) => /piano|keyboard/i.test(track.instrument))) return 'piano';
  if (soundingTracks.length >= 4) return 'ensemble';
  return 'general';
}

export function analyzeMidiBuffer(buffer: Buffer | ArrayBuffer | Uint8Array): MidiImportAnalysis {
  const bytes = buffer instanceof Buffer
    ? buffer
    : buffer instanceof Uint8Array
      ? Buffer.from(buffer)
      : Buffer.from(buffer);
  const midi = new Midi(bytes);
  const tracks: MidiTrackAnalysis[] = midi.tracks.map((track, index) => {
    const notes = track.notes;
    const midiValues = notes.map((note) => note.midi);
    const velocities = notes.map((note) => note.velocity);
    return {
      index,
      name: resolveTrackName(track, index),
      channel: track.channel ?? null,
      instrument: track.instrument.name || track.instrument.family || 'unknown',
      noteCount: notes.length,
      minMidi: midiValues.length ? Math.min(...midiValues) : null,
      maxMidi: midiValues.length ? Math.max(...midiValues) : null,
      monophonicRatio: round(computeMonophonicRatio(notes)),
      averageVelocity: velocities.length ? round(velocities.reduce((sum, value) => sum + value, 0) / velocities.length) : 0,
    };
  });
  const noteDurations = midi.tracks.flatMap((track) => track.notes.map((note) => note.duration).filter((duration) => duration > 0));
  const noteCount = tracks.reduce((sum, track) => sum + track.noteCount, 0);
  const shortestNoteSeconds = noteDurations.length ? Math.min(...noteDurations) : null;
  const profile = inferProfile(tracks);
  const quantization = recommendQuantization(midi, shortestNoteSeconds);
  const timeSignature = midi.header.timeSignatures[0]?.timeSignature;
  const allowTuplets = quantization !== '1/8' && noteCount > 0;
  const warnings: string[] = [];
  if (profile === 'drums') warnings.push('Drum/percussion MIDI is imported as pitched notation until a dedicated drum-staff mapper exists.');
  if (noteCount > 4000) warnings.push('Large MIDI file; reconstruction and rendering may take longer.');
  if (tracks.filter((track) => track.noteCount > 0).length > 12) warnings.push('Many active tracks; ensemble layout may need manual part cleanup.');

  return {
    format: 'midi',
    durationSeconds: round(midi.duration),
    ppq: midi.header.ppq,
    tempoBpm: midi.header.tempos[0]?.bpm ? Math.round(midi.header.tempos[0].bpm) : null,
    timeSignature: Array.isArray(timeSignature) ? { beats: timeSignature[0] ?? 4, beatType: timeSignature[1] ?? 4 } : null,
    trackCount: midi.tracks.length,
    noteCount,
    profile,
    quantization,
    allowTuplets,
    preservePerformanceTiming: false,
    tracks,
    summary: `${noteCount} notes across ${tracks.filter((track) => track.noteCount > 0).length} active track(s); profile ${profile}; quantization ${quantization}.`,
    plan: [
      'Read MIDI tracks, tempo, meter, and density',
      `Use ${quantization} notation quantization target`,
      `Treat import as ${profile}`,
      'Reconstruct readable notation and layout hints',
    ],
    warnings,
  };
}
