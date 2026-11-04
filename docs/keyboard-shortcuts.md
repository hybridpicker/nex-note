# Keyboard Shortcuts

Stand: 2026-07-10. Diese Liste dokumentiert die im Code tatsächlich verdrahteten Shortcuts. `Cmd` auf macOS entspricht `Ctrl` auf Windows/Linux, sofern nicht anders angegeben.

## Workspace

| Shortcut | Aktion | Kontext |
| --- | --- | --- |
| `Cmd/Ctrl+K` | Command Center öffnen | global |
| `Cmd+Q` (macOS) / `Ctrl+Q` (Windows/Linux) | Nex Note beenden | Desktop-App, global |
| `Cmd/Ctrl+N` | New-Score-Dialog öffnen | global |
| `Cmd/Ctrl+O` | Datei öffnen | global |
| `Cmd/Ctrl+S` | aktuelle Partitur in der lokalen Library speichern | globale Partituransicht |
| `Cmd/Ctrl+Shift+S` | Save As in der lokalen Library | globale Partituransicht |
| `Cmd/Ctrl+W` | aktuelle Partitur schließen | globale Partituransicht |
| `Cmd/Ctrl+Z` | Undo | global |
| `Cmd/Ctrl+Shift+Z` / `Cmd/Ctrl+Y` | Redo | global |
| `Cmd/Ctrl+T` | Inspector öffnen und Staff-Text/Expression-Feld fokussieren | Partitur geöffnet |
| `Cmd/Ctrl+M` | Inspector öffnen und Rehearsal-Mark-Feld fokussieren | Partitur geöffnet |
| `Space` | Playback starten/pausieren; bei gestoppter Wiedergabe und aktiver Note ab dieser Note starten | global, außer Eingabefelder |
| `Escape` | Noteneingabe verlassen und Auswahl löschen | Noteneditor |
| `Cmd/Ctrl+Shift+E` | PDF exportieren (A4, Vektor) | Desktop-App, Partitur geöffnet |
| `Cmd/Ctrl++` / `Cmd/Ctrl+-` / `Cmd/Ctrl+0` | Zoom vergrößern/verkleinern/zurücksetzen | Desktop-App, Partitur geöffnet |

## Linux (Omarchy)

Unter Linux ist die native Menüleiste ausgeblendet (Kachel-Fenstermanager). Deshalb sind die In-App-Menüs `File`, `Edit` und `View` sichtbar, und der Hauptprozess verarbeitet diese Kürzel selbst: `Ctrl+N`, `Ctrl+O`, `Ctrl+S`, `Ctrl+Shift+S`, `Ctrl+Shift+E`, `Ctrl+F`, `Ctrl+K`, `Ctrl++`, `Ctrl+-`, `Ctrl+0` und `Ctrl+Q`. Bearbeitungstasten (Undo, Kopieren, Einfügen, Entf.) bleiben bei der Seite. Beschriftungen zeigen `Ctrl`/`Alt` statt `Cmd`/`Option`.

## Workspace-Tasten ohne Modifier

| Shortcut | Aktion | Kontext |
| --- | --- | --- |
| `?` / `F1` | Shortcut-Übersicht öffnen: Command Center, gefiltert auf Aktionen mit Tastaturkürzel und durchsuchbar (`?` nicht in Eingabefeldern) | global |
| `F8` | Inspector ein-/ausblenden (wie MuseScore) | Partitur geöffnet |
| `F9` | linke Notationspalette ein-/ausblenden (wie MuseScore) | Partitur geöffnet, nicht in der Druckansicht |

Die Tasten sind in `lib/workspace-shortcuts.ts` definiert (Unit-Test: `test/workspace-shortcuts.test.ts`). Die Omarchy-Hyprland-Standardbelegung nutzt keine unmodifizierten F-Tasten.

## Header-Menüs

