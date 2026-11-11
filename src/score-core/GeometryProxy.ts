import type {
  RenderedMeasureLayoutOverlay,
} from '@/src/render-bridge/osmd/layout-plan-bridge';
import {
  findNearestRenderedGhostPoint,
  type RenderedGhostGrid,
  type RenderedGhostGridPoint,
} from '@/src/render-bridge/osmd/rendered-ghost-grid';
import type {
  ScoreDocumentModel,
  TimedEvent,
  TupletSpan,
} from '@/src/score-core/model/types';
import { getEffectiveMeasureTiming } from '@/src/score-core/measure-timing';

export interface PointLike {
  x: number;
  y: number;
}

export interface Fraction {
  num: number;
  den: number;
}

export interface StaffDetail {
  staffIndex: number;
  /** MusicXML/OSMD part identity. Staff indexes restart for every part. */
  corePartId?: string | null;
  /** OSMD's score-global staff identity, used only as a stable fallback. */
  musicSheetStaffId?: number | null;
  topLineDomY: number;
  bottomLineDomY: number;
  lineDistanceDom: number;
  lineCount: number;
}

export interface ActiveTupletMeta {
  tupletId: string;
  number: number;
  actualNotes: number;
  normalNotes: number;
  ratio: number;
  start: Fraction;
  end: Fraction;
  staffIndex: number;
  voiceId: number;
  eventIds: string[];
}

export interface AugmentedMeasureLayout extends RenderedMeasureLayoutOverlay {
  staffDetails: StaffDetail[];
  activeTuplets: ActiveTupletMeta[];
  timeSignature: { beats: number; beatType: number } | null;
  measureDurationRatio: number;
  /** True when this overlay was synthesized from OSMD bounds because the
   * legacy notehead-union overlay had no entry for the measure (empty bar). */
  isVirtual: boolean;
}

export interface DetailedContext {
  measure: AugmentedMeasureLayout;
  staff: StaffDetail | null;
  relX: number;
  relY: number;
  staffStep: number | null;
  musicalTime: Fraction;
  snapPoint: RenderedGhostGridPoint | null;
  activeTuplet: ActiveTupletMeta | null;
}

export interface DetailedContextOptions {
  preferredStaffIndex?: number | null;
  hysteresisPx?: number;
}

export interface GeometryProxyUpdateInput {
  osmd: any;
  container: HTMLElement;
  coreDocument: ScoreDocumentModel | null | undefined;
  measureOverlays: RenderedMeasureLayoutOverlay[];
  renderedGhostGrid?: RenderedGhostGrid | null | undefined;
}

function readAbsolute(shape: any): PointLike | null {
  const abs = shape?.AbsolutePosition ?? shape?.absolutePosition;
  if (!abs) return null;
  const x = abs.x ?? abs.X;
  const y = abs.y ?? abs.Y;
  return typeof x === 'number' && typeof y === 'number' ? { x, y } : null;
}

function readSize(shape: any): { width: number; height: number } | null {
  const size = shape?.Size ?? shape?.size;
  if (!size) return null;
  const width = size.width ?? size.Width;
  const height = size.height ?? size.Height;
  return typeof width === 'number' && typeof height === 'number'
    ? { width, height }
    : null;
}

function readShape(obj: any): any | null {
  return obj?.PositionAndShape ?? obj?.positionAndShape ?? null;
}

function readLineCount(graphicalMeasure: any): number {
  const explicit = graphicalMeasure?.ParentStaff?.stafflineCount
    ?? graphicalMeasure?.parentStaff?.stafflineCount
    ?? graphicalMeasure?.stave?.options?.num_lines;
  return typeof explicit === 'number' && explicit > 0 ? explicit : 5;
}

function staffInteractiveYBounds(detail: StaffDetail): { top: number; bottom: number } {
  const lineDistance = Math.max(detail.lineDistanceDom, 1);
  const halfStep = lineDistance / 2;
  const bottomStaffStep = (Math.max(detail.lineCount, 1) - 1) * 2;
  const topLedgerLimit = -2;
  const bottomLedgerLimit = Math.max(bottomStaffStep + 14, 4);
  const noteheadPad = Math.max(lineDistance * 0.75, 8);
  return {
    top: detail.topLineDomY + (topLedgerLimit * halfStep) - noteheadPad,
    bottom: detail.topLineDomY + (bottomLedgerLimit * halfStep) + noteheadPad,
  };
}

function pointInsideMeasureInteractiveBounds(measure: AugmentedMeasureLayout, domPoint: PointLike): boolean {
  const r = measure.domRect;
  if (domPoint.x < r.x || domPoint.x > r.x + r.width) return false;
  if (domPoint.y >= r.y && domPoint.y <= r.y + r.height) return true;
  return measure.staffDetails.some((detail) => {
    const bounds = staffInteractiveYBounds(detail);
    return domPoint.y >= bounds.top && domPoint.y <= bounds.bottom;
  });
}

interface SvgLike {
  getScreenCTM: () => { a: number; b: number; c: number; d: number; e: number; f: number } | null;
  createSVGPoint: () => { x: number; y: number; matrixTransform: (m: any) => { x: number; y: number } };
}

