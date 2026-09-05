import fs from 'node:fs';
import path from 'node:path';

import { expect, test, type Page } from '@playwright/test';

const fixtureXml = fs.readFileSync(
  path.join(process.cwd(), 'e2e', 'fixtures', 'simple.musicxml'),
  'utf8',
);

async function boot(page: Page) {
  await page.addInitScript(({ xml }) => {
    localStorage.setItem('nex-note:e2e-boot', JSON.stringify({
      xml,
      filename: 'tablet-entry.musicxml',
    }));
  }, { xml: fixtureXml });
  await page.goto('/nex-note-app/');
  await expect(page.getByTitle('Save as')).toBeVisible({ timeout: 20_000 });
  await expect(page.locator('[data-testid="score-canvas"] .vf-notehead').first()).toBeVisible({ timeout: 20_000 });
  await expect(page.getByTestId('score-canvas')).toHaveAttribute('data-edit-map-measure-count', /^[1-9]\d*$/);
  await page.getByTestId('score-viewport').focus();
  await page.keyboard.press('Escape');
  await page.keyboard.press('N');
  await page.keyboard.press('5');
}

async function installPointerCaptureProbe(page: Page) {
  await page.addInitScript(() => {
    const captures = new WeakMap<Element, Set<number>>();
    Object.defineProperties(Element.prototype, {
      setPointerCapture: {
        configurable: true,
        value(pointerId: number) {
          const active = captures.get(this) ?? new Set<number>();
          active.add(pointerId);
          captures.set(this, active);
        },
      },
      hasPointerCapture: {
        configurable: true,
        value(pointerId: number) {
          return captures.get(this)?.has(pointerId) ?? false;
        },
      },
      releasePointerCapture: {
        configurable: true,
        value(pointerId: number) {
          captures.get(this)?.delete(pointerId);
        },
      },
    });
  });
}

async function currentXml(page: Page) {
  return page.evaluate(() => (
    (window as typeof window & {
      __NEX_NOTE_E2E_STATE__?: { xml?: string };
    }).__NEX_NOTE_E2E_STATE__?.xml ?? ''
  ));
}

async function noteCount(page: Page) {
  return page.evaluate(() => {
    const xml = (
      window as typeof window & {
        __NEX_NOTE_E2E_STATE__?: { xml?: string };
      }
    ).__NEX_NOTE_E2E_STATE__?.xml ?? '';
    const documentXml = new DOMParser().parseFromString(xml, 'application/xml');
    return Array.from(documentXml.querySelectorAll('note')).filter((note) => note.querySelector('pitch')).length;
  });
}

async function dispatchPointer(
  page: Page,
  type: 'pointermove' | 'pointerdown' | 'pointerup' | 'pointercancel',
  input: {
    pointerId: number;
    pointerType: 'touch' | 'pen' | 'mouse';
    x: number;
    y: number;
    buttons?: number;
    button?: number;
  },
) {
  await page.getByTestId('score-viewport').dispatchEvent(type, {
    bubbles: true,
    composed: true,
    cancelable: true,
    pointerId: input.pointerId,
    pointerType: input.pointerType,
    clientX: input.x,
    clientY: input.y,
    buttons: input.buttons ?? (type === 'pointerup' || type === 'pointercancel' ? 0 : 1),
    button: input.button ?? 0,
    isPrimary: true,
  });
}

async function blankStaffPoint(page: Page) {
  const noteheads = page.locator('[data-testid="score-canvas"] .vf-notehead');
  const first = await noteheads.nth(0).boundingBox();
  const second = await noteheads.nth(1).boundingBox();
  const third = await noteheads.nth(2).boundingBox();
  if (!first || !second || !third) throw new Error('Missing rendered noteheads');
  return {
    x: (first.x + first.width / 2 + second.x + second.width / 2) / 2,
    // Keep outside the coarse-pointer 32px existing-note hit target while
    // remaining inside the staff's supported ledger-line capture range.
    y: first.y + first.height / 2 - 28,
    intentionalX: third.x + third.width / 2,
  };
}

