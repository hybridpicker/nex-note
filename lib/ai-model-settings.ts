import { OLLAMA_MODELS, type ProviderName } from '@/lib/ai-provider-config';

export type AiModelOption = { id: string; label: string };

export interface AiProviderModelSettings {
  enabled: boolean;
  apiKey: string;
  selectedModel: string;
  models: AiModelOption[];
  baseUrl?: string;
}

export interface AiModelSettings {
  version: 1;
  providers: Record<ProviderName, AiProviderModelSettings>;
}

export interface AiProviderRequestSettings {
  enabledProviders?: ProviderName[];
  apiKeys?: Partial<Record<ProviderName, string>>;
  models?: Partial<Record<ProviderName, string>>;
  ollamaBaseUrl?: string;
  /**
   * Server-side only, set by the public AI gate: `false` forbids falling back to keys from the
   * server environment. Never read from a client payload (see normalizeAiProviderRequestSettings).
   */
  serverKeyFallback?: boolean;
}

/**
 * Desktop key store exposed by the Electron preload as `window.nexNoteSecureKeys`
 * (electron/secure-keys.cjs). Keys are encrypted with the OS keychain via safeStorage.
 */
export interface SecureKeyBridge {
  isAvailable(): Promise<{ ok: boolean; available: boolean; error?: string }>;
  list(): Promise<{ ok: boolean; providers?: ProviderName[]; error?: string }>;
  get(provider: ProviderName): Promise<{ ok: boolean; key?: string; error?: string }>;
  set(provider: ProviderName, key: string): Promise<{ ok: boolean; error?: string }>;
  delete(provider: ProviderName): Promise<{ ok: boolean; error?: string }>;
}

type StorageLike = Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>;

export const AI_MODEL_SETTINGS_STORAGE_KEY = 'nex-note:ai-model-settings';
export const AI_PROVIDER_ORDER: ProviderName[] = ['ollama', 'openai', 'claude', 'gemini'];

export const OPENAI_MODELS: AiModelOption[] = [
  { id: 'gpt-5.6-sol', label: 'GPT-5.6 Sol (Recommended)' },
];

export const CLAUDE_MODELS: AiModelOption[] = [
  { id: 'claude-sonnet-4-6', label: 'Claude Sonnet 4.6' },
];

export const GEMINI_MODELS: AiModelOption[] = [
  { id: 'gemini-2.5-flash', label: 'Gemini 2.5 Flash' },
  { id: 'gemini-2.5-pro', label: 'Gemini 2.5 Pro' },
];

export const DEFAULT_AI_MODEL_SETTINGS: AiModelSettings = {
  version: 1,
  providers: {
    ollama: {
      enabled: true,
      apiKey: '',
      selectedModel: OLLAMA_MODELS[0]?.id ?? 'gemma4:31b',
      models: OLLAMA_MODELS,
      baseUrl: '',
    },
    openai: {
      enabled: true,
      apiKey: '',
      selectedModel: OPENAI_MODELS[0].id,
      models: OPENAI_MODELS,
    },
    claude: {
      enabled: true,
      apiKey: '',
      selectedModel: CLAUDE_MODELS[0].id,
      models: CLAUDE_MODELS,
    },
    gemini: {
      enabled: true,
      apiKey: '',
      selectedModel: GEMINI_MODELS[0].id,
      models: GEMINI_MODELS,
    },
  },
};

function isProviderName(value: unknown): value is ProviderName {
  return typeof value === 'string' && (AI_PROVIDER_ORDER as string[]).includes(value);
}

function normalizeModelOptions(value: unknown, fallback: AiModelOption[]) {
  const seen = new Set<string>();
  const models = Array.isArray(value)
    ? value.flatMap((entry) => {
        if (!entry || typeof entry !== 'object') return [];
        const id = typeof (entry as { id?: unknown }).id === 'string'
          ? (entry as { id: string }).id.trim()
          : '';
        if (!id || seen.has(id)) return [];
        seen.add(id);
        const label = typeof (entry as { label?: unknown }).label === 'string'
          ? (entry as { label: string }).label.trim()
          : '';
        return [{ id, label: label || id }];
      })
    : [];

  return models.length > 0 ? models : fallback;
}

