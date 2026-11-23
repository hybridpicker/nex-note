// Locale handling for the public website (landing, Impressum, Datenschutz).
// Same mechanism as the editor: an explicit `?locale=` query parameter wins.
// Without it, the first English or German entry in Accept-Language decides,
// falling back to English.

export const SITE_LOCALES = ['en', 'de'] as const;
export type SiteLocale = typeof SITE_LOCALES[number];
export const DEFAULT_SITE_LOCALE: SiteLocale = 'en';

/**
 * Short language paths (`/de`, `/en`) for people who type or share them. The
 * site itself keeps `?locale=`; these are temporary redirects so a real `/de`
 * route could replace them later.
 */
export function siteLocalePathRedirects() {
  return SITE_LOCALES.map((locale) => ({
    source: `/${locale}`,
    destination: `/?locale=${locale}`,
    permanent: false,
  }));
}

export function normalizeSiteLocale(value: string | null | undefined): SiteLocale | null {
  if (!value) return null;
  const base = value.trim().toLowerCase().replace('_', '-').split('-')[0];
  return (SITE_LOCALES as readonly string[]).includes(base) ? (base as SiteLocale) : null;
}

export function parseAcceptLanguage(header: string | null | undefined): string[] {
  if (!header) return [];
  return header
    .split(',')
    .map((part, index) => {
      const [tag, ...params] = part.trim().split(';');
      const qParam = params.map((p) => p.trim()).find((p) => p.startsWith('q='));
      const q = qParam ? Number.parseFloat(qParam.slice(2)) : 1;
      return { tag: tag.trim(), q: Number.isFinite(q) ? q : 0, index };
    })
    .filter((entry) => entry.tag && entry.tag !== '*' && entry.q > 0)
    .sort((a, b) => b.q - a.q || a.index - b.index)
    .map((entry) => entry.tag);
}

type QueryValue = string | string[] | undefined;

export function resolveSiteLocale(query: QueryValue, acceptLanguage?: string | null): SiteLocale {
  const explicit = normalizeSiteLocale(Array.isArray(query) ? query[0] : query);
  if (explicit) return explicit;
  for (const tag of parseAcceptLanguage(acceptLanguage)) {
    const locale = normalizeSiteLocale(tag);
    if (locale) return locale;
  }
  return DEFAULT_SITE_LOCALE;
}

/** Website-internal link that keeps the chosen language. */
export function siteHref(path: string, locale: SiteLocale, hash?: string) {
  return `${path}?locale=${locale}${hash ? `#${hash}` : ''}`;
}
