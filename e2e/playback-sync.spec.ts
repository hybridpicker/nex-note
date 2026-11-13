// Playback sync probe: plays generated scores with the real MIDI route and real soundfont
// playback, and measures how far the highlighted note and the playhead are from the sound.
// See docs/playback-sync.md for the conventions and the budgets.
//
//   NEX_SYNC_PROBE_REPORT_ONLY=1  record and print numbers without enforcing budgets
//   NEX_SYNC_PROBE_LABEL=before    name of the result files in test-results/playback-sync/
import fs from 'node:fs';
import path from 'node:path';

import { _electron as electron, expect, test } from '@playwright/test';
import type { ElectronApplication, Page } from '@playwright/test';
import {
  analyzePlaybackSync,
  type ExpectedOnset,
  type PlaybackSyncReport,
  type SyncProbeRecording,
} from '../lib/playback-sync-probe';
import {
  denseFixture,
  longMultiPartFixture,
  smallFixture,
  structureFixture,
  type SyncFixture,
} from './support/playback-sync-fixtures';

const REPORT_ONLY = process.env.NEX_SYNC_PROBE_REPORT_ONLY === '1';
// NEX_SYNC_PROBE_ELECTRON=1 also runs the probe inside the Electron shell (dev runtime, own
// temporary profile, pointed at the test server), with the real macOS/Linux audio output.
const RUN_ELECTRON = process.env.NEX_SYNC_PROBE_ELECTRON === '1';
const LABEL = process.env.NEX_SYNC_PROBE_LABEL ?? 'current';
const OUTPUT_DIR = path.join(process.cwd(), 'test-results', 'playback-sync');

// Budgets from docs/playback-sync.md.
const BUDGET = {
  medianAbsMs: 10,
  p95AbsMs: 20,
  maxAbsMs: 34,
  driftMsPerMinute: 5,
  pressToFirstSoundMs: 100,
};

async function bootWithScore(page: Page, fixture: SyncFixture, url = '/') {
  await page.addInitScript(({ xml, fileName }: { xml: string; fileName: string }) => {
    (window as typeof window & { __NEX_NOTE_SYNC_PROBE_REQUEST__?: boolean }).__NEX_NOTE_SYNC_PROBE_REQUEST__ = true;
    if (window.top !== window) return;
    if (localStorage.getItem('nex-note:e2e-boot')) return;
    const now = Date.now();
    localStorage.setItem('nex-note:score-library', JSON.stringify([{
      id: 'seeded-score',
      name: fileName,
      xml,
      format: 'musicxml',
      sizeBytes: xml.length,
      measures: 1,
      parts: 1,
      favorite: false,
      createdAt: now,
      updatedAt: now,
      lastOpenedAt: now,
    }]));
    localStorage.setItem('nex-note:recent-files', JSON.stringify([{ name: fileName, timestamp: now, size: xml.length }]));
    localStorage.setItem('nex-note:e2e-boot', JSON.stringify({ xml, filename: fileName }));
  }, { xml: fixture.xml, fileName: `${fixture.name}.musicxml` });
  await page.goto(url);
  // The rendered score (Electron hides the in-page file buttons behind its native menu).
  await expect(page.locator('[data-measure-number]').first()).toBeVisible({ timeout: 30_000 });
}

async function readPlaybackState(page: Page) {
  return page.evaluate(() => (
    (window as typeof window & { __NEX_NOTE_E2E_STATE__?: { playbackState?: string } }).__NEX_NOTE_E2E_STATE__?.playbackState ?? null
  ));
}

async function resetProbe(page: Page) {
  await page.evaluate(() => {
    (window as typeof window & { __NEX_NOTE_SYNC_PROBE__?: { reset(): void } }).__NEX_NOTE_SYNC_PROBE__?.reset();
  });
}

async function pressPlay(page: Page) {
  await page.evaluate(() => {
    const button = document.querySelector<HTMLButtonElement>('button[title="Play (Space)"]');
    if (!button) throw new Error('Play button not found');
    (window as typeof window & { __NEX_NOTE_SYNC_PROBE__?: { mark(kind: string): void } }).__NEX_NOTE_SYNC_PROBE__?.mark('press');
    button.click();
  });
}

async function pressStop(page: Page) {
  const stop = page.getByTitle(/^Stop/).first();
  await stop.click();
  await expect.poll(() => readPlaybackState(page)).toBe('stopped');
}

async function readRecording(page: Page) {
  return page.evaluate(() => (
    (window as typeof window & { __NEX_NOTE_SYNC_PROBE__?: { recording: SyncProbeRecording } }).__NEX_NOTE_SYNC_PROBE__?.recording ?? null
  )) as Promise<SyncProbeRecording | null>;
}

