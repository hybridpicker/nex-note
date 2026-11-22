'use client';

import { useEffect, useState } from 'react';
import { useI18n } from '@/lib/i18n';
import {
  BROWSER_PREVIEW_BANNER_COPY,
  BROWSER_PREVIEW_BANNER_STORAGE_KEY,
  shouldShowBrowserPreviewBanner,
} from '@/lib/site/browser-preview-banner';

function readDismissed() {
  try {
    return window.localStorage?.getItem(BROWSER_PREVIEW_BANNER_STORAGE_KEY) === '1';
  } catch {
    return false;
  }
}

function inIframe() {
  try {
    return window.self !== window.top;
  } catch {
    return true;
  }
}

export default function BrowserPreviewBanner() {
  const { locale } = useI18n();
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const show = shouldShowBrowserPreviewBanner({
      hostname: window.location.hostname,
      userAgent: navigator.userAgent,
      search: window.location.search,
      isNativeShell: document.documentElement.classList.contains('nex-note-native'),
      isElectron: Boolean((window as Window & { nexNoteElectron?: unknown }).nexNoteElectron),
      inIframe: inIframe(),
    });
    setVisible(show && !readDismissed());
  }, []);

  if (!visible) return null;

  const siteLocale = locale === 'de' ? 'de' : 'en';
  const copy = BROWSER_PREVIEW_BANNER_COPY[siteLocale];

  const dismiss = () => {
    setVisible(false);
    try {
      window.localStorage?.setItem(BROWSER_PREVIEW_BANNER_STORAGE_KEY, '1');
    } catch {
      // Storage can be unavailable (private mode); dismissing still works for this page view.
    }
  };

  return (
    <div
      role="status"
      data-testid="browser-preview-banner"
      className="fixed bottom-4 left-1/2 z-[60] flex w-[min(40rem,calc(100vw-2rem))] -translate-x-1/2 items-start gap-3 rounded-lg border border-[#d9dcff] bg-white/95 px-4 py-3 text-sm text-[#0b0f14] shadow-lg backdrop-blur"
    >
      <p className="flex-1 leading-5">
        {copy.text}{' '}
        <a
          href={`/?locale=${siteLocale}#download`}
          className="font-semibold text-[#4338ca] underline underline-offset-2 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#4f46ff]"
        >
          {copy.link}
        </a>
      </p>
      <button
        type="button"
        onClick={dismiss}
        aria-label={copy.dismiss}
        className="-m-1 rounded p-1 text-[#4b5563] hover:text-[#0b0f14] focus-visible:outline focus-visible:outline-2 focus-visible:outline-[#4f46ff]"
      >
        <svg aria-hidden="true" viewBox="0 0 20 20" className="h-4 w-4" fill="currentColor">
          <path d="M5.3 5.3a1 1 0 0 1 1.4 0L10 8.6l3.3-3.3a1 1 0 1 1 1.4 1.4L11.4 10l3.3 3.3a1 1 0 0 1-1.4 1.4L10 11.4l-3.3 3.3a1 1 0 0 1-1.4-1.4L8.6 10 5.3 6.7a1 1 0 0 1 0-1.4Z" />
        </svg>
      </button>
    </div>
  );
}
