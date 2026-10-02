// OSMD ships VexFlow internally, so the global music-font stack can only be switched back to the
// default (Bravura, SMuFL) by restarting; the preference is therefore read once when a score renders.
export const NOTATION_FONT_STORAGE_KEY = 'nex-note.notationFont';

export const NOTATION_FONTS = ['bravura', 'petaluma', 'gonville'] as const;
export type NotationFont = (typeof NOTATION_FONTS)[number];

export function isNotationFont(value: unknown): value is NotationFont {
  return typeof value === 'string' && (NOTATION_FONTS as readonly string[]).includes(value);
}

export function readNotationFont(): NotationFont {
  try {
    const stored = typeof localStorage === 'undefined' ? null : localStorage.getItem(NOTATION_FONT_STORAGE_KEY);
    return isNotationFont(stored) ? stored : 'bravura';
  } catch {
    return 'bravura';
  }
}

/** Value for OSMD `EngravingRules.DefaultVexFlowNoteFont`; Bravura is the engine default. */
export function osmdNoteFontRule(font: NotationFont): 'petaluma' | 'gonville' | undefined {
  return font === 'bravura' ? undefined : font;
}

export function applyNotationFont(osmd: { EngravingRules: { DefaultVexFlowNoteFont?: string } }) {
  const rule = osmdNoteFontRule(readNotationFont());
  if (rule) osmd.EngravingRules.DefaultVexFlowNoteFont = rule;
}
