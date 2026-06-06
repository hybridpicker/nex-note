import {
  createDefaultNewScoreDraft,
  createNewScoreXml,
} from '@/lib/new-score';
import {
  resolveScoreRequestXml,
  type ScoreRequestPayload,
} from '@/src/nex-note/server/resolve-score-request-xml';

const INLINE_NOTE_TOKEN_RE = /\b[A-Ga-g](?:[#b])?(?:-?\d)?\b/g;

function extractInlineNoteTokens(message: string) {
  return message.match(INLINE_NOTE_TOKEN_RE) ?? [];
}

function containsArrangementCue(message: string) {
  return /\b(arrang(?:e|ement|ed|ing|iere|ieren|iert)|accompan(?:iment|y)|harmoni[sz]e|harmonis(?:iere|ieren|iert)?|begleit(?:e|en|et|ung)?|voic(?:e|ing)|orchestrat(?:e|ion)|akkord(?:e)?|satz)\b/i.test(message);
}

function containsMelodyCue(message: string) {
  return /\b(melody|melodie|theme|motiv|motif)\b/i.test(message);
}

function inferInstrumentIds(message: string) {
  if (/\b(voice|vocal|gesang|stimme)\b/i.test(message) && /\b(piano|klavier)\b/i.test(message)) {
    return ['soprano', 'piano'];
  }
  if (/\b(voice|vocal|gesang|stimme)\b/i.test(message)) return ['soprano'];
  if (/\bviolin|geige\b/i.test(message)) return ['violin'];
  if (/\bcello\b/i.test(message)) return ['cello'];
  if (/\bflute|flöte|floete\b/i.test(message)) return ['flute'];
  if (/\bclarinet|klarinette\b/i.test(message)) return ['clarinet-bb'];
  if (/\btrumpet|trompete\b/i.test(message)) return ['trumpet-bb'];
  return ['piano'];
}

function inferMeasureCount(message: string, noteCount: number) {
  const explicitBars = message.includes('|')
    ? message.split('|').length
    : 0;
  const estimatedMeasures = Math.ceil(noteCount / 4);
  return Math.max(4, Math.min(32, explicitBars || estimatedMeasures || 4));
}

function shouldCreateSeedScore(message: string) {
  const noteTokens = extractInlineNoteTokens(message);
  const denseInlineMelody = noteTokens.length >= 6 || (noteTokens.length >= 3 && /[\n|]/.test(message));
  const hintedInlineMelody = noteTokens.length >= 3 && (containsArrangementCue(message) || containsMelodyCue(message));
  return denseInlineMelody || hintedInlineMelody;
}

function createSeedScoreXml(message: string) {
  if (!shouldCreateSeedScore(message)) return null;

  const noteTokens = extractInlineNoteTokens(message);
  const draft = createDefaultNewScoreDraft();
  draft.title = 'Chat Arrangement Sketch';
  draft.instrumentIds = inferInstrumentIds(message);
  draft.measureCount = inferMeasureCount(message, noteTokens.length);
  draft.tempo.bpm = 96;
  return createNewScoreXml(draft);
}

export function resolveChatScoreXml(payload: ScoreRequestPayload & { message: string }) {
  const resolved = resolveScoreRequestXml(payload);
  if (resolved) return resolved;
  return createSeedScoreXml(payload.message);
}
