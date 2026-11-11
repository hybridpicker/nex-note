import type { CDPSession, Page } from '@playwright/test';

import { KEYBOARD_LAYOUT_TABLES, type KeyboardLayoutId } from '../../src/score-input/keyboard-layout';

/*
 * Key scripts on a real keyboard layout. A script token names what the user means (`+`, `/`, `Z`,
 * `Cmd+3`, `Shift+.`); this module sends the key event a US, UK or German keyboard produces for it:
 * the physical `code` of the key that carries the character on that layout, the produced `key`, and
 * the Shift a person has to hold (German `/` is Shift+7, `z` sits on the US `Y` key). Named keys
 * (`Enter`, `Tab`, `ArrowRight`, `Space`, ...) are the same on every layout.
 */

const NAMED = new Set([
  'Enter', 'Escape', 'Tab', 'Space', 'Backspace', 'Delete', 'Insert', 'Home', 'End', 'PageUp', 'PageDown',
  'ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown',
]);

const GERMAN_THIRD_LEVEL: Record<string, string> = { '|': 'IntlBackslash', '@': 'KeyQ', '[': 'Digit8', ']': 'Digit9', '{': 'Digit7', '}': 'Digit0', '\\': 'Minus', '~': 'BracketRight' };

export interface LayoutKey {
  key: string;
  code: string;
  shift: boolean;
  alt: boolean;
  control: boolean;
}

/** `Cmd+Alt+2`, `Shift+e`, `C`, `#`, `Cmd++` as modifiers and a base. `Cmd` is Ctrl in the test browser. */
export function parseToken(token: string) {
  const plus = token === '+' || token.endsWith('++');
  const parts = token === '+' ? [] : (plus ? token.slice(0, -2) : token).split('+');
  const base = plus ? '+' : parts.pop()!;
  const modifiers = new Set(parts.map((part) => part.toLowerCase()));
  return { base, shift: modifiers.has('shift'), alt: modifiers.has('alt'), control: modifiers.has('cmd') || modifiers.has('ctrl') };
}

export function layoutKey(token: string, layout: KeyboardLayoutId): LayoutKey | null {
  const { base, shift, alt, control } = parseToken(token);
  if (NAMED.has(base)) return null;
  const table = KEYBOARD_LAYOUT_TABLES[layout];
  if (/^[a-z]$/i.test(base)) {
    const letter = base.toLowerCase();
    const physical = layout === 'de' && (letter === 'y' || letter === 'z') ? (letter === 'y' ? 'z' : 'y') : letter;
    // A capital letter alone is a typed capital (Shift). With Cmd or Alt the case of the token says
    // nothing: `Cmd+K` is the K key.
    const upper = shift || (base !== letter && !alt && !control);
    return { key: upper ? letter.toUpperCase() : letter, code: `Key${physical.toUpperCase()}`, shift: upper, alt, control };
  }
  if (/^[0-9]$/.test(base)) {
    const code = `Digit${base}`;
    return { key: shift ? table[code]![1] : base, code, shift, alt, control };
  }
  const unshifted = Object.entries(table).find(([, [character]]) => character === base);
  if (unshifted) return { key: shift ? unshifted[1][1] : base, code: unshifted[0], shift, alt, control };
  const shifted = Object.entries(table).find(([, [, character]]) => character === base);
  if (shifted) return { key: base, code: shifted[0], shift: true, alt, control };
  // Characters of the third level (AltGr on a German PC keyboard, Option on a Mac). The modifier is
  // left out: what matters to the app is the character that arrives in the text field.
  const thirdLevel = layout === 'de' ? GERMAN_THIRD_LEVEL[base] : undefined;
  if (thirdLevel) return { key: base, code: thirdLevel, shift: false, alt: false, control: false };
  throw new Error(`no ${layout} key types "${base}"`);
}

export class LayoutKeyboard {
  private client: CDPSession | null = null;

  constructor(private readonly page: Page, readonly layout: KeyboardLayoutId) {}

  async press(token: string) {
    const key = layoutKey(token, this.layout);
    if (!key) {
      const { base, shift, alt, control } = parseToken(token);
      await this.page.keyboard.press([control ? 'Control' : '', alt ? 'Alt' : '', shift ? 'Shift' : '', base].filter(Boolean).join('+'));
      return;
    }
    this.client ??= await this.page.context().newCDPSession(this.page);
    const modifiers = (key.alt ? 1 : 0) | (key.control ? 2 : 0) | (key.shift ? 8 : 0);
    // A character reaches a focused text field only when the key event carries it as text.
    const text = !key.alt && !key.control && key.key.length === 1 ? key.key : undefined;
    const virtualKey = /^Key[A-Z]$/.test(key.code) ? key.code.charCodeAt(3) : /^Digit\d$/.test(key.code) ? 48 + Number(key.code.slice(5)) : 0;
    await this.client.send('Input.dispatchKeyEvent', {
      type: text ? 'keyDown' : 'rawKeyDown', key: key.key, code: key.code, modifiers, text, unmodifiedText: text,
      windowsVirtualKeyCode: virtualKey, nativeVirtualKeyCode: virtualKey,
    });
    await this.client.send('Input.dispatchKeyEvent', {
      type: 'keyUp', key: key.key, code: key.code, modifiers, windowsVirtualKeyCode: virtualKey, nativeVirtualKeyCode: virtualKey,
    });
  }
}
