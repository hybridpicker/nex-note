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
 * A whole word or phrase, also next to non-ASCII letters ("Flöte", "Trompete"): `\b` only knows
 * ASCII letters. A digit may follow ("Violin1").
 */
function words(...alternatives: string[]) {
  return new RegExp(`(?<![\\p{L}\\p{N}])(?:${alternatives.join('|')})(?!\\p{L})`, 'iu');
}

/**
 * Single source of truth for score instrument IDs, MusicXML program numbers,
 * and soundfont-player presets. General MIDI programs are one-based here;
 * @tonejs/midi exposes the same program values as zero-based numbers.
 *
 * Only the FluidR3_GM sets that scripts/fetch-soundfonts.mjs downloads may be named as
 * `soundfont` (it reads them from this file). An instrument without its own set plays the
 * nearest shipped timbre of its family and keeps its own General MIDI program, so MuseScore and
 * the fallback MIDI still carry the right program.
 */
export const MIDI_INSTRUMENTS = {
  piano: { id: 'piano', displayName: 'Piano', midiProgram: 1, soundfont: 'acoustic_grand_piano', percussion: false, namePatterns: [/\bpiano\b/i, words('pianoforte', 'pianos', 'grand piano', 'klavier(?:e)?', 'fl(?:ü|ue)gel')] },
  'electric-piano': { id: 'electric-piano', displayName: 'Electric Piano', midiProgram: 5, soundfont: 'acoustic_grand_piano', percussion: false, namePatterns: [words('electric piano', 'e-?piano', 'rhodes', 'wurlitzer', 'piano électrique')] },
  harpsichord: { id: 'harpsichord', displayName: 'Harpsichord', midiProgram: 7, soundfont: 'acoustic_grand_piano', percussion: false, namePatterns: [words('harpsichords?', 'cembal[oi]', 'clavecin', 'clavicembal[oi]', 'clavinet', 'clavichord')] },
  organ: { id: 'organ', displayName: 'Organ', midiProgram: 20, soundfont: 'church_organ', percussion: false, namePatterns: [/\borgan\b/i, words('organs', 'orgeln?', 'orgue', 'organo', 'hammond', 'harmonium')] },
  accordion: { id: 'accordion', displayName: 'Accordion', midiProgram: 22, soundfont: 'church_organ', percussion: false, namePatterns: [words('accordions?', 'akkordeons?', 'accordéon', 'fisarmonica', 'bandone(?:o|ó)n', 'concertina', 'harmonicas?', '(?:zieh|mund)?harmonika', 'melodica')] },
  harp: { id: 'harp', displayName: 'Harp', midiProgram: 47, soundfont: 'orchestral_harp', percussion: false, namePatterns: [/\bharp\b/i, words('harps', 'harfen?', 'harpe', 'arpa')] },
  // Mallet instruments: struck, quickly decaying, nearly pure tones; the harp is the closest shipped set.
  celesta: { id: 'celesta', displayName: 'Celesta', midiProgram: 9, soundfont: 'orchestral_harp', percussion: false, namePatterns: [words('c(?:e|é)lestas?', 'celeste')] },
  glockenspiel: { id: 'glockenspiel', displayName: 'Glockenspiel', midiProgram: 10, soundfont: 'orchestral_harp', percussion: false, namePatterns: [words('glockenspiele?', 'orchestra bells', 'crotales', 'music box', 'spieluhr', 'campanelli', 'carillon')] },
  vibraphone: { id: 'vibraphone', displayName: 'Vibraphone', midiProgram: 12, soundfont: 'orchestral_harp', percussion: false, namePatterns: [words('vibraphon(?:e|es)?', 'vibrafono', 'vibes', 'tubular bells', 'chimes', 'r(?:ö|oe)hrenglocken')] },
  marimba: { id: 'marimba', displayName: 'Marimba', midiProgram: 13, soundfont: 'orchestral_harp', percussion: false, namePatterns: [words('marimbas?', 'marimbaphon(?:e)?', 'kalimba')] },
  xylophone: { id: 'xylophone', displayName: 'Xylophone', midiProgram: 14, soundfont: 'orchestral_harp', percussion: false, namePatterns: [words('xylophon(?:e|es)?', 'xilofono', 'xylo')] },
  // Timpani are pitched; the percussion kit would play their pitches as unrelated drum keys.
  timpani: { id: 'timpani', displayName: 'Timpani', midiProgram: 48, soundfont: 'acoustic_grand_piano', percussion: false, namePatterns: [words('timpani', 'timpano', 'kettle ?drums?', 'pauken?')] },
  violin: { id: 'violin', displayName: 'Violin', midiProgram: 41, soundfont: 'violin', percussion: false, namePatterns: [/\bviolin\b/i, words('violins', 'violin(?:e|en)', 'geigen?', 'violons?', 'violin[oi]', 'fiddles?')] },
  viola: { id: 'viola', displayName: 'Viola', midiProgram: 42, soundfont: 'viola', percussion: false, namePatterns: [/\bviola\b/i, words('violas', 'bratschen?', 'viole')] },
  cello: { id: 'cello', displayName: 'Cello', midiProgram: 43, soundfont: 'cello', percussion: false, namePatterns: [/\b(cello|violoncello)\b/i, words('cellos', 'celli', 'violoncell(?:os|i|e|es)')] },
  'double-bass': { id: 'double-bass', displayName: 'Double Bass', midiProgram: 44, soundfont: 'contrabass', percussion: false, namePatterns: [/\b(double bass|contrabass|string bass)\b/i, words('double ?bass(?:es)?', 'contrabass(?:es)?', 'kontrab(?:a|ä)ss(?:e)?', 'contrebasses?', 'contrabbass[oi]', 'string bass(?:es)?')] },
  // Orchestral string sections play the violin set, or the cello set when the part lies low.
  strings: { id: 'strings', displayName: 'Strings', midiProgram: 49, soundfont: 'violin', percussion: false, namePatterns: [words('strings?', 'string ensemble', 'string section', 'streicher', 'cordes', 'archi')] },
  flute: { id: 'flute', displayName: 'Flute', midiProgram: 74, soundfont: 'flute', percussion: false, namePatterns: [/\bflute\b/i, words('flutes', '(?:quer|alt)?fl(?:ö|oe)ten?', 'flûtes?', 'flaut[oi]', 'pan ?flutes?', 'fifes?')] },
  piccolo: { id: 'piccolo', displayName: 'Piccolo', midiProgram: 73, soundfont: 'flute', percussion: false, namePatterns: [words('piccolos?', 'pi(?:cc|kk)olo ?fl(?:ö|oe)te', 'pikkolo', 'kleine fl(?:ö|oe)te', 'ottavino', 'petite flûte')] },
  recorder: { id: 'recorder', displayName: 'Recorder', midiProgram: 75, soundfont: 'flute', percussion: false, namePatterns: [words('recorders?', '(?:sopran|alt|tenor|bass)?blockfl(?:ö|oe)ten?', 'flûte à bec', 'flauto dolce')] },
  oboe: { id: 'oboe', displayName: 'Oboe', midiProgram: 69, soundfont: 'oboe', percussion: false, namePatterns: [/\boboe\b/i, words('oboes', 'oboen', 'oboi', 'hautbois')] },
  'english-horn': { id: 'english-horn', displayName: 'English Horn', midiProgram: 70, soundfont: 'oboe', percussion: false, namePatterns: [words('english horns?', 'cors? anglais', 'englisch(?:es)? ?horn', 'corno inglese')] },
  'clarinet-bb': { id: 'clarinet-bb', displayName: 'Clarinet', midiProgram: 72, soundfont: 'clarinet', percussion: false, namePatterns: [/\bclarinet\b/i, words('clarinets', '(?:bass|alt)?klarinetten?', 'clarinettes?', 'clarinett[oi]')] },
  bassoon: { id: 'bassoon', displayName: 'Bassoon', midiProgram: 71, soundfont: 'bassoon', percussion: false, namePatterns: [/\bbassoon\b/i, words('bassoons', 'fagott(?:e|o|i)?', 'bassons?')] },
  contrabassoon: { id: 'contrabassoon', displayName: 'Contrabassoon', midiProgram: 71, soundfont: 'bassoon', percussion: false, namePatterns: [words('contrabassoons?', 'double bassoons?', 'kontrafagott(?:e)?', 'contrebasson', 'controfagott[oi]')] },
  'sax-soprano': { id: 'sax-soprano', displayName: 'Soprano Saxophone', midiProgram: 65, soundfont: 'alto_sax', percussion: false, namePatterns: [words('sopran(?:o|ino)? ?sax(?:ophone|ophon)?s?')] },
  'sax-alto-eb': { id: 'sax-alto-eb', displayName: 'Alto Saxophone', midiProgram: 66, soundfont: 'alto_sax', percussion: false, namePatterns: [/\b(alto sax|alto saxophone|saxophone)\b/i, words('alt(?:o)? ?sax(?:ophone|ophon)?s?', 'sax(?:ophone|ophon|ofono|es)?s?')] },
  'sax-tenor': { id: 'sax-tenor', displayName: 'Tenor Saxophone', midiProgram: 67, soundfont: 'alto_sax', percussion: false, namePatterns: [words('tenor ?sax(?:ophone|ophon)?s?')] },
  'sax-baritone': { id: 'sax-baritone', displayName: 'Baritone Saxophone', midiProgram: 68, soundfont: 'alto_sax', percussion: false, namePatterns: [words('bari(?:ton(?:e)?)? ?sax(?:ophone|ophon)?s?', 'bass ?sax(?:ophone|ophon)?s?')] },
  'trumpet-bb': { id: 'trumpet-bb', displayName: 'Trumpet', midiProgram: 57, soundfont: 'trumpet', percussion: false, namePatterns: [/\btrumpet\b/i, words('trumpets', 'trompeten?', 'trompettes?', 'tromb[ae]')] },
  cornet: { id: 'cornet', displayName: 'Cornet', midiProgram: 57, soundfont: 'trumpet', percussion: false, namePatterns: [words('cornets?', 'kornett(?:e)?', 'cornett[ao]', 'cornet à pistons')] },
  flugelhorn: { id: 'flugelhorn', displayName: 'Flugelhorn', midiProgram: 57, soundfont: 'trumpet', percussion: false, namePatterns: [words('fl(?:u|ü|ue)gelh(?:o|ö|oe)rn(?:s|er)?', 'flicorno(?! baritono)', 'bugles?')] },
  'horn-f': { id: 'horn-f', displayName: 'French Horn', midiProgram: 61, soundfont: 'french_horn', percussion: false, namePatterns: [/\b(horn|french horn)\b/i, words('horns', 'waldh(?:o|ö|oe)rn(?:er)?', 'h(?:ö|oe)rner', 'corn[oi]', 'cors?')] },
  trombone: { id: 'trombone', displayName: 'Trombone', midiProgram: 58, soundfont: 'trombone', percussion: false, namePatterns: [/\btrombone\b/i, words('trombones', 'tromboni', '(?:bass|tenor|alt)?posaunen?')] },
  euphonium: { id: 'euphonium', displayName: 'Euphonium', midiProgram: 59, soundfont: 'tuba', percussion: false, namePatterns: [words('euphoni(?:ums?|en)', '(?:tenor|alt|alto|bariton|baritone) ?h(?:o|ö|oe)rn(?:s|er)?', 'baryton', 'saxhorn', 'flicorno baritono')] },
  tuba: { id: 'tuba', displayName: 'Tuba', midiProgram: 59, soundfont: 'tuba', percussion: false, namePatterns: [/\btuba\b/i, words('tubas', 'tuben', 'basstuba', 'sousaphones?', 'heli(?:k|c)on')] },
  soprano: { id: 'soprano', displayName: 'Voice', midiProgram: 53, soundfont: 'choir_aahs', percussion: false, namePatterns: [/\bsoprano\b/i, words('sopranos', 'sopran(?:e|i)?', 'mezzo(?:-| )?sopran(?:o|os)?', 'mezzo', 'treble')] },
  alto: { id: 'alto', displayName: 'Voice', midiProgram: 53, soundfont: 'choir_aahs', percussion: false, namePatterns: [/\balto\b/i, words('altos', 'alt', 'alti', 'contraltos?', 'altus')] },
  tenor: { id: 'tenor', displayName: 'Voice', midiProgram: 53, soundfont: 'choir_aahs', percussion: false, namePatterns: [/\btenor\b/i, words('tenors', 'ten(?:ö|oe)re', 'tenor[ei]', 'ténor')] },
  // A bare "Bass" or "Baritone" is decided by context (see resolveAmbiguousLowPart), not by a pattern here.
  bass: { id: 'bass', displayName: 'Voice', midiProgram: 53, soundfont: 'choir_aahs', percussion: false, namePatterns: [words('voices?', 'vocals?', 'choirs?', 'chorus', 'chor', 'singers?', 'singstimme', 'stimmen?', 'gesang', 'voix', 'voce', 'coro', 'bass voice', 'basso profondo')] },
  guitar: { id: 'guitar', displayName: 'Guitar', midiProgram: 25, soundfont: 'acoustic_guitar_nylon', percussion: false, namePatterns: [/\bguitar\b/i, words('guitars', 'gitarren?', 'guitares?', 'chitarr[ae]')] },
  'guitar-tab': { id: 'guitar-tab', displayName: 'Guitar', midiProgram: 25, soundfont: 'acoustic_guitar_nylon', percussion: false, namePatterns: [/\bguitar\b.*\b(tab|tablature)\b/i] },
  'acoustic-guitar': { id: 'acoustic-guitar', displayName: 'Acoustic Guitar', midiProgram: 26, soundfont: 'acoustic_guitar_steel', percussion: false, namePatterns: [/\bacoustic guitar\b/i, words('western ?gitarre', 'akustik ?gitarre', 'akustische gitarre', 'steel(?:-| )string guitar', 'folk guitar', '12-string guitar', 'guitare acoustique', 'chitarra acustica')] },
  'acoustic-guitar-tab': { id: 'acoustic-guitar-tab', displayName: 'Acoustic Guitar', midiProgram: 26, soundfont: 'acoustic_guitar_steel', percussion: false, namePatterns: [/\bacoustic guitar\b.*\b(tab|tablature)\b/i] },
  'classical-guitar': { id: 'classical-guitar', displayName: 'Classical Guitar', midiProgram: 25, soundfont: 'acoustic_guitar_nylon', percussion: false, namePatterns: [/\b(classical guitar|nylon guitar)\b/i, words('konzert ?gitarre', 'klassische gitarre', 'spanish guitar', 'guitare classique', 'chitarra classica')] },
  'classical-guitar-tab': { id: 'classical-guitar-tab', displayName: 'Classical Guitar', midiProgram: 25, soundfont: 'acoustic_guitar_nylon', percussion: false, namePatterns: [/\bclassical guitar\b.*\b(tab|tablature)\b/i] },
  'electric-guitar': { id: 'electric-guitar', displayName: 'Electric Guitar', midiProgram: 28, soundfont: 'electric_guitar_clean', percussion: false, namePatterns: [/\belectric guitar\b/i, words('e-?gitarre', 'elektrische gitarre', 'jazz guitar', 'lead guitar', 'rhythm guitar', 'guitare électrique', 'chitarra elettrica')] },
  'electric-guitar-tab': { id: 'electric-guitar-tab', displayName: 'Electric Guitar', midiProgram: 28, soundfont: 'electric_guitar_clean', percussion: false, namePatterns: [/\belectric guitar\b.*\b(tab|tablature)\b/i] },
  // No distorted set is shipped; the clean electric guitar is the nearest one.
  'distortion-guitar': { id: 'distortion-guitar', displayName: 'Distortion Guitar', midiProgram: 31, soundfont: 'electric_guitar_clean', percussion: false, namePatterns: [words('distortion guitar', 'distorted guitar', 'overdrive(?:n)? guitar', 'rock guitar')] },
  'electric-bass': { id: 'electric-bass', displayName: 'Electric Bass', midiProgram: 34, soundfont: 'electric_bass_finger', percussion: false, namePatterns: [/\b(electric bass|bass guitar)\b/i, words('electric bass(?:es)?', 'bass guitars?', 'e-?bass', 'bass ?gitarre', 'basse électrique', 'basso elettrico')] },
  'electric-bass-tab': { id: 'electric-bass-tab', displayName: 'Electric Bass', midiProgram: 34, soundfont: 'electric_bass_finger', percussion: false, namePatterns: [/\belectric bass\b.*\b(tab|tablature)\b/i] },
  // The plucked acoustic and fretless basses play the shipped plucked (finger) bass set.
  'acoustic-bass': { id: 'acoustic-bass', displayName: 'Acoustic Bass', midiProgram: 33, soundfont: 'electric_bass_finger', percussion: false, namePatterns: [words('acoustic bass(?:es)?', 'upright bass(?:es)?', 'jazz bass', 'akustik ?bass', 'akustischer bass')] },
  'fretless-bass': { id: 'fretless-bass', displayName: 'Fretless Bass', midiProgram: 36, soundfont: 'electric_bass_finger', percussion: false, namePatterns: [words('fretless(?: bass)?', 'bundloser bass')] },
  'five-string-electric-bass': { id: 'five-string-electric-bass', displayName: '5-String Electric Bass', midiProgram: 34, soundfont: 'electric_bass_finger', percussion: false, namePatterns: [/\b(5|string five|five.string).*electric bass\b/i] },
  'five-string-electric-bass-tab': { id: 'five-string-electric-bass-tab', displayName: '5-String Electric Bass', midiProgram: 34, soundfont: 'electric_bass_finger', percussion: false, namePatterns: [/\b(5|string five|five.string).*electric bass\b.*\b(tab|tablature)\b/i] },
  ukulele: { id: 'ukulele', displayName: 'Ukulele', midiProgram: 25, soundfont: 'acoustic_guitar_nylon', percussion: false, namePatterns: [/\bukulele\b/i, words('ukuleles', 'ukelele')] },
  'ukulele-tab': { id: 'ukulele-tab', displayName: 'Ukulele', midiProgram: 25, soundfont: 'acoustic_guitar_nylon', percussion: false, namePatterns: [/\bukulele\b.*\b(tab|tablature)\b/i] },
  mandolin: { id: 'mandolin', displayName: 'Mandolin', midiProgram: 26, soundfont: 'acoustic_guitar_steel', percussion: false, namePatterns: [/\bmandolin\b/i, words('mandolin(?:e|es|a|s)')] },
  banjo: { id: 'banjo', displayName: 'Banjo', midiProgram: 106, soundfont: 'acoustic_guitar_steel', percussion: false, namePatterns: [words('banjos?')] },
  // soundfont-player has no loadable GM drum-kit preset; synth_drum is its closest available general percussion sound.
  'drum-set': { id: 'drum-set', displayName: 'Drum Set', midiProgram: 119, soundfont: 'synth_drum', percussion: true, midiChannel: 10, namePatterns: [/\b(drum set|drum kit|drums|percussion)\b/i, words(
    'drum ?sets?', 'drum ?kits?', 'drums?', 'drum machine', 'standard kit', 'percussions?', 'snare(?: drums?)?', 'side drum', 'kick(?: drum)?', 'bass ?drums?',
    'hi-?hats?', 'cymbals?', 'crash(?: cymbal)?', 'ride(?: cymbal)?', 'toms?', 'tom-toms?', 'caj(?:o|ó)n', 'congas?', 'bongos?', 'tambourines?', 'triangles?',
    'cowbells?', 'wood ?blocks?', 'temple ?blocks?', 'shakers?', 'maracas', 'claves', 'g(?:u|ü)iro', 'castanets?', 'sleigh bells', 'gong', 'tam-?tam',
    'schlagzeug', 'schlagwerk', 'kleine trommel', 'gro(?:ß|ss)e trommel', 'trommeln?', 'becken', 'batterie', 'caisse claire', 'grosse caisse', 'cymbales?',
    'batteria', 'tamburo', 'rullante', 'grancassa', 'piatti',
  )] },
} as const satisfies Record<string, MidiInstrumentDefinition>;

