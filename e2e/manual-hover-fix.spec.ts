import { expect, test } from '@playwright/test';

import { scanGhostMapForMeasure } from './support/ghost-map';
import type { Page } from '@playwright/test';

const polyphonicFixtureXml = `<?xml version="1.0" encoding="UTF-8"?>
<score-partwise version="3.1">
  <work><work-title>Polyphonic Browser Fixture</work-title></work>
  <part-list>
    <score-part id="P1"><part-name>Piano</part-name></score-part>
  </part-list>
  <part id="P1">
    <measure number="1">
      <attributes>
        <divisions>1</divisions>
        <key><fifths>0</fifths></key>
        <time><beats>4</beats><beat-type>4</beat-type></time>
        <clef><sign>G</sign><line>2</line></clef>
      </attributes>
      <note><pitch><step>C</step><octave>4</octave></pitch><duration>1</duration><voice>1</voice><type>quarter</type><staff>1</staff></note>
      <note><pitch><step>C</step><octave>4</octave></pitch><duration>1</duration><voice>1</voice><type>quarter</type><staff>1</staff></note>
      <note><pitch><step>D</step><octave>4</octave></pitch><duration>1</duration><voice>1</voice><type>quarter</type><staff>1</staff></note>
      <note><pitch><step>E</step><octave>4</octave></pitch><duration>1</duration><voice>1</voice><type>quarter</type><staff>1</staff></note>
      <backup><duration>4</duration></backup>
      <note><pitch><step>G</step><octave>3</octave></pitch><duration>1</duration><voice>2</voice><type>quarter</type><staff>1</staff></note>
      <note><pitch><step>A</step><octave>3</octave></pitch><duration>1</duration><voice>2</voice><type>quarter</type><staff>1</staff></note>
      <note><pitch><step>B</step><octave>3</octave></pitch><duration>1</duration><voice>2</voice><type>quarter</type><staff>1</staff></note>
      <note><pitch><step>C</step><octave>3</octave></pitch><duration>1</duration><voice>2</voice><type>quarter</type><staff>1</staff></note>
    </measure>
  </part>
</score-partwise>`;

const chordFixtureXml = `<?xml version="1.0" encoding="UTF-8"?>
<score-partwise version="3.1">
  <work><work-title>Chord Hover Fixture</work-title></work>
  <part-list>
    <score-part id="P1"><part-name>Piano</part-name></score-part>
  </part-list>
  <part id="P1">
    <measure number="1">
      <attributes>
        <divisions>1</divisions>
        <key><fifths>0</fifths></key>
        <time><beats>4</beats><beat-type>4</beat-type></time>
        <clef><sign>G</sign><line>2</line></clef>
      </attributes>
      <note><pitch><step>C</step><octave>4</octave></pitch><duration>1</duration><voice>1</voice><type>quarter</type><staff>1</staff></note>
      <note><chord/><pitch><step>E</step><octave>4</octave></pitch><duration>1</duration><voice>1</voice><type>quarter</type><staff>1</staff></note>
      <note><chord/><pitch><step>G</step><octave>4</octave></pitch><duration>1</duration><voice>1</voice><type>quarter</type><staff>1</staff></note>
      <note><pitch><step>D</step><octave>4</octave></pitch><duration>1</duration><voice>1</voice><type>quarter</type><staff>1</staff></note>
      <note><pitch><step>E</step><octave>4</octave></pitch><duration>1</duration><voice>1</voice><type>quarter</type><staff>1</staff></note>
      <note><pitch><step>F</step><octave>4</octave></pitch><duration>1</duration><voice>1</voice><type>quarter</type><staff>1</staff></note>
    </measure>
  </part>
</score-partwise>`;

