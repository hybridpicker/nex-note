import type { ProviderName } from '@/lib/ai-provider-config';
import { askProvider, type AIResponse } from '@/lib/ai-providers';
import type { AiProviderRequestSettings } from '@/lib/ai-model-settings';
import { buildIntentPrompt, buildValidatorRepairPrompt, type AiSessionContext } from '@/lib/prompts';
import { applyDocumentCommands, buildDocumentState, type DocumentDiagnostic } from '@/src/score-core/commands/apply-document-commands';
import {
  buildMusicianChatResponse,
  buildSimpleMelodyDraftResponse,
} from '@/src/nex-note/analysis/build-musician-chat-response';
import { buildAiScoreContext } from '@/src/nex-note/context/build-ai-score-context';
import type { EditorSelection } from '@/hooks/useNoteEditor';
import { parseIntentJSON, type ParsedIntentJson } from '@/src/nex-note/intent/parse-intent-json';
import { assessAiPlan } from '@/src/nex-note/planning/assess-ai-plan';
import { repairCommandBatch } from '@/src/nex-note/repair/repair-command-batch';
import type { ScoreDocumentModel } from '@/src/score-core/model/types';
import type { ScoreCommand } from '@/src/shared/schemas/score-command';
import { normalizeAiPlan, resolveAiWorkflow, type AiWorkflowKind, type ResolvedAiWorkflow } from '@/src/nex-note/workflows/ai-workflows';
import { generateLayoutCleanupIntent } from '@/src/nex-note/layout/generate-layout-cleanup';
import { generateMidiReconstructionIntent } from '@/src/nex-note/midi/generate-midi-reconstruction';
import { planArrangementWithLlm } from '@/src/nex-note/arrangement/planners/plan-arrangement-with-llm';
import { buildDocumentDoctorReport, doctorReportBlocksTransaction } from '@/src/debug/doctor/document-doctor';
import type { DoctorReport, DoctorSettings } from '@/src/debug/doctor/types';

export interface RunAiCommandPipelineParams {
  message: string;
  xml: string;
  provider: ProviderName;
  ollamaModel?: string;
  selection?: EditorSelection;
  sessionContext?: AiSessionContext;
  providerSettings?: AiProviderRequestSettings;
  ask?: (prompt: string, provider: ProviderName, ollamaModel?: string) => Promise<AIResponse>;
}

export interface RunAiCommandPipelineErrorResult {
  error: string;
  status: number;
  rawResponse?: string;
}

export interface RunAiCommandPipelineSuccessResult {
  xml: string;
  coreDocument: ReturnType<typeof buildDocumentState>['coreDocument'];
  diagnostics: ReturnType<typeof buildDocumentState>['diagnostics'];
  explanation: string;
  context: ReturnType<typeof buildAiScoreContext>;
  commands: ReturnType<typeof applyDocumentCommands>['appliedCommands'];
  operations: ReturnType<typeof applyDocumentCommands>['appliedCommands'];
  provider: AIResponse['provider'] | 'local-layout';
  model: AIResponse['model'];
  latencyMs: AIResponse['latencyMs'];
  confidence: 'high' | 'medium' | 'low';
  ambiguities: string[];
  affectedMeasures: number[];
  plan: string[];
  riskReasons: string[];
  validatorFindings: string[];
  requiresConfirmation: boolean;
  rawIntent: ParsedIntentJson;
  workflow: AiWorkflowKind;
  workflowLabel: string;
}

export type RunAiCommandPipelineResult =
  | RunAiCommandPipelineErrorResult
  | RunAiCommandPipelineSuccessResult;

function createRepairDiagnostics(droppedCommands: ReturnType<typeof repairCommandBatch>['droppedCommands']) {
  return droppedCommands.map((entry) => ({
    level: 'warning' as const,
    code: 'ai_command_repaired',
    message: `Dropped AI command at index ${entry.index}: ${entry.reason}`,
  }));
}

function createValidatorRepairDiagnostic(message: string, level: DocumentDiagnostic['level'] = 'info'): DocumentDiagnostic {
  return {
    level,
    code: 'ai_validator_repair',
    message,
  };
}

function createNonJsonResponseDiagnostic(message: string, level: DocumentDiagnostic['level'] = 'warning'): DocumentDiagnostic {
  return {
    level,
    code: 'ai_non_json_response',
    message,
  };
}

function createDoctorGateDiagnostic(message: string, level: DocumentDiagnostic['level'] = 'warning'): DocumentDiagnostic {
  return {
    level,
    code: 'ai_doctor_gate',
    message,
  };
}

function isSimpleLocalMelodyDraft(commands: ScoreCommand[], intent: ParsedIntentJson, workflow: AiWorkflowKind) {
  if (workflow !== 'general') return false;
  if (intent.confidence !== 'high') return false;
  if ((intent.ambiguities ?? []).length > 0) return false;
  const insertedNotes = commands.filter((command) => command.type === 'insertNoteAt').length;
  if (insertedNotes < 4) return false;
  if (insertedNotes > 8) return false;
  return commands.every((command) => (
    command.type === 'setKey'
    || command.type === 'setTimeSignature'
    || command.type === 'insertNoteAt'
  ));
}

function isSafeLocalCreativeDraft(commands: ScoreCommand[], assessment: ReturnType<typeof assessAiPlan>, workflow: AiWorkflowKind) {
  if (workflow !== 'general') return false;
  if (!assessment.shouldApply || assessment.confidence !== 'high' || assessment.ambiguities.length > 0) return false;
  const insertedEvents = commands.filter((command) => command.type === 'insertNoteAt' || command.type === 'insertRestAt').length;
  if (insertedEvents < 4) return false;
  return commands.every((command) => (
    command.type === 'setKey'
    || command.type === 'setTimeSignature'
    || command.type === 'setTempo'
    || command.type === 'insertNoteAt'
    || command.type === 'insertRestAt'
    || command.type === 'addExpressionText'
    || command.type === 'addWords'
  ));
}

