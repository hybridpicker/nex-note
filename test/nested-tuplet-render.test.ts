import test from 'node:test';
import assert from 'node:assert/strict';
import { buildDocumentState } from '../src/score-core/commands/apply-document-commands';
import { syntheticScore } from '../scripts/benchmark-note-entry';
import { nestedTupletRenderXml } from '../src/render-bridge/osmd/nested-tuplets';
import { applyDocumentCommands } from '../src/score-core/commands/apply-document-commands';
import { DOMParser } from '@xmldom/xmldom';

test('nested suppression preserves an unrelated group reusing the same MusicXML tuplet number', () => {
  let state = buildDocumentState(syntheticScore(2));
  const root = state.coreDocument!.score.parts[0]!.staves[0]!.measures[0]!.voices[0]!.events[0]!;
  const location = { coreEntityId: root.id, corePartId: 'P1', measureNumber: 1, staffIndex: 1, voiceId: 1, startTimestampNum: 0, startTimestampDen: 1, stopTimestampNum: 0, stopTimestampDen: 1, normalNotes: 2, bracket: true, showNumber: 'both' as const };
  state = applyDocumentCommands(state, [{ type: 'addTuplet', ...location, actualNotes: 5 }, { type: 'addTuplet', ...location, actualNotes: 3 }]);
  const reusedNumber = state.coreDocument!.tuplets[0]!.number;
  const xml = state.xml.replace('<measure number="2">', `<measure number="2"><direction><direction-type><words>Synthetic unaffected group</words></direction-type></direction>`).replace(/(<measure number="2">[\s\S]*?<note>)([\s\S]*?)(<\/note>)/, `$1$2<notations><tuplet type="start" number="${reusedNumber}" bracket="yes" show-number="both"/></notations>$3`);
  const rendered = nestedTupletRenderXml(xml, state.coreDocument);
  const measures = new DOMParser().parseFromString(rendered, 'text/xml').getElementsByTagName('measure');
  const unrelated = measures[1]!.getElementsByTagName('tuplet')[0]!;
  assert.equal(unrelated.getAttribute('show-number'), 'both');
  assert.equal(unrelated.getAttribute('bracket'), 'yes');
  assert.equal(measures[0]!.getElementsByTagName('tuplet')[0]!.getAttribute('show-number'), 'none');
});

test('nested rendering suppresses only affected OSMD brackets without mutating semantic XML', () => {
  const document = buildDocumentState(syntheticScore(1)).coreDocument!;
  document.tuplets = [
    { id: 'outer', number: 1, actualNotes: 5, normalNotes: 2, eventIds: ['a','b','c'] },
    { id: 'inner', number: 2, actualNotes: 3, normalNotes: 2, eventIds: ['a','b'] },
    { id: 'unrelated', number: 3, actualNotes: 3, normalNotes: 2, eventIds: ['d','e','f'] },
  ];
  const source = '<score-partwise><part id="P1"><measure number="1"><note><notations><tuplet type="start" number="1" bracket="yes" show-number="both"/><tuplet type="start" number="2"/></notations></note><note><notations><tuplet type="stop" number="2"/><tuplet type="stop" number="1"/></notations></note><note><notations><tuplet type="start" number="3" bracket="yes" show-number="both"/></notations></note><note><notations><tuplet type="stop" number="3"/></notations></note></measure></part></score-partwise>';
  const rendered = nestedTupletRenderXml(source, document);
  assert.equal((rendered.match(/show-number="none"/g) ?? []).length,4);
  assert.match(rendered, /number="3" bracket="yes" show-number="both"/);
  assert.equal(source.includes('show-number="none"'), false);
});

test('ordinary tuplets pass through the renderer projection unchanged', () => {
  const document = buildDocumentState(syntheticScore(1)).coreDocument!;
  document.tuplets = [{ id: 'ordinary', number: 1, actualNotes: 3, normalNotes: 2, eventIds: ['a','b','c'] }];
  const source = '<tuplet type="start" number="1" show-number="both"/>';
  assert.equal(nestedTupletRenderXml(source, document),source);
});
