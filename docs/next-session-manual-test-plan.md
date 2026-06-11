# Next Session Manual Test Plan

Historical validation checklist and findings log from a prior release-hardening pass. For the current release status, use [final-release-readiness-summary.md](./final-release-readiness-summary.md).

## Release Validation Status

- Updated: 2026-04-16
- Targeted post-hardening regression suites for AI workflow routing and fallback reduction: passed
- Full `npm test`: passed on 2026-04-16 on the final runtime-fix branch state (`145` tests)
- Full `npm run build`: passed on 2026-04-16 on the final runtime-fix branch state
- Manual UI validation in this environment: advanced materially on 2026-04-16; the previously open leadsheet and multi-voice runtime targeting blockers are no longer reproducible
- This file remains the release-validation checklist and findings log before a public release cut

## Session Goal

Die naechste Session soll nicht "noch mehr analysieren", sondern in einer klaren Reihenfolge:

1. die offenen manuellen Editor-/Import-/AI-Wege an echten Scores testen
2. alle Findings sofort strukturiert loggen
3. daraus nur die 2-3 wichtigsten Architektur-Fixes ableiten
4. nur diese Fixes umsetzen
5. danach Re-Test plus `npm test` und `npm run build`

Der Engpass ist aktuell nicht die reine Testabdeckung, sondern die letzte Luecke zwischen:

- bestehender automatischer Core-/Roundtrip-Abdeckung
- echtem UI-/Workflow-Verhalten auf realen Dateien
- sauber priorisierten Architektur-Fixes mit hohem Hebel

## Expected Session Output

Am Ende der Session sollten diese Artefakte vorliegen:

- ein ausgefuellter Findings-Log in dieser Datei
- eine kurze Top-3-Liste priorisierter Fixes mit Begruendung
- ein klarer Entscheid, welche Findings jetzt umgesetzt werden und welche bewusst spaeter bleiben
- ein dokumentierter Re-Test-Stand
- ein aktueller `npm test`- und `npm run build`-Status

## Findings Log

- 2026-04-15: manueller UI-Lauf in headless Chrome gestartet und auf `test/fixtures/choir-lyrics.musicxml` reproduzierbar bis in echte Score-Selection hinein ausgefuehrt
- 2026-04-15: urspruenglicher Release-Blocker gefunden; Inspector `Transpose +2` verlor auf `test/fixtures/choir-lyrics.musicxml` Selection und Overlay sofort nach dem Edit
- 2026-04-15: Blocker anschliessend gezielt behoben; echte Browser-Reproduktion des exakten Choir-Workflows erneut ausgefuehrt
- 2026-04-15: verifiziert im echten UI-Flow:
  - `test/fixtures/choir-lyrics.musicxml`
  - zwei gerenderte Noten selektiert
  - Inspector geoeffnet
  - `Transpose +2` ausgefuehrt
  - Ergebnis nach Fix: semantische Selection bleibt aktiv, Inspector bleibt auf `Selected 2 item(s)`, Overlay-/Target-Mapping bleibt erhalten
- 2026-04-15: Ursache eingegrenzt:
  - OSMD-/Render-Locators kamen im Live-UI teilweise in gekuerzten Bruechen (`0/1`, `1/4`)
  - Core-/Selection-Restore arbeitete fuer denselben musikalischen Ort mit kanonischen Taktrastern (`0/8`, `2/8`)
  - die bisherige Runtime verglich Timestamp-Zaeher/Nenner strikt statt rational aequivalent
  - dadurch bekamen Live-Selections im Browser teils keine stabilen Core-IDs und `restoreSelection` fand nach dem Semantic-Edit keine Treffer
- 2026-04-15: Fix-Strategie bewusst klein gehalten:
  - keine neue XML-Mutationsspur
  - keine Abschwaechung der semantischen Command-Pipeline
  - nur rational-aequivalentes Timestamp-Matching in Render-Bridge und Selection-Restore
- 2026-04-15: Rest der finalen manuellen Matrix in dieser Session nicht vollstaendig abgeschlossen; deshalb bleibt der Release-Entscheid trotz behobenem Hauptblocker vorerst `no-go`
- Externe echte Multi-Voice-Datei mit mehr als einer Voice pro Measure war in diesem Repo-Workspace nicht vorhanden; dieser Teil des Plans bleibt zusaetzlich offen, wurde aber vom unten dokumentierten Release-Blocker bereits ueberschattet
- 2026-04-16: `test/fixtures/piano-semantics.musicxml` im echten UI erneut geladen und fuer staff-uebergreifende Selection geprueft
- 2026-04-16: verifiziert im Piano-Flow:
  - obere und untere Staff-Note koennen gemeinsam aktiv selektiert werden
  - Inspector bleibt dabei auf `Selected 2 item(s)` und adressiert die kombinierte Selection stabil
  - Copy/Paste auf dieser Live-Selection fuehrt im gerenderten Dokument zu zusaetzlichen Noten; kein unmittelbarer Selection-/Render-Absturz sichtbar
- 2026-04-16: Undo/Redo fuer denselben Piano-Paste-Fall konnte in dieser headless Automationsspur noch nicht belastbar als Produktverhalten verifiziert werden
  - die Reproduktion laeuft hier ueber synthetische Tastatur-Events statt reale Tastatureingabe
  - deshalb noch nicht als Produkt-Finding oder Release-Blocker geloggt
