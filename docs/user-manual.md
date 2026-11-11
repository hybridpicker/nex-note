# nex-note Manual

Stand: 2026-06-24. Dieses Manual beschreibt die aktuell verfügbaren Nutzerfunktionen in nex-note. Tastaturkuerzel sind separat in [keyboard-shortcuts.md](./keyboard-shortcuts.md) dokumentiert.

Sprachen: [Deutsch](./user-manual.md), [English](./user-manual.en.md), [Français](./user-manual.fr.md), [Español](./user-manual.es.md), [中文](./user-manual.zh.md).

## Was nex-note ist

nex-note ist ein MusicXML-Editor fuer MuseScore-nahe Workflows. Du kannst Partituren importieren, direkt im Browser bearbeiten, per AI-Chat veraendern, abspielen und wieder als MusicXML/MXL oder andere Formate exportieren.

Die App arbeitet mit einem gerenderten Notenbild, einer semantischen Score-Struktur und einem Command-Verlauf fuer Undo/Redo. Viele Bearbeitungen laufen daher nicht als reine XML-Textaenderung, sondern als strukturierte musikalische Operation.

## Start und Dateien

Auf dem Willkommensscreen stehen diese Einstiege zur Verfuegung:

| Funktion | Beschreibung |
| --- | --- |
| Neue Partitur | Erstellt direkt eine neue leere Partitur. |
| Vorlage waehlen | Oeffnet den New-Score-Dialog mit Instrumenten, Templates und Score-Informationen. |
| Datei oeffnen | Importiert eine lokale Datei. |
| Drag & Drop Upload | Laedt Dateien ueber die Upload-Zone. |
| Zuletzt geoeffnet | Zeigt zuletzt importierte Dateien. |
| Library | Oeffnet lokal gespeicherte Partituren. |

Unterstuetzte Importformate:

| Format | Hinweis |
| --- | --- |
| `.musicxml`, `.xml` | Direkter MusicXML-Import. |
| `.mxl` | Komprimierter MusicXML-Import. |
| `.pdf`, `.png`, `.jpg`, `.jpeg`, `.tif`, `.tiff`, `.webp`, `.bmp`, `.heic`, `.heif` | Werden lokal ueber Audiveris/OMR konvertiert, falls installiert. |
| `.mscz` | Wird ueber MuseScore CLI konvertiert, falls installiert. |
| GuitarPro-Dateien | `.gp`, `.gp4`, `.gp5`, `.gp6`, `.gpx` ueber MuseScore CLI, falls installiert. |
| `.nxn` | nex-note Projektdatei fuer editierbare Projektzustande. |

Beim Import zeigt nex-note den Speicherort fuer editierbare `.nxn` Projektdateien an. Du bestaetigst den vorgeschlagenen Ordner oder waehlst bewusst einen anderen Ort. Die App legt dort den Unterordner `nex-note-projects` an und speichert jede geoeffnete oder konvertierte Datei zusaetzlich als `.nxn` Arbeitskopie. Die Originaldateien bleiben unveraendert und werden in Recent Files und Library weiter mit ihrem urspruenglichen Format angezeigt.

## Neue Partitur erstellen

Im New-Score-Dialog gibt es drei Bereiche:

| Bereich | Funktionen |
| --- | --- |
| Choose instruments | Instrumente suchen, nach Familie filtern, hinzufuegen, entfernen und umsortieren. |
| Create from template | Vordefinierte Besetzungen auswaehlen. |
| Score information | Titel, Untertitel, Komponist, Arrangeur, Tonart, Taktart und Beat Unit setzen. |

Die Reihenfolge der ausgewaehlten Instrumente bestimmt die Reihenfolge der Systeme in der Partitur.

## Hauptoberflaeche

Nach dem Laden einer Partitur besteht der Arbeitsbereich aus:

| Bereich | Zweck |
| --- | --- |
| Score View | Gerenderte Partitur mit Auswahl, Navigation, Ghost-Note-Zielen und Playback-Cursor. |
| Header-Menüs | `File`, `Bearbeiten` und `Ansicht` bündeln Datei-, Undo/Redo-, Clipboard-, Zoom-, Navigator-, Find/Go to- und Print-View-Aktionen mit Shortcut-Hinweisen und Disabled-Hinweisen. |
| Obere Notation Toolbar | Undo/Redo, Playback, Tempo, Metronom, Note Input, Lead Mode, Drag-Transpose-Modus, Layout Cleanup. |
| Note Input Toolbar | Dauern, Vorzeichen, Artikulationen, Stimmen, Insert/Overwrite, Akkordsymbole, Rest, Copy/Paste/Delete. |
| Edit Palette | Linke Werkzeugpalette fuer Auswahl, Transposition, Artikulationen, Dynamics, Ties/Slurs und Barlines. |
| Workspace Panel | Rechter Bereich mit AI, Library und Inspector; kann eingeklappt werden. |
| Footer Controls | Navigator, Find/Go to, Zoom und View Mode. |

## Sprache und Hilfe

