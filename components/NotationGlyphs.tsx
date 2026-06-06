import type { ReactNode } from 'react';
import type { NoteDuration } from '@/hooks/useNoteEditor';

export type NotationAccidental = 'double-flat' | 'flat' | 'natural' | 'sharp' | 'double-sharp';
export type NotationBarline = 'regular' | 'double' | 'final' | 'repeat-start' | 'repeat-end';

export function NoteDurationGlyph({
  duration,
  className = 'h-6 w-6',
}: {
  duration: NoteDuration;
  className?: string;
}) {
  const isBreve = duration === 'breve';
  const isLong = duration === 'long';
  const durationNum = duration === 'breve' ? 0.5 : duration === 'long' ? 0.25 : Number.parseInt(duration, 10);
  const wholeNote = durationNum === 1 || isBreve || isLong;
  const openHead = durationNum <= 2 || isBreve || isLong;
  const flags = !isBreve && !isLong && durationNum >= 64 ? 4 : durationNum >= 32 ? 3 : durationNum >= 16 ? 2 : durationNum >= 8 ? 1 : 0;
  const hasStem = (durationNum > 1 && !isBreve && !isLong) || isLong;

  return (
    <svg className={className} viewBox="0 0 28 34" fill="none" aria-hidden>
      {isBreve || isLong ? (
        <>
          <line x1="6" y1="13" x2="6" y2="25" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
          <line x1="22" y1="13" x2="22" y2="25" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
        </>
      ) : null}
      <ellipse
        cx={wholeNote ? 14 : 10.3}
        cy={wholeNote ? 19 : 25}
        rx={wholeNote ? 7.8 : 5.8}
        ry={wholeNote ? 4.8 : 4}
        fill={openHead ? 'white' : 'currentColor'}
        stroke="currentColor"
        strokeWidth={openHead ? 2.1 : 0}
        transform={`rotate(-22 ${wholeNote ? 14 : 10.3} ${wholeNote ? 19 : 25})`}
      />
      {hasStem && (
        <path
          d={isLong ? "M22 19V32" : "M15.5 23.8V4.8"}
          stroke="currentColor"
          strokeWidth="1.7"
          strokeLinecap="round"
        />
      )}
      {Array.from({ length: flags }, (_, index) => {
        const y = 4.8 + (index * 4.7);
        return (
          <path
            key={`flag-${index}`}
            d={`M15.5 ${y}C21.3 ${y + 1.1} 22.9 ${y + 5.2} 18.7 ${y + 8.1}C20.3 ${y + 5.6} 19.6 ${y + 3.7} 15.5 ${y + 2.1}Z`}
            fill="currentColor"
          />
        );
      })}
    </svg>
  );
}

export function RestGlyph({ className = 'h-5 w-5' }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 18 24" fill="none" aria-hidden>
      <path
        d="M9.4 2.4C13.4 5 12.5 8 6.6 10.1C12.3 11.8 12.4 15 7.1 17.3C10.3 18.3 11 20.8 8.1 22.2"
        stroke="currentColor"
        strokeWidth="2.05"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

export function AccidentalGlyph({
  accidental,
  className = 'h-5 w-5',
}: {
  accidental: NotationAccidental;
  className?: string;
}) {
  if (accidental === 'double-sharp') {
    return (
      <svg className={className} viewBox="0 0 20 20" fill="currentColor" aria-hidden>
        <path d="M4.2 3.4L6.3 2.2L10 7.2L13.7 2.2L15.8 3.4L11.8 10L15.8 16.6L13.7 17.8L10 12.8L6.3 17.8L4.2 16.6L8.2 10L4.2 3.4Z" />
      </svg>
    );
  }

  if (accidental === 'sharp') {
    return (
      <svg className={className} viewBox="0 0 18 24" fill="none" aria-hidden>
        <path d="M6.2 3L5.2 21" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
        <path d="M12.7 2L11.7 20" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
        <path d="M2.4 9.2L15.8 6.8" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" />
        <path d="M2.2 16.5L15.6 14.1" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" />
      </svg>
    );
  }

  if (accidental === 'natural') {
    return (
      <svg className={className} viewBox="0 0 16 24" fill="none" aria-hidden>
        <path d="M4.2 2.6V17.4" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" />
        <path d="M11.8 6.6V21.4" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" />
        <path d="M4.2 9.2L11.8 6.8" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" />
        <path d="M4.2 16.8L11.8 14.4" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" />
      </svg>
    );
  }

  const FlatShape = ({ x = 0 }: { x?: number }) => (
    <path
      d={`M${x + 4.5} 2.2V23.8M${x + 4.5} 18.6C${x + 5.9} 16.6 ${x + 7.8} 15.6 ${x + 9.9} 15.6C${x + 12.3} 15.6 ${x + 13.6} 17 ${x + 13.6} 19.1C${x + 13.6} 22.1 ${x + 10.7} 23.8 ${x + 7.6} 23.8H${x + 4.5}`}
      stroke="currentColor"
      strokeWidth="1.9"
      strokeLinecap="round"
      strokeLinejoin="round"
    />
  );

  if (accidental === 'double-flat') {
    return (
      <svg className={className} viewBox="0 0 24 26" fill="none" aria-hidden>
        <FlatShape x={-3.2} />
        <FlatShape x={5.3} />
      </svg>
    );
  }

  return (
    <svg className={className} viewBox="0 0 18 26" fill="none" aria-hidden>
      <FlatShape />
    </svg>
  );
}

function RepeatDots({ x }: { x: number }) {
  return (
    <>
      <circle cx={x} cy="9" r="1.7" fill="currentColor" />
      <circle cx={x} cy="17" r="1.7" fill="currentColor" />
    </>
  );
}

export function BarlineGlyph({
  barline,
  className = 'h-6 w-6',
}: {
  barline: NotationBarline;
  className?: string;
}) {
  const lines: Record<NotationBarline, ReactNode> = {
    regular: <path d="M12 4V22" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />,
    double: (
      <>
        <path d="M9 4V22" stroke="currentColor" strokeWidth="1.45" strokeLinecap="round" />
        <path d="M15 4V22" stroke="currentColor" strokeWidth="1.45" strokeLinecap="round" />
      </>
    ),
    final: (
      <>
        <path d="M8.5 4V22" stroke="currentColor" strokeWidth="1.35" strokeLinecap="round" />
        <path d="M14.5 4V22" stroke="currentColor" strokeWidth="3.4" strokeLinecap="round" />
      </>
    ),
    'repeat-start': (
      <>
        <path d="M7.5 4V22" stroke="currentColor" strokeWidth="3.4" strokeLinecap="round" />
        <path d="M13.5 4V22" stroke="currentColor" strokeWidth="1.35" strokeLinecap="round" />
        <RepeatDots x={17.4} />
      </>
    ),
    'repeat-end': (
      <>
        <RepeatDots x={6.6} />
        <path d="M10.5 4V22" stroke="currentColor" strokeWidth="1.35" strokeLinecap="round" />
        <path d="M16.5 4V22" stroke="currentColor" strokeWidth="3.4" strokeLinecap="round" />
      </>
    ),
  };

  return (
    <svg className={className} viewBox="0 0 24 26" fill="none" aria-hidden>
      {lines[barline]}
    </svg>
  );
}
