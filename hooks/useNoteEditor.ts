'use client';

import { useState, useCallback, useRef, useEffect } from 'react';
import { type ArticulationKind, type DynamicKind, type BarlineKind } from '@/lib/note-editor';
import type { ScoreCommand } from '@/lib/score-commands';
import { dbg } from '@/lib/debug';
import { readClientVisualDebugEnabled } from '@/lib/debug-flags';
import { shouldUseNativeClipboardShortcut } from '@/lib/native-clipboard-shortcuts';
import { applyDocumentCommands } from '@/src/score-core/commands/apply-document-commands';
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
import { resolveKeyboardChordInputShortcut, resolveKeyboardDeleteAction, resolveKeyboardDurationShortcut, resolveKeyboardEditTarget, resolveKeyboardEntryModeShortcut, resolveKeyboardIntervalShortcut } from '@/src/score-input/keyboard-resolver';
import type { MidiPitch } from '@/src/score-input/midi-input';
import { formatPreparedDurationPitches, prepareDurationPitch, updatePreparedDurationPitches, type PreparedDurationPitch } from '@/src/score-input/input-by-duration';
import { resolveGuitarFretPitch, resolveGuitarTuning, type GuitarFretPitch, type GuitarTuningId } from '@/src/score-input/guitar-fretboard';
import { resolveQwertyPianoKey } from '@/src/score-input/repitch-mode';
import { inspectResolvedEditTarget } from '@/src/score-input/note-entry-validator';
import type { ResolvedEditTarget } from '@/src/score-input/types';
import type { ScoreDocumentSelectedDuration, ScoreDocumentSelectionAnchor } from '@/src/score-session/types';
import type { ScoreClipboardPayload } from '@/src/shared/schemas/clipboard';
import { timestampsEqual } from '@/src/shared/music/timestamp-match';
import { resolveNextEnharmonicPitch, writtenAccidentalToAlter, type AccidentalEnclosure, type WrittenAccidental } from '@/src/shared/music/accidentals';
import { diatonicPitchIndex, pitchFromDiatonicIndex, resolveDiatonicIntervalAbove, resolveKeyFifthsAtMeasure, resolveMeasureAccidentalAlter, resolvePitchNameEntry, type DiatonicIntervalNumber } from '@/src/score-input/staff-pitch';

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

function formatRejectedEditMessage(context: string, details: Record<string, unknown>): string {
  const diagnostics = Array.isArray(details.diagnostics) ? details.diagnostics : [];
  const firstDiagnostic = diagnostics.find((diagnostic): diagnostic is { message: string } => (
    Boolean(diagnostic)
    && typeof diagnostic === 'object'
    && 'message' in diagnostic
    && typeof (diagnostic as { message?: unknown }).message === 'string'
  ));
  if (firstDiagnostic) return firstDiagnostic.message;
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
  selectionAnchor?: ScoreDocumentSelectionAnchor | null;
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
}

interface VisualSelection {
  visualOnly: boolean;
  text: string | null;
  measureNumber: number | null;
  staffIndex: number | null;
}

