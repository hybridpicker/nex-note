# Toolbar Icon Export

Exportierte SVGs der früheren Toolbar-Icons vor dem v2-Refresh.

Ordner:
- `notation-toolbar/` aus `components/NotationToolbar.tsx`
- `note-input-toolbar/` aus `components/NoteInputToolbar.tsx`
- `edit-palette/` aus `components/EditPalette.tsx`

Hinweise:
- Die SVGs verwenden bewusst `currentColor`, damit du sie leicht in Design-Tools oder im Code einfärben kannst.
- Das ist ein statischer v1-Snapshot. Die App nutzt inzwischen die überarbeiteten v2-Formen aus `design/v2/README.md`, rendert sie aber weiterhin als inline-SVG in den React-Komponenten statt als Datei-Import.
