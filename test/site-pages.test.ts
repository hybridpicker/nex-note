import test from 'node:test';
import assert from 'node:assert/strict';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { readFileSync } from 'node:fs';

import LandingView from '../components/site/LandingView.tsx';
import DownloadButtons from '../components/site/DownloadButtons.tsx';
import { ImpressumView, PrivacyView } from '../components/site/LegalViews.tsx';
import { LANDING_COPY } from '../lib/site/landing-copy.ts';
import { SERVER_LOG_RETENTION } from '../lib/site/legal-copy.ts';
import { parseAcceptLanguage, resolveSiteLocale, siteHref, siteLocalePathRedirects } from '../lib/site/locale.ts';
import { RELEASE_DMG_URL, LINUX_APPIMAGE_URL, RELEASE_LINKS } from '../lib/site/release-links.ts';
import { COMING_SOON, resolveReleaseAvailability, type ReleaseAvailability } from '../lib/site/release-availability.ts';
import { LEGAL_CONTACT_EMAIL } from '../lib/site/legal-contact.ts';
import { shouldShowBrowserPreviewBanner } from '../lib/site/browser-preview-banner.ts';

const render = (node: React.ReactElement) => renderToStaticMarkup(node);

const AVAILABLE: ReleaseAvailability = {
  status: 'available',
  version: '0.1.0',
  publishedAt: '2026-12-01T09:30:00Z',
  mac: true,
  linux: true,
};
const landing = (locale: 'en' | 'de', release: ReleaseAvailability) =>
  render(React.createElement(LandingView, { locale, release }));

test('site locale: explicit query wins, then Accept-Language, then English', () => {
  assert.equal(resolveSiteLocale('de', 'en-US'), 'de');
  assert.equal(resolveSiteLocale(['en'], 'de-AT'), 'en');
  assert.equal(resolveSiteLocale('fr', 'de-AT,de;q=0.9'), 'de');
  assert.equal(resolveSiteLocale(undefined, 'fr-FR,de;q=0.8,en;q=0.5'), 'de');
  assert.equal(resolveSiteLocale(undefined, 'en;q=0.4,de;q=0.9'), 'de');
  assert.equal(resolveSiteLocale(undefined, 'fr,es'), 'en');
  assert.equal(resolveSiteLocale(undefined, null), 'en');
  assert.deepEqual(parseAcceptLanguage('de;q=0, en'), ['en']);
  assert.equal(siteHref('/impressum', 'de'), '/impressum?locale=de');
});

test('with a Release the landing page offers both downloads, its version and the GitHub links', () => {
  const html = landing('en', AVAILABLE);
  assert.match(html, /Music notation that stays on your computer\./);
  assert.ok(html.includes(RELEASE_DMG_URL));
  assert.ok(html.includes(LINUX_APPIMAGE_URL));
  assert.ok(html.includes('href="/nex-note-app?locale=en"'));
  assert.ok(html.includes('https://github.com/hybridpicker/nex-note/releases/latest"'));
  assert.ok(html.includes('yay -S nex-note-bin'));
  assert.ok(html.includes('data-os="unknown"'));
  assert.ok(html.includes('Version 0.1.0 · Dec 1, 2026'));
  assert.ok(html.includes('Public Beta 0.1.0'));
  assert.ok(html.includes('href="/impressum?locale=en"'));
  assert.ok(html.includes('href="/datenschutz?locale=en"'));
  assert.ok(html.includes('https://github.com/hybridpicker/nex-note/issues/new/choose'));
  assert.ok(html.includes('https://github.com/hybridpicker/nex-note/blob/main/CHANGELOG.md'));
  assert.ok(html.includes('The source code is open under the AGPL-3.0.'));
  assert.doesNotMatch(html, /coming soon|-dev\b/);
  for (const id of ['features', 'formats', 'privacy', 'faq']) assert.ok(html.includes(`id="${id}"`), id);
});

