# Toolbar Icons — v2

Überarbeitete SVGs der Toolbar-Icons. Ausgang: `design/toolbar-icons-export/` (unangetastet).

Ordner wie im Original:
- `notation-toolbar/`
- `note-input-toolbar/`
- `edit-palette/`

Alle Icons nutzen `currentColor`, identisch zum v1-Export.

## Was wurde verbessert

### Dauern (note-input-toolbar)
- **Ganze Note**: echter hohler Kopf mit charakteristischem, gedrehtem Innenloch (SMuFL-ähnlich) statt einfacher Stroke-Ellipse — per `mask` realisiert.
- **Halbe Note**: stärkerer Kopf-Stroke (1.75 → 2.1), Stiel tangential am Kopf ausgerichtet, dezenter gedreht.
- **Viertel**: Kopf-Winkel und Stiel-Anschluss korrigiert.
- **Achtel, 16tel, 32stel, 64tel**: Fähnchen sind jetzt gefüllte, geschwungene Formen statt abgehackter Stroke-Kurven; natürliches „Falten"-Profil, gleiche Abstände.

### Vorzeichen
- **Doppelkreuz**: Bug gefixt. v1 zeigte ein X **plus zwei horizontale Linien** — das ist falsch. Das echte Doppelkreuz ist nur ein fetter, serifierter X-Stern (SMuFL U+E263). v2 zeigt genau das.
- **Kreuz/Auflösezeichen**: dickere Querbalken (1.5 → 1.9) für bessere Lesbarkeit bei kleinen Größen.
- **B/Doppel-B**: sauber geschlossener Bogen unten.

### Artikulation & Marker
- **Marcato**: offener Caret (`^`) statt geschlossenem Dreieck — entspricht der Notenschrift-Konvention.
- **Vorschlagsnote**: diagonaler Strich durch den Stiel hinzugefügt (Acciaccatura).
- **Pausenzeichen (Viertel)**: Kurven sauber geschlossen, Hook am Ende.
- **Slur/Tie**: leicht gestraffte Bézier-Kurve.
- **Akzent**: symmetrischere Winkel.

### Notation-Toolbar
- **Play**: abgerundete Spitzen statt harter Ecken.
- **Metronom**: Basis/Boden ergänzt, Pendel klarer positioniert.
- **Spinner**: 3/4-Kreisbogen statt vier isolierter Striche — sieht erst in Rotation wie ein Spinner aus.
- **Undo/Redo**: vereinfachte Pfeil-Form, klarer Pfeilkopf.
- **Layout-Sparkles**: unveränderte Grundform, Kurven leicht entzerrt.

### Edit-Palette
- **Barlines**: echte 5-Linien-Notensystem-Andeutung statt einzelner Querlinie — der Kontext für Taktstriche.
- **Dynamics**: Hairpin-Crescendo (`<`) statt drei Wellen — das universelle Dynamik-Zeichen.
- **Selection**: klassischer Cursor-Pfeil mit explizitem Abschlag.
- **Ties-Slurs**: sichtbare Anker-Punkte am Bogen-Anfang/-Ende, damit klar ist, dass es um Noten-Verbindung geht.
- **Transpose**: klarere Pfeil-Proportionen.

## Status
- Die v2-Formen sind in der App implementiert: `components/NotationToolbar.tsx` und `components/NoteInputToolbar.tsx` rendern diese Geometrien derzeit als inline-SVG.
- `design/v2/` bleibt die kanonische Referenz für die aktuelle Toolbar-Icon-Sprache.
- `design/toolbar-icons-export/` bleibt als Snapshot der früheren v1-Formen erhalten.
