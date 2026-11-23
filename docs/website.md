# Public website

The public website at nex-note.com is part of the Next.js app. It offers the
Public Beta downloads, links to the Browser Preview, and carries the legal pages.

Live since 2026-11-23, before the first Release: until GitHub reports a
published Release, the site shows "Public Beta – coming soon" and leads to the
Browser Preview (see "Release availability").

## Routes

| Route | Purpose | Notes |
| --- | --- | --- |
| `/` | Landing page | On localhost (developer server, desktop shell) it redirects to `/nex-note-app`, as before. |
| `/impressum` | Impressum / Legal notice | Renders on every host. |
| `/datenschutz` | Datenschutzerklärung / Privacy policy | Renders on every host. |
| `/nex-note-app` | Browser Preview | Shows a dismissible banner on public hosts only. |
| `/de`, `/en` | Short language paths | Redirect (307) to `/?locale=de` and `/?locale=en`. |

## Structure

- `app/page.tsx`, `app/impressum/page.tsx`, `app/datenschutz/page.tsx`: thin
  server routes. They resolve the locale and the release availability
  (`getReleaseAvailability()`), set metadata (title, description, `hreflang`
  alternates) and render a view. All three views take the `release` prop,
  because the footer and the Impressum link into the repository only once it
  is public.
- `lib/site/release-availability.ts` (pure, tested) and
  `lib/site/release-availability.server.ts` (the cached server call): see
  "Release availability".
- `components/site/LandingView.tsx`: landing sections in order: hero with
  download, screenshots, features, formats, privacy / Bring your own AI,
  who it is for, FAQ, footer.
- `components/site/LegalViews.tsx`: Impressum and privacy policy views.
- `components/site/SiteChrome.tsx`: header, language switcher, footer, shared
  colour and focus classes (light and dark follow the system setting).
- `components/site/DownloadButtons.tsx`: the only client component on the
  landing page. Without an available Release (see below) it shows
  "Public Beta – coming soon" and makes "Try in browser" the primary button.
  With one, the server renders both downloads; after hydration it reads
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

`/de` and `/en` redirect (307) to `/?locale=de` and `/?locale=en`
(`siteLocalePathRedirects()` in `lib/site/locale.ts`, wired in
`next.config.ts`).

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

`lib/site/release-links.ts` is the single place for the download URLs. They
use GitHub's `releases/latest/download/<asset>` redirects and only change if
the asset names change (`Nex-Note-mac-universal.dmg`,
`Nex-Note-linux-x86_64.AppImage`).

## Release availability

The website can go live before the first Release. The landing page, the
Impressum and the privacy policy ask GitHub on the server whether a Release
can be downloaded (`lib/site/release-availability.ts`, cached in
`lib/site/release-availability.server.ts`):

- One anonymous request to
  `https://api.github.com/repos/hybridpicker/nex-note/releases/latest`:
  no token, no cookies, no visitor headers, a fixed `User-Agent:
  nex-note-website`, 3 s timeout. Browsers never contact GitHub for this.
- The answer is cached for 600 s per server with `unstable_cache`, shared by
  all visitors and pages (about six requests an hour, well inside GitHub's
  anonymous limit). Next's own `fetch` cache is not used because it keeps
  only 200 responses, so "no Release yet" would hit GitHub on every visit.
- **Available**: HTTP 200, not a draft or prerelease, and at least one of the
  two download assets attached. Each button appears only when its asset is
  attached. The version (`X.Y.Z` from the tag) and the publication date come
  from the Release, never from `package.json`, which carries a `-dev` version
  on `devel` and after a website-only deploy. An unexpected tag hides the
  version line but keeps the buttons.
- **Coming soon**: HTTP 404 (no Release yet; also what a private repository
  answers) is cached like any answer. Every other failure (timeout, 403/429
  rate limit, 5xx, invalid JSON) throws inside the cache, so the last good
  answer stays in place; only a server that has never had an answer shows
  coming soon.

