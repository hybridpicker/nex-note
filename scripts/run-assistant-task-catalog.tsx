#!/usr/bin/env node
// @ts-nocheck

import { mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { askProvider } from '../lib/ai-providers.ts';
import {
  ASSISTANT_TASK_CATALOG,
  buildExpectedCatalogAssistantResult,
} from '../lib/assistant-task-catalog.ts';
import { commandTypes, scoreBenchmarkResult } from '../lib/benchmark-scoring.ts';
import { runAiCommandPipeline } from '../src/nex-note/pipeline/run-ai-command-pipeline.ts';

const SAMPLE_XML = `<?xml version="1.0" encoding="UTF-8"?>
<score-partwise version="3.1">
  <work><work-title>Catalog CLI Test Score</work-title></work>
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
      <note><pitch><step>C</step><octave>4</octave></pitch><duration>1</duration><voice>1</voice><type>quarter</type><staff>1</staff></note>
      <note><pitch><step>D</step><octave>4</octave></pitch><duration>1</duration><voice>1</voice><type>quarter</type><staff>1</staff></note>
      <note><pitch><step>E</step><octave>4</octave></pitch><duration>1</duration><voice>1</voice><type>quarter</type><staff>1</staff></note>
      <note><pitch><step>G</step><octave>4</octave></pitch><duration>1</duration><voice>1</voice><type>quarter</type><staff>1</staff></note>
    </measure>
    <measure number="2">
      <note><pitch><step>A</step><octave>4</octave></pitch><duration>1</duration><voice>1</voice><type>quarter</type><staff>1</staff></note>
      <note><pitch><step>G</step><octave>4</octave></pitch><duration>1</duration><voice>1</voice><type>quarter</type><staff>1</staff></note>
      <note><pitch><step>E</step><octave>4</octave></pitch><duration>1</duration><voice>1</voice><type>quarter</type><staff>1</staff></note>
      <note><pitch><step>C</step><octave>4</octave></pitch><duration>1</duration><voice>1</voice><type>quarter</type><staff>1</staff></note>
    </measure>
    <measure number="3">
      <note><pitch><step>F</step><octave>4</octave></pitch><duration>1</duration><voice>1</voice><type>quarter</type><staff>1</staff></note>
      <note><pitch><step>A</step><octave>4</octave></pitch><duration>1</duration><voice>1</voice><type>quarter</type><staff>1</staff></note>
      <note><pitch><step>G</step><octave>4</octave></pitch><duration>1</duration><voice>1</voice><type>quarter</type><staff>1</staff></note>
      <note><pitch><step>F</step><octave>4</octave></pitch><duration>1</duration><voice>1</voice><type>quarter</type><staff>1</staff></note>
    </measure>
    <measure number="4">
      <note><pitch><step>E</step><octave>4</octave></pitch><duration>1</duration><voice>1</voice><type>quarter</type><staff>1</staff></note>
      <note><pitch><step>D</step><octave>4</octave></pitch><duration>1</duration><voice>1</voice><type>quarter</type><staff>1</staff></note>
      <note><pitch><step>B</step><octave>3</octave></pitch><duration>1</duration><voice>1</voice><type>quarter</type><staff>1</staff></note>
      <note><pitch><step>C</step><octave>4</octave></pitch><duration>1</duration><voice>1</voice><type>quarter</type><staff>1</staff></note>
    </measure>
  </part>
</score-partwise>`;

const C = {
  reset: '\x1b[0m',
  bold: '\x1b[1m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  red: '\x1b[31m',
  gray: '\x1b[90m',
};

function parseArgs(argv) {
  const args = {
    mode: 'expected',
    provider: 'ollama',
    model: undefined,
    level: undefined,
    category: undefined,
    texture: undefined,
    ids: undefined,
    limit: undefined,
    failFast: false,
    json: false,
    out: '.nex/assistant-catalog-results.json',
    promptOut: '.nex/assistant-catalog-optimization-prompt.md',
  };

  for (const arg of argv) {
    if (arg === '--fail-fast') args.failFast = true;
    else if (arg === '--json') args.json = true;
    else if (arg.startsWith('--mode=')) args.mode = arg.slice('--mode='.length);
    else if (arg.startsWith('--provider=')) args.provider = arg.slice('--provider='.length);
    else if (arg.startsWith('--model=')) args.model = arg.slice('--model='.length);
    else if (arg.startsWith('--level=')) args.level = arg.slice('--level='.length);
    else if (arg.startsWith('--category=')) args.category = arg.slice('--category='.length);
    else if (arg.startsWith('--texture=')) args.texture = arg.slice('--texture='.length);
    else if (arg.startsWith('--ids=')) args.ids = new Set(arg.slice('--ids='.length).split(',').map((id) => id.trim()).filter(Boolean));
    else if (arg.startsWith('--limit=')) args.limit = Number.parseInt(arg.slice('--limit='.length), 10);
    else if (arg.startsWith('--out=')) args.out = arg.slice('--out='.length);
    else if (arg.startsWith('--prompt-out=')) args.promptOut = arg.slice('--prompt-out='.length);
    else if (arg === '--help') args.help = true;
  }
  return args;
}

function usage() {
  return [
    'Usage: node --import tsx scripts/run-assistant-task-catalog.mjs [options]',
    '',
    'Options:',
    '  --mode=expected|local|live   expected checks catalog rubrics, local runs deterministic pipeline paths, live calls provider/model',
    '  --level=anfang|mittel|schwer|richtig-schwer|meisterklasse',
    '  --category=analysis|harmony|workflow|arrangement|practice|notation',
    '  --texture=monophonic|two-voice|three-voice|four-voice|piano-two-staff|lead-sheet|ensemble|polyphonic|dense-score|full-orchestra|film-score|hybrid-orchestra|electronic|rhythm-section|big-band|game-score',
    '  --ids=id1,id2',
    '  --limit=N',
    '  --provider=ollama|claude|gemini',
    '  --model=<model-id>',
    '  --fail-fast',
    '  --json',
    '  --out=.nex/assistant-catalog-results.json',
    '  --prompt-out=.nex/assistant-catalog-optimization-prompt.md',
  ].join('\n');
}

function selectedTasks(args) {
  let tasks = [...ASSISTANT_TASK_CATALOG];
  if (args.level) tasks = tasks.filter((task) => task.level === args.level);
  if (args.category) tasks = tasks.filter((task) => task.category === args.category);
  if (args.texture) tasks = tasks.filter((task) => task.texture === args.texture);
  if (args.ids) tasks = tasks.filter((task) => args.ids.has(task.id));
  if (Number.isFinite(args.limit)) tasks = tasks.slice(0, args.limit);
  return tasks;
}

function classifyFailure(result) {
  const reasons = result.reasons.join(' | ');
  if (/Expected workflow/.test(reasons)) return 'routing';
  if (/Missing command type/.test(reasons)) return 'capability-gap';
  if (/Missing command field expectation/.test(reasons)) return 'schema-or-extraction';
  if (/Forbidden command type/.test(reasons)) return 'over-eager-editing';
  if (/validator finding/.test(reasons)) return 'validation';
  if (/ambiguity/.test(reasons)) return 'ambiguity-policy';
  if (/confidence/.test(reasons)) return 'confidence-policy';
  if (/requiresConfirmation/.test(reasons)) return 'confirmation-policy';
  if (/No commands produced/.test(reasons)) return 'no-op';
  return 'other';
}

function buildOptimizationPrompt(summary, failures) {
  const grouped = failures.reduce((acc, entry) => {
    const group = classifyFailure(entry.scored);
    acc[group] = acc[group] ?? [];
    acc[group].push(entry);
    return acc;
  }, {});
  const groups = Object.entries(grouped)
    .map(([group, entries]) => {
      const samples = entries.slice(0, 8).map((entry) => [
        `- ${entry.task.id}`,
        `  level/category/texture: ${entry.task.level}/${entry.task.category}/${entry.task.texture}`,
        `  instruction: ${entry.task.instruction}`,
        `  reasons: ${entry.scored.reasons.join('; ')}`,
        `  commandTypes: ${entry.commandTypes.join(', ') || '(none)'}`,
      ].join('\n')).join('\n');
      return `## ${group} (${entries.length})\n${samples}`;
    })
    .join('\n\n');

  return `# Assistant Catalog Optimization Prompt

You are Codex in the nex-note repository. Improve the assistant task harness and assistant structure until the catalog run is genuinely passable without weakening the musical intent.

Run:

\`\`\`bash
node --import tsx scripts/run-assistant-task-catalog.mjs --mode=${summary.mode} --provider=${summary.provider}${summary.model ? ` --model=${summary.model}` : ''} --out=.nex/assistant-catalog-results.json
npm test
\`\`\`

Rules:
- Do not delete difficult music tasks just to improve the score.
- First decide whether each failure is a routing, command capability, scoring expectation, validator, or prompt/planner issue.
- If the task expectation is too vague for the current command vocabulary, make the expectation more structural and document why.
- If the assistant can reasonably satisfy the task with existing commands, improve routing, prompts, local deterministic helpers, or planner repair behavior.
- Keep arrangement requests previewable when they touch harmony or voicing.
- Keep composition tasks from creating generic notes unless the prompt contains a sufficient brief.
- Preserve the staged catalog structure, including the 50-task meisterklasse capstone level.
- After changes, run the catalog CLI and \`npm test\`.

Current summary:
- total: ${summary.total}
- passed: ${summary.passed}
- failed: ${summary.failed}
- average score: ${summary.averageScore}

Failures:

${groups || 'No failures.'}
`;
}

async function runTask(task, args) {
  const started = Date.now();
  let result;
  if (args.mode === 'expected') {
    result = buildExpectedCatalogAssistantResult(task);
  } else if (args.mode === 'local') {
    result = await runAiCommandPipeline({
      message: task.instruction,
      xml: SAMPLE_XML,
      provider: args.provider,
      ask: async () => ({
        provider: args.provider,
        model: args.model ?? 'local-disabled',
        text: '',
        latencyMs: 0,
        error: 'Model calls are disabled in local catalog mode.',
      }),
    });
  } else if (args.mode === 'live') {
    result = await runAiCommandPipeline({
      message: task.instruction,
      xml: SAMPLE_XML,
      provider: args.provider,
      ollamaModel: args.provider === 'ollama' ? args.model : undefined,
      ask: (prompt, provider, ollamaModel) => askProvider(prompt, provider, ollamaModel),
    });
  } else {
    throw new Error(`Unknown mode: ${args.mode}`);
  }

  const pipelineResult = 'error' in result
    ? { error: result.error, commands: [], validatorFindings: [], ambiguities: [], requiresConfirmation: false }
    : result;
  const scored = scoreBenchmarkResult(task, pipelineResult);
  const commands = 'commands' in pipelineResult && Array.isArray(pipelineResult.commands) ? pipelineResult.commands : [];
  return {
    task,
    scored,
    elapsedMs: Date.now() - started,
    workflow: pipelineResult.workflow ?? null,
    commandTypes: commandTypes(commands),
    explanation: pipelineResult.explanation ?? '',
    validatorFindings: pipelineResult.validatorFindings ?? [],
    ambiguities: pipelineResult.ambiguities ?? [],
  };
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.help) {
    console.log(usage());
    return;
  }

  const tasks = selectedTasks(args);
  if (tasks.length === 0) throw new Error('No catalog tasks selected.');

  const results = [];
  if (!args.json) {
    console.log(`${C.bold}nex-note assistant task catalog${C.reset}`);
    console.log(`mode=${args.mode} tasks=${tasks.length}${args.model ? ` model=${args.model}` : ''}`);
  }

  for (const [index, task] of tasks.entries()) {
    const entry = await runTask(task, args);
    results.push(entry);
    if (!args.json) {
      const mark = entry.scored.passed ? `${C.green}.${C.reset}` : `${C.red}F${C.reset}`;
      process.stdout.write(mark);
      if ((index + 1) % 50 === 0 || index === tasks.length - 1) process.stdout.write(` ${index + 1}/${tasks.length}\n`);
    }
    if (!entry.scored.passed && args.failFast) break;
  }

  const failures = results.filter((entry) => !entry.scored.passed);
  const totalScore = results.reduce((sum, entry) => sum + entry.scored.score, 0);
  const summary = {
    date: new Date().toISOString(),
    mode: args.mode,
    provider: args.provider,
    model: args.model ?? null,
    total: results.length,
    passed: results.length - failures.length,
    failed: failures.length,
    averageScore: Math.round((totalScore / Math.max(1, results.length)) * 10) / 10,
  };

  const serializableResults = {
    summary,
    failures: failures.map((entry) => ({
      id: entry.task.id,
      level: entry.task.level,
      category: entry.task.category,
      texture: entry.task.texture,
      instruction: entry.task.instruction,
      score: entry.scored.score,
      reasons: entry.scored.reasons,
      workflow: entry.workflow,
      commandTypes: entry.commandTypes,
      validatorFindings: entry.validatorFindings,
      ambiguities: entry.ambiguities,
      explanation: entry.explanation,
    })),
    results: results.map((entry) => ({
      id: entry.task.id,
      level: entry.task.level,
      category: entry.task.category,
      texture: entry.task.texture,
      score: entry.scored.score,
      passed: entry.scored.passed,
      reasons: entry.scored.reasons,
      workflow: entry.workflow,
      commandTypes: entry.commandTypes,
      elapsedMs: entry.elapsedMs,
    })),
  };

  mkdirSync(path.dirname(args.out), { recursive: true });
  writeFileSync(args.out, JSON.stringify(serializableResults, null, 2));
  const prompt = buildOptimizationPrompt(summary, failures);
  mkdirSync(path.dirname(args.promptOut), { recursive: true });
  writeFileSync(args.promptOut, prompt);

  if (args.json) {
    console.log(JSON.stringify(serializableResults, null, 2));
  } else {
    console.log(`${C.bold}Summary${C.reset}: ${summary.passed}/${summary.total} passed, avg ${summary.averageScore}`);
    console.log(`${C.gray}Results: ${args.out}${C.reset}`);
    console.log(`${C.gray}Optimization prompt: ${args.promptOut}${C.reset}`);
    if (failures.length > 0) {
      const grouped = failures.reduce((acc, entry) => {
        const group = classifyFailure(entry.scored);
        acc[group] = (acc[group] ?? 0) + 1;
        return acc;
      }, {});
      console.log(`${C.yellow}Failure groups:${C.reset} ${Object.entries(grouped).map(([key, value]) => `${key}=${value}`).join(', ')}`);
      process.exitCode = 1;
    }
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
