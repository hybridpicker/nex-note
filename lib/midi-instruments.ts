import type { PartNode } from '@/src/score-core/model/types';

export type SoundfontInstrumentName = import('soundfont-player').InstrumentName;

export interface MidiInstrumentSound {
  id: string;
  displayName: string;
  /** General MIDI / MusicXML program number (1-128). */
  midiProgram: number;
  soundfont: SoundfontInstrumentName;
  percussion: boolean;
  /** MusicXML MIDI channel (1-16). Channel 10 is reserved for percussion. */
  midiChannel?: number;
}

type MidiInstrumentDefinition = MidiInstrumentSound & {
  namePatterns: readonly RegExp[];
};

/**
 * Single source of truth for score instrument IDs, MusicXML program numbers,
 * and soundfont-player presets. General MIDI programs are one-based here;
 * @tonejs/midi exposes the same program values as zero-based numbers.
 */
export const MIDI_INSTRUMENTS = {
  piano: { id: 'piano', displayName: 'Piano', midiProgram: 1, soundfont: 'acoustic_grand_piano', percussion: false, namePatterns: [/\bpiano\b/i] },
  organ: { id: 'organ', displayName: 'Organ', midiProgram: 20, soundfont: 'church_organ', percussion: false, namePatterns: [/\borgan\b/i] },
  harp: { id: 'harp', displayName: 'Harp', midiProgram: 47, soundfont: 'orchestral_harp', percussion: false, namePatterns: [/\bharp\b/i] },
  violin: { id: 'violin', displayName: 'Violin', midiProgram: 41, soundfont: 'violin', percussion: false, namePatterns: [/\bviolin\b/i] },
  viola: { id: 'viola', displayName: 'Viola', midiProgram: 42, soundfont: 'viola', percussion: false, namePatterns: [/\bviola\b/i] },
  cello: { id: 'cello', displayName: 'Cello', midiProgram: 43, soundfont: 'cello', percussion: false, namePatterns: [/\b(cello|violoncello)\b/i] },
  'double-bass': { id: 'double-bass', displayName: 'Double Bass', midiProgram: 44, soundfont: 'contrabass', percussion: false, namePatterns: [/\b(double bass|contrabass|string bass)\b/i] },
  flute: { id: 'flute', displayName: 'Flute', midiProgram: 74, soundfont: 'flute', percussion: false, namePatterns: [/\bflute\b/i] },
  oboe: { id: 'oboe', displayName: 'Oboe', midiProgram: 69, soundfont: 'oboe', percussion: false, namePatterns: [/\boboe\b/i] },
  'clarinet-bb': { id: 'clarinet-bb', displayName: 'Clarinet', midiProgram: 72, soundfont: 'clarinet', percussion: false, namePatterns: [/\bclarinet\b/i] },
  bassoon: { id: 'bassoon', displayName: 'Bassoon', midiProgram: 71, soundfont: 'bassoon', percussion: false, namePatterns: [/\bbassoon\b/i] },
  'sax-alto-eb': { id: 'sax-alto-eb', displayName: 'Alto Saxophone', midiProgram: 66, soundfont: 'alto_sax', percussion: false, namePatterns: [/\b(alto sax|alto saxophone|saxophone)\b/i] },
  'trumpet-bb': { id: 'trumpet-bb', displayName: 'Trumpet', midiProgram: 57, soundfont: 'trumpet', percussion: false, namePatterns: [/\btrumpet\b/i] },
  'horn-f': { id: 'horn-f', displayName: 'French Horn', midiProgram: 61, soundfont: 'french_horn', percussion: false, namePatterns: [/\b(horn|french horn)\b/i] },
  trombone: { id: 'trombone', displayName: 'Trombone', midiProgram: 58, soundfont: 'trombone', percussion: false, namePatterns: [/\btrombone\b/i] },
  tuba: { id: 'tuba', displayName: 'Tuba', midiProgram: 59, soundfont: 'tuba', percussion: false, namePatterns: [/\btuba\b/i] },
  soprano: { id: 'soprano', displayName: 'Voice', midiProgram: 53, soundfont: 'choir_aahs', percussion: false, namePatterns: [/\bsoprano\b/i] },
  alto: { id: 'alto', displayName: 'Voice', midiProgram: 53, soundfont: 'choir_aahs', percussion: false, namePatterns: [/\balto\b/i] },
  tenor: { id: 'tenor', displayName: 'Voice', midiProgram: 53, soundfont: 'choir_aahs', percussion: false, namePatterns: [/\btenor\b/i] },
  bass: { id: 'bass', displayName: 'Voice', midiProgram: 53, soundfont: 'choir_aahs', percussion: false, namePatterns: [/\b(bass|voice|vocal|choir)\b/i] },
  guitar: { id: 'guitar', displayName: 'Guitar', midiProgram: 25, soundfont: 'acoustic_guitar_nylon', percussion: false, namePatterns: [/\bguitar\b/i] },
  'guitar-tab': { id: 'guitar-tab', displayName: 'Guitar', midiProgram: 25, soundfont: 'acoustic_guitar_nylon', percussion: false, namePatterns: [/\bguitar\b.*\b(tab|tablature)\b/i] },
  'acoustic-guitar': { id: 'acoustic-guitar', displayName: 'Acoustic Guitar', midiProgram: 26, soundfont: 'acoustic_guitar_steel', percussion: false, namePatterns: [/\bacoustic guitar\b/i] },
  'acoustic-guitar-tab': { id: 'acoustic-guitar-tab', displayName: 'Acoustic Guitar', midiProgram: 26, soundfont: 'acoustic_guitar_steel', percussion: false, namePatterns: [/\bacoustic guitar\b.*\b(tab|tablature)\b/i] },
  'classical-guitar': { id: 'classical-guitar', displayName: 'Classical Guitar', midiProgram: 25, soundfont: 'acoustic_guitar_nylon', percussion: false, namePatterns: [/\b(classical guitar|nylon guitar)\b/i] },
  'classical-guitar-tab': { id: 'classical-guitar-tab', displayName: 'Classical Guitar', midiProgram: 25, soundfont: 'acoustic_guitar_nylon', percussion: false, namePatterns: [/\bclassical guitar\b.*\b(tab|tablature)\b/i] },
  'electric-guitar': { id: 'electric-guitar', displayName: 'Electric Guitar', midiProgram: 28, soundfont: 'electric_guitar_clean', percussion: false, namePatterns: [/\belectric guitar\b/i] },
  'electric-guitar-tab': { id: 'electric-guitar-tab', displayName: 'Electric Guitar', midiProgram: 28, soundfont: 'electric_guitar_clean', percussion: false, namePatterns: [/\belectric guitar\b.*\b(tab|tablature)\b/i] },
  'electric-bass': { id: 'electric-bass', displayName: 'Electric Bass', midiProgram: 34, soundfont: 'electric_bass_finger', percussion: false, namePatterns: [/\b(electric bass|bass guitar)\b/i] },
  'electric-bass-tab': { id: 'electric-bass-tab', displayName: 'Electric Bass', midiProgram: 34, soundfont: 'electric_bass_finger', percussion: false, namePatterns: [/\belectric bass\b.*\b(tab|tablature)\b/i] },
  'five-string-electric-bass': { id: 'five-string-electric-bass', displayName: '5-String Electric Bass', midiProgram: 34, soundfont: 'electric_bass_finger', percussion: false, namePatterns: [/\b(5|string five|five.string).*electric bass\b/i] },
  'five-string-electric-bass-tab': { id: 'five-string-electric-bass-tab', displayName: '5-String Electric Bass', midiProgram: 34, soundfont: 'electric_bass_finger', percussion: false, namePatterns: [/\b(5|string five|five.string).*electric bass\b.*\b(tab|tablature)\b/i] },
  ukulele: { id: 'ukulele', displayName: 'Ukulele', midiProgram: 25, soundfont: 'acoustic_guitar_nylon', percussion: false, namePatterns: [/\bukulele\b/i] },
  'ukulele-tab': { id: 'ukulele-tab', displayName: 'Ukulele', midiProgram: 25, soundfont: 'acoustic_guitar_nylon', percussion: false, namePatterns: [/\bukulele\b.*\b(tab|tablature)\b/i] },
  mandolin: { id: 'mandolin', displayName: 'Mandolin', midiProgram: 26, soundfont: 'acoustic_guitar_steel', percussion: false, namePatterns: [/\bmandolin\b/i] },
  // soundfont-player has no loadable GM drum-kit preset; synth_drum is its closest available general percussion sound.
  'drum-set': { id: 'drum-set', displayName: 'Drum Set', midiProgram: 119, soundfont: 'synth_drum', percussion: true, midiChannel: 10, namePatterns: [/\b(drum set|drum kit|drums|percussion)\b/i] },
} as const satisfies Record<string, MidiInstrumentDefinition>;

