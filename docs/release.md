# Releases

A **Release** (see `GLOSSARY.md`) is a numbered version of the desktop app for the
Public Beta: always cut from `main`, signed and notarized on the owner's Mac
(`docs/adr/0002-release-builds-signed-locally.md`), published on GitHub Releases of
`hybridpicker/nex-note`, which must be public (`docs/adr/0001-source-public-at-public-beta.md`).

## Two desktop apps

| | Release ("Nex Note") | Developer App ("Nex Note Dev") |
| --- | --- | --- |
| Source | tag `vX.Y.Z` on `main` | local `devel` checkout |
| Config | `electron-builder.release.cjs` | `build` in `package.json` |
| Bundle id | `app.nex-note.desktop` | `app.nex-note.desktop.dev` |
| macOS | universal, Developer ID, notarized | host arch, unsigned |
| Linux | AppImage + tarball (AUR `nex-note-bin`), `nex-note` | `linux/install.sh`, `nex-note-dev` |
| Updates | Update Check against GitHub Releases, after consent | fast-forwards clean `devel` from origin at start and hourly, then rebuilds |
| User data | `~/Library/Application Support/Nex Note` | `…/Nex Note Dev` (copied once from `Nex Note` on first start) |

The channel is stamped into `.next/standalone/nex-note-build.json` by
`scripts/sync-standalone-assets.mjs` (`NEX_NOTE_RELEASE_CHANNEL=release` for Releases)
and read by `electron/channel.cjs`. Release stamps contain no local paths.

## Versions

`devel` always carries the next version with a `-dev` suffix (`0.1.0-dev`). `npm run ship`
drops the suffix for the Release commit and moves `devel` on to the next patch
(`0.1.1-dev`). Raise the minor or major version on `devel` by editing `package.json`.

## One-time setup (owner)

```sh
npm run release:setup
```

The wizard (`scripts/setup-release-signing.sh`) walks through:

1. the **Developer ID Application** certificate (Xcode → Settings → Accounts →
   Manage Certificates → + → Developer ID Application; Account Holder only);
2. an **App Store Connect API key** (Users and Access → Integrations → Team Keys,
   access "Developer");
3. storing it as the notarytool keychain profile `nex-note-notary`
   (`NEX_NOTE_NOTARY_PROFILE` overrides the name).

No credential is written to the repository or a `.env` file. Also needed: `gh auth login`.

## Shipping

```sh
npm run release:build          # signed + notarized build of devel HEAD, nothing published
npm run ship -- --dry-run      # full pipeline incl. Release commit, stops before pushing
npm run ship                   # the real thing
```

`npm run ship` requires a clean `devel` equal to `origin/devel`, `origin/main` as its
ancestor, a public repository and the signing setup. A full run takes about an hour on the
owner's Mac (merging the universal app alone takes 20–25 minutes, then two notarizations and
the upload of about 860 MB). It then:

1. checks out `devel` HEAD in `~/Library/Caches/nex-note/release-build` (no `.env*` copied),
   commits the Release version there;
2. runs `npm ci`, `soundfonts:fetch` (required), `npm test`, the Release-channel build;
3. builds the universal macOS app, DMG and zip and the Linux AppImage + tarball. electron-builder
   signs, notarizes and staples the app; the script then signs, notarizes and staples the DMG
   itself (electron-builder leaves the DMG unsigned) and updates the DMG's sha512 and size in
   `latest-mac.yml`. The macOS Update Check downloads the zip, whose entry stays as built;
4. verifies `codesign`, Gatekeeper (`spctl`) for the app and the DMG, both stapled tickets, the build stamp, the
   bundled soundfonts and the absence of environment files;
5. collects artifacts, `latest-*.yml`, blockmaps, `SHA256SUMS`, release notes and the AUR
   `PKGBUILD`/`.SRCINFO` in `dist/release/` (the `PKGBUILD` is also a Release asset);
6. fetches `origin` again and stops while nothing is public if `main` or `devel` moved during
   the build (the Release commit could no longer fast-forward them); then asks for
   confirmation, checks once more, pushes the tag, creates the GitHub Release (draft → upload →
   publish), **pushes `main` (this deploys nex-note.com)**, fast-forwards `devel` and commits
   the next `-dev` version, and updates the AUR clone if `NEX_NOTE_AUR_CLONE` is set.

Options: `--skip-tests`, `--skip-linux`, `--yes`.

If it stops before step 6, nothing public changed; run it again. If it stops during step 6,
finish the remaining sub-steps by hand in the order above (the tag and the Release must exist
before `main` moves, because the website links to `releases/latest`).

### When publishing stops halfway (what happened with 0.1.0)

- **Upload timeout.** GitHub cancels a slow asset upload with `HTTP 408: Upload body timed out
  due to inactivity`. The Release stays a draft. Upload the missing files one at a time, compare
  their sizes with `dist/release/`, then publish:

  ```sh
  gh release upload v<version> --repo hybridpicker/nex-note --clobber dist/release/<file>
  gh release view v<version> --repo hybridpicker/nex-note --json assets
  gh release edit v<version> --repo hybridpicker/nex-note --draft=false --latest
  ```

- **`main` moved during the build** (0.1.0: a docs commit landed while ship was building, before
  the check in step 6 existed). Merge the tagged Release commit into `devel`, push that merge to
  `main` and `devel`, then commit the next `-dev` version on `devel` (`0.1.1-dev` after 0.1.0).
- **Pre-commit e2e failures on such a merge** come from a busy machine (a long Claude session or
  an upload in progress); different timing tests failed on each attempt. Retry when the machine
  is idle; never skip the hook.
- **Omarchy Package.** If `NEX_NOTE_AUR_CLONE` is not set, nothing is pushed to the AUR; the
  `PKGBUILD` attached to the Release is the install path (see `packaging/aur/README.md`).

## Artifacts

| File | Used by |
| --- | --- |
| `Nex-Note-mac-universal.dmg` | website download (macOS) |
| `Nex-Note-mac-universal.zip`, `latest-mac.yml` | macOS Update Check (Squirrel) |
| `Nex-Note-linux-x86_64.AppImage`, `latest-linux.yml` | website download (Linux), AppImage Update Check |
| `Nex-Note-linux-x86_64.tar.gz` | Omarchy Package |
| `PKGBUILD` | Omarchy/Arch install without the AUR (`curl -LO …/PKGBUILD && makepkg -si`) |
| `SHA256SUMS` | manual verification |

The website (`lib/site/release-links.ts`) links to `releases/latest/download/<file>`, so the
names must not change without updating it. It shows those buttons only once GitHub reports a
published Release with the files attached (checked on the server, cached for ten minutes; see
`docs/website.md`, "Release availability"); until then it says "Public Beta – coming soon".

## Privacy

The Update Check asks once ("Check for updates automatically?") and can be switched off in
the Nex Note menu (macOS) or Help menu (Linux). It sends only the standard HTTP request to
GitHub; there is no telemetry and no crash reporting. Keep `/datenschutz`
(`lib/site/legal-copy.ts`) in step with any change here.
