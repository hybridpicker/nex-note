import { expect, test } from '@playwright/test';

const MOD = process.platform === 'darwin' ? 'Meta' : 'Control';

const GUITAR_TAB_XML = `<?xml version="1.0" encoding="UTF-8"?>
<score-partwise version="3.1">
  <work><work-title>Inline Chord TAB Visibility</work-title></work>
  <part-list><score-part id="P1"><part-name>Guitar</part-name></score-part></part-list>
  <part id="P1">
    <measure number="1">
      <attributes>
        <divisions>2</divisions>
        <key><fifths>0</fifths></key>
        <time><beats>4</beats><beat-type>4</beat-type></time>
        <staves>2</staves>
        <clef number="1"><sign>G</sign><line>2</line></clef>
        <clef number="2"><sign>TAB</sign><line>5</line></clef>
      </attributes>
      <note><pitch><step>F</step><alter>1</alter><octave>4</octave></pitch><duration>1</duration><voice>1</voice><type>eighth</type><staff>1</staff><notations><slur type="start" number="1" placement="above"/></notations></note>
      <note><pitch><step>E</step><octave>4</octave></pitch><duration>1</duration><voice>1</voice><type>eighth</type><staff>1</staff><notations><slur type="stop" number="1"/></notations></note>
      <note><rest/><duration>6</duration><voice>1</voice><type>half</type><dot/><staff>1</staff></note>
      <backup><duration>8</duration></backup>
      <note><pitch><step>F</step><alter>1</alter><octave>4</octave></pitch><duration>1</duration><voice>1</voice><type>eighth</type><staff>2</staff><notations><technical><string>4</string><fret>5</fret><pull-off number="1" type="start">P</pull-off></technical></notations></note>
      <note><pitch><step>E</step><octave>4</octave></pitch><duration>1</duration><voice>1</voice><type>eighth</type><staff>2</staff><notations><technical><string>4</string><fret>4</fret><pull-off number="1" type="stop">P</pull-off></technical></notations></note>
      <note><rest/><duration>6</duration><voice>1</voice><type>half</type><dot/><staff>2</staff></note>
    </measure>
  </part>
</score-partwise>`;

const GUITAR_TAB_WITH_STAFF_DETAILS_XML = GUITAR_TAB_XML.replace(
  '<attributes>',
  '<attributes><staff-details number="1"><staff-lines>5</staff-lines></staff-details><staff-details number="2"><staff-lines>6</staff-lines></staff-details>',
);

test('inline chord entry accepts German Fis half-diminished symbols after Command+K @smoke', async ({ page }) => {
  await page.addInitScript(({ xml }) => {
    const now = Date.now();
    localStorage.setItem('nex-note:score-library', JSON.stringify([{
      id: 'seeded-score',
      name: 'inline-chord-tab-visibility.musicxml',
      xml,
      format: 'musicxml',
      sizeBytes: xml.length,
      measures: 1,
      parts: 1,
      favorite: false,
      createdAt: now,
      updatedAt: now,
      lastOpenedAt: now,
    }]));
    localStorage.setItem('nex-note:recent-files', JSON.stringify([{
      name: 'inline-chord-tab-visibility.musicxml',
      timestamp: now,
      size: xml.length,
    }]));
    localStorage.setItem('nex-note:e2e-boot', JSON.stringify({ xml, filename: 'inline-chord-tab-visibility.musicxml' }));
  }, { xml: GUITAR_TAB_XML });

  await page.goto('/?debug=true&visual-debug=true');
  const scoreSvg = page.locator('[data-testid="score-canvas"] svg');
  await expect(scoreSvg).toBeVisible({ timeout: 15_000 });

  await page.locator('[data-testid="score-canvas"] .vf-tabnote').first().click({ force: true });
  await page.keyboard.press(`${MOD}+K`);
  const inlineChord = page.getByLabel('Inline chord symbol');
  await expect(inlineChord).toBeFocused();
  await inlineChord.fill('FISMAL7b5');
  await page.keyboard.press('Enter');

  await expect.poll(async () => scoreSvg.evaluate((svg) => svg.textContent ?? '')).toContain('F#m7b5');
  await expect.poll(async () => page.evaluate(() => (
    (window as typeof window & { __NEX_NOTE_E2E_STATE__?: { xml: string } }).__NEX_NOTE_E2E_STATE__?.xml ?? ''
  ))).toContain('<kind text="m7b5">half-diminished</kind>');
  await expect.poll(async () => page.evaluate(() => (
    (window as typeof window & { __NEX_NOTE_E2E_STATE__?: { xml: string } }).__NEX_NOTE_E2E_STATE__?.xml ?? ''
  ))).toContain('<root-alter>1</root-alter>');
  await expect(page.getByText('Doctor live: 0')).toBeVisible();
});

