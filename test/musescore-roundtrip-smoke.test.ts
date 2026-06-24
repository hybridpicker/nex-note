import test from 'node:test';
import assert from 'node:assert/strict';
import { chmodSync, mkdtempSync, writeFileSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';

import {
  classifyFixtureSmokeResult,
  classifyMuseScoreStep,
  combineMuseScoreSmokeFixtureVerdicts,
  runMuseScoreRoundtripSmoke,
  type MuseScoreSmokeFixtureResult,
  type MuseScoreSmokeStepResult,
} from '@/lib/musescore-roundtrip-smoke';

const SAMPLE_XML = `<?xml version="1.0" encoding="UTF-8"?>
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
  </part>
</score-partwise>`;

function step(input: Partial<MuseScoreSmokeStepResult> & Pick<MuseScoreSmokeStepResult, 'variant' | 'inputFormat' | 'outputFormat' | 'status'>): MuseScoreSmokeStepResult {
  return {
    id: `${input.variant}:${input.inputFormat}->${input.outputFormat}`,
    fixture: 'fixture.musicxml',
    variant: input.variant,
    inputFormat: input.inputFormat,
    outputFormat: input.outputFormat,
    command: '/fake/mscore',
    args: [],
    inputPath: '/tmp/input',
    outputPath: '/tmp/output',
    status: input.status,
    code: input.code ?? (input.status === 'passed' ? 0 : 139),
    signal: input.signal ?? null,
    durationMs: 1,
    stderr: input.stderr ?? null,
    cleanedStderr: input.cleanedStderr ?? null,
    outputBytes: input.outputBytes ?? (input.status === 'passed' ? 8 : 0),
    diagnostic: input.diagnostic ?? input.status,
  };
}

test('classifyMuseScoreStep treats crash-style exits as local CLI crashes', () => {
  const result = classifyMuseScoreStep({
    code: 139,
    signal: null,
    stderr: 'Segmentation fault: 11',
    timedOut: false,
    outputExists: false,
    outputBytes: 0,
  });

  assert.equal(result.status, 'crashed');
  assert.match(result.diagnostic, /crashed/);
});

test('classifyFixtureSmokeResult accepts matched source and nex-note MSCZ reopen crashes as a local limit', () => {
  const result = classifyFixtureSmokeResult([
    step({ variant: 'source-musicxml', inputFormat: 'musicxml', outputFormat: 'musicxml', status: 'passed' }),
    step({ variant: 'source-musescore-mxl', inputFormat: 'musicxml', outputFormat: 'mxl', status: 'passed' }),
    step({ variant: 'source-musescore-mxl', inputFormat: 'mxl', outputFormat: 'musicxml', status: 'passed' }),
    step({ variant: 'nex-note-musicxml', inputFormat: 'musicxml', outputFormat: 'musicxml', status: 'passed' }),
    step({ variant: 'nex-note-mxl', inputFormat: 'mxl', outputFormat: 'musicxml', status: 'passed' }),
    step({ variant: 'source-musescore-mscz', inputFormat: 'musicxml', outputFormat: 'mscz', status: 'passed' }),
    step({ variant: 'source-musescore-mscz', inputFormat: 'mscz', outputFormat: 'musicxml', status: 'crashed', diagnostic: 'MuseScore crashed (code 139)' }),
    step({ variant: 'nex-note-mscz', inputFormat: 'musicxml', outputFormat: 'mscz', status: 'passed' }),
    step({ variant: 'nex-note-mscz', inputFormat: 'mscz', outputFormat: 'musicxml', status: 'crashed', diagnostic: 'MuseScore crashed (code 139)' }),
  ]);

  assert.equal(result.verdict, 'passed-with-local-musescore-limit');
  assert.match(result.diagnostic, /local MuseScore/);
});

test('classifyFixtureSmokeResult flags nex-note-only MXL failure as an export suspect', () => {
  const result = classifyFixtureSmokeResult([
    step({ variant: 'source-musicxml', inputFormat: 'musicxml', outputFormat: 'musicxml', status: 'passed' }),
    step({ variant: 'source-musescore-mxl', inputFormat: 'musicxml', outputFormat: 'mxl', status: 'passed' }),
    step({ variant: 'source-musescore-mxl', inputFormat: 'mxl', outputFormat: 'musicxml', status: 'passed' }),
    step({ variant: 'nex-note-musicxml', inputFormat: 'musicxml', outputFormat: 'musicxml', status: 'passed' }),
    step({ variant: 'nex-note-mxl', inputFormat: 'mxl', outputFormat: 'musicxml', status: 'failed', code: 40, diagnostic: 'MuseScore exited with code 40' }),
    step({ variant: 'source-musescore-mscz', inputFormat: 'musicxml', outputFormat: 'mscz', status: 'passed' }),
    step({ variant: 'source-musescore-mscz', inputFormat: 'mscz', outputFormat: 'musicxml', status: 'passed' }),
    step({ variant: 'nex-note-mscz', inputFormat: 'musicxml', outputFormat: 'mscz', status: 'passed' }),
    step({ variant: 'nex-note-mscz', inputFormat: 'mscz', outputFormat: 'musicxml', status: 'passed' }),
  ]);

  assert.equal(result.verdict, 'failed');
  assert.match(result.diagnostic, /nex-note MXL failed/);
});

test('classifyFixtureSmokeResult treats direct XML crash as local when the same nex-note export opens through MXL', () => {
  const result = classifyFixtureSmokeResult([
    step({ variant: 'source-musicxml', inputFormat: 'musicxml', outputFormat: 'musicxml', status: 'passed' }),
    step({ variant: 'source-musescore-mxl', inputFormat: 'musicxml', outputFormat: 'mxl', status: 'crashed', diagnostic: 'MuseScore crashed (code 139)' }),
    step({ variant: 'source-musescore-mxl', inputFormat: 'mxl', outputFormat: 'musicxml', status: 'skipped' }),
    step({ variant: 'nex-note-musicxml', inputFormat: 'musicxml', outputFormat: 'musicxml', status: 'crashed', diagnostic: 'MuseScore crashed (code 139)' }),
    step({ variant: 'nex-note-mxl', inputFormat: 'mxl', outputFormat: 'musicxml', status: 'passed' }),
    step({ variant: 'source-musescore-mscz', inputFormat: 'musicxml', outputFormat: 'mscz', status: 'crashed', diagnostic: 'MuseScore crashed (code 139)' }),
    step({ variant: 'source-musescore-mscz', inputFormat: 'mscz', outputFormat: 'musicxml', status: 'skipped' }),
    step({ variant: 'nex-note-mscz', inputFormat: 'musicxml', outputFormat: 'mscz', status: 'crashed', diagnostic: 'MuseScore crashed (code 139)' }),
    step({ variant: 'nex-note-mscz', inputFormat: 'mscz', outputFormat: 'musicxml', status: 'skipped' }),
  ]);

  assert.equal(result.verdict, 'passed-with-local-musescore-limit');
  assert.match(result.diagnostic, /same exported XML passed when packaged as MXL/);
});

test('classifyFixtureSmokeResult treats nex-note MSCZ create crash as local when source MSCZ reopen already crashes', () => {
  const result = classifyFixtureSmokeResult([
    step({ variant: 'source-musicxml', inputFormat: 'musicxml', outputFormat: 'musicxml', status: 'passed' }),
    step({ variant: 'source-musescore-mxl', inputFormat: 'musicxml', outputFormat: 'mxl', status: 'passed' }),
    step({ variant: 'source-musescore-mxl', inputFormat: 'mxl', outputFormat: 'musicxml', status: 'passed' }),
    step({ variant: 'nex-note-musicxml', inputFormat: 'musicxml', outputFormat: 'musicxml', status: 'passed' }),
    step({ variant: 'nex-note-mxl', inputFormat: 'mxl', outputFormat: 'musicxml', status: 'passed' }),
    step({ variant: 'source-musescore-mscz', inputFormat: 'musicxml', outputFormat: 'mscz', status: 'passed' }),
    step({ variant: 'source-musescore-mscz', inputFormat: 'mscz', outputFormat: 'musicxml', status: 'crashed', diagnostic: 'MuseScore crashed (code 139)' }),
    step({ variant: 'nex-note-mscz', inputFormat: 'musicxml', outputFormat: 'mscz', status: 'crashed', diagnostic: 'MuseScore crashed (code 139)' }),
    step({ variant: 'nex-note-mscz', inputFormat: 'mscz', outputFormat: 'musicxml', status: 'skipped' }),
  ]);

  assert.equal(result.verdict, 'passed-with-local-musescore-limit');
  assert.match(result.diagnostic, /source MSCZ baseline was unavailable locally/);
});

test('classifyFixtureSmokeResult accepts MuseScore crash after writing a reopenable nex-note MSCZ', () => {
  const result = classifyFixtureSmokeResult([
    step({ variant: 'source-musicxml', inputFormat: 'musicxml', outputFormat: 'musicxml', status: 'passed' }),
    step({ variant: 'source-musescore-mxl', inputFormat: 'musicxml', outputFormat: 'mxl', status: 'passed' }),
    step({ variant: 'source-musescore-mxl', inputFormat: 'mxl', outputFormat: 'musicxml', status: 'passed' }),
    step({ variant: 'nex-note-musicxml', inputFormat: 'musicxml', outputFormat: 'musicxml', status: 'passed' }),
    step({ variant: 'nex-note-mxl', inputFormat: 'mxl', outputFormat: 'musicxml', status: 'passed' }),
    step({ variant: 'source-musescore-mscz', inputFormat: 'musicxml', outputFormat: 'mscz', status: 'passed' }),
    step({ variant: 'source-musescore-mscz', inputFormat: 'mscz', outputFormat: 'musicxml', status: 'passed' }),
    step({ variant: 'nex-note-mscz', inputFormat: 'musicxml', outputFormat: 'mscz', status: 'crashed', outputBytes: 20000, diagnostic: 'MuseScore crashed (signal SIGABRT)' }),
    step({ variant: 'nex-note-mscz', inputFormat: 'mscz', outputFormat: 'musicxml', status: 'passed' }),
  ]);

  assert.equal(result.verdict, 'passed-with-local-musescore-limit');
  assert.match(result.diagnostic, /crashed after writing a usable MSCZ/);
});

test('combineMuseScoreSmokeFixtureVerdicts marks crash-only failures inconclusive when source baselines also crash', () => {
  const fixture: MuseScoreSmokeFixtureResult = {
    fixture: 'fixture.musicxml',
    sourceMusicXmlPath: '/tmp/source.musicxml',
    nexNoteMusicXmlPath: '/tmp/nex.musicxml',
    nexNoteMxlPath: '/tmp/nex.mxl',
    artifactDir: '/tmp/artifacts',
    verdict: 'failed',
    diagnostic: 'nex-note MSCZ crashed while source direct MusicXML passed',
    steps: [
      step({ variant: 'source-musicxml', inputFormat: 'musicxml', outputFormat: 'musicxml', status: 'crashed', diagnostic: 'MuseScore crashed (signal SIGABRT)' }),
      step({ variant: 'nex-note-mscz', inputFormat: 'mscz', outputFormat: 'musicxml', status: 'crashed', diagnostic: 'MuseScore crashed (signal SIGABRT)' }),
    ],
  };

  const result = combineMuseScoreSmokeFixtureVerdicts([fixture]);

  assert.equal(result.verdict, 'passed-with-local-musescore-limit');
  assert.match(result.diagnostic, /source baselines/);
});

test('runMuseScoreRoundtripSmoke records fake local MSCZ reopen crashes without failing MusicXML or MXL', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'nex-note-mscore-smoke-'));
  const cliPath = join(dir, 'mscore');
  const fixturePath = join(dir, 'fixture.musicxml');
  const outputDir = join(dir, 'artifacts');

  writeFileSync(fixturePath, SAMPLE_XML, 'utf8');
  writeFileSync(cliPath, `#!/usr/bin/env node
const fs = require('fs');
const input = process.argv[2];
const output = process.argv[4];
if (process.argv.includes('--version')) {
  console.log('MuseScore 4.6.2');
  process.exit(0);
}
if (String(input).endsWith('.mscz')) {
  console.error('Segmentation fault: 11');
  process.exit(139);
}
fs.writeFileSync(output, String(output).endsWith('.musicxml') ? '<score-partwise version="3.1"></score-partwise>' : 'fake archive bytes');
`, 'utf8');
  chmodSync(cliPath, 0o755);

  const result = await runMuseScoreRoundtripSmoke({
    fixtures: [fixturePath],
    museScoreCli: cliPath,
    outputDir,
    timeoutMs: 5000,
  });

  assert.equal(result.verdict, 'passed-with-local-musescore-limit');
  assert.equal(result.museScoreVersion, '4.6.2');
  assert.equal(result.fixtures.length, 1);
  assert.ok(result.fixtures[0]!.steps.some((entry) => entry.variant === 'nex-note-mxl' && entry.status === 'passed'));
  assert.ok(result.fixtures[0]!.steps.some((entry) => entry.variant === 'source-musescore-mscz' && entry.status === 'crashed'));
});
