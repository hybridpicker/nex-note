import type { ScoreDocumentModel } from '@/src/score-core/model/types';
import { getEffectiveMeasureTiming } from '@/src/score-core/measure-timing';

export interface Fraction {
  num: number;
  den: number;
}

export interface RhythmicSegment {
  start: Fraction;
  end: Fraction;
  timeScaling: Fraction;
  type: 'base' | 'tuplet';
  parent?: RhythmicSegment;
  actualNotes?: number;
  normalNotes?: number;
  depth?: number;
}

function gcd(a: number, b: number): number {
  let left = Math.abs(Math.round(a));
  let right = Math.abs(Math.round(b));
  while (right !== 0) {
    const remainder = left % right;
    left = right;
    right = remainder;
  }
  return left || 1;
}

export function normalizeFraction(num: number, den: number): Fraction {
  if (!Number.isFinite(num) || !Number.isFinite(den) || den === 0) return { num: 0, den: 1 };
  const sign = den < 0 ? -1 : 1;
  const safeNum = Math.round(num * sign);
  const safeDen = Math.round(Math.abs(den));
  const divisor = gcd(safeNum, safeDen);
  return {
    num: safeNum / divisor,
    den: safeDen / divisor,
  };
}

export function fractionToNumber(fraction: Fraction) {
  return fraction.num / Math.max(fraction.den, 1);
}

function multiplyFractions(left: Fraction, right: Fraction): Fraction {
  return normalizeFraction(left.num * right.num, left.den * right.den);
}

function noteDurationFraction(duration: string | number, isDotted = false): Fraction {
  const base = duration === 'breve'
    ? normalizeFraction(2, 1)
    : duration === 'long'
      ? normalizeFraction(4, 1)
      : normalizeFraction(1, Number.parseInt(String(duration), 10));
  return isDotted ? multiplyFractions(base, normalizeFraction(3, 2)) : base;
}

export function noteTimestampValue(note: Pick<{ timestampNum: number; timestampDen: number }, 'timestampNum' | 'timestampDen'>) {
  return note.timestampNum / Math.max(note.timestampDen, 1);
}

export function compareFraction(left: Fraction, right: Fraction) {
  return (left.num * right.den) - (right.num * left.den);
}

function ratioWithinSegment(ratio: Fraction, segment: RhythmicSegment) {
  return compareFraction(ratio, segment.start) >= 0 && compareFraction(ratio, segment.end) < 0;
}

function segmentContainsSegment(container: RhythmicSegment, child: RhythmicSegment) {
  return compareFraction(container.start, child.start) <= 0
    && compareFraction(container.end, child.end) >= 0;
}

function findMeasureNode(coreDocument: ScoreDocumentModel | null, measureId: string) {
  if (!coreDocument) return null;
  for (const part of coreDocument.score.parts) {
    for (const staff of part.staves) {
      const measure = staff.measures.find((entry) => entry.id === measureId);
      if (measure) return measure;
    }
  }
  return null;
}

function findEventById(coreDocument: ScoreDocumentModel | null, eventId: string) {
  if (!coreDocument) return null;
  for (const part of coreDocument.score.parts) {
    for (const staff of part.staves) {
      for (const measure of staff.measures) {
        for (const voice of measure.voices) {
          const event = voice.events.find((entry) => entry.id === eventId);
          if (event) return event;
        }
      }
    }
  }
  return null;
}

export function getEffectiveDuration(
  duration: string | number,
  isDotted: boolean,
  segment?: Pick<RhythmicSegment, 'timeScaling'> | null,
): Fraction {
  const base = noteDurationFraction(duration, isDotted);
  if (!segment) return base;

  let scaled = multiplyFractions(base, segment.timeScaling);
  let parent = (segment as RhythmicSegment).parent;
  while (parent) {
    scaled = multiplyFractions(scaled, parent.timeScaling);
    parent = parent.parent;
  }
  return scaled;
}

export function detectActiveRhythmicSegment(
  coreDocument: ScoreDocumentModel | null,
  measureId: string,
  staffIndex: number,
  voiceId: number,
  pointerRatio: Fraction,
): RhythmicSegment {
  const measure = findMeasureNode(coreDocument, measureId);
  const timing = getEffectiveMeasureTiming(coreDocument, {
    measureId,
    staffIndex,
  });
  const measureEnd = timing?.timeSignature
    ? normalizeFraction(timing.timeSignature.beats, timing.timeSignature.beatType)
    : normalizeFraction(1, 1);
  const baseSegment: RhythmicSegment = {
    start: normalizeFraction(0, 1),
    end: measureEnd,
    timeScaling: normalizeFraction(1, 1),
    type: 'base',
  };
  if (!coreDocument) return baseSegment;

  const candidateSegments: RhythmicSegment[] = coreDocument.tuplets
    .map((tuplet) => {
      const events = tuplet.eventIds
        .map((eventId) => findEventById(coreDocument, eventId))
        .filter((event): event is NonNullable<typeof event> => Boolean(event))
        .filter((event) => event.staffIndex === staffIndex && event.voiceId === voiceId && measure?.measureNumber === event.measureNumber)
        .sort((a, b) => noteTimestampValue(a) - noteTimestampValue(b));
      if (events.length === 0) return null;
      const first = events[0]!;
      const last = events[events.length - 1]!;
      const segment: RhythmicSegment = {
        start: normalizeFraction(first.timestampNum, Math.max(first.timestampDen, 1)),
        end: normalizeFraction(last.timestampNum + last.durationDivisions, Math.max(last.timestampDen, 1)),
        timeScaling: normalizeFraction(tuplet.normalNotes ?? 1, tuplet.actualNotes ?? 1),
        type: 'tuplet' as const,
        actualNotes: tuplet.actualNotes,
        normalNotes: tuplet.normalNotes,
      };
      return segment;
    })
    .filter((segment): segment is NonNullable<typeof segment> => segment !== null)
    .sort((a, b) => (
      (fractionToNumber(a.end) - fractionToNumber(a.start))
      - (fractionToNumber(b.end) - fractionToNumber(b.start))
    ));

  const containingSegments = candidateSegments
    .filter((segment) => ratioWithinSegment(pointerRatio, segment))
    .sort((a, b) => (
      (fractionToNumber(a.end) - fractionToNumber(a.start))
      - (fractionToNumber(b.end) - fractionToNumber(b.start))
    ));

  if (containingSegments.length === 0) return baseSegment;

  for (let index = containingSegments.length - 1; index >= 0; index -= 1) {
    const segment = containingSegments[index]!;
    const parent = containingSegments
      .slice(index + 1)
      .find((candidate) => segmentContainsSegment(candidate, segment))
      ?? baseSegment;
    segment.parent = parent;
    segment.depth = parent.type === 'tuplet' ? (parent.depth ?? 1) + 1 : 1;
  }

  return containingSegments[0]!;
}
