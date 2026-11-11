'use client';

import { useState, useCallback, useRef, useEffect } from 'react';
import { type ArticulationKind, type DynamicKind, type BarlineKind } from '@/lib/note-editor';
import type { ScoreCommand } from '@/lib/score-commands';
import { dbg } from '@/lib/debug';
import { readClientVisualDebugEnabled } from '@/lib/debug-flags';
import { shouldUseNativeClipboardShortcut } from '@/lib/native-clipboard-shortcuts';
import { prepareDocumentCommands, type PreparedDocumentCommands } from '@/src/score-core/commands/apply-document-commands';
import type { GuitarTechniqueKind, ScoreDocumentModel, TimedEvent } from '@/src/score-core/model/types';
import { validateScoreDocument } from '@/src/score-core/validation/validate-score-document';
import {
  buildSemanticSelectionEntries,
  compareSemanticSelectionEntries,
  expandSelectionWithTiedNotes,
  extractPitchSnapshotFromDocument,
  findDirectionByText,
  findEventReference,
  findSemanticSelectionEntry,
  resolveSelectionAnchorEntries,
  type ScoreEventLocator,
  type SemanticSelectionEntry,
} from '@/src/score-core/query/note-editor';
import { buildClipboardPayloadFromSelection } from '@/src/score-core/query/clipboard';
import { buildNoteEntryCommitCommands, toResolvedEditLocator } from '@/src/score-input/commit-resolver';
import { resolveKeyboardAccidentalShortcut, resolveKeyboardArticulationShortcut, resolveKeyboardChordInputShortcut, resolveKeyboardDeleteAction, resolveKeyboardDurationShortcut, resolveKeyboardEditTarget, resolveKeyboardEntryModeShortcut, resolveKeyboardIntervalShortcut, resolveKeyboardTupletShortcut } from '@/src/score-input/keyboard-resolver';
import { getActiveKeyboardLayoutContext, isRepeatableNavigationKey, shortcutDigit } from '@/src/score-input/keyboard-layout';
import { inputVoiceOf, storedVoiceFor } from '@/src/score-input/voice-mapping';
import { endOfEvent } from '@/src/score-input/inline-entry-navigation';
import { publishPendingEntry } from '@/src/score-input/pending-entry';
import { getEffectiveMeasureTimingFromStaff } from '@/src/score-core/measure-timing';
import { buildDurationCandidates, describeDuration, isRepresentableDuration } from '@/src/score-core/duration-utils';
import type { MidiPitch } from '@/src/score-input/midi-input';
import { formatPreparedDurationPitches, prepareDurationPitch, updatePreparedDurationPitches, type PreparedDurationPitch } from '@/src/score-input/input-by-duration';
import { resolveGuitarFretPitch, resolveGuitarTuning, type GuitarFretPitch, type GuitarTuningId } from '@/src/score-input/guitar-fretboard';
import { resolveQwertyPianoKeyEvent } from '@/src/score-input/repitch-mode';
import { inspectResolvedEditTarget } from '@/src/score-input/note-entry-validator';
import type { ResolvedEditTarget } from '@/src/score-input/types';
import type { ScoreDocumentSelectedDuration, ScoreDocumentSelectionAnchor } from '@/src/score-session/types';
import type { ScoreClipboardPayload } from '@/src/shared/schemas/clipboard';
import { beatOfOnset, formatBeat } from '@/src/score-input/position-label';
import { timestampsEqual } from '@/src/shared/music/timestamp-match';
import { resolveNextEnharmonicPitch, writtenAccidentalToAlter, type AccidentalEnclosure, type WrittenAccidental } from '@/src/shared/music/accidentals';
import { diatonicPitchIndex, keyFifthsAlterForStep, pitchFromDiatonicIndex, resolveDiatonicIntervalAbove, resolveKeyFifthsAtMeasure, resolveMeasureAccidentalAlter, resolvePitchNameEntry, type DiatonicIntervalNumber, topLineDiatonicIndex, resolveClefAtMeasure } from '@/src/score-input/staff-pitch';

export type { ArticulationKind, DynamicKind, BarlineKind };

export type NoteDuration = ScoreDocumentSelectedDuration;
export type AccidentalChoice = WrittenAccidental | null;
export type NoteEntryMode = 'insert' | 'overwrite';
export type TupletNumber = 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9;
export type TupletPreset = 'triplet' | 'quintuplet' | TupletNumber;
export type GuitarStringNumber = 1 | 2 | 3 | 4 | 5 | 6;
export type { GuitarTechniqueKind };

const DURATION_TYPE_MAP: Record<NoteDuration, string> = {
  '1': 'whole', '2': 'half', '4': 'quarter', '8': 'eighth', '16': '16th', '32': '32nd', '64': '64th',
  breve: 'breve', long: 'long',
};

const NOTE_DURATION_FROM_TYPE: Record<string, NoteDuration> = {
  breve: 'breve',
  long: 'long',
  whole: '1',
  half: '2',
  quarter: '4',
  eighth: '8',
  '16th': '16',
  '32nd': '32',
  '64th': '64',
};

const DURATION_ORDER: NoteDuration[] = ['64', '32', '16', '8', '4', '2', '1', 'breve', 'long'];

const TUPLET_NORMAL_NOTES: Record<TupletNumber, number> = {
  2: 3,
  3: 2,
  4: 3,
  5: 4,
  6: 4,
  7: 4,
  8: 6,
  9: 8,
};

const NOTE_ENUM_TO_STEP: Record<number, string> = { 0: 'C', 2: 'D', 4: 'E', 5: 'F', 7: 'G', 9: 'A', 11: 'B' };

const RHYTHMIC_BLOCKING_DIAGNOSTIC_CODES = new Set([
  'voice_overlap',
  'measure_balance',
  'voice_rhythm_sum_mismatch',
  'event_duration_notation_mismatch',
  'voice_timeline_gap',
  'voice_duration_mismatch',
  'multi_voice_rhythm_gap',
]);

function isRhythmicTargetDiagnostic(
  diagnostic: { code: string; message: string },
  target: { measureNumber: number; staffIndex: number; voiceId: number },
): boolean {
  return RHYTHMIC_BLOCKING_DIAGNOSTIC_CODES.has(diagnostic.code)
    && diagnostic.message.includes(`Measure ${target.measureNumber}`)
    && diagnostic.message.includes(`staff ${target.staffIndex}`)
    && diagnostic.message.includes(`voice ${target.voiceId}`);
}

function warnPostCommitDiagnostics(
  context: string,
  preDiagnostics: { code: string; message: string }[],
  postDiagnostics: { code: string; message: string }[],
  target: { measureNumber: number; staffIndex: number; voiceId: number },
  commands: unknown[],
) {
  const isTarget = (d: { code: string; message: string }) => isRhythmicTargetDiagnostic(d, target);
  const previousKeys = new Set(preDiagnostics.filter(isTarget).map((d) => `${d.code}:${d.message}`));
  const blocking = postDiagnostics.filter(isTarget).filter((d) => !previousKeys.has(`${d.code}:${d.message}`));
  if (blocking.length > 0) {
    // eslint-disable-next-line no-console
    console.warn('[nex-note:note-editor] post-commit diagnostics', { context, diagnostics: blocking, target, commands });
  }
}

/** Note values as fractions of a whole note, by MusicXML type name. */
const WHOLE_NOTE_FRACTION: Record<string, number> = {
  long: 4, breve: 2, whole: 1, half: 1 / 2, quarter: 1 / 4, eighth: 1 / 8,
  '16th': 1 / 16, '32nd': 1 / 32, '64th': 1 / 64,
};

function formatRejectedEditMessage(context: string, details: Record<string, unknown>): string {
  const diagnostics = Array.isArray(details.diagnostics) ? details.diagnostics : [];
  const firstDiagnostic = diagnostics.find((diagnostic): diagnostic is { message: string } => (
    Boolean(diagnostic)
    && typeof diagnostic === 'object'
    && 'message' in diagnostic
    && typeof (diagnostic as { message?: unknown }).message === 'string'
  ));
  if (firstDiagnostic) return firstDiagnostic.message;
  if (typeof details.message === 'string') return details.message;
  if (typeof details.rejectionReason === 'string') return `${context}: ${details.rejectionReason}`;
  return `${context}: edit rejected`;
}

export interface SelectedNote {
  coreEntityId?: string | null;
  coreVoiceId?: string | null;
  coreMeasureId?: string | null;
  corePartId?: string | null;
  measureNumber: number;
  staffIndex: number;
  voiceId: number;
  timestampNum: number;
  timestampDen: number;
  step: string;
  octave: number;
  alter: number;
  writtenAccidental?: WrittenAccidental;
  accidentalCautionary?: boolean;
  accidentalEnclosure?: Exclude<AccidentalEnclosure, 'none'>;
  isRest: boolean;
  durationType?: string;
  isDotted?: boolean;
  guitar?: Extract<ScoreDocumentModel['score']['parts'][number]['staves'][number]['measures'][number]['voices'][number]['events'][number], { kind: 'note' }>['guitar'];
  // OSMD graphical ref (for color management), typed as any to avoid importing OSMD types
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  graphicalNote: any;
}

export interface EditorSelection {
  entityIds: string[];
  anchorEntityId: string | null;
  anchor: SelectedNote | null;
  selectionCount?: number;
  partId?: string | null;
  staffIndex?: number;
  voiceId?: number;
}

export interface NoteEditorUpdateMeta {
  prepared?: PreparedDocumentCommands;
  selectionAnchor?: ScoreDocumentSelectionAnchor | null;
  /** Selection Undo restores. Note input sets it to the input position before the entry. */
  undoSelectionAnchor?: ScoreDocumentSelectionAnchor | null;
  /** Selection Redo restores. Note input sets it to the input position after the entry. */
  redoSelectionAnchor?: ScoreDocumentSelectionAnchor | null;
}

interface NoteClickOptions {
  additive?: boolean;
  range?: boolean;
  selectionNotes?: SelectedNote[];
  singleSelectionOnly?: boolean;
  visualOnly?: boolean;
  visualText?: string | null;
  visualMeasureNumber?: number | null;
  visualStaffIndex?: number | null;
  /** The part the clicked text belongs to, so a text direction is removed from that part only. */
  visualPartId?: string | null;
  /** Keyboard navigation along a staff: the cursor moves, the chosen input voice stays (K17). */
  keepInputVoice?: boolean;
}

interface VisualSelection {
  visualOnly: boolean;
  text: string | null;
  measureNumber: number | null;
  staffIndex: number | null;
  partId?: string | null;
}

interface UseNoteEditorOptions {
  onNoteInputActivated?: () => void;
  onActiveNotePreview?: (note: SelectedNote | null) => void;
  onActiveNotesPreview?: (notes: SelectedNote[]) => void;
  hydratedSession?: {
    selectedDuration?: NoteDuration;
    selectedVoice?: 1 | 2 | 3 | 4;
  };
}

interface DragTransposeCommitTarget {
  note: SelectedNote;
  step: string;
  octave: number;
  alter: number;
}

interface DragStringCommitTarget {
  note: SelectedNote;
  string: GuitarStringNumber;
  fret: number;
}

interface LegacyPointerPlacementTarget {
  coreMeasureId?: string | null;
  corePartId?: string | null;
  measureNumber: number;
  staffIndex: number;
  voiceId: number;
  timestampNum: number;
  timestampDen: number;
  step: string;
  octave: number;
  alter: number;
  placementMode?: 'replace' | 'insert' | 'chord';
}

/** The levels Alt/Option+. and Alt/Option+, move along. */
const DYNAMIC_SCALE: DynamicKind[] = ['pp', 'p', 'mp', 'mf', 'f', 'ff', 'fff'];

type VisualDeleteCommand =
  | Extract<ScoreCommand, { type: 'removeLyricLine' }>
  | Extract<ScoreCommand, { type: 'removeDirection' }>
  | Extract<ScoreCommand, { type: 'setTitle' | 'setSubtitle' | 'setComposer' | 'setArranger' }>;

function toSelectedNote(
  entry: SemanticSelectionEntry,
  graphicalNote: SelectedNote['graphicalNote'] = null,
): SelectedNote {
  return {
    coreEntityId: entry.coreEntityId,
    coreVoiceId: entry.coreVoiceId,
    coreMeasureId: entry.coreMeasureId,
    corePartId: entry.corePartId,
    measureNumber: entry.measureNumber,
    staffIndex: entry.staffIndex,
    voiceId: entry.voiceId,
    timestampNum: entry.timestampNum,
    timestampDen: entry.timestampDen,
    step: entry.step,
    octave: entry.octave,
    alter: entry.alter,
    writtenAccidental: entry.writtenAccidental,
    accidentalCautionary: entry.accidentalCautionary,
    accidentalEnclosure: entry.accidentalEnclosure,
    isRest: entry.isRest,
    durationType: entry.durationType,
    isDotted: entry.isDotted,
    guitar: entry.guitar,
    graphicalNote,
  };
}

function announceSemanticSelectionNavigation() {
  if (typeof window === 'undefined') return;
  window.dispatchEvent(new CustomEvent('nex-note:semantic-selection-navigation'));
}

function focusChordSymbolInput() {
  if (typeof window === 'undefined') return;
  window.dispatchEvent(new CustomEvent('nex-note:focus-inline-chord-symbol'));
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function coerceSelectedNote(input: SelectedNote | any | null): SelectedNote | null {
  if (!input) return null;
  if ('measureNumber' in input && 'timestampNum' in input && 'graphicalNote' in input) {
    return input as SelectedNote;
  }

  const sourceNote = input?.sourceNote ?? input?.SourceNote;
  if (!sourceNote) return null;

  const sourceMeasure = sourceNote.SourceMeasure ?? sourceNote.sourceMeasure;
  const parentVoiceEntry = sourceNote.ParentVoiceEntry ?? sourceNote.parentVoiceEntry;
  const parentVoice = parentVoiceEntry?.ParentVoice ?? parentVoiceEntry?.parentVoice;
  const parentStaff = sourceNote.ParentStaff ?? sourceNote.parentStaff;
  const timestamp = parentVoiceEntry?.Timestamp ?? parentVoiceEntry?.timestamp;
  const pitch = sourceNote.Pitch ?? sourceNote.pitch;

  let step = 'C';
  let octave = 4;
  let alter = 0;

  if (pitch) {
    const fundNote: number = pitch.FundamentalNote ?? pitch.fundamentalNote ?? 0;
    const accEnum: number = pitch.Accidental ?? pitch.accidental ?? 2;
    step = NOTE_ENUM_TO_STEP[fundNote] ?? 'C';
    octave = pitch.Octave ?? pitch.octave ?? 4;
    alter = accEnum === 0 ? 1 : accEnum === 1 ? -1 : 0;
  }

  return {
    measureNumber: sourceMeasure?.MeasureNumberXML ?? sourceMeasure?.measureNumberXML ?? 1,
    staffIndex: parentStaff?.Id ?? parentStaff?.id ?? 1,
    voiceId: parentVoice?.VoiceId ?? parentVoice?.voiceId ?? 1,
    timestampNum: timestamp?.Numerator ?? timestamp?.numerator ?? 0,
    timestampDen: timestamp?.Denominator ?? timestamp?.denominator ?? 1,
    step,
    octave,
    alter,
    isRest: !pitch,
    durationType: sourceNote.NoteTypeXml ?? sourceNote.noteTypeXml ?? undefined,
    isDotted: Boolean(sourceNote.NoteDots?.length ?? sourceNote.noteDots?.length ?? sourceNote.NoteDot ?? sourceNote.noteDot),
    graphicalNote: input,
  };
}

function selectedNotesEqual(a: SelectedNote | null | undefined, b: SelectedNote | null | undefined) {
  if (!a || !b) return false;
  if (a.corePartId && b.corePartId && a.corePartId !== b.corePartId) return false;
  if (a.coreMeasureId && b.coreMeasureId && a.coreMeasureId !== b.coreMeasureId) return false;
  if (a.coreEntityId && b.coreEntityId) return a.coreEntityId === b.coreEntityId;
  if (a.isRest !== b.isRest) return false;
  return a.measureNumber === b.measureNumber
    && a.staffIndex === b.staffIndex
    && a.voiceId === b.voiceId
    && timestampsEqual(a.timestampNum, a.timestampDen, b.timestampNum, b.timestampDen)
    && (
      a.isRest
      || (
        a.step === b.step
        && a.octave === b.octave
        && a.alter === b.alter
      )
    );
}

function noteMatchesPitchHint(
  note: SelectedNote | null | undefined,
  hint: {
    isRest: boolean;
    step?: string;
    octave?: number;
    alter?: number;
  } | null | undefined,
) {
  if (!note || !hint) return false;
  if (note.isRest !== hint.isRest) return false;
  if (hint.isRest) return true;
  return note.step === hint.step
    && note.octave === hint.octave
    && note.alter === hint.alter;
}

function selectionTimestampValue(note: Pick<SelectedNote, 'timestampNum' | 'timestampDen'>) {
  return note.timestampNum / Math.max(note.timestampDen, 1);
}

function compareSelectedNotes(a: SelectedNote, b: SelectedNote) {
  return (a.corePartId ?? '').localeCompare(b.corePartId ?? '')
    || a.measureNumber - b.measureNumber
    || a.staffIndex - b.staffIndex
    || a.voiceId - b.voiceId
    || selectionTimestampValue(a) - selectionTimestampValue(b)
    || a.step.localeCompare(b.step)
    || a.octave - b.octave
    || a.alter - b.alter;
}

function matchesSelectionLane(candidate: SelectedNote, reference: SelectedNote) {
  if (candidate.staffIndex !== reference.staffIndex) return false;
  if (candidate.voiceId !== reference.voiceId) return false;
  if (reference.corePartId && candidate.corePartId) {
    return candidate.corePartId === reference.corePartId;
  }
  return true;
}

function getSemanticNoteOrder(document: ScoreDocumentModel | null | undefined): SelectedNote[] {
  return buildSemanticSelectionEntries(document).map((entry) => toSelectedNote(entry));
}

function getSimultaneousPitchedNotes(
  document: ScoreDocumentModel | null | undefined,
  reference: SelectedNote | null | undefined,
) {
  if (!document || !reference || reference.isRest) return reference && !reference.isRest ? [reference] : [];
  const notes = buildSemanticSelectionEntries(document)
    .filter((entry) => (
      !entry.isRest
      && entry.measureNumber === reference.measureNumber
      && entry.staffIndex === reference.staffIndex
      && (!reference.coreMeasureId || entry.coreMeasureId === reference.coreMeasureId)
      && (!reference.corePartId || entry.corePartId === reference.corePartId)
      && timestampsEqual(entry.timestampNum, entry.timestampDen, reference.timestampNum, reference.timestampDen)
    ))
    .map((entry) => toSelectedNote(entry))
    .sort(compareSelectedNotes);
  return notes.length > 0 ? notes : [reference];
}

function getSelectionLaneOrder(document: ScoreDocumentModel | null | undefined, reference: SelectedNote) {
  const ordered = getSemanticNoteOrder(document).filter((entry) => matchesSelectionLane(entry, reference));
  return ordered.length > 0 ? ordered : getSemanticNoteOrder(document);
}

function resolveRangeSelection(document: ScoreDocumentModel | null | undefined, anchor: SelectedNote, target: SelectedNote): SelectedNote[] {
  const ordered = getSelectionLaneOrder(document, anchor)
    .filter((entry) => matchesSelectionLane(entry, target));
  const startIndex = ordered.findIndex((entry) => selectedNotesEqual(entry, anchor));
  const endIndex = ordered.findIndex((entry) => selectedNotesEqual(entry, target));
  if (startIndex < 0 || endIndex < 0) return [anchor, target].sort(compareSelectedNotes);
  const [from, to] = startIndex <= endIndex ? [startIndex, endIndex] : [endIndex, startIndex];
  return ordered.slice(from, to + 1);
}

/**
 * Positional match that ignores entity ids. Generated events (e.g. padding
 * rests) get fresh timestamp-suffixed ids on every apply, so a selection can
 * legitimately carry a different id than the same logical event in the
 * current document. Used only as a fallback after the strict id-aware match.
 */
function sameRhythmicPosition(a: SelectedNote, b: SelectedNote) {
  return matchesSelectionLane(a, b)
    && a.measureNumber === b.measureNumber
    && timestampsEqual(a.timestampNum, a.timestampDen, b.timestampNum, b.timestampDen);
}

function selectedNotesPositionallyEqual(a: SelectedNote, b: SelectedNote) {
  if (a.isRest !== b.isRest) return false;
  return a.measureNumber === b.measureNumber
    && a.staffIndex === b.staffIndex
    && a.voiceId === b.voiceId
    && timestampsEqual(a.timestampNum, a.timestampDen, b.timestampNum, b.timestampDen)
    && (
      a.isRest
      || (
        a.step === b.step
        && a.octave === b.octave
        && a.alter === b.alter
      )
    );
}

function findSelectionIndex(ordered: SelectedNote[], current: SelectedNote) {
  const strictIndex = ordered.findIndex((entry) => selectedNotesEqual(entry, current));
  if (strictIndex >= 0) return strictIndex;
  return ordered.findIndex((entry) => selectedNotesPositionallyEqual(entry, current));
}

/**
 * Where a voice ends, navigation goes on in the first voice of the same staff (K13): a second voice
 * exists only in the bars that use it, and the arrow keys must not stop at its last note.
 * `next`: the first event of the nearest later bar; `prev`: the last event before the current onset,
 * or with `firstOfBar` the first event of the nearest earlier bar.
 */
function findStaffFallback(
  document: ScoreDocumentModel | null | undefined,
  current: SelectedNote,
  direction: 'prev' | 'next',
  firstOfBar: boolean,
): SelectedNote | null {
  const staff = getSemanticNoteOrder(document).filter((entry) => (
    entry.staffIndex === current.staffIndex
    && (!current.corePartId || !entry.corePartId || entry.corePartId === current.corePartId)
  ));
  if (!staff.length) return null;
  const firstVoice = Math.min(...staff.map((entry) => entry.voiceId));
  if (current.voiceId === firstVoice) return null;
  const lane = staff.filter((entry) => entry.voiceId === firstVoice);
  const onset = (entry: SelectedNote) => entry.timestampNum / Math.max(entry.timestampDen, 1);
  if (direction === 'next') return lane.find((entry) => entry.measureNumber > current.measureNumber) ?? null;
  if (firstOfBar) {
    const earlier = lane.filter((entry) => entry.measureNumber < current.measureNumber);
    const bar = earlier.at(-1)?.measureNumber;
    return bar == null ? null : earlier.find((entry) => entry.measureNumber === bar) ?? null;
  }
  return lane.filter((entry) => (
    entry.measureNumber < current.measureNumber
    || (entry.measureNumber === current.measureNumber && onset(entry) < onset(current) - 1e-9)
  )).at(-1) ?? null;
}

function findAdjacentSelection(document: ScoreDocumentModel | null | undefined, current: SelectedNote, direction: 'prev' | 'next') {
  const ordered = getSelectionLaneOrder(document, current);
  const currentIndex = findSelectionIndex(ordered, current);
  if (currentIndex < 0) return null;
  const nextIndex = direction === 'next' ? currentIndex + 1 : currentIndex - 1;
  if (nextIndex < 0 || nextIndex >= ordered.length) return findStaffFallback(document, current, direction, false);
  return ordered[nextIndex];
}

/**
 * Octave reference when no earlier note exists in the voice: the middle line of the effective
 * clef (MuseScore NoteInput::resolveNoteInputParams). A rest only carries a placeholder pitch, so
 * the first C on a bass staff is C3 and on a treble staff C5.
 */
function clefMiddleLineReference(document: ScoreDocumentModel | null | undefined, rest: SelectedNote): SelectedNote {
  const clef = resolveClefAtMeasure(document, rest.measureNumber, rest.staffIndex, { corePartId: rest.corePartId, measureId: rest.coreMeasureId });
  const middle = pitchFromDiatonicIndex(topLineDiatonicIndex(clef) - 4);
  return { ...rest, step: middle.step, octave: middle.octave, alter: 0, isRest: false };
}

/**
 * The note a typed letter is resolved against at this position in the entry voice: the preceding
 * pitched note of that voice, else the clef's middle line. MuseScore looks up the previous chord in
 * the entry track only (NoteInput::resolveNoteInputParams), so other voices never set the register
 * and a rest's stored placeholder pitch does not either.
 */
function laneRegisterReference(document: ScoreDocumentModel | null | undefined, position: SelectedNote, voiceId: number): SelectedNote {
  const lanePosition = { ...position, voiceId };
  return getSemanticNoteOrder(document)
    .filter((note) => !note.isRest && matchesSelectionLane(note, lanePosition) && compareSelectedNotes(note, lanePosition) < 0)
    .at(-1) ?? clefMiddleLineReference(document, position);
}

/**
 * Where the cursor goes after a rest typed over silence in another voice. The document does not
 * change (a rest over a rest is the same music), but the cursor still moves past the value, as in
 * MuseScore. Returns null when the voice is not silent there or the value leaves the bar.
 */
function findCursorAfterSilentValue(
  document: ScoreDocumentModel | null | undefined,
  cursor: SelectedNote,
  voiceId: number,
  value: { duration: NoteDuration; dotted: boolean },
): SelectedNote | null {
  if (!document) return null;
  const part = document.score.parts.find((entry) => !cursor.corePartId || entry.id === cursor.corePartId);
  const staff = part?.staves.find((entry) => entry.staffIndex === cursor.staffIndex);
  const measure = staff?.measures.find((entry) => entry.measureNumber === cursor.measureNumber);
  if (!staff || !measure) return null;
  const timing = getEffectiveMeasureTimingFromStaff(staff, { measureId: measure.id, measureNumber: measure.measureNumber });
  if (!timing) return null;
  const onsetOf = (event: { timestampNum: number; timestampDen: number }) => event.timestampNum / Math.max(event.timestampDen, 1);
  const start = onsetOf(cursor);
  const end = start + inputValueWholeNotes(value.duration, value.dotted);
  const barEnd = timing.durationDivisions / Math.max(timing.divisions * 4, 1);
  if (end > barEnd + ONSET_EPSILON) return null;
  const voice = measure.voices.find((entry) => entry.voiceId === voiceId);
  const occupied = (voice?.events ?? []).some((event) => (
    event.kind === 'note'
    && onsetOf(event) < end - ONSET_EPSILON
    && onsetOf(event) + event.durationDivisions / Math.max(timing.divisions * 4, 1) > start + ONSET_EPSILON
  ));
  if (occupied) return null;
  const onStaff = getSemanticNoteOrder(document).filter((entry) => entry.corePartId === cursor.corePartId && entry.staffIndex === cursor.staffIndex);
  const atEnd = onStaff.filter((entry) => entry.measureNumber === cursor.measureNumber && Math.abs(onsetOf(entry) - end) < ONSET_EPSILON);
  const exact = atEnd.find((entry) => entry.voiceId === voiceId) ?? atEnd[0];
  if (exact) return exact;
  if (end < barEnd - ONSET_EPSILON) {
    // No event starts there in any voice (the value ends inside a longer rest). The cursor keeps
    // its lane, so the next entry still resolves through the cross-voice path at this onset.
    const timestampDen = Math.max(timing.divisions * 4, 1);
    return { ...cursor, coreEntityId: null, graphicalNote: null, isRest: true, timestampNum: Math.round(end * timestampDen), timestampDen };
  }
  const nextBar = onStaff.filter((entry) => isNextBarStartOnStaff(cursor, entry));
  return nextBar.find((entry) => entry.voiceId === voiceId) ?? nextBar[0] ?? null;
}

function findNextRhythmicSelection(document: ScoreDocumentModel | null | undefined, current: SelectedNote, skipThroughOnset: number | null = null) {
  const ordered = getSelectionLaneOrder(document, current);
  const currentIndex = findSelectionIndex(ordered, current);
  if (currentIndex < 0) return null;
  return ordered.slice(currentIndex + 1).find((entry) => (
    entry.measureNumber !== current.measureNumber
    || (
      !timestampsEqual(entry.timestampNum, entry.timestampDen, current.timestampNum, current.timestampDen)
      && (skipThroughOnset === null || entry.timestampNum / Math.max(entry.timestampDen, 1) > skipThroughOnset + ONSET_EPSILON)
    )
  )) ?? null;
}

const ONSET_EPSILON = 1e-9;

/** Written length in whole notes of an input value (single dot only, as note input sets it). */
function inputValueWholeNotes(duration: NoteDuration, dotted: boolean) {
  const base = duration === 'breve' ? 2 : duration === 'long' ? 4 : 1 / Number(duration);
  return base * (dotted ? 1.5 : 1);
}

/**
 * The onset of the last fragment of the value just entered. The rhythm speller writes a value
 * that crosses a beat as several notes or rests (an off-beat quarter becomes two tied eighths, a
 * quarter rest after an eighth two eighth rests). The next input position comes after all of
 * them, never on the entered value's own tail, which the next entry would otherwise overwrite.
 * Only the entered value's own fragments are followed: tied notes of the same pitch, or rests,
 * that start before the value's nominal end in the same bar. Tuplet members are never split.
 */
function enteredValueLastFragmentOnset(
  document: ScoreDocumentModel | null | undefined,
  entered: SelectedNote,
  value: { duration: NoteDuration; dotted: boolean },
): number | null {
  const enteredId = entered.coreEntityId;
  if (!document || !enteredId) return null;
  if (document.tuplets.some((tuplet) => tuplet.eventIds.includes(enteredId))) return null;
  const graceIds = new Set(document.graceNotes.map((grace) => grace.eventId));
  for (const part of document.score.parts) {
    for (const staff of part.staves) {
      for (const measure of staff.measures) {
        for (const voice of measure.voices) {
          const first = voice.events.find((event) => event.id === enteredId);
          if (!first) continue;
          const onsetOf = (event: TimedEvent) => event.timestampNum / Math.max(event.timestampDen, 1);
          const lane = voice.events
            .filter((event) => !event.isChord && !graceIds.has(event.id))
            .sort((a, b) => onsetOf(a) - onsetOf(b));
          const nominalEnd = onsetOf(first) + inputValueWholeNotes(value.duration, value.dotted) - ONSET_EPSILON;
          let previous: TimedEvent = first;
          let lastOnset: number | null = null;
          for (const event of lane) {
            if (onsetOf(event) <= onsetOf(first) + ONSET_EPSILON) continue;
            if (onsetOf(event) >= nominalEnd) break;
            const continues = first.kind === 'rest'
              ? event.kind === 'rest'
              : event.kind === 'note' && previous.kind === 'note' && Boolean(previous.tieStart)
                && event.pitch.step === previous.pitch.step
                && event.pitch.octave === previous.pitch.octave
                && event.pitch.alter === previous.pitch.alter;
            if (!continues) break;
            previous = event;
            lastOnset = onsetOf(event);
          }
          return lastOnset;
        }
      }
    }
  }
  return null;
}

/**
 * The next input position after an entry. The active voice may not exist in the next bar yet (a
 * second voice written only in this bar); the position is then the start of the next bar on the
 * same staff, and the voice-aware entry path writes into the active voice at that onset.
 */
function findNextInputPosition(
  document: ScoreDocumentModel | null | undefined,
  current: SelectedNote,
  enteredValue?: { duration: NoteDuration; dotted: boolean },
) {
  const skipThroughOnset = enteredValue ? enteredValueLastFragmentOnset(document, current, enteredValue) : null;
  const sameLane = findNextRhythmicSelection(document, current, skipThroughOnset);
  if (sameLane) return sameLane;
  return getSemanticNoteOrder(document).find((entry) => isNextBarStartOnStaff(current, entry)) ?? null;
}

function isNextBarStartOnStaff(current: SelectedNote, candidate: SelectedNote) {
  return candidate.corePartId === current.corePartId
    && candidate.staffIndex === current.staffIndex
    && candidate.measureNumber === current.measureNumber + 1
    && candidate.timestampNum === 0;
}

function isLocalNoteInputAdvance(current: SelectedNote, candidate: SelectedNote | null) {
  if (!candidate) return false;
  if (!matchesSelectionLane(candidate, current)) return isNextBarStartOnStaff(current, candidate);
  return compareSelectedNotes(candidate, current) > 0;
}

function findMeasureBoundary(document: ScoreDocumentModel | null | undefined, current: SelectedNote, direction: 'prev' | 'next'): SelectedNote | null {
  // Navigate within the same part/staff/voice so measure jumps stay in context.
  const ordered = getSelectionLaneOrder(document, current);
  const currentIndex = findSelectionIndex(ordered, current);
  if (currentIndex < 0) return null;
  if (direction === 'next') {
    const firstInNext = ordered.findIndex((entry) => entry.measureNumber > current.measureNumber);
    return firstInNext >= 0 ? ordered[firstInNext] : findStaffFallback(document, current, 'next', true);
  }
  // direction === 'prev'
  const firstInCurrent = ordered.findIndex((entry) => entry.measureNumber === current.measureNumber);
  if (currentIndex === firstInCurrent) {
    // Already at the first note of this measure — jump to first of previous measure
    const prevMeasure = current.measureNumber - 1;
    const firstInPrev = ordered.findIndex((entry) => entry.measureNumber === prevMeasure);
    return firstInPrev >= 0 ? ordered[firstInPrev] : findStaffFallback(document, current, 'prev', true);
  }
  return firstInCurrent >= 0 ? ordered[firstInCurrent] : null;
}

function findVerticalSelection(document: ScoreDocumentModel | null | undefined, current: SelectedNote, direction: 'up' | 'down'): SelectedNote | null {
  // MuseScore `up-chord` / `down-chord`: the note above or below in a chord, then the next voice, the
  // next staff and the next part (K16: the keys stopped at the border of a part). A staff that has
  // no event at this very onset offers what sounds there: its latest event at or before it.
  const partOrder = new Map((document?.score.parts ?? []).map((part, index) => [part.id, index]));
  const partRank = (entry: SelectedNote) => partOrder.get(entry.corePartId ?? '') ?? 0;
  const onset = (entry: SelectedNote) => entry.timestampNum / Math.max(entry.timestampDen, 1);
  const lanes = new Map<string, SelectedNote[]>();
  for (const entry of getSemanticNoteOrder(document)) {
    if (entry.measureNumber !== current.measureNumber || onset(entry) > onset(current) + 1e-9) continue;
    const key = `${partRank(entry)}:${entry.staffIndex}:${entry.voiceId}`;
    lanes.set(key, [...(lanes.get(key) ?? []), entry]);
  }
  const sameMoment = [...lanes.values()].flatMap((lane) => {
    const latest = Math.max(...lane.map(onset));
    return lane.filter((entry) => Math.abs(onset(entry) - latest) < 1e-9);
  });
  if (!sameMoment.length) return null;

  const ranked = sameMoment.sort((a, b) => (
    partRank(a) - partRank(b)
    || a.staffIndex - b.staffIndex
    || a.voiceId - b.voiceId
    || compareSelectedNotes(a, b)
  ));
  const currentIndex = findSelectionIndex(ranked, current);
  if (currentIndex < 0) return null;
  const nextIndex = direction === 'down' ? currentIndex + 1 : currentIndex - 1;
  if (nextIndex < 0 || nextIndex >= ranked.length) return null;
  return ranked[nextIndex];
}

function hasExternalEventReferences(
  document: ScoreDocumentModel,
  eventId: string,
  options?: { ignoreChordGroups?: boolean },
) {
  return document.slurs.some((slur) => slur.startEventId === eventId || slur.stopEventId === eventId)
    || document.beams.some((beam) => beam.eventIds.includes(eventId))
    || document.tuplets.some((tuplet) => tuplet.eventIds.includes(eventId))
    || (!options?.ignoreChordGroups && document.chordGroups.some((chord) => chord.eventIds.includes(eventId)))
    || document.graceNotes.some((grace) => grace.eventId === eventId)
    || document.lyricLines.some((lyric) => lyric.eventId === eventId);
}

function resolveAdjacentStaffMove(
  document: ScoreDocumentModel | null | undefined,
  current: SelectedNote | null,
  direction: 'up' | 'down',
): { target: SelectedNote; sourceEvent: TimedEvent; placement: 'replaceRest' | 'addChordTone' | 'selectRest' } | null {
  if (!document || !current) return null;
  const sourceRef = findEventReference(document, current);
  if (!sourceRef) return null;
  if (hasExternalEventReferences(document, sourceRef.event.id, { ignoreChordGroups: true })) return null;
  if (sourceRef.event.kind === 'note' && (sourceRef.event.tieStart || sourceRef.event.articulations?.length || sourceRef.event.lyrics?.length)) return null;

  const targetStaffIndex = current.staffIndex + (direction === 'down' ? 1 : -1);
  const targetStaff = sourceRef.part.staves.find((staff) => staff.staffIndex === targetStaffIndex);
  const targetMeasure = targetStaff?.measures.find((measure) => measure.measureNumber === current.measureNumber);
  const targetVoice = targetMeasure?.voices.find((voice) => voice.voiceId === current.voiceId);
  if (!targetStaff || !targetMeasure || !targetVoice) return null;

  if (sourceRef.event.kind === 'rest') {
    const targetRest = targetVoice.events.find((event) => (
      event.kind === 'rest'
      && !event.isChord
      && timestampsEqual(event.timestampNum, event.timestampDen, current.timestampNum, current.timestampDen)
      && event.durationDivisions >= sourceRef.event.durationDivisions
    ));
    if (!targetRest) return null;
    return {
      sourceEvent: sourceRef.event,
      placement: 'selectRest',
      target: {
        ...current,
        coreEntityId: targetRest.id,
        coreVoiceId: targetVoice.id,
        coreMeasureId: targetMeasure.id,
        staffIndex: targetStaff.staffIndex,
        isRest: true,
        durationType: targetRest.durationType ?? current.durationType,
        isDotted: targetRest.isDotted ?? current.isDotted,
        graphicalNote: null,
      },
    };
  }

  const targetRest = targetVoice.events.find((event) => (
    event.kind === 'rest'
    && !event.isChord
    && timestampsEqual(event.timestampNum, event.timestampDen, current.timestampNum, current.timestampDen)
    && event.durationDivisions >= sourceRef.event.durationDivisions
  ));
  const targetChordAnchor = targetVoice.events.find((event) => (
    event.kind === 'note'
    && !event.isChord
    && timestampsEqual(event.timestampNum, event.timestampDen, current.timestampNum, current.timestampDen)
    && event.durationDivisions === sourceRef.event.durationDivisions
    && !hasExternalEventReferences(document, event.id)
    && !event.tieStart
    && !event.articulations?.length
    && !event.lyrics?.length
  ));
  if (!targetRest && !targetChordAnchor) return null;

  return {
    sourceEvent: sourceRef.event,
    placement: targetChordAnchor ? 'addChordTone' : 'replaceRest',
    target: {
      ...current,
      coreEntityId: null,
      coreVoiceId: targetVoice.id,
      coreMeasureId: targetMeasure.id,
      staffIndex: targetStaff.staffIndex,
      graphicalNote: null,
    },
  };
}

function crossStaffInsertionKey(target: SelectedNote) {
  return [
    target.corePartId ?? '',
    target.measureNumber,
    target.staffIndex,
    target.voiceId,
    target.timestampNum,
    target.timestampDen,
  ].join(':');
}

function findScoreBoundary(document: ScoreDocumentModel | null | undefined, direction: 'start' | 'end'): SelectedNote | null {
  // MuseScore `first-element` and `last-element`: the top staff of the score. The order of all
  // entries of a score ranks parts by pitch name at equal positions, so its first entry could be a
  // rest of the third part (K14).
  const topPart = document?.score.parts[0];
  const topStaff = topPart?.staves[0];
  const ordered = getSemanticNoteOrder(document);
  const lane = topPart && topStaff
    ? ordered.filter((entry) => entry.staffIndex === topStaff.staffIndex && (!entry.corePartId || entry.corePartId === topPart.id))
    : [];
  const firstVoice = lane.length ? Math.min(...lane.map((entry) => entry.voiceId)) : null;
  const top = lane.filter((entry) => entry.voiceId === firstVoice);
  const candidates = top.length ? top : ordered;
  if (!candidates.length) return null;
  return direction === 'start' ? candidates[0] : candidates[candidates.length - 1];
}

function selectedTargets(selectedNote: SelectedNote | null, selectedNotes: SelectedNote[]) {
  const targets = selectedNotes.length > 0 ? selectedNotes : selectedNote ? [selectedNote] : [];
  return [...targets].sort(compareSelectedNotes);
}

function isSingleOnsetChordVisualSelection(selectedNote: SelectedNote | null, selectedNotes: SelectedNote[]) {
  if (!selectedNote || selectedNote.isRest || selectedNotes.length < 2) return false;
  return selectedNotes.every((note) => (
    !note.isRest
    && note.measureNumber === selectedNote.measureNumber
    && note.staffIndex === selectedNote.staffIndex
    && note.voiceId === selectedNote.voiceId
    && timestampsEqual(note.timestampNum, note.timestampDen, selectedNote.timestampNum, selectedNote.timestampDen)
  ));
}

function selectionRange(targets: SelectedNote[]) {
  if (targets.length < 2) return null;
  const sorted = [...targets].sort(compareSelectedNotes);
  const first = sorted[0];
  const last = sorted[sorted.length - 1];
  return {
    start: {
      corePartId: first.corePartId ?? null,
      measureNumber: first.measureNumber,
      staffIndex: first.staffIndex,
      voiceId: first.voiceId,
      timestampNum: first.timestampNum,
      timestampDen: first.timestampDen,
    },
    end: {
      corePartId: last.corePartId ?? null,
      measureNumber: last.measureNumber,
      staffIndex: last.staffIndex,
      voiceId: last.voiceId,
      timestampNum: last.timestampNum,
      timestampDen: last.timestampDen,
    },
  };
}

function toSelectionAnchor(selectedNote: SelectedNote | null, selectedNotes: SelectedNote[]): ScoreDocumentSelectionAnchor | null {
  const targets = selectedNotes.length > 0 ? selectedNotes : selectedNote ? [selectedNote] : [];
  if (!targets.length) return null;
  return {
    entityIds: targets
      .map((note) => note.coreEntityId)
      .filter((value): value is string => Boolean(value)),
    anchorEntityId: selectedNote?.coreEntityId ?? null,
    anchorLocator: selectedNote ? {
      coreMeasureId: selectedNote.coreMeasureId ?? null,
      corePartId: selectedNote.corePartId ?? null,
      measureNumber: selectedNote.measureNumber,
      staffIndex: selectedNote.staffIndex,
      voiceId: selectedNote.voiceId,
      timestampNum: selectedNote.timestampNum,
      timestampDen: selectedNote.timestampDen,
    } : null,
    selectionLocators: targets.map((note) => ({
      coreMeasureId: note.coreMeasureId ?? null,
      corePartId: note.corePartId ?? null,
      measureNumber: note.measureNumber,
      staffIndex: note.staffIndex,
      voiceId: note.voiceId,
      timestampNum: note.timestampNum,
      timestampDen: note.timestampDen,
    })),
  };
}

function remapSelectionAnchor(
  anchor: ScoreDocumentSelectionAnchor | null,
  selectionRemap: Record<string, string> | null | undefined,
): ScoreDocumentSelectionAnchor | null {
  if (!anchor || !selectionRemap || Object.keys(selectionRemap).length === 0) return anchor;

  return {
    ...anchor,
    entityIds: [...new Set(anchor.entityIds.map((entityId) => selectionRemap[entityId] ?? entityId))],
    anchorEntityId: anchor.anchorEntityId ? selectionRemap[anchor.anchorEntityId] ?? anchor.anchorEntityId : null,
  };
}

function alterToAccidental(alter: number): AccidentalChoice {
  if (alter >= 2) return 'double-sharp';
  if (alter === 1) return 'sharp';
  if (alter === -1) return 'flat';
  if (alter <= -2) return 'double-flat';
  return null;
}

function halveDuration(duration: NoteDuration) {
  const index = DURATION_ORDER.indexOf(duration);
  return DURATION_ORDER[Math.max(0, index - 1)] ?? duration;
}

function doubleDuration(duration: NoteDuration) {
  const index = DURATION_ORDER.indexOf(duration);
  return DURATION_ORDER[Math.min(DURATION_ORDER.length - 1, index + 1)] ?? duration;
}

function decreaseDottedDuration(duration: NoteDuration, dotted: boolean) {
  if (dotted) return { duration, dotted: false };
  return { duration: halveDuration(duration), dotted: true };
}

function increaseDottedDuration(duration: NoteDuration, dotted: boolean) {
  if (dotted) return { duration: doubleDuration(duration), dotted: false };
  return { duration, dotted: true };
}

function normalizeTupletPreset(preset: TupletPreset): { actualNotes: TupletNumber; normalNotes: number; label: string } {
  const actualNotes = preset === 'triplet'
    ? 3
    : preset === 'quintuplet'
      ? 5
      : preset;
  return {
    actualNotes,
    normalNotes: TUPLET_NORMAL_NOTES[actualNotes],
    label: typeof preset === 'string' ? preset : `${actualNotes}:${TUPLET_NORMAL_NOTES[actualNotes]}`,
  };
}

function resolveDurationState(
  note: Pick<SelectedNote, 'durationType' | 'isDotted'> | null,
  fallbackDuration: NoteDuration,
  fallbackDotted: boolean,
) {
  const mappedDuration = note?.durationType ? NOTE_DURATION_FROM_TYPE[note.durationType] : null;
  if (!mappedDuration) return { duration: fallbackDuration, dotted: fallbackDotted };
  return {
    duration: mappedDuration,
    dotted: Boolean(note?.isDotted),
  };
}

function transposeSelectedPitch(note: SelectedNote, semitones: number) {
  const STEP_TO_SEMITONE: Record<string, number> = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 };
  const SEMITONE_TO_STEP_ALTER: Array<{ step: string; alter: number }> = [
    { step: 'C', alter: 0 }, { step: 'C', alter: 1 }, { step: 'D', alter: 0 }, { step: 'D', alter: 1 },
    { step: 'E', alter: 0 }, { step: 'F', alter: 0 }, { step: 'F', alter: 1 }, { step: 'G', alter: 0 },
    { step: 'G', alter: 1 }, { step: 'A', alter: 0 }, { step: 'A', alter: 1 }, { step: 'B', alter: 0 },
  ];

  const midi = (STEP_TO_SEMITONE[note.step] ?? 0) + note.alter + note.octave * 12;
  const nextMidi = midi + semitones;
  const nextOctave = Math.floor(nextMidi / 12);
  const chroma = ((nextMidi % 12) + 12) % 12;
  const mapped = SEMITONE_TO_STEP_ALTER[chroma];

  return {
    step: mapped.step,
    alter: mapped.alter,
    octave: nextOctave,
  };
}

