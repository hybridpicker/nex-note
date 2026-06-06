import test from 'node:test';
import assert from 'node:assert/strict';
import { NextRequest } from 'next/server';

import { musicXmlToAbc } from '../lib/abc-export.ts';
import { cleanMuseScoreStderr, formatMuseScoreMidiExportError, sanitizeXmlForMidiExport } from '../lib/midi-export.ts';
import { buildPracticePack } from '../lib/practice-pack.ts';
import { POST as exportAbcPost } from '../app/api/export-abc/route.ts';
import { POST as exportPracticePackPost } from '../app/api/export-practice-pack/route.ts';
import { POST as midiPost } from '../app/api/midi/route.ts';

const EXPORT_XML = `<?xml version="1.0" encoding="UTF-8"?>
<score-partwise version="3.1">
  <work><work-title>Export Matrix</work-title></work>
  <identification><creator type="composer">Jane Doe</creator></identification>
  <part-list>
    <score-part id="P1">
      <part-name>Clarinet</part-name>
      <score-instrument id="P1-I1">
        <instrument-name>Clarinet</instrument-name>
        <instrument-sound>wind.clarinet</instrument-sound>
      </score-instrument>
      <midi-device id="P1-I1" port="1" />
      <midi-instrument id="P1-I1"><midi-program>72</midi-program></midi-instrument>
    </score-part>
  </part-list>
  <part id="P1">
    <measure number="1">
      <attributes>
        <divisions>1</divisions>
        <key><fifths>-2</fifths></key>
        <time><beats>4</beats><beat-type>4</beat-type></time>
        <clef><sign>G</sign><line>2</line></clef>
        <transpose><chromatic>2</chromatic></transpose>
      </attributes>
      <direction>
        <direction-type><metronome><beat-unit>quarter</beat-unit><per-minute>96</per-minute></metronome></direction-type>
      </direction>
      <note>
        <pitch><step>E</step><alter>1</alter><octave>4</octave></pitch>
        <duration>1</duration><voice>1</voice><type>quarter</type><staff>1</staff>
        <tie type="start"/>
        <notations><tied type="start"/></notations>
      </note>
      <note><rest/><duration>1</duration><voice>1</voice><type>quarter</type><staff>1</staff></note>
    </measure>
  </part>
</score-partwise>`;

test('musicXmlToAbc preserves title, composer, meter, key, tempo, accidentals, and rests', () => {
  const abc = musicXmlToAbc(EXPORT_XML, 'export.musicxml');

  assert.match(abc, /^X:1/m);
  assert.match(abc, /^T:Export Matrix$/m);
  assert.match(abc, /^C:Jane Doe$/m);
  assert.match(abc, /^M:4\/4$/m);
  assert.match(abc, /^Q:1\/4=96$/m);
  assert.match(abc, /^K:Bb$/m);
  assert.match(abc, /\^E2 z2 \|/);
});

test('sanitizeXmlForMidiExport refreshes playable instrument metadata and malformed tie starts', () => {
  const sanitized = sanitizeXmlForMidiExport(EXPORT_XML);

  assert.equal(sanitized.renamedParts[0]?.to, undefined);
  assert.equal(sanitized.renamedInstruments[0]?.to, undefined);
  assert.equal(sanitized.removedMalformedTieStarts, 1);
  assert.equal(sanitized.strippedPlaybackMetadata.removedTranspose, 1);
  assert.equal(sanitized.strippedPlaybackMetadata.removedInstrumentSound, 1);
  assert.equal(sanitized.strippedPlaybackMetadata.removedMidiDevice, 1);
  assert.equal(sanitized.strippedPlaybackMetadata.removedMidiInstrument, 1);
  assert.doesNotMatch(sanitized.xml, /<transpose>/);
  assert.doesNotMatch(sanitized.xml, /instrument-sound/);
  assert.doesNotMatch(sanitized.xml, /midi-device/);
  assert.doesNotMatch(sanitized.xml, /tie type="start"/);
  assert.match(sanitized.xml, /<part-name>Clarinet<\/part-name>/);
  assert.match(sanitized.xml, /<instrument-name>Clarinet<\/instrument-name>/);
  assert.match(sanitized.xml, /<midi-program>72<\/midi-program>/);
});

