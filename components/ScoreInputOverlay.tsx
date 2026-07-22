import type { ReactElement } from 'react';
import {
  renderAccidental,
  renderAugmentationDot,
  renderFlags,
  renderNoteHead,
  renderStem,
  renderTupletBadge,
  type AccidentalAlter,
  type GhostStemDirection,
} from '@/src/render-bridge/utils/svg-helpers';
import type { GhostPlacementMode } from '@/src/score-input/smart-ghost-note';
import type { DragTransposeMode } from '@/src/score-input/transpose-logic';
import { useI18n } from '@/lib/i18n';

/**
 * Structural shape the overlay reads from the current GhostNoteTarget.
 * Declared here so the overlay does not depend on the larger
 * GhostNoteTarget type in ScoreEditor.tsx while PR3 is still pending.
 */
export interface GhostPreviewTarget {
  measureId?: string;
  corePartId?: string | null;
  measureNumber: number;
  staffIndex: number;
  timestampNum: number;
  timestampDen: number;
  voiceId: number;
  step: string;
  octave: number;
  alter: number;
  previewLeft: number;
  previewTop: number;
  previewWidth: number;
  previewHeight: number;
  accidentalOffsetX: number;
  noteheadCenterX: number;
  stemDirection: GhostStemDirection;
  placementMode?: GhostPlacementMode;
  transposeMode?: DragTransposeMode;
  ledgerLines?: Array<{ y: number; x1: number; x2: number }>;
  isGraceTarget?: boolean;
  dragLockLine?: {
    x: number;
    top: number;
    height: number;
    isNearEscape: boolean;
  };
  dragPulse?: boolean;
  isTuplet?: boolean;
  tupletLabel?: string | null;
  tabFret?: number | null;
  tabString?: number | null;
  reflowHints?: Array<{
    left: number;
    top: number;
    shiftX: number;
    width: number;
    height: number;
  }>;
  resolvedTarget?: {
    measureId?: string | null;
    corePartId?: string | null;
    measureNumber?: number;
    staffIndex?: number;
    voiceId?: number;
    timestampNum?: number;
    timestampDen?: number;
    domX?: number | null;
    mode?: string;
    diagnostics?: string[];
  };
  snapResolution?: unknown;
  cursorOnly?: boolean;
}

export interface ScoreInputOverlayProps {
  target: GhostPreviewTarget | null;
  enabled: boolean;
  duration: string | number;
  isDotted: boolean;
  leadingGuardRightX?: number | null;
}

function voicePreviewPalette(voiceId: number) {
  if (voiceId === 2) {
    return {
      notehead: 'rgba(34, 197, 94, 0.82)',
      stem: 'rgba(22, 163, 74, 0.96)',
      accidental: 'rgba(21, 128, 61, 0.98)',
    };
  }
  if (voiceId === 3) {
    return {
      notehead: 'rgba(249, 115, 22, 0.84)',
      stem: 'rgba(234, 88, 12, 0.96)',
      accidental: 'rgba(194, 65, 12, 0.98)',
    };
  }
  if (voiceId === 4) {
    return {
      notehead: 'rgba(168, 85, 247, 0.82)',
      stem: 'rgba(147, 51, 234, 0.96)',
      accidental: 'rgba(126, 34, 206, 0.98)',
    };
  }
  return {
    notehead: 'rgba(37, 99, 235, 0.84)',
    stem: 'rgba(37, 99, 235, 0.98)',
    accidental: 'rgba(37, 99, 235, 0.98)',
  };
}

function transposePreviewPalette(mode: DragTransposeMode | undefined, voiceId: number) {
  if (mode === 'chromatic') {
    return {
      notehead: 'rgba(249, 115, 22, 0.68)',
      stem: 'rgba(234, 88, 12, 0.9)',
      accidental: 'rgba(194, 65, 12, 0.94)',
      badgeBg: 'rgba(194, 65, 12, 0.92)',
      badgeText: 'rgba(255, 247, 237, 1)',
      glow: 'drop-shadow(0 0 10px rgba(249, 115, 22, 0.22))',
    };
  }
  if (mode === 'diatonic') {
    return {
      ...voicePreviewPalette(voiceId),
      badgeBg: 'rgba(15, 23, 42, 0.86)',
      badgeText: 'rgba(241, 245, 249, 1)',
      glow: 'drop-shadow(0 0 8px rgba(37, 99, 235, 0.12))',
    };
  }
  return {
    ...voicePreviewPalette(voiceId),
    badgeBg: 'rgba(15, 23, 42, 0.86)',
    badgeText: 'rgba(241, 245, 249, 1)',
    glow: 'none',
  };
}

const STEP_TO_SEMITONE: Record<string, number> = {
  C: 0,
  D: 2,
  E: 4,
  F: 5,
  G: 7,
  A: 9,
  B: 11,
};

function midiNumber(step: string, alter: number, octave: number) {
  return ((octave + 1) * 12) + (STEP_TO_SEMITONE[step] ?? 0) + alter;
}

