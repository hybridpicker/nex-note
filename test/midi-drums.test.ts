import test from 'node:test';
import assert from 'node:assert/strict';
import { DOMParser } from '@xmldom/xmldom';
import { Midi } from '@tonejs/midi';

import {
  buildFallbackMidiFromMusicXml,
  drumKeyFromDisplayPosition,
  drumKeyFromInstrumentName,
  sanitizeXmlForMidiExport,
} from '../lib/midi-export.ts';
import { importMusicXmlToCore } from '../src/musicxml-adapter/import/import-musicxml.ts';

const unpitched = (step: string, octave: number, instrument: string | null, extra = '') => (
  `<note><unpitched><display-step>${step}</display-step><display-octave>${octave}</display-octave></unpitched><duration>1</duration>${instrument ? `<instrument id="${instrument}"/>` : ''}<voice>1</voice><type>quarter</type>${extra}</note>`
);

function drumScore(scorePartInstruments: string, notes: string, partName = 'Drum Kit') {
  return `<?xml version="1.0" encoding="UTF-8"?>
<score-partwise version="4.0"><part-list>
<score-part id="P1"><part-name>Piano</part-name></score-part>
<score-part id="P2"><part-name>${partName}</part-name>${scorePartInstruments}</score-part>
</part-list>
<part id="P1"><measure number="1"><attributes><divisions>1</divisions><time><beats>4</beats><beat-type>4</beat-type></time><clef><sign>G</sign><line>2</line></clef></attributes>
<note><pitch><step>C</step><octave>4</octave></pitch><duration>4</duration><voice>1</voice><type>whole</type></note></measure></part>
<part id="P2"><measure number="1"><attributes><divisions>1</divisions><time><beats>4</beats><beat-type>4</beat-type></time><clef><sign>percussion</sign></clef></attributes>
${notes}</measure></part></score-partwise>`;
}

const NOTES = `${unpitched('F', 4, 'P2-X2')}${unpitched('C', 5, 'P2-X1')}${unpitched('F', 4, 'P2-X2')}${unpitched('C', 5, 'P2-X1', '<notations><articulations><accent/></articulations></notations>')}`;

/** The audit's second probe: the source names General MIDI keys (one-based) for its instruments. */
const WITH_UNPITCHED = drumScore(
  '<score-instrument id="P2-X1"><instrument-name>Snare</instrument-name><instrument-sound>drum.snare-drum</instrument-sound></score-instrument>'
  + '<score-instrument id="P2-X2"><instrument-name>Kick</instrument-name><instrument-sound>drum.bass-drum</instrument-sound></score-instrument>'
  + '<midi-instrument id="P2-X1"><midi-channel>10</midi-channel><midi-program>1</midi-program><midi-unpitched>39</midi-unpitched></midi-instrument>'
  + '<midi-instrument id="P2-X2"><midi-channel>10</midi-channel><midi-program>1</midi-program><midi-unpitched>37</midi-unpitched></midi-instrument>',
  NOTES,
);

/** The audit's first probe: instruments without MIDI data. */
const WITHOUT_UNPITCHED = drumScore(
  '<score-instrument id="P2-X1"><instrument-name>Snare</instrument-name></score-instrument><score-instrument id="P2-X2"><instrument-name>Kick</instrument-name></score-instrument>',
  NOTES,
);

function scorePart(xml: string, id: string) {
  const doc = new DOMParser().parseFromString(xml, 'application/xml');
  return Array.from(doc.getElementsByTagName('score-part')).find((entry) => entry.getAttribute('id') === id)!;
}

function midiInstrumentValues(xml: string, partId: string) {
  return Array.from(scorePart(xml, partId).getElementsByTagName('midi-instrument')).map((entry) => ({
    id: entry.getAttribute('id'),
    channel: entry.getElementsByTagName('midi-channel')[0]?.textContent,
    unpitched: entry.getElementsByTagName('midi-unpitched')[0]?.textContent,
  }));
}

test('the sanitizer keeps the instruments, MIDI keys and name of a drum part', () => {
  const sanitized = sanitizeXmlForMidiExport(WITH_UNPITCHED);

  assert.deepEqual(midiInstrumentValues(sanitized.xml, 'P2'), [
    { id: 'P2-X1', channel: '10', unpitched: '39' },
    { id: 'P2-X2', channel: '10', unpitched: '37' },
  ]);
  const drums = scorePart(sanitized.xml, 'P2');
  assert.equal(drums.getElementsByTagName('part-name')[0]?.textContent, 'Drum Kit');
  assert.deepEqual(Array.from(drums.getElementsByTagName('instrument-name')).map((entry) => entry.textContent), ['Snare', 'Kick']);
  assert.equal(drums.getElementsByTagName('instrument-sound').length, 2);
  assert.ok(!sanitized.renamedParts.some((entry) => entry.id === 'P2'));
  assert.ok(!sanitized.renamedInstruments.some((entry) => entry.id === 'P2'));
  // Melodic parts are still normalized as before.
  assert.deepEqual(midiInstrumentValues(sanitized.xml, 'P1').map((entry) => entry.channel), ['1']);
});

