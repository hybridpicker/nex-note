# Manuel utilisateur nex-note

Mis a jour le 2026-06-11. Ce manuel decrit les fonctions utilisateur actuellement disponibles dans nex-note. Les raccourcis clavier et souris sont documentes separement dans [keyboard-shortcuts.md](./keyboard-shortcuts.md).

Langues: [Deutsch](./user-manual.md), [English](./user-manual.en.md), [Français](./user-manual.fr.md), [Español](./user-manual.es.md), [中文](./user-manual.zh.md).

## Definition

nex-note est un editeur MusicXML concu pour des flux proches de MuseScore. Vous pouvez importer une partition, modifier la notation dans le navigateur, demander des changements a l'assistant AI, ecouter le resultat et exporter en MXL, ABC, pack de pratique ou projet nex-note.

## Demarrage et fichiers

| Fonction | Description |
| --- | --- |
| Nouvelle partition | Cree une partition vide. |
| Choisir un modele | Ouvre le dialogue avec instruments, modeles et metadonnees. |
| Ouvrir un fichier | Importe un fichier local. |
| Glisser-deposer | Charge un fichier dans la zone d'import. |
| Fichiers recents | Rouvre les derniers fichiers importes. |
| Bibliotheque | Ouvre les partitions stockees localement. |

Formats pris en charge: `.musicxml`, `.xml`, `.mxl`, `.pdf`, `.mscz`, fichiers GuitarPro (`.gp`, `.gp4`, `.gp5`, `.gp6`, `.gpx`) et projets `.nxn`. L'import PDF necessite Audiveris. Les imports MSCZ/GuitarPro et plusieurs exports avancés utilisent MuseScore CLI.

## Nouvelle partition

Le dialogue de creation contient trois onglets:

| Zone | Fonctions |
| --- | --- |
| Instruments | Rechercher, filtrer par famille, ajouter, supprimer et reordonner. |
| Modeles | Demarrer avec des ensembles predefinis. |
| Informations | Titre, sous-titre, compositeur, arrangeur, tonalite, mesure et unite de pulsation. |

L'ordre des instruments devient l'ordre des portees.

## Espace principal

| Zone | Role |
| --- | --- |
| Vue partition | Notation rendue, selection, navigation, cibles fantomes et curseur de lecture. |
| Barre notation | Undo/redo, lecture, tempo, metronome, saisie de notes, mode lead, transposition par glisser, nettoyage de mise en page. |
| Barre de saisie | Durees, alterations, articulations, voix, insertion/remplacement, symboles d'accord, silences, copier/coller/supprimer. |
| Palette d'edition | Selection, transposition, articulations, nuances, liaisons et barres de mesure. |
| Panneau lateral | AI, Bibliotheque et Inspector; repliable. |
| Pied de page | Navigateur, Find/Go to, zoom et mode d'affichage. |

## Langue et aide

L'en-tete contient un selecteur de langue compact. nex-note prend en charge Deutsch, English, Francais, Espanol et 中文. La langue choisie est enregistree localement, restauree au prochain lancement et met a jour l'interface sans rechargement. Le lien **Manual** ouvre le manuel correspondant a la langue selectionnee.

## Selection et navigation

Cliquez une note pour la selectionner et entendre un apercu court. Cliquez dans le vide pour vider la selection. `Shift+Click` etend une plage, `Cmd/Ctrl+Click` ajoute ou retire une note. Les fleches gauche/droite naviguent entre notes; `Shift+Fleche` etend la selection; `Cmd/Ctrl+Fleche gauche/droite` saute par mesure; `Alt/Option+Fleche haut/bas` navigue verticalement entre voix ou portees au meme instant.

Find/Go to s'ouvre depuis le pied de page ou `Cmd/Ctrl+F` et accepte des cibles comme un numero de mesure ou `p2`.

## Saisie de notes

Activez la saisie avec `N` ou le bouton Note Input.

