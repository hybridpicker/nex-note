import { mkdir } from 'node:fs/promises';
import path from 'node:path';

import { expect, test } from '@playwright/test';
import type { Page, Route } from '@playwright/test';
import { Midi } from '@tonejs/midi';

import { clickGhostMapEntry, expectGhostMapRatios, scanGhostMapForMeasure } from './support/ghost-map';
import { writeFailureArtifacts } from './support/failure-artifacts';
import { importMusicXmlToCore } from '../src/musicxml-adapter/import/import-musicxml.ts';

const ARTIFACT_DIR = path.join(process.cwd(), 'artifacts', 'qa', 'step-time-anchor-validation');

const WHOLE_REST_XML = `<?xml version="1.0" encoding="UTF-8"?>
<score-partwise version="3.1">
  <work><work-title>Step-Time Anchor Validation</work-title></work>
  <part-list><score-part id="P1"><part-name>Piano</part-name></score-part></part-list>
  <part id="P1">
    <measure number="1">
      <attributes>
        <divisions>1</divisions>
        <key><fifths>0</fifths></key>
        <time><beats>4</beats><beat-type>4</beat-type></time>
        <clef><sign>G</sign><line>2</line></clef>
      </attributes>
      <note><rest/><duration>4</duration><voice>1</voice><type>whole</type><staff>1</staff></note>
    </measure>
  </part>
</score-partwise>`;

const DUAL_STAFF_TAB_ANCHORS_XML = `<?xml version="1.0" encoding="UTF-8"?>
<score-partwise version="3.1">
  <work><work-title>Step-Time TAB Anchor Validation</work-title></work>
  <part-list><score-part id="P1"><part-name>Guitar</part-name></score-part></part-list>
  <part id="P1">
    <measure number="1">
      <attributes>
        <divisions>1</divisions>
        <key><fifths>0</fifths></key>
        <time><beats>4</beats><beat-type>4</beat-type></time>
        <staves>2</staves>
        <clef number="1"><sign>G</sign><line>2</line></clef>
        <staff-details number="2"><staff-type>tab</staff-type><staff-lines>6</staff-lines></staff-details>
        <clef number="2"><sign>TAB</sign><line>5</line></clef>
      </attributes>
      <note><pitch><step>C</step><octave>4</octave></pitch><duration>1</duration><voice>1</voice><type>quarter</type><staff>1</staff></note>
      <note><rest/><duration>1</duration><voice>1</voice><type>quarter</type><staff>1</staff></note>
      <note><pitch><step>E</step><octave>4</octave></pitch><duration>1</duration><voice>1</voice><type>quarter</type><staff>1</staff></note>
      <note><rest/><duration>1</duration><voice>1</voice><type>quarter</type><staff>1</staff></note>
      <backup><duration>4</duration></backup>
      <note><pitch><step>C</step><octave>4</octave></pitch><duration>1</duration><voice>1</voice><type>quarter</type><staff>2</staff><notations><technical><string>5</string><fret>3</fret></technical></notations></note>
      <note><rest/><duration>1</duration><voice>1</voice><type>quarter</type><staff>2</staff></note>
      <note><pitch><step>E</step><octave>4</octave></pitch><duration>1</duration><voice>1</voice><type>quarter</type><staff>2</staff><notations><technical><string>2</string><fret>5</fret></technical></notations></note>
      <note><rest/><duration>1</duration><voice>1</voice><type>quarter</type><staff>2</staff></note>
    </measure>
  </part>
</score-partwise>`;

type StaffEventSummary = {
  start: number;
  kind: 'note' | 'rest';
  pitch: string | null;
  durationType: string | null;
  guitar: string | null;
};

function buildMidiBody() {
  const midi = new Midi();
  midi.header.setTempo(120);
  const track = midi.addTrack();
  track.addNote({ midi: 60, time: 0, duration: 0.45, velocity: 0.8 });
  return Buffer.from(midi.toArray());
}

