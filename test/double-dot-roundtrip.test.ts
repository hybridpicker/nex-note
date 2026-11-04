import test from 'node:test';
import assert from 'node:assert/strict';

import { importMusicXmlToCore } from '../src/musicxml-adapter/import/import-musicxml.ts';
import { exportCoreToMusicXml } from '../src/musicxml-adapter/export/export-core-to-musicxml.ts';
import { applyDocumentCommands, buildDocumentState } from '../src/score-core/commands/apply-document-commands.ts';
import { validateScoreDocument } from '../src/score-core/validation/validate-score-document.ts';

const DOUBLE_DOTTED = `<?xml version="1.0" encoding="UTF-8"?>
<score-partwise version="4.0"><part-list><score-part id="P1"><part-name>Flute</part-name></score-part></part-list><part id="P1">
<measure number="1"><attributes><divisions>8</divisions><time><beats>4</beats><beat-type>4</beat-type></time><clef><sign>G</sign><line>2</line></clef></attributes>
<note><pitch><step>C</step><octave>5</octave></pitch><duration>14</duration><voice>1</voice><type>quarter</type><dot/><dot/></note>
<note><pitch><step>D</step><octave>5</octave></pitch><duration>2</duration><voice>1</voice><type>16th</type></note>
<note><rest/><duration>14</duration><voice>1</voice><type>quarter</type><dot/><dot/></note>
<note><pitch><step>E</step><octave>5</octave></pitch><duration>2</duration><voice>1</voice><type>16th</type></note>
</measure></part></score-partwise>`;

const dotsBefore = (xml: string, marker: string) => (xml.split(marker)[0]!.match(/<dot\/>/g) ?? []).length;

test('double-dotted notes and rests keep both dots through import and export', () => {
  const exported = exportCoreToMusicXml(DOUBLE_DOTTED, importMusicXmlToCore(DOUBLE_DOTTED));
  assert.equal(dotsBefore(exported, '<step>D</step>'), 2);
  assert.equal((exported.match(/<dot\/>/g) ?? []).length, 4);
  assert.deepEqual(
    validateScoreDocument(importMusicXmlToCore(exported)).filter((d) => d.code === 'event_duration_notation_mismatch'),
    [],
  );
});

test('an unrelated edit keeps the double dots of the note and the time of the bar', () => {
  const state = buildDocumentState(DOUBLE_DOTTED);
  const d = state.coreDocument!.score.parts[0]!.staves[0]!.measures[0]!.voices[0]!.events[1]!;
  const edited = applyDocumentCommands(state, [{
    type: 'changeNotePitch', coreEntityId: d.id, measureNumber: 1, staffIndex: 1, voiceId: 1,
    timestampNum: d.timestampNum, timestampDen: d.timestampDen, step: 'F', octave: 5, alter: 0,
  } as never]);
  // The double-dotted note keeps both dots. The double-dotted rest may be re-spelled by the
  // existing rest speller (dotted quarter + sixteenth); its time must be unchanged.
  assert.equal(dotsBefore(edited.xml, '<step>F</step>'), 2);
  const events = importMusicXmlToCore(edited.xml).score.parts[0]!.staves[0]!.measures[0]!.voices[0]!.events;
  assert.equal(events.reduce((sum, event) => sum + event.durationDivisions, 0), 32);
  assert.ok(events.every((event) => (event as { dotCount?: number }).dotCount == null || event.durationDivisions === 14), JSON.stringify(events.map((event) => [event.durationType, (event as { dotCount?: number }).dotCount])));
  assert.equal(edited.diagnostics.some((d) => d.code === 'event_duration_notation_mismatch'), false);
});

test('changing the value of a double-dotted note never writes a stale double dot', () => {
  const state = buildDocumentState(DOUBLE_DOTTED);
  const c = state.coreDocument!.score.parts[0]!.staves[0]!.measures[0]!.voices[0]!.events[0]!;
  const edited = applyDocumentCommands(state, [{
    type: 'changeNoteDuration', coreEntityId: c.id, measureNumber: 1, staffIndex: 1, voiceId: 1,
    timestampNum: c.timestampNum, timestampDen: c.timestampDen, durationType: 'eighth', isDotted: false,
  } as never]);
  const firstNote = edited.xml.split('</note>')[0]!;
  assert.match(firstNote, /<type>eighth<\/type>/);
  assert.equal((firstNote.match(/<dot\/>/g) ?? []).length, 0);
  assert.equal(edited.diagnostics.some((d) => d.code === 'event_duration_notation_mismatch'), false);
});
