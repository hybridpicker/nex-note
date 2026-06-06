import test from 'node:test';
import assert from 'node:assert/strict';

import { formatSummary, parseInput, summarizeHarnessMetrics } from '../scripts/harness-metrics-core.mjs';

test('summarizeHarnessMetrics aggregates structured stop reasons, usage, trend, and pass counts', () => {
  const result = summarizeHarnessMetrics([
    {
      type: 'file_processed',
      loopId: 'loop-1',
      file: 'src/a.ts',
      cliSpawned: true,
      timestamp: '2026-04-20T09:00:00Z',
    },
    {
      type: 'llm_usage',
      loopId: 'loop-1',
      promptTokens: 100,
      completionTokens: 50,
      costUsd: 0.0125,
    },
    {
      type: 'loop_completed',
      loopId: 'loop-1',
      stopReason: 'regression',
      passCount: 3,
      bestScore: 0.82,
      timestamp: '2026-04-20T09:05:00Z',
    },
    {
      type: 'file_processed',
      loopId: 'loop-2',
      file: 'src/b.ts',
      cliSpawned: false,
      timestamp: '2026-04-21T10:00:00Z',
    },
    {
      type: 'llm_usage',
      loopId: 'loop-2',
      totalTokens: 300,
      costUsd: 0.02,
    },
    {
      type: 'loop_completed',
      loopId: 'loop-2',
      stopReason: 'no-new-high',
      passCount: 1,
      bestScore: 0.5,
      timestamp: '2026-04-21T10:06:00Z',
    },
  ]);

  assert.equal(result.summary.loopCount, 2);
  assert.equal(result.summary.fileCount, 2);
  assert.equal(result.summary.cliSpawnedFileCount, 1);
  assert.equal(result.summary.cliSpawnAdoptionRate, 50);
  assert.deepEqual(result.summary.stopReasons, {
    regression: 1,
    'no-new-high': 1,
  });
  assert.deepEqual(result.summary.passCountDistribution, {
    '1': 1,
    '3': 1,
  });
  assert.deepEqual(result.summary.tokens, {
    total: 450,
    avg: 225,
    median: 225,
    max: 300,
  });
  assert.deepEqual(result.summary.costUsd, {
    total: 0.0325,
    avg: 0.01625,
    median: 0.01625,
    max: 0.02,
  });
  assert.equal(result.summary.trend.length, 2);
  assert.deepEqual(result.summary.trend[0], {
    day: '2026-04-20',
    loops: 1,
    totalTokens: 150,
    costUsd: 0.0125,
    avgPassCount: 3,
    avgBestScore: 0.82,
    stopReasons: { regression: 1 },
  });
});

test('explicit loop usage totals override incremental usage events to avoid double counting', () => {
  const result = summarizeHarnessMetrics([
    {
      type: 'llm_usage',
      loopId: 'loop-1',
      promptTokens: 50,
      completionTokens: 25,
      costUsd: 0.005,
    },
    {
      type: 'loop_completed',
      loopId: 'loop-1',
      stopReason: 'completed',
      passCount: 2,
      usage: {
        promptTokens: 400,
        completionTokens: 100,
        totalTokens: 500,
        costUsd: 0.2,
      },
      timestamp: '2026-04-20T09:05:00Z',
    },
  ]);

  assert.deepEqual(result.summary.tokens, {
    total: 500,
    avg: 500,
    median: 500,
    max: 500,
  });
  assert.deepEqual(result.summary.costUsd, {
    total: 0.2,
    avg: 0.2,
    median: 0.2,
    max: 0.2,
  });
});

test('parseInput accepts jsonl with embedded JSON and reports skipped legacy lines', () => {
  const parsed = parseInput([
    '2026-04-20T09:00:00Z INFO {"type":"loop_completed","loopId":"loop-1","stopReason":"regression","passCount":4}',
    'not-json legacy line',
  ].join('\n'));

  assert.equal(parsed.records.length, 1);
  assert.equal(parsed.warnings.length, 1);
  assert.match(parsed.warnings[0], /Skipped non-JSON line 2/);
});

test('parseInput accepts plain jsonl object lines without misclassifying them as one JSON document', () => {
  const parsed = parseInput([
    '{"type":"loop_completed","loopId":"loop-1","stopReason":"completed","passCount":1}',
    '{"type":"loop_completed","loopId":"loop-2","stopReason":"cli-error","passCount":0}',
  ].join('\n'));

  assert.equal(parsed.records.length, 2);
  assert.equal(parsed.warnings.length, 0);
});

test('formatSummary includes the new high-value metrics in human output', () => {
  const result = summarizeHarnessMetrics([
    {
      type: 'file_processed',
      loopId: 'loop-1',
      file: 'src/a.ts',
      cliSpawned: true,
    },
    {
      type: 'loop_completed',
      loopId: 'loop-1',
      stopReason: 'regression',
      passCount: 2,
      totalTokens: 123,
      costUsd: 0.045,
      timestamp: '2026-04-20T09:05:00Z',
    },
  ]);

  const summary = formatSummary(result, '/tmp/harness.jsonl');
  assert.match(summary, /Tokens total\/avg\/median\/max: 123 \/ 123 \/ 123 \/ 123/);
  assert.match(summary, /Cost USD total\/avg\/median\/max: 0.045 \/ 0.045 \/ 0.045 \/ 0.045/);
  assert.match(summary, /Pass-count distribution:/);
  assert.match(summary, /Trend by day:/);
});
