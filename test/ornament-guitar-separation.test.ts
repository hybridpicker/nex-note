import test from 'node:test';
import assert from 'node:assert/strict';

import { importMusicXmlToCore } from '../src/musicxml-adapter/import/import-musicxml.ts';
import { exportCoreToMusicXml } from '../src/musicxml-adapter/export/export-core-to-musicxml.ts';
import { applyDocumentCommands, buildDocumentState } from '../src/score-core/commands/apply-document-commands.ts';

/* Ornament lines and standard-notation technique marks are not guitar TAB data (iteration 13). */

const VIOLIN_TRILL = `<?xml version="1.0" encoding="UTF-8"?>
<score-partwise version="4.0"><part-list><score-part id="P1"><part-name>Violin</part-name></score-part></part-list><part id="P1">
<measure number="1"><attributes><divisions>1</divisions><time><beats>4</beats><beat-type>4</beat-type></time><clef><sign>G</sign><line>2</line></clef></attributes>
<note><pitch><step>A</step><octave>5</octave></pitch><duration>2</duration><voice>1</voice><type>half</type><notations><ornaments><trill-mark/><wavy-line type="start"/></ornaments></notations></note>
<note><pitch><step>B</step><octave>5</octave></pitch><duration>2</duration><voice>1</voice><type>half</type><notations><ornaments><wavy-line type="stop"/></ornaments><technical><up-bow/></technical></notations></note>
</measure></part></score-partwise>`;

const GUITAR_TAB_NOTE = `<?xml version="1.0" encoding="UTF-8"?>
<score-partwise version="4.0"><part-list><score-part id="P1"><part-name>Guitar</part-name></score-part></part-list><part id="P1">
<measure number="1"><attributes><divisions>1</divisions><time><beats>4</beats><beat-type>4</beat-type></time><clef><sign>G</sign><line>2</line></clef></attributes>
<note><pitch><step>A</step><octave>3</octave></pitch><duration>4</duration><voice>1</voice><type>whole</type><notations><technical><string>3</string><fret>2</fret></technical><ornaments><wavy-line type="start"/></ornaments></notations></note>
</measure></part></score-partwise>`;

function editSecondNote(xml: string) {
  const state = buildDocumentState(xml);
  const event = state.coreDocument!.score.parts[0]!.staves[0]!.measures[0]!.voices[0]!.events[1]!;
  return applyDocumentCommands(state, [{
    type: 'changeNotePitch', coreEntityId: event.id, measureNumber: 1, staffIndex: 1, voiceId: 1,
    timestampNum: event.timestampNum, timestampDen: event.timestampDen, step: 'C', octave: 6, alter: 0,
  } as never]);
}

test('a violin trill line is not imported as guitar string and fret', () => {
  const events = importMusicXmlToCore(VIOLIN_TRILL).score.parts[0]!.staves[0]!.measures[0]!.voices[0]!.events;
  assert.equal(events.every((event) => event.kind !== 'note' || event.guitar === undefined), true);
  const exported = exportCoreToMusicXml(VIOLIN_TRILL, importMusicXmlToCore(VIOLIN_TRILL));
  assert.doesNotMatch(exported, /<string>|<fret>/);
});

test('editing next to a trill keeps the trill line start and stop', () => {
  const edited = editSecondNote(VIOLIN_TRILL);
  assert.doesNotMatch(edited.xml, /<string>|<fret>/);
  assert.deepEqual((edited.xml.match(/<wavy-line type="(\w+)"/g) ?? []), ['<wavy-line type="start"', '<wavy-line type="stop"']);
  assert.match(edited.xml, /<trill-mark\/>/);
  assert.match(edited.xml, /<up-bow\/>/);
});

test('a real TAB note keeps its string, fret and vibrato', () => {
  const core = importMusicXmlToCore(GUITAR_TAB_NOTE);
  const note = core.score.parts[0]!.staves[0]!.measures[0]!.voices[0]!.events[0]!;
  assert.equal(note.kind, 'note');
  assert.deepEqual(note.kind === 'note' ? { string: note.guitar?.string, fret: note.guitar?.fret, vibrato: note.guitar?.techniques?.includes('vibrato') } : null, { string: 3, fret: 2, vibrato: true });
  const exported = exportCoreToMusicXml(GUITAR_TAB_NOTE, core);
  assert.match(exported, /<string>3<\/string><fret>2<\/fret>/);
});
