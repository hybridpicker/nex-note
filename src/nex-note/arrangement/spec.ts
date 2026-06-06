import type { PitchStep, WrittenPitch } from '@/src/nex-note/arrangement/pitch';

export type ArrangementStylePackId = 'classical-basic' | 'generalbass' | 'jazz-close';
export type ArrangementTexture = 'homophonic-block' | 'polyphonic-linear' | 'mixed-melody-accompanied';
export type ArrangementHarmonicMode = 'conservative' | 'reharm-light' | 'reharm-bold';
export type ArrangementHarmonicRhythm = '1-per-bar' | '2-per-bar' | 'follow-melody-accents';
export type ArrangementMelodyPlacement = 'top' | 'middle' | 'bottom';
export type ArrangementSpacing = 'close' | 'open' | 'drop-2' | 'drop-3';
export type ArrangementBassPolicy = 'explicit' | 'implied' | 'external';
export type ArrangementOmissionTone = 'root' | '3rd' | '5th' | '7th';
export type ArrangementConfidence = 'high' | 'medium' | 'low';
export type CriticSeverity = 'error' | 'warning';
export type ParallelPerfectPolicy = CriticSeverity | 'ignore';
export type HarmonicFunctionLabel =
  | 'tonic'
  | 'predominant'
  | 'dominant'
  | 'secondary-dominant'
  | 'applied-leading-tone'
  | 'subV'
  | 'borrowed'
  | 'passing'
  | 'pedal'
  | 'other';

export interface RangeDef {
  min: WrittenPitch;
  max: WrittenPitch;
}

export interface PitchClassSpelling {
  step: PitchStep;
  alter: number;
}

export interface TonalCenter {
  tonic: PitchClassSpelling;
  mode: 'major' | 'minor';
}

export interface MelodyRef {
  source: 'chat-inline' | 'score-selection' | 'primary-voice' | 'part';
  partId?: string;
  voiceId?: number;
  measureRange?: {
    start: number;
    end: number;
  };
  description?: string;
}

export interface ArrangementConstraints {
  avoidParallelFifthsOctaves?: boolean;
  avoidHiddenParallels?: boolean;
  preferStepwiseInnerVoices?: boolean;
  spacing: ArrangementSpacing;
  maxIntervalBetweenTopVoices?: number;
  omissionPriority: ArrangementOmissionTone[];
  bassPolicy?: ArrangementBassPolicy;
  instrumentRanges?: Partial<Record<'voice1' | 'voice2' | 'voice3' | 'voice4', RangeDef>>;
  parallelPerfectPolicy?: ParallelPerfectPolicy;
}

export interface ArrangementSpec {
  sourceMelody: MelodyRef;
  texture: ArrangementTexture;
  stylePack: ArrangementStylePackId;
  harmonicMode: ArrangementHarmonicMode;
  harmonicRhythm: ArrangementHarmonicRhythm;
  melodyPlacement: ArrangementMelodyPlacement;
  tonalCenter?: TonalCenter;
  constraints: ArrangementConstraints;
}

export interface HarmonicCandidate {
  symbol: string;
  weight: number;
  rationale?: string;
}

export interface HarmonicPlanSpan {
  segmentId?: string;
  measure: number;
  beatNum: number;
  beatDen: number;
  chosen: string;
  functionLabel?: HarmonicFunctionLabel;
  durationBeats?: number;
  cadenceStrength?: 'soft' | 'structural' | 'cadential';
  rationale?: string;
  alternatives?: HarmonicCandidate[];
}

export interface HarmonicPlan {
  spans: HarmonicPlanSpan[];
}

export interface HarmonicPlanCandidate {
  candidateId: string;
  summary: string;
  confidence: ArrangementConfidence;
  segments: HarmonicPlanSpan[];
}

export interface ArrangementVoiceEvent {
  voiceIndex: number;
  role?: 'melody' | 'inner' | 'bass';
  pitch: WrittenPitch | null;
}

export interface VoicingSlice {
  measure: number;
  beatNum: number;
  beatDen: number;
  harmony?: string;
  functionLabel?: HarmonicFunctionLabel;
  harmonicSegmentId?: string;
  voices: ArrangementVoiceEvent[];
}

export interface VoicingPlan {
  texture: ArrangementTexture;
  slices: VoicingSlice[];
}

export interface VoicingCandidate {
  candidateId: string;
  basedOnHarmonicCandidateId?: string;
  summary: string;
  confidence: ArrangementConfidence;
  slices: VoicingSlice[];
}

export interface PlannerResponse {
  plannerVersion: string;
  spec: ArrangementSpec;
  harmonicPlanCandidates: HarmonicPlanCandidate[];
  voicingCandidates: VoicingCandidate[];
  notes?: string[];
}

export interface CriticIssue {
  code:
    | 'parallel-perfect-fifth'
    | 'parallel-perfect-octave'
    | 'voice-range'
    | 'voice-crossing'
    | 'voice-spacing'
    | 'doubled-leading-tone'
    | 'unresolved-leading-tone';
  severity: CriticSeverity;
  ruleId:
    | 'parallel-perfect-intervals'
    | 'voice-range'
    | 'voice-geometry'
    | 'harmonic-doubling'
    | 'leading-tone-resolution';
  location: {
    measure: number;
    beatNum: number;
    beatDen: number;
    sliceIndex: number;
    voices: number[];
  };
  message: string;
}

export interface CriticReport {
  stylePack: ArrangementStylePackId;
  valid: boolean;
  inspectedSlices: number;
  issues: CriticIssue[];
  errorCount: number;
  warningCount: number;
}

export interface ArrangementStylePack {
  id: ArrangementStylePackId;
  label: string;
  description: string;
  defaults: Omit<ArrangementSpec, 'sourceMelody' | 'stylePack'>;
}