| Shortcut | Aktion | Kontext |
| --- | --- | --- |
| `ArrowDown` / `ArrowUp` | fokussiertes Header-Menü öffnen und erstes/letztes aktives Menüelement fokussieren | fokussierter `File`-, `Edit`- oder `View`-Button |
| `Enter` / `Space` | fokussiertes Header-Menü öffnen | fokussierter `File`-, `Edit`- oder `View`-Button |
| `ArrowLeft` / `ArrowRight` | zwischen `File`, `Edit` und `View` wechseln; bei geöffnetem Menü das benachbarte Menü direkt öffnen | Header-Menüleiste |
| `Home` / `End` | zum ersten/letzten Header-Menü springen | Header-Menüleiste |
| `Tab` | geöffnetes Menü schließen und normalen Fokusfluss fortsetzen | geöffnetes Header-Menü |
| `Escape` | geöffnetes Menü schließen und zum Menübutton zurückkehren | geöffnetes Header-Menü |

## Score View

| Shortcut | Aktion | Kontext |
| --- | --- | --- |
| `Cmd/Ctrl+F` | Find/Go to öffnen | Score-Viewport oder Suchfeld |
| `Enter` | Find/Go to Suche ausführen | Find/Go to Suchfeld |
| `Escape` | Find/Go to schließen; sonst Measure-/Notenauswahl löschen | Score-Viewport |
| `Cmd/Ctrl+0` | Zoom auf 100 Prozent setzen | Score-Viewport |
| `Cmd/Ctrl++` / `Cmd/Ctrl+=` | hineinzoomen | Score-Viewport |
| `Cmd/Ctrl+-` | herauszoomen | Score-Viewport |
| `Cmd/Ctrl` + Mausrad | am Mauszeiger hinein-/herauszoomen (die Stelle unter dem Zeiger bleibt dort) | Score-Viewport |
| `PageDown` / `PageUp` | ungefähr eine Bildschirmhöhe scrollen | Score-Viewport |
| `Cmd/Ctrl+PageDown` / `Cmd/Ctrl+PageUp` | ungefähr eine Viewport-Höhe scrollen | Score-Viewport |
| `Home` | zum Anfang der Ansicht scrollen | Score-Viewport |
| `End` | zum Ende der Ansicht scrollen | Score-Viewport |

## Auswahl, Navigation und Bearbeitung

| Shortcut | Aktion | Kontext |
| --- | --- | --- |
| `ArrowLeft` / `ArrowRight` | vorherige/nächste Note auswählen | Noteneditor |
| `Shift+ArrowLeft` / `Shift+ArrowRight` | Auswahl nach links/rechts erweitern | Noteneditor |
| `Cmd/Ctrl+ArrowLeft` / `Cmd/Ctrl+ArrowRight` | zur vorherigen/nächsten Taktgrenze springen | Noteneditor |
| `Cmd/Ctrl+Home` / `Cmd/Ctrl+End` | zum Anfang/Ende der Partitur springen | Noteneditor |
| `Alt/Option+ArrowUp` / `Alt/Option+ArrowDown` | vertikal zwischen Stimmen/Systemen am gleichen Zeitpunkt navigieren | Noteneditor |
| `ArrowUp` / `ArrowDown` | ausgewählte Note chromatisch um einen Halbton transponieren | Noteneditor |
| `Cmd/Ctrl+Shift+ArrowUp` / `Cmd/Ctrl+Shift+ArrowDown` | ausgewählte Note, Akkorde oder gemischte Note/Rest-Bereiche auf den Staff darüber/darunter verschieben, wenn dort passende Rest-Slots liegen; reine Rest-Auswahl springt auf den passenden Rest im Nachbarstaff | Noteneditor |
| `Cmd/Ctrl+ArrowUp` / `Cmd/Ctrl+ArrowDown` | ausgewählte oder zuletzt eingegebene Note eine Oktave höher/tiefer setzen | Noteneditor |
| `Shift+ArrowUp` / `Shift+ArrowDown` | ausgewählte oder zuletzt eingegebene Note eine Oktave höher/tiefer setzen | Noteneditor |
| `Cmd/Ctrl+A` | alle Noten der aktiven Stimme auswählen | Noteneditor |
| `Cmd/Ctrl+D` | Auswahl duplizieren | Noteneditor |
| `Cmd/Ctrl+X` | Auswahl ausschneiden | Noteneditor |
| `Cmd/Ctrl+C` | Auswahl kopieren | Noteneditor |
| `Cmd/Ctrl+V` | Clipboard an aktiver Auswahl einfügen | Noteneditor |
| `Delete` / `Backspace` | Auswahl löschen; bei Akkorden nur den gewählten Akkordton entfernen und verbleibenden Ton als Root erhalten | Noteneditor oder Noteneingabe |
| `Shift+Delete` / `Shift+Backspace` | Ripple delete | Noteneditor oder Noteneingabe |
| `Cmd/Ctrl+Backspace` | Ripple delete | Noteneditor oder Noteneingabe |
| `Cmd/Ctrl+Shift+Delete` / `Cmd/Ctrl+Shift+Backspace` | aktive Stimme im aktuellen Takt zu einem ganzen Taktrest leeren | Noteneditor oder Noteneingabe |

