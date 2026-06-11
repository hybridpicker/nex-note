'use client';

import UploadZone from '@/components/UploadZone';
import RecentFiles from '@/components/RecentFiles';
import ScoreLibrary from '@/components/ScoreLibrary';
import NexNoteBrand from '@/components/NexNoteBrand';
import type { LibraryScore } from '@/lib/score-library';
import { useI18n } from '@/lib/i18n';

type WelcomeScreenProps = {
  onCreateBlankScore: () => void;
  onChooseTemplate: () => void;
  onOpenFile: () => void;
  onFileSelected: (file: File) => Promise<void> | void;
  onFilesSelected?: (files: File[]) => Promise<void> | void;
  onOpenLibraryScore: (score: LibraryScore) => Promise<void> | void;
  importStatus?: string;
};

export default function WelcomeScreen({
  onCreateBlankScore,
  onChooseTemplate,
  onOpenFile,
  onFileSelected,
  onFilesSelected,
  onOpenLibraryScore,
  importStatus,
}: WelcomeScreenProps) {
  const { t } = useI18n();

  return (
    <div className="flex-1 overflow-auto bg-[linear-gradient(180deg,#f8fafc_0%,#f3f5f9_48%,#f7f8fa_100%)]" data-testid="welcome-screen">
      <div className="mx-auto grid min-h-full w-full max-w-[1480px] gap-6 px-5 py-6 lg:grid-cols-[minmax(0,1fr)_minmax(360px,420px)] xl:px-8">
        <main className="flex min-h-[620px] flex-col justify-center">
          <section className="rounded-lg border border-slate-200/80 bg-white p-7 shadow-[0_24px_72px_-56px_rgba(15,23,42,0.72)] sm:p-9 lg:p-10">
            <div className="max-w-3xl">
              <NexNoteBrand className="h-[30px]" />
              <h1 className="mt-14 max-w-xl text-4xl font-semibold leading-tight text-nex-ink sm:text-5xl">
                {t('welcome.title')}
              </h1>
              <p className="mt-4 max-w-md text-[0.96rem] leading-7 text-slate-600">
                {t('welcome.subtitle')}
              </p>

              <div className="mt-9 grid gap-3 sm:grid-cols-3">
                <button
                  onClick={onCreateBlankScore}
                  aria-label={t('command.newScore.title')}
                  className="group flex min-h-[6.75rem] flex-col justify-between rounded-lg bg-nex-ink px-4 py-4 text-left text-sm font-semibold text-white shadow-[0_16px_38px_-26px_rgba(15,23,42,0.88)] transition-all duration-200 hover:-translate-y-0.5 hover:bg-slate-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-nex-accent/35"
                >
                  <span className="flex h-8 w-8 items-center justify-center rounded-md bg-white/12 text-lg transition-colors group-hover:bg-white/18">+</span>
                  <span>{t('welcome.newScore')}</span>
                </button>
                <button
                  onClick={onChooseTemplate}
                  className="group flex min-h-[6.75rem] flex-col justify-between rounded-lg border border-slate-200 bg-white px-4 py-4 text-left text-sm font-semibold text-slate-800 transition-all duration-200 hover:-translate-y-0.5 hover:border-slate-300 hover:bg-slate-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-nex-accent/25"
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
                  className="group flex min-h-[6.75rem] flex-col justify-between rounded-lg border border-slate-200 bg-white px-4 py-4 text-left text-sm font-semibold text-slate-800 transition-all duration-200 hover:-translate-y-0.5 hover:border-slate-300 hover:bg-slate-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-nex-accent/25"
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

          <div className="mt-4 grid gap-4 xl:grid-cols-[minmax(0,1fr)_minmax(300px,0.72fr)]">
            <UploadZone onFileSelected={onFileSelected} onFilesSelected={onFilesSelected} loadingMessage={importStatus} />
            <div className="rounded-lg border border-slate-200 bg-white/86 p-4 shadow-[0_18px_48px_-42px_rgba(15,23,42,0.45)]">
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
          </div>
        </main>

        <aside className="min-h-0 border-t border-slate-200 pt-6 lg:sticky lg:top-6 lg:max-h-[calc(100vh-3rem)] lg:overflow-auto lg:border-l lg:border-t-0 lg:pl-6 lg:pt-0">
          <ScoreLibrary onOpenScore={onOpenLibraryScore} />
        </aside>
      </div>
    </div>
  );
}
