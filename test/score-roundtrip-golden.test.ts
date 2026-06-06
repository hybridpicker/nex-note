import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { importMusicXmlToCore } from '../src/musicxml-adapter/import/import-musicxml.ts';
import { exportCoreToMusicXml } from '../src/musicxml-adapter/export/export-core-to-musicxml.ts';
import { applyCoreCommands } from '../src/score-core/commands/core-command-executor.ts';
import { applyDocumentCommands, buildDocumentState } from '../src/score-core/commands/apply-document-commands.ts';
import { validateScoreDocument } from '../src/score-core/validation/validate-score-document.ts';

function loadFixture(name: string) {
  return readFileSync(path.join(process.cwd(), 'test', 'fixtures', name), 'utf8');
}

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

const UNBEAMED_EIGHTHS_XML = `<?xml version="1.0" encoding="UTF-8"?>
<score-partwise version="3.1">
  <part-list>
    <score-part id="P1"><part-name>Piano</part-name></score-part>
  </part-list>
  <part id="P1">
    <measure number="1">
      <attributes>
        <divisions>2</divisions>
        <time><beats>4</beats><beat-type>4</beat-type></time>
        <clef><sign>G</sign><line>2</line></clef>
      </attributes>
      <note><pitch><step>C</step><octave>4</octave></pitch><duration>1</duration><voice>1</voice><type>eighth</type><staff>1</staff></note>
      <note><pitch><step>D</step><octave>4</octave></pitch><duration>1</duration><voice>1</voice><type>eighth</type><staff>1</staff></note>
      <note><pitch><step>E</step><octave>4</octave></pitch><duration>1</duration><voice>1</voice><type>eighth</type><staff>1</staff></note>
      <note><pitch><step>F</step><octave>4</octave></pitch><duration>1</duration><voice>1</voice><type>eighth</type><staff>1</staff></note>
      <note><pitch><step>G</step><octave>4</octave></pitch><duration>1</duration><voice>1</voice><type>eighth</type><staff>1</staff></note>
      <note><pitch><step>A</step><octave>4</octave></pitch><duration>1</duration><voice>1</voice><type>eighth</type><staff>1</staff></note>
      <note><pitch><step>B</step><octave>4</octave></pitch><duration>1</duration><voice>1</voice><type>eighth</type><staff>1</staff></note>
      <note><pitch><step>C</step><octave>5</octave></pitch><duration>1</duration><voice>1</voice><type>eighth</type><staff>1</staff></note>
    </measure>
  </part>
</score-partwise>`;

const BEAMED_CHORD_EIGHTHS_XML = `<?xml version="1.0" encoding="UTF-8"?>
<score-partwise version="3.1">
  <part-list>
    <score-part id="P1"><part-name>Piano</part-name></score-part>
  </part-list>
  <part id="P1">
    <measure number="1">
      <attributes>
        <divisions>2</divisions>
        <time><beats>4</beats><beat-type>4</beat-type></time>
        <clef><sign>G</sign><line>2</line></clef>
      </attributes>
      <note>
        <pitch><step>C</step><octave>4</octave></pitch>
        <duration>1</duration>
        <voice>1</voice>
        <type>eighth</type>
        <beam number="1">begin</beam>
      </note>
      <note>
        <chord/>
        <pitch><step>E</step><octave>4</octave></pitch>
        <duration>1</duration>
        <voice>1</voice>
        <type>eighth</type>
        <beam number="1">continue</beam>
      </note>
      <note>
        <pitch><step>D</step><octave>4</octave></pitch>
        <duration>1</duration>
        <voice>1</voice>
        <type>eighth</type>
        <beam number="1">end</beam>
      </note>
    </measure>
  </part>
</score-partwise>`;

const HARMONY_KIND_XML = `<?xml version="1.0" encoding="UTF-8"?>
<score-partwise version="4.0">
  <part-list>
    <score-part id="P1"><part-name>Lead</part-name></score-part>
  </part-list>
  <part id="P1">
    <measure number="1">
      <attributes>
        <divisions>1</divisions>
        <time><beats>4</beats><beat-type>4</beat-type></time>
        <clef><sign>G</sign><line>2</line></clef>
      </attributes>
      <harmony>
        <root><root-step>C</root-step></root>
        <kind>minor-seventh</kind>
      </harmony>
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

const SWING_PLAYBACK_XML = `<?xml version="1.0" encoding="UTF-8"?>
<score-partwise version="4.0">
  <part-list>
    <score-part id="P1"><part-name>Piano</part-name></score-part>
  </part-list>
  <part id="P1">
    <measure number="1">
      <attributes>
        <divisions>2</divisions>
        <time><beats>4</beats><beat-type>4</beat-type></time>
        <clef><sign>G</sign><line>2</line></clef>
      </attributes>
      <direction directive="yes" placement="above">
        <direction-type><words>Swing</words></direction-type>
        <sound>
          <swing>
            <first>2</first>
            <second>1</second>
            <swing-type>eighth</swing-type>
          </swing>
        </sound>
        <staff>1</staff>
      </direction>
      <note><pitch><step>C</step><octave>4</octave></pitch><duration>1</duration><voice>1</voice><type>eighth</type><staff>1</staff></note>
      <note><pitch><step>D</step><octave>4</octave></pitch><duration>1</duration><voice>1</voice><type>eighth</type><staff>1</staff></note>
    </measure>
  </part>
