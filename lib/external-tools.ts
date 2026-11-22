/**
 * External converters that some imports and exports need on the machine that runs the server
 * (the desktop app, or a developer build). When one is missing, routes answer with a typed
 * `missing_tool` error instead of a raw spawn failure, so the UI can say what to install.
 *
 * The messages are generic on purpose: they never name a developer-only path or the user's
 * documents, so they are safe to show and to log.
 */

export type ExternalToolId = 'musescore' | 'audiveris' | 'tesseract';

export const MISSING_TOOL_ERROR_CODE = 'missing_tool' as const;

export const EXTERNAL_TOOLS: Record<ExternalToolId, { name: string; downloadUrl: string }> = {
  musescore: { name: 'MuseScore 4', downloadUrl: 'https://musescore.org/download' },
  audiveris: { name: 'Audiveris', downloadUrl: 'https://github.com/Audiveris/audiveris/releases' },
  tesseract: { name: 'Tesseract OCR', downloadUrl: 'https://tesseract-ocr.github.io/tessdoc/Installation.html' },
};

const DEFAULT_MESSAGES: Record<ExternalToolId, string> = {
  musescore: 'This file type needs MuseScore 4 on this computer. Install it from https://musescore.org/download and try again.',
  audiveris: 'Reading notes from a PDF, photo or scan needs Audiveris on this computer. Install it from https://github.com/Audiveris/audiveris/releases and try again.',
  tesseract: 'Reading notes from a PDF, photo or scan needs Tesseract OCR for Audiveris. Install it (https://tesseract-ocr.github.io/tessdoc/Installation.html) and try again.',
};

export class MissingExternalToolError extends Error {
  readonly code = MISSING_TOOL_ERROR_CODE;
  readonly tool: ExternalToolId;
  readonly downloadUrl: string;

  constructor(tool: ExternalToolId, message = DEFAULT_MESSAGES[tool]) {
    super(message);
    this.name = 'MissingExternalToolError';
    this.tool = tool;
    this.downloadUrl = EXTERNAL_TOOLS[tool].downloadUrl;
  }
}

export function isMissingExternalToolError(error: unknown): error is MissingExternalToolError {
  return error instanceof MissingExternalToolError
    || (Boolean(error) && typeof error === 'object'
      && (error as { code?: unknown }).code === MISSING_TOOL_ERROR_CODE
      && typeof (error as { tool?: unknown }).tool === 'string'
      && (error as { tool: string }).tool in EXTERNAL_TOOLS);
}

export interface MissingToolPayload {
  error: string;
  code: typeof MISSING_TOOL_ERROR_CODE;
  tool: ExternalToolId;
  toolName: string;
  downloadUrl: string;
}

/** JSON body for a route response; only fixed, generic text — no paths, no file names. */
export function missingToolPayload(error: MissingExternalToolError): MissingToolPayload {
  return {
    error: DEFAULT_MESSAGES[error.tool],
    code: MISSING_TOOL_ERROR_CODE,
    tool: error.tool,
    toolName: EXTERNAL_TOOLS[error.tool].name,
    downloadUrl: EXTERNAL_TOOLS[error.tool].downloadUrl,
  };
}

/** HTTP status for a missing converter: the request was fine, a dependency is absent. */
export const MISSING_TOOL_HTTP_STATUS = 424;

/** Reads a route's JSON error body back on the client. */
export function readMissingToolPayload(value: unknown): MissingToolPayload | null {
  if (!value || typeof value !== 'object') return null;
  const raw = value as Partial<MissingToolPayload>;
  if (raw.code !== MISSING_TOOL_ERROR_CODE || typeof raw.tool !== 'string' || !(raw.tool in EXTERNAL_TOOLS)) return null;
  const tool = raw.tool as ExternalToolId;
  return {
    error: typeof raw.error === 'string' ? raw.error : DEFAULT_MESSAGES[tool],
    code: MISSING_TOOL_ERROR_CODE,
    tool,
    toolName: EXTERNAL_TOOLS[tool].name,
    downloadUrl: EXTERNAL_TOOLS[tool].downloadUrl,
  };
}
