import test from 'node:test';
import assert from 'node:assert/strict';

import { applyDocumentCommands, buildDocumentState } from '../src/score-core/commands/apply-document-commands.ts';
import { importMusicXmlToCore } from '../src/musicxml-adapter/import/import-musicxml.ts';

/* An inserted measure is a plain bar: it does not copy repeats, endings or breaks (iteration 19). */

const head = '<attributes><divisions>1</divisions><time><beats>4</beats><beat-type>4</beat-type></time><clef><sign>G</sign><line>2</line></clef></attributes>';
const whole = (step: string) => `<note><pitch><step>${step}</step><octave>5</octave></pitch><duration>4</duration><voice>1</voice><type>whole</type></note>`;
const SCORE = `<?xml version="1.0" encoding="UTF-8"?>
<score-partwise version="4.0"><part-list><score-part id="P1"><part-name>Flute</part-name></score-part></part-list><part id="P1">
<measure number="1">${head}<barline location="left"><repeat direction="forward"/></barline>${whole('C')}</measure>
<measure number="2"><barline location="left"><ending number="1" type="start"/></barline>${whole('D')}<barline location="right"><bar-style>light-heavy</bar-style><ending number="1" type="stop"/><repeat direction="backward"/></barline></measure>
<measure number="3"><print new-system="yes"/>${whole('E')}<barline location="right"><bar-style>light-heavy</bar-style></barline></measure>
</part></score-partwise>`;

function bars(xml: string) {
  return importMusicXmlToCore(xml).score.parts[0]!.staves[0]!.measures.map((measure) => ({
    number: measure.measureNumber,
    left: measure.leftBarline ?? null,
    right: measure.rightBarline ?? null,
    leftEnding: measure.leftEnding ? `${measure.leftEnding.number}:${measure.leftEnding.type}` : null,
    rightEnding: measure.rightEnding ? `${measure.rightEnding.number}:${measure.rightEnding.type}` : null,
    newSystem: Boolean(measure.print?.newSystem),
    notes: measure.voices.flatMap((voice) => voice.events).filter((event) => event.kind === 'note').length,
  }));
}

function insertAfter(measureNumber: number) {
  return applyDocumentCommands(buildDocumentState(SCORE), [{ type: 'insertMeasureAfter', measureNumber } as never]).xml;
}

test('a measure inserted after a repeat-end bar does not copy the repeat or the ending', () => {
  const result = bars(insertAfter(2));
  assert.equal(result.length, 4);
  assert.deepEqual(result[1], { number: 2, left: null, right: 'repeat-end', leftEnding: '1:start', rightEnding: '1:stop', newSystem: false, notes: 1 });
  assert.deepEqual(result[2], { number: 3, left: null, right: null, leftEnding: null, rightEnding: null, newSystem: false, notes: 0 });
});

test('a measure inserted after the repeat-start bar does not copy the start repeat', () => {
  const result = bars(insertAfter(1));
  assert.equal(result[0]!.left, 'repeat-start');
  assert.equal(result[1]!.left, null);
  assert.equal(result[1]!.notes, 0);
});

test('the system break stays on its bar when a measure is inserted before it', () => {
  const result = bars(insertAfter(1));
  assert.deepEqual(result.map((bar) => bar.newSystem), [false, false, false, true]);
});

test('a measure appended after the final bar takes over the final barline', () => {
  const result = bars(insertAfter(3));
  assert.equal(result.length, 4);
  assert.equal(result[2]!.right, null, JSON.stringify(result[2]));
  assert.equal(result[3]!.right, 'final', JSON.stringify(result[3]));
  assert.equal(result[3]!.newSystem, false);
});

test('the system break stays on its bar when an earlier measure is deleted', () => {
  const result = bars(applyDocumentCommands(buildDocumentState(SCORE), [{ type: 'deleteMeasure', measureNumber: 1 } as never]).xml);
  assert.deepEqual(result.map((bar) => bar.newSystem), [false, true]);
});

