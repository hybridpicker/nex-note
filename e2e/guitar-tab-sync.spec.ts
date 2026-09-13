import { expect, test } from '@playwright/test';

const EMPTY_MIDI = Buffer.from('TVRoZAAAAAYAAQABAGBNVHJrAAAABAD/LwA=', 'base64');

test.beforeEach(async ({ page }) => {
  await page.route('**/api/midi', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'audio/midi',
      body: EMPTY_MIDI,
    });
  });
});

const DUAL_STAFF_TAB_XML = `<?xml version="1.0" encoding="UTF-8"?>
<score-partwise version="3.1">
  <part-list><score-part id="P1"><part-name>Guitar</part-name></score-part></part-list>
  <part id="P1">
    <measure number="1">
      <attributes>
        <divisions>1</divisions>
        <time><beats>4</beats><beat-type>4</beat-type></time>
        <staves>2</staves>
        <clef number="1"><sign>G</sign><line>2</line></clef>
        <staff-details number="2"><staff-type>tab</staff-type><staff-lines>6</staff-lines></staff-details>
        <clef number="2"><sign>TAB</sign><line>5</line></clef>
      </attributes>
      <note><pitch><step>C</step><octave>4</octave></pitch><duration>1</duration><voice>1</voice><type>quarter</type><staff>1</staff></note>
      <note><rest/><duration>3</duration><voice>1</voice><type>half</type><dot/><staff>1</staff></note>
      <backup><duration>4</duration></backup>
      <note><pitch><step>C</step><octave>4</octave></pitch><duration>1</duration><voice>1</voice><type>quarter</type><staff>2</staff><notations><technical><string>5</string><fret>3</fret></technical></notations></note>
      <note><rest/><duration>3</duration><voice>1</voice><type>half</type><dot/><staff>2</staff></note>
    </measure>
  </part>
</score-partwise>`;

test('single-clicking a TAB fret selects it, keeps TAB visible, and does not rewrite the score @smoke', async ({ page }) => {
  await page.addInitScript(({ xml }) => {
    localStorage.setItem('nex-note:e2e-boot', JSON.stringify({ xml, filename: 'dual-staff-tab-sync.musicxml' }));
  }, { xml: DUAL_STAFF_TAB_XML });

  await page.goto('/?debug=true&visual-debug=true');
  await expect(page.locator('[data-testid="score-canvas"] svg')).toBeVisible({ timeout: 15_000 });
  const hideTools = page.getByRole('button', { name: 'Hide notation tools' });
  if (await hideTools.isVisible()) await hideTools.click();
  await expect(page.getByRole('button', { name: 'Show notation tools' })).toBeVisible();

  const fretText = page.locator('svg text').filter({ hasText: /^3$/ }).first();
  await fretText.click();
  await expect(page.getByLabel('Inline guitar fret')).toHaveCount(0);
  await expect.poll(async () => page.evaluate(() => {
    const state = (window as typeof window & {
      __NEX_NOTE_E2E_STATE__?: {
        selectedNote?: {
          measureNumber: number;
          staffIndex: number;
          voiceId: number;
          timestampNum: number;
          timestampDen: number;
          step: string;
          octave: number;
          guitar?: { string: number; fret: number } | null;
        } | null;
      };
    }).__NEX_NOTE_E2E_STATE__;
    return state?.selectedNote ? {
      measureNumber: state.selectedNote.measureNumber,
      staffIndex: state.selectedNote.staffIndex,
      voiceId: state.selectedNote.voiceId,
      timestampNum: state.selectedNote.timestampNum,
      timestampDen: state.selectedNote.timestampDen,
      step: state.selectedNote.step,
      octave: state.selectedNote.octave,
      string: state.selectedNote.guitar?.string ?? null,
      fret: state.selectedNote.guitar?.fret ?? null,
    } : null;
  })).toEqual({
    measureNumber: 1,
    staffIndex: 2,
    voiceId: 1,
    timestampNum: 0,
    timestampDen: 4,
    step: 'C',
    octave: 4,
    string: 5,
    fret: 3,
  });
  await expect.poll(async () => fretText.evaluate((element) => {
    const style = window.getComputedStyle(element);
    return element.getAttribute('style') ?? `${style.fill} ${style.stroke}`;
  })).toContain('26, 86, 219');
  await expect(page.getByTitle('Guitar tab input (TAB button)')).toBeVisible();

  const beforeXml = await page.evaluate(() => (
    (window as typeof window & { __NEX_NOTE_E2E_STATE__?: { xml: string } }).__NEX_NOTE_E2E_STATE__?.xml ?? ''
  ));
  await page.getByTitle('Guitar tab input (TAB button)').click();

  await page.waitForTimeout(300);
  const afterXml = await page.evaluate(() => (
    (window as typeof window & { __NEX_NOTE_E2E_STATE__?: { xml: string } }).__NEX_NOTE_E2E_STATE__?.xml ?? ''
  ));
  expect(afterXml).toBe(beforeXml);
});

