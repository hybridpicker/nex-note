import assert from 'node:assert/strict';
import test from 'node:test';

import { applyDocumentCommands, buildDocumentState } from '../src/score-core/commands/apply-document-commands.ts';
import type { ScoreCommand } from '../src/shared/schemas/score-command.ts';
import { BASS, CLARINET_BB, PIANO, TREBLE, scoreXml } from './support/entry-fixtures.ts';
import { summarizeScore } from './support/score-summary.ts';

/*
 * What the inline-entry popover needs from the core (K4, K5 in docs/note-entry-mastery-ledger.md): a
 * key or repeat at the bar of the cursor, a clef change in one part, a lyric with a melisma line.
 * Each result must survive the export to MusicXML and the import back.
 */

const quarters = (steps: string) => steps.split('').map((step) => (
  `<note><pitch><step>${step}</step><octave>4</octave></pitch><duration>4</duration><voice>1</voice><type>quarter</type></note>`
)).join('');

function run(xml: string, commands: ScoreCommand[]) {
  const result = applyDocumentCommands(buildDocumentState(xml), commands);
  const rejected = result.diagnostics.filter((diagnostic) => diagnostic.code.endsWith('_rejected') || diagnostic.level === 'error');
  assert.deepEqual(rejected, [], 'the commands are accepted');
  // The summary reads the stored XML: what it shows has been exported and imported again.
  return summarizeScore(result.xml);
}

test('K5: a key signature can start at any bar and holds from there', () => {
  const xml = scoreXml({ beats: 4, beatType: 4, measures: 12, parts: [{ ...TREBLE }] });
  const lines = run(xml, [{ type: 'setKey', fifths: 2, measureNumber: 9 } as ScoreCommand]);
  assert.ok(lines.includes('m1 key 0'), 'bar 1 keeps its key');
  assert.ok(lines.includes('m9 key 2'), 'bar 9 changes to two sharps');
  assert.equal(lines.filter((line) => / key /.test(line)).length, 2);
});

test('K5: without a bar the key still applies to the whole score from bar 1', () => {
  const xml = scoreXml({ beats: 4, beatType: 4, measures: 4, parts: [{ ...TREBLE }] });
  const lines = run(xml, [{ type: 'setKey', fifths: -3 }]);
  assert.deepEqual(lines.filter((line) => / key /.test(line)), ['m1 key -3']);
});

test('K5: a start repeat can stand at any bar', () => {
  const xml = scoreXml({ beats: 4, beatType: 4, measures: 8, parts: [{ ...TREBLE }] });
  const lines = run(xml, [{ type: 'addStartRepeat', measureNumber: 5 } as ScoreCommand, { type: 'addEndRepeat', measureNumber: 8 }]);
  assert.ok(lines.includes('m5 left repeat-start'));
  assert.ok(!lines.includes('m1 left repeat-start'));
  assert.ok(lines.includes('m8 right repeat-end'));
});

test('K5: a clef change belongs to one part and one staff', () => {
  const xml = scoreXml({ beats: 4, beatType: 4, measures: 6, parts: [{ ...TREBLE }, { ...CLARINET_BB }, { ...BASS, id: 'P3' }] });
  const lines = run(xml, [{ type: 'setClef', sign: 'C', line: 4, measureNumber: 3, staffIndex: 1, corePartId: 'part:P3' } as ScoreCommand]);
  assert.ok(lines.includes('P3 m3 clef C4'), 'the cello changes to tenor clef in bar 3');
  assert.deepEqual(lines.filter((line) => / clef /.test(line)).sort(), ['P1 m1 clef G2', 'P2 m1 clef G2', 'P3 m1 clef F4', 'P3 m3 clef C4']);

  const piano = scoreXml({ beats: 3, beatType: 4, measures: 4, parts: [{ ...PIANO }] });
  const pianoLines = run(piano, [{ type: 'setClef', sign: 'G', line: 2, measureNumber: 2, staffIndex: 2, corePartId: 'part:P1' } as ScoreCommand]);
  assert.ok(pianoLines.includes('s2 m2 clef G2'));
  assert.ok(!pianoLines.some((line) => line.startsWith('s1 m2 clef')));
});

