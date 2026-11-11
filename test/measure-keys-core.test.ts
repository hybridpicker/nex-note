import assert from 'node:assert/strict';
import test from 'node:test';

import { applyDocumentCommands, buildDocumentState } from '../src/score-core/commands/apply-document-commands.ts';
import { importMusicXmlToCore } from '../src/musicxml-adapter/import/import-musicxml.ts';
import { validateScoreDocument } from '../src/score-core/validation/validate-score-document.ts';
import type { ScoreCommand } from '../src/shared/schemas/score-command.ts';
import { PIANO, TREBLE, scoreXml } from './support/entry-fixtures.ts';
import { summarizeScore } from './support/score-summary.ts';

/*
 * K8 in docs/note-entry-mastery-ledger.md: bars are inserted before the selection, appended at the end
 * and deleted (MuseScore `insert-measure` Ins, `append-measure` Ctrl+B, `time-delete` Ctrl+Del on
 * selected measures). The clef, key and time signature of the score stay at its first bar whatever
 * happens to the bar that carried them.
 */

const quarters = (steps: string) => steps.split('').map((step) => (
  `<note><pitch><step>${step}</step><octave>4</octave></pitch><duration>4</duration><voice>1</voice><type>quarter</type></note>`
)).join('');
const THREE = scoreXml({
  beats: 4, beatType: 4, measures: 3, fifths: 2,
  parts: [{ ...TREBLE, content: { '1:1': quarters('CDEF'), '2:1': quarters('GABC'), '3:1': quarters('DEFG') } }],
});

function run(xml: string, commands: ScoreCommand[]) {
  const result = applyDocumentCommands(buildDocumentState(xml), commands);
  // The stored file is what import and export give back, and the document is valid.
  assert.equal(buildDocumentState(result.xml).xml, result.xml, 'the result is a fixed point of import and export');
  assert.deepEqual(validateScoreDocument(importMusicXmlToCore(result.xml)).filter((issue) => issue.level === 'error'), []);
  return { lines: summarizeScore(result.xml), rejected: result.diagnostics.filter((entry) => entry.code.endsWith('_rejected')), xml: result.xml };
}
const firstNotes = (lines: string[]) => lines.filter((line) => / v1 @0 /.test(line));
const attributes = (lines: string[]) => lines.filter((line) => / (key|time|clef) /.test(line));

test('K8: a bar is inserted before a bar, and the music from there on moves one bar later', () => {
  const { lines } = run(THREE, [{ type: 'insertMeasureBefore', measureNumber: 2 } as ScoreCommand]);
  assert.deepEqual(firstNotes(lines), ['m1 v1 @0 C4 quarter', 'm3 v1 @0 G4 quarter', 'm4 v1 @0 D4 quarter']);
  assert.deepEqual(attributes(lines), ['m1 key 2', 'm1 time 4/4', 'm1 clef G2']);
});

test('K8: a bar inserted before bar 1 takes over clef, key and time signature', () => {
  const { lines } = run(THREE, [{ type: 'insertMeasureBefore', measureNumber: 1 } as ScoreCommand]);
  assert.deepEqual(firstNotes(lines), ['m2 v1 @0 C4 quarter', 'm3 v1 @0 G4 quarter', 'm4 v1 @0 D4 quarter']);
  assert.deepEqual(attributes(lines), ['m1 key 2', 'm1 time 4/4', 'm1 clef G2']);
});

test('K8: deleting bar 1 leaves clef, key and time signature on the new first bar', () => {
  const { lines } = run(THREE, [{ type: 'deleteMeasure', measureNumber: 1 }]);
  assert.deepEqual(firstNotes(lines), ['m1 v1 @0 G4 quarter', 'm2 v1 @0 D4 quarter']);
  assert.deepEqual(attributes(lines), ['m1 key 2', 'm1 time 4/4', 'm1 clef G2']);
});

