# Omarchy Package (`nex-note-bin`)

The AUR package is generated for every Release by `npm run ship` from
`renderPkgbuild` / `renderSrcinfo` in `scripts/release-helpers.mjs` and written to
`dist/release/aur/`. It installs the Linux Release tarball under `/opt/nex-note`,
with `/usr/bin/nex-note`, a desktop entry (window class `nex-note`), the icon and
the MIME types. Updates come from pacman/yay; the app's Update Check stays off
because no `APPIMAGE` variable is set.

First publication (once, by the owner):

1. Create an AUR account and add an SSH key at https://aur.archlinux.org/account.
2. `git clone ssh://aur@aur.archlinux.org/nex-note-bin.git ~/Coding/aur-nex-note-bin`
   (an empty repository the first time).
3. Run releases with `NEX_NOTE_AUR_CLONE=~/Coding/aur-nex-note-bin npm run ship`, or
   copy `dist/release/aur/PKGBUILD` and `.SRCINFO` into the clone and push.

On an Arch machine, `makepkg -si` in `dist/release/aur/` test-installs the package,
and `namcap PKGBUILD` lints it.
