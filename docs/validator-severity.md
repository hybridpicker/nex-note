# Validator Severity Conventions

This document defines how `nex-note` score diagnostics should use `info`, `warning`, and `error`.

The validator is part of the semantic score core. Its job is to protect `ScoreDocumentModel`, command replay, and downstream layout/export flows from silent drift. MusicXML remains an import/export boundary, so severity should reflect semantic risk in the core document rather than quirks of any single XML source.

## Severity Rules

### `error`

Use `error` when the score core is structurally invalid or mathematically impossible enough that downstream editing, replay, or layout cannot be trusted.

Typical cases:

- missing required structural containers
- invalid measure numbering invariants
- impossible time signature values

Current `error` diagnostics:

- `no_parts`
- `no_staves`
- `invalid_measure_number`
- `invalid_time_signature`

### `warning`

Use `warning` when the score remains loadable, but notation semantics are incomplete, suspicious, or likely to cause incorrect editing, playback, export, or layout.

Typical cases:

- rhythm coverage or overlap problems
- tie, lyric, tuplet, repeat, and ending inconsistencies
- references to unknown semantic entities
- layout hints outside sane ranges

Current `warning` diagnostics include:

- `missing_core_document`
- `measure_order`
- `key_range`
- `transpose_range`
- `empty_voice`
- `voice_overlap`
- `measure_balance`
- `voice_timeline_gap`
- `voice_duration_mismatch`
- `multi_voice_rhythm_gap`
- `tie_continuity`
- `lyric_continuity`
- `dangling_tuplet`
- `tuplet_span_short`
- `tuplet_voice_mismatch`
- `tuplet_count_mismatch`
- `repeat_end_without_start`
- `ending_without_repeat`
- `duplicate_ending_start`
- `ending_stop_without_start`
- `dangling_lyric_line`
- `invalid_layout_hint`

### `info`

Use `info` only for non-corruption signals about execution behavior or system routing, not for score validity.

Examples already used outside the validator:

- `core_execution`
- `legacy_fallback`

The validator itself currently emits no `info` diagnostics.

## Guidance For New Diagnostics

Choose the lowest severity that still protects replay, editing, layout, and export.

- Prefer `error` only when the core document breaks hard invariants.
- Prefer `warning` for semantic incompleteness that should block trust, but not basic loading.
- Prefer `info` for operational transparency rather than notation defects.

If a new notation object is added in Phase 2 or Phase 3, add its diagnostic code to the shared severity map in `src/score-core/validation/validate-score-document.ts` and cover the expected level in tests.
