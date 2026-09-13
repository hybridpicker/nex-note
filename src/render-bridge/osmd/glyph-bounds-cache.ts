interface Bounds {
  getX(): number; getY(): number; getW(): number; getH(): number;
  clone(): Bounds;
}
interface GlyphConstructor {
  getOutlineBoundingBox(outline: Array<string | number>, scale: number, x: number, y: number): Bounds;
}
const installed = new WeakSet<object>();

/** VexFlow 1.x recalculates identical Bezier extrema for every glyph instance.
 * Cache the pure outline/scale/position calculation, never mutable glyphs or
 * score layout. Return a fresh box because VexFlow callers can move it. */
export function cacheGlyphOutlineBounds(glyph: GlyphConstructor, capacity = 512) {
  if (installed.has(glyph)) return;
  installed.add(glyph);
  const original = glyph.getOutlineBoundingBox;
  const cache = new Map<string, Bounds>();
  glyph.getOutlineBoundingBox = function(outline, scale, x, y) {
    const key = JSON.stringify([scale, x, y, outline]);
    const cached = cache.get(key);
    if (cached) return cached.clone();
    const bounds = original.call(this, outline, scale, x, y);
    if (typeof bounds?.clone === 'function' && [bounds.getX(), bounds.getY(), bounds.getW(), bounds.getH()].every(Number.isFinite)) {
      cache.set(key, bounds.clone());
      if (cache.size > capacity) cache.delete(cache.keys().next().value!);
    }
    return bounds;
  };
}

/** Resolve the bundled VexFlow constructor through OSMD's own stave API.
 * A different OSMD/VexFlow shape simply keeps the original rendering path. */
export function installOsmdGlyphBoundsCache(osmd: unknown): boolean {
  const measures = (osmd as { GraphicSheet?: { MeasureList?: unknown[][] } })?.GraphicSheet?.MeasureList;
  if (!Array.isArray(measures)) return false;
  for (const row of measures) for (const measure of row) {
    const stave = (measure as { getVFStave?: () => { getModifiers?: () => Array<{ glyph?: { constructor?: unknown } }> } })?.getVFStave?.();
    for (const modifier of stave?.getModifiers?.() ?? []) {
      const glyph = modifier.glyph?.constructor as GlyphConstructor | undefined;
      if (typeof glyph?.getOutlineBoundingBox !== 'function') continue;
      cacheGlyphOutlineBounds(glyph);
      return true;
    }
  }
  return false;
}