In der Kopfzeile gibt es eine kompakte Sprachauswahl. nex-note unterstuetzt Deutsch, English, Francais, Espanol und 中文. Die Auswahl wird lokal im Browser gespeichert, beim naechsten Start wiederhergestellt und aktualisiert die App-Oberflaeche ohne Neuladen. Der Link **Handbuch/Manual** oeffnet automatisch die Manual-Version der aktuell gewaehlten Sprache.
Das Command Center (`Cmd/Ctrl+K`) findet nicht nur Datei-, Text- und Bearbeitungsbefehle, sondern jetzt auch Navigator-, Find/Go to-, Zoom- und View-Mode-Aktionen ueber Suchbegriffe wie `navigator`, `find`, `zoom` oder `page view`.
Strukturaktionen aus dem Inspector wie `insert measure`, `repeat`, `ending`, `system break` oder `page break` sind ebenfalls direkt ueber das Command Center such- und ausfuehrbar, ohne erst den Inspector manuell zu oeffnen.
Die Inspector-Sektionen selbst sind jetzt als Gruppe `Inspector` auffindbar. Suchbegriffe wie `inspector score setup`, `inspector key signature`, `inspector measure tools`, `inspector lyrics` oder `inspector parts instruments` oeffnen direkt den passenden Inspector-Bereich und setzen den Fokus auf das erste relevante Feld oder Preset.

Auch die linke `Palette` ist ueber das Command Center direkt anspringbar. Begriffe wie `palette transpose`, `palette dynamics`, `palette barlines` oder `palette selection tools` oeffnen die entsprechende Palette-Sektion und fokussieren das erste verfuegbare Werkzeug.
Die Header-Menues `Bearbeiten` und `Ansicht` bieten dieselben Kernaktionen zusaetzlich als klassische Desktop-Wege an, damit Undo/Redo, Cut/Copy/Paste, Find/Go to, Navigator, Zoom und View-Wechsel nicht nur ueber Footer, Sidebar oder Command Center erreichbar sind.
Bereits aktive Ansichtsmodi werden im Command Center und im `Ansicht`-Menue als nicht erneut ausfuehrbare Aktionen markiert. Das vermeidet tote `Page`-, `Continuous vertical`- und `Continuous horizontal`-Wege beim schnellen Umschalten.
Die Menueleiste laesst sich jetzt auch wie in klassischen Notations-Apps komplett per Tastatur bedienen: `ArrowDown` oder `ArrowUp` oeffnen das fokussierte Menue, `ArrowLeft` oder `ArrowRight` wechseln zwischen `File`, `Bearbeiten` und `Ansicht`, `Home` und `End` springen direkt zum ersten oder letzten Menue.

Im Footer bleiben `Navigator` und `Find/Go to` sichtbar hervorgehoben, solange das jeweilige Hilfswerkzeug offen ist.

## Auswahl und Navigation

Du kannst Noten direkt im Score anklicken. Die aktive Note wird markiert und in der Toolbar angezeigt. Mehrfachauswahl ist moeglich:

| Aktion | Ergebnis |
| --- | --- |
| Click auf Note | Note auswaehlen und kurz vorhoeren. |
| Click auf leere Flaeche | Auswahl loeschen. |
| Shift+Click | Range-Auswahl erweitern. |
| Cmd/Ctrl+Click | Additive Auswahl. |
| Arrow Left/Right | Zur vorherigen oder naechsten Note springen. |
| Shift+Arrow Left/Right | Auswahl per Tastatur erweitern. |
| Cmd/Ctrl+Arrow Left/Right | Zur Taktgrenze springen. |
| Alt/Option+Arrow Up/Down | Zwischen Stimmen/Systemen am gleichen Zeitpunkt wechseln. |

Find/Go to kann per Button oder `Cmd/Ctrl+F` geoeffnet werden. Typische Eingaben sind Taktzahlen, Seitenziele wie `p2`, oder Rehearsal-/Textziele, soweit im Score aufloesbar.

## Note Input

Note Input wird mit dem Button `Note Input` oder `N` aktiviert. Die Eingabe ist an MuseScore angelehnt:

