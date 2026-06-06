import type { ScoreCommand } from '@/src/shared/schemas/score-command';
import type { ScoreDocumentModel } from '@/src/score-core/model/types';

export interface RepitchState {
  active: boolean;
  measureNumber: number;
  staffIndex: number;
  voiceId: number;
  currentTimestampNum: number;
  currentTimestampDen: number;
  coreMeasureId: string | null;
  corePartId: string | null;
}

export interface RepitchPitchIntent {
  step: string;
  octave: number;
  alter: number;
}

export interface RepitchAdvanceTarget {
  measureNumber: number;
  staffIndex: number;
  voiceId: number;
  timestampNum: number;
  timestampDen: number;
  coreMeasureId: string | null;
  corePartId: string | null;
}

export interface QwertyPianoKey {
  key: string;
  step: string;
  alter: number;
  octave: number;
  row: 'lower' | 'upper';
}

export const QWERTY_PIANO_KEYS: QwertyPianoKey[] = [
  { key: 'Z', step: 'C', alter: 0, octave: 4, row: 'lower' },
  { key: 'S', step: 'C', alter: 1, octave: 4, row: 'lower' },
  { key: 'X', step: 'D', alter: 0, octave: 4, row: 'lower' },
  { key: 'D', step: 'D', alter: 1, octave: 4, row: 'lower' },
  { key: 'C', step: 'E', alter: 0, octave: 4, row: 'lower' },
  { key: 'V', step: 'F', alter: 0, octave: 4, row: 'lower' },
  { key: 'G', step: 'F', alter: 1, octave: 4, row: 'lower' },
  { key: 'B', step: 'G', alter: 0, octave: 4, row: 'lower' },
  { key: 'H', step: 'G', alter: 1, octave: 4, row: 'lower' },
  { key: 'N', step: 'A', alter: 0, octave: 4, row: 'lower' },
  { key: 'J', step: 'A', alter: 1, octave: 4, row: 'lower' },
  { key: 'M', step: 'B', alter: 0, octave: 4, row: 'lower' },
  { key: 'Q', step: 'C', alter: 0, octave: 5, row: 'upper' },
  { key: '2', step: 'C', alter: 1, octave: 5, row: 'upper' },
  { key: 'W', step: 'D', alter: 0, octave: 5, row: 'upper' },
  { key: '3', step: 'D', alter: 1, octave: 5, row: 'upper' },
  { key: 'E', step: 'E', alter: 0, octave: 5, row: 'upper' },
  { key: 'R', step: 'F', alter: 0, octave: 5, row: 'upper' },
  { key: '5', step: 'F', alter: 1, octave: 5, row: 'upper' },
  { key: 'T', step: 'G', alter: 0, octave: 5, row: 'upper' },
  { key: '6', step: 'G', alter: 1, octave: 5, row: 'upper' },
  { key: 'Y', step: 'A', alter: 0, octave: 5, row: 'upper' },
  { key: '7', step: 'A', alter: 1, octave: 5, row: 'upper' },
  { key: 'U', step: 'B', alter: 0, octave: 5, row: 'upper' },
];

/**
 * Enter repitch mode anchored on the given note location.
 */
export function enterRepitchMode(anchor: {
  measureNumber: number;
  staffIndex: number;
  voiceId: number;
  timestampNum: number;
  timestampDen: number;
  coreMeasureId?: string | null;
  corePartId?: string | null;
}): RepitchState {
  return {
    active: true,
    measureNumber: anchor.measureNumber,
    staffIndex: anchor.staffIndex,
    voiceId: anchor.voiceId,
    currentTimestampNum: anchor.timestampNum,
    currentTimestampDen: anchor.timestampDen,
    coreMeasureId: anchor.coreMeasureId ?? null,
    corePartId: anchor.corePartId ?? null,
  };
}

/**
 * Exit repitch mode.
 */
export function exitRepitchMode(): RepitchState {
  return {
    active: false,
    measureNumber: 0,
    staffIndex: 0,
    voiceId: 0,
    currentTimestampNum: 0,
    currentTimestampDen: 1,
    coreMeasureId: null,
    corePartId: null,
  };
}

/**
 * Build a pitch-change command in repitch mode.
 */