- 2026-04-16: weiterer verifizierter Piano-Runtime-Pass ueber frische Headless-Seite mit In-App-Library-Load:
  - `piano-semantics.musicxml` erfolgreich ueber die reale UI geoeffnet, nicht ueber Core-Testpfad
  - staff-spanning Selection laesst sich im echten Score von oberem Staff bis in den unteren Staff erweitern; Inspector meldet dabei stabil `Selected 4 item(s) across m.1-1.`
  - Fokus springt dabei sichtbar auf eine untere-Staff-Note (`A4` in der Toolbar), also nicht nur auf eine rein obere Staff-Range
  - Toolbar `Copy` + `Paste` auf dieser Live-Selection fuehrt unter echtem Rerender von `5` auf `8` gerenderte `vf-stavenote`-Elemente; kein Overlay-/Inspector-Absturz beobachtet
  - Inspector-Targeting bleibt nach diesem Paste auf `Selected 4 item(s) across m.1-1.` stabil und faellt nicht auf `No semantic selection active.`
- 2026-04-16: offene Piano-Gap nach diesem Lauf:
  - Undo/Redo fuer denselben Paste-Fall ist in dieser synthetischen CDP-Spur weiterhin nicht belastbar bestaetigt
  - weder Toolbar- noch Keyboard-Ausloesung lieferte hier einen vertrauenswuerdigen Runtime-Nachweis fuer den erwarteten Ruecksprung von `8` auf `5` Noten
  - bis zu einer staerkeren realen Eingabe-Evidenz bleibt dieser Teil der finalen Matrix konservativ offen
- 2026-04-16: `test/fixtures/leadsheet-repeat.musicxml` ueber dieselbe reale UI-Library-Spur geladen
- 2026-04-16: verifiziert im Leadsheet-Flow:
  - Inspector-Repeat/Ending-Buttons reagieren im echten UI, wenn sie ueber echte Maus-Events ausgeloest werden
  - `2nd ending` aktualisiert den gespeicherten Runtime-Score von `<ending number="1" type="start">` auf `<ending number="2" type="start">`
  - realer Export-API-Pfad plus direkter Reimport ueber `/api/download` -> `/api/convert-pdf` bleibt fuer diesen bearbeiteten Leadsheet-Fall stabil
  - Reimport-Beleg:
    - `exportedBytes: 938`
    - `hasEnding2: true`
    - `hasRepeatForward: true`
    - `hasRepeatBackward: true`
    - `measures: 2`
- 2026-04-16: neuer echter Release-Blocker im Leadsheet-Runtime-Flow gefunden:
  - semantische Klick-Selektion auf diesem Score ist im echten Render-UI nicht zuverlaessig
  - Klicks im Bereich von Measure 1 landen reproduzierbar auf `SELECTION -> Rest` in `m.2`, statt auf der erwarteten Measure-1-Note
  - im gerenderten DOM erscheint fuer diese Runtime-Spur nur ein `vf-stavenote`/`vf-notehead`-Treffer bei der unteren Measure-2-Position; fuer Measure 1 gibt es keinen verifizierbaren semantischen Note-Treffer
  - damit ist `AI-with-selection` auf diesem Leadsheet-Fall derzeit nicht vertrauenswuerdig validierbar, weil schon die aktive Selection-Grenze im realen UI auf das falsche musikalische Ziel driftet
- 2026-04-16: temporaere echte Multi-Voice-Runtime-Datei aus dem bereits vorhandenen Testsample angelegt:
  - `test/fixtures/temp-multi-voice-runtime.musicxml`
  - enthaelt denselben Workspace-Fall mit `<backup>` und zwei Voices in Measure 1, der bereits in `test/score-architecture.test.ts` verwendet wird
- 2026-04-16: Multi-Voice-Runtime-Finding:
  - der Score laedt im echten UI und rendert zwei getrennte `vf-stavenote`-/`vf-notehead`-Treffer
  - semantische Klick-Selektion ist aber auch hier nicht vertrauenswuerdig: beide gerenderten Noteheads landen reproduzierbar auf demselben falschen Toolbar-Ziel `SELECTION -> G0`
  - damit ist der reale Voice-/Target-Mapping-Pfad fuer diesen Multi-Voice-Fall ebenfalls nicht release-tauglich bestaetigt
- 2026-04-16: Leadsheet-Runtime-Fix und Re-Test:
  - gezielter Render-/Selection-Fix umgesetzt, ohne neue XML-Mutationsspur oder Parallel-Subsystem
  - echter Browser-Re-Test auf `test/fixtures/leadsheet-repeat.musicxml` erneut ueber In-App-Library-Load ausgefuehrt
  - verifiziert:
    - Klick im Measure-1-Notenbereich selektiert jetzt wieder `C5` auf `m.1`
    - Klick auf den weiterhin gerenderten Measure-2-Rest selektiert weiterhin korrekt `Rest` auf `m.2`
    - der vorherige Drift von Measure 1 auf den Measure-2-Rest ist in dieser Runtime-Spur nicht mehr reproduzierbar
- 2026-04-16: Multi-Voice-Runtime-Fix und Re-Test:
  - gezielter Hit-Testing-/Target-Resolution-Fix auf DOM-Measure- plus Core-Semantik-Fallback eingegrenzt und umgesetzt
  - echter Browser-Re-Test auf `test/fixtures/temp-multi-voice-runtime.musicxml` ueber dieselbe reale UI-Library-Spur ausgefuehrt
  - verifiziert:
    - oberer Notehead selektiert `C4` auf `m.1`
    - unterer Notehead selektiert `G3` auf `m.1`
    - die vorherige Kollision beider Noteheads auf dasselbe falsche Ziel ist in dieser Runtime-Spur nicht mehr reproduzierbar