function selectionToAiContext(selection?: EditorSelection) {
  if (!selection) return undefined;
  const anchor = selection.anchor;
  const measures = [anchor?.measureNumber, selection.anchor?.measureNumber].filter((value): value is number => typeof value === 'number');
  return {
    partId: selection.partId,
    entityIds: selection.entityIds,
    anchorEntityId: selection.anchorEntityId,
    measureNumber: anchor?.measureNumber,
    staffIndex: anchor?.staffIndex,
    voiceId: anchor?.voiceId,
    measureRange: measures.length > 0 ? {
      start: Math.min(...measures),
      end: Math.max(...measures),
    } : undefined,
    selectionCount: selection.entityIds.length || (anchor ? 1 : 0),
  };
}

function collectAffectedMeasures(commands: ReturnType<typeof repairCommandBatch>['validCommands']) {
  const measures = new Set<number>();
  const addMeasure = (value: unknown) => {
    if (typeof value === 'number' && Number.isFinite(value)) measures.add(value);
  };
  const addMeasureSpan = (start: unknown, end: unknown) => {
    if (typeof start !== 'number' || typeof end !== 'number' || !Number.isFinite(start) || !Number.isFinite(end)) return;
    const first = Math.min(start, end);
    const last = Math.max(start, end);
    for (let measureNumber = first; measureNumber <= last; measureNumber += 1) {
      measures.add(measureNumber);
    }
  };
  const addChordMeasures = (chords: string) => {
    chords.split(',').forEach((entry) => {
      const [measureToken] = entry.trim().split(':');
      const measureNumber = Number.parseInt(measureToken, 10);
      if (Number.isFinite(measureNumber)) measures.add(measureNumber);
    });
  };

  commands.forEach((command) => {
    if (command.target.range) {
      measures.add(command.target.range.start.measureNumber);
      measures.add(command.target.range.end.measureNumber);
    }
    addMeasure(command.target.measureNumber);
    addMeasure(command.target.locator?.measureNumber);
    if (command.type === 'addChords') addChordMeasures(command.chords);
    if (command.type === 'addRehearsalMarksEvery') {
      addMeasure(command.startMeasureNumber);
      addMeasure(command.endMeasureNumber);
    }
    if (command.type === 'applyPracticeProfile') {
      addMeasure(command.startMeasureNumber);
      addMeasure(command.endMeasureNumber);
    }
    if (command.type === 'fitRangeOctaves') {
      addMeasure(command.startMeasureNumber);
      addMeasure(command.endMeasureNumber);
    }
    if (command.type === 'addWedge' || command.type === 'addPedalSpan' || command.type === 'addOttava') {
      addMeasure(command.startMeasureNumber);
      addMeasure(command.stopMeasureNumber);
    }
    if (command.type === 'addAnalysisAnnotation') {
      addMeasureSpan(command.startMeasureNumber ?? command.measureNumber, command.endMeasureNumber ?? command.measureNumber);
    }
    if (command.type === 'addTechniqueInstruction' || command.type === 'addOrchestrationNote') {
      addMeasureSpan(command.startMeasureNumber, command.endMeasureNumber);
    }
    if (command.type === 'addSyncPoint') addMeasure(command.measureNumber);
  });
  return [...measures].sort((a, b) => a - b);
}

function isActionableValidatorDiagnostic(diagnostic: DocumentDiagnostic) {
  return diagnostic.level !== 'info' && !['legacy_fallback', 'core_execution', 'ai_command_repaired', 'ai_validator_repair'].includes(diagnostic.code);
}

function collectNewValidatorDiagnostics(baseline: DocumentDiagnostic[], next: DocumentDiagnostic[]) {
  const baselineCounts = new Map<string, number>();
  baseline
    .filter(isActionableValidatorDiagnostic)
    .forEach((diagnostic) => {
      const key = `${diagnostic.level}:${diagnostic.code}:${diagnostic.message}`;
      baselineCounts.set(key, (baselineCounts.get(key) ?? 0) + 1);
    });

  const introduced: DocumentDiagnostic[] = [];
  next
    .filter(isActionableValidatorDiagnostic)
    .forEach((diagnostic) => {
      const key = `${diagnostic.level}:${diagnostic.code}:${diagnostic.message}`;
      const remaining = baselineCounts.get(key) ?? 0;
      if (remaining > 0) {
        baselineCounts.set(key, remaining - 1);
        return;
      }
      introduced.push(diagnostic);
    });

  return introduced;
}

function toFindingMessages(diagnostics: DocumentDiagnostic[]) {
  return diagnostics.map((diagnostic) => `${diagnostic.code}: ${diagnostic.message}`);
}

const AI_DOCTOR_GATE_SETTINGS: DoctorSettings = {
  enabled: true,
  mode: 'strict',
  domains: ['document', 'rhythm'],
  strict: true,
  visual: false,
  source: 'default',
};

function buildAiDoctorGateReport(input: {
  baseline: ReturnType<typeof buildDocumentState>;
  execution: ReturnType<typeof applyDocumentCommands>;
}): DoctorReport {
  return buildDocumentDoctorReport({
    trigger: 'apply',
    settings: AI_DOCTOR_GATE_SETTINGS,
    hasDocument: Boolean(input.execution.xml.trim() || input.execution.coreDocument),
    coreDocument: input.execution.coreDocument,
    diagnostics: input.execution.diagnostics,
    previousDiagnostics: input.baseline.diagnostics,
    commands: input.execution.appliedCommands,
    previousRevision: input.baseline.revision,
    revision: input.execution.revision,
  });
}

function aiDoctorGateFindings(report: DoctorReport, executionDiagnostics: DocumentDiagnostic[]) {
  const findings = report.issues
    .filter((issue) => issue.newSincePrevious && (issue.severity === 'error' || issue.severity === 'fatal'))
    .map((issue) => `${issue.ruleId}: ${issue.message}`);
  const coveredIssueMessages = new Set(report.issues.map((issue) => issue.message));
  const legacyFallbacks = executionDiagnostics
    .filter((diagnostic) => diagnostic.code === 'legacy_fallback')
    .filter((diagnostic) => !coveredIssueMessages.has(diagnostic.message))
    .map((diagnostic) => `pipeline.no-xml-bypass: ${diagnostic.message}`);
  return [...findings, ...legacyFallbacks];
}