function normalizeProviderSettings(
  value: unknown,
  fallback: AiProviderModelSettings,
): AiProviderModelSettings {
  const raw = value && typeof value === 'object' ? value as Partial<AiProviderModelSettings> : {};
  const models = normalizeModelOptions(raw.models, fallback.models);
  const selectedModel = typeof raw.selectedModel === 'string' && raw.selectedModel.trim()
    ? raw.selectedModel.trim()
    : fallback.selectedModel;
  const normalizedSelectedModel = models.some((model) => model.id === selectedModel)
    ? selectedModel
    : models[0]?.id ?? fallback.selectedModel;

  return {
    enabled: typeof raw.enabled === 'boolean' ? raw.enabled : fallback.enabled,
    apiKey: typeof raw.apiKey === 'string' ? raw.apiKey : '',
    selectedModel: normalizedSelectedModel,
    models,
    baseUrl: typeof raw.baseUrl === 'string' ? raw.baseUrl : fallback.baseUrl,
  };
}

export function normalizeAiModelSettings(value: unknown): AiModelSettings {
  const raw = value && typeof value === 'object' ? value as Partial<AiModelSettings> : {};
  const providers = raw.providers && typeof raw.providers === 'object'
    ? raw.providers as Partial<Record<ProviderName, unknown>>
    : {};
  const normalizedProviders = {
    ollama: normalizeProviderSettings(providers.ollama, DEFAULT_AI_MODEL_SETTINGS.providers.ollama),
    openai: normalizeProviderSettings(providers.openai, DEFAULT_AI_MODEL_SETTINGS.providers.openai),
    claude: normalizeProviderSettings(providers.claude, DEFAULT_AI_MODEL_SETTINGS.providers.claude),
    gemini: normalizeProviderSettings(providers.gemini, DEFAULT_AI_MODEL_SETTINGS.providers.gemini),
  };

  if (!AI_PROVIDER_ORDER.some((provider) => normalizedProviders[provider].enabled)) {
    normalizedProviders.ollama.enabled = true;
  }

  return {
    version: 1,
    providers: normalizedProviders,
  };
}

function browserStorage(): StorageLike | null {
  if (typeof window === 'undefined' || typeof window.localStorage === 'undefined') return null;
  return window.localStorage;
}

/** The same settings with every API key removed; what may be written to localStorage. */
export function withoutApiKeys(settings: AiModelSettings): AiModelSettings {
  const normalized = normalizeAiModelSettings(settings);
  const providers = { ...normalized.providers };
  for (const provider of AI_PROVIDER_ORDER) {
    providers[provider] = { ...providers[provider], apiKey: '' };
  }
  return { ...normalized, providers };
}

/**
 * Model choices from localStorage, never keys: keys live in memory (Session Key) or, on the
 * desktop, in the OS keychain. Keys an older version left in storage are ignored here and
 * removed by `migrateStoredAiKeys`.
 */
export function readAiModelSettings(): AiModelSettings {
  const storage = browserStorage();
  if (!storage) return DEFAULT_AI_MODEL_SETTINGS;

  try {
    return withoutApiKeys(normalizeAiModelSettings(JSON.parse(storage.getItem(AI_MODEL_SETTINGS_STORAGE_KEY) ?? 'null')));
  } catch {
    return DEFAULT_AI_MODEL_SETTINGS;
  }
}

/** Persists model choices only; API keys are always stripped before writing. */
export function writeAiModelSettings(settings: AiModelSettings) {
  const storage = browserStorage();
  if (!storage) return;
  const stored = readRawStoredSettings(storage);
  const legacyKeys = stored ? collectApiKeys(stored) : {};
  const next = withoutApiKeys(settings);
  // A key an older version stored is kept until migrateStoredAiKeys has moved it to the
  // keychain (or, without one, dropped it); a failed keychain write keeps it for the next start.
  for (const [provider, key] of Object.entries(legacyKeys) as Array<[ProviderName, string]>) {
    if (!legacyKeyMigrationRan || retainedLegacyKeyProviders.has(provider)) {
      next.providers[provider] = { ...next.providers[provider], apiKey: key };
    }
  }
  storage.setItem(AI_MODEL_SETTINGS_STORAGE_KEY, JSON.stringify(next));
}