- 2026-04-16: AI-with-selection Boundary-Re-Test nach den Runtime-Targeting-Fixes:
  - Live-Browser-Kontext auf `temp-multi-voice-runtime.musicxml` mit aktiv selektierter unterer Voice-Note `G3`
  - Browser-zu-`/api/chat`-Pfad mit exakt dieser aktiven Selection erneut ausgefuehrt
  - verifiziert:
    - Selection-Kontext erreicht die AI-Pipeline mit `voiceId: 2` und `entityIds: ['event:1:1:2:0:4:0']`
    - der AI-Intent `transposeChromatic +2` wird nicht mehr als invalider Command gedroppt
    - die resultierende Runtime-/API-Antwort aendert nur die selektierte untere Voice-Note von `G3` auf `A3`
    - die obere Voice-Note bleibt dabei `C4`; der Boundary-Target bleibt also auf die aktive Selection begrenzt

## Current Baseline

- Branch: `codex/core-first-semantic-editor`
- frueherer gruener Baseline-Stand vor den Phase-6-8-Hardening-Aenderungen vorhanden
- gezielte Post-Hardening-Regressionen: gruen
- voller `npm test`-Lauf: gruen (`137` Tests)
- `npm run build`: erfolgreich
- Reproduzierbare Build-Warnung:
  - `Turbopack build encountered 1 warnings`
  - `./next.config.ts`
  - `Encountered unexpected file in NFT list`
  - Import trace: `./next.config.ts` -> `./app/api/midi/route.ts`

## Important Context Before Testing

- Die manuelle UI-Testsession ist noch offen. Diese Datei ist die operative Checkliste dafuer.
- Die automatische Suite deckt bereits Core-Execution, Range-Selection, AI-Pipeline, Undo/Redo und Roundtrip-Golden-Faelle ab.
- Die wichtigste bereits bekannte Architektur-Unschraerfe ist die Diskrepanz zwischen Doku und Runtime:
  - `docs/migration-status.md` sagt: kein Legacy-Fallback mehr im aktuellen Public-Command-Set
  - `src/score-core/commands/hybrid-command-executor.ts` erzwingt weiterhin echten Fallback bei verbleibenden `unsafe_roundtrip_tags`
  - `<backup>` und `<forward>` zaehlen seit dem aktuellen Hardening nicht mehr zu diesen Rest-Fallbacks
  - `test/score-architecture.test.ts` prueft diesen Fallback explizit mit `glissando`
- Deshalb muss die Session nicht nur UI-Fehler finden, sondern auch sichtbar machen, wo Core-first in realen Workflows noch nicht wirklich "Core-only" ist.

## Current Verified Status

Dieser Stand ist bereits lokal reproduziert und muss in der Session nicht mehr als unbekannt behandelt werden:

- gezielte Post-Hardening-Regressionen: gruen
- voller `npm test`-Lauf: gruen (`141` Tests) auf aktuellem Stand
- `npm run build`: erfolgreich auf aktuellem Stand
- Build-Warnung bleibt bestehen:
  - `Turbopack build encountered 1 warnings`
  - `Encountered unexpected file in NFT list`
  - Import trace: `./next.config.ts` -> `./app/api/midi/route.ts`

Automatisch bereits abgedeckt:

- Range-Selection-Logik im Hook
- Paste mit relativen Offsets
- Overwrite-vs-Insert auf Selection-Slots
- AI-Selection-Context und `affectedMeasures`
- Undo/Redo auf core-basiertem History-Stack
- Core-Execution fuer:
  - Lyrics / `setLyricLine`
  - Layout-Hints / `setMeasureLayoutHint`
  - Part-Metadata und Transposition
  - Measure-Struktur
  - Range-Commands
  - Artikulationen / Notation
- Golden Roundtrip fuer:
  - `choir-lyrics.musicxml`
  - `piano-semantics.musicxml`
  - `leadsheet-repeat.musicxml`
- Legacy-Fallback fuer komplexe XML-Roundtrips ist bewusst noch aktiv und getestet
- Standard-Multi-Voice-Dateien mit `<backup>` oder `<forward>` muessen dafuer nicht mehr automatisch in den Fallback kippen

Das bedeutet:

- Die naechste Session soll nicht dieselben Logiken "nochmal abstrakt bestaetigen"
- Sie soll pruefen, ob dieselben Faehigkeiten in echten UI-Workflows, mit Renderer, Selection-Overlay, Inspector und echten Dateien sauber zusammenspielen

## Current Manual Validation Outcome

Stand nach diesem Fix-Lauf:

- Choir-Inspector-Blocker: behoben und im echten Browser-Workflow erneut bestaetigt
- Overlay-/Selection-Restore fuer diesen konkreten Inspector-Transpose-Pfad: jetzt stabil
- Vollstaendige Abschlussmatrix fuer:
  - `piano-semantics.musicxml`
  - `leadsheet-repeat.musicxml`
  - AI mit aktiver Selection
  - Import -> Edit -> Export -> Reimport
  - Legacy-Fallback-Sichtung unter realem UI-Lauf
  - echte Multi-Voice-Datei mit mehr als einer Voice pro Measure
  ist in dieser Session weiterhin nicht komplett als manueller Browserlauf abgehakt

