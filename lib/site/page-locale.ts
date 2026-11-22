import { headers } from 'next/headers';
import type { Metadata } from 'next';
import { SITE_LOCALES, resolveSiteLocale, siteHref, type SiteLocale } from './locale';

export type SiteSearchParams = Record<string, string | string[] | undefined>;

/** Locale for a website page: `?locale=` first, then Accept-Language, then English. */
export async function readPageLocale(searchParams?: Promise<SiteSearchParams>): Promise<SiteLocale> {
  const params = (await searchParams) ?? {};
  const acceptLanguage = (await headers()).get('accept-language');
  return resolveSiteLocale(params.locale, acceptLanguage);
}

export function siteAlternates(path: string): Metadata['alternates'] {
  return {
    languages: Object.fromEntries(SITE_LOCALES.map((locale) => [locale, siteHref(path, locale)])),
  };
}