| Funktion | Beschreibung |
| --- | --- |
| Dauern | `1` bis `9` waehlen 64tel bis Longa; `8` ist Breve/Doppelganze, `9` ist Longa. |
| Punktierung | `.` toggelt die punktierte Dauer. |
| Tonhoehen | `A` bis `G` geben Noten ein oder aendern die aktive Tonhoehe. |
| Statuszeile und Inspector | Die Statuszeile neben dem Transport nennt die Auswahl in Musikersprache: `Takt 3, Schlag 2.5 · F♯5 · Achtelnote · Floete · Stimme 1`. Der Inspector (`F8`) zeigt Tonhoehe, Notenwert, Position und Stimme der gewaehlten Note oder Pause, mit Bedienelementen fuer Halsrichtung und Sichtbarkeit. Die Modus-Buttons der Notationswerkzeuge heissen `Standard`/`Replace` (Eingabemodus), `Akkord`, `Tasten` (Computertastatur als Klavier), `Tonhoehe zuerst` (erst Toene, dann Wert) und `Leadsheet`. |
| Mauseingabe | In der Noteneingabe schreibt ein Klick auf eine Pause eine Note mit dem aktiven Wert. Ein Klick auf eine Note mit demselben Wert fuegt einen Akkordton hinzu; auf einer Note mit anderem Wert ersetzt er sie durch den aktiven Wert. Ein Klick schiebt nie die folgende Musik nach hinten. `Shift`+Klick ersetzt, was dort steht, `Alt/Option`+Klick fuegt immer einen Akkordton hinzu, `Cmd/Ctrl+Shift`+Klick fuegt ein und schiebt den Rest des Takts nach hinten. Im Eingabemodus Replace ersetzt jeder Klick. |
| Caret und Eingabeleiste | Solange Note Input aktiv ist, zeigt ein senkrechter Caret in der Farbe der Eingabestimme (Stimme 1 blau, 2 gruen, 3 orange, 4 violett), wo die naechste Note landet, bei Tastatur-, Maus- und MIDI-Eingabe; die Ansicht scrollt mit. Eine Leiste rechts in der Zeile unter der Toolbar zeigt, was gewaehlt ist: Notenwert, Punktierung, Vorzeichen, Stimme, Eingabemodus (`Standard` oder `Ersetzen`) und die N-Tole, in der der Cursor steht. Jedes Feld ist anklickbar. |
| Rest | `0` fuegt einen Rest mit aktiver Dauer ein (in Note Input vor der ersten Note auch `R`). Ausserhalb von Note Input startet `0` die Noteneingabe an der gewaehlten Note und schreibt die Pause darueber; nichts wird nach hinten geschoben. |
| Laengere Werte ueber vorhandenen Noten | Ein Wert, der laenger ist als die Note am Cursor, ueberschreibt die folgende Musik im Takt. Eine angeschnittene Note hinterlaesst eine Pause; eine erreichte N-Tole wird als Ganzes entfernt. |
| Wiederholen | `R` wiederholt in Note Input die zuletzt eingegebene Note. |
| Auswahl wiederholen | Ausserhalb von Note Input wiederholt `R` die Auswahl direkt hinter sich selbst, ueberschreibt die folgende Musik und waehlt die Kopie aus (wie MuseScores Repeat selection); die Zwischenablage bleibt unveraendert. |
| Stimmen | Stimme 1 bis 4 ueber Toolbar oder `Cmd/Ctrl+Alt/Option+1...4`. |
| Insert/Overwrite | `I` oder Toolbar-Schalter wechselt zwischen Einfuegen und Ueberschreiben; `Cmd/Ctrl+I` waehlt Insert, `Cmd/Ctrl+Shift+I` waehlt Overwrite. Einfuegen aus der Zwischenablage ueberschreibt immer die folgende Musik wie in MuseScore und schiebt nie Noten in den naechsten Takt. |
| Akkorde | `Cmd/Ctrl+Shift+H` toggelt Chord Input Mode; Chord Input Mode oder `Shift+A...G` fuegt Akkordtoene am aktuellen Einsatz hinzu. |
| Cursor Insert | `Cmd/Ctrl+Shift+A...G` fuegt explizit am Cursor ein. |
| Oktaven | `Shift+Arrow Up/Down` oder `Cmd/Ctrl+Arrow Up/Down`. |
| Step Keyboard | `P` blendet ein kompaktes QWERTY-Step-Keyboard ein oder aus und aktiviert bei Bedarf Note Input. |
| Microphone Instrument Record | `MIC REC` aktiviert die Mikrofon-Tonhoehenerkennung. Waehle zuerst mit `1` bis `9` den Notenwert und spiele danach einen Ton oder mehrere Toene als Akkord. |
| Live MIDI | `MIDI` unter Entry Modes verwendet alternativ ein angeschlossenes MIDI-Instrument. |

Bei Maus-Eingabe zeigt der Ghost-Note-Cursor an, wo die naechste Note landen wird. `Shift` bevorzugt Insert-Platzierung, `Alt/Option` bevorzugt Chord-Platzierung.
Wenn das Step Keyboard aktiv ist, laufen `Z S X D C V G B H N J M` als `C4` bis `B4` und `Q 2 W 3 E R 5 T 6 Y 7 U` als `C5` bis `B5` durch denselben semantischen Note-Insert-Pfad wie die normale A-G-Eingabe. `P` oder `Escape` verlassen diesen Modus wieder.

Microphone Instrument Record verwendet den gewaehlten Notenwert, die aktive Stimme und den rhythmischen Cursor. Beim Start werden Duration-first-, QWERTY-Step- und Gitarrenbund-Eingabe deaktiviert, damit `1` bis `9` eindeutig den Notenwert waehlen. `Single notes` ist der Standard und schaltet nach jedem angenommenen Ton automatisch zum naechsten rhythmischen Platz. `Build chord` sammelt einzeln gespielte Toene am selben Einsatz; erst die rechte Pfeiltaste wechselt zum naechsten rhythmischen Platz. Mit `Alt/Option+C` kann waehrend der Aufnahme direkt zwischen beiden Erkennungsmodi gewechselt werden. Beide Modi erkennen den Grundton ueber die Periodendauer, damit Instrumentobertoene nicht als zusaetzliche Noten erscheinen. `Guitar · written +8va` notiert jeden klingenden Gitarrenton eine Oktave hoeher und entspricht damit der ueblichen Gitarrennotation. Waerend der Aufnahme meldet die Werkzeugleiste `No input signal`, `Input too low`, `Signal good` oder `Input too high` zusammen mit dem Live-Pegel in dB und zeigt danach den notierten Ton; im Gitarrenmodus wird zusaetzlich der klingende Ton genannt. Sind mehrere Audioeingaenge vorhanden, kann das gewuenschte Mikrofon direkt neben `MIC REC` ausgewaehlt werden. Gehaltene Toene werden nur einmal geschrieben; ein stabiler anderer Ton wird sofort ohne stille Pause angenommen, waehrend eine kurze Stille denselben Ton erneut freigibt.

Der separate MIDI-Button zeigt verbundene Geraete oder wartet auf einen Controller. MIDI-Toene innerhalb von 35 ms werden als ein Akkord notiert. Eine durchgehende rhythmische Echtzeit-Transkription ist in beiden Modi noch nicht enthalten.

