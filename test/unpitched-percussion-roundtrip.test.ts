import test from 'node:test';
import assert from 'node:assert/strict';
import { DOMParser } from '@xmldom/xmldom';

import { importMusicXmlToCore } from '../src/musicxml-adapter/import/import-musicxml.ts';
import { exportCoreToMusicXml } from '../src/musicxml-adapter/export/export-core-to-musicxml.ts';
import { inspectResolvedEditTarget } from '../src/score-input/note-entry-validator.ts';
import { isPercussionStaffAtMeasure } from '../src/score-input/staff-pitch.ts';

const DRUM_XML = `<?xml version="1.0" encoding="UTF-8"?>
<score-partwise version="3.1">
  <part-list>
    <score-part id="P1">
      <part-name>Drums</part-name>
      <score-instrument id="P1-I36"><instrument-name>Kick</instrument-name></score-instrument>
      <score-instrument id="P1-I43"><instrument-name>Hi-hat</instrument-name></score-instrument>
    </score-part>
  </part-list>
  <part id="P1">
    <measure number="1">
      <attributes>
        <divisions>1</divisions>
        <time><beats>4</beats><beat-type>4</beat-type></time>
        <clef><sign>percussion</sign><line>2</line></clef>
      </attributes>
      <note>
        <unpitched><display-step>F</display-step><display-octave>4</display-octave></unpitched>
        <duration>1</duration>
        <instrument id="P1-I36"/>
        <voice>1</voice>
        <type>quarter</type>
      </note>
      <note>
        <chord/>
        <unpitched><display-step>G</display-step><display-octave>5</display-octave></unpitched>
        <duration>1</duration>
        <instrument id="P1-I43"/>
        <voice>1</voice>
        <type>quarter</type>
        <notehead>x</notehead>
      </note>
      <note>
        <rest/>
        <duration>2</duration>
        <voice>1</voice>
        <type>half</type>
      </note>
    </measure>
  </part>
</score-partwise>`;

function roundtrip() {
  const exported = exportCoreToMusicXml(DRUM_XML, importMusicXmlToCore(DRUM_XML));
  return new DOMParser().parseFromString(exported, 'application/xml');
}

test('unpitched percussion notes survive import and export instead of becoming rests', () => {
  const out = roundtrip();
  const notes = Array.from(out.getElementsByTagName('note'));
  assert.equal(notes.length, 3);
  const unpitched = notes.filter((note) => note.getElementsByTagName('unpitched').length > 0);
  assert.equal(unpitched.length, 2);
  const rests = notes.filter((note) => note.getElementsByTagName('rest').length > 0);
  assert.equal(rests.length, 1, 'only the genuine rest stays a rest');
});

test('unpitched display position, instrument link, notehead and chord flag are preserved', () => {
  const out = roundtrip();
  const [kick, hat] = Array.from(out.getElementsByTagName('note'));
  assert.equal(kick!.getElementsByTagName('display-step')[0]?.textContent, 'F');
  assert.equal(kick!.getElementsByTagName('display-octave')[0]?.textContent, '4');
  assert.equal(kick!.getElementsByTagName('instrument')[0]?.getAttribute('id'), 'P1-I36');
  assert.equal(hat!.getElementsByTagName('chord').length, 1);
  assert.equal(hat!.getElementsByTagName('instrument')[0]?.getAttribute('id'), 'P1-I43');
  assert.equal(hat!.getElementsByTagName('notehead')[0]?.textContent, 'x');
});

test('instrument elements on pitched notes are preserved as well', () => {
  const xml = DRUM_XML
    .replace(/<clef>.*?<\/clef>/, '<clef><sign>G</sign><line>2</line></clef>')
    .replace(
      /<unpitched><display-step>F<\/display-step><display-octave>4<\/display-octave><\/unpitched>/,
      '<pitch><step>F</step><octave>4</octave></pitch>',
    );
  const out = new DOMParser().parseFromString(
    exportCoreToMusicXml(xml, importMusicXmlToCore(xml)),
    'application/xml',
  );
  const first = out.getElementsByTagName('note')[0]!;
  assert.equal(first.getElementsByTagName('instrument')[0]?.getAttribute('id'), 'P1-I36');
});

test('pointer pitch entry on a percussion staff fails closed with a diagnostic', () => {
  const coreDocument = importMusicXmlToCore(DRUM_XML);
  const measure = coreDocument.score.parts[0]!.staves[0]!.measures[0]!;
  const inspected = inspectResolvedEditTarget({
    coreDocument,
    target: {
      source: 'pointer',
      mode: 'replace',
      measureId: measure.id,
      corePartId: coreDocument.score.parts[0]!.id,
      measureNumber: 1,
      staffIndex: 1,
      voiceId: 1,
      timestampNum: 0,
      timestampDen: 4,
      ratio: 0,
      domX: 100,
      step: 'E',
      octave: 4,
      alter: 0,
      diagnostics: [],
    },
    durationType: 'quarter',
    isDotted: false,
  });
  assert.equal(inspected.target, null);
  assert.equal(inspected.rejectionReason, 'percussion-staff-pitch-entry-unsupported');
});

test('a pitched staff is not mistaken for a percussion staff', () => {
  const xml = DRUM_XML.replace(/<clef>.*?<\/clef>/, '<clef><sign>G</sign><line>2</line></clef>');
  const coreDocument = importMusicXmlToCore(xml);
  assert.equal(isPercussionStaffAtMeasure(coreDocument, 1, 1), false);
  assert.equal(isPercussionStaffAtMeasure(importMusicXmlToCore(DRUM_XML), 1, 1), true);
});
