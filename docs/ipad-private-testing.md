# Private iPad Testing

Nex Note has a native iPad test shell powered by Capacitor. It is not a PWA and
does not need App Store or TestFlight distribution for private development.

The normal signed build contains the shared Nex Note editor. It opens from
`capacitor://localhost` and does not require the Mac, a development server, or
the same Wi-Fi network. Core score editing, touch deletion, file import, and
playback are available in this standalone mode. Playback generates fallback
MIDI on the iPad when `/api/midi` is absent, resumes Web Audio from the original
Play tap, and uses the native iOS playback audio session.

`npm run ipad:dev` remains available as a separate live-development mode. It
connects to the Next.js server on the Mac so server-side AI, MuseScore
conversion, and other routes are available while saved code changes arrive
through Fast Refresh. If a live build opens before that server is ready, its
connection screen retries the exact generated LAN URL automatically.

## One-time Mac preparation

1. Keep at least 30 GiB of free disk space before installing Xcode and its iPadOS
   platform support.
2. Install the current Xcode release from the Mac App Store.
3. Start Xcode once, accept its license, and let it install required components.
4. If command-line tools still point at the standalone tools, run:

   ```bash
   sudo xcode-select -s /Applications/Xcode.app/Contents/Developer
   ```

5. In Xcode, open **Xcode > Settings > Accounts** and add the Apple Account of
   the paid Apple Developer Program membership.
6. Create the untracked `ios/signing.local.xcconfig` with the paid team's ID.
   Debug and Release both read it, and it is the only place the team is set:

   ```
   DEVELOPMENT_TEAM = YOUR10CHARS
   CODE_SIGN_STYLE = Automatic
   ```

7. In the repository, install dependencies and run the doctor:

   ```bash
   npm install
   npm run ipad:doctor
   ```

A free personal team also builds, but its profile expires after 7 days and iPadOS
then refuses to launch the app. A paid team's development profile lasts one year.

## First standalone installation

1. Connect the iPad to the Mac with a USB cable.
2. On the iPad, tap **Trust** if asked and enter the device passcode.
3. Build, sign, install, and launch the standalone editor:

   ```bash
   npm run ipad:install
   ```

   `ipad:install` runs `ipad:sync`, which performs the production build, generates
   the static `/ipad` entry, copies its chunks and public assets into the native
   payload, and writes a Capacitor configuration without `server.url`. It then
   builds the Release configuration, refuses a 7-day profile, installs the app on
   the connected iPad, launches it, and prints the date until which it is valid.
   Pass `--skip-sync` to reuse the existing payload. With several connected iPads,
   set `NEX_NOTE_IPAD_DEVICE` to the one to use.

4. If iPadOS asks for Developer Mode, open **Settings > Privacy & Security >
   Developer Mode**, enable it, restart, confirm, and run the command again.
5. Stop any Mac Nex Note server and relaunch the installed app. The editor must
   still open directly.

## Standalone daily loop

After shared code changes, run `npm run ipad:install` again. To debug in Xcode,
run `npm run ipad:sync` and `npm run ipad:open`, then press Run; Xcode uses the
same local team.

The resulting installed build runs independently. The Mac can sleep or leave
the network after installation.

## Keeping the app installed

The app keeps working until the date `ipad:install` printed, about one year after
the build. Run `npm run ipad:install` before that date to renew it; app data is
preserved as long as the team stays the same. Developer Mode must stay enabled on
the iPad. No App Store, TestFlight, or public release is involved.

## Optional live-development loop

Run this command and keep the terminal open:

```bash
npm run ipad:dev
```

Then launch Nex Note on the iPad. Saved React, CSS, and server changes appear
through Fast Refresh. A native project rebuild is only needed when native
configuration, Capacitor packages, the app icon, or Swift code changes.

Live mode detects the Mac's LAN address, writes it only into the generated debug
configuration, starts Next.js on `0.0.0.0`, and opens Xcode. The Mac and iPad
must be on the same non-isolated Wi-Fi network for this mode.

