// Decides whether the Browser Preview banner appears in /nex-note-app.
// Shown only on public web hosts: never on localhost, in the desktop or native
// shells, or when the editor is embedded in another page.

const LOCAL_HOSTNAMES = new Set(['localhost', '127.0.0.1', '::1', '[::1]']);
const NATIVE_USER_AGENT = /\bNexNoteNative\/\d+(?:\.\d+){1,3}\b/;
const EMBED_PARAMS = ['embed', 'nexNoteEmbed', 'jarvisEmbed', 'entry', 'entryId', 'scoreDataUrl', 'dataUrl', 'endpoint'];

export const BROWSER_PREVIEW_BANNER_STORAGE_KEY = 'nex-note:browser-preview-banner-dismissed';

export type BannerEnvironment = {
  hostname: string;
  userAgent?: string;
  search?: string;
  isNativeShell?: boolean;
  isElectron?: boolean;
  inIframe?: boolean;
};

export function isLocalHostname(hostname: string) {
  const normalized = hostname.trim().toLowerCase();
  return LOCAL_HOSTNAMES.has(normalized) || normalized.endsWith('.localhost');
}

export function shouldShowBrowserPreviewBanner(env: BannerEnvironment) {
  if (!env.hostname || isLocalHostname(env.hostname)) return false;
  if (env.isNativeShell || env.isElectron || env.inIframe) return false;
  if (NATIVE_USER_AGENT.test(env.userAgent ?? '')) return false;
  const params = new URLSearchParams(env.search ?? '');
  if (EMBED_PARAMS.some((name) => params.has(name))) return false;
  return true;
}

export const BROWSER_PREVIEW_BANNER_COPY = {
  en: {
    text: 'Browser Preview — your files stay in this browser. Get the desktop app for the full experience.',
    link: 'Download the app',
    dismiss: 'Dismiss',
  },
  de: {
    text: 'Browser Preview — deine Dateien bleiben in diesem Browser. Hol dir die Desktop-App für den vollen Funktionsumfang.',
    link: 'App laden',
    dismiss: 'Schließen',
  },
} as const;
