import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import type { AIResponse, ProviderName } from '../lib/ai-providers.ts';
import { buildIntentPrompt } from '../lib/prompts.ts';
import { applyDocumentCommands, buildDocumentState } from '../src/score-core/commands/apply-document-commands.ts';
import { assessAiPlan } from '../src/nex-note/planning/assess-ai-plan.ts';
import { repairCommandBatch } from '../src/nex-note/repair/repair-command-batch.ts';
import { runAiCommandPipeline } from '../src/nex-note/pipeline/run-ai-command-pipeline.ts';
import { PLANNER_RESPONSE_FIXTURES } from '../src/nex-note/arrangement/fixtures/planner-response-fixtures.ts';
import { detectLocalResponseLanguage } from '../src/nex-note/language/local-response-language.ts';

const SAMPLE_XML = `<?xml version="1.0" encoding="UTF-8"?>
<score-partwise version="3.1">
  <work><work-title>Test Score</work-title></work>
  <identification><creator type="composer">Test Composer</creator></identification>
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

const CLEAN_XML = `<?xml version="1.0" encoding="UTF-8"?>
<score-partwise version="3.1">
  <work><work-title>Clean Test Score</work-title></work>
  <identification><creator type="composer">Test Composer</creator></identification>
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
        <duration>4</duration>
        <voice>1</voice>
        <type>whole</type>
        <staff>1</staff>
      </note>
    </measure>
  </part>
</score-partwise>`;

const EIGHT_MEASURE_READING_XML = `<?xml version="1.0" encoding="UTF-8"?>
<score-partwise version="3.1">
  <part-list>
    <score-part id="P1"><part-name>Piano</part-name></score-part>
  </part-list>
  <part id="P1">
    <measure number="1"><attributes><divisions>1</divisions><key><fifths>0</fifths></key><time><beats>4</beats><beat-type>4</beat-type></time><clef><sign>G</sign><line>2</line></clef></attributes><note><pitch><step>C</step><octave>4</octave></pitch><duration>4</duration><voice>1</voice><type>whole</type><staff>1</staff></note></measure>
    <measure number="2"><note><pitch><step>D</step><octave>4</octave></pitch><duration>4</duration><voice>1</voice><type>whole</type><staff>1</staff></note></measure>
    <measure number="3"><note><pitch><step>E</step><octave>4</octave></pitch><duration>4</duration><voice>1</voice><type>whole</type><staff>1</staff></note></measure>
    <measure number="4"><note><pitch><step>F</step><octave>4</octave></pitch><duration>4</duration><voice>1</voice><type>whole</type><staff>1</staff></note></measure>
    <measure number="5"><note><pitch><step>G</step><octave>4</octave></pitch><duration>4</duration><voice>1</voice><type>whole</type><staff>1</staff></note></measure>
    <measure number="6"><note><pitch><step>A</step><octave>4</octave></pitch><duration>4</duration><voice>1</voice><type>whole</type><staff>1</staff></note></measure>
    <measure number="7"><note><pitch><step>B</step><octave>4</octave></pitch><duration>4</duration><voice>1</voice><type>whole</type><staff>1</staff></note></measure>
    <measure number="8"><note><pitch><step>C</step><octave>5</octave></pitch><duration>4</duration><voice>1</voice><type>whole</type><staff>1</staff></note></measure>
  </part>
</score-partwise>`;

const II_V_I_SEVENTHS_XML = `<?xml version="1.0" encoding="UTF-8"?>
<score-partwise version="3.1">
  <part-list>
    <score-part id="P1"><part-name>Piano</part-name></score-part>
  </part-list>
  <part id="P1">
    <measure number="1"><attributes><divisions>1</divisions><key><fifths>0</fifths></key><time><beats>4</beats><beat-type>4</beat-type></time><clef><sign>G</sign><line>2</line></clef></attributes><note><pitch><step>D</step><octave>4</octave></pitch><duration>1</duration><voice>1</voice><type>quarter</type></note><note><pitch><step>F</step><octave>4</octave></pitch><duration>1</duration><voice>1</voice><type>quarter</type></note><note><pitch><step>A</step><octave>4</octave></pitch><duration>1</duration><voice>1</voice><type>quarter</type></note><note><pitch><step>C</step><octave>5</octave></pitch><duration>1</duration><voice>1</voice><type>quarter</type></note></measure>
    <measure number="2"><note><pitch><step>G</step><octave>4</octave></pitch><duration>1</duration><voice>1</voice><type>quarter</type></note><note><pitch><step>B</step><octave>4</octave></pitch><duration>1</duration><voice>1</voice><type>quarter</type></note><note><pitch><step>D</step><octave>5</octave></pitch><duration>1</duration><voice>1</voice><type>quarter</type></note><note><pitch><step>F</step><octave>5</octave></pitch><duration>1</duration><voice>1</voice><type>quarter</type></note></measure>
    <measure number="3"><note><pitch><step>C</step><octave>5</octave></pitch><duration>1</duration><voice>1</voice><type>quarter</type></note><note><pitch><step>E</step><octave>5</octave></pitch><duration>1</duration><voice>1</voice><type>quarter</type></note><note><pitch><step>G</step><octave>5</octave></pitch><duration>1</duration><voice>1</voice><type>quarter</type></note><note><pitch><step>B</step><octave>5</octave></pitch><duration>1</duration><voice>1</voice><type>quarter</type></note></measure>
  </part>
</score-partwise>`;

const G_MAJOR_THREE_FOUR_PIANO_XML = `<?xml version="1.0" encoding="UTF-8"?>
<score-partwise version="3.1">
  <part-list>
    <score-part id="P1"><part-name>Piano</part-name></score-part>
  </part-list>
  <part id="P1">
    <measure number="1">
      <attributes>
        <divisions>1</divisions>
        <key><fifths>1</fifths></key>
        <time><beats>3</beats><beat-type>4</beat-type></time>
        <staves>2</staves>
        <clef number="1"><sign>G</sign><line>2</line></clef>
        <clef number="2"><sign>F</sign><line>4</line></clef>
      </attributes>
      <note><rest measure="yes"/><duration>3</duration><voice>1</voice><type>half</type><dot/><staff>1</staff></note>
      <backup><duration>3</duration></backup>
      <note><rest measure="yes"/><duration>3</duration><voice>1</voice><type>half</type><dot/><staff>2</staff></note>
    </measure>
  </part>
</score-partwise>`;

const TWO_MEASURE_A7_LICK_XML = `<?xml version="1.0" encoding="UTF-8"?>
<score-partwise version="3.1">
  <part-list>
    <score-part id="P1"><part-name>Guitar</part-name></score-part>
  </part-list>
  <part id="P1">
    <measure number="1"><attributes><divisions>2</divisions><key><fifths>2</fifths></key><time><beats>4</beats><beat-type>4</beat-type></time><staves>2</staves><clef number="1"><sign>G</sign><line>2</line></clef><staff-details number="2"><staff-type>tab</staff-type><staff-lines>6</staff-lines></staff-details><clef number="2"><sign>TAB</sign><line>5</line></clef></attributes><harmony><root><root-step>A</root-step></root><kind text="7">dominant</kind></harmony><note><pitch><step>A</step><octave>4</octave></pitch><duration>1</duration><voice>1</voice><type>eighth</type><staff>1</staff></note><note><pitch><step>C</step><alter>1</alter><octave>5</octave></pitch><duration>1</duration><voice>1</voice><type>eighth</type><staff>1</staff></note><note><pitch><step>E</step><octave>5</octave></pitch><duration>1</duration><voice>1</voice><type>eighth</type><staff>1</staff></note><note><pitch><step>G</step><octave>5</octave></pitch><duration>1</duration><voice>1</voice><type>eighth</type><staff>1</staff></note><note><rest/><duration>4</duration><voice>1</voice><type>half</type><staff>1</staff></note><note><pitch><step>A</step><octave>4</octave></pitch><duration>1</duration><voice>1</voice><type>eighth</type><staff>2</staff><notations><technical><string>1</string><fret>5</fret></technical></notations></note><note><pitch><step>C</step><alter>1</alter><octave>5</octave></pitch><duration>1</duration><voice>1</voice><type>eighth</type><staff>2</staff><notations><technical><string>1</string><fret>9</fret></technical></notations></note><note><pitch><step>E</step><octave>5</octave></pitch><duration>1</duration><voice>1</voice><type>eighth</type><staff>2</staff><notations><technical><string>1</string><fret>12</fret></technical></notations></note><note><pitch><step>G</step><octave>5</octave></pitch><duration>1</duration><voice>1</voice><type>eighth</type><staff>2</staff><notations><technical><string>1</string><fret>15</fret></technical></notations></note><note><rest/><duration>4</duration><voice>1</voice><type>half</type><staff>2</staff></note></measure>
    <measure number="2"><harmony><root><root-step>A</root-step></root><kind text="7">dominant</kind></harmony><note><pitch><step>G</step><octave>5</octave></pitch><duration>1</duration><voice>1</voice><type>eighth</type><staff>1</staff></note><note><pitch><step>E</step><octave>5</octave></pitch><duration>1</duration><voice>1</voice><type>eighth</type><staff>1</staff></note><note><pitch><step>C</step><alter>1</alter><octave>5</octave></pitch><duration>1</duration><voice>1</voice><type>eighth</type><staff>1</staff></note><note><pitch><step>A</step><octave>4</octave></pitch><duration>1</duration><voice>1</voice><type>eighth</type><staff>1</staff></note><note><rest/><duration>4</duration><voice>1</voice><type>half</type><staff>1</staff></note><note><pitch><step>G</step><octave>5</octave></pitch><duration>1</duration><voice>1</voice><type>eighth</type><staff>2</staff><notations><technical><string>1</string><fret>15</fret></technical></notations></note><note><pitch><step>E</step><octave>5</octave></pitch><duration>1</duration><voice>1</voice><type>eighth</type><staff>2</staff><notations><technical><string>1</string><fret>12</fret></technical></notations></note><note><pitch><step>C</step><alter>1</alter><octave>5</octave></pitch><duration>1</duration><voice>1</voice><type>eighth</type><staff>2</staff><notations><technical><string>1</string><fret>9</fret></technical></notations></note><note><pitch><step>A</step><octave>4</octave></pitch><duration>1</duration><voice>1</voice><type>eighth</type><staff>2</staff><notations><technical><string>1</string><fret>5</fret></technical></notations></note><note><rest/><duration>4</duration><voice>1</voice><type>half</type><staff>2</staff></note></measure>
  </part>
