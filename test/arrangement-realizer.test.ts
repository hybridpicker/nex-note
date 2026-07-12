import test from 'node:test';
import assert from 'node:assert/strict';

import { buildDocumentState } from '../src/score-core/commands/apply-document-commands.ts';
import { PLANNER_RESPONSE_FIXTURES } from '../src/nex-note/arrangement/fixtures/planner-response-fixtures.ts';
import { buildRealizationPlan } from '../src/nex-note/arrangement/realizer/build-realization-plan.ts';
import { emitScoreCommandsFromRealizationPlan } from '../src/nex-note/arrangement/realizer/emit-score-commands.ts';
import { realizeArrangement } from '../src/nex-note/arrangement/realizer/realize-arrangement.ts';
import type { ArrangementSpec, VoicingCandidate } from '../src/nex-note/arrangement/spec.ts';

const BLANK_MEASURE_XML = `<?xml version="1.0" encoding="UTF-8"?>
<score-partwise version="3.1">
  <part-list>
    <score-part id="P1"><part-name>Piano</part-name></score-part>
  </part-list>
  <part id="P1">
    <measure number="1">
      <attributes>
        <divisions>1</divisions>
        <time><beats>4</beats><beat-type>4</beat-type></time>
        <clef><sign>G</sign><line>2</line></clef>
      </attributes>
      <note>
        <rest measure="yes"/>
        <duration>4</duration>
        <voice>1</voice>
        <type>whole</type>
        <staff>1</staff>
      </note>
    </measure>
  </part>
</score-partwise>`;

const TWO_PART_XML = `<?xml version="1.0" encoding="UTF-8"?>
<score-partwise version="3.1">
  <part-list>
    <score-part id="P1"><part-name>Upper</part-name></score-part>
    <score-part id="P2"><part-name>Lower</part-name></score-part>
  </part-list>
  <part id="P1">
    <measure number="1">
      <attributes>
        <divisions>1</divisions>
        <time><beats>4</beats><beat-type>4</beat-type></time>
        <clef><sign>G</sign><line>2</line></clef>
      </attributes>
      <note><rest measure="yes"/><duration>4</duration><voice>1</voice><type>whole</type><staff>1</staff></note>
    </measure>
  </part>
  <part id="P2">
    <measure number="1">
      <attributes>
        <divisions>1</divisions>
        <time><beats>4</beats><beat-type>4</beat-type></time>
        <clef><sign>G</sign><line>2</line></clef>
      </attributes>
      <note><rest measure="yes"/><duration>4</duration><voice>1</voice><type>whole</type><staff>1</staff></note>
    </measure>
  </part>
</score-partwise>`;

const NOTATION_AND_TAB_PARTS_XML = `<?xml version="1.0" encoding="UTF-8"?>
<score-partwise version="3.1">
  <part-list>
    <score-part id="P1"><part-name>Guitar</part-name></score-part>
    <score-part id="P2"><part-name>Guitar TAB</part-name></score-part>
  </part-list>
  <part id="P1">
    <measure number="1">
      <attributes>
        <divisions>1</divisions>
        <time><beats>4</beats><beat-type>4</beat-type></time>
        <clef><sign>G</sign><line>2</line></clef>
      </attributes>
      <note><pitch><step>C</step><octave>4</octave></pitch><duration>4</duration><voice>1</voice><type>whole</type><staff>1</staff></note>
    </measure>
  </part>
  <part id="P2">
    <measure number="1">
      <attributes>
        <divisions>1</divisions>
        <time><beats>4</beats><beat-type>4</beat-type></time>
        <clef><sign>TAB</sign><line>5</line></clef>
      </attributes>
      <note><pitch><step>C</step><octave>4</octave></pitch><duration>4</duration><voice>1</voice><type>whole</type><staff>1</staff><notations><technical><string>5</string><fret>3</fret></technical></notations></note>
    </measure>
  </part>
</score-partwise>`;