function asSvgLike(candidate: unknown): SvgLike | null {
  if (!candidate || typeof candidate !== 'object') return null;
  const obj = candidate as Record<string, unknown>;
  if (typeof obj.getScreenCTM !== 'function') return null;
  if (typeof obj.createSVGPoint !== 'function') return null;
  return candidate as SvgLike;
}

function svgPointToContainer(
  svgEl: SvgLike,
  container: HTMLElement,
  point: PointLike,
): PointLike | null {
  const ctm = svgEl.getScreenCTM();
  if (!ctm) return null;
  const svgPoint = svgEl.createSVGPoint();
  svgPoint.x = point.x;
  svgPoint.y = point.y;
  const screenPoint = svgPoint.matrixTransform(ctm);
  const rect = container.getBoundingClientRect();
  return { x: screenPoint.x - rect.left, y: screenPoint.y - rect.top };
}

function collectGraphicalMeasures(osmd: any): any[] {
  const list = osmd?.GraphicSheet?.MeasureList ?? osmd?.graphicSheet?.measureList;
  if (!Array.isArray(list)) return [];
  const out: any[] = [];
  for (const row of list) {
    if (!Array.isArray(row)) continue;
    for (const entry of row) {
      if (entry) out.push(entry);
    }
  }
  return out;
}

/**
 * The bar number of a rendered measure. The MusicXML number comes first: it is the number the document
 * uses. OSMD's own `MeasureNumber` counts an implicit first bar (a pickup) as 0 and every bar after it
 * one too low, which gave each bar of such a score the rectangle of its neighbour (F39 in
 * docs/note-entry-mastery-ledger.md).
 */
export function graphicalMeasureNumber(graphicalMeasure: any): number | null {
  const parent = graphicalMeasure?.parentSourceMeasure ?? graphicalMeasure?.ParentSourceMeasure;
  const fromSource = parent?.MeasureNumberXML ?? parent?.measureNumberXML;
  if (typeof fromSource === 'number') return fromSource;
  const explicit = graphicalMeasure?.MeasureNumber ?? graphicalMeasure?.measureNumber;
  return typeof explicit === 'number' ? explicit : null;
}

function graphicalMeasureStaffIndex(graphicalMeasure: any): number | null {
  const parentStaff = graphicalMeasure?.ParentStaff ?? graphicalMeasure?.parentStaff;
  const id = parentStaff?.Id ?? parentStaff?.id;
  return typeof id === 'number' ? id : null;
}

function graphicalMeasurePartId(graphicalMeasure: any): string | null {
  const parentStaff = graphicalMeasure?.ParentStaff ?? graphicalMeasure?.parentStaff;
  const parentInstrument = parentStaff?.ParentInstrument ?? parentStaff?.parentInstrument;
  const id = parentInstrument?.IdString ?? parentInstrument?.idString;
  return typeof id === 'string' && id.trim() ? id.trim() : null;
}

function graphicalMeasureMusicSheetStaffId(graphicalMeasure: any): number | null {
  const parentStaff = graphicalMeasure?.ParentStaff ?? graphicalMeasure?.parentStaff;
  const id = parentStaff?.idInMusicSheet ?? parentStaff?.IdInMusicSheet;
  return typeof id === 'number' && Number.isFinite(id) ? id : null;
}

function readRenderedStaffLineYs(
  graphicalMeasure: any,
  lineCount: number,
): { topSvgY: number; bottomSvgY: number } | null {
  const stave = graphicalMeasure?.stave
    ?? graphicalMeasure?.Stave
    ?? graphicalMeasure?.VFStave
    ?? (typeof graphicalMeasure?.getVFStave === 'function' ? graphicalMeasure.getVFStave() : null);
  if (!stave || typeof stave.getYForLine !== 'function') return null;
  try {
    const topSvgY = stave.getYForLine(0);
    const bottomSvgY = stave.getYForLine(Math.max(0, lineCount - 1));
    if (
      typeof topSvgY === 'number'
      && typeof bottomSvgY === 'number'
      && Number.isFinite(topSvgY)
      && Number.isFinite(bottomSvgY)
      && bottomSvgY > topSvgY
    ) {
      return { topSvgY, bottomSvgY };
    }
  } catch {
    // Fall back to measure shape below when the VexFlow internals are absent.
  }
  return null;
}

