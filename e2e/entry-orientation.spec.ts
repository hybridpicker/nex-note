import { expect, test } from '@playwright/test';

import { scoreXml, TREBLE } from '../test/support/entry-fixtures';
import { REFERENCE_TASKS } from '../test/support/reference-tasks';
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

for (const view of ['continuous-vertical', 'page'] as const) {
  test(`O4: the caret stays in view through long entry at 200 % zoom, ${view === 'page' ? 'page view' : 'continuous view'}`, async ({ page }, testInfo) => {
    test.setTimeout(180_000);
    const xml = scoreXml({ beats: 4, beatType: 4, measures: 24, parts: [{ ...TREBLE }] });
    const session = await EntrySession.boot(page, testInfo, { xml, screenshots: false });
    if (view === 'page') {
      await page.getByLabel('Score view mode').selectOption('page');
      await session.waitForScore();
    }
    const zoom = page.getByRole('spinbutton').first();
    await zoom.fill('200');
    await zoom.press('Enter');
    await session.waitForScore();
    await page.getByTestId('score-viewport').focus();
    await session.settle();

    await session.keys('N 5');
    const outOfView: string[] = [];
    const letters = ['c', 'd', 'e', 'f', 'g', 'a', 'b', 'a', 'g', 'f', 'e', 'd'];
    // Sixteen bars of quarter notes: several systems at this zoom, in both directions of scrolling.
    for (let index = 0; index < 64; index += 1) {
      await session.keys(letters[index % letters.length]!);
      const caret = await session.caret();
      const cursor = (await session.state()).selectedNote;
      if (!caret) outOfView.push(`note ${index + 1}: no caret`);
      else if (!caret.inViewport) outOfView.push(`note ${index + 1}: caret at ${Math.round(caret.x)},${Math.round(caret.y)} outside the viewport`);
      else if (cursor && caret.measure !== cursor.measureNumber) outOfView.push(`note ${index + 1}: caret in bar ${caret.measure}, cursor in bar ${cursor.measureNumber}`);
    }
    await session.shot(`caret-after-64-notes-${view}`);
    expect(outOfView).toEqual([]);
    expect((await session.state()).selectedNote?.measureNumber).toBe(17);
  });
}

test('O4: the status line names bar, beat, pitch and value of the selection', async ({ page }, testInfo) => {
  const session = await EntrySession.boot(page, testInfo, { xml: EMPTY_EIGHT_BARS });
  await session.keys('N 5 c 4 d + f');
  const status = page.getByTestId('selection-status');
  // The cursor stands after the three notes: beat 3 of bar 1, on the rest that is left.
  await expect(status).toHaveAttribute('data-status-bar', '1');
  await expect(status).toHaveAttribute('data-status-beat', '3');
  await expect(status).toContainText('Bar 1, beat 3');
  await expect(status).not.toContainText('/');

  // Step back onto the F sharp: an eighth note on beat 2.5.
  await session.keys('Escape');
  await session.clickNotehead(2);
  await expect(status).toHaveAttribute('data-status-beat', '2.5');
  await expect(status).toHaveAttribute('data-status-pitch', 'F♯5');
  await expect(status).toHaveAttribute('data-status-value', 'eighth');
  await expect(status).toContainText('Bar 1, beat 2.5 · F♯5 · Eighth note');
});

test('O3: the mode buttons carry musical words, and the preview names what a click will do', async ({ page }, testInfo) => {
  const session = await EntrySession.boot(page, testInfo, { xml: EMPTY_EIGHT_BARS });
  await page.getByRole('button', { name: 'Show notation tools', exact: true }).click();
  const tools = page.getByTestId('left-notation-sidebar');
  await page.evaluate(() => {
    document.querySelectorAll<HTMLElement>('.nex-note-sidebar-section-toggle[aria-expanded="false"]').forEach((toggle) => toggle.click());
  });
  for (const cryptic of ['INS', 'OVR', 'CHD', 'STEP', 'DUR', 'LEAD']) {
    await expect(tools.getByText(cryptic, { exact: true }), `no "${cryptic}" label`).toHaveCount(0);
  }
  for (const plain of ['Standard', 'Chord', 'Keys', 'Pitch first', 'Lead sheet']) {
    await expect(tools.getByText(plain, { exact: true }).first(), `"${plain}" label`).toBeVisible();
  }

  // A preview over an existing note of the armed value says that the click adds to its chord.
  await session.keys('N 5 c');
  const head = await session.noteheadCenter(0);
  await session.move(head.x, head.y - 20);
  const ghost = await session.ghost();
  expect(ghost?.mode).toBe('chord');
  await expect(page.getByTestId('ghost-note-preview')).toContainText('Add to chord');
  await expect(page.getByTestId('ghost-note-preview')).not.toContainText('Multi-voice');
});

test('O3: the inspector shows the properties of the selected note', async ({ page }, testInfo) => {
  const session = await EntrySession.boot(page, testInfo, { xml: EMPTY_EIGHT_BARS });
  await session.keys('N 5 . c Escape');
  await session.clickNotehead(0);
  await page.keyboard.press('F8');
  const properties = page.getByTestId('inspector-note-properties');
  await expect(properties).toBeVisible();
  await expect(page.getByText('Phase 1 foundation', { exact: false })).toHaveCount(0);
  await expect(properties.locator('[data-property="pitch"]')).toHaveText('C5');
  await expect(properties.locator('[data-property="value"]')).toContainText('Quarter note');
  await expect(properties.locator('[data-property="value"]')).toContainText('dotted');
  await expect(properties.locator('[data-property="position"]')).toHaveText('Bar 1, beat 1');
  await expect(properties.locator('[data-property="voice"]')).toHaveText('1');

  // Stem and visibility are controls of the selected note.
  await properties.getByRole('button', { name: 'Stem down' }).click();
  await expect.poll(async () => (await session.core()).score.parts[0]!.staves[0]!.measures[0]!.voices[0]!.events[0]!.stem).toBe('down');
  await properties.getByRole('checkbox', { name: 'Visible' }).uncheck();
  await expect.poll(async () => (await session.core()).score.parts[0]!.staves[0]!.measures[0]!.voices[0]!.events[0]!.hidden).toBe(true);
  await session.keys('Cmd+z Cmd+z');
  const restored = (await session.core()).score.parts[0]!.staves[0]!.measures[0]!.voices[0]!.events[0]!;
  expect(restored.stem ?? null).toBeNull();
  expect(restored.hidden ?? false).toBe(false);
});

test('O5: the caret follows entry in the lower staff of a piano score with a pickup bar', async ({ page }, testInfo) => {
  // The start score of R3: 3/4, a pickup numbered 0 in the file, two staves.
  const session = await EntrySession.boot(page, testInfo, { xml: REFERENCE_TASKS.find((task) => task.id === 'R3')!.start() });
  await session.keys('Cmd+Home N Alt+ArrowDown 5 0');
  for (const key of ['6', '.', 'c', 'g', 'c']) {
    await session.keys(key);
    const state = await session.state();
    const caret = await session.caret();
    expect(caret, `caret after ${key}`).not.toBeNull();
    expect(caret!.staff, `the caret stands on the lower staff after ${key}`).toBe(2);
    expect(caret!.measure).toBe(state.selectedNote!.measureNumber);
    expect(caret!.inViewport).toBe(true);
  }
  expect((await session.state()).selectedNote!.measureNumber, 'three notes on: the cursor is in the fifth bar').toBe(5);
  // The lower staff is still drawn: the stored file says the part has two staves.
  expect(await session.xml()).toMatch(/<measure number="1" implicit="yes"><attributes>.*?<staves>2<\/staves>/);
});
