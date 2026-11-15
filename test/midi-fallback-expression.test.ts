import test from 'node:test';
import assert from 'node:assert/strict';
import { Midi } from '@tonejs/midi';

import { buildFallbackMidiFromMusicXml, sanitizeXmlForMidiExport } from '../lib/midi-export.ts';

const note = (step: string, octave: number, extra = '', duration = 1, type = 'quarter', voiceAndStaff = '<voice>1</voice>') => (
  `<note><pitch><step>${step}</step><octave>${octave}</octave></pitch><duration>${duration}</duration>${voiceAndStaff}<type>${type}</type>${extra}</note>`
);
const dynamic = (mark: string, staff = '') => `<direction placement="below"><direction-type><dynamics><${mark}/></dynamics></direction-type>${staff}</direction>`;
const wedge = (type: string) => `<direction placement="below"><direction-type><wedge type="${type}"/></direction-type></direction>`;
const pedal = (type: string, staff = '') => `<direction placement="below"><direction-type><pedal type="${type}" line="yes"/></direction-type>${staff}</direction>`;
const articulation = (name: string) => `<notations><articulations><${name}/></articulations></notations>`;
const ATTRIBUTES = '<attributes><divisions>1</divisions><time><beats>4</beats><beat-type>4</beat-type></time><clef><sign>G</sign><line>2</line></clef></attributes>';
const TEMPO = '<direction placement="above"><direction-type><metronome><beat-unit>quarter</beat-unit><per-minute>120</per-minute></metronome></direction-type><sound tempo="120"/></direction>';

function score(measures: string[], partName = 'Piano') {
  return `<?xml version="1.0" encoding="UTF-8"?>
<score-partwise version="4.0"><part-list><score-part id="P1"><part-name>${partName}</part-name></score-part></part-list>
<part id="P1">${measures.map((content, index) => `<measure number="${index + 1}">${index === 0 ? ATTRIBUTES + TEMPO : ''}${content}</measure>`).join('')}</part>
</score-partwise>`;
}

/** The audio audit's probe score; the comments give what the MuseScore 4.7 CLI wrote for it. */
const PROBE_XML = score([
  `${dynamic('pp')}${note('C', 4)}${dynamic('ff')}${note('C', 4)}${note('C', 4, articulation('staccato'))}${note('C', 4, articulation('accent'))}`,
  `${dynamic('p')}${wedge('crescendo')}${note('D', 4)}${note('D', 4)}${note('D', 4)}${wedge('stop')}${dynamic('f')}${note('D', 4)}`,
  `${dynamic('mf')}${note('E', 4, articulation('tenuto'))}${note('E', 4, '<notations><slur type="start"/></notations>')}${note('F', 4)}${note('G', 4, '<notations><slur type="stop"/></notations>')}`,
  `${pedal('start')}${note('C', 4)}${note('E', 4)}${note('G', 4)}${pedal('stop')}${note('C', 5, '<notations><fermata/></notations>')}`,
  note('C', 4, '<tie type="start"/><notations><tied type="start"/></notations>', 4, 'whole'),
  note('C', 4, '<tie type="stop"/><notations><tied type="stop"/></notations>', 4, 'whole'),
]);

function render(xml: string) {
  return new Midi(buildFallbackMidiFromMusicXml(xml).data);
}

const velocity127 = (value: number) => Math.round(value * 127);

test('fallback velocities follow the MuseScore dynamics, hairpin and accent of the probe score', () => {
  const notes = render(PROBE_XML).tracks[0].notes;

  // pp 33, ff 112 (staccato note also 112), accent at ff 112 + 15 = 127.
  assert.deepEqual(notes.slice(0, 4).map((entry) => velocity127(entry.velocity)), [33, 112, 112, 127]);
  // p -> f hairpin, linear per note: 49, 64, 80, then the f itself 96.
  assert.deepEqual(notes.slice(4, 8).map((entry) => velocity127(entry.velocity)), [49, 64, 80, 96]);
  // mf from measure 3 on, the tied note included.
  assert.ok(notes.slice(8).every((entry) => velocity127(entry.velocity) === 80));
});

