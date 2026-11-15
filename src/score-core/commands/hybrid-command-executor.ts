import { applyLegacyXmlScoreCommands } from '@/src/score-core/commands/legacy-xml-executor';
import { executeCoreCommands, supportsCoreExecution, type SelectionRemap } from '@/src/score-core/commands/core-command-executor';
import type { ScoreDocumentModel } from '@/src/score-core/model/types';
import { adoptExportedMeasureNumbers, exportCoreToMusicXml } from '@/src/musicxml-adapter/export/export-core-to-musicxml';
import { importMusicXmlToCore } from '@/src/musicxml-adapter/import/import-musicxml';
import { normalizeScoreDocument, normalizeScoreDocumentInPlace } from '@/src/score-core/normalize/normalize-score-document';
import type { ValidatedScoreCommand } from '@/src/shared/schemas/score-command';

/**
 * True when `result` holds a part, staff, measure or voice object of `input` (or is `input`).
 * In-place normalization mutates exactly those nodes (and `adoptExportedMeasureNumbers` the
 * measures), so a shared node would leak the mutation into the caller's document. The executor
 * returns a structured clone today; this O(nodes) identity check keeps the in-place path safe if
 * that ever changes.
 */
function sharesNormalizedNodes(result: ScoreDocumentModel, input: ScoreDocumentModel) {
  if (result === input || result.score === input.score) return true;
  const owned = new Set<object>();
  for (const part of input.score.parts) {
    owned.add(part);
    for (const staff of part.staves) {
      owned.add(staff);
      for (const measure of staff.measures) {
        owned.add(measure);
        for (const voice of measure.voices) owned.add(voice);
      }
    }
  }
  for (const part of result.score.parts) {
    if (owned.has(part)) return true;
    for (const staff of part.staves) {
      if (owned.has(staff)) return true;
      for (const measure of staff.measures) {
        if (owned.has(measure)) return true;
        for (const voice of measure.voices) if (owned.has(voice)) return true;
      }
    }
  }
  return false;
}

export interface HybridExecutionResult {
  xml: string;
  coreDocument: ScoreDocumentModel | null;
  selectionRemap: SelectionRemap;
  supportedCommands: ValidatedScoreCommand[];
  fallbackCommands: ValidatedScoreCommand[];
  fallbackReasons: string[];
  coreDiagnostics: Array<{ level: 'info' | 'warning' | 'error'; code: string; message: string }>;
}

const UNSAFE_CORE_ROUNDTRIP_TAGS = [
  'staff-details',
  'measure-style',
  'part-group',
  'group-symbol',
];

const CORE_SAFE_WITH_UNSAFE_ROUNDTRIP_TAGS = new Set([
  'setKey',
  'setGuitarFret',
  // Linked notation/TAB deletion needs the same core pairing as insertion.
  'deleteNote',
  'deleteRange',
  'setAccidentalDisplay',
  'replaceMidiPassage',
  'editRhythm',
  'editTupletUnit',
  'addTuplet',
  'setAccidentalPolicy',
  'setRhythmSpelling',
  'moveGraceNote',
  'addGraceNote',
  'removeGraceNote',
  'pasteContent',
  'duplicateNote',
  'changeNoteDuration',
  'replaceWithRest',
  'transposeDocumentChromatic',
  'transposeChromatic',
  'transposeRangeChromatic',
]);

export function detectUnsafeCoreRoundtripTags(sourceXml: string) {
  return UNSAFE_CORE_ROUNDTRIP_TAGS.filter((tag) => sourceXml.includes(`<${tag}`));
}

function supportsCoreExecutionWithUnsafeRoundtripTags(command: ValidatedScoreCommand) {
  // Note inserts must run through the core executor even on scores with
  // unsafe-roundtrip tags: the legacy XML fallback pads remainders with
  // beat-crossing dotted rests and cannot mirror paired TAB staves. The
  // core export roundtrip preserves staff-details (covered by tests).
  if (command.type === 'insertNoteAt' || command.type === 'insertNote') return supportsCoreExecution(command);
  return supportsCoreExecution(command) && CORE_SAFE_WITH_UNSAFE_ROUNDTRIP_TAGS.has(command.type);
}

export function executeHybridCommands(
  sourceXml: string,
  coreDocument: ScoreDocumentModel | null,
  commands: ValidatedScoreCommand[],
): HybridExecutionResult {
  const unsafeTags = detectUnsafeCoreRoundtripTags(sourceXml);
  const hasUnsafeTags = unsafeTags.length > 0;
  const isSupportedCommand = (command: ValidatedScoreCommand) => (
    hasUnsafeTags
      ? supportsCoreExecutionWithUnsafeRoundtripTags(command)
      : supportsCoreExecution(command)
  );
  const fallbackReason = (command: ValidatedScoreCommand) => (
    hasUnsafeTags && supportsCoreExecution(command)
      ? `unsafe_roundtrip_tags:${unsafeTags.join(',')}`
      : `unsupported_command:${command.type}`
  );

  const supportedCommands = commands.filter(isSupportedCommand);
  const fallbackCommands = commands.filter((command) => !isSupportedCommand(command));
  const fallbackReasons = fallbackCommands.map(fallbackReason);

  let nextCoreDocument = coreDocument;
  let nextXml = sourceXml;
  let selectionRemap: SelectionRemap = {};
  const coreDiagnostics: HybridExecutionResult['coreDiagnostics'] = [];

  let index = 0;
  while (index < commands.length) {
    const runIsSupported = isSupportedCommand(commands[index]!);
    const run: ValidatedScoreCommand[] = [];
    while (index < commands.length && isSupportedCommand(commands[index]!) === runIsSupported) {
      run.push(commands[index]!);
      index += 1;
    }

    if (runIsSupported) {
      nextCoreDocument = nextCoreDocument ?? (nextXml ? importMusicXmlToCore(nextXml) : null);
      if (!nextCoreDocument) continue;

      const execution = executeCoreCommands(nextCoreDocument, run);
      const unchanged = execution.coreDocument === nextCoreDocument;
      // Export what the document state will hold: the normalized model. Exporting the raw execution
      // result left rest spellings in the XML that the next edit anywhere rewrote (F12).
      // A changed result is the executor's own fresh clone, so it is normalized in place instead of
      // being cloned a second time, unless it shares a node that normalization would mutate.
      nextCoreDocument = unchanged
        ? execution.coreDocument
        : sharesNormalizedNodes(execution.coreDocument, nextCoreDocument)
          ? normalizeScoreDocument(execution.coreDocument)
          : normalizeScoreDocumentInPlace(execution.coreDocument);
      selectionRemap = { ...selectionRemap, ...execution.selectionRemap };
      coreDiagnostics.push(...execution.diagnostics);
      if (!unchanged) {
        nextXml = exportCoreToMusicXml(nextXml, nextCoreDocument);
        // `nextCoreDocument` is the fresh copy made by the normalization above.
        adoptExportedMeasureNumbers(nextCoreDocument);
      }
      if (hasUnsafeTags && run.some((command) => command.type === 'setGuitarFret')) {
        nextCoreDocument = importMusicXmlToCore(nextXml);
      }
      continue;
    }

    nextXml = applyLegacyXmlScoreCommands(nextXml, run);
    nextCoreDocument = nextXml ? importMusicXmlToCore(nextXml) : null;
  }

  return {
    xml: nextXml,
    coreDocument: nextCoreDocument,
    selectionRemap,
    supportedCommands,
    fallbackCommands,
    fallbackReasons,
    coreDiagnostics,
  };
}
