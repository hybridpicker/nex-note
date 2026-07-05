'use client';

import UploadZone from '@/components/UploadZone';
import RecentFiles from '@/components/RecentFiles';
import ScoreLibrary from '@/components/ScoreLibrary';
import NexNoteBrand from '@/components/NexNoteBrand';
import type { LibraryScore } from '@/lib/score-library';
import { useI18n } from '@/lib/i18n';
import { AI_PROVIDER_ORDER, normalizeAiModelSettings, type AiModelSettings } from '@/lib/ai-model-settings';
import type { ProviderName } from '@/lib/ai-provider-config';

export type AiConnectionState = 'checking' | 'connected' | 'offline';

type WelcomeScreenProps = {
  onCreateBlankScore: () => void;
  onChooseTemplate: () => void;
  onOpenFile: () => void;
  onFileSelected: (file: File) => Promise<void> | void;
  onFilesSelected?: (files: File[]) => Promise<void> | void;
  onOpenLibraryScore: (score: LibraryScore) => Promise<void> | void;
  importStatus?: string;
  aiModelSettings: AiModelSettings;
  aiSettingsHydrated: boolean;
  aiProvider: ProviderName | 'benchmark';
  ollamaModel: string;
  ollamaConnectionState: AiConnectionState;
  onOpenAiSettings: () => void;
};

const PROVIDER_LABELS: Record<ProviderName, string> = {
  ollama: 'Ollama',
  claude: 'Claude',
  gemini: 'Gemini',
};

function providerReadyLabel(provider: ProviderName, settings: AiModelSettings, ollamaConnectionState: AiConnectionState) {
  const config = settings.providers[provider];
  if (!config.enabled) return 'Off';
  if (provider === 'ollama') {
    if (config.apiKey.trim()) return 'Cloud key saved';
    if (ollamaConnectionState === 'connected') return 'Local ready';
    if (ollamaConnectionState === 'checking') return 'Checking';
    return 'Setup needed';
  }
  return config.apiKey.trim() ? 'Key saved' : 'Needs key';
}