function readRenderedStaveBounds(
  graphicalMeasure: any,
  lineCount: number,
): { x: number; width: number; topSvgY: number; bottomSvgY: number } | null {
  const stave = graphicalMeasure?.stave
    ?? graphicalMeasure?.Stave
    ?? graphicalMeasure?.VFStave
    ?? (typeof graphicalMeasure?.getVFStave === 'function' ? graphicalMeasure.getVFStave() : null);
  if (!stave || typeof stave.getYForLine !== 'function') return null;
  const x = typeof stave.getX === 'function' ? stave.getX() : null;
  const width = typeof stave.getWidth === 'function' ? stave.getWidth() : null;
  if (
    typeof x !== 'number'
    || typeof width !== 'number'
    || !Number.isFinite(x)
    || !Number.isFinite(width)
    || width <= 0
  ) return null;
  try {
    const topSvgY = stave.getYForLine(0);
    const bottomSvgY = stave.getYForLine(Math.max(0, lineCount - 1));
    if (
      typeof topSvgY === 'number'
      && typeof bottomSvgY === 'number'
      && Number.isFinite(topSvgY)
      && Number.isFinite(bottomSvgY)
      && bottomSvgY > topSvgY
    ) {
      return { x, width, topSvgY, bottomSvgY };
    }
  } catch {
    // Fall back to PositionAndShape below.
  }
  return null;
}

function extractStaffDetail(
  graphicalMeasure: any,
  svgEl: SvgLike,
  container: HTMLElement,
): StaffDetail | null {
  const staffIndex = graphicalMeasureStaffIndex(graphicalMeasure);
  if (staffIndex == null) return null;
  const shape = readShape(graphicalMeasure);
  const abs = readAbsolute(shape);
  const size = readSize(shape);
  if (!abs) return null;

  const lineCount = readLineCount(graphicalMeasure);
  const gaps = Math.max(1, lineCount - 1);

  const renderedLines = readRenderedStaffLineYs(graphicalMeasure, lineCount);
  const topSvg = { x: abs.x, y: renderedLines?.topSvgY ?? abs.y };
  const bottomSvg = {
    x: abs.x,
    y: renderedLines?.bottomSvgY ?? abs.y + (size?.height ?? 0),
  };
  const topDom = svgPointToContainer(svgEl, container, topSvg);
  const bottomDom = svgPointToContainer(svgEl, container, bottomSvg);
  if (!topDom || !bottomDom) return null;

  const topLineDomY = Math.min(topDom.y, bottomDom.y);
  const bottomLineDomY = Math.max(topDom.y, bottomDom.y);
  const lineDistanceDom = (bottomLineDomY - topLineDomY) / gaps;
  if (!Number.isFinite(lineDistanceDom) || lineDistanceDom <= 0) return null;

  return {
    staffIndex,
    corePartId: graphicalMeasurePartId(graphicalMeasure),
    musicSheetStaffId: graphicalMeasureMusicSheetStaffId(graphicalMeasure),
    topLineDomY,
    bottomLineDomY,
    lineDistanceDom,
    lineCount,
  };
}

function resolveSvg(container: HTMLElement): SvgLike | null {
  return asSvgLike(container.querySelector('svg'));
}

export function buildStaffDetailsByMeasure(
  osmd: any,
  container: HTMLElement,
): Map<number, StaffDetail[]> {
  const svgEl = resolveSvg(container);
  if (!svgEl) return new Map();

  const byMeasureNumber = new Map<number, StaffDetail[]>();
  for (const graphicalMeasure of collectGraphicalMeasures(osmd)) {
    const measureNumber = graphicalMeasureNumber(graphicalMeasure);
    if (measureNumber == null) continue;
    const detail = extractStaffDetail(graphicalMeasure, svgEl, container);
    if (!detail) continue;

    const existing = byMeasureNumber.get(measureNumber) ?? [];
    const centerY = (detail.topLineDomY + detail.bottomLineDomY) / 2;
    const tolerance = Math.max(1, detail.lineDistanceDom * 0.25);
    if (!existing.some((entry) => (
      entry.staffIndex === detail.staffIndex
      && entry.corePartId === detail.corePartId
      && entry.musicSheetStaffId === detail.musicSheetStaffId
      && Math.abs(((entry.topLineDomY + entry.bottomLineDomY) / 2) - centerY) <= tolerance
    ))) {
      existing.push(detail);
      existing.sort((a, b) => (
        ((a.topLineDomY + a.bottomLineDomY) / 2) - ((b.topLineDomY + b.bottomLineDomY) / 2)
        || a.staffIndex - b.staffIndex
      ));
      byMeasureNumber.set(measureNumber, existing);
    }
  }
  return byMeasureNumber;
}

/**
 * Builds a DOM-space rect for a graphical measure from its OSMD PositionAndShape.
 * Used only when the legacy notehead-union overlay has no entry for this
 * measure (empty bar).
 */
function extractMeasureDomRect(
  graphicalMeasure: any,
  svgEl: SvgLike,
  container: HTMLElement,
): { x: number; y: number; width: number; height: number } | null {
  const shape = readShape(graphicalMeasure);
  const abs = readAbsolute(shape);
  const size = readSize(shape);
  if (!abs || !size || size.width <= 0 || size.height <= 0) return null;
  const lineCount = readLineCount(graphicalMeasure);
  const renderedStave = readRenderedStaveBounds(graphicalMeasure, lineCount);
  const sourceX = renderedStave?.x ?? abs.x;
  const sourceWidth = renderedStave?.width ?? size.width;
  const sourceTopY = renderedStave?.topSvgY ?? abs.y;
  const sourceBottomY = renderedStave?.bottomSvgY ?? abs.y + size.height;
  const topLeft = svgPointToContainer(svgEl, container, { x: sourceX, y: sourceTopY });
  const bottomRight = svgPointToContainer(svgEl, container, {
    x: sourceX + sourceWidth,
    y: sourceBottomY,
  });
  if (!topLeft || !bottomRight) return null;
  return {
    x: Math.min(topLeft.x, bottomRight.x),
    y: Math.min(topLeft.y, bottomRight.y),
    width: Math.abs(bottomRight.x - topLeft.x),
    height: Math.abs(bottomRight.y - topLeft.y),
  };
}

