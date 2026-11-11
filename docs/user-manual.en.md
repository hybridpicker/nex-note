# nex-note User Manual

## OpenAI setup

Open AI settings, enable **OpenAI**, paste an API key, and choose a model. The recommended default is `gpt-5.6-sol`; custom OpenAI model IDs are supported. Maintainers can instead set `OPENAI_API_KEY` and optionally `OPENAI_MODEL` in `.env.local`, then restart nex-note.

nex-note sends the current instruction plus compact semantic score, selection, and recent conversation context to OpenAI. The key is not written to scores or exports. OpenAI returns structured intent, not an XML patch. nex-note treats it as untrusted, validates or repairs commands, reports affected measures and validator findings, and preserves preview/confirmation.

## Local Codex/agent interface

This release contains an opt-in localhost HTTP tool-service foundation, not a finished MCP server. Set `NEX_NOTE_ENABLE_LOCAL_AGENT=true` and a long random `NEX_NOTE_AGENT_SECRET` in `.env.local`. Calls to `/api/local-agent` require `Authorization: Bearer <secret>`, a live `scoreKey`, a supported `tool`, and tool `arguments`.

- `get_score_summary`: identity/revision, metadata, parts/measures, diagnostics, capabilities, and selection summary.
- `get_selection`: compact semantic selection.
- `validate_score`: validator findings without mutation.
- `plan_score_commands`: natural-language planning through the existing AI pipeline; never applies.
- `preview_score_commands`: validates/repairs typed commands and returns before/after metadata; never applies.
- `apply_score_preview`: applies one unexpired preview after revision and confirmation checks.
- `discard_score_preview`: invalidates a preview.
- `export_score`: exports MusicXML or MXL into `.nex/agent-exports` using a safe filename.

There is no arbitrary filesystem, shell, URL-fetch, raw XML patch, or unrestricted export-path operation. Preview IDs expire after five minutes and cannot be replayed. Workflow: inspect score → inspect selection → plan → preview → user confirms → apply → validate → export.

Current limitation: agent apply updates the server score session and server undo availability, but does not yet push the change or undo entry into an already-open browser tab. MCP transport and browser synchronization remain follow-up work.

Updated: 2026-07-09. This manual covers the current user-facing features in nex-note. Keyboard and mouse shortcuts are documented separately in [keyboard-shortcuts.md](./keyboard-shortcuts.md).

Languages: [Deutsch](./user-manual.md), [English](./user-manual.en.md), [Français](./user-manual.fr.md), [Español](./user-manual.es.md), [中文](./user-manual.zh.md).

## What nex-note is

nex-note is a MusicXML editor for MuseScore-style workflows. You can import scores, edit notation directly in the browser, ask the AI assistant for changes, play the score back, and export to MXL, MusicXML-adjacent formats, or nex-note project files.

## Start and Files

The welcome screen provides these entry points:

| Feature | Description |
| --- | --- |
| New score | Creates a new blank score. |
| Choose template | Opens the score setup dialog with instruments, templates, and score metadata. |
| Open file | Imports a local file. |
| Drag and drop upload | Loads files through the upload zone. |
| Recent files | Reopens recently imported files. |
| Library | Opens locally stored scores. |

Supported import formats include `.musicxml`, `.xml`, `.mxl`, `.pdf`, image files (`.png`, `.jpg`, `.jpeg`, `.tif`, `.tiff`, `.webp`, `.bmp`, `.heic`, `.heif`), `.mscz`, GuitarPro files (`.gp`, `.gp4`, `.gp5`, `.gp6`, `.gpx`), and `.nxn` project files. PDF/image import needs Audiveris; MSCZ, GuitarPro, MIDI, and best-effort ABC workflows depend on MuseScore CLI.

When importing, nex-note shows where editable `.nxn` project files will be stored. You confirm the suggested folder or deliberately choose a different location. It creates or reuses a `nex-note-projects` folder there and saves every opened or converted file as an additional `.nxn` working copy. Original files are not modified and continue to appear in Recent Files and the Library with their original format.

## Creating a New Score

The New Score dialog has three tabs:

| Area | Features |
| --- | --- |
| Choose instruments | Search, filter by family, add, remove, and reorder instruments. |
| Create from template | Start from predefined ensembles. |
| Score information | Set title, subtitle, composer, arranger, key, time signature, and beat unit. |

