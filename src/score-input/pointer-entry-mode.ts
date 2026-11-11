import { timestampsEqual } from '@/src/shared/music/timestamp-match';

export type PointerEntryMode = 'insert' | 'overwrite';
export type PointerGhostPlacementMode = 'replace' | 'insert' | 'chord';

export interface PointerEntryLocator {
  measureId?: string | null;
  coreMeasureId?: string | null;
  corePartId?: string | null;
  measureNumber: number;
  staffIndex: number;
  voiceId: number;
  timestampNum: number;
  timestampDen: number;
}

export interface PointerEntryModeTarget extends PointerEntryLocator {
  placementMode: PointerGhostPlacementMode;
  placementLockedByModifier?: boolean;
  placementAnchorIsRest?: boolean;
  placementModePromotedByRecentCommit?: boolean;
}

export interface PointerPitchLocator extends PointerEntryLocator {
  step: string;
  octave: number;
  alter: number;
}

export interface PointerGhostCommitTarget extends PointerPitchLocator {
  placementMode: PointerGhostPlacementMode;
  resolvedTarget?: { mode?: PointerGhostPlacementMode } | null;
}

export function pointerEntryLocatorsShareOnset(
  left: PointerEntryLocator | null | undefined,
  right: PointerEntryLocator | null | undefined,
) {
  if (!left || !right) return false;
  const leftMeasureId = left.measureId ?? left.coreMeasureId ?? null;
  const rightMeasureId = right.measureId ?? right.coreMeasureId ?? null;
  const partsMatch = left.corePartId && right.corePartId ? left.corePartId === right.corePartId : true;
  const measuresMatch = leftMeasureId && rightMeasureId
    ? leftMeasureId === rightMeasureId || (partsMatch && left.measureNumber === right.measureNumber)
    : left.measureNumber === right.measureNumber;
  return (
    partsMatch
    && measuresMatch
    && left.staffIndex === right.staffIndex
    && left.voiceId === right.voiceId
    && timestampsEqual(left.timestampNum, left.timestampDen, right.timestampNum, right.timestampDen)
  );
}

function pointerPitchesEqual(left: PointerPitchLocator, right: PointerPitchLocator) {
  return left.step === right.step
    && left.octave === right.octave
    && left.alter === right.alter;
}

export function shouldTreatPointerAsExplicitVisibleGhost(input: {
  ghostTarget: PointerGhostCommitTarget | null | undefined;
  renderedPathNote: (PointerPitchLocator & { isRest?: boolean }) | null | undefined;
  clickedVisibleGhost: boolean;
}) {
  const { ghostTarget, renderedPathNote } = input;
  if (!input.clickedVisibleGhost || !ghostTarget?.resolvedTarget) return false;
  if (!renderedPathNote || renderedPathNote.isRest) return true;

  // The score SVG is below the pointer-transparent ghost overlay, so the event
  // path can legitimately contain a different rendered note even when the user
  // clicked the visible ghost notehead. Preserve direct-note selection only when
  // the rendered note is the exact same semantic pitch at the same onset.
  return !pointerEntryLocatorsShareOnset(ghostTarget, renderedPathNote)
    || !pointerPitchesEqual(ghostTarget, renderedPathNote);
}

