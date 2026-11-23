import type { ReactNode } from 'react';
import { SiteFooter, SiteHeader, SkipLink, focusRing, siteText } from './SiteChrome';
import {
  CONTROLLER,
  DSB_URL,
  IMPRESSUM_COPY,
  PRIVACY_COPY,
  PRIVACY_POLICY_DATE,
} from '@/lib/site/legal-copy';
import { GITHUB_REPO_URL } from '@/lib/site/release-links';
import type { SiteLocale } from '@/lib/site/locale';
import type { ReleaseAvailability } from '@/lib/site/release-availability';

function LegalShell({ locale, release, path, title, lead, children }: {
  locale: SiteLocale;
  release: ReleaseAvailability;
  path: string;
  title: string;
  lead: string;
  children: ReactNode;
}) {
  return (
    <div lang={locale} className={`flex-1 ${siteText.page}`}>
      <SkipLink locale={locale} />
      <SiteHeader locale={locale} path={path} />
      <main id="content" className="mx-auto max-w-3xl px-4 py-14 sm:px-8">
        <h1 className="text-4xl font-semibold tracking-tight">{title}</h1>
        <p className={`mt-4 text-base leading-7 ${siteText.muted}`}>{lead}</p>
        <div className="mt-10 grid gap-10 text-base leading-7">{children}</div>
      </main>
      <SiteFooter locale={locale} release={release} />
    </div>
  );
}

function EmailLink({ label }: { label: string }) {
  if (!CONTROLLER.email) {
    // Visible on purpose: the page must not go live without a contact address.
    return <span data-testid="legal-email-missing" className="font-semibold text-[#b91c1c]">[{label}: TODO]</span>;
  }
  return (
    <a href={`mailto:${CONTROLLER.email}`} className={`rounded ${siteText.link} ${focusRing}`}>
      {CONTROLLER.email}
    </a>
  );
}

function ControllerAddress({ locale, emailLabel }: { locale: SiteLocale; emailLabel: string }) {
  return (
    <address className="not-italic">
      {CONTROLLER.name}<br />
      {CONTROLLER.street}<br />
      {CONTROLLER.city}<br />
      {CONTROLLER.country[locale]}<br />
      {emailLabel}: <EmailLink label={emailLabel} />
    </address>
  );
}

export function ImpressumView({ locale, release }: { locale: SiteLocale; release: ReleaseAvailability }) {
  const copy = IMPRESSUM_COPY[locale];
  return (
    <LegalShell locale={locale} release={release} path="/impressum" title={copy.title} lead={copy.lead}>
      <section aria-labelledby="owner">
        <h2 id="owner" className="text-xl font-semibold">{copy.ownerHeading}</h2>
        <div className="mt-3">
          <ControllerAddress locale={locale} emailLabel={copy.emailLabel} />
        </div>
      </section>
      <section aria-labelledby="purpose">
        <h2 id="purpose" className="text-xl font-semibold">{copy.purposeHeading}</h2>
        <p className={`mt-3 ${siteText.muted}`}>{copy.purpose}</p>
      </section>
      <section aria-labelledby="source">
        <h2 id="source" className="text-xl font-semibold">{copy.sourceHeading}</h2>
        <p className={`mt-3 ${siteText.muted}`}>
          {copy.source}
          {release.status === 'available' ? (
            <>
              {' '}
              <a href={GITHUB_REPO_URL} className={`rounded ${siteText.link} ${focusRing}`}>GitHub</a>
            </>
          ) : null}
        </p>
      </section>
    </LegalShell>
  );
}

export function PrivacyView({ locale, release }: { locale: SiteLocale; release: ReleaseAvailability }) {
  const copy = PRIVACY_COPY[locale];
  return (
    <LegalShell locale={locale} release={release} path="/datenschutz" title={copy.title} lead={copy.lead}>
      <section aria-labelledby="controller">
        <h2 id="controller" className="text-xl font-semibold">{copy.controllerHeading}</h2>
        <div className="mt-3">
          <ControllerAddress locale={locale} emailLabel={copy.emailLabel} />
        </div>
      </section>
      {copy.sections.map((section) => (
        <section key={section.id} id={section.id} aria-labelledby={`${section.id}-title`}>
          <h2 id={`${section.id}-title`} className="text-xl font-semibold">{section.heading}</h2>
          {section.paragraphs.map((paragraph) => (
            <p key={paragraph} className={`mt-3 ${siteText.muted}`}>{paragraph}</p>
          ))}
          {section.list ? (
            <ul className={`mt-3 list-disc pl-6 ${siteText.muted}`}>
              {section.list.map((item) => <li key={item}>{item}</li>)}
            </ul>
          ) : null}
          {section.id === 'rights' ? (
            <p className={`mt-3 ${siteText.muted}`}>
              {copy.complaintPrefix}{' '}
              <a href={DSB_URL} className={`rounded ${siteText.link} ${focusRing}`}>dsb.gv.at</a>
            </p>
          ) : null}
        </section>
      ))}
      <p className={`text-sm ${siteText.muted}`}>
        {copy.asOfLabel}: {PRIVACY_POLICY_DATE[locale]}
      </p>
    </LegalShell>
  );
}
