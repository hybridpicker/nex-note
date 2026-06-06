'use client';

import { LOCALE_OPTIONS, useI18n } from '@/lib/i18n';

export default function LanguageSettings() {
  const { locale, setLocale, t, manualHref } = useI18n();

  return (
    <div className="flex items-center gap-2">
      <label className="sr-only" htmlFor="nex-note-language">{t('app.language')}</label>
      <select
        id="nex-note-language"
        aria-label={t('app.language')}
        value={locale}
        onChange={(event) => setLocale(event.target.value as typeof locale)}
        className="h-8 rounded-md border border-nex-border bg-white px-2 text-xs font-medium text-slate-600 outline-none transition-colors hover:border-slate-300 focus:border-nex-accent"
        title={t('app.settings')}
      >
        {LOCALE_OPTIONS.map((option) => (
          <option key={option.locale} value={option.locale}>{option.label}</option>
        ))}
      </select>
      <a
        href={manualHref}
        target="_blank"
        rel="noreferrer"
        className="hidden h-8 items-center rounded-md border border-nex-border bg-nex-surface px-2.5 text-xs font-medium text-slate-600 transition-colors hover:border-slate-300 hover:bg-white hover:text-nex-ink sm:flex"
        title={t('app.manual')}
      >
        {t('app.manual')}
      </a>
    </div>
  );
}
