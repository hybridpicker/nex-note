import test from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync } from 'node:fs';
import { Midi } from '@tonejs/midi';

import {
  MIDI_INSTRUMENTS,
  resolveInstrumentIdFromMidiProgram,
  resolveInstrumentIdFromName,
  resolveInstrumentIdFromSound,
  resolveInstrumentIdFromSource,
  resolveMidiInstrumentSound,
  resolveMidiSoundFromToneProgram,
  resolvePartInstrumentId,
} from '../lib/midi-instruments.ts';
import { buildFallbackMidiFromMusicXml, sanitizeXmlForMidiExport } from '../lib/midi-export.ts';
import type { PartNode } from '../src/score-core/model/types.ts';

const soundfontOf = (name: string, context?: Parameters<typeof resolveInstrumentIdFromName>[1]) => (
  resolveMidiInstrumentSound(resolveInstrumentIdFromName(name, context)).soundfont
);

test('only the FluidR3 sets that the fetch script ships are used', () => {
  // scripts/fetch-soundfonts.mjs downloads exactly the `soundfont` names of lib/midi-instruments.ts.
  const shipped = [
    'acoustic_grand_piano', 'acoustic_guitar_nylon', 'acoustic_guitar_steel', 'alto_sax', 'bassoon', 'cello', 'choir_aahs',
    'church_organ', 'clarinet', 'contrabass', 'electric_bass_finger', 'electric_guitar_clean', 'flute', 'french_horn', 'oboe',
    'orchestral_harp', 'synth_drum', 'trombone', 'trumpet', 'tuba', 'viola', 'violin',
  ];
  const used = [...new Set(Object.values(MIDI_INSTRUMENTS).map((instrument) => instrument.soundfont))].sort();
  assert.deepEqual(used, shipped);
  let local: string[] = [];
  try {
    local = readdirSync('public/soundfonts/FluidR3_GM').filter((file) => file.endsWith('-mp3.js')).map((file) => file.replace(/-mp3\.js$/, ''));
  } catch {
    // The sets are downloaded, not committed; a fresh checkout has none.
  }
  if (local.length > 0) assert.deepEqual(used.filter((name) => !local.includes(name)), []);
});

test('names that used to fall back to the wrong sound play the nearest shipped timbre', () => {
  const expectations: Array<[string, string, string]> = [
    ['Tenor Sax', 'sax-tenor', 'alto_sax'],
    ['Tenor Saxophone', 'sax-tenor', 'alto_sax'],
    ['Baritone Saxophone', 'sax-baritone', 'alto_sax'],
    ['Soprano Saxophone', 'sax-soprano', 'alto_sax'],
    ['Acoustic Bass', 'acoustic-bass', 'electric_bass_finger'],
    ['Fretless Bass', 'fretless-bass', 'electric_bass_finger'],
    ['Bass Drum', 'drum-set', 'synth_drum'],
    ['Violins I', 'violin', 'violin'],
    ['Violin II', 'violin', 'violin'],
    ['Strings', 'strings', 'violin'],
    ['Drumset', 'drum-set', 'synth_drum'],
    ['Snare Drum', 'drum-set', 'synth_drum'],
    ['Hi-Hat', 'drum-set', 'synth_drum'],
    ['Timpani', 'timpani', 'acoustic_grand_piano'],
    ['Piccolo', 'piccolo', 'flute'],
    ['Glockenspiel', 'glockenspiel', 'orchestral_harp'],
    ['Xylophone', 'xylophone', 'orchestral_harp'],
    ['Marimba', 'marimba', 'orchestral_harp'],
    ['Vibraphone', 'vibraphone', 'orchestral_harp'],
    ['Harpsichord', 'harpsichord', 'acoustic_grand_piano'],
    ['Accordion', 'accordion', 'church_organ'],
    ['Banjo', 'banjo', 'acoustic_guitar_steel'],
    ['Cornet', 'cornet', 'trumpet'],
    ['Flugelhorn', 'flugelhorn', 'trumpet'],
    ['Euphonium', 'euphonium', 'tuba'],
    ['Recorder', 'recorder', 'flute'],
    ['Contrabassoon', 'contrabassoon', 'bassoon'],
    ['Cor Anglais', 'english-horn', 'oboe'],
    ['English Horn', 'english-horn', 'oboe'],
    ['Distortion Guitar', 'distortion-guitar', 'electric_guitar_clean'],
    ['Piccolo Trumpet', 'trumpet-bb', 'trumpet'],
    ['Double Bassoon', 'contrabassoon', 'bassoon'],
    ['Tenor Horn', 'euphonium', 'tuba'],
    ['Bass Trombone', 'trombone', 'trombone'],
    ['Bass Clarinet', 'clarinet-bb', 'clarinet'],
    ['Bass Guitar', 'electric-bass', 'electric_bass_finger'],
    ['Horns 1/2', 'horn-f', 'french_horn'],
    ['Mezzo-soprano', 'soprano', 'choir_aahs'],
  ];
  for (const [name, id, soundfont] of expectations) {
    assert.equal(resolveInstrumentIdFromName(name), id, name);
    assert.equal(soundfontOf(name), soundfont, name);
  }
});