The native shell shows the normal iPadOS status bar and applies safe-area
spacing around the Nex Note header. Touch devices receive larger notation-tool
targets and a wider note/ghost hit tolerance. The Next.js development badge is
disabled, so the lower-left `N` is not part of either the Mac or iPad UI.

When a note or rest is selected, a persistent touch-sized action bar appears at
the lower-right edge of the score. Tap **Delete note** to remove the selected
notation event. Nex Note preserves the measure's rhythm by replacing a deleted
standalone note with the appropriate rest when required. This control is
available directly on iPad and does not require a hardware keyboard, the hidden
Edit section, or a desktop Delete key.

Useful commands:

| Command | Purpose |
| --- | --- |
| `npm run ipad:doctor` | Check Xcode, disk space, packages, LAN address, and optional live-server reachability. |
| `npm run ipad:install` | Sync, sign with the local paid team, install, and launch the standalone editor on the connected iPad. |
| `npm run ipad:sync` | Build and synchronize the standalone native editor with no Mac server dependency. |
| `npm run ipad:dev` | Prepare the separate Mac-backed live configuration, start Fast Refresh, and open Xcode. |
| `npm run ipad:open` | Open the generated Xcode project. |

## Shared app development

Before changing shared React, CSS, score, AI, import/export, or server code, run:

```bash
npm run apps:plan
```

Shared runtime changes must be evaluated for Next.js, Electron macOS, iPad, and
the planned Xcode macOS surface. The full matrix is documented in
[Multi-app Development Flow](./multi-app-development-flow.md).

For an affected iPad flow, the minimum handoff checks are:

```bash
npm test
npm run build
npm run ipad:sync
npm run ipad:doctor
git diff --check
```

Use the physical iPad for UI, touch, notation input, safe area, orientation,
audio, files, native permission, and native AI changes whenever it is paired and
available.

## Ollama and provider keys

Provider keys stay on the Mac development server. They are not copied into the
iPad bundle or committed native configuration. AI and Mac-only conversions are
therefore unavailable in the standalone build. Use the explicit live mode for
those workflows. Native live requests use the `NexNoteNative/<version>`
user-agent so the private iPad app can access the same server-side provider
routes while generic LAN/public browser requests remain disabled.

When this access path changes, verify native model discovery or authentication
and separately verify that a generic LAN browser is still rejected.

If the Mac's IP address changes during live development, run `npm run ipad:dev`
again and press Run once in Xcode. This does not affect a standalone build.

## Current private-test boundaries

- Server-backed AI, MuseScore conversion, server export routes, and Fast Refresh
  require live mode. The standalone editor and its client MIDI playback do not.
- The debug build deliberately permits unencrypted local-network HTTP. This
  exception is used only when `npm run ipad:dev` generates a live configuration
  and must be removed before any public distribution.
- Browser-based import through the iPad Files picker is available. Native
  document export/share behavior and microphone pitch entry should be verified
  on the physical iPad before treating them as complete.
- Do not add an automatic reload-on-resume that discards unsaved score state.
  Fast Refresh updates code while preserving component state when possible.

## Troubleshooting

### The app says that the Mac server is unreachable

- This message means the installed binary is a live-development build. A
  standalone build never has a `server.url` and opens its bundled editor.
- To replace it with a standalone build, run `npm run ipad:sync`, open Xcode,
  and press Run on the connected iPad.
- To keep using live development instead, follow the remaining checks:
- Confirm the two devices are on the same Wi-Fi and not on an isolated guest
  network.
- Keep `npm run ipad:dev` running.
- Wait for the connection screen to retry or tap **Try again now**. The button
  navigates back to the generated Mac server URL; it does not merely reload the
  local fallback page.
- Allow incoming Node.js connections in the macOS firewall if prompted.
- Run `npm run ipad:doctor` and use the LAN URL it prints.
- If the LAN address changed, rerun `npm run ipad:dev`, then build once in Xcode.
- If another program owns the configured port, stop it or choose another port,
  for example `NEX_NOTE_IPAD_PORT=3100 npm run ipad:dev`. Nex Note validates the
  server identity before it reuses a running process.

