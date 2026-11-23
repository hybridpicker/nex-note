import type { Metadata } from "next";
import { ImpressumView } from "@/components/site/LegalViews";
import { IMPRESSUM_COPY } from "@/lib/site/legal-copy";
import { readPageLocale, siteAlternates, type SiteSearchParams } from "@/lib/site/page-locale";
import { getReleaseAvailability } from "@/lib/site/release-availability.server";

type PageProps = { searchParams?: Promise<SiteSearchParams> };

export async function generateMetadata({ searchParams }: PageProps): Promise<Metadata> {
  const copy = IMPRESSUM_COPY[await readPageLocale(searchParams)];
  return { title: copy.metaTitle, alternates: siteAlternates("/impressum") };
}

export default async function ImpressumPage({ searchParams }: PageProps) {
  const [locale, release] = await Promise.all([readPageLocale(searchParams), getReleaseAvailability()]);
  return <ImpressumView locale={locale} release={release} />;
}
