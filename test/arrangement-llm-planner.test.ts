import test from 'node:test';
import assert from 'node:assert/strict';

import type { AIResponse, ProviderName } from '../lib/ai-providers.ts';
import { buildAiScoreContext } from '../src/nex-note/context/build-ai-score-context.ts';
import { PLANNER_RESPONSE_FIXTURES } from '../src/nex-note/arrangement/fixtures/planner-response-fixtures.ts';
import { planArrangementWithLlm } from '../src/nex-note/arrangement/planners/plan-arrangement-with-llm.ts';
import { runAiCommandPipeline } from '../src/nex-note/pipeline/run-ai-command-pipeline.ts';
import { buildDocumentState } from '../src/score-core/commands/apply-document-commands.ts';

const SAMPLE_XML = `<?xml version="1.0" encoding="UTF-8"?>
<score-partwise version="3.1">
  <work><work-title>Planner Test Score</work-title></work>
  <part-list>
    <score-part id="P1"><part-name>Piano</part-name></score-part>
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
        <duration>1</duration>
        <voice>1</voice>
        <type>quarter</type>
        <staff>1</staff>
      </note>
    </measure>
  </part>
</score-partwise>`;

function makeAiResponse(text: string, model: string): AIResponse {
  return {
    provider: 'ollama' satisfies ProviderName,
    model,
    text,
    latencyMs: 5,
  };
}

test('planArrangementWithLlm runs harmony, voicing, then repair while keeping harmony fixed', async () => {
  const documentState = buildDocumentState(SAMPLE_XML);
  const context = buildAiScoreContext(documentState);
  const prompts: string[] = [];
  const harmonicDraft = {
    harmonicPlanCandidates: [
      {
        candidateId: 'harm-classical-repair',
        summary: 'Dominant to tonic cadence',
        confidence: 'high',
        segments: [
          {
            segmentId: 'seg-v',
            measure: 1,
            beatNum: 1,
            beatDen: 4,
            chosen: 'G',
            functionLabel: 'dominant',
            durationBeats: 2,
            rationale: 'Cadential dominant supports the melodic leading tone.',
          },
          {
            segmentId: 'seg-i',
            measure: 1,
            beatNum: 3,
            beatDen: 4,
            chosen: 'C',
            functionLabel: 'tonic',
            durationBeats: 2,
            rationale: 'Resolve to tonic after the dominant arrival.',
          },
        ],
      },
    ],
    notes: ['repair-loop fixture'],
  };
  const invalidVoicingDraft = {
    voicingCandidates: [
      {
        candidateId: 'voice-invalid',
        basedOnHarmonicCandidateId: 'harm-classical-repair',
        summary: 'Invalid cadence with doubled and unresolved leading tone',
        confidence: 'medium',
        slices: [
          {
            measure: 1,
            beatNum: 1,
            beatDen: 4,
            harmony: 'G',
            functionLabel: 'dominant',
            harmonicSegmentId: 'seg-v',
            voices: [
              { voiceIndex: 1, role: 'melody', pitch: { step: 'B', alter: 0, octave: 4 } },
              { voiceIndex: 2, role: 'inner', pitch: { step: 'G', alter: 0, octave: 4 } },
              { voiceIndex: 3, role: 'bass', pitch: { step: 'B', alter: 0, octave: 3 } },
            ],
          },
          {
            measure: 1,
            beatNum: 3,
            beatDen: 4,
            harmony: 'C',
            functionLabel: 'tonic',
            harmonicSegmentId: 'seg-i',
            voices: [
              { voiceIndex: 1, role: 'melody', pitch: { step: 'D', alter: 0, octave: 5 } },
              { voiceIndex: 2, role: 'inner', pitch: { step: 'G', alter: 0, octave: 4 } },
              { voiceIndex: 3, role: 'bass', pitch: { step: 'E', alter: 0, octave: 4 } },
            ],
          },
        ],
      },
    ],
    notes: ['invalid voicing draft'],
  };
  const repairedVoicingDraft = {
    voicingCandidates: [
      {
        candidateId: 'voice-repaired',
        basedOnHarmonicCandidateId: 'harm-classical-repair',
        summary: 'Resolved cadence with stable spacing',
        confidence: 'high',
        slices: [
          {
            measure: 1,
            beatNum: 1,
            beatDen: 4,
            harmony: 'G',
            functionLabel: 'dominant',
            harmonicSegmentId: 'seg-v',
            voices: [
              { voiceIndex: 1, role: 'melody', pitch: { step: 'B', alter: 0, octave: 4 } },
              { voiceIndex: 2, role: 'inner', pitch: { step: 'G', alter: 0, octave: 4 } },
              { voiceIndex: 3, role: 'bass', pitch: { step: 'D', alter: 0, octave: 4 } },
            ],
          },
          {
            measure: 1,
            beatNum: 3,
            beatDen: 4,
            harmony: 'C',
            functionLabel: 'tonic',
            harmonicSegmentId: 'seg-i',
            voices: [
              { voiceIndex: 1, role: 'melody', pitch: { step: 'C', alter: 0, octave: 5 } },
              { voiceIndex: 2, role: 'inner', pitch: { step: 'G', alter: 0, octave: 4 } },
              { voiceIndex: 3, role: 'bass', pitch: { step: 'E', alter: 0, octave: 4 } },
            ],
          },
        ],
      },
    ],
    notes: ['repaired voicing draft'],
  };

  const result = await planArrangementWithLlm({
    message: 'Mach mir daraus einen dreistimmigen Satz',
    provider: 'ollama',
    ask: async (prompt): Promise<AIResponse> => {
      prompts.push(prompt);
      if (prompt.includes('Stage: Harmonic planner')) {
        return makeAiResponse(JSON.stringify(harmonicDraft), 'mock-harmony-model');
      }
      if (prompt.includes('Stage: Voicing planner')) {
        return makeAiResponse(JSON.stringify(invalidVoicingDraft), 'mock-voicing-model');
      }
      if (prompt.includes('Stage: Voicing repair')) {
        return makeAiResponse(JSON.stringify(repairedVoicingDraft), 'mock-repair-model');
      }
      throw new Error(`Unexpected prompt stage: ${prompt.slice(0, 80)}`);
    },
    documentState,
    context,
  });

  assert.ok(result);
  if (!result) return;
  assert.equal(prompts.length, 3);
  assert.match(prompts[0] ?? '', /Stage: Harmonic planner/);
  assert.match(prompts[1] ?? '', /Stage: Voicing planner/);
  assert.match(prompts[2] ?? '', /Stage: Voicing repair/);
  assert.match(prompts[2] ?? '', /"candidateId": "harm-classical-repair"/);
  assert.match(prompts[2] ?? '', /doubled-leading-tone|unresolved-leading-tone/);
  assert.equal(result.repairAttempts, 1);
  assert.equal(result.model, 'mock-repair-model');
  assert.equal(result.criticIssues.length, 0);
  assert.equal(result.plannerResponse.harmonicPlanCandidates[0]?.candidateId, 'harm-classical-repair');
  assert.equal(result.plannerResponse.voicingCandidates[0]?.candidateId, 'voice-repaired');
  assert.equal(result.intent.planner?.stage, 'two-step-arrangement');
  assert.equal(result.intent.planner?.harmonicCandidateId, 'harm-classical-repair');
  assert.equal(result.intent.planner?.voicingCandidateId, 'voice-repaired');
  assert.ok(result.intent.commands?.some((command) => (command as { type?: string }).type === 'addChords'));
});