interface UseNoteEditorOptions {
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

function findAdjacentSelection(document: ScoreDocumentModel | null | undefined, current: SelectedNote, direction: 'prev' | 'next') {
  const ordered = getSelectionLaneOrder(document, current);
  const currentIndex = findSelectionIndex(ordered, current);
  if (currentIndex < 0) return null;
  const nextIndex = direction === 'next' ? currentIndex + 1 : currentIndex - 1;
  if (nextIndex < 0 || nextIndex >= ordered.length) return null;
  return ordered[nextIndex];
}

function findNextRhythmicSelection(document: ScoreDocumentModel | null | undefined, current: SelectedNote) {
  const ordered = getSelectionLaneOrder(document, current);
  const currentIndex = findSelectionIndex(ordered, current);
  if (currentIndex < 0) return null;
  return ordered.slice(currentIndex + 1).find((entry) => (
    entry.measureNumber !== current.measureNumber
    || !timestampsEqual(entry.timestampNum, entry.timestampDen, current.timestampNum, current.timestampDen)
  )) ?? null;
}

function isLocalNoteInputAdvance(current: SelectedNote, candidate: SelectedNote | null) {
  if (!candidate) return false;
  if (!matchesSelectionLane(candidate, current)) return false;
  return compareSelectedNotes(candidate, current) > 0;
}

function findMeasureBoundary(document: ScoreDocumentModel | null | undefined, current: SelectedNote, direction: 'prev' | 'next'): SelectedNote | null {
  // Navigate within the same part/staff/voice so measure jumps stay in context.
  const ordered = getSelectionLaneOrder(document, current);
  const currentIndex = findSelectionIndex(ordered, current);
  if (currentIndex < 0) return null;
  if (direction === 'next') {
    const firstInNext = ordered.findIndex((entry) => entry.measureNumber > current.measureNumber);
    return firstInNext >= 0 ? ordered[firstInNext] : null;
  }
  // direction === 'prev'
  const firstInCurrent = ordered.findIndex((entry) => entry.measureNumber === current.measureNumber);
  if (currentIndex === firstInCurrent) {
    // Already at the first note of this measure — jump to first of previous measure
    const prevMeasure = current.measureNumber - 1;
    const firstInPrev = ordered.findIndex((entry) => entry.measureNumber === prevMeasure);
    return firstInPrev >= 0 ? ordered[firstInPrev] : null;
  }
  return firstInCurrent >= 0 ? ordered[firstInCurrent] : null;
}

function findVerticalSelection(document: ScoreDocumentModel | null | undefined, current: SelectedNote, direction: 'up' | 'down'): SelectedNote | null {
  const ordered = getSemanticNoteOrder(document);
  const sameMoment = ordered.filter((entry) => (
    entry.measureNumber === current.measureNumber
    && timestampsEqual(entry.timestampNum, entry.timestampDen, current.timestampNum, current.timestampDen)
    && entry.corePartId === current.corePartId
  ));
  if (!sameMoment.length) return null;

  const ranked = sameMoment.sort((a, b) => (
    a.staffIndex - b.staffIndex
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
  const ordered = getSemanticNoteOrder(document);
  if (!ordered.length) return null;
  return direction === 'start' ? ordered[0] : ordered[ordered.length - 1];
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
      measureNumber: first.measureNumber,
      staffIndex: first.staffIndex,
      voiceId: first.voiceId,
      timestampNum: first.timestampNum,
      timestampDen: first.timestampDen,
    },
    end: {
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

function resolveArticulationShortcut(e: KeyboardEvent): ArticulationKind | null {
  if (e.metaKey || e.ctrlKey || e.altKey || !e.shiftKey) return null;
  if (e.key === 'S') return 'staccato';
  if (e.key === '>' || e.code === 'Period') return 'accent';
  if (e.key === '^' || e.code === 'Digit6') return 'strong-accent';
  if (e.key === '_' || e.key === '−' || e.code === 'Minus') return 'tenuto';
  return null;
}

function resolveAccidentalShortcut(e: KeyboardEvent): AccidentalChoice {
  if (e.metaKey || e.ctrlKey) return null;
  if (e.altKey) {
    if (e.code === 'Minus' || e.key === '-') return 'double-flat';
    if (e.code === 'Equal' || e.key === '=') return 'double-sharp';
    return null;
  }
  if (e.key === '-') return 'flat';
  if (e.key === '=') return 'natural';
  if (e.key === '+') return 'sharp';
  return null;
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
  onApplyCommands: (commands: ScoreCommand[], meta?: NoteEditorUpdateMeta) => void,
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

  const applyEditorCommands = useCallback((commands: ScoreCommand[]) => (
    applyDocumentCommands({ xml, coreDocument }, commands)
  ), [coreDocument, xml]);

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
    noteInputModeRef.current = value;
    setNoteInputMode(value);
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

  const restoreSelection = useCallback((anchor: ScoreDocumentSelectionAnchor | null | undefined) => {
    const restored = resolveSelectionAnchor(coreDocument, anchor);
    if (!restored.length) {
      clearSelection();
      return false;
    }
    const anchorNote = restored.find((note) => note.coreEntityId === anchor?.anchorEntityId) ?? restored[restored.length - 1] ?? null;
    selectedNotesRef.current = restored;
    setSelectedNotes(restored);
    setSelectedNoteLive(anchorNote);
    setSelectedVisualLive(anchorNote ? { visualOnly: false, text: null, measureNumber: anchorNote.measureNumber, staffIndex: anchorNote.staffIndex } : null);
    lastSelectedRef.current = anchorNote;
    return true;
  }, [clearSelection, coreDocument, setSelectedNoteLive, setSelectedVisualLive]);

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
      if (selectedNote.voiceId >= 1 && selectedNote.voiceId <= 4) {
        setSelectedVoiceLive(selectedNote.voiceId as 1 | 2 | 3 | 4);
      }
      if (selectedNote.guitar) {
        setSelectedGuitarStringLive(selectedNote.guitar.string);
        setSelectedGuitarFretLive(selectedNote.guitar.fret);
        if (selectedNote.guitar.tuning) setSelectedGuitarTuningLive(resolveGuitarTuning(selectedNote.guitar.tuning).id);
      }
    }
  }, [noteInputMode, selectedNote, setIsDottedLive, setSelectedAccidentalLive, setSelectedDurationLive, setSelectedGuitarFretLive, setSelectedGuitarStringLive, setSelectedGuitarTuningLive, setSelectedVoiceLive]);

  const handleNoteClick = useCallback((incoming: SelectedNote | null, clickOptions?: NoteClickOptions) => {
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
      if (
        !clickOptions?.additive
        && !clickOptions?.range
        && note.voiceId >= 1
        && note.voiceId <= 4
      ) {
        setSelectedVoiceLive(note.voiceId as 1 | 2 | 3 | 4);
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
    });
    if (matchingDirection) {
      return {
        type: 'removeDirection',
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

  const deleteSelectedNote = useCallback(() => {
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
    onApplyCommands(commands, { selectionAnchor: toSelectionAnchor(currentSelectedNote, currentSelectedNotes) });
    clearSelection();
  }, [selectedNote, selectedNotes, applyEditorCommands, onApplyCommands, clearSelection, findSelectedVisualDeleteCommand, warnNoOpEdit, xml]);

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
        coreMeasureId: note.coreMeasureId ?? null,
        corePartId: note.corePartId ?? null,
        measureNumber: note.measureNumber,
        staffIndex: note.staffIndex,
        voiceId: note.voiceId,
        timestampNum: note.timestampNum,
        timestampDen: note.timestampDen,
      })),
    );
    if (!payload) return;
    setClipboard(payload);
    dbg.editor(`copySelectedRange count=${payload.timeline.length}`);
  }, [coreDocument, selectedNote, selectedNotes]);

  const cutSelection = useCallback(() => {
    const currentSelectedNote = selectedNoteRef.current ?? lastSelectedRef.current ?? selectedNote;
    const currentSelectedNotes = selectedNotesRef.current.length > 0 ? selectedNotesRef.current : selectedNotes;
    const targets = selectedTargets(currentSelectedNote, currentSelectedNotes);
    if (!targets.length) return;
    copySelectedRange();
    deleteSelectedNote();
  }, [copySelectedRange, deleteSelectedNote, selectedNote, selectedNotes]);

  const pasteContent = useCallback(() => {
    const targetNote = noteInputModeRef.current
      ? (lastNoteInputRef.current ?? selectedNoteRef.current ?? selectedNote)
      : (selectedNoteRef.current ?? selectedNote);
    if (!targetNote || !clipboard) return;

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
      mode: entryModeRef.current,
    };
    const commands = [command];
    const next = applyEditorCommands(commands);
    if (next.xml === xml) {
      warnNoOpEdit('pasteContent', command);
      return;
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
      return;
    }

    clearSelection();
  }, [selectedNote, selectedNotes, clipboard, coreDocument, applyEditorCommands, onApplyCommands, clearSelection, resolveSelectionByEntityId, selectMultipleNotes, warnNoOpEdit, xml]);

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
    voiceId: 1 | 2 | 3 | 4,
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

  const changeOctave = useCallback((direction: 1 | -1) => {
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
        const baseOctave = currentPitch?.octave ?? entry.octave;
        const octave = Math.max(0, Math.min(9, baseOctave + direction));
        return { ...entry, octave };
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
    const baseOctave = currentPitch?.octave ?? targetNote.octave;
    const newOctave = Math.max(0, Math.min(9, baseOctave + direction));
    dbg.editor(`changeOctave → ${targetNote.step}${newOctave} (m.${targetNote.measureNumber})`);
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
      step: targetNote.step,
      octave: newOctave,
      alter: targetNote.alter,
    }];
    const next = applyEditorCommands(commands);
    if (next.xml === xml) {
      warnNoOpEdit('changeOctave', commands[0]!);
      return;
    }
    onApplyCommands(commands, { selectionAnchor: noteInputModeRef.current ? null : toSelectionAnchor(targetNote, selectedNotes) });
    const updated = { ...targetNote, octave: newOctave };
    if (lastNoteInputRef.current && selectedNotesEqual(lastNoteInputRef.current, targetNote)) {
      lastNoteInputRef.current = updated;
    }
    if (selectedNoteRef.current && selectedNotesEqual(selectedNoteRef.current, targetNote)) {
      setSelectedNoteLive(updated);
      selectedNotesRef.current = [updated];
      setSelectedNotes([updated]);
    }
    options?.onActiveNotePreview?.(updated);
  }, [coreDocument, selectedNote, selectedNotes, xml, applyEditorCommands, onApplyCommands, options, setSelectedNoteLive, warnNoOpEdit]);

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
      advanceCursor?: boolean;
    },
  ) => {
    setEditorError(null);
    if (!enteredLocator) {
      onApplyCommands(commands, { selectionAnchor: toSelectionAnchor(selectedNote, selectedNotes) });
      return;
    }

    const enteredNote = resolveRecentInputFromDocument(nextDocument, enteredLocator, inputHint);
    if (enteredNote) {
      lastNoteInputRef.current = {
        ...enteredNote,
        durationType: enteredNote.durationType ?? DURATION_TYPE_MAP[selectedDurationRef.current],
        isDotted: enteredNote.isDotted ?? isDottedRef.current,
      };
    }

    const rawNextSelection = behavior?.advanceCursor !== false
      && noteInputModeRef.current && !chordInputModeRef.current && advanceFrom && enteredNote
      ? findNextRhythmicSelection(nextDocument, enteredNote)
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

    onApplyCommands(commands, {
      selectionAnchor: persistedSelectionAnchor,
    });

    if (enteredNote) {
      const soundingNotes = getSimultaneousPitchedNotes(nextDocument, enteredNote);
      if (options?.onActiveNotesPreview) {
        options.onActiveNotesPreview(soundingNotes);
      } else {
        options?.onActiveNotePreview?.(enteredNote);
      }
    }
    if (nextSelection) {
      selectSingleNote(nextSelection, { visualOnly: false, text: null, measureNumber: nextSelection.measureNumber, staffIndex: nextSelection.staffIndex });
      return;
    }
    if (enteredNote) {
      selectSingleNote(enteredNote, { visualOnly: false, text: null, measureNumber: enteredNote.measureNumber, staffIndex: enteredNote.staffIndex });
    }
  }, [chordInputMode, noteInputMode, onApplyCommands, options, resolveRecentInputFromDocument, selectSingleNote, selectedNote, selectedNotes]);

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
    onApplyCommands(commands, { selectionAnchor: toSelectionAnchor(selectedNote, selectedNotes) });
    const resolved = resolveSelectionFromDocument(next.coreDocument, updatedTarget);
    if (resolved) {
      lastNoteInputRef.current = resolved;
      if (selectedNote && selectedNotes.length <= 1) {
        setSelectedNoteLive(resolved);
        selectedNotesRef.current = [resolved];
        setSelectedNotes([resolved]);
      }
    }
  }, [applyEditorCommands, onApplyCommands, resolveActiveDurationTarget, resolveSelectionFromDocument, selectedNote, selectedNotes, setIsDottedLive, setSelectedDurationLive, setSelectedNoteLive, warnNoOpEdit, xml]);

  const setDurationSelection = useCallback((duration: NoteDuration) => {
    // With an active note, duration buttons edit that note even while note
    // input is enabled. Without a selection they set the next entry duration.
    const currentSelectedNote = selectedNoteRef.current ?? selectedNote;
    if (
      noteInputModeRef.current
      && (!currentSelectedNote || !selectedNotesEqual(currentSelectedNote, lastNoteInputRef.current))
    ) {
      setSelectedDurationLive(duration);
      return;
    }
    if (currentSelectedNote) {
      const current = resolveDurationState(currentSelectedNote, selectedDurationRef.current, isDottedRef.current);
      changeNoteDuration(duration, current.dotted);
      return;
    }
    setSelectedDurationLive(duration);
  }, [changeNoteDuration, selectedNote, setSelectedDurationLive]);

  const commitResolvedNoteEntry = useCallback((input: {
    target: ResolvedEditTarget;
    duration: NoteDuration;
    dotted: boolean;
    label: string;
    advanceFrom: SelectedNote;
    notehead?: 'slash';
    stem?: 'none';
    writtenAccidental?: WrittenAccidental;
    guitar?: { string: 1 | 2 | 3 | 4 | 5 | 6; fret: number; tuning?: string; techniques?: string[] };
  }) => {
    const { target, duration, dotted, label, advanceFrom } = input;
    const durationType = DURATION_TYPE_MAP[duration];
    const inspected = inspectResolvedEditTarget({
      coreDocument,
      target,
      durationType,
      isDotted: dotted,
    });
    if (!inspected.target) {
      warnRejectedEdit(label, {
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
          ? findNextRhythmicSelection(coreDocument, enteredNote)
          : null;
        const nextSelection = isLocalNoteInputAdvance(enteredNote, rawNextSelection)
          ? rawNextSelection
          : null;
        const soundingNotes = getSimultaneousPitchedNotes(coreDocument, enteredNote);
        if (options?.onActiveNotesPreview) {
          options.onActiveNotesPreview(soundingNotes);
        } else {
          options?.onActiveNotePreview?.(enteredNote);
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
      advanceCursor: validatedTarget.mode !== 'chord',
    });
    if (writtenAccidental) setSelectedAccidentalLive(null);
    return true;
  }, [applyEditorCommands, commitNoteInputUpdate, coreDocument, options, resolveRecentInputFromDocument, selectSingleNote, setSelectedAccidentalLive, warnNoOpEdit, warnRejectedEdit, xml]);

  const placeNoteAt = useCallback((target: ResolvedEditTarget | LegacyPointerPlacementTarget) => {
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
      duration: selectedDurationRef.current,
      dotted: isDottedRef.current,
      label: 'placeNoteAt',
      advanceFrom,
      writtenAccidental: selectedAccidentalRef.current ?? undefined,
      notehead: leadsheetModeRef.current ? 'slash' : undefined,
      stem: leadsheetModeRef.current ? 'none' : undefined,
    });
  }, [commitResolvedNoteEntry, coreDocument, selectedNote]);

  const insertNote = useCallback((step: string, octave: number, options?: {
    alter?: number;
    asChord?: boolean;
    insertAtCursor?: boolean;
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
    const targetNote = insertAtCursor && noteInputModeRef.current
      ? (lastNoteInputRef.current ?? selectedNoteRef.current ?? selectedNote)
      : (selectedNoteRef.current ?? selectedNote);
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
      selectedVoice: selectedVoiceRef.current,
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

    const targetNote = lastNoteInputRef.current ?? selectedNoteRef.current ?? selectedNote;
    if (!targetNote) return false;
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
      selectedVoice: selectedVoiceRef.current,
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
    if (next.xml === xml) {
      warnNoOpEdit('insertMidiChord', commands[0]!);
      return false;
    }

    warnPostCommitDiagnostics(
      'insertMidiChord',
      validateScoreDocument(coreDocument),
      next.diagnostics,
      validatedTarget,
      commands,
    );
    commitNoteInputUpdate(
      commands,
      next.coreDocument,
      toResolvedEditLocator(validatedTarget),
      targetNote,
      {
        isRest: false,
        step: firstPitch.step,
        octave: firstPitch.octave,
        alter: firstPitch.alter,
      },
    );
    return true;
  }, [applyEditorCommands, commitNoteInputUpdate, coreDocument, resolveEventTimingFromDocument, selectedNote, setPreparedDurationPitchesLive, setPreparedDurationRestLive, warnNoOpEdit, warnRejectedEdit, xml]);

  const commitPreparedDurationPitches = useCallback((duration: NoteDuration) => {
    const pitches = preparedDurationPitchesRef.current;
    if (!inputByDurationModeRef.current || pitches.length === 0) return false;
    const anchor = lastNoteInputRef.current ?? selectedNoteRef.current ?? selectedNote;
    const committed = insertMidiChord(pitches, {
      duration,
      dotted: isDottedRef.current,
      addToMatchingChord: true,
      insertAtCursor: Boolean(anchor && selectedVoiceRef.current !== anchor.voiceId),
    });
    if (committed) setSelectedDurationLive(duration);
    return committed;
  }, [insertMidiChord, selectedNote, setSelectedDurationLive]);

  const insertTiedNote = useCallback(() => {
    if (!noteInputModeRef.current) return false;
    const visibleSelection = selectedNoteRef.current ?? selectedNote;
    const sourceAnchor = lastNoteInputRef.current ?? visibleSelection;
    if (!sourceAnchor || sourceAnchor.isRest) return false;

    const sourceChord = getSimultaneousPitchedNotes(coreDocument, sourceAnchor)
      .filter((note) => note.voiceId === sourceAnchor.voiceId)
      .sort((left, right) => (
        diatonicPitchIndex(left.step, left.octave) - diatonicPitchIndex(right.step, right.octave)
        || left.alter - right.alter
      ));
    if (sourceChord.length === 0) return false;

    const selectedIsNextSlot = Boolean(
      visibleSelection
      && isLocalNoteInputAdvance(sourceAnchor, visibleSelection),
    );
    const targetAnchor = selectedIsNextSlot
      ? visibleSelection
      : findNextRhythmicSelection(coreDocument, sourceAnchor);
    if (!targetAnchor || !isLocalNoteInputAdvance(sourceAnchor, targetAnchor)) {
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
    const commands: ScoreCommand[] = [{
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
    sourceChord.forEach((pitch, index) => {
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
    sourceChord.forEach((pitch) => {
      const sourceEvent = findEventReference(coreDocument, pitch)?.event;
      if (sourceEvent?.kind === 'note' && !sourceEvent.tieStart) {
        commands.push({
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
  }, [applyEditorCommands, commitNoteInputUpdate, coreDocument, selectedNote, warnNoOpEdit, warnRejectedEdit, xml]);

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

  const fillSlashMeasure = useCallback(() => {
    const targetNote = selectedNoteRef.current ?? selectedNote;
    if (!targetNote) return;
    const commands: ScoreCommand[] = [{
      type: 'fillSlashMeasure',
      measureNumber: targetNote.measureNumber,
      staffIndex: targetNote.staffIndex,
      voiceId: selectedVoiceRef.current,
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
    dbg.editor(`insertRest mode=${entryModeRef.current} dur=${DURATION_TYPE_MAP[selectedDurationRef.current]} dotted=${isDottedRef.current} voice=${selectedVoiceRef.current} after m.${targetNote.measureNumber} ts=${targetNote.timestampNum}/${targetNote.timestampDen}`);
    const overwriteSlot = entryModeRef.current === 'overwrite' || (noteInputModeRef.current && selectedVoiceRef.current === targetNote.voiceId);
    const selectedDurationType = DURATION_TYPE_MAP[selectedDurationRef.current];
    const advanceFromEnteredRest = (enteredRest: SelectedNote, shouldAdvance: boolean) => {
      lastNoteInputRef.current = {
        ...enteredRest,
        durationType: enteredRest.durationType ?? selectedDurationType,
        isDotted: enteredRest.isDotted ?? isDottedRef.current,
      };
      const rawNextSelection = shouldAdvance
        ? findNextRhythmicSelection(coreDocument, enteredRest)
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
    const commands: ScoreCommand[] = overwriteSlot
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
        measureNumber: targetNote.measureNumber,
        staffIndex: targetNote.staffIndex,
        voiceId: selectedVoiceRef.current,
        afterTimestampNum: targetNote.timestampNum,
        afterTimestampDen: targetNote.timestampDen,
        durationType: selectedDurationType,
        isDotted: isDottedRef.current,
      }];
    const next = applyEditorCommands(commands);
    if (next.xml === xml) {
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
      voiceId: overwriteSlot ? targetNote.voiceId : selectedVoiceRef.current,
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
      measureNumber: targetNote.measureNumber,
      staffIndex: targetNote.staffIndex,
      voiceId: overwriteSlot ? targetNote.voiceId : selectedVoiceRef.current,
      timestampNum: overwriteSlot ? targetNote.timestampNum : ((selectedTiming?.timestampNum ?? targetNote.timestampNum) + (selectedTiming?.durationDivisions ?? 1)),
      timestampDen: selectedTiming?.timestampDen ?? targetNote.timestampDen,
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
      if (!preparedDurationRestRef.current && preparedDurationPitchesRef.current.length === 0) {
        setPreparedDurationPitchesLive([
          prepareDurationPitch(anchor && !anchor.isRest
            ? { step: anchor.step, octave: anchor.octave, alter: anchor.alter }
            : { step: 'C', octave: 4, alter: 0 }),
        ]);
      }
    }
    setInputByDurationModeLive(next);
  }, [ensureNoteInputAnchor, selectedNote, setInputByDurationModeLive, setNoteInputModeLive, setPreparedDurationPitchesLive, setStepInputKeyboardModeLive]);

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

  const toggleArticulation = useCallback((articulation: ArticulationKind) => {
    const targets = selectedTargets(selectedNote, selectedNotes);
    if (!targets.length) return;
    dbg.editor(`toggleArticulation ${articulation} count=${targets.length}`);
    const commands = targets.map((loc) => ({ type: 'toggleArticulation' as const, articulation, measureNumber: loc.measureNumber, staffIndex: loc.staffIndex, voiceId: loc.voiceId, timestampNum: loc.timestampNum, timestampDen: loc.timestampDen }));
    const next = applyEditorCommands(commands);
    if (next.xml === xml) {
      warnNoOpEdit('toggleArticulation', commands[0]!);
      return;
    }
    onApplyCommands(commands, { selectionAnchor: toSelectionAnchor(selectedNote, selectedNotes) });
  }, [selectedNote, selectedNotes, applyEditorCommands, onApplyCommands, warnNoOpEdit, xml]);

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
    const targets = selectedTargets(selectedNote, selectedNotes).filter((entry) => !entry.isRest);
    if (!targets.length) return;
    dbg.editor(`toggleStemDirection count=${targets.length}`);
    const commands = targets.map((loc) => ({
      type: 'toggleStemDirection' as const,
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
  }, [selectedNote, selectedNotes, applyEditorCommands, onApplyCommands, warnNoOpEdit, xml]);

  const toggleSlashNotehead = useCallback(() => {
    const targets = selectedTargets(selectedNote, selectedNotes).filter((entry) => !entry.isRest);
    if (!targets.length) return;
    dbg.editor(`toggleSlashNotehead count=${targets.length}`);
    const commands = targets.map((loc) => {
      const event = findEventReference(coreDocument, loc)?.event;
      return {
        type: 'setNoteStyle' as const,
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
  }, [selectedNote, selectedNotes, coreDocument, applyEditorCommands, onApplyCommands, warnNoOpEdit, xml]);

  const clearArticulations = useCallback(() => {
    const targets = selectedTargets(selectedNote, selectedNotes);
    if (!targets.length) return;
    dbg.editor(`clearArticulations count=${targets.length}`);
    const range = selectionRange(targets);
    const commands = range
      ? [{ type: 'clearRangeArticulations' as const, range }]
      : targets.map((loc) => ({ type: 'clearArticulations' as const, measureNumber: loc.measureNumber, staffIndex: loc.staffIndex, voiceId: loc.voiceId, timestampNum: loc.timestampNum, timestampDen: loc.timestampDen }));
    const next = applyEditorCommands(commands);
    if (next.xml === xml) {
      warnNoOpEdit('clearArticulations', commands[0]!);
      return;
    }
    onApplyCommands(commands, { selectionAnchor: toSelectionAnchor(selectedNote, selectedNotes) });
  }, [selectedNote, selectedNotes, applyEditorCommands, onApplyCommands, warnNoOpEdit, xml]);

  const addDynamic = useCallback((dynamic: DynamicKind) => {
    const targets = selectedTargets(selectedNote, selectedNotes);
    if (!targets.length) return;
    dbg.editor(`addDynamic ${dynamic} count=${targets.length}`);
    const commands = targets.map((loc) => ({ type: 'addDynamic' as const, dynamic, measureNumber: loc.measureNumber, staffIndex: loc.staffIndex, voiceId: loc.voiceId, timestampNum: loc.timestampNum, timestampDen: loc.timestampDen }));
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
    const currentSelectedNote = selectedNoteRef.current ?? selectedNote;
    const currentSelectedNotes = selectedNotesRef.current.length > 0 ? selectedNotesRef.current : selectedNotes;
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
  }, [applyEditorCommands, coreDocument, onApplyCommands, resolveSelectionByEntityId, selectedNote, selectedNotes, setSelectedAccidentalLive, setSelectedNoteLive, warnNoOpEdit, xml]);

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
  }, [selectedNote, selectedNotes, xml, applyEditorCommands, onApplyCommands, warnNoOpEdit]);

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
  }, [selectedNote, selectedNotes, applyEditorCommands, onApplyCommands, warnRejectedEdit, xml]);

  const navigateNote = useCallback((direction: 'prev' | 'next') => {
    if (!selectedNote) return;
    const next = findAdjacentSelection(coreDocument, selectedNote, direction);
    if (!next) return;
    dbg.editor(`navigateNote ${direction} → m.${next.measureNumber} ts=${next.timestampNum}/${next.timestampDen}`);
    announceSemanticSelectionNavigation();
    handleNoteClick(next);
    options?.onActiveNotePreview?.(next);
  }, [coreDocument, selectedNote, handleNoteClick, options]);

  // Extend or shrink the selection by one note in the given direction.
  // The anchor (lastSelectedRef) stays fixed; selectedNote acts as the moving focus.
  const extendSelection = useCallback((direction: 'prev' | 'next') => {
    const anchor = lastSelectedRef.current;
    if (!anchor) {
      navigateNote(direction);
      return;
    }
    const focus = selectedNote ?? anchor;
    const adjacent = findAdjacentSelection(coreDocument, focus, direction);
    if (!adjacent) return;
    dbg.editor(`extendSelection ${direction} anchor=m.${anchor.measureNumber}/ts=${anchor.timestampNum} focus=m.${focus.measureNumber}/ts=${focus.timestampNum} → m.${adjacent.measureNumber}/ts=${adjacent.timestampNum}`);
    const rangeNotes = resolveRangeSelection(coreDocument, anchor, adjacent);
    selectedNotesRef.current = rangeNotes;
    setSelectedNotes(rangeNotes);
    setSelectedNote(adjacent);
    // lastSelectedRef stays as the anchor — do not update it here
  }, [coreDocument, selectedNote, navigateNote]);

  // Jump to the first note of the previous or next measure (within the same staff+voice).
  const navigateToMeasureBoundary = useCallback((direction: 'prev' | 'next') => {
    if (!selectedNote) return;
    const target = findMeasureBoundary(coreDocument, selectedNote, direction);
    if (!target) return;
    dbg.editor(`navigateMeasure ${direction} → m.${target.measureNumber} ts=${target.timestampNum}/${target.timestampDen}`);
    announceSemanticSelectionNavigation();
    handleNoteClick(target);
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
    handleNoteClick(target);
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
    onApplyCommands(commands, { selectionAnchor: toSelectionAnchor(targetNote, selectionTargets) });
    const updated = { ...targetNote, ...nextPitch };
    if (lastNoteInputRef.current && selectedNotesEqual(lastNoteInputRef.current, targetNote)) {
      lastNoteInputRef.current = updated;
    }
    setSelectedNoteLive(updated);
    selectedNotesRef.current = [updated];
    setSelectedNotes([updated]);
    lastSelectedRef.current = updated;
    options?.onActiveNotePreview?.(updated);
  }, [selectedNote, selectedNotes, applyEditorCommands, onApplyCommands, options, setSelectedNoteLive, warnNoOpEdit, xml]);

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
        measureNumber: source.measureNumber,
        staffIndex: source.staffIndex,
        voiceId: source.voiceId,
        timestampNum: source.timestampNum,
        timestampDen: source.timestampDen,
      }, {
        type: 'insertNoteAt',
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
    if (noteInputModeRef.current && source) {
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
      : anchor;
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
  }, [coreDocument, selectedNote, setPreparedDurationPitchesLive, setPreparedDurationRestLive, setSelectedAccidentalLive]);

  const moveInputByDurationPitchCursor = useCallback((direction: 1 | -1) => {
    const anchor = selectedNoteRef.current ?? selectedNote;
    if (!anchor) return;
    const current = preparedDurationPitchesRef.current;
    const active = current[current.length - 1]
      ?? prepareDurationPitch(anchor.isRest
        ? { step: 'C', octave: 4, alter: 0 }
        : { step: anchor.step, octave: anchor.octave, alter: anchor.alter });
    const nextDiatonic = pitchFromDiatonicIndex(Math.max(0, Math.min(
      diatonicPitchIndex('B', 9),
      diatonicPitchIndex(active.step, active.octave) + direction,
    )));
    const alter = resolveMeasureAccidentalAlter(coreDocument, {
      corePartId: anchor.corePartId,
      measureNumber: anchor.measureNumber,
      staffIndex: anchor.staffIndex,
      timestampNum: anchor.timestampNum,
      timestampDen: anchor.timestampDen,
      step: nextDiatonic.step,
      octave: nextDiatonic.octave,
    });
    const moved = prepareDurationPitch({ ...nextDiatonic, alter });
    const next = current.length > 0 ? [...current.slice(0, -1), moved] : [moved];
    setPreparedDurationRestLive(false);
    setPreparedDurationPitchesLive([...new Map(next.map((pitch) => [pitch.midi, pitch])).values()]
      .sort((left, right) => left.midi - right.midi));
  }, [coreDocument, selectedNote, setPreparedDurationPitchesLive, setPreparedDurationRestLive]);

  const removeLastPreparedDurationTone = useCallback(() => {
    if (preparedDurationRestRef.current) {
      setPreparedDurationRestLive(false);
      const anchor = selectedNoteRef.current ?? selectedNote;
      setPreparedDurationPitchesLive([prepareDurationPitch(anchor && !anchor.isRest
        ? { step: anchor.step, octave: anchor.octave, alter: anchor.alter }
        : { step: 'C', octave: 4, alter: 0 })]);
      return true;
    }
    if (preparedDurationPitchesRef.current.length <= 1) return false;
    setPreparedDurationPitchesLive(preparedDurationPitchesRef.current.slice(0, -1));
    return true;
  }, [selectedNote, setPreparedDurationPitchesLive, setPreparedDurationRestLive]);

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

  const handleKeyDown = useCallback((e: KeyboardEvent) => {
    // Don't intercept when user is typing in an input/textarea
    const target = e.target as HTMLElement;
    if (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable) return;

    const key = e.key.toUpperCase();
    const metaKey = e.metaKey || e.ctrlKey;

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
        deleteSelectedNote();
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
      const qwertyPitch = resolveQwertyPianoKey(e.key);
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
        respellEnharmonically();
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

    if (key === 'N') {
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
      setSelectedVoiceLive(Number(voiceShortcut) as 1 | 2 | 3 | 4);
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
    if (deleteAction === 'delete') {
      e.preventDefault();
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

    if (key === 'Q' && e.shiftKey) {
      e.preventDefault();
      applyDurationTransform(decreaseDottedDuration);
      return;
    }

    if (key === 'W' && e.shiftKey) {
      e.preventDefault();
      applyDurationTransform(increaseDottedDuration);
      return;
    }

    if (key === 'Q') {
      e.preventDefault();
      applyDurationTransform((duration, dotted) => ({ duration: halveDuration(duration), dotted }));
      return;
    }

    if (key === 'W') {
      e.preventDefault();
      applyDurationTransform((duration, dotted) => ({ duration: doubleDuration(duration), dotted }));
      return;
    }

    const accidentalShortcut = resolveAccidentalShortcut(e);
    if (accidentalShortcut) {
      e.preventDefault();
      applyAccidentalChoice(accidentalShortcut, true);
      return;
    }

    // Tie and slur — standard shortcuts matching MuseScore
    if (key === 'X' && e.shiftKey && !metaKey && !e.altKey) {
      if (selectedNote || selectedNotes.length > 0) { e.preventDefault(); toggleSlashNotehead(); }
      return;
    }

    if (key === 'X' && !e.shiftKey && !metaKey && !e.altKey) {
      if (selectedNote || selectedNotes.length > 0) { e.preventDefault(); toggleStemDirection(); }
      return;
    }

    if (key === 'T') {
      if (noteInputModeRef.current || selectedNote || selectedNotes.length > 0) {
        e.preventDefault();
        activateTie();
      }
      return;
    }

    const articulationShortcut = resolveArticulationShortcut(e);
    if (articulationShortcut) {
      if (selectedNote || selectedNotes.length > 0) {
        e.preventDefault();
        toggleArticulation(articulationShortcut);
      }
      return;
    }

    if (key === 'S') {
      if (selectedNote || selectedNotes.length > 0) { e.preventDefault(); toggleSlur(); }
      return;
    }

    const tupletCodeMatch = /^(?:Digit|Numpad)([2-9])$/.exec(e.code);
    const tupletShortcut = metaKey
      ? (tupletCodeMatch?.[1] ?? (/^[2-9]$/.test(e.key) ? e.key : null))
      : null;
    if (tupletShortcut) {
      if (selectedNote || selectedNotes.length > 0) {
        e.preventDefault();
        addTupletToSelection(Number(tupletShortcut) as TupletNumber);
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
      addGraceNoteAtSelection();
      return;
    }

    const guitarStringShortcut = /^[1-6]$/.test(e.key) ? Number(e.key) as GuitarStringNumber : null;
    if (guitarInputModeRef.current && e.altKey && guitarStringShortcut) {
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

    const guitarFretCodeMatch = /^(?:Digit|Numpad)([0-9])$/.exec(e.code);
    const guitarFretShortcut = guitarInputModeRef.current && noteInputModeRef.current
      ? (/^[0-9]$/.test(e.key) ? e.key : guitarFretCodeMatch?.[1] ?? null)
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
    });

    // Duration shortcuts - MuseScore layout: 1=64th ... 7=whole, 8=breve, 9=longa.
    if (durationShortcut) {
      e.preventDefault();
      if (durationShortcut.type === 'selectDuration') {
        if (inputByDurationModeRef.current) commitPreparedDurationInput(durationShortcut.duration);
        else setSelectedDurationLive(durationShortcut.duration);
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
      if (selectedNote) { e.preventDefault(); insertRest(); }
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
      setIsDottedLive(!isDottedRef.current);
      return;
    }

    // Ctrl/Cmd+Shift+vertical arrows: move a single selected note to the adjacent staff.
    if (e.key === 'ArrowUp' && e.shiftKey && metaKey) { e.preventDefault(); moveSelectedNoteToAdjacentStaff('up'); return; }
    if (e.key === 'ArrowDown' && e.shiftKey && metaKey) { e.preventDefault(); moveSelectedNoteToAdjacentStaff('down'); return; }

    // Shift+vertical arrows: octave the active/last typed note.
    if (e.key === 'ArrowUp' && e.shiftKey) { e.preventDefault(); changeOctave(1); return; }
    if (e.key === 'ArrowDown' && e.shiftKey) { e.preventDefault(); changeOctave(-1); return; }

    // Shift+horizontal arrows: extend or shrink the selection by one note.
    if (e.key === 'ArrowLeft' && e.shiftKey) { e.preventDefault(); extendSelection('prev'); return; }
    if (e.key === 'ArrowRight' && e.shiftKey) { e.preventDefault(); extendSelection('next'); return; }

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
        const melodicReference = lastNoteInputRef.current ?? currentSelectedNote;
        const sameVoiceChord = addingChordTone
          ? getSimultaneousPitchedNotes(coreDocument, currentSelectedNote)
            .filter((note) => note.voiceId === currentSelectedNote.voiceId)
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
        if (metaKey && e.shiftKey) {
          insertNote(pitch.step, pitch.octave, { alter: pitch.alter, writtenAccidental, insertAtCursor: true, asChord: true });
        } else if (e.shiftKey) {
          insertNote(pitch.step, pitch.octave, { alter: pitch.alter, writtenAccidental, asChord: true });
        } else if (selectedVoiceRef.current !== currentSelectedNote.voiceId) {
          const replacedSelectedVoice = replaceSelectedVoicePitchAtAnchor(
            currentSelectedNote,
            selectedVoiceRef.current,
            pitch.step,
            pitch.octave,
            pitch.alter,
            writtenAccidental,
          );
          if (!replacedSelectedVoice) insertNote(pitch.step, pitch.octave, { alter: pitch.alter, writtenAccidental, insertAtCursor: true });
        } else {
          insertNote(pitch.step, pitch.octave, { alter: pitch.alter, writtenAccidental });
        }
      } else if (measureAnchorSelection && currentSelectedNote) {
        const pitch = resolveTypedPitch(currentSelectedNote, 'closest');
        setNoteInputModeLive(true);
        insertNote(pitch.step, pitch.octave, { alter: pitch.alter, writtenAccidental: selectedAccidentalRef.current ?? undefined });
      } else if (currentSelectedNote?.isRest) {
        const pitch = resolveTypedPitch(currentSelectedNote, 'closest');
        setNoteInputModeLive(true);
        insertNote(pitch.step, pitch.octave, { alter: pitch.alter, writtenAccidental: selectedAccidentalRef.current ?? undefined, insertAtCursor: true });
      } else if (currentSelectedNote && !currentSelectedNote.isRest) {
        changePitch(key, selectedAccidentalRef.current);
      }
      return;
    }
  }, [selectedNote, selectedNotes.length, selectedVisual, Boolean(clipboard), duplicateSelection, copySelectedRange, pasteContent, deleteSelectedNote, rippleDelete, clearMeasureVoice, applyDurationTransform, applyAccidentalChoice, addGraceNoteAtSelection, addTupletToSelection, addIntervalAbove, fillSlashMeasure, changeInputByDurationOctave, changeOctave, changePitch, replaceSelectedPitchAndAdvance, replaceSelectedVoicePitchAtAnchor, insertNote, insertGuitarFret, insertRest, moveInputByDurationPitchCursor, navigateNote, extendSelection, navigateToMeasureBoundary, navigateToScoreBoundary, navigateVertical, selectAllInVoice, toggleStemDirection, toggleSlashNotehead, toggleArticulation, activateTie, toggleSlur, handleNoteClick, clearSelection, transposeSelectedBySemitone, respellEnharmonically, moveSelectedNoteToAdjacentStaff, prepareInputByDurationPitch, prepareInputByDurationRest, removeLastPreparedDurationTone, toggleInputByDurationMode, toggleNoteInput, toggleStepInputKeyboardMode, repeatLastInput, commitPreparedDurationInput, setChordInputModeLive, setDuration, setEntryModeLive, setInputByDurationModeLive, setIsDottedLive, setNoteInputModeLive, setPreparedDurationPitchesLive, setStepInputKeyboardModeLive, setSelectedDurationLive, setSelectedVoiceLive, setSelectedGuitarStringLive]);

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
