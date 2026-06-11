import type { WrittenPitch } from '@/src/nex-note/arrangement/pitch';
import type { ArrangementSpec, HarmonicPlanCandidate, VoicingCandidate } from '@/src/nex-note/arrangement/spec';
import type { DocumentState } from '@/src/score-core/commands/apply-document-commands';
import type { NoteEvent } from '@/src/score-core/model/types';
import type { ScoreCommand } from '@/src/shared/schemas/score-command';

export interface RealizationTarget {
  partId?: string;
  corePartId: string;
  staffIndex: number;
  voiceIds: number[];
  measureRange: {
    start: number;
    end: number;
  };
  mode: 'replace-range';
}

export interface RealizedSpanEvent {
  kind: 'note' | 'rest';
  measureNumber: number;
  staffIndex: number;
  voiceId: number;
  timestampNum: number;
  timestampDen: number;
  durationType: string;
  isDotted: boolean;
  pitch?: WrittenPitch;
  sourceSliceIndex: number;
}

export interface RealizedTabMirrorEvent extends Omit<RealizedSpanEvent, 'kind' | 'pitch'> {
  kind: 'note';
  pitch: WrittenPitch;
  guitar: NonNullable<NoteEvent['guitar']>;
}

export interface RealizationMirrorTarget {
  target: RealizationTarget;
  events: RealizedTabMirrorEvent[];
}

export interface RealizationPlan {
  spec: ArrangementSpec;
  harmonicCandidate?: Pick<HarmonicPlanCandidate, 'candidateId' | 'summary'>;
  voicingCandidate: Pick<VoicingCandidate, 'candidateId' | 'summary'>;
  target: RealizationTarget;
  events: RealizedSpanEvent[];
  mirrors?: RealizationMirrorTarget[];
}

export interface RealizerIssue {
  code:
    | 'missing-core-document'
    | 'ambiguous-target-part'
    | 'paired-tab-not-mirrored'
    | 'missing-target-staff'
    | 'missing-measure-timing'
    | 'empty-voicing'
    | 'non-monotonic-slices'
    | 'unsupported-duration'
    | 'post-realization-validation';
  severity: 'error' | 'warning';
  message: string;
}

export interface RealizerResult {
  plan: RealizationPlan | null;
  commands: ScoreCommand[];
  issues: RealizerIssue[];
  valid: boolean;
  documentState?: DocumentState | null;
}
