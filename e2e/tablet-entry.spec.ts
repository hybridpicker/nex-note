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
    pointerType: 'touch' | 'pen';
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
