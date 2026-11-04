import { clampVoiceId, type EditPlacementMode, type ResolvedEditTarget } from '@/src/score-input/types';
import type { ScoreDocumentSelectedDuration } from '@/src/score-session/types';
import type { DiatonicIntervalNumber } from '@/src/score-input/staff-pitch';
import type { WrittenAccidental } from '@/src/shared/music/accidentals';
import {
  UNKNOWN_KEYBOARD_LAYOUT,
  matchesShiftedBaseKey,
  shortcutCharacter,
  shortcutDigit,
  shortcutLetter,
  type KeyboardLayoutContext,
  type ShortcutKeyEvent,
} from '@/src/score-input/keyboard-layout';

export type KeyboardEntryMode = 'insert' | 'overwrite';
export type KeyboardDeleteAction = 'delete' | 'rippleDelete' | 'clearMeasureVoice';
export type KeyboardEntryModeShortcutAction = 'toggle' | KeyboardEntryMode;
export type KeyboardChordInputShortcutAction = 'toggleChordInput' | 'focusChordSymbol';
export type KeyboardDurationShortcutAction =
  | { type: 'selectDuration'; key: string; duration: ScoreDocumentSelectedDuration };

export interface KeyboardAnchor {
  coreMeasureId?: string | null;
  corePartId?: string | null;
  measureNumber: number;
  staffIndex: number;
  voiceId: number;
  timestampNum: number;
  timestampDen: number;
}

export interface KeyboardPitchIntent {
  step: string;
  octave: number;
  alter: number;
}

export interface KeyboardTimingContext {
  timestampNum: number;
  timestampDen: number;
  durationDivisions: number;
}

export interface ResolveKeyboardEditTargetInput {
  anchor: KeyboardAnchor | null;
  pitch: KeyboardPitchIntent;
  entryMode: KeyboardEntryMode;
  noteInputMode: boolean;
  chordInputMode: boolean;
  selectedVoice: number;
  selectedTiming?: KeyboardTimingContext | null;
  forceChord?: boolean;
  insertAtCursor?: boolean;
}

export interface ResolveKeyboardDeleteActionInput {
  key: string;
  shiftKey: boolean;
  metaKey: boolean;
  ctrlKey: boolean;
  hasSelection: boolean;
  noteInputMode: boolean;
}

export interface ResolveKeyboardEntryModeShortcutInput {
  key: string;
  shiftKey: boolean;
  metaKey: boolean;
  ctrlKey: boolean;
  altKey: boolean;
}

export interface ResolveKeyboardChordInputShortcutInput {
  key: string;
  shiftKey: boolean;
  metaKey: boolean;
  ctrlKey: boolean;
  altKey: boolean;
}

export interface ResolveKeyboardDurationShortcutInput {
  key: string;
  code?: string;
  shiftKey?: boolean;
  altKey?: boolean;
  metaKey?: boolean;
  ctrlKey?: boolean;
}

export type KeyboardArticulationShortcut = 'staccato' | 'accent' | 'strong-accent' | 'tenuto';
export type KeyboardHistoryShortcut = 'undo' | 'redo';
export type KeyboardTupletShortcut = 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9;

export interface ResolveKeyboardIntervalShortcutInput {
  key: string;
  code?: string;
  shiftKey: boolean;
  metaKey: boolean;
  ctrlKey: boolean;
  altKey: boolean;
}

const DURATION_KEY_MAP: Record<string, ScoreDocumentSelectedDuration> = {
  '1': '64',
  '2': '32',
  '3': '16',
  '4': '8',
  '5': '4',
  '6': '2',
  '7': '1',
  '8': 'breve',
  '9': 'long',
};

function normalizeStep(step: string) {
  const normalized = step.trim().toUpperCase();
  return /^[A-G]$/.test(normalized) ? normalized : null;
}

function resolveKeyboardDigit(input: ResolveKeyboardDurationShortcutInput) {
  return shortcutDigit({
    key: input.key,
    code: input.code,
    shiftKey: Boolean(input.shiftKey),
    altKey: Boolean(input.altKey),
    metaKey: Boolean(input.metaKey),
    ctrlKey: Boolean(input.ctrlKey),
  });
}

