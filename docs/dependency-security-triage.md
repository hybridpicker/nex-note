# Dependency security triage

Date: 2026-11-05. Source: the open Dependabot alerts of `hybridpicker/nex-note`, read with
`gh api repos/hybridpicker/nex-note/dependabot/alerts` (86 open: 5 critical, 50 high, 25 medium,
6 low). **Nothing was upgraded** in this triage; it only classifies and recommends. The advisory
texts are public. Installed versions come from `npm ls` on `devel`.

"Scope" is Dependabot's own label (`runtime` or `development` in `package.json`). It is not the same
as "ships to users": the Electron framework is a `devDependency` but is shipped inside the desktop
app, and `next` is a `dependency` that also runs as the packaged local server. The last column is
the judgement made here from how this repository uses the package.

## Summary by package

| Package | Installed | Alerts (critical/high/medium/low) | Dependabot scope | Reaches shipped runtime? | Fixed in |
| --- | --- | --- | --- | --- | --- |
| `next` | 16.2.11 | 5 / 1 / 0 / 0 (alerts 78, 79, 90, 113, 115 critical; 114 high) | runtime | **Yes**: Next server (dev, packaged Electron server, Mac server for the iPad live mode) | 16.4.1 |
| `@xmldom/xmldom` | 0.9.10 (direct), 0.8.13 (transitive) | 0 / 19 / 4 / 0 | runtime (0.9) and development (0.8) | **Yes** for 0.9.x: it parses imported MusicXML, ABC and Guitar Pro conversions | 0.9.12 / 0.8.15 |
| `electron` | 41.4.0 | 0 / 5 / 10 / 6 (41.x and 42.x ranges) | development | **Yes**: the Electron runtime is bundled in the macOS and Linux apps | 41.10.6 (41.x line) |
| `nanoid` | 3.3.16 | 0 / 3 / 0 / 0 | runtime | Transitive (Next/PostCSS build chain); not called with attacker-chosen sizes | 3.3.18 |
| `postcss` | 8.5.18 (overridden) | 0 / 1 / 1 / 0 | runtime | Build time only (Tailwind); not in the served app | 8.5.23 |
| `sharp` | 0.35.0 (overridden) | 0 / 1 / 0 / 0 | runtime | Possible: Next image optimisation. The app uses no `next/image` | 0.35.4 |
| `source-map-js` | 1.2.1 | 0 / 1 / 0 / 0 | runtime | Build time only | 1.2.2 |
| `baseline-browser-mapping` | 2.x < 2.11 | 0 / 0 / 1 / 0 | runtime | Build time only (browserslist data) | 2.11.0 |
| `undici` | 6.27.0 | 0 / 4 / 6 / 0 | development | Tooling (Playwright/Electron builder download paths). No app code uses it | 6.29.1 or later |
| `brace-expansion` | 1.1.16, 2.1.2, 5.0.8 | 0 / 9 / 2 / 0 | development | Tooling (glob matching in the build and test chain) | 1.1.21, 2.1.7, 5.0.11 |
| `electron-builder` family (`app-builder-lib`, `builder-util-runtime`) | 26.x | 0 / 2 / 0 / 0 | development | Packaging and auto-update tooling; the updater client code runs in the app only if auto-update is enabled | 26.15.0+ (see alerts 31, 32) |
| `extract-zip` | 2.x | 0 / 2 / 0 / 0 | development | Electron's download helper at install time | none yet |
| `js-yaml` | 4.x | 0 / 2 / 0 / 0 | development | Tooling (config loaders) | 4.3.2 |
| `sprintf-js` | 1.x | 0 / 0 / 1 / 0 | development | Tooling; the advisory is withdrawn | none |

## What the repository actually uses

- `next/image`, `next/og`, `'use cache'` and Server Actions are not used anywhere in `app/`,
  `components/`, `lib/`, `src/` or `hooks/`. The default Next server still exposes the image optimisation
  endpoint (`/_next/image`) and its sharp dependency, and `next.config.ts` sets no `images` option.
  Whether that endpoint is reachable for the SVG and AVIF cases in alerts 78, 79, 113 and 115 was not
  tested here. Treat it as reachable until a patched version is installed or the endpoint is disabled.
- The local Next server is the editor's backend for the desktop apps, and the native iPad shell reaches it
  over the LAN in explicit live mode. A user on the same network is therefore the realistic attacker, not
  the open internet. A public deployment of the same server would be exposed far more.
- `@xmldom/xmldom` 0.9.x parses MusicXML that users open from files. A crafted file can exploit the
  quadratic-time and quadratic-memory alerts (denial of service of the editor). The "requireWellFormed"
  injection alerts concern serialisation of attacker-built DOMs; nex-note builds its own DOM from parsed
  scores, so injection matters mainly when a parsed attacker file is re-serialised.

## Recommendation

| Priority | Action | Why |
| --- | --- | --- |
| 1, urgent | Upgrade `next` from 16.2.11 to 16.4.1 or later, then run the full gate (`npm test`, `npm run build`, Electron refresh, iPad sync). | Five critical remote-code-execution alerts and one high denial of service apply to the installed version. The mitigating facts above (no `next/image`, local or LAN use) reduce the exposure but do not remove it. The owner decides. |
| 2, soon | Upgrade `@xmldom/xmldom` to 0.9.12 and the transitive 0.8.x to 0.8.15 (via the packages that pull it). | Shipped parser of untrusted files; 19 high alerts, mostly denial of service. A patch release within the same minor line. |
| 3, soon | Upgrade `electron` to the latest 41.x patch (41.10.6 or later), or to 42.x if planned. Re-run `npm run electron:refresh`. | Shipped framework. The sandbox and webview alerts matter only if the app opens untrusted content in webviews or popups. Check this before judging urgency. |
| 4, with the Next upgrade | Raise the `sharp` override from 0.35.0 to 0.35.4 and the `postcss` override from 8.5.18 to 8.5.23; let `nanoid`, `source-map-js` and `baseline-browser-mapping` follow the lock file. | Overrides pin the vulnerable versions, so a plain `npm update` will not fix them. |
| 5, routine | Update tooling (`undici`, `brace-expansion`, `js-yaml`, `electron-builder`) with a normal `npm audit fix` pass on a branch. | Development-time only. Review `electron-builder`: alerts 31 and 32 concern AppImage packaging and the updater. |
| 6, no action | `extract-zip` (no fix released) and `sprintf-js` (withdrawn advisory). | Install-time helpers; dismiss or track upstream. |

## Not done

No dependency, lock file, override or workflow was changed. No alert was dismissed. Reachability of the
Next image optimisation endpoint, and whether the apps open untrusted content in Electron webviews, were
judged from the source and not exercised.
