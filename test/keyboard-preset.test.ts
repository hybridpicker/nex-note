import assert from 'node:assert/strict';
import test from 'node:test';
import { act } from 'react-test-renderer';

import { scoreXml, TREBLE } from './support/entry-fixtures.ts';
import { keyEvent, mountEditor } from './support/entry-harness.ts';
import {
  KEYBOARD_PRESETS,
  KEYBOARD_PRESET_BINDINGS,
  KEYBOARD_PRESET_LABELS,
  applyKeyboardPreset,
  describeKeyboardPreset,
  isKeyboardPreset,
  translatePresetKey,
  type KeyboardPresetId,
  type PresetKeyEvent,
} from '../src/score-input/keyboard-preset.ts';

const EMPTY = scoreXml({ beats: 4, beatType: 4, measures: 2, parts: [{ ...TREBLE }] });

/** "Numpad4", "Shift+KeyH", "Alt+Digit2", "Cmd+Alt+Digit5", "Key:=" (a produced character without a code). */
function pressed(token: string): PresetKeyEvent {
  const parts = token.split('+');
  const base = parts.pop()!;
  const modifiers = new Set(parts.map((part) => part.toLowerCase()));
  const shiftKey = modifiers.has('shift');
  let key = base;
  let code = base;
  if (base.startsWith('Key:')) {
    key = base.slice(4);
    code = '';
  } else if (/^Key[A-Z]$/.test(base)) {
    key = shiftKey ? base.slice(3) : base.slice(3).toLowerCase();
  } else if (/^(Digit|Numpad)[0-9]$/.test(base)) {
    key = base.slice(-1);
  }
  return { key, code, shiftKey, altKey: modifiers.has('alt'), metaKey: modifiers.has('cmd'), ctrlKey: modifiers.has('ctrl') };
}

function nativeEvent(token: string) {
  return {
    ...pressed(token),
    repeat: false,
    type: 'keydown',
    preventDefault() {},
    stopPropagation() {},
    target: { tagName: 'DIV', isContentEditable: false, closest: () => null },
  } as unknown as KeyboardEvent;
}

/** Types preset keys through the real note editor and returns the resulting MusicXML. */
function typeWithPreset(preset: KeyboardPresetId, tokens: string[]) {
  const editor = mountEditor(EMPTY);
  for (const token of tokens) {
    act(() => { editor.current.handleKeyDown(applyKeyboardPreset(nativeEvent(token), preset)); });
    editor.rerender();
  }
  const xml = editor.xml;
  editor.unmount();
  return xml;
}

function typeNexNote(script: string) {
  const editor = mountEditor(EMPTY);
  editor.press(script);
  const xml = editor.xml;
  editor.unmount();
  return xml;
}

test('the default preset leaves every key alone', () => {
  for (const token of ['Numpad4', 'Digit3', 'KeyH', 'KeyN', 'Alt+Digit2', 'Key:=']) {
    assert.equal(translatePresetKey('nexnote', pressed(token)), null, token);
    const event = nativeEvent(token);
    assert.equal(applyKeyboardPreset(event, 'nexnote'), event, token);
  }
});

test('every preset has a label and a description, and unknown ids are rejected', () => {
  for (const preset of KEYBOARD_PRESETS) {
    assert.ok(KEYBOARD_PRESET_LABELS[preset]);
    assert.ok(describeKeyboardPreset(preset).length > 0);
    assert.ok(Array.isArray(KEYBOARD_PRESET_BINDINGS[preset]));
  }
  assert.equal(isKeyboardPreset('finale'), true);
  assert.equal(isKeyboardPreset('dorico'), false);
  assert.equal(isKeyboardPreset(null), false);
});

test('Sibelius keypad: the keys name the Sibelius values, not the printed digits', () => {
  const key = (token: string) => translatePresetKey('sibelius', pressed(token));
  assert.deepEqual(key('Numpad4'), { key: '5', code: 'Digit5', shiftKey: false, altKey: false, metaKey: false, ctrlKey: false });
  assert.equal(key('Numpad1')?.key, '2', '32nd');
  assert.equal(key('Numpad6')?.key, '7', 'whole');
  assert.equal(key('Numpad7')?.key, '=', 'natural');
  assert.equal(key('Numpad8')?.key, '+', 'sharp');
  assert.equal(key('Numpad9')?.key, '-', 'flat');
  assert.equal(key('Numpad0')?.key, '0', 'rest');
  assert.equal(key('NumpadDecimal')?.key, '.', 'dot');
  assert.equal(key('NumpadEnter')?.key, 't', 'tie');
  assert.deepEqual([key('NumpadDivide')?.key, key('NumpadDivide')?.shiftKey], ['V', true], 'accent');
});

