'use client';

import { LOCALE_OPTIONS, useI18n } from '@/lib/i18n';

export default function LanguageSettings() {
  const { locale, setLocale, t, manualHref } = useI18n();

  return (
    <div className="flex shrink-0 items-center gap-2">
      <label className="sr-only" htmlFor="nex-note-language">{t('app.language')}</label>
      <select
        id="nex-note-language"
        aria-label={t('app.language')}
        value={locale}
        onChange={(event) => setLocale(event.target.value as typeof locale)}
        className="nex-select text-xs font-medium text-slate-600"
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
        className="nex-chip nex-chip--link hidden whitespace-nowrap text-xs font-medium sm:inline-flex"
        title={t('app.manual')}
      >
        {t('app.manual')}
      </a>
    </div>
  );
}