test('without a Release the landing page says coming soon and leads to the Browser Preview', () => {
  for (const [locale, label, tryLabel] of [
    ['en', 'Public Beta – coming soon', 'Try in browser'],
    ['de', 'Public Beta – bald verfügbar', 'Im Browser ausprobieren'],
  ] as const) {
    const html = landing(locale, COMING_SOON);
    assert.ok(html.includes(label), locale);
    assert.match(html, new RegExp(`data-testid="try-in-browser-primary"[^>]*>[\\s\\S]*?${tryLabel}`), locale);
    assert.ok(html.includes(`href="/nex-note-app?locale=${locale}"`), locale);
    assert.ok(!html.includes(RELEASE_DMG_URL), locale);
    assert.ok(!html.includes(LINUX_APPIMAGE_URL), locale);
    assert.ok(!html.includes('github.com'), `${locale}: no link into the private repository`);
    assert.ok(!html.includes('yay -S nex-note-bin'), locale);
    assert.ok(!html.includes('data-testid="download-mac"'), locale);
    assert.doesNotMatch(html, /Version \d|Public Beta \d|-dev\b/, locale);
  }
  const en = landing('en', COMING_SOON);
  assert.ok(en.includes('The source code will be published under the AGPL-3.0 with the Public Beta.'));
  assert.ok(en.includes('Linux arrives with the Public Beta'));
  assert.ok(en.includes('Nex Note is heading for its Public Beta.'));
  const de = landing('de', COMING_SOON);
  assert.ok(de.includes('Der Quellcode wird mit der Public Beta unter der AGPL-3.0 veröffentlicht.'));
  assert.ok(de.includes('Linux kommt mit der Public Beta'));
});

test('a failed Release check renders the same coming-soon page', async () => {
  const release = await resolveReleaseAvailability(() => Promise.reject(new Error('GitHub API 503')));
  assert.equal(landing('en', release), landing('en', COMING_SOON));
});

test('landing page renders in German', () => {
  const html = landing('de', AVAILABLE);
  assert.match(html, /Notensatz, der auf deinem Rechner bleibt\./);
  assert.ok(html.includes('Im Browser ausprobieren'));
  assert.ok(html.includes('href="/nex-note-app?locale=de"'));
  assert.ok(html.includes('lang="de"'));
  assert.ok(html.includes('Version 0.1.0 · 1. Dez. 2026'));
});

test('landing copy drops the old founder and request wording', () => {
  for (const locale of ['en', 'de'] as const) {
    for (const release of [AVAILABLE, COMING_SOON]) {
      assert.doesNotMatch(landing(locale, release), /founder|paid workflow|request build|mailto:|ipad/i);
    }
  }
});

test('every screenshot has alt text and exists in public/screenshots', async () => {
  const { existsSync } = await import('node:fs');
  for (const locale of ['en', 'de'] as const) {
    for (const shot of LANDING_COPY[locale].screenshots.items) {
      assert.ok(shot.alt.length > 10, shot.src);
      assert.ok(existsSync(new URL(`../public${shot.src}`, import.meta.url)), shot.src);
    }
  }
});

test('download buttons narrow to the detected OS', () => {
  const props = { copy: LANDING_COPY.en.download, links: RELEASE_LINKS, release: AVAILABLE, locale: 'en' as const, browserPreviewHref: '/nex-note-app?locale=en' };
  const mac = render(React.createElement(DownloadButtons, { ...props, initialOs: 'mac' }));
  assert.ok(mac.includes(RELEASE_DMG_URL));
  assert.ok(!mac.includes(LINUX_APPIMAGE_URL));
  const linux = render(React.createElement(DownloadButtons, { ...props, initialOs: 'linux' }));
  assert.ok(linux.includes(LINUX_APPIMAGE_URL));
  assert.ok(!linux.includes(RELEASE_DMG_URL));
  assert.ok(linux.includes('yay -S nex-note-bin'));
  const other = render(React.createElement(DownloadButtons, { ...props, initialOs: 'other' }));
  assert.ok(other.includes(RELEASE_DMG_URL) && other.includes(LINUX_APPIMAGE_URL));
  assert.ok(other.includes('Windows is not available yet'));
});

