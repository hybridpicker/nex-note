import { expect, test } from '@playwright/test';
import type { Page } from '@playwright/test';

import { createNewScoreXml } from '../lib/new-score.ts';
import { importMusicXmlToCore } from '../src/musicxml-adapter/import/import-musicxml.ts';

function buildBlankGridXml() {
  return createNewScoreXml({
    instrumentIds: ['piano'],
    title: 'Exhaustive Mouse Grid',
    subtitle: '4/4 piano grid sweep',
    composer: '',
    lyricist: '',
    copyright: '',
    keySignatureId: 'c-major',
    timeBeats: 4,
    timeBeatType: 4,
    tempo: { bpm: 120, beatUnit: 'quarter', showMarking: true },
    measureCount: 4,
    pickup: { enabled: false, beats: 1, beatType: 4 },
  });
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

async function bootWithScore(page: Page, xml: string) {
  await page.addInitScript(({ xml: bootXml }: { xml: string }) => {
    localStorage.setItem('nex-note:e2e-boot', JSON.stringify({
      xml: bootXml,
      filename: 'exhaustive-mouse-grid.musicxml',
    }));
  }, { xml });
  await page.goto('/');
  await expect(page.locator('[data-measure-number]').first()).toBeVisible({ timeout: 15_000 });
  await page.getByTestId('score-viewport').focus();
}

async function readCurrentCore(page: Page) {
  const xml = await page.evaluate(() => (
    (window as typeof window & {
      __NEX_NOTE_E2E_STATE__?: { xml: string };
    }).__NEX_NOTE_E2E_STATE__?.xml ?? ''
  ));
  return importMusicXmlToCore(xml);
}

async function readGhost(page: Page) {
  return page.evaluate(() => {
    const element = document.querySelector<HTMLElement>('[data-testid="ghost-note-preview"]');
    if (!element || element.offsetParent === null) return null;
    const box = element.getBoundingClientRect();
    const diagnostics = (element.dataset.ghostDiagnostics ?? '').split('|').filter(Boolean);
    const timestamp = element.dataset.ghostTimestamp ?? null;
    const commitTimestamp = element.dataset.ghostCommitTimestamp ?? null;
    const effectiveTimestamp = diagnostics.includes('rest-only-quantized-internal-slot') && commitTimestamp
      ? commitTimestamp
      : timestamp;
    const commitX = Number.parseFloat(element.dataset.ghostCommitX ?? '');
    const offsetParentBox = element.offsetParent instanceof HTMLElement
      ? element.offsetParent.getBoundingClientRect()
      : null;
    return {
      measure: element.dataset.ghostMeasure ?? null,
      timestamp,
      commitTimestamp,
      effectiveTimestamp,
      pitch: element.dataset.ghostPitch ?? null,
      staff: element.dataset.ghostStaff ?? null,
      diagnostics,
      commitClientX: Number.isFinite(commitX) && offsetParentBox
        ? offsetParentBox.left + commitX
        : null,
      noteheadX: Number.parseFloat(element.dataset.ghostNoteheadCenterX ?? '0'),
      noteheadY: Number.parseFloat(element.dataset.ghostNoteheadCenterY ?? '28'),
      box: { x: box.x, y: box.y, width: box.width, height: box.height },
    };
  });
}

async function measureBoxes(page: Page, measureNumber: number) {
  const deadline = Date.now() + 5_000;
  let boxes: Array<{ x: number; y: number; width: number; height: number }> = [];
  while (Date.now() < deadline) {
    boxes = await page.locator(`[data-measure-number="${measureNumber}"]`).evaluateAll((elements) => (
      elements.map((element) => {
        const rect = element.getBoundingClientRect();
        return { x: rect.x, y: rect.y, width: rect.width, height: rect.height };
      })
    ));
    if (boxes.length >= 2) return boxes.sort((a, b) => a.y - b.y || b.height - a.height || b.width - a.width);
    await page.waitForTimeout(100);
  }
  throw new Error(`Expected two staff overlays for measure ${measureNumber}`);
}

function timestampRatio(value: string | null) {
  if (!value) return null;
  const [numText, denText] = value.split('/');
  const num = Number.parseInt(numText ?? '', 10);
  const den = Number.parseInt(denText ?? '', 10);
  if (!Number.isFinite(num) || !Number.isFinite(den) || den <= 0) return null;
  return num / den;
}

function xRatiosNearTimestamp(ratio: number) {
  if (ratio === 0) return [0.06, 0.10, 0.14, 0.18, 0.22, 0.28, 0.34];
  if (ratio === 0.25) return [0.34, 0.38, 0.42, 0.46, 0.50, 0.54, 0.58];
  if (ratio === 0.5) return [0.56, 0.60, 0.64, 0.68, 0.72];
  if (ratio === 0.75) return [0.74, 0.78, 0.82, 0.86, 0.90, 0.94];
  return [0.10, 0.22, 0.34, 0.46, 0.58, 0.70, 0.82, 0.94];
}

function yRatiosNearPitch(pitch: string) {
  const bass: Record<string, number[]> = {
    D2: [0.78, 0.82, 0.86, 0.90, 0.94, 1.00],
    D1: [1.28, 1.32, 1.36, 1.40, 1.44, 1.48, 1.52],
  };
  return bass[pitch] ?? [0.20, 0.35, 0.50, 0.65, 0.80, 0.95, 1.10, 1.25, 1.40];
}

async function findGhostPoint(page: Page, input: {
  measure: number;
  staffIndex: 1 | 2;
  timestampRatio: number;
  pitch: string;
  measureBox?: { x: number; y: number; width: number; height: number };
}) {
  const boxes = input.measureBox ? null : await measureBoxes(page, input.measure);
  const box = input.measureBox ?? (input.staffIndex === 1 ? boxes![0]! : boxes![1]!);

  const tryPoint = async (xRatio: number, yRatio: number) => {
    const x = box.x + (box.width * xRatio);
    const y = box.y + (box.height * yRatio);
    await page.mouse.move(x, y);
    const ghost = await readGhost(page);
    if (
      ghost?.measure === String(input.measure)
      && ghost.staff === String(input.staffIndex)
      && Math.abs((timestampRatio(ghost.effectiveTimestamp) ?? -1) - input.timestampRatio) < 1e-6
      && ghost.pitch === input.pitch
    ) {
      return {
        hover: { x, y },
        click: {
          x: ghost.commitClientX ?? ghost.box.x + ghost.noteheadX,
          y: ghost.box.y + ghost.noteheadY,
        },
        ghost,
      };
    }
    return null;
  };

  for (const yRatio of yRatiosNearPitch(input.pitch)) {
    for (const xRatio of xRatiosNearTimestamp(input.timestampRatio)) {
      const match = await tryPoint(xRatio, yRatio);
      if (match) return match;
    }
  }

  for (let yRatio = -0.20; yRatio <= 2.60; yRatio += 0.05) {
    for (let xRatio = 0.00; xRatio <= 1.00; xRatio += 0.05) {
      const x = box.x + (box.width * xRatio);
      const y = box.y + (box.height * yRatio);
      await page.mouse.move(x, y);
      const ghost = await readGhost(page);
      if (
        ghost?.measure === String(input.measure)
        && ghost.staff === String(input.staffIndex)
        && Math.abs((timestampRatio(ghost.effectiveTimestamp) ?? -1) - input.timestampRatio) < 1e-6
        && ghost.pitch === input.pitch
      ) {
        return {
          hover: { x, y },
          click: {
            x: ghost.commitClientX ?? ghost.box.x + ghost.noteheadX,
            y: ghost.box.y + ghost.noteheadY,
          },
          ghost,
        };
      }
    }
  }
  throw new Error(`No ghost for m${input.measure} staff ${input.staffIndex} ratio ${input.timestampRatio} ${input.pitch}`);
}

test.beforeEach(async ({ page }) => {
  await installPlaybackStubs(page);
});

test('measure 1 bass rest anchor sweeps monotonically and commits an exact low pitch', async ({ page }) => {
  test.setTimeout(120_000);
  await bootWithScore(page, buildBlankGridXml());
  await page.keyboard.press('Escape');
  await page.keyboard.press('N');
  await page.keyboard.press('5');

  const boxes = await measureBoxes(page, 1);
  const bassBox = boxes[1]!;
  const y = bassBox.y + (bassBox.height * 0.82);
  const sweep = [];

  for (let percent = 0; percent <= 100; percent += 5) {
    const x = bassBox.x + (bassBox.width * (percent / 100));
    await page.mouse.move(x, y);
    const ghost = await readGhost(page);
    sweep.push({
      percent,
      measure: ghost?.measure ?? null,
      timestamp: ghost?.effectiveTimestamp ?? null,
      ratio: timestampRatio(ghost?.effectiveTimestamp ?? null),
      pitch: ghost?.pitch ?? null,
      staff: ghost?.staff ?? null,
    });
  }

  const measureOne = sweep.filter((entry) => entry.measure === '1' && entry.staff === '2' && entry.ratio != null);
  expect(measureOne.length, JSON.stringify(sweep, null, 2)).toBeGreaterThanOrEqual(8);
  expect(measureOne.every((entry) => entry.measure === '1')).toBe(true);

  for (let index = 1; index < measureOne.length; index += 1) {
    expect(
      measureOne[index]!.ratio!,
      `ghost timestamps must be monotonic:\n${JSON.stringify(sweep, null, 2)}`,
    ).toBeGreaterThanOrEqual(measureOne[index - 1]!.ratio!);
  }

  const seenQuarterRatios = Array.from(new Set(measureOne.map((entry) => entry.ratio))).sort((a, b) => a! - b!);
  expect(seenQuarterRatios).toEqual([0, 0.25, 0.5, 0.75]);

  const d2BeatOne = await findGhostPoint(page, {
    measure: 1,
    staffIndex: 2,
    timestampRatio: 0,
    pitch: 'D2',
    measureBox: bassBox,
  });
  await page.mouse.click(d2BeatOne.click.x, d2BeatOne.click.y);

  await expect.poll(async () => {
    const core = await readCurrentCore(page);
    return core.score.parts[0].staves[1].measures.flatMap((measure) => (
      measure.voices.flatMap((voice) => voice.events.map((event) => ({
        measure: measure.measureNumber,
        offset: `${event.timestampNum}/${event.timestampDen}`,
        pitch: event.kind === 'note' ? `${event.pitch.step}${event.pitch.octave}` : 'rest',
      })))
    )).filter((event) => event.pitch === 'D2');
  }).toEqual([{ measure: 1, offset: '0/32', pitch: 'D2' }]);

});
