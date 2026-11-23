import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import {
  ALL_RELEASES_URL,
  LINUX_APPIMAGE_URL,
  OMARCHY_INSTALL_COMMAND,
  RELEASE_DMG_URL,
} from '../lib/site/release-links.ts';
import {
  COMING_SOON,
  LATEST_RELEASE_API_URL,
  fetchLatestRelease,
  formatReleaseDate,
  parseLatestRelease,
  resolveReleaseAvailability,
} from '../lib/site/release-availability.ts';

test('download links use the stable GitHub latest-release redirects', () => {
  assert.equal(RELEASE_DMG_URL, 'https://github.com/hybridpicker/nex-note/releases/latest/download/Nex-Note-mac-universal.dmg');
  assert.equal(LINUX_APPIMAGE_URL, 'https://github.com/hybridpicker/nex-note/releases/latest/download/Nex-Note-linux-x86_64.AppImage');
  assert.equal(ALL_RELEASES_URL, 'https://github.com/hybridpicker/nex-note/releases/latest');
  // Until nex-note-bin is on the AUR, the command builds the package from the Release's PKGBUILD.
  assert.equal(OMARCHY_INSTALL_COMMAND,
    'curl -LO https://github.com/hybridpicker/nex-note/releases/latest/download/PKGBUILD && makepkg -si');
});

const releaseBody = (overrides: Record<string, unknown> = {}) => ({
  tag_name: 'v0.1.0',
  published_at: '2026-12-01T09:30:00Z',
  draft: false,
  prerelease: false,
  assets: [
    { name: 'Nex-Note-mac-universal.dmg' },
    { name: 'Nex-Note-linux-x86_64.AppImage' },
    { name: 'latest-mac.yml' },
  ],
  ...overrides,
});

test('a Release with both assets is available with its own version and date', () => {
  assert.deepEqual(parseLatestRelease(releaseBody()), {
    status: 'available',
    version: '0.1.0',
    publishedAt: '2026-12-01T09:30:00Z',
    mac: true,
    linux: true,
  });
});

test('each download is offered only when its asset is attached', () => {
  const macOnly = parseLatestRelease(releaseBody({ assets: [{ name: 'Nex-Note-mac-universal.dmg' }] }));
  assert.equal(macOnly.status, 'available');
  assert.ok(macOnly.status === 'available' && macOnly.mac && !macOnly.linux);
  assert.deepEqual(parseLatestRelease(releaseBody({ assets: [{ name: 'notes.txt' }] })), COMING_SOON);
  assert.deepEqual(parseLatestRelease(releaseBody({ assets: undefined })), COMING_SOON);
});

test('drafts, prereleases and malformed bodies count as coming soon', () => {
  assert.deepEqual(parseLatestRelease(releaseBody({ draft: true })), COMING_SOON);
  assert.deepEqual(parseLatestRelease(releaseBody({ prerelease: true })), COMING_SOON);
  assert.deepEqual(parseLatestRelease(null), COMING_SOON);
  assert.deepEqual(parseLatestRelease('nope'), COMING_SOON);
});

test('an unexpected tag or date hides the version line but keeps the downloads', () => {
  const odd = parseLatestRelease(releaseBody({ tag_name: 'beta-2', published_at: 'soon' }));
  assert.deepEqual(odd, { status: 'available', version: null, publishedAt: null, mac: true, linux: true });
  const plain = parseLatestRelease(releaseBody({ tag_name: '0.2.3' }));
  assert.ok(plain.status === 'available' && plain.version === '0.2.3');
});

type Call = { url: string; init: RequestInit };
function fakeFetch(respond: () => Response | Promise<Response>) {
  const calls: Call[] = [];
  const impl = (async (url: string | URL | Request, init?: RequestInit) => {
    calls.push({ url: String(url), init: init ?? {} });
    return respond();
  }) as typeof fetch;
  return { impl, calls };
}

test('the check asks GitHub anonymously, with a timeout and no visitor data', async () => {
  const { impl, calls } = fakeFetch(() => new Response(JSON.stringify(releaseBody()), { status: 200 }));
  const result = await fetchLatestRelease(impl);
  assert.equal(result.status, 'available');
  assert.equal(calls.length, 1);
  assert.equal(calls[0].url, LATEST_RELEASE_API_URL);
  assert.equal(LATEST_RELEASE_API_URL, 'https://api.github.com/repos/hybridpicker/nex-note/releases/latest');
  const headers = new Headers(calls[0].init.headers);
  assert.deepEqual([...headers.keys()].sort(), ['accept', 'user-agent', 'x-github-api-version']);
  assert.equal(headers.get('user-agent'), 'nex-note-website');
  assert.ok(calls[0].init.signal instanceof AbortSignal);
});

test('no Release yet (404) means coming soon', async () => {
  const { impl } = fakeFetch(() => new Response('{"message":"Not Found"}', { status: 404 }));
  assert.deepEqual(await fetchLatestRelease(impl), COMING_SOON);
});

test('API errors throw so a cached answer survives, and resolve to coming soon without one', async () => {
  for (const status of [403, 429, 500, 502]) {
    const { impl } = fakeFetch(() => new Response('', { status }));
    await assert.rejects(fetchLatestRelease(impl), String(status));
    assert.deepEqual(await resolveReleaseAvailability(() => fetchLatestRelease(impl)), COMING_SOON);
  }
  const { impl: offline } = fakeFetch(() => Promise.reject(new TypeError('fetch failed')));
  await assert.rejects(fetchLatestRelease(offline));
  assert.deepEqual(await resolveReleaseAvailability(() => fetchLatestRelease(offline)), COMING_SOON);
  const { impl: garbage } = fakeFetch(() => new Response('<html>', { status: 200 }));
  await assert.rejects(fetchLatestRelease(garbage));
});

test('release dates are written per language in UTC', () => {
  assert.equal(formatReleaseDate('2026-12-01T09:30:00Z', 'en'), 'Dec 1, 2026');
  assert.equal(formatReleaseDate('2026-12-01T09:30:00Z', 'de'), '1. Dez. 2026');
  assert.equal(formatReleaseDate('2026-12-31T23:30:00Z', 'de'), '31. Dez. 2026');
});

test('the desktop server never asks GitHub for the latest Release', async () => {
  const { DESKTOP_APP_RELEASE, isDesktopServer } = await import('../lib/site/release-availability.ts');
  assert.equal(isDesktopServer({ NEX_NOTE_DESKTOP_SERVER: '1' }), true);
  assert.equal(isDesktopServer({}), false);
  assert.equal(isDesktopServer({ NEX_NOTE_DESKTOP_SERVER: 'true' }), false);
  assert.deepEqual(DESKTOP_APP_RELEASE, { status: 'available', version: null, publishedAt: null, mac: true, linux: true });
  const main = readFileSync(new URL('../electron/main.cjs', import.meta.url), 'utf8');
  assert.match(main, /NEX_NOTE_DESKTOP_SERVER: '1'/, 'electron/main.cjs marks its packaged server');
});