Darum gilt weiterhin:

- der zentrale bekannte Release-Blocker ist weg
- aber der finale Release-Cut bleibt gesperrt, bis die restliche manuelle Matrix wirklich im Runtime-Verhalten abgeschlossen ist

## Entrance Criteria

Vor dem eigentlichen manuellen Testlauf kurz absichern:

- App startet lokal reproduzierbar
- Ausgangsscore kann geladen, editiert und exportiert werden
- Die drei Fixture-Scores sind direkt griffbereit:
  - `test/fixtures/choir-lyrics.musicxml`
  - `test/fixtures/piano-semantics.musicxml`
  - `test/fixtures/leadsheet-repeat.musicxml`
- Zusaetzlich mindestens eine echte Multi-Voice-Datei mit mehr als einer Voice pro Measure bereitlegen
- Diese Datei hier offen lassen und Findings sofort mitschreiben, nicht erst am Ende rekonstruieren
- Optional, aber hilfreich: parallel ein Export/XML-Fenster oder diff-faehigen Editor offen halten

## Working Mode During The Session

Fuer jeden Testfall dieselbe Schleife verwenden:

1. Score laden
2. Einen eng begrenzten Workflow ausfuehren
3. Sofort Sicht auf UI, Selection, Inspector, Export oder AI-Ergebnis pruefen
4. Bei Auffaelligkeiten direkt Finding notieren
5. Wenn relevant, Exportdatei oder XML kurz gegenpruefen
6. Erst dann zum naechsten Fall gehen

Wichtig:

- Keine langen freien Explorationsphasen ohne Logging
- Keine Architektur-Fixes waehrend des Testlaufs anfangen
- Erst testen und triagieren, dann implementieren

## Operator Script

Wenn die Session unter Zeitdruck steht, diese feste Reihenfolge nehmen:

1. `choir-lyrics.musicxml` laden
2. Range-Selection ueber Lyrics und mehrere Verse pruefen
3. denselben Bereich per Inspector und AI bearbeiten
4. exportieren und direkt wieder importieren
5. `piano-semantics.musicxml` laden
6. staff-uebergreifende Selection und Paste testen
7. Undo/Redo plus kleinen Rerender provozieren
8. exportieren und wieder importieren
9. `leadsheet-repeat.musicxml` laden
10. Repeats/Endings im Inspector pruefen
11. AI mit aktiver Selection auf einem kurzen Phrase-Segment pruefen
12. exportieren und wieder importieren
13. echte Multi-Voice-Datei laden
14. Voice-uebergreifende Selection und Paste testen
15. Legacy-Fallback-relevante Tags oder Roundtrip-Verluste dokumentieren
16. Findings sortieren
17. maximal 3 Fixes auswaehlen

## Evidence To Capture Per Finding

Jeder Fund sollte nach Moeglichkeit diese Belege mitbringen:

- betroffener Score oder Dateiname
- exakte UI-Aktion in reproduzierbarer Reihenfolge
- ob der Fehler in Anzeige, Selection, Inspector, AI, Export oder Roundtrip sichtbar wird
- ob das Problem nach Reload oder Export/Reimport bestehen bleibt
- ob der Effekt nur visuell ist oder auch im XML/Core-State landet
- falls Legacy-Fallback vermutet wird: betroffene XML-Tags oder Hinweis auf `unsafe_roundtrip_tags`

## Test Order

1. Range-Selection an echten Scores testen
2. Paste-Verhalten an Kantenfaellen testen
3. Inspector gezielt auf Core-State pruefen
4. AI mit aktiver Selection testen
5. Import/Export-Roundtrip mit eigenen echten Dateien testen
6. Legacy-Fallback-Faelle sichtbar machen und dokumentieren
7. Findings nach `Bug`, `Regression`, `UX`, `Architecture gap` sortieren
8. Nur die 2-3 wichtigsten Architektur-Fixes umsetzen
9. Re-Test + `npm test` + `npm run build`

## Timeboxes

Damit der Schwerpunkt auf Priorisierung statt auf unendlicher Exploration bleibt:

- Range-Selection: 20-30 min
- Paste Edge Cases: 20-30 min
- Inspector: 15-20 min
- AI mit Selection: 15-20 min
- Import/Export Roundtrip: 20-30 min
- Legacy-Fallback-Sichtung: 10-15 min
- Triage und Fix-Auswahl: 15 min

Falls ein Bereich innerhalb der Timebox bereits mehrere klare hochrelevante Findings liefert, nicht weiter vertiefen, sondern zum naechsten Bereich gehen.

## What Still Requires Manual UI Validation

Diese Punkte sind trotz gruener Suite weiter offen und daher in der Session prioritaer:

- stimmt das sichtbare Selection-Overlay wirklich mit der semantischen Selection ueberein?
- bleiben Anchor und Range bei echten Rerenders stabil?
- fuehlt sich Paste in dichten Multi-Voice-Kontexten logisch an, nicht nur technisch korrekt?
- spiegeln Inspector-Aenderungen den echten Core-State, Export und Reload wider?
- begrenzt die AI ihre Wirkung in der UI wirklich sauber auf aktive Selection?
- bleiben reale Importdateien auch mit problematischen Notationsdetails im Editor robust?
- welche realen Dateien triggern Legacy-Fallback auf eine Weise, die User-Workflows spuerbar einschraenkt?

