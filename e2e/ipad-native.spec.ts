import fs from 'node:fs';
import path from 'node:path';

import { expect, test } from '@playwright/test';

const fixtureXml = fs.readFileSync(
  path.join(process.cwd(), 'e2e', 'fixtures', 'simple.musicxml'),
  'utf8',
);

test.use({
  viewport: { width: 834, height: 1194 },
  isMobile: true,
  hasTouch: true,
});

test('native iPad portrait keeps the score usable and opens side panels as overlays @smoke', async ({ page }) => {
  const browserErrors: string[] = [];
  page.on('console', (message) => {
    if (message.type() === 'error') browserErrors.push(message.text());
  });
  page.on('pageerror', (error) => browserErrors.push(error.message));

  await page.addInitScript(({ xml }) => {
    localStorage.setItem('nex-note:e2e-boot', JSON.stringify({
      xml,
      filename: 'ipad-layout-test.musicxml',
    }));
    document.addEventListener('DOMContentLoaded', () => {
      document.documentElement.classList.add('nex-note-native', 'nex-note-ios');
    });
  }, { xml: fixtureXml });

  await page.goto('/nex-note-app/');
  await expect(page.getByTitle('Save as')).toBeVisible({ timeout: 20_000 });
  await expect(page.getByTestId('left-notation-sidebar-collapsed-rail')).toBeVisible();
  await expect(page.getByTestId('workspace-collapsed-rail')).toBeVisible();

  const initialLayout = await page.evaluate(() => {
    const header = document.querySelector<HTMLElement>('[data-testid="app-header"]');
    const scoreColumn = document.querySelector<HTMLElement>('.nex-score-column');
    return {
      documentWidth: document.documentElement.scrollWidth,
      viewportWidth: window.innerWidth,
      headerClientWidth: header?.clientWidth ?? 0,
      headerScrollWidth: header?.scrollWidth ?? 0,
      scoreWidth: scoreColumn?.getBoundingClientRect().width ?? 0,
    };
  });

  expect(initialLayout.documentWidth).toBe(initialLayout.viewportWidth);
  expect(initialLayout.headerScrollWidth).toBe(initialLayout.headerClientWidth);
  expect(initialLayout.scoreWidth).toBeGreaterThan(750);

  await page.getByTestId('left-notation-sidebar-collapsed-rail').getByRole('button').first().tap();
  await expect(page.locator('.nex-left-tools-panel')).toBeVisible();
  const leftOpenScoreWidth = await page.locator('.nex-score-column').evaluate(
    (element) => element.getBoundingClientRect().width,
  );
  expect(leftOpenScoreWidth).toBeGreaterThan(750);

  await page.locator('.nex-left-tools-header').getByRole('button').tap();
  await page.getByTestId('workspace-collapsed-rail').getByRole('button').tap();
  await expect(page.getByTestId('workspace-panel')).toBeVisible();
  const rightPanelBox = await page.getByTestId('workspace-panel').boundingBox();
  expect(rightPanelBox).not.toBeNull();
  expect(rightPanelBox!.x + rightPanelBox!.width).toBeLessThanOrEqual(834);
  expect(await page.locator('.nex-score-column').evaluate(
    (element) => element.getBoundingClientRect().width,
  )).toBeGreaterThan(800);

  expect(browserErrors).toEqual([]);
});

test('native iPad exposes a contextual touch action for deleting the selected note @smoke', async ({ page }) => {
  await page.addInitScript(({ xml }) => {
    localStorage.setItem('nex-note:e2e-boot', JSON.stringify({
      xml,
      filename: 'ipad-delete-test.musicxml',
    }));
    document.addEventListener('DOMContentLoaded', () => {
      document.documentElement.classList.add('nex-note-native', 'nex-note-ios');
    });
  }, { xml: fixtureXml });

  await page.goto('/nex-note-app/');
  await expect(page.getByTitle('Save as')).toBeVisible({ timeout: 20_000 });

  await expect.poll(() => page.evaluate(() => (
    Boolean((window as typeof window & {
      __NEX_NOTE_E2E_SELECT_NOTE__?: (locator: {
        measureNumber: number;
        staffIndex: number;
        voiceId: number;
        timestampNum: number;
        timestampDen: number;
      }) => boolean;
    }).__NEX_NOTE_E2E_SELECT_NOTE__?.({
      measureNumber: 1,
      staffIndex: 1,
      voiceId: 1,
      timestampNum: 0,
      timestampDen: 1,
    }))
  ))).toBe(true);

  const actions = page.getByTestId('ipad-selection-actions');
  await expect(actions).toBeVisible();
  await expect(actions).toContainText('Selected: C4');

  await page.getByTestId('ipad-delete-note').tap();

  await expect.poll(() => page.evaluate(() => (
    (window as typeof window & {
      __NEX_NOTE_E2E_STATE__?: { xml: string };
    }).__NEX_NOTE_E2E_STATE__?.xml.includes('<rest') ?? false
  ))).toBe(true);
  await expect.poll(() => page.evaluate(() => (
    (window as typeof window & {
      __NEX_NOTE_E2E_STATE__?: { xml: string };
    }).__NEX_NOTE_E2E_STATE__?.xml.includes('<pitch><step>C</step><octave>4</octave></pitch>') ?? true
  ))).toBe(false);
});
