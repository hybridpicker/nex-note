import { expect, test } from '@playwright/test';
import type { Page } from '@playwright/test';

import { scoreXml, TREBLE } from '../test/support/entry-fixtures';
import { EntrySession } from './support/entry-session';

/*
 * Browser cases for the Trust rows of docs/note-entry-mastery-ledger.md that only a real page can
 * show: the score must not move under a resting pointer (F2), a click commits what the ghost showed
 * (F2, F7), one click is one note (F4), and entry never waits on audio (F3).
 */

const EMPTY_EIGHT_BARS = scoreXml({ beats: 4, beatType: 4, measures: 8, parts: [{ ...TREBLE }] });

/** Ghost pitch `C5` or `F#4` as the voice lines spell it. */
function ghostPitchLabel(pitch: string | null) {
  return (pitch ?? '').replace('♯', '#').replace('♭', 'b');
}

async function notes(session: EntrySession) {
  return (await session.voice()).filter((line) => !/ r /.test(line));
}

/** A point inside a bar of the first staff: `ratioX` across the bar, `offsetY` pixels from its middle. */
async function pointInBar(session: EntrySession, measureNumber: number, ratioX: number, offsetY: number) {
  const box = await session.measureBox(measureNumber);
  return { x: box.x + box.width * ratioX, y: box.y + box.height / 2 + offsetY };
}

async function setZoom(page: Page, percent: number) {
  const field = page.getByRole('spinbutton').first();
  await field.fill(String(percent));
  await field.press('Enter');
  await expect(page.getByTestId('score-canvas')).toHaveAttribute('data-edit-map-measure-count', /^[1-9]\d*$/);
  await page.getByTestId('score-viewport').focus();
}

test('F2: the score canvas keeps its place when a note is selected, entered or deselected', async ({ page }, testInfo) => {
  const session = await EntrySession.boot(page, testInfo, { xml: EMPTY_EIGHT_BARS });
  const idle = await session.canvasBox();

  await session.keys('N');
  expect((await session.canvasBox()).y, 'after N').toBe(idle.y);

  await session.keys('5 c');
  expect((await session.canvasBox()).y, 'after the first entered note').toBe(idle.y);

  await session.keys('Escape');
  expect((await session.canvasBox()).y, 'after leaving note input').toBe(idle.y);

  await session.clickNotehead(0);
  expect((await session.state()).selectionCount).toBe(1);
  expect((await session.canvasBox()).y, 'with a note selected').toBe(idle.y);
});

test('F2: a click commits the pitch and onset of the ghost it was aimed at, and the next ghost is the same', async ({ page }, testInfo) => {
  const session = await EntrySession.boot(page, testInfo, { xml: EMPTY_EIGHT_BARS });
  await session.keys('N 5');

  const mismatches: string[] = [];
  const targets: Array<[number, number, number]> = [[2, 0.2, -14], [2, 0.6, 6], [3, 0.35, -2], [4, 0.75, 16], [5, 0.3, -22]];
  for (const [measure, ratioX, offsetY] of targets) {
    const point = await pointInBar(session, measure, ratioX, offsetY);
    await session.move(point.x, point.y);
    const before = await session.ghost();
    expect(before, `a ghost shows in bar ${measure}`).not.toBeNull();
    const had = await notes(session);
    await session.click(point.x, point.y);
    const added = (await notes(session)).filter((line) => !had.includes(line));
    expect(added.length, `one click enters one note in bar ${measure}`).toBe(1);
    const expected = `m${before!.measure}@`;
    const pitch = ghostPitchLabel(before!.pitch);
    if (!added[0]!.startsWith(expected) || !added[0]!.includes(` ${pitch} `)) {
      mismatches.push(`ghost ${pitch} in bar ${before!.measure} at ${before!.timestamp}, committed ${added[0]}`);
    }
  }
  expect(mismatches).toEqual([]);
});