export default function WelcomeScreen({
  onCreateBlankScore,
  onChooseTemplate,
  onOpenFile,
  onFileSelected,
  onFilesSelected,
  onOpenLibraryScore,
  importStatus,
  aiModelSettings,
  aiSettingsHydrated,
  aiProvider,
  ollamaModel,
  ollamaConnectionState,
  onOpenAiSettings,
}: WelcomeScreenProps) {
  const { t } = useI18n();
  const normalizedSettings = normalizeAiModelSettings(aiModelSettings);
  const activeProvider = aiProvider === 'benchmark' ? 'ollama' : aiProvider;
  const activeProviderConfig = normalizedSettings.providers[activeProvider];
  const enabledProviders = AI_PROVIDER_ORDER.filter((provider) => normalizedSettings.providers[provider].enabled);
  const cloudProvidersWithKeys = AI_PROVIDER_ORDER.filter((provider) => (
    provider !== 'ollama'
    && normalizedSettings.providers[provider].enabled
    && normalizedSettings.providers[provider].apiKey.trim()
  ));

  let aiStatusTitle = t('welcome.aiCheckingTitle');
  let aiStatusDescription = t('welcome.aiCheckingDescription');
  let aiStatusTone = 'border-slate-200 bg-white text-slate-600';

  if (aiSettingsHydrated) {
    if (activeProvider === 'ollama') {
      if (activeProviderConfig.apiKey.trim()) {
        aiStatusTitle = t('welcome.aiReadyTitle');
        aiStatusDescription = t('welcome.aiOllamaCloudDescription', { model: activeProviderConfig.selectedModel || ollamaModel });
        aiStatusTone = 'border-emerald-200 bg-emerald-50/70 text-emerald-800';
      } else if (ollamaConnectionState === 'connected') {
        aiStatusTitle = t('welcome.aiReadyTitle');
        aiStatusDescription = t('welcome.aiOllamaLocalDescription', { model: activeProviderConfig.selectedModel || ollamaModel });
        aiStatusTone = 'border-emerald-200 bg-emerald-50/70 text-emerald-800';
      } else if (ollamaConnectionState === 'checking') {
        aiStatusTitle = t('welcome.aiCheckingTitle');
        aiStatusDescription = t('welcome.aiCheckingDescription');
      } else {
        aiStatusTitle = t('welcome.aiSetupTitle');
        aiStatusDescription = t('welcome.aiOllamaSetupDescription');
        aiStatusTone = 'border-amber-200 bg-amber-50/80 text-amber-800';
      }
    } else if (activeProviderConfig.apiKey.trim()) {
      aiStatusTitle = t('welcome.aiReadyTitle');
      aiStatusDescription = t('welcome.aiCloudReadyDescription', {
        provider: PROVIDER_LABELS[activeProvider],
        model: activeProviderConfig.selectedModel,
      });
      aiStatusTone = 'border-emerald-200 bg-emerald-50/70 text-emerald-800';
    } else {
      aiStatusTitle = t('welcome.aiSetupTitle');
      aiStatusDescription = t('welcome.aiCloudSetupDescription', { provider: PROVIDER_LABELS[activeProvider] });
      aiStatusTone = 'border-amber-200 bg-amber-50/80 text-amber-800';
    }
  }

  return (
    <div className="flex-1 overflow-auto bg-slate-50" data-testid="welcome-screen">
      <div className="mx-auto grid min-h-full w-full max-w-[1480px] gap-5 px-5 py-5 lg:grid-cols-[minmax(0,1fr)_minmax(360px,420px)] xl:px-8">
        <main className="flex min-h-[620px] flex-col justify-center">
          <section className="border-b border-slate-200 pb-7">
            <div className="max-w-4xl">
              <NexNoteBrand className="h-[28px]" />
              <h1 className="mt-12 max-w-xl text-4xl font-semibold leading-tight text-nex-ink sm:text-5xl">
                {t('welcome.title')}
              </h1>
              <p className="mt-4 max-w-2xl text-[0.98rem] leading-7 text-slate-600">
                {t('welcome.subtitle')}
              </p>

              <div className="mt-8 grid gap-3 sm:grid-cols-3">
                <button
                  onClick={onCreateBlankScore}
                  aria-label={t('command.newScore.title')}
                  className="group flex min-h-[5.75rem] flex-col justify-between rounded-lg bg-nex-ink px-4 py-4 text-left text-sm font-semibold text-white shadow-[0_16px_38px_-28px_rgba(15,23,42,0.88)] transition-colors hover:bg-slate-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-nex-accent/35"
                >
                  <span className="flex h-8 w-8 items-center justify-center rounded-md bg-white/12 text-lg transition-colors group-hover:bg-white/18">+</span>
                  <span>{t('welcome.newScore')}</span>
                </button>
                <button
                  onClick={onChooseTemplate}
                  className="group flex min-h-[5.75rem] flex-col justify-between rounded-lg border border-slate-200 bg-white px-4 py-4 text-left text-sm font-semibold text-slate-800 transition-colors hover:border-slate-300 hover:bg-slate-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-nex-accent/25"
                >
                  <span className="flex h-8 w-8 items-center justify-center rounded-md bg-slate-100 text-slate-600 transition-colors group-hover:bg-white">
                    <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.7} aria-hidden>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M4 5h16M4 12h16M4 19h16" />
                    </svg>
                  </span>
                  <span>{t('welcome.chooseTemplate')}</span>
                </button>
                <button
                  onClick={onOpenFile}
                  className="group flex min-h-[5.75rem] flex-col justify-between rounded-lg border border-slate-200 bg-white px-4 py-4 text-left text-sm font-semibold text-slate-800 transition-colors hover:border-slate-300 hover:bg-slate-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-nex-accent/25"
                >
                  <span className="flex h-8 w-8 items-center justify-center rounded-md bg-slate-100 text-slate-600 transition-colors group-hover:bg-white">
                    <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.7} aria-hidden>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V7Z" />
                    </svg>
                  </span>
                  <span>{t('welcome.openFile')}</span>
                </button>
              </div>
            </div>
          </section>

          <div className="mt-5 grid gap-4 xl:grid-cols-[minmax(0,1fr)_minmax(320px,0.72fr)]">
            <UploadZone onFileSelected={onFileSelected} onFilesSelected={onFilesSelected} loadingMessage={importStatus} />
            <section className="rounded-lg border border-slate-200 bg-white p-4">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <p className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-400">{t('welcome.aiTools')}</p>
                  <h2 className="mt-2 text-sm font-semibold text-nex-ink">{aiStatusTitle}</h2>
                  <p className="mt-1 text-xs leading-5 text-slate-500">{aiStatusDescription}</p>
                </div>
                <span className={`shrink-0 rounded-full border px-2.5 py-1 text-[11px] font-semibold ${aiStatusTone}`}>
                  {PROVIDER_LABELS[activeProvider]}
                </span>
              </div>

              <div className="mt-4 grid gap-2">
                {AI_PROVIDER_ORDER.map((providerName) => (
                  <div key={providerName} className="flex items-center justify-between gap-3 rounded-md bg-slate-50 px-3 py-2">
                    <span className="text-xs font-medium text-slate-600">{PROVIDER_LABELS[providerName]}</span>
                    <span className="text-xs text-slate-500">{providerReadyLabel(providerName, normalizedSettings, ollamaConnectionState)}</span>
                  </div>
                ))}
                <div className="flex items-center justify-between gap-3 rounded-md bg-slate-50 px-3 py-2">
                  <span className="text-xs font-medium text-slate-600">{t('welcome.aiLocalFallbacks')}</span>
                  <span className="text-xs text-emerald-700">{t('welcome.aiAlwaysOn')}</span>
                </div>
              </div>

              <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
                <p className="text-xs text-slate-500">
                  {t('welcome.aiEnabledProviders', { count: enabledProviders.length, keyed: cloudProvidersWithKeys.length })}
                </p>
                <button
                  type="button"
                  onClick={onOpenAiSettings}
                  className="rounded-md border border-nex-border bg-white px-3 py-1.5 text-xs font-semibold text-slate-600 transition-colors hover:border-slate-300 hover:bg-slate-50 hover:text-nex-ink"
                >
                  {t('welcome.aiSettings')}
                </button>
              </div>
            </section>
          </div>

          <div className="mt-4 rounded-lg border border-slate-200 bg-white p-4">
            <RecentFiles
              onFileSelected={onFileSelected}
              onOpenSavedScore={onOpenLibraryScore}
              className="mt-0"
              emptyFallback={(
                <div>
                  <p className="text-xs font-semibold uppercase tracking-[0.22em] text-slate-400">{t('welcome.recent')}</p>
                  <div className="mt-4 rounded-lg border border-dashed border-slate-200 bg-slate-50/70 px-4 py-5">
                    <p className="text-sm font-medium text-slate-700">{t('welcome.noFiles')}</p>
                    <p className="mt-1 text-xs leading-5 text-slate-500">{t('welcome.noFilesHelp')}</p>
                  </div>
                </div>
              )}
            />
          </div>
        </main>

        <aside className="min-h-0 border-t border-slate-200 pt-6 lg:sticky lg:top-5 lg:max-h-[calc(100vh-2.5rem)] lg:overflow-auto lg:border-l lg:border-t-0 lg:pl-5 lg:pt-0">
          <ScoreLibrary onOpenScore={onOpenLibraryScore} />
        </aside>
      </div>
    </div>
  );
}
