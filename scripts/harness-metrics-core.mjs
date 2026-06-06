import { readFileSync } from 'node:fs';
import path from 'node:path';

function readInputFile(filePath) {
  return readFileSync(filePath, 'utf8');
}

function parseInput(text) {
  const trimmed = text.trim();
  if (!trimmed) return { records: [], warnings: ['Input file is empty.'] };

  if (trimmed.startsWith('{') || trimmed.startsWith('[')) {
    try {
      const parsed = JSON.parse(trimmed);
      return {
        records: extractRecordsFromJson(parsed),
        warnings: [],
      };
    } catch {
      if (!trimmed.includes('\n')) throw new Error('Input looked like JSON but could not be parsed.');
      return parseJsonLines(trimmed);
    }
  }

  return parseJsonLines(trimmed);
}

function extractRecordsFromJson(parsed) {
  if (Array.isArray(parsed)) return parsed;
  if (Array.isArray(parsed?.records)) return parsed.records;
  if (Array.isArray(parsed?.events)) return parsed.events;
  if (Array.isArray(parsed?.loops)) return parsed.loops;
  return [parsed];
}

function parseJsonLines(text) {
  const warnings = [];
  const records = [];

  for (const [index, line] of text.split(/\r?\n/).entries()) {
    const trimmed = line.trim();
    if (!trimmed) continue;

    try {
      records.push(JSON.parse(trimmed));
      continue;
    } catch {
      // Fall through to inline JSON extraction for mixed logs.
    }

    const jsonStart = trimmed.indexOf('{');
    const jsonEnd = trimmed.lastIndexOf('}');
    if (jsonStart >= 0 && jsonEnd > jsonStart) {
      try {
        records.push(JSON.parse(trimmed.slice(jsonStart, jsonEnd + 1)));
        continue;
      } catch {
        // Keep warning below.
      }
    }

    warnings.push(`Skipped non-JSON line ${index + 1}.`);
  }

  return { records, warnings };
}

function numberOrNull(value) {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string' && value.trim()) {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) return parsed;
  }
  return null;
}

function stringOrNull(value) {
  return typeof value === 'string' && value.trim() ? value.trim() : null;
}

function isoOrNull(value) {
  const str = stringOrNull(value);
  if (!str) return null;
  const date = new Date(str);
  return Number.isNaN(date.valueOf()) ? null : date.toISOString();
}

function sumDefined(values) {
  let total = 0;
  let found = false;
  for (const value of values) {
    if (value == null) continue;
    total += value;
    found = true;
  }
  return found ? total : null;
}

