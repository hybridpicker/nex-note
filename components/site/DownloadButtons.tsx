'use client';

import { useEffect, useState } from 'react';
import type { DownloadCopy } from '@/lib/site/landing-copy';
import { detectDownloadOs, readOsSignals, type DownloadOs } from '@/lib/site/os-detection';
import type { ReleaseLinks } from '@/lib/site/release-links';

type Props = {
  copy: DownloadCopy;
  links: ReleaseLinks;
  browserPreviewHref: string;
  /** Test hook; in the browser the OS is detected after hydration. */
  initialOs?: DownloadOs | 'unknown';
};

const focusRing =
  'focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#4f46ff] dark:focus-visible:outline-[#a5a1ff]';

function PrimaryButton({ href, label, detail, testId }: { href: string; label: string; detail: string; testId: string }) {
  return (
    <a
      href={href}
      data-testid={testId}
      className={`group flex min-w-[16rem] flex-col rounded-xl bg-[#4f46ff] px-6 py-4 text-white shadow-[0_18px_50px_-24px_rgba(79,70,255,0.9)] transition hover:bg-[#3f38e8] ${focusRing}`}
    >
      <span className="flex items-center gap-2 text-lg font-semibold">
        <svg aria-hidden="true" viewBox="0 0 20 20" className="h-5 w-5" fill="currentColor">
          <path d="M10 2a1 1 0 0 1 1 1v8.59l2.3-2.3a1 1 0 1 1 1.4 1.42l-4 4a1 1 0 0 1-1.4 0l-4-4a1 1 0 1 1 1.4-1.42L9 11.6V3a1 1 0 0 1 1-1ZM4 16a1 1 0 0 1 1-1h10a1 1 0 1 1 0 2H5a1 1 0 0 1-1-1Z" />
        </svg>
        {label}
      </span>
      <span className="mt-1 text-sm text-white/85">{detail}</span>
    </a>
  );
}

export default function DownloadButtons({ copy, links, browserPreviewHref, initialOs = 'unknown' }: Props) {
  const [os, setOs] = useState<DownloadOs | 'unknown'>(initialOs);

  useEffect(() => {
    if (initialOs !== 'unknown') return;
    setOs(detectDownloadOs(readOsSignals(typeof navigator === 'undefined' ? undefined : navigator)));
  }, [initialOs]);

  const showMac = os !== 'linux';
  const showLinux = os !== 'mac';

  return (
    <div data-testid="download-buttons" data-os={os}>
      <div className="flex flex-wrap gap-3">
        {showMac ? (
          <PrimaryButton href={links.macDmgUrl} label={copy.macLabel} detail={copy.macDetail} testId="download-mac" />
        ) : null}
        {showLinux ? (
          <PrimaryButton href={links.linuxAppImageUrl} label={copy.linuxLabel} detail={copy.linuxDetail} testId="download-linux" />
        ) : null}
      </div>

      {showLinux ? (
        <p className="mt-3 text-sm text-[#4b5563] dark:text-[#a7b0be]">
          {copy.omarchyHint}{' '}
          <code className="rounded bg-[#ecebff] px-1.5 py-0.5 font-mono text-[0.85em] text-[#302b8f] dark:bg-[#1e1b4b] dark:text-[#c7c4ff]">
            {links.omarchyInstallCommand}
          </code>
        </p>
      ) : null}
      {os === 'other' ? (
        <p className="mt-3 text-sm text-[#4b5563] dark:text-[#a7b0be]">{copy.otherOsNote}</p>
      ) : null}

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
        <span className="font-normal text-[#4b5563] dark:text-[#a7b0be]">
          {copy.versionLabel} {links.version}
        </span>
      </div>
    </div>
  );
}
