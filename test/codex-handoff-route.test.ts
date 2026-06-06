import test from 'node:test';
import assert from 'node:assert/strict';

import { buildCodexArgs, buildTerminalScript } from '../lib/codex-handoff-route.ts';

test('Codex handoff passes approval policy before exec subcommand', () => {
  const args = buildCodexArgs({
    cwd: '/repo',
    outputPath: '/repo/.nex/codex-final.md',
  });

  assert.deepEqual(args.slice(0, 3), ['--ask-for-approval', 'never', 'exec']);
  assert.equal(args.includes('--cd'), true);
  assert.equal(args.includes('--sandbox'), true);
  assert.equal(args.includes('--output-last-message'), true);
});

test('Codex terminal handoff script keeps the window open after command failures', () => {
  const script = buildTerminalScript({
    handoffId: 'handoff-test',
    codexCommand: '/opt/homebrew/bin/codex',
    cwd: '/repo',
    promptPath: '/repo/.nex/codex-handoffs/test/prompt.md',
    logPath: '/repo/.nex/codex-handoffs/test/codex.log',
    errorLogPath: '/repo/.nex/codex-handoffs/test/codex.err.log',
    outputPath: '/repo/.nex/codex-handoffs/test/codex-final.md',
  });
  const commandLine = script.split('\n').find((line) => line.includes("'exec'"));

  assert.match(script, /set \+e/);
  assert.match(script, /nex-note Doctor -> Codex/);
  assert.match(script, /Handoff:/);
  assert.match(script, /handoff-test/);
  assert.match(script, /Codex is running\. Live output follows\./);
  assert.match(script, /status=\$\?/);
  assert.match(script, /Codex completed successfully/);
  assert.match(script, /Combined log:/);
  assert.match(script, /tee -a '\/repo\/\.nex\/codex-handoffs\/test\/codex\.err\.log' \| tee -a '\/repo\/\.nex\/codex-handoffs\/test\/codex\.log'/);
  assert.match(script, /Press any key to close this window/);
  assert.match(script, /sleep 20/);
  assert.match(commandLine ?? '', /^'\/opt\/homebrew\/bin\/codex' '--ask-for-approval' 'never' 'exec'/);
});
