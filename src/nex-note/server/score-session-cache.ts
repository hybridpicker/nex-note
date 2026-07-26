interface ScoreSessionEntry {
  key: string;
  revision: number;
  xml: string;
  selection?: unknown;
  undoXml: string[];
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

export function storeScoreSession(params: { scoreKey: string; revision: number; xml: string; selection?: unknown }) {
  const { scoreKey, revision, xml, selection } = params;
  const store = getStore();
  const previous = store.get(scoreKey);
  store.set(scoreKey, {
    key: scoreKey,
    revision,
    xml,
    selection,
    undoXml: previous?.undoXml ?? [],
    updatedAt: Date.now(),
  });
  pruneStore(store);
  return {
    scoreKey,
    revision,
    bytes: Buffer.byteLength(xml, 'utf8'),
  };
}

export function getScoreSession(scoreKey?: string | null) {
  if (!scoreKey) return null;
  const entry = getStore().get(scoreKey);
  if (!entry) return null;
  entry.updatedAt = Date.now();
  return {
    scoreKey: entry.key,
    revision: entry.revision,
    xml: entry.xml,
    selection: entry.selection,
    canUndo: entry.undoXml.length > 0,
  };
}

export function applyScoreSessionMutation(params: {
  scoreKey: string;
  expectedRevision: number;
  xml: string;
  revision: number;
}) {
  const entry = getStore().get(params.scoreKey);
  if (!entry || entry.revision !== params.expectedRevision) return null;
  entry.undoXml = [...entry.undoXml, entry.xml].slice(-50);
  entry.xml = params.xml;
  entry.revision = params.revision;
  entry.updatedAt = Date.now();
  return { scoreKey: entry.key, revision: entry.revision, canUndo: true };
}

export function resolveScoreSessionXml(scoreKey?: string | null, minimumRevision?: number | null) {
  if (!scoreKey) return null;
  const entry = getStore().get(scoreKey);
  if (!entry) return null;
  if (typeof minimumRevision === 'number' && entry.revision < minimumRevision) return null;
  entry.updatedAt = Date.now();
  return entry.xml;
}
