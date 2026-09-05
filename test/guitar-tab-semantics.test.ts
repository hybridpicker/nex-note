import test from 'node:test';
import { normalizeScoreCommands } from '../src/shared/schemas/score-command.ts';
import assert from 'node:assert/strict';

import { applyDocumentCommands } from '../src/score-core/commands/apply-document-commands.ts';
import { applyCoreCommands } from '../src/score-core/commands/core-command-executor.ts';
import { createDefaultNewScoreDraft, createNewScoreXml } from '../lib/new-score.ts';
import { exportCoreToMusicXml } from '../src/musicxml-adapter/export/export-core-to-musicxml.ts';
import { importMusicXmlToCore } from '../src/musicxml-adapter/import/import-musicxml.ts';
import type { ScoreDocumentModel } from '../src/score-core/model/types.ts';
import { resolveNextEnharmonicPitch } from '../src/shared/music/accidentals.ts';
import { validateScoreDocument } from '../src/score-core/validation/validate-score-document.ts';

const EMPTY_XML = `<?xml version="1.0" encoding="UTF-8"?>
<score-partwise version="3.1">
  <part-list><score-part id="P1"><part-name>Guitar</part-name></score-part></part-list>
  <part id="P1">
    <measure number="1">
      <attributes>
        <divisions>1</divisions>
        <time><beats>4</beats><beat-type>4</beat-type></time>
        <clef><sign>G</sign><line>2</line></clef>
      </attributes>
      <note><rest/><duration>4</duration><voice>1</voice><type>whole</type><staff>1</staff></note>
    </measure>
  </part>
</score-partwise>`;

const DUAL_STAFF_TAB_XML = `<?xml version="1.0" encoding="UTF-8"?>
<score-partwise version="3.1">
  <part-list><score-part id="P1"><part-name>Guitar</part-name></score-part></part-list>
  <part id="P1">
    <measure number="1">
      <attributes>
        <divisions>1</divisions>
        <time><beats>4</beats><beat-type>4</beat-type></time>
        <staves>2</staves>
        <clef number="1"><sign>G</sign><line>2</line></clef>
        <clef number="2"><sign>TAB</sign><line>5</line></clef>
      </attributes>
      <note><pitch><step>C</step><octave>4</octave></pitch><duration>1</duration><voice>1</voice><type>quarter</type><staff>1</staff></note>
      <backup><duration>1</duration></backup>
      <note><pitch><step>C</step><octave>3</octave></pitch><duration>1</duration><voice>1</voice><type>quarter</type><staff>2</staff><notations><technical><string>5</string><fret>3</fret></technical></notations></note>
    </measure>
  </part>
</score-partwise>`;

const DUAL_STAFF_TAB_XML_WITH_STAFF_DETAILS = DUAL_STAFF_TAB_XML.replace(
  '<clef number="2"><sign>TAB</sign><line>5</line></clef>',
  '<staff-details number="2"><staff-type>tab</staff-type><staff-lines>6</staff-lines></staff-details><clef number="2"><sign>TAB</sign><line>5</line></clef>',
);

const DUAL_STAFF_TAB_REST_ANCHORS_XML = `<?xml version="1.0" encoding="UTF-8"?>
<score-partwise version="3.1">
  <part-list><score-part id="P1"><part-name>Guitar</part-name></score-part></part-list>
  <part id="P1">
    <measure number="1">
      <attributes>
        <divisions>1</divisions>
        <time><beats>4</beats><beat-type>4</beat-type></time>
        <staves>2</staves>
        <clef number="1"><sign>G</sign><line>2</line></clef>
        <staff-details number="2"><staff-type>tab</staff-type><staff-lines>6</staff-lines></staff-details>
        <clef number="2"><sign>TAB</sign><line>5</line></clef>
      </attributes>
      <note><pitch><step>C</step><octave>4</octave></pitch><duration>1</duration><voice>1</voice><type>quarter</type><staff>1</staff></note>
      <note><rest/><duration>1</duration><voice>1</voice><type>quarter</type><staff>1</staff></note>
      <note><pitch><step>E</step><octave>4</octave></pitch><duration>1</duration><voice>1</voice><type>quarter</type><staff>1</staff></note>
      <note><rest/><duration>1</duration><voice>1</voice><type>quarter</type><staff>1</staff></note>
      <backup><duration>4</duration></backup>
      <note><pitch><step>C</step><octave>3</octave></pitch><duration>1</duration><voice>1</voice><type>quarter</type><staff>2</staff><notations><technical><string>5</string><fret>3</fret></technical></notations></note>
      <note><rest/><duration>1</duration><voice>1</voice><type>quarter</type><staff>2</staff></note>
      <note><pitch><step>E</step><octave>3</octave></pitch><duration>1</duration><voice>1</voice><type>quarter</type><staff>2</staff><notations><technical><string>4</string><fret>2</fret></technical></notations></note>
      <note><rest/><duration>1</duration><voice>1</voice><type>quarter</type><staff>2</staff></note>
    </measure>
  </part>
</score-partwise>`;

function buildEmptyDocument(): ScoreDocumentModel {
  return importMusicXmlToCore(EMPTY_XML);
}

test('insertNoteAt stores guitar string and fret metadata on the core note', () => {
  const next = applyCoreCommands(buildEmptyDocument(), [{
    type: 'insertNoteAt',
    measureNumber: 1,
    staffIndex: 1,
    voiceId: 1,
    timestampNum: 0,
    timestampDen: 4,
    step: 'G',
    octave: 2,
    alter: 0,
    durationType: 'quarter',
    isDotted: false,
    guitar: { string: 6, fret: 3, tuning: 'standard' },
  } as any]);

  const note = next.score.parts[0]!.staves[0]!.measures[0]!.voices[0]!.events
    .find((event) => event.kind === 'note');
  assert.equal(note?.kind, 'note');
  assert.deepEqual(note?.kind === 'note' ? note.guitar : null, { string: 6, fret: 3, tuning: 'standard' });
});