| Fonction | Description |
| --- | --- |
| Durees | `1` a `7` choisissent 64e a ronde. |
| Point | `.` active/desactive la duree pointee. |
| Hauteurs | `A` a `G` entrent ou changent les notes. |
| Silences | `R` ou `0` insere un silence. |
| Repetition | `R` repete la derniere note si une note vient d'etre saisie. |
| Voix | Barre d'outils ou `Cmd/Ctrl+Alt/Option+1...4`. |
| Insert/overwrite | `I` change le comportement de saisie. |
| Accords | Mode Chord Input ou `Shift+A...G`. |
| Insertion au curseur | `Cmd/Ctrl+Shift+A...G`. |
| Octaves | `Shift+Fleche haut/bas` ou `Cmd/Ctrl+Fleche haut/bas`. |

La note fantome montre la position de la prochaine saisie. `Shift` favorise l'insertion; `Alt/Option` favorise l'ajout dans un accord.

## Hauteur, alterations et duree

Selectionnez une note et utilisez `A` a `G`, les boutons de hauteur, les fleches ou la palette. `Fleche haut/bas` transpose par demi-ton. `Q/W` divisent ou doublent la duree; `Shift+Q/W` le font avec les valeurs pointees. Les alterations sont dans la barre; `-` = bemol, `=` = becarre, `+` = diese. Double bemol et double diese sont disponibles dans la barre.

## Articulations, nuances, liaisons

| Zone | Fonctions |
| --- | --- |
| Articulations | Staccato, staccatissimo, accent, marcato, tenuto, point d'orgue. |
| Nuances | `pp`, `p`, `mp`, `mf`, `f`, `ff`, `fff`, `sfz`. |
| Tie | Lie a la prochaine note de meme hauteur. Raccourci: `T`. |
| Slur | Liaison d'expression sur la selection ou la note suivante. Raccourci: `S`. |
| Grace note | Ajoute une appoggiature. Raccourci: `/`. |
| Tuplets | Triolet et quintolet via barre/palette ou `Cmd/Ctrl+3` et `Cmd/Ctrl+5`. |

Certains signes peuvent etre seulement visuels selon le moteur de lecture.

## Barres, reprises et slashs

La palette applique les barres regular, double, final, repeat start et repeat end a la mesure selectionnee. L'Inspector ajoute aussi les reprises et premieres/deuxiemes fins. La barre de saisie peut inserer un slash rythmique ou remplir la mesure avec des slashs (`Cmd/Ctrl+/`).

## Accords, paroles et texte

Avec une note selectionnee, `Cmd/Ctrl+K` ouvre un curseur d'harmonie directement sur la partition. `Enter` applique l'accord et `Escape` annule. Sans selection de note, `Cmd/Ctrl+K` ouvre toujours le Command Center. L'Inspector ajoute repere de repetition, texte de portee, expression et paroles. Pour les paroles, selectionnez une note, entrez le texte et le numero de couplet, puis attachez la ligne.

## Inspector

| Section | Fonctions |
| --- | --- |
| Selection | Transposer une plage, effacer articulations, staccato/accent, ajouter `mf`, slur. |
| Score Setup | Titre, sous-titre, compositeur, arrangeur. |
| Key | Presets C, G, D, A, F et Bb majeur. |
| Repeats & Endings | Debut/fin de reprise, 1re et 2e fin. |
| Time & Clef | 4/4, 3/4, 6/8, 2/2; clefs de sol, fa, alto. |
| Measure | Inserer/supprimer mesure, saut de systeme/page, espacement. |
| Text & Rehearsal | Reperes et textes de portee. |
| Lyrics | Paroles sur notes selectionnees. |
| Parts & Instruments | Nom, abreviation, instrument, transposition, extraction de partie, presets de mise en page. |

L'extraction de partie ouvre une partie separee comme partition de travail.

## Palette d'edition

La palette peut etre etendue, repliee ou affichee en rail d'icones. Elle contient selection, transposition par octave/demi-ton/ton/quinte, articulations, nuances, ties/slurs et barres de mesure. Les outils restent desactives jusqu'a une selection compatible.

## Lecture

La lecture fournit play/pause (`Space`), stop, tempo, metronome, recherche via barre de progression et curseur dans la partition. Si une note est selectionnee et que la lecture est arretee, Play commence a cette note. Le premier chargement MIDI/soundfont peut prendre un moment.

## Assistant AI