</score-partwise>`;

const TWO_MEASURE_A7_LICK_SEPARATE_TAB_PARTS_XML = `<?xml version="1.0" encoding="UTF-8"?>
<score-partwise version="3.1">
  <part-list>
    <score-part id="P1"><part-name>Electric Guitar</part-name></score-part>
    <score-part id="P2"><part-name>Electric Guitar</part-name></score-part>
  </part-list>
  <part id="P1">
    <measure number="1"><attributes><divisions>2</divisions><key><fifths>2</fifths></key><time><beats>4</beats><beat-type>4</beat-type></time><clef><sign>G</sign><line>2</line></clef></attributes><harmony><root><root-step>A</root-step></root><kind text="7">dominant</kind></harmony><note><pitch><step>A</step><octave>4</octave></pitch><duration>1</duration><voice>1</voice><type>eighth</type></note><note><pitch><step>C</step><alter>1</alter><octave>5</octave></pitch><duration>1</duration><voice>1</voice><type>eighth</type></note><note><pitch><step>E</step><octave>5</octave></pitch><duration>1</duration><voice>1</voice><type>eighth</type></note><note><pitch><step>G</step><octave>5</octave></pitch><duration>1</duration><voice>1</voice><type>eighth</type></note><note><rest/><duration>4</duration><voice>1</voice><type>half</type></note></measure>
    <measure number="2"><harmony><root><root-step>A</root-step></root><kind text="7">dominant</kind></harmony><note><pitch><step>G</step><octave>5</octave></pitch><duration>1</duration><voice>1</voice><type>eighth</type></note><note><pitch><step>E</step><octave>5</octave></pitch><duration>1</duration><voice>1</voice><type>eighth</type></note><note><pitch><step>C</step><alter>1</alter><octave>5</octave></pitch><duration>1</duration><voice>1</voice><type>eighth</type></note><note><pitch><step>A</step><octave>4</octave></pitch><duration>1</duration><voice>1</voice><type>eighth</type></note><note><rest/><duration>4</duration><voice>1</voice><type>half</type></note></measure>
  </part>
  <part id="P2">
    <measure number="1"><attributes><divisions>2</divisions><key><fifths>2</fifths></key><time><beats>4</beats><beat-type>4</beat-type></time><staff-details><staff-type>tab</staff-type><staff-lines>6</staff-lines></staff-details><clef><sign>TAB</sign><line>5</line></clef></attributes><note><pitch><step>A</step><octave>4</octave></pitch><duration>1</duration><voice>1</voice><type>eighth</type><notations><technical><string>1</string><fret>5</fret></technical></notations></note><note><pitch><step>C</step><alter>1</alter><octave>5</octave></pitch><duration>1</duration><voice>1</voice><type>eighth</type><notations><technical><string>1</string><fret>9</fret></technical></notations></note><note><pitch><step>E</step><octave>5</octave></pitch><duration>1</duration><voice>1</voice><type>eighth</type><notations><technical><string>1</string><fret>12</fret></technical></notations></note><note><pitch><step>G</step><octave>5</octave></pitch><duration>1</duration><voice>1</voice><type>eighth</type><notations><technical><string>1</string><fret>15</fret></technical></notations></note><note><rest/><duration>4</duration><voice>1</voice><type>half</type></note></measure>
    <measure number="2"><note><pitch><step>G</step><octave>5</octave></pitch><duration>1</duration><voice>1</voice><type>eighth</type><notations><technical><string>1</string><fret>15</fret></technical></notations></note><note><pitch><step>E</step><octave>5</octave></pitch><duration>1</duration><voice>1</voice><type>eighth</type><notations><technical><string>1</string><fret>12</fret></technical></notations></note><note><pitch><step>C</step><alter>1</alter><octave>5</octave></pitch><duration>1</duration><voice>1</voice><type>eighth</type><notations><technical><string>1</string><fret>9</fret></technical></notations></note><note><pitch><step>A</step><octave>4</octave></pitch><duration>1</duration><voice>1</voice><type>eighth</type><notations><technical><string>1</string><fret>5</fret></technical></notations></note><note><rest/><duration>4</duration><voice>1</voice><type>half</type></note></measure>
  </part>
</score-partwise>`;

const FOUR_MEASURE_REST_XML = `<?xml version="1.0" encoding="UTF-8"?>
<score-partwise version="3.1">
  <part-list>
    <score-part id="P1"><part-name>Piano</part-name></score-part>
  </part-list>
  <part id="P1">
    <measure number="1"><attributes><divisions>1</divisions><key><fifths>0</fifths></key><time><beats>4</beats><beat-type>4</beat-type></time><clef><sign>G</sign><line>2</line></clef></attributes><note><rest/><duration>4</duration><voice>1</voice><type>whole</type><staff>1</staff></note></measure>
    <measure number="2"><note><rest/><duration>4</duration><voice>1</voice><type>whole</type><staff>1</staff></note></measure>
    <measure number="3"><note><rest/><duration>4</duration><voice>1</voice><type>whole</type><staff>1</staff></note></measure>
    <measure number="4"><note><rest/><duration>4</duration><voice>1</voice><type>whole</type><staff>1</staff></note></measure>
  </part>
</score-partwise>`;

const PICKUP_KEY_XML = `<?xml version="1.0" encoding="UTF-8"?>
<score-partwise version="3.1">
  <part-list>
    <score-part id="P1"><part-name>Piano</part-name></score-part>
  </part-list>
  <part id="P1">
    <measure number="0">
      <attributes>
        <divisions>1</divisions>
        <key><fifths>1</fifths></key>
        <time><beats>1</beats><beat-type>4</beat-type></time>
        <clef><sign>G</sign><line>2</line></clef>
      </attributes>
      <note>
        <rest />
        <duration>1</duration>
        <voice>1</voice>
        <type>quarter</type>
        <staff>1</staff>
      </note>
    </measure>
    <measure number="1">
      <note>
        <pitch><step>G</step><octave>4</octave></pitch>
        <duration>1</duration>
        <voice>1</voice>
        <type>quarter</type>
        <staff>1</staff>
      </note>
    </measure>
  </part>
</score-partwise>`;

const REDUNDANT_CLEF_XML = `<?xml version="1.0" encoding="UTF-8"?>
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
        <pitch><step>C</step><octave>4</octave></pitch>
        <duration>4</duration>
        <voice>1</voice>
        <type>whole</type>
        <staff>1</staff>
      </note>
    </measure>
    <measure number="2">
      <attributes>
        <clef><sign>G</sign><line>2</line></clef>
      </attributes>
      <note>
        <pitch><step>D</step><octave>4</octave></pitch>
        <duration>4</duration>
        <voice>1</voice>
        <type>whole</type>
        <staff>1</staff>
      </note>
    </measure>
  </part>