export type MidiInstrumentId = keyof typeof MIDI_INSTRUMENTS;

export const UNKNOWN_INSTRUMENT_FALLBACK_ID: MidiInstrumentId = 'piano';

const NAME_MATCH_ORDER: readonly MidiInstrumentId[] = [
  'drum-set',
  'five-string-electric-bass-tab',
  'five-string-electric-bass',
  'electric-bass-tab',
  'electric-bass',
  'electric-guitar-tab',
  'electric-guitar',
  'classical-guitar-tab',
  'classical-guitar',
  'acoustic-guitar-tab',
  'acoustic-guitar',
  'guitar-tab',
  'ukulele-tab',
  'ukulele',
  'mandolin',
  'double-bass',
  'sax-alto-eb',
  'clarinet-bb',
  'trumpet-bb',
  'horn-f',
  'piano',
  'organ',
  'harp',
  'violin',
  'viola',
  'cello',
  'flute',
  'oboe',
  'bassoon',
  'trombone',
  'tuba',
  'soprano',
  'alto',
  'tenor',
  'bass',
  'guitar',
];

export function isMidiInstrumentId(value: string): value is MidiInstrumentId {
  return Object.hasOwn(MIDI_INSTRUMENTS, value);
}

export function resolveInstrumentIdFromName(name: string | null | undefined): MidiInstrumentId | null {
  const normalized = (name ?? '').replace(/\s+\d+$/, '').trim();
  if (!normalized) return null;
  if (isMidiInstrumentId(normalized)) return normalized;
  return NAME_MATCH_ORDER.find((id) => MIDI_INSTRUMENTS[id].namePatterns.some((pattern) => pattern.test(normalized))) ?? null;
}

