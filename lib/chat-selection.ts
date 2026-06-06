import type { EditorSelection } from '@/hooks/useNoteEditor';

export interface SerializableEditorSelection {
  entityIds: string[];
  anchorEntityId: string | null;
  anchor: {
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
    isRest: boolean;
  } | null;
  selectionCount?: number;
  partId?: string | null;
  staffIndex?: number;
  voiceId?: number;
}

export function serializeEditorSelection(selection?: EditorSelection): SerializableEditorSelection | undefined {
  if (!selection) return undefined;

  return {
    entityIds: [...selection.entityIds],
    anchorEntityId: selection.anchorEntityId,
    anchor: selection.anchor ? {
      coreEntityId: selection.anchor.coreEntityId ?? null,
      coreVoiceId: selection.anchor.coreVoiceId ?? null,
      coreMeasureId: selection.anchor.coreMeasureId ?? null,
      corePartId: selection.anchor.corePartId ?? null,
      measureNumber: selection.anchor.measureNumber,
      staffIndex: selection.anchor.staffIndex,
      voiceId: selection.anchor.voiceId,
      timestampNum: selection.anchor.timestampNum,
      timestampDen: selection.anchor.timestampDen,
      step: selection.anchor.step,
      octave: selection.anchor.octave,
      alter: selection.anchor.alter,
      isRest: selection.anchor.isRest,
    } : null,
    selectionCount: selection.selectionCount,
    partId: selection.partId ?? null,
    staffIndex: selection.staffIndex,
    voiceId: selection.voiceId,
  };
}
