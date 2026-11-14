// Keyboard presets for people who come from another notation program.
//
// A preset does not own any editing behaviour. It translates the key somebody presses in their
// familiar scheme into the key Nex Note's own scheme uses for the same action, before the existing
// handlers see the event. The default preset (`nexnote`, MuseScore-like) is the identity, so nothing
// changes for it. Keys a preset does not name keep their Nex Note meaning.
//
// This is a different axis from `keyboard-layout.ts`, which handles the physical layout
// (US, UK, QWERTZ) of the keyboard.

export const KEYBOARD_PRESET_STORAGE_KEY = 'nex-note.keyboardPreset';

export const KEYBOARD_PRESETS = ['nexnote', 'sibelius', 'sibelius-laptop', 'finale'] as const;
export type KeyboardPresetId = (typeof KEYBOARD_PRESETS)[number];

export const DEFAULT_KEYBOARD_PRESET: KeyboardPresetId = 'nexnote';

export const KEYBOARD_PRESET_LABELS: Record<KeyboardPresetId, string> = {
  nexnote: 'Nex Note / MuseScore',
  sibelius: 'Sibelius (keypad)',
  'sibelius-laptop': 'Sibelius (laptop)',
  finale: 'Finale (Simple Entry)',
};

export interface PresetKeyEvent {
  key: string;
  code: string;
  shiftKey: boolean;
  altKey: boolean;
  metaKey: boolean;
  ctrlKey: boolean;
}

export interface KeyboardPresetBinding {
  /** What the person presses in their familiar scheme. */
  keys: string;
  action: string;
}

type Modifiers = Partial<Pick<PresetKeyEvent, 'shiftKey' | 'altKey' | 'metaKey' | 'ctrlKey'>>;

function canonical(key: string, code: string, modifiers: Modifiers = {}): PresetKeyEvent {
  return { key, code, shiftKey: false, altKey: false, metaKey: false, ctrlKey: false, ...modifiers };
}

// Nex Note's own keys for each action (see docs/keyboard-shortcuts.md).
const DURATION_DIGIT = { '32nd': 2, '16th': 3, eighth: 4, quarter: 5, half: 6, whole: 7 } as const;
const duration = (digit: number) => canonical(String(digit), `Digit${digit}`);
const intervalAbove = (digit: number) => canonical(String(digit), `Digit${digit}`, { altKey: true });
const voice = (digit: number) => canonical(String(digit), `Digit${digit}`, { metaKey: true, altKey: true });
const tuplet = (digit: number) => canonical(String(digit), `Digit${digit}`, { metaKey: true });
const letter = (name: string, modifiers: Modifiers = {}) => canonical(
  modifiers.shiftKey ? name.toUpperCase() : name.toLowerCase(),
  `Key${name.toUpperCase()}`,
  modifiers,
);
// Symbol keys carry no physical code: the produced character names the action on every layout.
const NATURAL = canonical('=', '');
const SHARP = canonical('+', '');
const FLAT = canonical('-', '');
const REST = canonical('0', 'Digit0');
const DOT = canonical('.', 'Period');
const TIE = letter('t');
const CRESCENDO = canonical('<', '');
const DIMINUENDO = canonical('>', '');
const ACCENT = letter('v', { shiftKey: true });
const STACCATO = letter('s', { shiftKey: true });
const TENUTO = letter('n', { shiftKey: true });
const FLIP_STEM = letter('x');
const ENHARMONIC = letter('j');
const GRACE_NOTE = canonical('/', '');
const NOTE_INPUT = letter('n');

function command(event: PresetKeyEvent) {
  return event.metaKey || event.ctrlKey;
}

function plain(event: PresetKeyEvent) {
  return !command(event) && !event.altKey && !event.shiftKey;
}

function digitRow(event: PresetKeyEvent): number | null {
  const match = /^Digit([0-9])$/.exec(event.code);
  return match ? Number(match[1]) : null;
}

function numpadDigit(event: PresetKeyEvent): number | null {
  const match = /^Numpad([0-9])$/.exec(event.code);
  return match ? Number(match[1]) : null;
}

/** The printed Latin letter; the physical code only when the key produced something else (Option glyphs). */
function printedLetter(event: PresetKeyEvent): string | null {
  if (event.key.length === 1 && /^[a-z]$/i.test(event.key)) return event.key.toUpperCase();
  return /^Key([A-Z])$/.exec(event.code)?.[1] ?? null;
}