test('F4: every click on a visible ghost enters exactly one note within 700 ms', async ({ page }, testInfo) => {
  const session = await EntrySession.boot(page, testInfo, { xml: EMPTY_EIGHT_BARS, screenshots: false });
  await session.keys('N 5');

  const slow: string[] = [];
  let expectedCount = 0;
  for (const measure of [1, 2, 3, 4, 5, 6]) {
    for (const ratioX of [0.2, 0.7]) {
      const point = await pointInBar(session, measure, ratioX, -6);
      await page.mouse.move(point.x, point.y, { steps: 3 });
      await expect(page.getByTestId('ghost-note-preview')).toBeVisible();
      const had = (await notes(session)).length;
      const started = Date.now();
      await page.mouse.click(point.x, point.y);
      expectedCount = had + 1;
      try {
        await expect.poll(async () => (await notes(session)).length, { timeout: 700, intervals: [20, 40, 80] }).toBe(expectedCount);
      } catch {
        slow.push(`bar ${measure} at ${ratioX}: ${(await notes(session)).length - had} notes after ${Date.now() - started} ms`);
      }
    }
  }
  expect(slow).toEqual([]);
  await page.waitForTimeout(400);
  expect((await notes(session)).length, 'no late duplicate').toBe(expectedCount);
});

/** Two voices on one staff: voice 2 lies a step or two under voice 1, so their noteheads touch. */
const TWO_VOICES = (() => {
  const note = (step: string, octave: number, voice: number, stem: string) => `<note><pitch><step>${step}</step><octave>${octave}</octave></pitch><duration>4</duration><voice>${voice}</voice><type>quarter</type><stem>${stem}</stem></note>`;
  const upper = [['C', 4], ['C', 4], ['D', 4], ['E', 4]] as const;
  const lower = [['G', 3], ['A', 3], ['B', 3], ['C', 3]] as const;
  const bar = upper.map(([step, octave]) => note(step, octave, 1, 'up')).join('')
    + '<backup><duration>16</duration></backup>'
    + lower.map(([step, octave]) => note(step, octave, 2, 'down')).join('');
  return scoreXml({ beats: 4, beatType: 4, measures: 2, parts: [{ ...TREBLE, content: { '1:1': bar } }] });
})();

test('F4: the preview at a resting pointer is the same on every pointer event, and the click commits it', async ({ page }, testInfo) => {
  const session = await EntrySession.boot(page, testInfo, { xml: TWO_VOICES });
  await session.keys('Escape N 5');

  // Beat 3: voice 1 has D4, voice 2 has B3 right under the C4 line. Aim at C4.
  const c4 = await session.noteheadCenter(0);
  const beat3 = await session.noteheadCenter(2);
  const point = { x: beat3.x, y: c4.y };
  const seen: string[] = [];
  for (let repeat = 0; repeat < 4; repeat += 1) {
    // The same point again: a pointer event without movement, as a click sends one before it presses.
    await page.mouse.move(point.x, point.y);
    await page.waitForTimeout(120);
    const ghost = await session.ghost();
    seen.push(ghost ? `${ghost.pitch} ${ghost.mode} v${ghost.voice} ${ghost.timestamp}` : 'none');
  }
  expect(new Set(seen).size, `previews at one position: ${seen.join(' | ')}`).toBe(1);

  const preview = (await session.ghost())!;
  const before = await session.voice();
  await session.click(point.x, point.y);
  const after = await session.voice();
  const added = after.filter((line) => !before.includes(line));
  expect(after.length - before.length, `added ${JSON.stringify(added)}`).toBe(1);
  expect(added[0]).toContain(` ${preview.mode === 'chord' ? '+' : ''}${ghostPitchLabel(preview.pitch)} `);
  expect(before.every((line) => after.includes(line)), 'no note of the bar is moved or lost').toBe(true);
});