export type MidiInstrumentId = keyof typeof MIDI_INSTRUMENTS;

export const UNKNOWN_INSTRUMENT_FALLBACK_ID: MidiInstrumentId = 'piano';

const NAME_MATCH_ORDER: readonly MidiInstrumentId[] = [
  // Pitched drums before the kit ("Kettle drums"); the kit before everything with "bass" in it ("Bass Drum").
  'timpani',
  'drum-set',
  'five-string-electric-bass-tab',
  'five-string-electric-bass',
  'electric-bass-tab',
  'fretless-bass',
  'acoustic-bass',
  'electric-bass',
  'distortion-guitar',
  'electric-guitar-tab',
  'electric-guitar',
  'classical-guitar-tab',
  'classical-guitar',
  'acoustic-guitar-tab',
  'acoustic-guitar',
  'guitar-tab',
  'ukulele-tab',
  'ukulele',
  'banjo',
  'mandolin',
  // Compound wind names before their parts: "English Horn" is no horn, "Contrabassoon" no double bass,
  // "Tenor Sax" no tenor, "Piccolo Trumpet" no piccolo, "Tenor Horn" no French horn.
  'english-horn',
  'contrabassoon',
  'sax-soprano',
  'sax-tenor',
  'sax-baritone',
  'sax-alto-eb',
  'clarinet-bb',
  'trumpet-bb',
  'cornet',
  'flugelhorn',
  'piccolo',
  'recorder',
  'flute',
  'oboe',
  'bassoon',
  'euphonium',
  'horn-f',
  'trombone',
  'tuba',
  'double-bass',
  'electric-piano',
  'harpsichord',
  'piano',
  'organ',
  'accordion',
  'celesta',
  'glockenspiel',
  'vibraphone',
  'marimba',
  'xylophone',
  'harp',
  'violin',
  'viola',
  'cello',
  'strings',
  'soprano',
  'alto',
  'tenor',
  'bass',
  'guitar',
];

