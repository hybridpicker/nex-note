#!/usr/bin/env bash
# Build Nex Note for Linux and install it as a desktop app (no root needed).
set -euo pipefail
REPO="$(cd "$(dirname "$0")/.." && pwd)"
DEST="$HOME/.local/opt/nex-note"

cd "$REPO"
npm ci
npm run electron:build:linux

SRC="$REPO/dist/linux/linux-unpacked"
[ -x "$SRC/nex-note" ] || SRC="$(dirname "$(find "$REPO/dist/linux" -maxdepth 2 -type f -name 'nex-note' | head -1)")"
rm -rf "$DEST"; mkdir -p "$DEST"; cp -r "$SRC/." "$DEST/"
cp "$REPO/assets/app-icon.png" "$DEST/icon.png"

mkdir -p "$HOME/.local/share/applications"
cat > "$HOME/.local/share/applications/nex-note.desktop" <<DESKTOP
[Desktop Entry]
Type=Application
Name=Nex Note
Comment=Music notation, tabs and AI-assisted score editing
Exec=$DEST/nex-note %F
Icon=$DEST/icon.png
Terminal=false
Categories=AudioVideo;Audio;Music;
MimeType=application/vnd.recordare.musicxml+xml;application/vnd.recordare.musicxml;audio/midi;
StartupWMClass=Nex Note
DESKTOP
update-desktop-database "$HOME/.local/share/applications" 2>/dev/null || true
echo "Installed. Launch 'Nex Note' from the app launcher."
