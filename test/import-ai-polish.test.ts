import test from 'node:test';
import assert from 'node:assert/strict';

import {
  buildImportPolishMessage,
  getImportPolishSourceFormat,
  MAX_AUTO_IMPORT_POLISH_COMMANDS,
  shouldAcceptPolishedImportXml,
  shouldAutoApplyImportPolishCommands,
  shouldPolishImportedScore,
} from '../lib/import-ai-polish.ts';

const GP_XML = `<?xml version="1.0" encoding="UTF-8"?>
<score-partwise version="3.1">
  <part-list><score-part id="P1"><part-name>Guitar TAB</part-name></score-part></part-list>
  <part id="P1">
    <measure number="1">
      <attributes><staff-details><staff-type>tab</staff-type><staff-lines>6</staff-lines></staff-details></attributes>
      <note><pitch><step>E</step><octave>4</octave></pitch><duration>1</duration><notations><technical><string>1</string><fret>0</fret></technical></notations></note>
    </measure>
  </part>
</score-partwise>`;

test('import AI polish targets score formats but leaves MIDI to the MIDI reconstructor', () => {
  assert.equal(getImportPolishSourceFormat('riff.gp5'), 'gp');
  assert.equal(getImportPolishSourceFormat('score.mscz'), 'mscz');
  assert.equal(getImportPolishSourceFormat('lead.musicxml'), 'xml');
  assert.equal(shouldPolishImportedScore('gp'), true);
  assert.equal(shouldPolishImportedScore('pdf'), true);
  assert.equal(shouldPolishImportedScore('midi'), false);
});

test('import AI polish only auto-applies bounded layout cleanup batches', () => {
  assert.equal(shouldAutoApplyImportPolishCommands(0), false);
  assert.equal(shouldAutoApplyImportPolishCommands(MAX_AUTO_IMPORT_POLISH_COMMANDS), true);
  assert.equal(shouldAutoApplyImportPolishCommands(MAX_AUTO_IMPORT_POLISH_COMMANDS + 1), false);
});

test('Guitar Pro polish prompt preserves TAB fidelity instead of flattening to notation', () => {
  const message = buildImportPolishMessage('gp', 'riff.gp5');

  assert.match(message, /^\/layout-cleanup/);
  assert.match(message, /Preserve all TAB staves/i);
  assert.match(message, /string\/fret/i);
  assert.match(message, /Do not reduce/i);
});

test('Guitar Pro polish result is rejected if TAB or string-fret data disappears', () => {
  const withoutTab = GP_XML.replace(/<staff-type>tab<\/staff-type>/, '');
  const withoutFret = GP_XML.replace(/<fret>0<\/fret>/, '');

  assert.equal(shouldAcceptPolishedImportXml({ originalXml: GP_XML, polishedXml: GP_XML, format: 'gp' }), true);
  assert.equal(shouldAcceptPolishedImportXml({ originalXml: GP_XML, polishedXml: withoutTab, format: 'gp' }), false);
  assert.equal(shouldAcceptPolishedImportXml({ originalXml: GP_XML, polishedXml: withoutFret, format: 'gp' }), false);
});
