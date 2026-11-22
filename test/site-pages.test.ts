import test from 'node:test';
import assert from 'node:assert/strict';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';

import LandingView from '../components/site/LandingView.tsx';
import DownloadButtons from '../components/site/DownloadButtons.tsx';
import { ImpressumView, PrivacyView } from '../components/site/LegalViews.tsx';
import { LANDING_COPY } from '../lib/site/landing-copy.ts';
import { SERVER_LOG_RETENTION } from '../lib/site/legal-copy.ts';
import { parseAcceptLanguage, resolveSiteLocale, siteHref } from '../lib/site/locale.ts';
import { RELEASE_DMG_URL, LINUX_APPIMAGE_URL, RELEASE_LINKS } from '../lib/site/release-links.ts';
import { shouldShowBrowserPreviewBanner } from '../lib/site/browser-preview-banner.ts';

const render = (node: React.ReactElement) => renderToStaticMarkup(node);

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

test('landing page renders headline, both downloads and the browser preview link in English', () => {
  const html = render(React.createElement(LandingView, { locale: 'en' }));
  assert.match(html, /Music notation that stays on your computer\./);
  assert.ok(html.includes(RELEASE_DMG_URL));
  assert.ok(html.includes(LINUX_APPIMAGE_URL));
  assert.ok(html.includes('href="/nex-note-app?locale=en"'));
  assert.ok(html.includes('https://github.com/hybridpicker/nex-note/releases/latest"'));
  assert.ok(html.includes('yay -S nex-note-bin'));
  assert.ok(html.includes('data-os="unknown"'));
  assert.ok(html.includes('href="/impressum?locale=en"'));
  assert.ok(html.includes('href="/datenschutz?locale=en"'));
  assert.ok(html.includes('https://github.com/hybridpicker/nex-note/issues/new/choose'));
  assert.ok(html.includes('https://github.com/hybridpicker/nex-note/blob/main/CHANGELOG.md'));
  for (const id of ['features', 'formats', 'privacy', 'faq']) assert.ok(html.includes(`id="${id}"`), id);
});

test('landing page renders in German', () => {
  const html = render(React.createElement(LandingView, { locale: 'de' }));
  assert.match(html, /Notensatz, der auf deinem Rechner bleibt\./);
  assert.ok(html.includes('Im Browser ausprobieren'));
  assert.ok(html.includes('href="/nex-note-app?locale=de"'));
  assert.ok(html.includes('lang="de"'));
});

test('landing copy drops the old founder and request wording', () => {
  for (const locale of ['en', 'de'] as const) {
    const html = render(React.createElement(LandingView, { locale }));
    assert.doesNotMatch(html, /founder|paid workflow|request build|mailto:|ipad/i);
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
  const props = { copy: LANDING_COPY.en.download, links: RELEASE_LINKS, browserPreviewHref: '/nex-note-app?locale=en' };
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

test('impressum renders the media owner disclosure in German and English', () => {
  const de = render(React.createElement(ImpressumView, { locale: 'de' }));
  assert.match(de, /<h1[^>]*>Impressum<\/h1>/);
  assert.ok(de.includes('Medieninhaber und Herausgeber'));
  assert.ok(de.includes('Jahnstraße 15a/39'));
  assert.ok(de.includes('3100 St. Pölten'));
  assert.ok(de.includes('Unternehmensgegenstand / Blattlinie'));
  assert.doesNotMatch(de, /UID|Firmenbuch|Gewerbe/);
  const en = render(React.createElement(ImpressumView, { locale: 'en' }));
  assert.match(en, /<h1[^>]*>Legal notice<\/h1>/);
});

test('privacy policy covers hosting, retention placeholder, GitHub, Session Keys and rights', () => {
  const de = render(React.createElement(PrivacyView, { locale: 'de' }));
  assert.match(de, /<h1[^>]*>Datenschutzerklärung<\/h1>/);
  for (const phrase of ['Hetzner Online GmbH', 'nginx', SERVER_LOG_RETENTION.de, 'Art. 6 Abs. 1 lit. f DSGVO', 'GitHub Inc., USA', 'Data Privacy Framework', 'Session Key', 'Anthropic, OpenAI oder Google Gemini', 'Schlüsselbund', 'https://www.dsb.gv.at']) {
    assert.ok(de.includes(phrase), phrase);
  }
  const en = render(React.createElement(PrivacyView, { locale: 'en' }));
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
