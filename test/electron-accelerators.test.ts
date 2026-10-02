import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { acceleratorMatchesInput, parseAccelerator } = require('../electron/launch-helpers.cjs');

const key = (k: string, mods: { control?: boolean; shift?: boolean; alt?: boolean; meta?: boolean } = {}) => ({
  type: 'keyDown', key: k, control: false, shift: false, alt: false, meta: false, ...mods,
});

test('parseAccelerator understands modifiers and symbol keys', () => {
  assert.deepEqual(parseAccelerator('Shift+CommandOrControl+E'), { key: 'e', ctrl: true, shift: true, alt: false });
  assert.deepEqual(parseAccelerator('CommandOrControl+Plus'), { key: '+', ctrl: true, shift: false, alt: false });
  assert.deepEqual(parseAccelerator('CommandOrControl+-'), { key: '-', ctrl: true, shift: false, alt: false });
  assert.equal(parseAccelerator(''), null);
});

test('accelerators match exactly the intended key chords', () => {
  const save = parseAccelerator('CommandOrControl+S');
  const saveAs = parseAccelerator('Shift+CommandOrControl+S');
  assert.equal(acceleratorMatchesInput(save, key('s', { control: true })), true);
  assert.equal(acceleratorMatchesInput(save, key('S', { control: true })), true);
  assert.equal(acceleratorMatchesInput(save, key('s', { control: true, shift: true })), false);
  assert.equal(acceleratorMatchesInput(saveAs, key('S', { control: true, shift: true })), true);
  assert.equal(acceleratorMatchesInput(save, key('s')), false, 'plain typing never matches');
  assert.equal(acceleratorMatchesInput(save, key('s', { control: true, alt: true })), false);
  assert.equal(acceleratorMatchesInput(save, key('s', { control: true, meta: true })), false);
  assert.equal(acceleratorMatchesInput(save, { ...key('s', { control: true }), type: 'keyUp' }), false);
});

test('zoom accelerators accept layout variants of plus and minus', () => {
  const zoomIn = parseAccelerator('CommandOrControl+Plus');
  const zoomOut = parseAccelerator('CommandOrControl+-');
  assert.equal(acceleratorMatchesInput(zoomIn, key('+', { control: true, shift: true })), true);
  assert.equal(acceleratorMatchesInput(zoomIn, key('+', { control: true })), true);
  assert.equal(acceleratorMatchesInput(zoomIn, key('=', { control: true })), true);
  assert.equal(acceleratorMatchesInput(zoomOut, key('-', { control: true })), true);
});
