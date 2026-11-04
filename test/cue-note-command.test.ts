import test from 'node:test';
import assert from 'node:assert/strict';

import { applyDocumentCommands, buildDocumentState } from '../src/score-core/commands/apply-document-commands.ts';
import { importMusicXmlToCore } from '../src/musicxml-adapter/import/import-musicxml.ts';
import { TREBLE, scoreXml } from './support/entry-fixtures.ts';

const QUARTERS = scoreXml({
  beats: 4,
  beatType: 4,
  measures: 1,
  parts: [{ ...TREBLE, content: { '1:1': ['C', 'D', 'E', 'F'].map((step) => `<note><pitch><step>${step}</step><octave>5</octave></pitch><duration>4</duration><voice>1</voice><type>quarter</type></note>`).join('') } }],
});

const second = { measureNumber: 1, staffIndex: 1, voiceId: 1, timestampNum: 4, timestampDen: 16 };

function noteXml(xml: string, step: string) {
  return xml.split('</note>').find((chunk) => chunk.includes(`<step>${step}</step>`)) ?? '';
}

test('setCueNote marks a note with <cue/> and keeps its value and duration', () => {
  const result = applyDocumentCommands(buildDocumentState(QUARTERS), [{ type: 'setCueNote', ...second, isCue: true } as never]);
  const d = noteXml(result.xml, 'D');
  assert.match(d, /<cue\/>\s*<pitch>/);
  assert.match(d, /<duration>4<\/duration>/);
  assert.match(d, /<type>quarter<\/type>/);
  assert.equal(result.diagnostics.some((entry) => entry.code === 'event_duration_notation_mismatch'), false);
  const reimported = importMusicXmlToCore(result.xml).score.parts[0]!.staves[0]!.measures[0]!.voices[0]!.events[1]!;
  assert.equal(reimported.durationType, 'quarter');
});

test('setCueNote with isCue false removes the cue mark', () => {
  const cued = applyDocumentCommands(buildDocumentState(QUARTERS), [{ type: 'setCueNote', ...second, isCue: true } as never]);
  const plain = applyDocumentCommands(cued, [{ type: 'setCueNote', ...second, isCue: false } as never]);
  assert.doesNotMatch(noteXml(plain.xml, 'D'), /<cue\/>/);
  assert.match(noteXml(plain.xml, 'D'), /<type>quarter<\/type>/);
});

test('setCueNote on a rest is rejected without changes', () => {
  const restBar = scoreXml({ beats: 4, beatType: 4, measures: 1, parts: [TREBLE] });
  const state = buildDocumentState(restBar);
  const result = applyDocumentCommands(state, [{ type: 'setCueNote', measureNumber: 1, staffIndex: 1, voiceId: 1, timestampNum: 0, timestampDen: 16, isCue: true } as never]);
  assert.equal(result.xml, state.xml);
  assert.ok(result.diagnostics.some((entry) => entry.code === 'cue_command_rejected'));
});