function aiDoctorGateRequiresConfirmation(report: DoctorReport, executionDiagnostics: DocumentDiagnostic[]) {
  return doctorReportBlocksTransaction(report)
    || executionDiagnostics.some((diagnostic) => diagnostic.code === 'legacy_fallback');
}

function isTransposeIntent(message: string) {
  return /\btranspon(?:iere|ier|ieren|iert|ieren)?\b/i.test(message);
}

function keyFifthsToPitchClass(fifths: number) {
  const normalized = ((fifths % 12) + 12) % 12;
  return (normalized * 7) % 12;
}

function normalizeSignedSemitoneDistance(fromPitchClass: number, toPitchClass: number) {
  const upward = ((toPitchClass - fromPitchClass) % 12 + 12) % 12;
  return upward > 6 ? upward - 12 : upward;
}

function getDocumentKeyFifths(coreDocument: ScoreDocumentModel | null) {
  if (!coreDocument) return 0;
  for (const part of coreDocument.score.parts) {
    for (const staff of part.staves) {
      const orderedMeasures = [...staff.measures].sort((a, b) => a.measureNumber - b.measureNumber);
      for (const measure of orderedMeasures) {
        const fifths = measure.attributes.find((attribute) => typeof attribute.keyFifths === 'number')?.keyFifths;
        if (typeof fifths === 'number') return fifths;
      }
    }
  }
  return 0;
}

function expandKeyOnlyTransposeIntent(message: string, generatedCommands: unknown[], coreDocument: ScoreDocumentModel | null): unknown[] {
  if (!isTransposeIntent(message)) return generatedCommands;

  const normalizedCommands = generatedCommands.filter((command): command is ScoreCommand => (
    Boolean(command) && typeof command === 'object' && typeof (command as { type?: unknown }).type === 'string'
  ));

  const hasExplicitTranspose = normalizedCommands.some((command) => (
    command.type === 'transposeDocumentChromatic'
    || command.type === 'transposeChromatic'
    || command.type === 'transposeRangeChromatic'
  ));
  if (hasExplicitTranspose) return generatedCommands;

  const keyCommand = normalizedCommands.find((command): command is Extract<ScoreCommand, { type: 'setKey' }> => (
    command.type === 'setKey' && typeof (command as { fifths?: unknown }).fifths === 'number'
  ));
  if (!keyCommand || typeof keyCommand.fifths !== 'number') return generatedCommands;

  const currentKeyFifths = getDocumentKeyFifths(coreDocument);
  const semitones = normalizeSignedSemitoneDistance(
    keyFifthsToPitchClass(currentKeyFifths),
    keyFifthsToPitchClass(keyCommand.fifths),
  );
  if (!coreDocument || semitones === 0) return generatedCommands;

  const transposeCommand: ScoreCommand = {
    type: 'transposeDocumentChromatic',
    semitones,
  };

  return [keyCommand, transposeCommand, ...generatedCommands.filter((command) => command !== keyCommand)];
}

function hydrateSelectionScopedCommands(generatedCommands: unknown[], selection?: EditorSelection) {
  const anchor = selection?.anchor;
  if (!anchor) return generatedCommands;

  return generatedCommands.map((command) => {
    if (!command || typeof command !== 'object' || Array.isArray(command)) return command;
    const record = command as Record<string, unknown>;
    if (typeof record.measureNumber === 'number') return command;
    if (!Array.isArray(record.entityIds) || !record.entityIds.every((value) => typeof value === 'string')) return command;

    return {
      ...record,
      measureNumber: anchor.measureNumber,
      staffIndex: anchor.staffIndex,
      voiceId: anchor.voiceId,
      timestampNum: anchor.timestampNum,
      timestampDen: anchor.timestampDen,
    };
  });
}

function messageRequestsClefRemoval(message: string) {
  return /\b(clef|schluessel|schlüssel|violinschluessel|violinschlüssel|bassschluessel|bassschlüssel|altschluessel|altschlüssel)\b/i.test(message)
    && /\b(remove|delete|erase|drop|clear|without|no|kein|keine|keinen|entferne|entfern|loesche|lösche|weg)\b/i.test(message);
}

function getEffectiveClefAtMeasure(coreDocument: ScoreDocumentModel | null, measureNumber: number, staffIndex: number) {
  if (!coreDocument) return null;
  const matches = coreDocument.score.parts.flatMap((part) => {
    const staff = part.staves.find((entry) => entry.staffIndex === staffIndex);
    if (!staff) return [];
    const measureIndex = staff.measures.findIndex((entry) => entry.measureNumber === measureNumber);
    if (measureIndex < 0) return [];
    for (let index = measureIndex; index >= 0; index -= 1) {
      const clef = staff.measures[index].attributes[0]?.clefs.find((entry) => entry.staffIndex === staffIndex);
      if (clef?.sign && clef.line != null) return [clef];
    }
    return [];
  });

  if (matches.length === 0) return null;
  const first = matches[0];
  return matches.every((entry) => entry.sign === first.sign && entry.line === first.line) ? first : null;
}

function rewriteRedundantClefSettersAsRemoval(
  message: string,
  generatedCommands: unknown[],
  coreDocument: ScoreDocumentModel | null,
) {
  if (!messageRequestsClefRemoval(message)) return generatedCommands;

  return generatedCommands.map((command) => {
    if (!command || typeof command !== 'object' || Array.isArray(command)) return command;
    const record = command as Record<string, unknown>;
    if (record.type !== 'setClef') return command;

    const measureNumber = typeof record.measureNumber === 'number' ? record.measureNumber : 1;
    const staffIndex = typeof record.staffIndex === 'number' ? record.staffIndex : 1;
    const sign = typeof record.sign === 'string' ? record.sign : null;
    const line = typeof record.line === 'number' ? record.line : null;
    const previousClef = getEffectiveClefAtMeasure(coreDocument, Math.max(measureNumber - 1, 1), staffIndex);
    if (!previousClef || !sign || line == null) return command;
    if (measureNumber <= 1) return command;
    if (previousClef.sign !== sign || previousClef.line !== line) return command;

    return {
      type: 'removeClefChange',
      measureNumber,
      staffIndex,
    };
  });
}

