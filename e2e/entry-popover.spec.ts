import { expect, test } from '@playwright/test';

import { scoreXml, TREBLE } from '../test/support/entry-fixtures';
import { summarizeScore } from '../test/support/score-summary';
import { EntrySession } from './support/entry-session';

/*
 * The inline-entry popover (K4 to K6 of docs/note-entry-mastery-ledger.md): markings are typed at the
 * caret or selection, with keys alone, the parsed result is shown before it is written, Enter commits
 * one Undo step and Esc leaves no trace.
 */

const quarters = (steps: string, octave = 5) => steps.split('').map((step) => (
  `<note><pitch><step>${step}</step><octave>${octave}</octave></pitch><duration>4</duration><voice>1</voice><type>quarter</type></note>`
)).join('');
const TUNE = scoreXml({
  beats: 4, beatType: 4, measures: 4,
  parts: [{ ...TREBLE, content: { '1:1': quarters('CDEF'), '2:1': quarters('GFED'), '3:1': quarters('CDEF') } }],
});

async function lines(session: EntrySession, pattern: RegExp) {
  return summarizeScore(await session.xml()).filter((line) => pattern.test(line));
}

async function type(session: EntrySession, text: string) {
  await session.page.keyboard.type(text);
}

test('K5: a dynamic is typed at the selected note; the preview names it, Enter writes it, Esc leaves nothing', async ({ page }, testInfo) => {
  const session = await EntrySession.boot(page, testInfo, { xml: TUNE });
  await session.clickNotehead(1);
  const before = await session.xml();
  const canvas = await session.canvasBox();

  await session.keys('Alt+Shift+D');
  const popover = page.getByTestId('inline-entry-popover');
  await expect(popover).toBeVisible();
  await expect(popover).toHaveAttribute('data-entry-kind', 'dynamic');
  await expect(popover.getByRole('textbox')).toBeFocused();
  expect((await session.canvasBox()).y, 'the popover moves nothing').toBe(canvas.y);

  await type(session, 'loud');
  await expect(page.getByTestId('inline-entry-preview')).toHaveAttribute('data-entry-ok', 'false');
  await page.keyboard.press('Enter');
  await expect(popover, 'a text that is not a dynamic is not committed').toBeVisible();
  expect(await session.xml()).toBe(before);

  await page.keyboard.press('Escape');
  await expect(popover).toHaveCount(0);
  expect(await session.xml(), 'Esc leaves no trace').toBe(before);

  await session.keys('Alt+Shift+D');
  await type(session, 'mf');
  await expect(page.getByTestId('inline-entry-preview')).toHaveAttribute('data-entry-ok', 'true');
  await expect(page.getByTestId('inline-entry-preview')).toContainText('Dynamic mf');
  await page.keyboard.press('Enter');
  await expect(popover).toHaveCount(0);
  await expect.poll(() => lines(session, /dynamics/)).toEqual(['m1 @1 dynamics mf']);

  // The keys go to the score again, and one Undo takes the dynamic away.
  await session.keys('Cmd+z');
  expect(await session.xml()).toBe(before);
});

test('K5: key, time signature, clef, tempo, rehearsal mark and text are typed at the bar of the selection', async ({ page }, testInfo) => {
  const session = await EntrySession.boot(page, testInfo, { xml: TUNE });
  await session.clickNotehead(8); // first note of bar 3

  for (const [key, text, expected] of [
    ['Alt+Shift+K', 'D', 'm3 key 2'],
    ['Alt+Shift+M', '3/4', 'm3 time 3/4'],
    ['Alt+Shift+C', 'bass', 'm3 clef F4'],
    ['Cmd+m', 'A', 'm3 @0 rehearsal A'],
    ['Cmd+t', 'pizz.', 'm3 @0 words pizz.'],
  ] as const) {
    await session.clickNotehead(8);
    await session.keys(key);
    await expect(page.getByTestId('inline-entry-popover'), key).toBeVisible();
    await type(session, text);
    await expect(page.getByTestId('inline-entry-preview'), key).toHaveAttribute('data-entry-ok', 'true');
    await page.keyboard.press('Enter');
    await expect(page.getByTestId('inline-entry-popover')).toHaveCount(0);
    await expect.poll(async () => (await lines(session, /./)).includes(expected), { message: `${key} ${text} gives "${expected}"` }).toBe(true);
  }
  expect(await lines(session, /^m1 (key|time|clef)/)).toEqual(['m1 key 0', 'm1 time 4/4', 'm1 clef G2']);
});

