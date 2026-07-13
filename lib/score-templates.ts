import type { NewScoreTemplate } from '@/lib/new-score';
import type { ScoreDocumentModel } from '@/src/score-core/model/types';

export type ScoreTemplateSource = 'built-in' | 'local';
export type UserScoreTemplateFormat = 'musicxml' | 'nxn';

export interface BuiltInScoreTemplate extends NewScoreTemplate {
  source: 'built-in';
}

export interface UserScoreTemplate {
  id: string;
  source: 'local';
  name: string;
  category: string;
  description: string;
  filename: string;
  format: UserScoreTemplateFormat;
  private: boolean;
  sourceLabel?: string;
  sampleBank?: UserTemplateSampleBank;
}

export interface UserTemplateSampleBankPart {
  partNames: string[];
  samples: Record<string, string>;
}

export interface UserTemplateSampleBank {
  directory: string;
  scoreTitle?: string;
  parts: UserTemplateSampleBankPart[];
}

export interface UserTemplateFileCandidate {
  filename: string;
  sourceLabel?: string;
}

export interface UserTemplateIndexFile {
  sourceLabel?: string;
  text: string;
}

export interface UserTemplateFilePayload extends UserTemplateFileCandidate {
  content: string;
}

export interface ElectronUserTemplateFolderPayload {
  sourceLabel?: string;
  files: UserTemplateFilePayload[];
  indexText?: string;
}

type TemplateIndexEntry = {
  id?: unknown;
  name?: unknown;
  category?: unknown;
  description?: unknown;
  filename?: unknown;
  musicxml?: unknown;
  nxn?: unknown;
  private?: unknown;
  sampleBank?: unknown;
};

const TEMPLATE_FILE_PATTERN = /\.(musicxml|nxn)$/i;
const SAMPLE_FILE_PATTERN = /\.(wav|aif|aiff|mp3|m4a|ogg|flac)$/i;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function normalizeWhitespace(value: string) {
  return value.replace(/\s+/g, ' ').trim();
}

