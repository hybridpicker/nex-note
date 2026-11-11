import assert from 'node:assert/strict';
import test from 'node:test';

import { buildDocumentState } from '../src/score-core/commands/apply-document-commands.ts';
import { importMusicXmlToCore } from '../src/musicxml-adapter/import/import-musicxml.ts';
import { buildRenderWindowXml, documentAllowsRenderWindow, resolveRenderWindow } from '../src/render-bridge/osmd/render-window.ts';
import { CLARINET_BB, PIANO, TREBLE, scoreXml } from './support/entry-fixtures.ts';
import { summarizeScore } from './support/score-summary.ts';

/*
 * Render window (gate 3, steps 2 and 3 of docs/note-entry-mastery-ledger.md): the engraver is given
 * the bars around the viewport as a MusicXML file of their own. The bars keep their numbers and
 * their content byte for byte, and the first of them is told what the bars before it had said.
 */

const quarter = (step: string, octave: number, staff?: number, voice = 1) => (
  `<note><pitch><step>${step}</step><octave>${octave}</octave></pitch><duration>4</duration><voice>${voice}</voice><type>quarter</type>${staff ? `<staff>${staff}</staff>` : ''}</note>`
);
const bar = (steps: string, octave = 4) => steps.split('').map((step) => quarter(step, octave)).join('');

function twelveBars() {
  const content: Record<string, string> = {};
  for (let number = 1; number <= 12; number += 1) content[`${number}:1`] = bar('CDEF'.slice(0, 3) + 'GAB'[number % 3]);
  // Key change at bar 5 (two sharps), time change at bar 7 (3/4), bass clef from bar 8.
  content['5:1'] = `<attributes><key><fifths>2</fifths></key></attributes>${bar('DEFG')}`;
  content['7:1'] = `<attributes><time><beats>3</beats><beat-type>4</beat-type></time></attributes>${bar('DEF')}`;
  content['8:1'] = `<attributes><clef><sign>F</sign><line>4</line></clef></attributes>${bar('DEF', 3)}`;
  for (let number = 9; number <= 12; number += 1) content[`${number}:1`] = bar('GAB', 2);
  return buildDocumentState(scoreXml({ beats: 4, beatType: 4, measures: 12, parts: [{ ...TREBLE, content }] }));
}

const linesOfBars = (xml: string, first: number, last: number) => summarizeScore(xml).filter((line) => {
  const number = Number(/\bm(\d+)\b/.exec(line)?.[1]);
  return number >= first && number <= last && !/ (key|time|clef) /.test(line);
});

test('render window: the bars of the window are the bars of the score, with their numbers', () => {
  const state = twelveBars();
  const windowXml = buildRenderWindowXml(state.xml, state.coreDocument!, { firstMeasureNumber: 9, lastMeasureNumber: 11 })!;
  assert.deepEqual([...windowXml.matchAll(/<measure number="(\d+)"/g)].map((match) => Number(match[1])), [9, 10, 11]);
  // Read as a file of its own, the window holds the same notes in the same bars.
  const windowDocument = importMusicXmlToCore(windowXml);
  assert.deepEqual(windowDocument.score.parts[0]!.staves[0]!.measures.map((measure) => measure.measureNumber), [9, 10, 11]);
  assert.deepEqual(linesOfBars(windowXml, 9, 11), linesOfBars(state.xml, 9, 11));
});

test('render window: the first bar is told the key, time signature, clef and divisions that hold there', () => {
  const state = twelveBars();
  const windowXml = buildRenderWindowXml(state.xml, state.coreDocument!, { firstMeasureNumber: 9, lastMeasureNumber: 11 })!;
  const firstBar = /<measure number="9"[^>]*>([\s\S]*?)<\/measure>/.exec(windowXml)![1]!;
  assert.match(firstBar, /^<attributes><divisions>4<\/divisions><key><fifths>2<\/fifths><\/key><time print-object="no"><beats>3<\/beats><beat-type>4<\/beat-type><\/time><clef><sign>F<\/sign><line>4<\/line><\/clef><\/attributes><note>/);
  const windowDocument = importMusicXmlToCore(windowXml);
  const attributes = windowDocument.score.parts[0]!.staves[0]!.measures[0]!.attributes[0]!;
  assert.equal(attributes.keyFifths, 2);
  assert.deepEqual({ beats: attributes.time?.beats, beatType: attributes.time?.beatType }, { beats: 3, beatType: 4 });
  assert.equal(attributes.clefs[0]?.sign, 'F');
});

