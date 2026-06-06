import type { DirectionNode, SlurSpan, TimedEvent } from '@/src/score-core/model/types';

export interface ClipboardLaneIdentifier {
  sourceStaffIndex: number;
  sourceVoiceId: number;
}

export interface ClipboardTargetOffset {
  measureNumber: number;
  timestampNum: number;
  timestampDen: number;
}

export interface ClipboardAbsoluteEvent extends ClipboardLaneIdentifier {
  absStart: number;
  event: TimedEvent;
}

export interface ClipboardTimedDirection {
  sourceStaffIndex: number;
  absStart: number;
  direction: DirectionNode;
}

export interface ScoreClipboardPayload {
  kind: 'score-content';
  version: 1;
  durationDivisions: number;
  lanes: ClipboardLaneIdentifier[];
  timeline: ClipboardAbsoluteEvent[];
  noteSpanners: SlurSpan[];
  timedDirections: ClipboardTimedDirection[];
}
