import type { Page } from '@playwright/test';

/*
 * The app reads the keyboard layout from `navigator.keyboard.getLayoutMap()` and resolves layout
 * dependent shortcuts from it (src/score-input/keyboard-layout.ts). Headless Chromium reports the
 * layout of the machine that runs the tests, so a test that presses layout-dependent keys pins the
 * layout it means.
 */

export type PinnedKeyboardLayout = 'us' | 'uk' | 'de';

const LETTERS = 'abcdefghijklmnopqrstuvwxyz';

function baseMap(layout: PinnedKeyboardLayout): Array<[string, string]> {
  const map = new Map<string, string>();
  for (const letter of LETTERS) map.set(`Key${letter.toUpperCase()}`, letter);
  for (let digit = 0; digit <= 9; digit += 1) map.set(`Digit${digit}`, String(digit));
  const us: Record<string, string> = {
    Minus: '-', Equal: '=', BracketLeft: '[', BracketRight: ']', Backslash: '\\', Semicolon: ';',
    Quote: "'", Comma: ',', Period: '.', Slash: '/', Backquote: '`',
  };
  const uk: Record<string, string> = { ...us, Backslash: '#', IntlBackslash: '\\' };
  const de: Record<string, string> = {
    Minus: 'ß', Equal: '´', BracketLeft: 'ü', BracketRight: '+', Backslash: '#', Semicolon: 'ö',
    Quote: 'ä', Comma: ',', Period: '.', Slash: '-', Backquote: '^', IntlBackslash: '<',
  };
  for (const [code, character] of Object.entries(layout === 'us' ? us : layout === 'uk' ? uk : de)) map.set(code, character);
  if (layout === 'de') {
    map.set('KeyY', 'z');
    map.set('KeyZ', 'y');
  }
  return [...map.entries()];
}

/** Make the page report `layout` as its keyboard layout. Call before the app loads. */
export async function pinKeyboardLayout(page: Page, layout: PinnedKeyboardLayout) {
  await page.addInitScript((entries: Array<[string, string]>) => {
    const map = new Map(entries);
    Object.defineProperty(navigator, 'keyboard', {
      configurable: true,
      value: { getLayoutMap: async () => map },
    });
  }, baseMap(layout));
}