test('setGuitarFret annotates an existing replacement note', () => {
  const inserted = applyCoreCommands(buildEmptyDocument(), [{
    type: 'insertNoteAt',
    measureNumber: 1,
    staffIndex: 1,
    voiceId: 1,
    timestampNum: 0,
    timestampDen: 4,
    step: 'C',
    octave: 3,
    alter: 0,
    durationType: 'quarter',
    isDotted: false,
  } as any]);
  const next = applyCoreCommands(inserted, [{
    type: 'setGuitarFret',
    measureNumber: 1,
    staffIndex: 1,
    voiceId: 1,
    timestampNum: 0,
    timestampDen: 4,
    string: 5,
    fret: 3,
    tuning: 'standard',
  } as any]);

  const note = next.score.parts[0]!.staves[0]!.measures[0]!.voices[0]!.events[0];
  assert.deepEqual(note?.kind === 'note' ? note.guitar : null, { string: 5, fret: 3, tuning: 'standard' });
});

test('setGuitarFret preserves existing guitar techniques when only fret metadata changes', () => {
  const inserted = applyCoreCommands(buildEmptyDocument(), [{
    type: 'insertNoteAt',
    measureNumber: 1,
    staffIndex: 1,
    voiceId: 1,
    timestampNum: 0,
    timestampDen: 4,
    step: 'G',
    octave: 2,
    alter: 0,
    durationType: 'quarter',
    isDotted: false,
    guitar: { string: 6, fret: 3, tuning: 'standard', techniques: ['hammer-on', 'pull-off'] },
  } as any]);

  const next = applyCoreCommands(inserted, [{
    type: 'setGuitarFret',
    measureNumber: 1,
    staffIndex: 1,
    voiceId: 1,
    timestampNum: 0,
    timestampDen: 4,
    string: 5,
    fret: 7,
  } as any]);

  const note = next.score.parts[0]!.staves[0]!.measures[0]!.voices[0]!.events[0];
  assert.deepEqual(note?.kind === 'note' ? note.guitar : null, {
    string: 5,
    fret: 7,
    tuning: 'standard',
    techniques: ['hammer-on', 'pull-off'],
  });
});

test('setGuitarFret keeps paired standard notation one octave above the TAB note', () => {
  const next = applyCoreCommands(importMusicXmlToCore(DUAL_STAFF_TAB_XML), [{
    type: 'setGuitarFret',
    corePartId: 'part:P1',
    measureNumber: 1,
    staffIndex: 2,
    voiceId: 1,
    timestampNum: 0,
    timestampDen: 1,
    string: 6,
    fret: 3,
    tuning: 'standard',
  } as any]);

  const notationNote = next.score.parts[0]!.staves[0]!.measures[0]!.voices[0]!.events[0];
  const tabNote = next.score.parts[0]!.staves[1]!.measures[0]!.voices[0]!.events[0];
  assert.deepEqual(notationNote?.kind === 'note' ? notationNote.pitch : null, { step: 'G', alter: 0, octave: 3 });
  assert.deepEqual(tabNote?.kind === 'note' ? tabNote.pitch : null, { step: 'G', alter: 0, octave: 2 });
  assert.deepEqual(tabNote?.kind === 'note' ? tabNote.guitar : null, { string: 6, fret: 3, tuning: 'standard', techniques: [] });
});

test('Guitar Pro 1-3-0 controls on the clickable notation rest write C5-D5-E5 above sounding C4-D4-E4 TAB', () => {
  const draft = createDefaultNewScoreDraft();
  draft.instrumentIds = ['guitar-tab'];
  draft.measureCount = 1;
  const sourceXml = createNewScoreXml(draft);
  const source = importMusicXmlToCore(sourceXml);
  const partId = source.score.parts[0]!.id;
  const commands = [
    { timestampNum: 0, timestampDen: 8, step: 'C', octave: 4, string: 2, fret: 1 },
    { timestampNum: 1, timestampDen: 8, step: 'D', octave: 4, string: 2, fret: 3 },
    { timestampNum: 2, timestampDen: 8, step: 'E', octave: 4, string: 1, fret: 0 },
  ].map((entry) => ({
    type: 'insertNoteAt' as const,
    corePartId: partId,
    measureNumber: 1,
    // A blank TAB staff has no clickable rest glyph. The real UI anchors the
    // guitar controls on staff 1 while their pitches still describe sounding
    // guitar strings.
    staffIndex: 1,
    voiceId: 1,
    timestampNum: entry.timestampNum,
    timestampDen: entry.timestampDen,
    step: entry.step,
    octave: entry.octave,
    alter: 0,
    durationType: 'eighth',
    isDotted: false,
    guitar: { string: entry.string, fret: entry.fret, tuning: 'standard' },
  }));

  const next = applyCoreCommands(source, commands as any);
  const notationPitches = next.score.parts[0]!.staves[0]!.measures[0]!.voices[0]!.events
    .filter((event) => event.kind === 'note')
    .map((event) => event.kind === 'note' ? `${event.pitch.step}${event.pitch.octave}` : null);
  const tabNotes = next.score.parts[0]!.staves[1]!.measures[0]!.voices[0]!.events
    .filter((event) => event.kind === 'note')
    .map((event) => event.kind === 'note' ? {
      pitch: `${event.pitch.step}${event.pitch.octave}`,
      string: event.guitar?.string,
      fret: event.guitar?.fret,
    } : null);

  assert.deepEqual(notationPitches, ['C5', 'D5', 'E5']);
  assert.deepEqual(tabNotes, [
    { pitch: 'C4', string: 2, fret: 1 },
    { pitch: 'D4', string: 2, fret: 3 },
    { pitch: 'E4', string: 1, fret: 0 },
  ]);

  const roundTripped = importMusicXmlToCore(exportCoreToMusicXml(sourceXml, next));
  const roundTripNotationPitches = roundTripped.score.parts[0]!.staves[0]!.measures[0]!.voices[0]!.events
    .filter((event) => event.kind === 'note')
    .map((event) => event.kind === 'note' ? `${event.pitch.step}${event.pitch.octave}` : null);
  assert.deepEqual(roundTripNotationPitches, ['C5', 'D5', 'E5']);
});

