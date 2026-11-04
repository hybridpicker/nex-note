import type { NoteEditOperation } from '@/lib/note-editor';
import type { ScoreClipboardPayload, ClipboardTargetOffset } from '@/src/shared/schemas/clipboard';
import { CommandValidationError } from '@/src/shared/errors/command-errors';
import { isWrittenAccidental, writtenAccidentalToAlter, type WrittenAccidental } from '@/src/shared/music/accidentals';

export type NoteLocatorLike = {
  coreEntityId?: string | null;
  coreMeasureId?: string | null;
  corePartId?: string | null;
  step?: string;
  octave?: number;
  alter?: number;
  isRest?: boolean;
  measureNumber: number;
  staffIndex: number;
  voiceId: number;
  timestampNum: number;
  timestampDen: number;
};

export type LegacyScoreOperation =
  | { type: 'removeArticulations' }
  | { type: 'deleteRange'; corePartId?: string | null; range: { start: NoteLocatorLike; end: NoteLocatorLike } }
  | { type: 'clearMeasureVoice'; corePartId?: string | null; measureNumber: number; staffIndex: number; voiceId: number }
  | ({ type: 'replaceMidiPassage'; takeId: string; ticksPerQuarter: number; lengthTicks: number; notes: Array<{ midi: number; startTick: number; durationTicks: number }> } & NoteLocatorLike)
  | ({ type: 'editTupletUnit'; action: 'pitch' | 'chord' | 'rest'; step: string; alter: number; octave: number } & NoteLocatorLike)
  | ({ type: 'editRhythm'; operation: 'insert' | 'delete' | 'resize'; scope: 'voice' | 'instrument' | 'score'; endMeasureNumber: number; durationType: string; isDotted?: boolean } & NoteLocatorLike)
  | ({ type: 'rippleDelete' } & NoteLocatorLike)
  | { type: 'rippleDeleteRange'; range: { start: NoteLocatorLike; end: NoteLocatorLike } }
  | { type: 'setKey'; fifths: number }
  | { type: 'transposeDocumentChromatic'; semitones: number }
  | { type: 'setTempo'; bpm: number }
  | { type: 'setTitle'; title: string }
  | { type: 'setSubtitle'; subtitle: string }
  | { type: 'setArranger'; arranger: string }
  | { type: 'setComposer'; composer: string }
  | { type: 'addStartRepeat' }
  | { type: 'addEndRepeat'; measureNumber?: number }
  | { type: 'addVolta2' }
  | { type: 'setEnding'; measureNumber: number; number: string; endingType: 'start' | 'stop' | 'discontinue' }
  | { type: 'addChords'; chords: string }
  | { type: 'setHarmonyAt'; value: string; measureNumber: number; staffIndex?: number; timestampNum: number; timestampDen: number; corePartId?: string | null }
  | { type: 'fillSlashMeasure'; measureNumber: number; staffIndex?: number; voiceId?: number; stem?: 'none'; corePartId?: string | null }
  | ({ type: 'duplicateNote' } & NoteLocatorLike)
  | { type: 'setTimeSignature'; beats: number; beatType: number; beatGroups?: number[]; measureNumber?: number }
  | { type: 'setClef'; sign: 'G' | 'F' | 'C'; line: 1 | 2 | 3 | 4 | 5; measureNumber?: number; staffIndex?: number }
  | { type: 'removeClefChange'; measureNumber: number; staffIndex?: number }
  | { type: 'insertMeasureAfter'; measureNumber: number }
  | { type: 'deleteMeasure'; measureNumber: number }
  | ({ type: 'addLyric'; text: string; syllabic?: 'single' | 'begin' | 'middle' | 'end' } & NoteLocatorLike)
  | ({ type: 'removeLyricLine'; verseNumber: number } & NoteLocatorLike)
  | ({ type: 'setNoteStyle'; notehead?: 'slash'; stem?: 'none' | 'up' | 'down' } & NoteLocatorLike)
  | ({ type: 'toggleStemDirection' } & NoteLocatorLike)
  | ({ type: 'setGuitarFret'; string: 1 | 2 | 3 | 4 | 5 | 6; fret: number; tuning?: string; techniques?: string[] } & NoteLocatorLike)
  | ({ type: 'toggleGuitarTechnique'; technique: string } & NoteLocatorLike)
  | ({ type: 'setArticulationPlacement'; articulation: string; placement?: 'above' | 'below' } & NoteLocatorLike)
  | ({ type: 'setSlurPlacement'; placement: 'above' | 'below'; stopLocator: NoteLocatorLike } & NoteLocatorLike)
  | { type: 'addRehearsalMark'; text: string; measureNumber: number }
  | { type: 'addRehearsalMarksEvery'; interval: number; startMeasureNumber?: number; endMeasureNumber?: number; style?: 'letters' | 'numbers' }
  | { type: 'addWords'; text: string; measureNumber: number; placement?: 'above' | 'below'; corePartId?: string | null; staffIndex?: number }
  | { type: 'addExpressionText'; text: string; measureNumber: number; placement?: 'above' | 'below'; corePartId?: string | null; staffIndex?: number }
  | {
      type: 'addAnalysisAnnotation';
      text: string;
      analysisType?: 'schenkerian' | 'romanNumeral' | 'forteSet' | 'chordScale' | 'neoRiemannian' | 'form' | 'motivic' | 'other';
      measureNumber?: number;
      startMeasureNumber?: number;
      endMeasureNumber?: number;
      staffIndex?: number;
      placement?: 'above' | 'below';
    }
  | {
      type: 'addTechniqueInstruction';
      instrument: string;
      text: string;
      partId?: string;
      startMeasureNumber: number;
      endMeasureNumber: number;
      staffIndex?: number;
      placement?: 'above' | 'below';
    }
  | {
      type: 'addSyncPoint';
      measureNumber: number;
      timestampNum?: number;
      timestampDen?: number;
      timecode?: string;
      label: string;
      scoringIntent: string;
      staffIndex?: number;
      placement?: 'above' | 'below';
    }
  | {
      type: 'addOrchestrationNote';
      instruction: string;
      partId?: string;
      partName?: string;
      startMeasureNumber: number;
      endMeasureNumber: number;
      staffIndex?: number;
      placement?: 'above' | 'below';
    }
  | { type: 'removeDirection'; text: string; measureNumber: number; staffIndex?: number; kind?: string }
  | { type: 'setSystemBreak'; measureNumber: number; value?: boolean }
  | { type: 'setPageBreak'; measureNumber: number; value?: boolean }
  | { type: 'setMeasureLayoutHint'; measureNumber: number; hint: 'newSystem' | 'newPage' | 'staffSpacing' | 'collisionPolicy'; value: boolean | number | string; staffIndex?: number; partId?: string }
  | { type: 'setPartName'; partId: string; name: string }
  | { type: 'setPartAbbreviation'; partId: string; abbreviation: string }
  | { type: 'setInstrumentName'; partId: string; instrumentName: string }
  | { type: 'setPartTranspose'; partId: string; chromatic: number; diatonic?: number }
  | { type: 'fitRangeOctaves'; minMidi: number; maxMidi: number; staffIndex?: number; voiceId?: number; startMeasureNumber?: number; endMeasureNumber?: number }
  | { type: 'fitPartToInstrument'; instrument: 'voice' | 'flute' | 'violin' | 'clarinet-bb' | 'trumpet-bb' | 'alto-sax-eb' | 'cello'; partId?: string }
  | { type: 'applyPracticeProfile'; profile: 'rehearsal' | 'roomy' | 'compact'; startMeasureNumber?: number; endMeasureNumber?: number }
  | { type: 'transposeRangeChromatic'; semitones: number; range: { start: NoteLocatorLike; end: NoteLocatorLike } }
  | { type: 'clearRangeArticulations'; range: { start: NoteLocatorLike; end: NoteLocatorLike } }
  | { type: 'insertNoteAt'; coreMeasureId?: string | null; corePartId?: string | null; measureNumber: number; staffIndex: number; voiceId: number; timestampNum: number; timestampDen: number; step: string; octave: number; alter: number; writtenAccidental?: WrittenAccidental; durationType: string; isDotted?: boolean; asChord?: boolean; preserveOverflow?: boolean; notehead?: 'slash'; stem?: 'none'; guitar?: { string: 1 | 2 | 3 | 4 | 5 | 6; fret: number; tuning?: string; techniques?: string[] } }
  | { type: 'insertRestAt'; coreMeasureId?: string | null; corePartId?: string | null; measureNumber: number; staffIndex: number; voiceId: number; timestampNum: number; timestampDen: number; durationType: string; isDotted?: boolean }
  | ({ type: 'setLyricLine'; verseNumber: number; text: string; syllabic?: 'single' | 'begin' | 'middle' | 'end' } & NoteLocatorLike)
  | {
      type: 'addTuplet';
      convertRange?: boolean;
      coreEntityId?: string | null;
      coreMeasureId?: string | null;
      corePartId?: string | null;
      measureNumber: number;
      staffIndex: number;
      voiceId: number;
      startTimestampNum: number;
      startTimestampDen: number;
      stopTimestampNum: number;
      stopTimestampDen: number;
      actualNotes: number;
      normalNotes: number;
      bracket?: boolean;
      showNumber?: 'actual' | 'both' | 'none';
    }
  | ({ type: 'addGraceNote'; slash?: boolean } & NoteLocatorLike)
  | ({ type: 'removeGraceNote' } & NoteLocatorLike)
  | ({ type: 'moveGraceNote'; direction: 'earlier' | 'later' } & NoteLocatorLike)
  | ({ type: 'setRhythmSpelling'; literal: boolean } & NoteLocatorLike)
  | { type: 'setAccidentalPolicy'; policy: 'none' | 'barline' | 'always' }
  | ({ type: 'addFingering'; fingering: string } & NoteLocatorLike)
  | ({ type: 'addOrnament'; ornament: 'trill-mark' | 'mordent' | 'inverted-mordent' | 'turn' } & NoteLocatorLike)
  | {
      type: 'addWedge';
      kind: 'crescendo' | 'diminuendo';
      staffIndex: number;
      startMeasureNumber: number;
      startTimestampNum: number;
      startTimestampDen: number;
      stopMeasureNumber: number;
      stopTimestampNum: number;
      stopTimestampDen: number;
      placement?: 'above' | 'below';
    }
  | {
      type: 'addPedalSpan';
      staffIndex: number;
      startMeasureNumber: number;
      startTimestampNum: number;
      startTimestampDen: number;
      stopMeasureNumber: number;
      stopTimestampNum: number;
      stopTimestampDen: number;
    }
  | {
      type: 'addOttava';
      kind: '8va' | '8vb' | '15ma' | '15mb';
      staffIndex: number;
      startMeasureNumber: number;
      startTimestampNum: number;
      startTimestampDen: number;
      stopMeasureNumber: number;
      stopTimestampNum: number;
      stopTimestampDen: number;
      placement?: 'above' | 'below';
    }
  | {
      type: 'pasteContent';
      targetPartId: string;
      targetStaffIndex: number;
      targetOffset: ClipboardTargetOffset;
      clipboardData: ScoreClipboardPayload;
      mode: 'insert' | 'overwrite';
    }
  | ({ type: 'addFermata'; placement?: 'above' | 'below' } & NoteLocatorLike)
  | ({ type: 'removeFermata' } & NoteLocatorLike)
  | ({ type: 'addTremolo'; lines: 1 | 2 | 3; tremoloType: 'single' | 'start' | 'stop' } & NoteLocatorLike)
  | {
      type: 'addGlissando';
      lineType?: 'solid' | 'dashed' | 'dotted' | 'wavy';
      text?: string;
      start: NoteLocatorLike;
      stop: NoteLocatorLike;
    }
  | ({ type: 'addArpeggio'; direction?: 'up' | 'down'; nonArpeggiate?: boolean } & NoteLocatorLike)
  | { type: 'addSegno'; measureNumber: number; staffIndex?: number; placement?: 'above' | 'below' }
  | { type: 'addCoda'; measureNumber: number; staffIndex?: number; placement?: 'above' | 'below' }
  | { type: 'addDacapo'; measureNumber: number; staffIndex?: number }
  | { type: 'addDalsegno'; measureNumber: number; staffIndex?: number }
  | { type: 'addFine'; measureNumber: number; staffIndex?: number }
  | { type: 'addToCoda'; measureNumber: number; staffIndex?: number }
  | { type: 'setMeasureRepeat'; measureNumber: number; repeatCount: number }
  | { type: 'addTempoText'; text: string; measureNumber: number; bpm?: number; staffIndex?: number }
  | { type: 'setSwing'; ratio: number }
  | { type: 'setInstrumentChange'; measureNumber: number; instrumentName: string; partId?: string }
  | ({ type: 'setCueNote'; isCue: boolean } & NoteLocatorLike)
  | { type: 'setMultiMeasureRest'; measureNumber: number; enabled: boolean }
  | ({ type: 'addGuitarBend'; bendSemitones: number } & NoteLocatorLike)
  | ({ type: 'addGuitarTap' } & NoteLocatorLike);

