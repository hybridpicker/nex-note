import { expect, test } from '@playwright/test';
import type { Page } from '@playwright/test';

import { createNewScoreXml } from '../lib/new-score.ts';
import { importMusicXmlToCore } from '../src/musicxml-adapter/import/import-musicxml.ts';

function buildBlankPrecisionXml() {
  return createNewScoreXml({
    instrumentIds: ['piano'],
    title: 'Mouse Precision Stress',
    subtitle: 'Exact ghost-to-commit mapping',
    composer: '',
    lyricist: '',
    copyright: '',
    keySignatureId: 'c-major',
    timeBeats: 4,
    timeBeatType: 4,
    tempo: { bpm: 120, beatUnit: 'quarter', showMarking: true },
    measureCount: 4,
    pickup: { enabled: false, beats: 1, beatType: 4 },
  });
}

async function installPlaybackStubs(page: Page) {
  await page.addInitScript(() => {
    (window as typeof window & {
      __NEX_NOTE_E2E_INSTRUMENT_LOADER__?: () => Promise<{ start: () => void; stop: () => void }>;
    }).__NEX_NOTE_E2E_INSTRUMENT_LOADER__ = async () => ({
      start() {},
      stop() {},
    });
  });
}

async function bootWithScore(page: Page, xml: string) {
  await page.addInitScript(({ xml: bootXml }: { xml: string }) => {
    localStorage.setItem('nex-note:e2e-boot', JSON.stringify({
      xml: bootXml,
      filename: 'mouse-precision-stress.musicxml',
    }));
  }, { xml });
  await page.goto('/');
  await expect(page.locator('[data-measure-number]').first()).toBeVisible({ timeout: 15_000 });
  await page.getByTestId('score-viewport').focus();
}

async function readCurrentCore(page: Page) {
  const xml = await page.evaluate(() => (
    (window as typeof window & {
      __NEX_NOTE_E2E_STATE__?: { xml: string };
    }).__NEX_NOTE_E2E_STATE__?.xml ?? ''
  ));
  return importMusicXmlToCore(xml);
}

async function readGhost(page: Page) {
  return page.evaluate(() => {
    const element = document.querySelector<HTMLElement>('[data-testid="ghost-note-preview"]');
    if (!element || element.offsetParent === null) return null;
    const box = element.getBoundingClientRect();
    return {
      measure: element.dataset.ghostMeasure ?? null,
      timestamp: element.dataset.ghostTimestamp ?? null,
      pitch: element.dataset.ghostPitch ?? null,
      staff: element.dataset.ghostStaff ?? null,
      noteheadX: Number.parseFloat(element.dataset.ghostNoteheadCenterX ?? '0'),
      noteheadY: Number.parseFloat(element.dataset.ghostNoteheadCenterY ?? '28'),
      box: { x: box.x, y: box.y, width: box.width, height: box.height },
    };
  });
}

async function findMeasureOneBassE2BeatOne(page: Page) {
  const boxes = await page.locator('[data-measure-number="1"]').evaluateAll((elements) => (
    elements.map((element) => {
      const rect = element.getBoundingClientRect();
      return { x: rect.x, y: rect.y, width: rect.width, height: rect.height };
    })
  ));
  if (boxes.length < 2) throw new Error('Expected treble and bass measure overlays for measure 1');
  boxes.sort((a, b) => a.y - b.y || b.height - a.height || b.width - a.width);
  const bassBox = boxes[1]!;

  const yRatios = Array.from({ length: 41 }, (_, index) => 0.20 + (index * 0.04));
  const xRatios = Array.from({ length: 18 }, (_, index) => 0.04 + (index * 0.04));

  for (const yRatio of yRatios) {
    for (const xRatio of xRatios) {
      const x = bassBox.x + (bassBox.width * xRatio);
      const y = bassBox.y + (bassBox.height * yRatio);
      await page.mouse.move(x, y);
      const ghost = await readGhost(page);
      if (
        ghost?.measure === '1'
        && (ghost.timestamp === '0/1' || ghost.timestamp === '0/32')
        && ghost.staff === '2'
        && ghost.pitch === 'E2'
      ) {
        return {
          hover: { x, y },
          click: {
            x: ghost.box.x + ghost.noteheadX,
            y: ghost.box.y + ghost.noteheadY,
          },
          ghost,
        };
      }
    }
  }

  throw new Error('Could not locate measure 1 beat 1 E2 bass ghost');
}

test.beforeEach(async ({ page }) => {
  await installPlaybackStubs(page);
});

test('mouse click commits the same measure, timestamp, and pitch as the visible E2 bass ghost', async ({ page }) => {
  await bootWithScore(page, buildBlankPrecisionXml());
  await page.keyboard.press('Escape');
  await page.keyboard.press('N');
  await page.keyboard.press('5');

  const target = await findMeasureOneBassE2BeatOne(page);
  expect(target.ghost).toMatchObject({
    measure: '1',
    staff: '2',
    pitch: 'E2',
  });
  expect(['0/1', '0/32']).toContain(target.ghost.timestamp);

  await page.mouse.click(target.click.x, target.click.y);

  await expect.poll(async () => {
    const core = await readCurrentCore(page);
    const events = core.score.parts[0].staves[1].measures.flatMap((measure) => (
      measure.voices.flatMap((voice) => (
        voice.events.map((event) => ({
          measure: measure.measureNumber,
          voice: voice.voiceId,
          offset: `${event.timestampNum}/${event.timestampDen}`,
          pitch: event.kind === 'note'
            ? `${event.pitch.step}${event.pitch.alter === 1 ? '#' : event.pitch.alter === -1 ? 'b' : ''}${event.pitch.octave}`
            : 'rest',
        }))
      ))
    ));
    return events.filter((event) => event.pitch === 'E2');
  }, {
    timeout: 2_500,
    intervals: [100, 150, 250, 500],
  }).toEqual([
    {
      measure: 1,
      voice: 1,
      offset: '0/32',
      pitch: 'E2',
    },
  ]);

  const core = await readCurrentCore(page);
  const wrongMeasureHit = core.score.parts[0].staves[1].measures
    .filter((measure) => measure.measureNumber !== 1)
    .some((measure) => measure.voices.some((voice) => voice.events.some((event) => (
      event.kind === 'note'
      && event.timestampNum === 0
      && event.pitch.step === 'E'
      && event.pitch.octave === 2
    ))));
  expect(wrongMeasureHit).toBe(false);
});
