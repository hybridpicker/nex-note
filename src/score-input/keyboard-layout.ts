/**
 * Layout-aware shortcut identity.
 *
 * Browsers report two identities for every key press: `event.key` is the character the active
 * layout produced, `event.code` is the physical key position named after the US layout. Neither is
 * correct on its own for notation shortcuts:
 *
 * - Letter shortcuts (`Z`, `Y`, `K`, ...) follow the printed character. On German/Austrian QWERTZ
 *   the physical `KeyY` types `z`; matching `code === 'KeyZ'` would turn Cmd+Y (Redo) into Undo.
 * - Symbol shortcuts (`-`, `=`, `+`, `/`) follow the produced character, because their physical
 *   positions differ between layouts (German `+` sits on `BracketRight`, `/` is Shift+7).
 * - Shortcuts documented as a modifier plus a base key (`Shift+6`, `Shift+.`, `Shift+-`, Alt/Option
 *   accidentals) need the character of the key's base layer, which `event.key` hides once a
 *   modifier changed the produced glyph.
 *
 * The resolver therefore combines `event.key` with an optional layout map (Chromium's
 * `navigator.keyboard.getLayoutMap()`), built-in tables for the supported layouts, and a small set
 * of physical codes whose base character is identical on US, UK and German/Austrian keyboards.
 */

export type KeyboardLayoutId = 'us' | 'uk' | 'de';

export interface ShortcutKeyEvent {
  key: string;
  code?: string;
  shiftKey: boolean;
  altKey: boolean;
  metaKey: boolean;
  ctrlKey: boolean;
}

export interface KeyboardLayoutContext {
  /** Detected layout, or null when the platform exposes no layout information. */
  layout: KeyboardLayoutId | null;
  /** Unmodified character per physical code, as reported by the platform. */
  baseMap: ReadonlyMap<string, string> | null;
}

export const UNKNOWN_KEYBOARD_LAYOUT: KeyboardLayoutContext = Object.freeze({ layout: null, baseMap: null });

type LayoutTable = Readonly<Record<string, readonly [base: string, shifted: string]>>;

const US_LAYOUT: LayoutTable = {
  Digit1: ['1', '!'], Digit2: ['2', '@'], Digit3: ['3', '#'], Digit4: ['4', '$'], Digit5: ['5', '%'],
  Digit6: ['6', '^'], Digit7: ['7', '&'], Digit8: ['8', '*'], Digit9: ['9', '('], Digit0: ['0', ')'],
  Minus: ['-', '_'], Equal: ['=', '+'], BracketLeft: ['[', '{'], BracketRight: [']', '}'],
  Backslash: ['\\', '|'], Semicolon: [';', ':'], Quote: ["'", '"'], Backquote: ['`', '~'],
  Comma: [',', '<'], Period: ['.', '>'], Slash: ['/', '?'], KeyY: ['y', 'Y'], KeyZ: ['z', 'Z'],
};

/** PC/ISO British layout. Only the keys that differ from US are listed. */
const UK_LAYOUT: LayoutTable = {
  ...US_LAYOUT,
  Digit2: ['2', '"'], Digit3: ['3', '£'], Quote: ["'", '@'], Backslash: ['#', '~'],
  Backquote: ['`', '¬'], IntlBackslash: ['\\', '|'],
};

/** German and Austrian QWERTZ share every key used by notation shortcuts. */
const DE_LAYOUT: LayoutTable = {
  Digit1: ['1', '!'], Digit2: ['2', '"'], Digit3: ['3', '§'], Digit4: ['4', '$'], Digit5: ['5', '%'],
  Digit6: ['6', '&'], Digit7: ['7', '/'], Digit8: ['8', '('], Digit9: ['9', ')'], Digit0: ['0', '='],
  Minus: ['ß', '?'], Equal: ['´', '`'], BracketLeft: ['ü', 'Ü'], BracketRight: ['+', '*'],
  Backslash: ['#', "'"], Semicolon: ['ö', 'Ö'], Quote: ['ä', 'Ä'], Backquote: ['^', '°'],
  Comma: [',', ';'], Period: ['.', ':'], Slash: ['-', '_'], IntlBackslash: ['<', '>'],
  KeyY: ['z', 'Z'], KeyZ: ['y', 'Y'],
};

