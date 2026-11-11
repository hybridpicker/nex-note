import { getEffectiveMeasureTiming } from '@/src/score-core/measure-timing';
import type { ScoreDocumentModel } from '@/src/score-core/model/types';

/*
 * The position of a note, rest or input cursor in the words a musician uses: bar and beat. Onsets
 * are stored as a fraction of a whole note from the start of the bar; the status line used to print
 * that fraction (`0/16`). O4 in docs/note-entry-mastery-ledger.md.
 */

export interface PositionLike {
  measureNumber: number;
  staffIndex: number;
  timestampNum: number;
  timestampDen: number;
  coreMeasureId?: string | null;
  corePartId?: string | null;
}

/** The 1-based beat of an onset in a bar whose beat is `1/beatType` of a whole note. */
export function beatOfOnset(timestampNum: number, timestampDen: number, beatType: number) {
  const whole = timestampDen > 0 ? timestampNum / timestampDen : 0;
  return 1 + whole * (beatType > 0 ? beatType : 4);
}

/** `2`, `2.5`, `1.33`: at most two decimals, none when the onset is on a beat. */
export function formatBeat(beat: number) {
  const rounded = Math.round(beat * 100) / 100;
  if (Math.abs(rounded - Math.round(rounded)) < 0.005) return String(Math.round(rounded));
  return rounded.toFixed(2).replace(/0$/, '');
}

export function describePosition(document: ScoreDocumentModel | null | undefined, position: PositionLike) {
  const timing = getEffectiveMeasureTiming(document, {
    measureId: position.coreMeasureId ?? null,
    measureNumber: position.measureNumber,
    staffIndex: position.staffIndex,
    partId: position.corePartId ?? null,
  }) ?? getEffectiveMeasureTiming(document, { measureNumber: position.measureNumber, staffIndex: position.staffIndex });
  const beatType = timing?.timeSignature?.beatType ?? 4;
  return {
    bar: position.measureNumber,
    beat: formatBeat(beatOfOnset(position.timestampNum, position.timestampDen, beatType)),
  };
}

const VALUE_KEYS: Record<string, string> = {
  '64th': '64', '32nd': '32', '16th': '16', eighth: '8', quarter: '4', half: '2', whole: '1', breve: 'breve', long: 'long',
};

/** The key suffix of `note.duration.<n>` in lib/i18n.tsx for a stored duration type, or null. */
export function durationLabelKey(durationType: string | null | undefined) {
  return durationType ? VALUE_KEYS[durationType] ?? null : null;
}
