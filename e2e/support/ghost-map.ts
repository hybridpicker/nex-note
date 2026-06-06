import { expect } from '@playwright/test';
import type { Page } from '@playwright/test';

type Rect = {
  x: number;
  y: number;
  width: number;
  height: number;
};

export type GhostMapEntry = {
  timestamp: string;
  ratio: number;
  x: number;
  y: number;
  samples: number;
};

function parseTimestampRatio(value: string | null) {
  if (!value) return null;
  const [numText, denText] = value.split('/');
  const num = Number.parseInt(numText ?? '', 10);
  const den = Number.parseInt(denText ?? '', 10);
  if (!Number.isFinite(num) || !Number.isFinite(den) || den <= 0) return null;
  return num / den;
}

async function measureOverlayBoxes(page: Page, measureNumber: number): Promise<Rect[]> {
  await page.locator(`[data-measure-number="${measureNumber}"]`).first().scrollIntoViewIfNeeded();
  const boxes = await page.locator(`[data-measure-number="${measureNumber}"]`).evaluateAll((elements) => (
    elements.map((element) => {
      const rect = element.getBoundingClientRect();
      return {
        x: rect.x,
        y: rect.y,
        width: rect.width,
        height: rect.height,
      };
    })
  ));
  if (boxes.length === 0) throw new Error(`Missing measure overlay for measure ${measureNumber}`);
  return boxes.sort((left, right) => left.y - right.y || right.height - left.height || right.width - left.width);
}

export async function scanGhostMapForMeasure(
  page: Page,
  measureNumber: number,
  options?: {
    xSteps?: number;
    yRatios?: number[];
    xInsetRatio?: number;
    boxIndex?: number;
  },
): Promise<GhostMapEntry[]> {
  const boxes = await measureOverlayBoxes(page, measureNumber);
  const xSteps = options?.xSteps ?? 72;
  const yRatios = options?.yRatios ?? [0.18, 0.23, 0.28];
  const xInsetRatio = options?.xInsetRatio ?? 0.05;
  const grouped = new Map<string, Array<{ x: number; y: number; ratio: number }>>();
  const scanBoxes = options?.boxIndex == null
    ? boxes.slice(0, 1)
    : boxes[options.boxIndex]
      ? [boxes[options.boxIndex]]
      : [];

  for (const box of scanBoxes) {
    for (const yRatio of yRatios) {
      const y = box.y + (box.height * yRatio);
      for (let index = 0; index <= xSteps; index += 1) {
        const t = xInsetRatio + ((1 - (2 * xInsetRatio)) * (index / xSteps));
        const x = box.x + (box.width * t);
        await page.mouse.move(x, y);
        const preview = await page.evaluate(() => {
          const element = document.querySelector<HTMLElement>('[data-testid="ghost-note-preview"]');
          if (!element || element.offsetParent === null) return null;
          return {
            measure: element.dataset.ghostMeasure ?? null,
            timestamp: element.dataset.ghostTimestamp ?? null,
          };
        });
        if (!preview) continue;
        const ghostMeasure = preview.measure;
        if (ghostMeasure !== String(measureNumber)) continue;
        const timestamp = preview.timestamp;
        const ratio = parseTimestampRatio(timestamp);
        if (!timestamp || ratio == null) continue;
        const samples = grouped.get(timestamp) ?? [];
        samples.push({ x, y, ratio });
        grouped.set(timestamp, samples);
      }
    }
  }

  return [...grouped.entries()]
    .map(([timestamp, samples]) => {
      const sortedByX = [...samples].sort((left, right) => left.x - right.x);
      const median = sortedByX[Math.floor(sortedByX.length / 2)] ?? sortedByX[0]!;
      return {
        timestamp,
        ratio: median.ratio,
        x: median.x,
        y: median.y,
        samples: samples.length,
      };
    })
    .sort((left, right) => left.ratio - right.ratio || left.x - right.x);
}

export function expectGhostMapRatios(
  entries: GhostMapEntry[],
  expectedRatios: number[],
) {
  const seen = entries
    .reduce<GhostMapEntry[]>((unique, entry) => {
      if (unique.some((existing) => Math.abs(existing.ratio - entry.ratio) < 1e-6)) return unique;
      unique.push(entry);
      return unique;
    }, [])
    .map((entry) => entry.ratio);
  expect(seen).toEqual(expectedRatios);
  for (let index = 1; index < entries.length; index += 1) {
    expect(entries[index]!.x).toBeGreaterThan(entries[index - 1]!.x);
  }
}

export async function clickGhostMapEntry(page: Page, entry: GhostMapEntry) {
  await page.mouse.move(entry.x, entry.y);
  const ghost = page.getByTestId('ghost-note-preview');
  await expect(ghost).toBeVisible();
  const box = await ghost.boundingBox();
  if (!box) throw new Error(`Missing ghost box for timestamp ${entry.timestamp}`);
  const noteheadCenterX = Number.parseFloat((await ghost.getAttribute('data-ghost-notehead-center-x')) ?? '0');
  const noteheadCenterY = Number.parseFloat((await ghost.getAttribute('data-ghost-notehead-center-y')) ?? '28');
  const clickX = box.x + noteheadCenterX;
  const clickY = box.y + noteheadCenterY;
  await page.mouse.click(clickX, clickY);
  return { x: clickX, y: clickY };
}
