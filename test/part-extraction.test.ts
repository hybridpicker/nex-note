import test from 'node:test';
import assert from 'node:assert/strict';

import { buildExtractedPartFilename, extractPartMusicXml } from '../lib/part-extraction.ts';

const MULTI_PART_XML = `<?xml version="1.0" encoding="UTF-8"?>
<score-partwise version="3.1">
  <work><work-title>Ensemble</work-title></work>
  <part-list>
    <score-part id="P1"><part-name>Flute</part-name></score-part>
    <score-part id="P2"><part-name>Clarinet</part-name></score-part>
  </part-list>
  <part id="P1">
    <measure number="1">
      <attributes>
        <divisions>1</divisions>
        <time><beats>4</beats><beat-type>4</beat-type></time>
      </attributes>
      <note><pitch><step>C</step><octave>5</octave></pitch><duration>1</duration><voice>1</voice><type>quarter</type></note>
    </measure>
  </part>
  <part id="P2">
    <measure number="1">
      <attributes>
        <divisions>1</divisions>
        <time><beats>4</beats><beat-type>4</beat-type></time>
      </attributes>
      <note><pitch><step>G</step><octave>4</octave></pitch><duration>1</duration><voice>1</voice><type>quarter</type></note>
    </measure>
  </part>
</score-partwise>`;

test('extractPartMusicXml keeps only the requested score-part and part content', () => {
  const extracted = extractPartMusicXml(MULTI_PART_XML, 'P2');

  assert.match(extracted, /<score-part id="P2">/);
  assert.doesNotMatch(extracted, /<score-part id="P1">/);
  assert.match(extracted, /<part id="P2">/);
  assert.doesNotMatch(extracted, /<part id="P1">/);
  assert.match(extracted, /<step>G<\/step>/);
  assert.doesNotMatch(extracted, /<step>C<\/step>/);
});

test('extractPartMusicXml throws for unknown parts', () => {
  assert.throws(() => extractPartMusicXml(MULTI_PART_XML, 'P9'), /Part P9 was not found/);
});

test('buildExtractedPartFilename appends a normalized part name', () => {
  assert.equal(buildExtractedPartFilename('ensemble.musicxml', 'Clarinet in Bb'), 'ensemble-Clarinet-in-Bb.musicxml');
  assert.equal(buildExtractedPartFilename('score', ' Alto Sax '), 'score-Alto-Sax.musicxml');
});