## Note Input

| Shortcut | Aktion | Kontext |
| --- | --- | --- |
| `N` | Noteneingabe ein-/ausschalten | globaler Noteneditor |
| `I` | Insert/Overwrite-Modus umschalten | Noteneditor |
| `Cmd/Ctrl+I` | Insert-Modus wählen | Noteneditor |
| `Cmd/Ctrl+Shift+I` | Overwrite/Re-pitch-kompatiblen Modus wählen | Noteneditor |
| `1` | 64tel wählen | Noteneditor |
| `2` | 32tel wählen | Noteneditor |
| `3` | 16tel wählen | Noteneditor |
| `4` | Achtel wählen | Noteneditor |
| `5` | Viertel wählen | Noteneditor |
| `6` | Halbe wählen | Noteneditor |
| `7` | Ganze wählen | Noteneditor |
| `8` | Breve/Doppelganze wählen | Noteneditor |
| `9` | Longa wählen | Noteneditor |
| `.` | Punktierung ein-/ausschalten; eine neu gewählte Dauer (`1`–`9`, Toolbar) setzt den Punkt zurück (wie MuseScore), im Duration-first-Modus `M` bleibt er erhalten | Noteneditor |
| `Q` | Dauer halbieren | Noteneditor |
| `W` | Dauer verdoppeln | Noteneditor |
| `Shift+Q` | punktierte Dauer eine Stufe kleiner | Noteneditor |
| `Shift+W` | punktierte Dauer eine Stufe größer | Noteneditor |
| `Cmd/Ctrl+Alt/Option+1` ... `4` | Stimme 1 ... 4 wählen | Noteneditor |
| `A` ... `G` | Tonhöhe ändern oder Note eingeben; bei laufender Noteneingabe wird die zum vorherigen Ton nächste Oktave verwendet. Ohne neu gesetztes Vorzeichen gilt zuerst das letzte gleichnamige Vorzeichen derselben Staff-Position im aktuellen Takt, danach die aktive Tonart; ein bereits identischer Ton gilt als erfolgreiche Eingabe und bewegt den Cursor weiter | Noteneditor |
| `J` | Ausgewählte Note(n) enharmonisch umdeuten; wiederholtes Drücken durchläuft alle Standard-Schreibweisen bei unveränderter klingender Tonhöhe | Noteneditor oder Noteneingabe, QWERTY-Step-Keyboard inaktiv |
| `Cmd/Ctrl+Shift+H` | Chord Input Mode ein-/ausschalten | Noteneingabe |
| `P` | QWERTY-Step-Keyboard ein-/ausblenden; aktiviert bei Bedarf zugleich die Noteneingabe | Noteneditor |
| `Shift+A` ... `Shift+G` | Akkordton oberhalb des höchsten Tons zur zuletzt eingegebenen Note hinzufügen (wie MuseScore); der Eingabecursor bleibt auf dem nächsten Einsatz. Ohne vorherige Eingabe gilt die ausgewählte Note | Noteneingabe |
| `Alt/Option+1` ... `9` | diatonisches Intervall (Prime bis None) über der aktiven Note als Akkordton hinzufügen; Tonart und physische Zifferntaste werden berücksichtigt | Noteneditor oder Noteneingabe, Tonhöhe ausgewählt |
| `Cmd/Ctrl+Shift+A` ... `G` | Note explizit am Cursor einfügen | Noteneingabe |
| `Z` `S` `X` `D` `C` `V` `G` `B` `H` `N` `J` `M` | QWERTY-Piano: `C4` bis `B4` eingeben | Noteneingabe, QWERTY-Step-Keyboard aktiv |
| `Q` `2` `W` `3` `E` `R` `5` `T` `6` `Y` `7` `U` | QWERTY-Piano: `C5` bis `B5` eingeben | Noteneingabe, QWERTY-Step-Keyboard aktiv |
| `R` | Letzte Note wiederholen, wenn in Note Input bereits eine Note eingegeben wurde; sonst Rest einfügen | Noteneditor |
| `0` | Rest einfügen | Noteneditor |
| `-` | Flat fuer die naechste Note setzen; ausserhalb Note Input an der Auswahl toggeln | Noteneditor |
| `=` | Natural fuer die naechste Note setzen; ausserhalb Note Input an der Auswahl toggeln | Noteneditor |
| `+` | Sharp fuer die naechste Note setzen; ausserhalb Note Input an der Auswahl toggeln | Noteneditor |
| `Alt/Option+-` | Double-flat fuer die naechste Note setzen; ausserhalb Note Input an der Auswahl toggeln | Noteneditor |
| `Alt/Option+=` | Double-sharp fuer die naechste Note setzen; ausserhalb Note Input an der Auswahl toggeln | Noteneditor |
| `X` | Halsrichtung der ausgewählten Note flippen | Auswahl erforderlich |
| `Shift+X` | Slash-Notehead der ausgewählten Note toggeln | Auswahl erforderlich |
| `T` | In der Noteneingabe den nächsten Ton bzw. kompletten Akkord mit aktiver Dauer erzeugen, alle Tonhöhen binden und einmal weiterschalten; außerhalb der Noteneingabe Tie auf der Auswahl toggeln | Noteneingabe oder Auswahl |
| `S` | Slur toggeln | Auswahl erforderlich |
| `Shift+S` | Staccato toggeln | Auswahl erforderlich |
| `Shift+.` | Accent toggeln | Auswahl erforderlich |
| `Shift+6` | Marcato/Strong Accent toggeln | Auswahl erforderlich |
| `Shift+-` | Tenuto toggeln | Auswahl erforderlich |
| `Cmd/Ctrl+2` ... `9` | In der Noteneingabe (wie MuseScore): die aktive Dauer ist die Gesamtlänge des neuen Tuplets am Cursor (Viertel + `Cmd/Ctrl+3` = Achteltriole); der Cursor springt in die Gruppe, die Eingabedauer wird zur Einheit, getippte Tonhöhen füllen die Einheiten. Außerhalb der Noteneingabe: Dauer genau einer ausgewaehlten Note, eines Akkords oder einer Pause in ein Tuplet 2:3 bis 9:8 teilen; dieselben Aktionen sind als Toolbar-Buttons verfuegbar | Genau ein rhythmischer Anker; nicht darstellbare Dauern, Bereiche, Ties und bereits verschachtelte Tuplets werden sichtbar abgelehnt |
| `/` | Eigene zeitlose Grace Note vor dem ausgewaehlten Anker einfuegen | Auswahl erforderlich; Hauptnote bleibt unveraendert |
| `Cmd/Ctrl+/` | aktuellen Takt mit rhythmischen Slashes füllen | Auswahl erforderlich |
| `Cmd/Ctrl+K` | Inline-Akkordcursor an der ausgewählten Note öffnen und vorhandenes Symbol zum Direktbearbeiten laden | Auswahl erforderlich |