test('F36: a click right after a fast move commits the preview of the place it lands on', async ({ page }, testInfo) => {
  const session = await EntrySession.boot(page, testInfo, { xml: TWO_VOICES, screenshots: false });
  await session.keys('Escape N 5');

  // What the preview shows at the target when the pointer rests there.
  const beat4 = await session.noteheadCenter(3);
  const target = { x: beat4.x, y: beat4.y - 20 };
  await session.move(target.x, target.y);
  const resting = (await session.ghost())!;
  expect(resting).not.toBeNull();

  // Go elsewhere, let that preview settle, then jump to the target and press at once: the press
  // arrives before the preview of the target has been drawn.
  const far = await session.measureBox(2);
  await session.move(far.x + far.width * 0.5, far.y + far.height * 0.3);
  const before = await session.voice();
  await page.mouse.move(target.x, target.y);
  await page.mouse.down();
  await page.mouse.up();
  await session.settle();
  const added = (await session.voice()).filter((line) => !before.includes(line));
  expect(added.length, `added ${JSON.stringify(added)}`).toBe(1);
  expect(added[0]).toContain(`m${resting.measure}@`);
  expect(added[0]).toContain(` ${resting.mode === 'chord' ? '+' : ''}${ghostPitchLabel(resting.pitch)} `);
});

for (const failure of ['answers 404 at once', 'hangs for 20 s and then fails'] as const) {
  test(`F3: a sound that ${failure} costs the audition, not the entry`, async ({ page }, testInfo) => {
  // No audio stub: the real loader runs against a server without the soundfont.
  await page.route('**/soundfonts/**', async (route) => {
    if (failure !== 'answers 404 at once') await new Promise((resolve) => setTimeout(resolve, 20_000));
    await route.fulfill({ status: 404, body: '' }).catch(() => {});
  });
  const session = await EntrySession.boot(page, testInfo, { xml: EMPTY_EIGHT_BARS, stubAudio: false, screenshots: false });
  await session.keys('N 5');

  const point = await pointInBar(session, 2, 0.3, -6);
  await page.mouse.move(point.x, point.y, { steps: 3 });
  await expect(page.getByTestId('ghost-note-preview')).toBeVisible();
  await page.mouse.click(point.x, point.y);
  await expect.poll(async () => (await notes(session)).length, { timeout: 1_500 }).toBe(1);

  // The page still answers: keys enter notes while the sound is pending.
  await page.keyboard.press('d');
  await page.keyboard.press('e');
  await expect.poll(async () => (await notes(session)).length, { timeout: 1_500 }).toBe(3);
  const answered = await page.evaluate(() => 6 * 7);
  expect(answered).toBe(42);
});
}

for (const zoom of [50, 100, 200]) {
  test(`F7: preview equals commit at ${zoom} % zoom`, async ({ page }, testInfo) => {
    const session = await EntrySession.boot(page, testInfo, { xml: EMPTY_EIGHT_BARS, screenshots: zoom === 200 });
    if (zoom !== 100) await setZoom(page, zoom);
    await session.settle();
    await session.keys('N 5');

    const mismatches: string[] = [];
    for (const [measure, ratioX, offsetRatio] of [[1, 0.3, -0.3], [2, 0.6, 0.1], [3, 0.25, 0.35], [4, 0.7, -0.15]] as const) {
      const box = await session.measureBox(measure);
      const point = { x: box.x + box.width * ratioX, y: box.y + box.height * (0.5 + offsetRatio) };
      await session.move(point.x, point.y);
      const ghost = await session.ghost();
      if (!ghost) { mismatches.push(`no ghost in bar ${measure}`); continue; }
      const had = await notes(session);
      await session.click(point.x, point.y);
      const added = (await notes(session)).filter((line) => !had.includes(line));
      const pitch = ghostPitchLabel(ghost.pitch);
      if (added.length !== 1 || !added[0]!.startsWith(`m${ghost.measure}@`) || !added[0]!.includes(` ${pitch} `)) {
        mismatches.push(`ghost ${pitch} in bar ${ghost.measure} at ${ghost.timestamp}, committed ${JSON.stringify(added)}`);
      }
    }
    expect(mismatches).toEqual([]);
  });
}