Coming soon changes more than the buttons, because the repository only
becomes public with the first Release (`docs/adr/0001-source-public-at-public-beta.md`):
the Omarchy hint, "All downloads and checksums", the version line and every
link into the repository (footer, Impressum) are hidden, the footer says
"Public Beta – coming soon", and the formats lead and two FAQ answers use
their `leadComingSoon` / `aComingSoon` wording from `lib/site/landing-copy.ts`.

When `npm run ship` publishes the first Release, the downloads appear within
about ten minutes without another deploy. To check the state from outside:

```sh
curl -s -o /dev/null -w '%{http_code}\n' https://api.github.com/repos/hybridpicker/nex-note/releases/latest
```

## Icons

Every icon the website shows is the app icon itself, built from
`assets/app-icon.png` (the same image as the `.icns` and the iPad AppIcon) by
`node scripts/build-web-icons.mjs`:

| File | Use |
| --- | --- |
| `public/brand/nex-note-app-icon.png` (512 px) | Header logo, shown at 36 px with a shadow that follows the rounded tile |
| `public/brand/nex-note-app-icon-192.png` | `<link rel="icon">` |
| `public/brand/apple-touch-icon.png` (180 px) | Home-screen icon: the tile alone, opaque, since iOS rounds the corners itself |
| `app/favicon.ico` (16, 32, 48, 256 px) | Browser tab |

When the app icon changes, run the script and commit its output;
`test/site-pages.test.ts` fails while the website icons differ from it. The
editor's own header (`components/NexNoteBrand.tsx`) keeps the separate
wordmark in `public/brand/nex-note-icon.png` and `nex-note-logo.png`.

## Screenshots

`scripts/capture-readme-screenshots.mjs` writes `docs/screenshots/` from the
synthetic fixtures; copy the files the website uses into
`public/screenshots/`. The landing page leads with `score-closeup.png`, the
score alone at 160 % editor zoom, because a full editor window shrinks the
staff lines to a hairline at the page's width. The smaller images stay full
editor views. Image sizes other than 2880×1800 are given in
`lib/site/landing-copy.ts`.

## Keep in step

- `SERVER_LOG_RETENTION` in `lib/site/legal-copy.ts` says 30 days, matching
  `/etc/logrotate.d/nginx` on the web host (`daily`, `rotate 30`; checked
  2026-11-22). Change both together.
- `LEGAL_CONTACT_EMAIL` in `lib/site/legal-contact.ts` is set. Should it ever
  be emptied, the Impressum and privacy policy show a visible red placeholder,
  and `test/site-pages.test.ts` fails.
- The asset names in `lib/site/release-links.ts` and the upload list in
  `docs/release.md`.

## Deploying and checking

A website change goes live with the website-only deployment in
`docs/development.md` (fast-forward `main` to `devel`, push `main`); the web
host deploys `main` by itself. Every commit on `devel` since the last deploy
goes live with it.

Before pushing `main`, check the production build locally. The landing page
redirects to the editor on localhost, so use a `*.localhost` name, which
browsers resolve to the loopback address:

```sh
npm run build
cd .next/standalone && PORT=3106 HOSTNAME=127.0.0.1 node server.js
```

Then open `http://nex-note.localhost:3106/`, `/?locale=de`, `/impressum` and
`/datenschutz` at desktop and phone width, in light and dark mode: no
horizontal scrolling, no console errors, no request to another host. For
`curl`, add `--resolve nex-note.localhost:3106:127.0.0.1`.

After the deploy, check from outside (status codes only):

```sh
curl -s -o /dev/null -w '%{http_code}\n' https://nex-note.com/
curl -s -o /dev/null -w '%{http_code} %{redirect_url}\n' https://nex-note.com/de
curl -s -o /dev/null -w '%{http_code}\n' https://nex-note.com/impressum
curl -s -o /dev/null -w '%{http_code}\n' https://nex-note.com/nex-note-app
```

To see when a deploy has landed, poll a file or path only the new build has.
A request to `/api/ollama-models` with a forged `X-Forwarded-Host: localhost`
must not return a model list.

## Tests

```sh
npx tsx --test test/site-release-links.test.ts test/site-os-detection.test.ts test/site-pages.test.ts
```