test('buildRealizationPlan derives replace-range note events from a valid voicing candidate', () => {
  const fixture = PLANNER_RESPONSE_FIXTURES.find((entry) => entry.name === 'generalbass-outer-voice-valid');
  assert.ok(fixture);
  if (!fixture) return;

  const documentState = buildDocumentState(BLANK_MEASURE_XML);
  const voicingCandidate = fixture.response.voicingCandidates[0];
  const harmonicCandidate = fixture.response.harmonicPlanCandidates[0];
  assert.ok(voicingCandidate);
  assert.ok(harmonicCandidate);
  if (!voicingCandidate || !harmonicCandidate) return;

  const result = buildRealizationPlan({
    documentState,
    spec: fixture.response.spec,
    voicingCandidate,
    harmonicCandidate,
  });

  assert.equal(result.issues.length, 0);
  assert.ok(result.plan);
  if (!result.plan) return;
  assert.equal(result.plan.target.mode, 'replace-range');
  assert.deepEqual(result.plan.target.voiceIds, [1, 2, 3]);
  assert.equal(result.plan.target.measureRange.start, 1);
  assert.equal(result.plan.target.measureRange.end, 1);
  assert.equal(result.plan.events.length, 12);
  assert.ok(result.plan.events.every((event) => event.durationType === 'quarter'));
});

test('emitScoreCommandsFromRealizationPlan clears target voices before inserting realized notes', () => {
  const fixture = PLANNER_RESPONSE_FIXTURES.find((entry) => entry.name === 'generalbass-outer-voice-valid');
  assert.ok(fixture);
  if (!fixture) return;
  const documentState = buildDocumentState(BLANK_MEASURE_XML);
  const voicingCandidate = fixture.response.voicingCandidates[0];
  assert.ok(voicingCandidate);
  if (!voicingCandidate) return;

  const built = buildRealizationPlan({
    documentState,
    spec: fixture.response.spec,
    voicingCandidate,
    harmonicCandidate: fixture.response.harmonicPlanCandidates[0],
  });

  assert.ok(built.plan);
  if (!built.plan) return;
  const commands = emitScoreCommandsFromRealizationPlan(built.plan);
  assert.equal(commands.filter((command) => command.type === 'deleteRange').length, 3);
  assert.equal(commands.filter((command) => command.type === 'insertNoteAt').length, 12);
});

test('realizeArrangement materializes a simple three-voice voicing into the score document', () => {
  const fixture = PLANNER_RESPONSE_FIXTURES.find((entry) => entry.name === 'generalbass-outer-voice-valid');
  assert.ok(fixture);
  if (!fixture) return;
  const documentState = buildDocumentState(BLANK_MEASURE_XML);
  const voicingCandidate = fixture.response.voicingCandidates[0];
  assert.ok(voicingCandidate);
  if (!voicingCandidate) return;

  const result = realizeArrangement({
    documentState,
    spec: fixture.response.spec,
    voicingCandidate,
    harmonicCandidate: fixture.response.harmonicPlanCandidates[0],
  });

  assert.equal(result.valid, true);
  assert.ok(result.plan);
  assert.ok(result.commands.some((command) => command.type === 'insertNoteAt'));
  const voices = result.documentState?.coreDocument?.score.parts[0]?.staves[0]?.measures[0]?.voices ?? [];
  assert.equal(voices.length, 3);
  assert.deepEqual(voices.map((voice) => voice.voiceId).sort((left, right) => left - right), [1, 2, 3]);
  assert.ok(voices.every((voice) => voice.events.some((event) => event.kind === 'note')));
});

