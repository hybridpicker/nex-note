import test from 'node:test';
import assert from 'node:assert/strict';

import {
  buildSemanticGridCodexPrompt,
  semanticGridCodexPromptSignature,
} from '../src/debug/semantic-grid/codex-handoff.ts';

function buildSummary(input: { issue?: string; generatedAt?: string } = {}) {
  return {
    generatedAt: input.generatedAt ?? '2026-04-30T08:00:00.000Z',
    coordinateSpace: 'dom',
    issueCount: 3,
    debugLayer: {
      semanticGridIssueCount: 3,
      snapIssueCount: 1,
      scoreDiagnosticCount: 0,
      dashedLayoutErrorCount: 2,
    },
    layout: {
      issueCount: 2,
      affectedMeasures: [1],
      affectedStaves: [0],
    },
    activeAnchor: {
      issueCount: 1,
      target: { measure: 1, staff: 0 },
    },
    issues: [
      input.issue ?? 'layout error: protected notation overlaps rendered visual event',
    ],
    scoreDiagnostics: [],
  };
}

test('Semantic Grid Codex handoff prompt includes actionable debug context', () => {
  const prompt = buildSemanticGridCodexPrompt({
    summary: buildSummary(),
    history: [buildSummary({ issue: 'ghost_x_not_on_snap_grid' })],
    context: {
      filename: 'semantic-grid.musicxml',
      scoreRevision: 12,
    },
    recentEvents: [{
      source: 'semantic-grid',
      action: 'show-errors',
      payload: { issueCount: 3 },
    }],
  });

  assert.match(prompt, /Du bist Codex im nex-note Repository/);
  assert.match(prompt, /Semantic-Grid-\/Snap-\/Layout-Issue/);
  assert.match(prompt, /protected notation overlaps/);
  assert.match(prompt, /ghost_x_not_on_snap_grid/);
  assert.match(prompt, /semantic-grid\.musicxml/);
  assert.match(prompt, /Letzte Debug-\/Bug-Recorder-Events/);
});

test('Semantic Grid Codex handoff signature changes with report identity', () => {
  assert.notEqual(
    semanticGridCodexPromptSignature(buildSummary({ generatedAt: '2026-04-30T08:00:00.000Z' })),
    semanticGridCodexPromptSignature(buildSummary({ generatedAt: '2026-04-30T08:00:01.000Z' })),
  );
  assert.notEqual(
    semanticGridCodexPromptSignature(buildSummary({ issue: 'issue:a' })),
    semanticGridCodexPromptSignature(buildSummary({ issue: 'issue:b' })),
  );
});