const grandStaffFixtureXml = `<?xml version="1.0" encoding="UTF-8"?>
<score-partwise version="3.1">
  <work><work-title>Grand Staff Hover Fixture</work-title></work>
  <part-list>
    <score-part id="P1"><part-name>Piano</part-name></score-part>
  </part-list>
  <part id="P1">
    <measure number="1">
      <attributes>
        <divisions>1</divisions>
        <key><fifths>0</fifths></key>
        <time><beats>4</beats><beat-type>4</beat-type></time>
        <staves>2</staves>
        <clef number="1"><sign>G</sign><line>2</line></clef>
        <clef number="2"><sign>F</sign><line>4</line></clef>
      </attributes>
      <note><pitch><step>C</step><octave>5</octave></pitch><duration>1</duration><voice>1</voice><type>quarter</type><staff>1</staff></note>
      <note><pitch><step>D</step><octave>5</octave></pitch><duration>1</duration><voice>1</voice><type>quarter</type><staff>1</staff></note>
      <note><pitch><step>E</step><octave>5</octave></pitch><duration>1</duration><voice>1</voice><type>quarter</type><staff>1</staff></note>
      <note><pitch><step>F</step><octave>5</octave></pitch><duration>1</duration><voice>1</voice><type>quarter</type><staff>1</staff></note>
      <backup><duration>4</duration></backup>
      <note><pitch><step>C</step><octave>3</octave></pitch><duration>1</duration><voice>2</voice><type>quarter</type><staff>2</staff></note>
      <note><pitch><step>D</step><octave>3</octave></pitch><duration>1</duration><voice>2</voice><type>quarter</type><staff>2</staff></note>
      <note><pitch><step>E</step><octave>3</octave></pitch><duration>1</duration><voice>2</voice><type>quarter</type><staff>2</staff></note>
      <note><pitch><step>F</step><octave>3</octave></pitch><duration>1</duration><voice>2</voice><type>quarter</type><staff>2</staff></note>
    </measure>
  </part>
</score-partwise>`;

async function bootWithScore(page: Page, xml = polyphonicFixtureXml, fileName = 'polyphonic.musicxml') {
  await page.addInitScript(({ xml, fileName }: { xml: string; fileName: string }) => {
    const now = Date.now();
    localStorage.setItem('nex-note:debug', 'true');
    localStorage.setItem('nex-note:score-library', JSON.stringify([{
      id: 'seeded-score',
      name: fileName,
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
      name: fileName,
      timestamp: now,
      size: xml.length,
    }]));
    localStorage.setItem('nex-note:e2e-boot', JSON.stringify({ xml, filename: fileName }));
  }, { xml, fileName });
  await page.goto('/');
  await expect(page.getByTitle('Save as')).toBeVisible({ timeout: 15_000 });
  await expect(page.locator('[data-testid="score-canvas"] .vf-notehead').first()).toBeVisible({ timeout: 15_000 });
}

async function noteheadCenter(page: Page, index: number) {
  const box = await page.locator('[data-testid="score-canvas"] .vf-notehead').nth(index).boundingBox();
  if (!box) throw new Error(`Missing notehead at index ${index}`);
  return { x: box.x + (box.width / 2), y: box.y + (box.height / 2) };
}

async function noteheadCenters(page: Page) {
  return page.locator('[data-testid="score-canvas"] .vf-notehead').evaluateAll((elements) => (
    elements.map((element) => {
      const box = element.getBoundingClientRect();
      return { x: box.left + (box.width / 2), y: box.top + (box.height / 2) };
    })
  ));
}

function parseGhostPitch(value: string | null) {
  const match = value ? /^([A-G])(?:#|b|x|bb)?(\d+)$/.exec(value) : null;
  if (!match) return null;
  const stepMap: Record<string, number> = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 };
  return (Number.parseInt(match[2] ?? '0', 10) * 12) + (stepMap[match[1] ?? 'C'] ?? 0);
}

function parseLatestProxyPitch(logs: string[]) {
  for (let index = logs.length - 1; index >= 0; index -= 1) {
    const match = /proxy ghost pitch (\{.*\})/.exec(logs[index] ?? '');
    if (!match) continue;
    return JSON.parse(match[1] ?? '{}') as {
      rawTargetIdx: number;
      targetIdx: number;
      targetPitch: string;
      staffIndex: number;
    };
  }
  return null;
}

