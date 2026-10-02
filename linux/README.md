# Nex Note for Linux (Omarchy)

    ./linux/install.sh

Builds the Electron app (`npm run electron:build:linux`, output `dist/linux`), installs it to
`~/.local/opt/nex-note` and adds a launcher entry. No root required.

AI provider keys are configured per machine (see `.env.local.example`); nothing is copied from other devices.
The in-app "update" action is macOS-oriented; on Linux rerun `git pull && ./linux/install.sh`.

Options: `./linux/install.sh --no-build` reinstalls the existing build, `--uninstall` removes everything.
`nex-note [file]` opens a file in the running instance. The window is frameless and uses native Wayland;
set `NEX_NOTE_LINUX_FRAME=1` for a window frame. For Hyprland rules the window class is `nex-note`
(verify with `hyprctl clients`). Roadmap: `docs/linux-pro-roadmap.md`.
Update: `./linux/update.sh`. Playback samples are fetched once by the installer (`npm run soundfonts:fetch`, ~53 MB).
New in the menus: File > Export PDF... (Ctrl+Shift+E), File > Export All Parts (ZIP), View > Notation Font.
