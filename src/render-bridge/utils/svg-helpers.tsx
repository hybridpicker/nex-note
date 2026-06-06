import type { ReactElement } from 'react';

/**
 * Pure SVG primitives for the note-input ghost preview. Extracted 1:1 from the
 * inline block that used to live in ScoreEditor.tsx so the visual output stays
 * pixel-identical. Color is parameterized to prepare for voice-coloring without
 * introducing the feature yet.
 */

export const GHOST_NOTE_HEAD_COLOR = 'rgba(37, 99, 235, 0.55)';
export const GHOST_NOTE_STEM_COLOR = 'rgba(37, 99, 235, 0.7)';
export const GHOST_NOTE_ACCIDENTAL_COLOR = 'rgba(37, 99, 235, 0.72)';

export type AccidentalAlter = -2 | -1 | 0 | 1 | 2;
export type GhostStemDirection = 'up' | 'down';

function durationNumber(duration: string | number): number {
  if (typeof duration === 'number') return duration;
  if (duration === 'breve') return 0.5;
  if (duration === 'long') return 0.25;
  return Number.parseInt(duration, 10);
}

export function renderAccidental(params: {
  alter: AccidentalAlter;
  color?: string;
}): ReactElement | null {
  const { alter } = params;
  const color = params.color ?? GHOST_NOTE_ACCIDENTAL_COLOR;
  if (alter === 0) return null;

  if (alter === 2) {
    return (
      <path
        d="M2.2 21.3L4 20.3L7.1 24.5L10.2 20.3L12 21.3L8.7 26.8L12 32.2L10.2 33.2L7.1 29L4 33.2L2.2 32.2L5.5 26.8L2.2 21.3Z"
        fill={color}
      />
    );
  }

  if (alter === 1) {
    return (
      <g fill="none" stroke={color} strokeLinecap="round">
        <path d="M5.5 19.2L4.8 33.2" strokeWidth="1.35" />
        <path d="M10.6 18.4L9.9 32.4" strokeWidth="1.35" />
        <path d="M2.3 23.6L13 21.7" strokeWidth="1.9" />
        <path d="M2.1 29.4L12.8 27.5" strokeWidth="1.9" />
      </g>
    );
  }

  if (alter === -1 || alter === -2) {
    const FlatShape = ({ x = 0 }: { x?: number }) => (
      <path
        d={`M${x + 4} 16.2V35.2M${x + 4} 30.8C${x + 5.1} 29.1 ${x + 6.7} 28.2 ${x + 8.6} 28.2C${x + 10.7} 28.2 ${x + 11.8} 29.5 ${x + 11.8} 31.3C${x + 11.8} 33.8 ${x + 9.4} 35.2 ${x + 6.8} 35.2H${x + 4}`}
        stroke={color}
        strokeWidth="1.55"
        strokeLinecap="round"
        strokeLinejoin="round"
        fill="none"
      />
    );
    if (alter === -2) {
      return (
        <g>
          <FlatShape x={-2.4} />
          <FlatShape x={4.2} />
        </g>
      );
    }
    return <FlatShape />;
  }

  return (
    <g fill="none" stroke={color} strokeLinecap="round">
      <path d="M5.1 17.8V31.2" strokeWidth="1.5" />
      <path d="M11.1 21.1V34.5" strokeWidth="1.5" />
      <path d="M5.1 23.7L11.1 21.8" strokeWidth="1.9" />
      <path d="M5.1 30L11.1 28.1" strokeWidth="1.9" />
    </g>
  );
}

export function renderNoteHead(params: {
  noteheadCenterX: number;
  duration: string | number;
  color?: string;
}): ReactElement {
  const color = params.color ?? GHOST_NOTE_HEAD_COLOR;
  const durationNum = durationNumber(params.duration);
  const isBreve = params.duration === 'breve';
  const isLong = params.duration === 'long';
  const wholeNote = durationNum === 1 || isBreve || isLong;
  const openHead = durationNum <= 2 || isBreve || isLong;
  const cx = params.noteheadCenterX;
  return (
    <g>
      {(isBreve || isLong) && (
        <>
          <line x1={cx - 8.5} y1="22" x2={cx - 8.5} y2="34" stroke={color} strokeWidth="1.45" strokeLinecap="round" />
          <line x1={cx + 8.5} y1="22" x2={cx + 8.5} y2="34" stroke={color} strokeWidth="1.45" strokeLinecap="round" />
        </>
      )}
      <ellipse
        cx={cx}
        cy="28"
        rx={wholeNote ? 6.2 : 5.5}
        ry={wholeNote ? 4.4 : 4}
        fill={openHead ? 'rgba(255, 255, 255, 0.92)' : color}
        stroke={openHead ? color : 'none'}
        strokeWidth={openHead ? '1.45' : undefined}
        transform={`rotate(-22 ${cx} 28)`}
      />
    </g>
  );
}

