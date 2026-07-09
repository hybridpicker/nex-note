'use client';

import { useCallback, useRef, useState } from 'react';
import type { NxnFileV1 } from '@/lib/nxn-file';
import {
  applyDocumentCommands,
  buildDocumentState,
  buildDocumentStateFromCore,
  type DocumentState,
} from '@/src/score-core/commands/apply-document-commands';
import { buildDocumentDoctorReport, doctorReportBlocksTransaction } from '@/src/debug/doctor/document-doctor';
import { readDoctorSettings } from '@/src/debug/doctor/flags';
import { publishDoctorReport } from '@/src/debug/doctor/runtime';
import { deriveInverseCommands, type InverseDerivationIssue } from '@/src/score-core/history/derive-inverse-commands';
import type { ScoreDocumentModel } from '@/src/score-core/model/types';
import {
  DEFAULT_SCORE_DOCUMENT_SESSION,
  scoreDocumentSessionEquals,
  type ScoreDocumentSelectedDuration,
  type ScoreDocumentSelectionAnchor,
  type ScoreDocumentSessionState,
  type ScoreViewMode,
} from '@/src/score-session/types';
import type { ScoreCommand } from '@/lib/score-commands';

export type {
  ScoreDocumentSelectedDuration,
  ScoreDocumentSelectionAnchor,
  ScoreDocumentSessionState,
  ScoreViewMode,
} from '@/src/score-session/types';

export interface ScoreDocumentTransaction {
  id: string;
  label?: string;
  source: 'load' | 'replace' | 'apply' | 'undo' | 'redo' | 'reset';
  mode: 'snapshot' | 'commands' | 'system';
  commandCount: number;
  rollbackMode: 'none' | 'inverse' | 'snapshot';
  reversible: boolean;
  inverseCommands?: ScoreCommand[];
  inverseCommandCount: number;
  inverseDerivationIssues?: InverseDerivationIssue[];
  beforeRevision?: number;
  afterRevision?: number;
  selectionAnchor?: ScoreDocumentSelectionAnchor | null;
}

interface HistoryEntry {
  document?: DocumentState;
  commands?: ScoreCommand[];
  rollbackDocument?: DocumentState;
  transaction: ScoreDocumentTransaction;
  mode: 'snapshot' | 'commands';
}

interface HistoryMeta {
  depth: number;
  lastAction?: 'load' | 'replace' | 'apply' | 'undo' | 'redo' | 'reset';
  lastLabel?: string;
  lastTransaction?: ScoreDocumentTransaction;
  currentSelectionAnchor?: ScoreDocumentSelectionAnchor | null;
}

const MAX_HISTORY = 100;
export const SNAPSHOT_INTERVAL = 25;

function isHeavyStructuralCommand(command: ScoreCommand) {
  if (command.type === 'rippleDelete' || command.type === 'rippleDeleteRange') return true;
  // Future hook: treat cross-measure insertions as forced checkpoints once we
  // can cheaply detect that an absolute insert spilled into later measures.
  if (command.type === 'insertNoteAt') return false;
  return false;
}

export function shouldForceSnapshot(commands: ScoreCommand[], currentHistoryLength: number) {
  if ((currentHistoryLength + 1) % SNAPSHOT_INTERVAL === 0) return true;
  return commands.some((command) => isHeavyStructuralCommand(command));
}

function coreDocumentsDifferIgnoringRevision(
  current: ScoreDocumentModel | null,
  next: ScoreDocumentModel | null,
) {
  if (current == null || next == null) return current !== next;
  const { revision: _currentRevision, ...currentValue } = current;
  const { revision: _nextRevision, ...nextValue } = next;
  return JSON.stringify(currentValue) !== JSON.stringify(nextValue);
}

interface UseScoreDocumentOptions {
  buildXmlState?: (xml: string, options?: { sourceMusicXml?: string }) => DocumentState;
  buildCoreState?: (coreDocument: ScoreDocumentModel | null, options: { sourceMusicXml: string; xml?: string }) => DocumentState;
}

interface LoadXmlOptions {
  deferCoreHydration?: boolean;
}