test('manual hover pitch fix verification', async ({ page }) => {
  const consoleMessages: string[] = [];
  page.on('console', (message) => {
    consoleMessages.push(message.text());
  });

  await bootWithScore(page);
  await page.keyboard.press('Escape');
  await page.keyboard.press('N');
  await page.keyboard.press('5');

  const targetSlot = await noteheadCenter(page, 2);
  const topPitch = await noteheadCenter(page, 3);
  const lowPitch = await noteheadCenter(page, 7);
  const hoverYs = [
    topPitch.y - 8,
    topPitch.y,
    (topPitch.y + lowPitch.y) / 2,
    lowPitch.y,
  ];

  const observations: Array<{ y: number; ghostMidi: number | null; rawTargetIdx: number | null; targetIdx: number | null; targetPitch: string | null }> = [];
  const ghost = page.getByTestId('ghost-note-preview');

  for (const y of hoverYs) {
    await page.mouse.move(targetSlot.x, y);
    await expect(ghost).toBeVisible();
    await page.waitForTimeout(150);
    const latest = parseLatestProxyPitch(consoleMessages);
    observations.push({
      y: Math.round(y),
      ghostMidi: parseGhostPitch(await ghost.getAttribute('data-ghost-pitch')),
      rawTargetIdx: latest?.rawTargetIdx ?? null,
      targetIdx: latest?.targetIdx ?? null,
      targetPitch: latest?.targetPitch ?? null,
    });
  }

  console.log(`hover observations ${JSON.stringify(observations)}`);
  const suspiciousLogs = consoleMessages.filter((entry) => (
    entry.includes('proxy ghost rawTargetIdx suspicious')
    || entry.includes('CLAMPED to C0')
  ));
  console.log(`hover suspicious logs ${JSON.stringify(suspiciousLogs)}`);

  expect(suspiciousLogs).toHaveLength(0);

  const ghostMidis = observations.map((entry) => entry.ghostMidi).filter((value): value is number => value !== null);
  expect(ghostMidis.length).toBe(observations.length);
  ghostMidis.forEach((value) => {
    expect(value).toBeGreaterThanOrEqual(36);
    expect(value).toBeLessThanOrEqual(72);
  });
  for (let index = 1; index < ghostMidis.length; index += 1) {
    expect(ghostMidis[index - 1]!).toBeGreaterThanOrEqual(ghostMidis[index]!);
  }
});

test('hover remains stable around an existing chord onset', async ({ page }) => {
  const consoleMessages: string[] = [];
  page.on('console', (message) => {
    consoleMessages.push(message.text());
  });

  await bootWithScore(page, chordFixtureXml, 'chord-hover.musicxml');
  await page.keyboard.press('Escape');
  await page.keyboard.press('N');
  await page.keyboard.press('5');

  const centers = await noteheadCenters(page);
  const sortedByY = [...centers].sort((a, b) => a.y - b.y);
  const chordStack = sortedByY.slice(0, 3);
  const chordX = chordStack.reduce((sum, point) => sum + point.x, 0) / chordStack.length;
  const hoverYs = chordStack
    .map((point) => point.y)
    .sort((a, b) => a - b);
  const ghost = page.getByTestId('ghost-note-preview');
  const observations: Array<{ y: number; ghostMidi: number | null; rawTargetIdx: number | null }> = [];

  for (const y of hoverYs) {
    await page.mouse.move(chordX, y);
    await expect(ghost).toBeVisible();
    await page.waitForTimeout(150);
    const latest = parseLatestProxyPitch(consoleMessages);
    observations.push({
      y: Math.round(y),
      ghostMidi: parseGhostPitch(await ghost.getAttribute('data-ghost-pitch')),
      rawTargetIdx: latest?.rawTargetIdx ?? null,
    });
  }

  console.log(`chord hover observations ${JSON.stringify(observations)}`);
  const suspiciousLogs = consoleMessages.filter((entry) => (
    entry.includes('proxy ghost rawTargetIdx suspicious')
    || entry.includes('CLAMPED to C0')
  ));
  console.log(`chord hover suspicious logs ${JSON.stringify(suspiciousLogs)}`);

  expect(suspiciousLogs).toHaveLength(0);
  const ghostMidis = observations.map((entry) => entry.ghostMidi).filter((value): value is number => value !== null);
  expect(ghostMidis.length).toBe(hoverYs.length);
  expect(Math.max(...ghostMidis) - Math.min(...ghostMidis)).toBeLessThanOrEqual(4);
});