test('tablet refinement publishes the latest sample once per frame without semantic regeneration', async ({ page }) => {
  await boot(page);
  const point = await blankStaffPoint(page);
  const beforeXml = await currentXml(page);

  await dispatchPointer(page, 'pointerdown', {
    pointerId: 37,
    pointerType: 'touch',
    x: point.x,
    y: point.y,
  });

  await page.getByTestId('score-viewport').evaluate((element, origin) => {
    for (let index = 0; index < 20; index += 1) {
      element.dispatchEvent(new PointerEvent('pointermove', {
        bubbles: true,
        composed: true,
        cancelable: true,
        pointerId: 37,
        pointerType: 'touch',
        clientX: origin.x + (index * 0.2),
        clientY: origin.y - 10 - (index * 0.2),
        buttons: 1,
        button: 0,
        isPrimary: true,
      }));
    }
  }, point);

  await page.evaluate(() => new Promise<void>((resolve) => {
    requestAnimationFrame(() => requestAnimationFrame(() => resolve()));
  }));

  const metrics = await page.evaluate(() => (
    window as typeof window & {
      __NEX_NOTE_POINTER_METRICS__?: () => {
        rawTabletPointerEvents: number;
        scheduledAnimationFrames: number;
        processedLatestSamples: number;
        stableVisualPublications: number;
        semanticDocumentRegenerations: number;
        lastSampleLatencyMs: number;
        maxSampleLatencyMs: number;
      };
    }
  ).__NEX_NOTE_POINTER_METRICS__?.() ?? null);

  expect(metrics).toBeTruthy();
  expect(metrics?.rawTabletPointerEvents).toBe(20);
  expect(metrics?.scheduledAnimationFrames).toBe(1);
  expect(metrics?.processedLatestSamples).toBe(1);
  expect(metrics?.stableVisualPublications).toBeLessThanOrEqual(1);
  expect(metrics?.semanticDocumentRegenerations).toBe(0);
  expect(metrics?.lastSampleLatencyMs).toBeGreaterThanOrEqual(0);
  expect(metrics?.maxSampleLatencyMs).toBeGreaterThanOrEqual(metrics?.lastSampleLatencyMs ?? 0);
  expect(await currentXml(page)).toBe(beforeXml);

  await dispatchPointer(page, 'pointercancel', {
    pointerId: 37,
    pointerType: 'touch',
    x: point.x,
    y: point.y,
    buttons: 0,
  });
});

test('touch uses preview-refine-takeoff and commits the last stable semantic target', async ({ page }) => {
  await boot(page);
  const point = await blankStaffPoint(page);
  const beforeXml = await currentXml(page);
  const beforeCount = await noteCount(page);

  await dispatchPointer(page, 'pointerdown', {
    pointerId: 41,
    pointerType: 'touch',
    x: point.x,
    y: point.y,
  });

  const preview = page.getByTestId('ghost-note-preview');
  await expect(preview).toBeVisible();
  await expect(preview).toHaveAttribute('data-tablet-entry-phase', 'contact-preview');
  await expect(preview).toHaveAttribute('data-preview-pointer-type', 'touch');
  await expect(page.getByTestId('pitch-chip')).toBeVisible();
  await expect(page.getByTestId('pitch-loupe')).toBeVisible();
  expect(await currentXml(page)).toBe(beforeXml);
  expect(await noteCount(page)).toBe(beforeCount);

  const initialPitch = await preview.getAttribute('data-ghost-pitch');
  const initialTimestamp = await preview.getAttribute('data-ghost-timestamp');
  await dispatchPointer(page, 'pointermove', {
    pointerId: 41,
    pointerType: 'touch',
    x: point.x + 7,
    y: point.y - 14,
  });
  await expect(preview).toHaveAttribute('data-tablet-entry-phase', 'refining');
  await expect.poll(() => preview.getAttribute('data-ghost-pitch')).not.toBe(initialPitch);
  await expect(preview).toHaveAttribute('data-ghost-timestamp', initialTimestamp ?? '');

  await dispatchPointer(page, 'pointermove', {
    pointerId: 41,
    pointerType: 'touch',
    x: point.intentionalX,
    y: point.y - 14,
  });
  await expect.poll(() => preview.getAttribute('data-ghost-timestamp')).not.toBe(initialTimestamp);
  const committedPitch = await preview.getAttribute('data-ghost-pitch');
  const committedTimestamp = await preview.getAttribute('data-ghost-timestamp');
  const committedVoice = await preview.getAttribute('data-ghost-voice');
  const committedMode = await preview.getAttribute('data-ghost-mode');

  // Deliberate release jitter: pointer-up coordinates are outside the score.
  await dispatchPointer(page, 'pointerup', {
    pointerId: 41,
    pointerType: 'touch',
    x: 2,
    y: 2,
    buttons: 0,
  });

  await expect.poll(() => noteCount(page)).toBe(beforeCount + 1);
  const selected = await page.evaluate(() => (
    window as typeof window & {
      __NEX_NOTE_E2E_STATE__?: {
        selectedNote?: {
          step?: string;
          octave?: number;
          alter?: number;
          voiceId?: number;
          timestampNum?: number;
          timestampDen?: number;
        } | null;
      };
    }
  ).__NEX_NOTE_E2E_STATE__?.selectedNote ?? null);
  expect(selected).toBeTruthy();
  expect(committedPitch).toBeTruthy();
  const selectedAccidental = selected?.alter === 2 ? '𝄪'
    : selected?.alter === 1 ? '♯'
      : selected?.alter === -1 ? '♭'
        : selected?.alter === -2 ? '𝄫'
          : '';
  expect(`${selected?.step}${selectedAccidental}${selected?.octave}`).toBe(committedPitch);
  expect(`${selected?.timestampNum}/${selected?.timestampDen}`).toBe(committedTimestamp);
  expect(String(selected?.voiceId)).toBe(committedVoice);
  expect(['insert', 'replace', 'chord']).toContain(committedMode);
});

