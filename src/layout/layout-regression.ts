import { buildLayoutPlan } from '@/src/layout/build-layout-plan';
import { buildLayoutSnapshot } from '@/src/layout/build-layout-snapshot';
import {
  buildOsmdLayoutBridge,
  buildRenderedMeasureLayoutOverlays,
  buildRenderedSystemLayoutOverlays,
} from '@/src/render-bridge/osmd/layout-plan-bridge';
import type { ScoreDocumentModel } from '@/src/score-core/model/types';
import type { RenderedNote } from '@/src/render-bridge/osmd/note-selection';

export interface LayoutRegressionFingerprint {
  revision: number;
  pages: number;
  systems: Array<{
    systemIndex: number;
    pageIndex: number;
    measures: number[];
    spacingUnits: number;
    idealWidth: number;
    minimumWidth: number;
    defaultStaffSpacing: number;
    collisionMode: 'balanced' | 'relaxed' | 'open';
  }>;
  measures: Array<{
    measureNumber: number;
    staffIndex: number;
    idealWidth: number;
    minimumWidth: number;
    spacingUnits: number;
    lyricLineCount: number;
    slurCount: number;
    tupletCount: number;
    breakBefore: boolean;
    pageBreakBefore: boolean;
    widthWeight: number;
    staffSpacing: number | null;
  }>;
}

export interface LayoutOverlayRegressionFingerprint {
  revision: number;
  layoutSystems: number;
  layoutPages: number;
  measureOverlays: Array<{
    measureNumber: number;
    systemIndex: number;
    pageIndex: number;
    widthWeight: number;
    breakBefore: boolean;
    pageBreakBefore: boolean;
    rect: { x: number; y: number; width: number; height: number };
  }>;
  systemOverlays: Array<{
    systemIndex: number;
    pageIndex: number;
    measureNumbers: number[];
    defaultStaffSpacing: number;
    collisionMode: 'balanced' | 'relaxed' | 'open';
    spacingGuideHeight: number;
    rect: { x: number; y: number; width: number; height: number };
  }>;
}

function buildSyntheticRenderedNotes(document: ScoreDocumentModel): RenderedNote[] {
  const bridge = buildOsmdLayoutBridge(document);
  const measureById = new Map(bridge.measures.map((measure) => [measure.measureId, measure] as const));
  const xBySystem = new Map<number, number>();

  return bridge.snapshot.measures.map((measure, index) => {
    const bridgeMeasure = measureById.get(measure.measureId);
    const systemIndex = bridgeMeasure?.systemIndex ?? 0;
    const currentX = xBySystem.get(systemIndex) ?? 20;
    const width = Math.max(24, Math.round((bridgeMeasure?.idealWidth ?? 80) / 3));
    const y = 18 + systemIndex * 150 + (measure.staffIndex - 1) * 54;
    xBySystem.set(systemIndex, currentX + width + 18);

    return {
      id: `layout-regression:${index}:${measure.measureId}`,
      coreEntityId: measure.eventIds[0] ?? measure.measureId,
      note: {
        measureNumber: measure.measureNumber,
        staffIndex: measure.staffIndex,
        voiceId: 1,
        timestampNum: 0,
        timestampDen: 1,
        step: 'C',
        octave: 4,
        alter: 0,
        isRest: false,
        graphicalNote: null,
        coreMeasureId: measure.measureId,
      },
      svgCenter: { x: 0, y: 0 },
      domCenter: { x: currentX + width / 2, y: y + 14 },
      domRect: { x: currentX, y, width, height: 28 },
      svgElement: null,
      tintElement: null,
    };
  });
}

export function buildLayoutRegressionFingerprint(document: ScoreDocumentModel): LayoutRegressionFingerprint {
  const snapshot = buildLayoutSnapshot(document);
  const plan = buildLayoutPlan(document, snapshot);
  const bridge = buildOsmdLayoutBridge(document);

  return {
    revision: document.revision,
    pages: plan.pages.length,
    systems: plan.systems.map((system) => ({
      systemIndex: system.systemIndex,
      pageIndex: system.pageIndex,
        measures: [...system.measureNumbers],
        spacingUnits: system.spacingUnits,
        idealWidth: system.idealWidth,
        minimumWidth: system.minimumWidth,
        defaultStaffSpacing: system.defaultStaffSpacing,
        collisionMode: system.collisionMode,
      })),
    measures: bridge.measures.map((measure) => {
      const snapshotMeasure = snapshot.measures.find((entry) => entry.measureId === measure.measureId);
      return {
        measureNumber: measure.measureNumber,
        staffIndex: snapshotMeasure?.staffIndex ?? 1,
        idealWidth: measure.idealWidth,
        minimumWidth: measure.minimumWidth,
        spacingUnits: measure.spacingUnits,
        lyricLineCount: snapshotMeasure?.lyricLineCount ?? 0,
        slurCount: snapshotMeasure?.slurCount ?? 0,
        tupletCount: snapshotMeasure?.tupletCount ?? 0,
        breakBefore: measure.breakBefore,
        pageBreakBefore: measure.pageBreakBefore,
        widthWeight: Number(measure.widthWeight.toFixed(3)),
        staffSpacing: measure.staffSpacing,
      };
    }),
  };
}

export function buildLayoutOverlayRegressionFingerprint(document: ScoreDocumentModel): LayoutOverlayRegressionFingerprint {
  const bridge = buildOsmdLayoutBridge(document);
  const renderedNotes = buildSyntheticRenderedNotes(document);
  const measureOverlays = buildRenderedMeasureLayoutOverlays(renderedNotes, bridge);
  const systemOverlays = buildRenderedSystemLayoutOverlays(measureOverlays, bridge);

  return {
    revision: document.revision,
    layoutSystems: bridge.systems.length,
    layoutPages: bridge.plan.pages.length,
    measureOverlays: measureOverlays.map((overlay) => ({
      measureNumber: overlay.measureNumber,
      systemIndex: overlay.systemIndex,
      pageIndex: overlay.pageIndex,
      widthWeight: Number(overlay.widthWeight.toFixed(3)),
      breakBefore: overlay.breakBefore,
      pageBreakBefore: overlay.pageBreakBefore,
      rect: {
        x: overlay.domRect.x,
        y: overlay.domRect.y,
        width: overlay.domRect.width,
        height: overlay.domRect.height,
      },
    })),
    systemOverlays: systemOverlays.map((overlay) => ({
      systemIndex: overlay.systemIndex,
      pageIndex: overlay.pageIndex,
      measureNumbers: [...overlay.measureNumbers],
      defaultStaffSpacing: overlay.defaultStaffSpacing,
      collisionMode: overlay.collisionMode,
      spacingGuideHeight: overlay.spacingGuideHeight,
      rect: {
        x: overlay.domRect.x,
        y: overlay.domRect.y,
        width: overlay.domRect.width,
        height: overlay.domRect.height,
      },
    })),
  };
}