export const KEYBOARD_LAYOUT_TABLES: Readonly<Record<KeyboardLayoutId, LayoutTable>> = {
  us: US_LAYOUT,
  uk: UK_LAYOUT,
  de: DE_LAYOUT,
};

/** Physical keys whose unmodified character is the same on US, UK and German/Austrian layouts. */
const LAYOUT_STABLE_BASE_CHARACTERS: Readonly<Record<string, string>> = {
  Digit0: '0', Digit1: '1', Digit2: '2', Digit3: '3', Digit4: '4',
  Digit5: '5', Digit6: '6', Digit7: '7', Digit8: '8', Digit9: '9',
  Numpad0: '0', Numpad1: '1', Numpad2: '2', Numpad3: '3', Numpad4: '4',
  Numpad5: '5', Numpad6: '6', Numpad7: '7', Numpad8: '8', Numpad9: '9',
  NumpadAdd: '+', NumpadSubtract: '-', NumpadDivide: '/', NumpadMultiply: '*',
  Period: '.', Comma: ',',
};

/**
 * macOS Option-layer glyphs that identify the base key on every supported layout when the platform
 * gives no layout map: Option+hyphen types an en dash on US, UK and German Mac layouts, and
 * Option+= types "≠" on US and UK Mac layouts.
 */
const MAC_OPTION_GLYPH_BASE_CHARACTERS: Readonly<Record<string, string>> = {
  '–': '-',
  '≠': '=',
};

/** Characters the US layout types for Shift plus a base key named by a shortcut. */
const US_SHIFTED_CHARACTERS: Readonly<Record<string, string>> = {
  '.': '>',
  '6': '^',
  '-': '_',
};

export function detectKeyboardLayout(baseMap: ReadonlyMap<string, string> | null | undefined): KeyboardLayoutId | null {
  if (!baseMap || baseMap.size === 0) return null;
  const at = (code: string) => baseMap.get(code)?.toLowerCase();
  if (at('KeyY') === 'z' && at('KeyZ') === 'y' && at('Minus') === 'ß') return 'de';
  if (at('KeyY') !== 'y' || at('KeyZ') !== 'z') return null;
  if (at('Minus') !== '-' || at('Slash') !== '/' || at('Period') !== '.') return null;
  if (at('Backslash') === '#' || at('Backquote') === '§' || at('IntlBackslash') === '§') return 'uk';
  if (at('Equal') === '=' && at('BracketRight') === ']') return 'us';
  return null;
}

export function createKeyboardLayoutContext(baseMap: ReadonlyMap<string, string> | null | undefined): KeyboardLayoutContext {
  if (!baseMap || baseMap.size === 0) return UNKNOWN_KEYBOARD_LAYOUT;
  return { layout: detectKeyboardLayout(baseMap), baseMap };
}

/** The character a physical key types without modifiers, or null when the layout cannot tell. */
export function physicalBaseCharacter(code: string | undefined, context: KeyboardLayoutContext): string | null {
  if (!code) return null;
  const fromMap = context.baseMap?.get(code);
  if (fromMap && fromMap.length === 1) return fromMap;
  const fromTable = context.layout ? KEYBOARD_LAYOUT_TABLES[context.layout][code]?.[0] : undefined;
  if (fromTable) return fromTable;
  return LAYOUT_STABLE_BASE_CHARACTERS[code] ?? null;
}

/** The character a physical key types with or without Shift, or null when the layout cannot tell. */
export function physicalCharacter(code: string | undefined, shiftKey: boolean, context: KeyboardLayoutContext): string | null {
  if (!shiftKey) return physicalBaseCharacter(code, context);
  if (!code || !context.layout) return null;
  return KEYBOARD_LAYOUT_TABLES[context.layout][code]?.[1] ?? null;
}

/**
 * The character a shortcut names: what the key types without Alt/Option. Without Alt this is
 * `event.key`; with Alt the base layer is reconstructed because macOS replaces the character with an
 * Option-layer glyph.
 */
export function shortcutCharacter(event: ShortcutKeyEvent, context: KeyboardLayoutContext = UNKNOWN_KEYBOARD_LAYOUT): string {
  if (!event.altKey) return event.key;
  const physical = physicalCharacter(event.code, event.shiftKey, context);
  if (physical) return physical;
  return MAC_OPTION_GLYPH_BASE_CHARACTERS[event.key] ?? event.key;
}

