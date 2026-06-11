import { expect, test } from '@playwright/test';
import type { Page, Route } from '@playwright/test';
import { Midi } from '@tonejs/midi';

const ARRANGEMENT_BOOT_XML = `<?xml version="1.0" encoding="UTF-8"?>
<score-partwise version="3.1">
  <work><work-title>Arrangement Chat Fixture</work-title></work>
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
      <note><rest measure="yes"/><duration>4</duration><voice>1</voice><type>whole</type><staff>1</staff></note>
    </measure>
  </part>
</score-partwise>`;

const ARRANGEMENT_COMMANDS = [
  {
    type: 'deleteRange',
    corePartId: 'part:P1',
    range: {
      start: {
        corePartId: 'part:P1',
        measureNumber: 1,
        staffIndex: 1,
        voiceId: 1,
        timestampNum: 0,
        timestampDen: 1,
      },
      end: {
        corePartId: 'part:P1',
        measureNumber: 1,
        staffIndex: 1,
        voiceId: 1,
        timestampNum: 1,
        timestampDen: 1,
      },
    },
  },
  {
    type: 'insertNoteAt',
    corePartId: 'part:P1',
    measureNumber: 1,
    staffIndex: 1,
    voiceId: 1,
    timestampNum: 0,
    timestampDen: 4,
    step: 'C',
    alter: 0,
    octave: 4,
    durationType: 'quarter',
  },
  {
    type: 'insertNoteAt',
    corePartId: 'part:P1',
    measureNumber: 1,
    staffIndex: 1,
    voiceId: 1,
    timestampNum: 1,
    timestampDen: 4,
    step: 'E',
    alter: 0,
    octave: 4,
    durationType: 'quarter',
  },
  {
    type: 'insertNoteAt',
    corePartId: 'part:P1',
    measureNumber: 1,
    staffIndex: 1,
    voiceId: 1,
    timestampNum: 2,
    timestampDen: 4,
    step: 'G',
    alter: 0,
    octave: 3,
    durationType: 'quarter',
  },
  { type: 'addChords', chords: '1:C' },
];

function buildMidiBody() {
  const midi = new Midi();
  midi.header.setTempo(120);
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

async function bootWithArrangementScore(page: Page) {
  await page.addInitScript(({ xml }: { xml: string }) => {
    const now = Date.now();
    localStorage.setItem('nex-note:score-library', JSON.stringify([{
      id: 'arrangement-chat-score',
      name: 'arrangement-chat.musicxml',
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
    localStorage.setItem('nex-note:e2e-boot', JSON.stringify({ xml, filename: 'arrangement-chat.musicxml' }));
  }, { xml: ARRANGEMENT_BOOT_XML });

  await page.goto('/?debug=true&visual-debug=true');
  await expect(page.locator('[data-testid="score-canvas"] svg')).toBeVisible({ timeout: 15_000 });
}

async function openAiPanel(page: Page) {
  const showPanel = page.getByRole('button', { name: /Show panel|Panel einblenden/ });
  if (await showPanel.isVisible()) {
    await showPanel.click();
  }
  const aiTab = page.getByRole('button', { name: 'AI', exact: true });
  if (await aiTab.isVisible()) {
    await aiTab.click();
  }
  await expect(page.getByPlaceholder('Describe your edit…')).toBeVisible({ timeout: 15_000 });
}

async function mockArrangementChat(page: Page) {
  let chatCalls = 0;
  await page.route('**/api/chat', async (route: Route) => {
    chatCalls += 1;
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        requiresConfirmation: true,
        explanation: 'Prepared a critic-checked three-voice arrangement preview.',
        workflowLabel: 'Arrangement assistant',
        commands: ARRANGEMENT_COMMANDS,
        affectedMeasures: [1],
        ambiguities: [],
        plan: ['Clear the existing voice', 'Write the realized voices', 'Add the C chord symbol'],
        riskReasons: ['Arrangement suggestions should stay previewable before apply'],
        validatorFindings: [],
        provider: 'ollama',
        model: 'mock-arranger',
        latencyMs: 12,
      }),
    });
  });
  return () => chatCalls;
}

async function readScorePitchState(page: Page) {
  return page.evaluate(() => {
    const xml = (window as typeof window & { __NEX_NOTE_E2E_STATE__?: { xml: string } }).__NEX_NOTE_E2E_STATE__?.xml ?? '';
    const doc = new DOMParser().parseFromString(xml, 'application/xml');
    const notes = Array.from(doc.getElementsByTagName('note'));
    const hasPitch = (step: string, octave: string) => notes.some((note) => (
      note.getElementsByTagName('step')[0]?.textContent === step
      && note.getElementsByTagName('octave')[0]?.textContent === octave
    ));
    return {
      c4: hasPitch('C', '4'),
      e4: hasPitch('E', '4'),
      g3: hasPitch('G', '3'),
      chordC: Array.from(doc.getElementsByTagName('harmony')).some((harmony) => (
        harmony.getElementsByTagName('root-step')[0]?.textContent === 'C'
      )),
    };
  });
}

test.beforeEach(async ({ page }) => {
  await mockStableRoutes(page);
});

test('arrangement chat preview stays pending until typed apply', async ({ page }) => {
  const chatCallCount = await mockArrangementChat(page);
  await bootWithArrangementScore(page);
  await openAiPanel(page);

  expect(await readScorePitchState(page)).toEqual({ c4: false, e4: false, g3: false, chordC: false });

  const input = page.getByPlaceholder('Describe your edit…');
  await input.fill('/arrange make a three voice setting');
  await page.getByRole('button', { name: 'Send' }).click();

  await expect(page.getByText('Prepared a critic-checked three-voice arrangement preview.')).toBeVisible();
  await expect(page.getByText(/Prepared 5 score operations: deleteRange, insertNoteAt x3, addChords\./)).toBeVisible();
  await expect(page.getByText('No score changes have been applied yet.')).toBeVisible();
  await expect(page.getByPlaceholder('Type apply to confirm or cancel to discard…')).toBeVisible();
  expect(await readScorePitchState(page)).toEqual({ c4: false, e4: false, g3: false, chordC: false });

  await page.getByPlaceholder('Type apply to confirm or cancel to discard…').fill('apply');
  await page.getByRole('button', { name: 'Send' }).click();

  await expect(page.getByText(/Applied operations: deleteRange, insertNoteAt x3, addChords\./)).toBeVisible();
  await expect.poll(async () => readScorePitchState(page)).toEqual({ c4: true, e4: true, g3: true, chordC: true });
  expect(chatCallCount()).toBe(1);
});

test('arrangement chat cancel discards the pending preview', async ({ page }) => {
  const chatCallCount = await mockArrangementChat(page);
  await bootWithArrangementScore(page);
  await openAiPanel(page);

  await page.getByPlaceholder('Describe your edit…').fill('/arrange make a three voice setting');
  await page.getByRole('button', { name: 'Send' }).click();
  await expect(page.getByPlaceholder('Type apply to confirm or cancel to discard…')).toBeVisible();
  expect(await readScorePitchState(page)).toEqual({ c4: false, e4: false, g3: false, chordC: false });

  await page.getByPlaceholder('Type apply to confirm or cancel to discard…').fill('cancel');
  await page.getByRole('button', { name: 'Send' }).click();

  await expect(page.getByText('Preview discarded.')).toBeVisible();
  expect(await readScorePitchState(page)).toEqual({ c4: false, e4: false, g3: false, chordC: false });
  expect(chatCallCount()).toBe(1);
});
