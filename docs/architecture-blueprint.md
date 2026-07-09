# Architecture Blueprint

Related planning docs:

- [Product roadmap phases](./phase-roadmap.md)
- [AI song source catalogs](./ai-song-source-catalogs.md)

## Purpose

`nex-note` should evolve from an AI-assisted MusicXML patcher into an AI-first notation platform with its own score core.

The current architecture is useful and shippable, but it is transitional:

- MusicXML is still a compatibility boundary in several workflows.
- Some `ScoreCommand` mutations still rely on transitional XML helpers.
- Undo/redo is baseline-plus-command replay, but not yet a fully reversible transaction log.
- AI now receives structured score context, workflow-specific guidance, and preview-first confirmation for risky edits.
- Selection identity is increasingly core-based, while rendering still depends on OSMD details.

This document defines the target architecture, the migration path, and the module boundaries for this repository without requiring a big-bang rewrite.

## Current State

Today the key seams are:

- UI and editor live in `app/`, `components/`, and `hooks/`
- mutation logic lives in `lib/score-commands.ts`
- note-level XML edits live in `lib/note-editor.ts`
- XML application endpoint lives in `app/api/apply-operations/route.ts`
- AI command generation lives in `app/api/chat/route.ts` and `lib/prompts.ts`
- document history lives in `hooks/useScoreDocument.ts`
- rendered selection is coupled to OSMD in `components/ScoreEditor.tsx`

That gives us a strong starting point, because there is already a command vocabulary and a document workflow. The main issue is no longer the absence of a semantic core, but the coexistence of semantic execution and compatibility layers while the migration is still in flight.

## Migration Snapshot

The repository has already crossed several important seams toward the target state:

- `ScoreDocumentModel` now carries first-class semantic objects for slurs, beams, tuplets, chord groups, grace notes, lyric lines, and layout hints.
- `src/score-core/commands/apply-document-commands.ts` is the canonical write entry point for supported edits.
- MusicXML import/export roundtrips these semantic objects and is guarded by golden fixtures.
- editor selection carries core entity IDs and range metadata instead of only renderer-local note handles.
- undo/redo replays command history from a baseline document instead of snapshotting every command.
- AI context includes selection, workflow routing, and affected-measure reporting for planned edits.
- common multi-voice `<backup>/<forward>` MusicXML imports can now stay on the core path; remaining fallback is reserved for still-unsafe roundtrip tags.
- mouse note-input snapping now runs through `src/score-core/GeometryProxy.ts` plus `src/score-core/rhythm-utils.ts`, with OSMD kept as a render adapter instead of the live hit-testing source of truth.
- renderer-agnostic layout snapshots now carry lyric and direction text-length metrics so minimum/ideal measure widths and system reflow respond to actual content demand rather than object counts alone.
- lyric layout snapshots distinguish total syllable events from unique verse depth, allowing horizontal density and vertical staff spacing to use the correct independent metrics.
- layout-hint resolution now has deterministic cascade semantics: latest measure, then part/staff specificity, then latest equal-specificity edit.
- collision-spacing policy is no longer passive metadata: validated `balanced`, `relaxed`, and `open` hints use that cascade, feed each measure plan, raise explicit vertical spacing floors, and aggregate conservatively into the system render bridge.
- note input now has an explicit `score-input` pipeline:
  - canonical `InteractiveEditMap` for visible slot/pitch-lane resolution
  - central `ResolvedEditTarget` model for both preview and commit
  - shared commit mapping for pointer and keyboard input

The migration plan below should therefore be read as an active path from today's mixed architecture, not as a greenfield proposal.

## Official Architecture Goal

The long-term product goal is:

1. Core score state is represented in a stable internal notation model.
2. MusicXML becomes an import/export format, not the canonical in-memory model.
3. All editing, validation, undo/redo, AI planning, and renderer mapping operate on the core model.
4. Rendering is a replaceable adapter, not an architectural dependency.

## Target Repository Shape

The repo can stay in one package initially, but code should move toward these module boundaries:

```text
app/
  api/
  page.tsx
components/
hooks/

src/
  score-core/
    model/
    ids/
    commands/
    transactions/
    validation/
    normalize/
    selection/
  musicxml-adapter/
    import/
    export/
    mapping/
  nex-note/
    intent/
    planning/
    command-generation/
    repair/
    context/
    song-sources/
  render-bridge/
    osmd/
    mapping/
    hit-testing/
  score-input/
    types/
    edit-map/
    pointer-resolver/
    keyboard-resolver/
    commit-resolver/
  shared/
    schemas/
    errors/
    utils/

test-scores/
  fixtures/
  golden/
  roundtrip/
```

This can later become `packages/*`, but the migration should continue optimizing for architecture, not monorepo overhead.

## Target Core Model

Introduce a score document model with stable IDs and explicit semantic structure:

```ts
type ScoreId = string;
type EntityId = string;

interface ScoreDocumentModel {
  score: ScoreNode;
  index: ScoreIndex;
  metadata: ScoreMetadata;
  revision: number;
}

interface ScoreNode {
  id: ScoreId;
  parts: PartNode[];
  systems?: SystemLayoutHint[];
  pages?: PageLayoutHint[];
}

interface PartNode {
  id: EntityId;
  staves: StaffNode[];
  instrument?: InstrumentConfig;
  labels: PartLabels;
}

interface StaffNode {
  id: EntityId;
  measures: MeasureNode[];
}

interface MeasureNode {
  id: EntityId;
  measureNumber: number;
  attributesTimeline: MeasureAttributes[];
  voices: VoiceNode[];
  directions: DirectionNode[];
  barlines: BarlineNode[];
}

interface VoiceNode {
  id: EntityId;
  events: TimedEvent[];
}
```

Core design rules:

- every durable entity gets a stable ID
- voice timelines are explicit, not inferred from XML order
- semantic and visual/layout data are separated
- references use IDs, not only `measure/staff/voice/timestamp`
- chords, tuplets, ties, slurs, lyrics, repeats, endings, and transposition are first-class

## Command Model

The existing `ScoreCommand` idea should be kept, but redefined around the core model.

Command families:

- `content` for notes, rests, chords, lyrics
- `notation` for ties, slurs, articulations, dynamics, tuplets
- `structure` for measures, voices, parts, repeats, endings
- `attributes` for clef, key, time, transposition
- `layoutHints` for breaks and display metadata

Each command should define:

- `type`
- `schemaVersion`
- `target`
- `payload`
- `preconditions`
- `inverse` or deterministic undo metadata

Suggested wire shape:

```ts
interface ScoreCommandEnvelope<TType extends string, TPayload> {
  type: TType;
  schemaVersion: 1;
  commandId: string;
  target: CommandTarget;
  payload: TPayload;
}
```

Near-term rule: no new edit feature should introduce direct XML mutation outside the centralized command execution path.

## Known-Song Source Boundary

Known-song notation requests such as `notiere die Melodie von ...` are a separate source-ingestion workflow, not a generic chat-completion task.

Target boundary:

- `src/nex-note/song-sources/` owns provider adapters, candidate normalization, source metadata, and license gates.
- The AI planner may classify the request and summarize candidate choices, but it must not reproduce exact known-song melodies from model memory when no allowed source is available.
- Allowed symbolic sources enter the existing MusicXML/core import path or a dedicated converter adapter, then produce validated core state or command batches.
- Unknown, copyrighted, paywalled, or unverified sources stay blocked until the user provides an importable file or an allowed source.

Detailed provider candidates, source rules, and required tests live in [ai-song-source-catalogs.md](./ai-song-source-catalogs.md).

## Validation And Normalization

Add two distinct layers in `score-core`:

- validators: determine whether notation is inconsistent or invalid
- normalizers: rewrite into preferred canonical form when safe

Initial validator set:

- measure balance
- voice consistency
- tie continuity
- repeat/ending consistency
- clef/key/time change continuity
- transposition consistency
- lyric syllabic continuity

Initial normalizer set:

- rest distribution cleanup
- voice cleanup
- beam grouping defaults
- direction placement defaults
- enharmonic resolution policy

The command engine should return both:

- applied changes
- diagnostics and repair suggestions

## AI Architecture

The current AI route sends only the user instruction and expects commands back. That is intentionally lightweight, but it will not scale.

Target AI pipeline:

1. Intent parsing
2. Context assembly
3. Planning
4. Command generation
5. Validation
6. Repair pass
7. User-facing explanation

The AI should consume structured context packets instead of full XML:

- score summary
- active selection
- selected melody context when a passage or voice is already implied by the editor state
- primary voice detection for whole-score musician requests like "arrange this melody"
- compact melodic previews and optional ABC snippets as secondary readable projections
- affected measures
- parts/staves involved
- rhythmic and tonal context
- validation warnings already known
- available command capabilities

This is the critical shift from "LLM guesses edits" to "LLM plans semantic score operations."

## Arrangement Engine Slice

The first deterministic arrangement subsystem now lives under `src/nex-note/arrangement/` and is intentionally split into four layers:

1. `spec.ts`
2. `style-packs/*`
3. `critic/*`
4. `evals/*`

The current MVP focus is not full realization yet, but the contract that later planners must satisfy:

- `ArrangementSpec` is the typed handoff between chat intent, harmonic planning, voicing, and notation realization
- spelled pitch objects are first-class so critic rules can reason about notation-aware intervals instead of only MIDI numbers
- style packs (`classical-basic`, `generalbass`, `jazz-close`) define defaults and critic policy instead of burying style logic inside one large prompt
- the critic is deterministic TypeScript and currently starts with perfect-parallel detection, producing structured `CriticIssue` reports
- `scripts/eval-critic.tsx` runs a seeded MVP eval suite so arrangement-rule changes can be measured outside the chat pipeline