test('tie toggles mirror matching pitches across paired notation and TAB staves', () => {
  const document = importMusicXmlToCore(DUAL_STAFF_TAB_REST_ANCHORS_XML);
  const source = document.score.parts[0]!.staves[0]!.measures[0]!.voices[0]!.events[0]!;
  assert.equal(source.kind, 'note');
  if (source.kind !== 'note') return;

  const next = applyCoreCommands(document, [
    {
      type: 'insertNoteAt',
      corePartId: document.score.parts[0]!.id,
      measureNumber: 1,
      staffIndex: 1,
      voiceId: 1,
      timestampNum: 1,
      timestampDen: 4,
      step: source.pitch.step,
      octave: source.pitch.octave,
      alter: source.pitch.alter,
      durationType: 'quarter',
      isDotted: false,
    },
    {
      type: 'toggleTie',
      coreEntityId: source.id,
      corePartId: document.score.parts[0]!.id,
      measureNumber: 1,
      staffIndex: 1,
      voiceId: 1,
      timestampNum: source.timestampNum,
      timestampDen: source.timestampDen,
      step: source.pitch.step,
      octave: source.pitch.octave,
      alter: source.pitch.alter,
    },
  ] as any);

  const notationSource = next.score.parts[0]!.staves[0]!.measures[0]!.voices[0]!.events
    .find((event) => event.kind === 'note' && event.timestampNum === 0);
  const tabSource = next.score.parts[0]!.staves[1]!.measures[0]!.voices[0]!.events
    .find((event) => event.kind === 'note' && event.timestampNum === 0);
  assert.equal(notationSource?.tieStart, true);
  assert.equal(tabSource?.tieStart, true);

  const roundtripXml = exportCoreToMusicXml(DUAL_STAFF_TAB_REST_ANCHORS_XML, next);
  assert.equal((roundtripXml.match(/<tie type="start"\/>/g) ?? []).length, 2);
});

test('setGuitarFret keeps Guitar Pro style staff-details TAB imports paired with standard notation', () => {
  const result = applyDocumentCommands({ xml: DUAL_STAFF_TAB_XML_WITH_STAFF_DETAILS, coreDocument: null }, [{
    type: 'setGuitarFret',
    corePartId: 'part:P1',
    measureNumber: 1,
    staffIndex: 2,
    voiceId: 1,
    timestampNum: 0,
    timestampDen: 1,
    string: 6,
    fret: 3,
    tuning: 'standard',
  } as any]);

  const imported = result.coreDocument;
  const notationNote = imported?.score.parts[0]!.staves[0]!.measures[0]!.voices[0]!.events[0];
  const tabNote = imported?.score.parts[0]!.staves[1]!.measures[0]!.voices[0]!.events[0];
  assert.deepEqual(notationNote?.kind === 'note' ? notationNote.pitch : null, { step: 'G', alter: 0, octave: 3 });
  assert.deepEqual(tabNote?.kind === 'note' ? tabNote.pitch : null, { step: 'G', alter: 0, octave: 2 });
  assert.deepEqual(tabNote?.kind === 'note' ? tabNote.guitar : null, { string: 6, fret: 3, techniques: [] });
  assert.match(result.xml, /<staff-details number="2"><staff-type>tab<\/staff-type><staff-lines>6<\/staff-lines><\/staff-details>/);
  assert.match(result.xml, /<staff>1<\/staff>/);
  assert.match(result.xml, /<staff>2<\/staff>/);
});

const DUAL_STAFF_TAB_FLAT_XML = `<?xml version="1.0" encoding="UTF-8"?>
<score-partwise version="3.1">
  <part-list><score-part id="P1"><part-name>Guitar</part-name></score-part></part-list>
  <part id="P1">
    <measure number="1">
      <attributes>
        <divisions>1</divisions>
        <time><beats>4</beats><beat-type>4</beat-type></time>
        <staves>2</staves>
        <clef number="1"><sign>G</sign><line>2</line></clef>
        <clef number="2"><sign>TAB</sign><line>5</line></clef>
      </attributes>
      <note><pitch><step>B</step><alter>-1</alter><octave>4</octave></pitch><duration>1</duration><voice>1</voice><type>quarter</type><staff>1</staff></note>
      <backup><duration>1</duration></backup>
      <note><pitch><step>B</step><alter>-1</alter><octave>3</octave></pitch><duration>1</duration><voice>1</voice><type>quarter</type><staff>2</staff><notations><technical><string>3</string><fret>3</fret></technical></notations></note>
    </measure>
  </part>
</score-partwise>`;

test('setGuitarFret moves a TAB note to another string without changing the pitch', () => {
  // Sounding C3 = 3rd fret on the A string ↔ 8th fret on the low E string.
  const next = applyCoreCommands(importMusicXmlToCore(DUAL_STAFF_TAB_XML), [{
    type: 'setGuitarFret',
    corePartId: 'part:P1',
    measureNumber: 1,
    staffIndex: 2,
    voiceId: 1,
    timestampNum: 0,
    timestampDen: 1,
    string: 6,
    fret: 8,
    tuning: 'standard',
  } as any]);

  const notationNote = next.score.parts[0]!.staves[0]!.measures[0]!.voices[0]!.events[0];
  const tabNote = next.score.parts[0]!.staves[1]!.measures[0]!.voices[0]!.events[0];
  assert.deepEqual(notationNote?.kind === 'note' ? notationNote.pitch : null, { step: 'C', alter: 0, octave: 4 });
  assert.deepEqual(tabNote?.kind === 'note' ? tabNote.pitch : null, { step: 'C', alter: 0, octave: 3 });
  assert.deepEqual(tabNote?.kind === 'note' ? tabNote.guitar : null, { string: 6, fret: 8, tuning: 'standard', techniques: [] });
});

test('setGuitarFret keeps flat spelling when the sounding pitch is unchanged', () => {
  // Sounding Bb3 moved to another string must stay Bb, not become A#.
  const next = applyCoreCommands(importMusicXmlToCore(DUAL_STAFF_TAB_FLAT_XML), [{
    type: 'setGuitarFret',
    corePartId: 'part:P1',
    measureNumber: 1,
    staffIndex: 2,
    voiceId: 1,
    timestampNum: 0,
    timestampDen: 1,
    string: 4,
    fret: 8,
    tuning: 'standard',
  } as any]);

  const notationNote = next.score.parts[0]!.staves[0]!.measures[0]!.voices[0]!.events[0];
  const tabNote = next.score.parts[0]!.staves[1]!.measures[0]!.voices[0]!.events[0];
  assert.deepEqual(notationNote?.kind === 'note' ? notationNote.pitch : null, { step: 'B', alter: -1, octave: 4 });
  assert.deepEqual(tabNote?.kind === 'note' ? tabNote.pitch : null, { step: 'B', alter: -1, octave: 3 });
  assert.deepEqual(tabNote?.kind === 'note' ? tabNote.guitar : null, { string: 4, fret: 8, tuning: 'standard', techniques: [] });
});

