import test from 'node:test';
import assert from 'node:assert/strict';
import { normalizeScoreCommands } from '../src/shared/schemas/score-command.ts';
import { CommandValidationError } from '../src/shared/errors/command-errors.ts';
import { importMusicXmlToCore } from '../src/musicxml-adapter/import/import-musicxml.ts';
import { exportCoreToMusicXml } from '../src/musicxml-adapter/export/export-core-to-musicxml.ts';
import { applyDocumentCommands, buildDocumentState, buildDocumentStateFromCore } from '../src/score-core/commands/apply-document-commands.ts';
import { DOCUMENT_DIAGNOSTIC_LEVELS, validateScoreDocument } from '../src/score-core/validation/validate-score-document.ts';
import { parseIntentJSON } from '../src/nex-note/intent/parse-intent-json.ts';
import { extractNotePitchSnapshot } from '../lib/note-editor.ts';

const SAMPLE_XML = `<?xml version="1.0" encoding="UTF-8"?>
<score-partwise version="3.1">
  <work><work-title>Test Score</work-title></work>
  <identification><creator type="composer">Test Composer</creator></identification>
  <part-list>
    <score-part id="P1"><part-name>Piano</part-name></score-part>
  </part-list>
  <part id="P1">
    <measure number="1">
      <attributes>
        <divisions>1</divisions>
        <key><fifths>0</fifths></key>
        <time><beats>4</beats><beat-type>4</beat-type></time>
        <clef><sign>G</sign><line>2</line></clef>
      </attributes>
      <note>
        <pitch><step>C</step><octave>4</octave></pitch>
        <duration>1</duration>
        <voice>1</voice>
        <type>quarter</type>
        <staff>1</staff>
      </note>
    </measure>
  </part>
</score-partwise>`;

const FULL_REST_XML = `<?xml version="1.0" encoding="UTF-8"?>
<score-partwise version="3.1">
  <part-list>
    <score-part id="P1"><part-name>Piano</part-name></score-part>
  </part-list>
  <part id="P1">
    <measure number="1">
      <attributes>
        <divisions>1</divisions>
        <time><beats>4</beats><beat-type>4</beat-type></time>
        <clef><sign>G</sign><line>2</line></clef>
      </attributes>
      <note>
        <rest measure="yes"/>
        <duration>4</duration>
        <voice>1</voice>
        <type>whole</type>
        <staff>1</staff>
      </note>
    </measure>
  </part>
</score-partwise>`;

const PLACEHOLDER_CREDIT_XML = `<?xml version="1.0" encoding="UTF-8"?>
<score-partwise version="3.1">
  <credit page="1">
    <credit-type>title</credit-type>
    <credit-words default-x="595" default-y="1580">Title</credit-words>
  </credit>
  <credit page="1">
    <credit-type>subtitle</credit-type>
    <credit-words default-x="595" default-y="1515">Subtitle</credit-words>
  </credit>
  <credit page="1">
    <credit-type>composer</credit-type>
    <credit-words default-x="1090" default-y="1515">Composer</credit-words>
  </credit>
  <identification><creator type="composer">Composer</creator></identification>
  <part-list>
    <score-part id="P1"><part-name>Piano</part-name></score-part>
  </part-list>
  <part id="P1">
    <measure number="1">
      <attributes>
        <divisions>1</divisions>
        <time><beats>4</beats><beat-type>4</beat-type></time>
        <clef><sign>G</sign><line>2</line></clef>
      </attributes>
      <note>
        <rest measure="yes"/>
        <duration>4</duration>
        <voice>1</voice>
        <type>whole</type>
      </note>
    </measure>
  </part>
</score-partwise>`;

const REDUNDANT_CLEF_XML = `<?xml version="1.0" encoding="UTF-8"?>
<score-partwise version="3.1">
  <part-list>
    <score-part id="P1"><part-name>Piano</part-name></score-part>
  </part-list>
  <part id="P1">
    <measure number="1">
      <attributes>
        <divisions>1</divisions>
        <time><beats>4</beats><beat-type>4</beat-type></time>
        <clef><sign>G</sign><line>2</line></clef>
      </attributes>
      <note>
        <pitch><step>C</step><octave>4</octave></pitch>
        <duration>4</duration>
        <voice>1</voice>
        <type>whole</type>
        <staff>1</staff>
      </note>
    </measure>
    <measure number="2">
      <attributes>
        <clef><sign>G</sign><line>2</line></clef>
      </attributes>
      <note>
        <pitch><step>D</step><octave>4</octave></pitch>
        <duration>4</duration>
        <voice>1</voice>
        <type>whole</type>
        <staff>1</staff>
      </note>
    </measure>
  </part>
</score-partwise>`;

const MULTI_PART_XML = `<?xml version="1.0" encoding="UTF-8"?>
<score-partwise version="3.1">
  <part-list>
    <score-part id="P1"><part-name>Flute</part-name></score-part>
    <score-part id="P2"><part-name>Clarinet</part-name></score-part>
  </part-list>
  <part id="P1">
    <measure number="1">
      <attributes>
        <divisions>1</divisions>
        <time><beats>4</beats><beat-type>4</beat-type></time>
        <clef><sign>G</sign><line>2</line></clef>
      </attributes>
      <note>
        <pitch><step>C</step><octave>5</octave></pitch>
        <duration>4</duration>
        <voice>1</voice>
        <type>whole</type>
        <staff>1</staff>
      </note>
    </measure>
  </part>
  <part id="P2">
    <measure number="1">
      <attributes>
        <divisions>1</divisions>
        <time><beats>4</beats><beat-type>4</beat-type></time>
        <clef><sign>G</sign><line>2</line></clef>
      </attributes>
      <note>
        <pitch><step>G</step><octave>4</octave></pitch>
        <duration>4</duration>
        <voice>1</voice>
        <type>whole</type>
        <staff>1</staff>
      </note>
    </measure>
  </part>
</score-partwise>`;

const MULTI_PART_TWO_MEASURE_XML = `<?xml version="1.0" encoding="UTF-8"?>
<score-partwise version="3.1">
  <part-list>
    <score-part id="P1"><part-name>Flute</part-name></score-part>
    <score-part id="P2"><part-name>Clarinet</part-name></score-part>
  </part-list>
  <part id="P1">
    <measure number="1">
      <attributes>
        <divisions>1</divisions>
        <time><beats>4</beats><beat-type>4</beat-type></time>
        <clef><sign>G</sign><line>2</line></clef>
      </attributes>
      <note>
        <pitch><step>C</step><octave>5</octave></pitch>
        <duration>4</duration>
        <voice>1</voice>
        <type>whole</type>
        <staff>1</staff>
      </note>
    </measure>
    <measure number="2">
      <note>
        <pitch><step>D</step><octave>5</octave></pitch>
        <duration>4</duration>
        <voice>1</voice>
        <type>whole</type>
        <staff>1</staff>
      </note>
    </measure>
  </part>
  <part id="P2">
    <measure number="1">
      <attributes>
        <divisions>1</divisions>
        <time><beats>4</beats><beat-type>4</beat-type></time>
        <clef><sign>G</sign><line>2</line></clef>
      </attributes>
      <note>
        <pitch><step>G</step><octave>4</octave></pitch>
        <duration>4</duration>
        <voice>1</voice>
        <type>whole</type>
        <staff>1</staff>
      </note>
    </measure>
    <measure number="2">
      <note>
        <pitch><step>A</step><octave>4</octave></pitch>
        <duration>4</duration>
        <voice>1</voice>
        <type>whole</type>
        <staff>1</staff>
      </note>
    </measure>
  </part>
</score-partwise>`;

test('normalizeScoreCommands adds schema metadata for legacy commands', () => {
  const [command] = normalizeScoreCommands([{ type: 'setTempo', bpm: 120 }]);
  assert.equal(command.schemaVersion, 1);
  assert.equal(command.category, 'content');
  assert.equal(command.target.scope, 'document');
  assert.deepEqual(command.payload, { bpm: 120 });
});

test('normalizeScoreCommands rejects invalid command payloads', () => {
  assert.throws(
    () => normalizeScoreCommands([{ type: 'setTempo', bpm: 0 }]),
    (error: unknown) => error instanceof CommandValidationError && error.issues.some((issue) => issue.includes('bpm')),
  );
});

test('normalizeScoreCommands accepts only supported collision spacing policies', () => {
  assert.doesNotThrow(() => normalizeScoreCommands([{
    type: 'setMeasureLayoutHint',
    measureNumber: 1,
    hint: 'collisionPolicy',
    value: 'open',
  }]));
  assert.throws(
    () => normalizeScoreCommands([{
      type: 'setMeasureLayoutHint',
      measureNumber: 1,
      hint: 'collisionPolicy',
      value: 'maximum',
    }]),
    (error: unknown) => error instanceof CommandValidationError
      && error.issues.some((issue) => issue.includes('collisionPolicy')),
  );
});

test('normalizeScoreCommands accepts pickup measure (measureNumber 0) for note-locator commands', () => {
  const locator = { measureNumber: 0, staffIndex: 1, voiceId: 1, timestampNum: 0, timestampDen: 8 };

  assert.doesNotThrow(() => normalizeScoreCommands([{ type: 'transposeChromatic', semitones: 1, ...locator }]));
  assert.doesNotThrow(() => normalizeScoreCommands([{ type: 'insertNoteAt', step: 'B', octave: 4, alter: 0, durationType: 'eighth', ...locator }]));
  assert.doesNotThrow(() => normalizeScoreCommands([{ type: 'insertRestAt', durationType: 'eighth', ...locator }]));
  assert.doesNotThrow(() => normalizeScoreCommands([{ type: 'replaceWithRest', durationType: 'eighth', ...locator }]));
});

test('normalizeScoreCommands rejects measureNumber below 0', () => {
  const locator = { measureNumber: -1, staffIndex: 1, voiceId: 1, timestampNum: 0, timestampDen: 8 };
  assert.throws(
    () => normalizeScoreCommands([{ type: 'transposeChromatic', semitones: 1, ...locator }]),
    (error: unknown) => error instanceof CommandValidationError && error.issues.some((issue) => issue.includes('measureNumber')),
  );
});

test('importMusicXmlToCore normalizes MuseScore implicit measure 0 pickups to positive core measures', () => {
  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<score-partwise version="4.0">
  <part-list>
    <score-part id="P1"><part-name>Piano</part-name></score-part>
  </part-list>
  <part id="P1">
    <measure number="0" implicit="yes">
      <attributes>
        <divisions>2</divisions>
        <time><beats>6</beats><beat-type>8</beat-type></time>
        <clef><sign>G</sign><line>2</line></clef>
      </attributes>
      <note><pitch><step>G</step><octave>4</octave></pitch><duration>2</duration><voice>1</voice><type>eighth</type><staff>1</staff></note>
      <note><pitch><step>A</step><octave>4</octave></pitch><duration>2</duration><voice>1</voice><type>eighth</type><staff>1</staff></note>
    </measure>
    <measure number="1">
      <note><rest/><duration>6</duration><voice>1</voice><type>half</type><dot/><staff>1</staff></note>
    </measure>
  </part>
</score-partwise>`;

  const core = importMusicXmlToCore(xml);
  const [pickup, firstFullMeasure] = core.score.parts[0].staves[0].measures;
  assert.equal(pickup?.measureNumber, 1);
  assert.equal(pickup?.sourceMeasureNumber, 0);
  assert.equal(pickup?.implicit, true);
  assert.equal(firstFullMeasure?.measureNumber, 2);
  assert.equal(firstFullMeasure?.sourceMeasureNumber, 1);

  const diagnostics = validateScoreDocument(core);
  assert.deepEqual(
    diagnostics
      .filter((entry) => ['invalid_measure_number', 'measure_balance', 'voice_rhythm_sum_mismatch', 'voice_timeline_gap'].includes(entry.code))
      .map((entry) => entry.message),
    [],
  );

  const exported = exportCoreToMusicXml(xml, core);
  assert.match(exported, /<measure number="1" implicit="yes"/);
  assert.doesNotMatch(exported, /<measure number="0"/);

  const reimported = importMusicXmlToCore(exported);
  assert.equal(reimported.score.parts[0].staves[0].measures[0]?.measureNumber, 1);
  assert.deepEqual(
    validateScoreDocument(reimported)
      .filter((entry) => ['invalid_measure_number', 'measure_balance', 'voice_rhythm_sum_mismatch', 'voice_timeline_gap'].includes(entry.code))
      .map((entry) => entry.message),
    [],
  );
});

test('importMusicXmlToCore builds a minimal score document model', () => {
  const core = importMusicXmlToCore(SAMPLE_XML);
  assert.equal(core.metadata.title, 'Test Score');
  assert.equal(core.metadata.composer, 'Test Composer');
  assert.equal(core.score.parts.length, 1);
  assert.equal(core.score.parts[0].staves[0].measures[0].voices[0].events[0].kind, 'note');
});

test('importMusicXmlToCore inherits divisions for timestamps after the attributes measure', () => {
  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<score-partwise version="3.1">
  <part-list>
    <score-part id="P1"><part-name>Piano</part-name></score-part>
  </part-list>
  <part id="P1">
    <measure number="1">
      <attributes>
        <divisions>8</divisions>
        <time><beats>2</beats><beat-type>4</beat-type></time>
        <clef><sign>G</sign><line>2</line></clef>
      </attributes>
      <note><rest/><duration>16</duration><voice>1</voice><type>half</type><staff>1</staff></note>
    </measure>
    <measure number="2">
      <note><pitch><step>E</step><octave>4</octave></pitch><duration>8</duration><voice>1</voice><type>quarter</type><staff>1</staff></note>
      <note><pitch><step>F</step><octave>4</octave></pitch><duration>8</duration><voice>1</voice><type>quarter</type><staff>1</staff></note>
    </measure>
  </part>
</score-partwise>`;
  const voice = importMusicXmlToCore(xml).score.parts[0]?.staves[0]?.measures[1]?.voices[0];
  assert.equal(voice?.events[0]?.timestampDen, 32);
  assert.equal(voice?.events[1]?.timestampNum, 8);
  assert.equal(voice?.events[1]?.timestampDen, 32);
});