function measureIdentityFor(
  coreDocument: ScoreDocumentModel | null | undefined,
  measureNumber: number,
  staffIndex: number | null,
  corePartId?: string | null,
): { measureId: string | null } {
  if (!coreDocument) return { measureId: null };
  const normalizedPartId = corePartId?.replace(/^part:/, '') ?? null;
  const matchingParts = normalizedPartId
    ? coreDocument.score.parts.filter((part) => (
      part.id.replace(/^part:/, '') === normalizedPartId
      || part.sourcePartId.replace(/^part:/, '') === normalizedPartId
    ))
    : coreDocument.score.parts;
  const parts = matchingParts.length > 0 ? matchingParts : coreDocument.score.parts;

  // Staff indexes restart for every MusicXML part. A rendered part identity
  // therefore has priority over both the local staff index and visual Y order.
  if (staffIndex != null) {
    for (const part of parts) {
      for (const staff of part.staves) {
        if (staff.staffIndex !== staffIndex) continue;
        const measure = staff.measures.find((entry) => entry.measureNumber === measureNumber);
        if (measure) return { measureId: measure.id };
      }
    }
  }
  for (const part of parts) {
    for (const staff of part.staves) {
      const measure = staff.measures.find((entry) => entry.measureNumber === measureNumber);
      if (measure) return { measureId: measure.id };
    }
  }
  return { measureId: null };
}

function orderedCoreStaves(coreDocument: ScoreDocumentModel | null | undefined) {
  return coreDocument?.score.parts.flatMap((part) => (
    [...part.staves]
      .sort((left, right) => left.staffIndex - right.staffIndex)
      .map((staff) => ({ partId: part.id, staffIndex: staff.staffIndex, measures: staff.measures }))
  )) ?? [];
}

function groupGraphicalMeasuresByVisualRow(
  entries: Array<{ graphicalMeasure: any; measureNumber: number; domRect: { x: number; y: number; width: number; height: number } }>,
) {
  const rows: typeof entries[] = [];
  for (const entry of [...entries].sort((left, right) => (
    (left.domRect.y + left.domRect.height / 2) - (right.domRect.y + right.domRect.height / 2)
    || left.domRect.x - right.domRect.x
  ))) {
    const centerY = entry.domRect.y + entry.domRect.height / 2;
    const row = rows.find((candidate) => {
      const candidateCenterY = candidate.reduce((sum, item) => sum + item.domRect.y + item.domRect.height / 2, 0) / Math.max(candidate.length, 1);
      return Math.abs(candidateCenterY - centerY) <= Math.max(12, entry.domRect.height * 0.35);
    });
    if (row) {
      row.push(entry);
      row.sort((left, right) => left.domRect.x - right.domRect.x);
    } else {
      rows.push([entry]);
    }
  }
  rows.sort((left, right) => {
    const leftCenter = left.reduce((sum, entry) => sum + entry.domRect.y + entry.domRect.height / 2, 0) / Math.max(left.length, 1);
    const rightCenter = right.reduce((sum, entry) => sum + entry.domRect.y + entry.domRect.height / 2, 0) / Math.max(right.length, 1);
    return leftCenter - rightCenter;
  });
  return rows;
}

function buildVisualMeasureIdentityMap(
  graphicalMeasures: any[],
  svgEl: SvgLike,
  container: HTMLElement,
  coreDocument: ScoreDocumentModel | null | undefined,
): Map<any, string> {
  const staves = orderedCoreStaves(coreDocument);
  if (staves.length === 0) return new Map();

  const entries = graphicalMeasures
    .map((graphicalMeasure) => {
      const measureNumber = graphicalMeasureNumber(graphicalMeasure);
      if (measureNumber == null) return null;
      const domRect = extractMeasureDomRect(graphicalMeasure, svgEl, container);
      return domRect ? { graphicalMeasure, measureNumber, domRect } : null;
    })
    .filter((entry): entry is NonNullable<typeof entry> => Boolean(entry));
  if (entries.length === 0) return new Map();

  const rows = groupGraphicalMeasuresByVisualRow(entries);
  const byGraphicalMeasure = new Map<any, string>();
  for (const entry of entries) {
    const corePartId = graphicalMeasurePartId(entry.graphicalMeasure);
    if (!corePartId) continue;
    const direct = measureIdentityFor(
      coreDocument,
      entry.measureNumber,
      graphicalMeasureStaffIndex(entry.graphicalMeasure),
      corePartId,
    ).measureId;
    if (direct) byGraphicalMeasure.set(entry.graphicalMeasure, direct);
  }
  for (let rowIndex = 0; rowIndex < rows.length; rowIndex += staves.length) {
    const systemRows = rows.slice(rowIndex, rowIndex + staves.length);
    for (let staffOffset = 0; staffOffset < staves.length; staffOffset += 1) {
      const staff = staves[staffOffset];
      const row = systemRows[staffOffset];
      if (!staff || !row) continue;
      for (const entry of row) {
        if (byGraphicalMeasure.has(entry.graphicalMeasure)) continue;
        const measure = staff.measures.find((candidate) => candidate.measureNumber === entry.measureNumber);
        if (measure) byGraphicalMeasure.set(entry.graphicalMeasure, measure.id);
      }
    }
  }
  return byGraphicalMeasure;
}

