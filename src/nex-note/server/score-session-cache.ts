interface ScoreSessionEntry {
  key: string;
  revision: number;
  xml: string;
  updatedAt: number;
}

const MAX_SCORE_SESSIONS = 12;

declare global {
  // eslint-disable-next-line no-var
  var __NEX_NOTE_SCORE_SESSIONS__: Map<string, ScoreSessionEntry> | undefined;
}

function getStore() {
  if (!globalThis.__NEX_NOTE_SCORE_SESSIONS__) {
    globalThis.__NEX_NOTE_SCORE_SESSIONS__ = new Map<string, ScoreSessionEntry>();
  }
  return globalThis.__NEX_NOTE_SCORE_SESSIONS__;
}

function pruneStore(store: Map<string, ScoreSessionEntry>) {
  if (store.size <= MAX_SCORE_SESSIONS) return;
  const staleEntries = [...store.values()]
    .sort((a, b) => a.updatedAt - b.updatedAt)
    .slice(0, Math.max(0, store.size - MAX_SCORE_SESSIONS));
  staleEntries.forEach((entry) => {
    store.delete(entry.key);
  });
}

export function storeScoreSession(params: { scoreKey: string; revision: number; xml: string }) {
  const { scoreKey, revision, xml } = params;
  const store = getStore();
  store.set(scoreKey, {
    key: scoreKey,
    revision,
    xml,
    updatedAt: Date.now(),
  });
  pruneStore(store);
  return {
    scoreKey,
    revision,
    bytes: Buffer.byteLength(xml, 'utf8'),
  };
}

export function resolveScoreSessionXml(scoreKey?: string | null, minimumRevision?: number | null) {
  if (!scoreKey) return null;
  const entry = getStore().get(scoreKey);
  if (!entry) return null;
  if (typeof minimumRevision === 'number' && entry.revision < minimumRevision) return null;
  entry.updatedAt = Date.now();
  return entry.xml;
}