## Guitar TAB Input

Die Gitarrenansicht sitzt in der Note Input Toolbar. Aktiviere `Note Input` oder `N`, waehle eine Note oder Cursorposition, und klicke dann `TAB`.

| Funktion | Beschreibung |
| --- | --- |
| Tuning | Standard, Drop D, DADGAD und Open G sind direkt waehlbar. |
| Saiten | Saitenbuttons oder `Alt/Option+1...6` waehlen die aktive Saite. |
| Buende | Bundbuttons oder Zifferntasten setzen den Bund; zwei Ziffern werden als zweistelliger Bund uebernommen. |
| Mini-TAB | Zeigt die gespeicherten String/Fret-Daten der aktiven Note als TAB-Grid an. |
| Techniken | Hammer-on, Pull-off, Slide, Bend, Vibrato, Palm Mute, Let Ring, Dead Note, Harmonic und Pick-Richtung koennen getoggelt werden. |

String, Bund, Tuning und Gitarrentechniken werden als semantische Notendaten gespeichert. Beim MusicXML-Import und -Export werden sie ueber technische Notation erhalten, damit GuitarPro- und MuseScore-Workflows nicht auf reine Pitch-Daten reduziert werden.

## Tonhoehe, Vorzeichen und Dauer

Direkte Bearbeitung ist ueber Toolbar, Tastatur und Palette moeglich:

| Funktion | Bedienung |
| --- | --- |
| Tonhoehe setzen | Note auswaehlen, dann `A` bis `G` oder Pitch-Buttons in der Toolbar. Bei aktivem Input Audition hoert man nach jeder solchen Aenderung den resultierenden Ton. |
| Chromatisch transponieren | `Arrow Up/Down` oder Palette `+/-1 semitone`. |
| Oktavieren | `Shift+Arrow Up/Down`, `Cmd/Ctrl+Arrow Up/Down`, Toolbar `8va+/-`, Palette `+/-1 octave`. |
| Cross-Staff verschieben | `Cmd/Ctrl+Shift+Arrow Up/Down` verschiebt Noten, Akkorde oder gemischte Note/Rest-Bereiche auf den Nachbarstaff, wenn dort passende Rest-Slots liegen. |
| Ganzton / Quinte | Edit Palette `+/-M2` und `+/-P5`. |
| Dauer halbieren/verdoppeln | `Q` / `W`; in Note Input aendern sie die gerade eingegebene Note, der Cursor springt hinter sie. Ein kuerzerer Wert laesst Pausen hinter der Note, die folgenden Noten bleiben an ihrem Platz (wie MuseScore). |
| Punktierte Dauer halbieren/verdoppeln | `Shift+Q` / `Shift+W`. |
| Vorzeichen | Toolbar oder `-` Flat, `=` Natural, `+` Sharp, `Alt/Option+-` Double-flat, `Alt/Option+=` Double-sharp. In Note Input gilt die Wahl fuer genau die naechste erfolgreiche Note. |
| Enharmonische Schreibweise | `J` durchlaeuft fuer die Auswahl die gueltigen Schreibweisen von Double-flat bis Double-sharp, ohne klingende Tonhoehe, Rhythmus oder Entity-Identitaet zu aendern. |

Double-flat und double-sharp sind in der Toolbar und per Tastatur erreichbar. Nach der expliziten Note erlischt der aktive Vorzeichen-Button. Weitere Noten desselben Namens in derselben Oktave und auf demselben Staff behalten den klingenden Alter-Wert bis zum Taktstrich, auch wenn sie in einer anderen Stimme stehen; im naechsten Takt oder in einer anderen Oktave gilt wieder der dortige Kontext beziehungsweise die Tonart. Explizite Natural-, Flat-, Sharp- und Doppelvorzeichen bleiben als geschriebene MusicXML-Accidentals erhalten und werden bei Undo/Redo sowie Copy/Paste semantisch mitgefuehrt. Wiederholtes `J` schaltet eine einzelne Note, Akkordtoene oder eine Bereichsauswahl deterministisch durch enharmonische Schreibweisen. Zusammenhaengende Tie-Fragmente und gepaarte Notation/TAB-Darstellungen werden atomar mitgefuehrt; bei unveraenderter MIDI-Tonhoehe bleibt die vorhandene TAB-Saite samt Bund erhalten. Fuer ein explizit geschriebenes Vorzeichen bieten Edit Palette → Accidentals und Inspector pitch-neutrale Cautionary-Metadaten sowie keine, runde oder eckige Klammern. MusicXML, Copy/Paste, gepaarte Notation/TAB und Undo/Redo erhalten diese Darstellung. Automatische Courtesy-Erkennung und das ansichtsabhaengige `Cmd/Ctrl+J` bleiben offen.

## Artikulationen, Dynamics, Ties und Slurs

Die Note Input Toolbar bietet schnelle Artikulationen fuer die aktive Note. Die Edit Palette enthaelt den volleren Satz.

