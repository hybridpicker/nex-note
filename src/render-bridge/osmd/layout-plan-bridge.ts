import {
  buildLayoutPlan,
  type LayoutPlan,
  type LayoutPlanOptions,
  type MeasureLayoutPlan,
  type SystemLayoutPlan,
} from '@/src/layout/build-layout-plan';
import { buildLayoutSnapshot, type LayoutSnapshot } from '@/src/layout/build-layout-snapshot';
import type { RectLike, RenderedNote } from '@/src/render-bridge/osmd/note-selection';
import type { ScoreDocumentModel } from '@/src/score-core/model/types';

export interface OsmdMeasureLayoutBridge {
  measureId: string;
  measureNumber: number;
  systemIndex: number;
  pageIndex: number;
  widthWeight: number;
  minimumWidth: number;
  idealWidth: number;
  spacingUnits: number;
  anchorCollisionDemand: number;
  staffSpacing: number | null;
  breakBefore: boolean;
  pageBreakBefore: boolean;
}

export interface OsmdSystemLayoutBridge {
  systemIndex: number;
  pageIndex: number;
  measureNumbers: number[];
  totalWidthWeight: number;
  defaultStaffSpacing: number;
  collisionPressure: number;
  collisionMode: 'balanced' | 'relaxed' | 'open';
  explicitBreakBefore: boolean;
}

export interface OsmdLayoutBridge {
  revision: number;
  snapshot: LayoutSnapshot;
  plan: LayoutPlan;
  measures: OsmdMeasureLayoutBridge[];
  systems: OsmdSystemLayoutBridge[];
}

export interface RenderedMeasureLayoutOverlay {
  measureId: string;
  measureNumber: number;
  systemIndex: number;
  pageIndex: number;
  widthWeight: number;
  domRect: RectLike;
  breakBefore: boolean;
  pageBreakBefore: boolean;
  staffSpacing: number | null;
  staffDetails?: Array<{
    staffIndex: number;
    corePartId?: string | null;
    musicSheetStaffId?: number | null;
    topLineDomY: number;
    bottomLineDomY: number;
    lineDistanceDom: number;
    lineCount: number;
  }>;
}

export interface RenderedSystemLayoutOverlay {
  systemIndex: number;
  pageIndex: number;
  measureNumbers: number[];
  domRect: RectLike;
  totalWidthWeight: number;
  defaultStaffSpacing: number;
  collisionPressure: number;
  collisionMode: 'balanced' | 'relaxed' | 'open';
  explicitBreakBefore: boolean;
  spacingGuideHeight: number;
}

function buildMeasureBridge(
  measure: MeasureLayoutPlan,
  systems: SystemLayoutPlan[],
): OsmdMeasureLayoutBridge {
  const system = systems.find((entry) => entry.systemIndex === measure.systemIndex);
  const widthWeight = system && system.idealWidth > 0 ? measure.idealWidth / system.idealWidth : 1;
  const isFirstMeasureInSystem = system?.measureNumbers[0] === measure.measureNumber;
  const page = system ? systems.filter((entry) => entry.pageIndex === system.pageIndex).sort((a, b) => a.systemIndex - b.systemIndex) : [];
  const isFirstSystemOnPage = system != null && page[0]?.systemIndex === system.systemIndex;
  const breakBefore = Boolean(isFirstMeasureInSystem && measure.systemIndex > 0);
  const pageBreakBefore = Boolean(isFirstMeasureInSystem && isFirstSystemOnPage && measure.pageIndex > 0);

  return {
    measureId: measure.measureId,
    measureNumber: measure.measureNumber,
    systemIndex: measure.systemIndex,
    pageIndex: measure.pageIndex,
    widthWeight,
    minimumWidth: measure.minimumWidth,
    idealWidth: measure.idealWidth,
    spacingUnits: measure.spacingUnits,
    anchorCollisionDemand: measure.anchorCollisionDemand,
    staffSpacing: measure.staffSpacing,
    breakBefore,
    pageBreakBefore,
  };
}

