import test from 'node:test';
import assert from 'node:assert/strict';

import { buildIntentPrompt } from '../lib/prompts.ts';

test('buildIntentPrompt includes recent chat history turns with usage guidance', () => {
  const prompt = buildIntentPrompt(
    'make the second chord minor',
    { summary: { parts: [], totalMeasures: 4 } },
    undefined,
    {
      appLocale: 'en',
      chatHistory: [
        { role: 'user', text: 'add chords C G Am F to measures 1-4' },
        { role: 'assistant', text: 'I prepared chord symbols C, G, Am, F for measures 1-4.' },
        { role: 'user', text: 'make the second chord minor' },
      ],
    },
  );

  assert.match(prompt, /"chatHistory"/);
  assert.match(prompt, /add chords C G Am F to measures 1-4/);
  assert.match(prompt, /I prepared chord symbols C, G, Am, F/);
  assert.match(prompt, /chatHistory lists the most recent conversation turns, oldest first/);
});

test('buildIntentPrompt omits chat history guidance when no history is present', () => {
  const prompt = buildIntentPrompt(
    'transpose to D major',
    undefined,
    undefined,
    { appLocale: 'en', recentUserRequests: ['transpose to D major'] },
  );

  assert.doesNotMatch(prompt, /chatHistory lists the most recent conversation turns/);
});