| Bereich | Funktionen |
| --- | --- |
| Artikulationen | Staccato, Staccatissimo, Accent, Marcato, Tenuto, Fermata. |
| Dynamics | `pp`, `p`, `mp`, `mf`, `f`, `ff`, `fff`, `sfz`. |
| Tie | Verbindet eine Note mit der naechsten gleichhoehen Note. Shortcut: `T`. |
| Slur | Span ueber Auswahl oder zur naechsten Note. Shortcut: `S`. |
| Grace Note | `/` fuegt eine eigene zeitlose Vorschlagsnote vor dem Anker ein, ohne Dauer oder Identitaet der Hauptnote zu aendern; Taktanfang und gepaarte Notation/TAB werden unterstuetzt. |
| Tuplets | Genau eine Note, einen Akkord oder eine Pause waehlen und mit den Tuplet-Buttons 2:3 bis 9:8 bzw. `Cmd/Ctrl+2...9` deren Dauer teilen; die zusaetzlichen Einheiten sind direkt eingebbare Pausen. |
| Stem direction | `X` flippt die Halsrichtung der ausgewaehlten Note und speichert sie als MusicXML-Stem. |
| Slash notehead | `Shift+X` toggelt den Slash-Notehead der ausgewaehlten Note ueber die semantische Notenstil-Operation. |

Hinweis: Einige visuelle Notationszeichen koennen je nach Playback-Engine nur visuell wirken und nicht hoerbar interpretiert werden.
Richtungs-/Placement-Bearbeitung bleibt bewusst konservativ: Der Inspector bietet jetzt semantisches Placement fuer Staff Text, Expression Text, Dynamics, vorhandene Artikulationen/Fermaten, bereits vorhandene Tie-Starts und bereits vorhandene Slur-Spans, waehrend Direction-Placement fuer Wedges oder Ottavas im Core/Import/Export weiterhin roundtrip-sicher erhalten bleibt.

## Barlines, Repeats und Slashes

Die Edit Palette setzt Barlines am Ende des ausgewaehlten Takts:

| Barline | Zweck |
| --- | --- |
| Regular | Normale Taktlinie. |
| Double | Doppelte Taktlinie. |
| Final | Schlussstrich. |
| Start repeat | Wiederholungsanfang. |
| End repeat | Wiederholungsende. |

Zusaetzliche Funktionen:

| Funktion | Beschreibung |
| --- | --- |
| Insert rhythmic slash | Fuegt einen Slash an der Auswahl ein. |
| Fill measure with slashes | Fuellt den aktuellen Takt mit rhythmischen Slashes. Shortcut: `Cmd/Ctrl+/`. |
| Repeats & Endings im Inspector | Start repeat, End repeat, 1st ending und 2nd ending setzen. |

## Akkordsymbole, Lyrics und Text

| Funktion | Ort |
| --- | --- |
| Akkordsymbol setzen | Note auswaehlen und `Cmd/Ctrl+K` druecken; der Akkordcursor erscheint direkt an der Note. |
| Rehearsal Mark | Inspector, Bereich Text & Rehearsal. |
| Staff Text / Expression | Inspector, Bereich Text & Rehearsal. |
| Lyrics | Inspector, Note auswaehlen, Text und Versnummer setzen, dann Attach lyric line. |

`Cmd/Ctrl+K` oeffnet bei ausgewaehlter Note den Inline-Harmony-Editor direkt an der Partiturposition. Der Cursor laedt ein vorhandenes Akkordsymbol der selektierten Note zum direkten Ueberschreiben; `Enter` uebernimmt, `Escape` bricht ab. Ohne Notenauswahl bleibt `Cmd/Ctrl+K` der Einstieg ins Command Center. Im Inspector laden Lyrics-Felder sowie Dynamics bei aktiver Note vorhandene semantische Werte vor; bei Dynamics wird jetzt auch das vorhandene Placement uebernommen. Staff Text und Expression Text koennen ober- oder unterhalb des Staffs gesetzt werden, eine bestehende Artikulation oder Fermate der selektierten Note kann ober- oder unterhalb gesetzt werden, eine ausgewaehlte Tie-Start-Note kann den Tie ober- oder unterhalb setzen, und eine bereits vorhandene Slur ueber der aktuellen semantischen Auswahl kann dort ebenfalls auf ober- oder unterhalb gestellt werden. `Enter` uebernimmt Rehearsal Mark, Staff Text, Lyrics oder Dynamics direkt ueber den Command-Pfad.

Der AI-Chat kann ebenfalls Akkordsymbole und Texte erzeugen, wenn der Prompt klar genug ist.

## Inspector

Der Inspector ist der strukturierte Editor fuer scoreweite und taktbezogene Operationen.
Die Bereiche sind als ein- und ausklappbare Sektionen organisiert. Die Chips direkt unter der Inspector-Ueberschrift blenden einzelne Bereiche schneller ein oder aus, damit du bei Text-, Struktur- oder Part-Workflows nicht durch die komplette Seitenleiste scrollen musst. Befehle aus dem Command Center und die Text-Shortcuts oeffnen bei Bedarf automatisch die passende Inspector-Sektion.

| Abschnitt | Funktionen |
| --- | --- |
| Selection | Ausgewaehlte Range transponieren, Artikulationen loeschen, Staccato/Accent toggeln, `mf` setzen, Slur ueber Auswahl toggeln sowie bestehende Artikulationen, Fermaten, Tie-Starts und Slur-Spans ober-/unterhalb platzieren. |
| Score Setup | Titel, Untertitel, Komponist, Arrangeur setzen. |
| Key | Presets fuer C, G, D, A, F und Bb major. |
| Repeats & Endings | Start repeat, End repeat, 1st ending, 2nd ending. |
| Time & Clef | Taktarten 4/4, 3/4, 6/8, 2/2; Clefs Treble, Bass, Alto. |
| Measure | Takt einfuegen/loeschen, System Break, Page Break, Staff Spacing sowie Balanced/Relaxed/Open Collision Spacing. |
| Text & Rehearsal | Rehearsal Marks, Staff Text vs. Expression Text sowie Above/Below-Placement fuer Text und Dynamics. |
| Lyrics | Lyrics an selektierte Noten haengen. |
| Parts & Instruments | Part Name, Abbreviation, Instrument Name, Transposition, Part Extraction und Layout-Presets. |

