import { recordInputMetric } from '@/src/score-input/input-metrics';
import { importMusicXmlToCore } from '@/src/musicxml-adapter/import/import-musicxml';
import { adoptExportedMeasureNumbers, exportCoreToMusicXml } from '@/src/musicxml-adapter/export/export-core-to-musicxml';
import { executeHybridCommands } from '@/src/score-core/commands/hybrid-command-executor';
import type { ScoreDocumentModel } from '@/src/score-core/model/types';
import { normalizeScoreDocument } from '@/src/score-core/normalize/normalize-score-document';
import { validateScoreDocument } from '@/src/score-core/validation/validate-score-document';
import type { SelectionRemap } from '@/src/score-core/commands/core-command-executor';
import { normalizeScoreCommands, type ValidatedScoreCommand } from '@/src/shared/schemas/score-command';

export interface DocumentDiagnostic {
  level: 'info' | 'warning' | 'error';
  code: string;
  message: string;
}

export interface DocumentState {
  xml: string;
  sourceMusicXml: string;
  coreDocument: ScoreDocumentModel | null;
  diagnostics: DocumentDiagnostic[];
  revision: number;
}

export interface ApplyDocumentCommandsResult extends DocumentState {
  appliedCommands: ValidatedScoreCommand[];
  selectionRemap: SelectionRemap;
}

interface BuildDocumentStateOptions {
  sourceMusicXml?: string;
}

interface BuildDocumentStateFromCoreOptions {
  sourceMusicXml: string;
  xml?: string;
}

function finalizeDocumentState(
  xml: string,
  sourceMusicXml: string,
  coreDocument: ScoreDocumentModel | null,
): DocumentState {
  return {
    xml,
    sourceMusicXml,
    coreDocument,
    diagnostics: validateScoreDocument(coreDocument),
    revision: coreDocument?.revision ?? 0,
  };
}

export function buildDocumentState(xml: string, options?: BuildDocumentStateOptions): DocumentState {
  const coreDocument = xml ? importMusicXmlToCore(xml) : null;
  if (!coreDocument) return finalizeDocumentState(xml, options?.sourceMusicXml ?? xml, null);

  const normalizedCoreDocument = normalizeScoreDocument(coreDocument);
  const renderXml = exportCoreToMusicXml(xml, normalizedCoreDocument);
  adoptExportedMeasureNumbers(normalizedCoreDocument);
  return finalizeDocumentState(renderXml, options?.sourceMusicXml ?? xml, normalizedCoreDocument);
}

export function buildDocumentStateFromCore(
  coreDocument: ScoreDocumentModel | null,
  options: BuildDocumentStateFromCoreOptions,
): DocumentState {
  if (!coreDocument) {
    return finalizeDocumentState(options.xml ?? '', options.sourceMusicXml, null);
  }

  if (!options.xml && !options.sourceMusicXml.trim()) {
    throw new Error('Core-document hydration requires sourceMusicXml or a pre-rendered xml string.');
  }

  const normalizedCoreDocument = normalizeScoreDocument(structuredClone(coreDocument));
  const xml = options.xml ?? exportCoreToMusicXml(options.sourceMusicXml, normalizedCoreDocument);
  if (!options.xml) adoptExportedMeasureNumbers(normalizedCoreDocument);
  return finalizeDocumentState(xml, options.sourceMusicXml, normalizedCoreDocument);
}

export function applyDocumentCommands(
  documentState: Pick<DocumentState, 'xml' | 'coreDocument'> & Partial<Pick<DocumentState, 'sourceMusicXml'>>,
  commands: unknown[],
): ApplyDocumentCommandsResult {
  const began = performance.now();
  const appliedCommands = normalizeScoreCommands(commands);
  const baselineCoreDocument = documentState.coreDocument ?? (documentState.xml ? normalizeScoreDocument(importMusicXmlToCore(documentState.xml)) : null);
  const execution = executeHybridCommands(documentState.xml, baselineCoreDocument, appliedCommands);
  if (execution.coreDiagnostics.some(d => d.code.endsWith('_rejected'))) {
    recordInputMetric('semantic-command', performance.now() - began);
    return { xml: documentState.xml, sourceMusicXml: documentState.sourceMusicXml ?? documentState.xml, coreDocument: baselineCoreDocument, diagnostics: execution.coreDiagnostics, revision: baselineCoreDocument?.revision ?? 0, appliedCommands: [], selectionRemap: {} };
  }
  // Without a fallback the executor hands back the document it exported the XML from: normalized
  // there, or the unchanged baseline. Normalizing it again copied the whole document a second time
  // on every edit (gate 3 in docs/note-entry-mastery-ledger.md).
  const nextCoreDocument = execution.fallbackCommands.length === 0
    ? execution.coreDocument
    : (execution.xml ? normalizeScoreDocument(importMusicXmlToCore(execution.xml)) : null);
  const diagnostics: DocumentDiagnostic[] = [];
  const sourceMusicXml = documentState.sourceMusicXml ?? documentState.xml;

  if (execution.supportedCommands.length > 0) {
    diagnostics.push({
      level: 'info',
      code: 'core_execution',
      message: `Executed ${execution.supportedCommands.length} command(s) through the core-model path.`,
    });
  }

  if (execution.fallbackCommands.length > 0) {
    diagnostics.push({
      level: execution.supportedCommands.length > 0 ? 'warning' : 'info',
      code: 'legacy_fallback',
      message: `Executed ${execution.fallbackCommands.length} command(s) through the legacy XML fallback path (${execution.fallbackReasons.join('; ')}).`,
    });
  }

  diagnostics.push(...execution.coreDiagnostics);

  diagnostics.push(...validateScoreDocument(nextCoreDocument));

  recordInputMetric('semantic-command', performance.now() - began);
  return {
    xml: execution.xml,
    sourceMusicXml,
    coreDocument: nextCoreDocument,
    diagnostics,
    revision: nextCoreDocument?.revision ?? documentState.coreDocument?.revision ?? 0,
    appliedCommands,
    selectionRemap: execution.selectionRemap,
  };
}

/** A verified editor proposal is reusable only against the exact immutable baseline. */
export interface PreparedDocumentCommands {
  baselineXml: string;
  baselineCore: ScoreDocumentModel | null;
  commandFingerprint: string;
  result: ApplyDocumentCommandsResult;
}

export function prepareDocumentCommands(
  state: Pick<DocumentState, 'xml' | 'coreDocument'>,
  commands: unknown[],
): PreparedDocumentCommands {
  return {
    baselineXml: state.xml,
    baselineCore: state.coreDocument,
    commandFingerprint: JSON.stringify(commands),
    result: applyDocumentCommands(state, commands),
  };
}

export function commitPreparedDocumentCommands(
  state: Pick<DocumentState, 'xml' | 'coreDocument'> & Partial<Pick<DocumentState, 'sourceMusicXml'>>,
  commands: unknown[],
  prepared?: PreparedDocumentCommands,
): ApplyDocumentCommandsResult {
  if (prepared && prepared.baselineCore === state.coreDocument
    && prepared.baselineXml === state.xml
    && prepared.commandFingerprint === JSON.stringify(commands)) {
    return { ...prepared.result, sourceMusicXml: state.sourceMusicXml ?? state.xml };
  }
  return applyDocumentCommands(state, commands);
}
