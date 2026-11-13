import assert from 'node:assert/strict';
import test from 'node:test';

import { buildPlaybackGeometry } from '../lib/playback-geometry.ts';

const measures = [
  // System 0: measures 1 and 2 side by side; measure 3 starts system 1.
  { measureNumber: 1, x: 100, y: 50, width: 200, height: 80, systemIndex: 0 },
  { measureNumber: 2, x: 300, y: 50, width: 150, height: 80, systemIndex: 0 },
  { measureNumber: 3, x: 80, y: 200, width: 220, height: 80, systemIndex: 1 },
];

function note(measureNumber: number, positionWholes: number, x: number, extra: Partial<{ isRest: boolean; isMeasureRest: boolean }> = {}) {
  return { measureNumber, positionWholes, x, isRest: false, ...extra, item: `${measureNumber}@${positionWholes}` };
}

const notes = [
  // Measure 1 (4/4): a clef and time signature push the first note right; spacing is not linear.
  note(1, 0, 160), note(1, 0.5, 220), note(1, 0.75, 270),
  note(2, 0, 320), note(2, 0.25, 360),
  note(3, 0, 140, { isRest: true, isMeasureRest: true }),
];

test('the playhead stands on each onset and moves linearly in time between onsets', () => {
  const geometry = buildPlaybackGeometry(measures, notes);
  assert.equal(geometry.place(1, 0, 1, 2)?.x, 160);
  assert.equal(geometry.place(1, 0.5, 1, 2)?.x, 220);
  assert.equal(geometry.place(1, 0.25, 1, 2)?.x, 190);
  assert.equal(geometry.place(1, 0.75, 1, 2)?.x, 270);
});

test('at the end of a measure the playhead glides into the next measure on the same system', () => {
  const geometry = buildPlaybackGeometry(measures, notes);
  // From the last onset (0.75 at x 270) to the next measure's first note (x 320).
  assert.equal(geometry.place(1, 0.875, 1, 2)?.x, 295);
  // The last measure of a system runs to its right edge instead of jumping to the next system.
  assert.equal(geometry.place(2, 1, 1, 3)?.x, 450);
  // A repeat back to an earlier measure ends at the barline too.
  assert.equal(geometry.place(2, 1, 1, 1)?.x, 450);
  const placement = geometry.place(3, 0, 1, null);
  assert.deepEqual({ y: placement?.y, height: placement?.height, systemIndex: placement?.systemIndex }, { y: 200, height: 80, systemIndex: 1 });
});

test('a measure without a downbeat note starts just after its barline; a measure rest is no anchor', () => {
  const geometry = buildPlaybackGeometry(measures, notes);
  assert.equal(geometry.place(3, 0, 1, null)?.x, 84);
  assert.equal(geometry.place(3, 0.5, 1, null)?.x, 192);
  assert.equal(geometry.onsetAt(3, 0.5)?.items[0], '3@0');
});

test('onsetAt returns the last onset reached, never a future one', () => {
  const geometry = buildPlaybackGeometry(measures, [...notes, note(1, 0.5, 222)]);
  assert.equal(geometry.onsetAt(1, 0.49)?.positionWholes, 0);
  assert.deepEqual(geometry.onsetAt(1, 0.5)?.items, ['1@0.5', '1@0.5']);
  assert.equal(geometry.onsetAt(2, -0.1), null);
  assert.equal(geometry.onsetAt(9, 0), null);
});

test('anchors stay monotonic and positionForX inverts placement', () => {
  const geometry = buildPlaybackGeometry(measures, [note(1, 0, 160), note(1, 0.25, 150), note(1, 0.5, 220)]);
  assert.equal(geometry.place(1, 0.25, 1, null)?.x, 160);
  const clicked = buildPlaybackGeometry(measures, notes);
  assert.equal(clicked.positionForX(1, 190, 1), 0.25);
  assert.equal(clicked.positionForX(1, 90, 1), 0);
  assert.equal(clicked.positionForX(1, 999, 1), 1);
});