Solange das QWERTY-Step-Keyboard aktiv ist, haben seine Pitch-Tasten Vorrang vor den gleichnamigen Einzelbuchstaben-Shortcuts; `P` oder `Escape` verlassen diesen Modus wieder.

Ein in Note Input gesetztes Vorzeichen ist wie in MuseScore ein Einmal-Werkzeug: Der aktive Toolbar-Button erlischt nach der naechsten erfolgreichen Note. Der klingende Alter-Wert gilt danach fuer denselben Notennamen in derselben Oktave und auf demselben Staff bis zum Taktstrich, auch ueber Stimmen hinweg. Ein anderer Oktavraum oder der naechste Takt faellt auf seinen eigenen Taktkontext beziehungsweise die Tonart zurueck. `J` deutet die aktuelle semantische Auswahl enharmonisch um, erhaelt MIDI-Tonhoehe, Entity-Identitaet, Ties und TAB-Fingering und fasst eine Mehrfachauswahl in einer Undo-Transaktion zusammen. Solange das QWERTY-Step-Keyboard aktiv ist, bleibt `J` absichtlich dessen A-Sharp-Taste.

Courtesy/Cautionary hat derzeit keinen Tastaturkurzbefehl. Fuer ein explizit geschriebenes Vorzeichen stehen in Edit Palette → Accidentals und im Inspector die pitch-neutralen Optionen Cautionary sowie keine/runde/eckige Klammer bereit; jede Aenderung ist eine Undo-Transaktion.