test('buildRealizationPlan preserves an existing score melody voice instead of overwriting it', () => {
  const fixture = PLANNER_RESPONSE_FIXTURES.find((entry) => entry.name === 'generalbass-outer-voice-valid');
  assert.ok(fixture);
  if (!fixture) return;
  const melodyXml = `<?xml version="1.0" encoding="UTF-8"?>
<score-partwise version="3.1">
  <part-list>
    <score-part id="P1"><part-name>Piano</part-name></score-part>
  </part-list>
  <part id="P1">
    <measure number="1">
      <attributes>
        <divisions>1</divisions>
        <time><beats>4</beats><beat-type>4</beat-type></time>
        <clef><sign>G</sign><line>2</line></clef>
      </attributes>
      <note><pitch><step>E</step><octave>5</octave></pitch><duration>4</duration><voice>1</voice><type>whole</type><staff>1</staff></note>
    </measure>
  </part>
</score-partwise>`;
  const documentState = buildDocumentState(melodyXml);
  const voicingCandidate = fixture.response.voicingCandidates[0];
  assert.ok(voicingCandidate);
  if (!voicingCandidate) return;
  const spec: ArrangementSpec = {
    ...fixture.response.spec,
    sourceMelody: {
      ...fixture.response.spec.sourceMelody,
      source: 'primary-voice',
      partId: 'P1',
      voiceId: 1,
    },
  };

  const built = buildRealizationPlan({
    documentState,
    spec,
    voicingCandidate,
    harmonicCandidate: fixture.response.harmonicPlanCandidates[0],
  });

  assert.ok(built.plan);
  if (!built.plan) return;
  // Voice 1 holds the user's melody and must stay out of the realized voices.
  assert.deepEqual(built.plan.target.voiceIds, [2, 3]);
  assert.ok(built.plan.events.every((event) => event.voiceId !== 1));

  const commands = emitScoreCommandsFromRealizationPlan(built.plan);
  assert.equal(commands.filter((command) => command.type === 'deleteRange').length, 2);
  assert.ok(commands.every((command) => command.type !== 'deleteRange' || command.range.start.voiceId !== 1));
  assert.ok(commands.every((command) => command.type !== 'insertNoteAt' || command.voiceId !== 1));

  const realized = realizeArrangement({
    documentState,
    spec,
    voicingCandidate,
    harmonicCandidate: fixture.response.harmonicPlanCandidates[0],
  });
  assert.equal(realized.valid, true);
  const voices = realized.documentState?.coreDocument?.score.parts[0]?.staves[0]?.measures[0]?.voices ?? [];
  assert.deepEqual(voices.map((voice) => voice.voiceId).sort((left, right) => left - right), [1, 2, 3]);
  const melodyVoice = voices.find((voice) => voice.voiceId === 1);
  const melodyNote = melodyVoice?.events.find((event) => event.kind === 'note');
  // The original E5 whole note survives untouched.
  assert.equal(melodyNote?.kind, 'note');
  assert.equal(melodyNote?.pitch.step, 'E');
  assert.equal(melodyNote?.pitch.octave, 5);
});

test('buildRealizationPlan scopes materialized voices to the requested source part', () => {
  const fixture = PLANNER_RESPONSE_FIXTURES.find((entry) => entry.name === 'generalbass-outer-voice-valid');
  assert.ok(fixture);
  if (!fixture) return;
  const documentState = buildDocumentState(TWO_PART_XML);
  const voicingCandidate = fixture.response.voicingCandidates[0];
  assert.ok(voicingCandidate);
  if (!voicingCandidate) return;
  const spec: ArrangementSpec = {
    ...fixture.response.spec,
    sourceMelody: {
      ...fixture.response.spec.sourceMelody,
      source: 'primary-voice',
      partId: 'P2',
    },
  };

  const built = buildRealizationPlan({
    documentState,
    spec,
    voicingCandidate,
    harmonicCandidate: fixture.response.harmonicPlanCandidates[0],
  });

  assert.equal(built.issues.length, 0);
  assert.ok(built.plan);
  if (!built.plan) return;
  assert.equal(built.plan.target.partId, 'P2');
  assert.equal(built.plan.target.corePartId, 'part:P2');
  const commands = emitScoreCommandsFromRealizationPlan(built.plan);
  assert.ok(commands.every((command) => (
    command.type !== 'deleteRange'
    || (
      command.corePartId === 'part:P2'
      && command.range.start.corePartId === 'part:P2'
      && command.range.end.corePartId === 'part:P2'
    )
  )));
  assert.ok(commands.every((command) => (
    command.type !== 'insertNoteAt'
    || command.corePartId === 'part:P2'
  )));

  const realized = realizeArrangement({
    documentState,
    spec,
    voicingCandidate,
    harmonicCandidate: fixture.response.harmonicPlanCandidates[0],
  });
  assert.equal(realized.valid, true);
  const parts = realized.documentState?.coreDocument?.score.parts ?? [];
  const upperVoices = parts.find((part) => part.id === 'part:P1')?.staves[0]?.measures[0]?.voices ?? [];
  const lowerVoices = parts.find((part) => part.id === 'part:P2')?.staves[0]?.measures[0]?.voices ?? [];
  assert.equal(upperVoices.length, 1);
  assert.deepEqual(lowerVoices.map((voice) => voice.voiceId).sort((left, right) => left - right), [1, 2, 3]);
});

