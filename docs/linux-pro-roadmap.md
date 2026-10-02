# Linux / Omarchy professional-editor roadmap

Updated: 2026-10-02. Basis: competitor feature survey (MuseScore 4, Dorico, Sibelius, Finale), a code gap
analysis of this repository, and Linux technical research. The survey was thin (few sources, partly
background knowledge); treat difficulty ratings as estimates. This is a plan, not a parity claim.

## Already in place (see note-input-parity-matrix.md)
Semantic score core, keyboard/mouse/MIDI step input, voices 1-4, tuplets, graces, TAB, chord symbols,
lyrics, repeats/voltas, undo/redo, MusicXML/MXL/MSCZ/MIDI/ABC/Guitar Pro I/O, part extraction (one-shot),
layout projection, print view.

## Linux integration (done in this change)
- Native Wayland (`ozone-platform-hint=auto`), frameless tiled window, small minimum size
  (`NEX_NOTE_LINUX_FRAME=1` restores the frame).
- Installer with `--no-build` / `--uninstall`, `nex-note` on PATH, icon theme entry, MIME types.
- Shortcut labels show Ctrl/Alt on Linux everywhere (central in `translate()`).
- Removed a stale machine-specific MuseScore path; Linux-friendly UI font fallbacks.

## Done in the second pass (unit-tested; not yet verified by eye in the running app)
- **Vector PDF export**: File > Export PDF... (Ctrl+Shift+E) uses Chromium `printToPDF` from the print view
  (fonts embedded, tagged PDF). Falls back to `window.print()` outside Electron.
- **Notation font**: Bravura (SMuFL) is already the OSMD/VexFlow default; View > Notation Font adds
  Petaluma and Gonville, applied at next start.
- **Playback mixer**: per-part volume, mute, solo (toolbar "Mixer"); `lib/playback-mixer.ts`.
- **MIDI hotplug**: port list is re-read every 3 s and on window focus (Chromium on ALSA/PipeWire does not
  reliably fire `statechange`); `rescan` is exposed by `useMidiInput`.
- **All parts export**: File > Export All Parts (ZIP), one single-part MusicXML per player.
- **Offline playback**: `npm run soundfonts:fetch` downloads the FluidR3_GM instruments used by the app (MIT) into
  `public/soundfonts`; playback loads them locally first, then the remote host, then oscillators. The installer
  runs the fetch. Verified: packaged app serves them (HTTP 200). Sound is FluidR3_GM, not MusyngKite as before.
- Packaging: `npm run electron:build:linux:appimage` (untested), `linux/update.sh`.
- Verified live: window class `nex-note`, native Wayland (no XWayland), tiled.

## Next, in priority order
1. **Playback sound**: MuseScore_General (MIT) as a better default than FluidR3_GM, pan, optional FluidSynth
   sidecar. No VST/CLAP hosting.
2. **VexFlow 5 / OSMD upgrade** (current VexFlow 1.2.93 is bundled inside OSMD 1.9.9).
3. **MIDI**: verify unplug/replug on real hardware; add a visible rescan button.
4. **PDF**: verify output visually (page size, fonts, multi-page) on a real score.
5. **Large-score performance** (documented misses: 4096-note edit ~3.9 s).
6. **Linked parts** with per-part layout overrides; page/engraving style presets.
7. **Engraving**: collision avoidance, manual positioning, cross-staff beaming, figured bass.
   Likely needs a custom layout layer beyond OSMD.
8. Packaging: AppImage/pkg target, Linux update path (currently `git pull && ./linux/install.sh`).

## Risks
SoundFont licences vs AGPL (avoid CC-BY-NC; confirm GeneralUser GS before bundling), Electron Wayland
regressions (keep XWayland fallback), MuseScore 4.7.x CLI crashes in roundtrip checks.