test('sanitizeXmlForMidiExport assigns playable MIDI programs to supported score instruments', () => {
  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<score-partwise version="3.1">
  <part-list>
    <score-part id="P1"><part-name>Violin</part-name><score-instrument id="P1-I1"><instrument-name>Violin</instrument-name></score-instrument></score-part>
    <score-part id="P2"><part-name>Horn in F</part-name><score-instrument id="P2-I1"><instrument-name>Horn in F</instrument-name></score-instrument></score-part>
    <score-part id="P3"><part-name>Alto Saxophone in Eb</part-name><score-instrument id="P3-I1"><instrument-name>Alto Saxophone in Eb</instrument-name></score-instrument></score-part>
    <score-part id="P4"><part-name>Soprano</part-name><score-instrument id="P4-I1"><instrument-name>Soprano</instrument-name></score-instrument></score-part>
  </part-list>
  <part id="P1"><measure number="1"><attributes><divisions>1</divisions></attributes><note><pitch><step>A</step><octave>4</octave></pitch><duration>1</duration><voice>1</voice><type>quarter</type></note></measure></part>
  <part id="P2"><measure number="1"><attributes><divisions>1</divisions></attributes><note><pitch><step>C</step><octave>4</octave></pitch><duration>1</duration><voice>1</voice><type>quarter</type></note></measure></part>
  <part id="P3"><measure number="1"><attributes><divisions>1</divisions></attributes><note><pitch><step>E</step><octave>4</octave></pitch><duration>1</duration><voice>1</voice><type>quarter</type></note></measure></part>
  <part id="P4"><measure number="1"><attributes><divisions>1</divisions></attributes><note><pitch><step>G</step><octave>4</octave></pitch><duration>1</duration><voice>1</voice><type>quarter</type></note></measure></part>
</score-partwise>`;

  const sanitized = sanitizeXmlForMidiExport(xml);

  assert.match(sanitized.xml, /<part-name>Violin<\/part-name>[\s\S]*?<midi-program>41<\/midi-program>/);
  assert.match(sanitized.xml, /<part-name>French Horn<\/part-name>[\s\S]*?<midi-program>61<\/midi-program>/);
  assert.match(sanitized.xml, /<part-name>Alto Saxophone<\/part-name>[\s\S]*?<midi-program>66<\/midi-program>/);
  assert.match(sanitized.xml, /<part-name>Voice<\/part-name>[\s\S]*?<midi-program>53<\/midi-program>/);
});

test('sanitizeXmlForMidiExport keeps guitar playback and removes duplicate TAB parts', () => {
  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<score-partwise version="3.1">
  <part-list>
    <score-part id="P1"><part-name>Guitar</part-name><score-instrument id="P1-I1"><instrument-name>Guitar</instrument-name></score-instrument></score-part>
    <score-part id="P2"><part-name>Guitar TAB</part-name><score-instrument id="P2-I1"><instrument-name>Guitar TAB</instrument-name></score-instrument></score-part>
  </part-list>
  <part id="P1">
    <measure number="1"><attributes><divisions>1</divisions><clef><sign>G</sign><line>2</line></clef></attributes><note><pitch><step>E</step><octave>4</octave></pitch><duration>1</duration><voice>1</voice><type>quarter</type><staff>1</staff></note></measure>
  </part>
  <part id="P2">
    <measure number="1"><attributes><divisions>1</divisions><staff-details><staff-type>tab</staff-type><staff-lines>6</staff-lines></staff-details><clef><sign>TAB</sign></clef></attributes><note><pitch><step>E</step><octave>4</octave></pitch><duration>1</duration><voice>1</voice><type>quarter</type><notations><technical><string>1</string><fret>0</fret></technical></notations><staff>1</staff></note></measure>
  </part>
</score-partwise>`;

  const sanitized = sanitizeXmlForMidiExport(xml);

  assert.deepEqual(sanitized.removedDuplicateTabParts, [{ id: 'P2', name: 'Guitar TAB' }]);
  assert.match(sanitized.xml, /<part-name>Guitar<\/part-name>/);
  assert.match(sanitized.xml, /<instrument-name>Guitar<\/instrument-name>/);
  assert.doesNotMatch(sanitized.xml, /<score-part id="P2">/);
  assert.doesNotMatch(sanitized.xml, /<part id="P2">/);
});

test('MuseScore MIDI errors hide noisy Qt QML type registration warnings', () => {
  const stderr = [
    'qt.qml.typeregistration: Invalid QML element name "IconCode"; value type names should begin with a lowercase letter',
    'real conversion failure',
  ].join('\n');

  assert.equal(cleanMuseScoreStderr(stderr), 'real conversion failure');
  assert.equal(
    formatMuseScoreMidiExportError({ code: null, signal: 'SIGTERM', stderr, timeoutMs: 180000 }),
    'MuseScore MIDI export failed: timed out after 180s (SIGTERM): real conversion failure',
  );
});

test('ABC export route rejects empty XML requests', async () => {
  const req = new NextRequest('http://localhost/api/export-abc', {
    method: 'POST',
    body: JSON.stringify({ xml: '' }),
    headers: { 'Content-Type': 'application/json' },
  });

  const res = await exportAbcPost(req);
  assert.equal(res.status, 400);
  assert.match(await res.text(), /No XML provided/);
});

test('MIDI export route rejects empty XML requests', async () => {
  const req = new NextRequest('http://localhost/api/midi', {
    method: 'POST',
    body: JSON.stringify({ xml: '' }),
    headers: { 'Content-Type': 'application/json' },
  });

  const res = await midiPost(req);
  assert.equal(res.status, 400);
  assert.match(await res.text(), /No XML provided/);
});

test('buildPracticePack generates practice xml and abc variants', () => {
  const pack = buildPracticePack({ xml: EXPORT_XML, filename: 'etude.musicxml', instrument: 'clarinet-bb' });

  assert.equal(pack.files.length, 2);
  assert.equal(pack.manifest.instrument, 'clarinet-bb');
  assert.match(pack.files[0].name, /etude\.practice\.musicxml/);
  assert.match(pack.files[0].content, /<instrument-name>Clarinet in Bb<\/instrument-name>/);
  assert.match(pack.files[1].content, /^T:Export Matrix$/m);
});

test('practice pack export route returns a manifest and generated files', async () => {
  const req = new NextRequest('http://localhost/api/export-practice-pack', {
    method: 'POST',
    body: JSON.stringify({ xml: EXPORT_XML, filename: 'etude.musicxml' }),
    headers: { 'Content-Type': 'application/json' },
  });

  const res = await exportPracticePackPost(req);
  assert.equal(res.status, 200);
  const data = await res.json();
  assert.equal(data.files.length, 2);
  assert.equal(data.manifest.title, 'etude practice pack');
});