## Priority Lanes

Die Session soll Findings nicht nur sammeln, sondern frueh grob einordnen:

- Lane A: zentraler Workflow kaputt
  - Selection, Paste, Inspector, AI oder Roundtrip verhaelt sich fachlich falsch
- Lane B: semantisch richtig, aber UI/Overlay/Targeting fragil
  - Verhalten stimmt manchmal, ist aber fuer Nutzer nicht verlaesslich
- Lane C: sauberer Randfall oder Folgeproblem
  - isolierter Spezialfall ohne grossen Hebel

Bei Zeitknappheit nur Lane A und Lane B verfolgen.

## Score Matrix

### Range-Selection

- Choir: `test/fixtures/choir-lyrics.musicxml`
  - Fokus: Lyrics, mehrere Verse, Chor-Voices, Selection ueber texttragende Noten
- Piano: `test/fixtures/piano-semantics.musicxml`
  - Fokus: Staff-uebergreifende Wahrnehmung, dichte Semantik, Editor-Stabilitaet
- Leadsheet: `test/fixtures/leadsheet-repeat.musicxml`
  - Fokus: Repeats, Endings, einfache Melodie mit Harmonik
- Multi-Voice:
  - Eigene echte Datei mit mindestens 2 Voices in einem Measure nutzen
  - Fokus: Anchor/Range innerhalb derselben Voice vs. Voice-Wechsel

### Paste Edge Cases

- Unterschiedliche Voices
  - Copy aus Voice 1, Paste in Voice 2
  - Copy aus mehrstimmigem Kontext in einstimmigen Kontext
- Measure-Grenzen
  - Paste kurz vor Taktende
  - Paste ueber Taktgrenze hinweg
  - Paste in leeres Measure vs. dicht belegtes Measure
- Rest-zu-Note / Note-zu-Rest
  - Range mit Rest kopieren und ueber Noten pasten
  - Noten ueber Rest-Slots pasten
- Overwrite vs. Insert
  - Gleiches Material in beiden Modi vergleichen
  - Pruefen, ob relative Offsets, Dauer und Voice-Zuordnung stabil bleiben

### Inspector Core-State

- Lyrics mehrere Verse
  - `setLyricLine` / Mehrversigkeit gegen Anzeige und XML pruefen
- Layout-Hints
  - `newSystem`, `newPage`, staff-bezogene Hints
- Repeats/Endings
  - Start/End Repeat, Ending Nummer/Typ
- Part-Metadata
  - Part-Name, Abkuerzung, Instrument-Name, Transposition

### AI mit aktiver Selection

- Nur selektierten Bereich aendern
  - Prompt muss sich sauber auf die Selection begrenzen lassen
- `affectedMeasures` plausibel?
  - Stimmen die gemeldeten Takte mit der echten Mutation ueberein?
- Ambiguitaeten sauber?
  - Low-confidence / requires-confirmation auf realen mehrdeutigen Prompts pruefen

### Import/Export Roundtrip

- Eigene echte Dateien importieren
  - Chor
  - Piano
  - Leadsheet
  - Multi-Voice
- Danach ohne Edit direkt wieder exportieren
- Dann mit kleiner Edit exportieren
- Problematische Beispiele separat sammeln

## Detailed Runbook

### 1. Range-Selection

Pro Score jeweils dieselben Kernfragen pruefen:

- Laesst sich ein einzelner Note-Anchor stabil setzen?
- Bleibt die Range bei Shift-Selection logisch innerhalb derselben Voice?
- Springt die Range unerwartet ueber Staff-, Voice- oder Measure-Grenzen?
- Passt die visuelle Overlay-Darstellung zur semantischen Auswahl?
- Bleibt die Selection nach kleinem Edit, Undo/Redo oder Rerender stabil?

Explizite Soll-Signale:

- Anchor und Endpunkt sind fuer den Nutzer nachvollziehbar
- keine "verlorene" oder unsichtbar falsche Mehrfachauswahl
- keine Drift zwischen visuellem Overlay und bearbeitetem Material

Konkrete Klickfolge:

1. einzelne Note klicken
2. zweite Note mit Shift klicken
3. dritte Note in derselben Voice mit Shift klicken
4. Selection auf andere Staff oder Voice ausdehnen
5. Undo/Redo oder kleinen Edit ausloesen
6. pruefen, ob Overlay und tatsaechlich mutiertes Material identisch bleiben

### 2. Paste Edge Cases

Je Szenario dieselben Fragen beantworten:

- wird an der erwarteten Position eingefuegt oder ueberschrieben?
- bleibt die Voice-Zuordnung korrekt?
- bleiben Dauern und relative Offsets musikalisch konsistent?
- entstehen stille Layout-/Rhythmusfehler erst nach Export/Reimport?

Explizit beobachten:

- ob ein paste-bedingter Fehler sofort sichtbar ist oder erst im Export/Roundtrip
- ob der Fehler eher Selection-, Command-, Normalization- oder Rendering-Charakter hat

Minimaler Paste-Test pro Score:

1. kurze Range kopieren
2. in dieselbe Voice pasten
3. in andere Voice pasten
4. denselben Schritt in `insert` und `overwrite` vergleichen
5. Ergebnis exportieren und bei Auffaelligkeit reimportieren

### 3. Inspector Core-State