function normalizePitchName(value: string) {
  const match = value.trim().match(/^([A-Ga-g])([#b]?)(-?\d+)$/);
  return match ? `${match[1].toUpperCase()}${match[2]}${match[3]}` : null;
}

function normalizeSafePathSegment(value: unknown, pattern?: RegExp) {
  if (typeof value !== 'string') return null;
  const segment = value.trim();
  if (!segment || segment === '.' || segment === '..' || segment.includes('/') || segment.includes('\\')) return null;
  if (pattern && !pattern.test(segment)) return null;
  return segment;
}

function normalizeTemplateSampleBankPart(value: unknown): UserTemplateSampleBankPart | null {
  if (!isRecord(value) || !Array.isArray(value.partNames) || !isRecord(value.samples)) return null;
  const partNames = value.partNames
    .filter((name): name is string => typeof name === 'string')
    .map(normalizeWhitespace)
    .filter(Boolean);
  const samples = Object.entries(value.samples).reduce<Record<string, string>>((result, [pitch, filename]) => {
    const normalizedPitch = normalizePitchName(pitch);
    const normalizedFilename = normalizeSafePathSegment(filename, SAMPLE_FILE_PATTERN);
    if (normalizedPitch && normalizedFilename) result[normalizedPitch] = normalizedFilename;
    return result;
  }, {});
  if (partNames.length === 0 || Object.keys(samples).length === 0) return null;
  return { partNames: [...new Set(partNames)], samples };
}

function normalizeTemplateSampleBank(value: unknown): UserTemplateSampleBank | undefined {
  if (!isRecord(value) || !Array.isArray(value.parts)) return undefined;
  const directory = normalizeSafePathSegment(value.directory);
  if (!directory) return undefined;
  const parts = value.parts
    .map(normalizeTemplateSampleBankPart)
    .filter((part): part is UserTemplateSampleBankPart => Boolean(part));
  if (parts.length === 0) return undefined;
  const scoreTitle = typeof value.scoreTitle === 'string' && value.scoreTitle.trim()
    ? normalizeWhitespace(value.scoreTitle)
    : undefined;
  return { directory, scoreTitle, parts };
}

function slugify(value: string) {
  const slug = value
    .normalize('NFKD')
    .replace(/[^\w\s.-]/g, '')
    .replace(/[_\s.]+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '')
    .toLowerCase();
  return slug || 'template';
}

function extensionForFilename(filename: string): UserScoreTemplateFormat | null {
  const match = filename.trim().match(/\.([^.]+)$/);
  if (!match) return null;
  const ext = match[1].toLowerCase();
  if (ext === 'musicxml') return 'musicxml';
  if (ext === 'nxn') return 'nxn';
  return null;
}

export function deriveTemplateNameFromFilename(filename: string) {
  const stem = filename.replace(/\.[^.]+$/, '');
  return normalizeWhitespace(stem.replace(/[-_]+/g, ' ')) || 'Untitled template';
}

function normalizeTemplateFilename(value: unknown) {
  if (typeof value !== 'string') return null;
  const filename = value.trim();
  if (!filename || filename.includes('/') || filename.includes('\\')) return null;
  return TEMPLATE_FILE_PATTERN.test(filename) ? filename : null;
}

function buildIndexedTemplate(entry: TemplateIndexEntry, files: Set<string>, sourceLabel?: string): UserScoreTemplate | null {
  const preferredFilename = normalizeTemplateFilename(entry.filename)
    ?? normalizeTemplateFilename(entry.musicxml)
    ?? normalizeTemplateFilename(entry.nxn);
  if (!preferredFilename || !files.has(preferredFilename)) return null;

  const format = extensionForFilename(preferredFilename);
  if (!format) return null;

  const name = typeof entry.name === 'string' && entry.name.trim()
    ? normalizeWhitespace(entry.name)
    : deriveTemplateNameFromFilename(preferredFilename);
  const id = typeof entry.id === 'string' && entry.id.trim()
    ? slugify(entry.id)
    : slugify(`${sourceLabel ?? 'local'}-${name}-${preferredFilename}`);
  const category = typeof entry.category === 'string' && entry.category.trim()
    ? normalizeWhitespace(entry.category)
    : 'Local';
  const description = typeof entry.description === 'string' && entry.description.trim()
    ? normalizeWhitespace(entry.description)
    : `${format === 'nxn' ? 'Nex Note project' : 'MusicXML score'} template.`;

  const sampleBank = normalizeTemplateSampleBank(entry.sampleBank);
  return {
    id,
    source: 'local',
    name,
    category,
    description,
    filename: preferredFilename,
    format,
    private: entry.private === true,
    sourceLabel,
    ...(sampleBank ? { sampleBank } : {}),
  };
}

export function parseUserTemplateIndex(indexText: string, candidates: UserTemplateFileCandidate[], sourceLabel?: string) {
  const availableFiles = new Set(candidates.map((file) => file.filename));
  let parsed: unknown;
  try {
    parsed = JSON.parse(indexText);
  } catch {
    return [];
  }
  if (!isRecord(parsed) || !Array.isArray(parsed.templates)) return [];

  const templates = parsed.templates
    .map((entry) => isRecord(entry) ? buildIndexedTemplate(entry, availableFiles, sourceLabel) : null)
    .filter((template): template is UserScoreTemplate => Boolean(template));
  return dedupeUserTemplates(templates);
}

export function detectUserTemplatesFromFiles(candidates: UserTemplateFileCandidate[], sourceLabel?: string) {
  const templates = candidates
    .map((candidate): UserScoreTemplate | null => {
      const filename = normalizeTemplateFilename(candidate.filename);
      if (!filename) return null;
      const format = extensionForFilename(filename);
      if (!format) return null;
      const name = deriveTemplateNameFromFilename(filename);
      return {
        id: slugify(`${sourceLabel ?? 'local'}-${filename}`),
        source: 'local',
        name,
        category: 'Local',
        description: `${format === 'nxn' ? 'Nex Note project' : 'MusicXML score'} template.`,
        filename,
        format,
        private: true,
        sourceLabel: candidate.sourceLabel ?? sourceLabel,
      };
    })
    .filter((template): template is UserScoreTemplate => Boolean(template));
  return dedupeUserTemplates(templates);
}

export function normalizeUserTemplatesFromFolder(payload: ElectronUserTemplateFolderPayload) {
  const candidates = payload.files.map((file) => ({
    filename: file.filename,
    sourceLabel: file.sourceLabel ?? payload.sourceLabel,
  }));
  const indexed = payload.indexText
    ? parseUserTemplateIndex(payload.indexText, candidates, payload.sourceLabel)
    : [];
  const indexedFilenames = new Set(indexed.map((template) => template.filename));
  const fallback = detectUserTemplatesFromFiles(
    candidates.filter((candidate) => !indexedFilenames.has(candidate.filename)),
    payload.sourceLabel,
  );
  return dedupeUserTemplates([...indexed, ...fallback]);
}

export function dedupeUserTemplates(templates: UserScoreTemplate[]) {
  const seen = new Set<string>();
  return templates.filter((template) => {
    const key = `${template.id}:${template.filename}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

export function buildTemplateCategories(templates: Array<NewScoreTemplate | UserScoreTemplate>) {
  return ['All', ...new Set(templates.map((template) => template.category))];
}

function normalizedMatchText(value: string | null | undefined) {
  return normalizeWhitespace(value ?? '').toLocaleLowerCase();
}

export function findUserTemplateForSamplePlayback(
  templates: UserScoreTemplate[],
  document: ScoreDocumentModel | null | undefined,
) {
  const scoreTitle = normalizedMatchText(document?.metadata.title);
  if (!scoreTitle) return null;
  const documentPartNames = new Set((document?.score.parts ?? []).flatMap((part) => (
    [part.name, part.instrumentName].map(normalizedMatchText).filter(Boolean)
  )));

  return templates.find((template) => {
    const sampleBank = template.sampleBank;
    if (!sampleBank) return false;
    if (normalizedMatchText(sampleBank.scoreTitle ?? template.name) !== scoreTitle) return false;
    return sampleBank.parts.some((part) => (
      part.partNames.some((name) => documentPartNames.has(normalizedMatchText(name)))
    ));
  }) ?? null;
}
