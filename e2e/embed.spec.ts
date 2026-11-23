import fs from 'node:fs';
import path from 'node:path';

import { expect, test } from '@playwright/test';
import type { Route } from '@playwright/test';

const fixturePath = path.join(process.cwd(), 'e2e', 'fixtures', 'simple.musicxml');
const fixtureXml = fs.readFileSync(fixturePath, 'utf8');

test('generic iframe embed fetches MusicXML and renders without MIDI startup @smoke', async ({ page, baseURL }) => {
  const startupWarnings: string[] = [];
  const midiRequests: string[] = [];

  page.on('console', (message) => {
    if (message.type() !== 'warning' && message.type() !== 'error') return;
    const text = message.text();
    if (/(width|height).*0|0.*(width|height)|render container/i.test(text)) {
      startupWarnings.push(text);
    }
  });

  page.on('request', (request) => {
    if (request.url().includes('/api/midi')) {
      midiRequests.push(request.url());
    }
  });

  await page.route('**/api/nex-note/score-data?entry=embed-fixture', async (route: Route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        success: true,
        xml: fixtureXml,
        filename: 'embedded-fixture.musicxml',
      }),
    });
  });

  await page.route('**/api/ollama-models', async (route: Route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ models: [{ id: 'gemma4:31b', label: 'Gemma 4 31B' }] }),
    });
  });

  await page.route('**/embed-host', async (route: Route) => {
    await route.fulfill({
      status: 200,
      contentType: 'text/html',
      body: `
        <!doctype html>
        <html>
          <body style="margin:0">
            <iframe
              title="nex-note embed"
              src="/?embed=1&entry=embed-fixture"
              style="display:block;width:920px;height:680px;border:0"
            ></iframe>
          </body>
        </html>
      `,
    });
  });

  await page.goto(new URL('/embed-host', baseURL ?? 'http://localhost:3101').href);

  const embedFrame = page.frameLocator('iframe[title="nex-note embed"]');
  await expect(embedFrame.locator('[data-testid="score-canvas"] .vf-notehead').first()).toBeVisible({ timeout: 20_000 });
  await expect(embedFrame.getByTestId('embed-status')).toHaveCount(0, { timeout: 10_000 });
  await expect(embedFrame.getByTestId('embed-error')).toHaveCount(0);

  expect(midiRequests, 'embed startup should not request MIDI generation').toEqual([]);
  expect(startupWarnings, 'normal iframe startup should not warn about zero-sized render layout').toEqual([]);
});

test('iframe embed waits for a hidden host layout before rendering the score @smoke', async ({ page, baseURL }) => {
  const startupWarnings: string[] = [];
  let scoreDataRequested = false;

  page.on('console', (message) => {
    if (message.type() !== 'warning' && message.type() !== 'error') return;
    const text = message.text();
    if (/(width|height).*0|0.*(width|height)|render container/i.test(text)) {
      startupWarnings.push(text);
    }
  });

  await page.route('**/api/nex-note/score-data?entry=hidden-layout-fixture', async (route: Route) => {
    scoreDataRequested = true;
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        success: true,
        xml: fixtureXml,
        filename: 'hidden-layout-fixture.musicxml',
      }),
    });
  });

  await page.route('**/api/ollama-models', async (route: Route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ models: [{ id: 'gemma4:31b', label: 'Gemma 4 31B' }] }),
    });
  });

  await page.route('**/hidden-layout-embed-host', async (route: Route) => {
    await route.fulfill({
      status: 200,
      contentType: 'text/html',
      body: `
        <!doctype html>
        <html>
          <body style="margin:0">
            <div id="embed-tab" style="display:none">
              <iframe
                title="nex-note delayed-layout embed"
                src="/?embed=1&chrome=0&entry=hidden-layout-fixture"
                style="display:block;width:920px;height:680px;border:0"
              ></iframe>
            </div>
          </body>
        </html>
      `,
    });
  });

  await page.goto(new URL('/hidden-layout-embed-host', baseURL ?? 'http://localhost:3101').href, { waitUntil: 'domcontentloaded' });
  await expect.poll(() => scoreDataRequested, { message: 'hidden iframe should request its score data' }).toBe(true);

  // The previous implementation turned this temporary 0x0 layout into a permanent embed error after seven seconds.
  await page.waitForTimeout(8_000);
  await page.locator('#embed-tab').evaluate((element) => { element.style.display = 'block'; });

  const embedFrame = page.frameLocator('iframe[title="nex-note delayed-layout embed"]');
  await expect(embedFrame.locator('[data-testid="score-canvas"] .vf-notehead').first()).toBeVisible({ timeout: 20_000 });
  await expect(embedFrame.getByTestId('embed-error')).toHaveCount(0);
  expect(startupWarnings, 'delayed iframe layout should not be reported as a score render failure').toEqual([]);
});