/**
 * The Latin letter a letter shortcut names. The produced character wins, so QWERTZ `Z`/`Y` and
 * AZERTY `A`/`Q` follow their printed keys; the physical code is only used when the produced
 * character is not a Latin letter (Option-layer glyphs, non-Latin layouts).
 */
export function shortcutLetter(event: Pick<ShortcutKeyEvent, 'key' | 'code'>): string | null {
  if (event.key.length === 1 && /^[a-z]$/i.test(event.key)) return event.key.toUpperCase();
  return /^Key([A-Z])$/.exec(event.code ?? '')?.[1] ?? null;
}

/**
 * The digit a number shortcut names. A produced digit always counts. The physical digit row is used
 * when the produced character is not a digit because of a modifier (Alt/Option or Cmd/Ctrl glyphs)
 * or because the layout types symbols on the unshifted digit row (AZERTY). A plain Shift+digit
 * types that key's own symbol (German Shift+7 is "/") and never names a digit.
 */
export function shortcutDigit(event: ShortcutKeyEvent): string | null {
  if (/^[0-9]$/.test(event.key)) return event.key;
  const digit = /^(?:Digit|Numpad)([0-9])$/.exec(event.code ?? '')?.[1] ?? null;
  if (!digit) return null;
  if (event.shiftKey && !event.altKey && !event.metaKey && !event.ctrlKey) return null;
  return digit;
}

/**
 * Whether the event is Shift plus the named base key (`Shift+.`, `Shift+6`, `Shift+-`), measured on
 * the physical key so the documented key works on QWERTZ, where Shift+6 types "&" and the hyphen
 * key is `Slash`. The US shifted character is accepted only when the layout is US/UK or unknown.
 */
export function matchesShiftedBaseKey(
  event: ShortcutKeyEvent,
  baseCharacter: '.' | '6' | '-',
  context: KeyboardLayoutContext = UNKNOWN_KEYBOARD_LAYOUT,
): boolean {
  if (!event.shiftKey || event.altKey || event.metaKey || event.ctrlKey) return false;
  if (context.layout !== 'de' && event.key === US_SHIFTED_CHARACTERS[baseCharacter]) return true;
  return physicalBaseCharacter(event.code, context) === baseCharacter;
}

/**
 * Keys whose auto-repeat is a navigation gesture. Every other note-editor key is an entry or edit
 * action that a held key must not repeat.
 */
export function isRepeatableNavigationKey(key: string): boolean {
  return key === 'ArrowLeft'
    || key === 'ArrowRight'
    || key === 'ArrowUp'
    || key === 'ArrowDown'
    || key === 'PageUp'
    || key === 'PageDown'
    || key === 'Home'
    || key === 'End';
}

let activeKeyboardLayoutContext: KeyboardLayoutContext = UNKNOWN_KEYBOARD_LAYOUT;

export function getActiveKeyboardLayoutContext(): KeyboardLayoutContext {
  return activeKeyboardLayoutContext;
}

export function setActiveKeyboardLayoutContext(context: KeyboardLayoutContext) {
  activeKeyboardLayoutContext = context;
}

interface NavigatorKeyboardLike {
  getLayoutMap?: () => Promise<ReadonlyMap<string, string>>;
}

/**
 * Refreshes the active layout from `navigator.keyboard.getLayoutMap()` where the platform supports
 * it (Chromium, Electron). WebKit (Safari, the iPad shell) has no layout map; shortcuts then use
 * the layout-independent fallbacks above.
 */
export async function refreshActiveKeyboardLayout(
  keyboard: NavigatorKeyboardLike | undefined = typeof navigator === 'undefined'
    ? undefined
    : (navigator as Navigator & { keyboard?: NavigatorKeyboardLike }).keyboard,
): Promise<KeyboardLayoutContext> {
  if (!keyboard?.getLayoutMap) return activeKeyboardLayoutContext;
  try {
    const map = await keyboard.getLayoutMap();
    activeKeyboardLayoutContext = createKeyboardLayoutContext(new Map(map));
  } catch {
    // Layout maps are unavailable in some frames and permission contexts; keep the fallback.
  }
  return activeKeyboardLayoutContext;
}