export function staffIndexForMeasureId(
  coreDocument: ScoreDocumentModel | null | undefined,
  measureId: string,
): number | null {
  if (!coreDocument) return null;
  for (const part of coreDocument.score.parts) {
    for (const staff of part.staves) {
      if (staff.measures.some((measure) => measure.id === measureId)) return staff.staffIndex;
    }
  }
  return null;
}

function staffIdentityForMeasureId(
  coreDocument: ScoreDocumentModel | null | undefined,
  measureId: string,
): { staffIndex: number; partId: string; sourcePartId: string } | null {
  if (!coreDocument) return null;
  for (const part of coreDocument.score.parts) {
    for (const staff of part.staves) {
      if (staff.measures.some((measure) => measure.id === measureId)) {
        return { staffIndex: staff.staffIndex, partId: part.id, sourcePartId: part.sourcePartId };
      }
    }
  }
  return null;
}

function staffDetailMatchesPart(
  detail: StaffDetail,
  identity: { partId: string; sourcePartId: string },
) {
  const detailPartId = detail.corePartId?.replace(/^part:/, '') ?? null;
  if (!detailPartId) return false;
  return identity.partId.replace(/^part:/, '') === detailPartId
    || identity.sourcePartId.replace(/^part:/, '') === detailPartId;
}

function staffDetailsForOverlay(
  staffDetailsByMeasure: Map<number, StaffDetail[]>,
  coreDocument: ScoreDocumentModel | null | undefined,
  overlay: Pick<RenderedMeasureLayoutOverlay, 'measureId' | 'measureNumber' | 'domRect'>,
) {
  const details = staffDetailsByMeasure.get(overlay.measureNumber) ?? [];
  const identity = staffIdentityForMeasureId(coreDocument, overlay.measureId);
  if (!identity) return details;
  const partMatching = details.filter((detail) => (
    detail.staffIndex === identity.staffIndex && staffDetailMatchesPart(detail, identity)
  ));
  const matching = partMatching.length > 0
    ? partMatching
    : details.filter((detail) => detail.staffIndex === identity.staffIndex);
  if (matching.length <= 1) return matching.length > 0 ? matching : details;
  const overlayCenterY = overlay.domRect.y + (overlay.domRect.height / 2);
  return [matching.slice().sort((left, right) => {
    const leftCenter = (left.topLineDomY + left.bottomLineDomY) / 2;
    const rightCenter = (right.topLineDomY + right.bottomLineDomY) / 2;
    return Math.abs(leftCenter - overlayCenterY) - Math.abs(rightCenter - overlayCenterY);
  })[0]!];
}

export function unionRects(
  left: { x: number; y: number; width: number; height: number },
  right: { x: number; y: number; width: number; height: number },
) {
  const x = Math.min(left.x, right.x);
  const y = Math.min(left.y, right.y);
  const r = Math.max(left.x + left.width, right.x + right.width);
  const b = Math.max(left.y + left.height, right.y + right.height);
  return { x, y, width: r - x, height: b - y };
}

function mergeHorizontalBounds(
  base: { x: number; y: number; width: number; height: number },
  extra: { x: number; y: number; width: number; height: number } | null,
) {
  if (!extra) return base;
  const x = Math.min(base.x, extra.x);
  const right = Math.max(base.x + base.width, extra.x + extra.width);
  return {
    ...base,
    x,
    width: right - x,
  };
}

export function buildGraphicalMeasureRectsById(
  osmd: any,
  container: HTMLElement,
  coreDocument: ScoreDocumentModel | null | undefined,
): Map<string, { x: number; y: number; width: number; height: number }> {
  const svgEl = resolveSvg(container);
  if (!svgEl) return new Map();
  const byMeasureId = new Map<string, { x: number; y: number; width: number; height: number }>();
  const graphicalMeasures = collectGraphicalMeasures(osmd);
  const visualMeasureIds = buildVisualMeasureIdentityMap(graphicalMeasures, svgEl, container, coreDocument);

  for (const graphicalMeasure of graphicalMeasures) {
    const measureNumber = graphicalMeasureNumber(graphicalMeasure);
    if (measureNumber == null) continue;
    const staffIndex = graphicalMeasureStaffIndex(graphicalMeasure);
    const measureId = visualMeasureIds.get(graphicalMeasure)
      ?? measureIdentityFor(
        coreDocument,
        measureNumber,
        staffIndex,
        graphicalMeasurePartId(graphicalMeasure),
      ).measureId;
    if (!measureId) continue;

    const domRect = extractMeasureDomRect(graphicalMeasure, svgEl, container);
    if (!domRect) continue;

    const existing = byMeasureId.get(measureId);
    byMeasureId.set(measureId, existing ? unionRects(existing, domRect) : domRect);
  }

  return byMeasureId;
}

