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

Formats pris en charge: `.musicxml`, `.xml`, `.mxl`, `.pdf`, `.mscz` et `.mscx`, fichiers GuitarPro (`.gp`, `.gp3`, `.gp4`, `.gp5`, `.gp6`, `.gpx`, `.gtp`), Capella (`.cap`, `.capx`), Power Tab (`.ptb`), MEI, Overture (`.ove`) et projets `.nxn`. L'import PDF necessite Audiveris; un PDF de plusieurs pages est lu en entier, et en cas d'echec la premiere page est importee avec un avertissement. Les pages sans portees, comme une page de titre, sont ignorees et nommees dans l'avertissement. Les fichiers Sibelius, Finale et Dorico doivent d'abord etre exportes en MusicXML. Les imports MSCZ/GuitarPro et plusieurs exports avancés utilisent MuseScore CLI.

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

A cote se trouve le selecteur **Raccourcis clavier** pour ceux qui viennent d'un autre logiciel: `Nex Note / MuseScore` (par defaut), `Sibelius (keypad)`, `Sibelius (laptop)` et `Finale (Simple Entry)`. Un preset ne change que les touches principales de la saisie (valeurs, alterations, silence, liaison, intervalles, voix). Le choix est enregistre par appareil; les infobulles affichent toujours les touches Nex Note. Detail des touches: [keyboard-shortcuts.md](./keyboard-shortcuts.md).

## Selection et navigation

Cliquez une note pour la selectionner et entendre un apercu court. Cliquez dans le vide pour vider la selection. `Shift+Click` etend une plage, `Cmd/Ctrl+Click` ajoute ou retire une note. Les fleches gauche/droite naviguent entre notes; `Shift+Fleche` etend la selection; `Cmd/Ctrl+Fleche gauche/droite` saute par mesure; `Alt/Option+Fleche haut/bas` navigue verticalement entre voix ou portees au meme instant.

Find/Go to s'ouvre depuis le pied de page ou `Cmd/Ctrl+F` et accepte des cibles comme un numero de mesure ou `p2`.

## Saisie de notes

Activez la saisie avec `N` ou le bouton Note Input.

| Fonction | Description |
| --- | --- |
| Durees | `1` a `9` choisissent 64e a longa; `8` est breve/double ronde et `9` est longa. |
| Point | `.` active/desactive la duree pointee. |
| Hauteurs | `A` a `G` entrent ou changent les notes. |
| Silences | `R` ou `0` insere un silence. |
| Repetition | `R` repete la derniere note si une note vient d'etre saisie. |
| Voix | Barre d'outils ou `Cmd/Ctrl+Alt/Option+1...4`. |
| Insert/overwrite | `I` change le comportement de saisie. |
| Accords | Mode Chord Input ou `Shift+A...G`. |
| Alterations | Bemol, becarre, diese, double bemol et double diese ne s'appliquent qu'a la prochaine hauteur saisie avec succes. |
| Enharmonie | `J` parcourt les graphies enharmoniques equivalentes sans changer le son. |
| Insertion au curseur | `Cmd/Ctrl+Shift+A...G`. |
| Octaves | `Shift+Fleche haut/bas` ou `Cmd/Ctrl+Fleche haut/bas`. |

La note fantome montre la position de la prochaine saisie. `Shift` favorise l'insertion; `Alt/Option` favorise l'ajout dans un accord.

Ampli guitare en USB : `MIC REC` detecte la hauteur depuis n'importe quelle entree audio. Un ampli branche en USB, comme le Positive Grid Spark MINI ou le REACTOR 50, apparait comme une entree audio ordinaire. Pendant que `MIC REC` tourne, choisissez a cote le profil d'entree `Ampli guitare · USB`. Le profil coupe le controle automatique du gain pour le signal ligne, choisit `Guitar · written +8va` et entend jusqu'au si1 (B1) pour les accordages droppes et les guitares a sept cordes. Si exactement une entree porte "Spark" dans son nom, elle est choisie automatiquement et la barre affiche `Ampli trouvé` ; sinon choisissez l'ampli une fois dans la liste des entrees. Ce choix et le profil sont memorises. Avec ce profil, chaque attaque ecrit une note : la meme note rejouee est ecrite a nouveau sans silence, un hammer-on, un pull-off ou un slide vers une autre note est ecrit aussi, et une note tenue n'est ecrite qu'une fois. Les sons a l'octave, a la douzieme ou a la quinte de la note qui sonne comptent comme ses harmoniques jusqu'a la prochaine attaque ; un pas legato d'exactement une quinte ou une octave doit donc etre attaque. Une reprise douce qui ne double pas au moins le niveau, surtout avec des presets tres compresses ou satures, et les notes qui montent sans attaque (volume swells) ne sont pas ecrites. Les indications de niveau jugent la note la plus forte des 1,5 dernieres secondes : `Input too low` signifie que les notes restent sous −60 dBFS, `Input too high` que le signal USB atteint la pleine echelle. `Concert pitch` reste disponible, et `Guitar · written +8va` fonctionne aussi avec le profil micro.

