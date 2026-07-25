# Changelog

All notable changes to nex-note are documented here.

## 0.0.3 - 2026-07-25

### Fixed

- Arrow Up and Arrow Down now repitch the active existing note by one chromatic semitone per press in Note Input, even when input-by-duration is armed, while preserving prepared-pitch navigation when no existing pitched note is active.

### Validation

- All 992 unit and integration tests pass.
- The focused browser regression and the Next.js production build pass.

## 0.0.2 - 2026-07-23

### Changed

- Added MuseScore-style multi-note selection feedback so every selected chord tone remains visibly active.
- Added live ghost-note feedback while dragging notes vertically.
- Changed replace dragging to repitch the addressed note or chord tone in place instead of creating another event.
- Restored first-note and repeated multi-note mouse entry, including Guitar + TAB synchronization.
- Improved contextual TAB voicing and standard-notation octave mirroring.
- Prevented menus, dialogs, and other interactive overlays from leaking pointer events into the score.
- Upgraded Next.js to 16.2.11 and refreshed security overrides; the production dependency audit is clean.

### Validation

- 991 unit and integration tests pass.
- Coverage gates pass at 85.59% lines, 78.13% branches, and 86.74% functions.
- The production build and all 30 browser smoke tests pass.
- Long-form chord and score-transformation stress workflows pass with updated rhythmic-anchor fixtures.
- The MuseScore 4.7.3 roundtrip harness exits successfully with `passed-with-local-musescore-limit`; the local MuseScore installation remains intermittently crash-unstable on source baselines.
