# Omarchy Package (`nex-note-bin`)

The AUR package is generated for every Release by `npm run ship` from
`renderPkgbuild` / `renderSrcinfo` in `scripts/release-helpers.mjs` and written to
`dist/release/aur/`. It installs the Linux Release tarball under `/opt/nex-note`,
with `/usr/bin/nex-note`, a desktop entry (window class `nex-note`), the icon and
the MIME types. Updates come from pacman/yay; the app's Update Check stays off
because no `APPIMAGE` variable is set.

Every Release also carries the `PKGBUILD` as an asset, so Omarchy and Arch users can install
without the AUR:

```bash
curl -LO https://github.com/hybridpicker/nex-note/releases/latest/download/PKGBUILD && makepkg -si
```

That is what the website and the release notes show while `AUR_PUBLISHED` in
`lib/site/release-links.ts` is `false`. Packages installed this way do not update through
pacman/yay; users repeat the command for a new Release.

Status (2026-11-23): not on the AUR yet. AUR registration was paused for all new accounts. This
Mac already has an AUR-only SSH key (`~/.ssh/aur_ed25519`) and a `Host aur.archlinux.org` entry in
`~/.ssh/config`. The 0.1.0 package was built, installed and started in an x86_64 Arch container.

First publication (once, by the owner):

1. Register at https://aur.archlinux.org/register and paste `~/.ssh/aur_ed25519.pub` as SSH public key (later: My Account → Edit).
2. `git clone ssh://aur@aur.archlinux.org/nex-note-bin.git ~/Coding/aur-nex-note-bin`
   (an empty repository the first time).
3. Run releases with `NEX_NOTE_AUR_CLONE=~/Coding/aur-nex-note-bin npm run ship`, or
   copy `dist/release/aur/PKGBUILD` and `.SRCINFO` into the clone and push.
4. Set `AUR_PUBLISHED = true` in `lib/site/release-links.ts`, so the website shows
   `yay -S nex-note-bin`.

On an Arch machine, `makepkg -si` in `dist/release/aur/` test-installs the package,
and `namcap PKGBUILD` lints it.