test('common German, French and Italian instrument names resolve', () => {
  const expectations: Array<[string, string]> = [
    ['Klavier', 'piano'], ['Querflöte', 'flute'], ['Trompete in B', 'trumpet-bb'], ['Posaune', 'trombone'], ['Waldhorn', 'horn-f'],
    ['Klarinette in B', 'clarinet-bb'], ['Fagott', 'bassoon'], ['Violine I', 'violin'], ['Geige', 'violin'], ['Bratsche', 'viola'],
    ['Violoncello', 'cello'], ['Kontrabass', 'double-bass'], ['Schlagzeug', 'drum-set'], ['Kleine Trommel', 'drum-set'], ['Pauken', 'timpani'],
    ['Altsaxophon', 'sax-alto-eb'], ['Tenorsaxophon', 'sax-tenor'], ['Tenorhorn', 'euphonium'], ['Flügelhorn', 'flugelhorn'],
    ['E-Bass', 'electric-bass'], ['E-Gitarre', 'electric-guitar'], ['Gitarre', 'guitar'], ['Akkordeon', 'accordion'],
    ['Steirische Harmonika', 'accordion'], ['Orgel', 'organ'], ['Harfe', 'harp'], ['Sopran', 'soprano'], ['Alt', 'alto'],
    ['Blockflöte', 'recorder'], ['Englischhorn', 'english-horn'], ['Cembalo', 'harpsichord'],
    ['Flûte', 'flute'], ['Hautbois', 'oboe'], ['Clarinette', 'clarinet-bb'], ['Basson', 'bassoon'], ['Trompette', 'trumpet-bb'],
    ['Violon', 'violin'], ['Violoncelle', 'cello'], ['Contrebasse', 'double-bass'], ['Batterie', 'drum-set'], ['Guitare', 'guitar'],
    ['Flauto', 'flute'], ['Ottavino', 'piccolo'], ['Clarinetto', 'clarinet-bb'], ['Fagotto', 'bassoon'], ['Tromba', 'trumpet-bb'],
    ['Corno', 'horn-f'], ['Violino', 'violin'], ['Contrabbasso', 'double-bass'], ['Chitarra', 'guitar'], ['Corno inglese', 'english-horn'],
  ];
  for (const [name, id] of expectations) assert.equal(resolveInstrumentIdFromName(name), id, name);
});

test('the existing name expectations still hold', () => {
  assert.equal(resolveInstrumentIdFromName('Standard Drum Kit'), 'drum-set');
  assert.equal(resolveInstrumentIdFromName('glass armonica'), null);
  for (const [name, id] of [
    ['Piano', 'piano'], ['Organ', 'organ'], ['Harp', 'harp'], ['Violin', 'violin'], ['Viola', 'viola'], ['Cello', 'cello'],
    ['Double Bass', 'double-bass'], ['Flute', 'flute'], ['Oboe', 'oboe'], ['Clarinet in Bb', 'clarinet-bb'], ['Bassoon', 'bassoon'],
    ['Alto Saxophone in Eb', 'sax-alto-eb'], ['Trumpet in Bb', 'trumpet-bb'], ['Horn in F', 'horn-f'], ['Trombone', 'trombone'],
    ['Tuba', 'tuba'], ['Soprano', 'soprano'], ['Alto', 'alto'], ['Tenor', 'tenor'], ['Voice', 'bass'], ['Guitar', 'guitar'],
    ['Guitar TAB', 'guitar-tab'], ['Acoustic Guitar', 'acoustic-guitar'], ['Classical Guitar', 'classical-guitar'],
    ['Electric Guitar', 'electric-guitar'], ['Electric Bass', 'electric-bass'], ['Electric Bass TAB', 'electric-bass-tab'],
    ['5-String Electric Bass', 'five-string-electric-bass'], ['Ukulele', 'ukulele'], ['Mandolin', 'mandolin'], ['Drum Set', 'drum-set'],
    ['bass', 'bass'], ['piano', 'piano'],
  ] as const) {
    assert.equal(resolveInstrumentIdFromName(name), id, name);
  }
  assert.equal(resolveMidiSoundFromToneProgram(56).id, 'trumpet-bb');
  assert.equal(resolveMidiSoundFromToneProgram(73).id, 'flute');
  assert.equal(resolveMidiSoundFromToneProgram(0, { percussion: true }).id, 'drum-set');
});