test('the sanitizer puts every drum instrument on channel 10 and gives missing ones a key', () => {
  const sanitized = sanitizeXmlForMidiExport(WITHOUT_UNPITCHED);
  // Snare 38 and Kick 36, written one-based.
  assert.deepEqual(midiInstrumentValues(sanitized.xml, 'P2'), [
    { id: 'P2-X1', channel: '10', unpitched: '39' },
    { id: 'P2-X2', channel: '10', unpitched: '37' },
  ]);

  const wrongChannel = drumScore(
    '<score-instrument id="P2-X1"><instrument-name>Tom</instrument-name></score-instrument><midi-instrument id="P2-X1"><midi-channel>3</midi-channel><midi-program>1</midi-program><volume>80</volume></midi-instrument>',
    unpitched('E', 5, null),
  );
  const fixed = sanitizeXmlForMidiExport(wrongChannel);
  assert.deepEqual(midiInstrumentValues(fixed.xml, 'P2'), [{ id: 'P2-X1', channel: '10', unpitched: '48' }]);
  // <midi-unpitched> sits before <volume>, as the MusicXML schema orders them.
  assert.match(fixed.xml, /<midi-program>1<\/midi-program><midi-unpitched>48<\/midi-unpitched><volume>80<\/volume>/);
});

for (const [label, xml] of [['with <midi-unpitched>', WITH_UNPITCHED], ['by instrument name', WITHOUT_UNPITCHED]] as const) {
  test(`the fallback plays unpitched notes as General MIDI drums on channel 10 (${label})`, () => {
    for (const source of [xml, sanitizeXmlForMidiExport(xml).xml]) {
      const midi = new Midi(buildFallbackMidiFromMusicXml(source).data);
      const drums = midi.tracks.find((track) => track.channel === 9);
      assert.ok(drums, 'a channel-10 track exists');
      assert.equal(drums.instrument.percussion, true);
      assert.equal(drums.name, 'Drum Kit');
      assert.deepEqual(drums.notes.map((entry) => entry.midi), [36, 38, 36, 38]);
      assert.deepEqual(drums.notes.map((entry) => entry.ticks), [0, 480, 960, 1440]);
      // The accent on the last hit plays 1.2 x mf = 96, as MuseScore 4.7 does.
      assert.deepEqual(drums.notes.map((entry) => Math.round(entry.velocity * 127)), [80, 80, 80, 96]);
      const piano = midi.tracks.find((track) => track.channel !== 9);
      assert.equal(piano?.notes[0]?.midi, 60);
    }
  });
}

test('without instruments the fallback reads the drum from the staff position', () => {
  const xml = drumScore('', `${unpitched('F', 4, null)}${unpitched('C', 5, null)}${unpitched('G', 5, null, '<notehead>x</notehead>')}${unpitched('A', 5, null, '<notehead>x</notehead>')}`);
  const drums = new Midi(buildFallbackMidiFromMusicXml(xml).data).tracks.find((track) => track.channel === 9);
  assert.deepEqual(drums?.notes.map((entry) => entry.midi), [36, 38, 42, 49]);
});

test('playing drums does not change how unpitched notes are modelled', () => {
  const core = importMusicXmlToCore(WITH_UNPITCHED);
  const events = core.score.parts[1].staves[0].measures[0].voices[0].events;
  assert.deepEqual(events.map((event) => event.kind), ['rest', 'rest', 'rest', 'rest']);
  assert.deepEqual(events.map((event) => (event.kind === 'rest' ? event.unpitched : null)), [
    { displayStep: 'F', displayOctave: 4 },
    { displayStep: 'C', displayOctave: 5 },
    { displayStep: 'F', displayOctave: 4 },
    { displayStep: 'C', displayOctave: 5 },
  ]);
});

test('drum keys from names and staff positions', () => {
  assert.equal(drumKeyFromInstrumentName('Bass Drum'), 36);
  assert.equal(drumKeyFromInstrumentName('Kick'), 36);
  assert.equal(drumKeyFromInstrumentName('Acoustic Snare'), 38);
  assert.equal(drumKeyFromInstrumentName('Closed Hi-Hat'), 42);
  assert.equal(drumKeyFromInstrumentName('Open Hi-Hat'), 46);
  assert.equal(drumKeyFromInstrumentName('Pedal Hi-Hat'), 44);
  assert.equal(drumKeyFromInstrumentName('Crash Cymbal'), 49);
  assert.equal(drumKeyFromInstrumentName('Ride Cymbal'), 51);
  assert.equal(drumKeyFromInstrumentName('Floor Tom'), 43);
  assert.equal(drumKeyFromInstrumentName('Kleine Trommel'), 38);
  assert.equal(drumKeyFromInstrumentName('Große Trommel'), 36);
  assert.equal(drumKeyFromInstrumentName('Becken'), 49);
  assert.equal(drumKeyFromInstrumentName('Kazoo'), null);
  assert.equal(drumKeyFromDisplayPosition('F', 4), 36);
  assert.equal(drumKeyFromDisplayPosition('C', 5), 38);
  assert.equal(drumKeyFromDisplayPosition('C', 5, 'x'), 37);
  assert.equal(drumKeyFromDisplayPosition('G', 5, 'x'), 42);
  assert.equal(drumKeyFromDisplayPosition('F', 5, 'x'), 51);
  assert.equal(drumKeyFromDisplayPosition('A', 5, 'x'), 49);
});