function resolveSelectionAnchor(document: ScoreDocumentModel | null | undefined, anchor: ScoreDocumentSelectionAnchor | null | undefined) {
  if (!anchor) return [];
  const restored = resolveSelectionAnchorEntries(document, anchor).map((entry) => toSelectedNote(entry));
  if (restored.length > 0) return restored;
  dbg.editor(`restoreSelection failed entityIds=${anchor.entityIds.length} locators=${anchor.selectionLocators?.length ?? 0} anchor=${anchor.anchorEntityId ?? 'null'}`);
  return restored;
}

export function useNoteEditor(
  xml: string,
  coreDocument: ScoreDocumentModel | null,
  onApplyCommandsCallback: (commands: ScoreCommand[], meta?: NoteEditorUpdateMeta) => void | { applied: boolean },
  options?: UseNoteEditorOptions,
) {
  const initialSelectedDuration = options?.hydratedSession?.selectedDuration ?? '4';
  const initialSelectedVoice = Math.max(1, Math.min(4, options?.hydratedSession?.selectedVoice ?? 1)) as 1 | 2 | 3 | 4;
  const [selectedNote, setSelectedNote] = useState<SelectedNote | null>(null);
  const [selectedNotes, setSelectedNotes] = useState<SelectedNote[]>([]);
  const [selectedVisual, setSelectedVisual] = useState<VisualSelection | null>(null);
  const [noteInputMode, setNoteInputMode] = useState(false);
  const [clipboard, setClipboard] = useState<ScoreClipboardPayload | null>(null);
  const [selectedDuration, setSelectedDuration] = useState<NoteDuration>(initialSelectedDuration);
  const [selectedAccidental, setSelectedAccidental] = useState<AccidentalChoice>(null);
  const [isDotted, setIsDotted] = useState(false);
  const [selectedVoice, setSelectedVoice] = useState<1 | 2 | 3 | 4>(initialSelectedVoice);
  const [entryMode, setEntryMode] = useState<NoteEntryMode>('insert');
  const [chordInputMode, setChordInputMode] = useState(false);
  const [stepInputKeyboardMode, setStepInputKeyboardMode] = useState(false);
  const [inputByDurationMode, setInputByDurationMode] = useState(false);
  const [preparedDurationPitches, setPreparedDurationPitches] = useState<PreparedDurationPitch[]>([]);
  const [preparedDurationRest, setPreparedDurationRest] = useState(false);
  const [leadsheetMode, setLeadsheetMode] = useState(false);
  const [guitarInputMode, setGuitarInputMode] = useState(false);
  const [selectedGuitarString, setSelectedGuitarString] = useState<GuitarStringNumber>(1);
  const [selectedGuitarFret, setSelectedGuitarFret] = useState(0);
  const [selectedGuitarTuning, setSelectedGuitarTuning] = useState<GuitarTuningId>('standard');
  const [guitarFretBuffer, setGuitarFretBuffer] = useState('');
  const [editorError, setEditorError] = useState<string | null>(null);
  const lastSelectedRef = useRef<SelectedNote | null>(null);
  const selectedNotesRef = useRef<SelectedNote[]>([]);
  const selectedNoteRef = useRef<SelectedNote | null>(null);
  const selectedVisualRef = useRef<VisualSelection | null>(null);
  const lastNoteInputRef = useRef<SelectedNote | null>(null);
  const noteInputModeRef = useRef(false);
  /**
   * The slur that note input keeps open (MuseScore InputState::slur): every note entered after `S`
   * extends it to the new note, until `S` again or the end of note input.
   */
  const inputSlurRef = useRef<{ start: SelectedNote; end: SelectedNote | null } | null>(null);
  /** The input cursor slot a Shift+Arrow range was started from; the range does not move it. */
  const rangeCursorRef = useRef<SelectedNote | null>(null);
  /** The last entered note when the input position is past the end of the score (MuseScore beyondScore). */
  const beyondScoreRef = useRef<SelectedNote | null>(null);
  const onNoteInputActivatedRef = useRef(options?.onNoteInputActivated);
  onNoteInputActivatedRef.current = options?.onNoteInputActivated;
  const selectedDurationRef = useRef<NoteDuration>(initialSelectedDuration);
  const selectedAccidentalRef = useRef<AccidentalChoice>(null);
  const isDottedRef = useRef(false);
  const selectedVoiceRef = useRef<1 | 2 | 3 | 4>(initialSelectedVoice);
  const entryModeRef = useRef<NoteEntryMode>('insert');
  const chordInputModeRef = useRef(false);
  const stepInputKeyboardModeRef = useRef(false);
  const inputByDurationModeRef = useRef(false);
  const preparedDurationPitchesRef = useRef<PreparedDurationPitch[]>([]);
  const preparedDurationRestRef = useRef(false);
  const leadsheetModeRef = useRef(false);
  const guitarInputModeRef = useRef(false);
  const selectedGuitarStringRef = useRef<GuitarStringNumber>(1);
  const selectedGuitarFretRef = useRef(0);
  const selectedGuitarTuningRef = useRef<GuitarTuningId>('standard');
  const guitarFretBufferRef = useRef('');
  const guitarFretCommitTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const osmdRef = useRef<any>(null);

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const setOsmd = useCallback((osmd: any) => { osmdRef.current = osmd; }, []);

  const preparedCommandsRef = useRef<PreparedDocumentCommands | undefined>(undefined);
  const pointerEntryRef = useRef(false);
  const applyEditorCommands = useCallback((commands: ScoreCommand[]) => {
    const prepared = prepareDocumentCommands({ xml, coreDocument }, commands);
    preparedCommandsRef.current = prepared;
    const rejection = prepared.result.diagnostics.find(d => d.code.endsWith('_rejected'));
    if (rejection) {
      // A rejected command rejects its whole batch: callers see an unchanged document and commit
      // nothing, so no half of an edit reaches the score.
      setEditorError(rejection.message);
      preparedCommandsRef.current = undefined;
      return { ...prepared.result, xml, coreDocument: coreDocument ?? prepared.result.coreDocument };
    }
    return prepared.result;
  }, [coreDocument, xml]);
  const onApplyCommands = useCallback((commands: ScoreCommand[], meta?: NoteEditorUpdateMeta) => {
    const prepared = preparedCommandsRef.current;
    preparedCommandsRef.current = undefined;
    // Undo of a note-input edit returns the cursor to the input position the edit started from,
    // as MuseScore restores its input state with the undo step (F1 in note-entry-mastery-ledger).
    const inputCursor = noteInputModeRef.current ? selectedNoteRef.current : null;
    const undoSelectionAnchor = meta?.undoSelectionAnchor !== undefined || !inputCursor
      ? meta?.undoSelectionAnchor
      : toSelectionAnchor(inputCursor, [inputCursor]);
    const result = onApplyCommandsCallback(commands, {
      ...meta,
      prepared,
      ...(undoSelectionAnchor !== undefined ? { undoSelectionAnchor } : {}),
    });
    if (result && !result.applied) {
      setEditorError('The score validation did not accept this input.');
      return false;
    }
    return true;
  }, [onApplyCommandsCallback]);

  const warnNoOpEdit = useCallback((context: string, command: ScoreCommand, details?: Record<string, unknown>) => {
    // eslint-disable-next-line no-console
    console.warn('[nex-note:note-editor] edit produced no xml change', {
      context,
      command,
      ...details,
    });
  }, []);

  const warnRejectedEdit = useCallback((context: string, details: Record<string, unknown>) => {
    setEditorError(formatRejectedEditMessage(context, details));
    // eslint-disable-next-line no-console
    console.warn('[nex-note:note-editor] edit rejected', {
      context,
      ...details,
    });
  }, []);

  const paintNote = useCallback((_note: SelectedNote | null, _color: string) => {
    // Visual selection now comes from ScoreEditor's overlay layer. Avoid
    // GraphicalNote.setColor here because OSMD can color whole chords/groups
    // when multiple notes share the same rendered SVG container.
  }, []);

  const setSelectedNoteLive = useCallback((note: SelectedNote | null) => {
    selectedNoteRef.current = note;
    setSelectedNote(note);
  }, []);

  const setSelectedVisualLive = useCallback((visual: VisualSelection | null) => {
    selectedVisualRef.current = visual;
    setSelectedVisual(visual);
  }, []);

  const setNoteInputModeLive = useCallback((value: boolean) => {
    const entering = value && !noteInputModeRef.current;
    noteInputModeRef.current = value;
    setNoteInputMode(value);
    if (!value) {
      inputSlurRef.current = null;
      rangeCursorRef.current = null;
    }
    if (entering) onNoteInputActivatedRef.current?.();
  }, []);

  const setInputByDurationModeLive = useCallback((value: boolean) => {
    inputByDurationModeRef.current = value;
    setInputByDurationMode(value);
  }, []);

  const setPreparedDurationPitchesLive = useCallback((value: PreparedDurationPitch[]) => {
    preparedDurationPitchesRef.current = value;
    setPreparedDurationPitches(value);
  }, []);

  const setPreparedDurationRestLive = useCallback((value: boolean) => {
    preparedDurationRestRef.current = value;
    setPreparedDurationRest(value);
  }, []);

  const setSelectedDurationLive = useCallback((value: NoteDuration) => {
    selectedDurationRef.current = value;
    setSelectedDuration(value);
  }, []);

  const setSelectedAccidentalLive = useCallback((value: AccidentalChoice) => {
    selectedAccidentalRef.current = value;
    setSelectedAccidental(value);
  }, []);

  const setIsDottedLive = useCallback((value: boolean) => {
    isDottedRef.current = value;
    setIsDotted(value);
  }, []);

  const setSelectedVoiceLive = useCallback((value: 1 | 2 | 3 | 4) => {
    selectedVoiceRef.current = value;
    setSelectedVoice(value);
  }, []);

  const setEntryModeLive = useCallback((value: NoteEntryMode) => {
    entryModeRef.current = value;
    setEntryMode(value);
  }, []);

  const setChordInputModeLive = useCallback((value: boolean) => {
    chordInputModeRef.current = value;
    setChordInputMode(value);
  }, []);

  const setStepInputKeyboardModeLive = useCallback((value: boolean) => {
    stepInputKeyboardModeRef.current = value;
    setStepInputKeyboardMode(value);
  }, []);

  const setLeadsheetModeLive = useCallback((value: boolean) => {
    leadsheetModeRef.current = value;
    setLeadsheetMode(value);
  }, []);

  const setGuitarInputModeLive = useCallback((value: boolean) => {
    guitarInputModeRef.current = value;
    setGuitarInputMode(value);
    if (value) setNoteInputModeLive(true);
  }, [setNoteInputModeLive]);

  const setSelectedGuitarStringLive = useCallback((value: GuitarStringNumber) => {
    selectedGuitarStringRef.current = value;
    setSelectedGuitarString(value);
  }, []);

  const setSelectedGuitarFretLive = useCallback((value: number) => {
    const next = Math.max(0, Math.min(24, Math.trunc(Number.isFinite(value) ? value : 0)));
    selectedGuitarFretRef.current = next;
    setSelectedGuitarFret(next);
  }, []);

  const setSelectedGuitarTuningLive = useCallback((value: GuitarTuningId) => {
    selectedGuitarTuningRef.current = value;
    setSelectedGuitarTuning(value);
  }, []);

  const setGuitarFretBufferLive = useCallback((value: string) => {
    guitarFretBufferRef.current = value;
    setGuitarFretBuffer(value);
  }, []);

  useEffect(() => { selectedNoteRef.current = selectedNote; }, [selectedNote]);
  useEffect(() => { noteInputModeRef.current = noteInputMode; }, [noteInputMode]);
  useEffect(() => { selectedDurationRef.current = selectedDuration; }, [selectedDuration]);
  useEffect(() => { selectedAccidentalRef.current = selectedAccidental; }, [selectedAccidental]);
  useEffect(() => { isDottedRef.current = isDotted; }, [isDotted]);
  useEffect(() => { selectedVoiceRef.current = selectedVoice; }, [selectedVoice]);
  const coreDocumentForVoicesRef = useRef(coreDocument);
  coreDocumentForVoicesRef.current = coreDocument;
  /** The stored voice number of the active input voice on the staff of `anchor`. */
  const storedInputVoiceAt = useCallback((anchor: { corePartId?: string | null; staffIndex: number } | null | undefined) => (
    anchor
      ? storedVoiceFor(coreDocumentForVoicesRef.current, { corePartId: anchor.corePartId, staffIndex: anchor.staffIndex }, selectedVoiceRef.current)
      : selectedVoiceRef.current
  ), []);
  useEffect(() => { entryModeRef.current = entryMode; }, [entryMode]);
  useEffect(() => { chordInputModeRef.current = chordInputMode; }, [chordInputMode]);
  useEffect(() => { stepInputKeyboardModeRef.current = stepInputKeyboardMode; }, [stepInputKeyboardMode]);
  useEffect(() => { leadsheetModeRef.current = leadsheetMode; }, [leadsheetMode]);
  useEffect(() => { guitarInputModeRef.current = guitarInputMode; }, [guitarInputMode]);
  useEffect(() => { selectedGuitarStringRef.current = selectedGuitarString; }, [selectedGuitarString]);
  useEffect(() => { selectedGuitarFretRef.current = selectedGuitarFret; }, [selectedGuitarFret]);
  useEffect(() => { selectedGuitarTuningRef.current = selectedGuitarTuning; }, [selectedGuitarTuning]);

  useEffect(() => () => {
    if (guitarFretCommitTimerRef.current) clearTimeout(guitarFretCommitTimerRef.current);
  }, []);

  const clearSelection = useCallback(() => {
    selectedNotesRef.current.forEach((note) => paintNote(note, '#000000'));
    selectedNotesRef.current = [];
    setSelectedNotes([]);
    setSelectedNoteLive(null);
    setSelectedVisualLive(null);
    lastSelectedRef.current = null;
  }, [paintNote, setSelectedNoteLive, setSelectedVisualLive]);

  const selectSingleNote = useCallback((note: SelectedNote | null, visual?: VisualSelection | null) => {
    if (!note) return false;
    if (beyondScoreRef.current && !sameRhythmicPosition(note, beyondScoreRef.current)) beyondScoreRef.current = null;
    rangeCursorRef.current = null;
    selectedNotesRef.current = [note];
    setSelectedNotes([note]);
    setSelectedNoteLive(note);
    setSelectedVisualLive(visual ?? { visualOnly: false, text: null, measureNumber: note.measureNumber, staffIndex: note.staffIndex });
    lastSelectedRef.current = note;
    return true;
  }, [setSelectedNoteLive, setSelectedVisualLive]);

  const selectMultipleNotes = useCallback((notes: SelectedNote[]) => {
    if (notes.length === 0) return false;
    const ordered = [...notes].sort(compareSelectedNotes);
    const anchorNote = ordered[ordered.length - 1] ?? null;
    if (!anchorNote) return false;
    selectedNotesRef.current = ordered;
    setSelectedNotes(ordered);
    setSelectedNoteLive(anchorNote);
    setSelectedVisualLive({
      visualOnly: false,
      text: null,
      measureNumber: anchorNote.measureNumber,
      staffIndex: anchorNote.staffIndex,
    });
    lastSelectedRef.current = anchorNote;
    return true;
  }, [setSelectedNoteLive, setSelectedVisualLive]);

  const ensureNoteInputAnchor = useCallback(() => {
    if (selectedNote) return selectedNote;
    const firstSemanticNote = getSemanticNoteOrder(coreDocument)[0] ?? null;
    if (!firstSemanticNote) return null;
    selectSingleNote(firstSemanticNote, { visualOnly: false, text: null, measureNumber: firstSemanticNote.measureNumber, staffIndex: firstSemanticNote.staffIndex });
    return firstSemanticNote;
  }, [coreDocument, selectedNote, selectSingleNote]);

  const restoreSelection = useCallback((
    anchor: ScoreDocumentSelectionAnchor | null | undefined,
    reason?: 'load' | 'replace' | 'apply' | 'undo' | 'redo' | 'reset' | null,
  ) => {
    const fromHistoryStep = reason === 'undo' || reason === 'redo';
    const inNoteInput = noteInputModeRef.current && fromHistoryStep;
    let restored = resolveSelectionAnchor(coreDocument, anchor);
    if (!restored.length && inNoteInput && selectedNoteRef.current) {
      // An old transaction without an input anchor: keep the cursor where it is if it still exists.
      const cursor = selectedNoteRef.current;
      restored = getSemanticNoteOrder(coreDocument).filter((entry) => sameRhythmicPosition(entry, cursor)).slice(0, 1);
    }
    if (!restored.length && noteInputModeRef.current) {
      // The cursor is not an event of the document: the step removed its lane (Undo of the first
      // entry of a voice in that bar), or it stands inside a longer rest of another voice and an
      // edit elsewhere asks to restore it. It keeps its rhythmic position on the staff: the event of
      // another voice at or before it.
      const locator = anchor?.anchorLocator ?? selectedNoteRef.current;
      if (locator) {
        const onset = locator.timestampNum / Math.max(locator.timestampDen, 1);
        const sameStaff = getSemanticNoteOrder(coreDocument).filter((entry) => (
          entry.measureNumber === locator.measureNumber
          && entry.staffIndex === locator.staffIndex
          && (!('corePartId' in locator) || !locator.corePartId || entry.corePartId === locator.corePartId)
          && entry.timestampNum / Math.max(entry.timestampDen, 1) <= onset + 1e-9
        ));
        const latest = sameStaff.reduce<number>((max, entry) => Math.max(max, entry.timestampNum / Math.max(entry.timestampDen, 1)), -1);
        restored = sameStaff
          .filter((entry) => Math.abs(entry.timestampNum / Math.max(entry.timestampDen, 1) - latest) < 1e-9)
          .sort((left, right) => left.voiceId - right.voiceId)
          .slice(0, 1)
          // Inside a longer rest of that voice the cursor keeps its own onset, as it had before.
          .map((entry) => (entry.isRest && latest < onset - 1e-9
            ? { ...entry, timestampNum: locator.timestampNum, timestampDen: locator.timestampDen }
            : entry));
      }
    }
    if (inNoteInput) {
      // The state after Undo or Redo is the state of an earlier entry: what was entered after it,
      // an open slur and the past-the-end flag no longer describe the document.
      beyondScoreRef.current = null;
      inputSlurRef.current = null;
      rangeCursorRef.current = null;
    }
    if (!restored.length) {
      if (inNoteInput) lastNoteInputRef.current = null;
      clearSelection();
      return false;
    }
    const anchorNote = restored.find((note) => note.coreEntityId === anchor?.anchorEntityId) ?? restored[restored.length - 1] ?? null;
    selectedNotesRef.current = restored;
    setSelectedNotes(restored);
    setSelectedNoteLive(anchorNote);
    setSelectedVisualLive(anchorNote ? { visualOnly: false, text: null, measureNumber: anchorNote.measureNumber, staffIndex: anchorNote.staffIndex } : null);
    lastSelectedRef.current = anchorNote;
    if (inNoteInput && anchorNote) {
      // The note entered last in that state is the event before the cursor in its voice; it sets the
      // register of the next letter and is the target of the selection keys, as after a normal entry.
      lastNoteInputRef.current = getSelectionLaneOrder(coreDocument, anchorNote)
        .filter((entry) => matchesSelectionLane(entry, anchorNote) && compareSelectedNotes(entry, anchorNote) < 0)
        .at(-1) ?? null;
    }
    return true;
  }, [clearSelection, coreDocument, setSelectedNoteLive, setSelectedVisualLive]);

  // The selection holds copies of events. When the document changes under them (Delete or a rest
  // turns a note into a rest, a respell, Undo), refresh the copies by entity id, so a later command
  // never addresses a note that is now a rest (F10 in note-entry-mastery-ledger).
  useEffect(() => {
    if (!coreDocument) return;
    const entries = new Map(buildSemanticSelectionEntries(coreDocument).map((entry) => [entry.coreEntityId, entry]));
    const refresh = (note: SelectedNote | null): SelectedNote | null => {
      if (!note?.coreEntityId) return note;
      const entry = entries.get(note.coreEntityId);
      if (!entry) return note;
      const fresh = toSelectedNote(entry);
      const same = fresh.isRest === note.isRest
        && fresh.step === note.step && fresh.octave === note.octave && fresh.alter === note.alter
        && fresh.durationType === note.durationType && Boolean(fresh.isDotted) === Boolean(note.isDotted)
        && fresh.measureNumber === note.measureNumber
        && timestampsEqual(fresh.timestampNum, fresh.timestampDen, note.timestampNum, note.timestampDen);
      return same ? note : { ...note, ...fresh, graphicalNote: note.graphicalNote ?? null };
    };
    const current = selectedNoteRef.current;
    const refreshed = refresh(current);
    if (refreshed !== current) setSelectedNoteLive(refreshed);
    const list = selectedNotesRef.current;
    const refreshedList = list.map((note) => refresh(note) ?? note);
    if (refreshedList.some((note, index) => note !== list[index])) {
      selectedNotesRef.current = refreshedList;
      setSelectedNotes(refreshedList);
    }
    const last = lastNoteInputRef.current;
    const refreshedLast = refresh(last);
    if (refreshedLast !== last) lastNoteInputRef.current = refreshedLast;
    if (lastSelectedRef.current) lastSelectedRef.current = refresh(lastSelectedRef.current);
  }, [coreDocument, setSelectedNoteLive]);

  useEffect(() => {
    if (!selectedNote) return;
    if (!noteInputMode) {
      const duration = selectedNote.durationType ? NOTE_DURATION_FROM_TYPE[selectedNote.durationType] : null;
      if (duration) setSelectedDurationLive(duration);
      setSelectedAccidentalLive(selectedNote.writtenAccidental ?? alterToAccidental(selectedNote.alter));
      // Arm the dot from notes only. Rests often carry an invisible dot
      // (a 3/4 whole-measure rest is stored as a dotted half), and silently
      // latching it makes the next entry dotted when no dot was ever shown.
      setIsDottedLive(Boolean(!selectedNote.isRest && selectedNote.isDotted));
      setSelectedVoiceLive(inputVoiceOf(selectedNote.voiceId));
      if (selectedNote.guitar) {
        setSelectedGuitarStringLive(selectedNote.guitar.string);
        setSelectedGuitarFretLive(selectedNote.guitar.fret);
        if (selectedNote.guitar.tuning) setSelectedGuitarTuningLive(resolveGuitarTuning(selectedNote.guitar.tuning).id);
      }
    }
  }, [noteInputMode, selectedNote, setIsDottedLive, setSelectedAccidentalLive, setSelectedDurationLive, setSelectedGuitarFretLive, setSelectedGuitarStringLive, setSelectedGuitarTuningLive, setSelectedVoiceLive]);

  const handleNoteClick = useCallback((incoming: SelectedNote | null, clickOptions?: NoteClickOptions) => {
    beyondScoreRef.current = null;
    const rawNote = coerceSelectedNote(incoming);
    const semanticEntries = buildSemanticSelectionEntries(coreDocument);
    const semanticEntryMatchesClickedNote = (candidate: SelectedNote, entry: ReturnType<typeof buildSemanticSelectionEntries>[number]) => {
      const partIdMatches = (left: string | null | undefined, right: string | null | undefined) => {
        if (!left || !right) return true;
        if (left === right) return true;
        const trimPartPrefix = (value: string) => value.startsWith('part:') ? value.slice('part:'.length) : value;
        return trimPartPrefix(left) === trimPartPrefix(right);
      };
      const measureIdMatches = (left: string | null | undefined, right: string | null | undefined) => {
        if (!left || !right) return true;
        if (left === right) return true;
        return left === `measure:${entry.measureNumber}` || right === `measure:${candidate.measureNumber}`;
      };
      const sameCorePart = partIdMatches(candidate.corePartId, entry.corePartId);
      const sameCoreMeasure = measureIdMatches(candidate.coreMeasureId, entry.coreMeasureId);
      const sameCoreEvent = Boolean(candidate.coreEntityId && entry.coreEntityId === candidate.coreEntityId && sameCorePart && sameCoreMeasure);
      if (candidate.coreEntityId && entry.coreEntityId === candidate.coreEntityId) return sameCoreEvent;
      return sameCoreEvent || (sameCorePart && sameCoreMeasure && selectedNotesEqual(toSelectedNote(entry), candidate));
    };
    const normalizeClickedNote = (candidate: SelectedNote) => {
      const semanticMatch = semanticEntries.find((entry) => semanticEntryMatchesClickedNote(candidate, entry));
      if (!semanticMatch) return candidate;
      return {
        ...toSelectedNote(semanticMatch, candidate.graphicalNote),
        durationType: candidate.durationType ?? semanticMatch.durationType,
        isDotted: candidate.isDotted ?? semanticMatch.isDotted,
        graphicalNote: candidate.graphicalNote,
      };
    };
    const note = rawNote ? (() => {
      const semanticMatch = semanticEntries.find((entry) => semanticEntryMatchesClickedNote(rawNote, entry));
      if (!semanticMatch) return rawNote;
      return {
        ...toSelectedNote(semanticMatch, rawNote.graphicalNote),
        durationType: rawNote.durationType ?? semanticMatch.durationType,
        isDotted: rawNote.isDotted ?? semanticMatch.isDotted,
        graphicalNote: rawNote.graphicalNote,
      };
    })() : null;
    if (!note) {
      if (clickOptions?.visualOnly) {
        selectedNotesRef.current = [];
        setSelectedNotes([]);
        setSelectedNoteLive(null);
        setSelectedVisualLive({
          visualOnly: true,
          text: clickOptions.visualText ?? null,
          measureNumber: clickOptions.visualMeasureNumber ?? null,
          staffIndex: clickOptions.visualStaffIndex ?? null,
          partId: clickOptions.visualPartId ?? null,
        });
        lastSelectedRef.current = null;
        return;
      }
      dbg.editor('deselect');
      clearSelection();
      return;
    }

    dbg.editor(`selected: m.${note.measureNumber} staff=${note.staffIndex} voice=${note.voiceId} ts=${note.timestampNum}/${note.timestampDen} ${note.isRest ? 'rest' : `${note.step}${note.alter===1?'#':note.alter===-1?'b':''}${note.octave}`}`);
    if (noteInputModeRef.current) {
      lastNoteInputRef.current = note;
      options?.onActiveNotePreview?.(note);
      if (!clickOptions?.additive && !clickOptions?.range && !clickOptions?.keepInputVoice) {
        // A MuseScore/Finale left hand is stored as voice 5-8; it is input voice 1-4.
        setSelectedVoiceLive(inputVoiceOf(note.voiceId));
      }
    }
    const current = selectedNotesRef.current;
    if (clickOptions?.range && lastSelectedRef.current) {
      const rangeNotes = resolveRangeSelection(coreDocument, lastSelectedRef.current, note);
      selectedNotesRef.current = rangeNotes;
      setSelectedNotes(rangeNotes);
      setSelectedNoteLive(note);
      setSelectedVisualLive({
        visualOnly: Boolean(clickOptions?.visualOnly),
        text: clickOptions?.visualText ?? null,
        measureNumber: clickOptions?.visualMeasureNumber ?? note.measureNumber,
        staffIndex: clickOptions?.visualStaffIndex ?? note.staffIndex,
        partId: clickOptions?.visualPartId ?? note.corePartId ?? null,
      });
      return;
    }

    if (!clickOptions?.additive && clickOptions?.selectionNotes && clickOptions.selectionNotes.length > 1) {
      current.forEach((entry) => paintNote(entry, '#000000'));
      const ordered = clickOptions.selectionNotes.map(normalizeClickedNote).sort(compareSelectedNotes);
      selectedNotesRef.current = ordered;
      setSelectedNotes(ordered);
      setSelectedNoteLive(note);
      setSelectedVisualLive({
        visualOnly: Boolean(clickOptions?.visualOnly),
        text: clickOptions?.visualText ?? null,
        measureNumber: clickOptions?.visualMeasureNumber ?? note.measureNumber,
        staffIndex: clickOptions?.visualStaffIndex ?? note.staffIndex,
        partId: clickOptions?.visualPartId ?? note.corePartId ?? null,
      });
      lastSelectedRef.current = note;
      return;
    }

    if (!clickOptions?.additive) {
      current.forEach((entry) => paintNote(entry, '#000000'));
      paintNote(note, '#2563EB');
      selectedNotesRef.current = [note];
      setSelectedNotes([note]);
      setSelectedNoteLive(note);
      setSelectedVisualLive({
        visualOnly: Boolean(clickOptions?.visualOnly),
        text: clickOptions?.visualText ?? null,
        measureNumber: clickOptions?.visualMeasureNumber ?? note.measureNumber,
        staffIndex: clickOptions?.visualStaffIndex ?? note.staffIndex,
        partId: clickOptions?.visualPartId ?? note.corePartId ?? null,
      });
      lastSelectedRef.current = note;
      return;
    }

    const existingIndex = current.findIndex((entry) => selectedNotesEqual(entry, note));

    if (existingIndex >= 0) {
      paintNote(current[existingIndex], '#000000');
      const remaining = current.filter((_, index) => index !== existingIndex);
      const anchor = remaining[remaining.length - 1] ?? null;
      if (anchor) paintNote(anchor, '#2563EB');
      selectedNotesRef.current = remaining;
      setSelectedNotes(remaining);
      setSelectedNoteLive(anchor);
      setSelectedVisualLive(anchor ? { visualOnly: false, text: null, measureNumber: anchor.measureNumber, staffIndex: anchor.staffIndex } : null);
      lastSelectedRef.current = anchor;
      return;
    }

    current.forEach((entry) => paintNote(entry, '#0F766E'));
    paintNote(note, '#2563EB');
    const next = [...current, note];
    selectedNotesRef.current = next;
    setSelectedNotes(next);
    setSelectedNoteLive(note);
    setSelectedVisualLive({
      visualOnly: Boolean(clickOptions?.visualOnly),
      text: clickOptions?.visualText ?? null,
      measureNumber: clickOptions?.visualMeasureNumber ?? note.measureNumber,
      staffIndex: clickOptions?.visualStaffIndex ?? note.staffIndex,
      partId: clickOptions?.visualPartId ?? note.corePartId ?? null,
    });
    lastSelectedRef.current = note;
  }, [clearSelection, coreDocument, options, paintNote, setSelectedNoteLive, setSelectedVisualLive, setSelectedVoiceLive]);

  const findSelectedVisualDeleteCommand = useCallback((): VisualDeleteCommand | null => {
    if (!selectedVisual?.visualOnly || !selectedVisual.text) return null;
    const selectedText = selectedVisual.text.trim();
    if (!selectedText) return null;

    if (coreDocument?.metadata.title?.trim() === selectedText) return { type: 'setTitle', title: '' };
    if (coreDocument?.metadata.subtitle?.trim() === selectedText) return { type: 'setSubtitle', subtitle: '' };
    if (coreDocument?.metadata.composer?.trim() === selectedText) return { type: 'setComposer', composer: '' };
    if (coreDocument?.metadata.arranger?.trim() === selectedText) return { type: 'setArranger', arranger: '' };

    const matchingDirection = findDirectionByText(coreDocument, selectedText, {
      measureNumber: selectedVisual.measureNumber,
      staffIndex: selectedVisual.staffIndex,
      corePartId: selectedVisual.partId ?? selectedNote?.corePartId ?? null,
    });
    if (matchingDirection) {
      return {
        type: 'removeDirection',
        corePartId: selectedVisual.partId ?? selectedNote?.corePartId ?? matchingDirection.part.id,
        measureNumber: matchingDirection.measure.measureNumber,
        staffIndex: matchingDirection.direction.staffIndex ?? selectedVisual.staffIndex ?? matchingDirection.staff.staffIndex,
        kind: matchingDirection.direction.kind,
        text: selectedText,
      };
    }

    if (!selectedNote) return null;

    const eventRef = findEventReference(coreDocument, {
      coreMeasureId: selectedNote.coreMeasureId ?? null,
      corePartId: selectedNote.corePartId ?? null,
      measureNumber: selectedNote.measureNumber,
      staffIndex: selectedNote.staffIndex,
      voiceId: selectedNote.voiceId,
      timestampNum: selectedNote.timestampNum,
      timestampDen: selectedNote.timestampDen,
    });
    const matchingLyric = eventRef?.event.lyrics?.find((lyric) => lyric.text.trim() === selectedText);
    if (matchingLyric) {
      return {
        type: 'removeLyricLine',
        coreMeasureId: selectedNote.coreMeasureId ?? null,
        corePartId: selectedNote.corePartId ?? null,
        measureNumber: selectedNote.measureNumber,
        staffIndex: selectedNote.staffIndex,
        voiceId: selectedNote.voiceId,
        timestampNum: selectedNote.timestampNum,
        timestampDen: selectedNote.timestampDen,
        verseNumber: matchingLyric.verseNumber ?? 1,
      };
    }
    return null;
  }, [coreDocument, selectedNote, selectedVisual]);

  const deleteSelectedNote = useCallback((behaviour?: unknown) => {
    // Buttons pass their click event here; only the cut asks for the collapsed selection.
    const collapseToFirst = Boolean(behaviour && typeof behaviour === 'object' && (behaviour as { collapseToFirst?: unknown }).collapseToFirst === true);
    const visualDeleteCommand = findSelectedVisualDeleteCommand();
    if (visualDeleteCommand) {
      dbg.editor(`deleteVisual type=${visualDeleteCommand.type}`);
      const commands = [visualDeleteCommand];
      const next = applyEditorCommands(commands);
      if (next.xml === xml) {
        warnNoOpEdit('deleteVisual', visualDeleteCommand);
        return;
      }
      onApplyCommands(commands, { selectionAnchor: toSelectionAnchor(selectedNote, selectedNotes) });
      clearSelection();
      return;
    }
    const currentSelectedNote = selectedNoteRef.current ?? lastSelectedRef.current ?? selectedNote;
    const currentSelectedNotes = selectedNotesRef.current.length > 0 ? selectedNotesRef.current : selectedNotes;
    const targets: SelectedNote[] = (isSingleOnsetChordVisualSelection(currentSelectedNote, currentSelectedNotes)
      ? [currentSelectedNote]
      : selectedTargets(currentSelectedNote, currentSelectedNotes))
      .filter((note): note is SelectedNote => Boolean(note));
    if (!targets.length) return;
    dbg.editor(`deleteSelection count=${targets.length}`);
    const range = selectionRange(targets);
    const commands = range
      ? [{ type: 'deleteRange' as const, range }]
      : targets.map((note) => ({
        type: 'deleteNote' as const,
        coreEntityId: note.coreEntityId ?? undefined,
        step: note.isRest ? undefined : note.step,
        octave: note.isRest ? undefined : note.octave,
        alter: note.isRest ? undefined : note.alter,
        isRest: note.isRest,
        coreMeasureId: note.coreMeasureId ?? null,
        corePartId: note.corePartId ?? null,
        measureNumber: note.measureNumber,
        staffIndex: note.staffIndex,
        voiceId: note.voiceId,
        timestampNum: note.timestampNum,
        timestampDen: note.timestampDen,
      }));
    const next = applyEditorCommands(commands);
    if (next.xml === xml) {
      warnNoOpEdit('deleteSelection', commands[0]!);
      return;
    }
    // After a cut the selection is the first rest of what was cut: Paste there puts it back, and
    // Right is the next beat.
    const first = [...targets].sort(compareSelectedNotes)[0]!;
    const anchor = collapseToFirst ? toSelectionAnchor(first, [first]) : toSelectionAnchor(currentSelectedNote, currentSelectedNotes);
    onApplyCommands(commands, { selectionAnchor: anchor });
    // The selection is there at once, on the rests that are left (F51): the next key must not meet
    // an empty selection while the document is rendered.
    const restored = resolveSelectionAnchor(next.coreDocument, anchor);
    if (!restored.length) {
      clearSelection();
      return;
    }
    const focus = restored.find((note) => note.coreEntityId === anchor?.anchorEntityId) ?? restored[restored.length - 1]!;
    selectedNotesRef.current = restored;
    setSelectedNotes(restored);
    setSelectedNoteLive(focus);
    setSelectedVisualLive({ visualOnly: false, text: null, measureNumber: focus.measureNumber, staffIndex: focus.staffIndex });
    lastSelectedRef.current = focus;
  }, [selectedNote, selectedNotes, applyEditorCommands, onApplyCommands, clearSelection, findSelectedVisualDeleteCommand, setSelectedNoteLive, setSelectedVisualLive, warnNoOpEdit, xml]);

  const rippleDelete = useCallback(() => {
    const targetNote = noteInputModeRef.current
      ? (lastNoteInputRef.current ?? selectedNoteRef.current ?? selectedNote)
      : (selectedNoteRef.current ?? selectedNote);
    if (!targetNote) return;

    const targets = noteInputModeRef.current ? [targetNote] : selectedTargets(targetNote, selectedNotes);
    if (!targets.length) return;

    const range = selectionRange(targets);
    const commands: ScoreCommand[] = range
      ? [{ type: 'rippleDeleteRange', range }]
      : [{
        type: 'rippleDelete',
        coreMeasureId: targetNote.coreMeasureId ?? null,
        corePartId: targetNote.corePartId ?? null,
        measureNumber: targetNote.measureNumber,
        staffIndex: targetNote.staffIndex,
        voiceId: targetNote.voiceId,
        timestampNum: targetNote.timestampNum,
        timestampDen: targetNote.timestampDen,
      }];
    const next = applyEditorCommands(commands);
    if (next.xml === xml) {
      warnNoOpEdit('rippleDelete', commands[0]!);
      return;
    }

    const currentSelectionAnchor = noteInputModeRef.current ? null : toSelectionAnchor(selectedNote, selectedNotes);
    onApplyCommands(commands, {
      selectionAnchor: remapSelectionAnchor(currentSelectionAnchor, next.selectionRemap),
    });

    const remappedLastInput = lastNoteInputRef.current?.coreEntityId
      ? resolveSelectionByEntityId(next.coreDocument, next.selectionRemap[lastNoteInputRef.current.coreEntityId])
      : null;
    if (remappedLastInput) {
      lastNoteInputRef.current = remappedLastInput;
    }

    const remappedSelected = selectedNoteRef.current?.coreEntityId
      ? resolveSelectionByEntityId(next.coreDocument, next.selectionRemap[selectedNoteRef.current.coreEntityId])
      : null;
    const remappedAnchor = targetNote.coreEntityId
      ? resolveSelectionByEntityId(next.coreDocument, next.selectionRemap[targetNote.coreEntityId])
      : null;
    const nextSelection = remappedSelected ?? remappedAnchor ?? remappedLastInput ?? null;

    if (nextSelection) {
      selectSingleNote(nextSelection, {
        visualOnly: false,
        text: null,
        measureNumber: nextSelection.measureNumber,
        staffIndex: nextSelection.staffIndex,
      });
      return;
    }

    clearSelection();
  }, [selectedNote, selectedNotes, applyEditorCommands, onApplyCommands, clearSelection, resolveSelectionByEntityId, selectSingleNote, warnNoOpEdit, xml]);

  const duplicateSelection = useCallback(() => {
    const currentSelectedNote = selectedNoteRef.current ?? lastSelectedRef.current ?? selectedNote;
    const currentSelectedNotes = selectedNotesRef.current.length > 0 ? selectedNotesRef.current : selectedNotes;
    const targets = selectedTargets(currentSelectedNote, currentSelectedNotes);
    if (!targets.length) return;
    dbg.editor(`duplicateSelection count=${targets.length}`);
    const commands = targets.map((note) => ({
      type: 'duplicateNote' as const,
      coreMeasureId: note.coreMeasureId ?? null,
      corePartId: note.corePartId ?? null,
      measureNumber: note.measureNumber,
      staffIndex: note.staffIndex,
      voiceId: note.voiceId,
      timestampNum: note.timestampNum,
      timestampDen: note.timestampDen,
    }));
    const next = applyEditorCommands(commands);
    if (next.xml === xml) {
      warnNoOpEdit('duplicateSelection', commands[0]!);
      return;
    }
    onApplyCommands(commands, { selectionAnchor: toSelectionAnchor(currentSelectedNote, currentSelectedNotes) });
    clearSelection();
  }, [selectedNote, selectedNotes, applyEditorCommands, onApplyCommands, clearSelection, warnNoOpEdit, xml]);

  const copySelectedRange = useCallback(() => {
    const currentSelectedNote = selectedNoteRef.current ?? lastSelectedRef.current ?? selectedNote;
    const currentSelectedNotes = selectedNotesRef.current.length > 0 ? selectedNotesRef.current : selectedNotes;
    const targets = selectedTargets(currentSelectedNote, currentSelectedNotes);
    if (!targets.length) return;
    const payload = buildClipboardPayloadFromSelection(
      coreDocument,
      targets.map((note) => ({
        coreEntityId: note.coreEntityId ?? null,
        coreMeasureId: note.coreMeasureId ?? null,
        corePartId: note.corePartId ?? null,
        measureNumber: note.measureNumber,
        staffIndex: note.staffIndex,
        voiceId: note.voiceId,
        timestampNum: note.timestampNum,
        timestampDen: note.timestampDen,
      })),
    );
    if (!payload) { setClipboard(null); setEditorError('Copy requires complete tuplets in one part with a consistent division grid.'); return; }
    setClipboard(payload);
    dbg.editor(`copySelectedRange count=${payload.timeline.length}`);
  }, [coreDocument, selectedNote, selectedNotes]);

  const cutSelection = useCallback(() => {
    const currentSelectedNote = selectedNoteRef.current ?? lastSelectedRef.current ?? selectedNote;
    const currentSelectedNotes = selectedNotesRef.current.length > 0 ? selectedNotesRef.current : selectedNotes;
    const targets = selectedTargets(currentSelectedNote, currentSelectedNotes);
    if (!targets.length) return;
    copySelectedRange();
    deleteSelectedNote({ collapseToFirst: true });
  }, [copySelectedRange, deleteSelectedNote, selectedNote, selectedNotes]);

  const pastePayloadAt = useCallback((
    payload: ScoreClipboardPayload,
    targetNote: SelectedNote,
    mode: NoteEntryMode,
    context: string,
  ) => {
    const clipboard = payload;
    const command: ScoreCommand = {
      type: 'pasteContent',
      targetPartId: targetNote.corePartId ?? coreDocument?.score.parts[0]?.id ?? 'P1',
      targetStaffIndex: targetNote.staffIndex,
      targetOffset: {
        measureNumber: targetNote.measureNumber,
        timestampNum: targetNote.timestampNum,
        timestampDen: targetNote.timestampDen,
      },
      clipboardData: clipboard,
      mode,
    };
    const commands = [command];
    const next = applyEditorCommands(commands);
    if (next.xml === xml) {
      warnNoOpEdit(context, command);
      return false;
    }

    const pastedSelection = clipboard.timeline
      .map((entry) => resolveSelectionByEntityId(next.coreDocument, next.selectionRemap[entry.event.id]))
      .filter((entry): entry is SelectedNote => Boolean(entry));

    onApplyCommands(commands, {
      selectionAnchor: pastedSelection.length > 0
        ? {
          entityIds: pastedSelection
            .map((note) => note.coreEntityId)
            .filter((value): value is string => Boolean(value)),
          anchorEntityId: pastedSelection[pastedSelection.length - 1]?.coreEntityId ?? null,
          anchorLocator: pastedSelection[pastedSelection.length - 1] ? {
            coreMeasureId: pastedSelection[pastedSelection.length - 1]!.coreMeasureId ?? null,
            corePartId: pastedSelection[pastedSelection.length - 1]!.corePartId ?? null,
            measureNumber: pastedSelection[pastedSelection.length - 1]!.measureNumber,
            staffIndex: pastedSelection[pastedSelection.length - 1]!.staffIndex,
            voiceId: pastedSelection[pastedSelection.length - 1]!.voiceId,
            timestampNum: pastedSelection[pastedSelection.length - 1]!.timestampNum,
            timestampDen: pastedSelection[pastedSelection.length - 1]!.timestampDen,
          } : null,
          selectionLocators: pastedSelection.map((note) => ({
            coreMeasureId: note.coreMeasureId ?? null,
            corePartId: note.corePartId ?? null,
            measureNumber: note.measureNumber,
            staffIndex: note.staffIndex,
            voiceId: note.voiceId,
            timestampNum: note.timestampNum,
            timestampDen: note.timestampDen,
          })),
        }
        : toSelectionAnchor(selectedNote, selectedNotes),
    });

    if (pastedSelection.length > 0) {
      selectMultipleNotes(pastedSelection);
      return true;
    }

    clearSelection();
    return true;
  }, [selectedNote, selectedNotes, coreDocument, applyEditorCommands, onApplyCommands, clearSelection, resolveSelectionByEntityId, selectMultipleNotes, warnNoOpEdit, xml]);

  const pasteContent = useCallback(() => {
    const targetNote = noteInputModeRef.current
      ? (lastNoteInputRef.current ?? selectedNoteRef.current ?? selectedNote)
      : (selectedNoteRef.current ?? selectedNote);
    if (!targetNote || !clipboard) return;
    // Paste always overwrites, as in MuseScore, Dorico and Finale. The editor's default mode is
    // named insert but behaves like MuseScore's default entry; passing it to paste pushed the
    // following music over the barline (F6 in note-entry-mastery-ledger).
    pastePayloadAt(clipboard, targetNote, 'overwrite', 'pasteContent');
  }, [clipboard, pastePayloadAt, selectedNote]);

  /**
   * `R` outside note input: repeat the selection directly after itself, over the music that follows,
   * and select the copy (MuseScore "Repeat selection", Score::cmdRepeatSelection). The clipboard is
   * not touched. F5 in note-entry-mastery-ledger: `R` used to insert a rest and push the bar's last
   * note out.
   */
  const repeatSelection = useCallback(() => {
    const currentSelectedNote = selectedNoteRef.current ?? selectedNote;
    const currentSelectedNotes = selectedNotesRef.current.length > 0 ? selectedNotesRef.current : selectedNotes;
    const targets = selectedTargets(currentSelectedNote, currentSelectedNotes);
    if (!targets.length || !coreDocument) return;
    const payload = buildClipboardPayloadFromSelection(
      coreDocument,
      targets.map((note) => ({
        coreEntityId: note.coreEntityId ?? null,
        coreMeasureId: note.coreMeasureId ?? null,
        corePartId: note.corePartId ?? null,
        measureNumber: note.measureNumber,
        staffIndex: note.staffIndex,
        voiceId: note.voiceId,
        timestampNum: note.timestampNum,
        timestampDen: note.timestampDen,
      })),
    );
    if (!payload) {
      setEditorError('Repeat needs complete tuplets in one part with a consistent division grid.');
      return;
    }
    const last = [...targets].sort(compareSelectedNotes).at(-1)!;
    const after = findNextRhythmicSelection(coreDocument, last)
      ?? getSemanticNoteOrder(coreDocument).find((entry) => isNextBarStartOnStaff(last, entry))
      ?? null;
    if (!after) {
      setEditorError('Nothing follows the selection to repeat it over.');
      return;
    }
    pastePayloadAt(payload, after, 'overwrite', 'repeatSelection');
  }, [coreDocument, pastePayloadAt, selectedNote, selectedNotes]);

  const copySelection = copySelectedRange;
  const pasteClipboard = pasteContent;

  const changePitch = useCallback((step: string, accidental: AccidentalChoice) => {
    if (!selectedNote || selectedNote.isRest) return;
    const currentPitch = extractPitchSnapshotFromDocument(coreDocument, {
      coreMeasureId: selectedNote.coreMeasureId ?? null,
      corePartId: selectedNote.corePartId ?? null,
      measureNumber: selectedNote.measureNumber,
      staffIndex: selectedNote.staffIndex,
      voiceId: selectedNote.voiceId,
      timestampNum: selectedNote.timestampNum,
      timestampDen: selectedNote.timestampDen,
    });
    const baseOctave = currentPitch?.octave ?? selectedNote.octave;
    const alter = writtenAccidentalToAlter(accidental);
    dbg.editor(`changePitch → ${step}${alter===1?'#':alter===-1?'b':''}${baseOctave} (m.${selectedNote.measureNumber})`);
    const commands: ScoreCommand[] = [{
      type: 'changeNotePitch',
      coreEntityId: selectedNote.coreEntityId ?? undefined,
      coreMeasureId: selectedNote.coreMeasureId ?? undefined,
      corePartId: selectedNote.corePartId ?? undefined,
      measureNumber: selectedNote.measureNumber,
      staffIndex: selectedNote.staffIndex,
      voiceId: selectedNote.voiceId,
      timestampNum: selectedNote.timestampNum,
      timestampDen: selectedNote.timestampDen,
      step,
      octave: baseOctave,
      alter,
      writtenAccidental: accidental ?? undefined,
    }];
    const next = applyEditorCommands(commands);
    if (next.xml === xml) {
      warnNoOpEdit('changePitch', commands[0]!);
      return;
    }
    onApplyCommands(commands, { selectionAnchor: toSelectionAnchor(selectedNote, selectedNotes) });
    const updated = { ...selectedNote, step, alter, octave: baseOctave, writtenAccidental: accidental ?? undefined };
    setSelectedNoteLive(updated);
    const updatedSelection = selectedNotesRef.current.length > 0
      ? selectedNotesRef.current.map((note) => selectedNotesEqual(note, selectedNote) ? updated : note)
      : [updated];
    selectedNotesRef.current = updatedSelection;
    setSelectedNotes(updatedSelection);
    lastSelectedRef.current = updated;
  }, [coreDocument, selectedNote, selectedNotes, xml, applyEditorCommands, onApplyCommands, setSelectedNoteLive, warnNoOpEdit]);

  const replaceSelectedVoicePitchAtAnchor = useCallback((
    anchor: SelectedNote,
    /** Stored voice number on the anchor's staff (5-8 on a MuseScore/Finale lower staff). */
    voiceId: number,
    step: string,
    octave: number,
    alter: number,
    writtenAccidental?: WrittenAccidental,
  ) => {
    const targetEntry = buildSemanticSelectionEntries(coreDocument).find((entry) => (
      !entry.isRest
      && entry.measureNumber === anchor.measureNumber
      && entry.staffIndex === anchor.staffIndex
      && entry.voiceId === voiceId
      && (!anchor.corePartId || !entry.corePartId || entry.corePartId === anchor.corePartId)
      && timestampsEqual(entry.timestampNum, entry.timestampDen, anchor.timestampNum, anchor.timestampDen)
    ));
    if (!targetEntry) return false;
    const targetNote = toSelectedNote(targetEntry);
    const command: ScoreCommand = {
      type: 'changeNotePitch',
      coreEntityId: targetNote.coreEntityId ?? undefined,
      coreMeasureId: targetNote.coreMeasureId ?? undefined,
      corePartId: targetNote.corePartId ?? undefined,
      measureNumber: targetNote.measureNumber,
      staffIndex: targetNote.staffIndex,
      voiceId: targetNote.voiceId,
      timestampNum: targetNote.timestampNum,
      timestampDen: targetNote.timestampDen,
      step,
      octave,
      alter,
      writtenAccidental,
    };
    const next = applyEditorCommands([command]);
    if (next.xml === xml) {
      warnNoOpEdit('replaceSelectedVoicePitchAtAnchor', command);
      return false;
    }

    const updated = { ...targetNote, step, octave, alter, writtenAccidental };
    onApplyCommands([command], { selectionAnchor: toSelectionAnchor(updated, [updated]) });
    setSelectedNoteLive(updated);
    selectedNotesRef.current = [updated];
    setSelectedNotes([updated]);
    lastSelectedRef.current = updated;
    lastNoteInputRef.current = updated;
    options?.onActiveNotePreview?.(updated);
    if (writtenAccidental) setSelectedAccidentalLive(null);
    return true;
  }, [applyEditorCommands, coreDocument, onApplyCommands, options, setSelectedAccidentalLive, setSelectedNoteLive, warnNoOpEdit, xml]);

  const replaceSelectedPitchAndAdvance = useCallback((step: string, octave: number, alter: number) => {
    const targetNote = selectedNoteRef.current ?? selectedNote;
    if (!targetNote || targetNote.isRest) return;

    const command: ScoreCommand = {
      type: 'changeNotePitch',
      coreEntityId: targetNote.coreEntityId ?? undefined,
      coreMeasureId: targetNote.coreMeasureId ?? undefined,
      corePartId: targetNote.corePartId ?? undefined,
      measureNumber: targetNote.measureNumber,
      staffIndex: targetNote.staffIndex,
      voiceId: targetNote.voiceId,
      timestampNum: targetNote.timestampNum,
      timestampDen: targetNote.timestampDen,
      step,
      octave,
      alter,
    };
    const next = applyEditorCommands([command]);
    if (next.xml === xml) {
      warnNoOpEdit('replaceSelectedPitchAndAdvance', command);
      return;
    }

    const updated = { ...targetNote, step, octave, alter };
    const nextSelection = findAdjacentSelection(coreDocument, targetNote, 'next');
    const selectionAnchor = toSelectionAnchor(updated, [updated]);
    onApplyCommands([command], { selectionAnchor: nextSelection ? toSelectionAnchor(nextSelection, [nextSelection]) : selectionAnchor });

    if (nextSelection) {
      setSelectedNoteLive(nextSelection);
      selectedNotesRef.current = [nextSelection];
      setSelectedNotes([nextSelection]);
      lastSelectedRef.current = nextSelection;
      options?.onActiveNotePreview?.(nextSelection);
      return;
    }

    setSelectedNoteLive(updated);
    selectedNotesRef.current = [updated];
    setSelectedNotes([updated]);
    lastSelectedRef.current = updated;
    options?.onActiveNotePreview?.(updated);
  }, [applyEditorCommands, coreDocument, onApplyCommands, options, selectedNote, setSelectedNoteLive, warnNoOpEdit, xml]);

  // Octave (Shift or Cmd+Arrow) or one step of the key (Alt+Shift+Arrow, MuseScore
  // `pitch-up-diatonic`): the new pitch of a note for either.
  const steppedPitch = useCallback((entry: SelectedNote, base: { step: string; octave: number; alter: number }, direction: 1 | -1, unit: 'octave' | 'diatonic') => {
    if (unit === 'octave') return { step: base.step, alter: base.alter, octave: Math.max(0, Math.min(9, base.octave + direction)) };
    const next = pitchFromDiatonicIndex(diatonicPitchIndex(base.step, base.octave) + direction);
    const fifths = resolveKeyFifthsAtMeasure(coreDocument, { measureNumber: entry.measureNumber, staffIndex: entry.staffIndex, partId: entry.corePartId });
    return { step: next.step, octave: Math.max(0, Math.min(9, next.octave)), alter: keyFifthsAlterForStep(fifths, next.step) };
  }, [coreDocument]);

  const changeOctave = useCallback((direction: 1 | -1, unit: 'octave' | 'diatonic' = 'octave') => {
    const targetNote = noteInputModeRef.current
      ? (lastNoteInputRef.current ?? selectedNoteRef.current ?? selectedNote)
      : (selectedNoteRef.current ?? selectedNote);
    if (!targetNote || targetNote.isRest) return;
    const activeSelection = selectedNotesRef.current.length > 1 ? selectedNotesRef.current : selectedNotes;
    const selectedPitchedTargets = !noteInputModeRef.current
      ? selectedTargets(targetNote, activeSelection).filter((entry) => !entry.isRest)
      : [];
    if (selectedPitchedTargets.length > 1) {
      const updatedTargets = selectedPitchedTargets.map((entry) => {
        const currentPitch = extractPitchSnapshotFromDocument(coreDocument, {
          coreMeasureId: entry.coreMeasureId ?? null,
          corePartId: entry.corePartId ?? null,
          measureNumber: entry.measureNumber,
          staffIndex: entry.staffIndex,
          voiceId: entry.voiceId,
          timestampNum: entry.timestampNum,
          timestampDen: entry.timestampDen,
        });
        return { ...entry, ...steppedPitch(entry, { step: currentPitch?.step ?? entry.step, octave: currentPitch?.octave ?? entry.octave, alter: currentPitch?.alter ?? entry.alter }, direction, unit) };
      });
      const commands: ScoreCommand[] = updatedTargets.map((entry) => ({
        type: 'changeNotePitch',
        coreEntityId: entry.coreEntityId ?? undefined,
        coreMeasureId: entry.coreMeasureId ?? undefined,
        corePartId: entry.corePartId ?? undefined,
        measureNumber: entry.measureNumber,
        staffIndex: entry.staffIndex,
        voiceId: entry.voiceId,
        timestampNum: entry.timestampNum,
        timestampDen: entry.timestampDen,
        step: entry.step,
        octave: entry.octave,
        alter: entry.alter,
      }));
      const next = applyEditorCommands(commands);
      if (next.xml === xml) {
        warnNoOpEdit('changeOctaveSelection', commands[0]!);
        return;
      }
      const nextFocus = updatedTargets.find((entry) => selectedNotesEqual(entry, targetNote)) ?? updatedTargets[updatedTargets.length - 1]!;
      setSelectedNoteLive(nextFocus);
      selectedNotesRef.current = updatedTargets;
      setSelectedNotes(updatedTargets);
      lastSelectedRef.current = nextFocus;
      onApplyCommands(commands, { selectionAnchor: toSelectionAnchor(nextFocus, updatedTargets) });
      options?.onActiveNotePreview?.(nextFocus);
      return;
    }
    const currentPitch = extractPitchSnapshotFromDocument(coreDocument, {
      coreMeasureId: targetNote.coreMeasureId ?? null,
      corePartId: targetNote.corePartId ?? null,
      measureNumber: targetNote.measureNumber,
      staffIndex: targetNote.staffIndex,
      voiceId: targetNote.voiceId,
      timestampNum: targetNote.timestampNum,
      timestampDen: targetNote.timestampDen,
    });
    const stepped = steppedPitch(targetNote, { step: currentPitch?.step ?? targetNote.step, octave: currentPitch?.octave ?? targetNote.octave, alter: currentPitch?.alter ?? targetNote.alter }, direction, unit);
    const newOctave = stepped.octave;
    dbg.editor(`changeOctave → ${stepped.step}${newOctave} (m.${targetNote.measureNumber})`);
    const commands: ScoreCommand[] = [{
      type: 'changeNotePitch',
      coreEntityId: targetNote.coreEntityId ?? undefined,
      coreMeasureId: targetNote.coreMeasureId ?? undefined,
      corePartId: targetNote.corePartId ?? undefined,
      measureNumber: targetNote.measureNumber,
      staffIndex: targetNote.staffIndex,
      voiceId: targetNote.voiceId,
      timestampNum: targetNote.timestampNum,
      timestampDen: targetNote.timestampDen,
      step: stepped.step,
      octave: newOctave,
      alter: stepped.alter,
    }];
    const next = applyEditorCommands(commands);
    if (next.xml === xml) {
      warnNoOpEdit('changeOctave', commands[0]!);
      return;
    }
    onApplyCommands(commands, { selectionAnchor: noteInputModeRef.current ? null : toSelectionAnchor(targetNote, selectedNotes) });
    const updated = { ...targetNote, ...stepped };
    if (lastNoteInputRef.current && selectedNotesEqual(lastNoteInputRef.current, targetNote)) {
      lastNoteInputRef.current = updated;
    }
    if (selectedNoteRef.current && selectedNotesEqual(selectedNoteRef.current, targetNote)) {
      setSelectedNoteLive(updated);
      selectedNotesRef.current = [updated];
      setSelectedNotes([updated]);
    }
    options?.onActiveNotePreview?.(updated);
  }, [coreDocument, selectedNote, selectedNotes, xml, applyEditorCommands, onApplyCommands, options, setSelectedNoteLive, steppedPitch, warnNoOpEdit]);

  const resolveSelectionFromDocument = useCallback((document: ScoreDocumentModel | null, target: ScoreEventLocator) => {
    const resolved = findSemanticSelectionEntry(document, target);
    return resolved ? toSelectedNote(resolved) : null;
  }, []);

  const clearMeasureVoice = useCallback(() => {
    const targetNote = noteInputModeRef.current
      ? (lastNoteInputRef.current ?? selectedNoteRef.current ?? selectedNote)
      : (selectedNoteRef.current ?? selectedNote);
    if (!targetNote) return;

    const command: ScoreCommand = {
      type: 'clearMeasureVoice',
      corePartId: targetNote.corePartId ?? null,
      measureNumber: targetNote.measureNumber,
      staffIndex: targetNote.staffIndex,
      voiceId: targetNote.voiceId,
    };
    const next = applyEditorCommands([command]);
    if (next.xml === xml) {
      warnNoOpEdit('clearMeasureVoice', command);
      return;
    }

    onApplyCommands([command], { selectionAnchor: null });
    const resolved = resolveSelectionFromDocument(next.coreDocument, {
      coreMeasureId: targetNote.coreMeasureId ?? null,
      corePartId: targetNote.corePartId ?? null,
      measureNumber: targetNote.measureNumber,
      staffIndex: targetNote.staffIndex,
      voiceId: targetNote.voiceId,
      timestampNum: 0,
      timestampDen: 1,
    });
    if (resolved) {
      selectSingleNote(resolved, {
        visualOnly: false,
        text: null,
        measureNumber: resolved.measureNumber,
        staffIndex: resolved.staffIndex,
      });
      if (noteInputModeRef.current) lastNoteInputRef.current = resolved;
      return;
    }

    clearSelection();
  }, [applyEditorCommands, clearSelection, onApplyCommands, resolveSelectionFromDocument, selectSingleNote, selectedNote, warnNoOpEdit, xml]);

  /**
   * K8: bars from the keyboard, after MuseScore's `insert-measure` (Ins), `append-measure` (Ctrl+B)
   * and `time-delete` (Ctrl+Del). Insert and delete act on the bars the selection touches and leave
   * the selection on the first event of the bar that now stands there.
   */
  const editBars = useCallback((action: 'insertBefore' | 'append' | 'delete') => {
    const anchor = selectedNoteRef.current ?? selectedNote;
    const targets = selectedNotes.length > 0 ? selectedNotes : anchor ? [anchor] : [];
    const barCount = coreDocument?.score.parts[0]?.staves[0]?.measures.length ?? 0;
    if (!barCount) return false;
    if (action !== 'append' && (!anchor || !targets.length)) return false;
    const first = targets.length ? Math.min(...targets.map((note) => note.measureNumber)) : barCount;
    const last = targets.length ? Math.max(...targets.map((note) => note.measureNumber)) : barCount;
    const commands: ScoreCommand[] = action === 'append'
      ? [{ type: 'insertMeasureAfter', measureNumber: barCount }]
      : action === 'insertBefore'
        ? [{ type: 'insertMeasureBefore', measureNumber: first }]
        : Array.from({ length: last - first + 1 }, () => ({ type: 'deleteMeasure' as const, measureNumber: first }));
    const next = applyEditorCommands(commands);
    if (next.xml === xml) {
      const rejected = next.diagnostics.find((entry) => entry.code.endsWith('_rejected'));
      setEditorError(rejected?.message ?? 'The bars could not be changed here.');
      return true;
    }
    setEditorError(null);
    onApplyCommands(commands, { selectionAnchor: null });
    if (action === 'append' || !anchor) return true;
    const landingBar = Math.min(first, next.coreDocument?.score.parts[0]?.staves[0]?.measures.length ?? first);
    const landing = buildSemanticSelectionEntries(next.coreDocument)
      .filter((entry) => entry.measureNumber === landingBar && entry.staffIndex === anchor.staffIndex && (!anchor.corePartId || entry.corePartId === anchor.corePartId))
      .sort((left, right) => left.voiceId - right.voiceId || left.timestampNum / Math.max(left.timestampDen, 1) - right.timestampNum / Math.max(right.timestampDen, 1))[0];
    if (!landing) {
      clearSelection();
      return true;
    }
    const resolved = toSelectedNote(landing);
    lastNoteInputRef.current = null;
    selectSingleNote(resolved, { visualOnly: false, text: null, measureNumber: resolved.measureNumber, staffIndex: resolved.staffIndex });
    return true;
  }, [applyEditorCommands, clearSelection, coreDocument, onApplyCommands, selectSingleNote, selectedNote, selectedNotes, xml]);

  /**
   * K7: MuseScore's `voice-1` … `voice-4` in normal mode (`Score::changeSelectedElementsVoice`). The
   * selected notes go to the target voice where it has a rest, or join a chord of the same value
   * there; a rest stays behind. Where the target voice has other music, nothing is moved and a
   * sentence says where. Returns false when there is nothing to move (the key then only chooses the
   * input voice).
   */
  const moveSelectionToVoice = useCallback((inputVoice: 1 | 2 | 3 | 4) => {
    const document = coreDocument;
    if (!document) return false;
    const anchor = selectedNoteRef.current ?? selectedNote;
    const chosen = (selectedNotes.length > 0 ? selectedNotes : anchor ? [anchor] : [])
      .filter((note) => !note.isRest && inputVoiceOf(note.voiceId) !== inputVoice);
    if (!chosen.length) return false;
    const graceIds = new Set(document.graceNotes.map((grace) => grace.eventId));
    const sources = chosen
      .map((note) => ({ note, ref: findEventReference(document, note) }))
      .filter((entry): entry is { note: SelectedNote; ref: NonNullable<ReturnType<typeof findEventReference>> } => Boolean(entry.ref && entry.ref.event.kind === 'note' && !graceIds.has(entry.ref.event.id)))
      .sort((left, right) => left.note.measureNumber - right.note.measureNumber
        || left.ref.event.timestampNum / Math.max(left.ref.event.timestampDen, 1) - right.ref.event.timestampNum / Math.max(right.ref.event.timestampDen, 1)
        || Number(left.ref.event.isChord) - Number(right.ref.event.isChord));
    if (!sources.length) return false;
    const reject = (message: string) => { setEditorError(message); return true; };
    if (sources.some(({ ref }) => document.tuplets.some((tuplet) => tuplet.eventIds.includes(ref.event.id)))) {
      return reject('Notes of a tuplet cannot be moved to another voice one by one. Cut the tuplet and paste it into the other voice.');
    }
    const inserts: ScoreCommand[] = [];
    const marks: ScoreCommand[] = [];
    const ties: ScoreCommand[] = [];
    const removals: ScoreCommand[] = [];
    const written = new Set<string>();
    const samePitch = (left: TimedEvent, right: TimedEvent) => left.kind === 'note' && right.kind === 'note'
      && left.pitch.step === right.pitch.step && left.pitch.octave === right.pitch.octave && left.pitch.alter === right.pitch.alter;
    for (const [index, { note, ref }] of sources.entries()) {
      const event = ref.event;
      if (event.kind !== 'note') continue;
      const targetVoiceId = storedVoiceFor(document, { corePartId: ref.part.id, staffIndex: ref.staff.staffIndex }, inputVoice);
      const targetVoice = ref.measure.voices.find((voice) => voice.voiceId === targetVoiceId) ?? null;
      const start = event.timestampNum;
      const end = start + event.durationDivisions;
      const inTheWay = (targetVoice?.events ?? []).filter((entry) => (
        entry.kind === 'note' && !graceIds.has(entry.id)
        && entry.timestampDen === event.timestampDen
        && entry.timestampNum < end && entry.timestampNum + entry.durationDivisions > start
      ));
      const joins = inTheWay.length > 0 && inTheWay.every((entry) => entry.timestampNum === start && entry.durationDivisions === event.durationDivisions);
      if (inTheWay.length > 0 && !joins) {
        return reject(`Voice ${inputVoice} already has other music at bar ${note.measureNumber}, beat ${formatBeat(beatOfOnset(event.timestampNum, event.timestampDen, 4))}. Nothing was moved.`);
      }
      if (inTheWay.some((entry) => samePitch(entry, event))) {
        return reject(`Voice ${inputVoice} already has this note at bar ${note.measureNumber}. Nothing was moved.`);
      }
      const locator = {
        coreMeasureId: ref.measure.id,
        corePartId: ref.part.id,
        measureNumber: ref.measure.measureNumber,
        staffIndex: ref.staff.staffIndex,
        voiceId: targetVoiceId,
        timestampNum: event.timestampNum,
        timestampDen: event.timestampDen,
      };
      const onsetKey = `${locator.measureNumber}:${locator.staffIndex}:${locator.timestampNum}/${locator.timestampDen}`;
      inserts.push({
        type: 'insertNoteAt',
        ...locator,
        step: event.pitch.step,
        octave: event.pitch.octave,
        alter: event.pitch.alter,
        ...(event.writtenAccidental ? { writtenAccidental: event.writtenAccidental } : {}),
        durationType: event.durationType ?? 'quarter',
        isDotted: Boolean(event.isDotted),
        asChord: joins || written.has(onsetKey),
        preserveOverflow: false,
      } as ScoreCommand);
      if (!written.has(onsetKey) && !joins) {
        for (const articulation of event.articulations ?? []) {
          marks.push({ type: 'toggleArticulation', articulation, ...locator } as ScoreCommand);
        }
      }
      written.add(onsetKey);
      // A tie goes along when the note it runs into is moved as well.
      const continues = event.tieStart && sources.slice(index + 1).some((later) => (
        samePitch(later.ref.event, event)
        && (later.note.measureNumber > note.measureNumber || later.ref.event.timestampNum >= end)
      ));
      if (continues) {
        ties.push({ type: 'toggleTie', coreEntityId: null, ...locator, step: event.pitch.step, octave: event.pitch.octave, alter: event.pitch.alter } as ScoreCommand);
      }
      removals.push({
        type: 'deleteNote',
        coreEntityId: event.id,
        coreMeasureId: ref.measure.id,
        corePartId: ref.part.id,
        measureNumber: ref.measure.measureNumber,
        staffIndex: ref.staff.staffIndex,
        voiceId: ref.voice.voiceId,
        timestampNum: event.timestampNum,
        timestampDen: event.timestampDen,
      } as ScoreCommand);
    }
    const commands = [...inserts, ...marks, ...removals, ...ties];
    const next = applyEditorCommands(commands);
    if (next.xml === xml || next.diagnostics.some((entry) => entry.code.endsWith('_rejected'))) {
      const rejected = next.diagnostics.find((entry) => entry.code.endsWith('_rejected'));
      return reject(rejected?.message ?? `These notes cannot be moved to voice ${inputVoice}.`);
    }
    setEditorError(null);
    onApplyCommands(commands, { selectionAnchor: null });
    setSelectedVoiceLive(inputVoice);
    const firstInsert = inserts[0] as Extract<ScoreCommand, { type: 'insertNoteAt' }>;
    const landed = buildSemanticSelectionEntries(next.coreDocument).filter((entry) => (
      !entry.isRest
      && (inserts as Array<Extract<ScoreCommand, { type: 'insertNoteAt' }>>).some((insert) => (
        insert.measureNumber === entry.measureNumber && insert.staffIndex === entry.staffIndex && insert.voiceId === entry.voiceId
        && (!insert.corePartId || insert.corePartId === entry.corePartId)
        && timestampsEqual(insert.timestampNum, insert.timestampDen, entry.timestampNum, entry.timestampDen)
        && insert.step === entry.step && insert.octave === entry.octave
      ))
    )).map((entry) => toSelectedNote(entry));
    const first = landed.find((entry) => entry.measureNumber === firstInsert.measureNumber && timestampsEqual(entry.timestampNum, entry.timestampDen, firstInsert.timestampNum, firstInsert.timestampDen)) ?? landed[0];
    if (first) {
      selectSingleNote(first, { visualOnly: false, text: null, measureNumber: first.measureNumber, staffIndex: first.staffIndex });
      setSelectedVoiceLive(inputVoice);
    } else {
      clearSelection();
    }
    return true;
  }, [applyEditorCommands, clearSelection, coreDocument, onApplyCommands, selectSingleNote, selectedNote, selectedNotes, setSelectedVoiceLive, xml]);

  function resolveSelectionByEntityId(document: ScoreDocumentModel | null, entityId: string | null | undefined) {
    if (!document || !entityId) return null;
    const resolved = buildSemanticSelectionEntries(document).find((entry) => entry.coreEntityId === entityId);
    return resolved ? toSelectedNote(resolved) : null;
  }

  const resolveRecentInputFromDocument = useCallback((document: ScoreDocumentModel | null, target: ScoreEventLocator, hint?: {
    isRest: boolean;
    step?: string;
    octave?: number;
    alter?: number;
  }) => {
    const exact = resolveSelectionFromDocument(document, target);
    if (exact && (!hint || noteMatchesPitchHint(exact, hint))) return exact;
    if (!hint) return null;
    const ordered = buildSemanticSelectionEntries(document)
      .filter((entry) => (
        (!target.corePartId || entry.corePartId === target.corePartId)
        && (!target.coreMeasureId || entry.coreMeasureId === target.coreMeasureId)
        && entry.measureNumber === target.measureNumber
        && entry.staffIndex === target.staffIndex
        && entry.voiceId === target.voiceId
        && entry.isRest === hint.isRest
      ))
      .filter((entry) => (
        hint.isRest
          ? true
          : entry.step === hint.step && entry.octave === hint.octave && entry.alter === hint.alter
      ))
      .sort((a, b) => (
        Number(!timestampsEqual(a.timestampNum, a.timestampDen, target.timestampNum, target.timestampDen))
        - Number(!timestampsEqual(b.timestampNum, b.timestampDen, target.timestampNum, target.timestampDen))
        || Math.abs((a.timestampNum / Math.max(a.timestampDen, 1)) - (target.timestampNum / Math.max(target.timestampDen, 1)))
        - Math.abs((b.timestampNum / Math.max(b.timestampDen, 1)) - (target.timestampNum / Math.max(target.timestampDen, 1)))
        || compareSemanticSelectionEntries(a, b)
      ));
    return ordered[0] ? toSelectedNote(ordered[0]) : null;
  }, [resolveSelectionFromDocument]);

  const resolveEventTimingFromDocument = useCallback((document: ScoreDocumentModel | null, target: ScoreEventLocator) => {
    const ref = findEventReference(document, target);
    if (!ref) return null;
    return {
      timestampNum: ref.event.timestampNum,
      timestampDen: ref.event.timestampDen,
      durationDivisions: ref.event.durationDivisions,
    };
  }, []);

  const commitNoteInputUpdate = useCallback((
    commands: ScoreCommand[],
    nextDocument: ScoreDocumentModel | null,
    enteredLocator: {
      coreMeasureId?: string | null;
      corePartId?: string | null;
      measureNumber: number;
      staffIndex: number;
      voiceId: number;
      timestampNum: number;
      timestampDen: number;
    } | null,
    advanceFrom: SelectedNote | null,
    inputHint?: {
      isRest: boolean;
      step?: string;
      octave?: number;
      alter?: number;
    },
    behavior?: {
      audition?: boolean;
      advanceCursor?: boolean;
      useAdvancedSelectionAsInputAnchor?: boolean;
      skipHistory?: boolean;
      /** The value just entered, when it is not the selected duration (pitch-before-duration). */
      enteredValue?: { duration: NoteDuration; dotted: boolean };
    },
  ) => {
    setEditorError(null);
    if (behavior?.skipHistory) preparedCommandsRef.current = undefined;
    if (!enteredLocator) {
      return onApplyCommands(commands, { selectionAnchor: toSelectionAnchor(selectedNote, selectedNotes) });
    }

    const enteredNote = resolveRecentInputFromDocument(nextDocument, enteredLocator, inputHint);

    const rawNextSelection = behavior?.advanceCursor !== false
      && noteInputModeRef.current && !chordInputModeRef.current && advanceFrom && enteredNote
      ? findNextInputPosition(nextDocument, enteredNote, behavior?.enteredValue ?? { duration: selectedDurationRef.current, dotted: isDottedRef.current })
      : null;
    const nextSelection = enteredNote && isLocalNoteInputAdvance(enteredNote, rawNextSelection)
      ? rawNextSelection
      : null;
    if (enteredNote && rawNextSelection && !nextSelection) {
      dbg.editor(
        `noteInput advance rejected from m.${enteredNote.measureNumber} ${enteredNote.timestampNum}/${enteredNote.timestampDen}`
        + ` to m.${rawNextSelection.measureNumber} ${rawNextSelection.timestampNum}/${rawNextSelection.timestampDen}`,
      );
    }
    const selectionAfterUpdate = nextSelection ?? enteredNote ?? null;
    const persistedSelectionAnchor = noteInputModeRef.current
      ? null
      : (selectionAfterUpdate
        ? toSelectionAnchor(selectionAfterUpdate, [selectionAfterUpdate])
        : toSelectionAnchor(selectedNote, selectedNotes));

    // The open input slur follows the note just entered, in the same command batch (one Undo step).
    const inputSlur = inputSlurRef.current;
    const extendsInputSlur = Boolean(
      inputSlur && enteredNote && !enteredNote.isRest && !behavior?.skipHistory
      && enteredNote.corePartId === inputSlur.start.corePartId
      && enteredNote.staffIndex === inputSlur.start.staffIndex
      && enteredNote.voiceId === inputSlur.start.voiceId
      && compareSelectedNotes(enteredNote, inputSlur.end ?? inputSlur.start) > 0,
    );
    const slurLocator = (note: SelectedNote) => ({
      measureNumber: note.measureNumber,
      staffIndex: note.staffIndex,
      voiceId: note.voiceId,
      timestampNum: note.timestampNum,
      timestampDen: note.timestampDen,
    });
    const slurCommands: ScoreCommand[] = extendsInputSlur && inputSlur && enteredNote
      ? [inputSlur.end, enteredNote].flatMap((stop) => stop ? [{
        type: 'toggleSlur' as const,
        corePartId: inputSlur.start.corePartId ?? null,
        ...slurLocator(inputSlur.start),
        stopLocator: slurLocator(stop),
      }] : [])
      : [];

    if (!behavior?.skipHistory && !onApplyCommands([...commands, ...slurCommands], {
      selectionAnchor: persistedSelectionAnchor,
      ...(noteInputModeRef.current && selectionAfterUpdate
        ? { redoSelectionAnchor: toSelectionAnchor(selectionAfterUpdate, [selectionAfterUpdate]) }
        : {}),
    })) return false;
    if (extendsInputSlur && inputSlur && enteredNote) inputSlur.end = enteredNote;

    // The entered note is shown at once, before the score is drawn again (gate 3, pending note).
    if (
      enteredNote && !enteredNote.isRest && !behavior?.skipHistory && nextDocument && !pointerEntryRef.current
      && enteredNote.step && enteredNote.octave != null
    ) {
      const value = behavior?.enteredValue ?? { duration: selectedDurationRef.current, dotted: isDottedRef.current };
      publishPendingEntry({
        revision: nextDocument.revision,
        note: {
          coreMeasureId: enteredNote.coreMeasureId ?? null,
          corePartId: enteredNote.corePartId ?? null,
          measureNumber: enteredNote.measureNumber,
          staffIndex: enteredNote.staffIndex,
          voiceId: enteredNote.voiceId,
          timestampNum: enteredNote.timestampNum,
          timestampDen: enteredNote.timestampDen,
          step: enteredNote.step,
          octave: enteredNote.octave,
          alter: enteredNote.alter ?? 0,
          duration: String(value.duration),
          dotted: Boolean(value.dotted),
        },
      });
    }

    if (enteredNote) {
      lastNoteInputRef.current = {
        ...enteredNote,
        durationType: enteredNote.durationType ?? DURATION_TYPE_MAP[selectedDurationRef.current],
        isDotted: enteredNote.isDotted ?? isDottedRef.current,
      };
    }

    if (enteredNote && behavior?.audition !== false) {
      const soundingNotes = getSimultaneousPitchedNotes(nextDocument, enteredNote);
      if (options?.onActiveNotesPreview) {
        options.onActiveNotesPreview(soundingNotes);
      } else {
        options?.onActiveNotePreview?.(enteredNote);
      }
    }
    if (nextSelection) {
      if (behavior?.useAdvancedSelectionAsInputAnchor) {
        lastNoteInputRef.current = nextSelection;
      }
      selectSingleNote(nextSelection, { visualOnly: false, text: null, measureNumber: nextSelection.measureNumber, staffIndex: nextSelection.staffIndex });
      return true;
    }
    if (enteredNote) {
      selectSingleNote(enteredNote, { visualOnly: false, text: null, measureNumber: enteredNote.measureNumber, staffIndex: enteredNote.staffIndex });
      // Nothing follows this entry in the score: the next plain entry appends a bar.
      if (behavior?.advanceCursor !== false && noteInputModeRef.current && !chordInputModeRef.current && advanceFrom && !rawNextSelection) {
        beyondScoreRef.current = enteredNote;
      }
    }
    return true;
  }, [chordInputMode, noteInputMode, onApplyCommands, options, resolveRecentInputFromDocument, selectSingleNote, selectedNote, selectedNotes]);

  /** The last entered note, if the input position is still past the end of the score. */
  const beyondScoreCursor = useCallback(() => {
    const flagged = beyondScoreRef.current;
    const cursor = selectedNoteRef.current;
    if (!flagged || !cursor || !noteInputModeRef.current || chordInputModeRef.current) return null;
    if (!sameRhythmicPosition(cursor, flagged)) return null;
    // Undo or another edit may have changed the end of the voice since the entry.
    const last = getSemanticNoteOrder(coreDocument).filter((entry) => matchesSelectionLane(entry, flagged)).at(-1);
    if (!last || last.measureNumber !== flagged.measureNumber) return null;
    if (!timestampsEqual(last.timestampNum, last.timestampDen, flagged.timestampNum, flagged.timestampDen)) return null;
    return Boolean(last.isRest) === Boolean(flagged.isRest) ? flagged : null;
  }, [coreDocument]);

  /**
   * Entry past the end of the score: MuseScore appends one bar and writes there
   * (NoteInput::addPitch with is.beyondScore()). Both happen in one command batch, so one Undo step.
   */
  const enterBeyondScore = useCallback((
    lastEntered: SelectedNote,
    pitches: Array<{ step: string; octave: number; alter: number; writtenAccidental?: WrittenAccidental }> | null,
    value?: { duration: NoteDuration; dotted: boolean },
    /** Commands that follow the new bar's note in the same batch, such as the ties of `T`. */
    followingCommands: ScoreCommand[] = [],
  ) => {
    const duration = value?.duration ?? selectedDurationRef.current;
    const dotted = value?.dotted ?? isDottedRef.current;
    const durationType = DURATION_TYPE_MAP[duration];
    const newBar = {
      coreMeasureId: null,
      corePartId: lastEntered.corePartId ?? null,
      measureNumber: lastEntered.measureNumber + 1,
      staffIndex: lastEntered.staffIndex,
      voiceId: storedInputVoiceAt(lastEntered),
      timestampNum: 0,
      timestampDen: Math.max(lastEntered.timestampDen, 1),
    };
    const newBarHasEntryVoice = newBar.voiceId === Math.min(
      newBar.voiceId,
      ...getSemanticNoteOrder(coreDocument)
        .filter((entry) => entry.corePartId === lastEntered.corePartId && entry.staffIndex === lastEntered.staffIndex)
        .map((entry) => entry.voiceId),
    );
    const commands: ScoreCommand[] = [
      { type: 'insertMeasureAfter', measureNumber: lastEntered.measureNumber },
      ...(pitches
        ? pitches.map((pitch, index) => ({
          type: 'insertNoteAt' as const,
          ...newBar,
          step: pitch.step,
          octave: pitch.octave,
          alter: pitch.alter,
          ...(pitch.writtenAccidental ? { writtenAccidental: pitch.writtenAccidental } : {}),
          durationType,
          isDotted: dotted,
          asChord: index > 0,
          preserveOverflow: false,
        }))
        // The new bar's whole-bar rest sits in the staff's first voice; another voice has no event yet.
        : [newBarHasEntryVoice
          ? { type: 'replaceWithRest' as const, coreEntityId: null, ...newBar, durationType, isDotted: dotted }
          : { type: 'insertRestAt' as const, ...newBar, durationType, isDotted: dotted }]),
      ...followingCommands,
    ];
    const next = applyEditorCommands(commands);
    if (next.xml === xml || next.diagnostics.some((entry) => entry.code.endsWith('_rejected'))) {
      warnNoOpEdit('enterBeyondScore', commands[0]!);
      return false;
    }
    beyondScoreRef.current = null;
    return commitNoteInputUpdate(commands, next.coreDocument, newBar, lastEntered, pitches
      ? { isRest: false, step: pitches[0]!.step, octave: pitches[0]!.octave, alter: pitches[0]!.alter }
      : { isRest: true }, { advanceCursor: true, enteredValue: { duration, dotted } });
  }, [applyEditorCommands, commitNoteInputUpdate, coreDocument, storedInputVoiceAt, warnNoOpEdit, xml]);

  const resolveActiveDurationTarget = useCallback(() => {
    const activeSelection = selectedNoteRef.current ?? selectedNote;
    return noteInputModeRef.current
      ? (lastNoteInputRef.current ?? activeSelection)
      : activeSelection;
  }, [selectedNote]);

  const changeNoteDuration = useCallback((duration: NoteDuration, dotted: boolean) => {
    const target = resolveActiveDurationTarget();
    if (!target) return;
    const command: ScoreCommand = {
      type: 'changeNoteDuration',
      coreEntityId: target.coreEntityId ?? undefined,
      coreMeasureId: target.coreMeasureId ?? undefined,
      corePartId: target.corePartId ?? undefined,
      measureNumber: target.measureNumber,
      staffIndex: target.staffIndex,
      voiceId: target.voiceId,
      timestampNum: target.timestampNum,
      timestampDen: target.timestampDen,
      durationType: DURATION_TYPE_MAP[duration],
      isDotted: dotted,
    };
    const commands = [command];
    const next = applyEditorCommands(commands);
    if (next.xml === xml) {
      warnNoOpEdit('changeNoteDuration', command);
      // Say why nothing happened, unless the core already did: a rejected action gives visible feedback.
      if (!next.diagnostics.some((entry) => entry.code.endsWith('_rejected'))) setEditorError('This note value does not fit at this position.');
      return;
    }
    setSelectedDurationLive(duration);
    setIsDottedLive(dotted);
    const updatedTarget = {
      coreEntityId: target.coreEntityId ?? null,
      coreMeasureId: target.coreMeasureId ?? null,
      corePartId: target.corePartId ?? null,
      measureNumber: target.measureNumber,
      staffIndex: target.staffIndex,
      voiceId: target.voiceId,
      timestampNum: target.timestampNum,
      timestampDen: target.timestampDen,
    };
    const resolved = resolveSelectionFromDocument(next.coreDocument, updatedTarget);
    // In note input the changed note is usually the one just entered, behind the cursor. A longer
    // value can absorb the cursor's slot, so the cursor moves to the position after the changed
    // note (F8 in note-entry-mastery-ledger: the old slot was restored and the cursor was lost).
    const cursorBefore = selectedNoteRef.current ?? selectedNote;
    const inNoteInput = noteInputModeRef.current;
    const changedAtCursor = Boolean(cursorBefore && resolved && sameRhythmicPosition(cursorBefore, resolved));
    const rawCursorAfter = inNoteInput && resolved && !changedAtCursor
      ? findNextInputPosition(next.coreDocument, resolved, { duration, dotted })
      : null;
    const cursorAfter = inNoteInput && resolved
      ? (changedAtCursor ? resolved : (isLocalNoteInputAdvance(resolved, rawCursorAfter) ? rawCursorAfter : resolved))
      : null;
    onApplyCommands(commands, inNoteInput
      ? { selectionAnchor: null, ...(cursorAfter ? { redoSelectionAnchor: toSelectionAnchor(cursorAfter, [cursorAfter]) } : {}) }
      : { selectionAnchor: toSelectionAnchor(selectedNote, selectedNotes) });
    if (resolved) {
      lastNoteInputRef.current = resolved;
      if (cursorAfter) {
        selectSingleNote(cursorAfter, { visualOnly: false, text: null, measureNumber: cursorAfter.measureNumber, staffIndex: cursorAfter.staffIndex });
        if (!rawCursorAfter && !changedAtCursor) beyondScoreRef.current = resolved;
      } else if (selectedNote && selectedNotes.length <= 1) {
        setSelectedNoteLive(resolved);
        selectedNotesRef.current = [resolved];
        setSelectedNotes([resolved]);
      }
    }
  }, [applyEditorCommands, onApplyCommands, resolveActiveDurationTarget, resolveSelectionFromDocument, selectSingleNote, selectedNote, selectedNotes, setIsDottedLive, setSelectedDurationLive, setSelectedNoteLive, warnNoOpEdit, xml]);

  const setDurationSelection = useCallback((duration: NoteDuration) => {
    // With an active note, duration buttons edit that note even while note
    // input is enabled. Without a selection they set the next entry duration.
    const currentSelectedNote = selectedNoteRef.current ?? selectedNote;
    if (
      noteInputModeRef.current
      && (!currentSelectedNote || !selectedNotesEqual(currentSelectedNote, lastNoteInputRef.current))
    ) {
      setSelectedDurationLive(duration);
      setIsDottedLive(false);
      return;
    }
    if (currentSelectedNote) {
      const current = resolveDurationState(currentSelectedNote, selectedDurationRef.current, isDottedRef.current);
      changeNoteDuration(duration, current.dotted);
      return;
    }
    setSelectedDurationLive(duration);
    setIsDottedLive(false);
  }, [changeNoteDuration, selectedNote, setIsDottedLive, setSelectedDurationLive]);

  const commitResolvedNoteEntry = useCallback((input: {
    target: ResolvedEditTarget;
    audition?: boolean;
    duration: NoteDuration;
    dotted: boolean;
    label: string;
    advanceFrom: SelectedNote;
    notehead?: 'slash';
    stem?: 'none';
    writtenAccidental?: WrittenAccidental;
    guitar?: { string: 1 | 2 | 3 | 4 | 5 | 6; fret: number; tuning?: string; techniques?: string[] };
  }) => {
    const { target, duration, label, advanceFrom } = input;
    // A tone added to a chord takes the chord's value, whatever value is armed (MuseScore adds the
    // note to the existing chord); a chord whose tones differ in length cannot be written.
    const chordRoot = target.mode === 'chord' ? (() => {
      const graceEventIds = new Set((coreDocument?.graceNotes ?? []).map((entry) => entry.eventId));
      const voiceEvents = findEventReference(coreDocument, {
        coreMeasureId: target.measureId ?? null,
        corePartId: target.corePartId ?? null,
        measureNumber: target.measureNumber,
        staffIndex: target.staffIndex,
        voiceId: target.voiceId,
        timestampNum: target.timestampNum,
        timestampDen: target.timestampDen,
      })?.measure.voices.find((voice) => voice.voiceId === target.voiceId)?.events ?? [];
      // The note that carries the chord: not a grace note at that onset, not a chord tone.
      return voiceEvents.find((event) => (
        event.kind === 'note'
        && !event.isChord
        && !graceEventIds.has(event.id)
        && timestampsEqual(event.timestampNum, event.timestampDen, target.timestampNum, target.timestampDen)
      )) ?? null;
    })() : null;
    const takesChordValue = Boolean(chordRoot?.durationType);
    const durationType = takesChordValue ? chordRoot!.durationType! : DURATION_TYPE_MAP[duration];
    const dotted = takesChordValue ? Boolean(chordRoot!.isDotted) : input.dotted;

    // Write the entry value over whatever stands at the slot: a rest of that value first (which
    // overwrites the following music, MuseScore `Score::setNoteRest` -> `makeGap`), then the note.
    const commitOverwrite = (slotEvent: TimedEvent) => {
      const slot = {
        coreMeasureId: target.measureId ?? null,
        corePartId: target.corePartId ?? null,
        measureNumber: target.measureNumber,
        staffIndex: target.staffIndex,
        voiceId: target.voiceId,
        timestampNum: target.timestampNum,
        timestampDen: target.timestampDen,
      };
      const overwriteCommands: ScoreCommand[] = [
        { type: 'replaceWithRest', coreEntityId: slotEvent.id, ...slot, durationType, isDotted: dotted },
        {
          type: 'insertNoteAt', ...slot,
          step: target.step, octave: target.octave, alter: target.alter,
          ...(input.writtenAccidental ? { writtenAccidental: input.writtenAccidental } : {}),
          durationType, isDotted: dotted, asChord: false, preserveOverflow: false,
        },
      ];
      const overwriteNext = applyEditorCommands(overwriteCommands);
      if (overwriteNext.xml === xml || overwriteNext.diagnostics.some((entry) => entry.code.endsWith('_rejected'))) return false;
      commitNoteInputUpdate(overwriteCommands, overwriteNext.coreDocument, slot, advanceFrom, {
        isRest: false,
        step: target.step,
        octave: target.octave,
        alter: target.alter,
      }, {
        audition: input.audition,
        advanceCursor: true,
      });
      if (input.writtenAccidental) setSelectedAccidentalLive(null);
      return true;
    };

    // Step-time entry into a tuplet slot: when the entry value is the slot's own unit, the pitch
    // (or chord tone) goes into the unit through the tuplet editor, so the group keeps its ratio.
    if (noteInputModeRef.current && (target.mode === 'replace' || target.mode === 'chord') && !input.guitar && !input.notehead) {
      const slot = findEventReference(coreDocument, {
        coreMeasureId: target.measureId ?? null,
        corePartId: target.corePartId ?? null,
        measureNumber: target.measureNumber,
        staffIndex: target.staffIndex,
        voiceId: target.voiceId,
        timestampNum: target.timestampNum,
        timestampDen: target.timestampDen,
      })?.event ?? null;
      const slotInTuplet = Boolean(slot && coreDocument?.tuplets.some((tuplet) => tuplet.eventIds.includes(slot.id)));
      if (slot && slotInTuplet && slot.durationType === durationType && Boolean(slot.isDotted) === dotted) {
        const unitCommands: ScoreCommand[] = [{
          type: 'editTupletUnit',
          action: target.mode === 'chord' && slot.kind === 'note' ? 'chord' : 'pitch',
          step: target.step,
          alter: target.alter,
          octave: target.octave,
          coreEntityId: slot.id,
          coreMeasureId: target.measureId ?? null,
          corePartId: target.corePartId ?? null,
          measureNumber: target.measureNumber,
          staffIndex: target.staffIndex,
          voiceId: slot.voiceId,
          timestampNum: slot.timestampNum,
          timestampDen: slot.timestampDen,
        }];
        const unitNext = applyEditorCommands(unitCommands);
        const unitRejection = unitNext.diagnostics.find((entry) => entry.code === 'tuplet_command_rejected');
        if (unitNext.xml === xml || unitRejection) {
          warnRejectedEdit(label, {
            rejectionReason: unitRejection?.message ?? 'The tuplet unit could not take this pitch.',
            target,
          });
          return false;
        }
        const unitLocator = {
          coreEntityId: slot.id,
          coreMeasureId: target.measureId ?? null,
          corePartId: target.corePartId ?? null,
          measureNumber: target.measureNumber,
          staffIndex: target.staffIndex,
          voiceId: slot.voiceId,
          timestampNum: slot.timestampNum,
          timestampDen: slot.timestampDen,
        };
        commitNoteInputUpdate(unitCommands, unitNext.coreDocument, unitLocator, advanceFrom, {
          isRest: false,
          step: target.step,
          octave: target.octave,
          alter: target.alter,
        }, {
          audition: input.audition,
          advanceCursor: target.mode !== 'chord',
        });
        if (input.writtenAccidental) setSelectedAccidentalLive(null);
        return true;
      }
      // A value that starts on plain time and reaches into a tuplet of the voice takes the same
      // road: the gap removes the tuplet as a whole instead of cutting one of its units.
      const reachesTuplet = (() => {
        if (!slot || slotInTuplet || target.mode !== 'replace' || !coreDocument?.tuplets.length) return false;
        const value = WHOLE_NOTE_FRACTION[durationType];
        if (!value) return false;
        const start = target.timestampNum / Math.max(target.timestampDen, 1);
        const end = start + value * (dotted ? 1.5 : 1);
        const tupletEventIds = new Set(coreDocument.tuplets.flatMap((tuplet) => tuplet.eventIds));
        const voiceEvents = findEventReference(coreDocument, {
          coreMeasureId: target.measureId ?? null,
          corePartId: target.corePartId ?? null,
          measureNumber: target.measureNumber,
          staffIndex: target.staffIndex,
          voiceId: target.voiceId,
          timestampNum: target.timestampNum,
          timestampDen: target.timestampDen,
        })?.measure.voices.find((voice) => voice.voiceId === target.voiceId)?.events ?? [];
        return voiceEvents.some((event) => {
          const onset = event.timestampNum / Math.max(event.timestampDen, 1);
          return tupletEventIds.has(event.id) && onset > start + 1e-9 && onset < end - 1e-9;
        });
      })();
      if (slot && reachesTuplet && commitOverwrite(slot)) return true;
      // Another value on a tuplet unit (F30): the tuplet cannot keep its shape. The core removes it
      // as a whole from its first unit and rejects the entry on a later one.
      if (slot && slotInTuplet && target.mode === 'replace') {
        if (commitOverwrite(slot)) return true;
        // eslint-disable-next-line no-console
        console.warn('[nex-note:note-editor] edit rejected', { context: label, rejectionReason: 'tuplet-unit-value', target });
        return false;
      }
    }

    const inspected = inspectResolvedEditTarget({
      coreDocument,
      target,
      durationType,
      isDotted: dotted,
    });
    if (!inspected.target) {
      // Keyboard step-time entry longer than the rest of the bar (MuseScore): split at the barline
      // into a note filling this bar tied to the remainder in the next bar, as one action. Pointer
      // entry keeps rejecting, because its ghost previews a single-bar note.
      if (
        noteInputModeRef.current
        && inspected.rejectionReason === 'overflow-rejected'
        && (target.mode === 'replace' || target.diagnostics.includes('keyboard-cross-voice-cursor'))
        && target.source === 'keyboard'
        && !input.guitar
      ) {
        const slotReference = findEventReference(coreDocument, {
          coreMeasureId: target.measureId ?? null,
          corePartId: target.corePartId ?? null,
          measureNumber: target.measureNumber,
          staffIndex: target.staffIndex,
          voiceId: target.voiceId,
          timestampNum: target.timestampNum,
          timestampDen: target.timestampDen,
        });
        // A cursor from another voice may sit inside a rest of this one, with no event at its onset.
        const exactSlot = slotReference?.event.voiceId === target.voiceId
          && timestampsEqual(slotReference.event.timestampNum, slotReference.event.timestampDen, target.timestampNum, target.timestampDen)
          ? slotReference.event
          : null;
        const reference = slotReference ?? (() => {
          const part = coreDocument?.score.parts.find((entry) => entry.id === target.corePartId);
          const staff = part?.staves.find((entry) => entry.staffIndex === target.staffIndex);
          const measure = staff?.measures.find((entry) => entry.measureNumber === target.measureNumber);
          return part && staff && measure ? { part, staff, measure } : null;
        })();
        const timing = reference
          ? getEffectiveMeasureTimingFromStaff(reference.staff, { measureId: reference.measure.id, measureNumber: reference.measure.measureNumber })
          : null;
        const nextMeasure = reference?.staff.measures.find((entry) => entry.measureNumber === reference.measure.measureNumber + 1) ?? null;
        const nextVoiceStart = nextMeasure?.voices
          .find((voice) => voice.voiceId === target.voiceId)
          ?.events.find((event) => event.timestampNum === 0 && !event.isChord) ?? null;
        const slotInTuplet = Boolean(exactSlot && coreDocument?.tuplets.some((tuplet) => tuplet.eventIds.includes(exactSlot.id)));
        // A voice with no event in the next bar yet (voice 2 started in this bar) is created by the
        // insert. A replace-mode slot keeps requiring the event it overwrites.
        if (reference && timing && nextMeasure && (exactSlot || target.mode !== 'replace') && !slotInTuplet) {
          const divisions = timing.divisions;
          const requested = buildDurationCandidates(divisions).find((candidate) => candidate.type === durationType && candidate.dotted === dotted)?.value ?? 0;
          const slotStart = Math.round((target.timestampNum / Math.max(target.timestampDen, 1)) * divisions * 4);
          const firstPart = timing.durationDivisions - slotStart;
          const secondPart = requested - firstPart;
          if (
            firstPart > 0
            && secondPart > 0
            && isRepresentableDuration(firstPart, divisions)
            && isRepresentableDuration(secondPart, divisions)
          ) {
            const first = describeDuration(firstPart, divisions);
            const second = describeDuration(secondPart, divisions);
            const pitchFields = {
              step: target.step,
              octave: target.octave,
              alter: target.alter,
              ...(input.writtenAccidental ? { writtenAccidental: input.writtenAccidental } : {}),
            };
            const thisBar = {
              coreMeasureId: reference.measure.id,
              corePartId: reference.part.id,
              measureNumber: reference.measure.measureNumber,
              staffIndex: reference.staff.staffIndex,
              voiceId: target.voiceId,
              timestampNum: target.timestampNum,
              timestampDen: target.timestampDen,
            };
            const nextBar = {
              coreMeasureId: nextMeasure.id,
              corePartId: reference.part.id,
              measureNumber: nextMeasure.measureNumber,
              staffIndex: reference.staff.staffIndex,
              voiceId: target.voiceId,
              timestampNum: 0,
              timestampDen: nextVoiceStart?.timestampDen ?? Math.max(divisions * 4, 1),
            };
            const splitCommands: ScoreCommand[] = [
              ...(exactSlot ? [{ type: 'replaceWithRest' as const, coreEntityId: exactSlot.id, ...thisBar, durationType: first.type, isDotted: first.dotted }] : []),
              { type: 'insertNoteAt', ...thisBar, ...pitchFields, durationType: first.type, isDotted: first.dotted, asChord: false, preserveOverflow: false },
              ...(nextVoiceStart ? [{ type: 'replaceWithRest' as const, coreEntityId: nextVoiceStart.id, ...nextBar, durationType: second.type, isDotted: second.dotted }] : []),
              { type: 'insertNoteAt', ...nextBar, ...pitchFields, durationType: second.type, isDotted: second.dotted, asChord: false, preserveOverflow: false },
              { type: 'toggleTie', coreEntityId: null, ...thisBar, step: target.step, octave: target.octave, alter: target.alter },
            ];
            const splitNext = applyEditorCommands(splitCommands);
            if (splitNext.xml !== xml && !splitNext.diagnostics.some((entry) => entry.code.endsWith('_rejected'))) {
              commitNoteInputUpdate(splitCommands, splitNext.coreDocument, nextBar, advanceFrom, {
                isRest: false,
                step: target.step,
                octave: target.octave,
                alter: target.alter,
              }, {
                audition: input.audition,
                advanceCursor: true,
              });
              if (input.writtenAccidental) setSelectedAccidentalLive(null);
              return true;
            }
          }
        }
      }
      // Keyboard step-time entry of a value longer than the note at the cursor, with music after it
      // in the bar (F19). MuseScore `Score::setNoteRest` makes a gap of the entered value and writes
      // the note into it: the following music is overwritten, a cut note leaves a rest, and a tuplet
      // the gap reaches is removed as a whole (`makeGap`: "We have to remove the complete tuplet").
      let overwriteMessage: string | null = null;
      if (
        noteInputModeRef.current
        && String(inspected.rejectionReason ?? '').startsWith('blocking-event:')
        && target.mode === 'replace'
        && target.source === 'keyboard'
        && !input.guitar
      ) {
        const slot = {
          coreMeasureId: target.measureId ?? null,
          corePartId: target.corePartId ?? null,
          measureNumber: target.measureNumber,
          staffIndex: target.staffIndex,
          voiceId: target.voiceId,
          timestampNum: target.timestampNum,
          timestampDen: target.timestampDen,
        };
        const slotReference = findEventReference(coreDocument, slot);
        const exactSlot = slotReference?.event.voiceId === target.voiceId
          && timestampsEqual(slotReference.event.timestampNum, slotReference.event.timestampDen, target.timestampNum, target.timestampDen)
          ? slotReference.event
          : null;
        if (slotReference && exactSlot) {
          if (commitOverwrite(exactSlot)) return true;
          overwriteMessage = 'This note value does not fit over the music that follows here.';
        }
      }
      warnRejectedEdit(label, {
        ...(overwriteMessage ? { message: overwriteMessage } : {}),
        rejectionReason: inspected.rejectionReason,
        diagnostics: inspected.diagnostics,
        target,
      });
      return false;
    }

    const validatedTarget = inspected.target;
    const locator = toResolvedEditLocator(validatedTarget);
    const writtenAccidental = input.writtenAccidental;
    const commands = buildNoteEntryCommitCommands({
      target: validatedTarget,
      durationType,
      isDotted: dotted,
      existingEventKind: validatedTarget.existingEventKind ?? null,
      preserveOverflow: Boolean(validatedTarget.preserveOverflow),
      writtenAccidental,
      notehead: input.notehead,
      stem: input.stem,
      guitar: input.guitar,
    });
    const next = applyEditorCommands(commands);
    if (next.xml === xml) {
      const enteredNote = resolveRecentInputFromDocument(coreDocument, locator, {
        isRest: false,
        step: validatedTarget.step,
        octave: validatedTarget.octave,
        alter: validatedTarget.alter,
      });
      const successfulNoChangeReplace = Boolean(
        noteInputModeRef.current
        && validatedTarget.mode === 'replace'
        && enteredNote,
      );
      if (!successfulNoChangeReplace) warnNoOpEdit(label, commands[0]);
      if (enteredNote) {
        lastNoteInputRef.current = {
          ...enteredNote,
          durationType: enteredNote.durationType ?? durationType,
          isDotted: enteredNote.isDotted ?? dotted,
        };
        const rawNextSelection = successfulNoChangeReplace
          ? findNextInputPosition(coreDocument, enteredNote)
          : null;
        const nextSelection = isLocalNoteInputAdvance(enteredNote, rawNextSelection)
          ? rawNextSelection
          : null;
        const soundingNotes = getSimultaneousPitchedNotes(coreDocument, enteredNote);
        if (input.audition !== false) {
          if (options?.onActiveNotesPreview) options.onActiveNotesPreview(soundingNotes);
          else options?.onActiveNotePreview?.(enteredNote);
        }
        const selectedAfterInput = nextSelection ?? enteredNote;
        selectSingleNote(selectedAfterInput, {
          visualOnly: false,
          text: null,
          measureNumber: selectedAfterInput.measureNumber,
          staffIndex: selectedAfterInput.staffIndex,
        });
      }
      if (successfulNoChangeReplace && writtenAccidental) setSelectedAccidentalLive(null);
      return successfulNoChangeReplace;
    }

    warnPostCommitDiagnostics(label, validateScoreDocument(coreDocument), next.diagnostics, validatedTarget, commands);

    commitNoteInputUpdate(commands, next.coreDocument, locator, advanceFrom, {
      isRest: false,
      step: validatedTarget.step,
      octave: validatedTarget.octave,
      alter: validatedTarget.alter,
    }, {
      audition: input.audition,
      advanceCursor: validatedTarget.mode !== 'chord',
    });
    if (writtenAccidental) setSelectedAccidentalLive(null);
    return true;
  }, [applyEditorCommands, commitNoteInputUpdate, coreDocument, options, resolveRecentInputFromDocument, selectSingleNote, setSelectedAccidentalLive, warnNoOpEdit, warnRejectedEdit, xml]);

  const placeNoteAt = useCallback((target: ResolvedEditTarget | LegacyPointerPlacementTarget, placementOptions?: { audition?: boolean }) => {
    // A click has its preview at the place already; the pending note is for keyboard and MIDI
    // entry. The commit below is synchronous, the flag goes with this task's microtasks.
    pointerEntryRef.current = true;
    queueMicrotask(() => { pointerEntryRef.current = false; });
    const normalizedTarget = (() => {
      if ('source' in target) return target;

      const existingEvent = findEventReference(coreDocument, {
        coreMeasureId: target.coreMeasureId ?? null,
        corePartId: target.corePartId ?? null,
        measureNumber: target.measureNumber,
        staffIndex: target.staffIndex,
        voiceId: target.voiceId,
        timestampNum: target.timestampNum,
        timestampDen: target.timestampDen,
      })?.event ?? null;
      const mode = target.placementMode
        ?? (Boolean(existingEvent) && !chordInputModeRef.current ? 'replace' : 'insert');

      return {
        source: 'pointer' as const,
        mode,
        measureId: target.coreMeasureId ?? null,
        corePartId: target.corePartId ?? null,
        measureNumber: target.measureNumber,
        staffIndex: target.staffIndex,
        voiceId: target.voiceId,
        timestampNum: target.timestampNum,
        timestampDen: target.timestampDen,
        ratio: target.timestampNum / Math.max(target.timestampDen, 1),
        domX: null,
        step: target.step,
        octave: target.octave,
        alter: target.alter,
        diagnostics: ['legacy-pointer-target'],
      } satisfies ResolvedEditTarget;
    })();

    // MuseScore `NoteInput::putNote`: "if a note with the same pitch already exists in the chord,
    // remove it"; when it is the chord's only note nothing happens. Adding it again used to write the
    // pitch twice into the chord (M4a in docs/note-entry-mastery-ledger.md).
    if (normalizedTarget.mode === 'chord' && coreDocument) {
      const wantedPart = normalizedTarget.corePartId?.replace(/^part:/, '') ?? null;
      for (const part of coreDocument.score.parts) {
        if (wantedPart && part.id.replace(/^part:/, '') !== wantedPart && part.sourcePartId !== wantedPart) continue;
        const staff = part.staves.find((entry) => entry.staffIndex === normalizedTarget.staffIndex);
        const measure = staff?.measures.find((entry) => entry.id === normalizedTarget.measureId)
          ?? staff?.measures.find((entry) => entry.measureNumber === normalizedTarget.measureNumber);
        for (const voice of measure?.voices ?? []) {
          if (voice.voiceId !== normalizedTarget.voiceId && inputVoiceOf(voice.voiceId) !== normalizedTarget.voiceId) continue;
          const graceIds = new Set((coreDocument.graceNotes ?? []).map((grace) => grace.eventId));
          const tones = voice.events.filter((event) => (
            event.kind === 'note' && !graceIds.has(event.id)
            && event.timestampNum * normalizedTarget.timestampDen === normalizedTarget.timestampNum * event.timestampDen
          ));
          const same = tones.find((event) => (
            event.kind === 'note' && event.pitch.step === normalizedTarget.step
            && event.pitch.octave === normalizedTarget.octave && event.pitch.alter === normalizedTarget.alter
          ));
          if (!same || same.kind !== 'note') continue;
          if (tones.length > 1) {
            const removal: ScoreCommand[] = [{
              type: 'deleteNote',
              coreEntityId: same.id,
              step: same.pitch.step,
              octave: same.pitch.octave,
              alter: same.pitch.alter,
              isRest: false,
              coreMeasureId: measure!.id,
              corePartId: part.id,
              measureNumber: measure!.measureNumber,
              staffIndex: staff!.staffIndex,
              voiceId: voice.voiceId,
              timestampNum: same.timestampNum,
              timestampDen: same.timestampDen,
            }];
            const cursor = selectedNoteRef.current ?? selectedNote;
            if (applyEditorCommands(removal).xml !== xml) {
              onApplyCommands(removal, cursor ? { selectionAnchor: toSelectionAnchor(cursor, [cursor]) } : undefined);
            }
          }
          return;
        }
      }
    }

    const advanceFrom = lastNoteInputRef.current ?? selectedNoteRef.current ?? selectedNote ?? {
      measureNumber: normalizedTarget.measureNumber,
      staffIndex: normalizedTarget.staffIndex,
      voiceId: normalizedTarget.voiceId,
      timestampNum: normalizedTarget.timestampNum,
      timestampDen: normalizedTarget.timestampDen,
      step: normalizedTarget.step,
      octave: normalizedTarget.octave,
      alter: normalizedTarget.alter,
      isRest: false,
      graphicalNote: null,
    };
    if (readClientVisualDebugEnabled()) {
      console.groupCollapsed(
        '[nex-note manual-commit]',
        `m${normalizedTarget.measureNumber}`,
        `staff=${normalizedTarget.staffIndex}`,
        `voice=${normalizedTarget.voiceId}`,
        `ts=${normalizedTarget.timestampNum}/${normalizedTarget.timestampDen}`,
        `pitch=${normalizedTarget.step}${normalizedTarget.alter === 1 ? '#' : normalizedTarget.alter === -1 ? 'b' : ''}${normalizedTarget.octave}`,
      );
      console.log('normalizedTarget', normalizedTarget);
      console.log('durationState', {
        duration: selectedDurationRef.current,
        dotted: isDottedRef.current,
        chordInputMode: chordInputModeRef.current,
      });
      console.log('advanceFrom', {
        measureNumber: advanceFrom.measureNumber,
        staffIndex: advanceFrom.staffIndex,
        voiceId: advanceFrom.voiceId,
        timestamp: `${advanceFrom.timestampNum}/${advanceFrom.timestampDen}`,
        pitch: advanceFrom.isRest ? 'rest' : `${advanceFrom.step}${advanceFrom.alter === 1 ? '#' : advanceFrom.alter === -1 ? 'b' : ''}${advanceFrom.octave}`,
      });
      console.groupEnd();
    }
    commitResolvedNoteEntry({
      target: normalizedTarget,
      audition: placementOptions?.audition,
      duration: selectedDurationRef.current,
      dotted: isDottedRef.current,
      label: 'placeNoteAt',
      advanceFrom,
      writtenAccidental: selectedAccidentalRef.current ?? undefined,
      notehead: leadsheetModeRef.current ? 'slash' : undefined,
      stem: leadsheetModeRef.current ? 'none' : undefined,
    });
  }, [applyEditorCommands, commitResolvedNoteEntry, coreDocument, onApplyCommands, selectedNote, xml]);

  const insertNote = useCallback((step: string, octave: number, options?: {
    alter?: number;
    asChord?: boolean;
    insertAtCursor?: boolean;
    /** Entry position to use instead of the selection (the input cursor in another voice). */
    target?: SelectedNote | null;
    duration?: NoteDuration;
    dotted?: boolean;
    notehead?: 'slash';
    stem?: 'none';
    writtenAccidental?: WrittenAccidental;
    guitar?: { string: 1 | 2 | 3 | 4 | 5 | 6; fret: number; tuning?: string; techniques?: string[] };
  }) => {
    const effectiveDuration = options?.duration ?? selectedDurationRef.current;
    const effectiveDotted = options?.dotted ?? isDottedRef.current;
    const alter = options?.alter ?? writtenAccidentalToAlter(selectedAccidentalRef.current);
    const forceChord = options?.asChord ?? false;
    const insertAtCursor = options?.insertAtCursor ?? false;
    const targetNote = options?.target
      ?? (insertAtCursor && noteInputModeRef.current
        ? (lastNoteInputRef.current ?? selectedNoteRef.current ?? selectedNote)
        : (selectedNoteRef.current ?? selectedNote));
    if (!targetNote) return;
    const selectedTiming = resolveEventTimingFromDocument(coreDocument, {
      coreMeasureId: targetNote.coreMeasureId ?? null,
      corePartId: targetNote.corePartId ?? null,
      measureNumber: targetNote.measureNumber,
      staffIndex: targetNote.staffIndex,
      voiceId: targetNote.voiceId,
      timestampNum: targetNote.timestampNum,
      timestampDen: targetNote.timestampDen,
    });
    const resolvedTarget = resolveKeyboardEditTarget({
      anchor: {
        coreMeasureId: targetNote.coreMeasureId ?? null,
        corePartId: targetNote.corePartId ?? null,
        measureNumber: targetNote.measureNumber,
        staffIndex: targetNote.staffIndex,
        voiceId: targetNote.voiceId,
        timestampNum: targetNote.timestampNum,
        timestampDen: targetNote.timestampDen,
      },
      pitch: {
        step,
        octave,
        alter,
      },
      entryMode: entryModeRef.current,
      noteInputMode: noteInputModeRef.current,
      chordInputMode: chordInputModeRef.current,
      selectedVoice: storedInputVoiceAt(targetNote),
      selectedTiming: selectedTiming ? {
        timestampNum: selectedTiming.timestampNum,
        timestampDen: selectedTiming.timestampDen,
        durationDivisions: selectedTiming.durationDivisions,
      } : null,
      forceChord,
      insertAtCursor,
    });
    if (!resolvedTarget) return;
    dbg.editor(
      `insertNote ${step}${octave} mode=${resolvedTarget.mode}`
      + ` dur=${DURATION_TYPE_MAP[effectiveDuration]} dotted=${effectiveDotted}`
      + ` voice=${resolvedTarget.voiceId}`
      + ` @m.${resolvedTarget.measureNumber} ${resolvedTarget.timestampNum}/${resolvedTarget.timestampDen}`,
    );
    setSelectedDurationLive(effectiveDuration);
    setIsDottedLive(effectiveDotted);
    commitResolvedNoteEntry({
      target: resolvedTarget,
      duration: effectiveDuration,
      dotted: effectiveDotted,
      label: 'insertNote',
      advanceFrom: targetNote,
      writtenAccidental: options?.writtenAccidental,
      notehead: options?.notehead ?? (leadsheetModeRef.current ? 'slash' : undefined),
      stem: options?.stem ?? (leadsheetModeRef.current ? 'none' : undefined),
      guitar: options?.guitar,
    });
  }, [commitResolvedNoteEntry, coreDocument, resolveEventTimingFromDocument, selectedNote, setIsDottedLive, setSelectedDurationLive]);

  const addIntervalAbove = useCallback((interval: DiatonicIntervalNumber) => {
    const targetNote = noteInputModeRef.current
      ? (lastNoteInputRef.current ?? selectedNoteRef.current ?? selectedNote)
      : (selectedNoteRef.current ?? selectedNote);
    if (!targetNote || targetNote.isRest) return;
    const keyFifths = resolveKeyFifthsAtMeasure(coreDocument, {
      measureNumber: targetNote.measureNumber,
      staffIndex: targetNote.staffIndex,
      partId: targetNote.corePartId,
    });
    const pitch = resolveDiatonicIntervalAbove(targetNote, interval, keyFifths);
    insertNote(pitch.step, pitch.octave, {
      alter: pitch.alter,
      asChord: true,
      insertAtCursor: true,
    });
  }, [coreDocument, insertNote, selectedNote]);

  const insertMidiChord = useCallback((inputPitches: MidiPitch[], inputOptions?: {
    duration?: NoteDuration;
    dotted?: boolean;
    addToMatchingChord?: boolean;
    insertAtCursor?: boolean;
    advanceCursor?: boolean;
  }) => {
    if (!noteInputModeRef.current) return false;
    let pitches = [...new Map(inputPitches.map((pitch) => [pitch.midi, pitch])).values()]
      .sort((left, right) => left.midi - right.midi);
    if (pitches.length === 0) return false;
    if (inputByDurationModeRef.current && !inputOptions) {
      setPreparedDurationRestLive(false);
      setPreparedDurationPitchesLive(pitches);
      return true;
    }

    // The input cursor is the target. After a typed letter the last input is the note just
    // entered (its octave reference), not the cursor, so a MIDI key or an M-mode commit that
    // followed it used to replace that note.
    const targetNote = selectedNoteRef.current ?? lastNoteInputRef.current ?? selectedNote;
    if (!targetNote) return false;
    const lastEntered = inputOptions?.advanceCursor !== false ? beyondScoreCursor() : null;
    if (lastEntered) {
      return enterBeyondScore(lastEntered, pitches, {
        duration: inputOptions?.duration ?? selectedDurationRef.current,
        dotted: inputOptions?.dotted ?? isDottedRef.current,
      });
    }
    const selectedTiming = resolveEventTimingFromDocument(coreDocument, {
      coreMeasureId: targetNote.coreMeasureId ?? null,
      corePartId: targetNote.corePartId ?? null,
      measureNumber: targetNote.measureNumber,
      staffIndex: targetNote.staffIndex,
      voiceId: targetNote.voiceId,
      timestampNum: targetNote.timestampNum,
      timestampDen: targetNote.timestampDen,
    });
    const duration = inputOptions?.duration ?? selectedDurationRef.current;
    const dotted = inputOptions?.dotted ?? isDottedRef.current;
    const durationType = DURATION_TYPE_MAP[duration];
    const initialPitch = pitches[0]!;
    let firstTarget = resolveKeyboardEditTarget({
      anchor: {
        coreMeasureId: targetNote.coreMeasureId ?? null,
        corePartId: targetNote.corePartId ?? null,
        measureNumber: targetNote.measureNumber,
        staffIndex: targetNote.staffIndex,
        voiceId: targetNote.voiceId,
        timestampNum: targetNote.timestampNum,
        timestampDen: targetNote.timestampDen,
      },
      pitch: initialPitch,
      entryMode: entryModeRef.current,
      noteInputMode: true,
      chordInputMode: false,
      selectedVoice: storedInputVoiceAt(targetNote),
      selectedTiming: selectedTiming ? {
        timestampNum: selectedTiming.timestampNum,
        timestampDen: selectedTiming.timestampDen,
        durationDivisions: selectedTiming.durationDivisions,
      } : null,
      insertAtCursor: inputOptions?.insertAtCursor,
    });
    if (!firstTarget) return false;

    const existingAtTarget = findEventReference(coreDocument, {
      coreMeasureId: firstTarget.measureId,
      corePartId: firstTarget.corePartId,
      measureNumber: firstTarget.measureNumber,
      staffIndex: firstTarget.staffIndex,
      voiceId: firstTarget.voiceId,
      timestampNum: firstTarget.timestampNum,
      timestampDen: firstTarget.timestampDen,
    })?.event ?? null;
    if (
      inputOptions?.addToMatchingChord
      && existingAtTarget?.kind === 'note'
      && existingAtTarget.durationType === durationType
      && Boolean(existingAtTarget.isDotted) === dotted
    ) {
      const matchingTarget = firstTarget;
      const existingMidis = new Set(getSimultaneousPitchedNotes(coreDocument, {
        ...targetNote,
        voiceId: matchingTarget.voiceId,
        timestampNum: matchingTarget.timestampNum,
        timestampDen: matchingTarget.timestampDen,
      }).filter((note) => note.voiceId === matchingTarget.voiceId).map((note) => (
        prepareDurationPitch({ step: note.step, octave: note.octave, alter: note.alter }).midi
      )));
      pitches = pitches.filter((pitch) => !existingMidis.has(pitch.midi));
      if (pitches.length === 0) return false;
      firstTarget = {
        ...firstTarget,
        mode: 'chord',
        step: pitches[0]!.step,
        octave: pitches[0]!.octave,
        alter: pitches[0]!.alter,
        relativeAfterTimestampNum: undefined,
        relativeAfterTimestampDen: undefined,
        existingEventKind: 'note',
        existingEventStartsAtTarget: true,
        diagnostics: [...firstTarget.diagnostics, 'input-by-duration-matching-chord'],
      };
    }
    const firstPitch = pitches[0]!;
    const inspected = inspectResolvedEditTarget({
      coreDocument,
      target: firstTarget,
      durationType,
      isDotted: dotted,
    });
    if (!inspected.target) {
      warnRejectedEdit('insertMidiChord', {
        rejectionReason: inspected.rejectionReason,
        diagnostics: inspected.diagnostics,
        target: firstTarget,
      });
      return false;
    }

    const validatedTarget = inspected.target;
    const commands = buildNoteEntryCommitCommands({
      target: validatedTarget,
      durationType,
      isDotted: dotted,
      existingEventKind: validatedTarget.existingEventKind ?? null,
      preserveOverflow: Boolean(validatedTarget.preserveOverflow),
      writtenAccidental: (firstPitch as PreparedDurationPitch).writtenAccidental,
    });
    for (const pitch of pitches.slice(1)) {
      commands.push(...buildNoteEntryCommitCommands({
        target: {
          ...validatedTarget,
          mode: 'chord',
          step: pitch.step,
          octave: pitch.octave,
          alter: pitch.alter,
          relativeAfterTimestampNum: undefined,
          relativeAfterTimestampDen: undefined,
          existingEventKind: 'note',
          existingEventStartsAtTarget: true,
          diagnostics: [...validatedTarget.diagnostics, 'midi-simultaneous-chord'],
        },
        durationType,
        isDotted: dotted,
        existingEventKind: 'note',
        writtenAccidental: (pitch as PreparedDurationPitch).writtenAccidental,
      }));
    }

    const next = applyEditorCommands(commands);
    if (!next.appliedCommands.length || next.diagnostics.some(d => d.code.endsWith('_rejected'))) {
      return false;
    }

    warnPostCommitDiagnostics(
      'insertMidiChord',
      validateScoreDocument(coreDocument),
      next.diagnostics,
      validatedTarget,
      commands,
    );
    return commitNoteInputUpdate(
      commands,
      next.xml === xml ? coreDocument : next.coreDocument,
      toResolvedEditLocator(validatedTarget),
      targetNote,
      {
        isRest: false,
        step: firstPitch.step,
        octave: firstPitch.octave,
        alter: firstPitch.alter,
      },
      {
        advanceCursor: inputOptions?.advanceCursor !== false,
        useAdvancedSelectionAsInputAnchor: inputOptions?.advanceCursor !== false,
        enteredValue: { duration, dotted },
        // Confirming the pitch already at this onset is still a performed MIDI
        // input. Advance/audition it without inventing an Undo transaction.
        skipHistory: next.xml === xml,
      },
    );
  }, [applyEditorCommands, beyondScoreCursor, commitNoteInputUpdate, coreDocument, enterBeyondScore, resolveEventTimingFromDocument, selectedNote, setPreparedDurationPitchesLive, setPreparedDurationRestLive, warnNoOpEdit, warnRejectedEdit, xml]);

  const commitPreparedDurationPitches = useCallback((duration: NoteDuration) => {
    const pitches = preparedDurationPitchesRef.current;
    if (!inputByDurationModeRef.current || pitches.length === 0) return false;
    const anchor = selectedNoteRef.current ?? lastNoteInputRef.current ?? selectedNote;
    const committed = insertMidiChord(pitches, {
      duration,
      dotted: isDottedRef.current,
      addToMatchingChord: true,
      insertAtCursor: Boolean(anchor && storedInputVoiceAt(anchor) !== anchor.voiceId),
    });
    if (committed) setSelectedDurationLive(duration);
    return committed;
  }, [insertMidiChord, selectedNote, setSelectedDurationLive]);

  const insertTiedNote = useCallback(() => {
    if (!noteInputModeRef.current) return false;
    const visibleSelection = selectedNoteRef.current ?? selectedNote;
    const sourceAnchor = lastNoteInputRef.current ?? visibleSelection;
    if (!sourceAnchor || sourceAnchor.isRest) return false;

    // Grace notes share the onset of their main note but are not part of its chord.
    const graceEventIds = new Set((coreDocument?.graceNotes ?? []).map((entry) => entry.eventId));
    const sourceChord = getSimultaneousPitchedNotes(coreDocument, sourceAnchor)
      .filter((note) => note.voiceId === sourceAnchor.voiceId)
      .filter((note) => !note.coreEntityId || !graceEventIds.has(note.coreEntityId))
      .sort((left, right) => (
        diatonicPitchIndex(left.step, left.octave) - diatonicPitchIndex(right.step, right.octave)
        || left.alter - right.alter
      ));
    if (sourceChord.length === 0) return false;

    const sourceTieCommands: ScoreCommand[] = [];
    sourceChord.forEach((pitch) => {
      const sourceEvent = findEventReference(coreDocument, pitch)?.event;
      if (sourceEvent?.kind === 'note' && !sourceEvent.tieStart) {
        sourceTieCommands.push({
          type: 'toggleTie',
          coreEntityId: pitch.coreEntityId ?? null,
          coreMeasureId: pitch.coreMeasureId ?? null,
          corePartId: pitch.corePartId ?? null,
          step: pitch.step,
          octave: pitch.octave,
          alter: pitch.alter,
          measureNumber: pitch.measureNumber,
          staffIndex: pitch.staffIndex,
          voiceId: pitch.voiceId,
          timestampNum: pitch.timestampNum,
          timestampDen: pitch.timestampDen,
        });
      }
    });

    const selectedIsNextSlot = Boolean(
      visibleSelection
      && isLocalNoteInputAdvance(sourceAnchor, visibleSelection),
    );
    const targetAnchor = selectedIsNextSlot
      ? visibleSelection
      : findNextRhythmicSelection(coreDocument, sourceAnchor);
    if (!targetAnchor || !isLocalNoteInputAdvance(sourceAnchor, targetAnchor)) {
      // MuseScore EditTie::cmdAddTie: past the end of the score `T` appends a bar and ties into it.
      const atEnd = beyondScoreCursor();
      if (!targetAnchor && atEnd && sameRhythmicPosition(atEnd, sourceAnchor)) {
        return enterBeyondScore(
          atEnd,
          sourceChord.map((pitch) => ({ step: pitch.step, octave: pitch.octave, alter: pitch.alter })),
          undefined,
          sourceTieCommands,
        );
      }
      warnRejectedEdit('insertTiedNote', {
        rejectionReason: 'next-rhythmic-slot-missing',
        source: sourceAnchor,
      });
      return false;
    }

    const durationType = DURATION_TYPE_MAP[selectedDurationRef.current];
    const dotted = isDottedRef.current;
    const firstPitch = sourceChord[0]!;
    const target: ResolvedEditTarget = {
      source: 'keyboard',
      mode: 'replace',
      measureId: targetAnchor.coreMeasureId ?? null,
      corePartId: targetAnchor.corePartId ?? null,
      measureNumber: targetAnchor.measureNumber,
      staffIndex: targetAnchor.staffIndex,
      voiceId: sourceAnchor.voiceId,
      timestampNum: targetAnchor.timestampNum,
      timestampDen: targetAnchor.timestampDen,
      ratio: targetAnchor.timestampNum / Math.max(targetAnchor.timestampDen, 1),
      domX: null,
      step: firstPitch.step,
      octave: firstPitch.octave,
      alter: firstPitch.alter,
      diagnostics: ['tied-note-input', 'tied-chord-replace'],
    };
    const inspected = inspectResolvedEditTarget({
      coreDocument,
      target,
      durationType,
      isDotted: dotted,
    });
    if (!inspected.target) {
      warnRejectedEdit('insertTiedNote', {
        rejectionReason: inspected.rejectionReason,
        diagnostics: inspected.diagnostics,
        target,
      });
      return false;
    }

    const validatedTarget = inspected.target;
    const targetLocator = toResolvedEditLocator(validatedTarget);
    // The tied note lands on a tuplet unit of the armed value: write it into the unit, so the tuplet
    // keeps its ratio (the plain value of that name is longer than the unit).
    const targetSlot = findEventReference(coreDocument, {
      coreMeasureId: validatedTarget.measureId ?? null,
      corePartId: validatedTarget.corePartId ?? null,
      measureNumber: validatedTarget.measureNumber,
      staffIndex: validatedTarget.staffIndex,
      voiceId: validatedTarget.voiceId,
      timestampNum: validatedTarget.timestampNum,
      timestampDen: validatedTarget.timestampDen,
    })?.event ?? null;
    const targetIsTupletUnit = Boolean(
      targetSlot
      && coreDocument?.tuplets.some((tuplet) => tuplet.eventIds.includes(targetSlot.id))
      && targetSlot.durationType === durationType
      && Boolean(targetSlot.isDotted) === dotted,
    );
    const commands: ScoreCommand[] = targetIsTupletUnit && targetSlot ? sourceChord.map((pitch, index) => ({
      type: 'editTupletUnit' as const,
      action: index > 0 ? 'chord' as const : 'pitch' as const,
      step: pitch.step,
      alter: pitch.alter,
      octave: pitch.octave,
      coreEntityId: targetSlot.id,
      coreMeasureId: validatedTarget.measureId ?? null,
      corePartId: validatedTarget.corePartId ?? null,
      measureNumber: validatedTarget.measureNumber,
      staffIndex: validatedTarget.staffIndex,
      voiceId: targetSlot.voiceId,
      timestampNum: targetSlot.timestampNum,
      timestampDen: targetSlot.timestampDen,
    })) : [{
      type: 'replaceWithRest',
      coreEntityId: targetAnchor.coreEntityId ?? null,
      coreMeasureId: targetAnchor.coreMeasureId ?? null,
      corePartId: targetAnchor.corePartId ?? null,
      measureNumber: validatedTarget.measureNumber,
      staffIndex: validatedTarget.staffIndex,
      voiceId: validatedTarget.voiceId,
      timestampNum: validatedTarget.timestampNum,
      timestampDen: validatedTarget.timestampDen,
      durationType,
      isDotted: dotted,
    }];
    if (!targetIsTupletUnit) sourceChord.forEach((pitch, index) => {
      commands.push({
        type: 'insertNoteAt',
        coreMeasureId: validatedTarget.measureId,
        corePartId: validatedTarget.corePartId,
        measureNumber: validatedTarget.measureNumber,
        staffIndex: validatedTarget.staffIndex,
        voiceId: validatedTarget.voiceId,
        timestampNum: validatedTarget.timestampNum,
        timestampDen: validatedTarget.timestampDen,
        step: pitch.step,
        octave: pitch.octave,
        alter: pitch.alter,
        durationType,
        isDotted: dotted,
        asChord: index > 0,
        preserveOverflow: false,
        guitar: pitch.guitar,
      });
    });
    commands.push(...sourceTieCommands);

    const next = applyEditorCommands(commands);
    if (next.xml === xml) {
      warnNoOpEdit('insertTiedNote', commands[0]!);
      return false;
    }
    warnPostCommitDiagnostics(
      'insertTiedNote',
      validateScoreDocument(coreDocument),
      next.diagnostics,
      validatedTarget,
      commands,
    );
    commitNoteInputUpdate(
      commands,
      next.coreDocument,
      targetLocator,
      targetAnchor,
      {
        isRest: false,
        step: firstPitch.step,
        octave: firstPitch.octave,
        alter: firstPitch.alter,
      },
    );
    return true;
  }, [applyEditorCommands, beyondScoreCursor, commitNoteInputUpdate, coreDocument, enterBeyondScore, selectedNote, warnNoOpEdit, warnRejectedEdit, xml]);

  const insertGuitarFret = useCallback((string: GuitarStringNumber, fret: number, tuningId = selectedGuitarTuningRef.current) => {
    const tuning = resolveGuitarTuning(tuningId);
    const pitch: GuitarFretPitch = resolveGuitarFretPitch(string, fret, tuning);
    const targetNote = selectedNoteRef.current ?? selectedNote;
    const replaceSelectedTabNote = Boolean(targetNote && !targetNote.isRest && targetNote.guitar);
    const preservedTechniques = (!noteInputModeRef.current || replaceSelectedTabNote) && targetNote && !targetNote.isRest
      ? targetNote.guitar?.techniques
      : undefined;
    setSelectedGuitarStringLive(string);
    setSelectedGuitarFretLive(pitch.fret);
    setSelectedGuitarTuningLive(tuning.id);
    setGuitarFretBufferLive('');
    setGuitarInputModeLive(true);
    if (replaceSelectedTabNote && targetNote && !targetNote.isRest && targetNote.guitar) {
      const commands: ScoreCommand[] = [{
        type: 'setGuitarFret',
        coreEntityId: targetNote.coreEntityId ?? null,
        coreMeasureId: targetNote.coreMeasureId ?? null,
        corePartId: targetNote.corePartId ?? null,
        step: targetNote.step,
        octave: targetNote.octave,
        alter: targetNote.alter,
        measureNumber: targetNote.measureNumber,
        staffIndex: targetNote.staffIndex,
        voiceId: targetNote.voiceId,
        timestampNum: targetNote.timestampNum,
        timestampDen: targetNote.timestampDen,
        string,
        fret: pitch.fret,
        tuning: tuning.id,
        techniques: preservedTechniques,
      }];
      const next = applyEditorCommands(commands);
      if (next.xml === xml) {
        warnNoOpEdit('insertGuitarFret', commands[0]!);
        return;
      }
      onApplyCommands(commands, { selectionAnchor: toSelectionAnchor(targetNote, selectedNotesRef.current) });
      const updated = {
        ...targetNote,
        step: pitch.step,
        octave: pitch.octave,
        alter: pitch.alter,
        guitar: {
          ...targetNote.guitar,
          string,
          fret: pitch.fret,
          tuning: tuning.id,
          techniques: preservedTechniques,
        },
      };
      setSelectedNoteLive(updated);
      selectedNotesRef.current = selectedNotesRef.current.length > 0
        ? selectedNotesRef.current.map((note) => selectedNotesEqual(note, targetNote) ? updated : note)
        : [updated];
      setSelectedNotes(selectedNotesRef.current);
      lastSelectedRef.current = updated;
      return;
    }
    insertNote(pitch.step, pitch.octave, {
      alter: pitch.alter,
      insertAtCursor: noteInputModeRef.current && !replaceSelectedTabNote,
      guitar: {
        string,
        fret: pitch.fret,
        tuning: tuning.id,
        techniques: preservedTechniques,
      },
    });
  }, [applyEditorCommands, insertNote, onApplyCommands, selectedNote, setGuitarFretBufferLive, setGuitarInputModeLive, setSelectedGuitarFretLive, setSelectedGuitarStringLive, setSelectedGuitarTuningLive, setSelectedNoteLive, warnNoOpEdit, xml]);

  const setGuitarFretAtNote = useCallback((targetNote: SelectedNote, fret: number, tuningId?: GuitarTuningId) => {
    if (!targetNote.guitar || targetNote.isRest) return;
    const tuning = resolveGuitarTuning(targetNote.guitar.tuning ?? tuningId ?? selectedGuitarTuningRef.current);
    const commandTuning = targetNote.guitar.tuning || tuningId ? tuning.id : undefined;
    const pitch = resolveGuitarFretPitch(targetNote.guitar.string, fret, tuning);
    const commands: ScoreCommand[] = [{
      type: 'setGuitarFret',
      coreEntityId: targetNote.coreEntityId ?? null,
      coreMeasureId: targetNote.coreMeasureId ?? null,
      corePartId: targetNote.corePartId ?? null,
      step: targetNote.step,
      octave: targetNote.octave,
      alter: targetNote.alter,
      measureNumber: targetNote.measureNumber,
      staffIndex: targetNote.staffIndex,
      voiceId: targetNote.voiceId,
      timestampNum: targetNote.timestampNum,
      timestampDen: targetNote.timestampDen,
      string: targetNote.guitar.string,
      fret: pitch.fret,
      tuning: commandTuning,
      techniques: targetNote.guitar.techniques,
    }];
    const next = applyEditorCommands(commands);
    if (next.xml === xml) {
      warnNoOpEdit('setGuitarFret', commands[0]!);
      return;
    }
    setSelectedGuitarStringLive(targetNote.guitar.string);
    setSelectedGuitarFretLive(pitch.fret);
    setSelectedGuitarTuningLive(tuning.id);
    setGuitarFretBufferLive('');
    setGuitarInputModeLive(true);
    onApplyCommands(commands, { selectionAnchor: toSelectionAnchor(targetNote, selectedNotesRef.current) });
    const updated = {
      ...targetNote,
      step: pitch.step,
      octave: pitch.octave,
      alter: pitch.alter,
      guitar: {
        ...targetNote.guitar,
        string: targetNote.guitar.string,
        fret: pitch.fret,
        tuning: commandTuning,
        techniques: targetNote.guitar.techniques,
      },
    };
    if (selectedNoteRef.current && selectedNotesEqual(selectedNoteRef.current, targetNote)) {
      setSelectedNoteLive(updated);
      const updatedSelection = selectedNotesRef.current.length > 0
        ? selectedNotesRef.current.map((note) => selectedNotesEqual(note, targetNote) ? updated : note)
        : [updated];
      selectedNotesRef.current = updatedSelection;
      setSelectedNotes(updatedSelection);
      lastSelectedRef.current = updated;
    }
  }, [
    applyEditorCommands,
    onApplyCommands,
    setSelectedNoteLive,
    setGuitarFretBufferLive,
    setGuitarInputModeLive,
    setSelectedGuitarFretLive,
    setSelectedGuitarStringLive,
    setSelectedGuitarTuningLive,
    warnNoOpEdit,
    xml,
  ]);

  const toggleGuitarTechnique = useCallback((technique: GuitarTechniqueKind) => {
    const targetNote = selectedNoteRef.current ?? selectedNote;
    if (!targetNote || targetNote.isRest) return;
    const commands: ScoreCommand[] = [{
      type: 'toggleGuitarTechnique',
      coreMeasureId: targetNote.coreMeasureId ?? null,
      corePartId: targetNote.corePartId ?? null,
      measureNumber: targetNote.measureNumber,
      staffIndex: targetNote.staffIndex,
      voiceId: targetNote.voiceId,
      timestampNum: targetNote.timestampNum,
      timestampDen: targetNote.timestampDen,
      technique,
    }];
    const next = applyEditorCommands(commands);
    if (next.xml === xml) {
      warnNoOpEdit('toggleGuitarTechnique', commands[0]!);
      return;
    }
    onApplyCommands(commands, { selectionAnchor: toSelectionAnchor(targetNote, selectedNotesRef.current) });
  }, [applyEditorCommands, onApplyCommands, selectedNote, warnNoOpEdit, xml]);

  const insertSlash = useCallback(() => {
    const targetNote = selectedNoteRef.current ?? selectedNote;
    if (!targetNote) return;
    insertNote(targetNote.step || 'C', targetNote.octave || 4, {
      insertAtCursor: noteInputModeRef.current,
      notehead: 'slash',
    });
  }, [insertNote, selectedNote]);

  const setHarmonyAtSelection = useCallback((value: string, targetOverride?: SelectedNote | null) => {
    const chord = value.trim();
    const targetNote = targetOverride ?? selectedNoteRef.current ?? selectedNote;
    if (!targetNote || !chord) return false;
    const commands: ScoreCommand[] = [{
      type: 'setHarmonyAt',
      value: chord,
      corePartId: targetNote.corePartId ?? null,
      measureNumber: targetNote.measureNumber,
      staffIndex: targetNote.staffIndex,
      timestampNum: targetNote.timestampNum,
      timestampDen: targetNote.timestampDen,
    }];
    const next = applyEditorCommands(commands);
    if (next.xml === xml) {
      warnNoOpEdit('setHarmonyAtSelection', commands[0]!, {
        diagnostics: next.diagnostics,
        appliedCommands: next.appliedCommands,
      });
      return false;
    }
    onApplyCommands(commands, { selectionAnchor: noteInputModeRef.current ? null : toSelectionAnchor(targetNote, selectedNotesRef.current) });
    return true;
  }, [applyEditorCommands, onApplyCommands, selectedNote, warnNoOpEdit, xml]);

  /**
   * Commit the commands of the inline-entry popover as one Undo step. The selection (or the input
   * cursor) stays where it is. Returns the reason when the score does not accept them.
   */
  const applyInlineEntryCommands = useCallback((commands: ScoreCommand[]): { ok: boolean; message?: string } => {
    if (commands.length === 0) return { ok: true };
    const prepared = prepareDocumentCommands({ xml, coreDocument }, commands);
    const rejection = prepared.result.diagnostics.find((diagnostic) => diagnostic.code.endsWith('_rejected'));
    if (rejection) return { ok: false, message: rejection.message };
    if (prepared.result.xml === xml) return { ok: false, message: 'Nothing changed.' };
    preparedCommandsRef.current = prepared;
    const target = selectedNoteRef.current ?? selectedNote;
    const applied = onApplyCommands(commands, {
      selectionAnchor: noteInputModeRef.current || !target ? null : toSelectionAnchor(target, selectedNotesRef.current),
    });
    return applied ? { ok: true } : { ok: false, message: 'The score validation did not accept this input.' };
  }, [coreDocument, onApplyCommands, selectedNote, xml]);

  const fillSlashMeasure = useCallback(() => {
    const targetNote = selectedNoteRef.current ?? selectedNote;
    if (!targetNote) return;
    const commands: ScoreCommand[] = [{
      type: 'fillSlashMeasure',
      corePartId: targetNote.corePartId ?? null,
      measureNumber: targetNote.measureNumber,
      staffIndex: targetNote.staffIndex,
      voiceId: storedInputVoiceAt(targetNote),
      stem: 'none',
    }];
    const next = applyEditorCommands(commands);
    if (next.xml === xml) {
      warnNoOpEdit('fillSlashMeasure', commands[0]!);
      return;
    }
    onApplyCommands(commands, { selectionAnchor: noteInputModeRef.current ? null : toSelectionAnchor(targetNote, selectedNotesRef.current) });
  }, [applyEditorCommands, onApplyCommands, selectedNote, warnNoOpEdit, xml]);

  const insertRest = useCallback(() => {
    const targetNote = selectedNoteRef.current ?? selectedNote;
    if (!targetNote) return false;
    const lastEntered = beyondScoreCursor();
    if (lastEntered) return enterBeyondScore(lastEntered, null);
    dbg.editor(`insertRest mode=${entryModeRef.current} dur=${DURATION_TYPE_MAP[selectedDurationRef.current]} dotted=${isDottedRef.current} voice=${selectedVoiceRef.current} after m.${targetNote.measureNumber} ts=${targetNote.timestampNum}/${targetNote.timestampDen}`);
    const overwriteSlot = entryModeRef.current === 'overwrite' || (noteInputModeRef.current && storedInputVoiceAt(targetNote) === targetNote.voiceId);
    const selectedDurationType = DURATION_TYPE_MAP[selectedDurationRef.current];
    const advanceFromEnteredRest = (enteredRest: SelectedNote, shouldAdvance: boolean) => {
      lastNoteInputRef.current = {
        ...enteredRest,
        durationType: enteredRest.durationType ?? selectedDurationType,
        isDotted: enteredRest.isDotted ?? isDottedRef.current,
      };
      const rawNextSelection = shouldAdvance
        ? findNextInputPosition(coreDocument, enteredRest, { duration: selectedDurationRef.current, dotted: isDottedRef.current })
        : null;
      const nextSelection = isLocalNoteInputAdvance(enteredRest, rawNextSelection)
        ? rawNextSelection
        : null;
      if (options?.onActiveNotesPreview) options.onActiveNotesPreview([]);
      else options?.onActiveNotePreview?.(enteredRest);
      const selectedAfterInput = nextSelection ?? enteredRest;
      selectSingleNote(selectedAfterInput, {
        visualOnly: false,
        text: null,
        measureNumber: selectedAfterInput.measureNumber,
        staffIndex: selectedAfterInput.staffIndex,
      });
      if (shouldAdvance && !rawNextSelection) beyondScoreRef.current = enteredRest;
    };
    const matchingRestSlot = overwriteSlot
      && targetNote.isRest
      && targetNote.durationType === selectedDurationType
      && Boolean(targetNote.isDotted) === isDottedRef.current;
    if (matchingRestSlot) {
      const positionalLocator = {
        measureNumber: targetNote.measureNumber,
        staffIndex: targetNote.staffIndex,
        voiceId: targetNote.voiceId,
        timestampNum: targetNote.timestampNum,
        timestampDen: targetNote.timestampDen,
      };
      const canonicalRest = resolveRecentInputFromDocument(coreDocument, {
        ...positionalLocator,
        coreEntityId: targetNote.coreEntityId ?? null,
        coreMeasureId: targetNote.coreMeasureId ?? null,
        corePartId: targetNote.corePartId ?? null,
      }, { isRest: true })
        ?? resolveRecentInputFromDocument(coreDocument, positionalLocator, { isRest: true })
        ?? targetNote;
      advanceFromEnteredRest(canonicalRest, noteInputModeRef.current);
      return true;
    }
    // A rest typed in another voice goes to the cursor's onset in that voice.
    const crossVoiceAtCursor = !overwriteSlot && noteInputModeRef.current && storedInputVoiceAt(targetNote) !== targetNote.voiceId;
    const commands: ScoreCommand[] = crossVoiceAtCursor
      ? [{
        type: 'insertRestAt',
        coreMeasureId: targetNote.coreMeasureId ?? null,
        corePartId: targetNote.corePartId ?? null,
        measureNumber: targetNote.measureNumber,
        staffIndex: targetNote.staffIndex,
        voiceId: storedInputVoiceAt(targetNote),
        timestampNum: targetNote.timestampNum,
        timestampDen: targetNote.timestampDen,
        durationType: selectedDurationType,
        isDotted: isDottedRef.current,
      }]
      : overwriteSlot
      ? [{
        type: 'replaceWithRest',
        coreEntityId: targetNote.coreEntityId ?? null,
        coreMeasureId: targetNote.coreMeasureId ?? null,
        corePartId: targetNote.corePartId ?? null,
        measureNumber: targetNote.measureNumber,
        staffIndex: targetNote.staffIndex,
        voiceId: targetNote.voiceId,
        timestampNum: targetNote.timestampNum,
        timestampDen: targetNote.timestampDen,
        durationType: selectedDurationType,
        isDotted: isDottedRef.current,
      }]
      : [{
        type: 'insertRest',
        coreMeasureId: targetNote.coreMeasureId ?? null,
        corePartId: targetNote.corePartId ?? null,
        measureNumber: targetNote.measureNumber,
        staffIndex: targetNote.staffIndex,
        voiceId: storedInputVoiceAt(targetNote),
        afterTimestampNum: targetNote.timestampNum,
        afterTimestampDen: targetNote.timestampDen,
        durationType: selectedDurationType,
        isDotted: isDottedRef.current,
      }];
    const next = applyEditorCommands(commands);
    if (next.xml === xml) {
      if (crossVoiceAtCursor) {
        const afterSilence = findCursorAfterSilentValue(coreDocument, targetNote, storedInputVoiceAt(targetNote), { duration: selectedDurationRef.current, dotted: isDottedRef.current });
        if (afterSilence) {
          selectSingleNote(afterSilence, { visualOnly: false, text: null, measureNumber: afterSilence.measureNumber, staffIndex: afterSilence.staffIndex });
          return true;
        }
      }
      const enteredRest = overwriteSlot
        ? resolveRecentInputFromDocument(coreDocument, {
          coreEntityId: targetNote.coreEntityId ?? null,
          coreMeasureId: targetNote.coreMeasureId ?? null,
          corePartId: targetNote.corePartId ?? null,
          measureNumber: targetNote.measureNumber,
          staffIndex: targetNote.staffIndex,
          voiceId: targetNote.voiceId,
          timestampNum: targetNote.timestampNum,
          timestampDen: targetNote.timestampDen,
        }, { isRest: true })
        : null;
      const successfulNoChangeReplace = Boolean(noteInputModeRef.current && enteredRest);
      if (!successfulNoChangeReplace) warnNoOpEdit('insertRest', commands[0]!);
      if (enteredRest) advanceFromEnteredRest(enteredRest, successfulNoChangeReplace);
      return successfulNoChangeReplace;
    }
    const diagnosticTarget = {
      measureNumber: targetNote.measureNumber,
      staffIndex: targetNote.staffIndex,
      voiceId: overwriteSlot ? targetNote.voiceId : storedInputVoiceAt(targetNote),
    };
    warnPostCommitDiagnostics('insertRest', validateScoreDocument(coreDocument), next.diagnostics, diagnosticTarget, commands);
    const selectedTiming = resolveEventTimingFromDocument(coreDocument, {
      coreMeasureId: targetNote.coreMeasureId ?? null,
      corePartId: targetNote.corePartId ?? null,
      measureNumber: targetNote.measureNumber,
      staffIndex: targetNote.staffIndex,
      voiceId: targetNote.voiceId,
      timestampNum: targetNote.timestampNum,
      timestampDen: targetNote.timestampDen,
    });
    const enteredLocator = {
      coreMeasureId: targetNote.coreMeasureId ?? null,
      corePartId: targetNote.corePartId ?? null,
      measureNumber: targetNote.measureNumber,
      staffIndex: targetNote.staffIndex,
      voiceId: overwriteSlot ? targetNote.voiceId : storedInputVoiceAt(targetNote),
      timestampNum: overwriteSlot || crossVoiceAtCursor ? targetNote.timestampNum : ((selectedTiming?.timestampNum ?? targetNote.timestampNum) + (selectedTiming?.durationDivisions ?? 1)),
      timestampDen: overwriteSlot || crossVoiceAtCursor ? targetNote.timestampDen : (selectedTiming?.timestampDen ?? targetNote.timestampDen),
    };
    commitNoteInputUpdate(commands, next.coreDocument, enteredLocator, targetNote, { isRest: true });
    return true;
  }, [applyEditorCommands, commitNoteInputUpdate, coreDocument, options, resolveEventTimingFromDocument, resolveRecentInputFromDocument, selectSingleNote, selectedNote, warnNoOpEdit, xml]);

  const prepareInputByDurationRest = useCallback(() => {
    if (!inputByDurationModeRef.current) {
      insertRest();
      return;
    }
    setPreparedDurationPitchesLive([]);
    setPreparedDurationRestLive(true);
  }, [insertRest, setPreparedDurationPitchesLive, setPreparedDurationRestLive]);

  const commitPreparedDurationInput = useCallback((duration: NoteDuration) => {
    if (!inputByDurationModeRef.current) return false;
    setSelectedDurationLive(duration);
    if (preparedDurationRestRef.current) return insertRest();
    return commitPreparedDurationPitches(duration);
  }, [commitPreparedDurationPitches, insertRest, setSelectedDurationLive]);

  const setDuration = useCallback((duration: NoteDuration) => {
    if (inputByDurationModeRef.current) {
      commitPreparedDurationInput(duration);
      return;
    }
    setDurationSelection(duration);
  }, [commitPreparedDurationInput, setDurationSelection]);

  const toggleNoteInput = useCallback(() => {
    const next = !noteInputModeRef.current;
    if (next) {
      const activeSelection = selectedNoteRef.current ?? selectedNote;
      lastNoteInputRef.current = activeSelection;
      ensureNoteInputAnchor();
      setSelectedAccidentalLive(null);
    }
    if (!next) {
      setStepInputKeyboardModeLive(false);
      setInputByDurationModeLive(false);
      // Guitar fret entry requires note input; leaving guitar mode armed
      // without it makes fret digits silently act as duration shortcuts.
      setGuitarInputModeLive(false);
    }
    setNoteInputModeLive(next);
  }, [ensureNoteInputAnchor, selectedNote, setGuitarInputModeLive, setInputByDurationModeLive, setNoteInputModeLive, setSelectedAccidentalLive, setStepInputKeyboardModeLive]);

  const toggleInputByDurationMode = useCallback(() => {
    const next = !inputByDurationModeRef.current;
    if (next) {
      const enteringNoteInput = !noteInputModeRef.current;
      const activeSelection = enteringNoteInput ? (selectedNoteRef.current ?? selectedNote) : null;
      if (enteringNoteInput) lastNoteInputRef.current = activeSelection;
      ensureNoteInputAnchor();
      setNoteInputModeLive(true);
      setStepInputKeyboardModeLive(false);
      const anchor = lastNoteInputRef.current ?? selectedNoteRef.current ?? selectedNote;
      const cursor = selectedNoteRef.current ?? selectedNote ?? anchor;
      if (!preparedDurationRestRef.current && preparedDurationPitchesRef.current.length === 0) {
        const entryVoice = cursor ? storedInputVoiceAt(cursor) : selectedVoiceRef.current;
        const pitchSource = anchor && cursor && !anchor.isRest && matchesSelectionLane(anchor, { ...cursor, voiceId: entryVoice })
          ? anchor
          : cursor ? laneRegisterReference(coreDocument, cursor, entryVoice) : null;
        setPreparedDurationPitchesLive([
          prepareDurationPitch(pitchSource
            ? { step: pitchSource.step, octave: pitchSource.octave, alter: pitchSource.alter }
            : { step: 'C', octave: 4, alter: 0 }),
        ]);
      }
    }
    setInputByDurationModeLive(next);
  }, [coreDocument, ensureNoteInputAnchor, selectedNote, setInputByDurationModeLive, setNoteInputModeLive, setPreparedDurationPitchesLive, setStepInputKeyboardModeLive, storedInputVoiceAt]);

  const toggleStepInputKeyboardMode = useCallback(() => {
    const next = !stepInputKeyboardModeRef.current;
    if (next) {
      const enteringNoteInput = !noteInputModeRef.current;
      const activeSelection = enteringNoteInput ? (selectedNoteRef.current ?? selectedNote) : null;
      if (enteringNoteInput) lastNoteInputRef.current = activeSelection;
      ensureNoteInputAnchor();
      setNoteInputModeLive(true);
      setInputByDurationModeLive(false);
    }
    setStepInputKeyboardModeLive(next);
  }, [ensureNoteInputAnchor, selectedNote, setInputByDurationModeLive, setNoteInputModeLive, setStepInputKeyboardModeLive]);

  /**
   * Targets of selection commands. In MuseScore the note just entered is selected while the input
   * cursor sits after it, so articulation, grace, respell, stem and notehead keys act on that note.
   * nex-note's selection is the cursor slot; in note input with a single (cursor) selection the
   * last entered note is the target instead. Explicit range selections are kept.
   */
  const resolveEditTargets = useCallback((): { note: SelectedNote | null; notes: SelectedNote[] } => {
    const current = selectedNoteRef.current ?? selectedNote;
    const currentNotes = selectedNotesRef.current.length > 0 ? selectedNotesRef.current : selectedNotes;
    const entered = lastNoteInputRef.current;
    if (
      noteInputModeRef.current
      && entered
      && !entered.isRest
      && current
      && currentNotes.length <= 1
      && !selectedNotesPositionallyEqual(current, entered)
    ) {
      return { note: entered, notes: [] };
    }
    return { note: current, notes: currentNotes };
  }, [selectedNote, selectedNotes]);

  const toggleArticulation = useCallback((articulation: ArticulationKind) => {
    const editTargets = resolveEditTargets();
    const targets = selectedTargets(editTargets.note, editTargets.notes);
    if (!targets.length) return;
    dbg.editor(`toggleArticulation ${articulation} count=${targets.length}`);
    const commands = targets.map((loc) => ({ type: 'toggleArticulation' as const, articulation, coreMeasureId: loc.coreMeasureId ?? null, corePartId: loc.corePartId ?? null, measureNumber: loc.measureNumber, staffIndex: loc.staffIndex, voiceId: loc.voiceId, timestampNum: loc.timestampNum, timestampDen: loc.timestampDen }));
    const next = applyEditorCommands(commands);
    if (next.xml === xml) {
      warnNoOpEdit('toggleArticulation', commands[0]!);
      return;
    }
    onApplyCommands(commands, { selectionAnchor: toSelectionAnchor(selectedNote, selectedNotes) });
  }, [selectedNote, selectedNotes, applyEditorCommands, onApplyCommands, warnNoOpEdit, xml, resolveEditTargets]);

  /** A hairpin over the selection (or the note just entered), up to the end of its last note. */
  const addHairpin = useCallback((kind: 'crescendo' | 'diminuendo') => {
    const editTargets = resolveEditTargets();
    const targets = [...selectedTargets(editTargets.note, editTargets.notes)].sort(compareSelectedNotes);
    const first = targets[0];
    const last = targets[targets.length - 1];
    if (!first || !last) return;
    const stop = endOfEvent(coreDocument, {
      corePartId: last.corePartId ?? null, staffIndex: last.staffIndex, voiceId: last.voiceId, measureNumber: last.measureNumber,
      coreMeasureId: last.coreMeasureId ?? null, coreEntityId: last.coreEntityId ?? null, timestampNum: last.timestampNum, timestampDen: last.timestampDen,
    });
    if (!stop) return;
    const commands: ScoreCommand[] = [{
      type: 'addWedge',
      kind,
      ...(first.corePartId ? { corePartId: first.corePartId } : {}),
      staffIndex: first.staffIndex,
      startMeasureNumber: first.measureNumber,
      startTimestampNum: first.timestampNum,
      startTimestampDen: first.timestampDen,
      stopMeasureNumber: stop.measureNumber,
      stopTimestampNum: stop.timestampNum,
      stopTimestampDen: stop.timestampDen,
      placement: 'below',
    } as ScoreCommand];
    const next = applyEditorCommands(commands);
    if (next.xml === xml) return;
    onApplyCommands(commands, { selectionAnchor: toSelectionAnchor(selectedNote, selectedNotes) });
  }, [applyEditorCommands, coreDocument, onApplyCommands, resolveEditTargets, selectedNote, selectedNotes, xml]);

  const setAccidentalDisplay = useCallback((cautionary: boolean, enclosure: AccidentalEnclosure) => {
    const targets = selectedTargets(selectedNote, selectedNotes)
      .filter((entry) => !entry.isRest && Boolean(entry.writtenAccidental));
    if (!targets.length) return;
    dbg.editor(`setAccidentalDisplay cautionary=${cautionary} enclosure=${enclosure} count=${targets.length}`);
    const commands = targets.map((loc) => ({
      type: 'setAccidentalDisplay' as const,
      coreEntityId: loc.coreEntityId ?? undefined,
      coreMeasureId: loc.coreMeasureId ?? undefined,
      corePartId: loc.corePartId ?? undefined,
      measureNumber: loc.measureNumber,
      staffIndex: loc.staffIndex,
      voiceId: loc.voiceId,
      timestampNum: loc.timestampNum,
      timestampDen: loc.timestampDen,
      cautionary,
      enclosure,
    }));
    const next = applyEditorCommands(commands);
    if (next.xml === xml) {
      warnNoOpEdit('setAccidentalDisplay', commands[0]!);
      return;
    }
    onApplyCommands(commands, { selectionAnchor: toSelectionAnchor(selectedNote, selectedNotes) });
  }, [selectedNote, selectedNotes, applyEditorCommands, onApplyCommands, warnNoOpEdit, xml]);

  const toggleStemDirection = useCallback(() => {
    const editTargets = resolveEditTargets();
    const targets = selectedTargets(editTargets.note, editTargets.notes).filter((entry) => !entry.isRest);
    if (!targets.length) return;
    dbg.editor(`toggleStemDirection count=${targets.length}`);
    const commands = targets.map((loc) => ({
      type: 'toggleStemDirection' as const,
      coreMeasureId: loc.coreMeasureId ?? null,
      corePartId: loc.corePartId ?? null,
      measureNumber: loc.measureNumber,
      staffIndex: loc.staffIndex,
      voiceId: loc.voiceId,
      timestampNum: loc.timestampNum,
      timestampDen: loc.timestampDen,
    }));
    const next = applyEditorCommands(commands);
    if (next.xml === xml) {
      warnNoOpEdit('toggleStemDirection', commands[0]!);
      return;
    }
    onApplyCommands(commands, { selectionAnchor: toSelectionAnchor(selectedNote, selectedNotes) });
  }, [selectedNote, selectedNotes, applyEditorCommands, onApplyCommands, warnNoOpEdit, xml, resolveEditTargets]);

  const toggleSlashNotehead = useCallback(() => {
    const editTargets = resolveEditTargets();
    const targets = selectedTargets(editTargets.note, editTargets.notes).filter((entry) => !entry.isRest);
    if (!targets.length) return;
    dbg.editor(`toggleSlashNotehead count=${targets.length}`);
    const commands = targets.map((loc) => {
      const event = findEventReference(coreDocument, loc)?.event;
      return {
        type: 'setNoteStyle' as const,
        coreMeasureId: loc.coreMeasureId ?? null,
        corePartId: loc.corePartId ?? null,
        measureNumber: loc.measureNumber,
        staffIndex: loc.staffIndex,
        voiceId: loc.voiceId,
        timestampNum: loc.timestampNum,
        timestampDen: loc.timestampDen,
        notehead: event?.notehead === 'slash' ? undefined : 'slash' as const,
        stem: event?.stem,
      };
    });
    const next = applyEditorCommands(commands);
    if (next.xml === xml) {
      warnNoOpEdit('toggleSlashNotehead', commands[0]!);
      return;
    }
    onApplyCommands(commands, { selectionAnchor: toSelectionAnchor(selectedNote, selectedNotes) });
  }, [selectedNote, selectedNotes, coreDocument, applyEditorCommands, onApplyCommands, warnNoOpEdit, xml, resolveEditTargets]);

  const clearArticulations = useCallback(() => {
    const targets = selectedTargets(selectedNote, selectedNotes);
    if (!targets.length) return;
    dbg.editor(`clearArticulations count=${targets.length}`);
    const range = selectionRange(targets);
    const commands = range
      ? [{ type: 'clearRangeArticulations' as const, range }]
      : targets.map((loc) => ({ type: 'clearArticulations' as const, coreMeasureId: loc.coreMeasureId ?? null, corePartId: loc.corePartId ?? null, measureNumber: loc.measureNumber, staffIndex: loc.staffIndex, voiceId: loc.voiceId, timestampNum: loc.timestampNum, timestampDen: loc.timestampDen }));
    const next = applyEditorCommands(commands);
    if (next.xml === xml) {
      warnNoOpEdit('clearArticulations', commands[0]!);
      return;
    }
    onApplyCommands(commands, { selectionAnchor: toSelectionAnchor(selectedNote, selectedNotes) });
  }, [selectedNote, selectedNotes, applyEditorCommands, onApplyCommands, warnNoOpEdit, xml]);

  /**
   * Alt/Option+. and Alt/Option+, (MuseScore increase-dynamic / decrease-dynamic): move the dynamic of
   * the note just entered, or of the selection, one level along pp..fff. A note without a dynamic starts
   * from mf. The part comes from each note, so a second part is edited alone.
   */
  const stepDynamic = useCallback((direction: 1 | -1) => {
    const editTargets = resolveEditTargets();
    const targets = selectedTargets(editTargets.note, editTargets.notes).filter((entry) => !entry.isRest);
    if (!targets.length) return false;
    const commands: ScoreCommand[] = [];
    const seen = new Set<string>();
    for (const target of targets) {
      const key = `${target.corePartId}:${target.measureNumber}:${target.staffIndex}:${target.timestampNum}/${target.timestampDen}`;
      if (seen.has(key)) continue;
      seen.add(key);
      const current = coreDocument?.score.parts
        .filter((part) => !target.corePartId || part.id === target.corePartId)
        .flatMap((part) => part.staves.filter((staff) => staff.staffIndex === target.staffIndex))
        .flatMap((staff) => staff.measures.filter((measure) => measure.measureNumber === target.measureNumber))
        .flatMap((measure) => measure.directions)
        .find((entry) => entry.kind === 'dynamics' && entry.staffIndex === target.staffIndex
          && timestampsEqual(entry.timestampNum ?? 0, entry.timestampDen ?? 1, target.timestampNum, target.timestampDen));
      const index = DYNAMIC_SCALE.indexOf((current?.value ?? 'mf') as DynamicKind);
      const next = DYNAMIC_SCALE[Math.max(0, Math.min(DYNAMIC_SCALE.length - 1, (index < 0 ? DYNAMIC_SCALE.indexOf('mf') : index) + direction))]!;
      if (current && current.value === next) continue;
      commands.push({
        type: 'addDynamic',
        dynamic: next,
        corePartId: target.corePartId ?? null,
        measureNumber: target.measureNumber,
        staffIndex: target.staffIndex,
        voiceId: target.voiceId,
        timestampNum: target.timestampNum,
        timestampDen: target.timestampDen,
      });
    }
    if (!commands.length) return false;
    dbg.editor(`stepDynamic ${direction} count=${commands.length}`);
    const next = applyEditorCommands(commands);
    if (next.xml === xml) {
      warnNoOpEdit('stepDynamic', commands[0]!);
      return false;
    }
    onApplyCommands(commands, { selectionAnchor: toSelectionAnchor(selectedNote, selectedNotes) });
    return true;
  }, [applyEditorCommands, coreDocument, onApplyCommands, resolveEditTargets, selectedNote, selectedNotes, warnNoOpEdit, xml]);

  const addDynamic = useCallback((dynamic: DynamicKind) => {
    const targets = selectedTargets(selectedNote, selectedNotes);
    if (!targets.length) return;
    dbg.editor(`addDynamic ${dynamic} count=${targets.length}`);
    const commands = targets.map((loc) => ({ type: 'addDynamic' as const, dynamic, corePartId: loc.corePartId ?? null, measureNumber: loc.measureNumber, staffIndex: loc.staffIndex, voiceId: loc.voiceId, timestampNum: loc.timestampNum, timestampDen: loc.timestampDen }));
    const next = applyEditorCommands(commands);
    if (next.xml === xml) {
      warnNoOpEdit('addDynamic', commands[0]!);
      return;
    }
    onApplyCommands(commands, { selectionAnchor: toSelectionAnchor(selectedNote, selectedNotes) });
  }, [selectedNote, selectedNotes, applyEditorCommands, onApplyCommands, warnNoOpEdit, xml]);

  const toggleTie = useCallback(() => {
    const targets = selectedTargets(selectedNote, selectedNotes).filter((target) => !target.isRest);
    if (!targets.length) return;
    dbg.editor(`toggleTie count=${targets.length}`);
    const commands = targets.map((loc) => ({
      type: 'toggleTie' as const,
      coreEntityId: loc.coreEntityId ?? null,
      coreMeasureId: loc.coreMeasureId ?? null,
      corePartId: loc.corePartId ?? null,
      step: loc.step,
      octave: loc.octave,
      alter: loc.alter,
      measureNumber: loc.measureNumber,
      staffIndex: loc.staffIndex,
      voiceId: loc.voiceId,
      timestampNum: loc.timestampNum,
      timestampDen: loc.timestampDen,
    }));
    const next = applyEditorCommands(commands);
    if (next.xml === xml) {
      warnNoOpEdit('toggleTie', commands[0]!);
      return;
    }
    onApplyCommands(commands, { selectionAnchor: toSelectionAnchor(selectedNote, selectedNotes) });
  }, [selectedNote, selectedNotes, applyEditorCommands, onApplyCommands, warnNoOpEdit, xml]);

  const activateTie = useCallback(() => {
    if (noteInputModeRef.current) return insertTiedNote();
    toggleTie();
    return true;
  }, [insertTiedNote, toggleTie]);

  const toggleSlur = useCallback(() => {
    const targets = selectedTargets(selectedNote, selectedNotes).filter((entry) => !entry.isRest);
    if (!targets.length) return;
    const first = targets[0];
    const last = targets[targets.length - 1];
    dbg.editor(`toggleSlur count=${targets.length}`);
    const commands: ScoreCommand[] = [{
      type: 'toggleSlur' as const,
      coreMeasureId: first.coreMeasureId ?? null,
      corePartId: first.corePartId ?? null,
      measureNumber: first.measureNumber,
      staffIndex: first.staffIndex,
      voiceId: first.voiceId,
      timestampNum: first.timestampNum,
      timestampDen: first.timestampDen,
      stopLocator: targets.length > 1 ? {
        measureNumber: last.measureNumber,
        staffIndex: last.staffIndex,
        voiceId: last.voiceId,
        timestampNum: last.timestampNum,
        timestampDen: last.timestampDen,
      } : undefined,
    }];
    const next = applyEditorCommands(commands);
    if (next.xml === xml) {
      warnNoOpEdit('toggleSlur', commands[0]!);
      return;
    }
    onApplyCommands(commands, { selectionAnchor: toSelectionAnchor(selectedNote, selectedNotes) });
  }, [selectedNote, selectedNotes, applyEditorCommands, onApplyCommands, warnNoOpEdit, xml]);

  const transposeSemitones = useCallback((semitones: number) => {
    const targets = selectedTargets(selectedNote, selectedNotes).filter((entry) => !entry.isRest);
    if (!targets.length) return;
    dbg.editor(`transposeChromatic ${semitones} count=${targets.length}`);
    const range = selectionRange(targets);
    const commands = range
      ? [{ type: 'transposeRangeChromatic' as const, semitones, range }]
      : targets.map((loc) => ({
        type: 'transposeChromatic' as const,
        semitones,
        coreEntityId: loc.coreEntityId ?? undefined,
        coreMeasureId: loc.coreMeasureId ?? undefined,
        corePartId: loc.corePartId ?? undefined,
        step: loc.step,
        octave: loc.octave,
        alter: loc.alter,
        isRest: loc.isRest,
        measureNumber: loc.measureNumber,
        staffIndex: loc.staffIndex,
        voiceId: loc.voiceId,
        timestampNum: loc.timestampNum,
        timestampDen: loc.timestampDen,
      }));
    const next = applyEditorCommands(commands);
    if (next.xml === xml) {
      warnNoOpEdit('transposeSemitones', commands[0]!);
      return;
    }
    onApplyCommands(commands, { selectionAnchor: toSelectionAnchor(selectedNote, selectedNotes) });
  }, [selectedNote, selectedNotes, applyEditorCommands, onApplyCommands, warnNoOpEdit, xml]);

  const respellEnharmonically = useCallback(() => {
    const editTargets = resolveEditTargets();
    const currentSelectedNote = editTargets.note;
    const currentSelectedNotes = editTargets.notes;
    const originalRangeAnchorId = lastSelectedRef.current?.coreEntityId;
    const originalTargets = selectedTargets(currentSelectedNote, currentSelectedNotes).filter((entry) => !entry.isRest);
    const semanticTargets = originalTargets
      .map((entry) => findSemanticSelectionEntry(coreDocument, entry))
      .filter((entry): entry is SemanticSelectionEntry => Boolean(entry));
    const targets = expandSelectionWithTiedNotes(coreDocument, semanticTargets);
    if (!targets.length) return;

    const commands: ScoreCommand[] = targets.map((target) => {
      const pitch = resolveNextEnharmonicPitch(target);
      return {
        type: 'changeNotePitch',
        coreEntityId: target.coreEntityId,
        coreMeasureId: target.coreMeasureId,
        corePartId: target.corePartId,
        measureNumber: target.measureNumber,
        staffIndex: target.staffIndex,
        voiceId: target.voiceId,
        timestampNum: target.timestampNum,
        timestampDen: target.timestampDen,
        step: pitch.step,
        octave: pitch.octave,
        alter: pitch.alter,
      };
    });
    const next = applyEditorCommands(commands);
    if (next.xml === xml) {
      warnNoOpEdit('respellEnharmonically', commands[0]!);
      return;
    }

    onApplyCommands(commands, { selectionAnchor: toSelectionAnchor(currentSelectedNote, currentSelectedNotes) });
    const resolvedSelection = originalTargets
      .map((target) => target.coreEntityId ? resolveSelectionByEntityId(next.coreDocument, target.coreEntityId) : null)
      .filter((entry): entry is SelectedNote => Boolean(entry));
    const anchorId = currentSelectedNote?.coreEntityId;
    const resolvedAnchor = (anchorId ? resolvedSelection.find((entry) => entry.coreEntityId === anchorId) : null)
      ?? resolvedSelection[resolvedSelection.length - 1]
      ?? null;
    const resolvedRangeAnchor = originalRangeAnchorId
      ? resolvedSelection.find((entry) => entry.coreEntityId === originalRangeAnchorId) ?? null
      : null;
    if (resolvedAnchor) {
      setSelectedNoteLive(resolvedAnchor);
      selectedNotesRef.current = resolvedSelection;
      setSelectedNotes(resolvedSelection);
      lastSelectedRef.current = resolvedRangeAnchor ?? resolvedAnchor;
      if (noteInputModeRef.current) lastNoteInputRef.current = resolvedAnchor;
    }
    setSelectedAccidentalLive(null);
  }, [applyEditorCommands, coreDocument, onApplyCommands, resolveSelectionByEntityId, selectedNote, selectedNotes, setSelectedAccidentalLive, setSelectedNoteLive, warnNoOpEdit, xml, resolveEditTargets]);

  const setBarline = useCallback((barline: BarlineKind, measureNumberOverride?: number | null) => {
    const measureNumber = measureNumberOverride ?? selectedVisual?.measureNumber ?? selectedNote?.measureNumber ?? null;
    if (!measureNumber) return;
    dbg.editor(`setBarline ${barline} m.${measureNumber}`);
    const commands: ScoreCommand[] = [{
      type: 'setBarline',
      measureNumber,
      barline,
    }];
    const next = applyEditorCommands(commands);
    if (next.xml === xml) {
      warnNoOpEdit('setBarline', commands[0]!);
      return;
    }
    onApplyCommands(commands, { selectionAnchor: toSelectionAnchor(selectedNote, selectedNotes) });
  }, [selectedNote, selectedNotes, selectedVisual, applyEditorCommands, onApplyCommands, warnNoOpEdit, xml]);

  const addGraceNoteAtSelection = useCallback(() => {
    const selectedNote = resolveEditTargets().note;
    if (!selectedNote) return;
    dbg.editor(`addGraceNote m.${selectedNote.measureNumber} ts=${selectedNote.timestampNum}/${selectedNote.timestampDen}`);
    const commands: ScoreCommand[] = [{
      type: 'addGraceNote',
      coreEntityId: selectedNote.coreEntityId ?? undefined,
      coreMeasureId: selectedNote.coreMeasureId ?? undefined,
      corePartId: selectedNote.corePartId ?? undefined,
      measureNumber: selectedNote.measureNumber,
      staffIndex: selectedNote.staffIndex,
      voiceId: selectedNote.voiceId,
      timestampNum: selectedNote.timestampNum,
      timestampDen: selectedNote.timestampDen,
      slash: true,
    }];
    const next = applyEditorCommands(commands);
    if (next.xml === xml) {
      warnNoOpEdit('addGraceNote', commands[0]!);
      return;
    }
    onApplyCommands(commands, { selectionAnchor: toSelectionAnchor(selectedNote, selectedNotes) });
  }, [selectedNote, selectedNotes, xml, applyEditorCommands, onApplyCommands, warnNoOpEdit, resolveEditTargets]);

  const addTupletToSelection = useCallback((preset: TupletPreset) => {
    const targets = selectedTargets(selectedNote, selectedNotes);
    if (targets.length !== 1) {
      warnRejectedEdit('addTuplet', {
        rejectionReason: 'Select exactly one note or rest whose duration should be divided into the tuplet.',
        selectionCount: targets.length,
      });
      return;
    }
    const first = targets[0]!;
    const { actualNotes, normalNotes, label } = normalizeTupletPreset(preset);
    dbg.editor(`addTuplet preset=${label} anchor=${first.coreEntityId ?? 'timestamp'} m.${first.measureNumber}`);

    // Note input (MuseScore): the active duration is the total length of the new tuplet at the
    // cursor. Quarter + Cmd/Ctrl+3 gives three triplet eighths, and entry continues with the unit.
    if (noteInputModeRef.current) {
      // Past the end of the score the cursor still shows the last note. A tuplet there would
      // replace that note (F31); MuseScore has no chord or rest at that position and does nothing.
      if (beyondScoreCursor()) {
        warnRejectedEdit('addTuplet', {
          message: 'The cursor is at the end of the score. Enter a note or a rest first; the tuplet starts there.',
          rejectionReason: 'beyond-score',
        });
        return;
      }
      const totalDuration = selectedDurationRef.current;
      const totalDotted = isDottedRef.current;
      const tupletAtCursor: ScoreCommand[] = [{
        type: 'replaceWithRest',
        coreEntityId: first.coreEntityId ?? null,
        coreMeasureId: first.coreMeasureId ?? null,
        corePartId: first.corePartId ?? null,
        measureNumber: first.measureNumber,
        staffIndex: first.staffIndex,
        voiceId: first.voiceId,
        timestampNum: first.timestampNum,
        timestampDen: first.timestampDen,
        durationType: DURATION_TYPE_MAP[totalDuration],
        isDotted: totalDotted,
      }, {
        type: 'addTuplet',
        coreMeasureId: first.coreMeasureId ?? undefined,
        corePartId: first.corePartId ?? undefined,
        measureNumber: first.measureNumber,
        staffIndex: first.staffIndex,
        voiceId: first.voiceId,
        startTimestampNum: first.timestampNum,
        startTimestampDen: first.timestampDen,
        stopTimestampNum: first.timestampNum,
        stopTimestampDen: first.timestampDen,
        actualNotes,
        normalNotes,
        bracket: true,
        showNumber: 'actual',
      }];
      const nextAtCursor = applyEditorCommands(tupletAtCursor);
      const rejectedAtCursor = nextAtCursor.diagnostics.find((entry) => entry.code === 'tuplet_command_rejected');
      if (nextAtCursor.xml === xml || rejectedAtCursor) {
        warnRejectedEdit('addTuplet', {
          command: tupletAtCursor[1],
          rejectionReason: rejectedAtCursor?.message ?? 'The active duration cannot hold this tuplet at the cursor.',
        });
        return;
      }
      onApplyCommands(tupletAtCursor, { selectionAnchor: toSelectionAnchor(first, []) });
      const firstUnit = resolveRecentInputFromDocument(nextAtCursor.coreDocument, {
        coreEntityId: first.coreEntityId ?? null,
        coreMeasureId: first.coreMeasureId ?? null,
        corePartId: first.corePartId ?? null,
        measureNumber: first.measureNumber,
        staffIndex: first.staffIndex,
        voiceId: first.voiceId,
        timestampNum: first.timestampNum,
        timestampDen: first.timestampDen,
      }, { isRest: true });
      if (firstUnit) {
        selectSingleNote(firstUnit, {
          visualOnly: false,
          text: null,
          measureNumber: firstUnit.measureNumber,
          staffIndex: firstUnit.staffIndex,
        });
      }
      // Unit value: the total halved once per power of two in the normal count (3:2 -> /2, 5:4 -> /4).
      let unit = totalDuration;
      if (!totalDotted && Number.isInteger(Math.log2(normalNotes))) {
        for (let step = 0; step < Math.log2(normalNotes); step += 1) unit = halveDuration(unit);
        setSelectedDurationLive(unit);
      }
      return;
    }

    const commands: ScoreCommand[] = [{
      type: 'addTuplet',
      coreEntityId: first.coreEntityId ?? undefined,
      coreMeasureId: first.coreMeasureId ?? undefined,
      corePartId: first.corePartId ?? undefined,
      measureNumber: first.measureNumber,
      staffIndex: first.staffIndex,
      voiceId: first.voiceId,
      startTimestampNum: first.timestampNum,
      startTimestampDen: first.timestampDen,
      stopTimestampNum: first.timestampNum,
      stopTimestampDen: first.timestampDen,
      actualNotes,
      normalNotes,
      bracket: true,
      showNumber: 'actual',
    }];
    const next = applyEditorCommands(commands);
    if (next.xml === xml) {
      const rejection = next.diagnostics.find((entry) => entry.code === 'tuplet_command_rejected');
      warnRejectedEdit('addTuplet', {
        command: commands[0],
        rejectionReason: rejection?.message ?? 'The selected duration cannot be divided into this tuplet safely.',
      });
      return;
    }
    onApplyCommands(commands, { selectionAnchor: toSelectionAnchor(selectedNote, selectedNotes) });
  }, [selectedNote, selectedNotes, applyEditorCommands, onApplyCommands, resolveRecentInputFromDocument, selectSingleNote, setSelectedDurationLive, warnRejectedEdit, beyondScoreCursor, xml]);

  const navigateNote = useCallback((direction: 'prev' | 'next') => {
    if (!selectedNote) return;
    const next = findAdjacentSelection(coreDocument, selectedNote, direction);
    if (!next) return;
    dbg.editor(`navigateNote ${direction} → m.${next.measureNumber} ts=${next.timestampNum}/${next.timestampDen}`);
    announceSemanticSelectionNavigation();
    handleNoteClick(next, { keepInputVoice: true });
    options?.onActiveNotePreview?.(next);
  }, [coreDocument, selectedNote, handleNoteClick, options]);

  // Extend or shrink the selection by one note in the given direction.
  // The anchor (lastSelectedRef) stays fixed; selectedNote acts as the moving focus.
  const extendSelection = useCallback((direction: 'prev' | 'next', unit: 'note' | 'bar' = 'note') => {
    // MuseScore: during note input the note just entered is the selection, so a range grows
    // from it (after "c d e", two Shift+Left select C to E), not from the cursor slot.
    const entered = resolveEditTargets().note;
    const cursor = selectedNoteRef.current ?? selectedNote;
    const startsFromEntered = Boolean(noteInputModeRef.current && entered && cursor && entered !== cursor);
    if (startsFromEntered) lastSelectedRef.current = entered;
    if (noteInputModeRef.current && cursor && selectedNotesRef.current.length <= 1) rangeCursorRef.current = cursor;
    const anchor = lastSelectedRef.current;
    if (!anchor) {
      navigateNote(direction);
      return;
    }
    const focus = startsFromEntered && entered ? entered : (selectedNote ?? anchor);
    // By bar (K15, MuseScore `select-next-measure`): to the first event of the next bar, or back to
    // the first event of this bar and then of the bar before.
    const adjacent = unit === 'bar' ? findMeasureBoundary(coreDocument, focus, direction) : findAdjacentSelection(coreDocument, focus, direction);
    if (!adjacent) return;
    dbg.editor(`extendSelection ${direction} anchor=m.${anchor.measureNumber}/ts=${anchor.timestampNum} focus=m.${focus.measureNumber}/ts=${focus.timestampNum} → m.${adjacent.measureNumber}/ts=${adjacent.timestampNum}`);
    const rangeNotes = resolveRangeSelection(coreDocument, anchor, adjacent);
    selectedNotesRef.current = rangeNotes;
    setSelectedNotes(rangeNotes);
    setSelectedNote(adjacent);
    // lastSelectedRef stays as the anchor — do not update it here
  }, [coreDocument, selectedNote, navigateNote, resolveEditTargets]);

  // Jump to the first note of the previous or next measure (within the same staff+voice).
  const navigateToMeasureBoundary = useCallback((direction: 'prev' | 'next') => {
    if (!selectedNote) return;
    const target = findMeasureBoundary(coreDocument, selectedNote, direction);
    if (!target) return;
    dbg.editor(`navigateMeasure ${direction} → m.${target.measureNumber} ts=${target.timestampNum}/${target.timestampDen}`);
    announceSemanticSelectionNavigation();
    handleNoteClick(target, { keepInputVoice: true });
    options?.onActiveNotePreview?.(target);
  }, [coreDocument, selectedNote, handleNoteClick, options]);

  const navigateVertical = useCallback((direction: 'up' | 'down') => {
    if (!selectedNote) return;
    const target = findVerticalSelection(coreDocument, selectedNote, direction);
    if (!target) return;
    dbg.editor(`navigateVertical ${direction} → m.${target.measureNumber} staff=${target.staffIndex} voice=${target.voiceId} ts=${target.timestampNum}/${target.timestampDen}`);
    announceSemanticSelectionNavigation();
    handleNoteClick(target);
    options?.onActiveNotePreview?.(target);
  }, [coreDocument, selectedNote, handleNoteClick, options]);

  const navigateToScoreBoundary = useCallback((direction: 'start' | 'end') => {
    const target = findScoreBoundary(coreDocument, direction);
    if (!target) return;
    dbg.editor(`navigateScoreBoundary ${direction} → m.${target.measureNumber} ts=${target.timestampNum}/${target.timestampDen}`);
    announceSemanticSelectionNavigation();
    handleNoteClick(target, { keepInputVoice: true });
    options?.onActiveNotePreview?.(target);
  }, [coreDocument, handleNoteClick, options]);

  const transposeSelectedBySemitone = useCallback((semitones: 1 | -1) => {
    const explicitMultiSelection = selectedNotesRef.current.length > 1
      ? selectedNotesRef.current
      : null;
    const targetNote = noteInputModeRef.current
      ? (explicitMultiSelection
        ? (selectedNoteRef.current ?? selectedNote ?? explicitMultiSelection[explicitMultiSelection.length - 1]!)
        : (lastNoteInputRef.current ?? selectedNoteRef.current ?? selectedNote))
      : (selectedNoteRef.current ?? selectedNote);
    if (!targetNote || targetNote.isRest) return;
    const selectionTargets = noteInputModeRef.current
      ? (explicitMultiSelection ?? [targetNote])
      : (selectedNotesRef.current.length > 0 ? selectedNotesRef.current : selectedNotes);
    const targets = selectedTargets(targetNote, selectionTargets).filter((entry) => !entry.isRest);
    if (targets.length > 1) {
      const range = selectionRange(targets);
      const commands: ScoreCommand[] = range
        ? [{ type: 'transposeRangeChromatic', semitones, range }]
        : targets.map((loc) => ({
          type: 'transposeChromatic',
          semitones,
          coreEntityId: loc.coreEntityId ?? undefined,
          coreMeasureId: loc.coreMeasureId ?? undefined,
          corePartId: loc.corePartId ?? undefined,
          step: loc.step,
          octave: loc.octave,
          alter: loc.alter,
          isRest: loc.isRest,
          measureNumber: loc.measureNumber,
          staffIndex: loc.staffIndex,
          voiceId: loc.voiceId,
          timestampNum: loc.timestampNum,
          timestampDen: loc.timestampDen,
        }));
      const next = applyEditorCommands(commands);
      if (next.xml === xml) {
        warnNoOpEdit('transposeSelectedRangeBySemitone', commands[0]!);
        return;
      }
      const movedTargets = targets.map((entry) => ({ ...entry, ...transposeSelectedPitch(entry, semitones) }));
      const movedCurrent = movedTargets.find((entry) => selectedNotesEqual(entry, targetNote)) ?? movedTargets[movedTargets.length - 1]!;
      dbg.editor(`transposeSelectedBySemitone ${semitones} count=${movedTargets.length}`);
      onApplyCommands(commands, { selectionAnchor: toSelectionAnchor(movedCurrent, movedTargets) });
      setSelectedNoteLive(movedCurrent);
      selectedNotesRef.current = movedTargets;
      setSelectedNotes(movedTargets);
      lastSelectedRef.current = movedCurrent;
      if (noteInputModeRef.current) lastNoteInputRef.current = movedCurrent;
      options?.onActiveNotePreview?.(movedCurrent);
      return;
    }
    const nextPitch = transposeSelectedPitch(targetNote, semitones);
    const command = {
      type: 'transposeChromatic' as const,
      semitones,
      coreEntityId: targetNote.coreEntityId ?? undefined,
      coreMeasureId: targetNote.coreMeasureId ?? undefined,
      corePartId: targetNote.corePartId ?? undefined,
      step: targetNote.step,
      octave: targetNote.octave,
      alter: targetNote.alter,
      isRest: targetNote.isRest,
      measureNumber: targetNote.measureNumber,
      staffIndex: targetNote.staffIndex,
      voiceId: targetNote.voiceId,
      timestampNum: targetNote.timestampNum,
      timestampDen: targetNote.timestampDen,
    };
    dbg.editor(`transposeSelectedBySemitone ${semitones} → ${nextPitch.step}${nextPitch.alter === 1 ? '#' : ''}${nextPitch.octave} (m.${targetNote.measureNumber})`);
    const commands = [command];
    const next = applyEditorCommands(commands);
    if (next.xml === xml) {
      warnNoOpEdit('transposeSelectedBySemitone', command);
      return;
    }
    const updated = resolveRecentInputFromDocument(next.coreDocument, {
      coreMeasureId: targetNote.coreMeasureId ?? null,
      corePartId: targetNote.corePartId ?? null,
      measureNumber: targetNote.measureNumber,
      staffIndex: targetNote.staffIndex,
      voiceId: targetNote.voiceId,
      timestampNum: targetNote.timestampNum,
      timestampDen: targetNote.timestampDen,
    }, {
      isRest: false,
      step: nextPitch.step,
      octave: nextPitch.octave,
      alter: nextPitch.alter,
    }) ?? { ...targetNote, ...nextPitch };
    onApplyCommands(commands, { selectionAnchor: toSelectionAnchor(updated, [updated]) });
    if (noteInputModeRef.current) lastNoteInputRef.current = updated;
    setSelectedNoteLive(updated);
    selectedNotesRef.current = [updated];
    setSelectedNotes([updated]);
    lastSelectedRef.current = updated;
    options?.onActiveNotePreview?.(updated);
  }, [selectedNote, selectedNotes, applyEditorCommands, onApplyCommands, options, resolveRecentInputFromDocument, setSelectedNoteLive, warnNoOpEdit, xml]);

  const moveSelectedNoteToAdjacentStaff = useCallback((direction: 'up' | 'down') => {
    const current = selectedNoteRef.current ?? selectedNote;
    const activeSelection = selectedNotesRef.current.length > 0 ? selectedNotesRef.current : selectedNotes;
    const targets = selectedTargets(current, activeSelection);
    if (!current || !targets.length) return;

    const moves = targets.map((target) => ({
      current: target,
      move: resolveAdjacentStaffMove(coreDocument, target, direction),
    })).sort((left, right) => (
      Number(Boolean(left.move?.sourceEvent.isChord)) - Number(Boolean(right.move?.sourceEvent.isChord))
      || compareSelectedNotes(left.current, right.current)
    ));
    if (moves.some((entry) => !entry.move)) return;

    const insertionHasRoot = new Set<string>();
    const commands: ScoreCommand[] = moves.flatMap(({ current: source, move }) => {
      const resolvedMove = move!;
      if (resolvedMove.placement === 'selectRest') return [];
      const insertionKey = crossStaffInsertionKey(resolvedMove.target);
      const asChord = resolvedMove.placement === 'addChordTone' || insertionHasRoot.has(insertionKey);
      insertionHasRoot.add(insertionKey);
      return [{
        type: 'deleteNote',
        coreEntityId: source.coreEntityId ?? undefined,
        step: source.isRest ? undefined : source.step,
        octave: source.isRest ? undefined : source.octave,
        alter: source.isRest ? undefined : source.alter,
        isRest: source.isRest,
        coreMeasureId: source.coreMeasureId ?? null,
        corePartId: source.corePartId ?? null,
        measureNumber: source.measureNumber,
        staffIndex: source.staffIndex,
        voiceId: source.voiceId,
        timestampNum: source.timestampNum,
        timestampDen: source.timestampDen,
      }, {
        type: 'insertNoteAt',
        corePartId: source.corePartId ?? null,
        measureNumber: source.measureNumber,
        staffIndex: resolvedMove.target.staffIndex,
        voiceId: source.voiceId,
        timestampNum: source.timestampNum,
        timestampDen: source.timestampDen,
        step: source.step,
        octave: source.octave,
        alter: source.alter,
        durationType: resolvedMove.sourceEvent.durationType ?? source.durationType ?? 'quarter',
        isDotted: resolvedMove.sourceEvent.isDotted ?? source.isDotted,
        asChord: asChord ? true : undefined,
        notehead: resolvedMove.sourceEvent.notehead,
        stem: resolvedMove.sourceEvent.stem === 'none' ? 'none' : undefined,
        guitar: resolvedMove.sourceEvent.kind === 'note' ? resolvedMove.sourceEvent.guitar : undefined,
      }];
    });
    const movedTargets = moves.map((entry) => entry.move!.target);
    const movedCurrent = moves.find((entry) => selectedNotesEqual(entry.current, current))?.move!.target ?? movedTargets[0]!;
    dbg.editor(`moveSelectedNoteToAdjacentStaff ${direction} count=${movedTargets.length} → staff=${movedCurrent.staffIndex} m.${movedCurrent.measureNumber} ts=${movedCurrent.timestampNum}/${movedCurrent.timestampDen}`);
    if (commands.length === 0) {
      setSelectedNoteLive(movedCurrent);
      selectedNotesRef.current = movedTargets;
      setSelectedNotes(movedTargets);
      lastSelectedRef.current = movedCurrent;
      options?.onActiveNotePreview?.(movedCurrent);
      return;
    }
    const next = applyEditorCommands(commands);
    if (next.xml === xml) {
      warnNoOpEdit('moveSelectedNoteToAdjacentStaff', commands[1] ?? commands[0]!);
      return;
    }

    setSelectedNoteLive(movedCurrent);
    selectedNotesRef.current = movedTargets;
    setSelectedNotes(movedTargets);
    lastSelectedRef.current = movedCurrent;
    options?.onActiveNotePreview?.(movedCurrent);
    onApplyCommands(commands, { selectionAnchor: toSelectionAnchor(movedCurrent, movedTargets) });
  }, [selectedNote, selectedNotes, coreDocument, applyEditorCommands, onApplyCommands, options, setSelectedNoteLive, warnNoOpEdit, xml]);

  const commitDraggedPitch = useCallback((target: DragTransposeCommitTarget) => {
    if (target.note.isRest) return;
    const command: ScoreCommand = {
      type: 'changeNotePitch',
      coreEntityId: target.note.coreEntityId ?? undefined,
      coreMeasureId: target.note.coreMeasureId ?? undefined,
      corePartId: target.note.corePartId ?? undefined,
      measureNumber: target.note.measureNumber,
      staffIndex: target.note.staffIndex,
      voiceId: target.note.voiceId,
      timestampNum: target.note.timestampNum,
      timestampDen: target.note.timestampDen,
      step: target.step,
      octave: target.octave,
      alter: target.alter,
    };
    const commands = [command];
    const next = applyEditorCommands(commands);
    if (next.xml === xml) {
      warnNoOpEdit('commitDraggedPitch', command);
      return;
    }
    onApplyCommands(commands, { selectionAnchor: toSelectionAnchor(selectedNote, selectedNotes) });
    const updated = { ...target.note, step: target.step, alter: target.alter, octave: target.octave };
    setSelectedNote(updated);
    selectedNotesRef.current = [updated];
    setSelectedNotes([updated]);
    lastSelectedRef.current = updated;
    options?.onActiveNotePreview?.(updated);
  }, [applyEditorCommands, onApplyCommands, options, selectedNote, selectedNotes, warnNoOpEdit, xml]);

  // Commit a TAB-staff string drag: same pitch, new string, fret recomputed by
  // the caller from the tuning. Reuses setGuitarFret so paired staves stay in sync.
  const commitDraggedGuitarString = useCallback((target: DragStringCommitTarget) => {
    const note = target.note;
    if (note.isRest || !note.guitar) return;
    const command: ScoreCommand = {
      type: 'setGuitarFret',
      coreEntityId: note.coreEntityId ?? null,
      coreMeasureId: note.coreMeasureId ?? null,
      corePartId: note.corePartId ?? null,
      step: note.step,
      octave: note.octave,
      alter: note.alter,
      measureNumber: note.measureNumber,
      staffIndex: note.staffIndex,
      voiceId: note.voiceId,
      timestampNum: note.timestampNum,
      timestampDen: note.timestampDen,
      string: target.string,
      fret: target.fret,
      tuning: note.guitar.tuning ? resolveGuitarTuning(note.guitar.tuning).id : undefined,
      techniques: note.guitar.techniques,
    };
    const commands = [command];
    const next = applyEditorCommands(commands);
    if (next.xml === xml) {
      warnNoOpEdit('commitDraggedGuitarString', command);
      return;
    }
    onApplyCommands(commands, { selectionAnchor: toSelectionAnchor(note, selectedNotesRef.current) });
    const updated = {
      ...note,
      guitar: {
        ...note.guitar,
        string: target.string,
        fret: target.fret,
      },
    };
    setSelectedNote(updated);
    selectedNotesRef.current = [updated];
    setSelectedNotes([updated]);
    lastSelectedRef.current = updated;
    options?.onActiveNotePreview?.(updated);
  }, [applyEditorCommands, onApplyCommands, options, warnNoOpEdit, xml]);

  // Select all notes in the current staff+voice across all measures.
  const selectAllInVoice = useCallback(() => {
    if (!selectedNote) return;
    const targets = getSelectionLaneOrder(coreDocument, selectedNote);
    if (!targets.length) return;
    dbg.editor(`selectAllInVoice count=${targets.length} staff=${selectedNote.staffIndex} voice=${selectedNote.voiceId}`);
    selectedNotesRef.current = targets;
    setSelectedNotes(targets);
    setSelectedNote(targets[targets.length - 1]);
    lastSelectedRef.current = targets[0]; // anchor at the first note
  }, [coreDocument, selectedNote]);

  const repeatLastInput = useCallback(() => {
    const lastInput = lastNoteInputRef.current;
    if (!(selectedNoteRef.current ?? selectedNote) || !lastInput || lastInput.isRest) return;
    const durationState = {
      duration: selectedDurationRef.current,
      dotted: isDottedRef.current,
    };
    setSelectedDurationLive(durationState.duration);
    setIsDottedLive(durationState.dotted);
    insertNote(lastInput.step, lastInput.octave, {
      alter: lastInput.alter,
      duration: durationState.duration,
      dotted: durationState.dotted,
    });
  }, [insertNote, selectedNote, setIsDottedLive, setSelectedDurationLive]);

  const applyDurationTransform = useCallback((transform: (duration: NoteDuration, dotted: boolean) => { duration: NoteDuration; dotted: boolean }) => {
    const currentSelectedNote = selectedNoteRef.current ?? selectedNote;
    const source = noteInputModeRef.current ? (lastNoteInputRef.current ?? currentSelectedNote) : currentSelectedNote;
    const current = resolveDurationState(source, selectedDurationRef.current, isDottedRef.current);
    const next = transform(current.duration, current.dotted);
    // In note input the note just entered, outside it the selected note or rest (MuseScore: the
    // duration keys "change the duration of one or more selected notes in normal mode", K1).
    if (source) {
      changeNoteDuration(next.duration, next.dotted);
      return;
    }
    setSelectedDurationLive(next.duration);
    setIsDottedLive(next.dotted);
  }, [changeNoteDuration, selectedNote, setIsDottedLive, setSelectedDurationLive]);

  const applyAccidentalChoice = useCallback((value: AccidentalChoice, toggle = false) => {
    const next = toggle && selectedAccidentalRef.current === value ? null : value;
    setSelectedAccidentalLive(next);
    const currentSelectedNote = selectedNoteRef.current ?? selectedNote;
    if (noteInputModeRef.current || !currentSelectedNote || currentSelectedNote.isRest) return;
    changePitch(currentSelectedNote.step, next);
  }, [changePitch, selectedNote, setSelectedAccidentalLive]);

  const prepareInputByDurationPitch = useCallback((step: string, addToChord = false) => {
    const anchor = selectedNoteRef.current ?? selectedNote;
    if (!anchor || !/^[A-G]$/i.test(step)) return;
    setPreparedDurationRestLive(false);
    const normalizedStep = step.toUpperCase();
    const highestPreparedPitch = preparedDurationPitchesRef.current.reduce<PreparedDurationPitch | null>((highest, pitch) => (
      !highest || diatonicPitchIndex(pitch.step, pitch.octave) > diatonicPitchIndex(highest.step, highest.octave)
        ? pitch
        : highest
    ), null);
    const reference: SelectedNote = highestPreparedPitch
      ? { ...anchor, ...highestPreparedPitch, isRest: false }
      : anchor.isRest ? laneRegisterReference(coreDocument, anchor, storedInputVoiceAt(anchor)) : anchor;
    const resolved = resolvePitchNameEntry(normalizedStep, 0, reference, addToChord ? 'above' : 'closest');
    const alter = selectedAccidentalRef.current
      ? writtenAccidentalToAlter(selectedAccidentalRef.current)
      : resolveMeasureAccidentalAlter(coreDocument, {
        corePartId: anchor.corePartId,
        measureNumber: anchor.measureNumber,
        staffIndex: anchor.staffIndex,
        timestampNum: anchor.timestampNum,
        timestampDen: anchor.timestampDen,
        step: normalizedStep,
        octave: resolved.octave,
      });
    setPreparedDurationPitchesLive(updatePreparedDurationPitches(
      preparedDurationPitchesRef.current,
      prepareDurationPitch({
        ...resolved,
        alter,
        writtenAccidental: selectedAccidentalRef.current ?? undefined,
      }),
      addToChord ? 'add' : 'replace',
    ));
    if (selectedAccidentalRef.current) setSelectedAccidentalLive(null);
  }, [coreDocument, selectedNote, setPreparedDurationPitchesLive, setPreparedDurationRestLive, setSelectedAccidentalLive, storedInputVoiceAt]);

  const moveInputByDurationPitchCursor = useCallback((direction: 1 | -1) => {
    const anchor = selectedNoteRef.current ?? selectedNote;
    if (!anchor) return;
    const current = preparedDurationPitchesRef.current;
    const active = current[current.length - 1]
      ?? prepareDurationPitch((({ step, octave, alter }) => ({ step, octave, alter }))(
        anchor.isRest ? laneRegisterReference(coreDocument, anchor, storedInputVoiceAt(anchor)) : anchor,
      ));
    const semitones = (active.midi === 0 && direction < 0) || (active.midi === 127 && direction > 0)
      ? 0
      : direction;
    const movedPitch = transposeSelectedPitch({
      ...anchor,
      ...active,
      isRest: false,
    }, semitones);
    const moved = prepareDurationPitch(movedPitch);
    const next = current.length > 0 ? [...current.slice(0, -1), moved] : [moved];
    setPreparedDurationRestLive(false);
    setPreparedDurationPitchesLive([...new Map(next.map((pitch) => [pitch.midi, pitch])).values()]
      .sort((left, right) => left.midi - right.midi));
  }, [coreDocument, selectedNote, setPreparedDurationPitchesLive, setPreparedDurationRestLive, storedInputVoiceAt]);

  const removeLastPreparedDurationTone = useCallback(() => {
    if (preparedDurationRestRef.current) {
      setPreparedDurationRestLive(false);
      const anchor = selectedNoteRef.current ?? selectedNote;
      const pitchSource = anchor?.isRest ? laneRegisterReference(coreDocument, anchor, storedInputVoiceAt(anchor)) : anchor;
      setPreparedDurationPitchesLive([prepareDurationPitch(pitchSource
        ? { step: pitchSource.step, octave: pitchSource.octave, alter: pitchSource.alter }
        : { step: 'C', octave: 4, alter: 0 })]);
      return true;
    }
    if (preparedDurationPitchesRef.current.length <= 1) return false;
    setPreparedDurationPitchesLive(preparedDurationPitchesRef.current.slice(0, -1));
    return true;
  }, [coreDocument, selectedNote, setPreparedDurationPitchesLive, setPreparedDurationRestLive, storedInputVoiceAt]);

  const changeInputByDurationOctave = useCallback((direction: 1 | -1) => {
    if (!inputByDurationModeRef.current) {
      changeOctave(direction);
      return;
    }
    if (preparedDurationRestRef.current || preparedDurationPitchesRef.current.length === 0) return;
    const pitches = preparedDurationPitchesRef.current;
    const active = pitches[pitches.length - 1]!;
    const moved = prepareDurationPitch({
      ...active,
      octave: Math.max(-1, Math.min(9, active.octave + direction)),
    });
    setPreparedDurationPitchesLive([...pitches.slice(0, -1), moved]
      .sort((left, right) => left.midi - right.midi));
  }, [changeOctave, setPreparedDurationPitchesLive]);

  /**
   * Backspace in note input (K3): the note or chord just entered becomes a rest again and the cursor
   * stands on its place, as MuseScore's `cmdDeleteSelection` sets the input position to the deleted
   * chord. False when there is nothing entered before the cursor.
   */
  const takeBackLastEntry = useCallback(() => {
    const entered = lastNoteInputRef.current;
    const cursor = selectedNoteRef.current ?? selectedNote;
    if (!entered || entered.isRest || !cursor || selectedNotesRef.current.length > 1) return false;
    if (selectedNotesPositionallyEqual(cursor, entered)) return false;
    const slot = {
      coreMeasureId: entered.coreMeasureId ?? null,
      corePartId: entered.corePartId ?? null,
      measureNumber: entered.measureNumber,
      staffIndex: entered.staffIndex,
      voiceId: entered.voiceId,
      timestampNum: entered.timestampNum,
      timestampDen: entered.timestampDen,
    };
    const main = findEventReference(coreDocument, slot)?.event ?? null;
    if (!main?.durationType) return false;
    const commands: ScoreCommand[] = [{ type: 'replaceWithRest', coreEntityId: null, ...slot, durationType: main.durationType, isDotted: Boolean(main.isDotted) }];
    const next = applyEditorCommands(commands);
    if (next.xml === xml || next.diagnostics.some((entry) => entry.code.endsWith('_rejected'))) return false;
    const onset = entered.timestampNum / Math.max(entered.timestampDen, 1);
    const lane = getSelectionLaneOrder(next.coreDocument, entered).filter((entry) => matchesSelectionLane(entry, entered));
    // The rest that is left may be merged with the rests after it; the cursor keeps the onset.
    const host = lane.filter((entry) => (
      entry.measureNumber === entered.measureNumber && entry.timestampNum / Math.max(entry.timestampDen, 1) <= onset + 1e-9
    )).at(-1) ?? null;
    if (!host) return false;
    const cursorAfter: SelectedNote = { ...host, timestampNum: entered.timestampNum, timestampDen: entered.timestampDen };
    onApplyCommands(commands, { selectionAnchor: null, redoSelectionAnchor: toSelectionAnchor(cursorAfter, [cursorAfter]) });
    beyondScoreRef.current = null;
    inputSlurRef.current = null;
    lastNoteInputRef.current = lane.filter((entry) => compareSelectedNotes(entry, cursorAfter) < 0 && !entry.isRest).at(-1) ?? null;
    selectSingleNote(cursorAfter, { visualOnly: false, text: null, measureNumber: cursorAfter.measureNumber, staffIndex: cursorAfter.staffIndex });
    return true;
  }, [applyEditorCommands, coreDocument, onApplyCommands, selectSingleNote, selectedNote, xml]);

  const handleKeyDown = useCallback((e: KeyboardEvent) => {
    // Don't intercept when user is typing in an input/textarea
    const target = e.target as HTMLElement;
    if (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable) return;

    // A held key repeats navigation only. Entry, edit and mode keys act once per physical press,
    // so a held note name, rest, Delete or N never commits or toggles again.
    if (e.repeat && !isRepeatableNavigationKey(e.key)) {
      e.preventDefault();
      return;
    }

    const key = e.key.toUpperCase();
    const metaKey = e.metaKey || e.ctrlKey;
    const keyboardLayout = getActiveKeyboardLayoutContext();
    // Selection commands in note input act on the note just entered; the cursor stays put.
    const keepingInputCursor = (action: () => void) => {
      const cursor = selectedNoteRef.current ?? selectedNote;
      const actsOnEnteredNote = Boolean(cursor && resolveEditTargets().note !== cursor);
      // A Shift+Arrow range in note input leaves the cursor where it was; the action ends the range.
      const rangeCursor = noteInputModeRef.current && selectedNotesRef.current.length > 1 ? rangeCursorRef.current : null;
      action();
      const restore = rangeCursor ?? (actsOnEnteredNote ? cursor : null);
      if (restore) {
        selectSingleNote(restore, { visualOnly: false, text: null, measureNumber: restore.measureNumber, staffIndex: restore.staffIndex });
      }
    };

    // Electron owns the platform quit accelerator. Never let Cmd/Ctrl+Q fall
    // through to the bare Q notation action if the renderer receives it.
    if (metaKey && key === 'Q') return;

    // Dynamics: Alt/Option+. louder, Alt/Option+, softer. The physical code is Period/Comma on US, UK
    // and German/Austrian keyboards; macOS Option replaces the printed character.
    if (e.altKey && !metaKey && !e.shiftKey && (e.code === 'Period' || e.code === 'Comma' || e.key === '.' || e.key === ',')) {
      const louder = e.code === 'Period' || (e.code !== 'Comma' && e.key === '.');
      e.preventDefault();
      if (selectedNote || selectedNotes.length > 0) keepingInputCursor(() => { stepDynamic(louder ? 1 : -1); });
      return;
    }

    if (metaKey && key === 'D' && !(noteInputModeRef.current && e.shiftKey)) {
      if (selectedNote || selectedNotes.length > 0) {
        e.preventDefault();
        duplicateSelection();
      }
      return;
    }

    if (metaKey && key === 'X') {
      if (shouldUseNativeClipboardShortcut(target)) return;
      if (selectedNote || selectedNotes.length > 0) {
        e.preventDefault();
        copySelectedRange();
        deleteSelectedNote({ collapseToFirst: true });
      }
      return;
    }

    if (metaKey && key === 'C' && !(noteInputModeRef.current && e.shiftKey)) {
      if (shouldUseNativeClipboardShortcut(target)) return;
      if (selectedNote || selectedNotes.length > 0) {
        e.preventDefault();
        copySelectedRange();
      }
      return;
    }

    if (metaKey && key === 'V' && !(noteInputModeRef.current && e.shiftKey)) {
      if (shouldUseNativeClipboardShortcut(target)) return;
      if (selectedNote && clipboard) {
        e.preventDefault();
        pasteContent();
      }
      return;
    }

    if (metaKey && key === 'A' && !(noteInputModeRef.current && e.shiftKey)) {
      if (selectedNote) { e.preventDefault(); selectAllInVoice(); }
      return;
    }

    const chordInputShortcut = resolveKeyboardChordInputShortcut({
      key: e.key,
      shiftKey: e.shiftKey,
      metaKey: e.metaKey,
      ctrlKey: e.ctrlKey,
      altKey: e.altKey,
    });
    if (chordInputShortcut) {
      e.preventDefault();
      if (chordInputShortcut === 'toggleChordInput') {
        setChordInputModeLive(!chordInputModeRef.current);
      } else {
        focusChordSymbolInput();
      }
      return;
    }

    if (metaKey && key === 'H') {
      e.preventDefault();
      focusChordSymbolInput();
      return;
    }

    if (
      stepInputKeyboardModeRef.current
      && !e.metaKey
      && !e.ctrlKey
      && !e.altKey
      && !e.shiftKey
    ) {
      const qwertyPitch = resolveQwertyPianoKeyEvent(e);
      if (qwertyPitch) {
        const currentSelectedNote = selectedNoteRef.current ?? selectedNote;
        if (currentSelectedNote) {
          e.preventDefault();
          if (noteInputModeRef.current) {
            const writtenAccidental = selectedAccidentalRef.current ?? undefined;
            insertNote(qwertyPitch.step, qwertyPitch.octave, {
              alter: writtenAccidental ? writtenAccidentalToAlter(writtenAccidental) : qwertyPitch.alter,
              writtenAccidental,
            });
          } else {
            replaceSelectedPitchAndAdvance(qwertyPitch.step, qwertyPitch.octave, qwertyPitch.alter);
          }
        }
        return;
      }
    }

    if (key === 'J' && !metaKey && !e.altKey && !e.shiftKey) {
      if (selectedNote || selectedNotes.length > 0) {
        e.preventDefault();
        keepingInputCursor(respellEnharmonically);
      }
      return;
    }

    if (key === 'P' && !metaKey && !e.altKey && !e.shiftKey) {
      e.preventDefault();
      toggleStepInputKeyboardMode();
      return;
    }

    if (key === 'M' && !metaKey && !e.altKey) {
      e.preventDefault();
      toggleInputByDurationMode();
      return;
    }

    if (key === 'N' && !e.shiftKey) {
      e.preventDefault();
      toggleNoteInput();
      return;
    }

    const entryModeShortcut = resolveKeyboardEntryModeShortcut({
      key: e.key,
      shiftKey: e.shiftKey,
      metaKey: e.metaKey,
      ctrlKey: e.ctrlKey,
      altKey: e.altKey,
    });
    if (entryModeShortcut) {
      e.preventDefault();
      setEntryModeLive(entryModeShortcut === 'toggle'
        ? (entryModeRef.current === 'insert' ? 'overwrite' : 'insert')
        : entryModeShortcut);
      return;
    }

    const altNumberKeyMap: Record<string, string> = { '¡': '1', '™': '2', '£': '3', '¢': '4' };
    const voiceCodeMatch = /^(?:Digit|Numpad)([1-4])$/.exec(e.code);
    const voiceShortcut = /^[1-4]$/.test(e.key)
      ? e.key
      : altNumberKeyMap[e.key] ?? voiceCodeMatch?.[1] ?? null;
    if ((e.ctrlKey || e.metaKey) && e.altKey && voiceShortcut) {
      e.preventDefault();
      const voice = Number(voiceShortcut) as 1 | 2 | 3 | 4;
      // Outside note input the key moves the selected notes to that voice (K7); otherwise, and with
      // a rest or nothing selected, it chooses the voice the next entry goes to.
      if (!noteInputModeRef.current && moveSelectionToVoice(voice)) return;
      setSelectedVoiceLive(voice);
      return;
    }

    if (key === 'ESCAPE') {
      e.preventDefault();
      setStepInputKeyboardModeLive(false);
      setInputByDurationModeLive(false);
      setNoteInputModeLive(false);
      clearSelection();
      return;
    }

    if (
      inputByDurationModeRef.current
      && (key === 'BACKSPACE' || key === 'DELETE')
      && removeLastPreparedDurationTone()
    ) {
      e.preventDefault();
      return;
    }

    const deleteAction = resolveKeyboardDeleteAction({
      key: e.key,
      shiftKey: e.shiftKey,
      metaKey: e.metaKey,
      ctrlKey: e.ctrlKey,
      hasSelection: Boolean(selectedNote || selectedNotes.length > 0),
      noteInputMode,
    });
    if (deleteAction === 'deleteBars') {
      e.preventDefault();
      editBars('delete');
      return;
    }
    if (e.key === 'Insert' && !metaKey && !e.altKey && !e.shiftKey) {
      if (editBars('insertBefore')) e.preventDefault();
      return;
    }
    if (key === 'B' && metaKey && !e.altKey && !e.shiftKey) {
      e.preventDefault();
      editBars('append');
      return;
    }
    if (deleteAction === 'delete') {
      e.preventDefault();
      if (e.key === 'Backspace' && noteInputModeRef.current && takeBackLastEntry()) return;
      deleteSelectedNote();
      return;
    }
    if (deleteAction === 'rippleDelete') {
      e.preventDefault();
      rippleDelete();
      return;
    }
    if (deleteAction === 'clearMeasureVoice') {
      e.preventDefault();
      clearMeasureVoice();
      return;
    }

    if (key === 'Q' && e.shiftKey && !metaKey && !e.altKey) {
      e.preventDefault();
      applyDurationTransform(decreaseDottedDuration);
      return;
    }

    if (key === 'W' && e.shiftKey && !metaKey && !e.altKey) {
      e.preventDefault();
      applyDurationTransform(increaseDottedDuration);
      return;
    }

    if (key === 'Q' && !metaKey && !e.altKey) {
      e.preventDefault();
      applyDurationTransform((duration, dotted) => ({ duration: halveDuration(duration), dotted }));
      return;
    }

    if (key === 'W' && !metaKey && !e.altKey) {
      e.preventDefault();
      applyDurationTransform((duration, dotted) => ({ duration: doubleDuration(duration), dotted }));
      return;
    }

    const accidentalShortcut = resolveKeyboardAccidentalShortcut(e, keyboardLayout);
    if (accidentalShortcut) {
      e.preventDefault();
      applyAccidentalChoice(accidentalShortcut, true);
      return;
    }

    // Tie and slur — standard shortcuts matching MuseScore
    if (key === 'X' && e.shiftKey && !metaKey && !e.altKey) {
      if (selectedNote || selectedNotes.length > 0) { e.preventDefault(); keepingInputCursor(toggleSlashNotehead); }
      return;
    }

    if (key === 'X' && !e.shiftKey && !metaKey && !e.altKey) {
      if (selectedNote || selectedNotes.length > 0) { e.preventDefault(); keepingInputCursor(toggleStemDirection); }
      return;
    }

    if (key === 'T') {
      if (noteInputModeRef.current || selectedNote || selectedNotes.length > 0) {
        e.preventDefault();
        activateTie();
      }
      return;
    }

    // MuseScore `add-hairpin` and `add-hairpin-reverse`: the characters `<` and `>` as typed.
    if ((e.key === '<' || e.key === '>') && !metaKey && !e.altKey) {
      if (selectedNote || selectedNotes.length > 0) {
        e.preventDefault();
        keepingInputCursor(() => addHairpin(e.key === '<' ? 'crescendo' : 'diminuendo'));
      }
      return;
    }

    const articulationShortcut = resolveKeyboardArticulationShortcut(e, keyboardLayout);
    if (articulationShortcut) {
      if (selectedNote || selectedNotes.length > 0) {
        e.preventDefault();
        keepingInputCursor(() => toggleArticulation(articulationShortcut));
      }
      return;
    }

    if (key === 'S') {
      if (noteInputModeRef.current && !chordInputModeRef.current) {
        // MuseScore: S ends the open input slur; otherwise it slurs the selection (the note just
        // entered, or a Shift+Arrow range) and keeps that slur open for the notes entered next.
        e.preventDefault();
        if (inputSlurRef.current) {
          inputSlurRef.current = null;
          return;
        }
        const range = selectedNotesRef.current.length > 1 ? [...selectedNotesRef.current].filter((entry) => !entry.isRest).sort(compareSelectedNotes) : [];
        if (range.length > 1) {
          keepingInputCursor(toggleSlur);
          inputSlurRef.current = { start: range[0]!, end: range[range.length - 1]! };
          return;
        }
        const entered = resolveEditTargets().note;
        if (entered && !entered.isRest) inputSlurRef.current = { start: entered, end: null };
        return;
      }
      if (selectedNote || selectedNotes.length > 0) { e.preventDefault(); toggleSlur(); }
      return;
    }

    const tupletShortcut = resolveKeyboardTupletShortcut(e);
    if (tupletShortcut) {
      if (selectedNote || selectedNotes.length > 0) {
        e.preventDefault();
        addTupletToSelection(tupletShortcut as TupletNumber);
      }
      return;
    }

    if (e.key === '/' && (selectedNote || selectedNotes.length > 0)) {
      if (metaKey) {
        e.preventDefault();
        fillSlashMeasure();
        return;
      }
      e.preventDefault();
      keepingInputCursor(addGraceNoteAtSelection);
      return;
    }

    const guitarStringDigit = e.altKey && !metaKey ? shortcutDigit(e) : null;
    const guitarStringShortcut = guitarStringDigit && /^[1-6]$/.test(guitarStringDigit)
      ? Number(guitarStringDigit) as GuitarStringNumber
      : null;
    if (guitarInputModeRef.current && guitarStringShortcut) {
      e.preventDefault();
      setSelectedGuitarStringLive(guitarStringShortcut);
      return;
    }

    const intervalShortcut = resolveKeyboardIntervalShortcut({
      key: e.key,
      code: e.code,
      shiftKey: e.shiftKey,
      metaKey: e.metaKey,
      ctrlKey: e.ctrlKey,
      altKey: e.altKey,
    });
    if (!guitarInputModeRef.current && intervalShortcut) {
      const currentSelectedNote = noteInputModeRef.current
        ? (lastNoteInputRef.current ?? selectedNoteRef.current ?? selectedNote)
        : (selectedNoteRef.current ?? selectedNote);
      if (currentSelectedNote && !currentSelectedNote.isRest) {
        e.preventDefault();
        addIntervalAbove(intervalShortcut);
      }
      return;
    }

    const guitarFretShortcut = guitarInputModeRef.current && noteInputModeRef.current && !e.altKey && !metaKey
      ? shortcutDigit(e)
      : null;
    if (guitarFretShortcut !== null && guitarFretShortcut !== undefined) {
      const currentSelectedNote = selectedNoteRef.current ?? selectedNote;
      if (currentSelectedNote) {
        e.preventDefault();
        if (guitarFretCommitTimerRef.current) clearTimeout(guitarFretCommitTimerRef.current);
        const nextBuffer = `${guitarFretBufferRef.current}${guitarFretShortcut}`.slice(-2);
        setGuitarFretBufferLive(nextBuffer);
        setSelectedGuitarFretLive(Number(nextBuffer));
        const commit = () => insertGuitarFret(selectedGuitarStringRef.current, Number(guitarFretBufferRef.current || nextBuffer));
        if (nextBuffer.length >= 2 || guitarFretShortcut === '0') {
          commit();
        } else {
          guitarFretCommitTimerRef.current = setTimeout(commit, 450);
        }
      }
      return;
    }

    const durationShortcut = resolveKeyboardDurationShortcut({
      key: e.key,
      code: e.code,
      shiftKey: e.shiftKey,
      altKey: e.altKey,
      metaKey: e.metaKey,
      ctrlKey: e.ctrlKey,
    });

    // Duration shortcuts - MuseScore layout: 1=64th ... 7=whole, 8=breve, 9=longa.
    if (durationShortcut) {
      e.preventDefault();
      if (durationShortcut.type === 'selectDuration') {
        if (inputByDurationModeRef.current) commitPreparedDurationInput(durationShortcut.duration);
        else if (!noteInputModeRef.current && (selectedNoteRef.current ?? selectedNote)) {
          // Outside note input the key changes the selected note or rest and arms the value (K1).
          applyDurationTransform(() => ({ duration: durationShortcut.duration, dotted: false }));
        } else {
          // As in MuseScore, choosing a note value clears the augmentation dot; duration-first
          // input (M) keeps it because the dot is set before the committing duration key.
          setSelectedDurationLive(durationShortcut.duration);
          setIsDottedLive(false);
        }
      }
      return;
    }

    // Rest insert
    if (key === 'R' || e.key === '0') {
      if (inputByDurationModeRef.current && e.key === '0') {
        e.preventDefault();
        prepareInputByDurationRest();
        return;
      }
      if (key === 'R' && noteInputMode && lastNoteInputRef.current && !e.shiftKey) {
        e.preventDefault();
        repeatLastInput();
        return;
      }
      if (key === 'R' && !noteInputMode && !e.shiftKey) {
        if (selectedNote || selectedNotes.length > 0) { e.preventDefault(); repeatSelection(); }
        return;
      }
      if (!selectedNote) return;
      e.preventDefault();
      // MuseScore `putRestToSelection`: outside note input, `0` starts note input at the selection
      // and writes a rest of the armed value over it (F16); it never pushes the bar later.
      if (!noteInputModeRef.current && e.key === '0') toggleNoteInput();
      insertRest();
      return;
    }

    const activeNoteInputTarget = noteInputModeRef.current ? lastNoteInputRef.current : null;
    if (
      inputByDurationModeRef.current
      && (!activeNoteInputTarget || activeNoteInputTarget.isRest)
      && !e.altKey
      && !e.shiftKey
    ) {
      if ((e.key === 'ArrowUp' || e.key === 'ArrowDown') && metaKey) {
        e.preventDefault();
        changeInputByDurationOctave(e.key === 'ArrowUp' ? 1 : -1);
        return;
      }
      if (e.key === 'ArrowUp' || e.key === 'ArrowDown') {
        e.preventDefault();
        moveInputByDurationPitchCursor(e.key === 'ArrowUp' ? 1 : -1);
        return;
      }
    }

    // Dotted toggle
    if (e.key === '.') {
      e.preventDefault();
      if (!noteInputModeRef.current && (selectedNoteRef.current ?? selectedNote)) {
        applyDurationTransform((duration, dotted) => ({ duration, dotted: !dotted }));
        return;
      }
      setIsDottedLive(!isDottedRef.current);
      return;
    }

    // Ctrl/Cmd+Shift+vertical arrows: move a single selected note to the adjacent staff.
    if (e.key === 'ArrowUp' && e.shiftKey && metaKey) { e.preventDefault(); moveSelectedNoteToAdjacentStaff('up'); return; }
    if (e.key === 'ArrowDown' && e.shiftKey && metaKey) { e.preventDefault(); moveSelectedNoteToAdjacentStaff('down'); return; }

    // Alt+Shift+vertical arrows: one step of the key (MuseScore `pitch-up-diatonic`, K2).
    if ((e.key === 'ArrowUp' || e.key === 'ArrowDown') && e.shiftKey && e.altKey && !metaKey) {
      e.preventDefault();
      changeOctave(e.key === 'ArrowUp' ? 1 : -1, 'diatonic');
      return;
    }

    // Shift+vertical arrows: octave the active/last typed note.
    if (e.key === 'ArrowUp' && e.shiftKey) { e.preventDefault(); changeOctave(1); return; }
    if (e.key === 'ArrowDown' && e.shiftKey) { e.preventDefault(); changeOctave(-1); return; }

    // Shift+horizontal arrows: extend or shrink the selection by one note.
    if (e.key === 'ArrowLeft' && e.shiftKey) { e.preventDefault(); extendSelection('prev', metaKey ? 'bar' : 'note'); return; }
    if (e.key === 'ArrowRight' && e.shiftKey) { e.preventDefault(); extendSelection('next', metaKey ? 'bar' : 'note'); return; }

    // Ctrl/Cmd+Arrow: jump by measure.
    if (e.key === 'ArrowLeft' && metaKey) { e.preventDefault(); navigateToMeasureBoundary('prev'); return; }
    if (e.key === 'ArrowRight' && metaKey) { e.preventDefault(); navigateToMeasureBoundary('next'); return; }

    // Alt/Option+ArrowUp/Down: move vertically across voices/staves at the same timestamp.
    if (e.key === 'ArrowUp' && e.altKey) { e.preventDefault(); navigateVertical('up'); return; }
    if (e.key === 'ArrowDown' && e.altKey) { e.preventDefault(); navigateVertical('down'); return; }

    if (metaKey && e.key === 'Home') { e.preventDefault(); navigateToScoreBoundary('start'); return; }
    if (metaKey && e.key === 'End') { e.preventDefault(); navigateToScoreBoundary('end'); return; }

    // Plain Arrow keys: note navigation and chromatic pitch change
    if (e.key === 'ArrowLeft') { e.preventDefault(); navigateNote('prev'); return; }
    if (e.key === 'ArrowRight') { e.preventDefault(); navigateNote('next'); return; }
    if (e.key === 'ArrowUp' && metaKey) { e.preventDefault(); changeOctave(1); return; }
    if (e.key === 'ArrowDown' && metaKey) { e.preventDefault(); changeOctave(-1); return; }
    if (e.key === 'ArrowUp') { e.preventDefault(); transposeSelectedBySemitone(1); return; }
    if (e.key === 'ArrowDown') { e.preventDefault(); transposeSelectedBySemitone(-1); return; }

    // Pitch keys (A–G): change pitch of selected note or insert in note-input mode
    if (/^[A-G]$/.test(key)) {
      e.preventDefault();
      const currentSelectedNote = selectedNoteRef.current ?? selectedNote;
      const currentSelectedVisual = selectedVisualRef.current ?? selectedVisual;
      const measureAnchorSelection = Boolean(currentSelectedVisual?.visualOnly && !currentSelectedVisual.text);
      const resolveTypedPitch = (reference: SelectedNote, placement: 'closest' | 'above') => {
        const diatonicPitch = resolvePitchNameEntry(key, 0, reference, placement);
        const inputPosition = currentSelectedNote ?? reference;
        const alter = selectedAccidentalRef.current
          ? writtenAccidentalToAlter(selectedAccidentalRef.current)
          : resolveMeasureAccidentalAlter(coreDocument, {
            corePartId: inputPosition.corePartId,
            measureNumber: inputPosition.measureNumber,
            staffIndex: inputPosition.staffIndex,
            timestampNum: inputPosition.timestampNum,
            timestampDen: inputPosition.timestampDen,
            step: key,
            octave: diatonicPitch.octave,
          });
        return { ...diatonicPitch, alter };
      };
      if (inputByDurationModeRef.current && currentSelectedNote) {
        prepareInputByDurationPitch(key, e.shiftKey);
        return;
      }
      if (noteInputModeRef.current && currentSelectedNote) {
        const addingChordTone = e.shiftKey || chordInputModeRef.current;
        const inputReference = lastNoteInputRef.current ?? currentSelectedNote;
        // Rests carry a placeholder pitch, not a new melodic register, and another voice's note
        // does not set this voice's register. Resolve the preceding pitch from the entry voice
        // so a voice change, Undo and navigation cannot leave a stale octave behind.
        const entryVoice = storedInputVoiceAt(currentSelectedNote);
        const precedingNote = inputReference.isRest || !matchesSelectionLane(inputReference, { ...currentSelectedNote, voiceId: entryVoice })
          ? laneRegisterReference(coreDocument, inputReference.isRest ? inputReference : currentSelectedNote, entryVoice)
          : inputReference;
        // MuseScore resolves a plain letter nearest to the lowest note of the previous chord
        // (NoteInput::resolveNoteInputParams uses downNote()).
        const precedingChord = precedingNote.isRest
          ? []
          : getSimultaneousPitchedNotes(coreDocument, precedingNote).filter((note) => note.voiceId === precedingNote.voiceId);
        const melodicReference = precedingChord.length > 1
          ? precedingChord.reduce((lowest, note) => (
            diatonicPitchIndex(note.step, note.octave) < diatonicPitchIndex(lowest.step, lowest.octave) ? note : lowest
          ), precedingChord[0]!)
          : precedingNote;
        // MuseScore adds a Shift chord tone to the current selection, which after an entry is the
        // note just entered (NoteInput::addPitch with addFlag). nex-note's selection is the next
        // slot, so the chord anchor is the last entered note; the cursor stays where it is.
        const shiftChordAnchor = e.shiftKey && !metaKey && !chordInputModeRef.current
          && lastNoteInputRef.current && !lastNoteInputRef.current.isRest
          ? lastNoteInputRef.current
          : null;
        const chordReferenceNote = shiftChordAnchor ?? currentSelectedNote;
        const sameVoiceChord = addingChordTone
          ? getSimultaneousPitchedNotes(coreDocument, chordReferenceNote)
            .filter((note) => note.voiceId === chordReferenceNote.voiceId)
          : [];
        const pitchReference = sameVoiceChord.length > 0
          ? sameVoiceChord.slice(1).reduce((highest, note) => (
            diatonicPitchIndex(note.step, note.octave) > diatonicPitchIndex(highest.step, highest.octave)
              ? note
              : highest
          ), sameVoiceChord[0]!)
          : melodicReference;
        const pitch = resolveTypedPitch(pitchReference, addingChordTone ? 'above' : 'closest');
        const writtenAccidental = selectedAccidentalRef.current ?? undefined;
        const lastEntered = !e.shiftKey && !metaKey ? beyondScoreCursor() : null;
        if (lastEntered) {
          if (enterBeyondScore(lastEntered, [{ step: pitch.step, octave: pitch.octave, alter: pitch.alter, writtenAccidental }]) && writtenAccidental) {
            setSelectedAccidentalLive(null);
          }
        } else if (metaKey && e.shiftKey) {
          insertNote(pitch.step, pitch.octave, { alter: pitch.alter, writtenAccidental, insertAtCursor: true, asChord: true });
        } else if (e.shiftKey && shiftChordAnchor) {
          const cursor = currentSelectedNote;
          insertNote(pitch.step, pitch.octave, { alter: pitch.alter, writtenAccidental, asChord: true, target: shiftChordAnchor });
          if (!selectedNotesPositionallyEqual(cursor, shiftChordAnchor)) {
            selectSingleNote(cursor, {
              visualOnly: false,
              text: null,
              measureNumber: cursor.measureNumber,
              staffIndex: cursor.staffIndex,
            });
          }
        } else if (e.shiftKey) {
          insertNote(pitch.step, pitch.octave, { alter: pitch.alter, writtenAccidental, asChord: true });
        } else if (storedInputVoiceAt(currentSelectedNote) !== currentSelectedNote.voiceId) {
          // The input voice already has a note at the cursor's onset: enter over it like any entry in
          // that voice, with the armed value and an advancing cursor (F35; MuseScore writes the input
          // state's duration with setNoteRest). It used to change the pitch only.
          const entryVoice = storedInputVoiceAt(currentSelectedNote);
          const voiceNoteAtCursor = buildSemanticSelectionEntries(coreDocument).find((entry) => (
            !entry.isRest
            && entry.measureNumber === currentSelectedNote.measureNumber
            && entry.staffIndex === currentSelectedNote.staffIndex
            && entry.voiceId === entryVoice
            && (!currentSelectedNote.corePartId || !entry.corePartId || entry.corePartId === currentSelectedNote.corePartId)
            && timestampsEqual(entry.timestampNum, entry.timestampDen, currentSelectedNote.timestampNum, currentSelectedNote.timestampDen)
          ));
          const replacedSelectedVoice = Boolean(voiceNoteAtCursor);
          if (voiceNoteAtCursor) {
            insertNote(pitch.step, pitch.octave, { alter: pitch.alter, writtenAccidental, target: toSelectedNote(voiceNoteAtCursor) });
          }
          // The active voice has no note at the cursor yet: enter it at the cursor's onset (MuseScore
          // keeps the input position when the voice changes), not at the last entered note.
          if (!replacedSelectedVoice) insertNote(pitch.step, pitch.octave, { alter: pitch.alter, writtenAccidental, insertAtCursor: true, target: currentSelectedNote });
        } else {
          insertNote(pitch.step, pitch.octave, { alter: pitch.alter, writtenAccidental });
        }
      } else if (measureAnchorSelection && currentSelectedNote) {
        const pitch = resolveTypedPitch(currentSelectedNote.isRest ? clefMiddleLineReference(coreDocument, currentSelectedNote) : currentSelectedNote, 'closest');
        setNoteInputModeLive(true);
        insertNote(pitch.step, pitch.octave, { alter: pitch.alter, writtenAccidental: selectedAccidentalRef.current ?? undefined });
      } else if (currentSelectedNote?.isRest) {
        // The octave comes from the note before the rest in its voice, as it does when note input was
        // started with N; the middle line of the clef only when the voice has no note yet (K12).
        const pitch = resolveTypedPitch(laneRegisterReference(coreDocument, currentSelectedNote, storedInputVoiceAt(currentSelectedNote)), 'closest');
        // A letter on a selected rest starts note input with the cursor on that rest; the entry then
        // takes the note-input path, which keeps a tuplet the rest belongs to (F22).
        lastNoteInputRef.current = currentSelectedNote;
        setNoteInputModeLive(true);
        insertNote(pitch.step, pitch.octave, { alter: pitch.alter, writtenAccidental: selectedAccidentalRef.current ?? undefined });
      } else if (currentSelectedNote && !currentSelectedNote.isRest) {
        changePitch(key, selectedAccidentalRef.current);
      }
      return;
    }
  }, [coreDocument, selectedNote, selectedNotes.length, selectedVisual, Boolean(clipboard), duplicateSelection, copySelectedRange, pasteContent, deleteSelectedNote, rippleDelete, clearMeasureVoice, applyDurationTransform, applyAccidentalChoice, addGraceNoteAtSelection, addTupletToSelection, addIntervalAbove, fillSlashMeasure, changeInputByDurationOctave, changeOctave, changePitch, replaceSelectedPitchAndAdvance, replaceSelectedVoicePitchAtAnchor, insertNote, insertGuitarFret, insertRest, moveInputByDurationPitchCursor, navigateNote, extendSelection, navigateToMeasureBoundary, navigateToScoreBoundary, navigateVertical, selectAllInVoice, toggleStemDirection, toggleSlashNotehead, toggleArticulation, addHairpin, takeBackLastEntry, editBars, moveSelectionToVoice, activateTie, toggleSlur, handleNoteClick, clearSelection, transposeSelectedBySemitone, respellEnharmonically, moveSelectedNoteToAdjacentStaff, prepareInputByDurationPitch, prepareInputByDurationRest, removeLastPreparedDurationTone, toggleInputByDurationMode, toggleNoteInput, toggleStepInputKeyboardMode, repeatLastInput, repeatSelection, commitPreparedDurationInput, setChordInputModeLive, setDuration, setEntryModeLive, setInputByDurationModeLive, setIsDottedLive, setNoteInputModeLive, setPreparedDurationPitchesLive, setStepInputKeyboardModeLive, setSelectedDurationLive, setSelectedVoiceLive, setSelectedGuitarStringLive, resolveEditTargets, selectSingleNote, beyondScoreCursor, enterBeyondScore]);

  return {
    selection: {
      entityIds: selectedNotes
        .map((note) => note.coreEntityId)
        .filter((value): value is string => Boolean(value)),
      anchorEntityId: (lastSelectedRef.current ?? selectedNote)?.coreEntityId ?? null,
      anchor: lastSelectedRef.current ?? selectedNote,
      selectionCount: selectedNotes.length || ((lastSelectedRef.current ?? selectedNote) ? 1 : 0),
      partId: (lastSelectedRef.current ?? selectedNote)?.corePartId ?? null,
      staffIndex: (lastSelectedRef.current ?? selectedNote)?.staffIndex,
      voiceId: (lastSelectedRef.current ?? selectedNote)?.voiceId,
    } satisfies EditorSelection,
    noteInputAnchor: noteInputMode ? (lastNoteInputRef.current ?? selectedNoteRef.current ?? selectedNote) : (selectedNoteRef.current ?? selectedNote),
    selectedNote,
    selectedNotes,
    clipboardCount: clipboard?.timeline.length ?? 0,
    noteInputMode,
    entryMode,
    chordInputMode,
    stepInputKeyboardMode,
    inputByDurationMode,
    preparedDurationPitchLabel: preparedDurationRest ? 'REST' : formatPreparedDurationPitches(preparedDurationPitches),
    preparedDurationActivePitch: preparedDurationRest
      ? null
      : preparedDurationPitches[preparedDurationPitches.length - 1] ?? null,
    leadsheetMode,
    guitarInputMode,
    selectedGuitarString,
    selectedGuitarFret,
    selectedGuitarTuning,
    guitarFretBuffer,
    selectedDuration,
    selectedAccidental,
    isDotted,
    selectedVoice,
    editorError,
    toggleNoteInput,
    toggleStepInputKeyboardMode,
    toggleInputByDurationMode,
    toggleEntryMode: () => setEntryModeLive(entryModeRef.current === 'insert' ? 'overwrite' : 'insert'),
    toggleChordInputMode: () => setChordInputModeLive(!chordInputModeRef.current),
    toggleLeadsheetMode: () => setLeadsheetModeLive(!leadsheetModeRef.current),
    toggleGuitarInputMode: () => {
      const next = !guitarInputModeRef.current;
      if (next && !noteInputModeRef.current) {
        ensureNoteInputAnchor();
        setNoteInputModeLive(true);
      }
      setGuitarInputModeLive(next);
    },
    setGuitarTuning: setSelectedGuitarTuningLive,
    handleNoteClick,
    handleKeyDown,
    setDuration,
    setAccidental: applyAccidentalChoice,
    toggleDotted: () => {
      const currentSelectedNote = selectedNoteRef.current ?? selectedNote;
      if (!noteInputModeRef.current && currentSelectedNote) {
        const current = resolveDurationState(currentSelectedNote, selectedDurationRef.current, isDottedRef.current);
        changeNoteDuration(current.duration, !current.dotted);
        return;
      }
      setIsDottedLive(!isDottedRef.current);
    },
    setVoice: (v: 1 | 2 | 3 | 4) => setSelectedVoiceLive(v),
    deleteSelectedNote,
    rippleDelete,
    duplicateSelection,
    copySelectedRange,
    copySelection,
    cutSelection,
    pasteContent,
    pasteClipboard,
    clearSelection,
    restoreSelection,
    changePitch,
    prepareInputByDurationPitch,
    prepareInputByDurationRest,
    changeInputByDurationOctave,
    replaceSelectedPitchAndAdvance,
    changeNoteDuration,
    changeOctave,
    insertNote,
    insertMidiChord,
    insertGuitarFret,
    setGuitarFretAtNote,
    toggleGuitarTechnique,
    placeNoteAt,
    insertRest,
    insertSlash,
    setHarmonyAtSelection,
    applyInlineEntryCommands,
    addHairpin,
    fillSlashMeasure,
    navigateNote,
    extendSelection,
    navigateToMeasureBoundary,
    navigateVertical,
    navigateToScoreBoundary,
    selectAllInVoice,
    toggleArticulation,
    setAccidentalDisplay,
    clearArticulations,
    addDynamic,
    toggleTie: activateTie,
    toggleSlur,
    stepDynamic,
    transposeSemitones,
    respellEnharmonically,
    commitDraggedPitch,
    commitDraggedGuitarString,
    setBarline,
    addGraceNoteAtSelection,
    addTupletToSelection,
    addIntervalAbove,
    setOsmd,
    DURATION_TYPE_MAP,
  };
}
