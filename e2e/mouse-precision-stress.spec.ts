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

function buildBlankGuitarTabXml() {
  return createNewScoreXml({
    instrumentIds: ['guitar-tab'],
    title: 'Blank Guitar TAB Entry',
    subtitle: '',
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
    const snapTrace = (() => {
      try {
        const parsed = JSON.parse(element.dataset.ghostSnapTrace ?? '{}') as {
          resolver?: unknown;
          reason?: unknown;
          placementIntent?: { mode?: unknown; anchor?: { timestamp?: unknown; isRest?: unknown } };
          resolvedTarget?: { mode?: unknown; timestamp?: unknown; diagnostics?: unknown };
        };
        return {
          resolver: typeof parsed.resolver === 'string' ? parsed.resolver : null,
          reason: typeof parsed.reason === 'string' ? parsed.reason : null,
          intentMode: typeof parsed.placementIntent?.mode === 'string' ? parsed.placementIntent.mode : null,
          anchorTimestamp: typeof parsed.placementIntent?.anchor?.timestamp === 'string'
            ? parsed.placementIntent.anchor.timestamp
            : null,
          anchorIsRest: typeof parsed.placementIntent?.anchor?.isRest === 'boolean'
            ? parsed.placementIntent.anchor.isRest
            : null,
          resolvedMode: typeof parsed.resolvedTarget?.mode === 'string' ? parsed.resolvedTarget.mode : null,
          resolvedTimestamp: typeof parsed.resolvedTarget?.timestamp === 'string' ? parsed.resolvedTarget.timestamp : null,
          resolvedDiagnostics: Array.isArray(parsed.resolvedTarget?.diagnostics)
            ? parsed.resolvedTarget.diagnostics.filter((entry): entry is string => typeof entry === 'string')
            : [],
        };
      } catch {
        return null;
      }
    })();
    return {
      measure: element.dataset.ghostMeasure ?? null,
      timestamp: element.dataset.ghostTimestamp ?? null,
      pitch: element.dataset.ghostPitch ?? null,
      staff: element.dataset.ghostStaff ?? null,
      mode: element.dataset.ghostMode ?? null,
      commitMode: element.dataset.ghostCommitMode ?? null,
      diagnostics: element.dataset.ghostDiagnostics ?? null,
      commitMeasure: element.dataset.ghostCommitMeasure ?? null,
      commitTimestamp: element.dataset.ghostCommitTimestamp ?? null,
      commitX: element.dataset.ghostCommitX ?? null,
      noteheadX: Number.parseFloat(element.dataset.ghostNoteheadCenterX ?? '0'),
      noteheadY: Number.parseFloat(element.dataset.ghostNoteheadCenterY ?? '28'),
      snapTrace,
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

async function findMeasureOneTreblePitchBeatOne(page: Page, pitch: string, near?: { x: number; y: number }) {
  const readCandidate = async (x: number, y: number) => {
    await page.mouse.move(x, y);
    const ghost = await readGhost(page);
    if (
      ghost?.measure === '1'
      && (ghost.timestamp ?? '').startsWith('0/')
      && ghost.staff === '1'
      && ghost.pitch === pitch
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
    return null;
  };

  if (near) {
    for (const yOffset of [5, 7, 9, 11, 13, 15, 18, 21, 24, 28, 32, 36, 40, 0, -5, -9]) {
      for (const xOffset of [0, -4, 4, -8, 8, -12, 12]) {
        const candidate = await readCandidate(near.x + xOffset, near.y + yOffset);
        if (candidate) return candidate;
      }
    }
  }

  const boxes = await page.locator('[data-measure-number="1"]').evaluateAll((elements) => (
    elements.map((element) => {
      const rect = element.getBoundingClientRect();
      return { x: rect.x, y: rect.y, width: rect.width, height: rect.height };
    })
  ));
  if (boxes.length < 2) throw new Error('Expected treble and bass measure overlays for measure 1');
  boxes.sort((a, b) => a.y - b.y || b.height - a.height || b.width - a.width);
  const trebleBox = boxes[0]!;

  const yRatios = Array.from({ length: 30 }, (_, index) => 0.18 + (index * 0.035));
  const xRatios = Array.from({ length: 9 }, (_, index) => 0.05 + (index * 0.035));

  for (const yRatio of yRatios) {
    for (const xRatio of xRatios) {
      const x = trebleBox.x + (trebleBox.width * xRatio);
      const y = trebleBox.y + (trebleBox.height * yRatio);
      const candidate = await readCandidate(x, y);
      if (candidate) return candidate;
    }
  }

  throw new Error(`Could not locate measure 1 beat 1 ${pitch} treble ghost`);
}

test.beforeEach(async ({ page }) => {
  await installPlaybackStubs(page);
});

test('blank Guitar + TAB score accepts its first mouse-entered note', async ({ page }) => {
  await bootWithScore(page, buildBlankGuitarTabXml());
  await page.keyboard.press('Escape');
  await page.keyboard.press('N');
  await page.keyboard.press('5');

  const target = await findMeasureOneTreblePitchBeatOne(page, 'C4');
  expect(target.ghost).toMatchObject({
    measure: '1',
    staff: '1',
    pitch: 'C4',
  });

  await page.mouse.click(target.hover.x, target.hover.y);

  await expect.poll(async () => {
    const core = await readCurrentCore(page);
    return core.score.parts[0].staves[0].measures[0].voices[0].events
      .filter((event) => event.kind === 'note')
      .map((event) => event.kind === 'note' ? `${event.pitch.step}${event.pitch.octave}` : '');
  }, {
    message: 'expected the first click in a blank Guitar + TAB score to create C4',
    timeout: 2_500,
    intervals: [100, 150, 250, 500],
  }).toContain('C4');
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

test('mouse note entry can build a four-note second cluster without lower notes being stolen by existing noteheads', async ({ page }) => {
  await bootWithScore(page, buildBlankPrecisionXml());
  await page.keyboard.press('Escape');
  await page.keyboard.press('N');
  await page.keyboard.press('5');

  let previousClick: { x: number; y: number } | undefined;
  for (const pitch of ['F4', 'E4', 'D4', 'C4']) {
    const target = await findMeasureOneTreblePitchBeatOne(page, pitch, previousClick);
    if (previousClick) {
      expect(target.ghost, `expected ${pitch} ghost to be chord-mode before click: ${JSON.stringify({
        hover: target.hover,
        click: target.click,
        ghost: target.ghost,
      })}`).toMatchObject({
        mode: 'chord',
        commitMode: 'chord',
      });
    }
    await page.mouse.click(target.click.x, target.click.y);
    previousClick = target.click;

    await expect.poll(async () => {
      const core = await readCurrentCore(page);
      return core.score.parts[0].staves[0].measures[0].voices[0].events
        .filter((event) => event.kind === 'note' && event.timestampNum === 0)
        .map((event) => event.kind === 'note'
          ? `${event.pitch.step}${event.pitch.alter === 1 ? '#' : event.pitch.alter === -1 ? 'b' : ''}${event.pitch.octave}`
          : '');
    }, {
      message: `expected mouse click to commit ${pitch} at beat one`,
      timeout: 2_500,
      intervals: [100, 150, 250, 500],
    }).toContain(pitch);
  }

  const core = await readCurrentCore(page);
  const beatOnePitches = core.score.parts[0].staves[0].measures[0].voices[0].events
    .filter((event) => event.kind === 'note' && event.timestampNum === 0)
    .map((event) => event.kind === 'note'
      ? `${event.pitch.step}${event.pitch.alter === 1 ? '#' : event.pitch.alter === -1 ? 'b' : ''}${event.pitch.octave}:${event.isChord ? 'chord' : 'root'}`
      : '')
    .sort();

  expect(beatOnePitches).toEqual(['C4:chord', 'D4:chord', 'E4:chord', 'F4:root']);
});