async function mockStableRoutes(page: Page) {
  await page.route('**/api/midi', async (route: Route) => {
    await route.fulfill({
      status: 200,
      contentType: 'audio/midi',
      body: buildMidiBody(),
    });
  });

  await page.route('**/api/ollama-models', async (route: Route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ models: [] }),
    });
  });
}

async function bootWithScore(page: Page, xml: string, filename: string) {
  await page.addInitScript(({ bootXml, fileName }: { bootXml: string; fileName: string }) => {
    const now = Date.now();
    localStorage.setItem('nex-note:score-library', JSON.stringify([{
      id: 'step-time-anchor-validation',
      name: fileName,
      xml: bootXml,
      format: 'musicxml',
      sizeBytes: bootXml.length,
      measures: 1,
      parts: 1,
      favorite: false,
      createdAt: now,
      updatedAt: now,
      lastOpenedAt: now,
    }]));
    localStorage.setItem('nex-note:e2e-boot', JSON.stringify({ xml: bootXml, filename: fileName }));
  }, { bootXml: xml, fileName: filename });
  await page.addInitScript(() => {
    document.documentElement.style.scrollBehavior = 'auto';
  });
  await page.goto('/?debug=true&visual-debug=true');
  await expect(page.getByTitle('Save as')).toBeVisible({ timeout: 15_000 });
  await expect(page.locator('[data-testid="score-canvas"] svg')).toBeVisible({ timeout: 15_000 });
  await expect(page.locator('[data-measure-number="1"]').first()).toBeVisible({ timeout: 15_000 });
  await page.getByTestId('score-viewport').focus();
}

async function readCurrentXml(page: Page) {
  const xml = await page.evaluate(() => (
    (window as typeof window & {
      __NEX_NOTE_E2E_STATE__?: { xml?: string };
    }).__NEX_NOTE_E2E_STATE__?.xml ?? ''
  ));
  if (!xml) throw new Error('Missing E2E XML state');
  return xml;
}

async function selectedCursor(page: Page) {
  return page.evaluate(() => {
    const selected = (window as typeof window & {
      __NEX_NOTE_E2E_STATE__?: {
        selectedNote?: {
          measureNumber: number;
          staffIndex: number;
          voiceId: number;
          timestampNum: number;
          timestampDen: number;
          isRest?: boolean;
          guitar?: { string: number; fret: number } | null;
        } | null;
      };
    }).__NEX_NOTE_E2E_STATE__?.selectedNote ?? null;
    return selected ? {
      measureNumber: selected.measureNumber,
      staffIndex: selected.staffIndex,
      voiceId: selected.voiceId,
      timestampNum: selected.timestampNum,
      timestampDen: selected.timestampDen,
      isRest: Boolean(selected.isRest),
      guitar: selected.guitar ? `${selected.guitar.string}/${selected.guitar.fret}` : null,
    } : null;
  });
}

function summarizeStaff(xml: string, staffIndex = 1): StaffEventSummary[] {
  const core = importMusicXmlToCore(xml);
  const staff = core.score.parts[0]?.staves[staffIndex - 1];
  const measure = staff?.measures[0];
  const voice = measure?.voices.find((entry) => entry.voiceId === 1);
  return (voice?.events ?? [])
    .slice()
    .sort((left, right) => (
      (left.timestampNum / Math.max(left.timestampDen, 1))
      - (right.timestampNum / Math.max(right.timestampDen, 1))
    ))
    .map((event) => ({
      start: event.timestampNum / Math.max(event.timestampDen, 1),
      kind: event.kind === 'note' ? 'note' : 'rest',
      pitch: event.kind === 'note'
        ? `${event.pitch.step}${event.pitch.alter === 1 ? '#' : event.pitch.alter === -1 ? 'b' : ''}${event.pitch.octave}`
        : null,
      durationType: event.durationType ?? null,
      guitar: event.kind === 'note' && event.guitar
        ? `${event.guitar.string}/${event.guitar.fret}`
        : null,
    }));
}

async function expectStaff(page: Page, staffIndex: number, expected: StaffEventSummary[]) {
  await expect.poll(async () => summarizeStaff(await readCurrentXml(page), staffIndex), {
    timeout: 7_500,
  }).toEqual(expected);
}

