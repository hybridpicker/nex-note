// The order in which measures sound: simple repeats with first/second endings unrolled. Shared
// by the playback timeline (hooks/usePlayback.ts) and the built-in MIDI renderer
// (lib/midi-export.ts), so the timeline that places the playhead and the MIDI that makes the
// sound unroll a score the same way.
import type { MeasureNode } from '@/src/score-core/model/types';

type RepeatMeasure = Pick<MeasureNode, 'leftBarline' | 'rightBarline' | 'leftEnding' | 'rightEnding'>;

function parseEndingNumbers(numberString: string | null | undefined): string[] {
  return String(numberString ?? '').split(',').map((entry) => entry.trim()).filter(Boolean);
}

function buildEndingNumberMap(measures: RepeatMeasure[]) {
  const activeEndings = new Set<string>();
  return measures.map((measure) => {
    const numbers = new Set<string>();
    const leftNumbers = parseEndingNumbers(measure.leftEnding?.number);
    const rightNumbers = parseEndingNumbers(measure.rightEnding?.number);

    if (measure.leftEnding?.type === 'start') {
      leftNumbers.forEach((number) => activeEndings.add(number));
    }
    activeEndings.forEach((number) => numbers.add(number));
    leftNumbers.forEach((number) => numbers.add(number));
    rightNumbers.forEach((number) => numbers.add(number));

    if (measure.rightEnding?.type === 'stop' || measure.rightEnding?.type === 'discontinue') {
      rightNumbers.forEach((number) => activeEndings.delete(number));
    }

    return numbers;
  });
}

function shouldIncludeMeasureForPass(endingNumbers: Set<string>, passNumber: number) {
  return endingNumbers.size === 0 || endingNumbers.has(String(passNumber));
}

export function hasRepeatStructure(measures: RepeatMeasure[] | null | undefined) {
  return Boolean(measures?.some((measure) => (
    measure.leftBarline === 'repeat-start'
    || measure.rightBarline === 'repeat-end'
    || measure.leftEnding
    || measure.rightEnding
  )));
}

/** Measure indices in playback order, or null when the score has no repeats to unroll. */
export function buildPlaybackMeasureOrder(measures: RepeatMeasure[] | null | undefined): number[] | null {
  if (!measures?.length || !hasRepeatStructure(measures)) return null;
  const endingNumbersByMeasure = buildEndingNumberMap(measures);
  const order: number[] = [];
  let repeatStartIndex = 0;
  let postRepeatPass: number | null = null;

  measures.forEach((measure, measureIndex) => {
    const endingNumbers = endingNumbersByMeasure[measureIndex] ?? new Set<string>();
    if (postRepeatPass != null && endingNumbers.size === 0) {
      postRepeatPass = null;
    }
    if (measure.leftBarline === 'repeat-start') {
      repeatStartIndex = measureIndex;
    }

    const currentPass = postRepeatPass ?? 1;
    if (shouldIncludeMeasureForPass(endingNumbers, currentPass)) {
      order.push(measureIndex);
    }

    if (measure.rightBarline === 'repeat-end') {
      for (let repeatedIndex = repeatStartIndex; repeatedIndex <= measureIndex; repeatedIndex += 1) {
        const repeatedEndingNumbers = endingNumbersByMeasure[repeatedIndex] ?? new Set<string>();
        if (shouldIncludeMeasureForPass(repeatedEndingNumbers, 2)) {
          order.push(repeatedIndex);
        }
      }
      repeatStartIndex = measureIndex + 1;
      postRepeatPass = 2;
    }
  });

  return order.length ? order : null;
}
