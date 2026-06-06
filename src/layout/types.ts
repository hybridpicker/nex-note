import type { TimedEvent } from '@/src/score-core/model/types';

export type RhythmSpellingFragment = {
  sourceEventId: string;
  fragmentId: string;
  startDivisions: number;
  durationDivisions: number;
  durationType: string;
  isDotted?: boolean;
  tieStart?: boolean;
  tieStop?: boolean;
  beamGroupId?: string;
};

export type MeasureSpellingHints = {
  preserveImportedSpelling?: boolean;
  forceSplitAt?: number[];
  manualBeamGroup?: string[];
};

export type RhythmSpellingMeasureKey = {
  partId: string;
  staffIndex: number;
  measureNumber: number;
};

export type RhythmSpellingFragmentWithEvent = RhythmSpellingFragment & {
  event: TimedEvent;
};

export type RhythmSpellingVoiceProjection = RhythmSpellingMeasureKey & {
  voiceId: number;
  divisions: number;
  measureDurationDivisions: number;
  fragments: RhythmSpellingFragmentWithEvent[];
};

export type RhythmSpellingProjection = {
  schemaVersion: 1;
  kind: 'nex-note-rhythm-spelling-projection';
  generatedAt: string;
  voices: RhythmSpellingVoiceProjection[];
  diagnostics: RhythmSpellingProjectionDiagnostic[];
};

export type RhythmSpellingProjectionDiagnostic = {
  level: 'info' | 'warning' | 'error';
  code: string;
  message: string;
  partId?: string;
  staffIndex?: number;
  measureNumber?: number;
  voiceId?: number;
  eventId?: string;
};