</score-partwise>`;

function summarizeSemantics(xml: string) {
  const core = importMusicXmlToCore(xml);
  const allMeasures = core.score.parts.flatMap((part) => part.staves.flatMap((staff) => staff.measures));
  return {
    parts: core.score.parts.length,
    notes: core.score.parts.flatMap((part) => part.staves.flatMap((staff) => staff.measures.flatMap((measure) => measure.voices.flatMap((voice) => voice.events)))).length,
    slurs: core.slurs.length,
    beams: core.beams.length,
    tuplets: core.tuplets.length,
    chordGroups: core.chordGroups.length,
    graceNotes: core.graceNotes.length,
    lyricLines: core.lyricLines.length,
    layoutHints: core.layoutHints.length,
    endingMarkers: allMeasures.filter((m) => m.leftEnding || m.rightEnding).length,
  };
}

test('imports MusicXML harmony kind text when kind attribute text is absent', () => {
  const core = importMusicXmlToCore(HARMONY_KIND_XML);
  const harmony = core.score.parts[0]?.staves[0]?.measures[0]?.directions.find((direction) => direction.kind === 'harmony');
  assert.equal(harmony?.value, 'Cmin7');
});

test('exports common chord-symbol suffixes as standard MusicXML harmony kinds', () => {
  const core = importMusicXmlToCore(HARMONY_KIND_XML);
  const measure = core.score.parts[0]?.staves[0]?.measures[0];
  assert.ok(measure);
  measure.directions = [
    {
      id: 'harmony:1:0',
      kind: 'harmony',
      value: 'C',
      measureNumber: 1,
    },
    {
      id: 'harmony:1:1',
      kind: 'harmony',
      value: 'Cmin7',
      measureNumber: 1,
    },
    {
      id: 'harmony:1:2',
      kind: 'harmony',
      value: 'F7',
      measureNumber: 1,
    },
    {
      id: 'harmony:1:3',
      kind: 'harmony',
      value: 'Bbmaj7',
      measureNumber: 1,
    },
    {
      id: 'harmony:1:4',
      kind: 'harmony',
      value: 'FISMAL7b5',
      measureNumber: 1,
    },
    {
      id: 'harmony:1:5',
      kind: 'harmony',
      value: 'Asus4',
      measureNumber: 1,
    },
    {
      id: 'harmony:1:6',
      kind: 'harmony',
      value: 'Bb7#11',
      measureNumber: 1,
    },
  ];

  const exported = exportCoreToMusicXml(HARMONY_KIND_XML, core);

  assert.match(exported, /<root-step>C<\/root-step>\s*<\/root>\s*<kind>major<\/kind>/);
  assert.match(exported, /<root-step>C<\/root-step>\s*<\/root>\s*<kind text="min7">minor-seventh<\/kind>/);
  assert.match(exported, /<root-step>F<\/root-step>\s*<\/root>\s*<kind text="7">dominant<\/kind>/);
  assert.match(exported, /<root-step>B<\/root-step>\s*<root-alter>-1<\/root-alter>\s*<\/root>\s*<kind text="maj7">major-seventh<\/kind>/);
  assert.match(exported, /<root-step>F<\/root-step>\s*<root-alter>1<\/root-alter>\s*<\/root>\s*<kind text="m7b5">half-diminished<\/kind>/);
  assert.match(exported, /<root-step>A<\/root-step>\s*<\/root>\s*<kind text="sus4">suspended-fourth<\/kind>/);
  assert.match(exported, /<words>Bb7#11<\/words>/);
});

test('imports and exports MusicXML swing playback as document swing', () => {
  const core = importMusicXmlToCore(SWING_PLAYBACK_XML);
  assert.equal(core.swingRatio, 2 / 3);
  assert.equal(core.swingUnit, 'eighth');
  assert.ok(!core.score.parts[0]?.staves[0]?.measures[0]?.directions.some((direction) => direction.kind === 'words' && direction.value === 'Swing'));

  const exported = exportCoreToMusicXml(SWING_PLAYBACK_XML, core);
  assert.match(exported, /<swing>/);
  assert.match(exported, /<first>2<\/first>/);
  assert.match(exported, /<second>1<\/second>/);
  assert.match(exported, /<swing-type>eighth<\/swing-type>/);

  const reimported = importMusicXmlToCore(exported);
  assert.equal(reimported.swingRatio, 2 / 3);
  assert.equal(reimported.swingUnit, 'eighth');
});

for (const fixture of [
  'choir-lyrics.musicxml',
  'piano-semantics.musicxml',
  'leadsheet-repeat.musicxml',
  'cross-measure-tie.musicxml',
  'repeat-ending-sequence.musicxml',
  'volta-two-ending.musicxml',
  'multi-ending.musicxml',
  'wedge-directions.musicxml',
]) {
  test(`golden roundtrip preserves semantics for ${fixture}`, () => {
    const xml = loadFixture(fixture);
    const imported = importMusicXmlToCore(xml);
    const exported = exportCoreToMusicXml(xml, imported);
    const reimported = summarizeSemantics(exported);

    assert.match(exported, /<score-partwise/);
    assert.deepEqual(reimported, summarizeSemantics(xml));
  });
}

test('setMeasureLayoutHint writes semantic layout hints through the core path', () => {
  const xml = loadFixture('choir-lyrics.musicxml');
  const result = applyDocumentCommands(buildDocumentState(xml), [
    { type: 'setMeasureLayoutHint', measureNumber: 1, hint: 'staffSpacing', value: 104, staffIndex: 1, partId: 'P1' },
  ]);

  assert.match(result.xml, /<staff-distance>104<\/staff-distance>/);
  assert.equal(result.coreDocument?.layoutHints.find((hint) => hint.kind === 'staffSpacing')?.value, 104);
  assert.ok(result.diagnostics.some((entry) => entry.code === 'core_execution'));
});

test('import preserves volta ending barline side: leadsheet right-barline ending', () => {
  const xml = loadFixture('leadsheet-repeat.musicxml');
  const core = importMusicXmlToCore(xml);
  const measure1 = core.score.parts[0].staves[0].measures[0];
  assert.ok(!measure1.leftEnding, 'leadsheet measure 1 has no left ending');
  assert.deepEqual(measure1.rightEnding, { number: '1', type: 'start' });
});

test('import preserves volta ending barline side: standard two-ending volta', () => {
  const xml = loadFixture('volta-two-ending.musicxml');
  const core = importMusicXmlToCore(xml);
  const [m1, m2, m3] = core.score.parts[0].staves[0].measures;
  assert.ok(!m1.leftEnding && !m1.rightEnding, 'measure 1 has no endings');
  assert.deepEqual(m2.leftEnding, { number: '1', type: 'start' });
  assert.deepEqual(m2.rightEnding, { number: '1', type: 'stop' });
  assert.deepEqual(m3.leftEnding, { number: '2', type: 'start' });
  assert.deepEqual(m3.rightEnding, { number: '2', type: 'discontinue' });
});

test('export writes rightEnding to right barline, not left', () => {
  const xml = loadFixture('leadsheet-repeat.musicxml');
  const core = importMusicXmlToCore(xml);
  const exported = exportCoreToMusicXml(xml, core);
  // Verify via re-import that ending placement is preserved on the right barline
  const reimported = importMusicXmlToCore(exported);
  const m1 = reimported.score.parts[0].staves[0].measures[0];
  assert.ok(!m1.leftEnding, 'ending must not be on left barline after roundtrip');
  assert.deepEqual(m1.rightEnding, { number: '1', type: 'start' });
});

test('export preserves trailing rests after a whole-rest measure is split by insertNoteAt', () => {
  const core = applyCoreCommands(importMusicXmlToCore(FULL_REST_XML), [{
    type: 'insertNoteAt',
    schemaVersion: 1,
    category: 'content',
    target: { scope: 'document' },
    payload: {},
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
  const exported = exportCoreToMusicXml(FULL_REST_XML, core);
  const voice = importMusicXmlToCore(exported).score.parts[0]?.staves[0]?.measures[0]?.voices[0];

  assert.ok(voice);
  assert.deepEqual(
    voice.events.map((event) => (
      `${event.timestampNum}/${event.timestampDen}:${event.kind === 'note' ? `${event.pitch.step}${event.pitch.octave}` : 'rest'}:${event.durationDivisions}`
    )),
    ['0/4:rest:1', '1/4:C4:1', '2/4:rest:2'],
  );
});

test('export writes leftEnding to left barline for standard volta structure', () => {
  const xml = loadFixture('volta-two-ending.musicxml');
  const core = importMusicXmlToCore(xml);
  const exported = exportCoreToMusicXml(xml, core);
  assert.match(exported, /location="left"[\s\S]*?ending number="1" type="start"/);
  assert.match(exported, /location="right"[\s\S]*?ending number="1" type="stop"/);
  assert.match(exported, /location="left"[\s\S]*?ending number="2" type="start"/);
  assert.match(exported, /location="right"[\s\S]*?ending number="2" type="discontinue"/);
});

test('core edits rebuild default beam groups for unbeamed eighth-note runs', () => {
  const result = applyDocumentCommands(buildDocumentState(UNBEAMED_EIGHTHS_XML), [
    { type: 'changeNotePitch', measureNumber: 1, staffIndex: 1, voiceId: 1, timestampNum: 0, timestampDen: 4, step: 'B', octave: 4, alter: 0 },
  ]);

  assert.deepEqual(result.coreDocument?.beams.map((beam) => beam.eventIds.length), [4, 4]);
  assert.match(result.xml, /<beam number="1">begin<\/beam>/);
  assert.match(result.xml, /<beam number="1">continue<\/beam>/);
  assert.match(result.xml, /<beam number="1">end<\/beam>/);
});

test('setEnding with type start writes leftEnding through core path', () => {
  const xml = loadFixture('repeat-ending-sequence.musicxml');
  const result = applyDocumentCommands(buildDocumentState(xml), [
    { type: 'setEnding', measureNumber: 3, number: '2', endingType: 'start' },
  ]);
  const measure3 = result.coreDocument?.score.parts[0].staves[0].measures[2];
  assert.deepEqual(measure3?.leftEnding, { number: '2', type: 'start' });
  assert.ok(!measure3?.rightEnding);
  assert.match(result.xml, /<ending number="2" type="start"\/>/);
});

test('setEnding with type stop writes rightEnding through core path', () => {
  const xml = loadFixture('repeat-ending-sequence.musicxml');
  const result = applyDocumentCommands(buildDocumentState(xml), [
    { type: 'setEnding', measureNumber: 2, number: '1', endingType: 'stop' },
  ]);
  const measure2 = result.coreDocument?.score.parts[0].staves[0].measures[1];
  assert.deepEqual(measure2?.rightEnding, { number: '1', type: 'stop' });
  assert.ok(!measure2?.leftEnding);
});

test('setLyricLine stores multi-verse lyrics semantically through the core path', () => {
  const xml = loadFixture('choir-lyrics.musicxml');
  const result = applyDocumentCommands(buildDocumentState(xml), [
    { type: 'setLyricLine', measureNumber: 1, staffIndex: 1, voiceId: 1, timestampNum: 0, timestampDen: 8, verseNumber: 3, text: 'Lux', syllabic: 'single' },
  ]);

  assert.match(result.xml, /<lyric number="3">/);
  assert.equal(result.coreDocument?.lyricLines.find((line) => line.verseNumber === 3)?.text, 'Lux');
  assert.ok(result.diagnostics.some((entry) => entry.code === 'core_execution'));
});

test('removeLyricLine removes only the targeted verse from a note', () => {
  const xml = loadFixture('choir-lyrics.musicxml');
  const result = applyDocumentCommands(buildDocumentState(xml), [
    { type: 'removeLyricLine', measureNumber: 1, staffIndex: 1, voiceId: 1, timestampNum: 0, timestampDen: 8, verseNumber: 2 },
  ]);

  assert.doesNotMatch(result.xml, /<lyric number="2"><syllabic>begin<\/syllabic><text>Glo<\/text><\/lyric>/);
  assert.match(result.xml, /<lyric><syllabic>begin<\/syllabic><text>Hal<\/text><\/lyric>/);
  assert.equal(result.coreDocument?.lyricLines.some((line) => line.verseNumber === 2 && line.text === 'Glo'), false);
  assert.ok(result.diagnostics.some((entry) => entry.code === 'core_execution'));
});

// --- Phase 3 Slice 2: Repeat / volta semantics ---

test('validator emits no ending_without_repeat for standard 2nd ending after repeat-end', () => {
  const xml = loadFixture('volta-two-ending.musicxml');
  const core = importMusicXmlToCore(xml);
  const diagnostics = validateScoreDocument(core);
  const spurious = diagnostics.filter((d) => d.code === 'ending_without_repeat');
  assert.equal(spurious.length, 0, 'standard 2nd ending must not trigger ending_without_repeat');
});

test('validator emits no ending_without_repeat for multi-number ending after repeat-end', () => {
  const xml = loadFixture('multi-ending.musicxml');
  const core = importMusicXmlToCore(xml);
  const diagnostics = validateScoreDocument(core);
  assert.equal(diagnostics.filter((d) => d.code === 'ending_without_repeat').length, 0);
  assert.equal(diagnostics.filter((d) => d.code === 'ending_stop_without_start').length, 0);
});

test('import normalizes multi-number ending "1,2" — no whitespace around comma', () => {
  const xml = loadFixture('multi-ending.musicxml');
  const core = importMusicXmlToCore(xml);
  const m2 = core.score.parts[0].staves[0].measures[1];
  assert.deepEqual(m2.leftEnding, { number: '1,2', type: 'start' });
  assert.deepEqual(m2.rightEnding, { number: '1,2', type: 'stop' });
});

test('roundtrip preserves multi-number ending "1,2" through export and reimport', () => {
  const xml = loadFixture('multi-ending.musicxml');
  const core = importMusicXmlToCore(xml);
  const exported = exportCoreToMusicXml(xml, core);
  const reimported = importMusicXmlToCore(exported);
  const m2 = reimported.score.parts[0].staves[0].measures[1];
  assert.deepEqual(m2.leftEnding, { number: '1,2', type: 'start' });
  assert.deepEqual(m2.rightEnding, { number: '1,2', type: 'stop' });
});

test('validator reports dangling_slur for a slur referencing an unknown event', () => {
  const xml = loadFixture('piano-semantics.musicxml');
  const core = importMusicXmlToCore(xml);
  // Inject a slur with a non-existent stop event.
  core.slurs.push({ id: 'slur:test:bad', number: 99, startEventId: 'event:unknown:x', stopEventId: undefined });
  const diagnostics = validateScoreDocument(core);
  assert.ok(diagnostics.some((d) => d.code === 'dangling_slur'));
});

test('validator reports dangling_grace_note for a grace note referencing an unknown event', () => {
  const xml = loadFixture('piano-semantics.musicxml');
  const core = importMusicXmlToCore(xml);
  core.graceNotes.push({ id: 'grace:bad', eventId: 'event:nonexistent' });
  const diagnostics = validateScoreDocument(core);
  assert.ok(diagnostics.some((d) => d.code === 'dangling_grace_note'));
});

test('validator reports dangling_beam for a beam group referencing an unknown event', () => {
  const xml = loadFixture('piano-semantics.musicxml');
  const core = importMusicXmlToCore(xml);
  core.beams.push({ id: 'beam:bad', number: 1, eventIds: ['event:ghost'] });
  const diagnostics = validateScoreDocument(core);
  assert.ok(diagnostics.some((d) => d.code === 'dangling_beam'));
});

test('validator accepts beam groups that reference chord events sharing a timestamp', () => {
  const core = importMusicXmlToCore(BEAMED_CHORD_EIGHTHS_XML);
  assert.ok(core.beams.some((beam) => beam.eventIds.length === 3), 'fixture must import a beam over the chord and following eighth note');
  assert.equal(core.score.parts[0].staves[0].measures[0].voices[0].events.length, 3);
  assert.equal(Object.values(core.index.eventIds).length, 2, 'position index stores one event per timestamp');

  const diagnostics = validateScoreDocument(core);
  const danglingBeams = diagnostics.filter((d) => d.code === 'dangling_beam');

  assert.deepEqual(danglingBeams, []);
});

test('validator accepts MuseScore-style grace notes and tuplets with chord tones', () => {
  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<score-partwise version="3.1">
  <part-list>
    <score-part id="P1"><part-name>Glockenspiel</part-name></score-part>
  </part-list>
  <part id="P1">
    <measure number="1">
      <attributes>
        <divisions>12</divisions>
        <time><beats>4</beats><beat-type>4</beat-type></time>
        <clef><sign>G</sign><line>2</line></clef>
      </attributes>
      <note><grace slash="yes"/><pitch><step>E</step><octave>5</octave></pitch><voice>1</voice><type>eighth</type><staff>1</staff></note>
      <note><pitch><step>A</step><octave>5</octave></pitch><duration>48</duration><voice>1</voice><type>whole</type><staff>1</staff></note>
    </measure>
    <measure number="2">
      <note>
        <pitch><step>D</step><octave>4</octave></pitch>
        <duration>8</duration><voice>1</voice><type>quarter</type>
        <time-modification><actual-notes>3</actual-notes><normal-notes>2</normal-notes></time-modification>
        <notations><tuplet type="start" number="1" bracket="yes"/></notations>
        <staff>1</staff>
      </note>
      <note>
        <chord/><pitch><step>G</step><octave>4</octave></pitch>
        <duration>8</duration><voice>1</voice><type>quarter</type>
        <time-modification><actual-notes>3</actual-notes><normal-notes>2</normal-notes></time-modification>
        <staff>1</staff>
      </note>
      <note>
        <pitch><step>A</step><octave>4</octave></pitch>
        <duration>8</duration><voice>1</voice><type>quarter</type>
        <time-modification><actual-notes>3</actual-notes><normal-notes>2</normal-notes></time-modification>
        <staff>1</staff>
      </note>
      <note>
        <pitch><step>B</step><octave>4</octave></pitch>
        <duration>8</duration><voice>1</voice><type>quarter</type>
        <time-modification><actual-notes>3</actual-notes><normal-notes>2</normal-notes></time-modification>
        <notations><tuplet type="stop" number="1"/></notations>
        <staff>1</staff>
      </note>
      <note><rest/><duration>24</duration><voice>1</voice><type>half</type><staff>1</staff></note>
    </measure>
  </part>
</score-partwise>`;

  const diagnostics = validateScoreDocument(importMusicXmlToCore(xml));
  const noisyCodes = diagnostics
    .filter((entry) => ['event_duration_notation_mismatch', 'tuplet_count_mismatch'].includes(entry.code))
    .map((entry) => entry.message);
  assert.deepEqual(noisyCodes, []);
});

