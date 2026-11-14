# Contributing to nex-note

`nex-note` is a Next.js app for semantic MusicXML editing. The repo already contains a substantial amount of product, architecture, and validation context; this guide is the shortest path to contributing without getting lost in the historical docs.

## Start Here

- Repository overview: [README.md](./README.md)
- Documentation map: [docs/README.md](./docs/README.md)
- Target architecture: [docs/architecture-blueprint.md](./docs/architecture-blueprint.md)

## Environment

Core requirements:

- Node.js `20.9+`
- npm

Optional local tooling for feature-complete development:

- Ollama for local AI editing
- Audiveris for PDF import
- MuseScore 4 for MSCZ/GuitarPro import, MIDI export, ABC export, and practice-pack export

Current maintainer workflow is macOS-first:

- `npm run dev` auto-opens a browser via macOS `open`
- default local app paths in docs assume `/Applications/Audiveris.app` and `/Applications/MuseScore 4.app`

If you are not on macOS, start the dev server manually:

```bash
npm run dev -- --no-open
```

## Setup

```bash
git clone https://github.com/hybridpicker/nex-note.git
cd nex-note
git switch devel
npm install
cp .env.local.example .env.local
```

Fill in only the provider keys you actually want to use. Unconfigured providers remain disabled in the UI.

## Branch And Version Workflow

- Use `devel` for normal development, including local macOS app work, Electron packaging, and alpha hardening.
- Keep `main` for published alpha snapshots.
- When a development cycle is ready, merge `devel` into `main` and bump the alpha patch version from `0.0.x` to the next value.
- The first public alpha is `0.0.1`; the next release snapshot should be `0.0.2`.
- Update both `package.json` and `package-lock.json` in the same version bump.

## Common Commands

```bash
npm test
npm run test:coverage
npm run test:coverage:check
npm run test:e2e:smoke
npm run test:e2e:regression
npm run build
npm run harness:capture-real-cli
npm run harness:metrics -- .nex/harness-real-cli-events-YYYY-MM-DD.jsonl
```

## What To Run Before Opening a PR

- Start with `npm run apps:plan`; shared code changes affect the browser,
  Electron macOS, native iPad, and the planned Xcode macOS surface.
- Docs-only changes: read the rendered Markdown, check links, and make sure claims match the repository state.
- Small code changes: run the focused tests that cover the touched area.
- Editor, renderer, AI pipeline, import/export, or history changes: run `npm test` and `npm run build`.
- Shared user-visible or native-access changes: run `npm run ipad:sync` and
  `npm run ipad:doctor`, then smoke-test a paired physical iPad when available.
- Electron-visible, packaged-runtime, dependency, asset, or file-handling
  changes: run `npm run electron:refresh`.
- Once the Xcode macOS target exists, run its sync, doctor, Xcode build, and
  real-app smoke workflow for affected shared changes.
- Release-sensitive workflow changes: also run the relevant Playwright suite and update the validation docs if behavior changed.

The full surface matrix and handoff rules are documented in
[docs/multi-app-development-flow.md](./docs/multi-app-development-flow.md).
Run `npm run hooks:install` to include the app-surface plan in the repository's
pre-commit checks. The post-commit hook then builds a DMG of each new commit in
the background (`npm run dmg:latest`, output `dist/dmg/Nex Note-latest.dmg`).

## Code Map

- App shell and route composition: `app/page.tsx`
- Rendering and score interaction: `components/ScoreEditor.tsx`
- Structured document state and history: `hooks/useScoreDocument.ts`
- Note-entry and direct editing flows: `hooks/useNoteEditor.ts`
- Canonical score model and command execution: `src/score-core/`
- MusicXML import/export boundary: `src/musicxml-adapter/`
- AI context, planning, repair, and workflows: `src/nex-note/`
- Transitional XML-era helpers: `lib/note-editor.ts` and `lib/xml-patcher.ts`

## Documentation Rules

- `docs/final-release-readiness-summary.md` is the short executive summary, not the detailed source of truth.
- `docs/phase-roadmap.md` describes the initial Phase 1 to Phase 5 roadmap only.
- Historical handoff/checklist docs should stay clearly marked as archival if they are no longer the active status source.
- If behavior, architecture boundaries, release status, or test expectations change, update the relevant docs in the same patch.

## Pull Request Checklist

- Keep new editing behavior on the semantic score-command pipeline whenever the core supports it.
- Do not introduce new direct XML mutation paths unless the repo already treats the path as a compatibility fallback.
- Add or update tests when behavior changes.
- Update docs when user-visible workflows, architecture ownership, or release evidence changes.
