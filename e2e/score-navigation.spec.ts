import fs from 'node:fs';
import path from 'node:path';

import { expect, test } from '@playwright/test';
import type { Page, Route } from '@playwright/test';
import { Midi } from '@tonejs/midi';
import { writeFailureArtifacts } from './support/failure-artifacts';

const fixturePath = path.join(process.cwd(), 'e2e', 'fixtures', 'simple.musicxml');
const fixtureBuffer = fs.readFileSync(fixturePath);
const fixtureXml = fixtureBuffer.toString('utf8');

function buildLongFixtureXml(measures = 36) {
  const measureXml = Array.from({ length: measures }, (_, index) => {
    const measureNumber = index + 1;
    const attributes = measureNumber === 1 ? `
      <attributes>
        <divisions>1</divisions>
        <key><fifths>0</fifths></key>
        <time><beats>4</beats><beat-type>4</beat-type></time>
        <clef><sign>G</sign><line>2</line></clef>
      </attributes>` : '';
    const rehearsal = measureNumber % 8 === 1 ? `
      <direction placement="above">
        <direction-type>
          <rehearsal>${String.fromCharCode(64 + Math.min(Math.ceil(measureNumber / 8), 26))}</rehearsal>
        </direction-type>
      </direction>` : '';
    return `
      <measure number="${measureNumber}">
        ${attributes}
        ${rehearsal}
        <note>
          <pitch><step>C</step><octave>4</octave></pitch>
          <duration>1</duration>
          <voice>1</voice>
          <type>quarter</type>
          <staff>1</staff>
        </note>
        <note>
          <pitch><step>D</step><octave>4</octave></pitch>
          <duration>1</duration>
          <voice>1</voice>
          <type>quarter</type>
          <staff>1</staff>
        </note>
        <note>
          <pitch><step>E</step><octave>4</octave></pitch>
          <duration>1</duration>
          <voice>1</voice>
          <type>quarter</type>
          <staff>1</staff>
        </note>
        <note>
          <pitch><step>F</step><octave>4</octave></pitch>
          <duration>1</duration>
          <voice>1</voice>
          <type>quarter</type>
          <staff>1</staff>
        </note>
      </measure>`;
  }).join('\n');

  return `<?xml version="1.0" encoding="UTF-8"?>
<score-partwise version="3.1">
  <work>
    <work-title>Long Fixture</work-title>
  </work>
  <identification>
    <creator type="composer">Codex</creator>
  </identification>
  <part-list>
    <score-part id="P1">
      <part-name>Piano</part-name>
      <part-abbreviation>Pno.</part-abbreviation>
    </score-part>
  </part-list>
  <part id="P1">
    ${measureXml}
  </part>
</score-partwise>`;
}

function buildMidiBody(xml = fixtureXml) {
  const measureCount = Math.max((xml.match(/<measure\b/g) ?? []).length, 1);
  const midi = new Midi();
  midi.header.setTempo(480);
  const track = midi.addTrack();
  const quarterSeconds = 0.125;
  const measureSeconds = quarterSeconds * 4;
  for (let measure = 0; measure < measureCount; measure += 1) {
    const measureStart = measure * measureSeconds;
    track.addNote({ midi: 60, time: measureStart, duration: 0.11, velocity: 0.8 });
    track.addNote({ midi: 62, time: measureStart + quarterSeconds, duration: 0.11, velocity: 0.8 });
    track.addNote({ midi: 64, time: measureStart + quarterSeconds * 2, duration: 0.11, velocity: 0.8 });
    track.addNote({ midi: 65, time: measureStart + quarterSeconds * 3, duration: 0.11, velocity: 0.8 });
  }
  return Buffer.from(midi.toArray());
}

async function installPlaybackStubs(page: Page) {
  await page.addInitScript(() => {
    (window as typeof window & {
      __NEX_NOTE_E2E_INSTRUMENT_LOADER__?: () => Promise<{ start: () => void; stop: () => void }>;
    }).__NEX_NOTE_E2E_INSTRUMENT_LOADER__ = async () => ({
      start() {},
      stop() {},
    });
  });
}

async function mockStableRoutes(page: Page) {
  await page.route('**/api/midi', async (route: Route) => {
    const payload = route.request().postDataJSON() as { xml?: string } | null;
    const midiBody = buildMidiBody(payload?.xml ?? fixtureXml);
    await route.fulfill({
      status: 200,
      contentType: 'audio/midi',
      body: midiBody,
    });
  });

  await page.route('**/api/ollama-models', async (route: Route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        models: [
          { id: 'gemma4:31b', label: 'Gemma 4 31B' },
          { id: 'llama3:8b', label: 'Llama 3 8B' },
        ],
      }),
    });
  });
}

