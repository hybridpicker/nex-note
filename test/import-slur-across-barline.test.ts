import test from 'node:test';
import assert from 'node:assert/strict';

import { importMusicXmlToCore } from '../src/musicxml-adapter/import/import-musicxml.ts';
import { scoreXml, TREBLE } from './support/entry-fixtures.ts';

/*
 * Found by keyboard passage 1 (iteration 37): a slur that starts in one bar and stops in the next was
 * imported as two half slurs (one start without a stop, one stop without a start), because the open
 * slurs were tracked per measure. A reopened file lost the pairing.
 */

const note = (step: string, notations = '') =>
  `<note><pitch><step>${step}</step><octave>5</octave></pitch><duration>4</duration><voice>1</voice><type>quarter</type>${notations ? `<notations>${notations}</notations>` : ''}</note>`;

const START = '<slur number="1" type="start"/>';
const STOP = '<slur number="1" type="stop"/>';

test('a slur from the last note of a bar to the first note of the next imports as one slur', () => {
  const xml = scoreXml({
    beats: 4, beatType: 4, measures: 2,
    parts: [{ ...TREBLE, content: { '1:1': note('C') + note('D') + note('E') + note('F', START), '2:1': note('G', STOP) + note('A') + note('B') + note('C') } }],
  });
  const core = importMusicXmlToCore(xml);
  assert.equal(core.slurs.length, 1);
  assert.ok(core.slurs[0]!.startEventId && core.slurs[0]!.stopEventId, 'both ends are set');
  assert.notEqual(core.slurs[0]!.startEventId, core.slurs[0]!.stopEventId);
});

test('slurs with the same number in different parts do not pair with each other', () => {
  const part = (id: string) => ({ ...TREBLE, id, name: id, content: { '1:1': note('C') + note('D') + note('E') + note('F', START), '2:1': note('G', STOP) + note('A') + note('B') + note('C') } });
  const core = importMusicXmlToCore(scoreXml({ beats: 4, beatType: 4, measures: 2, parts: [part('P1'), part('P2')] }));
  assert.equal(core.slurs.length, 2);
  const partOf = new Map<string, string>();
  for (const part of core.score.parts) for (const staff of part.staves) for (const measure of staff.measures) {
    for (const voice of measure.voices) for (const event of voice.events) partOf.set(event.id, part.id);
  }
  for (const slur of core.slurs) {
    assert.ok(slur.startEventId && slur.stopEventId, 'both ends are set');
    assert.equal(partOf.get(slur.startEventId!), partOf.get(slur.stopEventId!), 'a slur stays in one part');
  }
});
