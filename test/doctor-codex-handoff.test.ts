import test from 'node:test';
import assert from 'node:assert/strict';

import {
  buildDoctorCodexPrompt,
  doctorCodexPromptSignature,
  readDoctorCodexHandoffMode,
} from '../src/debug/doctor/codex-handoff.ts';
import { doctorReportHasCodexHandoff, formatCodexHandoffButtonTitle } from '../src/debug/doctor/runtime.ts';
import type { DoctorReport, DoctorSeverity } from '../src/debug/doctor/types.ts';

function buildReport(input: { revision?: number; issueId?: string; severity?: DoctorSeverity } = {}): DoctorReport {
  const severity = input.severity ?? 'error';
  return {
    schemaVersion: 1,
    kind: 'nex-note-doctor-report',
    generatedAt: '2026-04-29T12:00:00.000Z',
    mode: 'live',
    trigger: 'manual',
    enabledDomains: ['document', 'input', 'rhythm', 'layout', 'theory', 'playback', 'export'],
    revision: input.revision ?? 8,
    previousRevision: 7,
    commandCount: 1,
    commandTypes: ['insertNoteAt'],
    rules: {
      active: 17,
      planned: 16,
      byDomain: {
        document: { active: 5, planned: 0 },
        input: { active: 0, planned: 5 },
        rhythm: { active: 5, planned: 0 },
        layout: { active: 3, planned: 6 },
        theory: { active: 4, planned: 3 },
        playback: { active: 0, planned: 1 },
        export: { active: 0, planned: 1 },
      },
    },
    issueCount: 1,
    warningCount: severity === 'warning' ? 1 : 0,
    errorCount: severity === 'error' || severity === 'fatal' ? 1 : 0,
    issues: [{
      id: input.issueId ?? 'projection.tie-fragments-valid:test',
      ruleId: 'projection.tie-fragments-valid',
      domain: 'layout',
      severity,
      title: 'Projected tie fragments are balanced',
      message: 'Measure 1 staff 2 voice 1 projection fragment has invalid tieStart.',
      newSincePrevious: true,
      measureNumber: 1,
      staffIndex: 2,
      voiceId: 1,
      data: {
        diagnosticCode: 'projection_unbalanced_tie',
      },
    }],
    diagnostics: [],
    summary: {
      clean: false,
      blocked: false,
      newIssueCount: 1,
      newBlockingIssueCount: 1,
      affectedMeasures: [1],
      affectedStaves: [2],
      affectedVoices: [1],
    },
  };
}

test('Doctor Codex handoff prompt includes actionable report context', () => {
  const prompt = buildDoctorCodexPrompt({
    report: buildReport(),
    context: {
      filename: 'debug.musicxml',
      scoreRevision: 8,
      selectedDuration: 'quarter',
    },
    recentEvents: [{
      id: 'event:1',
      timestamp: '2026-04-29T12:00:01.000Z',
      source: 'doctor',
      action: 'manual',
      payload: { issueCount: 1 },
    }],
  });

  assert.match(prompt, /Du bist Codex im nex-note Repository/);
  assert.match(prompt, /projection\.tie-fragments-valid/);
  assert.match(prompt, /insertNoteAt/);
  assert.match(prompt, /debug\.musicxml/);
  assert.match(prompt, /Letzte Debug-\/Bug-Recorder-Events/);
});

test('Doctor Codex handoff signature changes with report identity', () => {
  assert.notEqual(
    doctorCodexPromptSignature(buildReport({ revision: 8 })),
    doctorCodexPromptSignature(buildReport({ revision: 9 })),
  );
  assert.notEqual(
    doctorCodexPromptSignature(buildReport({ issueId: 'issue:a' })),
    doctorCodexPromptSignature(buildReport({ issueId: 'issue:b' })),
  );
});

test('Doctor Codex handoff prompt is enabled by debug=true without auto-copying', () => {
  const originalWindow = globalThis.window;
  Object.defineProperty(globalThis, 'window', {
    configurable: true,
    value: {
      location: {
        search: '?debug=true',
      },
    },
  });

  try {
    assert.equal(readDoctorCodexHandoffMode(), 'prompt');
  } finally {
    Object.defineProperty(globalThis, 'window', {
      configurable: true,
      value: originalWindow,
    });
  }
});

test('Doctor Codex handoff can be disabled explicitly even when debug=true', () => {
  const originalWindow = globalThis.window;
  Object.defineProperty(globalThis, 'window', {
    configurable: true,
    value: {
      location: {
        search: '?debug=true&doctor-codex=off',
      },
    },
  });

  try {
    assert.equal(readDoctorCodexHandoffMode(), 'off');
  } finally {
    Object.defineProperty(globalThis, 'window', {
      configurable: true,
      value: originalWindow,
    });
  }
});

test('Doctor Codex handoff is available for warning-only reports', () => {
  assert.equal(doctorReportHasCodexHandoff(buildReport({ severity: 'warning' })), true);
  assert.equal(doctorReportHasCodexHandoff({
    issueCount: 0,
    warningCount: 0,
    errorCount: 0,
  }), false);
});

test('Doctor Codex handoff button title stays compact instead of embedding result JSON', () => {
  const title = formatCodexHandoffButtonTitle({
    ok: true,
    mode: 'terminal',
    id: '2026-04-29T15-36-48-190Z-d6f21c60e0de',
    pid: 63860,
    command: 'open',
    args: [
      '-a',
      'Terminal',
      '/workspace/nex-note/.nex/codex-handoffs/2026-04-29T15-36-48-190Z-d6f21c60e0de/run-codex.command',
    ],
    promptPath: '/workspace/nex-note/.nex/codex-handoffs/2026-04-29T15-36-48-190Z-d6f21c60e0de/prompt.md',
    reportPath: '/workspace/nex-note/.nex/codex-handoffs/2026-04-29T15-36-48-190Z-d6f21c60e0de/doctor-report.json',
    scriptPath: '/workspace/nex-note/.nex/codex-handoffs/2026-04-29T15-36-48-190Z-d6f21c60e0de/run-codex.command',
  });

  assert.equal(title.includes('\n'), false);
  assert.equal(title.includes('{'), false);
  assert.equal(title.includes('promptPath'), false);
  assert.equal(title.includes('scriptPath'), false);
  assert.match(title, /Terminal opened/);
  assert.match(title, /2026-04-29T15-36-48-190Z-d6f21c60e0de/);
});