function restsInBar(xml: string, measureNumber: number) {
  const core = importMusicXmlToCore(xml);
  return core.score.parts.map((part) => part.staves.map((staff) => {
    const measure = staff.measures.find((entry) => entry.measureNumber === measureNumber)!;
    return measure.voices.flatMap((voice) => voice.events.map((event) => `v${voice.voiceId}:${event.kind}:${event.durationType ?? ''}:${event.durationDivisions}`));
  }));
}

const insertInto = (xml: string, measureNumber: number) => (
  applyDocumentCommands(buildDocumentState(xml), [{ type: 'insertMeasureAfter', measureNumber } as never]).xml
);

const emptyBar = (attributes: string, body: string) => `<?xml version="1.0" encoding="UTF-8"?>
<score-partwise version="4.0"><part-list><score-part id="P1"><part-name>A</part-name></score-part></part-list>
<part id="P1"><measure number="1"><attributes><divisions>4</divisions>${attributes}</attributes>${body}</measure></part></score-partwise>`;

test('an inserted measure holds a whole-bar rest, not an empty measure', () => {
  const xml = insertInto(SCORE, 1);
  assert.match(xml.slice(xml.indexOf('<measure number="2"')), /<note>\s*<rest/);
  const [[rests]] = restsInBar(xml, 2) as string[][][];
  assert.equal(rests!.length, 1, JSON.stringify(rests));
  assert.match(rests![0]!, /^v1:rest:/);
});

test('an inserted measure in 3/4 holds a rest of the full bar length', () => {
  const xml = insertInto(emptyBar(
    '<time><beats>3</beats><beat-type>4</beat-type></time><clef><sign>G</sign><line>2</line></clef>',
    '<note><pitch><step>C</step><octave>5</octave></pitch><duration>12</duration><voice>1</voice><type>half</type><dot/></note>',
  ), 1);
  const [[rests]] = restsInBar(xml, 2) as string[][][];
  assert.equal(rests!.length, 1, JSON.stringify(rests));
  assert.match(rests![0]!, /:12$/);
});

test('every staff of a grand staff gets its own whole-bar rest in its own voice', () => {
  const grand = emptyBar(
    '<time><beats>4</beats><beat-type>4</beat-type></time><staves>2</staves><clef number="1"><sign>G</sign><line>2</line></clef><clef number="2"><sign>F</sign><line>4</line></clef>',
    '<note><pitch><step>C</step><octave>5</octave></pitch><duration>16</duration><voice>1</voice><type>whole</type><staff>1</staff></note><backup><duration>16</duration></backup><note><pitch><step>C</step><octave>3</octave></pitch><duration>16</duration><voice>5</voice><type>whole</type><staff>2</staff></note>',
  );
  const staves = restsInBar(insertInto(grand, 1), 2)[0]!;
  assert.equal(staves.length, 2);
  assert.match(staves[0]![0]!, /^v1:rest:/);
  assert.match(staves[1]![0]!, /^v5:rest:/);
  assert.equal(staves[0]!.length, 1);
  assert.equal(staves[1]!.length, 1);
});

test('second voices are not copied into an inserted measure', () => {
  const twoVoices = emptyBar(
    '<time><beats>4</beats><beat-type>4</beat-type></time><clef><sign>G</sign><line>2</line></clef>',
    '<note><pitch><step>C</step><octave>5</octave></pitch><duration>16</duration><voice>1</voice><type>whole</type></note><backup><duration>16</duration></backup><note><pitch><step>E</step><octave>4</octave></pitch><duration>16</duration><voice>2</voice><type>whole</type></note>',
  );
  const [[rests]] = restsInBar(insertInto(twoVoices, 1), 2) as string[][][];
  assert.equal(rests!.length, 1, JSON.stringify(rests));
  assert.match(rests![0]!, /^v1:rest:/);
});
