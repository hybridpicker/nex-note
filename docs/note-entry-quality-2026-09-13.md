# Note entry quality: September 2026

This change improves the existing semantic core and React editor. It does not
establish complete MuseScore Studio or Dorico parity. Automated browser input,
native compilation, physical device interaction, and external application
interoperability are separate evidence categories below.

## Verified comparison references

Reviewed on 2026-09-13. MuseScore Studio documents pitch-before-duration input,
voice-coloured pitch preview, and collecting MIDI chord tones while keys overlap
in [Input by duration mode](https://handbook.musescore.org/en_gb/basics/input-by-duration-mode).
Its [tuplet handbook](https://handbook.musescore.org/notation/rhythm-meter-and-measures/tuplets)
describes custom ratios and nested tuplets. These are interaction references,
not a claim that Nex Note has all of the same options.

Dorico Pro 6.2 documents configurable insertion scope in
[Insert mode](https://www.steinberg.help/r/dorico-pro/6.2/en/dorico/topics/write_mode/write_mode_note_input/write_mode_note_input_inputting_insert_mode_t.html?contentId=rj~Z_IQbx9P1ZFS6gVz1rA),
ratio/beat-unit entry and nested tuplets in
[Inputting tuplets](https://www.steinberg.help/r/dorico-pro/6.2/en/dorico/topics/write_mode/write_mode_note_input/write_mode_tuplets_inputting_t.html?contentId=PrqXRoBl7pOZ5cdPpOivEg),
and separate smallest-unit, tuplet detection, gap-fill and grace detection in
[Quantization options](https://www.steinberg.help/r/dorico-pro/6.2/en/dorico/topics/project_file_handling/project_file_handling_quantize_options_r.html?contentId=7vEQYrbbgbhHei5KCuQNiA).
Nex Note's recorder currently has binary-grid quantization and a single-voice
chord-gate policy; it does not infer those additional Dorico structures.

## Product behaviour and boundaries

### 1. Reliable input

Focus loss and hidden documents cancel both tablet refinement and existing-note
dragging before releasing capture. Queued animation-frame samples cannot commit
on a later pointer-up. The new regression failed before the fix. The existing
resolved-target preview/validation/commit pipeline remains authoritative.
Obsolete OSMD loads now check cancellation before rendering stale content.
Dense mouse chord entry compares the pointer distance to the visible ghost and
the selected notehead: a closer different-pitch chord ghost wins, while exact
same-pitch presses and touch/Pencil drag priority remain unchanged. Rendered
revision metadata lets browser checks measure the current engraved geometry.

Prepared semantic proposals are reused only if both the immutable core object,
XML baseline and command fingerprint still match. Otherwise commands are
recomputed. Rejected semantic commands roll back the entire batch, including
commands executed through earlier fallback runs. The advanced controls report
whether the history/Doctor layer actually accepted the action.

Automated pointer events do not prove Pencil pressure, palm rejection, physical
jitter or every zoom/system/page combination. Existing corpus evidence remains
bounded by its actual fixtures; no universal 100% interaction claim is made.

### 2. Bounded rhythm correction

Select an onset, open **Rhythm, tuplets and MIDI**, choose the duration, scope and
**Stop after bar**, then insert time, delete onset plus time, or resize onset.
The command handles voice plus linked TAB, all voices of the instrument, or all
voices of the score. Positive changes consume available trailing rest space;
occupied overflow is rejected. Negative changes fill the remaining space with
rests. Music after the stop bar keeps its semantic position and duration.
Division-grid rescaling may change XML integers outside the range without
changing their musical values.

Complete moved tuplets must remain inside one target bar. Boundaries inside a
sustained voice, partial tuplets, split tie chains, and tied/tuplet source
resizing reject atomically. Whole ties inside the moved region remain linked;
new bar crossings split notes into tied fragments. The command does not append
bars implicitly. Add empty bars or shorten the chosen shift first.

### 3. Tuplets and grace sequences

Custom ratios support actual 2–32 and normal 1–32, subject to an exactly
representable written unit, integer division grid <= 1,048,576, and at most four
enclosing tuplets. Nested groups retain independent bracket ratios; MusicXML
`time-modification` contains the product of enclosing ratios. The main editor overlays the independent
5:2/3:2 brackets from core identities because OSMD 1.9 otherwise labels both
with the combined 15:4 ratio. Ordinary, unrelated tuplet XML is unchanged.
The editor and ScorePreview now share this adapter. Print waits for the current
XML to finish rendering. SVG view boxes and print width constraints keep the
whole system inside the page. Browser screenshots, resized preview geometry and
rasterized A4 PDF pages are inspected separately. Tuplet numbers are paired
within their part/bar/staff/voice, so reused numbers elsewhere are preserved.
The first source
note/chord/rest keeps its identity; additional units start as editable rests.
The dedicated unit editor changes pitch, adds chord tones or restores a rest
without changing sounding duration, including within nested groups. It currently
requires unpaired notation; arbitrary ordinary mouse/MIDI insertion inside
nested groups is not claimed.

Range conversion accepts exactly the requested number of equal, contiguous
rhythmic units in one voice/bar and a compressing ratio. It retains pitches and
fills the freed end with rests. Existing tuplets, grace passages, ties and linked
TAB range conversion are rejected. Tuplet spans do not automatically cross bars.

Grace controls add, select, repitch, reorder and delete individual zero-time
notes. Stable same-onset ordering survives normalization and export. Main-note
identity and duration remain unchanged. Copy includes grace notes belonging to
selected rhythmic anchors and requires complete tuplets within one part and a
consistent source division grid. Paste scales the target grid and remaps all
copied tuplet/grace identities; tuplets crossing a target bar are rejected.
Single-event duplication rejects tuplets, grace passages, chords, ties and
linked TAB with an explanatory diagnostic; use complete supported clipboard
passages where applicable. Linked TAB paste is explicitly rejected atomically:
the former legacy fallback silently ignored this command. Mixed-grid/multi-part
clipboard selections remain unsupported.

### 4. Notation choices

The beat-group editor accepts additive meters such as 3+2/8 and 2+2+3/8 and feeds
the existing rhythm speller plus default beaming. Existing beam groups remain
unchanged in lanes whose rhythmic/pitch content and meter are unchanged.
**Keep written duration** stores a local non-printing MusicXML notation marker;
**Automatic duration** removes it. This is a spelling preference, not a change
to sounding length or an editor for arbitrary multi-fragment tie chains.

Automatic cautionaries can be off, mark newly entered pitches that differ from
the previous bar's same staff-step/octave, or mark every newly entered pitch.
Explicit accidental glyphs remain authoritative. The policy is persisted in a
MusicXML miscellaneous field and NXN. It is a bounded previous-bar rule, not a
complete engraving engine for distant reminders or key-change editorial style.

### 5. MIDI

Exactly one selected input port feeds the shared pipeline. Disconnect enters
waiting without switching to another device; reconnect restores the selected
ID. Disable, unmount, mode exit and focus loss discard pending chords. A late
permission result cannot re-enable a disabled session. Port binding generations
ignore queued messages and stale selection failures. Native start/select/stop
operations are serialized, and closing an obsolete access cannot stop its
replacement. Transport replacement cancels an active recording. MIDI received
while AudioContext.resume is pending belongs to the arming recorder, preventing
accidental step-input fallthrough. A take is bound to immutable document identity
rather than a reusable revision number.

Step input accumulates overlapping physical keys until all are released. Rolled
chords no longer depend on a 35 ms timer. A repeated Note-On for an already held
key closes the previous onset and starts another. Note-Off and velocity-zero
Note-On release keys. Sustain does not affect notation; controller resets drop
pending keys. Duration-before-pitch and the existing pitch-before-duration mode
receive the same normalized chord batch.

Recording uses a WebAudio metronome, 0–16 count-in beats, 20–300 BPM and quarter,
eighth, 16th or 32nd grids. Original timestamps remain in memory for review and
requantization. Chords use the longest gate at their onset, clipped at the next
onset. Non-binary gates become exact tied notation. Independent overlapping
voices, inferred tuplets/graces and pedal transcription are unsupported. Apply
replaces only the bounded chosen voice; linked TAB real-time replacement is
rejected. Requantization cannot overwrite unrelated edits made since the take.
Raw takes are session-local and are not saved in NXN. Rapid native attacks
publish each semantic transaction and cursor before the next attack. Confirming
a pitch already present advances the cursor without manufacturing an Undo entry.

Web and Electron use Web MIDI. The iPad shell now registers a small CoreMIDI
Capacitor plugin that enumerates/selects sources and transports timestamped MIDI
1 note/control messages. TypeScript owns chord accumulation, quantization and
commands. No provider secrets are introduced into the native bundle. The bridge
ignores SysEx and does not implement MIDI 2 UMP. A native build alone does not
validate external USB/Bluetooth devices or event delivery under load.

### 6. Performance

`npx tsx scripts/benchmark-note-entry.ts <report.json>` reproduces the previous
double semantic execution. Add `--prepared` to measure verified proposal reuse.
Both variants alternate the same pitch edit, check preview/commit XML equality,
and use four warm-up plus twenty measured samples for 32/512/4096 events.
This isolates command verification/commit and excludes history bookkeeping,
layout, physical display and audio hardware. Initial pre-change baseline files
are retained separately from final same-code paired runs.

The browser opt-in flag `window.__NEX_NOTE_MEASURE_INPUT__ = true` exposes
`window.__NEX_NOTE_INPUT_METRICS__.read()` and `.reset()`. It retains at most 256
numeric samples per stage and no score contents or identifiers. OSMD load/render
and layout projection are timed individually. Two animation frames after state
publication provide a software display proxy. Audio measures scheduling only.
The input marker is latest-event based, so overlapping rapid events must not be
interpreted as independently measured physical latency.

Engineering targets: preview p95 <= 50 ms (about three 60 Hz frames), visible
small/medium edits <= 150 ms and large edits <= 300 ms; audio scheduling <= 30 ms
when an instrument is already loaded. These are interaction budgets, not
measured MuseScore/Dorico targets. Large-score rendering still requires work.
No microphone/loopback/photodiode test has measured actual sound/display delay.
A complete paired browser-stage baseline is now available below. No acoustic
baseline exists. The earlier semantic-only benchmark remains a separate result.

### 7. Workflow evidence

| Workflow | Automated evidence | Limits |
| --- | --- | --- |
| Nested tuplets, grace correction, bounded insertion | `note-entry-advanced.test.ts`, `note-entry-quality.spec.ts`: semantic values, render, rejection, Undo/Redo | Physical input and arbitrary nesting corpus pending |
| MIDI physical-key semantics | `midi-input.test.ts`, browser selected-device chord sequence | Synthetic messages; no hardware source available |
| Recording/requantization | `midi-recording.test.ts`, browser take review/apply/history sequence | Single voice, binary grids, no pedal transcription |
| Piano, leadsheet, ensemble, linked TAB, nested tuplets/graces | `note-entry-workflows.test.ts`: pitch correction, NXN save/open, MXL extraction, XML semantic comparison, MIDI output stability | MIDI output equality is not an acoustic performance test |
| Selection, Copy/Paste, duplicate, Undo/Redo | Five-corpus hook workflow plus advanced cross-grid nested clipboard regression | Linked TAB paste/duplicate and complex single-event duplicate reject explicitly |
| Existing editor/history/imported fixtures | Full repository unit suite and focused pointer/TAB/browser corpus | Historical full-corpus results are not a rerun of every manual task |
| External MuseScore/Dorico | Separate external report below | Crashes/unavailable apps never count as successful exchanges |

Comparisons cover pitch, normalized onset/duration, voice, chord flags, ties,
written duration, cautionaries, tuplet ratios/membership and grace counts. NXN
retains core IDs; MusicXML equality is semantic because import regenerates IDs.
Undo/Redo exact XML comparison is appropriate when restoring the same snapshot.

Fallback playback now merges adjacent same-voice/same-pitch ties into one MIDI
event. Zero-time grace runs use an on-beat performance policy: up to half the
main gate, capped at one eighth-quarter per grace, is distributed across the
ordered run. This changes performance scheduling, never score duration. Existing
tie continuations retain their sustained gate. MIDI uses 480 PPQ; absolute
endpoint rounding avoids cumulative drift, but arbitrary nested ratios below
that resolution cannot be rendered exactly in MIDI.

## Execution evidence

Final gate results are recorded individually in
`.nex/note-entry-quality/finalization/final-verification.json`, including the
packaged-app source fingerprint and screenshots. Local
synthetic logs and benchmark JSON are under `.nex/note-entry-quality/` (ignored
by Git). No new branch or worktree was created for this assignment.

### Original paired semantic benchmark (preceding working state)

Both variants ran sequentially on the preceding working code, with no browser suite or
build running concurrently: Apple M1, macOS arm64, Node v23.5.0; four warm-up and
twenty retained samples each. Values are median / p95 / maximum milliseconds.

| Corpus | Previous double execution | Prepared proposal reuse |
| --- | --- | --- |
| 32 events | 6.11 / 6.78 / 6.97 | 3.22 / 4.32 / 5.00 |
| 512 events | 100.36 / 122.86 / 144.75 | 48.15 / 49.43 / 52.73 |
| 4096 events | 1056.04 / 1072.83 / 1096.98 | 530.74 / 545.28 / 650.42 |

This is approximately 47–52% lower median synchronous semantic cost. The final
paired baseline deliberately reproduces the previous execution strategy; it is
not a historical full-application build benchmark. The earlier pre-optimization
measurements remain in `baseline.json`. The earlier missing preview/audio evidence is superseded by the complete
browser-stage run in this finalization.

### Finalization evidence and ownership

The initial uncommitted `devel` state was recorded as hashes in
`.nex/note-entry-quality/finalization/initial-worktree.json` and a binary tracked
diff in `initial.patch`. Existing work was continued in place. The later user-requested source checkpoint commits and pushes the continued
implementation and finalization fixes on `devel`. No branch, worktree, published release or deployment is created. The repository
post-commit hook also generates local unsigned ZIP/DMG test artifacts. The six pre-existing QA image changes retain
their initial hashes and remain outside this commit. The final local manifest
records the commit, remote-head verification and refreshed package identity.
New fixes also cover history beyond the 100-entry limit: discarded commands
advance the undo base, while stored immutable snapshots restore exact identities.
Incoming ties reject unsafe tuplet division/range/unit editing as one batch.

The retained evidence directory is `.nex/note-entry-quality/finalization/`.
`reproductions-unit.log` and `reproductions-browser.log` precede their fixes;
failed test-harness assumptions are not counted as product defects. The final
run manifest records each gate independently. Historical counts above do not
substitute for current gates.

Current unit verification passes all **1,126 tests**, including Electron launch
and build-state regressions. The production Next build passes. The focused
quality/notation browser suite passes 41 cases; the final dense-chord and
mouse/touch/pen cancellation rerun passes six. Other focused suites include
both MIDI entry orders, rapid 24-attack input, recorder history and eleven TAB
smokes. Initial failing runs and their targeted reruns are retained, not summed
into a misleading unique-case total. The historical complete browser corpus
was not rerun in full.

The final `ipad:sync` and `ipad:doctor` pass. Xcode compiles the synchronized
payload for both the simulator and generic arm64 iOS device with signing
disabled. These are compilation gates; the signed installation and physical
interaction gates remain blocked as described below. Electron refresh and its
isolated packaged-app UI run are recorded in the final manifest after this
document is frozen, keeping the verified desktop source fingerprint current.
The PDF artifact is an actual one-page A4 export, visually checked after
rasterization for complete systems and independent nested brackets.

### Paired complete browser stages

`e2e/note-entry-performance.spec.ts` uses 32, 512 and 4096 synthetic notes,
4 warm-up iterations and 30 retained samples per stage/size. Before and after
use the same Chrome 152, viewport, Next development server, full-score fixtures,
keyboard sequence and preloaded synthetic WebAudio buffer. Pointer preview is a
separate non-mutating workload. Keyboard samples wait for each visible edit;
a separate 24-attack single-task MIDI test verifies exact pitch order and full
score preservation. These paced percentiles do not establish rapid-event latency.
No performance run overlaps a build or another test suite.

The layout adapter now updates print controls directly in the current XML,
preserving musical XML and unrelated imported print metadata instead of
projecting/exporting every note again. A CPU profile identified repeated VexFlow
Bezier bounds; a bounded 512-entry outline/scale/position cache returns cloned
bounds and does not cache or truncate scores. OSMD shape detection fails back to
the original path. The profile run has fewer samples and is not a latency result.
All raw sample arrays and median/p95/maximum values are retained in
`before/stages-*.json` and the final after-run directory named in the manifest.

<!-- BEGIN FINAL STAGES -->
Values are median / p95 / maximum in milliseconds. Median is the mean of the
middle pair for 30 samples; p95 uses nearest rank. Before values are recomputed
from the original raw arrays, which remain unchanged. Every cell has 30 samples.

| Notes | Stage | Before | Final after |
| --- | --- | --- | --- |
| 32 | Pointer preview | 33.5 / 38.9 / 40.0 | 29.8 / 37.3 / 38.2 |
| 32 | Visible edit | 57.9 / 127.0 / 129.9 | 53.7 / 126.6 / 131.9 |
| 32 | Audio scheduling | 6.9 / 22.1 / 22.1 | 8.0 / 24.4 / 30.2 |
| 32 | Semantic command | 3.2 / 3.9 / 4.1 | 3.5 / 4.3 / 4.6 |
| 32 | Layout projection | 2.9 / 3.5 / 3.7 | 0.7 / 0.8 / 0.9 |
| 32 | OSMD load | 4.2 / 5.4 / 5.5 | 2.7 / 3.2 / 3.4 |
| 32 | OSMD render | 18.9 / 22.7 / 22.8 | 10.9 / 12.5 / 13.4 |
| 512 | Pointer preview | 34.1 / 44.8 / 45.2 | 37.9 / 53.5 / 58.8 |
| 512 | Visible edit | 519.7 / 548.8 / 558.1 | 454.6 / 495.0 / 496.8 |
| 512 | Audio scheduling | 61.9 / 64.9 / 69.5 | 68.0 / 74.0 / 94.5 |
| 512 | Semantic command | 38.6 / 41.8 / 45.4 | 42.6 / 45.4 / 67.3 |
| 512 | Layout projection | 36.0 / 38.5 / 41.5 | 7.3 / 8.7 / 9.4 |
| 512 | OSMD load | 39.3 / 41.0 / 42.4 | 28.0 / 31.2 / 31.6 |
| 512 | OSMD render | 171.9 / 187.5 / 187.9 | 113.0 / 134.8 / 142.3 |
| 4096 | Pointer preview | 140.0 / 144.4 / 146.8 | 158.4 / 167.4 / 172.9 |
| 4096 | Visible edit | 4446.6 / 4972.0 / 5051.5 | 3851.3 / 4781.4 / 4784.0 |
| 4096 | Audio scheduling | 464.0 / 512.5 / 535.9 | 511.1 / 585.5 / 587.0 |
| 4096 | Semantic command | 401.3 / 443.7 / 472.8 | 442.9 / 498.1 / 514.4 |
| 4096 | Layout projection | 400.9 / 442.2 / 932.9 | 63.8 / 93.1 / 103.8 |
| 4096 | OSMD load | 396.9 / 414.9 / 429.4 | 326.7 / 471.5 / 527.9 |
| 4096 | OSMD render | 1798.5 / 1909.4 / 1927.6 | 1485.0 / 1997.5 / 2077.7 |

The final dataset is `after-final/stages-*.json`; the earlier `after/` run is
retained as an intermediate optimization run, not selected as final acceptance.
Small-score budgets pass. Medium/large preview, visible-edit and audio-scheduling
budgets remain open. Neither suite success nor lower layout time closes these
interaction budgets. Full-score semantic export, OSMD and DOM geometry collection
still need incremental work. No physical acoustic latency was measured.
<!-- END FINAL STAGES -->

### External programs and devices

MuseScore Studio 4.7.3 is installed; Dorico is absent from the application
locations checked. The installed `--help` rejects the older `--config-folder`
and `--no-synthesizer` switches. The
[4.7.3 configuration source](https://github.com/musescore/MuseScore/blob/v4.7.3/src/framework/global/internal/globalconfiguration.cpp)
uses Qt standard macOS paths. The conversion investigation therefore denies
access to existing user Library/Documents/configuration paths and network access
with a process sandbox; separate XDG paths alone are not claimed as macOS
profile isolation. No existing preferences were reset or read. This restricted
startup differs from a normal interactive session and cannot prove its stability.

The Cocoa piano conversion first exited with SIGABRT and `mutex lock failed`,
but left a valid MXL. A repeat and nested conversion exited zero. The bundled
application has only the Cocoa Qt platform plugin; the offscreen variant aborts
before conversion. Neither a surviving file nor a zero exit establishes musical
roundtrip correctness: the nested exchange changed 31 to 33 events, replaced
independent 5:2 / 3:2 groups with sequential 15:4 / 5:2 groups, and changed MIDI
output. Adding explicit tuplet note types in a separate synthetic probe did not
repair it. The piano fixture also changed on reimport. Outputs, return codes and
semantic comparisons are retained under `external/`. The intermittent mutex
crash is reproduced, not diagnosed or fixed conclusively. No manual action,
completion-time or correction-count comparison was performed.

CoreMIDI reports zero input sources. Xcode device inventory sees one paired iPad
(iPad14,10) over the local network with its tunnel initially disconnected; a bounded device-info request subsequently
connected successfully and confirmed Developer Mode. The command inventory
provides launch/install/orientation operations but no touch/Pencil injection
command. No matching Nex Note provisioning profile was found locally.
The initial signed device build rejects the missing development team. A retry
using the single team identified by existing development certificates, supplied
only as a command-line setting, fails because Xcode has no account for that team
and no matching provisioning profile. No signing setting was committed.
The unsigned device build cannot be installed as the current app.
No physical touch/Pencil/MIDI channel is supplied by the available tools; an app
launch or simulator build must not be reported as physical interaction. Raw device/account identifiers were confined to restricted diagnostics and
removed after retaining a minimum-field status summary and sanitized signing
failure excerpt; they are excluded from the published report.
The planned Xcode macOS target still does not exist; Electron is the runnable
macOS surface. Physical iPad, MIDI/audio hardware and external editor task
comparisons remain acceptance requirements.

## Source checkpoint and remaining acceptance

The September checkpoint records implemented fixes and their current evidence;
it is not full performance acceptance or MuseScore/Dorico equivalence.
Remaining work is incremental full-score semantic/render/geometry processing
until medium and large feedback budgets pass; stable external musical
roundtrips; and physical iPad/Pencil, USB/Bluetooth MIDI and acoustic latency
verification. Unsupported musical combinations continue to reject atomically.
The final commit is followed by a fresh Electron refresh and isolated packaged
UI smoke, plus synchronized native compilation, so packaging reflects the
committed source. Commit/push verification and exact artifact fingerprints are
retained in `final-verification.json`.
