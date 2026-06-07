import test from 'node:test';
import assert from 'node:assert/strict';

import { applyDocumentCommands } from '../src/score-core/commands/apply-document-commands.ts';
import { applyCoreCommands } from '../src/score-core/commands/core-command-executor.ts';
import { exportCoreToMusicXml } from '../src/musicxml-adapter/export/export-core-to-musicxml.ts';
import { importMusicXmlToCore } from '../src/musicxml-adapter/import/import-musicxml.ts';
import type { ScoreDocumentModel } from '../src/score-core/model/types.ts';

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
      <note><pitch><step>C</step><octave>4</octave></pitch><duration>1</duration><voice>1</voice><type>quarter</type><staff>2</staff><notations><technical><string>5</string><fret>3</fret></technical></notations></note>
    </measure>
  </part>
</score-partwise>`;

const DUAL_STAFF_TAB_XML_WITH_STAFF_DETAILS = DUAL_STAFF_TAB_XML.replace(
  '<clef number="2"><sign>TAB</sign><line>5</line></clef>',
  '<staff-details number="2"><staff-type>tab</staff-type><staff-lines>6</staff-lines></staff-details><clef number="2"><sign>TAB</sign><line>5</line></clef>',
);

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

test('setGuitarFret keeps paired standard notation pitch aligned with the TAB note in core edits', () => {
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
  assert.deepEqual(notationNote?.kind === 'note' ? notationNote.pitch : null, { step: 'G', alter: 0, octave: 2 });
  assert.deepEqual(tabNote?.kind === 'note' ? tabNote.pitch : null, { step: 'G', alter: 0, octave: 2 });
  assert.deepEqual(tabNote?.kind === 'note' ? tabNote.guitar : null, { string: 6, fret: 3, tuning: 'standard', techniques: [] });
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
  assert.deepEqual(notationNote?.kind === 'note' ? notationNote.pitch : null, { step: 'G', alter: 0, octave: 2 });
  assert.deepEqual(tabNote?.kind === 'note' ? tabNote.pitch : null, { step: 'G', alter: 0, octave: 2 });
  assert.deepEqual(tabNote?.kind === 'note' ? tabNote.guitar : null, { string: 6, fret: 3, techniques: [] });
  assert.match(result.xml, /<staff-details number="2"><staff-type>tab<\/staff-type><staff-lines>6<\/staff-lines><\/staff-details>/);
  assert.match(result.xml, /<staff>1<\/staff>/);
  assert.match(result.xml, /<staff>2<\/staff>/);
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
