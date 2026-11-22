# Public website

The public website at nex-note.com is part of the Next.js app. It offers the
Public Beta downloads, links to the Browser Preview, and carries the legal pages.

## Routes

| Route | Purpose | Notes |
| --- | --- | --- |
| `/` | Landing page | On localhost (developer server, desktop shell) it redirects to `/nex-note-app`, as before. |
| `/impressum` | Impressum / Legal notice | Renders on every host. |
| `/datenschutz` | Datenschutzerklärung / Privacy policy | Renders on every host. |
| `/nex-note-app` | Browser Preview | Shows a dismissible banner on public hosts only. |

## Structure

- `app/page.tsx`, `app/impressum/page.tsx`, `app/datenschutz/page.tsx`: thin
  server routes. They resolve the locale, set metadata (title, description,
  `hreflang` alternates) and render a view.
- `components/site/LandingView.tsx`: landing sections in order: hero with
  download, screenshots, features, formats, privacy / Bring your own AI,
  who it is for, FAQ, footer.
- `components/site/LegalViews.tsx`: Impressum and privacy policy views.
- `components/site/SiteChrome.tsx`: header, language switcher, footer, shared
  colour and focus classes (light and dark follow the system setting).
- `components/site/DownloadButtons.tsx`: the only client component on the
  landing page. The server renders both downloads; after hydration it reads
  `navigator` (`lib/site/os-detection.ts`) and narrows to the Release DMG on
  macOS or the AppImage plus Omarchy Package hint on Linux. Other systems keep
  both buttons and a short note that Windows is not available. The detection
  runs in the browser only and sends nothing.
- `components/site/BrowserPreviewBanner.tsx` with the decision logic in
  `lib/site/browser-preview-banner.ts`: hidden on localhost, in the Electron
  and native shells (`nex-note-native` class, `NexNoteNative/<version>` user
  agent), in iframes and in embed URLs. Dismissal is remembered in
  `localStorage` (`nex-note:browser-preview-banner-dismissed`).

The pages load no external fonts, scripts, analytics or cookies. Screenshots
live in `public/screenshots/` and are copies of `docs/screenshots/`, which are
generated from the synthetic `e2e/fixtures/readme-*.musicxml` scores.

## Languages

English (default) and German. The website uses the editor's mechanism, the
`?locale=` query parameter, through its own small module `lib/site/locale.ts`
(the editor's `lib/i18n.tsx` is a client module and covers five languages):

1. `?locale=en` or `?locale=de` wins.
2. Otherwise the first English or German entry in `Accept-Language`.
3. Otherwise English.

The language switcher and all internal links always carry `?locale=`, so a
chosen language sticks. The "Try in browser" link passes the same locale to
`/nex-note-app`. The root layout keeps `<html lang="en">`; each page sets
`lang` on its wrapper element.

## Where the copy lives

- Landing page: `lib/site/landing-copy.ts`. The `LandingCopy` type forces
  both languages to be complete.
- Legal pages: `lib/site/legal-copy.ts` (German is the primary legal text).
- Contact e-mail for both legal pages: `lib/site/legal-contact.ts`.
- Browser Preview banner: `lib/site/browser-preview-banner.ts`.

Use the terms from `GLOSSARY.md` (Public Beta, Release DMG, Linux Release,
Omarchy Package, Browser Preview, Session Key, Update Check).

## Release links

`lib/site/release-links.ts` is the single place for the version and the
download URLs. The version is read from `package.json` at build time, so a
Release only needs the usual version bump. The URLs use GitHub's
`releases/latest/download/<asset>` redirects and only change if the asset
names change (`Nex-Note-mac-universal.dmg`, `Nex-Note-linux-x86_64.AppImage`).

## Open items before launch

- `SERVER_LOG_RETENTION` in `lib/site/legal-copy.ts` says 30 days, matching
  `/etc/logrotate.d/nginx` on the web host (`daily`, `rotate 30`; checked
  2026-11-22). Change both together.
- `LEGAL_CONTACT_EMAIL` in `lib/site/legal-contact.ts` is empty. While it is
  empty, the Impressum and privacy policy show a visible red placeholder.

## Tests

```sh
npx tsx --test test/site-release-links.test.ts test/site-os-detection.test.ts test/site-pages.test.ts
```
