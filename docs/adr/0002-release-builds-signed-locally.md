# Release builds are signed and notarized on the owner's Mac, not in CI

The Developer ID certificate and the Apple notarization credentials stay in the owner's macOS Keychain. A Release is therefore built, signed, notarized and uploaded by a local script on that Mac, triggered from a version tag on `main`, rather than by a hosted CI pipeline that would need copies of those secrets.

## Consequences

Releases depend on the owner's Mac being available. The unsigned Developer DMG (`npm run dmg:latest`) remains a separate, developer-only build.