test('ghost switches cleanly between treble and bass staff once the hysteresis threshold is crossed', async ({ page }) => {
  const consoleMessages: string[] = [];
  page.on('console', (message) => {
    consoleMessages.push(message.text());
  });

  await bootWithScore(page, grandStaffFixtureXml, 'grand-staff-hover.musicxml');
  await page.keyboard.press('Escape');
  await page.keyboard.press('N');
  await page.keyboard.press('5');

  const centers = await noteheadCenters(page);
  const sortedByY = [...centers].sort((a, b) => a.y - b.y);
  const treble = sortedByY.slice(0, 4);
  const bass = sortedByY.slice(-4);
  const targetX = treble[2]!.x;
  const startY = treble[1]!.y;
  const endY = bass[1]!.y;
  const hoverYs = Array.from({ length: 7 }, (_, index) => (
    startY + (((endY - startY) / 6) * index)
  ));

  const observations: Array<{ y: number; visible: boolean; staffIndex: number | null; rawTargetIdx: number | null; ghostMidi: number | null }> = [];
  const ghost = page.getByTestId('ghost-note-preview');

  for (const y of hoverYs) {
    await page.mouse.move(targetX, y);
    await page.waitForTimeout(180);
    const latest = parseLatestProxyPitch(consoleMessages);
    const visible = await ghost.count().then((count) => count > 0);
    observations.push({
      y: Math.round(y),
      visible,
      staffIndex: latest?.staffIndex ?? null,
      rawTargetIdx: latest?.rawTargetIdx ?? null,
      ghostMidi: visible ? parseGhostPitch(await ghost.getAttribute('data-ghost-pitch')) : null,
    });
  }

  console.log(`grand staff hover observations ${JSON.stringify(observations)}`);
  const suspiciousLogs = consoleMessages.filter((entry) => (
    entry.includes('proxy ghost rawTargetIdx suspicious')
    || entry.includes('CLAMPED to C0')
  ));
  console.log(`grand staff hover suspicious logs ${JSON.stringify(suspiciousLogs)}`);

  expect(suspiciousLogs).toHaveLength(0);
  const visibleObservations = observations.filter((entry) => entry.visible);
  expect(visibleObservations.length).toBeGreaterThanOrEqual(2);
  expect(visibleObservations[0]?.staffIndex).toBe(1);
  expect(visibleObservations[visibleObservations.length - 1]?.staffIndex).toBe(2);
  const rawIndices = visibleObservations.map((entry) => entry.rawTargetIdx).filter((value): value is number => value !== null);
  rawIndices.forEach((value) => {
    expect(value).toBeGreaterThanOrEqual(10);
    expect(value).toBeLessThanOrEqual(70);
  });
});

test('ghost stays inside the measure after inserting a note and re-rendering', async ({ page }) => {
  const consoleMessages: string[] = [];
  page.on('console', (message) => {
    consoleMessages.push(message.text());
  });

  await bootWithScore(page);
  await page.keyboard.press('Escape');
  await page.keyboard.press('N');
  await page.keyboard.press('5');

  const targetSlot = await noteheadCenter(page, 2);
  const ghost = page.getByTestId('ghost-note-preview');
  const measure = page.locator('[data-measure-number="1"]').first();

  await page.mouse.move(targetSlot.x, targetSlot.y - 10);
  await expect(ghost).toBeVisible();
  await page.mouse.down();
  await page.mouse.up();
  await page.waitForTimeout(350);

  const followupGhostMap = await scanGhostMapForMeasure(page, 1);
  const followupTarget = followupGhostMap.find((entry) => entry.ratio === 0.25) ?? followupGhostMap[0];
  if (!followupTarget) throw new Error(`Missing follow-up ghost target after insert: ${JSON.stringify(followupGhostMap)}`);
  await page.mouse.move(followupTarget.x, followupTarget.y);
  await expect(ghost).toBeVisible();
  await page.waitForTimeout(180);

  const ghostBox = await ghost.boundingBox();
  const measureBox = await measure.boundingBox();
  if (!ghostBox || !measureBox) {
    throw new Error('Missing ghost or measure box after insert');
  }

  const latest = parseLatestProxyPitch(consoleMessages);
  const suspiciousLogs = consoleMessages.filter((entry) => (
    entry.includes('proxy ghost rawTargetIdx suspicious')
    || entry.includes('CLAMPED to C0')
  ));
  console.log(`post-insert ghost latest ${JSON.stringify(latest)}`);
  console.log(`post-insert ghost boxes ${JSON.stringify({
    ghost: {
      left: Math.round(ghostBox.x),
      right: Math.round(ghostBox.x + ghostBox.width),
      top: Math.round(ghostBox.y),
    },
    measure: {
      left: Math.round(measureBox.x),
      right: Math.round(measureBox.x + measureBox.width),
      top: Math.round(measureBox.y),
    },
  })}`);
  console.log(`post-insert suspicious logs ${JSON.stringify(suspiciousLogs)}`);

  expect(suspiciousLogs).toHaveLength(0);
  expect(ghostBox.x + ghostBox.width).toBeGreaterThan(measureBox.x + 10);
  expect(ghostBox.x).toBeLessThan(measureBox.x + measureBox.width - 10);
});
