import type { ScoreDocumentModel } from '@/src/score-core/model/types';
import {
  DEFAULT_SCORE_DOCUMENT_SESSION,
  type ScoreDocumentSelectionAnchor,
  type ScoreDocumentSelectionLocator,
  type ScoreDocumentSelectedDuration,
  type ScoreDocumentSessionState,
  type ScoreViewMode,
} from '@/src/score-session/types';

export const NXN_FORMAT = 'nxn' as const;
export const NXN_VERSION = 1 as const;
export const NXN_EXTENSION = '.nxn' as const;
export const NXN_MIME_TYPE = 'application/x.nex-note+json';
export const NXN_FILE_ACCEPT = '.nxn,application/x.nex-note+json,application/json';

export type NxnViewMode = ScoreViewMode;
export type NxnSelectedDuration = ScoreDocumentSelectedDuration;
export type NxnSessionStateV1 = ScoreDocumentSessionState;

export interface NxnFileV1 {
  format: typeof NXN_FORMAT;
  version: typeof NXN_VERSION;
  document: ScoreDocumentModel;
  session: NxnSessionStateV1;
  sourceMusicXml: string;
}

export interface CreateNxnFileInput {
  document: ScoreDocumentModel;
  session?: Partial<NxnSessionStateV1>;
  sourceMusicXml: string;
}

export interface NxnReadableFile {
  name?: string;
  text(): Promise<string>;
}

export class NxnFileError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'NxnFileError';
  }
}

export const DEFAULT_NXN_SESSION: NxnSessionStateV1 = DEFAULT_SCORE_DOCUMENT_SESSION;

const VALID_VIEW_MODES = new Set<ScoreViewMode>(['page', 'continuous-vertical', 'continuous-horizontal']);
const VALID_DURATIONS = new Set<ScoreDocumentSelectedDuration>(['1', '2', '4', '8', '16', '32', '64']);

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function isStringArray(value: unknown): value is string[] {
  return Array.isArray(value) && value.every((entry) => typeof entry === 'string');
}

function toStringSet(value: unknown): Set<string> {
  if (value instanceof Set) {
    return new Set([...value].filter((entry): entry is string => typeof entry === 'string'));
  }
  if (isStringArray(value)) {
    return new Set(value);
  }
  return new Set();
}

function isNonNegativeInteger(value: unknown) {
  return Number.isInteger(value) && Number(value) >= 0;
}

function isPositiveInteger(value: unknown) {
  return Number.isInteger(value) && Number(value) > 0;
}

function isSelectionLocator(value: unknown): value is ScoreDocumentSelectionLocator {
  if (!isRecord(value)) return false;

  return (value.coreMeasureId == null || typeof value.coreMeasureId === 'string')
    && (value.corePartId == null || typeof value.corePartId === 'string')
    && isNonNegativeInteger(value.measureNumber)
    && isPositiveInteger(value.staffIndex)
    && isPositiveInteger(value.voiceId)
    && isNonNegativeInteger(value.timestampNum)
    && isPositiveInteger(value.timestampDen);
}

function isSelectionAnchor(value: unknown): value is ScoreDocumentSelectionAnchor {
  if (!isRecord(value)) return false;

  return isStringArray(value.entityIds)
    && (value.anchorEntityId === null || typeof value.anchorEntityId === 'string')
    && (value.anchorLocator == null || isSelectionLocator(value.anchorLocator))
    && (value.selectionLocators === undefined || (
      Array.isArray(value.selectionLocators)
      && value.selectionLocators.every(isSelectionLocator)
    ));
}

function isScoreDocumentModelLike(value: unknown): value is ScoreDocumentModel {
  if (!isRecord(value)) return false;

  const score = value.score;
  const index = value.index;

  return isRecord(score)
    && typeof score.id === 'string'
    && Array.isArray(score.parts)
    && isRecord(value.metadata)
    && isRecord(index)
    && isRecord(index.measureIds)
    && isRecord(index.voiceIds)
    && isRecord(index.eventIds)
    && Array.isArray(value.slurs)
    && Array.isArray(value.beams)
    && Array.isArray(value.tuplets)
    && Array.isArray(value.chordGroups)
    && Array.isArray(value.graceNotes)
    && Array.isArray(value.lyricLines)
    && Array.isArray(value.layoutHints)
    && isNonNegativeInteger(value.revision);
}

function isNxnSessionState(value: unknown): value is NxnSessionStateV1 {
  if (!isRecord(value)) return false;

  return (value.selectionAnchor === null || isSelectionAnchor(value.selectionAnchor))
    && typeof value.viewMode === 'string'
    && VALID_VIEW_MODES.has(value.viewMode as ScoreViewMode)
    && typeof value.zoomPercent === 'number'
    && Number.isFinite(value.zoomPercent)
    && value.zoomPercent > 0
    && typeof value.selectedDuration === 'string'
    && VALID_DURATIONS.has(value.selectedDuration as ScoreDocumentSelectedDuration)
    && isPositiveInteger(value.selectedVoice);
}

