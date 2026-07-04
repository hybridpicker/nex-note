import fs from 'node:fs';
import path from 'node:path';

import { expect, test } from '@playwright/test';
import type { Page, Route } from '@playwright/test';
import { Midi } from '@tonejs/midi';
import { writeFailureArtifacts } from './support/failure-artifacts';
import { clickGhostMapEntry, expectGhostMapRatios, scanGhostMapForMeasure } from './support/ghost-map';
import { createNewScoreXml } from '../lib/new-score.ts';
import { importMusicXmlToCore } from '../src/musicxml-adapter/import/import-musicxml.ts';

const fixturePath = path.join(process.cwd(), 'e2e', 'fixtures', 'simple.musicxml');
const fixtureBuffer = fs.readFileSync(fixturePath);
const fixtureXml = fixtureBuffer.toString('utf8');
const MOD = 'Control';

async function expectedShortcutHint(page: Page, shortcut: string) {
  const isMac = await page.evaluate(() => /\b(Mac|iPhone|iPad|iPod)/i.test(navigator.platform));
  const commandLabel = isMac ? 'Cmd' : 'Ctrl';
  const optionLabel = isMac ? 'Option' : 'Alt';
  return shortcut
    .replace(/\bCmd\/Ctrl\b/g, commandLabel)
    .replace(/\bCtrl\/Cmd\b/g, commandLabel)
    .replace(/\bCmd\b/g, commandLabel)
    .replace(/\bOption\/Alt\b/g, optionLabel)
    .replace(/\bAlt\/Option\b/g, optionLabel)
    .replace(/\bOption\b/g, optionLabel);
}

function buildPolyphonicFixtureXml() {
  return `<?xml version="1.0" encoding="UTF-8"?>
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
    <measure number="2">
      <note><pitch><step>F</step><octave>4</octave></pitch><duration>1</duration><voice>1</voice><type>quarter</type><staff>1</staff></note>
      <note><pitch><step>G</step><octave>4</octave></pitch><duration>1</duration><voice>1</voice><type>quarter</type><staff>1</staff></note>
      <note><pitch><step>A</step><octave>4</octave></pitch><duration>1</duration><voice>1</voice><type>quarter</type><staff>1</staff></note>
      <note><pitch><step>B</step><octave>4</octave></pitch><duration>1</duration><voice>1</voice><type>quarter</type><staff>1</staff></note>
      <backup><duration>4</duration></backup>
      <note><pitch><step>D</step><octave>3</octave></pitch><duration>1</duration><voice>2</voice><type>quarter</type><staff>1</staff></note>
      <note><pitch><step>E</step><octave>3</octave></pitch><duration>1</duration><voice>2</voice><type>quarter</type><staff>1</staff></note>
      <note><pitch><step>F</step><octave>3</octave></pitch><duration>1</duration><voice>2</voice><type>quarter</type><staff>1</staff></note>
      <note><pitch><step>G</step><octave>3</octave></pitch><duration>1</duration><voice>2</voice><type>quarter</type><staff>1</staff></note>
    </measure>
  </part>
</score-partwise>`;
}

function buildTwoStaffCrossStaffRangeFixtureXml() {
  return `<?xml version="1.0" encoding="UTF-8"?>
<score-partwise version="3.1">
  <work><work-title>Cross Staff Range Shortcut Fixture</work-title></work>
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
      <note><rest/><duration>2</duration><voice>1</voice><type>half</type><staff>1</staff></note>
      <backup><duration>4</duration></backup>
      <note><rest/><duration>1</duration><voice>1</voice><type>quarter</type><staff>2</staff></note>
      <note><rest/><duration>1</duration><voice>1</voice><type>quarter</type><staff>2</staff></note>
      <note><rest/><duration>2</duration><voice>1</voice><type>half</type><staff>2</staff></note>
    </measure>
  </part>
</score-partwise>`;
}

function buildTwoStaffCrossStaffChordFixtureXml() {
  return `<?xml version="1.0" encoding="UTF-8"?>
<score-partwise version="3.1">
  <work><work-title>Cross Staff Chord Shortcut Fixture</work-title></work>
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
      <note><chord/><pitch><step>E</step><octave>5</octave></pitch><duration>1</duration><voice>1</voice><type>quarter</type><staff>1</staff></note>
      <note><rest/><duration>3</duration><voice>1</voice><type>half</type><dot/><staff>1</staff></note>
      <backup><duration>4</duration></backup>
      <note><rest/><duration>1</duration><voice>1</voice><type>quarter</type><staff>2</staff></note>
      <note><rest/><duration>3</duration><voice>1</voice><type>half</type><dot/><staff>2</staff></note>
    </measure>
  </part>
</score-partwise>`;
}

function buildChordDeleteFixtureXml() {
  return `<?xml version="1.0" encoding="UTF-8"?>
<score-partwise version="3.1">
  <work><work-title>Chord Tone Delete Fixture</work-title></work>
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
      <note><pitch><step>G</step><octave>4</octave></pitch><duration>1</duration><voice>1</voice><type>quarter</type><staff>1</staff></note>
      <note><rest/><duration>2</duration><voice>1</voice><type>half</type><staff>1</staff></note>
    </measure>
  </part>
</score-partwise>`;
}

function buildQuintupletFixtureXml() {
  return `<?xml version="1.0" encoding="UTF-8"?>
<score-partwise version="3.1">
  <work><work-title>Quintuplet Browser Fixture</work-title></work>
  <part-list>
    <score-part id="P1"><part-name>Flute</part-name></score-part>
  </part-list>
  <part id="P1">
    <measure number="1">
      <attributes>
        <divisions>2</divisions>
        <key><fifths>0</fifths></key>
        <time><beats>4</beats><beat-type>4</beat-type></time>
        <clef><sign>G</sign><line>2</line></clef>
      </attributes>
      <note><pitch><step>C</step><octave>5</octave></pitch><duration>1</duration><voice>1</voice><type>eighth</type><staff>1</staff></note>
      <note><pitch><step>D</step><octave>5</octave></pitch><duration>1</duration><voice>1</voice><type>eighth</type><staff>1</staff></note>
      <note><pitch><step>E</step><octave>5</octave></pitch><duration>1</duration><voice>1</voice><type>eighth</type><staff>1</staff></note>
      <note><pitch><step>F</step><octave>5</octave></pitch><duration>1</duration><voice>1</voice><type>eighth</type><staff>1</staff></note>
      <note><pitch><step>G</step><octave>5</octave></pitch><duration>1</duration><voice>1</voice><type>eighth</type><staff>1</staff></note>
    </measure>
</part>
</score-partwise>`;
}

function buildSingleBFixtureXml() {
  return `<?xml version="1.0" encoding="UTF-8"?>
<score-partwise version="3.1">
  <work><work-title>Mouse Drag Fixture</work-title></work>
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
      <note><pitch><step>B</step><octave>4</octave></pitch><duration>1</duration><voice>1</voice><type>quarter</type><staff>1</staff></note>
      <note><rest/><duration>1</duration><voice>1</voice><type>quarter</type><staff>1</staff></note>
      <note><rest/><duration>1</duration><voice>1</voice><type>quarter</type><staff>1</staff></note>
      <note><rest/><duration>1</duration><voice>1</voice><type>quarter</type><staff>1</staff></note>
    </measure>
  </part>
</score-partwise>`;
}

function buildFourQuarterFixtureXml() {
  return `<?xml version="1.0" encoding="UTF-8"?>
<score-partwise version="3.1">
  <work><work-title>Mouse Activation Fixture</work-title></work>
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
      <note><pitch><step>D</step><octave>4</octave></pitch><duration>1</duration><voice>1</voice><type>quarter</type><staff>1</staff></note>
      <note><pitch><step>E</step><octave>4</octave></pitch><duration>1</duration><voice>1</voice><type>quarter</type><staff>1</staff></note>
      <note><pitch><step>F</step><octave>4</octave></pitch><duration>1</duration><voice>1</voice><type>quarter</type><staff>1</staff></note>
    </measure>
  </part>
</score-partwise>`;
}

function buildLongFixtureXml(measures = 36) {
  const measureXml = Array.from({ length: measures }, (_, index) => {
    const measureNumber = index + 1;
    const attributes = measureNumber === 1 ? `
      <attributes>
        <divisions>1</divisions>
        <key><fifths>0</fifths></key>
        <time><beats>4</beats><beat-type>4</beat-type></time>
        <clef><sign>G</sign><line>2</line></clef>
      </attributes>` : '';
    const rehearsal = measureNumber % 8 === 1 ? `
      <direction placement="above">
        <direction-type>
          <rehearsal>${String.fromCharCode(64 + Math.min(Math.ceil(measureNumber / 8), 26))}</rehearsal>
        </direction-type>
      </direction>` : '';
    return `
      <measure number="${measureNumber}">
        ${attributes}
        ${rehearsal}
        <note>
          <pitch><step>C</step><octave>4</octave></pitch>
          <duration>1</duration>
          <voice>1</voice>
          <type>quarter</type>
          <staff>1</staff>
        </note>
        <note>
          <pitch><step>D</step><octave>4</octave></pitch>
          <duration>1</duration>
          <voice>1</voice>
          <type>quarter</type>
          <staff>1</staff>
        </note>
        <note>
          <pitch><step>E</step><octave>4</octave></pitch>
          <duration>1</duration>
          <voice>1</voice>
          <type>quarter</type>
          <staff>1</staff>
        </note>
        <note>
          <pitch><step>F</step><octave>4</octave></pitch>
          <duration>1</duration>
          <voice>1</voice>
          <type>quarter</type>
          <staff>1</staff>
        </note>
      </measure>`;
  }).join('\n');

  return `<?xml version="1.0" encoding="UTF-8"?>
<score-partwise version="3.1">
  <work>
    <work-title>Long Fixture</work-title>
  </work>
  <identification>
    <creator type="composer">Codex</creator>
  </identification>
  <part-list>
    <score-part id="P1">
      <part-name>Piano</part-name>
      <part-abbreviation>Pno.</part-abbreviation>
    </score-part>
  </part-list>
  <part id="P1">
    ${measureXml}
  </part>
</score-partwise>`;
}

function buildBlankPianoFixtureXml(measures = 2) {
  return createNewScoreXml({
    instrumentIds: ['piano'],
    title: 'Blank Piano Browser Fixture',
    subtitle: '',
    composer: '',
    lyricist: '',
    copyright: '',
    keySignatureId: 'c-major',
    timeBeats: 4,
    timeBeatType: 4,
    tempo: {
      bpm: 120,
      beatUnit: 'quarter',
      showMarking: false,
    },
    measureCount: measures,
    pickup: {
      enabled: false,
      beats: 1,
      beatType: 4,
    },
  });
}

function buildMidiBody() {
  const midi = new Midi();
  midi.header.setTempo(96);
  const track = midi.addTrack();
  track.addNote({ midi: 60, time: 0, duration: 0.5, velocity: 0.8 });
  track.addNote({ midi: 62, time: 0.5, duration: 0.5, velocity: 0.8 });
  track.addNote({ midi: 64, time: 1.0, duration: 0.5, velocity: 0.8 });
  track.addNote({ midi: 65, time: 1.5, duration: 0.5, velocity: 0.8 });
  return Buffer.from(midi.toArray());
}

async function installPlaybackStubs(page: Page) {
  await page.addInitScript(() => {
    (window as typeof window & {
      __NEX_NOTE_E2E_PREVIEW_STARTS__?: Array<{ note: string | number }>;
      __NEX_NOTE_E2E_INSTRUMENT_LOADER__?: () => Promise<{ start: (note: string | number) => void; stop: () => void }>;
    }).__NEX_NOTE_E2E_PREVIEW_STARTS__ = [];
    (window as typeof window & {
      __NEX_NOTE_E2E_PREVIEW_STARTS__?: Array<{ note: string | number }>;
      __NEX_NOTE_E2E_INSTRUMENT_LOADER__?: () => Promise<{ start: (note: string | number) => void; stop: () => void }>;
    }).__NEX_NOTE_E2E_INSTRUMENT_LOADER__ = async () => ({
      start(note) {
        (window as typeof window & {
          __NEX_NOTE_E2E_PREVIEW_STARTS__?: Array<{ note: string | number }>;
        }).__NEX_NOTE_E2E_PREVIEW_STARTS__?.push({ note });
      },
      stop() {},
    });
  });
}

async function mockStableRoutes(page: Page) {
  const midiBody = buildMidiBody();

  await page.route('**/api/midi', async (route: Route) => {
    await route.fulfill({
      status: 200,
      contentType: 'audio/midi',
      body: midiBody,
    });
  });

  await page.route('**/api/ollama-models', async (route: Route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        models: [
          { id: 'gemma4:31b', label: 'Gemma 4 31B' },
          { id: 'llama3:8b', label: 'Llama 3 8B' },
        ],
      }),
    });
  });
}

async function bootWithScore(
  page: Page,
  name = 'simple.musicxml',
  xml = fixtureXml,
  url = '/',
) {
  await page.addInitScript(({ xml, fileName }: { xml: string; fileName: string }) => {
    if (window.top !== window) return;
    if (localStorage.getItem('nex-note:e2e-boot')) return;
    const now = Date.now();
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
  }, { xml, fileName: name });
  await page.addInitScript(() => {
    document.documentElement.style.scrollBehavior = 'auto';
  });
  await page.evaluate(({ xml, fileName }: { xml: string; fileName: string }) => {
    localStorage.setItem('nex-note:e2e-boot', JSON.stringify({ xml, filename: fileName }));
  }, { xml, fileName: name }).catch(() => {});
  await page.goto(url);
  await expect(page.getByTitle('Save as')).toBeVisible({ timeout: 15_000 });
}

async function waitForRenderedScore(page: Page) {
  await expect(page.locator('[data-testid="score-canvas"] .vf-notehead').first()).toBeVisible({ timeout: 15_000 });
  await page.getByTestId('score-viewport').focus();
}

async function waitForRenderedLayout(page: Page) {
  await expect(page.locator('[data-measure-number]').first()).toBeVisible({ timeout: 15_000 });
  await page.getByTestId('score-viewport').focus();
}

async function openNotationSection(page: Page, name: RegExp | string) {
  const section = page.getByRole('button', { name });
  if ((await section.getAttribute('aria-expanded')) !== 'true') {
    await section.click();
  }
}

async function openInspectorSection(page: Page, name: RegExp | string) {
  const section = page.locator('button[aria-controls^="score-inspector-section-"]').filter({ hasText: name }).first();
  if ((await section.getAttribute('aria-expanded')) !== 'true') {
    await section.click();
  }
}

async function clickRenderedNotehead(
  page: Page,
  index: number,
  modifiers?: Array<'Shift' | 'Meta' | 'Control' | 'Alt'>,
) {
  await page.locator('[data-testid="score-canvas"] .vf-notehead').nth(index).click({
    force: true,
    modifiers,
  });
}

async function noteheadCenter(page: Page, index: number) {
  const box = await page.locator('[data-testid="score-canvas"] .vf-notehead').nth(index).boundingBox();
  if (!box) throw new Error(`Missing notehead at index ${index}`);
  return {
    x: box.x + box.width / 2,
    y: box.y + box.height / 2,
  };
}

async function measureOverlayBox(page: Page, measureNumber: number) {
  const boxes = await page.locator(`[data-measure-number="${measureNumber}"]`).evaluateAll((elements) => (
    elements.map((element) => {
      const rect = element.getBoundingClientRect();
      return {
        x: rect.x,
        y: rect.y,
        width: rect.width,
        height: rect.height,
      };
    })
  ));
  if (boxes.length === 0) throw new Error(`Missing measure overlay for measure ${measureNumber}`);
  return boxes.sort((left, right) => right.height - left.height || right.width - left.width)[0]!;
}