function normalizeRecord(record, index) {
  const type = stringOrNull(record.type)
    ?? stringOrNull(record.event)
    ?? stringOrNull(record.kind)
    ?? 'unknown';

  const loopId = stringOrNull(record.loopId)
    ?? stringOrNull(record.loop_id)
    ?? stringOrNull(record.id)
    ?? `record-${index + 1}`;

  const timestamp = isoOrNull(record.timestamp)
    ?? isoOrNull(record.time)
    ?? isoOrNull(record.completedAt)
    ?? isoOrNull(record.createdAt);

  const stopReason = stringOrNull(record.stopReason)
    ?? stringOrNull(record.stop_reason)
    ?? stringOrNull(record.reason)
    ?? stringOrNull(record.result?.stopReason)
    ?? stringOrNull(record.summary?.stopReason);

  const passCount = numberOrNull(record.passCount)
    ?? numberOrNull(record.pass_count)
    ?? numberOrNull(record.passes)
    ?? numberOrNull(record.summary?.passCount)
    ?? numberOrNull(record.result?.passCount);

  const bestScore = numberOrNull(record.bestScore)
    ?? numberOrNull(record.best_score)
    ?? numberOrNull(record.highScore)
    ?? numberOrNull(record.newHighScore)
    ?? numberOrNull(record.summary?.bestScore)
    ?? numberOrNull(record.result?.bestScore);

  const filePath = stringOrNull(record.file)
    ?? stringOrNull(record.filePath)
    ?? stringOrNull(record.path)
    ?? stringOrNull(record.targetFile)
    ?? stringOrNull(record.summary?.file);

  const cliSpawned = typeof record.cliSpawned === 'boolean'
    ? record.cliSpawned
    : typeof record.spawnedCli === 'boolean'
      ? record.spawnedCli
      : typeof record.usedCli === 'boolean'
        ? record.usedCli
        : typeof record.summary?.cliSpawned === 'boolean'
          ? record.summary.cliSpawned
          : null;

  const promptTokens = numberOrNull(record.promptTokens)
    ?? numberOrNull(record.prompt_tokens)
    ?? numberOrNull(record.usage?.promptTokens)
    ?? numberOrNull(record.usage?.prompt_tokens)
    ?? null;

  const completionTokens = numberOrNull(record.completionTokens)
    ?? numberOrNull(record.completion_tokens)
    ?? numberOrNull(record.outputTokens)
    ?? numberOrNull(record.output_tokens)
    ?? numberOrNull(record.usage?.completionTokens)
    ?? numberOrNull(record.usage?.completion_tokens)
    ?? numberOrNull(record.usage?.outputTokens)
    ?? numberOrNull(record.usage?.output_tokens)
    ?? null;

  const explicitTotalTokens = numberOrNull(record.totalTokens)
    ?? numberOrNull(record.total_tokens)
    ?? numberOrNull(record.usage?.totalTokens)
    ?? numberOrNull(record.usage?.total_tokens)
    ?? null;

  const totalTokens = explicitTotalTokens ?? sumDefined([promptTokens, completionTokens]);

  const costUsd = numberOrNull(record.costUsd)
    ?? numberOrNull(record.cost_usd)
    ?? numberOrNull(record.cost)
    ?? numberOrNull(record.usage?.costUsd)
    ?? numberOrNull(record.usage?.cost_usd)
    ?? null;

  return {
    rawType: type,
    loopId,
    timestamp,
    stopReason,
    passCount,
    bestScore,
    filePath,
    cliSpawned,
    promptTokens,
    completionTokens,
    totalTokens,
    costUsd,
  };
}

function createLoop(loopId) {
  return {
    loopId,
    timestamps: [],
    stopReason: null,
    passCount: null,
    bestScore: null,
    explicitUsage: false,
    promptTokens: 0,
    completionTokens: 0,
    totalTokens: 0,
    costUsd: 0,
    files: new Map(),
  };
}

