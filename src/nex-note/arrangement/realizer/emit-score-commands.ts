import type { RealizationPlan, RealizationTarget } from '@/src/nex-note/arrangement/realizer/spec';
import type { ScoreCommand } from '@/src/shared/schemas/score-command';

function measureEndTimestamp() {
  return { timestampNum: 1, timestampDen: 1 };
}

function pushDeleteRangeCommands(commands: ScoreCommand[], target: RealizationTarget) {
  const clearEnd = measureEndTimestamp();

  for (const voiceId of target.voiceIds) {
    commands.push({
      type: 'deleteRange',
      corePartId: target.corePartId,
      range: {
        start: {
          corePartId: target.corePartId,
          measureNumber: target.measureRange.start,
          staffIndex: target.staffIndex,
          voiceId,
          timestampNum: 0,
          timestampDen: 1,
        },
        end: {
          corePartId: target.corePartId,
          measureNumber: target.measureRange.end,
          staffIndex: target.staffIndex,
          voiceId,
          timestampNum: clearEnd.timestampNum,
          timestampDen: clearEnd.timestampDen,
        },
      },
    });
  }
}

export function emitScoreCommandsFromRealizationPlan(plan: RealizationPlan): ScoreCommand[] {
  const commands: ScoreCommand[] = [];

  pushDeleteRangeCommands(commands, plan.target);
  for (const mirror of plan.mirrors ?? []) {
    pushDeleteRangeCommands(commands, mirror.target);
  }

  for (const event of plan.events) {
    if (event.kind === 'note' && event.pitch) {
      commands.push({
        type: 'insertNoteAt',
        corePartId: plan.target.corePartId,
        measureNumber: event.measureNumber,
        staffIndex: event.staffIndex,
        voiceId: event.voiceId,
        timestampNum: event.timestampNum,
        timestampDen: event.timestampDen,
        step: event.pitch.step,
        alter: event.pitch.alter,
        octave: event.pitch.octave,
        durationType: event.durationType,
        isDotted: event.isDotted,
      });
      continue;
    }

    commands.push({
      type: 'insertRestAt',
      corePartId: plan.target.corePartId,
      measureNumber: event.measureNumber,
      staffIndex: event.staffIndex,
      voiceId: event.voiceId,
      timestampNum: event.timestampNum,
      timestampDen: event.timestampDen,
      durationType: event.durationType,
      isDotted: event.isDotted,
    });
  }

  for (const mirror of plan.mirrors ?? []) {
    for (const event of mirror.events) {
      commands.push({
        type: 'insertNoteAt',
        corePartId: mirror.target.corePartId,
        measureNumber: event.measureNumber,
        staffIndex: event.staffIndex,
        voiceId: event.voiceId,
        timestampNum: event.timestampNum,
        timestampDen: event.timestampDen,
        step: event.pitch.step,
        alter: event.pitch.alter,
        octave: event.pitch.octave,
        durationType: event.durationType,
        isDotted: event.isDotted,
        guitar: event.guitar,
      });
    }
  }

  return commands;
}