export type ScoreCommandCategory = 'content' | 'notation' | 'structure' | 'attributes' | 'layoutHints';

export interface ScoreCommandTarget {
  scope: 'document' | 'part' | 'measure' | 'voice' | 'note';
  partId?: string;
  corePartId?: string;
  measureNumber?: number;
  staffIndex?: number;
  voiceId?: number;
  locator?: NoteLocatorLike;
  entityIds?: string[];
  range?: {
    start: NoteLocatorLike;
    end: NoteLocatorLike;
  };
}

export interface ScoreCommandEnvelopeMeta {
  schemaVersion?: 1;
  category?: ScoreCommandCategory;
  target?: ScoreCommandTarget;
  payload?: Record<string, unknown>;
}

export type ScoreCommand = (LegacyScoreOperation | NoteEditOperation) & ScoreCommandEnvelopeMeta;
export type ValidatedScoreCommand = ScoreCommand & Required<Pick<ScoreCommandEnvelopeMeta, 'schemaVersion' | 'category' | 'target' | 'payload'>>;

export interface ScorePartSummary {
  id: string;
  name: string;
  abbreviation?: string;
  instrumentName?: string;
  chromaticTranspose?: number;
  diatonicTranspose?: number;
}

export interface ScoreDocumentSummary {
  title?: string;
  subtitle?: string;
  arranger?: string;
  composer?: string;
  parts: ScorePartSummary[];
}