async function waitForPlaybackEnd(page: Page, seconds: number) {
  await expect.poll(() => readPlaybackState(page), { timeout: 10_000 }).toBe('playing');
  await expect.poll(() => readPlaybackState(page), { timeout: (seconds + 10) * 1000, intervals: [500] }).toBe('stopped');
}

/** First play loads instruments; measure it, then stop so the measured run starts warm. */
async function warmUp(page: Page) {
  await resetProbe(page);
  await pressPlay(page);
  await expect.poll(() => readPlaybackState(page), { timeout: 20_000 }).toBe('playing');
  await page.waitForTimeout(1_500);
  const cold = analyzePlaybackSync((await readRecording(page))!, null);
  await pressStop(page);
  await page.waitForTimeout(300);
  return cold;
}

function summarize(report: PlaybackSyncReport) {
  return {
    highlight: report.highlight,
    playhead: report.playhead,
    audio: report.audio,
    start: report.start,
    frameIntervalMs: report.frameIntervalMs,
    frameGaps: report.frameGaps,
    outputLatencyMs: report.outputLatencyMs,
  };
}

function writeReport(name: string, payload: unknown) {
  fs.mkdirSync(OUTPUT_DIR, { recursive: true });
  fs.writeFileSync(path.join(OUTPUT_DIR, `${LABEL}-${name}.json`), `${JSON.stringify(payload, null, 2)}\n`);
}

function expectWithinBudget(report: PlaybackSyncReport, expected: ExpectedOnset[]) {
  if (REPORT_ONLY) return;
  expect(report.audio.skipped, 'no note is skipped').toBe(0);
  expect(report.audio.shiftedLate, 'no note is shifted late').toBe(0);
  expect(report.audio.missingOnsets, 'every expected onset sounds').toBe(0);
  for (const kind of ['highlight', 'playhead'] as const) {
    const stats = report[kind];
    expect(stats.missing, `${kind}: every onset is shown`).toBe(0);
    expect(stats.count, `${kind}: measured onsets`).toBe(expected.length);
    expect(Math.abs(stats.median ?? Infinity), `${kind}: median offset`).toBeLessThanOrEqual(BUDGET.medianAbsMs);
    expect(stats.p95Abs ?? Infinity, `${kind}: p95 |offset|`).toBeLessThanOrEqual(BUDGET.p95AbsMs);
    expect(stats.maxAbs ?? Infinity, `${kind}: max |offset|`).toBeLessThanOrEqual(BUDGET.maxAbsMs);
    expect(Math.abs(stats.driftMsPerMinute ?? 0), `${kind}: drift`).toBeLessThanOrEqual(BUDGET.driftMsPerMinute);
  }
}

async function measureFullPlay(page: Page, fixture: SyncFixture, name: string, options?: {
  during?: (page: Page) => Promise<void>;
  url?: string;
}) {
  await bootWithScore(page, fixture, options?.url);
  const cold = await warmUp(page);
  await resetProbe(page);
  await pressPlay(page);
  if (options?.during) await options.during(page);
  await waitForPlaybackEnd(page, fixture.durationSeconds);
  const recording = (await readRecording(page))!;
  const report = analyzePlaybackSync(recording, fixture.expected);
  const payload = { fixture: fixture.name, scenario: name, cold: cold.start, ...summarize(report), perOnset: report.perOnset };
  writeReport(name, payload);
  if (process.env.NEX_SYNC_PROBE_RAW === '1') writeReport(`${name}-raw`, recording);
  console.log(`[sync-probe] ${LABEL} ${name}: ${JSON.stringify({ cold: cold.start, ...summarize(report) })}`);
  return report;
}

