import type { Metadata } from "next";
import { ImpressumView } from "@/components/site/LegalViews";
import { IMPRESSUM_COPY } from "@/lib/site/legal-copy";
import { readPageLocale, siteAlternates, type SiteSearchParams } from "@/lib/site/page-locale";

type PageProps = { searchParams?: Promise<SiteSearchParams> };

export async function generateMetadata({ searchParams }: PageProps): Promise<Metadata> {
  const copy = IMPRESSUM_COPY[await readPageLocale(searchParams)];
  return { title: copy.metaTitle, alternates: siteAlternates("/impressum") };
}

export default async function ImpressumPage({ searchParams }: PageProps) {
  return <ImpressumView locale={await readPageLocale(searchParams)} />;
}