const NOTE_EDIT_TYPES = new Set([
  'changeNotePitch',
  'setAccidentalDisplay',
  'changeNoteDuration',
  'replaceWithRest',
  'deleteNote',
  'clearMeasureVoice',
  'rippleDelete',
  'rippleDeleteRange',
  'insertNote',
  'insertNoteAt',
  'insertRest',
  'insertRestAt',
  'setNoteStyle',
  'toggleStemDirection',
  'setGuitarFret',
  'toggleGuitarTechnique',
  'toggleArticulation',
  'setArticulationPlacement',
  'clearArticulations',
  'addDynamic',
  'toggleTie',
  'setTiePlacement',
  'toggleSlur',
  'setSlurPlacement',
  'transposeChromatic',
  'setBarline',
  'addGraceNote',
  'removeGraceNote',
]);

function ensureRecord(value: unknown, label: string): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new CommandValidationError(`Invalid ${label}`, [`${label} must be an object`]);
  }
  return value as Record<string, unknown>;
}

function ensureString(record: Record<string, unknown>, key: string, issues: string[]) {
  if (typeof record[key] !== 'string' || !(record[key] as string).trim()) issues.push(`${key} must be a non-empty string`);
}

function ensureText(record: Record<string, unknown>, key: string, issues: string[]) {
  if (typeof record[key] !== 'string') issues.push(`${key} must be a string`);
}

function ensureNumber(record: Record<string, unknown>, key: string, issues: string[], opts?: { min?: number; max?: number }) {
  const value = record[key];
  if (typeof value !== 'number' || Number.isNaN(value)) {
    issues.push(`${key} must be a number`);
    return;
  }
  if (opts?.min != null && value < opts.min) issues.push(`${key} must be >= ${opts.min}`);
  if (opts?.max != null && value > opts.max) issues.push(`${key} must be <= ${opts.max}`);
}

function ensureBoolean(record: Record<string, unknown>, key: string, issues: string[]) {
  if (record[key] != null && typeof record[key] !== 'boolean') issues.push(`${key} must be a boolean when provided`);
}

function ensureLocator(record: Record<string, unknown>, issues: string[]) {
  if (record.coreEntityId != null) ensureString(record, 'coreEntityId', issues);
  if (record.coreMeasureId != null) ensureString(record, 'coreMeasureId', issues);
  if (record.corePartId != null) ensureString(record, 'corePartId', issues);
  ensureNumber(record, 'measureNumber', issues, { min: 0 });
  ensureNumber(record, 'staffIndex', issues, { min: 1 });
  ensureNumber(record, 'voiceId', issues, { min: 1 });
  ensureNumber(record, 'timestampNum', issues, { min: 0 });
  ensureNumber(record, 'timestampDen', issues, { min: 1 });
}

function ensureRange(record: Record<string, unknown>, issues: string[]) {
  if (!record.range || typeof record.range !== 'object' || Array.isArray(record.range)) {
    issues.push('range must be an object');
    return;
  }
  const range = record.range as Record<string, unknown>;
  const start = range.start;
  const end = range.end;
  if (!start || typeof start !== 'object' || Array.isArray(start)) {
    issues.push('range.start must be an object');
  } else {
    ensureLocator(start as Record<string, unknown>, issues);
  }
  if (!end || typeof end !== 'object' || Array.isArray(end)) {
    issues.push('range.end must be an object');
  } else {
    ensureLocator(end as Record<string, unknown>, issues);
  }
}

function ensureClipboardTargetOffset(value: unknown, issues: string[]) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    issues.push('targetOffset must be an object');
    return;
  }
  ensureNumber(value as Record<string, unknown>, 'measureNumber', issues, { min: 1 });
  ensureNumber(value as Record<string, unknown>, 'timestampNum', issues, { min: 0 });
  ensureNumber(value as Record<string, unknown>, 'timestampDen', issues, { min: 1 });
}

function ensureClipboardData(value: unknown, issues: string[]) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    issues.push('clipboardData must be an object');
    return;
  }
  const record = value as Record<string, unknown>;
  if (record.kind !== 'score-content') issues.push('clipboardData.kind must be score-content');
  ensureNumber(record, 'version', issues, { min: 1, max: 1 });
  ensureNumber(record, 'durationDivisions', issues, { min: 1 });
  if (!Array.isArray(record.lanes)) issues.push('clipboardData.lanes must be an array');
  if (!Array.isArray(record.timeline)) issues.push('clipboardData.timeline must be an array');
  if (!Array.isArray(record.noteSpanners)) issues.push('clipboardData.noteSpanners must be an array');
  if (!Array.isArray(record.timedDirections)) issues.push('clipboardData.timedDirections must be an array');
}

function ensureMeasureSpan(record: Record<string, unknown>, issues: string[], opts?: { allowSingleMeasure?: boolean }) {
  if (opts?.allowSingleMeasure && record.measureNumber != null) {
    ensureNumber(record, 'measureNumber', issues, { min: 1 });
    if (record.startMeasureNumber != null) ensureNumber(record, 'startMeasureNumber', issues, { min: 1 });
    if (record.endMeasureNumber != null) ensureNumber(record, 'endMeasureNumber', issues, { min: 1 });
  } else {
    ensureNumber(record, 'startMeasureNumber', issues, { min: 1 });
    ensureNumber(record, 'endMeasureNumber', issues, { min: 1 });
  }
  const start = typeof record.startMeasureNumber === 'number' ? record.startMeasureNumber : record.measureNumber;
  const end = typeof record.endMeasureNumber === 'number' ? record.endMeasureNumber : record.measureNumber;
  if (typeof start === 'number' && typeof end === 'number' && end < start) {
    issues.push('endMeasureNumber must be >= startMeasureNumber');
  }
}

