import test from 'node:test';
import assert from 'node:assert/strict';
import { buildDocumentState } from '../src/score-core/commands/apply-document-commands.ts';
import { deriveInverseCommands } from '../src/score-core/history/derive-inverse-commands.ts';

const SAMPLE_XML = `<?xml version="1.0" encoding="UTF-8"?>
<score-partwise version="3.1">
  <work><work-title>Inverse Score</work-title></work>
  <identification><creator type="composer">Composer Zero</creator></identification>
  <part-list>
    <score-part id="P1"><part-name>Piano</part-name><part-abbreviation>Pno.</part-abbreviation></score-part>
  </part-list>
  <part id="P1">
    <measure number="1">
      <attributes>
        <divisions>1</divisions>
        <key><fifths>0</fifths></key>
        <time><beats>4</beats><beat-type>4</beat-type></time>
        <clef><sign>G</sign><line>2</line></clef>
      </attributes>
      <note>
        <pitch><step>C</step><octave>4</octave></pitch>
        <duration>4</duration>
        <voice>1</voice>
        <type>whole</type>
        <staff>1</staff>
      </note>
    </measure>
  </part>
</score-partwise>`;

test('deriveInverseCommands captures inverse commands for reversible metadata and layout edits', () => {
  const state = buildDocumentState(SAMPLE_XML);
  const result = deriveInverseCommands(state.coreDocument, [
    { type: 'setTitle', title: 'Changed' },
    { type: 'setPartName', partId: 'P1', name: 'Grand Piano' },
    { type: 'setSystemBreak', measureNumber: 1, value: true },
  ]);

  assert.equal(result.supportedCommandCount, 3);
  assert.equal(result.unsupported.length, 0);
  assert.deepEqual(result.inverseCommands, [
    { type: 'setSystemBreak', measureNumber: 1, value: false },
    { type: 'setPartName', partId: 'P1', name: 'Piano' },
    { type: 'setTitle', title: 'Inverse Score' },
  ]);
});

test('deriveInverseCommands marks ambiguous or unsupported commands explicitly', () => {
  const state = buildDocumentState(SAMPLE_XML);
  const result = deriveInverseCommands(state.coreDocument, [
    { type: 'insertMeasureAfter', measureNumber: 1 },
    { type: 'toggleTie', measureNumber: 1, staffIndex: 1, voiceId: 1, timestampNum: 0, timestampDen: 4 },
  ]);

  assert.equal(result.inverseCommands.length, 1);
  assert.equal(result.unsupported.length, 1);
  assert.deepEqual(result.inverseCommands, [
    { type: 'toggleTie', measureNumber: 1, staffIndex: 1, voiceId: 1, timestampNum: 0, timestampDen: 4 },
  ]);
  assert.deepEqual(result.unsupported.map((entry) => entry.type), ['insertMeasureAfter']);
});

test('deriveInverseCommands covers deterministic note and transposition commands', () => {
  const state = buildDocumentState(SAMPLE_XML);
  const result = deriveInverseCommands(state.coreDocument, [
    { type: 'changeNotePitch', measureNumber: 1, staffIndex: 1, voiceId: 1, timestampNum: 0, timestampDen: 4, step: 'E', octave: 4, alter: 0 },
    { type: 'toggleArticulation', measureNumber: 1, staffIndex: 1, voiceId: 1, timestampNum: 0, timestampDen: 4, articulation: 'accent' },
    { type: 'toggleTie', measureNumber: 1, staffIndex: 1, voiceId: 1, timestampNum: 0, timestampDen: 4 },
    { type: 'transposeChromatic', measureNumber: 1, staffIndex: 1, voiceId: 1, timestampNum: 0, timestampDen: 4, semitones: 2 },
    {
      type: 'transposeRangeChromatic',
      semitones: 3,
      range: {
        start: { measureNumber: 1, staffIndex: 1, voiceId: 1, timestampNum: 0, timestampDen: 4 },
        end: { measureNumber: 1, staffIndex: 1, voiceId: 1, timestampNum: 0, timestampDen: 4 },
      },
    },
    { type: 'transposeDocumentChromatic', semitones: -2 },
  ]);

  assert.equal(result.supportedCommandCount, 6);
  assert.equal(result.unsupported.length, 0);
  assert.deepEqual(result.inverseCommands, [
    { type: 'transposeDocumentChromatic', semitones: 2 },
    {
      type: 'transposeRangeChromatic',
      semitones: -3,
      range: {
        start: { measureNumber: 1, staffIndex: 1, voiceId: 1, timestampNum: 0, timestampDen: 4 },
        end: { measureNumber: 1, staffIndex: 1, voiceId: 1, timestampNum: 0, timestampDen: 4 },
      },
    },
    { type: 'transposeChromatic', measureNumber: 1, staffIndex: 1, voiceId: 1, timestampNum: 0, timestampDen: 4, semitones: -2 },
    { type: 'toggleTie', measureNumber: 1, staffIndex: 1, voiceId: 1, timestampNum: 0, timestampDen: 4 },
    { type: 'toggleArticulation', measureNumber: 1, staffIndex: 1, voiceId: 1, timestampNum: 0, timestampDen: 4, articulation: 'accent' },
    { type: 'changeNotePitch', measureNumber: 1, staffIndex: 1, voiceId: 1, timestampNum: 0, timestampDen: 4, step: 'C', octave: 4, alter: 0 },
  ]);
});

