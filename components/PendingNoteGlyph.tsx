import type { ReactElement } from 'react';

/*
 * A note drawn by the editor itself, in one synchronous pass: the pending note that stands in the
 * score from the key press until the engraver has drawn the score again (gate 3, step 1 of
 * docs/note-entry-mastery-ledger.md). The engraved preview glyph is drawn asynchronously and would
 * miss the first frame. Sizes are in staff spaces, so the note has the size of the notes around it at
 * every zoom.
 */

export interface PendingNoteGlyphProps {
  /** Centre of the notehead in the coordinates of the positioned parent. */
  x: number;
  y: number;
  /** Distance between two staff lines in pixels. */
  space: number;
  /** MuseScore-style value name: '1' whole, '2' half, '4' quarter, '8' eighth and so on. */
  duration: string;
  dotted: boolean;
  stemDirection: 'up' | 'down';
  alter: number;
  /** Position on the staff in half spaces from the top line (0 = top line, downwards positive). */
  staffStep: number;
  lineCount: number;
  color?: string;
}

const ACCIDENTAL_TEXT: Record<number, string> = { [-2]: '♭♭', [-1]: '♭', 1: '♯', 2: '𝄪' };

function flagCount(duration: string) {
  const value = Number.parseInt(duration, 10);
  if (!Number.isFinite(value) || value < 8) return 0;
  return Math.round(Math.log2(value)) - 2;
}

export function ledgerLineSteps(staffStep: number, lineCount: number): number[] {
  const bottomStep = (Math.max(lineCount, 1) - 1) * 2;
  const steps: number[] = [];
  for (let step = -2; step >= staffStep; step -= 2) steps.push(step);
  for (let step = bottomStep + 2; step <= staffStep; step += 2) steps.push(step);
  return steps;
}

export function PendingNoteGlyph(props: PendingNoteGlyphProps): ReactElement {
  const { x, y, space, duration, dotted, stemDirection, alter, staffStep, lineCount, color = '#111827' } = props;
  const value = Number.parseInt(duration, 10);
  const open = duration === 'breve' || duration === 'long' || value === 1 || value === 2;
  const hasStem = duration === 'long' || (Number.isFinite(value) && value >= 2);
  const rx = space * (value === 1 || duration === 'breve' || duration === 'long' ? 0.72 : 0.6);
  const ry = space * 0.42;
  const stemWidth = Math.max(1, space * 0.12);
  const stemLength = space * 3.5;
  const up = stemDirection === 'up';
  const stemX = up ? x + rx - stemWidth / 2 - space * 0.03 : x - rx + stemWidth / 2 + space * 0.03;
  const stemStartY = up ? y - space * 0.12 : y + space * 0.12;
  const stemEndY = up ? y - stemLength : y + stemLength;
  const flags = hasStem ? flagCount(duration) : 0;
  const lineStroke = Math.max(1, space * 0.13);
  const ledgerHalf = rx + space * 0.42;
  const accidental = ACCIDENTAL_TEXT[alter] ?? null;
  // A dot on a line moves into the space above it.
  const dotY = staffStep % 2 === 0 ? y - space / 2 : y;

  return (
    <svg
      aria-hidden
      className="pointer-events-none absolute left-0 top-0 overflow-visible"
      width="1"
      height="1"
      style={{ overflow: 'visible' }}
    >
      {ledgerLineSteps(staffStep, lineCount).map((step) => {
        const lineY = y + ((step - staffStep) * space) / 2;
        return <line key={`ledger:${step}`} data-pending-part="ledger" x1={x - ledgerHalf} x2={x + ledgerHalf} y1={lineY} y2={lineY} stroke={color} strokeWidth={lineStroke} />;
      })}
      {accidental && (
        <text
          data-pending-part="accidental"
          x={x - rx - space * 0.25}
          y={y}
          textAnchor="end"
          dominantBaseline="central"
          fontSize={space * 2.3}
          fill={color}
        >
          {accidental}
        </text>
      )}
      <ellipse
        data-pending-part="notehead"
        cx={x}
        cy={y}
        rx={open ? rx - lineStroke / 2 : rx}
        ry={open ? ry - lineStroke / 2 : ry}
        transform={`rotate(-20 ${x} ${y})`}
        fill={open ? 'none' : color}
        stroke={open ? color : 'none'}
        strokeWidth={open ? lineStroke * 1.6 : 0}
      />
      {hasStem && (
        <line data-pending-part="stem" x1={stemX} x2={stemX} y1={stemStartY} y2={stemEndY} stroke={color} strokeWidth={stemWidth} strokeLinecap="butt" />
      )}
      {Array.from({ length: flags }, (_, index) => {
        const startY = up ? stemEndY + index * space * 0.75 : stemEndY - index * space * 0.75;
        const direction = up ? 1 : -1;
        const path = `M ${stemX} ${startY} c ${space * 0.2} ${direction * space * 0.75}, ${space * 1.05} ${direction * space * 0.95}, ${space * 0.75} ${direction * space * 2.1} c ${space * 0.05} ${-direction * space * 0.75}, ${-space * 0.45} ${-direction * space * 1.05}, ${-space * 0.75} ${-direction * space * 1.25} Z`;
        return <path key={`flag:${index}`} data-pending-part="flag" d={path} fill={color} />;
      })}
      {dotted && <circle data-pending-part="dot" cx={x + rx + space * 0.55} cy={dotY} r={space * 0.2} fill={color} />}
    </svg>
  );
}
