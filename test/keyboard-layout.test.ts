import test from 'node:test';
import assert from 'node:assert/strict';

import {
  KEYBOARD_LAYOUT_TABLES,
  UNKNOWN_KEYBOARD_LAYOUT,
  createKeyboardLayoutContext,
  detectKeyboardLayout,
  isRepeatableNavigationKey,
  shortcutLetter,
  type KeyboardLayoutContext,
  type KeyboardLayoutId,
  type ShortcutKeyEvent,
} from '../src/score-input/keyboard-layout.ts';
import {
  resolveKeyboardAccidentalShortcut,
  resolveKeyboardArticulationShortcut,
  resolveKeyboardDurationShortcut,
  resolveKeyboardHistoryShortcut,
  resolveKeyboardIntervalShortcut,
  resolveKeyboardTupletShortcut,
} from '../src/score-input/keyboard-resolver.ts';
import { resolveQwertyPianoKeyEvent } from '../src/score-input/repitch-mode.ts';

/*
 * Keyboard simulator. Each press names the physical key (`event.code`) and the modifiers, and the
 * simulator derives `event.key` from the layout table, exactly as a browser does. macOS Option
 * replaces the produced character with an Option-layer glyph; only the en dash and "≠" glyphs are
 * modeled because the resolver may rely on them. Every other Option glyph is an opaque private-use
 * character, so the resolver cannot pass by accident. On Windows/Linux Alt leaves the character
 * unchanged.
 */
type Platform = 'mac' | 'pc';
const LAYOUTS: KeyboardLayoutId[] = ['us', 'uk', 'de'];
const OPAQUE_OPTION_GLYPH = '';
const MAC_OPTION_GLYPHS: Record<KeyboardLayoutId, Record<string, string>> = {
  us: { Minus: '–', Equal: '≠' },
  uk: { Minus: '–', Equal: '≠' },
  de: { Slash: '–' },
};

interface Press {
  code: string;
  shift?: boolean;
  alt?: boolean;
  meta?: boolean;
  repeat?: boolean;
}

function layoutCharacter(layout: KeyboardLayoutId, code: string, shift: boolean) {
  const entry = KEYBOARD_LAYOUT_TABLES[layout][code];
  if (entry) return shift ? entry[1] : entry[0];
  const letter = /^Key([A-Z])$/.exec(code)?.[1];
  if (letter) return shift ? letter : letter.toLowerCase();
  throw new Error(`simulator has no character for ${layout} ${code}`);
}

function press(layout: KeyboardLayoutId, platform: Platform, input: Press): ShortcutKeyEvent {
  const shift = Boolean(input.shift);
  const alt = Boolean(input.alt);
  let key = layoutCharacter(layout, input.code, shift);
  if (alt && platform === 'mac') {
    key = (!shift ? MAC_OPTION_GLYPHS[layout][input.code] : undefined) ?? OPAQUE_OPTION_GLYPH;
  }
  return {
    key,
    code: input.code,
    shiftKey: shift,
    altKey: alt,
    metaKey: Boolean(input.meta) && platform === 'mac',
    ctrlKey: Boolean(input.meta) && platform === 'pc',
  };
}

function layoutMap(layout: KeyboardLayoutId): Map<string, string> {
  const map = new Map<string, string>();
  for (const [code, [base]] of Object.entries(KEYBOARD_LAYOUT_TABLES[layout])) map.set(code, base);
  for (const letter of 'ABCDEFGHIJKLMNOPQRSTUVWX') map.set(`Key${letter}`, letter.toLowerCase());
  map.set('KeyY', layout === 'de' ? 'z' : 'y');
  map.set('KeyZ', layout === 'de' ? 'y' : 'z');
  return map;
}

const contexts = (layout: KeyboardLayoutId): Array<[string, KeyboardLayoutContext]> => [
  ['with layout map', createKeyboardLayoutContext(layoutMap(layout))],
  ['without layout map', UNKNOWN_KEYBOARD_LAYOUT],
];

