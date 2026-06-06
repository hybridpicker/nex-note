import test from 'node:test';
import assert from 'node:assert/strict';

import { buildWrittenPitch, pitchLabel, pitchToMidi } from '../src/nex-note/arrangement/pitch.ts';
import { runArrangementCritic } from '../src/nex-note/arrangement/critic/run-arrangement-critic.ts';
import { runCriticEvalHarness } from '../src/nex-note/arrangement/evals/critic-eval-core.ts';
import { DEFAULT_CRITIC_EVAL_CASES } from '../src/nex-note/arrangement/evals/default-critic-evals.ts';
import { getArrangementStylePack } from '../src/nex-note/arrangement/style-packs/index.ts';

test('arrangement pitch helpers preserve spelled pitch labels and midi conversion', () => {
  const pitch = buildWrittenPitch('B', 3, 1);
  assert.equal(pitchLabel(pitch), 'B#3');
  assert.equal(pitchToMidi(pitch), 60);
});

test('runArrangementCritic reports classical parallel perfects as errors', () => {
  const stylePack = getArrangementStylePack('classical-basic');
  const report = runArrangementCritic({
    spec: {
      sourceMelody: { source: 'chat-inline', description: 'test' },
      stylePack: 'classical-basic',
      ...stylePack.defaults,
    },
    voicingPlan: {
      texture: 'homophonic-block',
      slices: [
        {
          measure: 1,
          beatNum: 1,
          beatDen: 4,
          voices: [
            { voiceIndex: 1, pitch: buildWrittenPitch('D', 5) },
            { voiceIndex: 2, pitch: buildWrittenPitch('A', 4) },
            { voiceIndex: 3, pitch: buildWrittenPitch('D', 4) },
          ],
        },
        {
          measure: 1,
          beatNum: 2,
          beatDen: 4,
          voices: [
            { voiceIndex: 1, pitch: buildWrittenPitch('E', 5) },
            { voiceIndex: 2, pitch: buildWrittenPitch('B', 4) },
            { voiceIndex: 3, pitch: buildWrittenPitch('E', 4) },
          ],
        },
      ],
    },
  });

  assert.equal(report.valid, false);
  assert.equal(report.errorCount, 2);
  assert.deepEqual(report.issues.map((issue) => issue.code).sort(), ['parallel-perfect-fifth', 'parallel-perfect-octave']);
  assert.ok(report.issues.every((issue) => issue.location.voices.length === 2));
  assert.ok(report.issues.some((issue) => JSON.stringify(issue.location.voices) === JSON.stringify([2, 3])));
  assert.ok(report.issues.some((issue) => /Parallel fifth/.test(issue.message)));
});

test('runArrangementCritic downgrades jazz-close parallel perfects to warnings', () => {
  const stylePack = getArrangementStylePack('jazz-close');
  const report = runArrangementCritic({
    spec: {
      sourceMelody: { source: 'chat-inline', description: 'test' },
      stylePack: 'jazz-close',
      ...stylePack.defaults,
    },
    voicingPlan: {
      texture: 'homophonic-block',
      slices: [
        {
          measure: 1,
          beatNum: 1,
          beatDen: 4,
          voices: [
            { voiceIndex: 1, pitch: buildWrittenPitch('D', 5) },
            { voiceIndex: 2, pitch: buildWrittenPitch('G', 4) },
            { voiceIndex: 3, pitch: buildWrittenPitch('E', 4) },
          ],
        },
        {
          measure: 1,
          beatNum: 2,
          beatDen: 4,
          voices: [
            { voiceIndex: 1, pitch: buildWrittenPitch('E', 5) },
            { voiceIndex: 2, pitch: buildWrittenPitch('A', 4) },
            { voiceIndex: 3, pitch: buildWrittenPitch('F', 4) },
          ],
        },
      ],
    },
  });

  assert.equal(report.valid, true);
  assert.equal(report.errorCount, 0);
  assert.equal(report.warningCount, 1);
  assert.equal(report.issues[0]?.severity, 'warning');
});

test('runArrangementCritic reports range, crossing, spacing, doubling, and leading-tone resolution issues', () => {
  const stylePack = getArrangementStylePack('classical-basic');
  const report = runArrangementCritic({
    spec: {
      sourceMelody: { source: 'chat-inline', description: 'test' },
      stylePack: 'classical-basic',
      tonalCenter: { tonic: { step: 'C', alter: 0 }, mode: 'major' },
      ...stylePack.defaults,
    },
    voicingPlan: {
      texture: 'homophonic-block',
      slices: [
        {
          measure: 1,
          beatNum: 1,
          beatDen: 4,
          harmony: 'G',
          functionLabel: 'dominant',
          voices: [
            { voiceIndex: 1, role: 'melody', pitch: buildWrittenPitch('B', 4) },
            { voiceIndex: 2, role: 'inner', pitch: buildWrittenPitch('G', 4) },
            { voiceIndex: 3, role: 'bass', pitch: buildWrittenPitch('B', 3) },
          ],
        },
        {
          measure: 1,
          beatNum: 2,
          beatDen: 4,
          harmony: 'C',
          functionLabel: 'tonic',
          voices: [
            { voiceIndex: 1, role: 'melody', pitch: buildWrittenPitch('D', 6) },
            { voiceIndex: 2, role: 'inner', pitch: buildWrittenPitch('A', 3) },
            { voiceIndex: 3, role: 'bass', pitch: buildWrittenPitch('B', 3) },
          ],
        },
      ],
    },
  });

  assert.equal(report.valid, false);
  assert.ok(report.issues.some((issue) => issue.code === 'doubled-leading-tone'));
  assert.ok(report.issues.some((issue) => issue.code === 'unresolved-leading-tone'));
  assert.ok(report.issues.some((issue) => issue.code === 'voice-range'));
  assert.ok(report.issues.some((issue) => issue.code === 'voice-crossing'));
  assert.ok(report.issues.some((issue) => issue.code === 'voice-spacing'));
});

test('critic eval harness passes the seeded MVP suite', () => {
  const summary = runCriticEvalHarness(DEFAULT_CRITIC_EVAL_CASES);
  assert.equal(summary.total, 20);
  assert.equal(summary.failedCount, 0);
  assert.equal(summary.passed, true);
});