function readRawStoredSettings(storage: StorageLike): AiModelSettings | null {
  try {
    const raw = storage.getItem(AI_MODEL_SETTINGS_STORAGE_KEY);
    return raw ? normalizeAiModelSettings(JSON.parse(raw)) : null;
  } catch {
    return null;
  }
}

function collectApiKeys(settings: AiModelSettings) {
  const keys: Partial<Record<ProviderName, string>> = {};
  for (const provider of AI_PROVIDER_ORDER) {
    const key = settings.providers[provider].apiKey.trim();
    if (key) keys[provider] = key;
  }
  return keys;
}

let legacyKeyMigrationRan = false;
/** Providers whose legacy localStorage key is still waiting for a successful keychain write. */
const retainedLegacyKeyProviders = new Set<ProviderName>();

/** Test hook: forget that a migration ran in this process. */
export function resetStoredKeyMigrationState() {
  legacyKeyMigrationRan = false;
  retainedLegacyKeyProviders.clear();
}

export function readSecureKeyBridge(): SecureKeyBridge | null {
  if (typeof window === 'undefined') return null;
  const bridge = (window as unknown as { nexNoteSecureKeys?: Partial<SecureKeyBridge> }).nexNoteSecureKeys;
  if (!bridge || typeof bridge.get !== 'function' || typeof bridge.set !== 'function'
    || typeof bridge.delete !== 'function' || typeof bridge.list !== 'function'
    || typeof bridge.isAvailable !== 'function') return null;
  return bridge as SecureKeyBridge;
}

export interface StoredKeyMigrationResult {
  migrated: ProviderName[];
  removed: ProviderName[];
  failed: ProviderName[];
  /** Keys whose keychain write failed; still usable in memory for this session. */
  retainedKeys: Partial<Record<ProviderName, string>>;
  error?: string;
}

/**
 * Removes API keys an older version wrote to localStorage.
 *
 * With a desktop key store, each key is first written to the keychain and only removed from
 * localStorage after that write succeeded; a failed one stays and is retried next start. Without
 * one (the Browser Preview, plain browsers), keys are never persisted, so they are dropped.
 */
export async function migrateStoredAiKeys(
  bridge: SecureKeyBridge | null,
  storage: StorageLike | null = browserStorage(),
): Promise<StoredKeyMigrationResult> {
  const result: StoredKeyMigrationResult = { migrated: [], removed: [], failed: [], retainedKeys: {} };
  const finish = () => {
    retainedLegacyKeyProviders.clear();
    result.failed.forEach((provider) => retainedLegacyKeyProviders.add(provider));
    legacyKeyMigrationRan = true;
    return result;
  };
  if (!storage) return finish();
  const stored = readRawStoredSettings(storage);
  if (!stored) return finish();
  const keys = collectApiKeys(stored);
  const providers = Object.keys(keys) as ProviderName[];
  if (providers.length === 0) return finish();

  const toRemove = new Set<ProviderName>();
  if (!bridge) {
    providers.forEach((provider) => toRemove.add(provider));
  } else {
    for (const provider of providers) {
      try {
        const write = await bridge.set(provider, keys[provider]!);
        if (write?.ok) {
          result.migrated.push(provider);
          toRemove.add(provider);
        } else {
          result.failed.push(provider);
          result.retainedKeys[provider] = keys[provider];
          if (write?.error) result.error = write.error;
        }
      } catch {
        result.failed.push(provider);
        result.retainedKeys[provider] = keys[provider];
      }
    }
  }

  const latest = readRawStoredSettings(storage) ?? stored;
  const next = normalizeAiModelSettings(latest);
  for (const provider of toRemove) {
    next.providers[provider] = { ...next.providers[provider], apiKey: '' };
    result.removed.push(provider);
  }
  storage.setItem(AI_MODEL_SETTINGS_STORAGE_KEY, JSON.stringify(next));
  return finish();
}

