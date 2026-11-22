import DownloadButtons from './DownloadButtons';
import { Eyebrow, SiteFooter, SiteHeader, SkipLink, focusRing, siteText } from './SiteChrome';
import { LANDING_COPY } from '@/lib/site/landing-copy';
import type { SiteLocale } from '@/lib/site/locale';
import { RELEASE_LINKS } from '@/lib/site/release-links';

export function browserPreviewHref(locale: SiteLocale) {
  return `/nex-note-app?locale=${locale}`;
}

export default function LandingView({ locale }: { locale: SiteLocale }) {
  const copy = LANDING_COPY[locale];
  const navLink = `hidden rounded text-sm font-medium md:inline ${siteText.muted} hover:text-[#0b0f14] dark:hover:text-white ${focusRing}`;
  const [leadShot, ...moreShots] = copy.screenshots.items;

  return (
    <div lang={locale} className={`flex-1 ${siteText.page}`}>
      <SkipLink locale={locale} />
      <SiteHeader locale={locale} path="/">
        <nav aria-label="Main" className="flex items-center gap-6">
          <a className={navLink} href="#features">{copy.nav.features}</a>
          <a className={navLink} href="#formats">{copy.nav.formats}</a>
          <a className={navLink} href="#privacy">{copy.nav.privacy}</a>
          <a className={navLink} href="#faq">{copy.nav.faq}</a>
        </nav>
      </SiteHeader>

      <main id="content">
        <section
          id="download"
          aria-labelledby="hero-title"
          className="relative overflow-hidden bg-[radial-gradient(ellipse_at_top_right,rgba(79,70,255,0.14),transparent_60%)] dark:bg-[radial-gradient(ellipse_at_top_right,rgba(124,58,237,0.22),transparent_60%)]"
        >
          <div className="mx-auto max-w-6xl px-4 pb-14 pt-14 sm:px-8 sm:pt-20 lg:px-10 lg:pb-20">
            <p className="inline-flex rounded-full border border-[#d9dcff] bg-white/70 px-3 py-1 text-xs font-semibold text-[#4338ca] dark:border-[#2f3650] dark:bg-white/5 dark:text-[#c7c4ff]">
              {copy.hero.badge}
            </p>
            <h1
              id="hero-title"
              className="mt-6 max-w-4xl text-4xl font-semibold leading-[1.05] tracking-tight sm:text-6xl lg:text-7xl"
            >
              {copy.hero.title}
            </h1>
            <p className={`mt-6 max-w-2xl text-lg leading-8 ${siteText.muted}`}>{copy.hero.lead}</p>
            <div className="mt-9">
              <DownloadButtons
                copy={copy.download}
                links={RELEASE_LINKS}
                browserPreviewHref={browserPreviewHref(locale)}
              />
            </div>
          </div>
        </section>

        <section aria-labelledby="screenshots-title" className="mx-auto max-w-6xl px-4 pb-16 sm:px-8 lg:px-10">
          <div className="max-w-2xl">
            <Eyebrow>{copy.screenshots.eyebrow}</Eyebrow>
            <h2 id="screenshots-title" className="mt-3 text-3xl font-semibold tracking-tight sm:text-4xl">
              {copy.screenshots.title}
            </h2>
            <p className={`mt-4 text-base leading-7 ${siteText.muted}`}>{copy.screenshots.lead}</p>
          </div>
          <figure className={`mt-8 overflow-hidden rounded-xl border ${siteText.border} ${siteText.surface} shadow-[0_30px_90px_-50px_rgba(79,70,255,0.6)]`}>
            <img src={leadShot.src} alt={leadShot.alt} width={2880} height={1800} className="block h-auto w-full" />
            <figcaption className={`border-t ${siteText.border} px-4 py-3 text-sm`}>
              <strong className="font-semibold">{leadShot.title}.</strong>{' '}
              <span className={siteText.muted}>{leadShot.text}</span>
            </figcaption>
          </figure>
          <div className="mt-6 grid gap-6 md:grid-cols-3">
            {moreShots.map((shot) => (
              <figure key={shot.src} className={`overflow-hidden rounded-xl border ${siteText.border} ${siteText.surface}`}>
                <img src={shot.src} alt={shot.alt} width={2880} height={1800} loading="lazy" className="block h-auto w-full" />
                <figcaption className="px-4 py-3 text-sm">
                  <strong className="block font-semibold">{shot.title}</strong>
                  <span className={`mt-1 block leading-6 ${siteText.muted}`}>{shot.text}</span>
                </figcaption>
              </figure>
            ))}
          </div>
        </section>

        <section id="features" aria-labelledby="features-title" className={`border-y ${siteText.border} ${siteText.surface}`}>
          <div className="mx-auto max-w-6xl px-4 py-16 sm:px-8 lg:px-10">
            <Eyebrow>{copy.features.eyebrow}</Eyebrow>
            <h2 id="features-title" className="mt-3 max-w-3xl text-3xl font-semibold tracking-tight sm:text-4xl">
              {copy.features.title}
            </h2>
            <ul className="mt-10 grid gap-x-8 gap-y-8 sm:grid-cols-2 lg:grid-cols-3">
              {copy.features.items.map((item) => (
                <li key={item.title} className={`border-t-2 border-[#4f46ff] pt-4 dark:border-[#a5a1ff]`}>
                  <h3 className="text-base font-semibold">{item.title}</h3>
                  <p className={`mt-2 text-sm leading-6 ${siteText.muted}`}>{item.text}</p>
                </li>
              ))}
            </ul>
          </div>
        </section>

        <section id="formats" aria-labelledby="formats-title" className="mx-auto max-w-6xl px-4 py-16 sm:px-8 lg:px-10">
          <div className="max-w-2xl">
            <Eyebrow>{copy.formats.eyebrow}</Eyebrow>
            <h2 id="formats-title" className="mt-3 text-3xl font-semibold tracking-tight sm:text-4xl">
              {copy.formats.title}
            </h2>
            <p className={`mt-4 text-base leading-7 ${siteText.muted}`}>{copy.formats.lead}</p>
          </div>
          <div className="mt-8 grid gap-6 md:grid-cols-2">
            <article className={`rounded-xl border ${siteText.border} ${siteText.surface} p-6`}>
              <h3 className="flex items-center gap-2 text-lg font-semibold">
                <span aria-hidden="true" className="h-2.5 w-2.5 rounded-full bg-[#10b981]" />
                {copy.formats.supportedTitle}
              </h3>
              <ul className="mt-4 grid gap-2 text-sm">
                {copy.formats.supported.map((item) => (
                  <li key={item} className="rounded-md bg-[#ecfdf5] px-3 py-2 font-medium text-[#065f46] dark:bg-[#0f2a22] dark:text-[#a7f3d0]">
                    {item}
                  </li>
                ))}
              </ul>
            </article>
            <article className={`rounded-xl border ${siteText.border} ${siteText.surface} p-6`}>
              <h3 className="flex items-center gap-2 text-lg font-semibold">
                <span aria-hidden="true" className="h-2.5 w-2.5 rounded-full bg-[#f59e0b]" />
                {copy.formats.experimentalTitle}
              </h3>
              <ul className="mt-4 grid gap-2 text-sm">
                {copy.formats.experimental.map((item) => (
                  <li key={item} className="rounded-md bg-[#fffbeb] px-3 py-2 font-medium text-[#7c4a03] dark:bg-[#2a2110] dark:text-[#fde68a]">
                    {item}
                  </li>
                ))}
              </ul>
            </article>
          </div>
        </section>

        <section
          id="privacy"
          aria-labelledby="privacy-title"
          className="border-y border-[#d9dcff] bg-[#f1f2ff] dark:border-[#262b4a] dark:bg-[#12142a]"
        >
          <div className="mx-auto grid max-w-6xl gap-10 px-4 py-16 sm:px-8 lg:grid-cols-[0.9fr_1.1fr] lg:px-10">
            <div>
              <Eyebrow>{copy.privacy.eyebrow}</Eyebrow>
              <h2 id="privacy-title" className="mt-3 text-3xl font-semibold tracking-tight sm:text-4xl">
                {copy.privacy.title}
              </h2>
              <p className={`mt-4 text-base leading-7 ${siteText.muted}`}>{copy.privacy.lead}</p>
            </div>
            <ul className="grid gap-4 sm:grid-cols-2">
              {copy.privacy.points.map((point) => (
                <li key={point.title} className="rounded-xl border border-[#d9dcff] bg-white/80 p-5 dark:border-[#2f3650] dark:bg-white/5">
                  <h3 className="text-base font-semibold">{point.title}</h3>
                  <p className={`mt-2 text-sm leading-6 ${siteText.muted}`}>{point.text}</p>
                </li>
              ))}
            </ul>
          </div>
        </section>

        <section aria-labelledby="audience-title" className="mx-auto max-w-6xl px-4 py-16 sm:px-8 lg:px-10">
          <Eyebrow>{copy.audience.eyebrow}</Eyebrow>
          <h2 id="audience-title" className="mt-3 max-w-3xl text-3xl font-semibold tracking-tight sm:text-4xl">
            {copy.audience.title}
          </h2>
          <ul className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {copy.audience.items.map((item) => (
              <li key={item.title} className={`rounded-xl border ${siteText.border} ${siteText.surface} p-5`}>
                <h3 className="text-base font-semibold">{item.title}</h3>
                <p className={`mt-2 text-sm leading-6 ${siteText.muted}`}>{item.text}</p>
              </li>
            ))}
          </ul>
        </section>

        <section id="faq" aria-labelledby="faq-title" className={`border-t ${siteText.border} ${siteText.surface}`}>
          <div className="mx-auto max-w-3xl px-4 py-16 sm:px-8">
            <Eyebrow>{copy.faq.eyebrow}</Eyebrow>
            <h2 id="faq-title" className="mt-3 text-3xl font-semibold tracking-tight sm:text-4xl">
              {copy.faq.title}
            </h2>
            <div className={`mt-8 divide-y ${siteText.border} border-y ${siteText.border} dark:divide-[#242c38]`}>
              {copy.faq.items.map((item) => (
                <details key={item.q} className="group py-4">
                  <summary
                    className={`flex cursor-pointer list-none items-center justify-between gap-4 rounded text-base font-semibold ${focusRing}`}
                  >
                    <h3>{item.q}</h3>
                    <span aria-hidden="true" className={`text-xl leading-none transition group-open:rotate-45 ${siteText.accent}`}>+</span>
                  </summary>
                  <p className={`mt-3 text-sm leading-6 ${siteText.muted}`}>{item.a}</p>
                </details>
              ))}
            </div>
          </div>
        </section>
      </main>

      <SiteFooter locale={locale} />
    </div>
  );
}