function createTransaction(params: Omit<ScoreDocumentTransaction, 'id'>): ScoreDocumentTransaction {
  return {
    id: `${params.source}:${params.mode}:${params.afterRevision ?? params.beforeRevision ?? 0}:${params.commandCount}:${Date.now()}:${Math.random().toString(36).slice(2, 8)}`,
    ...params,
  };
}

function publishDocumentDoctorIfEnabled(input: Omit<Parameters<typeof buildDocumentDoctorReport>[0], 'settings'>) {
  const settings = readDoctorSettings();
  if (!settings.enabled) return null;
  const report = buildDocumentDoctorReport({
    ...input,
    settings,
  });
  publishDoctorReport(report);
  return report;
}

function buildRawXmlState(xml: string, sourceMusicXml = xml): DocumentState {
  return {
    xml,
    sourceMusicXml,
    coreDocument: null,
    diagnostics: [],
    revision: 0,
  };
}

export function useScoreDocument(initialXml = '', options?: UseScoreDocumentOptions) {
  const buildXmlState = options?.buildXmlState ?? buildDocumentState;
  const buildCoreState = options?.buildCoreState ?? buildDocumentStateFromCore;

  const [baseDocument, setBaseDocument] = useState<DocumentState>(() => buildXmlState(initialXml));
  const [document, setDocument] = useState<DocumentState>(() => buildXmlState(initialXml));
  const [undoStack, setUndoStack] = useState<HistoryEntry[]>([]);
  const [redoStack, setRedoStack] = useState<HistoryEntry[]>([]);
  const [lastCommands, setLastCommands] = useState<ScoreCommand[]>([]);
  const [historyMeta, setHistoryMeta] = useState<HistoryMeta>({ depth: 0 });
  const [session, setSession] = useState<ScoreDocumentSessionState>(DEFAULT_SCORE_DOCUMENT_SESSION);
  const baseDocumentRef = useRef(baseDocument);
  const documentRef = useRef(document);
  const undoStackRef = useRef<HistoryEntry[]>([]);
  const redoStackRef = useRef<HistoryEntry[]>([]);

  const cloneDocument = useCallback((state: DocumentState): DocumentState => structuredClone(state), []);
  const replaceSession = useCallback((nextSession: ScoreDocumentSessionState) => {
    setSession((current) => {
      const cloned = structuredClone(nextSession);
      return scoreDocumentSessionEquals(current, cloned) ? current : cloned;
    });
  }, []);

  const updateSession = useCallback((patch: Partial<ScoreDocumentSessionState>) => {
    setSession((current) => {
      const nextSession: ScoreDocumentSessionState = {
        ...current,
        ...patch,
        selectionAnchor: patch.selectionAnchor === undefined ? current.selectionAnchor : patch.selectionAnchor,
      };
      return scoreDocumentSessionEquals(current, nextSession) ? current : nextSession;
    });
  }, []);

  const replayHistory = useCallback((baseline: DocumentState, entries: HistoryEntry[]) => {
    return entries.reduce((state, entry) => {
      if (entry.mode === 'snapshot') {
        return entry.document ? cloneDocument(entry.document) : state;
      }
      if (entry.commands?.length) {
        const next = applyDocumentCommands(state, entry.commands);
        return {
          xml: next.xml,
          sourceMusicXml: next.sourceMusicXml,
          coreDocument: next.coreDocument,
          diagnostics: next.diagnostics,
          revision: next.revision,
        };
      }
      return state;
    }, cloneDocument(baseline));
  }, [cloneDocument]);

  const setBaseDocumentLive = useCallback((next: DocumentState) => {
    baseDocumentRef.current = next;
    setBaseDocument(next);
  }, []);

  const setDocumentLive = useCallback((next: DocumentState) => {
    documentRef.current = next;
    setDocument(next);
  }, []);

  const setUndoStackLive = useCallback((next: HistoryEntry[]) => {
    undoStackRef.current = next;
    setUndoStack(next);
  }, []);

  const setRedoStackLive = useCallback((next: HistoryEntry[]) => {
    redoStackRef.current = next;
    setRedoStack(next);
  }, []);

  const pushUndo = useCallback((entry: HistoryEntry) => {
    const nextUndo = [...undoStackRef.current, entry].slice(-MAX_HISTORY);
    setUndoStackLive(nextUndo);
    return nextUndo;
  }, [setUndoStackLive]);

  const clearHistoryStacks = useCallback(() => {
    setUndoStackLive([]);
    setRedoStackLive([]);
  }, [setRedoStackLive, setUndoStackLive]);

  const replaceXml = useCallback((nextXml: string, meta?: { label?: string; commands?: ScoreCommand[]; selectionAnchor?: ScoreDocumentSelectionAnchor | null }) => {
    const current = documentRef.current;
    const sourceMusicXml = current.sourceMusicXml || nextXml;
    if (!current.xml || current.xml === nextXml) {
      setDocumentLive(buildXmlState(nextXml, { sourceMusicXml }));
      return;
    }
    const nextDocument = buildXmlState(nextXml, { sourceMusicXml });
    const doctorReport = publishDocumentDoctorIfEnabled({
      trigger: 'replace',
      hasDocument: Boolean(nextXml.trim()),
      coreDocument: nextDocument.coreDocument,
      diagnostics: nextDocument.diagnostics,
      previousDiagnostics: current.diagnostics,
      commands: meta?.commands,
      previousRevision: current.revision,
      revision: nextDocument.revision,
    });
    if (doctorReport && doctorReportBlocksTransaction(doctorReport)) return;
    const transaction = createTransaction({
      label: meta?.label,
      source: 'replace',
      mode: 'snapshot',
      commandCount: meta?.commands?.length ?? 0,
      rollbackMode: 'snapshot',
      reversible: true,
      inverseCommands: [],
      inverseCommandCount: 0,
      inverseDerivationIssues: [],
      beforeRevision: current.revision,
      afterRevision: nextDocument.revision,
      selectionAnchor: meta?.selectionAnchor ?? null,
    });
    const nextUndo = pushUndo({
      document: nextDocument,
      commands: meta?.commands,
      rollbackDocument: cloneDocument(current),
      transaction,
      mode: 'snapshot',
    });
    setRedoStackLive([]);
    setLastCommands(meta?.commands ?? []);
    setHistoryMeta((prev) => ({
      ...prev,
      depth: nextUndo.length,
      lastAction: 'replace',
      lastLabel: meta?.label,
      lastTransaction: transaction,
      currentSelectionAnchor: transaction.selectionAnchor ?? null,
    }));
    updateSession({ selectionAnchor: transaction.selectionAnchor ?? null });
    setDocumentLive(nextDocument);
  }, [buildXmlState, cloneDocument, pushUndo, setDocumentLive, setRedoStackLive, updateSession]);

  const loadXml = useCallback((nextXml: string, options?: LoadXmlOptions) => {
    const loaded = options?.deferCoreHydration ? buildRawXmlState(nextXml) : buildXmlState(nextXml);
    setBaseDocumentLive(loaded);
    setDocumentLive(loaded);
    clearHistoryStacks();
    setLastCommands([]);
    setHistoryMeta({
      depth: 0,
      lastAction: 'load',
      lastTransaction: createTransaction({
        source: 'load',
        mode: 'system',
        commandCount: 0,
        rollbackMode: 'none',
        reversible: false,
        inverseCommands: [],
        inverseCommandCount: 0,
        inverseDerivationIssues: [],
        afterRevision: loaded.revision,
        selectionAnchor: null,
      }),
      currentSelectionAnchor: null,
    });
    updateSession({ selectionAnchor: null });
    if (!options?.deferCoreHydration) {
      publishDocumentDoctorIfEnabled({
        trigger: 'load',
        hasDocument: Boolean(nextXml.trim()),
        coreDocument: loaded.coreDocument,
        diagnostics: loaded.diagnostics,
        previousDiagnostics: [],
        commands: [],
        previousRevision: null,
        revision: loaded.revision,
      });
    }
  }, [buildXmlState, clearHistoryStacks, setBaseDocumentLive, setDocumentLive, updateSession]);

  const hydrateCurrentXml = useCallback((expectedXml?: string) => {
    const current = documentRef.current;
    if (!current.xml) return false;
    if (expectedXml != null && current.xml !== expectedXml) return false;
    if (current.coreDocument) return true;

    const loaded = buildXmlState(current.xml, { sourceMusicXml: current.sourceMusicXml || current.xml });
    setBaseDocumentLive(loaded);
    setDocumentLive(loaded);
    setHistoryMeta((prev) => ({
      ...prev,
      lastAction: 'load',
      lastTransaction: createTransaction({
        source: 'load',
        mode: 'system',
        commandCount: 0,
        rollbackMode: 'none',
        reversible: false,
        inverseCommands: [],
        inverseCommandCount: 0,
        inverseDerivationIssues: [],
        afterRevision: loaded.revision,
        selectionAnchor: null,
      }),
      currentSelectionAnchor: null,
    }));
    publishDocumentDoctorIfEnabled({
      trigger: 'load',
      hasDocument: Boolean(loaded.xml.trim() || loaded.coreDocument),
      coreDocument: loaded.coreDocument,
      diagnostics: loaded.diagnostics,
      previousDiagnostics: current.diagnostics,
      commands: [],
      previousRevision: current.revision,
      revision: loaded.revision,
    });
    return true;
  }, [buildXmlState, setBaseDocumentLive, setDocumentLive]);

  const loadFromNxn = useCallback((nxnData: NxnFileV1) => {
    const loaded = buildCoreState(nxnData.document, { sourceMusicXml: nxnData.sourceMusicXml });
    const nextSession = structuredClone(nxnData.session);
    setBaseDocumentLive(loaded);
    setDocumentLive(loaded);
    clearHistoryStacks();
    setLastCommands([]);
    replaceSession(nextSession);
    setHistoryMeta({
      depth: 0,
      lastAction: 'load',
      lastTransaction: createTransaction({
        source: 'load',
        mode: 'system',
        commandCount: 0,
        rollbackMode: 'none',
        reversible: false,
        inverseCommands: [],
        inverseCommandCount: 0,
        inverseDerivationIssues: [],
        afterRevision: loaded.revision,
        selectionAnchor: nextSession.selectionAnchor,
      }),
      currentSelectionAnchor: nextSession.selectionAnchor,
    });
    publishDocumentDoctorIfEnabled({
      trigger: 'load',
      hasDocument: Boolean(nxnData.document || nxnData.sourceMusicXml.trim()),
      coreDocument: loaded.coreDocument,
      diagnostics: loaded.diagnostics,
      previousDiagnostics: [],
      commands: [],
      previousRevision: null,
      revision: loaded.revision,
    });
  }, [buildCoreState, clearHistoryStacks, replaceSession, setBaseDocumentLive, setDocumentLive]);

  const applyCommands = useCallback((commands: ScoreCommand[], meta?: { label?: string; selectionAnchor?: ScoreDocumentSelectionAnchor | null }) => {
    if (!commands.length) return { applied: false, reason: 'empty-command-batch' as const, commandCount: 0, commandTypes: [] as string[] };
    const current = documentRef.current;
    const next = applyDocumentCommands(current, commands);
    if (
      next.xml === current.xml
      && !coreDocumentsDifferIgnoringRevision(current.coreDocument, next.coreDocument)
    ) {
      return {
        applied: false,
        reason: 'no-xml-change' as const,
        commandCount: commands.length,
        appliedCommandCount: next.appliedCommands.length,
        commandTypes: commands.map((command) => command.type),
      };
    }
    const nextDocumentState: DocumentState = {
      xml: next.xml,
      sourceMusicXml: next.sourceMusicXml,
      coreDocument: next.coreDocument,
      diagnostics: next.diagnostics,
      revision: next.revision,
    };
    const doctorReport = publishDocumentDoctorIfEnabled({
      trigger: 'apply',
      hasDocument: Boolean(nextDocumentState.xml.trim() || nextDocumentState.coreDocument),
      coreDocument: nextDocumentState.coreDocument,
      diagnostics: nextDocumentState.diagnostics,
      previousDiagnostics: current.diagnostics,
      commands: next.appliedCommands,
      previousRevision: current.revision,
      revision: nextDocumentState.revision,
    });
    if (doctorReport && doctorReportBlocksTransaction(doctorReport)) {
      return {
        applied: false,
        reason: 'doctor-blocked' as const,
        commandCount: commands.length,
        appliedCommandCount: next.appliedCommands.length,
        commandTypes: commands.map((command) => command.type),
        diagnosticCount: doctorReport.diagnostics.length,
      };
    }
    const inverseDerivation = deriveInverseCommands(current.coreDocument, next.appliedCommands);
    const canUseInverse = inverseDerivation.unsupported.length === 0 && inverseDerivation.inverseCommands.length === next.appliedCommands.length;
    const currentHistoryLength = undoStackRef.current.length;
    const forceSnapshot = shouldForceSnapshot(next.appliedCommands, currentHistoryLength);
    const transaction = createTransaction({
      label: meta?.label,
      source: 'apply',
      mode: 'commands',
      commandCount: next.appliedCommands.length,
      rollbackMode: forceSnapshot ? 'snapshot' : (canUseInverse ? 'inverse' : 'snapshot'),
      reversible: true,
      inverseCommands: inverseDerivation.inverseCommands,
      inverseCommandCount: inverseDerivation.inverseCommands.length,
      inverseDerivationIssues: inverseDerivation.unsupported,
      beforeRevision: current.revision,
      afterRevision: next.revision,
      selectionAnchor: meta?.selectionAnchor ?? null,
    });
    const nextUndo = pushUndo({
      commands: next.appliedCommands,
      rollbackDocument: forceSnapshot
        ? cloneDocument(nextDocumentState)
        : (canUseInverse ? undefined : cloneDocument(current)),
      transaction,
      mode: 'commands',
    });
    setRedoStackLive([]);
    setLastCommands(next.appliedCommands);
    setHistoryMeta((prev) => ({
      ...prev,
      depth: nextUndo.length,
      lastAction: 'apply',
      lastLabel: meta?.label,
      lastTransaction: transaction,
      currentSelectionAnchor: transaction.selectionAnchor ?? null,
    }));
    updateSession({ selectionAnchor: transaction.selectionAnchor ?? null });
    setDocumentLive(nextDocumentState);
    return {
      applied: true,
      reason: 'applied' as const,
      commandCount: commands.length,
      appliedCommandCount: next.appliedCommands.length,
      commandTypes: next.appliedCommands.map((command) => command.type),
      beforeRevision: current.revision,
      afterRevision: next.revision,
    };
  }, [cloneDocument, pushUndo, setDocumentLive, setRedoStackLive, updateSession]);

  const undo = useCallback(() => {
    const current = undoStackRef.current;
    const removed = current[current.length - 1];
    if (!removed) return;
    const remaining = current.slice(0, -1);
    setUndoStackLive(remaining);
    setRedoStackLive([...redoStackRef.current, removed].slice(-MAX_HISTORY));
    const replayed = replayHistory(baseDocumentRef.current, remaining);
    setDocumentLive(replayed);
    setLastCommands(remaining[remaining.length - 1]?.commands ?? []);
    const restoredSelectionAnchor = removed.transaction.selectionAnchor ?? null;
    setHistoryMeta({
      depth: remaining.length,
      lastAction: 'undo',
      lastLabel: removed.transaction.label,
      lastTransaction: createTransaction({
        label: removed.transaction.label,
        source: 'undo',
        mode: removed.transaction.mode,
        commandCount: removed.transaction.commandCount,
        rollbackMode: removed.transaction.rollbackMode,
        reversible: removed.transaction.reversible,
        inverseCommands: removed.transaction.inverseCommands,
        inverseCommandCount: removed.transaction.inverseCommandCount,
        inverseDerivationIssues: removed.transaction.inverseDerivationIssues,
        beforeRevision: removed.transaction.afterRevision,
        afterRevision: replayed.revision,
        selectionAnchor: restoredSelectionAnchor,
      }),
      currentSelectionAnchor: restoredSelectionAnchor,
    });
    updateSession({ selectionAnchor: restoredSelectionAnchor });
    publishDocumentDoctorIfEnabled({
      trigger: 'undo',
      hasDocument: Boolean(replayed.xml.trim() || replayed.coreDocument),
      coreDocument: replayed.coreDocument,
      diagnostics: replayed.diagnostics,
      previousDiagnostics: removed.rollbackDocument?.diagnostics,
      commands: removed.commands,
      previousRevision: removed.transaction.afterRevision ?? null,
      revision: replayed.revision,
    });
  }, [replayHistory, setDocumentLive, setRedoStackLive, setUndoStackLive, updateSession]);

  const redo = useCallback(() => {
    const current = redoStackRef.current;
    const next = current[current.length - 1];
    if (!next) return;
    const remainingRedo = current.slice(0, -1);
    const nextUndo = [...undoStackRef.current, next].slice(-MAX_HISTORY);
    const previousDocument = documentRef.current;
    const replayed = replayHistory(baseDocumentRef.current, nextUndo);
    setRedoStackLive(remainingRedo);
    setUndoStackLive(nextUndo);
    setDocumentLive(replayed);
    setLastCommands(next.commands ?? []);
    const restoredSelectionAnchor = next.transaction.selectionAnchor ?? null;
    setHistoryMeta((prev) => ({
      ...prev,
      depth: nextUndo.length,
      lastAction: 'redo',
      lastLabel: next.transaction.label,
      lastTransaction: createTransaction({
        label: next.transaction.label,
        source: 'redo',
        mode: next.transaction.mode,
        commandCount: next.transaction.commandCount,
        rollbackMode: next.transaction.rollbackMode,
        reversible: next.transaction.reversible,
        inverseCommands: next.transaction.inverseCommands,
        inverseCommandCount: next.transaction.inverseCommandCount,
        inverseDerivationIssues: next.transaction.inverseDerivationIssues,
        beforeRevision: prev.lastTransaction?.afterRevision,
        afterRevision: replayed.revision,
        selectionAnchor: restoredSelectionAnchor,
      }),
      currentSelectionAnchor: restoredSelectionAnchor,
    }));
    updateSession({ selectionAnchor: restoredSelectionAnchor });
    publishDocumentDoctorIfEnabled({
      trigger: 'redo',
      hasDocument: Boolean(replayed.xml.trim() || replayed.coreDocument),
      coreDocument: replayed.coreDocument,
      diagnostics: replayed.diagnostics,
      previousDiagnostics: previousDocument.diagnostics,
      commands: next.commands,
      previousRevision: previousDocument.revision,
      revision: replayed.revision,
    });
  }, [replayHistory, setDocumentLive, setRedoStackLive, setUndoStackLive, updateSession]);

  const reset = useCallback(() => {
    const empty = buildXmlState('');
    setBaseDocumentLive(empty);
    setDocumentLive(empty);
    clearHistoryStacks();
    setLastCommands([]);
    setHistoryMeta({
      depth: 0,
      lastAction: 'reset',
      lastTransaction: createTransaction({
        source: 'reset',
        mode: 'system',
        commandCount: 0,
        rollbackMode: 'none',
        reversible: false,
        inverseCommands: [],
        inverseCommandCount: 0,
        inverseDerivationIssues: [],
        afterRevision: empty.revision,
        selectionAnchor: null,
      }),
      currentSelectionAnchor: null,
    });
    updateSession({ selectionAnchor: null });
  }, [buildXmlState, clearHistoryStacks, setBaseDocumentLive, setDocumentLive, updateSession]);

  return {
    xml: document.xml,
    sourceMusicXml: document.sourceMusicXml,
    coreDocument: document.coreDocument as ScoreDocumentModel | null,
    diagnostics: document.diagnostics,
    session,
    updateSession,
    loadXml,
    hydrateCurrentXml,
    loadFromNxn,
    replaceXml,
    applyCommands,
    undo,
    redo,
    reset,
    canUndo: undoStack.length > 0,
    canRedo: redoStack.length > 0,
    lastCommands,
    historyDepth: historyMeta.depth,
    historyMeta,
    lastHistoryEntry: undoStack[undoStack.length - 1] ?? null,
  };
}