/** Reads every key saved in the desktop keychain into memory for requests (one IPC call each). */
export async function loadSavedAiKeys(bridge: SecureKeyBridge | null) {
  const keys: Partial<Record<ProviderName, string>> = {};
  if (!bridge) return keys;
  const listed = await bridge.list().catch(() => ({ ok: false, providers: [] as ProviderName[] }));
  if (!listed.ok) return keys;
  for (const provider of listed.providers ?? []) {
    if (!isProviderName(provider)) continue;
    const entry = await bridge.get(provider).catch(() => ({ ok: false, key: undefined }));
    if (entry.ok && typeof entry.key === 'string' && entry.key.trim()) keys[provider] = entry.key.trim();
  }
  return keys;
}

/** Puts in-memory keys (Session Keys or keychain keys) into settings held in React state. */
export function withApiKeys(settings: AiModelSettings, keys: Partial<Record<ProviderName, string>>): AiModelSettings {
  const normalized = normalizeAiModelSettings(settings);
  const providers = { ...normalized.providers };
  for (const [provider, key] of Object.entries(keys) as Array<[ProviderName, string]>) {
    if (!isProviderName(provider) || typeof key !== 'string') continue;
    providers[provider] = { ...providers[provider], apiKey: key };
  }
  return { ...normalized, providers };
}

export function buildAiProviderRequestSettings(settings: AiModelSettings): AiProviderRequestSettings {
  const normalized = normalizeAiModelSettings(settings);
  const requestSettings: AiProviderRequestSettings = {
    enabledProviders: AI_PROVIDER_ORDER.filter((provider) => normalized.providers[provider].enabled),
    apiKeys: {},
    models: {},
  };

  for (const provider of AI_PROVIDER_ORDER) {
    const config = normalized.providers[provider];
    const apiKey = config.apiKey.trim();
    if (apiKey) requestSettings.apiKeys![provider] = apiKey;
    if (config.selectedModel.trim()) requestSettings.models![provider] = config.selectedModel.trim();
  }

  const ollamaBaseUrl = normalized.providers.ollama.baseUrl?.trim();
  if (ollamaBaseUrl) requestSettings.ollamaBaseUrl = ollamaBaseUrl;

  return requestSettings;
}

export function normalizeAiProviderRequestSettings(value: unknown): AiProviderRequestSettings {
  if (!value || typeof value !== 'object') return {};
  const raw = value as AiProviderRequestSettings;
  const settings: AiProviderRequestSettings = {};

  if (Array.isArray(raw.enabledProviders)) {
    settings.enabledProviders = raw.enabledProviders.filter(isProviderName);
  }

  if (raw.apiKeys && typeof raw.apiKeys === 'object') {
    settings.apiKeys = {};
    for (const provider of AI_PROVIDER_ORDER) {
      const apiKey = raw.apiKeys[provider];
      if (typeof apiKey === 'string' && apiKey.trim()) settings.apiKeys[provider] = apiKey.trim();
    }
  }

  if (raw.models && typeof raw.models === 'object') {
    settings.models = {};
    for (const provider of AI_PROVIDER_ORDER) {
      const model = raw.models[provider];
      if (typeof model === 'string' && model.trim()) settings.models[provider] = model.trim();
    }
  }

  if (typeof raw.ollamaBaseUrl === 'string' && raw.ollamaBaseUrl.trim()) {
    settings.ollamaBaseUrl = raw.ollamaBaseUrl.trim().replace(/\/+$/, '');
  }

  return settings;
}

export function mergeModelOptions(...groups: AiModelOption[][]): AiModelOption[] {
  const seen = new Set<string>();
  return groups.flat().filter((model) => {
    if (!model.id || seen.has(model.id)) return false;
    seen.add(model.id);
    return true;
  });
}
