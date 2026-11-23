// Whether a Release can be downloaded right now, read from GitHub's
// "latest release" endpoint on the server. The website shows the download
// buttons, the version and the GitHub links only while this says "available";
// otherwise it shows "Public Beta – coming soon" and leads to the Browser
// Preview. The check sends no visitor data and no token.
import type { SiteLocale } from './locale';
import { LINUX_APPIMAGE_ASSET, RELEASE_DMG_ASSET } from './release-links';

export const LATEST_RELEASE_API_URL = 'https://api.github.com/repos/hybridpicker/nex-note/releases/latest';
export const RELEASE_CHECK_TIMEOUT_MS = 3000;
export const RELEASE_CHECK_REVALIDATE_SECONDS = 600;

export type ReleaseAvailability =
  | { status: 'coming-soon' }
  | {
      status: 'available';
      /** Plain `X.Y.Z` from the Release tag, or null if the tag looks different. */
      version: string | null;
      /** ISO timestamp from GitHub, or null if missing or unreadable. */
      publishedAt: string | null;
      mac: boolean;
      linux: boolean;
    };

export const COMING_SOON: ReleaseAvailability = Object.freeze({ status: 'coming-soon' as const });

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

export function parseLatestRelease(body: unknown): ReleaseAvailability {
  if (!isRecord(body) || body.draft === true || body.prerelease === true) return COMING_SOON;

  const names = new Set(
    (Array.isArray(body.assets) ? body.assets : [])
      .map((asset) => (isRecord(asset) && typeof asset.name === 'string' ? asset.name : null))
      .filter((name): name is string => name !== null),
  );
  const mac = names.has(RELEASE_DMG_ASSET);
  const linux = names.has(LINUX_APPIMAGE_ASSET);
  if (!mac && !linux) return COMING_SOON;

  const tag = typeof body.tag_name === 'string' ? body.tag_name : '';
  const version = /^v?(\d+\.\d+\.\d+)$/.exec(tag)?.[1] ?? null;
  const published = typeof body.published_at === 'string' ? body.published_at : '';
  const publishedAt = published && !Number.isNaN(Date.parse(published)) ? published : null;

  return { status: 'available', version, publishedAt, mac, linux };
}

/**
 * One anonymous request to GitHub. "No Release yet" (404) is an answer and
 * resolves to coming soon; every other failure throws, so a cached answer
 * from an earlier successful check stays in place.
 */
export async function fetchLatestRelease(fetchImpl: typeof fetch = fetch): Promise<ReleaseAvailability> {
  const response = await fetchImpl(LATEST_RELEASE_API_URL, {
    headers: {
      Accept: 'application/vnd.github+json',
      'X-GitHub-Api-Version': '2022-11-28',
      'User-Agent': 'nex-note-website',
    },
    signal: AbortSignal.timeout(RELEASE_CHECK_TIMEOUT_MS),
    // The caller caches the parsed answer (404s included); Next's own fetch
    // cache would keep only 200 responses.
    cache: 'no-store',
  });
  if (response.status === 404) return COMING_SOON;
  if (!response.ok) throw new Error(`GitHub latest release check failed: HTTP ${response.status}`);
  let body: unknown;
  try {
    body = await response.json();
  } catch {
    throw new Error('GitHub latest release check returned no JSON');
  }
  return parseLatestRelease(body);
}

/** Never lets a failed check break the page: without an answer, coming soon. */
export async function resolveReleaseAvailability(
  load: () => Promise<ReleaseAvailability>,
): Promise<ReleaseAvailability> {
  try {
    return await load();
  } catch {
    return COMING_SOON;
  }
}

const DATE_LOCALES: Record<SiteLocale, string> = { en: 'en-US', de: 'de-AT' };

export function formatReleaseDate(iso: string, locale: SiteLocale): string {
  return new Intl.DateTimeFormat(DATE_LOCALES[locale], {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    timeZone: 'UTC',
  }).format(new Date(iso));
}
