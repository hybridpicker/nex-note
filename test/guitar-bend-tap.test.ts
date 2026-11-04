import test from 'node:test';
import assert from 'node:assert/strict';

import { importMusicXmlToCore } from '../src/musicxml-adapter/import/import-musicxml.ts';
import { exportCoreToMusicXml } from '../src/musicxml-adapter/export/export-core-to-musicxml.ts';
import { applyDocumentCommands, buildDocumentState } from '../src/score-core/commands/apply-document-commands.ts';

const tabNote = (technical: string) => `<?xml version="1.0" encoding="UTF-8"?>
<score-partwise version="4.0"><part-list><score-part id="P1"><part-name>Guitar</part-name></score-part></part-list><part id="P1">
<measure number="1"><attributes><divisions>1</divisions><time><beats>4</beats><beat-type>4</beat-type></time><clef><sign>G</sign><line>2</line></clef></attributes>
<note><pitch><step>A</step><octave>3</octave></pitch><duration>4</duration><voice>1</voice><type>whole</type><notations><technical><string>3</string><fret>2</fret>${technical}</technical></notations></note>
</measure></part></score-partwise>`;
const STANDARD_NOTE = `<?xml version="1.0" encoding="UTF-8"?>
<score-partwise version="4.0"><part-list><score-part id="P1"><part-name>Guitar</part-name></score-part></part-list><part id="P1">
<measure number="1"><attributes><divisions>1</divisions><time><beats>4</beats><beat-type>4</beat-type></time><clef><sign>G</sign><line>2</line></clef></attributes>
<note><pitch><step>A</step><octave>3</octave></pitch><duration>4</duration><voice>1</voice><type>whole</type></note>
</measure></part></score-partwise>`;
const locator = { measureNumber: 1, staffIndex: 1, voiceId: 1, timestampNum: 0, timestampDen: 4 };

test('an imported full-step bend keeps its bend-alter', () => {
  const xml = tabNote('<bend><bend-alter>2</bend-alter></bend>');
  assert.match(exportCoreToMusicXml(xml, importMusicXmlToCore(xml)), /<bend><bend-alter>2<\/bend-alter><\/bend>/);
});

test('addGuitarBend writes the requested semitones', () => {
  const result = applyDocumentCommands(buildDocumentState(tabNote('')), [{ type: 'addGuitarBend', ...locator, bendSemitones: 2 } as never]);
  assert.match(result.xml, /<bend><bend-alter>2<\/bend-alter><\/bend>/);
});

test('addGuitarTap writes <tap/>, not a hammer-on', () => {
  const result = applyDocumentCommands(buildDocumentState(tabNote('')), [{ type: 'addGuitarTap', ...locator } as never]);
  assert.match(result.xml, /<tap\/>/);
  assert.doesNotMatch(result.xml, /<hammer-on/);
  assert.match(exportCoreToMusicXml(result.xml, importMusicXmlToCore(result.xml)), /<tap\/>/);
});

test('bend and tap on a note without TAB data are rejected without inventing a string and fret', () => {
  for (const command of [{ type: 'addGuitarBend', ...locator, bendSemitones: 1 }, { type: 'addGuitarTap', ...locator }]) {
    const state = buildDocumentState(STANDARD_NOTE);
    const result = applyDocumentCommands(state, [command as never]);
    assert.equal(result.xml, state.xml, command.type);
    assert.ok(result.diagnostics.some((entry) => entry.code === 'guitar_command_rejected'), command.type);
  }
});
