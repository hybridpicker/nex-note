import test from 'node:test';
import assert from 'node:assert/strict';

import {
  MISSING_TOOL_ERROR_CODE,
  MissingExternalToolError,
  isMissingExternalToolError,
  missingToolPayload,
  readMissingToolPayload,
} from '@/lib/external-tools';
import { resolveMuseScoreCli } from '@/lib/musescore-cli';
import { allowRemoteSoundfontFallback } from '@/lib/soundfont-source';
import { translate } from '@/lib/i18n';

test('a missing MuseScore is a typed error with a generic message and the official download page', () => {
  let caught: unknown;
  try {
    resolveMuseScoreCli({ NODE_ENV: 'test', PATH: '/definitely/missing/bin', MUSESCORE_CLI: '/definitely/missing/mscore' });
  } catch (error) {
    caught = error;
  }
  // The machine running the tests may have MuseScore in a common install path.
  if (caught === undefined) return;
  assert.equal(isMissingExternalToolError(caught), true);
  const payload = missingToolPayload(caught as MissingExternalToolError);
  assert.equal(payload.code, MISSING_TOOL_ERROR_CODE);
  assert.equal(payload.tool, 'musescore');
  assert.equal(payload.downloadUrl, 'https://musescore.org/download');
  assert.match(payload.error, /MuseScore 4/);
  assert.doesNotMatch(payload.error, /\/definitely|Coding\/musescore|\$HOME/);
});

test('missing-tool payloads round-trip to the client and translate in EN and DE', () => {
  for (const tool of ['musescore', 'audiveris', 'tesseract'] as const) {
    const payload = missingToolPayload(new MissingExternalToolError(tool));
    const read = readMissingToolPayload(JSON.parse(JSON.stringify(payload)));
    assert.ok(read);
    assert.equal(read!.tool, tool);
    assert.match(read!.downloadUrl, /^https:\/\//);
    assert.doesNotMatch(payload.error, /\/Users\/|\/home\/|Coding\/musescore|input\.|\.pdf/);
  }
  assert.equal(readMissingToolPayload({ error: 'boom' }), null);
  assert.equal(readMissingToolPayload({ code: 'missing_tool', tool: 'rm -rf' }), null);

  const values = { tool: 'Audiveris', url: 'https://github.com/Audiveris/audiveris/releases' };
  assert.match(translate('en', 'import.missingTool', values), /Audiveris is needed.*github\.com\/Audiveris/);
  assert.match(translate('de', 'import.missingTool', values), /wird Audiveris benötigt/);
});

test('remote soundfont fallback is off in the desktop app and on elsewhere', () => {
  assert.equal(allowRemoteSoundfontFallback({ nexNoteElectron: { isElectron: true } }), false);
  assert.equal(allowRemoteSoundfontFallback({}), true);
  assert.equal(allowRemoteSoundfontFallback(undefined), true);
});

test('Connect AI strings exist in EN and DE, including the Browser Preview relay notice', () => {
  assert.equal(
    translate('en', 'connectAi.browserPreviewNotice', { provider: 'OpenAI' }),
    'Your key and the score you send go through nex-note.com to OpenAI. Nothing is stored.',
  );
  assert.match(translate('de', 'connectAi.browserPreviewNotice', { provider: 'OpenAI' }), /über nex-note\.com an OpenAI/);
  assert.equal(translate('de', 'connectAi.useForSession'), 'Für diese Sitzung verwenden');
});

test('convert-pdf: a photo import without Audiveris answers a typed 424 that names no file or path', async () => {
  process.env.PDF_TO_MUSESCORE_SCRIPT = '/definitely/missing/pdf-to-musescore.sh';
  process.env.AUDIVERIS_JAVA = '/definitely/missing/java';
  process.env.AUDIVERIS_APP_DIR = '/definitely/missing/app';
  const { POST } = await import('@/app/api/convert-pdf/route');
  const { NextRequest } = await import('next/server');
  const form = new FormData();
  form.append('file', new File([new Uint8Array([0x89, 0x50, 0x4e, 0x47])], 'my-private-scan.png', { type: 'image/png' }));
  const warnings: unknown[][] = [];
  const originalWarn = console.warn;
  console.warn = (...args: unknown[]) => { warnings.push(args); };
  try {
    const response = await POST(new NextRequest('http://localhost/api/convert-pdf', { method: 'POST', body: form }));
    assert.equal(response.status, 424);
    const body = await response.json();
    assert.equal(body.code, 'missing_tool');
    assert.equal(body.tool, 'audiveris');
    assert.doesNotMatch(JSON.stringify(body), /my-private-scan|definitely/);
    assert.doesNotMatch(JSON.stringify(warnings), /my-private-scan|definitely/);
  } finally {
    console.warn = originalWarn;
  }
});
