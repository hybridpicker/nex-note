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
}

export const AI_MODEL_SETTINGS_STORAGE_KEY = 'nex-note:ai-model-settings';
export const AI_PROVIDER_ORDER: ProviderName[] = ['ollama', 'claude', 'gemini'];

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

export function readAiModelSettings(): AiModelSettings {
  if (typeof window === 'undefined' || typeof window.localStorage === 'undefined') {
    return DEFAULT_AI_MODEL_SETTINGS;
  }

  try {
    return normalizeAiModelSettings(JSON.parse(window.localStorage.getItem(AI_MODEL_SETTINGS_STORAGE_KEY) ?? 'null'));
  } catch {
    return DEFAULT_AI_MODEL_SETTINGS;
  }
}

export function writeAiModelSettings(settings: AiModelSettings) {
  if (typeof window === 'undefined' || typeof window.localStorage === 'undefined') return;
  window.localStorage.setItem(AI_MODEL_SETTINGS_STORAGE_KEY, JSON.stringify(normalizeAiModelSettings(settings)));
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