The next slice is now present as well:

- planner contracts are typed explicitly (`PlannerResponse`, `HarmonicPlanCandidate`, `VoicingCandidate`) so LLMs can be constrained to emit structured JSON instead of free-form prose
- fixture-backed planner responses live alongside the critic so development stays decoupled from model latency and prompt instability
- the critic now covers:
  - parallel perfect intervals
  - voice range
  - voice crossing / spacing
  - doubled leading tones in classical dominant sonorities
  - unresolved leading tones across slices

This keeps the architecture contract-first:

1. planner emits structured harmonic + voicing candidates
2. deterministic critic scores and rejects violations
3. only then does later orchestration decide whether to repair, accept, or realize the candidate into score commands

## Render Bridge

OSMD should remain useful, but it should sit behind a render bridge.

Responsibilities of `render-bridge/osmd`:

- convert core entities into render-facing references
- map rendered glyphs back to core IDs
- expose hit-testing and selection helpers
- isolate OSMD-specific coordinate and SVG logic

Responsibilities that should not stay in the renderer layer:

- score truth
- edit semantics
- selection identity
- undo/redo

The current `measure/staff/voice/timestamp` locator can remain as a compatibility locator during migration, but core IDs should become the primary selection identity.

## Migration Plan

### Stage 1: Stabilize The Transitional Architecture

Keep current behavior, but make it explicit and safer.

- document this repo as a transitional XML-backed architecture
- inventory all existing commands in `score-commands.ts` and `note-editor.ts`
- add schema validation for command payloads at API boundaries
- centralize all XML mutation behind one execution module
- expand regression coverage for import, undo/redo, export, and multi-voice edge cases

Concrete repo changes:

- create `src/shared/schemas/score-command.ts`
- create `src/score-core/commands/legacy-xml-executor.ts`
- make `app/api/chat/route.ts` and `app/api/apply-operations/route.ts` validate commands before applying
- make `hooks/useScoreDocument.ts` call one command-application service instead of importing raw XML mutators

### Stage 2: Introduce The Core Model Beside XML

Add the new model without removing current features.

- create `src/score-core/model/*`
- create `src/musicxml-adapter/import/*`
- import MusicXML into `ScoreDocumentModel`
- keep exporting back to MusicXML for preview/download
- store both `coreDocument` and `sourceXml` during the transition

Compatibility rule:

- preview/export may still render from XML initially
- editing starts to execute against core where implemented
- unsupported edits may temporarily fall back to legacy XML execution

### Stage 3: Move Commands To Core Execution

- add `applyCoreCommands(document, commands)`
- port command families incrementally
- keep legacy XML executor only for commands not yet migrated
- move undo/redo to command transactions or core snapshots

Recommended order:

1. metadata and attributes
2. structural edits
3. note and rest content edits
4. directions and notation details

### Stage 4: Introduce Diagnostics, Repair, And AI Context

- surface validator output in the editor
- include diagnostics in AI planning context
- add preview-before-apply for ambiguous requests
- add repair passes after command generation

### Stage 5: Detach The Renderer

- create render bridge IDs for rendered notes and measures
- stop deriving selection identity from OSMD-only objects
- treat OSMD as a consumer of mapped score state
- evaluate whether professional layout needs exceed OSMD over time

## Recommended First Refactors In This Repo

These are the highest-value low-regret moves from the current codebase:

1. Extract command schemas and validation from `lib/score-commands.ts` into a dedicated module.
2. Introduce one `applyDocumentCommands()` service that all UI and API paths use.
3. Split note-edit command definitions from XML mutation code.
4. Add an internal `ScoreDocumentModel` type and a MusicXML importer behind a feature flag.
5. Change AI prompting to send structured score summaries and selection context, not only the raw instruction.

## Immediate File Mapping

Suggested first-step mapping from current files to future ownership:

- `lib/score-commands.ts`
  move toward command types plus compatibility wrappers
- `lib/note-editor.ts`
  shrink into legacy MusicXML adapter behavior
- `hooks/useScoreDocument.ts`
  become document transaction state, not XML-only history
- `app/api/chat/route.ts`
  become AI orchestration over planner context and command validation
- `components/ScoreEditor.tsx`
  become renderer host plus render-bridge integration

## Non-Goals For The First Migration

To keep momentum, the first architecture wave should not try to solve everything:

- no immediate renderer rewrite
- no full engraving engine
- no forced monorepo split on day one
- no attempt to support every advanced notation feature before the core model exists

## Definition Of Success

The migration is on track when these are true:

- new edits can be added without writing ad hoc XML logic in random places
- undo/redo operates on semantic document state
- AI receives structured musical context
- import and export are adapters, not the core
- renderer coupling no longer dictates editor architecture

At that point, `nex-note` stops being a clever XML editor and becomes a real notation platform foundation.