Hier nicht nur UI pruefen, sondern die Kopplung UI -> Core -> XML:

- Aenderung im Inspector ausfuehren
- Anzeige direkt pruefen
- wenn moeglich Export/XML kurz gegenpruefen
- bei erneutem Laden sicherstellen, dass dieselbe Semantik erhalten bleibt

Besonders kritisch:

- Lyrics mit mehreren Versen
- Repeats/Endings
- Layout-Hints
- Part-Metadata plus Transposition

Konkrete Inspector-Kommandos fuer die Session:

- `setLyricLine`
- `setSystemBreak`
- `setPageBreak`
- `addStartRepeat`
- `addEndRepeat`
- `setEnding`
- `setPartName`
- `setPartAbbreviation`
- `setInstrumentName`
- `setPartTranspose`

Wenn etwas nur in der UI gut aussieht, aber nach Reload oder Export kippt, als `Architecture gap` oder `Regression` loggen, nicht als reines UX-Thema.

### 4. AI mit aktiver Selection

Fuer jeden AI-Test nur kleine, klar begrenzte Prompts verwenden:

- "transpose only the selected notes up a major second"
- "add staccato only to the selected measure"
- "change only the selected phrase to legato"
- "add lyrics only to the selected notes"
- "repeat only the selected bar with the same rhythm one step higher"

Pruefen:

- ob nur die aktive Selection veraendert wurde
- ob `affectedMeasures` mit der echten Mutation uebereinstimmt
- ob mehrdeutige Prompts sauber auf `requiresConfirmation` oder niedrige Sicherheit laufen
- ob die AI versehentlich ausserhalb des selektierten Bereichs mutiert

Zwei bewusst mehrdeutige Prompts:

- "make this smoother"
- "clean up the selected passage"

Erwartung:

- kein blindes grossflaechiges Edit
- lieber `requiresConfirmation` oder sichtbar niedrige Sicherheit

### 5. Import/Export Roundtrip

Pro echter Datei drei Stufen:

1. Import ohne Edit, direkt wieder exportieren
2. kleine gezielte Edit, dann exportieren
3. Export erneut importieren und auf Drift pruefen

Drift immer konkret notieren:

- Notationsverlust
- Voice-Verschiebung
- Lyrics-/Layout-Verlust
- Repeat-/Ending-Verlust
- unerwarteter Legacy-Fallback oder XML-Sonderweg

Sofort als `hoch` markieren, wenn:

- Semantik sichtbar verschwindet
- Measure-/Voice-Struktur kippt
- ein Reload nach Export ein anderes musikalisches Ergebnis zeigt

### 6. Legacy-Fallback-Sichtung

Ziel ist nicht, jedes XML-Feature komplett zu erschlagen, sondern die echten problematischen Faelle sichtbar zu machen.

Fuer jede problematische Realdatei festhalten:

- welche Tags vorhanden sind
- ob Core-Ausfuehrung komplett blockiert wird
- welche Workflows dadurch auf Legacy bleiben
- ob der Effekt nur technisch ist oder realen Editor-Nutzen blockiert

Minimalziel:

- mindestens einen realen Fall finden, bei dem der Fallback fuer Nutzer nur intern ist
- mindestens einen realen Fall finden, bei dem der Fallback einen echten Workflow bremst oder semantisch riskant wird

## Pass/Fail Heuristics Per Area

Ein Bereich gilt als "vorlaeufig okay", wenn:

- der Kernworkflow reproduzierbar funktioniert
- keine stillen Datenverluste sichtbar werden
- keine Inkonsistenz zwischen UI, Core-Semantik und Export auftritt

Ein Bereich ist "architektur-relevant auffaellig", wenn mindestens eines davon gilt:

- Selection und Mutation zeigen nicht dieselbe semantische Menge
- Inspector-Aenderungen landen nicht stabil im Core-/Export-Modell
- AI ignoriert aktive Selection oder meldet unplausible `affectedMeasures`
- Roundtrip verliert real relevante Semantik
- ein Legacy-Fallback blockiert einen eigentlich zentralen Public-Workflow

## Suggested Finding Language

Damit spaetere Triage schneller geht, moeglichst diese Formulierungen verwenden:

- `Bug`
  - klar fachlich falsches Verhalten bei ansonsten erwartetem Workflow
- `Regression`
  - frueher bereits funktionierende oder testabgedeckte Faehigkeit bricht im UI-/Integrationspfad
- `UX`
  - Funktion technisch korrekt, aber fuer Nutzer missverstaendlich oder schwer steuerbar
- `Architecture gap`
  - Verhalten zeigt einen Bruch zwischen UI, Core, Export, Legacy oder Renderer-Schicht

## Finding Template

Jeden Fund sofort so notieren:

- Kategorie: `Bug` | `Regression` | `UX` | `Architecture gap`
- Datei / Score:
- Exakter Workflow:
- Erwartetes Verhalten:
- Tatsaechliches Verhalten:
- Betroffener Bereich: `Import` | `Editor` | `Inspector` | `AI` | `Export` | `Architecture`
- Reproduzierbarkeit: `immer` | `sporadisch` | `bisher 1x`
- Schweregrad: `hoch` | `mittel` | `niedrig`
- Vermutete Ursache:
- Empfohlener naechster Schritt:

## Findings Log

### Bereits notiert