The selected instrument order becomes the staff order in the score.

## Main Workspace

| Area | Purpose |
| --- | --- |
| Score view | Rendered notation, selection, navigation, ghost-note targets, and playback cursor. |
| Notation toolbar | Undo/redo, playback, tempo, metronome, note input, lead mode, drag-transpose mode, and layout cleanup. |
| Note input toolbar | Durations, accidentals, articulations, voices, insert/overwrite, chord symbols, rests, copy/paste/delete. |
| Edit palette | Selection, transposition, articulations, dynamics, ties/slurs, and barlines. |
| Workspace panel | AI, Library, and Inspector tabs; can be collapsed. |
| Footer controls | Navigator, Find/Go to, zoom, and score view mode. |

## Language and Help

The header includes a compact language selector. nex-note supports Deutsch, English, Français, Español, and 中文. The selected language is stored locally, restored on the next launch, and updates the UI without a reload. The **Manual** link opens the manual matching the selected language.

## Selection and Navigation

Click a note to select it and hear a short preview. Click empty space to clear selection. Use `Shift+Click` for ranges and `Cmd/Ctrl+Click` for additive selection. Arrow keys move between notes, `Shift+Arrow` extends selection, `Cmd/Ctrl+ArrowLeft/Right` jumps by measure, and `Alt/Option+ArrowUp/Down` moves vertically between voices or staves at the same timestamp.

Find/Go to opens from the footer or `Cmd/Ctrl+F`. It accepts measure/page-style targets such as measure numbers and `p2`.

## Note Input

Turn note input on with the toolbar button or `N`.