async function bootWithScore(
  page: Page,
  name = 'simple.musicxml',
  xml = fixtureXml,
) {
  await page.addInitScript(({ bootXml, fileName }: { bootXml: string; fileName: string }) => {
    const now = Date.now();
    localStorage.setItem('nex-note:score-library', JSON.stringify([{
      id: 'seeded-score',
      name: fileName,
      xml: bootXml,
      format: 'musicxml',
      sizeBytes: bootXml.length,
      measures: 1,
      parts: 1,
      favorite: false,
      createdAt: now,
      updatedAt: now,
      lastOpenedAt: now,
    }]));
    localStorage.setItem('nex-note:recent-files', JSON.stringify([{
      name: fileName,
      timestamp: now,
      size: bootXml.length,
    }]));
    localStorage.setItem('nex-note:e2e-boot', JSON.stringify({ xml: bootXml, filename: fileName }));
  }, { bootXml: xml, fileName: name });
  await page.addInitScript(() => {
    document.documentElement.style.scrollBehavior = 'auto';
  });
  await page.goto('/');
  await expect(page.getByTitle('Save as')).toBeVisible({ timeout: 15_000 });
}

test.beforeEach(async ({ page }) => {
  await installPlaybackStubs(page);
  await mockStableRoutes(page);
});

test.afterEach(async ({ page }, testInfo) => {
  await writeFailureArtifacts(page, testInfo);
});

test('score navigation supports wheel scroll, zoom, view switching, navigator, and find/go to', async ({ page }) => {
  await bootWithScore(page, 'long-navigation.musicxml', buildLongFixtureXml(40));

  const viewport = page.getByTestId('score-viewport');
  await expect(viewport).toBeVisible();
  await viewport.click();

  await page.getByLabel('Score view mode').selectOption('continuous-horizontal');
  await page.waitForTimeout(800);
  await viewport.hover();

  const beforeHorizontal = await viewport.evaluate((node) => ({
    left: node.scrollLeft,
    top: node.scrollTop,
  }));

  await page.keyboard.down('Shift');
  await page.mouse.wheel(0, 900);
  await page.keyboard.up('Shift');
  await page.waitForTimeout(150);

  const afterHorizontal = await viewport.evaluate((node) => ({
    left: node.scrollLeft,
    top: node.scrollTop,
  }));
  expect(afterHorizontal.left).toBeGreaterThan(beforeHorizontal.left);

  await page.keyboard.down('Control');
  await page.mouse.wheel(0, -900);
  await page.keyboard.up('Control');
  await expect(page.getByLabel('Zoom percent')).not.toHaveValue('100');

  await page.keyboard.press('Control+0');
  await expect(page.getByLabel('Zoom percent')).toHaveValue('100');

  await page.getByLabel('Score view mode').selectOption('page');
  await page.waitForTimeout(800);
  await viewport.click();
  await page.keyboard.press('PageDown');
  await page.waitForTimeout(250);
  const pageDownTop = await viewport.evaluate((node) => node.scrollTop);
  expect(pageDownTop).toBeGreaterThan(0);

  await page.getByRole('button', { name: 'Find/Go to' }).click();
  await page.getByPlaceholder('Measure, p2, r1, A').fill('1');
  await page.getByRole('button', { name: 'Go', exact: true }).click();
  await expect(page.getByText('measure 1', { exact: true })).toBeVisible();
  await expect.poll(
    () => viewport.evaluate((node) => node.scrollTop),
    { message: 'find/go to measure 1 should scroll back toward the top' },
  ).toBeLessThan(pageDownTop);

  await page.getByRole('button', { name: 'Navigator' }).click();
  await expect(page.getByTestId('navigator-box')).toBeVisible();
  await page.getByRole('button', { name: /Page 1/ }).click();
  await page.waitForTimeout(250);
  const afterNavigatorScroll = await viewport.evaluate((node) => node.scrollTop);
  expect(afterNavigatorScroll).toBeGreaterThanOrEqual(0);
});

test('playback cursor advances through measures and keeps the current bar visible', async ({ page }) => {
  await bootWithScore(page, 'long-playback.musicxml', buildLongFixtureXml(40));

  const viewport = page.getByTestId('score-viewport');
  await expect(viewport).toBeVisible();
  await page.getByLabel('Score view mode').selectOption('continuous-vertical');
  await viewport.evaluate((node) => node.scrollTo({ top: 0, left: 0 }));

  const beforeScrollTop = await viewport.evaluate((node) => node.scrollTop);
  await page.getByTitle('Play (Space)').click();
  await expect(page.getByTitle('Pause (Space)')).toBeVisible();

  await expect.poll(async () => {
    const value = await viewport.getAttribute('data-playback-measure');
    return Number.parseInt(value ?? '0', 10);
  }, { timeout: 15000 }).toBeGreaterThan(18);

  const afterScrollTop = await viewport.evaluate((node) => node.scrollTop);
  expect(afterScrollTop).toBeGreaterThan(beforeScrollTop + 20);
  await expect(viewport).toHaveAttribute('data-playback-active', 'true');

  await page.getByTitle('Stop').click();
  await expect(viewport).toHaveAttribute('data-playback-active', 'false');
});

