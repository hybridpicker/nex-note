const CORE_BACKED_COMMANDS = [
  'setTitle',
  'setSubtitle',
  'setComposer',
  'setArranger',
  'setKey',
  'transposeDocumentChromatic',
  'setTimeSignature',
  'setClef',
  'removeClefChange',
  'setPartTranspose',
  'fitRangeOctaves',
  'fitPartToInstrument',
  'setPartName',
  'setPartAbbreviation',
  'setInstrumentName',
  'insertMeasureAfter',
  'deleteMeasure',
  'changeNotePitch',
  'deleteNote',
  'clearMeasureVoice',
  'rippleDelete',
  'rippleDeleteRange',
  'insertNote',
  'insertRest',
  'transposeChromatic',
  'toggleArticulation',
  'clearArticulations',
  'toggleTie',
  'toggleSlur',
  'addDynamic',
  'setBarline',
  'addLyric',
  'setLyricLine',
  'removeLyricLine',
  'removeDirection',
  'transposeRangeChromatic',
  'clearRangeArticulations',
  'duplicateNote',
  'addTuplet',
  'addGraceNote',
  'removeGraceNote',
  'addFingering',
  'addOrnament',
  'addWedge',
  'addPedalSpan',
  'addOttava',
  'addRehearsalMarksEvery',
  'applyPracticeProfile',
] as const;

const LEGACY_FALLBACK_COMMANDS = [
  'removeArticulations',
  'setTempo',
  'addStartRepeat',
  'addEndRepeat',
  'addVolta2',
  'setEnding',
  'addChords',
  'addRehearsalMark',
  'addWords',
  'addExpressionText',
  'setSystemBreak',
  'setPageBreak',
  'setMeasureLayoutHint',
] as const;

export interface AiCapabilityContext {
  coreBackedCommands: string[];
  legacyFallbackCommands: string[];
}

export function buildAiCapabilityContext(): AiCapabilityContext {
  return {
    coreBackedCommands: [...CORE_BACKED_COMMANDS],
    legacyFallbackCommands: [...LEGACY_FALLBACK_COMMANDS],
  };
}
