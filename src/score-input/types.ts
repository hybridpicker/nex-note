export type EditPlacementMode = 'replace' | 'insert' | 'chord';

export type EditInputSource = 'pointer' | 'keyboard';

export interface InteractiveEditSlot {
  id: string;
  measureId: string;
  measureNumber: number;
  corePartId: string | null;
  staffIndex: number;
  timestampNum: number;
  timestampDen: number;
  ratio: number;
  domX: number;
  voiceIds: number[];
  synthetic: boolean;
}

export interface InteractivePitchLane {
  id: string;
  measureId: string;
  measureNumber: number;
  corePartId: string | null;
  staffIndex: number;
  step: string;
  octave: number;
  alter: number;
  avgDomY: number;
  sampleCount: number;
}

export interface InteractiveEditStaffMap {
  staffIndex: number;
  slots: InteractiveEditSlot[];
  slotsByTimestamp: Map<string, InteractiveEditSlot>;
  pitchLanes: InteractivePitchLane[];
  pitchLanesByPitch: Map<string, InteractivePitchLane>;
}

export interface InteractiveEditMeasureMap {
  measureId: string;
  measureNumber: number;
  corePartId: string | null;
  staves: InteractiveEditStaffMap[];
  stavesByIndex: Map<number, InteractiveEditStaffMap>;
}

export interface InteractiveEditMap {
  measures: Map<string, InteractiveEditMeasureMap>;
  measureOrder: string[];
  diagnostics: string[];
}

export interface ResolvedEditTarget {
  source: EditInputSource;
  mode: EditPlacementMode;
  measureId: string | null;
  corePartId: string | null;
  measureNumber: number;
  staffIndex: number;
  voiceId: number;
  timestampNum: number;
  timestampDen: number;
  ratio: number;
  domX: number | null;
  relativeAfterTimestampNum?: number;
  relativeAfterTimestampDen?: number;
  allowOccupiedInsert?: boolean;
  step: string;
  octave: number;
  alter: number;
  existingEventKind?: 'note' | 'rest' | null;
  existingEventStartsAtTarget?: boolean;
  diagnostics: string[];
}

export interface ResolvedEditLocator {
  coreMeasureId: string | null;
  corePartId: string | null;
  measureNumber: number;
  staffIndex: number;
  voiceId: number;
  timestampNum: number;
  timestampDen: number;
}

export function normalizeTimestamp(num: number, den: number) {
  const safeDen = Math.max(1, Math.abs(den));
  if (!Number.isFinite(num) || !Number.isFinite(safeDen)) return { num: 0, den: 1 };

  const n = Math.trunc(num);
  const d = Math.trunc(safeDen);
  const divisor = gcd(Math.abs(n), Math.abs(d));
  return {
    num: n / divisor,
    den: d / divisor,
  };
}

export function timestampKey(num: number, den: number) {
  const normalized = normalizeTimestamp(num, den);
  return `${normalized.num}/${normalized.den}`;
}

export function pitchKey(step: string, alter: number, octave: number) {
  return `${step.toUpperCase()}:${Math.trunc(alter)}:${Math.trunc(octave)}`;
}

export function clampVoiceId(voiceId: number) {
  const parsed = Math.trunc(voiceId);
  return Number.isFinite(parsed) && parsed >= 1 ? parsed : 1;
}

function gcd(left: number, right: number): number {
  let a = Math.abs(left);
  let b = Math.abs(right);
  while (b !== 0) {
    const temp = b;
    b = a % b;
    a = temp;
  }
  return a || 1;
}
