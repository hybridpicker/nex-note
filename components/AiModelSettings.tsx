'use client';

import { useEffect, useRef, useState } from 'react';
import type { ProviderName } from '@/lib/ai-provider-config';
import {
  AI_PROVIDER_ORDER,
  type AiModelOption,
  type AiModelSettings,
  mergeModelOptions,
  normalizeAiModelSettings,
} from '@/lib/ai-model-settings';
import { isSessionKeyProvider } from '@/lib/ai-access-surface';
import { useI18n } from '@/lib/i18n';

const AI_SETTINGS_PANEL_WIDTH = 520;
const VIEWPORT_MARGIN = 8;

/**
 * Left offset of the popover relative to its trigger: right-aligned with the trigger when that
 * fits, otherwise moved just far enough to stay inside the window (with a small margin).
 */
export function popoverOffset(trigger: { left: number; right: number }, panelWidth: number, viewportWidth: number) {
  const preferredLeft = trigger.right - panelWidth;
  const maxLeft = Math.max(VIEWPORT_MARGIN, viewportWidth - VIEWPORT_MARGIN - panelWidth);
  const left = Math.min(Math.max(preferredLeft, VIEWPORT_MARGIN), maxLeft);
  return Math.round(left - trigger.left);
}

const PROVIDER_LABELS: Record<ProviderName, string> = {
  ollama: 'Ollama',
  openai: 'OpenAI',
  claude: 'Claude',
  gemini: 'Gemini',
};

interface Props {
  settings: AiModelSettings;
  onSettingsChange: (settings: AiModelSettings) => void;
  onProviderChange: (provider: ProviderName) => void;
  onOllamaModelChange: (model: string) => void;
  liveOllamaModels: AiModelOption[];
  openSignal?: number;
  /** Browser Preview: cloud providers only, keys for this session only. */
  browserPreview?: boolean;
  /** Desktop: the OS keychain store is available. */
  secureKeysAvailable?: boolean;
  savedKeyProviders?: ProviderName[];
  onSaveKey?: (provider: ProviderName, key: string) => Promise<{ ok: boolean; error?: string }>;
  onDeleteSavedKey?: (provider: ProviderName) => Promise<{ ok: boolean; error?: string }>;
}

