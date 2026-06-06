function shellQuote(value: string) {
  return `'${value.replace(/'/g, `'\\''`)}'`;
}

export function buildCodexArgs(input: {
  cwd: string;
  outputPath: string;
}) {
  return [
    '--ask-for-approval',
    'never',
    'exec',
    '--cd',
    input.cwd,
    '--sandbox',
    process.env.NEX_NOTE_CODEX_SANDBOX ?? 'workspace-write',
    '--color',
    'never',
    '--output-last-message',
    input.outputPath,
    '-',
  ];
}

export function buildTerminalScript(input: {
  handoffId: string;
  codexCommand: string;
  cwd: string;
  promptPath: string;
  logPath: string;
  errorLogPath: string;
  outputPath: string;
}) {
  const args = buildCodexArgs({
    cwd: input.cwd,
    outputPath: input.outputPath,
  });
  return [
    '#!/bin/zsh',
    'emulate -L zsh',
    'set +e',
    'set -u',
    `cd ${shellQuote(input.cwd)}`,
    'clear',
    'started_at=$(date "+%Y-%m-%d %H:%M:%S")',
    'echo "============================================================"',
    'echo " nex-note Doctor -> Codex"',
    'echo "============================================================"',
    `printf '  %-13s %s\\n' 'Handoff:' ${shellQuote(input.handoffId)}`,
    'printf \'  %-13s %s\\n\' \'Started:\' "$started_at"',
    `printf '  %-13s %s\\n' 'Workspace:' ${shellQuote(input.cwd)}`,
    `printf '  %-13s %s\\n' 'Prompt:' ${shellQuote(input.promptPath)}`,
    `printf '  %-13s %s\\n' 'Log:' ${shellQuote(input.logPath)}`,
    `printf '  %-13s %s\\n' 'Error log:' ${shellQuote(input.errorLogPath)}`,
    `printf '  %-13s %s\\n' 'Final:' ${shellQuote(input.outputPath)}`,
    'echo "------------------------------------------------------------"',
    'echo "Codex is running. Live output follows."',
    'echo "------------------------------------------------------------"',
    'echo ""',
    [
      shellQuote(input.codexCommand),
      ...args.map(shellQuote),
      '<',
      shellQuote(input.promptPath),
      '>',
      `>(tee -a ${shellQuote(input.logPath)})`,
      '2>',
      `>(tee -a ${shellQuote(input.errorLogPath)} | tee -a ${shellQuote(input.logPath)} >&2)`,
    ].join(' '),
    'status=$?',
    'echo ""',
    'finished_at=$(date "+%Y-%m-%d %H:%M:%S")',
    'echo "------------------------------------------------------------" | tee -a ' + shellQuote(input.logPath),
    'if [ "$status" -eq 0 ]; then',
    '  echo "Codex completed successfully." | tee -a ' + shellQuote(input.logPath),
    'else',
    '  echo "Codex exited with status ${status}." | tee -a ' + shellQuote(input.logPath),
    'fi',
    'echo "Finished: ${finished_at}" | tee -a ' + shellQuote(input.logPath),
    `echo ${shellQuote(`Final message: ${input.outputPath}`)} | tee -a ${shellQuote(input.logPath)}`,
    `echo ${shellQuote(`Combined log: ${input.logPath}`)} | tee -a ${shellQuote(input.logPath)}`,
    `echo ${shellQuote(`Error log: ${input.errorLogPath}`)} | tee -a ${shellQuote(input.logPath)}`,
    'echo "------------------------------------------------------------" | tee -a ' + shellQuote(input.logPath),
    'echo ""',
    'if [ -t 0 ]; then',
    '  echo "Press any key to close this window."',
    '  read -r -k 1 _',
    'else',
    '  echo "No interactive terminal input is available; keeping this window open for 20 seconds."',
    '  sleep 20',
    'fi',
    'exit ${status}',
    '',
  ].join('\n');
}