function parseGhostPitch(value: string | null) {
  if (!value) return null;
  const match = /^([A-G])(?:#|b|x|bb)?(\d+)$/.exec(value);
  if (!match) return null;
  return { step: match[1], octave: Number.parseInt(match[2] ?? '0', 10) };
}

function parseTimestampRatio(value: string | null) {
  if (!value) return null;
  const [numText, denText] = value.split('/');
  const num = Number.parseInt(numText ?? '', 10);
  const den = Number.parseInt(denText ?? '', 10);
  if (!Number.isFinite(num) || !Number.isFinite(den) || den <= 0) return null;
  return num / den;
}

async function readE2EState(page: Page) {
  return page.evaluate(() => (
    (window as typeof window & {
      __NEX_NOTE_E2E_STATE__?: {
        xml: string;
        filename: string;
        noteInputMode: boolean;
        chordInputMode: boolean;
        selectedDuration: string;
        selectedVoice: number;
        selectionCount: number;
        canUndo: boolean;
        canRedo: boolean;
        historyDepth: number;
        playbackState: string;
        currentMeasure: number | null;
        selectedNote: {
          measureNumber: number;
          staffIndex: number;
          voiceId: number;
          timestampNum: number;
          timestampDen: number;
          step?: string;
          octave?: number;
          alter?: number;
          isRest?: boolean;
        } | null;
        noteInputAnchor: {
          measureNumber: number;
          staffIndex: number;
          voiceId: number;
          timestampNum: number;
          timestampDen: number;
          step?: string;
          octave?: number;
          alter?: number;
          isRest?: boolean;
        } | null;
      };
    }).__NEX_NOTE_E2E_STATE__ ?? null
  ));
}

async function readCurrentXml(page: Page) {
  const state = await readE2EState(page);
  if (!state?.xml) throw new Error('Missing E2E XML state');
  return state.xml;
}

async function readCurrentCore(page: Page) {
  return importMusicXmlToCore(await page.evaluate(() => (
    (window as typeof window & {
      __NEX_NOTE_E2E_STATE__?: { xml: string };
    }).__NEX_NOTE_E2E_STATE__?.xml ?? ''
  )));
}

test.beforeEach(async ({ page }) => {
  await installPlaybackStubs(page);
  await mockStableRoutes(page);
});

test.afterEach(async ({ page }, testInfo) => {
  await writeFailureArtifacts(page, testInfo);
});

test('debug mode boots without hydration or clipboard permission errors', async ({ page }) => {
  const debugBootErrors: string[] = [];
  page.on('console', (message) => {
    if (message.type() !== 'error' && message.type() !== 'warning') return;
    const text = message.text();
    if (/Hydration failed|server rendered HTML|NotAllowedError|writeText|Clipboard/i.test(text)) {
      debugBootErrors.push(text);
    }
  });
  page.on('pageerror', (error) => {
    const text = error.message;
    if (/Hydration failed|server rendered HTML|NotAllowedError|writeText|Clipboard/i.test(text)) {
      debugBootErrors.push(text);
    }
  });

  await page.goto('/?debug=true');
  await expect(page.getByRole('heading', { name: 'Welcome to nex-note' })).toBeVisible({ timeout: 15_000 });
  await expect(page.getByTitle('Report bug')).toBeVisible();
  await expect.poll(() => debugBootErrors).toEqual([]);
});

test('new score dialog creates a configured score in the browser @smoke', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: 'Choose template' }).click();
  await expect(page.getByRole('heading', { name: 'Set up your score' })).toBeVisible();
  await page.getByRole('button', { name: 'Choose instruments' }).click();

  await page.getByLabel('Search instruments').fill('violin');
  await page.getByRole('button', { name: /Violin/ }).first().click();
  await page.getByRole('button', { name: /Violin/ }).first().click();
  await page.getByLabel('Search instruments').fill('cello');
  await page.getByRole('button', { name: /Cello/ }).click();
  await page.getByLabel('Search instruments').fill('viola');
  await page.getByRole('button', { name: /Viola/ }).click();

  await page.getByRole('button', { name: 'Score information' }).click();
  await page.getByRole('textbox', { name: 'Title', exact: true }).fill('Spring Sketch');
  await page.getByRole('textbox', { name: 'Composer', exact: true }).fill('Lukas');
  await page.getByLabel('Key signature').selectOption('d-major');
  await page.getByLabel('Time beats').fill('3');
  await page.getByLabel('Time beat type').selectOption('4');
  await page.getByLabel('Tempo bpm').fill('84');
  await page.getByLabel('Show tempo marking').check();
  await page.getByLabel('Initial number of measures').fill('8');
  await page.getByLabel('Create pickup measure').check();
  await page.getByLabel('Pickup beats').fill('1');
  await page.getByLabel('Pickup beat type').selectOption('4');
  await page.getByRole('button', { name: 'Create score' }).click();

  await expect(page.getByTitle('Save as')).toBeVisible({ timeout: 15_000 });
  await expect(page.getByText('Spring Sketch.musicxml')).toBeVisible();

  await page.getByRole('button', { name: 'Inspector' }).click();
  await expect(page.getByRole('textbox', { name: 'Title', exact: true })).toHaveValue('Spring Sketch');
  await expect(page.getByRole('textbox', { name: 'Composer', exact: true })).toHaveValue('Lukas');

  await page.getByTitle('Library').click();
  await expect(page.getByRole('button', { name: /Spring Sketch\.musicxml/ })).toBeVisible();
});

test('command center explains disabled commands and indexes their reasons @smoke', async ({ page }) => {
  await page.goto('/');
  const commandsButton = page.getByTitle('Commands (Cmd/Ctrl+K)');
  await commandsButton.click();

  const commandSearch = page.getByPlaceholder('Search commands, exports, notation tools...');
  await expect(commandSearch).toBeFocused();
  await page.keyboard.press('Escape');
  await expect(commandsButton).toBeFocused();

  await commandsButton.click();
  await expect(commandSearch).toBeFocused();

  await commandSearch.fill('create new score');
  await expect(page.getByRole('button', { name: /Create new score/ })).toContainText(await expectedShortcutHint(page, 'Cmd N'));

  await commandSearch.fill('score create');
  await expect(page.getByRole('button', { name: /Create new score/ })).toBeVisible();

  await commandSearch.fill('save');
  await expect(page.getByRole('button', { name: /Save/ }).first()).toContainText('Unavailable: Open or create a score first');
  await expect(page.getByRole('button', { name: /Save/ }).first()).toHaveAttribute('title', /Save .*Unavailable: Open or create a score first/);
  await expect(page.getByText('Unavailable').first()).toBeVisible();

  await commandSearch.fill('stop playback');
  await expect(page.getByRole('button', { name: /Stop playback/ })).toContainText('Unavailable: Open or create a score first');

  await commandSearch.fill('metronome');
  await expect(page.getByRole('button', { name: /Turn metronome on/ })).toContainText('Unavailable: Open or create a score first');

  await commandSearch.fill('undo');
  await expect(page.getByRole('button', { name: /Undo/ })).toContainText('Unavailable: Open or create a score first');

  await commandSearch.fill('open or create');
  await expect(page.getByRole('button', { name: /Save as library score/ })).toContainText('Open or create a score first');

  await commandSearch.fill('workspace');
  await page.keyboard.press('ArrowDown');
  await page.keyboard.press('Enter');
  await expect(commandSearch).toBeHidden();

  await commandsButton.click();
  await commandSearch.fill('library');
  await expect(page.getByRole('button', { name: /Library/ }).first()).toHaveAttribute('title', /Library/);
});

test('command center exposes palette edit commands and runs selected-note edits @smoke', async ({ page }) => {
  await bootWithScore(page);
  await waitForRenderedScore(page);

  await page.getByTitle('Commands (Cmd/Ctrl+K)').click();
  const commandSearch = page.getByPlaceholder('Search commands, exports, notation tools...');
  await commandSearch.fill('toggle staccato');
  await expect(page.getByRole('button', { name: /Toggle staccato/ })).toContainText('Unavailable: Select a note first');
  await page.keyboard.press('Escape');

  await clickRenderedNotehead(page, 0);
  const baselineEventCount = (await readCurrentCore(page)).score.parts[0].staves[0].measures
    .flatMap((measure) => measure.voices)
    .flatMap((voice) => voice.events).length;

  await page.getByTitle('Commands (Cmd/Ctrl+K)').click();
  await commandSearch.fill('duplicate selection');
  await expect(page.getByRole('button', { name: /Duplicate selection/ })).toContainText(await expectedShortcutHint(page, 'Cmd D'));
  await page.keyboard.press('Enter');

  await expect.poll(async () => (
    (await readCurrentCore(page)).score.parts[0].staves[0].measures
      .flatMap((measure) => measure.voices)
      .flatMap((voice) => voice.events).length
  )).toBeGreaterThan(baselineEventCount);

  await clickRenderedNotehead(page, 0);
  await page.getByTitle('Commands (Cmd/Ctrl+K)').click();
  await commandSearch.fill('cut selection');
  await expect(page.getByRole('button', { name: /Cut selection/ })).toContainText(await expectedShortcutHint(page, 'Cmd X'));
  await expect(page.getByRole('button', { name: /Cut selection/ })).toBeEnabled();
  await page.keyboard.press('Escape');

  await page.getByTitle('Commands (Cmd/Ctrl+K)').click();
  await commandSearch.fill('active voice 3');
  await expect(page.getByRole('button', { name: /Set active voice 3/ })).toContainText(await expectedShortcutHint(page, 'Cmd Alt 3'));
  await page.keyboard.press('Enter');
  await expect.poll(async () => (await readE2EState(page))?.selectedVoice).toBe(3);

  await page.getByTitle('Commands (Cmd/Ctrl+K)').click();
  await commandSearch.fill('active voice 3');
  await expect(page.getByRole('button', { name: /Set active voice 3/ })).toContainText('Voice 3 is already active for note entry');
  await page.keyboard.press('Escape');

  const beforePitch = await readCurrentCore(page).then((core) => {
    const event = core.score.parts[0].staves[0].measures[0]?.voices[0]?.events[0];
    return event?.kind === 'note' ? `${event.pitch.step}${event.pitch.alter ?? 0}${event.pitch.octave}` : null;
  });

  await page.getByTitle('Commands (Cmd/Ctrl+K)').click();
  await commandSearch.fill('transpose up semitone');
  await page.keyboard.press('Enter');

  await expect.poll(async () => {
    const event = (await readCurrentCore(page)).score.parts[0].staves[0].measures[0]?.voices[0]?.events[0];
    return event?.kind === 'note' ? `${event.pitch.step}${event.pitch.alter ?? 0}${event.pitch.octave}` : null;
  }).not.toBe(beforePitch);

  await page.getByTitle('Commands (Cmd/Ctrl+K)').click();
  await commandSearch.fill('set final barline');
  await page.keyboard.press('Enter');

  await expect.poll(async () => (
    (await readCurrentCore(page)).score.parts[0].staves[0].measures[0]?.rightBarline
  )).toBe('final');
});

test('command center opens palette sections and focuses their controls @smoke', async ({ page }) => {
  await bootWithScore(page);
  await waitForRenderedScore(page);
  await clickRenderedNotehead(page, 0);

  await page.getByTitle('Commands (Cmd/Ctrl+K)').click();
  const commandSearch = page.getByPlaceholder('Search commands, exports, notation tools...');
  await commandSearch.fill('palette transpose');
  await page.keyboard.press('Enter');

  const transposePanel = page.getByRole('dialog', { name: 'Transpose' });
  await expect(transposePanel).toBeVisible();
  await expect(page.getByRole('button', { name: '−1 octave' })).toBeFocused();

  await page.keyboard.press('Escape');
  await expect(transposePanel).toBeHidden();

  await page.getByTitle('Commands (Cmd/Ctrl+K)').click();
  await commandSearch.fill('palette dynamics');
  await page.keyboard.press('Enter');

  const dynamicsPanel = page.getByRole('dialog', { name: 'Dynamics' });
  await expect(dynamicsPanel).toBeVisible();
  await expect(dynamicsPanel.getByRole('button', { name: /PP/ })).toBeFocused();
});

test('command center and shortcuts focus inspector text workflows @smoke', async ({ page }) => {
  await bootWithScore(page);
  await waitForRenderedScore(page);

  await page.getByRole('button', { name: 'Inspector' }).click();
  await page.getByRole('button', { name: 'Text & Rehearsal' }).first().click();
  await expect(page.getByPlaceholder('Staff text / expression')).toBeHidden();

  await page.getByTitle('Commands (Cmd/Ctrl+K)').click();
  const commandSearch = page.getByPlaceholder('Search commands, exports, notation tools...');
  await commandSearch.fill('staff text');
  await expect(page.getByRole('button', { name: /Enter staff text/ })).toContainText(await expectedShortcutHint(page, 'Cmd T'));
  await page.keyboard.press('Enter');

  const staffTextInput = page.getByPlaceholder('Staff text / expression');
  await expect(staffTextInput).toBeFocused();
  await staffTextInput.fill('dolce');
  await page.getByRole('button', { name: 'Add text above staff' }).click();
  await expect.poll(async () => {
    const xml = await readCurrentXml(page);
    return xml.includes('<words') && xml.includes('dolce');
  }).toBeTruthy();

  await page.keyboard.press(`${MOD}+M`);
  const rehearsalInput = page.getByPlaceholder('Rehearsal mark, e.g. A');
  await expect(rehearsalInput).toBeFocused();
  await rehearsalInput.fill('B');
  await page.getByRole('button', { name: 'Add rehearsal mark' }).click();
  await expect.poll(async () => {
    const xml = await readCurrentXml(page);
    return xml.includes('<rehearsal') && xml.includes('B');
  }).toBeTruthy();

  await page.getByTitle('Commands (Cmd/Ctrl+K)').click();
  await commandSearch.fill('text input');
  await expect(page.getByRole('button', { name: /Enter staff text/ })).toBeVisible();
  await expect(page.getByRole('button', { name: /Enter rehearsal mark/ })).toBeVisible();
  await expect(page.getByRole('button', { name: /Enter lyric line/ })).toBeVisible();
  await expect(page.getByRole('button', { name: /Enter dynamic marking/ })).toBeVisible();
  await expect(page.getByRole('button', { name: /Enter chord symbol/ })).toBeVisible();
  await page.keyboard.press('Escape');

  await clickRenderedNotehead(page, 0);
  await expect(page.getByPlaceholder('Lyric for selected note')).toBeVisible();

  await page.getByTitle('Commands (Cmd/Ctrl+K)').click();
  await commandSearch.fill('lyric line');
  await page.keyboard.press('Enter');
  await expect(page.getByPlaceholder('Lyric for selected note')).toBeFocused();

  await page.getByTitle('Commands (Cmd/Ctrl+K)').click();
  await commandSearch.fill('chord input');
  await expect(page.getByRole('button', { name: /Turn chord input on/ })).toContainText(await expectedShortcutHint(page, 'Shift Cmd H'));
  await page.keyboard.press('Enter');
  await expect.poll(async () => (await readE2EState(page))?.chordInputMode).toBe(true);

  await page.getByTitle('Commands (Cmd/Ctrl+K)').click();
  await commandSearch.fill('chord symbol');
  await expect(page.getByRole('button', { name: /Enter chord symbol/ })).toContainText(await expectedShortcutHint(page, 'Cmd K'));
  await page.keyboard.press('Enter');
  await expect(page.getByLabel('Inline chord symbol')).toBeFocused();
  await page.keyboard.press('Escape');

  await page.getByTitle('Commands (Cmd/Ctrl+K)').click();
  await commandSearch.fill('dynamic marking');
  await page.keyboard.press('Enter');
  const dynamicSelect = page.getByLabel('Dynamic marking');
  await expect(dynamicSelect).toBeFocused();
  await dynamicSelect.selectOption('ff');
  await page.getByRole('button', { name: 'Add dynamic' }).click();
  await expect.poll(async () => {
    const xml = await readCurrentXml(page);
    return xml.includes('<dynamics><ff/></dynamics>');
  }).toBeTruthy();
});

test('command center opens inspector sections for metadata, structure, and part workflows @smoke', async ({ page }) => {
  await bootWithScore(page);
  await waitForRenderedScore(page);

  const commandSearch = page.getByPlaceholder('Search commands, exports, notation tools...');

  await page.getByTitle('Commands (Cmd/Ctrl+K)').click();
  await commandSearch.fill('inspector score setup');
  await page.keyboard.press('Enter');
  await expect(page.getByRole('textbox', { name: 'Title', exact: true })).toBeFocused();

  await page.getByTitle('Commands (Cmd/Ctrl+K)').click();
  await commandSearch.fill('inspector key signature');
  await page.keyboard.press('Enter');
  await expect(page.getByRole('button', { name: 'C major' })).toBeFocused();

  await page.getByTitle('Commands (Cmd/Ctrl+K)').click();
  await commandSearch.fill('inspector measure tools');
  await page.keyboard.press('Enter');
  await expect(page.getByRole('button', { name: /Insert after m\./ })).toBeFocused();

  await page.getByTitle('Commands (Cmd/Ctrl+K)').click();
  await commandSearch.fill('inspector parts instruments');
  await page.keyboard.press('Enter');
  await expect(page.getByPlaceholder('Part name').first()).toBeFocused();
});

test('command center exposes structural inspector commands for measure and repeat workflows @smoke', async ({ page }) => {
  await bootWithScore(page);
  await waitForRenderedScore(page);

  const initialMeasureCount = (await readCurrentCore(page)).score.parts[0].staves[0].measures.length;

  await page.getByTitle('Commands (Cmd/Ctrl+K)').click();
  const commandSearch = page.getByPlaceholder('Search commands, exports, notation tools...');
  await commandSearch.fill('structure');
  await expect(page.getByRole('button', { name: /Inspector: repeats and endings/ })).toBeVisible();
  await expect(page.getByRole('button', { name: /Inspector: measure tools/ })).toBeVisible();
  await expect(page.getByRole('button', { name: /Insert measure after target/ })).toBeVisible();
  await expect(page.getByRole('button', { name: /Delete target measure/ })).toBeVisible();
  await expect(page.getByRole('button', { name: /Add system break/ })).toBeVisible();
  await expect(page.getByRole('button', { name: /Add page break/ })).toBeVisible();

  await commandSearch.fill('repeat ending');
  await expect(page.getByRole('button', { name: /Inspector: repeats and endings/ })).toBeVisible();
  await expect(page.getByRole('button', { name: /Add start repeat/ })).toBeVisible();
  await expect(page.getByRole('button', { name: /Add end repeat/ })).toBeVisible();
  await expect(page.getByRole('button', { name: /Add 1st ending/ })).toBeVisible();
  await expect(page.getByRole('button', { name: /Add 2nd ending/ })).toBeVisible();

  await commandSearch.fill('insert measure');
  await page.keyboard.press('Enter');

  await expect.poll(async () => (
    (await readCurrentCore(page)).score.parts[0].staves[0].measures.length
  )).toBe(initialMeasureCount + 1);
});

