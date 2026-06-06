export interface PersistedChatTaskState {
  scoreKey?: string | null;
  preferredInstrument?: string | null;
  practiceProfile?: 'rehearsal' | 'roomy' | 'compact' | null;
  lastWorkflow?: string | null;
  lastAnalysisSummary?: string | null;
}

const KEY_PREFIX = 'nex-note:chat-task-state:';

function canUseStorage() {
  return typeof localStorage !== 'undefined';
}

export function buildChatScoreKey(filename: string, xml: string, scoreId?: string | null) {
  if (scoreId?.trim()) return `score:${scoreId}`;
  const basis = `${filename.trim()}|${xml.length}|${xml.slice(0, 160)}`;
  let hash = 0;
  for (let index = 0; index < basis.length; index += 1) {
    hash = ((hash << 5) - hash) + basis.charCodeAt(index);
    hash |= 0;
  }
  return `unsaved:${Math.abs(hash)}`;
}

export function readChatTaskState(scoreKey?: string | null): PersistedChatTaskState {
  if (!scoreKey || !canUseStorage()) return {};
  try {
    return JSON.parse(localStorage.getItem(`${KEY_PREFIX}${scoreKey}`) ?? '{}') as PersistedChatTaskState;
  } catch {
    return {};
  }
}

export function writeChatTaskState(scoreKey: string | null | undefined, state: PersistedChatTaskState) {
  if (!scoreKey || !canUseStorage()) return;
  localStorage.setItem(`${KEY_PREFIX}${scoreKey}`, JSON.stringify({
    ...state,
    scoreKey,
  }));
}
