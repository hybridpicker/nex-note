import test from 'node:test';
import assert from 'node:assert/strict';

import { NEW_SCORE_TEMPLATES } from '../lib/new-score.ts';
import {
  buildTemplateCategories,
  dedupeUserTemplates,
  detectUserTemplatesFromFiles,
  normalizeUserTemplatesFromFolder,
  parseUserTemplateIndex,
} from '../lib/score-templates.ts';

test('parseUserTemplateIndex normalizes template-index.json entries', () => {
  const templates = parseUserTemplateIndex(JSON.stringify({
    templates: [
      {
        id: 'st-poeltner-glockenspiel',
        name: 'St. Poeltner Glockenspiel',
        category: 'Private',
        description: 'Singing bowls C1/E1/G1 plus glockenspiel C2-C6 without C#2.',
        musicxml: 'StPoeltner_Glockenspiel_Template.musicxml',
        nxn: 'StPoeltner_Glockenspiel_Template.nxn',
        private: true,
      },
    ],
  }), [
    { filename: 'StPoeltner_Glockenspiel_Template.musicxml' },
    { filename: 'StPoeltner_Glockenspiel_Template.nxn' },
  ], 'Nex Note');

  assert.deepEqual(templates, [{
    id: 'st-poeltner-glockenspiel',
    source: 'local',
    name: 'St. Poeltner Glockenspiel',
    category: 'Private',
    description: 'Singing bowls C1/E1/G1 plus glockenspiel C2-C6 without C#2.',
    filename: 'StPoeltner_Glockenspiel_Template.musicxml',
    format: 'musicxml',
    private: true,
    sourceLabel: 'Nex Note',
  }]);
});

test('detectUserTemplatesFromFiles derives local templates from musicxml and nxn files', () => {
  const templates = detectUserTemplatesFromFiles([
    { filename: 'Solo_Template.musicxml' },
    { filename: 'Project_Template.nxn' },
    { filename: 'notes.txt' },
  ], 'nex-note');

  assert.equal(templates.length, 2);
  assert.equal(templates[0].name, 'Solo Template');
  assert.equal(templates[0].format, 'musicxml');
  assert.equal(templates[0].private, true);
  assert.equal(templates[1].name, 'Project Template');
  assert.equal(templates[1].format, 'nxn');
});

test('normalizeUserTemplatesFromFolder keeps indexed templates and adds fallback files', () => {
  const templates = normalizeUserTemplatesFromFolder({
    sourceLabel: 'Nex Note',
    indexText: JSON.stringify({
      templates: [
        {
          id: 'indexed',
          name: 'Indexed Template',
          category: 'Private',
          filename: 'Indexed.musicxml',
        },
      ],
    }),
    files: [
      { filename: 'Indexed.musicxml', content: '<score-partwise />' },
      { filename: 'Fallback.nxn', content: '{}' },
    ],
  });

  assert.deepEqual(templates.map((template) => template.name), ['Indexed Template', 'Fallback']);
  assert.deepEqual(templates.map((template) => template.category), ['Private', 'Local']);
});

test('dedupeUserTemplates collapses matching local template ids across folders', () => {
  const first = parseUserTemplateIndex(JSON.stringify({
    templates: [{ id: 'shared', name: 'Shared', filename: 'Shared.musicxml' }],
  }), [{ filename: 'Shared.musicxml' }], 'Nex Note');
  const second = parseUserTemplateIndex(JSON.stringify({
    templates: [{ id: 'shared', name: 'Shared', filename: 'Shared.musicxml' }],
  }), [{ filename: 'Shared.musicxml' }], 'nex-note');

  assert.equal(dedupeUserTemplates([...first, ...second]).length, 1);
});

test('built-in template categories remain available', () => {
  const categories = buildTemplateCategories(NEW_SCORE_TEMPLATES);

  assert.ok(NEW_SCORE_TEMPLATES.some((template) => template.id === 'solo-piano'));
  assert.ok(NEW_SCORE_TEMPLATES.some((template) => template.id === 'guitar-tab'));
  assert.ok(categories.includes('Solo'));
  assert.ok(categories.includes('Chamber'));
  assert.ok(categories.includes('Guitars'));
});