test('Sibelius: the digit row adds intervals, Alt+digit chooses the voice, H writes hairpins', () => {
  const key = (token: string) => translatePresetKey('sibelius', pressed(token));
  assert.deepEqual([key('Digit3')?.key, key('Digit3')?.altKey], ['3', true]);
  const voice = key('Alt+Digit2');
  assert.deepEqual([voice?.key, voice?.altKey, voice?.metaKey], ['2', true, true]);
  assert.equal(key('Alt+Digit7'), null);
  assert.equal(key('KeyH')?.key, '<');
  assert.equal(key('Shift+KeyH')?.key, '>');
  assert.equal(key('Cmd+KeyH'), null, 'Cmd+H stays the system shortcut');
  assert.equal(key('Cmd+Digit3'), null, 'Cmd+3 stays the triplet');
  assert.equal(key('KeyC'), null, 'pitch letters are untouched');
});

test('Sibelius laptop: the digit row is the keypad', () => {
  const key = (token: string) => translatePresetKey('sibelius-laptop', pressed(token));
  assert.equal(key('Digit4')?.key, '5', 'quarter');
  assert.equal(key('Digit4')?.altKey, false);
  assert.equal(key('Digit8')?.key, '+', 'sharp');
  assert.equal(key('Digit0')?.key, '0', 'rest');
  assert.equal(key('Numpad3')?.key, '4', 'an attached keypad works too');
});

test('Finale: digit row intervals, 9 triplet, laptop durations, accidentals and stem flip', () => {
  const key = (token: string) => translatePresetKey('finale', pressed(token));
  assert.deepEqual([key('Digit3')?.key, key('Digit3')?.altKey], ['3', true]);
  const triplet = key('Digit9');
  assert.deepEqual([triplet?.key, triplet?.metaKey, triplet?.altKey], ['3', true, false]);
  const quarter = key('Cmd+Alt+Digit5');
  assert.deepEqual([quarter?.key, quarter?.metaKey, quarter?.altKey], ['5', false, false]);
  assert.equal(key('Numpad5'), null, 'keypad digits already select durations');
  assert.equal(key('Key:=')?.key, '+', 'sharp');
  assert.equal(key('KeyN')?.key, '=', 'natural');
  assert.deepEqual([key('Shift+KeyN')?.key, key('Shift+KeyN')?.shiftKey], ['n', false], 'note input');
  assert.equal(key('KeyL')?.key, 'x');
  assert.equal(key('Key:\\')?.key, 'j');
  assert.equal(key('Alt+KeyG')?.key, '/');
  const layer = key('Shift+Alt+Digit2');
  assert.deepEqual([layer?.key, layer?.metaKey, layer?.altKey, layer?.shiftKey], ['2', true, true, false]);
});

test('a preset never translates keys typed into a form control', () => {
  const event = { ...nativeEvent('Numpad4'), target: { tagName: 'INPUT' } } as unknown as KeyboardEvent;
  assert.equal(applyKeyboardPreset(event, 'sibelius'), event);
});

test('the stand-in event forwards preventDefault to the real event', () => {
  let prevented = 0;
  const event = { ...nativeEvent('Numpad4'), preventDefault() { prevented += 1; } } as unknown as KeyboardEvent;
  const translated = applyKeyboardPreset(event, 'sibelius');
  assert.notEqual(translated, event);
  translated.preventDefault();
  assert.equal(prevented, 1);
});

test('Sibelius keys write the same music as the Nex Note keys', () => {
  // Quarter C, eighth D with a sharp, eighth rest, half E with an added third.
  const sibelius = typeWithPreset('sibelius', [
    'KeyN', 'Numpad4', 'KeyC', 'Numpad3', 'Numpad8', 'KeyD', 'Numpad0', 'Numpad5', 'KeyE', 'Digit3',
  ]);
  const nexNote = typeNexNote('N 5 c 4 + d 0 6 e Alt+3');
  assert.equal(sibelius, nexNote);
  assert.notEqual(sibelius, EMPTY, 'the keys wrote something');
  assert.match(sibelius, /<type>half<\/type>/);
});

test('Sibelius laptop keys write the same music as the Nex Note keys', () => {
  const laptop = typeWithPreset('sibelius-laptop', ['KeyN', 'Digit4', 'KeyC', 'Digit3', 'Digit9', 'KeyD', 'Digit0']);
  assert.equal(laptop, typeNexNote('N 5 c 4 - d 0'));
  assert.notEqual(laptop, EMPTY);
});

test('Finale keys write the same music as the Nex Note keys', () => {
  const finale = typeWithPreset('finale', [
    'Shift+KeyN', 'Numpad5', 'KeyC', 'Cmd+Alt+Digit4', 'Key:=', 'KeyD', 'KeyL', 'Digit3',
  ]);
  assert.equal(finale, typeNexNote('N 5 c 4 + d x Alt+3'));
  assert.notEqual(finale, EMPTY);
  assert.match(finale, /<chord\/>/, 'the digit row added an interval');
  assert.match(finale, /<alter>1<\/alter>/, '= wrote a sharp');
});

test('keyEvent tokens of the harness still mean Nex Note keys under the default preset', () => {
  const event = keyEvent('5');
  assert.equal(applyKeyboardPreset(event, 'nexnote'), event);
});