test('standard notation insertNoteAt automatically creates paired TAB fingering', () => {
  const next = applyCoreCommands(importMusicXmlToCore(DUAL_STAFF_TAB_REST_ANCHORS_XML), [{
    type: 'insertNoteAt',
    corePartId: 'part:P1',
    measureNumber: 1,
    staffIndex: 1,
    voiceId: 1,
    timestampNum: 1,
    timestampDen: 4,
    step: 'E',
    octave: 4,
    alter: 0,
    durationType: 'quarter',
    isDotted: false,
  } as any]);

  const notationBeatTwo = next.score.parts[0]!.staves[0]!.measures[0]!.voices[0]!.events
    .find((event) => event.timestampNum === 1);
  const tabBeatTwo = next.score.parts[0]!.staves[1]!.measures[0]!.voices[0]!.events
    .find((event) => event.timestampNum === 1);

  assert.equal(notationBeatTwo?.kind, 'note');
  assert.deepEqual(notationBeatTwo?.kind === 'note' ? notationBeatTwo.pitch : null, { step: 'E', alter: 0, octave: 4 });
  assert.equal(notationBeatTwo?.kind === 'note' ? notationBeatTwo.guitar : undefined, undefined);
  assert.equal(tabBeatTwo?.kind, 'note');
  assert.deepEqual(tabBeatTwo?.kind === 'note' ? tabBeatTwo.pitch : null, { step: 'E', alter: 0, octave: 3 });
  assert.deepEqual(tabBeatTwo?.kind === 'note' ? tabBeatTwo.guitar : null, { string: 4, fret: 2 });
});

test('standard notation chord insertion mirrors TAB members and round-trips before following rests', () => {
  const commands = [
    { step: 'E', octave: 4, asChord: false },
    { step: 'G', octave: 4, asChord: true },
    { step: 'B', octave: 4, asChord: true },
  ].map((pitch) => ({
    type: 'insertNoteAt' as const,
    corePartId: 'part:P1',
    measureNumber: 1,
    staffIndex: 1,
    voiceId: 1,
    timestampNum: 1,
    timestampDen: 4,
    step: pitch.step,
    octave: pitch.octave,
    alter: 0,
    durationType: 'quarter',
    isDotted: false,
    asChord: pitch.asChord,
  }));
  const next = applyCoreCommands(importMusicXmlToCore(DUAL_STAFF_TAB_REST_ANCHORS_XML), commands as any);

  const assertChord = (document: ScoreDocumentModel) => {
    const notation = document.score.parts[0]!.staves[0]!.measures[0]!.voices[0]!.events
      .filter((event) => event.kind === 'note' && event.timestampNum === 1);
    const tab = document.score.parts[0]!.staves[1]!.measures[0]!.voices[0]!.events
      .filter((event) => event.kind === 'note' && event.timestampNum === 1);
    assert.equal(notation.length, 3);
    assert.deepEqual(notation.map((event) => event.isChord), [false, true, true]);
    assert.equal(tab.length, 3);
    assert.deepEqual(tab.map((event) => event.isChord), [false, true, true]);
    assert.ok(tab.every((event) => event.kind === 'note' && event.guitar && event.guitar.string >= 1 && event.guitar.fret >= 0));
    assert.equal(new Set(tab.map((event) => event.kind === 'note' ? event.guitar?.string : null)).size, 3);
  };

  assertChord(next);
  const exported = exportCoreToMusicXml(DUAL_STAFF_TAB_REST_ANCHORS_XML, next);
  const notationRoot = exported.indexOf('<step>E</step>');
  const firstChord = exported.indexOf('<chord/>', notationRoot);
  const secondChord = exported.indexOf('<chord/>', firstChord + 1);
  const followingRest = exported.indexOf('<rest', secondChord);
  assert.ok(notationRoot >= 0 && firstChord > notationRoot && secondChord > firstChord && followingRest > secondChord);
  assertChord(importMusicXmlToCore(exported));
});

test('standard notation chord insertion keeps TAB voicing near the preceding fret position', () => {
  const commands = [
    { step: 'G', octave: 4, asChord: false },
    { step: 'B', octave: 4, asChord: true },
    { step: 'E', octave: 5, asChord: true },
  ].map((pitch) => ({
    type: 'insertNoteAt' as const,
    corePartId: 'part:P1',
    measureNumber: 1,
    staffIndex: 1,
    voiceId: 1,
    timestampNum: 1,
    timestampDen: 4,
    step: pitch.step,
    octave: pitch.octave,
    alter: 0,
    durationType: 'quarter',
    isDotted: false,
    asChord: pitch.asChord,
  }));
  const next = applyCoreCommands(importMusicXmlToCore(DUAL_STAFF_TAB_REST_ANCHORS_XML), commands as any);
  const tabChord = next.score.parts[0]!.staves[1]!.measures[0]!.voices[0]!.events
    .filter((event) => event.kind === 'note' && event.timestampNum === 1);

  assert.deepEqual(
    tabChord.map((event) => event.kind === 'note' ? event.guitar : null),
    [
      { string: 4, fret: 5 },
      { string: 3, fret: 4 },
      { string: 2, fret: 5 },
    ],
  );
});