Accords par l'ampli : avec le profil `Guitar amp · USB`, le selecteur de reconnaissance propose `Strummed chord` a cote de `Single notes` et `Build chord` ; `Alt/Option+C` passe de l'un a l'autre. Dans ce mode, un accord gratte de six notes au plus est ecrit d'un coup et le curseur avance ; les notes seules restent ecrites une a une. La detection attend environ un quart de seconde apres l'attaque. La basse et toute note qui n'est pas un harmonique d'une corde plus grave sont lues de facon fiable ; un doublement a l'octave ou a la douzieme peut manquer, et dans un accord complet un harmonique peut apparaitre comme note supplementaire a l'octave superieure. Un son clair se lit mieux qu'un son sature. Verifie uniquement avec des signaux synthetiques, pas sur un ampli reel.

## Hauteur, alterations et duree

Selectionnez une note et utilisez `A` a `G`, les boutons de hauteur, les fleches ou la palette. `Fleche haut/bas` transpose par demi-ton. `Q/W` divisent ou doublent la duree; `Shift+Q/W` le font avec les valeurs pointees. Les alterations sont dans la barre; `-` = bemol, `=` = becarre, `+` = diese, `Alt/Option+-` = double bemol et `Alt/Option+=` = double diese.

En Note Input, une alteration armee n'est consommee qu'apres la prochaine saisie de hauteur reussie. L'alteration sonore reste valable pour la meme lettre et la meme octave sur cette portee jusqu'a la barre de mesure, meme entre les voix; une autre octave et la mesure suivante gardent leur propre contexte. Le signe ecrit est conserve separement dans MusicXML, Copy/Paste, notation/TAB et Undo/Redo.

Appuyez plusieurs fois sur `J` pour parcourir les graphies enharmoniques d'une note, d'un accord ou d'une plage sans modifier MIDI, identite, selection, liaisons de tenue ni doigté TAB. Quand le clavier QWERTY est actif, `J` reste sa touche La diese. Pour une alteration explicitement ecrite, utilisez Edit Palette → Accidentals ou l'Inspector afin de la marquer comme precaution et de choisir aucune enclosure, des parentheses rondes ou des crochets. La hauteur ne change pas et MusicXML, Copy/Paste, notation/TAB et Undo/Redo conservent cette presentation. La detection automatique reste ouverte.

## Articulations, nuances, liaisons

| Zone | Fonctions |
| --- | --- |
| Articulations | Staccato, staccatissimo, accent, marcato, tenuto, point d'orgue. |
| Nuances | `pp`, `p`, `mp`, `mf`, `f`, `ff`, `fff`, `sfz`. |
| Tie | Lie a la prochaine note de meme hauteur. Raccourci: `T`. |
| Slur | Liaison d'expression sur la selection ou la note suivante. Raccourci: `S`. |
| Grace note | `/` insere une appoggiature distincte sans duree avant l'ancrage, sans modifier la note principale; les debuts de mesure et notation/TAB appairee sont pris en charge. |
| Tuplets | Selectionnez une seule note, un accord ou un silence, puis divisez sa duree avec les rapports 2:3 a 9:8 ou `Cmd/Ctrl+2...9`; les unites restantes sont des silences modifiables. |

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

Son : chaque partie a sa place dans l'image stereo et une part d'une reverberation de salle commune. Le volume suit les nuances ecrites ; accent, staccato, marcato et sforzato sont joues, ainsi que la pedale forte. Les notes longues des cordes, des vents et de l'orgue tiennent leur duree ecrite. Les portees de percussion sonnent avec une batterie integree (notes General MIDI 35 a 81) et le clic du metronome est un wood-block. Une note cliquee sonne aussitot, en hauteur reelle dans les parties transpositrices. Il y a 22 sons d'instrument ; un instrument sans son propre recoit le plus proche.

## Assistant AI

L'onglet AI ouvre le chat pour travailler sur la partition en langage naturel. Vous pouvez decrire une modification directement ou utiliser des workflows slash comme `/arrange`, `/analyze`, `/practice`, `/layout`, `/repair` et les demandes de nettoyage MIDI/import. Si une note, une plage, une mesure ou une partie est selectionnee, l'assistant recoit ce contexte et peut limiter sa proposition a la musique courante.

Les demandes d'arrangement utilisent maintenant l'assistant d'arrangement. Les plans venant d'un fournisseur sont controles par le critic puis materialises, quand le contexte le permet, sous forme de voix ecrites et de symboles d'accord. Le resultat apparait comme une preview avec les operations preparees, par exemple vider la plage de voix cible, inserer les notes realisees et ajouter les accords; les portees TAB de guitare appariees sont reproduites quand les notes sont jouables.

Des actions rapides d'arrangement apparaissent au-dessus du champ de saisie quand une partition est ouverte: ecriture a quatre voix, voicing jazz, basse chiffree, reharmonisation, accompagnement de piano, symboles d'accord et verification de tessiture (libelles en anglais). Un clic envoie la demande; `Alt/Option`+clic place le texte dans le champ pour le modifier. Limite: l'assistant ecrit dans les parties et portees existantes et n'en cree pas encore de nouvelles.

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

La qualite AI depend du fournisseur et du modele. Le PDF depend d'Audiveris. MSCZ, GuitarPro, MIDI et meilleur ABC dependent de MuseScore CLI. Certains signes sont visuels pour la lecture. Les presets Sibelius et Finale couvrent les touches principales de la saisie, pas toutes les touches de ces logiciels; voir [keyboard-shortcuts.md](./keyboard-shortcuts.md).
