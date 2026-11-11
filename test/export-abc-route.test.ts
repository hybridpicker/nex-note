import assert from 'node:assert/strict';
import { chmodSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';

import { scoreXml, TREBLE } from './support/entry-fixtures.ts';

/*
 * F43 in docs/note-entry-mastery-ledger.md. The ABC export asks the MuseScore command line first and
 * falls back to Nex Note's own exporter. When that program hangs (it does on this machine in some
 * runs), the export used to wait 60 s for it; the browser test of the download ran out of time.
 */

test('F43: a hanging MuseScore command line does not hold the ABC export; the built-in exporter answers', async () => {
  const directory = mkdtempSync(join(tmpdir(), 'nex-abc-test-'));
  const hangingCli = join(directory, 'mscore');
  writeFileSync(hangingCli, '#!/bin/sh\nsleep 25\n');
  chmodSync(hangingCli, 0o755);
  const previous = { cli: process.env.MUSESCORE_CLI, timeout: process.env.NEX_ABC_CLI_TIMEOUT_MS };
  process.env.MUSESCORE_CLI = hangingCli;
  process.env.NEX_ABC_CLI_TIMEOUT_MS = '1500';
  try {
    const { POST } = await import('../app/api/export-abc/route.ts');
    const xml = scoreXml({
      beats: 4, beatType: 4, measures: 1,
      parts: [{ ...TREBLE, content: { '1:1': '<note><pitch><step>C</step><octave>5</octave></pitch><duration>16</duration><voice>1</voice><type>whole</type></note>' } }],
    });
    const started = Date.now();
    const response = await POST({ json: async () => ({ xml, filename: 'tune.musicxml' }) } as never);
    const elapsed = Date.now() - started;
    assert.equal(response.status, 200);
    assert.match(await response.text(), /^X:/m, 'an ABC tune comes back');
    assert.ok(elapsed < 10_000, `answered after ${elapsed} ms`);
  } finally {
    if (previous.cli == null) delete process.env.MUSESCORE_CLI; else process.env.MUSESCORE_CLI = previous.cli;
    if (previous.timeout == null) delete process.env.NEX_ABC_CLI_TIMEOUT_MS; else process.env.NEX_ABC_CLI_TIMEOUT_MS = previous.timeout;
    rmSync(directory, { recursive: true, force: true });
  }
});
