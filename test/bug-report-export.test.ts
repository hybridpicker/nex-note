import test from 'node:test';
import assert from 'node:assert/strict';

import { buildBugReportBundle } from '@/lib/bug-report-export';

test('buildBugReportBundle includes user report, prompt, and markdown summary', () => {
  const report = buildBugReportBundle({
    form: {
      title: 'Selection jumped',
      whatHappened: 'After transpose, the selection jumped to the wrong note.',
      expected: 'The original note should stay selected.',
      stepsTried: '1. Open file\n2. Click note\n3. Transpose +2',
      includeXml: true,
      includeChatTranscript: true,
      includeStorageSnapshot: false,
    },
    filename: 'leadsheet-repeat.musicxml',
    xml: '<score-partwise version="3.1"><part><measure number="1" /></part></score-partwise>',
    chatTranscript: [
      { role: 'user', text: 'transpose that note' },
      { role: 'assistant', text: 'Prepared transpose preview.', provider: 'ollama', model: 'gemma4:31b', latencyMs: 42 },
    ],
  });

  assert.equal(report.schemaVersion, 1);
  assert.equal(report.userReport.title, 'Selection jumped');
  assert.equal(report.currentScore.filename, 'leadsheet-repeat.musicxml');
  assert.equal(report.currentScore.xml?.includes('<score-partwise'), true);
  assert.equal(report.chatTranscript?.length, 2);
  assert.match(report.promptForAgents, /Analyze this nex-note bug bundle/i);
  assert.match(report.markdown, /What happened:/);
  assert.match(report.markdown, /Recent actions/);
  assert.match(report.markdown, /Suggested debugging prompt/);
});