test('render window: a window that starts before the changes carries only what was said before it', () => {
  const state = twelveBars();
  const windowXml = buildRenderWindowXml(state.xml, state.coreDocument!, { firstMeasureNumber: 3, lastMeasureNumber: 6 })!;
  const firstBar = /<measure number="3"[^>]*>([\s\S]*?)<\/measure>/.exec(windowXml)![1]!;
  assert.match(firstBar, /^<attributes><divisions>4<\/divisions><key><fifths>0<\/fifths><\/key><time print-object="no"><beats>4<\/beats><beat-type>4<\/beat-type><\/time><clef><sign>G<\/sign><line>2<\/line><\/clef><\/attributes>/);
  // The key change of bar 5 is inside the window, as the score has it.
  assert.match(windowXml, /<measure number="5"><attributes><key><fifths>2<\/fifths><\/key><\/attributes>/);
});

test('render window: a window from bar 1 is the head of the file, unchanged', () => {
  const state = twelveBars();
  const windowXml = buildRenderWindowXml(state.xml, state.coreDocument!, { firstMeasureNumber: 1, lastMeasureNumber: 4 })!;
  assert.equal(windowXml, state.xml.replace(/<measure number="5">[\s\S]*<\/measure>(?=<\/part>)/, ''));
});

test('render window: every part is cut, and a part keeps its staves and its transposition', () => {
  const piano = Object.fromEntries(Array.from({ length: 8 }, (_, index) => [
    [`${index + 1}:1`, [quarter('C', 5, 1), quarter('D', 5, 1), quarter('E', 5, 1), quarter('F', 5, 1)].join('')],
    [`${index + 1}:2`, [quarter('C', 3, 2, 5), quarter('D', 3, 2, 5), quarter('E', 3, 2, 5), quarter('F', 3, 2, 5)].join('')],
  ]).flat());
  const clarinet = Object.fromEntries(Array.from({ length: 8 }, (_, index) => [`${index + 1}:1`, bar('GABC')]));
  const state = buildDocumentState(scoreXml({
    beats: 4, beatType: 4, measures: 8,
    parts: [{ ...PIANO, content: piano }, { ...CLARINET_BB, content: clarinet }],
  }));
  const windowXml = buildRenderWindowXml(state.xml, state.coreDocument!, { firstMeasureNumber: 5, lastMeasureNumber: 8 })!;
  const windowDocument = importMusicXmlToCore(windowXml);
  assert.deepEqual(windowDocument.score.parts.map((part) => part.staves.length), [2, 1]);
  assert.deepEqual(windowDocument.score.parts.map((part) => part.staves[0]!.measures.map((measure) => measure.measureNumber)), [[5, 6, 7, 8], [5, 6, 7, 8]]);
  assert.equal(windowDocument.score.parts[1]!.chromaticTranspose, -2);
  const pianoFirst = /<part id="P1"><measure number="5"[^>]*>(<attributes>[\s\S]*?<\/attributes>)/.exec(windowXml)![1]!;
  assert.match(pianoFirst, /<staves>2<\/staves><clef number="1"><sign>G<\/sign><line>2<\/line><\/clef><clef number="2"><sign>F<\/sign><line>4<\/line><\/clef>/);
  assert.deepEqual(linesOfBars(windowXml, 5, 8), linesOfBars(state.xml, 5, 8));
});

test('render window: bars that are not in the score give no window', () => {
  const state = twelveBars();
  assert.equal(buildRenderWindowXml(state.xml, state.coreDocument!, { firstMeasureNumber: 20, lastMeasureNumber: 24 }), null);
});

test('render window: scores with octave lines or bar repeats are drawn whole', () => {
  const plain = twelveBars();
  assert.equal(documentAllowsRenderWindow(plain.coreDocument!), true);
  const withOctaveLine = structuredClone(plain.coreDocument!);
  withOctaveLine.score.parts[0]!.staves[0]!.measures[2]!.directions.push({ id: 'o', kind: 'octave-shift', value: 'down', measureNumber: 3 });
  assert.equal(documentAllowsRenderWindow(withOctaveLine), false);
});

test('render window: the systems on screen and a margin on either side; none for a short score', () => {
  const systems = Array.from({ length: 30 }, (_, index) => ({ systemIndex: index, measureNumbers: [index * 4 + 1, index * 4 + 2, index * 4 + 3, index * 4 + 4] }));
  assert.deepEqual(
    resolveRenderWindow(systems, { firstSystemIndex: 10, lastSystemIndex: 12 }, { margin: 2, minimumSystems: 12 }),
    { firstSystemIndex: 8, lastSystemIndex: 14, firstMeasureNumber: 33, lastMeasureNumber: 60 },
  );
  assert.deepEqual(
    resolveRenderWindow(systems, { firstSystemIndex: 0, lastSystemIndex: 2 }, { margin: 2, minimumSystems: 12 }),
    { firstSystemIndex: 0, lastSystemIndex: 4, firstMeasureNumber: 1, lastMeasureNumber: 20 },
  );
  assert.equal(resolveRenderWindow(systems.slice(0, 8), { firstSystemIndex: 0, lastSystemIndex: 2 }, { margin: 2, minimumSystems: 12 }), null);
});