export default function AiModelSettingsPanel({
  settings,
  onSettingsChange,
  onProviderChange,
  onOllamaModelChange,
  liveOllamaModels,
  openSignal = 0,
  browserPreview = false,
  secureKeysAvailable = false,
  savedKeyProviders = [],
  onSaveKey,
  onDeleteSavedKey,
}: Props) {
  const { t } = useI18n();
  const [open, setOpen] = useState(false);
  const [keyMessages, setKeyMessages] = useState<Partial<Record<ProviderName, string>>>({});
  const visibleProviders = browserPreview ? AI_PROVIDER_ORDER.filter(isSessionKeyProvider) : AI_PROVIDER_ORDER;

  function keyStatusLabel(provider: ProviderName, apiKey: string) {
    if (savedKeyProviders.includes(provider)) return t('aiKeys.savedInKeychain');
    return apiKey.trim() ? t('aiKeys.sessionOnly') : t('aiKeys.noKey');
  }

  async function runKeyAction(provider: ProviderName, action: () => Promise<{ ok: boolean; error?: string }>) {
    const result = await action();
    setKeyMessages((current) => ({ ...current, [provider]: result.ok ? '' : (result.error ?? '') }));
  }
  const [newModelInputs, setNewModelInputs] = useState<Record<ProviderName, string>>({
    ollama: '',
    openai: '',
    claude: '',
    gemini: '',
  });
  const panelRef = useRef<HTMLDivElement>(null);
  // The trigger can sit near either window edge (beside the logo on the web, in a toolbar on the
  // desktop), so the popover is placed to stay inside the window.
  const [panelOffset, setPanelOffset] = useState<number | null>(null);
  const [panelMaxHeight, setPanelMaxHeight] = useState<number | null>(null);

  const normalizedSettings = normalizeAiModelSettings(settings);
  const enabledProviderCount = AI_PROVIDER_ORDER.filter((provider) => normalizedSettings.providers[provider].enabled).length;

  useEffect(() => {
    if (openSignal > 0) setOpen(true);
  }, [openSignal]);

  useEffect(() => {
    if (!open) return;
    function handleClick(event: MouseEvent) {
      if (panelRef.current && !panelRef.current.contains(event.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, [open]);

  function updateProvider(provider: ProviderName, patch: Partial<AiModelSettings['providers'][ProviderName]>) {
    const next = normalizeAiModelSettings({
      ...normalizedSettings,
      providers: {
        ...normalizedSettings.providers,
        [provider]: {
          ...normalizedSettings.providers[provider],
          ...patch,
        },
      },
    });
    onSettingsChange(next);
  }

  function setSelectedModel(provider: ProviderName, model: string) {
    updateProvider(provider, { selectedModel: model });
    if (provider === 'ollama') onOllamaModelChange(model);
  }

  function addModel(provider: ProviderName) {
    const id = newModelInputs[provider].trim();
    if (!id) return;
    const current = normalizedSettings.providers[provider];
    const models = mergeModelOptions(current.models, [{ id, label: id }]);
    updateProvider(provider, { models, selectedModel: id });
    if (provider === 'ollama') onOllamaModelChange(id);
    setNewModelInputs((prev) => ({ ...prev, [provider]: '' }));
  }

  function removeModel(provider: ProviderName, modelId: string) {
    const current = normalizedSettings.providers[provider];
    if (current.models.length <= 1) return;
    const models = current.models.filter((model) => model.id !== modelId);
    const selectedModel = current.selectedModel === modelId ? models[0].id : current.selectedModel;
    updateProvider(provider, { models, selectedModel });
    if (provider === 'ollama' && current.selectedModel === modelId) onOllamaModelChange(selectedModel);
  }

  function importLiveOllamaModels() {
    const current = normalizedSettings.providers.ollama;
    const models = mergeModelOptions(current.models, liveOllamaModels);
    updateProvider('ollama', { models });
  }

  return (
    <div className="relative" ref={panelRef}>
      <button
        type="button"
        onClick={(event) => {
          const rect = event.currentTarget.getBoundingClientRect();
          const panelWidth = Math.min(window.innerWidth * 0.92, AI_SETTINGS_PANEL_WIDTH);
          setPanelOffset(popoverOffset(rect, panelWidth, window.innerWidth));
          // Below the trigger (mt-2 = 8 px) down to a margin above the window's bottom edge.
          setPanelMaxHeight(Math.max(160, Math.floor(window.innerHeight - rect.bottom - 8 - VIEWPORT_MARGIN)));
          setOpen((value) => !value);
        }}
        title="AI model settings"
        aria-label="AI model settings"
        className="flex h-8 w-8 items-center justify-center rounded-md border border-nex-border bg-white text-slate-500 transition-colors hover:border-slate-300 hover:text-nex-ink"
      >
        <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.7} aria-hidden>
          <path strokeLinecap="round" strokeLinejoin="round" d="M10.5 6h9M10.5 12h9M10.5 18h9M4.5 6h.01M4.5 12h.01M4.5 18h.01" />
        </svg>
      </button>

      {open && (
        <div
          data-testid="ai-model-settings-panel"
          style={{
            ...(panelOffset === null ? {} : { left: panelOffset }),
            ...(panelMaxHeight === null ? {} : { maxHeight: panelMaxHeight }),
          }}
          className={`absolute ${panelOffset === null ? 'right-0' : ''} top-full z-50 mt-2 max-h-[calc(100dvh-6rem)] w-[min(92vw,520px)] overflow-y-auto overscroll-contain rounded-lg border border-nex-border bg-white p-4 shadow-xl`}
        >
          <div className="flex items-start justify-between gap-4">
            <div>
              <h2 className="text-sm font-semibold text-nex-ink">AI models</h2>
              <p className="mt-1 text-xs leading-5 text-slate-500">
                {browserPreview ? t('aiKeys.browserPreviewSessionOnly') : 'Configure provider keys, defaults, and model availability.'}
              </p>
            </div>
            <button
              type="button"
              onClick={() => setOpen(false)}
              aria-label="Close AI model settings"
              className="rounded-md px-2 py-1 text-sm text-slate-400 hover:bg-nex-surface hover:text-slate-700"
            >
              x
            </button>
          </div>

          <div className="mt-4 grid gap-4">
            {visibleProviders.map((provider) => {
              const config = normalizedSettings.providers[provider];
              return (
                <section key={provider} className="rounded-lg border border-slate-200 p-3">
                  <div className="flex items-center justify-between gap-3">
                    <label className="flex items-center gap-2 text-sm font-semibold text-nex-ink">
                      <input
                        type="checkbox"
                        checked={config.enabled}
                        disabled={config.enabled && enabledProviderCount <= 1}
                        onChange={(event) => updateProvider(provider, { enabled: event.target.checked })}
                        className="h-4 w-4 accent-nex-accent"
                      />
                      {PROVIDER_LABELS[provider]}
                    </label>
                    <button
                      type="button"
                      onClick={() => {
                        updateProvider(provider, { enabled: true });
                        onProviderChange(provider);
                      }}
                      className="rounded-md border border-nex-border px-2.5 py-1 text-xs font-medium text-slate-600 hover:bg-nex-surface hover:text-nex-ink"
                    >
                      Use
                    </button>
                  </div>

                  <div className="mt-3 grid gap-3 sm:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
                    <label className="block text-xs font-medium text-slate-500">
                      API key
                      <input
                        type="password"
                        value={config.apiKey}
                        onChange={(event) => updateProvider(provider, { apiKey: event.target.value })}
                        placeholder={provider === 'ollama' ? 'Optional for Ollama Cloud' : 'Paste provider API key'}
                        autoComplete="off"
                        spellCheck={false}
                        className="mt-1 h-8 w-full rounded-md border border-nex-border px-2 text-xs text-slate-700 outline-none focus:border-nex-accent"
                      />
                      <span className="mt-1 block text-[11px] font-normal text-slate-400">{keyStatusLabel(provider, config.apiKey)}</span>
                      {!browserPreview && secureKeysAvailable && (
                        <span className="mt-1 flex flex-wrap gap-2 text-[11px] font-medium">
                          {config.apiKey.trim() && onSaveKey && (
                            <button
                              type="button"
                              onClick={() => { void runKeyAction(provider, () => onSaveKey(provider, config.apiKey.trim())); }}
                              className="text-nex-accent hover:text-nex-ink"
                            >
                              {t('aiKeys.saveToKeychain')}
                            </button>
                          )}
                          {savedKeyProviders.includes(provider) && onDeleteSavedKey && (
                            <button
                              type="button"
                              onClick={() => { void runKeyAction(provider, () => onDeleteSavedKey(provider)); }}
                              className="text-slate-500 hover:text-rose-600"
                            >
                              {t('aiKeys.removeSaved')}
                            </button>
                          )}
                        </span>
                      )}
                      {keyMessages[provider] && (
                        <span role="alert" className="mt-1 block text-[11px] font-normal text-rose-600">{keyMessages[provider]}</span>
                      )}
                    </label>

                    <label className="block text-xs font-medium text-slate-500">
                      Default model
                      <select
                        value={config.selectedModel}
                        onChange={(event) => setSelectedModel(provider, event.target.value)}
                        className="mt-1 h-8 w-full rounded-md border border-nex-border bg-white px-2 text-xs text-slate-700 outline-none focus:border-nex-accent"
                      >
                        {config.models.map((model) => (
                          <option key={model.id} value={model.id}>{model.label}</option>
                        ))}
                      </select>
                    </label>
                  </div>

                  {provider === 'ollama' && (
                    <label className="mt-3 block text-xs font-medium text-slate-500">
                      Base URL
                      <input
                        value={config.baseUrl ?? ''}
                        onChange={(event) => updateProvider(provider, { baseUrl: event.target.value })}
                        placeholder="http://localhost:11434"
                        spellCheck={false}
                        className="mt-1 h-8 w-full rounded-md border border-nex-border px-2 text-xs text-slate-700 outline-none focus:border-nex-accent"
                      />
                    </label>
                  )}

                  <div className="mt-3">
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-xs font-medium text-slate-500">Available models</span>
                      {provider === 'ollama' && liveOllamaModels.length > 0 && (
                        <button
                          type="button"
                          onClick={importLiveOllamaModels}
                          className="text-xs font-medium text-nex-accent hover:text-nex-ink"
                        >
                          Add detected
                        </button>
                      )}
                    </div>
                    <div className="mt-2 flex max-h-24 flex-wrap gap-1.5 overflow-auto">
                      {config.models.map((model) => (
                        <span key={model.id} className="inline-flex items-center gap-1 rounded-md bg-nex-surface px-2 py-1 text-xs text-slate-600">
                          {model.label}
                          <button
                            type="button"
                            onClick={() => removeModel(provider, model.id)}
                            aria-label={`Remove ${model.label}`}
                            className="text-slate-400 hover:text-rose-600"
                          >
                            x
                          </button>
                        </span>
                      ))}
                    </div>
                    <div className="mt-2 flex gap-2">
                      <input
                        value={newModelInputs[provider]}
                        onChange={(event) => setNewModelInputs((prev) => ({ ...prev, [provider]: event.target.value }))}
                        onKeyDown={(event) => {
                          if (event.key === 'Enter') addModel(provider);
                        }}
                        placeholder="model-id"
                        spellCheck={false}
                        className="h-8 min-w-0 flex-1 rounded-md border border-nex-border px-2 text-xs text-slate-700 outline-none focus:border-nex-accent"
                      />
                      <button
                        type="button"
                        onClick={() => addModel(provider)}
                        className="rounded-md border border-nex-border px-3 text-xs font-medium text-slate-600 hover:bg-nex-surface hover:text-nex-ink"
                      >
                        Add
                      </button>
                    </div>
                  </div>
                </section>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
