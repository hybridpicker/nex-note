# Dependency security triage

Date: 2026-11-05. **Update, same day: `next` was upgraded from 16.2.11 to 16.4.5** at the owner's request
(see "Update" at the end). Everything else below is still the triage state of the alerts as read at the start.
Source: the open Dependabot alerts of `hybridpicker/nex-note`, read with
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
| `next` | 16.2.11, **now 16.4.5** | 5 / 1 / 0 / 0 (alerts 78, 79, 90, 113, 115 critical; 114 high) | runtime | **Yes**: Next server (dev, packaged Electron server, Mac server for the iPad live mode) | 16.4.1 |
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
| 1, urgent, **done 2026-11-05** | Upgrade `next` from 16.2.11 to 16.4.1 or later, then run the full gate (`npm test`, `npm run build`, Electron refresh, iPad sync). | Five critical remote-code-execution alerts and one high denial of service apply to the installed version. The mitigating facts above (no `next/image`, local or LAN use) reduce the exposure but do not remove it. The owner decides. |
| 2, soon | Upgrade `@xmldom/xmldom` to 0.9.12 and the transitive 0.8.x to 0.8.15 (via the packages that pull it). | Shipped parser of untrusted files; 19 high alerts, mostly denial of service. A patch release within the same minor line. |
| 3, soon | Upgrade `electron` to the latest 41.x patch (41.10.6 or later), or to 42.x if planned. Re-run `npm run electron:refresh`. | Shipped framework. The sandbox and webview alerts matter only if the app opens untrusted content in webviews or popups. Check this before judging urgency. |
| 4, with the Next upgrade | Raise the `sharp` override from 0.35.0 to 0.35.4 and the `postcss` override from 8.5.18 to 8.5.23; let `nanoid`, `source-map-js` and `baseline-browser-mapping` follow the lock file. | Overrides pin the vulnerable versions, so a plain `npm update` will not fix them. |
| 5, routine | Update tooling (`undici`, `brace-expansion`, `js-yaml`, `electron-builder`) with a normal `npm audit fix` pass on a branch. | Development-time only. Review `electron-builder`: alerts 31 and 32 concern AppImage packaging and the updater. |
| 6, no action | `extract-zip` (no fix released) and `sprintf-js` (withdrawn advisory). | Install-time helpers; dismiss or track upstream. |

## Update: `next` 16.4.5

Done: `next` ^16.2.11 to ^16.4.5 (`package.json`, `package-lock.json`; the lock also moves `@swc/helpers` to
0.5.23 and Next's own `postcss` to 8.5.23). 16.4.5 is above 16.4.1, the fixed version of all six `next`
alerts. Two changes were needed:

- `next.config.ts` now sets `typescript.tsconfigPath: 'tsconfig.build.json'`. Next 16.4 type-checks every
  file in `tsconfig.json`, so the known type errors in `e2e/` and `test/` (backlog 23) failed the production
  build. `tsconfig.build.json` extends `tsconfig.json` and excludes `e2e`, `test`, `scripts` and a few
  generated folders; `tsc -p .` still checks everything.
- `next.config.ts` sets `agentRules: false`. Next 16.4's dev server otherwise writes a "This is NOT the
  Next.js you know" block into `AGENTS.md` when it detects an AI agent.

Checked after the upgrade: `npm test` (1,646), `npm run build`, `test:e2e:doctor`, `electron:refresh`,
`ipad:sync`, `ipad:doctor`, `git diff --check`. Application `tsc` is clean (the 41 known errors are in
`e2e/` and `test/`). The browser group of `notation-quality-cycle` failed once on
`e2e/mouse-precision-stress.spec.ts` "mouse entry prepares audio before commit" (the page stops answering
for 45 s). That test also fails intermittently on 16.2.11: 1 of 8 runs there, 2 of 6 on 16.4.5, so it is
treated as an existing flake, not a regression of the upgrade, but the sample is small. The sharp, postcss,
nanoid and Electron alerts are still open. The image-optimisation endpoint was not exercised.

## Update 2026-11-22: before the Public Beta

Done on `devel` before the first Release:

- `npm audit fix` (no `--force`): `@capacitor/ios`, `@xmldom/xmldom`, `next`, `js-yaml`, `nanoid`, `undici`,
  `source-map-js` and `baseline-browser-mapping` moved to patched versions within their ranges.
- The `sharp` override was raised from 0.35.0 to 0.35.5 (GHSA-rgj7-g3m4-5g8c, GHSA-wq5f-xc86-pv6w) and the
  `postcss` override from 8.5.18 to 8.5.33 (GHSA-fxqj-rqcc-2cmp). Releases load `@img/sharp-wasm32` 0.35.5.

`npm audit --omit=dev` now reports 0. `npm audit` still reports 7, all development scope:

- `electron` 41.10.7 (high). The 41.x line gets no more fixes; the HID/USB permission and the other open
  advisories are fixed only from 42.11.16 on. Moving to Electron 42 is a separate change with its own
  Electron, Linux and Release smoke tests.
- `electron-builder` and its `app-builder-lib`, `dmg-builder`, `@electron/universal` and `minimatch` chain
  (moderate, packaging time only). npm's only offer is a downgrade to 25.1.0, which is not taken.
- `@tailwindcss/postcss` (moderate, build time only), reported through its `postcss` range.

Checked: `npm test` (2,192), `npm run build`, `electron:refresh`, `ipad:sync`, `ipad:doctor`.

## Not done

No other dependency, override or workflow was changed. No alert was dismissed. Reachability of the
Next image optimisation endpoint, and whether the apps open untrusted content in Electron webviews, were
judged from the source and not exercised.