for (const view of ['page', 'continuous-vertical']) {
for (const zoom of [75, 100, 150]) {
test(`TAB fret editing at ${zoom}% in ${view} keeps notation in sync @smoke`, async ({ page }) => {
  await page.addInitScript(({ xml }) => {
    localStorage.setItem('nex-note:e2e-boot', JSON.stringify({ xml, filename: 'dual-staff-tab-inline-edit.musicxml' }));
  }, { xml: DUAL_STAFF_TAB_XML });

  await page.goto('/');
  await expect(page.locator('[data-testid="score-canvas"] svg')).toBeVisible({ timeout: 15_000 });
  await expect(page.getByTestId('score-canvas')).toHaveAttribute('data-edit-map-measure-count', /^[1-9]\d*$/);

  await page.getByLabel('Score view mode', { exact: true }).selectOption(view);
  await page.getByLabel('Zoom preset', { exact: true }).selectOption(String(zoom));
  const fretText = page.locator('svg text').filter({ hasText: /^3$/ }).first();
  await expect(fretText).toBeVisible();
  const fretBox = await fretText.boundingBox();
  if (!fretBox) throw new Error('missing TAB fret text');
  await page.mouse.click(fretBox.x + fretBox.width / 2, fretBox.y + fretBox.height / 2, { clickCount: 2, delay: 50 });
  const editor = page.getByLabel('Inline guitar fret');
  await expect(editor).toBeVisible();
  await editor.fill('5');
  await editor.press('Enter');

  await expect.poll(async () => page.evaluate(() => {
    const xml = (window as typeof window & { __NEX_NOTE_E2E_STATE__?: { xml: string } }).__NEX_NOTE_E2E_STATE__?.xml ?? '';
    const doc = new DOMParser().parseFromString(xml, 'application/xml');
    const notes = Array.from(doc.getElementsByTagName('note'));
    return {
      notationD4: notes.some((note) => (
        note.getElementsByTagName('staff')[0]?.textContent === '1'
        && note.getElementsByTagName('step')[0]?.textContent === 'D'
        && note.getElementsByTagName('octave')[0]?.textContent === '4'
      )),
      tabFret5: notes.some((note) => (
        note.getElementsByTagName('staff')[0]?.textContent === '2'
        && note.getElementsByTagName('step')[0]?.textContent === 'D'
        && note.getElementsByTagName('octave')[0]?.textContent === '3'
        && note.getElementsByTagName('string')[0]?.textContent === '5'
        && note.getElementsByTagName('fret')[0]?.textContent === '5'
      )),
    };
  })).toEqual({ notationD4: true, tabFret5: true });
});
}
}

const SEPARATE_PARTS_TAB_XML = `<?xml version="1.0" encoding="UTF-8"?>
<score-partwise version="4.0">
  <part-list>
    <score-part id="P1"><part-name>Guitar</part-name></score-part>
    <score-part id="P2"><part-name>Guitar (Tab)</part-name></score-part>
  </part-list>
  <part id="P1">
    <measure number="1">
      <attributes>
        <divisions>2</divisions>
        <time><beats>4</beats><beat-type>4</beat-type></time>
        <clef><sign>G</sign><line>2</line></clef>
      </attributes>
      <note><pitch><step>B</step><octave>4</octave></pitch><duration>1</duration><voice>1</voice><type>eighth</type></note>
      <note><pitch><step>E</step><octave>4</octave></pitch><duration>1</duration><voice>1</voice><type>eighth</type></note>
      <note><rest/><duration>2</duration><voice>1</voice><type>quarter</type></note>
      <note><rest/><duration>4</duration><voice>1</voice><type>half</type></note>
    </measure>
  </part>
  <part id="P2">
    <measure number="1">
      <attributes>
        <divisions>2</divisions>
        <time><beats>4</beats><beat-type>4</beat-type></time>
        <clef><sign>TAB</sign></clef>
        <staff-details>
          <staff-lines>6</staff-lines>
        </staff-details>
      </attributes>
      <note><pitch><step>B</step><octave>4</octave></pitch><duration>1</duration><voice>1</voice><type>eighth</type><notations><technical><string>1</string><fret>7</fret></technical></notations></note>
      <note><pitch><step>E</step><octave>4</octave></pitch><duration>1</duration><voice>1</voice><type>eighth</type><notations><technical><string>3</string><fret>9</fret></technical></notations></note>
      <note><rest/><duration>2</duration><voice>1</voice><type>quarter</type></note>
      <note><rest/><duration>4</duration><voice>1</voice><type>half</type></note>
    </measure>
  </part>
</score-partwise>`;

