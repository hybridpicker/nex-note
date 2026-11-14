import assert from 'node:assert/strict';
import test from 'node:test';

import { ARRANGER_PRESETS, arrangerPresetText } from '../lib/arranger-presets.ts';
import { resolveAiWorkflow } from '../src/nex-note/workflows/ai-workflows.ts';

test('every arranger preset has a unique id, both labels and a prompt', () => {
  const ids = ARRANGER_PRESETS.map((preset) => preset.id);
  assert.equal(ids.length, new Set(ids).size);
  for (const preset of ARRANGER_PRESETS) {
    assert.ok(preset.prompt.length > 10, preset.id);
    assert.ok(arrangerPresetText(preset, 'de').label, preset.id);
    assert.ok(arrangerPresetText(preset, 'fr').label, `${preset.id} falls back to English`);
    assert.equal(arrangerPresetText(preset, 'fr').label, preset.label.en);
  }
});

test('the presets reach the workflow they are meant for', () => {
  const kind = (id: string) => resolveAiWorkflow(ARRANGER_PRESETS.find((preset) => preset.id === id)!.prompt).kind;
  for (const id of ['four-part', 'jazz-voicing', 'figured-bass', 'reharmonize', 'piano-accompaniment']) {
    assert.equal(kind(id), 'arrangement-assist', id);
  }
  assert.equal(kind('range-check'), 'analysis');
  assert.notEqual(kind('chord-symbols'), 'analysis');
});

test('a slash prefix is removed from the message the model sees', () => {
  const resolved = resolveAiWorkflow(ARRANGER_PRESETS[0]!.prompt);
  assert.doesNotMatch(resolved.cleanedMessage, /^\/arrange/);
});

test('arranger vocabulary without the verb "arrange" is an arrangement request', () => {
  for (const message of [
    'Schreib eine zweite Stimme dazu',
    'Add a second voice a third below',
    'Mach daraus einen vierstimmigen Chorsatz',
    'Eine Gegenstimme für die Takte 5 bis 8',
    'Add a counter-melody for the flute',
    'Give me an SATB version',
    'Bläsersatz für die Hookline',
  ]) {
    assert.equal(resolveAiWorkflow(message).kind, 'arrangement-assist', message);
  }
});

test('ordinary edits keep their workflow', () => {
  assert.equal(resolveAiWorkflow('Remove dynamics and accents').kind, 'cleanup');
  assert.equal(resolveAiWorkflow('Change key to G major, tempo 140').kind, 'general');
  assert.equal(resolveAiWorkflow('/layout add a system break before measure 8').kind, 'layout-assist');
  assert.equal(resolveAiWorkflow('add verse 2 lyrics to the selected phrase').kind, 'lyrics');
});
