export interface ZoomAnchor {
  /** Score point under the pointer, in zoom-independent units (1 unit = 1 px at 100 %). */
  contentX: number;
  contentY: number;
  /** Pointer offset inside the scroll viewport, in CSS px. */
  pointerX: number;
  pointerY: number;
}

export function captureZoomAnchor(input: {
  scrollLeft: number;
  scrollTop: number;
  pointerX: number;
  pointerY: number;
  renderedZoom: number;
}): ZoomAnchor | null {
  if (!(input.renderedZoom > 0)) return null;
  const scale = 100 / input.renderedZoom;
  return {
    contentX: (input.scrollLeft + input.pointerX) * scale,
    contentY: (input.scrollTop + input.pointerY) * scale,
    pointerX: input.pointerX,
    pointerY: input.pointerY,
  };
}

/** Scroll offsets that put the anchored score point back under the pointer at `zoom`. */
export function resolveAnchoredScroll(anchor: ZoomAnchor, zoom: number) {
  const scale = zoom / 100;
  return {
    left: Math.max(0, Math.round(anchor.contentX * scale - anchor.pointerX)),
    top: Math.max(0, Math.round(anchor.contentY * scale - anchor.pointerY)),
  };
}
