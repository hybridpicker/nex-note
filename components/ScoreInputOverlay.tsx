import type { ReactElement } from 'react';
import type { NoteDuration } from '@/hooks/useNoteEditor';
import {
  renderTupletBadge,
  type AccidentalAlter,
  type GhostStemDirection,
} from '@/src/render-bridge/utils/svg-helpers';
import { EngravedNoteGlyph } from '@/components/EngravedNoteGlyph';
import type { GhostPlacementMode } from '@/src/score-input/smart-ghost-note';
import type { DragTransposeMode } from '@/src/score-input/transpose-logic';
import type { TabletEntryPhase, TabletEntryPoint } from '@/src/score-input/tablet-entry-session';
import { formatPitchLabel } from '@/src/score-input/staff-pitch';
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
  showNaturalAccidental?: boolean;
  leadingGuardRightX?: number | null;
  tabletEntryPhase?: TabletEntryPhase;
  previewPointerType?: string | null;
  contactPoint?: TabletEntryPoint | null;
  viewportBounds?: {
    left: number;
    top: number;
    width: number;
    height: number;
  } | null;
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
    notehead: 'rgba(79, 70, 255, 0.45)',
    stem: 'rgba(79, 70, 255, 0.9)',
    accidental: 'rgba(79, 70, 255, 0.95)',
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

const DURATION_I18N_KEYS = {
  '64': 'note.duration.64',
  '32': 'note.duration.32',
  '16': 'note.duration.16',
  '8': 'note.duration.8',
  '4': 'note.duration.4',
  '2': 'note.duration.2',
  '1': 'note.duration.1',
  breve: 'note.duration.breve',
  long: 'note.duration.long',
} as const;

function midiNumber(step: string, alter: number, octave: number) {
  return ((octave + 1) * 12) + (STEP_TO_SEMITONE[step] ?? 0) + alter;
}

function clampAlter(alter: number): AccidentalAlter {
  if (alter === -2 || alter === -1 || alter === 0 || alter === 1 || alter === 2) return alter;
  return 0;
}

function placementLabel(
  mode: GhostPlacementMode | undefined,
  labels: { replace: string; insert: string; chord: string },
) {
  if (mode === 'replace') return labels.replace;
  if (mode === 'chord') return labels.chord;
  return labels.insert;
}