test('validator does not emit dangling diagnostics for well-formed piano-semantics fixture', () => {
  const xml = loadFixture('piano-semantics.musicxml');
  const core = importMusicXmlToCore(xml);
  const diagnostics = validateScoreDocument(core);
  const dangling = diagnostics.filter((d) => ['dangling_slur', 'dangling_grace_note', 'dangling_beam'].includes(d.code));
  assert.equal(dangling.length, 0, 'well-formed fixture must not produce dangling-reference diagnostics');
});

test('export does not produce empty notations element for tuplet middle notes', () => {
  // Import a known fixture with tuplets and verify the export contains no bare <notations/>.
  const xml = loadFixture('piano-semantics.musicxml');
  const core = importMusicXmlToCore(xml);
  const exported = exportCoreToMusicXml(xml, core);
  // A bare <notations/> with no child content would only appear for middle-of-tuplet notes
  // that previously triggered the hasTupletNotation flag incorrectly.
  assert.ok(!exported.includes('<notations/>'), 'export must not produce empty notations elements');
});

test('export reconstructs tie stop markers for receiving notes so ties stay visible', () => {
  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<score-partwise version="3.1">
  <part-list>
    <score-part id="P1"><part-name>Test</part-name></score-part>
  </part-list>
  <part id="P1">
    <measure number="1">
      <attributes>
        <divisions>2</divisions>
        <time><beats>4</beats><beat-type>4</beat-type></time>
        <clef><sign>G</sign><line>2</line></clef>
      </attributes>
      <note>
        <pitch><step>C</step><octave>4</octave></pitch>
        <duration>4</duration>
        <tie type="start"/>
        <voice>1</voice>
        <type>half</type>
        <staff>1</staff>
        <notations><tied type="start"/></notations>
      </note>
      <note>
        <pitch><step>C</step><octave>4</octave></pitch>
        <duration>1</duration>
        <tie type="stop"/>
        <voice>1</voice>
        <type>eighth</type>
        <staff>1</staff>
        <notations><tied type="stop"/></notations>
      </note>
    </measure>
  </part>
</score-partwise>`;

  const core = importMusicXmlToCore(xml);
  const exported = exportCoreToMusicXml(xml, core);

  assert.match(exported, /<tie type="start"\/>/);
  assert.match(exported, /<tie type="stop"\/>/);
  assert.match(exported, /<tied type="start"\/>/);
  assert.match(exported, /<tied type="stop"\/>/);
});

test('export reconstructs tie stop markers for tied chord notes', () => {
  const xml = `<?xml version="1.0" encoding="UTF-8"?>
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
      <note><pitch><step>C</step><octave>4</octave></pitch><duration>4</duration><voice>1</voice><type>whole</type><staff>1</staff><tie type="start"/><notations><tied type="start"/></notations></note>
      <note><chord/><pitch><step>E</step><octave>4</octave></pitch><duration>4</duration><voice>1</voice><type>whole</type><staff>1</staff><tie type="start"/><notations><tied type="start"/></notations></note>
      <note><chord/><pitch><step>G</step><octave>4</octave></pitch><duration>4</duration><voice>1</voice><type>whole</type><staff>1</staff><tie type="start"/><notations><tied type="start"/></notations></note>
    </measure>
    <measure number="2">
      <note><pitch><step>C</step><octave>4</octave></pitch><duration>4</duration><voice>1</voice><type>whole</type><staff>1</staff></note>
      <note><chord/><pitch><step>E</step><octave>4</octave></pitch><duration>4</duration><voice>1</voice><type>whole</type><staff>1</staff></note>
      <note><chord/><pitch><step>G</step><octave>4</octave></pitch><duration>4</duration><voice>1</voice><type>whole</type><staff>1</staff></note>
    </measure>
  </part>
</score-partwise>`;

  const core = importMusicXmlToCore(xml);
  const exported = exportCoreToMusicXml(xml, core);
  assert.equal((exported.match(/<tie type="stop"\/>/g) ?? []).length, 3);
  assert.equal((exported.match(/<tied type="stop"\/>/g) ?? []).length, 3);
  assert.deepEqual(
    validateScoreDocument(importMusicXmlToCore(exported)).filter((entry) => entry.code === 'tie_continuity'),
    [],
  );
});

// --- Phase 3 Slice 3: wedge/ottava roundtrip, addTuplet, addGraceNote, addWedge ---

test('import reads crescendo wedge type as direction value', () => {
  const xml = loadFixture('wedge-directions.musicxml');
  const core = importMusicXmlToCore(xml);
  const m1 = core.score.parts[0].staves[0].measures[0];
  const crescendo = m1.directions.find((d) => d.kind === 'wedge' && d.value === 'crescendo');
  assert.ok(crescendo, 'measure 1 must have a crescendo wedge direction');
  assert.equal(crescendo?.number, 1);
  const stop = m1.directions.find((d) => d.kind === 'wedge' && d.value === 'stop');
  assert.ok(stop, 'measure 1 must have a wedge stop direction');
});

test('import reads diminuendo wedge and octave-shift in measure 2', () => {
  const xml = loadFixture('wedge-directions.musicxml');
  const core = importMusicXmlToCore(xml);
  const m2 = core.score.parts[0].staves[0].measures[1];
  assert.ok(m2.directions.some((d) => d.kind === 'wedge' && d.value === 'diminuendo'));
  const ottava = m2.directions.find((d) => d.kind === 'octave-shift' && d.value?.startsWith('down'));
  assert.ok(ottava, 'measure 2 must have an octave-shift direction');
  assert.match(ottava!.value!, /^down:8$/);
});

test('export writes wedge elements with type attribute and number', () => {
  const xml = loadFixture('wedge-directions.musicxml');
  const core = importMusicXmlToCore(xml);
  const exported = exportCoreToMusicXml(xml, core);
  assert.match(exported, /wedge type="crescendo"/);
  assert.match(exported, /wedge type="diminuendo"/);
  assert.match(exported, /wedge type="stop"/);
});

test('export writes octave-shift with type and size attributes', () => {
  const xml = loadFixture('wedge-directions.musicxml');
  const core = importMusicXmlToCore(xml);
  const exported = exportCoreToMusicXml(xml, core);
  assert.match(exported, /octave-shift type="down" size="8"/);
  assert.match(exported, /octave-shift type="stop"/);
});

test('wedge directions roundtrip through import and export without loss', () => {
  const xml = loadFixture('wedge-directions.musicxml');
  const core = importMusicXmlToCore(xml);
  const exported = exportCoreToMusicXml(xml, core);
  const reimported = importMusicXmlToCore(exported);
  const m1 = reimported.score.parts[0].staves[0].measures[0];
  const m2 = reimported.score.parts[0].staves[0].measures[1];
  assert.ok(m1.directions.some((d) => d.kind === 'wedge' && d.value === 'crescendo'));
  assert.ok(m2.directions.some((d) => d.kind === 'wedge' && d.value === 'diminuendo'));
  assert.ok(m2.directions.some((d) => d.kind === 'octave-shift' && d.value?.startsWith('down')));
});

test('addWedge command inserts crescendo start and stop directions through core path', () => {
  const xml = loadFixture('piano-semantics.musicxml');
  const core = importMusicXmlToCore(xml);
  const divisions = core.score.parts[0].staves[0].measures[0].attributes[0]?.divisions ?? 1;
  const result = applyDocumentCommands(buildDocumentState(xml), [
    {
      type: 'addWedge',
      kind: 'crescendo',
      staffIndex: 1,
      startMeasureNumber: 1,
      startTimestampNum: 0,
      startTimestampDen: divisions * 4,
      stopMeasureNumber: 1,
      stopTimestampNum: divisions * 2,
      stopTimestampDen: divisions * 4,
    },
  ]);
  const m1 = result.coreDocument?.score.parts[0].staves[0].measures[0];
  assert.ok(m1?.directions.some((d) => d.kind === 'wedge' && d.value === 'crescendo'));
  assert.ok(m1?.directions.some((d) => d.kind === 'wedge' && d.value === 'stop'));
  assert.match(result.xml, /wedge type="crescendo"/);
  assert.ok(result.diagnostics.some((d) => d.code === 'core_execution'));
});

test('addOttava command inserts octave-shift start and stop directions through core path', () => {
  const xml = loadFixture('piano-semantics.musicxml');
  const divisions = 4;
  const result = applyDocumentCommands(buildDocumentState(xml), [
    {
      type: 'addOttava',
      kind: '8va',
      staffIndex: 1,
      startMeasureNumber: 1,
      startTimestampNum: 0,
      startTimestampDen: divisions,
      stopMeasureNumber: 1,
      stopTimestampNum: 2,
      stopTimestampDen: divisions,
    },
  ]);
  const m1 = result.coreDocument?.score.parts[0].staves[0].measures[0];
  assert.ok(m1?.directions.some((d) => d.kind === 'octave-shift' && d.value === 'up:8'));
  assert.ok(m1?.directions.some((d) => d.kind === 'octave-shift' && d.value === 'stop:8'));
  assert.match(result.xml, /octave-shift type="up" size="8"/);
  assert.ok(result.diagnostics.some((d) => d.code === 'core_execution'));
});

test('addTuplet command creates a tuplet span for events in the given timestamp range', () => {
  const xml = loadFixture('piano-semantics.musicxml');
  const result = applyDocumentCommands(buildDocumentState(xml), [
    {
      type: 'addTuplet',
      measureNumber: 1,
      staffIndex: 1,
      voiceId: 1,
      startTimestampNum: 0,
      startTimestampDen: 4,
      stopTimestampNum: 2,
      stopTimestampDen: 4,
      actualNotes: 3,
      normalNotes: 2,
      bracket: true,
    },
  ]);
  assert.ok(result.coreDocument!.tuplets.length > 0, 'addTuplet must create at least one TupletSpan');
  const span = result.coreDocument!.tuplets[result.coreDocument!.tuplets.length - 1];
  assert.equal(span.actualNotes, 3);
  assert.equal(span.normalNotes, 2);
  assert.ok(result.diagnostics.some((d) => d.code === 'core_execution'));
});

test('addGraceNote marks an event as a grace note and removeGraceNote un-marks it', () => {
  // Use the simple single-voice volta fixture to avoid <forward>/<backup> tags
  // that would trigger the hybrid executor's safe-roundtrip guard.
  const xml = loadFixture('volta-two-ending.musicxml');
  const core = importMusicXmlToCore(xml);
  const firstEvent = core.score.parts[0].staves[0].measures[0].voices[0].events[0];
  const stateBefore = buildDocumentState(xml);

  const after = applyDocumentCommands(stateBefore, [
    {
      type: 'addGraceNote',
      measureNumber: firstEvent.measureNumber,
      staffIndex: firstEvent.staffIndex,
      voiceId: firstEvent.voiceId,
      timestampNum: firstEvent.timestampNum,
      timestampDen: firstEvent.timestampDen,
      slash: true,
    },
  ]);
  assert.ok(after.coreDocument!.graceNotes.some((g) => g.eventId === firstEvent.id && g.slash === true));
  assert.match(after.xml, /<grace slash="yes"/);

  const removed = applyDocumentCommands(after, [
    {
      type: 'removeGraceNote',
      measureNumber: firstEvent.measureNumber,
      staffIndex: firstEvent.staffIndex,
      voiceId: firstEvent.voiceId,
      timestampNum: firstEvent.timestampNum,
      timestampDen: firstEvent.timestampDen,
    },
  ]);
  assert.ok(!removed.coreDocument!.graceNotes.some((g) => g.eventId === firstEvent.id));
});

test('export keeps a grace note and its anchor note sequential instead of forcing a chord', () => {
  const xml = loadFixture('leadsheet-repeat.musicxml');
  const core = importMusicXmlToCore(xml);
  const exported = exportCoreToMusicXml(xml, core);

  assert.match(exported, /<grace slash="yes"\/>/);
  assert.doesNotMatch(exported, /<grace slash="yes"\/>[\s\S]*?<duration>0<\/duration>/);
  assert.doesNotMatch(
    exported,
    /<grace slash="yes"\/>[\s\S]*?<note><chord\/><pitch><step>C<\/step><octave>5<\/octave><\/pitch>/,
  );
});