test('dragging a TAB fret to another string keeps the pitch and recomputes the fret @smoke', async ({ page }) => {
  await page.addInitScript(({ xml }) => {
    localStorage.setItem('nex-note:e2e-boot', JSON.stringify({ xml, filename: 'separate-parts-tab-drag.musicxml' }));
  }, { xml: SEPARATE_PARTS_TAB_XML });

  await page.goto('/?debug=true&visual-debug=true');
  await expect(page.locator('[data-testid="score-canvas"] svg')).toBeVisible({ timeout: 15_000 });
  await expect(page.locator('svg text').filter({ hasText: /^7$/ }).first()).toBeVisible();

  await page.keyboard.press('Escape');
  const noteInputOn = await page.evaluate(() => (
    (window as typeof window & { __NEX_NOTE_E2E_STATE__?: { noteInputMode?: boolean } }).__NEX_NOTE_E2E_STATE__?.noteInputMode ?? false
  ));
  if (noteInputOn) await page.getByTitle('Toggle note input (N)').click();

  // The fret texts mark the TAB rows: "7" sits on string 1, "9" on string 3,
  // so one TAB line is half their vertical distance.
  const fret7 = await page.locator('svg text').filter({ hasText: /^7$/ }).first().boundingBox();
  const fret9 = await page.locator('svg text').filter({ hasText: /^9$/ }).first().boundingBox();
  if (!fret7 || !fret9) throw new Error('missing TAB fret texts');
  const start = { x: fret7.x + fret7.width / 2, y: fret7.y + fret7.height / 2 };
  const lineDistance = (fret9.y + fret9.height / 2 - start.y) / 2;
  expect(lineDistance).toBeGreaterThan(4);

  // Drag B4 from the high E string (fret 7) one string down onto the B string.
  await page.mouse.move(start.x, start.y);
  await page.mouse.down();
  // Many sub-pixel/small mouse events must still activate once their total
  // displacement crosses the drag threshold.
  await page.mouse.move(start.x, start.y + lineDistance * 1.5, { steps: 24 });

  const ghost = page.locator('[data-testid="ghost-note-preview"]');
  await expect(ghost).toHaveAttribute('data-ghost-tab-fret', '12');
  await expect(ghost).toHaveAttribute('data-ghost-tab-string', '2');
  await expect(ghost).toHaveAttribute('data-ghost-pitch', 'B4');

  await page.mouse.up();

  await expect.poll(async () => page.evaluate(() => {
    const xml = (window as typeof window & { __NEX_NOTE_E2E_STATE__?: { xml: string } }).__NEX_NOTE_E2E_STATE__?.xml ?? '';
    const doc = new DOMParser().parseFromString(xml, 'application/xml');
    const parts = Array.from(doc.getElementsByTagName('part'));
    const tabPart = parts.find((part) => part.getAttribute('id') === 'P2');
    const notationPart = parts.find((part) => part.getAttribute('id') === 'P1');
    const tabNote = tabPart ? Array.from(tabPart.getElementsByTagName('note'))
      .find((note) => note.getElementsByTagName('string').length > 0) : null;
    const notationNote = notationPart?.getElementsByTagName('note')[0] ?? null;
    return {
      tabPitch: tabNote
        ? `${tabNote.getElementsByTagName('step')[0]?.textContent}${tabNote.getElementsByTagName('octave')[0]?.textContent}`
        : null,
      tabString: tabNote?.getElementsByTagName('string')[0]?.textContent ?? null,
      tabFret: tabNote?.getElementsByTagName('fret')[0]?.textContent ?? null,
      notationPitch: notationNote
        ? `${notationNote.getElementsByTagName('step')[0]?.textContent}${notationNote.getElementsByTagName('octave')[0]?.textContent}`
        : null,
    };
  })).toEqual({
    tabPitch: 'B4',
    tabString: '2',
    tabFret: '12',
    notationPitch: 'B4',
  });
});