</score-partwise>`;

function loadFixture(name: string) {
  return readFileSync(path.join(process.cwd(), 'test', 'fixtures', name), 'utf8');
}

test('buildIntentPrompt makes the current English user message override German app locale', () => {
  const prompt = buildIntentPrompt(
    'Transpose this lick to Ab major',
    { score: { title: 'Prompt test' } },
    undefined,
    {
      appLocale: 'de',
      recentUserRequests: ['Transponiere diese Melodie nach F-Dur'],
    },
  );

  assert.match(prompt, /Detected user message language: English/);
  assert.match(prompt, /Write explanation, ambiguities, and plan text in English/);
  assert.match(prompt, /appLocale is only a fallback when the current user message language is unclear/);
});

test('buildIntentPrompt detects French, Spanish, and Chinese user messages', () => {
  const cases = [
    { message: 'Ajoute une mélodie simple à la mesure 1.', language: 'French' },
    { message: 'Agrega una melodía simple en el compás 1.', language: 'Spanish' },
    { message: '请在第一小节写一个简单旋律。', language: 'Chinese' },
  ];

  cases.forEach(({ message, language }) => {
    const prompt = buildIntentPrompt(message, {}, undefined, { appLocale: 'en' });
    assert.match(prompt, new RegExp(`Detected user message language: ${language}`));
    assert.match(prompt, new RegExp(`Write explanation, ambiguities, and plan text in ${language}`));
  });
});

test('local response language routes unsupported locales to English', () => {
  assert.equal(detectLocalResponseLanguage('Ajoute une mélodie simple.', 'de'), 'en');
  assert.equal(detectLocalResponseLanguage('Agrega una melodía simple.', 'de'), 'en');
  assert.equal(detectLocalResponseLanguage('写一个简单旋律。', 'de'), 'en');
  assert.equal(detectLocalResponseLanguage('unklarer lokaler Text', 'fr'), 'en');
  assert.equal(detectLocalResponseLanguage('unklarer lokaler Text', 'de'), 'de');
});

test('repairCommandBatch keeps valid commands and drops invalid ones', () => {
  const repaired = repairCommandBatch([
    { type: 'setTitle', title: 'Updated' },
    { type: 'setTempo', bpm: 0 },
  ]);

  assert.equal(repaired.validCommands.length, 1);
  assert.equal(repaired.validCommands[0].type, 'setTitle');
  assert.equal(repaired.droppedCommands.length, 1);
});

test('assessAiPlan blocks low-confidence ambiguous plans', () => {
  const assessment = assessAiPlan({
    explanation: 'Unsure',
    confidence: 'low',
    ambiguities: ['which part?'],
    plan: ['inspect selection'],
    commands: [],
  });

  assert.equal(assessment.shouldApply, false);
  assert.equal(assessment.confidence, 'low');
  assert.deepEqual(assessment.ambiguities, ['which part?']);
  assert.ok(assessment.riskReasons.includes('Low-confidence AI plan'));
  assert.ok(assessment.riskReasons.includes('Open ambiguities need review'));
});

test('assessAiPlan allows simple high-confidence single-command edits', () => {
  const assessment = assessAiPlan({
    explanation: 'Clear',
    confidence: 'high',
    ambiguities: [],
    plan: ['Set title'],
    commands: [],
  }, {
    commands: [{
      type: 'setTitle',
      title: 'Ready',
      schemaVersion: 1,
      category: 'content',
      target: { scope: 'document' },
      payload: { title: 'Ready' },
    }],
    affectedMeasures: [],
  });

  assert.equal(assessment.shouldApply, true);
  assert.deepEqual(assessment.riskReasons, []);
});

test('runAiCommandPipeline returns requiresConfirmation for low-confidence ambiguous output', async () => {
  const result = await runAiCommandPipeline({
    message: 'Do something unclear',
    xml: SAMPLE_XML,
    provider: 'ollama',
    ask: async (): Promise<AIResponse> => ({
      provider: 'ollama' satisfies ProviderName,
      model: 'mock-model',
      text: '{"commands":[{"type":"setTitle","title":"Maybe"}],"explanation":"Unsicher.","confidence":"low","ambiguities":["Welcher Teil ist gemeint?"],"plan":["Interpret request"]}',
      latencyMs: 5,
    }),
  });

  assert.ok(!('error' in result));
  if ('error' in result) return;
  assert.equal(result.requiresConfirmation, true);
  assert.equal(result.xml, SAMPLE_XML);
  assert.equal(result.commands.length, 1);
  assert.deepEqual(result.ambiguities, ['Welcher Teil ist gemeint?']);
});

test('runAiCommandPipeline preserves non-JSON model replies as no-op explanations', async () => {
  const result = await runAiCommandPipeline({
    message: 'Fix this error',
    xml: SAMPLE_XML,
    provider: 'ollama',
    ask: async (): Promise<AIResponse> => ({
      provider: 'ollama' satisfies ProviderName,
      model: 'mock-model',
      text: 'Das ist eine absolut saubere Architektur. Go for it.',
      latencyMs: 5,
    }),
  });

  assert.ok(!('error' in result));
  if ('error' in result) return;
  assert.equal(result.requiresConfirmation, false);
  assert.equal(result.xml, SAMPLE_XML);
  assert.equal(result.commands.length, 0);
  assert.match(result.explanation, /saubere Architektur/);
  assert.ok(result.diagnostics.some((entry) => entry.code === 'ai_non_json_response'));
});

test('runAiCommandPipeline repairs invalid commands and applies valid ones', async () => {
  const result = await runAiCommandPipeline({
    message: 'Update title',
    xml: SAMPLE_XML,
    provider: 'ollama',
    ask: async (): Promise<AIResponse> => ({
      provider: 'ollama' satisfies ProviderName,
      model: 'mock-model',
      text: '{"commands":[{"type":"setTitle","title":"Core Title"},{"type":"setTempo","bpm":0}],"explanation":"Titel aktualisiert.","confidence":"high","ambiguities":[],"plan":["Set title"]}',
      latencyMs: 5,
    }),
  });

  assert.ok(!('error' in result));
  if ('error' in result) return;
  assert.equal(result.requiresConfirmation, false);
  assert.match(result.xml, /Core Title/);
  assert.equal(result.commands.length, 1);
  assert.ok(result.diagnostics.some((entry) => entry.code === 'ai_command_repaired'));
  assert.deepEqual(result.riskReasons, []);
  assert.deepEqual(result.validatorFindings, []);
});

test('runAiCommandPipeline rewrites redundant clef setters into clef removal for delete requests', async () => {
  let capturedPrompt = '';
  const result = await runAiCommandPipeline({
    message: 'Entferne den Schlüsselwechsel in Takt 2. Der Violinschlüssel aus Takt 1 soll weiter gelten.',
    xml: REDUNDANT_CLEF_XML,
    provider: 'ollama',
    ask: async (prompt): Promise<AIResponse> => {
      capturedPrompt = prompt;
      return {
      provider: 'ollama' satisfies ProviderName,
      model: 'mock-model',
      text: '{"commands":[{"type":"setClef","sign":"G","line":2,"measureNumber":2,"staffIndex":1}],"explanation":"Ich setze den Violinschlüssel in Takt 2 erneut, um den Schlüsselwechsel aufzuheben.","confidence":"high","ambiguities":[],"plan":["Clef in measure 2"]}',
      latencyMs: 5,
      };
    },
  });

  assert.ok(!('error' in result));
  if ('error' in result) return;
  assert.equal(result.requiresConfirmation, false);
  assert.equal(result.commands[0]?.type, 'removeClefChange');
  assert.ok(!result.xml.match(/<measure number="2">[\s\S]*?<clef>/));
  assert.match(capturedPrompt, /mayRenderAtEndOfPreviousMeasure/);
  assert.match(result.explanation, /Ende von Takt 1/);
});

test('runAiCommandPipeline includes selection context and affected measures', async () => {
  let capturedPrompt = '';
  const result = await runAiCommandPipeline({
    message: 'Transpose the selection',
    xml: SAMPLE_XML,
    provider: 'ollama',
    selection: {
      entityIds: ['event:1'],
      anchorEntityId: 'event:1',
      anchor: {
        coreEntityId: 'event:1',
        coreVoiceId: 'voice:1',
        coreMeasureId: 'measure:1',
        corePartId: 'part:P1',
        measureNumber: 1,
        staffIndex: 1,
        voiceId: 1,
        timestampNum: 0,
        timestampDen: 4,
        step: 'C',
        octave: 4,
        alter: 0,
        isRest: false,
        graphicalNote: null,
      },
      partId: 'part:P1',
      staffIndex: 1,
      voiceId: 1,
    },
    ask: async (prompt): Promise<AIResponse> => {
      capturedPrompt = prompt;
      return {
        provider: 'ollama' satisfies ProviderName,
        model: 'mock-model',
        text: '{"commands":[{"type":"transposeChromatic","measureNumber":1,"staffIndex":1,"voiceId":1,"timestampNum":0,"timestampDen":4,"semitones":2}],"explanation":"Transponiert.","confidence":"high","ambiguities":[],"plan":["Transpose selection"]}',
        latencyMs: 5,
      };
    },
  });

  assert.match(capturedPrompt, /selectionCount/);
  assert.ok(!('error' in result));
  if ('error' in result) return;
  assert.deepEqual(result.affectedMeasures, [1]);
});

test('runAiCommandPipeline hydrates single-selection entityId commands with the anchor locator', async () => {
  const result = await runAiCommandPipeline({
    message: 'Transpose the selection',
    xml: SAMPLE_XML,
    provider: 'ollama',
    selection: {
      entityIds: ['event:1'],
      anchorEntityId: 'event:1',
      anchor: {
        coreEntityId: 'event:1',
        coreVoiceId: 'voice:1',
        coreMeasureId: 'measure:1',
        corePartId: 'part:P1',
        measureNumber: 1,
        staffIndex: 1,
        voiceId: 1,
        timestampNum: 0,
        timestampDen: 4,
        step: 'C',
        octave: 4,
        alter: 0,
        isRest: false,
        graphicalNote: null,
      },
      partId: 'part:P1',
      staffIndex: 1,
      voiceId: 1,
    },
    ask: async (): Promise<AIResponse> => ({
      provider: 'ollama' satisfies ProviderName,
      model: 'mock-model',
      text: '{"commands":[{"type":"transposeChromatic","semitones":2,"entityIds":["event:1"]}],"explanation":"Transponiert.","confidence":"high","ambiguities":[],"plan":["Transpose selection"]}',
      latencyMs: 5,
    }),
  });

  assert.ok(!('error' in result));
  if ('error' in result) return;
  assert.equal(result.commands.length, 1);
  assert.equal(result.commands[0].type, 'transposeChromatic');
  assert.equal(result.commands[0].target.locator?.measureNumber, 1);
  assert.equal(result.commands[0].target.locator?.voiceId, 1);
  assert.equal(result.commands[0].payload.semitones, 2);
  assert.ok(!result.diagnostics.some((entry) => entry.code === 'ai_command_repaired'));
});

test('runAiCommandPipeline expands transpose-to-key requests into note transposition plus key change', async () => {
  const result = await runAiCommandPipeline({
    message: 'Transponiere nach Bb-Dur',
    xml: SAMPLE_XML,
    provider: 'ollama',
    ask: async (): Promise<AIResponse> => ({
      provider: 'ollama' satisfies ProviderName,
      model: 'mock-model',
      text: '{"commands":[{"type":"setKey","fifths":-2}],"explanation":"Nach Bb-Dur transponiert.","confidence":"high","ambiguities":[],"plan":["Setze Tonart"]}',
      latencyMs: 5,
    }),
  });

  assert.ok(!('error' in result));
  if ('error' in result) return;
  assert.equal(result.requiresConfirmation, false);
  assert.equal(result.commands.length, 2);
  assert.equal(result.commands[0].type, 'setKey');
  assert.equal(result.commands[1].type, 'transposeDocumentChromatic');
  assert.deepEqual(result.riskReasons, []);
  assert.match(result.xml, /<fifths>-2<\/fifths>/);
  assert.match(result.xml, /<step>B<\/step>/);
  assert.match(result.xml, /<alter>-1<\/alter>/);
  assert.deepEqual(result.validatorFindings, []);
});

test('runAiCommandPipeline derives transpose distance from the earliest declared document key', async () => {
  const result = await runAiCommandPipeline({
    message: 'Transponiere nach Ab-Dur',
    xml: PICKUP_KEY_XML,
    provider: 'ollama',
    ask: async (): Promise<AIResponse> => ({
      provider: 'ollama' satisfies ProviderName,
      model: 'mock-model',
      text: '{"commands":[{"type":"setKey","fifths":-4}],"explanation":"Nach Ab-Dur transponiert.","confidence":"high","ambiguities":[],"plan":["Setze Tonart"]}',
      latencyMs: 5,
    }),
  });

  assert.ok(!('error' in result));
  if ('error' in result) return;
  assert.equal(result.commands.length, 2);
  assert.equal(result.commands[0].type, 'setKey');
  assert.equal(result.commands[1].type, 'transposeDocumentChromatic');
  assert.equal(result.commands[1].payload.semitones, 1);
});

test('runAiCommandPipeline auto-applies transpose-to-key requests when staff details are present', async () => {
  const xmlWithStaffDetails = SAMPLE_XML.replace(
    '<attributes>',
    '<attributes><staff-details><staff-lines>5</staff-lines></staff-details>',
  );
  const result = await runAiCommandPipeline({
    message: 'Transpose this Lick to Ab Major',
    xml: xmlWithStaffDetails,
    provider: 'ollama',
    ask: async (): Promise<AIResponse> => ({
      provider: 'ollama' satisfies ProviderName,
      model: 'mock-model',
      text: '{"commands":[{"type":"transposeDocumentChromatic","semitones":-4},{"type":"setKey","fifths":-4}],"explanation":"Transposed to Ab major.","confidence":"high","ambiguities":[],"plan":["Transpose all notes down 4 semitones","Set key signature to Ab major"]}',
      latencyMs: 5,
    }),
  });

  assert.ok(!('error' in result));
  if ('error' in result) return;
  assert.equal(result.requiresConfirmation, false);
  assert.deepEqual(result.commands.map((command) => command.type), ['transposeDocumentChromatic', 'setKey']);
  assert.deepEqual(result.validatorFindings, []);
  assert.ok(!result.diagnostics.some((entry) => entry.code === 'legacy_fallback'));
  assert.match(result.xml, /<staff-details><staff-lines>5<\/staff-lines><\/staff-details>/);
  assert.match(result.xml, /<fifths>-4<\/fifths>/);
  assert.match(result.xml, /<step>A<\/step>/);
  assert.match(result.xml, /<alter>-1<\/alter>/);
});

test('runAiCommandPipeline does not duplicate an explicit document transpose for transpose-to-key requests', async () => {
  const result = await runAiCommandPipeline({
    message: 'Transponiere nach Ab-Dur',
    xml: SAMPLE_XML,
    provider: 'ollama',
    ask: async (): Promise<AIResponse> => ({
      provider: 'ollama' satisfies ProviderName,
      model: 'mock-model',
      text: '{"commands":[{"type":"transposeDocumentChromatic","semitones":-1},{"type":"setKey","fifths":-4}],"explanation":"Nach Ab-Dur transponiert.","confidence":"high","ambiguities":[],"plan":["Transponiere alle Noten chromatisch um -1 Halbton","Setze die Vorzeichen auf Ab-Dur (-4 Quinten)"]}',
      latencyMs: 5,
    }),
  });

  assert.ok(!('error' in result));
  if ('error' in result) return;
  assert.deepEqual(result.commands.map((command) => command.type), ['transposeDocumentChromatic', 'setKey']);
});

test('runAiCommandPipeline uses validator repair loop before auto-apply', async () => {
  let callCount = 0;
  const result = await runAiCommandPipeline({
    message: 'Add a lyric syllable',
    xml: CLEAN_XML,
    provider: 'ollama',
    ask: async (prompt): Promise<AIResponse> => {
      callCount += 1;
      if (callCount === 1) {
        return {
          provider: 'ollama' satisfies ProviderName,
          model: 'mock-model',
          text: '{"commands":[{"type":"setLyricLine","measureNumber":1,"staffIndex":1,"voiceId":1,"timestampNum":0,"timestampDen":4,"verseNumber":1,"text":"Hel","syllabic":"begin"}],"explanation":"Lyric syllable added.","confidence":"high","ambiguities":[],"plan":["Set lyric line"]}',
          latencyMs: 5,
        };
      }
      assert.match(prompt, /Validator findings to repair/);
      assert.match(prompt, /lyric_continuity/);
      return {
        provider: 'ollama' satisfies ProviderName,
        model: 'mock-model',
        text: '{"commands":[{"type":"setLyricLine","measureNumber":1,"staffIndex":1,"voiceId":1,"timestampNum":0,"timestampDen":4,"verseNumber":1,"text":"Hel","syllabic":"single"}],"explanation":"Lyric syllable corrected.","confidence":"high","ambiguities":[],"plan":["Set lyric line safely"]}',
        latencyMs: 7,
      };
    },
  });

  assert.equal(callCount, 2);
  assert.ok(!('error' in result));
  if ('error' in result) return;
  assert.equal(result.requiresConfirmation, false);
  assert.equal(result.commands.length, 1);
  assert.equal(result.commands[0].type, 'setLyricLine');
  assert.ok(result.diagnostics.some((entry) => entry.code === 'ai_validator_repair'));
  assert.deepEqual(result.validatorFindings, []);
});

test('runAiCommandPipeline falls back to confirmation when validator findings remain after repair', async () => {
  let callCount = 0;
  const result = await runAiCommandPipeline({
    message: 'Add a lyric syllable',
    xml: CLEAN_XML,
    provider: 'ollama',
    ask: async (): Promise<AIResponse> => {
      callCount += 1;
      return {
        provider: 'ollama' satisfies ProviderName,
        model: 'mock-model',
        text: '{"commands":[{"type":"setLyricLine","measureNumber":1,"staffIndex":1,"voiceId":1,"timestampNum":0,"timestampDen":4,"verseNumber":1,"text":"Hel","syllabic":"begin"}],"explanation":"Lyric syllable added.","confidence":"high","ambiguities":[],"plan":["Set lyric line"]}',
        latencyMs: 5,
      };
    },
  });

  assert.equal(callCount, 2);
  assert.ok(!('error' in result));
  if ('error' in result) return;
  assert.equal(result.requiresConfirmation, true);
  assert.equal(result.xml, CLEAN_XML);
  assert.ok(result.riskReasons.includes('Validator findings remain after automatic repair'));
  assert.ok(result.validatorFindings.some((entry) => entry.includes('lyric_continuity')));
});

test('runAiCommandPipeline routes cleanup requests through the cleanup helper workflow', async () => {
  let capturedPrompt = '';
  const result = await runAiCommandPipeline({
    message: '/cleanup remove dynamics and accents from the score',
    xml: SAMPLE_XML,
    provider: 'ollama',
    ask: async (prompt): Promise<AIResponse> => {
      capturedPrompt = prompt;
      return {
        provider: 'ollama' satisfies ProviderName,
        model: 'mock-model',
        text: '{"commands":[{"type":"removeArticulations"}],"explanation":"Artikulationen bereinigt.","confidence":"high","ambiguities":[],"plan":["Clean notation clutter"]}',
        latencyMs: 5,
      };
    },
  });

  assert.match(capturedPrompt, /Workflow: Cleanup helper/);
  assert.match(capturedPrompt, /cleanup workflow/i);
  assert.ok(!('error' in result));
  if ('error' in result) return;
  assert.equal(result.workflow, 'cleanup');
  assert.equal(result.workflowLabel, 'Cleanup helper');
  assert.equal(result.requiresConfirmation, true);
  assert.ok(result.riskReasons.includes('Cleanup may remove expressive markings across the score'));
});

test('runAiCommandPipeline routes notation repair requests through the repair helper workflow', async () => {
  let capturedPrompt = '';
  const result = await runAiCommandPipeline({
    message: '/repair fix the broken lyric continuity',
    xml: CLEAN_XML,
    provider: 'ollama',
    ask: async (prompt): Promise<AIResponse> => {
      capturedPrompt = prompt;
      return {
        provider: 'ollama' satisfies ProviderName,
        model: 'mock-model',
        text: '{"commands":[{"type":"setLyricLine","measureNumber":1,"staffIndex":1,"voiceId":1,"timestampNum":0,"timestampDen":4,"verseNumber":1,"text":"Hello","syllabic":"single"}],"explanation":"Notation repariert.","confidence":"high","ambiguities":[],"plan":["Repair lyric continuity"]}',
        latencyMs: 5,
      };
    },
  });

  assert.match(capturedPrompt, /Workflow: Notation repair helper/);
  assert.ok(!('error' in result));
  if ('error' in result) return;
  assert.equal(result.workflow, 'notation-repair');
  assert.equal(result.requiresConfirmation, false);
});

test('runAiCommandPipeline routes structural requests through the structural edit helper workflow', async () => {
  let capturedPrompt = '';
  const result = await runAiCommandPipeline({
    message: '/structure insert a measure after measure 1',
    xml: SAMPLE_XML,
    provider: 'ollama',
    ask: async (prompt): Promise<AIResponse> => {
      capturedPrompt = prompt;
      return {
        provider: 'ollama' satisfies ProviderName,
        model: 'mock-model',
        text: '{"commands":[{"type":"insertMeasureAfter","measureNumber":1}],"explanation":"Takt eingefuegt.","confidence":"high","ambiguities":[],"plan":["Insert measure"]}',
        latencyMs: 5,
      };
    },
  });

  assert.match(capturedPrompt, /Workflow: Structural edit helper/);
  assert.ok(!('error' in result));
  if ('error' in result) return;
  assert.equal(result.workflow, 'structural-edit');
  assert.equal(result.requiresConfirmation, true);
  assert.ok(result.riskReasons.includes('Structural notation changes are included'));
});

test('runAiCommandPipeline routes lyric requests through the lyrics helper workflow', async () => {
  let capturedPrompt = '';
  const result = await runAiCommandPipeline({
    message: '/lyrics add verse 2 to the selected note',
    xml: CLEAN_XML,
    provider: 'ollama',
    ask: async (prompt): Promise<AIResponse> => {
      capturedPrompt = prompt;
      return {
        provider: 'ollama' satisfies ProviderName,
        model: 'mock-model',
        text: '{"commands":[{"type":"setLyricLine","measureNumber":1,"staffIndex":1,"voiceId":1,"timestampNum":0,"timestampDen":4,"verseNumber":2,"text":"Sing","syllabic":"single"}],"explanation":"Zweite Strophe gesetzt.","confidence":"high","ambiguities":[],"plan":["Set verse 2 lyric"]}',
        latencyMs: 5,
      };
    },
  });

  assert.match(capturedPrompt, /Workflow: Lyrics helper/);
  assert.ok(!('error' in result));
  if ('error' in result) return;
  assert.equal(result.workflow, 'lyrics');
  assert.equal(result.workflowLabel, 'Lyrics helper');
});

test('runAiCommandPipeline handles analysis requests locally without calling the model', async () => {
  let askCalled = false;
  const result = await runAiCommandPipeline({
    message: '/analyze range and playability',
    xml: CLEAN_XML,
    provider: 'ollama',
    ask: async (): Promise<AIResponse> => {
      askCalled = true;
      return {
        provider: 'ollama' satisfies ProviderName,
        model: 'mock-model',
        text: '{"commands":[],"explanation":"should not run","confidence":"low","ambiguities":[],"plan":[]}',
        latencyMs: 5,
      };
    },
  });

  assert.equal(askCalled, false);
  assert.ok(!('error' in result));
  if ('error' in result) return;
  assert.equal(result.workflow, 'analysis');
  assert.equal(result.provider, 'local-layout');
  assert.equal(result.model, 'musician-analysis-engine');
  assert.equal(result.requiresConfirmation, false);
  assert.equal(result.commands.length, 0);
  assert.match(result.explanation, /range|Umfang/i);
});

test('runAiCommandPipeline prepares a local practice version without calling the model', async () => {
  let askCalled = false;
  const result = await runAiCommandPipeline({
    message: '/practice make a practice version',
    xml: loadFixture('piano-semantics.musicxml'),
    provider: 'ollama',
    ask: async (): Promise<AIResponse> => {
      askCalled = true;
      return {
        provider: 'ollama' satisfies ProviderName,
        model: 'mock-model',
        text: '{"commands":[],"explanation":"should not run","confidence":"low","ambiguities":[],"plan":[]}',
        latencyMs: 5,
      };
    },
  });

  assert.equal(askCalled, false);
  assert.ok(!('error' in result));
  if ('error' in result) return;
  assert.equal(result.workflow, 'practice-assist');
  assert.equal(result.commands.length, 3);
  assert.equal(result.requiresConfirmation, true);
  assert.ok(result.commands.some((command) => command.type === 'addRehearsalMarksEvery'));
  assert.ok(result.commands.some((command) => command.type === 'applyPracticeProfile'));
});

test('runAiCommandPipeline includes session context in the model prompt', async () => {
  let capturedPrompt = '';
  const result = await runAiCommandPipeline({
    message: 'Change title to Session Draft',
    xml: SAMPLE_XML,
    provider: 'ollama',
    sessionContext: {
      mode: 'practice',
      pinnedScope: 'm.1 staff 1 voice 1',
      recentUserRequests: ['Analyze range', 'Prepare practice version'],
    },
    ask: async (prompt): Promise<AIResponse> => {
      capturedPrompt = prompt;
      return {
        provider: 'ollama' satisfies ProviderName,
        model: 'mock-model',
        text: '{"commands":[{"type":"addRehearsalMark","measureNumber":1,"text":"A"}],"explanation":"Probezeichen gesetzt.","confidence":"high","ambiguities":[],"plan":["Add rehearsal mark"]}',
        latencyMs: 5,
      };
    },
  });

  assert.ok(!('error' in result));
  if ('error' in result) return;
  assert.match(capturedPrompt, /"mode": "practice"/);
  assert.match(capturedPrompt, /"pinnedScope": "m\.1 staff 1 voice 1"/);
});

test('runAiCommandPipeline prompt tells the model to use inline melody from the chat message', async () => {
  let capturedPrompt = '';
  const result = await runAiCommandPipeline({
    message: 'Setze den Titel auf "Inline Test" und beachte diese Noten im Chat: C4 D4 E4 G4 | E4 D4 C4',
    xml: SAMPLE_XML,
    provider: 'ollama',
    ask: async (prompt): Promise<AIResponse> => {
      capturedPrompt = prompt;
      return {
        provider: 'ollama' satisfies ProviderName,
        model: 'mock-model',
        text: '{"commands":[],"explanation":"Arrangement vorbereitet.","confidence":"high","ambiguities":[],"plan":["Use inline melody"]}',
        latencyMs: 5,
      };
    },
  });

  assert.ok(!('error' in result));
  if ('error' in result) return;
  assert.match(capturedPrompt, /source melody as inline note names or bars/i);
  assert.match(capturedPrompt, /simple playable piano arrangement/i);
  assert.match(capturedPrompt, /Never claim that a public-domain or Creative-Commons source was used/i);
});

test('runAiCommandPipeline includes melodic score previews in the model prompt', async () => {
  let capturedPrompt = '';
  const result = await runAiCommandPipeline({
    message: 'Setze den Titel auf "Preview Prompt Test"',
    xml: SAMPLE_XML,
    provider: 'ollama',
    ask: async (prompt): Promise<AIResponse> => {
      capturedPrompt = prompt;
      return {
        provider: 'ollama' satisfies ProviderName,
        model: 'mock-model',
        text: '{"commands":[],"explanation":"Arrangement vorbereitet.","confidence":"high","ambiguities":[],"plan":["Inspect score melody"]}',
        latencyMs: 5,
      };
    },
  });

  assert.ok(!('error' in result));
  if ('error' in result) return;
  assert.match(capturedPrompt, /"melodicContext"/);
  assert.match(capturedPrompt, /"preview":\s*"m1:C4\/quarter"/);
  assert.match(capturedPrompt, /musician copilot/i);
  assert.match(capturedPrompt, /playable piano setting/i);
});

test('runAiCommandPipeline answers score-reading requests locally across measures 1-8', async () => {
  let askCalled = false;
  const result = await runAiCommandPipeline({
    message: 'Lies die aktuell geöffnete Partitur. Gib nur den Inhalt von Takt 1 bis 8 wieder.',
    xml: EIGHT_MEASURE_READING_XML,
    provider: 'ollama',
    ask: async (): Promise<AIResponse> => {
      askCalled = true;
      throw new Error('should not call model');
    },
  });

  assert.equal(askCalled, false);
  assert.ok(!('error' in result));
  if ('error' in result) return;
  assert.equal(result.commands.length, 0);
  assert.equal(result.requiresConfirmation, false);
  assert.match(result.explanation, /T\.1: Piano staff 1 voice 1: C4\/whole/);
  assert.match(result.explanation, /T\.8: Piano staff 1 voice 1: C5\/whole/);
});

test('runAiCommandPipeline asks for a brief before composing under-specified melody requests', async () => {
  let askCalled = false;
  const result = await runAiCommandPipeline({
    message: 'schreibe eine achttaktige melodie',
    xml: EIGHT_MEASURE_READING_XML,
    provider: 'ollama',
    ask: async (): Promise<AIResponse> => {
      askCalled = true;
      throw new Error('should not call model');
    },
  });

  assert.equal(askCalled, false);
  assert.ok(!('error' in result));
  if ('error' in result) return;
  assert.equal(result.commands.length, 0);
  assert.equal(result.requiresConfirmation, false);
  assert.equal(result.xml, EIGHT_MEASURE_READING_XML);
  assert.match(result.explanation, /Stil, welches Tempo und welchen Charakter/);
  assert.deepEqual(result.ambiguities, ['Stil fehlt', 'Tempo fehlt', 'Charakter oder Zielinstrument fehlt']);
});

test('runAiCommandPipeline routes Schenker and Forte prompts to analysis annotations with full affected range', async () => {
  const result = await runAiCommandPipeline({
    message: '/analyze Produce a Schenkerian diagnosis for measures 2-4 with Urlinie and structural cadence.',
    xml: EIGHT_MEASURE_READING_XML,
    provider: 'ollama',
    ask: async (): Promise<AIResponse> => {
      throw new Error('semantic local route should not call model');
    },
  });

  assert.ok(!('error' in result));
  if ('error' in result) return;
  assert.equal(result.commands[0]?.type, 'addAnalysisAnnotation');
  assert.equal((result.commands[0] as { analysisType?: string }).analysisType, 'schenkerian');
  assert.deepEqual(result.affectedMeasures, [2, 3, 4]);
});

test('runAiCommandPipeline gates ambiguous extended-technique instructions for preview', async () => {
  const result = await runAiCommandPipeline({
    message: '/repair Normalize contemporary notation with bow pressure, sul ponticello, and scratch tone in measures 1-3.',
    xml: EIGHT_MEASURE_READING_XML,
    provider: 'ollama',
    ask: async (): Promise<AIResponse> => {
      throw new Error('semantic local route should not call model');
    },
  });

  assert.ok(!('error' in result));
  if ('error' in result) return;
  assert.equal(result.commands[0]?.type, 'addTechniqueInstruction');
  assert.equal((result.commands[0] as { instrument?: string }).instrument, 'violin');
  assert.deepEqual(result.affectedMeasures, [1, 2, 3]);
  assert.equal(result.requiresConfirmation, true);
});

test('runAiCommandPipeline routes timecoded sync points to addSyncPoint', async () => {
  const result = await runAiCommandPipeline({
    message: '/analyze Add a sync point at measure 3 timecode 01:02:03:12 for the door slam hit point.',
    xml: EIGHT_MEASURE_READING_XML,
    provider: 'ollama',
    ask: async (): Promise<AIResponse> => {
      throw new Error('semantic local route should not call model');
    },
  });

  assert.ok(!('error' in result));
  if ('error' in result) return;
  assert.equal(result.commands[0]?.type, 'addSyncPoint');
  assert.equal((result.commands[0] as { timecode?: string }).timecode, '01:02:03:12');
  assert.deepEqual(result.affectedMeasures, [3]);
});

test('runAiCommandPipeline keeps orchestration and spatial notes preview gated', async () => {
  const result = await runAiCommandPipeline({
    message: '/arrange Create a spatial audio orchestration concept for measures 1-4 with depth, motion arcs, and mono-compatibility risk.',
    xml: EIGHT_MEASURE_READING_XML,
    provider: 'ollama',
    ask: async (): Promise<AIResponse> => {
      throw new Error('semantic local route should not call model');
    },
  });

  assert.ok(!('error' in result));
  if ('error' in result) return;
  assert.equal(result.commands[0]?.type, 'addOrchestrationNote');
  assert.deepEqual(result.affectedMeasures, [1, 2, 3, 4]);
  assert.equal(result.requiresConfirmation, true);
});

test('runAiCommandPipeline blocks known-song notation without a verified source', async () => {
  let askCalled = false;
  const result = await runAiCommandPipeline({
    message: 'Notiere die Melodie von Kumbaya. Verwende nur eine erlaubte Public-Domain- oder Creative-Commons-Quelle und zeige mir Quelle und Lizenz vor dem Import.',
    xml: EIGHT_MEASURE_READING_XML,
    provider: 'ollama',
    ask: async (): Promise<AIResponse> => {
      askCalled = true;
      throw new Error('should not call model');
    },
  });

  assert.equal(askCalled, false);
  assert.ok(!('error' in result));
  if ('error' in result) return;
  assert.equal(result.commands.length, 0);
  assert.equal(result.requiresConfirmation, false);
  assert.equal(result.xml, EIGHT_MEASURE_READING_XML);
  assert.match(result.explanation, /Urheberrechte.*exakte Notation/);
  assert.match(result.explanation, /MusicXML, MIDI oder PDF/);
  assert.deepEqual(result.ambiguities, ['Quelldatei oder geprüfte Quelle fehlt', 'Katalogimport noch nicht aktiv']);
});

test('runAiCommandPipeline blocks recognizable known-song variations without a verified source', async () => {
  let askCalled = false;
  const result = await runAiCommandPipeline({
    message: 'Schreibe eine Variation über Kumbaya im Stil von Bach.',
    xml: EIGHT_MEASURE_READING_XML,
    provider: 'ollama',
    ask: async (): Promise<AIResponse> => {
      askCalled = true;
      throw new Error('should not call model');
    },
  });

  assert.equal(askCalled, false);
  assert.ok(!('error' in result));
  if ('error' in result) return;
  assert.equal(result.commands.length, 0);
  assert.equal(result.requiresConfirmation, false);
  assert.equal(result.xml, EIGHT_MEASURE_READING_XML);
  assert.match(result.explanation, /Quelldatei oder geprüfte Quelle/);
});

test('runAiCommandPipeline does not block style-only composer references as known-song sources', async () => {
  let askCalled = false;
  const result = await runAiCommandPipeline({
    message: 'Schreibe eine einfache Melodie im Stil von Bach.',
    xml: EIGHT_MEASURE_READING_XML,
    provider: 'ollama',
    ask: async (): Promise<AIResponse> => {
      askCalled = true;
      throw new Error('should not call model');
    },
  });

  assert.equal(askCalled, false);
  assert.ok(!('error' in result));
  if ('error' in result) return;
  assert.ok(result.commands.some((command) => command.type === 'insertNoteAt'));
  assert.equal(result.requiresConfirmation, false);
  assert.notEqual(result.xml, EIGHT_MEASURE_READING_XML);
});

test('runAiCommandPipeline drafts explicit simple German melody requests with varied rhythm', async () => {
  let askCalled = false;
  const result = await runAiCommandPipeline({
    message: 'schreibe eine einfache achttaktige melodie',
    xml: EIGHT_MEASURE_READING_XML,
    provider: 'ollama',
    ask: async (): Promise<AIResponse> => {
      askCalled = true;
      throw new Error('should not call model');
    },
  });

  assert.equal(askCalled, false);
  assert.ok(!('error' in result));
  if ('error' in result) return;
  const insertedNotes = result.commands.filter((command) => command.type === 'insertNoteAt');
  assert.equal(insertedNotes.length, 35);
  assert.equal(result.commands[0]?.type, 'setKey');
  assert.equal(result.requiresConfirmation, false);
  assert.notEqual(result.xml, EIGHT_MEASURE_READING_XML);
  assert.ok(insertedNotes.some((command) => (command as { durationType?: string }).durationType === 'eighth'));
  assert.ok(insertedNotes.some((command) => (command as { durationType?: string }).durationType === 'half'));
  assert.ok(insertedNotes.some((command) => (command as { isDotted?: boolean }).isDotted === true));
  assert.match(result.explanation, /abwechslungsreicher Rhythmik/);
});

test('runAiCommandPipeline drafts simple melodies from key, meter, staff, and character', async () => {
  const runDraft = () => runAiCommandPipeline({
    message: 'write a calm 4 bar melody for left hand',
    xml: G_MAJOR_THREE_FOUR_PIANO_XML,
    provider: 'ollama',
    ask: async (): Promise<AIResponse> => {
      throw new Error('local melody draft should not call model');
    },
  });

  const first = await runDraft();
  const second = await runDraft();
  assert.ok(!('error' in first));
  assert.ok(!('error' in second));
  if ('error' in first || 'error' in second) return;
  assert.deepEqual(first.commands, second.commands);
  assert.equal(first.commands[0]?.type, 'setKey');
  assert.equal(first.commands[0]?.type === 'setKey' ? first.commands[0].fifths : null, 1);
  assert.equal(first.commands[1]?.type, 'setTimeSignature');
  assert.equal(first.commands[1]?.type === 'setTimeSignature' ? first.commands[1].beats : null, 3);
  assert.equal(first.commands[1]?.type === 'setTimeSignature' ? first.commands[1].beatType : null, 4);
  const insertedNotes = first.commands.filter((command): command is Extract<typeof command, { type: 'insertNoteAt' }> => (
    command.type === 'insertNoteAt'
  ));
  assert.equal(insertedNotes.length, 8);
  assert.ok(insertedNotes.every((command) => command.staffIndex === 2));
  assert.ok(insertedNotes.every((command) => command.durationType === 'half' || command.durationType === 'quarter'));
  const finalNote = insertedNotes.at(-1);
  assert.equal(finalNote?.step, 'G');
  assert.equal(finalNote?.alter, 0);
  assert.match(first.explanation, /G major \/ E minor and 3\/4 with calm rhythm/);
});

test('runAiCommandPipeline tolerates common German melody request typos when asking for a brief', async () => {
  let askCalled = false;
  const result = await runAiCommandPipeline({
    message: 'schreibe eine achttakttige meldoie',
    xml: EIGHT_MEASURE_READING_XML,
    provider: 'ollama',
    ask: async (): Promise<AIResponse> => {
      askCalled = true;
      throw new Error('should not call model');
    },
  });

  assert.equal(askCalled, false);
  assert.ok(!('error' in result));
  if ('error' in result) return;
  assert.equal(result.commands.length, 0);
  assert.equal(result.requiresConfirmation, false);
  assert.equal(result.xml, EIGHT_MEASURE_READING_XML);
  assert.match(result.explanation, /Stil, welches Tempo und welchen Charakter/);
});

test('runAiCommandPipeline repairs empty model melody replies into note commands', async () => {
  let askCalled = false;
  const result = await runAiCommandPipeline({
    message: 'melodie bitte',
    xml: EIGHT_MEASURE_READING_XML,
    provider: 'ollama',
    ask: async (): Promise<AIResponse> => {
      askCalled = true;
      return {
        provider: 'ollama' satisfies ProviderName,
        model: 'mock-model',
        text: '{"commands":[],"explanation":"Ich habe eine einfache achttaktige Melodie in C-Dur im oberen System erstellt.","confidence":"high","ambiguities":[],"plan":["Melodie schreiben"]}',
        latencyMs: 5,
      };
    },
  });

  assert.equal(askCalled, true);
  assert.ok(!('error' in result));
  if ('error' in result) return;
  assert.equal(result.commands.filter((command) => command.type === 'insertNoteAt').length, 35);
  assert.equal(result.requiresConfirmation, false);
});

test('runAiCommandPipeline auto-applies high-confidence general multi-measure melody drafts', async () => {
  const result = await runAiCommandPipeline({
    message: 'Run prepared note batch',
    xml: FOUR_MEASURE_REST_XML,
    provider: 'ollama',
    ask: async (): Promise<AIResponse> => ({
      provider: 'ollama' satisfies ProviderName,
      model: 'mock-model',
      text: '{"commands":[{"type":"setKey","fifths":0},{"type":"setTimeSignature","beats":4,"beatType":4,"measureNumber":1},{"type":"setTempo","bpm":96},{"type":"insertNoteAt","measureNumber":1,"staffIndex":1,"voiceId":1,"timestampNum":0,"timestampDen":4,"step":"C","octave":5,"alter":0,"durationType":"quarter"},{"type":"insertNoteAt","measureNumber":2,"staffIndex":1,"voiceId":1,"timestampNum":0,"timestampDen":4,"step":"G","octave":5,"alter":0,"durationType":"quarter"},{"type":"insertNoteAt","measureNumber":3,"staffIndex":1,"voiceId":1,"timestampNum":0,"timestampDen":4,"step":"A","octave":5,"alter":0,"durationType":"quarter"},{"type":"insertNoteAt","measureNumber":4,"staffIndex":1,"voiceId":1,"timestampNum":0,"timestampDen":4,"step":"G","octave":5,"alter":0,"durationType":"quarter"}],"explanation":"Eine Melodie wurde erstellt.","confidence":"high","ambiguities":[],"plan":["Erstelle melodische Kontur","Verteile sie über vier Takte","Schließe mit Kadenz"]}',
      latencyMs: 5,
    }),
  });

  assert.ok(!('error' in result));
  if ('error' in result) return;
  assert.equal(result.requiresConfirmation, false);
  assert.notEqual(result.xml, FOUR_MEASURE_REST_XML);
  assert.deepEqual(result.riskReasons, []);
  assert.equal(result.commands.filter((command) => command.type === 'insertNoteAt').length, 4);
});

test('runAiCommandPipeline reports all measures encoded in addChords previews', async () => {
  const result = await runAiCommandPipeline({
    message: 'Add chord symbols to measures 1, 2, and 8',
    xml: EIGHT_MEASURE_READING_XML,
    provider: 'ollama',
    ask: async (): Promise<AIResponse> => ({
      provider: 'ollama' satisfies ProviderName,
      model: 'mock-model',
      text: '{"commands":[{"type":"addChords","chords":"1:C,2:G,8:C"},{"type":"setTempo","bpm":96}],"explanation":"Chord symbols prepared.","confidence":"high","ambiguities":[],"plan":["Add chords"]}',
      latencyMs: 5,
    }),
  });

  assert.ok(!('error' in result));
  if ('error' in result) return;
  assert.equal(result.requiresConfirmation, true);
  assert.deepEqual(result.affectedMeasures, [1, 2, 8]);
});

test('runAiCommandPipeline local fallback infers seventh chords with ii-V-I smoothing', async () => {
  let askCalls = 0;
  const result = await runAiCommandPipeline({
    message: 'Reharmonisiere diese Melodie als close voicing',
    xml: II_V_I_SEVENTHS_XML,
    provider: 'ollama',
    ask: async (): Promise<AIResponse> => {
      askCalls += 1;
      return {
        provider: 'ollama' satisfies ProviderName,
        model: 'mock-broken-model',
        text: 'not planner JSON',
        latencyMs: 5,
      };
    },
  });

  assert.equal(askCalls, 1);
  assert.ok(!('error' in result));
  if ('error' in result) return;
  assert.equal(result.provider, 'local-layout');
  const chordCommand = result.commands.find((command) => command.type === 'addChords');
  assert.ok(chordCommand);
  if (!chordCommand || chordCommand.type !== 'addChords') return;
  assert.equal(chordCommand.chords, '1:Dm7,2:G7,3:Cmaj7');
});

test('runAiCommandPipeline routes arrangement requests through the arrangement assistant workflow', async () => {
  const prompts: string[] = [];
  const fixture = PLANNER_RESPONSE_FIXTURES.find((entry) => entry.name === 'classical-authentic-cadence-valid');
  assert.ok(fixture);
  if (!fixture) return;

  const result = await runAiCommandPipeline({
    message: 'Arrangiere diese Melodie fuer Klavier',
    xml: SAMPLE_XML,
    provider: 'ollama',
    ask: async (prompt): Promise<AIResponse> => {
      prompts.push(prompt);
      if (prompt.includes('Stage: Harmonic planner')) {
        return {
          provider: 'ollama' satisfies ProviderName,
          model: 'mock-harmony-model',
          text: JSON.stringify({
            harmonicPlanCandidates: fixture.response.harmonicPlanCandidates,
            notes: ['plain arrangement harmonic fixture'],
          }),
          latencyMs: 5,
        };
      }
      if (prompt.includes('Stage: Voicing planner')) {
        return {
          provider: 'ollama' satisfies ProviderName,
          model: 'mock-voicing-model',
          text: JSON.stringify({
            voicingCandidates: fixture.response.voicingCandidates,
            notes: ['plain arrangement voicing fixture'],
          }),
          latencyMs: 5,
        };
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
  assert.equal(result.workflowLabel, 'Arrangement assistant');
  assert.equal(result.provider, 'ollama');
  assert.equal(result.model, 'mock-voicing-model');
  assert.equal(result.requiresConfirmation, true);
  assert.equal(result.rawIntent.planner?.stage, 'two-step-arrangement');
  assert.ok(result.commands.some((command) => command.type === 'addChords'));
  assert.ok(result.commands.some((command) => command.type === 'deleteRange'));
  assert.ok(result.commands.some((command) => command.type === 'insertNoteAt'));
  assert.ok(result.riskReasons.includes('Arrangement suggestions should stay previewable before apply'));
});

test('runAiCommandPipeline keeps English simple catalog arrangements local', async () => {
  let askCalled = false;
  const result = await runAiCommandPipeline({
    message: '/arrange Arrange a one-bar C-major stepwise melody C-D-E-F for flute with clear melody, simple support, and practical expression.',
    xml: SAMPLE_XML,
    provider: 'ollama',
    ask: async (): Promise<AIResponse> => {
      askCalled = true;
      throw new Error('simple catalog arrangement should stay local');
    },
  });

  assert.equal(askCalled, false);
  assert.ok(!('error' in result));
  if ('error' in result) return;
  assert.equal(result.workflow, 'arrangement-assist');
  assert.equal(result.provider, 'local-layout');
  assert.equal(result.model, 'musician-arrangement-engine');
  assert.equal(result.requiresConfirmation, true);
  assert.ok(result.commands.some((command) => command.type === 'addChords'));
  assert.ok(result.commands.some((command) => command.type === 'addExpressionText'));
  const fitCommand = result.commands.find((command) => command.type === 'fitPartToInstrument');
  assert.ok(fitCommand);
  if (!fitCommand || fitCommand.type !== 'fitPartToInstrument') return;
  assert.equal(fitCommand.instrument, 'flute');
});

test('runAiCommandPipeline keeps German simple catalog arrangements local', async () => {
  let askCalled = false;
  const result = await runAiCommandPipeline({
    message: '/arrange Arrangiere eine eintaktige C-Dur-Melodie C-D-E-F fuer Floete mit klarer Melodie, einfacher Begleitung und praktischem Ausdruck.',
    xml: SAMPLE_XML,
    provider: 'ollama',
    ask: async (): Promise<AIResponse> => {
      askCalled = true;
      throw new Error('simple German catalog arrangement should stay local');
    },
    sessionContext: { appLocale: 'de' },
  });

  assert.equal(askCalled, false);
  assert.ok(!('error' in result));
  if ('error' in result) return;
  assert.equal(result.workflow, 'arrangement-assist');
  assert.equal(result.provider, 'local-layout');
  assert.equal(result.model, 'musician-arrangement-engine');
  assert.equal(result.requiresConfirmation, true);
  assert.match(result.explanation, /Ich bereite/);
  assert.equal(result.rawIntent.planner, undefined);
  const fitCommand = result.commands.find((command) => command.type === 'fitPartToInstrument');
  assert.ok(fitCommand);
  if (!fitCommand || fitCommand.type !== 'fitPartToInstrument') return;
  assert.equal(fitCommand.instrument, 'flute');
});

test('runAiCommandPipeline can prepare a local arrangement preview without calling the model', async () => {
  let askCalled = false;
  const result = await runAiCommandPipeline({
    message: '/arrange arrange other version over Gmaj7, F#m7',
    xml: TWO_MEASURE_A7_LICK_XML,
    provider: 'ollama',
    ask: async (): Promise<AIResponse> => {
      askCalled = true;
      throw new Error('should not call model');
    },
  });

  assert.equal(askCalled, false);
  assert.ok(!('error' in result));
  if ('error' in result) return;
  assert.equal(result.workflow, 'arrangement-assist');
  assert.equal(result.provider, 'local-layout');
  assert.equal(result.model, 'musician-arrangement-engine');
  assert.equal(result.requiresConfirmation, true);
  assert.ok(result.commands.some((command) => command.type === 'addChords'));
  assert.ok(result.commands.some((command) => command.type === 'addExpressionText'));
  assert.ok(result.commands.some((command) => command.type === 'clearMeasureVoice'));
  assert.ok(result.commands.some((command) => command.type === 'insertNoteAt'));
  assert.equal(result.rawIntent.planner, undefined);
  assert.ok(result.riskReasons.includes('Arrangement suggestions should stay previewable before apply'));
});

test('runAiCommandPipeline materializes diatonic alternate lick versions from named chords', async () => {
  const result = await runAiCommandPipeline({
    message: 'this is a lick for a7; arrange other version in diatonic system; Gmaj7, F#m7 etc..',
    xml: TWO_MEASURE_A7_LICK_XML,
    provider: 'ollama',
    ask: async (): Promise<AIResponse> => {
      throw new Error('should not call model');
    },
  });

  assert.ok(!('error' in result));
  if ('error' in result) return;
  assert.equal(result.workflow, 'arrangement-assist');
  assert.equal(result.provider, 'local-layout');
  assert.equal(result.model, 'musician-arrangement-engine');
  assert.equal(result.requiresConfirmation, true);
  assert.match(result.explanation, /after the source lick/i);
  assert.match(result.explanation, /original measures stay unchanged/i);
  assert.match(result.explanation, /chromatic figures/i);
  assert.match(result.explanation, /score operations are ready, but no notes have changed yet/i);
  assert.match(result.explanation, /click Apply or type "apply"/i);
  assert.equal(result.commands.filter((command) => command.type === 'insertMeasureAfter').length, 4);
  assert.ok(result.commands.some((command) => command.type === 'clearMeasureVoice' && command.measureNumber === 3));
  assert.ok(result.commands.some((command) => command.type === 'clearMeasureVoice' && command.measureNumber === 4));
  assert.ok(result.commands.some((command) => command.type === 'clearMeasureVoice' && command.measureNumber === 5));
  assert.ok(result.commands.some((command) => command.type === 'clearMeasureVoice' && command.measureNumber === 6));
  assert.ok(result.commands.some((command) => command.type === 'clearMeasureVoice' && command.measureNumber === 3 && command.staffIndex === 2));
  assert.ok(result.commands.some((command) => command.type === 'clearMeasureVoice' && command.measureNumber === 6 && command.staffIndex === 2));
  assert.ok(!result.commands.some((command) => command.type === 'clearMeasureVoice' && (command.measureNumber === 1 || command.measureNumber === 2)));
  assert.ok(result.commands.some((command) => command.type === 'insertNoteAt' && command.measureNumber === 3));
  assert.ok(result.commands.some((command) => command.type === 'insertNoteAt' && command.measureNumber === 4));
  assert.ok(result.commands.some((command) => command.type === 'insertNoteAt' && command.measureNumber === 5));
  assert.ok(result.commands.some((command) => command.type === 'insertNoteAt' && command.measureNumber === 6));
  assert.ok(result.commands.some((command) => command.type === 'insertNoteAt' && command.measureNumber === 3 && command.staffIndex === 2 && command.guitar));
  assert.ok(result.commands.some((command) => command.type === 'insertNoteAt' && command.measureNumber === 6 && command.staffIndex === 2 && command.guitar));
  const insertNoteCommands = result.commands.filter((command): command is Extract<typeof command, { type: 'insertNoteAt' }> => (
    command.type === 'insertNoteAt'
  ));
  const notesByMeasure = new Map<number, string[]>();
  insertNoteCommands
    .filter((command) => command.staffIndex === 1)
    .forEach((command) => {
      const existing = notesByMeasure.get(command.measureNumber) ?? [];
      const accidental = command.alter === 1 ? '#' : command.alter === -1 ? 'b' : '';
      existing.push(`${command.step}${accidental}${command.octave}`);
      notesByMeasure.set(command.measureNumber, existing);
    });
  assert.deepEqual(notesByMeasure.get(3), ['G4', 'B4', 'D5', 'F#5']);
  assert.deepEqual(notesByMeasure.get(4), ['F#5', 'D5', 'B4', 'G4']);
  assert.deepEqual(notesByMeasure.get(5), ['F#4', 'A4', 'C#5', 'E5']);
  assert.deepEqual(notesByMeasure.get(6), ['E5', 'C#5', 'A4', 'F#4']);
  const tabsByMeasure = new Map<number, string[]>();
  insertNoteCommands
    .filter((command) => command.staffIndex === 2 && command.guitar)
    .forEach((command) => {
      const existing = tabsByMeasure.get(command.measureNumber) ?? [];
      existing.push(`${command.guitar!.string}:${command.guitar!.fret}`);
      tabsByMeasure.set(command.measureNumber, existing);
    });
  assert.deepEqual(tabsByMeasure.get(3), ['3:0', '2:0', '2:3', '1:2']);
  assert.deepEqual(tabsByMeasure.get(4), ['1:2', '2:3', '2:0', '3:0']);
  assert.deepEqual(tabsByMeasure.get(5), ['4:4', '3:2', '2:2', '1:0']);
  assert.deepEqual(tabsByMeasure.get(6), ['1:0', '2:2', '3:2', '4:4']);
  const chordCommand = result.commands.find((command) => command.type === 'addChords');
  assert.ok(chordCommand);
  if (!chordCommand || chordCommand.type !== 'addChords') return;
  assert.match(chordCommand.chords, /3:Gmaj7/);
  assert.match(chordCommand.chords, /4:Gmaj7/);
  assert.match(chordCommand.chords, /5:F#m7/);
  assert.match(chordCommand.chords, /6:F#m7/);
  assert.doesNotMatch(chordCommand.chords, /1:Gmaj7/);
  assert.doesNotMatch(chordCommand.chords, /2:F#m7/);
  assert.doesNotMatch(chordCommand.chords, /A7/);
});

test('runAiCommandPipeline does not treat selected TAB notes as duplicate arrangement sources', async () => {
  const state = buildDocumentState(TWO_MEASURE_A7_LICK_XML);
  const selectedIds = state.coreDocument!.score.parts[0]!.staves
    .flatMap((staff) => staff.measures.flatMap((measure) => (
      measure.voices.flatMap((voice) => voice.events.flatMap((event) => (event.kind === 'note' ? [event.id] : [])))
    )));

  const result = await runAiCommandPipeline({
    message: 'this is a lick for a7; arrange other version in diatonic system; Gmaj7, F#m7 etc..',
    xml: TWO_MEASURE_A7_LICK_XML,
    provider: 'ollama',
    selection: {
      entityIds: selectedIds,
      anchorEntityId: selectedIds[0] ?? null,
      anchor: null,
      partId: 'P1',
      selectionCount: selectedIds.length,
    },
    ask: async (): Promise<AIResponse> => {
      throw new Error('should not call model');
    },
  });

  assert.ok(!('error' in result));
  if ('error' in result) return;
  const insertNoteCommands = result.commands.filter((command): command is Extract<typeof command, { type: 'insertNoteAt' }> => (
    command.type === 'insertNoteAt'
  ));
  assert.equal(insertNoteCommands.filter((command) => command.staffIndex === 1).length, 16);
  assert.equal(insertNoteCommands.filter((command) => command.staffIndex === 2 && command.guitar).length, 16);
  assert.ok(!insertNoteCommands.some((command) => command.staffIndex === 2 && !command.guitar));
});

test('runAiCommandPipeline pairs separate MuseScore notation and TAB parts', async () => {
  const result = await runAiCommandPipeline({
    message: 'this is a lick for a7; arrange other version in diatonic system; Gmaj7, F#m7 etc..',
    xml: TWO_MEASURE_A7_LICK_SEPARATE_TAB_PARTS_XML,
    provider: 'ollama',
    ask: async (): Promise<AIResponse> => {
      throw new Error('should not call model');
    },
  });

  assert.ok(!('error' in result));
  if ('error' in result) return;
  const clearCommands = result.commands.filter((command) => command.type === 'clearMeasureVoice');
  assert.equal(clearCommands.filter((command) => command.corePartId === 'part:P1').length, 4);
  assert.equal(clearCommands.filter((command) => command.corePartId === 'part:P2').length, 4);

  const insertNoteCommands = result.commands.filter((command): command is Extract<typeof command, { type: 'insertNoteAt' }> => (
    command.type === 'insertNoteAt'
  ));
  assert.equal(insertNoteCommands.filter((command) => command.corePartId === 'part:P1' && !command.guitar).length, 16);
  assert.equal(insertNoteCommands.filter((command) => command.corePartId === 'part:P2' && command.guitar).length, 16);
  assert.deepEqual(
    insertNoteCommands
      .filter((command) => command.corePartId === 'part:P2' && command.measureNumber === 3 && command.guitar)
      .map((command) => `${command.guitar!.string}:${command.guitar!.fret}`),
    ['3:0', '2:0', '2:3', '1:2'],
  );

  const applied = applyDocumentCommands(buildDocumentState(TWO_MEASURE_A7_LICK_SEPARATE_TAB_PARTS_XML), result.commands);
  const tabMeasures = applied.coreDocument?.score.parts
    .find((part) => part.id === 'part:P2')
    ?.staves[0]?.measures.filter((measure) => measure.measureNumber >= 3 && measure.measureNumber <= 6);
  assert.deepEqual(tabMeasures?.map((measure) => (
    measure.voices.flatMap((voice) => voice.events).filter((event) => event.kind === 'note' && event.guitar).length
  )), [4, 4, 4, 4]);
  assert.match(applied.xml, /<technical><string>3<\/string><fret>0<\/fret><\/technical>/);
});

test('runAiCommandPipeline targets arrangement instrument fitting at the detected part', async () => {
  const prompts: string[] = [];
  const fixture = PLANNER_RESPONSE_FIXTURES.find((entry) => entry.name === 'classical-authentic-cadence-valid');
  assert.ok(fixture);
  if (!fixture) return;

  const result = await runAiCommandPipeline({
    message: '/arrange arrangiere diese Melodie fuer Klarinette',
    xml: SAMPLE_XML,
    provider: 'ollama',
    ask: async (prompt): Promise<AIResponse> => {
      prompts.push(prompt);
      if (prompt.includes('Stage: Harmonic planner')) {
        return {
          provider: 'ollama' satisfies ProviderName,
          model: 'mock-harmony-model',
          text: JSON.stringify({
            harmonicPlanCandidates: fixture.response.harmonicPlanCandidates,
            notes: ['instrument target harmonic fixture'],
          }),
          latencyMs: 5,
        };
      }
      if (prompt.includes('Stage: Voicing planner')) {
        return {
          provider: 'ollama' satisfies ProviderName,
          model: 'mock-voicing-model',
          text: JSON.stringify({
            voicingCandidates: fixture.response.voicingCandidates,
            notes: ['instrument target voicing fixture'],
          }),
          latencyMs: 5,
        };
      }
      throw new Error(`Unexpected prompt stage: ${prompt.slice(0, 80)}`);
    },
  });

  assert.ok(!('error' in result));
  if ('error' in result) return;
  assert.equal(prompts.length, 2);
  assert.equal(result.provider, 'ollama');
  assert.equal(result.rawIntent.planner?.stage, 'two-step-arrangement');
  const fitCommand = result.commands.find((command) => command.type === 'fitPartToInstrument');
  assert.ok(fitCommand);
  if (!fitCommand || fitCommand.type !== 'fitPartToInstrument') return;
  assert.equal(fitCommand.instrument, 'clarinet-bb');
  assert.equal(fitCommand.partId, 'P1');
});

test('runAiCommandPipeline uses instrument task state for local practice previews', async () => {
  const result = await runAiCommandPipeline({
    message: '/practice make this playable',
    xml: CLEAN_XML,
    provider: 'ollama',
    sessionContext: {
      taskState: {
        scoreKey: 'score:test',
        preferredInstrument: 'clarinet-bb',
        practiceProfile: 'roomy',
      },
    },
    ask: async (): Promise<AIResponse> => {
      throw new Error('should not call model');
    },
  });

  assert.ok(!('error' in result));
  if ('error' in result) return;
  assert.ok(result.commands.some((command) => command.type === 'fitPartToInstrument'));
  assert.ok(result.commands.some((command) => command.type === 'applyPracticeProfile' && command.profile === 'roomy'));
});

test('runAiCommandPipeline analysis can surface instrument-specific playability guidance locally', async () => {
  const result = await runAiCommandPipeline({
    message: '/analyze is this playable for clarinet',
    xml: CLEAN_XML.replace('<octave>4</octave>', '<octave>7</octave>'),
    provider: 'ollama',
    ask: async (): Promise<AIResponse> => {
      throw new Error('should not call model');
    },
  });

  assert.ok(!('error' in result));
  if ('error' in result) return;
  assert.match(result.explanation, /clarinet|Klarinette/i);
});

test('runAiCommandPipeline routes layout requests through the layout assistant workflow and keeps them previewable', async () => {
  let capturedPrompt = '';
  const result = await runAiCommandPipeline({
    message: '/layout add a system break before measure 2',
    xml: SAMPLE_XML,
    provider: 'ollama',
    ask: async (prompt): Promise<AIResponse> => {
      capturedPrompt = prompt;
      return {
        provider: 'ollama' satisfies ProviderName,
        model: 'mock-model',
        text: '{"commands":[{"type":"setSystemBreak","measureNumber":1,"value":true}],"explanation":"Systemumbruch vorbereitet.","confidence":"high","ambiguities":[],"plan":[]}',
        latencyMs: 5,
      };
    },
  });

  assert.match(capturedPrompt, /Workflow: Layout assistant/);
  assert.ok(!('error' in result));
  if ('error' in result) return;
  assert.equal(result.workflow, 'layout-assist');
  assert.equal(result.requiresConfirmation, true);
  assert.deepEqual(result.plan, ['Inspect layout area', 'Apply layout hint']);
  assert.ok(result.riskReasons.includes('Layout assistance should stay previewable before apply'));
});

test('runAiCommandPipeline prepares deterministic layout cleanup previews without calling the model', async () => {
  let askCalled = false;
  const result = await runAiCommandPipeline({
    message: '/layout-cleanup tidy up the score layout',
    xml: loadFixture('choir-lyrics.musicxml'),
    provider: 'ollama',
    ask: async (): Promise<AIResponse> => {
      askCalled = true;
      return {
        provider: 'ollama' satisfies ProviderName,
        model: 'mock-model',
        text: '{"commands":[],"explanation":"should not run","confidence":"low","ambiguities":[],"plan":[]}',
        latencyMs: 5,
      };
    },
  });

  assert.equal(askCalled, false);
  assert.ok(!('error' in result));
  if ('error' in result) return;
  assert.equal(result.workflow, 'layout-cleanup');
  assert.equal(result.workflowLabel, 'Layout cleanup assistant');
  assert.equal(result.provider, 'local-layout');
  assert.equal(result.model, 'layout-cleanup-engine');
  assert.equal(result.requiresConfirmation, true);
  assert.ok(result.commands.some((command) => command.type === 'setMeasureLayoutHint'));
  assert.ok(result.riskReasons.includes('Layout assistance should stay previewable before apply'));
  assert.deepEqual(result.plan, ['Inspect current spacing', 'Prepare cleanup hints']);
});

test('runAiCommandPipeline applies deterministic MIDI reconstruction without calling the model', async () => {
  let askCalled = false;
  const result = await runAiCommandPipeline({
    message: '/midi-reconstruct rebuild readable notation after MIDI import',
    xml: loadFixture('piano-semantics.musicxml'),
    provider: 'ollama',
    sessionContext: {
      appLocale: 'en',
      midiImport: {
        format: 'midi',
        durationSeconds: 42,
        ppq: 480,
        tempoBpm: 128,
        timeSignature: { beats: 4, beatType: 4 },
        trackCount: 1,
        noteCount: 120,
        profile: 'piano',
        quantization: '1/16',
        allowTuplets: true,
        preservePerformanceTiming: false,
        tracks: [],
        summary: '120 notes across 1 active track; profile piano; quantization 1/16.',
        plan: [],
        warnings: [],
      },
      taskState: { scoreKey: 'midi-import.mid' },
    },
    ask: async (): Promise<AIResponse> => {
      askCalled = true;
      return {
        provider: 'ollama' satisfies ProviderName,
        model: 'mock-model',
        text: '{"commands":[],"explanation":"should not run","confidence":"low","ambiguities":[],"plan":[]}',
        latencyMs: 5,
      };
    },
  });

  assert.equal(askCalled, false);
  assert.ok(!('error' in result));
  if ('error' in result) return;
  assert.equal(result.workflow, 'midi-reconstruct');
  assert.equal(result.workflowLabel, 'MIDI reconstruction assistant');
  assert.equal(result.provider, 'local-layout');
  assert.equal(result.model, 'midi-reconstruction-engine');
  assert.equal(result.requiresConfirmation, false);
  assert.ok(result.commands.some((command) => command.type === 'setTempo'));
  assert.ok(result.commands.some((command) => command.type === 'setMeasureLayoutHint' || command.type === 'setSystemBreak'));
  assert.equal(result.commands.some((command) => command.type === 'setPageBreak'), false);
});
