import { expect, test } from '@playwright/test';
import type { Page } from '@playwright/test';

import { syntheticScore } from '../scripts/benchmark-note-entry';
import { scoreXml, TREBLE } from '../test/support/entry-fixtures';
import { EntrySession } from './support/entry-session';

/*
 * Gate 3, step 1 of docs/note-entry-mastery-ledger.md: an entered note is on screen at once, as a
 * pending note at the place the caret stood on, and the drawing of the score takes its place without a
 * frame that shows the note twice or not at all.
 */

interface Frame {
  t: number;
  doc: number;
  drawn: number;
  heads: number;
  caret: boolean;
  pending: Array<{ pitch: string; revision: number; x: number; y: number; ink: number }>;
}

async function recordFrames(page: Page) {
  await page.evaluate(() => {
    const target = window as typeof window & { __PENDING_FRAMES__?: unknown[] };
    target.__PENDING_FRAMES__ = [];
    const tick = () => {
      const canvas = document.querySelector<HTMLElement>('[data-testid="score-canvas"]');
      const pending = Array.from(document.querySelectorAll<HTMLElement>('[data-testid="pending-note"]')).map((element) => {
        const head = element.querySelector('[data-pending-part="notehead"]')?.getBoundingClientRect();
        return {
          pitch: element.dataset.pendingPitch ?? '',
          revision: Number(element.dataset.pendingRevision),
          x: head ? head.left + head.width / 2 : Number.NaN,
          y: head ? head.top + head.height / 2 : Number.NaN,
          ink: element.querySelectorAll('[data-pending-part]').length,
        };
      });
      target.__PENDING_FRAMES__!.push({
        t: performance.now(),
        doc: Number(canvas?.dataset.documentRevision ?? -1),
        drawn: Number(canvas?.dataset.renderedRevision ?? -1),
        heads: canvas?.querySelectorAll('.vf-notehead').length ?? 0,
        caret: Boolean(document.querySelector('[data-testid="note-input-caret"]')),
        pending,
      });
      requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  });
}

const frames = (page: Page) => page.evaluate(() => (
  (window as typeof window & { __PENDING_FRAMES__?: unknown[] }).__PENDING_FRAMES__ ?? []
)) as Promise<Frame[]>;

async function waitDrawn(page: Page) {
  await expect.poll(() => page.getByTestId('score-canvas').evaluate((element) => (
    (element as HTMLElement).dataset.documentRevision === (element as HTMLElement).dataset.renderedRevision
  )), { timeout: 20_000 }).toBe(true);
}

test('pending note: a typed note is shown before the score is drawn again, and the drawing replaces it in one frame', async ({ page }, testInfo) => {
  // 512 notes: drawing the score takes long enough to see the frames in between.
  const session = await EntrySession.boot(page, testInfo, { xml: syntheticScore(32, 2), screenshots: false });
  await session.clickNotehead(0);
  await session.keys('N 4');
  const caretBefore = (await session.caret())!;
  expect(caretBefore).not.toBeNull();
  const headsBefore = await page.locator('[data-testid="score-canvas"] .vf-notehead').count();
  const neighbourBefore = await session.noteheadCenter(1);

  await recordFrames(page);
  const revisionBefore = Number(await page.getByTestId('score-canvas').getAttribute('data-document-revision'));
  await page.keyboard.press('a');
  await expect.poll(async () => Number(await page.getByTestId('score-canvas').getAttribute('data-document-revision'))).toBeGreaterThan(revisionBefore);
  await waitDrawn(page);
  await page.waitForTimeout(120);
  const seen = (await frames(page)).filter((frame) => frame.doc > revisionBefore);
  expect(seen.length, 'frames after the key').toBeGreaterThan(1);

  // While the drawing is behind the document, every frame shows the note as a pending note, with
  // its glyph, and the old score stays; once it has caught up, no frame shows a pending note.
  const waiting = seen.filter((frame) => frame.drawn < frame.doc);
  const landed = seen.filter((frame) => frame.drawn >= frame.doc);
  expect(waiting.length, 'at least one frame shows the note before the score is drawn again').toBeGreaterThan(0);
  for (const frame of waiting) {
    expect(frame.pending.map((entry) => entry.pitch), 'the entered note is pending').toEqual(['A3']);
    expect(frame.pending[0]!.ink, 'the pending note has its glyph').toBeGreaterThan(0);
    expect(frame.heads, 'the score that was there stays until the new one is drawn').toBe(headsBefore);
    expect(frame.caret, 'the caret stays during the redraw').toBe(true);
  }
  expect(landed.length).toBeGreaterThan(0);
  for (const frame of landed) expect(frame.pending, 'no pending note beside the drawn one').toEqual([]);

  // It stands where the caret stood, and where the score then draws the note: same rhythm, so the
  // same place, within a pixel or two.
  const pending = waiting[0]!.pending[0]!;
  expect(pending.x - caretBefore.x, 'right of the caret, by the caret\'s offset').toBeGreaterThan(2);
  expect(pending.x - caretBefore.x).toBeLessThan(24);
  const drawn = await session.noteheadCenter(0);
  // The new note has two ledger lines more than the one it replaces, and the engraver may move the
  // whole system for it: the note next to it tells by how much.
  const neighbourAfter = await session.noteheadCenter(1);
  const systemShift = { x: neighbourAfter.x - neighbourBefore.x, y: neighbourAfter.y - neighbourBefore.y };
  testInfo.annotations.push({ type: 'system-shift', description: `${systemShift.x.toFixed(1)}, ${systemShift.y.toFixed(1)}` });
  expect(Math.abs(drawn.x - systemShift.x - pending.x), `horizontal step from pending (${pending.x}) to drawn (${drawn.x})`).toBeLessThan(3);
  expect(Math.abs(drawn.y - systemShift.y - pending.y), `vertical step from pending (${pending.y}) to drawn (${drawn.y}), system moved ${systemShift.y}`).toBeLessThan(1.5);
  expect((await session.voice())[0]).toBe('m1@0 A3 eighth');
});

test('pending note: three notes typed faster than the score is drawn all stay on screen, and the document has them in order', async ({ page }, testInfo) => {
  const session = await EntrySession.boot(page, testInfo, { xml: syntheticScore(32, 2), screenshots: false });
  await session.clickNotehead(0);
  await session.keys('N 4');
  await recordFrames(page);
  const revisionBefore = Number(await page.getByTestId('score-canvas').getAttribute('data-document-revision'));
  for (const key of ['a', 'b', 'g']) await page.keyboard.press(key);
  await expect.poll(async () => Number(await page.getByTestId('score-canvas').getAttribute('data-document-revision'))).toBeGreaterThanOrEqual(revisionBefore + 3);
  await waitDrawn(page);
  await page.waitForTimeout(120);
  const seen = (await frames(page)).filter((frame) => frame.doc > revisionBefore);
  // Every frame accounts for every entered note: pending, or drawn by a revision that has it.
  for (const frame of seen) {
    const expected = frame.doc - Math.max(frame.drawn, revisionBefore);
    expect(frame.pending.length, `frame at revision ${frame.doc}, drawn ${frame.drawn}`).toBe(Math.max(0, expected));
  }
  expect(seen.at(-1)!.pending).toEqual([]);
  expect((await session.voice()).slice(0, 3)).toEqual(['m1@0 A3 eighth', 'm1@0.5 B3 eighth', 'm1@1 G3 eighth']);
});

test('pending note: in an empty bar it stands on the line of its pitch, and Undo takes it away with the note', async ({ page }, testInfo) => {
  const session = await EntrySession.boot(page, testInfo, {
    xml: scoreXml({ beats: 4, beatType: 4, measures: 8, parts: [{ ...TREBLE }] }), screenshots: false,
  });
  await session.keys('N 5');
  await recordFrames(page);
  const revisionBefore = Number(await page.getByTestId('score-canvas').getAttribute('data-document-revision'));
  await page.keyboard.press('e');
  await waitDrawn(page);
  await page.waitForTimeout(120);
  const waiting = (await frames(page)).filter((frame) => frame.doc > revisionBefore && frame.drawn < frame.doc);
  expect(waiting.length).toBeGreaterThan(0);
  const pending = waiting[0]!.pending[0]!;
  expect(pending.pitch).toBe('E5');
  const drawn = await session.noteheadCenter(0);
  expect(Math.abs(drawn.y - pending.y), 'the pending note is on the line of its pitch').toBeLessThan(2);
  testInfo.annotations.push({ type: 'pending-to-drawn-x', description: String(Math.round((drawn.x - pending.x) * 10) / 10) });

  await session.keys('Cmd+z');
  expect(await page.getByTestId('pending-note').count(), 'no pending note after Undo').toBe(0);
  expect((await session.voice()).filter((line) => !/ r /.test(line))).toEqual([]);
});

test('burst: ten keys a second for five seconds in a 512-note score give exactly the typed notes, in order', async ({ page }, testInfo) => {
  test.setTimeout(120_000);
  const session = await EntrySession.boot(page, testInfo, { xml: syntheticScore(32, 2), screenshots: false, settleTimeout: 20_000 });
  await session.clickNotehead(0);
  await session.keys('N 4');
  const letters = Array.from({ length: 50 }, (_, index) => 'cdefgab'[(index * 3) % 7]!);
  await session.burst(letters.join(' '), 10);
  await waitDrawn(page);
  const entered = (await session.voice()).slice(0, 50);
  expect(entered.map((line) => line.replace(/^m\d+@[\d.]+ ([A-G])[#b]?\d .*$/, '$1').toLowerCase()), 'no key dropped or out of order').toEqual(letters);
  // Fifty eighths from bar 1 on: one every half beat, none skipped.
  expect(entered.map((line) => line.split(' ')[0])).toEqual(Array.from({ length: 50 }, (_, index) => `m${Math.floor(index / 8) + 1}@${(index % 8) / 2}`));
  expect(entered.every((line) => / eighth$/.test(line))).toBe(true);
  expect(await page.getByTestId('pending-note').count(), 'nothing pending once the score is drawn').toBe(0);
});
