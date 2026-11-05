'use client';

import { storedVoiceFor } from '@/src/score-input/voice-mapping';

import { applyNotationFont } from '@/lib/notation-font';
import { nestedTupletRenderXml, drawNestedTupletBrackets, hasNestedTuplets } from '@/src/render-bridge/osmd/nested-tuplets';

import { inputMetricsEnabled, recordInputMetric, markInputStart, markInputFeedback } from '@/src/score-input/input-metrics';
import { useEffect, useRef, useCallback, useState, useMemo } from 'react';
import type { NoteDuration, NoteEntryMode, SelectedNote } from '@/hooks/useNoteEditor';
import type { PlaybackCursorTarget, PlaybackPlayheadSnapshot, PlaybackState } from '@/hooks/usePlayback';
import { getBugReportContext, getBugReportEvents, recordBugReportEvent } from '@/lib/bug-report-recorder';
import { dbg } from '@/lib/debug';
import { readClientVisualDebugEnabled } from '@/lib/debug-flags';
import { resolveMusicXmlMetadataDrawOptions } from '@/lib/musicxml-metadata-display';
import { resolveReachedPlaybackOnset } from '@/lib/playback-highlight';
import { formatShortcutHint } from '@/lib/shortcut-hints';
import { projectOsmdLayoutXml } from '@/src/render-bridge/osmd/layout-render-xml';
import { installOsmdGlyphBoundsCache } from '@/src/render-bridge/osmd/glyph-bounds-cache';
import {
  collectRenderedNotes as bridgeCollectRenderedNotes,
  eventToSvgPoint as bridgeEventToSvgPoint,
  findNearestRenderedNote as bridgeFindNearestRenderedNote,
  normalizeSelectedNote as bridgeNormalizeSelectedNote,
  resolveSemanticMeasureClickTarget as bridgeResolveSemanticMeasureClickTarget,
  selectedNoteEquals as bridgeSelectedNoteEquals,
} from '@/src/render-bridge/osmd/note-selection';
import {
  buildOsmdLayoutBridge,
  buildRenderedMeasureLayoutOverlays,
  buildRenderedSystemLayoutOverlays,
  type RenderedMeasureLayoutOverlay,
  type RenderedSystemLayoutOverlay,
} from '@/src/render-bridge/osmd/layout-plan-bridge';
import {
  buildRenderedGhostGrid,
  createEmptyRenderedGhostGrid,
  getRenderedGhostStaffPoints,
  type RenderedGhostGrid,
  type RenderedGhostGridPoint,
} from '@/src/render-bridge/osmd/rendered-ghost-grid';
import {
  GeometryProxy,
  buildStaffDetailsByMeasure,
  buildGraphicalMeasureRectsById,
  staffIndexForMeasureId,
  unionRects,
  type AugmentedMeasureLayout,
  type DetailedContext,
  type StaffDetail,
} from '@/src/score-core/GeometryProxy';
import { getEffectiveMeasureTiming } from '@/src/score-core/measure-timing';
import type { ScoreDocumentModel, TimedEvent } from '@/src/score-core/model/types';
import type { DocumentDiagnostic } from '@/src/score-core/commands/apply-document-commands';
import type { ScoreViewMode } from '@/src/score-session/types';
import { buildInteractiveEditMap, createEmptyInteractiveEditMap } from '@/src/score-input/edit-map';
import { inspectResolvedEditTarget } from '@/src/score-input/note-entry-validator';
import { resolvePointerEditTarget } from '@/src/score-input/pointer-resolver';
import {
  resolveMuseScorePointerEntryMode,
  shouldCommitPointerGhostOverDirectNote,
  shouldTreatPointerAsExplicitVisibleGhost,
  type PointerEntryLocator,
} from '@/src/score-input/pointer-entry-mode';
import {
  applyGhostPlacementModifiers,
  buildLedgerLineSegments,
  clampPointerToMeasureInterior,
  resolveGhostPlacementIntent,
  type GhostPlacementMode,
} from '@/src/score-input/smart-ghost-note';
import { fretForMidiOnString, resolveGuitarTuning } from '@/src/score-input/guitar-fretboard';
import { resolveDragTransposePitch, type DragTransposeMode } from '@/src/score-input/transpose-logic';
import { captureZoomAnchor, resolveAnchoredScroll, type ZoomAnchor } from '@/src/score-input/zoom-anchor';
import type { ResolvedEditTarget } from '@/src/score-input/types';
import {
  resolveClefAtMeasure,
  resolveStaffStepPitch,
  resolveMeasureAccidentalAlter,
  topLineDiatonicIndex,
  type Clef,
} from '@/src/score-input/staff-pitch';
import {
  bindTabletEntryPreview,
  cancelTabletEntrySession,
  commitTabletEntrySession,
  refineTabletEntrySession,
  markTabletPitchAuditioned,
  shouldAuditionTabletPitch,
  startTabletEntrySession,
  tabletEntryStaffId,
  type TabletEntryPhase,
  type TabletEntrySession,
  type TabletEntryStaffGeometry,
} from '@/src/score-input/tablet-entry-session';
import {
  detectActiveRhythmicSegment,
  fractionToNumber,
  getEffectiveDuration,
  normalizeFraction,
  noteTimestampValue,
  type RhythmicSegment,
} from '@/src/score-core/rhythm-utils';
import { timestampsEqual } from '@/src/shared/music/timestamp-match';
import {
  buildSemanticGridCodexReport,
  buildSemanticGridCodexPrompt,
  semanticGridCodexPromptSignature,
} from '@/src/debug/semantic-grid/codex-handoff';
import { ScoreInputOverlay } from '@/components/ScoreInputOverlay';

interface FindResult {
  mode: 'measure' | 'page' | 'rehearsal';
  value: string;
  measureNumber: number;
}

const INPUT_DURATION_TO_TYPE: Record<string, string> = {
  '1': 'whole',
  '2': 'half',
  '4': 'quarter',
  '8': 'eighth',
  '16': '16th',
  '32': '32nd',
  '64': '64th',
  breve: 'breve',
  long: 'long',
};

const DURATION_TYPE_TO_INPUT: Record<string, NoteDuration> = Object.fromEntries(
  Object.entries(INPUT_DURATION_TO_TYPE).map(([input, durationType]) => [durationType, input]),
) as Record<string, NoteDuration>;

const RENDER_LAYOUT_OPTIONS = {
  systemIdealWidth: 640,
  pageIdealWidth: 1920,
  maxSystemsPerPage: 4,
};

const MOUSE_ENTRY_TOP_LEDGER_STEPS = 8;
const MOUSE_ENTRY_BOTTOM_LEDGER_STEPS = 8;

function mouseEntryTopStaffStep() {
  return -MOUSE_ENTRY_TOP_LEDGER_STEPS;
}

function mouseEntryBottomStaffStep(lineCount: number) {
  return ((Math.max(lineCount, 1) - 1) * 2) + MOUSE_ENTRY_BOTTOM_LEDGER_STEPS;
}

interface Props {
  xml: string;
  coreDocument: ScoreDocumentModel | null;
  diagnostics?: DocumentDiagnostic[];
  editorError?: string | null;
  noteInputAnchor: SelectedNote | null;
  selectedNote: SelectedNote | null;
  selectedNotes: SelectedNote[];
  noteInputMode: boolean;
  pencilOnlyInput?: boolean;
  inputByDurationMode?: boolean;
  preparedDurationActivePitch?: { step: string; octave: number; alter: number } | null;
  selectedDuration: NoteDuration;
  selectedAccidental: 'double-sharp' | 'sharp' | 'flat' | 'double-flat' | 'natural' | null;
  isDotted: boolean;
  selectedVoice: number;
  entryMode?: NoteEntryMode;
  chordInputMode?: boolean;
  currentMeasure: number;
  playbackState: PlaybackState;
  playbackActive: boolean;
  playbackCursorTarget: PlaybackCursorTarget | null;
  playbackPlayhead: PlaybackPlayheadSnapshot | null;
  followPlayback?: boolean;
  onNoteClick: (note: SelectedNote | null, options?: {
    additive?: boolean;
    range?: boolean;
    selectionNotes?: SelectedNote[];
    singleSelectionOnly?: boolean;
    visualOnly?: boolean;
    visualText?: string | null;
    visualMeasureNumber?: number | null;
    visualStaffIndex?: number | null;
    visualPartId?: string | null;
  }) => void;
  onPlaceNoteAt: (target: ResolvedEditTarget, options?: { audition?: boolean }) => void;
  onSetChordSymbol?: (value: string, targetNote?: SelectedNote | null) => void;
  onSetGuitarFret?: (targetNote: SelectedNote, fret: number) => void;
  onPlaybackSeekRequest?: (target: PlaybackCursorTarget) => void;
  dragTransposeMode?: DragTransposeMode;
  onDragTransposeCommit?: (target: {
    note: SelectedNote;
    step: string;
    alter: number;
    octave: number;
    mode: DragTransposeMode;
  }) => void;
  onDragPitchPreview?: (note: SelectedNote | null) => void;
  onDirectEntryPitchPreview?: (note: SelectedNote) => void;
  onDragStringCommit?: (target: {
    note: SelectedNote;
    string: 1 | 2 | 3 | 4 | 5 | 6;
    fret: number;
  }) => void;
  onMeasureSelectionChange?: (selection: { measureIds: string[]; measureNumbers: number[] }) => void;
  clearMeasureSelectionSignal?: number;
  sessionViewMode?: ScoreViewMode;
  sessionZoomPercent?: number;
  onSessionViewModeChange?: (viewMode: ScoreViewMode) => void;
  onSessionZoomPercentChange?: (zoomPercent: number) => void;
  onRenderStart?: () => void;
  onRenderError?: (message: string) => void;
  semanticGridReady?: boolean;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  onOsmdReady: (osmd: any) => void;
}

interface PointLike {
  x: number;
  y: number;
}

interface RectLike {
  x: number;
  y: number;
  width: number;
  height: number;
}

interface GhostSnapTraceCandidate {
  id?: string;
  source?: string;
  x: number | null;
  y?: number | null;
  ratio?: number | null;
  timestamp?: string | null;
  voice?: number | null;
  synthetic?: boolean;
  isRest?: boolean;
  distanceFromPointer?: number | null;
  distanceFromGhost?: number | null;
}

interface GhostSnapResolutionTrace {
  resolver: string;
  reason?: string;
  measureId?: string | null;
  measureNumber?: number | null;
  staffIndex?: number | null;
  voiceId?: number | null;
  timestamp?: string | null;
  rawPointerX?: number | null;
  safePointerX?: number | null;
  pointerMeasureRatio?: number | null;
  fallbackQuantizedRatio?: number | null;
  quantizedRatio?: number | null;
  slotDuration?: number | null;
  segmentStartRatio?: number | null;
  maxStartRatio?: number | null;
  yResolution?: {
    rawY: number;
    topLineY: number;
    halfStepPx: number;
    rawStaffStep: number;
    stableStaffStep: number;
    clef: string;
    staffId: string;
    pitch: string;
    hysteresisHeld: boolean;
  };
  gridSnap?: GhostSnapTraceCandidate | null;
  renderedOnsetSnap?: GhostSnapTraceCandidate | null;
  preferredSnap?: GhostSnapTraceCandidate | null;
  effectiveSnap?: GhostSnapTraceCandidate | null;
  quantizedFallbackSnap?: GhostSnapTraceCandidate | null;
  nearestMatchingSnap?: GhostSnapTraceCandidate | null;
  resolvedMatchingSnap?: GhostSnapTraceCandidate | null;
  placementIntent?: {
    mode: GhostPlacementMode;
    targetVoiceId: number | null;
    anchor?: GhostSnapTraceCandidate | null;
  };
  committed?: {
    snappedX: number | null;
    timestamp: string | null;
    voiceId: number | null;
  };
  visible?: {
    domCenterX: number | null;
    previewLeft: number | null;
    noteheadCenterX: number | null;
    visibleNoteheadX: number | null;
    minimumVisibleX: number | null;
  };
  resolvedTarget?: {
    mode: string;
    measureNumber: number;
    staffIndex: number;
    voiceId: number;
    timestamp: string;
    domX: number | null;
    diagnostics: string[];
  } | null;
  deltas?: {
    pointerToGhost?: number | null;
    pointerToVisibleNotehead?: number | null;
    ghostToSnap?: number | null;
    visibleNoteheadToSnap?: number | null;
    commitToSnap?: number | null;
  };
}

interface RenderedNote {
  id: string;
  coreEntityId: string | null;
  note: SelectedNote;
  svgCenter: PointLike;
  domCenter: PointLike;
  domRect: RectLike;
  svgElement: SVGGElement | null;
  tintElement: SVGElement | null;
}

interface RenderedNoteDebugMarker {
  id: string;
  x: number;
  y: number;
  label: string;
  title: string;
  active: boolean;
  candidateRank?: number | null;
  candidateReason?: string | null;
  partId: string | null;
  coreEntityId: string | null;
  measureNumber: number;
  staffIndex: number;
  voiceId: number;
  timestamp: string;
}

interface SelectionConfidenceCandidate {
  rank: number;
  renderedId: string;
  score: number;
  reason: string;
  directPathHit: boolean;
  tintPathHit: boolean;
  glyphRectHit: boolean;
  bboxHit: boolean;
  distancePx: number;
  hitAreaSource: string;
  glyphBounds: RectLike | null;
  target: ReturnType<typeof selectedNoteDebugPayload>;
}

interface SelectionConfidenceReport {
  kind: string;
  domPoint: PointLike;
  visualText: string | null;
  selectedTarget: ReturnType<typeof selectedNoteDebugPayload>;
  selectedRenderedId: string | null;
  winnerReason: string | null;
  fallback: boolean;
  fallbackReason: string | null;
  candidates: SelectionConfidenceCandidate[];
}

interface GhostNoteTarget {
  measureId: string;
  corePartId: string | null;
  measureNumber: number;
  pageIndex?: number | null;
  systemIndex?: number | null;
  staffIndex: number;
  voiceId: number;
  timestampNum: number;
  timestampDen: number;
  step: string;
  octave: number;
  alter: number;
  domCenter: PointLike;
  domRect: RectLike;
  pointerX?: number;
  previewLeft: number;
  previewTop: number;
  previewWidth: number;
  previewHeight: number;
  accidentalOffsetX: number;
  noteheadCenterX: number;
  stemDirection: 'up' | 'down';
  placementMode: GhostPlacementMode;
  ledgerLines: Array<{ y: number; x1: number; x2: number }>;
  allowCrossVoiceRenderedSnap?: boolean;
  semanticAnchorRect?: RectLike;
  semanticAnchorIsRest?: boolean;
  semanticAnchorLabel?: string;
  isGraceTarget?: boolean;
  placementAnchorIsRest?: boolean;
  placementModePromotedByRecentCommit?: boolean;
  dragLockLine?: {
    x: number;
    top: number;
    height: number;
    isNearEscape: boolean;
  };
  dragPulse?: boolean;
  isTuplet?: boolean;
  tupletLabel?: string | null;
  transposeMode?: DragTransposeMode;
  tabFret?: number | null;
  tabString?: number | null;
  placementLockedByModifier?: boolean;
  cursorOnly?: boolean;
  reflowHints?: Array<{
    left: number;
    top: number;
    shiftX: number;
    width: number;
    height: number;
  }>;
  resolvedTarget?: ResolvedEditTarget;
  snapResolution?: GhostSnapResolutionTrace;
}

type ActiveTabletEntrySession = TabletEntrySession<GhostNoteTarget, ResolvedEditTarget>;

interface TabletEntryVisualState {
  phase: TabletEntryPhase;
  pointerType: string | null;
  point: PointLike | null;
}

interface PointerRefinementMetrics {
  rawTabletPointerEvents: number;
  scheduledAnimationFrames: number;
  processedLatestSamples: number;
  stableVisualPublications: number;
  semanticDocumentRegenerations: number;
  lastSampleLatencyMs: number;
  maxSampleLatencyMs: number;
}

function createPointerRefinementMetrics(): PointerRefinementMetrics {
  return {
    rawTabletPointerEvents: 0,
    scheduledAnimationFrames: 0,
    processedLatestSamples: 0,
    stableVisualPublications: 0,
    semanticDocumentRegenerations: 0,
    lastSampleLatencyMs: 0,
    maxSampleLatencyMs: 0,
  };
}

interface OverlayLayerOffset {
  x: number;
  y: number;
}

interface GhostOnsetAnchor {
  ratio: number;
  x: number;
  voiceId?: number;
  kind?: 'main' | 'grace';
  priority?: number;
  hitRadiusPx?: number;
  synthetic?: boolean;
  timestampNum?: number;
  timestampDen?: number;
  isRest?: boolean;
}

function roundTraceNumber(value: number | null | undefined) {
  return typeof value === 'number' && Number.isFinite(value)
    ? Math.round(value * 100) / 100
    : null;
}

function traceTimestamp(num: number | null | undefined, den: number | null | undefined) {
  if (typeof num !== 'number' || typeof den !== 'number' || !Number.isFinite(num) || !Number.isFinite(den)) {
    return null;
  }
  return `${num}/${den}`;
}

function getSvgBBox(element: SVGGraphicsElement): DOMRect | null {
  try {
    return element.getBBox();
  } catch {
    return null;
  }
}

function postProcessTabClefs(container: HTMLElement) {
  const svg = container.querySelector('svg');
  if (!(svg instanceof SVGSVGElement)) return;

  svg.querySelectorAll('[data-nex-tab-clef-label="true"]').forEach((label) => label.remove());
  svg.querySelectorAll<SVGGraphicsElement>('[data-nex-tab-clef-original="true"]').forEach((element) => {
    element.style.removeProperty('opacity');
    element.removeAttribute('data-nex-tab-clef-original');
  });

  const staffLineSegments = Array.from(svg.querySelectorAll<SVGGraphicsElement>('path, line'))
    .map((element) => {
      const box = getSvgBBox(element);
      if (!box || box.width < 80 || box.height > 2.5) return null;
      return {
        element,
        x: box.x,
        right: box.x + box.width,
        y: box.y + (box.height / 2),
        width: box.width,
      };
    })
    .filter((line): line is NonNullable<typeof line> => Boolean(line))
    .sort((a, b) => a.y - b.y);

  const staffLines: Array<{ x: number; right: number; y: number; width: number }> = [];
  staffLineSegments.forEach((segment) => {
    const existing = staffLines.find((line) => Math.abs(line.y - segment.y) <= 1.5);
    if (!existing) {
      staffLines.push({
        x: segment.x,
        right: segment.right,
        y: segment.y,
        width: segment.width,
      });
      return;
    }

    const left = Math.min(existing.x, segment.x);
    const right = Math.max(existing.right, segment.right);
    existing.x = left;
    existing.right = right;
    existing.y = ((existing.y * existing.width) + (segment.y * segment.width)) / (existing.width + segment.width);
    existing.width = right - left;
  });
  staffLines.sort((a, b) => a.y - b.y);

  const tabStaffs: Array<{ left: number; right: number; top: number; bottom: number; lineGap: number }> = [];
  for (let index = 0; index <= staffLines.length - 6; index += 1) {
    const group = staffLines.slice(index, index + 6);
    const gaps = group.slice(1).map((line, gapIndex) => line.y - group[gapIndex].y);
    const averageGap = gaps.reduce((sum, gap) => sum + gap, 0) / gaps.length;
    if (averageGap < 5 || averageGap > 36) continue;
    if (gaps.some((gap) => Math.abs(gap - averageGap) > Math.max(2, averageGap * 0.22))) continue;

    const left = Math.max(...group.map((line) => line.x));
    const right = Math.min(...group.map((line) => line.right));
    if (right - left < 80) continue;
    if (tabStaffs.some((staff) => Math.abs(staff.top - group[0].y) < averageGap)) continue;

    tabStaffs.push({
      left,
      right,
      top: group[0].y,
      bottom: group[5].y,
      lineGap: averageGap,
    });
  }

  const paths = Array.from(svg.querySelectorAll<SVGGraphicsElement>('path'));
  tabStaffs.forEach((staff) => {
    const staffHeight = staff.bottom - staff.top;
    const staffCenterY = staff.top + (staffHeight / 2);
    const expectedClefX = staff.left + staff.lineGap;
    const clef = paths
      .map((element) => ({ element, box: getSvgBBox(element) }))
      .filter((entry): entry is { element: SVGGraphicsElement; box: DOMRect } => Boolean(entry.box))
      .filter(({ element, box }) => {
        if (element.hasAttribute('data-nex-tab-clef-original')) return false;
        const centerY = box.y + (box.height / 2);
        const right = box.x + box.width;
        return box.height >= staffHeight * 0.45
          && box.height <= staffHeight * 2.4
          && box.width >= staff.lineGap * 0.8
          && box.width <= staff.lineGap * 5
          && centerY >= staff.top - (staff.lineGap * 2)
          && centerY <= staff.bottom + (staff.lineGap * 2)
          && right <= staff.left + (staff.lineGap * 5)
          && box.x >= staff.left - (staff.lineGap * 4);
      })
      .sort((a, b) => {
        const aCenterY = a.box.y + (a.box.height / 2);
        const bCenterY = b.box.y + (b.box.height / 2);
        const aCenterX = a.box.x + (a.box.width / 2);
        const bCenterX = b.box.x + (b.box.width / 2);
        const aScore = Math.abs(aCenterY - staffCenterY) + (Math.abs(aCenterX - expectedClefX) * 0.4);
        const bScore = Math.abs(bCenterY - staffCenterY) + (Math.abs(bCenterX - expectedClefX) * 0.4);
        return aScore - bScore;
      })[0];

    if (!clef) return;

    clef.element.setAttribute('data-nex-tab-clef-original', 'true');
    clef.element.style.opacity = '0';

    const fontSize = Math.min(Math.max(staff.lineGap * 1.196, 10.4), 20.8);
    const centerX = clef.box.x + (clef.box.width / 2);
    const centerY = staffCenterY;
    const letterGap = staffHeight / 3;
    const label = document.createElementNS('http://www.w3.org/2000/svg', 'g');
    label.setAttribute('data-nex-tab-clef-label', 'true');
    label.setAttribute('aria-label', 'TAB');
    label.setAttribute('pointer-events', 'none');

    ['T', 'A', 'B'].forEach((letter, letterIndex) => {
      const text = document.createElementNS('http://www.w3.org/2000/svg', 'text');
      text.textContent = letter;
      text.setAttribute('x', String(centerX));
      text.setAttribute('y', String(centerY + ((letterIndex - 1) * letterGap)));
      text.setAttribute('text-anchor', 'middle');
      text.setAttribute('dominant-baseline', 'middle');
      text.setAttribute('fill', '#111827');
      text.setAttribute('font-family', '"Avenir Next", "Segoe UI", "Helvetica Neue", Inter, "Noto Sans", "DejaVu Sans", Arial, sans-serif');
      text.setAttribute('font-size', fontSize.toFixed(2));
      text.setAttribute('font-weight', '650');
      text.setAttribute('letter-spacing', '0');
      label.appendChild(text);
    });

    clef.element.parentNode?.appendChild(label);
  });
}

export function ghostHasTraceQuantizedRestFallbackSnap(input: {
  timestampNum: number;
  timestampDen: number;
  voiceId: number;
  resolvedTarget?: { diagnostics?: string[] } | null;
  snapResolution?: {
    quantizedFallbackSnap?: {
      timestamp?: string | null;
      voice?: number | null;
      synthetic?: boolean;
      x?: number | null;
    } | null;
  } | null;
}) {
  const internalRestOnlySlot = input.resolvedTarget?.diagnostics?.includes('rest-only-quantized-internal-slot') ?? false;
  if (!internalRestOnlySlot) return false;
  const fallback = input.snapResolution?.quantizedFallbackSnap;
  if (!fallback) return false;
  if (fallback.voice != null && fallback.voice !== input.voiceId) return false;
  if (typeof fallback.x !== 'number' || !Number.isFinite(fallback.x)) return false;
  const timestamp = normalizeFraction(input.timestampNum, Math.max(input.timestampDen, 1));
  return fallback.timestamp === `${timestamp.num}/${timestamp.den}`;
}

function traceSnapCandidate(
  point: (Partial<RenderedGhostGridPoint> & {
    domX?: number;
    domY?: number;
    ratio?: number;
    voiceId?: number;
    timestampNum?: number;
    timestampDen?: number;
    isRest?: boolean;
    synthetic?: boolean;
  }) | null | undefined,
  input: {
    source?: string;
    pointerX?: number | null;
    ghostX?: number | null;
  } = {},
): GhostSnapTraceCandidate | null {
  if (!point || typeof point.domX !== 'number' || !Number.isFinite(point.domX)) return null;
  return {
    id: typeof point.id === 'string' ? point.id : undefined,
    source: input.source,
    x: roundTraceNumber(point.domX),
    y: roundTraceNumber(point.domY),
    ratio: roundTraceNumber(point.ratio),
    timestamp: traceTimestamp(point.timestampNum, point.timestampDen),
    voice: typeof point.voiceId === 'number' ? point.voiceId : null,
    synthetic: point.synthetic,
    isRest: point.isRest,
    distanceFromPointer: typeof input.pointerX === 'number'
      ? roundTraceNumber(Math.abs(point.domX - input.pointerX))
      : null,
    distanceFromGhost: typeof input.ghostX === 'number'
      ? roundTraceNumber(Math.abs(point.domX - input.ghostX))
      : null,
  };
}

function traceAnchorCandidate(
  anchor: GhostOnsetAnchor | null | undefined,
  input: {
    source?: string;
    pointerX?: number | null;
    ghostX?: number | null;
  } = {},
): GhostSnapTraceCandidate | null {
  if (!anchor || typeof anchor.x !== 'number' || !Number.isFinite(anchor.x)) return null;
  return {
    source: input.source ?? anchor.kind,
    x: roundTraceNumber(anchor.x),
    ratio: roundTraceNumber(anchor.ratio),
    timestamp: traceTimestamp(anchor.timestampNum, anchor.timestampDen),
    voice: typeof anchor.voiceId === 'number' ? anchor.voiceId : null,
    synthetic: anchor.synthetic,
    isRest: anchor.isRest,
    distanceFromPointer: typeof input.pointerX === 'number'
      ? roundTraceNumber(Math.abs(anchor.x - input.pointerX))
      : null,
    distanceFromGhost: typeof input.ghostX === 'number'
      ? roundTraceNumber(Math.abs(anchor.x - input.ghostX))
      : null,
  };
}

function traceResolvedTarget(target: ResolvedEditTarget | null | undefined) {
  if (!target) return null;
  return {
    mode: target.mode,
    measureNumber: target.measureNumber,
    staffIndex: target.staffIndex,
    voiceId: target.voiceId,
    timestamp: `${target.timestampNum}/${target.timestampDen}`,
    domX: roundTraceNumber(target.domX),
    diagnostics: target.diagnostics,
  };
}

function traceSnapFromResolvedTarget(
  target: ResolvedEditTarget | null | undefined,
  snapX: number,
  input: {
    source: string;
    pointerX?: number | null;
  },
): GhostSnapTraceCandidate | null {
  if (!target) return null;
  return {
    source: input.source,
    x: roundTraceNumber(snapX),
    ratio: roundTraceNumber(target.ratio),
    timestamp: `${target.timestampNum}/${target.timestampDen}`,
    voice: target.voiceId,
    synthetic: target.diagnostics.some((diagnostic) => diagnostic.includes('synthetic') || diagnostic.includes('internal-slot')),
    isRest: target.existingEventKind === 'rest' || target.diagnostics.some((diagnostic) => diagnostic.includes('rest')),
    distanceFromPointer: typeof input.pointerX === 'number'
      ? roundTraceNumber(Math.abs(snapX - input.pointerX))
      : null,
    distanceFromGhost: 0,
  };
}

function normalizeTraceSnapX(
  snap: GhostSnapTraceCandidate | null | undefined,
  snapX: number,
  input: {
    pointerX?: number | null;
    source?: string;
  } = {},
): GhostSnapTraceCandidate | null {
  if (!snap) return null;
  return {
    ...snap,
    source: input.source ?? snap.source,
    x: roundTraceNumber(snapX),
    distanceFromPointer: typeof input.pointerX === 'number'
      ? roundTraceNumber(Math.abs(snapX - input.pointerX))
      : snap.distanceFromPointer ?? null,
    distanceFromGhost: 0,
  };
}

function alignGhostTargetToCanonicalSnap<T extends GhostNoteTarget>(
  target: T,
  input: {
    canonicalSnapX: number;
    resolvedTarget?: ResolvedEditTarget | null;
    effectiveSnap?: GhostSnapTraceCandidate | null;
    pointerX?: number | null;
    snapSource?: string;
    resolver?: string;
    reason?: string;
  },
): T {
  const canonicalSnapX = input.canonicalSnapX;
  const previewLeft = canonicalSnapX - target.noteheadCenterX;
  const previewDx = previewLeft - target.previewLeft;
  const baseResolvedTarget = input.resolvedTarget ?? target.resolvedTarget ?? null;
  const resolvedTarget = baseResolvedTarget
    ? {
        ...baseResolvedTarget,
        domX: canonicalSnapX,
      }
    : undefined;
  const pointerX = typeof input.pointerX === 'number' && Number.isFinite(input.pointerX)
    ? input.pointerX
    : typeof target.pointerX === 'number' && Number.isFinite(target.pointerX)
      ? target.pointerX
      : null;
  const existingTrace = target.snapResolution ?? null;
  const effectiveSnap = normalizeTraceSnapX(
    input.effectiveSnap
      ?? existingTrace?.effectiveSnap
      ?? existingTrace?.quantizedFallbackSnap
      ?? traceSnapFromResolvedTarget(resolvedTarget, canonicalSnapX, {
        source: input.snapSource ?? 'resolved-edit-target',
        pointerX,
      }),
    canonicalSnapX,
    {
      pointerX,
      source: input.snapSource,
    },
  );
  const nextVisible = {
    ...(existingTrace?.visible ?? {
      minimumVisibleX: null,
    }),
    domCenterX: roundTraceNumber(canonicalSnapX),
    previewLeft: roundTraceNumber(previewLeft),
    noteheadCenterX: roundTraceNumber(target.noteheadCenterX),
    visibleNoteheadX: roundTraceNumber(canonicalSnapX),
  };
  const committedTimestamp = resolvedTarget
    ? `${resolvedTarget.timestampNum}/${resolvedTarget.timestampDen}`
    : existingTrace?.committed?.timestamp ?? `${target.timestampNum}/${target.timestampDen}`;
  const committedVoiceId = resolvedTarget?.voiceId ?? existingTrace?.committed?.voiceId ?? target.voiceId;
  const snapResolution: GhostSnapResolutionTrace = {
    ...(existingTrace ?? {
      resolver: input.resolver ?? 'canonical-snap',
    }),
    resolver: input.resolver ?? existingTrace?.resolver ?? 'canonical-snap',
    reason: input.reason ?? existingTrace?.reason,
    effectiveSnap: effectiveSnap ?? existingTrace?.effectiveSnap ?? null,
    committed: {
      ...(existingTrace?.committed ?? {
        timestamp: committedTimestamp,
        voiceId: committedVoiceId,
      }),
      snappedX: roundTraceNumber(canonicalSnapX),
      timestamp: committedTimestamp,
      voiceId: committedVoiceId,
    },
    visible: nextVisible,
    resolvedTarget: resolvedTarget ? traceResolvedTarget(resolvedTarget) : existingTrace?.resolvedTarget ?? null,
    deltas: {
      ...(existingTrace?.deltas ?? {}),
      pointerToGhost: pointerX == null ? existingTrace?.deltas?.pointerToGhost ?? null : roundTraceNumber(Math.abs(pointerX - canonicalSnapX)),
      pointerToVisibleNotehead: pointerX == null ? existingTrace?.deltas?.pointerToVisibleNotehead ?? null : roundTraceNumber(Math.abs(pointerX - canonicalSnapX)),
      ghostToSnap: 0,
      visibleNoteheadToSnap: 0,
      commitToSnap: resolvedTarget ? roundTraceNumber(Math.abs(canonicalSnapX - resolvedTarget.domX)) : existingTrace?.deltas?.commitToSnap ?? null,
    },
  };

  return {
    ...target,
    domCenter: {
      ...target.domCenter,
      x: canonicalSnapX,
    },
    domRect: {
      ...target.domRect,
      x: target.domRect.x + previewDx,
    },
    previewLeft,
    reflowHints: target.reflowHints?.map((hint) => ({
      ...hint,
      left: hint.left - previewDx,
    })),
    resolvedTarget,
    snapResolution,
  };
}

interface IndexedRenderedNote {
  rendered: RenderedNote;
  semantic: SelectedNote;
}

interface GhostNoteSpatialIndex {
  byMeasureId: Map<string, IndexedRenderedNote[]>;
  bySystemStaff: Map<string, IndexedRenderedNote[]>;
}

function getRenderedMeasureEntries(
  ghostIndex: GhostNoteSpatialIndex,
  overlay: Pick<RenderedMeasureLayoutOverlay, 'measureId' | 'measureNumber' | 'systemIndex'>,
  preferredPartId?: string | null,
): IndexedRenderedNote[] {
  const directEntries = ghostIndex.byMeasureId.get(overlay.measureId) ?? [];
  const partId = preferredPartId ?? directEntries[0]?.semantic.corePartId ?? null;
  const entriesByKey = new Map<string, IndexedRenderedNote>();
  const addEntry = (entry: IndexedRenderedNote) => {
    if (entry.semantic.measureNumber !== overlay.measureNumber) return;
    if (partId && entry.semantic.corePartId !== partId) return;
    const timestamp = normalizeFraction(
      entry.semantic.timestampNum,
      Math.max(entry.semantic.timestampDen, 1),
    );
    const key = [
      entry.semantic.coreEntityId ?? entry.rendered.id,
      entry.semantic.coreMeasureId ?? entry.semantic.measureNumber,
      entry.semantic.staffIndex,
      entry.semantic.voiceId,
      timestamp.num,
      timestamp.den,
      entry.semantic.isRest ? 'rest' : `${entry.semantic.step}:${entry.semantic.alter}:${entry.semantic.octave}`,
    ].join(':');
    entriesByKey.set(key, entry);
  };

  directEntries.forEach(addEntry);
  for (const [key, entries] of ghostIndex.bySystemStaff.entries()) {
    if (!key.startsWith(`${overlay.systemIndex}:`)) continue;
    entries.forEach(addEntry);
  }

  return [...entriesByKey.values()];
}

function corePartIdForMeasureId(
  coreDocument: ScoreDocumentModel | null | undefined,
  measureId: string,
): string | null {
  if (!coreDocument) return null;
  for (const part of coreDocument.score.parts) {
    for (const staff of part.staves) {
      if (staff.measures.some((measure) => measure.id === measureId)) return part.id;
    }
  }
  return null;
}

interface SemanticAnchorDebugBox {
  id: string;
  measureId: string | null;
  measureNumber: number;
  pageIndex: number | null;
  systemIndex: number | null;
  partId: string | null;
  protectedSystemStart: boolean;
  measureLeft: number;
  measureRight: number;
  measureXStart: number;
  measureXEnd: number;
  measureDuration: number;
  durationRatio: number;
  xStartReason: 'system-start-protected' | 'system-start-no-leading-modifier-detected' | 'measure-leading-modifier-protected' | 'normal-measure-left' | 'fallback';
  staffIndex: number;
  voiceId: number;
  timestampNum: number;
  timestampDen: number;
  label: string;
  isRest: boolean;
  hasRenderedVisual: boolean;
  duplicateOfEarlier?: boolean;
  rect: RectLike;
  anchorRect: RectLike;
  visualRect: RectLike;
}

interface SemanticMeasureGuardDebugLine {
  id: string;
  measureId: string | null;
  measureNumber: number;
  pageIndex: number | null;
  systemIndex: number | null;
  staffIndex: number;
  edge: 'left' | 'right';
  protectedSystemStart: boolean;
  x: number;
  y: number;
  height: number;
}

interface SemanticOverlapDebugRect {
  id: string;
  kind: 'overdraw' | 'protected-overlap' | 'protected-anchor-overlap' | 'protected-visual-overlap';
  message: string;
  measures: number[];
  staffIndex: number;
  contributors: Array<{
    measureNumber: number;
    staffIndex: number;
    voiceId: number;
    timestamp: string;
    label: string;
    rect: RectLike;
  }>;
  rect: RectLike;
}

interface SemanticProtectedDebugRect {
  id: string;
  measureId: string | null;
  measureNumber: number;
  pageIndex: number | null;
  systemIndex: number | null;
  partId: string | null;
  staffIndex: number;
  reason: SemanticAnchorDebugBox['xStartReason'];
  rect: RectLike;
}

interface SemanticSnapDebugPoint {
  id: string;
  measureId: string;
  measureNumber: number;
  pageIndex: number | null;
  systemIndex: number | null;
  partId: string | null;
  staffIndex: number;
  voiceId: number;
  timestampNum: number;
  timestampDen: number;
  ratio: number;
  x: number;
  y: number;
  isRest: boolean;
  synthetic: boolean;
  active: boolean;
  sourceCount: number;
  distinctXCount: number;
  suppressedSyntheticCount: number;
  rawXs: number[];
  issue: 'multi-x' | 'duplicate-source' | 'synthetic-grid-collapsed' | null;
}

interface SemanticSnapColumnDebugLine {
  id: string;
  pageIndex: number | null;
  systemIndex: number | null;
  x: number;
  top: number;
  bottom: number;
  active: boolean;
  issue: SemanticSnapDebugPoint['issue'];
  snapCount: number;
  measures: number[];
  staves: number[];
  timestamps: string[];
}

interface SemanticPitchDebugBand {
  id: string;
  measureId: string;
  measureNumber: number;
  pageIndex: number | null;
  systemIndex: number | null;
  partId: string | null;
  staffIndex: number;
  staffStep: number;
  pitch: string;
  centerY: number;
  rect: RectLike;
}

interface StaffVerticalFence {
  staffIndex: number;
  centerY: number;
  top: number;
  bottom: number;
}

async function writeTextToClipboard(text: string) {
  if (typeof navigator !== 'undefined' && navigator.clipboard?.writeText) {
    try {
      await navigator.clipboard.writeText(text);
      return true;
    } catch {
      // Fall through to the textarea path. Localhost/browser permission prompts
      // can reject the async clipboard API even when manual copy is allowed.
    }
  }

  if (typeof document === 'undefined') return false;
  const textarea = document.createElement('textarea');
  textarea.value = text;
  textarea.setAttribute('readonly', 'true');
  textarea.style.position = 'fixed';
  textarea.style.left = '-9999px';
  textarea.style.top = '0';
  document.body.appendChild(textarea);
  textarea.focus();
  textarea.select();
  try {
    return document.execCommand('copy');
  } finally {
    textarea.remove();
  }
}

function compactCodexHandoffStatusText(value: unknown, maxLength = 140) {
  const text = typeof value === 'string'
    ? value
    : value == null
      ? ''
      : String(value);
  const compact = text.replace(/\s+/g, ' ').trim();
  return compact.length > maxLength
    ? `${compact.slice(0, Math.max(0, maxLength - 3))}...`
    : compact;
}

function formatSemanticGridCodexHandoffButtonTitle(result: unknown) {
  const payload = result && typeof result === 'object'
    ? result as Record<string, unknown>
    : {};
  const id = compactCodexHandoffStatusText(payload.id, 64);
  const suffix = id ? ` (${id})` : '';

  if (payload.ok === true) {
    return payload.mode === 'terminal'
      ? `Codex handoff succeeded: Terminal opened${suffix}.`
      : `Codex handoff succeeded${suffix}.`;
  }

  const error = compactCodexHandoffStatusText(payload.error || result);
  return error
    ? `Codex handoff failed: ${error}`
    : 'Codex handoff failed.';
}

async function startSemanticGridCodexFromSummary(summary: unknown, history: unknown[]) {
  const signature = semanticGridCodexPromptSignature(summary);
  const report = buildSemanticGridCodexReport(summary);
  const prompt = buildSemanticGridCodexPrompt({
    summary,
    history,
    context: getBugReportContext(),
    recentEvents: getBugReportEvents(),
  });
  const response = await fetch('/api/codex-handoff', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      prompt,
      report,
      signature,
      openTerminal: true,
    }),
  });
  const result = await response.json().catch(() => ({ ok: false, error: response.statusText }));
  const record = report && typeof report === 'object' ? report as Record<string, unknown> : {};
  recordBugReportEvent('semantic-grid-codex', response.ok && result?.ok ? 'start-codex' : 'start-codex-failed', {
    generatedAt: record.generatedAt,
    issueCount: record.issueCount,
    promptLength: prompt.length,
    signature,
    result,
  });
  return result;
}

interface DragTransposeSession {
  pointerId: number;
  note: SelectedNote;
  startStaffStep: number;
  startDomPoint: PointLike;
  pointerDownDomPoint: PointLike;
  currentStaffIndex: number;
  lastSemitoneDelta: number;
  lastPreviewStaffIndex: number;
  lastResolvedPitch: { step: string; alter: number; octave: number } | null;
  /** Drag started on a TAB staff note: vertical drag picks the string, pitch stays fixed. */
  tabDrag: boolean;
  lastResolvedGuitar: { string: 1 | 2 | 3 | 4 | 5 | 6; fret: number } | null;
  dragStarted: boolean;
  pulseToken: number;
}

function isTabStaffTarget(
  coreDocument: ScoreDocumentModel | null,
  target: { corePartId?: string | null; measureId?: string | null; staffIndex: number },
) {
  if (!coreDocument) return false;
  const parts = coreDocument.score.parts.filter((part) => (
    target.corePartId
      ? part.id === target.corePartId
      : !target.measureId || part.staves.some((staff) => staff.measures.some((measure) => measure.id === target.measureId))
  ));
  return parts.some((part) => part.staves.some((staff) => (
    staff.staffIndex === target.staffIndex
    && staff.measures.some((measure) => measure.attributes.some((attribute) => (
      attribute.clefs.some((clef) => clef.staffIndex === target.staffIndex && clef.sign?.toUpperCase() === 'TAB')
    )))
  )));
}

function isTabStaffSelectedNote(coreDocument: ScoreDocumentModel | null, note: SelectedNote) {
  return isTabStaffTarget(coreDocument, {
    corePartId: note.corePartId,
    measureId: note.coreMeasureId,
    staffIndex: note.staffIndex,
  });
}

/** Notehead hover ghosts carry pitch semantics that do not exist on a TAB
 * staff — suppress them there (TAB entry works via fret input and drag). */
function suppressGhostOnTabStaff(coreDocument: ScoreDocumentModel | null, target: GhostNoteTarget | null) {
  if (!target || target.tabFret != null) return target;
  return isTabStaffTarget(coreDocument, target) ? null : target;
}

function approximatelyEqual(a: number, b: number, epsilon = 0.5) {
  return Math.abs(a - b) <= epsilon;
}

function ghostTargetsEqual(a: GhostNoteTarget | null, b: GhostNoteTarget | null) {
  if (a === b) return true;
  if (!a || !b) return false;
  return a.measureId === b.measureId
    && a.staffIndex === b.staffIndex
    && a.voiceId === b.voiceId
    && a.timestampNum === b.timestampNum
    && a.timestampDen === b.timestampDen
    && a.step === b.step
    && a.octave === b.octave
    && a.alter === b.alter
    && a.stemDirection === b.stemDirection
    && a.placementMode === b.placementMode
    && (a.semanticAnchorLabel ?? null) === (b.semanticAnchorLabel ?? null)
    && approximatelyEqual(a.semanticAnchorRect?.x ?? -1, b.semanticAnchorRect?.x ?? -1)
    && approximatelyEqual(a.semanticAnchorRect?.y ?? -1, b.semanticAnchorRect?.y ?? -1)
    && approximatelyEqual(a.semanticAnchorRect?.width ?? -1, b.semanticAnchorRect?.width ?? -1)
    && approximatelyEqual(a.semanticAnchorRect?.height ?? -1, b.semanticAnchorRect?.height ?? -1)
    && approximatelyEqual(a.previewLeft, b.previewLeft)
    && approximatelyEqual(a.previewTop, b.previewTop)
    && approximatelyEqual(a.domCenter.x, b.domCenter.x)
    && approximatelyEqual(a.domCenter.y, b.domCenter.y);
}

function ghostPitchLabel(target: Pick<GhostNoteTarget, 'step' | 'alter' | 'octave'>) {
  const accidental = target.alter === 1 ? '#'
    : target.alter === -1 ? 'b'
      : target.alter === 2 ? 'x'
        : target.alter === -2 ? 'bb'
          : '';
  return `${target.step}${accidental}${target.octave}`;
}

function parseGhostPitchLabel(value: string) {
  const match = /^([A-G])(bb|x|#|b)?(-?\d+)$/.exec(value);
  if (!match) return null;
  const accidental = match[2] ?? '';
  return {
    step: match[1]!,
    alter: accidental === '#' ? 1
      : accidental === 'b' ? -1
        : accidental === 'x' ? 2
          : accidental === 'bb' ? -2
            : 0,
    octave: Number.parseInt(match[3]!, 10),
  };
}

function findRecentGhostTargetForElement(
  element: HTMLElement | null,
  targets: GhostNoteTarget[],
) {
  if (!element) return null;
  const measureNumber = Number.parseInt(element.dataset.ghostMeasure ?? '', 10);
  const staffIndex = Number.parseInt(element.dataset.ghostStaff ?? '', 10);
  const voiceId = Number.parseInt(element.dataset.ghostVoice ?? '', 10);
  const timestamp = element.dataset.ghostTimestamp ?? '';
  const [timestampNumText, timestampDenText] = timestamp.split('/');
  const timestampNum = Number.parseInt(timestampNumText ?? '', 10);
  const timestampDen = Number.parseInt(timestampDenText ?? '', 10);
  const pitch = element.dataset.ghostPitch ?? '';
  const mode = element.dataset.ghostMode ?? '';
  if (
    !Number.isFinite(measureNumber)
    || !Number.isFinite(staffIndex)
    || !Number.isFinite(voiceId)
    || !Number.isFinite(timestampNum)
    || !Number.isFinite(timestampDen)
    || !pitch
  ) {
    return null;
  }
  return targets.find((target) => (
    target.measureNumber === measureNumber
    && target.staffIndex === staffIndex
    && target.voiceId === voiceId
    && timestampsEqual(target.timestampNum, target.timestampDen, timestampNum, timestampDen)
    && ghostPitchLabel(target) === pitch
    && (!mode || target.placementMode === mode)
  )) ?? null;
}

function cloneGhostTargetFromElement(
  element: HTMLElement | null,
  baseTarget: GhostNoteTarget | null,
  containerRect: DOMRect,
): GhostNoteTarget | null {
  if (!element || !baseTarget) return null;
  const parseTimestampDataset = (value: string | undefined) => {
    const [numText, denText] = (value ?? '').split('/');
    const num = Number.parseInt(numText ?? '', 10);
    const den = Number.parseInt(denText ?? '', 10);
    return Number.isFinite(num) && Number.isFinite(den) && den > 0
      ? { num, den }
      : null;
  };
  const parseFiniteNumberDataset = (value: string | undefined) => {
    const parsed = Number.parseFloat(value ?? '');
    return Number.isFinite(parsed) ? parsed : null;
  };
  const parseFiniteIntDataset = (value: string | undefined) => {
    const parsed = Number.parseInt(value ?? '', 10);
    return Number.isFinite(parsed) ? parsed : null;
  };
  const parsePlacementModeDataset = (value: string | undefined) => (
    value === 'insert' || value === 'replace' || value === 'chord'
      ? value
      : null
  );
  const measureNumber = Number.parseInt(element.dataset.ghostMeasure ?? '', 10);
  const staffIndex = Number.parseInt(element.dataset.ghostStaff ?? '', 10);
  const voiceId = Number.parseInt(element.dataset.ghostVoice ?? '', 10);
  const timestamp = parseTimestampDataset(element.dataset.ghostTimestamp);
  const pitch = parseGhostPitchLabel(element.dataset.ghostPitch ?? '');
  const mode = parsePlacementModeDataset(element.dataset.ghostMode) as GhostPlacementMode | null;
  if (
    !Number.isFinite(measureNumber)
    || !Number.isFinite(staffIndex)
    || !Number.isFinite(voiceId)
    || !timestamp
    || !pitch
  ) {
    return null;
  }
  const commitTimestamp = parseTimestampDataset(element.dataset.ghostCommitTimestamp);
  const commitMeasureNumber = parseFiniteIntDataset(element.dataset.ghostCommitMeasure);
  const commitStaffIndex = parseFiniteIntDataset(element.dataset.ghostCommitStaff);
  const commitVoiceId = parseFiniteIntDataset(element.dataset.ghostCommitVoice);
  const commitX = parseFiniteNumberDataset(element.dataset.ghostCommitX);
  const commitMode = parsePlacementModeDataset(element.dataset.ghostCommitMode);
  const measureId = element.dataset.ghostMeasureId || baseTarget.measureId;
  const corePartId = element.dataset.ghostCorePartId || baseTarget.corePartId;
  const commitMeasureId = element.dataset.ghostCommitMeasureId || measureId;
  const commitCorePartId = element.dataset.ghostCommitCorePartId || corePartId;

  const rect = element.getBoundingClientRect();
  const noteheadCenterX = Number.parseFloat(element.dataset.ghostNoteheadCenterX ?? String(baseTarget.noteheadCenterX));
  const noteheadCenterY = Number.parseFloat(element.dataset.ghostNoteheadCenterY ?? String(baseTarget.previewHeight / 2));
  const domRect = {
    x: rect.x - containerRect.x,
    y: rect.y - containerRect.y,
    width: rect.width,
    height: rect.height,
  };
  const domCenter = {
    x: domRect.x + (Number.isFinite(noteheadCenterX) ? noteheadCenterX : baseTarget.noteheadCenterX),
    y: domRect.y + (Number.isFinite(noteheadCenterY) ? noteheadCenterY : baseTarget.previewHeight / 2),
  };
  const effectiveCommitTimestamp = mode === 'replace' ? timestamp : commitTimestamp;
  const effectiveCommitMeasureNumber = mode === 'replace' ? measureNumber : (commitMeasureNumber ?? measureNumber);
  const effectiveCommitStaffIndex = mode === 'replace' ? staffIndex : (commitStaffIndex ?? staffIndex);
  const effectiveCommitVoiceId = mode === 'replace' ? voiceId : (commitVoiceId ?? voiceId);
  const effectiveCommitX = mode === 'replace' ? domCenter.x : (commitX ?? domCenter.x);
  const effectiveCommitMode = mode === 'replace' ? mode : (commitMode ?? mode);

  return {
    ...baseTarget,
    measureId,
    corePartId,
    measureNumber,
    staffIndex,
    voiceId,
    timestampNum: timestamp.num,
    timestampDen: timestamp.den,
    step: pitch.step,
    alter: pitch.alter,
    octave: pitch.octave,
    placementMode: mode ?? baseTarget.placementMode,
    domRect,
    domCenter,
    previewLeft: domRect.x,
    previewTop: domRect.y,
    previewWidth: domRect.width,
    previewHeight: domRect.height,
    noteheadCenterX: Number.isFinite(noteheadCenterX) ? noteheadCenterX : baseTarget.noteheadCenterX,
    resolvedTarget: baseTarget.resolvedTarget
      ? {
          ...baseTarget.resolvedTarget,
          measureId: commitMeasureId,
          corePartId: commitCorePartId,
          measureNumber: effectiveCommitMeasureNumber,
          staffIndex: effectiveCommitStaffIndex,
          voiceId: effectiveCommitVoiceId,
          timestampNum: effectiveCommitTimestamp?.num ?? timestamp.num,
          timestampDen: effectiveCommitTimestamp?.den ?? timestamp.den,
          ratio: (effectiveCommitTimestamp?.num ?? timestamp.num) / Math.max(effectiveCommitTimestamp?.den ?? timestamp.den, 1),
          domX: effectiveCommitX,
          step: pitch.step,
          alter: pitch.alter,
          octave: pitch.octave,
          mode: effectiveCommitMode ?? baseTarget.resolvedTarget.mode,
          diagnostics: [
            ...baseTarget.resolvedTarget.diagnostics,
            'visible-dom-ghost-commit-locked',
          ],
        }
      : effectiveCommitTimestamp
        ? {
            source: 'pointer' as const,
            mode: effectiveCommitMode ?? 'replace',
            measureId: commitMeasureId,
            corePartId: commitCorePartId,
            measureNumber: effectiveCommitMeasureNumber,
            staffIndex: effectiveCommitStaffIndex,
            voiceId: effectiveCommitVoiceId,
            timestampNum: effectiveCommitTimestamp.num,
            timestampDen: effectiveCommitTimestamp.den,
            ratio: effectiveCommitTimestamp.num / Math.max(effectiveCommitTimestamp.den, 1),
            domX: effectiveCommitX,
            step: pitch.step,
            octave: pitch.octave,
            alter: pitch.alter,
            diagnostics: ['visible-dom-ghost-commit-synthesized'],
          }
        : undefined,
  };
}

let lastGhostPitchLogSignature: string | null = null;
let lastGhostPitchLogAt = 0;
let lastGhostSuspiciousLogSignature: string | null = null;
let lastGhostSuspiciousLogAt = 0;
let lastGhostHorizontalOverrideSignature: string | null = null;
let lastGhostHorizontalOverrideAt = 0;

function shouldLogGhostSignature(
  signature: string,
  bucket: 'pitch' | 'suspicious',
  minIntervalMs = 180,
) {
  const now = Date.now();
  if (bucket === 'suspicious') {
    if (lastGhostSuspiciousLogSignature === signature && now - lastGhostSuspiciousLogAt < minIntervalMs) return false;
    lastGhostSuspiciousLogSignature = signature;
    lastGhostSuspiciousLogAt = now;
    return true;
  }
  if (bucket === 'pitch') {
    if (now - lastGhostPitchLogAt < minIntervalMs) return false;
    lastGhostPitchLogSignature = signature;
    lastGhostPitchLogAt = now;
    return true;
  }
  if (lastGhostPitchLogSignature === signature && now - lastGhostPitchLogAt < minIntervalMs) return false;
  lastGhostPitchLogSignature = signature;
  lastGhostPitchLogAt = now;
  return true;
}

function shouldLogGhostHorizontalOverride(signature: string, minIntervalMs = 180) {
  const now = Date.now();
  if (lastGhostHorizontalOverrideSignature === signature && now - lastGhostHorizontalOverrideAt < minIntervalMs) return false;
  lastGhostHorizontalOverrideSignature = signature;
  lastGhostHorizontalOverrideAt = now;
  return true;
}

function resolveStableGhostHorizontalRatio(input: {
  overlay: Pick<RenderedMeasureLayoutOverlay, 'measureId' | 'measureNumber' | 'domRect'>;
  pointerX: number;
  slotDuration: number;
  segmentStartRatio: number;
  quantizedRatio: number;
  placementIntent: ReturnType<typeof resolveGhostPlacementIntent>;
  xFromRatio: (ratio: number) => number;
}) {
  const {
    overlay,
    pointerX,
    slotDuration,
    segmentStartRatio,
    quantizedRatio,
    placementIntent,
    xFromRatio,
  } = input;
  const resolvedRatio = placementIntent.targetRatio;
  const pointerOffsetX = pointerX - overlay.domRect.x;
  const nearMeasureLeft = pointerOffsetX <= Math.max(24, overlay.domRect.width * 0.08);
  const snappedToSegmentStart = Math.abs(resolvedRatio - segmentStartRatio) < 1e-6;
  const quantizedAwayFromStart = quantizedRatio > segmentStartRatio + Math.max(slotDuration * 0.5, 1 / 64);
  const resolvedX = xFromRatio(resolvedRatio);
  const quantizedX = xFromRatio(quantizedRatio);
  const quantizedCloserToPointer = Math.abs(quantizedX - pointerX) + 6 < Math.abs(resolvedX - pointerX);

  if (snappedToSegmentStart && quantizedAwayFromStart && !nearMeasureLeft && quantizedCloserToPointer) {
    const signature = [
      overlay.measureId,
      overlay.measureNumber,
      placementIntent.mode,
      resolvedRatio.toFixed(4),
      quantizedRatio.toFixed(4),
      Math.round(pointerX),
    ].join('|');
    if (shouldLogGhostHorizontalOverride(signature)) {
      dbg.score(`proxy ghost horizontal override ${JSON.stringify({
        overlay: `${overlay.measureId}#${overlay.measureNumber}`,
        mode: placementIntent.mode,
        pointerOffsetX: Math.round(pointerOffsetX),
        segmentStartRatio,
        resolvedRatio,
        quantizedRatio,
        resolvedX: Math.round(resolvedX),
        quantizedX: Math.round(quantizedX),
      })}`);
    }
    return quantizedRatio;
  }

  return resolvedRatio;
}

function getSystemStaffKey(systemIndex: number, staffIndex: number, corePartId: string | null | undefined): string {
  return `${systemIndex}:${corePartId ?? 'partless'}:${staffIndex}`;
}

function getPitchedStaffEntriesAcrossScore(
  ghostIndex: GhostNoteSpatialIndex,
  staffIndex: number,
  corePartId: string | null | undefined,
) {
  return [...ghostIndex.bySystemStaff.values()]
    .flatMap((entries) => entries)
    .filter((entry) => (
      !entry.semantic.isRest
      && entry.semantic.staffIndex === staffIndex
      && (!corePartId || entry.semantic.corePartId === corePartId)
    ));
}

const VIEW_LABELS: Record<ScoreViewMode, string> = {
  page: 'Page view',
  'continuous-vertical': 'Continuous view (vertical)',
  'continuous-horizontal': 'Continuous view (horizontal)',
};

type ScoreViewCommandAction =
  | 'toggle-navigator'
  | 'focus-find'
  | 'zoom-in'
  | 'zoom-out'
  | 'zoom-reset'
  | 'set-view-mode';

interface ScoreViewCommandDetail {
  action: ScoreViewCommandAction;
  viewMode?: ScoreViewMode;
}

const ZOOM_PRESETS = [25, 50, 75, 100, 125, 150, 200];
const MIN_ZOOM = 25;
const MAX_ZOOM = 300;
const ZOOM_STEP = 10;
const STEP_ORDER = ['C', 'D', 'E', 'F', 'G', 'A', 'B'] as const;
const BARLINE_GHOST_GUARD_PX = 7;
const LEADING_REST_ANCHOR_HOVER_TOLERANCE_PX = 12;

function leadingTimeSignatureGuardPx() {
  return BARLINE_GHOST_GUARD_PX * 2;
}

function leadingTimeSignatureGuardRightX(overlay: Pick<RenderedMeasureLayoutOverlay, 'domRect'>) {
  return overlay.domRect.x + leadingTimeSignatureGuardPx();
}

function ghostStaffHysteresisPx(zoomPercent: number, isDragLocked: boolean) {
  const normalized = clamp((zoomPercent - 50) / 150, 0, 1);
  const base = 5 + (normalized * 5);
  return isDragLocked ? base * 1.5 : base;
}

function notePitchToMidi(step: string, alter: number, octave: number) {
  const stepToSemitone: Record<string, number> = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 };
  return (stepToSemitone[step] ?? 0) + alter + ((octave + 1) * 12);
}

function computeNearestStaffDistance(
  details: DetailedContext['measure']['staffDetails'],
  currentStaffIndex: number,
  domY: number,
) {
  const current = findNearestStaffDetail(details, currentStaffIndex, domY);
  if (!current) return Number.POSITIVE_INFINITY;
  const currentMid = (current.topLineDomY + current.bottomLineDomY) / 2;
  return details
    .filter((detail) => detail !== current)
    .reduce((best, detail) => {
      const detailMid = (detail.topLineDomY + detail.bottomLineDomY) / 2;
      return Math.min(best, Math.abs(detailMid - domY));
    }, Math.abs(currentMid - domY));
}

function buildDragPreviewTarget(input: {
  context: DetailedContext;
  rendered: RenderedNote;
  dragPitch: { step: string; alter: number; octave: number };
  transposeMode: DragTransposeMode;
  selectedDuration: Props['selectedDuration'];
  isDotted: boolean;
  pulse: boolean;
  isNearEscape: boolean;
  targetStaffIndex: number;
}): GhostNoteTarget {
  const { context, rendered, dragPitch, transposeMode, selectedDuration, isDotted, pulse, isNearEscape, targetStaffIndex } = input;
  const staff = context.staff!;
  const center = rendered.domCenter;
  const snappedY = clamp(
    staff.topLineDomY + (context.staffStep! * (staff.lineDistanceDom / 2)),
    staff.topLineDomY - staff.lineDistanceDom,
    staff.bottomLineDomY + staff.lineDistanceDom,
  );
  const stemDirection = resolvePreviewStemDirection({
    staffStep: context.staffStep ?? 4,
    voiceId: rendered.note.voiceId,
  });
  const previewMetrics = buildGhostPreviewMetrics(center.x, snappedY, dragPitch.alter, isDotted, selectedDuration, stemDirection);
  return {
    measureId: context.measure.measureId,
    corePartId: rendered.note.corePartId ?? null,
    measureNumber: rendered.note.measureNumber,
    staffIndex: targetStaffIndex,
    voiceId: rendered.note.voiceId,
    timestampNum: rendered.note.timestampNum,
    timestampDen: rendered.note.timestampDen,
    step: dragPitch.step,
    octave: dragPitch.octave,
    alter: dragPitch.alter,
    domCenter: { x: center.x, y: snappedY },
    domRect: {
      x: center.x - Math.max(rendered.domRect.width, 12) / 2,
      y: snappedY - Math.max(rendered.domRect.height, 12) / 2,
      width: Math.max(rendered.domRect.width, 12),
      height: Math.max(rendered.domRect.height, 12),
    },
    previewLeft: previewMetrics.previewLeft,
    previewTop: previewMetrics.previewTop,
    previewWidth: previewMetrics.previewWidth,
    previewHeight: previewMetrics.previewHeight,
    accidentalOffsetX: previewMetrics.accidentalOffsetX,
    noteheadCenterX: previewMetrics.noteheadCenterX,
    stemDirection,
    placementMode: 'replace',
    transposeMode,
    ledgerLines: buildLedgerLineSegments({
      staffStep: context.staffStep,
      lineCount: staff.lineCount,
      topLineDomY: staff.topLineDomY,
      lineDistanceDom: staff.lineDistanceDom,
      previewTop: previewMetrics.previewTop,
      noteheadCenterX: previewMetrics.noteheadCenterX,
    }),
    dragLockLine: {
      x: center.x,
      top: context.measure.domRect.y,
      height: context.measure.domRect.height,
      isNearEscape,
    },
    dragPulse: pulse,
  };
}

function buildTabStringDragPreviewTarget(input: {
  measure: AugmentedMeasureLayout;
  note: SelectedNote;
  domCenterX: number;
  snappedY: number;
  tabString: 1 | 2 | 3 | 4 | 5 | 6;
  tabFret: number;
  pulse: boolean;
}): GhostNoteTarget {
  const { measure, note, domCenterX, snappedY, tabString, tabFret, pulse } = input;
  const previewMetrics = buildGhostPreviewMetrics(domCenterX, snappedY, 0, false, '4', 'up');
  return {
    measureId: measure.measureId,
    corePartId: note.corePartId ?? null,
    measureNumber: note.measureNumber,
    staffIndex: note.staffIndex,
    voiceId: note.voiceId,
    timestampNum: note.timestampNum,
    timestampDen: note.timestampDen,
    step: note.step,
    octave: note.octave,
    alter: note.alter,
    domCenter: { x: domCenterX, y: snappedY },
    domRect: {
      x: domCenterX - 8,
      y: snappedY - 8,
      width: 16,
      height: 16,
    },
    previewLeft: previewMetrics.previewLeft,
    previewTop: previewMetrics.previewTop,
    previewWidth: previewMetrics.previewWidth,
    previewHeight: previewMetrics.previewHeight,
    accidentalOffsetX: previewMetrics.accidentalOffsetX,
    noteheadCenterX: previewMetrics.noteheadCenterX,
    stemDirection: 'up',
    placementMode: 'replace',
    tabFret,
    tabString,
    ledgerLines: [],
    dragLockLine: {
      x: domCenterX,
      top: measure.domRect.y,
      height: measure.domRect.height,
      isNearEscape: false,
    },
    dragPulse: pulse,
  };
}

function durationToFlags(duration: Props['selectedDuration']) {
  const value = selectedDurationNumber(duration);
  if (value >= 16) return 2;
  if (value >= 8) return 1;
  return 0;
}

function selectedDurationNumber(duration: Props['selectedDuration']) {
  if (duration === 'breve') return 0.5;
  if (duration === 'long') return 0.25;
  return Number.parseInt(duration, 10);
}

export function resolvePreviewStemDirection(input: {
  staffStep: number;
  voiceId: number;
}): 'up' | 'down' {
  if (input.voiceId === 2 || input.voiceId === 4) return 'down';
  if (input.voiceId === 3) return 'up';
  return input.staffStep > 4 ? 'up' : 'down';
}

function accidentalToAlter(accidental: Props['selectedAccidental']) {
  if (accidental === 'double-sharp') return 2;
  if (accidental === 'sharp') return 1;
  if (accidental === 'flat') return -1;
  if (accidental === 'double-flat') return -2;
  return 0;
}

export function resolveMouseEntryAlter(input: {
  selectedAccidental: Props['selectedAccidental'];
  coreDocument: ScoreDocumentModel | null;
  measureNumber: number;
  staffIndex: number;
  step: string;
  octave: number;
  timestampNum: number;
  timestampDen: number;
  corePartId?: string | null;
}) {
  if (input.selectedAccidental != null) return accidentalToAlter(input.selectedAccidental);
  return resolveMeasureAccidentalAlter(input.coreDocument, input);
}

function diatonicPitchIndex(step: string, octave: number) {
  return octave * STEP_ORDER.length + STEP_ORDER.indexOf(step as typeof STEP_ORDER[number]);
}

function pitchFromDiatonicIndex(index: number) {
  const normalized = Math.max(index, 0);
  const octave = Math.floor(normalized / STEP_ORDER.length);
  const step = STEP_ORDER[((normalized % STEP_ORDER.length) + STEP_ORDER.length) % STEP_ORDER.length] ?? 'C';
  return { step, octave };
}

function resolveOverlayLayerOffset(container: HTMLElement | null): OverlayLayerOffset {
  void container;
  return { x: 0, y: 0 };
}

function previewAccidentalWidth(alter: number) {
  if (alter === -2) return 16;
  if (alter === 2) return 13;
  if (alter === 1 || alter === -1) return 9;
  return 0;
}

export function buildGhostPreviewMetrics(
  snappedX: number,
  snappedY: number,
  alter: number,
  isDotted: boolean,
  selectedDuration: Props['selectedDuration'],
  stemDirection: 'up' | 'down' = 'up',
) {
  const accidentalWidth = previewAccidentalWidth(alter);
  const accidentalGap = accidentalWidth > 0 ? 2 : 0;
  const durationValue = selectedDurationNumber(selectedDuration);
  const isWideLongDuration = selectedDuration === 'breve' || selectedDuration === 'long';
  const isWholeLike = durationValue === 1 || isWideLongDuration;
  const noteheadWidth = isWholeLike ? (isWideLongDuration ? 22 : 12) : 11;
  const hasStem = selectedDuration === 'long' || (Number.isFinite(durationValue) && durationValue > 1);
  const stemWidth = 5;
  const flagWidth = durationToFlags(selectedDuration) > 0 ? 5 : 0;
  const dotWidth = isDotted ? 5 : 0;
  const rightPadding = 2;
  const leftStemPad = hasStem && stemDirection === 'down'
    ? stemWidth + flagWidth + 1
    : 0;
  const rightStemPad = hasStem && stemDirection === 'up'
    ? stemWidth + flagWidth
    : 0;
  const left = snappedX - (noteheadWidth / 2) - accidentalWidth - accidentalGap - leftStemPad;
  const top = snappedY - 28;
  const width = accidentalWidth + accidentalGap + leftStemPad + noteheadWidth + rightStemPad + dotWidth + rightPadding;
  return {
    previewLeft: left,
    previewTop: top,
    previewWidth: width,
    previewHeight: hasStem && stemDirection === 'down' ? 54 : 40,
    accidentalOffsetX: accidentalWidth > 0 ? accidentalWidth : 0,
    noteheadCenterX: accidentalWidth + accidentalGap + leftStemPad + (noteheadWidth / 2),
  };
}

function buildGhostReflowHints(
  entries: IndexedRenderedNote[],
  snappedX: number,
  snappedY: number,
  containerRect: DOMRect | null,
  previewMetrics: ReturnType<typeof buildGhostPreviewMetrics>,
) {
  return entries
    .map((entry) => {
      const center = getRenderedPitchCenter(entry.rendered, containerRect);
      const dx = center.x - snappedX;
      const dy = center.y - snappedY;
      if (Math.abs(dx) > 18 || Math.abs(dy) > 16) return null;
      const shiftMagnitude = Math.max(8, 18 - Math.abs(dx));
      return {
        left: center.x - previewMetrics.previewLeft - 7,
        top: center.y - previewMetrics.previewTop - 16,
        shiftX: dx >= 0 ? shiftMagnitude : -shiftMagnitude,
        width: Math.max(entry.rendered.domRect.width, 12),
        height: Math.max(entry.rendered.domRect.height, 24),
        distance: Math.abs(dx) + Math.abs(dy),
      };
    })
    .filter((entry): entry is NonNullable<typeof entry> => entry !== null)
    .sort((a, b) => a.distance - b.distance)
    .slice(0, 3)
    .map(({ distance: _distance, ...hint }) => hint);
}

function median(values: number[]) {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0
    ? (sorted[mid - 1]! + sorted[mid]!) / 2
    : sorted[mid]!;
}

function interpolateLinear(x0: number, y0: number, x1: number, y1: number, x: number) {
  if (Math.abs(x1 - x0) < 1e-6) return y0;
  const t = (x - x0) / (x1 - x0);
  return y0 + (y1 - y0) * t;
}

export function buildGhostHorizontalQuantizer(
  measureDuration: number,
  slotDuration: number,
  onsetAnchors: GhostOnsetAnchor[],
  overlayRect: Pick<RectLike, 'x' | 'width'>,
  segment?: RhythmicSegment | null,
  contentInsets?: { left?: number; right?: number },
) {
  const overlayStartX = overlayRect.x + Math.max(contentInsets?.left ?? 0, 0);
  const overlayEndX = (overlayRect.x + overlayRect.width) - Math.max(contentInsets?.right ?? 0, 0);

  if (!(measureDuration > 0) || !(overlayEndX > overlayStartX)) {
    return {
      ratioFromX: () => 0,
      xFromRatio: () => overlayStartX,
      snapRatio: () => 0,
      snapX: () => overlayStartX,
    };
  }

  const segmentStartRatio = segment ? fractionToNumber(segment.start) : 0;
  const segmentEndRatio = segment ? fractionToNumber(segment.end) : measureDuration;

  const dedupedAnchors = onsetAnchors
    .filter((anchor) => Number.isFinite(anchor.ratio) && Number.isFinite(anchor.x))
    .sort((a, b) => a.ratio - b.ratio || a.x - b.x)
    .reduce((acc, anchor) => {
      const previous = acc[acc.length - 1];
      if (previous && Math.abs(previous.ratio - anchor.ratio) < 1e-6) {
        acc[acc.length - 1] = previous.synthetic && !anchor.synthetic ? anchor : previous;
        return acc;
      }
      acc.push(anchor);
      return acc;
    }, [] as GhostOnsetAnchor[]);

  const useCenteredFallbackGrid = dedupedAnchors.length === 0 && slotDuration > 0;

  const baseGridAnchors: GhostOnsetAnchor[] = [];
  const baseGridStep = slotDuration > 0 ? slotDuration : measureDuration;
  for (let ratio = segmentStartRatio; ratio <= segmentEndRatio + 1e-6; ratio += baseGridStep) {
    const clampedRatio = clamp(ratio, segmentStartRatio, segmentEndRatio);
    const x = overlayStartX + ((overlayEndX - overlayStartX) * (measureDuration > 0 ? (clampedRatio / measureDuration) : 0));
    baseGridAnchors.push({ ratio: clampedRatio, x, synthetic: true });
  }
  if (baseGridAnchors.length === 0 || Math.abs(baseGridAnchors[baseGridAnchors.length - 1]!.ratio - segmentEndRatio) > 1e-6) {
    baseGridAnchors.push({
      ratio: segmentEndRatio,
      x: overlayStartX + ((overlayEndX - overlayStartX) * (measureDuration > 0 ? (segmentEndRatio / measureDuration) : 0)),
      synthetic: true,
    });
  }

  const estimateStartX = (() => {
    if (dedupedAnchors.length >= 2) {
      const first = dedupedAnchors[0]!;
      const second = dedupedAnchors[1]!;
      return interpolateLinear(first.ratio, first.x, second.ratio, second.x, segmentStartRatio);
    }
    if (dedupedAnchors.length === 1) {
      const only = dedupedAnchors[0]!;
      const startTrustThreshold = overlayStartX + ((overlayEndX - overlayStartX) * 0.2);
      if (only.ratio <= segmentStartRatio + (slotDuration / 2) && only.x <= startTrustThreshold) return only.x;
    }
    return overlayStartX + ((overlayEndX - overlayStartX) * (measureDuration > 0 ? (segmentStartRatio / measureDuration) : 0));
  })();

  const estimateEndX = (() => {
    if (dedupedAnchors.length >= 2) {
      const penultimate = dedupedAnchors[dedupedAnchors.length - 2]!;
      const last = dedupedAnchors[dedupedAnchors.length - 1]!;
      return interpolateLinear(penultimate.ratio, penultimate.x, last.ratio, last.x, segmentEndRatio);
    }
    return overlayStartX + ((overlayEndX - overlayStartX) * (measureDuration > 0 ? (segmentEndRatio / measureDuration) : 0));
  })();

  const anchors: GhostOnsetAnchor[] = [
    { ratio: segmentStartRatio, x: clamp(estimateStartX, overlayStartX, overlayEndX), synthetic: true },
    ...baseGridAnchors.filter((anchor) => anchor.ratio > segmentStartRatio && anchor.ratio < segmentEndRatio),
    ...dedupedAnchors.filter((anchor) => anchor.ratio > segmentStartRatio && anchor.ratio < segmentEndRatio),
    { ratio: segmentEndRatio, x: clamp(estimateEndX, overlayStartX, overlayEndX), synthetic: true },
  ].sort((a, b) => a.ratio - b.ratio || a.x - b.x).reduce((acc, anchor) => {
    const previous = acc[acc.length - 1];
    if (previous && Math.abs(previous.ratio - anchor.ratio) < 1e-6) {
      acc[acc.length - 1] = previous.synthetic && !anchor.synthetic ? anchor : previous;
      return acc;
    }
    acc.push(anchor);
    return acc;
  }, [] as GhostOnsetAnchor[]);

  const maxStart = Math.max(segmentEndRatio - slotDuration, segmentStartRatio);
  const centeredGridPoints = useCenteredFallbackGrid
    ? (() => {
        const points: Array<{ ratio: number; x: number }> = [];
        const interiorWidth = Math.max(overlayEndX - overlayStartX, 1);
        const slotCount = Math.max(1, Math.round(((maxStart - segmentStartRatio) / slotDuration) + 1));
        const slotWidthPx = interiorWidth / slotCount;
        for (let index = 0; index < slotCount; index += 1) {
          const ratio = clamp(segmentStartRatio + (index * slotDuration), segmentStartRatio, maxStart);
          const x = overlayStartX + (slotWidthPx * (index + 0.5));
          points.push({ ratio, x });
        }
        return points;
      })()
    : [];

  const xFromRatio = (ratio: number): number => {
    const clampedRatio = clamp(ratio, segmentStartRatio, segmentEndRatio);
    if (centeredGridPoints.length > 0) {
      const nearest = centeredGridPoints.reduce((best, point) => (
        Math.abs(point.ratio - clampedRatio) < Math.abs(best.ratio - clampedRatio) ? point : best
      ), centeredGridPoints[0]!);
      return nearest.x;
    }
    const nextIndex = anchors.findIndex((anchor) => anchor.ratio >= clampedRatio);
    if (nextIndex <= 0) return anchors[0]!.x;
    const prev = anchors[nextIndex - 1]!;
    const next = anchors[nextIndex] ?? anchors[anchors.length - 1]!;
    return interpolateLinear(prev.ratio, prev.x, next.ratio, next.x, clampedRatio);
  };

  const ratioFromX = (x: number): number => {
    const clampedX = clamp(x, overlayStartX, overlayEndX);
    if (centeredGridPoints.length > 0) {
      const nearest = centeredGridPoints.reduce((best, point) => (
        Math.abs(point.x - clampedX) < Math.abs(best.x - clampedX) ? point : best
      ), centeredGridPoints[0]!);
      return nearest.ratio;
    }
    const nextIndex = anchors.findIndex((anchor) => anchor.x >= clampedX);
    if (nextIndex <= 0) return anchors[0]!.ratio;
    const prev = anchors[nextIndex - 1]!;
    const next = anchors[nextIndex] ?? anchors[anchors.length - 1]!;
    return clamp(interpolateLinear(prev.x, prev.ratio, next.x, next.ratio, clampedX), segmentStartRatio, segmentEndRatio);
  };
  const snapRatio = (x: number): number => {
    const rawRatio = ratioFromX(x);
    const candidates = new Set<number>();
    const safeSlotDuration = slotDuration > 0 ? slotDuration : measureDuration;
    for (let ratio = 0; ratio <= maxStart + 1e-6; ratio += safeSlotDuration) {
      candidates.add(Number(clamp(ratio, segmentStartRatio, maxStart).toFixed(6)));
    }
    for (const anchor of dedupedAnchors) {
      candidates.add(Number(clamp(anchor.ratio, segmentStartRatio, maxStart).toFixed(6)));
    }
    let bestRatio = 0;
    let bestScore = Number.POSITIVE_INFINITY;
    for (const candidate of candidates) {
      const candidateX = xFromRatio(candidate);
      const score = Math.abs(candidateX - x) + Math.abs(candidate - rawRatio) * 6;
      if (score < bestScore) {
        bestScore = score;
        bestRatio = candidate;
      }
    }
    return clamp(bestRatio, segmentStartRatio, maxStart);
  };

  return {
    ratioFromX,
    xFromRatio,
    snapRatio,
    snapX: (x: number) => xFromRatio(snapRatio(x)),
  };
}

function resolveGhostContentInsets(
  overlay: Pick<RenderedMeasureLayoutOverlay, 'measureNumber' | 'breakBefore' | 'domRect'>,
  onsetAnchors: GhostOnsetAnchor[],
) {
  if (onsetAnchors.length > 0) return { left: 0, right: 0 };

  return { left: 0, right: 0 };
}

export function resolveMinimumVisibleGhostX(
  overlay: Pick<RenderedMeasureLayoutOverlay, 'measureNumber' | 'breakBefore' | 'domRect'>,
  onsetAnchors: GhostOnsetAnchor[],
) {
  if (!(overlay.measureNumber === 1 || overlay.breakBefore)) return null;
  const earliestPitchedAnchorX = onsetAnchors
    .filter((anchor) => !anchor.isRest)
    .reduce<number | null>((best, anchor) => (
      best == null || anchor.x < best ? anchor.x : best
    ), null);
  return earliestPitchedAnchorX == null
    ? null
    : Math.max(overlay.domRect.x, earliestPitchedAnchorX - 9);
}

export function resolveVisibleGhostSnapX(input: {
  snappedX: number;
  minimumVisibleX?: number | null;
  synthetic?: boolean | null;
}) {
  return input.snappedX;
}

// A diatonic step is half a staff-line distance — single-digit pixels at any
// sane zoom. Chord members share one rendered glyph, so their bbox-derived
// sample pairs can fake enormous per-step gaps; those candidates must never
// reach the median or the whole staff collapses onto the sampled pitches.
const MIN_PLAUSIBLE_PITCH_STEP_PX = 1.5;
const MAX_PLAUSIBLE_PITCH_STEP_PX = 24;

function collectPitchStepCandidates(sorted: Array<{ index: number; y: number }>) {
  const stepCandidates: number[] = [];
  for (let index = 1; index < sorted.length; index += 1) {
    const previous = sorted[index - 1]!;
    const current = sorted[index]!;
    const deltaIndex = current.index - previous.index;
    const deltaY = Math.abs(current.y - previous.y);
    if (deltaIndex > 0 && deltaY > 0.5) {
      const candidate = deltaY / deltaIndex;
      if (candidate >= MIN_PLAUSIBLE_PITCH_STEP_PX && candidate <= MAX_PLAUSIBLE_PITCH_STEP_PX) {
        stepCandidates.push(candidate);
      }
    }
  }
  return stepCandidates;
}

export function quantizeGhostPitchIndex(
  pointerY: number,
  fallbackIndex: number,
  fallbackY: number,
  samples: Array<{ index: number; y: number }>,
) {
  const sorted = [...samples]
    .filter((sample) => Number.isFinite(sample.index) && Number.isFinite(sample.y))
    .sort((a, b) => a.index - b.index || a.y - b.y);
  const stepCandidates = collectPitchStepCandidates(sorted);

  const stepPx = Math.max(median(stepCandidates) ?? 0, 4);
  const interceptCandidates = sorted.map((sample) => sample.y + stepPx * sample.index);
  const intercept = median(interceptCandidates) ?? (fallbackY + stepPx * fallbackIndex);
  const rawTargetIndex = Math.round((intercept - pointerY) / stepPx);
  const targetIndex = clamp(rawTargetIndex, 0, 84);
  const snappedY = intercept - stepPx * targetIndex;

  return { rawTargetIndex, targetIndex, snappedY, stepPx, intercept };
}

function filterPitchCalibrationEntries<T extends { index: number; y: number }>(samples: T[]) {
  if (samples.length <= 2) return samples;
  const sorted = [...samples]
    .filter((sample) => Number.isFinite(sample.index) && Number.isFinite(sample.y))
    .sort((a, b) => a.index - b.index || a.y - b.y);
  if (sorted.length <= 2) return sorted;

  const stepCandidates = collectPitchStepCandidates(sorted);

  const stepPx = Math.max(median(stepCandidates) ?? 0, 4);
  const intercept = median(sorted.map((sample) => sample.y + stepPx * sample.index))
    ?? (sorted[0]!.y + stepPx * sorted[0]!.index);
  const tolerance = Math.max(stepPx * 1.5, 10);
  const filtered = sorted.filter((sample) => (
    Math.abs((sample.y + stepPx * sample.index) - intercept) <= tolerance
  ));
  return filtered.length >= 2 ? filtered : sorted;
}

function clampMouseEntryStaffStep(staffStep: number) {
  // Mouse note entry should stay within a practical ledger-line range.
  // Letting blank-system clicks extrapolate freely produced off-staff
  // pitches like F8 on later systems, which made the visible result look
  // like random rests instead of the clicked note.
  return clamp(staffStep, mouseEntryTopStaffStep(), mouseEntryBottomStaffStep(5));
}

function isMouseEntryStaffStepVisible(staffStep: number, lineCount: number) {
  const topLedgerLimit = mouseEntryTopStaffStep();
  const bottomLedgerLimit = Math.max(mouseEntryBottomStaffStep(lineCount), 4);
  return staffStep >= topLedgerLimit && staffStep <= bottomLedgerLimit;
}

export function resolveGhostPitchFromCalibration(input: {
  pointerY: number;
  clef: Clef;
  fallbackStaffStep: number;
  fallbackSnappedY: number;
  samples: Array<{ index: number; y: number }>;
}) {
  const fallbackPitch = resolveStaffStepPitch(input.fallbackStaffStep, input.clef);
  const fallbackIndex = diatonicPitchIndex(fallbackPitch.step, fallbackPitch.octave);
  const samples = filterPitchCalibrationEntries(input.samples);

  if (samples.length < 2) {
    return {
      targetPitch: fallbackPitch,
      snappedY: input.fallbackSnappedY,
      staffStep: input.fallbackStaffStep,
      usedCalibration: false,
    };
  }

  const quantized = quantizeGhostPitchIndex(
    input.pointerY,
    fallbackIndex,
    input.fallbackSnappedY,
    samples,
  );
  const resolved = pitchFromDiatonicIndex(quantized.targetIndex);
  const staffStep = clamp(topLineDiatonicIndex(input.clef) - quantized.targetIndex, -40, 40);

  return {
    targetPitch: {
      step: resolved.step,
      octave: resolved.octave,
      diatonicIndex: quantized.targetIndex,
    },
    snappedY: quantized.snappedY,
    staffStep,
    usedCalibration: true,
  };
}

export function constrainMouseEntryPitchResolution(input: {
  resolution: ReturnType<typeof resolveGhostPitchFromCalibration>;
  clef: Clef;
  fallbackStaffStep: number;
  fallbackSnappedY: number;
  lineCount: number;
}) {
  if (isMouseEntryStaffStepVisible(input.resolution.staffStep, input.lineCount)) {
    return input.resolution;
  }

  const staffStep = clampMouseEntryStaffStep(input.fallbackStaffStep);
  return {
    targetPitch: resolveStaffStepPitch(staffStep, input.clef),
    snappedY: input.fallbackSnappedY,
    staffStep,
    usedCalibration: false,
  };
}

function lowerEmptyBassRestPitchResolution(
  resolution: ReturnType<typeof resolveGhostPitchFromCalibration>,
  clef: Clef,
  staffSteps = 7,
  lineDistanceDom?: number,
): ReturnType<typeof resolveGhostPitchFromCalibration> {
  if (clef.sign !== 'F') return resolution;
  const staffStep = resolution.staffStep + staffSteps;
  const yOffset = Number.isFinite(lineDistanceDom) && (lineDistanceDom ?? 0) > 0
    ? staffSteps * ((lineDistanceDom ?? 0) / 2)
    : 0;
  return {
    ...resolution,
    targetPitch: resolveStaffStepPitch(staffStep, clef),
    staffStep,
    snappedY: resolution.snappedY + yOffset,
  };
}

function resolveRestMeasureOverlayPitch(input: {
  clef: Clef;
  overlay: RenderedMeasureLayoutOverlay;
  pointerY: number;
}): ReturnType<typeof resolveGhostPitchFromCalibration> | null {
  const height = Math.max(input.overlay.domRect.height, 1);
  const ratio = (input.pointerY - input.overlay.domRect.y) / height;
  if (ratio < -0.2 || ratio > 1.8) return null;

  const anchor = input.clef.sign === 'F'
    ? { step: 'C', octave: 3, ratio: 0.62 }
    : { step: 'C', octave: 4, ratio: 0.90 };
  const stepRatio = input.clef.sign === 'F' ? 0.08 : 0.07;
  const anchorIndex = diatonicPitchIndex(anchor.step, anchor.octave);
  const targetIndex = Math.round(anchorIndex + ((anchor.ratio - ratio) / stepRatio));
  const resolved = pitchFromDiatonicIndex(targetIndex);
  const staffStep = clamp(topLineDiatonicIndex(input.clef) - targetIndex, -40, 40);
  if (!isMouseEntryStaffStepVisible(staffStep, 5)) return null;

  return {
    targetPitch: {
      step: resolved.step,
      octave: resolved.octave,
      diatonicIndex: targetIndex,
    },
    snappedY: input.overlay.domRect.y + (height * (anchor.ratio - ((targetIndex - anchorIndex) * stepRatio))),
    staffStep,
    usedCalibration: false,
  };
}

function buildGhostPitchCalibrationSamples(
  entries: IndexedRenderedNote[],
  containerRect: DOMRect | null,
) {
  return entries
    .filter((entry) => !entry.semantic.isRest)
    .map((entry) => ({
      index: diatonicPitchIndex(entry.semantic.step, entry.semantic.octave),
      y: getRenderedPitchCenter(entry.rendered, containerRect).y,
    }));
}

function compareLaneNotes(a: SelectedNote, b: SelectedNote) {
  return a.measureNumber - b.measureNumber
    || noteTimestampValue(a) - noteTimestampValue(b)
    || a.staffIndex - b.staffIndex
    || a.voiceId - b.voiceId
    || a.step.localeCompare(b.step)
    || a.octave - b.octave
    || a.alter - b.alter;
}

function sameLane(a: SelectedNote, b: SelectedNote) {
  if (a.staffIndex !== b.staffIndex) return false;
  if (a.voiceId !== b.voiceId) return false;
  if (a.corePartId && b.corePartId) return a.corePartId === b.corePartId;
  return true;
}

function buildSemanticLane(coreDocument: ScoreDocumentModel | null, target: SelectedNote): SelectedNote[] {
  if (!coreDocument) return [];
  const notes: SelectedNote[] = [];
  for (const part of coreDocument.score.parts) {
    if (target.corePartId && part.id !== target.corePartId && part.sourcePartId !== target.corePartId) continue;
    for (const staff of part.staves) {
      if (staff.staffIndex !== target.staffIndex) continue;
      for (const measure of staff.measures) {
        const voice = measure.voices.find((entry) => entry.voiceId === target.voiceId);
        if (!voice) continue;
        for (const event of voice.events) {
          notes.push({
            coreEntityId: event.id,
            coreVoiceId: voice.id,
            coreMeasureId: measure.id,
            corePartId: part.id,
            measureNumber: event.measureNumber,
            staffIndex: event.staffIndex,
            voiceId: event.voiceId,
            timestampNum: event.timestampNum,
            timestampDen: event.timestampDen,
            step: event.kind === 'note' ? event.pitch.step : 'C',
            octave: event.kind === 'note' ? event.pitch.octave : 4,
            alter: event.kind === 'note' ? event.pitch.alter : 0,
            isRest: event.kind === 'rest',
            durationType: event.durationType,
            isDotted: event.isDotted,
            graphicalNote: null,
          });
        }
      }
    }
  }
  return notes.sort(compareLaneNotes);
}

export function findRenderedSelectionTarget(
  target: SelectedNote,
  renderedNotes: RenderedNote[],
  coreDocument: ScoreDocumentModel | null,
): RenderedNote | null {
  const direct = renderedNotes.find((entry) => bridgeSelectedNoteEquals(entry.note, target));
  if (direct) return direct;

  const sameMeasureVoice = renderedNotes
    .filter((entry) => (
      entry.note.measureNumber === target.measureNumber
      && entry.note.staffIndex === target.staffIndex
      && entry.note.voiceId === target.voiceId
    ))
    .sort((a, b) => (
      compareLaneNotes(a.note, b.note)
      || a.domCenter.x - b.domCenter.x
      || a.domCenter.y - b.domCenter.y
    ));

  const exactTimestamp = sameMeasureVoice.filter((entry) => timestampsEqual(
    entry.note.timestampNum,
    entry.note.timestampDen,
    target.timestampNum,
    target.timestampDen,
  ));
  const exactPitch = exactTimestamp.find((entry) => bridgeSelectedNoteEquals(entry.note, target));
  if (exactPitch) return exactPitch;

  if (exactTimestamp.length === 1 && target.isRest) return exactTimestamp[0] ?? null;

  if (exactTimestamp.length > 1 && !target.isRest) {
    const targetMidi = notePitchToMidi(target.step, target.alter, target.octave);
    return exactTimestamp.reduce<RenderedNote | null>((best, entry) => {
      if (entry.note.isRest) return best;
      if (!best) return entry;
      const bestMidi = notePitchToMidi(best.note.step, best.note.alter, best.note.octave);
      const entryMidi = notePitchToMidi(entry.note.step, entry.note.alter, entry.note.octave);
      return Math.abs(entryMidi - targetMidi) < Math.abs(bestMidi - targetMidi) ? entry : best;
    }, null);
  }

  const semanticLane = buildSemanticLane(coreDocument, target);
  if (semanticLane.length === 0) return null;
  const targetIndex = semanticLane.findIndex((entry) => (
    (target.coreEntityId && entry.coreEntityId === target.coreEntityId)
    || bridgeSelectedNoteEquals(entry, target)
  ));
  if (targetIndex < 0) return null;
  const renderedLane = renderedNotes
    .filter((entry) => (
      sameLane(entry.note, target)
      && entry.note.measureNumber >= target.measureNumber - 1
      && entry.note.measureNumber <= target.measureNumber + 1
    ))
    .sort((a, b) => (
      compareLaneNotes(a.note, b.note)
      || a.domCenter.x - b.domCenter.x
      || a.domCenter.y - b.domCenter.y
    ));
  const fallback = renderedLane[targetIndex] ?? null;
  if (!fallback) return null;
  if (fallback.note.isRest !== target.isRest) return null;
  if (target.isRest) return fallback;
  return bridgeSelectedNoteEquals(fallback.note, target) ? fallback : null;
}

function resolveSelectedHarmony(coreDocument: ScoreDocumentModel | null, selectedNote: SelectedNote | null) {
  if (!coreDocument || !selectedNote) return '';
  const part = coreDocument.score.parts.find((candidatePart) => (
    candidatePart.staves.some((staff) => (
      staff.staffIndex === selectedNote.staffIndex
      && staff.measures.some((candidate) => (
        candidate.measureNumber === selectedNote.measureNumber
        && (!selectedNote.coreMeasureId || candidate.id === selectedNote.coreMeasureId)
      ))
    ))
  ));
  const measure = part?.staves
    .flatMap((staff) => staff.measures)
    .find((candidate) => candidate.measureNumber === selectedNote.measureNumber);
  const harmony = measure?.directions.find((direction) => (
    direction.kind === 'harmony'
    && timestampsEqual(
      direction.timestampNum ?? 0,
      Math.max(direction.timestampDen ?? 1, 1),
      selectedNote.timestampNum,
      selectedNote.timestampDen,
    )
  ));
  return harmony?.value ?? '';
}

function selectedNoteKeyFor(note: SelectedNote | null) {
  return note
    ? [
        note.coreEntityId ?? 'no-entity',
        note.measureNumber,
        note.staffIndex,
        note.voiceId,
        note.timestampNum,
        note.timestampDen,
      ].join(':')
    : null;
}

function resolveHarmonyEditTarget(input: {
  coreDocument: ScoreDocumentModel | null;
  container: HTMLElement;
  measureOverlay: RenderedMeasureLayoutOverlay | null;
  measureOverlays: RenderedMeasureLayoutOverlay[];
  clickedVisualTargets: SVGElement[];
  visualText: string | null;
  domPoint: PointLike;
}): { note: SelectedNote; value: string; rect: RectLike } | null {
  const text = input.visualText?.trim();
  if (!input.coreDocument || !text) return null;
  const clickedTextElement = input.clickedVisualTargets.find((element) => element instanceof SVGTextElement);
  if (!clickedTextElement) return null;

  const textRect = clientRectToContainer(input.container, clickedTextElement.getBoundingClientRect());
  const overlay = input.measureOverlay
    ?? input.measureOverlays.find((candidate) => (
      input.domPoint.x >= candidate.domRect.x - 8
      && input.domPoint.x <= candidate.domRect.x + candidate.domRect.width + 8
      && input.domPoint.y >= candidate.domRect.y - 96
      && input.domPoint.y <= candidate.domRect.y + candidate.domRect.height + 32
    ))
    ?? null;
  if (!overlay) return null;

  for (const part of input.coreDocument.score.parts) {
    for (const staff of part.staves) {
      const measure = staff.measures.find((entry) => entry.id === overlay.measureId || entry.measureNumber === overlay.measureNumber);
      if (!measure) continue;
      const harmony = measure.directions.find((direction) => (
        direction.kind === 'harmony'
        && direction.value?.trim() === text
      ));
      if (!harmony) continue;

      const targetStaffIndex = harmony.staffIndex ?? staff.staffIndex;
      const timestampNum = harmony.timestampNum ?? 0;
      const timestampDen = Math.max(harmony.timestampDen ?? 1, 1);
      const candidateEvents: Array<{ event: TimedEvent; voiceId: string; score: number }> = [];
      for (const targetStaff of part.staves) {
        if (targetStaff.staffIndex !== targetStaffIndex) continue;
        const targetMeasure = targetStaff.measures.find((entry) => entry.measureNumber === measure.measureNumber);
        if (!targetMeasure) continue;
        for (const voice of targetMeasure.voices) {
          for (const event of voice.events) {
            if (!timestampsEqual(event.timestampNum, event.timestampDen, timestampNum, timestampDen)) continue;
            candidateEvents.push({
              event,
              voiceId: voice.id,
              score: (event.kind === 'note' ? 0 : 10) + Math.abs(event.staffIndex - targetStaffIndex),
            });
          }
        }
      }
      const candidate = candidateEvents.sort((left, right) => left.score - right.score)[0];
      if (!candidate) continue;
      return {
        note: selectedNoteFromTimedEvent(candidate.event, candidate.voiceId, measure.id, part.id),
        value: harmony.value?.trim() ?? text,
        rect: textRect,
      };
    }
  }
  return null;
}

export function getVisibleMeasureSelectionIds(
  selectedMeasureIds: string[],
  selectedNote: SelectedNote | null,
  selectedNotes: SelectedNote[],
  noteInputMode = false,
) {
  if (noteInputMode) return [];
  if (selectedNote && selectedNotes.length <= 1) return [];
  return selectedMeasureIds;
}

function isSingleOnsetSelection(notes: SelectedNote[]) {
  if (notes.length <= 1) return false;
  const first = notes[0];
  if (!first) return false;
  return notes.every((note) => (
    note.measureNumber === first.measureNumber
    && note.staffIndex === first.staffIndex
    && (!first.coreMeasureId || !note.coreMeasureId || note.coreMeasureId === first.coreMeasureId)
    && (!first.corePartId || !note.corePartId || note.corePartId === first.corePartId)
    && timestampsEqual(note.timestampNum, note.timestampDen, first.timestampNum, first.timestampDen)
  ));
}

export function resolveGhostPreviewX(input: {
  snappedPointX?: number | null;
  intentAnchorX?: number | null;
  fallbackX: number;
  placementMode: GhostPlacementMode;
}) {
  if ((input.placementMode === 'chord' || input.placementMode === 'replace') && input.intentAnchorX != null) {
    return input.intentAnchorX;
  }
  if (input.snappedPointX != null) {
    return input.snappedPointX;
  }
  if (input.intentAnchorX != null) {
    return input.intentAnchorX;
  }
  return input.fallbackX;
}

function resolveGhostVisiblePlacementX(input: {
  snappedPoint?: Pick<RenderedGhostGridPoint, 'domX'> & Partial<Pick<RenderedGhostGridPoint, 'synthetic'>> | null;
  placementIntent: {
    mode: GhostPlacementMode;
    anchor: Pick<GhostOnsetAnchor, 'x' | 'isRest'> | null;
  };
  fallbackX: number;
}) {
  const realRestAnchor = input.placementIntent.anchor?.isRest && input.snappedPoint?.synthetic !== true
    ? input.placementIntent.anchor
    : null;
  const noteheadAnchor = input.placementIntent.anchor?.isRest === false
    ? input.placementIntent.anchor
    : null;
  return resolveGhostPreviewX({
    snappedPointX: input.snappedPoint?.domX,
    intentAnchorX: realRestAnchor?.x ?? noteheadAnchor?.x ?? null,
    fallbackX: input.fallbackX,
    placementMode: input.placementIntent.mode,
  });
}

export function resolveGhostCommittedPlacement(input: {
  snappedPoint?: Pick<RenderedGhostGridPoint, 'domX' | 'ratio' | 'voiceId' | 'timestampNum' | 'timestampDen'> & Partial<Pick<RenderedGhostGridPoint, 'synthetic'>> | null;
  placementIntent: {
    mode: GhostPlacementMode;
    anchor: Pick<GhostOnsetAnchor, 'x' | 'ratio' | 'voiceId' | 'timestampNum' | 'timestampDen' | 'isRest'> | null;
    targetVoiceId: number | null;
  };
  quantizedRatio: number;
  fallbackX: number;
  fallbackVoiceId: number;
}) {
  const restPlacementAnchor = input.placementIntent.anchor?.isRest && input.snappedPoint?.synthetic !== true
    ? input.placementIntent.anchor
    : null;
  const fallbackPlacementAnchor = input.placementIntent.anchor;
  const snappedRatio = restPlacementAnchor?.ratio
    ?? input.snappedPoint?.ratio
    ?? fallbackPlacementAnchor?.ratio
    ?? input.quantizedRatio;
  const timestampDen = restPlacementAnchor?.timestampDen
    ?? input.snappedPoint?.timestampDen
    ?? fallbackPlacementAnchor?.timestampDen
    ?? 64;
  const timestampNum = restPlacementAnchor?.timestampNum
    ?? input.snappedPoint?.timestampNum
    ?? fallbackPlacementAnchor?.timestampNum
    ?? Math.round(snappedRatio * timestampDen);
  const snappedX = restPlacementAnchor?.x
    ?? input.snappedPoint?.domX
    ?? fallbackPlacementAnchor?.x
    ?? input.fallbackX;
  const voiceId = restPlacementAnchor
    ? input.placementIntent.targetVoiceId
      ?? restPlacementAnchor.voiceId
      ?? input.snappedPoint?.voiceId
      ?? fallbackPlacementAnchor?.voiceId
      ?? input.fallbackVoiceId
    : input.placementIntent.mode === 'insert'
      ? input.placementIntent.targetVoiceId
        ?? input.fallbackVoiceId
        ?? input.snappedPoint?.voiceId
        ?? fallbackPlacementAnchor?.voiceId
      : input.snappedPoint?.voiceId
        ?? fallbackPlacementAnchor?.voiceId
        ?? input.placementIntent.targetVoiceId
        ?? input.fallbackVoiceId;

  return {
    snappedRatio,
    timestampNum,
    timestampDen,
    snappedX,
    voiceId,
  };
}

export function resolveNoteInputCommitTarget(
  visibleGhostTarget: GhostNoteTarget | null,
  resolvedGhostTarget: GhostNoteTarget | null,
) {
  const alignVisibleCommitTarget = (target: GhostNoteTarget) => {
    const canonicalSnapX = target.resolvedTarget?.domX != null && Number.isFinite(target.resolvedTarget.domX)
      ? target.resolvedTarget.domX
      : target.domCenter.x;
    return alignGhostTargetToCanonicalSnap(target, {
      canonicalSnapX,
      resolvedTarget: target.resolvedTarget ?? null,
      pointerX: target.pointerX ?? canonicalSnapX,
      snapSource: target.snapResolution?.effectiveSnap?.source ?? 'visible-ghost-commit',
      resolver: target.snapResolution?.resolver ?? 'visible-ghost-commit',
    });
  };

  if (visibleGhostTarget?.resolvedTarget) {
    // Clicking the rendered preview is a WYSIWYG commit. Re-resolving the
    // pointer over an existing chord can land on the notehead underneath the
    // pointer-transparent ghost and silently replace the displayed pitch.
    // Keep every visible semantic field locked to the DOM ghost instead.
    return alignVisibleCommitTarget({
      ...visibleGhostTarget,
      resolvedTarget: {
        ...visibleGhostTarget.resolvedTarget,
        measureId: visibleGhostTarget.measureId,
        corePartId: visibleGhostTarget.corePartId,
        measureNumber: visibleGhostTarget.measureNumber,
        staffIndex: visibleGhostTarget.staffIndex,
        voiceId: visibleGhostTarget.voiceId,
        timestampNum: visibleGhostTarget.timestampNum,
        timestampDen: visibleGhostTarget.timestampDen,
        ratio: visibleGhostTarget.timestampNum / Math.max(visibleGhostTarget.timestampDen, 1),
        domX: visibleGhostTarget.domCenter.x,
        step: visibleGhostTarget.step,
        octave: visibleGhostTarget.octave,
        alter: visibleGhostTarget.alter,
        diagnostics: [
          ...visibleGhostTarget.resolvedTarget.diagnostics,
          'visible-ghost-commit-locked',
          'visible-ghost-pitch-locked',
        ],
      },
    });
  }
  return resolvedGhostTarget;
}

export function resolvePointerCommitGhostTargets(
  primaryResolvedGhostTarget: GhostNoteTarget | null,
  clickedRestResolvedGhostTarget: GhostNoteTarget | null,
  resolvedGhostCandidate: GhostNoteTarget | null,
  clickedRestGhostCandidate: GhostNoteTarget | null,
) {
  const primaryResolvedBeatsClickedRest = Boolean(
    primaryResolvedGhostTarget?.resolvedTarget
    && clickedRestResolvedGhostTarget?.resolvedTarget
    && !timestampsEqual(
      primaryResolvedGhostTarget.resolvedTarget.timestampNum,
      primaryResolvedGhostTarget.resolvedTarget.timestampDen,
      clickedRestResolvedGhostTarget.resolvedTarget.timestampNum,
      clickedRestResolvedGhostTarget.resolvedTarget.timestampDen,
    )
  );
  const resolvedGhostTarget = clickedRestResolvedGhostTarget?.resolvedTarget && !primaryResolvedBeatsClickedRest
    ? clickedRestResolvedGhostTarget
    : primaryResolvedGhostTarget;
  const commitGhostCandidate = clickedRestResolvedGhostTarget?.resolvedTarget && !primaryResolvedBeatsClickedRest
    ? clickedRestGhostCandidate
    : resolvedGhostCandidate;
  return {
    primaryResolvedBeatsClickedRest,
    resolvedGhostTarget,
    commitGhostCandidate,
  };
}

function applyPointerModifiersToGhostTarget(
  target: GhostNoteTarget | null,
  event: { shiftKey: boolean; altKey: boolean },
) {
  const resolved = applyGhostPlacementModifiers(target, {
    shiftKey: event.shiftKey,
    altKey: event.altKey,
  });
  if (!resolved) return null;
  return {
    ...resolved,
    placementLockedByModifier: Boolean(event.shiftKey || event.altKey),
  };
}

function applyEntryModeToGhostTarget(
  target: GhostNoteTarget | null,
  entryMode: NoteEntryMode,
  chordInputMode: boolean,
  selectedVoice: number,
  selectedNote?: SelectedNote | null,
  noteInputAnchor?: SelectedNote | null,
  recentCommitTarget?: PointerEntryLocator | null,
) {
  if (target && target.voiceId !== selectedVoice) {
    target = {
      ...target,
      voiceId: selectedVoice,
      placementMode: 'replace',
      placementAnchorIsRest: true,
      semanticAnchorIsRest: true,
      allowCrossVoiceRenderedSnap: true,
      resolvedTarget: undefined,
    };
  }
  return resolveMuseScorePointerEntryMode(target, {
    entryMode,
    chordInputMode,
    selectedNote,
    noteInputAnchor,
    recentCommitTarget,
  });
}

function retargetGhostToDirectCrossVoiceNotehead(
  target: GhostNoteTarget | null,
  directNote: SelectedNote | null | undefined,
  selectedVoice: number,
): GhostNoteTarget | null {
  if (!target || !directNote || directNote.isRest || directNote.voiceId === selectedVoice) return target;
  return {
    ...target,
    voiceId: selectedVoice,
    timestampNum: directNote.timestampNum,
    timestampDen: directNote.timestampDen,
    step: directNote.step ?? target.step,
    octave: directNote.octave ?? target.octave,
    alter: directNote.alter ?? target.alter,
    placementMode: 'insert',
    placementAnchorIsRest: false,
    semanticAnchorIsRest: false,
    allowCrossVoiceRenderedSnap: true,
    snapResolution: target.snapResolution
      ? {
          ...target.snapResolution,
          placementIntent: {
            ...target.snapResolution.placementIntent,
            mode: 'insert',
            targetVoiceId: selectedVoice,
          },
        }
      : target.snapResolution,
  };
}

export function bindResolvedEditTargetToGhost(
  candidate: GhostNoteTarget | null,
  editMap: ReturnType<typeof createEmptyInteractiveEditMap>,
  coreDocument: ScoreDocumentModel | null,
  selectedDuration: Props['selectedDuration'],
  isDotted: boolean,
) {
  if (!candidate) return null;

  const durationType = INPUT_DURATION_TO_TYPE[selectedDuration] ?? 'quarter';
  const placementModes: GhostPlacementMode[] = candidate.placementLockedByModifier
    ? [candidate.placementMode]
    : candidate.placementMode === 'chord'
      ? ['chord', 'replace', 'insert']
      : candidate.placementMode === 'replace'
        ? ['replace', 'chord', 'insert']
        : ['insert', 'replace', 'chord'];

  const inspectTargetWithMeasureNumberFallback = (target: ResolvedEditTarget) => {
    const inspected = inspectResolvedEditTarget({
      coreDocument,
      target,
      durationType,
      isDotted,
    });
    if (inspected.target || !target.measureId) return inspected;
    const retry = inspectResolvedEditTarget({
      coreDocument,
      target: {
        ...target,
        measureId: null,
        corePartId: null,
        diagnostics: [...target.diagnostics, 'validation-retry:measure-number-staff'],
      },
      durationType,
      isDotted,
    });
    return retry.target ? retry : inspected;
  };

  let resolvedTarget: ResolvedEditTarget | null = null;
  const pointerReferenceX = typeof candidate.pointerX === 'number' && Number.isFinite(candidate.pointerX)
    ? candidate.pointerX
    : candidate.domCenter.x;
  const semanticAnchorLocked = Boolean(candidate.semanticAnchorLabel || candidate.semanticAnchorRect);
  const candidateResolvedTarget = candidate.resolvedTarget
    ? {
        ...candidate.resolvedTarget,
        mode: candidate.placementMode,
        diagnostics: candidate.resolvedTarget.mode === candidate.placementMode
          ? candidate.resolvedTarget.diagnostics
          : [
              ...candidate.resolvedTarget.diagnostics,
              `placement-mode-synced:${candidate.resolvedTarget.mode}->${candidate.placementMode}`,
            ],
      }
    : null;
  if (
    candidateResolvedTarget
    && (
      candidateResolvedTarget.diagnostics.includes('rest-only-quantized-internal-slot')
      || timestampsEqual(
        candidateResolvedTarget.timestampNum,
        candidateResolvedTarget.timestampDen,
        candidate.timestampNum,
        candidate.timestampDen,
      )
    )
  ) {
    const inspected = inspectTargetWithMeasureNumberFallback(candidateResolvedTarget);
    if (inspected.target) {
      resolvedTarget = inspected.target;
    } else if (
      candidate.placementMode === 'chord'
      && candidate.placementModePromotedByRecentCommit
      && inspected.rejectionReason === 'chord-missing-anchor'
    ) {
      resolvedTarget = {
        ...candidateResolvedTarget,
        mode: 'chord',
        existingEventKind: 'note',
        existingEventStartsAtTarget: true,
        diagnostics: [
          ...inspected.diagnostics,
          'validation:chord-recent-commit-anchor',
        ],
      };
    } else if (
      inspected.rejectionReason === 'target-inside-rest'
      && candidateResolvedTarget.mode === 'insert'
      && candidateResolvedTarget.diagnostics.includes('rest-only-quantized-internal-slot')
      && !inspected.diagnostics.includes('validation:full-measure-rest-internal-slot-rejected')
      && ghostHasTraceQuantizedRestFallbackSnap({
        timestampNum: candidateResolvedTarget.timestampNum,
        timestampDen: candidateResolvedTarget.timestampDen,
        voiceId: candidateResolvedTarget.voiceId,
        resolvedTarget: candidateResolvedTarget,
        snapResolution: candidate.snapResolution,
      })
    ) {
      resolvedTarget = {
        ...candidateResolvedTarget,
        mode: 'insert',
        allowOccupiedInsert: true,
        preserveOverflow: true,
        existingEventKind: 'rest',
        existingEventStartsAtTarget: false,
        diagnostics: [
          ...candidateResolvedTarget.diagnostics,
          'rest-only-internal-slot-preserved',
        ],
      };
    }
  }
  for (const mode of placementModes) {
    if (resolvedTarget) break;
    const gridTarget = resolvePointerEditTarget({
      editMap,
      candidate: {
        measureId: candidate.measureId,
        corePartId: candidate.corePartId,
        measureNumber: candidate.measureNumber,
        staffIndex: candidate.staffIndex,
        voiceId: candidate.voiceId,
        timestampNum: candidate.timestampNum,
        timestampDen: candidate.timestampDen,
        domX: semanticAnchorLocked ? null : candidate.domCenter.x,
        mode,
        step: candidate.step,
        octave: candidate.octave,
        alter: candidate.alter,
        allowUnoccupiedVoice: Boolean(candidate.placementAnchorIsRest || candidate.semanticAnchorIsRest),
        preserveOverflow: mode === 'insert',
      },
    });
    if (!gridTarget) continue;

    const inspected = inspectTargetWithMeasureNumberFallback(gridTarget);
    if (inspected.target) {
      const timestampChanged = !timestampsEqual(
        inspected.target.timestampNum,
        inspected.target.timestampDen,
        candidate.timestampNum,
        candidate.timestampDen,
      );
      const targetDx = inspected.target.domX != null && Number.isFinite(inspected.target.domX)
        ? Math.abs(inspected.target.domX - pointerReferenceX)
        : 0;
      const ghostDx = inspected.target.domX != null && Number.isFinite(inspected.target.domX)
        ? Math.abs(inspected.target.domX - candidate.domCenter.x)
        : 0;
      if (timestampChanged && targetDx > 18) continue;
      if (timestampChanged && ghostDx > 40) continue;
      if (mode !== candidate.placementMode && targetDx > 32) continue;
      resolvedTarget = mode === candidate.placementMode
        ? inspected.target
        : {
            ...inspected.target,
            diagnostics: [
              ...inspected.target.diagnostics,
              `placement-fallback:${candidate.placementMode}->${mode}`,
            ],
          };
      break;
    }
  }
  if (!resolvedTarget) {
    const snap = candidate.snapResolution?.effectiveSnap
      ?? candidate.snapResolution?.quantizedFallbackSnap
      ?? null;
    const timestamp = normalizeFraction(candidate.timestampNum, Math.max(candidate.timestampDen, 1));
    const snapTimestamp = snap?.timestamp ?? null;
    const snapMatchesCandidate = snapTimestamp === `${timestamp.num}/${timestamp.den}`;
    const snapX = typeof snap?.x === 'number' && Number.isFinite(snap.x) ? snap.x : null;
    if (snapMatchesCandidate && snapX != null) {
      const snapSource = snap?.source ?? 'unknown';
      const fallbackTarget: ResolvedEditTarget = {
        source: 'pointer',
        mode: candidate.placementMode,
        measureId: candidate.measureId,
        corePartId: candidate.corePartId,
        measureNumber: candidate.measureNumber,
        staffIndex: candidate.staffIndex,
        voiceId: candidate.voiceId,
        timestampNum: timestamp.num,
        timestampDen: timestamp.den,
        ratio: fractionToNumber(timestamp),
        domX: snapX,
        allowOccupiedInsert: candidate.placementMode === 'insert',
        preserveOverflow: candidate.placementMode === 'insert',
        step: candidate.step,
        octave: candidate.octave,
        alter: candidate.alter,
        diagnostics: [`snap-evidenced-unmapped-ghost-slot:${snapSource}`],
      };
      const inspected = inspectTargetWithMeasureNumberFallback(fallbackTarget);
      if (inspected.target) {
        resolvedTarget = inspected.target;
      }
    }
  }
  if (!resolvedTarget) return null;

  const canonicalResolvedTarget = resolvedTarget;
  const resolvedDomX = canonicalResolvedTarget.domX != null && Number.isFinite(canonicalResolvedTarget.domX)
    ? canonicalResolvedTarget.domX
    : null;
  if (resolvedDomX == null) return null;

  return alignGhostTargetToCanonicalSnap({
    ...candidate,
    corePartId: canonicalResolvedTarget.corePartId,
    measureNumber: canonicalResolvedTarget.measureNumber,
    staffIndex: canonicalResolvedTarget.staffIndex,
    voiceId: canonicalResolvedTarget.voiceId,
    timestampNum: canonicalResolvedTarget.timestampNum,
    timestampDen: canonicalResolvedTarget.timestampDen,
    step: canonicalResolvedTarget.step,
    octave: canonicalResolvedTarget.octave,
    alter: canonicalResolvedTarget.alter,
    placementMode: canonicalResolvedTarget.mode,
    placementLockedByModifier: candidate.placementLockedByModifier,
    resolvedTarget: canonicalResolvedTarget,
  }, {
    canonicalSnapX: resolvedDomX,
    resolvedTarget: canonicalResolvedTarget,
    pointerX: pointerReferenceX,
    snapSource: candidate.snapResolution?.effectiveSnap?.source ?? 'resolved-edit-target',
    resolver: candidate.snapResolution?.resolver ?? 'resolved-edit-target',
  });
}

function findRenderedGhostPointForAnchor(
  renderedGhostGrid: RenderedGhostGrid | null | undefined,
  anchor: Pick<SelectedNote, 'coreMeasureId' | 'staffIndex' | 'voiceId' | 'timestampNum' | 'timestampDen' | 'isRest'> | null,
  pointerX?: number | null,
) {
  if (!renderedGhostGrid || !anchor?.coreMeasureId) return null;
  const hasPointerX = typeof pointerX === 'number' && Number.isFinite(pointerX);
  const staffPoints = filterSelectableRenderedGhostSnapPoints(
    getRenderedGhostStaffPoints(renderedGhostGrid, anchor.coreMeasureId, anchor.staffIndex),
  );
  const timestampCandidates = staffPoints.filter((point) => (
    timestampsEqual(point.timestampNum, point.timestampDen, anchor.timestampNum, anchor.timestampDen)
  ));
  const realStaffAnchors = staffPoints.filter((point) => !point.synthetic);
  const candidates = realStaffAnchors.length > 0
    ? timestampCandidates.filter((point) => !point.synthetic)
    : timestampCandidates;
  if (candidates.length === 0) return null;
  return candidates.sort((left, right) => (
    Number(left.voiceId !== anchor.voiceId) - Number(right.voiceId !== anchor.voiceId)
    || Number(Boolean(left.isRest) !== Boolean(anchor.isRest)) - Number(Boolean(right.isRest) !== Boolean(anchor.isRest))
    || Number(Boolean(left.synthetic)) - Number(Boolean(right.synthetic))
    || (hasPointerX ? Math.abs(left.domX - pointerX) - Math.abs(right.domX - pointerX) : 0)
    || left.domX - right.domX
    || left.id.localeCompare(right.id)
  ))[0] ?? null;
}

export function alignReplaceGhostToRenderedSnap(
  target: GhostNoteTarget | null,
  renderedGhostGrid: RenderedGhostGrid | null | undefined,
) {
  if (!target) return target;
  const preferredRestStatus = Boolean(target.placementAnchorIsRest ?? target.semanticAnchorIsRest ?? false);
  const directPoints = filterSelectableRenderedGhostSnapPoints(
    getRenderedGhostStaffPoints(renderedGhostGrid, target.measureId, target.staffIndex, { includeSynthetic: true }),
  );
  const fallbackPoints = directPoints.length > 0
    ? directPoints
    : filterSelectableRenderedGhostSnapPoints(
        [...(renderedGhostGrid?.byMeasureId.values() ?? [])]
          .filter((measure) => measure.measureNumber === target.measureNumber)
          .flatMap((measure) => measure.points)
          .filter((point) => (
            point.staffIndex === target.staffIndex
            && (target.systemIndex == null || point.systemIndex == null || point.systemIndex === target.systemIndex)
            && (!target.corePartId || !point.corePartId || point.corePartId === target.corePartId)
          )),
      );
  const snap = fallbackPoints
    .filter((point) => (
      point.voiceId === target.voiceId
      && timestampsEqual(point.timestampNum, point.timestampDen, target.timestampNum, target.timestampDen)
    ))
    .sort((left, right) => (
      Number(Boolean(left.isRest) !== preferredRestStatus) - Number(Boolean(right.isRest) !== preferredRestStatus)
      || Number(Boolean(left.synthetic)) - Number(Boolean(right.synthetic))
      || Math.abs(left.domX - target.domCenter.x) - Math.abs(right.domX - target.domCenter.x)
      || left.domX - right.domX
      || left.id.localeCompare(right.id)
    ))[0] ?? null;
  if (
    !snap
    || (
      Math.abs(snap.domX - target.domCenter.x) < 0.5
      && Math.abs(snap.domX - (target.previewLeft + target.noteheadCenterX)) < 0.5
      && (target.resolvedTarget?.domX == null || Math.abs(snap.domX - target.resolvedTarget.domX) < 0.5)
    )
  ) return target;

  const reboundResolvedTarget = target.resolvedTarget
    ? {
        ...target.resolvedTarget,
        measureId: snap.measureId,
        corePartId: snap.corePartId ?? target.resolvedTarget.corePartId ?? target.corePartId,
        measureNumber: snap.measureNumber,
        staffIndex: target.staffIndex,
        voiceId: snap.voiceId,
        timestampNum: snap.timestampNum,
        timestampDen: snap.timestampDen,
        ratio: snap.ratio,
        domX: snap.domX,
        diagnostics: [
          ...target.resolvedTarget.diagnostics,
          'rendered-snap-rebound',
        ],
      }
    : undefined;

  return alignGhostTargetToCanonicalSnap({
    ...target,
    measureId: snap.measureId,
    corePartId: snap.corePartId ?? target.corePartId,
    measureNumber: snap.measureNumber,
    pageIndex: snap.pageIndex ?? target.pageIndex,
    systemIndex: snap.systemIndex ?? target.systemIndex,
    timestampNum: snap.timestampNum,
    timestampDen: snap.timestampDen,
    voiceId: snap.voiceId,
    resolvedTarget: reboundResolvedTarget,
  }, {
    canonicalSnapX: snap.domX,
    resolvedTarget: reboundResolvedTarget,
    effectiveSnap: traceSnapCandidate(snap, {
      source: 'rendered-snap-rebound',
      pointerX: target.pointerX ?? snap.domX,
      ghostX: snap.domX,
    }),
    pointerX: target.pointerX ?? snap.domX,
    snapSource: 'rendered-snap-rebound',
    resolver: target.snapResolution?.resolver ?? 'rendered-snap-rebound',
  });
}

function normalizeSelectableRestChronology<T extends {
  domX?: number;
  ratio?: number;
  isRest?: boolean;
}>(points: T[]) {
  const finitePoints = points.filter((point) => (
    Number.isFinite(point.domX)
    && Number.isFinite(point.ratio)
  ));
  const ratios = [...new Set(finitePoints.map((point) => Math.round((point.ratio ?? 0) * 1_000_000) / 1_000_000))]
    .sort((left, right) => left - right);
  for (let index = 0; index < ratios.length - 1; index += 1) {
    const ratio = ratios[index]!;
    const current = finitePoints.filter((point) => Math.abs((point.ratio ?? 0) - ratio) <= 1e-6);
    if (current.some((point) => !point.isRest)) continue;
    const rests = current.filter((point) => point.isRest);
    if (rests.length === 0) continue;
    const later = finitePoints.filter((point) => (point.ratio ?? 0) > ratio + 1e-6);
    const nextX = Math.min(...later.map((point) => point.domX ?? Number.POSITIVE_INFINITY));
    if (!Number.isFinite(nextX)) continue;
    for (const rest of rests) {
      if ((rest.domX ?? 0) <= nextX - 4) continue;
      rest.domX = nextX - 4;
    }
  }
}

export function filterSelectableRenderedGhostSnapPoints<T extends {
  id?: string;
  synthetic?: boolean;
  domX?: number;
  ratio?: number;
  isRest?: boolean;
  voiceId?: number;
  timestampNum?: number;
  timestampDen?: number;
}>(points: readonly T[]): T[] {
  const selectable = points.filter((point) => {
    if (point.synthetic !== true) return true;
    return !points.some((candidate) => (
      candidate !== point
      && candidate.synthetic !== true
      && candidate.voiceId === point.voiceId
      && timestampsEqual(candidate.timestampNum ?? 0, candidate.timestampDen ?? 1, point.timestampNum ?? 0, point.timestampDen ?? 1)
    ));
  });
  const withoutSupersededCoreFallbacks = selectable.filter((point) => {
    if (typeof point.id !== 'string' || !point.id.startsWith('core:') || point.isRest === true) return true;
    return !selectable.some((candidate) => (
      candidate !== point
      && typeof candidate.id === 'string'
      && !candidate.id.startsWith('core:')
      && candidate.synthetic !== true
      && candidate.isRest !== true
      && candidate.voiceId === point.voiceId
      && timestampsEqual(candidate.timestampNum ?? 0, candidate.timestampDen ?? 1, point.timestampNum ?? 0, point.timestampDen ?? 1)
    ));
  });
  if (withoutSupersededCoreFallbacks.length === 0) return selectable;
  normalizeSelectableRestChronology(withoutSupersededCoreFallbacks);
  const byRhythmicUnit = new Map<string, T[]>();
  for (const point of withoutSupersededCoreFallbacks) {
    const timestamp = normalizeFraction(point.timestampNum ?? 0, Math.max(point.timestampDen ?? 1, 1));
    const key = `${timestamp.num}/${timestamp.den}`;
    const group = byRhythmicUnit.get(key) ?? [];
    group.push(point);
    byRhythmicUnit.set(key, group);
  }

  return [...byRhythmicUnit.values()].map((group) => (
    group
      .slice()
      .sort((left, right) => (
        Number(left.synthetic === true) - Number(right.synthetic === true)
        || Number(left.isRest === true) - Number(right.isRest === true)
        || Number(typeof left.id === 'string' && left.id.startsWith('core:')) - Number(typeof right.id === 'string' && right.id.startsWith('core:'))
        || (left.voiceId ?? 1) - (right.voiceId ?? 1)
        || (left.domX ?? Number.POSITIVE_INFINITY) - (right.domX ?? Number.POSITIVE_INFINITY)
        || String(left.id ?? '').localeCompare(String(right.id ?? ''))
      ))[0]!
  )).sort((left, right) => (
    (left.ratio ?? ((left.timestampNum ?? 0) / Math.max(left.timestampDen ?? 1, 1)))
    - (right.ratio ?? ((right.timestampNum ?? 0) / Math.max(right.timestampDen ?? 1, 1)))
    || (left.domX ?? 0) - (right.domX ?? 0)
    || String(left.id ?? '').localeCompare(String(right.id ?? ''))
  ));
}

function discardGhostTargetOffRenderedSnap(
  target: GhostNoteTarget | null,
  renderedGhostGrid: RenderedGhostGrid | null | undefined,
  tolerancePx = 7,
) {
  if (!target || target.placementMode === 'chord') return target;
  if (target.allowCrossVoiceRenderedSnap) return target;
  if (
    target.resolvedTarget?.diagnostics.includes('rest-only-quantized-internal-slot')
    && ghostHasTraceQuantizedRestFallbackSnap(target)
  ) {
    return target;
  }
  const staffPoints = filterSelectableRenderedGhostSnapPoints(
    getRenderedGhostStaffPoints(renderedGhostGrid, target.measureId, target.staffIndex, { includeSynthetic: true }),
  );
  const snapPoints = staffPoints.filter((point) => (
    timestampsEqual(point.timestampNum, point.timestampDen, target.timestampNum, target.timestampDen)
  ));
  if (staffPoints.length > 0 && snapPoints.length === 0) return null;
  if (snapPoints.length === 0) return target;
  const sameVoice = snapPoints.filter((point) => point.voiceId === target.voiceId);
  const candidates = sameVoice.length > 0 ? sameVoice : snapPoints;
  const nearest = candidates.reduce<(typeof candidates)[number] | null>((best, point) => {
    if (!best) return point;
    return Math.abs(point.domX - target.domCenter.x) < Math.abs(best.domX - target.domCenter.x) ? point : best;
  }, null);
  if (!nearest) return target;
  return Math.abs(nearest.domX - target.domCenter.x) <= tolerancePx ? target : null;
}

function findNextRenderedGhostPointForTarget(
  renderedGhostGrid: RenderedGhostGrid | null | undefined,
  target: Pick<GhostNoteTarget, 'measureId' | 'staffIndex' | 'voiceId' | 'timestampNum' | 'timestampDen'> | null,
) {
  if (!renderedGhostGrid || !target?.measureId) return null;
  const points = filterSelectableRenderedGhostSnapPoints(
    getRenderedGhostStaffPoints(renderedGhostGrid, target.measureId, target.staffIndex, { includeSynthetic: true }),
  );
  const currentValue = target.timestampNum / Math.max(target.timestampDen, 1);
  return points.find((point) => (
    point.voiceId === target.voiceId
    && ((point.timestampNum / Math.max(point.timestampDen, 1)) - currentValue) > 1e-6
  )) ?? points.find((point) => (
    ((point.timestampNum / Math.max(point.timestampDen, 1)) - currentValue) > 1e-6
  )) ?? null;
}

export function retargetGhostToAdvancedAnchor(input: {
  resolvedGhost: GhostNoteTarget | null;
  renderedGhostGrid: RenderedGhostGrid | null | undefined;
  pointerGhostAnchor: SelectedNote | null;
  pointerX: number;
  maxDistancePx?: number;
}) {
  const { resolvedGhost, renderedGhostGrid, pointerGhostAnchor, pointerX } = input;
  if (!pointerGhostAnchor || !resolvedGhost) return resolvedGhost;

  const anchorPoint = findRenderedGhostPointForAnchor(renderedGhostGrid, pointerGhostAnchor, pointerX);
  if (!anchorPoint) return resolvedGhost;
  if (
    anchorPoint.measureId !== resolvedGhost.measureId
    || anchorPoint.staffIndex !== resolvedGhost.staffIndex
    || anchorPoint.measureNumber !== resolvedGhost.measureNumber
  ) {
    return resolvedGhost;
  }
  const resolvedAlreadyTargetsAnotherSlot = !timestampsEqual(
    resolvedGhost.timestampNum,
    resolvedGhost.timestampDen,
    anchorPoint.timestampNum,
    anchorPoint.timestampDen,
  );
  if (resolvedAlreadyTargetsAnotherSlot) {
    const resolvedDx = Math.abs(resolvedGhost.domCenter.x - pointerX);
    const anchorDx = Math.abs(anchorPoint.domX - pointerX);
    if (resolvedDx + 2 < anchorDx) return resolvedGhost;
  }

  const maxDistancePx = Math.max(input.maxDistancePx ?? 112, 0);
  if (Math.abs(anchorPoint.domX - pointerX) > maxDistancePx) {
    return resolvedGhost;
  }

  const anchorIsRest = Boolean(pointerGhostAnchor.isRest || anchorPoint.isRest);
  return alignGhostTargetToCanonicalSnap({
    ...resolvedGhost,
    voiceId: anchorPoint.voiceId,
    timestampNum: anchorPoint.timestampNum,
    timestampDen: anchorPoint.timestampDen,
    noteheadCenterX: resolvedGhost.noteheadCenterX,
    ledgerLines: resolvedGhost.ledgerLines,
    pointerX,
    placementMode: 'replace' as const,
    placementAnchorIsRest: anchorIsRest,
    semanticAnchorIsRest: anchorIsRest,
    semanticAnchorLabel: resolvedGhost.semanticAnchorLabel ?? semanticAnchorLabel(pointerGhostAnchor),
    resolvedTarget: undefined,
    snapResolution: resolvedGhost.snapResolution
      ? {
          ...resolvedGhost.snapResolution,
          rawPointerX: roundTraceNumber(pointerX),
        }
      : {
          resolver: 'advanced-retarget',
          rawPointerX: roundTraceNumber(pointerX),
        },
  }, {
    canonicalSnapX: anchorPoint.domX,
    effectiveSnap: traceAnchorCandidate({
      x: anchorPoint.domX,
      ratio: anchorPoint.ratio,
      voiceId: anchorPoint.voiceId,
      timestampNum: anchorPoint.timestampNum,
      timestampDen: anchorPoint.timestampDen,
      synthetic: anchorPoint.synthetic,
      isRest: anchorPoint.isRest,
    }, {
      source: 'advanced-anchor',
      pointerX,
      ghostX: anchorPoint.domX,
    }),
    pointerX,
    snapSource: 'advanced-anchor',
    resolver: 'advanced-retarget',
    reason: 'pointer matched advanced anchor within retarget distance',
  });
}

function shouldStickToAdvancedAnchor(input: {
  anchor: SelectedNote | null;
  overlay: RenderedMeasureLayoutOverlay | null;
  pointerClient: { x: number; y: number } | null;
  lastPlacementClient: { x: number; y: number } | null;
  maxDistancePx?: number;
}) {
  const { anchor, overlay, pointerClient, lastPlacementClient } = input;
  if (!anchor?.isRest || !anchor.coreMeasureId || !overlay || !pointerClient || !lastPlacementClient) return false;
  if (anchor.coreMeasureId !== overlay.measureId) return false;
  if ((pointerClient.x - lastPlacementClient.x) < -4) return false;
  return Math.hypot(pointerClient.x - lastPlacementClient.x, pointerClient.y - lastPlacementClient.y) <= Math.max(input.maxDistancePx ?? 96, 0);
}

function shouldClearAdvancedGhostAnchor(
  anchor: SelectedNote | null,
  pointerClient: { x: number; y: number },
  lastPlacementClient: { x: number; y: number } | null,
  maxDistancePx = 96,
) {
  if (!anchor) return false;
  if (!lastPlacementClient) return true;
  return Math.hypot(pointerClient.x - lastPlacementClient.x, pointerClient.y - lastPlacementClient.y) > Math.max(maxDistancePx, 0);
}

function resolvePointerGhostAnchor(
  candidate: SelectedNote | null,
  overlay: RenderedMeasureLayoutOverlay | null,
) {
  if (!candidate?.coreMeasureId || !overlay) return null;
  return candidate.coreMeasureId === overlay.measureId ? candidate : null;
}

function isGenericSvgContainer(element: SVGElement): boolean {
  if (element instanceof SVGSVGElement) return true;
  if (!(element instanceof SVGGElement)) return false;
  return element.classList.contains('vf-measure');
}

function collectClickedVisualTargets(eventPathNodes: Node[]): SVGElement[] {
  const svgPath = eventPathNodes.filter((node): node is SVGElement => node instanceof SVGElement);
  const target = svgPath.find((element) => !isGenericSvgContainer(element));
  if (!target) return [];

  if (target instanceof SVGTSpanElement && target.parentElement instanceof SVGTextElement) {
    return [target.parentElement];
  }

  return [target];
}

function findDirectRenderedNoteHit(renderedNotes: RenderedNote[], eventPathNodes: Node[]): RenderedNote | null {
  return renderedNotes.find((entry) => {
    const svgElement = entry.svgElement;
    return svgElement != null && eventPathNodes.some((node) => svgElement === node || svgElement.contains(node));
  }) ?? null;
}

function findRenderedNoteheadAtPoint(renderedNotes: RenderedNote[], domPoint: PointLike): RenderedNote | null {
  return renderedNotes.find((entry) => isPointInsideNoteRect(domPoint, entry.domRect)) ?? null;
}

function findNoteInputActivationHit(
  renderedNotes: RenderedNote[],
  eventPathNodes: Node[],
  domPoint: PointLike,
): RenderedNote | null {
  const pathHit = findDirectRenderedNoteHit(renderedNotes, eventPathNodes);
  if (pathHit && isPointInsideNoteRect(domPoint, pathHit.domRect)) return pathHit;

  let nearest: RenderedNote | null = null;
  let nearestDistanceSq = Number.POSITIVE_INFINITY;
  for (const rendered of renderedNotes) {
    const insideRect = isPointInsideNoteRect(domPoint, rendered.domRect);
    const dx = rendered.domCenter.x - domPoint.x;
    const dy = rendered.domCenter.y - domPoint.y;
    const distanceSq = insideRect ? 0 : dx * dx + dy * dy;
    if (distanceSq < nearestDistanceSq) {
      nearestDistanceSq = distanceSq;
      nearest = rendered;
    }
  }

  return nearestDistanceSq <= 12 * 12 ? nearest : null;
}

function extractVisualText(targets: SVGElement[]): string | null {
  const text = targets
    .map((element) => element.textContent?.trim() ?? '')
    .find((value) => value.length > 0);
  return text ?? null;
}

function resolveClickedGuitarFretTextTarget(input: {
  coreDocument: ScoreDocumentModel | null;
  container: HTMLElement;
  measureOverlay: RenderedMeasureLayoutOverlay | null;
  domPoint: PointLike;
  visualText: string | null;
}): SelectedNote | null {
  if (!input.coreDocument || !input.measureOverlay) return null;

  const textCenters = Array.from(input.container.querySelectorAll<SVGTextElement>('svg text'))
    .map((element) => {
      const text = element.textContent?.trim() ?? '';
      if (!/^\d+$/.test(text)) return null;
      const rect = clientRectToContainer(input.container, element.getBoundingClientRect());
      const center = { x: rect.x + rect.width / 2, y: rect.y + rect.height / 2 };
      return { text, center };
    })
    .filter((entry): entry is { text: string; center: PointLike } => Boolean(entry))
    .filter((entry) => (
      entry.center.x >= input.measureOverlay!.domRect.x - 4
      && entry.center.x <= input.measureOverlay!.domRect.x + input.measureOverlay!.domRect.width + 4
      && Math.abs(entry.center.y - input.domPoint.y) <= 72
    ))
    .sort((a, b) => a.center.x - b.center.x || a.center.y - b.center.y);
  if (textCenters.length === 0) return null;

  const clickedIndex = textCenters.reduce((bestIndex, entry, index) => {
    const best = textCenters[bestIndex];
    if (!best) return index;
    const bestDistance = Math.abs(best.center.x - input.domPoint.x) + Math.abs(best.center.y - input.domPoint.y);
    const distance = Math.abs(entry.center.x - input.domPoint.x) + Math.abs(entry.center.y - input.domPoint.y);
    return distance < bestDistance ? index : bestIndex;
  }, 0);
  const clickedText = textCenters[clickedIndex];
  if (!clickedText) return null;
  const clickedDistance = Math.abs(clickedText.center.x - input.domPoint.x) + Math.abs(clickedText.center.y - input.domPoint.y);
  if (clickedDistance > 32) return null;
  const fret = Number(clickedText.text);
  if (!Number.isFinite(fret)) return null;

  const candidates: Array<{
    partId: string;
    measureId: string;
    voiceId: string;
    event: Extract<TimedEvent, { kind: 'note' }>;
  }> = [];
  for (const part of input.coreDocument.score.parts) {
    for (const staff of part.staves) {
      const measure = staff.measures.find((entry) => entry.measureNumber === input.measureOverlay!.measureNumber);
      if (!measure) continue;
      for (const voice of measure.voices) {
        for (const event of voice.events) {
          if (event.kind !== 'note' || !event.guitar) continue;
          candidates.push({ partId: part.id, measureId: measure.id, voiceId: voice.id, event });
        }
      }
    }
  }

  const ordered = candidates.sort((a, b) => (
    noteTimestampValue(a.event) - noteTimestampValue(b.event)
    || a.event.guitar!.string - b.event.guitar!.string
    || a.event.id.localeCompare(b.event.id)
  ));
  const indexed = ordered[clickedIndex];
  const matched = indexed?.event.guitar?.fret === fret
    ? indexed
    : ordered.find((entry, index) => index >= clickedIndex && entry.event.guitar?.fret === fret)
      ?? [...ordered].reverse().find((entry, reverseIndex) => (ordered.length - 1 - reverseIndex) <= clickedIndex && entry.event.guitar?.fret === fret)
      ?? null;
  if (!matched) return null;

  return {
    coreEntityId: matched.event.id,
    coreVoiceId: matched.voiceId,
    coreMeasureId: matched.measureId,
    corePartId: matched.partId,
    measureNumber: matched.event.measureNumber,
    staffIndex: matched.event.staffIndex,
    voiceId: matched.event.voiceId,
    timestampNum: matched.event.timestampNum,
    timestampDen: matched.event.timestampDen,
    step: matched.event.pitch.step,
    octave: matched.event.pitch.octave,
    alter: matched.event.pitch.alter,
    isRest: false,
    durationType: matched.event.durationType,
    isDotted: matched.event.isDotted,
    guitar: matched.event.guitar,
    graphicalNote: null,
  };
}

function resolveClickedGuitarTechniqueTextTarget(input: {
  coreDocument: ScoreDocumentModel | null;
  container: HTMLElement;
  measureOverlay: RenderedMeasureLayoutOverlay | null;
  domPoint: PointLike;
  visualText: string | null;
}): SelectedNote | null {
  const text = input.visualText?.trim().toUpperCase();
  if (!input.coreDocument || !input.measureOverlay || (text !== 'P' && text !== 'H')) return null;

  const textCenters = Array.from(input.container.querySelectorAll<SVGTextElement>('svg text'))
    .map((element) => {
      const value = element.textContent?.trim().toUpperCase() ?? '';
      if (value !== text) return null;
      const rect = clientRectToContainer(input.container, element.getBoundingClientRect());
      const center = { x: rect.x + rect.width / 2, y: rect.y + rect.height / 2 };
      return { text: value, center };
    })
    .filter((entry): entry is { text: string; center: PointLike } => Boolean(entry))
    .filter((entry) => (
      entry.center.x >= input.measureOverlay!.domRect.x - 4
      && entry.center.x <= input.measureOverlay!.domRect.x + input.measureOverlay!.domRect.width + 4
      && Math.abs(entry.center.y - input.domPoint.y) <= 72
    ))
    .sort((a, b) => a.center.x - b.center.x || a.center.y - b.center.y);
  if (textCenters.length === 0) return null;

  const clickedIndex = textCenters.reduce((bestIndex, entry, index) => {
    const best = textCenters[bestIndex];
    if (!best) return index;
    const bestDistance = Math.abs(best.center.x - input.domPoint.x) + Math.abs(best.center.y - input.domPoint.y);
    const distance = Math.abs(entry.center.x - input.domPoint.x) + Math.abs(entry.center.y - input.domPoint.y);
    return distance < bestDistance ? index : bestIndex;
  }, 0);
  const clickedText = textCenters[clickedIndex];
  if (!clickedText) return null;
  const clickedDistance = Math.abs(clickedText.center.x - input.domPoint.x) + Math.abs(clickedText.center.y - input.domPoint.y);
  if (clickedDistance > 32) return null;

  const techniqueNames = text === 'P'
    ? new Set(['pull-off', 'pull-off-stop'])
    : new Set(['hammer-on', 'hammer-on-stop']);
  const candidates: Array<{
    partId: string;
    measureId: string;
    voiceId: string;
    event: Extract<TimedEvent, { kind: 'note' }>;
  }> = [];
  for (const part of input.coreDocument.score.parts) {
    for (const staff of part.staves) {
      const measure = staff.measures.find((entry) => entry.measureNumber === input.measureOverlay!.measureNumber);
      if (!measure) continue;
      for (const voice of measure.voices) {
        for (const event of voice.events) {
          if (event.kind !== 'note' || !event.guitar?.techniques?.some((technique) => techniqueNames.has(technique))) continue;
          candidates.push({ partId: part.id, measureId: measure.id, voiceId: voice.id, event });
        }
      }
    }
  }

  const ordered = candidates.sort((a, b) => (
    noteTimestampValue(a.event) - noteTimestampValue(b.event)
    || (a.event.guitar?.string ?? 0) - (b.event.guitar?.string ?? 0)
    || a.event.id.localeCompare(b.event.id)
  ));
  const matched = ordered[Math.min(clickedIndex, ordered.length - 1)] ?? null;
  if (!matched) return null;

  return {
    coreEntityId: matched.event.id,
    coreVoiceId: matched.voiceId,
    coreMeasureId: matched.measureId,
    corePartId: matched.partId,
    measureNumber: matched.event.measureNumber,
    staffIndex: matched.event.staffIndex,
    voiceId: matched.event.voiceId,
    timestampNum: matched.event.timestampNum,
    timestampDen: matched.event.timestampDen,
    step: matched.event.pitch.step,
    octave: matched.event.pitch.octave,
    alter: matched.event.pitch.alter,
    isRest: false,
    durationType: matched.event.durationType,
    isDotted: matched.event.isDotted,
    guitar: matched.event.guitar,
    graphicalNote: null,
  };
}

function findRenderedGuitarFretTextElement(input: {
  coreDocument: ScoreDocumentModel | null;
  container: HTMLElement | null;
  measureOverlays: RenderedMeasureLayoutOverlay[];
  note: SelectedNote;
}): SVGTextElement | null {
  if (!input.coreDocument || !input.container) return null;
  const measureOverlay = input.measureOverlays.find((overlay) => (
    (input.note.coreMeasureId && overlay.measureId === input.note.coreMeasureId)
    || overlay.measureNumber === input.note.measureNumber
  )) ?? null;
  if (!measureOverlay) return null;

  const textCenters = Array.from(input.container.querySelectorAll<SVGTextElement>('svg text'))
    .map((element) => {
      const text = element.textContent?.trim() ?? '';
      if (!/^\d+$/.test(text)) return null;
      const rect = clientRectToContainer(input.container!, element.getBoundingClientRect());
      const center = { x: rect.x + rect.width / 2, y: rect.y + rect.height / 2 };
      return { text, center, element };
    })
    .filter((entry): entry is { text: string; center: PointLike; element: SVGTextElement } => Boolean(entry))
    .filter((entry) => (
      entry.center.x >= measureOverlay.domRect.x - 4
      && entry.center.x <= measureOverlay.domRect.x + measureOverlay.domRect.width + 4
      && entry.center.y >= measureOverlay.domRect.y - 48
      && entry.center.y <= measureOverlay.domRect.y + measureOverlay.domRect.height + 96
    ))
    .sort((a, b) => a.center.x - b.center.x || a.center.y - b.center.y);
  if (textCenters.length === 0) return null;

  const candidates: Array<{
    partId: string;
    measureId: string;
    voiceId: string;
    event: Extract<TimedEvent, { kind: 'note' }>;
  }> = [];
  for (const part of input.coreDocument.score.parts) {
    if (input.note.corePartId && part.id !== input.note.corePartId) continue;
    for (const staff of part.staves) {
      const measure = staff.measures.find((entry) => (
        (input.note.coreMeasureId && entry.id === input.note.coreMeasureId)
        || entry.measureNumber === input.note.measureNumber
      ));
      if (!measure) continue;
      for (const voice of measure.voices) {
        for (const event of voice.events) {
          if (event.kind !== 'note' || !event.guitar) continue;
          candidates.push({ partId: part.id, measureId: measure.id, voiceId: voice.id, event });
        }
      }
    }
  }

  const ordered = candidates.sort((a, b) => (
    noteTimestampValue(a.event) - noteTimestampValue(b.event)
    || a.event.guitar!.string - b.event.guitar!.string
    || a.event.id.localeCompare(b.event.id)
  ));
  const candidateIndex = ordered.findIndex((entry) => (
    (input.note.coreEntityId && entry.event.id === input.note.coreEntityId)
    || (
      entry.partId === input.note.corePartId
      && entry.measureId === input.note.coreMeasureId
      && entry.event.staffIndex === input.note.staffIndex
      && entry.event.voiceId === input.note.voiceId
      && timestampsEqual(entry.event.timestampNum, entry.event.timestampDen, input.note.timestampNum, input.note.timestampDen)
    )
  ));
  const matchedGuitar = candidateIndex >= 0 ? ordered[candidateIndex]?.event.guitar : input.note.guitar;
  if (!matchedGuitar) return null;
  const textEntry = candidateIndex >= 0 ? textCenters[candidateIndex] ?? null : null;
  if (textEntry && Number(textEntry.text) === matchedGuitar.fret) return textEntry.element;
  return textCenters.find((entry) => Number(entry.text) === matchedGuitar.fret)?.element ?? null;
}

function isPointInsideRect(x: number, y: number, rect: DOMRect): boolean {
  return x >= rect.left && x <= rect.right && y >= rect.top && y <= rect.bottom;
}

function isPointInsideGhostNotehead(
  point: PointLike,
  target: Pick<GhostNoteTarget, 'previewLeft' | 'previewTop' | 'noteheadCenterX'> | null,
  layerOffset: OverlayLayerOffset,
  radiusX = 6,
  radiusY = 6,
) {
  if (!target) return false;
  const localX = point.x - layerOffset.x;
  const localY = point.y - layerOffset.y;
  const noteheadCenterX = target.previewLeft + target.noteheadCenterX;
  const noteheadCenterY = target.previewTop + 28;
  return Math.abs(localX - noteheadCenterX) <= radiusX
    && Math.abs(localY - noteheadCenterY) <= radiusY;
}

function isClientPointInsideGhostNotehead(
  point: PointLike,
  element: HTMLElement | null,
  radiusX = 6,
  radiusY = 6,
) {
  if (!element || element.offsetParent === null) return false;
  const rect = element.getBoundingClientRect();
  const noteheadCenterX = Number.parseFloat(element.dataset.ghostNoteheadCenterX ?? '5.5');
  const noteheadCenterY = Number.parseFloat(element.dataset.ghostNoteheadCenterY ?? '28');
  if (!Number.isFinite(noteheadCenterX) || !Number.isFinite(noteheadCenterY)) return false;
  return Math.abs(point.x - (rect.left + noteheadCenterX)) <= radiusX
    && Math.abs(point.y - (rect.top + noteheadCenterY)) <= radiusY;
}

function findMeasureElementForPoint(container: HTMLElement, eventPathNodes: Node[], clientX: number, clientY: number) {
  const fromPath = eventPathNodes.find((node): node is SVGGElement => (
    node instanceof SVGGElement && node.classList.contains('vf-measure')
  ));
  if (fromPath) return fromPath;

  return Array.from(container.querySelectorAll<SVGGElement>('.vf-measure')).find((element) => {
    const rect = element.getBoundingClientRect();
    return clientX >= rect.left && clientX <= rect.right && clientY >= rect.top && clientY <= rect.bottom;
  }) ?? null;
}

function findMeasureOverlayForPoint(
  overlays: RenderedMeasureLayoutOverlay[],
  domPoint: PointLike,
): RenderedMeasureLayoutOverlay | null {
  const candidates = overlays
    .filter((overlay) => {
      const verticalPadding = Math.max(28, Math.min(48, overlay.domRect.height * 0.55));
      return domPoint.x >= overlay.domRect.x
        && domPoint.x <= overlay.domRect.x + overlay.domRect.width
        && domPoint.y >= overlay.domRect.y - verticalPadding
        && domPoint.y <= overlay.domRect.y + overlay.domRect.height + verticalPadding;
    })
    .map((overlay) => {
      const inside = domPoint.y >= overlay.domRect.y
        && domPoint.y <= overlay.domRect.y + overlay.domRect.height;
      const centerY = overlay.domRect.y + (overlay.domRect.height / 2);
      return { overlay, inside, distance: Math.abs(domPoint.y - centerY) };
    })
    .sort((left, right) => Number(right.inside) - Number(left.inside) || left.distance - right.distance);

  return candidates[0]?.overlay ?? null;
}

function findNearestMeasureOverlayForPoint(
  overlays: RenderedMeasureLayoutOverlay[],
  domPoint: PointLike,
): RenderedMeasureLayoutOverlay | null {
  return overlays
    .map((overlay) => ({
      overlay,
      distance: rectDistanceToPoint(overlay.domRect, domPoint),
      centerY: overlay.domRect.y + (overlay.domRect.height / 2),
    }))
    .sort((left, right) => (
      left.distance - right.distance
      || Math.abs(domPoint.y - left.centerY) - Math.abs(domPoint.y - right.centerY)
      || left.overlay.domRect.x - right.overlay.domRect.x
      || left.overlay.measureId.localeCompare(right.overlay.measureId)
    ))[0]?.overlay ?? null;
}

function resolvePlayheadRect(
  playhead: PlaybackPlayheadSnapshot,
  overlays: RenderedMeasureLayoutOverlay[],
  staffDetailsByMeasure: Map<number, StaffDetail[]>,
) {
  const overlay = overlays.find((entry) => entry.measureNumber === playhead.measureNumber);
  if (!overlay) return null;
  const visibleRect = visibleMeasureRectForAllStaves(overlay, staffDetailsByMeasure);
  return {
    x: visibleRect.x + (visibleRect.width * playhead.progressWithinMeasure),
    y: visibleRect.y,
    height: visibleRect.height,
    measureNumber: playhead.measureNumber,
  };
}

// Prefer the browser's real SVG transform matrix when available. Imported scores
// can introduce nested transforms/margins where OSMD's domToSvg helper is less
// reliable than converting through the rendered <svg> directly.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function eventToSvgPoint(container: HTMLElement, osmd: any, e: PointerEvent): PointLike {
  const svgEl = container.querySelector('svg');
  if (svgEl instanceof SVGSVGElement) {
    const screenPoint = svgEl.createSVGPoint();
    screenPoint.x = e.clientX;
    screenPoint.y = e.clientY;
    const ctm = svgEl.getScreenCTM();
    if (ctm) {
      const svgPoint = screenPoint.matrixTransform(ctm.inverse());
      return { x: svgPoint.x, y: svgPoint.y };
    }
  }

  const rect = container.getBoundingClientRect();
  return osmd.GraphicSheet.domToSvg({
    x: e.clientX - rect.left,
    y: e.clientY - rect.top,
  });
}

function rectDebug(rect: DOMRect | RectLike | null | undefined) {
  if (!rect) return null;
  return {
    x: Number(rect.x.toFixed(2)),
    y: Number(rect.y.toFixed(2)),
    width: Number(rect.width.toFixed(2)),
    height: Number(rect.height.toFixed(2)),
    left: 'left' in rect ? Number(rect.left.toFixed(2)) : undefined,
    top: 'top' in rect ? Number(rect.top.toFixed(2)) : undefined,
    right: 'right' in rect ? Number(rect.right.toFixed(2)) : undefined,
    bottom: 'bottom' in rect ? Number(rect.bottom.toFixed(2)) : undefined,
  };
}

function pointerTargetDebug(target: GhostNoteTarget | null | undefined) {
  if (!target) return null;
  return {
    measureId: target.measureId,
    measureNumber: target.measureNumber,
    staffIndex: target.staffIndex,
    voiceId: target.voiceId,
    timestamp: `${target.timestampNum}/${target.timestampDen}`,
    pitch: `${target.step}${target.alter === 1 ? '#' : target.alter === -1 ? 'b' : ''}${target.octave}`,
    placementMode: target.placementMode,
    domCenter: {
      x: Number(target.domCenter.x.toFixed(2)),
      y: Number(target.domCenter.y.toFixed(2)),
    },
    pointerX: typeof target.pointerX === 'number' ? Number(target.pointerX.toFixed(2)) : null,
    preview: {
      left: Number(target.previewLeft.toFixed(2)),
      top: Number(target.previewTop.toFixed(2)),
      noteheadCenterX: Number(target.noteheadCenterX.toFixed(2)),
    },
    semanticAnchor: {
      rect: target.semanticAnchorRect ? rectDebug(target.semanticAnchorRect) : null,
      isRest: target.semanticAnchorIsRest ?? null,
      label: target.semanticAnchorLabel ?? null,
    },
  };
}

function ghostVisibleNoteheadCenterX(target: GhostNoteTarget) {
  return target.previewLeft + target.noteheadCenterX;
}

function isResolvedFirstSlotRestSnapTarget(target: GhostNoteTarget | null | undefined, guardRight?: number | null) {
  if (!target || target.timestampNum !== 0) return false;
  if (target.placementAnchorIsRest !== true && target.semanticAnchorIsRest !== true) return false;
  const visibleNoteheadX = ghostVisibleNoteheadCenterX(target);
  if (guardRight != null && visibleNoteheadX < guardRight - 0.75) return false;
  const snap = target.snapResolution?.effectiveSnap
    ?? target.snapResolution?.gridSnap
    ?? target.snapResolution?.preferredSnap
    ?? target.snapResolution?.resolvedMatchingSnap
    ?? target.snapResolution?.nearestMatchingSnap
    ?? target.snapResolution?.quantizedFallbackSnap
    ?? null;
  if (!snap || snap.isRest !== true || snap.x == null || !Number.isFinite(snap.x)) return false;
  const syntheticIsValidated = snap.synthetic === true
    && target.resolvedTarget?.diagnostics.some((diagnostic) => diagnostic === 'rest-only-quantized-internal-slot');
  if (snap.synthetic === true && !syntheticIsValidated) return false;
  return Math.abs(snap.x - visibleNoteheadX) <= 1;
}

function firstSlotGhostPulledBehindPointer(target: GhostNoteTarget | null | undefined) {
  if (!target || target.pointerX == null || target.placementMode !== 'insert') return false;
  if (target.timestampNum !== 0) return false;
  if (target.placementAnchorIsRest !== false || target.semanticAnchorIsRest) return false;
  // Nearest-anchor snaps legitimately target beat 1 from anywhere inside its
  // span — only advanced-anchor retargets can pull the ghost far behind the
  // pointer. Guarding plain snaps made beat 1 untargetable right of its
  // notehead.
  const resolver = target.snapResolution?.resolver ?? '';
  if (!resolver.includes('retarget')) return false;
  return target.pointerX - ghostVisibleNoteheadCenterX(target) > 1;
}

function pointerInLeadingFirstSlotBuffer(
  target: GhostNoteTarget | null | undefined,
  overlay: RenderedMeasureLayoutOverlay | null | undefined,
  pointerX: number,
  allOverlays: RenderedMeasureLayoutOverlay[] = [],
) {
  if (!target || target.placementMode === 'chord' || !overlay) return false;
  if (!shouldProtectLeadingMeasureModifiers({
    overlay,
    entries: [],
    allOverlays,
  })) return false;
  const guardRight = leadingTimeSignatureGuardRightX(overlay);
  if (isResolvedFirstSlotRestSnapTarget(target, guardRight)) {
    const noteheadX = ghostVisibleNoteheadCenterX(target);
    const anchorLeft = target.semanticAnchorRect
      ? Math.min(target.semanticAnchorRect.x, noteheadX - LEADING_REST_ANCHOR_HOVER_TOLERANCE_PX)
      : noteheadX - LEADING_REST_ANCHOR_HOVER_TOLERANCE_PX;
    const anchorRight = target.semanticAnchorRect
      ? Math.max(target.semanticAnchorRect.x + target.semanticAnchorRect.width, noteheadX + 1)
      : noteheadX + 1;
    if (pointerX >= anchorLeft - 0.75 && pointerX <= anchorRight + 0.75) return false;
  }
  return pointerX < guardRight;
}

function pointerInMeasureBarlineGuard(
  overlay: RenderedMeasureLayoutOverlay | null | undefined,
  pointerX: number,
) {
  if (!overlay) return false;
  const left = overlay.domRect.x;
  const right = overlay.domRect.x + overlay.domRect.width;
  return Math.abs(pointerX - left) <= BARLINE_GHOST_GUARD_PX
    || Math.abs(pointerX - right) <= BARLINE_GHOST_GUARD_PX;
}

function isPointInsideNoteRect(point: PointLike, rect: RectLike): boolean {
  return point.x >= rect.x && point.x <= rect.x + rect.width && point.y >= rect.y && point.y <= rect.y + rect.height;
}

const NOTE_ENUM_TO_STEP: Record<number, string> = { 0: 'C', 2: 'D', 4: 'E', 5: 'F', 7: 'G', 9: 'A', 11: 'B' };
const GHOST_USE_PROXY = process.env.NEXT_PUBLIC_GHOST_USE_PROXY !== 'false';

function quantizeStaffStepFromStaffGeometry(
  staff: NonNullable<DetailedContext['staff']>,
  y: number,
) {
  const halfStepPx = staff.lineDistanceDom / 2;
  return halfStepPx > 0
    ? Math.round((y - staff.topLineDomY) / halfStepPx)
    : 0;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function getSourceNote(graphicalNote: any): any | null {
  return graphicalNote?.sourceNote ?? graphicalNote?.SourceNote ?? null;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function getGraphicalNoteGroup(graphicalNote: any): SVGGElement | null {
  try {
    const el = graphicalNote?.getSVGGElement?.();
    return el instanceof SVGGElement ? el : null;
  } catch {
    return null;
  }
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function normalizeSelectedNote(graphicalNote: any): SelectedNote | null {
  const sourceNote = getSourceNote(graphicalNote);
  if (!sourceNote) return null;

  const sourceMeasure = sourceNote.SourceMeasure ?? sourceNote.sourceMeasure;
  const parentVoiceEntry = sourceNote.ParentVoiceEntry ?? sourceNote.parentVoiceEntry;
  const parentVoice = parentVoiceEntry?.ParentVoice ?? parentVoiceEntry?.parentVoice;
  const parentStaff = sourceNote.ParentStaff ?? sourceNote.parentStaff;
  const timestamp = parentVoiceEntry?.Timestamp ?? parentVoiceEntry?.timestamp;
  const pitch = sourceNote.Pitch ?? sourceNote.pitch;

  let step = 'C';
  let octave = 4;
  let alter = 0;

  if (pitch) {
    const fundamentalNote = pitch.FundamentalNote ?? pitch.fundamentalNote ?? 0;
    const accidental = pitch.Accidental ?? pitch.accidental ?? 2;
    step = NOTE_ENUM_TO_STEP[fundamentalNote] ?? 'C';
    octave = pitch.Octave ?? pitch.octave ?? 4;
    alter = accidental === 0 ? 1 : accidental === 1 ? -1 : 0;
  }

  return {
    measureNumber: sourceMeasure?.MeasureNumberXML ?? sourceMeasure?.measureNumberXML ?? 1,
    staffIndex: parentStaff?.Id ?? parentStaff?.id ?? 1,
    voiceId: parentVoice?.VoiceId ?? parentVoice?.voiceId ?? 1,
    timestampNum: timestamp?.Numerator ?? timestamp?.numerator ?? 0,
    timestampDen: timestamp?.Denominator ?? timestamp?.denominator ?? 1,
    step,
    octave,
    alter,
    isRest: !pitch,
    graphicalNote,
  };
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function getBoundingBoxCenter(boundingBox: any): PointLike | null {
  if (!boundingBox) return null;
  try {
    const absolute = boundingBox.AbsolutePosition ?? boundingBox.absolutePosition;
    const center = boundingBox.Center ?? boundingBox.center;
    if (center) {
      return {
        x: center.x ?? center.X ?? 0,
        y: center.y ?? center.Y ?? 0,
      };
    }
    const size = boundingBox.Size ?? boundingBox.size;
    if (absolute && size) {
      const width = size.width ?? size.Width ?? 0;
      const height = size.height ?? size.Height ?? 0;
      return {
        x: (absolute.x ?? absolute.X ?? 0) + width / 2,
        y: (absolute.y ?? absolute.Y ?? 0) + height / 2,
      };
    }
  } catch {
    return null;
  }
  return null;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function getBoundingBoxRect(boundingBox: any): RectLike | null {
  if (!boundingBox) return null;
  try {
    const absolute = boundingBox.AbsolutePosition ?? boundingBox.absolutePosition;
    const size = boundingBox.Size ?? boundingBox.size;
    if (!absolute || !size) return null;
    return {
      x: absolute.x ?? absolute.X ?? 0,
      y: absolute.y ?? absolute.Y ?? 0,
      width: size.width ?? size.Width ?? 0,
      height: size.height ?? size.Height ?? 0,
    };
  } catch {
    return null;
  }
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function noteDistanceSq(graphicalNote: any, clickPos: PointLike): number | null {
  const boundingBox = graphicalNote?.PositionAndShape ?? graphicalNote?.positionAndShape;
  if (!boundingBox) return null;

  try {
    if (typeof boundingBox.pointLiesInsideBorders === 'function' && boundingBox.pointLiesInsideBorders(clickPos)) {
      return 0;
    }
  } catch {
    // ignore and fall back to center distance
  }

  const center = getBoundingBoxCenter(boundingBox);
  if (!center) return null;

  const dx = center.x - clickPos.x;
  const dy = center.y - clickPos.y;
  return dx * dx + dy * dy;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function toArray(value: unknown): any[] {
  return Array.isArray(value) ? value : [];
}

function svgPointToContainer(svgEl: SVGSVGElement, container: HTMLElement, point: PointLike): PointLike | null {
  const ctm = svgEl.getScreenCTM();
  if (!ctm) return null;
  const svgPoint = svgEl.createSVGPoint();
  svgPoint.x = point.x;
  svgPoint.y = point.y;
  const screenPoint = svgPoint.matrixTransform(ctm);
  const rect = container.getBoundingClientRect();
  return {
    x: screenPoint.x - rect.left,
    y: screenPoint.y - rect.top,
  };
}

function clientRectToContainer(container: HTMLElement, rect: DOMRect): RectLike {
  const containerRect = container.getBoundingClientRect();
  return {
    x: rect.left - containerRect.left,
    y: rect.top - containerRect.top,
    width: rect.width,
    height: rect.height,
  };
}

function buildDomMeasureRectsByVisualOrder(
  container: HTMLElement,
  coreDocument: ScoreDocumentModel | null | undefined,
): Map<string, RectLike> {
  const svg = container.querySelector('svg');
  if (!svg || !coreDocument) return new Map();

  const containerRect = container.getBoundingClientRect();
  const measureRects = Array.from(svg.querySelectorAll<SVGGElement>('g.vf-measure'))
    .map((element) => {
      const rect = element.getBoundingClientRect();
      return {
        x: rect.left - containerRect.left,
        y: rect.top - containerRect.top,
        width: rect.width,
        height: rect.height,
      };
    })
    .filter((rect) => rect.width > 1 && rect.height > 1)
    .sort((left, right) => (
      (left.y + left.height / 2) - (right.y + right.height / 2)
      || left.x - right.x
    ));

  if (measureRects.length === 0) return new Map();

  const rows: RectLike[][] = [];
  for (const rect of measureRects) {
    const centerY = rect.y + rect.height / 2;
    const row = rows.find((candidate) => {
      const candidateCenterY = candidate.reduce((sum, entry) => sum + entry.y + entry.height / 2, 0) / Math.max(candidate.length, 1);
      return Math.abs(candidateCenterY - centerY) <= Math.max(12, rect.height * 0.35);
    });
    if (row) {
      row.push(rect);
      row.sort((left, right) => left.x - right.x);
    } else {
      rows.push([rect]);
    }
  }

  rows.sort((left, right) => {
    const leftCenter = left.reduce((sum, entry) => sum + entry.y + entry.height / 2, 0) / Math.max(left.length, 1);
    const rightCenter = right.reduce((sum, entry) => sum + entry.y + entry.height / 2, 0) / Math.max(right.length, 1);
    return leftCenter - rightCenter;
  });

  const orderedStaves = coreDocument.score.parts
    .flatMap((part) => part.staves
      .slice()
      .sort((left, right) => left.staffIndex - right.staffIndex)
      .map((staff) => ({ partId: part.id, staffIndex: staff.staffIndex, measures: staff.measures })));
  if (orderedStaves.length === 0) return new Map();

  const byMeasureId = new Map<string, RectLike>();
  let measureNumber = Math.min(
    ...orderedStaves.flatMap((staff) => staff.measures.map((measure) => measure.measureNumber)),
  );

  for (let rowIndex = 0; rowIndex < rows.length; rowIndex += orderedStaves.length) {
    const systemRows = rows.slice(rowIndex, rowIndex + orderedStaves.length);
    if (systemRows.length === 0) continue;
    const columnCount = Math.max(...systemRows.map((row) => row.length));

    for (let columnIndex = 0; columnIndex < columnCount; columnIndex += 1) {
      const currentMeasureNumber = measureNumber + columnIndex;
      for (let staffOffset = 0; staffOffset < orderedStaves.length; staffOffset += 1) {
        const staff = orderedStaves[staffOffset];
        const rect = systemRows[staffOffset]?.[columnIndex];
        if (!staff || !rect) continue;
        const measure = staff.measures.find((entry) => entry.measureNumber === currentMeasureNumber);
        if (!measure) continue;
        byMeasureId.set(measure.id, rect);
        if (!byMeasureId.has(`measure-number:${currentMeasureNumber}`)) {
          byMeasureId.set(`measure-number:${currentMeasureNumber}`, rect);
        }
        byMeasureId.set(`measure-number:${currentMeasureNumber}:staff:${staff.staffIndex}`, rect);
      }
    }

    measureNumber += columnCount;
  }

  return byMeasureId;
}

function applyMeasureRectHorizontalBounds(
  overlays: RenderedMeasureLayoutOverlay[],
  measureRects: Map<string, RectLike> | null | undefined,
  coreDocument: ScoreDocumentModel | null | undefined,
): RenderedMeasureLayoutOverlay[] {
  if (!measureRects || measureRects.size === 0) return overlays;

  return overlays.map((overlay) => {
    const staffIndex = staffIndexForMeasureId(coreDocument, overlay.measureId);
    const domRect = (
      staffIndex == null
        ? null
        : measureRects.get(`measure-number:${overlay.measureNumber}:staff:${staffIndex}`) ?? null
    ) ?? measureRects.get(`measure-number:${overlay.measureNumber}`)
      ?? measureRects.get(overlay.measureId);
    if (!domRect) return overlay;
    return {
      ...overlay,
      domRect: {
        ...overlay.domRect,
        x: domRect.x,
        width: domRect.width,
      },
    };
  });
}

function snapMeasureOverlayBarlines(
  overlays: RenderedMeasureLayoutOverlay[],
  coreDocument: ScoreDocumentModel | null | undefined,
): RenderedMeasureLayoutOverlay[] {
  const groups: RenderedMeasureLayoutOverlay[][] = [];
  const groupKeys: Array<{ staffIndex: number | 'staffless'; centerY: number }> = [];
  const sorted = [...overlays].sort((left, right) => (
    (left.domRect.y + left.domRect.height / 2) - (right.domRect.y + right.domRect.height / 2)
    || left.domRect.x - right.domRect.x
    || left.measureNumber - right.measureNumber
  ));
  for (const overlay of sorted) {
    const staffIndex = staffIndexForMeasureId(coreDocument, overlay.measureId) ?? 'staffless';
    const centerY = overlay.domRect.y + overlay.domRect.height / 2;
    const tolerance = Math.max(10, overlay.domRect.height * 0.35);
    const groupIndex = groupKeys.findIndex((key) => (
      key.staffIndex === staffIndex
      && Math.abs(key.centerY - centerY) <= tolerance
    ));
    if (groupIndex >= 0) {
      groups[groupIndex]!.push(overlay);
      const group = groups[groupIndex]!;
      groupKeys[groupIndex] = {
        staffIndex,
        centerY: group.reduce((sum, entry) => sum + entry.domRect.y + entry.domRect.height / 2, 0) / group.length,
      };
    } else {
      groups.push([overlay]);
      groupKeys.push({ staffIndex, centerY });
    }
  }

  const snappedById = new Map<string, RenderedMeasureLayoutOverlay>();
  for (const group of groups.values()) {
    const ordered = [...group].sort((left, right) => (
      left.domRect.x - right.domRect.x
      || left.measureNumber - right.measureNumber
    ));
    if (ordered.length < 2) {
      ordered.forEach((overlay) => snappedById.set(overlay.measureId, overlay));
      continue;
    }

    const boundaries = ordered.map((overlay) => overlay.domRect.x);
    boundaries.push(ordered[ordered.length - 1]!.domRect.x + ordered[ordered.length - 1]!.domRect.width);
    for (let index = 1; index < ordered.length; index += 1) {
      const previous = ordered[index - 1]!;
      const current = ordered[index]!;
      boundaries[index] = (previous.domRect.x + previous.domRect.width + current.domRect.x) / 2;
    }

    ordered.forEach((overlay, index) => {
      const x = boundaries[index]!;
      const right = boundaries[index + 1]!;
      snappedById.set(overlay.measureId, right > x
        ? { ...overlay, domRect: { ...overlay.domRect, x, width: right - x } }
        : overlay);
    });
  }

  return overlays.map((overlay) => snappedById.get(overlay.measureId) ?? overlay);
}

function capMeasureOverlayRowYBounds(
  overlays: RenderedMeasureLayoutOverlay[],
  coreDocument: ScoreDocumentModel | null | undefined,
): RenderedMeasureLayoutOverlay[] {
  const groups = new Map<string, RenderedMeasureLayoutOverlay[]>();
  for (const overlay of overlays) {
    const staffIndex = staffIndexForMeasureId(coreDocument, overlay.measureId) ?? 'staffless';
    const key = `${overlay.pageIndex}:${overlay.systemIndex}:${staffIndex}`;
    const group = groups.get(key) ?? [];
    group.push(overlay);
    groups.set(key, group);
  }

  const systemBounds = [...groups.entries()].map(([key, entries]) => {
    const [pageText, systemText] = key.split(':');
    const top = Math.min(...entries.map((entry) => entry.domRect.y));
    const bottom = Math.max(...entries.map((entry) => entry.domRect.y + entry.domRect.height));
    return {
      key,
      pageIndex: Number.parseInt(pageText ?? '0', 10),
      systemIndex: Number.parseInt(systemText ?? '0', 10),
      top,
      bottom,
      center: (top + bottom) / 2,
    };
  }).sort((left, right) => (
    left.pageIndex - right.pageIndex
    || left.center - right.center
    || left.systemIndex - right.systemIndex
  ));

  const limits = new Map<string, { top: number; bottom: number }>();
  for (let index = 0; index < systemBounds.length; index += 1) {
    const current = systemBounds[index]!;
    const prev = systemBounds[index - 1];
    const next = systemBounds[index + 1];
    const top = prev && prev.pageIndex === current.pageIndex
      ? (prev.bottom + current.top) / 2
      : Number.NEGATIVE_INFINITY;
    const bottom = next && next.pageIndex === current.pageIndex
      ? (current.bottom + next.top) / 2
      : Number.POSITIVE_INFINITY;
    limits.set(current.key, { top, bottom });
  }

  return overlays.map((overlay) => {
    const staffIndex = staffIndexForMeasureId(coreDocument, overlay.measureId) ?? 'staffless';
    const limit = limits.get(`${overlay.pageIndex}:${overlay.systemIndex}:${staffIndex}`);
    if (!limit) return overlay;
    const originalBottom = overlay.domRect.y + overlay.domRect.height;
    const y = Number.isFinite(limit.top) ? limit.top : overlay.domRect.y;
    const bottom = Number.isFinite(limit.bottom) ? limit.bottom : originalBottom;
    if (!Number.isFinite(y) || !Number.isFinite(bottom) || bottom <= y) return overlay;
    return {
      ...overlay,
      domRect: {
        ...overlay.domRect,
        y,
        height: bottom - y,
      },
    };
  });
}

function buildMeasureLayoutOverlaysForContainer(
  renderedNotes: RenderedNote[],
  layoutBridge: ReturnType<typeof buildOsmdLayoutBridge> | null,
  graphicalMeasureRects: Map<string, RectLike> | null | undefined,
  staffDetailsByMeasure: Map<number, StaffDetail[]> | null | undefined,
  coreDocument: ScoreDocumentModel | null | undefined,
): RenderedMeasureLayoutOverlay[] {
  if (!layoutBridge) return [];

  const fallbackOverlays = buildRenderedMeasureLayoutOverlays(renderedNotes, layoutBridge);
  const visualMeasureOverlays = layoutBridge.measures.flatMap((measure): RenderedMeasureLayoutOverlay[] => {
    const staffIndex = staffIndexForMeasureId(coreDocument, measure.measureId);
    const domRect = (
      graphicalMeasureRects?.get(measure.measureId)
      ?? (staffIndex == null
        ? null
        : graphicalMeasureRects?.get(`measure-number:${measure.measureNumber}:staff:${staffIndex}`) ?? null)
    ) ?? graphicalMeasureRects?.get(`measure-number:${measure.measureNumber}`)
      ?? null;
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
  });
  const renderedHorizontalOverlays = visualMeasureOverlays.length > 0
    ? visualMeasureOverlays
    : applyMeasureRectHorizontalBounds(fallbackOverlays, graphicalMeasureRects, coreDocument);
  const staffExpandedOverlays = expandMeasureOverlayStaffBounds(
    renderedHorizontalOverlays,
    staffDetailsByMeasure,
    coreDocument,
  );
  const snappedOverlays = snapMeasureOverlayBarlines(staffExpandedOverlays, coreDocument);
  const cappedOverlays = capMeasureOverlayStaffYBounds(snappedOverlays, staffDetailsByMeasure, coreDocument);
  if (dbg.enabled()) {
    dbg.score(
      `measure overlay sources → fallback=${fallbackOverlays.length} graphical=${graphicalMeasureRects?.size ?? 0} bridge=${layoutBridge.measures.length}`,
    );
  }
  return cappedOverlays;
}

function refineMeasureOverlaysForNoteInput(
  overlays: RenderedMeasureLayoutOverlay[],
  renderedNotes: RenderedNote[],
  coreDocument: ScoreDocumentModel | null | undefined,
  selectedDuration: Props['selectedDuration'],
  isDotted: boolean,
) {
  void renderedNotes;
  void coreDocument;
  void selectedDuration;
  void isDotted;
  return overlays;
}

export function mergeAugmentedMeasureOverlays(
  overlays: RenderedMeasureLayoutOverlay[],
  augmentedMeasures: readonly RenderedMeasureLayoutOverlay[],
) {
  const augmentedById = new Map(augmentedMeasures.map((measure) => [measure.measureId, measure]));
  const merged = overlays.map((overlay) => {
    const augmented = augmentedById.get(overlay.measureId);
    if (!augmented) return overlay;
    augmentedById.delete(overlay.measureId);
    return {
      ...overlay,
      domRect: augmented.domRect,
      staffDetails: augmented.staffDetails,
    };
  });
  return [...merged, ...augmentedById.values()].sort((left, right) => (
    left.pageIndex - right.pageIndex
    || left.systemIndex - right.systemIndex
    || left.measureNumber - right.measureNumber
    || left.measureId.localeCompare(right.measureId)
  ));
}

function overlaySubdivisionRatios(
  overlay: RenderedMeasureLayoutOverlay,
  coreDocument: ScoreDocumentModel | null | undefined,
  selectedDuration: Props['selectedDuration'],
  isDotted: boolean,
) {
  const measureDuration = getMeasureDurationRatio(coreDocument ?? null, overlay.measureId);
  const slotDuration = fractionToNumber(getEffectiveDuration(selectedDuration, isDotted));
  if (!(measureDuration > 0) || !(slotDuration > 0)) return [];

  const ratios: number[] = [];
  let cursor = slotDuration;
  let guard = 0;
  while (cursor < measureDuration - 1e-6 && guard < 64) {
    ratios.push(cursor / measureDuration);
    cursor += slotDuration;
    guard += 1;
  }
  return ratios;
}

function expandMeasureOverlayStaffBounds(
  overlays: RenderedMeasureLayoutOverlay[],
  staffDetailsByMeasure: Map<number, StaffDetail[]> | null | undefined,
  coreDocument: ScoreDocumentModel | null | undefined,
): RenderedMeasureLayoutOverlay[] {
  if (!staffDetailsByMeasure || staffDetailsByMeasure.size === 0) return overlays;

  return overlays.map((overlay) => {
    const staffIndex = staffIndexForMeasureId(coreDocument, overlay.measureId);
    const details = staffDetailsByMeasure.get(overlay.measureNumber) ?? [];
    const detail = findNearestStaffDetail(
      details,
      staffIndex,
      overlay.domRect.y + (overlay.domRect.height / 2),
      corePartIdForMeasureId(coreDocument, overlay.measureId),
    );
    if (!detail) return overlay;

    const halfStep = Math.max(detail.lineDistanceDom / 2, 1);
    const bottomStaffStep = (Math.max(detail.lineCount, 1) - 1) * 2;
    const topLedgerLimit = -2;
    const bottomLedgerLimit = Math.max(bottomStaffStep + 14, 4);
    const noteheadPad = Math.max(detail.lineDistanceDom * 0.75, 8);
    const y = detail.topLineDomY + (topLedgerLimit * halfStep) - noteheadPad;
    const bottom = detail.topLineDomY + (bottomLedgerLimit * halfStep) + noteheadPad;
    if (!Number.isFinite(y) || !Number.isFinite(bottom) || bottom <= y) return overlay;

    return {
      ...overlay,
      domRect: {
        ...overlay.domRect,
        y,
        height: bottom - y,
      },
    };
  });
}

function staffDetailCenterY(detail: StaffDetail): number {
  return (detail.topLineDomY + detail.bottomLineDomY) / 2;
}

function buildTabletStaffGeometry(
  detail: StaffDetail,
  scope: { corePartId?: string | null; systemIndex?: number | null },
): TabletEntryStaffGeometry {
  const capturePadding = Math.max(detail.lineDistanceDom * 2, 12);
  return {
    id: tabletEntryStaffId({
      corePartId: detail.corePartId ?? scope.corePartId,
      systemIndex: scope.systemIndex,
      staffIndex: detail.staffIndex,
    }),
    staffIndex: detail.staffIndex,
    topLineY: detail.topLineDomY,
    bottomLineY: detail.bottomLineDomY,
    lineDistancePx: detail.lineDistanceDom,
    captureTop: detail.topLineDomY - capturePadding,
    captureBottom: detail.bottomLineDomY + capturePadding,
  };
}

function resolvedTargetSlotKey(target: ResolvedEditTarget) {
  return [
    target.measureId,
    target.corePartId ?? 'partless',
    target.staffIndex,
    target.voiceId,
    target.timestampNum,
    target.timestampDen,
    target.mode,
  ].join(':');
}

function estimateTabletSlotSpacing(
  grid: RenderedGhostGrid,
  target: GhostNoteTarget,
) {
  const xs = getRenderedGhostStaffPoints(grid, target.measureId, target.staffIndex, { includeSynthetic: true })
    .map((point) => point.domX)
    .filter((x, index, all) => Number.isFinite(x) && (index === 0 || Math.abs(x - all[index - 1]!) > 0.5))
    .sort((left, right) => left - right);
  const gaps = xs.slice(1)
    .map((x, index) => x - xs[index]!)
    .filter((gap) => gap > 1);
  return median(gaps) ?? Math.max(target.previewWidth * 1.5, 24);
}


/**
 * The stored voice of the active input voice on the staff under the pointer. MuseScore and Finale
 * store a piano left hand as voices 5-8; the pointer must address those, not create voice 1.
 */
function resolveStoredInputVoiceAtPoint(
  overlays: RenderedMeasureLayoutOverlay[],
  domPoint: PointLike,
  coreDocument: ScoreDocumentModel | null | undefined,
  inputVoice: number,
) {
  const overlay = findMeasureOverlayForPoint(overlays, domPoint);
  const detail = overlay ? findNearestStaffDetail(overlay.staffDetails ?? [], null, domPoint.y, null) : null;
  if (!detail) return inputVoice;
  return storedVoiceFor(coreDocument, { corePartId: detail.corePartId ?? null, staffIndex: detail.staffIndex }, inputVoice);
}

function findNearestStaffDetail(
  details: StaffDetail[],
  staffIndex: number | null | undefined,
  yHint: number | null | undefined,
  corePartId?: string | null,
): StaffDetail | null {
  const normalizedPartId = corePartId?.replace(/^part:/, '') ?? null;
  const matchingPartDetails = normalizedPartId
    ? details.filter((detail) => detail.corePartId?.replace(/^part:/, '') === normalizedPartId)
    : details;
  const scopedDetails = matchingPartDetails.length > 0 ? matchingPartDetails : details;
  const candidates = staffIndex == null
    ? scopedDetails
    : scopedDetails.filter((detail) => detail.staffIndex === staffIndex);
  if (candidates.length === 0) return null;
  if (typeof yHint !== 'number' || !Number.isFinite(yHint)) return candidates[0] ?? null;
  return candidates
    .slice()
    .sort((left, right) => (
      Math.abs(staffDetailCenterY(left) - yHint) - Math.abs(staffDetailCenterY(right) - yHint)
      || left.staffIndex - right.staffIndex
    ))[0] ?? null;
}

function collectUniqueStaffRows(staffDetailsByMeasure: Map<number, StaffDetail[]> | null | undefined): StaffDetail[] {
  const rows: StaffDetail[] = [];
  for (const details of staffDetailsByMeasure?.values() ?? []) {
    for (const detail of details) {
      const centerY = staffDetailCenterY(detail);
      const tolerance = Math.max(1, detail.lineDistanceDom * 0.25);
      const existing = rows.find((row) => (
        row.staffIndex === detail.staffIndex
        && Math.abs(staffDetailCenterY(row) - centerY) <= tolerance
      ));
      if (existing) continue;
      rows.push(detail);
    }
  }
  return rows.sort((left, right) => (
    staffDetailCenterY(left) - staffDetailCenterY(right)
    || left.staffIndex - right.staffIndex
  ));
}

function buildStaffVerticalFences(staffDetailsByMeasure: Map<number, StaffDetail[]> | null | undefined): StaffVerticalFence[] {
  const rows = collectUniqueStaffRows(staffDetailsByMeasure);
  return rows.map((detail, index) => {
    const centerY = staffDetailCenterY(detail);
    const previous = rows[index - 1] ?? null;
    const next = rows[index + 1] ?? null;
    const previousCenterY = previous ? staffDetailCenterY(previous) : null;
    const nextCenterY = next ? staffDetailCenterY(next) : null;
    return {
      staffIndex: detail.staffIndex,
      centerY,
      top: previousCenterY == null ? Number.NEGATIVE_INFINITY : (previousCenterY + centerY) / 2,
      bottom: nextCenterY == null ? Number.POSITIVE_INFINITY : (centerY + nextCenterY) / 2,
    };
  });
}

function findStaffVerticalFence(
  staff: StaffDetail | null | undefined,
  fences: StaffVerticalFence[] | null | undefined,
): StaffVerticalFence | null {
  if (!staff || !fences || fences.length === 0) return null;
  const centerY = staffDetailCenterY(staff);
  return fences
    .filter((fence) => fence.staffIndex === staff.staffIndex)
    .sort((left, right) => Math.abs(left.centerY - centerY) - Math.abs(right.centerY - centerY))[0] ?? null;
}

function measureOverlayStartsRenderedSystem(
  overlay: RenderedMeasureLayoutOverlay,
  allOverlays: RenderedMeasureLayoutOverlay[],
) {
  if (allOverlays.some((candidate) => (
    candidate.measureId !== overlay.measureId
    && candidate.pageIndex === overlay.pageIndex
    && candidate.systemIndex === overlay.systemIndex
    && candidate.measureNumber < overlay.measureNumber
  ))) {
    return false;
  }

  const centerX = overlay.domRect.x + overlay.domRect.width / 2;
  const centerY = overlay.domRect.y + overlay.domRect.height / 2;
  const rowTolerance = Math.max(overlay.domRect.height * 0.75, 18);
  return !allOverlays.some((candidate) => (
    candidate.measureId !== overlay.measureId
    && Math.abs((candidate.domRect.y + candidate.domRect.height / 2) - centerY) <= rowTolerance
    && candidate.domRect.x + candidate.domRect.width / 2 < centerX - 1
  ));
}

function shouldProtectLeadingMeasureModifiers(input: {
  overlay: RenderedMeasureLayoutOverlay | null | undefined;
  entries: IndexedRenderedNote[];
  allOverlays: RenderedMeasureLayoutOverlay[];
}) {
  const overlay = input.overlay ?? null;
  if (!overlay) return false;
  if (overlay.measureNumber === 1) return true;
  return measureOverlayStartsRenderedSystem(overlay, input.allOverlays);
}

function capMeasureOverlayStaffYBounds(
  overlays: RenderedMeasureLayoutOverlay[],
  staffDetailsByMeasure: Map<number, StaffDetail[]> | null | undefined,
  coreDocument: ScoreDocumentModel | null | undefined,
): RenderedMeasureLayoutOverlay[] {
  const fences = buildStaffVerticalFences(staffDetailsByMeasure);
  if (fences.length === 0) return overlays;

  return overlays.map((overlay) => {
    const staffIndex = staffIndexForMeasureId(coreDocument, overlay.measureId);
    const details = staffDetailsByMeasure?.get(overlay.measureNumber) ?? [];
    const detail = findNearestStaffDetail(
      details,
      staffIndex,
      overlay.domRect.y + (overlay.domRect.height / 2),
      corePartIdForMeasureId(coreDocument, overlay.measureId),
    );
    if (!detail) return overlay;
    const rect = captureMeasureRectForStaff(
      overlay.domRect,
      detail,
      details,
      findStaffVerticalFence(detail, fences),
    );
    return rect ? { ...overlay, domRect: rect } : overlay;
  });
}

function expandMeasureOverlayHorizontalBounds(
  overlays: RenderedMeasureLayoutOverlay[],
  graphicalMeasureRects: Map<string, RectLike> | null | undefined,
): RenderedMeasureLayoutOverlay[] {
  if (overlays.length === 0) return overlays;

  const sorted = [...overlays].sort((left, right) => (
    (left.domRect.y + left.domRect.height / 2) - (right.domRect.y + right.domRect.height / 2)
    || left.pageIndex - right.pageIndex
    || left.systemIndex - right.systemIndex
    || left.measureNumber - right.measureNumber
  ));
  const rowByOverlay = new Map<RenderedMeasureLayoutOverlay, number>();
  let lastRowCenter = Number.NaN;
  let rowIndex = -1;

  for (const overlay of sorted) {
    const centerY = overlay.domRect.y + overlay.domRect.height / 2;
    if (!Number.isFinite(lastRowCenter) || Math.abs(centerY - lastRowCenter) > 24) {
      rowIndex += 1;
      lastRowCenter = centerY;
    } else {
      lastRowCenter = (lastRowCenter + centerY) / 2;
    }
    rowByOverlay.set(overlay, rowIndex);
  }

  const groups = new Map<string, RenderedMeasureLayoutOverlay[]>();
  for (const overlay of overlays) {
    const key = [
      overlay.pageIndex,
      overlay.systemIndex,
      rowByOverlay.get(overlay) ?? 0,
    ].join(':');
    const group = groups.get(key) ?? [];
    group.push(overlay);
    groups.set(key, group);
  }

  const expandedByOverlay = new Map<RenderedMeasureLayoutOverlay, RenderedMeasureLayoutOverlay>();
  for (const group of groups.values()) {
    const ordered = [...group].sort((left, right) => (
      left.measureNumber - right.measureNumber
      || (left.domRect.x + left.domRect.width / 2) - (right.domRect.x + right.domRect.width / 2)
    ));
    const graphicalBounds = ordered
      .map((overlay) => graphicalMeasureRects?.get(overlay.measureId))
      .filter((rect): rect is RectLike => Boolean(rect))
      .reduce<RectLike | null>((bounds, rect) => (bounds ? unionRects(bounds, rect) : rect), null);
    const overlayBounds = ordered
      .map((overlay) => overlay.domRect)
      .reduce<RectLike | null>((bounds, rect) => (bounds ? unionRects(bounds, rect) : rect), null);
    const systemBounds = graphicalBounds && overlayBounds ? unionRects(graphicalBounds, overlayBounds) : (graphicalBounds ?? overlayBounds);
    if (!systemBounds) {
      ordered.forEach((overlay) => expandedByOverlay.set(overlay, overlay));
      continue;
    }

    const totalWeight = ordered.reduce((sum, overlay) => sum + Math.max(overlay.widthWeight, 0.01), 0);
    let cursorX = systemBounds.x;
    for (let index = 0; index < ordered.length; index += 1) {
      const overlay = ordered[index]!;
      const isLast = index === ordered.length - 1;
      const share = totalWeight > 0 ? Math.max(overlay.widthWeight, 0.01) / totalWeight : 1 / ordered.length;
      const width = isLast
        ? (systemBounds.x + systemBounds.width) - cursorX
        : systemBounds.width * share;
      expandedByOverlay.set(overlay, width > overlay.domRect.width
        ? { ...overlay, domRect: { ...overlay.domRect, x: cursorX, width } }
        : overlay);
      cursorX += width;
    }
  }

  return overlays.map((overlay) => expandedByOverlay.get(overlay) ?? overlay);
}

function tintRenderedNote(svgElement: SVGElement | null, color: string | null) {
  if (!svgElement) return;
  const targets = [svgElement, ...Array.from(svgElement.querySelectorAll<SVGElement>('path, rect, ellipse, circle, line, polygon, polyline'))];
  targets.forEach((element) => {
    if (color) {
      element.style.stroke = color;
      element.style.fill = color;
    } else {
      element.style.stroke = '';
      element.style.fill = '';
    }
  });
}

function tintSvgElement(svgElement: SVGElement | null, color: string | null) {
  if (!svgElement) return;
  const targets = [svgElement, ...Array.from(svgElement.querySelectorAll<SVGElement>('path, rect, ellipse, circle, line, polygon, polyline, text, tspan'))];
  targets.forEach((element) => {
    if (color) {
      element.style.stroke = color;
      element.style.fill = color;
    } else {
      element.style.stroke = '';
      element.style.fill = '';
    }
  });
}

function hasRenderableSvgRect(element: SVGElement | null) {
  if (!element) return false;
  if (!element.isConnected) return false;
  const rect = element.getBoundingClientRect();
  return rect.width > 0 || rect.height > 0;
}

function getEffectiveTintElement(renderedNote: RenderedNote): SVGElement | null {
  if (hasRenderableSvgRect(renderedNote.tintElement)) return renderedNote.tintElement;
  if (hasRenderableSvgRect(renderedNote.svgElement)) return renderedNote.svgElement;
  return null;
}

function getRenderedVisualIdentity(renderedNote: RenderedNote): SVGElement | string {
  return getEffectiveTintElement(renderedNote) ?? `note:${renderedNote.id}`;
}

function describeSvgElement(element: SVGElement | null) {
  if (!element) return 'null';
  const className = (element as SVGElement & { className?: { baseVal?: string } }).className?.baseVal ?? element.getAttribute('class') ?? '';
  return `${element.tagName.toLowerCase()}${className ? `.${className.replace(/\s+/g, '.')}` : ''}`;
}

function describeSvgRect(element: SVGElement | null) {
  if (!element) return null;
  const rect = element.getBoundingClientRect();
  return {
    x: Number(rect.left.toFixed(2)),
    y: Number(rect.top.toFixed(2)),
    width: Number(rect.width.toFixed(2)),
    height: Number(rect.height.toFixed(2)),
  };
}

function shortDebugPartId(partId: string | null | undefined) {
  if (!partId) return 'partless';
  return partId.startsWith('part:') ? partId.slice('part:'.length) : partId;
}

function debugPitchLabel(note: SelectedNote) {
  if (note.isRest) return 'rest';
  const accidental = note.alter === 1 ? '#' : note.alter === -1 ? 'b' : '';
  return `${note.step}${accidental}${note.octave}`;
}

function selectedNoteDebugPayload(note: SelectedNote | null | undefined) {
  if (!note) return null;
  return {
    coreEntityId: note.coreEntityId ?? null,
    coreVoiceId: note.coreVoiceId ?? null,
    coreMeasureId: note.coreMeasureId ?? null,
    corePartId: note.corePartId ?? null,
    measureNumber: note.measureNumber,
    staffIndex: note.staffIndex,
    voiceId: note.voiceId,
    timestamp: `${note.timestampNum}/${note.timestampDen}`,
    pitch: debugPitchLabel(note),
    durationType: note.durationType ?? null,
    guitar: note.guitar ?? null,
  };
}

function roundDebugPoint(point: PointLike): PointLike {
  return {
    x: Math.round(point.x * 100) / 100,
    y: Math.round(point.y * 100) / 100,
  };
}

function roundDebugRect(rect: RectLike | null): RectLike | null {
  if (!rect) return null;
  return {
    x: Math.round(rect.x * 100) / 100,
    y: Math.round(rect.y * 100) / 100,
    width: Math.round(rect.width * 100) / 100,
    height: Math.round(rect.height * 100) / 100,
  };
}

function eventPathContainsElement(element: SVGElement | null, eventPathNodes: Node[]) {
  if (!element) return false;
  return eventPathNodes.some((node) => element === node || element.contains(node));
}

function renderedGlyphRect(container: HTMLElement | null, rendered: RenderedNote): { rect: RectLike | null; source: string } {
  if (container && rendered.tintElement && hasRenderableSvgRect(rendered.tintElement)) {
    return {
      rect: clientRectToContainer(container, rendered.tintElement.getBoundingClientRect()),
      source: 'glyph-client-rect',
    };
  }
  return {
    rect: rendered.domRect,
    source: 'rendered-bounding-box',
  };
}

function distanceFromPointToRect(point: PointLike, rect: RectLike | null) {
  if (!rect) return Number.POSITIVE_INFINITY;
  const dx = point.x < rect.x ? rect.x - point.x : point.x > rect.x + rect.width ? point.x - (rect.x + rect.width) : 0;
  const dy = point.y < rect.y ? rect.y - point.y : point.y > rect.y + rect.height ? point.y - (rect.y + rect.height) : 0;
  return Math.sqrt((dx * dx) + (dy * dy));
}

function renderedNoteDistanceFromPoint(rendered: RenderedNote, point: PointLike) {
  const dx = rendered.domCenter.x - point.x;
  const dy = rendered.domCenter.y - point.y;
  return Math.sqrt((dx * dx) + (dy * dy));
}

function buildSelectionConfidenceCandidate(input: {
  rendered: RenderedNote;
  renderedIndex: number;
  container: HTMLElement | null;
  eventPathNodes: Node[];
  domPoint: PointLike;
  selectedVoice?: number | null;
  selectedPartId?: string | null;
  hitTolerancePx?: number;
}): SelectionConfidenceCandidate | null {
  const {
    rendered,
    renderedIndex,
    container,
    eventPathNodes,
    domPoint,
    selectedVoice,
    selectedPartId,
    hitTolerancePx = 24,
  } = input;
  const glyph = renderedGlyphRect(container, rendered);
  const directPathHit = eventPathContainsElement(rendered.svgElement, eventPathNodes);
  const tintPathHit = eventPathContainsElement(rendered.tintElement, eventPathNodes);
  const glyphRectHit = isPointInsideNoteRect(domPoint, glyph.rect ?? rendered.domRect);
  const bboxHit = isPointInsideNoteRect(domPoint, rendered.domRect);
  const rectDistance = distanceFromPointToRect(domPoint, glyph.rect ?? rendered.domRect);
  const centerDistance = renderedNoteDistanceFromPoint(rendered, domPoint);
  const distancePx = Math.min(rectDistance, centerDistance);
  const nearEnoughFallback = distancePx <= hitTolerancePx;
  if (!directPathHit && !tintPathHit && !glyphRectHit && !bboxHit && !nearEnoughFallback) return null;

  const sourceRank = tintPathHit
    ? 0
    : directPathHit
      ? 1
      : glyphRectHit
        ? 2
        : bboxHit
          ? 3
          : 4;
  const preferredVoicePenalty = selectedVoice && sourceRank === 4 && rendered.note.voiceId !== selectedVoice ? 24 : 0;
  const preferredPartPenalty = selectedPartId && sourceRank === 4 && rendered.note.corePartId !== selectedPartId ? 18 : 0;
  const score = (sourceRank * 1000)
    + distancePx
    + preferredVoicePenalty
    + preferredPartPenalty
    + (rendered.note.coreEntityId ? 0 : 12)
    + (renderedIndex / 1000);
  const reason = tintPathHit
    ? 'direct-tint-path'
    : directPathHit
      ? 'direct-rendered-path'
      : glyphRectHit
        ? 'glyph-rect-hit'
        : bboxHit
          ? 'rendered-bounding-box-hit'
          : 'nearest-visible-glyph';

  return {
    rank: 0,
    renderedId: rendered.id,
    score: Math.round(score * 100) / 100,
    reason,
    directPathHit,
    tintPathHit,
    glyphRectHit,
    bboxHit,
    distancePx: Math.round(distancePx * 100) / 100,
    hitAreaSource: glyph.source,
    glyphBounds: roundDebugRect(glyph.rect),
    target: selectedNoteDebugPayload(rendered.note),
  };
}

function compareChordGlyphCandidatesByPointerY(
  left: SelectionConfidenceCandidate,
  right: SelectionConfidenceCandidate,
  renderedById: Map<string, RenderedNote>,
  domPoint: PointLike,
) {
  const leftRendered = renderedById.get(left.renderedId);
  const rightRendered = renderedById.get(right.renderedId);
  const leftNote = leftRendered?.note;
  const rightNote = rightRendered?.note;
  if (!leftNote || !rightNote || leftNote.isRest || rightNote.isRest) return 0;
  if (
    leftNote.corePartId !== rightNote.corePartId
    || leftNote.measureNumber !== rightNote.measureNumber
    || leftNote.staffIndex !== rightNote.staffIndex
    || leftNote.voiceId !== rightNote.voiceId
    || leftNote.timestampNum !== rightNote.timestampNum
    || leftNote.timestampDen !== rightNote.timestampDen
  ) return 0;

  const pitchDelta = selectedNotePitchRank(leftNote) - selectedNotePitchRank(rightNote);
  if (pitchDelta === 0) return 0;
  const sharedY = (leftRendered.domCenter.y + rightRendered.domCenter.y) / 2;
  return domPoint.y <= sharedY + 1
    ? -pitchDelta
    : pitchDelta;
}

export function resolveRenderedGlyphHit(input: {
  renderedNotes: RenderedNote[];
  container?: HTMLElement | null;
  eventPathNodes: Node[];
  domPoint: PointLike;
  selectedVoice?: number | null;
  selectedPartId?: string | null;
  hitTolerancePx?: number;
}): { rendered: RenderedNote | null; report: SelectionConfidenceReport } {
  const renderedById = new Map(input.renderedNotes.map((rendered) => [rendered.id, rendered]));
  const candidates = input.renderedNotes
    .map((rendered, index) => buildSelectionConfidenceCandidate({
      rendered,
      renderedIndex: index,
      container: input.container ?? null,
      eventPathNodes: input.eventPathNodes,
      domPoint: input.domPoint,
      selectedVoice: input.selectedVoice,
      selectedPartId: input.selectedPartId,
      hitTolerancePx: input.hitTolerancePx,
    }))
    .filter((candidate): candidate is SelectionConfidenceCandidate => Boolean(candidate))
    .sort((a, b) => {
      const scoreDelta = a.score - b.score;
      if (Math.abs(scoreDelta) > 0.01) return scoreDelta;
      return compareChordGlyphCandidatesByPointerY(a, b, renderedById, input.domPoint)
        || scoreDelta
        || a.renderedId.localeCompare(b.renderedId);
    })
    .map((candidate, index) => ({ ...candidate, rank: index + 1 }));
  const winner = candidates[0] ?? null;
  const rendered = winner
    ? input.renderedNotes.find((entry) => entry.id === winner.renderedId) ?? null
    : null;
  return {
    rendered,
    report: {
      kind: rendered ? 'rendered-glyph-hit' : 'no-rendered-glyph-hit',
      domPoint: roundDebugPoint(input.domPoint),
      visualText: null,
      selectedTarget: rendered ? selectedNoteDebugPayload(rendered.note) : null,
      selectedRenderedId: rendered?.id ?? null,
      winnerReason: winner?.reason ?? null,
      fallback: winner?.reason === 'nearest-visible-glyph',
      fallbackReason: winner?.reason === 'nearest-visible-glyph'
        ? `no direct glyph or bounding-box hit; nearest visible glyph within ${input.hitTolerancePx ?? 24}px`
        : null,
      candidates,
    },
  };
}

function buildTextTargetSelectionConfidence(
  kind: string,
  note: SelectedNote,
  domPoint: PointLike,
  visualText: string | null | undefined,
  reason: string,
): SelectionConfidenceReport {
  const target = selectedNoteDebugPayload(note);
  return {
    kind,
    domPoint: roundDebugPoint(domPoint),
    visualText: visualText ?? null,
    selectedTarget: target,
    selectedRenderedId: null,
    winnerReason: reason,
    fallback: false,
    fallbackReason: null,
    candidates: [{
      rank: 1,
      renderedId: note.coreEntityId ?? `${note.measureNumber}:${note.staffIndex}:${note.voiceId}:${note.timestampNum}/${note.timestampDen}`,
      score: 0,
      reason,
      directPathHit: true,
      tintPathHit: false,
      glyphRectHit: true,
      bboxHit: false,
      distancePx: 0,
      hitAreaSource: 'svg-text',
      glyphBounds: null,
      target,
    }],
  };
}

function buildRenderedNoteDebugMarkers(
  renderedNotes: RenderedNote[],
  activeTarget: SelectedNote | null,
  selectionConfidence: SelectionConfidenceReport | null = null,
): RenderedNoteDebugMarker[] {
  const candidatesByRenderedId = new Map(
    (selectionConfidence?.candidates ?? []).map((candidate) => [candidate.renderedId, candidate]),
  );
  return renderedNotes.map((entry, index) => {
    const note = entry.note;
    const partId = note.corePartId ?? null;
    const timestamp = `${note.timestampNum}/${note.timestampDen}`;
    const candidate = candidatesByRenderedId.get(entry.id) ?? null;
    const label = [
      candidate ? `#${candidate.rank}` : null,
      shortDebugPartId(partId),
      `m${note.measureNumber}`,
      `v${note.voiceId}`,
      timestamp,
      debugPitchLabel(note),
      note.guitar ? `f${note.guitar.fret}` : null,
    ].filter(Boolean).join(' ');
    const title = [
      `part=${partId ?? 'partless'}`,
      `entity=${note.coreEntityId ?? entry.coreEntityId ?? 'none'}`,
      `measure=${note.coreMeasureId ?? note.measureNumber}`,
      `staff=${note.staffIndex}`,
      `voice=${note.voiceId}`,
      `timestamp=${timestamp}`,
      `pitch=${debugPitchLabel(note)}`,
      `duration=${note.durationType ?? 'unknown'}`,
      note.guitar ? `guitar=string ${note.guitar.string} fret ${note.guitar.fret}` : null,
      candidate ? `selectionConfidence=#${candidate.rank} ${candidate.reason} distance=${candidate.distancePx}px` : null,
      `dom=${Math.round(entry.domCenter.x)},${Math.round(entry.domCenter.y)}`,
    ].filter(Boolean).join(' | ');
    return {
      id: `${entry.id}:${index}`,
      x: entry.domCenter.x,
      y: entry.domCenter.y,
      label,
      title,
      active: activeTarget ? bridgeSelectedNoteEquals(note, activeTarget) : false,
      candidateRank: candidate?.rank ?? null,
      candidateReason: candidate?.reason ?? null,
      partId,
      coreEntityId: note.coreEntityId ?? entry.coreEntityId ?? null,
      measureNumber: note.measureNumber,
      staffIndex: note.staffIndex,
      voiceId: note.voiceId,
      timestamp,
    };
  });
}

function publishNoteHitDebug(
  kind: string,
  note: SelectedNote | null,
  domPoint: PointLike,
  visualText?: string | null,
  selectionConfidence?: SelectionConfidenceReport | null,
) {
  if (typeof window === 'undefined') return;
  const confidence: SelectionConfidenceReport = selectionConfidence
    ? {
        ...selectionConfidence,
        kind,
        visualText: visualText ?? selectionConfidence.visualText ?? null,
        selectedTarget: selectedNoteDebugPayload(note),
        selectedRenderedId: selectionConfidence.selectedRenderedId,
      }
    : {
        kind,
        domPoint: roundDebugPoint(domPoint),
        visualText: visualText ?? null,
        selectedTarget: selectedNoteDebugPayload(note),
        selectedRenderedId: null,
        winnerReason: note ? kind : null,
        fallback: kind.includes('nearest') || kind.includes('proximity') || kind.includes('fallback'),
        fallbackReason: kind.includes('nearest') || kind.includes('proximity') || kind.includes('fallback') ? kind : null,
        candidates: [],
      };
  const target = window as typeof window & {
    __NEX_NOTE_LAST_NOTE_HIT__?: unknown;
    __NEX_NOTE_SELECTION_CONFIDENCE__?: SelectionConfidenceReport;
    __NEX_NOTE_E2E_STATE__?: Record<string, unknown>;
  };
  target.__NEX_NOTE_SELECTION_CONFIDENCE__ = confidence;
  if (target.__NEX_NOTE_E2E_STATE__) {
    target.__NEX_NOTE_E2E_STATE__.selectionConfidence = confidence;
  }
  target.__NEX_NOTE_LAST_NOTE_HIT__ = {
    kind,
    domPoint: roundDebugPoint(domPoint),
    visualText: visualText ?? null,
    note: selectedNoteDebugPayload(note),
    selectionConfidence: confidence,
  };
}

function collectRenderedNotes(osmd: any, container: HTMLElement): RenderedNote[] {
  const containers = osmd?.GraphicSheet?.VerticalGraphicalStaffEntryContainers;
  if (!Array.isArray(containers)) return [];
  const svgEl = container.querySelector('svg');
  if (!(svgEl instanceof SVGSVGElement)) return [];

  const notes: RenderedNote[] = [];
  for (const verticalEntry of containers) {
    const staffEntries = toArray(verticalEntry?.StaffEntries ?? verticalEntry?.staffEntries);
    for (const staffEntry of staffEntries) {
      const voiceEntries = toArray(staffEntry?.graphicalVoiceEntries ?? staffEntry?.GraphicalVoiceEntries);
      for (const voiceEntry of voiceEntries) {
        const graphicalNotes = toArray(voiceEntry?.notes ?? voiceEntry?.Notes);
        for (let noteIndex = 0; noteIndex < graphicalNotes.length; noteIndex++) {
          const graphicalNote = graphicalNotes[noteIndex];
          const normalized = normalizeSelectedNote(graphicalNote);
          const svgElement = getGraphicalNoteGroup(graphicalNote);
          const clientRect = svgElement?.getBoundingClientRect();
          const boundingBox = graphicalNote?.PositionAndShape ?? graphicalNote?.positionAndShape;
          const svgCenter = getBoundingBoxCenter(boundingBox);
          const svgRect = getBoundingBoxRect(boundingBox);
          if (!normalized) continue;

          let domCenter: PointLike | null = null;
          let domRect: RectLike | null = null;

          if (clientRect && clientRect.width > 0 && clientRect.height > 0) {
            domRect = clientRectToContainer(container, clientRect);
            domCenter = {
              x: domRect.x + domRect.width / 2,
              y: domRect.y + domRect.height / 2,
            };
          } else if (svgCenter && svgRect) {
            const fallbackCenter = svgPointToContainer(svgEl, container, svgCenter);
            const domTopLeft = svgPointToContainer(svgEl, container, { x: svgRect.x, y: svgRect.y });
            const domBottomRight = svgPointToContainer(svgEl, container, { x: svgRect.x + svgRect.width, y: svgRect.y + svgRect.height });
            if (fallbackCenter && domTopLeft && domBottomRight) {
              domCenter = fallbackCenter;
              domRect = {
                x: Math.min(domTopLeft.x, domBottomRight.x) - 6,
                y: Math.min(domTopLeft.y, domBottomRight.y) - 6,
                width: Math.max(Math.abs(domBottomRight.x - domTopLeft.x), 10) + 12,
                height: Math.max(Math.abs(domBottomRight.y - domTopLeft.y), 10) + 12,
              };
            }
          }

          if (!domCenter || !domRect) continue;
          const effectiveSvgCenter = svgCenter ?? { x: 0, y: 0 };

          notes.push({
            id: [
              normalized.measureNumber,
              normalized.staffIndex,
              normalized.voiceId,
              normalized.timestampNum,
              normalized.timestampDen,
              normalized.step,
              normalized.octave,
              noteIndex,
            ].join(':'),
            coreEntityId: null,
            note: normalized,
            svgCenter: effectiveSvgCenter,
            domCenter,
            domRect,
            svgElement,
            tintElement: svgElement,
          });
        }
      }
    }
  }
  return notes;
}

function findNearestRenderedNote(renderedNotes: RenderedNote[], domPos: PointLike): SelectedNote | null {
  let nearest: RenderedNote | null = null;
  let nearestDistanceSq = Number.POSITIVE_INFINITY;

  for (const renderedNote of renderedNotes) {
    let distanceSq = 0;
    if (!isPointInsideNoteRect(domPos, renderedNote.domRect)) {
      const dx = renderedNote.domCenter.x - domPos.x;
      const dy = renderedNote.domCenter.y - domPos.y;
      distanceSq = dx * dx + dy * dy;
    }
    if (distanceSq < nearestDistanceSq) {
      nearestDistanceSq = distanceSq;
      nearest = renderedNote;
    }
  }

  return nearestDistanceSq <= 24 * 24 ? nearest?.note ?? null : null;
}

export function findNearestRenderedNoteInMeasure(
  renderedNotes: RenderedNote[],
  domPos: PointLike,
  measureNumber: number,
): SelectedNote | null {
  let nearest: RenderedNote | null = null;
  let nearestDistanceSq = Number.POSITIVE_INFINITY;

  for (const renderedNote of renderedNotes) {
    if (renderedNote.note.measureNumber !== measureNumber) continue;
    let distanceSq = 0;
    if (!isPointInsideNoteRect(domPos, renderedNote.domRect)) {
      const dx = renderedNote.domCenter.x - domPos.x;
      const dy = renderedNote.domCenter.y - domPos.y;
      distanceSq = dx * dx + dy * dy;
    }
    if (distanceSq < nearestDistanceSq) {
      nearestDistanceSq = distanceSq;
      nearest = renderedNote;
    }
  }

  return nearestDistanceSq <= 24 * 24 ? nearest?.note ?? null : null;
}

function findNearestRenderedNoteAny(
  renderedNotes: RenderedNote[],
  domPos: PointLike,
): SelectedNote | null {
  let nearest: RenderedNote | null = null;
  let nearestDistanceSq = Number.POSITIVE_INFINITY;

  for (const renderedNote of renderedNotes) {
    let distanceSq = 0;
    if (!isPointInsideNoteRect(domPos, renderedNote.domRect)) {
      const dx = renderedNote.domCenter.x - domPos.x;
      const dy = renderedNote.domCenter.y - domPos.y;
      distanceSq = dx * dx + dy * dy;
    }
    if (distanceSq < nearestDistanceSq) {
      nearestDistanceSq = distanceSq;
      nearest = renderedNote;
    }
  }

  return nearestDistanceSq <= 24 * 24 ? nearest?.note ?? null : null;
}

function renderedNoteSharesSelectableVisualContext(entry: RenderedNote, target: RenderedNote) {
  if (entry.note.corePartId && target.note.corePartId) {
    return entry.note.corePartId === target.note.corePartId;
  }
  if (entry.note.coreMeasureId && target.note.coreMeasureId && entry.note.coreMeasureId !== target.note.coreMeasureId) {
    return false;
  }
  const sameVisualIdentity = getRenderedVisualIdentity(entry) === getRenderedVisualIdentity(target);
  if (sameVisualIdentity) return true;
  return Math.abs(entry.domCenter.y - target.domCenter.y) <= 36;
}

export function resolveVisualSimultaneousNotes(
  renderedNotes: RenderedNote[],
  target: RenderedNote | null,
  coreDocument: ScoreDocumentModel | null,
): SelectedNote[] {
  if (!target || target.note.isRest) return target ? [target.note] : [];
  const visualMatches = renderedNotes
    .filter((entry) => (
      !entry.note.isRest
      && entry.note.measureNumber === target.note.measureNumber
      && entry.note.staffIndex === target.note.staffIndex
      && renderedNoteSharesSelectableVisualContext(entry, target)
      && (
        timestampsEqual(entry.note.timestampNum, entry.note.timestampDen, target.note.timestampNum, target.note.timestampDen)
        || Math.abs(entry.domCenter.x - target.domCenter.x) <= 18
      )
    ))
    .map((entry) => entry.note);
  const byId = new Map<string, SelectedNote>();
  for (const note of visualMatches) {
    byId.set(note.coreEntityId ?? [
      note.measureNumber,
      note.staffIndex,
      note.voiceId,
      note.timestampNum,
      note.timestampDen,
      note.step,
      note.alter,
      note.octave,
    ].join(':'), note);
  }
  const notes = [...byId.values()].sort(compareLaneNotes);
  if (notes.length > 1) return notes;
  if (!coreDocument) return notes.length > 0 ? notes : [target.note];
  const semanticMatches = buildSemanticLane(coreDocument, target.note)
    .filter((note) => (
      !note.isRest
      && note.measureNumber === target.note.measureNumber
      && note.staffIndex === target.note.staffIndex
      && (!target.note.corePartId || !note.corePartId || note.corePartId === target.note.corePartId)
      && timestampsEqual(note.timestampNum, note.timestampDen, target.note.timestampNum, target.note.timestampDen)
    ));
  return semanticMatches.length > 0 ? semanticMatches : [target.note];
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function positionCursorToMeasure(osmd: any, measureNumber: number) {
  const cursor = osmd.cursor;
  if (!cursor) return;
  try {
    cursor.reset();
    let iters = 0;
    while (!cursor.iterator.EndReached && iters < 20000) {
      iters++;
      const current = cursor.iterator.CurrentMeasureIndex + 1;
      if (current >= measureNumber) break;
      cursor.next();
    }
    cursor.show();
  } catch (err) {
    dbg.warn('score', 'playback cursor positioning failed:', err);
  }
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function positionPlaybackCursor(osmd: any, target: PlaybackCursorTarget) {
  const cursor = osmd.cursor;
  if (!cursor) return;
  try {
    cursor.reset();
    const targetTs = target.timestampNum / Math.max(target.timestampDen, 1);
    let iters = 0;
    while (!cursor.iterator.EndReached && iters < 20000) {
      iters++;
      const measureNumber: number = cursor.iterator.CurrentMeasureIndex + 1;
      const ts = cursor.iterator.CurrentSourceTimestamp;
      const tsValue: number = ts?.RealValue ?? (ts ? ts.Numerator / ts.Denominator : 0);
      if (measureNumber > target.measureNumber) break;
      if (measureNumber === target.measureNumber && tsValue >= targetTs - 0.015) break;
      cursor.next();
    }
    cursor.show();
  } catch (err) {
    dbg.warn('score', 'playback cursor positioning failed:', err);
  }
}

// Set pointer-events:none on OSMD cursor DOM elements so they never block note clicks
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function patchCursorPointerEvents(osmd: any) {
  try {
    // Try the known property names across OSMD versions
    const el = osmd.cursor?.cursorElement ?? osmd.cursor?.CursorElement;
    if (el) {
      (el as HTMLElement).style.pointerEvents = 'none';
      return;
    }
    // Fallback: find by attribute on the OSMD container
    const container = osmd.container as HTMLElement | undefined;
    if (container) {
      container.querySelectorAll<HTMLElement>('[class*="osmd-cursor"], [class*="Cursor"]')
        .forEach(e => { e.style.pointerEvents = 'none'; });
    }
  } catch { /* ignore */ }
}

function isSuppressedOsmdNoise(args: unknown[]) {
  return args.some((arg) =>
    typeof arg === 'string'
    && (
      arg.includes('SkyBottomLineBatchCalculatorBackend.calculateLines.draw')
      || arg.includes('VexFlowMusicSheetDrawer.drawMeasure')
      || /^Buffer \d+ not found\.$/.test(arg)
    ));
}

function firstElementChildOf(element: Element | null | undefined): Element | null {
  if (!element) return null;
  for (const node of Array.from(element.childNodes)) {
    if (node.nodeType === 1) return node as Element;
  }
  return null;
}

function clamp(value: number, min: number, max: number) {
  return Math.min(Math.max(value, min), max);
}

const MIN_OSMD_CONTAINER_WIDTH = 16;
const MIN_OSMD_VIEWPORT_HEIGHT = 16;
const OSMD_LAYOUT_READY_TIMEOUT_MS = 7000;

function getRenderableContainerSize(container: HTMLElement, viewport: HTMLElement | null) {
  const containerRect = container.getBoundingClientRect();
  const viewportRect = viewport?.getBoundingClientRect();
  const parentRect = container.parentElement?.getBoundingClientRect();
  return {
    width: Math.max(container.clientWidth, containerRect.width, viewport?.clientWidth ?? 0, viewportRect?.width ?? 0),
    height: Math.max(
      viewport?.clientHeight ?? 0,
      viewportRect?.height ?? 0,
      parentRect?.height ?? 0,
    ),
  };
}

function isRenderableContainerReady(container: HTMLElement, viewport: HTMLElement | null) {
  const size = getRenderableContainerSize(container, viewport);
  return size.width >= MIN_OSMD_CONTAINER_WIDTH && size.height >= MIN_OSMD_VIEWPORT_HEIGHT;
}

function describeRenderableContainerSize(container: HTMLElement, viewport: HTMLElement | null) {
  const size = getRenderableContainerSize(container, viewport);
  return `${Math.round(size.width)}x${Math.round(size.height)}px`;
}

function waitForRenderableContainer(container: HTMLElement, viewport: HTMLElement | null, signal: AbortSignal) {
  if (isRenderableContainerReady(container, viewport)) {
    return Promise.resolve(true);
  }

  return new Promise<boolean>((resolve) => {
    let raf = 0;
    let timeout = 0;
    let observer: ResizeObserver | null = null;
    let viewportObserver: ResizeObserver | null = null;

    const finish = (ready: boolean) => {
      if (raf) window.cancelAnimationFrame(raf);
      if (timeout) window.clearTimeout(timeout);
      observer?.disconnect();
      viewportObserver?.disconnect();
      signal.removeEventListener('abort', onAbort);
      resolve(ready);
    };

    const check = () => {
      raf = 0;
      if (signal.aborted) {
        finish(false);
        return;
      }
      if (isRenderableContainerReady(container, viewport)) {
        finish(true);
      }
    };

    const schedule = () => {
      if (raf) return;
      raf = window.requestAnimationFrame(check);
    };

    const onAbort = () => finish(false);
    signal.addEventListener('abort', onAbort, { once: true });

    if (typeof ResizeObserver !== 'undefined') {
      observer = new ResizeObserver(schedule);
      observer.observe(container);
      if (viewport) {
        viewportObserver = new ResizeObserver(schedule);
        viewportObserver.observe(viewport);
      }
    }
    timeout = window.setTimeout(() => finish(false), OSMD_LAYOUT_READY_TIMEOUT_MS);
    schedule();
  });
}

function normalizeHorizontalWheelDelta(event: WheelEvent) {
  if (Math.abs(event.deltaX) > 0) return event.deltaX;
  return event.deltaY;
}

function measureNumberForPageIndex(
  measureLayoutOverlays: RenderedMeasureLayoutOverlay[],
  pageIndex: number,
): number | null {
  return measureLayoutOverlays.find((overlay) => overlay.pageIndex === pageIndex)?.measureNumber ?? null;
}

function resolveFindTarget(query: string, coreDocument: ScoreDocumentModel | null, pageCount: number): FindResult | null {
  const trimmed = query.trim();
  if (!trimmed) return null;

  const pageMatch = /^p(\d+)$/i.exec(trimmed);
  if (pageMatch) {
    const pageNumber = Number.parseInt(pageMatch[1] ?? '0', 10);
    if (pageNumber >= 1 && pageNumber <= Math.max(pageCount, 1)) {
      return { mode: 'page', value: String(pageNumber), measureNumber: 1 };
    }
    return null;
  }

  const rehearsalNumericMatch = /^r(\d+)$/i.exec(trimmed);
  if (rehearsalNumericMatch && coreDocument) {
    const target = rehearsalNumericMatch[1];
    for (const part of coreDocument.score.parts) {
      for (const staff of part.staves) {
        for (const measure of staff.measures) {
          const rehearsal = measure.directions.find((direction) => (
            direction.kind === 'rehearsal'
            && direction.value?.trim().toLowerCase() === target.toLowerCase()
          ));
          if (rehearsal) {
            return { mode: 'rehearsal', value: rehearsal.value ?? target, measureNumber: measure.measureNumber };
          }
        }
      }
    }
    return null;
  }

  if (/^\d+$/.test(trimmed)) {
    return { mode: 'measure', value: trimmed, measureNumber: Number.parseInt(trimmed, 10) };
  }

  if (!coreDocument) return null;
  const lower = trimmed.toLowerCase();
  for (const part of coreDocument.score.parts) {
    for (const staff of part.staves) {
      for (const measure of staff.measures) {
        const rehearsal = measure.directions.find((direction) => (
          direction.kind === 'rehearsal'
          && direction.value?.trim().toLowerCase() === lower
        ));
        if (rehearsal) {
          return { mode: 'rehearsal', value: rehearsal.value ?? trimmed, measureNumber: measure.measureNumber };
        }
      }
    }
  }

  return null;
}

function getMeasureDurationRatio(coreDocument: ScoreDocumentModel | null, measureId: string): number {
  return getEffectiveMeasureTiming(coreDocument, { measureId })?.durationRatio ?? 1;
}

function getRenderedPitchCenter(renderedNote: RenderedNote, containerRect: DOMRect | null): PointLike {
  const fallbackCenter = renderedNote.domCenter;
  const pitchElement = getEffectiveTintElement(renderedNote);
  if (containerRect && pitchElement) {
    const rect = pitchElement.getBoundingClientRect();
    if (rect.width > 0 || rect.height > 0) {
      return {
        x: rect.left - containerRect.left + rect.width / 2,
        y: rect.top - containerRect.top + rect.height / 2,
      };
    }
  }
  return fallbackCenter;
}

function rectCenter(rect: RectLike): PointLike {
  return {
    x: rect.x + rect.width / 2,
    y: rect.y + rect.height / 2,
  };
}

function rectDistanceToPoint(rect: RectLike, point: PointLike): number {
  const left = rect.x;
  const right = rect.x + rect.width;
  const top = rect.y;
  const bottom = rect.y + rect.height;
  const dx = point.x < left ? left - point.x : point.x > right ? point.x - right : 0;
  const dy = point.y < top ? top - point.y : point.y > bottom ? point.y - bottom : 0;
  return Math.hypot(dx, dy);
}

function normalizeSemanticAnchorX(
  anchorCenterX: number,
  anchorHitRect: RectLike,
  measureRect: RectLike | null | undefined,
) {
  if (!measureRect || !(measureRect.width > 0)) return anchorCenterX;
  const measureRight = measureRect.x + measureRect.width;
  if (anchorCenterX >= measureRect.x - 16 && anchorCenterX <= measureRight + 16) {
    return anchorCenterX;
  }

  // Some OSMD/VexFlow anchor boxes are reported relative to the measure while
  // the overlay layer is in container coordinates. Normalize those before the
  // ghost preview is positioned, otherwise the notehead appears far left of
  // the visible bar even though the semantic target is correct.
  if (anchorCenterX >= -16 && anchorCenterX <= measureRect.width + 16) {
    return clamp(measureRect.x + anchorCenterX, measureRect.x, measureRight);
  }

  const hitCenterX = anchorHitRect.x + (anchorHitRect.width / 2);
  return clamp(hitCenterX, measureRect.x, measureRight);
}

function normalizeSemanticAnchorY(
  anchorCenterY: number,
  anchorHitRect: RectLike,
  measureRect: RectLike | null | undefined,
) {
  if (!measureRect || !(measureRect.height > 0)) return anchorCenterY;
  const measureBottom = measureRect.y + measureRect.height;
  if (anchorCenterY >= measureRect.y - 16 && anchorCenterY <= measureBottom + 16) {
    return anchorCenterY;
  }

  if (anchorCenterY >= -16 && anchorCenterY <= measureRect.height + 16) {
    return clamp(measureRect.y + anchorCenterY, measureRect.y, measureBottom);
  }

  const hitCenterY = anchorHitRect.y + (anchorHitRect.height / 2);
  return clamp(hitCenterY, measureRect.y, measureBottom);
}

function normalizeSemanticAnchorRectX(rect: RectLike, measureRect: RectLike | null | undefined): RectLike {
  if (!measureRect || !(measureRect.width > 0)) return rect;
  const center = rectCenter(rect);
  const normalizedCenterX = normalizeSemanticAnchorX(center.x, rect, measureRect);
  const shiftX = normalizedCenterX - center.x;
  return {
    ...rect,
    x: rect.x + shiftX,
  };
}

function normalizeSemanticAnchorRect(rect: RectLike, measureRect: RectLike | null | undefined): RectLike {
  if (!measureRect || !(measureRect.width > 0) || !(measureRect.height > 0)) return normalizeSemanticAnchorRectX(rect, measureRect);
  const center = rectCenter(rect);
  const normalizedCenterX = normalizeSemanticAnchorX(center.x, rect, measureRect);
  const normalizedCenterY = normalizeSemanticAnchorY(center.y, rect, measureRect);
  return {
    ...rect,
    x: rect.x + (normalizedCenterX - center.x),
    y: rect.y + (normalizedCenterY - center.y),
  };
}

function expandRectToMinimum(rect: RectLike, minWidth: number, minHeight: number, padding: number): RectLike {
  const center = rectCenter(rect);
  const width = Math.max(rect.width + padding * 2, minWidth);
  const height = Math.max(rect.height + padding * 2, minHeight);
  return {
    x: center.x - width / 2,
    y: center.y - height / 2,
    width,
    height,
  };
}

function semanticAnchorVisualCenterX(input: {
  anchorCenterX: number;
  semantic: SelectedNote;
  measureLeft: number;
  measureRight: number;
  measureDurationRatio: number;
}) {
  if (!(input.measureDurationRatio > 0)) {
    return input.anchorCenterX;
  }

  const startRatio = noteTimestampValue(input.semantic);
  if (!input.semantic.isRest) return input.anchorCenterX;

  const durationInput = input.semantic.durationType
    ? DURATION_TYPE_TO_INPUT[input.semantic.durationType]
    : null;
  if (!durationInput) return input.anchorCenterX;

  const restDurationRatio = fractionToNumber(getEffectiveDuration(
    durationInput,
    Boolean(input.semantic.isDotted),
  ));
  if (!(restDurationRatio > 0)) return input.anchorCenterX;

  const visualRatio = clamp(
    startRatio + (restDurationRatio / 2),
    0,
    input.measureDurationRatio,
  );
  return input.measureLeft
    + ((input.measureRight - input.measureLeft) * (visualRatio / input.measureDurationRatio));
}

function semanticAnchorLogicalX(input: {
  semantic: SelectedNote;
  measureLeft: number;
  measureRight: number;
  measureDurationRatio: number;
}) {
  if (!(input.measureDurationRatio > 0)) return input.measureLeft;
  const ratio = clamp(noteTimestampValue(input.semantic) / input.measureDurationRatio, 0, 1);
  return input.measureLeft + ((input.measureRight - input.measureLeft) * ratio);
}

function uniformNoteStartXForEntries(input: {
  entries: IndexedRenderedNote[];
  containerRect: DOMRect | null;
  measureRect: RectLike | null | undefined;
  staffDetails?: StaffDetail[] | null;
  measureOverlay?: RenderedMeasureLayoutOverlay | null;
  measureOverlays?: RenderedMeasureLayoutOverlay[] | null;
}) {
  const measureRect = input.measureRect ?? null;
  if (!measureRect || !(measureRect.width > 0)) return null;

  const byStaff = new Map<number, number>();
  const restsByStaff = new Map<number, number>();
  for (const entry of input.entries) {
    const rect = normalizeSemanticAnchorRectX(
      getRenderedAnchorRect(entry.rendered, input.containerRect),
      measureRect,
    );
    if (entry.semantic.isRest) {
      const current = restsByStaff.get(entry.semantic.staffIndex);
      restsByStaff.set(entry.semantic.staffIndex, current == null ? rect.x : Math.min(current, rect.x));
      continue;
    }
    const current = byStaff.get(entry.semantic.staffIndex);
    byStaff.set(entry.semantic.staffIndex, current == null ? rect.x : Math.min(current, rect.x));
  }

  const firstAnchorXs = [...byStaff.values()].filter((x) => Number.isFinite(x));
  const firstRestXs = [...restsByStaff.values()].filter((x) => Number.isFinite(x));
  const measureRight = measureRect.x + measureRect.width;
  const details = input.staffDetails ?? [];
  const lineDistance = details.length > 0
    ? details.reduce((sum, detail) => sum + Math.max(detail.lineDistanceDom, 1), 0) / details.length
    : 10;
  const minimumModifierStart = measureRect.x + Math.max(lineDistance * 4.2, 50);
  if (firstAnchorXs.length === 0 && firstRestXs.length > 0) {
    const firstRestStart = measureRect.x + clamp(
      Math.min(...firstRestXs) - measureRect.x,
      0,
      Math.max(measureRect.width - 8, 0),
    );
    return Math.min(measureRight - 1, firstRestStart, minimumModifierStart);
  }
  if (firstAnchorXs.length === 0) {
    const overlay = input.measureOverlay ?? null;
    const rowPeerWidths = overlay && input.measureOverlays
      ? input.measureOverlays
          .filter((candidate) => {
            if (candidate.measureId === overlay.measureId) return false;
            const centerY = overlay.domRect.y + overlay.domRect.height / 2;
            const candidateCenterY = candidate.domRect.y + candidate.domRect.height / 2;
            const rowTolerance = Math.max(overlay.domRect.height * 0.75, 18);
            return Math.abs(candidateCenterY - centerY) <= rowTolerance
              && candidate.domRect.x > overlay.domRect.x + 1
              && candidate.domRect.width > 8;
          })
          .sort((left, right) => left.domRect.x - right.domRect.x)
          .slice(0, 8)
          .map((candidate) => candidate.domRect.width)
      : [];
    const typicalMeasureWidth = median(rowPeerWidths);
    const cadenceStart = typicalMeasureWidth && typicalMeasureWidth > 8
      ? measureRight - typicalMeasureWidth
      : null;
    const start = Math.max(cadenceStart ?? minimumModifierStart, minimumModifierStart);
    return Math.min(measureRight - 1, start);
  }
  const firstAnchorStart = measureRect.x + clamp(
    Math.min(...firstAnchorXs) - measureRect.x,
    0,
    Math.max(measureRect.width - 8, 0),
  );
  return Math.min(measureRight - 1, Math.max(firstAnchorStart, measureRect.x + leadingTimeSignatureGuardPx()));
}

function getRenderedAnchorRect(renderedNote: RenderedNote, containerRect: DOMRect | null): RectLike {
  const anchorElement = getEffectiveTintElement(renderedNote);
  if (containerRect && anchorElement) {
    const rect = anchorElement.getBoundingClientRect();
    if (rect.width > 0 || rect.height > 0) {
      return {
        x: rect.left - containerRect.left,
        y: rect.top - containerRect.top,
        width: rect.width,
        height: rect.height,
      };
    }
  }
  return renderedNote.domRect;
}

function getRenderedAnchorAndVisualRect(
  renderedNote: RenderedNote,
  containerRect: DOMRect | null,
  measureRect: RectLike | null | undefined,
): RectLike {
  const anchorRect = normalizeSemanticAnchorRectX(
    getRenderedAnchorRect(renderedNote, containerRect),
    measureRect,
  );
  const visualRect = normalizeSemanticAnchorRectX(renderedNote.domRect, measureRect);
  return unionRects(anchorRect, visualRect);
}

export function captureMeasureRectForStaff(
  measureRect: RectLike | null | undefined,
  staff: StaffDetail | null | undefined,
  allStaffDetails: StaffDetail[] | null | undefined,
  verticalFence?: StaffVerticalFence | null,
): RectLike | null {
  if (!measureRect) return null;
  if (!staff) return measureRect;

  const lineDistance = Math.max(staff.lineDistanceDom, 1);
  const halfStep = lineDistance / 2;
  const bottomLedgerLimit = Math.max(mouseEntryBottomStaffStep(staff.lineCount), 4);
  const noteheadPad = Math.max(lineDistance * 0.75, 8);
  const desiredTop = staff.topLineDomY + (mouseEntryTopStaffStep() * halfStep) - noteheadPad;
  const desiredBottom = staff.topLineDomY + (bottomLedgerLimit * halfStep) + noteheadPad;
  const center = (staff.topLineDomY + staff.bottomLineDomY) / 2;
  const sorted = [...(allStaffDetails ?? [])].sort((left, right) => (
    staffDetailCenterY(left) - staffDetailCenterY(right)
    || left.staffIndex - right.staffIndex
  ));
  const staffPosition = sorted.findIndex((entry) => entry === staff);
  const resolvedStaffPosition = staffPosition >= 0
    ? staffPosition
    : sorted.findIndex((entry) => (
        entry.staffIndex === staff.staffIndex
        && Math.abs(staffDetailCenterY(entry) - center) <= Math.max(entry.lineDistanceDom, lineDistance)
      ));
  const previous = resolvedStaffPosition > 0 ? sorted[resolvedStaffPosition - 1] : null;
  const next = resolvedStaffPosition >= 0 ? sorted[resolvedStaffPosition + 1] : null;
  const previousCenter = previous ? (previous.topLineDomY + previous.bottomLineDomY) / 2 : null;
  const nextCenter = next ? (next.topLineDomY + next.bottomLineDomY) / 2 : null;
  const measureBottom = measureRect.y + measureRect.height;
  const measureContainsStaff = center >= measureRect.y - lineDistance && center <= measureBottom + lineDistance;
  const fenceTop = verticalFence
    ? (Number.isFinite(verticalFence.top) ? verticalFence.top : (measureContainsStaff ? measureRect.y : Number.NEGATIVE_INFINITY))
    : (measureContainsStaff ? measureRect.y : Number.NEGATIVE_INFINITY);
  const fenceBottom = verticalFence
    ? (Number.isFinite(verticalFence.bottom) ? verticalFence.bottom : (measureContainsStaff ? measureBottom : Number.POSITIVE_INFINITY))
    : (measureContainsStaff ? measureBottom : Number.POSITIVE_INFINITY);
  const y = previousCenter == null
    ? Math.max(desiredTop, fenceTop)
    : Math.max((previousCenter + center) / 2, fenceTop);
  const bottom = nextCenter == null
    ? Math.min(desiredBottom, fenceBottom)
    : Math.min((center + nextCenter) / 2, fenceBottom);
  if (!Number.isFinite(y) || !Number.isFinite(bottom) || bottom <= y) return measureRect;

  return {
    ...measureRect,
    y,
    height: bottom - y,
  };
}

function visibleMeasureRectForStaff(
  overlay: RenderedMeasureLayoutOverlay,
  staffDetailsByMeasure: Map<number, StaffDetail[]> | null | undefined,
  coreDocument: ScoreDocumentModel | null | undefined,
): RectLike {
  const staffIndex = staffIndexForMeasureId(coreDocument, overlay.measureId);
  const details = staffDetailsByMeasure?.get(overlay.measureNumber) ?? [];
  const staff = findNearestStaffDetail(
    details,
    staffIndex,
    overlay.domRect.y + (overlay.domRect.height / 2),
  );
  if (!staff) return overlay.domRect;

  const lineDistance = Math.max(staff.lineDistanceDom, 1);
  const y = staff.topLineDomY - (lineDistance * 2.25);
  const bottom = staff.bottomLineDomY + lineDistance;
  if (!Number.isFinite(y) || !Number.isFinite(bottom) || bottom <= y) return overlay.domRect;

  return {
    ...overlay.domRect,
    y,
    height: bottom - y,
  };
}

function visibleMeasureRectForAllStaves(
  overlay: RenderedMeasureLayoutOverlay,
  staffDetailsByMeasure: Map<number, StaffDetail[]> | null | undefined,
): RectLike {
  const details = staffDetailsByMeasure?.get(overlay.measureNumber) ?? [];
  if (details.length === 0) return overlay.domRect;

  let top = Number.POSITIVE_INFINITY;
  let bottom = Number.NEGATIVE_INFINITY;

  for (const staff of details) {
    const lineDistance = Math.max(staff.lineDistanceDom, 1);
    top = Math.min(top, staff.topLineDomY - (lineDistance * 2.25));
    bottom = Math.max(bottom, staff.bottomLineDomY + lineDistance);
  }

  if (!Number.isFinite(top) || !Number.isFinite(bottom) || bottom <= top) return overlay.domRect;

  return {
    ...overlay.domRect,
    y: top,
    height: bottom - top,
  };
}

type MeasureXGridSlot = {
  left: number;
  right: number;
  timestampValue: number;
  durationRatio: number;
};
type MeasureXGrid = Map<string, MeasureXGridSlot>;

function timestampSlotKey(note: SelectedNote): string {
  const timestamp = normalizeFraction(note.timestampNum, Math.max(note.timestampDen, 1));
  return [timestamp.num, timestamp.den].join(':');
}

function semanticLaneSlotKey(note: SelectedNote): string {
  return [
    note.staffIndex,
    note.voiceId,
    timestampSlotKey(note),
  ].join(':');
}

function findCoreEventForSemanticAnchor(
  coreDocument: ScoreDocumentModel | null | undefined,
  note: SelectedNote,
): { event: TimedEvent; divisions: number; measureDurationRatio: number } | null {
  if (!coreDocument) return null;

  for (const part of coreDocument.score.parts) {
    if (note.corePartId && part.id !== note.corePartId && part.sourcePartId !== note.corePartId) continue;
    for (const staff of part.staves) {
      if (staff.staffIndex !== note.staffIndex) continue;
      const timing = getEffectiveMeasureTiming(coreDocument, {
        measureId: note.coreMeasureId,
        measureNumber: note.measureNumber,
        staffIndex: note.staffIndex,
        partId: note.corePartId,
      });
      const divisions = timing?.divisions ?? 1;
      const measureDurationRatio = timing?.durationRatio ?? 1;
      const measure = staff.measures.find((entry) => (
        note.coreMeasureId ? entry.id === note.coreMeasureId : entry.measureNumber === note.measureNumber
      ));
      if (!measure) continue;
      for (const voice of measure.voices) {
        if (voice.voiceId !== note.voiceId) continue;
        const event = note.coreEntityId
          ? voice.events.find((entry) => entry.id === note.coreEntityId)
          : voice.events.find((entry) => (
            timestampsEqual(entry.timestampNum, entry.timestampDen, note.timestampNum, note.timestampDen)
            && entry.staffIndex === note.staffIndex
          ));
        if (event) return { event, divisions, measureDurationRatio };
      }
    }
  }
  return null;
}

function durationRatioForSemanticAnchor(
  semantic: SelectedNote,
  coreDocument: ScoreDocumentModel | null | undefined,
  fallbackDurationRatio: number,
) {
  const coreEvent = findCoreEventForSemanticAnchor(coreDocument, semantic);
  if (coreEvent && coreEvent.event.durationDivisions > 0) {
    const ratio = coreEvent.event.durationDivisions / Math.max(coreEvent.divisions * 4, 1);
    return ratio > 0 ? ratio : fallbackDurationRatio;
  }

  const durationInput = semantic.durationType
    ? DURATION_TYPE_TO_INPUT[semantic.durationType]
    : null;
  if (!durationInput) return fallbackDurationRatio;
  const ratio = fractionToNumber(getEffectiveDuration(
    durationInput,
    Boolean(semantic.isDotted),
  ));
  return ratio > 0 ? ratio : fallbackDurationRatio;
}

function resolveMeasureMusicalStartX(input: {
  measureRect: RectLike;
  measureRight: number;
  protectLeadingModifiers?: boolean;
  uniformNoteStartX?: number | null;
}) {
  if (!input.protectLeadingModifiers || input.uniformNoteStartX == null) return input.measureRect.x;
  const inset = input.uniformNoteStartX - input.measureRect.x;
  if (!Number.isFinite(inset) || inset < -1) return input.measureRect.x;
  return clamp(input.uniformNoteStartX, input.measureRect.x, Math.max(input.measureRight - 1, input.measureRect.x));
}

function buildMeasureXGrid(input: {
  entries: IndexedRenderedNote[];
  measureLeft: number;
  measureRight: number;
  measureDurationRatio: number;
  containerRect?: DOMRect | null;
  measureRect?: RectLike | null;
  coreDocument?: ScoreDocumentModel | null;
}): MeasureXGrid {
  const grid: MeasureXGrid = new Map();
  const availableWidth = Math.max(input.measureRight - input.measureLeft, 0);
  const measureDurationRatio = Math.max(input.measureDurationRatio, 1e-6);
  if (availableWidth <= 0 || input.entries.length === 0) return grid;

  const slotMap = new Map<string, {
    timestampValue: number;
    durationRatio: number;
    entries: IndexedRenderedNote[];
  }>();
  for (const entry of input.entries) {
    const key = semanticLaneSlotKey(entry.semantic);
    const existing = slotMap.get(key);
    const timestampValue = noteTimestampValue(entry.semantic);
    const fallbackDurationRatio = Math.max(measureDurationRatio - timestampValue, 1e-6);
    const durationRatio = durationRatioForSemanticAnchor(entry.semantic, input.coreDocument, fallbackDurationRatio);
    if (existing) {
      existing.durationRatio = Math.max(existing.durationRatio, durationRatio);
      existing.entries.push(entry);
      continue;
    }
    slotMap.set(key, {
      timestampValue,
      durationRatio,
      entries: [entry],
    });
  }
  const slots = [...slotMap.entries()]
    .map(([key, value]) => ({
      key,
      timestampValue: value.timestampValue,
      durationRatio: Math.max(value.durationRatio, 1e-6),
      entries: value.entries,
      staffKey: key.split(':')[0] ?? '',
    }))
    .sort((left, right) => (
      left.staffKey.localeCompare(right.staffKey)
      || left.timestampValue - right.timestampValue
      || left.durationRatio - right.durationRatio
    ));
  if (slots.length === 0) return grid;

  const slotsByStaff = new Map<string, typeof slots>();
  for (const slot of slots) {
    const staff = slotsByStaff.get(slot.staffKey) ?? [];
    staff.push(slot);
    slotsByStaff.set(slot.staffKey, staff);
  }

  const slotsByTimestamp = new Map<number, typeof slots>();
  for (const slot of slots) {
    const group = slotsByTimestamp.get(slot.timestampValue) ?? [];
    group.push(slot);
    slotsByTimestamp.set(slot.timestampValue, group);
  }
  const orderedTimestampGroups = [...slotsByTimestamp.entries()]
    .map(([timestampValue, group]) => ({ timestampValue, group }))
    .sort((left, right) => left.timestampValue - right.timestampValue);
  const minBoundaryGap = Math.max(
    0.5,
    Math.min(8, availableWidth / Math.max(orderedTimestampGroups.length, 1)),
  );

  const renderedRectsForSlots = (slotGroup: typeof orderedTimestampGroups[number], includeRests = false) => (
    slotGroup.group
      .flatMap((slot) => slot.entries)
      .filter((entry) => includeRests || !entry.semantic.isRest)
      .map((entry) => {
        const rect = getRenderedAnchorAndVisualRect(
          entry.rendered,
          input.containerRect ?? null,
          input.measureRect ?? { x: input.measureLeft, y: 0, width: availableWidth, height: 1 },
        );
        return { left: rect.x, right: rect.x + rect.width };
      })
      .filter((rect) => Number.isFinite(rect.left) && Number.isFinite(rect.right))
  );
  const noteRectsForSlots = (slotGroup: typeof orderedTimestampGroups[number]) => renderedRectsForSlots(slotGroup);
  const groupOnlyRests = (slotGroup: typeof orderedTimestampGroups[number]) => (
    slotGroup.group.every((slot) => slot.entries.every((entry) => entry.semantic.isRest))
  );

  const boundaryByTimestamp = new Map<number, number>();
  for (const slotGroup of orderedTimestampGroups) {
    const startRatio = clamp(slotGroup.timestampValue / measureDurationRatio, 0, 1);
    boundaryByTimestamp.set(slotGroup.timestampValue, input.measureLeft + (startRatio * availableWidth));
  }

  const firstTimestampGroup = orderedTimestampGroups[0] ?? null;
  if (firstTimestampGroup) {
    const firstNoteRects = noteRectsForSlots(firstTimestampGroup);
    if (firstNoteRects.length > 0) {
      const currentLeft = boundaryByTimestamp.get(firstTimestampGroup.timestampValue) ?? input.measureLeft;
      const requiredLeft = Math.min(
        ...firstNoteRects.map((rect) => Math.min(rect.left + 4, rect.left + (rect.right - rect.left) / 2 - 2)),
      );
      if (requiredLeft < currentLeft) {
        boundaryByTimestamp.set(
          firstTimestampGroup.timestampValue,
          input.measureLeft,
        );
      }
    }
  }

  const boundaryRelaxationPasses = Math.max(4, orderedTimestampGroups.length);
  for (let pass = 0; pass < boundaryRelaxationPasses; pass += 1) {
    for (let index = 0; index < orderedTimestampGroups.length - 1; index += 1) {
      const slotGroup = orderedTimestampGroups[index]!;
      const nextGroup = orderedTimestampGroups[index + 1]!;
      const nextNextGroup = orderedTimestampGroups[index + 2] ?? null;
      const currentLeft = boundaryByTimestamp.get(slotGroup.timestampValue)
        ?? input.measureLeft + (clamp(slotGroup.timestampValue / measureDurationRatio, 0, 1) * availableWidth);
      const currentRight = boundaryByTimestamp.get(nextGroup.timestampValue)
        ?? input.measureLeft + (clamp(nextGroup.timestampValue / measureDurationRatio, 0, 1) * availableWidth);
      const noteRects = noteRectsForSlots(slotGroup);
      if (noteRects.length === 0) continue;
      const requiredRight = Math.max(
        ...noteRects.map((rect) => Math.max(rect.right - 4, rect.left + (rect.right - rect.left) / 2 + 2)),
      );
      if (requiredRight <= currentRight) continue;

      const nextLimit = nextNextGroup
        ? (boundaryByTimestamp.get(nextNextGroup.timestampValue)
          ?? input.measureLeft + (clamp(nextNextGroup.timestampValue / measureDurationRatio, 0, 1) * availableWidth))
        : input.measureRight;
      const boundary = clamp(
        requiredRight,
        currentLeft + minBoundaryGap,
        nextLimit - (groupOnlyRests(nextGroup) ? Math.min(1, minBoundaryGap) : minBoundaryGap),
      );
      if (boundary > currentRight) {
        boundaryByTimestamp.set(nextGroup.timestampValue, Math.max(
          boundaryByTimestamp.get(nextGroup.timestampValue) ?? currentRight,
          boundary,
        ));
      }
    }

    for (let index = 1; index < orderedTimestampGroups.length; index += 1) {
      const previousGroup = orderedTimestampGroups[index - 1]!;
      const slotGroup = orderedTimestampGroups[index]!;
      const previousLeft = boundaryByTimestamp.get(previousGroup.timestampValue)
        ?? input.measureLeft + (clamp(previousGroup.timestampValue / measureDurationRatio, 0, 1) * availableWidth);
      const currentLeft = boundaryByTimestamp.get(slotGroup.timestampValue)
        ?? input.measureLeft + (clamp(slotGroup.timestampValue / measureDurationRatio, 0, 1) * availableWidth);
      const nextGroup = orderedTimestampGroups[index + 1] ?? null;
      const currentRight = nextGroup
        ? (boundaryByTimestamp.get(nextGroup.timestampValue)
          ?? input.measureLeft + (clamp(nextGroup.timestampValue / measureDurationRatio, 0, 1) * availableWidth))
        : input.measureRight;
      const noteRects = noteRectsForSlots(slotGroup);
      if (noteRects.length === 0) continue;
      const requiredLeft = Math.min(
        ...noteRects.map((rect) => Math.min(rect.left + 4, rect.left + (rect.right - rect.left) / 2 - 2)),
      );
      if (requiredLeft >= currentLeft) continue;

      const previousRestRects = groupOnlyRests(previousGroup)
        ? renderedRectsForSlots(previousGroup, true)
        : [];
      const previousRestRight = previousRestRects.length > 0
        ? Math.max(...previousRestRects.map((rect) => rect.right))
        : null;
      const previousLowerBound = previousRestRight != null
        ? clamp(previousRestRight + Math.min(1, minBoundaryGap), input.measureLeft, currentRight - minBoundaryGap)
        : previousLeft + (groupOnlyRests(previousGroup) ? Math.min(1, minBoundaryGap) : minBoundaryGap);
      const boundary = clamp(
        requiredLeft,
        previousLowerBound,
        currentRight - minBoundaryGap,
      );
      if (boundary < currentLeft) {
        boundaryByTimestamp.set(slotGroup.timestampValue, Math.min(
          boundaryByTimestamp.get(slotGroup.timestampValue) ?? currentLeft,
          boundary,
        ));
        if (groupOnlyRests(previousGroup) && boundary <= previousLeft) {
          boundaryByTimestamp.set(previousGroup.timestampValue, Math.min(
            boundaryByTimestamp.get(previousGroup.timestampValue) ?? previousLeft,
            Math.max(input.measureLeft, boundary - Math.min(1, minBoundaryGap)),
          ));
        }
      }
    }
  }

  for (const staffSlots of slotsByStaff.values()) {
    const timestampGroups = new Map<number, typeof staffSlots>();
    for (const slot of staffSlots) {
      const group = timestampGroups.get(slot.timestampValue) ?? [];
      group.push(slot);
      timestampGroups.set(slot.timestampValue, group);
    }
    const orderedGroups = [...timestampGroups.entries()]
      .map(([timestampValue, group]) => ({
        timestampValue,
        group,
        durationRatio: Math.max(...group.map((slot) => slot.durationRatio), 1e-6),
      }))
      .sort((left, right) => left.timestampValue - right.timestampValue);

    orderedGroups.forEach((slotGroup, index) => {
      const startRatio = clamp(slotGroup.timestampValue / measureDurationRatio, 0, 1);
      const endRatio = clamp((slotGroup.timestampValue + slotGroup.durationRatio) / measureDurationRatio, 0, 1);
      const rawLeft = input.measureLeft + (startRatio * availableWidth);
      const rawRight = input.measureLeft + (endRatio * availableWidth);
      const isLast = index === orderedGroups.length - 1;
      const nextGroup = orderedGroups[index + 1] ?? null;
      const nextLeft = nextGroup
        ? (boundaryByTimestamp.get(nextGroup.timestampValue)
          ?? input.measureLeft + (clamp(nextGroup.timestampValue / measureDurationRatio, 0, 1) * availableWidth))
        : null;
      const endsAtMeasure = Math.abs((slotGroup.timestampValue + slotGroup.durationRatio) - measureDurationRatio) <= 1e-6
        || slotGroup.timestampValue + slotGroup.durationRatio >= measureDurationRatio;
      const left = boundaryByTimestamp.get(slotGroup.timestampValue) ?? rawLeft;
      const right = nextLeft != null
        ? clamp(nextLeft, left, input.measureRight)
        : (isLast || endsAtMeasure ? input.measureRight : clamp(rawRight, left, input.measureRight));

      // Chord tones and overlapping voices share one visible staff-time column.
      // Voice-specific resolution remains semantic metadata; the production
      // hit layer must not stack rectangles for simultaneous or overlapping
      // onsets on the same staff.
      for (const slot of slotGroup.group) {
        grid.set(slot.key, {
          left,
          right,
          timestampValue: slot.timestampValue,
          durationRatio: slot.durationRatio,
        });
      }
    });
  }
  return grid;
}

function semanticAnchorCaptureZones(input: {
  entries: IndexedRenderedNote[];
  containerRect: DOMRect | null;
  measureRect: RectLike | null | undefined;
  measureDurationRatio?: number | null;
  protectLeadingModifiers?: boolean;
  uniformNoteStartX?: number | null;
  masterXGrid?: MeasureXGrid | null;
  coreDocument?: ScoreDocumentModel | null;
}) {
  const allAnchors = input.entries.map((entry) => {
    const rect = normalizeSemanticAnchorRect(
      getRenderedAnchorRect(entry.rendered, input.containerRect),
      input.measureRect,
    );
    const renderedCenterX = normalizeSemanticAnchorX(entry.rendered.domCenter.x, rect, input.measureRect);
    const renderedCenterY = normalizeSemanticAnchorY(entry.rendered.domCenter.y, rect, input.measureRect);
    return {
      entry,
      rect,
      center: {
        x: renderedCenterX,
        y: renderedCenterY,
      },
    };
  });
  if (allAnchors.length === 0) return [];

  const measureRect = input.measureRect ?? null;
  if (!measureRect || !(measureRect.width > 0) || !(measureRect.height > 0)) {
    return allAnchors.map((anchor) => ({
      ...anchor,
      hitRect: expandRectToMinimum(anchor.rect, anchor.entry.semantic.isRest ? 30 : 24, anchor.entry.semantic.isRest ? 34 : 28, 4),
      durationRatio: input.measureDurationRatio ?? 1,
    }));
  }

  const measureRight = measureRect.x + measureRect.width;
  const measureDurationRatio = Math.max(input.measureDurationRatio ?? 1, 1e-6);
  const globalNoteStartX = input.protectLeadingModifiers
    ? input.uniformNoteStartX ?? uniformNoteStartXForEntries({
        entries: input.entries,
        containerRect: input.containerRect,
        measureRect,
      })
    : null;
  const measureLeft = resolveMeasureMusicalStartX({
    measureRect,
    measureRight,
    protectLeadingModifiers: input.protectLeadingModifiers,
    uniformNoteStartX: globalNoteStartX,
  });
  const masterXGrid = input.masterXGrid ?? buildMeasureXGrid({
    entries: input.entries,
    measureLeft,
    measureRight,
    measureDurationRatio,
    containerRect: input.containerRect,
    measureRect,
    coreDocument: input.coreDocument,
  });

  const zones = allAnchors.map((anchor) => {
    const key = semanticLaneSlotKey(anchor.entry.semantic);
    const boundary = masterXGrid.get(key);
    const left = boundary?.left ?? measureLeft;
    const right = boundary?.right ?? measureRight;
    const width = Math.max(right - left, 0);
    return {
      ...anchor,
      center: {
        ...anchor.center,
        x: left + width / 2,
      },
      hitRect: {
        x: left,
        y: measureRect.y,
        width,
        height: measureRect.height,
      },
      durationRatio: boundary?.durationRatio ?? measureDurationRatio,
    };
  });

  return zones;
}

export function resolveSemanticAnchorHitRect(input: {
  zoneHitRect: RectLike;
  visualRect: RectLike;
  isRest: boolean;
  hasRenderedVisual: boolean;
}): RectLike {
  return input.zoneHitRect;
}

function semanticAnchorLabel(note: SelectedNote) {
  if (note.isRest) return `rest@${note.timestampNum}/${note.timestampDen}`;
  const accidental = note.alter === 1 ? '#' : note.alter === -1 ? 'b' : note.alter === 2 ? '##' : note.alter === -2 ? 'bb' : '';
  return `${note.step}${accidental}${note.octave}@${note.timestampNum}/${note.timestampDen}`;
}

function semanticAnchorLabelMatches(targetLabel: string | null | undefined, boxLabel: string, boxIsRest: boolean) {
  if (!targetLabel) return true;
  if (targetLabel === boxLabel) return true;
  if (targetLabel.startsWith('rest@')) return boxIsRest;
  return targetLabel.split('@')[0] === boxLabel.split('@')[0];
}

function findSemanticAnchorCandidate(input: {
  entries: IndexedRenderedNote[];
  domPoint: PointLike;
  containerRect: DOMRect | null;
  selectedNote: SelectedNote | null;
  preferredPartId?: string | null;
  selectedVoice: number;
  targetStaffIndex: number;
  graceEventIds: Set<string>;
  measureRect: RectLike | null | undefined;
  measureDurationRatio?: number | null;
  protectLeadingModifiers?: boolean;
  coreDocument?: ScoreDocumentModel | null;
  measureOverlay?: RenderedMeasureLayoutOverlay | null;
  measureOverlays?: RenderedMeasureLayoutOverlay[] | null;
  staffDetails?: StaffDetail[] | null;
}): {
  entry: IndexedRenderedNote;
  rect: RectLike;
  hitRect: RectLike;
  center: PointLike;
} | null {
  const selectedPartId = input.preferredPartId ?? input.selectedNote?.corePartId ?? null;
  const staffEntries = input.entries.filter((entry) => (
    entry.semantic.staffIndex === input.targetStaffIndex
    && !input.graceEventIds.has(entry.semantic.coreEntityId ?? '')
  ));
  const partScopedEntries = selectedPartId
    ? staffEntries.filter((entry) => entry.semantic.corePartId === selectedPartId)
    : staffEntries;
  const entries = partScopedEntries.length > 0 ? partScopedEntries : staffEntries;
  if (entries.length === 0) return null;
  const measureScopeEntries = input.entries.filter((entry) => (
    entry.semantic.staffIndex != null
    && !input.graceEventIds.has(entry.semantic.coreEntityId ?? '')
    && (!selectedPartId || entry.semantic.corePartId === selectedPartId)
  ));
  const uniformNoteStartX = uniformNoteStartXForEntries({
    entries: measureScopeEntries.length > 0 ? measureScopeEntries : input.entries,
    containerRect: input.containerRect,
    measureRect: input.measureRect,
    staffDetails: input.staffDetails,
    measureOverlay: input.measureOverlay,
    measureOverlays: input.measureOverlays,
  });
  const measureRect = input.measureRect ?? null;
  if (input.protectLeadingModifiers && measureRect && measureRect.width > 0) {
    const measureRight = measureRect.x + measureRect.width;
    const measureLeft = resolveMeasureMusicalStartX({
      measureRect,
      measureRight,
      protectLeadingModifiers: input.protectLeadingModifiers,
      uniformNoteStartX,
    });
    if (input.domPoint.x < measureLeft - 0.75) return null;
  }

  const masterXGrid = (() => {
    const measureRect = input.measureRect;
    if (!measureRect || !(measureRect.width > 0)) return null;
    const measureRight = measureRect.x + measureRect.width;
    const measureLeft = resolveMeasureMusicalStartX({
      measureRect,
      measureRight,
      protectLeadingModifiers: input.protectLeadingModifiers,
      uniformNoteStartX,
    });
    return buildMeasureXGrid({
      entries: measureScopeEntries.length > 0 ? measureScopeEntries : entries,
      measureLeft,
      measureRight,
      measureDurationRatio: Math.max(input.measureDurationRatio ?? 1, 1e-6),
      containerRect: input.containerRect,
      measureRect,
      coreDocument: input.coreDocument,
    });
  })();

  const anchors = semanticAnchorCaptureZones({
    entries,
    containerRect: input.containerRect,
    measureRect: input.measureRect,
    measureDurationRatio: input.measureDurationRatio,
    protectLeadingModifiers: input.protectLeadingModifiers,
    uniformNoteStartX,
    masterXGrid,
    coreDocument: input.coreDocument,
  }).map((anchor) => ({
    ...anchor,
    insideVisualRect: isPointInsideNoteRect(input.domPoint, anchor.rect),
    distance: rectDistanceToPoint(anchor.hitRect, input.domPoint),
    centerDistance: Math.hypot(anchor.center.x - input.domPoint.x, anchor.center.y - input.domPoint.y),
  }));

  const firstAnchorLeft = input.measureRect?.x ?? Math.min(...anchors.map((anchor) => anchor.hitRect.x));
  if (input.domPoint.x < firstAnchorLeft - 2) return null;

  const hits = anchors.filter((anchor) => (
    isPointInsideNoteRect(input.domPoint, anchor.hitRect)
    || isPointInsideNoteRect(input.domPoint, anchor.rect)
  ));
  if (hits.length === 0) return null;

  hits.sort((left, right) => (
    Number(right.insideVisualRect) - Number(left.insideVisualRect)
    || Number(right.entry.semantic.voiceId === input.selectedVoice) - Number(left.entry.semantic.voiceId === input.selectedVoice)
    || left.distance - right.distance
    || left.centerDistance - right.centerDistance
    || noteTimestampValue(left.entry.semantic) - noteTimestampValue(right.entry.semantic)
    || left.entry.semantic.voiceId - right.entry.semantic.voiceId
  ));

  const best = hits[0] ?? null;
  return best
    ? {
        entry: best.entry,
        rect: best.rect,
        hitRect: best.hitRect,
        center: best.center,
      }
    : null;
}

export function buildSemanticAnchorDebugBoxes(input: {
  ghostIndex: GhostNoteSpatialIndex;
  container: HTMLElement | null;
  measureOverlays: RenderedMeasureLayoutOverlay[];
  coreDocument: ScoreDocumentModel | null;
  staffDetailsByMeasure: Map<number, StaffDetail[]> | null | undefined;
  viewportBox: {
    width: number;
    height: number;
    scrollLeft: number;
    scrollTop: number;
  };
  graceEventIds: Set<string>;
}): SemanticAnchorDebugBox[] {
  const containerRect = input.container?.getBoundingClientRect() ?? null;
  const staffDetailsByMeasure = input.staffDetailsByMeasure ?? new Map<number, StaffDetail[]>();
  const staffVerticalFences = buildStaffVerticalFences(staffDetailsByMeasure);
  const measureOverlaysById = new Map<string, RenderedMeasureLayoutOverlay[]>();
  const measureOverlaysByNumber = new Map<number, RenderedMeasureLayoutOverlay[]>();
  input.measureOverlays.forEach((overlay) => {
    const overlays = measureOverlaysById.get(overlay.measureId) ?? [];
    overlays.push(overlay);
    measureOverlaysById.set(overlay.measureId, overlays);
    const numberOverlays = measureOverlaysByNumber.get(overlay.measureNumber) ?? [];
    numberOverlays.push(overlay);
    measureOverlaysByNumber.set(overlay.measureNumber, numberOverlays);
  });
  const viewportPadding = 140;
  const hasViewportBounds = input.viewportBox.width > 0 && input.viewportBox.height > 0;
  const viewportLeft = input.viewportBox.scrollLeft - viewportPadding;
  const viewportTop = input.viewportBox.scrollTop - viewportPadding;
  const viewportRight = input.viewportBox.scrollLeft + input.viewportBox.width + viewportPadding;
  const viewportBottom = input.viewportBox.scrollTop + input.viewportBox.height + viewportPadding;
  const groupedByPart = new Map<string, IndexedRenderedNote[]>();

  for (const entriesInMeasure of input.ghostIndex?.byMeasureId?.values() ?? []) {
    entriesInMeasure
      .filter((entry) => !input.graceEventIds.has(entry.semantic.coreEntityId ?? ''))
      .forEach((entry) => {
        const note = entry.semantic;
        const partKey = [
          note.measureNumber,
          note.corePartId ?? 'partless',
        ].join(':');
        const list = groupedByPart.get(partKey) ?? [];
        list.push(entry);
        groupedByPart.set(partKey, list);
      });
  }

  const boxes: SemanticAnchorDebugBox[] = [];
  for (const partEntries of groupedByPart.values()) {
    const first = partEntries[0]?.semantic;
    if (!first) continue;
    const meanY = partEntries.reduce((sum, entry) => sum + entry.rendered.domCenter.y, 0) / Math.max(partEntries.length, 1);
    const byCoreMeasureId = first.coreMeasureId
      ? measureOverlaysById.get(first.coreMeasureId) ?? []
      : [];
    const candidateMeasureOverlaysRaw = byCoreMeasureId.length > 0
      ? byCoreMeasureId
      : measureOverlaysByNumber.get(first.measureNumber) ?? [];
    const candidateMeasureOverlays = [...new Map(candidateMeasureOverlaysRaw.map((overlay) => [
      [
        overlay.measureId,
        Math.round(overlay.domRect.x * 2) / 2,
        Math.round(overlay.domRect.y * 2) / 2,
        Math.round(overlay.domRect.width * 2) / 2,
        Math.round(overlay.domRect.height * 2) / 2,
      ].join(':'),
      overlay,
    ])).values()];
    const measureOverlay = candidateMeasureOverlays
      .reduce((best, overlay) => {
        if (!best) return overlay;
        const bestCenterY = best.domRect.y + best.domRect.height / 2;
        const overlayCenterY = overlay.domRect.y + overlay.domRect.height / 2;
        return Math.abs(overlayCenterY - meanY) < Math.abs(bestCenterY - meanY) ? overlay : best;
      }, null as RenderedMeasureLayoutOverlay | null);
    const measureOverlayCenterY = measureOverlay
      ? measureOverlay.domRect.y + measureOverlay.domRect.height / 2
      : null;
    const sameRenderedGrandStaffOverlays = measureOverlay && measureOverlayCenterY != null
      ? candidateMeasureOverlays.filter((overlay) => {
          const overlayCenterY = overlay.domRect.y + overlay.domRect.height / 2;
          const rowTolerance = Math.max(measureOverlay.domRect.height * 1.5, 96);
          return Math.abs(overlayCenterY - measureOverlayCenterY) <= rowTolerance;
        })
      : [];
    const measureOverlayRect = measureOverlay
      ? (sameRenderedGrandStaffOverlays.length > 0 ? sameRenderedGrandStaffOverlays : [measureOverlay]).reduce((rect, overlay) => {
          const x = Math.min(rect.x, overlay.domRect.x);
          const right = Math.max(rect.x + rect.width, overlay.domRect.x + overlay.domRect.width);
          return {
            ...rect,
            x,
            width: right - x,
          };
        }, measureOverlay.domRect)
      : null;
    if (!measureOverlayRect || !(measureOverlayRect.width > 0)) continue;

    const staffDetails = staffDetailsByMeasure.get(first.measureNumber) ?? [];
    const measureDurationRatio = first.coreMeasureId
      ? Math.max(getMeasureDurationRatio(input.coreDocument, first.coreMeasureId) ?? 1, 1e-6)
      : 1;
    const protectLeadingModifiers = shouldProtectLeadingMeasureModifiers({
      overlay: measureOverlay,
      entries: partEntries,
      allOverlays: input.measureOverlays,
    });
    const uniformNoteStartX = uniformNoteStartXForEntries({
      entries: partEntries,
      containerRect,
      measureRect: measureOverlayRect,
      staffDetails,
      measureOverlay,
      measureOverlays: input.measureOverlays,
    });
    const measureRightX = measureOverlayRect.x + measureOverlayRect.width;
    const measureLeftX = resolveMeasureMusicalStartX({
      measureRect: measureOverlayRect,
      measureRight: measureRightX,
      protectLeadingModifiers,
      uniformNoteStartX,
    });
    const xStartReason: SemanticAnchorDebugBox['xStartReason'] = protectLeadingModifiers
      ? (measureLeftX > measureOverlayRect.x + 0.75 ? 'system-start-protected' : 'system-start-no-leading-modifier-detected')
      : 'normal-measure-left';
    const masterXGrid = buildMeasureXGrid({
      entries: partEntries,
      measureLeft: measureLeftX,
      measureRight: measureRightX,
      measureDurationRatio,
      containerRect,
      measureRect: measureOverlayRect,
      coreDocument: input.coreDocument,
    });

    const entriesByStaff = new Map<number, IndexedRenderedNote[]>();
    for (const entry of partEntries) {
      const list = entriesByStaff.get(entry.semantic.staffIndex) ?? [];
      list.push(entry);
      entriesByStaff.set(entry.semantic.staffIndex, list);
    }

    for (const [staffIndex, staffEntries] of entriesByStaff.entries()) {
      const staffMeanY = staffEntries.reduce((sum, entry) => sum + entry.rendered.domCenter.y, 0)
        / Math.max(staffEntries.length, 1);
      const measureCenterY = measureOverlayRect.y + (measureOverlayRect.height / 2);
      const rowTolerance = Math.max(measureOverlayRect.height * 0.35, 24);
      const staffProbeY = staffMeanY >= measureOverlayRect.y - rowTolerance
        && staffMeanY <= measureOverlayRect.y + measureOverlayRect.height + rowTolerance
        ? staffMeanY
        : measureCenterY;
      const staffDetail = findNearestStaffDetail(staffDetails, staffIndex, staffProbeY);
      const measureRect = captureMeasureRectForStaff(
        measureOverlayRect,
        staffDetail,
        staffDetails,
        findStaffVerticalFence(staffDetail, staffVerticalFences),
      );
      const zones = semanticAnchorCaptureZones({
        entries: staffEntries,
        containerRect,
        measureRect,
        measureDurationRatio,
        protectLeadingModifiers,
        uniformNoteStartX,
        masterXGrid,
        coreDocument: input.coreDocument,
      });
      const seenStaffZones = new Set<string>();
      for (const zone of zones) {
        const note = zone.entry.semantic;
        if (
          !Number.isFinite(zone.hitRect.x)
          || !Number.isFinite(zone.hitRect.y)
          || !(zone.hitRect.width > 0)
          || !(zone.hitRect.height > 0)
        ) continue;
        if (
          hasViewportBounds
          && (
            zone.hitRect.x + zone.hitRect.width < viewportLeft
            || zone.hitRect.x > viewportRight
            || zone.hitRect.y + zone.hitRect.height < viewportTop
            || zone.hitRect.y > viewportBottom
          )
        ) continue;
        const zoneKey = [
          note.coreMeasureId ?? note.measureNumber,
          note.staffIndex,
          timestampSlotKey(note),
          Math.round(zone.hitRect.x * 2) / 2,
          Math.round((zone.hitRect.x + zone.hitRect.width) * 2) / 2,
          Math.round(zone.hitRect.y * 2) / 2,
          Math.round((zone.hitRect.y + zone.hitRect.height) * 2) / 2,
        ].join(':');
        const duplicateOfEarlier = seenStaffZones.has(zoneKey);
        if (duplicateOfEarlier) continue;
        seenStaffZones.add(zoneKey);
        const hasRenderedVisual = Boolean(
          note.graphicalNote
          || zone.entry.rendered.svgElement
          || zone.entry.rendered.tintElement
        );
        const visualRect = normalizeSemanticAnchorRect(zone.entry.rendered.domRect, measureRect);
        const hitRect = resolveSemanticAnchorHitRect({
          zoneHitRect: zone.hitRect,
          visualRect,
          isRest: note.isRest,
          hasRenderedVisual,
        });

        boxes.push({
          id: [
            boxes.length,
            note.coreEntityId ?? zone.entry.rendered.id,
            note.coreMeasureId ?? note.measureNumber,
            note.staffIndex,
            note.voiceId,
            note.timestampNum,
            note.timestampDen,
            note.isRest ? 'rest' : `${note.step}${note.alter}${note.octave}`,
          ].join(':'),
          measureId: note.coreMeasureId ?? null,
          measureNumber: note.measureNumber,
          pageIndex: measureOverlay?.pageIndex ?? null,
          systemIndex: measureOverlay?.systemIndex ?? null,
          partId: note.corePartId ?? null,
          protectedSystemStart: protectLeadingModifiers,
          measureLeft: measureOverlayRect.x,
          measureRight: measureRightX,
          measureXStart: measureLeftX,
          measureXEnd: measureRightX,
          measureDuration: measureDurationRatio,
          durationRatio: zone.durationRatio,
          xStartReason,
          staffIndex: note.staffIndex,
          voiceId: note.voiceId,
          timestampNum: note.timestampNum,
          timestampDen: note.timestampDen,
          label: semanticAnchorLabel(note),
          isRest: note.isRest,
          hasRenderedVisual,
          duplicateOfEarlier,
          rect: hitRect,
          anchorRect: zone.rect,
          visualRect,
        });
      }
    }
  }

  const boxLaneKeys = new Set(boxes.map((box) => [
    box.measureId ?? box.measureNumber,
    box.partId ?? 'partless',
    box.staffIndex,
    box.voiceId,
  ].join(':')));
  for (const part of input.coreDocument?.score.parts ?? []) {
    for (const staff of part.staves) {
      for (const measure of staff.measures) {
        const candidateMeasureOverlays = measureOverlaysById.get(measure.id) ?? [];
        const measureOverlay = candidateMeasureOverlays[0] ?? null;
        if (!measureOverlay) continue;
        const staffDetails = staffDetailsByMeasure.get(measure.measureNumber) ?? [];
        const staffDetail = findNearestStaffDetail(
          staffDetails,
          staff.staffIndex,
          measureOverlay.domRect.y + (measureOverlay.domRect.height / 2),
        );
        const measureRect = captureMeasureRectForStaff(
          measureOverlay.domRect,
          staffDetail,
          staffDetails,
          findStaffVerticalFence(staffDetail, staffVerticalFences),
        );
        if (!measureRect || !(measureRect.width > 0) || !(measureRect.height > 0)) continue;
        if (
          hasViewportBounds
          && (
            measureRect.x + measureRect.width < viewportLeft
            || measureRect.x > viewportRight
            || measureRect.y + measureRect.height < viewportTop
            || measureRect.y > viewportBottom
          )
        ) continue;

        const voices = measure.voices.length > 0 ? measure.voices : [{ voiceId: 1 }];
        const measureRightX = measureRect.x + measureRect.width;
        const protectLeadingModifiers = shouldProtectLeadingMeasureModifiers({
          overlay: measureOverlay,
          entries: [],
          allOverlays: input.measureOverlays,
        });
        const protectedInset = protectLeadingModifiers
          ? Math.min(Math.max(48, measureRect.width * 0.3), 72, measureRect.width)
          : 0;
        const measureLeftX = protectLeadingModifiers
          ? Math.min(measureRect.x + protectedInset, Math.max(measureRightX - 1, measureRect.x))
          : measureRect.x;
        const measureDurationRatio = Math.max(getMeasureDurationRatio(input.coreDocument, measure.id) ?? 1, 1e-6);
        const fallbackRect = {
          x: measureLeftX,
          y: measureRect.y,
          width: Math.max(measureRightX - measureLeftX, 0),
          height: measureRect.height,
        };
        if (!(fallbackRect.width > 0) || !(fallbackRect.height > 0)) continue;

        for (const voice of voices) {
          const voiceId = voice.voiceId ?? 1;
          const laneKey = [
            measure.id,
            part.id ?? 'partless',
            staff.staffIndex,
            voiceId,
          ].join(':');
          if (boxLaneKeys.has(laneKey)) continue;
          boxLaneKeys.add(laneKey);
          boxes.push({
            id: [
              boxes.length,
              'core-grid-fallback',
              measure.id,
              part.id ?? 'partless',
              staff.staffIndex,
              voiceId,
            ].join(':'),
            measureId: measure.id,
            measureNumber: measure.measureNumber,
            pageIndex: measureOverlay.pageIndex ?? null,
            systemIndex: measureOverlay.systemIndex ?? null,
            partId: part.id ?? null,
            protectedSystemStart: protectLeadingModifiers,
            measureLeft: measureRect.x,
            measureRight: measureRightX,
            measureXStart: measureLeftX,
            measureXEnd: measureRightX,
            measureDuration: measureDurationRatio,
            durationRatio: measureDurationRatio,
            xStartReason: protectLeadingModifiers ? 'system-start-protected' : 'normal-measure-left',
            staffIndex: staff.staffIndex,
            voiceId,
            timestampNum: 0,
            timestampDen: 1,
            label: 'rest',
            isRest: true,
            hasRenderedVisual: false,
            duplicateOfEarlier: false,
            rect: fallbackRect,
            anchorRect: fallbackRect,
            visualRect: fallbackRect,
          });
        }
      }
    }
  }

  return boxes
    .sort((left, right) => (
      left.rect.y - right.rect.y
      || left.rect.x - right.rect.x
      || left.measureNumber - right.measureNumber
      || left.staffIndex - right.staffIndex
      || left.voiceId - right.voiceId
    ));
}

function semanticAnchorDebugBoxMatchesTarget(
  box: SemanticAnchorDebugBox,
  target: GhostNoteTarget | null,
) {
  if (!target) return false;
  if (target.pageIndex != null && box.pageIndex !== target.pageIndex) return false;
  if (target.systemIndex != null && box.systemIndex !== target.systemIndex) return false;
  if (target.corePartId && box.partId && box.partId !== target.corePartId) return false;
  if (box.staffIndex !== target.staffIndex) return false;
  if (box.voiceId !== target.voiceId) return false;
  if (!timestampsEqual(box.timestampNum, box.timestampDen, target.timestampNum, target.timestampDen)) return false;
  if (!semanticAnchorLabelMatches(target.semanticAnchorLabel, box.label, box.isRest)) return false;
  const sameMeasure = box.measureId && target.measureId
    ? box.measureId === target.measureId
    : box.measureNumber === target.measureNumber;
  if (!sameMeasure) return false;
  return true;
}

function semanticAnchorDebugBoxLooselyMatchesTarget(
  box: SemanticAnchorDebugBox,
  target: GhostNoteTarget | null,
) {
  if (!target) return false;
  if (isPointInsideNoteRect(target.domCenter, box.rect)) return true;
  const sameMeasure = box.measureId && target.measureId
    ? box.measureId === target.measureId
    : box.measureNumber === target.measureNumber;
  return sameMeasure
    && box.staffIndex === target.staffIndex
    && box.voiceId === target.voiceId
    && timestampsEqual(box.timestampNum, box.timestampDen, target.timestampNum, target.timestampDen)
    && semanticAnchorLabelMatches(target.semanticAnchorLabel, box.label, box.isRest);
}

function semanticSnapDebugPointMatchesTarget(
  point: SemanticSnapDebugPoint,
  target: GhostNoteTarget | null,
) {
  if (!target) return false;
  if (target.pageIndex != null && point.pageIndex !== target.pageIndex) return false;
  if (target.systemIndex != null && point.systemIndex !== target.systemIndex) return false;
  if (target.corePartId && point.partId && point.partId !== target.corePartId) return false;
  if (point.staffIndex !== target.staffIndex) return false;
  if (point.voiceId !== target.voiceId) return false;
  if (!timestampsEqual(point.timestampNum, point.timestampDen, target.timestampNum, target.timestampDen)) return false;
  const sameMeasure = point.measureId && target.measureId
    ? point.measureId === target.measureId
    : point.measureNumber === target.measureNumber;
  return sameMeasure;
}

export function buildSemanticActiveAnchorDebugReport(
  boxes: SemanticAnchorDebugBox[],
  target: GhostNoteTarget | null,
  snapPoints: SemanticSnapDebugPoint[] = [],
) {
  const looseMatches = [...new Map(
    boxes
      .filter((box) => semanticAnchorDebugBoxLooselyMatchesTarget(box, target))
      .map((box) => [[
        box.pageIndex ?? 'page',
        box.systemIndex ?? 'system',
        box.partId ?? 'partless',
        box.measureId ?? box.measureNumber,
        box.staffIndex,
        box.voiceId,
        (() => {
          const timestamp = normalizeFraction(box.timestampNum, Math.max(box.timestampDen, 1));
          return `${timestamp.num}/${timestamp.den}`;
        })(),
        box.label,
      ].join(':'), box]),
  ).values()];
  const strictMatches = boxes.filter((box) => semanticAnchorDebugBoxMatchesTarget(box, target));
  const strictSnapMatches = snapPoints.filter((point) => semanticSnapDebugPointMatchesTarget(point, target));
  const looseSystems = new Set(looseMatches.map((box) => `${box.pageIndex ?? 'page'}:${box.systemIndex ?? 'system'}`));
  const strictSystems = new Set(strictMatches.map((box) => `${box.pageIndex ?? 'page'}:${box.systemIndex ?? 'system'}`));
  const strictUniquelyResolvesTarget = strictMatches.length === 1 && strictSystems.size === 1;
  const strictLanes = new Set(strictMatches.map((box) => [
    box.pageIndex ?? 'page',
    box.systemIndex ?? 'system',
    box.partId ?? 'partless',
    box.measureId ?? box.measureNumber,
    box.staffIndex,
    box.voiceId,
    (() => {
      const timestamp = normalizeFraction(box.timestampNum, Math.max(box.timestampDen, 1));
      return `${timestamp.num}/${timestamp.den}`;
    })(),
    box.label,
  ].join(':')));
  const targetTimestampValue = target
    ? noteTimestampValue({
        timestampNum: target.timestampNum,
        timestampDen: target.timestampDen,
      })
    : null;
  const looseCoveredMatches = targetTimestampValue == null
    ? []
    : looseMatches.filter((box) => {
        const boxStart = noteTimestampValue({
          timestampNum: box.timestampNum,
          timestampDen: box.timestampDen,
        });
        const boxEnd = boxStart + Math.max(box.durationRatio, 1e-6);
        return targetTimestampValue >= boxStart - 1e-6 && targetTimestampValue < boxEnd - 1e-6;
      });
  const targetCoveredByLooseBox = looseCoveredMatches.length > 0;
  const issues: string[] = [];

  if (target && looseSystems.size > 1 && !strictUniquelyResolvesTarget) {
    issues.push([
      'hover target loose collision across systems',
      `target=m${target.measureNumber}:s${target.staffIndex}:v${target.voiceId}:${target.timestampNum}/${target.timestampDen}`,
      `targetSystem=${target.pageIndex ?? 'page'}:${target.systemIndex ?? 'system'}`,
      `looseMatches=${looseMatches.map((box) => `m${box.measureNumber}:s${box.staffIndex}@p${box.pageIndex ?? 'page'}:sys${box.systemIndex ?? 'system'}:${box.label}`).join(', ')}`,
    ].join(' | '));
  }

  if (target && strictMatches.length > 1 && strictSystems.size > 1) {
    issues.push([
      'hover target active in multiple systems',
      `target=m${target.measureNumber}:s${target.staffIndex}:v${target.voiceId}:${target.timestampNum}/${target.timestampDen}`,
      `strictMatches=${strictMatches.map((box) => `m${box.measureNumber}@p${box.pageIndex ?? 'page'}:sys${box.systemIndex ?? 'system'}:${box.label}`).join(', ')}`,
    ].join(' | '));
  }
  if (target && strictLanes.size > 1) {
    issues.push([
      'hover target active in multiple semantic lanes',
      `target=m${target.measureNumber}:s${target.staffIndex}:v${target.voiceId}:${target.timestampNum}/${target.timestampDen}`,
      `strictMatches=${strictMatches.map((box) => `m${box.measureNumber}:s${box.staffIndex}:v${box.voiceId}@p${box.pageIndex ?? 'page'}:sys${box.systemIndex ?? 'system'}:${box.label}`).join(', ')}`,
    ].join(' | '));
  }
  const looseTimestampMismatches = target
    ? looseMatches.filter((box) => !timestampsEqual(box.timestampNum, box.timestampDen, target.timestampNum, target.timestampDen))
    : [];
  const targetHasExactSnapPoint = strictSnapMatches.length > 0;
  if (target && strictMatches.length === 0 && !targetHasExactSnapPoint && looseMatches.length > 0 && !targetCoveredByLooseBox) {
    issues.push([
      'hover target has no strict semantic snap',
      `target=m${target.measureNumber}:s${target.staffIndex}:v${target.voiceId}:${target.timestampNum}/${target.timestampDen}`,
      `looseMatches=${looseMatches.map((box) => `m${box.measureNumber}:s${box.staffIndex}:v${box.voiceId}:${box.timestampNum}/${box.timestampDen}:${box.label}`).join(', ')}`,
    ].join(' | '));
  }
  if (target && !targetHasExactSnapPoint && looseTimestampMismatches.length > 0 && !targetCoveredByLooseBox) {
    issues.push([
      'hover target is inside a different semantic timestamp box',
      `target=m${target.measureNumber}:s${target.staffIndex}:v${target.voiceId}:${target.timestampNum}/${target.timestampDen}`,
      `containingBoxes=${looseTimestampMismatches.map((box) => `m${box.measureNumber}:s${box.staffIndex}:v${box.voiceId}:${box.timestampNum}/${box.timestampDen}:${box.label}`).join(', ')}`,
    ].join(' | '));
  }

  return {
    issueCount: issues.length,
    issues,
    looseAmbiguousAcrossSystems: Boolean(target && looseSystems.size > 1 && !strictUniquelyResolvesTarget),
    looseCrossSystemCandidateCount: looseSystems.size,
    strictUniquelyResolvesTarget,
    strictSnapMatchCount: strictSnapMatches.length,
    target: target
      ? {
          measure: target.measureNumber,
          page: target.pageIndex ?? null,
          system: target.systemIndex ?? null,
          part: target.corePartId,
          staff: target.staffIndex,
          voice: target.voiceId,
          timestamp: `${target.timestampNum}/${target.timestampDen}`,
          label: target.semanticAnchorLabel ?? null,
        }
      : null,
    looseMatchCount: looseMatches.length,
    strictMatchCount: strictMatches.length,
    looseMatches: looseMatches.map((box) => ({
      measure: box.measureNumber,
      page: box.pageIndex,
      system: box.systemIndex,
      part: box.partId,
      staff: box.staffIndex,
      voice: box.voiceId,
      timestamp: `${box.timestampNum}/${box.timestampDen}`,
      label: box.label,
      left: Math.round(box.rect.x * 100) / 100,
      right: Math.round((box.rect.x + box.rect.width) * 100) / 100,
      top: Math.round(box.rect.y * 100) / 100,
      bottom: Math.round((box.rect.y + box.rect.height) * 100) / 100,
    })),
    strictMatches: strictMatches.map((box) => ({
      measure: box.measureNumber,
      page: box.pageIndex,
      system: box.systemIndex,
      part: box.partId,
      staff: box.staffIndex,
      voice: box.voiceId,
      timestamp: `${box.timestampNum}/${box.timestampDen}`,
      label: box.label,
      left: Math.round(box.rect.x * 100) / 100,
      right: Math.round((box.rect.x + box.rect.width) * 100) / 100,
      top: Math.round(box.rect.y * 100) / 100,
      bottom: Math.round((box.rect.y + box.rect.height) * 100) / 100,
    })),
    strictSnapMatches: strictSnapMatches.map((point) => ({
      measure: point.measureNumber,
      page: point.pageIndex,
      system: point.systemIndex,
      part: point.partId,
      staff: point.staffIndex,
      voice: point.voiceId,
      timestamp: `${point.timestampNum}/${point.timestampDen}`,
      x: Math.round(point.x * 100) / 100,
      y: Math.round(point.y * 100) / 100,
      synthetic: point.synthetic,
      rest: point.isRest,
    })),
  };
}

function buildSemanticMeasureGuardDebugLines(boxes: SemanticAnchorDebugBox[]): SemanticMeasureGuardDebugLine[] {
  const groups = new Map<string, SemanticAnchorDebugBox[]>();
  for (const box of boxes) {
    const key = [
      box.pageIndex ?? 'page',
      box.systemIndex ?? 'system',
      box.measureId ?? box.measureNumber,
      box.partId ?? 'partless',
      box.staffIndex,
    ].join(':');
    const group = groups.get(key) ?? [];
    group.push(box);
    groups.set(key, group);
  }

  const guards: SemanticMeasureGuardDebugLine[] = [];
  for (const group of groups.values()) {
    const first = group[0];
    if (!first) continue;
    const left = first.measureXStart;
    const right = first.measureXEnd;
    const y = Math.min(...group.map((box) => box.rect.y));
    const bottom = Math.max(...group.map((box) => box.rect.y + box.rect.height));
    const height = Math.max(bottom - y, 0);
    if (!Number.isFinite(left) || !Number.isFinite(right) || !(height > 0)) continue;

    guards.push({
      id: `${first.measureId ?? first.measureNumber}:${first.staffIndex}:left`,
      measureId: first.measureId,
      measureNumber: first.measureNumber,
      pageIndex: first.pageIndex,
      systemIndex: first.systemIndex,
      staffIndex: first.staffIndex,
      edge: 'left',
      protectedSystemStart: first.protectedSystemStart,
      x: left,
      y,
      height,
    }, {
      id: `${first.measureId ?? first.measureNumber}:${first.staffIndex}:right`,
      measureId: first.measureId,
      measureNumber: first.measureNumber,
      pageIndex: first.pageIndex,
      systemIndex: first.systemIndex,
      staffIndex: first.staffIndex,
      edge: 'right',
      protectedSystemStart: first.protectedSystemStart,
      x: right,
      y,
      height,
    });
  }

  return guards.sort((left, right) => (
    left.y - right.y
    || left.x - right.x
    || left.measureNumber - right.measureNumber
    || left.staffIndex - right.staffIndex
    || left.edge.localeCompare(right.edge)
  ));
}

function buildSemanticOverlapDebugRects(boxes: SemanticAnchorDebugBox[]): SemanticOverlapDebugRect[] {
  const overlaps: SemanticOverlapDebugRect[] = [];
  const seen = new Set<string>();

  for (let leftIndex = 0; leftIndex < boxes.length; leftIndex += 1) {
    const left = boxes[leftIndex]!;
    for (let rightIndex = leftIndex + 1; rightIndex < boxes.length; rightIndex += 1) {
      const right = boxes[rightIndex]!;
      if (left.staffIndex !== right.staffIndex) continue;
      if ((left.pageIndex ?? null) !== (right.pageIndex ?? null)) continue;
      if ((left.systemIndex ?? null) !== (right.systemIndex ?? null)) continue;
      if ((left.partId ?? null) !== (right.partId ?? null)) continue;

      const overlapLeft = Math.max(left.rect.x, right.rect.x);
      const overlapRight = Math.min(left.rect.x + left.rect.width, right.rect.x + right.rect.width);
      const overlapTop = Math.max(left.rect.y, right.rect.y);
      const overlapBottom = Math.min(left.rect.y + left.rect.height, right.rect.y + right.rect.height);
      const width = overlapRight - overlapLeft;
      const height = overlapBottom - overlapTop;
      if (width <= 0.75 || height <= 0.75) continue;

      const key = [
        left.pageIndex ?? 'page',
        left.systemIndex ?? 'system',
        left.partId ?? 'partless',
        left.staffIndex,
        Math.round(overlapLeft * 2) / 2,
        Math.round(overlapRight * 2) / 2,
        Math.round(overlapTop * 2) / 2,
        Math.round(overlapBottom * 2) / 2,
      ].join(':');
      if (seen.has(key)) continue;
      seen.add(key);

      overlaps.push({
        id: `${left.id}:${right.id}:${key}`,
        kind: 'overdraw',
        message: [
          'layout error: semantic hitboxes overdraw',
          `m${left.measureNumber}:s${left.staffIndex}:${left.label}`,
          `m${right.measureNumber}:s${right.staffIndex}:${right.label}`,
          `${Math.round(width * 100) / 100}x${Math.round(height * 100) / 100}px`,
        ].join(' | '),
        measures: [...new Set([left.measureNumber, right.measureNumber])].sort((a, b) => a - b),
        staffIndex: left.staffIndex,
        contributors: [left, right].map((box) => ({
          measureNumber: box.measureNumber,
          staffIndex: box.staffIndex,
          voiceId: box.voiceId,
          timestamp: `${box.timestampNum}/${box.timestampDen}`,
          label: box.label,
          rect: box.rect,
        })),
        rect: {
          x: overlapLeft,
          y: overlapTop,
          width,
          height,
        },
      });
    }
  }

  return overlaps.sort((left, right) => (
    left.rect.y - right.rect.y
    || left.rect.x - right.rect.x
    || left.staffIndex - right.staffIndex
  ));
}

function buildSemanticProtectedDebugRects(boxes: SemanticAnchorDebugBox[]): SemanticProtectedDebugRect[] {
  const groups = new Map<string, SemanticAnchorDebugBox[]>();
  for (const box of boxes) {
    if (box.measureXStart <= box.measureLeft + 0.75) continue;
    const key = [
      box.pageIndex ?? 'page',
      box.systemIndex ?? 'system',
      box.measureId ?? box.measureNumber,
      box.staffIndex,
    ].join(':');
    const group = groups.get(key) ?? [];
    group.push(box);
    groups.set(key, group);
  }

  const rects: SemanticProtectedDebugRect[] = [];
  for (const group of groups.values()) {
    const first = group[0];
    if (!first) continue;
    const top = Math.min(...group.map((box) => box.rect.y));
    const bottom = Math.max(...group.map((box) => box.rect.y + box.rect.height));
    const width = first.measureXStart - first.measureLeft;
    if (!(width > 0.75) || !(bottom > top)) continue;
    rects.push({
      id: `${first.measureId ?? first.measureNumber}:${first.staffIndex}:protected`,
      measureId: first.measureId,
      measureNumber: first.measureNumber,
      pageIndex: first.pageIndex,
      systemIndex: first.systemIndex,
      partId: first.partId,
      staffIndex: first.staffIndex,
      reason: first.xStartReason,
      rect: {
        x: first.measureLeft,
        y: top,
        width,
        height: bottom - top,
      },
    });
  }

  return rects.sort((left, right) => (
    left.rect.y - right.rect.y
    || left.rect.x - right.rect.x
    || left.measureNumber - right.measureNumber
    || left.staffIndex - right.staffIndex
  ));
}

function buildSemanticSnapDebugPoints(input: {
  renderedGhostGrid: RenderedGhostGrid;
  measureOverlays: RenderedMeasureLayoutOverlay[];
  staffDetailsByMeasure: Map<number, StaffDetail[]> | null | undefined;
  anchorBoxes?: SemanticAnchorDebugBox[];
  activeTarget: GhostNoteTarget | null;
  viewportBox?: {
    width: number;
    height: number;
    scrollLeft: number;
    scrollTop: number;
  } | null;
}): SemanticSnapDebugPoint[] {
  const overlayByMeasureId = new Map(input.measureOverlays.map((overlay) => [overlay.measureId, overlay]));
  const protectedStartByLane = new Map<string, number>();
  for (const box of input.anchorBoxes ?? []) {
    if (!box.protectedSystemStart || box.measureXStart <= box.measureLeft + 0.75) continue;
    const key = [
      box.measureId ?? box.measureNumber,
      box.partId ?? 'partless',
      box.staffIndex,
    ].join(':');
    const current = protectedStartByLane.get(key);
    protectedStartByLane.set(key, current == null ? box.measureXStart : Math.max(current, box.measureXStart));
  }
  const points: SemanticSnapDebugPoint[] = [];
  const roundX = (value: number) => Math.round(value * 100) / 100;
  const createDebugPointId = (
    point: RenderedGhostGridPoint,
    kind: 'visible' | 'synthetic-grid-collapsed',
    pointX = point.domX,
  ) => {
    const timestamp = normalizeFraction(point.timestampNum, Math.max(point.timestampDen, 1));
    return [
      point.measureId,
      point.corePartId ?? 'partless',
      `staff:${point.staffIndex}`,
      `voice:${point.voiceId}`,
      `time:${timestamp.num}/${timestamp.den}`,
      point.synthetic ? 'synthetic' : 'rendered',
      point.isRest ? 'rest' : 'note',
      `x:${roundX(pointX)}`,
      `y:${Math.round(point.domY * 100) / 100}`,
      kind,
      point.id,
    ].join(':');
  };
  const resolvePointY = (point: RenderedGhostGridPoint, overlay: RenderedMeasureLayoutOverlay | null) => {
    const overlayCenterY = overlay ? overlay.domRect.y + (overlay.domRect.height / 2) : null;
    const staff = findNearestStaffDetail(
      input.staffDetailsByMeasure?.get(point.measureNumber) ?? [],
      point.staffIndex,
      point.synthetic ? overlayCenterY : point.domY,
    );
    if (staff) {
      return (staff.topLineDomY + staff.bottomLineDomY) / 2;
    }
    if (overlay) {
      const top = overlay.domRect.y - 2;
      const bottom = overlay.domRect.y + overlay.domRect.height + 2;
      if (point.domY >= top && point.domY <= bottom) return point.domY;
      return overlay.domRect.y + (overlay.domRect.height / 2);
    }
    return point.domY;
  };
  const resolvePointX = (point: RenderedGhostGridPoint) => {
    const protectedStart = protectedStartByLane.get([
      point.measureId,
      point.corePartId ?? 'partless',
      point.staffIndex,
    ].join(':'));
    const overlay = overlayByMeasureId.get(point.measureId) ?? null;
    const timestamp = normalizeFraction(point.timestampNum, Math.max(point.timestampDen, 1));
    const isPreservedLeadingRest = Boolean(
      point.isRest
      && !point.synthetic
      && point.coreEntityId
      && timestamp.num === 0
      && overlay
      && point.domX >= leadingTimeSignatureGuardRightX(overlay) - 0.75
      && protectedStart != null
      && point.domX < protectedStart - 0.5
    );
    if (isPreservedLeadingRest) return point.domX;
    if (point.isRest && protectedStart != null && point.domX < protectedStart - 0.5) {
      return protectedStart;
    }
    return point.domX;
  };

  for (const measureGrid of input.renderedGhostGrid.byMeasureId.values()) {
    const overlay = overlayByMeasureId.get(measureGrid.measureId) ?? null;
    const byRhythmicPosition = new Map<string, RenderedGhostGridPoint[]>();
    for (const point of measureGrid.points) {
      const timestamp = normalizeFraction(point.timestampNum, Math.max(point.timestampDen, 1));
      const key = [
        point.measureId,
        point.staffIndex,
        timestamp.num,
        timestamp.den,
      ].join(':');
      const group = byRhythmicPosition.get(key) ?? [];
      group.push(point);
      byRhythmicPosition.set(key, group);
    }

    for (const rawCandidates of byRhythmicPosition.values()) {
      const validCandidates = rawCandidates.filter((point) => Number.isFinite(point.domX) && Number.isFinite(point.domY));
      if (validCandidates.length === 0) continue;

      const matchesActive = (point: RenderedGhostGridPoint) => Boolean(input.activeTarget
        && point.measureId === input.activeTarget.measureId
        && point.staffIndex === input.activeTarget.staffIndex
        && point.voiceId === input.activeTarget.voiceId
        && timestampsEqual(
          point.timestampNum,
          point.timestampDen,
          input.activeTarget.timestampNum,
          input.activeTarget.timestampDen,
        ));
      const realCandidates = validCandidates.filter((point) => !point.synthetic);
      const visibleCandidates = realCandidates.length > 0 ? realCandidates : validCandidates;
      const point = visibleCandidates
        .slice()
        .sort((left, right) => (
          Number(matchesActive(right)) - Number(matchesActive(left))
          || Number(left.synthetic) - Number(right.synthetic)
          || Number(left.isRest) - Number(right.isRest)
          || left.voiceId - right.voiceId
          || left.domX - right.domX
          || left.id.localeCompare(right.id)
        ))[0]!;
      const pointX = resolvePointX(point);
      const rawXs = [...new Set(validCandidates.map((candidate) => roundX(resolvePointX(candidate))))].sort((left, right) => left - right);
      const active = Boolean(input.activeTarget
        && point.measureId === input.activeTarget.measureId
        && point.staffIndex === input.activeTarget.staffIndex
        && timestampsEqual(
          point.timestampNum,
          point.timestampDen,
          input.activeTarget.timestampNum,
          input.activeTarget.timestampDen,
        ));
      points.push({
        id: createDebugPointId(point, 'visible', pointX),
        measureId: point.measureId,
        measureNumber: point.measureNumber,
        pageIndex: overlay?.pageIndex ?? null,
        systemIndex: overlay?.systemIndex ?? null,
        partId: point.corePartId,
        staffIndex: point.staffIndex,
        voiceId: point.voiceId,
        timestampNum: point.timestampNum,
        timestampDen: point.timestampDen,
        ratio: point.ratio,
        x: pointX,
        y: resolvePointY(point, overlay),
        isRest: point.isRest,
        synthetic: point.synthetic,
        active,
        sourceCount: validCandidates.length,
        distinctXCount: rawXs.length,
        suppressedSyntheticCount: realCandidates.length > 0
          ? validCandidates.filter((candidate) => candidate.synthetic).length
          : 0,
        rawXs,
        issue: rawXs.length > 1 ? 'multi-x' : null,
      });
    }
  }

  const viewportPadding = 140;
  const viewportBox = input.viewportBox ?? null;
  const hasViewportBounds = Boolean(viewportBox && viewportBox.width > 0 && viewportBox.height > 0);
  const visiblePoints = hasViewportBounds && viewportBox
    ? points.filter((point) => (
        point.x >= viewportBox.scrollLeft - viewportPadding
        && point.x <= viewportBox.scrollLeft + viewportBox.width + viewportPadding
        && point.y >= viewportBox.scrollTop - viewportPadding
        && point.y <= viewportBox.scrollTop + viewportBox.height + viewportPadding
      ))
    : points;

  const sortedPoints = visiblePoints.sort((left, right) => (
    left.y - right.y
    || left.x - right.x
    || left.measureNumber - right.measureNumber
    || left.staffIndex - right.staffIndex
    || left.voiceId - right.voiceId
    || left.id.localeCompare(right.id)
  ));
  const byVisibleStaff = new Map<string, SemanticSnapDebugPoint[]>();
  for (const point of sortedPoints) {
    const key = [
      point.measureId,
      point.staffIndex,
      point.voiceId,
    ].join(':');
    const group = byVisibleStaff.get(key) ?? [];
    group.push(point);
    byVisibleStaff.set(key, group);
  }
  for (const staffPoints of byVisibleStaff.values()) {
    const ratios = [...new Set(staffPoints.map((point) => Math.round(point.ratio * 1_000_000) / 1_000_000))]
      .sort((left, right) => left - right);
    for (let index = 0; index < ratios.length - 1; index += 1) {
      const ratio = ratios[index]!;
      const current = staffPoints.filter((point) => Math.abs(point.ratio - ratio) <= 1e-6);
      if (current.some((point) => !point.isRest)) continue;
      const rests = current.filter((point) => point.isRest);
      if (rests.length === 0) continue;
      const later = staffPoints.filter((point) => point.ratio > ratio + 1e-6);
      const nextX = Math.min(...later.map((point) => point.x));
      if (!Number.isFinite(nextX)) continue;
      for (const rest of rests) {
        if (rest.x <= nextX - 4) continue;
        rest.x = nextX - 4;
      }
    }
  }
  const idCounts = new Map<string, number>();

  return sortedPoints.map((point) => {
    const duplicateIndex = idCounts.get(point.id) ?? 0;
    idCounts.set(point.id, duplicateIndex + 1);
    if (duplicateIndex === 0) return point;
    return {
      ...point,
      id: `${point.id}:duplicate:${duplicateIndex}`,
    };
  });
}

export function buildSemanticSnapColumnDebugLines(input: {
  snapPoints: SemanticSnapDebugPoint[];
  systemOverlays: RenderedSystemLayoutOverlay[];
  measureOverlays: RenderedMeasureLayoutOverlay[];
  viewportBox?: {
    width: number;
    height: number;
    scrollLeft: number;
    scrollTop: number;
  } | null;
}): SemanticSnapColumnDebugLine[] {
  const systemByKey = new Map(input.systemOverlays.map((overlay) => [
    `${overlay.pageIndex}:${overlay.systemIndex}`,
    overlay,
  ]));
  const measureBoundsBySystem = new Map<string, RectLike>();
  for (const overlay of input.measureOverlays) {
    const key = `${overlay.pageIndex}:${overlay.systemIndex}`;
    const existing = measureBoundsBySystem.get(key);
    if (!existing) {
      measureBoundsBySystem.set(key, { ...overlay.domRect });
      continue;
    }
    const left = Math.min(existing.x, overlay.domRect.x);
    const top = Math.min(existing.y, overlay.domRect.y);
    const right = Math.max(existing.x + existing.width, overlay.domRect.x + overlay.domRect.width);
    const bottom = Math.max(existing.y + existing.height, overlay.domRect.y + overlay.domRect.height);
    measureBoundsBySystem.set(key, {
      x: left,
      y: top,
      width: right - left,
      height: bottom - top,
    });
  }

  const groups = new Map<string, SemanticSnapDebugPoint[]>();
  for (const point of input.snapPoints) {
    const roundedX = Math.round(point.x * 100) / 100;
    const key = [
      point.pageIndex ?? 'page',
      point.systemIndex ?? 'system',
      roundedX,
    ].join(':');
    const group = groups.get(key) ?? [];
    group.push(point);
    groups.set(key, group);
  }

  const lines: SemanticSnapColumnDebugLine[] = [];
  for (const group of groups.values()) {
    const first = group[0];
    if (!first) continue;
    const systemKey = `${first.pageIndex ?? 'page'}:${first.systemIndex ?? 'system'}`;
    const system = first.pageIndex != null && first.systemIndex != null
      ? systemByKey.get(`${first.pageIndex}:${first.systemIndex}`) ?? null
      : null;
    const fallbackBounds = measureBoundsBySystem.get(systemKey) ?? null;
    const bounds = system?.domRect ?? fallbackBounds;
    if (!bounds || !(bounds.height > 0)) continue;
    const x = Math.round((group.reduce((sum, point) => sum + point.x, 0) / group.length) * 100) / 100;
    const top = bounds.y;
    const bottom = bounds.y + bounds.height;
    lines.push({
      id: [
        first.pageIndex ?? 'page',
        first.systemIndex ?? 'system',
        `x:${x}`,
      ].join(':'),
      pageIndex: first.pageIndex,
      systemIndex: first.systemIndex,
      x,
      top,
      bottom,
      active: group.some((point) => point.active),
      issue: group.find((point) => point.issue)?.issue ?? null,
      snapCount: group.length,
      measures: [...new Set(group.map((point) => point.measureNumber))].sort((left, right) => left - right),
      staves: [...new Set(group.map((point) => point.staffIndex))].sort((left, right) => left - right),
      timestamps: [...new Set(group.map((point) => `${point.timestampNum}/${point.timestampDen}`))].sort(),
    });
  }

  const viewport = input.viewportBox ?? null;
  const filtered = viewport && viewport.width > 0 && viewport.height > 0
    ? lines.filter((line) => (
        line.x >= viewport.scrollLeft - 80
        && line.x <= viewport.scrollLeft + viewport.width + 80
        && line.bottom >= viewport.scrollTop - 120
        && line.top <= viewport.scrollTop + viewport.height + 120
      ))
    : lines;

  return filtered.sort((left, right) => (
    left.top - right.top
    || left.x - right.x
    || (left.systemIndex ?? 0) - (right.systemIndex ?? 0)
    || left.id.localeCompare(right.id)
  ));
}

export function buildSemanticPitchDebugBands(input: {
  measureOverlays: RenderedMeasureLayoutOverlay[];
  staffDetailsByMeasure: Map<number, StaffDetail[]> | null | undefined;
  coreDocument: ScoreDocumentModel | null | undefined;
  boxes?: SemanticAnchorDebugBox[];
  viewportBox?: {
    width: number;
    height: number;
    scrollLeft: number;
    scrollTop: number;
  } | null;
}): SemanticPitchDebugBand[] {
  const bands: SemanticPitchDebugBand[] = [];
  const seen = new Set<string>();
  const viewport = input.viewportBox ?? null;
  for (const overlay of input.measureOverlays) {
    if (viewport) {
      const viewportLeft = viewport.scrollLeft - 80;
      const viewportRight = viewport.scrollLeft + viewport.width + 80;
      const viewportTop = viewport.scrollTop - 160;
      const viewportBottom = viewport.scrollTop + viewport.height + 160;
      const overlayBottom = overlay.domRect.y + overlay.domRect.height;
      const overlayRight = overlay.domRect.x + overlay.domRect.width;
      if (overlayRight < viewportLeft || overlay.domRect.x > viewportRight || overlayBottom < viewportTop || overlay.domRect.y > viewportBottom) {
        continue;
      }
    }

    const overlayStaffIndex = staffIndexForMeasureId(input.coreDocument, overlay.measureId);
    const staffDetails = collectUniqueStaffRows(new Map([[
      overlay.measureNumber,
      input.staffDetailsByMeasure?.get(overlay.measureNumber) ?? overlay.staffDetails ?? [],
    ]])).filter((staff) => overlayStaffIndex == null || staff.staffIndex === overlayStaffIndex);
    const measureBoxes = (input.boxes ?? [])
      .filter((box) => (
        !box.duplicateOfEarlier
        && (box.measureId === overlay.measureId || box.measureNumber === overlay.measureNumber)
        && (box.systemIndex == null || overlay.systemIndex == null || box.systemIndex === overlay.systemIndex)
      ));
    for (const staff of staffDetails) {
      if (!(staff.lineDistanceDom > 0)) continue;
      const staffBoxes = measureBoxes
        .filter((box) => box.staffIndex === staff.staffIndex)
        .sort((left, right) => (
          left.rect.x - right.rect.x
          || left.rect.width - right.rect.width
          || left.voiceId - right.voiceId
        ));
      const rawSegments = staffBoxes.length > 0
        ? staffBoxes.map((box) => ({ x: box.rect.x, width: box.rect.width }))
        : [{ x: overlay.domRect.x, width: overlay.domRect.width }];
      const segments = [...new Map(rawSegments
        .filter((segment) => segment.width > 0.75)
        .map((segment) => [
          `${Math.round(segment.x * 100) / 100}:${Math.round(segment.width * 100) / 100}`,
          segment,
        ])).values()]
        .sort((left, right) => left.x - right.x || left.width - right.width);
      const clef = resolveClefAtMeasure(input.coreDocument, overlay.measureNumber, staff.staffIndex, {
        corePartId: corePartIdForMeasureId(input.coreDocument, overlay.measureId),
        measureId: overlay.measureId,
      });
      const topStaffStep = mouseEntryTopStaffStep();
      const bottomStaffStep = Math.max(mouseEntryBottomStaffStep(staff.lineCount), 4);
      const halfStep = staff.lineDistanceDom / 2;
      for (let staffStep = topStaffStep; staffStep <= bottomStaffStep; staffStep += 1) {
        const pitch = resolveStaffStepPitch(staffStep, clef);
        const centerY = staff.topLineDomY + (staffStep * halfStep);
        const height = Math.max(halfStep, 3);
        for (const segment of segments) {
          const key = [
            overlay.measureId,
            overlay.pageIndex ?? 'page',
            overlay.systemIndex ?? 'system',
            staff.staffIndex,
            staffStep,
            Math.round(segment.x * 100) / 100,
            Math.round(segment.width * 100) / 100,
          ].join(':');
          if (seen.has(key)) continue;
          seen.add(key);
          bands.push({
            id: key,
            measureId: overlay.measureId,
            measureNumber: overlay.measureNumber,
            pageIndex: overlay.pageIndex ?? null,
            systemIndex: overlay.systemIndex ?? null,
            partId: corePartIdForMeasureId(input.coreDocument, overlay.measureId),
            staffIndex: staff.staffIndex,
            staffStep,
            pitch: `${pitch.step}${pitch.octave}`,
            centerY,
            rect: {
              x: segment.x,
              y: centerY - (height / 2),
              width: segment.width,
              height,
            },
          });
        }
      }
    }
  }
  return bands.sort((left, right) => (
    left.rect.y - right.rect.y
    || left.rect.x - right.rect.x
    || left.measureNumber - right.measureNumber
    || left.staffIndex - right.staffIndex
    || left.staffStep - right.staffStep
  ));
}

function ghostTargetOverlapsProtectedRect(
  target: GhostNoteTarget | null,
  protectedRects: SemanticProtectedDebugRect[],
) {
  if (!target || target.placementMode === 'chord') return false;
  if (isResolvedFirstSlotRestSnapTarget(target)) return false;
  const noteheadX = ghostVisibleNoteheadCenterX(target);
  const noteheadY = target.previewTop + 28;
  return protectedRects.some((region) => (
    noteheadX >= region.rect.x - 0.75
    && noteheadX < region.rect.x + region.rect.width - 0.75
    && noteheadY >= region.rect.y - 12
    && noteheadY <= region.rect.y + region.rect.height + 12
  ));
}

function ghostTargetOverlapsBarlineGuard(
  target: GhostNoteTarget | null,
  measureOverlays: RenderedMeasureLayoutOverlay[],
) {
  if (!target || target.placementMode === 'chord') return false;
  const noteheadX = ghostVisibleNoteheadCenterX(target);
  return measureOverlays.some((overlay) => {
    if (
      overlay.measureId !== target.measureId
      && !(
        overlay.measureNumber === target.measureNumber
        && (target.systemIndex == null || overlay.systemIndex === target.systemIndex)
      )
    ) return false;
    const left = overlay.domRect.x;
    const right = overlay.domRect.x + overlay.domRect.width;
    return Math.abs(noteheadX - left) <= BARLINE_GHOST_GUARD_PX
      || Math.abs(noteheadX - right) <= BARLINE_GHOST_GUARD_PX;
  });
}

function ghostTargetOverlapsLeadingTimeSignatureGuard(
  target: GhostNoteTarget | null,
  measureOverlays: RenderedMeasureLayoutOverlay[],
) {
  if (!target || target.placementMode === 'chord') return false;
  const noteheadX = ghostVisibleNoteheadCenterX(target);
  return measureOverlays.some((overlay) => {
    const matchesTargetMeasure = (
      overlay.measureId === target.measureId
      || (
        overlay.measureNumber === target.measureNumber
        && (target.systemIndex == null || overlay.systemIndex === target.systemIndex)
      )
    );
    if (!matchesTargetMeasure) return false;
    if (!shouldProtectLeadingMeasureModifiers({
      overlay,
      entries: [],
      allOverlays: measureOverlays,
    })) return false;
    return noteheadX < leadingTimeSignatureGuardRightX(overlay) - 0.75;
  });
}

function buildSemanticProtectedOverlapDebugRects(
  boxes: SemanticAnchorDebugBox[],
  protectedRects: SemanticProtectedDebugRect[],
): SemanticOverlapDebugRect[] {
  const overlaps: SemanticOverlapDebugRect[] = [];
  const seen = new Set<string>();

  for (const box of boxes) {
    for (const protectedRect of protectedRects) {
      if ((box.partId ?? null) !== (protectedRect.partId ?? null)) continue;
      if (box.staffIndex !== protectedRect.staffIndex) continue;
      if ((box.pageIndex ?? null) !== (protectedRect.pageIndex ?? null)) continue;
      if ((box.systemIndex ?? null) !== (protectedRect.systemIndex ?? null)) continue;

      const overlapLeft = Math.max(box.rect.x, protectedRect.rect.x);
      const overlapRight = Math.min(box.rect.x + box.rect.width, protectedRect.rect.x + protectedRect.rect.width);
      const overlapTop = Math.max(box.rect.y, protectedRect.rect.y);
      const overlapBottom = Math.min(box.rect.y + box.rect.height, protectedRect.rect.y + protectedRect.rect.height);
      const width = overlapRight - overlapLeft;
      const height = overlapBottom - overlapTop;
      if (width <= 0.75 || height <= 0.75) continue;

      const key = [
        protectedRect.measureNumber,
        box.measureNumber,
        box.staffIndex,
        Math.round(overlapLeft * 2) / 2,
        Math.round(overlapRight * 2) / 2,
        Math.round(overlapTop * 2) / 2,
        Math.round(overlapBottom * 2) / 2,
      ].join(':');
      if (seen.has(key)) continue;
      seen.add(key);

      overlaps.push({
        id: `${box.id}:${protectedRect.id}:${key}`,
        kind: 'protected-overlap',
        message: [
          'layout error: semantic hitbox overlaps protected notation',
          `m${box.measureNumber}:s${box.staffIndex}:${box.label}`,
          protectedRect.reason,
          `${Math.round(width * 100) / 100}x${Math.round(height * 100) / 100}px`,
        ].join(' | '),
        measures: [box.measureNumber],
        staffIndex: box.staffIndex,
        contributors: [{
          measureNumber: box.measureNumber,
          staffIndex: box.staffIndex,
          voiceId: box.voiceId,
          timestamp: `${box.timestampNum}/${box.timestampDen}`,
          label: box.label,
          rect: box.rect,
        }],
        rect: {
          x: overlapLeft,
          y: overlapTop,
          width,
          height,
        },
      });
    }
  }

  return overlaps.sort((left, right) => (
    left.rect.y - right.rect.y
    || left.rect.x - right.rect.x
    || left.staffIndex - right.staffIndex
  ));
}

function buildSemanticProtectedAnchorOverlapDebugRects(
  boxes: SemanticAnchorDebugBox[],
  protectedRects: SemanticProtectedDebugRect[],
): SemanticOverlapDebugRect[] {
  const overlaps: SemanticOverlapDebugRect[] = [];
  const seen = new Set<string>();

  for (const box of boxes) {
    if (box.isRest || !box.hasRenderedVisual) continue;
    for (const protectedRect of protectedRects) {
      if ((box.partId ?? null) !== (protectedRect.partId ?? null)) continue;
      if (box.measureNumber !== protectedRect.measureNumber) continue;
      if (box.staffIndex !== protectedRect.staffIndex) continue;
      if ((box.pageIndex ?? null) !== (protectedRect.pageIndex ?? null)) continue;
      if ((box.systemIndex ?? null) !== (protectedRect.systemIndex ?? null)) continue;

      const overlapLeft = Math.max(box.anchorRect.x, protectedRect.rect.x);
      const overlapRight = Math.min(box.anchorRect.x + box.anchorRect.width, protectedRect.rect.x + protectedRect.rect.width);
      const overlapTop = Math.max(box.anchorRect.y, protectedRect.rect.y);
      const overlapBottom = Math.min(box.anchorRect.y + box.anchorRect.height, protectedRect.rect.y + protectedRect.rect.height);
      const width = overlapRight - overlapLeft;
      const height = overlapBottom - overlapTop;
      if (width <= 0.75 || height <= 0.75) continue;

      const key = [
        box.measureNumber,
        box.staffIndex,
        Math.round(overlapLeft * 2) / 2,
        Math.round(overlapRight * 2) / 2,
        Math.round(overlapTop * 2) / 2,
        Math.round(overlapBottom * 2) / 2,
      ].join(':');
      if (seen.has(key)) continue;
      seen.add(key);

      overlaps.push({
        id: `${box.id}:${protectedRect.id}:anchor:${key}`,
        kind: 'protected-anchor-overlap',
        message: [
          'layout error: protected notation overlaps rendered anchor',
          `protected=m${protectedRect.measureNumber}:s${protectedRect.staffIndex}`,
          `anchor=m${box.measureNumber}:s${box.staffIndex}:${box.label}`,
          protectedRect.reason,
          `${Math.round(width * 100) / 100}x${Math.round(height * 100) / 100}px`,
        ].join(' | '),
        measures: [...new Set([protectedRect.measureNumber, box.measureNumber])].sort((a, b) => a - b),
        staffIndex: box.staffIndex,
        contributors: [{
          measureNumber: box.measureNumber,
          staffIndex: box.staffIndex,
          voiceId: box.voiceId,
          timestamp: `${box.timestampNum}/${box.timestampDen}`,
          label: box.label,
          rect: box.anchorRect,
        }],
        rect: {
          x: overlapLeft,
          y: overlapTop,
          width,
          height,
        },
      });
    }
  }

  return overlaps.sort((left, right) => (
    left.rect.y - right.rect.y
    || left.rect.x - right.rect.x
    || left.staffIndex - right.staffIndex
  ));
}

function buildSemanticProtectedVisualOverlapDebugRects(
  boxes: SemanticAnchorDebugBox[],
  protectedRects: SemanticProtectedDebugRect[],
): SemanticOverlapDebugRect[] {
  const overlaps: SemanticOverlapDebugRect[] = [];
  const seen = new Set<string>();

  for (const box of boxes) {
    if (box.isRest || !box.hasRenderedVisual) continue;
    for (const protectedRect of protectedRects) {
      if ((box.partId ?? null) !== (protectedRect.partId ?? null)) continue;
      if (box.staffIndex !== protectedRect.staffIndex) continue;
      if ((box.pageIndex ?? null) !== (protectedRect.pageIndex ?? null)) continue;
      if ((box.systemIndex ?? null) !== (protectedRect.systemIndex ?? null)) continue;

      const overlapLeft = Math.max(box.visualRect.x, protectedRect.rect.x);
      const overlapRight = Math.min(box.visualRect.x + box.visualRect.width, protectedRect.rect.x + protectedRect.rect.width);
      const overlapTop = Math.max(box.visualRect.y, protectedRect.rect.y);
      const overlapBottom = Math.min(box.visualRect.y + box.visualRect.height, protectedRect.rect.y + protectedRect.rect.height);
      const width = overlapRight - overlapLeft;
      const height = overlapBottom - overlapTop;
      if (width <= 0.75 || height <= 0.75) continue;

      const key = [
        protectedRect.measureNumber,
        box.measureNumber,
        box.staffIndex,
        Math.round(overlapLeft * 2) / 2,
        Math.round(overlapRight * 2) / 2,
        Math.round(overlapTop * 2) / 2,
        Math.round(overlapBottom * 2) / 2,
      ].join(':');
      if (seen.has(key)) continue;
      seen.add(key);

      overlaps.push({
        id: `${box.id}:${protectedRect.id}:visual:${key}`,
        kind: 'protected-visual-overlap',
        message: [
          'layout error: protected notation overlaps rendered visual event',
          `protected=m${protectedRect.measureNumber}:s${protectedRect.staffIndex}`,
          `visual=m${box.measureNumber}:s${box.staffIndex}:${box.label}`,
          protectedRect.reason,
          `${Math.round(width * 100) / 100}x${Math.round(height * 100) / 100}px`,
        ].join(' | '),
        measures: [...new Set([protectedRect.measureNumber, box.measureNumber])].sort((a, b) => a - b),
        staffIndex: box.staffIndex,
        contributors: [{
          measureNumber: box.measureNumber,
          staffIndex: box.staffIndex,
          voiceId: box.voiceId,
          timestamp: `${box.timestampNum}/${box.timestampDen}`,
          label: box.label,
          rect: box.visualRect,
        }],
        rect: {
          x: overlapLeft,
          y: overlapTop,
          width,
          height,
        },
      });
    }
  }

  return overlaps.sort((left, right) => (
    left.rect.y - right.rect.y
    || left.rect.x - right.rect.x
    || left.staffIndex - right.staffIndex
  ));
}

export function buildSemanticGridDebugReport(
  boxes: SemanticAnchorDebugBox[],
  coreDocument?: ScoreDocumentModel | null,
  snapPoints: SemanticSnapDebugPoint[] = [],
  pitchBands: SemanticPitchDebugBand[] = [],
) {
  const guards = buildSemanticMeasureGuardDebugLines(boxes);
  const protectedRects = buildSemanticProtectedDebugRects(boxes);
  const overdrawOverlaps = buildSemanticOverlapDebugRects(boxes);
  const protectedOverlaps = buildSemanticProtectedOverlapDebugRects(boxes, protectedRects);
  const protectedAnchorOverlaps = buildSemanticProtectedAnchorOverlapDebugRects(boxes, protectedRects);
  const protectedVisualOverlaps = buildSemanticProtectedVisualOverlapDebugRects(boxes, protectedRects);
  const overlaps = [...overdrawOverlaps, ...protectedOverlaps, ...protectedAnchorOverlaps, ...protectedVisualOverlaps].sort((left, right) => (
    left.rect.y - right.rect.y
    || left.rect.x - right.rect.x
    || left.staffIndex - right.staffIndex
    || left.kind.localeCompare(right.kind)
  ));
  const rounded = boxes.map((box) => ({
    measureId: box.measureId,
    measure: box.measureNumber,
    page: box.pageIndex,
    system: box.systemIndex,
    part: box.partId,
    protectedSystemStart: box.protectedSystemStart,
    measureLeft: Math.round(box.measureLeft * 100) / 100,
    measureRight: Math.round(box.measureRight * 100) / 100,
    measureXStart: Math.round(box.measureXStart * 100) / 100,
    measureXEnd: Math.round(box.measureXEnd * 100) / 100,
    measureDuration: Math.round(box.measureDuration * 1000000) / 1000000,
    durationRatio: Math.round(box.durationRatio * 1000000) / 1000000,
    timestampValue: Math.round(noteTimestampValue({
      timestampNum: box.timestampNum,
      timestampDen: box.timestampDen,
    }) * 1000000) / 1000000,
    endTimestampValue: Math.round((noteTimestampValue({
      timestampNum: box.timestampNum,
      timestampDen: box.timestampDen,
    }) + box.durationRatio) * 1000000) / 1000000,
    xStartReason: box.xStartReason,
    staff: box.staffIndex,
    voice: box.voiceId,
    timestamp: `${box.timestampNum}/${box.timestampDen}`,
    label: box.label,
    isRest: box.isRest,
    hasRenderedVisual: box.hasRenderedVisual,
    duplicateOfEarlier: Boolean(box.duplicateOfEarlier),
    left: Math.round(box.rect.x * 100) / 100,
    right: Math.round((box.rect.x + box.rect.width) * 100) / 100,
    top: Math.round(box.rect.y * 100) / 100,
    bottom: Math.round((box.rect.y + box.rect.height) * 100) / 100,
    width: Math.round(box.rect.width * 100) / 100,
    height: Math.round(box.rect.height * 100) / 100,
    anchorLeft: Math.round(box.anchorRect.x * 100) / 100,
    anchorRight: Math.round((box.anchorRect.x + box.anchorRect.width) * 100) / 100,
    anchorTop: Math.round(box.anchorRect.y * 100) / 100,
    anchorBottom: Math.round((box.anchorRect.y + box.anchorRect.height) * 100) / 100,
    visualLeft: Math.round(box.visualRect.x * 100) / 100,
    visualRight: Math.round((box.visualRect.x + box.visualRect.width) * 100) / 100,
    visualTop: Math.round(box.visualRect.y * 100) / 100,
    visualBottom: Math.round((box.visualRect.y + box.visualRect.height) * 100) / 100,
  }));
  const resolveCoreLaneCoverage = (box: (typeof rounded)[number]) => {
    const timing = getEffectiveMeasureTiming(coreDocument, {
      measureId: box.measureId,
      measureNumber: box.measure,
      staffIndex: box.staff,
      partId: box.part,
    });
    if (!timing) return null;
    const voice = timing.measure.voices.find((entry) => entry.voiceId === box.voice);
    if (!voice) return null;
    const timedEvents = voice.events.filter((event) => (
      event.staffIndex === box.staff
      && event.voiceId === box.voice
      && !event.isChord
    ));
    if (timedEvents.length === 0) return null;

    const durationDenominator = Math.max(timing.divisions * 4, 1);
    const slots = timedEvents
      .map((event) => {
        const start = noteTimestampValue(event);
        const duration = Math.max(event.durationDivisions, 0) / durationDenominator;
        return {
          start,
          end: start + duration,
          duration,
        };
      })
      .sort((left, right) => left.start - right.start || left.end - right.end);
    const first = slots[0]!;
    const last = slots[slots.length - 1]!;
    return {
      start: first.start,
      end: last.end,
      sum: slots.reduce((total, slot) => total + slot.duration, 0),
      measureDuration: timing.durationRatio,
    };
  };
  const roundedGuards = guards.map((guard) => ({
    measure: guard.measureNumber,
    page: guard.pageIndex,
    system: guard.systemIndex,
    staff: guard.staffIndex,
    edge: guard.edge,
    protectedSystemStart: guard.protectedSystemStart,
    x: Math.round(guard.x * 100) / 100,
    top: Math.round(guard.y * 100) / 100,
    bottom: Math.round((guard.y + guard.height) * 100) / 100,
  }));
  const roundedOverlaps = overlaps.map((overlap) => ({
    kind: overlap.kind,
    message: overlap.message,
    measures: overlap.measures,
    staff: overlap.staffIndex,
    left: Math.round(overlap.rect.x * 100) / 100,
    right: Math.round((overlap.rect.x + overlap.rect.width) * 100) / 100,
    top: Math.round(overlap.rect.y * 100) / 100,
    bottom: Math.round((overlap.rect.y + overlap.rect.height) * 100) / 100,
    width: Math.round(overlap.rect.width * 100) / 100,
    height: Math.round(overlap.rect.height * 100) / 100,
    contributors: overlap.contributors.map((contributor) => ({
      measure: contributor.measureNumber,
      staff: contributor.staffIndex,
      voice: contributor.voiceId,
      timestamp: contributor.timestamp,
      label: contributor.label,
      left: Math.round(contributor.rect.x * 100) / 100,
      right: Math.round((contributor.rect.x + contributor.rect.width) * 100) / 100,
      top: Math.round(contributor.rect.y * 100) / 100,
      bottom: Math.round((contributor.rect.y + contributor.rect.height) * 100) / 100,
    })),
  }));
  const roundedProtectedRects = protectedRects.map((rect) => ({
    measure: rect.measureNumber,
    page: rect.pageIndex,
    system: rect.systemIndex,
    part: rect.partId,
    staff: rect.staffIndex,
    reason: rect.reason,
    left: Math.round(rect.rect.x * 100) / 100,
    right: Math.round((rect.rect.x + rect.rect.width) * 100) / 100,
    top: Math.round(rect.rect.y * 100) / 100,
    bottom: Math.round((rect.rect.y + rect.rect.height) * 100) / 100,
    width: Math.round(rect.rect.width * 100) / 100,
    height: Math.round(rect.rect.height * 100) / 100,
  }));
  const roundedSnapPoints = snapPoints.map((point) => ({
    id: point.id,
    measureId: point.measureId,
    measure: point.measureNumber,
    page: point.pageIndex,
    system: point.systemIndex,
    part: point.partId,
    staff: point.staffIndex,
    voice: point.voiceId,
    timestamp: `${point.timestampNum}/${point.timestampDen}`,
    ratio: Math.round(point.ratio * 1000000) / 1000000,
    x: Math.round(point.x * 100) / 100,
    y: Math.round(point.y * 100) / 100,
    isRest: point.isRest,
    synthetic: point.synthetic,
    active: point.active,
    sourceCount: point.sourceCount,
    distinctXCount: point.distinctXCount,
    suppressedSyntheticCount: point.suppressedSyntheticCount,
    rawXs: point.rawXs,
    issue: point.issue,
  }));
  const roundedPitchBands = pitchBands.map((band) => ({
    id: band.id,
    measureId: band.measureId,
    measure: band.measureNumber,
    page: band.pageIndex,
    system: band.systemIndex,
    part: band.partId,
    staff: band.staffIndex,
    staffStep: band.staffStep,
    pitch: band.pitch,
    centerY: Math.round(band.centerY * 100) / 100,
    left: Math.round(band.rect.x * 100) / 100,
    right: Math.round((band.rect.x + band.rect.width) * 100) / 100,
    top: Math.round(band.rect.y * 100) / 100,
    bottom: Math.round((band.rect.y + band.rect.height) * 100) / 100,
    height: Math.round(band.rect.height * 100) / 100,
  }));
  const snapIssues = roundedSnapPoints
    .filter((point) => point.issue != null)
    .map((point) => ({
      code: point.issue === 'multi-x'
        ? 'snap_multi_x_rhythmic_position'
        : point.issue === 'synthetic-grid-collapsed'
          ? 'snap_synthetic_grid_collapsed'
          : 'snap_duplicate_rhythmic_position',
      level: point.issue === 'multi-x' ? 'error' as const : 'warning' as const,
      message: [
        point.issue === 'multi-x'
          ? 'One rhythmic snap position has multiple X positions.'
          : point.issue === 'synthetic-grid-collapsed'
            ? 'Synthetic insert grid was collapsed to one visible rhythmic snap anchor.'
            : 'One rhythmic snap position is backed by multiple raw grid sources.',
        `measure=${point.measure}`,
        `staff=${point.staff}`,
        `voice=${point.voice}`,
        `timestamp=${point.timestamp}`,
        `visibleX=${point.x}`,
        `rawXs=${point.rawXs.join(',')}`,
        `sourceCount=${point.sourceCount}`,
        `suppressedSynthetic=${point.suppressedSyntheticCount}`,
      ].join(' '),
    }));
  const issues: string[] = [];
  const issueCategories = {
    uncoveredGapCount: 0,
    duplicateRectCount: rounded.filter((box) => box.duplicateOfEarlier).length,
    overdrawCount: roundedOverlaps.filter((overlap) => overlap.kind === 'overdraw').length,
    verticalOverlapCount: 0,
    sharedXViolationCount: 0,
    laneCoverageViolationCount: 0,
    visualOrderViolationCount: 0,
    visualOutsideHitboxCount: 0,
    anchorOutsideHitboxCount: 0,
    protectedNotationOverlapCount: roundedOverlaps.filter((overlap) => (
      overlap.kind === 'protected-overlap'
      || overlap.kind === 'protected-anchor-overlap'
      || overlap.kind === 'protected-visual-overlap'
    )).length,
    lateStartCount: 0,
    shortFullRestCount: 0,
    invalidSystemStartProtectionCount: 0,
    snapLaneMissingGridBoxCount: 0,
    snapLaneMisalignedGridBoxCount: 0,
  };
  const byLane = new Map<string, typeof rounded>();

  for (const box of rounded) {
    const key = [
      `m${box.measure}`,
      `p${box.page ?? 'page'}`,
      `sys${box.system ?? 'system'}`,
      box.part ?? 'partless',
      `s${box.staff}`,
      `v${box.voice}`,
      `y${box.top}-${box.bottom}`,
    ].join(':');
    const lane = byLane.get(key) ?? [];
    lane.push(box);
    byLane.set(key, lane);
  }

  for (const [key, lane] of byLane.entries()) {
    const unique = [...new Map(lane.map((box) => [`${box.left}:${box.right}`, box])).values()]
      .sort((left, right) => left.left - right.left || left.right - right.right);
    for (let index = 1; index < unique.length; index += 1) {
      const previous = unique[index - 1]!;
      const current = unique[index]!;
      if (previous.right > current.left + 0.75) {
        issueCategories.overdrawCount += 1;
        issues.push(`horizontal overlap ${key}: ${previous.label} ${previous.left}-${previous.right} vs ${current.label} ${current.left}-${current.right}`);
      }
      if (current.left > previous.right + 0.75) {
        issueCategories.uncoveredGapCount += 1;
        issues.push(`horizontal gap ${key}: ${previous.label} ${previous.right} -> ${current.label} ${current.left}`);
      }
    }
    const coreCoverage = resolveCoreLaneCoverage(unique[0]!);
    if (coreCoverage) {
      const startsAtMeasureStart = Math.abs(coreCoverage.start) <= 1e-6;
      const endsAtMeasureEnd = Math.abs(coreCoverage.end - coreCoverage.measureDuration) <= 1e-6;
      const fillsMeasure = Math.abs(coreCoverage.sum - coreCoverage.measureDuration) <= 1e-6;
      if (!startsAtMeasureStart || !endsAtMeasureEnd || !fillsMeasure) {
        issueCategories.laneCoverageViolationCount += 1;
        issues.push([
          `lane coverage violation ${key}`,
          `start=${Math.round(coreCoverage.start * 1000000) / 1000000}`,
          `end=${Math.round(coreCoverage.end * 1000000) / 1000000}`,
          `sum=${Math.round(coreCoverage.sum * 1000000) / 1000000}`,
          `measureDuration=${Math.round(coreCoverage.measureDuration * 1000000) / 1000000}`,
        ].join(': '));
      }
    }
  }

  const boxesBySnapLane = new Map<string, typeof rounded>();
  const boxesByRhythmicStaff = new Map<string, typeof rounded>();
  for (const box of rounded) {
    const key = [
      box.measureId ?? box.measure,
      box.page ?? 'page',
      box.system ?? 'system',
      box.part ?? 'partless',
      box.staff,
      box.voice,
    ].join(':');
    const group = boxesBySnapLane.get(key) ?? [];
    group.push(box);
    boxesBySnapLane.set(key, group);

    const staffKey = [
      box.measureId ?? box.measure,
      box.page ?? 'page',
      box.system ?? 'system',
      box.part ?? 'partless',
      box.staff,
    ].join(':');
    const staffGroup = boxesByRhythmicStaff.get(staffKey) ?? [];
    staffGroup.push(box);
    boxesByRhythmicStaff.set(staffKey, staffGroup);
  }

  for (const snap of roundedSnapPoints) {
    const key = [
      snap.measureId ?? snap.measure,
      snap.page ?? 'page',
      snap.system ?? 'system',
      snap.part ?? 'partless',
      snap.staff,
      snap.voice,
    ].join(':');
    const staffKey = [
      snap.measureId ?? snap.measure,
      snap.page ?? 'page',
      snap.system ?? 'system',
      snap.part ?? 'partless',
      snap.staff,
    ].join(':');
    const laneBoxes = boxesBySnapLane.get(key) ?? boxesByRhythmicStaff.get(staffKey) ?? [];
    if (laneBoxes.length === 0) {
      issueCategories.snapLaneMissingGridBoxCount += 1;
      issues.push([
        'semantic_snap_lane_missing_grid_box',
        `measure=${snap.measure}`,
        `part=${snap.part ?? 'partless'}`,
        `staff=${snap.staff}`,
        `voice=${snap.voice}`,
        `timestamp=${snap.timestamp}`,
        `snap=${snap.x},${snap.y}`,
      ].join(' '));
      continue;
    }

    const matchingBox = laneBoxes.find((box) => {
      const coveredByTimestamp = snap.ratio >= box.timestampValue - 1e-6
        && snap.ratio <= box.endTimestampValue + 1e-6;
      if (coveredByTimestamp) return true;

      const insideMeasureX = snap.x >= box.measureLeft - 1 && snap.x <= box.measureRight + 1;
      if (!insideMeasureX) return false;

      return snap.y >= box.top - 14 && snap.y <= box.bottom + 14;
    });
    if (!matchingBox) {
      issueCategories.snapLaneMisalignedGridBoxCount += 1;
      issues.push([
        'semantic_snap_lane_misaligned_grid_box',
        `measure=${snap.measure}`,
        `part=${snap.part ?? 'partless'}`,
        `staff=${snap.staff}`,
        `voice=${snap.voice}`,
        `timestamp=${snap.timestamp}`,
        `snap=${snap.x},${snap.y}`,
        `boxes=${laneBoxes.map((box) => `${box.left}-${box.right}@${box.top}-${box.bottom}`).join('|')}`,
      ].join(' '));
    }
  }

  for (const box of rounded) {
    if (box.duplicateOfEarlier) {
      issues.push(`duplicate rect m${box.measure}:s${box.staff}:v${box.voice}:${box.timestamp} ${box.left}-${box.right}`);
    }
    if (box.protectedSystemStart && box.left < box.measureXStart - 0.75) {
      issueCategories.protectedNotationOverlapCount += 1;
      issues.push(`protected overlap m${box.measure}:s${box.staff}:${box.label} left=${box.left} protectedStart=${box.measureXStart}`);
    }
    const edgeTolerance = box.isRest ? 4 : Math.max(10, Math.min(18, box.width));
    const anchorDisjointFromHitbox = box.anchorRight < box.left - edgeTolerance
      || box.anchorLeft > box.right + edgeTolerance;
    const visualDisjointFromHitbox = box.visualRight < box.left - edgeTolerance
      || box.visualLeft > box.right + edgeTolerance;
    if (!box.isRest && box.hasRenderedVisual && anchorDisjointFromHitbox && box.width > 18) {
      issueCategories.anchorOutsideHitboxCount += 1;
      issues.push([
        `anchor outside hitbox m${box.measure}:s${box.staff}:${box.label}`,
        `anchor=${box.anchorLeft}-${box.anchorRight} y=${box.anchorTop}-${box.anchorBottom}`,
        `hitbox=${box.left}-${box.right} y=${box.top}-${box.bottom}`,
      ].join(' | '));
    }
    if (!box.isRest && box.hasRenderedVisual && visualDisjointFromHitbox && box.width > 18) {
      issueCategories.visualOutsideHitboxCount += 1;
      issues.push([
        `visual outside hitbox m${box.measure}:s${box.staff}:${box.label}`,
        `visual=${box.visualLeft}-${box.visualRight} y=${box.visualTop}-${box.visualBottom}`,
        `hitbox=${box.left}-${box.right} y=${box.top}-${box.bottom}`,
      ].join(' | '));
    }
  }

  for (const overlap of roundedOverlaps) {
    issues.push(`${overlap.message} | rect=${overlap.left}-${overlap.right} y=${overlap.top}-${overlap.bottom}`);
  }

  const byMeasure = new Map<number, typeof rounded>();
  for (const box of rounded) {
    const group = byMeasure.get(box.measure) ?? [];
    group.push(box);
    byMeasure.set(box.measure, group);
  }
  for (const [measure, group] of byMeasure.entries()) {
    const upper = group.filter((box) => box.staff === 1);
    const lower = group.filter((box) => box.staff === 2);
    for (const topBox of upper) {
      for (const bottomBox of lower) {
        const overlap = Math.min(topBox.bottom, bottomBox.bottom) - Math.max(topBox.top, bottomBox.top);
        if (overlap > 0.75) {
          issueCategories.verticalOverlapCount += 1;
          issues.push(`vertical overlap m${measure}: ${topBox.label} s1 ${topBox.top}-${topBox.bottom} vs ${bottomBox.label} s2 ${bottomBox.top}-${bottomBox.bottom}`);
        }
      }
    }
  }

  const byMeasureStaff = new Map<string, typeof rounded>();
  for (const box of rounded) {
    const key = `m${box.measure}:s${box.staff}`;
    const group = byMeasureStaff.get(key) ?? [];
    group.push(box);
    byMeasureStaff.set(key, group);
  }
  for (const [key, group] of byMeasureStaff.entries()) {
    const first = group[0]!;
    const visible = group.filter((box) => !box.duplicateOfEarlier);
    const firstSlotLeft = Math.min(...visible.map((box) => box.left));
    const lastSlotRight = Math.max(...visible.map((box) => box.right));
    const singleFullRestCandidate = visible.length === 1
      && visible[0]?.label === 'rest@0/32'
      && visible[0]?.timestamp === '0/32';
    if (first.xStartReason === 'system-start-protected' && first.measureXStart <= first.measureLeft + 0.75) {
      issueCategories.invalidSystemStartProtectionCount += 1;
      issues.push(`system-start protection missing ${key}: measureLeft=${first.measureLeft} measureXStart=${first.measureXStart}`);
    }
    if (!first.protectedSystemStart && firstSlotLeft > first.measureXStart + 0.75) {
      issueCategories.lateStartCount += 1;
      issues.push(`normal measure starts late ${key}: firstSlotLeft=${firstSlotLeft} expected=${first.measureXStart}`);
    }
    if (singleFullRestCandidate && (
      Math.abs(firstSlotLeft - first.measureXStart) > 0.75
      || Math.abs(lastSlotRight - first.measureXEnd) > 0.75
    )) {
      issueCategories.shortFullRestCount += 1;
      issues.push(`full-rest not full width ${key}: ${firstSlotLeft}-${lastSlotRight} expected=${first.measureXStart}-${first.measureXEnd}`);
    }
  }

  const byVisualOrderLane = new Map<string, typeof rounded>();
  for (const box of rounded) {
    const key = [
      `m${box.measure}`,
      `p${box.page ?? 'page'}`,
      `sys${box.system ?? 'system'}`,
      box.part ?? 'partless',
      `s${box.staff}`,
      `v${box.voice}`,
    ].join(':');
    const group = byVisualOrderLane.get(key) ?? [];
    group.push(box);
    byVisualOrderLane.set(key, group);
  }
  for (const [key, group] of byVisualOrderLane.entries()) {
    const ordered = [...group]
      .filter((box) => !box.duplicateOfEarlier && !box.isRest && box.hasRenderedVisual)
      .sort((left, right) => (
        left.timestampValue - right.timestampValue
        || left.endTimestampValue - right.endTimestampValue
        || left.label.localeCompare(right.label)
      ));
    for (let index = 1; index < ordered.length; index += 1) {
      const previous = ordered[index - 1]!;
      const current = ordered[index]!;
      const previousSlotCenter = (previous.left + previous.right) / 2;
      const currentSlotCenter = (current.left + current.right) / 2;
      if (previousSlotCenter > currentSlotCenter + 1.5) {
        issueCategories.visualOrderViolationCount += 1;
        issues.push([
          `visual order violation ${key}`,
          `${previous.label}@x=${Math.round(previousSlotCenter * 100) / 100}`,
          `${current.label}@x=${Math.round(currentSlotCenter * 100) / 100}`,
          `timestamps=${previous.timestamp}->${current.timestamp}`,
        ].join(' | '));
      }
    }
  }

  const bySharedTimestamp = new Map<string, typeof rounded>();
  for (const box of rounded) {
    const key = [
      `p${box.page ?? 'page'}`,
      `sys${box.system ?? 'system'}`,
      box.part ?? 'partless',
      `m${box.measure}`,
      `ts${box.timestamp}`,
    ].join(':');
    const group = bySharedTimestamp.get(key) ?? [];
    group.push(box);
    bySharedTimestamp.set(key, group);
  }
  for (const [key, group] of bySharedTimestamp.entries()) {
    const byStaff = new Map<number, typeof rounded[number]>();
    for (const box of group) {
      if (!byStaff.has(box.staff)) byStaff.set(box.staff, box);
    }
    const representatives = [...byStaff.values()];
    for (let index = 1; index < representatives.length; index += 1) {
      const previous = representatives[index - 1]!;
      const current = representatives[index]!;
      if (Math.abs(previous.left - current.left) > 0.75) {
        issueCategories.sharedXViolationCount += 1;
        issues.push(`shared-x violation m${previous.measure}:ts${previous.timestamp}: s${previous.staff} left=${previous.left} vs s${current.staff} left=${current.left}`);
      }
    }
  }

  const measureSummaries = [...byMeasure.entries()]
    .sort((left, right) => left[0] - right[0])
    .map(([measure, group]) => {
      const first = group[0]!;
      const firstSlotLeft = Math.min(...group.map((box) => box.left));
      const lastSlotRight = Math.max(...group.map((box) => box.right));
      const duplicateRectCount = group.filter((box) => box.duplicateOfEarlier).length;
      const overdrawCount = roundedOverlaps.filter((overlap) => overlap.measures.includes(measure)).length;
      const protectedNotationOverlapCount = group.filter((box) => box.protectedSystemStart && box.left < box.measureXStart - 0.75).length;
      const verticalOverlapCount = issues.filter((issue) => issue.startsWith(`vertical overlap m${measure}:`)).length;
      const uncoveredGapCount = issues.filter((issue) => issue.startsWith(`horizontal gap m${measure}:`)).length;
      const sharedXViolationCount = issues.filter((issue) => issue.startsWith(`shared-x violation m${measure}:`)).length;
      const laneCoverageViolationCount = issues.filter((issue) => issue.startsWith(`lane coverage violation m${measure}:`)).length;
      const visualOrderViolationCount = issues.filter((issue) => issue.startsWith(`visual order violation m${measure}:`)).length;
      const visualOutsideHitboxCount = issues.filter((issue) => (
        issue.startsWith(`visual outside hitbox m${measure}:`)
        || issue.startsWith(`visual center outside hitbox m${measure}:`)
      )).length;
      const anchorOutsideHitboxCount = issues.filter((issue) => (
        issue.startsWith(`anchor outside hitbox m${measure}:`)
        || issue.startsWith(`anchor center outside hitbox m${measure}:`)
      )).length;
      const lateStartCount = issues.filter((issue) => issue.startsWith(`normal measure starts late m${measure}:`)).length;
      const shortFullRestCount = issues.filter((issue) => issue.startsWith(`full-rest not full width m${measure}:`)).length;
      const invalidSystemStartProtectionCount = issues.filter((issue) => issue.startsWith(`system-start protection missing m${measure}:`)).length;
      return {
        pageIndex: first.page,
        systemIndex: first.system,
        measureIndex: measure,
        partIndex: first.part,
        isSystemStartMeasure: group.some((box) => box.protectedSystemStart),
        measureLeft: first.measureLeft,
        measureRight: first.measureRight,
        measureXStart: first.measureXStart,
        measureXEnd: first.measureXEnd,
        availableWidth: Math.round((first.measureXEnd - first.measureXStart) * 100) / 100,
        measureDuration: first.measureDuration,
        xStartReason: first.xStartReason,
        sharedProtectedStartX: first.protectedSystemStart ? first.measureXStart : null,
        leadingModifierRects: roundedProtectedRects.filter((rect) => rect.measure === measure),
        slotCount: new Set(group.map((box) => `${box.staff}:${box.voice}:${box.timestamp}:${box.left}:${box.right}`)).size,
        staffCount: new Set(group.map((box) => box.staff)).size,
        hasFullMeasureRest: group.some((box) => box.label === 'rest@0/32' && Math.abs(box.left - first.measureXStart) <= 0.75 && Math.abs(box.right - first.measureXEnd) <= 0.75),
        firstSlotLeft,
        lastSlotRight,
        uncoveredGapCount,
        duplicateRectCount,
        overdrawCount,
        verticalOverlapCount,
        sharedXViolationCount,
        laneCoverageViolationCount,
        visualOrderViolationCount,
        visualOutsideHitboxCount,
        anchorOutsideHitboxCount,
        protectedNotationOverlapCount,
        lateStartCount,
        shortFullRestCount,
        invalidSystemStartProtectionCount,
      };
    });
  const layoutSummary = {
    issueCount: roundedOverlaps.length,
    overdrawCount: roundedOverlaps.filter((overlap) => overlap.kind === 'overdraw').length,
    protectedNotationOverlapCount: roundedOverlaps.filter((overlap) => (
      overlap.kind === 'protected-overlap'
      || overlap.kind === 'protected-anchor-overlap'
      || overlap.kind === 'protected-visual-overlap'
    )).length,
    affectedMeasures: [...new Set(roundedOverlaps.flatMap((overlap) => overlap.measures))].sort((a, b) => a - b),
    affectedStaves: [...new Set(roundedOverlaps.map((overlap) => overlap.staff))].sort((a, b) => a - b),
    overdraw: roundedOverlaps,
  };

  return {
    kind: 'nex-note-semantic-grid',
    coordinateSpace: 'score-container-css-pixels',
    generatedAt: new Date().toISOString(),
    boxCount: rounded.length,
    guardCount: roundedGuards.length,
    protectedCount: roundedProtectedRects.length,
    pitchBandCount: roundedPitchBands.length,
    snapCount: roundedSnapPoints.length,
    rawSnapSourceCount: roundedSnapPoints.reduce((total, point) => total + point.sourceCount, 0),
    snapIssueCount: snapIssues.length,
    snapMultiXIssueCount: snapIssues.filter((issue) => issue.code === 'snap_multi_x_rhythmic_position').length,
    snapSuppressedSyntheticCount: roundedSnapPoints.reduce((total, point) => total + point.suppressedSyntheticCount, 0),
    overlapCount: roundedOverlaps.length,
    invariantChecks: issueCategories,
    issueCount: issues.length,
    issues,
    measures: measureSummaries,
    boxes: rounded,
    guards: roundedGuards,
    protectedRegions: roundedProtectedRects,
    pitchBands: roundedPitchBands,
    snaps: roundedSnapPoints,
    snapIssues,
    snapDebug: {
      visibleCount: roundedSnapPoints.length,
      rawSourceCount: roundedSnapPoints.reduce((total, point) => total + point.sourceCount, 0),
      issueCount: snapIssues.length,
      multiXIssueCount: snapIssues.filter((issue) => issue.code === 'snap_multi_x_rhythmic_position').length,
      suppressedSyntheticCount: roundedSnapPoints.reduce((total, point) => total + point.suppressedSyntheticCount, 0),
      problematicSnaps: roundedSnapPoints.filter((point) => point.issue != null),
    },
    pitchDebug: {
      bandCount: roundedPitchBands.length,
      bands: roundedPitchBands,
    },
    overlaps: roundedOverlaps,
    layoutErrors: roundedOverlaps,
    layout: layoutSummary,
  };
}

function resolveCanonicalRenderedNote(renderedNote: RenderedNote, coreDocument: ScoreDocumentModel | null): SelectedNote {
  if (!coreDocument) return renderedNote.note;

  const matchesRenderedSemantic = (event: TimedEvent) => {
    if (event.staffIndex !== renderedNote.note.staffIndex) return false;
    if (event.voiceId !== renderedNote.note.voiceId) return false;
    if (!timestampsEqual(event.timestampNum, event.timestampDen, renderedNote.note.timestampNum, renderedNote.note.timestampDen)) return false;
    if (renderedNote.note.isRest) return event.kind === 'rest';
    if (event.kind !== 'note') return false;
    return event.pitch.step === renderedNote.note.step
      && event.pitch.octave === renderedNote.note.octave
      && event.pitch.alter === renderedNote.note.alter;
  };

  for (const part of coreDocument.score.parts) {
    if (renderedNote.note.corePartId && part.id !== renderedNote.note.corePartId && part.sourcePartId !== renderedNote.note.corePartId) {
      continue;
    }
    for (const staff of part.staves) {
      const measure = staff.measures.find((entry) => (
        renderedNote.note.coreMeasureId
          ? entry.id === renderedNote.note.coreMeasureId
          : entry.measureNumber === renderedNote.note.measureNumber
      ));
      if (!measure) continue;
      for (const voice of measure.voices) {
        const event = renderedNote.coreEntityId
          ? voice.events.find((entry) => entry.id === renderedNote.coreEntityId)
          : voice.events.find(matchesRenderedSemantic);
        if (!event) continue;
        return {
          ...renderedNote.note,
          coreEntityId: event.id,
          coreVoiceId: voice.id,
          coreMeasureId: measure.id,
          corePartId: part.id,
          measureNumber: event.measureNumber,
          staffIndex: event.staffIndex,
          voiceId: event.voiceId,
          timestampNum: event.timestampNum,
          timestampDen: event.timestampDen,
          step: event.kind === 'note' ? event.pitch.step : 'C',
          octave: event.kind === 'note' ? event.pitch.octave : 4,
          alter: event.kind === 'note' ? event.pitch.alter : 0,
          isRest: event.kind === 'rest',
          durationType: event.durationType,
          isDotted: event.isDotted,
        };
      }
    }
  }

  return renderedNote.note;
}

function selectedNoteFromGhostGridPoint(
  point: RenderedGhostGridPoint,
  coreDocument: ScoreDocumentModel | null,
): SelectedNote | null {
  if (!coreDocument) return null;

  for (const part of coreDocument.score.parts) {
    if (point.corePartId && part.id !== point.corePartId && part.sourcePartId !== point.corePartId) {
      continue;
    }
    for (const staff of part.staves) {
      if (staff.staffIndex !== point.staffIndex) continue;
      const measure = staff.measures.find((entry) => entry.id === point.measureId);
      if (!measure) continue;
      const voice = measure.voices.find((entry) => entry.voiceId === point.voiceId);
      if (!voice) continue;
      const event = voice.events.find((entry) => (
        (point.coreEntityId && entry.id === point.coreEntityId)
        || (
          entry.staffIndex === point.staffIndex
          && entry.voiceId === point.voiceId
          && timestampsEqual(entry.timestampNum, entry.timestampDen, point.timestampNum, point.timestampDen)
          && (point.isRest ? entry.kind === 'rest' : entry.kind === 'note')
        )
      ));
      if (!event) continue;

      return {
        coreEntityId: event.id,
        coreVoiceId: voice.id,
        coreMeasureId: measure.id,
        corePartId: part.id,
        measureNumber: event.measureNumber,
        staffIndex: event.staffIndex,
        voiceId: event.voiceId,
        timestampNum: event.timestampNum,
        timestampDen: event.timestampDen,
        step: event.kind === 'note' ? event.pitch.step : 'C',
        octave: event.kind === 'note' ? event.pitch.octave : 4,
        alter: event.kind === 'note' ? event.pitch.alter : 0,
        isRest: event.kind === 'rest',
        durationType: event.durationType,
        isDotted: event.isDotted,
        graphicalNote: null,
      };
    }
  }

  return null;
}

function renderedNoteFromGhostGridPoint(point: RenderedGhostGridPoint, note: SelectedNote): RenderedNote {
  const domRect = {
    x: point.domX - 9,
    y: point.domY - 12,
    width: 18,
    height: 24,
  };
  return {
    id: point.coreEntityId ?? point.id,
    coreEntityId: point.coreEntityId,
    note,
    svgCenter: { x: point.domX, y: point.domY },
    domCenter: { x: point.domX, y: point.domY },
    domRect,
    svgElement: null,
    tintElement: null,
  };
}

function selectedNotePitchRank(note: SelectedNote) {
  if (note.isRest) return Number.NEGATIVE_INFINITY;
  const stepOrder: Record<string, number> = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 };
  return note.octave * 12 + (stepOrder[note.step] ?? 0) + note.alter;
}

function timedEventPitchRank(event: TimedEvent) {
  if (event.kind !== 'note') return Number.NEGATIVE_INFINITY;
  const stepOrder: Record<string, number> = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 };
  return event.pitch.octave * 12 + (stepOrder[event.pitch.step] ?? 0) + event.pitch.alter;
}

function selectedNoteFromTimedEvent(
  event: TimedEvent,
  voiceId: string,
  measureId: string,
  partId: string,
  graphicalNote: SelectedNote['graphicalNote'] = null,
): SelectedNote {
  return {
    coreEntityId: event.id,
    coreVoiceId: voiceId,
    coreMeasureId: measureId,
    corePartId: partId,
    measureNumber: event.measureNumber,
    staffIndex: event.staffIndex,
    voiceId: event.voiceId,
    timestampNum: event.timestampNum,
    timestampDen: event.timestampDen,
    step: event.kind === 'note' ? event.pitch.step : 'C',
    octave: event.kind === 'note' ? event.pitch.octave : 4,
    alter: event.kind === 'note' ? event.pitch.alter : 0,
    isRest: event.kind === 'rest',
    durationType: event.durationType,
    isDotted: event.isDotted,
    graphicalNote,
  };
}

function repairIndexedRenderedNoteVisualOrder(index: GhostNoteSpatialIndex, coreDocument: ScoreDocumentModel | null) {
  if (!coreDocument) return;

  for (const entries of index.byMeasureId.values()) {
    const laneGroups = new Map<string, IndexedRenderedNote[]>();
    for (const entry of entries) {
      if (entry.semantic.isRest) continue;
      const key = [
        entry.semantic.corePartId ?? '',
        entry.semantic.measureNumber,
        entry.semantic.staffIndex,
        entry.semantic.voiceId,
      ].join(':');
      const group = laneGroups.get(key) ?? [];
      group.push(entry);
      laneGroups.set(key, group);
    }

    for (const group of laneGroups.values()) {
      const repairGroup = group.filter((entry) => entry.rendered.svgElement || entry.rendered.tintElement);
      if (repairGroup.length < 2) continue;
      const seed = repairGroup[0]?.semantic;
      if (!seed) continue;
      const semanticOrder = [...repairGroup].sort((a, b) => (
        noteTimestampValue(a.semantic) - noteTimestampValue(b.semantic)
        || selectedNotePitchRank(a.semantic) - selectedNotePitchRank(b.semantic)
        || a.rendered.id.localeCompare(b.rendered.id)
      ));
      const hasVisualOrderConflict = semanticOrder.some((entry, indexInOrder) => {
        const previous = semanticOrder[indexInOrder - 1];
        return Boolean(previous && previous.rendered.domCenter.x > entry.rendered.domCenter.x + 1.5);
      });
      if (!hasVisualOrderConflict) continue;

      let candidates: Array<{
        event: TimedEvent;
        voiceId: string;
        measureId: string;
        partId: string;
      }> = [];
      for (const part of coreDocument.score.parts) {
        if (seed.corePartId && part.id !== seed.corePartId && part.sourcePartId !== seed.corePartId) continue;
        for (const staff of part.staves) {
          if (staff.staffIndex !== seed.staffIndex) continue;
          const measure = staff.measures.find((entry) => entry.measureNumber === seed.measureNumber);
          if (!measure) continue;
          const voice = measure.voices.find((entry) => entry.voiceId === seed.voiceId);
          if (!voice) continue;
          candidates = voice.events
            .filter((event) => (
              event.kind === 'note'
              && !event.isChord
              && event.measureNumber === seed.measureNumber
              && event.staffIndex === seed.staffIndex
              && event.voiceId === seed.voiceId
            ))
            .map((event) => ({
              event,
              voiceId: voice.id,
              measureId: measure.id,
              partId: part.id,
            }));
          if (candidates.length > 0) break;
        }
        if (candidates.length > 0) break;
      }
      if (candidates.length !== repairGroup.length) continue;

      const timestampKeys = new Set(candidates.map((candidate) => `${candidate.event.timestampNum}/${candidate.event.timestampDen}`));
      if (timestampKeys.size !== candidates.length) continue;

      const orderedGroup = [...repairGroup].sort((a, b) => (
        a.rendered.domCenter.x - b.rendered.domCenter.x
        || a.rendered.domCenter.y - b.rendered.domCenter.y
        || a.rendered.id.localeCompare(b.rendered.id)
      ));
      const orderedCandidates = [...candidates].sort((a, b) => (
        noteTimestampValue(a.event) - noteTimestampValue(b.event)
        || timedEventPitchRank(b.event) - timedEventPitchRank(a.event)
        || a.event.id.localeCompare(b.event.id)
      ));

      orderedGroup.forEach((entry, indexInOrder) => {
        const candidate = orderedCandidates[indexInOrder];
        if (!candidate) return;
        const semantic = selectedNoteFromTimedEvent(
          candidate.event,
          candidate.voiceId,
          candidate.measureId,
          candidate.partId,
          entry.semantic.graphicalNote,
        );
        entry.semantic = semantic;
        entry.rendered.note = semantic;
        entry.rendered.id = semantic.coreEntityId ?? entry.rendered.id;
        entry.rendered.coreEntityId = semantic.coreEntityId ?? entry.rendered.coreEntityId;
      });
    }

    const allLaneGroups = new Map<string, IndexedRenderedNote[]>();
    for (const entry of entries) {
      const key = [
        entry.semantic.corePartId ?? '',
        entry.semantic.measureNumber,
        entry.semantic.staffIndex,
        entry.semantic.voiceId,
      ].join(':');
      const group = allLaneGroups.get(key) ?? [];
      group.push(entry);
      allLaneGroups.set(key, group);
    }

    for (const group of allLaneGroups.values()) {
      const restEntries = group
        .filter((entry) => entry.semantic.isRest)
        .sort((left, right) => (
          left.rendered.domCenter.x - right.rendered.domCenter.x
          || left.rendered.id.localeCompare(right.rendered.id)
        ));
      if (restEntries.length === 0) continue;

      const seed = group[0]?.semantic;
      if (!seed) continue;

      let voiceContext: {
        events: TimedEvent[];
        voiceId: string;
        measureId: string;
        partId: string;
        measureDurationRatio: number;
        divisions: number;
      } | null = null;
      for (const part of coreDocument.score.parts) {
        if (seed.corePartId && part.id !== seed.corePartId && part.sourcePartId !== seed.corePartId) continue;
        for (const staff of part.staves) {
          if (staff.staffIndex !== seed.staffIndex) continue;
          const measure = staff.measures.find((entry) => entry.measureNumber === seed.measureNumber);
          if (!measure) continue;
          const voice = measure.voices.find((entry) => entry.voiceId === seed.voiceId);
          if (!voice) continue;
          const timing = getEffectiveMeasureTiming(coreDocument, {
            measureId: measure.id,
            measureNumber: measure.measureNumber,
            staffIndex: staff.staffIndex,
            partId: part.id,
          });
          voiceContext = {
            events: voice.events.filter((event) => (
              event.measureNumber === seed.measureNumber
              && event.staffIndex === seed.staffIndex
              && event.voiceId === seed.voiceId
            )),
            voiceId: voice.id,
            measureId: measure.id,
            partId: part.id,
            measureDurationRatio: timing?.durationRatio ?? 1,
            divisions: timing?.divisions ?? 1,
          };
          break;
        }
        if (voiceContext) break;
      }
      if (!voiceContext) continue;

      const restCandidates = voiceContext.events
        .filter((event) => event.kind === 'rest')
        .map((event) => ({
          event,
          start: noteTimestampValue(event),
          center: noteTimestampValue(event) + (event.durationDivisions / Math.max(voiceContext!.divisions * 4, 1) / 2),
        }));
      if (restCandidates.length === 0) continue;

      const visualNotes = group
        .filter((entry) => !entry.semantic.isRest)
        .sort((left, right) => left.rendered.domCenter.x - right.rendered.domCenter.x);
      const usedRestIds = new Set<string>();

      for (const restEntry of restEntries) {
        const restX = restEntry.rendered.domCenter.x;
        const previousNote = [...visualNotes].reverse().find((entry) => entry.rendered.domCenter.x < restX - 1.5) ?? null;
        const nextNote = visualNotes.find((entry) => entry.rendered.domCenter.x > restX + 1.5) ?? null;
        const previousTimestamp = previousNote ? noteTimestampValue(previousNote.semantic) : 0;
        const nextTimestamp = nextNote ? noteTimestampValue(nextNote.semantic) : voiceContext.measureDurationRatio;
        const visualProgress = previousNote && nextNote
          ? clamp(
              (restX - previousNote.rendered.domCenter.x)
                / Math.max(nextNote.rendered.domCenter.x - previousNote.rendered.domCenter.x, 1),
              0,
              1,
            )
          : 0.5;
        const estimatedTimestamp = previousTimestamp + ((nextTimestamp - previousTimestamp) * visualProgress);
        const ranked = restCandidates
          .filter((candidate) => !usedRestIds.has(candidate.event.id))
          .map((candidate) => {
            const inVisualSpan = candidate.center >= previousTimestamp - 1e-6
              && candidate.start <= nextTimestamp + 1e-6;
            return {
              candidate,
              score: (inVisualSpan ? 0 : 100)
                + Math.abs(candidate.center - estimatedTimestamp)
                + (Math.abs(candidate.start - noteTimestampValue(restEntry.semantic)) < 1e-6 ? 0.25 : 0),
            };
          })
          .sort((left, right) => left.score - right.score || left.candidate.event.id.localeCompare(right.candidate.event.id));
        const best = ranked[0]?.candidate ?? null;
        if (!best) continue;
        usedRestIds.add(best.event.id);
        const semantic = selectedNoteFromTimedEvent(
          best.event,
          voiceContext.voiceId,
          voiceContext.measureId,
          voiceContext.partId,
          restEntry.semantic.graphicalNote,
        );
        restEntry.semantic = semantic;
        restEntry.rendered.note = semantic;
        restEntry.rendered.id = semantic.coreEntityId ?? restEntry.rendered.id;
        restEntry.rendered.coreEntityId = semantic.coreEntityId ?? restEntry.rendered.coreEntityId;
      }
    }
  }
}

export function buildGhostNoteSpatialIndex(
  renderedNotes: RenderedNote[],
  coreDocument: ScoreDocumentModel | null,
  measureOverlays: RenderedMeasureLayoutOverlay[],
  renderedGhostGrid?: RenderedGhostGrid | null,
): GhostNoteSpatialIndex {
  const byMeasureId = new Map<string, IndexedRenderedNote[]>();
  const bySystemStaff = new Map<string, IndexedRenderedNote[]>();
  const systemByMeasureId = new Map<string, number>();

  measureOverlays.forEach((overlay) => {
    systemByMeasureId.set(overlay.measureId, overlay.systemIndex);
  });

  const anchorIndexKey = (note: SelectedNote) => {
    const timestamp = normalizeFraction(note.timestampNum, Math.max(note.timestampDen, 1));
    return [
      note.coreMeasureId ?? note.measureNumber,
      note.staffIndex,
      note.voiceId,
      timestamp.num,
      timestamp.den,
      note.isRest ? 'rest' : `note:${note.coreEntityId ?? `${note.step}:${note.alter}:${note.octave}`}`,
    ].join(':');
  };
  const seenAnchorKeys = new Set<string>();
  const addEntry = (entry: IndexedRenderedNote) => {
    const { semantic } = entry;
    seenAnchorKeys.add(anchorIndexKey(semantic));

    const measureEntries = byMeasureId.get(semantic.coreMeasureId ?? '') ?? [];
    measureEntries.push(entry);
    if (semantic.coreMeasureId) {
      byMeasureId.set(semantic.coreMeasureId, measureEntries);
    }

    const systemIndex = semantic.coreMeasureId ? systemByMeasureId.get(semantic.coreMeasureId) : null;
    if (systemIndex != null) {
      const systemStaffKey = getSystemStaffKey(systemIndex, semantic.staffIndex, semantic.corePartId);
      const systemStaffEntries = bySystemStaff.get(systemStaffKey) ?? [];
      systemStaffEntries.push(entry);
      bySystemStaff.set(systemStaffKey, systemStaffEntries);
    }
  };

  for (const rendered of renderedNotes) {
    const semantic = resolveCanonicalRenderedNote(rendered, coreDocument);
    addEntry({ rendered, semantic });
  }

  repairIndexedRenderedNoteVisualOrder({ byMeasureId, bySystemStaff }, coreDocument);
  seenAnchorKeys.clear();
  for (const entries of byMeasureId.values()) {
    for (const entry of entries) {
      seenAnchorKeys.add(anchorIndexKey(entry.semantic));
    }
  }

  for (const measureGrid of renderedGhostGrid?.byMeasureId.values() ?? []) {
    for (const point of measureGrid.points) {
      if (point.synthetic) continue;
      const semantic = selectedNoteFromGhostGridPoint(point, coreDocument);
      if (!semantic) continue;
      const key = anchorIndexKey(semantic);
      if (seenAnchorKeys.has(key)) continue;
      addEntry({
        rendered: renderedNoteFromGhostGridPoint(point, semantic),
        semantic,
      });
    }
  }

  return { byMeasureId, bySystemStaff };
}

function buildGraceEventIdSet(coreDocument: ScoreDocumentModel | null): Set<string> {
  return new Set(coreDocument?.graceNotes.map((entry) => entry.eventId) ?? []);
}

function buildGhostIntentAnchorsFromGrid(
  renderedGhostGrid: RenderedGhostGrid | null | undefined,
  measureId: string,
  staffIndex: number,
  graceEventIds: Set<string>,
): GhostOnsetAnchor[] {
  const staffPoints = filterSelectableRenderedGhostSnapPoints(
    getRenderedGhostStaffPoints(renderedGhostGrid, measureId, staffIndex, { includeSynthetic: true }),
  );
  const anchors: GhostOnsetAnchor[] = [];
  const seen = new Set<string>();

  for (const point of staffPoints) {
    if (point.synthetic) continue;
    const isGrace = Boolean(point.coreEntityId && graceEventIds.has(point.coreEntityId));
    const dedupeKey = isGrace
      ? `grace:${point.coreEntityId ?? point.id}`
      : `${point.voiceId}:${point.timestampNum}/${point.timestampDen}:${point.isRest ? 'rest' : 'main'}`;
    if (seen.has(dedupeKey)) continue;
    seen.add(dedupeKey);
    anchors.push({
      ratio: point.ratio,
      x: point.domX,
      voiceId: point.voiceId,
      kind: isGrace ? 'grace' : 'main',
      priority: isGrace ? 2 : 1,
      hitRadiusPx: point.isRest ? 12 : (isGrace ? 10 : undefined),
      timestampNum: point.timestampNum,
      timestampDen: point.timestampDen,
      isRest: point.isRest,
    });
  }

  return anchors.sort((a, b) => a.x - b.x || a.ratio - b.ratio);
}

function findLeadingRestHoverSnap<T extends {
  domX?: number;
  synthetic?: boolean;
  isRest?: boolean;
  voiceId?: number;
  timestampNum?: number;
  timestampDen?: number;
}>(points: readonly T[], pointerX: number, activeVoiceId: number | null): T | null {
  const candidates = points
    .filter((point) => (
      point.synthetic !== true
      && point.isRest === true
      && (point.timestampNum ?? 0) === 0
      && Number.isFinite(point.domX)
      && (activeVoiceId == null || point.voiceId === activeVoiceId)
    ))
    .sort((left, right) => (
      (left.domX ?? Number.POSITIVE_INFINITY) - (right.domX ?? Number.POSITIVE_INFINITY)
      || (left.voiceId ?? 1) - (right.voiceId ?? 1)
    ));
  const snap = candidates[0] ?? null;
  if (!snap || snap.domX == null) return null;
  return pointerX >= snap.domX - LEADING_REST_ANCHOR_HOVER_TOLERANCE_PX
    && pointerX <= snap.domX + 1
    ? snap
    : null;
}

function resolveRenderedGhostSnap(
  renderedGhostGrid: RenderedGhostGrid | null | undefined,
  measureId: string,
  staffIndex: number,
  pointerX: number,
  activeVoiceId: number | null,
  graceEventIds: Set<string>,
) {
  const staffPoints = filterSelectableRenderedGhostSnapPoints(
    getRenderedGhostStaffPoints(renderedGhostGrid, measureId, staffIndex, { includeSynthetic: true }),
  );
  const activeVoicePoints = activeVoiceId != null
    ? staffPoints.filter((point) => point.voiceId === activeVoiceId)
    : [];
  const snapCandidates = activeVoicePoints.length > 0 ? activeVoicePoints : staffPoints;
  const leadingRestSnap = findLeadingRestHoverSnap(snapCandidates, pointerX, activeVoiceId);
  if (leadingRestSnap) {
    return {
      snappedPoint: leadingRestSnap,
      intentAnchors: buildGhostIntentAnchorsFromGrid(renderedGhostGrid, measureId, staffIndex, graceEventIds),
    };
  }
  const snappedPoint = snapCandidates.reduce<RenderedGhostGridPoint | null>((best, point) => {
    if (!best) return point;
    const bestScore = Math.abs(best.domX - pointerX)
      + (best.synthetic ? 3 : 0)
      - (activeVoiceId != null && best.voiceId === activeVoiceId ? 2 : 0);
    const pointScore = Math.abs(point.domX - pointerX)
      + (point.synthetic ? 3 : 0)
      - (activeVoiceId != null && point.voiceId === activeVoiceId ? 2 : 0);
    if (pointScore !== bestScore) return pointScore < bestScore ? point : best;
    const order = point.domX - best.domX
      || point.ratio - best.ratio
      || point.voiceId - best.voiceId
      || point.domY - best.domY
      || point.id.localeCompare(best.id);
    return order < 0 ? point : best;
  }, null);

  return {
    snappedPoint,
    intentAnchors: buildGhostIntentAnchorsFromGrid(renderedGhostGrid, measureId, staffIndex, graceEventIds),
  };
}

type GhostSnapCandidate = Pick<RenderedGhostGridPoint, 'domX' | 'ratio' | 'voiceId' | 'timestampNum' | 'timestampDen'> & {
  synthetic?: boolean;
  isRest?: boolean;
};

function findNearestRenderedOnsetSnap(
  entries: IndexedRenderedNote[],
  pointerX: number,
  containerRect: DOMRect | null,
  activeVoiceId: number | null,
) {
  const semanticEntries = entries.filter((entry) => !entry.semantic.isRest);
  const candidates = semanticEntries
    .map((entry) => {
      const center = getRenderedPitchCenter(entry.rendered, containerRect);
      return {
        domX: center.x,
        domY: center.y,
        ratio: entry.semantic.timestampNum / Math.max(entry.semantic.timestampDen, 1),
        timestampNum: entry.semantic.timestampNum,
        timestampDen: entry.semantic.timestampDen,
        voiceId: entry.semantic.voiceId,
        synthetic: false,
        isRest: false,
      };
    });
  if (candidates.length === 0) return null;

  const nearest = candidates.reduce((best, point) => {
    const bestScore = Math.abs(best.domX - pointerX) - (activeVoiceId != null && best.voiceId === activeVoiceId ? 2 : 0);
    const pointScore = Math.abs(point.domX - pointerX) - (activeVoiceId != null && point.voiceId === activeVoiceId ? 2 : 0);
    return pointScore < bestScore ? point : best;
  }, candidates[0]!);
  return nearest;
}

export function preferRenderedOnsetSnap<T extends GhostSnapCandidate | null>(
  gridSnap: T,
  renderedSnap: GhostSnapCandidate | null,
  pointerX: number,
): T | GhostSnapCandidate | null {
  if (!renderedSnap) return gridSnap;
  const renderedDx = Math.abs(renderedSnap.domX - pointerX);
  if (!gridSnap) return renderedDx <= 14 ? renderedSnap : null;
  // Refining the horizontal position must not change the chosen input voice.
  if (renderedSnap.voiceId !== gridSnap.voiceId) return gridSnap;
  const gridDx = Math.abs(gridSnap.domX - pointerX);
  const timestampDiffers = renderedSnap.timestampNum !== gridSnap.timestampNum
    || renderedSnap.timestampDen !== gridSnap.timestampDen;
  if (timestampDiffers) {
    if (renderedDx > 14) return gridSnap;
    return renderedDx + 2 < gridDx ? renderedSnap : gridSnap;
  }
  return renderedDx + 6 < gridDx
    ? renderedSnap
    : gridSnap;
}

export function rejectDistantTimestampSnap<T extends GhostSnapCandidate | null>(
  snappedPoint: T,
  pointerX: number,
  pointerRatio: number,
  maxDistancePx = 18,
): T | null {
  if (!snappedPoint) return null;
  const distancePx = Math.abs(snappedPoint.domX - pointerX);
  if (distancePx <= Math.max(maxDistancePx, 0)) return snappedPoint;

  const ratioDistance = Math.abs(snappedPoint.ratio - pointerRatio);
  const sameQuantizedSlot = ratioDistance <= 1e-6;
  if (sameQuantizedSlot && snappedPoint.synthetic !== true) return snappedPoint;

  if (dbg.enabled()) {
    dbg.score(`reject distant ghost snap ${JSON.stringify({
      distancePx: Math.round(distancePx * 100) / 100,
      pointerX: Math.round(pointerX * 100) / 100,
      snapX: Math.round(snappedPoint.domX * 100) / 100,
      pointerRatio: Math.round(pointerRatio * 10000) / 10000,
      snapRatio: Math.round(snappedPoint.ratio * 10000) / 10000,
      synthetic: snappedPoint.synthetic,
    })}`);
  }
  return null;
}

function isDistantRealRestSnap<T extends GhostSnapCandidate | null>(
  snappedPoint: T,
  pointerX: number,
  pointerRatio: number,
  maxDistancePx = 18,
) {
  if (!snappedPoint || snappedPoint.synthetic === true || snappedPoint.isRest !== true) return false;
  const distancePx = Math.abs(snappedPoint.domX - pointerX);
  if (distancePx <= Math.max(maxDistancePx, 0)) return false;
  return Math.abs(snappedPoint.ratio - pointerRatio) > 1e-6;
}

export function resolveEffectiveGhostSnap<T extends GhostSnapCandidate | null>(
  preferredSnap: T,
  quantizedSnap: T,
  options?: {
    pointerX: number;
    pointerRatio: number;
    maxDistancePx?: number;
  },
) {
  const preferred = options
    ? rejectDistantTimestampSnap(preferredSnap, options.pointerX, options.pointerRatio, options.maxDistancePx)
    : preferredSnap;
  if (preferred) return preferred;
  if (!options) return quantizedSnap ?? null;
  if (quantizedSnap) {
    if (Math.abs(quantizedSnap.ratio - options.pointerRatio) <= 1e-6) return quantizedSnap;
    const usableQuantized = rejectDistantTimestampSnap(
      quantizedSnap,
      options.pointerX,
      options.pointerRatio,
      options.maxDistancePx,
    );
    if (usableQuantized) return usableQuantized;
  }
  return isDistantRealRestSnap(preferredSnap, options.pointerX, options.pointerRatio, options.maxDistancePx)
    ? preferredSnap
    : null;
}

export function shouldFindQuantizedGhostSnapFallback<T extends GhostSnapCandidate | null>(
  preferredSnap: T,
  options: {
    pointerX: number;
    pointerRatio: number;
    maxDistancePx?: number;
  },
) {
  return !resolveUsableGhostPreferredSnap(preferredSnap, options);
}

function resolveUsableGhostPreferredSnap<T extends GhostSnapCandidate | null>(
  preferredSnap: T,
  options: {
    pointerX: number;
    pointerRatio: number;
    maxDistancePx?: number;
  },
) {
  return rejectDistantTimestampSnap(preferredSnap, options.pointerX, options.pointerRatio, options.maxDistancePx);
}

function findRenderedGhostPointForQuantizedRatio(
  renderedGhostGrid: RenderedGhostGrid | null | undefined,
  input: {
    measureId: string;
    staffIndex: number;
    voiceId: number | null;
    ratio: number;
  },
) {
  const staffPoints = filterSelectableRenderedGhostSnapPoints(
    getRenderedGhostStaffPoints(renderedGhostGrid, input.measureId, input.staffIndex, { includeSynthetic: true }),
  );
  const points = staffPoints
    .filter((point) => Math.abs(point.ratio - input.ratio) <= 1e-6)
    .sort((left, right) => (
      Number(left.voiceId !== input.voiceId) - Number(right.voiceId !== input.voiceId)
      || Number(left.synthetic) - Number(right.synthetic)
      || left.domX - right.domX
      || left.id.localeCompare(right.id)
    ));
  return points[0] ?? null;
}

function buildQuantizedTrailingSilentGhostPoint(
  renderedGhostGrid: RenderedGhostGrid | null | undefined,
  input: {
    measureId: string;
    measureNumber: number;
    pageIndex?: number | null;
    systemIndex?: number | null;
    corePartId?: string | null;
    staffIndex: number;
    voiceId: number;
    ratio: number;
    pointerX: number;
    slotDuration: number;
    measureDurationRatio: number;
    measureLeft: number;
    measureRight: number;
  },
): RenderedGhostGridPoint | null {
  const measureGrid = renderedGhostGrid?.byMeasureId.get(input.measureId);
  if (!measureGrid) return null;
  const staffPoints = filterSelectableRenderedGhostSnapPoints(
    getRenderedGhostStaffPoints(renderedGhostGrid, input.measureId, input.staffIndex),
  ).filter((point) => !point.synthetic && point.voiceId === input.voiceId);
  let normalizedRatio = clamp(input.ratio, 0, Math.max(input.measureDurationRatio, 0));
  if (normalizedRatio <= 0 || normalizedRatio >= input.measureDurationRatio - 1e-6) return null;
  const finalPoint = staffPoints
    .filter((point) => point.ratio < input.measureDurationRatio - 1e-6)
    .sort((left, right) => right.ratio - left.ratio || right.domX - left.domX)[0] ?? null;
  if (
    finalPoint?.isRest
    && input.slotDuration > 0
    && input.pointerX > finalPoint.domX + 14
  ) {
    const nextSlotRatio = finalPoint.ratio + input.slotDuration;
    if (nextSlotRatio > finalPoint.ratio + 1e-6 && nextSlotRatio < input.measureDurationRatio - 1e-6) {
      normalizedRatio = nextSlotRatio;
    }
  }
  if (staffPoints.some((point) => Math.abs(point.ratio - normalizedRatio) <= 1e-6)) return null;

  const previousPoint = staffPoints
    .filter((point) => point.ratio < normalizedRatio - 1e-6)
    .sort((left, right) => right.ratio - left.ratio || right.domX - left.domX)[0] ?? null;
  if (!previousPoint?.isRest) return null;
  const nextPoint = staffPoints
    .filter((point) => point.ratio > normalizedRatio + 1e-6)
    .sort((left, right) => left.ratio - right.ratio || left.domX - right.domX)[0] ?? null;
  if (nextPoint) return null;

  const timestampBase = 64;
  const timestamp = normalizeFraction(
    Math.round(normalizedRatio * timestampBase),
    timestampBase,
  );
  const tailWidthRatio = (normalizedRatio - previousPoint.ratio)
    / Math.max(input.measureDurationRatio - previousPoint.ratio, 1e-6);
  const domX = clamp(
    previousPoint.domX + ((input.measureRight - previousPoint.domX) * tailWidthRatio),
    input.measureLeft,
    input.measureRight,
  );
  return {
    id: [
      'quantized-trailing-silent',
      input.measureId,
      input.staffIndex,
      input.voiceId,
      `${timestamp.num}/${timestamp.den}`,
    ].join(':'),
    coreEntityId: null,
    corePartId: input.corePartId ?? previousPoint.corePartId ?? measureGrid.corePartId ?? null,
    measureId: input.measureId,
    measureNumber: input.measureNumber,
    pageIndex: input.pageIndex ?? previousPoint.pageIndex ?? null,
    systemIndex: input.systemIndex ?? previousPoint.systemIndex ?? null,
    staffIndex: input.staffIndex,
    voiceId: input.voiceId,
    timestampNum: timestamp.num,
    timestampDen: timestamp.den,
    ratio: fractionToNumber(timestamp),
    domX,
    domY: previousPoint.domY,
    isRest: true,
    synthetic: false,
  };
}

function buildQuantizedRestMeasureGhostPoint(
  renderedGhostGrid: RenderedGhostGrid | null | undefined,
  input: {
    measureId: string;
    measureNumber: number;
    pageIndex?: number | null;
    systemIndex?: number | null;
    corePartId?: string | null;
    staffIndex: number;
    voiceId: number;
    ratio: number;
    measureDurationRatio: number;
    measureLeft: number;
    measureRight: number;
  },
): RenderedGhostGridPoint | null {
  const measureGrid = renderedGhostGrid?.byMeasureId.get(input.measureId);
  const staffPoints = filterSelectableRenderedGhostSnapPoints(
    getRenderedGhostStaffPoints(renderedGhostGrid, input.measureId, input.staffIndex),
  );
  const allStaffPoints = getRenderedGhostStaffPoints(renderedGhostGrid, input.measureId, input.staffIndex, {
    includeSynthetic: true,
  });
  const realRestPoints = staffPoints.filter((point) => !point.synthetic && point.isRest);
  const hasRealPitchedPoint = staffPoints.some((point) => !point.synthetic && !point.isRest);
  if (!measureGrid || realRestPoints.length !== 1 || hasRealPitchedPoint) return null;

  const normalizedRatio = clamp(input.ratio, 0, Math.max(input.measureDurationRatio, 0));
  const timestampBase = 64;
  const timestamp = normalizeFraction(
    Math.round(normalizedRatio * timestampBase),
    timestampBase,
  );
  const existingPoint = staffPoints.find((point) => (
    point.voiceId === input.voiceId
    && timestampsEqual(point.timestampNum, point.timestampDen, timestamp.num, timestamp.den)
  ));
  if (existingPoint) return existingPoint;
  const syntheticPoint = allStaffPoints.find((point) => (
    point.synthetic
    && point.voiceId === input.voiceId
    && timestampsEqual(point.timestampNum, point.timestampDen, timestamp.num, timestamp.den)
  )) ?? allStaffPoints.find((point) => (
    point.synthetic
    && timestampsEqual(point.timestampNum, point.timestampDen, timestamp.num, timestamp.den)
  ));
  if (!syntheticPoint) return null;

  const restPoint = realRestPoints[0]!;
  const domX = clamp(syntheticPoint.domX, input.measureLeft, input.measureRight);
  return {
    id: [
      'quantized-rest',
      input.measureId,
      input.staffIndex,
      input.voiceId,
      `${timestamp.num}/${timestamp.den}`,
    ].join(':'),
    coreEntityId: null,
    corePartId: input.corePartId ?? restPoint.corePartId ?? measureGrid.corePartId ?? null,
    measureId: input.measureId,
    measureNumber: input.measureNumber,
    pageIndex: input.pageIndex ?? restPoint.pageIndex ?? null,
    systemIndex: input.systemIndex ?? restPoint.systemIndex ?? null,
    staffIndex: input.staffIndex,
    voiceId: input.voiceId,
    timestampNum: timestamp.num,
    timestampDen: timestamp.den,
    ratio: fractionToNumber(timestamp),
    domX,
    domY: syntheticPoint.domY ?? restPoint.domY,
    isRest: true,
    synthetic: false,
  };
}

function findNearestRestOnlyMeasureGhostPoint(
  renderedGhostGrid: RenderedGhostGrid | null | undefined,
  input: {
    measureId: string;
    staffIndex: number;
    voiceId: number;
    pointerX: number;
  },
): RenderedGhostGridPoint | null {
  const candidates = filterSelectableRenderedGhostSnapPoints(
    getRenderedGhostStaffPoints(renderedGhostGrid, input.measureId, input.staffIndex, { includeSynthetic: true }),
  ).filter((point) => (
    point.isRest
    && Number.isFinite(point.domX)
    && (point.voiceId === input.voiceId || point.synthetic)
  ));
  if (candidates.length === 0) return null;
  return candidates.reduce((best, point) => {
    const bestScore = Math.abs(best.domX - input.pointerX)
      + (best.voiceId === input.voiceId ? 0 : 2);
    const pointScore = Math.abs(point.domX - input.pointerX)
      + (point.voiceId === input.voiceId ? 0 : 2);
    if (pointScore !== bestScore) return pointScore < bestScore ? point : best;
    return Math.abs(point.ratio - 0) < Math.abs(best.ratio - 0) ? point : best;
  }, candidates[0]!);
}

function quantizeRatioToDurationGrid(
  ratio: number,
  slotDuration: number,
  segmentStartRatio: number,
  maxStartRatio: number,
) {
  if (!(slotDuration > 0)) return clamp(ratio, segmentStartRatio, maxStartRatio);
  const slotIndex = Math.round((ratio - segmentStartRatio) / slotDuration);
  return clamp(segmentStartRatio + (slotIndex * slotDuration), segmentStartRatio, maxStartRatio);
}

function selectedNoteMatchesHoveredContext(
  selectedNote: SelectedNote | null,
  input: {
    measureId: string;
    staffIndex: number;
    corePartId?: string | null;
  },
) {
  if (!selectedNote) return false;
  if (selectedNote.coreMeasureId !== input.measureId) return false;
  if (selectedNote.staffIndex !== input.staffIndex) return false;
  if (input.corePartId && selectedNote.corePartId) return selectedNote.corePartId === input.corePartId;
  return true;
}

function resolveVisibleStaffContext(context: DetailedContext, domPoint: PointLike) {
  const visibleStaff = context.measure.staffDetails
    .map((staff) => {
      const halfStep = staff.lineDistanceDom / 2;
      const staffStep = halfStep > 0 ? Math.round((domPoint.y - staff.topLineDomY) / halfStep) : 0;
      return {
        staff,
        staffStep,
        distance: Math.abs(((staff.topLineDomY + staff.bottomLineDomY) / 2) - domPoint.y),
      };
    })
    .filter((entry) => isMouseEntryStaffStepVisible(entry.staffStep, entry.staff.lineCount))
    .sort((left, right) => left.distance - right.distance)[0] ?? null;

  if (visibleStaff) return { staff: visibleStaff.staff, staffStep: visibleStaff.staffStep };

  return { staff: context.staff, staffStep: context.staffStep };
}

function buildFallbackStaffDetailForEmptyMeasure(
  context: DetailedContext,
  coreDocument: ScoreDocumentModel | null,
): StaffDetail | null {
  const staffIndex = staffIndexForMeasureId(coreDocument, context.measure.measureId)
    ?? context.staff?.staffIndex
    ?? 1;
  const rect = context.measure.domRect;
  if (!(rect.height > 0)) return null;

  const lineDistanceDom = clamp(rect.height / 8, 4, 12);
  const staffHeight = lineDistanceDom * 4;
  const centerY = rect.y + (rect.height / 2);
  const topLineDomY = centerY - (staffHeight / 2);

  return {
    staffIndex,
    corePartId: corePartIdForMeasureId(coreDocument, context.measure.measureId),
    musicSheetStaffId: null,
    topLineDomY,
    bottomLineDomY: topLineDomY + staffHeight,
    lineDistanceDom,
    lineCount: 5,
  };
}

function resolveGhostStaffContext(
  context: DetailedContext,
  domPoint: PointLike,
  coreDocument: ScoreDocumentModel | null,
) {
  const resolved = resolveVisibleStaffContext(context, domPoint);
  if (resolved.staff && resolved.staffStep != null) return resolved;

  const fallbackStaff = buildFallbackStaffDetailForEmptyMeasure(context, coreDocument);
  if (!fallbackStaff) return resolved;

  const halfStep = fallbackStaff.lineDistanceDom / 2;
  const staffStep = halfStep > 0 ? Math.round((domPoint.y - fallbackStaff.topLineDomY) / halfStep) : 0;
  return { staff: fallbackStaff, staffStep };
}

function getMeasureKeyFifths(
  coreDocument: ScoreDocumentModel | null,
  measureNumber: number,
  staffIndex: number,
  corePartId?: string | null,
) {
  if (!coreDocument) return 0;
  const normalizedPartId = corePartId?.replace(/^part:/, '') ?? null;
  const matchingParts = coreDocument.score.parts.filter((part) => (
    !normalizedPartId
    || part.id === corePartId
    || part.sourcePartId === corePartId
    || part.id.replace(/^part:/, '') === normalizedPartId
    || part.sourcePartId.replace(/^part:/, '') === normalizedPartId
  ));
  const parts = matchingParts.length > 0 ? matchingParts : coreDocument.score.parts;
  for (const part of parts) {
    const staff = part.staves.find((entry) => entry.staffIndex === staffIndex);
    if (!staff) continue;
    const measures = [...staff.measures]
      .filter((measure) => measure.measureNumber <= measureNumber)
      .sort((a, b) => b.measureNumber - a.measureNumber);
    for (const measure of measures) {
      const fifths = measure.attributes.find((attribute) => typeof attribute.keyFifths === 'number')?.keyFifths;
      if (typeof fifths === 'number') return fifths;
    }
  }
  return 0;
}

// Deprecated fallback kept temporarily for debugging unusual scores. The proxy
// path is now the default unless explicitly disabled via env.
function resolveGhostNoteTargetLegacy(
  renderedGhostGrid: RenderedGhostGrid | null | undefined,
  ghostIndex: GhostNoteSpatialIndex,
  overlay: RenderedMeasureLayoutOverlay | null,
  systemOverlays: RenderedSystemLayoutOverlay[],
  coreDocument: ScoreDocumentModel | null,
  graceEventIds: Set<string>,
  domPoint: PointLike,
  containerRect: DOMRect | null,
  selectedNote: SelectedNote | null,
  selectedDuration: Props['selectedDuration'],
  selectedAccidental: Props['selectedAccidental'],
  isDotted: boolean,
  selectedVoice: number,
): GhostNoteTarget | null {
  if (!overlay) return null;

  // All notes in this measure (incl. rests) for onset (X) snapping
  const overlayPartId = corePartIdForMeasureId(coreDocument, overlay.measureId);
  const allInMeasure = getRenderedMeasureEntries(ghostIndex, overlay, overlayPartId);
  const systemOverlay = systemOverlays.find((s) => s.systemIndex === overlay.systemIndex);
  const hoveredContextMatch = selectedNoteMatchesHoveredContext(selectedNote, {
    measureId: overlay.measureId,
    staffIndex: selectedNote?.staffIndex ?? allInMeasure[0]?.semantic.staffIndex ?? 1,
    corePartId: overlayPartId,
  });
  const preferredPartId = hoveredContextMatch && selectedNote
    ? selectedNote.corePartId
    : allInMeasure[0]?.semantic.corePartId
      ?? overlayPartId
      ?? null;
  const candidateSystemEntries = [...ghostIndex.bySystemStaff.entries()]
    .filter(([key]) => key.startsWith(`${overlay.systemIndex}:${preferredPartId ?? 'partless'}:`))
    .flatMap(([, entries]) => entries);
  const fallbackSystemEntries = candidateSystemEntries.length > 0
    ? candidateSystemEntries
    : [...ghostIndex.bySystemStaff.entries()]
        .filter(([key]) => key.startsWith(`${overlay.systemIndex}:`))
    .flatMap(([, entries]) => entries);
  const inferredStaffIndex = hoveredContextMatch && selectedNote
    ? selectedNote.staffIndex
    : allInMeasure[0]?.semantic.staffIndex
    ?? fallbackSystemEntries.reduce((best, entry) => {
      if (!best) return entry.semantic.staffIndex;
      const bestDistance = Math.abs(
        getRenderedPitchCenter(
          fallbackSystemEntries.find((candidate) => candidate.semantic.staffIndex === best)?.rendered ?? entry.rendered,
          containerRect,
        ).y - domPoint.y,
      );
      const entryDistance = Math.abs(getRenderedPitchCenter(entry.rendered, containerRect).y - domPoint.y);
      return entryDistance < bestDistance ? entry.semantic.staffIndex : best;
    }, null as number | null)
    ?? 1;

  const allInTargetStaff = allInMeasure.filter((entry) => (
    entry.semantic.staffIndex === inferredStaffIndex
    && (!selectedNote?.corePartId || entry.semantic.corePartId === selectedNote.corePartId)
  ));
  const pitchedInMeasure = allInTargetStaff.filter((e) => !e.semantic.isRest);

  // If no pitched notes in this measure, fall back to system-wide pitched notes for Y calibration
  const notesInMeasure = pitchedInMeasure.length > 0
    ? pitchedInMeasure
    : (ghostIndex.bySystemStaff.get(getSystemStaffKey(overlay.systemIndex, inferredStaffIndex, preferredPartId)) ?? [])
        .filter((entry) => {
          if (entry.semantic.isRest) return false;
          if (systemOverlay) {
            const cy = entry.rendered.domCenter.y;
            return cy >= systemOverlay.domRect.y && cy <= systemOverlay.domRect.y + systemOverlay.domRect.height;
          }
          return true;
        });
  const pitchReferenceNotes = notesInMeasure.length > 0
    ? notesInMeasure
    : getPitchedStaffEntriesAcrossScore(ghostIndex, inferredStaffIndex, preferredPartId);
  if (pitchReferenceNotes.length === 0) return null;

  const laneMap = new Map<string, typeof pitchReferenceNotes>();
  for (const entry of pitchReferenceNotes) {
    const key = `${entry.semantic.staffIndex}:${entry.semantic.voiceId}`;
    const lane = laneMap.get(key) ?? [];
    lane.push(entry);
    laneMap.set(key, lane);
  }
  const activeNotes = [...laneMap.entries()].reduce((best, [key, lane]) => {
    const nearest = lane.reduce((closest, candidate) => {
      if (!closest) return candidate;
      return Math.abs(getRenderedPitchCenter(candidate.rendered, containerRect).y - domPoint.y) < Math.abs(getRenderedPitchCenter(closest.rendered, containerRect).y - domPoint.y)
        ? candidate
        : closest;
    }, null as (typeof lane)[number] | null);
    if (!nearest) return best;

    const nearestCenter = getRenderedPitchCenter(nearest.rendered, containerRect);
    const laneDistance = Math.abs(nearestCenter.y - domPoint.y);
    const laneXDistance = Math.abs(nearestCenter.x - domPoint.x);
    const matchesSelectedLane = selectedNote
      && nearest.semantic.staffIndex === selectedNote.staffIndex
      && nearest.semantic.voiceId === selectedNote.voiceId;
    const matchesSelectedVoice = nearest.semantic.voiceId === selectedVoice;
    const laneScore = laneDistance * 1000 + laneXDistance - (matchesSelectedLane ? 100 : 0) - (matchesSelectedVoice ? 10 : 0);

    if (!best || laneScore < best.score) {
      return { key, lane, score: laneScore };
    }
    return best;
  }, null as { key: string; lane: typeof pitchReferenceNotes; score: number } | null)?.lane ?? pitchReferenceNotes;

  // Anchor the reference by horizontal proximity only. Including the Y
  // distance made the reference jump between high/low pitches as the user
  // moved the cursor vertically, which distorted the pitch mapping and
  // capped the effective pitch range.
  const reference = activeNotes.reduce((best, candidate) => {
    if (!best) return candidate;
    const bestCenter = getRenderedPitchCenter(best.rendered, containerRect);
    const candidateCenter = getRenderedPitchCenter(candidate.rendered, containerRect);
    const bestDx = Math.abs(bestCenter.x - domPoint.x);
    const candidateDx = Math.abs(candidateCenter.x - domPoint.x);
    return candidateDx < bestDx ? candidate : best;
  }, null as (typeof activeNotes)[number] | null);
  if (!reference) return null;

  // Resolve pitch by staff geometry + clef. Legacy path lacks a DetailedContext
  // so we approximate staff half-step from the reference notehead height.
  const referenceCenter = getRenderedPitchCenter(reference.rendered, containerRect);
  const halfStep = Math.max(reference.rendered.domRect.height / 2, 4);
  const clef = resolveClefAtMeasure(coreDocument, overlay.measureNumber, reference.semantic.staffIndex, {
    corePartId: reference.semantic.corePartId,
    measureId: overlay.measureId,
  });
  const referenceStaffStep = Math.round((referenceCenter.y - reference.rendered.domRect.y) / halfStep) - 2;
  const pointerStaffStepFromReference = Math.round((domPoint.y - referenceCenter.y) / halfStep);
  const rawFallbackStaffStep = referenceStaffStep + pointerStaffStepFromReference;
  if (!isMouseEntryStaffStepVisible(rawFallbackStaffStep, 5)) return null;
  const fallbackStaffStep = clampMouseEntryStaffStep(rawFallbackStaffStep);
  const fallbackSnappedY = referenceCenter.y + (pointerStaffStepFromReference * halfStep);
  let pitchResolution = constrainMouseEntryPitchResolution({
    resolution: resolveGhostPitchFromCalibration({
      pointerY: domPoint.y,
      clef,
      fallbackStaffStep,
      fallbackSnappedY,
      // Staff geometry is the runtime pitch-lane source of truth. Rendered
      // notes may validate layout construction, but measure contents must not
      // change the pitch produced for the same staff/Y coordinate.
      samples: [],
    }),
    clef,
    fallbackStaffStep,
    fallbackSnappedY,
    lineCount: 5,
  });
  if (pitchedInMeasure.length === 0) {
    pitchResolution = resolveRestMeasureOverlayPitch({ clef, overlay, pointerY: domPoint.y }) ?? pitchResolution;
  }
  const targetPitch = pitchResolution.targetPitch;

  const safePointer = clampPointerToMeasureInterior({
    pointerX: domPoint.x,
    measureLeft: overlay.domRect.x,
    measureWidth: overlay.domRect.width,
  });
  const { snappedPoint, intentAnchors } = resolveRenderedGhostSnap(
    renderedGhostGrid,
    overlay.measureId,
    reference.semantic.staffIndex,
    safePointer.clampedX,
    selectedVoice,
    graceEventIds,
  );
  const renderedOnsetSnap = findNearestRenderedOnsetSnap(
    allInTargetStaff,
    safePointer.clampedX,
    containerRect,
    selectedVoice,
  );
  const measureDuration = getMeasureDurationRatio(coreDocument, overlay.measureId);
  const fallbackPointerRatio = normalizeFraction(
    Math.round((measureDuration > 0 ? (((safePointer.clampedX - overlay.domRect.x) / Math.max(overlay.domRect.width, 1)) * measureDuration) : 0) * 1024),
    1024,
  );
  const fallbackRhythmicSegment = detectActiveRhythmicSegment(
    coreDocument,
    overlay.measureId,
    reference.semantic.staffIndex,
    selectedVoice,
    fallbackPointerRatio,
  );
  const fallbackSlotDuration = fractionToNumber(getEffectiveDuration(selectedDuration, isDotted, fallbackRhythmicSegment));
  const fallbackSegmentStartRatio = fractionToNumber(fallbackRhythmicSegment.start);
  const fallbackMaxStartRatio = Math.max(
    fractionToNumber(fallbackRhythmicSegment.end) - fallbackSlotDuration,
    fallbackSegmentStartRatio,
  );
  const fallbackQuantizedRatio = quantizeRatioToDurationGrid(
    fractionToNumber(fallbackPointerRatio),
    fallbackSlotDuration,
    fallbackSegmentStartRatio,
    fallbackMaxStartRatio,
  );
  const preferredSnap = preferRenderedOnsetSnap(snappedPoint, renderedOnsetSnap, safePointer.clampedX);
  const snapOptions = {
    pointerX: safePointer.clampedX,
    pointerRatio: fallbackQuantizedRatio,
  };
  const usablePreferredSnap = resolveUsableGhostPreferredSnap(preferredSnap, snapOptions);
  const trailingSilentSnap = buildQuantizedTrailingSilentGhostPoint(renderedGhostGrid, {
    measureId: overlay.measureId,
    measureNumber: overlay.measureNumber,
    pageIndex: overlay.pageIndex,
    systemIndex: overlay.systemIndex,
    corePartId: preferredPartId,
    staffIndex: reference.semantic.staffIndex,
    voiceId: selectedVoice,
    ratio: fallbackQuantizedRatio,
    pointerX: safePointer.clampedX,
    slotDuration: fallbackSlotDuration,
    measureDurationRatio: measureDuration,
    measureLeft: overlay.domRect.x,
    measureRight: overlay.domRect.x + overlay.domRect.width,
  });
  const quantizedSnap = !usablePreferredSnap
    ? findRenderedGhostPointForQuantizedRatio(renderedGhostGrid, {
        measureId: overlay.measureId,
        staffIndex: reference.semantic.staffIndex,
        voiceId: selectedVoice,
        ratio: fallbackQuantizedRatio,
      }) ?? trailingSilentSnap ?? buildQuantizedRestMeasureGhostPoint(renderedGhostGrid, {
        measureId: overlay.measureId,
        measureNumber: overlay.measureNumber,
        pageIndex: overlay.pageIndex,
        systemIndex: overlay.systemIndex,
        corePartId: preferredPartId,
        staffIndex: reference.semantic.staffIndex,
        voiceId: selectedVoice,
        ratio: fallbackQuantizedRatio,
        measureDurationRatio: measureDuration,
        measureLeft: overlay.domRect.x,
        measureRight: overlay.domRect.x + overlay.domRect.width,
      })
    : trailingSilentSnap && Math.abs(usablePreferredSnap.ratio - fallbackQuantizedRatio) > 1e-6
      ? trailingSilentSnap
    : null;
  const effectiveSnappedPoint = resolveEffectiveGhostSnap(usablePreferredSnap, quantizedSnap, snapOptions);
  if (!effectiveSnappedPoint) return null;
  if (effectiveSnappedPoint.synthetic) return null;
  const pointerRatio = normalizeFraction(effectiveSnappedPoint.timestampNum, effectiveSnappedPoint.timestampDen);
  const rhythmicSegment = detectActiveRhythmicSegment(
    coreDocument,
    overlay.measureId,
    reference.semantic.staffIndex,
    selectedVoice,
    pointerRatio,
  );
  const slotDuration = fractionToNumber(getEffectiveDuration(selectedDuration, isDotted, rhythmicSegment));
  const quantizedRatio = effectiveSnappedPoint?.ratio ?? fractionToNumber(pointerRatio);
  const placementIntent = resolveGhostPlacementIntent({
    pointerX: safePointer.clampedX,
    snappedRatio: quantizedRatio,
    slotDuration,
    segmentStartRatio: fractionToNumber(rhythmicSegment.start),
    maxStartRatio: fractionToNumber(rhythmicSegment.end),
    anchors: intentAnchors,
    activeVoiceId: selectedVoice,
  });
  const committedPlacement = resolveGhostCommittedPlacement({
    snappedPoint: effectiveSnappedPoint,
    placementIntent,
    quantizedRatio,
    fallbackX: safePointer.clampedX,
    fallbackVoiceId: selectedVoice,
  });
  const minimumVisibleX = resolveMinimumVisibleGhostX(overlay, intentAnchors);
  const { timestampNum, timestampDen, snappedX, voiceId } = committedPlacement;
  const visiblePlacementX = resolveGhostVisiblePlacementX({
    snappedPoint: effectiveSnappedPoint,
    placementIntent,
    fallbackX: safePointer.clampedX,
  });
  const visibleSnappedX = resolveVisibleGhostSnapX({
    snappedX: visiblePlacementX,
    minimumVisibleX,
    synthetic: effectiveSnappedPoint.synthetic,
  });
  const snappedY = pitchResolution.snappedY;
  const alter = resolveMouseEntryAlter({
    selectedAccidental,
    coreDocument,
    measureNumber: overlay.measureNumber,
    staffIndex: reference.semantic.staffIndex,
    step: targetPitch.step,
    octave: targetPitch.octave,
    timestampNum,
    timestampDen,
    corePartId: reference.semantic.corePartId,
  });
  const stemDirection = resolvePreviewStemDirection({
    staffStep: pitchResolution.staffStep,
    voiceId,
  });
  const previewMetrics = buildGhostPreviewMetrics(visibleSnappedX, snappedY, alter, isDotted, selectedDuration, stemDirection);
  const approxTopLineY = snappedY - (pitchResolution.staffStep * halfStep);
  const ledgerLines = buildLedgerLineSegments({
    staffStep: pitchResolution.staffStep,
    lineCount: 5,
    topLineDomY: approxTopLineY,
    lineDistanceDom: halfStep * 2,
    previewTop: previewMetrics.previewTop,
    noteheadCenterX: previewMetrics.noteheadCenterX,
  });
  const reflowHints = buildGhostReflowHints(allInTargetStaff, visibleSnappedX, snappedY, containerRect, previewMetrics);

  return {
    measureId: overlay.measureId,
    corePartId: reference.semantic.corePartId ?? null,
    measureNumber: overlay.measureNumber,
    pageIndex: overlay.pageIndex,
    systemIndex: overlay.systemIndex,
    staffIndex: reference.semantic.staffIndex,
    voiceId,
    timestampNum,
    timestampDen,
    step: targetPitch.step,
    octave: targetPitch.octave,
    alter,
    domCenter: { x: visibleSnappedX, y: snappedY },
    domRect: {
      x: visibleSnappedX - Math.max(reference.rendered.domRect.width, 12) / 2,
      y: snappedY - Math.max(reference.rendered.domRect.height, 12) / 2,
      width: Math.max(reference.rendered.domRect.width, 12),
      height: Math.max(reference.rendered.domRect.height, 12),
    },
    previewLeft: previewMetrics.previewLeft,
    previewTop: previewMetrics.previewTop,
    previewWidth: previewMetrics.previewWidth,
    previewHeight: previewMetrics.previewHeight,
    pointerX: domPoint.x,
    accidentalOffsetX: previewMetrics.accidentalOffsetX,
    noteheadCenterX: previewMetrics.noteheadCenterX,
    stemDirection,
    placementMode: placementIntent.mode,
    placementAnchorIsRest: placementIntent.anchor?.isRest,
    ledgerLines,
    isGraceTarget: placementIntent.anchor?.kind === 'grace',
    isTuplet: rhythmicSegment.type === 'tuplet',
    tupletLabel: rhythmicSegment.type === 'tuplet' ? String(rhythmicSegment.actualNotes ?? 3) : null,
    reflowHints,
  };
}

function resolveSemanticAnchorGhostTarget(
  context: DetailedContext,
  renderedGhostGrid: RenderedGhostGrid | null | undefined,
  ghostIndex: GhostNoteSpatialIndex,
  measureOverlays: RenderedMeasureLayoutOverlay[],
  systemOverlays: RenderedSystemLayoutOverlay[],
  coreDocument: ScoreDocumentModel | null,
  graceEventIds: Set<string>,
  domPoint: PointLike,
  containerRect: DOMRect | null,
  selectedNote: SelectedNote | null,
  selectedDuration: Props['selectedDuration'],
  selectedAccidental: Props['selectedAccidental'],
  isDotted: boolean,
  selectedVoice: number,
): GhostNoteTarget | null {
  const { measure: overlay } = context;
  const resolvedStaffContext = resolveGhostStaffContext(context, domPoint, coreDocument);
  const { staff, staffStep } = resolvedStaffContext;
  if (!staff || staffStep == null) return null;

  const targetStaffIndex = staff.staffIndex;
  const overlayPartId = corePartIdForMeasureId(coreDocument, overlay.measureId);
  const allInMeasure = getRenderedMeasureEntries(ghostIndex, overlay, overlayPartId);
  const hoveredStaffEntries = allInMeasure.filter((entry) => entry.semantic.staffIndex === targetStaffIndex);
  const preferredPartId = hoveredStaffEntries[0]?.semantic.corePartId ?? overlayPartId;
  const hoveredContextMatch = selectedNoteMatchesHoveredContext(selectedNote, {
    measureId: overlay.measureId,
    staffIndex: targetStaffIndex,
    corePartId: preferredPartId,
  });
  const scopedSelectedNote = hoveredContextMatch ? selectedNote : null;
  const staffCaptureRect = captureMeasureRectForStaff(overlay.domRect, staff, overlay.staffDetails);
  const insideStaffCapture = Boolean(staffCaptureRect && isPointInsideNoteRect(domPoint, staffCaptureRect));
  if (!isMouseEntryStaffStepVisible(staffStep, staff.lineCount) && !insideStaffCapture) return null;
  const protectLeadingModifiers = shouldProtectLeadingMeasureModifiers({
    overlay,
    entries: allInMeasure,
    allOverlays: measureOverlays,
  });
  const anchor = findSemanticAnchorCandidate({
    entries: allInMeasure,
    domPoint,
    containerRect,
    selectedNote: scopedSelectedNote,
    preferredPartId,
    selectedVoice,
    targetStaffIndex,
    graceEventIds,
    measureRect: staffCaptureRect,
    measureDurationRatio: getMeasureDurationRatio(coreDocument, overlay.measureId),
    protectLeadingModifiers,
    coreDocument,
    measureOverlay: overlay,
    measureOverlays,
    staffDetails: overlay.staffDetails,
  });
  if (!anchor) return null;

  const anchorPartId = anchor.entry.semantic.corePartId ?? preferredPartId ?? null;
  const allInTargetStaff = allInMeasure.filter((entry) => (
    entry.semantic.staffIndex === targetStaffIndex
    && (!anchorPartId || entry.semantic.corePartId === anchorPartId)
    && !graceEventIds.has(entry.semantic.coreEntityId ?? '')
  ));
  const pitchedInMeasure = allInTargetStaff.filter((entry) => !entry.semantic.isRest);
  const systemOverlay = systemOverlays.find((entry) => entry.systemIndex === overlay.systemIndex);
  const notesInMeasure = pitchedInMeasure.length > 0
    ? pitchedInMeasure
    : (ghostIndex.bySystemStaff.get(getSystemStaffKey(overlay.systemIndex, targetStaffIndex, anchorPartId)) ?? [])
        .filter((entry) => {
          if (entry.semantic.isRest) return false;
          if (systemOverlay) {
            const cy = getRenderedPitchCenter(entry.rendered, containerRect).y;
            return cy >= systemOverlay.domRect.y && cy <= systemOverlay.domRect.y + systemOverlay.domRect.height;
          }
          return true;
        });
  const pitchReferenceNotes = notesInMeasure.length > 0
    ? notesInMeasure
    : getPitchedStaffEntriesAcrossScore(ghostIndex, targetStaffIndex, anchorPartId);

  const clef = resolveClefAtMeasure(coreDocument, overlay.measureNumber, targetStaffIndex, {
    corePartId: anchorPartId,
    measureId: overlay.measureId,
  });
  const fallbackStaffStep = clampMouseEntryStaffStep(staffStep);
  const fallbackSnappedY = staff.topLineDomY + (fallbackStaffStep * (staff.lineDistanceDom / 2));
  const pitchCalibrationSamples = pitchedInMeasure.length > 0
    ? buildGhostPitchCalibrationSamples(pitchReferenceNotes, containerRect)
    : [];
  const pitchResolution = constrainMouseEntryPitchResolution({
    resolution: resolveGhostPitchFromCalibration({
      pointerY: domPoint.y,
      clef,
      fallbackStaffStep,
      fallbackSnappedY,
      samples: pitchCalibrationSamples,
    }),
    clef,
    fallbackStaffStep,
    fallbackSnappedY,
    lineCount: staff.lineCount,
  });
  const targetPitch = pitchResolution.targetPitch;
  const timestamp = normalizeFraction(
    anchor.entry.semantic.timestampNum,
    Math.max(anchor.entry.semantic.timestampDen, 1),
  );
  const rhythmicSegment = detectActiveRhythmicSegment(
    coreDocument,
    overlay.measureId,
    targetStaffIndex,
    anchor.entry.semantic.voiceId,
    timestamp,
  );
  const slotDuration = fractionToNumber(getEffectiveDuration(selectedDuration, isDotted, rhythmicSegment));
  const anchorRatio = fractionToNumber(timestamp);
  const renderedSnapPoint = findRenderedGhostPointForAnchor(renderedGhostGrid, {
    coreMeasureId: overlay.measureId,
    staffIndex: targetStaffIndex,
    voiceId: anchor.entry.semantic.voiceId,
    timestampNum: timestamp.num,
    timestampDen: timestamp.den,
    isRest: anchor.entry.semantic.isRest,
  }, domPoint.x);
  if (!renderedSnapPoint) return null;
  const segmentStartRatio = fractionToNumber(rhythmicSegment.start);
  const maxStartRatio = Math.max(fractionToNumber(rhythmicSegment.end) - slotDuration, segmentStartRatio);
  const measureDurationRatio = Math.max(getMeasureDurationRatio(coreDocument, overlay.measureId), 1e-6);
  const quantizedMeasureRect = staffCaptureRect ?? overlay.domRect;
  const quantizedMeasureRight = quantizedMeasureRect.x + quantizedMeasureRect.width;
  const uniformNoteStartX = protectLeadingModifiers
    ? uniformNoteStartXForEntries({
        entries: allInMeasure.filter((entry) => !entry.semantic.isRest),
        containerRect,
        measureRect: quantizedMeasureRect,
        staffDetails: overlay.staffDetails,
        measureOverlay: overlay,
        measureOverlays,
      })
    : null;
  const quantizedMeasureLeft = resolveMeasureMusicalStartX({
    measureRect: quantizedMeasureRect,
    measureRight: quantizedMeasureRight,
    protectLeadingModifiers,
    uniformNoteStartX,
  });
  const pointerMeasureRatio = clamp(
    ((domPoint.x - quantizedMeasureLeft) / Math.max(quantizedMeasureRight - quantizedMeasureLeft, 1)) * measureDurationRatio,
    segmentStartRatio,
    maxStartRatio,
  );
  const quantizedAnchorRatio = anchor.entry.semantic.isRest
    ? quantizeRatioToDurationGrid(pointerMeasureRatio, slotDuration, segmentStartRatio, maxStartRatio)
    : anchorRatio;
  const quantizedRestSnap = anchor.entry.semantic.isRest && Math.abs(quantizedAnchorRatio - anchorRatio) > 1e-6
    ? buildQuantizedRestMeasureGhostPoint(renderedGhostGrid, {
        measureId: overlay.measureId,
        measureNumber: overlay.measureNumber,
        pageIndex: overlay.pageIndex,
        systemIndex: overlay.systemIndex,
        corePartId: anchorPartId,
        staffIndex: targetStaffIndex,
        voiceId: selectedVoice,
        ratio: quantizedAnchorRatio,
        measureDurationRatio,
        measureLeft: quantizedMeasureLeft,
        measureRight: quantizedMeasureRight,
      })
    : null;
  const effectiveSnapPoint = renderedSnapPoint;
  const effectiveTimestamp = normalizeFraction(effectiveSnapPoint.timestampNum, Math.max(effectiveSnapPoint.timestampDen, 1));
  const effectiveRatio = fractionToNumber(effectiveTimestamp);
  const snappedX = effectiveSnapPoint.domX;
  const anchorPoint = {
    ratio: anchorRatio,
    x: renderedSnapPoint.domX,
    voiceId: anchor.entry.semantic.voiceId,
    kind: 'main' as const,
    hitRadiusPx: Math.max(anchor.hitRect.width / 2, 8),
    timestampNum: timestamp.num,
    timestampDen: timestamp.den,
    isRest: anchor.entry.semantic.isRest,
  };
  const placementIntent = resolveGhostPlacementIntent({
    pointerX: domPoint.x,
    snappedRatio: effectiveRatio,
    slotDuration,
    segmentStartRatio,
    maxStartRatio,
    anchors: [anchorPoint],
    activeVoiceId: selectedVoice,
    baseHitRadiusPx: Math.max(anchor.hitRect.width / 2, 8),
  });
  const voiceId = placementIntent.targetVoiceId ?? anchor.entry.semantic.voiceId ?? selectedVoice;
  const snappedY = pitchResolution.snappedY;
  const alter = resolveMouseEntryAlter({
    selectedAccidental,
    coreDocument,
    measureNumber: overlay.measureNumber,
    staffIndex: targetStaffIndex,
    step: targetPitch.step,
    octave: targetPitch.octave,
    timestampNum: effectiveTimestamp.num,
    timestampDen: effectiveTimestamp.den,
    corePartId: anchorPartId,
  });
  const stemDirection = resolvePreviewStemDirection({
    staffStep: pitchResolution.staffStep,
    voiceId,
  });
  const previewMetrics = buildGhostPreviewMetrics(snappedX, snappedY, alter, isDotted, selectedDuration, stemDirection);
  const fallbackNoteWidth = Math.max(anchor.rect.width, 12);
  const fallbackNoteHeight = Math.max(anchor.rect.height, 12);
  const ledgerLines = buildLedgerLineSegments({
    staffStep: pitchResolution.staffStep,
    lineCount: staff.lineCount,
    topLineDomY: staff.topLineDomY,
    lineDistanceDom: staff.lineDistanceDom,
    previewTop: previewMetrics.previewTop,
    noteheadCenterX: previewMetrics.noteheadCenterX,
  });
  const reflowHints = buildGhostReflowHints(allInTargetStaff, snappedX, snappedY, containerRect, previewMetrics);
  const isTuplet = rhythmicSegment.type === 'tuplet' || Boolean(context.activeTuplet);
  const snapResolution: GhostSnapResolutionTrace = {
    resolver: 'semantic-anchor',
    reason: 'semantic anchor matched rendered ghost-grid point',
    measureId: overlay.measureId,
    measureNumber: overlay.measureNumber,
    staffIndex: targetStaffIndex,
    voiceId,
    timestamp: `${effectiveTimestamp.num}/${effectiveTimestamp.den}`,
    rawPointerX: roundTraceNumber(domPoint.x),
    safePointerX: roundTraceNumber(domPoint.x),
    pointerMeasureRatio: roundTraceNumber(pointerMeasureRatio),
    fallbackQuantizedRatio: roundTraceNumber(quantizedAnchorRatio),
    quantizedRatio: roundTraceNumber(effectiveRatio),
    slotDuration: roundTraceNumber(slotDuration),
    segmentStartRatio: roundTraceNumber(segmentStartRatio),
    maxStartRatio: roundTraceNumber(maxStartRatio),
    yResolution: {
      rawY: roundTraceNumber(domPoint.y) ?? domPoint.y,
      topLineY: roundTraceNumber(staff.topLineDomY) ?? staff.topLineDomY,
      halfStepPx: roundTraceNumber(staff.lineDistanceDom / 2) ?? (staff.lineDistanceDom / 2),
      rawStaffStep: Math.round((domPoint.y - staff.topLineDomY) / (staff.lineDistanceDom / 2)),
      stableStaffStep: pitchResolution.staffStep,
      clef: `${clef.sign}${clef.line}`,
      staffId: tabletEntryStaffId({
        corePartId: preferredPartId,
        systemIndex: overlay.systemIndex,
        staffIndex: targetStaffIndex,
      }),
      pitch: `${targetPitch.step}${targetPitch.octave}`,
      hysteresisHeld: false,
    },
    gridSnap: traceSnapCandidate(renderedSnapPoint, {
      source: 'rendered-ghost-grid',
      pointerX: domPoint.x,
      ghostX: snappedX,
    }),
    quantizedFallbackSnap: traceSnapCandidate(quantizedRestSnap, {
      source: 'quantized-rest-measure',
      pointerX: domPoint.x,
      ghostX: snappedX,
    }),
    effectiveSnap: traceSnapCandidate(effectiveSnapPoint, {
      source: 'rendered-ghost-grid',
      pointerX: domPoint.x,
      ghostX: snappedX,
    }),
    placementIntent: {
      mode: placementIntent.mode,
      targetVoiceId: placementIntent.targetVoiceId ?? null,
      anchor: traceAnchorCandidate(placementIntent.anchor, {
        source: 'placement-anchor',
        pointerX: domPoint.x,
        ghostX: snappedX,
      }),
    },
    committed: {
      snappedX: roundTraceNumber(snappedX),
      timestamp: `${effectiveTimestamp.num}/${effectiveTimestamp.den}`,
      voiceId,
    },
    visible: {
      domCenterX: roundTraceNumber(snappedX),
      previewLeft: roundTraceNumber(previewMetrics.previewLeft),
      noteheadCenterX: roundTraceNumber(previewMetrics.noteheadCenterX),
      visibleNoteheadX: roundTraceNumber(previewMetrics.previewLeft + previewMetrics.noteheadCenterX),
      minimumVisibleX: null,
    },
    deltas: {
      pointerToGhost: roundTraceNumber(Math.abs(domPoint.x - snappedX)),
      pointerToVisibleNotehead: roundTraceNumber(Math.abs(domPoint.x - (previewMetrics.previewLeft + previewMetrics.noteheadCenterX))),
      ghostToSnap: effectiveSnapPoint ? roundTraceNumber(Math.abs(effectiveSnapPoint.domX - snappedX)) : null,
      visibleNoteheadToSnap: effectiveSnapPoint
        ? roundTraceNumber(Math.abs(effectiveSnapPoint.domX - (previewMetrics.previewLeft + previewMetrics.noteheadCenterX)))
        : null,
      commitToSnap: effectiveSnapPoint ? roundTraceNumber(Math.abs(effectiveSnapPoint.domX - snappedX)) : null,
    },
  };

  if (dbg.enabled()) {
    const signature = [
      overlay.measureId,
      targetStaffIndex,
      timestamp.num,
      timestamp.den,
      semanticAnchorLabel(anchor.entry.semantic),
      `${targetPitch.step}${targetPitch.octave}`,
    ].join('|');
    if (shouldLogGhostSignature(signature, 'pitch')) {
      dbg.score(`semantic ghost anchor ${JSON.stringify({
        overlay: `${overlay.measureId}#${overlay.measureNumber}`,
        staffIndex: targetStaffIndex,
        anchor: semanticAnchorLabel(anchor.entry.semantic),
        hitRect: rectDebug(anchor.hitRect),
        targetPitch: `${targetPitch.step}${targetPitch.octave}`,
      })}`);
    }
  }

  return {
    measureId: overlay.measureId,
    corePartId: anchorPartId,
    measureNumber: overlay.measureNumber,
    pageIndex: overlay.pageIndex,
    systemIndex: overlay.systemIndex,
    staffIndex: targetStaffIndex,
    voiceId,
    timestampNum: effectiveTimestamp.num,
    timestampDen: effectiveTimestamp.den,
    step: targetPitch.step,
    octave: targetPitch.octave,
    alter,
    domCenter: { x: snappedX, y: snappedY },
    domRect: {
      x: snappedX - fallbackNoteWidth / 2,
      y: snappedY - fallbackNoteHeight / 2,
      width: fallbackNoteWidth,
      height: fallbackNoteHeight,
    },
    previewLeft: previewMetrics.previewLeft,
    previewTop: previewMetrics.previewTop,
    previewWidth: previewMetrics.previewWidth,
    previewHeight: previewMetrics.previewHeight,
    pointerX: snappedX,
    accidentalOffsetX: previewMetrics.accidentalOffsetX,
    noteheadCenterX: previewMetrics.noteheadCenterX,
    stemDirection,
    placementMode: placementIntent.mode,
    placementAnchorIsRest: anchor.entry.semantic.isRest,
    allowCrossVoiceRenderedSnap: Boolean(quantizedRestSnap),
    ledgerLines,
    semanticAnchorRect: quantizedRestSnap ? undefined : anchor.hitRect,
    semanticAnchorIsRest: anchor.entry.semantic.isRest,
    semanticAnchorLabel: quantizedRestSnap ? undefined : semanticAnchorLabel(anchor.entry.semantic),
    isTuplet,
    tupletLabel: isTuplet ? String(context.activeTuplet?.actualNotes ?? rhythmicSegment.actualNotes ?? 3) : null,
    reflowHints,
    snapResolution,
  };
}

function mapProxyContextToGhostTarget(
  context: DetailedContext,
  renderedGhostGrid: RenderedGhostGrid | null | undefined,
  ghostIndex: GhostNoteSpatialIndex,
  measureOverlays: RenderedMeasureLayoutOverlay[],
  systemOverlays: RenderedSystemLayoutOverlay[],
  coreDocument: ScoreDocumentModel | null,
  graceEventIds: Set<string>,
  domPoint: PointLike,
  containerRect: DOMRect | null,
  selectedNote: SelectedNote | null,
  selectedDuration: Props['selectedDuration'],
  selectedAccidental: Props['selectedAccidental'],
  isDotted: boolean,
  selectedVoice: number,
): GhostNoteTarget | null {
  const { measure: overlay } = context;
  const resolvedStaffContext = resolveGhostStaffContext(context, domPoint, coreDocument);
  const { staff, staffStep } = resolvedStaffContext;
  if (!staff || staffStep == null) return null;

  const overlayPartId = corePartIdForMeasureId(coreDocument, overlay.measureId);
  const allInMeasure = getRenderedMeasureEntries(ghostIndex, overlay, overlayPartId);
  const systemOverlay = systemOverlays.find((entry) => entry.systemIndex === overlay.systemIndex);
  const targetStaffIndex = staff.staffIndex;
  const staffCaptureRect = captureMeasureRectForStaff(overlay.domRect, staff, overlay.staffDetails);
  const protectLeadingModifiers = shouldProtectLeadingMeasureModifiers({
    overlay,
    entries: allInMeasure,
    allOverlays: measureOverlays,
  });
  const protectedUniformNoteStartX = protectLeadingModifiers && staffCaptureRect
    ? uniformNoteStartXForEntries({
        entries: allInMeasure.filter((entry) => !entry.semantic.isRest),
        containerRect,
        measureRect: staffCaptureRect,
        staffDetails: overlay.staffDetails,
        measureOverlay: overlay,
        measureOverlays,
      })
    : null;
  if (protectLeadingModifiers && staffCaptureRect) {
    const measureLeft = resolveMeasureMusicalStartX({
      measureRect: staffCaptureRect,
      measureRight: staffCaptureRect.x + staffCaptureRect.width,
      protectLeadingModifiers,
      uniformNoteStartX: protectedUniformNoteStartX,
    });
    const leadingRestSnap = findLeadingRestHoverSnap(
      filterSelectableRenderedGhostSnapPoints(
        getRenderedGhostStaffPoints(renderedGhostGrid, overlay.measureId, targetStaffIndex, { includeSynthetic: true }),
      ),
      domPoint.x,
      selectedVoice,
    );
    if (domPoint.x < measureLeft - 0.75 && !leadingRestSnap) return null;
  }
  const hoveredStaffEntries = allInMeasure.filter((entry) => entry.semantic.staffIndex === targetStaffIndex);
  const hoveredContextMatch = selectedNoteMatchesHoveredContext(selectedNote, {
    measureId: overlay.measureId,
    staffIndex: targetStaffIndex,
    corePartId: hoveredStaffEntries[0]?.semantic.corePartId ?? overlayPartId,
  });
  const preferredPartId = hoveredStaffEntries[0]?.semantic.corePartId
    ?? overlayPartId
    ?? (hoveredContextMatch ? selectedNote?.corePartId ?? null : null);
  const preferredVoiceId = hoveredContextMatch ? (selectedNote?.voiceId ?? selectedVoice) : selectedVoice;

  const allInTargetStaff = allInMeasure.filter((entry) => (
    entry.semantic.staffIndex === targetStaffIndex
    && (!preferredPartId || entry.semantic.corePartId === preferredPartId)
  ));
  const pitchedInMeasure = allInTargetStaff.filter((entry) => !entry.semantic.isRest);
  const notesInMeasure = pitchedInMeasure.length > 0
    ? pitchedInMeasure
    : (ghostIndex.bySystemStaff.get(getSystemStaffKey(overlay.systemIndex, targetStaffIndex, preferredPartId)) ?? [])
        .filter((entry) => {
          if (entry.semantic.isRest) return false;
          if (systemOverlay) {
            const cy = entry.rendered.domCenter.y;
            return cy >= systemOverlay.domRect.y && cy <= systemOverlay.domRect.y + systemOverlay.domRect.height;
          }
          return true;
        });
  const pitchReferenceNotes = notesInMeasure.length > 0
    ? notesInMeasure
    : getPitchedStaffEntriesAcrossScore(ghostIndex, targetStaffIndex, preferredPartId);
  const selectedVoiceNotesInMeasure = pitchReferenceNotes.filter((entry) => entry.semantic.voiceId === preferredVoiceId);
  const laneScopedNotesInMeasure = selectedVoiceNotesInMeasure.length > 0
    ? selectedVoiceNotesInMeasure
    : pitchReferenceNotes;

  const laneMap = new Map<string, typeof pitchReferenceNotes>();
  for (const entry of laneScopedNotesInMeasure) {
    const key = `${entry.semantic.staffIndex}:${entry.semantic.voiceId}`;
    const lane = laneMap.get(key) ?? [];
    lane.push(entry);
    laneMap.set(key, lane);
  }
  const activeNotes = [...laneMap.values()].reduce((best, lane) => {
    const nearest = lane.reduce((closest, candidate) => {
      if (!closest) return candidate;
      return Math.abs(getRenderedPitchCenter(candidate.rendered, containerRect).y - domPoint.y)
        < Math.abs(getRenderedPitchCenter(closest.rendered, containerRect).y - domPoint.y)
        ? candidate
        : closest;
    }, null as (typeof lane)[number] | null);
    if (!nearest) return best;

    const nearestCenter = getRenderedPitchCenter(nearest.rendered, containerRect);
    const laneDistance = Math.abs(nearestCenter.y - domPoint.y);
    const laneXDistance = Math.abs(nearestCenter.x - domPoint.x);
    const matchesSelectedLane = selectedNote
      && nearest.semantic.staffIndex === selectedNote.staffIndex
      && nearest.semantic.voiceId === selectedNote.voiceId;
    const matchesSelectedVoice = nearest.semantic.voiceId === preferredVoiceId;
    const laneScore = laneDistance * 1000 + laneXDistance - (matchesSelectedLane ? 100 : 0) - (matchesSelectedVoice ? 10 : 0);

    if (!best || laneScore < best.score) {
      return { lane, score: laneScore };
    }
    return best;
  }, null as { lane: typeof pitchReferenceNotes; score: number } | null)?.lane ?? pitchReferenceNotes;

  const anchoredReference = hoveredContextMatch && selectedNote
    ? laneScopedNotesInMeasure.find((entry) => (
        (selectedNote.coreEntityId && entry.semantic.coreEntityId === selectedNote.coreEntityId)
        || bridgeSelectedNoteEquals(entry.semantic, selectedNote)
      )) ?? pitchReferenceNotes.find((entry) => (
        (selectedNote.coreEntityId && entry.semantic.coreEntityId === selectedNote.coreEntityId)
        || bridgeSelectedNoteEquals(entry.semantic, selectedNote)
      )) ?? null
    : null;

  const reference = anchoredReference ?? activeNotes.reduce((best, candidate) => {
    if (!best) return candidate;
    const bestCenter = getRenderedPitchCenter(best.rendered, containerRect);
    const candidateCenter = getRenderedPitchCenter(candidate.rendered, containerRect);
    const bestDx = Math.abs(bestCenter.x - domPoint.x);
    const candidateDx = Math.abs(candidateCenter.x - domPoint.x);
    return candidateDx < bestDx ? candidate : best;
  }, null as (typeof activeNotes)[number] | null);

  const clef = resolveClefAtMeasure(coreDocument, overlay.measureNumber, targetStaffIndex, {
    corePartId: preferredPartId,
    measureId: overlay.measureId,
  });
  const insideStaffCapture = Boolean(staffCaptureRect && isPointInsideNoteRect(domPoint, staffCaptureRect));
  if (!isMouseEntryStaffStepVisible(staffStep, staff.lineCount) && !insideStaffCapture) return null;
  const fallbackStaffStep = clampMouseEntryStaffStep(staffStep);
  const fallbackSnappedY = staff.topLineDomY + (fallbackStaffStep * (staff.lineDistanceDom / 2));
  let pitchResolution = constrainMouseEntryPitchResolution({
    resolution: resolveGhostPitchFromCalibration({
      pointerY: domPoint.y,
      clef,
      fallbackStaffStep,
      fallbackSnappedY,
      // Canonical staff geometry, not notehead samples, owns direct-entry Y.
      samples: [],
    }),
    clef,
    fallbackStaffStep,
    fallbackSnappedY,
    lineCount: staff.lineCount,
  });
  const targetPitch = pitchResolution.targetPitch;
  if (dbg.enabled()) {
    const pitchSignature = [
      overlay.measureId,
      targetStaffIndex,
      targetPitch.diatonicIndex,
      pitchResolution.staffStep,
      `${clef.sign}${clef.line}`,
    ].join('|');
    if (shouldLogGhostSignature(pitchSignature, 'pitch')) {
      dbg.score(`proxy ghost pitch ${JSON.stringify({
        overlay: `${overlay.measureId}#${overlay.measureNumber}`,
        staffIndex: targetStaffIndex,
        staffStep: pitchResolution.staffStep,
        clef: `${clef.sign}${clef.line}`,
        targetPitch: `${targetPitch.step}${targetPitch.octave}`,
        usedCalibration: pitchResolution.usedCalibration,
      })}`);
    }
  }

  const rhythmicSegment = detectActiveRhythmicSegment(
    coreDocument,
    overlay.measureId,
    targetStaffIndex,
    selectedVoice,
    context.musicalTime,
  );
  const slotDuration = fractionToNumber(getEffectiveDuration(selectedDuration, isDotted, rhythmicSegment));

  const safePointer = clampPointerToMeasureInterior({
    pointerX: domPoint.x,
    measureLeft: overlay.domRect.x,
    measureWidth: overlay.domRect.width,
  });
  const { snappedPoint, intentAnchors } = resolveRenderedGhostSnap(
    renderedGhostGrid,
    overlay.measureId,
    targetStaffIndex,
    safePointer.clampedX,
    selectedVoice,
    graceEventIds,
  );
  const renderedOnsetSnap = findNearestRenderedOnsetSnap(
    allInTargetStaff,
    safePointer.clampedX,
    containerRect,
    selectedVoice,
  );
  const segmentStartRatio = fractionToNumber(rhythmicSegment.start);
  const maxStartRatio = Math.max(fractionToNumber(rhythmicSegment.end) - slotDuration, segmentStartRatio);
  const measureDurationRatio = Math.max(getMeasureDurationRatio(coreDocument, overlay.measureId), 1e-6);
  const quantizedMeasureRect = staffCaptureRect ?? overlay.domRect;
  const quantizedMeasureRight = quantizedMeasureRect.x + quantizedMeasureRect.width;
  const quantizedMeasureLeft = resolveMeasureMusicalStartX({
    measureRect: quantizedMeasureRect,
    measureRight: quantizedMeasureRight,
    protectLeadingModifiers,
    uniformNoteStartX: protectedUniformNoteStartX,
  });
  const pointerMeasureRatio = clamp(
    ((safePointer.clampedX - quantizedMeasureLeft) / Math.max(quantizedMeasureRight - quantizedMeasureLeft, 1)) * measureDurationRatio,
    segmentStartRatio,
    maxStartRatio,
  );
  const fallbackQuantizedRatio = quantizeRatioToDurationGrid(
    pointerMeasureRatio,
    slotDuration,
    segmentStartRatio,
    maxStartRatio,
  );
  const preferredSnap = preferRenderedOnsetSnap(snappedPoint, renderedOnsetSnap, safePointer.clampedX);
  const snapOptions = {
    pointerX: safePointer.clampedX,
    pointerRatio: fallbackQuantizedRatio,
  };
  const usablePreferredSnap = resolveUsableGhostPreferredSnap(preferredSnap, snapOptions);
  const trailingSilentSnap = buildQuantizedTrailingSilentGhostPoint(renderedGhostGrid, {
    measureId: overlay.measureId,
    measureNumber: overlay.measureNumber,
    pageIndex: overlay.pageIndex,
    systemIndex: overlay.systemIndex,
    corePartId: preferredPartId,
    staffIndex: targetStaffIndex,
    voiceId: selectedVoice,
    ratio: fallbackQuantizedRatio,
    pointerX: safePointer.clampedX,
    slotDuration,
    measureDurationRatio,
    measureLeft: quantizedMeasureLeft,
    measureRight: quantizedMeasureRight,
  });
  let quantizedFallbackSnap: RenderedGhostGridPoint | null = null;
  if (!usablePreferredSnap) {
    quantizedFallbackSnap = findRenderedGhostPointForQuantizedRatio(renderedGhostGrid, {
      measureId: overlay.measureId,
      staffIndex: targetStaffIndex,
      voiceId: selectedVoice,
      ratio: fallbackQuantizedRatio,
    }) ?? trailingSilentSnap ?? buildQuantizedRestMeasureGhostPoint(renderedGhostGrid, {
      measureId: overlay.measureId,
      measureNumber: overlay.measureNumber,
      pageIndex: overlay.pageIndex,
      systemIndex: overlay.systemIndex,
      corePartId: preferredPartId,
      staffIndex: targetStaffIndex,
      voiceId: selectedVoice,
      ratio: fallbackQuantizedRatio,
      measureDurationRatio,
      measureLeft: quantizedMeasureLeft,
      measureRight: quantizedMeasureRight,
    });
  } else if (trailingSilentSnap && Math.abs(usablePreferredSnap.ratio - fallbackQuantizedRatio) > 1e-6) {
    quantizedFallbackSnap = trailingSilentSnap;
  }
  const effectiveSnappedPoint = resolveEffectiveGhostSnap(usablePreferredSnap, quantizedFallbackSnap, snapOptions);
  if (!effectiveSnappedPoint) return null;
  if (effectiveSnappedPoint.synthetic) return null;
  const quantizedRatio = effectiveSnappedPoint.ratio;
  const placementIntent = resolveGhostPlacementIntent({
    pointerX: safePointer.clampedX,
    snappedRatio: quantizedRatio,
    slotDuration,
    segmentStartRatio,
    maxStartRatio,
    anchors: intentAnchors,
    activeVoiceId: selectedVoice,
  });
  const committedPlacement = resolveGhostCommittedPlacement({
    snappedPoint: effectiveSnappedPoint,
    placementIntent,
    quantizedRatio,
    fallbackX: safePointer.clampedX,
    fallbackVoiceId: selectedVoice,
  });
  const minimumVisibleX = resolveMinimumVisibleGhostX(overlay, intentAnchors);
  const { timestampNum, timestampDen, snappedX, voiceId } = committedPlacement;
  const visiblePlacementX = resolveGhostVisiblePlacementX({
    snappedPoint: effectiveSnappedPoint,
    placementIntent,
    fallbackX: safePointer.clampedX,
  });
  const visibleSnappedX = resolveVisibleGhostSnapX({
    snappedX: visiblePlacementX,
    minimumVisibleX,
    synthetic: effectiveSnappedPoint.synthetic,
  });
  const snappedY = pitchResolution.snappedY;
  const alter = resolveMouseEntryAlter({
    selectedAccidental,
    coreDocument,
    measureNumber: overlay.measureNumber,
    staffIndex: targetStaffIndex,
    step: targetPitch.step,
    octave: targetPitch.octave,
    timestampNum,
    timestampDen,
    corePartId: preferredPartId,
  });
  const stemDirection = resolvePreviewStemDirection({
    staffStep: pitchResolution.staffStep,
    voiceId,
  });
  const previewMetrics = buildGhostPreviewMetrics(visibleSnappedX, snappedY, alter, isDotted, selectedDuration, stemDirection);
  const fallbackNoteWidth = Math.max(staff.lineDistanceDom * 1.2, 12);
  const fallbackNoteHeight = Math.max(staff.lineDistanceDom * 1.1, 12);
  const ledgerLines = buildLedgerLineSegments({
    staffStep: pitchResolution.staffStep,
    lineCount: staff.lineCount,
    topLineDomY: staff.topLineDomY,
    lineDistanceDom: staff.lineDistanceDom,
    previewTop: previewMetrics.previewTop,
    noteheadCenterX: previewMetrics.noteheadCenterX,
  });
  const reflowHints = buildGhostReflowHints(allInTargetStaff, visibleSnappedX, snappedY, containerRect, previewMetrics);
  const snapResolution: GhostSnapResolutionTrace = {
    resolver: 'proxy',
    reason: 'snap grid point selected',
    measureId: overlay.measureId,
    measureNumber: overlay.measureNumber,
    staffIndex: targetStaffIndex,
    voiceId,
    timestamp: `${timestampNum}/${timestampDen}`,
    rawPointerX: roundTraceNumber(domPoint.x),
    safePointerX: roundTraceNumber(safePointer.clampedX),
    pointerMeasureRatio: roundTraceNumber(pointerMeasureRatio),
    fallbackQuantizedRatio: roundTraceNumber(fallbackQuantizedRatio),
    quantizedRatio: roundTraceNumber(quantizedRatio),
    slotDuration: roundTraceNumber(slotDuration),
    segmentStartRatio: roundTraceNumber(segmentStartRatio),
    maxStartRatio: roundTraceNumber(maxStartRatio),
    yResolution: {
      rawY: roundTraceNumber(domPoint.y) ?? domPoint.y,
      topLineY: roundTraceNumber(staff.topLineDomY) ?? staff.topLineDomY,
      halfStepPx: roundTraceNumber(staff.lineDistanceDom / 2) ?? (staff.lineDistanceDom / 2),
      rawStaffStep: Math.round((domPoint.y - staff.topLineDomY) / (staff.lineDistanceDom / 2)),
      stableStaffStep: pitchResolution.staffStep,
      clef: `${clef.sign}${clef.line}`,
      staffId: tabletEntryStaffId({
        corePartId: preferredPartId,
        systemIndex: overlay.systemIndex,
        staffIndex: targetStaffIndex,
      }),
      pitch: `${targetPitch.step}${targetPitch.octave}`,
      hysteresisHeld: false,
    },
    gridSnap: traceSnapCandidate(snappedPoint, {
      source: 'rendered-ghost-grid',
      pointerX: safePointer.clampedX,
      ghostX: visibleSnappedX,
    }),
    renderedOnsetSnap: traceSnapCandidate(renderedOnsetSnap, {
      source: 'rendered-note-onset',
      pointerX: safePointer.clampedX,
      ghostX: visibleSnappedX,
    }),
    preferredSnap: traceSnapCandidate(preferredSnap, {
      source: 'preferred',
      pointerX: safePointer.clampedX,
      ghostX: visibleSnappedX,
    }),
    effectiveSnap: traceSnapCandidate(effectiveSnappedPoint, {
      source: quantizedFallbackSnap ? 'quantized-fallback' : 'effective',
      pointerX: safePointer.clampedX,
      ghostX: visibleSnappedX,
    }),
    quantizedFallbackSnap: traceSnapCandidate(quantizedFallbackSnap, {
      source: 'quantized-fallback',
      pointerX: safePointer.clampedX,
      ghostX: visibleSnappedX,
    }),
    placementIntent: {
      mode: placementIntent.mode,
      targetVoiceId: placementIntent.targetVoiceId ?? null,
      anchor: traceAnchorCandidate(placementIntent.anchor, {
        source: 'placement-anchor',
        pointerX: safePointer.clampedX,
        ghostX: visibleSnappedX,
      }),
    },
    committed: {
      snappedX: roundTraceNumber(snappedX),
      timestamp: `${timestampNum}/${timestampDen}`,
      voiceId,
    },
    visible: {
      domCenterX: roundTraceNumber(visibleSnappedX),
      previewLeft: roundTraceNumber(previewMetrics.previewLeft),
      noteheadCenterX: roundTraceNumber(previewMetrics.noteheadCenterX),
      visibleNoteheadX: roundTraceNumber(previewMetrics.previewLeft + previewMetrics.noteheadCenterX),
      minimumVisibleX: roundTraceNumber(minimumVisibleX),
    },
    deltas: {
      pointerToGhost: roundTraceNumber(Math.abs(safePointer.clampedX - visibleSnappedX)),
      pointerToVisibleNotehead: roundTraceNumber(Math.abs(safePointer.clampedX - (previewMetrics.previewLeft + previewMetrics.noteheadCenterX))),
      ghostToSnap: effectiveSnappedPoint ? roundTraceNumber(Math.abs(effectiveSnappedPoint.domX - visibleSnappedX)) : null,
      visibleNoteheadToSnap: effectiveSnappedPoint ? roundTraceNumber(Math.abs(effectiveSnappedPoint.domX - (previewMetrics.previewLeft + previewMetrics.noteheadCenterX))) : null,
      commitToSnap: effectiveSnappedPoint ? roundTraceNumber(Math.abs(effectiveSnappedPoint.domX - snappedX)) : null,
    },
  };

  return {
    measureId: overlay.measureId,
    corePartId: reference?.semantic.corePartId ?? preferredPartId ?? null,
    measureNumber: overlay.measureNumber,
    pageIndex: overlay.pageIndex,
    systemIndex: overlay.systemIndex,
    staffIndex: targetStaffIndex,
    voiceId,
    timestampNum,
    timestampDen,
    step: targetPitch.step,
    octave: targetPitch.octave,
    alter,
    domCenter: { x: visibleSnappedX, y: snappedY },
    domRect: {
      x: visibleSnappedX - (reference ? Math.max(reference.rendered.domRect.width, 12) : fallbackNoteWidth) / 2,
      y: snappedY - (reference ? Math.max(reference.rendered.domRect.height, 12) : fallbackNoteHeight) / 2,
      width: reference ? Math.max(reference.rendered.domRect.width, 12) : fallbackNoteWidth,
      height: reference ? Math.max(reference.rendered.domRect.height, 12) : fallbackNoteHeight,
    },
    previewLeft: previewMetrics.previewLeft,
    previewTop: previewMetrics.previewTop,
    previewWidth: previewMetrics.previewWidth,
    previewHeight: previewMetrics.previewHeight,
    pointerX: domPoint.x,
    accidentalOffsetX: previewMetrics.accidentalOffsetX,
    noteheadCenterX: previewMetrics.noteheadCenterX,
    stemDirection,
    placementMode: placementIntent.mode,
    placementAnchorIsRest: placementIntent.anchor?.isRest,
    ledgerLines,
    isGraceTarget: placementIntent.anchor?.kind === 'grace',
    isTuplet: rhythmicSegment.type === 'tuplet' || Boolean(context.activeTuplet),
    tupletLabel: String(context.activeTuplet?.actualNotes ?? rhythmicSegment.actualNotes ?? 3),
    reflowHints,
    snapResolution,
  };
}

function resolveRestOnlyGhostTarget(
  context: DetailedContext | null,
  overlayFallback: RenderedMeasureLayoutOverlay | null,
  renderedGhostGrid: RenderedGhostGrid | null | undefined,
  coreDocument: ScoreDocumentModel | null,
  domPoint: PointLike,
  selectedDuration: Props['selectedDuration'],
  selectedAccidental: Props['selectedAccidental'],
  isDotted: boolean,
  selectedVoice: number,
  staffDetailsByMeasure?: Map<number, StaffDetail[]> | null,
): GhostNoteTarget | null {
  const overlay = context?.measure ?? overlayFallback;
  if (!overlay) return null;
  const overlayStaffDetails = Array.isArray(overlay.staffDetails) && overlay.staffDetails.length > 0
    ? overlay.staffDetails
    : (staffDetailsByMeasure?.get(overlay.measureNumber) ?? []);
  if (overlayStaffDetails.length === 0) return null;
  const nearestOverlayStaff = overlayStaffDetails.reduce((best, staff) => {
    if (!best) return staff;
    const staffCenter = (staff.topLineDomY + staff.bottomLineDomY) / 2;
    const bestCenter = (best.topLineDomY + best.bottomLineDomY) / 2;
    return Math.abs(staffCenter - domPoint.y) < Math.abs(bestCenter - domPoint.y) ? staff : best;
  }, null as StaffDetail | null);
  const resolvedStaffContext = context
    ? resolveGhostStaffContext(context, domPoint, coreDocument)
    : { staff: nearestOverlayStaff, staffStep: null };
  const staff = resolvedStaffContext.staff
    ?? findNearestStaffDetail(overlayStaffDetails, context?.staff?.staffIndex, domPoint.y)
    ?? overlayStaffDetails[0]
    ?? null;
  if (!staff) return null;

  const staffPoints = getRenderedGhostStaffPoints(renderedGhostGrid, overlay.measureId, staff.staffIndex);
  const realRestPoints = staffPoints.filter((point) => !point.synthetic && point.isRest);
  const hasOtherRealInputPoints = staffPoints.some((point) => !point.synthetic && !point.isRest);
  if (realRestPoints.length !== 1 || hasOtherRealInputPoints) return null;

  const restPoint = realRestPoints[0]!;
  const measureDurationRatio = Math.max(getMeasureDurationRatio(coreDocument, overlay.measureId), 1e-6);
  const isSingleWholeMeasureRest = coreDocument
    ? (() => {
        for (const part of coreDocument.score.parts) {
          for (const coreStaff of part.staves) {
            if (coreStaff.staffIndex !== staff.staffIndex) continue;
            const coreMeasure = coreStaff.measures.find((m) => m.id === overlay.measureId);
            if (!coreMeasure) continue;
            const voice = coreMeasure.voices.find((v) => v.voiceId === selectedVoice)
              ?? coreMeasure.voices[0];
            if (!voice) continue;
            const rests = voice.events.filter((e) => e.kind === 'rest');
            const timing = getEffectiveMeasureTiming(coreDocument, {
              measureId: coreMeasure.id,
              measureNumber: coreMeasure.measureNumber,
            });
            const measureDurationDivisions = Math.max(timing?.durationDivisions ?? 0, 0);
            const restDurationDivisions = Math.max(rests[0]?.durationDivisions ?? 0, 0);
            return rests.length === 1
              && rests[0]!.timestampNum === 0
              && voice.events.every((e) => e.kind === 'rest')
              && (
                (measureDurationDivisions > 0 && restDurationDivisions >= measureDurationDivisions)
                || rests[0]!.durationType === 'whole'
                || rests[0]!.durationType === 'breve'
                || rests[0]!.durationType === 'long'
              );
          }
        }
        return false;
      })()
    : false;
  const restTimestamp = normalizeFraction(restPoint.timestampNum, Math.max(restPoint.timestampDen, 1));
  const sameVoiceRestLanePoints = filterSelectableRenderedGhostSnapPoints(
    getRenderedGhostStaffPoints(renderedGhostGrid, overlay.measureId, staff.staffIndex, { includeSynthetic: true }),
  ).filter((point) => (
    point.isRest
    && (
      point.voiceId === selectedVoice
      || point.voiceId === restPoint.voiceId
      || point.synthetic
    )
  ));
  const restLaneHasOnlyStartAnchor = sameVoiceRestLanePoints.length === 1
    && timestampsEqual(
      sameVoiceRestLanePoints[0]!.timestampNum,
      sameVoiceRestLanePoints[0]!.timestampDen,
      restTimestamp.num,
      restTimestamp.den,
    );
  const lockRestOnlyLaneToStartAnchor = isSingleWholeMeasureRest || restLaneHasOnlyStartAnchor;
  const timestamp = restTimestamp;
  const rhythmicSegment = detectActiveRhythmicSegment(
    coreDocument,
    overlay.measureId,
    staff.staffIndex,
    selectedVoice,
    timestamp,
  );
  const slotDuration = fractionToNumber(getEffectiveDuration(selectedDuration, isDotted, rhythmicSegment));
  const segmentStartRatio = fractionToNumber(rhythmicSegment.start);
  const maxStartRatio = Math.max(fractionToNumber(rhythmicSegment.end) - slotDuration, segmentStartRatio);
  const measureRect = isSingleWholeMeasureRest
    ? overlay.domRect
    : captureMeasureRectForStaff(overlay.domRect, staff, overlay.staffDetails) ?? overlay.domRect;
  const measureLeft = measureRect.x;
  const measureRight = measureRect.x + measureRect.width;
  const pointerMeasureRatio = clamp(
    ((domPoint.x - measureLeft) / Math.max(measureRight - measureLeft, 1)) * measureDurationRatio,
    segmentStartRatio,
    maxStartRatio,
  );
  const quantizedRatio = quantizeRatioToDurationGrid(
    pointerMeasureRatio,
    slotDuration,
    segmentStartRatio,
    maxStartRatio,
  );
  const nearestRestSlotPoint = lockRestOnlyLaneToStartAnchor
    ? null
    : findNearestRestOnlyMeasureGhostPoint(renderedGhostGrid, {
        measureId: overlay.measureId,
        staffIndex: staff.staffIndex,
        voiceId: selectedVoice,
        pointerX: domPoint.x,
      });
  const nearestRestSlotIsInternal = nearestRestSlotPoint
    ? !timestampsEqual(
        nearestRestSlotPoint.timestampNum,
        nearestRestSlotPoint.timestampDen,
        restTimestamp.num,
        restTimestamp.den,
      )
    : false;
  const quantizedRestPoint = lockRestOnlyLaneToStartAnchor
    ? null
    : nearestRestSlotIsInternal
      ? nearestRestSlotPoint
      : buildQuantizedRestMeasureGhostPoint(renderedGhostGrid, {
          measureId: overlay.measureId,
          measureNumber: overlay.measureNumber,
          pageIndex: overlay.pageIndex,
          systemIndex: overlay.systemIndex,
          corePartId: restPoint.corePartId,
          staffIndex: staff.staffIndex,
          voiceId: selectedVoice,
          ratio: quantizedRatio,
          measureDurationRatio,
          measureLeft,
          measureRight,
        });
  const quantizedTimestamp = quantizedRestPoint
    ? normalizeFraction(quantizedRestPoint.timestampNum, Math.max(quantizedRestPoint.timestampDen, 1))
    : restTimestamp;
  const quantizedMatchesVisibleRest = timestampsEqual(
    quantizedTimestamp.num,
    quantizedTimestamp.den,
    restTimestamp.num,
    restTimestamp.den,
  );
  const visiblePoint = quantizedMatchesVisibleRest ? restPoint : (quantizedRestPoint ?? restPoint);
  const commitPoint = visiblePoint;
  const visibleTimestamp = normalizeFraction(visiblePoint.timestampNum, Math.max(visiblePoint.timestampDen, 1));
  const commitTimestamp = normalizeFraction(commitPoint.timestampNum, Math.max(commitPoint.timestampDen, 1));
  const placementMode: GhostPlacementMode = 'replace';
  const clef = resolveClefAtMeasure(coreDocument, overlay.measureNumber, staff.staffIndex, {
    corePartId: restPoint.corePartId,
    measureId: overlay.measureId,
  });
  const directStaffStep = staff.lineDistanceDom > 0
    ? Math.round((domPoint.y - staff.topLineDomY) / (staff.lineDistanceDom / 2))
    : resolvedStaffContext.staffStep;
  const fallbackStaffStep = clampMouseEntryStaffStep(directStaffStep ?? resolvedStaffContext.staffStep ?? 4);
  const fallbackSnappedY = staff.topLineDomY + (fallbackStaffStep * (staff.lineDistanceDom / 2));
  const pitchResolution = constrainMouseEntryPitchResolution({
    resolution: resolveGhostPitchFromCalibration({
      pointerY: domPoint.y,
      clef,
      fallbackStaffStep,
      fallbackSnappedY,
      samples: [],
    }),
    clef,
    fallbackStaffStep,
    fallbackSnappedY,
    lineCount: staff.lineCount,
  });
  const targetPitch = pitchResolution.targetPitch;
  const snappedX = visiblePoint.domX;
  const snappedY = pitchResolution.snappedY;
  const alter = resolveMouseEntryAlter({
    selectedAccidental,
    coreDocument,
    measureNumber: overlay.measureNumber,
    staffIndex: staff.staffIndex,
    step: targetPitch.step,
    octave: targetPitch.octave,
    timestampNum: commitTimestamp.num,
    timestampDen: commitTimestamp.den,
    corePartId: commitPoint.corePartId,
  });
  const voiceId = selectedVoice ?? restPoint.voiceId ?? 1;
  const stemDirection = resolvePreviewStemDirection({
    staffStep: pitchResolution.staffStep,
    voiceId,
  });
  const previewMetrics = buildGhostPreviewMetrics(snappedX, snappedY, alter, false, selectedDuration, stemDirection);
  const fallbackNoteWidth = Math.max(staff.lineDistanceDom * 1.2, 12);
  const fallbackNoteHeight = Math.max(staff.lineDistanceDom * 1.1, 12);
  const ledgerLines = buildLedgerLineSegments({
    staffStep: pitchResolution.staffStep,
    lineCount: staff.lineCount,
    topLineDomY: staff.topLineDomY,
    lineDistanceDom: staff.lineDistanceDom,
    previewTop: previewMetrics.previewTop,
    noteheadCenterX: previewMetrics.noteheadCenterX,
  });
  const resolvedTarget: ResolvedEditTarget = {
    source: 'pointer',
    mode: placementMode,
    measureId: overlay.measureId,
    corePartId: commitPoint.corePartId ?? null,
    measureNumber: overlay.measureNumber,
    staffIndex: staff.staffIndex,
    voiceId,
    timestampNum: commitTimestamp.num,
    timestampDen: commitTimestamp.den,
    ratio: fractionToNumber(commitTimestamp),
    domX: commitPoint.domX,
    step: targetPitch.step,
    octave: targetPitch.octave,
    alter,
    existingEventKind: 'rest',
    existingEventStartsAtTarget: true,
    diagnostics: quantizedMatchesVisibleRest
      ? ['rest-only-snap-selected']
      : ['rest-only-snap-selected', 'rest-only-quantized-internal-slot'],
  };
  const snapResolution: GhostSnapResolutionTrace = {
    resolver: 'proxy',
    reason: 'rest-only snap selected',
    measureId: overlay.measureId,
    measureNumber: overlay.measureNumber,
    staffIndex: staff.staffIndex,
    voiceId,
    timestamp: `${visibleTimestamp.num}/${visibleTimestamp.den}`,
    rawPointerX: roundTraceNumber(domPoint.x),
    safePointerX: roundTraceNumber(domPoint.x),
    pointerMeasureRatio: roundTraceNumber(pointerMeasureRatio),
    fallbackQuantizedRatio: roundTraceNumber(quantizedRatio),
    quantizedRatio: roundTraceNumber(fractionToNumber(commitTimestamp)),
    slotDuration: roundTraceNumber(slotDuration),
    segmentStartRatio: roundTraceNumber(segmentStartRatio),
    maxStartRatio: roundTraceNumber(maxStartRatio),
    gridSnap: traceSnapCandidate(restPoint, {
      source: 'rendered-ghost-grid',
      pointerX: domPoint.x,
      ghostX: snappedX,
    }),
    renderedOnsetSnap: null,
    preferredSnap: traceSnapCandidate(restPoint, {
      source: 'preferred',
      pointerX: domPoint.x,
      ghostX: snappedX,
    }),
    effectiveSnap: traceSnapCandidate(visiblePoint, {
      source: 'effective',
      pointerX: domPoint.x,
      ghostX: snappedX,
    }),
    quantizedFallbackSnap: traceSnapCandidate(quantizedRestPoint, {
      source: 'quantized-rest-measure',
      pointerX: domPoint.x,
      ghostX: snappedX,
    }),
    placementIntent: {
      mode: placementMode,
      targetVoiceId: voiceId,
      anchor: {
        source: 'placement-anchor',
        x: roundTraceNumber(visiblePoint.domX),
        ratio: roundTraceNumber(fractionToNumber(visibleTimestamp)),
        timestamp: `${visibleTimestamp.num}/${visibleTimestamp.den}`,
        voice: voiceId,
        isRest: true,
        distanceFromPointer: roundTraceNumber(Math.abs(domPoint.x - visiblePoint.domX)),
        distanceFromGhost: 0,
      },
    },
    committed: {
      snappedX: roundTraceNumber(snappedX),
      timestamp: `${commitTimestamp.num}/${commitTimestamp.den}`,
      voiceId,
    },
    visible: {
      domCenterX: roundTraceNumber(snappedX),
      previewLeft: roundTraceNumber(previewMetrics.previewLeft),
      noteheadCenterX: roundTraceNumber(previewMetrics.noteheadCenterX),
      visibleNoteheadX: roundTraceNumber(previewMetrics.previewLeft + previewMetrics.noteheadCenterX),
      minimumVisibleX: null,
    },
    resolvedTarget: {
      mode: resolvedTarget.mode,
      measureNumber: resolvedTarget.measureNumber,
      staffIndex: resolvedTarget.staffIndex,
      voiceId: resolvedTarget.voiceId,
      timestamp: `${resolvedTarget.timestampNum}/${resolvedTarget.timestampDen}`,
      domX: roundTraceNumber(resolvedTarget.domX),
      diagnostics: resolvedTarget.diagnostics,
    },
    deltas: {
      pointerToGhost: roundTraceNumber(Math.abs(domPoint.x - snappedX)),
      pointerToVisibleNotehead: roundTraceNumber(Math.abs(domPoint.x - (previewMetrics.previewLeft + previewMetrics.noteheadCenterX))),
      ghostToSnap: 0,
      visibleNoteheadToSnap: 0,
      commitToSnap: roundTraceNumber(Math.abs(visiblePoint.domX - commitPoint.domX)),
    },
  };

  return {
    measureId: overlay.measureId,
    corePartId: visiblePoint.corePartId ?? null,
    measureNumber: overlay.measureNumber,
    pageIndex: overlay.pageIndex,
    systemIndex: overlay.systemIndex,
    staffIndex: staff.staffIndex,
    voiceId,
    timestampNum: visibleTimestamp.num,
    timestampDen: visibleTimestamp.den,
    step: targetPitch.step,
    octave: targetPitch.octave,
    alter,
    domCenter: { x: snappedX, y: snappedY },
    domRect: {
      x: snappedX - (fallbackNoteWidth / 2),
      y: snappedY - (fallbackNoteHeight / 2),
      width: fallbackNoteWidth,
      height: fallbackNoteHeight,
    },
    previewLeft: previewMetrics.previewLeft,
    previewTop: previewMetrics.previewTop,
    previewWidth: previewMetrics.previewWidth,
    previewHeight: previewMetrics.previewHeight,
    pointerX: domPoint.x,
    accidentalOffsetX: previewMetrics.accidentalOffsetX,
    noteheadCenterX: previewMetrics.noteheadCenterX,
    stemDirection,
    placementMode,
    placementAnchorIsRest: true,
    allowCrossVoiceRenderedSnap: Boolean(quantizedRestPoint),
    ledgerLines,
    isGraceTarget: false,
    isTuplet: false,
    tupletLabel: '3',
    reflowHints: [],
    resolvedTarget,
    snapResolution,
  };
}

export function resolveClickedRestAnchorGhostTarget(
  anchor: SelectedNote | null,
  overlay: RenderedMeasureLayoutOverlay | null,
  renderedGhostGrid: RenderedGhostGrid | null | undefined,
  coreDocument: ScoreDocumentModel | null,
  domPoint: PointLike,
  selectedDuration: Props['selectedDuration'],
  selectedAccidental: Props['selectedAccidental'],
  selectedVoice: number,
  staffDetailsByMeasure?: Map<number, StaffDetail[]> | null,
): GhostNoteTarget | null {
  if (!anchor?.isRest || !anchor.coreMeasureId || !overlay) return null;
  if (anchor.coreMeasureId !== overlay.measureId) return null;

  const overlayStaffDetails = Array.isArray(overlay.staffDetails) && overlay.staffDetails.length > 0
    ? overlay.staffDetails
    : (staffDetailsByMeasure?.get(overlay.measureNumber) ?? []);
  const staff = findNearestStaffDetail(overlayStaffDetails, anchor.staffIndex, domPoint.y);
  if (!staff) return null;

  const anchorPoint = findRenderedGhostPointForAnchor(renderedGhostGrid, anchor, domPoint.x);
  if (!anchorPoint) return null;

  const halfStep = staff.lineDistanceDom / 2;
  const pointerStaffStep = halfStep > 0
    ? Math.round((domPoint.y - staff.topLineDomY) / halfStep)
    : 4;
  const fallbackStaffStep = clampMouseEntryStaffStep(pointerStaffStep);
  const fallbackSnappedY = staff.topLineDomY + (fallbackStaffStep * halfStep);
  const clef = resolveClefAtMeasure(coreDocument, overlay.measureNumber, anchor.staffIndex, {
    corePartId: anchor.corePartId,
    measureId: overlay.measureId,
  });
  const pitchResolution = constrainMouseEntryPitchResolution({
    resolution: resolveGhostPitchFromCalibration({
      pointerY: domPoint.y,
      clef,
      fallbackStaffStep,
      fallbackSnappedY,
      samples: [],
    }),
    clef,
    fallbackStaffStep,
    fallbackSnappedY,
    lineCount: staff.lineCount,
  });
  const targetPitch = pitchResolution.targetPitch;
  const snappedX = anchorPoint.domX;
  const snappedY = pitchResolution.snappedY;
  const alter = resolveMouseEntryAlter({
    selectedAccidental,
    coreDocument,
    measureNumber: overlay.measureNumber,
    staffIndex: anchor.staffIndex,
    step: targetPitch.step,
    octave: targetPitch.octave,
    timestampNum: anchorPoint.timestampNum,
    timestampDen: anchorPoint.timestampDen,
    corePartId: anchor.corePartId,
  });
  const voiceId = selectedVoice ?? anchorPoint.voiceId ?? anchor.voiceId ?? 1;
  const stemDirection = resolvePreviewStemDirection({
    staffStep: pitchResolution.staffStep,
    voiceId,
  });
  const previewMetrics = buildGhostPreviewMetrics(snappedX, snappedY, alter, false, selectedDuration, stemDirection);
  const fallbackNoteWidth = Math.max(staff.lineDistanceDom * 1.2, 12);
  const fallbackNoteHeight = Math.max(staff.lineDistanceDom * 1.1, 12);
  const ledgerLines = buildLedgerLineSegments({
    staffStep: pitchResolution.staffStep,
    lineCount: staff.lineCount,
    topLineDomY: staff.topLineDomY,
    lineDistanceDom: staff.lineDistanceDom,
    previewTop: previewMetrics.previewTop,
    noteheadCenterX: previewMetrics.noteheadCenterX,
  });
  const snapResolution: GhostSnapResolutionTrace = {
    resolver: 'semantic-anchor',
    reason: 'clicked visible rest anchor',
    measureId: overlay.measureId,
    measureNumber: overlay.measureNumber,
    staffIndex: anchor.staffIndex,
    voiceId,
    timestamp: `${anchorPoint.timestampNum}/${anchorPoint.timestampDen}`,
    rawPointerX: roundTraceNumber(domPoint.x),
    safePointerX: roundTraceNumber(domPoint.x),
    pointerMeasureRatio: null,
    fallbackQuantizedRatio: null,
    quantizedRatio: roundTraceNumber(anchorPoint.ratio),
    slotDuration: null,
    segmentStartRatio: null,
    maxStartRatio: null,
    gridSnap: traceSnapCandidate(anchorPoint, {
      source: 'rendered-ghost-grid',
      pointerX: domPoint.x,
      ghostX: snappedX,
    }),
    renderedOnsetSnap: null,
    preferredSnap: traceSnapCandidate(anchorPoint, {
      source: 'clicked-rest-anchor',
      pointerX: domPoint.x,
      ghostX: snappedX,
    }),
    effectiveSnap: traceSnapCandidate(anchorPoint, {
      source: 'clicked-rest-anchor',
      pointerX: domPoint.x,
      ghostX: snappedX,
    }),
    quantizedFallbackSnap: null,
    placementIntent: {
      mode: 'replace',
      targetVoiceId: voiceId,
      anchor: {
        source: 'placement-anchor',
        x: roundTraceNumber(snappedX),
        ratio: roundTraceNumber(anchorPoint.ratio),
        timestamp: `${anchorPoint.timestampNum}/${anchorPoint.timestampDen}`,
        voice: voiceId,
        isRest: true,
        distanceFromPointer: roundTraceNumber(Math.abs(domPoint.x - snappedX)),
        distanceFromGhost: 0,
      },
    },
    committed: {
      snappedX: roundTraceNumber(snappedX),
      timestamp: `${anchorPoint.timestampNum}/${anchorPoint.timestampDen}`,
      voiceId,
    },
    visible: {
      domCenterX: roundTraceNumber(snappedX),
      previewLeft: roundTraceNumber(previewMetrics.previewLeft),
      noteheadCenterX: roundTraceNumber(previewMetrics.noteheadCenterX),
      visibleNoteheadX: roundTraceNumber(previewMetrics.previewLeft + previewMetrics.noteheadCenterX),
      minimumVisibleX: null,
    },
    resolvedTarget: null,
    deltas: {
      pointerToGhost: roundTraceNumber(Math.abs(domPoint.x - snappedX)),
      pointerToVisibleNotehead: roundTraceNumber(Math.abs(domPoint.x - (previewMetrics.previewLeft + previewMetrics.noteheadCenterX))),
      ghostToSnap: 0,
      visibleNoteheadToSnap: roundTraceNumber(Math.abs(anchorPoint.domX - (previewMetrics.previewLeft + previewMetrics.noteheadCenterX))),
      commitToSnap: 0,
    },
  };

  return {
    measureId: overlay.measureId,
    corePartId: anchor.corePartId ?? anchorPoint.corePartId ?? null,
    measureNumber: overlay.measureNumber,
    pageIndex: overlay.pageIndex,
    systemIndex: overlay.systemIndex,
    staffIndex: anchor.staffIndex,
    voiceId,
    timestampNum: anchorPoint.timestampNum,
    timestampDen: anchorPoint.timestampDen,
    step: targetPitch.step,
    octave: targetPitch.octave,
    alter,
    domCenter: { x: snappedX, y: snappedY },
    domRect: {
      x: snappedX - (fallbackNoteWidth / 2),
      y: snappedY - (fallbackNoteHeight / 2),
      width: fallbackNoteWidth,
      height: fallbackNoteHeight,
    },
    previewLeft: previewMetrics.previewLeft,
    previewTop: previewMetrics.previewTop,
    previewWidth: previewMetrics.previewWidth,
    previewHeight: previewMetrics.previewHeight,
    pointerX: domPoint.x,
    accidentalOffsetX: previewMetrics.accidentalOffsetX,
    noteheadCenterX: previewMetrics.noteheadCenterX,
    stemDirection,
    placementMode: 'replace',
    placementAnchorIsRest: true,
    ledgerLines,
    semanticAnchorIsRest: true,
    semanticAnchorLabel: semanticAnchorLabel(anchor),
    reflowHints: [],
    snapResolution,
  };
}

function isGhostTargetInLeadingProtectedArea(
  target: GhostNoteTarget | null,
  ghostIndex: GhostNoteSpatialIndex,
  measureOverlays: RenderedMeasureLayoutOverlay[],
  containerRect: DOMRect | null,
): boolean {
  if (!target || target.placementMode === 'chord') return false;
  const overlay = measureOverlays.find((candidate) => candidate.measureId === target.measureId)
    ?? measureOverlays.find((candidate) => (
      candidate.measureNumber === target.measureNumber
      && candidate.systemIndex === target.systemIndex
      && staffIndexForMeasureId(null, candidate.measureId) === target.staffIndex
    ))
    ?? null;
  if (!overlay) return false;

  const allInMeasure = getRenderedMeasureEntries(ghostIndex, overlay, target.corePartId);
  if (!allInMeasure.some((entry) => !entry.semantic.isRest)) return false;
  if (!shouldProtectLeadingMeasureModifiers({
    overlay,
    entries: allInMeasure,
    allOverlays: measureOverlays,
  })) return false;

  const measureRect = overlay.domRect;
  if (!measureRect || !(measureRect.width > 0)) return false;

  const uniformNoteStartX = uniformNoteStartXForEntries({
    entries: allInMeasure.filter((entry) => !entry.semantic.isRest),
    containerRect,
    measureRect,
    measureOverlay: overlay,
    measureOverlays,
  });
  const protectedRight = Math.min(
    measureRect.x + measureRect.width - 1,
    Math.max(
      leadingTimeSignatureGuardRightX(overlay),
      resolveMeasureMusicalStartX({
        measureRect,
        measureRight: measureRect.x + measureRect.width,
        protectLeadingModifiers: true,
        uniformNoteStartX,
      }),
    ),
  );
  const visibleNoteheadCenterX = target.previewLeft + target.noteheadCenterX;
  if (isResolvedFirstSlotRestSnapTarget(target, leadingTimeSignatureGuardRightX(overlay))) {
    return false;
  }
  if (
    target.resolvedTarget?.diagnostics.includes('rest-only-quantized-internal-slot')
    && target.resolvedTarget.domX != null
    && Number.isFinite(target.resolvedTarget.domX)
  ) {
    return false;
  }
  return Math.min(target.domCenter.x, visibleNoteheadCenterX) < protectedRight - 0.75;
}

export function resolveGhostNoteTarget(
  geometryProxy: GeometryProxy,
  renderedGhostGrid: RenderedGhostGrid | null | undefined,
  ghostIndex: GhostNoteSpatialIndex,
  overlay: RenderedMeasureLayoutOverlay | null,
  measureOverlays: RenderedMeasureLayoutOverlay[],
  systemOverlays: RenderedSystemLayoutOverlay[],
  coreDocument: ScoreDocumentModel | null,
  graceEventIds: Set<string>,
  domPoint: PointLike,
  containerRect: DOMRect | null,
  selectedNote: SelectedNote | null,
  selectedDuration: Props['selectedDuration'],
  selectedAccidental: Props['selectedAccidental'],
  isDotted: boolean,
  selectedVoice: number,
  preferredStaffIndex: number | null,
  hysteresisPx: number,
  staffDetailsByMeasure?: Map<number, StaffDetail[]> | null,
  options?: { allowLeadingProtectedArea?: boolean },
): GhostNoteTarget | null {
  const allowLeadingProtectedArea = options?.allowLeadingProtectedArea === true;
  const context = geometryProxy.getDetailedContext(domPoint, {
    preferredStaffIndex,
    hysteresisPx,
  });
  if (!context) {
    return resolveRestOnlyGhostTarget(
      null,
      overlay,
      renderedGhostGrid,
      coreDocument,
      domPoint,
      selectedDuration,
      selectedAccidental,
      isDotted,
      selectedVoice,
      staffDetailsByMeasure,
    );
  }

  const leadingRestOnlyTarget = resolveRestOnlyGhostTarget(
    context,
    null,
    renderedGhostGrid,
    coreDocument,
    domPoint,
    selectedDuration,
    selectedAccidental,
    isDotted,
    selectedVoice,
    staffDetailsByMeasure,
  );
  if (
    leadingRestOnlyTarget
    && (allowLeadingProtectedArea || !isGhostTargetInLeadingProtectedArea(leadingRestOnlyTarget, ghostIndex, measureOverlays, containerRect))
  ) {
    return leadingRestOnlyTarget;
  }

  const proxyTarget = mapProxyContextToGhostTarget(
    context,
    renderedGhostGrid,
    ghostIndex,
    measureOverlays,
    systemOverlays,
    coreDocument,
    graceEventIds,
    domPoint,
    containerRect,
    selectedNote,
    selectedDuration,
    selectedAccidental,
    isDotted,
    selectedVoice,
  );
  const proxyRestOnlyTarget = proxyTarget?.placementAnchorIsRest
    ? resolveRestOnlyGhostTarget(
        context,
        null,
        renderedGhostGrid,
        coreDocument,
        domPoint,
        selectedDuration,
        selectedAccidental,
        isDotted,
        selectedVoice,
        staffDetailsByMeasure,
      )
    : null;
  const effectiveProxyTarget = proxyRestOnlyTarget ?? proxyTarget;
  if (
    effectiveProxyTarget
    && (allowLeadingProtectedArea || !isGhostTargetInLeadingProtectedArea(effectiveProxyTarget, ghostIndex, measureOverlays, containerRect))
  ) {
    return effectiveProxyTarget;
  }

  const semanticTarget = resolveSemanticAnchorGhostTarget(
    context,
    renderedGhostGrid,
    ghostIndex,
    measureOverlays,
    systemOverlays,
    coreDocument,
    graceEventIds,
    domPoint,
    containerRect,
    selectedNote,
    selectedDuration,
    selectedAccidental,
    isDotted,
    selectedVoice,
  );
  if (
    semanticTarget
    && (allowLeadingProtectedArea || !isGhostTargetInLeadingProtectedArea(semanticTarget, ghostIndex, measureOverlays, containerRect))
  ) {
    return semanticTarget;
  }

  const restOnlyTarget = resolveRestOnlyGhostTarget(
    context,
    null,
    renderedGhostGrid,
    coreDocument,
    domPoint,
    selectedDuration,
    selectedAccidental,
    isDotted,
    selectedVoice,
    staffDetailsByMeasure,
  );
  if (
    restOnlyTarget
    && (allowLeadingProtectedArea || !isGhostTargetInLeadingProtectedArea(restOnlyTarget, ghostIndex, measureOverlays, containerRect))
  ) {
    return restOnlyTarget;
  }

  if (preferredStaffIndex == null) return null;
  const unlockedContext = geometryProxy.getDetailedContext(domPoint, {
    preferredStaffIndex: null,
    hysteresisPx: 0,
  });
  if (!unlockedContext || unlockedContext.measure.measureId !== context.measure.measureId) return null;

  const unlockedTarget = resolveSemanticAnchorGhostTarget(
    unlockedContext,
    renderedGhostGrid,
    ghostIndex,
    measureOverlays,
    systemOverlays,
    coreDocument,
    graceEventIds,
    domPoint,
    containerRect,
    selectedNote,
    selectedDuration,
    selectedAccidental,
    isDotted,
    selectedVoice,
  );
  return !allowLeadingProtectedArea && isGhostTargetInLeadingProtectedArea(unlockedTarget, ghostIndex, measureOverlays, containerRect)
    ? null
    : unlockedTarget;
}

export function sanitizeXmlForOsmdRender(xml: string) {
  try {
    const parser = new DOMParser();
    const doc = parser.parseFromString(xml, 'application/xml');
    Array.from(doc.getElementsByTagName('sound')).forEach((sound) => {
      sound.removeAttribute('tempo');
      if (!sound.attributes.length) {
        sound.parentNode?.removeChild(sound);
      }
    });
    Array.from(doc.getElementsByTagName('direction')).forEach((direction) => {
      const directionTypes = Array.from(direction.getElementsByTagName('direction-type'));
      const hasBrokenDirectionType = directionTypes.some((directionType) => !firstElementChildOf(directionType));
      const hasMetronome = direction.getElementsByTagName('metronome').length > 0;
      const hasTempoSound = Array.from(direction.getElementsByTagName('sound')).some((sound) => sound.hasAttribute('tempo'));
      const hasRenderableDirectionType = directionTypes.some((directionType) => Boolean(firstElementChildOf(directionType)));
      if (hasMetronome || hasTempoSound || hasBrokenDirectionType || !hasRenderableDirectionType) {
        direction.parentNode?.removeChild(direction);
      }
    });
    Array.from(doc.getElementsByTagName('metronome')).forEach((metronome) => {
      const direction = metronome.closest('direction');
      direction?.parentNode?.removeChild(direction);
    });
    Array.from(doc.getElementsByTagName('note')).forEach((note) => {
      const pitch = note.getElementsByTagName('pitch')[0] ?? null;
      const hasRenderablePitch = Boolean(
        pitch?.getElementsByTagName('step')[0]
        && pitch.getElementsByTagName('octave')[0],
      );
      if (hasRenderablePitch) return;

      Array.from(note.childNodes)
        .filter((child): child is Element => child.nodeType === 1 && (child as Element).tagName === 'chord')
        .forEach((chord) => note.removeChild(chord));
    });
    return new XMLSerializer().serializeToString(doc);
  } catch {
    return xml;
  }
}

function buildOsmdRenderAttempts(projectedXml: string, sourceXml: string) {
  const sanitizedProjectedXml = sanitizeXmlForOsmdRender(projectedXml);
  const sanitizedSourceXml = sanitizeXmlForOsmdRender(sourceXml);
  const projectedNeedsSanitization = sanitizedProjectedXml !== projectedXml;
  const sourceNeedsSanitization = sanitizedSourceXml !== sourceXml;

  const attempts = [
    projectedNeedsSanitization
      ? { xml: sanitizedProjectedXml, label: 'sanitized projected render xml' }
      : { xml: projectedXml, label: 'projected render xml' },
    projectedNeedsSanitization
      ? { xml: projectedXml, label: 'projected render xml' }
      : { xml: sanitizedProjectedXml, label: 'sanitized projected render xml' },
    sourceNeedsSanitization
      ? { xml: sanitizedSourceXml, label: 'sanitized source xml' }
      : { xml: sourceXml, label: 'source xml' },
    sourceNeedsSanitization
      ? { xml: sourceXml, label: 'source xml' }
      : { xml: sanitizedSourceXml, label: 'sanitized source xml' },
  ];

  return attempts.filter((entry, index, items) => (
    items.findIndex((candidate) => candidate.xml === entry.xml && candidate.label === entry.label) === index
  ));
}

export default function ScoreEditor({
  xml,
  coreDocument,
  diagnostics = [],
  editorError = null,
  noteInputAnchor,
  selectedNote,
  selectedNotes,
  noteInputMode,
  pencilOnlyInput = false,
  inputByDurationMode = false,
  preparedDurationActivePitch = null,
  selectedDuration,
  selectedAccidental,
  isDotted,
  selectedVoice,
  entryMode = 'insert',
  chordInputMode = false,
  currentMeasure,
  playbackState,
  playbackActive,
  playbackCursorTarget,
  playbackPlayhead,
  followPlayback = true,
  onNoteClick,
  onPlaceNoteAt,
  onSetChordSymbol,
  onSetGuitarFret,
  onPlaybackSeekRequest,
  dragTransposeMode = 'chromatic',
  onDragTransposeCommit,
  onDragPitchPreview,
  onDirectEntryPitchPreview,
  onDragStringCommit,
  onMeasureSelectionChange,
  clearMeasureSelectionSignal = 0,
  sessionViewMode,
  sessionZoomPercent,
  onSessionViewModeChange,
  onSessionZoomPercentChange,
  onRenderStart,
  onRenderError,
  semanticGridReady = true,
  onOsmdReady,
}: Props) {
  const viewportRef = useRef<HTMLDivElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const osmdRef = useRef<any>(null);
  const renderedNotesRef = useRef<RenderedNote[]>([]);
  const ghostNoteIndexRef = useRef<GhostNoteSpatialIndex>({ byMeasureId: new Map(), bySystemStaff: new Map() });
  const geometryProxyRef = useRef(new GeometryProxy());
  const activeVisualTargetsRef = useRef<SVGElement[]>([]);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [activeVisualTargets, setActiveVisualTargets] = useState<SVGElement[]>([]);
  const [visualSelectionOnly, setVisualSelectionOnly] = useState(false);
  const [ghostNoteTarget, setGhostNoteTarget] = useState<GhostNoteTarget | null>(null);
  const ghostNoteTargetRef = useRef<GhostNoteTarget | null>(null);
  const tabletEntrySessionRef = useRef<ActiveTabletEntrySession | null>(null);
  const pendingTabletPointerMoveRef = useRef<React.PointerEvent<HTMLDivElement> | null>(null);
  const pendingTabletPointerMoveTimeRef = useRef<number | null>(null);
  const tabletPointerMoveFrameRef = useRef<number | null>(null);
  const pointerRefinementMetricsRef = useRef<PointerRefinementMetrics>(createPointerRefinementMetrics());
  const previousSemanticXmlRef = useRef(xml);
  const lastTabletStaffSwitchPulseRef = useRef(0);
  const [tabletEntryVisual, setTabletEntryVisual] = useState<TabletEntryVisualState>({
    phase: 'idle',
    pointerType: null,
    point: null,
  });
  const previousGhostNoteTargetRef = useRef<GhostNoteTarget | null>(null);
  const visibleGhostPointerLockRef = useRef<GhostNoteTarget | null>(null);
  const recentGhostNoteTargetsRef = useRef<GhostNoteTarget[]>([]);
  const lastGuitarFretClickRef = useRef<{ key: string; x: number; y: number; time: number; eventTime: number } | null>(null);
  const [dragPreviewTarget, setDragPreviewTarget] = useState<GhostNoteTarget | null>(null);
  const [measureLayoutOverlays, setMeasureLayoutOverlays] = useState<RenderedMeasureLayoutOverlay[]>([]);
  const [systemLayoutOverlays, setSystemLayoutOverlays] = useState<RenderedSystemLayoutOverlay[]>([]);
  const [selectedMeasureIds, setSelectedMeasureIds] = useState<string[]>([]);
  const [lastSelectedMeasureId, setLastSelectedMeasureId] = useState<string | null>(null);
  const [renderedNoteDebugMarkers, setRenderedNoteDebugMarkers] = useState<RenderedNoteDebugMarker[]>([]);
  const [selectionConfidence, setSelectionConfidence] = useState<SelectionConfidenceReport | null>(null);
  const [renderViewportRevision, setRenderViewportRevision] = useState(0);
  const [viewMode, setViewMode] = useState<ScoreViewMode>(sessionViewMode ?? 'continuous-vertical');
  const [zoomPercent, setZoomPercent] = useState(() => clamp(sessionZoomPercent ?? 100, MIN_ZOOM, MAX_ZOOM));
  const zoomPercentRef = useRef(zoomPercent);
  zoomPercentRef.current = zoomPercent;
  // Zoom of the last completed render, and the pointer anchor waiting for the next one.
  const renderedZoomRef = useRef(zoomPercent);
  const pendingZoomAnchorRef = useRef<ZoomAnchor | null>(null);
  const [navigatorVisible, setNavigatorVisible] = useState(false);
  const [findVisible, setFindVisible] = useState(false);
  const [findQuery, setFindQuery] = useState('');
  const [findStatus, setFindStatus] = useState<string | null>(null);
  const [inlineChordEditor, setInlineChordEditor] = useState<{
    left: number;
    top: number;
    value: string;
    targetKey: string;
    targetNote: SelectedNote | null;
  } | null>(null);
  const [inlineGuitarFretEditor, setInlineGuitarFretEditor] = useState<{
    left: number;
    top: number;
    value: string;
    targetKey: string;
    targetNote: SelectedNote;
  } | null>(null);
  const [visualDebugEnabled, setVisualDebugEnabled] = useState(false);
  const semanticGridDebugEnabled = visualDebugEnabled && semanticGridReady;
  const [overlayLayerOffset, setOverlayLayerOffset] = useState<OverlayLayerOffset>({ x: 0, y: 0 });
  const [viewportBox, setViewportBox] = useState({
    width: 0,
    height: 0,
    scrollLeft: 0,
    scrollTop: 0,
    scrollWidth: 0,
    scrollHeight: 0,
  });
  const layoutBridgeRef = useRef<ReturnType<typeof buildOsmdLayoutBridge> | null>(null);
  const renderedGhostGridRef = useRef<RenderedGhostGrid>(createEmptyRenderedGhostGrid());
  const interactiveEditMapRef = useRef(createEmptyInteractiveEditMap());
  const selectedMeasureIdsRef = useRef<string[]>([]);
  const lastSelectedMeasureIdRef = useRef<string | null>(null);
  const measureLayoutOverlaysRef = useRef<RenderedMeasureLayoutOverlay[]>([]);
  const systemLayoutOverlaysRef = useRef<RenderedSystemLayoutOverlay[]>([]);
  const staffDetailsByMeasureRef = useRef<Map<number, StaffDetail[]>>(new Map());
  const tintedRenderedNoteElementsRef = useRef<SVGElement[]>([]);
  const tintedVisualElementsRef = useRef<SVGElement[]>([]);
  const tintedGuitarFretElementsRef = useRef<SVGElement[]>([]);
  const lastPointerClientRef = useRef<{ x: number; y: number } | null>(null);
  const lastPlacementClientRef = useRef<{ x: number; y: number } | null>(null);
  const lastPlacementMeasureIdRef = useRef<string | null>(null);
  const lastNoteInputCommitTargetRef = useRef<PointerEntryLocator | null>(null);
  const lastAdvancedGhostAnchorRef = useRef<SelectedNote | null>(null);
  const lastGhostStaffIndexRef = useRef<number | null>(null);
  const dragSessionRef = useRef<DragTransposeSession | null>(null);
  const findInputRef = useRef<HTMLInputElement>(null);
  const inlineChordInputRef = useRef<HTMLInputElement>(null);
  const inlineGuitarFretInputRef = useRef<HTMLInputElement>(null);
  const selectedDurationRef = useRef<Props['selectedDuration']>(selectedDuration);
  const isDottedRef = useRef(isDotted);
  const onPlaceNoteAtRef = useRef(onPlaceNoteAt);
  const handlePointerDownRef = useRef<((event: PointerEvent) => void) | null>(null);
  const handleDoubleClickRef = useRef<((event: MouseEvent) => void) | null>(null);
  const lastEmittedMeasureSelectionRef = useRef<{ measureIds: string[]; measureNumbers: number[] }>({
    measureIds: [],
    measureNumbers: [],
  });
  const lastSelectionHighlightLogRef = useRef<string | null>(null);
  const semanticGridDebugSignatureRef = useRef<string | null>(null);
  const lastPlaybackFollowMeasureRef = useRef<number | null>(null);
  const lastObservedViewportWidthRef = useRef<number | null>(null);
  const stickyGhostDiagnosticsRef = useRef<Array<{
    kind: 'ghost-diagnostic';
    level: 'error';
    code: string;
    message: string;
  }>>([]);
  const stickyGhostDiagnosticKeysRef = useRef<Set<string>>(new Set());
  const ghostSnapTraceHistoryRef = useRef<GhostSnapResolutionTrace[]>([]);
  const ghostSnapTraceSignatureRef = useRef<string | null>(null);
  const semanticGridErrorHistoryRef = useRef<unknown[]>([]);
  const semanticGridErrorHistorySignaturesRef = useRef<Set<string>>(new Set());
  const semanticGridVisibleErrorSummaryRef = useRef<unknown | null>(null);
  const lastEmittedSessionViewModeRef = useRef<ScoreViewMode | null>(null);
  const lastEmittedSessionZoomPercentRef = useRef<number | null>(null);
  const lastPlaybackFollowSystemRef = useRef<number | null>(null);

  useEffect(() => {
    const target = window as typeof window & {
      __NEX_NOTE_POINTER_METRICS__?: () => PointerRefinementMetrics;
    };
    const readMetrics = () => ({ ...pointerRefinementMetricsRef.current });
    target.__NEX_NOTE_POINTER_METRICS__ = readMetrics;
    return () => {
      if (target.__NEX_NOTE_POINTER_METRICS__ === readMetrics) {
        delete target.__NEX_NOTE_POINTER_METRICS__;
      }
    };
  }, []);

  useEffect(() => {
    if (
      previousSemanticXmlRef.current !== xml
      && tabletEntrySessionRef.current
    ) {
      pointerRefinementMetricsRef.current.semanticDocumentRegenerations += 1;
    }
    previousSemanticXmlRef.current = xml;
  }, [xml]);

  useEffect(() => {
    if (!onSessionViewModeChange) return;
    if (lastEmittedSessionViewModeRef.current === viewMode) return;
    lastEmittedSessionViewModeRef.current = viewMode;
    onSessionViewModeChange(viewMode);
  }, [onSessionViewModeChange, viewMode]);

  useEffect(() => {
    if (!onSessionZoomPercentChange) return;
    if (lastEmittedSessionZoomPercentRef.current === zoomPercent) return;
    lastEmittedSessionZoomPercentRef.current = zoomPercent;
    onSessionZoomPercentChange(zoomPercent);
  }, [onSessionZoomPercentChange, zoomPercent]);

  selectedDurationRef.current = selectedDuration;
  isDottedRef.current = isDotted;
  onPlaceNoteAtRef.current = onPlaceNoteAt;
  activeVisualTargetsRef.current = activeVisualTargets;
  selectedMeasureIdsRef.current = selectedMeasureIds;
  lastSelectedMeasureIdRef.current = lastSelectedMeasureId;
  measureLayoutOverlaysRef.current = measureLayoutOverlays;
  systemLayoutOverlaysRef.current = systemLayoutOverlays;

  const clearActiveScoreTints = useCallback(() => {
    tintedRenderedNoteElementsRef.current.forEach((element) => tintRenderedNote(element, null));
    tintedVisualElementsRef.current.forEach((element) => tintSvgElement(element, null));
    tintedGuitarFretElementsRef.current.forEach((element) => tintSvgElement(element, null));
    tintedRenderedNoteElementsRef.current = [];
    tintedVisualElementsRef.current = [];
    tintedGuitarFretElementsRef.current = [];
  }, []);

  useEffect(() => {
    if (!visualDebugEnabled && !dbg.enabled()) {
      setRenderedNoteDebugMarkers((current) => current.length > 0 ? [] : current);
      return;
    }
    setRenderedNoteDebugMarkers(buildRenderedNoteDebugMarkers(renderedNotesRef.current, selectedNote, selectionConfidence));
  }, [selectedNote, selectionConfidence, visualDebugEnabled, xml]);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const target = window as typeof window & {
      __NEX_NOTE_RENDERED_NOTES__?: RenderedNoteDebugMarker[];
    };
    if (!visualDebugEnabled && !dbg.enabled()) {
      delete target.__NEX_NOTE_RENDERED_NOTES__;
      return;
    }
    target.__NEX_NOTE_RENDERED_NOTES__ = renderedNoteDebugMarkers;
  }, [renderedNoteDebugMarkers, visualDebugEnabled]);

  const visibleMeasureSelectionIds = useMemo(
    () => getVisibleMeasureSelectionIds(selectedMeasureIds, selectedNote, selectedNotes, noteInputMode),
    [noteInputMode, selectedMeasureIds, selectedNote, selectedNotes],
  );

  useEffect(() => {
    const previous = ghostNoteTargetRef.current;
    if (previous && ghostNoteTarget && !ghostTargetsEqual(previous, ghostNoteTarget)) {
      previousGhostNoteTargetRef.current = previous;
    }
    if (ghostNoteTarget) {
      recentGhostNoteTargetsRef.current = [
        ghostNoteTarget,
        ...recentGhostNoteTargetsRef.current.filter((target) => !ghostTargetsEqual(target, ghostNoteTarget)),
      ].slice(0, 16);
    }
    ghostNoteTargetRef.current = ghostNoteTarget;
  }, [ghostNoteTarget]);

  useEffect(() => {
    setGhostNoteTarget(null);
    lastGhostStaffIndexRef.current = null;
  }, [selectedDuration, isDotted]);
  useEffect(() => {
    if (noteInputMode) return;
    lastNoteInputCommitTargetRef.current = null;
  }, [noteInputMode]);
  const graceEventIds = useMemo(() => buildGraceEventIdSet(coreDocument), [coreDocument]);
  const pageCount = useMemo(
    () => Math.max(1, measureLayoutOverlays.reduce((max, overlay) => Math.max(max, overlay.pageIndex + 1), 1)),
    [measureLayoutOverlays],
  );
  useEffect(() => {
    setVisualDebugEnabled(readClientVisualDebugEnabled());
    if (typeof window === 'undefined') return;
    const api = window as unknown as Record<string, unknown>;
    api.enableVisualDebug = () => {
      const url = new URL(window.location.href);
      url.searchParams.set('visual-debug', 'true');
      window.location.href = url.toString();
    };
    api.disableVisualDebug = () => {
      const url = new URL(window.location.href);
      url.searchParams.set('visual-debug', 'false');
      window.location.href = url.toString();
    };
    api.resetVisualDebug = () => {
      const url = new URL(window.location.href);
      url.searchParams.delete('visual-debug');
      url.searchParams.delete('visualDebug');
      url.searchParams.delete('debugMatrix');
      window.location.href = url.toString();
    };
  }, []);
  const applyMeasureSelection = useCallback((nextIds: string[], nextAnchor: string | null) => {
    dbg.score(`measure selection → [${nextIds.join(', ')}] anchor=${nextAnchor ?? 'null'}`);
    selectedMeasureIdsRef.current = nextIds;
    lastSelectedMeasureIdRef.current = nextAnchor;
    setSelectedMeasureIds(nextIds);
    setLastSelectedMeasureId(nextAnchor);
  }, []);

  const syncViewportBox = useCallback(() => {
    const viewport = viewportRef.current;
    if (!viewport) return;
    const nextViewportBox = {
      width: viewport.clientWidth,
      height: viewport.clientHeight,
      scrollLeft: viewport.scrollLeft,
      scrollTop: viewport.scrollTop,
      scrollWidth: viewport.scrollWidth,
      scrollHeight: viewport.scrollHeight,
    };
    setViewportBox((current) => {
      if (
        current.width === nextViewportBox.width
        && current.height === nextViewportBox.height
        && current.scrollLeft === nextViewportBox.scrollLeft
        && current.scrollTop === nextViewportBox.scrollTop
        && current.scrollWidth === nextViewportBox.scrollWidth
        && current.scrollHeight === nextViewportBox.scrollHeight
      ) {
        return current;
      }
      return nextViewportBox;
    });
  }, []);

  const scrollToMeasureNumber = useCallback((measureNumber: number, behavior: ScrollBehavior = 'smooth') => {
    const viewport = viewportRef.current;
    if (!viewport) return false;
    const target = measureLayoutOverlaysRef.current.find((overlay) => overlay.measureNumber === measureNumber);
    if (!target) return false;
    viewport.scrollTo({
      left: Math.max(target.domRect.x - 32, 0),
      top: Math.max(target.domRect.y - 32, 0),
      behavior,
    });
    return true;
  }, []);

  const scrollPlaybackTargetIntoView = useCallback((target: PlaybackCursorTarget, behavior: ScrollBehavior = 'smooth') => {
    const viewport = viewportRef.current;
    if (!viewport) return false;
    const overlay = measureLayoutOverlaysRef.current.find((entry) => entry.measureNumber === target.measureNumber);
    if (!overlay) return false;

    const rect = visibleMeasureRectForStaff(overlay, staffDetailsByMeasureRef.current, coreDocument);
    const marginX = Math.min(160, Math.max(32, viewport.clientWidth * 0.18));
    const marginY = Math.min(140, Math.max(32, viewport.clientHeight * 0.22));
    const viewportLeft = viewport.scrollLeft;
    const viewportTop = viewport.scrollTop;
    const viewportRight = viewportLeft + viewport.clientWidth;
    const viewportBottom = viewportTop + viewport.clientHeight;
    const rectRight = rect.x + rect.width;
    const rectBottom = rect.y + rect.height;

    let nextLeft = viewportLeft;
    let nextTop = viewportTop;
    if (rect.x < viewportLeft + marginX) {
      nextLeft = rect.x - marginX;
    } else if (rectRight > viewportRight - marginX) {
      nextLeft = rectRight - viewport.clientWidth + marginX;
    }
    if (rect.y < viewportTop + marginY) {
      nextTop = rect.y - marginY;
    } else if (rectBottom > viewportBottom - marginY) {
      nextTop = rectBottom - viewport.clientHeight + marginY;
    }

    nextLeft = clamp(nextLeft, 0, Math.max(viewport.scrollWidth - viewport.clientWidth, 0));
    nextTop = clamp(nextTop, 0, Math.max(viewport.scrollHeight - viewport.clientHeight, 0));
    if (Math.abs(nextLeft - viewportLeft) < 1 && Math.abs(nextTop - viewportTop) < 1) return true;

    viewport.scrollTo({ left: nextLeft, top: nextTop, behavior });
    return true;
  }, [coreDocument]);

  const scrollPlaybackPlayheadIntoView = useCallback((playhead: PlaybackPlayheadSnapshot, behavior: ScrollBehavior = 'smooth') => {
    const viewport = viewportRef.current;
    if (!viewport) return false;
    const rect = resolvePlayheadRect(playhead, measureLayoutOverlaysRef.current, staffDetailsByMeasureRef.current);
    if (!rect) return false;
    const activeMeasureOverlay = measureLayoutOverlaysRef.current.find((entry) => entry.measureNumber === playhead.measureNumber) ?? null;
    const activeSystemOverlay = activeMeasureOverlay
      ? systemLayoutOverlaysRef.current.find((entry) => entry.systemIndex === activeMeasureOverlay.systemIndex) ?? null
      : null;

    const marginX = Math.min(220, Math.max(48, viewport.clientWidth * 0.25));
    const topDockOffset = 24;
    const viewportLeft = viewport.scrollLeft;
    const viewportTop = viewport.scrollTop;
    const viewportRight = viewportLeft + viewport.clientWidth;
    const viewportBottom = viewportTop + viewport.clientHeight;

    let nextLeft = viewportLeft;
    let nextTop = viewportTop;
    if (rect.x < viewportLeft + marginX || rect.x > viewportRight - marginX) {
      nextLeft = rect.x - (viewport.clientWidth / 2);
    }
    if (activeSystemOverlay) {
      const systemTop = Math.max(activeSystemOverlay.domRect.y - topDockOffset, 0);
      if (lastPlaybackFollowSystemRef.current !== activeSystemOverlay.systemIndex) {
        nextTop = systemTop;
      } else if (rect.y < viewportTop + topDockOffset) {
        nextTop = systemTop;
      } else if (rect.y + rect.height > viewportBottom - topDockOffset) {
        nextTop = systemTop;
      }
    } else if (rect.y < viewportTop + topDockOffset) {
      nextTop = rect.y - topDockOffset;
    } else if (rect.y + rect.height > viewportBottom - topDockOffset) {
      nextTop = rect.y + rect.height - viewport.clientHeight + topDockOffset;
    }

    nextLeft = clamp(nextLeft, 0, Math.max(viewport.scrollWidth - viewport.clientWidth, 0));
    nextTop = clamp(nextTop, 0, Math.max(viewport.scrollHeight - viewport.clientHeight, 0));
    if (Math.abs(nextLeft - viewportLeft) < 1 && Math.abs(nextTop - viewportTop) < 1) return true;

    viewport.scrollTo({ left: nextLeft, top: nextTop, behavior });
    return true;
  }, [coreDocument]);

  const scrollToPageNumber = useCallback((pageNumber: number, behavior: ScrollBehavior = 'smooth') => {
    const viewport = viewportRef.current;
    if (!viewport) return false;
    const measureNumber = measureNumberForPageIndex(measureLayoutOverlaysRef.current, pageNumber - 1);
    if (measureNumber == null) return false;
    return scrollToMeasureNumber(measureNumber, behavior);
  }, [scrollToMeasureNumber]);

  const adjustZoom = useCallback((delta: number) => {
    setZoomPercent((current) => clamp(current + delta, MIN_ZOOM, MAX_ZOOM));
  }, []);

  const setZoom = useCallback((value: number) => {
    setZoomPercent(clamp(value, MIN_ZOOM, MAX_ZOOM));
  }, []);

  const refreshGeometryProxy = useCallback((
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    osmd: any,
    container: HTMLElement,
    measureOverlays: RenderedMeasureLayoutOverlay[],
    renderedGhostGrid: RenderedGhostGrid,
  ) => {
    geometryProxyRef.current.update({
      osmd,
      container,
      coreDocument,
      measureOverlays,
      renderedGhostGrid,
    });
  }, [coreDocument]);

  const scheduleRenderedGeometryRefresh = useCallback(() => {
    // Mouse note input changes the score before OSMD has finished rebuilding;
    // rebuild snap geometry after that render settles.
    window.requestAnimationFrame(() => {
      window.requestAnimationFrame(() => {
        geometryProxyRef.current.invalidate();
        setRenderViewportRevision((value) => value + 1);
      });
    });
  }, []);

  const handlePlaybackSeekClick = useCallback((event: React.MouseEvent<HTMLDivElement>) => {
    if (playbackState !== 'stopped' || !onPlaybackSeekRequest) return;
    const container = containerRef.current;
    if (!container) return;
    const rect = container.getBoundingClientRect();
    const domPoint = {
      x: event.clientX - rect.left,
      y: event.clientY - rect.top,
    };
    const overlay = findMeasureOverlayForPoint(measureLayoutOverlaysRef.current, domPoint)
      ?? findNearestMeasureOverlayForPoint(measureLayoutOverlaysRef.current, domPoint);
    if (!overlay) return;
    const visibleRect = visibleMeasureRectForStaff(overlay, staffDetailsByMeasureRef.current, coreDocument);
    const ratio = clamp((domPoint.x - visibleRect.x) / Math.max(visibleRect.width, 1), 0, 1);
    onPlaybackSeekRequest({
      measureNumber: overlay.measureNumber,
      timestampNum: Math.round(ratio * 64),
      timestampDen: 64,
    });
  }, [coreDocument, onPlaybackSeekRequest, playbackState]);

  const submitFind = useCallback((query: string) => {
    const trimmed = query.trim();
    if (!trimmed) {
      setFindStatus(null);
      return false;
    }

    const target = resolveFindTarget(trimmed, coreDocument, pageCount);
    if (!target) {
      setFindStatus(`No match for ${trimmed}`);
      return false;
    }

    const moved = target.mode === 'page'
      ? scrollToPageNumber(Number.parseInt(target.value, 10))
      : scrollToMeasureNumber(target.measureNumber);
    setFindStatus(moved ? `${target.mode} ${target.value}` : `No match for ${trimmed}`);
    return moved;
  }, [coreDocument, pageCount, scrollToMeasureNumber, scrollToPageNumber]);

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const initializeOsmd = useCallback((OpenSheetMusicDisplay: any, candidateXml: string) => {
    if (!containerRef.current) return null;
    containerRef.current.innerHTML = '';
    const pageFormat = viewMode === 'page' ? 'A4_P' : 'Endless';
    const osmd = new OpenSheetMusicDisplay(containerRef.current, {
      autoResize: false,
      ...resolveMusicXmlMetadataDrawOptions(candidateXml, coreDocument),
      drawingParameters: 'default',
      autoGenerateMultipleRestMeasuresFromRestMeasures: false,
      zoom: zoomPercent / 100,
      pageFormat,
      renderSingleHorizontalStaffline: viewMode === 'continuous-horizontal',
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } as any);
    applyNotationFont(osmd);
    osmdRef.current = osmd;
    return osmd;
  }, [coreDocument, viewMode, zoomPercent]);

  const loadAndRenderOsmd = useCallback(async (
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    OpenSheetMusicDisplay: any,
    candidateXml: string,
    signal?: AbortSignal,
  ) => {
    const osmd = initializeOsmd(OpenSheetMusicDisplay, candidateXml);
    if (!osmd) return null;
    const loadStarted = performance.now();
    await osmd.load(nestedTupletRenderXml(candidateXml, coreDocument));
    if (hasNestedTuplets(coreDocument)) {
      osmd.EngravingRules.TupletNumberUseShowNoneXMLValue = true;
      osmd.EngravingRules.TupletsBracketedUseXMLValue = true;
    }
    if (signal?.aborted) return null;
    installOsmdGlyphBoundsCache(osmd);
    recordInputMetric('osmd-load', performance.now() - loadStarted);
    // OSMD ignores `zoom` as a constructor option and load() resets its zoom to 1,
    // so the scale must be set after load and before render.
    osmd.Zoom = zoomPercent / 100;
    const renderStarted = performance.now();
    osmd.render();
    const glyphCacheInstalled = installOsmdGlyphBoundsCache(osmd);
    if (containerRef.current) containerRef.current.dataset.glyphBoundsCache = String(glyphCacheInstalled);
    recordInputMetric('osmd-render', performance.now() - renderStarted);
    if (containerRef.current) postProcessTabClefs(containerRef.current);
    return osmd;
  }, [initializeOsmd, coreDocument, zoomPercent]);

  const processPointerMove = useCallback((e: React.PointerEvent<HTMLDivElement>) => {
    if (pencilOnlyInput && e.pointerType === 'touch') return;
    lastPointerClientRef.current = { x: e.clientX, y: e.clientY };
    const dragSession = dragSessionRef.current;
    if (dragSession) {
      const container = containerRef.current;
      if (!container) return;
      const rect = container.getBoundingClientRect();
      if (!isPointInsideRect(e.clientX, e.clientY, rect)) {
        dragSession.lastResolvedPitch = null;
        dragSession.lastResolvedGuitar = null;
        setDragPreviewTarget(null);
        return;
      }
      const domPoint = {
        x: e.clientX - rect.left,
        y: e.clientY - rect.top,
      };
      const dragDistance = Math.hypot(
        domPoint.x - dragSession.pointerDownDomPoint.x,
        domPoint.y - dragSession.pointerDownDomPoint.y,
      );
      if (!dragSession.dragStarted && dragDistance < 4) return;
      dragSession.dragStarted = true;

      const rendered = findRenderedSelectionTarget(dragSession.note, renderedNotesRef.current, coreDocument);

      if (dragSession.tabDrag && dragSession.note.guitar) {
        // TAB staff drag: the pitch is fixed; vertical movement picks the target
        // string (one per TAB line) and the fret follows from the tuning.
        const tabContext = geometryProxyRef.current.getDetailedContext(domPoint, {
          preferredStaffIndex: dragSession.note.staffIndex,
          hysteresisPx: ghostStaffHysteresisPx(zoomPercent, true) * 2.5,
        });
        const measure = tabContext?.measure;
        if (!measure || (dragSession.note.coreMeasureId && measure.measureId !== dragSession.note.coreMeasureId)) return;
        const staffDetail = measure.staffDetails.find((detail) => detail.staffIndex === dragSession.note.staffIndex)
          ?? tabContext?.staff
          ?? null;
        if (!staffDetail || staffDetail.lineCount < 4) return;
        const lineDistance = Math.max(staffDetail.lineDistanceDom, 1);
        const stringDelta = Math.round(
          (domPoint.y - dragSession.pointerDownDomPoint.y) / lineDistance,
        );
        const targetString = clamp(
          dragSession.note.guitar.string + stringDelta,
          1,
          Math.min(staffDetail.lineCount, 6),
        ) as 1 | 2 | 3 | 4 | 5 | 6;
        const tuning = resolveGuitarTuning(dragSession.note.guitar.tuning);
        const noteMidi = notePitchToMidi(dragSession.note.step, dragSession.note.alter, dragSession.note.octave);
        const fret = fretForMidiOnString(noteMidi, targetString, tuning);
        if (fret == null) {
          dragSession.lastResolvedGuitar = null;
          setDragPreviewTarget(null);
          return;
        }
        const stringChanged = dragSession.lastResolvedGuitar?.string !== targetString;
        dragSession.lastResolvedGuitar = { string: targetString, fret };
        setDragPreviewTarget(buildTabStringDragPreviewTarget({
          measure,
          note: dragSession.note,
          domCenterX: rendered?.domCenter.x ?? dragSession.startDomPoint.x,
          snappedY: dragSession.pointerDownDomPoint.y
            + ((targetString - dragSession.note.guitar.string) * lineDistance),
          tabString: targetString,
          tabFret: fret,
          pulse: stringChanged,
        }));
        return;
      }

      if (!rendered) return;

      const context = geometryProxyRef.current.getDetailedContext(domPoint, {
        preferredStaffIndex: dragSession.currentStaffIndex,
        hysteresisPx: ghostStaffHysteresisPx(zoomPercent, true) * 2.5,
      });
      if (!context?.staff || context.staffStep == null) return;

      const nearestStaffDistance = computeNearestStaffDistance(context.measure.staffDetails, dragSession.currentStaffIndex, domPoint.y);
      const isNearEscape = nearestStaffDistance < (ghostStaffHysteresisPx(zoomPercent, true) * 2.5 * 1.2);
      const previousStaffIndex = dragSession.lastPreviewStaffIndex;
      const targetStaffIndex = context.staff.staffIndex;
      const deltaStaffSteps = dragSession.startStaffStep - context.staffStep;
      const startMidi = notePitchToMidi(dragSession.note.step, dragSession.note.alter, dragSession.note.octave);
      const dragPitch = resolveDragTransposePitch({
        note: dragSession.note,
        deltaStaffSteps,
        mode: dragTransposeMode,
        keyFifths: getMeasureKeyFifths(
          coreDocument,
          dragSession.note.measureNumber,
          targetStaffIndex,
          dragSession.note.corePartId,
        ),
      });
      const staffChanged = previousStaffIndex !== targetStaffIndex;
      dragSession.currentStaffIndex = targetStaffIndex;
      dragSession.lastPreviewStaffIndex = targetStaffIndex;
      const nextPreview = buildDragPreviewTarget({
        context,
        rendered,
        dragPitch,
        transposeMode: dragTransposeMode,
        selectedDuration: dragSession.note.durationType
          ? DURATION_TYPE_TO_INPUT[dragSession.note.durationType] ?? '4'
          : '4',
        isDotted: Boolean(dragSession.note.isDotted),
        pulse: staffChanged,
        isNearEscape,
        targetStaffIndex,
      });
      setDragPreviewTarget(nextPreview);
      dragSession.lastResolvedPitch = {
        step: dragPitch.step,
        alter: dragPitch.alter,
        octave: dragPitch.octave,
      };

      const semitoneDelta = dragPitch.pitch - startMidi;
      if (semitoneDelta !== dragSession.lastSemitoneDelta) {
        if (!staffChanged) {
          onDragPitchPreview?.({
            ...dragSession.note,
            step: dragPitch.step,
            alter: dragPitch.alter,
            octave: dragPitch.octave,
            staffIndex: targetStaffIndex,
          });
        }
        dragSession.lastSemitoneDelta = semitoneDelta;
      }
      return;
    }
    const activeTabletSession = tabletEntrySessionRef.current;
    if (activeTabletSession && e.pointerId !== activeTabletSession.pointerId) {
      tabletEntrySessionRef.current = cancelTabletEntrySession(activeTabletSession);
      setTabletEntryVisual({
        phase: 'cancelled',
        pointerType: activeTabletSession.pointerType,
        point: activeTabletSession.latestPoint,
      });
      setGhostNoteTarget(null);
      return;
    }
    if (!noteInputMode || inputByDurationMode) {
      if (ghostNoteTarget) setGhostNoteTarget(null);
      return;
    }
    const container = containerRef.current;
    if (!container) return;
    const rect = container.getBoundingClientRect();
    if (!isPointInsideRect(e.clientX, e.clientY, rect)) {
      const tabletSession = tabletEntrySessionRef.current;
      if (tabletSession && e.pointerId === tabletSession.pointerId) {
        const cancelled = cancelTabletEntrySession(tabletSession);
        tabletEntrySessionRef.current = null;
        setTabletEntryVisual({
          phase: cancelled.phase,
          pointerType: cancelled.pointerType,
          point: cancelled.latestPoint,
        });
        visibleGhostPointerLockRef.current = null;
        lastGhostStaffIndexRef.current = null;
      }
      if (ghostNoteTarget) setGhostNoteTarget(null);
      return;
    }
    lastAdvancedGhostAnchorRef.current = null;

    let domPoint = {
      x: e.clientX - rect.left,
      y: e.clientY - rect.top,
    };
    if (activeTabletSession && e.pointerId === activeTabletSession.pointerId) {
      const coalesced = typeof e.nativeEvent.getCoalescedEvents === 'function'
        ? e.nativeEvent.getCoalescedEvents()
        : [];
      const latestSample = coalesced[coalesced.length - 1] ?? e.nativeEvent;
      const rawPoint = {
        x: latestSample.clientX - rect.left,
        y: latestSample.clientY - rect.top,
      };
      const staffDetails = staffDetailsByMeasureRef.current.get(
        activeTabletSession.lastValidatedPreview.measureNumber,
      ) ?? [];
      const candidateDetail = findNearestStaffDetail(
        staffDetails,
        null,
        rawPoint.y,
        activeTabletSession.lastValidatedPreview.corePartId,
      );
      const candidateStaff = candidateDetail
        ? buildTabletStaffGeometry(candidateDetail, {
            corePartId: activeTabletSession.lastValidatedPreview.corePartId,
            systemIndex: activeTabletSession.lastValidatedPreview.systemIndex,
          })
        : null;
      const refinedSession = refineTabletEntrySession(activeTabletSession, {
        point: rawPoint,
        slotSpacingPx: estimateTabletSlotSpacing(
          renderedGhostGridRef.current,
          activeTabletSession.lastValidatedPreview,
        ),
        candidateStaff,
      });
      tabletEntrySessionRef.current = refinedSession;
      domPoint = refinedSession.effectivePoint;
    }
    const pointerInputVoice = resolveStoredInputVoiceAtPoint(measureLayoutOverlaysRef.current, domPoint, coreDocument, selectedVoice);
    const pointerPath = typeof e.nativeEvent.composedPath === 'function' ? e.nativeEvent.composedPath() : [];
    const pointerPathNodes = pointerPath.filter((entry): entry is Node => entry instanceof Node);
    const directlyHoveredRendered = findDirectRenderedNoteHit(renderedNotesRef.current, pointerPathNodes)
      ?? findRenderedNoteheadAtPoint(renderedNotesRef.current, domPoint);
    const crossVoiceDirectNotehead = Boolean(
      directlyHoveredRendered?.note
      && !directlyHoveredRendered.note.isRest
      && directlyHoveredRendered.note.voiceId !== pointerInputVoice,
    );
    const overlayAtPoint = findMeasureOverlayForPoint(measureLayoutOverlaysRef.current, domPoint);
    const resolvedGhost = retargetGhostToDirectCrossVoiceNotehead(
      resolveGhostNoteTarget(
        geometryProxyRef.current,
        renderedGhostGridRef.current,
        ghostNoteIndexRef.current,
        overlayAtPoint,
        measureLayoutOverlaysRef.current,
        systemLayoutOverlaysRef.current,
        coreDocument,
        graceEventIds,
        domPoint,
        rect,
        selectedNote,
        selectedDuration,
        selectedAccidental,
        isDotted,
        pointerInputVoice,
        lastGhostStaffIndexRef.current,
        ghostStaffHysteresisPx(zoomPercent, false),
        staffDetailsByMeasureRef.current,
        { allowLeadingProtectedArea: crossVoiceDirectNotehead },
      ),
      crossVoiceDirectNotehead ? directlyHoveredRendered?.note : null,
      pointerInputVoice,
    );
    const nextGhostCandidate = shouldStickToAdvancedAnchor({
      anchor: selectedNote,
      overlay: overlayAtPoint,
      pointerClient: { x: e.clientX, y: e.clientY },
      lastPlacementClient: lastPlacementClientRef.current,
    }) && selectedNote?.coreMeasureId === lastPlacementMeasureIdRef.current
      ? retargetGhostToAdvancedAnchor({
          resolvedGhost,
          renderedGhostGrid: renderedGhostGridRef.current,
          pointerGhostAnchor: selectedNote,
          pointerX: domPoint.x,
          maxDistancePx: 256,
        })
      : resolvedGhost;
    const nextGhostResolved = discardGhostTargetOffRenderedSnap(
      alignReplaceGhostToRenderedSnap(
        bindResolvedEditTargetToGhost(
          applyEntryModeToGhostTarget(
            applyPointerModifiersToGhostTarget(nextGhostCandidate, e),
            entryMode,
            chordInputMode,
            pointerInputVoice,
            selectedNote,
            noteInputAnchor,
            lastNoteInputCommitTargetRef.current,
          ),
          interactiveEditMapRef.current,
          coreDocument,
          selectedDuration,
          isDotted,
        ),
        renderedGhostGridRef.current,
      ),
      renderedGhostGridRef.current,
    );
    const pointerInLeadingProtectionZone = !crossVoiceDirectNotehead && nextGhostResolved?.pointerX != null
      && (
        // Forward-snapped ghosts only mark the leading area when they snap to
        // the measure's FIRST anchor (pointer in the leading whitespace).
        // Mid-measure forward snaps are legitimate targets — rejecting them
        // turned every span left of a notehead into a hover dead zone on
        // staves whose first note sits deep in the measure.
        (
          nextGhostResolved.timestampNum === 0
          && nextGhostResolved.placementAnchorIsRest !== true
          && nextGhostResolved.semanticAnchorIsRest !== true
          && nextGhostResolved.domCenter.x - nextGhostResolved.pointerX > 1
        )
        || firstSlotGhostPulledBehindPointer(nextGhostResolved)
        // Hover and pointerdown must agree here. A blank measure resolves its
        // full-measure rest as `replace`; exempting that mode displayed a ghost
        // inside the leading buffer which the subsequent click always rejected.
        || pointerInLeadingFirstSlotBuffer(nextGhostResolved, overlayAtPoint, domPoint.x, measureLayoutOverlaysRef.current)
      );
    const pointerInBarlineGuard = pointerInMeasureBarlineGuard(overlayAtPoint, domPoint.x);
    const ghostInBarlineGuard = ghostTargetOverlapsBarlineGuard(nextGhostResolved, measureLayoutOverlaysRef.current);
    const ghostInLeadingTimeSignatureGuard = ghostTargetOverlapsLeadingTimeSignatureGuard(nextGhostResolved, measureLayoutOverlaysRef.current);
    const visibleGhostInLeadingProtectionZone = !crossVoiceDirectNotehead
      && isGhostTargetInLeadingProtectedArea(
        nextGhostResolved,
        ghostNoteIndexRef.current,
        measureLayoutOverlaysRef.current,
        rect,
      );
    const ghostRejectedByGuards = pointerInLeadingProtectionZone
      || pointerInBarlineGuard
      || ghostInBarlineGuard
      || ghostInLeadingTimeSignatureGuard
      || visibleGhostInLeadingProtectionZone;
    const needsRestFallback = ghostRejectedByGuards || !nextGhostResolved;
    const restFallbackOverlay = overlayAtPoint
      ?? findNearestMeasureOverlayForPoint(measureLayoutOverlaysRef.current, domPoint);
    const guardedRestFallback = needsRestFallback
      ? resolveRestOnlyGhostTarget(
          null,
          restFallbackOverlay,
          renderedGhostGridRef.current,
          coreDocument,
          domPoint,
          selectedDuration,
          selectedAccidental,
          isDotted,
          pointerInputVoice,
          staffDetailsByMeasureRef.current,
        )
      : null;
    const restFallbackInLeadingFirstSlotBuffer = pointerInLeadingFirstSlotBuffer(
      guardedRestFallback,
      restFallbackOverlay,
      domPoint.x,
      measureLayoutOverlaysRef.current,
    );
    const nextGhost = suppressGhostOnTabStaff(
      coreDocument,
      ghostRejectedByGuards
        ? (restFallbackInLeadingFirstSlotBuffer ? null : guardedRestFallback)
        : (nextGhostResolved ?? guardedRestFallback),
    );
    visibleGhostPointerLockRef.current = nextGhost;
    lastGhostStaffIndexRef.current = nextGhost?.staffIndex ?? lastGhostStaffIndexRef.current;
    const liveTabletSession = tabletEntrySessionRef.current;
    if (
      liveTabletSession
      && liveTabletSession.pointerId === e.pointerId
      && nextGhost?.resolvedTarget
    ) {
      const yResolution = nextGhost.snapResolution?.yResolution;
      if (yResolution) {
        yResolution.rawY = liveTabletSession.latestPoint.y;
        yResolution.stableStaffStep = liveTabletSession.stableStaffStep;
        yResolution.hysteresisHeld = Math.round(
          (liveTabletSession.latestPoint.y - liveTabletSession.stableStaff.topLineY)
          / Math.max(liveTabletSession.stableStaff.lineDistancePx / 2, Number.EPSILON),
        ) !== liveTabletSession.stableStaffStep;
      }
      let boundSession = bindTabletEntryPreview(
        liveTabletSession,
        nextGhost,
        nextGhost.resolvedTarget,
      );
      if (boundSession.staffSwitchPulse > lastTabletStaffSwitchPulseRef.current) {
        nextGhost.dragPulse = true;
        lastTabletStaffSwitchPulseRef.current = boundSession.staffSwitchPulse;
      }
      const soundingPitchKey = `${nextGhost.step}:${nextGhost.alter}:${nextGhost.octave}`;
      const previewNow = performance.now();
      if (
        onDirectEntryPitchPreview
        && shouldAuditionTabletPitch(boundSession, soundingPitchKey, previewNow)
      ) {
        onDirectEntryPitchPreview({
          coreMeasureId: nextGhost.measureId,
          corePartId: nextGhost.corePartId,
          measureNumber: nextGhost.measureNumber,
          staffIndex: nextGhost.staffIndex,
          voiceId: nextGhost.voiceId,
          timestampNum: nextGhost.timestampNum,
          timestampDen: nextGhost.timestampDen,
          step: nextGhost.step,
          octave: nextGhost.octave,
          alter: nextGhost.alter,
          isRest: false,
          durationType: INPUT_DURATION_TO_TYPE[String(selectedDuration)] ?? String(selectedDuration),
          isDotted,
          graphicalNote: null,
        });
        boundSession = markTabletPitchAuditioned(
          boundSession,
          soundingPitchKey,
          previewNow,
        );
      }
      tabletEntrySessionRef.current = boundSession;
      if (!ghostTargetsEqual(
        liveTabletSession.lastValidatedPreview,
        boundSession.lastValidatedPreview,
      )) {
        pointerRefinementMetricsRef.current.stableVisualPublications += 1;
      }
      setTabletEntryVisual({
        phase: boundSession.phase,
        pointerType: boundSession.pointerType,
        point: boundSession.latestPoint,
      });
      setGhostNoteTarget((current) => (
        ghostTargetsEqual(current, boundSession.lastValidatedPreview)
          ? current
          : boundSession.lastValidatedPreview
      ));
      return;
    }
    if (liveTabletSession && liveTabletSession.pointerId === e.pointerId) {
      // An invalid refinement sample holds the last stable semantic preview.
      setGhostNoteTarget(liveTabletSession.lastValidatedPreview);
      setTabletEntryVisual({
        phase: liveTabletSession.phase,
        pointerType: liveTabletSession.pointerType,
        point: liveTabletSession.latestPoint,
      });
      return;
    }
    if (e.pointerType === 'pen' && e.buttons === 0 && nextGhost) {
      setTabletEntryVisual({
        phase: 'hovering',
        pointerType: 'pen',
        point: domPoint,
      });
    } else if (e.pointerType !== 'pen') {
      setTabletEntryVisual((current) => (
        current.phase === 'idle' ? current : { phase: 'idle', pointerType: null, point: null }
      ));
    }
    setGhostNoteTarget((current) => {
      if (ghostTargetsEqual(current, nextGhost)) return current;
      return nextGhost;
    });
  }, [pencilOnlyInput, chordInputMode, coreDocument, dragTransposeMode, entryMode, ghostNoteTarget, graceEventIds, inputByDurationMode, isDotted, noteInputAnchor, noteInputMode, onDirectEntryPitchPreview, onDragPitchPreview, selectedAccidental, selectedDuration, selectedNote, selectedVoice, zoomPercent]);

  const discardPendingTabletPointerMove = useCallback(() => {
    if (tabletPointerMoveFrameRef.current != null) {
      window.cancelAnimationFrame(tabletPointerMoveFrameRef.current);
      tabletPointerMoveFrameRef.current = null;
    }
    pendingTabletPointerMoveRef.current = null;
    pendingTabletPointerMoveTimeRef.current = null;
  }, []);

  const flushPendingTabletPointerMove = useCallback(() => {
    if (tabletPointerMoveFrameRef.current != null) {
      window.cancelAnimationFrame(tabletPointerMoveFrameRef.current);
      tabletPointerMoveFrameRef.current = null;
    }
    const pending = pendingTabletPointerMoveRef.current;
    pendingTabletPointerMoveRef.current = null;
    pendingTabletPointerMoveTimeRef.current = null;
    if (pending) processPointerMove(pending);
  }, [processPointerMove]);

  const handlePointerMove = useCallback((e: React.PointerEvent<HTMLDivElement>) => {
    if (e.pointerType !== 'touch' && e.pointerType !== 'pen') {
      processPointerMove(e);
      return;
    }

    // React no longer pools synthetic events, but persist documents that this
    // latest coalesced tablet sample intentionally survives until the frame.
    e.persist();
    const metrics = pointerRefinementMetricsRef.current;
    metrics.rawTabletPointerEvents += 1;
    pendingTabletPointerMoveRef.current = e;
    pendingTabletPointerMoveTimeRef.current = performance.now();
    if (tabletPointerMoveFrameRef.current != null) return;
    metrics.scheduledAnimationFrames += 1;
    tabletPointerMoveFrameRef.current = window.requestAnimationFrame(() => {
      tabletPointerMoveFrameRef.current = null;
      const pending = pendingTabletPointerMoveRef.current;
      const queuedAt = pendingTabletPointerMoveTimeRef.current;
      pendingTabletPointerMoveRef.current = null;
      pendingTabletPointerMoveTimeRef.current = null;
      if (pending) {
        const processedAt = performance.now();
        const latencyMs = queuedAt == null ? 0 : Math.max(0, processedAt - queuedAt);
        metrics.processedLatestSamples += 1;
        metrics.lastSampleLatencyMs = latencyMs;
        metrics.maxSampleLatencyMs = Math.max(metrics.maxSampleLatencyMs, latencyMs);
        processPointerMove(pending);
      }
    });
  }, [processPointerMove]);

  // Pointer handler — convert DOM click to OSMD note
  const handlePointerDown = useCallback((e: PointerEvent) => {
    if (pencilOnlyInput && e.pointerType === 'touch') return;
    const osmd = osmdRef.current;
    const container = containerRef.current;
    if (!osmd?.GraphicSheet || !container) {
      dbg.score('click ignored — OSMD not ready yet');
      return;
    }

    const rect = container.getBoundingClientRect();
    const path = typeof e.composedPath === 'function' ? e.composedPath() : [];
    const target = e.target as Node | null;
    const targetElement = target instanceof Element ? target : null;
    const landedInsideContainer = isPointInsideRect(e.clientX, e.clientY, rect);
    const pathIncludesContainer = path.includes(container);
    const targetInsideContainer = !!target && container.contains(target);
    const interactiveOverlayTarget = targetElement?.closest(
      'button, a, input, select, textarea, [role="button"], [role="menuitem"], [role="dialog"], [contenteditable="true"]',
    );
    const eventPathNodes = path.filter((entry): entry is Node => entry instanceof Node);
    dbg.score(
      `pointerdown target=${target instanceof Element ? target.tagName.toLowerCase() : target?.nodeName ?? 'unknown'} `
      + `insideRect=${String(landedInsideContainer)} pathIncludesContainer=${String(pathIncludesContainer)} `
      + `targetInside=${String(targetInsideContainer)}`,
    );
    // Non-interactive score overlays can be siblings of the OSMD container, so
    // geometry inside the score remains valid there. Controls and dialogs that
    // happen to sit above the same rectangle must never become score clicks.
    if (
      (!landedInsideContainer && !pathIncludesContainer && !targetInsideContainer)
      || (interactiveOverlayTarget && !container.contains(interactiveOverlayTarget))
    ) {
      dbg.score('pointerdown ignored — outside score container');
      return;
    }
    if (noteInputMode && (e.button !== 0 || (e.pointerType === 'mouse' && e.ctrlKey))) {
      dbg.score(
        `pointerdown ignored — note input requires an unmodified primary button `
        + `(button=${e.button} ctrl=${String(e.ctrlKey)})`,
      );
      return;
    }
    viewportRef.current?.focus({ preventScroll: true });

    const startDirectNoteDrag = (directNote: SelectedNote) => {
      const rendered = findRenderedSelectionTarget(directNote, renderedNotesRef.current, coreDocument);
      const startPoint = rendered ? getRenderedPitchCenter(rendered, rect) : {
        x: e.clientX - rect.left,
        y: e.clientY - rect.top,
      };
      const startContext = geometryProxyRef.current.getDetailedContext(startPoint, {
        preferredStaffIndex: directNote.staffIndex,
        hysteresisPx: ghostStaffHysteresisPx(zoomPercent, true) * 2.5,
      });
      const tabDrag = Boolean(directNote.guitar) && isTabStaffSelectedNote(coreDocument, directNote);
      const pointerDownDomPoint = {
        x: e.clientX - rect.left,
        y: e.clientY - rect.top,
      };
      dragSessionRef.current = startContext?.staffStep != null || tabDrag ? {
        pointerId: e.pointerId,
        note: directNote,
        startStaffStep: startContext?.staffStep ?? 0,
        startDomPoint: startPoint,
        pointerDownDomPoint,
        currentStaffIndex: directNote.staffIndex,
        lastSemitoneDelta: 0,
        lastPreviewStaffIndex: directNote.staffIndex,
        lastResolvedPitch: null,
        tabDrag,
        lastResolvedGuitar: null,
        dragStarted: false,
        pulseToken: 0,
      } : null;
      if (dragSessionRef.current) {
        try {
          viewportRef.current?.setPointerCapture(e.pointerId);
        } catch {
          // Pointer capture is best-effort; the window pointer-up fallback still
          // finalizes the drag in browsers that reject capture here.
        }
      }
    };

    const domPoint = {
      x: e.clientX - rect.left,
      y: e.clientY - rect.top,
    };
    const pointerInputVoice = resolveStoredInputVoiceAtPoint(measureLayoutOverlaysRef.current, domPoint, coreDocument, selectedVoice);
    const clickedVisualTargets = collectClickedVisualTargets(eventPathNodes);
    const visualText = extractVisualText(clickedVisualTargets);
    const measureOverlayAtPointer = findMeasureOverlayForPoint(measureLayoutOverlaysRef.current, domPoint);
    const harmonyEditTarget = onSetChordSymbol ? resolveHarmonyEditTarget({
      coreDocument,
      container,
      measureOverlay: measureOverlayAtPointer,
      measureOverlays: measureLayoutOverlaysRef.current,
      clickedVisualTargets,
      visualText,
      domPoint,
    }) : null;
    if (harmonyEditTarget) {
      e.preventDefault();
      activeVisualTargetsRef.current.forEach((element) => tintSvgElement(element, null));
      activeVisualTargetsRef.current = [];
      setActiveVisualTargets([]);
      applyMeasureSelection([], null);
      setVisualSelectionOnly(false);
      onNoteClick(harmonyEditTarget.note, {
        visualText,
        visualMeasureNumber: harmonyEditTarget.note.measureNumber,
        visualStaffIndex: harmonyEditTarget.note.staffIndex,
      });
      const containerWidth = container.getBoundingClientRect().width;
      const left = containerWidth > 0
        ? clamp(harmonyEditTarget.rect.x - 2, 4, Math.max(4, containerWidth - 118))
        : Math.max(4, harmonyEditTarget.rect.x - 2);
      const top = Math.max(4, harmonyEditTarget.rect.y - 6);
      setInlineChordEditor({
        left,
        top,
        value: harmonyEditTarget.value,
        targetKey: selectedNoteKeyFor(harmonyEditTarget.note) ?? 'harmony',
        targetNote: harmonyEditTarget.note,
      });
      return;
    }
    const renderedGlyphHit = resolveRenderedGlyphHit({
      renderedNotes: renderedNotesRef.current,
      container,
      eventPathNodes,
      domPoint,
      selectedVoice: pointerInputVoice,
      selectedPartId: selectedNote?.corePartId ?? null,
      hitTolerancePx: e.pointerType === 'touch' ? 32 : 24,
    });
    const renderedGlyphReport = {
      ...renderedGlyphHit.report,
      visualText: visualText ?? null,
    };
    const winnerReason = renderedGlyphReport.winnerReason;
    const pathHitRendered = renderedGlyphHit.rendered && (
      winnerReason === 'direct-tint-path'
      || winnerReason === 'direct-rendered-path'
    )
      ? renderedGlyphHit.rendered
      : null;
    const directlyHitRendered = renderedGlyphHit.rendered && !renderedGlyphReport.fallback
      ? renderedGlyphHit.rendered
      : null;
    const guitarFretTextHit = resolveClickedGuitarFretTextTarget({
      coreDocument,
      container,
      measureOverlay: measureOverlayAtPointer,
      domPoint,
      visualText,
    });
    const guitarFretClickKey = guitarFretTextHit ? selectedNoteKeyFor(guitarFretTextHit) ?? 'guitar-fret' : null;
    const previousGuitarFretClick = lastGuitarFretClickRef.current;
    const elapsedSincePreviousGuitarFretClick = previousGuitarFretClick
      ? performance.now() - previousGuitarFretClick.time
      : Number.POSITIVE_INFINITY;
    const repeatedGuitarFretClick = Boolean(
      noteInputMode
      && guitarFretClickKey
      && previousGuitarFretClick
      && previousGuitarFretClick.key === guitarFretClickKey
      && elapsedSincePreviousGuitarFretClick <= 600
      && Math.abs(previousGuitarFretClick.x - domPoint.x) <= 16
      && Math.abs(previousGuitarFretClick.y - domPoint.y) <= 16,
    );
    if (noteInputMode && guitarFretClickKey) {
      lastGuitarFretClickRef.current = {
        key: guitarFretClickKey,
        x: domPoint.x,
        y: domPoint.y,
        time: performance.now(),
        eventTime: e.timeStamp,
      };
    }
    if (
      noteInputMode
      && guitarFretTextHit
      && onSetGuitarFret
      && e.button === 0
      && (e.detail >= 2 || repeatedGuitarFretClick)
      && !e.shiftKey
      && !(e.metaKey || e.ctrlKey)
    ) {
      e.preventDefault();
      activeVisualTargetsRef.current.forEach((element) => tintSvgElement(element, null));
      activeVisualTargetsRef.current = [];
      setActiveVisualTargets([]);
      applyMeasureSelection([], null);
      setVisualSelectionOnly(false);
      const confidenceReport = buildTextTargetSelectionConfidence(
        'note-input-guitar-fret-text',
        guitarFretTextHit,
        domPoint,
        visualText,
        'direct-tab-fret-text',
      );
      setSelectionConfidence(confidenceReport);
      publishNoteHitDebug('note-input-guitar-fret-text', guitarFretTextHit, domPoint, visualText, confidenceReport);
      onNoteClick(guitarFretTextHit, {
        visualOnly: false,
        visualText,
        visualMeasureNumber: guitarFretTextHit.measureNumber,
        visualStaffIndex: guitarFretTextHit.staffIndex,
      });
      const containerWidth = container.getBoundingClientRect().width;
      setInlineGuitarFretEditor({
        left: containerWidth > 0
          ? clamp(domPoint.x - 14, 4, Math.max(4, containerWidth - 64))
          : Math.max(4, domPoint.x - 14),
        top: Math.max(4, domPoint.y - 18),
        value: String(guitarFretTextHit.guitar?.fret ?? visualText ?? ''),
        targetKey: selectedNoteKeyFor(guitarFretTextHit) ?? 'guitar-fret',
        targetNote: guitarFretTextHit,
      });
      return;
    }
    const crossVoicePathHitRendered = !directlyHitRendered
      && pathHitRendered?.note
      && !pathHitRendered.note.isRest
      && pathHitRendered.note.voiceId !== pointerInputVoice
      ? pathHitRendered
      : null;
    const geometryHitRendered = directlyHitRendered
      ? null
      : renderedGlyphHit.rendered && (
          winnerReason === 'glyph-rect-hit'
          || winnerReason === 'rendered-bounding-box-hit'
        )
        ? renderedGlyphHit.rendered
        : null;
    const crossVoiceGeometryHitRendered = geometryHitRendered?.note
      && !geometryHitRendered.note.isRest
      && geometryHitRendered.note.voiceId !== pointerInputVoice
      ? geometryHitRendered
      : null;
    const clickedNoteheadPath = eventPathNodes.some((entry) => (
      entry instanceof Element
      && (entry.matches('.vf-notehead') || Boolean(entry.closest('.vf-notehead')))
    ));
    const visibleGhostElement = container.querySelector<HTMLElement>('[data-testid="ghost-note-preview"]');
    const clickedVisibleGhostElementPath = Boolean(
      visibleGhostElement
      && eventPathNodes.some((entry) => entry === visibleGhostElement || visibleGhostElement.contains(entry)),
    );
    const clickedGhostElementRect = visibleGhostElement?.getBoundingClientRect() ?? null;
    const lockedVisibleGhostTarget = visibleGhostPointerLockRef.current;
    const ghostHitRadius = e.pointerType === 'touch' ? 18 : 12;
    const clickedLockedVisibleGhost = lockedVisibleGhostTarget
      ? (
          Math.abs(domPoint.x - (lockedVisibleGhostTarget.previewLeft + lockedVisibleGhostTarget.noteheadCenterX)) <= ghostHitRadius
          && Math.abs(domPoint.y - (lockedVisibleGhostTarget.previewTop + 28)) <= ghostHitRadius
        ) || (
          domPoint.x >= lockedVisibleGhostTarget.domRect.x
          && domPoint.x <= lockedVisibleGhostTarget.domRect.x + lockedVisibleGhostTarget.domRect.width
          && domPoint.y >= lockedVisibleGhostTarget.domRect.y
          && domPoint.y <= lockedVisibleGhostTarget.domRect.y + lockedVisibleGhostTarget.domRect.height
        )
      : false;
    const clickedCurrentGhost = isPointInsideGhostNotehead(
      domPoint,
      ghostNoteTarget,
      overlayLayerOffset,
      ghostHitRadius,
      ghostHitRadius,
    ) || isClientPointInsideGhostNotehead(
      { x: e.clientX, y: e.clientY },
      visibleGhostElement,
      ghostHitRadius,
      ghostHitRadius,
    )
      || (clickedGhostElementRect ? isPointInsideRect(e.clientX, e.clientY, clickedGhostElementRect) : false)
      || clickedLockedVisibleGhost;
    const clickedDomGhostTarget = clickedCurrentGhost
      ? findRecentGhostTargetForElement(visibleGhostElement, recentGhostNoteTargetsRef.current)
      : null;
    const visibleElementGhostTarget = cloneGhostTargetFromElement(
      visibleGhostElement,
      findRecentGhostTargetForElement(visibleGhostElement, recentGhostNoteTargetsRef.current)
        ?? ghostNoteTarget
        ?? previousGhostNoteTargetRef.current,
      rect,
    );
    const clickedElementGhostTarget = clickedCurrentGhost ? visibleElementGhostTarget : null;
    const clickedVisibleGhostTargetAtPointer = clickedCurrentGhost
      ? clickedElementGhostTarget
        ?? clickedDomGhostTarget
        ?? (clickedLockedVisibleGhost ? lockedVisibleGhostTarget : null)
        ?? ghostNoteTarget
      : isPointInsideGhostNotehead(
          domPoint,
          previousGhostNoteTargetRef.current,
          overlayLayerOffset,
          ghostHitRadius,
          ghostHitRadius,
        )
        ? previousGhostNoteTargetRef.current
        : null;
    const clickedVisibleGhostAtPointer = Boolean(clickedVisibleGhostTargetAtPointer);
    const semanticNoteheadHit = !directlyHitRendered && clickedNoteheadPath && layoutBridgeRef.current
      ? (() => {
          const measureElement = findMeasureElementForPoint(container, eventPathNodes, e.clientX, e.clientY);
          const overlayAtPoint = measureOverlayAtPointer;
          const measureElements = Array.from(container.querySelectorAll<SVGGElement>('.vf-measure'));
          const measureIndex = measureElement ? measureElements.indexOf(measureElement) : -1;
          const bridgeMeasure = measureIndex >= 0 ? layoutBridgeRef.current?.measures[measureIndex] ?? null : null;
          const measureOverlay = overlayAtPoint
            ?? (bridgeMeasure
              ? measureLayoutOverlaysRef.current.find((overlay) => overlay.measureId === bridgeMeasure.measureId) ?? null
              : null);
          const measureBridge = measureOverlay
            ? layoutBridgeRef.current?.measures.find((entry) => entry.measureId === measureOverlay.measureId) ?? null
            : bridgeMeasure;
          if (!measureBridge || !coreDocument) return null;
          const noteheadRects = measureElement
            ? Array.from(measureElement.querySelectorAll<SVGGElement>('.vf-notehead')).map((notehead) => {
                const noteRect = notehead.getBoundingClientRect();
                return clientRectToContainer(container, noteRect);
              })
            : [];
          return bridgeResolveSemanticMeasureClickTarget(
            coreDocument,
            measureBridge.measureId,
            noteheadRects,
            domPoint,
            measureOverlay?.domRect ?? null,
          );
        })()
      : null;
    const proximityNote = !directlyHitRendered
      ? bridgeFindNearestRenderedNote(renderedNotesRef.current, domPoint)
      : null;
    const directNote = guitarFretTextHit
      ?? directlyHitRendered?.note
      ?? semanticNoteheadHit
      ?? crossVoicePathHitRendered?.note
      ?? crossVoiceGeometryHitRendered?.note
      ?? proximityNote;
    const directNoteheadHit = Boolean(
      guitarFretTextHit
      || directlyHitRendered
      || semanticNoteheadHit
      || crossVoicePathHitRendered
      || crossVoiceGeometryHitRendered
      || clickedNoteheadPath
    );
    const clickedExplicitVisibleGhostAtPointer = shouldTreatPointerAsExplicitVisibleGhost({
      ghostTarget: clickedVisibleGhostTargetAtPointer,
      renderedPathNote: directNoteheadHit ? directNote : pathHitRendered?.note,
      clickedVisibleGhost: Boolean(
        clickedVisibleGhostElementPath
        || clickedLockedVisibleGhost
        || clickedCurrentGhost
      ),
    });
    if (directNote) {
      const confidenceReport = guitarFretTextHit
        ? buildTextTargetSelectionConfidence('note-input-guitar-fret-text', guitarFretTextHit, domPoint, visualText, 'direct-tab-fret-text')
        : semanticNoteheadHit || !renderedGlyphHit.rendered
          ? null
          : renderedGlyphReport;
      if (confidenceReport) setSelectionConfidence(confidenceReport);
      publishNoteHitDebug(
        guitarFretTextHit ? 'note-input-guitar-fret-text'
          : directlyHitRendered ? 'note-input-direct-rendered-note'
            : semanticNoteheadHit ? 'note-input-semantic-notehead'
              : proximityNote ? 'note-input-proximity-rendered-note'
                : 'note-input-cross-voice-note',
        directNote,
        domPoint,
        visualText,
        confidenceReport,
      );
      dbg.score(`note-input direct candidate → part=${directNote.corePartId ?? 'partless'} entity=${directNote.coreEntityId ?? 'none'} m.${directNote.measureNumber} staff=${directNote.staffIndex} voice=${directNote.voiceId} ts=${directNote.timestampNum}/${directNote.timestampDen} pitch=${debugPitchLabel(directNote)}`);
    }

    const ghostCommitAtPointer = shouldCommitPointerGhostOverDirectNote({
      ghostTarget: clickedVisibleGhostTargetAtPointer
        ?? (e.altKey ? visibleElementGhostTarget : null)
        ?? ghostNoteTarget
        ?? lockedVisibleGhostTarget,
      directNote,
      directlyHitRendered: Boolean(directlyHitRendered),
      clickedNoteheadPath,
      directNoteheadHit,
      directNoteIsActiveSelection: Boolean(
        directNote
        && selectedNote
        && selectedNoteKeyFor(directNote) === selectedNoteKeyFor(selectedNote)
      ),
      pointerCloserToGhostNotehead: (() => {
        const visibleGhost = clickedVisibleGhostTargetAtPointer;
        if (e.pointerType !== 'mouse' || !clickedExplicitVisibleGhostAtPointer || !visibleGhost || !directNote?.coreEntityId) return false;
        const rendered = renderedNotesRef.current.find(entry => entry.coreEntityId === directNote.coreEntityId);
        if (!rendered) return false;
        const ghostX = visibleGhost.previewLeft + visibleGhost.noteheadCenterX;
        const ghostY = visibleGhost.previewTop + 28;
        return Math.hypot(domPoint.x - ghostX, domPoint.y - ghostY) + 1
          < Math.hypot(domPoint.x - rendered.domCenter.x, domPoint.y - rendered.domCenter.y);
      })(),
      clickedVisibleGhostAtPointer: clickedExplicitVisibleGhostAtPointer,
      chordInputIntent: chordInputMode,
      altKey: e.altKey,
    });
    const rawForcedGhostCommitTarget = ghostCommitAtPointer
      ? clickedVisibleGhostTargetAtPointer
        ?? (e.altKey ? visibleElementGhostTarget : null)
        ?? ghostNoteTarget
        ?? lockedVisibleGhostTarget
      : null;
    const forcedGhostCommitTarget = e.altKey && rawForcedGhostCommitTarget
      ? {
          ...rawForcedGhostCommitTarget,
          voiceId: pointerInputVoice,
          placementMode: directNote && !directNote.isRest && directNote.voiceId !== pointerInputVoice
            ? 'insert'
            : rawForcedGhostCommitTarget.placementMode,
          resolvedTarget: rawForcedGhostCommitTarget.resolvedTarget
            ? {
                ...rawForcedGhostCommitTarget.resolvedTarget,
                voiceId: pointerInputVoice,
                mode: directNote && !directNote.isRest && directNote.voiceId !== pointerInputVoice
                  ? 'insert'
                  : rawForcedGhostCommitTarget.resolvedTarget.mode,
                allowOccupiedInsert: directNote && !directNote.isRest && directNote.voiceId !== pointerInputVoice
                  ? true
                  : rawForcedGhostCommitTarget.resolvedTarget.allowOccupiedInsert,
                diagnostics: [
                  ...rawForcedGhostCommitTarget.resolvedTarget.diagnostics,
                  'modifier-selected-voice-locked',
                ],
              }
            : rawForcedGhostCommitTarget.resolvedTarget,
        }
      : rawForcedGhostCommitTarget;
    if (
      noteInputMode
      && directNote
      && !directNote.isRest
      && !ghostCommitAtPointer
      && !chordInputMode
      && (directNote.voiceId === pointerInputVoice || directNoteheadHit)
    ) {
      if (!inputByDurationMode && e.button === 0 && !e.shiftKey && !(e.metaKey || e.ctrlKey)) {
        startDirectNoteDrag(directNote);
      }
      e.preventDefault();
      activeVisualTargetsRef.current.forEach((element) => tintSvgElement(element, null));
      activeVisualTargetsRef.current = [];
      setActiveVisualTargets([]);
      if (!e.shiftKey && !(e.metaKey || e.ctrlKey)) {
        applyMeasureSelection([], null);
      }
      setVisualSelectionOnly(false);
      const plainNoteClick = !e.shiftKey && !(e.metaKey || e.ctrlKey);
      onNoteClick(directNote, {
        range: e.shiftKey,
        additive: !e.shiftKey && (e.metaKey || e.ctrlKey),
        singleSelectionOnly: plainNoteClick || undefined,
        visualOnly: false,
        visualText,
        visualMeasureNumber: directNote.measureNumber,
        visualStaffIndex: directNote.staffIndex,
      });
      lastAdvancedGhostAnchorRef.current = null;
      lastNoteInputCommitTargetRef.current = null;
      lastPointerClientRef.current = null;
      setGhostNoteTarget(null);
      return;
    }

    if (noteInputMode && !inputByDurationMode) {
      lastAdvancedGhostAnchorRef.current = null;
      const overlayAtPoint = findMeasureOverlayForPoint(measureLayoutOverlaysRef.current, domPoint);
      const pointerGhostAnchor = selectedNote?.isRest
        ? resolvePointerGhostAnchor(selectedNote, overlayAtPoint)
        : null;
      const directCrossVoiceNotehead = Boolean(
        directNote
        && !directNote.isRest
        && directNote.voiceId !== pointerInputVoice
        && (directlyHitRendered || crossVoicePathHitRendered || crossVoiceGeometryHitRendered || clickedNoteheadPath)
      );
      const resolvedGhostCandidate = retargetGhostToDirectCrossVoiceNotehead(
        resolveGhostNoteTarget(
          geometryProxyRef.current,
          renderedGhostGridRef.current,
          ghostNoteIndexRef.current,
          overlayAtPoint,
          measureLayoutOverlaysRef.current,
          systemLayoutOverlaysRef.current,
          coreDocument,
          graceEventIds,
          domPoint,
          rect,
          selectedNote,
          selectedDuration,
          selectedAccidental,
          isDotted,
          pointerInputVoice,
          lastGhostStaffIndexRef.current,
          ghostStaffHysteresisPx(zoomPercent, false),
          staffDetailsByMeasureRef.current,
          { allowLeadingProtectedArea: directCrossVoiceNotehead },
        ),
        directCrossVoiceNotehead ? directNote : null,
        pointerInputVoice,
      );
      const clickedRestGhostCandidate = directNote?.isRest
        ? resolveClickedRestAnchorGhostTarget(
            directNote,
            overlayAtPoint,
            renderedGhostGridRef.current,
            coreDocument,
            domPoint,
            selectedDuration,
            selectedAccidental,
            pointerInputVoice,
            staffDetailsByMeasureRef.current,
          )
        : null;
      const bindCommitGhostCandidate = (candidate: GhostNoteTarget | null) => bindResolvedEditTargetToGhost(
        applyEntryModeToGhostTarget(
          applyPointerModifiersToGhostTarget(candidate, e),
          entryMode,
          chordInputMode,
          pointerInputVoice,
          selectedNote,
          noteInputAnchor,
          lastNoteInputCommitTargetRef.current,
        ),
        interactiveEditMapRef.current,
        coreDocument,
        selectedDuration,
        isDotted,
      );
      const primaryResolvedGhostTarget = bindCommitGhostCandidate(resolvedGhostCandidate);
      const clickedRestResolvedGhostTarget = clickedRestGhostCandidate
        ? bindCommitGhostCandidate(clickedRestGhostCandidate)
        : null;
      const {
        resolvedGhostTarget,
        commitGhostCandidate,
      } = resolvePointerCommitGhostTargets(
        primaryResolvedGhostTarget,
        clickedRestResolvedGhostTarget,
        resolvedGhostCandidate,
        clickedRestGhostCandidate,
      );
      const blockedByLeadingProtectedArea = isGhostTargetInLeadingProtectedArea(
        resolvedGhostTarget,
        ghostNoteIndexRef.current,
        measureLayoutOverlaysRef.current,
        rect,
      );
      const blockedByFirstSlotPull = firstSlotGhostPulledBehindPointer(resolvedGhostTarget);
      const blockedByLeadingFirstSlotBuffer = pointerInLeadingFirstSlotBuffer(
        resolvedGhostTarget,
        overlayAtPoint,
        domPoint.x,
        measureLayoutOverlaysRef.current,
      );
      const blockedByPointerBarlineGuard = pointerInMeasureBarlineGuard(overlayAtPoint, domPoint.x);
      const blockedByGhostBarlineGuard = ghostTargetOverlapsBarlineGuard(resolvedGhostTarget, measureLayoutOverlaysRef.current);
      const blockedByLeadingTimeSignatureGuard = ghostTargetOverlapsLeadingTimeSignatureGuard(resolvedGhostTarget, measureLayoutOverlaysRef.current);
      const inputBlockers = [
        !directCrossVoiceNotehead && blockedByLeadingProtectedArea ? 'leading-protected-area' : null,
        !directCrossVoiceNotehead && blockedByFirstSlotPull ? 'first-slot-pulled-behind-pointer' : null,
        !directCrossVoiceNotehead && blockedByLeadingFirstSlotBuffer ? 'leading-first-slot-buffer' : null,
        blockedByPointerBarlineGuard ? 'pointer-barline-guard' : null,
        blockedByGhostBarlineGuard ? 'ghost-barline-guard' : null,
        !directCrossVoiceNotehead && blockedByLeadingTimeSignatureGuard ? 'leading-time-signature-guard' : null,
      ].filter((entry): entry is string => Boolean(entry));
      const protectedResolvedGhostTarget = inputBlockers.length > 0 ? null : resolvedGhostTarget;
      const clickedVisibleGhost = clickedExplicitVisibleGhostAtPointer
        || (e.altKey && clickedVisibleGhostAtPointer)
        || Boolean(forcedGhostCommitTarget);
      const liveGhostTarget = resolveNoteInputCommitTarget(
        clickedVisibleGhost ? (forcedGhostCommitTarget ?? clickedVisibleGhostTargetAtPointer) : null,
        clickedLockedVisibleGhost && !forcedGhostCommitTarget ? null : protectedResolvedGhostTarget,
      );
      const selectedText = selectedNote
        ? `${selectedNote.measureNumber}:${selectedNote.staffIndex}:${selectedNote.voiceId}@${selectedNote.timestampNum}/${selectedNote.timestampDen}`
        : null;
      const buildManualPointerPayload = () => {
        const svgElement = container.querySelector('svg');
        const svgRect = svgElement instanceof SVGSVGElement ? svgElement.getBoundingClientRect() : null;
        const svgCtm = svgElement instanceof SVGSVGElement ? svgElement.getScreenCTM() : null;
        const svgPoint = eventToSvgPoint(container, osmd, e);
        const overlayRelative = overlayAtPoint ? {
          x: Number((domPoint.x - overlayAtPoint.domRect.x).toFixed(2)),
          y: Number((domPoint.y - overlayAtPoint.domRect.y).toFixed(2)),
          xRatio: Number(((domPoint.x - overlayAtPoint.domRect.x) / Math.max(overlayAtPoint.domRect.width, 1)).toFixed(4)),
          yRatio: Number(((domPoint.y - overlayAtPoint.domRect.y) / Math.max(overlayAtPoint.domRect.height, 1)).toFixed(4)),
        } : null;
        const overlayNeighbors = overlayAtPoint
          ? measureLayoutOverlaysRef.current
              .filter((overlay) => (
                overlay.pageIndex === overlayAtPoint.pageIndex
                && overlay.systemIndex === overlayAtPoint.systemIndex
                && Math.abs(overlay.measureNumber - overlayAtPoint.measureNumber) <= 2
              ))
              .sort((left, right) => left.measureNumber - right.measureNumber || left.domRect.x - right.domRect.x)
              .map((overlay) => ({
                measureId: overlay.measureId,
                measureNumber: overlay.measureNumber,
                systemIndex: overlay.systemIndex,
                pageIndex: overlay.pageIndex,
                x: Number(overlay.domRect.x.toFixed(2)),
                right: Number((overlay.domRect.x + overlay.domRect.width).toFixed(2)),
                y: Number(overlay.domRect.y.toFixed(2)),
                bottom: Number((overlay.domRect.y + overlay.domRect.height).toFixed(2)),
                width: Number(overlay.domRect.width.toFixed(2)),
                height: Number(overlay.domRect.height.toFixed(2)),
              }))
          : [];
        return {
          event: {
            type: e.type,
            pointerType: e.pointerType,
            pointerId: e.pointerId,
            button: e.button,
            buttons: e.buttons,
            clientX: Number(e.clientX.toFixed(2)),
            clientY: Number(e.clientY.toFixed(2)),
            pageX: Number(e.pageX.toFixed(2)),
            pageY: Number(e.pageY.toFixed(2)),
            screenX: Number(e.screenX.toFixed(2)),
            screenY: Number(e.screenY.toFixed(2)),
            offsetX: Number(e.offsetX.toFixed(2)),
            offsetY: Number(e.offsetY.toFixed(2)),
            devicePixelRatio: window.devicePixelRatio,
            scroll: { x: window.scrollX, y: window.scrollY },
            visualViewport: window.visualViewport ? {
              width: Number(window.visualViewport.width.toFixed(2)),
              height: Number(window.visualViewport.height.toFixed(2)),
              offsetLeft: Number(window.visualViewport.offsetLeft.toFixed(2)),
              offsetTop: Number(window.visualViewport.offsetTop.toFixed(2)),
              scale: window.visualViewport.scale,
            } : null,
          },
          geometry: {
            zoomPercent,
            selectedDuration,
            isDotted,
            pointerInputVoice,
            entryMode,
            chordInputMode,
            containerRect: rectDebug(rect),
            svgRect: rectDebug(svgRect),
            svgCtm: svgCtm ? {
              a: Number(svgCtm.a.toFixed(6)),
              b: Number(svgCtm.b.toFixed(6)),
              c: Number(svgCtm.c.toFixed(6)),
              d: Number(svgCtm.d.toFixed(6)),
              e: Number(svgCtm.e.toFixed(2)),
              f: Number(svgCtm.f.toFixed(2)),
            } : null,
            domPoint: { x: Number(domPoint.x.toFixed(2)), y: Number(domPoint.y.toFixed(2)) },
            svgPoint: { x: Number(svgPoint.x.toFixed(2)), y: Number(svgPoint.y.toFixed(2)) },
            overlay: overlayAtPoint ? {
              measureId: overlayAtPoint.measureId,
              measureNumber: overlayAtPoint.measureNumber,
              systemIndex: overlayAtPoint.systemIndex,
              pageIndex: overlayAtPoint.pageIndex,
              domRect: rectDebug(overlayAtPoint.domRect),
              relative: overlayRelative,
            } : null,
            overlayNeighbors,
            overlayCount: measureLayoutOverlaysRef.current.length,
          },
          ghost: {
            visibleGhost: pointerTargetDebug(ghostNoteTarget),
            resolvedCandidate: pointerTargetDebug(resolvedGhostCandidate),
            commitCandidate: pointerTargetDebug(commitGhostCandidate),
            resolvedTarget: pointerTargetDebug(resolvedGhostTarget),
            blockers: inputBlockers,
            clickedVisibleGhost,
            liveGhost: pointerTargetDebug(liveGhostTarget),
            selected: selectedText,
            anchor: pointerGhostAnchor ? {
              measureNumber: pointerGhostAnchor.measureNumber,
              staffIndex: pointerGhostAnchor.staffIndex,
              voiceId: pointerGhostAnchor.voiceId,
              timestamp: `${pointerGhostAnchor.timestampNum}/${pointerGhostAnchor.timestampDen}`,
              isRest: pointerGhostAnchor.isRest,
            } : null,
            finalResolvedTarget: liveGhostTarget?.resolvedTarget ?? null,
          },
        };
      };
      if (visualDebugEnabled) {
        const manualPointerPayload = buildManualPointerPayload();
        console.log('[nex-note manual-pointer-json]', JSON.stringify(manualPointerPayload));
        console.groupCollapsed(
          '[nex-note manual-pointer]',
          `client=(${e.clientX.toFixed(2)},${e.clientY.toFixed(2)})`,
          `dom=(${domPoint.x.toFixed(2)},${domPoint.y.toFixed(2)})`,
          `live=${liveGhostTarget ? `m${liveGhostTarget.measureNumber}@${liveGhostTarget.timestampNum}/${liveGhostTarget.timestampDen}:${liveGhostTarget.step}${liveGhostTarget.octave}` : 'null'}`,
        );
        console.log('event', manualPointerPayload.event);
        console.log('geometry', manualPointerPayload.geometry);
        console.log('ghost-resolution', manualPointerPayload.ghost);
        console.groupEnd();
      }
      if (ghostNoteTarget && resolvedGhostTarget && !ghostTargetsEqual(ghostNoteTarget, resolvedGhostTarget)) {
        dbg.score(
          `pointerdown noteInput updating stale ghost `
          + `visible=${ghostNoteTarget.measureId}#${ghostNoteTarget.measureNumber}@${ghostNoteTarget.timestampNum}/${ghostNoteTarget.timestampDen} `
          + `resolved=${resolvedGhostTarget.measureId}#${resolvedGhostTarget.measureNumber}@${resolvedGhostTarget.timestampNum}/${resolvedGhostTarget.timestampDen}`,
        );
      }
      dbg.score(
        `pointerdown noteInput overlay=${overlayAtPoint ? `${overlayAtPoint.measureId}#${overlayAtPoint.measureNumber}` : 'none'} `
        + `clickedVisibleGhost=${String(clickedVisibleGhost)} `
        + `liveGhost=${liveGhostTarget ? `${liveGhostTarget.measureId}#${liveGhostTarget.measureNumber}@${liveGhostTarget.timestampNum}/${liveGhostTarget.timestampDen}:${liveGhostTarget.step}${liveGhostTarget.alter === 1 ? '#' : liveGhostTarget.alter === -1 ? 'b' : ''}${liveGhostTarget.octave}` : 'null'} `
        + `selected=${selectedNote ? `${selectedNote.measureNumber}:${selectedNote.staffIndex}:${selectedNote.voiceId}@${selectedNote.timestampNum}/${selectedNote.timestampDen}` : 'null'}`
        + ` anchor=${pointerGhostAnchor ? `${pointerGhostAnchor.measureNumber}:${pointerGhostAnchor.staffIndex}:${pointerGhostAnchor.voiceId}@${pointerGhostAnchor.timestampNum}/${pointerGhostAnchor.timestampDen}` : 'null'}`,
      );
      if (!liveGhostTarget?.resolvedTarget) {
        const manualPointerPayload = buildManualPointerPayload();
        recordBugReportEvent('input-doctor', 'note-input-commit-miss', manualPointerPayload);
        if (visualDebugEnabled || dbg.enabled()) {
          // eslint-disable-next-line no-console
          console.warn('[nex-note:input-doctor] note input click produced no commit target', {
            blockers: inputBlockers,
            visibleGhost: pointerTargetDebug(ghostNoteTarget),
            resolvedTarget: pointerTargetDebug(resolvedGhostTarget),
            liveGhost: pointerTargetDebug(liveGhostTarget),
          });
        }
        return;
      }
      if (
        clickedVisibleGhost
        && ghostNoteTarget?.resolvedTarget
        && resolvedGhostTarget?.resolvedTarget
        && !timestampsEqual(
          ghostNoteTarget.resolvedTarget.timestampNum,
          ghostNoteTarget.resolvedTarget.timestampDen,
          resolvedGhostTarget.resolvedTarget.timestampNum,
          resolvedGhostTarget.resolvedTarget.timestampDen,
        )
      ) {
        recordBugReportEvent('input-doctor', 'visible-ghost-overrode-pointer-target', {
          visibleGhost: pointerTargetDebug(ghostNoteTarget),
          pointerResolved: pointerTargetDebug(resolvedGhostTarget),
          liveGhost: pointerTargetDebug(liveGhostTarget),
          blockers: inputBlockers,
        });
      }

      e.preventDefault();
      activeVisualTargetsRef.current.forEach((element) => tintSvgElement(element, null));
      activeVisualTargetsRef.current = [];
      setActiveVisualTargets([]);
      setVisualSelectionOnly(false);
      applyMeasureSelection([], null);
      if (e.pointerType === 'touch' || e.pointerType === 'pen') {
        pointerRefinementMetricsRef.current = createPointerRefinementMetrics();
        if (tabletPointerMoveFrameRef.current != null) {
          window.cancelAnimationFrame(tabletPointerMoveFrameRef.current);
          tabletPointerMoveFrameRef.current = null;
        }
        pendingTabletPointerMoveRef.current = null;
        pendingTabletPointerMoveTimeRef.current = null;
        lastTabletStaffSwitchPulseRef.current = 0;
        const staffDetails = staffDetailsByMeasureRef.current.get(liveGhostTarget.measureNumber) ?? [];
        const staffDetail = findNearestStaffDetail(
          staffDetails,
          liveGhostTarget.staffIndex,
          liveGhostTarget.domCenter.y,
          liveGhostTarget.corePartId,
        );
        if (!staffDetail) {
          recordBugReportEvent('input-doctor', 'tablet-entry-missing-staff-geometry', {
            target: pointerTargetDebug(liveGhostTarget),
          });
          return;
        }
        const halfStepPx = staffDetail.lineDistanceDom / 2;
        if (!(halfStepPx > 0)) return;
        const staffStep = Math.round(
          (liveGhostTarget.domCenter.y - staffDetail.topLineDomY) / halfStepPx,
        );
        let tabletSession = startTabletEntrySession({
          pointerId: e.pointerId,
          pointerType: e.pointerType,
          point: domPoint,
          staff: buildTabletStaffGeometry(staffDetail, {
            corePartId: liveGhostTarget.corePartId,
            systemIndex: liveGhostTarget.systemIndex,
          }),
          staffStep,
          initialSlotKey: resolvedTargetSlotKey(liveGhostTarget.resolvedTarget),
          preview: liveGhostTarget,
          resolvedTarget: liveGhostTarget.resolvedTarget,
        });
        if (onDirectEntryPitchPreview) {
          const pitchKey = `${liveGhostTarget.step}:${liveGhostTarget.alter}:${liveGhostTarget.octave}`;
          const previewNow = performance.now();
          onDirectEntryPitchPreview({
            coreMeasureId: liveGhostTarget.measureId,
            corePartId: liveGhostTarget.corePartId,
            measureNumber: liveGhostTarget.measureNumber,
            staffIndex: liveGhostTarget.staffIndex,
            voiceId: liveGhostTarget.voiceId,
            timestampNum: liveGhostTarget.timestampNum,
            timestampDen: liveGhostTarget.timestampDen,
            step: liveGhostTarget.step,
            octave: liveGhostTarget.octave,
            alter: liveGhostTarget.alter,
            isRest: false,
            durationType: INPUT_DURATION_TO_TYPE[String(selectedDuration)] ?? String(selectedDuration),
            isDotted,
            graphicalNote: null,
          });
          tabletSession = markTabletPitchAuditioned(tabletSession, pitchKey, previewNow);
        }
        tabletEntrySessionRef.current = tabletSession;
        visibleGhostPointerLockRef.current = liveGhostTarget;
        lastGhostStaffIndexRef.current = liveGhostTarget.staffIndex;
        setGhostNoteTarget(liveGhostTarget);
        setTabletEntryVisual({
          phase: tabletSession.phase,
          pointerType: tabletSession.pointerType,
          point: tabletSession.latestPoint,
        });
        try {
          viewportRef.current?.setPointerCapture(e.pointerId);
        } catch {
          // The window pointer-up listener preserves take-off commit when
          // capture is unavailable in a particular WebKit runtime.
        }
        return;
      }
      onPlaceNoteAt(liveGhostTarget.resolvedTarget);
      lastNoteInputCommitTargetRef.current = {
        measureId: liveGhostTarget.resolvedTarget.measureId,
        corePartId: liveGhostTarget.resolvedTarget.corePartId,
        measureNumber: liveGhostTarget.resolvedTarget.measureNumber,
        staffIndex: liveGhostTarget.resolvedTarget.staffIndex,
        voiceId: liveGhostTarget.resolvedTarget.voiceId,
        timestampNum: liveGhostTarget.resolvedTarget.timestampNum,
        timestampDen: liveGhostTarget.resolvedTarget.timestampDen,
      };
      scheduleRenderedGeometryRefresh();
      lastAdvancedGhostAnchorRef.current = null;
      lastPlacementClientRef.current = { x: e.clientX, y: e.clientY };
      lastPlacementMeasureIdRef.current = liveGhostTarget.measureId;
      lastPointerClientRef.current = null;
      lastGhostStaffIndexRef.current = liveGhostTarget.staffIndex;
      setGhostNoteTarget(null);
      return;
    }

    try {
      const domX = e.clientX - rect.left;
      const domY = e.clientY - rect.top;
      const svgPos = bridgeEventToSvgPoint(container, osmd, e);
      dbg.score(`click dom=(${domX.toFixed(0)},${domY.toFixed(0)}) → svg=(${svgPos.x.toFixed(2)},${svgPos.y.toFixed(2)})`);

      const eventPathNodes = path.filter((entry): entry is Node => entry instanceof Node);
      const clickedVisualTargets = collectClickedVisualTargets(eventPathNodes);
      const visualText = extractVisualText(clickedVisualTargets);
      activeVisualTargetsRef.current.forEach((element) => tintSvgElement(element, null));
      const domPoint = { x: domX, y: domY };
      const measureOverlayAtPoint = findMeasureOverlayForPoint(measureLayoutOverlaysRef.current, domPoint);

      // ── Step 1: direct visible glyph hit has highest priority ─────────────
      const renderedGlyphHit = resolveRenderedGlyphHit({
        renderedNotes: renderedNotesRef.current,
        container,
        eventPathNodes,
        domPoint,
        selectedVoice: pointerInputVoice,
        selectedPartId: selectedNote?.corePartId ?? null,
        hitTolerancePx: e.pointerType === 'touch' ? 32 : 24,
      });
      const renderedGlyphReport = {
        ...renderedGlyphHit.report,
        visualText: visualText ?? null,
      };
      const directlyHitRendered = renderedGlyphHit.rendered && !renderedGlyphReport.fallback
        ? renderedGlyphHit.rendered
        : null;
      const guitarFretTextHit = resolveClickedGuitarFretTextTarget({
        coreDocument,
        container,
        measureOverlay: measureOverlayAtPoint,
        domPoint,
        visualText,
      });
      const guitarTechniqueTextHit = guitarFretTextHit ? null : resolveClickedGuitarTechniqueTextTarget({
        coreDocument,
        container,
        measureOverlay: measureOverlayAtPoint,
        domPoint,
        visualText,
      });
      const guitarFretClickKey = guitarFretTextHit ? selectedNoteKeyFor(guitarFretTextHit) ?? 'guitar-fret' : null;
      const previousGuitarFretClick = lastGuitarFretClickRef.current;
      const elapsedSincePreviousGuitarFretClick = previousGuitarFretClick
        ? performance.now() - previousGuitarFretClick.time
        : Number.POSITIVE_INFINITY;
      const repeatedGuitarFretClick = Boolean(
        guitarFretClickKey
        && previousGuitarFretClick
        && previousGuitarFretClick.key === guitarFretClickKey
        && previousGuitarFretClick.eventTime !== e.timeStamp
        && elapsedSincePreviousGuitarFretClick <= 600
        && Math.abs(previousGuitarFretClick.x - domPoint.x) <= 16
        && Math.abs(previousGuitarFretClick.y - domPoint.y) <= 16,
      );
      if (guitarFretClickKey) {
        lastGuitarFretClickRef.current = {
          key: guitarFretClickKey,
          x: domPoint.x,
          y: domPoint.y,
          time: performance.now(),
          eventTime: e.timeStamp,
        };
      }
      if (
        guitarFretTextHit
        && onSetGuitarFret
        && e.button === 0
        && (e.detail >= 2 || repeatedGuitarFretClick)
        && !e.shiftKey
        && !(e.metaKey || e.ctrlKey)
      ) {
        e.preventDefault();
        activeVisualTargetsRef.current = [];
        setActiveVisualTargets([]);
        applyMeasureSelection([], null);
        setVisualSelectionOnly(false);
        const confidenceReport = buildTextTargetSelectionConfidence(
          'guitar-fret-text',
          guitarFretTextHit,
          domPoint,
          visualText,
          'direct-tab-fret-text',
        );
        setSelectionConfidence(confidenceReport);
        publishNoteHitDebug('guitar-fret-text', guitarFretTextHit, domPoint, visualText, confidenceReport);
        onNoteClick(guitarFretTextHit, {
          visualOnly: false,
          visualText,
          visualMeasureNumber: guitarFretTextHit.measureNumber,
          visualStaffIndex: guitarFretTextHit.staffIndex,
        });
        const containerWidth = container.getBoundingClientRect().width;
        setInlineGuitarFretEditor({
          left: containerWidth > 0
            ? clamp(domPoint.x - 14, 4, Math.max(4, containerWidth - 64))
            : Math.max(4, domPoint.x - 14),
          top: Math.max(4, domPoint.y - 18),
          value: String(guitarFretTextHit.guitar?.fret ?? visualText ?? ''),
          targetKey: selectedNoteKeyFor(guitarFretTextHit) ?? 'guitar-fret',
          targetNote: guitarFretTextHit,
        });
        return;
      }
      // Proximity note: bridge nearest within ~24 px (returns null beyond that)
      const proximityNote = !directlyHitRendered && !guitarFretTextHit && !guitarTechniqueTextHit
        ? renderedGlyphReport.fallback && renderedGlyphHit.rendered
          ? renderedGlyphHit.rendered.note
          : bridgeFindNearestRenderedNote(renderedNotesRef.current, domPoint)
        : null;
      const directNote = guitarFretTextHit ?? guitarTechniqueTextHit ?? directlyHitRendered?.note ?? proximityNote;
      const directVisualOnly = false;

      if (directNote) {
        const confidenceReport = guitarFretTextHit
          ? buildTextTargetSelectionConfidence('guitar-fret-text', guitarFretTextHit, domPoint, visualText, 'direct-tab-fret-text')
          : guitarTechniqueTextHit
            ? buildTextTargetSelectionConfidence('guitar-technique-text', guitarTechniqueTextHit, domPoint, visualText, 'direct-guitar-technique-text')
            : !renderedGlyphHit.rendered
              ? null
              : renderedGlyphReport;
        if (confidenceReport) setSelectionConfidence(confidenceReport);
        publishNoteHitDebug(
          guitarFretTextHit
            ? 'guitar-fret-text'
            : guitarTechniqueTextHit
              ? 'guitar-technique-text'
              : directlyHitRendered
                ? 'direct-rendered-note'
                : 'proximity-rendered-note',
          directNote,
          domPoint,
          visualText,
          confidenceReport,
        );
        if (!noteInputMode && e.button === 0 && !directNote.isRest && !e.shiftKey && !(e.metaKey || e.ctrlKey)) {
          startDirectNoteDrag(directNote);
        }
        // Direct note click — clear visual targets so non-note SVG elements (title text,
        // dynamics, etc.) are not tinted blue. The range overlay is handled reactively
        // by the selectedNotes useEffect below.
        activeVisualTargetsRef.current = [];
        setActiveVisualTargets([]);
        // Plain or Ctrl click clears the overlay immediately; Shift+click leaves the
        // existing overlay and the useEffect will extend it once selectedNotes updates.
        if (!e.shiftKey && !(e.metaKey || e.ctrlKey)) {
          applyMeasureSelection([], null);
        }
        setVisualSelectionOnly(directVisualOnly);
        dbg.score(`direct note hit → part=${directNote.corePartId ?? 'partless'} entity=${directNote.coreEntityId ?? 'none'} m.${directNote.measureNumber} staff=${directNote.staffIndex} voice=${directNote.voiceId} ts=${directNote.timestampNum}/${directNote.timestampDen} pitch=${debugPitchLabel(directNote)}`);
        const plainNoteClick = !e.shiftKey && !(e.metaKey || e.ctrlKey);
        onNoteClick(directNote, {
          range: e.shiftKey,
          additive: !e.shiftKey && (e.metaKey || e.ctrlKey),
          singleSelectionOnly: plainNoteClick || undefined,
          visualOnly: directVisualOnly,
          visualText,
          visualMeasureNumber: directNote.measureNumber,
          visualStaffIndex: directNote.staffIndex,
          visualPartId: directNote.corePartId ?? null,
        });
        return;
      }

      // No direct note — visual targets only apply to non-note clicks (measure, text, etc.)
      activeVisualTargetsRef.current = clickedVisualTargets;
      setActiveVisualTargets(clickedVisualTargets);

      // ── Step 2: no direct note hit — check for measure hit ────────────────
      const measureElement = findMeasureElementForPoint(container, eventPathNodes, e.clientX, e.clientY);
      const overlayAtPoint = measureOverlayAtPoint;
      dbg.score(
        `measure hit test → domMeasure=${measureElement ? 'yes' : 'no'} `
        + `overlay=${overlayAtPoint ? `${overlayAtPoint.measureId}#${overlayAtPoint.measureNumber}` : 'none'} `
        + `overlayCount=${measureLayoutOverlaysRef.current.length}`,
      );

      let nearest: SelectedNote | null = null;
      let measureSelectionApplied = false;

      if ((measureElement || overlayAtPoint) && layoutBridgeRef.current) {
        const measureElements = Array.from(container.querySelectorAll<SVGGElement>('.vf-measure'));
        const measureIndex = measureElement ? measureElements.indexOf(measureElement) : -1;
        const bridgeMeasure = measureIndex >= 0 ? layoutBridgeRef.current.measures[measureIndex] : null;
        const measureOverlay = overlayAtPoint
          ?? (bridgeMeasure
            ? measureLayoutOverlaysRef.current.find((overlay) => overlay.measureId === bridgeMeasure.measureId) ?? null
            : null);
        const measureBridge = measureOverlay
          ? layoutBridgeRef.current.measures.find((entry) => entry.measureId === measureOverlay.measureId) ?? null
          : bridgeMeasure;
        dbg.score(
          `measure resolve → domIndex=${measureIndex} `
          + `bridgeMeasure=${bridgeMeasure ? `${bridgeMeasure.measureId}#${bridgeMeasure.measureNumber}` : 'none'} `
          + `resolved=${measureBridge ? `${measureBridge.measureId}#${measureBridge.measureNumber}` : 'none'}`,
        );
        if (measureBridge) {
          const additiveMeasureSelection = e.metaKey || e.ctrlKey;
          const rangeMeasureSelection = e.shiftKey;
          const currentSelection = selectedMeasureIdsRef.current;
          const currentAnchor = lastSelectedMeasureIdRef.current;
          const renderedMeasureIds = measureLayoutOverlaysRef.current.map((overlay) => overlay.measureId);
          const clickedMeasureId = measureBridge.measureId;
          dbg.score(
            `measure selection mode → clicked=${clickedMeasureId} additive=${String(additiveMeasureSelection)} `
            + `range=${String(rangeMeasureSelection)} anchor=${currentAnchor ?? 'null'} `
            + `current=[${currentSelection.join(', ')}]`,
          );

          if (rangeMeasureSelection && currentAnchor) {
            const start = renderedMeasureIds.indexOf(currentAnchor);
            const end = renderedMeasureIds.indexOf(clickedMeasureId);
            dbg.score(`measure range indices → start=${start} end=${end}`);
            if (start >= 0 && end >= 0) {
              const [from, to] = start < end ? [start, end] : [end, start];
              const rangeIds = renderedMeasureIds.slice(from, to + 1);
              dbg.score(`measure range ids → [${rangeIds.join(', ')}]`);
              applyMeasureSelection(
                additiveMeasureSelection ? Array.from(new Set([...currentSelection, ...rangeIds])) : rangeIds,
                clickedMeasureId,
              );
            } else {
              dbg.score('measure range fallback → anchor missing in rendered order, using single selection');
              applyMeasureSelection([clickedMeasureId], clickedMeasureId);
            }
          } else if (additiveMeasureSelection) {
            if (currentSelection.includes(clickedMeasureId)) {
              const nextIds = currentSelection.filter((entry) => entry !== clickedMeasureId);
              const nextAnchor = currentAnchor === clickedMeasureId
                ? nextIds[nextIds.length - 1] ?? null
                : currentAnchor;
              dbg.score(`measure toggle remove → next=[${nextIds.join(', ')}] nextAnchor=${nextAnchor ?? 'null'}`);
              applyMeasureSelection(nextIds, nextAnchor);
            } else {
              dbg.score(`measure toggle add → next=[${[...currentSelection, clickedMeasureId].join(', ')}]`);
              applyMeasureSelection([...currentSelection, clickedMeasureId], clickedMeasureId);
            }
          } else {
            dbg.score(`measure single select → ${clickedMeasureId}`);
            applyMeasureSelection([clickedMeasureId], clickedMeasureId);
          }
          measureSelectionApplied = true;

          const noteheadRects = measureElement
            ? Array.from(measureElement.querySelectorAll<SVGGElement>('.vf-notehead')).map((notehead) => {
              const noteRect = notehead.getBoundingClientRect();
              return clientRectToContainer(container, noteRect);
            })
            : [];
          if (coreDocument && (clickedVisualTargets.length > 0 || e.shiftKey || e.metaKey || e.ctrlKey)) {
            nearest = bridgeResolveSemanticMeasureClickTarget(
              coreDocument,
              measureBridge.measureId,
              noteheadRects,
              domPoint,
              measureOverlay?.domRect ?? null,
            );
          }
          if (!nearest && (clickedVisualTargets.length > 0 || e.shiftKey || e.metaKey || e.ctrlKey)) {
            nearest = findNearestRenderedNoteInMeasure(renderedNotesRef.current, domPoint, measureBridge.measureNumber);
          }
        }
      } else {
        dbg.score('measure clear → no measure or overlay hit inside container');
        applyMeasureSelection([], null);
      }

      // Fallback for visual targets (e.g. lyrics, dynamics, text)
      const visualOnly = !nearest && (clickedVisualTargets.length > 0 || measureSelectionApplied);
      if (!nearest && visualOnly && (clickedVisualTargets.length > 0 || !measureSelectionApplied)) {
        nearest = overlayAtPoint
          ? findNearestRenderedNoteInMeasure(renderedNotesRef.current, domPoint, overlayAtPoint.measureNumber)
          : null;
      }

      // OSMD GetNearestNote fallback
      if (!nearest && !visualOnly) {
        for (const r of [8, 16, 32, 48]) {
          const osmdNearest = osmd.GraphicSheet.GetNearestNote(svgPos, { x: r, y: r });
          nearest = bridgeNormalizeSelectedNote(osmdNearest, coreDocument);
          if (nearest) break;
        }
      }

      if (nearest) {
        const fallbackConfidence: SelectionConfidenceReport = {
          kind: 'resolved-nearest-note',
          domPoint: roundDebugPoint(domPoint),
          visualText: visualText ?? null,
          selectedTarget: selectedNoteDebugPayload(nearest),
          selectedRenderedId: null,
          winnerReason: 'explicit-measure-or-osmd-fallback',
          fallback: true,
          fallbackReason: overlayAtPoint
            ? `fallback constrained to visible measure ${overlayAtPoint.measureNumber}`
            : 'fallback used OSMD nearest-note search',
          candidates: [],
        };
        setSelectionConfidence(fallbackConfidence);
        publishNoteHitDebug('resolved-nearest-note', nearest, domPoint, visualText, fallbackConfidence);
        dbg.score(`resolved note → part=${nearest.corePartId ?? 'partless'} entity=${nearest.coreEntityId ?? 'none'} m.${nearest.measureNumber} staff=${nearest.staffIndex} voice=${nearest.voiceId} pitch=${debugPitchLabel(nearest)}`);
      } else {
        const missConfidence: SelectionConfidenceReport = {
          kind: 'no-note',
          domPoint: roundDebugPoint(domPoint),
          visualText: visualText ?? null,
          selectedTarget: null,
          selectedRenderedId: null,
          winnerReason: null,
          fallback: false,
          fallbackReason: null,
          candidates: [],
        };
        setSelectionConfidence(missConfidence);
        publishNoteHitDebug('no-note', null, domPoint, visualText, missConfidence);
        dbg.score('resolved note → null (no note near click)');
      }
      if (nearest && !e.shiftKey && !(e.metaKey || e.ctrlKey)) {
        applyMeasureSelection([], null);
      }
      setVisualSelectionOnly(visualOnly);
      onNoteClick(nearest ?? null, {
        range: e.shiftKey,
        additive: !e.shiftKey && (e.metaKey || e.ctrlKey),
        visualOnly,
        visualText,
        visualMeasureNumber: overlayAtPoint?.measureNumber ?? nearest?.measureNumber ?? null,
        visualStaffIndex: nearest?.staffIndex ?? null,
        visualPartId: nearest?.corePartId ?? null,
      });
    } catch (err) {
      dbg.error('score', 'click handler error:', err);
      activeVisualTargetsRef.current = [];
      setActiveVisualTargets([]);
      setVisualSelectionOnly(false);
      dbg.score('measure clear → pointer handler exception');
      applyMeasureSelection([], null);
      onNoteClick(null);
    }
  }, [pencilOnlyInput, applyMeasureSelection, chordInputMode, coreDocument, entryMode, ghostNoteTarget, graceEventIds, inputByDurationMode, isDotted, noteInputAnchor, noteInputMode, onDirectEntryPitchPreview, onNoteClick, onPlaceNoteAt, onSetChordSymbol, overlayLayerOffset, scheduleRenderedGeometryRefresh, selectedAccidental, selectedDuration, selectedNote, selectedVoice, visualDebugEnabled, zoomPercent]);

  const handleDoubleClick = useCallback((event: MouseEvent) => {
    if (!onSetGuitarFret) return;
    const container = containerRef.current;
    if (!container || !container.contains(event.target as Node)) return;
    const rect = container.getBoundingClientRect();
    const domPoint = {
      x: event.clientX - rect.left,
      y: event.clientY - rect.top,
    };
    const path = typeof event.composedPath === 'function' ? event.composedPath() : [];
    const eventPathNodes = path.filter((entry): entry is Node => entry instanceof Node);
    const clickedVisualTargets = collectClickedVisualTargets(eventPathNodes);
    const visualText = extractVisualText(clickedVisualTargets);
    const measureOverlayAtPoint = findMeasureOverlayForPoint(measureLayoutOverlaysRef.current, domPoint);
    const guitarFretTextHit = resolveClickedGuitarFretTextTarget({
      coreDocument,
      container,
      measureOverlay: measureOverlayAtPoint,
      domPoint,
      visualText,
    });
    if (!guitarFretTextHit) return;

    event.preventDefault();
    activeVisualTargetsRef.current.forEach((element) => tintSvgElement(element, null));
    activeVisualTargetsRef.current = [];
    setActiveVisualTargets([]);
    applyMeasureSelection([], null);
    setVisualSelectionOnly(false);
    onNoteClick(guitarFretTextHit, {
      visualOnly: false,
      visualText,
      visualMeasureNumber: guitarFretTextHit.measureNumber,
      visualStaffIndex: guitarFretTextHit.staffIndex,
    });
    const containerWidth = container.getBoundingClientRect().width;
    setInlineGuitarFretEditor({
      left: containerWidth > 0
        ? clamp(domPoint.x - 14, 4, Math.max(4, containerWidth - 64))
        : Math.max(4, domPoint.x - 14),
      top: Math.max(4, domPoint.y - 18),
      value: String(guitarFretTextHit.guitar?.fret ?? visualText ?? ''),
      targetKey: selectedNoteKeyFor(guitarFretTextHit) ?? 'guitar-fret',
      targetNote: guitarFretTextHit,
    });
  }, [applyMeasureSelection, coreDocument, onNoteClick, onSetGuitarFret]);
  handlePointerDownRef.current = handlePointerDown;
  handleDoubleClickRef.current = handleDoubleClick;

  useEffect(() => {
    const originalLog = console.log;
    const originalInfo = console.info;
    const originalDebug = console.debug;
    const originalWarn = console.warn;
    const originalError = console.error;

    // Some OSMD/VexFlow builds emit noisy render tracing in dev. Keep the
    // browser console focused on actual app diagnostics.
    // eslint-disable-next-line no-console
    console.log = (...args: unknown[]) => {
      if (isSuppressedOsmdNoise(args)) return;
      originalLog(...args);
    };
    // eslint-disable-next-line no-console
    console.info = (...args: unknown[]) => {
      if (isSuppressedOsmdNoise(args)) return;
      originalInfo(...args);
    };
    // eslint-disable-next-line no-console
    console.debug = (...args: unknown[]) => {
      if (isSuppressedOsmdNoise(args)) return;
      originalDebug(...args);
    };
    // eslint-disable-next-line no-console
    console.warn = (...args: unknown[]) => {
      if (isSuppressedOsmdNoise(args)) return;
      originalWarn(...args);
    };
    // eslint-disable-next-line no-console
    console.error = (...args: unknown[]) => {
      if (isSuppressedOsmdNoise(args)) return;
      originalError(...args);
    };

    return () => {
      // eslint-disable-next-line no-console
      console.log = originalLog;
      // eslint-disable-next-line no-console
      console.info = originalInfo;
      // eslint-disable-next-line no-console
      console.debug = originalDebug;
      // eslint-disable-next-line no-console
      console.warn = originalWarn;
      // eslint-disable-next-line no-console
      console.error = originalError;
    };
  }, []);

  useEffect(() => {
    if (!xml || !containerRef.current) return;

    let cancelled = false;
    const abortController = new AbortController();
    geometryProxyRef.current.invalidate();
    clearActiveScoreTints();
    renderedNotesRef.current = [];
    renderedGhostGridRef.current = createEmptyRenderedGhostGrid();
    interactiveEditMapRef.current = createEmptyInteractiveEditMap();
    ghostNoteIndexRef.current = { byMeasureId: new Map(), bySystemStaff: new Map() };
    staffDetailsByMeasureRef.current = new Map();
    lastGhostStaffIndexRef.current = null;
    lastAdvancedGhostAnchorRef.current = null;
    activeVisualTargetsRef.current.forEach((element) => tintSvgElement(element, null));
    activeVisualTargetsRef.current = [];
    setActiveVisualTargets([]);
    setGhostNoteTarget(null);
    setDragPreviewTarget(null);
    setMeasureLayoutOverlays([]);
    setSystemLayoutOverlays([]);
    setLoading(true);
    setError('');
    onRenderStart?.();

    async function render() {
      try {
        const container = containerRef.current;
        const viewport = viewportRef.current;
        if (!container) return;
        const readyToRender = await waitForRenderableContainer(container, viewport, abortController.signal);
        if (cancelled || abortController.signal.aborted || !containerRef.current) return;
        if (!readyToRender) {
          throw new Error(`Score render container was not ready after ${OSMD_LAYOUT_READY_TIMEOUT_MS}ms (${describeRenderableContainerSize(container, viewport)}).`);
        }

        const { OpenSheetMusicDisplay } = await import('opensheetmusicdisplay');
        if (cancelled || !containerRef.current) return;

        const layoutStarted = performance.now();
        layoutBridgeRef.current = coreDocument ? buildOsmdLayoutBridge(coreDocument, RENDER_LAYOUT_OPTIONS) : null;
        const projectedXml = coreDocument && layoutBridgeRef.current
          ? projectOsmdLayoutXml(xml, coreDocument, layoutBridgeRef.current)
          : xml;
        recordInputMetric('layout-projection', performance.now() - layoutStarted);
        dbg.score('OSMD loading XML …');
        if (!cancelled) {
          let activeOsmd = null;
          const attempts = buildOsmdRenderAttempts(projectedXml, xml);

          let lastRenderError: unknown = null;
          let attemptIndex = 0;
          for (const attempt of attempts) {
            try {
              activeOsmd = await loadAndRenderOsmd(OpenSheetMusicDisplay, attempt.xml, abortController.signal);
              if (cancelled || abortController.signal.aborted) return;
              if (attemptIndex > 0) {
                dbg.warn('score', `OSMD fallback succeeded with ${attempt.label}.`);
              }
              break;
            } catch (renderErr) {
              lastRenderError = renderErr;
              dbg.warn('score', `OSMD render attempt failed for ${attempt.label}:`, renderErr);
            }
            attemptIndex += 1;
          }
          if (!activeOsmd) throw lastRenderError;
          dbg.score('OSMD render complete — GraphicSheet ready:', !!activeOsmd.GraphicSheet);
          if (containerRef.current && layoutBridgeRef.current) {
            containerRef.current.dataset.layoutSystems = String(layoutBridgeRef.current.systems.length);
            containerRef.current.dataset.layoutPages = String(layoutBridgeRef.current.plan.pages.length);
            containerRef.current.dataset.layoutRevision = String(layoutBridgeRef.current.revision);
          }
          setOverlayLayerOffset(resolveOverlayLayerOffset(containerRef.current));
          renderedNotesRef.current = bridgeCollectRenderedNotes(activeOsmd, containerRef.current, coreDocument);
          if (containerRef.current) drawNestedTupletBrackets(containerRef.current, coreDocument, renderedNotesRef.current);
          setRenderedNoteDebugMarkers(buildRenderedNoteDebugMarkers(renderedNotesRef.current, selectedNote, selectionConfidence));
          const graphicalMeasureRects = buildDomMeasureRectsByVisualOrder(containerRef.current, coreDocument);
          const osmdGraphicalMeasureRects = buildGraphicalMeasureRectsById(activeOsmd, containerRef.current, coreDocument);
          for (const [measureId, rect] of osmdGraphicalMeasureRects.entries()) {
            graphicalMeasureRects.set(measureId, rect);
          }
          const staffDetailsByMeasure = buildStaffDetailsByMeasure(activeOsmd, containerRef.current);
          staffDetailsByMeasureRef.current = staffDetailsByMeasure;
          const measureOverlays = buildMeasureLayoutOverlaysForContainer(
            renderedNotesRef.current,
            layoutBridgeRef.current,
            graphicalMeasureRects,
            staffDetailsByMeasure,
            coreDocument,
          );
          let refinedMeasureOverlays = refineMeasureOverlaysForNoteInput(
            measureOverlays,
            renderedNotesRef.current,
            coreDocument,
            selectedDurationRef.current,
            isDottedRef.current,
          );
          renderedGhostGridRef.current = buildRenderedGhostGrid(renderedNotesRef.current, {
            coreDocument,
            measureOverlays: refinedMeasureOverlays,
            selectedDuration: selectedDurationRef.current,
            isDotted: isDottedRef.current,
            exposeRestMeasureSlots: true,
          });
          refreshGeometryProxy(activeOsmd, containerRef.current, refinedMeasureOverlays, renderedGhostGridRef.current);
          refinedMeasureOverlays = mergeAugmentedMeasureOverlays(
            refinedMeasureOverlays,
            geometryProxyRef.current.getAugmentedMeasures(),
          );
          renderedGhostGridRef.current = buildRenderedGhostGrid(renderedNotesRef.current, {
            coreDocument,
            measureOverlays: refinedMeasureOverlays,
            selectedDuration: selectedDurationRef.current,
            isDotted: isDottedRef.current,
            exposeRestMeasureSlots: true,
          });
          interactiveEditMapRef.current = buildInteractiveEditMap({
            renderedGhostGrid: renderedGhostGridRef.current,
            measureOverlays: refinedMeasureOverlays,
            renderedNotes: renderedNotesRef.current,
          });
          if (containerRef.current) {
            containerRef.current.dataset.editMapMeasureCount = String(interactiveEditMapRef.current.measureOrder.length);
            containerRef.current.dataset.editMapDiagnostics = String(interactiveEditMapRef.current.diagnostics.length);
          }
          ghostNoteIndexRef.current = buildGhostNoteSpatialIndex(
            renderedNotesRef.current,
            coreDocument,
            refinedMeasureOverlays,
            renderedGhostGridRef.current,
          );
          refreshGeometryProxy(activeOsmd, containerRef.current, refinedMeasureOverlays, renderedGhostGridRef.current);
          renderedZoomRef.current = zoomPercent;
          const pendingZoomAnchor = pendingZoomAnchorRef.current;
          pendingZoomAnchorRef.current = null;
          if (pendingZoomAnchor && viewportRef.current) {
            viewportRef.current.scrollTo(resolveAnchoredScroll(pendingZoomAnchor, zoomPercent));
          }
          setMeasureLayoutOverlays(refinedMeasureOverlays);
          setSystemLayoutOverlays(buildRenderedSystemLayoutOverlays(refinedMeasureOverlays, layoutBridgeRef.current));
          dbg.score(`rendered note map size=${renderedNotesRef.current.length}`);
          if (layoutBridgeRef.current) {
            dbg.score(`layout bridge systems=${layoutBridgeRef.current.systems.length} measures=${layoutBridgeRef.current.measures.length}`);
          }

          if (activeOsmd.cursor) {
            activeOsmd.cursor.hide();
          }

          setLoading(false);
          if (containerRef.current) containerRef.current.dataset.renderedRevision = String(coreDocument?.revision ?? 0);
          onOsmdReady(activeOsmd);
          markInputFeedback('input-to-note-frame');
        }
      } catch (err) {
        dbg.error('score', 'OSMD render error:', err);
        if (!cancelled) {
          const message = err instanceof Error ? err.message : String(err);
          setError(`Preview error: ${message}`);
          setLoading(false);
          onRenderError?.(`Could not render embedded score: ${message}`);
        }
      }
    }

    render();
    return () => {
      cancelled = true;
      abortController.abort();
      geometryProxyRef.current.invalidate();
    };
  }, [clearActiveScoreTints, coreDocument, loadAndRenderOsmd, onOsmdReady, onRenderError, onRenderStart, refreshGeometryProxy, renderViewportRevision, viewMode, xml, zoomPercent]);

  useEffect(() => {
    if (ghostNoteTarget) markInputFeedback('input-to-preview-frame');
  }, [ghostNoteTarget]);
  useEffect(() => {
    const measureInput = (event: Event) => {
      if (!inputMetricsEnabled()) return;
      const target = event.target as HTMLElement | null;
      if (target?.closest('input, textarea, select, [contenteditable="true"]')) return;
      if (event.type === 'keydown' && !(event instanceof KeyboardEvent && /^[a-g0-9]$/i.test(event.key))) return;
      markInputStart();
    };
    for (const type of ['pointerdown', 'pointermove', 'keydown']) window.addEventListener(type, measureInput, true);
    return () => { for (const type of ['pointerdown', 'pointermove', 'keydown']) window.removeEventListener(type, measureInput, true); };
  }, []);

  // React to note selection / mode changes without a full re-render
  useEffect(() => {
    const osmd = osmdRef.current;
    if (!osmd?.GraphicSheet) return;
    try {
      if (osmd.cursor) {
        osmd.cursor.hide();
      }
    } catch (err) {
      dbg.warn('score', 'cursor update failed:', err);
    }
  }, [selectedNote, noteInputMode]);

  useEffect(() => {
    const osmd = osmdRef.current;
    if (!osmd?.GraphicSheet) return;

    if (!playbackActive || !playbackCursorTarget) {
      lastPlaybackFollowMeasureRef.current = null;
      lastPlaybackFollowSystemRef.current = null;
      if (osmd.cursor) {
        osmd.cursor.hide();
      }
      return;
    }

    try {
      if (!osmd.cursor) {
        osmd.enableOrDisableCursors(true);
        patchCursorPointerEvents(osmd);
      }
      positionPlaybackCursor(osmd, playbackCursorTarget);
    } catch (err) {
      dbg.warn('score', 'playback cursor update failed:', err);
    }

    if (followPlayback) {
      const behavior: ScrollBehavior = lastPlaybackFollowMeasureRef.current === playbackCursorTarget.measureNumber
        ? 'auto'
        : 'smooth';
      if (playbackPlayhead) {
        scrollPlaybackPlayheadIntoView(playbackPlayhead, behavior);
      } else {
        scrollPlaybackTargetIntoView(playbackCursorTarget, behavior);
      }
    }
    const activeMeasureOverlay = measureLayoutOverlaysRef.current.find((entry) => entry.measureNumber === playbackCursorTarget.measureNumber) ?? null;
    lastPlaybackFollowSystemRef.current = activeMeasureOverlay?.systemIndex ?? null;
    lastPlaybackFollowMeasureRef.current = playbackCursorTarget.measureNumber;
  }, [
    followPlayback,
    noteInputAnchor,
    noteInputMode,
    playbackActive,
    playbackCursorTarget,
    playbackPlayhead,
    scrollPlaybackPlayheadIntoView,
    scrollPlaybackTargetIntoView,
    selectedNote,
  ]);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const syncRenderedMap = () => {
      // Resize/layout observers must use the current OSMD render. Capturing it
      // outside this callback can restore stale snap points after note input.
      const osmd = osmdRef.current;
      if (!osmd?.GraphicSheet) return;
      setOverlayLayerOffset(resolveOverlayLayerOffset(container));
      renderedNotesRef.current = bridgeCollectRenderedNotes(osmd, container, coreDocument);
      setRenderedNoteDebugMarkers(buildRenderedNoteDebugMarkers(renderedNotesRef.current, selectedNote, selectionConfidence));
      const graphicalMeasureRects = buildDomMeasureRectsByVisualOrder(container, coreDocument);
      const osmdGraphicalMeasureRects = buildGraphicalMeasureRectsById(osmd, container, coreDocument);
      for (const [measureId, rect] of osmdGraphicalMeasureRects.entries()) {
        graphicalMeasureRects.set(measureId, rect);
      }
      const staffDetailsByMeasure = buildStaffDetailsByMeasure(osmd, container);
      staffDetailsByMeasureRef.current = staffDetailsByMeasure;
      const measureOverlays = buildMeasureLayoutOverlaysForContainer(
        renderedNotesRef.current,
        layoutBridgeRef.current,
        graphicalMeasureRects,
        staffDetailsByMeasure,
        coreDocument,
      );
      let refinedMeasureOverlays = refineMeasureOverlaysForNoteInput(
        measureOverlays,
        renderedNotesRef.current,
        coreDocument,
        selectedDurationRef.current,
        isDottedRef.current,
      );
      renderedGhostGridRef.current = buildRenderedGhostGrid(renderedNotesRef.current, {
        coreDocument,
        measureOverlays: refinedMeasureOverlays,
        selectedDuration: selectedDurationRef.current,
        isDotted: isDottedRef.current,
        exposeRestMeasureSlots: true,
      });
      refreshGeometryProxy(osmd, container, refinedMeasureOverlays, renderedGhostGridRef.current);
      refinedMeasureOverlays = mergeAugmentedMeasureOverlays(
        refinedMeasureOverlays,
        geometryProxyRef.current.getAugmentedMeasures(),
      );
      renderedGhostGridRef.current = buildRenderedGhostGrid(renderedNotesRef.current, {
        coreDocument,
        measureOverlays: refinedMeasureOverlays,
        selectedDuration: selectedDurationRef.current,
        isDotted: isDottedRef.current,
        exposeRestMeasureSlots: true,
      });
      interactiveEditMapRef.current = buildInteractiveEditMap({
        renderedGhostGrid: renderedGhostGridRef.current,
        measureOverlays: refinedMeasureOverlays,
        renderedNotes: renderedNotesRef.current,
      });
      container.dataset.editMapMeasureCount = String(interactiveEditMapRef.current.measureOrder.length);
      container.dataset.editMapDiagnostics = String(interactiveEditMapRef.current.diagnostics.length);
      ghostNoteIndexRef.current = buildGhostNoteSpatialIndex(
        renderedNotesRef.current,
        coreDocument,
        refinedMeasureOverlays,
        renderedGhostGridRef.current,
      );
      refreshGeometryProxy(osmd, container, refinedMeasureOverlays, renderedGhostGridRef.current);
      setMeasureLayoutOverlays(refinedMeasureOverlays);
      setSystemLayoutOverlays(buildRenderedSystemLayoutOverlays(refinedMeasureOverlays, layoutBridgeRef.current));
    };

    syncRenderedMap();
    const observer = new ResizeObserver(syncRenderedMap);
    observer.observe(container);
    window.addEventListener('resize', syncRenderedMap);
    return () => {
      observer.disconnect();
      window.removeEventListener('resize', syncRenderedMap);
    };
  }, [coreDocument, isDotted, refreshGeometryProxy, selectedDuration]);

  useEffect(() => {
    if (!noteInputMode) return;
    const container = containerRef.current;
    const lastPointer = lastPointerClientRef.current;
    if (!container || !lastPointer) return;

    const rect = container.getBoundingClientRect();
    if (!isPointInsideRect(lastPointer.x, lastPointer.y, rect)) {
      lastGhostStaffIndexRef.current = null;
      setGhostNoteTarget(null);
      return;
    }
    lastAdvancedGhostAnchorRef.current = null;

    const domPoint = {
      x: lastPointer.x - rect.left,
      y: lastPointer.y - rect.top,
    };
    const pointerInputVoice = resolveStoredInputVoiceAtPoint(measureLayoutOverlaysRef.current, domPoint, coreDocument, selectedVoice);
    const overlayAtPoint = findMeasureOverlayForPoint(measureLayoutOverlaysRef.current, domPoint);
    const resolvedGhost = resolveGhostNoteTarget(
      geometryProxyRef.current,
      renderedGhostGridRef.current,
      ghostNoteIndexRef.current,
      overlayAtPoint,
      measureLayoutOverlaysRef.current,
      systemLayoutOverlaysRef.current,
      coreDocument,
      graceEventIds,
      domPoint,
      rect,
      selectedNote,
      selectedDuration,
      selectedAccidental,
      isDotted,
      pointerInputVoice,
      lastGhostStaffIndexRef.current,
      ghostStaffHysteresisPx(zoomPercent, false),
      staffDetailsByMeasureRef.current,
    );
    const nextGhostCandidate = shouldStickToAdvancedAnchor({
      anchor: selectedNote,
      overlay: overlayAtPoint,
      pointerClient: lastPointer,
      lastPlacementClient: lastPlacementClientRef.current,
    }) && selectedNote?.coreMeasureId === lastPlacementMeasureIdRef.current
      ? retargetGhostToAdvancedAnchor({
          resolvedGhost,
          renderedGhostGrid: renderedGhostGridRef.current,
          pointerGhostAnchor: selectedNote,
          pointerX: domPoint.x,
          maxDistancePx: 256,
        })
      : resolvedGhost;
    const nextGhostResolved2 = discardGhostTargetOffRenderedSnap(
      alignReplaceGhostToRenderedSnap(
        bindResolvedEditTargetToGhost(
          applyEntryModeToGhostTarget(
            nextGhostCandidate,
            entryMode,
            chordInputMode,
            pointerInputVoice,
            selectedNote,
            noteInputAnchor,
            lastNoteInputCommitTargetRef.current,
          ),
          interactiveEditMapRef.current,
          coreDocument,
          selectedDuration,
          isDotted,
        ),
        renderedGhostGridRef.current,
      ),
      renderedGhostGridRef.current,
    );
    const pointerInLeadingProtectionZone2 = nextGhostResolved2?.pointerX != null
      && nextGhostResolved2.placementMode === 'insert'
      && (
        (
          nextGhostResolved2.timestampNum === 0
          && nextGhostResolved2.placementAnchorIsRest !== true
          && nextGhostResolved2.semanticAnchorIsRest !== true
          && nextGhostResolved2.domCenter.x - nextGhostResolved2.pointerX > 1
        )
        || firstSlotGhostPulledBehindPointer(nextGhostResolved2)
        || pointerInLeadingFirstSlotBuffer(nextGhostResolved2, overlayAtPoint, domPoint.x, measureLayoutOverlaysRef.current)
      );
    const pointerInBarlineGuard2 = pointerInMeasureBarlineGuard(overlayAtPoint, domPoint.x);
    const ghostInBarlineGuard2 = ghostTargetOverlapsBarlineGuard(nextGhostResolved2, measureLayoutOverlaysRef.current);
    const ghostInLeadingTimeSignatureGuard2 = ghostTargetOverlapsLeadingTimeSignatureGuard(nextGhostResolved2, measureLayoutOverlaysRef.current);
    const visibleGhostInLeadingProtectionZone2 = isGhostTargetInLeadingProtectedArea(
      nextGhostResolved2,
      ghostNoteIndexRef.current,
      measureLayoutOverlaysRef.current,
      rect,
    );
    const ghostRejectedByGuards2 = pointerInLeadingProtectionZone2
      || pointerInBarlineGuard2
      || ghostInBarlineGuard2
      || ghostInLeadingTimeSignatureGuard2
      || visibleGhostInLeadingProtectionZone2;
    const needsRestFallback2 = ghostRejectedByGuards2 || !nextGhostResolved2;
    const restFallbackOverlay2 = overlayAtPoint
      ?? findNearestMeasureOverlayForPoint(measureLayoutOverlaysRef.current, domPoint);
    const guardedRestFallback2 = needsRestFallback2
      ? resolveRestOnlyGhostTarget(
          null,
          restFallbackOverlay2,
          renderedGhostGridRef.current,
          coreDocument,
          domPoint,
          selectedDuration,
          selectedAccidental,
          isDotted,
          pointerInputVoice,
          staffDetailsByMeasureRef.current,
        )
      : null;
    const nextGhost2 = suppressGhostOnTabStaff(
      coreDocument,
      ghostRejectedByGuards2 ? guardedRestFallback2 : (nextGhostResolved2 ?? guardedRestFallback2),
    );
    setGhostNoteTarget((current) => {
      lastGhostStaffIndexRef.current = nextGhost2?.staffIndex ?? lastGhostStaffIndexRef.current;
      if (ghostTargetsEqual(current, nextGhost2)) return current;
      return nextGhost2;
    });
  }, [
    coreDocument,
    graceEventIds,
    isDotted,
    measureLayoutOverlays,
    noteInputMode,
    selectedNote,
    selectedAccidental,
    selectedDuration,
    noteInputAnchor,
    selectedVoice,
    systemLayoutOverlays,
    zoomPercent,
  ]);


  useEffect(() => {
    let frame = 0;
    const readViewportWidth = () => {
      const viewportWidth = viewportRef.current?.getBoundingClientRect().width ?? 0;
      if (viewportWidth > 0) return Math.round(viewportWidth);
      return Math.round(containerRef.current?.getBoundingClientRect().width ?? 0);
    };
    const handleResize = () => {
      const nextWidth = readViewportWidth();
      if (nextWidth <= 0 || nextWidth === lastObservedViewportWidthRef.current) return;
      lastObservedViewportWidthRef.current = nextWidth;
      cancelAnimationFrame(frame);
      geometryProxyRef.current.invalidate();
      frame = window.requestAnimationFrame(() => {
        setRenderViewportRevision((value) => value + 1);
      });
    };

    lastObservedViewportWidthRef.current = readViewportWidth();
    const observer = new ResizeObserver(handleResize);
    if (viewportRef.current) observer.observe(viewportRef.current);
    if (containerRef.current) observer.observe(containerRef.current);
    window.addEventListener('resize', handleResize);
    return () => {
      cancelAnimationFrame(frame);
      observer.disconnect();
      window.removeEventListener('resize', handleResize);
    };
  }, []);

  useEffect(() => {
    syncViewportBox();
  }, [measureLayoutOverlays, syncViewportBox, viewMode]);

  useEffect(() => {
    if (!findVisible) return;
    const timer = window.setTimeout(() => {
      findInputRef.current?.focus();
      findInputRef.current?.select();
    }, 0);
    return () => window.clearTimeout(timer);
  }, [findVisible]);

  const selectedNoteKey = selectedNoteKeyFor(selectedNote);

  const openInlineChordEditor = useCallback(() => {
    if (!selectedNote || !onSetChordSymbol) return;
    const rendered = findRenderedSelectionTarget(selectedNote, renderedNotesRef.current, coreDocument);
    const overlay = measureLayoutOverlaysRef.current.find((entry) => (
      (selectedNote.coreMeasureId && entry.measureId === selectedNote.coreMeasureId)
      || entry.measureNumber === selectedNote.measureNumber
    )) ?? null;
    const visibleRect = overlay
      ? visibleMeasureRectForStaff(overlay, staffDetailsByMeasureRef.current, coreDocument)
      : null;
    const x = rendered?.domCenter.x ?? (visibleRect ? visibleRect.x + Math.min(48, visibleRect.width * 0.18) : 24);
    const y = rendered?.domRect.y ?? visibleRect?.y ?? 24;
    const containerWidth = containerRef.current?.getBoundingClientRect().width ?? 0;
    const left = containerWidth > 0
      ? clamp(x - 18, 4, Math.max(4, containerWidth - 118))
      : Math.max(4, x - 18);
    const top = Math.max(4, y - 34);
    setInlineChordEditor({
      left,
      top,
      value: resolveSelectedHarmony(coreDocument, selectedNote),
      targetKey: selectedNoteKey ?? 'selection',
      targetNote: selectedNote,
    });
  }, [coreDocument, onSetChordSymbol, selectedNote, selectedNoteKey]);

  useEffect(() => {
    if (typeof window === 'undefined') return undefined;
    const handleFocusInlineChord = () => {
      openInlineChordEditor();
    };
    window.addEventListener('nex-note:focus-inline-chord-symbol', handleFocusInlineChord);
    return () => window.removeEventListener('nex-note:focus-inline-chord-symbol', handleFocusInlineChord);
  }, [openInlineChordEditor]);

  useEffect(() => {
    if (!inlineChordEditor) return;
    const timer = window.setTimeout(() => {
      inlineChordInputRef.current?.focus();
      inlineChordInputRef.current?.select();
    }, 0);
    return () => window.clearTimeout(timer);
  }, [inlineChordEditor]);

  useEffect(() => {
    setInlineChordEditor((current) => {
      if (!current) return current;
      if (!selectedNoteKey || current.targetKey !== selectedNoteKey) return null;
      return current;
    });
  }, [selectedNoteKey]);

  const commitInlineChordEditor = useCallback(() => {
    const value = inlineChordInputRef.current?.value.trim() ?? '';
    if (value) onSetChordSymbol?.(value, inlineChordEditor?.targetNote ?? null);
    setInlineChordEditor(null);
  }, [inlineChordEditor, onSetChordSymbol]);

  useEffect(() => {
    if (!inlineGuitarFretEditor) return;
    const timer = window.setTimeout(() => {
      inlineGuitarFretInputRef.current?.focus();
      inlineGuitarFretInputRef.current?.select();
    }, 0);
    return () => window.clearTimeout(timer);
  }, [inlineGuitarFretEditor]);

  useEffect(() => {
    setInlineGuitarFretEditor((current) => {
      if (!current) return current;
      if (!selectedNoteKey) return current;
      if (current.targetKey !== selectedNoteKey) return null;
      return current;
    });
  }, [selectedNoteKey]);

  const commitInlineGuitarFretEditor = useCallback(() => {
    if (!inlineGuitarFretEditor) return;
    const rawValue = inlineGuitarFretInputRef.current?.value.trim() ?? '';
    if (/^\d{1,2}$/.test(rawValue)) {
      const fret = Math.max(0, Math.min(24, Number(rawValue)));
      onSetGuitarFret?.(inlineGuitarFretEditor.targetNote, fret);
    }
    setInlineGuitarFretEditor(null);
  }, [inlineGuitarFretEditor, onSetGuitarFret]);

  useEffect(() => {
    const handleScoreViewCommand = (event: Event) => {
      const detail = event instanceof CustomEvent ? event.detail as ScoreViewCommandDetail | undefined : undefined;
      if (!detail) return;

      switch (detail.action) {
        case 'toggle-navigator':
          setNavigatorVisible((current) => !current);
          return;
        case 'focus-find':
          setFindVisible(true);
          return;
        case 'zoom-in':
          adjustZoom(ZOOM_STEP);
          return;
        case 'zoom-out':
          adjustZoom(-ZOOM_STEP);
          return;
        case 'zoom-reset':
          setZoom(100);
          return;
        case 'set-view-mode':
          if (detail.viewMode) setViewMode(detail.viewMode);
          return;
      }
    };

    window.addEventListener('nex-note:score-view-command', handleScoreViewCommand);
    return () => window.removeEventListener('nex-note:score-view-command', handleScoreViewCommand);
  }, [adjustZoom, setZoom]);

  useEffect(() => {
    const viewport = viewportRef.current;
    if (!viewport) return;

    const handleScroll = () => syncViewportBox();
    const handleWheel = (event: WheelEvent) => {
      if (event.ctrlKey || event.metaKey) {
        event.preventDefault();
        const step = event.deltaY < 0 ? ZOOM_STEP : -ZOOM_STEP;
        const zoomWillChange = clamp(zoomPercentRef.current + step, MIN_ZOOM, MAX_ZOOM) !== zoomPercentRef.current;
        // Keep the first anchor of a wheel burst; later events arrive before the re-render.
        if (zoomWillChange && !pendingZoomAnchorRef.current) {
          const viewportRect = viewport.getBoundingClientRect();
          pendingZoomAnchorRef.current = captureZoomAnchor({
            scrollLeft: viewport.scrollLeft,
            scrollTop: viewport.scrollTop,
            pointerX: event.clientX - viewportRect.left,
            pointerY: event.clientY - viewportRect.top,
            renderedZoom: renderedZoomRef.current,
          });
        }
        adjustZoom(step);
        return;
      }
      if (event.shiftKey) {
        event.preventDefault();
        viewport.scrollLeft += normalizeHorizontalWheelDelta(event);
        syncViewportBox();
      }
    };

    viewport.addEventListener('scroll', handleScroll, { passive: true });
    viewport.addEventListener('wheel', handleWheel, { passive: false });
    return () => {
      viewport.removeEventListener('scroll', handleScroll);
      viewport.removeEventListener('wheel', handleWheel);
    };
  }, [adjustZoom, syncViewportBox]);

  useEffect(() => {
    clearActiveScoreTints();
    const tintedRenderedNoteElements = new Set<SVGElement>();
    const tintedVisualElements = new Set<SVGElement>();
    const tintedGuitarFretElements = new Set<SVGElement>();
    const tintAndTrackRenderedNote = (element: SVGElement | null, color: string) => {
      if (!element) return;
      tintRenderedNote(element, color);
      tintedRenderedNoteElements.add(element);
    };
    const tintAndTrackVisualElement = (element: SVGElement | null, color: string) => {
      if (!element) return;
      tintSvgElement(element, color);
      tintedVisualElements.add(element);
    };
    const tintAndTrackGuitarFretElement = (element: SVGElement | null, color: string) => {
      if (!element) return;
      tintSvgElement(element, color);
      tintedGuitarFretElements.add(element);
    };

    if (playbackActive && playbackPlayhead) {
      // Highlight only notes whose onset has actually been reached by the visible playhead.
      const notesInMeasure = renderedNotesRef.current.filter(
        (e) => e.note.measureNumber === playbackPlayhead.measureNumber,
      );
      if (notesInMeasure.length > 0) {
        const activeOnset = resolveReachedPlaybackOnset(
          notesInMeasure.map((entry) => entry.note),
          playbackPlayhead.progressWithinMeasure,
        );
        if (activeOnset) {
          notesInMeasure
            .filter((e) => timestampsEqual(e.note.timestampNum, e.note.timestampDen, activeOnset.timestampNum, activeOnset.timestampDen))
            .forEach((e) => tintAndTrackRenderedNote(e.tintElement, '#1a56db'));
        }
      }
    } else {
      // Selection highlighting when not playing. During note input the blue
      // focus stays on the last entered note/rest while the input cursor can
      // advance to the next slot.
      const targets = noteInputMode && noteInputAnchor
        ? [noteInputAnchor]
        : selectedNotes.length > 0 ? selectedNotes : selectedNote ? [selectedNote] : [];
      if (!visualSelectionOnly) {
        targets.forEach((target, index) => {
          const rendered = findRenderedSelectionTarget(target, renderedNotesRef.current, coreDocument);
          const renderedIdentity = rendered ? getRenderedVisualIdentity(rendered) : null;
          if (dbg.enabled()) {
            const sameTintTargets = rendered
              ? renderedNotesRef.current.filter((entry) => getRenderedVisualIdentity(entry) === renderedIdentity)
              : [];
            const logSignature = [
              target.measureNumber,
              target.staffIndex,
              target.voiceId,
              target.timestampNum,
              target.timestampDen,
              target.step,
              target.octave,
              target.alter,
              rendered?.id ?? 'none',
              sameTintTargets.length,
            ].join('|');
            if (lastSelectionHighlightLogRef.current !== logSignature) {
              lastSelectionHighlightLogRef.current = logSignature;
              dbg.score(`selection highlight match ${JSON.stringify({
                target: `${target.measureNumber}:${target.staffIndex}:${target.voiceId}@${target.timestampNum}/${target.timestampDen}:${target.isRest ? 'rest' : `${target.step}${target.alter === 1 ? '#' : target.alter === -1 ? 'b' : ''}${target.octave}`}`,
                renderedId: rendered?.id ?? null,
                renderedPitch: rendered
                  ? (rendered.note.isRest ? 'rest' : `${rendered.note.step}${rendered.note.alter === 1 ? '#' : rendered.note.alter === -1 ? 'b' : ''}${rendered.note.octave}`)
                  : null,
                domCenter: rendered ? {
                  x: Math.round(rendered.domCenter.x),
                  y: Math.round(rendered.domCenter.y),
                } : null,
                visualIdentity: rendered
                  ? (typeof renderedIdentity === 'string' ? renderedIdentity : describeSvgElement(renderedIdentity))
                  : null,
                sameTintTargetCount: sameTintTargets.length,
              })}`);
            }
          }
          tintAndTrackRenderedNote(rendered ? getEffectiveTintElement(rendered) : null, index === targets.length - 1 ? '#1a56db' : '#1d4ed8');
          const guitarFretText = findRenderedGuitarFretTextElement({
            coreDocument,
            container: containerRef.current,
            measureOverlays: measureLayoutOverlaysRef.current,
            note: target,
          });
          if (guitarFretText) {
            tintAndTrackGuitarFretElement(guitarFretText, index === targets.length - 1 ? '#1a56db' : '#1d4ed8');
          }
        });
      }
      activeVisualTargets.forEach((element) => tintAndTrackVisualElement(element, '#1a56db'));
    }

    tintedRenderedNoteElementsRef.current = [...tintedRenderedNoteElements];
    tintedVisualElementsRef.current = [...tintedVisualElements];
    tintedGuitarFretElementsRef.current = [...tintedGuitarFretElements];

    return clearActiveScoreTints;
  }, [activeVisualTargets, clearActiveScoreTints, coreDocument, noteInputAnchor, noteInputMode, playbackActive, playbackPlayhead, selectedNote, selectedNotes, visualSelectionOnly, xml]);

  // Attach/detach pointer listener on the window so clicks always arrive even
  // when OSMD's inner <svg> elements swallow the event. The handler itself
  // ignores anything outside the score container. Keep the native listeners
  // stable and dispatch through render-updated refs so a pointerdown that lands
  // after React commits new score geometry cannot run the previous document's
  // validation closure while passive effects are still being refreshed.
  useEffect(() => {
    const dispatchPointerDown = (event: PointerEvent) => {
      handlePointerDownRef.current?.(event);
    };
    const dispatchDoubleClick = (event: MouseEvent) => {
      handleDoubleClickRef.current?.(event);
    };
    window.addEventListener('pointerdown', dispatchPointerDown, true);
    window.addEventListener('dblclick', dispatchDoubleClick, true);
    return () => {
      window.removeEventListener('pointerdown', dispatchPointerDown, true);
      window.removeEventListener('dblclick', dispatchDoubleClick, true);
    };
  }, []);

  useEffect(() => {
    const handlePointerUp = (event: PointerEvent) => {
      if (event.pointerType === 'touch' || event.pointerType === 'pen') {
        flushPendingTabletPointerMove();
      }
      const tabletSession = tabletEntrySessionRef.current;
      if (tabletSession && event.pointerId === tabletSession.pointerId) {
        const committed = commitTabletEntrySession(tabletSession);
        tabletEntrySessionRef.current = null;
        if (viewportRef.current?.hasPointerCapture(event.pointerId)) {
          viewportRef.current.releasePointerCapture(event.pointerId);
        }
        setTabletEntryVisual({
          phase: committed.session.phase,
          pointerType: tabletSession.pointerType,
          point: tabletSession.latestPoint,
        });
        setGhostNoteTarget(null);
        visibleGhostPointerLockRef.current = null;
        lastGhostStaffIndexRef.current = null;
        if (!committed.target) return;

        // Take-off selection: this is the exact object stored with the last
        // validated preview. Pointer-up coordinates are intentionally ignored.
        const pitchKey = `${committed.target.step}:${committed.target.alter}:${committed.target.octave}`;
        // Contact/refinement already sounded this pitch. Do not retrigger it
        // on takeoff; a final pitch not yet auditioned still needs feedback.
        onPlaceNoteAtRef.current(committed.target, {
          audition: tabletSession.lastAuditionedPitch !== pitchKey,
        });
        lastNoteInputCommitTargetRef.current = {
          measureId: committed.target.measureId,
          corePartId: committed.target.corePartId,
          measureNumber: committed.target.measureNumber,
          staffIndex: committed.target.staffIndex,
          voiceId: committed.target.voiceId,
          timestampNum: committed.target.timestampNum,
          timestampDen: committed.target.timestampDen,
        };
        lastPlacementClientRef.current = {
          x: tabletSession.latestPoint.x,
          y: tabletSession.latestPoint.y,
        };
        lastPlacementMeasureIdRef.current = tabletSession.lastValidatedPreview.measureId;
        lastPointerClientRef.current = null;
        lastAdvancedGhostAnchorRef.current = null;
        scheduleRenderedGeometryRefresh();
        return;
      }
      const dragSession = dragSessionRef.current;
      if (!dragSession || event.pointerId !== dragSession.pointerId) return;
      if (viewportRef.current?.hasPointerCapture(event.pointerId)) {
        viewportRef.current.releasePointerCapture(event.pointerId);
      }
      const resolvedPitch = dragSession.lastResolvedPitch;
      dragSessionRef.current = null;
      setDragPreviewTarget(null);
      lastGhostStaffIndexRef.current = null;
      if (dragSession.tabDrag) {
        const resolvedGuitar = dragSession.lastResolvedGuitar;
        if (
          dragSession.dragStarted
          && resolvedGuitar
          && (resolvedGuitar.string !== dragSession.note.guitar?.string
            || resolvedGuitar.fret !== dragSession.note.guitar?.fret)
        ) {
          onDragStringCommit?.({
            note: dragSession.note,
            string: resolvedGuitar.string,
            fret: resolvedGuitar.fret,
          });
        }
        return;
      }
      if (dragSession.dragStarted && resolvedPitch) {
        onDragTransposeCommit?.({
          note: dragSession.note,
          step: resolvedPitch.step,
          alter: resolvedPitch.alter,
          octave: resolvedPitch.octave,
          mode: dragTransposeMode,
        });
      }
    };

    const handlePointerCancel = (event: PointerEvent) => {
      if (event.pointerType === 'touch' || event.pointerType === 'pen') {
        discardPendingTabletPointerMove();
      }
      const tabletSession = tabletEntrySessionRef.current;
      if (tabletSession && event.pointerId === tabletSession.pointerId) {
        const cancelled = cancelTabletEntrySession(tabletSession);
        tabletEntrySessionRef.current = null;
        if (viewportRef.current?.hasPointerCapture(event.pointerId)) {
          viewportRef.current.releasePointerCapture(event.pointerId);
        }
        setTabletEntryVisual({
          phase: cancelled.phase,
          pointerType: cancelled.pointerType,
          point: cancelled.latestPoint,
        });
        setGhostNoteTarget(null);
        visibleGhostPointerLockRef.current = null;
        lastGhostStaffIndexRef.current = null;
        return;
      }
      const dragSession = dragSessionRef.current;
      if (!dragSession || event.pointerId !== dragSession.pointerId) return;
      if (viewportRef.current?.hasPointerCapture(event.pointerId)) {
        viewportRef.current.releasePointerCapture(event.pointerId);
      }
      dragSessionRef.current = null;
      setDragPreviewTarget(null);
      lastGhostStaffIndexRef.current = null;
    };

    const cancelActiveGestures = () => {
      discardPendingTabletPointerMove();
      const tablet = tabletEntrySessionRef.current;
      const drag = dragSessionRef.current;
      // Null the sessions before releasing capture: lostpointercapture may fire synchronously.
      tabletEntrySessionRef.current = null;
      dragSessionRef.current = null;
      for (const pointerId of new Set([tablet?.pointerId, drag?.pointerId])) {
        if (pointerId != null && viewportRef.current?.hasPointerCapture(pointerId)) {
          viewportRef.current.releasePointerCapture(pointerId);
        }
      }
      if (tablet) setTabletEntryVisual({ phase: 'cancelled', pointerType: tablet.pointerType, point: tablet.latestPoint });
      visibleGhostPointerLockRef.current = null;
      lastGhostStaffIndexRef.current = null;
      setGhostNoteTarget(null);
      setDragPreviewTarget(null);
    };
    const handleVisibilityChange = () => {
      if (document.visibilityState === 'hidden') cancelActiveGestures();
    };
    window.addEventListener('blur', cancelActiveGestures);
    document.addEventListener('visibilitychange', handleVisibilityChange);
    window.addEventListener('pointerup', handlePointerUp, true);
    window.addEventListener('pointercancel', handlePointerCancel, true);
    const viewport = viewportRef.current;
    const handleLostPointerCapture = (event: PointerEvent) => {
      discardPendingTabletPointerMove();
      const tabletSession = tabletEntrySessionRef.current;
      if (tabletSession && event.pointerId === tabletSession.pointerId) {
        const cancelled = cancelTabletEntrySession(tabletSession);
        tabletEntrySessionRef.current = null;
        setTabletEntryVisual({
          phase: cancelled.phase,
          pointerType: cancelled.pointerType,
          point: cancelled.latestPoint,
        });
        setGhostNoteTarget(null);
        visibleGhostPointerLockRef.current = null;
        lastGhostStaffIndexRef.current = null;
      }
      // Existing-note drags have their own session, including mouse and TAB
      // drags. Capture loss abandons that gesture before any later release.
      if (dragSessionRef.current?.pointerId === event.pointerId) {
        dragSessionRef.current = null;
        setDragPreviewTarget(null);
        lastGhostStaffIndexRef.current = null;
      }
    };
    viewport?.addEventListener('lostpointercapture', handleLostPointerCapture);
    return () => {
      window.removeEventListener('blur', cancelActiveGestures);
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      window.removeEventListener('pointerup', handlePointerUp, true);
      window.removeEventListener('pointercancel', handlePointerCancel, true);
      viewport?.removeEventListener('lostpointercapture', handleLostPointerCapture);
    };
  }, [discardPendingTabletPointerMove, dragTransposeMode, flushPendingTabletPointerMove, onDragTransposeCommit, onDragStringCommit, scheduleRenderedGeometryRefresh]);

  useEffect(() => {
    if (noteInputMode) return;
    discardPendingTabletPointerMove();
    const tabletSession = tabletEntrySessionRef.current;
    if (tabletSession) {
      const cancelled = cancelTabletEntrySession(tabletSession);
      tabletEntrySessionRef.current = null;
      if (viewportRef.current?.hasPointerCapture(tabletSession.pointerId)) {
        viewportRef.current.releasePointerCapture(tabletSession.pointerId);
      }
      setTabletEntryVisual({
        phase: cancelled.phase,
        pointerType: cancelled.pointerType,
        point: cancelled.latestPoint,
      });
    } else {
      setTabletEntryVisual({ phase: 'idle', pointerType: null, point: null });
    }
    visibleGhostPointerLockRef.current = null;
    lastTabletStaffSwitchPulseRef.current = 0;
    lastGhostStaffIndexRef.current = null;
    dragSessionRef.current = null;
    setGhostNoteTarget(null);
    setDragPreviewTarget(null);
  }, [discardPendingTabletPointerMove, noteInputMode]);

  useEffect(() => discardPendingTabletPointerMove, [discardPendingTabletPointerMove]);

  useEffect(() => {
    if (!noteInputMode) return;
    if (selectedMeasureIdsRef.current.length === 0) return;
    dbg.score('measure selection clear → note input suppresses measure overlay');
    applyMeasureSelection([], null);
  }, [applyMeasureSelection, noteInputMode]);

  useEffect(() => {
    const clearVisualAndMeasureSelection = () => {
      activeVisualTargetsRef.current.forEach((element) => tintSvgElement(element, null));
      activeVisualTargetsRef.current = [];
      setActiveVisualTargets([]);
      setVisualSelectionOnly(false);
      applyMeasureSelection([], null);
    };

    window.addEventListener('nex-note:semantic-selection-navigation', clearVisualAndMeasureSelection);
    return () => window.removeEventListener('nex-note:semantic-selection-navigation', clearVisualAndMeasureSelection);
  }, [applyMeasureSelection]);

  // When multiple notes are selected (Shift+click range), derive the measure overlay
  // from the coreMeasureIds of those notes. This is more reliable than computing
  // the range by measureNumber in the pointer handler.
  useEffect(() => {
    if (selectedNotes.length <= 1) return;
    if (isSingleOnsetSelection(selectedNotes)) {
      if (selectedMeasureIdsRef.current.length > 0) {
        dbg.score('measure selection clear → simultaneous note selection suppresses measure overlay');
        applyMeasureSelection([], null);
      }
      return;
    }

    const coreMeasureIds = new Set(
      selectedNotes.map((n) => n.coreMeasureId).filter((id): id is string => id != null),
    );
    if (coreMeasureIds.size === 0) return;

    const rangeIds = measureLayoutOverlays
      .filter((o) => coreMeasureIds.has(o.measureId))
      .map((o) => o.measureId);
    if (rangeIds.length === 0) return;

    const lastNote = selectedNotes[selectedNotes.length - 1];
    const anchorId = lastNote.coreMeasureId ?? rangeIds[rangeIds.length - 1];
    applyMeasureSelection(rangeIds, anchorId);
  }, [applyMeasureSelection, measureLayoutOverlays, selectedNotes]);

  useEffect(() => {
    if (!selectedNote || selectedNotes.length > 1) return;
    if (selectedMeasureIdsRef.current.length === 0) return;
    dbg.score('measure selection clear → focused single note suppresses measure overlay');
    applyMeasureSelection([], null);
  }, [applyMeasureSelection, selectedNote, selectedNotes.length]);

  useEffect(() => {
    const validMeasureIds = new Set(measureLayoutOverlays.map((overlay) => overlay.measureId));
    const nextSelected = selectedMeasureIds.filter((measureId) => validMeasureIds.has(measureId));
    const nextAnchor = lastSelectedMeasureId && validMeasureIds.has(lastSelectedMeasureId)
      ? lastSelectedMeasureId
      : (nextSelected[nextSelected.length - 1] ?? null);

    dbg.score(
      `measure selection reconcile → overlays=${measureLayoutOverlays.length} `
      + `selectedBefore=[${selectedMeasureIds.join(', ')}] selectedAfter=[${nextSelected.join(', ')}] `
      + `anchorBefore=${lastSelectedMeasureId ?? 'null'} anchorAfter=${nextAnchor ?? 'null'}`,
    );
    if (
      nextSelected.length !== selectedMeasureIds.length
      || nextSelected.some((measureId, index) => measureId !== selectedMeasureIds[index])
      || nextAnchor !== lastSelectedMeasureId
    ) {
      applyMeasureSelection(nextSelected, nextAnchor);
    }
  }, [applyMeasureSelection, lastSelectedMeasureId, measureLayoutOverlays, selectedMeasureIds]);

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      const activeElement = document.activeElement as HTMLElement | null;
      const viewport = viewportRef.current;
      const focusInsideScore = Boolean(viewport && activeElement && viewport.contains(activeElement));
      const target = event.target as HTMLElement | null;
      const typingTarget = Boolean(target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable));

      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'f') {
        if (typingTarget && target !== findInputRef.current) return;
        event.preventDefault();
        setFindVisible(true);
        return;
      }

      if (!focusInsideScore && target !== findInputRef.current) return;

      if (event.key === 'Escape') {
        event.preventDefault();
        const tabletSession = tabletEntrySessionRef.current;
        if (tabletSession) {
          const cancelled = cancelTabletEntrySession(tabletSession);
          tabletEntrySessionRef.current = null;
          if (viewport?.hasPointerCapture(tabletSession.pointerId)) {
            viewport.releasePointerCapture(tabletSession.pointerId);
          }
          setTabletEntryVisual({
            phase: cancelled.phase,
            pointerType: cancelled.pointerType,
            point: cancelled.latestPoint,
          });
          setGhostNoteTarget(null);
          visibleGhostPointerLockRef.current = null;
          lastGhostStaffIndexRef.current = null;
          return;
        }
        if (findVisible) {
          setFindVisible(false);
          setFindStatus(null);
          return;
        }
        applyMeasureSelection([], null);
        onNoteClick(null);
        return;
      }

      if (target === findInputRef.current) {
        if (event.key === 'Enter') {
          event.preventDefault();
          submitFind(findQuery);
        }
        return;
      }

      if (!viewport) return;
      const screenStepY = Math.max(Math.round(viewport.clientHeight * 0.9), 120);
      const pageStepY = Math.max(viewport.clientHeight, 200);
      const horizontalStep = Math.max(Math.round(viewport.clientWidth * 0.9), 120);

      if ((event.ctrlKey || event.metaKey) && event.key === '0') {
        event.preventDefault();
        setZoom(100);
        return;
      }
      if ((event.ctrlKey || event.metaKey) && (event.key === '+' || event.key === '=')) {
        event.preventDefault();
        adjustZoom(ZOOM_STEP);
        return;
      }
      if ((event.ctrlKey || event.metaKey) && event.key === '-') {
        event.preventDefault();
        adjustZoom(-ZOOM_STEP);
        return;
      }
      if (event.key === 'PageDown') {
        event.preventDefault();
        viewport.scrollBy({ top: event.ctrlKey || event.metaKey ? pageStepY : screenStepY, behavior: 'smooth' });
        return;
      }
      if (event.key === 'PageUp') {
        event.preventDefault();
        viewport.scrollBy({ top: -(event.ctrlKey || event.metaKey ? pageStepY : screenStepY), behavior: 'smooth' });
        return;
      }
      if (event.key === 'Home') {
        event.preventDefault();
        if (event.ctrlKey || event.metaKey) return;
        viewport.scrollTo({ left: 0, top: 0, behavior: 'smooth' });
        return;
      }
      if (event.key === 'End') {
        event.preventDefault();
        if (event.ctrlKey || event.metaKey) return;
        viewport.scrollTo({
          left: viewport.scrollLeft,
          top: Math.max(viewport.scrollHeight - viewport.clientHeight, 0),
          behavior: 'smooth',
        });
        return;
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [adjustZoom, applyMeasureSelection, findQuery, findVisible, onNoteClick, setZoom, submitFind]);

  useEffect(() => {
    if (!onMeasureSelectionChange) return;
    const selectedOverlays = measureLayoutOverlays.filter((overlay) => visibleMeasureSelectionIds.includes(overlay.measureId));
    const measureNumbers = Array.from(new Set(selectedOverlays.map((overlay) => overlay.measureNumber)));
    const prev = lastEmittedMeasureSelectionRef.current;
    const idsChanged = prev.measureIds.length !== visibleMeasureSelectionIds.length
      || prev.measureIds.some((measureId, index) => measureId !== visibleMeasureSelectionIds[index]);
    const numbersChanged = prev.measureNumbers.length !== measureNumbers.length
      || prev.measureNumbers.some((measureNumber, index) => measureNumber !== measureNumbers[index]);
    if (!idsChanged && !numbersChanged) return;
    lastEmittedMeasureSelectionRef.current = {
      measureIds: [...visibleMeasureSelectionIds],
      measureNumbers: [...measureNumbers],
    };
    onMeasureSelectionChange({
      measureIds: [...visibleMeasureSelectionIds],
      measureNumbers,
    });
  }, [measureLayoutOverlays, onMeasureSelectionChange, visibleMeasureSelectionIds]);

  useEffect(() => {
    if (clearMeasureSelectionSignal === 0) return;
    if (selectedMeasureIdsRef.current.length === 0) return;
    dbg.score(`measure clear → external signal ${clearMeasureSelectionSignal}`);
    applyMeasureSelection([], null);
  }, [applyMeasureSelection, clearMeasureSelectionSignal]);

  useEffect(() => {
    if (!dbg.enabled()) return;
    const target = dragPreviewTarget ?? ghostNoteTarget;
    if (!target) return;
    dbg.score(`ghost overlay render ${JSON.stringify({
      measure: target.measureNumber,
      ts: `${target.timestampNum}/${target.timestampDen}`,
      pitch: `${target.step}${target.alter === 1 ? '#' : target.alter === -1 ? 'b' : ''}${target.octave}`,
      previewLeft: Math.round(target.previewLeft),
      previewTop: Math.round(target.previewTop),
      previewWidth: Math.round(target.previewWidth),
      previewHeight: Math.round(target.previewHeight),
      layerOffsetX: Math.round(overlayLayerOffset.x),
      layerOffsetY: Math.round(overlayLayerOffset.y),
      drag: Boolean(dragPreviewTarget),
      noteInputMode,
    })}`);
  }, [dragPreviewTarget, ghostNoteTarget, noteInputMode, overlayLayerOffset]);

  const durationInputPitchCursorTarget = useMemo<GhostNoteTarget | null>(() => {
    if (
      !inputByDurationMode
      || !preparedDurationActivePitch
      || !noteInputAnchor?.coreMeasureId
    ) return null;
    const anchorPoint = findRenderedGhostPointForAnchor(
      renderedGhostGridRef.current,
      noteInputAnchor,
    );
    if (!anchorPoint) return null;
    const overlay = measureLayoutOverlays.find((entry) => entry.measureId === noteInputAnchor.coreMeasureId) ?? null;
    const staffCandidates = (staffDetailsByMeasureRef.current.get(noteInputAnchor.measureNumber) ?? [])
      .filter((entry) => entry.staffIndex === noteInputAnchor.staffIndex);
    const staff = staffCandidates.find((entry) => (
      noteInputAnchor.corePartId && entry.corePartId === noteInputAnchor.corePartId
    )) ?? staffCandidates.sort((left, right) => (
      Math.abs(((left.topLineDomY + left.bottomLineDomY) / 2) - anchorPoint.domY)
      - Math.abs(((right.topLineDomY + right.bottomLineDomY) / 2) - anchorPoint.domY)
    ))[0] ?? null;
    if (!staff) return null;

    const clef = resolveClefAtMeasure(coreDocument, noteInputAnchor.measureNumber, noteInputAnchor.staffIndex, {
      corePartId: noteInputAnchor.corePartId,
      measureId: noteInputAnchor.coreMeasureId,
    });
    const staffStep = topLineDiatonicIndex(clef)
      - diatonicPitchIndex(preparedDurationActivePitch.step, preparedDurationActivePitch.octave);
    const snappedY = staff.topLineDomY + (staffStep * (staff.lineDistanceDom / 2));
    const stemDirection = resolvePreviewStemDirection({ staffStep, voiceId: selectedVoice });
    const previewMetrics = buildGhostPreviewMetrics(
      anchorPoint.domX,
      snappedY,
      preparedDurationActivePitch.alter,
      isDotted,
      selectedDuration,
      stemDirection,
    );

    return {
      measureId: noteInputAnchor.coreMeasureId,
      corePartId: noteInputAnchor.corePartId ?? anchorPoint.corePartId ?? null,
      measureNumber: noteInputAnchor.measureNumber,
      pageIndex: overlay?.pageIndex ?? anchorPoint.pageIndex ?? null,
      systemIndex: overlay?.systemIndex ?? anchorPoint.systemIndex ?? null,
      staffIndex: noteInputAnchor.staffIndex,
      voiceId: selectedVoice,
      timestampNum: noteInputAnchor.timestampNum,
      timestampDen: noteInputAnchor.timestampDen,
      step: preparedDurationActivePitch.step,
      octave: preparedDurationActivePitch.octave,
      alter: preparedDurationActivePitch.alter,
      domCenter: { x: anchorPoint.domX, y: snappedY },
      domRect: { x: anchorPoint.domX - 6, y: snappedY - 6, width: 12, height: 12 },
      pointerX: anchorPoint.domX,
      previewLeft: previewMetrics.previewLeft,
      previewTop: previewMetrics.previewTop,
      previewWidth: previewMetrics.previewWidth,
      previewHeight: previewMetrics.previewHeight,
      accidentalOffsetX: previewMetrics.accidentalOffsetX,
      noteheadCenterX: previewMetrics.noteheadCenterX,
      stemDirection,
      placementMode: 'insert',
      placementAnchorIsRest: noteInputAnchor.isRest,
      semanticAnchorIsRest: noteInputAnchor.isRest,
      semanticAnchorLabel: semanticAnchorLabel(noteInputAnchor),
      ledgerLines: buildLedgerLineSegments({
        staffStep,
        lineCount: staff.lineCount,
        topLineDomY: staff.topLineDomY,
        lineDistanceDom: staff.lineDistanceDom,
        previewTop: previewMetrics.previewTop,
        noteheadCenterX: previewMetrics.noteheadCenterX,
      }),
      cursorOnly: true,
      snapResolution: {
        resolver: 'input-by-duration-cursor',
        rawPointerX: roundTraceNumber(anchorPoint.domX),
      },
    };
  }, [coreDocument, inputByDurationMode, isDotted, measureLayoutOverlays, noteInputAnchor, preparedDurationActivePitch, renderViewportRevision, selectedDuration, selectedVoice]);

  const rawSemanticAnchorTarget = dragPreviewTarget
    ?? (inputByDurationMode
      ? durationInputPitchCursorTarget ?? ghostNoteTarget
      : ghostNoteTarget);
  // TAB string-drag previews are pinned to a rendered TAB note; the rendered
  // snap grid only models notation staves and would discard or move them.
  const isTabStringDragPreview = dragPreviewTarget?.tabFret != null;
  const activeSemanticAnchorTarget = isTabStringDragPreview
    ? rawSemanticAnchorTarget
    : discardGhostTargetOffRenderedSnap(
        alignReplaceGhostToRenderedSnap(
          rawSemanticAnchorTarget,
          renderedGhostGridRef.current,
        ),
        renderedGhostGridRef.current,
      );
  const semanticAnchorDebugBoxes = semanticGridDebugEnabled
    ? buildSemanticAnchorDebugBoxes({
        ghostIndex: ghostNoteIndexRef.current,
        container: containerRef.current,
        measureOverlays: measureLayoutOverlays,
        coreDocument,
        staffDetailsByMeasure: staffDetailsByMeasureRef.current,
        viewportBox,
        graceEventIds,
      })
    : [];
  const semanticMeasureGuardDebugLines = semanticGridDebugEnabled
    ? buildSemanticMeasureGuardDebugLines(semanticAnchorDebugBoxes)
    : [];
  const semanticOverlapDebugRects = semanticGridDebugEnabled
    ? buildSemanticOverlapDebugRects(semanticAnchorDebugBoxes)
    : [];
  const semanticProtectedDebugRects = semanticGridDebugEnabled
    ? buildSemanticProtectedDebugRects(semanticAnchorDebugBoxes)
    : [];
  const semanticSnapDebugPoints = semanticGridDebugEnabled
    ? buildSemanticSnapDebugPoints({
        renderedGhostGrid: renderedGhostGridRef.current,
        measureOverlays: measureLayoutOverlays,
        staffDetailsByMeasure: staffDetailsByMeasureRef.current,
        anchorBoxes: semanticAnchorDebugBoxes,
        activeTarget: activeSemanticAnchorTarget,
        viewportBox,
      })
    : [];
  const semanticSnapColumnDebugLines = semanticGridDebugEnabled
    ? buildSemanticSnapColumnDebugLines({
        snapPoints: semanticSnapDebugPoints,
        systemOverlays: systemLayoutOverlays,
        measureOverlays: measureLayoutOverlays,
        viewportBox,
      })
    : [];
  const semanticPitchDebugBands = semanticGridDebugEnabled
    ? buildSemanticPitchDebugBands({
      measureOverlays: measureLayoutOverlays,
      staffDetailsByMeasure: staffDetailsByMeasureRef.current,
      coreDocument,
      boxes: semanticAnchorDebugBoxes,
      viewportBox,
    })
    : [];
  const visibleScoreInputTarget = !isTabStringDragPreview
    && !activeSemanticAnchorTarget?.cursorOnly
    && (ghostTargetOverlapsProtectedRect(
      activeSemanticAnchorTarget,
      semanticProtectedDebugRects,
    ) || ghostTargetOverlapsBarlineGuard(activeSemanticAnchorTarget, measureLayoutOverlays)
      || ghostTargetOverlapsLeadingTimeSignatureGuard(activeSemanticAnchorTarget, measureLayoutOverlays))
    ? null
    : activeSemanticAnchorTarget;
  const scoreInputLeadingGuardOverlay = activeSemanticAnchorTarget
    ? measureLayoutOverlays.find((overlay) => (
        overlay.measureId === activeSemanticAnchorTarget.measureId
        || (
          overlay.measureNumber === activeSemanticAnchorTarget.measureNumber
          && (activeSemanticAnchorTarget.systemIndex == null || overlay.systemIndex === activeSemanticAnchorTarget.systemIndex)
        )
      )) ?? null
    : null;
  const scoreInputLeadingGuardRightX = scoreInputLeadingGuardOverlay
    && shouldProtectLeadingMeasureModifiers({
      overlay: scoreInputLeadingGuardOverlay,
      entries: [],
      allOverlays: measureLayoutOverlays,
    })
    ? leadingTimeSignatureGuardRightX(scoreInputLeadingGuardOverlay)
    : null;

  useEffect(() => {
    const debugEnabled = dbg.enabled();
    if ((!semanticGridDebugEnabled && !(debugEnabled && semanticGridReady)) || typeof window === 'undefined') return;
    const report = buildSemanticGridDebugReport(
      semanticAnchorDebugBoxes,
      coreDocument,
      semanticSnapDebugPoints,
      semanticPitchDebugBands,
    );
    const activeAnchorReport = buildSemanticActiveAnchorDebugReport(
      semanticAnchorDebugBoxes,
      activeSemanticAnchorTarget,
      semanticSnapDebugPoints,
    );
    const reportWithActive = {
      ...report,
      issueCount: report.issueCount + activeAnchorReport.issueCount,
      issues: [...report.issues, ...activeAnchorReport.issues],
      activeAnchor: activeAnchorReport,
    };
    const target = window as typeof window & {
      __NEX_NOTE_SEMANTIC_GRID__?: typeof reportWithActive;
      __NEX_NOTE_SEMANTIC_GRID_ERRORS__?: unknown;
      __NEX_NOTE_SEMANTIC_GRID_ERROR_HISTORY__?: unknown[];
      __NEX_NOTE_SNAP_DEBUG__?: unknown;
      __NEX_NOTE_GHOST_SNAP_TRACE__?: GhostSnapResolutionTrace | null;
      __NEX_NOTE_GHOST_SNAP_TRACE_HISTORY__?: GhostSnapResolutionTrace[];
      copySemanticGridDebug?: () => Promise<void>;
      copySemanticGridErrors?: () => Promise<void>;
      copySemanticGridErrorHistory?: () => Promise<void>;
      startSemanticGridCodex?: () => Promise<unknown>;
      copySnapDebug?: () => Promise<void>;
      copyGhostSnapTrace?: () => Promise<void>;
      showSemanticGridErrors?: () => unknown;
      hideSemanticGridErrors?: () => void;
    };
    target.__NEX_NOTE_SEMANTIC_GRID__ = reportWithActive;
    target.__NEX_NOTE_SNAP_DEBUG__ = report.snapDebug;
    const diagnosticGhostTarget = discardGhostTargetOffRenderedSnap(
      activeSemanticAnchorTarget,
      renderedGhostGridRef.current,
    );
    target.__NEX_NOTE_GHOST_SNAP_TRACE__ = diagnosticGhostTarget?.snapResolution ?? null;
    target.__NEX_NOTE_GHOST_SNAP_TRACE_HISTORY__ = ghostSnapTraceHistoryRef.current;
    target.copySemanticGridDebug = async () => {
      const text = JSON.stringify(target.__NEX_NOTE_SEMANTIC_GRID__ ?? reportWithActive, null, 2);
      await writeTextToClipboard(text);
    };
    target.copySnapDebug = async () => {
      const text = JSON.stringify(target.__NEX_NOTE_SNAP_DEBUG__ ?? report.snapDebug, null, 2);
      await writeTextToClipboard(text);
    };
    target.copyGhostSnapTrace = async () => {
      const text = JSON.stringify({
        active: target.__NEX_NOTE_GHOST_SNAP_TRACE__ ?? null,
        history: target.__NEX_NOTE_GHOST_SNAP_TRACE_HISTORY__ ?? ghostSnapTraceHistoryRef.current,
      }, null, 2);
      await writeTextToClipboard(text);
    };
    let activeGhostSnapTrace: GhostSnapResolutionTrace | null = diagnosticGhostTarget?.snapResolution ?? null;
    const ghostDiagnostics = (() => {
      const ghost = diagnosticGhostTarget;
      if (!ghost) return [];
      const entries: Array<{
        kind: 'ghost-diagnostic';
        level: 'error';
        code: string;
        message: string;
      }> = [];
      const pointerX = typeof ghost.pointerX === 'number' && Number.isFinite(ghost.pointerX)
        ? ghost.pointerX
        : null;
      const ghostX = ghost.domCenter.x;
      const visibleNoteheadX = ghostVisibleNoteheadCenterX(ghost);
      const resolvedX = ghost.resolvedTarget?.domX != null && Number.isFinite(ghost.resolvedTarget.domX)
        ? ghost.resolvedTarget.domX
        : null;
      const snapPoints = filterSelectableRenderedGhostSnapPoints(
        getRenderedGhostStaffPoints(renderedGhostGridRef.current, ghost.measureId, ghost.staffIndex),
      );
      const snapPointsByTimestamp = new Map<string, typeof snapPoints>();
      for (const point of snapPoints) {
        const timestamp = normalizeFraction(point.timestampNum, Math.max(point.timestampDen, 1));
        const key = [
          point.voiceId,
          timestamp.num,
          timestamp.den,
        ].join(':');
        const group = snapPointsByTimestamp.get(key) ?? [];
        group.push(point);
        snapPointsByTimestamp.set(key, group);
      }
      for (const group of snapPointsByTimestamp.values()) {
        const distinctXs = [...new Set(group.map((point) => Math.round(point.domX * 2) / 2))].sort((left, right) => left - right);
        if (distinctXs.length <= 1) continue;
        const first = group[0]!;
        entries.push({
          kind: 'ghost-diagnostic',
          level: 'error',
          code: 'ghost_duplicate_snap_points',
          message: [
            'Multiple snap X positions exist for the same timestamp.',
            `measure=${first.measureNumber}`,
            `staff=${first.staffIndex}`,
            `voice=${first.voiceId}`,
            `timestamp=${first.timestampNum}/${first.timestampDen}`,
            `snapXs=${distinctXs.map((x) => Math.round(x * 100) / 100).join(',')}`,
            `mode=${ghost.placementMode}`,
          ].join(' '),
        });
      }
      const matchingSnapPoints = snapPoints.filter((point) => (
        timestampsEqual(point.timestampNum, point.timestampDen, ghost.timestampNum, ghost.timestampDen)
      ));
      const nearestMatchingSnap = matchingSnapPoints.reduce<(typeof matchingSnapPoints)[number] | null>((best, point) => {
        if (!best) return point;
        return Math.abs(point.domX - ghostX) < Math.abs(best.domX - ghostX) ? point : best;
      }, null);
      const traceQuantizedRestFallbackMatchesGhost = ghostHasTraceQuantizedRestFallbackSnap(ghost);
      const traceQuantizedRestFallback = traceQuantizedRestFallbackMatchesGhost
        ? ghost.snapResolution?.quantizedFallbackSnap ?? null
        : null;
      let resolvedMatchingSnapForTrace: RenderedGhostGridPoint | null = null;
      if (snapPoints.length > 0 && matchingSnapPoints.length === 0 && !traceQuantizedRestFallbackMatchesGhost) {
        const nearestAny = snapPoints.reduce<(typeof snapPoints)[number] | null>((best, point) => {
          if (!best) return point;
          return Math.abs(point.domX - ghostX) < Math.abs(best.domX - ghostX) ? point : best;
        }, null);
        entries.push({
          kind: 'ghost-diagnostic',
          level: 'error',
          code: 'ghost_timestamp_not_in_snap_grid',
          message: [
            'Ghost timestamp is not represented by the active snap grid.',
            `measure=${ghost.measureNumber}`,
            `staff=${ghost.staffIndex}`,
            `voice=${ghost.voiceId}`,
            `timestamp=${ghost.timestampNum}/${ghost.timestampDen}`,
            `ghostX=${Math.round(ghostX * 100) / 100}`,
            nearestAny ? `nearestSnap=${nearestAny.timestampNum}/${nearestAny.timestampDen}@${Math.round(nearestAny.domX * 100) / 100}` : 'nearestSnap=none',
            `mode=${ghost.placementMode}`,
          ].join(' '),
        });
      }
      if (nearestMatchingSnap && Math.abs(nearestMatchingSnap.domX - ghostX) > 7) {
        entries.push({
          kind: 'ghost-diagnostic',
          level: 'error',
          code: 'ghost_x_not_on_snap_grid',
          message: [
            `Ghost X is ${Math.round(Math.abs(nearestMatchingSnap.domX - ghostX) * 100) / 100}px away from the snap grid point for its timestamp.`,
            `measure=${ghost.measureNumber}`,
            `staff=${ghost.staffIndex}`,
            `voice=${ghost.voiceId}`,
            `timestamp=${ghost.timestampNum}/${ghost.timestampDen}`,
            `ghostX=${Math.round(ghostX * 100) / 100}`,
            `snapX=${Math.round(nearestMatchingSnap.domX * 100) / 100}`,
            `snapSynthetic=${nearestMatchingSnap.synthetic}`,
            `mode=${ghost.placementMode}`,
          ].join(' '),
        });
      }
      if (nearestMatchingSnap && Math.abs(nearestMatchingSnap.domX - visibleNoteheadX) > 7) {
        entries.push({
          kind: 'ghost-diagnostic',
          level: 'error',
          code: 'ghost_preview_x_not_on_snap_grid',
          message: [
            `Visible ghost notehead X is ${Math.round(Math.abs(nearestMatchingSnap.domX - visibleNoteheadX) * 100) / 100}px away from the snap grid point for its timestamp.`,
            `measure=${ghost.measureNumber}`,
            `staff=${ghost.staffIndex}`,
            `voice=${ghost.voiceId}`,
            `timestamp=${ghost.timestampNum}/${ghost.timestampDen}`,
            `visibleNoteheadX=${Math.round(visibleNoteheadX * 100) / 100}`,
            `ghostX=${Math.round(ghostX * 100) / 100}`,
            `snapX=${Math.round(nearestMatchingSnap.domX * 100) / 100}`,
            `snapSynthetic=${nearestMatchingSnap.synthetic}`,
            `mode=${ghost.placementMode}`,
          ].join(' '),
        });
      }
      const resolved = ghost.resolvedTarget;
      if (resolved) {
        const internalRestOnlySlot = resolved.diagnostics.includes('rest-only-quantized-internal-slot');
        const resolvedSnapPoints = filterSelectableRenderedGhostSnapPoints(
          getRenderedGhostStaffPoints(renderedGhostGridRef.current, resolved.measureId, resolved.staffIndex),
        );
        const resolvedMatchingSnap = resolvedSnapPoints
          .filter((point) => timestampsEqual(point.timestampNum, point.timestampDen, resolved.timestampNum, resolved.timestampDen))
          .reduce<(typeof resolvedSnapPoints)[number] | null>((best, point) => {
            if (!best) return point;
            if (resolved.domX == null || !Number.isFinite(resolved.domX)) return best;
            return Math.abs(point.domX - resolved.domX) < Math.abs(best.domX - resolved.domX) ? point : best;
          }, null);
        resolvedMatchingSnapForTrace = resolvedMatchingSnap;
        if (resolvedSnapPoints.length > 0 && !resolvedMatchingSnap && !internalRestOnlySlot) {
          entries.push({
            kind: 'ghost-diagnostic',
            level: 'error',
            code: 'ghost_commit_timestamp_not_in_snap_grid',
            message: [
              'Commit timestamp is not represented by the active snap grid.',
              `measure=${resolved.measureNumber}`,
              `staff=${resolved.staffIndex}`,
              `voice=${resolved.voiceId}`,
              `timestamp=${resolved.timestampNum}/${resolved.timestampDen}`,
              `resolvedX=${resolvedX == null ? 'null' : Math.round(resolvedX * 100) / 100}`,
              `mode=${resolved.mode}`,
            ].join(' '),
          });
        }
        if (resolvedMatchingSnap && resolvedX != null && Math.abs(resolvedMatchingSnap.domX - resolvedX) > 7) {
          entries.push({
            kind: 'ghost-diagnostic',
            level: 'error',
            code: 'ghost_commit_x_not_on_snap_grid',
            message: [
              `Commit X is ${Math.round(Math.abs(resolvedMatchingSnap.domX - resolvedX) * 100) / 100}px away from the snap grid point for its timestamp.`,
              `measure=${resolved.measureNumber}`,
              `staff=${resolved.staffIndex}`,
              `voice=${resolved.voiceId}`,
              `timestamp=${resolved.timestampNum}/${resolved.timestampDen}`,
              `resolvedX=${Math.round(resolvedX * 100) / 100}`,
              `snapX=${Math.round(resolvedMatchingSnap.domX * 100) / 100}`,
              `snapSynthetic=${resolvedMatchingSnap.synthetic}`,
              `mode=${resolved.mode}`,
            ].join(' '),
          });
        }
      }
      activeGhostSnapTrace = {
        ...(ghost.snapResolution ?? {
          resolver: 'unknown',
        }),
        measureId: ghost.measureId,
        measureNumber: ghost.measureNumber,
        staffIndex: ghost.staffIndex,
        voiceId: ghost.voiceId,
        timestamp: `${ghost.timestampNum}/${ghost.timestampDen}`,
        rawPointerX: roundTraceNumber(pointerX),
        nearestMatchingSnap: traceQuantizedRestFallback
          ? {
              ...traceQuantizedRestFallback,
              source: 'nearest-matching-snap',
              distanceFromPointer: pointerX == null || traceQuantizedRestFallback.x == null
                ? null
                : roundTraceNumber(Math.abs(traceQuantizedRestFallback.x - pointerX)),
              distanceFromGhost: traceQuantizedRestFallback.x == null
                ? null
                : roundTraceNumber(Math.abs(traceQuantizedRestFallback.x - ghostX)),
            }
          : traceSnapCandidate(nearestMatchingSnap, {
              source: 'nearest-matching-snap',
              pointerX,
              ghostX,
            }),
        resolvedMatchingSnap: traceSnapCandidate(resolvedMatchingSnapForTrace, {
          source: 'resolved-matching-snap',
          pointerX,
          ghostX: resolvedX ?? ghostX,
        }),
        visible: {
          ...(ghost.snapResolution?.visible ?? {
            minimumVisibleX: null,
          }),
          domCenterX: roundTraceNumber(ghostX),
          previewLeft: roundTraceNumber(ghost.previewLeft),
          noteheadCenterX: roundTraceNumber(ghost.noteheadCenterX),
          visibleNoteheadX: roundTraceNumber(visibleNoteheadX),
        },
        resolvedTarget: resolved
          ? {
              mode: resolved.mode,
              measureNumber: resolved.measureNumber,
              staffIndex: resolved.staffIndex,
              voiceId: resolved.voiceId,
              timestamp: `${resolved.timestampNum}/${resolved.timestampDen}`,
              domX: roundTraceNumber(resolved.domX),
              diagnostics: resolved.diagnostics,
            }
          : null,
        deltas: {
          ...(ghost.snapResolution?.deltas ?? {}),
          pointerToGhost: pointerX == null ? null : roundTraceNumber(Math.abs(pointerX - ghostX)),
          pointerToVisibleNotehead: pointerX == null ? null : roundTraceNumber(Math.abs(pointerX - visibleNoteheadX)),
          ghostToSnap: traceQuantizedRestFallback?.x != null
            ? roundTraceNumber(Math.abs(traceQuantizedRestFallback.x - ghostX))
            : (nearestMatchingSnap ? roundTraceNumber(Math.abs(nearestMatchingSnap.domX - ghostX)) : null),
          visibleNoteheadToSnap: traceQuantizedRestFallback?.x != null
            ? roundTraceNumber(Math.abs(traceQuantizedRestFallback.x - visibleNoteheadX))
            : (nearestMatchingSnap ? roundTraceNumber(Math.abs(nearestMatchingSnap.domX - visibleNoteheadX)) : null),
          commitToSnap: traceQuantizedRestFallback?.x != null && resolvedX != null
            ? roundTraceNumber(Math.abs(traceQuantizedRestFallback.x - resolvedX))
            : (nearestMatchingSnap && resolvedX != null
            ? roundTraceNumber(Math.abs(nearestMatchingSnap.domX - resolvedX))
            : null),
        },
      };
      target.__NEX_NOTE_GHOST_SNAP_TRACE__ = activeGhostSnapTrace;
      if (
        resolved
        && !resolved.diagnostics.includes('rest-only-quantized-internal-slot')
        && (
          resolved.measureNumber !== ghost.measureNumber
          || resolved.staffIndex !== ghost.staffIndex
          || resolved.voiceId !== ghost.voiceId
          || !timestampsEqual(resolved.timestampNum, resolved.timestampDen, ghost.timestampNum, ghost.timestampDen)
        )
      ) {
        entries.push({
          kind: 'ghost-diagnostic',
          level: 'error',
          code: 'ghost_visible_commit_target_diverged',
          message: [
            'Visible ghost and commit target resolve to different semantic slots.',
            `visible=m${ghost.measureNumber}:s${ghost.staffIndex}:v${ghost.voiceId}@${ghost.timestampNum}/${ghost.timestampDen}`,
            `commit=m${resolved.measureNumber}:s${resolved.staffIndex}:v${resolved.voiceId}@${resolved.timestampNum}/${resolved.timestampDen}`,
            `mode=${resolved.mode}`,
          ].join(' '),
        });
      }
      if (entries.length > 0) {
        for (const entry of entries) {
          const semanticKey = entry.message.match(/measure=(\d+) staff=(\d+) voice=(\d+) timestamp=([^ ]+) .*mode=([^ ]+)/);
          const key = semanticKey
            ? `${entry.code}:m${semanticKey[1]}:s${semanticKey[2]}:v${semanticKey[3]}:${semanticKey[4]}:${semanticKey[5]}`
            : `${entry.code}:${entry.message}`;
          if (stickyGhostDiagnosticKeysRef.current.has(key)) continue;
          stickyGhostDiagnosticKeysRef.current.add(key);
          stickyGhostDiagnosticsRef.current = [...stickyGhostDiagnosticsRef.current, entry].slice(-24);
          if (debugEnabled) {
            dbg.error('input', entry.code, entry.message);
          }
        }
      }
      return entries;
    })();
    const snapDiagnostics = report.snapIssues.map((issue) => ({
      kind: 'snap-diagnostic' as const,
      level: issue.level,
      code: issue.code,
      message: issue.message,
    }));
    const scoreDiagnostics = [
      ...snapDiagnostics,
      ...ghostDiagnostics,
      ...diagnostics
        .filter((diagnostic) => (
          diagnostic.level === 'error'
          || diagnostic.code === 'measure_balance'
          || diagnostic.code === 'voice_rhythm_sum_mismatch'
          || diagnostic.code === 'event_duration_notation_mismatch'
          || diagnostic.code === 'voice_timeline_gap'
          || diagnostic.code === 'voice_duration_mismatch'
          || diagnostic.code === 'multi_voice_rhythm_gap'
        ))
        .map((diagnostic) => ({
          kind: 'document-diagnostic' as const,
          level: diagnostic.level,
          code: diagnostic.code,
          message: diagnostic.message,
        })),
      ...(editorError
        ? [{
            kind: 'editor-rejection' as const,
            level: 'warning' as const,
            code: 'editor_rejected',
            message: editorError,
          }]
        : []),
    ];
    const rememberGhostSnapTrace = (trace: GhostSnapResolutionTrace | null) => {
      if (!trace) return;
      const signature = JSON.stringify({
        resolver: trace.resolver,
        measureNumber: trace.measureNumber,
        staffIndex: trace.staffIndex,
        voiceId: trace.voiceId,
        timestamp: trace.timestamp,
        rawPointerX: trace.rawPointerX,
        safePointerX: trace.safePointerX,
        effectiveSnap: trace.effectiveSnap,
        nearestMatchingSnap: trace.nearestMatchingSnap,
        resolvedTarget: trace.resolvedTarget,
        deltas: trace.deltas,
      });
      if (ghostSnapTraceSignatureRef.current === signature) return;
      ghostSnapTraceSignatureRef.current = signature;
      ghostSnapTraceHistoryRef.current = [...ghostSnapTraceHistoryRef.current, trace].slice(-80);
      target.__NEX_NOTE_GHOST_SNAP_TRACE_HISTORY__ = ghostSnapTraceHistoryRef.current;
    };
    rememberGhostSnapTrace(activeGhostSnapTrace);
    target.__NEX_NOTE_GHOST_SNAP_TRACE__ = activeGhostSnapTrace;
    target.__NEX_NOTE_GHOST_SNAP_TRACE_HISTORY__ = ghostSnapTraceHistoryRef.current;
    const buildErrorSummary = () => {
      const current = target.__NEX_NOTE_SEMANTIC_GRID__ ?? reportWithActive;
      const affectedMeasures = current.measures.filter((measure) => (
        measure.uncoveredGapCount > 0
        || measure.duplicateRectCount > 0
        || measure.overdrawCount > 0
        || measure.verticalOverlapCount > 0
        || measure.sharedXViolationCount > 0
        || measure.laneCoverageViolationCount > 0
        || measure.visualOrderViolationCount > 0
        || measure.visualOutsideHitboxCount > 0
        || measure.anchorOutsideHitboxCount > 0
        || measure.protectedNotationOverlapCount > 0
        || measure.lateStartCount > 0
        || measure.shortFullRestCount > 0
        || measure.invalidSystemStartProtectionCount > 0
      ));
      return {
        generatedAt: current.generatedAt,
        coordinateSpace: current.coordinateSpace,
        issueCount: current.issueCount + scoreDiagnostics.length,
        invariantChecks: current.invariantChecks,
        debugLayer: {
          boxCount: current.boxCount,
          guardCount: current.guardCount,
          protectedCount: current.protectedCount,
          pitchBandCount: current.pitchBandCount,
          snapCount: current.snapCount,
          rawSnapSourceCount: current.rawSnapSourceCount,
          snapIssueCount: current.snapIssueCount,
          snapMultiXIssueCount: current.snapMultiXIssueCount,
          snapSuppressedSyntheticCount: current.snapSuppressedSyntheticCount,
          semanticGridIssueCount: current.issueCount,
          scoreDiagnosticCount: scoreDiagnostics.length,
          dashedLayoutErrorCount: current.layout.issueCount,
        },
        snapDebug: current.snapDebug,
        layout: current.layout,
        scoreDiagnostics,
        issues: [
          ...current.issues,
          ...scoreDiagnostics.map((diagnostic) => `${diagnostic.code}: ${diagnostic.message}`),
        ],
        affectedMeasures,
        layoutErrors: current.layoutErrors,
        overlaps: current.overlaps,
        protectedRegions: current.protectedRegions,
        activeAnchor: current.activeAnchor,
        activeGhostSnapTrace,
        ghostSnapTraceHistory: ghostSnapTraceHistoryRef.current,
      };
    };
    const rememberErrorSummary = (summary: ReturnType<typeof buildErrorSummary>) => {
      if (summary.issueCount <= 0) return;
      const historySignature = JSON.stringify({
        issues: summary.issues,
        layout: summary.layout,
        activeAnchor: summary.activeAnchor,
      });
      if (semanticGridErrorHistorySignaturesRef.current.has(historySignature)) return;
      semanticGridErrorHistorySignaturesRef.current.add(historySignature);
      semanticGridErrorHistoryRef.current = [
        ...semanticGridErrorHistoryRef.current,
        summary,
      ].slice(-100);
      target.__NEX_NOTE_SEMANTIC_GRID_ERROR_HISTORY__ = semanticGridErrorHistoryRef.current;
    };
    const currentErrorSummary = buildErrorSummary();
    rememberErrorSummary(currentErrorSummary);
    target.__NEX_NOTE_SEMANTIC_GRID_ERRORS__ = currentErrorSummary;
    target.__NEX_NOTE_SEMANTIC_GRID_ERROR_HISTORY__ = semanticGridErrorHistoryRef.current;
    target.copySemanticGridErrors = async () => {
      const latestError = semanticGridErrorHistoryRef.current.at(-1) ?? buildErrorSummary();
      const snapshot = semanticGridVisibleErrorSummaryRef.current ?? latestError;
      await writeTextToClipboard(JSON.stringify(snapshot, null, 2));
    };
    target.copySemanticGridErrorHistory = async () => {
      await writeTextToClipboard(JSON.stringify(semanticGridErrorHistoryRef.current, null, 2));
    };
    target.startSemanticGridCodex = async () => {
      const latestError = semanticGridErrorHistoryRef.current.at(-1) ?? buildErrorSummary();
      const snapshot = semanticGridVisibleErrorSummaryRef.current ?? latestError;
      const history = semanticGridErrorHistoryRef.current.length > 0
        ? semanticGridErrorHistoryRef.current
        : [snapshot];
      return startSemanticGridCodexFromSummary(snapshot, history);
    };
    target.hideSemanticGridErrors = () => {
      document.getElementById('nex-note-semantic-grid-errors')?.remove();
      semanticGridVisibleErrorSummaryRef.current = null;
    };
    const renderSemanticGridErrorPanel = (summary: ReturnType<typeof buildErrorSummary>, auto = false) => {
      const existingPanel = document.getElementById('nex-note-semantic-grid-errors');
      if (auto && existingPanel) {
        return semanticGridVisibleErrorSummaryRef.current ?? summary;
      }
      if (auto && summary.issueCount <= 0) {
        return summary;
      }
      semanticGridVisibleErrorSummaryRef.current = summary;
      target.__NEX_NOTE_SEMANTIC_GRID_ERRORS__ = summary;
      target.hideSemanticGridErrors?.();
      semanticGridVisibleErrorSummaryRef.current = summary;

      const panel = document.createElement('div');
      const hasErrors = summary.issueCount > 0;
      const mutedTextColor = 'rgba(226, 232, 240, 0.72)';
      const cardBorder = '1px solid rgba(148, 163, 184, 0.24)';
      const setButtonStyle = (button: HTMLButtonElement) => {
        button.style.border = '1px solid rgba(226, 232, 240, 0.24)';
        button.style.borderRadius = '7px';
        button.style.background = 'rgba(255, 255, 255, 0.08)';
        button.style.color = 'white';
        button.style.padding = '5px 9px';
        button.style.cursor = 'pointer';
        button.style.font = 'inherit';
      };
      const createMetric = (label: string, value: string | number, tone: 'good' | 'warn' | 'info' = 'info') => {
        const metric = document.createElement('div');
        metric.style.padding = '8px';
        metric.style.border = cardBorder;
        metric.style.borderRadius = '8px';
        metric.style.background = tone === 'good'
          ? 'rgba(22, 101, 52, 0.2)'
          : tone === 'warn'
            ? 'rgba(127, 29, 29, 0.3)'
            : 'rgba(30, 41, 59, 0.62)';
        const metricValue = document.createElement('div');
        metricValue.textContent = String(value);
        metricValue.style.fontWeight = '800';
        metricValue.style.fontSize = '15px';
        metricValue.style.lineHeight = '18px';
        metricValue.style.color = tone === 'warn' ? '#fca5a5' : tone === 'good' ? '#86efac' : '#bfdbfe';
        const metricLabel = document.createElement('div');
        metricLabel.textContent = label;
        metricLabel.style.marginTop = '3px';
        metricLabel.style.color = mutedTextColor;
        metricLabel.style.fontSize = '11px';
        metric.append(metricValue, metricLabel);
        return metric;
      };
      const createSection = (titleText: string, detailText: string, tone: 'good' | 'warn' | 'info') => {
        const section = document.createElement('div');
        section.style.margin = '0 0 10px';
        section.style.padding = '9px';
        section.style.border = tone === 'warn'
          ? '1px solid rgba(248, 113, 113, 0.55)'
          : tone === 'good'
            ? '1px solid rgba(134, 239, 172, 0.32)'
            : '1px solid rgba(147, 197, 253, 0.3)';
        section.style.borderRadius = '8px';
        section.style.background = tone === 'warn'
          ? 'rgba(127, 29, 29, 0.26)'
          : tone === 'good'
            ? 'rgba(22, 101, 52, 0.14)'
            : 'rgba(30, 64, 175, 0.14)';
        const sectionTitle = document.createElement('div');
        sectionTitle.style.fontWeight = '800';
        sectionTitle.style.marginBottom = '5px';
        sectionTitle.textContent = titleText;
        const sectionDetails = document.createElement('div');
        sectionDetails.style.color = mutedTextColor;
        sectionDetails.textContent = detailText;
        section.append(sectionTitle, sectionDetails);
        return section;
      };
      panel.id = 'nex-note-semantic-grid-errors';
      panel.style.position = 'fixed';
      panel.style.right = '16px';
      panel.style.bottom = '16px';
      panel.style.zIndex = '2147483647';
      panel.style.width = 'min(620px, calc(100vw - 32px))';
      panel.style.maxHeight = 'min(560px, calc(100vh - 32px))';
      panel.style.overflow = 'auto';
      panel.style.background = 'linear-gradient(180deg, rgba(15, 23, 42, 0.98), rgba(15, 23, 42, 0.94))';
      panel.style.color = 'white';
      panel.style.border = hasErrors
        ? '1px solid rgba(248, 113, 113, 0.75)'
        : '1px solid rgba(134, 239, 172, 0.46)';
      panel.style.borderRadius = '12px';
      panel.style.boxShadow = '0 24px 80px rgba(15, 23, 42, 0.35)';
      panel.style.font = '12px ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace';
      panel.style.padding = '0';

      const header = document.createElement('div');
      header.style.position = 'sticky';
      header.style.top = '0';
      header.style.zIndex = '1';
      header.style.display = 'flex';
      header.style.alignItems = 'center';
      header.style.justifyContent = 'space-between';
      header.style.gap = '12px';
      header.style.padding = '12px';
      header.style.borderBottom = '1px solid rgba(148, 163, 184, 0.22)';
      header.style.background = 'rgba(15, 23, 42, 0.98)';
      header.style.backdropFilter = 'blur(10px)';
      const title = document.createElement('strong');
      title.textContent = hasErrors
        ? `Semantic Grid: ${summary.issueCount} error${summary.issueCount === 1 ? '' : 's'}`
        : 'Semantic Grid: clean';
      title.style.color = hasErrors ? '#fca5a5' : '#86efac';
      title.style.fontSize = '13px';
      const actions = document.createElement('div');
      actions.style.display = 'flex';
      actions.style.alignItems = 'center';
      actions.style.gap = '6px';
      actions.style.flexWrap = 'wrap';
      const actionButtons: HTMLButtonElement[] = [];
      if (hasErrors) {
        const startCodex = document.createElement('button');
        startCodex.type = 'button';
        startCodex.textContent = 'Start Codex';
        setButtonStyle(startCodex);
        startCodex.onclick = async () => {
          startCodex.disabled = true;
          startCodex.textContent = 'Starting...';
          let result: unknown;
          try {
            const history = semanticGridErrorHistoryRef.current.length > 0
              ? semanticGridErrorHistoryRef.current
              : [summary];
            result = await startSemanticGridCodexFromSummary(summary, history);
            const ok = Boolean((result as { ok?: boolean } | null)?.ok);
            const mode = (result as { mode?: string } | null)?.mode;
            startCodex.textContent = ok
              ? mode === 'terminal'
                ? 'Terminal opened'
                : 'Codex started'
              : 'Start failed';
          } catch (err) {
            result = { ok: false, error: String(err) };
            startCodex.textContent = 'Start failed';
          }
          startCodex.title = formatSemanticGridCodexHandoffButtonTitle(result);
          if (!Boolean((result as { ok?: boolean } | null)?.ok)) {
            // eslint-disable-next-line no-console
            console.warn('[nex-note:semantic-grid-codex] start failed', result);
          }
          window.setTimeout(() => {
            startCodex.disabled = false;
            startCodex.textContent = 'Start Codex';
          }, 2200);
        };
        actionButtons.push(startCodex);
      }
      const copy = document.createElement('button');
      copy.type = 'button';
      copy.textContent = 'Copy';
      setButtonStyle(copy);
      copy.onclick = async () => {
        const copied = await writeTextToClipboard(JSON.stringify(summary, null, 2));
        copy.textContent = copied ? 'Copied' : 'Copy failed';
        window.setTimeout(() => {
          copy.textContent = 'Copy';
        }, 1200);
      };
      const copyAll = document.createElement('button');
      copyAll.type = 'button';
      copyAll.textContent = `Copy All (${semanticGridErrorHistoryRef.current.length})`;
      setButtonStyle(copyAll);
      copyAll.onclick = async () => {
        const history = semanticGridErrorHistoryRef.current.length > 0
          ? semanticGridErrorHistoryRef.current
          : [summary];
        const copied = await writeTextToClipboard(JSON.stringify(history, null, 2));
        copyAll.textContent = copied ? 'Copied All' : 'Copy failed';
        window.setTimeout(() => {
          copyAll.textContent = `Copy All (${semanticGridErrorHistoryRef.current.length})`;
        }, 1200);
      };
      const close = document.createElement('button');
      close.type = 'button';
      close.textContent = 'Close';
      setButtonStyle(close);
      close.onclick = () => target.hideSemanticGridErrors?.();
      actions.append(...actionButtons, copy, copyAll, close);
      header.append(title, actions);

      const content = document.createElement('div');
      content.style.padding = '12px';

      const metrics = document.createElement('div');
      metrics.style.display = 'grid';
      metrics.style.gridTemplateColumns = 'repeat(4, minmax(0, 1fr))';
      metrics.style.gap = '8px';
      metrics.style.marginBottom = '10px';
      metrics.append(
        createMetric('issues', summary.issueCount, hasErrors ? 'warn' : 'good'),
        createMetric('snaps', summary.debugLayer.snapCount),
        createMetric('pitch bands', summary.debugLayer.pitchBandCount),
        createMetric('raw snaps', summary.debugLayer.rawSnapSourceCount),
        createMetric('diagnostics', summary.debugLayer.scoreDiagnosticCount, summary.debugLayer.scoreDiagnosticCount > 0 ? 'warn' : 'info'),
      );

      const snapGrid = createSection(
        `Snap Grid: ${summary.debugLayer.snapIssueCount} issue${summary.debugLayer.snapIssueCount === 1 ? '' : 's'}`,
        [
          `visible=${summary.debugLayer.snapCount}`,
          `raw=${summary.debugLayer.rawSnapSourceCount}`,
          `multiX=${summary.debugLayer.snapMultiXIssueCount}`,
          `hiddenSynthetic=${summary.debugLayer.snapSuppressedSyntheticCount}`,
          'copy=copySnapDebug()',
        ].join('; '),
        summary.debugLayer.snapIssueCount > 0 ? 'warn' : 'good',
      );

      const semanticGrid = createSection(
        `Semantic Grid: ${summary.debugLayer.semanticGridIssueCount} error${summary.debugLayer.semanticGridIssueCount === 1 ? '' : 's'}`,
        [
          `boxes=${summary.debugLayer.boxCount}`,
          `guards=${summary.debugLayer.guardCount}`,
          `protected=${summary.debugLayer.protectedCount}`,
          `pitchBands=${summary.debugLayer.pitchBandCount}`,
          `snaps=${summary.debugLayer.snapCount}`,
          `missingSnapGrid=${summary.invariantChecks.snapLaneMissingGridBoxCount ?? 0}`,
          `misalignedSnapGrid=${summary.invariantChecks.snapLaneMisalignedGridBoxCount ?? 0}`,
        ].join('; '),
        summary.debugLayer.semanticGridIssueCount > 0 ? 'warn' : 'good',
      );

      const layout = createSection(
        `Layout: ${summary.layout.issueCount} error${summary.layout.issueCount === 1 ? '' : 's'}`,
        summary.layout.issueCount > 0
        ? [
            `overdraw=${summary.layout.overdrawCount}`,
            `protected=${summary.layout.protectedNotationOverlapCount ?? 0}`,
            `measures=${summary.layout.affectedMeasures.join(', ') || '-'}`,
            `staves=${summary.layout.affectedStaves.join(', ') || '-'}`,
          ].join('; ')
        : 'No layout errors detected.',
        summary.layout.issueCount > 0 ? 'warn' : 'good',
      );

      const activeAnchor = createSection(
        `Hover Target: ${summary.activeAnchor.issueCount} error${summary.activeAnchor.issueCount === 1 ? '' : 's'}`,
        summary.activeAnchor.target
        ? `strict=${summary.activeAnchor.strictMatchCount}; loose=${summary.activeAnchor.looseMatchCount}; target=m${summary.activeAnchor.target.measure} p${summary.activeAnchor.target.page ?? '-'} sys${summary.activeAnchor.target.system ?? '-'}`
        : 'No active hover target.',
        summary.activeAnchor.issueCount > 0 ? 'warn' : 'good',
      );

      const scoreDiagnosticsSection = createSection(
        `Score Diagnostics: ${summary.scoreDiagnostics.length} error${summary.scoreDiagnostics.length === 1 ? '' : 's'}`,
        summary.scoreDiagnostics.length > 0
          ? summary.scoreDiagnostics.map((diagnostic) => `${diagnostic.code}: ${diagnostic.message}`).join(' | ')
          : 'No score diagnostics detected.',
        summary.scoreDiagnostics.length > 0 ? 'warn' : 'good',
      );
      const ghostSnapTrace = createSection(
        'Ghost Snap Trace',
        summary.activeGhostSnapTrace
          ? [
              `resolver=${summary.activeGhostSnapTrace.resolver}`,
              `target=m${summary.activeGhostSnapTrace.measureNumber ?? '-'}:s${summary.activeGhostSnapTrace.staffIndex ?? '-'}:v${summary.activeGhostSnapTrace.voiceId ?? '-'}@${summary.activeGhostSnapTrace.timestamp ?? '-'}`,
              `pointer=${summary.activeGhostSnapTrace.rawPointerX ?? '-'}`,
              `safePointer=${summary.activeGhostSnapTrace.safePointerX ?? '-'}`,
              `effectiveSnap=${summary.activeGhostSnapTrace.effectiveSnap?.timestamp ?? '-'}@${summary.activeGhostSnapTrace.effectiveSnap?.x ?? '-'}`,
              `visibleNotehead=${summary.activeGhostSnapTrace.visible?.visibleNoteheadX ?? '-'}`,
              `commit=${summary.activeGhostSnapTrace.resolvedTarget?.timestamp ?? '-'}@${summary.activeGhostSnapTrace.resolvedTarget?.domX ?? '-'}`,
              `deltas=${JSON.stringify(summary.activeGhostSnapTrace.deltas ?? {})}`,
              'copy=copyGhostSnapTrace()',
            ].join('; ')
          : 'No active ghost snap trace.',
        summary.activeGhostSnapTrace?.deltas?.visibleNoteheadToSnap != null
          && summary.activeGhostSnapTrace.deltas.visibleNoteheadToSnap > 2
          ? 'warn'
          : 'info',
      );

      const affected = createSection(
        'Affected Scope',
        [
          `measures=${summary.affectedMeasures.map((measure) => measure.measureIndex).join(', ') || '-'}`,
          `layoutOverlaps=${summary.overlaps.length}`,
          `score=${summary.scoreDiagnostics.length}`,
          `timing=${summary.invariantChecks.laneCoverageViolationCount}`,
          `order=${summary.invariantChecks.visualOrderViolationCount}`,
          `visual=${summary.invariantChecks.visualOutsideHitboxCount}`,
          `anchor=${summary.invariantChecks.anchorOutsideHitboxCount}`,
          `history=${semanticGridErrorHistoryRef.current.length}`,
        ].join('; '),
        summary.affectedMeasures.length > 0 || summary.overlaps.length > 0 ? 'warn' : 'info',
      );

      const details = document.createElement('details');
      details.style.border = cardBorder;
      details.style.borderRadius = '8px';
      details.style.background = 'rgba(2, 6, 23, 0.45)';
      details.style.overflow = 'hidden';
      const detailsSummary = document.createElement('summary');
      detailsSummary.textContent = 'Raw JSON';
      detailsSummary.style.cursor = 'pointer';
      detailsSummary.style.padding = '9px';
      detailsSummary.style.fontWeight = '800';
      detailsSummary.style.color = '#bfdbfe';

      const body = document.createElement('pre');
      body.style.margin = '0';
      body.style.padding = '10px';
      body.style.borderTop = '1px solid rgba(148, 163, 184, 0.18)';
      body.style.maxHeight = '260px';
      body.style.overflow = 'auto';
      body.style.whiteSpace = 'pre-wrap';
      body.style.wordBreak = 'break-word';
      body.textContent = JSON.stringify(summary, null, 2);
      details.append(detailsSummary, body);
      content.append(metrics, snapGrid, semanticGrid, scoreDiagnosticsSection, ghostSnapTrace, layout, activeAnchor, affected, details);
      panel.append(header, content);
      document.body.append(panel);

      // eslint-disable-next-line no-console
      console.info('[nex-note:semantic-grid:errors]', summary);
      if (summary.affectedMeasures.length > 0) {
        // eslint-disable-next-line no-console
        console.table(summary.affectedMeasures);
      }
      if (summary.overlaps.length > 0) {
        // eslint-disable-next-line no-console
        console.table(summary.overlaps);
      }
      if (summary.layoutErrors.length > 0) {
        // eslint-disable-next-line no-console
        console.table(summary.layoutErrors);
      }
      if (summary.layout.overdraw.length > 0) {
        // eslint-disable-next-line no-console
        console.info('[nex-note:semantic-grid:layout]', summary.layout);
      }
      if (summary.activeAnchor.issueCount > 0) {
        // eslint-disable-next-line no-console
        console.info('[nex-note:semantic-grid:hover]', summary.activeAnchor);
      }
      return summary;
    };
    target.showSemanticGridErrors = () => renderSemanticGridErrorPanel(buildErrorSummary(), false);
    if (report.boxCount === 0 && report.snapCount === 0 && scoreDiagnostics.length === 0) return;
    const signature = JSON.stringify({
      boxCount: report.boxCount,
      snapCount: report.snapCount,
      rawSnapSourceCount: report.rawSnapSourceCount,
      snapIssueCount: report.snapIssueCount,
      issueCount: report.issueCount,
      issues: report.issues,
      activeAnchor: activeAnchorReport,
      scoreDiagnostics,
      activeGhostSnapTrace,
      boxes: report.boxes.map((box) => [
        box.page,
        box.system,
        box.measure,
        box.staff,
        box.voice,
        box.timestamp,
        box.protectedSystemStart,
        box.left,
        box.right,
        box.top,
        box.bottom,
      ]),
      guards: report.guards.map((guard) => [
        guard.page,
        guard.system,
        guard.measure,
        guard.staff,
        guard.edge,
        guard.x,
        guard.top,
        guard.bottom,
      ]),
      overlaps: report.overlaps.map((overlap) => [
        overlap.measures.join(','),
        overlap.staff,
        overlap.left,
        overlap.right,
        overlap.top,
        overlap.bottom,
      ]),
      protectedRegions: report.protectedRegions.map((region) => [
        region.page,
        region.system,
        region.measure,
        region.staff,
        region.reason,
        region.left,
        region.right,
        region.top,
        region.bottom,
      ]),
      pitchBands: report.pitchBands.map((band) => [
        band.page,
        band.system,
        band.measure,
        band.staff,
        band.staffStep,
        band.pitch,
        band.centerY,
      ]),
      snaps: report.snaps.map((point) => [
        point.page,
        point.system,
        point.measure,
        point.staff,
        point.voice,
        point.timestamp,
        point.x,
        point.y,
        point.synthetic,
        point.active,
        point.sourceCount,
        point.distinctXCount,
        point.suppressedSyntheticCount,
        point.rawXs.join(','),
        point.issue,
      ]),
      snapIssues: report.snapIssues.map((issue) => [
        issue.code,
        issue.level,
        issue.message,
      ]),
      invariantChecks: report.invariantChecks,
    });
    if (semanticGridDebugSignatureRef.current === signature) return;
    semanticGridDebugSignatureRef.current = signature;
    const summary = buildErrorSummary();
    rememberErrorSummary(summary);
    renderSemanticGridErrorPanel(summary, true);
    // eslint-disable-next-line no-console
    console.info('[nex-note:semantic-grid]', JSON.stringify({
      boxCount: report.boxCount,
      pitchBandCount: report.pitchBandCount,
      snapCount: report.snapCount,
      snapIssueCount: report.snapIssueCount,
      issueCount: reportWithActive.issueCount,
      issues: reportWithActive.issues,
      copy: 'copySemanticGridDebug()',
      errors: 'showSemanticGridErrors()',
      copyErrors: 'copySemanticGridErrors()',
      copyAllErrors: 'copySemanticGridErrorHistory()',
      startCodex: 'startSemanticGridCodex()',
      copySnapDebug: 'copySnapDebug()',
      copyGhostSnapTrace: 'copyGhostSnapTrace()',
      inspect: 'window.__NEX_NOTE_SEMANTIC_GRID__',
      inspectSnaps: 'window.__NEX_NOTE_SNAP_DEBUG__',
      inspectGhostSnapTrace: 'window.__NEX_NOTE_GHOST_SNAP_TRACE__',
    }));
  }, [activeSemanticAnchorTarget, diagnostics, editorError, semanticAnchorDebugBoxes, semanticGridDebugEnabled, semanticGridReady, semanticPitchDebugBands, semanticSnapDebugPoints]);

  if (!xml) {
    return (
      <div className="flex items-center justify-center h-full text-slate-400 text-sm">
        No file loaded
      </div>
    );
  }

  const navigatorWidth = 180;
  const navigatorHeight = 136;
  const viewportWidthRatio = viewportBox.scrollWidth > 0 ? viewportBox.width / viewportBox.scrollWidth : 1;
  const viewportHeightRatio = viewportBox.scrollHeight > 0 ? viewportBox.height / viewportBox.scrollHeight : 1;
  const navigatorBoxLeft = viewportBox.scrollWidth > 0
    ? (viewportBox.scrollLeft / viewportBox.scrollWidth) * navigatorWidth
    : 0;
  const navigatorBoxTop = viewportBox.scrollHeight > 0
    ? (viewportBox.scrollTop / viewportBox.scrollHeight) * navigatorHeight
    : 0;

  return (
    <div className={`relative flex h-full min-h-0 flex-col ${!visualDebugEnabled && ((noteInputMode && ghostNoteTarget) || dragPreviewTarget) ? 'cursor-none' : 'cursor-default'}`}>
      <div className="relative min-h-0 flex-1">
        {findVisible && (
          <div className="absolute left-4 top-4 z-20 flex items-center gap-2 rounded-xl border border-nex-border bg-white/95 px-3 py-2 shadow-lg">
            <input
              ref={findInputRef}
              value={findQuery}
              onChange={(event) => {
                setFindQuery(event.target.value);
                setFindStatus(null);
              }}
              onKeyDown={(event) => {
                if (event.key === 'Escape') {
                  event.preventDefault();
                  setFindVisible(false);
                  setFindStatus(null);
                }
              }}
              placeholder="Measure, p2, r1, A"
              className="w-52 rounded-md border border-nex-border px-2 py-1 text-sm text-slate-700 outline-none focus:border-nex-accent"
            />
            <button
              type="button"
              className="nex-brand-active rounded-md px-2 py-1 text-xs font-semibold"
              onClick={() => submitFind(findQuery)}
            >
              Go
            </button>
            {findStatus && <span className="text-xs text-slate-500">{findStatus}</span>}
          </div>
        )}

        {navigatorVisible && (
          <div className="absolute right-4 top-4 z-20 w-52 rounded-2xl border border-nex-border bg-white/95 p-3 shadow-lg">
            <div className="mb-2 flex items-center justify-between">
              <p className="text-[11px] font-semibold uppercase tracking-[0.24em] text-slate-400">Navigator</p>
              <button
                type="button"
                className="text-xs font-semibold text-slate-500 hover:text-nex-ink"
                onClick={() => setNavigatorVisible(false)}
              >
                Hide
              </button>
            </div>
            <div className="space-y-2">
              {Array.from({ length: pageCount }, (_, index) => (
                <button
                  key={`page-nav:${index + 1}`}
                  type="button"
                  className="flex w-full items-center justify-between rounded-lg border border-nex-border px-2 py-1.5 text-xs text-slate-600 hover:border-slate-300 hover:bg-nex-surface hover:text-nex-ink"
                  onClick={() => {
                    void scrollToPageNumber(index + 1);
                  }}
                >
                  <span>Page {index + 1}</span>
                  <span className="text-slate-400">m.{measureNumberForPageIndex(measureLayoutOverlays, index) ?? 1}</span>
                </button>
              ))}
            </div>
            <div className="relative mt-3 overflow-hidden rounded-lg border border-nex-border bg-nex-surface" style={{ width: `${navigatorWidth}px`, height: `${navigatorHeight}px` }}>
              {measureLayoutOverlays.map((overlay) => {
                const visibleRect = visibleMeasureRectForStaff(overlay, staffDetailsByMeasureRef.current, coreDocument);
                return (
                  <div
                    key={`navigator-measure:${overlay.measureId}`}
                    className="absolute rounded-sm bg-slate-300/90"
                    style={{
                      left: `${(visibleRect.x / Math.max(viewportBox.scrollWidth, 1)) * navigatorWidth}px`,
                      top: `${(visibleRect.y / Math.max(viewportBox.scrollHeight, 1)) * navigatorHeight}px`,
                      width: `${Math.max((visibleRect.width / Math.max(viewportBox.scrollWidth, 1)) * navigatorWidth, 2)}px`,
                      height: `${Math.max((visibleRect.height / Math.max(viewportBox.scrollHeight, 1)) * navigatorHeight, 2)}px`,
                    }}
                  />
                );
              })}
              <div
                className="absolute rounded border-2 border-nex-accent bg-nex-accent/15"
                data-testid="navigator-box"
                style={{
                  left: `${navigatorBoxLeft}px`,
                  top: `${navigatorBoxTop}px`,
                  width: `${Math.max(viewportWidthRatio * navigatorWidth, 20)}px`,
                  height: `${Math.max(viewportHeightRatio * navigatorHeight, 20)}px`,
                }}
              />
            </div>
          </div>
        )}

        {loading && (
          <div className="absolute inset-0 z-10 flex items-center justify-center bg-white/80">
            <div className="flex items-center gap-2 text-sm text-slate-500">
              <svg className="h-4 w-4 animate-spin" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" d="M12 4v4M12 16v4M4 12H8M16 12h4" />
              </svg>
              Rendering…
            </div>
          </div>
        )}

        <div
          ref={viewportRef}
          tabIndex={0}
          data-testid="score-viewport"
          data-playback-active={playbackActive && playbackCursorTarget ? 'true' : 'false'}
          data-playback-measure={playbackCursorTarget?.measureNumber ?? ''}
          data-playback-timestamp={playbackCursorTarget ? `${playbackCursorTarget.timestampNum}/${playbackCursorTarget.timestampDen}` : ''}
          data-playback-time-ms={playbackPlayhead?.currentTimeMs ?? ''}
          data-note-input-gesture-policy={noteInputMode && !inputByDurationMode ? 'direct-entry' : 'navigation'}
          data-tablet-entry-phase={tabletEntryVisual.phase}
          className="h-full overflow-auto outline-none"
          style={{
            touchAction: noteInputMode && !inputByDurationMode && !pencilOnlyInput ? 'none' : 'pan-x pan-y pinch-zoom',
          }}
          onPointerDown={() => viewportRef.current?.focus()}
          onClick={handlePlaybackSeekClick}
          onPointerMove={handlePointerMove}
          onPointerLeave={() => {
            if (tabletEntrySessionRef.current) return;
            discardPendingTabletPointerMove();
            dbg.score('pointerleave → clear ghost');
            lastGhostStaffIndexRef.current = null;
            setGhostNoteTarget(null);
            setDragPreviewTarget(null);
            setTabletEntryVisual({ phase: 'idle', pointerType: null, point: null });
          }}
        >
          {error && (
            <div className="m-4 rounded-md border border-red-200 bg-red-50 p-4 text-sm text-red-600">{error}</div>
          )}
          <div className={`relative min-h-full min-w-full ${viewMode === 'page' ? 'bg-stone-200/70 p-6' : ''}`}>
            <div className={`relative ${viewMode === 'page' ? 'mx-auto w-full max-w-[1120px]' : 'min-w-full'}`}>
              <div
                ref={containerRef}
                className={`bg-white ${viewMode === 'page' ? 'max-w-[1120px] rounded-[28px] border border-stone-300 px-6 py-8 shadow-[0_24px_70px_-38px_rgba(15,23,42,0.35)]' : 'w-full'} ${viewMode === 'continuous-horizontal' ? 'inline-block min-w-max' : ''}`}
          data-testid="score-canvas"
          data-document-revision={coreDocument?.revision ?? 0}
              />
              <div
                className="pointer-events-none absolute inset-0 z-20"
              >
                {playbackActive && playbackPlayhead && (() => {
                  const rect = resolvePlayheadRect(
                    playbackPlayhead,
                    measureLayoutOverlays,
                    staffDetailsByMeasureRef.current,
                  );
                  if (!rect) return null;
                  return (
                    <div
                      className="absolute top-0 w-0"
                      data-testid="score-playhead"
                      data-playhead-measure={rect.measureNumber}
                      style={{
                        left: `${rect.x}px`,
                        top: `${rect.y - 6}px`,
                        height: `${rect.height + 12}px`,
                        borderLeft: '2px solid #2563eb',
                        boxShadow: '0 0 0 1px rgba(255,255,255,0.9)',
                        transition: 'left 48ms linear, top 80ms ease, height 80ms ease',
                        transform: 'translateZ(0)',
                        willChange: 'left, top, height',
                      }}
                    />
                  );
                })()}
                {measureLayoutOverlays.map((overlay) => {
                  const staffIndex = staffIndexForMeasureId(coreDocument, overlay.measureId);
                  const visibleRect = visibleMeasureRectForStaff(overlay, staffDetailsByMeasureRef.current, coreDocument);
                  return (
                    <div
                      key={`measure-hitbox:${overlay.measureId}`}
                      className="absolute"
                      data-measure-number={overlay.measureNumber}
                      data-measure-id={overlay.measureId}
                      data-measure-staff={staffIndex ?? ''}
                      data-measure-system={overlay.systemIndex}
                      data-measure-page={overlay.pageIndex}
                      aria-hidden="true"
                      style={{
                        left: `${visibleRect.x}px`,
                        top: `${visibleRect.y}px`,
                        width: `${visibleRect.width}px`,
                        height: `${visibleRect.height}px`,
                        opacity: 0.001,
                      }}
                    />
                  );
                })}
                {semanticProtectedDebugRects.map((region) => (
                  <div
                    key={`semantic-protected:${region.id}`}
                    className="absolute"
                    data-semantic-anchor-protected-debug="true"
                    data-semantic-anchor-protected-measure={region.measureNumber}
                    data-semantic-anchor-protected-staff={region.staffIndex}
                    data-semantic-anchor-protected-reason={region.reason}
                    style={{
                      left: `${region.rect.x}px`,
                      top: `${region.rect.y}px`,
                      width: `${region.rect.width}px`,
                      height: `${region.rect.height}px`,
                      zIndex: 2,
                      backgroundColor: 'rgba(248, 113, 113, 0.14)',
                      boxShadow: 'inset 0 0 0 1px rgba(220, 38, 38, 0.35)',
                    }}
                  />
                ))}
                {semanticMeasureGuardDebugLines.map((guard) => (
                  <div
                    key={`semantic-guard:${guard.id}`}
                    className="absolute"
                    data-semantic-anchor-guard-debug="true"
                    data-semantic-anchor-guard-edge={guard.edge}
                    data-semantic-anchor-guard-measure={guard.measureNumber}
                    data-semantic-anchor-guard-staff={guard.staffIndex}
                    data-semantic-anchor-guard-protected={guard.protectedSystemStart ? 'true' : 'false'}
                    style={{
                      left: `${guard.x - 1}px`,
                      top: `${guard.y}px`,
                      width: '2px',
                      height: `${guard.height}px`,
                      zIndex: 3,
                      backgroundColor: guard.edge === 'left'
                        ? 'rgba(220, 38, 38, 0.9)'
                        : 'rgba(185, 28, 28, 0.75)',
                      boxShadow: guard.protectedSystemStart
                        ? '0 0 0 2px rgba(220, 38, 38, 0.18)'
                        : 'none',
                    }}
                  />
                ))}
                {semanticOverlapDebugRects.map((overlap) => (
                  <div
                    key={`semantic-overlap:${overlap.id}`}
                    className="absolute"
                    data-semantic-anchor-overlap-debug="true"
                    data-semantic-anchor-layout-error={overlap.kind}
                    data-semantic-anchor-overlap-measures={overlap.measures.join(',')}
                    data-semantic-anchor-overlap-staff={overlap.staffIndex}
                    data-semantic-anchor-overlap-message={overlap.message}
                    title={overlap.message}
                    style={{
                      left: `${overlap.rect.x}px`,
                      top: `${overlap.rect.y}px`,
                      width: `${overlap.rect.width}px`,
                      height: `${overlap.rect.height}px`,
                      zIndex: 4,
                      border: '2px dashed rgba(220, 38, 38, 0.95)',
                      backgroundColor: 'rgba(220, 38, 38, 0.08)',
                      boxSizing: 'border-box',
                    }}
                  />
                ))}
                {semanticPitchDebugBands.map((band) => {
                  const emphasized = band.staffStep % 2 === 0;
                  const title = [
                    `pitch ${band.pitch}`,
                    `m${band.measureNumber}:s${band.staffIndex}`,
                    `staffStep=${band.staffStep}`,
                    `y=${Math.round(band.centerY * 100) / 100}`,
                  ].join(' | ');
                  return (
                    <div
                      key={`semantic-pitch-band:${band.id}`}
                      className="absolute"
                      data-semantic-pitch-band-debug="true"
                      data-semantic-pitch-band-measure={band.measureNumber}
                      data-semantic-pitch-band-part={band.partId ?? 'partless'}
                      data-semantic-pitch-band-staff={band.staffIndex}
                      data-semantic-pitch-band-step={band.staffStep}
                      data-semantic-pitch-band-pitch={band.pitch}
                      data-semantic-pitch-band-left={Math.round(band.rect.x * 100) / 100}
                      data-semantic-pitch-band-right={Math.round((band.rect.x + band.rect.width) * 100) / 100}
                      title={title}
                      style={{
                        left: `${band.rect.x}px`,
                        top: `${band.rect.y}px`,
                        width: `${band.rect.width}px`,
                        height: `${band.rect.height}px`,
                        zIndex: 2,
                        backgroundColor: emphasized
                          ? 'rgba(20, 184, 166, 0.075)'
                          : 'rgba(20, 184, 166, 0.045)',
                        boxShadow: [
                          `inset 0 ${emphasized ? '-1px' : '-0.5px'} 0 rgba(15, 118, 110, ${emphasized ? 0.24 : 0.14})`,
                          'inset 1px 0 0 rgba(15, 118, 110, 0.045)',
                          'inset -1px 0 0 rgba(15, 118, 110, 0.035)',
                        ].join(', '),
                        outline: emphasized ? '1px solid rgba(15, 118, 110, 0.035)' : 'none',
                        outlineOffset: '-1px',
                        pointerEvents: 'none',
                      }}
                    />
                  );
                })}
                {semanticSnapColumnDebugLines.map((line) => {
                  const title = [
                    `snap column x=${Math.round(line.x * 100) / 100}`,
                    `system=${line.systemIndex ?? 'unknown'}`,
                    `measures=${line.measures.join(',')}`,
                    `staves=${line.staves.join(',')}`,
                    `timestamps=${line.timestamps.join(',')}`,
                    `snaps=${line.snapCount}`,
                    line.issue ? `issue=${line.issue}` : 'issue=none',
                  ].join(' | ');
                  return (
                    <div
                      key={`semantic-snap-column:${line.id}`}
                      className="absolute"
                      data-semantic-snap-column-debug={line.active ? 'active' : 'true'}
                      data-semantic-snap-column-system={line.systemIndex ?? ''}
                      data-semantic-snap-column-x={line.x}
                      data-semantic-snap-column-measures={line.measures.join(',')}
                      data-semantic-snap-column-staves={line.staves.join(',')}
                      data-semantic-snap-column-timestamps={line.timestamps.join(',')}
                      data-semantic-snap-column-count={line.snapCount}
                      data-semantic-snap-column-issue={line.issue ?? 'none'}
                      title={title}
                      style={{
                        left: `${line.x - (line.active ? 4 : 3)}px`,
                        top: `${line.top}px`,
                        width: line.active ? '8px' : '6px',
                        height: `${line.bottom - line.top}px`,
                        zIndex: line.active ? 7 : 4,
                        backgroundColor: line.active
                          ? 'rgba(250, 204, 21, 0.11)'
                          : line.issue
                            ? 'rgba(239, 68, 68, 0.09)'
                            : 'rgba(59, 130, 246, 0.07)',
                        boxShadow: [
                          `inset 0 0 0 1px ${line.active ? 'rgba(250, 204, 21, 0.34)' : line.issue ? 'rgba(239, 68, 68, 0.32)' : 'rgba(37, 99, 235, 0.24)'}`,
                          `inset ${line.active ? '4px' : '3px'} 0 0 ${line.active ? 'rgba(250, 204, 21, 0.68)' : line.issue ? 'rgba(239, 68, 68, 0.62)' : 'rgba(37, 99, 235, 0.56)'}`,
                        ].join(', '),
                        borderRadius: '9999px',
                        pointerEvents: 'none',
                      }}
                    />
                  );
                })}
                {semanticSnapDebugPoints.map((point) => {
                  const title = [
                    `snap m${point.measureNumber}:s${point.staffIndex}:v${point.voiceId}@${point.timestampNum}/${point.timestampDen}`,
                    `x=${Math.round(point.x * 100) / 100}`,
                    point.synthetic ? 'synthetic' : 'rendered',
                    point.isRest ? 'rest' : 'note',
                    `sources=${point.sourceCount}`,
                    `rawXs=${point.rawXs.join(',')}`,
                    point.issue ? `issue=${point.issue}` : 'issue=none',
                  ].join(' | ');
                  return (
                    <div
                      key={`semantic-snap:${point.id}`}
                      className="absolute"
                      data-semantic-snap-debug={point.active ? 'active' : 'true'}
                      data-semantic-snap-measure={point.measureNumber}
                      data-semantic-snap-part={point.partId ?? 'partless'}
                      data-semantic-snap-staff={point.staffIndex}
                      data-semantic-snap-voice={point.voiceId}
                      data-semantic-snap-timestamp={`${point.timestampNum}/${point.timestampDen}`}
                      data-semantic-snap-synthetic={point.synthetic ? 'true' : 'false'}
                      data-semantic-snap-rest={point.isRest ? 'true' : 'false'}
                      data-semantic-snap-source-count={point.sourceCount}
                      data-semantic-snap-distinct-x-count={point.distinctXCount}
                      data-semantic-snap-hidden-synthetic-count={point.suppressedSyntheticCount}
                      data-semantic-snap-issue={point.issue ?? 'none'}
                      title={title}
                      style={{
                        left: `${point.x - (point.active ? 4 : 3)}px`,
                        top: `${point.y - (point.active ? 4 : 3)}px`,
                        width: point.active ? '8px' : '6px',
                        height: point.active ? '8px' : '6px',
                        zIndex: point.active ? 8 : 5,
                        borderRadius: '9999px',
                        backgroundColor: point.active
                          ? 'rgba(250, 204, 21, 0.98)'
                          : point.issue === 'multi-x'
                            ? 'rgba(239, 68, 68, 0.98)'
                            : point.issue === 'duplicate-source'
                              ? 'rgba(245, 158, 11, 0.98)'
                              : point.issue === 'synthetic-grid-collapsed'
                                ? 'rgba(14, 165, 233, 0.95)'
                              : point.synthetic
                                ? 'rgba(14, 165, 233, 0.95)'
                                : point.isRest
                                  ? 'rgba(168, 85, 247, 0.95)'
                                  : 'rgba(34, 197, 94, 0.95)',
                        boxShadow: point.active
                          ? '0 0 0 2px rgba(250, 204, 21, 0.35), 0 0 0 5px rgba(15, 23, 42, 0.2)'
                          : '0 0 0 1px rgba(15, 23, 42, 0.35)',
                        pointerEvents: 'none',
                      }}
                    />
                  );
                })}
                {semanticAnchorDebugBoxes.map((anchorBox) => {
                  const active = semanticAnchorDebugBoxMatchesTarget(anchorBox, activeSemanticAnchorTarget);
                  return (
                    <div
                      key={`semantic-anchor:${anchorBox.id}`}
                      className="absolute rounded-sm"
                      data-semantic-anchor-debug={active ? 'active' : 'true'}
                      data-semantic-anchor-duplicate={anchorBox.duplicateOfEarlier ? 'true' : 'false'}
                      data-semantic-anchor-label={anchorBox.label}
                      data-semantic-anchor-rest={anchorBox.isRest ? 'true' : 'false'}
                      data-semantic-anchor-measure={anchorBox.measureNumber}
                      data-semantic-anchor-part={anchorBox.partId ?? 'partless'}
                      data-semantic-anchor-staff={anchorBox.staffIndex}
                      data-semantic-anchor-voice={anchorBox.voiceId}
                      style={{
                        left: `${anchorBox.rect.x}px`,
                        top: `${anchorBox.rect.y}px`,
                        width: `${anchorBox.rect.width}px`,
                        height: `${anchorBox.rect.height}px`,
                        backgroundColor: anchorBox.duplicateOfEarlier
                          ? 'transparent'
                          : (active ? 'rgba(37, 99, 235, 0.24)' : 'rgba(0, 100, 255, 0.1)'),
                        boxShadow: anchorBox.duplicateOfEarlier
                          ? 'none'
                          : (active
                          ? '0 0 0 2px rgba(37, 99, 235, 0.9), 0 0 0 5px rgba(37, 99, 235, 0.12)'
                          : 'inset 0 0 0 1px rgba(0, 100, 255, 0.48)'),
                      }}
                    />
                  );
                })}
                {visualDebugEnabled && renderedNoteDebugMarkers.map((marker) => (
                  <div
                    key={`rendered-note-debug:${marker.id}`}
                    className="absolute rounded-sm"
                    data-rendered-note-debug={marker.active ? 'active' : 'true'}
                    data-rendered-note-debug-part={marker.partId ?? 'partless'}
                    data-rendered-note-debug-entity={marker.coreEntityId ?? 'none'}
                    data-rendered-note-debug-measure={marker.measureNumber}
                    data-rendered-note-debug-staff={marker.staffIndex}
                    data-rendered-note-debug-voice={marker.voiceId}
                    data-rendered-note-debug-timestamp={marker.timestamp}
                    title={marker.title}
                    style={{
                      left: `${marker.x + 5}px`,
                      top: `${marker.y - 11}px`,
                      zIndex: marker.active ? 11 : 9,
                      maxWidth: '190px',
                      padding: '1px 4px',
                      borderRadius: '4px',
                      border: marker.active
                        ? '1px solid rgba(37, 99, 235, 0.85)'
                        : '1px solid rgba(15, 23, 42, 0.34)',
                      backgroundColor: marker.active
                        ? 'rgba(37, 99, 235, 0.92)'
                        : marker.partId?.includes('P2')
                          ? 'rgba(217, 119, 6, 0.86)'
                          : 'rgba(15, 23, 42, 0.78)',
                      color: 'white',
                      fontSize: '9px',
                      lineHeight: '12px',
                      fontWeight: 700,
                      whiteSpace: 'nowrap',
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                      boxShadow: '0 1px 2px rgba(15, 23, 42, 0.24)',
                      pointerEvents: 'none',
                    }}
                  >
                    {marker.label}
                  </div>
                ))}
                {measureLayoutOverlays
                  .filter((overlay) => visibleMeasureSelectionIds.includes(overlay.measureId))
                  .map((overlay) => {
                    const selectedSystemOverlays = measureLayoutOverlays
                      .filter((entry) => (
                        visibleMeasureSelectionIds.includes(entry.measureId)
                        && entry.systemIndex === overlay.systemIndex
                      ));
                    const top = selectedSystemOverlays.length > 0
                      ? Math.min(...selectedSystemOverlays.map((entry) => entry.domRect.y))
                      : overlay.domRect.y;
                    const bottom = selectedSystemOverlays.length > 0
                      ? Math.max(...selectedSystemOverlays.map((entry) => entry.domRect.y + entry.domRect.height))
                      : (overlay.domRect.y + overlay.domRect.height);
                    return (
                      <div
                        key={`measure-selection:${overlay.measureId}`}
                        className="absolute rounded-sm"
                        data-selected-measure="true"
                        style={{
                          left: `${overlay.domRect.x}px`,
                          top: `${top}px`,
                          width: `${overlay.domRect.width}px`,
                          height: `${bottom - top}px`,
                          backgroundColor: visualDebugEnabled ? 'transparent' : 'rgba(59, 130, 246, 0.22)',
                          boxShadow: visualDebugEnabled
                            ? 'inset 0 0 0 2px rgba(124, 58, 237, 0.85)'
                            : 'inset 0 0 0 1px rgba(37, 99, 235, 0.85)',
                          borderRadius: '4px',
                          zIndex: visualDebugEnabled ? 1 : undefined,
                        }}
                      />
                    );
                  })}
                {systemLayoutOverlays.map((overlay) => (
                  <div
                    key={`system:${overlay.systemIndex}`}
                    className="absolute"
                    style={{
                      left: `${overlay.domRect.x}px`,
                      top: `${overlay.domRect.y + overlay.domRect.height + 4}px`,
                      width: `${overlay.domRect.width}px`,
                      height: `${overlay.spacingGuideHeight}px`,
                    }}
                    data-layout-system-guide={overlay.systemIndex}
                    data-layout-staff-spacing={overlay.defaultStaffSpacing}
                    data-layout-collision-mode={overlay.collisionMode}
                    data-layout-collision-pressure={overlay.collisionPressure.toFixed(2)}
                    data-layout-total-weight={overlay.totalWidthWeight.toFixed(3)}
                  />
                ))}
                {inlineChordEditor && (
                  <form
                    className="pointer-events-auto absolute z-30"
                    data-testid="inline-chord-symbol-editor"
                    style={{
                      left: `${inlineChordEditor.left}px`,
                      top: `${inlineChordEditor.top}px`,
                    }}
                    onSubmit={(event) => {
                      event.preventDefault();
                      commitInlineChordEditor();
                    }}
                  >
                    <input
                      ref={inlineChordInputRef}
                      defaultValue={inlineChordEditor.value}
                      onKeyDown={(event) => {
                        if (event.key === 'Enter') {
                          event.preventDefault();
                          commitInlineChordEditor();
                        } else if (event.key === 'Escape') {
                          event.preventDefault();
                          setInlineChordEditor(null);
                        }
                      }}
                      aria-label="Inline chord symbol"
                      placeholder="Cmaj7"
                      className="h-7 w-28 rounded-md border border-nex-accent bg-white px-2 text-xs font-semibold text-nex-ink shadow-lg outline-none ring-2 ring-white/90 placeholder:text-slate-300"
                    />
                  </form>
                )}
                {inlineGuitarFretEditor && (
                  <form
                    className="pointer-events-auto absolute z-30"
                    data-testid="inline-guitar-fret-editor"
                    style={{
                      left: `${inlineGuitarFretEditor.left}px`,
                      top: `${inlineGuitarFretEditor.top}px`,
                    }}
                    onSubmit={(event) => {
                      event.preventDefault();
                      commitInlineGuitarFretEditor();
                    }}
                  >
                    <input
                      ref={inlineGuitarFretInputRef}
                      defaultValue={inlineGuitarFretEditor.value}
                      inputMode="numeric"
                      pattern="[0-9]*"
                      maxLength={2}
                      onKeyDown={(event) => {
                        if (event.key === 'Enter') {
                          event.preventDefault();
                          commitInlineGuitarFretEditor();
                        } else if (event.key === 'Escape') {
                          event.preventDefault();
                          setInlineGuitarFretEditor(null);
                        }
                      }}
                      onBlur={() => {
                        commitInlineGuitarFretEditor();
                      }}
                      aria-label="Inline guitar fret"
                      className="h-7 w-12 rounded-md border border-nex-accent bg-white px-2 text-center text-xs font-semibold text-nex-ink shadow-lg outline-none ring-2 ring-white/90"
                    />
                  </form>
                )}
                <ScoreInputOverlay
                  target={visibleScoreInputTarget}
                  enabled={noteInputMode || Boolean(dragPreviewTarget)}
                  duration={selectedDuration}
                  isDotted={isDotted}
                  showNaturalAccidental={selectedAccidental === 'natural'}
                  leadingGuardRightX={visibleScoreInputTarget?.cursorOnly ? null : scoreInputLeadingGuardRightX}
                  tabletEntryPhase={tabletEntryVisual.phase}
                  previewPointerType={tabletEntryVisual.pointerType}
                  contactPoint={tabletEntryVisual.point}
                  viewportBounds={{
                    left: viewportBox.scrollLeft,
                    top: viewportBox.scrollTop,
                    width: viewportBox.width,
                    height: viewportBox.height,
                  }}
                />
              </div>
            </div>
          </div>
        </div>
      </div>

      <div className="border-t border-nex-border bg-white px-3 py-2">
        <div className="flex items-center justify-between gap-3 text-xs text-slate-600">
          <div className="flex items-center gap-2">
            <button
              type="button"
              className={`rounded-md px-2 py-1 font-semibold transition-colors ${navigatorVisible ? 'nex-brand-active' : 'bg-nex-surface hover:bg-nex-border hover:text-nex-ink'}`}
              onClick={() => setNavigatorVisible((current) => !current)}
              aria-pressed={navigatorVisible}
              title="Navigator"
            >
              Navigator
            </button>
            <button
              type="button"
              className={`rounded-md px-2 py-1 font-semibold transition-colors ${findVisible ? 'nex-brand-active' : 'bg-nex-surface hover:bg-nex-border hover:text-nex-ink'}`}
              onClick={() => setFindVisible((current) => !current)}
              aria-pressed={findVisible}
              title={`Find/Go to (${formatShortcutHint('Cmd/Ctrl+F')})`}
            >
              Find/Go to
            </button>
          </div>

          <div className="flex items-center gap-2">
            <button type="button" className="rounded-md bg-nex-surface px-2 py-1 font-semibold hover:bg-nex-border hover:text-nex-ink" onClick={() => adjustZoom(-ZOOM_STEP)}>-</button>
            <button type="button" className="rounded-md bg-nex-surface px-2 py-1 font-semibold hover:bg-nex-border hover:text-nex-ink" onClick={() => setZoom(100)}>100%</button>
            <input
              type="number"
              min={MIN_ZOOM}
              max={MAX_ZOOM}
              value={zoomPercent}
              onChange={(event) => setZoom(Number.parseInt(event.target.value || '100', 10))}
              className="w-16 rounded-md border border-nex-border px-2 py-1 text-right focus:outline-none focus:border-nex-accent"
              aria-label="Zoom percent"
            />
            <button type="button" className="rounded-md bg-nex-surface px-2 py-1 font-semibold hover:bg-nex-border hover:text-nex-ink" onClick={() => adjustZoom(ZOOM_STEP)}>+</button>
            <select
              aria-label="Zoom preset"
              className="rounded-md border border-nex-border px-2 py-1 focus:outline-none focus:border-nex-accent"
              value={String(zoomPercent)}
              onChange={(event) => setZoom(Number.parseInt(event.target.value, 10))}
            >
              {ZOOM_PRESETS.map((preset) => (
                <option key={preset} value={preset}>{preset}%</option>
              ))}
            </select>
          </div>

          <div className="flex items-center gap-2">
            <span className="text-slate-400">View</span>
            <select
              aria-label="Score view mode"
              className="rounded-md border border-nex-border px-2 py-1 focus:outline-none focus:border-nex-accent"
              value={viewMode}
              onChange={(event) => setViewMode(event.target.value as ScoreViewMode)}
            >
              {Object.entries(VIEW_LABELS).map(([value, label]) => (
                <option key={value} value={value}>{label}</option>
              ))}
            </select>
          </div>
        </div>
      </div>
    </div>
  );
}
