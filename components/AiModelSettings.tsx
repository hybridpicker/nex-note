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

const PROVIDER_LABELS: Record<ProviderName, string> = {
  ollama: 'Ollama',
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
}

function maskedKeyLabel(apiKey: string) {
  const trimmed = apiKey.trim();
  if (!trimmed) return 'No key saved';
  if (trimmed.length <= 8) return 'Key saved';
  return `Saved: ${trimmed.slice(0, 4)}...${trimmed.slice(-4)}`;
}

export default function AiModelSettingsPanel({
  settings,
  onSettingsChange,
  onProviderChange,
  onOllamaModelChange,
  liveOllamaModels,
  openSignal = 0,
}: Props) {
  const [open, setOpen] = useState(false);
  const [newModelInputs, setNewModelInputs] = useState<Record<ProviderName, string>>({
    ollama: '',
    claude: '',
    gemini: '',
  });
  const panelRef = useRef<HTMLDivElement>(null);

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
        onClick={() => setOpen((value) => !value)}
        title="AI model settings"
        aria-label="AI model settings"
        className="flex h-8 w-8 items-center justify-center rounded-md border border-nex-border bg-white text-slate-500 transition-colors hover:border-slate-300 hover:text-nex-ink"
      >
        <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.7} aria-hidden>
          <path strokeLinecap="round" strokeLinejoin="round" d="M10.5 6h9M10.5 12h9M10.5 18h9M4.5 6h.01M4.5 12h.01M4.5 18h.01" />
        </svg>
      </button>

      {open && (
        <div className="absolute right-0 top-full z-50 mt-2 w-[min(92vw,520px)] rounded-lg border border-nex-border bg-white p-4 shadow-xl">
          <div className="flex items-start justify-between gap-4">
            <div>
              <h2 className="text-sm font-semibold text-nex-ink">AI models</h2>
              <p className="mt-1 text-xs leading-5 text-slate-500">Configure local provider keys, defaults, and model availability.</p>
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
            {AI_PROVIDER_ORDER.map((provider) => {
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
                      <span className="mt-1 block text-[11px] font-normal text-slate-400">{maskedKeyLabel(config.apiKey)}</span>
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