test('pointercancel ends touch preview without score mutation', async ({ page }) => {
  await boot(page);
  const point = await blankStaffPoint(page);
  const before = await currentXml(page);
  await dispatchPointer(page, 'pointerdown', {
    pointerId: 52,
    pointerType: 'touch',
    x: point.x,
    y: point.y,
  });
  await expect(page.getByTestId('pitch-loupe')).toBeVisible();
  await dispatchPointer(page, 'pointercancel', {
    pointerId: 52,
    pointerType: 'touch',
    x: point.x,
    y: point.y,
    buttons: 0,
  });
  await expect(page.getByTestId('pitch-loupe')).toHaveCount(0);
  expect(await currentXml(page)).toBe(before);
  await expect(page.getByTestId('score-viewport')).toHaveAttribute('data-tablet-entry-phase', 'cancelled');
});

test('toolbar mode exit cancels tablet preview and releases pointer capture', async ({ page }) => {
  await installPointerCaptureProbe(page);
  await boot(page);
  const point = await blankStaffPoint(page);
  const before = await currentXml(page);

  await dispatchPointer(page, 'pointerdown', {
    pointerId: 57,
    pointerType: 'touch',
    x: point.x,
    y: point.y,
  });
  const viewport = page.getByTestId('score-viewport');
  await expect(viewport).toHaveAttribute('data-tablet-entry-phase', 'contact-preview');
  expect(await viewport.evaluate((element) => element.hasPointerCapture(57))).toBe(true);

  await page.getByTitle('Toggle note input (N)').click();
  await expect.poll(() => page.evaluate(() => (
    window as typeof window & {
      __NEX_NOTE_E2E_STATE__?: { noteInputMode?: boolean };
    }
  ).__NEX_NOTE_E2E_STATE__?.noteInputMode ?? true)).toBe(false);
  await expect(viewport).toHaveAttribute('data-tablet-entry-phase', 'cancelled');
  expect(await viewport.evaluate((element) => element.hasPointerCapture(57))).toBe(false);
  expect(await currentXml(page)).toBe(before);

  await dispatchPointer(page, 'pointerup', {
    pointerId: 57,
    pointerType: 'touch',
    x: point.x,
    y: point.y,
    buttons: 0,
  });
  expect(await currentXml(page)).toBe(before);
});

test('pen hover predicts without mutation and contact inherits the visible target', async ({ page }) => {
  await boot(page);
  const point = await blankStaffPoint(page);
  const before = await currentXml(page);
  await dispatchPointer(page, 'pointermove', {
    pointerId: 61,
    pointerType: 'pen',
    x: point.x,
    y: point.y,
    buttons: 0,
  });
  const preview = page.getByTestId('ghost-note-preview');
  await expect(preview).toBeVisible();
  await expect(preview).toHaveAttribute('data-tablet-entry-phase', 'hovering');
  await expect(page.getByTestId('pitch-loupe')).toHaveCount(0);
  const hoverPitch = await preview.getAttribute('data-ghost-pitch');
  const hoverTimestamp = await preview.getAttribute('data-ghost-timestamp');
  expect(await currentXml(page)).toBe(before);

  await dispatchPointer(page, 'pointerdown', {
    pointerId: 61,
    pointerType: 'pen',
    x: point.x,
    y: point.y,
  });
  await expect(preview).toHaveAttribute('data-tablet-entry-phase', 'contact-preview');
  await expect(preview).toHaveAttribute('data-ghost-pitch', hoverPitch ?? '');
  await expect(preview).toHaveAttribute('data-ghost-timestamp', hoverTimestamp ?? '');
  expect(await currentXml(page)).toBe(before);
  await dispatchPointer(page, 'pointercancel', {
    pointerId: 61,
    pointerType: 'pen',
    x: point.x,
    y: point.y,
    buttons: 0,
  });
});