test('command center exposes score view controls for navigator, find, zoom, and view mode @smoke', async ({ page }) => {
  await bootWithScore(page);
  await waitForRenderedScore(page);

  await page.getByTitle('Commands (Cmd/Ctrl+K)').click();
  const commandSearch = page.getByPlaceholder('Search commands, exports, notation tools...');

  await commandSearch.fill('navigator');
  await page.keyboard.press('Enter');
  await expect(page.getByTestId('navigator-box')).toBeVisible();

  await page.getByTitle('Commands (Cmd/Ctrl+K)').click();
  await commandSearch.fill('find/go to');
  await expect(page.getByRole('button', { name: /Open Find\/Go to/ })).toContainText(await expectedShortcutHint(page, 'Cmd F'));
  await page.keyboard.press('Enter');
  await expect(page.getByPlaceholder('Measure, p2, r1, A')).toBeFocused();

  await page.getByTitle('Commands (Cmd/Ctrl+K)').click();
  await commandSearch.fill('zoom in');
  await expect(page.getByRole('button', { name: /Zoom in/ })).toContainText(await expectedShortcutHint(page, 'Cmd +'));
  await page.keyboard.press('Enter');
  await expect(page.getByLabel('Zoom percent')).toHaveValue('110');

  await page.getByTitle('Commands (Cmd/Ctrl+K)').click();
  await commandSearch.fill('reset zoom');
  await expect(page.getByRole('button', { name: /Reset zoom to 100%/ })).toContainText(await expectedShortcutHint(page, 'Cmd 0'));
  await page.keyboard.press('Enter');
  await expect(page.getByLabel('Zoom percent')).toHaveValue('100');

  await page.getByTitle('Commands (Cmd/Ctrl+K)').click();
  await commandSearch.fill('continuous horizontal');
  await page.getByRole('button', { name: /Switch to continuous horizontal view/ }).click();
  await expect(page.getByLabel('Score view mode')).toHaveValue('continuous-horizontal');
  await page.getByTitle('Commands (Cmd/Ctrl+K)').click();
  const activeHorizontalView = page.getByRole('button', { name: /Switch to continuous horizontal view/ });
  await expect(activeHorizontalView).toBeDisabled();
  await expect(activeHorizontalView).toContainText('This view is already active');
  await page.keyboard.press('Escape');

  await page.getByTitle('Commands (Cmd/Ctrl+K)').click();
  await commandSearch.fill('page view');
  await page.getByRole('button', { name: /Switch to page view/ }).click();
  await expect(page.getByLabel('Score view mode')).toHaveValue('page');
  await page.getByTitle('Commands (Cmd/Ctrl+K)').click();
  const activePageView = page.getByRole('button', { name: /Switch to page view/ });
  await expect(activePageView).toBeDisabled();
  await expect(activePageView).toContainText('This view is already active');
  await page.keyboard.press('Escape');
});

test('file menu supports keyboard navigation and skips unavailable commands @smoke', async ({ page }) => {
  await page.goto('/');

  await page.getByRole('button', { name: 'File', exact: true }).click();
  const newFile = page.getByRole('menuitem', { name: 'New file' });
  const openFile = page.getByRole('menuitem', { name: 'Open file' });
  const saveFile = page.getByRole('menuitem', { name: 'Save - Open or create a score first' });
  const downloadMxl = page.getByRole('menuitem', { name: 'Download .mxl - Open or create a score first' });
  await expect(newFile).toBeFocused();
  await expect(newFile).toContainText(await expectedShortcutHint(page, 'Cmd N'));
  await expect(openFile).toContainText(await expectedShortcutHint(page, 'Cmd O'));
  await expect(saveFile).toHaveAttribute('aria-disabled', 'true');
  await expect(saveFile).toContainText('Open or create a score first');
  await expect(downloadMxl).toHaveAttribute('aria-disabled', 'true');
  await expect(downloadMxl).toContainText('Open or create a score first');

  await page.keyboard.press('ArrowDown');
  await expect(openFile).toBeFocused();

  await page.keyboard.press('ArrowDown');
  await expect(newFile).toBeFocused();

  await page.keyboard.press('End');
  await expect(openFile).toBeFocused();

  await page.keyboard.press('Home');
  await expect(newFile).toBeFocused();

  await page.keyboard.press('Enter');
  await expect(page.getByRole('heading', { name: 'Set up your score' })).toBeVisible();
});

