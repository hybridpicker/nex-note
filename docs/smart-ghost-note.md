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
4. Der Zeiger gehört zum nächstgelegenen existierenden Onset des Takts (MuseScore
   `Score::getPosition`); zwischen zwei Onsets entsteht kein Einfügepunkt.
5. Der Platzierungsmodus folgt seit November 2026 MuseScores `NoteInput::putNote`
   (`src/score-input/pointer-entry-mode.ts`, `test/pointer-click-musescore.test.ts`):
   - Pause am Onset: `replace` (Note mit dem aktiven Wert schreiben)
   - Note mit demselben Wert wie der aktive: `chord`
   - Note mit anderem Wert: `replace` mit dem aktiven Wert
   - `Shift`: `replace`, `Alt/Option`: `chord`, `Cmd/Ctrl+Shift`: `insert`
   Die frühere Zonenregel (links `insert`, auf dem Kopf `replace`, rechts `chord`) ist
   entfallen: ein einfacher Klick schob die folgende Musik des Takts nach hinten.

### 3. Ghost Preview

Der Preview-Overlay zeigt:

- Zieltonhöhe
- Ziel-Onset
- Tuplet-Kontext
- Ledger-Lines
- Placement-Modus (`Insert`, `Replace`, `Chord`)

Horizontal gilt eine harte MuseScore-ähnliche Invariante: Preview und Commit
verwenden denselben aufgelösten Snap. Nach der Zielauflösung ist
`RenderedGhostGrid` / `InteractiveEditMap` / `ResolvedEditTarget.domX` die
einzige X-Wahrheit; `pointerX` darf nur einen Slot auswählen, aber nie die
sichtbare Notehead-Position ersetzen. Die finale Preview-Position wird immer so
berechnet:

```ts
previewLeft = canonicalSnapX - noteheadCenterX;
```

Wenn kein gerenderter oder explizit validierter synthetischer Snap für den
aufgelösten Slot existiert, wird kein Ghost gezeigt und es gibt keinen
Mouse-Commit. Die Regression `beat-one rest eighth-note mouse ghost and commit
share the rendered snap X` deckt den kritischen 4/4-Fall ab: Beat 1 ist eine
Rest-Anchor, die gewählte Dauer ist Achtel, und Hover/Klick müssen exakt auf
diesem Rest-Snap liegen.

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