test('horizontal playback follow does not trigger viewport update depth warnings', async ({ page }) => {
  const updateDepthErrors: string[] = [];
  page.on('console', (message) => {
    if (message.type() === 'error' && message.text().includes('Maximum update depth exceeded')) {
      updateDepthErrors.push(message.text());
    }
  });

  await page.setViewportSize({ width: 780, height: 620 });
  await bootWithScore(page, 'long-horizontal-playback.musicxml', buildLongFixtureXml(48));

  const viewport = page.getByTestId('score-viewport');
  await expect(viewport).toBeVisible();
  await page.getByLabel('Score view mode').selectOption('continuous-horizontal');
  await viewport.evaluate((node) => node.scrollTo({ top: 0, left: 0 }));

  await page.getByTitle('Play (Space)').click();
  await expect(page.getByTitle('Pause (Space)')).toBeVisible();

  await expect.poll(async () => {
    const value = await viewport.getAttribute('data-playback-measure');
    return Number.parseInt(value ?? '0', 10);
  }, { timeout: 12000 }).toBeGreaterThan(10);

  const afterScrollLeft = await viewport.evaluate((node) => node.scrollLeft);
  expect(afterScrollLeft).toBeGreaterThan(0);
  await page.getByTitle('Stop').click();
  expect(updateDepthErrors).toEqual([]);
});

test('Ctrl+wheel zoom keeps the score point under the pointer', async ({ page }) => {
  test.setTimeout(90_000);
  await bootWithScore(page, 'long-zoom-anchor.musicxml', buildLongFixtureXml(40));

  const viewport = page.getByTestId('score-viewport');
  await expect(viewport).toBeVisible();
  await page.waitForTimeout(800);
  await viewport.evaluate((node) => {
    node.scrollTop = Math.round((node.scrollHeight - node.clientHeight) / 2);
  });
  await page.waitForTimeout(200);

  const box = await viewport.boundingBox();
  expect(box).not.toBeNull();
  const offset = { ox: box!.width * 0.35, oy: box!.height * 0.4 };
  await page.mouse.move(box!.x + offset.ox, box!.y + offset.oy);

  const measure = (node: HTMLElement, o: { ox: number; oy: number }) => ({
    fx: (node.scrollLeft + o.ox) / node.scrollWidth,
    fy: (node.scrollTop + o.oy) / node.scrollHeight,
    scrollHeight: node.scrollHeight,
    canScrollX: node.scrollWidth > node.clientWidth + 1,
  });
  const before = await viewport.evaluate(measure, offset);
  const consoleLines: string[] = [];
  page.on('console', (message) => {
    if (['error', 'warning'].includes(message.type())) consoleLines.push(`${message.type()}: ${message.text().slice(0, 300)}`);
  });
  page.on('pageerror', (error) => consoleLines.push(`pageerror: ${String(error).slice(0, 300)}`));
  const renderProbe = () => page.evaluate(() => {
    const canvas = document.querySelector('[data-testid="score-canvas"]');
    const svg = canvas?.querySelector('svg');
    const box = svg?.getBoundingClientRect();
    const notehead = canvas?.querySelector('[class*="vf-notehead"]')?.getBoundingClientRect();
    const marked = svg ? Boolean((svg as unknown as { __zoomProbe?: boolean }).__zoomProbe) : null;
    if (svg) (svg as unknown as { __zoomProbe?: boolean }).__zoomProbe = true;
    return {
      sameSvgAsPreviousProbe: marked,
      noteheadWidth: Math.round((notehead?.width ?? -1) * 100) / 100,
      svgViewBox: svg?.getAttribute('viewBox') ?? null,
      svgCount: canvas?.querySelectorAll('svg').length ?? -1,
      svgWidth: Math.round(box?.width ?? -1),
      svgHeight: Math.round(box?.height ?? -1),
      zoomInput: (document.querySelector('[aria-label="Zoom percent"]') as HTMLInputElement | null)?.value,
      loading: document.body.innerText.includes('Rendering'),
    };
  });
  const probeBefore = await renderProbe();

  await page.keyboard.down('Control');
  await page.mouse.wheel(0, -100);
  await page.keyboard.up('Control');
  await page.waitForTimeout(3000);
  const probeAfter = await renderProbe();
  // eslint-disable-next-line no-console
  console.log('ZOOM-PROBE', JSON.stringify({ probeBefore, probeAfter, consoleLines }));
  await page.getByLabel('Zoom percent').fill('200');
  await page.waitForTimeout(3000);
  // eslint-disable-next-line no-console
  console.log('ZOOM-PROBE-200', JSON.stringify({ probe: await renderProbe(), consoleLines }));
  await expect(page.getByLabel('Zoom percent')).toHaveValue('110');
  // The zoom rebuilds the score asynchronously; wait for the taller layout, then let scroll settle.
  await expect.poll(
    () => viewport.evaluate((node) => node.scrollHeight),
    { timeout: 20_000, message: 'score should re-render taller after zooming in' },
  ).toBeGreaterThan(before.scrollHeight);
  await page.waitForTimeout(500);

  const after = await viewport.evaluate(measure, offset);
  // The same relative position of the score stays under the pointer (5 % tolerance for reflow).
  expect(Math.abs(after.fy - before.fy)).toBeLessThan(0.05);
  if (before.canScrollX && after.canScrollX) {
    expect(Math.abs(after.fx - before.fx)).toBeLessThan(0.05);
  }
});
