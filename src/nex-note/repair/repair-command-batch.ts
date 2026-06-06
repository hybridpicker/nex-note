import { normalizeScoreCommand, type ValidatedScoreCommand } from '@/src/shared/schemas/score-command';

export interface RepairedCommandBatch {
  validCommands: ValidatedScoreCommand[];
  droppedCommands: Array<{
    index: number;
    reason: string;
    command: unknown;
  }>;
}

export function repairCommandBatch(commands: unknown[]): RepairedCommandBatch {
  const validCommands: ValidatedScoreCommand[] = [];
  const droppedCommands: RepairedCommandBatch['droppedCommands'] = [];

  commands.forEach((command, index) => {
    try {
      validCommands.push(normalizeScoreCommand(command));
    } catch (error) {
      droppedCommands.push({
        index,
        reason: error instanceof Error ? error.message : String(error),
        command,
      });
    }
  });

  return {
    validCommands,
    droppedCommands,
  };
}
