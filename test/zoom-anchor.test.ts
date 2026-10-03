import test from 'node:test';
import assert from 'node:assert/strict';

import { captureZoomAnchor, resolveAnchoredScroll } from '../src/score-input/zoom-anchor.ts';

test('the score point under the pointer stays under the pointer after zooming in', () => {
  const anchor = captureZoomAnchor({ scrollLeft: 100, scrollTop: 50, pointerX: 200, pointerY: 120, renderedZoom: 100 });
  const next = resolveAnchoredScroll(anchor!, 150);
  // content point (300, 170) at 100 % -> (450, 255) at 150 %; minus the pointer offset.
  assert.deepEqual(next, { left: 250, top: 135 });
});

test('zooming out clamps scroll at zero instead of going negative', () => {
  const anchor = captureZoomAnchor({ scrollLeft: 0, scrollTop: 0, pointerX: 400, pointerY: 300, renderedZoom: 200 });
  const next = resolveAnchoredScroll(anchor!, 25);
  assert.deepEqual(next, { left: 0, top: 0 });
});

test('an unchanged zoom keeps the scroll position', () => {
  const anchor = captureZoomAnchor({ scrollLeft: 37, scrollTop: 81, pointerX: 10, pointerY: 20, renderedZoom: 125 });
  assert.deepEqual(resolveAnchoredScroll(anchor!, 125), { left: 37, top: 81 });
});

test('a non-positive rendered zoom is rejected instead of dividing by zero', () => {
  assert.equal(captureZoomAnchor({ scrollLeft: 0, scrollTop: 0, pointerX: 0, pointerY: 0, renderedZoom: 0 }), null);
});
