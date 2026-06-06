# Founder Test File Intake

Use this page when collecting real compatibility files from founder testers. nex-note testing is for private, lawful score and tab workflows only.

## How To Submit Files

Founder testers should email or share files only after confirming the legal source for each file. For every submitted score, tab, MIDI, PDF, photo, or scan, include:

- the original filename and format
- the source of the file
- the rights basis: own, self-created, licensed, or public-domain
- the workflow you expect nex-note to support
- any known import/export problems in other notation tools

## Allowed Files

Founder testers may submit:

- scores they own
- scores they created themselves
- scores they are licensed to process
- public-domain scores

Do not submit copyrighted files without permission. Do not submit material that would require nex-note to copy, convert, distribute, or commercialize someone else's work without rights.

## Formats To Test

- MusicXML and XML: primary supported exchange format.
- MXL: compressed MusicXML import/export path.
- MSCZ: experimental MuseScore CLI-dependent import/export path.
- GuitarPro: experimental importer tooling for `.gp`, `.gp4`, `.gp5`, `.gp6`, and `.gpx`.
- MIDI: experimental import reconstruction; MIDI export/playback paths are further along.
- PDF and photos: review-required assisted workflow. Do not expect perfect conversion, and always validate the result manually.
- NXN projects: local nex-note working project format for app testing.

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
- Validation result:
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