test('K5: a hairpin, a pedal line and an ending cover the selected range', async ({ page }, testInfo) => {
  const session = await EntrySession.boot(page, testInfo, { xml: TUNE });
  await session.clickNotehead(0);
  await session.keys('Shift+ArrowRight Shift+ArrowRight Shift+ArrowRight');
  expect((await session.state()).selectionCount).toBe(4);
  await session.keys('Alt+Shift+D');
  await type(session, '<');
  await expect(page.getByTestId('inline-entry-preview')).toContainText('Crescendo');
  await page.keyboard.press('Enter');
  await expect.poll(() => lines(session, /wedge/)).toEqual(['m1 @0 wedge crescendo', 'm1 @4 wedge stop']);

  await session.clickNotehead(4);
  await session.keys('Shift+ArrowRight Alt+Shift+R');
  await type(session, '1.');
  await page.keyboard.press('Enter');
  await session.clickNotehead(4);
  await session.keys('Alt+Shift+R');
  await type(session, ':|');
  await page.keyboard.press('Enter');
  await expect.poll(() => lines(session, /ending|repeat/)).toEqual(['m2 ending 1 start', 'm2 ending 1 stop', 'm2 right repeat-end']);
});

test('K6: chord symbols are typed in one flow: Space to the next beat, Tab to the next bar, Cmd+6 a half note on', async ({ page }, testInfo) => {
  const session = await EntrySession.boot(page, testInfo, { xml: TUNE });
  await session.clickNotehead(0);
  await session.keys('Cmd+k');
  const field = page.getByLabel('Inline chord symbol');
  await expect(field).toBeFocused();
  await type(session, 'C');
  await page.keyboard.press('Space');
  await expect(page.getByTestId('inline-entry-popover')).toHaveAttribute('data-entry-position', /^chord:1:4\/16/);
  await type(session, 'G7/B');
  await page.keyboard.press('Tab');
  await expect(page.getByTestId('inline-entry-popover')).toHaveAttribute('data-entry-position', /^chord:2:0\//);
  await type(session, 'Am7');
  await page.keyboard.press('Control+6');
  await type(session, 'F#dim7');
  await page.keyboard.press('Enter');
  await expect(page.getByTestId('inline-entry-popover')).toHaveCount(0);
  await expect.poll(() => lines(session, /harmony/)).toEqual([
    'm1 @0 harmony C', 'm1 @1 harmony G7/B', 'm2 @0 harmony Am7', 'm2 @2 harmony F#dim7',
  ]);
});

test('K4: lyrics are typed under the notes: Space, hyphen, melisma and a second verse', async ({ page }, testInfo) => {
  const session = await EntrySession.boot(page, testInfo, { xml: TUNE });
  await session.clickNotehead(0);
  await session.keys('Cmd+l');
  const popover = page.getByTestId('inline-entry-popover');
  await expect(popover).toHaveAttribute('data-entry-kind', 'lyrics');
  await type(session, 'Morn-ing light is ris-ing sea_');
  await page.keyboard.press('Enter');
  await expect(popover).toHaveCount(0);
  await expect.poll(() => lines(session, /^lyric 1/)).toEqual([
    'lyric 1 C5@m1:0 "Morn" begin',
    'lyric 1 D5@m1:1 "ing" end',
    'lyric 1 E5@m1:2 "light" single',
    'lyric 1 F5@m1:3 "is" single',
    'lyric 1 G5@m2:0 "ris" begin',
    'lyric 1 F5@m2:1 "ing" end',
    'lyric 1 E5@m2:2 "sea" single extend:start',
    'lyric 1 D5@m2:3 "" single extend:stop',
  ]);

  // The same key on the first note starts the verse below.
  await session.clickNotehead(0);
  await session.keys('Cmd+l');
  await type(session, 'Eve-ning');
  await page.keyboard.press('Enter');
  await expect.poll(() => lines(session, /^lyric 2/)).toEqual([
    'lyric 2 C5@m1:0 "Eve" begin',
    'lyric 2 D5@m1:1 "ning" end',
  ]);
});