function formatPitch(step: string, alter: number, octave: number): string {
  const accidental = alter === 1 ? '#'
    : alter === -1 ? 'b'
      : alter === 2 ? 'x'
        : alter === -2 ? 'bb'
          : '';
  return `${step}${accidental}${octave}`;
}

function clampAlter(alter: number): AccidentalAlter {
  if (alter === -2 || alter === -1 || alter === 0 || alter === 1 || alter === 2) return alter;
  return 0;
}

function placementLabel(
  mode: GhostPlacementMode | undefined,
  labels: { replace: string; insert: string; multiVoice: string },
) {
  if (mode === 'replace') return labels.replace;
  if (mode === 'chord') return labels.multiVoice;
  return labels.insert;
}

export function ScoreInputOverlay(props: ScoreInputOverlayProps): ReactElement | null {
  const { target, enabled, duration, isDotted, leadingGuardRightX = null } = props;
  const { t } = useI18n();
  if (!enabled || !target) return null;
  if (
    leadingGuardRightX != null
    && target.placementMode !== 'chord'
    && target.previewLeft + target.noteheadCenterX < leadingGuardRightX
  ) {
    return null;
  }

  const alter = clampAlter(target.alter);
  const pitch = formatPitch(target.step, target.alter, target.octave);
  const palette = transposePreviewPalette(target.transposeMode, target.voiceId);
  const midi = midiNumber(target.step, target.alter, target.octave);
  const pianoRollLanes = Array.from({ length: 13 }, (_, index) => midi + 6 - index);
  const previewScale = target.isGraceTarget ? 0.7 : 1;
  const transposeBadge = target.transposeMode === 'chromatic' ? 'C'
    : target.transposeMode === 'diatonic' ? 'D'
      : null;
  const isTabPreview = target.tabFret != null;
  const showPianoRoll = Boolean(target.transposeMode) && !isTabPreview;
  const showPlacementBadge = !target.cursorOnly
    && (Boolean(target.transposeMode) || target.isGraceTarget || target.placementMode !== 'insert');
  const placementLabels = {
    replace: t('note.placementReplace'),
    insert: t('note.placementInsert'),
    multiVoice: t('note.placementMultiVoice'),
  };

  return (
    <div
      className="pointer-events-none absolute z-[5] overflow-visible"
      data-testid={target.cursorOnly ? 'duration-input-pitch-cursor' : 'ghost-note-preview'}
      data-duration-input-cursor={target.cursorOnly ? 'true' : undefined}
      data-ghost-measure-id={target.measureId ?? ''}
      data-ghost-core-part-id={target.corePartId ?? ''}
      data-ghost-measure={target.measureNumber}
      data-ghost-timestamp={`${target.timestampNum}/${target.timestampDen}`}
      data-ghost-pitch={pitch}
      data-ghost-staff={target.staffIndex}
      data-ghost-stem={target.stemDirection}
      data-ghost-mode={target.placementMode ?? 'insert'}
      data-ghost-voice={target.voiceId}
      data-ghost-diagnostics={target.resolvedTarget?.diagnostics?.join('|') ?? ''}
      data-ghost-commit-measure-id={target.resolvedTarget?.measureId ?? target.measureId ?? ''}
      data-ghost-commit-core-part-id={target.resolvedTarget?.corePartId ?? target.corePartId ?? ''}
      data-ghost-commit-measure={target.resolvedTarget?.measureNumber ?? ''}
      data-ghost-commit-staff={target.resolvedTarget?.staffIndex ?? ''}
      data-ghost-commit-voice={target.resolvedTarget?.voiceId ?? ''}
      data-ghost-commit-timestamp={
        target.resolvedTarget?.timestampNum != null && target.resolvedTarget?.timestampDen != null
          ? `${target.resolvedTarget.timestampNum}/${target.resolvedTarget.timestampDen}`
          : ''
      }
      data-ghost-commit-x={target.resolvedTarget?.domX ?? ''}
      data-ghost-commit-mode={target.resolvedTarget?.mode ?? ''}
      data-ghost-snap-trace={target.snapResolution ? JSON.stringify(target.snapResolution) : ''}
      data-ghost-notehead-center-x={target.noteheadCenterX}
      data-ghost-notehead-center-y={28}
      data-ghost-tab-fret={target.tabFret ?? ''}
      data-ghost-tab-string={target.tabString ?? ''}
      style={{
        left: `${target.previewLeft}px`,
        top: `${target.previewTop}px`,
        width: `${target.previewWidth}px`,
        height: `${target.previewHeight}px`,
        opacity: 1,
      }}
    >
      {target.dragLockLine && (
        <div
          className="absolute"
          aria-hidden
          style={{
            left: `${target.dragLockLine.x - target.previewLeft}px`,
            top: `${target.dragLockLine.top - target.previewTop}px`,
            height: `${target.dragLockLine.height}px`,
            width: '1px',
            background: 'rgba(34, 211, 238, 0.45)',
            borderLeft: target.dragLockLine.isNearEscape ? '1px dashed rgba(34, 211, 238, 0.72)' : '1px solid rgba(34, 211, 238, 0.72)',
            boxShadow: target.dragLockLine.isNearEscape ? '0 0 0 2px rgba(34, 211, 238, 0.08)' : '0 0 0 1px rgba(34, 211, 238, 0.04)',
          }}
        />
      )}
      <div
        style={{
          animation: target.dragPulse ? 'nex-note-ghost-jump 180ms ease-out' : undefined,
          filter: target.transposeMode ? palette.glow : 'drop-shadow(0 0 1px rgba(15, 23, 42, 0.16))',
          transition: 'filter 160ms ease, opacity 160ms ease',
        }}
      >
        <svg
          width={target.previewWidth}
          height={target.previewHeight}
          viewBox={`0 0 ${target.previewWidth} ${target.previewHeight}`}
          fill="none"
          aria-hidden
          style={{
            transform: `scale(${previewScale})`,
            transformOrigin: `${target.noteheadCenterX}px 28px`,
          }}
        >
          {target.ledgerLines?.map((line, index) => (
            <line
              key={`ledger:${index}:${line.y}`}
              x1={line.x1}
              y1={line.y}
              x2={line.x2}
              y2={line.y}
              stroke={palette.stem}
              strokeWidth="1.2"
              strokeLinecap="round"
              opacity="0.9"
            />
          ))}
          {isTabPreview ? (
            <text
              x={target.noteheadCenterX}
              y={28}
              textAnchor="middle"
              dominantBaseline="central"
              fontSize="15"
              fontWeight="700"
              fill={palette.notehead}
              stroke="rgba(255, 255, 255, 0.92)"
              strokeWidth="3"
              paintOrder="stroke"
            >
              {target.tabFret}
            </text>
          ) : (
            <>
              {renderAccidental({ alter, color: palette.accidental })}
              {renderNoteHead({ noteheadCenterX: target.noteheadCenterX, duration, color: palette.notehead })}
              {renderStem({
                noteheadCenterX: target.noteheadCenterX,
                duration,
                direction: target.stemDirection,
                color: palette.stem,
              })}
              {renderFlags({
                noteheadCenterX: target.noteheadCenterX,
                duration,
                direction: target.stemDirection,
                color: palette.stem,
              })}
              {isDotted && renderAugmentationDot({ noteheadCenterX: target.noteheadCenterX, color: palette.stem })}
              {target.isTuplet && renderTupletBadge({ width: target.previewWidth, label: target.tupletLabel ?? '3', color: palette.stem })}
            </>
          )}
        </svg>
      </div>
      {showPianoRoll && (
        <div
          className="absolute rounded-md border border-slate-200/80 bg-white/90 shadow-sm"
          style={{
            left: `${target.previewWidth + 8}px`,
            top: '-6px',
            width: '88px',
            height: '56px',
          }}
          data-testid="ghost-piano-roll"
        >
          <div className="absolute inset-0 overflow-hidden rounded-md">
            {pianoRollLanes.map((laneMidi, index) => {
              const isBlack = [1, 3, 6, 8, 10].includes(((laneMidi % 12) + 12) % 12);
              const laneTop = index * (56 / pianoRollLanes.length);
              return (
                <div
                  key={`piano-lane:${laneMidi}`}
                  className="absolute left-0 right-0 border-b border-slate-200/70"
                  style={{
                    top: `${laneTop}px`,
                    height: `${56 / pianoRollLanes.length}px`,
                    backgroundColor: laneMidi === midi
                      ? palette.notehead
                      : isBlack
                        ? 'rgba(15, 23, 42, 0.08)'
                        : 'rgba(248, 250, 252, 0.92)',
                  }}
                />
              );
            })}
            <div
              className="absolute rounded-sm"
              style={{
                left: `${Math.max((target.timestampNum / Math.max(target.timestampDen, 1)) * 64, 4)}px`,
                top: `${pianoRollLanes.findIndex((laneMidi) => laneMidi === midi) * (56 / pianoRollLanes.length) + 2}px`,
                width: '18px',
                height: `${Math.max((56 / pianoRollLanes.length) - 4, 2)}px`,
                backgroundColor: palette.stem,
                boxShadow: '0 0 0 1px rgba(15, 23, 42, 0.08)',
              }}
            />
          </div>
        </div>
      )}
      {transposeBadge && (
        <div
          className="absolute rounded-full border border-white/40 px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-[0.12em] shadow-sm"
          style={{
            left: `${Math.max(target.noteheadCenterX + 10, 0)}px`,
            top: '-8px',
            backgroundColor: palette.badgeBg,
            color: palette.badgeText,
          }}
        >
          {transposeBadge}
        </div>
      )}
      {showPlacementBadge && (
        <div
          className="absolute rounded-full border border-slate-200/80 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.16em]"
          style={{
            left: `${Math.max(target.noteheadCenterX + 18, target.previewWidth + 6)}px`,
            top: `${target.previewHeight + 8}px`,
            backgroundColor: palette.badgeBg,
            color: palette.badgeText,
          }}
        >
          {target.isGraceTarget
            ? t('note.placementGrace', { mode: placementLabel(target.placementMode, placementLabels) })
            : placementLabel(target.placementMode, placementLabels)}
        </div>
      )}
    </div>
  );
}