function summarizeHarnessMetrics(records) {
  const loops = new Map();
  const warnings = [];

  for (const [index, record] of records.entries()) {
    const normalized = normalizeRecord(record, index);
    const loop = loops.get(normalized.loopId) ?? createLoop(normalized.loopId);
    loops.set(normalized.loopId, loop);

    if (normalized.timestamp) loop.timestamps.push(normalized.timestamp);
    if (normalized.stopReason) loop.stopReason = normalized.stopReason;
    if (normalized.passCount != null) loop.passCount = normalized.passCount;
    if (normalized.bestScore != null) loop.bestScore = normalized.bestScore;

    if (normalized.filePath) {
      const previous = loop.files.get(normalized.filePath) ?? { cliSpawned: false };
      loop.files.set(normalized.filePath, {
        cliSpawned: previous.cliSpawned || normalized.cliSpawned === true,
      });
    }

    if (normalized.totalTokens != null || normalized.costUsd != null) {
      const hasExplicitUsageObject = record.usage && typeof record.usage === 'object';
      const hasExplicitTotals = numberOrNull(record.totalTokens) != null
        || numberOrNull(record.total_tokens) != null
        || numberOrNull(record.usage?.totalTokens) != null
        || numberOrNull(record.usage?.total_tokens) != null;

      if (hasExplicitUsageObject || hasExplicitTotals) {
        loop.explicitUsage = true;
        loop.promptTokens = normalized.promptTokens ?? 0;
        loop.completionTokens = normalized.completionTokens ?? 0;
        loop.totalTokens = normalized.totalTokens ?? 0;
        loop.costUsd = normalized.costUsd ?? 0;
      } else if (!loop.explicitUsage) {
        loop.promptTokens += normalized.promptTokens ?? 0;
        loop.completionTokens += normalized.completionTokens ?? 0;
        loop.totalTokens += normalized.totalTokens ?? 0;
        loop.costUsd += normalized.costUsd ?? 0;
      }
    }
  }

  const loopList = [...loops.values()].map((loop) => {
    loop.timestamps.sort();
    return {
      loopId: loop.loopId,
      timestamp: loop.timestamps.at(-1) ?? null,
      stopReason: loop.stopReason ?? 'unknown',
      passCount: loop.passCount ?? 0,
      bestScore: loop.bestScore,
      promptTokens: loop.promptTokens,
      completionTokens: loop.completionTokens,
      totalTokens: loop.totalTokens,
      costUsd: loop.costUsd,
      files: [...loop.files.entries()].map(([filePath, meta]) => ({ filePath, cliSpawned: meta.cliSpawned })),
    };
  });

  const files = new Map();
  for (const loop of loopList) {
    for (const file of loop.files) {
      const previous = files.get(file.filePath) ?? false;
      files.set(file.filePath, previous || file.cliSpawned);
    }
  }

  const cliSpawnedFileCount = [...files.values()].filter(Boolean).length;
  const stopReasons = countBy(loopList.map((loop) => loop.stopReason));
  const passCountDistribution = countBy(loopList.map((loop) => String(loop.passCount)));
  const costs = loopList.map((loop) => loop.costUsd).filter((value) => value > 0);
  const tokenTotals = loopList.map((loop) => loop.totalTokens).filter((value) => value > 0);

  const trend = buildTrend(loopList);

  if (files.size > 0) {
    const adoptionRate = cliSpawnedFileCount / files.size;
    if (cliSpawnedFileCount <= 3 || adoptionRate < 0.05) {
      warnings.push(`CLI adoption pool is still shallow: ${cliSpawnedFileCount}/${files.size} files spawned the CLI.`);
    }
  }

  if (Object.keys(stopReasons).length === 1 && stopReasons.unknown === loopList.length && loopList.length > 0) {
    warnings.push('No structured stop reasons were found; metrics may be incomplete.');
  }

  return {
    loops: loopList,
    summary: {
      loopCount: loopList.length,
      fileCount: files.size,
      cliSpawnedFileCount,
      cliSpawnAdoptionRate: files.size > 0 ? round((cliSpawnedFileCount / files.size) * 100, 2) : 0,
      stopReasons,
      passCountDistribution,
      tokens: buildNumericSummary(tokenTotals),
      costUsd: buildNumericSummary(costs, 6),
      trend,
    },
    warnings,
  };
}

function buildTrend(loopList) {
  const buckets = new Map();

  for (const loop of loopList) {
    if (!loop.timestamp) continue;
    const day = loop.timestamp.slice(0, 10);
    const bucket = buckets.get(day) ?? {
      day,
      loops: 0,
      totalTokens: 0,
      costUsd: 0,
      passCounts: [],
      stopReasons: {},
      bestScores: [],
    };

    bucket.loops += 1;
    bucket.totalTokens += loop.totalTokens;
    bucket.costUsd += loop.costUsd;
    bucket.passCounts.push(loop.passCount);
    bucket.stopReasons[loop.stopReason] = (bucket.stopReasons[loop.stopReason] ?? 0) + 1;
    if (loop.bestScore != null) bucket.bestScores.push(loop.bestScore);
    buckets.set(day, bucket);
  }

  return [...buckets.values()]
    .sort((a, b) => a.day.localeCompare(b.day))
    .map((bucket) => ({
      day: bucket.day,
      loops: bucket.loops,
      totalTokens: bucket.totalTokens,
      costUsd: round(bucket.costUsd, 6),
      avgPassCount: round(average(bucket.passCounts), 2),
      avgBestScore: bucket.bestScores.length > 0 ? round(average(bucket.bestScores), 4) : null,
      stopReasons: bucket.stopReasons,
    }));
}