function buildVirtualOverlaysForEmptyBars(
  osmd: any,
  container: HTMLElement,
  coreDocument: ScoreDocumentModel | null | undefined,
  existingOverlays: RenderedMeasureLayoutOverlay[],
): RenderedMeasureLayoutOverlay[] {
  const svgEl = resolveSvg(container);
  if (!svgEl) return [];
  // Disambiguate by measureId — two parallel parts can share measureNumber
  // but will always have distinct measureIds in the core document.
  const coveredIds = new Set(existingOverlays.map((o) => o.measureId));
  const byMeasureId = new Map<string, RenderedMeasureLayoutOverlay>();
  const graphicalMeasures = collectGraphicalMeasures(osmd);
  const visualMeasureIds = buildVisualMeasureIdentityMap(graphicalMeasures, svgEl, container, coreDocument);

  for (const graphicalMeasure of graphicalMeasures) {
    const measureNumber = graphicalMeasureNumber(graphicalMeasure);
    if (measureNumber == null) continue;
    const staffIndex = graphicalMeasureStaffIndex(graphicalMeasure);
    const measureId = visualMeasureIds.get(graphicalMeasure)
      ?? measureIdentityFor(
        coreDocument,
        measureNumber,
        staffIndex,
        graphicalMeasurePartId(graphicalMeasure),
      ).measureId;
    if (!measureId || coveredIds.has(measureId)) continue;

    const domRect = extractMeasureDomRect(graphicalMeasure, svgEl, container);
    if (!domRect) continue;

    // Same measureId across two graphical measures (e.g. grand-staff piano
    // where one logical measure spans two staves) must union, not duplicate.
    const existing = byMeasureId.get(measureId);
    if (existing) {
      existing.domRect = unionRects(existing.domRect, domRect);
      continue;
    }

    byMeasureId.set(measureId, {
      measureId,
      measureNumber,
      systemIndex: 0,
      pageIndex: 0,
      widthWeight: 0,
      domRect,
      breakBefore: false,
      pageBreakBefore: false,
      staffSpacing: null,
    });
  }

  return [...byMeasureId.values()];
}

function timestampDivisions(event: TimedEvent, divisions: number): number {
  const ratio = event.timestampNum / Math.max(event.timestampDen, 1);
  return ratio * 4 * divisions;
}

function fractionAdd(a: Fraction, b: Fraction): Fraction {
  const den = a.den * b.den;
  return { num: a.num * b.den + b.num * a.den, den };
}

function fractionMin(a: Fraction, b: Fraction): Fraction {
  return a.num * b.den <= b.num * a.den ? a : b;
}

function fractionMax(a: Fraction, b: Fraction): Fraction {
  return a.num * b.den >= b.num * a.den ? a : b;
}

function fractionDurationFromDivisions(
  durationDivisions: number,
  divisions: number,
): Fraction {
  const d = Math.max(divisions, 1);
  return { num: durationDivisions, den: 4 * d };
}

function resolveEvent(
  coreDocument: ScoreDocumentModel,
  eventId: string,
): { event: TimedEvent; divisions: number; measureId: string } | null {
  for (const part of coreDocument.score.parts) {
    for (const staff of part.staves) {
      for (const measure of staff.measures) {
        const attr = [...measure.attributes].reverse().find((entry) => typeof entry.divisions === 'number');
        const divisions = attr?.divisions ?? 1;
        for (const voice of measure.voices) {
          const found = voice.events.find((e) => e.id === eventId);
          if (found) return { event: found, divisions, measureId: measure.id };
        }
      }
    }
  }
  return null;
}

