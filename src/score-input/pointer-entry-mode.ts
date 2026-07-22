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
  // clicked the visible ghost notehead. Preserve direct-note selection only for
  // the same semantic onset; a stale glyph from another onset cannot win.
  return !pointerEntryLocatorsShareOnset(ghostTarget, renderedPathNote);
}

export function shouldCommitPointerGhostOverDirectNote(input: {
  ghostTarget: PointerGhostCommitTarget | null | undefined;
  directNote: (PointerPitchLocator & { isRest?: boolean }) | null | undefined;
  directlyHitRendered: boolean;
  clickedNoteheadPath: boolean;
  directNoteheadHit?: boolean;
  clickedVisibleGhostAtPointer: boolean;
  chordInputIntent?: boolean;
  altKey: boolean;
}) {
  const { ghostTarget, directNote } = input;
  if (!ghostTarget?.resolvedTarget) return false;
  if (input.altKey) return true;
  if (
    directNote
    && !directNote.isRest
    && (
      input.directNoteheadHit
      || input.directlyHitRendered
      || input.clickedNoteheadPath
      || pointerEntryLocatorsShareOnset(ghostTarget, directNote)
    )
    && !input.chordInputIntent
  ) {
    return false;
  }
  if (input.clickedVisibleGhostAtPointer) return true;
  if (!directNote) return false;

  const mode = ghostTarget.resolvedTarget.mode ?? ghostTarget.placementMode;
  const sameOnsetDifferentPitch = pointerEntryLocatorsShareOnset(ghostTarget, directNote)
    && !pointerPitchesEqual(ghostTarget, directNote);

  if (input.directNoteheadHit || input.directlyHitRendered || input.clickedNoteheadPath) {
    return Boolean(input.chordInputIntent) && mode === 'chord' && sameOnsetDifferentPitch;
  }

  return sameOnsetDifferentPitch;
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
