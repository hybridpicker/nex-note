import { PDFDocument } from 'pdf-lib';

export type PdfImportPreflight =
  | { ok: true; pageCount: number }
  | { ok: false; reason: 'encrypted' | 'unreadable' | 'empty'; message: string };

/**
 * Looks at a PDF before optical music recognition runs, so a file that cannot work is refused with
 * a reason instead of a converter's exit code.
 */
export async function inspectPdfForImport(bytes: Uint8Array): Promise<PdfImportPreflight> {
  let document: PDFDocument;
  try {
    document = await PDFDocument.load(bytes, { updateMetadata: false });
  } catch (error) {
    const text = error instanceof Error ? `${error.name} ${error.message}` : String(error);
    if (/encrypt/i.test(text)) {
      return {
        ok: false,
        reason: 'encrypted',
        message: 'This PDF is password-protected. Remove the protection (for example Preview: File > Export as PDF without a password) and open it again.',
      };
    }
    return { ok: false, reason: 'unreadable', message: 'This file is not a readable PDF. It may be damaged or incomplete.' };
  }

  const pageCount = document.getPageCount();
  if (pageCount === 0) return { ok: false, reason: 'empty', message: 'This PDF has no pages.' };
  return { ok: true, pageCount };
}

/** Turns a converter failure into a sentence that says what is missing or what went wrong. */
export function describeOmrFailure(error: unknown): string {
  const raw = error instanceof Error ? error.message : String(error);
  if (/ENOENT|No such file or directory|not found|No Audiveris jars/i.test(raw)) {
    return 'Reading notes from a PDF or image needs Audiveris and Tesseract on this Mac (Audiveris.app in Applications, `brew install tesseract`). '
      + `The converter could not be started: ${lastLine(raw)}`;
  }
  if (/Could not resolve Tesseract/i.test(raw)) {
    return 'Reading notes from a PDF or image needs Tesseract. Install it with `brew install tesseract` or set AUDIVERIS_TESSERACT_PREFIX.';
  }
  if (/No \.mxl file was produced|Could not read output MXL/i.test(raw)) {
    return 'No music was recognized in this file. It may contain only text, or the scan is too small or too blurred; '
      + 'a scan with at least 300 dpi and straight staves works best.';
  }
  if (/SIGTERM|timed? ?out|signal SIG/i.test(raw)) {
    return 'Recognizing the music took too long and was stopped. Try fewer pages at a time.';
  }
  return `The music could not be recognized: ${lastLine(raw)}`;
}

function lastLine(text: string) {
  const lines = text.split('\n').map((line) => line.trim()).filter(Boolean);
  return (lines[lines.length - 1] ?? text).slice(0, 300);
}