export function isMidiInstrumentId(value: string): value is MidiInstrumentId {
  return Object.hasOwn(MIDI_INSTRUMENTS, value);
}

/** What else is known about a part when its name alone is ambiguous. */
export interface InstrumentNameContext {
  /** The part has lyrics. */
  hasLyrics?: boolean;
  /**
   * Names of the other parts of the score. `undefined` means they are unknown, which leaves a
   * bare "Bass" undecided unless lyrics or an octave transposition decide it.
   */
  siblingNames?: readonly (string | null | undefined)[];
  /** MusicXML `<octave-change>` of the part: a bass that sounds an octave lower is an instrument. */
  octaveChange?: number | null;
  /** Mean sounding MIDI pitch of the part's notes, for register-dependent families (strings). */
  meanPitch?: number | null;
}

const ROMAN_OR_NUMBER_SUFFIX = /(?:\s+(?:\d+(?:\s*[/&+,.]\s*\d+)*|[IVX]+(?:\s*[/&+,.]\s*[IVX]+)*)\.?)+$/u;
const AMBIGUOUS_LOW_PART = /^(?:bass|basses|b(?:ä|ae)sse|bass[oi]|baritones?|bariton[oi]?)$/iu;
const LOWEST_VIOLIN_PITCH = 55; // G3

