import { clampVoiceId, type EditPlacementMode, type ResolvedEditTarget } from '@/src/score-input/types';
import type { ScoreDocumentSelectedDuration } from '@/src/score-session/types';

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

function resolveKeyboardDigit(input: Pick<ResolveKeyboardDurationShortcutInput, 'key' | 'code'>) {
  if (/^[0-9]$/.test(input.key)) return input.key;
  return /^(?:Digit|Numpad)([0-9])$/.exec(input.code ?? '')?.[1] ?? null;
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
  const digit = resolveKeyboardDigit(input);
  if (!digit) return null;

  const duration = DURATION_KEY_MAP[digit];
  if (duration) return { type: 'selectDuration', key: digit, duration };

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