### Playback moves but no sound is audible

- Install a build synchronized after the native audio-session and offline MIDI
  changes.
- Tap Play directly once; iPadOS requires Web Audio activation from a user
  gesture.
- Raise the iPad media volume. The native app uses the playback audio category,
  so the silent setting does not suppress score playback.
- The standalone build first creates MIDI on-device. Instrument soundfonts may
  load over the internet; if they are unavailable, Nex Note falls back to its
  built-in oscillator player.

### Xcode reports a signing error

- Confirm the Apple Account is present in Xcode settings.
- Confirm `ios/signing.local.xcconfig` names the paid team. Do not pick a team
  under **Signing & Capabilities**: that writes it into the tracked project file.
- Leave automatic signing enabled.
- If the bundle identifier is already taken in that account, change
  `app.nexnote.ipad` to a unique reverse-domain identifier in
  `capacitor.config.ts`, regenerate the iOS project, and run the install again.

### The app no longer opens after a few days

iPadOS rejects an app whose provisioning profile expired. Seven days points to a
free personal team. Set the paid team in `ios/signing.local.xcconfig` and run
`npm run ipad:install`. If the iPad reports that the application identifier does
not match, the installed copy belongs to another team and has to be deleted first,
which also deletes that copy's local data.

### The app is not trusted or Developer Mode is unavailable

Initiate the wired pairing in Xcode first. iPadOS only exposes Developer Mode
after a development pairing has started. Then enable Developer Mode in Privacy
& Security and restart the iPad.

## Pencil and finger workspace milestone

Open **Pencil · Notes** to enter notation with Pencil using large duration,
accidental, voice, rest and delete targets. Finger contact does not enter notes
in this mode. The full header and AI panel are hidden while the score and
essential entry controls stay visible.

Choose **Finger · Markings** to leave Note Input and open the ordinary notation
tools. Use a finger to select existing notes and apply markings, text and
barlines. AI and notation sidebars start closed on ordinary score opening;
explicit mode/panel controls open them. The AI panel remains independent.

Contact/refinement auditions a pitch once; releasing an unchanged Pencil pitch
does not replay it. Confirm this by listening on the physical device, including
refinement, rapid repeated notes, cancellation and orientation changes. Browser
pointer tests and instrument counters cannot certify that physical behavior.


## Native MIDI transport (September 2026)

`NexNoteBridgeViewController` registers `NativeMidiPlugin` from the app target.
It uses CoreMIDI for source enumeration, explicit source selection and MIDI 1
channel messages. It forwards timestamp age and copied packet bytes to the
shared TypeScript MIDI entry/recording code. The storyboard class and Xcode
source membership must survive `ipad:sync`. There are no native quantization or
score-mutation rules. A successful simulator build is not evidence of physical
USB/Bluetooth MIDI, Pencil or audio latency. See the dated note-entry report for
executed checks and pending hardware evidence.


The September finalization checks reconnect the paired iPad for device-info
inspection, but do not establish physical Pencil/touch or CoreMIDI event delivery.
Simulator compilation succeeds. Signing the current device build needs a valid
Xcode account for the development team and an `app.nexnote.ipad` development
profile; local certificates alone are insufficient. Keep team/account details
local and supply machine-specific build overrides without committing them.
The shared MIDI hook cancels recording on source replacement and discards stale
access callbacks. Hardware acceptance must still exercise real connect/reconnect,
rolled chords, count-in, stop/cancel and re-quantization on the signed app.

Final shared-payload verification passes `ipad:sync`, `ipad:doctor` and Xcode
simulator plus generic arm64 device compilation with `CODE_SIGNING_ALLOWED=NO`.
Unsigned device compilation does not permit installation or establish a
physical notation-entry pass. See the final gate manifest linked from the dated
note-entry quality report.