Um die Taktart eines Takts zu aendern, eine Note oder Pause in diesem Takt auswaehlen, **Inspector → Time & Clef** oeffnen und die Ziel-Taktart waehlen. Bereits geschriebene Musik wird in die neue Taktart umgebrochen statt verworfen; bei einer kuerzeren Taktart kann deshalb ein weiterer Takt entstehen.

Eine Note oder Pause auswaehlen und `Delete` oder `Backspace` druecken, um sie durch eine gleich lange Pause zu ersetzen. Im Note Input ersetzt oder teilt eine an einer ausgewaehlten Pause eingegebene Note diese Pause entsprechend der gewaehlten Dauer; zwei Achtelnoten an einer Viertelpause fuellen genau diese Viertelposition.

Part Extraction oeffnet eine ausgezogene Stimme als eigene Arbeitsfassung.

## Edit Palette

Die linke Palette kann ausgeklappt, eingeklappt oder im Icon-Rail-Modus genutzt werden.
Das Command Center indexiert haeufige Palette-Edits wie Transposition, Cut/Copy/Paste, Duplicate, Tie/Slur, Staccato/Accent/Tenuto, Dynamics, Final-/Repeat-Barlines und Note-Input-Stimmenwechsel mit denselben Disabled-Gruenden wie die Palette. Inspector-Feldaktionen fuer Staff Text, Rehearsal Mark, Lyrics und Dynamic Marking sind zusaetzlich als gemeinsamer Abschnitt gruppiert, damit Text-Workflows schneller auffindbar bleiben. Fuer Akkordsymbole oeffnet `Cmd/Ctrl+K` bei aktiver Notenauswahl direkt den Inline-Harmony-Editor; ohne Auswahl oeffnet derselbe Shortcut weiter das Command Center.
Inspector-Workflows fuer Taktstruktur und Wiederholungen sind als eigene Gruppe `Structure` organisiert, damit Einfuegen/Loeschen von Takten, Endings sowie System- und Seitenumbrueche schneller auffindbar bleiben.
Score-Metadaten, Tonart, Takt/Clef, Lyrics sowie Part-/Instrument-Workflows sind zusaetzlich als Gruppe `Inspector` organisiert, damit dieselben Bereiche direkt aus dem Command Center geoeffnet werden koennen, ohne zuerst die Sidebar-Chips manuell zu durchsuchen.
In der Palette zeigen Selection- sowie Tie/Slur-Aktionen beim Hover dieselben Shortcut-Hinweise wie die zugehoerigen Tastaturbefehle.

| Sektion | Funktionen |
| --- | --- |
| Selection | Copy, Paste, Duplicate, Delete, Clear selection. |
| Transpose | Oktave, Halbton, Ganzton, perfekte Quinte nach oben/unten. |
| Articulations | Staccato, Staccatissimo, Accent, Marcato, Tenuto, Fermata, Clear articulations; Placement fuer bestehende selektierte Zeichen liegt im Inspector. |
| Dynamics | pp bis fff und sfz. |
| Ties / Slurs | Tie und Slur toggeln. |
| Barlines | Regular, double, final, repeat start, repeat end. |

Viele Werkzeuge sind deaktiviert, bis eine Note oder ein Bereich ausgewaehlt ist.

## Playback

Die Playback-Leiste bietet:

| Funktion | Beschreibung |
| --- | --- |
| Play/Pause | Startet oder pausiert die Wiedergabe. Shortcut: `Space`. |
| Start from selected note | Wenn Playback gestoppt ist und eine Note aktiv ist, startet Play ab dieser Note. |
| Stop | Setzt die Wiedergabe zurueck. |
| Tempo | Slider fuer BPM. |
| Metronome | Klick waehrend Playback ein-/ausschalten. |
| Progress bar | Zeigt Fortschritt und erlaubt Seek per Klick. |
| Cursor | Der Score zeigt waehrend Playback die aktuelle Position. |

MIDI- und Soundfont-Ladevorgaenge koennen beim ersten Start kurz dauern.

## AI Assistant

Der AI-Tab oeffnet den Chat fuer natuerliche Score-Arbeit. Du kannst Aenderungen frei beschreiben oder Slash-Workflows wie `/arrange`, `/analyze`, `/practice`, `/layout`, `/repair` und MIDI-/Import-Cleanup-Prompts verwenden. Wenn eine Note, ein Bereich, ein Takt oder eine Stimme ausgewaehlt ist, bekommt der Assistant diesen Kontext und kann den Vorschlag auf die aktuelle Musik begrenzen.

Arrangement-Anfragen laufen ueber den Arrangement Assistant. Provider-gestuetzte Plaene werden vom Critic geprueft und danach, wenn der Score-Kontext es erlaubt, als ausgeschriebene Stimmen mit Akkordsymbolen materialisiert. Die Vorschau zeigt vorbereitete Operationen wie das Leeren des Zielstimmenbereichs, das Einfuegen der realisierten Noten und das Setzen von Akkorden; gekoppelte Gitarren-TAB-Systeme werden gespiegelt, soweit die Toene spielbar sind.