## Guitar TAB Input

| Shortcut | Aktion | Kontext |
| --- | --- | --- |
| `TAB`-Button | gitarrenspezifische String/Fret-Eingabe ein-/ausblenden und Noteneingabe aktivieren | Toolbar |
| `Alt/Option+1` ... `6` | aktive Gitarrensaite 1 ... 6 wählen | TAB-Eingabe aktiv |
| `0` ... `9` | Bund eingeben; zwei Ziffern werden als zweistelliger Bund übernommen | TAB-Eingabe und Noteneingabe aktiv |

Die TAB-Eingabe kann Standard, Drop D, DADGAD und Open G nutzen. String, Bund, Tuning und Gitarrentechniken wie Hammer-on, Pull-off, Slide, Bend, Vibrato, Palm Mute und Let Ring werden als semantische Notendaten gespeichert und beim MusicXML-Import/-Export über technische Notation erhalten. Dauern, Punktierung, Stimmen, Insert/Overwrite und Chord Mode bleiben dieselben Werkzeuge wie bei der klassischen Noteneingabe.

## Texteingaben und Dialoge

| Shortcut | Aktion | Kontext |
| --- | --- | --- |
| `Enter` | Chat-Nachricht senden | Chat-Eingabe, ohne `Shift` |
| `Shift+Enter` | neue Zeile in Chat-Eingabe | Chat-Eingabe |
| `Enter` | Akkordsymbol am selektierten Einsatz anwenden | Akkordsymbol-Feld |
| `Escape` | Akkordsymbol-Entwurf auf den aktuell selektierten Harmony-Wert zuruecksetzen und Feld verlassen | Akkordsymbol-Feld |
| `Enter` | Rehearsal Mark, Staff Text, Lyrics oder Dynamic am fokussierten Inspector-Feld anwenden | Inspector-Textfelder |
| `Enter` | Custom Provider/Model hinzufügen | Provider-Eingabe |
| `Escape` | Custom Provider/Model Eingabe schließen | Provider-Eingabe |
| `Enter` | Command-Center Aktion ausführen | Command Center |
| `ArrowUp` / `ArrowDown` | Command-Center Auswahl bewegen | Command Center |
| `Escape` | Command Center schließen | Command Center |

