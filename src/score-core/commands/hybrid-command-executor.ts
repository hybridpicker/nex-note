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
  'setAccidentalDisplay',
  'addTuplet',
  'addGraceNote',
  'removeGraceNote',
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
      nextCoreDocument = execution.coreDocument;
      selectionRemap = { ...selectionRemap, ...execution.selectionRemap };
      coreDiagnostics.push(...execution.diagnostics);
      nextXml = exportCoreToMusicXml(nextXml, nextCoreDocument);
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