function buildActiveTupletsByMeasureId(
  coreDocument: ScoreDocumentModel | null | undefined,
): Map<string, ActiveTupletMeta[]> {
  const byMeasureId = new Map<string, ActiveTupletMeta[]>();
  if (!coreDocument?.tuplets?.length) return byMeasureId;

  for (const tuplet of coreDocument.tuplets as TupletSpan[]) {
    if (!tuplet.eventIds?.length) continue;
    const resolved = tuplet.eventIds
      .map((id) => resolveEvent(coreDocument, id))
      .filter((entry): entry is { event: TimedEvent; divisions: number; measureId: string } => entry != null);
    if (resolved.length === 0) continue;

    const perMeasure = new Map<string, { event: TimedEvent; divisions: number; measureId: string }[]>();
    for (const entry of resolved) {
      const arr = perMeasure.get(entry.measureId) ?? [];
      arr.push(entry);
      perMeasure.set(entry.measureId, arr);
    }

    const actualNotes = tuplet.actualNotes ?? 3;
    const normalNotes = tuplet.normalNotes ?? 2;
    const ratio = normalNotes / Math.max(actualNotes, 1);

    for (const [measureId, entries] of perMeasure.entries()) {
      let start: Fraction | null = null;
      let end: Fraction | null = null;
      const first = entries[0].event;

      for (const { event, divisions } of entries) {
        const ts: Fraction = { num: event.timestampNum, den: event.timestampDen };
        const dur = fractionDurationFromDivisions(event.durationDivisions, divisions);
        const evEnd = fractionAdd(ts, dur);
        start = start ? fractionMin(start, ts) : ts;
        end = end ? fractionMax(end, evEnd) : evEnd;
      }
      if (!start || !end) continue;

      const meta: ActiveTupletMeta = {
        tupletId: tuplet.id,
        number: tuplet.number,
        actualNotes,
        normalNotes,
        ratio,
        start,
        end,
        staffIndex: first.staffIndex,
        voiceId: first.voiceId,
        eventIds: entries.map((e) => e.event.id),
      };
      const list = byMeasureId.get(measureId) ?? [];
      list.push(meta);
      byMeasureId.set(measureId, list);
    }
  }
  return byMeasureId;
}

function measureTimingForOverlay(
  coreDocument: ScoreDocumentModel | null | undefined,
  overlay: Pick<RenderedMeasureLayoutOverlay, 'measureId' | 'measureNumber'>,
) {
  return getEffectiveMeasureTiming(coreDocument, {
    measureId: overlay.measureId,
    measureNumber: overlay.measureNumber,
  });
}

function fractionLessOrEqual(a: Fraction, b: Fraction): boolean {
  return a.num * b.den <= b.num * a.den;
}

function fractionInRange(x: Fraction, start: Fraction, end: Fraction): boolean {
  return fractionLessOrEqual(start, x) && fractionLessOrEqual(x, end);
}

/**
 * Additive "augmented layout" over the existing measure-overlay system.
 * Never mutates OSMD or core state; safe to rebuild on every render.
 */
export class GeometryProxy {
  private augmented: AugmentedMeasureLayout[] = [];
  private renderedGhostGrid: RenderedGhostGrid | null = null;
  private valid = false;

  update(input: GeometryProxyUpdateInput): void {
    const { osmd, container, coreDocument, measureOverlays, renderedGhostGrid } = input;
    if (!osmd || !container) {
      this.augmented = [];
      this.renderedGhostGrid = null;
      this.valid = false;
      return;
    }

    const staffDetailsByMeasure = buildStaffDetailsByMeasure(osmd, container);
    const tupletsByMeasureId = buildActiveTupletsByMeasureId(coreDocument);
    const graphicalMeasureRectsById = buildGraphicalMeasureRectsById(osmd, container, coreDocument);
    const virtualOverlays = buildVirtualOverlaysForEmptyBars(
      osmd,
      container,
      coreDocument,
      measureOverlays,
    );

    const realAugmented = measureOverlays.map<AugmentedMeasureLayout>((overlay) => {
      const timing = measureTimingForOverlay(coreDocument, overlay);
      const graphicalRect = graphicalMeasureRectsById.get(overlay.measureId) ?? null;
      return {
        ...overlay,
        domRect: mergeHorizontalBounds(overlay.domRect, graphicalRect),
        staffDetails: staffDetailsForOverlay(staffDetailsByMeasure, coreDocument, overlay),
        activeTuplets: tupletsByMeasureId.get(overlay.measureId) ?? [],
        timeSignature: timing?.timeSignature ?? null,
        measureDurationRatio: timing?.durationRatio ?? 0,
        isVirtual: false,
      };
    });

    const virtualAugmented = virtualOverlays.map<AugmentedMeasureLayout>((overlay) => {
      const timing = measureTimingForOverlay(coreDocument, overlay);
      return {
        ...overlay,
        staffDetails: staffDetailsForOverlay(staffDetailsByMeasure, coreDocument, overlay),
        activeTuplets: tupletsByMeasureId.get(overlay.measureId) ?? [],
        timeSignature: timing?.timeSignature ?? null,
        measureDurationRatio: timing?.durationRatio ?? 0,
        isVirtual: true,
      };
    });

    this.augmented = [...realAugmented, ...virtualAugmented];
    this.renderedGhostGrid = renderedGhostGrid ?? null;
    this.valid = true;
  }

  invalidate(): void {
    this.augmented = [];
    this.renderedGhostGrid = null;
    this.valid = false;
  }

  isValid(): boolean {
    return this.valid;
  }

  getAugmentedMeasures(): readonly AugmentedMeasureLayout[] {
    return this.augmented;
  }

