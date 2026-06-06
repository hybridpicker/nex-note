# Smart Ghost-Note Konzept

## Ziel

Browser-Noteneingabe soll sich wie ein Desktop-Notationstool anfühlen:

- Y wird auf echte Staff-Schritte quantisiert, nicht auf freie Pixel.
- X wird auf musikalische Onsets und Eingabe-Intent quantisiert.
- Der Nutzer sieht vor dem Klick exakt die resultierende Note.
- Zwischen Taktgrenzen gibt es keine "invaliden" Mouse-Zonen.

## Algorithmus

### 1. Vertical Snapping

1. Ermittle über `GeometryProxy.getDetailedContext()` den aktiven Takt und die nächste Staff.
2. Quantisiere `pointerY` auf halbe Linienabstände:
   `staffStep = round((pointerY - topLineY) / (lineDistance / 2))`
3. Mappe `staffStep` relativ zu einer Referenznote auf einen diatonischen Pitch.
4. Erzeuge Ledger-Lines, sobald `staffStep` oberhalb der obersten oder unterhalb der untersten Systemlinie liegt.

### 2. Horizontal Precision

1. Ermittle pro Takt/staff/voice vorhandene Onset-Anker `(ratio, x)`.
2. Clamp `pointerX` in den schreibbaren Taktinnenraum.
   Damit sind Barline-Zonen keine gültigen Insert-Punkte.
3. Quantisiere auf das rhythmische Raster des aktiven Segments.
4. Bestimme den Intent relativ zum nächsten existierenden Onset:
   - links vom Notehead: `insert`
   - auf dem Notehead: `replace`
   - rechts vom Notehead: `chord`

### 3. Ghost Preview

Der Preview-Overlay zeigt:

- Zieltonhöhe
- Ziel-Onset
- Tuplet-Kontext
- Ledger-Lines
- Placement-Modus (`Insert`, `Replace`, `Chord`)

### 4. Drag-to-Transpose

Beim Dragging wird die vertikale Bewegung wieder auf Staff-Schritte quantisiert.

- `diatonic`: ein Staff-Schritt = ein diatonischer Tonschritt
- `chromatic`: ein quantisierter Drag-Schritt = ein Halbton

Jeder Zustandswechsel triggert ein kurzes Pitch-Preview.

## Schutz vor "zwischen zwei Takten"

Die Lösung ist kein nachträgliches Fehlerhandling, sondern eine harte Eingabegrenze:

- Jeder Pointer wird auf den Innenraum des aktiven Takts geklemmt.
- Die ersten/letzten Pixel an der Barline sind Dead-Zones.
- Falls der Cursor in diese Zone gerät, snappt X auf den nächsten legalen Onset innerhalb des Takts.

Dadurch entsteht nie ein Timestamp, der logisch "zwischen zwei Takten" liegt.
