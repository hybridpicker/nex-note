#!/usr/bin/env bash
# Build Nex Note for Linux (Omarchy/Hyprland) and install it as a desktop app. No root needed.
#   ./linux/install.sh              build + install
#   ./linux/install.sh --no-build   reinstall the existing dist/linux build
#   ./linux/install.sh --uninstall  remove app, launcher, icons and MIME entries
set -euo pipefail
REPO="$(cd "$(dirname "$0")/.." && pwd)"
DEST="$HOME/.local/opt/nex-note"
BIN="$HOME/.local/bin/nex-note"
APPS="$HOME/.local/share/applications"
MIME="$HOME/.local/share/mime"
ICONS="$HOME/.local/share/icons/hicolor"

refresh_caches() {
  update-desktop-database "$APPS" 2>/dev/null || true
  update-mime-database "$MIME" 2>/dev/null || true
  gtk-update-icon-cache -q -t "$ICONS" 2>/dev/null || true
}

if [ "${1:-}" = "--uninstall" ]; then
  rm -rf "$DEST" "$BIN" "$APPS/nex-note.desktop" "$MIME/packages/nex-note.xml" "$ICONS/512x512/apps/nex-note.png"
  refresh_caches
  echo "Nex Note removed."
  exit 0
fi

cd "$REPO"
if [ "${1:-}" != "--no-build" ]; then
  [ -d node_modules ] || npm ci
  # Offline playback samples (skipped files are re-tried next time; playback falls back to the network).
  npm run soundfonts:fetch || echo "Warning: some soundfonts could not be downloaded." >&2
  npm run electron:build:linux
fi

SRC="$REPO/dist/linux/linux-unpacked"
[ -x "$SRC/nex-note" ] || SRC="$(dirname "$(find "$REPO/dist/linux" -maxdepth 2 -type f -name 'nex-note' | head -1)")"
[ -x "$SRC/nex-note" ] || { echo "No Linux build found in dist/linux." >&2; exit 1; }

rm -rf "$DEST"; mkdir -p "$DEST"; cp -r "$SRC/." "$DEST/"
cp "$REPO/assets/app-icon.png" "$DEST/icon.png"

mkdir -p "$(dirname "$BIN")" "$ICONS/512x512/apps" "$MIME/packages" "$APPS"
cp "$REPO/assets/app-icon.png" "$ICONS/512x512/apps/nex-note.png"
cp "$REPO/linux/nex-note.xml" "$MIME/packages/nex-note.xml"

# Launcher on PATH: `nex-note score.mxl` opens the file in the running instance.
cat > "$BIN" <<LAUNCHER
#!/usr/bin/env bash
exec "$DEST/nex-note" "\$@"
LAUNCHER
chmod +x "$BIN"

cat > "$APPS/nex-note.desktop" <<DESKTOP
[Desktop Entry]
Type=Application
Name=Nex Note
GenericName=Music Notation Editor
Comment=Professional note entry, tabs and AI-assisted score editing
Exec=$DEST/nex-note %F
Icon=nex-note
Terminal=false
Categories=AudioVideo;Audio;Music;Midi;
Keywords=notation;score;musicxml;midi;tab;sheet music;noten;
MimeType=application/vnd.recordare.musicxml+xml;application/vnd.recordare.musicxml;application/x-nex-note-project;application/x-musescore;application/x-guitar-pro;audio/midi;audio/x-midi;
StartupWMClass=nex-note
StartupNotify=true
DESKTOP

refresh_caches
echo "Installed. Launch 'Nex Note' from the launcher (Super+Space) or run: nex-note [file]"