export function buildOsmdLayoutBridge(document: ScoreDocumentModel, options?: LayoutPlanOptions): OsmdLayoutBridge {
  const snapshot = buildLayoutSnapshot(document);
  const plan = buildLayoutPlan(document, snapshot, options);
  const measures = plan.measures.map((measure) => buildMeasureBridge(measure, plan.systems));
  const systems = plan.systems.map((system) => ({
    systemIndex: system.systemIndex,
    pageIndex: system.pageIndex,
    measureNumbers: [...system.measureNumbers],
    totalWidthWeight: measures
      .filter((measure) => measure.systemIndex === system.systemIndex)
      .reduce((sum, measure) => sum + measure.widthWeight, 0),
    defaultStaffSpacing: system.defaultStaffSpacing,
    collisionPressure: system.collisionPressure,
    collisionMode: system.collisionMode,
    explicitBreakBefore: system.explicitBreakBefore,
  }));

  return {
    revision: document.revision,
    snapshot,
    plan,
    measures,
    systems,
  };
}

function unionRects(rects: RectLike[]): RectLike | null {
  if (rects.length === 0) return null;
  const left = Math.min(...rects.map((rect) => rect.x));
  const top = Math.min(...rects.map((rect) => rect.y));
  const right = Math.max(...rects.map((rect) => rect.x + rect.width));
  const bottom = Math.max(...rects.map((rect) => rect.y + rect.height));
  return {
    x: left,
    y: top,
    width: right - left,
    height: bottom - top,
  };
}

export function buildRenderedMeasureLayoutOverlays(
  renderedNotes: RenderedNote[],
  layoutBridge: OsmdLayoutBridge | null | undefined,
): RenderedMeasureLayoutOverlay[] {
  if (!layoutBridge) return [];

  return layoutBridge.measures.flatMap((measure) => {
    const rects = renderedNotes
      .filter((note) => note.note.coreMeasureId === measure.measureId)
      .map((note) => note.domRect);
    const domRect = unionRects(rects);
    if (!domRect) return [];

    return [{
      measureId: measure.measureId,
      measureNumber: measure.measureNumber,
      systemIndex: measure.systemIndex,
      pageIndex: measure.pageIndex,
      widthWeight: measure.widthWeight,
      domRect,
      breakBefore: measure.breakBefore,
      pageBreakBefore: measure.pageBreakBefore,
      staffSpacing: measure.staffSpacing,
    }];
  }).sort((a, b) => a.pageIndex - b.pageIndex || a.systemIndex - b.systemIndex || a.measureNumber - b.measureNumber);
}

export function buildRenderedSystemLayoutOverlays(
  measureOverlays: RenderedMeasureLayoutOverlay[],
  layoutBridge: OsmdLayoutBridge | null | undefined,
): RenderedSystemLayoutOverlay[] {
  if (!layoutBridge) return [];

  return layoutBridge.systems.flatMap((system) => {
    const measures = measureOverlays.filter((measure) => measure.systemIndex === system.systemIndex);
    const domRect = unionRects(measures.map((measure) => measure.domRect));
    if (!domRect) return [];

    const spacingMultiplier = system.collisionMode === 'open'
      ? 0.42
      : system.collisionMode === 'relaxed'
        ? 0.36
        : 0.3;
    const spacingGuideHeight = Math.max(8, Math.round(system.defaultStaffSpacing * spacingMultiplier));

    return [{
      systemIndex: system.systemIndex,
      pageIndex: system.pageIndex,
      measureNumbers: [...system.measureNumbers],
      domRect,
      totalWidthWeight: system.totalWidthWeight,
      defaultStaffSpacing: system.defaultStaffSpacing,
      collisionPressure: system.collisionPressure,
      collisionMode: system.collisionMode,
      explicitBreakBefore: system.explicitBreakBefore,
      spacingGuideHeight,
    }];
  }).sort((a, b) => a.pageIndex - b.pageIndex || a.systemIndex - b.systemIndex);
}
