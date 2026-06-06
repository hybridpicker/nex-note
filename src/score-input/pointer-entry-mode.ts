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
  return (
    (leftMeasureId && rightMeasureId ? leftMeasureId === rightMeasureId : left.measureNumber === right.measureNumber)
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

export function shouldCommitPointerGhostOverDirectNote(input: {
  ghostTarget: PointerGhostCommitTarget | null | undefined;
  directNote: PointerPitchLocator | null | undefined;
  directlyHitRendered: boolean;
  clickedNoteheadPath: boolean;
  clickedVisibleGhostAtPointer: boolean;
  altKey: boolean;
}) {
  const { ghostTarget, directNote } = input;
  if (!ghostTarget?.resolvedTarget) return false;
  if (input.altKey || input.clickedVisibleGhostAtPointer) return true;
  if (!directNote) return false;

  const mode = ghostTarget.resolvedTarget.mode ?? ghostTarget.placementMode;
  if (mode === 'insert') {
    return pointerEntryLocatorsShareOnset(ghostTarget, directNote)
      && !pointerPitchesEqual(ghostTarget, directNote);
  }
  if (input.directlyHitRendered || input.clickedNoteheadPath) return false;
  return pointerEntryLocatorsShareOnset(ghostTarget, directNote)
    && !pointerPitchesEqual(ghostTarget, directNote);
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

  const hasNoteAnchor = target.placementAnchorIsRest === false;
  const recentCommitSameOnset = hasNoteAnchor && pointerEntryLocatorsShareOnset(target, input.recentCommitTarget);
  const noteInputAnchorSameOnset = hasNoteAnchor && pointerEntryLocatorsShareOnset(target, input.noteInputAnchor);
  const selectedSameOnset = hasNoteAnchor && pointerEntryLocatorsShareOnset(target, input.selectedNote);

  if (recentCommitSameOnset) {
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
    if (noteInputAnchorSameOnset && !selectedSameOnset) return target;
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
  if (noteInputAnchorSameOnset && !selectedSameOnset) {
    return {
      ...target,
      placementMode: 'chord',
    };
  }
  return {
    ...target,
    placementMode: 'insert',
  };
}