Score-aendernde Arrangements, Layout-Aenderungen und andere riskante Batches bleiben preview-gated. Die Partitur aendert sich nicht, wenn die Vorschau erscheint. Klicke **Apply** oder tippe `apply`, um die Operationen in die Partitur zu schreiben; klicke **Cancel** oder tippe `cancel`, um sie zu verwerfen. Die Preview listet betroffene Takte, Risiken, Validator-Hinweise und eine Zusammenfassung der vorbereiteten Commands.

Provider richtest du in **AI model settings** ein. Claude und Gemini benoetigen dort ihre API-Keys; Ollama nutzt deinen lokalen Ollama-Server und kann erkannte Modelle oder ein eigenes `model:tag` verwenden. Ausgewaehlter Provider und Modell werden in der Kopfzeile und in Assistant-Antworten angezeigt.

Wenn kein Provider eingerichtet ist, ein Provider-Aufruf fehlschlaegt oder die Anfrage zu einem deterministischen lokalen Workflow passt, nutzt nex-note lokale Helfer. Diese koennen die Partitur analysieren, Practice-Versionen vorschlagen, Akkord-/Ausdrucks-Previews erzeugen, einfache Arrangements behandeln und Layout Cleanup ausfuehren, ohne die Partitur an einen Cloud-Provider zu senden. Score-aendernde lokale Fallbacks verwenden dasselbe Preview/Apply/Cancel-Modell.

Lokale Chat-Kommandos:

| Eingabe | Aktion |
| --- | --- |
| `undo` | Letzte Aenderung rueckgaengig. |
| `redo` | Rueckgaengig gemachte Aenderung wiederherstellen. |
| `apply`, `confirm`, `yes`, `ja`, `anwenden` | Preview anwenden. |
| `cancel`, `no`, `nein`, `abbrechen` | Preview verwerfen. |

## AI Provider und Benchmarks

Provider-Auswahl:

| Provider | Zweck |
| --- | --- |
| Ollama | Lokale oder remote Ollama-Modelle; Standardpfad fuer lokale Arbeit. |
| Claude | Externer Provider, falls API-Key konfiguriert ist. |
| Gemini | Externer Provider, falls API-Key konfiguriert ist. |
| Benchmark | Fuehrt denselben Prompt gegen mehrere Provider aus. |

Ollama-Modelle koennen aus der geladenen Modellliste gewaehlt oder als Custom Model `model:tag` hinzugefuegt werden.

Benchmark-Funktionen:

| Funktion | Beschreibung |
| --- | --- |
| In-app Benchmark | Vergleicht Provider fuer denselben Prompt und zeigt Ergebnis, Latenz, XML-Validitaet und Operationen. |
| Ollama Model Suite | Testet mehrere Ollama-Modelle gegen eine kuratierte Suite. |
| CLI Benchmark | `npm run benchmark` und `npm run benchmark:quick` fuer Headless-Auswertung. |

## Library und Recent Files

Die Library speichert geladene Partituren lokal im Browser.

| Funktion | Beschreibung |
| --- | --- |
| Open | Partitur aus der Library oeffnen. |
| Favorites | Partituren markieren und filtern. |
| Search | Nach Titel oder Format filtern. |
| Stats | Anzahl Scores, Favoriten, Takte und Parts. |
| Remove | Einzelne Partitur entfernen. |
| Clear all | Lokale Library leeren. |

Recent Files zeigt zuletzt geoeffnete Dateien fuer schnellen Zugriff. Browser-Speicher ist lokal; ein anderer Browser oder geloeschter Storage hat eine andere Library.

Nex-note verwendet fuer schnelles Wiedereroeffnen eine `.nxn` Arbeitskopie im gewaehlten Projektordner `nex-note-projects`. Die Library speichert nur Metadaten und den Dateinamen dieser Arbeitskopie; der eigentliche `.nxn` Projektzustand liegt als Datei im gewaehlten Ordner. Wenn du den Projektordner verschiebst oder loeschst, bleiben Originaldateien unveraendert; nex-note muss sie dann beim naechsten Oeffnen wieder importieren oder konvertieren.

## Export und Speichern

| Funktion | Ergebnis |
| --- | --- |
| Save as library score | Speichert die aktuelle Partitur in der lokalen Library. |
| Save project `.nxn` | Exportiert ein editierbares nex-note Projekt. |
| Export compressed MusicXML | Laedt eine `.mxl` Datei herunter. |
| Export ABC notation | Laedt `.abc`; nutzt MuseScore CLI oder internen Fallback. |
| Export practice pack | Erstellt ein JSON Practice Pack. |
| Print view / Print score | Wechselt in Druckansicht bzw. startet Browser-Print. |

MXL ist der wichtigste Rueckweg nach MuseScore, Finale, Dorico oder Sibelius. Fuer Entwickler- und Release-Pruefungen gibt es zusaetzlich `npm run smoke:musescore-roundtrip`; dieser Harness prueft MusicXML, app-style MXL und MSCZ ueber MuseScore CLI und schreibt Diagnose-Artefakte unter `.nex/musescore-roundtrip-smoke-*`.

## Layout und Ansicht

