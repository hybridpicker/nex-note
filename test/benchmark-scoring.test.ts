import test from 'node:test';
import assert from 'node:assert/strict';

import type { ProviderName } from '../lib/ai-provider-config.ts';
import type { AIResponse } from '../lib/ai-providers.ts';
import {
  ASSISTANT_TASK_CATALOG,
  buildExpectedCatalogAssistantResult,
  catalogTasksByLevel,
} from '../lib/assistant-task-catalog.ts';
import { OLLAMA_MODEL_SUITE, type TestCase } from '../lib/benchmark-suite.ts';
import { commandTypes, scoreBenchmarkResult } from '../lib/benchmark-scoring.ts';
import { runAiCommandPipeline } from '../src/nex-note/pipeline/run-ai-command-pipeline.ts';

const SAMPLE_XML = `<?xml version="1.0" encoding="UTF-8"?>
<score-partwise version="3.1">
  <work><work-title>Benchmark Harness Test Score</work-title></work>
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

function suiteCase(id: string): TestCase {
  const found = OLLAMA_MODEL_SUITE.find((entry) => entry.id === id);
  assert.ok(found, `missing benchmark case ${id}`);
  return found;
}

function makeAiResponse(text: string, model = 'mock-model'): AIResponse {
  return {
    provider: 'ollama' satisfies ProviderName,
    model,
    text,
    latencyMs: 5,
  };
}

test('scoreBenchmarkResult enforces command field checks, forbidden commands, and confirmation state', () => {
  const testCase: TestCase = {
    id: 'scoring-contract',
    label: 'Scoring contract',
    instruction: 'Add D7 and preview it.',
    expect: {
      commandTypes: ['addChords'],
      commandChecks: [{ type: 'addChords', field: 'chords', includes: 'D7' }],
      forbiddenCommandTypes: ['insertNoteAt'],
      requiresConfirmation: true,
      maxValidatorFindings: 0,
    },
  };

  const passed = scoreBenchmarkResult(testCase, {
    workflow: 'arrangement-assist',
    commands: [{ type: 'addChords', chords: '1:C,2:D7,3:G7,4:C' }],
    requiresConfirmation: true,
    validatorFindings: [],
    ambiguities: [],
  });
  assert.equal(passed.passed, true);
  assert.equal(passed.score, 100);

  const failed = scoreBenchmarkResult(testCase, {
    workflow: 'arrangement-assist',
    commands: [{ type: 'addChords', chords: '1:C,2:G7,3:C' }, { type: 'insertNoteAt' }],
    requiresConfirmation: false,
    validatorFindings: ['range warning'],
    ambiguities: [],
  });
  assert.equal(failed.passed, false);
  assert.match(failed.reasons.join('\n'), /Forbidden command type/);
  assert.match(failed.reasons.join('\n'), /Missing command field expectation/);
  assert.match(failed.reasons.join('\n'), /requiresConfirmation/);
});

test('new benchmark tasks cover technical, theory, arrangement, and composition-rule regressions', () => {
  assert.equal(suiteCase('technical_clarinet_playability').category, 'analysis');
  assert.equal(suiteCase('theory_cadence_secondary_dominant').expect?.commandChecks?.[0]?.includes, 'D7');
  assert.equal(suiteCase('arrangement_generalbass_three_voice').expect?.requiresConfirmation, true);
  assert.deepEqual(suiteCase('composition_brief_missing').expect?.forbiddenCommandTypes, ['insertNoteAt']);
});

test('professor benchmark horde spans advanced theory, composition, analysis, practice, and arrangement', () => {
  const professorCases = OLLAMA_MODEL_SUITE.filter((entry) => entry.id.startsWith('prof_'));
  assert.ok(professorCases.length >= 20);
  assert.ok(professorCases.some((entry) => entry.id === 'prof_theory_neapolitan_predominant'));
  assert.ok(professorCases.some((entry) => entry.id === 'prof_theory_augmented_sixth'));
  assert.ok(professorCases.some((entry) => entry.id === 'prof_composition_period_dolce'));
  assert.ok(professorCases.some((entry) => entry.id === 'prof_arrangement_clarinet_transposition'));

  const categories = new Set(professorCases.map((entry) => entry.category));
  assert.ok(categories.has('analysis'));
  assert.ok(categories.has('harmony'));
  assert.ok(categories.has('workflow'));
  assert.ok(categories.has('practice'));
  assert.ok(categories.has('arrangement'));

  const strictChecks = professorCases.filter((entry) => (entry.expect?.commandChecks?.length ?? 0) > 0);
  assert.ok(strictChecks.length >= 6);
  const confirmationCases = professorCases.filter((entry) => entry.expect?.requiresConfirmation === true);
  assert.ok(confirmationCases.length >= 8);
});

test('assistant task catalog keeps staged levels, supplements, and varied source textures', () => {
  assert.equal(ASSISTANT_TASK_CATALOG.length, 265);
  const ids = new Set(ASSISTANT_TASK_CATALOG.map((entry) => entry.id));
  assert.equal(ids.size, ASSISTANT_TASK_CATALOG.length);

  (['anfang'] as const).forEach((level) => {
    const tasks = catalogTasksByLevel(level);
    assert.equal(tasks.length, 50, level);
    assert.equal(new Set(tasks.map((entry) => entry.sourceProfile)).size, 10, level);
    assert.ok(new Set(tasks.map((entry) => entry.category)).size >= 5, level);
  });

  (['mittel', 'schwer', 'richtig-schwer'] as const).forEach((level) => {
    const tasks = catalogTasksByLevel(level);
    assert.equal(tasks.length, 55, level);
    assert.ok(new Set(tasks.map((entry) => entry.sourceProfile)).size >= 15, level);
    assert.ok(new Set(tasks.map((entry) => entry.category)).size >= 5, level);
  });

  const meisterklasse = catalogTasksByLevel('meisterklasse');
  assert.equal(meisterklasse.length, 50);
  assert.equal(meisterklasse.filter((entry) => Number(entry.id.match(/^meisterklasse_(\d+)/)?.[1] ?? 0) <= 25).length, 25);
  assert.equal(meisterklasse.filter((entry) => Number(entry.id.match(/^meisterklasse_(\d+)/)?.[1] ?? 0) >= 26).length, 25);

  assert.ok(new Set(ASSISTANT_TASK_CATALOG.map((entry) => entry.texture)).size >= 8);
  assert.ok(ASSISTANT_TASK_CATALOG.some((entry) => entry.texture === 'four-voice'));
  assert.ok(ASSISTANT_TASK_CATALOG.some((entry) => entry.texture === 'polyphonic'));
  assert.ok(ASSISTANT_TASK_CATALOG.some((entry) => entry.texture === 'dense-score'));
  assert.ok(ASSISTANT_TASK_CATALOG.some((entry) => entry.texture === 'film-score'));
  assert.ok(ASSISTANT_TASK_CATALOG.some((entry) => entry.texture === 'electronic'));
  assert.ok(ASSISTANT_TASK_CATALOG.some((entry) => entry.texture === 'full-orchestra'));
});

test('assistant task catalog expected answers satisfy their scoring rubrics', () => {
  ASSISTANT_TASK_CATALOG.forEach((task) => {
    const result = scoreBenchmarkResult(task, buildExpectedCatalogAssistantResult(task));
    assert.equal(result.passed, true, `${task.id}: ${result.reasons.join('; ')}`);
  });
});

test('assistant task catalog samples run through the real local pipeline and score', async () => {
  const sampledIds = [
    'anfang_01_one-bar-stepwise-c_read-score',
    'anfang_04_one-bar-stepwise-c_easy-arrange',
    'anfang_05_one-bar-stepwise-c_practice-version',
  ];

  for (const id of sampledIds) {
    const task = ASSISTANT_TASK_CATALOG.find((entry) => entry.id === id);
    assert.ok(task, id);
    if (!task) continue;
    const result = await runAiCommandPipeline({
      message: task.instruction,
      xml: SAMPLE_XML,
      provider: 'ollama',
      ask: async (): Promise<AIResponse> => {
        throw new Error(`local catalog sample should not call model: ${id}`);
      },
    });

    assert.ok(!('error' in result), id);
    if ('error' in result) continue;
    const scored = scoreBenchmarkResult(task, result);
    assert.equal(scored.passed, true, `${id}: ${scored.reasons.join('; ')}`);
  }
});

test('harmony tasks that mention melody do not trigger composition-brief fallback', async () => {
  const task = ASSISTANT_TASK_CATALOG.find((entry) => entry.id === 'anfang_02_one-bar-stepwise-c_basic-chords');
  assert.ok(task);
  if (!task) return;
  let askCalled = false;
  const result = await runAiCommandPipeline({
    message: task.instruction,
    xml: SAMPLE_XML,
    provider: 'ollama',
    ask: async (): Promise<AIResponse> => {
      askCalled = true;
      throw new Error('local harmony helper should not call model');
    },
  });

  assert.equal(askCalled, false);
  assert.ok(!('error' in result));
  if ('error' in result) return;
  assert.deepEqual(result.ambiguities, []);
  assert.ok(commandTypes(result.commands).includes('addChords'));
  assert.equal(scoreBenchmarkResult(task, result).passed, true);
});

test('composition brief benchmark passes only when the assistant asks before writing generic notes', async () => {
  const testCase = suiteCase('composition_brief_missing');
  const result = await runAiCommandPipeline({
    message: testCase.instruction,
    xml: SAMPLE_XML,
    provider: 'ollama',
    ask: async (): Promise<AIResponse> => {
      throw new Error('should not call model for missing composition brief');
    },
  });

  assert.ok(!('error' in result));
  if ('error' in result) return;
  assert.deepEqual(commandTypes(result.commands), []);
  assert.equal(result.confidence, 'low');
  assert.ok(result.ambiguities.length >= 2);
  assert.equal(scoreBenchmarkResult(testCase, result).passed, true);
});

test('generalbass arrangement benchmark scores a two-stage planner result with checked voicing', async () => {
  const testCase = suiteCase('arrangement_generalbass_three_voice');
  const harmonicDraft = {
    harmonicPlanCandidates: [
      {
        candidateId: 'harm-gb-c',
        summary: 'C major I-IV-V-I bass framework',
        confidence: 'high',
        segments: [
          { segmentId: 'seg-c-i', measure: 1, beatNum: 1, beatDen: 4, chosen: 'C', functionLabel: 'tonic', durationBeats: 1 },
          { segmentId: 'seg-c-iv', measure: 1, beatNum: 2, beatDen: 4, chosen: 'F', functionLabel: 'predominant', durationBeats: 1 },
          { segmentId: 'seg-c-v', measure: 1, beatNum: 3, beatDen: 4, chosen: 'G', functionLabel: 'dominant', durationBeats: 1 },
          { segmentId: 'seg-c-i2', measure: 1, beatNum: 4, beatDen: 4, chosen: 'C', functionLabel: 'tonic', durationBeats: 1 },
        ],
      },
    ],
    notes: ['benchmark harmonic draft'],
  };
  const voicingDraft = {
    voicingCandidates: [
      {
        candidateId: 'voice-gb-c',
        basedOnHarmonicCandidateId: 'harm-gb-c',
        summary: 'Outer voices lead with resolved dominant tendency tone',
        confidence: 'high',
        slices: [
          {
            measure: 1,
            beatNum: 1,
            beatDen: 4,
            harmony: 'C',
            functionLabel: 'tonic',
            harmonicSegmentId: 'seg-c-i',
            voices: [
              { voiceIndex: 1, role: 'melody', pitch: { step: 'E', alter: 0, octave: 5 } },
              { voiceIndex: 2, role: 'inner', pitch: { step: 'C', alter: 0, octave: 5 } },
              { voiceIndex: 3, role: 'bass', pitch: { step: 'C', alter: 0, octave: 3 } },
            ],
          },
          {
            measure: 1,
            beatNum: 2,
            beatDen: 4,
            harmony: 'F',
            functionLabel: 'predominant',
            harmonicSegmentId: 'seg-c-iv',
            voices: [
              { voiceIndex: 1, role: 'melody', pitch: { step: 'F', alter: 0, octave: 5 } },
              { voiceIndex: 2, role: 'inner', pitch: { step: 'C', alter: 0, octave: 5 } },
              { voiceIndex: 3, role: 'bass', pitch: { step: 'F', alter: 0, octave: 3 } },
            ],
          },
          {
            measure: 1,
            beatNum: 3,
            beatDen: 4,
            harmony: 'G',
            functionLabel: 'dominant',
            harmonicSegmentId: 'seg-c-v',
            voices: [
              { voiceIndex: 1, role: 'melody', pitch: { step: 'B', alter: 0, octave: 4 } },
              { voiceIndex: 2, role: 'inner', pitch: { step: 'G', alter: 0, octave: 4 } },
              { voiceIndex: 3, role: 'bass', pitch: { step: 'G', alter: 0, octave: 3 } },
            ],
          },
          {
            measure: 1,
            beatNum: 4,
            beatDen: 4,
            harmony: 'C',
            functionLabel: 'tonic',
            harmonicSegmentId: 'seg-c-i2',
            voices: [
              { voiceIndex: 1, role: 'melody', pitch: { step: 'C', alter: 0, octave: 5 } },
              { voiceIndex: 2, role: 'inner', pitch: { step: 'G', alter: 0, octave: 4 } },
              { voiceIndex: 3, role: 'bass', pitch: { step: 'C', alter: 0, octave: 3 } },
            ],
          },
        ],
      },
    ],
    notes: ['benchmark voicing draft'],
  };

  const result = await runAiCommandPipeline({
    message: testCase.instruction,
    xml: SAMPLE_XML,
    provider: 'ollama',
    ask: async (prompt): Promise<AIResponse> => {
      if (prompt.includes('Stage: Harmonic planner')) return makeAiResponse(JSON.stringify(harmonicDraft), 'mock-harmony-model');
      if (prompt.includes('Stage: Voicing planner')) return makeAiResponse(JSON.stringify(voicingDraft), 'mock-voicing-model');
      throw new Error(`Unexpected prompt stage: ${prompt.slice(0, 80)}`);
    },
  });

  assert.ok(!('error' in result));
  if ('error' in result) return;
  assert.equal(result.workflow, 'arrangement-assist');
  assert.equal(result.requiresConfirmation, true);
  assert.deepEqual(result.validatorFindings, []);
  assert.ok(commandTypes(result.commands).includes('addChords'));
  assert.ok(commandTypes(result.commands).includes('addExpressionText'));
  assert.equal(scoreBenchmarkResult(testCase, result).passed, true);
});