test('a bare "Bass" is a voice only with lyrics or soprano, alto or tenor parts', () => {
  assert.equal(resolveInstrumentIdFromName('Bass'), null, 'undecided without context');
  assert.equal(resolveInstrumentIdFromName('Bass', { hasLyrics: true }), 'bass');
  assert.equal(resolveInstrumentIdFromName('Bass', { siblingNames: ['Soprano', 'Alto', 'Tenor'] }), 'bass');
  assert.equal(resolveInstrumentIdFromName('Bass II', { siblingNames: ['Sopran', 'Alt'] }), 'bass');
  assert.equal(resolveInstrumentIdFromName('Bass', { siblingNames: ['Piano', 'Drums', 'Alto Sax'] }), 'electric-bass');
  assert.equal(resolveInstrumentIdFromName('Basses', { siblingNames: ['Violins I', 'Violas', 'Cellos'] }), 'double-bass');
  assert.equal(resolveInstrumentIdFromName('Bass', { octaveChange: -1 }), 'electric-bass');
  assert.equal(resolveInstrumentIdFromName('Baritone', { siblingNames: ['Soprano', 'Tenor'] }), 'bass');
  assert.equal(resolveInstrumentIdFromName('Baritone', { siblingNames: ['Cornet', 'Tuba'] }), 'euphonium');
  assert.equal(soundfontOf('Bass', { siblingNames: ['Piano'] }), 'electric_bass_finger');
  assert.equal(soundfontOf('Bass', { hasLyrics: true }), 'choir_aahs');

  const part = (name: string, lyrics: boolean) => ({
    name,
    instrumentName: name,
    staves: [{ id: 's', staffIndex: 1, measures: [{ id: 'm', measureNumber: 1, directions: [], attributes: [], voices: [{ id: 'v', voiceId: 1, events: [{
      id: 'e', kind: 'note', measureNumber: 1, staffIndex: 1, voiceId: 1, timestampNum: 0, timestampDen: 1, durationDivisions: 4, isChord: false,
      pitch: { step: 'E', alter: 0, octave: 2 }, lyrics: lyrics ? [{ text: 'la' }] : [],
    }] }] }] }],
  }) as unknown as PartNode;
  assert.equal(resolvePartInstrumentId(part('Bass', true)), 'bass');
  assert.equal(resolvePartInstrumentId(part('Bass', false)), null);
  assert.equal(resolvePartInstrumentId(part('Bass', false), { siblings: [part('Soprano', false), part('Alto', false)] }), 'bass');
  assert.equal(resolvePartInstrumentId(part('Bass', false), { siblings: [part('Piano', false)] }), 'electric-bass');
  assert.equal(resolvePartInstrumentId(part('Strings', false)), 'cello', 'a low string part plays the cello set');
});

