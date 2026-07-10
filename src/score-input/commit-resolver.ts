import type { ScoreCommand } from '@/src/shared/schemas/score-command';
import type { ResolvedEditLocator, ResolvedEditTarget } from '@/src/score-input/types';
import type { WrittenAccidental } from '@/src/shared/music/accidentals';

type ExistingEventKind = 'note' | 'rest' | null;

export interface BuildNoteEntryCommitCommandsInput {
  target: ResolvedEditTarget;
  durationType: string;
  isDotted: boolean;
  existingEventKind: ExistingEventKind;
  preserveOverflow?: boolean;
  writtenAccidental?: WrittenAccidental;
  notehead?: 'slash';
  stem?: 'none';
  guitar?: { string: 1 | 2 | 3 | 4 | 5 | 6; fret: number; tuning?: string; techniques?: string[] };
}

export function buildNoteEntryCommitCommands(input: BuildNoteEntryCommitCommandsInput): ScoreCommand[] {
  const { target } = input;
  const replaceExistingNote = target.mode === 'replace' && input.existingEventKind === 'note';
  const useRelativeInsert = target.mode === 'insert'
    && target.source === 'keyboard'
    && target.relativeAfterTimestampNum != null
    && target.relativeAfterTimestampDen != null;

  if (replaceExistingNote) {
    const commands: ScoreCommand[] = [
      {
        type: 'changeNotePitch',
        coreMeasureId: target.measureId,
        corePartId: target.corePartId,
        measureNumber: target.measureNumber,
        staffIndex: target.staffIndex,
        voiceId: target.voiceId,
        timestampNum: target.timestampNum,
        timestampDen: target.timestampDen,
        step: target.step,
        octave: target.octave,
        alter: target.alter,
        writtenAccidental: input.writtenAccidental,
      },
      {
        type: 'changeNoteDuration',
        coreMeasureId: target.measureId,
        corePartId: target.corePartId,
        measureNumber: target.measureNumber,
        staffIndex: target.staffIndex,
        voiceId: target.voiceId,
        timestampNum: target.timestampNum,
        timestampDen: target.timestampDen,
        durationType: input.durationType,
        isDotted: input.isDotted,
      },
    ];
    if (input.notehead || input.stem) {
      commands.push({
        type: 'setNoteStyle',
        coreMeasureId: target.measureId,
        corePartId: target.corePartId,
        measureNumber: target.measureNumber,
        staffIndex: target.staffIndex,
        voiceId: target.voiceId,
        timestampNum: target.timestampNum,
        timestampDen: target.timestampDen,
        notehead: input.notehead,
        stem: input.stem,
      });
    }
    if (input.guitar) {
      commands.push({
        type: 'setGuitarFret',
        coreMeasureId: target.measureId,
        corePartId: target.corePartId,
        measureNumber: target.measureNumber,
        staffIndex: target.staffIndex,
        voiceId: target.voiceId,
        timestampNum: target.timestampNum,
        timestampDen: target.timestampDen,
        string: input.guitar.string,
        fret: input.guitar.fret,
        tuning: input.guitar.tuning,
        techniques: input.guitar.techniques,
      });
    }
    return commands;
  }

  if (useRelativeInsert) {
    return [{
      type: 'insertNote',
      coreMeasureId: target.measureId,
      corePartId: target.corePartId,
      measureNumber: target.measureNumber,
      staffIndex: target.staffIndex,
      voiceId: target.voiceId,
      afterTimestampNum: target.relativeAfterTimestampNum!,
      afterTimestampDen: target.relativeAfterTimestampDen!,
      step: target.step,
      octave: target.octave,
      alter: target.alter,
      writtenAccidental: input.writtenAccidental,
      durationType: input.durationType,
      isDotted: input.isDotted,
      notehead: input.notehead,
      stem: input.stem,
      guitar: input.guitar,
    }];
  }

  return [{
    type: 'insertNoteAt',
    coreMeasureId: target.measureId,
    corePartId: target.corePartId,
    measureNumber: target.measureNumber,
    staffIndex: target.staffIndex,
    voiceId: target.voiceId,
    timestampNum: target.timestampNum,
    timestampDen: target.timestampDen,
    step: target.step,
    octave: target.octave,
    alter: target.alter,
    writtenAccidental: input.writtenAccidental,
    durationType: input.durationType,
    isDotted: input.isDotted,
    asChord: target.mode === 'chord',
    preserveOverflow: Boolean(input.preserveOverflow),
    notehead: input.notehead,
    stem: input.stem,
    guitar: input.guitar,
  }];
}

export function toResolvedEditLocator(target: ResolvedEditTarget): ResolvedEditLocator {
  return {
    coreMeasureId: target.measureId,
    corePartId: target.corePartId,
    measureNumber: target.measureNumber,
    staffIndex: target.staffIndex,
    voiceId: target.voiceId,
    timestampNum: target.timestampNum,
    timestampDen: target.timestampDen,
  };
}
