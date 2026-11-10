import assert from 'node:assert/strict';
import test from 'node:test';

import { buildDocumentState } from '../src/score-core/commands/apply-document-commands.ts';
import { mountApp } from './support/app-harness.ts';
import { selectableNotes } from './support/entry-harness.ts';
import { FUZZ_FIXTURES } from './support/entry-fuzz.ts';

/*
 * F14 (docs/note-entry-mastery-ledger.md): after an entry in voice 2 the exporter wrote a <backup>
 * with no voice after it. A re-export dropped it, so the stored file changed on the next unrelated
 * edit. The stored XML must be a fixed point of import and export.
 */

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

test('F14: the stored XML after a voice-2 entry is byte-identical after a re-export', () => {
  const app = mountApp(buildDocumentState(FUZZ_FIXTURES['single staff']!()).xml);
  try {
    const notes = selectableNotes(app.xml);
    app.click(notes[918 % notes.length]!);
    app.press('Cmd+Alt+2 f');
    assert.equal(buildDocumentState(app.xml).xml, app.xml);
    assert.doesNotMatch(app.xml, /<\/backup>\s*<\/measure>/, 'no <backup> without a voice after it');
  } finally {
    app.unmount();
  }
});
