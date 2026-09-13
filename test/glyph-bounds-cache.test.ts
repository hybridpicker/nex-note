import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { cacheGlyphOutlineBounds } from '../src/render-bridge/osmd/glyph-bounds-cache';
const require = createRequire(import.meta.url);

test('glyph cache exactly preserves real VexFlow bounds across scale, translation and outline edits', () => {
  const previousWindow = Object.getOwnPropertyDescriptor(globalThis, 'window');
  Object.defineProperty(globalThis, 'window', { value: {}, configurable: true });
  const Glyph = require('vexflow/releases/vexflow-debug.js').Flow.Glyph;
  if (previousWindow) Object.defineProperty(globalThis, 'window', previousWindow);
  else delete (globalThis as any).window;
  const original = Glyph.getOutlineBoundingBox;
  const outline = ['m', 0, 0, 'b', 12, 3, 2, 14, 7, -5];
  const values = (bounds: any) => [bounds.getX(), bounds.getY(), bounds.getW(), bounds.getH()];
  const cases = [[1, 0, 0], [.72, 1, -5], [2, -12, 20]];
  const expected = cases.map(args => values(original(outline, ...args)));
  let calls = 0;
  const adapter = { getOutlineBoundingBox: (...args: any[]) => { calls++; return original(...args); } };
  cacheGlyphOutlineBounds(adapter);
  for (let repeat = 0; repeat < 3; repeat++) cases.forEach(([scale, x, y], i) => {
    const box = adapter.getOutlineBoundingBox(outline, scale!, x!, y!);
    assert.deepEqual(values(box), expected[i]);
    box.move(100, 100);
  });
  assert.equal(calls, 3);
  outline[2] = 20;
  assert.deepEqual(values(adapter.getOutlineBoundingBox(outline, 1, 0, 0)), values(original(outline, 1, 0, 0)));
  assert.equal(calls, 4);
});