export function ScoreInputOverlay(props: ScoreInputOverlayProps): ReactElement | null {
  const {
    target,
    enabled,
    duration,
    isDotted,
    showNaturalAccidental = false,
    leadingGuardRightX = null,
    tabletEntryPhase = 'idle',
    previewPointerType = null,
    contactPoint = null,
    viewportBounds = null,
  } = props;
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
  const pitch = formatPitchLabel(target.step, target.alter, target.octave, {
    showNatural: showNaturalAccidental && target.alter === 0,
  });
  const palette = transposePreviewPalette(target.transposeMode, target.voiceId);
  const midi = midiNumber(target.step, target.alter, target.octave);
  const pianoRollLanes = Array.from({ length: 13 }, (_, index) => midi + 6 - index);
  const previewScale = target.isGraceTarget ? 0.7 : 1;
  const transposeBadge = target.transposeMode === 'chromatic' ? 'C'
    : target.transposeMode === 'diatonic' ? 'D'
      : null;
  const isTabPreview = target.tabFret != null;
  const showPianoRoll = Boolean(target.transposeMode) && !isTabPreview;
  const showPlacementBadge = !target.cursorOnly;
  const contactPreviewActive = tabletEntryPhase === 'contact-preview' || tabletEntryPhase === 'refining';
  const showLoupe = contactPreviewActive && (previewPointerType === 'touch' || previewPointerType === 'pen');
  const noteheadCanvasX = target.previewLeft + target.noteheadCenterX;
  const chipOnLeft = viewportBounds
    ? noteheadCanvasX > viewportBounds.left + viewportBounds.width - 104
    : false;
  const loupeWidth = 156;
  const loupeHeight = 112;
  const loupePoint = contactPoint ?? {
    x: noteheadCanvasX,
    y: target.previewTop + 28,
  };
  const loupeOnLeft = viewportBounds
    ? loupePoint.x > viewportBounds.left + viewportBounds.width - loupeWidth - 44
    : false;
  const loupeBelow = viewportBounds
    ? loupePoint.y - loupeHeight - 48 < viewportBounds.top
    : false;
  const loupeLeft = loupePoint.x - target.previewLeft + (loupeOnLeft ? -loupeWidth - 36 : 36);
  const loupeTop = loupePoint.y - target.previewTop + (loupeBelow ? 44 : -loupeHeight - 44);
  const placementLabels = {
    replace: t('note.placementReplace'),
    insert: t('note.placementInsert'),
    chord: t('note.placementChord'),
  };
  const durationKey = DURATION_I18N_KEYS[String(duration) as keyof typeof DURATION_I18N_KEYS]
    ?? 'note.duration.4';
  const durationLabel = t(durationKey).replace(/\s*\([^)]*\)\s*$/, '');
  const dottedLabel = t('note.dotted').replace(/\s*\([^)]*\)\s*$/, '');

  return (
    <div
      className="nex-score-input-preview pointer-events-none absolute z-[5] overflow-visible"
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
      data-tablet-entry-phase={tabletEntryPhase}
      data-preview-pointer-type={previewPointerType ?? ''}
      data-preview-stable-pitch={pitch}
      data-preview-stable-staff={target.staffIndex}
      data-preview-stable-timestamp={`${target.timestampNum}/${target.timestampDen}`}
      data-preview-voice={target.voiceId}
      data-preview-placement={target.placementMode ?? 'insert'}
      style={{
        left: `${target.previewLeft}px`,
        top: `${target.previewTop}px`,
        width: `${target.previewWidth}px`,
        height: `${target.previewHeight}px`,
        opacity: 1,
      }}
    >
      {!target.cursorOnly && (
        <>
          <div
            aria-hidden
            data-testid="pitch-lane-indicator"
            className="absolute rounded-full"
            style={{
              left: `${target.noteheadCenterX - 34}px`,
              top: '26px',
              width: '68px',
              height: '4px',
              background: palette.notehead,
              opacity: 0.16,
              boxShadow: `0 0 0 1px ${palette.stem}`,
            }}
          />
          <div
            aria-hidden
            data-testid="onset-caret"
            className="absolute"
            style={{
              left: `${target.noteheadCenterX}px`,
              top: '-14px',
              height: `${target.previewHeight + 28}px`,
              borderLeft: `1px solid ${palette.stem}`,
              opacity: 0.38,
            }}
          />
        </>
      )}
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
          position: 'relative',
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
              {target.isTuplet && renderTupletBadge({ width: target.previewWidth, label: target.tupletLabel ?? '3', color: palette.stem })}
            </>
          )}
        </svg>
        {!isTabPreview && (
          <EngravedNoteGlyph
            duration={duration as NoteDuration}
            dotted={isDotted}
            stemDirection={target.stemDirection}
            accidentalAlter={alter}
            noteheadCenterX={target.noteheadCenterX}
            noteheadCenterY={28}
            color={palette.notehead}
          />
        )}
      </div>
      {!target.cursorOnly && (
        <div
          data-testid="pitch-chip"
          aria-label={t('note.pitchPreviewDetail', { pitch, midi, voice: target.voiceId, staff: target.staffIndex, measure: target.measureNumber })}
          className="absolute whitespace-nowrap rounded-full border border-slate-200/90 bg-white/95 px-2.5 py-1 text-[13px] font-bold tracking-[0.02em] text-slate-900 shadow-md"
          style={{
            left: chipOnLeft
              ? `${Math.max(target.noteheadCenterX - 68, -16)}px`
              : `${Math.max(target.noteheadCenterX + 14, 12)}px`,
            top: '-28px',
          }}
        >
          {pitch}
        </div>
      )}
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
          className="absolute flex items-center gap-1.5 whitespace-nowrap rounded-full border border-slate-200/80 px-2 py-0.5 text-[10px] font-semibold tracking-[0.04em]"
          style={{
            left: `${Math.max(target.noteheadCenterX + 18, target.previewWidth + 6)}px`,
            top: `${target.previewHeight + 8}px`,
            backgroundColor: palette.badgeBg,
            color: palette.badgeText,
          }}
        >
          <span
            aria-hidden
            className="inline-block h-2 w-2 rounded-full border border-white/80"
            style={{ backgroundColor: palette.notehead }}
          />
          {target.isGraceTarget
            ? t('note.placementGrace', { mode: placementLabel(target.placementMode, placementLabels) })
            : placementLabel(target.placementMode, placementLabels)}
          <span aria-hidden>·</span>
          <span>{t('note.voice')} {target.voiceId}</span>
          <span aria-hidden>·</span>
          <span>{durationLabel}{isDotted ? ` · ${dottedLabel}` : ''}</span>
        </div>
      )}
      {showLoupe && (
        <div
          data-testid="pitch-loupe"
          aria-label={t('note.pitchPreviewDetail', { pitch, midi, voice: target.voiceId, staff: target.staffIndex, measure: target.measureNumber })}
          data-loupe-placement={`${loupeBelow ? 'below' : 'above'}-${loupeOnLeft ? 'left' : 'right'}`}
          className="absolute overflow-hidden rounded-2xl border border-slate-300/90 bg-white/97 shadow-[0_16px_44px_-14px_rgba(15,23,42,0.45)]"
          style={{
            left: `${loupeLeft}px`,
            top: `${loupeTop}px`,
            width: `${loupeWidth}px`,
            height: `${loupeHeight}px`,
          }}
        >
          <div className="absolute left-3 top-2 rounded-full bg-slate-900 px-2 py-0.5 text-xs font-bold text-white">
            {pitch}
          </div>
          <div className="absolute left-0 right-0 top-[42px] h-[48px]" aria-hidden>
            {[0, 1, 2, 3, 4].map((line) => (
              <div
                key={`loupe-staff:${line}`}
                className="absolute left-4 right-4 h-px bg-slate-500/65"
                style={{ top: `${line * 9}px` }}
              />
            ))}
            <div
              className="absolute left-1/2 top-[18px] -translate-x-1/2"
              style={{ transform: 'translateX(-50%) scale(1.45)' }}
            >
              <EngravedNoteGlyph
                duration={duration as NoteDuration}
                dotted={isDotted}
                stemDirection={target.stemDirection}
                accidentalAlter={alter}
                noteheadCenterX={target.noteheadCenterX}
                noteheadCenterY={28}
                color={palette.notehead}
              />
            </div>
          </div>
          <div className="absolute bottom-2 left-3 right-3 flex items-center justify-between text-[10px] font-semibold text-slate-500">
            <span>{placementLabel(target.placementMode, placementLabels)}</span>
            <span>{t('note.voice')} {target.voiceId}</span>
          </div>
        </div>
      )}
    </div>
  );
}