test('K8: deleting a bar in the middle closes the gap on every staff', () => {
  const piano = scoreXml({ beats: 3, beatType: 4, measures: 3, parts: [{ ...PIANO, content: { '1:1': quarters('CDE'), '2:1': quarters('FGA'), '3:1': quarters('BCD') } }] });
  const { lines } = run(piano, [{ type: 'deleteMeasure', measureNumber: 2 }]);
  assert.deepEqual(firstNotes(lines), ['s1 m1 v1 @0 C4 quarter', 's1 m2 v1 @0 B4 quarter']);
  assert.equal(lines.filter((line) => /^s2 m3/.test(line)).length, 0, 'the lower staff has two bars as well');
});

test('K8: the only bar of a score is not deleted', () => {
  const one = scoreXml({ beats: 4, beatType: 4, measures: 1, parts: [{ ...TREBLE, content: { '1:1': quarters('CDEF') } }] });
  const result = run(one, [{ type: 'deleteMeasure', measureNumber: 1 }]);
  assert.equal(result.rejected.length, 1);
  assert.deepEqual(firstNotes(result.lines), ['m1 v1 @0 C4 quarter']);
});

test('K8: a bar is appended at the end', () => {
  const { lines, xml } = run(THREE, [{ type: 'insertMeasureAfter', measureNumber: 3 }]);
  assert.deepEqual(firstNotes(lines), ['m1 v1 @0 C4 quarter', 'm2 v1 @0 G4 quarter', 'm3 v1 @0 D4 quarter']);
  assert.equal((xml.match(/<measure /g) ?? []).length, 4);
});

const PICKUP = '<?xml version="1.0" encoding="UTF-8"?>\n<score-partwise version="4.0"><part-list><score-part id="P1"><part-name>Oboe</part-name></score-part></part-list><part id="P1">'
  + '<measure number="0" implicit="yes"><attributes><divisions>4</divisions><key><fifths>-1</fifths></key><time><beats>3</beats><beat-type>4</beat-type></time><clef><sign>G</sign><line>2</line></clef></attributes>'
  + '<note><pitch><step>C</step><octave>5</octave></pitch><duration>4</duration><voice>1</voice><type>quarter</type></note></measure>'
  + `<measure number="1">${quarters('FGA')}</measure><measure number="2">${quarters('GAB')}</measure></part></score-partwise>`;

test('K8: a bar inserted after a pickup is a full bar; none is inserted before the pickup', () => {
  const before = run(PICKUP, [{ type: 'insertMeasureBefore', measureNumber: 1 } as ScoreCommand]);
  assert.equal(before.rejected.length, 1);
  assert.match(before.rejected[0]!.message, /pickup/);
  const { lines, xml } = run(PICKUP, [{ type: 'insertMeasureBefore', measureNumber: 2 } as ScoreCommand]);
  assert.deepEqual(firstNotes(lines), ['m1 v1 @0 C5 quarter', 'm3 v1 @0 F4 quarter', 'm4 v1 @0 G4 quarter']);
  assert.ok(lines.includes('m1 pickup'));
  assert.equal(lines.filter((line) => / pickup$/.test(line)).length, 1, 'only the pickup is a pickup');
  assert.match(xml, /<measure number="2"><note><rest\/><duration>12<\/duration>/, 'the new bar is a whole bar of three quarters, and repeats no clef, key or time signature');
});

test('K8: a tie that ran into a deleted bar ends, and the key change of a deleted bar stays with the music after it', () => {
  const tied = (step: string, tie: 'start' | 'stop') => `<note><pitch><step>${step}</step><octave>4</octave></pitch><duration>16</duration>${tie === 'start' ? '<tie type="start"/>' : '<tie type="stop"/>'}<voice>1</voice><type>whole</type><notations><tied type="${tie}"/></notations></note>`;
  const score = scoreXml({
    beats: 4, beatType: 4, measures: 3,
    parts: [{ ...TREBLE, content: { '1:1': tied('C', 'start'), '2:1': `<attributes><key><fifths>3</fifths></key></attributes>${tied('C', 'stop')}`, '3:1': quarters('DEFG') } }],
  });
  const { lines } = run(score, [{ type: 'deleteMeasure', measureNumber: 2 }]);
  assert.deepEqual(lines.filter((line) => / v1 @0 /.test(line)), ['m1 v1 @0 C4 whole', 'm2 v1 @0 D4 quarter']);
  assert.deepEqual(lines.filter((line) => / key /.test(line)), ['m1 key 0', 'm2 key 3']);
});
