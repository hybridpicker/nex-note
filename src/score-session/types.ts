export interface ScoreDocumentSelectionLocator {
  coreMeasureId?: string | null;
  corePartId?: string | null;
  measureNumber: number;
  staffIndex: number;
  voiceId: number;
  timestampNum: number;
  timestampDen: number;
}

export interface ScoreDocumentSelectionAnchor {
  entityIds: string[];
  anchorEntityId: string | null;
  anchorLocator?: ScoreDocumentSelectionLocator | null;
  selectionLocators?: ScoreDocumentSelectionLocator[];
}

export type ScoreViewMode = 'page' | 'continuous-vertical' | 'continuous-horizontal';
export type ScoreDocumentSelectedDuration = 'breve' | 'long' | '1' | '2' | '4' | '8' | '16' | '32' | '64';

export interface ScoreDocumentSessionState {
  selectionAnchor: ScoreDocumentSelectionAnchor | null;
  viewMode: ScoreViewMode;
  zoomPercent: number;
  selectedDuration: ScoreDocumentSelectedDuration;
  selectedVoice: number;
}

export const DEFAULT_SCORE_DOCUMENT_SESSION: ScoreDocumentSessionState = {
  selectionAnchor: null,
  viewMode: 'continuous-vertical',
  zoomPercent: 100,
  selectedDuration: '4',
  selectedVoice: 1,
};

function selectionLocatorEquals(
  a: ScoreDocumentSelectionLocator | null | undefined,
  b: ScoreDocumentSelectionLocator | null | undefined,
) {
  return (a?.coreMeasureId ?? null) === (b?.coreMeasureId ?? null)
    && (a?.corePartId ?? null) === (b?.corePartId ?? null)
    && (a?.measureNumber ?? null) === (b?.measureNumber ?? null)
    && (a?.staffIndex ?? null) === (b?.staffIndex ?? null)
    && (a?.voiceId ?? null) === (b?.voiceId ?? null)
    && (a?.timestampNum ?? null) === (b?.timestampNum ?? null)
    && (a?.timestampDen ?? null) === (b?.timestampDen ?? null);
}

export function selectionAnchorEquals(
  a: ScoreDocumentSelectionAnchor | null | undefined,
  b: ScoreDocumentSelectionAnchor | null | undefined,
) {
  if (a === b) return true;
  if (!a || !b) return false;
  if (a.anchorEntityId !== b.anchorEntityId) return false;
  if (a.entityIds.length !== b.entityIds.length) return false;
  if (a.entityIds.some((entityId, index) => entityId !== b.entityIds[index])) return false;
  if (!selectionLocatorEquals(a.anchorLocator, b.anchorLocator)) return false;

  const aLocators = a.selectionLocators ?? [];
  const bLocators = b.selectionLocators ?? [];
  if (aLocators.length !== bLocators.length) return false;
  return aLocators.every((locator, index) => selectionLocatorEquals(locator, bLocators[index]));
}

export function scoreDocumentSessionEquals(
  a: ScoreDocumentSessionState,
  b: ScoreDocumentSessionState,
) {
  return selectionAnchorEquals(a.selectionAnchor, b.selectionAnchor)
    && a.viewMode === b.viewMode
    && a.zoomPercent === b.zoomPercent
    && a.selectedDuration === b.selectedDuration
    && a.selectedVoice === b.selectedVoice;
}
