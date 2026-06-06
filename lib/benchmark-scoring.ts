import type { TestCase } from '@/lib/benchmark-suite';

type CommandCheck = NonNullable<NonNullable<TestCase['expect']>['commandChecks']>[number];

export type BenchmarkPipelineResult = {
  error?: string;
  workflow?: string;
  commands?: unknown[];
  validatorFindings?: unknown[];
  ambiguities?: unknown[];
  confidence?: unknown;
  requiresConfirmation?: unknown;
};

function commandTypeOf(command: unknown) {
  if (!command || typeof command !== 'object') return undefined;
  return (command as { type?: unknown }).type;
}

export function commandTypes(commands: unknown[]) {
  return commands
    .map((command) => commandTypeOf(command))
    .filter((type): type is string => typeof type === 'string');
}

function valueAtPath(source: unknown, path: string) {
  return path.split('.').reduce<unknown>((current, segment) => {
    if (!current || typeof current !== 'object') return undefined;
    return (current as Record<string, unknown>)[segment];
  }, source);
}

function commandMatchesCheck(command: unknown, check: CommandCheck) {
  if (commandTypeOf(command) !== check.type) return false;
  const value = valueAtPath(command, check.field);
  if ('equals' in check && value !== check.equals) return false;
  if (check.includes != null && (typeof value !== 'string' || !value.includes(check.includes))) return false;
  if (check.oneOf && !check.oneOf.some((candidate) => candidate === value)) return false;
  return true;
}

export function scoreBenchmarkResult(testCase: TestCase | undefined, result: BenchmarkPipelineResult) {
  if (result.error) {
    return {
      passed: false,
      score: 0,
      reasons: [result.error],
    };
  }

  const expected = testCase?.expect;
  const reasons: string[] = [];
  let score = 100;

  if (expected?.workflow && result.workflow !== expected.workflow) {
    score -= 35;
    reasons.push(`Expected workflow ${expected.workflow}, got ${result.workflow}`);
  }

  const commands = result.commands ?? [];
  const types = commandTypes(commands);
  if (!expected?.allowNoCommands && types.length === 0) {
    score -= 40;
    reasons.push('No commands produced');
  }

  if (expected?.minCommands != null && types.length < expected.minCommands) {
    score -= 25;
    reasons.push(`Expected at least ${expected.minCommands} command(s), got ${types.length}`);
  }

  const missingTypes = (expected?.commandTypes ?? []).filter((type) => !types.includes(type));
  if (missingTypes.length > 0) {
    score -= Math.min(35, missingTypes.length * 12);
    reasons.push(`Missing command type(s): ${missingTypes.join(', ')}`);
  }

  const forbiddenTypes = (expected?.forbiddenCommandTypes ?? []).filter((type) => types.includes(type));
  if (forbiddenTypes.length > 0) {
    score -= Math.min(30, forbiddenTypes.length * 15);
    reasons.push(`Forbidden command type(s): ${forbiddenTypes.join(', ')}`);
  }

  const failedChecks = (expected?.commandChecks ?? []).filter((check) => !commands.some((command) => commandMatchesCheck(command, check)));
  if (failedChecks.length > 0) {
    score -= Math.min(35, failedChecks.length * 15);
    reasons.push(`Missing command field expectation(s): ${failedChecks.map((check) => `${check.type}.${check.field}`).join(', ')}`);
  }

  if (expected?.requiresConfirmation != null && result.requiresConfirmation !== expected.requiresConfirmation) {
    score -= 15;
    reasons.push(`Expected requiresConfirmation=${expected.requiresConfirmation}, got ${String(result.requiresConfirmation)}`);
  }

  if (expected?.confidence && result.confidence !== expected.confidence) {
    score -= 15;
    reasons.push(`Expected confidence ${expected.confidence}, got ${String(result.confidence)}`);
  }

  const validatorFindingCount = result.validatorFindings?.length ?? 0;
  if (expected?.maxValidatorFindings != null && validatorFindingCount > expected.maxValidatorFindings) {
    score -= Math.min(20, (validatorFindingCount - expected.maxValidatorFindings) * 5);
    reasons.push(`Expected at most ${expected.maxValidatorFindings} validator finding(s), got ${validatorFindingCount}`);
  } else if (validatorFindingCount > 0) {
    score -= Math.min(20, validatorFindingCount * 5);
    reasons.push(`${validatorFindingCount} validator finding(s)`);
  }

  const ambiguityCount = result.ambiguities?.length ?? 0;
  if (expected?.minAmbiguities != null && ambiguityCount < expected.minAmbiguities) {
    score -= 15;
    reasons.push(`Expected at least ${expected.minAmbiguities} ambiguity warning(s), got ${ambiguityCount}`);
  } else if (ambiguityCount > 0) {
    score -= Math.min(10, ambiguityCount * 3);
    reasons.push(`${ambiguityCount} ambiguity warning(s)`);
  }

  score = Math.max(0, score);
  return {
    passed: score >= 70,
    score,
    reasons,
  };
}