Command-Center-Suche akzeptiert mehrere Suchbegriffe in beliebiger Reihenfolge, z. B. `score create` fuer `Create new score`.
Textbezogene Aktionen sind als gemeinsame Gruppe `Text input` organisiert; Suchbegriffe wie `text input`, `inspector text` oder `chord symbol` finden dieselben Textbefehle.
Phase D fuegt bewusst keine neuen Shortcuts hinzu: Placement fuer Staff Text, Expression Text, Dynamics, bestehende Tie-Starts und bestehende Slur-Spans wird ueber die bestehenden Inspector-Fokuswege (`Cmd/Ctrl+T`, `Cmd/Ctrl+M`) plus die vorhandene Auswahl editiert, um Kollisionen mit Note Input, Browser-Konventionen und Command Center zu vermeiden.
Ansichts- und Navigationshilfen sind zusaetzlich als Gruppe `View` organisiert; Suchbegriffe wie `navigator`, `find`, `zoom`, `page view` oder `continuous horizontal` oeffnen dieselben Footer-Werkzeuge direkt ueber das Command Center.
Takt- und Wiederholungswerkzeuge aus dem Inspector sind zusaetzlich als Gruppe `Structure` organisiert; Suchbegriffe wie `structure`, `repeat`, `ending`, `system break`, `page break` oder `insert measure` finden dieselben Befehle direkt ueber das Command Center.
Inspector-Sektionen selbst sind zusaetzlich als Gruppe `Inspector` organisiert; Suchbegriffe wie `inspector score setup`, `inspector key signature`, `inspector measure tools`, `inspector lyrics` oder `inspector parts instruments` oeffnen direkt die passende Inspector-Sektion und fokussieren das erste relevante Steuerelement.

Die linke Werkzeugleiste ist zusaetzlich als Gruppe `Palette` im Command Center organisiert; Suchbegriffe wie `palette transpose`, `palette dynamics`, `palette barlines` oder `palette selection tools` oeffnen direkt die passende Palette-Sektion und setzen den Fokus auf das erste verfuegbare Werkzeug.

## Mouse Modifier

| Modifier | Aktion | Kontext |
| --- | --- | --- |
| `Shift+Click` | Range-Auswahl oder Insert-Platzierung am Ghost-Ziel | Score |
| `Cmd/Ctrl+Click` | additive Auswahl | Score |
| `Alt/Option+Click` | Chord-Platzierung am Ghost-Ziel | Score |

## Aktuelle Lücken im Vergleich zu MuseScore und Finale

Referenzpunkte: MuseScore Studio 4 nutzt unter anderem `N` für Note Input, `1` bis `9` für Dauern, `Ctrl/Cmd+Alt/Option+1` bis `4` für Stimmen, `Q/W` für Dauer halbieren/verdoppeln, `T` für Tie, `Shift+Left/Right` für Auswahl und `Ctrl/Cmd+2` bis `9` für Tuplets. Finale Simple Entry ist stark auf Tastatur- und Numpad-Workflows ausgelegt, inklusive Tool-Auswahl per Shortcut, Caret-basierter Eingabe und Shortcuts für Artikulationen, Expressions, Schlüssel-, Tonart- und Taktartwechsel.

Priorisierte Vorschläge:

