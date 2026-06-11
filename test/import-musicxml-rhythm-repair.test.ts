import test from 'node:test';
import assert from 'node:assert/strict';
import { importMusicXmlToCore } from '../src/musicxml-adapter/import/import-musicxml.ts';
import { exportCoreToMusicXml } from '../src/musicxml-adapter/export/export-core-to-musicxml.ts';
import { validateScoreDocument } from '../src/score-core/validation/validate-score-document.ts';

const SPARSE_VOICE_XML = `<?xml version="1.0" encoding="UTF-8"?>
<score-partwise version="3.1">
  <part-list>
    <score-part id="P1"><part-name>Piano</part-name></score-part>
  </part-list>
  <part id="P1">
    <measure number="1">
      <attributes>
        <divisions>4</divisions>
        <key><fifths>0</fifths></key>
        <time><beats>4</beats><beat-type>4</beat-type></time>
        <clef><sign>G</sign><line>2</line></clef>
      </attributes>
      <note>
        <pitch><step>C</step><octave>4</octave></pitch>
        <duration>8</duration>
        <voice>1</voice>
        <type>half</type>
      </note>
      <backup><duration>8</duration></backup>
      <forward><duration>12</duration></forward>
      <note>
        <pitch><step>G</step><octave>4</octave></pitch>
        <duration>4</duration>
        <voice>2</voice>
        <type>quarter</type>
      </note>
    </measure>
  </part>
</score-partwise>`;

const OVERLONG_MEASURE_REST_XML = `<?xml version="1.0" encoding="UTF-8"?>
<score-partwise version="3.1">
  <part-list>
    <score-part id="P1"><part-name>Piano</part-name></score-part>
  </part-list>
  <part id="P1">
    <measure number="1">
      <attributes>
        <divisions>4</divisions>
        <time><beats>4</beats><beat-type>4</beat-type></time>
      </attributes>
      <note>
        <rest measure="yes"/>
        <duration>18</duration>
        <voice>1</voice>
      </note>
    </measure>
  </part>
</score-partwise>`;

test('MusicXML import repairs sparse voices with hidden rests while preserving cursor placement', () => {
  const core = importMusicXmlToCore(SPARSE_VOICE_XML);
  const measure = core.score.parts[0].staves[0].measures[0];
  const voice1 = measure.voices.find((voice) => voice.voiceId === 1)!;
  const voice2 = measure.voices.find((voice) => voice.voiceId === 2)!;

  assert.deepEqual(
    voice1.events.map((event) => `${event.kind}:${event.timestampNum}:${event.durationDivisions}:${event.hidden ? 'hidden' : 'visible'}`),
    ['note:0:8:visible', 'rest:8:8:hidden'],
  );
  assert.deepEqual(
    voice2.events.map((event) => `${event.kind}:${event.timestampNum}:${event.durationDivisions}:${event.hidden ? 'hidden' : 'visible'}`),
    ['rest:0:12:hidden', 'note:12:4:visible'],
  );
  assert.equal(validateScoreDocument(core).filter((diagnostic) => [
    'measure_balance',
    'voice_rhythm_sum_mismatch',
    'voice_timeline_gap',
    'voice_duration_mismatch',
    'multi_voice_rhythm_gap',
  ].includes(diagnostic.code)).length, 0);

  const exported = exportCoreToMusicXml(SPARSE_VOICE_XML, core);
  assert.match(exported, /<note print-object="no">/);
});

test('MusicXML import clamps overlong full-measure rests to the active meter', () => {
  const core = importMusicXmlToCore(OVERLONG_MEASURE_REST_XML);
  const event = core.score.parts[0].staves[0].measures[0].voices[0].events[0];

  assert.equal(event.kind, 'rest');
  assert.equal(event.durationDivisions, 16);
  assert.equal(validateScoreDocument(core).filter((diagnostic) => [
    'measure_balance',
    'voice_rhythm_sum_mismatch',
    'voice_timeline_gap',
  ].includes(diagnostic.code)).length, 0);
});