function buildNumericSummary(values, precision = 2) {
  if (values.length === 0) {
    return { total: 0, avg: 0, median: 0, max: 0 };
  }

  const sorted = [...values].sort((a, b) => a - b);
  const midpoint = Math.floor(sorted.length / 2);
  const median = sorted.length % 2 === 0
    ? (sorted[midpoint - 1] + sorted[midpoint]) / 2
    : sorted[midpoint];

  return {
    total: round(sorted.reduce((sum, value) => sum + value, 0), precision),
    avg: round(average(sorted), precision),
    median: round(median, precision),
    max: round(sorted.at(-1) ?? 0, precision),
  };
}

function countBy(values) {
  return values.reduce((acc, value) => {
    acc[value] = (acc[value] ?? 0) + 1;
    return acc;
  }, {});
}

function average(values) {
  if (values.length === 0) return 0;
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function round(value, precision = 2) {
  const factor = 10 ** precision;
  return Math.round(value * factor) / factor;
}

function formatSummary(result, sourcePath) {
  const { summary } = result;
  const lines = [
    `Harness metrics for ${path.basename(sourcePath)}`,
    '',
    `Loops: ${summary.loopCount}`,
    `Files with migration evidence: ${summary.cliSpawnedFileCount}/${summary.fileCount} (${summary.cliSpawnAdoptionRate}%)`,
    `Tokens total/avg/median/max: ${summary.tokens.total} / ${summary.tokens.avg} / ${summary.tokens.median} / ${summary.tokens.max}`,
    `Cost USD total/avg/median/max: ${summary.costUsd.total} / ${summary.costUsd.avg} / ${summary.costUsd.median} / ${summary.costUsd.max}`,
    '',
    'Stop reasons:',
    ...formatCountMap(summary.stopReasons),
    '',
    'Pass-count distribution:',
    ...formatCountMap(summary.passCountDistribution),
  ];

  if (summary.trend.length > 0) {
    lines.push('', 'Trend by day:');
    for (const day of summary.trend) {
      lines.push(
        `- ${day.day}: loops=${day.loops}, tokens=${day.totalTokens}, cost=$${day.costUsd}, avgPasses=${day.avgPassCount}, avgBestScore=${day.avgBestScore ?? 'n/a'}`
      );
    }
  }

  if (result.warnings.length > 0) {
    lines.push('', 'Warnings:');
    for (const warning of result.warnings) lines.push(`- ${warning}`);
  }

  return `${lines.join('\n')}\n`;
}

function formatCountMap(map) {
  const entries = Object.entries(map).sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));
  if (entries.length === 0) return ['- none'];
  return entries.map(([key, value]) => `- ${key}: ${value}`);
}

function main(argv = process.argv.slice(2)) {
  const jsonOnly = argv.includes('--json');
  const filePath = argv.find((arg) => !arg.startsWith('--'));

  if (!filePath) {
    throw new Error('Usage: node scripts/harness-metrics.js [--json] <metrics.json|metrics.jsonl|logfile>');
  }

  const text = readInputFile(filePath);
  const parsed = parseInput(text);
  const result = summarizeHarnessMetrics(parsed.records);
  result.warnings.unshift(...parsed.warnings);

  if (jsonOnly) {
    process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
    return result;
  }

  process.stdout.write(formatSummary(result, filePath));
  return result;
}

export {
  extractRecordsFromJson,
  formatSummary,
  main,
  normalizeRecord,
  parseInput,
  summarizeHarnessMetrics,
};