function getCategory(type: string): ScoreCommandCategory {
  if (['setKey', 'setTimeSignature', 'setClef', 'removeClefChange', 'setPartTranspose'].includes(type)) return 'attributes';
  if (['setSystemBreak', 'setPageBreak', 'setMeasureLayoutHint', 'applyPracticeProfile'].includes(type)) return 'layoutHints';
  if (['insertMeasureAfter', 'deleteMeasure', 'addStartRepeat', 'addEndRepeat', 'addVolta2', 'setEnding', 'setMeasureRepeat'].includes(type)) return 'structure';
  if (['addSegno', 'addCoda', 'addDacapo', 'addDalsegno', 'addFine', 'addToCoda', 'addTempoText', 'setCueNote'].includes(type)) return 'notation';
  if (['setSwing'].includes(type)) return 'layoutHints';
  if (['setInstrumentChange', 'setMultiMeasureRest'].includes(type)) return 'structure';
  if (['addGuitarBend', 'addGuitarTap'].includes(type)) return 'notation';
  if (['removeArticulations', 'toggleArticulation', 'setArticulationPlacement', 'clearArticulations', 'clearRangeArticulations', 'addDynamic', 'toggleTie', 'setTiePlacement', 'toggleSlur', 'setSlurPlacement', 'addWords', 'addExpressionText', 'addAnalysisAnnotation', 'addTechniqueInstruction', 'addSyncPoint', 'addOrchestrationNote', 'addRehearsalMark', 'addRehearsalMarksEvery', 'removeDirection', 'setHarmonyAt', 'setNoteStyle', 'setAccidentalDisplay', 'toggleStemDirection', 'setGuitarFret', 'toggleGuitarTechnique', 'fillSlashMeasure', 'setLyricLine', 'removeLyricLine', 'addTuplet', 'addGraceNote', 'removeGraceNote', 'addFingering', 'addOrnament', 'addWedge', 'addPedalSpan', 'addOttava', 'addFermata', 'removeFermata', 'addTremolo', 'addGlissando', 'addArpeggio'].includes(type)) return 'notation';
  return 'content';
}

function getTarget(command: Record<string, unknown>): ScoreCommandTarget {
  const target: ScoreCommandTarget = { scope: 'document' };
  if (Array.isArray(command.entityIds) && command.entityIds.every((value) => typeof value === 'string')) {
    target.entityIds = command.entityIds as string[];
  }
  if (command.range && typeof command.range === 'object' && !Array.isArray(command.range)) {
    const range = command.range as Record<string, unknown>;
    const start = range.start as Record<string, unknown> | undefined;
    const end = range.end as Record<string, unknown> | undefined;
    if (start && end) {
      const commandCorePartId = typeof command.corePartId === 'string' ? command.corePartId : undefined;
      target.range = {
        start: {
          corePartId: typeof start.corePartId === 'string' ? start.corePartId : commandCorePartId,
          measureNumber: Number(start.measureNumber),
          staffIndex: Number(start.staffIndex),
          voiceId: Number(start.voiceId),
          timestampNum: Number(start.timestampNum),
          timestampDen: Number(start.timestampDen),
        },
        end: {
          corePartId: typeof end.corePartId === 'string' ? end.corePartId : commandCorePartId,
          measureNumber: Number(end.measureNumber),
          staffIndex: Number(end.staffIndex),
          voiceId: Number(end.voiceId),
          timestampNum: Number(end.timestampNum),
          timestampDen: Number(end.timestampDen),
        },
      };
    }
  }
  if (target.range) return { ...target, scope: 'voice' };
  if (command.type === 'pasteContent') {
    return {
      ...target,
      scope: 'part',
      partId: String(command.targetPartId),
      staffIndex: Number(command.targetStaffIndex),
      measureNumber: Number((command.targetOffset as ClipboardTargetOffset | undefined)?.measureNumber ?? 0),
    };
  }
  if (command.type === 'clearMeasureVoice') {
    return {
      ...target,
      scope: 'voice',
      corePartId: typeof command.corePartId === 'string' ? command.corePartId : undefined,
      measureNumber: Number(command.measureNumber),
      staffIndex: Number(command.staffIndex),
      voiceId: Number(command.voiceId),
    };
  }
  if (typeof command.partId === 'string') return { ...target, scope: 'part', partId: command.partId };
  if (NOTE_EDIT_TYPES.has(String(command.type)) || command.type === 'duplicateNote' || command.type === 'addLyric' || command.type === 'setLyricLine' || command.type === 'removeLyricLine') {
    const locator = {
      coreEntityId: typeof command.coreEntityId === 'string' ? command.coreEntityId : undefined,
      measureNumber: Number(command.measureNumber),
      staffIndex: Number(command.staffIndex),
      voiceId: Number(command.voiceId),
      timestampNum: Number(command.timestampNum),
      timestampDen: Number(command.timestampDen),
    };
    return {
      ...target,
      scope: 'note',
      measureNumber: locator.measureNumber,
      staffIndex: locator.staffIndex,
      voiceId: locator.voiceId,
      locator,
    };
  }
  if (typeof command.startMeasureNumber === 'number') {
    return { ...target, scope: 'measure', measureNumber: command.startMeasureNumber, staffIndex: typeof command.staffIndex === 'number' ? command.staffIndex : undefined };
  }
  if (typeof command.measureNumber === 'number') {
    return { ...target, scope: 'measure', measureNumber: command.measureNumber, staffIndex: typeof command.staffIndex === 'number' ? command.staffIndex : undefined };
  }
  return target;
}

function getPayload(command: Record<string, unknown>) {
  const payload: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(command)) {
    if (['type', 'schemaVersion', 'category', 'target', 'payload'].includes(key)) continue;
    payload[key] = value;
  }
  return payload;
}

export function isNoteEditCommand(command: ScoreCommand): command is NoteEditOperation {
  return NOTE_EDIT_TYPES.has(command.type);
}