// Sibelius keypad, first layout ("common notes").
const SIBELIUS_KEYPAD_DIGITS: Record<number, PresetKeyEvent> = {
  0: REST,
  1: duration(DURATION_DIGIT['32nd']),
  2: duration(DURATION_DIGIT['16th']),
  3: duration(DURATION_DIGIT.eighth),
  4: duration(DURATION_DIGIT.quarter),
  5: duration(DURATION_DIGIT.half),
  6: duration(DURATION_DIGIT.whole),
  7: NATURAL,
  8: SHARP,
  9: FLAT,
};

const SIBELIUS_KEYPAD_OPERATORS: Record<string, PresetKeyEvent> = {
  NumpadDecimal: DOT,
  NumpadEnter: TIE,
  NumpadDivide: ACCENT,
  NumpadMultiply: STACCATO,
  NumpadSubtract: TENUTO,
};

function translateSibelius(event: PresetKeyEvent, laptop: boolean): PresetKeyEvent | null {
  if (command(event)) return null;

  if (!event.altKey && !event.shiftKey) {
    const keypad = numpadDigit(event);
    if (keypad !== null) return SIBELIUS_KEYPAD_DIGITS[keypad] ?? null;
    const operator = SIBELIUS_KEYPAD_OPERATORS[event.code];
    if (operator) return operator;
  }

  const row = digitRow(event);
  if (row !== null) {
    // Alt/Option+1..4 chooses the voice.
    if (event.altKey && !event.shiftKey) return row >= 1 && row <= 4 ? voice(row) : null;
    if (plain(event)) {
      // Laptop: the digit row is the keypad. Desktop: the digit row adds an interval above.
      if (laptop) return SIBELIUS_KEYPAD_DIGITS[row] ?? null;
      return row >= 1 && row <= 9 ? intervalAbove(row) : null;
    }
    return null;
  }

  if (!event.altKey && printedLetter(event) === 'H') return event.shiftKey ? DIMINUENDO : CRESCENDO;
  return null;
}

function translateFinale(event: PresetKeyEvent): PresetKeyEvent | null {
  const row = digitRow(event);
  if (row !== null) {
    // Laptop duration keys: Cmd/Ctrl+Option+1..8. The keypad digits already select durations.
    if (command(event) && event.altKey && !event.shiftKey) return row >= 1 && row <= 8 ? duration(row) : null;
    // Layers: Shift+Option+1..4.
    if (!command(event) && event.altKey && event.shiftKey) return row >= 1 && row <= 4 ? voice(row) : null;
    if (plain(event)) {
      if (row >= 1 && row <= 8) return intervalAbove(row);
      if (row === 9) return tuplet(3);
    }
    return null;
  }

  if (command(event)) return null;
  const name = printedLetter(event);
  if (event.altKey) return !event.shiftKey && name === 'G' ? GRACE_NOTE : null;
  if (!event.shiftKey && event.key === '=') return SHARP;
  if (!event.shiftKey && event.key === '\\') return ENHARMONIC;
  if (name === 'N') return event.shiftKey ? NOTE_INPUT : NATURAL;
  if (name === 'L' && !event.shiftKey) return FLIP_STEM;
  return null;
}

/**
 * The Nex Note key for the pressed key, or null when the preset leaves the key as it is.
 */
export function translatePresetKey(preset: KeyboardPresetId, event: PresetKeyEvent): PresetKeyEvent | null {
  // Read field by field: a native KeyboardEvent exposes these through getters that a spread skips.
  const normalized: PresetKeyEvent = {
    key: event.key,
    code: event.code ?? '',
    shiftKey: Boolean(event.shiftKey),
    altKey: Boolean(event.altKey),
    metaKey: Boolean(event.metaKey),
    ctrlKey: Boolean(event.ctrlKey),
  };
  if (preset === 'sibelius') return translateSibelius(normalized, false);
  if (preset === 'sibelius-laptop') return translateSibelius(normalized, true);
  if (preset === 'finale') return translateFinale(normalized);
  return null;
}

const SIBELIUS_SHARED_BINDINGS: KeyboardPresetBinding[] = [
  { keys: 'Alt/Option+1 … 4', action: 'Voice 1 … 4' },
  { keys: 'H / Shift+H', action: 'Crescendo / diminuendo hairpin' },
  { keys: 'N, A–G, R, S, X', action: 'Note input, pitches, repeat, slur, flip stem (same as Nex Note)' },
];

const SIBELIUS_KEYPAD_BINDINGS: KeyboardPresetBinding[] = [
  { keys: 'Keypad 1 … 6', action: '32nd, 16th, eighth, quarter, half, whole' },
  { keys: 'Keypad 7 / 8 / 9', action: 'Natural / sharp / flat' },
  { keys: 'Keypad 0', action: 'Rest' },
  { keys: 'Keypad .', action: 'Dot' },
  { keys: 'Keypad Enter', action: 'Tie' },
  { keys: 'Keypad / * -', action: 'Accent, staccato, tenuto' },
];