test('validateScoreDocument inherits divisions through later partial attributes', () => {
  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<score-partwise version="3.1">
  <part-list>
    <score-part id="P1"><part-name>Piano</part-name></score-part>
  </part-list>
  <part id="P1">
    <measure number="1">
      <attributes>
        <divisions>4</divisions>
        <time><beats>4</beats><beat-type>4</beat-type></time>
        <clef><sign>G</sign><line>2</line></clef>
      </attributes>
      <note><rest/><duration>16</duration><voice>1</voice><type>whole</type><staff>1</staff></note>
    </measure>
    <measure number="2">
      <attributes>
        <clef><sign>G</sign><line>2</line></clef>
      </attributes>
      <note><pitch><step>C</step><octave>4</octave></pitch><duration>4</duration><voice>1</voice><type>quarter</type><staff>1</staff></note>
      <note><rest/><duration>12</duration><voice>1</voice><type>half</type><dot/><staff>1</staff></note>
    </measure>
  </part>
</score-partwise>`;

  const diagnostics = validateScoreDocument(importMusicXmlToCore(xml));
  assert.ok(!diagnostics.some((entry) => entry.code === 'event_duration_notation_mismatch'));
  assert.ok(!diagnostics.some((entry) => entry.code === 'measure_balance'));
});

test('applyDocumentCommands returns updated xml and refreshed core document', () => {
  const result = applyDocumentCommands(buildDocumentState(SAMPLE_XML), [{ type: 'setTitle', title: 'Updated Title' }]);
  assert.match(result.xml, /Updated Title/);
  assert.equal(result.coreDocument?.metadata.title, 'Updated Title');
  assert.equal(result.appliedCommands[0].schemaVersion, 1);
  assert.equal(result.diagnostics[0]?.code, 'core_execution');
});

test('applyDocumentCommands allows clearing score metadata text', () => {
  const result = applyDocumentCommands(buildDocumentState(SAMPLE_XML), [
    { type: 'setTitle', title: '' },
    { type: 'setComposer', composer: '' },
  ]);

  assert.doesNotMatch(result.xml, /Updated Title|Test Composer/);
  assert.ok(!result.coreDocument?.metadata.title);
  assert.ok(!result.coreDocument?.metadata.composer);
});

test('score metadata ignores and removes setup placeholders when no concrete text exists', () => {
  const state = buildDocumentState(PLACEHOLDER_CREDIT_XML);
  assert.ok(!state.coreDocument?.metadata.title);
  assert.ok(!state.coreDocument?.metadata.subtitle);
  assert.ok(!state.coreDocument?.metadata.composer);

  const result = applyDocumentCommands(state, [{ type: 'setTempo', bpm: 96 }]);
  assert.doesNotMatch(result.xml, />Title</);
  assert.doesNotMatch(result.xml, />Subtitle</);
  assert.doesNotMatch(result.xml, />Composer</);
  assert.ok(!result.coreDocument?.metadata.title);
  assert.ok(!result.coreDocument?.metadata.subtitle);
  assert.ok(!result.coreDocument?.metadata.composer);
});

test('applyDocumentCommands executes fully migrated commands through the core path', () => {
  const result = applyDocumentCommands(buildDocumentState(SAMPLE_XML), [
    { type: 'setTimeSignature', beats: 3, beatType: 4, measureNumber: 1 },
    { type: 'setTempo', bpm: 120 },
  ]);

  assert.match(result.xml, /<beats>3<\/beats>/);
  assert.match(result.xml, /tempo="120"/);
  assert.equal(result.coreDocument?.score.parts[0].staves[0].measures[0].attributes[0]?.time?.beats, 3);
  assert.ok(result.diagnostics.some((entry) => entry.code === 'core_execution'));
  assert.ok(!result.diagnostics.some((entry) => entry.code === 'legacy_fallback'));
});

test('applyDocumentCommands executes tempo through the core path', () => {
  const result = applyDocumentCommands(buildDocumentState(SAMPLE_XML), [{ type: 'setTempo', bpm: 144 }]);
  assert.match(result.xml, /tempo="144"/);
  assert.ok(result.diagnostics.some((entry) => entry.code === 'core_execution'));
  assert.ok(!result.diagnostics.some((entry) => entry.code === 'legacy_fallback'));
});

test('applyDocumentCommands routes insertNoteAt through the core path when unsafe roundtrip tags are present', () => {
  const unsafeXml = SAMPLE_XML.replace('<attributes>', '<attributes><staff-details><staff-lines>5</staff-lines></staff-details>');
  const result = applyDocumentCommands(buildDocumentState(unsafeXml), [{
    type: 'insertNoteAt',
    measureNumber: 1,
    staffIndex: 1,
    voiceId: 1,
    timestampNum: 1,
    timestampDen: 4,
    step: 'A',
    octave: 4,
    alter: 0,
    durationType: 'quarter',
    isDotted: false,
    preserveOverflow: true,
  }]);

  assert.notEqual(result.xml, unsafeXml);
  assert.match(result.xml, /<staff-details><staff-lines>5<\/staff-lines><\/staff-details>/);
  assert.ok(!result.diagnostics.some((entry) => entry.code === 'legacy_fallback'));
});

test('applyDocumentCommands can set harmony through the legacy fallback path when unsafe roundtrip tags are present', () => {
  const unsafeXml = SAMPLE_XML.replace('<attributes>', '<attributes><staff-details><staff-lines>5</staff-lines></staff-details>');
  const result = applyDocumentCommands(buildDocumentState(unsafeXml), [{
    type: 'setHarmonyAt',
    value: 'Fm7',
    measureNumber: 1,
    staffIndex: 1,
    timestampNum: 0,
    timestampDen: 3840,
  }]);

  assert.notEqual(result.xml, unsafeXml);
  assert.match(result.xml, /<staff-details><staff-lines>5<\/staff-lines><\/staff-details>/);
  assert.match(result.xml, /<harmony><root><root-step>F<\/root-step><\/root><kind text="m7">minor-seventh<\/kind><\/harmony>/);
  assert.ok(result.diagnostics.some((entry) => entry.code === 'legacy_fallback'));

  const majorResult = applyDocumentCommands(buildDocumentState(unsafeXml), [{
    type: 'setHarmonyAt',
    value: 'C',
    measureNumber: 1,
    staffIndex: 1,
    timestampNum: 0,
    timestampDen: 3840,
  }]);
  assert.match(majorResult.xml, /<harmony><root><root-step>C<\/root-step><\/root><kind>major<\/kind><\/harmony>/);
});

test('legacy fallback addChords replaces existing chord symbols with full chord quality', () => {
  const unsafeXml = SAMPLE_XML
    .replace('<attributes>', '<attributes><staff-details><staff-lines>5</staff-lines></staff-details>')
    .replace(
      '<note>',
      '<harmony><root><root-step>G</root-step></root></harmony><harmony><root><root-step>A</root-step></root><kind text="7">dominant</kind><offset>1</offset></harmony><note>',
    );
  const result = applyDocumentCommands(buildDocumentState(unsafeXml), [{
    type: 'addChords',
    chords: '1:Gmaj7',
  }]);

  assert.ok(result.diagnostics.some((entry) => entry.code === 'legacy_fallback'));
  assert.equal((result.xml.match(/<harmony>/g) ?? []).length, 1);
  assert.match(result.xml, /<harmony><root><root-step>G<\/root-step><\/root><kind text="maj7">major-seventh<\/kind><\/harmony>/);
  assert.doesNotMatch(result.xml, /<kind text="7">dominant<\/kind>/);
});

test('legacy fallback insertMeasureAfter inserts blank measures and renumbers later measures', () => {
  const unsafeXml = SAMPLE_XML
    .replace('<attributes>', '<attributes><staff-details><staff-lines>5</staff-lines></staff-details>')
    .replace('</part>', '<measure number="2"><note><pitch><step>D</step><octave>4</octave></pitch><duration>4</duration><voice>1</voice><type>whole</type><staff>1</staff></note></measure></part>');
  const result = applyDocumentCommands(buildDocumentState(unsafeXml), [{
    type: 'insertMeasureAfter',
    measureNumber: 1,
  }]);

  assert.ok(result.diagnostics.some((entry) => entry.code === 'legacy_fallback'));
  assert.deepEqual(Array.from(result.xml.matchAll(/<measure number="([^"]+)"/g)).map((match) => match[1]), ['1', '2', '3']);
  const insertedMeasure = /<measure number="2">([\s\S]*?)<\/measure>/.exec(result.xml)?.[1] ?? '';
  assert.doesNotMatch(insertedMeasure, /<note>/);
  assert.doesNotMatch(insertedMeasure, /<harmony>/);
});

test('applyDocumentCommands keeps safe transpose-key edits on the core path when staff details are present', () => {
  const xmlWithStaffDetails = SAMPLE_XML.replace('<attributes>', '<attributes><staff-details><staff-lines>5</staff-lines></staff-details>');
  const result = applyDocumentCommands(buildDocumentState(xmlWithStaffDetails), [
    { type: 'transposeDocumentChromatic', semitones: -4 },
    { type: 'setKey', fifths: -4 },
  ]);

  assert.match(result.xml, /<staff-details><staff-lines>5<\/staff-lines><\/staff-details>/);
  assert.match(result.xml, /<fifths>-4<\/fifths>/);
  assert.match(result.xml, /<step>A<\/step>/);
  assert.match(result.xml, /<alter>-1<\/alter>/);
  assert.ok(result.diagnostics.some((entry) => entry.code === 'core_execution'));
  assert.ok(!result.diagnostics.some((entry) => entry.code === 'legacy_fallback'));
});

test('note duration edits with staff details stay scoped on the core path', () => {
  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<score-partwise version="3.1">
  <part-list>
    <score-part id="P1"><part-name>Notation</part-name></score-part>
    <score-part id="P2"><part-name>TAB</part-name></score-part>
  </part-list>
  <part id="P1">
    <measure number="1">
      <attributes><divisions>2</divisions><time><beats>4</beats><beat-type>4</beat-type></time></attributes>
      <note><pitch><step>D</step><octave>4</octave></pitch><duration>1</duration><voice>1</voice><type>eighth</type><staff>1</staff></note>
    </measure>
  </part>
  <part id="P2">
    <measure number="1">
      <attributes><divisions>2</divisions><staff-details><staff-lines>6</staff-lines></staff-details><time><beats>4</beats><beat-type>4</beat-type></time></attributes>
      <note><pitch><step>D</step><octave>4</octave></pitch><duration>1</duration><voice>1</voice><type>eighth</type><staff>1</staff></note>
    </measure>
  </part>
</score-partwise>`;
  const result = applyDocumentCommands(buildDocumentState(xml), [{
    type: 'changeNoteDuration',
    coreEntityId: 'event:1:1:1:0:8:0',
    coreMeasureId: 'measure:P2:1:1',
    corePartId: 'part:P2',
    measureNumber: 1,
    staffIndex: 1,
    voiceId: 1,
    timestampNum: 0,
    timestampDen: 8,
    durationType: 'quarter',
    isDotted: false,
  }]);
  const parts = importMusicXmlToCore(result.xml).score.parts;

  assert.equal(parts[0]!.staves[0]!.measures[0]!.voices[0]!.events[0]!.durationType, 'eighth');
  assert.equal(parts[1]!.staves[0]!.measures[0]!.voices[0]!.events[0]!.durationType, 'quarter');
  assert.ok(result.diagnostics.some((entry) => entry.code === 'core_execution'));
  assert.ok(!result.diagnostics.some((entry) => entry.code === 'legacy_fallback'));
});

