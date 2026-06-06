import { applyDocumentCommands, type DocumentState } from '@/src/score-core/commands/apply-document-commands';
import type { ArrangementSpec, HarmonicPlanCandidate, VoicingCandidate } from '@/src/nex-note/arrangement/spec';
import { buildRealizationPlan } from '@/src/nex-note/arrangement/realizer/build-realization-plan';
import { emitScoreCommandsFromRealizationPlan } from '@/src/nex-note/arrangement/realizer/emit-score-commands';
import type { RealizerIssue, RealizerResult } from '@/src/nex-note/arrangement/realizer/spec';

export function realizeArrangement(params: {
  documentState: DocumentState;
  spec: ArrangementSpec;
  voicingCandidate: VoicingCandidate;
  harmonicCandidate?: HarmonicPlanCandidate;
}): RealizerResult {
  const { documentState, spec, voicingCandidate, harmonicCandidate } = params;
  const built = buildRealizationPlan({
    documentState,
    spec,
    voicingCandidate,
    harmonicCandidate,
  });

  if (!built.plan) {
    return {
      plan: null,
      commands: [],
      issues: built.issues,
      valid: false,
      documentState: null,
    };
  }

  const commands = emitScoreCommandsFromRealizationPlan(built.plan);
  const applied = applyDocumentCommands(documentState, commands);
  const postApplyIssues: RealizerIssue[] = applied.diagnostics.map((diagnostic) => ({
    code: 'post-realization-validation',
    severity: diagnostic.level === 'error' ? 'error' : 'warning',
    message: diagnostic.message,
  }));

  const issues: RealizerIssue[] = [
    ...built.issues,
    ...postApplyIssues,
  ];

  return {
    plan: built.plan,
    commands,
    issues,
    valid: !issues.some((issue) => issue.severity === 'error'),
    documentState: applied,
  };
}