function normalizeInstrumentName(name: string | null | undefined) {
  return (name ?? '')
    .normalize('NFC')
    .replace(/[_\s]+/g, ' ')
    .trim()
    .replace(ROMAN_OR_NUMBER_SUFFIX, '')
    .trim();
}

function matchInstrumentIdByName(normalized: string): MidiInstrumentId | null {
  if (!normalized) return null;
  if (isMidiInstrumentId(normalized)) return normalized;
  return NAME_MATCH_ORDER.find((id) => MIDI_INSTRUMENTS[id].namePatterns.some((pattern) => pattern.test(normalized))) ?? null;
}

function isVoiceContext(context: InstrumentNameContext) {
  if (context.hasLyrics) return true;
  return (context.siblingNames ?? []).some((sibling) => {
    const id = matchInstrumentIdByName(normalizeInstrumentName(sibling));
    return id === 'soprano' || id === 'alto' || id === 'tenor';
  });
}

/**
 * "Bass" and "Baritone" name a voice in a choir and an instrument elsewhere. They are a voice only
 * when the part has lyrics or the score has soprano, alto or tenor parts.
 */
function resolveAmbiguousLowPart(normalized: string, context: InstrumentNameContext | undefined): MidiInstrumentId | null {
  if (!context) return null;
  const baritone = /^bari/i.test(normalized);
  if (isVoiceContext(context)) return 'bass';
  const knownInstrument = (context.octaveChange ?? 0) < 0 || context.siblingNames !== undefined;
  if (!knownInstrument) return null;
  if (baritone) return 'euphonium';
  const orchestral = (context.siblingNames ?? []).some((sibling) => {
    const id = matchInstrumentIdByName(normalizeInstrumentName(sibling));
    return id === 'violin' || id === 'viola' || id === 'cello' || id === 'strings';
  });
  return orchestral ? 'double-bass' : 'electric-bass';
}

