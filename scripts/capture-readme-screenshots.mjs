#!/usr/bin/env node
// Captures the README screenshots from the synthetic showcase fixtures in
// e2e/fixtures/readme-*.musicxml. No real or third-party scores are used.
//
// Usage: start a dev server, then run
//   node scripts/capture-readme-screenshots.mjs [baseUrl]
// The default base URL is http://127.0.0.1:3000.

import { chromium } from '@playwright/test';
import fs from 'node:fs/promises';
import path from 'node:path';

const BASE_URL = (process.argv[2] ?? 'http://127.0.0.1:3000').replace(/\/$/, '');
const OUT_DIR = path.join(process.cwd(), 'docs', 'screenshots');
const FIXTURE_DIR = path.join(process.cwd(), 'e2e', 'fixtures');
const CHROME_PATH = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const VIEWPORT = { width: 1440, height: 900 };

// The AI screenshot shows the preview-before-apply flow. The provider response
// is mocked so the screenshot needs no API key and stays reproducible.
const AI_PREVIEW_RESPONSE = {
  requiresConfirmation: true,
  explanation: 'Prepared chord symbols for the whole etude. Review the preview before applying.',
  workflowLabel: 'Arrangement assistant',
  commands: [{ type: 'addChords', chords: '1:G 2:G 3:C 4:G 5:G 6:C 7:D 8:G' }],
  affectedMeasures: [1, 2, 3, 4, 5, 6, 7, 8],
  ambiguities: [],
  plan: ['Read the harmony of each measure', 'Add one chord symbol per measure', 'Validate the result'],
  riskReasons: ['Arrangement suggestions stay previewable before apply'],
  validatorFindings: [],
  provider: 'ollama',
  model: 'local-model',
  latencyMs: 640,
};

async function readFixture(name) {
  return fs.readFile(path.join(FIXTURE_DIR, name), 'utf8');
}

async function newPage(browser) {
  const context = await browser.newContext({ viewport: VIEWPORT, deviceScaleFactor: 2, locale: 'en-US' });
  const page = await context.newPage();
  await page.route('**/api/ollama-models', (route) => route.fulfill({
    status: 200,
    contentType: 'application/json',
    body: JSON.stringify({ models: [{ id: 'local-model', label: 'Local model' }] }),
  }));
  return page;
}

async function bootWithScore(page, fileName, xml) {
  await page.addInitScript(({ xml, fileName }) => {
    if (window.top !== window || localStorage.getItem('nex-note:readme-booted')) return;
    const now = Date.now();
    localStorage.setItem('nex-note:score-library', JSON.stringify([{
      id: 'readme-score',
      name: fileName,
      xml,
      format: 'musicxml',
      sizeBytes: xml.length,
      measures: 8,
      parts: 1,
      favorite: false,
      createdAt: now,
      updatedAt: now,
      lastOpenedAt: now,
    }]));
    localStorage.setItem('nex-note:e2e-boot', JSON.stringify({ xml, filename: fileName }));
    localStorage.setItem('nex-note:readme-booted', '1');
  }, { xml, fileName });
  await page.goto(`${BASE_URL}/?locale=en`);
  await page.getByTitle('Save as').waitFor({ timeout: 30_000 });
  await page.locator('[data-testid="score-canvas"] .vf-notehead').first().waitFor({ timeout: 30_000 });
  await page.waitForTimeout(800);
}

async function openAiPanel(page) {
  const showPanel = page.getByRole('button', { name: /Show panel/ });
  if (await showPanel.isVisible()) await showPanel.click();
  const aiTab = page.getByRole('button', { name: 'AI', exact: true });
  if (await aiTab.isVisible()) await aiTab.click();
  await page.getByPlaceholder('Describe your edit…').waitFor({ timeout: 15_000 });
}

async function save(page, name) {
  const file = path.join(OUT_DIR, name);
  await page.mouse.move(0, 0);
  const jpeg = name.endsWith('.jpg');
  await page.screenshot({ path: file, type: jpeg ? 'jpeg' : 'png', quality: jpeg ? 82 : undefined });
  console.log(`wrote ${path.relative(process.cwd(), file)}`);
}

const SHOTS = [
  {
    name: 'welcome.jpg',
    async run(page) {
      await page.goto(`${BASE_URL}/?locale=en`);
      await page.getByText('Write without').waitFor({ timeout: 30_000 });
      await page.waitForTimeout(800);
    },
  },
  {
    name: 'editor-piano.png',
    async run(page) {
      await bootWithScore(page, 'morning-etude.musicxml', await readFixture('readme-piano-etude.musicxml'));
    },
  },
  {
    name: 'guitar-tab.png',
    async run(page) {
      await bootWithScore(page, 'little-walk.musicxml', await readFixture('readme-guitar-tab.musicxml'));
    },
  },
  {
    name: 'lead-sheet.png',
    async run(page) {
      await bootWithScore(page, 'harbor-song.musicxml', await readFixture('readme-lead-sheet.musicxml'));
    },
  },
  {
    name: 'ai-edit-preview.png',
    async run(page) {
      await page.route('**/api/chat', (route) => route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(AI_PREVIEW_RESPONSE),
      }));
      await bootWithScore(page, 'morning-etude.musicxml', await readFixture('readme-piano-etude.musicxml'));
      await openAiPanel(page);
      await page.getByPlaceholder('Describe your edit…').fill('/arrange add chord symbols for the whole piece');
      await page.getByRole('button', { name: 'Send' }).click();
      await page.getByPlaceholder('Type apply to confirm or cancel to discard…').waitFor({ timeout: 15_000 });
      await page.waitForTimeout(500);
    },
  },
];

const only = new Set(process.argv.slice(3));
await fs.mkdir(OUT_DIR, { recursive: true });
const browser = await chromium.launch({ executablePath: CHROME_PATH, headless: true });
try {
  for (const shot of SHOTS) {
    if (only.size && !only.has(shot.name)) continue;
    const page = await newPage(browser);
    try {
      await shot.run(page);
      await save(page, shot.name);
    } finally {
      await page.context().close();
    }
  }
} finally {
  await browser.close();
}
