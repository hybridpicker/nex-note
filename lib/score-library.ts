'use client';

import { buildNxnFilename, type NxnFileV1 } from '@/lib/nxn-file';
import { createRandomId } from '@/lib/random-id';

export interface LibraryScore {
  id: string;
  name: string;
  nativeName?: string;
  /**
   * XML is kept only for legacy/non-native entries. Entries backed by an .nxn
   * working copy intentionally keep this empty to avoid localStorage quota
   * failures on large converted scores.
   */
  xml: string;
  format: string;
  sizeBytes: number;
  measures: number;
  parts: number;
  favorite: boolean;
  createdAt: number;
  updatedAt: number;
  lastOpenedAt: number;
}

export interface SaveLibraryScoreInput {
  id?: string;
  name: string;
  xml: string;
  nativeProject?: NxnFileV1 | null;
  nativeName?: string | null;
  format?: string;
  favorite?: boolean;
  persistXml?: boolean;
}

const KEY = 'nex-note:score-library';
const MAX_LIBRARY_ITEMS = 30;

function canUseStorage() {
  return typeof window !== 'undefined' && typeof localStorage !== 'undefined';
}

function parseLibrary(raw: string | null): LibraryScore[] {
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed
      .filter(Boolean)
      .map((item) => {
        const nativeProject = item.nativeProject as NxnFileV1 | undefined;
        const nativeName = typeof item.nativeName === 'string'
          ? item.nativeName
          : (nativeProject ? buildNxnFilename(String(item.name ?? 'score')) : undefined);
        // Older builds stored the full .nxn payload in localStorage. Strip it
        // while preserving the small filename pointer. Also strip XML for
        // native-backed entries; the .nxn file is the source of truth.
        const { nativeProject: _nativeProject, ...metadata } = item;
        return {
          ...metadata,
          nativeName,
          xml: nativeName ? '' : String(item.xml ?? ''),
        };
      });
  } catch {
    return [];
  }
}

function persistLibrary(items: LibraryScore[]) {
  if (!canUseStorage()) return;
  const nextItems = items.slice(0, MAX_LIBRARY_ITEMS);
  try {
    localStorage.setItem(KEY, JSON.stringify(nextItems));
  } catch (error) {
    const isQuotaError = error instanceof DOMException && (
      error.name === 'QuotaExceededError'
      || error.name === 'NS_ERROR_DOM_QUOTA_REACHED'
    );
    if (!isQuotaError) throw error;

    const compactItems = nextItems.map((item) => ({ ...item, xml: '' }));
    localStorage.setItem(KEY, JSON.stringify(compactItems));
  }
}

function getFormatFromName(name: string, fallback?: string) {
  const ext = name.split('.').pop()?.toLowerCase();
  if (ext) return ext;
  return fallback?.toLowerCase() ?? 'musicxml';
}

function summarizeXml(xml: string) {
  const measures = (xml.match(/<measure\b/g) ?? []).length;
  const parts = (xml.match(/<score-part\b/g) ?? []).length || (xml.match(/<part\b/g) ?? []).length;
  return {
    measures,
    parts,
    sizeBytes: new Blob([xml]).size,
  };
}

function summarizeNativeProject(project: NxnFileV1 | undefined, fallbackXml: string) {
  if (!project) return summarizeXml(fallbackXml);
  const firstStaff = project.document.score.parts[0]?.staves[0];
  return {
    measures: firstStaff?.measures.length ?? summarizeXml(fallbackXml).measures,
    parts: project.document.score.parts.length,
    sizeBytes: new Blob([JSON.stringify(project)]).size,
  };
}

function findExistingScore(items: LibraryScore[], input: Pick<SaveLibraryScoreInput, 'id' | 'name'>) {
  return items.find((item) => item.id === input.id)
    ?? items.find((item) => item.name === input.name)
    ?? null;
}

export function getLibraryScores(): LibraryScore[] {
  if (!canUseStorage()) return [];
  const items = parseLibrary(localStorage.getItem(KEY));
  return items.sort((a, b) => b.lastOpenedAt - a.lastOpenedAt);
}

export function saveLibraryScore(input: SaveLibraryScoreInput): LibraryScore {
  const now = Date.now();
  const items = getLibraryScores();
  const existing = findExistingScore(items, input);
  const hasNativeProject = input.nativeProject === null
    ? false
    : Boolean(input.nativeProject || input.nativeName || existing?.nativeName);
  const nativeProjectForSummary = input.nativeProject === null
    ? undefined
    : (input.nativeProject ?? undefined);
  const summary = summarizeNativeProject(nativeProjectForSummary, input.xml);

  const next: LibraryScore = {
    id: existing?.id ?? createRandomId(),
    name: input.name,
    nativeName: hasNativeProject ? (input.nativeName ?? existing?.nativeName ?? buildNxnFilename(input.name)) : undefined,
    xml: hasNativeProject || input.persistXml === false ? '' : input.xml,
    format: input.format?.toLowerCase() ?? getFormatFromName(input.name, existing?.format),
    sizeBytes: summary.sizeBytes,
    measures: summary.measures,
    parts: summary.parts,
    favorite: input.favorite ?? existing?.favorite ?? false,
    createdAt: existing?.createdAt ?? now,
    updatedAt: now,
    lastOpenedAt: now,
  };

  const filtered = items.filter((item) => item.id !== next.id);
  filtered.unshift(next);
  persistLibrary(filtered);
  return next;
}

export function touchLibraryScore(id: string) {
  const items = getLibraryScores();
  const existing = items.find((item) => item.id === id);
  if (!existing) return;
  persistLibrary([
    { ...existing, lastOpenedAt: Date.now() },
    ...items.filter((item) => item.id !== id),
  ]);
}

export function toggleLibraryFavorite(id: string) {
  const items = getLibraryScores().map((item) => item.id === id ? { ...item, favorite: !item.favorite } : item);
  persistLibrary(items);
}

export function deleteLibraryScore(id: string) {
  persistLibrary(getLibraryScores().filter((item) => item.id !== id));
}

export function clearLibraryScores() {
  if (!canUseStorage()) return;
  localStorage.removeItem(KEY);
}