test('K4: a syllable can carry a melisma line that ends on a later note', () => {
  const xml = scoreXml({ beats: 4, beatType: 4, measures: 1, parts: [{ ...TREBLE, content: { '1:1': quarters('CDEF') } }] });
  const at = (beat: number) => ({ measureNumber: 1, staffIndex: 1, voiceId: 1, timestampNum: beat, timestampDen: 4 });
  const lines = run(xml, [
    { type: 'setLyricLine', verseNumber: 1, text: 'sea', syllabic: 'single', extend: 'start', ...at(0) } as ScoreCommand,
    { type: 'setLyricLine', verseNumber: 1, text: '', extend: 'stop', ...at(1) } as ScoreCommand,
    { type: 'setLyricLine', verseNumber: 1, text: 'and', syllabic: 'single', ...at(2) },
  ]);
  assert.deepEqual(lines.filter((line) => line.startsWith('lyric')), [
    'lyric 1 C4@m1:0 "sea" single extend:start',
    'lyric 1 D4@m1:1 "" single extend:stop',
    'lyric 1 E4@m1:2 "and" single',
  ]);
});

test('K5: staff text can stand on any beat of its bar', () => {
  const xml = scoreXml({ beats: 4, beatType: 4, measures: 2, parts: [{ ...TREBLE, content: { '2:1': quarters('CDEF') } }] });
  const lines = run(xml, [{ type: 'addWords', text: 'pizz.', measureNumber: 2, staffIndex: 1, placement: 'above', timestampNum: 2, timestampDen: 4 } as ScoreCommand]);
  assert.ok(lines.includes('m2 @2 words pizz.'), lines.filter((line) => /words/.test(line)).join(' | '));
});

test('F52: a tempo mark with a word and a metronome number keeps both', () => {
  const xml = scoreXml({ beats: 4, beatType: 4, measures: 2, parts: [{ ...TREBLE }] });
  const both = run(xml, [{ type: 'addTempoText', text: 'Allegro ♩ = 120', measureNumber: 1, bpm: 120 }]);
  assert.ok(both.includes('m1 @0 metronome 120 "Allegro"'), both.join(' | '));
  const numberOnly = run(xml, [{ type: 'addTempoText', text: '♩ = 96', measureNumber: 1, bpm: 96 }]);
  assert.deepEqual(numberOnly.filter((line) => / @0 /.test(line)), ['m1 @0 metronome 96']);
  // A new tempo at the same bar replaces the old one, word and number.
  const replaced = run(xml, [
    { type: 'addTempoText', text: 'Allegro ♩ = 120', measureNumber: 1, bpm: 120 },
    { type: 'addTempoText', text: 'Largo ♩ = 50', measureNumber: 1, bpm: 50 },
  ]);
  assert.deepEqual(replaced.filter((line) => / @0 /.test(line)), ['m1 @0 metronome 50 "Largo"']);
  // A tempo mark written by another program as words and metronome in one direction keeps both.
  const foreign = xml.replace('</attributes>', '</attributes><direction placement="above"><direction-type><words font-weight="bold">Vivace</words></direction-type><direction-type><metronome><beat-unit>quarter</beat-unit><per-minute>144</per-minute></metronome></direction-type><sound tempo="144"/></direction>');
  assert.ok(summarizeScore(foreign).includes('m1 @0 metronome 144 "Vivace"'));
  assert.ok(run(foreign, [{ type: 'setSystemBreak', measureNumber: 2 } as ScoreCommand]).includes('m1 @0 metronome 144 "Vivace"'), 'and keeps them through an edit');
});

test('F54: a slur over a selection that crosses a barline is written', () => {
  const xml = scoreXml({ beats: 4, beatType: 4, measures: 2, parts: [{ ...TREBLE, content: { '1:1': quarters('CDEF'), '2:1': quarters('GABC') } }] });
  const state = buildDocumentState(xml);
  const measureId = state.coreDocument!.score.parts[0]!.staves[0]!.measures[0]!.id;
  // As the editor sends it: the start with the id of its bar, the stop by bar number.
  const lines = run(xml, [{
    type: 'toggleSlur', coreMeasureId: measureId, corePartId: state.coreDocument!.score.parts[0]!.id,
    measureNumber: 1, staffIndex: 1, voiceId: 1, timestampNum: 8, timestampDen: 16,
    stopLocator: { measureNumber: 2, staffIndex: 1, voiceId: 1, timestampNum: 4, timestampDen: 16 },
  } as ScoreCommand]);
  assert.deepEqual(lines.filter((line) => line.startsWith('slur')), ['slur E4@m1:2 > A4@m2:1']);
});
