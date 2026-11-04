import test from 'node:test';
import assert from 'node:assert/strict';

import { applyDocumentCommands, buildDocumentState } from '../src/score-core/commands/apply-document-commands.ts';
import { importMusicXmlToCore } from '../src/musicxml-adapter/import/import-musicxml.ts';
import { TREBLE, scoreXml } from './support/entry-fixtures.ts';

const QUARTERS = scoreXml({
  beats: 4,
  beatType: 4,
  measures: 1,
  parts: [{ ...TREBLE, content: { '1:1': ['C', 'D', 'E', 'F'].map((step) => `<note><pitch><step>${step}</step><octave>5</octave></pitch><duration>4</duration><voice>1</voice><type>quarter</type></note>`).join('') } }],
});

function setChord(value: string, xml = QUARTERS) {
  return applyDocumentCommands(buildDocumentState(xml), [{ type: 'setHarmonyAt', value, measureNumber: 1, staffIndex: 1, timestampNum: 1, timestampDen: 4 }]);
}

function chords(xml: string) {
  return importMusicXmlToCore(xml).score.parts[0]!.staves[0]!.measures[0]!.directions
    .filter((direction) => direction.kind === 'harmony')
    .map((direction) => direction.value);
}

test('N.C. exports as MusicXML kind "none" and reimports as N.C.', () => {
  for (const spelling of ['N.C.', 'NC', 'N.C', 'no chord']) {
    const result = setChord(spelling);
    assert.match(result.xml, /<kind text="N\.C\.">none<\/kind>/, spelling);
    assert.doesNotMatch(result.xml, /<root-step>N<\/root-step>/, spelling);
    assert.deepEqual(chords(result.xml), ['N.C.'], spelling);
  }
});

test('C6/9 keeps its added ninth instead of losing "/9" as a bass note', () => {
  const result = setChord('C6/9');
  assert.match(result.xml, /<kind text="6\/9">major-sixth<\/kind>/);
  assert.match(result.xml, /<degree-value>9<\/degree-value><degree-alter>0<\/degree-alter><degree-type>add<\/degree-type>/);
  assert.doesNotMatch(result.xml, /<bass>/);
  assert.deepEqual(chords(result.xml), ['C6/9']);
});

test('slash chords with a bass note keep the bass', () => {
  assert.deepEqual(chords(setChord('Am7/G').xml), ['Am7/G']);
  assert.deepEqual(chords(setChord('F/Eb').xml), ['F/Eb']);
});

test('transposing the score keeps N.C. and transposes 6/9 as one chord', () => {
  for (const [value, expected] of [['N.C.', 'N.C.'], ['C6/9', 'D6/9']] as const) {
    const withChord = setChord(value);
    const transposed = applyDocumentCommands(withChord, [{ type: 'transposeDocumentChromatic', semitones: 2 }]);
    assert.deepEqual(chords(transposed.xml), [expected], value);
  }
});
