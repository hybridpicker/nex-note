# AI Song Source Catalogs

Status: architecture and QA specification. Catalog import is not implemented as a runtime feature yet.
Current runtime behavior blocks exact known-song notation requests and recognizable variations/adaptations without an uploaded or otherwise verified source, so the assistant does not fall back to model-memory notation or invented license claims.

## Goal

`nex-note` should support requests such as `notiere die Melodie von Kumbaya` by importing an allowed symbolic source, not by asking a model to guess the melody from memory.

The assistant can still compose new original material from a style brief. Exact known-song notation, recognizable variations, and adaptations must go through a source adapter, a license gate, and a user-visible source choice before commands are applied to the score.

## Rights-Safe Product Rules

- Default to blocked when source rights are unknown, ambiguous, paywalled, or not machine-checkable.
- Allow only sources marked public domain, CC0, CC BY, CC BY-SA, or another explicit license compatible with import, editing, export, and playback.
- Preserve source metadata in the score/session: title, source URL, provider, license label, arranger/editor when available, and import timestamp.
- Show the selected source and license label before applying a known-song import.
- Do not use an LLM to reproduce an exact modern melody from memory.
- Do not bypass login, paywalls, subscription restrictions, download throttling, robots controls, or provider terms.
- Do not import lyrics by default. Lyrics need the same explicit rights gate as notation.
- Treat user uploads as user-provided material. The app may import them, but it should not redistribute the source file or claim catalog clearance.

## Candidate Source Providers

| Provider | Best Use | Format Path | Adapter Risk | Gate Requirement |
| --- | --- | --- | --- | --- |
| [ABC Notation Tune Search](https://abcnotation.com/search) | Folk, traditional, session tunes, hymns with ABC/MusicXML links | ABC or MusicXML -> core import | Medium, because indexed tunes come from many collections | Per-tune source/license must be visible or allowlisted before import |
| [OpenScore](https://musescore.org/en/user/57401/blog/2017/01/11/introducing-openscore) | Public-domain classical scores already digitized | MusicXML/MuseScore/MIDI -> core import | Low | Accept only OpenScore/public-domain or compatible Creative Commons entries |
| [PDMX](https://github.com/pnlong/PDMX/) | Large offline symbolic corpus for public-domain MusicXML search | Indexed MXL/MusicXML -> core import | Medium | Use only `no_license_conflict` and valid MusicXML/MXL subsets |
| [Mutopia](https://www.mutopiaproject.org/legal.html) | Public-domain/Creative-Commons classical and educational repertoire | LilyPond/MIDI -> converter -> MusicXML/core | Medium | Preserve CC/PD attribution and share-alike flags |
| [IMSLP](https://imslp.org/) | Public-domain classical source discovery | MusicXML attachment preferred; PDF -> OMR only when needed | High | Require explicit public-domain status and prefer symbolic files over scans |
| [CPDL](https://www.cpdl.org/) | Choral and vocal public-domain repertoire | MusicXML/source format/PDF -> core import | Medium to high | Require clear license/source metadata; lyrics remain separately gated |
| [Hymnary](https://hymnary.org/widgets) | Hymn metadata, tune identification, IDs | Metadata only unless a permitted score is separately obtained | Low as metadata; high for scores | Do not treat Hymnary metadata API as a score API |
| [Musopen](https://musopen.org/) | Classical public-domain/free sheet music discovery | Usually PDF/MIDI -> import/converter | Medium | Verify item-level permissions before import |
| User-provided file | Any user-owned or licensed material | MusicXML/MXL/MIDI/PDF -> existing import paths | Low for app workflow, unknown for redistribution | Import locally; no catalog clearance claim |

## Assistant Workflow

1. Classify the request.
   - Known-song exact notation, recognizable variation, or adaptation: source required.
   - Original composition: generate new material.
   - Existing uploaded score transformation: use current score context.
2. Search enabled providers.
3. Normalize results into `SongSourceCandidate` records.
4. Apply a license gate before any notation import.
5. Present candidates with title, provider, format, license, and confidence.
6. Import only after a candidate is selected or an unambiguous allowed candidate is confirmed.
7. Convert to core commands or directly hydrate a new score through MusicXML/core import.
8. Run validator and Notation Doctor gates.
9. Record source metadata in the session and exported project metadata.

Suggested candidate shape:

```ts
interface SongSourceCandidate {
  id: string;
  title: string;
  provider: string;
  sourceUrl: string;
  format: 'musicxml' | 'mxl' | 'abc' | 'midi' | 'lilypond' | 'pdf';
  licenseLabel: string;
  licenseUrl?: string;
  attribution?: string;
  rightsStatus: 'allowed' | 'blocked' | 'needs-review';
  importConfidence: 'high' | 'medium' | 'low';
}
```

## Quality Bar

- Search results are never applied silently when more than one plausible tune exists.
- Imported notation must validate without new rhythm or document errors before auto-apply.
- PDF/OMR imports must stay preview-first and require confirmation.
- The browser UI must expose source and license details before apply.
- Exports should preserve source attribution in project metadata where the format supports it.
- Provider adapters must use fixtures and mocked network responses in tests; browser tests should not depend on live catalog availability.

## Required Tests Before Enabling

- Unit: license gate allows public domain/CC0/CC BY/CC BY-SA and blocks unknown, copyrighted, paywalled, and missing-license candidates.
- Unit: source candidates normalize into stable `SongSourceCandidate` records.
- Unit: exact known-song requests do not fall back to model-memory notation when no allowed candidate exists.
- Unit: recognizable variation/adaptation requests over a known title do not fall back to model-memory notation when no allowed candidate exists.
- Integration: ABC/MusicXML candidate imports into `ScoreDocumentModel` and passes validation.
- Integration: PDF-only candidate stays preview-first and surfaces OMR confidence.
- Browser: `notiere die Melodie von Kumbaya` with mocked allowed candidates shows a source picker, imports the selected melody, shows attribution, and renders a valid score.
- Browser: a modern copyrighted-song request with no allowed source is blocked with a useful source-request message and no score mutation.
- Browser: multiple candidate versions require user selection before import.

## Implementation Notes

- Add provider adapters under `src/nex-note/song-sources/`.
- Keep catalog search server-side. Do not expose provider keys or private URLs to the client.
- Reuse existing MusicXML/MXL import first; add ABC and LilyPond converters behind explicit adapter modules.
- Keep raw source files out of saved projects unless the user explicitly imports a local file.
- Prefer direct symbolic formats over OMR. Use OMR only when no trusted symbolic source exists and the user confirms the preview.
