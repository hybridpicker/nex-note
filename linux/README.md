# Nex Note for Linux (Omarchy)

Users install the Public Beta: the AppImage from GitHub Releases, or on Omarchy/Arch
`yay -S nex-note-bin` (window class `nex-note`; see `docs/release.md`). This folder builds
the **Developer App "Nex Note Dev"** from a `devel` checkout instead; it installs beside the
Public Beta under `~/.local/opt/nex-note-dev` and runs as `nex-note-dev`.

    ./linux/install.sh

Builds the Electron app (`npm run electron:build:linux`, output `dist/linux`), installs it to
`~/.local/opt/nex-note-dev` and adds a launcher entry "Nex Note Dev". No root required. A previous
install under `~/.local/opt/nex-note` (the old name) is removed.

AI provider keys are configured per machine (see `.env.local.example`); nothing is copied from other devices.
At start and hourly the Developer App fast-forwards a clean `devel` checkout from origin and
rebuilds itself with `linux/install.sh`; `./linux/update.sh` does the same by hand.

Options: `./linux/install.sh --no-build` reinstalls the existing build, `--uninstall` removes everything.
`nex-note-dev [file]` opens a file in the running instance. The window is frameless and uses native Wayland;
set `NEX_NOTE_LINUX_FRAME=1` for a window frame. For Hyprland rules the window class is `nex-note-dev` (Public Beta: `nex-note`)
(verify with `hyprctl clients`). Roadmap: `docs/linux-pro-roadmap.md`.
Update: `./linux/update.sh`. Playback samples are fetched once by the installer (`npm run soundfonts:fetch`, ~53 MB).
New in the menus: File > Export PDF... (Ctrl+Shift+E), File > Export All Parts (ZIP), View > Notation Font.