test('Command+K opens inline chord entry even when command search is focused @smoke', async ({ page }) => {
  await page.addInitScript(({ xml }) => {
    localStorage.setItem('nex-note:e2e-boot', JSON.stringify({ xml, filename: 'inline-chord-focused-field.musicxml' }));
  }, { xml: GUITAR_TAB_XML });

  await page.goto('/?debug=true&visual-debug=true');
  const scoreSvg = page.locator('[data-testid="score-canvas"] svg');
  await expect(scoreSvg).toBeVisible({ timeout: 15_000 });

  await page.locator('[data-testid="score-canvas"] .vf-tabnote').first().click({ force: true });
  await page.getByTitle('Commands (Cmd/Ctrl+K)').click();
  await expect(page.getByPlaceholder('Search commands, exports, notation tools...')).toBeFocused();
  await page.keyboard.press(`${MOD}+K`);

  const inlineChord = page.getByLabel('Inline chord symbol');
  await expect(inlineChord).toBeFocused();
  await inlineChord.fill('FISMAL7b5');
  await page.keyboard.press('Enter');

  await expect.poll(async () => scoreSvg.evaluate((svg) => svg.textContent ?? '')).toContain('F#m7b5');
});

test('command search accepts MuseScore-style chord symbols directly @smoke', async ({ page }) => {
  for (const chord of ['C', 'F#m7b5', 'Bb7#11']) {
    await page.goto('/?debug=true&visual-debug=true');
    await page.evaluate(({ xml, name }) => {
      localStorage.setItem('nex-note:e2e-boot', JSON.stringify({ xml, filename: name }));
    }, { xml: GUITAR_TAB_XML, name: `command-search-${chord.replace(/[^A-Za-z0-9]+/g, '-')}.musicxml` });

    await page.reload();
    const scoreSvg = page.locator('[data-testid="score-canvas"] svg');
    await expect(scoreSvg).toBeVisible({ timeout: 15_000 });

    await page.locator('[data-testid="score-canvas"] .vf-tabnote').first().click({ force: true });
    await page.getByTitle('Commands (Cmd/Ctrl+K)').click();
    const commandSearch = page.getByPlaceholder('Search commands, exports, notation tools...');
    await expect(commandSearch).toBeFocused();
    await commandSearch.fill(chord);
    await page.keyboard.press('Enter');

    await expect.poll(async () => scoreSvg.evaluate((svg) => svg.textContent ?? '')).toContain(chord);
    const expectedXml = chord === 'Bb7#11' ? '<words>Bb7#11</words>' : '<harmony>';
    await expect.poll(async () => page.evaluate(() => (
      (window as typeof window & { __NEX_NOTE_E2E_STATE__?: { xml: string } }).__NEX_NOTE_E2E_STATE__?.xml ?? ''
    ))).toContain(expectedXml);
    await expect.poll(async () => page.evaluate(() => (
      ((window as typeof window & {
        __NEX_NOTE_E2E_STATE__?: { lastCommandTypes?: string[] };
      }).__NEX_NOTE_E2E_STATE__?.lastCommandTypes ?? []).includes('setHarmonyAt')
    ))).toBe(true);
  }
});