test('iframe embed can start with full chrome and collapsed workspace rails @smoke', async ({ page, baseURL }) => {
  const startupWarnings: string[] = [];
  const midiRequests: string[] = [];

  page.on('console', (message) => {
    if (message.type() !== 'warning' && message.type() !== 'error') return;
    const text = message.text();
    if (/(width|height).*0|0.*(width|height)|render container/i.test(text)) {
      startupWarnings.push(text);
    }
  });

  page.on('request', (request) => {
    if (request.url().includes('/api/midi')) {
      midiRequests.push(request.url());
    }
  });

  await page.addInitScript(() => {
    window.localStorage.setItem('nex-note:left-notation-sidebar-collapsed', 'false');
  });

  await page.route('**/api/nex-note/score-data?entry=embed-fixture', async (route: Route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        success: true,
        xml: fixtureXml,
        filename: 'embedded-fixture.musicxml',
      }),
    });
  });

  await page.route('**/api/ollama-models', async (route: Route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ models: [{ id: 'gemma4:31b', label: 'Gemma 4 31B' }] }),
    });
  });

  await page.route('**/compact-chrome-embed-host', async (route: Route) => {
    await route.fulfill({
      status: 200,
      contentType: 'text/html',
      body: `
        <!doctype html>
        <html>
          <body style="margin:0">
            <iframe
              title="nex-note compact chrome embed"
              src="/?embed=1&entry=embed-fixture&leftTools=collapsed&assistant=collapsed"
              style="display:block;width:920px;height:680px;border:0"
            ></iframe>
          </body>
        </html>
      `,
    });
  });

  await page.goto(new URL('/compact-chrome-embed-host', baseURL ?? 'http://localhost:3101').href);

  const embedFrame = page.frameLocator('iframe[title="nex-note compact chrome embed"]');
  await expect(embedFrame.locator('[data-testid="score-canvas"] .vf-notehead').first()).toBeVisible({ timeout: 20_000 });
  await expect(embedFrame.getByTestId('app-header')).toBeVisible();
  await expect(embedFrame.getByTestId('notation-toolbar')).toBeVisible();
  await expect(embedFrame.getByTestId('left-notation-sidebar')).toBeVisible();
  await expect(embedFrame.getByTestId('left-notation-sidebar-collapsed-rail')).toBeVisible();
  await expect(embedFrame.getByTestId('workspace-collapsed-rail')).toBeVisible();
  await expect(embedFrame.getByTestId('workspace-panel')).toHaveCount(0);
  await expect(embedFrame.getByTestId('score-only-embed')).toHaveCount(0);
  await expect(embedFrame.getByTestId('embed-status')).toHaveCount(0, { timeout: 10_000 });
  await expect(embedFrame.getByTestId('embed-error')).toHaveCount(0);

  await embedFrame.getByTestId('left-notation-sidebar-collapsed-rail').getByRole('button').click();
  await expect(embedFrame.getByTestId('left-notation-sidebar-collapsed-rail')).toHaveCount(0);
  await expect(embedFrame.getByTestId('left-notation-sidebar')).toBeVisible();

  await embedFrame.getByTestId('workspace-collapsed-rail').getByRole('button').click();
  await expect(embedFrame.getByTestId('workspace-panel')).toBeVisible();

  expect(midiRequests, 'compact chrome embed startup should not request MIDI generation').toEqual([]);
  expect(startupWarnings, 'compact chrome iframe startup should not warn about zero-sized render layout').toEqual([]);
});

test('score-only iframe embed shows loading bar then renders only the score @smoke', async ({ page, baseURL }) => {
  const midiRequests: string[] = [];
  let releaseScoreResponse: (() => void) | undefined;

  page.on('request', (request) => {
    if (request.url().includes('/api/midi')) {
      midiRequests.push(request.url());
    }
  });

  await page.route('**/api/nex-note/score-data?entry=embed-fixture', async (route: Route) => {
    await new Promise<void>((resolve) => {
      releaseScoreResponse = resolve;
    });
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        success: true,
        xml: fixtureXml,
        filename: 'embedded-fixture.musicxml',
      }),
    });
  });

  await page.route('**/api/ollama-models', async (route: Route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ models: [{ id: 'gemma4:31b', label: 'Gemma 4 31B' }] }),
    });
  });

  await page.route('**/score-only-embed-host', async (route: Route) => {
    await route.fulfill({
      status: 200,
      contentType: 'text/html',
      body: `
        <!doctype html>
        <html>
          <body style="margin:0">
            <iframe
              title="nex-note score-only embed"
              src="/?embed=1&chrome=0&entry=embed-fixture"
              style="display:block;width:920px;height:680px;border:0"
            ></iframe>
          </body>
        </html>
      `,
    });
  });

  await page.goto(new URL('/score-only-embed-host', baseURL ?? 'http://localhost:3101').href, { waitUntil: 'domcontentloaded' });

  const embedFrame = page.frameLocator('iframe[title="nex-note score-only embed"]');
  await expect(embedFrame.getByTestId('embed-loading')).toBeVisible();
  await expect(embedFrame.getByTestId('embed-loading-bar')).toBeVisible();
  await expect(embedFrame.getByTestId('welcome-screen')).toHaveCount(0);
  await expect(embedFrame.getByTestId('app-header')).toHaveCount(0);

  await expect.poll(() => Boolean(releaseScoreResponse), {
    message: 'score-only embed should request score data',
  }).toBe(true);
  releaseScoreResponse?.();

  await expect(embedFrame.locator('[data-testid="score-canvas"] .vf-notehead').first()).toBeVisible({ timeout: 20_000 });
  await expect(embedFrame.getByTestId('embed-loading')).toHaveCount(0, { timeout: 10_000 });
  await expect(embedFrame.getByTestId('embed-error')).toHaveCount(0);
  await expect(embedFrame.getByTestId('app-header')).toHaveCount(0);
  await expect(embedFrame.getByTestId('provider-selector')).toHaveCount(0);
  await expect(embedFrame.getByTestId('workspace-panel')).toHaveCount(0);
  await expect(embedFrame.getByTestId('workspace-collapsed-rail')).toHaveCount(0);
  await expect(embedFrame.getByTestId('notation-toolbar')).toHaveCount(0);
  await expect(embedFrame.getByTestId('left-notation-sidebar')).toHaveCount(0);
  await expect(embedFrame.getByTestId('score-only-embed')).toBeVisible();

  expect(midiRequests, 'score-only embed startup should not request MIDI generation').toEqual([]);
});