function applyRegister(id: MidiInstrumentId | null, context: InstrumentNameContext | undefined): MidiInstrumentId | null {
  if (id === 'strings' && context?.meanPitch != null && context.meanPitch < LOWEST_VIOLIN_PITCH) return 'cello';
  return id;
}

/**
 * The score instrument a part name stands for. Plurals ("Violins"), desk numbers ("Violin II",
 * "Horn 1"), and common German, French and Italian names are understood. A bare "Bass" or
 * "Baritone" needs `context`; without it the result is null so the caller can use a MIDI program.
 */
export function resolveInstrumentIdFromName(name: string | null | undefined, context?: InstrumentNameContext): MidiInstrumentId | null {
  const normalized = normalizeInstrumentName(name);
  if (!normalized) return null;
  if (isMidiInstrumentId(normalized)) return normalized;
  if (AMBIGUOUS_LOW_PART.test(normalized)) return resolveAmbiguousLowPart(normalized, context);
  return applyRegister(matchInstrumentIdByName(normalized), context);
}

type ResolvablePart = Pick<PartNode, 'instrumentName' | 'name'> & Partial<Pick<PartNode, 'staves' | 'transposeOctaveChange' | 'chromaticTranspose'>>;

const NOTE_STEP_SEMITONES: Record<string, number> = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 };

