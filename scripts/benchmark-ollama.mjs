#!/usr/bin/env node
/**
 * nex-note · Ollama Cloud Benchmark
 *
 * Usage:
 *   node --env-file=.env.local scripts/benchmark-ollama.mjs
 *   node --env-file=.env.local scripts/benchmark-ollama.mjs --quick
 *   node --env-file=.env.local scripts/benchmark-ollama.mjs --models=gemma4:12b,gemma4:31b,qwen3-coder-next
 */

// ─── Config ───────────────────────────────────────────────────────────────────

const OLLAMA_API_KEY = process.env.OLLAMA_API_KEY;
const OLLAMA_BASE    = OLLAMA_API_KEY ? 'https://ollama.com' : 'http://localhost:11434';
const HEADERS        = OLLAMA_API_KEY
  ? { Authorization: `Bearer ${OLLAMA_API_KEY}`, 'Content-Type': 'application/json' }
  : { 'Content-Type': 'application/json' };

const CURATED_MODELS = [
  'gemma4:12b',
  'gemma4:31b',
  'gemma3:27b',
  'qwen3-coder-next',
  'qwen3:30b',
  'qwen2.5:72b',
  'nemotron-super',
  'deepseek-r1:32b',
  'phi4',
  'mistral-large',
  'ministral-3:14b',
];

const QUICK_MODELS = ['gemma4:12b', 'gemma4:31b', 'qwen3-coder-next', 'ministral-3:14b'];

// ─── Test suite ───────────────────────────────────────────────────────────────

const TESTS = [
  {
    id: 'remove_dynamics',
    label: 'Dynamik entfernen',
    instruction: 'Entferne alle Artikulationen und Dynamikangaben (forte, piano, staccato, etc.)',
    expectedOps: ['removeArticulations'],
  },
  {
    id: 'multi_op',
    label: 'Multi-Operation',
    instruction: 'Entferne alle Dynamikangaben und Artikulationen, setze das Tempo auf 90 BPM, und ändere die Tonart auf Es-Dur',
    expectedOps: ['removeArticulations', 'setTempo', 'setKey'],
  },
  {
    id: 'chords',
    label: 'Akkordfolge',
    instruction: 'Füge Akkorde hinzu: Takt 1 G-Dur, Takt 2 Em, Takt 3 C-Dur, Takt 4 D-Dur, Takt 5 G-Dur',
    expectedOps: ['addChords'],
  },
  {
    id: 'full_edit',
    label: 'Vollst. Bearbeitung',
    instruction: 'Setze Titel auf "Finale", Tempo auf 72, Tonart auf B-Dur, und entferne alle Artikulationen und Dynamikangaben',
    expectedOps: ['setTitle', 'setTempo', 'setKey', 'removeArticulations'],
  },
  {
    id: 'tempo_title',
    label: 'Tempo + Titel',
    instruction: 'Ändere das Tempo auf genau 132 BPM und setze den Titel auf "Allegro vivace"',
    expectedOps: ['setTempo', 'setTitle'],
  },
  {
    id: 'deep_clean',
    label: 'Tiefes Bereinigen',
    instruction: 'Entferne alle Dynamikangaben, Staccatos, Akzente, Oktavierungen (8va und 8vb) sowie alle Wiederholungszeichen',
    expectedOps: ['removeArticulations'],
  },
  {
    id: 'chords_key',
    label: 'Akkorde + Tonart',
    instruction: 'Ändere die Tonart auf A-Dur und füge Akkorde hinzu: Takt 1 A-Dur, Takt 2 D-Dur, Takt 3 E-Dur, Takt 4 A-Dur',
    expectedOps: ['setKey', 'addChords'],
  },
];

const SYSTEM_PROMPT = `MusicXML editor. Return ONLY a JSON object.

Operations:
- {"type":"removeArticulations"}
- {"type":"setKey","fifths":N}  (0=C 1=G 2=D 3=A -1=F -2=Bb -3=Eb)
- {"type":"setTempo","bpm":N}
- {"type":"setTitle","title":"..."}
- {"type":"setSubtitle","subtitle":"..."}
- {"type":"addChords","chords":"1:G,2:D,3:C"}

Format: {"operations":[...],"explanation":"one sentence"}`;

