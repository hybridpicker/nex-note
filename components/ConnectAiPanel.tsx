'use client';

import { useMemo, useState } from 'react';
import type { ProviderName } from '@/lib/ai-provider-config';
import { SESSION_KEY_PROVIDERS } from '@/lib/ai-access-surface';
import { useI18n } from '@/lib/i18n';

export const CONNECT_AI_PROVIDER_LABELS: Record<ProviderName, string> = {
  claude: 'Anthropic (Claude)',
  openai: 'OpenAI',
  gemini: 'Gemini',
  ollama: 'Ollama',
};

/** Providers offered in the Connect AI panel: no Ollama in the Browser Preview. */
export function connectAiProviders(browserPreview: boolean): ProviderName[] {
  return browserPreview ? [...SESSION_KEY_PROVIDERS] : [...SESSION_KEY_PROVIDERS, 'ollama'];
}

interface Props {
  browserPreview: boolean;
  /** Desktop only: true when the OS keychain store answered and can encrypt. */
  canSaveKeys: boolean;
  initialProvider?: ProviderName;
  onUseSessionKey: (provider: ProviderName, key: string) => void;
  onSaveKey?: (provider: ProviderName, key: string) => Promise<{ ok: boolean; error?: string }>;
  onDismiss?: () => void;
}

/**
 * Compact "Connect AI" panel shown in the assistant when no provider is usable. A key used for
 * the session stays in memory only; "Save" (desktop) stores it in the OS keychain.
 */
export default function ConnectAiPanel({
  browserPreview,
  canSaveKeys,
  initialProvider,
  onUseSessionKey,
  onSaveKey,
  onDismiss,
}: Props) {
  const { t } = useI18n();
  const providers = useMemo(() => connectAiProviders(browserPreview), [browserPreview]);
  const [provider, setProvider] = useState<ProviderName>(
    initialProvider && providers.includes(initialProvider) ? initialProvider : providers[0],
  );
  const [key, setKey] = useState('');
  const [status, setStatus] = useState<{ tone: 'info' | 'error'; text: string } | null>(null);
  const [saving, setSaving] = useState(false);
  const label = CONNECT_AI_PROVIDER_LABELS[provider];
  const needsKey = provider !== 'ollama';
  const showSave = !browserPreview && Boolean(onSaveKey);

  function takeKey() {
    const trimmed = key.trim();
    if (!trimmed) {
      setStatus({ tone: 'error', text: t('connectAi.emptyKey') });
      return null;
    }
    return trimmed;
  }

  function handleUse() {
    if (!needsKey) {
      onUseSessionKey(provider, '');
      return;
    }
    const trimmed = takeKey();
    if (!trimmed) return;
    onUseSessionKey(provider, trimmed);
    setKey('');
    setStatus(null);
  }

  async function handleSave() {
    if (!onSaveKey) return;
    const trimmed = takeKey();
    if (!trimmed) return;
    setSaving(true);
    try {
      const result = await onSaveKey(provider, trimmed);
      if (result.ok) {
        setKey('');
        setStatus({ tone: 'info', text: t('connectAi.saved') });
      } else {
        setStatus({ tone: 'error', text: t('connectAi.saveFailed', { reason: result.error ?? '' }) });
      }
    } finally {
      setSaving(false);
    }
  }

  return (
    <section
      data-testid="connect-ai-panel"
      aria-labelledby="connect-ai-title"
      className="mb-3 rounded-lg border border-nex-border bg-white p-3 text-xs text-slate-600 shadow-sm"
    >
      <div className="flex items-start justify-between gap-2">
        <div>
          <h2 id="connect-ai-title" className="text-sm font-semibold text-nex-ink">{t('connectAi.title')}</h2>
          <p className="mt-0.5 leading-5 text-slate-500">{t('connectAi.description')}</p>
        </div>
        {onDismiss && (
          <button
            type="button"
            onClick={onDismiss}
            className="rounded-md px-2 py-1 text-[11px] text-slate-400 hover:bg-nex-surface hover:text-slate-700"
          >
            {t('connectAi.dismiss')}
          </button>
        )}
      </div>

      <div className="mt-3 grid gap-2 sm:grid-cols-[minmax(0,10rem)_minmax(0,1fr)]">
        <label className="block font-medium text-slate-500">
          {t('connectAi.provider')}
          <select
            value={provider}
            onChange={(event) => {
              setProvider(event.target.value as ProviderName);
              setStatus(null);
            }}
            className="mt-1 h-8 w-full rounded-md border border-nex-border bg-white px-2 text-xs text-slate-700 outline-none focus:border-nex-accent"
          >
            {providers.map((option) => (
              <option key={option} value={option}>{CONNECT_AI_PROVIDER_LABELS[option]}</option>
            ))}
          </select>
        </label>
        {needsKey ? (
          <label className="block font-medium text-slate-500">
            {t('connectAi.key')}
            <input
              type="password"
              value={key}
              onChange={(event) => setKey(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === 'Enter') handleUse();
              }}
              placeholder={t('connectAi.keyPlaceholder', { provider: label })}
              autoComplete="off"
              spellCheck={false}
              data-testid="connect-ai-key"
              className="mt-1 h-8 w-full rounded-md border border-nex-border px-2 text-xs text-slate-700 outline-none focus:border-nex-accent"
            />
          </label>
        ) : (
          <p className="self-end leading-5 text-slate-500">{t('connectAi.ollamaHint')}</p>
        )}
      </div>

      <div className="mt-3 flex flex-wrap gap-2">
        <button
          type="button"
          onClick={handleUse}
          data-testid="connect-ai-use-session"
          className="rounded-md bg-nex-accent px-3 py-1.5 text-xs font-semibold text-white hover:opacity-90"
        >
          {t('connectAi.useForSession')}
        </button>
        {showSave && needsKey && (
          <button
            type="button"
            onClick={() => { void handleSave(); }}
            disabled={!canSaveKeys || saving}
            title={canSaveKeys ? t('connectAi.saveTitle') : t('connectAi.keychainUnavailable')}
            data-testid="connect-ai-save"
            className="rounded-md border border-nex-border px-3 py-1.5 text-xs font-medium text-slate-600 hover:bg-nex-surface hover:text-nex-ink disabled:cursor-not-allowed disabled:opacity-50"
          >
            {saving ? t('connectAi.saving') : t('connectAi.save')}
          </button>
        )}
      </div>

      {status && (
        <p role={status.tone === 'error' ? 'alert' : 'status'} className={`mt-2 ${status.tone === 'error' ? 'text-rose-600' : 'text-emerald-700'}`}>
          {status.text}
        </p>
      )}

      <div className="mt-2 space-y-1 text-[11px] leading-4 text-slate-500">
        {browserPreview && needsKey && (
          <p data-testid="connect-ai-relay-notice">{t('connectAi.browserPreviewNotice', { provider: label })}</p>
        )}
        {needsKey && <p>{t('connectAi.sessionNotice')}</p>}
        {showSave && !canSaveKeys && needsKey && <p>{t('connectAi.keychainUnavailable')}</p>}
        <p>{t('connectAi.previewNotice')}</p>
      </div>
    </section>
  );
}