test('mouse hover and click retain the existing immediate click contract', async ({ page }) => {
  await boot(page);
  const point = await blankStaffPoint(page);
  const before = await noteCount(page);
  await page.mouse.move(point.x, point.y);
  const preview = page.getByTestId('ghost-note-preview');
  await expect(preview).toBeVisible();
  await expect(page.getByTestId('pitch-chip')).toBeVisible();
  await expect(page.getByTestId('pitch-loupe')).toHaveCount(0);
  await page.mouse.click(point.x, point.y);
  await expect.poll(() => noteCount(page)).toBe(before + 1);
});

test('touching an existing note keeps selection/drag priority and inserts no duplicate', async ({ page }) => {
  await boot(page);
  const notehead = await page.locator('[data-testid="score-canvas"] .vf-notehead').first().boundingBox();
  if (!notehead) throw new Error('Missing first notehead');
  const before = await noteCount(page);
  const x = notehead.x + notehead.width / 2;
  const y = notehead.y + notehead.height / 2;
  await dispatchPointer(page, 'pointerdown', {
    pointerId: 71,
    pointerType: 'touch',
    x,
    y,
  });
  await expect(page.getByTestId('pitch-loupe')).toHaveCount(0);
  await dispatchPointer(page, 'pointerup', {
    pointerId: 71,
    pointerType: 'touch',
    x,
    y,
    buttons: 0,
  });
  await expect.poll(() => noteCount(page)).toBe(before);
  await expect.poll(() => page.evaluate(() => (
    window as typeof window & {
      __NEX_NOTE_E2E_STATE__?: { selectedNote?: unknown };
    }
  ).__NEX_NOTE_E2E_STATE__?.selectedNote ?? null)).not.toBeNull();
});


for (const pointerType of ['touch', 'pen', 'mouse'] as const) {
  test(`${pointerType} note drag cannot commit after losing pointer capture`, async ({ page }) => {
    await installPointerCaptureProbe(page);
    await boot(page);
    const notehead = await page.locator('[data-testid="score-canvas"] .vf-notehead').first().boundingBox();
    if (!notehead) throw new Error('Missing first notehead');
    const before = await currentXml(page);
    const viewport = page.getByTestId('score-viewport');
    const x = notehead.x + notehead.width / 2;
    const y = notehead.y + notehead.height / 2;
    await dispatchPointer(page, 'pointerdown', { pointerId: 81, pointerType, x, y });
    await dispatchPointer(page, 'pointermove', { pointerId: 81, pointerType, x, y: y - 24 });
    await expect(page.getByTestId('ghost-note-preview')).toBeVisible();
    expect(await currentXml(page)).toBe(before);
    await viewport.evaluate((element) => element.releasePointerCapture(81));
    await viewport.dispatchEvent('lostpointercapture', { pointerId: 81, pointerType, bubbles: true });
    await dispatchPointer(page, 'pointerup', { pointerId: 81, pointerType, x, y: y - 24, buttons: 0 });
    expect(await currentXml(page)).toBe(before);
    await expect(page.getByTestId('ghost-note-preview')).toHaveCount(0);
    // An unrelated pointer must not cancel the next valid drag.
    await dispatchPointer(page, 'pointerdown', { pointerId: 82, pointerType, x, y });
    await dispatchPointer(page, 'pointermove', { pointerId: 82, pointerType, x, y: y - 24 });
    await expect(page.getByTestId('ghost-note-preview')).toBeVisible();
    await viewport.dispatchEvent('lostpointercapture', { pointerId: 99, pointerType, bubbles: true });
    await dispatchPointer(page, 'pointerup', { pointerId: 82, pointerType, x, y: y - 24, buttons: 0 });
    await expect.poll(() => currentXml(page)).not.toBe(before);
    const changed = await currentXml(page);
    await page.keyboard.press('Control+z');
    await expect.poll(() => currentXml(page)).toBe(before);
    await page.keyboard.press('Control+Shift+z');
    await expect.poll(() => currentXml(page)).toBe(changed);
  });
}

