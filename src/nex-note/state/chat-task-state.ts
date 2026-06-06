import type { AiSessionContext } from '@/lib/prompts';

type ChatTaskState = NonNullable<AiSessionContext['taskState']>;

const stateByScore = new Map<string, ChatTaskState>();

function inferInstrument(message: string) {
  const normalized = message.toLowerCase();
  if (/\b(voice|vocal|sing|singer|gesang|stimme)\b/.test(normalized)) return 'voice';
  if (/\bflute|flöte|floete\b/.test(normalized)) return 'flute';
  if (/\bviolin|geige\b/.test(normalized)) return 'violin';
  if (/\bclarinet|klarinette\b/.test(normalized)) return 'clarinet-bb';
  if (/\btrumpet|trompete\b/.test(normalized)) return 'trumpet-bb';
  if (/\balto sax|altsax|alto-sax|saxophon\b/.test(normalized)) return 'alto-sax-eb';
  if (/\bcello\b/.test(normalized)) return 'cello';
  return null;
}

function inferPracticeProfile(message: string) {
  const normalized = message.toLowerCase();
  if (/\b(roomy|luftig|airy)\b/.test(normalized)) return 'roomy' as const;
  if (/\b(compact|kompakt)\b/.test(normalized)) return 'compact' as const;
  if (/\b(practice|rehearsal|probe|übe|uebe)\b/.test(normalized)) return 'rehearsal' as const;
  return null;
}

export function mergeServerChatTaskState(params: {
  scoreKey?: string | null;
  incoming?: AiSessionContext['taskState'];
  message: string;
  workflow: string;
  explanation?: string;
}) {
  const { scoreKey, incoming, message, workflow, explanation } = params;
  if (!scoreKey && !incoming) return undefined;
  const existing = scoreKey ? stateByScore.get(scoreKey) : undefined;
  const merged: ChatTaskState = {
    ...(existing ?? {}),
    ...(incoming ?? {}),
    scoreKey: scoreKey ?? incoming?.scoreKey ?? existing?.scoreKey ?? null,
    lastWorkflow: workflow,
  };
  const inferredInstrument = inferInstrument(message);
  if (inferredInstrument) merged.preferredInstrument = inferredInstrument;
  const inferredProfile = inferPracticeProfile(message);
  if (inferredProfile) merged.practiceProfile = inferredProfile;
  if (workflow === 'analysis' && explanation) merged.lastAnalysisSummary = explanation;
  if (scoreKey) stateByScore.set(scoreKey, merged);
  return merged;
}