| Funktion | Beschreibung |
| --- | --- |
| Zoom | Buttons, Prozentfeld, Presets und Shortcuts. |
| View Mode | Wechsel zwischen verfuegbaren Score-Ansichten. |
| Navigator | Mini-Uebersicht ueber Seiten und aktuelle Viewport-Position. |
| Find/Go to | Direkt zu Takt, Seite oder Ziel springen. |
| Layout Cleanup | AI-gestuetzte Layout-Bereinigung mit Preview/Confirm. |
| System/Page Breaks | Inspector setzt Breaks fuer aktuellen Takt oder Part. |
| Staff Spacing | Inspector setzt Abstand pro Takt oder Part. |
| Collision Spacing | Inspector setzt ab dem aktuellen Takt `Balanced`, `Relaxed` oder `Open`; spaetere Policies ersetzen fruehere und gelten fuer den ausgewaehlten Staff. |
| Print Layout Presets | Compact, Balanced, Roomy, Choir fuer Parts. |

## Undo, Redo und Verlauf

Undo/Redo funktioniert ueber den semantischen Command-Verlauf:

| Aktion | Shortcut |
| --- | --- |
| Undo | `Cmd/Ctrl+Z` |
| Redo | `Cmd/Ctrl+Shift+Z` oder `Cmd/Ctrl+Y` |

Der Verlauf ist auf eine feste Laenge begrenzt. Nach sehr vielen Aenderungen koennen alte Schritte aus dem Verlauf fallen.

In Note Input setzt Undo den Eingabecursor an die Stelle zurueck, an der die rueckgaengig gemachte Note oder Pause eingegeben wurde, und die Eingabe geht dort weiter; die Note vor dem Cursor bestimmt die Oktave des naechsten Buchstabens. Redo setzt den Cursor hinter die wiederhergestellte Eingabe.

## Debug und Bug Reports

Im Debug-Modus erscheint ein `Report bug` Button. Der Bug Report exportiert ein Bundle mit:

| Inhalt | Zweck |
| --- | --- |
| aktuelle Score-Daten | Reproduktion mit demselben Material. |
| Runtime State | UI- und App-Zustand zum Zeitpunkt des Fehlers. |
| Action Trace | Letzte Nutzeraktionen. |
| Markdown und JSON Report | Menschlich lesbar und toolfreundlich. |

Doctor Mode und Visual Debug helfen bei Note-Input-, Rhythmus-, Layout- und Semantikproblemen. Details stehen im README und in den Debug-Dokumenten.

## Bekannte Grenzen

| Bereich | Aktuelle Grenze |
| --- | --- |
| AI | Qualitaet haengt vom Provider/Modell ab; riskante Aenderungen sollten ueber Preview geprueft werden. |
| PDF/Bild-Import | Benoetigt Audiveris und kann bei komplexen Scans oder Fotos fehlschlagen. |
| MSCZ/GuitarPro/ABC/MIDI | Benoetigt MuseScore CLI fuer beste Ergebnisse. |
| MuseScore CLI Roundtrip | Der Harness unterscheidet nex-note Exportfehler von lokalen MuseScore-Abstuerzen. Auf der aktuellen macOS-Testmaschine stuerzt MuseScore 4.7.3 teils auch bei Source-Baseline-Konvertierungen mit `mutex lock failed` ab; MSCZ-Paritaet bleibt deshalb ein akzeptiertes Alpha-Limit bis zur Pruefung auf einer stabilen MuseScore-Installation. |
| Playback | Manche Notationszeichen sind je nach Engine visuell, aber nicht zwingend hoerbar. |
| Keyboard | Einige MuseScore/Finale-Shortcuts fehlen noch; siehe [keyboard-shortcuts.md](./keyboard-shortcuts.md). |
| Text- und Layoutfeinheiten | Nicht alle Desktop-Notation-Feinheiten aus MuseScore/Finale sind bereits als direkte UI-Funktion vorhanden. |

## Schnelle Workflows

### Datei importieren und als MXL exportieren

1. Datei auf die Upload-Zone ziehen oder `Datei öffnen` klicken.
2. Warten, bis die Partitur gerendert ist.
3. Optional bearbeiten oder abspielen.
4. `Export compressed MusicXML` aus Command Center oder Export UI ausfuehren.

### Note direkt eingeben

1. Note oder Taktposition anklicken.
2. `N` druecken.
3. Dauer mit `1` bis `9` waehlen.
4. Tonhoehe mit `A` bis `G` eingeben.
5. Optional `.` fuer Punktierung, `0` fuer Rest, `Shift+A...G` fuer Akkordton.

### Bereich bearbeiten

1. Erste Note anklicken.
2. Mit `Shift+Click` oder `Shift+ArrowRight` Bereich erweitern.
3. Edit Palette oder Inspector verwenden, z. B. Transpose, Articulation, Dynamic, Slur.
4. Ergebnis pruefen und bei Bedarf `Cmd/Ctrl+Z`.

### AI-Aenderung sicher anwenden

1. Relevante Noten oder Takte auswaehlen, wenn die AI nur dort arbeiten soll.
2. Im AI-Tab Prompt eingeben.
3. Preview, betroffene Takte und Validator-Hinweise lesen.
4. `apply` zum Anwenden oder `cancel` zum Verwerfen.

### Stimme extrahieren und layouten

1. Inspector oeffnen.
2. Unter `Parts & Instruments` den Part suchen.
3. `Open extracted part` klicken.
4. Print Layout Preset oder Breaks/Spacing setzen.
5. Als MXL oder Projekt exportieren.