export function renderStem(params: {
  noteheadCenterX: number;
  duration: string | number;
  direction: GhostStemDirection;
  color?: string;
}): ReactElement | null {
  const color = params.color ?? GHOST_NOTE_STEM_COLOR;
  const durationNum = durationNumber(params.duration);
  const isLong = params.duration === 'long';
  if (!Number.isFinite(durationNum) || (durationNum <= 1 && !isLong)) return null;
  const direction = params.direction;
  const x = params.noteheadCenterX + (direction === 'down' ? -4.6 : 4.6);
  const longX = params.noteheadCenterX + 8.5; // Stem on the right bar for long
  return (
    <path
      d={isLong ? `M${longX} 28V46.8` : (direction === 'down' ? `M${x} 29.7V46.8` : `M${x} 26.3V9.2`)}
      stroke={color}
      strokeWidth="1.7"
      strokeLinecap="round"
    />
  );
}

/**
 * Returns the eighth- and sixteenth-note flag shapes. Visibility mirrors the
 * previous inline rule: eighth flag when duration >= 8, sixteenth flag added
 * when duration >= 16. `duration` is the denominator string (e.g. "8", "16").
 */
export function renderFlags(params: {
  noteheadCenterX: number;
  duration: string | number;
  direction: GhostStemDirection;
  color?: string;
}): ReactElement | null {
  const color = params.color ?? GHOST_NOTE_STEM_COLOR;
  const x = params.noteheadCenterX + (params.direction === 'down' ? -4.6 : 4.6);
  const durationNum = durationNumber(params.duration);
  if (!Number.isFinite(durationNum) || durationNum < 8) return null;

  if (params.direction === 'down') {
    return (
      <>
        <path
          d={`M${x} 46.8C${x - 4.1} 47.9 ${x - 4.7} 50.4 ${x - 2.1} 52.8C${x - 3.4} 51.5 ${x - 3.1} 49.3 ${x} 48.2Z`}
          fill={color}
        />
        {durationNum >= 16 && (
          <path
            d={`M${x} 41.8C${x - 4.1} 42.9 ${x - 4.7} 45.4 ${x - 2.1} 47.8C${x - 3.4} 46.5 ${x - 3.1} 44.3 ${x} 43.2Z`}
            fill={color}
          />
        )}
      </>
    );
  }

  return (
    <>
      <path
        d={`M${x} 9.2C${x + 3.8} 10.3 ${x + 4.4} 12.8 ${x + 1.8} 15.2C${x + 3.1} 13.9 ${x + 2.8} 11.7 ${x} 10.6Z`}
        fill={color}
      />
      {durationNum >= 16 && (
        <path
          d={`M${x} 14.2C${x + 3.8} 15.3 ${x + 4.4} 17.8 ${x + 1.8} 20.2C${x + 3.1} 18.9 ${x + 2.8} 16.7 ${x} 15.6Z`}
          fill={color}
        />
      )}
    </>
  );
}

export function renderAugmentationDot(params: {
  noteheadCenterX: number;
  color?: string;
}): ReactElement {
  const color = params.color ?? GHOST_NOTE_STEM_COLOR;
  return (
    <circle
      cx={params.noteheadCenterX + 8}
      cy="28"
      r="1.7"
      fill={color}
    />
  );
}

export function renderTupletBadge(params: {
  width: number;
  label?: string;
  color?: string;
  textColor?: string;
}): ReactElement {
  const fill = params.color ?? GHOST_NOTE_STEM_COLOR;
  const textColor = params.textColor ?? 'rgba(255, 255, 255, 0.92)';
  const cx = Math.max(params.width - 9, 9);
  return (
    <>
      <circle cx={cx} cy="8" r="7" fill={fill} />
      <text
        x={cx}
        y="11"
        fill={textColor}
        fontSize="9"
        fontWeight="700"
        textAnchor="middle"
        fontFamily="ui-sans-serif, system-ui, sans-serif"
      >
        {params.label ?? '3'}
      </text>
    </>
  );
}