test('F38: after Undo of a mouse-entered note the next click in that bar commits what its ghost shows', async ({ page }, testInfo) => {
  const session = await EntrySession.boot(page, testInfo, { xml: EMPTY_EIGHT_BARS });
  await session.keys('N 5');

  const first = await pointInBar(session, 2, 0.3, -6);
  await session.move(first.x, first.y);
  await session.click(first.x, first.y);
  expect((await notes(session)).length).toBe(1);
  await session.keys('Cmd+z');
  expect((await notes(session)).length, 'Undo removes the note').toBe(0);

  // The bar is empty again: the preview must not offer a chord tone on the note that is gone.
  const second = await pointInBar(session, 2, 0.6, 8);
  await session.move(second.x, second.y);
  const ghost = await session.ghost();
  expect(ghost, 'a ghost shows').not.toBeNull();
  expect(ghost!.mode, 'no chord on a rest').not.toBe('chord');
  await session.click(second.x, second.y);
  const added = await notes(session);
  expect(added.length, 'the click enters one note').toBe(1);
  expect(added[0]).toContain(`m${ghost!.measure}@`);
  expect(added[0]).toContain(` ${ghostPitchLabel(ghost!.pitch)} `);
});

test('F41: a rejected entry says why on screen and moves nothing', async ({ page }, testInfo) => {
  const oneBar = scoreXml({ beats: 4, beatType: 4, measures: 1, parts: [{ ...TREBLE }] });
  const session = await EntrySession.boot(page, testInfo, { xml: oneBar });
  // A whole note fills the last bar; a tuplet past the end of the score is rejected (F31).
  await session.keys('N 7 c');
  const canvas = await session.canvasBox();
  const before = await session.xml();
  await session.keys('Cmd+3');
  expect(await session.xml(), 'the rejected tuplet changes nothing').toBe(before);
  const message = page.getByTestId('entry-rejection');
  await expect(message).toBeVisible();
  await expect(message).toHaveAttribute('role', 'alert');
  expect(((await message.textContent()) ?? '').trim().length).toBeGreaterThan(20);
  expect((await session.canvasBox()).y, 'the message moves nothing').toBe(canvas.y);

  // The next accepted entry takes the message away.
  await session.keys('d');
  await expect(message).toHaveCount(0);
});

test('F42: a preview does not stay on screen when the score scrolls under the resting pointer', async ({ page }, testInfo) => {
  const tall = scoreXml({ beats: 4, beatType: 4, measures: 48, parts: [{ ...TREBLE }] });
  const session = await EntrySession.boot(page, testInfo, { xml: tall });
  await session.keys('N 5');
  const point = await pointInBar(session, 2, 0.5, -6);
  await session.move(point.x, point.y);
  const shown = await session.ghost();
  expect(shown, 'a ghost shows').not.toBeNull();

  // The score scrolls without the pointer moving (wheel, or the view following the caret).
  await page.getByTestId('score-viewport').evaluate((viewport) => { viewport.scrollBy({ top: 37 }); });
  await session.settle();
  const after = await session.ghost();
  // Either no preview, or the preview of what now lies under the pointer; never the old one.
  if (after) {
    const before = await session.voice();
    await page.mouse.down();
    await page.mouse.up();
    await session.settle();
    const added = (await session.voice()).filter((line) => !before.includes(line));
    expect(added.length).toBe(1);
    expect(added[0]).toContain(` ${ghostPitchLabel(after.pitch)} `);
  }
  expect(after === null || after.pitch !== shown!.pitch || after.measure !== shown!.measure, 'the stale preview is gone').toBe(true);
});