export function resolvePartInstrumentId(part: Pick<PartNode, 'instrumentName' | 'name'> | null | undefined): MidiInstrumentId | null {
  return resolveInstrumentIdFromName(part?.instrumentName) ?? resolveInstrumentIdFromName(part?.name);
}

export function resolveMidiInstrumentSound(id: string | null | undefined): MidiInstrumentSound & { usedFallback: boolean } {
  const resolvedId = id && isMidiInstrumentId(id) ? id : UNKNOWN_INSTRUMENT_FALLBACK_ID;
  const { namePatterns: _namePatterns, ...sound } = MIDI_INSTRUMENTS[resolvedId];
  return { ...sound, usedFallback: resolvedId !== id };
}

export function musicXmlProgramToToneProgram(midiProgram: number): number {
  if (!Number.isFinite(midiProgram)) return 0;
  return Math.max(0, Math.min(127, Math.round(midiProgram) - 1));
}

export function toneProgramToMusicXmlProgram(programNumber: number): number {
  if (!Number.isFinite(programNumber)) return 1;
  return Math.max(1, Math.min(128, Math.round(programNumber) + 1));
}

export function resolveMidiSoundFromToneProgram(
  programNumber: number,
  options: { percussion?: boolean; fallbackInstrumentId?: string | null } = {},
): MidiInstrumentSound & { usedFallback: boolean } {
  if (options.percussion) return resolveMidiInstrumentSound('drum-set');
  if (options.fallbackInstrumentId && isMidiInstrumentId(options.fallbackInstrumentId)) {
    return resolveMidiInstrumentSound(options.fallbackInstrumentId);
  }
  const midiProgram = toneProgramToMusicXmlProgram(programNumber);
  const match = Object.values(MIDI_INSTRUMENTS).find((instrument) => (
    !instrument.percussion && instrument.midiProgram === midiProgram
  ));
  return resolveMidiInstrumentSound(match?.id);
}