test.describe('playback sync probe', () => {
  test.describe.configure({ timeout: 240_000 });

  test('small score stays in sync', async ({ page }) => {
    const fixture = smallFixture();
    const report = await measureFullPlay(page, fixture, 'small');
    expectWithinBudget(report, fixture.expected);
  });

  test('dense piano score stays in sync', async ({ page }) => {
    const fixture = denseFixture();
    const report = await measureFullPlay(page, fixture, 'dense');
    expectWithinBudget(report, fixture.expected);
  });

  test('time signature, tempo and repeat structure stays in sync', async ({ page }) => {
    const fixture = structureFixture();
    const report = await measureFullPlay(page, fixture, 'structure');
    expectWithinBudget(report, fixture.expected);
  });

  test('long multi-part score stays in sync without drift', async ({ page }) => {
    const fixture = longMultiPartFixture();
    const report = await measureFullPlay(page, fixture, 'long');
    expectWithinBudget(report, fixture.expected);
  });

  test('start from a selected note sounds promptly and in sync', async ({ page }) => {
    const fixture = structureFixture();
    await bootWithScore(page, fixture);
    const cold = await warmUp(page);
    // Beat 2 of a 3/4 bar: a quarter note into the bar, a third of the bar.
    const startIndex = fixture.expected.findIndex((onset) => onset.measureNumber === 2 && Math.abs(onset.positionWholes - 0.25) < 1e-6);
    const selected = await page.evaluate(() => (
      (window as typeof window & { __NEX_NOTE_E2E_SELECT_NOTE__?: (locator: object) => boolean })
        .__NEX_NOTE_E2E_SELECT_NOTE__?.({ measureNumber: 2, staffIndex: 1, timestampNum: 1, timestampDen: 4 }) ?? false
    ));
    expect(selected).toBe(true);
    await page.waitForTimeout(800);
    await resetProbe(page);
    await pressPlay(page);
    await expect.poll(() => readPlaybackState(page), { timeout: 20_000 }).toBe('playing');
    await page.waitForTimeout(5_000);
    await pressStop(page);
    const recording = (await readRecording(page))!;
    const heard = analyzePlaybackSync(recording, null).audio.onsets;
    const expected = fixture.expected.slice(startIndex, startIndex + heard);
    const report = analyzePlaybackSync(recording, expected);
    const payload = { fixture: fixture.name, scenario: 'from-selection', cold: cold.start, ...summarize(report), perOnset: report.perOnset };
    writeReport('from-selection', payload);
    console.log(`[sync-probe] ${LABEL} from-selection: ${JSON.stringify({ cold: cold.start, ...summarize(report) })}`);
    if (!REPORT_ONLY) expect(report.start?.pressToFirstSoundMs ?? Infinity).toBeLessThanOrEqual(BUDGET.pressToFirstSoundMs);
    expectWithinBudget(report, expected);
  });

  test('the first Play of an opened, idle score starts promptly', async ({ page }) => {
    // A user opens a score and presses Play a few seconds later: MIDI and instruments should be
    // ready by then (background preload of the MIDI rendering and the local soundfonts).
    const fixture = longMultiPartFixture(8);
    await bootWithScore(page, fixture);
    await page.waitForTimeout(8_000);
    await resetProbe(page);
    await pressPlay(page);
    await expect.poll(() => readPlaybackState(page), { timeout: 20_000 }).toBe('playing');
    await page.waitForTimeout(1_500);
    await pressStop(page);
    const report = analyzePlaybackSync((await readRecording(page))!, null);
    writeReport('first-play', { fixture: fixture.name, scenario: 'first-play', start: report.start });
    console.log(`[sync-probe] ${LABEL} first-play: ${JSON.stringify(report.start)}`);
    if (!REPORT_ONLY) expect(report.start?.pressToFirstSoundMs ?? Infinity).toBeLessThanOrEqual(BUDGET.pressToFirstSoundMs);
  });

  test('dense score stays in sync while the main thread is busy', async ({ page }) => {
    const fixture = denseFixture();
    const report = await measureFullPlay(page, fixture, 'dense-busy', {
      during: async (busyPage) => {
        // 45 ms long tasks every 120 ms: a main thread that is busy more than a third of the time.
        await busyPage.evaluate(() => {
          window.setInterval(() => {
            const until = performance.now() + 45;
            while (performance.now() < until) { /* busy */ }
          }, 120);
        });
      },
    });
    expectWithinBudget(report, fixture.expected);
  });
});

test.describe('playback sync probe in Electron', () => {
  test.skip(!RUN_ELECTRON, 'set NEX_SYNC_PROBE_ELECTRON=1');
  test.describe.configure({ timeout: 300_000 });

  async function launchElectron(baseURL: string) {
    const userDataDir = fs.mkdtempSync(path.join(process.cwd(), 'test-results', 'electron-sync-profile-'));
    const app = await electron.launch({
      args: ['.', `--user-data-dir=${userDataDir}`],
      env: { ...process.env, NEX_NOTE_ELECTRON_DEV: '1', NEX_NOTE_ELECTRON_DEV_URL: baseURL },
    });
    const page = await app.firstWindow();
    return { app, page, userDataDir };
  }

  async function closeElectron(app: ElectronApplication, userDataDir: string) {
    await app.close().catch(() => undefined);
    fs.rmSync(userDataDir, { recursive: true, force: true });
  }

  for (const [name, build] of [['small', smallFixture], ['long', () => longMultiPartFixture()]] as const) {
    test(`electron: ${name} score stays in sync`, async ({ baseURL }) => {
      const fixture = build();
      const { app, page, userDataDir } = await launchElectron(baseURL!);
      try {
        const report = await measureFullPlay(page, fixture, `electron-${name}`, { url: baseURL! });
        expectWithinBudget(report, fixture.expected);
      } finally {
        await closeElectron(app, userDataDir);
      }
    });
  }
});