- Kategorie: `Architecture gap`
- Datei / Score: `docs/migration-status.md`, `src/score-core/commands/hybrid-command-executor.ts`, `test/score-architecture.test.ts`
- Exakter Workflow:
  - `npm test`
  - Test `applyDocumentCommands prefers legacy fallback for complex xml roundtrips`
  - Code in `hybrid-command-executor.ts` lesen
- Erwartetes Verhalten:
  - Doku und Runtime-Verhalten beschreiben denselben Status fuer Legacy-Fallback
- Tatsaechliches Verhalten:
  - Doku sagt "none in the current public command set", Runtime nutzt weiterhin Fallback fuer `unsafe_roundtrip_tags`
- Betroffener Bereich: `Architecture`
- Reproduzierbarkeit: `immer`
- Schweregrad: `mittel`
- Vermutete Ursache:
  - Migrationsdoku ist weiter als die aktuelle Hybrid-Execution-Realitaet
- Empfohlener naechster Schritt:
  - Doku und Runtime-Status auf denselben Begriff bringen und danach entscheiden, welche Unsafe-Tags zuerst aus dem Fallback geholt werden

- Kategorie: `Architecture gap`
- Datei / Score: `next.config.ts`, `app/api/midi/route.ts`
- Exakter Workflow:
  - `npm run build`
- Erwartetes Verhalten:
  - Keine Turbopack/NFT-Warnung fuer Produktions-Build
- Tatsaechliches Verhalten:
  - `Encountered unexpected file in NFT list`
  - Import trace: `./next.config.ts` -> `./app/api/midi/route.ts`
- Betroffener Bereich: `Export`
- Reproduzierbarkeit: `immer`
- Schweregrad: `mittel`
- Vermutete Ursache:
  - Produktions-Build/NFT-Aufloesung ist fuer mindestens einen API-Pfad noch nicht sauber
- Empfohlener naechster Schritt:
  - Separat von Editor-/Command-Fixes behandeln und nicht mit manuellen Editor-Findings vermischen

### Neue Findings hier ergaenzen

- Kategorie: `Regression`
- Datei / Score: `test/fixtures/choir-lyrics.musicxml`
- Exakter Workflow:
  - Score laden
  - erste Note anklicken
  - zweite Note mit Shift anklicken
  - im Inspector `Transpose +2` ausfuehren
- Erwartetes Verhalten:
  - die aktive Mehrfachselektion bleibt nach dem semantischen Inspector-Edit erhalten oder wird mindestens stabil auf denselben Bereich wiederhergestellt
  - sichtbares Overlay, Inspector-Selection und tatsaechlich bearbeiteter Bereich bleiben konsistent
- Tatsaechliches Verhalten:
  - vor dem Edit zeigt der Inspector korrekt `Selected 2 item(s) across m.1-1.`
  - nach `Transpose +2` faellt die UI sofort auf `No semantic selection active.` bzw. `No note selected` zurueck
  - die Selection-Overlays verschwinden ebenfalls
- Betroffener Bereich: `Editor`
- Reproduzierbarkeit: `immer`
- Schweregrad: `hoch`
- Vermutete Ursache:
  - die Page-/History-Integration stellt Mehrfachselektionen nach semantischen Command-Edits im realen UI-Pfad nicht stabil wieder her
  - Hook-nahe Restore-Logik ist testbar verbessert, aber der echte Inspector->applyCommands->rerender-Pfad bleibt instabil
- Empfohlener naechster Schritt:
  - als echter Release-Blocker behandeln
  - erst beheben, dann denselben Choir-Workflow plus Piano/Leadsheet/AI-Selection erneut durchtesten

### Re-Test Notes

- 2026-04-15: Low-risk Hardening versucht:
  - Auswahl-Anker erweitert um `selectionLocators`
  - neue Regression in `test/note-editor-selection.test.ts` fuer Restore nach semantischer Mutation
- 2026-04-15: Ergebnis des Re-Tests:
  - Hook-/History-nahe Tests gruen
  - realer Browser-Workflow auf `choir-lyrics.musicxml` weiterhin rot
  - der Release-Blocker bleibt offen

## Legacy Fallback Watchlist

Diese Faelle gezielt mit problematischen Realdateien pruefen und dokumentieren:

- XML mit `glissando`
- XML mit `slide`
- XML mit `ornaments`
- XML mit `technical`
- XML mit `arpeggiate` / `non-arpeggiate`
- XML mit `tremolo`
- XML mit `notehead`
- XML mit `stem`
- XML mit `staff-details`
- XML mit `measure-style`
- XML mit `part-group` / `group-symbol`
- XML mit `backup` / `forward`
- XML mit `cue`

Quelle: `UNSAFE_CORE_ROUNDTRIP_TAGS` in `src/score-core/commands/hybrid-command-executor.ts`

## Triage Rules After Testing

Nach dem Testlauf alle Findings entlang dieser Fragen sortieren:

1. Blockiert das Problem einen zentralen User-Workflow?
2. Erklaert derselbe Fix mehrere Findings gleichzeitig?
3. Ist es ein echter Architekturhebel statt einer lokalen Symptombehandlung?
4. Laesst sich der Effekt in derselben Session noch sicher re-testen?

Priorisieren:

- zuerst `hoch` + mehrere betroffene Workflows
- dann `mittel` mit starkem Architekturhebel
- zuletzt isolierte UX-Symptome ohne Daten-/Semantikrisiko

Nicht in dieselbe Tranche ziehen:

- Build-Warnungen ohne unmittelbaren Einfluss auf die manuell getesteten Editor-Flows
- sehr lokale UI-Polish-Themen ohne Core-/Export-Auswirkung
- Themen, die neue Modellierung brauchen, aber fuer diese Session nicht sauber abschliessbar sind

## Likely Hotspots To Watch

Diese Stellen sind keine Findings an sich, aber gute Verdachtspunkte fuer die Session:

- `hooks/useNoteEditor.ts`
  - Range-Selection baut auf globaler semantischer Sortierung ueber importiertes Core-Modell
  - deshalb genau auf Voice-Wechsel, Measure-Grenzen und Selection nach Rerender achten
- `components/ScoreEditor.tsx`
  - Selection-Overlay und Hit-Testing laufen ueber OSMD-/SVG-Bridge
  - imported Scores mit komplexem Layout oder verschachtelten SVG-Transforms sind besonders spannend
- `components/ScoreInspector.tsx`
  - einige Aktionen targeten implizit `targetMeasure` oder `staffIndex: 1`
  - deshalb repeats, clefs, endings und layout hints in mehrstaffigen Scores genau pruefen
- `hooks/useScoreDocument.ts`
  - Undo/Redo ist baseline-plus-command-replay
  - nach Load, Replace oder Export/Reimport gezielt auf History-Grenzen achten

## Session Output Template

Nach der Testphase diesen kurzen Block ausfuellen:

- Top Finding 1:
  - warum zentral
  - welcher Fix wahrscheinlich mehrere Probleme loest
- Top Finding 2:
  - warum zentral
  - welcher Fix wahrscheinlich mehrere Probleme loest
- Top Finding 3:
  - warum zentral
  - welcher Fix wahrscheinlich mehrere Probleme loest

- Nicht jetzt umsetzen:
  - welche Findings bewusst vertagt werden
  - warum sie nicht in die aktuelle Tranche kommen

## Recommended Priority For The Next Session

1. Erst die manuellen Tests auf echten Scores durchziehen und alle Findings sauber loggen.
2. Danach nur Architekturthemen priorisieren, die sowohl echte Testfails erklaeren als auch mehrere Workflows verbessern.
3. Die wahrscheinlich staerksten Kandidaten fuer die Implementierungs-Tranche sind:
   - semantischere Block-/Range-Commands
   - vollstaendige Inspector-Migration
   - echte Edit-Commands fuer `slurs / beams / tuplets`
4. `Playback-Core-Kopplung` erst dann vorziehen, wenn beim Testen echte Drift zwischen Editor-State und Playback sichtbar wird.
5. Die Turbopack/NFT-Warnung separat behandeln, damit sie die Editor-/Command-Arbeit nicht vermischt.

## Suggested Architecture Fix Shortlist

### 1. Semantischere Block-/Range-Commands

- Hoechster Hebel fuer Selection, Paste, AI-mit-Selection und Multi-Voice
- Direkt relevant fuer die von Hand zu testenden Editor-Kantenfaelle
- Besonders stark, wenn mehrere Findings auf unklare Range-Grenzen oder instabile Voice-Zuordnung deuten

### 2. Vollstaendige Inspector-Migration

- Vereinheitlicht Inspector/Core-State fuer Lyrics, Layout-Hints, Repeats, Endings, Part-Metadata
- Verhindert parallele Semantik-/XML-Sonderwege im UI
- Besonders stark, wenn Inspector-Aenderungen visuell funktionieren, aber nicht robust roundtrippen

### 3. Echte Edit-Commands fuer `slurs / beams / tuplets`

- Schliesst eine bekannte Modellluecke fuer realistischere Scores
- Wichtig fuer den Abbau weiterer Legacy-/Unsafe-Roundtrip-Faelle
- Besonders stark, wenn reale Importdateien genau dort Semantik verlieren oder auf Legacy ziehen

## Implementation Tranche Gate

Ein Fix kommt nur dann in die sofortige Umsetzungs-Tranche, wenn er:

- mindestens ein reales manuelles Finding behebt
- nicht nur Symptomkosmetik ist
- in derselben Session re-testbar bleibt
- keinen unverhaeltnismaessig grossen Rewrite aufmacht

Wenn mehr als drei Kandidaten diese Kriterien erfuellen:

- den Fix mit dem hoechsten Multi-Workflow-Hebel zuerst nehmen
- den Fix mit dem kleinsten Risiko bei hohem Nutzen als zweiten nehmen
- den dritten nur dann dazu nehmen, wenn der Re-Test noch realistisch bleibt

## Re-Test Checklist After Fixes

- Relevante manuelle Repros erneut durchgehen
- Besonders die vorher kaputten Scores und konkreten Workflows zuerst pruefen
- `npm test`
- `npm run build`
- Wenn moeglich denselben Import/Export-Roundtrip erneut pruefen
- Neue Rest-Risiken dokumentieren statt still mitzuschleppen

## Exit Criteria

Die Session ist erst dann wirklich abgeschlossen, wenn:

- die wichtigsten Findings priorisiert sind
- die umgesetzten Fixes gegen ihre Original-Repros re-getestet wurden
- `npm test` gelaufen ist
- `npm run build` gelaufen ist
- verbleibende Risiken explizit dokumentiert wurden

Wenn die Zeit knapp wird, lieber weniger Fixes sauber abschliessen als zu viele halb anzufangen.