test('deriveInverseCommands preserves chord-tone identity for tie toggles', () => {
  const state = buildDocumentState(SAMPLE_XML);
  const source = state.coreDocument?.score.parts[0]?.staves[0]?.measures[0]?.voices[0]?.events[0];
  assert.equal(source?.kind, 'note');
  if (source?.kind !== 'note') return;
  const command = {
    type: 'toggleTie' as const,
    coreEntityId: source.id,
    coreMeasureId: state.coreDocument?.score.parts[0]?.staves[0]?.measures[0]?.id ?? null,
    corePartId: state.coreDocument?.score.parts[0]?.id ?? null,
    step: source.pitch.step,
    octave: source.pitch.octave,
    alter: source.pitch.alter,
    measureNumber: source.measureNumber,
    staffIndex: source.staffIndex,
    voiceId: source.voiceId,
    timestampNum: source.timestampNum,
    timestampDen: source.timestampDen,
  };

  const result = deriveInverseCommands(state.coreDocument, [command]);

  assert.equal(result.unsupported.length, 0);
  assert.deepEqual(result.inverseCommands, [command]);
});

test('deriveInverseCommands restores previous articulation placement', () => {
  const state = buildDocumentState(`<?xml version="1.0" encoding="UTF-8"?>
<score-partwise version="3.1">
  <part-list><score-part id="P1"><part-name>Piano</part-name></score-part></part-list>
  <part id="P1">
    <measure number="1">
      <attributes><divisions>1</divisions><time><beats>4</beats><beat-type>4</beat-type></time><clef><sign>G</sign><line>2</line></clef></attributes>
      <note>
        <pitch><step>C</step><octave>4</octave></pitch>
        <duration>4</duration>
        <voice>1</voice>
        <type>whole</type>
        <notations><articulations><accent placement="above"/></articulations></notations>
        <staff>1</staff>
      </note>
    </measure>
  </part>
</score-partwise>`);

  const result = deriveInverseCommands(state.coreDocument, [
    { type: 'setArticulationPlacement', measureNumber: 1, staffIndex: 1, voiceId: 1, timestampNum: 0, timestampDen: 4, articulation: 'accent', placement: 'below' },
  ]);

  assert.equal(result.supportedCommandCount, 1);
  assert.equal(result.unsupported.length, 0);
  assert.deepEqual(result.inverseCommands, [
    { type: 'setArticulationPlacement', measureNumber: 1, staffIndex: 1, voiceId: 1, timestampNum: 0, timestampDen: 4, articulation: 'accent', placement: 'above' },
  ]);
});

test('deriveInverseCommands scopes note duration inverses by core part identity', () => {
  const state = buildDocumentState(`<?xml version="1.0" encoding="UTF-8"?>
<score-partwise version="3.1">
  <part-list>
    <score-part id="P1"><part-name>Guitar TAB</part-name></score-part>
    <score-part id="P2"><part-name>Guitar</part-name></score-part>
  </part-list>
  <part id="P1">
    <measure number="1">
      <attributes><divisions>2</divisions><staff-details><staff-type>tab</staff-type><staff-lines>6</staff-lines></staff-details><clef><sign>TAB</sign></clef></attributes>
      <note><pitch><step>D</step><octave>4</octave></pitch><duration>1</duration><voice>1</voice><type>eighth</type><staff>1</staff><notations><technical><string>2</string><fret>3</fret></technical></notations></note>
    </measure>
  </part>
  <part id="P2">
    <measure number="1">
      <attributes><divisions>2</divisions><clef><sign>G</sign><line>2</line></clef></attributes>
      <note><pitch><step>D</step><octave>4</octave></pitch><duration>2</duration><voice>1</voice><type>quarter</type><staff>1</staff></note>
    </measure>
  </part>
</score-partwise>`);
  const notationPart = state.coreDocument!.score.parts[1]!;
  const notationMeasure = notationPart.staves[0]!.measures[0]!;
  const notationEvent = notationMeasure.voices[0]!.events[0]!;

  const result = deriveInverseCommands(state.coreDocument, [{
    type: 'changeNoteDuration',
    coreEntityId: notationEvent.id,
    coreMeasureId: notationMeasure.id,
    corePartId: notationPart.id,
    measureNumber: 1,
    staffIndex: 1,
    voiceId: 1,
    timestampNum: 0,
    timestampDen: 4,
    durationType: 'half',
    isDotted: false,
  }]);

  assert.deepEqual(result.inverseCommands, [{
    type: 'changeNoteDuration',
    measureNumber: 1,
    staffIndex: 1,
    voiceId: 1,
    timestampNum: 0,
    timestampDen: 4,
    durationType: 'quarter',
    isDotted: false,
  }]);
});