async function saveScreenshot(page: Page, name: string) {
  await mkdir(ARTIFACT_DIR, { recursive: true });
  await page.screenshot({
    path: path.join(ARTIFACT_DIR, name),
    fullPage: false,
  });
}

async function hoverBetweenFirstTwoGhostAnchors(page: Page) {
  const ghostMap = await scanGhostMapForMeasure(page, 1);
  expectGhostMapRatios(ghostMap, [0, 0.25, 0.5]);
  const beatOne = ghostMap[0]!;
  const beatTwo = ghostMap[1]!;
  await page.mouse.move((beatOne.x + beatTwo.x) / 2, (beatOne.y + beatTwo.y) / 2);
  return page.evaluate(() => {
    const ghost = document.querySelector<HTMLElement>('[data-testid="ghost-note-preview"]');
    if (!ghost || ghost.offsetParent === null) return null;
    return ghost.dataset.ghostTimestamp ?? null;
  });
}

async function setGuitarString(page: Page, stringNumber: 1 | 2 | 3 | 4 | 5 | 6) {
  await page.keyboard.down('Alt');
  await page.keyboard.press(String(stringNumber));
  await page.keyboard.up('Alt');
}

test.beforeEach(async ({ page }) => {
  await mockStableRoutes(page);
});

test.afterEach(async ({ page }, testInfo) => {
  await writeFailureArtifacts(page, testInfo);
});

test('standard step-time note input only targets real note/rest anchors and pads remaining rests', async ({ page }) => {
  await bootWithScore(page, WHOLE_REST_XML, 'step-time-standard.musicxml');
  await expectStaff(page, 1, [
    { start: 0, kind: 'rest', pitch: null, durationType: 'whole', guitar: null },
  ]);
  await saveScreenshot(page, '01-initial-whole-rest.png');

  await page.keyboard.press('Escape');
  await page.keyboard.press('N');
  await page.keyboard.press('5');
  await page.keyboard.press('C');

  await expectStaff(page, 1, [
    { start: 0, kind: 'note', pitch: 'C4', durationType: 'quarter', guitar: null },
    { start: 0.25, kind: 'rest', pitch: null, durationType: 'quarter', guitar: null },
    { start: 0.5, kind: 'rest', pitch: null, durationType: 'half', guitar: null },
  ]);
  await expect.poll(async () => selectedCursor(page)).toMatchObject({
    measureNumber: 1,
    staffIndex: 1,
    timestampNum: 1,
    timestampDen: 4,
    isRest: true,
  });
  await saveScreenshot(page, '02-after-beat-1-quarter-note.png');

  const xmlBeforeInvalidHover = await readCurrentXml(page);
  const hoverTimestamp = await hoverBetweenFirstTwoGhostAnchors(page);
  expect(hoverTimestamp).not.toBe('1/8');
  expect(await readCurrentXml(page)).toBe(xmlBeforeInvalidHover);
  await saveScreenshot(page, '03-invalid-beat-1-5-hover-restricted.png');

  const beatThree = (await scanGhostMapForMeasure(page, 1))
    .find((entry) => Math.abs(entry.ratio - 0.5) < 0.001);
  expect(beatThree).toBeTruthy();
  await clickGhostMapEntry(page, beatThree!);

  await expect.poll(async () => summarizeStaff(await readCurrentXml(page), 1).map((event) => ({
    start: event.start,
    kind: event.kind,
    durationType: event.durationType,
    pitchPresent: Boolean(event.pitch),
  }))).toEqual([
    { start: 0, kind: 'note', durationType: 'quarter', pitchPresent: true },
    { start: 0.25, kind: 'rest', durationType: 'quarter', pitchPresent: false },
    { start: 0.5, kind: 'note', durationType: 'quarter', pitchPresent: true },
    { start: 0.75, kind: 'rest', durationType: 'quarter', pitchPresent: false },
  ]);
  await saveScreenshot(page, '04-after-beat-3-quarter-note.png');
});

