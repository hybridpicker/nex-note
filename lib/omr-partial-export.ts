/**
 * Audiveris refuses a whole multi-page book when one sheet has no staves (a title page, a page of
 * text). The pages it did read are still in its book file, so the route exports those and says which
 * pages were left out.
 */

const INVALID_SHEET_PATTERN = /Sheet \S*?#(\d+) flagged as invalid/g;

/** Sheet numbers (1-based) that Audiveris flagged as invalid in its console output. */
export function parseInvalidAudiverisSheets(output: string): number[] {
  const sheets = new Set<number>();
  for (const match of output.matchAll(INVALID_SHEET_PATTERN)) {
    const sheet = Number(match[1]);
    if (Number.isInteger(sheet) && sheet > 0) sheets.add(sheet);
  }
  return [...sheets].sort((left, right) => left - right);
}

/** One sentence for the import warning, or undefined when no page was skipped. */
export function describeSkippedPdfPages(skippedPages: number[], pageCount: number): string | undefined {
  if (skippedPages.length === 0) return undefined;
  const pages = skippedPages.length === 1
    ? `Page ${skippedPages[0]}`
    : `Pages ${skippedPages.slice(0, -1).join(', ')} and ${skippedPages[skippedPages.length - 1]}`;
  const of = pageCount > 0 ? ` of ${pageCount}` : '';
  const verb = skippedPages.length === 1 ? 'has' : 'have';
  const skipped = skippedPages.length === 1 ? 'was' : 'were';
  return `${pages}${of} ${verb} no staves (for example a title page) and ${skipped} skipped. `
    + 'Check the imported score against the original.';
}
