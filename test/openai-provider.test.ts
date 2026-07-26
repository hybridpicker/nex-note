import test from 'node:test';
import assert from 'node:assert/strict';
import { askOpenAI } from '@/lib/ai-providers';
import {
  AI_PROVIDER_ORDER,
  DEFAULT_AI_MODEL_SETTINGS,
  normalizeAiModelSettings,
  normalizeAiProviderRequestSettings,
} from '@/lib/ai-model-settings';

const originalFetch = globalThis.fetch;

test.afterEach(() => {
  globalThis.fetch = originalFetch;
  delete process.env.OPENAI_API_KEY;
  delete process.env.OPENAI_MODEL;
});

test('OpenAI is a first-class configurable provider with a current default and custom IDs', () => {
  assert.ok(AI_PROVIDER_ORDER.includes('openai'));
  assert.equal(DEFAULT_AI_MODEL_SETTINGS.providers.openai.selectedModel, 'gpt-5.6-sol');
  const settings = normalizeAiModelSettings({
    providers: {
      openai: {
        enabled: true,
        apiKey: 'secret',
        selectedModel: 'openai-custom-model',
        models: [{ id: 'openai-custom-model', label: '' }],
      },
    },
  });
  assert.equal(settings.providers.openai.selectedModel, 'openai-custom-model');
  assert.deepEqual(settings.providers.openai.models, [{ id: 'openai-custom-model', label: 'openai-custom-model' }]);
});

test('OpenAI request settings normalize keys without exposing unrelated fields', () => {
  const normalized = normalizeAiProviderRequestSettings({
    enabledProviders: ['openai', 'invalid'],
    apiKeys: { openai: '  sk-test-secret  ', invalid: 'leak' },
    models: { openai: ' custom-model ' },
    arbitrary: 'ignored',
  });
  assert.deepEqual(normalized, {
    enabledProviders: ['openai'],
    apiKeys: { openai: 'sk-test-secret' },
    models: { openai: 'custom-model' },
  });
});

test('OpenAI reports a sanitized missing-key error', async () => {
  const response = await askOpenAI('Return JSON');
  assert.equal(response.provider, 'openai');
  assert.match(response.error ?? '', /OPENAI_API_KEY not set/);
  assert.doesNotMatch(response.error ?? '', /sk-/);
});

test('OpenAI uses structured Responses output and reports the actual model', async () => {
  globalThis.fetch = (async (_input, init) => {
    const body = JSON.parse(String(init?.body));
    assert.equal(body.text.format.type, 'json_schema');
    assert.equal(body.store, false);
    assert.equal(body.model, 'custom-request-model');
    return new Response(JSON.stringify({
      id: 'resp_test',
      object: 'response',
      created_at: 1,
      status: 'completed',
      model: 'gpt-5.6-sol-2026-07-01',
      output: [{
        id: 'msg_test',
        type: 'message',
        role: 'assistant',
        status: 'completed',
        content: [{
          type: 'output_text',
          text: '{"commands":[],"explanation":"Analysis only","confidence":"high","ambiguities":[],"plan":[]}',
          annotations: [],
        }],
      }],
      output_text: '{"commands":[],"explanation":"Analysis only","confidence":"high","ambiguities":[],"plan":[]}',
      usage: { input_tokens: 1, output_tokens: 1, total_tokens: 2 },
    }), { status: 200, headers: { 'Content-Type': 'application/json' } });
  }) as typeof fetch;

  const response = await askOpenAI('Return JSON', {
    apiKeys: { openai: 'sk-test-secret' },
    models: { openai: 'custom-request-model' },
  });
  assert.equal(response.error, undefined);
  assert.equal(response.model, 'gpt-5.6-sol-2026-07-01');
  assert.match(response.text, /Analysis only/);
});

test('OpenAI authentication, rate-limit, unavailable-model, and timeout errors are sanitized', async () => {
  for (const [status, expected] of [[401, /authentication failed/], [429, /rate limit/], [404, /model is unavailable/]] as const) {
    globalThis.fetch = (async () => new Response(JSON.stringify({
      error: { message: 'sensitive upstream detail sk-secret', type: 'invalid_request_error' },
    }), { status, headers: { 'Content-Type': 'application/json' } })) as typeof fetch;
    const response = await askOpenAI('x', { apiKeys: { openai: 'sk-secret' } });
    assert.match(response.error ?? '', expected);
    assert.doesNotMatch(response.error ?? '', /sk-secret|sensitive upstream/);
  }
});