test('buildRealizationPlan mirrors realized voices onto the paired TAB staff', () => {
  const fixture = PLANNER_RESPONSE_FIXTURES.find((entry) => entry.name === 'generalbass-outer-voice-valid');
  assert.ok(fixture);
  if (!fixture) return;
  const documentState = buildDocumentState(NOTATION_AND_TAB_PARTS_XML);
  const fixtureVoicingCandidate = fixture.response.voicingCandidates[0];
  const voicingCandidate = fixtureVoicingCandidate
    ? {
      ...fixtureVoicingCandidate,
      slices: fixtureVoicingCandidate.slices.map((slice) => ({
        ...slice,
        voices: slice.voices.map((voice) => (
          voice.voiceIndex === 3 && voice.pitch
            ? { ...voice, pitch: { ...voice.pitch, octave: voice.pitch.octave + 1 } }
            : voice
        )),
      })),
    }
    : undefined;
  assert.ok(voicingCandidate);
  if (!voicingCandidate) return;
  const spec: ArrangementSpec = {
    ...fixture.response.spec,
    sourceMelody: {
      ...fixture.response.spec.sourceMelody,
      source: 'primary-voice',
      partId: 'P1',
    },
  };

  const result = buildRealizationPlan({
    documentState,
    spec,
    voicingCandidate,
    harmonicCandidate: fixture.response.harmonicPlanCandidates[0],
  });

  assert.ok(result.plan);
  assert.equal(result.issues.some((issue) => issue.code === 'paired-tab-not-mirrored'), false);
  assert.equal(result.plan?.mirrors?.length, 1);
  assert.equal(result.plan?.mirrors?.[0]?.target.corePartId, 'part:P2');
  assert.deepEqual(result.plan?.mirrors?.[0]?.target.voiceIds, [1, 2, 3]);
  assert.equal(result.plan?.mirrors?.[0]?.events.length, 12);

  const commands = emitScoreCommandsFromRealizationPlan(result.plan);
  const tabDeletes = commands.filter((command) => command.type === 'deleteRange' && command.corePartId === 'part:P2');
  const tabInserts = commands.filter((command) => command.type === 'insertNoteAt' && command.corePartId === 'part:P2');
  assert.equal(tabDeletes.length, 3);
  assert.equal(tabInserts.length, 12);
  assert.ok(tabInserts.every((command) => command.type === 'insertNoteAt' && command.guitar));
  const firstMelodyTabInsert = tabInserts.find((command) => (
    command.type === 'insertNoteAt'
    && command.voiceId === 1
    && command.timestampNum === 0
    && command.timestampDen === 1
  ));
  assert.deepEqual(
    firstMelodyTabInsert?.type === 'insertNoteAt' ? firstMelodyTabInsert.guitar : null,
    { string: 5, fret: 17 },
  );
  const firstBassTabInsert = tabInserts.find((command) => (
    command.type === 'insertNoteAt'
    && command.voiceId === 3
    && command.timestampNum === 0
    && command.timestampDen === 1
  ));
  assert.deepEqual(
    firstBassTabInsert?.type === 'insertNoteAt' ? firstBassTabInsert.guitar : null,
    { string: 3, fret: 0 },
  );
});

test('buildRealizationPlan warns when a paired TAB pitch is below guitar range', () => {
  const fixture = PLANNER_RESPONSE_FIXTURES.find((entry) => entry.name === 'generalbass-outer-voice-valid');
  assert.ok(fixture);
  if (!fixture) return;
  const documentState = buildDocumentState(NOTATION_AND_TAB_PARTS_XML);
  const spec: ArrangementSpec = {
    ...fixture.response.spec,
    sourceMelody: {
      ...fixture.response.spec.sourceMelody,
      source: 'primary-voice',
      partId: 'P1',
    },
  };
  const voicingCandidate: VoicingCandidate = {
    candidateId: 'below-guitar-range',
    summary: 'One note below the playable TAB range',
    confidence: 'high',
    slices: [
      {
        measure: 1,
        beatNum: 1,
        beatDen: 4,
        harmony: 'C',
        functionLabel: 'tonic',
        voices: [
          { voiceIndex: 1, role: 'bass', pitch: { step: 'C', alter: 0, octave: 1 } },
        ],
      },
    ],
  };

  const result = buildRealizationPlan({
    documentState,
    spec,
    voicingCandidate,
    harmonicCandidate: fixture.response.harmonicPlanCandidates[0],
  });

  assert.ok(result.plan);
  const warning = result.issues.find((issue) => issue.code === 'paired-tab-not-mirrored');
  assert.equal(warning?.severity, 'warning');
  assert.match(warning?.message ?? '', /below standard guitar range/);
  const commands = result.plan ? emitScoreCommandsFromRealizationPlan(result.plan) : [];
  assert.equal(commands.filter((command) => command.type === 'deleteRange' && command.corePartId === 'part:P2').length, 1);
  assert.equal(commands.filter((command) => command.type === 'insertNoteAt' && command.corePartId === 'part:P2').length, 0);
});

