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
  openai: 'OpenAI',
  claude: 'Claude',
  gemini: 'Gemini',
};

function providerReadyLabel(provider: ProviderName, settings: AiModelSettings, ollamaConnectionState: AiConnectionState) {
  const config = settings.providers[provider];
  if (!config.enabled) return 'Off';
  if (provider === 'ollama') {
    if (config.apiKey.trim()) return 'Cloud ready';
    if (ollamaConnectionState === 'connected') return 'Local ready';
    if (ollamaConnectionState === 'checking') return 'Checking';
    return 'Setup needed';
  }
  return config.apiKey.trim() ? 'Key saved' : 'Needs key';
}

function ScoreMotif() {
  return (
    <div className="pointer-events-none relative mx-auto aspect-[4/3] w-full max-w-[500px]" aria-hidden="true">
      <div className="absolute inset-x-[8%] top-[7%] bottom-[3%] rotate-[2.5deg] rounded-[0.4rem] bg-white/45 shadow-[0_28px_80px_-24px_rgba(13,18,32,0.45)]" />
      <div className="absolute inset-x-[3%] top-[2%] bottom-[8%] -rotate-[1.5deg] overflow-hidden rounded-[0.45rem] border border-white/80 bg-[#fffefb] shadow-[0_34px_90px_-32px_rgba(13,18,32,0.5)]">
        <div className="absolute left-[9%] top-[9%] h-2 w-[38%] rounded-full bg-slate-900/85" />
        <div className="absolute left-[9%] top-[14%] h-1.5 w-[23%] rounded-full bg-slate-300" />
        {[31, 49, 67].map((top, groupIndex) => (
          <div key={top} className="absolute left-[9%] right-[8%]" style={{ top: `${top}%` }}>
            {[0, 6, 12, 18, 24].map((offset) => (
              <div key={offset} className="absolute left-0 right-0 h-px bg-slate-300" style={{ top: offset }} />
            ))}
            {[14, 31, 53, 72].map((left, noteIndex) => (
              <div key={left} className="absolute" style={{ left: `${left}%`, top: 4 + ((noteIndex + groupIndex) % 4) * 5 }}>
                <span className="block h-[9px] w-[12px] -rotate-[18deg] rounded-[50%] bg-slate-800" />
                <span className="absolute -top-6 right-0 h-7 w-px bg-slate-800" />
              </div>
            ))}
          </div>
        ))}
        <div className="absolute bottom-[6%] right-[8%] text-[9px] font-semibold uppercase tracking-[0.28em] text-nex-accent">nex-note</div>
      </div>
      <div className="absolute bottom-[4%] left-0 rounded-2xl border border-white/60 bg-white/80 px-4 py-3 shadow-xl backdrop-blur-md">
        <p className="text-[10px] font-bold uppercase tracking-[0.22em] text-nex-accent">A blank page, ready</p>
        <p className="mt-1 text-xs text-slate-500">Notation · TAB · orchestration</p>
      </div>
    </div>
  );
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
  const settings = normalizeAiModelSettings(aiModelSettings);
  const activeProvider = aiProvider === 'benchmark' ? 'ollama' : aiProvider;
  const providerConfig = settings.providers[activeProvider];

  let aiStatusTitle = t('welcome.aiCheckingTitle');
  let aiStatusDescription = t('welcome.aiCheckingDescription');
  let aiReady = false;

  if (aiSettingsHydrated) {
    if (activeProvider === 'ollama') {
      aiReady = Boolean(providerConfig.apiKey.trim()) || ollamaConnectionState === 'connected';
      aiStatusTitle = aiReady ? t('welcome.aiReadyTitle') : t('welcome.aiSetupTitle');
      aiStatusDescription = providerConfig.apiKey.trim()
        ? t('welcome.aiOllamaCloudDescription', { model: providerConfig.selectedModel || ollamaModel })
        : aiReady
          ? t('welcome.aiOllamaLocalDescription', { model: providerConfig.selectedModel || ollamaModel })
          : t('welcome.aiOllamaSetupDescription');
    } else {
      aiReady = Boolean(providerConfig.apiKey.trim());
      aiStatusTitle = aiReady ? t('welcome.aiReadyTitle') : t('welcome.aiSetupTitle');
      aiStatusDescription = aiReady
        ? t('welcome.aiCloudReadyDescription', { provider: PROVIDER_LABELS[activeProvider], model: providerConfig.selectedModel })
        : t('welcome.aiCloudSetupDescription', { provider: PROVIDER_LABELS[activeProvider] });
    }
  }

  return (
    <div className="nex-welcome-stage flex-1 overflow-auto" data-testid="welcome-screen">
      <div className="mx-auto w-full max-w-[1500px] px-5 pb-10 pt-5 sm:px-8 lg:px-10">
        <header className="flex items-center justify-between border-b border-slate-900/10 pb-5">
          <NexNoteBrand className="h-[26px]" />
          <div className="flex items-center gap-3">
            <span className="hidden text-[11px] font-bold uppercase tracking-[0.22em] text-slate-400 sm:block">Composition workspace</span>
            <button
              type="button"
              onClick={onOpenAiSettings}
              className="flex items-center gap-2 rounded-full border border-slate-900/10 bg-white/60 px-3 py-1.5 text-xs font-semibold text-slate-600 backdrop-blur transition hover:border-slate-900/20 hover:bg-white"
            >
              <span className={`h-1.5 w-1.5 rounded-full ${aiReady ? 'bg-emerald-500' : 'bg-amber-400'}`} />
              {PROVIDER_LABELS[activeProvider]}
            </button>
          </div>
        </header>

        <main>
          <section className="nex-welcome-hero grid min-h-[510px] items-center gap-10 py-10 lg:grid-cols-[minmax(0,1.02fr)_minmax(440px,0.98fr)] lg:py-14">
            <div className="max-w-[720px]">
              <p className="text-[11px] font-bold uppercase tracking-[0.28em] text-nex-accent">Your music starts here</p>
              <h1 className="mt-6 max-w-[680px] text-[clamp(3.15rem,6.2vw,6.8rem)] font-semibold leading-[0.91] tracking-[-0.065em] text-nex-ink">
                Write without <span className="text-nex-accent">friction.</span>
              </h1>
              <p className="mt-7 max-w-xl text-base leading-7 text-slate-600 sm:text-lg">
                {t('welcome.subtitle')} Shape the ensemble first—nex-note prepares the page so you can stay with the music.
              </p>

              <div className="mt-9 flex flex-col gap-3 sm:flex-row">
                <button
                  onClick={onCreateBlankScore}
                  aria-label={t('command.newScore.title')}
                  className="group flex min-h-14 items-center justify-between gap-8 rounded-2xl bg-nex-ink px-5 py-3 text-sm font-semibold text-white shadow-[0_20px_46px_-22px_rgba(11,15,20,0.72)] transition hover:-translate-y-0.5 hover:bg-nex-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-nex-accent/35"
                >
                  <span>{t('welcome.newScore')}</span>
                  <span className="text-xl font-light transition-transform group-hover:translate-x-1">→</span>
                </button>
                <button
                  onClick={onChooseTemplate}
                  className="group flex min-h-14 items-center justify-between gap-8 rounded-2xl border border-slate-900/12 bg-white/70 px-5 py-3 text-sm font-semibold text-slate-800 backdrop-blur transition hover:-translate-y-0.5 hover:border-nex-accent/30 hover:bg-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-nex-accent/25"
                >
                  <span>{t('welcome.chooseTemplate')}</span>
                  <span className="text-slate-400 transition-transform group-hover:translate-x-1 group-hover:text-nex-accent">↗</span>
                </button>
                <button
                  onClick={onOpenFile}
                  className="min-h-14 rounded-2xl px-4 py-3 text-sm font-semibold text-slate-500 transition hover:bg-white/70 hover:text-slate-900"
                >
                  {t('welcome.openFile')}
                </button>
              </div>
            </div>
            <ScoreMotif />
          </section>

          <section className="nex-welcome-cards grid gap-4 border-t border-slate-900/10 pt-6 xl:grid-cols-[minmax(0,1.2fr)_minmax(300px,0.66fr)_minmax(330px,0.82fr)]">
            <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-1">
              <UploadZone onFileSelected={onFileSelected} onFilesSelected={onFilesSelected} loadingMessage={importStatus} />
              <div className="rounded-2xl border border-slate-900/10 bg-white/65 p-4 backdrop-blur-sm">
                <RecentFiles
                  onFileSelected={onFileSelected}
                  onOpenSavedScore={onOpenLibraryScore}
                  className="mt-0"
                  emptyFallback={(
                    <div>
                      <p className="text-[11px] font-bold uppercase tracking-[0.24em] text-slate-500">{t('welcome.recent')}</p>
                      <div className="mt-3 flex items-center justify-between rounded-xl border border-dashed border-slate-300/80 px-4 py-3">
                        <div>
                          <p className="text-sm font-semibold text-slate-700">{t('welcome.noFiles')}</p>
                          <p className="mt-0.5 text-xs text-slate-500">{t('welcome.noFilesHelp')}</p>
                        </div>
                        <span className="text-xl text-slate-300">↺</span>
                      </div>
                    </div>
                  )}
                />
              </div>
            </div>

            <section className="nex-welcome-ai rounded-2xl border border-slate-900/10 bg-[#111522] p-5 text-white shadow-[0_24px_65px_-42px_rgba(11,15,20,0.9)]">
              <div className="flex items-center justify-between">
                <p className="text-[11px] font-bold uppercase tracking-[0.24em] text-white/70">{t('welcome.aiTools')}</p>
                <span className={`h-2 w-2 rounded-full ${aiReady ? 'bg-emerald-400' : 'bg-amber-300'}`} />
              </div>
              <h2 className="mt-5 text-lg font-semibold tracking-tight">{aiStatusTitle}</h2>
              <p className="mt-2 text-xs leading-5 text-white/75">{aiStatusDescription}</p>
              <div className="mt-5 space-y-2 border-t border-white/10 pt-4">
                {AI_PROVIDER_ORDER.map((providerName) => (
                  <div key={providerName} className="flex items-center justify-between text-xs">
                    <span className="text-white/75">{PROVIDER_LABELS[providerName]}</span>
                    <span className={settings.providers[providerName].enabled ? 'text-white' : 'text-white/60'}>
                      {providerReadyLabel(providerName, settings, ollamaConnectionState)}
                    </span>
                  </div>
                ))}
                <div className="flex items-center justify-between border-t border-white/10 pt-2 text-xs">
                  <span className="text-white/75">{t('welcome.aiLocalFallbacks')}</span>
                  <span className="text-nex-cyan">{t('welcome.aiAlwaysOn')}</span>
                </div>
              </div>
              <button type="button" onClick={onOpenAiSettings} className="mt-5 text-xs font-semibold text-white transition hover:text-nex-cyan">
                {t('welcome.aiSettings')} →
              </button>
            </section>

            <aside className="nex-welcome-library min-h-[250px] rounded-2xl border border-slate-900/10 bg-white/65 p-1 backdrop-blur-sm">
              <ScoreLibrary onOpenScore={onOpenLibraryScore} />
            </aside>
          </section>
        </main>
      </div>
    </div>
  );
}
