import type { ScoreCommand } from '@/src/shared/schemas/score-command';
import type { GuitarStringNumber } from '@/hooks/useNoteEditor';

export type GuitarTabAction =
  | { type: 'setFret'; string: GuitarStringNumber; fret: number }
  | { type: 'selectString'; string: GuitarStringNumber }
  | { type: 'stringUp' }
  | { type: 'stringDown' };

export interface GuitarTabBufferState {
  buffer: string;
  string: GuitarStringNumber;
  tuning: string;
  pending: boolean;
}

/**
 * Create an initial guitar tab buffer state.
 */
export function createGuitarTabBuffer(string: GuitarStringNumber = 1, tuning = 'standard'): GuitarTabBufferState {
  return {
    buffer: '',
    string,
    tuning,
    pending: false,
  };
}

/**
 * Resolve a keyboard keypress to a guitar tab action.
 * Number keys 0-9 enter fret digits, Enter commits, ArrowUp/Down change string.
 */
export function resolveGuitarTabKey(
  key: string,
  shiftKey: boolean,
  metaKey: boolean,
  ctrlKey: boolean,
  state: GuitarTabBufferState,
): GuitarTabAction | null {
  // Arrow keys for string navigation
  if (key === 'ArrowUp') return { type: 'stringUp' };
  if (key === 'ArrowDown') return { type: 'stringDown' };

  // Number keys for fret entry
  if (/^[0-9]$/.test(key)) {
    // Shift+digit could mean a two-digit number pending
    if (shiftKey && state.buffer.length === 0) return null; // shift alone doesn't do numbers in tab
    return null; // handled by buffer
  }

  return null;
}

/**
 * Process a digit keypress for fret buffer. Returns updated state.
 */
export function processTabDigit(state: GuitarTabBufferState, digit: string): GuitarTabBufferState {
  const parsed = parseInt(digit, 10);
  if (!Number.isFinite(parsed) || parsed < 0 || parsed > 9) return state;

  const newBuffer = state.buffer + String(parsed);
  const fret = parseInt(newBuffer, 10);

  // Single digit: commit immediately
  if (state.buffer.length === 0) {
    return {
      ...state,
      buffer: '',
      pending: false,
    };
  }

  // Two digits: commit the combined number
  if (fret >= 0 && fret <= 30) {
    return {
      ...state,
      buffer: '',
      pending: false,
    };
  }

  // Too large: keep buffer but don't commit
  return state;
}

/**
 * Commit the fret buffer to a setFret command.
 * After entering a fret, automatically advance to the next string.
 */
export function commitTabFret(
  state: GuitarTabBufferState,
  fret: number,
  measureNumber: number,
  staffIndex: number,
  voiceId: number,
  timestampNum: number,
  timestampDen: number,
  tuning?: string,
  techniques?: string[],
): { command: ScoreCommand; nextState: GuitarTabBufferState } {
  const command: ScoreCommand = {
    type: 'setGuitarFret',
    measureNumber,
    staffIndex,
    voiceId,
    timestampNum,
    timestampDen,
    string: state.string as 1 | 2 | 3 | 4 | 5 | 6,
    fret,
    tuning: tuning ?? state.tuning,
    techniques,
  };

  // Advance to next string, wrap around
  const nextString = (state.string % 6 + 1) as GuitarStringNumber;

  return {
    command,
    nextState: {
      ...state,
      string: nextString,
      buffer: '',
    },
  };
}

/**
 * Resolve a keyboard keypress to a fret number action.
 * Returns the fret number if the key produces a valid fret digit, or null.
 */
export function resolveFretDigitKey(key: string): number | null {
  if (!/^[0-9]$/.test(key)) return null;
  return parseInt(key, 10);
}

/**
 * Resolve arrow keys to string changes.
 */
export function resolveTabStringNavigation(key: string): 'up' | 'down' | null {
  if (key === 'ArrowUp' || key === 'ArrowDown') {
    return key === 'ArrowUp' ? 'up' : 'down';
  }
  return null;
}

/**
 * Navigate to the next/previous string.
 */
export function navigateTabString(current: GuitarStringNumber, direction: 'up' | 'down'): GuitarStringNumber {
  if (direction === 'up') {
    return (current === 1 ? 6 : current - 1) as GuitarStringNumber;
  }
  return (current === 6 ? 1 : current + 1) as GuitarStringNumber;
}