/** The physical keys a user of each layout presses for each documented shortcut. */
const flatKey: Record<KeyboardLayoutId, Press> = {
  us: { code: 'Minus' }, uk: { code: 'Minus' }, de: { code: 'Slash' },
};
const naturalKey: Record<KeyboardLayoutId, Press> = {
  us: { code: 'Equal' }, uk: { code: 'Equal' }, de: { code: 'Digit0', shift: true },
};
const sharpKey: Record<KeyboardLayoutId, Press> = {
  us: { code: 'Equal', shift: true }, uk: { code: 'Equal', shift: true }, de: { code: 'BracketRight' },
};
const graceKey: Record<KeyboardLayoutId, Press> = {
  us: { code: 'Slash' }, uk: { code: 'Slash' }, de: { code: 'Digit7', shift: true },
};
const physicalZ: Record<KeyboardLayoutId, string> = { us: 'KeyZ', uk: 'KeyZ', de: 'KeyY' };
const physicalY: Record<KeyboardLayoutId, string> = { us: 'KeyY', uk: 'KeyY', de: 'KeyZ' };

test('layout detection recognizes US, UK and German/Austrian QWERTZ layout maps', () => {
  for (const layout of LAYOUTS) assert.equal(detectKeyboardLayout(layoutMap(layout)), layout);
  assert.equal(detectKeyboardLayout(new Map()), null);
  assert.equal(detectKeyboardLayout(null), null);
});

for (const layout of LAYOUTS) {
  for (const platform of ['mac', 'pc'] as const) {
    for (const [contextName, context] of contexts(layout)) {
      const label = `${layout} ${platform} ${contextName}`;

      test(`${label}: one-shot accidentals follow the printed - = + keys`, () => {
        assert.equal(resolveKeyboardAccidentalShortcut(press(layout, platform, flatKey[layout]), context), 'flat');
        assert.equal(resolveKeyboardAccidentalShortcut(press(layout, platform, naturalKey[layout]), context), 'natural');
        assert.equal(resolveKeyboardAccidentalShortcut(press(layout, platform, sharpKey[layout]), context), 'sharp');
        assert.equal(
          resolveKeyboardAccidentalShortcut(press(layout, platform, { ...flatKey[layout], alt: true }), context),
          'double-flat',
        );
      });

      test(`${label}: Alt/Option+= adds a double sharp`, (t) => {
        const event = press(layout, platform, { ...naturalKey[layout], alt: true });
        if (layout === 'de' && platform === 'mac' && context.layout === null) {
          // macOS QWERTZ types "=" with Shift+0; Option+Shift+0 yields a glyph that does not reveal
          // the key without a layout map. Documented limitation for WebKit (Safari, iPad shell).
          t.diagnostic('documented limitation: QWERTZ Option+Shift+0 needs a layout map');
          assert.equal(resolveKeyboardAccidentalShortcut(event, context), null);
          return;
        }
        assert.equal(resolveKeyboardAccidentalShortcut(event, context), 'double-sharp');
      });

      test(`${label}: Shift+. Shift+6 Shift+- and Shift+S name physical keys`, () => {
        const articulation = (input: Press) => resolveKeyboardArticulationShortcut(press(layout, platform, input), context);
        // Shift+. was the accent until K5a: it types `>` on a US keyboard, MuseScore's diminuendo
        // hairpin. The accent is MuseScore's Shift+V, tenuto also Shift+N, marcato also Shift+O.
        assert.equal(articulation({ code: 'Period', shift: true }), null);
        assert.equal(articulation({ code: 'KeyV', shift: true }), 'accent');
        assert.equal(articulation({ code: 'KeyN', shift: true }), 'tenuto');
        assert.equal(articulation({ code: 'KeyO', shift: true }), 'strong-accent');
        assert.equal(articulation({ code: 'Digit6', shift: true }), 'strong-accent');
        assert.equal(articulation({ ...flatKey[layout], shift: true }), 'tenuto');
        assert.equal(articulation({ code: 'KeyS', shift: true }), 'staccato');
      });

      test(`${label}: grace slash never selects a duration`, () => {
        const event = press(layout, platform, graceKey[layout]);
        assert.equal(event.key, '/');
        assert.equal(resolveKeyboardDurationShortcut(event), null);
        assert.equal(resolveKeyboardAccidentalShortcut(event, context), null);
        assert.equal(resolveKeyboardArticulationShortcut(event, context), null);
      });

      test(`${label}: digits select durations, Alt/Option intervals, Cmd/Ctrl tuplets`, () => {
        const expected = ['64', '32', '16', '8', '4', '2', '1', 'breve', 'long'];
        for (let digit = 1; digit <= 9; digit += 1) {
          const code = `Digit${digit}`;
          assert.equal(resolveKeyboardDurationShortcut(press(layout, platform, { code }))?.duration, expected[digit - 1]);
          assert.equal(resolveKeyboardIntervalShortcut(press(layout, platform, { code, alt: true })), digit);
          assert.equal(resolveKeyboardDurationShortcut(press(layout, platform, { code, shift: true })), null);
          assert.equal(resolveKeyboardDurationShortcut(press(layout, platform, { code, alt: true })), null);
          assert.equal(resolveKeyboardDurationShortcut(press(layout, platform, { code, meta: true })), null);
          if (digit >= 2) assert.equal(resolveKeyboardTupletShortcut(press(layout, platform, { code, meta: true })), digit);
        }
      });

      test(`${label}: Undo and Redo follow the printed Z and Y`, () => {
        const history = (input: Press) => resolveKeyboardHistoryShortcut(press(layout, platform, input));
        assert.equal(history({ code: physicalZ[layout], meta: true }), 'undo');
        assert.equal(history({ code: physicalZ[layout], meta: true, shift: true }), 'redo');
        assert.equal(history({ code: physicalY[layout], meta: true }), 'redo');
        assert.equal(history({ code: physicalZ[layout] }), null);
      });

      test(`${label}: the QWERTY piano keeps its physical shape`, () => {
        const pitch = (code: string) => {
          const resolved = resolveQwertyPianoKeyEvent(press(layout, platform, { code }));
          return resolved ? `${resolved.step}${resolved.alter === 1 ? '#' : ''}${resolved.octave}` : null;
        };
        assert.equal(pitch('KeyZ'), 'C4');
        assert.equal(pitch('KeyS'), 'C#4');
        assert.equal(pitch('KeyM'), 'B4');
        assert.equal(pitch('KeyQ'), 'C5');
        assert.equal(pitch('Digit2'), 'C#5');
        assert.equal(pitch('KeyY'), 'A5');
        assert.equal(pitch('KeyU'), 'B5');
        assert.equal(pitch('KeyA'), null);
      });
    }
  }
}