test('note input hover shows no notehead ghost over the TAB staff @smoke', async ({ page }) => {
  await page.addInitScript(({ xml }) => {
    localStorage.setItem('nex-note:e2e-boot', JSON.stringify({ xml, filename: 'separate-parts-tab-hover.musicxml' }));
  }, { xml: SEPARATE_PARTS_TAB_XML });

  await page.goto('/?debug=true&visual-debug=true');
  await expect(page.locator('[data-testid="score-canvas"] svg')).toBeVisible({ timeout: 15_000 });
  await expect(page.locator('svg text').filter({ hasText: /^7$/ }).first()).toBeVisible();
  await page.locator('[data-testid="score-viewport"]').focus();

  await page.keyboard.press('N');
  await expect.poll(async () => page.evaluate(() => (
    (window as typeof window & { __NEX_NOTE_E2E_STATE__?: { noteInputMode?: boolean } }).__NEX_NOTE_E2E_STATE__?.noteInputMode ?? null
  ))).toBe(true);

  const overlays = await page.evaluate(() => (
    Array.from(document.querySelectorAll('[data-measure-number="1"]')).map((el) => {
      const rect = (el as HTMLElement).getBoundingClientRect();
      return { id: (el as HTMLElement).dataset.measureId ?? '', x: rect.x, y: rect.y, width: rect.width, height: rect.height };
    })
  ));
  const notation = overlays.find((overlay) => overlay.id.includes('P1'));
  const tab = overlays.find((overlay) => overlay.id.includes('P2'));
  expect(notation).toBeTruthy();
  expect(tab).toBeTruthy();
  if (!notation || !tab) return;

  const ghost = page.locator('[data-testid="ghost-note-preview"]');

  // Hovering the notation staff shows the regular notehead ghost.
  await page.mouse.move(notation.x + notation.width * 0.45, notation.y + notation.height * 0.5, { steps: 4 });
  await expect(ghost).toHaveCount(1);

  // Hovering the TAB staff must not offer a pitch-notehead ghost.
  await page.mouse.move(tab.x + tab.width * 0.45, tab.y + tab.height * 0.5, { steps: 4 });
  await expect(ghost).toHaveCount(0);
});

for (const key of ['Delete', 'Backspace']) {
  test(`${key} removes linked notation and TAB with atomic history @smoke`, async ({ page }) => {
    const xml = DUAL_STAFF_TAB_XML.replace('<octave>4</octave></pitch><duration>1</duration><voice>1</voice><type>quarter</type><staff>2</staff>', '<octave>3</octave></pitch><duration>1</duration><voice>1</voice><type>quarter</type><staff>2</staff>');
    await page.addInitScript(xml => localStorage.setItem('nex-note:e2e-boot', JSON.stringify({ xml, filename: 'delete-linked.musicxml' })), xml);
    await page.goto('/');
    const note = page.locator('[data-testid="score-canvas"] .vf-notehead').first();
    await expect(note).toBeVisible();
    const readXml = () => page.evaluate(() => (window as typeof window & { __NEX_NOTE_E2E_STATE__: { xml: string } }).__NEX_NOTE_E2E_STATE__.xml);
    const before = await readXml();
    await note.click();
    await page.keyboard.press(key);
    await expect.poll(async () => (await readXml()).match(/<pitch>/g)?.length ?? 0).toBe(0);
    await expect(page.locator('svg text').filter({ hasText: /^3$/ })).toHaveCount(0);
    const after = await readXml();
    await page.keyboard.press('Control+z');
    await expect.poll(readXml).toBe(before);
    await expect(page.locator('svg text').filter({ hasText: /^3$/ }).first()).toBeVisible();
    await page.keyboard.press('Control+Shift+z');
    await expect.poll(readXml).toBe(after);
  });
}
