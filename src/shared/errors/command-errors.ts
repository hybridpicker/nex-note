export class CommandValidationError extends Error {
  issues: string[];

  constructor(message: string, issues: string[]) {
    super(message);
    this.name = 'CommandValidationError';
    this.issues = issues;
  }
}

export function formatValidationError(error: unknown) {
  if (error instanceof CommandValidationError) {
    return {
      error: error.message,
      issues: error.issues,
    };
  }

  return {
    error: String(error),
  };
}
