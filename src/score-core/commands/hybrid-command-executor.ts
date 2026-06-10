import { applyLegacyXmlScoreCommands } from '@/src/score-core/commands/legacy-xml-executor';
import { executeCoreCommands, supportsCoreExecution, type SelectionRemap } from '@/src/score-core/commands/core-command-executor';
import type { ScoreDocumentModel } from '@/src/score-core/model/types';
import { exportCoreToMusicXml } from '@/src/musicxml-adapter/export/export-core-to-musicxml';
import { importMusicXmlToCore } from '@/src/musicxml-adapter/import/import-musicxml';
import type { ValidatedScoreCommand } from '@/src/shared/schemas/score-command';

export interface HybridExecutionResult {
  xml: string;
  coreDocument: ScoreDocumentModel | null;
  selectionRemap: SelectionRemap;
  supportedCommands: ValidatedScoreCommand[];
  fallbackCommands: ValidatedScoreCommand[];
  fallbackReasons: string[];
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
  'changeNoteDuration',
  'transposeDocumentChromatic',
  'transposeChromatic',
  'transposeRangeChromatic',
]);

export function detectUnsafeCoreRoundtripTags(sourceXml: string) {
  return UNSAFE_CORE_ROUNDTRIP_TAGS.filter((tag) => sourceXml.includes(`<${tag}`));
}

function supportsCoreExecutionWithUnsafeRoundtripTags(command: ValidatedScoreCommand) {
  if (command.type === 'insertNoteAt' && command.guitar) return supportsCoreExecution(command);
  return supportsCoreExecution(command) && CORE_SAFE_WITH_UNSAFE_ROUNDTRIP_TAGS.has(command.type);
}

export function executeHybridCommands(
  sourceXml: string,
  coreDocument: ScoreDocumentModel | null,
  commands: ValidatedScoreCommand[],
): HybridExecutionResult {
  const unsafeTags = detectUnsafeCoreRoundtripTags(sourceXml);
  const hasUnsafeTags = unsafeTags.length > 0;
  const supportedCommands = commands.filter((command) => (
    hasUnsafeTags
      ? supportsCoreExecutionWithUnsafeRoundtripTags(command)
      : supportsCoreExecution(command)
  ));
  const fallbackCommands = commands.filter((command) => !supportedCommands.includes(command));
  const fallbackReasons = fallbackCommands.map((command) => (
    hasUnsafeTags && supportsCoreExecution(command)
      ? `unsafe_roundtrip_tags:${unsafeTags.join(',')}`
      : `unsupported_command:${command.type}`
  ));

  let nextCoreDocument = coreDocument;
  let nextXml = sourceXml;
  let selectionRemap: SelectionRemap = {};

  if (supportedCommands.length > 0 && coreDocument) {
    const execution = executeCoreCommands(coreDocument, supportedCommands);
    nextCoreDocument = execution.coreDocument;
    selectionRemap = execution.selectionRemap;
    nextXml = exportCoreToMusicXml(nextXml, nextCoreDocument);
    if (hasUnsafeTags && supportedCommands.some((command) => command.type === 'setGuitarFret')) {
      nextCoreDocument = importMusicXmlToCore(nextXml);
    }
  }

  if (fallbackCommands.length > 0) {
    nextXml = applyLegacyXmlScoreCommands(nextXml, fallbackCommands);
  }

  return {
    xml: nextXml,
    coreDocument: nextCoreDocument,
    selectionRemap,
    supportedCommands,
    fallbackCommands,
    fallbackReasons,
  };
}
