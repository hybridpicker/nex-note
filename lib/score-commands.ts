import { applyDocumentCommands } from '@/src/score-core/commands/apply-document-commands';
import { warnCompatibilityShim } from '@/src/score-core/commands/compatibility-shims';
import { summarizeXmlScoreDocument } from '@/src/score-core/commands/legacy-xml-executor';
import { normalizeScoreCommands } from '@/src/shared/schemas/score-command';

export type {
  LegacyScoreOperation,
  NoteLocatorLike,
  ScoreCommand,
  ScoreDocumentSummary,
  ScorePartSummary,
  ValidatedScoreCommand,
} from '@/src/shared/schemas/score-command';

export {
  isNoteEditCommand,
  normalizeScoreCommand,
} from '@/src/shared/schemas/score-command';

import type { ScoreCommand } from '@/src/shared/schemas/score-command';

export function applyScoreCommands(xml: string, commands: ScoreCommand[]): string {
  warnCompatibilityShim('applyScoreCommands');
  return applyDocumentCommands({ xml, coreDocument: null }, commands).xml;
}

export function normalizeCommands(input: unknown[]): ScoreCommand[] {
  return normalizeScoreCommands(input) as ScoreCommand[];
}

export function summarizeScoreDocument(xml: string) {
  return summarizeXmlScoreDocument(xml);
}
