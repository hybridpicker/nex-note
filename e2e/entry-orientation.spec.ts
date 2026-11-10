import { expect, test } from '@playwright/test';

import { scoreXml, TREBLE } from '../test/support/entry-fixtures';
import { EntrySession } from './support/entry-session';

/*
 * Orientation rows of docs/note-entry-mastery-ledger.md: during note input the user sees where the
 * next note will land (O1, the caret) and what is armed (O2, the note-input bar), without opening the
 * notation tools.
 */

const EMPTY_EIGHT_BARS = scoreXml({ beats: 4, beatType: 4, measures: 8, parts: [{ ...TREBLE }] });

test('O1: a caret marks the input position from N on and follows every entry', async ({ page }, testInfo) => {
  const session = await EntrySession.boot(page, testInfo, { xml: EMPTY_EIGHT_BARS });
  expect(await session.caret(), 'no caret outside note input').toBeNull();

  await session.keys('N');
  const atStart = await session.caret();
  expect(atStart, 'the caret shows as soon as note input starts').not.toBeNull();
  expect(atStart!.inViewport).toBe(true);
  expect(atStart!.measure).toBe(1);
  expect(atStart!.voice).toBe(1);
  expect(atStart!.height, 'the caret spans the staff').toBeGreaterThan(30);

  // The caret stands where the document says the cursor is, after every key.
  let previousX = atStart!.x;
  for (const key of ['5', 'c', 'd', 'e']) {
    await session.keys(key);
    const state = await session.state();
    const caret = await session.caret();
    expect(caret, `caret after ${key}`).not.toBeNull();
    expect(caret!.measure).toBe(state.selectedNote!.measureNumber);
    expect(caret!.timestamp).toBe(`${state.selectedNote!.timestampNum}/${state.selectedNote!.timestampDen}`);
    expect(caret!.inViewport).toBe(true);
    if (/^[a-g]$/.test(key)) {
      expect(caret!.x, `the caret moves right after ${key}`).toBeGreaterThan(previousX + 4);
      previousX = caret!.x;
    }
  }

  // It takes the colour of the input voice.
  const voice1Colour = await page.getByTestId('note-input-caret').evaluate((element) => getComputedStyle(element).backgroundColor);
  await session.keys('Cmd+Alt+2');
  const voice2 = await session.caret();
  expect(voice2!.voice).toBe(2);
  const voice2Colour = await page.getByTestId('note-input-caret').evaluate((element) => getComputedStyle(element).backgroundColor);
  expect(voice2Colour).not.toBe(voice1Colour);

  await session.keys('Escape');
  expect(await session.caret(), 'the caret leaves with note input').toBeNull();
});

test('O1: the caret follows Undo and a click on another bar', async ({ page }, testInfo) => {
  const session = await EntrySession.boot(page, testInfo, { xml: EMPTY_EIGHT_BARS });
  await session.keys('N 5 c d');
  const afterTwo = (await session.caret())!;
  await session.keys('Cmd+z');
  const afterUndo = (await session.caret())!;
  expect(afterUndo, 'the caret is still there after Undo').not.toBeNull();
  expect(afterUndo.x).toBeLessThan(afterTwo.x - 4);

  const bar3 = await session.measureBox(3);
  await session.click(bar3.x + bar3.width * 0.3, bar3.y + bar3.height * 0.5);
  const state = await session.state();
  const caret = (await session.caret())!;
  expect(caret.measure).toBe(state.selectedNote!.measureNumber);
  expect(caret.timestamp).toBe(`${state.selectedNote!.timestampNum}/${state.selectedNote!.timestampDen}`);
});

test('O2: the note-input bar shows what is armed and follows every change', async ({ page }, testInfo) => {
  const session = await EntrySession.boot(page, testInfo, { xml: EMPTY_EIGHT_BARS });
  expect((await session.armed()).visible, 'no bar outside note input').toBe(false);

  await session.keys('N');
  const initial = await session.armed();
  expect(initial.visible, 'the bar shows with note input, with the notation tools closed').toBe(true);
  await expect(page.getByRole('button', { name: 'Show notation tools', exact: true })).toBeVisible();
  expect(Object.keys(initial.fields).sort()).toEqual(['accidental', 'dot', 'mode', 'tuplet', 'value', 'voice']);
  expect(initial.fields.value).toBe('quarter');
  expect(initial.fields.dot).toBe('off');
  expect(initial.fields.accidental).toBe('none');
  expect(initial.fields.voice).toBe('1');

  await session.keys('6');
  expect((await session.armed()).fields.value).toBe('half');
  await session.keys('.');
  expect((await session.armed()).fields.dot).toBe('on');
  await session.keys('+');
  expect((await session.armed()).fields.accidental).toBe('sharp');
  await session.keys('Cmd+Alt+2');
  expect((await session.armed()).fields.voice).toBe('2');
  const modeBefore = (await session.armed()).fields.mode;
  await session.keys('I');
  expect((await session.armed()).fields.mode).not.toBe(modeBefore);

  // Every control is clickable: the bar is a control surface, not a read-out.
  await page.getByTestId('note-input-bar').locator('[data-armed-set="value:quarter"]').click();
  expect((await session.armed()).fields.value).toBe('quarter');
  expect((await session.state()).selectedDuration).toBe('4');
  await page.getByTestId('note-input-bar').locator('[data-armed-set="voice:1"]').click();
  expect((await session.state()).selectedVoice).toBe(1);

  await session.keys('Escape');
  expect((await session.armed()).visible).toBe(false);
});
