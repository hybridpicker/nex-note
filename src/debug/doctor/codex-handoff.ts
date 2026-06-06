import type { BugReportContextSnapshot, BugReportEvent } from '@/lib/bug-report-recorder';
import type { DoctorReport } from '@/src/debug/doctor/types';

export type DoctorCodexHandoffMode = 'off' | 'prompt' | 'copy';

function normalizeDoctorCodexHandoffMode(value: string | null | undefined): DoctorCodexHandoffMode | null {
  if (!value) return null;
  const normalized = value.trim().toLowerCase();
  if (normalized === '0' || normalized === 'false' || normalized === 'no' || normalized === 'off') return 'off';
  if (normalized === 'copy' || normalized === 'clipboard' || normalized === 'auto') return 'copy';
  if (normalized === '1' || normalized === 'true' || normalized === 'yes' || normalized === 'on' || normalized === 'prompt') return 'prompt';
  return null;
}

function isTruthyDebugValue(value: string | null | undefined) {
  return value === '1' || value === 'true' || value === 'yes' || value === 'on' || value === 'live' || value === 'strict';
}

export function readDoctorCodexHandoffMode(): DoctorCodexHandoffMode {
  if (typeof window !== 'undefined') {
    try {
      const params = new URLSearchParams(window.location.search);
      const urlMode = normalizeDoctorCodexHandoffMode(
        params.get('doctor-codex')
        ?? params.get('doctorCodex')
        ?? params.get('codex-debug'),
      );
      if (urlMode) return urlMode;
      if (isTruthyDebugValue(params.get('debug'))) return 'prompt';
    } catch {
      // Keep falling through to localStorage/env defaults.
    }

    try {
      const storedMode = normalizeDoctorCodexHandoffMode(localStorage.getItem('nex-note:doctor-codex'));
      if (storedMode) return storedMode;
    } catch {
      // Keep falling through to env/default.
    }
  }

  return normalizeDoctorCodexHandoffMode(process.env.NEXT_PUBLIC_DOCTOR_CODEX) ?? 'off';
}

export function doctorCodexPromptSignature(report: DoctorReport) {
  return JSON.stringify({
    revision: report.revision,
    previousRevision: report.previousRevision,
    trigger: report.trigger,
    commandTypes: report.commandTypes,
    errorCount: report.errorCount,
    warningCount: report.warningCount,
    issues: report.issues.slice(0, 30).map((issue) => ({
      id: issue.id,
      ruleId: issue.ruleId,
      severity: issue.severity,
      measureNumber: issue.measureNumber,
      staffIndex: issue.staffIndex,
      voiceId: issue.voiceId,
    })),
  });
}

function safeJson(value: unknown) {
  return JSON.stringify(value, null, 2);
}

function compactValue(value: unknown, depth = 0): unknown {
  if (typeof value === 'string') {
    return value.length > 320 ? `${value.slice(0, 317)}...` : value;
  }
  if (typeof value === 'number' || typeof value === 'boolean' || value == null) return value;
  if (depth >= 4) return '[truncated]';
  if (Array.isArray(value)) {
    return value.slice(0, 24).map((entry) => compactValue(entry, depth + 1));
  }
  if (typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>)
        .slice(0, 48)
        .map(([key, entry]) => [key, compactValue(entry, depth + 1)]),
    );
  }
  return String(value);
}

function compactItems(value: unknown, count: number) {
  return Array.isArray(value) ? value.slice(0, count).map((entry) => compactValue(entry)) : [];
}

export function buildDoctorCodexReport(report: DoctorReport) {
  return {
    schemaVersion: report.schemaVersion,
    kind: report.kind,
    generatedAt: report.generatedAt,
    mode: report.mode,
    trigger: report.trigger,
    enabledDomains: report.enabledDomains,
    revision: report.revision,
    previousRevision: report.previousRevision,
    commandCount: report.commandCount,
    commandTypes: report.commandTypes,
    issueCount: report.issueCount,
    warningCount: report.warningCount,
    errorCount: report.errorCount,
    summary: compactValue(report.summary),
    rules: compactValue(report.rules),
    issues: compactItems(report.issues, 30),
    diagnostics: compactItems(report.diagnostics, 20),
  };
}

export function buildDoctorCodexPrompt(input: {
  report: DoctorReport;
  context?: BugReportContextSnapshot | null;
  recentEvents?: BugReportEvent[];
}) {
  const compactReport = buildDoctorCodexReport(input.report);
  const relevantIssues = input.report.issues.filter((issue) => (
    issue.severity === 'error'
    || issue.severity === 'fatal'
    || issue.newSincePrevious
  ));
  const issues = relevantIssues.length > 0 ? relevantIssues : input.report.issues;
  const recentEvents = (input.recentEvents ?? []).slice(-25);

  return [
    'Du bist Codex im nex-note Repository.',
    '',
    'Aufgabe: Debugge das folgende Notation-Doctor-Issue deterministisch und repariere die Ursache im Code.',
    '',
    'Arbeitsregeln:',
    '- Reproduziere oder isoliere den Fehler zuerst mit einem kleinen Test oder einer gezielten Inspektion.',
    '- Prüfe Core-State, Rhythm-Spelling-Projection und Export/Layout getrennt.',
    '- Keine XML-Bypasses einführen; Änderungen müssen durch die ScoreCommand/Core-Pipeline passen.',
    '- Unverwandte lokale Änderungen nicht zurücksetzen oder mitstagen.',
    '- Füge einen fokussierten Regressionstest hinzu, wenn der Fehler im Code behoben wird.',
    '- Wenn du den Fehler verbessert und verifiziert hast, stage nur deine eigenen zusammengehörigen Änderungen, erstelle einen präzisen Commit und pushe den aktuellen Branch.',
    '- Wenn keine belastbare Verbesserung möglich ist oder Tests/Checks scheitern, nicht committen und nicht pushen; erkläre stattdessen den Blocker.',
    '',
    'Kurzsummary:',
    `- Report: ${input.report.errorCount} error(s), ${input.report.warningCount} warning(s), revision ${input.report.revision ?? 'unknown'}`,
    `- Trigger: ${input.report.trigger}`,
    `- Commands: ${input.report.commandTypes.join(', ') || 'none'}`,
    `- Affected measures: ${input.report.summary.affectedMeasures.join(', ') || 'none'}`,
    `- Affected staves: ${input.report.summary.affectedStaves.join(', ') || 'none'}`,
    `- Affected voices: ${input.report.summary.affectedVoices.join(', ') || 'none'}`,
    '',
    'Priorisierte Issues:',
    '```json',
    safeJson(compactItems(issues, 20)),
    '```',
    '',
    'Kompakter Doctor Report:',
    '```json',
    safeJson(compactReport),
    '```',
    input.context ? [
      '',
      'App-Kontext zum Zeitpunkt des Reports:',
      '```json',
      safeJson(input.context),
      '```',
    ].join('\n') : '',
    recentEvents.length > 0 ? [
      '',
      'Letzte Debug-/Bug-Recorder-Events:',
      '```json',
      safeJson(recentEvents),
      '```',
    ].join('\n') : '',
  ].filter(Boolean).join('\n');
}
