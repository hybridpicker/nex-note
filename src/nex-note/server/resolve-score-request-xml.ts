import { resolveScoreSessionXml, storeScoreSession } from '@/src/nex-note/server/score-session-cache';

export interface ScoreRequestPayload {
  xml?: string;
  scoreKey?: string | null;
  scoreRevision?: number | null;
}

export function resolveScoreRequestXml(payload: ScoreRequestPayload) {
  const directXml = typeof payload.xml === 'string' && payload.xml.trim().length > 0
    ? payload.xml
    : null;

  if (directXml) {
    if (payload.scoreKey) {
      storeScoreSession({
        scoreKey: payload.scoreKey,
        revision: typeof payload.scoreRevision === 'number' ? payload.scoreRevision : 0,
        xml: directXml,
      });
    }
    return directXml;
  }

  return resolveScoreSessionXml(
    payload.scoreKey,
    typeof payload.scoreRevision === 'number' ? payload.scoreRevision : null,
  );
}