export function buildRepitchPitchCommand(
  state: RepitchState,
  pitch: RepitchPitchIntent,
): ScoreCommand {
  return {
    type: 'changeNotePitch',
    coreMeasureId: state.coreMeasureId,
    corePartId: state.corePartId,
    measureNumber: state.measureNumber,
    staffIndex: state.staffIndex,
    voiceId: state.voiceId,
    timestampNum: state.currentTimestampNum,
    timestampDen: state.currentTimestampDen,
    step: pitch.step,
    octave: pitch.octave,
    alter: pitch.alter,
  };
}

/**
 * Advance repitch cursor to the next note in the same voice within the document.
 * Returns the next state, or null if no next note exists (repitch should deactivate).
 */
export function advanceRepitchCursor(
  state: RepitchState,
  coreDocument: ScoreDocumentModel | null,
): RepitchState | null {
  if (!coreDocument) return null;

  // Find all note events in the same voice, sorted by measure then timestamp
  const candidates: Array<RepitchAdvanceTarget> = [];

  for (const part of coreDocument.score.parts) {
    for (const staff of part.staves) {
      if (staff.staffIndex !== state.staffIndex) continue;
      for (const measure of staff.measures) {
        for (const voice of measure.voices) {
          if (voice.voiceId !== state.voiceId) continue;
          for (const event of voice.events) {
            if (event.kind !== 'note') continue;
            // Skip grace notes
            if (coreDocument.graceNotes.some((g) => g.eventId === event.id)) continue;
            candidates.push({
              measureNumber: measure.measureNumber,
              staffIndex: staff.staffIndex,
              voiceId: voice.voiceId,
              timestampNum: event.timestampNum,
              timestampDen: event.timestampDen,
              coreMeasureId: measure.id,
              corePartId: part.id,
            });
          }
        }
      }
    }
  }

  // Sort by measure number, then timestamp
  candidates.sort((a, b) => {
    if (a.measureNumber !== b.measureNumber) return a.measureNumber - b.measureNumber;
    const ratioA = a.timestampNum / Math.max(a.timestampDen, 1);
    const ratioB = b.timestampNum / Math.max(b.timestampDen, 1);
    return ratioA - ratioB;
  });

  // Find the current position and advance to next
  const currentRatio = state.currentTimestampNum / Math.max(state.currentTimestampDen, 1);
  const nextIndex = candidates.findIndex(
    (c) =>
      c.measureNumber > state.measureNumber ||
      (c.measureNumber === state.measureNumber &&
        c.timestampNum / Math.max(c.timestampDen, 1) > currentRatio),
  );

  if (nextIndex < 0) return null; // No next note

  const next = candidates[nextIndex]!;
  return {
    ...state,
    measureNumber: next.measureNumber,
    currentTimestampNum: next.timestampNum,
    currentTimestampDen: next.timestampDen,
    coreMeasureId: next.coreMeasureId,
    corePartId: next.corePartId,
  };
}

/**
 * Check if a keyboard key represents a pitch intent (A-G) for repitch mode.
 */
export function resolveRepitchPitchFromKey(key: string): RepitchPitchIntent | null {
  const normalized = key.trim().toUpperCase();
  if (!/^[A-G]$/.test(normalized)) return null;

  // Default to octave 4, no accidental — caller should adjust based on context
  return { step: normalized, octave: 4, alter: 0 };
}

/**
 * Check if a QWERTY key maps to a pitch (for piano-style input).
 * This is the default "QWERTY piano" layout:
 *   Z=C, S=C#, X=D, D=D#, C=E, V=F, G=F#, B=G, H=G#, N=A, J=A#, M=B
 *   Q=C (octave up), 2=C#, W=D, 3=D#, E=E, R=F, 5=F#, T=G, 6=G#, Y=A, 7=A#, U=B
 */
export function resolveQwertyPianoKey(key: string): RepitchPitchIntent | null {
  const lower = key.trim().toLowerCase();
  if (lower.length !== 1) return null;

  const mapped = QWERTY_PIANO_KEYS.find((entry) => entry.key.toLowerCase() === lower);
  if (!mapped) return null;

  return { step: mapped.step, octave: mapped.octave, alter: mapped.alter };
}