for (const pointerType of ['pen', 'touch'] as const) {
  test(`${pointerType} entry auditions once across contact and takeoff`, async ({ page }) => {
    await page.addInitScript(() => {
      const probe = { starts: 0, loaded: false };
      (window as any).__tabletAudioProbe = probe;
      (window as any).__NEX_NOTE_E2E_INSTRUMENT_LOADER__ = async () => {
        probe.loaded = true;
        return { start() { probe.starts += 1; }, stop() {} };
      };
    });
    await boot(page);
    await expect.poll(() => page.evaluate(() => (window as any).__tabletAudioProbe.loaded)).toBe(true);
    const point = await blankStaffPoint(page);
    const before = await noteCount(page);
    await dispatchPointer(page, 'pointerdown', { pointerId: 81, pointerType, ...point });
    await expect.poll(() => page.evaluate(() => (window as any).__tabletAudioProbe.starts)).toBe(1);
    expect(await noteCount(page)).toBe(before);
    await dispatchPointer(page, 'pointerup', { pointerId: 81, pointerType, ...point });
    await expect.poll(() => noteCount(page)).toBe(before + 1);
    // Scheduling contract only; physical listening is a separate device check.
    await page.waitForTimeout(350);
    expect(await page.evaluate(() => (window as any).__tabletAudioProbe.starts)).toBe(1);
  });
}


test.describe('Pencil focus layout', () => {
  test.use({ hasTouch: true, viewport: { width: 1366, height: 1024 } });
  test('keeps panels closed, enlarges entry targets and reserves writing for Pencil', async ({ page }) => {
    await page.addInitScript(xml => {
      localStorage.setItem('nex-note:e2e-boot', JSON.stringify({ xml, filename: 'pencil-layout.musicxml' }));
      document.addEventListener('DOMContentLoaded', () => document.documentElement.classList.add('nex-note-native', 'nex-note-ios'));
    }, fixtureXml);
    await page.goto('/nex-note-app/');
    await expect(page.locator('[data-testid="score-canvas"] .vf-notehead').first()).toBeVisible();
    await expect(page.getByTestId('workspace-panel')).toHaveCount(0);
    await expect(page.getByTestId('left-notation-sidebar-collapsed-rail')).toBeVisible();
    await page.getByTestId('pencil-focus-toggle').click();
    await expect(page.getByTestId('pencil-tools')).toBeVisible();
    await expect(page.getByTestId('app-header')).toBeHidden();
    const quarter = page.getByTestId('pencil-tools').getByRole('button', { name: /^Quarter note/ });
    const box = await quarter.boundingBox();
    expect(box!.height).toBeGreaterThanOrEqual(52);
    expect(box!.width).toBeGreaterThanOrEqual(44);
    await quarter.click();
    const before = await currentXml(page);
    const point = await blankStaffPoint(page);
    await dispatchPointer(page, 'pointerdown', { pointerId: 91, pointerType: 'touch', ...point });
    await dispatchPointer(page, 'pointermove', { pointerId: 91, pointerType: 'touch', x: point.x, y: point.y + 80 });
    await dispatchPointer(page, 'pointerup', { pointerId: 91, pointerType: 'touch', ...point });
    expect(await currentXml(page)).toBe(before);
    await expect(page.getByTestId('ghost-note-preview')).toBeHidden();
    await dispatchPointer(page, 'pointerdown', { pointerId: 92, pointerType: 'pen', ...point });
    await dispatchPointer(page, 'pointerup', { pointerId: 92, pointerType: 'pen', ...point });
    await expect.poll(() => currentXml(page)).not.toBe(before);
    const after = await currentXml(page);
    await page.screenshot({ path: 'test-results/pencil-audition/landscape.png' });
    await page.setViewportSize({ width: 1024, height: 1366 });
    await expect(quarter).toBeVisible();
    expect(await currentXml(page)).toBe(after);
    await page.screenshot({ path: 'test-results/pencil-audition/portrait.png' });
    await page.getByTestId('finger-mode-toggle').click();
    await expect(page.getByTestId('pencil-tools')).toHaveCount(0);
    await expect(page.getByTestId('app-header')).toBeVisible();
    await expect(page.locator('#nex-left-notation-tools-panel')).toBeVisible();
    await expect(page.getByTestId('score-viewport')).toHaveAttribute('data-note-input-gesture-policy', 'navigation');
    await page.locator('[data-testid="score-canvas"] .vf-notehead').last().tap();
    expect(await currentXml(page)).toBe(after);
    await page.getByRole('button', { name: /^Measures barlines$/i }).tap();
    await page.getByRole('button', { name: 'Double barline', exact: true }).tap();
    await expect.poll(() => currentXml(page)).not.toBe(after);
    await page.getByRole('button', { name: 'Undo (Cmd/Ctrl+Z)', exact: true }).click();
    await expect.poll(() => currentXml(page)).toBe(after);
    await page.getByTestId('workspace-collapsed-rail').getByRole('button').click();
    await expect(page.getByTestId('workspace-panel')).toBeVisible();
    expect(await currentXml(page)).toBe(after);
  });
});
