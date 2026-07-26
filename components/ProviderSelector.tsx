'use client';

import { useEffect, useState, useRef } from 'react';
import { OLLAMA_MODELS, type ProviderName } from '@/lib/ai-provider-config';
import { useI18n } from '@/lib/i18n';

interface OllamaModel { id: string; label: string }

interface Props {
  provider: ProviderName | 'benchmark';
  ollamaModel: string;
  onProviderChange: (p: ProviderName | 'benchmark') => void;
  onModelChange: (m: string) => void;
  providerOptions?: Array<ProviderName | 'benchmark'>;
  ollamaModels?: OllamaModel[];
  onOllamaModelsChange?: (models: OllamaModel[]) => void;
  compact?: boolean;
}

const LABELS: Record<string, string> = {
  ollama: 'Ollama',
  openai: 'OpenAI',
  claude: 'Claude',
  gemini: 'Gemini',
  benchmark: 'Benchmark',
};

const PROVIDER_COLORS: Record<string, string> = {
  ollama: 'text-nex-accent bg-nex-accent-muted',
  openai: 'text-nex-ink bg-nex-surface',
  claude: 'text-nex-ink bg-nex-surface',
  gemini: 'text-nex-ink bg-nex-surface',
  benchmark: 'text-nex-ink bg-nex-surface',
};