| Priorität | Vorschlag | Begründung |
| --- | --- | --- |
| Mittel | weitere Flip-Ziele fuer breitere Direction-Placements | Tie-, Slur- und Artikulations-Placement sind fuer bestehende selektierte Zeichen explizit im Inspector editierbar; weitere Direction-Typen brauchen weiterhin eigene semantische Properties bzw. eine bewusst groessere Inspector-Surface |
| Mittel | reale MuseScore-Paritaet weiter ueber Harness statt Shortcut-Versprechen pruefen | `npm run smoke:musescore-roundtrip` prueft MusicXML, app-style MXL und MSCZ mit Diagnose-Artefakten; lokale MuseScore-4.7.3-Abstuerze bleiben als Tool-Limit von echten nex-note Exportfehlern zu trennen |
| Mittel | weitere Text-Shortcuts prüfen: System Text, separates Expression-Popup und Dynamics-Eingabe | Phase D liefert explizite Placement-Controls fuer Staff Text, Expression Text und Dynamics im Inspector; zusaetzliche globale Shortcuts bleiben vorerst bewusst ausgesetzt |
| Mittel | Akkordsymbol näher an Standards prüfen, z. B. alternative Chord-Symbol Shortcuts fuer Command-Center-Power-User | aktuell oeffnet `Cmd/Ctrl+K` bei Notenauswahl die Inline-Harmony-Eingabe und ohne Auswahl das Command Center; MuseScore verwendet fuer Chords haeufig eigene Text-Shortcuts, hier sollte Konfliktarmut getestet werden |
| Mittel | Finale-orientierte Simple-Entry-Laptop/Numpad Map als optionales Preset | Finale-Nutzer erwarten teils Numpad-zentrierte Toolwahl; als Preset besser als harte Default-Änderung |
| Niedrig | Hardware-MIDI oder externes Piano-Keyboard als Erweiterung zum QWERTY-Step-Keyboard | Phase C liefert bewusst nur die bounded QWERTY-/Toolbar-Surface ueber den bestehenden semantischen Command-Pfad |
| Niedrig | Dynamik-Shortcuts wie `Ctrl/Cmd+Shift+P/M/F` mit Eingabe-Popup | MuseScore bietet dynamische Texte per Shortcut; sinnvoll, sobald Dynamics-Editing UX stabil ist |
| Niedrig | Layout-/Ansichts-Shortcuts für Navigator, Print View, Continuous/Page View | gut für Power User, aber weniger kritisch als Eingabe- und Bearbeitungsfluss |

## Quellen im Code

- `app/page.tsx`: globale Shortcuts, Command Center Actions, Undo/Redo/Playback.
- `hooks/useNoteEditor.ts`: Noten-, Auswahl-, Clipboard-, Dauer-, Vorzeichen- und Navigationsshortcuts.
- `components/ScoreEditor.tsx`: Score-Viewport, Find/Go to, Zoom und Scroll-Navigation.
- `components/CommandCenter.tsx`: Navigation innerhalb des Command Centers.
- `components/NoteInputToolbar.tsx` und `components/NotationToolbar.tsx`: sichtbare Tooltip-Hinweise.

## Externe Vergleichsquellen

- MuseScore Studio Handbook: <https://handbook.musescore.org/appendix/all-keyboard-shortcuts>
- Finale Simple Entry: <https://finale.jetzt/finalehelp/FinaleWin/Content/Finale/Simple_Entry.htm>
- Finale Simple Entry Tool Beschreibung: <https://www.frista.se/Finale/Handledning/Finale25Win/Content/Finale/ID_MAINTOOL_SIMPLEENTRY.htm>


## September 2026 advanced entry controls

Open **Rhythm, tuplets and MIDI** below the notation toolbar. Select an onset
before bounded insert/delete/resize, custom tuplets, grace-sequence editing or
local duration spelling. Scope and stop bar are explicit. These controls use
one Undo action per accepted operation and display rejected-range feedback.

