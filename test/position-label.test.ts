import assert from 'node:assert/strict';
import test from 'node:test';

import { importMusicXmlToCore } from '../src/musicxml-adapter/import/import-musicxml.ts';
import { beatOfOnset, describePosition, durationLabelKey, formatBeat } from '../src/score-input/position-label.ts';
import { scoreXml, TREBLE } from './support/entry-fixtures.ts';

test('O4: an onset is named as a beat of the bar, not as a fraction', () => {
  assert.equal(formatBeat(beatOfOnset(0, 16, 4)), '1');
  assert.equal(formatBeat(beatOfOnset(4, 16, 4)), '2');
  assert.equal(formatBeat(beatOfOnset(3, 8, 4)), '2.5');
  assert.equal(formatBeat(beatOfOnset(1, 12, 4)), '1.33');
  assert.equal(formatBeat(beatOfOnset(3, 8, 8)), '4', 'in 6/8 the beat is the eighth');
});

test('O4: the beat follows the time signature of the bar', () => {
  const sixEight = importMusicXmlToCore(scoreXml({ beats: 6, beatType: 8, measures: 2, parts: [{ ...TREBLE }] }));
  assert.deepEqual(describePosition(sixEight, { measureNumber: 2, staffIndex: 1, timestampNum: 3, timestampDen: 8 }), { bar: 2, beat: '4' });
  const common = importMusicXmlToCore(scoreXml({ beats: 4, beatType: 4, measures: 2, parts: [{ ...TREBLE }] }));
  assert.deepEqual(describePosition(common, { measureNumber: 1, staffIndex: 1, timestampNum: 3, timestampDen: 8 }), { bar: 1, beat: '2.5' });
});

test('O4: stored duration types map to the translated value names', () => {
  assert.equal(durationLabelKey('quarter'), '4');
  assert.equal(durationLabelKey('16th'), '16');
  assert.equal(durationLabelKey(undefined), null);
});
