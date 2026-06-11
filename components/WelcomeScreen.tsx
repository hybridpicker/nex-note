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
    <div className="flex-1 overflow-auto bg-[linear-gradient(150deg,#f8fafc_0%,#eef2ff_52%,#f7f8fa_100%)]" data-testid="welcome-screen">
      <div className="mx-auto grid min-h-full w-full max-w-7xl gap-8 px-6 py-8 lg:grid-cols-[minmax(0,1fr)_390px] xl:px-10">
        <main className="flex min-h-[620px] flex-col justify-center">
          <section className="rounded-lg border border-white/80 bg-white/64 p-8 shadow-[0_28px_90px_-72px_rgba(15,23,42,0.82)] backdrop-blur">
            <NexNoteBrand className="mb-12 h-[38px]" />
            <div className="grid gap-10 xl:grid-cols-[minmax(300px,0.84fr)_minmax(320px,1fr)]">
              <div>
                <h1 className="max-w-xl text-5xl font-semibold leading-[1.03] tracking-tight text-nex-ink">
                  {t('welcome.title')}
                </h1>
                <p className="mt-5 max-w-md text-[0.96rem] leading-7 text-slate-600">
                  {t('welcome.subtitle')}
                </p>
              </div>

              <div className="grid content-start gap-3 sm:grid-cols-3 xl:pt-16">
                <button
                  onClick={onCreateBlankScore}
                  aria-label={t('command.newScore.title')}
                  className="min-h-28 rounded-lg bg-nex-ink px-5 py-5 text-left text-sm font-semibold text-white shadow-[0_18px_42px_-28px_rgba(15,23,42,0.9)] transition-colors hover:bg-slate-800"
                >
                  <span className="mb-5 flex h-9 w-9 items-center justify-center rounded-md bg-white/12 text-xl">+</span>
                  {t('welcome.newScore')}
                </button>
                <button
                  onClick={onChooseTemplate}
                  className="min-h-28 rounded-lg border border-slate-200 bg-white px-5 py-5 text-left text-sm font-semibold text-slate-800 transition-colors hover:border-slate-300"
                >
                  <span className="mb-5 flex h-9 w-9 items-center justify-center rounded-md bg-slate-100">
                    <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.7} aria-hidden>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M4 5h16M4 12h16M4 19h16" />
                    </svg>
                  </span>
                  {t('welcome.chooseTemplate')}
                </button>
                <button
                  onClick={onOpenFile}
                  className="min-h-28 rounded-lg border border-slate-200 bg-white px-5 py-5 text-left text-sm font-semibold text-slate-800 transition-colors hover:border-slate-300"
                >
                  <span className="mb-5 flex h-9 w-9 items-center justify-center rounded-md bg-slate-100">
                    <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.7} aria-hidden>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V7Z" />
                    </svg>
                  </span>
                  {t('welcome.openFile')}
                </button>
              </div>
            </div>
          </section>

          <div className="mt-6 grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(280px,0.7fr)]">
            <UploadZone onFileSelected={onFileSelected} onFilesSelected={onFilesSelected} loadingMessage={importStatus} />
            <div className="rounded-lg border border-slate-200 bg-white/82 p-4">
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

        <aside className="min-h-0 border-t border-slate-200 pt-6 lg:border-l lg:border-t-0 lg:pl-8 lg:pt-0">
          <ScoreLibrary onOpenScore={onOpenLibraryScore} />
        </aside>
      </div>
    </div>
  );
}
