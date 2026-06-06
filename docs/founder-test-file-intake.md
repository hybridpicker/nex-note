# Founder Test File Intake

Use this page when collecting real compatibility files from founder testers. nex-note testing is for private, lawful score and tab workflows only.

## Allowed Files

Founder testers may submit:

- scores they own
- scores they created themselves
- scores they are licensed to process
- public-domain scores

Do not submit copyrighted files without permission. Do not submit material that would require nex-note to copy, convert, distribute, or commercialize someone else's work without rights.

## Current Format Expectations

- Supported now: MusicXML, XML, MXL, NXN projects, MIDI export/playback paths.
- Experimental: MSCZ through MuseScore CLI, GuitarPro through importer tooling, MIDI import reconstruction, ABC export.
- Review required: PDF, scans, photos, and image-based imports. These are assisted workflows, not guaranteed conversion.

## Private Fixture Convention

Keep founder files out of Git. Local private compatibility fixtures can live in:

```text
private-fixtures/
test/private-fixtures/
```

Both paths are ignored by Git. Store only local test copies there, and keep rights/source notes next to the files.

## Compatibility Tracking Template

Copy this template for each submitted file:

```markdown
## Compatibility Case

- File format:
- Source:
- Rights basis: own / self-created / licensed / public-domain
- Expected workflow:
- Import result:
- AI edit result:
- Export result:
- Embed result:
- Failure notes:
- Follow-up owner:
- Date tested:
```

## Intake Checklist

- Confirm the tester has rights to process the file.
- Record the original format and source.
- Test import before AI editing.
- Use AI preview-before-apply; do not apply blind changes.
- Validate the result before export or embed.
- Record whether export and private embed paths worked.
- Keep failure notes concrete enough to reproduce.