test('fallback articulation lengths, fermata tempo, pedal and ties match the probe score', () => {
  const midi = render(PROBE_XML);
  const notes = midi.tracks[0].notes;

  assert.ok(Math.abs(notes[2].duration - 0.25) < 0.01, `staccato lasts ${notes[2].duration}s`); // MuseScore: 0.249 s of 0.5 s
  assert.ok(Math.abs(notes[8].duration - 0.5) < 0.01, 'tenuto keeps its full length');
  assert.ok(Math.abs(notes[0].duration - 0.5) < 0.01, 'a plain note keeps its full length');

  // Fermata on the last quarter of measure 4 (7.5 s): half tempo for its span, then back to 120.
  assert.deepEqual(midi.header.tempos.map((tempo) => [Number(tempo.time?.toFixed(3)), Math.round(tempo.bpm)]), [[0, 120], [7.5, 60], [8.5, 120]]);
  assert.ok(Math.abs(notes[15].duration - 1) < 0.01, 'the fermata note sounds twice as long');

  const pedalEvents = midi.tracks[0].controlChanges[64].map((change) => [Number(change.time.toFixed(3)), change.value]);
  assert.deepEqual(pedalEvents, [[6, 1], [7.5, 0]]);

  // The tie across measures 5 and 6 is one note without a second attack.
  assert.equal(notes.length, 17);
  assert.equal(notes[16].midi, 60);
  assert.equal(notes[16].durationTicks, 480 * 8);
});

test('fallback expression leaves note onsets where the score puts them', () => {
  const ticks = render(PROBE_XML).tracks[0].notes.map((entry) => entry.ticks);
  assert.deepEqual(ticks, [...Array.from({ length: 16 }, (_, index) => index * 480), 16 * 480]);
});

test('without dynamics the fallback plays mezzo-forte like MuseScore', () => {
  const notes = render(score([`${note('C', 4)}${note('D', 4)}${note('E', 4)}${note('F', 4)}`])).tracks[0].notes;
  assert.deepEqual(notes.map((entry) => velocity127(entry.velocity)), [80, 80, 80, 80]);
});

test('sforzando-type marks accent one note and fp returns to piano', () => {
  const notes = render(score([
    `${dynamic('p')}${note('C', 4)}${dynamic('sfz')}${note('C', 4)}${note('C', 4)}${dynamic('fp')}${note('C', 4)}`,
    `${note('C', 4)}${note('C', 4, articulation('strong-accent'))}${note('C', 4, articulation('staccatissimo'))}${note('C', 4)}`,
  ])).tracks[0].notes;

  // MuseScore 4.7 for the same score: 49 112 94 96 / 49 58 49 49 (marcato 1.2 x p, floored).
  assert.deepEqual(notes.map((entry) => velocity127(entry.velocity)), [49, 112, 94, 96, 49, 58, 49, 49]);
  assert.ok(Math.abs(notes[6].duration - 0.5 / 3) < 0.01, `staccatissimo lasts a third of the note (${notes[6].duration})`);
  assert.ok(Math.abs(notes[5].duration - 0.5 * 2 / 3) < 0.01, `marcato lasts two thirds of the note (${notes[5].duration})`);
});

test('after sf-type marks the level stays 18 below the peak, and accents scale the level, as in MuseScore', () => {
  const notes = render(score([
    `${dynamic('p')}${note('C', 4)}${dynamic('sfz')}${note('C', 4)}${note('C', 4)}${note('C', 4)}`,
    `${note('C', 4)}${note('C', 4)}${note('C', 4)}${note('C', 4)}`,
    `${dynamic('mf')}${note('C', 4)}${note('C', 4, articulation('strong-accent'))}${note('C', 4, articulation('accent'))}${note('C', 4)}`,
    `${dynamic('p')}${note('C', 4)}${dynamic('sff')}${note('C', 4)}${note('C', 4)}${note('C', 4)}`,
  ])).tracks[0].notes;
  // What the MuseScore 4.7.3 CLI wrote for this score.
  assert.deepEqual(notes.map((entry) => velocity127(entry.velocity)), [
    49, 112, 94, 94,
    94, 94, 94, 94,
    80, 96, 96, 80,
    49, 126, 108, 108,
  ]);
  assert.ok(Math.abs(notes[9].durationTicks - 320) <= 1, 'marcato: 320 of 480 ticks');
  assert.equal(notes[10].durationTicks, 480, 'an accent keeps its length');
});