L'onglet AI ouvre le chat pour travailler sur la partition en langage naturel. Vous pouvez decrire une modification directement ou utiliser des workflows slash comme `/arrange`, `/analyze`, `/practice`, `/layout`, `/repair` et les demandes de nettoyage MIDI/import. Si une note, une plage, une mesure ou une partie est selectionnee, l'assistant recoit ce contexte et peut limiter sa proposition a la musique courante.

Les demandes d'arrangement utilisent maintenant l'assistant d'arrangement. Les plans venant d'un fournisseur sont controles par le critic puis materialises, quand le contexte le permet, sous forme de voix ecrites et de symboles d'accord. Le resultat apparait comme une preview avec les operations preparees, par exemple vider la plage de voix cible, inserer les notes realisees et ajouter les accords; les portees TAB de guitare appariees sont reproduites quand les notes sont jouables.

Les arrangements, changements de mise en page et autres lots a risque restent soumis a confirmation. La partition n'est pas modifiee quand la preview apparait. Cliquez **Apply** ou tapez `apply` pour ecrire les operations dans la partition; cliquez **Cancel** ou tapez `cancel` pour les rejeter. La preview liste les mesures affectees, les risques, les diagnostics et le resume des commandes preparees.

La configuration des fournisseurs se trouve dans **AI model settings**. Claude et Gemini demandent leurs cles API; Ollama utilise votre serveur Ollama local et peut employer les modeles detectes ou un `model:tag` personnalise. Le fournisseur et le modele choisis sont visibles dans l'en-tete et dans les reponses de l'assistant.

Si aucun fournisseur n'est configure, si l'appel echoue ou si la demande correspond a un workflow local deterministe, nex-note utilise des aides locales. Elles peuvent analyser la partition, proposer des versions de pratique, preparer des apercus d'accords ou d'expression, traiter des arrangements simples et lancer un nettoyage de mise en page sans envoyer la partition a un fournisseur cloud. Les fallbacks locaux qui modifient la partition utilisent le meme modele preview/apply/cancel.

## Fournisseurs AI et benchmarks

nex-note prend en charge Ollama, Claude, Gemini et Benchmark. Les modeles Ollama peuvent etre choisis ou ajoutes sous forme `model:tag`. Benchmark compare resultat, latence, validite XML et operations. Les benchmarks CLI sont `npm run benchmark` et `npm run benchmark:quick`.

## Bibliotheque et recents

La bibliotheque stocke les partitions dans le stockage local du navigateur. Vous pouvez ouvrir, marquer en favori, filtrer, consulter les statistiques, supprimer une partition ou tout effacer. Recent Files donne un acces rapide aux fichiers recents.

## Export et sauvegarde

| Fonction | Resultat |
| --- | --- |
| Save as library score | Sauvegarde dans la bibliotheque locale. |
| Save project `.nxn` | Telecharge un projet nex-note editable. |
| Export compressed MusicXML | Telecharge `.mxl`. |
| Export ABC notation | Telecharge `.abc`. |
| Export practice pack | Cree un pack JSON. |
| Print view / Print score | Ouvre l'aperçu page ou l'impression navigateur. |

MXL est le format principal pour MuseScore, Finale, Dorico et Sibelius.

## Mise en page et affichage

Zoom, mode d'affichage, Navigator, Find/Go to, Layout Cleanup, sauts de systeme/page, espacement de portee et presets `Compact`, `Balanced`, `Roomy`, `Choir` aident a preparer les pages.

## Undo, Redo et historique

Undo: `Cmd/Ctrl+Z`. Redo: `Cmd/Ctrl+Shift+Z` ou `Cmd/Ctrl+Y`. L'historique est base sur des commandes et a une taille limitee.

## Debug et rapports

En mode debug, `Report bug` exporte un bundle avec partition, etat runtime, actions recentes et rapports Markdown/JSON. Doctor Mode et les outils visuels aident a diagnostiquer saisie, rythme, mise en page et grille semantique.

## Limites connues

La qualite AI depend du fournisseur et du modele. Le PDF depend d'Audiveris. MSCZ, GuitarPro, MIDI et meilleur ABC dependent de MuseScore CLI. Certains signes sont visuels pour la lecture. Certains raccourcis MuseScore/Finale manquent encore; voir [keyboard-shortcuts.md](./keyboard-shortcuts.md).