function resolveKeyboardPlacementMode(input: ResolveKeyboardEditTargetInput): EditPlacementMode {
  if (input.forceChord || input.chordInputMode) return 'chord';
  if (input.insertAtCursor) return 'insert';
  if (input.entryMode === 'overwrite' || (input.noteInputMode && input.selectedVoice === input.anchor?.voiceId)) {
    return 'replace';
  }
  return 'insert';
}

export function resolveKeyboardDeleteAction(input: ResolveKeyboardDeleteActionInput): KeyboardDeleteAction | null {
  if (!input.hasSelection && !input.noteInputMode) return null;

  const normalizedKey = input.key.trim().toUpperCase();
  const isDeleteKey = normalizedKey === 'DELETE' || normalizedKey === 'BACKSPACE';
  if (isDeleteKey && input.shiftKey && (input.metaKey || input.ctrlKey)) return 'clearMeasureVoice';
  if (isDeleteKey && input.shiftKey) return 'rippleDelete';
  if (normalizedKey === 'BACKSPACE' && (input.metaKey || input.ctrlKey)) return 'rippleDelete';
  if (isDeleteKey) return 'delete';
  return null;
}

export function resolveKeyboardEntryModeShortcut(
  input: ResolveKeyboardEntryModeShortcutInput,
): KeyboardEntryModeShortcutAction | null {
  const normalizedKey = input.key.trim().toUpperCase();
  if (normalizedKey !== 'I' || input.altKey) return null;

  if (input.metaKey || input.ctrlKey) {
    return input.shiftKey ? 'overwrite' : 'insert';
  }

  return input.shiftKey ? null : 'toggle';
}

export function resolveKeyboardChordInputShortcut(
  input: ResolveKeyboardChordInputShortcutInput,
): KeyboardChordInputShortcutAction | null {
  const normalizedKey = input.key.trim().toUpperCase();
  if (input.altKey || (!input.metaKey && !input.ctrlKey)) return null;
  if (normalizedKey === 'H' && input.shiftKey) return 'toggleChordInput';
  if (normalizedKey === 'K' && !input.shiftKey) return 'focusChordSymbol';
  return null;
}

export function resolveKeyboardDurationShortcut(
  input: ResolveKeyboardDurationShortcutInput,
): KeyboardDurationShortcutAction | null {
  // Alt/Option+digit adds an interval (or selects a TAB string) and Cmd/Ctrl+digit makes a tuplet.
  if (input.altKey || input.metaKey || input.ctrlKey) return null;
  const digit = resolveKeyboardDigit(input);
  if (!digit) return null;

  const duration = DURATION_KEY_MAP[digit];
  if (duration) return { type: 'selectDuration', key: digit, duration };

  return null;
}

export function resolveKeyboardIntervalShortcut(
  input: ResolveKeyboardIntervalShortcutInput,
): DiatonicIntervalNumber | null {
  if (!input.altKey || input.shiftKey || input.metaKey || input.ctrlKey) return null;
  const digit = resolveKeyboardDigit(input);
  const interval = digit ? Number(digit) : 0;
  return interval >= 1 && interval <= 9 ? interval as DiatonicIntervalNumber : null;
}

/**
 * One-shot accidental keys. The plain keys follow the produced character (`-` flat, `=` natural,
 * `+` sharp), so German/Austrian `+` (BracketRight) and `=` (Shift+0) work; Alt/Option adds the
 * double accidental of the same key.
 */
export function resolveKeyboardAccidentalShortcut(
  event: ShortcutKeyEvent,
  layout: KeyboardLayoutContext = UNKNOWN_KEYBOARD_LAYOUT,
): WrittenAccidental | null {
  if (event.metaKey || event.ctrlKey) return null;
  const character = shortcutCharacter(event, layout);
  if (event.altKey) {
    if (character === '-') return 'double-flat';
    if (character === '=') return 'double-sharp';
    return null;
  }
  if (character === '-') return 'flat';
  if (character === '=') return 'natural';
  if (character === '+') return 'sharp';
  return null;
}

