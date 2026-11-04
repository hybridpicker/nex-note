import test from 'node:test';
import assert from 'node:assert/strict';

import { importMusicXmlToCore } from '../src/musicxml-adapter/import/import-musicxml.ts';
import { applyDocumentCommands, buildDocumentState } from '../src/score-core/commands/apply-document-commands.ts';
import { normalizeScoreCommand } from '../src/shared/schemas/score-command.ts';

const FLUTE_XML = `<?xml version="1.0" encoding="UTF-8"?>
<score-partwise version="4.0"><part-list><score-part id="P1"><part-name>Flute</part-name></score-part></part-list><part id="P1">
<measure number="1"><attributes><divisions>1</divisions><time><beats>4</beats><beat-type>4</beat-type></time><clef><sign>G</sign><line>2</line></clef></attributes>
<note><pitch><step>C</step><octave>6</octave></pitch><duration>4</duration><voice>1</voice><type>whole</type></note></measure>
<measure number="2"><note><pitch><step>D</step><octave>6</octave></pitch><duration>4</duration><voice>1</voice><type>whole</type></note></measure>
</part></score-partwise>`;

function addOttava(kind: '8va' | '8vb' | '15ma' | '15mb') {
  return applyDocumentCommands(buildDocumentState(FLUTE_XML), [{
    type: 'addOttava',
    kind,
    staffIndex: 1,
    startMeasureNumber: 1,
    startTimestampNum: 0,
    startTimestampDen: 4,
    stopMeasureNumber: 2,
    stopTimestampNum: 3,
    stopTimestampDen: 4,
  }]);
}

function octaveShifts(xml: string) {
  return [...xml.matchAll(/<octave-shift\b([^>]*)\/?>/g)].map((match) => {
    const attrs = Object.fromEntries([...match[1].matchAll(/(\w+)="([^"]*)"/g)].map((attr) => [attr[1], attr[2]]));
    return `${attrs.type}:${attrs.size}`;
  });
}

// MusicXML 4.0 octave-shift: a passage printed an octave higher (8va) is shifted "down" from the
// sounding pitch data in <pitch>; 8vb is "up". 15ma/15mb use size 15.
const EXPECTED: Record<'8va' | '8vb' | '15ma' | '15mb', string[]> = {
  '8va': ['down:8', 'stop:8'],
  '8vb': ['up:8', 'stop:8'],
  '15ma': ['down:15', 'stop:15'],
  '15mb': ['up:15', 'stop:15'],
};

for (const kind of ['8va', '8vb', '15ma', '15mb'] as const) {
  test(`${kind} exports the MusicXML octave-shift direction and size, and survives reimport`, () => {
    const result = addOttava(kind);
    assert.deepEqual(result.diagnostics.filter((d) => d.code.endsWith('_rejected')), []);
    assert.deepEqual(octaveShifts(result.xml), EXPECTED[kind]);
    const reimported = importMusicXmlToCore(result.xml).score.parts[0]!.staves[0]!.measures
      .flatMap((measure) => measure.directions)
      .filter((direction) => direction.kind === 'octave-shift')
      .map((direction) => direction.value);
    assert.deepEqual(reimported, EXPECTED[kind]);
  });
}

test('octave lines leave the sounding pitch data unchanged', () => {
  const result = addOttava('8va');
  assert.match(result.xml, /<step>C<\/step><octave>6<\/octave>/);
  assert.match(result.xml, /<step>D<\/step><octave>6<\/octave>/);
});

test('8vb and 15mb default below the staff, 8va and 15ma above', () => {
  const placement = (kind: '8va' | '8vb' | '15ma' | '15mb') => [...addOttava(kind).xml.matchAll(/<direction placement="(\w+)">\s*<direction-type>\s*<octave-shift/g)].map((m) => m[1]);
  assert.deepEqual(placement('8va'), ['above', 'above']);
  assert.deepEqual(placement('15ma'), ['above', 'above']);
  assert.deepEqual(placement('8vb'), ['below', 'below']);
  assert.deepEqual(placement('15mb'), ['below', 'below']);
});

test('the command schema accepts 15ma and 15mb and still rejects unknown kinds', () => {
  const base = { type: 'addOttava', staffIndex: 1, startMeasureNumber: 1, startTimestampNum: 0, startTimestampDen: 4, stopMeasureNumber: 1, stopTimestampNum: 2, stopTimestampDen: 4 };
  for (const kind of ['8va', '8vb', '15ma', '15mb']) {
    assert.doesNotThrow(() => normalizeScoreCommand({ ...base, kind }), kind);
  }
  assert.throws(() => normalizeScoreCommand({ ...base, kind: '22ma' }));
});
