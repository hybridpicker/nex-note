import assert from 'node:assert/strict';
import test from 'node:test';

import { resolveMuseScorePointerEntryMode } from '../src/score-input/pointer-entry-mode.ts';
import { applyGhostPlacementModifiers, resolveGhostPlacementIntent } from '../src/score-input/smart-ghost-note.ts';

/*
 * M4 in docs/note-entry-mastery-ledger.md. MuseScore handbook, "Entering notes and rests": in note
 * input "clicking will add notes to the chord" at that position, "to replace existing notes instead,
 * hold Shift". A plain click never pushes the following music later.
 */

const at = (placementMode: 'replace' | 'insert' | 'chord', placementAnchorIsRest: boolean | undefined) => ({
  placementMode,
  placementAnchorIsRest,
  measureId: 'm1', measureNumber: 1, staffIndex: 1, voiceId: 1, timestampNum: 1, timestampDen: 4,
});
const elsewhere = { measureId: 'm1', measureNumber: 1, staffIndex: 1, voiceId: 1, timestampNum: 3, timestampDen: 4 };
const standard = { entryMode: 'insert' as const, chordInputMode: false, selectedNote: elsewhere, noteInputAnchor: elsewhere, recentCommitTarget: null };

test('M4: a plain click on an onset that holds a note adds to its chord, wherever the pointer is around the notehead', () => {
  for (const zone of ['insert', 'replace', 'chord'] as const) {
    assert.equal(resolveMuseScorePointerEntryMode(at(zone, false), standard)?.placementMode, 'chord', `pointer zone ${zone}`);
  }
});

test('M4: a plain click on the note under the input cursor also adds to its chord', () => {
  const target = at('replace', false);
  assert.equal(resolveMuseScorePointerEntryMode(target, { ...standard, selectedNote: target, noteInputAnchor: target })?.placementMode, 'chord');
});

test('M4: a plain click on a rest writes over the rest', () => {
  assert.equal(resolveMuseScorePointerEntryMode(at('replace', true), standard)?.placementMode, 'replace');
});

test('M4: in Replace mode a click replaces what stands at the onset', () => {
  for (const zone of ['insert', 'replace', 'chord'] as const) {
    assert.equal(resolveMuseScorePointerEntryMode(at(zone, false), { ...standard, entryMode: 'overwrite' })?.placementMode, 'replace', `pointer zone ${zone}`);
  }
});

test('M4: Shift replaces, Alt adds to the chord, Cmd/Ctrl+Shift inserts; modifiers lock the placement', () => {
  const base = at('replace', false);
  assert.equal(applyGhostPlacementModifiers(base, { shiftKey: true })?.placementMode, 'replace');
  assert.equal(applyGhostPlacementModifiers(base, { altKey: true })?.placementMode, 'chord');
  assert.equal(applyGhostPlacementModifiers(base, { shiftKey: true, metaKey: true })?.placementMode, 'insert');
  assert.equal(applyGhostPlacementModifiers(base, { shiftKey: true, ctrlKey: true })?.placementMode, 'insert');
  const locked = { ...at('replace', false), placementLockedByModifier: true };
  assert.equal(resolveMuseScorePointerEntryMode(locked, standard)?.placementMode, 'replace', 'Shift+click is not turned into a chord tone');
});

test('M4: a pointer between two notes belongs to the nearer one; it does not open an insert point', () => {
  const anchors = [
    { ratio: 0, x: 100, voiceId: 1, kind: 'main' as const, isRest: false },
    { ratio: 2, x: 220, voiceId: 1, kind: 'main' as const, isRest: false },
  ];
  const near = (pointerX: number) => resolveGhostPlacementIntent({
    pointerX, snappedRatio: 1, slotDuration: 0.25, segmentStartRatio: 0, maxStartRatio: 3.75, activeVoiceId: 1, anchors,
  });
  assert.equal(near(140).anchor?.ratio, 0);
  assert.equal(near(140).targetRatio, 0);
  assert.equal(near(190).anchor?.ratio, 2);
  assert.equal(near(190).targetRatio, 2);
  assert.notEqual(near(160).anchor, null);
});

test('M4: a click on a note of another value than the armed one replaces it; the same value adds to the chord', () => {
  // MuseScore `NoteInput::putNote`: add to the chord only if "chord duration == input duration".
  const same = { valueMatchesArmed: true, hasPitch: false, noteCount: 1 };
  const other = { valueMatchesArmed: false, hasPitch: false, noteCount: 1 };
  assert.equal(resolveMuseScorePointerEntryMode(at('replace', false), { ...standard, anchorChord: same })?.placementMode, 'chord');
  assert.equal(resolveMuseScorePointerEntryMode(at('replace', false), { ...standard, anchorChord: other })?.placementMode, 'replace');
  assert.equal(resolveMuseScorePointerEntryMode(at('chord', false), { ...standard, anchorChord: other })?.placementMode, 'replace');
  // Chord input mode and Alt+click build chords whatever the value.
  assert.equal(resolveMuseScorePointerEntryMode(at('replace', false), { ...standard, chordInputMode: true, anchorChord: other })?.placementMode, 'chord');
});

// ---------------------------------------------------------------------------------------------
// M4a: a click on a pitch the chord already has (`NoteInput::putNote`: "if a note with the same pitch
// already exists in the chord, remove it", and nothing happens when it is the chord's only note).

