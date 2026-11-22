import test from 'node:test';
import assert from 'node:assert/strict';
import { NextRequest } from 'next/server';

import { POST as chatPost } from '@/app/api/chat/route';
import { REDACTED, redactSecrets } from '@/lib/redact-secrets';
import { askClaude, askGemini, askOpenAI } from '@/lib/ai-providers';

const SESSION_KEY = 'sk-test-privacy-session-key-000000000001';
const SCORE_MARKER = 'PRIVATE-SCORE-TITLE-7f3a';

function chatRequest(body: string, host = 'nex-note.com') {
  return new NextRequest(`https://${host}/api/chat`, {
    method: 'POST',
    headers: { host, 'content-type': 'application/json', 'x-forwarded-for': '198.51.100.23' },
    body,
  });
}

test('redactSecrets removes known keys and common key shapes', () => {
  const text = `401 for ${SESSION_KEY}; header x-api-key: abcdefghijklmnop1234; url ?key=AIzaSyA-test-0000000000000000000; sk-ant-api03-test0000000000`;
  const redacted = redactSecrets(text, [SESSION_KEY]);
  assert.doesNotMatch(redacted, /sk-test-privacy|abcdefghijklmnop1234|AIzaSy|sk-ant-api03/);
  assert.match(redacted, new RegExp(REDACTED.replace(/[[\]]/g, '\\$&')));
});

test('chat route: a public request without a Session Key gets a typed 403 that echoes nothing', async () => {
  const response = await chatPost(chatRequest(JSON.stringify({
    message: 'make it louder',
    xml: `<score-partwise><work><work-title>${SCORE_MARKER}</work-title></work></score-partwise>`,
    provider: 'claude',
  })));
  assert.equal(response.status, 403);
  const body = await response.json() as { code?: string; error?: string };
  assert.equal(body.code, 'session_key_required');
  assert.doesNotMatch(JSON.stringify(body), new RegExp(SCORE_MARKER));
});

test('chat route: a public Ollama request is refused even with a key', async () => {
  const response = await chatPost(chatRequest(JSON.stringify({
    message: 'x',
    xml: '<score-partwise/>',
    provider: 'ollama',
    aiSettings: { apiKeys: { ollama: SESSION_KEY } },
  })));
  assert.equal(response.status, 403);
  const text = await response.text();
  assert.doesNotMatch(text, /sk-test-privacy/);
});

test('chat route: a malformed body answers 500 with only the error type, never the body or key', async () => {
  const response = await chatPost(chatRequest(`{"message":"x","provider":"claude","aiSettings":{"apiKeys":{"claude":"${SESSION_KEY}"}},"xml":"${SCORE_MARKER}`, 'localhost'));
  assert.equal(response.status, 500);
  const text = await response.text();
  assert.doesNotMatch(text, /sk-test-privacy/);
  assert.doesNotMatch(text, new RegExp(SCORE_MARKER));
  assert.match(text, /SyntaxError/);
});

test('providers never fall back to server env keys when the gate forbids it', async () => {
  const saved = {
    ANTHROPIC_API_KEY: process.env.ANTHROPIC_API_KEY,
    OPENAI_API_KEY: process.env.OPENAI_API_KEY,
    GEMINI_API_KEY: process.env.GEMINI_API_KEY,
  };
  process.env.ANTHROPIC_API_KEY = 'sk-test-server-env-anthropic-0001';
  process.env.OPENAI_API_KEY = 'sk-test-server-env-openai-0002';
  process.env.GEMINI_API_KEY = 'sk-test-server-env-gemini-0003';
  try {
    const settings = { serverKeyFallback: false } as const;
    const [claude, openai, gemini] = await Promise.all([
      askClaude('prompt', settings),
      askOpenAI('prompt', settings),
      askGemini('prompt', settings),
    ]);
    // Without a Session Key the providers stop before any network call.
    for (const result of [claude, openai, gemini]) {
      assert.match(result.error ?? '', /not set/);
      assert.equal(result.latencyMs, 0);
      assert.doesNotMatch(result.error ?? '', /sk-test-server-env/);
    }
  } finally {
    for (const [name, value] of Object.entries(saved)) {
      if (value === undefined) delete process.env[name];
      else process.env[name] = value;
    }
  }
});