test('the source instrument sound and MIDI program come before the name', () => {
  assert.equal(resolveInstrumentIdFromSound('wind.reed.saxophone.tenor'), 'sax-tenor');
  assert.equal(resolveInstrumentIdFromSound('pluck.bass.fretless'), 'fretless-bass');
  assert.equal(resolveInstrumentIdFromSound('strings.group'), 'strings');
  assert.equal(resolveInstrumentIdFromSound('pitched-percussion.glockenspiel'), 'glockenspiel');
  assert.equal(resolveInstrumentIdFromSound('drum.group.set'), 'drum-set');
  assert.equal(resolveInstrumentIdFromSound('drum.timpani'), 'timpani');
  assert.equal(resolveInstrumentIdFromSound('voice.bass'), 'bass');
  assert.equal(resolveInstrumentIdFromSound('wind.reed.english-horn'), 'english-horn');
  assert.equal(resolveInstrumentIdFromSound('keyboard.harpsichord'), 'harpsichord');
  assert.equal(resolveInstrumentIdFromSound('unknown.thing'), null);

  assert.equal(resolveInstrumentIdFromMidiProgram(67), 'sax-tenor');
  assert.equal(resolveInstrumentIdFromMidiProgram(33), 'acoustic-bass');
  assert.equal(resolveInstrumentIdFromMidiProgram(70), 'english-horn');
  assert.equal(resolveInstrumentIdFromMidiProgram(90), null);
  assert.equal(resolveMidiSoundFromToneProgram(66).soundfont, 'alto_sax', 'tenor sax program');
  assert.equal(resolveMidiSoundFromToneProgram(47).soundfont, 'acoustic_grand_piano', 'timpani program');
  assert.equal(resolveMidiSoundFromToneProgram(10).soundfont, 'orchestral_harp', 'music box program');

  assert.equal(resolveInstrumentIdFromSource({ instrumentSound: 'brass.flugelhorn', midiProgram: 57, names: ['Solo'] }), 'flugelhorn');
  assert.equal(resolveInstrumentIdFromSource({ midiProgram: 67, names: ['Melody'] }), 'sax-tenor');
  assert.equal(resolveInstrumentIdFromSource({ midiProgram: 53, names: ['Bass'] }), 'soprano', 'a choir program decides a bare Bass');
  // Program 1 and 25 are written for parts the writer knew nothing about; a clear name wins.
  assert.equal(resolveInstrumentIdFromSource({ midiProgram: 1, names: ['Violin'] }), 'violin');
  assert.equal(resolveInstrumentIdFromSource({ midiProgram: 25, names: ['Electric Bass'] }), 'electric-bass');
  assert.equal(resolveInstrumentIdFromSource({ midiProgram: 1, names: ['Mystery'] }), 'piano');
});

test('the sanitizer and the fallback read the source sound before stripping it', () => {
  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<score-partwise version="4.0"><part-list>
<score-part id="P1"><part-name>Solo</part-name><score-instrument id="P1-I1"><instrument-name>Solo</instrument-name><instrument-sound>wind.reed.saxophone.tenor</instrument-sound></score-instrument></score-part>
<score-part id="P2"><part-name>Bass</part-name><score-instrument id="P2-I1"><instrument-name>Bass</instrument-name></score-instrument><midi-instrument id="P2-I1"><midi-program>53</midi-program></midi-instrument></score-part>
<score-part id="P3"><part-name>Bass</part-name><score-instrument id="P3-I1"><instrument-name>Bass</instrument-name></score-instrument></score-part>
</part-list>
${[1, 2, 3].map((index) => `<part id="P${index}"><measure number="1"><attributes><divisions>1</divisions></attributes><note><pitch><step>C</step><octave>3</octave></pitch><duration>4</duration><voice>1</voice><type>whole</type></note></measure></part>`).join('')}
</score-partwise>`;
  const sanitized = sanitizeXmlForMidiExport(xml);
  assert.match(sanitized.xml, /<part-name>Tenor Saxophone<\/part-name>[\s\S]*?<midi-program>67<\/midi-program>/);
  assert.match(sanitized.xml, /<score-part id="P2"><part-name>Voice<\/part-name>[\s\S]*?<midi-program>53<\/midi-program>/);
  // P3 has no lyrics and no soprano, alto or tenor sibling: a bass instrument.
  assert.match(sanitized.xml, /<score-part id="P3"><part-name>Electric Bass<\/part-name>[\s\S]*?<midi-program>34<\/midi-program>/);
  assert.doesNotMatch(sanitized.xml, /instrument-sound/);

  for (const source of [xml, sanitized.xml]) {
    const programs = new Midi(buildFallbackMidiFromMusicXml(source).data).tracks.map((track) => track.instrument.number + 1);
    assert.deepEqual(programs, [67, 53, 34]);
  }
});