In Note Input (`N`), `M` enables pitch-before-duration: select/play the pitches,
then press a duration key. MIDI chords are collected until all physical keys
are released; sustain is ignored. Choose the MIDI input device in the same
panel. **Record MIDI** starts the configured count-in/metronome; **Stop take**
keeps a reviewable take without changing the score. **Apply / requantize take**
commits it. See [limitations and evidence](note-entry-quality-2026-09-13.md).
The historical Phase C hardware-MIDI limitation above no longer describes the
current implementation.


## Keyboard layouts (November 2026)

Shortcuts are resolved by `src/score-input/keyboard-layout.ts` and the resolvers in
`src/score-input/keyboard-resolver.ts`, with unit tests for US-QWERTY, UK and
German/Austrian QWERTZ on macOS and Windows/Linux, with and without a layout map
(`test/keyboard-layout.test.ts`).

| Shortcut family | Rule | QWERTZ example |
| --- | --- | --- |
| Letters (`A`–`G`, `N`, `T`, `S`, `J`, `Cmd/Ctrl+Z/Y/K/T/M`) | the printed letter; the physical key is used only when the produced character is not a Latin letter (Option glyphs, non-Latin layouts) | `Cmd/Ctrl+Y` (printed Y, physical `KeyZ`) is Redo |
| Accidentals `-` `=` `+` | the produced character | `-` flat, `Shift+0` natural, `+` (BracketRight) sharp |
| Double accidentals `Alt/Option+-`, `Alt/Option+=` | the base character of the pressed key, from the layout map, the built-in layout table or the macOS Option glyph | `Option+-`, `Option+Shift+0` |
| `Shift+.`, `Shift+6`, `Shift+-` | the physical base key | QWERTZ prints `:`, `&`, `_`; `Shift+ß` (`?`) stays the shortcut overview |
| `/` grace note, `Cmd/Ctrl+/` slash fill | the produced character | `Shift+7` |
| Durations `1`–`9`, intervals `Alt/Option+1`–`9`, tuplets `Cmd/Ctrl+2`–`9`, TAB strings `Alt/Option+1`–`6` | a produced digit, or the physical digit row when a modifier or the layout replaced the character | plain `Shift+digit` never selects a duration (`Shift+7` is `/`) |
| QWERTY piano (`P`) | physical positions, named by their US letters | bottom-left key (printed `Y`) is `C4` |

The layout map comes from `navigator.keyboard.getLayoutMap()` (Chromium, Electron) and is
refreshed when the window gains focus. WebKit (Safari, the iPad app) has no layout map: every
rule above still works there except `Option+Shift+0` (double sharp) on a QWERTZ Mac keyboard,
whose Option glyph does not identify the key. Use the toolbar double sharp in that case.

Held keys: only `ArrowLeft/Right/Up/Down`, `PageUp/PageDown` and `Home/End` auto-repeat in the
note editor. A held note name, rest, `Delete`, `T`, `N` or any other entry or mode key acts once
per physical press. Held `Space` never restarts playback.

Voice changes and chords (November 2026, MuseScore parity): changing the voice keeps the input
position, so the next note or rest in the new voice starts at the cursor. Entry continues into
the next bar even when the active voice does not exist there yet. A plain letter after a chord is
resolved nearest to the chord's lowest note.
First note of a passage: with no earlier note in the voice, `A`–`G` resolve nearest to the
middle line of the effective clef (treble B4, bass D3, alto C4, tenor A3), as MuseScore does, so
the first `C` is C5 in treble and C3 in bass clef.

Selection keys during note input (MuseScore parity): after entering a note, the articulation
keys (`Shift+S`, `Shift+.`, `Shift+6`, `Shift+-`), `/` (grace note), `J` (respell), `X` (stem)
and `Shift+X` (slash notehead) act on the note just entered, as in MuseScore, while the input
cursor stays on the next position. An explicit range selection is used as selected.
`Shift+Left`/`Shift+Right` right after an entry start the range at the note just entered, so
`C D E` followed by two `Shift+Left` and `S` slurs C to E, as in MuseScore.
