import type { Metadata } from "next";
import { PrivacyView } from "@/components/site/LegalViews";
import { PRIVACY_COPY } from "@/lib/site/legal-copy";
import { readPageLocale, siteAlternates, type SiteSearchParams } from "@/lib/site/page-locale";
import { getReleaseAvailability } from "@/lib/site/release-availability.server";

type PageProps = { searchParams?: Promise<SiteSearchParams> };

export async function generateMetadata({ searchParams }: PageProps): Promise<Metadata> {
  const copy = PRIVACY_COPY[await readPageLocale(searchParams)];
  return { title: copy.metaTitle, alternates: siteAlternates("/datenschutz") };
}

export default async function DatenschutzPage({ searchParams }: PageProps) {
  const [locale, release] = await Promise.all([readPageLocale(searchParams), getReleaseAvailability()]);
  return <PrivacyView locale={locale} release={release} />;
}
