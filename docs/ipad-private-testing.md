# Private iPad Testing

Nex Note has a native iPad test shell powered by Capacitor. It is not a PWA and
does not need App Store or TestFlight distribution for private development.

The native app connects to the Next.js development server on the Mac. This is
intentional: server-side AI, MIDI generation, and conversion routes keep running
on the Mac, while the iPad provides the native touch interface. Next.js Fast
Refresh sends saved code changes to the running iPad app.

The editor therefore needs the Mac server during private development, but it can
recover without force-quitting the iPad app. If the app opens before the server
is ready, its connection screen retries the exact generated LAN URL
automatically and provides a **Try again now** button. The Mac workflow also
checks `/api/native-health` before reusing a process, so an unrelated service on
the configured port is never mistaken for Nex Note.

## One-time Mac preparation

1. Keep at least 30 GiB of free disk space before installing Xcode and its iPadOS
   platform support.
2. Install the current Xcode release from the Mac App Store.
3. Start Xcode once, accept its license, and let it install required components.
4. If command-line tools still point at the standalone tools, run:

   ```bash
   sudo xcode-select -s /Applications/Xcode.app/Contents/Developer
   ```

5. In Xcode, open **Xcode > Settings > Accounts** and add the Apple Account used
   on the iPad. A paid Apple Developer Program membership is not required for
   testing on a personal device.
6. In the repository, install dependencies and run the doctor:

   ```bash
   npm install
   npm run ipad:doctor
   ```

## First physical iPad connection

1. Put the Mac and iPad on the same Wi-Fi network.
2. Connect the iPad to the Mac with a USB cable.
3. On the iPad, tap **Trust** if asked and enter the device passcode.
4. Start live development:

   ```bash
   npm run ipad:dev
   ```

   The command detects the Mac's LAN address, writes it only into the generated
   native debug configuration, synchronizes the iOS project, starts Next.js on
   `0.0.0.0`, and opens Xcode.

5. In Xcode, select the blue **App** project, then the **App** target, and open
   **Signing & Capabilities**.
6. Keep **Automatically manage signing** enabled and choose the personal team
   for the Apple Account.
7. Select the connected iPad as the run destination in the Xcode toolbar.
8. Press the Run button.
9. If iPadOS asks for Developer Mode, open **Settings > Privacy & Security >
   Developer Mode**, enable it, restart, and confirm. Run again from Xcode.
10. Accept the local-network permission when Nex Note asks for it.

## Normal daily loop

Run this command and keep the terminal open:

```bash
npm run ipad:dev
```

Then launch Nex Note on the iPad. Saved React, CSS, and server changes appear
through Fast Refresh. A native project rebuild is only needed when native
configuration, Capacitor packages, the app icon, or Swift code changes.

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
| `npm run ipad:doctor` | Check Xcode, disk space, LAN address, packages, and server reachability. |
| `npm run ipad:dev` | Synchronize, start live reload, and open Xcode. |
| `npm run ipad:sync` | Refresh native configuration without starting the server. |
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
iPad bundle or committed native configuration. Native requests use the
`NexNoteNative/<version>` user-agent so the private iPad app can access the same
server-side provider routes over the LAN while generic LAN/public browser
requests remain disabled.

When this access path changes, verify native model discovery or authentication
and separately verify that a generic LAN browser is still rejected.

If the Mac's IP address changes after switching Wi-Fi networks, run
`npm run ipad:dev` again and press Run once in Xcode. The app contains a local
connection-error screen for the case where the Mac server is not reachable.

## Current private-test boundaries

- The Mac must be awake, Nex Note's development server must be running, and both
  devices must be on the same LAN.
- The debug build deliberately permits unencrypted local-network HTTP. This
  exception is only for private live development and must be removed before any
  public distribution.
- Browser-based import through the iPad Files picker is available. Native
  document export/share behavior and microphone pitch entry should be verified
  on the physical iPad before treating them as complete.
- Do not add an automatic reload-on-resume that discards unsaved score state.
  Fast Refresh updates code while preserving component state when possible.

## Troubleshooting

### The app says that the Mac server is unreachable

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

### Xcode reports a signing error

- Confirm the Apple Account is present in Xcode settings.
- Choose the personal team under **Signing & Capabilities**.
- Leave automatic signing enabled.
- If the bundle identifier is already taken in that account, change
  `app.nexnote.ipad` to a unique reverse-domain identifier in
  `capacitor.config.ts`, regenerate the iOS project, and select the team again.

### The app is not trusted or Developer Mode is unavailable

Initiate the wired pairing in Xcode first. iPadOS only exposes Developer Mode
after a development pairing has started. Then enable Developer Mode in Privacy
& Security and restart the iPad.
