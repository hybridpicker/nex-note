import { applyDocumentCommands } from '@/src/score-core/commands/apply-document-commands';
import { warnCompatibilityShim } from '@/src/score-core/commands/compatibility-shims';
import type { ScoreCommand } from './score-commands';

export type Operation = ScoreCommand;

/**
 * Compatibility alias for legacy `operations` callers.
 * New code should use semantic commands through `applyDocumentCommands`.
 */
export function applyOperations(xml: string, operations: Operation[]): string {
  warnCompatibilityShim('applyOperations');
  return applyDocumentCommands({ xml, coreDocument: null }, operations).xml;
}