/** Lyrics and mean sounding pitch of a part, from the score model. */
export function instrumentContextFromPart(part: ResolvablePart): InstrumentNameContext {
  let hasLyrics = false;
  let pitchSum = 0;
  let pitchCount = 0;
  const offset = (part.chromaticTranspose ?? 0) + 12 * (part.transposeOctaveChange ?? 0);
  for (const staff of part.staves ?? []) {
    for (const measure of staff.measures ?? []) {
      for (const voice of measure.voices ?? []) {
        for (const event of voice.events ?? []) {
          if (event.lyrics?.some((lyric) => lyric.text)) hasLyrics = true;
          if (event.kind !== 'note' || !event.pitch) continue;
          const step = NOTE_STEP_SEMITONES[event.pitch.step?.toUpperCase?.() ?? 'C'] ?? 0;
          pitchSum += (event.pitch.octave + 1) * 12 + step + (event.pitch.alter ?? 0) + offset;
          pitchCount++;
        }
      }
    }
  }
  return {
    hasLyrics,
    octaveChange: part.transposeOctaveChange ?? null,
    meanPitch: pitchCount > 0 ? pitchSum / pitchCount : null,
  };
}

/**
 * The instrument of a score part from its names. Pass the score's other parts as `siblings` so a
 * bare "Bass" can be told apart (choir voice or bass instrument); without them such a part
 * resolves to null unless it has lyrics or sounds an octave lower than written.
 */