import { act } from 'react-test-renderer';

import { mountApp } from './support/app-harness.ts';
import { scoreXml, TREBLE } from './support/entry-fixtures.ts';
import { selectableNotes } from './support/entry-harness.ts';
import { summarizeScore } from './support/score-summary.ts';

const chordNote = (step: string, octave: number, chord: boolean) => (
  `<note>${chord ? '<chord/>' : ''}<pitch><step>${step}</step><octave>${octave}</octave></pitch><duration>4</duration><voice>1</voice><type>quarter</type></note>`
);
const CHORD_BAR = scoreXml({
  beats: 4, beatType: 4, measures: 2,
  parts: [{ ...TREBLE, content: { '1:1': `${chordNote('C', 5, false)}${chordNote('E', 5, true)}<note><rest/><duration>12</duration><voice>1</voice><type>half</type><dot/></note>` } }],
});

function clickChordTone(harness: ReturnType<typeof mountApp>, step: string, octave: number) {
  const anchor = selectableNotes(harness.xml).find((note) => note.measureNumber === 1 && note.timestampNum === 0 && !note.isRest)!;
  act(() => {
    harness.editor.placeNoteAt({
      source: 'pointer', mode: 'chord',
      measureId: anchor.coreMeasureId ?? null, corePartId: anchor.corePartId ?? null,
      measureNumber: 1, staffIndex: 1, voiceId: 1, timestampNum: 0, timestampDen: 1, ratio: 0, domX: null,
      step, octave, alter: 0, diagnostics: [],
    });
  });
  harness.rerender();
}
const beatOne = (xml: string) => summarizeScore(xml).filter((line) => line.startsWith('m1 v1 @0 '));

test('M4a: a click on a tone the chord already has removes it; on the only note of the chord nothing happens', () => {
  const harness = mountApp(CHORD_BAR);
  harness.press('N 5');
  const before = harness.xml;
  assert.deepEqual(beatOne(before), ['m1 v1 @0 C5 quarter', 'm1 v1 @0 +E5 quarter']);

  clickChordTone(harness, 'E', 5);
  assert.deepEqual(beatOne(harness.xml), ['m1 v1 @0 C5 quarter'], 'the E is taken out of the chord');

  const single = harness.xml;
  clickChordTone(harness, 'C', 5);
  assert.equal(harness.xml, single, 'the only note of the chord stays');

  harness.undo();
  assert.equal(harness.xml, before, 'one Undo step brings the tone back');
  harness.unmount();
});

// ---------------------------------------------------------------------------------------------
// The click commits the preview: a notehead near the pointer does not take the click when the ghost
// names another pitch.

import { shouldCommitPointerGhostOverDirectNote } from '../src/score-input/pointer-entry-mode.ts';

test('M4: a replace ghost at another pitch than the note beside it is committed, not turned into a selection', () => {
  const onset = { measureId: 'm2', measureNumber: 2, staffIndex: 1, voiceId: 1, timestampNum: 0, timestampDen: 4 };
  const ghost = { ...onset, step: 'E', octave: 5, alter: 0, placementMode: 'replace' as const, resolvedTarget: { mode: 'replace' as const } };
  const quarterG4 = { ...onset, step: 'G', octave: 4, alter: 0, isRest: false };
  // At 50 % zoom the generous hit rectangle of the G4 reaches the pointer that previews an E5.
  const nearby = { directlyHitRendered: true, clickedNoteheadPath: false, clickedVisibleGhostAtPointer: false, altKey: false };
  assert.equal(shouldCommitPointerGhostOverDirectNote({ ghostTarget: ghost, directNote: quarterG4, ...nearby }), true);
  // A press on the note itself, at its own pitch, still selects it (and starts a drag).
  const sameNote = { ...ghost, step: 'G', octave: 4 };
  assert.equal(shouldCommitPointerGhostOverDirectNote({ ghostTarget: sameNote, directNote: quarterG4, ...nearby }), false);
});

test('M4: a note of another voice at the onset is not a chord to add to; the entry goes into the input voice', () => {
  // Voice 2 is the input voice and has nothing at this onset; the pointer rests on a voice-1 note.
  const crossVoice = { ...at('insert', false), voiceId: 2 };
  const resolved = resolveMuseScorePointerEntryMode(crossVoice, { ...standard, anchorChord: null });
  assert.equal(resolved?.placementMode, 'insert');
  assert.equal(resolved?.voiceId, 2);
});

test('M4: out of reach of every notehead the intent follows the onset the grid snapped to', () => {
  // The pointer (x 742) is a little nearer to the note at x 762, but the grid snapped to the onset at
  // x 718: the intent must name that note, or the preview gets one note's onset and the other's place.
  const anchors = [
    { ratio: 0.5, x: 718, voiceId: 1, kind: 'main' as const, isRest: false },
    { ratio: 0.625, x: 762, voiceId: 1, kind: 'main' as const, isRest: false },
  ];
  const intent = resolveGhostPlacementIntent({
    pointerX: 742, snappedRatio: 0.5, slotDuration: 0.25, segmentStartRatio: 0, maxStartRatio: 0.75, activeVoiceId: 1, anchors, noteheadWidth: 12,
  });
  assert.equal(intent.anchor?.x, 718);
  assert.equal(intent.targetRatio, 0.5);
});
