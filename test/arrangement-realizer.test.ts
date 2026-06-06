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

test('buildRealizationPlan rejects materialized mode for ambiguous multi-part scores', () => {
  const fixture = PLANNER_RESPONSE_FIXTURES.find((entry) => entry.name === 'generalbass-outer-voice-valid');
  assert.ok(fixture);
  if (!fixture) return;
  const documentState = buildDocumentState(TWO_PART_XML);
  const voicingCandidate = fixture.response.voicingCandidates[0];
  assert.ok(voicingCandidate);
  if (!voicingCandidate) return;

  const result = buildRealizationPlan({
    documentState,
    spec: fixture.response.spec,
    voicingCandidate,
    harmonicCandidate: fixture.response.harmonicPlanCandidates[0],
  });

  assert.equal(result.plan, null);
  assert.ok(result.issues.some((issue) => issue.code === 'ambiguous-target-part'));
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
