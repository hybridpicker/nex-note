import type { ArrangementSpec, ArrangementStylePackId, CriticIssue, VoicingPlan } from '@/src/nex-note/arrangement/spec';
import { runArrangementCritic } from '@/src/nex-note/arrangement/critic/run-arrangement-critic';
import { getArrangementStylePack } from '@/src/nex-note/arrangement/style-packs';

type CriticEvalSpecOverrides = Partial<Omit<ArrangementSpec, 'constraints'>> & {
  constraints?: Partial<ArrangementSpec['constraints']>;
};

export interface CriticEvalCase {
  name: string;
  stylePack: ArrangementStylePackId;
  voicingPlan: VoicingPlan;
  specOverrides?: CriticEvalSpecOverrides;
  expectedIssueCodes: CriticIssue['code'][];
  expectedErrorCount: number;
  expectedWarningCount: number;
}

export interface CriticEvalResult {
  name: string;
  passed: boolean;
  expectedIssueCodes: CriticIssue['code'][];
  actualIssueCodes: CriticIssue['code'][];
  expectedErrorCount: number;
  actualErrorCount: number;
  expectedWarningCount: number;
  actualWarningCount: number;
}

export interface CriticEvalSummary {
  passed: boolean;
  total: number;
  passedCount: number;
  failedCount: number;
  results: CriticEvalResult[];
}

function buildSpec(stylePackId: ArrangementStylePackId, overrides?: CriticEvalSpecOverrides): ArrangementSpec {
  const stylePack = getArrangementStylePack(stylePackId);
  return {
    sourceMelody: { source: 'chat-inline', description: 'critic harness seed' },
    stylePack: stylePackId,
    ...stylePack.defaults,
    ...overrides,
    constraints: {
      ...stylePack.defaults.constraints,
      ...overrides?.constraints,
    },
  };
}

function codesMatch(expected: CriticIssue['code'][], actual: CriticIssue['code'][]) {
  return JSON.stringify([...expected].sort()) === JSON.stringify([...actual].sort());
}

export function runCriticEvalHarness(cases: CriticEvalCase[]) {
  const results: CriticEvalResult[] = cases.map((testCase) => {
    const report = runArrangementCritic({
      spec: buildSpec(testCase.stylePack, testCase.specOverrides),
      voicingPlan: testCase.voicingPlan,
    });
    const actualIssueCodes = report.issues.map((issue) => issue.code);
    const passed = codesMatch(testCase.expectedIssueCodes, actualIssueCodes)
      && report.errorCount === testCase.expectedErrorCount
      && report.warningCount === testCase.expectedWarningCount;

    return {
      name: testCase.name,
      passed,
      expectedIssueCodes: testCase.expectedIssueCodes,
      actualIssueCodes,
      expectedErrorCount: testCase.expectedErrorCount,
      actualErrorCount: report.errorCount,
      expectedWarningCount: testCase.expectedWarningCount,
      actualWarningCount: report.warningCount,
    };
  });

  const passedCount = results.filter((result) => result.passed).length;
  return {
    passed: passedCount === results.length,
    total: results.length,
    passedCount,
    failedCount: results.length - passedCount,
    results,
  } satisfies CriticEvalSummary;
}
