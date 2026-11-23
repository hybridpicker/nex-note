import { unstable_cache } from 'next/cache';
import {
  DESKTOP_APP_RELEASE,
  RELEASE_CHECK_REVALIDATE_SECONDS,
  fetchLatestRelease,
  isDesktopServer,
  resolveReleaseAvailability,
  type ReleaseAvailability,
} from './release-availability';

// Cached for ten minutes per server, shared by every visitor and page. A
// failed refresh keeps the previous answer; only a server that has never had
// an answer falls back to coming soon. A new Release therefore appears on the
// website within about ten minutes, without a deploy.
const cachedLatestRelease = unstable_cache(() => fetchLatestRelease(), ['site-latest-release-v1'], {
  revalidate: RELEASE_CHECK_REVALIDATE_SECONDS,
});

export function getReleaseAvailability(): Promise<ReleaseAvailability> {
  if (isDesktopServer()) return Promise.resolve(DESKTOP_APP_RELEASE);
  return resolveReleaseAvailability(cachedLatestRelease);
}