test('realizeArrangement preserves cross-measure durations via insertNoteAt overflow ties', () => {
  const crossMeasureXml = `<?xml version="1.0" encoding="UTF-8"?>
<score-partwise version="3.1">
  <part-list>
    <score-part id="P1"><part-name>Piano</part-name></score-part>
  </part-list>
  <part id="P1">
    <measure number="1">
      <attributes>
        <divisions>1</divisions>
        <time><beats>4</beats><beat-type>4</beat-type></time>
        <clef><sign>G</sign><line>2</line></clef>
      </attributes>
      <note><rest measure="yes"/><duration>4</duration><voice>1</voice><type>whole</type><staff>1</staff></note>
    </measure>
    <measure number="2">
      <note><rest measure="yes"/><duration>4</duration><voice>1</voice><type>whole</type><staff>1</staff></note>
    </measure>
  </part>
</score-partwise>`;
  const documentState = buildDocumentState(crossMeasureXml);
  const spec: ArrangementSpec = {
    sourceMelody: { source: 'chat-inline', description: 'cross-measure sustain' },
    stylePack: 'classical-basic',
    texture: 'homophonic-block',
    harmonicMode: 'conservative',
    harmonicRhythm: '1-per-bar',
    melodyPlacement: 'top',
    tonalCenter: { tonic: { step: 'C', alter: 0 }, mode: 'major' },
    constraints: {
      spacing: 'close',
      omissionPriority: ['5th'],
      avoidParallelFifthsOctaves: true,
      avoidHiddenParallels: true,
      preferStepwiseInnerVoices: true,
    },
  };
  const voicingCandidate: VoicingCandidate = {
    candidateId: 'cross-measure-candidate',
    summary: 'Hold the top note across the barline',
    confidence: 'high',
    slices: [
      {
        measure: 1,
        beatNum: 4,
        beatDen: 4,
        harmony: 'G',
        functionLabel: 'dominant',
        voices: [
          { voiceIndex: 1, role: 'melody', pitch: { step: 'B', alter: 0, octave: 4 } },
          { voiceIndex: 2, role: 'inner', pitch: null },
          { voiceIndex: 3, role: 'bass', pitch: null },
        ],
      },
      {
        measure: 2,
        beatNum: 2,
        beatDen: 4,
        harmony: 'C',
        functionLabel: 'tonic',
        voices: [
          { voiceIndex: 1, role: 'melody', pitch: { step: 'C', alter: 0, octave: 5 } },
          { voiceIndex: 2, role: 'inner', pitch: null },
          { voiceIndex: 3, role: 'bass', pitch: null },
        ],
      },
    ],
  };

  const result = realizeArrangement({
    documentState,
    spec,
    voicingCandidate,
  });

  assert.equal(result.valid, true);
  const measures = result.documentState?.coreDocument?.score.parts[0]?.staves[0]?.measures ?? [];
  const firstVoiceMeasureOne = measures[0]?.voices.find((voice) => voice.voiceId === 1);
  const firstVoiceMeasureTwo = measures[1]?.voices.find((voice) => voice.voiceId === 1);
  const firstFragment = firstVoiceMeasureOne?.events.find((event) => event.kind === 'note' && event.timestampNum === 3);
  const secondFragment = firstVoiceMeasureTwo?.events.find((event) => event.kind === 'note' && event.timestampNum === 0);

  assert.equal(firstFragment?.kind, 'note');
  assert.equal(firstFragment?.tieStart, true);
  assert.equal(secondFragment?.kind, 'note');
  assert.equal(secondFragment?.pitch.step, 'B');
});
