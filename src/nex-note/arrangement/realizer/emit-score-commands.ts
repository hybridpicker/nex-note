import type { RealizationPlan } from '@/src/nex-note/arrangement/realizer/spec';
import type { ScoreCommand } from '@/src/shared/schemas/score-command';

function measureEndTimestamp(plan: RealizationPlan) {
  const endMeasure = plan.target.measureRange.end;
  const lastEvent = plan.events
    .filter((event) => event.measureNumber === endMeasure)
    .sort((left, right) => (
      left.timestampNum / Math.max(left.timestampDen, 1)
      - right.timestampNum / Math.max(right.timestampDen, 1)
    ))
    .at(-1);

  if (!lastEvent) return { timestampNum: 1, timestampDen: 1 };
  return { timestampNum: 1, timestampDen: 1 };
}

export function emitScoreCommandsFromRealizationPlan(plan: RealizationPlan): ScoreCommand[] {
  const commands: ScoreCommand[] = [];
  const clearEnd = measureEndTimestamp(plan);

  for (const voiceId of plan.target.voiceIds) {
    commands.push({
      type: 'deleteRange',
      corePartId: plan.target.corePartId,
      range: {
        start: {
          corePartId: plan.target.corePartId,
          measureNumber: plan.target.measureRange.start,
          staffIndex: plan.target.staffIndex,
          voiceId,
          timestampNum: 0,
          timestampDen: 1,
        },
        end: {
          corePartId: plan.target.corePartId,
          measureNumber: plan.target.measureRange.end,
          staffIndex: plan.target.staffIndex,
          voiceId,
          timestampNum: clearEnd.timestampNum,
          timestampDen: clearEnd.timestampDen,
        },
      },
    });
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

  return commands;
}
