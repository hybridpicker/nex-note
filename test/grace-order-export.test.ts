import test from 'node:test';
import assert from 'node:assert/strict';

import { importMusicXmlToCore } from '../src/musicxml-adapter/import/import-musicxml.ts';
import { applyDocumentCommands, buildDocumentState } from '../src/score-core/commands/apply-document-commands.ts';

/*
 * A MusicXML grace note belongs to the note that follows it. After a later edit re-sorts the voice,
 * export must still write each grace before its main note (iteration 22).
 */

const BAR = `<?xml version="1.0" encoding="UTF-8"?>
<score-partwise version="4.0"><part-list><score-part id="P1"><part-name>Flute</part-name></score-part></part-list><part id="P1">
<measure number="1"><attributes><divisions>4</divisions><time><beats>4</beats><beat-type>4</beat-type></time><clef><sign>G</sign><line>2</line></clef></attributes>
<note><pitch><step>C</step><octave>5</octave></pitch><duration>4</duration><voice>1</voice><type>quarter</type></note>
<note><rest/><duration>4</duration><voice>1</voice><type>quarter</type></note>
<note><rest/><duration>8</duration><voice>1</voice><type>half</type></note>
</measure></part></score-partwise>`;

function graceAnchors(xml: string) {
  const core = importMusicXmlToCore(xml);
  const events = core.score.parts[0]!.staves[0]!.measures[0]!.voices[0]!.events;
  const graceIds = new Set(core.graceNotes.map((grace) => grace.eventId));
  return events
    .filter((event) => graceIds.has(event.id))
    .map((grace) => {
      const main = events.find((event) => !graceIds.has(event.id) && event.timestampNum * grace.timestampDen === grace.timestampNum * event.timestampDen);
      return `${grace.kind === 'note' ? grace.pitch.step : '?'} before ${main?.kind === 'note' ? main.pitch.step : 'rest'}`;
    });
}

test('a grace note stays before its main note after a later entry in the bar', () => {
  const state = buildDocumentState(BAR);
  const c = state.coreDocument!.score.parts[0]!.staves[0]!.measures[0]!.voices[0]!.events[0]!;
  const withGrace = applyDocumentCommands(state, [{
    type: 'addGraceNote', coreEntityId: c.id, measureNumber: 1, staffIndex: 1, voiceId: 1,
    timestampNum: c.timestampNum, timestampDen: c.timestampDen, slash: true,
  } as never]);
  assert.deepEqual(graceAnchors(withGrace.xml), ['C before C']);
  const withNextNote = applyDocumentCommands(withGrace, [{
    type: 'insertNoteAt', measureNumber: 1, staffIndex: 1, voiceId: 1, timestampNum: 4, timestampDen: 16,
    step: 'D', octave: 5, alter: 0, durationType: 'quarter', isDotted: false, asChord: false, preserveOverflow: false,
  } as never]);
  assert.deepEqual(graceAnchors(withNextNote.xml), ['C before C']);
  const order = (withNextNote.xml.match(/<note>[\s\S]*?<\/note>/g) ?? []).slice(0, 3).map((note) => (note.includes('<grace') ? 'grace' : note.includes('<step>C') ? 'C' : 'D'));
  assert.deepEqual(order, ['grace', 'C', 'D']);
});