test('download buttons offer only the attached assets', () => {
  const macOnly: ReleaseAvailability = { ...AVAILABLE, linux: false };
  const props = { copy: LANDING_COPY.en.download, links: RELEASE_LINKS, release: macOnly, locale: 'en' as const, browserPreviewHref: '/nex-note-app?locale=en' };
  const unknown = render(React.createElement(DownloadButtons, props));
  assert.ok(unknown.includes(RELEASE_DMG_URL));
  assert.ok(!unknown.includes(LINUX_APPIMAGE_URL));
  assert.ok(!unknown.includes('yay -S'));
  // A Linux visitor still gets the one download that exists rather than none.
  const linux = render(React.createElement(DownloadButtons, { ...props, initialOs: 'linux' }));
  assert.ok(linux.includes(RELEASE_DMG_URL));
  const noVersion = render(React.createElement(DownloadButtons, { ...props, release: { ...AVAILABLE, version: null, publishedAt: null } }));
  assert.ok(!noVersion.includes('Version'));
});

test('impressum renders the media owner disclosure in German and English', () => {
  const de = render(React.createElement(ImpressumView, { locale: 'de', release: AVAILABLE }));
  assert.match(de, /<h1[^>]*>Impressum<\/h1>/);
  assert.ok(de.includes('Medieninhaber und Herausgeber'));
  assert.ok(de.includes('Jahnstraße 15a/39'));
  assert.ok(de.includes('3100 St. Pölten'));
  assert.ok(de.includes('Unternehmensgegenstand / Blattlinie'));
  assert.doesNotMatch(de, /UID|Firmenbuch|Gewerbe/);
  const en = render(React.createElement(ImpressumView, { locale: 'en', release: AVAILABLE }));
  assert.match(en, /<h1[^>]*>Legal notice<\/h1>/);
  assert.ok(en.includes('https://github.com/hybridpicker/nex-note"'));
});

test('legal pages show the contact address and no placeholder', () => {
  assert.match(LEGAL_CONTACT_EMAIL, /^[^@\s]+@[^@\s]+\.[a-z]{2,}$/);
  for (const View of [ImpressumView, PrivacyView]) {
    for (const locale of ['en', 'de'] as const) {
      const html = render(React.createElement(View, { locale, release: COMING_SOON }));
      assert.ok(html.includes(`href="mailto:${LEGAL_CONTACT_EMAIL}"`), locale);
      assert.ok(!html.includes('legal-email-missing'), locale);
      assert.ok(!html.includes('TODO'), locale);
    }
  }
});

test('without a Release the legal pages link nowhere into the private repository', () => {
  for (const View of [ImpressumView, PrivacyView]) {
    for (const locale of ['en', 'de'] as const) {
      const html = render(React.createElement(View, { locale, release: COMING_SOON }));
      assert.ok(!html.includes('href="https://github.com/hybridpicker'), locale);
      assert.doesNotMatch(html, /Public Beta \d|-dev\b/, locale);
    }
  }
});

test('privacy policy covers hosting, retention placeholder, GitHub, Session Keys and rights', () => {
  const de = render(React.createElement(PrivacyView, { locale: 'de', release: AVAILABLE }));
  assert.match(de, /<h1[^>]*>Datenschutzerklärung<\/h1>/);
  for (const phrase of ['Hetzner Online GmbH', 'nginx', SERVER_LOG_RETENTION.de, 'Art. 6 Abs. 1 lit. f DSGVO', 'GitHub Inc., USA', 'Data Privacy Framework', 'Session Key', 'Anthropic, OpenAI oder Google Gemini', 'Schlüsselbund', 'https://www.dsb.gv.at']) {
    assert.ok(de.includes(phrase), phrase);
  }
  const en = render(React.createElement(PrivacyView, { locale: 'en', release: AVAILABLE }));
  assert.match(en, /<h1[^>]*>Privacy policy<\/h1>/);
  assert.ok(en.includes(SERVER_LOG_RETENTION.en));
  assert.ok(en.includes('keychain'));
});

