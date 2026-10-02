# Nex Note for Linux (Omarchy)

    ./linux/install.sh

Builds the Electron app (`npm run electron:build:linux`, output `dist/linux`), installs it to
`~/.local/opt/nex-note` and adds a launcher entry. No root required.

AI provider keys are configured per machine (see `.env.local.example`); nothing is copied from other devices.
The in-app "update" action is macOS-oriented; on Linux rerun `git pull && ./linux/install.sh`.