export function resolvePartInstrumentId(
  part: ResolvablePart | null | undefined,
  options: { siblings?: readonly Pick<PartNode, 'instrumentName' | 'name'>[] } = {},
): MidiInstrumentId | null {
  if (!part) return null;
  const context: InstrumentNameContext = {
    ...instrumentContextFromPart(part),
    ...(options.siblings
      ? { siblingNames: options.siblings.filter((sibling) => sibling !== part).flatMap((sibling) => [sibling.instrumentName, sibling.name]) }
      : {}),
  };
  return resolveInstrumentIdFromName(part.instrumentName, context) ?? resolveInstrumentIdFromName(part.name, context);
}

/** MusicXML `<instrument-sound>` ids (MusicXML 4 sounds.xml), most specific first. */
const INSTRUMENT_SOUND_RULES: ReadonlyArray<readonly [RegExp, MidiInstrumentId]> = [
  [/timpani/, 'timpani'],
  [/english-horn|cor-anglais/, 'english-horn'],
  [/contrabassoon/, 'contrabassoon'],
  [/bassoon/, 'bassoon'],
  [/piccolo/, 'piccolo'],
  [/recorder/, 'recorder'],
  [/oboe|bagpipe|shenai|shawm/, 'oboe'],
  [/clarinet/, 'clarinet-bb'],
  [/saxophone\.(?:soprano|sopranino)/, 'sax-soprano'],
  [/saxophone\.tenor/, 'sax-tenor'],
  [/saxophone\.(?:baritone|bass|contrabass)/, 'sax-baritone'],
  [/saxophone/, 'sax-alto-eb'],
  [/flute|fife|ocarina|whistle|pan-?pipes|shakuhachi/, 'flute'],
  [/cornet/, 'cornet'],
  [/flugelhorn/, 'flugelhorn'],
  [/trumpet/, 'trumpet-bb'],
  [/euphonium|baritone-horn|brass\.baritone|tenor-horn|alto-horn/, 'euphonium'],
  [/french-horn|brass\.horn|mellophone|wagner-tuba/, 'horn-f'],
  [/trombone/, 'trombone'],
  [/tuba|sousaphone|helicon/, 'tuba'],
  [/^voice\.(?:soprano|mezzo|treble|boy)/, 'soprano'],
  [/^voice\.(?:alto|contralto|countertenor)/, 'alto'],
  [/^voice\.tenor/, 'tenor'],
  [/^voice/, 'bass'],
  [/celesta/, 'celesta'],
  [/glockenspiel|crotales|music-box|bells\.orchestra/, 'glockenspiel'],
  [/xylophone/, 'xylophone'],
  [/marimba|kalimba/, 'marimba'],
  [/vibraphone|tubular|chimes/, 'vibraphone'],
  [/harpsichord|clavichord|clavinet|virginal|spinet/, 'harpsichord'],
  [/accordion|bandoneon|concertina|harmonica|melodica/, 'accordion'],
  [/organ|harmonium/, 'organ'],
  [/piano\.electric|electric-piano|rhodes|wurlitzer/, 'electric-piano'],
  [/piano|^keyboard/, 'piano'],
  [/bass\.acoustic|upright/, 'acoustic-bass'],
  [/fretless/, 'fretless-bass'],
  [/^pluck\.bass|bass\.electric|bass-guitar/, 'electric-bass'],
  [/banjo/, 'banjo'],
  [/mandolin/, 'mandolin'],
  [/ukulele/, 'ukulele'],
  [/guitar\.(?:nylon|classical)/, 'classical-guitar'],
  [/guitar\.electric.*(?:distortion|overdrive)|distortion/, 'distortion-guitar'],
  [/guitar\.(?:electric|jazz)/, 'electric-guitar'],
  [/guitar\.(?:steel|acoustic|12-string)/, 'acoustic-guitar'],
  [/guitar/, 'guitar'],
  [/lute|oud|sitar|bouzouki|balalaika/, 'acoustic-guitar'],
  [/harp|koto|zither|dulcimer/, 'harp'],
  [/strings\.(?:violin|fiddle)/, 'violin'],
  [/strings\.viola(?!-da)/, 'viola'],
  [/strings\.(?:cello|violoncello|viola-da-gamba)/, 'cello'],
  [/strings\.(?:contrabass|double-bass|bass)/, 'double-bass'],
  [/^strings/, 'strings'],
  [/^(?:drum|metal|wood|rattle|effect)\./, 'drum-set'],
];

