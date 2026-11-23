'use client';

import { useEffect, useState } from 'react';
import type { DownloadCopy } from '@/lib/site/landing-copy';
import type { SiteLocale } from '@/lib/site/locale';
import { detectDownloadOs, readOsSignals, type DownloadOs } from '@/lib/site/os-detection';
import { formatReleaseDate, type ReleaseAvailability } from '@/lib/site/release-availability';
import type { ReleaseLinks } from '@/lib/site/release-links';

type Props = {
  copy: DownloadCopy;
  links: ReleaseLinks;
  /** Decided on the server; without a Release the Browser Preview leads. */
  release: ReleaseAvailability;
  locale: SiteLocale;
  browserPreviewHref: string;
  /** Test hook; in the browser the OS is detected after hydration. */
  initialOs?: DownloadOs | 'unknown';
};

const focusRing =
  'focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#4f46ff] dark:focus-visible:outline-[#a5a1ff]';

const downloadIcon =
  'M10 2a1 1 0 0 1 1 1v8.59l2.3-2.3a1 1 0 1 1 1.4 1.42l-4 4a1 1 0 0 1-1.4 0l-4-4a1 1 0 1 1 1.4-1.42L9 11.6V3a1 1 0 0 1 1-1ZM4 16a1 1 0 0 1 1-1h10a1 1 0 1 1 0 2H5a1 1 0 0 1-1-1Z';
const arrowIcon =
  'M11.3 4.3a1 1 0 0 1 1.4 0l5 5a1 1 0 0 1 0 1.4l-5 5a1 1 0 0 1-1.4-1.4l3.29-3.3H3a1 1 0 1 1 0-2h11.59l-3.3-3.3a1 1 0 0 1 0-1.4Z';

function PrimaryButton({ href, label, detail, testId, icon = downloadIcon }: { href: string; label: string; detail: string; testId: string; icon?: string }) {
  return (
    <a
      href={href}
      data-testid={testId}
      className={`group flex w-full flex-col sm:w-auto sm:min-w-[16rem] rounded-xl bg-[#4f46ff] px-6 py-4 text-white shadow-[0_18px_50px_-24px_rgba(79,70,255,0.9)] transition hover:bg-[#3f38e8] ${focusRing}`}
    >
      <span className="flex items-center gap-2 text-lg font-semibold">
        <svg aria-hidden="true" viewBox="0 0 20 20" className="h-5 w-5" fill="currentColor">
          <path d={icon} />
        </svg>
        {label}
      </span>
      <span className="mt-1 text-sm text-white/85">{detail}</span>
    </a>
  );
}

const mutedText = 'text-sm text-[#4b5563] dark:text-[#a7b0be]';

function ComingSoon({ copy, browserPreviewHref }: { copy: DownloadCopy; browserPreviewHref: string }) {
  return (
    <div data-testid="download-buttons" data-release="coming-soon">
      <p
        data-testid="release-coming-soon"
        className="inline-flex items-center gap-2 rounded-full border border-[#fcd9a8] bg-[#fff7ed] px-3 py-1 text-sm font-semibold text-[#9a3412] dark:border-[#5b3a1a] dark:bg-[#2a1a0c] dark:text-[#fdba74]"
      >
        <span aria-hidden="true" className="h-2 w-2 rounded-full bg-[#f97316]" />
        {copy.comingSoon}
      </p>
      <p className={`mt-3 max-w-xl ${mutedText}`}>{copy.comingSoonDetail}</p>
      <div className="mt-5 flex flex-wrap gap-3">
        <PrimaryButton
          href={browserPreviewHref}
          label={copy.tryInBrowser}
          detail={copy.tryInBrowserDetail}
          testId="try-in-browser-primary"
          icon={arrowIcon}
        />
      </div>
    </div>
  );
}

export default function DownloadButtons({ copy, links, release, locale, browserPreviewHref, initialOs = 'unknown' }: Props) {
  const [os, setOs] = useState<DownloadOs | 'unknown'>(initialOs);

  useEffect(() => {
    if (initialOs !== 'unknown') return;
    setOs(detectDownloadOs(readOsSignals(typeof navigator === 'undefined' ? undefined : navigator)));
  }, [initialOs]);

  if (release.status !== 'available') {
    return <ComingSoon copy={copy} browserPreviewHref={browserPreviewHref} />;
  }

  // Narrow to the visitor's system, but never down to nothing: if the one
  // attached asset is for the other system, it is still offered.
  const narrowedMac = release.mac && os !== 'linux';
  const narrowedLinux = release.linux && os !== 'mac';
  const nothingLeft = !narrowedMac && !narrowedLinux;
  const showMac = narrowedMac || (nothingLeft && release.mac);
  const showLinux = narrowedLinux || (nothingLeft && release.linux);
  const versionLine = release.version
    ? [release.version, release.publishedAt ? formatReleaseDate(release.publishedAt, locale) : null].filter(Boolean).join(' · ')
    : null;

  return (
    <div data-testid="download-buttons" data-release="available" data-os={os}>
      <div className="flex flex-wrap gap-3">
        {showMac ? (
          <PrimaryButton href={links.macDmgUrl} label={copy.macLabel} detail={copy.macDetail} testId="download-mac" />
        ) : null}
        {showLinux ? (
          <PrimaryButton href={links.linuxAppImageUrl} label={copy.linuxLabel} detail={copy.linuxDetail} testId="download-linux" />
        ) : null}
      </div>

      {showLinux ? (
        <p className={`mt-3 ${mutedText}`}>
          {copy.omarchyHint}{' '}
          <code className="rounded bg-[#ecebff] px-1.5 py-0.5 font-mono text-[0.85em] text-[#302b8f] dark:bg-[#1e1b4b] dark:text-[#c7c4ff]">
            {links.omarchyInstallCommand}
          </code>
        </p>
      ) : null}
      {os === 'other' ? <p className={`mt-3 ${mutedText}`}>{copy.otherOsNote}</p> : null}

      <div className="mt-6 flex flex-wrap items-center gap-x-6 gap-y-3 text-sm font-semibold">
        <a
          href={browserPreviewHref}
          className={`rounded-lg border border-[#d9dcff] bg-white/70 px-4 py-2.5 text-[#0b0f14] transition hover:border-[#4f46ff] hover:text-[#4338ca] dark:border-[#2f3650] dark:bg-white/5 dark:text-[#eef1f6] dark:hover:border-[#a5a1ff] dark:hover:text-[#c7c4ff] ${focusRing}`}
        >
          {copy.tryInBrowser}
        </a>
        <a
          href={links.allReleasesUrl}
          className={`rounded text-[#4338ca] underline decoration-[#4f46ff]/40 underline-offset-4 hover:decoration-[#4f46ff] dark:text-[#a5a1ff] ${focusRing}`}
        >
          {copy.allDownloads}
        </a>
        {versionLine ? (
          <span className="font-normal text-[#4b5563] dark:text-[#a7b0be]">
            {copy.versionLabel} {versionLine}
          </span>
        ) : null}
      </div>
    </div>
  );
}
