import { expect, test } from '@playwright/test';

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

test('double-clicking a TAB fret number edits that digit and keeps notation in sync @smoke', async ({ page }) => {
  await page.addInitScript(({ xml }) => {
    localStorage.setItem('nex-note:e2e-boot', JSON.stringify({ xml, filename: 'dual-staff-tab-inline-edit.musicxml' }));
  }, { xml: DUAL_STAFF_TAB_XML });

  await page.goto('/?debug=true&visual-debug=true');
  await expect(page.locator('[data-testid="score-canvas"] svg')).toBeVisible({ timeout: 15_000 });

  const fretText = page.locator('svg text').filter({ hasText: /^3$/ }).first();
  await fretText.dblclick();
  const editor = page.getByLabel('Inline guitar fret');
  await expect(editor).toBeVisible();
  await editor.fill('5');
  await editor.press('Enter');

  await expect.poll(async () => page.evaluate(() => {
    const xml = (window as typeof window & { __NEX_NOTE_E2E_STATE__?: { xml: string } }).__NEX_NOTE_E2E_STATE__?.xml ?? '';
    const doc = new DOMParser().parseFromString(xml, 'application/xml');
    const notes = Array.from(doc.getElementsByTagName('note'));
    return {
      notationD3: notes.some((note) => (
        note.getElementsByTagName('staff')[0]?.textContent === '1'
        && note.getElementsByTagName('step')[0]?.textContent === 'D'
        && note.getElementsByTagName('octave')[0]?.textContent === '3'
      )),
      tabFret5: notes.some((note) => (
        note.getElementsByTagName('staff')[0]?.textContent === '2'
        && note.getElementsByTagName('step')[0]?.textContent === 'D'
        && note.getElementsByTagName('octave')[0]?.textContent === '3'
        && note.getElementsByTagName('string')[0]?.textContent === '5'
        && note.getElementsByTagName('fret')[0]?.textContent === '5'
      )),
    };
  })).toEqual({ notationD3: true, tabFret5: true });
});