test('standard notation changeNotePitch updates paired TAB pitch and fingering', () => {
  const next = applyCoreCommands(importMusicXmlToCore(DUAL_STAFF_TAB_XML), [{
    type: 'changeNotePitch',
    corePartId: 'part:P1',
    measureNumber: 1,
    staffIndex: 1,
    voiceId: 1,
    timestampNum: 0,
    timestampDen: 1,
    step: 'G',
    octave: 3,
    alter: 1,
    writtenAccidental: 'sharp',
  } as any]);

  const notationNote = next.score.parts[0]!.staves[0]!.measures[0]!.voices[0]!.events[0];
  const tabNote = next.score.parts[0]!.staves[1]!.measures[0]!.voices[0]!.events[0];
  assert.deepEqual(notationNote?.kind === 'note' ? notationNote.pitch : null, { step: 'G', alter: 1, octave: 3 });
  assert.equal(notationNote?.kind === 'note' ? notationNote.writtenAccidental : null, 'sharp');
  assert.deepEqual(tabNote?.kind === 'note' ? tabNote.pitch : null, { step: 'G', alter: 1, octave: 2 });
  assert.equal(tabNote?.kind === 'note' ? tabNote.writtenAccidental : null, 'sharp');
  assert.deepEqual(tabNote?.kind === 'note' ? tabNote.guitar : null, { string: 6, fret: 4, techniques: [] });
});

test('courtesy accidental display mirrors across paired notation and TAB without changing pitch or fingering', () => {
  const source = importMusicXmlToCore(DUAL_STAFF_TAB_XML);
  const notationBefore = source.score.parts[0]!.staves[0]!.measures[0]!.voices[0]!.events[0]!;
  const tabBefore = source.score.parts[0]!.staves[1]!.measures[0]!.voices[0]!.events[0]!;
  const next = applyCoreCommands(source, [{
    type: 'changeNotePitch',
    corePartId: 'part:P1',
    measureNumber: 1,
    staffIndex: 1,
    voiceId: 1,
    timestampNum: 0,
    timestampDen: 1,
    step: 'C',
    octave: 4,
    alter: 0,
    writtenAccidental: 'natural',
  }, {
    type: 'setAccidentalDisplay',
    corePartId: 'part:P1',
    measureNumber: 1,
    staffIndex: 1,
    voiceId: 1,
    timestampNum: 0,
    timestampDen: 1,
    cautionary: true,
    enclosure: 'square',
  }] as any);

  const notationAfter = next.score.parts[0]!.staves[0]!.measures[0]!.voices[0]!.events[0]!;
  const tabAfter = next.score.parts[0]!.staves[1]!.measures[0]!.voices[0]!.events[0]!;
  assert.equal(notationAfter.id, notationBefore.id);
  assert.equal(tabAfter.id, tabBefore.id);
  assert.deepEqual(notationAfter.kind === 'note' ? notationAfter.pitch : null, notationBefore.kind === 'note' ? notationBefore.pitch : null);
  assert.deepEqual(tabAfter.kind === 'note' ? tabAfter.pitch : null, tabBefore.kind === 'note' ? tabBefore.pitch : null);
  assert.equal(notationAfter.kind === 'note' ? notationAfter.accidentalCautionary : null, true);
  assert.equal(notationAfter.kind === 'note' ? notationAfter.accidentalEnclosure : null, 'square');
  assert.equal(tabAfter.kind === 'note' ? tabAfter.accidentalCautionary : null, true);
  assert.equal(tabAfter.kind === 'note' ? tabAfter.accidentalEnclosure : null, 'square');
  assert.deepEqual(tabAfter.kind === 'note' ? tabAfter.guitar : null, tabBefore.kind === 'note' ? tabBefore.guitar : null);
});

test('grace insertion mirrors a zero-time entity across paired notation and TAB while preserving anchors', () => {
  const source = importMusicXmlToCore(DUAL_STAFF_TAB_XML);
  const notationAnchor = source.score.parts[0]!.staves[0]!.measures[0]!.voices[0]!.events[0]!;
  const tabAnchor = source.score.parts[0]!.staves[1]!.measures[0]!.voices[0]!.events[0]!;
  const next = applyCoreCommands(source, [{
    type: 'addGraceNote',
    coreEntityId: notationAnchor.id,
    corePartId: 'part:P1',
    measureNumber: 1,
    staffIndex: 1,
    voiceId: 1,
    timestampNum: 0,
    timestampDen: 1,
    slash: true,
  }] as any);
  const notationEvents = next.score.parts[0]!.staves[0]!.measures[0]!.voices[0]!.events;
  const tabEvents = next.score.parts[0]!.staves[1]!.measures[0]!.voices[0]!.events;
  const graceIds = new Set(next.graceNotes.map((entry) => entry.eventId));

  assert.equal(notationEvents.some((event) => event.id === notationAnchor.id), true);
  assert.equal(tabEvents.some((event) => event.id === tabAnchor.id), true);
  assert.equal(notationEvents.filter((event) => graceIds.has(event.id) && event.durationDivisions === 0).length, 1);
  assert.equal(tabEvents.filter((event) => graceIds.has(event.id) && event.durationDivisions === 0).length, 1);
  const retainedTabAnchor = tabEvents.find((event) => event.id === tabAnchor.id);
  assert.deepEqual(retainedTabAnchor?.kind === 'note'
    ? retainedTabAnchor.guitar
    : null, tabAnchor.kind === 'note' ? tabAnchor.guitar : null);

  const notationGrace = notationEvents.find((event) => graceIds.has(event.id))!;
  const removed = applyCoreCommands(next, [{
    type: 'removeGraceNote',
    coreEntityId: notationGrace.id,
    corePartId: 'part:P1',
    measureNumber: 1,
    staffIndex: 1,
    voiceId: 1,
    timestampNum: 0,
    timestampDen: 1,
  }] as any);
  assert.equal(removed.graceNotes.length, 0);
  assert.equal(removed.score.parts[0]!.staves[0]!.measures[0]!.voices[0]!.events.some((event) => event.id === notationAnchor.id), true);
  assert.equal(removed.score.parts[0]!.staves[1]!.measures[0]!.voices[0]!.events.some((event) => event.id === tabAnchor.id), true);
});

