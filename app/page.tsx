import type { Metadata } from "next";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import LandingView from "@/components/site/LandingView";
import { LANDING_COPY } from "@/lib/site/landing-copy";
import { readPageLocale, siteAlternates, type SiteSearchParams } from "@/lib/site/page-locale";

type PageProps = { searchParams?: Promise<SiteSearchParams> };

function isLocalAppHost(host: string) {
  const normalized = host.trim().toLowerCase();
  return normalized === "localhost"
    || normalized.startsWith("localhost:")
    || normalized === "127.0.0.1"
    || normalized.startsWith("127.0.0.1:")
    || normalized === "::1"
    || normalized === "[::1]"
    || normalized.startsWith("[::1]:");
}

function buildLocalAppHref(searchParams: SiteSearchParams) {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(searchParams)) {
    if (Array.isArray(value)) {
      value.forEach((entry) => {
        if (entry !== undefined) params.append(key, entry);
      });
    } else if (value !== undefined) {
      params.set(key, value);
    }
  }
  if (!params.has("locale")) params.set("locale", "en");
  return `/nex-note-app?${params.toString()}`;
}

export async function generateMetadata({ searchParams }: PageProps): Promise<Metadata> {
  const copy = LANDING_COPY[await readPageLocale(searchParams)];
  return {
    title: copy.metaTitle,
    description: copy.metaDescription,
    alternates: siteAlternates("/"),
  };
}

export default async function LandingPage({ searchParams }: PageProps) {
  // On localhost (developer server, desktop shell) the root opens the editor.
  const host = (await headers()).get("host") ?? "";
  if (isLocalAppHost(host)) {
    redirect(buildLocalAppHref((await searchParams) ?? {}));
  }

  return <LandingView locale={await readPageLocale(searchParams)} />;
}