// ─── Helpers ──────────────────────────────────────────────────────────────────

const C = {
  reset: '\x1b[0m', bold: '\x1b[1m',
  green: '\x1b[32m', yellow: '\x1b[33m', red: '\x1b[31m', gray: '\x1b[90m', cyan: '\x1b[36m',
};

function parseResponse(text) {
  try {
    const match = text.match(/\{[\s\S]*\}/);
    if (!match) return null;
    const parsed = JSON.parse(match[0]);
    return Array.isArray(parsed.operations) ? parsed : null;
  } catch { return null; }
}

function opAccuracy(parsed, expectedOps) {
  if (!parsed) return 0;
  const found = new Set(parsed.operations.map(o => o.type));
  return Math.round(expectedOps.filter(op => found.has(op)).length / expectedOps.length * 100);
}

async function ask(model, instruction) {
  const t = Date.now();
  try {
    const res = await fetch(`${OLLAMA_BASE}/api/generate`, {
      method: 'POST',
      headers: HEADERS,
      body: JSON.stringify({
        model,
        prompt: `${SYSTEM_PROMPT}\n\nUser instruction: ${instruction}`,
        stream: false,
        options: { temperature: 0.1, num_predict: 2048 },
      }),
      signal: AbortSignal.timeout(120_000),
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json();
    return { text: data.response ?? '', ms: Date.now() - t };
  } catch (err) {
    return { text: '', ms: Date.now() - t, error: String(err) };
  }
}

async function fetchLiveModels() {
  try {
    const res = await fetch(`${OLLAMA_BASE}/api/tags`, { headers: HEADERS, signal: AbortSignal.timeout(5000) });
    if (!res.ok) return null;
    const data = await res.json();
    return (data.models ?? []).map(m => m.name).filter(Boolean);
  } catch { return null; }
}

// ─── Run one model ────────────────────────────────────────────────────────────

async function runModel(model) {
  const label = model.padEnd(26);
  process.stdout.write(`  ${C.gray}${label}${C.reset} `);

  const taskResults = [];
  for (const test of TESTS) {
    const { text, ms, error } = await ask(model, test.instruction);
    const parsed = error ? null : parseResponse(text);
    const acc = parsed ? opAccuracy(parsed, test.expectedOps) : 0;
    taskResults.push({ id: test.id, ok: !!parsed, acc, ms, error: error ?? null, rawText: text });

    if (debug && (error || acc < 100)) {
      console.log(`\n  ${C.yellow}[debug] ${test.label}${C.reset}`);
      if (error) console.log(`  ${C.red}Error: ${error}${C.reset}`);
      else console.log(`  ${C.gray}${text.slice(0, 400)}${C.reset}`);
    }

    const dot = error ? `${C.red}✗${C.reset}`
      : !parsed    ? `${C.red}·${C.reset}`
      : acc === 100 ? `${C.green}·${C.reset}`
      :               `${C.yellow}·${C.reset}`;
    process.stdout.write(dot);
  }
  process.stdout.write('\n');

  const validCount   = taskResults.filter(r => r.ok).length;
  const successRate  = Math.round(validCount / TESTS.length * 100);
  const avgAcc       = Math.round(taskResults.reduce((s, r) => s + r.acc, 0) / TESTS.length);
  const avgMs        = taskResults.reduce((s, r) => s + r.ms, 0) / TESTS.length;
  const latencyScore = Math.max(0, 100 - (avgMs / 1000) * 4);
  const score        = Math.round(successRate * 0.55 + avgAcc * 0.35 + latencyScore * 0.10);

  return { model, score, successRate, avgAcc, avgLatencyS: (avgMs / 1000).toFixed(1), taskResults };
}

// ─── Main ─────────────────────────────────────────────────────────────────────

const argv   = process.argv.slice(2);
const quick  = argv.includes('--quick');
const debug  = argv.includes('--debug');
const modelsArg = argv.find(a => a.startsWith('--models='))?.slice(9);

async function main() {
  const LINE = '─'.repeat(62);

  console.log(`\n${C.bold}nex-note · Ollama Benchmark${C.reset}  (${TESTS.length} tests)`);

  let models;
  if (modelsArg) {
    models = modelsArg.split(',').map(s => s.trim());
    console.log(`Models: ${models.join(', ')}`);
  } else {
    process.stdout.write('Fetching model list… ');
    const live = await fetchLiveModels();
    if (live?.length) {
      models = quick ? live.slice(0, 4) : live;
      console.log(`${C.green}${models.length} live models${C.reset}`);
    } else {
      models = quick ? QUICK_MODELS : CURATED_MODELS;
      console.log(`${C.yellow}using curated list (${models.length} models)${C.reset}`);
    }
  }

  console.log(`${LINE}\n`);

  // Run in parallel batches of 3
  const BATCH = 3;
  const allResults = [];
  for (let i = 0; i < models.length; i += BATCH) {
    const batch = models.slice(i, i + BATCH);
    const results = await Promise.all(batch.map(runModel));
    allResults.push(...results);
  }

  // Sort
  allResults.sort((a, b) => b.score - a.score);

  // Table
  const th = (s, w) => s.padEnd(w);
  const tr = (s, w) => String(s).padStart(w);

  console.log(`\n${LINE}`);
  console.log(
    `${'#'.padStart(2)}  ${th('Model', 26)}` +
    `${tr('Score', 7)}  ${tr('Valid', 6)}  ${tr('Ops%', 6)}  ${tr('Latenz', 7)}`
  );
  console.log(LINE);

  for (let i = 0; i < allResults.length; i++) {
    const r = allResults[i];
    const rank  = String(i + 1).padStart(2);
    const name  = r.model.padEnd(26);
    const score = String(r.score).padStart(7);
    const valid = `${r.successRate}%`.padStart(6);
    const ops   = `${r.avgAcc}%`.padStart(6);
    const lat   = `${r.avgLatencyS}s`.padStart(7);
    const star  = i === 0 ? ` ${C.yellow}★${C.reset}` : '';
    const col   = i === 0 ? C.green : i === 1 ? C.cyan : C.reset;
    console.log(`${rank}  ${col}${name}${C.reset}${score}  ${valid}  ${ops}  ${lat}${star}`);
  }

  console.log(LINE);

  if (allResults.length > 0) {
    const w = allResults[0];
    console.log(`\n${C.bold}Winner: ${C.green}${w.model}${C.reset}${C.bold}  score ${w.score}/100${C.reset}`);
    if (allResults.length > 1) {
      console.log(`+${w.score - allResults[1].score} pts over ${allResults[1].model}`);
    }

    // Failing tasks for winner
    const failing = w.taskResults.filter(r => !r.ok || r.acc < 100);
    if (failing.length > 0) {
      console.log(`\n${C.gray}Weak spots for ${w.model}:${C.reset}`);
      for (const t of failing) {
        const test = TESTS.find(x => x.id === t.id);
        const status = t.error ? 'error' : !t.ok ? 'no JSON' : `ops ${t.acc}%`;
        console.log(`  ${C.gray}${test?.label.padEnd(22)} → ${status}${C.reset}`);
      }
    }
  }

  // Save
  try {
    const { mkdirSync, writeFileSync } = await import('fs');
    mkdirSync('.nex', { recursive: true });
    const path = '.nex/benchmark-ollama-results.json';
    writeFileSync(path, JSON.stringify({ date: new Date().toISOString(), models, results: allResults }, null, 2));
    console.log(`\n${C.gray}Results → ${path}${C.reset}`);
  } catch { /* ignore */ }

  console.log('');
}

main().catch(err => { console.error('Benchmark failed:', err.message); process.exit(1); });
