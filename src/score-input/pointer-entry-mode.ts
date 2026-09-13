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
  if (
    hitPitchedNotehead
    && directNoteSharesOnset
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

  const hasNoteAnchor = target.placementAnchorIsRest === false
    || (target.placementAnchorIsRest == null && target.placementMode === 'replace');
  const recentCommitSameOnset = pointerEntryLocatorsShareOnset(target, input.recentCommitTarget);
  const noteInputAnchorSameOnset = hasNoteAnchor && pointerEntryLocatorsShareOnset(target, input.noteInputAnchor);
  const selectedSameOnset = hasNoteAnchor && pointerEntryLocatorsShareOnset(target, input.selectedNote);

  if (recentCommitSameOnset) {
    return {
      ...target,
      placementMode: 'chord',
      placementModePromotedByRecentCommit: true,
    };
  }
  if (noteInputAnchorSameOnset) {
    return {
      ...target,
      placementMode: 'chord',
    };
  }
  if (input.entryMode === 'insert' && hasNoteAnchor && target.placementMode === 'replace') {
    return {
      ...target,
      placementMode: 'chord',
    };
  }

  if (target.placementMode === 'chord') {
    if (input.entryMode === 'overwrite') {
      return {
        ...target,
        placementMode: 'replace',
      };
    }
    return {
      ...target,
      placementMode: 'insert',
    };
  }

  if (input.entryMode !== 'insert') return target;
  if (selectedSameOnset) {
    return {
      ...target,
      placementMode: 'replace',
    };
  }
  if (target.placementMode !== 'replace') return target;
  if (!hasNoteAnchor) return target;
  return {
    ...target,
    placementMode: 'insert',
  };
}