/** What each preset changes, for the settings tooltip and the documentation. */
export const KEYBOARD_PRESET_BINDINGS: Record<KeyboardPresetId, KeyboardPresetBinding[]> = {
  nexnote: [],
  sibelius: [
    ...SIBELIUS_KEYPAD_BINDINGS,
    { keys: '1 … 9', action: 'Add the interval above' },
    ...SIBELIUS_SHARED_BINDINGS,
  ],
  'sibelius-laptop': [
    { keys: '1 … 6', action: '32nd, 16th, eighth, quarter, half, whole' },
    { keys: '7 / 8 / 9', action: 'Natural / sharp / flat' },
    { keys: '0', action: 'Rest' },
    { keys: 'Keypad', action: 'As in the Sibelius keypad preset' },
    ...SIBELIUS_SHARED_BINDINGS,
  ],
  finale: [
    { keys: 'Keypad 1 … 8, Cmd/Ctrl+Option+1 … 8', action: '64th … double whole (as Nex Note’s digits)' },
    { keys: '1 … 8', action: 'Add the interval above' },
    { keys: '9', action: 'Triplet' },
    { keys: '= or +, -, N', action: 'Sharp, flat, natural' },
    { keys: 'Shift+N', action: 'Note input on/off' },
    { keys: 'L', action: 'Flip stem' },
    { keys: '\\', action: 'Enharmonic respelling' },
    { keys: 'Option/Alt+G', action: 'Grace note' },
    { keys: 'Shift+Option/Alt+1 … 4', action: 'Layer (voice) 1 … 4' },
    { keys: 'A–G, R, T, .', action: 'Pitches, rest/repeat, tie, dot (same as Nex Note)' },
  ],
};

export function describeKeyboardPreset(preset: KeyboardPresetId): string {
  const bindings = KEYBOARD_PRESET_BINDINGS[preset];
  if (bindings.length === 0) return 'Nex Note’s own keys (close to MuseScore).';
  return bindings.map((binding) => `${binding.keys}: ${binding.action}`).join('\n');
}

export function isKeyboardPreset(value: unknown): value is KeyboardPresetId {
  return typeof value === 'string' && (KEYBOARD_PRESETS as readonly string[]).includes(value);
}

export function readKeyboardPreset(): KeyboardPresetId {
  try {
    const stored = typeof localStorage === 'undefined' ? null : localStorage.getItem(KEYBOARD_PRESET_STORAGE_KEY);
    return isKeyboardPreset(stored) ? stored : DEFAULT_KEYBOARD_PRESET;
  } catch {
    return DEFAULT_KEYBOARD_PRESET;
  }
}

let activeKeyboardPreset: KeyboardPresetId | null = null;

export function getActiveKeyboardPreset(): KeyboardPresetId {
  activeKeyboardPreset ??= readKeyboardPreset();
  return activeKeyboardPreset;
}

export function setActiveKeyboardPreset(preset: KeyboardPresetId) {
  activeKeyboardPreset = preset;
  try {
    if (typeof localStorage !== 'undefined') localStorage.setItem(KEYBOARD_PRESET_STORAGE_KEY, preset);
  } catch {
    // Without storage the choice lasts for this session.
  }
}

function isFormControl(target: EventTarget | null): boolean {
  const element = target as { tagName?: string; isContentEditable?: boolean } | null;
  const tag = element?.tagName;
  return tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || tag === 'BUTTON' || tag === 'A'
    || Boolean(element?.isContentEditable);
}

/**
 * The event the note editor should act on. Returns the native event itself for the default preset,
 * for keys the preset leaves alone, and while a form control has the focus; otherwise a stand-in
 * that reads like the Nex Note key and forwards `preventDefault`/`stopPropagation`.
 */
export function applyKeyboardPreset(event: KeyboardEvent, preset: KeyboardPresetId = getActiveKeyboardPreset()): KeyboardEvent {
  if (preset === DEFAULT_KEYBOARD_PRESET || isFormControl(event.target)) return event;
  const translated = translatePresetKey(preset, event);
  if (!translated) return event;
  return {
    ...translated,
    repeat: event.repeat,
    target: event.target,
    type: event.type,
    preventDefault: () => event.preventDefault(),
    stopPropagation: () => event.stopPropagation(),
  } as unknown as KeyboardEvent;
}