  findMeasureAtPoint(domPoint: PointLike): AugmentedMeasureLayout | null {
    let best: { measure: AugmentedMeasureLayout; score: number } | null = null;
    for (const measure of this.augmented) {
      const r = measure.domRect;
      if (pointInsideMeasureInteractiveBounds(measure, domPoint)) {
        const staffDistance = measure.staffDetails.length > 0
          ? measure.staffDetails.reduce((minDistance, staff) => {
            const mid = (staff.topLineDomY + staff.bottomLineDomY) / 2;
            return Math.min(minDistance, Math.abs(mid - domPoint.y));
          }, Number.POSITIVE_INFINITY)
          : Number.POSITIVE_INFINITY;
        const score = (Number.isFinite(staffDistance) ? staffDistance : 1_000_000)
          + ((r.width * r.height) / 1_000_000);
        if (!best || score < best.score) {
          best = { measure, score };
        }
      }
    }
    return best?.measure ?? null;
  }

  /**
   * Returns the musical context for a DOM point without calling back into OSMD.
   * `staff` and `staffStep` are null when staff-line extraction did not succeed
   * for the measure — callers must tolerate that and fall back to the legacy
   * hit-test path.
   */
  getDetailedContext(domPoint: PointLike, options?: DetailedContextOptions): DetailedContext | null {
    const measure = this.findMeasureAtPoint(domPoint);
    if (!measure) return null;

    const width = Math.max(measure.domRect.width, 1);
    const height = Math.max(measure.domRect.height, 1);
    const relX = Math.max(0, Math.min(1, (domPoint.x - measure.domRect.x) / width));
    const relY = Math.max(0, Math.min(1, (domPoint.y - measure.domRect.y) / height));

    const staff = pickNearestStaff(
      measure.staffDetails,
      domPoint.y,
      options?.preferredStaffIndex ?? null,
      options?.hysteresisPx ?? 0,
    );
    const staffStep = staff ? computeStaffStep(staff, domPoint.y) : null;

    const snapPoint = findNearestRenderedGhostPoint(this.renderedGhostGrid, {
      measureId: measure.measureId,
      pointerX: domPoint.x,
      staffIndex: staff?.staffIndex ?? options?.preferredStaffIndex ?? null,
      allowMeasureFallback: staff == null,
    });
    const musicalTime: Fraction = snapPoint
      ? { num: snapPoint.timestampNum, den: snapPoint.timestampDen }
      : measure.measureDurationRatio > 0
        ? fractionFromRatio(relX * measure.measureDurationRatio)
        : { num: 0, den: 1 };

    const activeTuplet = measure.activeTuplets.find((t) => (
      (!staff || t.staffIndex === staff.staffIndex)
      && fractionInRange(musicalTime, t.start, t.end)
    )) ?? null;

    return {
      measure,
      staff,
      relX,
      relY,
      staffStep,
      musicalTime,
      snapPoint,
      activeTuplet,
    };
  }
}

function pickNearestStaff(
  details: StaffDetail[],
  domY: number,
  preferredStaffIndex: number | null,
  hysteresisPx: number,
): StaffDetail | null {
  if (details.length === 0) return null;
  const containing = details
    .filter((detail) => {
      const pad = Math.max(detail.lineDistanceDom / 2, 4);
      return domY >= detail.topLineDomY - pad && domY <= detail.bottomLineDomY + pad;
    })
    .sort((left, right) => {
      const leftMid = (left.topLineDomY + left.bottomLineDomY) / 2;
      const rightMid = (right.topLineDomY + right.bottomLineDomY) / 2;
      return Math.abs(leftMid - domY) - Math.abs(rightMid - domY);
    })[0] ?? null;
  if (containing) return containing;

  let best = details[0];
  let bestDistance = Number.POSITIVE_INFINITY;
  for (const detail of details) {
    const mid = (detail.topLineDomY + detail.bottomLineDomY) / 2;
    const distance = Math.abs(domY - mid);
    if (distance < bestDistance) {
      bestDistance = distance;
      best = detail;
    }
  }

  if (preferredStaffIndex == null) return best;
  const preferred = details
    .filter((detail) => detail.staffIndex === preferredStaffIndex)
    .sort((left, right) => {
      const leftMid = (left.topLineDomY + left.bottomLineDomY) / 2;
      const rightMid = (right.topLineDomY + right.bottomLineDomY) / 2;
      return Math.abs(domY - leftMid) - Math.abs(domY - rightMid);
    })[0] ?? null;
  if (!preferred) return best;
  const preferredMid = (preferred.topLineDomY + preferred.bottomLineDomY) / 2;
  const preferredDistance = Math.abs(domY - preferredMid);
  return bestDistance < preferredDistance - Math.max(hysteresisPx, 0) ? best : preferred;
}

/**
 * Half-step count from the top line of the staff, measured in staff-step
 * units (one step = half a line distance). Positive values go down the staff.
 */
function computeStaffStep(staff: StaffDetail, domY: number): number {
  const halfStep = staff.lineDistanceDom / 2;
  if (halfStep <= 0) return 0;
  return Math.round((domY - staff.topLineDomY) / halfStep);
}

function fractionFromRatio(value: number): Fraction {
  if (!Number.isFinite(value) || value <= 0) return { num: 0, den: 1 };
  const den = 480;
  return { num: Math.round(value * den), den };
}