test('edit and view menus expose common score workflows without using command search @smoke', async ({ page }) => {
  await bootWithScore(page);
  await waitForRenderedScore(page);

  await page.getByRole('button', { name: 'Edit', exact: true }).click();
  const undoEdit = page.getByRole('menuitem', { name: 'Undo' });
  const copyEdit = page.getByRole('menuitem', { name: 'Copy selection' });
  const cutEdit = page.getByRole('menuitem', { name: 'Cut selection' });
  await expect(undoEdit).toHaveAttribute('aria-disabled', 'true');
  await expect(undoEdit).toContainText('No edit to undo');
  await expect(copyEdit).toHaveAttribute('aria-disabled', 'true');
  await expect(cutEdit).toHaveAttribute('aria-disabled', 'true');
  await expect(copyEdit).toContainText('Select a note or measure first');
  await expect(cutEdit).toContainText('Select a note or measure first');
  await expect(copyEdit).toContainText(await expectedShortcutHint(page, 'Cmd C'));
  await expect(cutEdit).toContainText(await expectedShortcutHint(page, 'Cmd X'));

  await clickRenderedNotehead(page, 0);

  await page.getByRole('button', { name: 'Edit', exact: true }).click();
  const duplicateEdit = page.getByRole('menuitem', { name: 'Duplicate selection' });
  const deleteEdit = page.getByRole('menuitem', { name: 'Delete selected note' });
  await expect(page.getByRole('menuitem', { name: 'Copy selection' })).toContainText(await expectedShortcutHint(page, 'Cmd C'));
  await expect(page.getByRole('menuitem', { name: 'Cut selection' })).toContainText(await expectedShortcutHint(page, 'Cmd X'));
  await expect(duplicateEdit).toContainText(await expectedShortcutHint(page, 'Cmd D'));
  await expect(deleteEdit).toContainText('Del');
  await expect(page.getByRole('menuitem', { name: 'Cut selection' })).toBeEnabled();
  await expect(duplicateEdit).toBeEnabled();
  await expect(deleteEdit).toBeEnabled();
  await page.keyboard.press('Escape');

  await page.getByRole('button', { name: 'View', exact: true }).click();
  const findMenuItem = page.getByRole('menuitem', { name: 'Open Find/Go to' });
  const navigatorMenuItem = page.getByRole('menuitem', { name: 'Toggle navigator' });
  await expect(findMenuItem).toContainText(await expectedShortcutHint(page, 'Cmd F'));
  await expect(page.getByRole('menuitem', { name: 'Zoom in' })).toContainText(await expectedShortcutHint(page, 'Cmd +'));
  await navigatorMenuItem.click();
  await expect(page.getByTestId('navigator-box')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Navigator' })).toHaveAttribute('aria-pressed', 'true');

  await page.getByRole('button', { name: 'View', exact: true }).click();
  await page.getByRole('menuitem', { name: 'Switch to continuous horizontal view' }).click();
  await expect(page.getByLabel('Score view mode')).toHaveValue('continuous-horizontal');
  await page.getByRole('button', { name: 'View', exact: true }).click();
  const activeHorizontalMenuItem = page.getByRole('menuitem', { name: 'Switch to continuous horizontal view - This view is already active' });
  await expect(activeHorizontalMenuItem).toHaveAttribute('aria-disabled', 'true');
  await expect(activeHorizontalMenuItem).toContainText('This view is already active');
  await page.keyboard.press('Escape');

  await page.getByRole('button', { name: 'View', exact: true }).click();
  await page.getByRole('menuitem', { name: 'Open Find/Go to' }).click();
  await expect(page.getByPlaceholder('Measure, p2, r1, A')).toBeFocused();
  await expect(page.getByRole('button', { name: 'Find/Go to' })).toHaveAttribute('aria-pressed', 'true');
});

test('header menus support desktop-style keyboard traversal across file edit and view @smoke', async ({ page }) => {
  await bootWithScore(page);
  await waitForRenderedScore(page);

  const fileButton = page.getByRole('button', { name: 'File', exact: true });
  const editButton = page.getByRole('button', { name: 'Edit', exact: true });
  const viewButton = page.getByRole('button', { name: 'View', exact: true });

  await fileButton.focus();
  await page.keyboard.press('ArrowRight');
  await expect(editButton).toBeFocused();

  await page.keyboard.press('ArrowRight');
  await expect(viewButton).toBeFocused();

  await page.keyboard.press('Home');
  await expect(fileButton).toBeFocused();

  await page.keyboard.press('End');
  await expect(viewButton).toBeFocused();

  await page.keyboard.press('ArrowDown');
  await expect(page.getByRole('menuitem', { name: 'Open Find/Go to' })).toBeFocused();

  await page.keyboard.press('ArrowLeft');
  await expect(page.getByRole('menuitem', { name: 'Undo' })).toBeFocused();

  await page.keyboard.press('ArrowLeft');
  await expect(page.getByRole('menuitem', { name: 'New file' })).toBeFocused();

  await page.keyboard.press('ArrowUp');
  await expect(page.getByRole('menuitem', { name: 'Close score' })).toBeFocused();

  await page.keyboard.press('Tab');
  await expect(fileButton).not.toHaveAttribute('aria-expanded', 'true');
  await expect(page.getByRole('menu')).toHaveCount(0);
});

test('toolbar disabled note actions explain selection requirements @smoke', async ({ page }) => {
  await bootWithScore(page);
  await waitForRenderedScore(page);

  await expect(page.locator('button[title^="Quarter note: 5"]').first()).toBeVisible();
  await expect(page.getByTitle('Voice 3 (Cmd/Ctrl+Alt/Option+3)')).toBeVisible();
  await page.getByRole('button', { name: /Expression slur/ }).click();
  await page.getByRole('button', { name: /Harmony Cmaj7/ }).click();
  await page.getByRole('button', { name: /Edit Clipboard/ }).click();
  await expect(page.getByRole('button', { name: 'Triplet from selection (Cmd/Ctrl+3) - Select a note first' })).toBeDisabled();
  await expect(page.getByRole('button', { name: 'Insert rest (R or 0) - Select a note first' })).toBeDisabled();
  await expect(page.getByTitle('Chord symbol (Cmd/Ctrl+K) - Select a note first')).toBeDisabled();
  await expect(page.getByRole('button', { name: 'Copy (Cmd/Ctrl+C) - Select a note first' })).toBeDisabled();
  await expect(page.getByRole('button', { name: 'Cut (Cmd/Ctrl+X) - Select a note first' })).toBeDisabled();
  await expect(page.getByRole('button', { name: 'Paste (Cmd/Ctrl+V) - Select a note first' })).toBeDisabled();
  await expect(page.getByRole('button', { name: 'Delete (Del) - Select a note first' })).toBeDisabled();
  await page.getByRole('button', { name: 'Selection', exact: true }).click();
  await expect(page.getByRole('button', { name: /Copy selection .*Select a note first/ })).toBeDisabled();
  await expect(page.getByRole('button', { name: /Cut selection .*Select a note first/ })).toBeDisabled();
  await expect(page.getByRole('button', { name: /Paste selection .*Select a note first/ })).toBeDisabled();
  await page.getByRole('button', { name: 'Transpose', exact: true }).click();
  await expect(page.getByTitle('−1 octave - Select a note first')).toBeDisabled();
  await page.keyboard.press('Escape');
  await expect(page.getByRole('button', { name: 'Transpose', exact: true })).toBeFocused();
  await expect(page.getByTitle('−1 octave - Select a note first')).toBeHidden();
  await page.getByRole('button', { name: 'Articulations', exact: true }).click();
  await expect(page.getByTitle('Staccato - Select a note first')).toBeDisabled();
  await page.keyboard.press('Escape');

  await clickRenderedNotehead(page, 0);

  await expect(page.getByTitle('Set active note to F (F)')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Triplet from selection (Cmd/Ctrl+3)' })).toBeEnabled();
  await expect(page.getByRole('button', { name: 'Insert rest (R or 0)' })).toBeEnabled();
  await expect(page.getByTitle('Chord symbol (Cmd/Ctrl+K)')).toBeEnabled();
  await page.keyboard.press(`${MOD}+K`);
  const inlineChord = page.getByLabel('Inline chord symbol');
  await expect(inlineChord).toBeFocused();
  await inlineChord.fill('Dm7');
  await page.keyboard.press('Enter');
  await expect.poll(async () => {
    const core = await readCurrentCore(page);
    return core.score.parts[0]?.staves[0]?.measures[0]?.directions.find((direction) => direction.kind === 'harmony')?.value ?? '';
  }).toBe('Dm7');
  await expect(page.getByRole('button', { name: 'Copy (Cmd/Ctrl+C)' })).toBeEnabled();
  await expect(page.getByRole('button', { name: 'Cut (Cmd/Ctrl+X)' })).toBeEnabled();
  await expect(page.getByRole('button', { name: 'Paste (Cmd/Ctrl+V) - Copy a selection first' })).toBeDisabled();
  await expect(page.getByRole('button', { name: 'Delete (Del)' })).toBeEnabled();
  await page.getByRole('button', { name: 'Selection', exact: true }).click();
  await expect(page.getByRole('button', { name: /Copy selection/ })).toBeEnabled();
  await expect(page.getByRole('button', { name: /Cut selection/ })).toBeEnabled();
  await expect(page.getByRole('button', { name: /Paste selection .*Copy a selection first/ })).toBeDisabled();
  await page.getByRole('button', { name: 'Transpose', exact: true }).click();
  await expect(page.getByTitle('−1 octave')).toBeEnabled();
  await page.getByRole('button', { name: 'Articulations', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Staccato', exact: true })).toBeEnabled();
});

test('note input toolbar exposes shortcut hints and active-note controls @smoke', async ({ page }) => {
  await bootWithScore(page);
  await waitForRenderedScore(page);

  await expect(page.locator('button[title^="Quarter note: 5"]').first()).toBeVisible();
  await expect(page.getByTitle('Flat (-)')).toBeVisible();
  await expect(page.getByTitle('Voice 3 (Cmd/Ctrl+Alt/Option+3)')).toBeVisible();
  await page.getByRole('button', { name: /Expression slur/ }).click();
  await expect(page.getByTitle('Toggle slur (S) - Select a note first')).toBeDisabled();

  await clickRenderedNotehead(page, 0);

  await expect(page.getByTitle('Set active note to F (F)')).toBeVisible();
  await expect(page.getByTitle('Raise active note by one octave (Shift+ArrowUp / Cmd/Ctrl+ArrowUp)')).toBeVisible();
  await expect(page.getByTitle('Toggle slur (S)')).toBeEnabled();
});

test('toolbar transport and history controls expose shortcut hints and disabled reasons @smoke', async ({ page }) => {
  await bootWithScore(page);
  await waitForRenderedScore(page);

  await expect(page.getByTitle('Undo (Cmd/Ctrl+Z) - No edit to undo')).toBeDisabled();
  await expect(page.getByTitle('Redo (Cmd/Ctrl+Shift+Z) - No edit to redo')).toBeDisabled();
  await expect(page.getByTitle('Stop - Playback is already stopped')).toBeDisabled();
  await expect(page.getByTitle('Toggle note input (N)')).toBeVisible();

  await page.getByTitle('Play (Space)').click();
  await expect(page.getByTitle('Stop')).toBeEnabled();
});

test('inspector disabled note-scoped text workflows explain selection requirements @smoke', async ({ page }) => {
  await bootWithScore(page);
  await waitForRenderedScore(page);

  await page.getByRole('button', { name: 'Inspector' }).click();

  await expect(page.getByRole('combobox', { name: 'Dynamic marking - Select a note first' })).toBeDisabled();
  await expect(page.getByRole('button', { name: 'Add dynamic - Select a note first' })).toBeDisabled();
  await expect(page.getByRole('textbox', { name: 'Lyric for selected note - Select a note first' })).toBeDisabled();
  await expect(page.getByRole('textbox', { name: 'Lyric verse - Select a note first' })).toBeDisabled();
  await expect(page.getByRole('button', { name: 'Attach lyric line - Select a note first' })).toBeDisabled();

  await clickRenderedNotehead(page, 0);

  await expect(page.getByRole('combobox', { name: 'Dynamic marking', exact: true })).toBeEnabled();
  await expect(page.getByRole('button', { name: 'Add dynamic', exact: true })).toBeEnabled();
  await expect(page.getByRole('textbox', { name: 'Lyric for selected note', exact: true })).toBeEnabled();
  await expect(page.getByRole('textbox', { name: 'Lyric verse', exact: true })).toBeEnabled();
  await expect(page.getByRole('button', { name: 'Attach lyric line', exact: true })).toBeEnabled();
});

test('file lifecycle covers library open, save-as, downloads, and new-file reset', async ({ page }) => {
  test.slow();
  await bootWithScore(page);

  page.once('dialog', async (dialog) => {
    expect(dialog.message()).toContain('Save as');
    await dialog.accept('renamed-score');
  });
  await page.getByTitle('Save as').click();

  const appFrame = page.mainFrame();
  const appHeader = appFrame.locator('.nex-app-shell > header');
  const armRenamedReloadBoot = async () => {
    await page.evaluate((xml) => {
      localStorage.setItem('nex-note:e2e-boot', JSON.stringify({
        xml,
        filename: 'renamed-score.musicxml',
      }));
    }, fixtureXml);
  };
  const ensureRenamedScoreLoaded = async () => {
    await page.waitForTimeout(750);
    if (!(await appHeader.getByText('renamed-score.musicxml').isVisible().catch(() => false))) {
      await armRenamedReloadBoot();
      await page.reload();
    }
    await expect(appHeader.getByText('renamed-score.musicxml')).toBeVisible();
    await armRenamedReloadBoot();
  };

  await appHeader.getByTitle('Library').click();
  await expect(page.getByText('Quick access to scores')).toBeVisible();
  await expect(page.getByRole('button', { name: 'renamed-score.musicxml' })).toBeVisible();
  await expect(appHeader.getByText('renamed-score.musicxml')).toBeVisible();
  await armRenamedReloadBoot();

  const abcDownload = page.waitForEvent('download');
  await appHeader.getByTitle('Export ABC').click();
  expect((await abcDownload).suggestedFilename()).toBe('renamed-score.abc');
  await ensureRenamedScoreLoaded();

  const mxlDownload = page.waitForEvent('download');
  await appHeader.getByTitle('Download .mxl').click();
  expect((await mxlDownload).suggestedFilename()).toBe('renamed-score.mxl');
  await ensureRenamedScoreLoaded();

  await expect(appHeader.getByTitle('New file')).toBeVisible();
  await appHeader.getByTitle('New file').click();
  await expect(page.getByRole('heading', { name: 'Set up your score' })).toBeVisible();
  await page.getByRole('button', { name: 'Cancel' }).click();
  await expect(page.getByTitle('Save as')).toBeVisible();
});

test('near-note fallback clicks activate, highlight, and preview the resolved note', async ({ page }) => {
  await bootWithScore(page);
  await waitForRenderedScore(page);

  const firstNote = await noteheadCenter(page, 0);
  await page.mouse.click(firstNote.x + 18, firstNote.y);

  await expect.poll(async () => {
    const selected = (await readE2EState(page))?.selectedNote;
    return selected
      ? {
          measureNumber: selected.measureNumber,
          staffIndex: selected.staffIndex,
          timestampNum: selected.timestampNum,
          timestampDen: selected.timestampDen,
          step: selected.step,
          octave: selected.octave,
          isRest: selected.isRest,
        }
      : null;
  }).toEqual({ measureNumber: 1, staffIndex: 1, timestampNum: 0, timestampDen: 4, step: 'C', octave: 4, isRest: false });

  await expect.poll(async () => page.evaluate(() => (
    (window as typeof window & {
      __NEX_NOTE_E2E_PREVIEW_STARTS__?: Array<{ note: string | number }>;
    }).__NEX_NOTE_E2E_PREVIEW_STARTS__?.length ?? 0
  ))).toBeGreaterThan(0);

  await expect.poll(async () => page.evaluate(() => (
    [...document.querySelectorAll('*')].filter((element) => {
      const style = getComputedStyle(element);
      return style.fill === 'rgb(26, 86, 219)'
        || style.stroke === 'rgb(26, 86, 219)'
        || (element.getAttribute('fill') ?? '').includes('#1a56db')
        || (element.getAttribute('stroke') ?? '').includes('#1a56db');
    }).length
  ))).toBeGreaterThan(0);
});

test('polyphonic note clicks activate, highlight, and preview the clicked note in the part', async ({ page }) => {
  await bootWithScore(page, 'polyphonic-click.musicxml', buildPolyphonicFixtureXml());
  await waitForRenderedScore(page);

  for (const noteheadIndex of [0, 4]) {
    await page.evaluate(() => {
      (window as typeof window & {
        __NEX_NOTE_E2E_PREVIEW_STARTS__?: Array<{ note: string | number }>;
      }).__NEX_NOTE_E2E_PREVIEW_STARTS__ = [];
    });
    const target = await noteheadCenter(page, noteheadIndex);
    await page.mouse.click(target.x, target.y);

    await expect.poll(async () => (await readE2EState(page))?.selectionCount ?? 0).toBe(1);
    await expect.poll(async () => page.evaluate(() => (
      (window as typeof window & {
        __NEX_NOTE_E2E_PREVIEW_STARTS__?: Array<{ note: string | number }>;
      }).__NEX_NOTE_E2E_PREVIEW_STARTS__?.length ?? 0
    ))).toBeGreaterThan(0);

    await expect.poll(async () => page.evaluate(() => (
      [...document.querySelectorAll('*')].filter((element) => {
        const style = getComputedStyle(element);
        return style.fill === 'rgb(26, 86, 219)'
          || style.stroke === 'rgb(26, 86, 219)'
          || (element.getAttribute('fill') ?? '').includes('#1a56db')
        || (element.getAttribute('stroke') ?? '').includes('#1a56db');
      }).length
    ))).toBeGreaterThan(0);
    await expect(page.locator('[data-selected-measure="true"]')).toHaveCount(0);
  }
});

test('compact polyphonic note clicks keep the selection on the clicked note', async ({ page }) => {
  await page.setViewportSize({ width: 800, height: 760 });
  await bootWithScore(page, 'compact-polyphonic-click.musicxml', buildPolyphonicFixtureXml());
  await waitForRenderedScore(page);

  await clickRenderedNotehead(page, 0);

  await expect.poll(async () => (await readE2EState(page))?.selectionCount ?? 0).toBe(1);
  await expect.poll(async () => {
    const selected = (await readE2EState(page))?.selectedNote;
    return selected
      ? { measureNumber: selected.measureNumber, voiceId: selected.voiceId, timestampNum: selected.timestampNum }
      : null;
  }).toEqual({ measureNumber: 1, voiceId: 1, timestampNum: 0 });
  await expect(page.locator('[data-selected-measure="true"]')).toHaveCount(0);
});

test('assistant workflow covers provider switching, AI preview, apply/cancel, and saved presets @smoke', async ({ page }) => {
  let chatCallCount = 0;
  await page.route('**/api/chat', async (route) => {
    chatCallCount += 1;
    const body = chatCallCount === 1
      ? {
          requiresConfirmation: true,
          explanation: 'Prepared title update.',
          workflowLabel: 'Content edit',
          commands: [{ type: 'setTitle', title: 'AI Applied Title' }],
          affectedMeasures: [],
          ambiguities: [],
          plan: ['Set title'],
          riskReasons: ['Preview required'],
          validatorFindings: [],
          provider: 'ollama',
          model: 'gemma4:31b',
          latencyMs: 12,
        }
      : {
          requiresConfirmation: true,
          explanation: 'Prepared title update.',
          workflowLabel: 'Content edit',
          commands: [{ type: 'setTitle', title: 'AI Applied Title' }],
          affectedMeasures: [],
          ambiguities: [],
          plan: ['Set title'],
          riskReasons: ['Preview required'],
          validatorFindings: [],
          provider: 'ollama',
          model: 'gemma4:31b',
          latencyMs: 12,
        };
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(body),
    });
  });

  await bootWithScore(page);

  await page.getByRole('button', { name: /Ollama/ }).click();
  await page.getByRole('button', { name: 'Claude' }).click();
  await expect(page.getByRole('button', { name: /Claude/ })).toBeVisible();

  await page.getByRole('button', { name: /Claude/ }).click();
  await page.getByRole('button', { name: 'Ollama' }).click();
  await expect(page.getByRole('button', { name: /Ollama/ })).toBeVisible();

  await page.getByRole('button', { name: /Ollama/ }).click();
  await page.getByTitle('Add custom model').click();
  await page.getByPlaceholder('model:tag').fill('llama3:8b');
  await page.getByRole('button', { name: 'Add' }).click();
  await expect(page.getByTitle('llama3:8b')).toBeVisible();

  const input = page.getByPlaceholder('Describe your edit…');
  await input.fill('set the title');
  await page.getByRole('button', { name: 'Send' }).click();
  await expect(page.getByText('Prepared title update.')).toBeVisible();
  await expect(page.getByPlaceholder('Type apply to confirm or cancel to discard…')).toBeVisible();

  await page.getByPlaceholder('Type apply to confirm or cancel to discard…').fill('cancel');
  await page.getByRole('button', { name: 'Send' }).click();
  await expect(page.getByText('Preview discarded.')).toBeVisible();

  await page.getByPlaceholder('Describe your edit…').fill('set the title again');
  await page.getByRole('button', { name: 'Send' }).click();
  await page.getByPlaceholder('Type apply to confirm or cancel to discard…').fill('apply');
  await page.getByRole('button', { name: 'Send' }).click();

  await page.getByRole('button', { name: 'Inspector' }).click();
  await expect(page.getByRole('textbox', { name: 'Title', exact: true })).toHaveValue('AI Applied Title');

  await page.getByRole('button', { name: 'AI', exact: true }).click();
  await page.getByRole('button', { name: 'Library' }).last().click();
  await page.getByPlaceholder('Preset name…').fill('restore-ai-title');
  await page.getByRole('button', { name: 'Save', exact: true }).click();
  await expect(page.getByText('Saved')).toBeVisible();
  await expect(page.getByRole('button', { name: /restore-ai-title/ })).toBeVisible();

  await page.getByTitle('New file').click();
  await expect(page.getByRole('heading', { name: 'Set up your score' })).toBeVisible();
  await page.getByRole('button', { name: 'Cancel' }).click();
  await expect(page.getByTitle('Save as')).toBeVisible({ timeout: 15_000 });
  await page.getByRole('button', { name: 'Inspector' }).click();
  await expect(page.getByRole('textbox', { name: 'Title', exact: true })).toHaveValue('AI Applied Title');
});

test('playback controls and responsive panel behavior work in the browser with stubbed audio @smoke', async ({ page }) => {
  await bootWithScore(page);

  await page.getByTitle('Toggle note input (N)').click();
  await expect(page.getByTitle('Toggle note input (N)')).toHaveClass(/nex-brand-active/);

  await expect(page.getByTitle(/Play \(Space\)|Pause \(Space\)/)).toBeVisible();
  await page.getByTitle('Play (Space)').click();
  await expect.poll(async () => (await readE2EState(page))?.playbackState).toBe('playing');
  await expect(page.getByText(/Measure 1/)).toBeVisible();
  await page.getByTitle('Stop').click();
  await expect(page.getByText('Ready')).toBeVisible();

  await page.getByTitle('Metronome off').click();
  await expect(page.getByTitle('Metronome on')).toBeVisible();

  const tempo = page.locator('input[type="range"]').first();
  await tempo.fill('150');
  await expect(page.locator('span.w-7').filter({ hasText: /^150$/ })).toBeVisible();

  const progressBars = page.locator('div.cursor-pointer.overflow-hidden.rounded-full');
  if (await progressBars.count() > 0) {
    await progressBars.first().click({ position: { x: 120, y: 1 } });
    await expect(page.getByTitle(/Play \(Space\)|Pause \(Space\)/)).toBeVisible();
  } else {
    await expect(page.getByText('Ready')).toBeVisible();
  }

  await page.getByTitle(/Hide panel|Panel ausblenden/).click();
  await expect(page.getByTitle(/Show panel|Panel einblenden/)).toBeVisible();
  await page.getByTitle(/Show panel|Panel einblenden/).click();
  await expect(page.getByRole('button', { name: 'Inspector' })).toBeVisible();
});

test('tempo changes during playback keep the playhead position', async ({ page }) => {
  await bootWithScore(page, 'long-tempo-playback.musicxml', buildLongFixtureXml(16));
  await waitForRenderedLayout(page);

  const viewport = page.getByTestId('score-viewport');
  await expect(viewport).toBeVisible();
  await page.getByTitle('Metronome off').click();
  await expect(page.getByTitle('Metronome on')).toBeVisible();
  await page.evaluate(() => {
    const win = window as typeof window & { __NEX_NOTE_E2E_OSCILLATOR_STARTS__?: number };
    win.__NEX_NOTE_E2E_OSCILLATOR_STARTS__ = 0;
    const proto = AudioContext.prototype;
    const nativeCreateOscillator = proto.createOscillator;
    proto.createOscillator = function patchedCreateOscillator(...args) {
      const oscillator = nativeCreateOscillator.apply(this, args);
      const nativeStart = oscillator.start.bind(oscillator);
      oscillator.start = (when?: number) => {
        win.__NEX_NOTE_E2E_OSCILLATOR_STARTS__ = (win.__NEX_NOTE_E2E_OSCILLATOR_STARTS__ ?? 0) + 1;
        nativeStart(when);
      };
      return oscillator;
    };
  });

  await page.getByTitle('Play (Space)').click();
  await expect.poll(async () => (await readE2EState(page))?.playbackState).toBe('playing');
  await expect(viewport).toHaveAttribute('data-playback-active', 'true');
  await expect.poll(async () => page.evaluate(() => (
    (window as typeof window & {
      __NEX_NOTE_E2E_PREVIEW_STARTS__?: Array<{ note: string | number }>;
    }).__NEX_NOTE_E2E_PREVIEW_STARTS__?.length ?? 0
  ))).toBeGreaterThan(0);
  await expect.poll(async () => page.evaluate(() => (
    (window as typeof window & { __NEX_NOTE_E2E_OSCILLATOR_STARTS__?: number })
      .__NEX_NOTE_E2E_OSCILLATOR_STARTS__ ?? 0
  ))).toBeGreaterThan(0);
  await expect(page.getByTestId('score-playhead')).toHaveCSS('transition-property', /left/);

  const readPlayheadMs = async () => Number.parseInt(await viewport.getAttribute('data-playback-time-ms') || '0', 10);
  await expect.poll(readPlayheadMs, { timeout: 5_000 }).toBeGreaterThan(100);
  const beforeTempoChangeMs = await readPlayheadMs();

  await page.locator('input[type="range"]').first().fill('170');
  await expect(page.locator('span.w-7').filter({ hasText: /^170$/ })).toBeVisible();

  const afterTempoChangeMs = await readPlayheadMs();
  expect(afterTempoChangeMs).toBeGreaterThan(beforeTempoChangeMs - 75);
  await expect.poll(readPlayheadMs, { timeout: 5_000 }).toBeGreaterThan(afterTempoChangeMs + 100);
  await expect.poll(async () => (await readE2EState(page))?.playbackState).toBe('playing');
});

test('score navigation supports wheel scroll, zoom, view switching, navigator, and find/go to', async ({ page }) => {
  await bootWithScore(page, 'long-navigation.musicxml', buildLongFixtureXml(40));

  const viewport = page.getByTestId('score-viewport');
  await expect(viewport).toBeVisible();
  await viewport.click();

  await page.getByLabel('Score view mode').selectOption('continuous-horizontal');
  await page.waitForTimeout(800);
  await viewport.hover();

  const beforeHorizontal = await viewport.evaluate((node) => ({
    left: node.scrollLeft,
    top: node.scrollTop,
  }));

  await page.keyboard.down('Shift');
  await page.mouse.wheel(0, 900);
  await page.keyboard.up('Shift');
  await page.waitForTimeout(150);

  const afterHorizontal = await viewport.evaluate((node) => ({
    left: node.scrollLeft,
    top: node.scrollTop,
  }));
  expect(afterHorizontal.left).toBeGreaterThan(beforeHorizontal.left);

  await page.keyboard.down('Control');
  await page.mouse.wheel(0, -900);
  await page.keyboard.up('Control');
  await expect(page.getByLabel('Zoom percent')).not.toHaveValue('100');

  await page.keyboard.press('Control+0');
  await expect(page.getByLabel('Zoom percent')).toHaveValue('100');

  await page.getByLabel('Score view mode').selectOption('page');
  await page.waitForTimeout(800);
  await viewport.click();
  await page.keyboard.press('PageDown');
  await page.waitForTimeout(250);
  const pageDownTop = await viewport.evaluate((node) => node.scrollTop);
  expect(pageDownTop).toBeGreaterThan(0);

  await page.getByRole('button', { name: 'Find/Go to' }).click();
  await page.getByPlaceholder('Measure, p2, r1, A').fill('1');
  await page.getByRole('button', { name: 'Go', exact: true }).click();
  await expect(page.getByText('measure 1', { exact: true })).toBeVisible();
  await expect.poll(
    () => viewport.evaluate((node) => node.scrollTop),
    { message: 'find/go to measure 1 should scroll back toward the top' },
  ).toBeLessThan(pageDownTop);

  await page.getByRole('button', { name: 'Navigator' }).click();
  await expect(page.getByTestId('navigator-box')).toBeVisible();
  await page.getByRole('button', { name: /Page 1/ }).click();
  await page.waitForTimeout(250);
  const afterNavigatorScroll = await viewport.evaluate((node) => node.scrollTop);
  expect(afterNavigatorScroll).toBeGreaterThanOrEqual(0);
});

test('browser note clicks and navigation shortcuts work across measures and voices @smoke', async ({ page }) => {
  await bootWithScore(page, 'polyphonic.musicxml', buildPolyphonicFixtureXml());
  await waitForRenderedScore(page);

  await clickRenderedNotehead(page, 0);
  await expect.poll(async () => (await readE2EState(page))?.selectedNote?.measureNumber).toBe(1);
  await expect.poll(async () => (await readE2EState(page))?.selectedNote?.voiceId).toBe(1);
  await expect.poll(async () => (await readE2EState(page))?.selectedNote?.timestampNum).toBe(0);

  await page.keyboard.press('ArrowRight');
  await expect.poll(async () => (await readE2EState(page))?.selectedNote?.timestampNum).toBe(1);

  await page.keyboard.press('Shift+ArrowRight');
  await expect.poll(async () => (await readE2EState(page))?.selectedNote?.timestampNum).toBe(2);
  await page.keyboard.press('S');
  await expect.poll(async () => (await readCurrentXml(page)).includes('<slur')).toBeTruthy();

  await page.keyboard.press(`${MOD}+ArrowRight`);
  await expect.poll(async () => (await readE2EState(page))?.selectedNote?.measureNumber).toBe(2);
  await expect.poll(async () => (await readE2EState(page))?.selectedNote?.timestampNum).toBe(0);

  await page.keyboard.press(`${MOD}+Home`);
  await expect.poll(async () => (await readE2EState(page))?.selectedNote?.measureNumber).toBe(1);
  await page.keyboard.press(`${MOD}+End`);
  await expect.poll(async () => (await readE2EState(page))?.selectedNote?.measureNumber).toBe(2);
  await expect.poll(async () => (await readE2EState(page))?.selectedNote?.timestampNum).toBe(3);

  await page.keyboard.press('Alt+ArrowDown');
  await expect.poll(async () => (await readE2EState(page))?.selectedNote?.voiceId).toBe(2);

  await page.keyboard.press('Alt+ArrowUp');
  await expect.poll(async () => (await readE2EState(page))?.selectedNote?.voiceId).toBe(1);

  await page.keyboard.press(`${MOD}+Shift+Backspace`);
  await expect.poll(async () => {
    const measure = (await readCurrentCore(page)).score.parts[0].staves[0].measures[1];
    const voiceOneEvents = measure.voices.find((voice) => voice.voiceId === 1)?.events ?? [];
    const voiceTwoEvents = measure.voices.find((voice) => voice.voiceId === 2)?.events ?? [];
    return {
      voiceOneKinds: voiceOneEvents.map((event) => event.kind),
      voiceOneDurations: voiceOneEvents.map((event) => event.durationType ?? null),
      voiceTwoNoteCount: voiceTwoEvents.filter((event) => event.kind === 'note').length,
    };
  }).toEqual({
    voiceOneKinds: ['rest'],
    voiceOneDurations: ['whole'],
    voiceTwoNoteCount: 4,
  });
  await expect.poll(async () => {
    const selected = (await readE2EState(page))?.selectedNote;
    return selected
      ? { measureNumber: selected.measureNumber, voiceId: selected.voiceId, isRest: selected.isRest }
      : null;
  }).toEqual({ measureNumber: 2, voiceId: 1, isRest: true });

  await page.keyboard.press('Escape');
  await expect.poll(async () => (await readE2EState(page))?.selectedNote).toBeNull();
});

test('browser cross-staff shortcut moves a selected note range to lower resting slots', async ({ page }) => {
  await bootWithScore(page, 'cross-staff-range-shortcut.musicxml', buildTwoStaffCrossStaffRangeFixtureXml());
  await waitForRenderedScore(page);

  await clickRenderedNotehead(page, 0);
  await expect.poll(async () => (await readE2EState(page))?.selectedNote?.staffIndex).toBe(1);
  await page.keyboard.press('Shift+ArrowRight');
  await expect.poll(async () => (await readE2EState(page))?.selectionCount).toBe(2);
  await page.keyboard.press('Shift+ArrowRight');
  await expect.poll(async () => (await readE2EState(page))?.selectionCount).toBe(3);

  await page.keyboard.press(`${MOD}+Shift+ArrowDown`);
  await expect.poll(async () => (await readE2EState(page))?.selectedNote?.staffIndex).toBe(2);
  await expect.poll(async () => {
    const core = await readCurrentCore(page);
    const upperEvents = core.score.parts[0].staves[0].measures[0].voices[0].events;
    const lowerEvents = core.score.parts[0].staves[1].measures[0].voices[0].events;
    return {
      upperKinds: upperEvents.slice(0, 3).map((event) => event.kind),
      lowerKinds: lowerEvents.slice(0, 3).map((event) => event.kind),
      lowerStaffs: lowerEvents.slice(0, 3).map((event) => event.staffIndex),
      lowerPitches: lowerEvents.slice(0, 3).map((event) => event.kind === 'note' ? `${event.pitch.step}${event.pitch.octave}` : null),
      selectedIsRest: (await readE2EState(page))?.selectedNote?.isRest,
    };
  }).toEqual({
    upperKinds: ['rest', 'rest', 'rest'],
    lowerKinds: ['note', 'note', 'rest'],
    lowerStaffs: [2, 2, 2],
    lowerPitches: ['C5', 'D5', null],
    selectedIsRest: true,
  });
});

test('browser cross-staff shortcut moves the selected chord tone to the lower staff', async ({ page }) => {
  await bootWithScore(page, 'cross-staff-chord-shortcut.musicxml', buildTwoStaffCrossStaffChordFixtureXml());
  await waitForRenderedScore(page);

  await clickRenderedNotehead(page, 0);
  await expect.poll(async () => (await readE2EState(page))?.selectionCount).toBe(1);

  await page.keyboard.press(`${MOD}+Shift+ArrowDown`);
  await expect.poll(async () => (await readE2EState(page))?.selectedNote?.staffIndex).toBe(2);
  await expect.poll(async () => (await readE2EState(page))?.selectionCount).toBe(1);
  await expect.poll(async () => {
    const core = await readCurrentCore(page);
    const upperEvents = core.score.parts[0].staves[0].measures[0].voices[0].events;
    const lowerEvents = core.score.parts[0].staves[1].measures[0].voices[0].events;
    return {
      upperAtStart: upperEvents
        .filter((event) => event.timestampNum === 0)
        .map((event) => event.kind === 'note' ? `${event.pitch.step}${event.pitch.octave}` : 'rest'),
      lowerChord: lowerEvents
        .filter((event) => event.kind === 'note' && event.timestampNum === 0)
        .map((event) => event.kind === 'note' ? `${event.pitch.step}${event.pitch.octave}:${event.isChord ? 'chord' : 'root'}` : ''),
      lowerStaffs: lowerEvents
        .filter((event) => event.kind === 'note' && event.timestampNum === 0)
        .map((event) => event.kind === 'note' ? event.staffIndex : 0),
    };
  }).toEqual({
    upperAtStart: ['C5'],
    lowerChord: ['E5:root'],
    lowerStaffs: [2],
  });
});

test('browser shortcut matrix covers note input durations, voices, repeat, and rest entry', async ({ page }) => {
  await bootWithScore(page, 'polyphonic.musicxml', buildPolyphonicFixtureXml());
  await waitForRenderedScore(page);
  await page.keyboard.press('Escape');

  await page.keyboard.press('N');
  await expect(page.getByTitle('Toggle note input (N)')).toHaveClass(/nex-brand-active/);
  await expect.poll(async () => (await readE2EState(page))?.noteInputMode).toBe(true);
  await expect.poll(async () => (await readE2EState(page))?.selectedNote?.measureNumber).toBe(1);
  await expect.poll(async () => (await readE2EState(page))?.selectedNote?.voiceId).toBe(1);
  await expect.poll(async () => (await readE2EState(page))?.selectedNote?.timestampNum).toBe(0);

  const durationByShortcut: Record<string, string> = {
    '1': '64',
    '2': '32',
    '3': '16',
    '4': '8',
    '5': '4',
    '6': '2',
    '7': '1',
  };
  for (const [key, duration] of Object.entries(durationByShortcut)) {
    await page.keyboard.press(key);
    await expect.poll(async () => (await readE2EState(page))?.selectedDuration).toBe(duration);
  }
  await page.keyboard.press('8');
  await expect.poll(async () => (await readE2EState(page))?.selectedDuration).toBe('breve');
  await page.keyboard.press('9');
  await expect.poll(async () => (await readE2EState(page))?.selectedDuration).toBe('long');

  for (const voice of [2, 3, 4, 1] as const) {
    await page.keyboard.press(`${MOD}+Alt+${voice}`);
    await expect.poll(async () => (await readE2EState(page))?.selectedVoice).toBe(voice);
  }

  await page.keyboard.press(`${MOD}+Alt+2`);
  await page.keyboard.press('5');
  await page.keyboard.press('.');
  await page.keyboard.press('B');

  await expect.poll(async () => {
    const core = await readCurrentCore(page);
    return core.score.parts[0].staves[0].measures[0].voices.some((voice) => (
      voice.voiceId === 2
      && voice.events.some((event) => event.kind === 'note' && event.pitch.step === 'B' && event.pitch.octave === 4)
    ));
  }).toBeTruthy();

  await page.keyboard.press('Shift+ArrowUp');
  await expect.poll(async () => {
    const core = await readCurrentCore(page);
    return core.score.parts[0].staves[0].measures[0].voices.some((voice) => (
      voice.voiceId === 2
      && voice.events.some((event) => event.kind === 'note' && event.pitch.step === 'B' && event.pitch.octave === 5)
    ));
  }).toBeTruthy();
  await page.keyboard.press('Shift+ArrowDown');
  await expect.poll(async () => {
    const core = await readCurrentCore(page);
    return core.score.parts[0].staves[0].measures[0].voices.some((voice) => (
      voice.voiceId === 2
      && voice.events.some((event) => event.kind === 'note' && event.pitch.step === 'B' && event.pitch.octave === 4)
    ));
  }).toBeTruthy();

  await page.keyboard.press('3');
  await page.keyboard.press('R');
  await expect.poll(async () => {
    const core = await readCurrentCore(page);
    return core.score.parts[0].staves[0].measures
      .flatMap((measure) => measure.voices)
      .filter((voice) => voice.voiceId === 2)
      .flatMap((voice) => voice.events)
      .filter((event) => event.kind === 'note' && event.pitch.step === 'B')
      .length;
  }).toBeGreaterThan(1);

  await page.keyboard.press('0');
  await expect.poll(async () => {
    const core = await readCurrentCore(page);
    return core.score.parts[0].staves[0].measures
      .flatMap((measure) => measure.voices)
      .filter((voice) => voice.voiceId === 2)
      .flatMap((voice) => voice.events)
      .some((event) => event.kind === 'rest');
  }).toBeTruthy();
});

test('browser shortcut matrix covers double accidental keyboard entry', async ({ page }) => {
  await bootWithScore(page, 'double-accidental-keyboard.musicxml', buildPolyphonicFixtureXml());
  await waitForRenderedScore(page);
  await page.keyboard.press('Escape');
  await page.keyboard.press('N');
  await page.keyboard.press('5');

  await page.keyboard.press('Alt+-');
  await page.keyboard.press('B');
  await expect.poll(async () => {
    const core = await readCurrentCore(page);
    return core.score.parts[0].staves[0].measures[0].voices.some((voice) => (
      voice.voiceId === 1
      && voice.events.some((event) => event.kind === 'note' && event.pitch.step === 'B' && event.pitch.alter === -2)
    ));
  }).toBeTruthy();

  await page.keyboard.press('Alt+=');
  await page.keyboard.press('F');
  await expect.poll(async () => {
    const core = await readCurrentCore(page);
    return core.score.parts[0].staves[0].measures[0].voices.some((voice) => (
      voice.voiceId === 1
      && voice.events.some((event) => event.kind === 'note' && event.pitch.step === 'F' && event.pitch.alter === 2)
    ));
  }).toBeTruthy();
});

test('note input advances after entry while the entered notes remain playable and visible', async ({ page }) => {
  await bootWithScore(page, 'blank-active-note-input.musicxml', buildBlankPianoFixtureXml(1));
  await waitForRenderedLayout(page);
  await page.keyboard.press('Escape');

  await page.keyboard.press('N');
  await page.keyboard.press('4'); // eighth note
  await page.keyboard.press('C');

  await expect.poll(async () => {
    const selected = (await readE2EState(page))?.selectedNote;
    return selected
      ? {
        measureNumber: selected.measureNumber,
        timestampRatio: selected.timestampNum / Math.max(selected.timestampDen, 1),
        isRest: selected.isRest,
      }
      : null;
  }).toEqual({
    measureNumber: 1,
    timestampRatio: 1 / 8,
    isRest: true,
  });

  await page.keyboard.press('D');
  await expect.poll(async () => {
    const events = (await readCurrentCore(page)).score.parts[0].staves[0].measures[0].voices[0]?.events ?? [];
    return events
      .filter((event) => event.kind === 'note')
      .map((event) => `${event.timestampNum / Math.max(event.timestampDen, 1)}:${event.pitch.step}${event.pitch.octave}:${event.durationType ?? 'none'}`);
  }).toEqual(['0:C4:eighth', `${1 / 8}:D4:eighth`]);

  await expect.poll(async () => {
    const selected = (await readE2EState(page))?.selectedNote;
    return selected
      ? {
        timestampRatio: selected.timestampNum / Math.max(selected.timestampDen, 1),
        isRest: selected.isRest,
      }
      : null;
  }).toEqual({
    timestampRatio: 2 / 8,
    isRest: true,
  });
});

test('note input covers replace, insert-between, and chord tone keyboard flows', async ({ page }) => {
  await bootWithScore(page, 'polyphonic-keyboard-flows.musicxml', buildPolyphonicFixtureXml());
  await waitForRenderedScore(page);

  await clickRenderedNotehead(page, 1);
  await page.keyboard.press('N');
  await page.keyboard.press('I'); // overwrite mode
  await page.keyboard.press('A');

  await expect.poll(async () => {
    const voice = (await readCurrentCore(page)).score.parts[0].staves[0].measures[0].voices
      .find((entry) => entry.voiceId === 1);
    if (!voice) return null;
    return voice.events
      .filter((event) => event.kind === 'note' && event.timestampNum === 1)
      .map((event) => event.kind === 'note' ? event.pitch.step : '')
      .join(',');
  }).toBe('A');

  const chordAnchor = (await readE2EState(page))?.selectedNote ?? null;
  expect(chordAnchor).toBeTruthy();
  if (!chordAnchor) throw new Error('Missing note-input chord anchor');
  await page.keyboard.press('Shift+E'); // chord tone on current onset
  await expect.poll(async () => {
    const voice = (await readCurrentCore(page)).score.parts[0].staves[chordAnchor.staffIndex - 1]?.measures[chordAnchor.measureNumber - 1]?.voices
      .find((entry) => entry.voiceId === chordAnchor.voiceId);
    if (!voice) return 0;
    return voice.events
      .filter((event) => event.kind === 'note' && event.timestampNum === chordAnchor.timestampNum && event.timestampDen === chordAnchor.timestampDen)
      .length;
  }).toBeGreaterThanOrEqual(2);

  await page.keyboard.press('I'); // back to insert mode
  await page.keyboard.press(`${MOD}+Shift+F`); // insert at cursor between neighboring onsets

  await expect.poll(async () => {
    const voice = (await readCurrentCore(page)).score.parts[0].staves[0].measures[0].voices
      .find((entry) => entry.voiceId === 1);
    if (!voice) return null;
    return voice.events
      .filter((event) => event.kind === 'note')
      .map((event) => `${event.timestampNum}/${event.timestampDen}:${event.pitch.step}${event.pitch.octave}`);
  }).toContainEqual(expect.stringContaining(':F4'));

});

test('browser Delete removes only the selected chord tone', async ({ page }) => {
  await bootWithScore(page, 'chord-tone-delete.musicxml', buildChordDeleteFixtureXml());
  await waitForRenderedScore(page);

  await clickRenderedNotehead(page, 1);
  const selected = (await readE2EState(page))?.selectedNote ?? null;
  expect(selected?.step).toBe('E');
  await expect.poll(async () => {
    const voice = (await readCurrentCore(page)).score.parts[0].staves[0]?.measures[0]?.voices
      .find((entry) => entry.voiceId === 1);
    return voice?.events
      .filter((event) => event.kind === 'note' && event.timestampNum === 0)
      .map((event) => event.kind === 'note' ? `${event.pitch.step}${event.pitch.octave}:${event.isChord ? 'chord' : 'root'}` : '') ?? [];
  }).toEqual(['C4:root', 'E4:chord']);

  await page.keyboard.press('Delete');
  await expect.poll(async () => {
    const voice = (await readCurrentCore(page)).score.parts[0].staves[0]?.measures[0]?.voices
      .find((entry) => entry.voiceId === 1);
    return voice?.events
      .filter((event) => event.timestampNum === 0)
      .map((event) => event.kind === 'note' ? `${event.pitch.step}${event.pitch.octave}:${event.isChord ? 'chord' : 'root'}` : 'rest') ?? [];
  }).toEqual(['C4:root']);
});

test('note input commit stays stable after zoom and view-mode changes', async ({ page }) => {
  await bootWithScore(page, 'polyphonic-zoom-view.musicxml', buildPolyphonicFixtureXml());
  await waitForRenderedScore(page);

  await clickRenderedNotehead(page, 2);
  const anchor = (await readE2EState(page))?.selectedNote ?? null;
  expect(anchor).toBeTruthy();
  if (!anchor) throw new Error('Missing selected note anchor for zoom/view note-entry test');

  await page.getByLabel('Score view mode').selectOption('continuous-horizontal');
  await page.getByLabel('Zoom preset').selectOption('150');
  await expect(page.getByLabel('Zoom percent')).toHaveValue('150');

  await page.getByLabel('Score view mode').selectOption('continuous-vertical');
  await page.getByLabel('Zoom preset').selectOption('100');
  await expect(page.getByLabel('Zoom percent')).toHaveValue('100');

  await page.keyboard.press('N');
  await page.keyboard.press('Shift+E');
  await expect.poll(async () => {
    const voice = (await readCurrentCore(page)).score.parts[0].staves[anchor.staffIndex - 1]?.measures[anchor.measureNumber - 1]?.voices
      .find((entry) => entry.voiceId === anchor.voiceId);
    if (!voice) return 0;
    return voice.events
      .filter((event) => event.kind === 'note'
        && event.timestampNum === anchor.timestampNum
        && event.timestampDen === anchor.timestampDen)
      .length;
  }).toBeGreaterThanOrEqual(2);
});

test('mouse note input shows a ghost preview and places a snapped note at the clicked slot', async ({ page }) => {
  await bootWithScore(page, 'polyphonic.musicxml', buildPolyphonicFixtureXml());
  await waitForRenderedScore(page);

  await page.keyboard.press('Escape');
  await page.keyboard.press('N');
  await page.keyboard.press('5');

  const sourcePitch = await noteheadCenter(page, 0);
  const targetSlot = await noteheadCenter(page, 2);
  await page.mouse.move(targetSlot.x, sourcePitch.y);

  const ghost = page.getByTestId('ghost-note-preview');
  await expect(ghost).toBeVisible();
  await expect(ghost).toHaveAttribute('data-ghost-measure', '1');
  expect(parseGhostPitch(await ghost.getAttribute('data-ghost-pitch'))).not.toBeNull();
  expect(parseTimestampRatio(await ghost.getAttribute('data-ghost-timestamp'))).toBe(0.5);
  const ghostBox = await ghost.boundingBox();
  expect(ghostBox).not.toBeNull();
  if (ghostBox) {
    const ghostCenterX = ghostBox.x + ghostBox.width / 2;
    expect(Math.abs(ghostCenterX - targetSlot.x)).toBeLessThan(28);
  }

  await page.mouse.click(targetSlot.x, sourcePitch.y);

  await expect.poll(async () => {
    const events = (await readCurrentCore(page)).score.parts[0].staves[0].measures[0].voices[0].events
      .filter((event) => event.kind === 'note');
    return events.length;
  }).toBe(4);

  await expect.poll(async () => {
    const voice = (await readCurrentCore(page)).score.parts[0].staves[0].measures[0].voices
      .find((entry) => entry.voiceId === 1);
    if (!voice) return null;
    return voice.events
      .filter((event) => event.kind === 'note')
      .map((event) => `${event.timestampNum}/${event.timestampDen}:${event.pitch.step}${event.pitch.octave}`);
  }).toEqual([
    '0/4:C4',
    '1/4:C4',
    '2/4:C4',
    '3/4:D4',
  ]);

  await expect.poll(async () => (await readE2EState(page))?.selectedNote?.measureNumber ?? null).toBe(1);
  await expect.poll(async () => (await readE2EState(page))?.selectedDuration).toBe('4');
});

test('mouse note input keeps ghost noteheads horizontally locked while hovering between slots', async ({ page }) => {
  await bootWithScore(page, 'blank-piano-horizontal-snap.musicxml', buildBlankPianoFixtureXml(2));
  await waitForRenderedLayout(page);

  await page.keyboard.press('Escape');
  await page.keyboard.press('N');
  await page.keyboard.press('5');

  const box = await measureOverlayBox(page, 1);
  const samples = new Map<number, number[]>();
  for (let index = 2; index <= 62; index += 1) {
    const x = box.x + (box.width * (index / 64));
    const y = box.y + (box.height * 0.23);
    await page.mouse.move(x, y);
    await page.waitForTimeout(20);
    const snapshot = await page.evaluate(() => {
      const element = document.querySelector<HTMLElement>('[data-testid="ghost-note-preview"]');
      if (!element || element.offsetParent === null) return null;
      const rect = element.getBoundingClientRect();
      const timestamp = element.dataset.ghostTimestamp ?? null;
      const noteheadCenterX = Number.parseFloat(element.dataset.ghostNoteheadCenterX ?? '0');
      return {
        ratio: timestamp ? Number(timestamp.split('/')[0]) / Number(timestamp.split('/')[1]) : null,
        noteheadX: rect.x + noteheadCenterX,
      };
    });
    if (!snapshot || snapshot.ratio == null || !Number.isFinite(snapshot.noteheadX)) continue;
    samples.set(snapshot.ratio, [...(samples.get(snapshot.ratio) ?? []), snapshot.noteheadX]);
  }

  expect([...samples.keys()].sort((left, right) => left - right)).toEqual([0, 0.25, 0.5, 0.75]);
  for (const [ratio, xs] of samples.entries()) {
    expect(xs.length, `not enough hover samples for ratio ${ratio}`).toBeGreaterThan(1);
    const min = Math.min(...xs);
    const max = Math.max(...xs);
    expect(max - min, `ghost notehead X drifted while hovering ratio ${ratio}: ${xs.join(', ')}`).toBeLessThanOrEqual(2);
  }
});

test('mouse note input keeps ghost noteheads horizontally locked after placing a note', async ({ page }) => {
  await bootWithScore(page, 'blank-piano-post-input-horizontal-snap.musicxml', buildBlankPianoFixtureXml(2));
  await waitForRenderedLayout(page);

  await page.keyboard.press('Escape');
  await page.keyboard.press('N');
  await page.keyboard.press('5');

  const initialGhostMap = await scanGhostMapForMeasure(page, 1);
  const firstQuarter = initialGhostMap.find((entry) => Math.abs(entry.ratio - 0) < 0.001);
  expect(firstQuarter).toBeTruthy();
  await clickGhostMapEntry(page, firstQuarter!);

  await expect.poll(async () => (await readE2EState(page))?.selectedNote?.timestampNum ?? null).toBe(8);

  const box = await measureOverlayBox(page, 1);
  const samples = new Map<number, number[]>();
  for (let index = 2; index <= 62; index += 1) {
    const x = box.x + (box.width * (index / 64));
    const y = box.y + (box.height * 0.23);
    await page.mouse.move(x, y);
    await page.waitForTimeout(20);
    const snapshot = await page.evaluate(() => {
      const element = document.querySelector<HTMLElement>('[data-testid="ghost-note-preview"]');
      if (!element || element.offsetParent === null) return null;
      const rect = element.getBoundingClientRect();
      const timestamp = element.dataset.ghostTimestamp ?? null;
      const noteheadCenterX = Number.parseFloat(element.dataset.ghostNoteheadCenterX ?? '0');
      return {
        ratio: timestamp ? Number(timestamp.split('/')[0]) / Number(timestamp.split('/')[1]) : null,
        noteheadX: rect.x + noteheadCenterX,
      };
    });
    if (!snapshot || snapshot.ratio == null || !Number.isFinite(snapshot.noteheadX)) continue;
    samples.set(snapshot.ratio, [...(samples.get(snapshot.ratio) ?? []), snapshot.noteheadX]);
  }

  const sampledRatios = [...samples.keys()].sort((left, right) => left - right);
  expect(sampledRatios).toContain(0.25);
  for (const [ratio, xs] of samples.entries()) {
    expect(xs.length, `not enough hover samples for ratio ${ratio}`).toBeGreaterThan(1);
    const min = Math.min(...xs);
    const max = Math.max(...xs);
    expect(max - min, `post-input ghost notehead X drifted while hovering ratio ${ratio}: ${xs.join(', ')}`).toBeLessThanOrEqual(2);
  }
});

test('ghost-map measurement follows visible rest anchors in blank piano measure 2', async ({ page }) => {
  await bootWithScore(page, 'blank-piano.musicxml', buildBlankPianoFixtureXml(2));
  await waitForRenderedLayout(page);

  await page.keyboard.press('Escape');
  await page.keyboard.press('N');
  await page.keyboard.press('5');

  const initialGhostMap = await scanGhostMapForMeasure(page, 2);
  expectGhostMapRatios(initialGhostMap, [0, 0.25, 0.5, 0.75]);

  const firstVisibleRest = initialGhostMap.find((entry) => entry.ratio === 0);
  expect(firstVisibleRest).toBeTruthy();
  await clickGhostMapEntry(page, firstVisibleRest!);

  await expect.poll(async () => (await readE2EState(page))?.selectedNote?.measureNumber ?? null).toBe(2);
  await expect.poll(async () => (await readE2EState(page))?.selectedNote?.timestampNum ?? null).toBe(8);

  const followupGhostMap = await scanGhostMapForMeasure(page, 2);
  const nextVisibleRest = followupGhostMap.find((entry) => entry.ratio === 0.25);
  expect(nextVisibleRest).toBeTruthy();
  await clickGhostMapEntry(page, nextVisibleRest!);

  await expect.poll(async () => {
    const voice = (await readCurrentCore(page)).score.parts[0].staves[0].measures[1].voices
      .find((entry) => entry.voiceId === 1);
    if (!voice) return null;
    return {
      totalDuration: voice.events.reduce((sum, event) => sum + event.durationDivisions, 0),
      notes: voice.events
        .filter((event) => event.kind === 'note')
        .map((event) => ({ start: event.timestampNum, duration: event.durationDivisions })),
    };
  }).toEqual({
    totalDuration: 32,
    notes: [
      { start: 0, duration: 8 },
      { start: 8, duration: 8 },
    ],
  });
});

test('mouse note input commits quarter notes on beats 1, 2, 3, and 4 in a truly empty 4/4 measure', async ({ page }) => {
  await bootWithScore(page, 'blank-piano-beat-by-beat.musicxml', buildBlankPianoFixtureXml(2));
  await waitForRenderedLayout(page);

  await page.keyboard.press('Escape');
  await page.keyboard.press('N');
  await page.keyboard.press('5');

  const expectedRatios = [0, 0.25, 0.5, 0.75];
  const initialGhostMap = await scanGhostMapForMeasure(page, 1);
  expectGhostMapRatios(initialGhostMap, expectedRatios);

  const firstQuarter = initialGhostMap.find((entry) => Math.abs(entry.ratio - 0) < 0.001);
  expect(firstQuarter).toBeTruthy();
  await clickGhostMapEntry(page, firstQuarter!);

  await expect.poll(async () => {
    const selected = (await readE2EState(page))?.selectedNote;
    return selected
      ? { measureNumber: selected.measureNumber, timestampNum: selected.timestampNum }
      : null;
  }).toEqual({
    measureNumber: 1,
    timestampNum: 8,
  });

  for (const ratio of expectedRatios.slice(1)) {
    const followupGhostMap = await scanGhostMapForMeasure(page, 1);
    const visibleFollowup = followupGhostMap.find((entry) => Math.abs(entry.ratio - ratio) < 0.001);
    expect(visibleFollowup).toBeTruthy();
    await clickGhostMapEntry(page, visibleFollowup!);
  }

  await expect.poll(async () => {
    const voice = (await readCurrentCore(page)).score.parts[0].staves[0].measures[0].voices
      .find((entry) => entry.voiceId === 1);
    if (!voice) return null;
    return {
      totalDuration: voice.events.reduce((sum, event) => sum + event.durationDivisions, 0),
      notes: voice.events
        .filter((event) => event.kind === 'note')
        .map((event) => ({ start: event.timestampNum, duration: event.durationDivisions }))
        .sort((left, right) => left.start - right.start),
    };
  }).toEqual({
    totalDuration: 32,
    notes: [
      { start: 0, duration: 8 },
      { start: 8, duration: 8 },
      { start: 16, duration: 8 },
      { start: 24, duration: 8 },
    ],
  });

  await expect.poll(async () => (await readE2EState(page))?.selectedNote?.measureNumber ?? null).toBe(2);
  await expect.poll(async () => (await readE2EState(page))?.selectedNote?.timestampNum ?? null).toBe(0);
});

test('mouse note input keeps snap geometry aligned after resize sync without zoom', async ({ page }) => {
  await bootWithScore(page, 'blank-piano-post-input-resize.musicxml', buildBlankPianoFixtureXml(2));
  await waitForRenderedLayout(page);

  await page.keyboard.press('Escape');
  await page.keyboard.press('N');
  await page.keyboard.press('5');

  const expectedRatios = [0, 0.25, 0.5, 0.75];
  const initialGhostMap = await scanGhostMapForMeasure(page, 1);
  expectGhostMapRatios(initialGhostMap, expectedRatios);

  const firstQuarter = initialGhostMap.find((entry) => Math.abs(entry.ratio - 0) < 0.001);
  expect(firstQuarter).toBeTruthy();
  await clickGhostMapEntry(page, firstQuarter!);

  await expect.poll(async () => {
    const selected = (await readE2EState(page))?.selectedNote;
    return selected
      ? { measureNumber: selected.measureNumber, timestampNum: selected.timestampNum }
      : null;
  }).toEqual({
    measureNumber: 1,
    timestampNum: 8,
  });

  for (const ratio of expectedRatios.slice(1)) {
    await page.evaluate(() => window.dispatchEvent(new Event('resize')));
    await page.waitForTimeout(120);

    const postResizeGhostMap = await scanGhostMapForMeasure(page, 1);
    const nextQuarter = postResizeGhostMap.find((entry) => Math.abs(entry.ratio - ratio) < 0.001);
    expect(nextQuarter).toBeTruthy();
    await page.mouse.move(nextQuarter!.x, nextQuarter!.y);

    const ghost = page.getByTestId('ghost-note-preview');
    await expect(ghost).toBeVisible();
    expect(parseTimestampRatio(await ghost.getAttribute('data-ghost-timestamp'))).toBe(ratio);
    const commitX = Number.parseFloat((await ghost.getAttribute('data-ghost-commit-x')) ?? '');
    const snapTrace = JSON.parse((await ghost.getAttribute('data-ghost-snap-trace')) ?? '{}') as {
      visible?: { visibleNoteheadX?: number | null };
    };
    expect(Number.isFinite(commitX)).toBe(true);
    expect(Math.abs((snapTrace.visible?.visibleNoteheadX ?? Number.NaN) - commitX)).toBeLessThanOrEqual(2);

    await clickGhostMapEntry(page, nextQuarter!);
  }

  await expect.poll(async () => {
    const voice = (await readCurrentCore(page)).score.parts[0].staves[0].measures[0].voices
      .find((entry) => entry.voiceId === 1);
    if (!voice) return null;
    return voice.events
      .filter((event) => event.kind === 'note')
      .map((event) => event.timestampNum)
      .sort((left, right) => left - right);
  }).toEqual([0, 8, 16, 24]);
});

test('ghost-map measurement exposes only visible rest anchors across later blank measures', async ({ page }) => {
  await bootWithScore(page, 'blank-piano-8.musicxml', buildBlankPianoFixtureXml(8));
  await waitForRenderedLayout(page);

  await page.keyboard.press('Escape');
  await page.keyboard.press('N');
  await page.keyboard.press('5');

  for (const measureNumber of [2, 3, 4]) {
    const ghostMap = await scanGhostMapForMeasure(page, measureNumber);
    expectGhostMapRatios(ghostMap, [0, 0.25, 0.5, 0.75]);
  }
});

test('later blank system-start measures keep mouse ghost pitch in a sane visible range', async ({ page }) => {
  await bootWithScore(page, 'blank-piano-10.musicxml', buildBlankPianoFixtureXml(10));
  await waitForRenderedLayout(page);

  await page.keyboard.press('Escape');
  await page.keyboard.press('N');
  await page.keyboard.press('5');

  const measure8GhostMap = await scanGhostMapForMeasure(page, 8);
  const firstQuarter = measure8GhostMap.find((entry) => entry.ratio === 0);
  expect(firstQuarter).toBeTruthy();

  await page.mouse.move(firstQuarter!.x, firstQuarter!.y);
  const ghost = page.getByTestId('ghost-note-preview');
  await expect(ghost).toBeVisible();
  const shownPitch = parseGhostPitch(await ghost.getAttribute('data-ghost-pitch'));
  expect(shownPitch).toBeTruthy();
  expect(shownPitch!.octave).toBeLessThanOrEqual(6);

  await clickGhostMapEntry(page, firstQuarter!);

  await expect.poll(async () => {
    const voice = (await readCurrentCore(page)).score.parts[0].staves[0].measures[7].voices
      .find((entry) => entry.voiceId === 1);
    const note = voice?.events.find((event) => event.kind === 'note');
    return note?.kind === 'note' ? note.pitch.octave : null;
  }).toBeLessThanOrEqual(6);
});

test('mouse note input does not create deep treble ledger notes from blank inter-staff clicks', async ({ page }) => {
  await bootWithScore(page, 'blank-piano-gap.musicxml', buildBlankPianoFixtureXml(4));
  await waitForRenderedLayout(page);

  await page.keyboard.press('Escape');
  await page.keyboard.press('N');
  await page.keyboard.press('5');

  const measure1Box = await measureOverlayBox(page, 1);
  const lowGapPoint = {
    x: measure1Box.x + (measure1Box.width * 0.06),
    y: measure1Box.y + (measure1Box.height * 0.98),
  };

  await page.mouse.move(lowGapPoint.x, lowGapPoint.y);
  const gapGhost = page.getByTestId('ghost-note-preview');
  await expect(gapGhost).toBeVisible();
  await expect.poll(async () => {
    const pitch = parseGhostPitch(await gapGhost.getAttribute('data-ghost-pitch'));
    return pitch?.octave ?? null;
  }).toBeLessThanOrEqual(6);
});

test('system-start ghost stays on the visible follow-up rest after input', async ({ page }) => {
  await bootWithScore(page, 'blank-piano-leading-rest.musicxml', buildBlankPianoFixtureXml(4));
  await waitForRenderedLayout(page);

  await page.keyboard.press('Escape');
  await page.keyboard.press('N');
  await page.keyboard.press('5');

  const initialGhostMap = await scanGhostMapForMeasure(page, 1);
  const firstQuarter = initialGhostMap.find((entry) => entry.ratio === 0);
  expect(firstQuarter).toBeTruthy();
  await clickGhostMapEntry(page, firstQuarter!);

  const followupGhostMap = await scanGhostMapForMeasure(page, 1);
  const visibleFollowup = followupGhostMap.find((entry) => entry.ratio === 0.25);
  expect(visibleFollowup).toBeTruthy();

  const measure1Box = await measureOverlayBox(page, 1);
  const leftMarginPoint = {
    x: measure1Box.x + (measure1Box.width * 0.04),
    y: measure1Box.y + (measure1Box.height * 0.23),
  };

  await page.mouse.move(leftMarginPoint.x, leftMarginPoint.y);
  await page.waitForTimeout(150);
  await expect.poll(async () => page.evaluate(() => {
    const element = document.querySelector<HTMLElement>('[data-testid="ghost-note-preview"]');
    return Boolean(element && element.offsetParent !== null);
  })).toBe(false);

  await page.mouse.move(visibleFollowup!.x, visibleFollowup!.y);
  const ghost = page.getByTestId('ghost-note-preview');
  await expect(ghost).toBeVisible();
  const commitX = Number.parseFloat((await ghost.getAttribute('data-ghost-commit-x')) ?? '');
  const snapTrace = JSON.parse((await ghost.getAttribute('data-ghost-snap-trace')) ?? '{}') as {
    visible?: { visibleNoteheadX?: number | null };
  };
  expect(parseTimestampRatio(await ghost.getAttribute('data-ghost-timestamp'))).toBe(0.25);
  expect(Number.isFinite(commitX)).toBe(true);
  expect(Math.abs((snapTrace.visible?.visibleNoteheadX ?? Number.NaN) - commitX)).toBeLessThanOrEqual(2);
});

test('clicking inside the visible ghost preview commits the same timestamp it shows', async ({ page }) => {
  await bootWithScore(page, 'blank-piano-visible-ghost.musicxml', buildBlankPianoFixtureXml(2));
  await waitForRenderedLayout(page);

  await page.keyboard.press('Escape');
  await page.keyboard.press('N');
  await page.keyboard.press('5');

  const initialGhostMap = await scanGhostMapForMeasure(page, 1);
  const firstQuarter = initialGhostMap.find((entry) => entry.ratio === 0);
  expect(firstQuarter).toBeTruthy();
  await clickGhostMapEntry(page, firstQuarter!);

  const followupGhostMap = await scanGhostMapForMeasure(page, 1);
  const visibleFollowup = followupGhostMap.find((entry) => entry.ratio === 0.25)
    ?? followupGhostMap.find((entry) => entry.ratio === 0.5)
    ?? followupGhostMap.find((entry) => entry.ratio === 0.75);
  expect(visibleFollowup).toBeTruthy();

  await page.mouse.move(visibleFollowup!.x, visibleFollowup!.y);
  const ghost = page.getByTestId('ghost-note-preview');
  await expect(ghost).toBeVisible();
  const shownTimestamp = await ghost.getAttribute('data-ghost-timestamp');
  expect(shownTimestamp).toBeTruthy();

  const ghostBox = await ghost.boundingBox();
  expect(ghostBox).toBeTruthy();
  const noteheadCenterX = Number.parseFloat((await ghost.getAttribute('data-ghost-notehead-center-x')) ?? '0');
  const noteheadCenterY = Number.parseFloat((await ghost.getAttribute('data-ghost-notehead-center-y')) ?? '28');
  await page.mouse.click(
    ghostBox!.x + noteheadCenterX,
    ghostBox!.y + noteheadCenterY,
  );

  const [shownNumText, shownDenText] = String(shownTimestamp).split('/');
  const shownNum = Number.parseInt(shownNumText ?? '', 10);
  const shownDen = Number.parseInt(shownDenText ?? '', 10);
  const expectedStart = shownDen === 0 ? null : ((shownNum / shownDen) * 32);

  await expect.poll(async () => {
    const voice = (await readCurrentCore(page)).score.parts[0].staves[0].measures[0].voices
      .find((entry) => entry.voiceId === 1);
    return voice?.events
      .filter((event) => event.kind === 'note')
      .map((event) => event.timestampNum)
      .sort((a, b) => a - b) ?? [];
  }).toEqual([0, expectedStart]);
});

test('mouse note input only exposes the visible follow-up rest after tiny pointer moves', async ({ page }) => {
  await bootWithScore(page, 'blank-piano-followup-ghost.musicxml', buildBlankPianoFixtureXml(2));
  await waitForRenderedLayout(page);

  await page.keyboard.press('Escape');
  await page.keyboard.press('N');
  await page.keyboard.press('5');

  const initialGhostMap = await scanGhostMapForMeasure(page, 1);
  const firstQuarter = initialGhostMap.find((entry) => entry.ratio === 0);
  expect(firstQuarter).toBeTruthy();
  const placedGhostPoint = await clickGhostMapEntry(page, firstQuarter!);

  await page.mouse.move(placedGhostPoint.x + 1, placedGhostPoint.y + 1);
  await page.waitForTimeout(150);
  await expect(page.getByTestId('ghost-note-preview')).toBeVisible();

  const followupGhostMap = await scanGhostMapForMeasure(page, 1);
  const visibleFollowup = followupGhostMap.find((entry) => entry.ratio === 0.25);
  expect(visibleFollowup).toBeTruthy();

  const ghost = page.getByTestId('ghost-note-preview');
  await page.mouse.move(visibleFollowup!.x, visibleFollowup!.y);
  await expect(ghost).toBeVisible();
  await expect.poll(async () => parseTimestampRatio(await ghost.getAttribute('data-ghost-timestamp'))).toBe(0.25);

  await page.mouse.move(visibleFollowup!.x + 18, visibleFollowup!.y + 1);
  await page.waitForTimeout(150);
  await expect.poll(async () => await ghost.getAttribute('data-ghost-timestamp')).not.toBe('0/4');
});

test('mouse note input can commit a multi-click ghost sequence across measure boundaries', async ({ page }) => {
  test.setTimeout(90_000);

  await bootWithScore(page, 'blank-piano-sequence.musicxml', buildBlankPianoFixtureXml(3));
  await waitForRenderedLayout(page);

  await page.keyboard.press('Escape');
  await page.keyboard.press('N');
  await page.keyboard.press('5');

  const placements = [
    { measureNumber: 1, ratio: 0, nextMeasureNumber: 1, nextTimestampNum: 8 },
    { measureNumber: 1, ratio: 0.25, nextMeasureNumber: 1, nextTimestampNum: 16 },
    { measureNumber: 1, ratio: 0.5, nextMeasureNumber: 1, nextTimestampNum: 24 },
    { measureNumber: 1, ratio: 0.75, nextMeasureNumber: 2, nextTimestampNum: 0 },
    { measureNumber: 2, ratio: 0, nextMeasureNumber: 2, nextTimestampNum: 8 },
    { measureNumber: 2, ratio: 0.25, nextMeasureNumber: 2, nextTimestampNum: 16 },
  ];
  for (const placement of placements) {
    const ghostMap = await scanGhostMapForMeasure(page, placement.measureNumber);
    const entry = ghostMap.reduce<typeof ghostMap[number] | null>((best, candidate) => {
      if (!best) return candidate;
      return Math.abs(candidate.ratio - placement.ratio) < Math.abs(best.ratio - placement.ratio)
        ? candidate
        : best;
    }, null);
    expect(entry).toBeTruthy();
    expect(Math.abs(entry!.ratio - placement.ratio)).toBeLessThan(0.001);
    await clickGhostMapEntry(page, entry!);

    await expect.poll(async () => {
      const selected = (await readE2EState(page))?.selectedNote;
      return selected
        ? { measureNumber: selected.measureNumber, timestampNum: selected.timestampNum }
        : null;
    }).toEqual({
      measureNumber: placement.nextMeasureNumber,
      timestampNum: placement.nextTimestampNum,
    });
  }

  await expect.poll(async () => {
    const staves = (await readCurrentCore(page)).score.parts[0].staves[0].measures;
    return staves.slice(0, 2).map((measure) => (
      measure.voices.find((entry) => entry.voiceId === 1)?.events
        .filter((event) => event.kind === 'note')
        .map((event) => event.timestampNum) ?? []
    ));
  }).toEqual([
    [0, 8, 16, 24],
    [0, 8],
  ]);

  await expect.poll(async () => {
    const measure = (await readCurrentCore(page)).score.parts[0].staves[0].measures[2];
    return measure.voices.find((entry) => entry.voiceId === 1)?.events.map((event) => ({
      kind: event.kind,
      timestampNum: event.timestampNum,
      durationType: event.durationType,
    })) ?? [];
  }).toEqual([
    { kind: 'rest', timestampNum: 0, durationType: 'whole' },
  ]);

  const followupGhostMap = await scanGhostMapForMeasure(page, 2);
  const visibleFollowup = followupGhostMap.find((entry) => entry.ratio === 0.5);
  expect(visibleFollowup).toBeTruthy();
});

test('mouse note input respects insert vs overwrite on occupied slots', async ({ page }) => {
  await bootWithScore(page, 'polyphonic.musicxml', buildPolyphonicFixtureXml());
  await waitForRenderedScore(page);

  const occupiedSlot = await noteheadCenter(page, 1);
  const sourcePitch = await noteheadCenter(page, 2);

  await page.keyboard.press('Escape');
  await page.keyboard.press('N');
  await page.keyboard.press('5');
  await page.mouse.move(occupiedSlot.x, sourcePitch.y);
  const insertGhost = page.getByTestId('ghost-note-preview');
  expect(parseTimestampRatio(await insertGhost.getAttribute('data-ghost-timestamp'))).not.toBeNull();
  expect(parseGhostPitch(await insertGhost.getAttribute('data-ghost-pitch'))).not.toBeNull();
  await page.mouse.click(occupiedSlot.x, sourcePitch.y);

  await expect.poll(async () => {
    const events = (await readCurrentCore(page)).score.parts[0].staves[0].measures[0].voices[0].events
      .filter((event) => event.kind === 'note');
    return events.length;
  }).toBe(4);

  await bootWithScore(page, 'polyphonic.musicxml', buildPolyphonicFixtureXml());
  await waitForRenderedScore(page);

  const overwriteSlot = await noteheadCenter(page, 1);
  const overwritePitch = await noteheadCenter(page, 2);

  await page.keyboard.press('Escape');
  await page.keyboard.press('N');
  await page.keyboard.press('I');
  await page.keyboard.press('5');
  await page.mouse.move(overwriteSlot.x, overwritePitch.y);
  const overwriteGhost = page.getByTestId('ghost-note-preview');
  expect(parseTimestampRatio(await overwriteGhost.getAttribute('data-ghost-timestamp'))).not.toBeNull();
  expect(parseGhostPitch(await overwriteGhost.getAttribute('data-ghost-pitch'))).not.toBeNull();
  await page.mouse.click(overwriteSlot.x, overwritePitch.y);

  await expect.poll(async () => {
    const events = (await readCurrentCore(page)).score.parts[0].staves[0].measures[0].voices[0].events
      .filter((event) => event.kind === 'note');
    return events.length;
  }).toBe(4);
});

test('mouse note input commits selected voice when clicking an existing notehead in another voice', async ({ page }) => {
  await bootWithScore(page, 'voice-2-on-notehead.musicxml', buildFourQuarterFixtureXml());
  await waitForRenderedScore(page);

  const targetNote = await noteheadCenter(page, 0);

  await page.keyboard.press('Escape');
  await page.keyboard.press('N');
  await page.keyboard.press('5');
  await page.getByTitle('Voice 2 (Cmd/Ctrl+Alt/Option+2)').click();
  await expect.poll(async () => (await readE2EState(page))?.selectedVoice).toBe(2);

  await page.mouse.move(targetNote.x, targetNote.y);
  const ghost = page.getByTestId('ghost-note-preview');
  await expect(ghost).toBeVisible();
  await expect(ghost).toHaveAttribute('data-ghost-voice', '2');
  await expect(ghost).toHaveAttribute('data-ghost-commit-voice', '2');

  await page.mouse.click(targetNote.x, targetNote.y);

  await expect.poll(async () => {
    const measure = (await readCurrentCore(page)).score.parts[0].staves[0].measures[0];
    const voiceOneNotes = measure.voices
      .find((voice) => voice.voiceId === 1)
      ?.events.filter((event) => event.kind === 'note')
      .map((event) => `${event.timestampNum}/${event.timestampDen}:${event.pitch.step}${event.pitch.octave}`) ?? [];
    const voiceTwoNotes = measure.voices
      .find((voice) => voice.voiceId === 2)
      ?.events.filter((event) => event.kind === 'note')
      .map((event) => `${event.timestampNum}/${event.timestampDen}:${event.pitch.step}${event.pitch.octave}`) ?? [];
    return { voiceOneNotes, voiceTwoNotes };
  }).toEqual({
    voiceOneNotes: ['0/4:C4', '1/4:D4', '2/4:E4', '3/4:F4'],
    voiceTwoNotes: ['0/4:C4'],
  });

  await expect.poll(async () => (await readE2EState(page))?.selectedNote?.voiceId ?? null).toBe(2);
});

test('direct notehead drag can transpose the existing note without toolbar mode buttons', async ({ page }) => {
  await bootWithScore(page, 'single-b.musicxml', buildSingleBFixtureXml());
  await waitForRenderedScore(page);

  await page.keyboard.press('Escape');
  if ((await readE2EState(page))?.noteInputMode) {
    await page.getByTitle('Toggle note input (N)').click();
  }
  await expect.poll(async () => (await readE2EState(page))?.noteInputMode ?? null).toBe(false);

  const target = await noteheadCenter(page, 0);
  await page.mouse.move(target.x, target.y);
  await page.mouse.down();
  await expect.poll(async () => (await readE2EState(page))?.selectedNote?.timestampNum ?? null).toBe(0);
  await page.mouse.move(target.x, target.y - 12, { steps: 4 });
  await page.mouse.up();

  await expect.poll(async () => {
    const voice = (await readCurrentCore(page)).score.parts[0].staves[0].measures[0].voices[0];
    const note = voice.events.find((event) => event.kind === 'note');
    return note?.kind === 'note'
      ? { step: note.pitch.step, alter: note.pitch.alter ?? 0, octave: note.pitch.octave, noteCount: voice.events.filter((event) => event.kind === 'note').length }
      : null;
  }).toEqual({ step: 'E', alter: 0, octave: 5, noteCount: 1 });
});

test('note input lets a near-notehead click activate beat 2 instead of placing a ghost note', async ({ page }) => {
  await bootWithScore(page, 'four-quarter-activation.musicxml', buildFourQuarterFixtureXml());
  await waitForRenderedScore(page);

  await page.keyboard.press('Escape');
  await page.keyboard.press('N');

  const secondNote = await noteheadCenter(page, 1);
  await page.mouse.click(secondNote.x + 7, secondNote.y + 3);

  await expect.poll(async () => {
    const selected = (await readE2EState(page))?.selectedNote;
    return selected
      ? {
          measureNumber: selected.measureNumber,
          staffIndex: selected.staffIndex,
          timestampNum: selected.timestampNum,
          timestampDen: selected.timestampDen,
          step: selected.step,
          octave: selected.octave,
          isRest: selected.isRest,
        }
      : null;
  }).toEqual({ measureNumber: 1, staffIndex: 1, timestampNum: 1, timestampDen: 4, step: 'D', octave: 4, isRest: false });

  const events = (await readCurrentCore(page)).score.parts[0].staves[0].measures[0].voices[0].events;
  expect(events.filter((event) => event.kind === 'note')).toHaveLength(4);

  await page.keyboard.press('ArrowUp');
  await expect.poll(async () => {
    const updatedEvents = (await readCurrentCore(page)).score.parts[0].staves[0].measures[0].voices[0].events
      .filter((event) => event.kind === 'note');
    const selectedEvent = updatedEvents[1];
    return selectedEvent?.kind === 'note'
      ? {
          step: selectedEvent.pitch.step,
          alter: selectedEvent.pitch.alter,
          octave: selectedEvent.pitch.octave,
          noteCount: updatedEvents.length,
        }
      : null;
  }).toEqual({ step: 'D', alter: 1, octave: 4, noteCount: 4 });
});

test('note input click activation moves the active anchor after keyboard entry', async ({ page }) => {
  await bootWithScore(page, 'four-quarter-keyboard-activation.musicxml', buildFourQuarterFixtureXml());
  await waitForRenderedScore(page);

  await page.keyboard.press('Escape');
  await page.keyboard.press('N');
  await page.keyboard.press('B');

  await expect.poll(async () => {
    const anchor = (await readE2EState(page))?.noteInputAnchor;
    return anchor ? { timestampNum: anchor.timestampNum, step: anchor.step, octave: anchor.octave } : null;
  }).toEqual({ timestampNum: 0, step: 'B', octave: 4 });
  await waitForRenderedScore(page);

  await clickRenderedNotehead(page, 1);

  await expect.poll(async () => {
    const state = await readE2EState(page);
    const selected = state?.selectedNote;
    const anchor = state?.noteInputAnchor;
    return selected && anchor
      ? {
          selectedTimestamp: selected.timestampNum,
          selectedStep: selected.step,
          anchorTimestamp: anchor.timestampNum,
          anchorStep: anchor.step,
          anchorIsRest: anchor.isRest,
        }
      : null;
  }).toEqual({
    selectedTimestamp: 1,
    selectedStep: 'D',
    anchorTimestamp: 1,
    anchorStep: 'D',
    anchorIsRest: false,
  });

  await page.keyboard.press('ArrowUp');
  await expect.poll(async () => {
    const state = await readE2EState(page);
    const anchor = state?.noteInputAnchor;
    const events = (await readCurrentCore(page)).score.parts[0].staves[0].measures[0].voices[0].events
      .filter((event) => event.kind === 'note');
    const clickedEvent = events[1];
    return anchor && clickedEvent?.kind === 'note'
      ? {
          eventStep: clickedEvent.pitch.step,
          eventAlter: clickedEvent.pitch.alter,
          eventOctave: clickedEvent.pitch.octave,
          anchorStep: anchor.step,
          anchorAlter: anchor.alter,
          anchorOctave: anchor.octave,
          noteCount: events.length,
        }
      : null;
  }).toEqual({ eventStep: 'D', eventAlter: 1, eventOctave: 4, anchorStep: 'D', anchorAlter: 1, anchorOctave: 4, noteCount: 4 });
});

test('note input can commit in measure 2 upper piano staff after hovering lower staff', async ({ page }) => {
  await bootWithScore(page, 'blank-piano-measure-2-upper-after-lower.musicxml', buildBlankPianoFixtureXml(2));
  await waitForRenderedLayout(page);

  await page.keyboard.press('Escape');
  await page.keyboard.press('N');
  await page.keyboard.press('5');

  const measure2 = await measureOverlayBox(page, 2);
  await page.mouse.move(measure2.x + measure2.width * 0.5, measure2.y + measure2.height * 0.78);

  const ghostMap = await scanGhostMapForMeasure(page, 2, { yRatios: [0.18, 0.23, 0.28] });
  expectGhostMapRatios(ghostMap, [0, 0.25, 0.5, 0.75]);
  const visibleRest = ghostMap.find((entry) => Math.abs(entry.ratio) < 0.001);
  expect(visibleRest).toBeTruthy();
  await clickGhostMapEntry(page, visibleRest!);

  await expect.poll(async () => {
    const core = await readCurrentCore(page);
    const upperVoice = core.score.parts[0].staves[0].measures[1].voices.find((entry) => entry.voiceId === 1);
    const lowerVoice = core.score.parts[0].staves[1].measures[1].voices.find((entry) => entry.voiceId === 1);
    return {
      upperNotes: upperVoice?.events
        .filter((event) => event.kind === 'note')
        .map((event) => ({ start: event.timestampNum, duration: event.durationDivisions })) ?? [],
      lowerNotes: lowerVoice?.events.filter((event) => event.kind === 'note').length ?? 0,
    };
  }).toEqual({
    upperNotes: [{ start: 0, duration: 8 }],
    lowerNotes: 0,
  });
});

test('note input exposes visible rest ghost targets across the lower piano staff', async ({ page }) => {
  await bootWithScore(page, 'blank-piano-lower-staff-ghosts.musicxml', buildBlankPianoFixtureXml(2));
  await waitForRenderedLayout(page);

  await page.keyboard.press('Escape');
  await page.keyboard.press('N');
  await page.keyboard.press('5');

  for (const measureNumber of [1, 2]) {
    const lowerGhostMap = await scanGhostMapForMeasure(page, measureNumber, {
      boxIndex: 1,
      yRatios: [0.5],
    });
    expectGhostMapRatios(lowerGhostMap, [0, 0.25, 0.5, 0.75]);
  }
});

test('note input commits the selected voice on lower piano staff rest targets', async ({ page }) => {
  await bootWithScore(page, 'blank-piano-lower-staff-voice-2.musicxml', buildBlankPianoFixtureXml(2));
  await waitForRenderedLayout(page);

  await page.keyboard.press('Escape');
  await page.keyboard.press('N');
  await page.keyboard.press('5');
  await page.getByTitle('Voice 2 (Cmd/Ctrl+Alt/Option+2)').click();
  await expect.poll(async () => (await readE2EState(page))?.selectedVoice).toBe(2);

  const lowerGhostMap = await scanGhostMapForMeasure(page, 1, {
    boxIndex: 1,
    yRatios: [0.5],
  });
  expect([...new Set(lowerGhostMap.map((entry) => entry.ratio))]).toEqual([0, 0.25, 0.5, 0.75]);
  const lowerRest = lowerGhostMap.find((entry) => Math.abs(entry.ratio) < 0.001);
  expect(lowerRest).toBeTruthy();

  await page.mouse.move(lowerRest!.x, lowerRest!.y);
  await expect.poll(async () => (await readE2EState(page))?.selectedVoice).toBe(2);
  const ghost = page.getByTestId('ghost-note-preview');
  await expect(ghost).toBeVisible();
  await expect(ghost).toHaveAttribute('data-ghost-staff', '2');
  await expect(ghost).toHaveAttribute('data-ghost-voice', '2');
  await expect(ghost).toHaveAttribute('data-ghost-commit-staff', '2');
  await expect(ghost).toHaveAttribute('data-ghost-commit-voice', '2');
  await clickGhostMapEntry(page, lowerRest!);

  await expect.poll(async () => {
    const lowerMeasure = (await readCurrentCore(page)).score.parts[0].staves[1].measures[0];
    const voiceOne = lowerMeasure.voices.find((entry) => entry.voiceId === 1);
    const voiceTwo = lowerMeasure.voices.find((entry) => entry.voiceId === 2);
    return {
      voiceOneKinds: voiceOne?.events.map((event) => event.kind) ?? [],
      voiceTwoNotes: voiceTwo?.events
        .filter((event) => event.kind === 'note')
        .map((event) => ({ staffIndex: event.staffIndex, start: event.timestampNum })) ?? [],
    };
  }).toEqual({
    voiceOneKinds: ['rest'],
    voiceTwoNotes: [{ staffIndex: 2, start: 0 }],
  });
});

test('debug doctor verifies multi-voice lower-staff input and note frequencies', async ({ page }) => {
  await bootWithScore(page, 'debug-doctor-lower-staff-voice-2.musicxml', buildBlankPianoFixtureXml(2), '/?debug=true');
  await waitForRenderedLayout(page);

  await page.keyboard.press('Escape');
  await page.keyboard.press('N');
  await page.keyboard.press('5');
  await page.getByTitle('Voice 2 (Cmd/Ctrl+Alt/Option+2)').click();
  await expect.poll(async () => (
    await page.evaluate(() => Boolean((window as any).__NEX_NOTE_DOCTOR__?.settings?.enabled))
  )).toBeTruthy();
  await expect.poll(async () => (await readE2EState(page))?.selectedVoice).toBe(2);

  const lowerGhostMap = await scanGhostMapForMeasure(page, 1, {
    boxIndex: 1,
    yRatios: [0.5],
  });
  const lowerRest = lowerGhostMap.find((entry) => Math.abs(entry.ratio) < 0.001);
  expect(lowerRest).toBeTruthy();

  await clickGhostMapEntry(page, lowerRest!);

  await expect.poll(async () => {
    const report = await page.evaluate(() => ((window as any).__NEX_NOTE_DOCTOR__?.lastReport ?? null));
    if (!report || !report.commandTypes?.includes('insertNoteAt')) return null;
    return {
      inputActive: report.rules?.byDomain?.input?.active ?? 0,
      playbackActive: report.rules?.byDomain?.playback?.active ?? 0,
      blockedRuleIds: report.issues
        ?.filter((issue: any) => [
          'input.multi-voice-command-realized',
          'input.multi-voice-event-routing',
          'playback.note-frequency-valid',
        ].includes(issue.ruleId))
        .map((issue: any) => issue.ruleId) ?? [],
    };
  }, { timeout: 15_000 }).toEqual({
    inputActive: expect.any(Number),
    playbackActive: expect.any(Number),
    blockedRuleIds: [],
  });

  const report = await page.evaluate(() => ((window as any).__NEX_NOTE_DOCTOR__?.lastReport ?? null));
  expect(report.rules.byDomain.input.active).toBeGreaterThanOrEqual(2);
  expect(report.rules.byDomain.playback.active).toBeGreaterThanOrEqual(1);
});

test('browser editing covers chord input, overwrite, pitch shortcuts, accidentals, and octave changes', async ({ page }) => {
  await bootWithScore(page, 'polyphonic.musicxml', buildPolyphonicFixtureXml());
  await waitForRenderedScore(page);

  await clickRenderedNotehead(page, 0);
  await page.keyboard.press('N');
  await page.keyboard.press(`${MOD}+Shift+H`);
  await expect.poll(async () => (await readE2EState(page))?.chordInputMode).toBeTruthy();
  await page.keyboard.press('E');

  await expect.poll(async () => {
    const core = await readCurrentCore(page);
    return core.score.parts[0].staves[0].measures[0].voices[0].events.filter((event) => (
      event.kind === 'note' && event.timestampNum === 0 && event.timestampDen === 4
    )).length;
  }).toBe(2);

  await bootWithScore(page, 'polyphonic.musicxml', buildPolyphonicFixtureXml());
  await waitForRenderedScore(page);
  await clickRenderedNotehead(page, 0);
  await page.keyboard.press('N');
  await page.keyboard.press('ArrowRight');
  await page.keyboard.press('I');
  await page.keyboard.press('G');
  await expect.poll(async () => {
    const core = await readCurrentCore(page);
    const target = core.score.parts[0].staves[0].measures[0].voices[0].events.find((event) => (
      event.kind === 'note' && event.timestampNum === 1 && event.timestampDen === 4
    ));
    return target?.kind === 'note' ? `${target.pitch.step}${target.pitch.octave}` : null;
  }).toBe('G4');

  await page.keyboard.press('N');
  await clickRenderedNotehead(page, 0);
  await page.keyboard.press('ArrowRight');
  await page.keyboard.press('ArrowRight');
  await page.getByTitle('Sharp (+)').click();
  await page.keyboard.press('A');
  await page.keyboard.press(`${MOD}+ArrowUp`);
  await page.keyboard.press('ArrowDown');

  await expect.poll(async () => {
    const core = await readCurrentCore(page);
    const target = core.score.parts[0].staves[0].measures[0].voices[0].events.find((event) => (
      event.kind === 'note' && event.timestampNum === 2 && event.timestampDen === 4
    ));
    return target?.kind === 'note'
      ? `${target.pitch.step}${target.pitch.alter === 1 ? '#' : target.pitch.alter === -1 ? 'b' : ''}${target.pitch.octave}`
      : null;
  }).toBe('A5');
});

test('browser shortcuts cover duplicate, copy, paste, and select-all', async ({ page }) => {
  await bootWithScore(page, 'polyphonic.musicxml', buildPolyphonicFixtureXml());
  await waitForRenderedScore(page);

  await clickRenderedNotehead(page, 0);
  const baselineNotes = (await readCurrentCore(page)).score.parts[0].staves[0].measures
    .flatMap((measure) => measure.voices)
    .filter((voice) => voice.voiceId === 1)
    .flatMap((voice) => voice.events).length;

  await page.getByTestId('score-viewport').press('Control+D');
  await expect.poll(async () => {
    const core = await readCurrentCore(page);
    return core.score.parts[0].staves[0].measures
      .flatMap((measure) => measure.voices)
      .filter((voice) => voice.voiceId === 1)
      .flatMap((voice) => voice.events).length;
  }).toBeGreaterThan(baselineNotes);
  await expect.poll(async () => (await readE2EState(page))?.canUndo).toBeTruthy();

  await page.getByTestId('score-viewport').press('Control+C');
  await page.keyboard.press('ArrowRight');
  await page.getByTestId('score-viewport').press('Control+V');
  await expect.poll(async () => {
    const core = await readCurrentCore(page);
    return core.score.parts[0].staves[0].measures
      .flatMap((measure) => measure.voices)
      .filter((voice) => voice.voiceId === 1)
      .flatMap((voice) => voice.events).length;
  }).toBeGreaterThan(baselineNotes + 1);

  await clickRenderedNotehead(page, 0);
  await page.getByTestId('score-viewport').press('Control+A');
  await expect.poll(async () => (await readE2EState(page))?.selectionCount).toBeGreaterThan(1);

});

test('browser articulation shortcuts toggle selected note markings', async ({ page }) => {
  await bootWithScore(page, 'articulation-shortcuts.musicxml', buildPolyphonicFixtureXml());
  await waitForRenderedScore(page);

  await clickRenderedNotehead(page, 0);
  await page.getByTestId('score-viewport').press('Shift+S');
  await page.getByTestId('score-viewport').press('Shift+.');
  await page.getByTestId('score-viewport').press('Shift+6');
  await page.getByTestId('score-viewport').press('Shift+Minus');

  await expect.poll(async () => {
    const event = (await readCurrentCore(page)).score.parts[0].staves[0].measures[0]?.voices[0]?.events[0];
    return event?.articulations?.sort() ?? [];
  }).toEqual(['accent', 'staccato', 'strong-accent', 'tenuto']);

  await expect.poll(async () => {
    const xml = await readCurrentXml(page);
    return ['<staccato/>', '<accent/>', '<strong-accent/>', '<tenuto/>']
      .every((token) => xml.includes(token));
  }).toBeTruthy();
});

test('browser shortcut X flips selected note stem direction and Shift+X toggles slash noteheads', async ({ page }, testInfo) => {
  await bootWithScore(page, 'stem-flip-shortcut.musicxml', buildFourQuarterFixtureXml());
  await waitForRenderedScore(page);

  await clickRenderedNotehead(page, 0);
  await page.getByTestId('score-viewport').press('X');
  await expect.poll(async () => {
    const core = await readCurrentCore(page);
    return core.score.parts[0].staves[0].measures[0]?.voices[0]?.events[0]?.stem;
  }).toBe('down');
  await expect.poll(async () => (await readCurrentXml(page)).includes('<stem>down</stem>')).toBeTruthy();

  await page.getByTestId('score-viewport').press('X');
  await expect.poll(async () => {
    const core = await readCurrentCore(page);
    return core.score.parts[0].staves[0].measures[0]?.voices[0]?.events[0]?.stem;
  }).toBe('up');

  await page.getByTestId('score-viewport').press('Shift+X');
  await expect.poll(async () => {
    const core = await readCurrentCore(page);
    return core.score.parts[0].staves[0].measures[0]?.voices[0]?.events[0]?.notehead;
  }).toBe('slash');
  await expect.poll(async () => (await readCurrentXml(page)).includes('<notehead>slash</notehead>')).toBeTruthy();

  await page.getByTestId('score-viewport').press('Shift+X');
  await expect.poll(async () => {
    const core = await readCurrentCore(page);
    return core.score.parts[0].staves[0].measures[0]?.voices[0]?.events[0]?.notehead ?? null;
  }).toBeNull();

  await testInfo.attach('stem-flip-shortcut', {
    body: await page.screenshot(),
    contentType: 'image/png',
  });
});

test('browser inspector and palette flows cover measure insertion, deletion, tie, grace note, and barline edits', async ({ page }) => {
  await bootWithScore(page, 'polyphonic.musicxml', buildPolyphonicFixtureXml());
  await waitForRenderedScore(page);

  await clickRenderedNotehead(page, 0);
  await page.keyboard.press(`${MOD}+End`);
  await expect.poll(async () => (await readE2EState(page))?.selectedNote?.measureNumber).toBe(2);

  await page.getByRole('button', { name: 'Inspector' }).click();
  await openInspectorSection(page, 'Measure');
  await page.getByRole('button', { name: 'Insert after m.2' }).click();
  await expect.poll(async () => (await readCurrentCore(page)).score.parts[0].staves[0].measures.length).toBe(3);

  await page.getByRole('button', { name: 'Delete m.2' }).click();
  await expect.poll(async () => (await readCurrentCore(page)).score.parts[0].staves[0].measures.length).toBe(2);

  await clickRenderedNotehead(page, 0);
  await page.keyboard.press('T');
  await expect.poll(async () => (await readCurrentXml(page)).includes('<tie type="start"/>')).toBeTruthy();

  await openNotationSection(page, /Expression/);
  await page.getByTitle('Grace note').click();
  await expect.poll(async () => (await readCurrentXml(page)).includes('<grace')).toBeTruthy();

  await page.getByRole('button', { name: 'Inspector' }).click();
  await openInspectorSection(page, 'Repeats & Endings');
  await page.getByRole('button', { name: 'End repeat on m.1' }).click();
  await expect.poll(async () => (await readCurrentXml(page)).includes('<repeat direction="backward"')).toBeTruthy();
});

test('browser tuplet tools cover triplet ranges on quarter notes and quintuplet ranges on eighth notes', async ({ page }) => {
  await bootWithScore(page, 'polyphonic.musicxml', buildPolyphonicFixtureXml());
  await waitForRenderedScore(page);

  await clickRenderedNotehead(page, 0);
  await page.keyboard.press('Shift+ArrowRight');
  await page.keyboard.press('Shift+ArrowRight');
  await openNotationSection(page, /Expression/);
  await expect(page.getByTitle('Septuplet 7:4 from selection (Cmd/Ctrl+7)')).toBeVisible();
  await page.getByTitle('Triplet from selection (Cmd/Ctrl+3)').click();
  await expect.poll(async () => {
    const xml = await readCurrentXml(page);
    return xml.includes('<actual-notes>3</actual-notes>') && xml.includes('<normal-notes>2</normal-notes>');
  }).toBeTruthy();

  await bootWithScore(page, 'quintuplet.musicxml', buildQuintupletFixtureXml());
  await waitForRenderedScore(page);
  await clickRenderedNotehead(page, 0);
  await page.keyboard.press('Shift+ArrowRight');
  await page.keyboard.press('Shift+ArrowRight');
  await page.keyboard.press('Shift+ArrowRight');
  await page.keyboard.press('Shift+ArrowRight');
  await openNotationSection(page, /Expression/);
  await page.getByTitle('Quintuplet from selection (Cmd/Ctrl+5)').click();
  await expect.poll(async () => {
    const xml = await readCurrentXml(page);
    return xml.includes('<actual-notes>5</actual-notes>') && xml.includes('<normal-notes>4</normal-notes>');
  }).toBeTruthy();
});