export default function ProviderSelector({
  provider,
  ollamaModel,
  onProviderChange,
  onModelChange,
  providerOptions,
  ollamaModels,
  onOllamaModelsChange,
  compact = false,
}: Props) {
  const { t } = useI18n();
  const [models, setModels] = useState<OllamaModel[]>(ollamaModels ?? OLLAMA_MODELS);
  const [adding, setAdding] = useState(false);
  const [customInput, setCustomInput] = useState('');
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const visibleProviders = providerOptions?.length ? providerOptions : (['openai', 'claude', 'gemini', 'ollama', 'benchmark'] as const);

  useEffect(() => {
    if (ollamaModels) return;
    fetch('/api/ollama-models')
      .then(r => r.json())
      .then(data => { if (data.models?.length > 0) setModels(data.models); })
      .catch(() => { /* keep fallback */ });
  }, [ollamaModels]);

  useEffect(() => {
    if (ollamaModels) setModels(ollamaModels);
  }, [ollamaModels]);

  useEffect(() => {
    if (adding) inputRef.current?.focus();
  }, [adding]);

  useEffect(() => {
    if (!dropdownOpen) return;
    function handleClick(e: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setDropdownOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, [dropdownOpen]);

  function addCustomModel() {
    const id = customInput.trim();
    if (!id) { setAdding(false); return; }
    if (!models.find(m => m.id === id)) {
      const nextModels = [...models, { id, label: id }];
      setModels(nextModels);
      onOllamaModelsChange?.(nextModels);
    }
    onModelChange(id);
    setCustomInput('');
    setAdding(false);
  }

  const showOllamaControls = provider === 'ollama';

  // ── Compact mode: badge + dropdown ─────────────────────────────────────────
  if (compact) {
    return (
      <div className="relative flex items-center gap-1.5" ref={dropdownRef}>
        <button
          onClick={() => setDropdownOpen(prev => !prev)}
          className={`flex items-center gap-1.5 px-2.5 py-1 rounded-md text-[11px] font-semibold transition-colors ${PROVIDER_COLORS[provider] ?? 'text-nex-ink bg-nex-surface'}`}
        >
          {LABELS[provider]}
          <svg className="w-3 h-3 opacity-60" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
          </svg>
        </button>

        {provider === 'ollama' && (
          <span className="text-[11px] text-slate-500 bg-nex-surface rounded px-1.5 py-0.5 max-w-[100px] truncate" title={ollamaModel}>
            {ollamaModel}
          </span>
        )}

        {dropdownOpen && (
          <div className="absolute top-full mt-1 right-0 z-50 bg-white border border-nex-border rounded-xl shadow-xl p-1 min-w-[140px]">
            {visibleProviders.map(p => (
              <button
                key={p}
                onClick={() => { onProviderChange(p); setDropdownOpen(false); }}
                className={`w-full text-left px-3 py-2 rounded-lg text-sm font-medium transition-colors ${
                  provider === p
                    ? 'bg-nex-accent-muted text-nex-accent'
                    : 'text-slate-600 hover:bg-nex-surface hover:text-nex-ink'
                }`}
              >
                {LABELS[p]}
              </button>
            ))}

            {provider === 'ollama' && (
              <div className="border-t border-nex-border mt-1 pt-1">
                <select
                  value={ollamaModel}
                  onChange={(e) => onModelChange(e.target.value)}
                  className="w-full text-sm border border-nex-border rounded-lg px-2 py-1.5 bg-white text-slate-700 focus:outline-none focus:border-nex-accent transition-colors"
                >
                  {models.map(m => (
                    <option key={m.id} value={m.id}>{m.label}</option>
                  ))}
                </select>

                {adding ? (
                  <div className="flex items-center gap-1 mt-1">
                    <input
                      ref={inputRef}
                      value={customInput}
                      onChange={e => setCustomInput(e.target.value)}
                      onKeyDown={e => { if (e.key === 'Enter') addCustomModel(); if (e.key === 'Escape') setAdding(false); }}
                      placeholder="model:tag"
                      className="flex-1 text-sm border border-nex-border rounded px-2 py-1 focus:outline-none focus:border-nex-accent"
                    />
                    <button onClick={addCustomModel} className="text-xs text-slate-600 border border-nex-border px-2 py-1 rounded hover:bg-nex-surface hover:text-nex-ink">{t('provider.add')}</button>
                    <button onClick={() => setAdding(false)} className="text-xs text-slate-400 hover:text-slate-600 px-1">✕</button>
                  </div>
                ) : (
                  <button onClick={() => setAdding(true)} title={t('provider.addCustomTitle')}
                    className="mt-1 w-full text-xs text-slate-400 hover:text-slate-600 border border-nex-border rounded-lg px-2 py-1 hover:bg-nex-surface transition-colors">
                    + {t('provider.addCustom')}
                  </button>
                )}
              </div>
            )}
          </div>
        )}
      </div>
    );
  }

  // ── Full mode (welcome screen, benchmark) ────────────────────────────────────
  return (
    <div className="flex items-center gap-2">
      <div className="flex items-center bg-nex-surface rounded-lg p-0.5 gap-0.5">
        {visibleProviders.map((p) => (
          <button
            key={p}
            onClick={() => onProviderChange(p)}
            className={`px-3 py-1.5 rounded-md text-sm font-medium transition-all ${
              provider === p
                ? 'bg-white text-nex-ink shadow-sm'
                : 'text-slate-500 hover:text-nex-ink'
            }`}
          >
            {LABELS[p]}
          </button>
        ))}
      </div>

      {showOllamaControls && (
        <div className="flex items-center gap-1">
          <select
            value={ollamaModel}
            onChange={(e) => onModelChange(e.target.value)}
            className="text-sm border border-nex-border rounded-lg px-2.5 py-1.5 bg-white text-slate-700 focus:outline-none focus:border-nex-accent transition-colors"
          >
            {models.map((m) => (
              <option key={m.id} value={m.id}>{m.label}</option>
            ))}
          </select>

          {adding ? (
            <div className="flex items-center gap-1">
              <input
                ref={inputRef}
                value={customInput}
                onChange={e => setCustomInput(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter') addCustomModel(); if (e.key === 'Escape') setAdding(false); }}
                placeholder="model:tag"
                className="text-sm border border-nex-border rounded-lg px-2.5 py-1.5 w-32 focus:outline-none focus:border-nex-accent"
              />
              <button onClick={addCustomModel}
                className="text-xs text-slate-600 border border-nex-border px-2 py-1.5 rounded-lg hover:bg-nex-surface hover:text-nex-ink transition-colors">
                {t('provider.add')}
              </button>
              <button onClick={() => setAdding(false)}
                className="text-xs text-slate-400 hover:text-slate-600 px-1">
                ✕
              </button>
            </div>
          ) : (
            <button
              onClick={() => setAdding(true)}
              title={t('provider.addCustomTitle')}
              className="text-slate-400 hover:text-slate-600 border border-nex-border rounded-lg px-2 py-1.5 text-sm leading-none hover:bg-nex-surface transition-colors"
            >
              +
            </button>
          )}
        </div>
      )}
    </div>
  );
}