test('tablature fret entry follows the same rhythmic anchors and mirrors notation pitch', async ({ page }) => {
  await bootWithScore(page, DUAL_STAFF_TAB_ANCHORS_XML, 'step-time-tab.musicxml');

  const firstFret = page.locator('svg text').filter({ hasText: /^3$/ }).first();
  await firstFret.click();
  await expect.poll(async () => selectedCursor(page)).toMatchObject({
    measureNumber: 1,
    staffIndex: 2,
    timestampNum: 0,
    timestampDen: 4,
    isRest: false,
    guitar: '5/3',
  });

  await page.keyboard.press('N');
  await page.keyboard.press('5');
  await page.getByTitle('Guitar tab input (TAB button)').click();
  await setGuitarString(page, 3);
  await page.keyboard.press('5');

  await expectStaff(page, 1, [
    { start: 0, kind: 'note', pitch: 'C4', durationType: 'quarter', guitar: null },
    { start: 0.25, kind: 'rest', pitch: null, durationType: 'quarter', guitar: null },
    { start: 0.5, kind: 'note', pitch: 'E4', durationType: 'quarter', guitar: null },
    { start: 0.75, kind: 'rest', pitch: null, durationType: 'quarter', guitar: null },
  ]);
  await expectStaff(page, 2, [
    { start: 0, kind: 'note', pitch: 'C4', durationType: 'quarter', guitar: '3/5' },
    { start: 0.25, kind: 'rest', pitch: null, durationType: 'quarter', guitar: null },
    { start: 0.5, kind: 'note', pitch: 'E4', durationType: 'quarter', guitar: '2/5' },
    { start: 0.75, kind: 'rest', pitch: null, durationType: 'quarter', guitar: null },
  ]);
  await saveScreenshot(page, '05-after-tab-beat-1-fret-5.png');

  await page.keyboard.press('ArrowRight');
  await expect.poll(async () => selectedCursor(page)).toMatchObject({
    measureNumber: 1,
    staffIndex: 2,
    timestampNum: 1,
    timestampDen: 4,
    isRest: true,
  });
  await setGuitarString(page, 4);
  await page.keyboard.press('7');

  await expectStaff(page, 1, [
    { start: 0, kind: 'note', pitch: 'C4', durationType: 'quarter', guitar: null },
    { start: 0.25, kind: 'note', pitch: 'A3', durationType: 'quarter', guitar: null },
    { start: 0.5, kind: 'note', pitch: 'E4', durationType: 'quarter', guitar: null },
    { start: 0.75, kind: 'rest', pitch: null, durationType: 'quarter', guitar: null },
  ]);
  await expectStaff(page, 2, [
    { start: 0, kind: 'note', pitch: 'C4', durationType: 'quarter', guitar: '3/5' },
    { start: 0.25, kind: 'note', pitch: 'A3', durationType: 'quarter', guitar: '4/7' },
    { start: 0.5, kind: 'note', pitch: 'E4', durationType: 'quarter', guitar: '2/5' },
    { start: 0.75, kind: 'rest', pitch: null, durationType: 'quarter', guitar: null },
  ]);
  await saveScreenshot(page, '06-after-tab-beat-2-fret-7.png');

  await expect.poll(async () => selectedCursor(page)).toMatchObject({
    measureNumber: 1,
    staffIndex: 2,
    timestampNum: 2,
    timestampDen: 4,
  });
  await page.keyboard.press('ArrowLeft');
  await expect.poll(async () => selectedCursor(page)).toMatchObject({
    staffIndex: 2,
    timestampNum: 1,
    timestampDen: 4,
  });
  await page.keyboard.press('ArrowLeft');
  await expect.poll(async () => selectedCursor(page)).toMatchObject({
    staffIndex: 2,
    timestampNum: 0,
    timestampDen: 4,
  });
  await page.keyboard.press('ArrowRight');
  await expect.poll(async () => selectedCursor(page)).toMatchObject({
    staffIndex: 2,
    timestampNum: 1,
    timestampDen: 4,
  });
});