test('browser preview banner shows only on public web hosts', () => {
  assert.equal(shouldShowBrowserPreviewBanner({ hostname: 'nex-note.com' }), true);
  assert.equal(shouldShowBrowserPreviewBanner({ hostname: 'localhost' }), false);
  assert.equal(shouldShowBrowserPreviewBanner({ hostname: '127.0.0.1' }), false);
  assert.equal(shouldShowBrowserPreviewBanner({ hostname: '[::1]' }), false);
  assert.equal(shouldShowBrowserPreviewBanner({ hostname: 'nex-note.com', isNativeShell: true }), false);
  assert.equal(shouldShowBrowserPreviewBanner({ hostname: 'nex-note.com', isElectron: true }), false);
  assert.equal(shouldShowBrowserPreviewBanner({ hostname: '192.168.1.20', userAgent: 'Mozilla/5.0 NexNoteNative/0.1.0' }), false);
  assert.equal(shouldShowBrowserPreviewBanner({ hostname: 'nex-note.com', inIframe: true }), false);
  assert.equal(shouldShowBrowserPreviewBanner({ hostname: 'nex-note.com', search: '?embed=1&entry=abc' }), false);
  assert.equal(shouldShowBrowserPreviewBanner({ hostname: 'nex-note.com', search: '?locale=de' }), true);
});

test('the website uses the app icon itself in the header and the browser', async () => {
  const html = landing('en', COMING_SOON);
  assert.ok(html.includes('src="/brand/nex-note-app-icon.png"'));
  assert.ok(!html.includes('nex-note-app-icon.svg'));
  const layout = readFileSync(new URL('../app/layout.tsx', import.meta.url), 'utf8');
  assert.ok(layout.includes('/brand/nex-note-app-icon-192.png'));
  assert.ok(layout.includes('/brand/apple-touch-icon.png'));
  assert.ok(!layout.includes('/brand/nex-note-icon.png'), 'the cropped wordmark is no browser icon');
});

test('generated web icons match assets/app-icon.png', async () => {
  const { default: sharp } = await import('sharp');
  const asset = (p: string) => new URL(`../${p}`, import.meta.url).pathname;
  const pixels = async (file: string, size: number) =>
    (await sharp(file).resize(size, size).ensureAlpha().raw().toBuffer());
  const meanDiff = (a: Buffer, b: Buffer) => a.reduce((sum, v, i) => sum + Math.abs(v - b[i]), 0) / a.length;
  const source = await pixels(asset('assets/app-icon.png'), 64);
  for (const file of ['public/brand/nex-note-app-icon.png', 'public/brand/nex-note-app-icon-192.png']) {
    assert.ok(meanDiff(source, await pixels(asset(file), 64)) < 2, file);
  }
  const touch = await sharp(asset('public/brand/apple-touch-icon.png')).metadata();
  assert.deepEqual([touch.width, touch.height, touch.hasAlpha], [180, 180, false]);
  const ico = readIcoSizes(asset('app/favicon.ico'));
  assert.deepEqual(ico, [16, 32, 48, 256]);
});

function readIcoSizes(file: string) {
  const data = readFileSync(file);
  const count = data.readUInt16LE(4);
  return Array.from({ length: count }, (_, i) => data.readUInt8(6 + 16 * i) || 256);
}

test('/de and /en lead to the landing page in that language', async () => {
  assert.deepEqual(siteLocalePathRedirects(), [
    { source: '/en', destination: '/?locale=en', permanent: false },
    { source: '/de', destination: '/?locale=de', permanent: false },
  ]);
  const { default: nextConfig } = await import('../next.config.ts');
  assert.deepEqual(await nextConfig.redirects?.(), siteLocalePathRedirects());
});
