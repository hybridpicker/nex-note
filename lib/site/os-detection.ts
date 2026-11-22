// Client-side OS detection for the website's download button. Runs only in the
// browser on data the browser already has; nothing is sent anywhere.

export type DownloadOs = 'mac' | 'linux' | 'other';

export type OsSignals = {
  userAgent?: string | null;
  platform?: string | null;
  /** navigator.userAgentData.platform where available (Chromium). */
  uaDataPlatform?: string | null;
  maxTouchPoints?: number | null;
};

const MOBILE_OR_UNSUPPORTED = /android|iphone|ipad|ipod|cros|windows|mobile/;

export function detectDownloadOs(signals: OsSignals): DownloadOs {
  const ua = (signals.userAgent ?? '').toLowerCase();
  const platform = (signals.platform ?? '').toLowerCase();
  const uaData = (signals.uaDataPlatform ?? '').toLowerCase();
  const touch = signals.maxTouchPoints ?? 0;

  if (uaData) {
    if (uaData === 'macos') return touch > 1 ? 'other' : 'mac';
    if (uaData === 'linux') return MOBILE_OR_UNSUPPORTED.test(ua) ? 'other' : 'linux';
    return 'other';
  }

  if (MOBILE_OR_UNSUPPORTED.test(ua)) return 'other';

  if (/macintosh|mac os x/.test(ua) || platform.startsWith('mac')) {
    // iPadOS reports a desktop Mac user agent but has a touch screen.
    return touch > 1 ? 'other' : 'mac';
  }

  if (/linux|x11/.test(ua) || platform.includes('linux')) return 'linux';

  return 'other';
}

type NavigatorLike = {
  userAgent?: string;
  platform?: string;
  maxTouchPoints?: number;
  userAgentData?: { platform?: string };
};

export function readOsSignals(nav: NavigatorLike | undefined): OsSignals {
  if (!nav) return {};
  return {
    userAgent: nav.userAgent,
    platform: nav.platform,
    uaDataPlatform: nav.userAgentData?.platform,
    maxTouchPoints: nav.maxTouchPoints,
  };
}