test('tuplet creation divides paired notation and TAB anchors through the core path', () => {
  const source = importMusicXmlToCore(DUAL_STAFF_TAB_XML_WITH_STAFF_DETAILS);
  const notationAnchor = source.score.parts[0]!.staves[0]!.measures[0]!.voices[0]!.events[0]!;
  const tabAnchor = source.score.parts[0]!.staves[1]!.measures[0]!.voices[0]!.events[0]!;
  const result = applyDocumentCommands({ xml: DUAL_STAFF_TAB_XML_WITH_STAFF_DETAILS, coreDocument: source }, [{
    type: 'addTuplet',
    coreEntityId: notationAnchor.id,
    coreMeasureId: source.score.parts[0]!.staves[0]!.measures[0]!.id,
    corePartId: source.score.parts[0]!.id,
    measureNumber: 1,
    staffIndex: 1,
    voiceId: 1,
    startTimestampNum: 0,
    startTimestampDen: 4,
    stopTimestampNum: 0,
    stopTimestampDen: 4,
    actualNotes: 3,
    normalNotes: 2,
    bracket: true,
  }]);

  assert.equal(result.diagnostics.some((entry) => entry.code === 'legacy_fallback'), false);
  assert.equal(result.coreDocument!.tuplets.length, 2);
  assert.equal(result.coreDocument!.score.parts[0]!.staves[0]!.measures[0]!.voices[0]!.events.some((event) => event.id === notationAnchor.id), true);
  assert.equal(result.coreDocument!.score.parts[0]!.staves[1]!.measures[0]!.voices[0]!.events.some((event) => event.id === tabAnchor.id), true);
  assert.deepEqual(result.coreDocument!.tuplets.map((tuplet) => tuplet.eventIds.length), [3, 3]);
  assert.deepEqual(validateScoreDocument(result.coreDocument).filter((entry) => entry.level === 'error'), []);
  assert.match(result.xml, /<staff-details number="2">/);
});

test('enharmonic respelling mirrors spelling across paired notation and TAB without changing fret', () => {
  const pitch = resolveNextEnharmonicPitch({ step: 'C', alter: 0, octave: 4 });
  const next = applyCoreCommands(importMusicXmlToCore(DUAL_STAFF_TAB_XML), [{
    type: 'changeNotePitch',
    corePartId: 'part:P1',
    measureNumber: 1,
    staffIndex: 1,
    voiceId: 1,
    timestampNum: 0,
    timestampDen: 1,
    ...pitch,
  } as any]);

  const notationNote = next.score.parts[0]!.staves[0]!.measures[0]!.voices[0]!.events[0];
  const tabNote = next.score.parts[0]!.staves[1]!.measures[0]!.voices[0]!.events[0];
  assert.deepEqual(notationNote?.kind === 'note' ? notationNote.pitch : null, { step: 'D', alter: -2, octave: 4 });
  assert.deepEqual(tabNote?.kind === 'note' ? tabNote.pitch : null, { step: 'D', alter: -2, octave: 3 });
  assert.deepEqual(tabNote?.kind === 'note' ? tabNote.guitar : null, { string: 5, fret: 3, techniques: [] });
});

test('standard notation repitch preserves the paired TAB string when reachable', () => {
  const inserted = applyCoreCommands(importMusicXmlToCore(DUAL_STAFF_TAB_REST_ANCHORS_XML), [{
    type: 'insertNoteAt',
    corePartId: 'part:P1',
    measureNumber: 1,
    staffIndex: 1,
    voiceId: 1,
    timestampNum: 1,
    timestampDen: 4,
    step: 'E',
    octave: 4,
    alter: 0,
    durationType: 'quarter',
    isDotted: false,
  } as any]);
  const next = applyCoreCommands(inserted, [{
    type: 'changeNotePitch',
    corePartId: 'part:P1',
    measureNumber: 1,
    staffIndex: 1,
    voiceId: 1,
    timestampNum: 1,
    timestampDen: 4,
    step: 'F',
    octave: 4,
    alter: 0,
  } as any]);

  const tabBeatTwo = next.score.parts[0]!.staves[1]!.measures[0]!.voices[0]!.events
    .find((event) => event.timestampNum === 1);
  assert.deepEqual(tabBeatTwo?.kind === 'note' ? tabBeatTwo.pitch : null, { step: 'F', alter: 0, octave: 3 });
  assert.deepEqual(tabBeatTwo?.kind === 'note' ? tabBeatTwo.guitar : null, { string: 4, fret: 3 });
});

test('insertNoteAt with guitar converts the paired notation rest at the same rhythmic anchor', () => {
  const next = applyCoreCommands(importMusicXmlToCore(DUAL_STAFF_TAB_REST_ANCHORS_XML), [{
    type: 'insertNoteAt',
    corePartId: 'part:P1',
    measureNumber: 1,
    staffIndex: 2,
    voiceId: 1,
    timestampNum: 1,
    timestampDen: 4,
    step: 'A',
    octave: 3,
    alter: 0,
    durationType: 'quarter',
    isDotted: false,
    guitar: { string: 4, fret: 7, tuning: 'standard' },
  } as any]);

  const notationEvents = next.score.parts[0]!.staves[0]!.measures[0]!.voices[0]!.events
    .sort((a, b) => a.timestampNum - b.timestampNum);
  const tabEvents = next.score.parts[0]!.staves[1]!.measures[0]!.voices[0]!.events
    .sort((a, b) => a.timestampNum - b.timestampNum);
  const notationBeatTwo = notationEvents.find((event) => event.timestampNum === 1);
  const tabBeatTwo = tabEvents.find((event) => event.timestampNum === 1);

  assert.equal(notationBeatTwo?.kind, 'note');
  assert.deepEqual(notationBeatTwo?.kind === 'note' ? notationBeatTwo.pitch : null, { step: 'A', alter: 0, octave: 4 });
  assert.equal(notationBeatTwo?.kind === 'note' ? notationBeatTwo.guitar : undefined, undefined);
  assert.equal(tabBeatTwo?.kind, 'note');
  assert.deepEqual(tabBeatTwo?.kind === 'note' ? tabBeatTwo.pitch : null, { step: 'A', alter: 0, octave: 3 });
  assert.deepEqual(tabBeatTwo?.kind === 'note' ? tabBeatTwo.guitar : null, { string: 4, fret: 7, tuning: 'standard' });
  assert.deepEqual(
    notationEvents.map((event) => `${event.timestampNum}/${event.timestampDen}:${event.kind === 'note' ? `${event.pitch.step}${event.pitch.octave}` : 'rest'}:${event.durationType}`),
    ['0/4:C4:quarter', '1/4:A4:quarter', '2/4:E4:quarter', '3/4:rest:quarter'],
  );
  assert.deepEqual(
    tabEvents.map((event) => `${event.timestampNum}/${event.timestampDen}:${event.kind === 'note' ? `${event.pitch.step}${event.pitch.octave}` : 'rest'}:${event.kind === 'note' ? event.guitar?.fret ?? 'ng' : 'r'}`),
    ['0/4:C3:3', '1/4:A3:7', '2/4:E3:2', '3/4:rest:r'],
  );
});