function isLikelyGerman(message: string) {
  return /\b(der|die|das|den|dem|ein|eine|takt|schluessel|schlüssel|entferne|lösche|weg)\b/i.test(message);
}

function shouldPreferLocalArrangementPreview(message: string) {
  return /\b(simple support|practical expression|beginner arrangement|easy arrangement)\b/i.test(message);
}

function describeClefSign(sign?: string, line?: number, german = false) {
  if (sign === 'G' && line === 2) return german ? 'Violinschlüssel' : 'treble clef';
  if (sign === 'F' && line === 4) return german ? 'Bassschlüssel' : 'bass clef';
  if (sign === 'C') return german ? 'C-Schlüssel' : 'C clef';
  return german ? 'Schlüssel' : 'clef';
}

function buildClefAwarePresentation(
  message: string,
  commands: ReturnType<typeof repairCommandBatch>['validCommands'],
  coreDocument: ScoreDocumentModel | null,
  explanation: string,
  plan: string[],
) {
  const clefRemoval = commands.find((command) => command.type === 'removeClefChange');
  if (!clefRemoval) return { explanation, plan };

  const german = isLikelyGerman(message);
  const previousClef = getEffectiveClefAtMeasure(coreDocument, Math.max(clefRemoval.measureNumber - 1, 1), clefRemoval.staffIndex ?? 1);
  const clefName = describeClefSign(previousClef?.sign, previousClef?.line, german);
  if (clefRemoval.measureNumber <= 1 || !previousClef) return { explanation, plan };

  const improvedExplanation = german
    ? `Der sichtbare ${clefName} gehört zum Schlüsselwechsel vor Takt ${clefRemoval.measureNumber} und kann am Ende von Takt ${clefRemoval.measureNumber - 1} erscheinen. Ich entferne diesen Wechsel, damit der ${clefName} aus Takt ${clefRemoval.measureNumber - 1} weiter gilt.`
    : `The visible ${clefName} belongs to the clef change before measure ${clefRemoval.measureNumber} and can render at the end of measure ${clefRemoval.measureNumber - 1}. I am removing that change so the ${clefName} from measure ${clefRemoval.measureNumber - 1} continues to apply.`;
  const improvedPlan = german
    ? [
        `Prüfe den Schlüsselwechsel vor Takt ${clefRemoval.measureNumber}`,
        `Entferne den expliziten Schlüsselwechsel in Takt ${clefRemoval.measureNumber}`,
      ]
    : [
        `Inspect the clef change before measure ${clefRemoval.measureNumber}`,
        `Remove the explicit clef change in measure ${clefRemoval.measureNumber}`,
      ];

  return {
    explanation: improvedExplanation,
    plan: improvedPlan,
  };
}

function buildNonJsonFallbackResult(params: {
  message: string;
  aiText: string;
  aiResponse: AIResponse;
  sourceXml: string;
  documentState: ReturnType<typeof buildDocumentState>;
  context: ReturnType<typeof buildAiScoreContext>;
  workflow: ResolvedAiWorkflow;
}): RunAiCommandPipelineSuccessResult {
  const { message, aiText, aiResponse, sourceXml, documentState, context, workflow } = params;
  const german = isLikelyGerman(message);
  const explanation = aiText.trim();
  const rawIntent: ParsedIntentJson = {
    commands: [],
    explanation,
    confidence: 'low',
    ambiguities: [],
    plan: normalizeAiPlan(undefined, workflow),
  };

  return {
    xml: sourceXml,
    coreDocument: documentState.coreDocument,
    diagnostics: [
      ...documentState.diagnostics,
      createNonJsonResponseDiagnostic(
        german
          ? 'Die KI hat Freitext statt eines strukturierten JSON-Befehls zurückgegeben. Es wurden keine Notationsänderungen angewendet.'
          : 'The AI returned free-form text instead of structured JSON commands. No notation changes were applied.',
      ),
    ],
    explanation,
    context,
    commands: [],
    operations: [],
    provider: aiResponse.provider,
    model: aiResponse.model,
    latencyMs: aiResponse.latencyMs,
    confidence: 'low',
    ambiguities: [],
    affectedMeasures: [],
    plan: rawIntent.plan ?? [],
    riskReasons: [],
    validatorFindings: [],
    requiresConfirmation: false,
    rawIntent,
    workflow: workflow.kind,
    workflowLabel: workflow.label,
  };
}