test('command search writes chords in imported TAB scores with staff details @smoke', async ({ page }) => {
  await page.goto('/?debug=true&visual-debug=true');
  await page.evaluate(({ xml }) => {
    localStorage.setItem('nex-note:e2e-boot', JSON.stringify({ xml, filename: 'command-search-staff-details.musicxml' }));
  }, { xml: GUITAR_TAB_WITH_STAFF_DETAILS_XML });

  await page.reload();
  const scoreSvg = page.locator('[data-testid="score-canvas"] svg');
  await expect(scoreSvg).toBeVisible({ timeout: 15_000 });
  const visibleTabNotesBefore = await page.locator('[data-testid="score-canvas"] .vf-tabnote').count();
  expect(visibleTabNotesBefore).toBeGreaterThan(0);

  await page.locator('[data-testid="score-canvas"] .vf-tabnote').first().click({ force: true });
  await page.getByTitle('Commands (Cmd/Ctrl+K)').click();
  const commandSearch = page.getByPlaceholder('Search commands, exports, notation tools...');
  await expect(commandSearch).toBeFocused();
  await commandSearch.fill('Fm7');
  await page.keyboard.press('Enter');

  await expect.poll(async () => page.evaluate(() => {
    const state = (window as typeof window & {
      __NEX_NOTE_E2E_STATE__?: { xml: string; lastCommandTypes?: string[] };
    }).__NEX_NOTE_E2E_STATE__;
    return {
      hasHarmony: Boolean(state?.xml.includes('<harmony>') && state.xml.includes('<root-step>F</root-step>') && state.xml.includes('<kind text="m7">minor-seventh</kind>')),
      hasStaffDetails: Boolean(state?.xml.includes('<staff-details')),
      commandLogged: Boolean(state?.lastCommandTypes?.includes('setHarmonyAt')),
    };
  })).toEqual({ hasHarmony: true, hasStaffDetails: true, commandLogged: true });
  await expect.poll(async () => page.locator('[data-testid="score-canvas"] .vf-tabnote').count()).toBeGreaterThan(0);
});

test('clicking an existing chord symbol reopens it for editing @smoke', async ({ page }) => {
  await page.goto('/?debug=true&visual-debug=true');
  await page.evaluate(({ xml }) => {
    localStorage.setItem('nex-note:e2e-boot', JSON.stringify({ xml, filename: 'click-edit-chord-symbol.musicxml' }));
  }, { xml: GUITAR_TAB_WITH_STAFF_DETAILS_XML });

  await page.reload();
  const scoreSvg = page.locator('[data-testid="score-canvas"] svg');
  await expect(scoreSvg).toBeVisible({ timeout: 15_000 });

  await page.locator('[data-testid="score-canvas"] .vf-tabnote').first().click({ force: true });
  await page.keyboard.press(`${MOD}+K`);
  const inlineChord = page.getByLabel('Inline chord symbol');
  await expect(inlineChord).toBeFocused();
  await inlineChord.fill('Fm7');
  await page.keyboard.press('Enter');
  await expect.poll(async () => scoreSvg.evaluate((svg) => svg.textContent ?? '')).toContain('Fm7');

  await page.locator('[data-testid="score-canvas"] svg text').filter({ hasText: 'Fm7' }).first().click({ force: true });
  await expect(page.getByLabel('Inline chord symbol')).toHaveValue('Fm7');
  await page.getByLabel('Inline chord symbol').fill('C');
  await page.keyboard.press('Enter');

  await expect.poll(async () => scoreSvg.evaluate((svg) => svg.textContent ?? '')).toContain('C');
  await expect.poll(async () => page.evaluate(() => (
    (window as typeof window & { __NEX_NOTE_E2E_STATE__?: { xml: string } }).__NEX_NOTE_E2E_STATE__?.xml ?? ''
  ))).toContain('<root-step>C</root-step>');
  await expect.poll(async () => page.locator('[data-testid="score-canvas"] .vf-tabnote').count()).toBeGreaterThan(0);
});
