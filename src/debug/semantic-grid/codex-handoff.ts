function safeJson(value: unknown) {
  return JSON.stringify(value, null, 2);
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' ? value as Record<string, unknown> : {};
}

function firstItems(value: unknown, count: number) {
  return Array.isArray(value) ? value.slice(0, count) : [];
}

function compactValue(value: unknown, depth = 0): unknown {
  if (typeof value === 'string') {
    return value.length > 320 ? `${value.slice(0, 317)}...` : value;
  }
  if (typeof value === 'number' || typeof value === 'boolean' || value == null) return value;
  if (depth >= 4) return '[truncated]';
  if (Array.isArray(value)) {
    return value.slice(0, 20).map((entry) => compactValue(entry, depth + 1));
  }
  if (typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>)
        .slice(0, 40)
        .map(([key, entry]) => [key, compactValue(entry, depth + 1)]),
    );
  }
  return String(value);
}

function compactItems(value: unknown, count: number) {
  return firstItems(value, count).map((entry) => compactValue(entry));
}

function pickRecord(value: unknown, keys: string[]) {
  const record = asRecord(value);
  return Object.fromEntries(keys.map((key) => [key, compactValue(record[key])]));
}

export function buildSemanticGridCodexReport(summary: unknown) {
  const record = asRecord(summary);
  const debugLayer = asRecord(record.debugLayer);
  const layout = asRecord(record.layout);
  const activeAnchor = asRecord(record.activeAnchor);
  const activeGhostSnapTrace = asRecord(record.activeGhostSnapTrace);

  return {
    generatedAt: record.generatedAt,
    coordinateSpace: record.coordinateSpace,
    issueCount: record.issueCount,
    debugLayer: compactValue(debugLayer),
    invariantChecks: compactValue(record.invariantChecks),
    layout: {
      ...pickRecord(layout, [
        'issueCount',
        'overdrawCount',
        'protectedNotationOverlapCount',
        'affectedMeasures',
        'affectedStaves',
      ]),
      overdraw: compactItems(layout.overdraw, 10),
    },
    activeAnchor: {
      ...pickRecord(activeAnchor, [
        'issueCount',
        'strictMatchCount',
        'looseMatchCount',
        'target',
        'issues',
      ]),
    },
    activeGhostSnapTrace: {
      ...pickRecord(activeGhostSnapTrace, [
        'resolver',
        'measureNumber',
        'staffIndex',
        'voiceId',
        'timestamp',
        'rawPointerX',
        'safePointerX',
        'effectiveSnap',
        'resolvedTarget',
        'deltas',
      ]),
    },
    issues: compactItems(record.issues, 18),
    scoreDiagnostics: compactItems(record.scoreDiagnostics, 12),
    affectedMeasures: compactItems(record.affectedMeasures, 8),
    layoutErrors: compactItems(record.layoutErrors, 10),
    overlaps: compactItems(record.overlaps, 10),
    protectedRegions: compactItems(record.protectedRegions, 8),
    ghostSnapTraceHistory: compactItems(record.ghostSnapTraceHistory, 4),
  };
}

export function semanticGridCodexPromptSignature(summary: unknown) {
  const record = asRecord(buildSemanticGridCodexReport(summary));
  const debugLayer = asRecord(record.debugLayer);
  const layout = asRecord(record.layout);
  const activeAnchor = asRecord(record.activeAnchor);

  return JSON.stringify({
    generatedAt: record.generatedAt,
    issueCount: record.issueCount,
    coordinateSpace: record.coordinateSpace,
    debugLayer: {
      semanticGridIssueCount: debugLayer.semanticGridIssueCount,
      snapIssueCount: debugLayer.snapIssueCount,
      scoreDiagnosticCount: debugLayer.scoreDiagnosticCount,
      dashedLayoutErrorCount: debugLayer.dashedLayoutErrorCount,
    },
    layout: {
      issueCount: layout.issueCount,
      affectedMeasures: layout.affectedMeasures,
      affectedStaves: layout.affectedStaves,
    },
    activeAnchor: {
      issueCount: activeAnchor.issueCount,
      target: activeAnchor.target,
    },
    issues: firstItems(record.issues, 30),
    scoreDiagnostics: firstItems(record.scoreDiagnostics, 30),
  });
}

export function buildSemanticGridCodexPrompt(input: {
  summary: unknown;
  history?: unknown[];
  context?: unknown;
  recentEvents?: unknown[];
}) {
  const compactSummary = buildSemanticGridCodexReport(input.summary);
  const summary = asRecord(compactSummary);
  const history = (input.history ?? []).slice(-2).map(buildSemanticGridCodexReport);
  const recentEvents = (input.recentEvents ?? []).slice(-25);

  return [
    'Du bist Codex im nex-note Repository.',
    '',
    'Aufgabe: Debugge das folgende Semantic-Grid-/Snap-/Layout-Issue deterministisch und repariere die Ursache im Code.',
    '',
    'Arbeitsregeln:',
    '- Reproduziere oder isoliere den Fehler zuerst mit einem kleinen Test oder einer gezielten Inspektion.',
    '- Pruefe Semantic Anchor Grid, Ghost Snap Grid, Layout-Projection und Core-State getrennt.',
    '- Keine XML-Bypasses einfuehren; Aenderungen muessen durch die ScoreCommand/Core-Pipeline passen.',
    '- Unverwandte lokale Aenderungen nicht zuruecksetzen oder mitstagen.',
    '- Fuege einen fokussierten Regressionstest hinzu, wenn der Fehler im Code behoben wird.',
    '- Wenn du den Fehler verbessert und verifiziert hast, stage nur deine eigenen zusammengehoerigen Aenderungen, erstelle einen praezisen Commit und pushe den aktuellen Branch.',
    '- Wenn keine belastbare Verbesserung moeglich ist oder Tests/Checks scheitern, nicht committen und nicht pushen; erklaere stattdessen den Blocker.',
    '',
    'Kurzsummary:',
    `- Issues: ${String(summary.issueCount ?? 'unknown')}`,
    `- Generated at: ${String(summary.generatedAt ?? 'unknown')}`,
    `- Coordinate space: ${String(summary.coordinateSpace ?? 'unknown')}`,
    '',
    'Priorisierte Issues:',
    '```json',
    safeJson(firstItems(summary.issues, 40)),
    '```',
    '',
    'Aktuelle Semantic-Grid-Zusammenfassung:',
    '```json',
    safeJson(compactSummary),
    '```',
    history.length > 0 ? [
      '',
      'Semantic-Grid-Fehlerhistorie:',
      '```json',
      safeJson(history),
      '```',
    ].join('\n') : '',
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
