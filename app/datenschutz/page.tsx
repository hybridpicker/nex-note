import type { Metadata } from "next";
import { PrivacyView } from "@/components/site/LegalViews";
import { PRIVACY_COPY } from "@/lib/site/legal-copy";
import { readPageLocale, siteAlternates, type SiteSearchParams } from "@/lib/site/page-locale";

type PageProps = { searchParams?: Promise<SiteSearchParams> };

export async function generateMetadata({ searchParams }: PageProps): Promise<Metadata> {
  const copy = PRIVACY_COPY[await readPageLocale(searchParams)];
  return { title: copy.metaTitle, alternates: siteAlternates("/datenschutz") };
}

export default async function DatenschutzPage({ searchParams }: PageProps) {
  return <PrivacyView locale={await readPageLocale(searchParams)} />;
}