export async function runAiCommandPipeline(params: RunAiCommandPipelineParams): Promise<RunAiCommandPipelineResult> {
  const { message, xml, provider, ollamaModel, selection, sessionContext, providerSettings } = params;
  const ask = params.ask ?? ((prompt, selectedProvider, selectedOllamaModel) => askProvider(
    prompt,
    selectedProvider,
    selectedOllamaModel,
    providerSettings,
  ));
  const documentState = buildDocumentState(xml);
  const context = buildAiScoreContext(documentState, selectionToAiContext(selection));
  const workflow = resolveAiWorkflow(message);
  const respondWithLocalMusicianIntent = (localIntent: ParsedIntentJson): RunAiCommandPipelineSuccessResult => {
    const repaired = repairCommandBatch(localIntent.commands ?? []);
    const affectedMeasures = collectAffectedMeasures(repaired.validCommands);
    const assessment = assessAiPlan(localIntent, {
      commands: repaired.validCommands,
      affectedMeasures,
      workflow: workflow.kind,
    });
    const normalizedPlan = normalizeAiPlan(assessment.plan, workflow);
    const localModel = workflow.kind === 'arrangement-assist'
      ? 'musician-arrangement-engine'
      : 'musician-analysis-engine';
    if (
      isSimpleLocalMelodyDraft(repaired.validCommands, localIntent, workflow.kind)
      || isSafeLocalCreativeDraft(repaired.validCommands, assessment, workflow.kind)
    ) {
      const execution = applyDocumentCommands(documentState, repaired.validCommands);
      return {
        xml: execution.xml,
        coreDocument: execution.coreDocument,
        diagnostics: [
          ...execution.diagnostics,
          ...createRepairDiagnostics(repaired.droppedCommands),
        ],
        explanation: localIntent.explanation,
        context,
        commands: execution.appliedCommands,
        operations: execution.appliedCommands,
        provider: 'local-layout',
        model: localModel,
        latencyMs: 0,
        confidence: assessment.confidence,
        ambiguities: assessment.ambiguities,
        affectedMeasures: collectAffectedMeasures(execution.appliedCommands),
        plan: normalizedPlan,
        riskReasons: [],
        validatorFindings: [],
        requiresConfirmation: false,
        rawIntent: localIntent,
        workflow: workflow.kind,
        workflowLabel: workflow.label,
      };
    }
    return {
      xml,
      coreDocument: documentState.coreDocument,
      diagnostics: [
        ...documentState.diagnostics,
        ...createRepairDiagnostics(repaired.droppedCommands),
      ],
      explanation: localIntent.explanation,
      context,
      commands: repaired.validCommands,
      operations: repaired.validCommands,
      provider: 'local-layout',
      model: localModel,
      latencyMs: 0,
      confidence: assessment.confidence,
      ambiguities: assessment.ambiguities,
      affectedMeasures,
      plan: normalizedPlan,
      riskReasons: assessment.riskReasons,
      validatorFindings: [],
      requiresConfirmation: repaired.validCommands.length > 0,
      rawIntent: localIntent,
      workflow: workflow.kind,
      workflowLabel: workflow.label,
    };
  };

  const buildLocalArrangementFallback = () => (workflow.kind === 'arrangement-assist'
    ? buildMusicianChatResponse({
      message: workflow.cleanedMessage,
      workflow: workflow.kind,
      documentState,
      selection,
      sessionContext,
    })
    : null);

  if (workflow.kind === 'arrangement-assist') {
    const localPriorityResponse = buildMusicianChatResponse({
      message: workflow.cleanedMessage,
      workflow: workflow.kind,
      documentState,
      selection,
      sessionContext,
      arrangementScope: shouldPreferLocalArrangementPreview(workflow.cleanedMessage) ? 'full' : 'materialized-only',
    });
    if (localPriorityResponse) return respondWithLocalMusicianIntent(localPriorityResponse);

    const plannerResult = await planArrangementWithLlm({
      message: workflow.cleanedMessage,
      provider,
      ollamaModel,
      ask,
      documentState,
      context,
      selection,
      sessionContext,
    });
    if (plannerResult) {
      const repaired = repairCommandBatch(plannerResult.intent.commands ?? []);
      const affectedMeasures = collectAffectedMeasures(repaired.validCommands);
      const assessment = assessAiPlan(plannerResult.intent, {
        commands: repaired.validCommands,
        affectedMeasures,
        workflow: workflow.kind,
      });
      const normalizedPlan = normalizeAiPlan(assessment.plan, workflow);
      const criticWarnings = [
        ...plannerResult.criticIssues.map((issue) => issue.message),
        ...plannerResult.realizerIssues.map((issue) => `${issue.code}: ${issue.message}`),
      ];
      const hasRealizerErrors = plannerResult.realizerIssues.some((issue) => issue.severity === 'error');
      const riskReasons = [
        ...assessment.riskReasons,
        ...(plannerResult.criticIssues.some((issue) => issue.severity === 'error')
          ? ['Arrangement planner kept unresolved critic findings after repair attempts']
          : []),
        ...(hasRealizerErrors
          ? ['Arrangement voicing could not be materialized as notes; falling back to chord symbols']
          : []),
      ];
      return {
        xml,
        coreDocument: documentState.coreDocument,
        diagnostics: [
          ...documentState.diagnostics,
          ...createRepairDiagnostics(repaired.droppedCommands),
        ],
        explanation: plannerResult.intent.explanation,
        context,
        commands: repaired.validCommands,
        operations: repaired.validCommands,
        provider: plannerResult.provider,
        model: plannerResult.model,
        latencyMs: plannerResult.latencyMs,
        confidence: assessment.confidence,
        ambiguities: assessment.ambiguities,
        affectedMeasures,
        plan: normalizedPlan,
        riskReasons,
        validatorFindings: criticWarnings,
        requiresConfirmation: true,
        rawIntent: plannerResult.intent,
        workflow: workflow.kind,
        workflowLabel: workflow.label,
      };
    }

    const arrangementFallback = buildLocalArrangementFallback();
    if (arrangementFallback) return respondWithLocalMusicianIntent(arrangementFallback);
  }

  // For arrangement requests, only the precise materialized local path may
  // pre-empt the model; the generic chord-symbol heuristic stays available as
  // a fallback when the model fails (see buildLocalArrangementFallback).
  const localMusicianResponse = buildMusicianChatResponse({
    message: workflow.cleanedMessage,
    workflow: workflow.kind,
    documentState,
    selection,
    sessionContext,
    arrangementScope: workflow.kind === 'arrangement-assist' ? 'materialized-only' : 'full',
  });
  if (localMusicianResponse) return respondWithLocalMusicianIntent(localMusicianResponse);

  if (workflow.kind === 'layout-cleanup' && documentState.coreDocument) {
    const parsed = generateLayoutCleanupIntent(documentState.coreDocument, workflow.cleanedMessage);
    const repaired = repairCommandBatch(parsed.commands ?? []);
    const affectedMeasures = collectAffectedMeasures(repaired.validCommands);
    const assessment = assessAiPlan(parsed, {
      commands: repaired.validCommands,
      affectedMeasures,
      workflow: workflow.kind,
    });
    const normalizedPlan = normalizeAiPlan(assessment.plan, workflow);

    if (!assessment.shouldApply) {
      return {
        xml,
        coreDocument: documentState.coreDocument,
        diagnostics: [
          ...documentState.diagnostics,
          ...createRepairDiagnostics(repaired.droppedCommands),
        ],
        explanation: parsed.explanation ?? '',
        context,
        commands: repaired.validCommands,
        operations: repaired.validCommands,
        provider: 'local-layout',
        model: 'layout-cleanup-engine',
        latencyMs: 0,
        confidence: assessment.confidence,
        ambiguities: assessment.ambiguities,
        affectedMeasures,
        plan: normalizedPlan,
        riskReasons: assessment.riskReasons,
        validatorFindings: [],
        requiresConfirmation: true,
        rawIntent: parsed,
        workflow: workflow.kind,
        workflowLabel: workflow.label,
      };
    }

    const execution = applyDocumentCommands(documentState, repaired.validCommands);
    const doctorReport = buildAiDoctorGateReport({ baseline: documentState, execution });
    const doctorFindings = aiDoctorGateFindings(doctorReport, execution.diagnostics);
    if (aiDoctorGateRequiresConfirmation(doctorReport, execution.diagnostics)) {
      return {
        xml,
        coreDocument: documentState.coreDocument,
        diagnostics: [
          ...documentState.diagnostics,
          ...createRepairDiagnostics(repaired.droppedCommands),
          createDoctorGateDiagnostic(`Notation Doctor requires confirmation before applying this edit (${doctorFindings.join('; ')}).`),
        ],
        explanation: parsed.explanation ?? '',
        context,
        commands: execution.appliedCommands,
        operations: execution.appliedCommands,
        provider: 'local-layout',
        model: 'layout-cleanup-engine',
        latencyMs: 0,
        confidence: assessment.confidence,
        ambiguities: assessment.ambiguities,
        affectedMeasures: collectAffectedMeasures(execution.appliedCommands),
        plan: normalizedPlan,
        riskReasons: [
          ...assessment.riskReasons,
          'Notation Doctor gate requires review before apply',
        ],
        validatorFindings: doctorFindings,
        requiresConfirmation: true,
        rawIntent: parsed,
        workflow: workflow.kind,
        workflowLabel: workflow.label,
      };
    }
    return {
      xml: execution.xml,
      coreDocument: execution.coreDocument,
      diagnostics: [
        ...execution.diagnostics,
        ...createRepairDiagnostics(repaired.droppedCommands),
      ],
      explanation: parsed.explanation ?? '',
      context,
      commands: execution.appliedCommands,
      operations: execution.appliedCommands,
      provider: 'local-layout',
      model: 'layout-cleanup-engine',
      latencyMs: 0,
      confidence: assessment.confidence,
      ambiguities: assessment.ambiguities,
      affectedMeasures: collectAffectedMeasures(execution.appliedCommands),
      plan: normalizedPlan,
      riskReasons: assessment.riskReasons,
      validatorFindings: [],
      requiresConfirmation: false,
      rawIntent: parsed,
      workflow: workflow.kind,
      workflowLabel: workflow.label,
    };
  }
  if (workflow.kind === 'midi-reconstruct' && documentState.coreDocument) {
    const parsed = generateMidiReconstructionIntent(documentState.coreDocument, {
      analysis: sessionContext?.midiImport ?? null,
      filename: sessionContext?.taskState?.scoreKey ?? null,
      locale: sessionContext?.appLocale ?? null,
    });
    if ((sessionContext?.midiImport?.noteCount ?? 0) > 4000) {
      return {
        xml: documentState.xml,
        coreDocument: documentState.coreDocument,
        diagnostics: documentState.diagnostics,
        explanation: `${parsed.explanation ?? ''} Large MIDI file: fast MusicXML layout hints were applied during conversion; dense Core rewrite is skipped for editor responsiveness.`.trim(),
        context,
        commands: [],
        operations: [],
        provider: 'local-layout',
        model: 'midi-reconstruction-engine',
        latencyMs: 0,
        confidence: parsed.confidence ?? 'medium',
        ambiguities: parsed.ambiguities ?? [],
        affectedMeasures: [],
        plan: [
          'Analyze MIDI tracks and timing',
          'Apply fast MusicXML layout hints during conversion',
          'Skip dense Core rewrite for large-file responsiveness',
        ],
        riskReasons: [],
        validatorFindings: [],
        requiresConfirmation: false,
        rawIntent: { ...parsed, commands: [] },
        workflow: workflow.kind,
        workflowLabel: workflow.label,
      };
    }
    const repaired = repairCommandBatch(parsed.commands ?? []);
    const execution = applyDocumentCommands(documentState, repaired.validCommands);
    const affectedMeasures = collectAffectedMeasures(execution.appliedCommands);
    return {
      xml: execution.xml,
      coreDocument: execution.coreDocument,
      diagnostics: [
        ...execution.diagnostics,
        ...createRepairDiagnostics(repaired.droppedCommands),
      ],
      explanation: parsed.explanation ?? '',
      context,
      commands: execution.appliedCommands,
      operations: execution.appliedCommands,
      provider: 'local-layout',
      model: 'midi-reconstruction-engine',
      latencyMs: 0,
      confidence: parsed.confidence ?? 'high',
      ambiguities: parsed.ambiguities ?? [],
      affectedMeasures,
      plan: normalizeAiPlan(parsed.plan, workflow),
      riskReasons: [],
      validatorFindings: [],
      requiresConfirmation: false,
      rawIntent: parsed,
      workflow: workflow.kind,
      workflowLabel: workflow.label,
    };
  }
  const prompt = buildIntentPrompt(workflow.cleanedMessage, context, workflow, sessionContext);
  const aiResponse = await ask(prompt, provider, ollamaModel);

  if (aiResponse.error) {
    const arrangementFallback = buildLocalArrangementFallback();
    if (arrangementFallback) return respondWithLocalMusicianIntent(arrangementFallback);
    return {
      error: aiResponse.error,
      status: 502,
    };
  }

  let parsed = parseIntentJSON(aiResponse.text);
  if (!parsed) {
    const arrangementFallback = buildLocalArrangementFallback();
    if (arrangementFallback) return respondWithLocalMusicianIntent(arrangementFallback);
    if (aiResponse.text.trim().length > 0) {
      return buildNonJsonFallbackResult({
        message: workflow.cleanedMessage,
        aiText: aiResponse.text,
        aiResponse,
        sourceXml: xml,
        documentState,
        context,
        workflow,
      });
    }

    return {
      error: 'Could not parse AI response as JSON',
      status: 422,
      rawResponse: aiResponse.text.slice(0, 500),
    };
  }

  if (((parsed.commands ?? parsed.operations) ?? []).length === 0) {
    const fallbackMelodyDraft = buildSimpleMelodyDraftResponse(
      [workflow.cleanedMessage, parsed.explanation].filter(Boolean).join(' '),
      documentState,
    );
    if (fallbackMelodyDraft) parsed = fallbackMelodyDraft;
  }

  const generatedCommands = expandKeyOnlyTransposeIntent(
    workflow.cleanedMessage,
    (parsed.commands ?? parsed.operations) ?? [],
    documentState.coreDocument,
  );
  const repaired = repairCommandBatch(hydrateSelectionScopedCommands(
    rewriteRedundantClefSettersAsRemoval(workflow.cleanedMessage, generatedCommands, documentState.coreDocument),
    selection,
  ));
  const affectedMeasures = collectAffectedMeasures(repaired.validCommands);
  const assessment = assessAiPlan(parsed, {
    commands: repaired.validCommands,
    affectedMeasures,
    workflow: workflow.kind,
  });
  const normalizedPlan = normalizeAiPlan(assessment.plan, workflow);
  const presentation = buildClefAwarePresentation(
    workflow.cleanedMessage,
    repaired.validCommands,
    documentState.coreDocument,
    parsed.explanation ?? '',
    normalizedPlan,
  );

  if (!assessment.shouldApply) {
    return {
      xml,
      coreDocument: documentState.coreDocument,
      diagnostics: [
        ...documentState.diagnostics,
        ...createRepairDiagnostics(repaired.droppedCommands),
      ],
      explanation: presentation.explanation,
      context,
      commands: repaired.validCommands,
      operations: repaired.validCommands,
      provider: aiResponse.provider,
      model: aiResponse.model,
      latencyMs: aiResponse.latencyMs,
      confidence: assessment.confidence,
      ambiguities: assessment.ambiguities,
      affectedMeasures,
      plan: presentation.plan,
      riskReasons: assessment.riskReasons,
      validatorFindings: [],
      requiresConfirmation: true,
      rawIntent: parsed,
      workflow: workflow.kind,
      workflowLabel: workflow.label,
    };
  }

  const execution = applyDocumentCommands(documentState, repaired.validCommands);
  const validatorFindings = collectNewValidatorDiagnostics(documentState.diagnostics, execution.diagnostics);

  if (validatorFindings.length > 0) {
    const repairPrompt = buildValidatorRepairPrompt({
      message: workflow.cleanedMessage,
      context,
      attemptedCommands: repaired.validCommands,
      validatorFindings: validatorFindings.map((diagnostic) => ({
        code: diagnostic.code,
        message: diagnostic.message,
        level: diagnostic.level as 'warning' | 'error',
      })),
      workflow,
    });
    const repairResponse = await ask(repairPrompt, provider, ollamaModel);

    if (!repairResponse.error) {
      const repairedIntent = parseIntentJSON(repairResponse.text);
      if (repairedIntent) {
        const repairedLoopCommands = expandKeyOnlyTransposeIntent(
          workflow.cleanedMessage,
          (repairedIntent.commands ?? repairedIntent.operations) ?? [],
          documentState.coreDocument,
        );
        const repairedLoopBatch = repairCommandBatch(hydrateSelectionScopedCommands(
          rewriteRedundantClefSettersAsRemoval(workflow.cleanedMessage, repairedLoopCommands, documentState.coreDocument),
          selection,
        ));
        const repairedLoopAffectedMeasures = collectAffectedMeasures(repairedLoopBatch.validCommands);
        const repairedLoopAssessment = assessAiPlan(repairedIntent, {
          commands: repairedLoopBatch.validCommands,
          affectedMeasures: repairedLoopAffectedMeasures,
          workflow: workflow.kind,
        });
        const repairedLoopPlan = normalizeAiPlan(repairedLoopAssessment.plan, workflow);
        const repairedLoopPresentation = buildClefAwarePresentation(
          workflow.cleanedMessage,
          repairedLoopBatch.validCommands,
          documentState.coreDocument,
          repairedIntent.explanation ?? parsed.explanation ?? '',
          repairedLoopPlan,
        );
        const repairedExecution = applyDocumentCommands(documentState, repairedLoopBatch.validCommands);
        const remainingFindings = collectNewValidatorDiagnostics(documentState.diagnostics, repairedExecution.diagnostics);
        const repairDiagnostics = [
          ...createRepairDiagnostics(repairedLoopBatch.droppedCommands),
          createValidatorRepairDiagnostic(
            remainingFindings.length === 0
              ? `Validator repair loop adjusted the command batch and cleared ${validatorFindings.length} finding(s).`
              : `Validator repair loop attempted a correction, but ${remainingFindings.length} validator finding(s) remain.`,
            remainingFindings.length === 0 ? 'info' : 'warning',
          ),
        ];

        if (remainingFindings.length === 0 && repairedLoopAssessment.shouldApply) {
          const doctorReport = buildAiDoctorGateReport({ baseline: documentState, execution: repairedExecution });
          const doctorFindings = aiDoctorGateFindings(doctorReport, repairedExecution.diagnostics);
          if (aiDoctorGateRequiresConfirmation(doctorReport, repairedExecution.diagnostics)) {
            return {
              xml,
              coreDocument: documentState.coreDocument,
              diagnostics: [
                ...documentState.diagnostics,
                ...repairDiagnostics,
                createDoctorGateDiagnostic(`Notation Doctor requires confirmation before applying this edit (${doctorFindings.join('; ')}).`),
              ],
              explanation: repairedLoopPresentation.explanation,
              context,
              commands: repairedExecution.appliedCommands,
              operations: repairedExecution.appliedCommands,
              provider: repairResponse.provider,
              model: repairResponse.model,
              latencyMs: aiResponse.latencyMs + repairResponse.latencyMs,
              confidence: repairedLoopAssessment.confidence,
              ambiguities: repairedLoopAssessment.ambiguities,
              affectedMeasures: collectAffectedMeasures(repairedExecution.appliedCommands),
              plan: repairedLoopPresentation.plan,
              riskReasons: [
                ...repairedLoopAssessment.riskReasons,
                'Notation Doctor gate requires review before apply',
              ],
              validatorFindings: doctorFindings,
              requiresConfirmation: true,
              rawIntent: repairedIntent,
              workflow: workflow.kind,
              workflowLabel: workflow.label,
            };
          }
          return {
            xml: repairedExecution.xml,
            coreDocument: repairedExecution.coreDocument,
            diagnostics: [
              ...repairedExecution.diagnostics,
              ...repairDiagnostics,
            ],
            explanation: repairedLoopPresentation.explanation,
            context,
            commands: repairedExecution.appliedCommands,
            operations: repairedExecution.appliedCommands,
            provider: repairResponse.provider,
            model: repairResponse.model,
            latencyMs: aiResponse.latencyMs + repairResponse.latencyMs,
            confidence: repairedLoopAssessment.confidence,
            ambiguities: repairedLoopAssessment.ambiguities,
            affectedMeasures: collectAffectedMeasures(repairedExecution.appliedCommands),
            plan: repairedLoopPresentation.plan,
            riskReasons: repairedLoopAssessment.riskReasons,
            validatorFindings: [],
            requiresConfirmation: false,
            rawIntent: repairedIntent,
            workflow: workflow.kind,
            workflowLabel: workflow.label,
          };
        }

        return {
          xml,
          coreDocument: documentState.coreDocument,
          diagnostics: [
            ...documentState.diagnostics,
            ...createRepairDiagnostics(repairedLoopBatch.droppedCommands),
            ...repairDiagnostics,
          ],
          explanation: repairedLoopPresentation.explanation,
          context,
          commands: repairedLoopBatch.validCommands,
          operations: repairedLoopBatch.validCommands,
          provider: repairResponse.provider,
          model: repairResponse.model,
          latencyMs: aiResponse.latencyMs + repairResponse.latencyMs,
          confidence: repairedLoopAssessment.confidence,
          ambiguities: repairedLoopAssessment.ambiguities,
          affectedMeasures: repairedLoopAffectedMeasures,
          plan: repairedLoopPresentation.plan,
          riskReasons: [
            ...repairedLoopAssessment.riskReasons,
            'Validator findings remain after automatic repair',
          ],
          validatorFindings: toFindingMessages(remainingFindings.length > 0 ? remainingFindings : validatorFindings),
          requiresConfirmation: true,
          rawIntent: repairedIntent,
          workflow: workflow.kind,
          workflowLabel: workflow.label,
        };
      }
    }

    return {
      xml,
      coreDocument: documentState.coreDocument,
      diagnostics: [
        ...documentState.diagnostics,
        ...createRepairDiagnostics(repaired.droppedCommands),
        createValidatorRepairDiagnostic('Validator repair loop could not produce a safe corrected batch.', 'warning'),
      ],
      explanation: presentation.explanation,
      context,
      commands: repaired.validCommands,
      operations: repaired.validCommands,
      provider: aiResponse.provider,
      model: aiResponse.model,
      latencyMs: aiResponse.latencyMs + (repairResponse.error ? 0 : repairResponse.latencyMs),
      confidence: assessment.confidence,
      ambiguities: assessment.ambiguities,
      affectedMeasures,
      plan: presentation.plan,
      riskReasons: [
        ...assessment.riskReasons,
        'Validator findings need review before apply',
      ],
      validatorFindings: toFindingMessages(validatorFindings),
      requiresConfirmation: true,
      rawIntent: parsed,
      workflow: workflow.kind,
      workflowLabel: workflow.label,
    };
  }

  const doctorReport = buildAiDoctorGateReport({ baseline: documentState, execution });
  const doctorFindings = aiDoctorGateFindings(doctorReport, execution.diagnostics);
  if (aiDoctorGateRequiresConfirmation(doctorReport, execution.diagnostics)) {
    return {
      xml,
      coreDocument: documentState.coreDocument,
      diagnostics: [
        ...documentState.diagnostics,
        ...createRepairDiagnostics(repaired.droppedCommands),
        createDoctorGateDiagnostic(`Notation Doctor requires confirmation before applying this edit (${doctorFindings.join('; ')}).`),
      ],
      explanation: presentation.explanation,
      context,
      commands: execution.appliedCommands,
      operations: execution.appliedCommands,
      provider: aiResponse.provider,
      model: aiResponse.model,
      latencyMs: aiResponse.latencyMs,
      confidence: assessment.confidence,
      ambiguities: assessment.ambiguities,
      affectedMeasures: collectAffectedMeasures(execution.appliedCommands),
      plan: presentation.plan,
      riskReasons: [
        ...assessment.riskReasons,
        'Notation Doctor gate requires review before apply',
      ],
      validatorFindings: doctorFindings,
      requiresConfirmation: true,
      rawIntent: parsed,
      workflow: workflow.kind,
      workflowLabel: workflow.label,
    };
  }

  return {
    xml: execution.xml,
    coreDocument: execution.coreDocument,
    diagnostics: [
      ...execution.diagnostics,
      ...createRepairDiagnostics(repaired.droppedCommands),
    ],
    explanation: presentation.explanation,
    context,
    commands: execution.appliedCommands,
    operations: execution.appliedCommands,
    provider: aiResponse.provider,
    model: aiResponse.model,
    latencyMs: aiResponse.latencyMs,
    confidence: assessment.confidence,
    ambiguities: assessment.ambiguities,
    affectedMeasures: collectAffectedMeasures(execution.appliedCommands),
    plan: presentation.plan,
    riskReasons: assessment.riskReasons,
    validatorFindings: [],
    requiresConfirmation: false,
    rawIntent: parsed,
    workflow: workflow.kind,
    workflowLabel: workflow.label,
  };
}
