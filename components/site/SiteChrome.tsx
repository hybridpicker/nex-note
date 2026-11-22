import type { ReactNode } from 'react';
import { LANDING_COPY } from '@/lib/site/landing-copy';
import { SITE_LOCALES, siteHref, type SiteLocale } from '@/lib/site/locale';
import {
  CHANGELOG_URL,
  GITHUB_REPO_URL,
  NEW_ISSUE_URL,
  RELEASE_VERSION,
} from '@/lib/site/release-links';

export const focusRing =
  'focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#4f46ff] dark:focus-visible:outline-[#a5a1ff]';

export const siteText = {
  page: 'bg-[#f7f8fa] text-[#0b0f14] dark:bg-[#0b0f14] dark:text-[#eef1f6]',
  muted: 'text-[#4b5563] dark:text-[#a7b0be]',
  surface: 'bg-white dark:bg-[#121821]',
  border: 'border-[#e2e6ee] dark:border-[#242c38]',
  accent: 'text-[#4338ca] dark:text-[#a5a1ff]',
  link: 'underline decoration-[#4f46ff]/40 underline-offset-4 hover:decoration-[#4f46ff] dark:decoration-[#a5a1ff]/50 dark:hover:decoration-[#a5a1ff]',
};

const LOCALE_LABELS: Record<SiteLocale, { short: string; name: string }> = {
  en: { short: 'EN', name: 'English' },
  de: { short: 'DE', name: 'Deutsch' },
};

export function Eyebrow({ children }: { children: ReactNode }) {
  return (
    <p className={`text-xs font-semibold uppercase tracking-[0.16em] ${siteText.accent}`}>{children}</p>
  );
}

export function LanguageSwitcher({ locale, path, hash }: { locale: SiteLocale; path: string; hash?: string }) {
  const label = LANDING_COPY[locale].languageSwitchLabel;
  return (
    <nav aria-label={label} className={`flex rounded-md border ${siteText.border} p-0.5 text-xs font-semibold`}>
      {SITE_LOCALES.map((entry) => {
        const active = entry === locale;
        return (
          <a
            key={entry}
            href={siteHref(path, entry, hash)}
            hrefLang={entry}
            lang={entry}
            aria-current={active ? 'true' : undefined}
            title={LOCALE_LABELS[entry].name}
            className={`rounded px-2 py-1 ${focusRing} ${
              active
                ? 'bg-[#4f46ff] text-white'
                : `${siteText.muted} hover:text-[#0b0f14] dark:hover:text-white`
            }`}
          >
            <span aria-hidden="true">{LOCALE_LABELS[entry].short}</span>
            <span className="sr-only">{LOCALE_LABELS[entry].name}</span>
          </a>
        );
      })}
    </nav>
  );
}

export function SiteLogo({ locale }: { locale: SiteLocale }) {
  return (
    <a href={siteHref('/', locale)} className={`flex items-center gap-2.5 rounded-md ${focusRing}`}>
      <img
        src="/brand/nex-note-app-icon.svg"
        alt=""
        width={32}
        height={32}
        className="h-8 w-8 rounded-lg shadow-sm ring-1 ring-black/5 dark:ring-white/10"
      />
      <span className="text-lg font-semibold tracking-tight">Nex Note</span>
    </a>
  );
}

export function SkipLink({ locale }: { locale: SiteLocale }) {
  return (
    <a
      href="#content"
      className={`sr-only focus:not-sr-only focus:absolute focus:left-4 focus:top-4 focus:z-50 focus:rounded-md focus:bg-white focus:px-3 focus:py-2 focus:text-sm focus:font-semibold focus:text-[#0b0f14] ${focusRing}`}
    >
      {LANDING_COPY[locale].skipToContent}
    </a>
  );
}

export function SiteHeader({
  locale,
  path,
  children,
}: {
  locale: SiteLocale;
  path: string;
  children?: ReactNode;
}) {
  return (
    <header className={`border-b ${siteText.border}`}>
      <div className="mx-auto flex max-w-6xl items-center justify-between gap-4 px-4 py-4 sm:px-8 lg:px-10">
        <SiteLogo locale={locale} />
        <div className="flex items-center gap-4 sm:gap-6">
          {children}
          <LanguageSwitcher locale={locale} path={path} />
        </div>
      </div>
    </header>
  );
}

export function SiteFooter({ locale }: { locale: SiteLocale }) {
  const copy = LANDING_COPY[locale].footer;
  const linkClass = `rounded ${siteText.muted} hover:text-[#0b0f14] dark:hover:text-white ${focusRing}`;
  return (
    <footer className={`border-t ${siteText.border} ${siteText.surface}`}>
      <div className="mx-auto grid max-w-6xl gap-8 px-4 py-10 sm:px-8 md:grid-cols-[1fr_auto] lg:px-10">
        <div>
          <SiteLogo locale={locale} />
          <p className={`mt-3 text-sm ${siteText.muted}`}>{copy.tagline}</p>
          <p className={`mt-1 text-xs ${siteText.muted}`}>
            Public Beta {RELEASE_VERSION} · {copy.licenseNote}
          </p>
        </div>
        <nav aria-label="Footer">
          <ul className="grid gap-x-8 gap-y-2 text-sm sm:grid-cols-2">
            <li><a className={linkClass} href={CHANGELOG_URL}>{copy.changelog}</a></li>
            <li><a className={linkClass} href={GITHUB_REPO_URL}>{copy.openSource}</a></li>
            <li><a className={linkClass} href={NEW_ISSUE_URL}>{copy.reportBug}</a></li>
            <li><a className={linkClass} href={siteHref('/impressum', locale)}>{copy.impressum}</a></li>
            <li><a className={linkClass} href={siteHref('/datenschutz', locale)}>{copy.privacy}</a></li>
          </ul>
        </nav>
      </div>
    </footer>
  );
}
