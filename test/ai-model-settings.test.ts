import test from 'node:test';
import assert from 'node:assert/strict';

import {
  AI_MODEL_SETTINGS_STORAGE_KEY,
  buildAiProviderRequestSettings,
  normalizeAiModelSettings,
  normalizeAiProviderRequestSettings,
  migrateStoredAiKeys,
  readAiModelSettings,
  resetStoredKeyMigrationState,
  withApiKeys,
  writeAiModelSettings,
  type SecureKeyBridge,
} from '../lib/ai-model-settings.ts';
import type { ProviderName } from '../lib/ai-provider-config.ts';

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
  resetStoredKeyMigrationState();
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
      openai: { enabled: false },
      claude: { enabled: false },
      gemini: { enabled: false },
    },
  });
  assert.equal(allDisabled.providers.ollama.enabled, true);
});

test('AI model settings persist model choices locally, keep keys in memory, and build sanitized request settings', async () => {
  const settings = normalizeAiModelSettings({
    providers: {
      ollama: {
        enabled: true,
        apiKey: '  ollama-key  ',
        selectedModel: 'gemma4:31b',
        models: [{ id: 'gemma4:31b', label: 'Gemma' }],
        baseUrl: ' http://localhost:11434/ ',
      },
      openai: {
        enabled: false,
        apiKey: 'openai-key',
        selectedModel: 'gpt-5.6-sol',
        models: [{ id: 'gpt-5.6-sol', label: 'GPT-5.6 Sol' }],
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

  await migrateStoredAiKeys(null, storage);
  writeAiModelSettings(settings);
  const raw = storage.getItem(AI_MODEL_SETTINGS_STORAGE_KEY);
  assert.ok(raw);
  assert.doesNotMatch(raw!, /ollama-key|openai-key|anthropic-key/, 'API keys must never reach localStorage');
  const stored = readAiModelSettings();
  assert.equal(stored.providers.openai.apiKey, '');
  // Keys live in memory (React state) for the session.
  const request = buildAiProviderRequestSettings(withApiKeys(stored, {
    ollama: settings.providers.ollama.apiKey,
    openai: settings.providers.openai.apiKey,
    claude: settings.providers.claude.apiKey,
  }));

  assert.deepEqual(request.enabledProviders, ['ollama', 'gemini']);
  assert.deepEqual(request.apiKeys, {
    ollama: 'ollama-key',
    openai: 'openai-key',
    claude: 'anthropic-key',
  });
  assert.deepEqual(request.models, {
    ollama: 'gemma4:31b',
    openai: 'gpt-5.6-sol',
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

function legacySettingsWithKeys() {
  return JSON.stringify({
    version: 1,
    providers: {
      openai: { enabled: true, apiKey: 'sk-test-openai-legacy-0001', selectedModel: 'gpt-5.6-sol' },
      claude: { enabled: true, apiKey: 'sk-test-claude-legacy-0002', selectedModel: 'claude-sonnet-4-6' },
      gemini: { enabled: true, apiKey: '' },
    },
  });
}

class FakeSecureKeyBridge implements SecureKeyBridge {
  keys = new Map<ProviderName, string>();
  failFor = new Set<ProviderName>();
  async isAvailable() { return { ok: true, available: true }; }
  async list() { return { ok: true, providers: [...this.keys.keys()] }; }
  async get(provider: ProviderName) { return { ok: true, key: this.keys.get(provider) }; }
  async set(provider: ProviderName, key: string) {
    if (this.failFor.has(provider)) return { ok: false, error: 'keychain locked' };
    this.keys.set(provider, key);
    return { ok: true };
  }
  async delete(provider: ProviderName) { this.keys.delete(provider); return { ok: true }; }
}

test('browser: keys an older version stored in localStorage are stripped on load, never persisted', async () => {
  storage.setItem(AI_MODEL_SETTINGS_STORAGE_KEY, legacySettingsWithKeys());

  assert.equal(readAiModelSettings().providers.openai.apiKey, '', 'read never surfaces a stored key');
  const result = await migrateStoredAiKeys(null, storage);

  assert.deepEqual(result.migrated, []);
  assert.deepEqual(result.removed.sort(), ['claude', 'openai']);
  assert.doesNotMatch(storage.getItem(AI_MODEL_SETTINGS_STORAGE_KEY)!, /sk-test-/);
  assert.equal(JSON.parse(storage.getItem(AI_MODEL_SETTINGS_STORAGE_KEY)!).providers.openai.selectedModel, 'gpt-5.6-sol');

  writeAiModelSettings(withApiKeys(readAiModelSettings(), { gemini: 'sk-test-gemini-session-0003' }));
  assert.doesNotMatch(storage.getItem(AI_MODEL_SETTINGS_STORAGE_KEY)!, /sk-test-/);
});

test('desktop: legacy keys move to the keychain and leave localStorage only after a successful write', async () => {
  storage.setItem(AI_MODEL_SETTINGS_STORAGE_KEY, legacySettingsWithKeys());
  const bridge = new FakeSecureKeyBridge();
  bridge.failFor.add('claude');

  // A settings write before the migration ran must not drop a key that is not in the keychain yet.
  writeAiModelSettings(readAiModelSettings());
  assert.match(storage.getItem(AI_MODEL_SETTINGS_STORAGE_KEY)!, /sk-test-openai-legacy-0001/);

  const result = await migrateStoredAiKeys(bridge, storage);
  assert.deepEqual(result.migrated, ['openai']);
  assert.deepEqual(result.failed, ['claude']);
  assert.deepEqual(result.retainedKeys, { claude: 'sk-test-claude-legacy-0002' });
  assert.equal(bridge.keys.get('openai'), 'sk-test-openai-legacy-0001');

  const raw = storage.getItem(AI_MODEL_SETTINGS_STORAGE_KEY)!;
  assert.doesNotMatch(raw, /sk-test-openai-legacy-0001/, 'migrated key removed from localStorage');
  assert.match(raw, /sk-test-claude-legacy-0002/, 'failed key kept for the next start');

  // Later writes keep the failed key until it migrates, and never add the migrated one back.
  writeAiModelSettings(withApiKeys(readAiModelSettings(), { openai: 'sk-test-openai-legacy-0001' }));
  const after = storage.getItem(AI_MODEL_SETTINGS_STORAGE_KEY)!;
  assert.doesNotMatch(after, /sk-test-openai-legacy-0001/);
  assert.match(after, /sk-test-claude-legacy-0002/);

  bridge.failFor.clear();
  resetStoredKeyMigrationState();
  const retry = await migrateStoredAiKeys(bridge, storage);
  assert.deepEqual(retry.migrated, ['claude']);
  assert.doesNotMatch(storage.getItem(AI_MODEL_SETTINGS_STORAGE_KEY)!, /sk-test-/);
});

test('client request settings can never switch the server-key fallback', () => {
  const normalized = normalizeAiProviderRequestSettings({
    apiKeys: { openai: 'sk-test-openai-0004' },
    serverKeyFallback: true,
  });
  assert.equal('serverKeyFallback' in normalized, false);
});