| Feature | Description |
| --- | --- |
| Durations | `1` to `9` select 64th through longa; `8` is breve/double whole and `9` is longa. |
| Dotted notes | `.` toggles dotted duration. Choosing a new note value (`1`–`9` or the toolbar) clears the dot, as in MuseScore; in duration-first input (`M`) the dot stays with the prepared pitch. |
| Pitch entry | `A` to `G` enter or change notes, nearest to the previous note (after a chord: its lowest note). With no earlier note in the voice, the first note is placed nearest to the staff's middle line, as in MuseScore: `C` is C5 in treble clef and C3 in bass clef. |
| Typing markings at the cursor | With a note selected or in note input, a small field opens at the cursor: `Cmd/Ctrl+L` lyrics (`Space` next note, `-` hyphen, `_` melisma, `Down` next verse), `Cmd/Ctrl+K` chord symbols (`Space` next beat, `Tab` next bar, `Cmd/Ctrl+6` a half note on), `Alt/Option+Shift+D` dynamics (`mf`, or `<` and `>` for a hairpin over the selection), `Cmd/Ctrl+T` staff text, `Cmd/Ctrl+Shift+T` system text, `Cmd/Ctrl+E` expression, `Cmd/Ctrl+M` rehearsal mark, `Alt/Option+Shift+T` tempo (`Allegro q=96`), `Alt/Option+Shift+K` key (`D`, `Bb`, `f#m`, `2#`), `Alt/Option+Shift+M` time signature (`3/4`), `Alt/Option+Shift+C` clef (`bass`), `Alt/Option+Shift+R` repeats, barlines and endings (`|:`, `:|`, `1.`), `Alt/Option+Shift+O` lines (`8va`, `ped`). The field shows what it understood before anything is written; `Enter` writes it as one Undo step, `Esc` closes without a change. The same entries are in the Command Center under "Type at the cursor". |
| Correcting from the keyboard | Outside note input the value keys `1`–`9`, the dot `.` and `Q`/`W` change the selected note or rest: a shorter value leaves a rest, a longer one writes over the music after it. `Alt/Option+Shift+Up/Down` moves the selected note by one step of the key. In note input `Backspace` takes back the note just entered and puts the cursor on its place; press it again to step further back. |
| Hairpins and articulations from the keyboard | `<` writes a crescendo hairpin and `>` a diminuendo hairpin over the selected notes (from one note: to its end). `Shift+S` staccato, `Shift+V` accent, `Shift+N` tenuto, `Shift+O` marcato, as in MuseScore; in note input they act on the note just entered. |
| Status line and Inspector | The status line beside the transport names the selection as a musician would: `Bar 3, beat 2.5 · F♯5 · Eighth note · Flute · Voice 1`. The Inspector (`F8`) shows pitch, value, position and voice of the selected note or rest, with controls for the stem direction and for visibility. The mode buttons of the notation tools are labelled `Standard`/`Replace` (entry mode), `Chord`, `Keys` (computer keyboard as piano), `Pitch first` (choose pitches, then a value) and `Lead sheet`. |
| Mouse entry | In note input a click on a rest writes a note of the armed value. A click on a note of the same value adds a chord tone; on a note of another value it replaces that note with the armed value. A click never pushes the following music later. `Shift`+click replaces what stands there, `Alt/Option`+click always adds a chord tone, `Cmd/Ctrl+Shift`+click inserts and moves the rest of the bar later. With the entry mode set to Replace every click replaces. |
| Caret and note-input bar | While note input is on, a vertical caret in the colour of the input voice (voice 1 blue, 2 green, 3 orange, 4 purple) marks where the next note will land, for keyboard, mouse and MIDI entry; the view scrolls to keep it visible. A bar at the right end of the row under the toolbar shows what is armed: note value, dot, accidental, voice, entry mode (`Standard` or `Replace`) and the tuplet the cursor stands in. Every field can be clicked. |
| Rests | `0` enters a rest with the active duration (in note input also `R` before the first note). Outside note input, `0` starts note input at the selected note and writes the rest over it; nothing is pushed later. |
| Longer values over existing notes | A value longer than the note at the cursor overwrites the music that follows in the bar. A note that is cut leaves a rest; a tuplet that is reached is removed as a whole. |
| Repeat last input | In note input, `R` repeats the last entered note. |
| Repeat selection | Outside note input, `R` repeats the selection directly after itself, over the music that follows, and selects the copy (MuseScore's Repeat selection). |
| Voices | Toolbar or `Cmd/Ctrl+Alt/Option+1...4`. |
| Insert/overwrite | `I` switches entry behavior. Paste always overwrites the music after the paste position, as in MuseScore; it never pushes notes into the next bar. |
| Values across the barline | A value typed from the keyboard that is longer than the rest of the bar is split at the barline and tied into the next bar in one step (for example a quarter on the last eighth becomes eighth–tie–eighth). Both parts must be single, possibly dotted values; other lengths are rejected with a message. Mouse entry keeps rejecting overlong values, because its preview shows a single-bar note. |
| Tuplets during note input | Choose the total length (for example a quarter), press `Cmd/Ctrl+3` for a triplet (`2`–`9` for other tuplets). The cursor moves into the new group, the entry value becomes its unit (triplet eighths), and typed pitches fill the units in place. Outside note input, `Cmd/Ctrl+2`–`9` divides the selected note or rest. |
| Chords | `Shift+A...G` adds a chord tone above the highest tone of the note you just entered, as in MuseScore; the cursor stays on the next position. Chord input mode keeps the cursor on the chord instead. |
| Octave of a typed letter | A letter goes nearest to the previous note of the voice you are entering in, or to the clef's middle line when that voice has no earlier note. Other voices do not set the octave. |
| Marking while entering | Articulation keys, `/` (grace), `J` (respell), `X` and `Shift+X` act on the note you just entered, as in MuseScore; the next letter still goes to the next position. `Shift+Left`/`Shift+Right` start a range at that note. |
| Voices while entering | Changing the voice keeps the input position: the next note or rest starts at the cursor in the new voice, also in a bar where that voice does not exist yet. |
| Rests that start a bar | A rest typed at the start of a bar stays that value, also when no notes follow it yet (`C D E F`, `0`, `G` puts G on beat 2 of the next bar). Bars further on stay plain whole-bar rests. |
| Past the end of the score | The next note or rest after the last position appends a bar and goes there, in one Undo step, so the last note is never replaced. `T` at the last position does the same: it appends a bar and ties into it. |
| Values across beats | A value that crosses a beat is written as tied notes, or as several rests (an off-beat quarter becomes eighth–tie–eighth). The whole value is kept and the cursor moves past it, so the next note never replaces its tied tail. |
| Tied notes and chords | In Note Input, choose the second duration and press `T`; nex-note creates the next same-pitch note or complete chord, ties every tone, and advances once. Outside Note Input, `T` toggles ties on the selection. |
| Accidentals | Flat, natural, sharp, double-flat, and double-sharp are one-shot tools for the next successful pitched entry; normal measure carry applies afterward. |
| Enharmonic spelling | `J` cycles selected notes through equivalent standard spellings without changing playback pitch. |
| Cursor insert | `Cmd/Ctrl+Shift+A...G` inserts explicitly at the cursor. |
| Octaves | `Shift+ArrowUp/Down` or `Cmd/Ctrl+ArrowUp/Down`. |
| Step keyboard | `P` toggles a compact QWERTY step keyboard and enables Note Input if needed. |
| Microphone Instrument Record | Click `MIC REC`, grant microphone access, choose the note value with `1` to `9`, then play one pitch or a chord. Stable detected pitches are committed at the rhythmic cursor. |
| Live MIDI | Click `MIDI` in Entry Modes to use a connected MIDI controller instead of the microphone. |

Keyboard layouts: shortcuts work on US, UK and German/Austrian (QWERTZ) keyboards. Letter, accidental and slash keys follow the printed key: on QWERTZ, `+` (next to `Ü`) is sharp, `-` is flat, `Shift+0` (`=`) is natural, `Shift+7` (`/`) adds a grace note, and `Cmd/Ctrl+Z`/`Cmd/Ctrl+Y` are Undo/Redo by the printed letters. `Shift+.`, `Shift+6` and `Shift+-` (accent, marcato, tenuto) name the physical key, even though QWERTZ prints `:`, `&` and `_` there. Holding a key enters or toggles only once; only arrow, Page and Home/End keys repeat. In Safari and the iPad app, `Option+Shift+0` (double sharp) on a QWERTZ Mac keyboard cannot be recognized; use the toolbar accidental instead.

During mouse entry, the ghost note shows where the next note will be placed. `Shift` prefers insert placement; `Alt/Option` prefers chord placement.
While the step keyboard is active, `Z S X D C V G B H N J M` enter `C4` through `B4`, and `Q 2 W 3 E R 5 T 6 Y 7 U` enter `C5` through `B5` (named by their US positions: the piano keeps its shape on every layout, so on QWERTZ the bottom-left key, printed `Y`, is `C4`), all through the same semantic note-insert path as normal pitch entry. Press `P` again or `Escape` to leave that mode.

Microphone Instrument Record uses the selected duration, voice, and rhythmic cursor. Starting it disables duration-first, QWERTY step-keyboard, and guitar-fret modes so that `1` to `9` always select the duration. `Single notes` is the default and advances automatically after every accepted pitch. `Build chord` collects individually played tones at the same onset; press Right Arrow when the chord is complete to move to the next rhythmic position. Press `Alt/Option+C` while recording to switch between both recognition modes. Both modes use period-based fundamental detection so instrument overtones do not become extra notes. Choose `Guitar · written +8va` to write every sounding guitar pitch one octave higher, following standard guitar notation. While recording, the toolbar reports `No input signal`, `Input too low`, `Signal good`, or `Input too high` together with the live dB level, then shows the written pitch (and the sounding pitch in Guitar mode). If more than one audio input is available, use the microphone selector beside `MIC REC` to choose the intended device. Held tones are written only once; a stable different pitch can be accepted immediately without a silent gap, while silence rearms the same pitch.

The separate MIDI button reports connected device names or waits for a controller. MIDI pitches arriving within 35 ms form one chord. For both sources, chromatic pitches prefer flats in flat key signatures and sharps otherwise. System-exclusive messages, sustain-pedal interpretation, percussion maps, and continuous real-time rhythm transcription are not yet supported.

## Guitar TAB Input

The guitar view lives in the note input toolbar. Enable `Note Input` or press `N`, select a note or cursor position, then click `TAB`.

| Feature | Description |
| --- | --- |
| Tuning | Standard, Drop D, DADGAD, and Open G are available directly. |
| Strings | String buttons or `Alt/Option+1...6` choose the active string. |
| Frets | Fret buttons or number keys set the fret; two digits are accepted as a two-digit fret. |
| Mini TAB | Shows the active note's stored string/fret data as a compact TAB grid. |
| Techniques | Hammer-on, pull-off, slide, bend, vibrato, palm mute, let ring, dead note, harmonic, and pick direction can be toggled. |

String, fret, tuning, and guitar techniques are stored as semantic note data. MusicXML import and export preserve them through technical notation so GuitarPro and MuseScore workflows are not reduced to pitch-only data.

## Pitch, Accidentals, and Duration

Select a note and use `A` to `G`, the active-note buttons, arrow-key transposition, or the Edit Palette. Plain `ArrowUp/Down` always changes pitch chromatically by exactly one semitone per press throughout Note Input. This applies to active existing notes, individual chord tones immediately after building a chord, explicit multi-note selections, and the duration-first prepared-pitch cursor when no existing note is active. With Input Audition enabled, every such pitch edit plays the resulting pitch. Multiple selected pitches move together and remain selected for repeated presses. Selecting a note before entering or re-entering Note Input makes that selection the active note; clicking a different note while Note Input is active moves the active state to that note. `R` outside Note Input repeats the selection directly after itself, over the music that follows, and selects the copy, as MuseScore's Repeat selection does; the clipboard is not changed. In Note Input, `R` repeats the last entered note. `Q/W` halve or double duration; `Shift+Q/W` do the dotted-aware versions. A shorter value leaves rests after the note, and the following notes keep their place, as in MuseScore. Accidentals can be selected in the toolbar, with `-` for flat, `=` for natural, `+` for sharp, `Alt/Option+-` for double-flat, and `Alt/Option+=` for double-sharp.

In Note Input, an armed accidental is consumed only after the next successful pitched commit. Its sounding alteration then carries to the same letter and octave on that staff until the barline, including across voices; another octave and the next measure have independent context. The explicit written glyph is stored separately from sounding pitch and survives MusicXML, Copy/Paste, paired notation/TAB edits, and Undo/Redo.

Press `J` repeatedly to cycle a note, chord, or range through conventional enharmonic spellings. MIDI pitch, event identity, selection, ties, and same-pitch TAB fingering remain unchanged, and a selection-wide cycle is one undo step. While the QWERTY step keyboard is active, `J` intentionally remains its A-sharp piano key. For an explicitly written accidental, use Edit Palette → Accidentals or the Inspector to mark it cautionary and choose no enclosure, round parentheses, or square brackets. These presentation edits do not change pitch and survive MusicXML, Copy/Paste, paired notation/TAB, and Undo/Redo. Automatic courtesy detection and view-specific concert/transposed-pitch `Cmd/Ctrl+J` remain open.

## Articulations, Dynamics, Ties, and Slurs

| Area | Features |
| --- | --- |
| Articulations | Staccato, staccatissimo, accent, marcato, tenuto, fermata. |
| Dynamics | `pp`, `p`, `mp`, `mf`, `f`, `ff`, `fff`, `sfz`. From the keyboard, `Alt/Option+.` makes the dynamic of the note just entered (or of the selection) one level louder and `Alt/Option+,` one level softer; a note without a dynamic starts from `mf`. `Cmd/Ctrl+D` stays Duplicate (MuseScore uses it to add a dynamic). |
| Tie | In normal mode, links selected pitches to the next matching onset. In Note Input, creates the next note or chord and its ties atomically. Shortcut: `T`. |
| Slur | Spans the selection or the next note. Shortcut: `S`. In Note Input, `S` after an entry opens a slur that each following note extends; `S` again ends it. |
| Grace note | `/` inserts a separate zero-time grace note before the selected anchor without changing the main note's duration; barline starts and paired notation/TAB are supported. |
| Tuplets | Select exactly one note, chord, or rest, then divide its duration with toolbar ratios 2:3 through 9:8 or `Cmd/Ctrl+2...9`; the remaining units are editable rests. |

Some notation marks may be visual-only depending on playback support.
Direction and placement editing remains intentionally conservative: the Inspector now exposes semantic placement for staff text, expression text, dynamics, existing selected articulations or fermatas, already-existing tie starts, and already-existing slur spans, while direction placement for wedges and ottavas remains roundtrip-safe in the core/import/export path.

## Barlines, Repeats, and Slashes

The Edit Palette can set regular, double, final, start repeat, and end repeat barlines at the selected measure. The Inspector adds start/end repeats and first/second endings. The Note Input toolbar can insert a rhythmic slash or fill the current measure with slashes (`Cmd/Ctrl+/`).

## Chord Symbols, Lyrics, and Text

Dynamics, chord symbols, slash fills and staff or expression text apply to the instrument and staff of the selected note. Text added without a selection stays score-wide.

With a note selected, `Cmd/Ctrl+K` opens an inline harmony cursor directly at the score position. Existing chord symbols load for quick overwrite, `Enter` applies, and `Escape` cancels. Without a note selection, `Cmd/Ctrl+K` still opens the Command Center. The Inspector adds rehearsal marks, staff text, expressions, dynamics, and lyric lines. Staff text and expression text can be placed above or below the staff, selected-note dynamics now preload both the current semantic value and placement when available, an existing selected articulation or fermata can be placed above or below, an existing selected tie start can be placed above or below, and an existing slur selected as a semantic span can be flipped above or below without leaving the command path. Pressing `Enter` in rehearsal, staff-text, lyric, or dynamic fields still applies the edit directly through the command path.

## Inspector

The Inspector is the structured editor for score-wide and measure-level commands:

| Section | Features |
| --- | --- |
| Selection | Range transposition, clear articulations, toggle staccato/accent, add `mf`, toggle slur, and above/below placement for an existing selected articulation, fermata, tie start, or slur span. |
| Score Setup | Title, subtitle, composer, arranger. |
| Key | C, G, D, A, F, and Bb major presets. |
| Repeats & Endings | Start repeat, end repeat, first ending, second ending. |
| Time & Clef | 4/4, 3/4, 6/8, 2/2; treble, bass, alto clefs. |
| Measure | Insert/delete measure, system break, page break, staff spacing. |
| Text & Rehearsal | Rehearsal marks, staff text vs expression text, and above/below placement for text and dynamics. |
| Lyrics | Attach lyrics to selected notes. |
| Parts & Instruments | Part name, abbreviation, instrument name, transposition, part extraction, layout presets. |

To change a measure's meter, select a note or rest in that measure, open **Inspector → Time & Clef**, then choose the target meter. Existing music is rebared into the new meter instead of being discarded; shortening the meter can therefore add a following measure.

Select a note or rest and press `Delete` or `Backspace` to replace it with a rest of the same duration. In Note Input, entering a note at a selected rest replaces or splits that rest according to the selected duration; two eighth notes entered at a quarter-rest position fill that quarter.

Part extraction opens an individual part as its own working score.

## Edit Palette

The left palette can be expanded, collapsed, or used as an icon rail. It contains selection tools, transposition by octave/semitone/whole step/perfect fifth, articulations, dynamics, ties/slurs, and barlines. Tools are disabled until a compatible note or range is selected.

The Command Center also indexes common palette edits such as transposition, ties/slurs, staccato/accent/tenuto, dynamics, final/repeat barlines, and note-input voice switching, with the same disabled-state reasons as the palette. For chord workflows, `Cmd/Ctrl+K` opens inline harmony entry when a note is selected; without a note selection, the same shortcut still opens the Command Center.
Selection and tie/slur palette actions now expose the same shortcut hints on hover as their keyboard commands.

## Playback

Playback includes play/pause (`Space`), stop, tempo slider, metronome, progress-bar seeking, and a score cursor. If playback is stopped and a note is selected, Play starts from that note. MIDI and soundfont loading can take a short moment the first time.

## AI Assistant

The AI tab opens the chat panel for natural-language score work. You can describe edits directly or use slash workflows such as `/arrange`, `/analyze`, `/practice`, `/layout`, `/repair`, and MIDI/import cleanup prompts. When a note, range, measure, or part is selected, the assistant receives that context and can scope its proposal to the current music.

Arrangement requests now use the arrangement assistant. Provider-backed plans are checked by the critic, then materialized as written-out voices plus chord symbols when the score context supports it. The result is shown as a preview with prepared operations such as clearing the target voice range, inserting realized notes, and adding chords; paired guitar TAB staves are mirrored when playable.

Score-changing arrangement, layout, and other risky batches stay preview-gated. The score is not changed when the preview appears. Click **Apply** or type `apply` to write it into the score; click **Cancel** or type `cancel` to discard it. The preview lists affected measures, risks, validator findings, and the prepared command summary. Local chat commands include `undo`, `redo`, `apply`, `confirm`, `yes`, `cancel`, `no`, and their German equivalents.

Provider setup is in **AI model settings**. Claude and Gemini need their API keys there; Ollama uses your local Ollama server and can use discovered models or a custom `model:tag`. The selected provider and model are shown in the header and included in assistant responses.

The opening screen also shows AI readiness before you open a score. It reports whether local Ollama was detected, whether Claude or Gemini keys are saved, and whether local helper workflows are available. Use **AI settings** there to add keys, set an Ollama base URL, or adjust default models before starting an assistant task.

When no provider is configured, a provider call fails, or the request matches a deterministic local workflow, nex-note falls back to local helpers. These can analyze the score, suggest practice versions, add chord/expression previews, handle simple arrangements, and run layout cleanup without sending the score to a cloud provider. Local fallbacks still use the same preview/apply/cancel model for score-changing batches.

## AI Providers and Benchmarks

nex-note supports Ollama, Claude, Gemini, and Benchmark mode. Ollama models can be selected from the discovered list or added as a custom `model:tag`. Benchmark mode compares provider results, latency, XML validity, and operations. CLI benchmarks are available through `npm run benchmark` and `npm run benchmark:quick`.

## Library and Recent Files

The Library stores loaded scores locally in browser storage. You can open scores, mark favorites, filter by title or format, see score statistics, remove individual scores, or clear the library. Recent Files provides fast access to recently opened files.

For faster reopening, nex-note uses the `.nxn` working copy in the selected `nex-note-projects` folder. The Library stores only metadata and the working-copy filename; the actual `.nxn` project state lives as a file in the selected folder. If the project folder is moved or deleted, source files remain unchanged; nex-note will need to import or convert them again next time.

## Export and Save

| Feature | Result |
| --- | --- |
| Save as library score | Stores the current score in the local library. |
| Save project `.nxn` | Downloads an editable nex-note project. |
| Export compressed MusicXML | Downloads `.mxl`. |
| Export ABC notation | Downloads `.abc` using MuseScore CLI or fallback exporter. |
| Export practice pack | Creates a JSON practice pack. |
| Print view / Print score | Opens page preview or browser print. |

MXL is the main round-trip format for MuseScore, Finale, Dorico, and Sibelius. Developer and release checks can also run `npm run smoke:musescore-roundtrip`; that harness checks MusicXML, app-style MXL, and MSCZ through MuseScore CLI and writes diagnostics under `.nex/musescore-roundtrip-smoke-*`.

## Layout and View

Use zoom controls, view mode, Navigator, Find/Go to, AI layout cleanup, system/page breaks, staff spacing, and part layout presets (`Compact`, `Balanced`, `Roomy`, `Choir`) to prepare readable pages. Automatic horizontal layout reserves additional minimum width for long lyric syllables, chord symbols, and expression text, and reflows systems when those measures no longer fit safely. Vertical lyric spacing follows the number of stacked verses rather than the number of syllables, so long vocal passages stay compact while multi-verse text remains separated. A staff-spacing value applies from its measure onward until a later applicable value replaces it; a staff/part-specific value takes precedence over a global value at the same measure. The Measure Inspector also provides `Balanced`, `Relaxed`, and `Open` collision spacing. This policy applies from the selected measure onward on that staff; a later policy replaces it, and the roomier modes enforce additional vertical clearance.

## Undo, Redo, and History

Undo is `Cmd/Ctrl+Z`; redo is `Cmd/Ctrl+Shift+Z` or `Cmd/Ctrl+Y`. History is command-based and bounded, so very old edits can drop out after many changes.

During Note Input, Undo puts the input cursor back where the undone note or rest was entered, and you can keep typing from there; the note before the cursor sets the octave of the next letter. Redo moves the cursor after the redone entry. `Q`/`W` in Note Input change the note just entered and move the cursor past it.

## Debug and Bug Reports

In debug mode, `Report bug` exports a bundle with score data, runtime state, recent actions, and Markdown/JSON reports. Doctor Mode and visual debug tools help diagnose note input, rhythm, layout, and semantic-grid issues.

## Known Limits

AI quality depends on the selected provider and model. PDF/image import depends on Audiveris. MSCZ, GuitarPro, MIDI, and best ABC output depend on MuseScore CLI. The roundtrip harness now separates nex-note export failures from local MuseScore crashes; on the current macOS test machine, MuseScore 4.7.3 can still abort on source-baseline conversions with `mutex lock failed`, so MSCZ parity remains an accepted alpha limitation until verified on a stable MuseScore install. Some notation marks may be visual-only for playback. Some MuseScore/Finale shortcuts are still missing; see [keyboard-shortcuts.md](./keyboard-shortcuts.md).