export function normalizeScoreCommand(input: unknown): ValidatedScoreCommand {
  const command = ensureRecord(input, 'command');
  const issues: string[] = [];
  ensureString(command, 'type', issues);
  const type = String(command.type ?? '');

  switch (type) {
    case 'removeArticulations':
    case 'addStartRepeat':
    case 'addVolta2':
      break;
    case 'deleteRange':
    case 'rippleDeleteRange':
    case 'clearRangeArticulations':
      if (command.corePartId != null) ensureString(command, 'corePartId', issues);
      ensureRange(command, issues);
      break;
    case 'clearMeasureVoice':
      if (command.corePartId != null) ensureString(command, 'corePartId', issues);
      ensureNumber(command, 'measureNumber', issues, { min: 1 });
      ensureNumber(command, 'staffIndex', issues, { min: 1 });
      ensureNumber(command, 'voiceId', issues, { min: 1 });
      break;
    case 'setKey':
      ensureNumber(command, 'fifths', issues, { min: -7, max: 7 });
      break;
    case 'transposeDocumentChromatic':
      ensureNumber(command, 'semitones', issues, { min: -24, max: 24 });
      break;
    case 'setTempo':
      ensureNumber(command, 'bpm', issues, { min: 1, max: 400 });
      break;
    case 'setTitle':
      ensureText(command, 'title', issues);
      break;
    case 'setSubtitle':
      ensureText(command, 'subtitle', issues);
      break;
    case 'setArranger':
      ensureText(command, 'arranger', issues);
      break;
    case 'setComposer':
      ensureText(command, 'composer', issues);
      break;
    case 'addEndRepeat':
      if (command.measureNumber != null) ensureNumber(command, 'measureNumber', issues, { min: 1 });
      break;
    case 'setEnding':
      ensureNumber(command, 'measureNumber', issues, { min: 1 });
      ensureString(command, 'number', issues);
      if (!['start', 'stop', 'discontinue'].includes(String(command.endingType ?? ''))) issues.push('endingType must be start, stop, or discontinue');
      break;
    case 'addChords':
      ensureString(command, 'chords', issues);
      break;
    case 'setHarmonyAt':
      ensureString(command, 'value', issues);
      ensureNumber(command, 'measureNumber', issues, { min: 1 });
      if (command.staffIndex != null) ensureNumber(command, 'staffIndex', issues, { min: 1 });
      ensureNumber(command, 'timestampNum', issues, { min: 0 });
      ensureNumber(command, 'timestampDen', issues, { min: 1 });
      break;
    case 'fillSlashMeasure':
      ensureNumber(command, 'measureNumber', issues, { min: 1 });
      if (command.staffIndex != null) ensureNumber(command, 'staffIndex', issues, { min: 1 });
      if (command.voiceId != null) ensureNumber(command, 'voiceId', issues, { min: 1 });
      if (command.stem != null && command.stem !== 'none') issues.push('stem must be none when provided');
      break;
    case 'duplicateNote':
    case 'addLyric':
    case 'setLyricLine':
    case 'removeLyricLine':
    case 'setNoteStyle':
    case 'toggleStemDirection':
    case 'setGuitarFret':
    case 'toggleGuitarTechnique':
    case 'changeNotePitch':
    case 'setAccidentalDisplay':
    case 'changeNoteDuration':
    case 'replaceWithRest':
    case 'deleteNote':
    case 'rippleDelete':
    case 'toggleArticulation':
    case 'setArticulationPlacement':
    case 'clearArticulations':
    case 'addDynamic':
    case 'toggleTie':
    case 'setTiePlacement':
    case 'toggleSlur':
    case 'setSlurPlacement':
    case 'transposeChromatic':
      ensureLocator(command, issues);
      if (type === 'changeNotePitch') {
        ensureString(command, 'step', issues);
        ensureNumber(command, 'octave', issues, { min: 0, max: 9 });
        ensureNumber(command, 'alter', issues, { min: -2, max: 2 });
        if (command.writtenAccidental != null && !isWrittenAccidental(command.writtenAccidental)) {
          issues.push('writtenAccidental must be a supported standard accidental when provided');
        } else if (isWrittenAccidental(command.writtenAccidental) && command.alter !== writtenAccidentalToAlter(command.writtenAccidental)) {
          issues.push('writtenAccidental must match alter');
        }
        if (command.accidentalCautionary != null && typeof command.accidentalCautionary !== 'boolean') {
          issues.push('accidentalCautionary must be a boolean when provided');
        }
        if (command.accidentalEnclosure != null && !['none', 'round', 'square'].includes(String(command.accidentalEnclosure))) {
          issues.push('accidentalEnclosure must be none, round, or square when provided');
        }
        if (!command.writtenAccidental && (command.accidentalCautionary || (command.accidentalEnclosure != null && command.accidentalEnclosure !== 'none'))) {
          issues.push('accidental display metadata requires writtenAccidental');
        }
      } else if (type === 'setAccidentalDisplay') {
        if (typeof command.cautionary !== 'boolean') issues.push('cautionary must be a boolean');
        if (!['none', 'round', 'square'].includes(String(command.enclosure))) {
          issues.push('enclosure must be none, round, or square');
        }
      } else if (type === 'changeNoteDuration' || type === 'replaceWithRest') {
        ensureString(command, 'durationType', issues);
        ensureBoolean(command, 'isDotted', issues);
      }
      if (type === 'toggleArticulation' || type === 'setArticulationPlacement') {
        ensureString(command, 'articulation', issues);
      }
      if ((type === 'toggleArticulation' || type === 'setArticulationPlacement') && command.placement != null && !['above', 'below'].includes(String(command.placement))) {
        issues.push('placement must be above or below');
      }
      if (type === 'addDynamic') {
        ensureString(command, 'dynamic', issues);
        if (command.placement != null && !['above', 'below'].includes(String(command.placement))) {
          issues.push('placement must be above or below');
        }
      }
      if (type === 'setTiePlacement' && !['above', 'below'].includes(String(command.placement))) {
        issues.push('placement must be above or below');
      }
      if (type === 'setNoteStyle') {
        if (command.notehead != null && command.notehead !== 'slash') issues.push('notehead must be slash when provided');
        if (command.stem != null && !['none', 'up', 'down'].includes(String(command.stem))) issues.push('stem must be none, up, or down when provided');
      }
      if (type === 'setGuitarFret') {
        ensureNumber(command, 'string', issues, { min: 1, max: 6 });
        ensureNumber(command, 'fret', issues, { min: 0, max: 24 });
        if (command.tuning != null && typeof command.tuning !== 'string') issues.push('tuning must be a string when provided');
        if (command.techniques != null && (!Array.isArray(command.techniques) || command.techniques.some((entry) => typeof entry !== 'string'))) {
          issues.push('techniques must be a string array when provided');
        }
      }
      if (type === 'toggleGuitarTechnique') {
        ensureString(command, 'technique', issues);
      }
      if (type === 'toggleSlur' && command.stopLocator != null) {
        const stopLocator = ensureRecord(command.stopLocator, 'stopLocator');
        ensureLocator(stopLocator, issues);
      }
      if (type === 'setSlurPlacement') {
        if (!['above', 'below'].includes(String(command.placement))) {
          issues.push('placement must be above or below');
        }
        const stopLocator = ensureRecord(command.stopLocator, 'stopLocator');
        ensureLocator(stopLocator, issues);
      }
      if (type === 'transposeChromatic') ensureNumber(command, 'semitones', issues, { min: -24, max: 24 });
      if (type === 'addLyric' || type === 'setLyricLine' || type === 'removeLyricLine') {
        if (type !== 'removeLyricLine') ensureString(command, 'text', issues);
        if (command.syllabic != null && !['single', 'begin', 'middle', 'end'].includes(String(command.syllabic))) {
          issues.push('syllabic must be single, begin, middle, or end');
        }
        if (type === 'setLyricLine' || type === 'removeLyricLine') ensureNumber(command, 'verseNumber', issues, { min: 1, max: 32 });
      }
      break;
    case 'transposeRangeChromatic':
      ensureRange(command, issues);
      ensureNumber(command, 'semitones', issues, { min: -24, max: 24 });
      break;
    case 'insertNote':
    case 'insertNoteAt':
      if (command.coreMeasureId != null) ensureString(command, 'coreMeasureId', issues);
      if (command.corePartId != null) ensureString(command, 'corePartId', issues);
      ensureNumber(command, 'measureNumber', issues, { min: 0 });
      ensureNumber(command, 'staffIndex', issues, { min: 1 });
      ensureNumber(command, 'voiceId', issues, { min: 1 });
      ensureNumber(command, type === 'insertNoteAt' ? 'timestampNum' : 'afterTimestampNum', issues, { min: 0 });
      ensureNumber(command, type === 'insertNoteAt' ? 'timestampDen' : 'afterTimestampDen', issues, { min: 1 });
      ensureString(command, 'step', issues);
      ensureNumber(command, 'octave', issues, { min: 0, max: 9 });
      ensureNumber(command, 'alter', issues, { min: -2, max: 2 });
      if (command.writtenAccidental != null && !isWrittenAccidental(command.writtenAccidental)) {
        issues.push('writtenAccidental must be a supported standard accidental when provided');
      } else if (isWrittenAccidental(command.writtenAccidental) && command.alter !== writtenAccidentalToAlter(command.writtenAccidental)) {
        issues.push('writtenAccidental must match alter');
      }
      ensureString(command, 'durationType', issues);
      if (command.guitar != null) {
        const guitar = ensureRecord(command.guitar, 'guitar');
        ensureNumber(guitar, 'string', issues, { min: 1, max: 6 });
        ensureNumber(guitar, 'fret', issues, { min: 0, max: 24 });
        if (guitar.tuning != null && typeof guitar.tuning !== 'string') issues.push('guitar.tuning must be a string when provided');
        if (guitar.techniques != null && (!Array.isArray(guitar.techniques) || guitar.techniques.some((entry) => typeof entry !== 'string'))) {
          issues.push('guitar.techniques must be a string array when provided');
        }
      }
      break;
    case 'insertRest':
    case 'insertRestAt':
      if (command.coreMeasureId != null) ensureString(command, 'coreMeasureId', issues);
      if (command.corePartId != null) ensureString(command, 'corePartId', issues);
      ensureNumber(command, 'measureNumber', issues, { min: 0 });
      ensureNumber(command, 'staffIndex', issues, { min: 1 });
      ensureNumber(command, 'voiceId', issues, { min: 1 });
      ensureNumber(command, type === 'insertRestAt' ? 'timestampNum' : 'afterTimestampNum', issues, { min: 0 });
      ensureNumber(command, type === 'insertRestAt' ? 'timestampDen' : 'afterTimestampDen', issues, { min: 1 });
      ensureString(command, 'durationType', issues);
      break;
    case 'setBarline':
      ensureNumber(command, 'measureNumber', issues, { min: 1 });
      ensureString(command, 'barline', issues);
      break;
    case 'setTimeSignature':
      if (command.beatGroups != null && (!Array.isArray(command.beatGroups)
        || command.beatGroups.length < 1
        || !command.beatGroups.every(group => Number.isInteger(group) && Number(group) > 0)
        || command.beatGroups.reduce((sum: number, group: number) => sum + group, 0) !== command.beats)) {
        issues.push('beatGroups must contain positive integers summing to beats');
      }
      ensureNumber(command, 'beats', issues, { min: 1, max: 32 });
      ensureNumber(command, 'beatType', issues, { min: 1, max: 32 });
      if (command.measureNumber != null) ensureNumber(command, 'measureNumber', issues, { min: 1 });
      break;
    case 'setClef':
      ensureString(command, 'sign', issues);
      ensureNumber(command, 'line', issues, { min: 1, max: 5 });
      if (command.measureNumber != null) ensureNumber(command, 'measureNumber', issues, { min: 1 });
      if (command.staffIndex != null) ensureNumber(command, 'staffIndex', issues, { min: 1 });
      break;
    case 'removeClefChange':
      ensureNumber(command, 'measureNumber', issues, { min: 1 });
      if (command.staffIndex != null) ensureNumber(command, 'staffIndex', issues, { min: 1 });
      break;
    case 'insertMeasureAfter':
    case 'deleteMeasure':
      ensureNumber(command, 'measureNumber', issues, { min: 1 });
      break;
    case 'addRehearsalMark':
      ensureNumber(command, 'measureNumber', issues, { min: 1 });
      ensureString(command, 'text', issues);
      break;
    case 'addRehearsalMarksEvery':
      ensureNumber(command, 'interval', issues, { min: 1, max: 64 });
      if (command.startMeasureNumber != null) ensureNumber(command, 'startMeasureNumber', issues, { min: 1 });
      if (command.endMeasureNumber != null) ensureNumber(command, 'endMeasureNumber', issues, { min: 1 });
      if (command.style != null && !['letters', 'numbers'].includes(String(command.style))) issues.push('style must be letters or numbers');
      break;
    case 'addWords':
    case 'addExpressionText':
      ensureNumber(command, 'measureNumber', issues, { min: 1 });
      ensureString(command, 'text', issues);
      if (command.placement != null && !['above', 'below'].includes(String(command.placement))) issues.push('placement must be above or below');
      break;
    case 'addAnalysisAnnotation':
      ensureString(command, 'text', issues);
      ensureMeasureSpan(command, issues, { allowSingleMeasure: true });
      if (command.staffIndex != null) ensureNumber(command, 'staffIndex', issues, { min: 1 });
      if (command.analysisType != null && !['schenkerian', 'romanNumeral', 'forteSet', 'chordScale', 'neoRiemannian', 'form', 'motivic', 'other'].includes(String(command.analysisType))) {
        issues.push('analysisType must be a supported analysis label');
      }
      if (command.placement != null && !['above', 'below'].includes(String(command.placement))) issues.push('placement must be above or below');
      break;
    case 'addTechniqueInstruction':
      ensureString(command, 'instrument', issues);
      ensureString(command, 'text', issues);
      ensureMeasureSpan(command, issues);
      if (command.partId != null) ensureString(command, 'partId', issues);
      if (command.staffIndex != null) ensureNumber(command, 'staffIndex', issues, { min: 1 });
      if (command.placement != null && !['above', 'below'].includes(String(command.placement))) issues.push('placement must be above or below');
      break;
    case 'addSyncPoint':
      ensureNumber(command, 'measureNumber', issues, { min: 1 });
      if (command.timestampNum != null) ensureNumber(command, 'timestampNum', issues, { min: 0 });
      if (command.timestampDen != null) ensureNumber(command, 'timestampDen', issues, { min: 1 });
      if ((command.timestampNum == null) !== (command.timestampDen == null)) issues.push('timestampNum and timestampDen must be provided together');
      if (command.timecode != null) ensureString(command, 'timecode', issues);
      ensureString(command, 'label', issues);
      ensureString(command, 'scoringIntent', issues);
      if (command.staffIndex != null) ensureNumber(command, 'staffIndex', issues, { min: 1 });
      if (command.placement != null && !['above', 'below'].includes(String(command.placement))) issues.push('placement must be above or below');
      break;
    case 'addOrchestrationNote':
      ensureString(command, 'instruction', issues);
      ensureMeasureSpan(command, issues);
      if (command.partId != null) ensureString(command, 'partId', issues);
      if (command.partName != null) ensureString(command, 'partName', issues);
      if (command.staffIndex != null) ensureNumber(command, 'staffIndex', issues, { min: 1 });
      if (command.placement != null && !['above', 'below'].includes(String(command.placement))) issues.push('placement must be above or below');
      break;
    case 'removeDirection':
      ensureNumber(command, 'measureNumber', issues, { min: 1 });
      ensureString(command, 'text', issues);
      if (command.staffIndex != null) ensureNumber(command, 'staffIndex', issues, { min: 1 });
      if (command.kind != null) ensureString(command, 'kind', issues);
      break;
    case 'setSystemBreak':
    case 'setPageBreak':
      ensureNumber(command, 'measureNumber', issues, { min: 1 });
      ensureBoolean(command, 'value', issues);
      break;
    case 'setMeasureLayoutHint':
      ensureNumber(command, 'measureNumber', issues, { min: 1 });
      ensureString(command, 'hint', issues);
      if (!['newSystem', 'newPage', 'staffSpacing', 'collisionPolicy'].includes(String(command.hint))) issues.push('hint must be one of newSystem, newPage, staffSpacing, collisionPolicy');
      if (!['boolean', 'number', 'string'].includes(typeof command.value)) issues.push('value must be a boolean, number, or string');
      if (command.hint === 'collisionPolicy' && !['balanced', 'relaxed', 'open'].includes(String(command.value))) issues.push('collisionPolicy value must be balanced, relaxed, or open');
      if (command.staffIndex != null) ensureNumber(command, 'staffIndex', issues, { min: 1 });
      if (command.partId != null) ensureString(command, 'partId', issues);
      break;
    case 'setPartName':
      ensureString(command, 'partId', issues);
      ensureString(command, 'name', issues);
      break;
    case 'setPartAbbreviation':
      ensureString(command, 'partId', issues);
      ensureString(command, 'abbreviation', issues);
      break;
    case 'setInstrumentName':
      ensureString(command, 'partId', issues);
      ensureString(command, 'instrumentName', issues);
      break;
    case 'setPartTranspose':
      ensureString(command, 'partId', issues);
      ensureNumber(command, 'chromatic', issues, { min: -24, max: 24 });
      if (command.diatonic != null) ensureNumber(command, 'diatonic', issues, { min: -14, max: 14 });
      break;
    case 'fitRangeOctaves':
      ensureNumber(command, 'minMidi', issues, { min: 0, max: 127 });
      ensureNumber(command, 'maxMidi', issues, { min: 0, max: 127 });
      if (command.staffIndex != null) ensureNumber(command, 'staffIndex', issues, { min: 1 });
      if (command.voiceId != null) ensureNumber(command, 'voiceId', issues, { min: 1 });
      if (command.startMeasureNumber != null) ensureNumber(command, 'startMeasureNumber', issues, { min: 1 });
      if (command.endMeasureNumber != null) ensureNumber(command, 'endMeasureNumber', issues, { min: 1 });
      break;
    case 'fitPartToInstrument':
      if (!['voice', 'flute', 'violin', 'clarinet-bb', 'trumpet-bb', 'alto-sax-eb', 'cello'].includes(String(command.instrument ?? ''))) {
        issues.push('instrument must be voice, flute, violin, clarinet-bb, trumpet-bb, alto-sax-eb, or cello');
      }
      if (command.partId != null) ensureString(command, 'partId', issues);
      break;
    case 'applyPracticeProfile':
      if (!['rehearsal', 'roomy', 'compact'].includes(String(command.profile ?? ''))) issues.push('profile must be rehearsal, roomy, or compact');
      if (command.startMeasureNumber != null) ensureNumber(command, 'startMeasureNumber', issues, { min: 1 });
      if (command.endMeasureNumber != null) ensureNumber(command, 'endMeasureNumber', issues, { min: 1 });
      break;
    case 'editTupletUnit':
      ensureLocator(command, issues);
      if (!['pitch', 'chord', 'rest'].includes(String(command.action))) issues.push('Invalid tuplet edit');
      if (!['C','D','E','F','G','A','B'].includes(String(command.step))) issues.push('Invalid tuplet pitch');
      ensureNumber(command, 'alter', issues, { min: -2, max: 2 });
      ensureNumber(command, 'octave', issues, { min: 0, max: 8 });
      break;
    case 'moveGraceNote':
      ensureLocator(command, issues);
      if (!['earlier', 'later'].includes(String(command.direction))) issues.push('Invalid grace order');
      break;
    case 'setRhythmSpelling':
      ensureLocator(command, issues);
      ensureBoolean(command, 'literal', issues);
      break;
    case 'setAccidentalPolicy':
      if (!['none', 'barline', 'always'].includes(String(command.policy))) issues.push('Invalid accidental policy');
      break;
    case 'replaceMidiPassage':
      ensureLocator(command, issues);
      ensureString(command, 'takeId', issues);
      ensureNumber(command, 'lengthTicks', issues, { min: 1, max: 65536 });
      if (![1,2,4,8].includes(Number(command.ticksPerQuarter))) issues.push('Invalid recording grid');
      if (!Array.isArray(command.notes) || command.notes.length < 1 || command.notes.length > 10000
        || !command.notes.every(n => n && Number.isInteger(n.midi) && n.midi >= 0 && n.midi <= 127 && Number.isInteger(n.startTick) && n.startTick >= 0 && Number.isInteger(n.durationTicks) && n.durationTicks > 0 && n.startTick + n.durationTicks <= Number(command.lengthTicks))) issues.push('Invalid recorded note sequence');
      break;
    case 'editRhythm':
      ensureLocator(command, issues);
      ensureNumber(command, 'endMeasureNumber', issues, { min: 1 });
      if (!['insert', 'delete', 'resize'].includes(String(command.operation))) issues.push('Invalid rhythm operation');
      if (!['voice', 'instrument', 'score'].includes(String(command.scope))) issues.push('Invalid rhythm scope');
      if (!['whole', 'half', 'quarter', 'eighth', '16th', '32nd', '64th'].includes(String(command.durationType))) issues.push('Invalid rhythm duration');
      break;
    case 'addTuplet':
      ensureNumber(command, 'measureNumber', issues, { min: 0 });
      ensureNumber(command, 'staffIndex', issues, { min: 1 });
      ensureNumber(command, 'voiceId', issues, { min: 1 });
      ensureNumber(command, 'startTimestampNum', issues, { min: 0 });
      ensureNumber(command, 'startTimestampDen', issues, { min: 1 });
      ensureNumber(command, 'stopTimestampNum', issues, { min: 0 });
      ensureNumber(command, 'stopTimestampDen', issues, { min: 1 });
      ensureNumber(command, 'actualNotes', issues, { min: 2, max: 32 });
      ensureNumber(command, 'normalNotes', issues, { min: 1, max: 32 });
      if (command.coreEntityId != null) ensureString(command, 'coreEntityId', issues);
      if (command.coreMeasureId != null) ensureString(command, 'coreMeasureId', issues);
      if (command.corePartId != null) ensureString(command, 'corePartId', issues);
      if (command.showNumber != null && !['actual', 'both', 'none'].includes(String(command.showNumber))) {
        issues.push('showNumber must be actual, both, or none');
      }
      break;
    case 'addGraceNote':
    case 'removeGraceNote':
    case 'addFingering':
    case 'addOrnament':
      ensureLocator(command, issues);
      if (type === 'addFingering') ensureString(command, 'fingering', issues);
      if (type === 'addOrnament' && !['trill-mark', 'mordent', 'inverted-mordent', 'turn'].includes(String(command.ornament ?? ''))) {
        issues.push('ornament must be trill-mark, mordent, inverted-mordent, or turn');
      }
      break;
    case 'addWedge':
      if (!['crescendo', 'diminuendo'].includes(String(command.kind ?? ''))) issues.push('kind must be crescendo or diminuendo');
      ensureNumber(command, 'staffIndex', issues, { min: 1 });
      ensureNumber(command, 'startMeasureNumber', issues, { min: 0 });
      ensureNumber(command, 'startTimestampNum', issues, { min: 0 });
      ensureNumber(command, 'startTimestampDen', issues, { min: 1 });
      ensureNumber(command, 'stopMeasureNumber', issues, { min: 1 });
      ensureNumber(command, 'stopTimestampNum', issues, { min: 0 });
      ensureNumber(command, 'stopTimestampDen', issues, { min: 1 });
      if (command.placement != null && !['above', 'below'].includes(String(command.placement))) issues.push('placement must be above or below');
      break;
    case 'addPedalSpan':
      ensureNumber(command, 'staffIndex', issues, { min: 1 });
      ensureNumber(command, 'startMeasureNumber', issues, { min: 0 });
      ensureNumber(command, 'startTimestampNum', issues, { min: 0 });
      ensureNumber(command, 'startTimestampDen', issues, { min: 1 });
      ensureNumber(command, 'stopMeasureNumber', issues, { min: 1 });
      ensureNumber(command, 'stopTimestampNum', issues, { min: 0 });
      ensureNumber(command, 'stopTimestampDen', issues, { min: 1 });
      break;
    case 'addOttava':
      if (!['8va', '8vb', '15ma', '15mb'].includes(String(command.kind ?? ''))) issues.push('kind must be 8va, 8vb, 15ma or 15mb');
      ensureNumber(command, 'staffIndex', issues, { min: 1 });
      ensureNumber(command, 'startMeasureNumber', issues, { min: 0 });
      ensureNumber(command, 'startTimestampNum', issues, { min: 0 });
      ensureNumber(command, 'startTimestampDen', issues, { min: 1 });
      ensureNumber(command, 'stopMeasureNumber', issues, { min: 1 });
      ensureNumber(command, 'stopTimestampNum', issues, { min: 0 });
      ensureNumber(command, 'stopTimestampDen', issues, { min: 1 });
      if (command.placement != null && !['above', 'below'].includes(String(command.placement))) issues.push('placement must be above or below');
      break;
    case 'pasteContent':
      ensureString(command, 'targetPartId', issues);
      ensureNumber(command, 'targetStaffIndex', issues, { min: 1 });
      ensureClipboardTargetOffset(command.targetOffset, issues);
      ensureClipboardData(command.clipboardData, issues);
      if (!['insert', 'overwrite'].includes(String(command.mode ?? ''))) issues.push('mode must be insert or overwrite');
      break;
    case 'addFermata':
    case 'removeFermata':
      ensureLocator(command, issues);
      if (command.type === 'addFermata' && command.placement != null && !['above', 'below'].includes(String(command.placement))) {
        issues.push('placement must be above or below');
      }
      break;
    case 'addTremolo':
      ensureLocator(command, issues);
      if (![1, 2, 3].includes(command.lines as number)) issues.push('lines must be 1, 2, or 3');
      if (!['single', 'start', 'stop'].includes(String(command.tremoloType ?? ''))) issues.push('tremoloType must be single, start, or stop');
      break;
    case 'addGlissando':
      if (command.lineType != null && !['solid', 'dashed', 'dotted', 'wavy'].includes(String(command.lineType))) issues.push('lineType must be solid, dashed, dotted, or wavy');
      ensureLocator(command.start as Record<string, unknown>, issues);
      ensureLocator(command.stop as Record<string, unknown>, issues);
      break;
    case 'addArpeggio':
      ensureLocator(command, issues);
      if (command.direction != null && !['up', 'down'].includes(String(command.direction))) issues.push('direction must be up or down');
      break;
    case 'addSegno':
    case 'addCoda':
      ensureNumber(command, 'measureNumber', issues, { min: 1 });
      if (command.placement != null && !['above', 'below'].includes(String(command.placement))) issues.push('placement must be above or below');
      break;
    case 'addDacapo':
    case 'addDalsegno':
    case 'addFine':
    case 'addToCoda':
      ensureNumber(command, 'measureNumber', issues, { min: 1 });
      break;
    case 'setMeasureRepeat':
      ensureNumber(command, 'measureNumber', issues, { min: 1 });
      ensureNumber(command, 'repeatCount', issues, { min: 1, max: 8 });
      break;
    case 'addTempoText':
      ensureString(command, 'text', issues);
      ensureNumber(command, 'measureNumber', issues, { min: 1 });
      break;
    case 'setSwing':
      ensureNumber(command, 'ratio', issues, { min: 0.5, max: 0.75 });
      break;
    case 'setInstrumentChange':
      ensureNumber(command, 'measureNumber', issues, { min: 1 });
      ensureString(command, 'instrumentName', issues);
      break;
    case 'setCueNote':
      ensureLocator(command, issues);
      break;
    case 'setMultiMeasureRest':
      ensureNumber(command, 'measureNumber', issues, { min: 1 });
      ensureBoolean(command, 'enabled', issues);
      break;
    case 'addGuitarBend':
      ensureLocator(command, issues);
      ensureNumber(command, 'bendSemitones', issues, { min: 1, max: 12 });
      break;
    case 'addGuitarTap':
      ensureLocator(command, issues);
      break;
    default:
      issues.push(`Unsupported command type: ${type}`);
  }

  if (issues.length) {
    throw new CommandValidationError(`Invalid command: ${type || 'unknown'}`, issues);
  }

  return {
    ...(command as unknown as ScoreCommand),
    schemaVersion: 1,
    category: getCategory(type),
    target: getTarget(command),
    payload: getPayload(command),
  };
}

export function normalizeScoreCommands(input: unknown[]): ValidatedScoreCommand[] {
  if (!Array.isArray(input)) {
    throw new CommandValidationError('Invalid commands payload', ['commands must be an array']);
  }
  return input.filter(Boolean).map(normalizeScoreCommand);
}