test('note duration edits with staff details fill released chord tails on the core path', () => {
  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<score-partwise version="3.1">
  <part-list>
    <part-group type="start" number="1"><group-symbol>brace</group-symbol></part-group>
    <score-part id="P1"><part-name>Guitar</part-name></score-part>
    <part-group type="stop" number="1"/>
  </part-list>
  <part id="P1">
    <measure number="1">
      <attributes>
        <divisions>1</divisions>
        <time><beats>4</beats><beat-type>4</beat-type></time>
        <staff-details><staff-lines>6</staff-lines></staff-details>
      </attributes>
      <note><pitch><step>C</step><octave>4</octave></pitch><duration>4</duration><voice>1</voice><type>whole</type><staff>1</staff></note>
      <note><chord/><pitch><step>E</step><octave>4</octave></pitch><duration>4</duration><voice>1</voice><type>whole</type><staff>1</staff></note>
      <note><chord/><pitch><step>G</step><octave>4</octave></pitch><duration>4</duration><voice>1</voice><type>whole</type><staff>1</staff></note>
    </measure>
  </part>
</score-partwise>`;
  const result = applyDocumentCommands(buildDocumentState(xml), [{
    type: 'changeNoteDuration',
    corePartId: 'part:P1',
    measureNumber: 1,
    staffIndex: 1,
    voiceId: 1,
    timestampNum: 0,
    timestampDen: 4,
    durationType: 'quarter',
    isDotted: false,
  }]);
  const events = result.coreDocument?.score.parts[0]!.staves[0]!.measures[0]!.voices[0]!.events ?? [];
  const restTail = events.find((event) => event.kind === 'rest' && event.timestampNum === 1);

  assert.equal(events.filter((event) => event.kind === 'note').length, 3);
  assert.equal(events.filter((event) => event.kind === 'note').every((event) => event.durationType === 'quarter'), true);
  assert.equal(restTail?.durationType, 'half');
  assert.equal(restTail?.isDotted, true);
  assert.equal(restTail?.durationDivisions, 3);
  assert.ok(result.diagnostics.some((entry) => entry.code === 'core_execution'));
  assert.ok(!result.diagnostics.some((entry) => entry.code === 'legacy_fallback'));
  assert.ok(!result.diagnostics.some((entry) => ['voice_rhythm_sum_mismatch', 'voice_timeline_gap'].includes(entry.code)));
});

test('applyDocumentCommands splits a full-measure rest correctly on scores with staff details', () => {
  const unsafeXml = FULL_REST_XML.replace('<attributes>', '<attributes><staff-details><staff-lines>5</staff-lines></staff-details>');
  const result = applyDocumentCommands(buildDocumentState(unsafeXml), [{
    type: 'insertNoteAt',
    measureNumber: 1,
    staffIndex: 1,
    voiceId: 1,
    timestampNum: 1,
    timestampDen: 4,
    step: 'C',
    octave: 4,
    alter: 0,
    durationType: 'quarter',
    isDotted: false,
  }]);

  const voice = importMusicXmlToCore(result.xml).score.parts[0]?.staves[0]?.measures[0]?.voices[0];
  assert.ok(voice);
  assert.deepEqual(
    voice.events.map((event) => (
      `${event.timestampNum}/${event.timestampDen}:${event.kind === 'note' ? `${event.pitch.step}${event.pitch.octave}` : 'rest'}:${event.durationDivisions}`
    )),
    ['0/4:rest:1', '1/4:C4:1', '2/4:rest:2'],
  );
  assert.match(result.xml, /<staff-details><staff-lines>5<\/staff-lines><\/staff-details>/);
  assert.ok(!result.diagnostics.some((entry) => entry.code === 'legacy_fallback'));
  assert.ok(!result.diagnostics.some((entry) => entry.code === 'measure_balance'));
});

test('insertNoteAt on staff-details scores keeps multi-voice measure balance and backups valid', () => {
  const unsafeXml = `<?xml version="1.0" encoding="UTF-8"?>
<score-partwise version="3.1">
  <part-list>
    <score-part id="P1"><part-name>Piano</part-name></score-part>
  </part-list>
  <part id="P1">
    <measure number="1">
      <attributes>
        <divisions>1</divisions>
        <staff-details><staff-lines>5</staff-lines></staff-details>
        <time><beats>4</beats><beat-type>4</beat-type></time>
      </attributes>
      <note><pitch><step>C</step><octave>4</octave></pitch><duration>4</duration><voice>1</voice><type>whole</type><staff>1</staff></note>
      <backup><duration>4</duration></backup>
      <note><rest measure="yes"/><duration>4</duration><voice>2</voice><type>whole</type><staff>1</staff></note>
    </measure>
  </part>
</score-partwise>`;
  const result = applyDocumentCommands(buildDocumentState(unsafeXml), [{
    type: 'insertNoteAt',
    measureNumber: 1,
    staffIndex: 1,
    voiceId: 2,
    timestampNum: 1,
    timestampDen: 4,
    step: 'E',
    octave: 4,
    alter: 0,
    durationType: 'quarter',
    isDotted: false,
  }]);

  const measure = importMusicXmlToCore(result.xml).score.parts[0]?.staves[0]?.measures[0];
  assert.ok(measure);
  assert.equal(measure.voices.length, 2);
  assert.deepEqual(
    measure.voices.map((voice) => voice.events.reduce((sum, event) => sum + (event.isChord ? 0 : event.durationDivisions), 0)),
    [4, 4],
  );
  assert.match(result.xml, /<backup><duration>4<\/duration><\/backup>/);
  assert.ok(!result.diagnostics.some((entry) => entry.code === 'legacy_fallback'));
  assert.ok(!result.diagnostics.some((entry) => ['measure_balance', 'voice_rhythm_sum_mismatch', 'voice_duration_mismatch', 'voice_timeline_gap'].includes(entry.code)));
});

test('applyDocumentCommands updates clef and part metadata through the core path', () => {
  const result = applyDocumentCommands(buildDocumentState(SAMPLE_XML), [
    { type: 'setClef', sign: 'F', line: 4, measureNumber: 1, staffIndex: 1 },
    { type: 'setPartName', partId: 'P1', name: 'Grand Piano' },
    { type: 'setInstrumentName', partId: 'P1', instrumentName: 'Piano Solo' },
  ]);

  assert.match(result.xml, /<sign>F<\/sign>/);
  assert.match(result.xml, /Grand Piano/);
  assert.match(result.xml, /Piano Solo/);
  assert.equal(result.coreDocument?.score.parts[0].name, 'Grand Piano');
  assert.equal(result.coreDocument?.score.parts[0].instrumentName, 'Piano Solo');
  assert.ok(result.diagnostics.some((entry) => entry.code === 'core_execution'));
});

test('setMeasureLayoutHint scoped by partId only updates the targeted part', () => {
  const result = applyDocumentCommands(buildDocumentState(MULTI_PART_XML), [
    { type: 'setMeasureLayoutHint', measureNumber: 1, partId: 'P2', hint: 'newPage', value: true },
  ]);

  assert.equal(result.coreDocument?.score.parts[0].staves[0].measures[0].print?.newPage, undefined);
  assert.equal(result.coreDocument?.score.parts[1].staves[0].measures[0].print?.newPage, true);
  assert.ok(result.diagnostics.some((entry) => entry.code === 'core_execution'));
});

test('part-scoped staff spacing presets can span multiple measures without touching other parts', () => {
  const result = applyDocumentCommands(buildDocumentState(MULTI_PART_TWO_MEASURE_XML), [
    { type: 'setMeasureLayoutHint', measureNumber: 1, partId: 'P1', hint: 'staffSpacing', value: 124 },
    { type: 'setMeasureLayoutHint', measureNumber: 2, partId: 'P1', hint: 'staffSpacing', value: 124 },
  ]);

  assert.equal(result.coreDocument?.layoutHints.filter((hint) => hint.kind === 'staffSpacing' && hint.partId === 'P1').length, 2);
  assert.equal(result.coreDocument?.layoutHints.filter((hint) => hint.kind === 'staffSpacing' && hint.partId === 'P2').length, 0);
  assert.ok(result.coreDocument?.layoutHints.every((hint) => (
    hint.kind !== 'staffSpacing'
    || hint.partId !== 'P1'
    || hint.value === 124
  )));
  assert.ok(result.diagnostics.some((entry) => entry.code === 'core_execution'));
});

test('applyDocumentCommands removes a redundant clef change and keeps the prior clef effective', () => {
  const result = applyDocumentCommands(buildDocumentState(REDUNDANT_CLEF_XML), [
    { type: 'removeClefChange', measureNumber: 2, staffIndex: 1 },
  ]);

  assert.ok(!result.xml.match(/<measure number="2">[\s\S]*?<clef>/));
  assert.equal(result.coreDocument?.score.parts[0].staves[0].measures[1].attributes[0]?.clefs.length ?? 0, 0);
  assert.ok(result.diagnostics.some((entry) => entry.code === 'core_execution'));
});

test('buildDocumentState returns validation diagnostics for structurally bad core data', () => {
  const badXml = SAMPLE_XML.replace('<beats>4</beats>', '<beats>0</beats>');
  const state = buildDocumentState(badXml);
  assert.ok(state.diagnostics.some((entry) => entry.code === 'invalid_time_signature'));
});

test('document validator exposes stable severity conventions for structural and semantic diagnostics', () => {
  assert.equal(DOCUMENT_DIAGNOSTIC_LEVELS.invalid_time_signature, 'error');
  assert.equal(DOCUMENT_DIAGNOSTIC_LEVELS.no_parts, 'error');
  assert.equal(DOCUMENT_DIAGNOSTIC_LEVELS.tie_continuity, 'warning');
  assert.equal(DOCUMENT_DIAGNOSTIC_LEVELS.multi_voice_rhythm_gap, 'warning');
  assert.equal(DOCUMENT_DIAGNOSTIC_LEVELS.voice_rhythm_sum_mismatch, 'warning');
  assert.equal(DOCUMENT_DIAGNOSTIC_LEVELS.event_duration_notation_mismatch, 'warning');
  assert.equal(DOCUMENT_DIAGNOSTIC_LEVELS.ending_without_repeat, 'warning');
  assert.equal(DOCUMENT_DIAGNOSTIC_LEVELS.dangling_slur, 'warning');
  assert.equal(DOCUMENT_DIAGNOSTIC_LEVELS.dangling_grace_note, 'warning');
  assert.equal(DOCUMENT_DIAGNOSTIC_LEVELS.dangling_beam, 'warning');
});

test('buildDocumentState reports measure-balance and voice-duration validation warnings', () => {
  const unbalancedXml = SAMPLE_XML.replace('<duration>1</duration>', '<duration>2</duration>');
  const state = buildDocumentState(unbalancedXml);
  assert.ok(state.diagnostics.some((entry) => entry.code === 'measure_balance'));
});

test('buildDocumentState reports rhythm-sum mismatches against the effective time signature', () => {
  const underfilledXml = `<?xml version="1.0" encoding="UTF-8"?>
<score-partwise version="3.1">
  <part-list>
    <score-part id="P1"><part-name>Piano</part-name></score-part>
  </part-list>
  <part id="P1">
    <measure number="1">
      <attributes>
        <divisions>4</divisions>
        <time><beats>4</beats><beat-type>4</beat-type></time>
        <clef><sign>G</sign><line>2</line></clef>
      </attributes>
      <note>
        <pitch><step>C</step><octave>4</octave></pitch>
        <duration>4</duration>
        <voice>1</voice>
        <type>quarter</type>
        <staff>1</staff>
      </note>
      <note>
        <pitch><step>D</step><octave>4</octave></pitch>
        <duration>4</duration>
        <voice>1</voice>
        <type>quarter</type>
        <staff>1</staff>
      </note>
      <note>
        <rest/>
        <duration>1</duration>
        <voice>1</voice>
        <type>16th</type>
        <staff>1</staff>
      </note>
    </measure>
  </part>
</score-partwise>`;

  const state = buildDocumentState(underfilledXml);
  const diagnostic = state.diagnostics.find((entry) => entry.code === 'voice_rhythm_sum_mismatch');
  assert.ok(diagnostic);
  assert.match(diagnostic.message, /9\/16 divisions/);
  assert.match(diagnostic.message, /4\/4 requires 16/);
});

test('buildDocumentState reports rhythm-sum mismatches for an eighth plus 64th rest in 4/4', () => {
  const shortRestXml = `<?xml version="1.0" encoding="UTF-8"?>
<score-partwise version="3.1">
  <part-list>
    <score-part id="P1"><part-name>Piano</part-name></score-part>
  </part-list>
  <part id="P1">
    <measure number="1">
      <attributes>
        <divisions>16</divisions>
        <time><beats>4</beats><beat-type>4</beat-type></time>
        <clef><sign>G</sign><line>2</line></clef>
      </attributes>
      <note>
        <pitch><step>C</step><octave>4</octave></pitch>
        <duration>8</duration>
        <voice>1</voice>
        <type>eighth</type>
        <staff>1</staff>
      </note>
      <note>
        <rest/>
        <duration>1</duration>
        <voice>1</voice>
        <type>64th</type>
        <staff>1</staff>
      </note>
    </measure>
  </part>
</score-partwise>`;

  const state = buildDocumentState(shortRestXml);
  const diagnostic = state.diagnostics.find((entry) => entry.code === 'voice_rhythm_sum_mismatch');
  assert.ok(diagnostic);
  assert.match(diagnostic.message, /9\/64 divisions/);
  assert.match(diagnostic.message, /4\/4 requires 64/);
});

test('buildDocumentState reports duration notation mismatches even when the measure duration fills 4/4', () => {
  const misleadingRestXml = `<?xml version="1.0" encoding="UTF-8"?>
<score-partwise version="3.1">
  <part-list>
    <score-part id="P1"><part-name>Piano</part-name></score-part>
  </part-list>
  <part id="P1">
    <measure number="1">
      <attributes>
        <divisions>16</divisions>
        <time><beats>4</beats><beat-type>4</beat-type></time>
        <clef><sign>G</sign><line>2</line></clef>
      </attributes>
      <note>
        <pitch><step>C</step><octave>4</octave></pitch>
        <duration>8</duration>
        <voice>1</voice>
        <type>eighth</type>
        <staff>1</staff>
      </note>
      <note>
        <rest/>
        <duration>56</duration>
        <voice>1</voice>
        <type>64th</type>
        <staff>1</staff>
      </note>
    </measure>
  </part>
</score-partwise>`;

  const state = buildDocumentState(misleadingRestXml);
  const diagnostic = validateScoreDocument(importMusicXmlToCore(misleadingRestXml))
    .find((entry) => entry.code === 'event_duration_notation_mismatch');
  assert.ok(diagnostic);
  assert.match(diagnostic.message, /rest@8\/64/);
  assert.match(diagnostic.message, /64th \(1 divisions\) but has 56 divisions/);
  assert.ok(!state.diagnostics.some((entry) => entry.code === 'event_duration_notation_mismatch'));
});

test('buildDocumentState normalizes imported non-representable rest spans', () => {
  const importedRestXml = `<?xml version="1.0" encoding="UTF-8"?>
<score-partwise version="3.1">
  <part-list>
    <score-part id="P1"><part-name>Piano</part-name></score-part>
  </part-list>
  <part id="P1">
    <measure number="1">
      <attributes>
        <divisions>8</divisions>
        <time><beats>4</beats><beat-type>4</beat-type></time>
        <clef><sign>G</sign><line>2</line></clef>
      </attributes>
      <note>
        <pitch><step>C</step><octave>4</octave></pitch>
        <duration>4</duration>
        <voice>1</voice>
        <type>eighth</type>
        <staff>1</staff>
      </note>
      <note>
        <rest/>
        <duration>28</duration>
        <voice>1</voice>
        <type>64th</type>
        <staff>1</staff>
      </note>
    </measure>
  </part>
</score-partwise>`;

  const state = buildDocumentState(importedRestXml);
  assert.ok(!state.diagnostics.some((entry) => entry.code === 'event_duration_notation_mismatch'));
  assert.ok(!state.diagnostics.some((entry) => entry.code === 'voice_rhythm_sum_mismatch'));
  const events = state.coreDocument?.score.parts[0]?.staves[0]?.measures[0]?.voices[0]?.events ?? [];
  assert.deepEqual(events.map((event) => event.durationDivisions), [4, 4, 8, 16]);
  assert.deepEqual(events.map((event) => event.durationType), ['eighth', 'eighth', 'quarter', 'half']);
  assert.ok(state.xml.includes('<duration>4</duration>'));
  assert.ok(!state.xml.includes('<duration>28</duration>'));
});

test('buildDocumentStateFromCore does not materialize empty voices as visible rests during normalization', () => {
  const baseline = buildDocumentState(FULL_REST_XML);
  const coreDocument = structuredClone(baseline.coreDocument);
  assert.ok(coreDocument);
  const part = coreDocument.score.parts[0];
  const sourceStaff = part?.staves[0];
  const sourceMeasure = sourceStaff?.measures[0];
  assert.ok(part);
  assert.ok(sourceStaff);
  assert.ok(sourceMeasure);
  part.staves.push({
    id: 'staff:P1:2',
    staffIndex: 2,
    measures: [{
      ...structuredClone(sourceMeasure),
      id: 'measure:P1:S2:1',
      attributes: [],
      voices: [{
        id: 'voice:P1:S2:1:1',
        voiceId: 1,
        events: [],
      }],
      directions: [],
    }],
  });
  const voice = sourceMeasure.voices[0];
  assert.ok(voice);
  voice.events = [];

  const state = buildDocumentStateFromCore(coreDocument, { sourceMusicXml: baseline.sourceMusicXml });
  assert.ok(state.diagnostics.some((entry) => entry.code === 'empty_voice'));
  assert.ok(!state.diagnostics.some((entry) => entry.code === 'measure_balance'));
  assert.ok(!state.diagnostics.some((entry) => entry.code === 'voice_rhythm_sum_mismatch'));
  assert.ok(!state.diagnostics.some((entry) => entry.code === 'voice_timeline_gap'));
  assert.equal(state.coreDocument?.score.parts[0]?.staves[0]?.measures[0]?.voices[0]?.events.length, 0);
  assert.equal(state.coreDocument?.score.parts[0]?.staves[1]?.measures[0]?.voices[0]?.events.length, 0);
});

test('deleteNote replaces a mismatched note span with valid rest fragments', () => {
  const mismatchedNoteXml = `<?xml version="1.0" encoding="UTF-8"?>
<score-partwise version="3.1">
  <part-list>
    <score-part id="P1"><part-name>Piano</part-name></score-part>
  </part-list>
  <part id="P1">
    <measure number="1">
      <attributes>
        <divisions>8</divisions>
        <time><beats>4</beats><beat-type>4</beat-type></time>
        <clef><sign>G</sign><line>2</line></clef>
      </attributes>
      <note>
        <pitch><step>C</step><octave>4</octave></pitch>
        <duration>4</duration>
        <voice>1</voice>
        <type>eighth</type>
        <staff>1</staff>
      </note>
      <note>
        <pitch><step>D</step><octave>4</octave></pitch>
        <duration>28</duration>
        <voice>1</voice>
        <type>64th</type>
        <staff>1</staff>
      </note>
    </measure>
  </part>
</score-partwise>`;

  const result = applyDocumentCommands(buildDocumentState(mismatchedNoteXml), [{
    type: 'deleteNote',
    measureNumber: 1,
    staffIndex: 1,
    voiceId: 1,
    timestampNum: 4,
    timestampDen: 32,
  }]);

  assert.ok(!result.diagnostics.some((entry) => entry.code === 'event_duration_notation_mismatch'));
});

test('replaceWithRest collapses a complete chord and applies the requested duration', () => {
  const chordState = applyDocumentCommands(buildDocumentState(SAMPLE_XML), [{
    type: 'insertNoteAt',
    measureNumber: 1,
    staffIndex: 1,
    voiceId: 1,
    timestampNum: 0,
    timestampDen: 4,
    step: 'E',
    octave: 4,
    alter: 0,
    durationType: 'quarter',
    asChord: true,
  }]);
  const result = applyDocumentCommands(chordState, [{
    type: 'replaceWithRest',
    measureNumber: 1,
    staffIndex: 1,
    voiceId: 1,
    timestampNum: 0,
    timestampDen: 4,
    durationType: 'eighth',
    isDotted: false,
  }]);

  const measure = result.coreDocument?.score.parts[0]?.staves[0]?.measures[0];
  const onset = measure?.voices[0]?.events.filter((event) => event.timestampNum === 0) ?? [];
  assert.equal(onset.length, 1);
  assert.equal(onset[0]?.kind, 'rest');
  assert.equal(onset[0]?.durationType, 'eighth');
  assert.equal(onset[0]?.isDotted, false);
  assert.doesNotMatch(result.xml, /<chord\/>/);
  assert.ok(!result.diagnostics.some((entry) => entry.code === 'event_duration_notation_mismatch'));
  assert.ok(!result.diagnostics.some((entry) => entry.code === 'voice_timeline_gap'));
});

test('absolute rest insertion splits absorbed non-representable trailing rests', () => {
  const restSpanXml = `<?xml version="1.0" encoding="UTF-8"?>
<score-partwise version="3.1">
  <part-list>
    <score-part id="P1"><part-name>Piano</part-name></score-part>
  </part-list>
  <part id="P1">
    <measure number="1">
      <attributes>
        <divisions>8</divisions>
        <time><beats>4</beats><beat-type>4</beat-type></time>
        <clef><sign>G</sign><line>2</line></clef>
      </attributes>
      <note>
        <rest/>
        <duration>32</duration>
        <voice>1</voice>
        <type>whole</type>
        <staff>1</staff>
      </note>
    </measure>
  </part>
</score-partwise>`;

  const result = applyDocumentCommands(buildDocumentState(restSpanXml), [{
    type: 'insertRestAt',
    measureNumber: 1,
    staffIndex: 1,
    voiceId: 1,
    timestampNum: 4,
    timestampDen: 32,
    durationType: '64th',
    isDotted: false,
  }]);

  assert.ok(!result.diagnostics.some((entry) => entry.code === 'event_duration_notation_mismatch'));
});

test('buildDocumentState accepts a complete 7/8 rhythmic sum', () => {
  const sevenEightXml = `<?xml version="1.0" encoding="UTF-8"?>
<score-partwise version="3.1">
  <part-list>
    <score-part id="P1"><part-name>Piano</part-name></score-part>
  </part-list>
  <part id="P1">
    <measure number="1">
      <attributes>
        <divisions>8</divisions>
        <time><beats>7</beats><beat-type>8</beat-type></time>
        <clef><sign>G</sign><line>2</line></clef>
      </attributes>
      <note>
        <pitch><step>C</step><octave>4</octave></pitch>
        <duration>8</duration>
        <voice>1</voice>
        <type>quarter</type>
        <staff>1</staff>
      </note>
      <note>
        <pitch><step>D</step><octave>4</octave></pitch>
        <duration>8</duration>
        <voice>1</voice>
        <type>quarter</type>
        <staff>1</staff>
      </note>
      <note>
        <rest/>
        <duration>4</duration>
        <voice>1</voice>
        <type>eighth</type>
        <staff>1</staff>
      </note>
      <note>
        <pitch><step>E</step><octave>4</octave></pitch>
        <duration>8</duration>
        <voice>1</voice>
        <type>quarter</type>
        <staff>1</staff>
      </note>
    </measure>
  </part>
</score-partwise>`;

  const state = buildDocumentState(sevenEightXml);
  assert.ok(!state.diagnostics.some((entry) => entry.code === 'voice_rhythm_sum_mismatch'));
  assert.ok(!state.diagnostics.some((entry) => entry.code === 'measure_balance'));
});

test('buildDocumentState reports tie continuity validation warnings for imported dangling tie starts', () => {
  const state = buildDocumentState(SAMPLE_XML.replace(
    '<voice>1</voice>',
    '<tie type="start"/><voice>1</voice><notations><tied type="start"/></notations>',
  ));
  assert.ok(state.diagnostics.some((entry) => entry.code === 'tie_continuity'));
});

test('toggleTie prunes invalid tie starts instead of committing Doctor warnings', () => {
  const result = applyDocumentCommands(buildDocumentState(SAMPLE_XML), [
    { type: 'toggleTie', measureNumber: 1, staffIndex: 1, voiceId: 1, timestampNum: 0, timestampDen: 4 },
  ]);

  assert.doesNotMatch(result.xml, /<tie type="start"\/>/);
  assert.ok(!result.diagnostics.some((entry) => entry.code === 'tie_continuity'));
});

test('buildDocumentState accepts ties that continue into the next measure', () => {
  const crossMeasureTieXml = `<?xml version="1.0" encoding="UTF-8"?>
<score-partwise version="3.1">
  <part-list>
    <score-part id="P1"><part-name>Piano</part-name></score-part>
  </part-list>
  <part id="P1">
    <measure number="1">
      <attributes>
        <divisions>1</divisions>
        <time><beats>4</beats><beat-type>4</beat-type></time>
        <clef><sign>G</sign><line>2</line></clef>
      </attributes>
      <note>
        <pitch><step>C</step><octave>4</octave></pitch>
        <duration>4</duration>
        <voice>1</voice>
        <type>whole</type>
        <staff>1</staff>
        <tie type="start"/>
        <notations><tied type="start"/></notations>
      </note>
    </measure>
    <measure number="2">
      <note>
        <pitch><step>C</step><octave>4</octave></pitch>
        <duration>4</duration>
        <voice>1</voice>
        <type>whole</type>
        <staff>1</staff>
      </note>
    </measure>
  </part>
</score-partwise>`;

  const state = buildDocumentState(crossMeasureTieXml);
  assert.ok(!state.diagnostics.some((entry) => entry.code === 'tie_continuity'));
  assert.ok(!state.diagnostics.some((entry) => entry.level === 'error'));
});

test('buildDocumentState accepts tied chord notes that continue into the next measure', () => {
  const tiedChordXml = `<?xml version="1.0" encoding="UTF-8"?>
<score-partwise version="3.1">
  <part-list>
    <score-part id="P1"><part-name>Piano</part-name></score-part>
  </part-list>
  <part id="P1">
    <measure number="1">
      <attributes>
        <divisions>1</divisions>
        <time><beats>4</beats><beat-type>4</beat-type></time>
        <clef><sign>G</sign><line>2</line></clef>
      </attributes>
      <note>
        <pitch><step>C</step><octave>4</octave></pitch>
        <duration>4</duration>
        <voice>1</voice>
        <type>whole</type>
        <staff>1</staff>
        <tie type="start"/>
        <notations><tied type="start"/></notations>
      </note>
      <note>
        <chord/>
        <pitch><step>E</step><octave>4</octave></pitch>
        <duration>4</duration>
        <voice>1</voice>
        <type>whole</type>
        <staff>1</staff>
        <tie type="start"/>
        <notations><tied type="start"/></notations>
      </note>
      <note>
        <chord/>
        <pitch><step>G</step><octave>4</octave></pitch>
        <duration>4</duration>
        <voice>1</voice>
        <type>whole</type>
        <staff>1</staff>
        <tie type="start"/>
        <notations><tied type="start"/></notations>
      </note>
    </measure>
    <measure number="2">
      <note>
        <pitch><step>C</step><octave>4</octave></pitch>
        <duration>4</duration>
        <voice>1</voice>
        <type>whole</type>
        <staff>1</staff>
        <tie type="stop"/>
        <notations><tied type="stop"/></notations>
      </note>
      <note>
        <chord/>
        <pitch><step>E</step><octave>4</octave></pitch>
        <duration>4</duration>
        <voice>1</voice>
        <type>whole</type>
        <staff>1</staff>
        <tie type="stop"/>
        <notations><tied type="stop"/></notations>
      </note>
      <note>
        <chord/>
        <pitch><step>G</step><octave>4</octave></pitch>
        <duration>4</duration>
        <voice>1</voice>
        <type>whole</type>
        <staff>1</staff>
        <tie type="stop"/>
        <notations><tied type="stop"/></notations>
      </note>
    </measure>
  </part>
</score-partwise>`;

  const state = buildDocumentState(tiedChordXml);
  assert.deepEqual(
    state.diagnostics.filter((entry) => entry.code === 'tie_continuity'),
    [],
  );
});

test('buildDocumentState reports tuplet consistency warnings for malformed tuplets', () => {
  const malformedTupletXml = `<?xml version="1.0" encoding="UTF-8"?>
<score-partwise version="3.1">
  <part-list>
    <score-part id="P1"><part-name>Piano</part-name></score-part>
  </part-list>
  <part id="P1">
    <measure number="1">
      <attributes>
        <divisions>1</divisions>
        <time><beats>4</beats><beat-type>4</beat-type></time>
        <clef><sign>G</sign><line>2</line></clef>
      </attributes>
      <note>
        <pitch><step>C</step><octave>4</octave></pitch>
        <duration>1</duration>
        <voice>1</voice>
        <type>quarter</type>
        <time-modification>
          <actual-notes>3</actual-notes>
          <normal-notes>2</normal-notes>
        </time-modification>
        <notations><tuplet type="start" number="1"/></notations>
        <staff>1</staff>
      </note>
      <note>
        <rest/>
        <duration>3</duration>
        <voice>1</voice>
        <type>half</type>
        <dot/>
        <staff>1</staff>
      </note>
    </measure>
  </part>
</score-partwise>`;

  const state = buildDocumentState(malformedTupletXml);
  assert.ok(state.diagnostics.some((entry) => entry.code === 'tuplet_span_short'));
  assert.ok(state.diagnostics.some((entry) => entry.code === 'tuplet_count_mismatch'));
});

test('buildDocumentState reports ending consistency warnings without a repeat section', () => {
  const result = applyDocumentCommands(buildDocumentState(SAMPLE_XML), [
    { type: 'setEnding', measureNumber: 1, number: '1', endingType: 'start' },
  ]);

  assert.ok(result.diagnostics.some((entry) => entry.code === 'ending_without_repeat'));
  assert.ok(result.diagnostics.some((entry) => entry.code === 'ending_without_repeat' && entry.level === 'warning'));
});

test('buildDocumentState reports rhythmic gaps inside multi-voice measures', () => {
  const fullMeasureXml = SAMPLE_XML.replace('<duration>1</duration>', '<duration>4</duration>')
    .replace('<type>quarter</type>', '<type>whole</type>');
  const document = structuredClone(buildDocumentState(fullMeasureXml).coreDocument!);
  document.score.parts[0].staves[0].measures[0].voices.push({
    id: 'voice:1:1:2',
    voiceId: 2,
    events: [
      {
        id: 'event:gap:rest',
        kind: 'rest',
        measureNumber: 1,
        staffIndex: 1,
        voiceId: 2,
        timestampNum: 0,
        timestampDen: 4,
        durationDivisions: 2,
        durationType: 'half',
        isDotted: false,
        isChord: false,
        articulations: [],
        tieStart: false,
        lyrics: [],
      },
      {
        id: 'event:gap:note',
        kind: 'note',
        measureNumber: 1,
        staffIndex: 1,
        voiceId: 2,
        timestampNum: 3,
        timestampDen: 4,
        durationDivisions: 1,
        durationType: 'quarter',
        isDotted: false,
        isChord: false,
        articulations: [],
        tieStart: false,
        lyrics: [],
        pitch: {
          step: 'E',
          alter: 0,
          octave: 4,
        },
      },
    ],
  });

  const diagnostics = validateScoreDocument(document);
  assert.ok(diagnostics.some((entry) => entry.code === 'voice_timeline_gap'));
  assert.ok(diagnostics.some((entry) => entry.code === 'multi_voice_rhythm_gap'));
  assert.ok(!diagnostics.some((entry) => entry.code === 'voice_duration_mismatch'));
});

test('applyDocumentCommands toggles a slur to the next note through the core notation path', () => {
  const multiXml = SAMPLE_XML.replace(
    '</measure>',
    `<note>
      <pitch><step>D</step><octave>4</octave></pitch>
      <duration>1</duration>
      <voice>1</voice>
      <type>quarter</type>
      <staff>1</staff>
    </note>
    <note>
      <rest/>
      <duration>2</duration>
      <voice>1</voice>
      <type>half</type>
      <staff>1</staff>
    </note>
    </measure>`,
  );

  const added = applyDocumentCommands(buildDocumentState(multiXml), [
    { type: 'toggleSlur', measureNumber: 1, staffIndex: 1, voiceId: 1, timestampNum: 0, timestampDen: 4 },
  ]);

  assert.equal(added.coreDocument?.slurs.length, 1);
  assert.match(added.xml, /<slur [^>]*number="1"[^>]*type="start"\/>/);
  assert.match(added.xml, /<slur [^>]*number="1"[^>]*type="stop"\/>/);

  const removed = applyDocumentCommands(added, [
    { type: 'toggleSlur', measureNumber: 1, staffIndex: 1, voiceId: 1, timestampNum: 0, timestampDen: 4 },
  ]);

  assert.equal(removed.coreDocument?.slurs.length, 0);
});

test('applyDocumentCommands toggles a slur across an explicit selected span', () => {
  const multiXml = SAMPLE_XML.replace(
    '</measure>',
    `<note>
      <pitch><step>D</step><octave>4</octave></pitch>
      <duration>1</duration>
      <voice>1</voice>
      <type>quarter</type>
      <staff>1</staff>
    </note>
    <note>
      <pitch><step>E</step><octave>4</octave></pitch>
      <duration>1</duration>
      <voice>1</voice>
      <type>quarter</type>
      <staff>1</staff>
    </note>
    <note>
      <rest/>
      <duration>1</duration>
      <voice>1</voice>
      <type>quarter</type>
      <staff>1</staff>
    </note>
    </measure>`,
  );

  const result = applyDocumentCommands(buildDocumentState(multiXml), [
    {
      type: 'toggleSlur',
      measureNumber: 1,
      staffIndex: 1,
      voiceId: 1,
      timestampNum: 0,
      timestampDen: 4,
      stopLocator: {
        measureNumber: 1,
        staffIndex: 1,
        voiceId: 1,
        timestampNum: 2,
        timestampDen: 4,
      },
    },
  ]);

  assert.equal(result.coreDocument?.slurs.length, 1);
  assert.ok(result.diagnostics.some((entry) => entry.code === 'core_execution'));
});

test('applyDocumentCommands updates slur placement through the core path', () => {
  const multiXml = `<?xml version="1.0" encoding="UTF-8"?>
<score-partwise version="3.1">
  <part-list><score-part id="P1"><part-name>Piano</part-name></score-part></part-list>
  <part id="P1">
    <measure number="1">
      <attributes><divisions>1</divisions><time><beats>4</beats><beat-type>4</beat-type></time></attributes>
      <note>
        <pitch><step>C</step><octave>4</octave></pitch>
        <duration>1</duration>
        <voice>1</voice>
        <type>quarter</type>
        <notations><slur type="start" number="1" placement="above"/></notations>
        <staff>1</staff>
      </note>
      <note>
        <pitch><step>D</step><octave>4</octave></pitch>
        <duration>1</duration>
        <voice>1</voice>
        <type>quarter</type>
        <notations><slur type="stop" number="1" placement="above"/></notations>
        <staff>1</staff>
      </note>
      <note><rest/><duration>2</duration><voice>1</voice><type>half</type><staff>1</staff></note>
    </measure>
  </part>
</score-partwise>`;

  const result = applyDocumentCommands(buildDocumentState(multiXml), [
    {
      type: 'setSlurPlacement',
      placement: 'below',
      measureNumber: 1,
      staffIndex: 1,
      voiceId: 1,
      timestampNum: 0,
      timestampDen: 4,
      stopLocator: {
        measureNumber: 1,
        staffIndex: 1,
        voiceId: 1,
        timestampNum: 1,
        timestampDen: 4,
      },
    },
  ]);

  assert.equal(result.coreDocument?.slurs[0]?.placement, 'below');
  assert.match(result.xml, /<slur [^>]*type="start"[^>]*placement="below"\/>|<slur [^>]*placement="below"[^>]*type="start"\/>/);
  assert.match(result.xml, /<slur [^>]*type="stop"[^>]*placement="below"\/>|<slur [^>]*placement="below"[^>]*type="stop"\/>/);
});

test('buildDocumentState reports lyric continuity validation warnings', () => {
  const lyricState = applyDocumentCommands(buildDocumentState(SAMPLE_XML), [
    { type: 'addLyric', measureNumber: 1, staffIndex: 1, voiceId: 1, timestampNum: 0, timestampDen: 4, text: 'Hal', syllabic: 'begin' },
  ]);
  assert.ok(lyricState.diagnostics.some((entry) => entry.code === 'lyric_continuity'));
});

test('applyDocumentCommands preserves note-level unsupported fragments on the core path', () => {
  const complexXml = SAMPLE_XML.replace(
    '</type>',
    '</type><cue/><notehead>x</notehead><notations><glissando type="start" number="1"/></notations>',
  );

  const result = applyDocumentCommands(buildDocumentState(complexXml), [
    { type: 'changeNotePitch', measureNumber: 1, staffIndex: 1, voiceId: 1, timestampNum: 0, timestampDen: 4, step: 'E', octave: 4, alter: 0 },
  ]);

  assert.match(result.xml, /<step>E<\/step>/);
  assert.match(result.xml, /<cue\/>/);
  assert.match(result.xml, /<notehead>x<\/notehead>/);
  assert.match(result.xml, /<glissando type="start" number="1"\/>/);
  assert.ok(result.diagnostics.some((entry) => entry.code === 'core_execution'));
  assert.ok(!result.diagnostics.some((entry) => entry.code === 'legacy_fallback'));
});

test('applyDocumentCommands transposes all parts with preserved cue tags on the core path', () => {
  const multiPartUnsafeXml = `<?xml version="1.0" encoding="UTF-8"?>
<score-partwise version="3.1">
  <part-list>
    <score-part id="P1"><part-name>Vibraphone</part-name></score-part>
    <score-part id="P2"><part-name>Guitar</part-name></score-part>
  </part-list>
  <part id="P1">
    <measure number="1">
      <attributes>
        <divisions>1</divisions>
        <key><fifths>0</fifths></key>
        <time><beats>4</beats><beat-type>4</beat-type></time>
        <clef><sign>G</sign><line>2</line></clef>
      </attributes>
      <note>
        <pitch><step>C</step><octave>4</octave></pitch>
        <duration>1</duration>
        <voice>1</voice>
        <type>quarter</type>
        <staff>1</staff>
        <cue/>
      </note>
    </measure>
  </part>
  <part id="P2">
    <measure number="1">
      <attributes>
        <divisions>1</divisions>
        <key><fifths>0</fifths></key>
        <time><beats>4</beats><beat-type>4</beat-type></time>
        <clef><sign>G</sign><line>2</line></clef>
      </attributes>
      <note>
        <pitch><step>E</step><octave>4</octave></pitch>
        <duration>1</duration>
        <voice>1</voice>
        <type>quarter</type>
        <staff>1</staff>
      </note>
    </measure>
  </part>
</score-partwise>`;

  const result = applyDocumentCommands(buildDocumentState(multiPartUnsafeXml), [
    { type: 'setKey', fifths: -2 },
    { type: 'transposeDocumentChromatic', semitones: -2 },
  ]);

  assert.ok(result.diagnostics.some((entry) => entry.code === 'core_execution'));
  assert.ok(!result.diagnostics.some((entry) => entry.code === 'legacy_fallback'));
  assert.match(result.xml, /<part id="P1">[\s\S]*?<fifths>-2<\/fifths>/);
  assert.match(result.xml, /<part id="P2">[\s\S]*?<fifths>-2<\/fifths>/);
  assert.match(result.xml, /<part id="P1">[\s\S]*?<step>B<\/step><alter>-1<\/alter><octave>3<\/octave>/);
  assert.match(result.xml, /<part id="P2">[\s\S]*?<step>D<\/step><octave>4<\/octave>/);
});

test('transposeDocumentChromatic also transposes harmony symbols and slash bass in legacy fallback', () => {
  const chordXml = `<?xml version="1.0" encoding="UTF-8"?>
<score-partwise version="3.1">
  <part-list>
    <score-part id="P1"><part-name>Lead</part-name></score-part>
  </part-list>
  <part id="P1">
    <measure number="1">
      <attributes>
        <divisions>1</divisions>
        <key><fifths>-2</fifths></key>
        <time><beats>4</beats><beat-type>4</beat-type></time>
        <clef><sign>G</sign><line>2</line></clef>
      </attributes>
      <harmony>
        <root><root-step>E</root-step></root>
        <kind text="(9)">dominant</kind>
        <bass><bass-step>D</bass-step><bass-alter>1</bass-alter></bass>
      </harmony>
      <note>
        <pitch><step>C</step><octave>4</octave></pitch>
        <duration>1</duration>
        <voice>1</voice>
        <type>quarter</type>
        <staff>1</staff>
        <cue/>
      </note>
    </measure>
  </part>
</score-partwise>`;

  const result = applyDocumentCommands(buildDocumentState(chordXml), [
    { type: 'transposeDocumentChromatic', semitones: -2 },
  ]);

  assert.match(result.xml, /<root-step>D<\/root-step>/);
  assert.match(result.xml, /<bass-step>D<\/bass-step><bass-alter>-1<\/bass-alter>/);
});

test('transposeDocumentChromatic keeps flat spelling in later measures after a flat key change on the core path', () => {
  const twoMeasureXml = `<?xml version="1.0" encoding="UTF-8"?>
<score-partwise version="3.1">
  <part-list>
    <score-part id="P1"><part-name>Lead</part-name></score-part>
  </part-list>
  <part id="P1">
    <measure number="1">
      <attributes>
        <divisions>1</divisions>
        <key><fifths>0</fifths></key>
        <time><beats>4</beats><beat-type>4</beat-type></time>
        <clef><sign>G</sign><line>2</line></clef>
      </attributes>
      <note>
        <pitch><step>G</step><octave>4</octave></pitch>
        <duration>4</duration>
        <voice>1</voice>
        <type>whole</type>
        <staff>1</staff>
      </note>
    </measure>
    <measure number="2">
      <note>
        <pitch><step>G</step><octave>4</octave></pitch>
        <duration>4</duration>
        <voice>1</voice>
        <type>whole</type>
        <staff>1</staff>
      </note>
    </measure>
  </part>
</score-partwise>`;

  const result = applyDocumentCommands(buildDocumentState(twoMeasureXml), [
    { type: 'setKey', fifths: -4 },
    { type: 'transposeDocumentChromatic', semitones: 1 },
  ]);

  assert.doesNotMatch(result.xml, /<measure number="2">[\s\S]*?<step>G<\/step><alter>1<\/alter>/);
  assert.match(result.xml, /<measure number="2">[\s\S]*?<step>A<\/step><alter>-1<\/alter><octave>4<\/octave>/);
});

test('applyDocumentCommands updates part transpose through the core path', () => {
  const result = applyDocumentCommands(buildDocumentState(SAMPLE_XML), [
    { type: 'setPartTranspose', partId: 'P1', chromatic: 2, diatonic: 1 },
  ]);

  assert.match(result.xml, /<chromatic>2<\/chromatic>/);
  assert.match(result.xml, /<diatonic>1<\/diatonic>/);
  assert.equal(result.coreDocument?.score.parts[0].chromaticTranspose, 2);
});

test('applyDocumentCommands inserts and deletes measures through the core structure path', () => {
  const inserted = applyDocumentCommands(buildDocumentState(SAMPLE_XML), [
    { type: 'insertMeasureAfter', measureNumber: 1 },
  ]);

  const insertedMeasureMatches = inserted.xml.match(/<measure number="/g) ?? [];
  assert.equal(insertedMeasureMatches.length, 2);
  assert.match(inserted.xml, /<measure number="2"/);
  assert.ok(inserted.diagnostics.some((entry) => entry.code === 'core_execution'));

  const deleted = applyDocumentCommands(inserted, [
    { type: 'deleteMeasure', measureNumber: 2 },
  ]);
  const deletedMeasureMatches = deleted.xml.match(/<measure number="/g) ?? [];
  assert.equal(deletedMeasureMatches.length, 1);
  assert.ok(deleted.diagnostics.some((entry) => entry.code === 'core_execution'));
});

test('applyDocumentCommands changes note pitch through the core content path', () => {
  const result = applyDocumentCommands(buildDocumentState(SAMPLE_XML), [
    { type: 'changeNotePitch', measureNumber: 1, staffIndex: 1, voiceId: 1, timestampNum: 0, timestampDen: 4, step: 'D', octave: 4, alter: 1 },
  ]);

  assert.match(result.xml, /<step>D<\/step>/);
  assert.match(result.xml, /<alter>1<\/alter>/);
  const event = result.coreDocument?.score.parts[0].staves[0].measures[0].voices[0].events[0];
  assert.equal(event?.kind, 'note');
  if (event?.kind === 'note') {
    assert.equal(event.pitch.step, 'D');
    assert.equal(event.pitch.alter, 1);
  }
});

test('applyDocumentCommands deletes a note as rest through the core content path', () => {
  const result = applyDocumentCommands(buildDocumentState(SAMPLE_XML), [
    { type: 'deleteNote', measureNumber: 1, staffIndex: 1, voiceId: 1, timestampNum: 0, timestampDen: 4 },
  ]);

  assert.match(result.xml, /<rest\/>/);
  assert.equal(result.coreDocument?.score.parts[0].staves[0].measures[0].voices[0].events[0].kind, 'rest');
});

test('applyDocumentCommands exports surviving chord notes without mixed rest-plus-chord markup', () => {
  const chordXml = `<?xml version="1.0" encoding="UTF-8"?>
<score-partwise version="3.1">
  <part-list>
    <score-part id="P1"><part-name>Piano</part-name></score-part>
  </part-list>
  <part id="P1">
    <measure number="1">
      <attributes>
        <divisions>1</divisions>
        <time><beats>4</beats><beat-type>4</beat-type></time>
      </attributes>
      <note>
        <pitch><step>C</step><octave>4</octave></pitch>
        <duration>1</duration>
        <voice>1</voice>
        <type>quarter</type>
        <staff>1</staff>
      </note>
      <note>
        <chord/>
        <pitch><step>E</step><octave>4</octave></pitch>
        <duration>1</duration>
        <voice>1</voice>
        <type>quarter</type>
        <staff>1</staff>
      </note>
    </measure>
  </part>
</score-partwise>`;

  const result = applyDocumentCommands(buildDocumentState(chordXml), [
    { type: 'deleteNote', measureNumber: 1, staffIndex: 1, voiceId: 1, timestampNum: 0, timestampDen: 4 },
  ]);

  assert.match(result.xml, /<step>E<\/step><octave>4<\/octave>/);
  assert.doesNotMatch(result.xml, /<note>[\s\S]*?<rest\/>[\s\S]*?<note>[\s\S]*?<chord\/>/);
  assert.doesNotMatch(result.xml, /<chord\/>\s*<rest\/>/);
});

test('applyDocumentCommands inserts a note through the core content path', () => {
  const result = applyDocumentCommands(buildDocumentState(SAMPLE_XML), [
    { type: 'insertNote', measureNumber: 1, staffIndex: 1, voiceId: 1, afterTimestampNum: 0, afterTimestampDen: 4, step: 'E', octave: 4, alter: 0, durationType: 'quarter' },
  ]);

  const events = result.coreDocument?.score.parts[0].staves[0].measures[0].voices[0].events ?? [];
  const notes = events.filter((event) => event.kind === 'note');
  assert.equal(notes.length, 2);
  assert.match(result.xml, /<step>E<\/step>/);
  assert.ok(result.diagnostics.some((entry) => entry.code === 'core_execution'));
});

test('duplicateNote at a measure end shifts overflow into a balanced following measure', () => {
  const twoMeasureXml = `<?xml version="1.0" encoding="UTF-8"?>
<score-partwise version="3.1">
  <part-list>
    <score-part id="P1"><part-name>Piano</part-name></score-part>
  </part-list>
  <part id="P1">
    <measure number="1">
      <attributes>
        <divisions>1</divisions>
        <time><beats>4</beats><beat-type>4</beat-type></time>
      </attributes>
      <note><pitch><step>C</step><octave>4</octave></pitch><duration>1</duration><voice>1</voice><type>quarter</type><staff>1</staff></note>
      <note><pitch><step>D</step><octave>4</octave></pitch><duration>1</duration><voice>1</voice><type>quarter</type><staff>1</staff></note>
      <note><pitch><step>E</step><octave>4</octave></pitch><duration>1</duration><voice>1</voice><type>quarter</type><staff>1</staff></note>
      <note><pitch><step>F</step><octave>4</octave></pitch><duration>1</duration><voice>1</voice><type>quarter</type><staff>1</staff></note>
    </measure>
    <measure number="2">
      <note><pitch><step>G</step><octave>4</octave></pitch><duration>1</duration><voice>1</voice><type>quarter</type><staff>1</staff></note>
      <note><pitch><step>A</step><octave>4</octave></pitch><duration>1</duration><voice>1</voice><type>quarter</type><staff>1</staff></note>
      <note><pitch><step>B</step><octave>4</octave></pitch><duration>1</duration><voice>1</voice><type>quarter</type><staff>1</staff></note>
      <note><pitch><step>C</step><octave>5</octave></pitch><duration>1</duration><voice>1</voice><type>quarter</type><staff>1</staff></note>
    </measure>
  </part>
</score-partwise>`;
  const result = applyDocumentCommands(buildDocumentState(twoMeasureXml), [
    { type: 'duplicateNote', measureNumber: 1, staffIndex: 1, voiceId: 1, timestampNum: 3, timestampDen: 4 },
  ]);
  const measures = result.coreDocument?.score.parts[0]?.staves[0]?.measures ?? [];
  const events = measures.flatMap((measure) => measure.voices[0]?.events ?? []);

  assert.equal(measures.length, 3);
  assert.equal(events.filter((event) => event.kind === 'note').length, 9);
  assert.deepEqual(
    measures.map((measure) => measure.voices[0]?.events.reduce((sum, event) => sum + (event.isChord ? 0 : event.durationDivisions), 0)),
    [4, 4, 4],
  );
  assert.ok(!result.diagnostics.some((entry) => ['measure_balance', 'voice_rhythm_sum_mismatch', 'voice_timeline_gap'].includes(entry.code)));
});

test('applyDocumentCommands transposes a note through the core content path', () => {
  const result = applyDocumentCommands(buildDocumentState(SAMPLE_XML), [
    { type: 'transposeChromatic', measureNumber: 1, staffIndex: 1, voiceId: 1, timestampNum: 0, timestampDen: 4, semitones: 2 },
  ]);

  assert.match(result.xml, /<step>D<\/step>/);
  const event = result.coreDocument?.score.parts[0].staves[0].measures[0].voices[0].events[0];
  assert.equal(event?.kind, 'note');
});

test('applyDocumentCommands transposes the addressed chord tone by core id', () => {
  const chordXml = `<?xml version="1.0" encoding="UTF-8"?>
<score-partwise version="3.1">
  <part-list>
    <score-part id="P1"><part-name>Piano</part-name></score-part>
  </part-list>
  <part id="P1">
    <measure number="1">
      <attributes>
        <divisions>1</divisions>
        <time><beats>4</beats><beat-type>4</beat-type></time>
      </attributes>
      <note><pitch><step>C</step><octave>4</octave></pitch><duration>1</duration><voice>1</voice><type>quarter</type><staff>1</staff></note>
      <note><chord/><pitch><step>E</step><octave>4</octave></pitch><duration>1</duration><voice>1</voice><type>quarter</type><staff>1</staff></note>
    </measure>
  </part>
</score-partwise>`;
  const state = buildDocumentState(chordXml);
  const events = state.coreDocument?.score.parts[0].staves[0].measures[0].voices[0].events ?? [];
  const upper = events.find((event) => event.kind === 'note' && event.pitch.step === 'E');

  assert.ok(upper);

  const result = applyDocumentCommands(state, [
    {
      type: 'transposeChromatic',
      coreEntityId: upper!.id,
      measureNumber: 1,
      staffIndex: 1,
      voiceId: 1,
      timestampNum: 0,
      timestampDen: 4,
      step: 'E',
      octave: 4,
      alter: 0,
      semitones: 1,
    },
  ]);

  const transposed = result.coreDocument?.score.parts[0].staves[0].measures[0].voices[0].events ?? [];
  assert.equal(transposed[0]?.kind === 'note' ? transposed[0].pitch.step : null, 'C');
  assert.equal(transposed[0]?.kind === 'note' ? transposed[0].pitch.alter : null, 0);
  assert.equal(transposed[1]?.kind === 'note' ? transposed[1].pitch.step : null, 'F');
  assert.equal(transposed[1]?.kind === 'note' ? transposed[1].pitch.alter : null, 0);
});

test('applyDocumentCommands transposes a semantic range through the core content path', () => {
  const multiXml = SAMPLE_XML.replace(
    '</measure>',
    `<note>
      <pitch><step>D</step><octave>4</octave></pitch>
      <duration>1</duration>
      <voice>1</voice>
      <type>quarter</type>
      <staff>1</staff>
    </note></measure>`,
  );
  const result = applyDocumentCommands(buildDocumentState(multiXml), [
    {
      type: 'transposeRangeChromatic',
      semitones: 2,
      range: {
        start: { measureNumber: 1, staffIndex: 1, voiceId: 1, timestampNum: 0, timestampDen: 4 },
        end: { measureNumber: 1, staffIndex: 1, voiceId: 1, timestampNum: 1, timestampDen: 4 },
      },
    },
  ]);

  const events = result.coreDocument?.score.parts[0].staves[0].measures[0].voices[0].events ?? [];
  assert.equal(events[0]?.kind, 'note');
  assert.equal(events[1]?.kind, 'note');
  if (events[0]?.kind === 'note' && events[1]?.kind === 'note') {
    assert.equal(events[0].pitch.step, 'D');
    assert.equal(events[1].pitch.step, 'E');
  }
});

test('applyDocumentCommands applies notation edits through the core path', () => {
  const tieReadyXml = SAMPLE_XML.replace(
    '</measure>',
    `<note>
      <pitch><step>C</step><octave>4</octave></pitch>
      <duration>3</duration>
      <voice>1</voice>
      <type>half</type>
      <dot/>
      <staff>1</staff>
    </note></measure>`,
  );
  const result = applyDocumentCommands(buildDocumentState(tieReadyXml), [
    { type: 'toggleArticulation', measureNumber: 1, staffIndex: 1, voiceId: 1, timestampNum: 0, timestampDen: 4, articulation: 'staccato' },
    { type: 'toggleTie', measureNumber: 1, staffIndex: 1, voiceId: 1, timestampNum: 0, timestampDen: 4 },
    { type: 'addLyric', measureNumber: 1, staffIndex: 1, voiceId: 1, timestampNum: 0, timestampDen: 4, text: 'Hal', syllabic: 'begin' },
    { type: 'addDynamic', measureNumber: 1, staffIndex: 1, voiceId: 1, timestampNum: 0, timestampDen: 4, dynamic: 'mf', placement: 'above' },
    { type: 'setBarline', measureNumber: 1, barline: 'final' },
  ]);

  assert.match(result.xml, /<staccato\/>/);
  assert.match(result.xml, /<tie type="start"\/>/);
  assert.match(result.xml, /<tied type="start"\/>/);
  assert.match(result.xml, /<lyric>/);
  assert.match(result.xml, /<text>Hal<\/text>/);
  assert.match(result.xml, /<direction placement="above">[\s\S]*?<dynamics><mf\/><\/dynamics>/);
  assert.match(result.xml, /<dynamics><mf\/><\/dynamics>/);
  assert.match(result.xml, /<bar-style>light-heavy<\/bar-style>/);

  const event = result.coreDocument?.score.parts[0].staves[0].measures[0].voices[0].events[0];
  assert.ok(event?.articulations?.includes('staccato'));
  assert.equal(event?.tieStart, true);
  assert.equal(event?.lyrics?.[0]?.text, 'Hal');
  assert.equal(
    result.coreDocument?.score.parts[0].staves[0].measures[0].directions.find((direction) => direction.kind === 'dynamics')?.placement,
    'above',
  );
  assert.equal(result.coreDocument?.score.parts[0].staves[0].measures[0].rightBarline, 'final');
});

test('tie placement edits stay semantic and roundtrip through MusicXML', () => {
  const tieReadyXml = SAMPLE_XML.replace(
    '</measure>',
    `<note>
      <pitch><step>C</step><octave>4</octave></pitch>
      <duration>3</duration>
      <voice>1</voice>
      <type>half</type>
      <dot/>
      <staff>1</staff>
    </note></measure>`,
  );
  const result = applyDocumentCommands(buildDocumentState(tieReadyXml), [
    { type: 'toggleTie', measureNumber: 1, staffIndex: 1, voiceId: 1, timestampNum: 0, timestampDen: 4 },
    { type: 'setTiePlacement', measureNumber: 1, staffIndex: 1, voiceId: 1, timestampNum: 0, timestampDen: 4, placement: 'below' },
  ]);

  assert.match(result.xml, /<tied type="start" placement="below"\/>/);
  assert.match(result.xml, /<tied type="stop" placement="below"\/>/);

  const event = result.coreDocument?.score.parts[0].staves[0].measures[0].voices[0].events[0];
  assert.equal(event?.tieStart, true);
  assert.equal(event?.tiePlacement, 'below');

  const roundtripped = importMusicXmlToCore(result.xml);
  const roundtrippedEvent = roundtripped.score.parts[0].staves[0].measures[0].voices[0].events[0];
  assert.equal(roundtrippedEvent?.tieStart, true);
  assert.equal(roundtrippedEvent?.tiePlacement, 'below');

  const untied = applyDocumentCommands(result, [
    { type: 'toggleTie', measureNumber: 1, staffIndex: 1, voiceId: 1, timestampNum: 0, timestampDen: 4 },
  ]);
  const untiedEvent = untied.coreDocument?.score.parts[0].staves[0].measures[0].voices[0].events[0];
  assert.equal(Boolean(untiedEvent?.tieStart), false);
  assert.equal(untiedEvent?.tiePlacement, undefined);
});

test('toggleTie addresses every chord tone by semantic identity and roundtrips complete chord ties', () => {
  const chordState = applyDocumentCommands(buildDocumentState(SAMPLE_XML), [
    {
      type: 'insertNoteAt',
      measureNumber: 1,
      staffIndex: 1,
      voiceId: 1,
      timestampNum: 0,
      timestampDen: 4,
      step: 'E',
      octave: 4,
      alter: 0,
      durationType: 'quarter',
      asChord: true,
    },
    {
      type: 'insertNoteAt',
      measureNumber: 1,
      staffIndex: 1,
      voiceId: 1,
      timestampNum: 1,
      timestampDen: 4,
      step: 'C',
      octave: 4,
      alter: 0,
      durationType: 'quarter',
    },
    {
      type: 'insertNoteAt',
      measureNumber: 1,
      staffIndex: 1,
      voiceId: 1,
      timestampNum: 1,
      timestampDen: 4,
      step: 'E',
      octave: 4,
      alter: 0,
      durationType: 'quarter',
      asChord: true,
    },
  ]);
  const sourceChord = chordState.coreDocument?.score.parts[0]?.staves[0]?.measures[0]?.voices[0]?.events
    .filter((event) => event.kind === 'note' && event.timestampNum === 0) ?? [];
  assert.equal(sourceChord.length, 2);

  const result = applyDocumentCommands(chordState, sourceChord.map((event) => ({
    type: 'toggleTie' as const,
    coreEntityId: event.id,
    measureNumber: 1,
    staffIndex: 1,
    voiceId: 1,
    timestampNum: event.timestampNum,
    timestampDen: event.timestampDen,
    step: event.kind === 'note' ? event.pitch.step : undefined,
    octave: event.kind === 'note' ? event.pitch.octave : undefined,
    alter: event.kind === 'note' ? event.pitch.alter : undefined,
  })));

  const tiedSource = result.coreDocument?.score.parts[0]?.staves[0]?.measures[0]?.voices[0]?.events
    .filter((event) => event.kind === 'note' && event.timestampNum === 0) ?? [];
  assert.equal(tiedSource.length, 2);
  assert.equal(
    tiedSource.every((event) => event.tieStart),
    true,
    JSON.stringify(result.coreDocument?.score.parts[0]?.staves[0]?.measures[0]?.voices[0]?.events),
  );
  assert.equal((result.xml.match(/<tie type="start"\/>/g) ?? []).length, 2);
  assert.equal((result.xml.match(/<tied type="start"\/>/g) ?? []).length, 2);
  assert.equal((result.xml.match(/<tied type="stop"\/>/g) ?? []).length, 2);

  const roundtripped = importMusicXmlToCore(result.xml);
  const roundtrippedSource = roundtripped.score.parts[0]!.staves[0]!.measures[0]!.voices[0]!.events
    .filter((event) => event.kind === 'note' && event.timestampNum === 0);
  assert.equal(roundtrippedSource.every((event) => event.tieStart), true);
});

test('deleteNote and pitch changes repair tie continuity on the preceding note', () => {
  const tieReadyXml = SAMPLE_XML.replace(
    '</measure>',
    `<note>
      <pitch><step>C</step><octave>4</octave></pitch>
      <duration>3</duration>
      <voice>1</voice>
      <type>half</type>
      <dot/>
      <staff>1</staff>
    </note></measure>`,
  );
  const tied = applyDocumentCommands(buildDocumentState(tieReadyXml), [
    { type: 'toggleTie', measureNumber: 1, staffIndex: 1, voiceId: 1, timestampNum: 0, timestampDen: 4 },
  ]);
  assert.match(tied.xml, /<tie type="start"\/>/);

  const deletedContinuation = applyDocumentCommands(tied, [
    { type: 'deleteNote', measureNumber: 1, staffIndex: 1, voiceId: 1, timestampNum: 1, timestampDen: 4 },
  ]);
  assert.doesNotMatch(deletedContinuation.xml, /<tie type="start"\/>/);
  assert.ok(!deletedContinuation.diagnostics.some((entry) => entry.code === 'tie_continuity'));

  const retied = applyDocumentCommands(buildDocumentState(tieReadyXml), [
    { type: 'toggleTie', measureNumber: 1, staffIndex: 1, voiceId: 1, timestampNum: 0, timestampDen: 4 },
  ]);
  const changedPitch = applyDocumentCommands(retied, [
    { type: 'changeNotePitch', measureNumber: 1, staffIndex: 1, voiceId: 1, timestampNum: 1, timestampDen: 4, step: 'D', octave: 4, alter: 0 },
  ]);
  assert.doesNotMatch(changedPitch.xml, /<tie type="start"\/>/);
  assert.ok(!changedPitch.diagnostics.some((entry) => entry.code === 'tie_continuity'));
});

test('addDynamic replaces the existing semantic dynamic at the same slot and updates placement', () => {
  const first = applyDocumentCommands(buildDocumentState(SAMPLE_XML), [
    { type: 'addDynamic', measureNumber: 1, staffIndex: 1, voiceId: 1, timestampNum: 0, timestampDen: 4, dynamic: 'mf', placement: 'below' },
  ]);

  const second = applyDocumentCommands(first, [
    { type: 'addDynamic', measureNumber: 1, staffIndex: 1, voiceId: 1, timestampNum: 0, timestampDen: 4, dynamic: 'ff', placement: 'above' },
  ]);

  assert.equal(second.coreDocument?.score.parts[0].staves[0].measures[0].directions.filter((direction) => direction.kind === 'dynamics').length, 1);
  assert.match(second.xml, /<direction placement="above">[\s\S]*?<dynamics><ff\/><\/dynamics>/);
  assert.doesNotMatch(second.xml, /<dynamics><mf\/><\/dynamics>/);
});

test('dynamic placement and timestamp survive export and reimport on the core path', () => {
  const result = applyDocumentCommands(buildDocumentState(SAMPLE_XML), [
    { type: 'addDynamic', measureNumber: 1, staffIndex: 1, voiceId: 1, timestampNum: 0, timestampDen: 4, dynamic: 'mf', placement: 'above' },
  ]);

  assert.match(result.xml, /<offset>0<\/offset>/);

  const roundtripped = importMusicXmlToCore(result.xml);
  const dynamic = roundtripped.score.parts[0].staves[0].measures[0].directions.find((direction) => direction.kind === 'dynamics');
  assert.equal(dynamic?.placement, 'above');
  assert.equal(dynamic?.timestampNum, 0);
  assert.equal(dynamic?.timestampDen, 4);
});

test('right-side forward repeats survive export and reimport on the core path', () => {
  const result = applyDocumentCommands(buildDocumentState(SAMPLE_XML), [
    { type: 'setBarline', measureNumber: 1, barline: 'repeat-start' },
  ]);

  assert.match(result.xml, /<repeat direction="forward"\/>/);

  const roundtripped = importMusicXmlToCore(result.xml);
  assert.equal(roundtripped.score.parts[0].staves[0].measures[0].rightBarline, 'repeat-start');
});

test('clearArticulations removes notation data through the core path', () => {
  const withArticulation = applyDocumentCommands(buildDocumentState(SAMPLE_XML), [
    { type: 'toggleArticulation', measureNumber: 1, staffIndex: 1, voiceId: 1, timestampNum: 0, timestampDen: 4, articulation: 'accent' },
  ]);

  const cleared = applyDocumentCommands(withArticulation, [
    { type: 'clearArticulations', measureNumber: 1, staffIndex: 1, voiceId: 1, timestampNum: 0, timestampDen: 4 },
  ]);

  assert.ok(!/<accent\/>/.test(cleared.xml));
  assert.deepEqual(cleared.coreDocument?.score.parts[0].staves[0].measures[0].voices[0].events[0].articulations, []);
});

test('range commands clear articulations and delete notes semantically through the core path', () => {
  const extendedXml = SAMPLE_XML.replace(
    '</measure>',
    `<note>
      <pitch><step>D</step><octave>4</octave></pitch>
      <duration>1</duration>
      <voice>1</voice>
      <type>quarter</type>
      <staff>1</staff>
      <notations><articulations><accent/></articulations></notations>
    </note></measure>`,
  );

  const cleared = applyDocumentCommands(buildDocumentState(extendedXml), [
    {
      type: 'clearRangeArticulations',
      range: {
        start: { measureNumber: 1, staffIndex: 1, voiceId: 1, timestampNum: 0, timestampDen: 4 },
        end: { measureNumber: 1, staffIndex: 1, voiceId: 1, timestampNum: 1, timestampDen: 4 },
      },
    },
  ]);
  assert.ok(cleared.coreDocument?.score.parts[0].staves[0].measures[0].voices[0].events.every((event) => (event.articulations ?? []).length === 0));

  const deleted = applyDocumentCommands(buildDocumentState(extendedXml), [
    {
      type: 'deleteRange',
      range: {
        start: { measureNumber: 1, staffIndex: 1, voiceId: 1, timestampNum: 0, timestampDen: 4 },
        end: { measureNumber: 1, staffIndex: 1, voiceId: 1, timestampNum: 1, timestampDen: 4 },
      },
    },
  ]);
  assert.ok(deleted.coreDocument?.score.parts[0].staves[0].measures[0].voices[0].events.slice(0, 2).every((event) => event.kind === 'rest'));
});

test('applyDocumentCommands covers remaining legacy-era commands through the core path', () => {
  const result = applyDocumentCommands(buildDocumentState(SAMPLE_XML), [
    { type: 'setTempo', bpm: 132 },
    { type: 'addStartRepeat' },
    { type: 'addEndRepeat', measureNumber: 1 },
    { type: 'setEnding', measureNumber: 1, number: '1', endingType: 'start' },
    { type: 'addRehearsalMark', measureNumber: 1, text: 'A' },
    { type: 'addWords', measureNumber: 1, text: 'dolce', placement: 'above' },
    { type: 'addChords', chords: '1:G' },
    { type: 'setSystemBreak', measureNumber: 1, value: true },
    { type: 'setPageBreak', measureNumber: 1, value: true },
    { type: 'duplicateNote', measureNumber: 1, staffIndex: 1, voiceId: 1, timestampNum: 0, timestampDen: 4 },
  ]);

  assert.match(result.xml, /<per-minute>132<\/per-minute>/);
  assert.match(result.xml, /<repeat direction="forward"\/>/);
  assert.match(result.xml, /<repeat direction="backward"\/>/);
  assert.match(result.xml, /<ending number="1" type="start"\/>/);
  assert.match(result.xml, /<rehearsal>A<\/rehearsal>/);
  assert.match(result.xml, /<words>dolce<\/words>/);
  assert.match(result.xml, /<harmony>/);
  assert.match(result.xml, /new-system="yes"/);
  assert.match(result.xml, /new-page="yes"/);
  assert.equal(result.coreDocument?.score.parts[0].staves[0].measures[0].leftBarline, 'repeat-start');
  assert.equal(result.coreDocument?.score.parts[0].staves[0].measures[0].rightBarline, 'repeat-end');
  assert.equal(result.coreDocument?.score.parts[0].staves[0].measures[0].leftEnding?.number, '1');
  assert.ok((result.coreDocument?.score.parts[0].staves[0].measures[0].print?.newSystem));
  assert.ok((result.coreDocument?.score.parts[0].staves[0].measures[0].print?.newPage));
  assert.equal(result.coreDocument?.score.parts[0].staves[0].measures[0].voices[0].events.length, 3);
  assert.ok(!result.diagnostics.some((entry) => ['measure_balance', 'voice_rhythm_sum_mismatch', 'voice_timeline_gap'].includes(entry.code)));
  assert.ok(result.diagnostics.some((entry) => entry.code === 'core_execution'));
  assert.ok(!result.diagnostics.some((entry) => entry.code === 'legacy_fallback'));
});

test('applyDocumentCommands can add rehearsal marks on a fixed interval through the core path', () => {
  const fourMeasureXml = `<?xml version="1.0" encoding="UTF-8"?>
<score-partwise version="3.1">
  <part-list><score-part id="P1"><part-name>Lead</part-name></score-part></part-list>
  <part id="P1">
    ${Array.from({ length: 8 }, (_, index) => `<measure number="${index + 1}">${index === 0 ? '<attributes><divisions>1</divisions><time><beats>4</beats><beat-type>4</beat-type></time><clef><sign>G</sign><line>2</line></clef></attributes>' : ''}<note><pitch><step>C</step><octave>4</octave></pitch><duration>4</duration><voice>1</voice><type>whole</type><staff>1</staff></note></measure>`).join('')}
  </part>
</score-partwise>`;

  const result = applyDocumentCommands(buildDocumentState(fourMeasureXml), [
    { type: 'addRehearsalMarksEvery', interval: 4, style: 'letters' },
  ]);

  assert.match(result.xml, /<rehearsal>A<\/rehearsal>/);
  assert.match(result.xml, /<measure number="5">[\s\S]*?<rehearsal>B<\/rehearsal>/);
  assert.ok(result.diagnostics.some((entry) => entry.code === 'core_execution'));
});

test('applyDocumentCommands can fit notes into a target midi range by octave', () => {
  const highXml = SAMPLE_XML.replace('<octave>4</octave>', '<octave>7</octave>');
  const result = applyDocumentCommands(buildDocumentState(highXml), [
    { type: 'fitRangeOctaves', minMidi: 60, maxMidi: 84 },
  ]);

  assert.doesNotMatch(result.xml, /<octave>7<\/octave>/);
  assert.ok(result.diagnostics.some((entry) => entry.code === 'core_execution'));
});

test('applyDocumentCommands applies a practice layout profile semantically', () => {
  const multiMeasureXml = `<?xml version="1.0" encoding="UTF-8"?>
<score-partwise version="3.1">
  <part-list><score-part id="P1"><part-name>Lead</part-name></score-part></part-list>
  <part id="P1">
    ${Array.from({ length: 6 }, (_, index) => `<measure number="${index + 1}">${index === 0 ? '<attributes><divisions>1</divisions><time><beats>4</beats><beat-type>4</beat-type></time><clef><sign>G</sign><line>2</line></clef></attributes>' : ''}<note><pitch><step>C</step><octave>4</octave></pitch><duration>4</duration><voice>1</voice><type>whole</type><staff>1</staff></note></measure>`).join('')}
  </part>
</score-partwise>`;

  const result = applyDocumentCommands(buildDocumentState(multiMeasureXml), [
    { type: 'applyPracticeProfile', profile: 'rehearsal' },
  ]);

  assert.match(result.xml, /staff-distance/);
  assert.match(result.xml, /<measure number="5">[\s\S]*?<print new-system="yes"/);
  assert.ok(result.diagnostics.some((entry) => entry.code === 'core_execution'));
});

test('applyDocumentCommands can fit a part to a transposing instrument and preserve semantic notation helpers', () => {
  const twoMeasureXml = SAMPLE_XML.replace(
    '</measure>\n  </part>',
    '</measure><measure number="2"><note><pitch><step>D</step><octave>4</octave></pitch><duration>1</duration><voice>1</voice><type>quarter</type><staff>1</staff></note></measure>\n  </part>',
  );
  const result = applyDocumentCommands(buildDocumentState(twoMeasureXml), [
    { type: 'fitPartToInstrument', partId: 'P1', instrument: 'clarinet-bb' },
    { type: 'addExpressionText', measureNumber: 1, text: 'cantabile', placement: 'above' },
    { type: 'addFingering', measureNumber: 1, staffIndex: 1, voiceId: 1, timestampNum: 0, timestampDen: 4, fingering: '2' },
    { type: 'addOrnament', measureNumber: 1, staffIndex: 1, voiceId: 1, timestampNum: 0, timestampDen: 4, ornament: 'trill-mark' },
    { type: 'addPedalSpan', staffIndex: 1, startMeasureNumber: 1, startTimestampNum: 0, startTimestampDen: 4, stopMeasureNumber: 2, stopTimestampNum: 0, stopTimestampDen: 4 },
  ]);

  assert.match(result.xml, /<instrument-name>Clarinet in Bb<\/instrument-name>/);
  assert.match(result.xml, /<chromatic>2<\/chromatic>/);
  assert.match(result.xml, /<words>cantabile<\/words>/);
  assert.match(result.xml, /<technical><fingering>2<\/fingering><\/technical>/);
  assert.match(result.xml, /<ornaments><trill-mark\/><\/ornaments>/);
  assert.match(result.xml, /<pedal type="start"/);
  assert.match(result.xml, /<pedal type="stop"/);
  assert.ok(result.diagnostics.some((entry) => entry.code === 'core_execution'));
});

test('applyDocumentCommands can add expression text below the staff through the core path', () => {
  const result = applyDocumentCommands(buildDocumentState(SAMPLE_XML), [
    { type: 'addExpressionText', measureNumber: 1, text: 'sotto voce', placement: 'below' },
  ]);

  assert.match(result.xml, /<direction placement="below">[\s\S]*?<words>sotto voce<\/words>/);
  assert.equal(
    result.coreDocument?.score.parts[0].staves[0].measures[0].directions.find((direction) => direction.kind === 'words')?.placement,
    'below',
  );
});

test('applyDocumentCommands adds analysis annotations as visible score text', () => {
  const result = applyDocumentCommands(buildDocumentState(SAMPLE_XML), [
    { type: 'addAnalysisAnnotation', analysisType: 'romanNumeral', measureNumber: 1, text: 'I6 - V7 - I', placement: 'above' },
    { type: 'addAnalysisAnnotation', analysisType: 'forteSet', startMeasureNumber: 1, endMeasureNumber: 2, text: 'Forte 3-3 prime form (0,1,4)', placement: 'above' },
  ]);

  assert.match(result.xml, /<words>Roman numeral m\.1: I6 - V7 - I<\/words>/);
  assert.match(result.xml, /<words>Forte set m\.1-2: Forte 3-3 prime form \(0,1,4\)<\/words>/);
  assert.equal(result.coreDocument?.score.parts[0].staves[0].measures[0].directions.filter((direction) => direction.kind === 'words').length, 2);
});

test('applyDocumentCommands adds technique instructions as visible performance text', () => {
  const result = applyDocumentCommands(buildDocumentState(SAMPLE_XML), [
    {
      type: 'addTechniqueInstruction',
      instrument: 'violin',
      partId: 'P1',
      startMeasureNumber: 1,
      endMeasureNumber: 2,
      text: 'sul ponticello, high bow pressure, scratch tone',
    },
  ]);

  assert.match(result.xml, /<words>Technique \(violin, m\.1-2\): sul ponticello, high bow pressure, scratch tone<\/words>/);
});

test('applyDocumentCommands adds sync points with timecode, label, and scoring intent', () => {
  const result = applyDocumentCommands(buildDocumentState(SAMPLE_XML), [
    {
      type: 'addSyncPoint',
      measureNumber: 1,
      timestampNum: 2,
      timestampDen: 4,
      timecode: '01:02:03:12',
      label: 'door slam',
      scoringIntent: 'accent the hit and leave dialogue space',
    },
  ]);

  assert.match(result.xml, /<offset>2<\/offset>/);
  assert.match(result.xml, /<words>Sync 01:02:03:12 door slam: accent the hit and leave dialogue space<\/words>/);
});

test('applyDocumentCommands adds orchestration notes across a measure span', () => {
  const result = applyDocumentCommands(buildDocumentState(SAMPLE_XML), [
    {
      type: 'addOrchestrationNote',
      partId: 'P1',
      partName: 'Strings',
      startMeasureNumber: 1,
      endMeasureNumber: 4,
      instruction: 'thin inner divisi and keep flute/violin blend foregrounded',
    },
  ]);

  assert.match(result.xml, /<words>Orchestration \(Strings, m\.1-4\): thin inner divisi and keep flute\/violin blend foregrounded<\/words>/);
});

test('removeDirection removes measure text without touching notes', () => {
  const withWords = applyDocumentCommands(buildDocumentState(SAMPLE_XML), [
    { type: 'addWords', measureNumber: 1, text: 'dolce', placement: 'above' },
  ]);

  const result = applyDocumentCommands(withWords, [
    { type: 'removeDirection', measureNumber: 1, staffIndex: 1, kind: 'words', text: 'dolce' },
  ]);

  assert.doesNotMatch(result.xml, /<words>dolce<\/words>/);
  assert.equal(result.coreDocument?.score.parts[0].staves[0].measures[0].directions.some((direction) => direction.kind === 'words' && direction.value === 'dolce'), false);
  assert.equal(result.coreDocument?.score.parts[0].staves[0].measures[0].voices[0].events[0].kind, 'note');
});

test('removeArticulations clears articulation and dynamic data through the core path', () => {
  const withNotation = applyDocumentCommands(buildDocumentState(SAMPLE_XML), [
    { type: 'toggleArticulation', measureNumber: 1, staffIndex: 1, voiceId: 1, timestampNum: 0, timestampDen: 4, articulation: 'accent' },
    { type: 'addDynamic', measureNumber: 1, staffIndex: 1, voiceId: 1, timestampNum: 0, timestampDen: 4, dynamic: 'mf' },
  ]);

  const cleaned = applyDocumentCommands(withNotation, [
    { type: 'removeArticulations' },
  ]);

  assert.ok(!/<accent\/>/.test(cleaned.xml));
  assert.ok(!/<dynamics><mf\/><\/dynamics>/.test(cleaned.xml));
  assert.deepEqual(cleaned.coreDocument?.score.parts[0].staves[0].measures[0].voices[0].events[0].articulations, []);
});

test('parseIntentJSON extracts command JSON from provider text', () => {
  const parsed = parseIntentJSON('Here you go {"commands":[{"type":"setTempo","bpm":120}],"explanation":"Done"}');
  assert.equal(parsed?.commands?.length, 1);
  assert.equal(parsed?.explanation, 'Done');
});

test('parseIntentJSON ignores prose after a fenced JSON command block', () => {
  const parsed = parseIntentJSON([
    '```json',
    '{"commands":[{"type":"setTempo","bpm":96}],"explanation":"Tempo gesetzt.","confidence":"high","ambiguities":[],"plan":["Set tempo"]}',
    '```',
    'Self-correction: context also had {"unrelated":true}.',
  ].join('\n'));

  assert.equal(parsed?.commands?.length, 1);
  assert.equal(parsed?.explanation, 'Tempo gesetzt.');
});

