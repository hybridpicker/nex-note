import { DEFAULT_CRITIC_EVAL_CASES } from '../src/nex-note/arrangement/evals/default-critic-evals.ts';
import { runCriticEvalHarness } from '../src/nex-note/arrangement/evals/critic-eval-core.ts';

const summary = runCriticEvalHarness(DEFAULT_CRITIC_EVAL_CASES);

summary.results.forEach((result) => {
  const status = result.passed ? 'PASS' : 'FAIL';
  console.log(`${status} ${result.name}`);
  if (result.passed) return;
  console.log(`  expected issues: ${result.expectedIssueCodes.join(', ') || '(none)'}`);
  console.log(`  actual issues: ${result.actualIssueCodes.join(', ') || '(none)'}`);
  console.log(`  expected errors/warnings: ${result.expectedErrorCount}/${result.expectedWarningCount}`);
  console.log(`  actual errors/warnings: ${result.actualErrorCount}/${result.actualWarningCount}`);
});

console.log(`\nCritic evals: ${summary.passedCount}/${summary.total} passed`);

if (!summary.passed) process.exit(1);