/** Shift+S, Shift+. , Shift+6 and Shift+- as documented, measured on the physical key. */
export function resolveKeyboardArticulationShortcut(
  event: ShortcutKeyEvent,
  layout: KeyboardLayoutContext = UNKNOWN_KEYBOARD_LAYOUT,
): KeyboardArticulationShortcut | null {
  if (event.metaKey || event.ctrlKey || event.altKey || !event.shiftKey) return null;
  if (shortcutLetter(event) === 'S') return 'staccato';
  if (matchesShiftedBaseKey(event, '.', layout)) return 'accent';
  if (matchesShiftedBaseKey(event, '6', layout)) return 'strong-accent';
  if (event.key === '\u2212' || matchesShiftedBaseKey(event, '-', layout)) return 'tenuto';
  return null;
}

/** Cmd/Ctrl+2..9 tuplets on the physical digit row. */
export function resolveKeyboardTupletShortcut(event: ShortcutKeyEvent): KeyboardTupletShortcut | null {
  if (!(event.metaKey || event.ctrlKey) || event.altKey) return null;
  const digit = shortcutDigit(event);
  const value = digit ? Number(digit) : 0;
  return value >= 2 && value <= 9 ? value as KeyboardTupletShortcut : null;
}

/** Cmd/Ctrl+Z undo, Cmd/Ctrl+Shift+Z and Cmd/Ctrl+Y redo, following the printed letters. */
export function resolveKeyboardHistoryShortcut(event: ShortcutKeyEvent): KeyboardHistoryShortcut | null {
  if (!(event.metaKey || event.ctrlKey) || event.altKey) return null;
  const letter = shortcutLetter(event);
  if (letter === 'Z') return event.shiftKey ? 'redo' : 'undo';
  if (letter === 'Y' && !event.shiftKey) return 'redo';
  return null;
}

export function resolveKeyboardEditTarget(input: ResolveKeyboardEditTargetInput): ResolvedEditTarget | null {
  const anchor = input.anchor;
  if (!anchor) return null;

  const step = normalizeStep(input.pitch.step);
  if (!step) return null;

  const mode = resolveKeyboardPlacementMode(input);
  const diagnostics: string[] = [];
  const selectedVoice = clampVoiceId(input.selectedVoice);
  const timing = input.selectedTiming ?? null;

  let timestampNum = anchor.timestampNum;
  let timestampDen = Math.max(anchor.timestampDen, 1);
  let voiceId = mode === 'replace' ? anchor.voiceId : selectedVoice;
  let relativeAfterTimestampNum: number | undefined;
  let relativeAfterTimestampDen: number | undefined;

  if (mode === 'chord') {
    voiceId = input.forceChord ? anchor.voiceId : selectedVoice;
  } else if (mode === 'insert' && !input.insertAtCursor) {
    const durationDivisions = Math.max(1, Math.trunc(timing?.durationDivisions ?? 1));
    const baseTimestampNum = Math.trunc(timing?.timestampNum ?? anchor.timestampNum);
    const baseTimestampDen = Math.max(1, Math.trunc(timing?.timestampDen ?? anchor.timestampDen));
    timestampNum = baseTimestampNum + durationDivisions;
    timestampDen = baseTimestampDen;
    relativeAfterTimestampNum = anchor.timestampNum;
    relativeAfterTimestampDen = Math.max(anchor.timestampDen, 1);
    diagnostics.push('x-resolved-from-anchor-duration');
  } else {
    diagnostics.push('x-resolved-from-anchor-slot');
    // The cursor position came from another voice, so it may fall inside a rest of this one.
    if (mode === 'insert' && input.insertAtCursor && selectedVoice !== anchor.voiceId) {
      diagnostics.push('keyboard-cross-voice-cursor');
    }
  }

  return {
    source: 'keyboard',
    mode,
    measureId: anchor.coreMeasureId ?? null,
    corePartId: anchor.corePartId ?? null,
    measureNumber: anchor.measureNumber,
    staffIndex: anchor.staffIndex,
    voiceId: clampVoiceId(voiceId),
    timestampNum,
    timestampDen,
    ratio: timestampNum / Math.max(timestampDen, 1),
    domX: null,
    relativeAfterTimestampNum,
    relativeAfterTimestampDen,
    allowOccupiedInsert: mode === 'insert',
    step,
    octave: Math.trunc(input.pitch.octave),
    alter: Math.trunc(input.pitch.alter),
    diagnostics,
  };
}