function assertValidDocument(document: unknown): asserts document is ScoreDocumentModel {
  if (!isScoreDocumentModelLike(document)) {
    throw new NxnFileError('Invalid .nxn document payload: expected a raw ScoreDocumentModel.');
  }
}

function assertValidSession(session: unknown): asserts session is NxnSessionStateV1 {
  if (!isNxnSessionState(session)) {
    throw new NxnFileError('Invalid .nxn session payload.');
  }
}

function normalizeNxnDocument(document: ScoreDocumentModel): ScoreDocumentModel {
  return {
    ...structuredClone(document),
    tremolos: [...(document.tremolos ?? [])],
    glissandos: [...(document.glissandos ?? [])],
    arpeggios: [...(document.arpeggios ?? [])],
    fermataEventIds: toStringSet(document.fermataEventIds),
  };
}

function stringifyNxnFile(file: NxnFileV1) {
  return JSON.stringify(file, (_key, value: unknown) => {
    if (value instanceof Set) return [...value];
    return value;
  }, 2);
}

export function isNxnFilename(filename: string) {
  return /\.nxn$/i.test(filename.trim());
}

export function buildNxnFilename(filename: string) {
  const trimmed = filename.trim();
  if (!trimmed) return `score${NXN_EXTENSION}`;
  if (/\.[^.]+$/.test(trimmed)) {
    return trimmed.replace(/\.[^.]+$/, NXN_EXTENSION);
  }
  return `${trimmed}${NXN_EXTENSION}`;
}

export function createNxnSession(session?: Partial<NxnSessionStateV1>): NxnSessionStateV1 {
  const nextSession: NxnSessionStateV1 = {
    ...DEFAULT_NXN_SESSION,
    ...session,
    selectionAnchor: session?.selectionAnchor ?? DEFAULT_NXN_SESSION.selectionAnchor,
  };
  assertValidSession(nextSession);
  return structuredClone(nextSession);
}

export function createNxnFile(input: CreateNxnFileInput): NxnFileV1 {
  assertValidDocument(input.document);

  if (typeof input.sourceMusicXml !== 'string') {
    throw new NxnFileError('Invalid .nxn sourceMusicXml payload: expected a string.');
  }

  return {
    format: NXN_FORMAT,
    version: NXN_VERSION,
    document: normalizeNxnDocument(input.document),
    session: createNxnSession(input.session),
    sourceMusicXml: input.sourceMusicXml,
  };
}

export function serializeNxnFile(input: CreateNxnFileInput) {
  return stringifyNxnFile(createNxnFile(input));
}

export function parseNxnObject(value: unknown): NxnFileV1 {
  if (!isRecord(value)) {
    throw new NxnFileError('Invalid .nxn file: expected a JSON object.');
  }
  if (value.format !== NXN_FORMAT) {
    throw new NxnFileError(`Unsupported .nxn format "${String(value.format)}".`);
  }
  if (value.version !== NXN_VERSION) {
    throw new NxnFileError(`Unsupported .nxn version "${String(value.version)}".`);
  }
  if (typeof value.sourceMusicXml !== 'string') {
    throw new NxnFileError('Invalid .nxn file: sourceMusicXml must be a string.');
  }

  assertValidDocument(value.document);
  assertValidSession(value.session);

  return {
    format: NXN_FORMAT,
    version: NXN_VERSION,
    document: normalizeNxnDocument(value.document),
    session: structuredClone(value.session),
    sourceMusicXml: value.sourceMusicXml,
  };
}

export function parseNxnText(text: string): NxnFileV1 {
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    throw new NxnFileError('Invalid .nxn JSON.');
  }

  return parseNxnObject(parsed);
}

export async function readNxnFile(file: NxnReadableFile): Promise<NxnFileV1> {
  if (file.name && !isNxnFilename(file.name)) {
    throw new NxnFileError(`Expected a ${NXN_EXTENSION} file, received "${file.name}".`);
  }
  return parseNxnText(await file.text());
}

export function createNxnBlob(input: CreateNxnFileInput) {
  return new Blob([serializeNxnFile(input)], { type: NXN_MIME_TYPE });
}

export function downloadNxnFile(input: CreateNxnFileInput, filename: string) {
  if (typeof document === 'undefined') {
    throw new NxnFileError('Downloading .nxn files requires a browser document context.');
  }

  const blob = createNxnBlob(input);
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = buildNxnFilename(filename);
  link.click();
  URL.revokeObjectURL(url);
}
