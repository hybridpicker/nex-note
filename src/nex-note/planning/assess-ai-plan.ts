import type { ParsedIntentJson } from '@/src/nex-note/intent/parse-intent-json';
import type { ValidatedScoreCommand } from '@/src/shared/schemas/score-command';
import type { AiWorkflowKind } from '@/src/nex-note/workflows/ai-workflows';

export interface AiPlanAssessment {
  confidence: 'high' | 'medium' | 'low';
  ambiguities: string[];
  plan: string[];
  riskReasons: string[];
  shouldApply: boolean;
}

const SCORE_WIDE_RISK_TYPES = new Set([
  'removeArticulations',
  'addStartRepeat',
  'addVolta2',
]);

function isSafeWholeScoreTransposePlan(commands: ValidatedScoreCommand[]) {
  if (commands.length === 0 || commands.length > 2) return false;

  let transposeCount = 0;
  let keyCount = 0;

  for (const command of commands) {
    if (command.type === 'transposeDocumentChromatic') {
      transposeCount += 1;
      continue;
    }
    if (command.type === 'setKey') {
      keyCount += 1;
      continue;
    }
    return false;
  }

  return transposeCount === 1 && keyCount <= 1;
}

const CREATIVE_GENERAL_DRAFT_TYPES = new Set([
  'setKey',
  'setTimeSignature',
  'setTempo',
  'insertNoteAt',
  'insertRestAt',
  'addExpressionText',
  'addWords',
]);

function isSafeCreativeGeneralDraft(
  commands: ValidatedScoreCommand[],
  confidence: AiPlanAssessment['confidence'],
  ambiguities: string[],
  workflow: AiWorkflowKind,
) {
  if (workflow !== 'general') return false;
  if (confidence !== 'high' || ambiguities.length > 0) return false;
  const insertedEvents = commands.filter((command) => command.type === 'insertNoteAt' || command.type === 'insertRestAt').length;
  if (insertedEvents < 4) return false;
  return commands.every((command) => CREATIVE_GENERAL_DRAFT_TYPES.has(command.type));
}

function summarizeRiskReasons(
  commands: ValidatedScoreCommand[],
  affectedMeasures: number[],
  confidence: AiPlanAssessment['confidence'],
  ambiguities: string[],
  workflow: AiWorkflowKind,
) {
  const reasons: string[] = [];
  const safeWholeScoreTranspose = isSafeWholeScoreTransposePlan(commands);
  const safeCreativeGeneralDraft = isSafeCreativeGeneralDraft(commands, confidence, ambiguities, workflow);

  if (confidence === 'low') reasons.push('Low-confidence AI plan');
  if (ambiguities.length > 0) reasons.push('Open ambiguities need review');
  if (!safeCreativeGeneralDraft && (commands.length >= 3 || (commands.length >= 2 && !safeWholeScoreTranspose))) {
    reasons.push('Multiple commands will be applied together');
  }
  if (affectedMeasures.length >= 4 && !safeWholeScoreTranspose && !safeCreativeGeneralDraft) reasons.push('Edit spans several measures');
  if (commands.some((command) => command.category === 'structure')) reasons.push('Structural notation changes are included');
  if (commands.some((command) => SCORE_WIDE_RISK_TYPES.has(command.type))) reasons.push('Score-wide edits can affect the whole document');
  if (commands.some((command) => command.type === 'addTechniqueInstruction' && !(command as { partId?: unknown }).partId)) {
    reasons.push('Technique instruction target is ambiguous');
  }
  if (commands.some((command) => command.type === 'addOrchestrationNote')) {
    reasons.push('Orchestration guidance should stay previewable before apply');
  }
  if ((workflow === 'layout-assist' || workflow === 'layout-cleanup') && commands.length > 0) reasons.push('Layout assistance should stay previewable before apply');
  if (workflow === 'cleanup' && commands.some((command) => command.type === 'removeArticulations')) reasons.push('Cleanup may remove expressive markings across the score');
  if (workflow === 'arrangement-assist' && commands.length > 0) reasons.push('Arrangement suggestions should stay previewable before apply');

  return reasons;
}

export function assessAiPlan(
  parsed: ParsedIntentJson,
  options?: {
    commands?: ValidatedScoreCommand[];
    affectedMeasures?: number[];
    workflow?: AiWorkflowKind;
  },
): AiPlanAssessment {
  const confidence = parsed.confidence ?? 'medium';
  const ambiguities = Array.isArray(parsed.ambiguities)
    ? parsed.ambiguities.filter((entry): entry is string => typeof entry === 'string' && entry.trim().length > 0)
    : [];
  const plan = Array.isArray(parsed.plan)
    ? parsed.plan.filter((entry): entry is string => typeof entry === 'string' && entry.trim().length > 0)
    : [];
  const riskReasons = summarizeRiskReasons(
    options?.commands ?? [],
    options?.affectedMeasures ?? [],
    confidence,
    ambiguities,
    options?.workflow ?? 'general',
  );

  return {
    confidence,
    ambiguities,
    plan,
    riskReasons,
    shouldApply: riskReasons.length === 0,
  };
}
