import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { describeSkippedPdfPages, parseInvalidAudiverisSheets } from '../lib/omr-partial-export';

// Shape of the Audiveris 5 console output for a PDF whose first page is a title page.
const AUDIVERIS_TITLE_PAGE_LOG = [
  'INFO  [input#1]            StepMonitoring 98   | LOAD',
  'INFO  [input#1]                 SheetStub 1278 | Loaded image #1 2480x3508 from /tmp/nex-note-1/input.pdf',
  'INFO  [input#1]                 SheetStub 1194 | Sheet input#1 flagged as invalid.',
  'WARN  [input#1]                      Book 2044 | Error processing stub',
  'INFO  [input#2]                 ScaleStep 65   | Scale{ interline(21,21,22) line(2,2,2) beam(11)}',
  'WARN  [input]                       CLI 956  | Exception occurred java.lang.Exception: Error in reaching step PAGE',
].join('\n');

test('a title page flagged by Audiveris is reported as sheet 1', () => {
  assert.deepEqual(parseInvalidAudiverisSheets(AUDIVERIS_TITLE_PAGE_LOG), [1]);
});

test('invalid sheets are collected once each, in page order', () => {
  const log = [
    'Sheet score#4 flagged as invalid.',
    'Sheet score#2 flagged as invalid.',
    'Sheet score#4 flagged as invalid.',
    'Sheet my-book-2026#10 flagged as invalid.',
  ].join('\n');
  assert.deepEqual(parseInvalidAudiverisSheets(log), [2, 4, 10]);
});

test('output without invalid sheets reports none', () => {
  assert.deepEqual(parseInvalidAudiverisSheets('INFO | Book{input} storing\nINFO | End of Book{input}'), []);
});

test('the warning names the skipped pages', () => {
  assert.equal(describeSkippedPdfPages([], 3), undefined);
  assert.match(describeSkippedPdfPages([1], 3)!, /^Page 1 of 3 has no staves \(for example a title page\) and was skipped\./);
  assert.match(describeSkippedPdfPages([1, 4, 5], 6)!, /^Pages 1, 4 and 5 of 6 have no staves .* and were skipped\./);
});

test('the PDF route exports the readable pages when Audiveris rejects a page without staves', () => {
  const route = readFileSync(new URL('../app/api/convert-pdf/route.ts', import.meta.url), 'utf8');
  assert.match(route, /parseInvalidAudiverisSheets\(/);
  assert.match(route, /describeSkippedPdfPages\(/);
  // The second Audiveris run exports the stored book instead of transcribing every page again.
  assert.match(route, /'-export',\s*'-output',\s*outDir,\s*'--',\s*bookPath/);
});
