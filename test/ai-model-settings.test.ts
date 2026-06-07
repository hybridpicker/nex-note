import test from 'node:test';
import assert from 'node:assert/strict';

import {
  AI_MODEL_SETTINGS_STORAGE_KEY,
  buildAiProviderRequestSettings,
  normalizeAiModelSettings,
  normalizeAiProviderRequestSettings,
  readAiModelSettings,
  writeAiModelSettings,
} from '../lib/ai-model-settings.ts';

class MemoryStorage {
  private data = new Map<string, string>();
  getItem(key: string) { return this.data.has(key) ? this.data.get(key)! : null; }
  setItem(key: string, value: string) { this.data.set(key, value); }
  removeItem(key: string) { this.data.delete(key); }
  clear() { this.data.clear(); }
}

const storage = new MemoryStorage();

test.beforeEach(() => {
  storage.clear();
  Object.assign(globalThis, {
    window: {
      localStorage: storage,
    },
  });
});

test('AI model settings normalize model lists and selected defaults', () => {
  const settings = normalizeAiModelSettings({
    providers: {
      ollama: {
        enabled: false,
        apiKey: 'ollama-key',
        selectedModel: 'custom:latest',
        models: [
          { id: 'custom:latest', label: 'Custom' },
          { id: 'custom:latest', label: 'Duplicate' },
          { id: '', label: 'Empty' },
        ],
        baseUrl: 'http://127.0.0.1:11434',
      },
      claude: {
        enabled: true,
        apiKey: 'anthropic-key',
        selectedModel: 'missing-model',
        models: [{ id: 'claude-custom', label: 'Claude Custom' }],
      },
    },
  });

  assert.equal(settings.providers.ollama.enabled, false);
  assert.deepEqual(settings.providers.ollama.models, [{ id: 'custom:latest', label: 'Custom' }]);
  assert.equal(settings.providers.ollama.selectedModel, 'custom:latest');
  assert.equal(settings.providers.claude.selectedModel, 'claude-custom');

  const allDisabled = normalizeAiModelSettings({
    providers: {
      ollama: { enabled: false },
      claude: { enabled: false },
      gemini: { enabled: false },
    },
  });
  assert.equal(allDisabled.providers.ollama.enabled, true);
});

test('AI model settings persist locally and build sanitized request settings', () => {
  const settings = normalizeAiModelSettings({
    providers: {
      ollama: {
        enabled: true,
        apiKey: '  ollama-key  ',
        selectedModel: 'gemma4:31b',
        models: [{ id: 'gemma4:31b', label: 'Gemma' }],
        baseUrl: ' http://localhost:11434/ ',
      },
      claude: {
        enabled: false,
        apiKey: 'anthropic-key',
        selectedModel: 'claude-custom',
        models: [{ id: 'claude-custom', label: 'Claude Custom' }],
      },
      gemini: {
        enabled: true,
        apiKey: '',
        selectedModel: 'gemini-2.5-pro',
        models: [{ id: 'gemini-2.5-pro', label: 'Gemini Pro' }],
      },
    },
  });

  writeAiModelSettings(settings);
  assert.ok(storage.getItem(AI_MODEL_SETTINGS_STORAGE_KEY));
  const stored = readAiModelSettings();
  const request = buildAiProviderRequestSettings(stored);

  assert.deepEqual(request.enabledProviders, ['ollama', 'gemini']);
  assert.deepEqual(request.apiKeys, {
    ollama: 'ollama-key',
    claude: 'anthropic-key',
  });
  assert.deepEqual(request.models, {
    ollama: 'gemma4:31b',
    claude: 'claude-custom',
    gemini: 'gemini-2.5-pro',
  });
  assert.equal(request.ollamaBaseUrl, 'http://localhost:11434/');

  const normalizedRequest = normalizeAiProviderRequestSettings({
    enabledProviders: ['ollama', 'bad-provider'],
    apiKeys: { ollama: ' key ', gemini: '' },
    models: { gemini: ' flash ', bad: 'ignored' },
    ollamaBaseUrl: 'http://localhost:11434///',
  });
  assert.deepEqual(normalizedRequest, {
    enabledProviders: ['ollama'],
    apiKeys: { ollama: 'key' },
    models: { gemini: 'flash' },
    ollamaBaseUrl: 'http://localhost:11434',
  });
});