export function shouldCommitPointerGhostOverDirectNote(input: {
  ghostTarget: PointerGhostCommitTarget | null | undefined;
  directNote: (PointerPitchLocator & { isRest?: boolean }) | null | undefined;
  directlyHitRendered: boolean;
  clickedNoteheadPath: boolean;
  directNoteheadHit?: boolean;
  directNoteIsActiveSelection?: boolean;
  pointerCloserToGhostNotehead?: boolean;
  clickedVisibleGhostAtPointer: boolean;
  chordInputIntent?: boolean;
  altKey: boolean;
}) {
  const { ghostTarget, directNote } = input;
  if (!ghostTarget?.resolvedTarget) return false;
  if (input.altKey) return true;
  const directNoteSharesOnset = pointerEntryLocatorsShareOnset(ghostTarget, directNote);
  const directNoteSharesPitch = Boolean(directNote && pointerPitchesEqual(ghostTarget, directNote));
  const hitPitchedNotehead = Boolean(
    directNote
    && !directNote.isRest
    && (input.directNoteheadHit || input.directlyHitRendered || input.clickedNoteheadPath),
  );

  // An exact SVG notehead press is selection/drag intent unless chord entry is
  // explicitly armed. The pointer-transparent ghost may have been promoted to
  // chord mode by the active input anchor, but that promotion must not turn a
  // press on the selected tone into a second note before dragging begins.
  if (
    hitPitchedNotehead
    && input.clickedNoteheadPath
    && directNoteSharesOnset
    && (directNoteSharesPitch || (input.directNoteIsActiveSelection && !(ghostTarget.placementMode === 'chord' && input.pointerCloserToGhostNotehead)))
    && !input.chordInputIntent
  ) {
    return false;
  }

  // A visible ghost at another semantic pitch or onset is an explicit entry
  // target even when the broad rendered-glyph tolerance also finds a nearby
  // note. Only an actual SVG notehead path at the same semantic onset retains
  // press/drag priority. This matters in compact measures where an actionable
  // rest ghost can sit inside the neighbouring note's generous hit rectangle.
  if (
    input.clickedVisibleGhostAtPointer
    && !input.clickedNoteheadPath
    && !(directNote && !directNote.isRest && directNoteSharesOnset && directNoteSharesPitch)
  ) {
    return true;
  }

  // MuseScore also gives a confidently resolved existing notehead priority over
  // a replace ghost: a press selects the exact chord tone and a subsequent move
  // drags it. Chord-entry mode deliberately keeps the inverse priority so users
  // can still add a new chord tone.
  // The priority holds for a press on the note at its own pitch. A ghost at another pitch is what
  // the user sees and aims at; the hit rectangle of a nearby notehead (generous, and at 50 % zoom
  // several staff steps tall) must not turn that click into a selection (M4, corpus M7).
  if (
    hitPitchedNotehead
    && directNoteSharesOnset
    && directNoteSharesPitch
    && ghostTarget.placementMode === 'replace'
    && !input.chordInputIntent
  ) return false;

  if (
    input.clickedVisibleGhostAtPointer
    && !(directNote && !directNote.isRest && directNoteSharesOnset && directNoteSharesPitch)
  ) {
    return true;
  }
  if (
    directNote
    && !directNote.isRest
    && directNoteSharesOnset
    && directNoteSharesPitch
    && !input.chordInputIntent
  ) {
    return false;
  }
  if (!directNote) return false;

  const sameOnsetDifferentPitch = directNoteSharesOnset && !directNoteSharesPitch;

  if (sameOnsetDifferentPitch) return true;

  if (input.directNoteheadHit || input.directlyHitRendered || input.clickedNoteheadPath) {
    return false;
  }

  return false;
}

export function resolveMuseScorePointerEntryMode<T extends PointerEntryModeTarget>(
  target: T | null,
  input: {
    entryMode: PointerEntryMode;
    chordInputMode: boolean;
    selectedNote?: PointerEntryLocator | null;
    noteInputAnchor?: PointerEntryLocator | null;
    recentCommitTarget?: PointerEntryLocator | null;
    /** What stands at the target onset in the input voice, when it is a note or chord. */
    anchorChord?: { valueMatchesArmed: boolean; hasPitch: boolean; noteCount: number } | null;
  },
): T | null {
  if (!target || target.placementLockedByModifier) return target;

  if (input.chordInputMode) {
    return target.placementAnchorIsRest === false
      ? {
          ...target,
          placementMode: 'chord',
        }
      : target;
  }

  // MuseScore (handbook, "Entering notes and rests"): in note input a click adds a note to the chord
  // at that position, and writes over a rest. Where the pointer stands around the notehead does not
  // matter, and a plain click never pushes the following music later. Shift (replace), Alt (chord)
  // and Ctrl/Cmd+Shift (insert) arrive here locked. M4 in docs/note-entry-mastery-ledger.md.
  // A chord to add to is a note of the input voice at this onset. When the caller looked it up
  // (`anchorChord` is given, null for none), that is the answer: the notehead under the pointer may
  // belong to another voice, and then the entry goes into the input voice beside it.
  const hasNoteAnchor = input.anchorChord !== undefined
    ? Boolean(input.anchorChord)
    : (target.placementAnchorIsRest === false
      || (target.placementAnchorIsRest == null && target.placementMode !== 'insert'));

  if (pointerEntryLocatorsShareOnset(target, input.recentCommitTarget)) {
    // The note of the click before is not in the rendered score yet: its place still reads as a rest.
    return {
      ...target,
      placementMode: 'chord',
      placementModePromotedByRecentCommit: true,
    };
  }
  if (input.entryMode === 'overwrite') {
    // The mode shown as "Replace": every click replaces what stands at the onset.
    return target.placementMode === 'replace' ? target : { ...target, placementMode: 'replace' };
  }
  if (hasNoteAnchor) {
    // `NoteInput::putNote`: the note joins the chord only when "chord duration == input duration";
    // otherwise the armed value is written over what stands there.
    if (input.anchorChord && !input.anchorChord.valueMatchesArmed) {
      return target.placementMode === 'replace' ? target : { ...target, placementMode: 'replace' };
    }
    return target.placementMode === 'chord' ? target : { ...target, placementMode: 'chord' };
  }
  if (target.placementAnchorIsRest === true && target.placementMode !== 'replace') {
    return { ...target, placementMode: 'replace' };
  }
  return target;
}