test('QWERTZ Cmd/Ctrl+Y redoes; it used to match the physical KeyZ and undo', () => {
  for (const platform of ['mac', 'pc'] as const) {
    const redoPress = press('de', platform, { code: 'KeyZ', meta: true });
    assert.equal(redoPress.key, 'y');
    assert.equal(resolveKeyboardHistoryShortcut(redoPress), 'redo');
  }
});

test('QWERTZ Shift+ß types "?" and is not tenuto', () => {
  for (const [, context] of contexts('de')) {
    const event = press('de', 'mac', { code: 'Minus', shift: true });
    assert.equal(event.key, '?');
    assert.equal(resolveKeyboardArticulationShortcut(event, context), null);
    assert.equal(resolveKeyboardAccidentalShortcut(event, context), null);
  }
});

test('QWERTZ Shift+< types ">" and is not an accent once the layout is known', () => {
  const event = press('de', 'pc', { code: 'IntlBackslash', shift: true });
  assert.equal(event.key, '>');
  assert.equal(resolveKeyboardArticulationShortcut(event, createKeyboardLayoutContext(layoutMap('de'))), null);
});

test('AZERTY-style unshifted digit-row symbols still select durations', () => {
  const event = { key: '&', code: 'Digit1', shiftKey: false, altKey: false, metaKey: false, ctrlKey: false };
  assert.equal(resolveKeyboardDurationShortcut(event)?.duration, '64');
});

test('letter shortcuts prefer the printed letter and fall back to the physical key for glyphs', () => {
  assert.equal(shortcutLetter({ key: 'y', code: 'KeyZ' }), 'Y');
  assert.equal(shortcutLetter({ key: 'ç', code: 'KeyC' }), 'C');
  assert.equal(shortcutLetter({ key: 'я', code: 'KeyZ' }), 'Z');
  assert.equal(shortcutLetter({ key: '1', code: 'Digit1' }), null);
});

test('only navigation keys may auto-repeat in the note editor', () => {
  for (const key of ['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', 'PageUp', 'PageDown', 'Home', 'End']) {
    assert.equal(isRepeatableNavigationKey(key), true, key);
  }
  for (const key of ['c', 'C', '5', '0', 'r', 't', '/', '+', '-', '=', '.', 'Backspace', 'Delete', 'n', 'Enter', ' ']) {
    assert.equal(isRepeatableNavigationKey(key), false, key);
  }
});
