import assert from 'node:assert/strict';
import test from 'node:test';

import { graphicalMeasureNumber } from '../src/score-core/GeometryProxy.ts';

/*
 * F39 in docs/note-entry-mastery-ledger.md. OSMD counts an implicit first bar (a pickup) as its bar 0
 * and the bar after it as 1, whatever the MusicXML says; the document and the stored MusicXML count the
 * pickup as bar 1. The mouse geometry took OSMD's count, so in a score with a pickup every bar had the
 * rectangle of the bar after it: previews were missing or drawn in the neighbouring bar.
 */

test('F39: a rendered bar is numbered as the MusicXML numbers it, not by the renderer\'s own count', () => {
  const pickup = { MeasureNumber: 0, parentSourceMeasure: { MeasureNumberXML: 1 } };
  const firstFullBar = { MeasureNumber: 1, parentSourceMeasure: { MeasureNumberXML: 2 } };
  assert.equal(graphicalMeasureNumber(pickup), 1);
  assert.equal(graphicalMeasureNumber(firstFullBar), 2);
});

test('F39: without a source bar the renderer\'s count is all there is', () => {
  assert.equal(graphicalMeasureNumber({ MeasureNumber: 3 }), 3);
  assert.equal(graphicalMeasureNumber({}), null);
});
