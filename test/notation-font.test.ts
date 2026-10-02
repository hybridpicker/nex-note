import assert from 'node:assert/strict';
import test from 'node:test';
import { applyNotationFont, isNotationFont, NOTATION_FONT_STORAGE_KEY, osmdNoteFontRule, readNotationFont } from '../lib/notation-font.ts';

test('notation font defaults to Bravura and maps to OSMD rules', () => {
  assert.equal(readNotationFont(), 'bravura');
  assert.equal(osmdNoteFontRule('bravura'), undefined);
  assert.equal(osmdNoteFontRule('petaluma'), 'petaluma');
  assert.equal(isNotationFont('comic-sans'), false);
});

test('stored notation font is applied to OSMD engraving rules', () => {
  const store = new Map<string, string>([[NOTATION_FONT_STORAGE_KEY, 'petaluma']]);
  (globalThis as { localStorage?: unknown }).localStorage = { getItem: (k: string) => store.get(k) ?? null };
  try {
    const osmd = { EngravingRules: {} as { DefaultVexFlowNoteFont?: string } };
    applyNotationFont(osmd);
    assert.equal(osmd.EngravingRules.DefaultVexFlowNoteFont, 'petaluma');
    store.set(NOTATION_FONT_STORAGE_KEY, 'bravura');
    const fresh = { EngravingRules: {} as { DefaultVexFlowNoteFont?: string } };
    applyNotationFont(fresh);
    assert.equal(fresh.EngravingRules.DefaultVexFlowNoteFont, undefined);
  } finally {
    delete (globalThis as { localStorage?: unknown }).localStorage;
  }
});