test('document command guitar insertNoteAt mirrors paired notation in staff-details TAB scores', () => {
  const result = applyDocumentCommands({ xml: DUAL_STAFF_TAB_REST_ANCHORS_XML, coreDocument: null }, [{
    type: 'insertNoteAt',
    corePartId: 'part:P1',
    measureNumber: 1,
    staffIndex: 2,
    voiceId: 1,
    timestampNum: 1,
    timestampDen: 4,
    step: 'A',
    octave: 3,
    alter: 0,
    durationType: 'quarter',
    isDotted: false,
    guitar: { string: 4, fret: 7, tuning: 'standard' },
  } as any]);

  assert.deepEqual(
    result.coreDocument?.score.parts[0]!.staves[0]!.measures[0]!.voices[0]!.events
      .sort((a, b) => a.timestampNum - b.timestampNum)
      .map((event) => `${event.timestampNum}/${event.timestampDen}:${event.kind === 'note' ? `${event.pitch.step}${event.pitch.octave}` : 'rest'}:${event.durationType}`),
    ['0/4:C4:quarter', '1/4:A4:quarter', '2/4:E4:quarter', '3/4:rest:quarter'],
  );
  assert.deepEqual(
    result.coreDocument?.score.parts[0]!.staves[1]!.measures[0]!.voices[0]!.events
      .sort((a, b) => a.timestampNum - b.timestampNum)
      .map((event) => `${event.timestampNum}/${event.timestampDen}:${event.kind === 'note' ? `${event.pitch.step}${event.pitch.octave}` : 'rest'}:${event.kind === 'note' ? event.guitar?.fret ?? 'ng' : 'r'}`),
    ['0/4:C3:3', '1/4:A3:7', '2/4:E3:2', '3/4:rest:r'],
  );
  assert.match(result.xml, /<staff-details number="2"><staff-type>tab<\/staff-type><staff-lines>6<\/staff-lines><\/staff-details>/);
});

test('legacy fallback insertNoteAt writes TAB string and fret metadata', () => {
  const result = applyDocumentCommands({ xml: DUAL_STAFF_TAB_XML_WITH_STAFF_DETAILS, coreDocument: null }, [{
    type: 'insertNoteAt',
    measureNumber: 1,
    staffIndex: 2,
    voiceId: 1,
    timestampNum: 1,
    timestampDen: 4,
    step: 'G',
    octave: 4,
    alter: 0,
    durationType: 'quarter',
    guitar: { string: 1, fret: 3, tuning: 'standard' },
  } as any]);

  assert.match(result.xml, /<staff>2<\/staff>/);
  assert.match(result.xml, /<technical><string>1<\/string><fret>3<\/fret><\/technical>/);
  const imported = result.coreDocument;
  const tabNotes = imported?.score.parts[0]!.staves[1]!.measures[0]!.voices[0]!.events
    .filter((event) => event.kind === 'note');
  assert.ok(tabNotes?.some((event) => (
    event.kind === 'note'
    && event.pitch.step === 'G'
    && event.pitch.octave === 4
    && event.guitar?.string === 1
    && event.guitar.fret === 3
  )));
});

test('toggleGuitarTechnique edits existing TAB note techniques without changing fret metadata', () => {
  const inserted = applyCoreCommands(buildEmptyDocument(), [{
    type: 'insertNoteAt',
    measureNumber: 1,
    staffIndex: 1,
    voiceId: 1,
    timestampNum: 0,
    timestampDen: 4,
    step: 'G',
    octave: 2,
    alter: 0,
    durationType: 'quarter',
    isDotted: false,
    guitar: { string: 6, fret: 3, tuning: 'drop-d' },
  } as any]);

  const withTechnique = applyCoreCommands(inserted, [{
    type: 'toggleGuitarTechnique',
    measureNumber: 1,
    staffIndex: 1,
    voiceId: 1,
    timestampNum: 0,
    timestampDen: 4,
    technique: 'palm-mute',
  } as any]);
  const toggledOff = applyCoreCommands(withTechnique, [{
    type: 'toggleGuitarTechnique',
    measureNumber: 1,
    staffIndex: 1,
    voiceId: 1,
    timestampNum: 0,
    timestampDen: 4,
    technique: 'palm-mute',
  } as any]);

  const noteWithTechnique = withTechnique.score.parts[0]!.staves[0]!.measures[0]!.voices[0]!.events[0];
  assert.deepEqual(noteWithTechnique?.kind === 'note' ? noteWithTechnique.guitar : null, {
    string: 6,
    fret: 3,
    tuning: 'drop-d',
    techniques: ['palm-mute'],
  });
  const noteToggledOff = toggledOff.score.parts[0]!.staves[0]!.measures[0]!.voices[0]!.events[0];
  assert.deepEqual(noteToggledOff?.kind === 'note' ? noteToggledOff.guitar : null, {
    string: 6,
    fret: 3,
    tuning: 'drop-d',
    techniques: [],
  });
});

test('guitar string and fret round-trip through MusicXML technical notation', () => {
  const applied = applyDocumentCommands({ xml: EMPTY_XML, coreDocument: buildEmptyDocument() }, [{
    type: 'insertNoteAt',
    measureNumber: 1,
    staffIndex: 1,
    voiceId: 1,
    timestampNum: 0,
    timestampDen: 4,
    step: 'G',
    octave: 2,
    alter: 0,
    durationType: 'quarter',
    isDotted: false,
    guitar: { string: 6, fret: 3, tuning: 'standard' },
  } as any]);

  assert.match(applied.xml, /<technical><string>6<\/string><fret>3<\/fret><\/technical>/);
  const imported = importMusicXmlToCore(applied.xml);
  const exported = exportCoreToMusicXml(applied.xml, imported);
  assert.match(exported, /<technical><string>6<\/string><fret>3<\/fret><\/technical>/);
  assert.equal((exported.match(/<string>6<\/string>/g) ?? []).length, 1);
});

