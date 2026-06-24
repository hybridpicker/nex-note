#!/usr/bin/env node

import { runMuseScoreRoundtripSmoke, formatMuseScoreRoundtripSmokeSummary } from '@/lib/musescore-roundtrip-smoke';

const DEFAULT_FIXTURES = [
  'test/fixtures/choir-lyrics.musicxml',
  'test/fixtures/piano-semantics.musicxml',
  'test/fixtures/leadsheet-repeat.musicxml',
];

function parseArgs(argv = process.argv.slice(2)) {
  const fixtures: string[] = [];
  let outputDir: string | undefined;
  let museScoreCli: string | undefined;
  let timeoutMs: number | undefined;
  let retryCount: number | undefined;
  let keepArtifacts = true;

  for (const arg of argv) {
    if (arg.startsWith('--fixtures=')) {
      fixtures.push(...arg.slice('--fixtures='.length).split(',').map((entry) => entry.trim()).filter(Boolean));
      continue;
    }
    if (arg.startsWith('--fixture=')) {
      const fixture = arg.slice('--fixture='.length).trim();
      if (fixture) fixtures.push(fixture);
      continue;
    }
    if (arg.startsWith('--out=')) {
      outputDir = arg.slice('--out='.length).trim() || undefined;
      continue;
    }
    if (arg.startsWith('--musescore-cli=')) {
      museScoreCli = arg.slice('--musescore-cli='.length).trim() || undefined;
      continue;
    }
    if (arg.startsWith('--timeout-ms=')) {
      const parsed = Number.parseInt(arg.slice('--timeout-ms='.length), 10);
      if (Number.isFinite(parsed) && parsed > 0) timeoutMs = parsed;
      continue;
    }
    if (arg.startsWith('--retries=')) {
      const parsed = Number.parseInt(arg.slice('--retries='.length), 10);
      if (Number.isFinite(parsed) && parsed >= 0) retryCount = parsed;
      continue;
    }
    if (arg === '--no-keep-artifacts') {
      keepArtifacts = false;
      continue;
    }
    if (arg === '--help' || arg === '-h') {
      return { help: true, fixtures, outputDir, museScoreCli, timeoutMs, retryCount, keepArtifacts };
    }
    if (arg.trim()) fixtures.push(arg.trim());
  }

  return {
    help: false,
    fixtures: fixtures.length > 0 ? fixtures : DEFAULT_FIXTURES,
    outputDir,
    museScoreCli,
    timeoutMs,
    retryCount,
    keepArtifacts,
  };
}

function printHelp() {
  process.stdout.write(`MuseScore MusicXML/MXL/MSCZ roundtrip smoke

Usage:
  npm run smoke:musescore-roundtrip
  npm run smoke:musescore-roundtrip -- --fixture=test/fixtures/choir-lyrics.musicxml
  npm run smoke:musescore-roundtrip -- --fixtures=a.musicxml,b.musicxml --out=.nex/mscore-smoke

Options:
  --fixture=<path>          Add one fixture. Repeatable.
  --fixtures=<a,b,c>       Comma-separated fixtures.
  --out=<directory>        Artifact directory. Defaults to .nex/musescore-roundtrip-smoke-<timestamp>.
  --musescore-cli=<path>   Override MUSESCORE_CLI.
  --timeout-ms=<ms>        Per-conversion timeout. Defaults to 90000.
  --retries=<count>        Retries for crash/timeout/missing-output steps. Defaults to 2.
  --no-keep-artifacts      Use a temporary directory and remove it after the run.
`);
}

async function main() {
  const args = parseArgs();
  if (args.help) {
    printHelp();
    return;
  }

  const result = await runMuseScoreRoundtripSmoke({
    fixtures: args.fixtures,
    outputDir: args.outputDir,
    museScoreCli: args.museScoreCli,
    timeoutMs: args.timeoutMs,
    retryCount: args.retryCount,
    keepArtifacts: args.keepArtifacts,
  });

  process.stdout.write(formatMuseScoreRoundtripSmokeSummary(result));

  if (result.verdict === 'failed') {
    process.exitCode = 1;
  }
}

main().catch((error) => {
  process.stderr.write(`${error instanceof Error ? error.stack ?? error.message : String(error)}\n`);
  process.exitCode = 1;
});
