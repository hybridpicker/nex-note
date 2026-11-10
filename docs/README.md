# Documentation Guide

This directory mixes current status docs, architecture docs, validation material, and a few historical handoff notes. Use this file to decide what is authoritative for a given question.

## Start Here

- Repository overview and local setup: [README.md](../README.md)
- Development guide (configuration, embedding, desktop/iPad apps, testing): [development.md](./development.md)
- User manual: [Deutsch](./user-manual.md), [English](./user-manual.en.md), [Français](./user-manual.fr.md), [Español](./user-manual.es.md), [中文](./user-manual.zh.md)
- Language/i18n developer note: [i18n.md](./i18n.md)
- Keyboard shortcuts: [keyboard-shortcuts.md](./keyboard-shortcuts.md)
- Contributor workflow: [CONTRIBUTING.md](../CONTRIBUTING.md)
- Multi-app development flow: [multi-app-development-flow.md](./multi-app-development-flow.md)
- Private iPad testing: [ipad-private-testing.md](./ipad-private-testing.md)
- Native macOS Xcode implementation prompt: [macos-xcode-private-testing-prompt.md](./macos-xcode-private-testing-prompt.md)
- Autonomous note-entry and arrangement completeness loop: [arrangement-note-entry-iteration-prompt.md](./arrangement-note-entry-iteration-prompt.md)
- Autonomous note-entry mastery loop (precision, speed and usability against MuseScore, Dorico and Finale): [note-entry-mastery-prompt.md](./note-entry-mastery-prompt.md)
- Note-entry mastery ledger (live work queue, gates, decisions, iteration log): [note-entry-mastery-ledger.md](./note-entry-mastery-ledger.md)
- Founder test file intake: [founder-test-file-intake.md](./founder-test-file-intake.md)

## Current Source Of Truth

- [final-release-readiness-summary.md](./final-release-readiness-summary.md)
  - Executive summary of public alpha and final-release readiness
  - Short version of the current recommendation and remaining release blockers

- [master-scorecard.md](./master-scorecard.md)
  - Conservative MuseScore-relative capability scores recorded before and after each product iteration

- [note-input-parity-matrix.md](./note-input-parity-matrix.md)
  - Row-by-row MuseScore/Finale-style Note Input status with implementation, evidence, acceptance criteria, and explicit remaining gaps

- [user-visible-audible-test-plan.md](./user-visible-audible-test-plan.md)
  - Manual regression matrix for user-visible and audible behavior

- [user-manual.md](./user-manual.md)
  - User-facing guide to importing, editing, playback, AI workflows, inspector tools, exports, and known limits
  - Available languages: [Deutsch](./user-manual.md), [English](./user-manual.en.md), [Français](./user-manual.fr.md), [Español](./user-manual.es.md), [中文](./user-manual.zh.md)

- [keyboard-shortcuts.md](./keyboard-shortcuts.md)
  - Current keyboard and mouse shortcuts plus MuseScore/Finale-inspired shortcut gaps

- [i18n.md](./i18n.md)
  - How to add translation keys and future app languages

- [ai-song-source-catalogs.md](./ai-song-source-catalogs.md)
  - Architecture and QA specification for rights-safe known-song catalog import
  - Source-provider candidates, license gate rules, and required tests before enabling

- [founder-test-file-intake.md](./founder-test-file-intake.md)
  - Rights-safe real file intake rules and compatibility tracking template

## Architecture And Design

- [architecture-blueprint.md](./architecture-blueprint.md)
  - Target architecture, migration path, and module boundaries

- [migration-status.md](./migration-status.md)
  - What already runs through the core path versus what is still transitional

- [validator-severity.md](./validator-severity.md)
  - Severity conventions for score diagnostics

- [smart-ghost-note.md](./smart-ghost-note.md)
  - Focused concept note for ghost-note input behavior

- [note-input-architecture.md](./note-input-architecture.md)
  - Canonical interactive edit-map architecture for deterministic mouse/keyboard note entry
  - Also defines accidental carry, written-glyph separation, enharmonic respelling, tie expansion, paired TAB policy, and strict diagnostic invariants

## Historical Or Roadmap Context

- [phase-roadmap.md](./phase-roadmap.md)
  - Initial Phase 1 to Phase 5 delivery roadmap
  - Useful for intent and sequencing
  - Not the current progress tracker

- [next-session-manual-test-plan.md](./next-session-manual-test-plan.md)
  - Historical validation checklist and findings log from a prior release-hardening session

## Rule Of Thumb

- If you want to know what the repo is trying to become, read the architecture blueprint.
- If you want to know whether a workflow is supposed to be release-ready, read the release summary and manual test plan.
- If you want the exact current Note Input claim, read the parity-matrix row and its acceptance evidence before relying on a scorecard percentage.
