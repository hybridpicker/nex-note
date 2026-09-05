#!/usr/bin/env node
// Run from any directory; keep evidence outside tracked product assets.
import { spawnSync, execFileSync } from 'node:child_process';
import { mkdirSync, readFileSync, writeFileSync, openSync, closeSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const root = fileURLToPath(new URL('../', import.meta.url));
const args = process.argv.slice(2);
if (args.some((arg) => !['--browser', '--help'].includes(arg))) {
  console.error('Unknown option. Use --help.');
  process.exit(2);
}
if (args.includes('--help')) {
  console.log('node scripts/notation-quality-cycle.mjs [--browser]\nRuns five focused unit gates; --browser adds rendered workflows and semantic-grid fuzz.\nWrites logs and report.json under test-results/notation-quality/.\nPhysical input, audible sound and print review remain manual gates.');
  process.exit(0);
}

const unitGroups = {
  keyboard: ['score-input-resolvers', 'input-by-duration', 'repitch-and-tab-entry', 'accidentals', 'user-visible-note-editor'],
  mouse: ['score-input-edit-map', 'rendered-ghost-grid', 'smart-ghost-note', 'snap-point-contract'],
  tablet: ['tablet-entry-session', 'staff-pitch'],
  playback: ['playback-audio-context', 'playback-cursor', 'playback-sample-bank', 'midi-instruments'],
  formatting: ['layout-regression', 'layout-render-projection', 'layout-snapshot', 'render-layout-bridge', 'user-visible-exports'],
};
const startedAt = new Date().toISOString();
const directory = path.join(root, 'test-results/notation-quality', `${startedAt.replaceAll(':', '-')}-${process.pid}`);
mkdirSync(directory, { recursive: true });
const report = {
  startedAt,
  head: execFileSync('git', ['rev-parse', 'HEAD'], { cwd: root, encoding: 'utf8' }).trim(),
  workingTree: execFileSync('git', ['status', '--short'], { cwd: root, encoding: 'utf8' }).trim(),
  scope: 'Automated regression evidence, not product certification or a usability benchmark.',
  gates: [],
  manualGates: {
    laptopTaskTiming: 'not-run',
    mouseTaskTiming: 'not-run',
    physicalIPadFingerAndPencil: 'not-run',
    audiblePlaybackAndLatency: 'not-run',
    printAndPdfVisualReview: 'not-run',
    electronSmoke: 'not-run',
    xcodeMacOSSmoke: 'not-run',
  },
};
const save = () => writeFileSync(path.join(directory, 'report.json'), `${JSON.stringify(report, null, 2)}\n`);
save();

function run(name, commandArgs, env = {}) {
  const log = path.join(directory, `${name}.log`);
  const descriptor = openSync(log, 'w');
  const start = Date.now();
  console.log(`Running ${name}; log: ${log}`);
  let result;
  try {
    result = spawnSync(process.execPath, commandArgs, {
      cwd: root,
      env: { ...process.env, ...env },
      stdio: ['ignore', descriptor, descriptor],
      timeout: 20 * 60 * 1000,
    });
  } finally {
    closeSync(descriptor);
  }
  report.gates.push({
    name,
    status: result.status === 0 && !result.error ? 'passed' : 'failed',
    exitCode: result.status,
    signal: result.signal,
    error: result.error?.message,
    durationMs: Date.now() - start,
    command: [process.execPath, ...commandArgs],
    log,
  });
  save();
  console.log(`${name}: ${report.gates.at(-1).status}`);
}

for (const [name, files] of Object.entries(unitGroups)) {
  run(name, ['--import', 'tsx', '--test', ...files.map((file) => `test/${file}.test.ts`)]);
}
if (args.includes('--browser')) {
  run('browser', [
    'node_modules/@playwright/test/cli.js', 'test', '--project', 'regression', '--reporter=list,json',
    '--output', path.join(directory, 'browser-artifacts'),
    'e2e/notation-tools.spec.ts', 'e2e/mouse-precision-stress.spec.ts',
    'e2e/tablet-entry.spec.ts', 'e2e/snap-ghost-debug.spec.ts',
    'e2e/semantic-grid-fuzz.spec.ts',
  ], {
    NEX_SEMANTIC_GRID_FUZZ: '1',
    PLAYWRIGHT_JSON_OUTPUT_NAME: path.join(directory, 'browser-results.json'),
    PLAYWRIGHT_HTML_OPEN: 'never',
  });
  const gate = report.gates.at(-1);
  try {
    const browser = JSON.parse(readFileSync(path.join(directory, 'browser-results.json'), 'utf8'));
    gate.counts = browser.stats;
    if (gate.status === 'passed' && (browser.stats.skipped > 0 || browser.stats.flaky > 0 || browser.stats.expected === 0)) {
      gate.status = 'incomplete';
    }
  } catch (error) {
    gate.status = 'failed';
    gate.error = `Browser evidence missing or unreadable: ${error.message}`;
  }
} else {
  report.gates.push({ name: 'browser', status: 'not-run' });
}
report.finishedAt = new Date().toISOString();
report.automatedStatus = report.gates.some((gate) => gate.status === 'failed') ? 'failed'
  : report.gates.some((gate) => gate.status !== 'passed') ? 'partial' : 'passed';
save();
console.log(`Automated gates: ${report.automatedStatus}. Manual gates remain not-run.\nReport: ${path.join(directory, 'report.json')}`);
process.exitCode = report.gates.some((gate) => ['failed', 'incomplete'].includes(gate.status)) ? 1 : 0;
