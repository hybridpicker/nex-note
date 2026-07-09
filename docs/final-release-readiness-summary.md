# Release Readiness Summary

Updated: 2026-07-09

This file is the short executive summary; the detailed progress log is maintained privately.

## Recommendation

Current recommendation: `Go` for public alpha, `No-Go` for polished final desktop release.

The repository is strong enough to publish for local inspection, developer collaboration, and real MusicXML workflow testing. It should be described as a local-first alpha rather than a finished replacement for MuseScore, Dorico, Finale, Sibelius, or GuitarPro.

A tagged binary release now has macOS packaging build evidence, but still needs signing/notarization decisions, final icon validation, a manual user-visible built-app smoke pass, and hardening of local-only debug/developer routes.

## Validated State

- `npm test`: passed on 2026-07-09 (`883` tests, `0` failed)
- `npm run build`: passed on 2026-07-09; Next 16.2.6 compiled, TypeScript completed, and `postbuild` synced standalone assets
- `npm run test:e2e:notation-tools`: passed on 2026-07-09 (`11` tests, `0` failed)
- `npm run test:e2e`: passed on 2026-07-04 (`109` passed, `4` skipped, `31.5m`)
- `npm run electron:build`: passed on 2026-07-09; produced unsigned macOS arm64 zip/DMG artifacts under `dist/macos`
- MuseScore CLI roundtrip harness: `npm run smoke:musescore-roundtrip` completed on 2026-07-04 with exit `0` and verdict `passed-with-local-musescore-limit` using `/Applications/MuseScore 4.app/Contents/MacOS/mscore` 4.7.3; artifacts were written under `.nex/musescore-roundtrip-smoke-2026-07-04T21-31-22-795Z`
- `npm run test:coverage:check`: last passed on 2026-05-13 (`84.96%` lines, `76.57%` branches, `85.33%` functions)
- `npm audit --audit-level=high`: last passed on 2026-05-13 (`0` vulnerabilities)
- release validation remained on the core-first command path; no parallel direct-XML edit route was introduced to work around the runtime issues
- tie placement for selected tie starts and articulation/fermata placement for selected notes now run through the semantic command path, are visible in the Inspector, and roundtrip through MusicXML
- core MusicXML export now keeps root-level metadata elements in MusicXML order and no longer appends an empty trailing `<identification/>` after `<part>`
- note-input hardening now keeps ghost, commit, selection, and playback anchors aligned across whole-rest measures, rest-only internal slots, cross-measure pointer sequences, TAB fret entry, and clicked-note step-time activation
- live MIDI step input now batches simultaneous note-on messages into one semantic chord transaction, follows the active key signature for sharp/flat spelling, and advances once per played onset
- automatic horizontal layout now measures long lyric and direction text demand instead of treating every text object as equal width; text-heavy measures gain hard/ideal width and trigger earlier system reflow while existing reference-score fingerprints remain stable
- vertical lyric spacing now follows unique verse depth rather than total syllable count, keeping long vocal passages compact while reserving aligned space for each stacked verse
- manual staff-spacing hints now cascade predictably: the newest applicable measure wins, specific part/staff values beat global values at the same location, and repeated edits honor the latest value
- manual collision-spacing policies are now effective end to end: `Balanced`, `Relaxed`, and `Open` Inspector actions persist as validated semantic hints, cascade by measure and specificity, and control render-bridge spacing without changing automatic layout defaults

## Manual Validation Highlights

- inspector-driven semantic edits keep selection stable on `choir-lyrics.musicxml`
- real runtime click-targeting remains stable on `leadsheet-repeat.musicxml`
- true multi-voice runtime targeting remains stable on `temp-multi-voice-runtime.musicxml`
- follow-up note-input ghost calibration now stays anchored to the correct parallel part after entry
- step-time anchor validation artifacts were captured under `artifacts/qa/step-time-anchor-validation/`, covering whole-rest insertion, rejected invalid internal hovers, and TAB fret mirroring
- the rebuilt packaged app exposes the live MIDI control, grants its own local renderer MIDI access, and reaches the visible “Waiting for a MIDI input device” state; a physical controller was not attached for this pass

## Acceptable Remaining Limitations

- alpha users should expect local setup friction around AI providers, MuseScore CLI, Audiveris, and macOS-first desktop packaging
- some imported MusicXML still intentionally uses compatibility fallback when unsafe roundtrip tags remain present
- the MuseScore harness distinguishes source-baseline crashes, app-style MXL reopen checks, and MSCZ create/reopen checks; on this machine MuseScore 4.7.3 still SIGABRTs intermittently with `std::__1::system_error: mutex lock failed: Invalid argument`, including source-baseline runs, so native MusicXML/MXL/MSCZ parity remains an accepted local-tool limitation until verified on a stable MuseScore install
- broader direction placement is still intentionally conservative: selected articulations, fermatas, ties, and slurs have above/below controls, while other direction types need targeted UI before they should be advertised as desktop-parity editing
- chord input mode is available through the toolbar, `Shift+A...G`, and `Cmd/Ctrl+Shift+H`, but still lacks deeper desktop-style chord-editing polish
- tuplet quick-insert is exposed in the note-input toolbar for ratios 2:3 through 9:8, matching the existing `Cmd/Ctrl+2...9` semantic command path
- the existing Turbopack warning remains unchanged and non-blocking for release

## Before Final Release

- verify the built macOS app manually after `npm run electron:build`
- complete signing/notarization and final app icon validation
- run a manual smoke pass covering import, note input, playback, AI preview/apply, `.mxl` export, and a MuseScore round-trip
- rerun `npm run smoke:musescore-roundtrip` on a stable MuseScore CLI install before treating MSCZ compatibility as release-quality evidence
- remove, gate, or clearly document local-only debug/developer routes before distributing binaries
- keep public positioning explicit: MusicXML companion and MuseScore-adjacent workflow tool, not a full notation-suite replacement

## Related Docs

- Manual regression matrix: [user-visible-audible-test-plan.md](./user-visible-audible-test-plan.md)
- Architecture direction: [architecture-blueprint.md](./architecture-blueprint.md)