test('import/export stays valid when direction-type contains whitespace text nodes', () => {
  const xmlWithWhitespaceDirection = `<?xml version="1.0" encoding="UTF-8"?>
<score-partwise version="3.1">
  <part-list>
    <score-part id="P1"><part-name>Piano</part-name></score-part>
  </part-list>
  <part id="P1">
    <measure number="1">
      <attributes>
        <divisions>1</divisions>
        <time><beats>4</beats><beat-type>4</beat-type></time>
      </attributes>
      <direction placement="above">
        <direction-type>
          <words>dolce</words>
        </direction-type>
        <staff>1</staff>
      </direction>
      <note>
        <pitch><step>C</step><octave>4</octave></pitch>
        <duration>1</duration>
        <voice>1</voice>
        <type>quarter</type>
        <staff>1</staff>
      </note>
    </measure>
  </part>
</score-partwise>`;

  const result = applyDocumentCommands(buildDocumentState(xmlWithWhitespaceDirection), [
    { type: 'changeNotePitch', measureNumber: 1, staffIndex: 1, voiceId: 1, timestampNum: 0, timestampDen: 4, step: 'D', octave: 4, alter: 0 },
  ]);

  assert.match(result.xml, /<words>dolce<\/words>/);
  assert.match(result.xml, /<step>D<\/step>/);
  assert.doesNotMatch(result.xml, /<#text>/);
});

test('extractNotePitchSnapshot reads the true pitch from xml', () => {
  const snapshot = extractNotePitchSnapshot(SAMPLE_XML, {
    measureNumber: 1,
    staffIndex: 1,
    voiceId: 1,
    timestampNum: 0,
    timestampDen: 4,
  });

  assert.equal(snapshot?.step, 'C');
  assert.equal(snapshot?.octave, 4);
  assert.equal(snapshot?.alter, 0);
  assert.equal(snapshot?.isRest, false);
});

test('findNoteElement resolves notes correctly in multi-voice measures', () => {
  const multiVoiceXml = `<?xml version="1.0" encoding="UTF-8"?>
<score-partwise version="3.1">
  <part-list>
    <score-part id="P1"><part-name>Piano</part-name></score-part>
  </part-list>
  <part id="P1">
    <measure number="1">
      <attributes>
        <divisions>1</divisions>
        <time><beats>4</beats><beat-type>4</beat-type></time>
      </attributes>
      <note>
        <pitch><step>C</step><octave>4</octave></pitch>
        <duration>2</duration>
        <voice>1</voice>
        <type>half</type>
        <staff>1</staff>
      </note>
      <backup><duration>2</duration></backup>
      <note>
        <pitch><step>G</step><octave>3</octave></pitch>
        <duration>1</duration>
        <voice>2</voice>
        <type>quarter</type>
        <staff>1</staff>
      </note>
    </measure>
  </part>
</score-partwise>`;

  const result = applyDocumentCommands(buildDocumentState(multiVoiceXml), [
    { type: 'changeNotePitch', measureNumber: 1, staffIndex: 1, voiceId: 2, timestampNum: 0, timestampDen: 4, step: 'A', octave: 3, alter: 0 },
  ]);

  assert.match(result.xml, /<step>A<\/step>[\s\S]*?<voice>2<\/voice>/);
  assert.match(result.xml, /<step>C<\/step>[\s\S]*?<voice>1<\/voice>/);
});

test('applyDocumentCommands keeps multi-voice backup/forward scores on the core path', () => {
  const multiVoiceXml = `<?xml version="1.0" encoding="UTF-8"?>
<score-partwise version="3.1">
  <part-list>
    <score-part id="P1"><part-name>Piano</part-name></score-part>
  </part-list>
  <part id="P1">
    <measure number="1">
      <attributes>
        <divisions>1</divisions>
        <time><beats>4</beats><beat-type>4</beat-type></time>
      </attributes>
      <note>
        <pitch><step>C</step><octave>4</octave></pitch>
        <duration>2</duration>
        <voice>1</voice>
        <type>half</type>
        <staff>1</staff>
      </note>
      <backup><duration>2</duration></backup>
      <note>
        <pitch><step>G</step><octave>3</octave></pitch>
        <duration>1</duration>
        <voice>2</voice>
        <type>quarter</type>
        <staff>1</staff>
      </note>
    </measure>
  </part>
</score-partwise>`;

  const result = applyDocumentCommands(buildDocumentState(multiVoiceXml), [
    { type: 'changeNotePitch', measureNumber: 1, staffIndex: 1, voiceId: 2, timestampNum: 0, timestampDen: 4, step: 'A', octave: 3, alter: 0 },
  ]);

  assert.match(result.xml, /<backup><duration>2<\/duration><\/backup>/);
  assert.match(result.xml, /<step>A<\/step>[\s\S]*?<voice>2<\/voice>/);
  assert.ok(result.diagnostics.some((entry) => entry.code === 'core_execution'));
  assert.ok(!result.diagnostics.some((entry) => entry.code === 'legacy_fallback'));
});
