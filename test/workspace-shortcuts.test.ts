import test from 'node:test';
import assert from 'node:assert/strict';

import { resolveWorkspaceShortcut } from '../lib/workspace-shortcuts.ts';

const event = (key: string, mods: Partial<Parameters<typeof resolveWorkspaceShortcut>[0]> = {}) => ({
  key, metaKey: false, ctrlKey: false, altKey: false, shiftKey: false, isTextEntry: false, ...mods,
});

test('question mark and F1 open the shortcut cheat sheet', () => {
  assert.equal(resolveWorkspaceShortcut(event('?', { shiftKey: true })), 'show-shortcuts');
  assert.equal(resolveWorkspaceShortcut(event('F1')), 'show-shortcuts');
});

test('question mark is ignored while typing, F1 still works', () => {
  assert.equal(resolveWorkspaceShortcut(event('?', { shiftKey: true, isTextEntry: true })), null);
  assert.equal(resolveWorkspaceShortcut(event('F1', { isTextEntry: true })), 'show-shortcuts');
});

test('F8 and F9 toggle inspector and palette', () => {
  assert.equal(resolveWorkspaceShortcut(event('F8')), 'toggle-inspector');
  assert.equal(resolveWorkspaceShortcut(event('F9')), 'toggle-palette');
});

test('modified chords and unrelated keys never match', () => {
  assert.equal(resolveWorkspaceShortcut(event('F8', { ctrlKey: true })), null);
  assert.equal(resolveWorkspaceShortcut(event('F9', { altKey: true })), null);
  assert.equal(resolveWorkspaceShortcut(event('F1', { metaKey: true })), null);
  assert.equal(resolveWorkspaceShortcut(event('F8', { shiftKey: true })), null);
  assert.equal(resolveWorkspaceShortcut(event('/', { ctrlKey: true })), null);
  assert.equal(resolveWorkspaceShortcut(event('n')), null);
});