test('runAiCommandPipeline uses the LLM arrangement planner for advanced style-aware requests', async () => {
  const prompts: string[] = [];
  const generalbassFixture = PLANNER_RESPONSE_FIXTURES.find((fixture) => fixture.name === 'generalbass-outer-voice-valid');
  assert.ok(generalbassFixture);
  if (!generalbassFixture) return;
  const harmonicDraft = {
    harmonicPlanCandidates: generalbassFixture.response.harmonicPlanCandidates,
    notes: ['generalbass harmonic fixture'],
  };
  const voicingDraft = {
    voicingCandidates: generalbassFixture.response.voicingCandidates,
    notes: ['generalbass voicing fixture'],
  };

  const result = await runAiCommandPipeline({
    message: 'Mach mir daraus einen dreistimmigen Satz im Generalbass',
    xml: SAMPLE_XML,
    provider: 'ollama',
    ask: async (prompt): Promise<AIResponse> => {
      prompts.push(prompt);
      if (prompt.includes('Stage: Harmonic planner')) {
        return makeAiResponse(JSON.stringify(harmonicDraft), 'mock-harmony-model');
      }
      if (prompt.includes('Stage: Voicing planner')) {
        return makeAiResponse(JSON.stringify(voicingDraft), 'mock-voicing-model');
      }
      throw new Error(`Unexpected prompt stage: ${prompt.slice(0, 80)}`);
    },
  });

  assert.ok(!('error' in result));
  if ('error' in result) return;
  assert.equal(prompts.length, 2);
  assert.match(prompts[0] ?? '', /Stage: Harmonic planner/);
  assert.match(prompts[1] ?? '', /Stage: Voicing planner/);
  assert.equal(result.workflow, 'arrangement-assist');
  assert.equal(result.provider, 'ollama');
  assert.equal(result.model, 'mock-voicing-model');
  assert.equal(result.requiresConfirmation, true);
  assert.equal(result.rawIntent.planner?.stage, 'two-step-arrangement');
  assert.equal(result.rawIntent.planner?.stylePack, 'generalbass');
  assert.ok(result.commands.some((command) => command.type === 'addChords'));
  assert.deepEqual(result.validatorFindings, []);
});

test('runAiCommandPipeline falls back to the local arrangement engine when planner JSON is malformed', async () => {
  let askCalls = 0;
  const result = await runAiCommandPipeline({
    message: 'Reharmonisiere diese Melodie als close voicing',
    xml: SAMPLE_XML,
    provider: 'ollama',
    ask: async (): Promise<AIResponse> => {
      askCalls += 1;
      return makeAiResponse('this is not planner json', 'mock-broken-model');
    },
  });

  assert.ok(!('error' in result));
  if ('error' in result) return;
  assert.equal(askCalls, 1);
  assert.equal(result.workflow, 'arrangement-assist');
  assert.equal(result.provider, 'local-layout');
  assert.equal(result.model, 'musician-arrangement-engine');
  assert.equal(result.requiresConfirmation, true);
  assert.ok(result.commands.some((command) => command.type === 'addChords'));
});
