# Nex Note

Nex Note is a local-first music notation app with one shared product core and several application surfaces. This glossary fixes the words used for how the product is distributed and presented.

## Distribution

**Public Beta**:
The free, publicly downloadable release stage of the desktop app, offered to anyone on the website without a request or sign-up.
_Avoid_: Founder build, founder alpha, early access

**Release DMG**:
The macOS disk image offered as the Public Beta download: one universal build for Apple Silicon and Intel, signed with a Developer ID and notarized by Apple.
_Avoid_: Founder DMG, latest DMG (that is the local developer build)

**Release**:
A numbered version of the desktop app, always cut from `main`, starting at 0.1.0 for the Public Beta, published for download and offered to installed apps as an update.
_Avoid_: Build, drop

**Linux Release**:
The Public Beta download for Linux: an x86_64 AppImage published with each Release, plus the Omarchy Package built from it.
_Avoid_: Linux build (that is the local `install.sh` result)

**Omarchy Package**:
The Arch User Repository package `nex-note-bin` that installs a Linux Release on Omarchy and Arch, with updates handled by the package manager.
_Avoid_: Omarchy app, AUR build

**Update Check**:
The installed app asking the release source whether a newer Release exists, only with the user's consent and never sending usage data.
_Avoid_: Telemetry, phone home, self-refresh (that is the developer-only rebuild from a `devel` checkout)

**Developer App**:
"Nex Note Dev", the separately named desktop app that follows `devel` and keeps itself current from that branch; it lives beside the Public Beta and never receives Releases.
_Avoid_: Dev build, devel app, founder app

**Session Key**:
An AI provider key the user pastes in to try AI editing, held only for the current session and never stored.
_Avoid_: Temporary key, trial key, guest key

**Developer DMG**:
An unsigned disk image built locally from the current commit for the developer's own testing; never offered on the website.
_Avoid_: Release, public build

**Browser Preview**:
The editor running in a web browser on the website, offered as a secondary way to try Nex Note next to the Release DMG.
_Avoid_: Web alpha, web app, PWA