export function resolveInstrumentIdFromSound(sound: string | null | undefined): MidiInstrumentId | null {
  const normalized = (sound ?? '').trim().toLowerCase();
  if (!normalized) return null;
  return INSTRUMENT_SOUND_RULES.find(([pattern]) => pattern.test(normalized))?.[1] ?? null;
}

/** General MIDI programs (one-based) of each family to the nearest instrument with a shipped set. */
const GENERAL_MIDI_PROGRAM_RANGES: ReadonlyArray<readonly [number, number, MidiInstrumentId | null]> = [
  [1, 4, 'piano'], [5, 6, 'electric-piano'], [7, 8, 'harpsichord'],
  [9, 9, 'celesta'], [10, 11, 'glockenspiel'], [12, 12, 'vibraphone'], [13, 13, 'marimba'], [14, 14, 'xylophone'], [15, 15, 'vibraphone'], [16, 16, 'harp'],
  [17, 21, 'organ'], [22, 24, 'accordion'],
  [25, 25, 'guitar'], [26, 26, 'acoustic-guitar'], [27, 29, 'electric-guitar'], [30, 31, 'distortion-guitar'], [32, 32, 'electric-guitar'],
  [33, 33, 'acoustic-bass'], [34, 35, 'electric-bass'], [36, 36, 'fretless-bass'], [37, 40, 'electric-bass'],
  [41, 41, 'violin'], [42, 42, 'viola'], [43, 43, 'cello'], [44, 44, 'double-bass'], [45, 46, 'strings'], [47, 47, 'harp'], [48, 48, 'timpani'],
  [49, 52, 'strings'], [53, 55, 'soprano'], [56, 56, null],
  [57, 57, 'trumpet-bb'], [58, 58, 'trombone'], [59, 59, 'tuba'], [60, 60, 'trumpet-bb'], [61, 61, 'horn-f'], [62, 64, 'trumpet-bb'],
  [65, 65, 'sax-soprano'], [66, 66, 'sax-alto-eb'], [67, 67, 'sax-tenor'], [68, 68, 'sax-baritone'],
  [69, 69, 'oboe'], [70, 70, 'english-horn'], [71, 71, 'bassoon'], [72, 72, 'clarinet-bb'],
  [73, 73, 'piccolo'], [74, 74, 'flute'], [75, 75, 'recorder'], [76, 80, 'flute'],
  [81, 104, null],
  [105, 105, 'acoustic-guitar'], [106, 107, 'banjo'], [108, 108, 'harp'], [109, 109, 'marimba'], [110, 110, 'oboe'], [111, 111, 'violin'], [112, 112, 'oboe'],
  [113, 128, null],
];

export function resolveInstrumentIdFromMidiProgram(midiProgram: number | null | undefined): MidiInstrumentId | null {
  if (midiProgram == null || !Number.isFinite(midiProgram)) return null;
  const program = Math.round(midiProgram);
  return GENERAL_MIDI_PROGRAM_RANGES.find(([first, last]) => program >= first && program <= last)?.[2] ?? null;
}

/**
 * Programs that score writers put on parts they know nothing about: 1 (piano) is the MusicXML
 * default and 25 (nylon guitar) is what the Guitar Pro import writes for every track. A part
 * whose name names another instrument keeps that instrument.
 */
const DEFAULT_MIDI_PROGRAMS = new Set([1, 25]);

export interface InstrumentSource {
  /** MusicXML `<instrument-sound>` of the part's first score instrument. */
  instrumentSound?: string | null;
  /** MusicXML `<midi-program>` (one-based) of the part's first MIDI instrument. */
  midiProgram?: number | null;
  /** Instrument and part names, the most specific first. */
  names: readonly (string | null | undefined)[];
  context?: InstrumentNameContext;
}

/**
 * The instrument of a part from what the source score says about it, in this order: its
 * `<instrument-sound>`, its `<midi-program>`, and its names.
 */
export function resolveInstrumentIdFromSource(source: InstrumentSource): MidiInstrumentId | null {
  const bySound = resolveInstrumentIdFromSound(source.instrumentSound);
  if (bySound) return applyRegister(bySound, source.context);
  const byName = source.names.reduce<MidiInstrumentId | null>((found, name) => found ?? resolveInstrumentIdFromName(name, source.context), null);
  const byProgram = resolveInstrumentIdFromMidiProgram(source.midiProgram);
  if (byProgram && !(DEFAULT_MIDI_PROGRAMS.has(Math.round(source.midiProgram ?? 0)) && byName && byName !== byProgram)) {
    return applyRegister(byProgram, source.context);
  }
  return byName;
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
  return resolveMidiInstrumentSound(match?.id ?? resolveInstrumentIdFromMidiProgram(midiProgram));
}
