# Release Readiness Summary

Updated: 2026-06-24

This file is the short executive summary; the detailed progress log is maintained privately.

## Recommendation

Current recommendation: `Go` for public alpha, `No-Go` for polished final desktop release.

The repository is strong enough to publish for local inspection, developer collaboration, and real MusicXML workflow testing. It should be described as a local-first alpha rather than a finished replacement for MuseScore, Dorico, Finale, Sibelius, or GuitarPro.

A tagged binary release still needs desktop packaging evidence, signing/notarization decisions, final icon validation, a manual user-visible smoke pass, and hardening of local-only debug/developer routes.

## Validated State

- `npm test`: passed on 2026-06-24 (`826` tests)
- `npm run build`: passed on 2026-06-24
- MuseScore CLI MusicXML -> MXL -> MusicXML smoke: passed on 2026-06-24 with `/Applications/MuseScore 4.app/Contents/MacOS/mscore`
- `npm run test:coverage:check`: last passed on 2026-05-13 (`84.96%` lines, `76.57%` branches, `85.33%` functions)
- `npm audit --audit-level=high`: last passed on 2026-05-13 (`0` vulnerabilities)
- release validation remained on the core-first command path; no parallel direct-XML edit route was introduced to work around the runtime issues
- tie placement for selected tie starts now runs through the semantic command path, is visible in the Inspector, and roundtrips through MusicXML

## Manual Validation Highlights

- inspector-driven semantic edits keep selection stable on `choir-lyrics.musicxml`
- real runtime click-targeting remains stable on `leadsheet-repeat.musicxml`
- true multi-voice runtime targeting remains stable on `temp-multi-voice-runtime.musicxml`
- follow-up note-input ghost calibration now stays anchored to the correct parallel part after entry

## Acceptable Remaining Limitations

- alpha users should expect local setup friction around AI providers, MuseScore CLI, Audiveris, and macOS-first desktop packaging
- some imported MusicXML still intentionally uses compatibility fallback when unsafe roundtrip tags remain present
- the local MuseScore CLI passed compressed-MusicXML roundtrip smoke, but a MusicXML -> MSCZ -> MusicXML smoke crashed while reopening the generated `.mscz`; native MSCZ validation remains a manual compatibility check
- articulation direction/placement still is not modeled as a first-class semantic edit; tie and slur placement are the implemented above/below controls
- chord input mode is available through the toolbar, `Shift+A...G`, and `Cmd/Ctrl+Shift+H`, but still lacks deeper desktop-style chord-editing polish
- tuplet quick-insert is exposed in the note-input toolbar for ratios 2:3 through 9:8, matching the existing `Cmd/Ctrl+2...9` semantic command path
- the existing Turbopack warning remains unchanged and non-blocking for release

## Before Final Release

- run `npm run electron:build` on macOS and verify the built app manually
- complete signing/notarization and final app icon validation
- run a manual smoke pass covering import, note input, playback, AI preview/apply, `.mxl` export, and a MuseScore round-trip
- remove, gate, or clearly document local-only debug/developer routes before distributing binaries
- keep public positioning explicit: MusicXML companion and MuseScore-adjacent workflow tool, not a full notation-suite replacement

## Related Docs

- Manual regression matrix: [user-visible-audible-test-plan.md](./user-visible-audible-test-plan.md)
- Architecture direction: [architecture-blueprint.md](./architecture-blueprint.md)