test('guitar techniques round-trip through MusicXML technical notation', () => {
  const applied = applyDocumentCommands({ xml: EMPTY_XML, coreDocument: buildEmptyDocument() }, [{
    type: 'insertNoteAt',
    measureNumber: 1,
    staffIndex: 1,
    voiceId: 1,
    timestampNum: 0,
    timestampDen: 4,
    step: 'G',
    octave: 2,
    alter: 0,
    durationType: 'quarter',
    isDotted: false,
    guitar: { string: 6, fret: 3, tuning: 'standard', techniques: ['hammer-on', 'slide', 'vibrato', 'palm-mute'] },
  } as any]);

  assert.match(applied.xml, /<slide type="start"\/>/);
  assert.match(applied.xml, /<wavy-line type="start"\/>/);
  assert.match(applied.xml, /<hammer-on type="start">H<\/hammer-on>/);
  assert.match(applied.xml, /<other-technical>p\.m\.<\/other-technical>/);

  const imported = importMusicXmlToCore(applied.xml);
  const note = imported.score.parts[0]!.staves[0]!.measures[0]!.voices[0]!.events
    .find((event) => event.kind === 'note');
  assert.deepEqual(note?.kind === 'note' ? note.guitar : null, {
    string: 6,
    fret: 3,
    techniques: ['hammer-on', 'palm-mute', 'slide', 'vibrato'],
  });
  const exported = exportCoreToMusicXml(applied.xml, imported);
  assert.equal((exported.match(/<hammer-on/g) ?? []).length, 1);
  assert.equal((exported.match(/<wavy-line/g) ?? []).length, 1);
});

for (const staffIndex of [1, 2]) {
  test(`deleting a linked guitar note from staff ${staffIndex} clears both staves`, () => {
    const source = importMusicXmlToCore(DUAL_STAFF_TAB_XML);
    const next = applyCoreCommands(source, [{ type: 'deleteNote', measureNumber: 1, staffIndex, voiceId: 1, timestampNum: 0, timestampDen: 4 }]);
    for (const staff of next.score.parts[0]!.staves) {
      assert.equal(staff.measures[0]!.voices[0]!.events.some(event => event.kind === 'note'), false);
      assert.equal(staff.measures[0]!.voices[0]!.events[0]!.durationDivisions, 1);
    }
  });
}

test('deleting one linked chord tone preserves the other tones on both staves', (t) => {
  t.mock.method(Date, 'now', () => 1234);
  const source = applyCoreCommands(importMusicXmlToCore(DUAL_STAFF_TAB_REST_ANCHORS_XML), ['E', 'G', 'B'].map((step, index) => ({
    type: 'insertNoteAt', corePartId: 'part:P1', measureNumber: 1, staffIndex: 1, voiceId: 1,
    timestampNum: 1, timestampDen: 4, step, octave: 4, alter: 0, durationType: 'quarter', isDotted: false, asChord: index > 0,
  })) as any);
  const tone = source.score.parts[0]!.staves[0]!.measures[0]!.voices[0]!.events.find(e => e.kind === 'note' && e.pitch.step === 'G' && e.timestampNum === 1)!;
  const next = applyCoreCommands(source, [{ type: 'deleteNote', coreEntityId: tone.id, measureNumber: 1, staffIndex: 1, voiceId: 1, timestampNum: 1, timestampDen: 4 }]);
  for (const staff of next.score.parts[0]!.staves) {
    assert.deepEqual(staff.measures[0]!.voices[0]!.events.filter(e => e.kind === 'note' && e.timestampNum === 1).map(e => e.kind === 'note' ? e.pitch.step : ''), ['E', 'B']);
  }
});

test('deleting a notation range clears the paired TAB range', () => {
  const source = importMusicXmlToCore(DUAL_STAFF_TAB_REST_ANCHORS_XML);
  const next = applyCoreCommands(source, normalizeScoreCommands([{ type: 'deleteRange', range: {
    start: { measureNumber: 1, staffIndex: 1, voiceId: 1, timestampNum: 0, timestampDen: 4 },
    end: { measureNumber: 1, staffIndex: 1, voiceId: 1, timestampNum: 1, timestampDen: 4 },
  } }]));
  for (const staff of next.score.parts[0]!.staves) assert.deepEqual(staff.measures[0]!.voices[0]!.events.filter(e => e.kind === 'note').map(e => e.timestampNum), [2]);
});

test('deletion does not remove a different pitch from an unsynchronized TAB staff', () => {
  const source = importMusicXmlToCore(DUAL_STAFF_TAB_XML);
  const tab = source.score.parts[0]!.staves[1]!.measures[0]!.voices[0]!.events[0]!;
  assert.equal(tab.kind, 'note');
  if (tab.kind === 'note') tab.pitch.step = 'D';
  const next = applyCoreCommands(source, [{ type: 'deleteNote', measureNumber: 1, staffIndex: 1, voiceId: 1, timestampNum: 0, timestampDen: 4 }]);
  assert.equal(next.score.parts[0]!.staves[1]!.measures[0]!.voices[0]!.events[0]!.kind, 'note');
});

test('document deletion preserves staff details and removes the paired TAB note through export/reopen', () => {
  const source = importMusicXmlToCore(DUAL_STAFF_TAB_XML_WITH_STAFF_DETAILS);
  const next = applyDocumentCommands({ xml: DUAL_STAFF_TAB_XML_WITH_STAFF_DETAILS, coreDocument: source }, [{
    type: 'deleteNote', measureNumber: 1, staffIndex: 1, voiceId: 1, timestampNum: 0, timestampDen: 4,
  }]);
  assert.match(next.xml, /<staff-details/);
  assert.match(next.xml, /<staff-lines>6<\/staff-lines>/);
  const reopened = importMusicXmlToCore(next.xml);
  for (const staff of reopened.score.parts[0]!.staves) assert.equal(staff.measures[0]!.voices[0]!.events.some(e => e.kind === 'note'), false);
});