test('a hairpin without a closing dynamic moves one dynamic step', () => {
  const notes = render(score([
    `${dynamic('mf')}${wedge('diminuendo')}${note('C', 4)}${note('C', 4)}${note('C', 4)}${note('C', 4)}${wedge('stop')}`,
    `${note('C', 4)}`,
  ])).tracks[0].notes;

  assert.deepEqual(notes.map((entry) => velocity127(entry.velocity)), [80, 76, 72, 68, 64]);
});

test('dynamics apply from the point they appear in every pass of a repeat', () => {
  const xml = score([
    `<barline location="left"><bar-style>heavy-light</bar-style><repeat direction="forward"/></barline>${note('C', 4)}${dynamic('ff')}${note('C', 4)}${note('C', 4)}${note('C', 4)}<barline location="right"><bar-style>light-heavy</bar-style><repeat direction="backward"/></barline>`,
  ]);
  const notes = render(xml).tracks[0].notes;

  assert.equal(notes.length, 8);
  // The first pass starts at the default mf; the ff then holds into the repeat.
  assert.deepEqual(notes.map((entry) => velocity127(entry.velocity)), [80, 112, 112, 112, 112, 112, 112, 112]);
});

test('a dynamic of the upper piano staff also shapes the lower staff, the pedal sustains both', () => {
  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<score-partwise version="4.0"><part-list><score-part id="P1"><part-name>Piano</part-name></score-part></part-list>
<part id="P1"><measure number="1"><attributes><divisions>1</divisions><time><beats>4</beats><beat-type>4</beat-type></time><staves>2</staves><clef number="1"><sign>G</sign><line>2</line></clef><clef number="2"><sign>F</sign><line>4</line></clef></attributes>
${dynamic('pp', '<staff>1</staff>')}${pedal('start', '<staff>2</staff>')}
${note('C', 5, '', 4, 'whole', '<voice>1</voice><staff>1</staff>')}<backup><duration>4</duration></backup>${note('C', 3, '', 4, 'whole', '<voice>5</voice><staff>2</staff>')}
</measure></part></score-partwise>`;
  const midi = render(xml);

  assert.equal(midi.tracks.length, 2);
  assert.deepEqual(midi.tracks.map((track) => velocity127(track.notes[0].velocity)), [33, 33]);
  assert.deepEqual(midi.tracks.map((track) => track.controlChanges[64]?.map((change) => change.value)), [[1], [1]]);
});

test('single and two-note tremolos become repeated notes', () => {
  const notes = render(score([
    `${note('C', 4, '<notations><ornaments><tremolo type="single">1</tremolo></ornaments></notations>', 2, 'half')}`
      + `${note('E', 4, '<notations><ornaments><tremolo type="start">2</tremolo></ornaments></notations>', 1, 'half')}`
      + `${note('G', 4, '<notations><ornaments><tremolo type="stop">2</tremolo></ornaments></notations>', 1, 'half')}`,
  ])).tracks[0].notes;

  // One line on a half note: four eighths.
  assert.deepEqual(notes.slice(0, 4).map((entry) => [entry.midi, entry.ticks, entry.durationTicks]), [[60, 0, 240], [60, 240, 240], [60, 480, 240], [60, 720, 240]]);
  // Two lines between E and G over a half note: eight alternating sixteenths.
  assert.deepEqual(notes.slice(4).map((entry) => entry.midi), [64, 67, 64, 67, 64, 67, 64, 67]);
  assert.deepEqual(notes.slice(4).map((entry) => entry.ticks), Array.from({ length: 8 }, (_, index) => 960 + index * 120));
});

test('a staccato on the last note of a tie shortens only that segment', () => {
  const notes = render(score([
    note('C', 4, '<tie type="start"/><notations><tied type="start"/></notations>', 4, 'whole'),
    note('C', 4, `<tie type="stop"/><notations><tied type="stop"/><articulations><staccato/></articulations></notations>`, 1, 'quarter'),
  ])).tracks[0].notes;

  assert.equal(notes.length, 1);
  assert.equal(notes[0].durationTicks, 480 * 4 + 240);
});

test('the sanitized MusicXML renders the same expression as the source', () => {
  const direct = render(PROBE_XML).tracks[0].notes.map((entry) => [entry.ticks, entry.durationTicks, velocity127(entry.velocity)]);
  const sanitized = render(sanitizeXmlForMidiExport(PROBE_XML).xml).tracks[0].notes.map((entry) => [entry.ticks, entry.durationTicks, velocity127(entry.velocity)]);
  assert.deepEqual(sanitized, direct);
});
