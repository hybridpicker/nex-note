import fs from 'node:fs/promises';
import path from 'node:path';

import { expect, test } from '@playwright/test';
import type { Page, TestInfo } from '@playwright/test';

import { createNewScoreXml } from '../lib/new-score.ts';
import { importMusicXmlToCore } from '../src/musicxml-adapter/import/import-musicxml.ts';

type DurationKey = '2' | '4' | '8';
type StaffName = 'treble' | 'bass';

type ExpectedEvent = {
  measure: number;
  staff: 1 | 2;
  voice: number;
  offset: string;
  duration: string;
  pitch?: string;
  rest?: true;
};

type StressStep = {
  label: string;
  measure: number;
  staff: StaffName;
  voice: number;
  timestamp: string;
  duration: DurationKey;
  dotted?: boolean;
  pitch: string;
  mode?: 'insert' | 'replace' | 'chord';
  nearBoundary?: 'left' | 'right';
  expected: ExpectedEvent;
};

const SCORE_SOURCE = process.env.NEX_STRESS_SOURCE_PDF ?? 'external-score.pdf';
const STRESS_DIR = path.join(process.cwd(), 'test-results', 'real-score-stress');
let currentDotted = false;

function parsePositiveInteger(value: string | undefined, fallback: number) {
  if (!value) return fallback;
  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

const passageChecklist: StressStep[] = [
  {
    label: 'm1 RH beat 1 middle C quarter, full-rest replacement starts melody',
    measure: 1,
    staff: 'treble',
    voice: 1,
    timestamp: '0/1',
    duration: '4',
    pitch: 'C4',
    mode: 'replace',
    expected: { measure: 1, staff: 1, voice: 1, offset: '0/32', duration: '8', pitch: 'C4' },
  },
  {
    label: 'm1 RH beat 2 D eighth, click just left of beat boundary',
    measure: 1,
    staff: 'treble',
    voice: 1,
    timestamp: '1/4',
    duration: '8',
    pitch: 'D4',
    nearBoundary: 'left',
    expected: { measure: 1, staff: 1, voice: 1, offset: '8/32', duration: '4', pitch: 'D4' },
  },
  {
    label: 'm1 RH final eighth repeats C, no fallback to previous onset',
    measure: 1,
    staff: 'treble',
    voice: 1,
    timestamp: '3/8',
    duration: '8',
    pitch: 'C4',
    expected: { measure: 1, staff: 1, voice: 1, offset: '12/32', duration: '4', pitch: 'C4' },
  },
  {
    label: 'm1 LH half-note C, switch to lower piano staff',
    measure: 1,
    staff: 'bass',
    voice: 1,
    timestamp: '0/1',
    duration: '2',
    pitch: 'C3',
    mode: 'replace',
    expected: { measure: 1, staff: 2, voice: 1, offset: '0/32', duration: '16', pitch: 'C3' },
  },
  {
    label: 'm2 RH beat 1 E quarter after re-render',
    measure: 2,
    staff: 'treble',
    voice: 1,
    timestamp: '0/1',
    duration: '4',
    pitch: 'E4',
    mode: 'replace',
    expected: { measure: 2, staff: 1, voice: 1, offset: '0/32', duration: '8', pitch: 'E4' },
  },
  {
    label: 'm2 RH beat 2 repeated E quarter, same pitch twice in a row',
    measure: 2,
    staff: 'treble',
    voice: 1,
    timestamp: '1/4',
    duration: '4',
    pitch: 'E4',
    nearBoundary: 'right',
    expected: { measure: 2, staff: 1, voice: 1, offset: '8/32', duration: '8', pitch: 'E4' },
  },
  {
    label: 'm3 LH beat 1 C half, lower-staff commit before upper rest split',
    measure: 3,
    staff: 'bass',
    voice: 1,
    timestamp: '0/1',
    duration: '2',
    pitch: 'C3',
    mode: 'replace',
    expected: { measure: 3, staff: 2, voice: 1, offset: '0/32', duration: '16', pitch: 'C3' },
  },
  {
    label: 'm3 RH beat 2 G quarter splits a whole-measure rest',
    measure: 3,
    staff: 'treble',
    voice: 1,
    timestamp: '1/4',
    duration: '4',
    pitch: 'G4',
    expected: { measure: 3, staff: 1, voice: 1, offset: '8/32', duration: '8', pitch: 'G4' },
  },
  {
    label: 'm4 RH dotted quarter G, duration toggle must affect ghost grid',
    measure: 4,
    staff: 'treble',
    voice: 1,
    timestamp: '0/1',
    duration: '4',
    dotted: true,
    pitch: 'G4',
    mode: 'replace',
    expected: { measure: 4, staff: 1, voice: 1, offset: '0/32', duration: '12', pitch: 'G4' },
  },
  {
    label: 'm4 RH final eighth E after dotted quarter, continue without manual alignment',
    measure: 4,
    staff: 'treble',
    voice: 1,
    timestamp: '3/8',
    duration: '8',
    pitch: 'E4',
    expected: { measure: 4, staff: 1, voice: 1, offset: '12/32', duration: '4', pitch: 'E4' },
  },
  {
    label: 'm5 RH beat 1 C chord fallback with Alt on an occupied onset',
    measure: 5,
    staff: 'treble',
    voice: 1,
    timestamp: '0/1',
    duration: '4',
    pitch: 'E4',
    mode: 'replace',
    expected: { measure: 5, staff: 1, voice: 1, offset: '0/32', duration: '8', pitch: 'E4' },
  },
  {
    label: 'm5 RH add G to the beat-1 chord, must not jump to a neighboring slot',
    measure: 5,
    staff: 'treble',
    voice: 1,
    timestamp: '0/1',
    duration: '4',
    pitch: 'G4',
    mode: 'chord',
    expected: { measure: 5, staff: 1, voice: 1, offset: '0/32', duration: '8', pitch: 'G4' },
  },
  {
    label: 'm5 RH beat 2 E quarter after chord',
    measure: 5,
    staff: 'treble',
    voice: 1,
    timestamp: '1/4',
    duration: '4',
    pitch: 'E4',
    expected: { measure: 5, staff: 1, voice: 1, offset: '8/32', duration: '8', pitch: 'E4' },
  },
  {
    label: 'm6 LH C half before upper staff input',
    measure: 6,
    staff: 'bass',
    voice: 1,
    timestamp: '0/1',
    duration: '2',
    pitch: 'C3',
    mode: 'replace',
    expected: { measure: 6, staff: 2, voice: 1, offset: '0/32', duration: '16', pitch: 'C3' },
  },
  {
    label: 'm6 RH beat 1 C quarter',
    measure: 6,
    staff: 'treble',
    voice: 1,
    timestamp: '0/1',
    duration: '4',
    pitch: 'C4',
    mode: 'replace',
    expected: { measure: 6, staff: 1, voice: 1, offset: '0/32', duration: '8', pitch: 'C4' },
  },
  {
    label: 'm6 RH beat 2 D quarter',
    measure: 6,
    staff: 'treble',
    voice: 1,
    timestamp: '1/4',
    duration: '4',
    pitch: 'D4',
    expected: { measure: 6, staff: 1, voice: 1, offset: '8/32', duration: '8', pitch: 'D4' },
  },
  {
    label: 'm7 LH C half before upper staff input',
    measure: 7,
    staff: 'bass',
    voice: 1,
    timestamp: '0/1',
    duration: '2',
    pitch: 'C3',
    mode: 'replace',
    expected: { measure: 7, staff: 2, voice: 1, offset: '0/32', duration: '16', pitch: 'C3' },
  },
  {
    label: 'm7 RH beat 1 C quarter',
    measure: 7,
    staff: 'treble',
    voice: 1,
    timestamp: '0/1',
    duration: '4',
    pitch: 'C4',
    mode: 'replace',
    expected: { measure: 7, staff: 1, voice: 1, offset: '0/32', duration: '8', pitch: 'C4' },
  },
  {
    label: 'm7 RH beat 2 E quarter',
    measure: 7,
    staff: 'treble',
    voice: 1,
    timestamp: '1/4',
    duration: '4',
    pitch: 'E4',
    expected: { measure: 7, staff: 1, voice: 1, offset: '8/32', duration: '8', pitch: 'E4' },
  },
  {
    label: 'm8 LH C half before upper staff input',
    measure: 8,
    staff: 'bass',
    voice: 1,
    timestamp: '0/1',
    duration: '2',
    pitch: 'C3',
    mode: 'replace',
    expected: { measure: 8, staff: 2, voice: 1, offset: '0/32', duration: '16', pitch: 'C3' },
  },
  {
    label: 'm8 RH beat 1 E quarter',
    measure: 8,
    staff: 'treble',
    voice: 1,
    timestamp: '0/1',
    duration: '4',
    pitch: 'E4',
    mode: 'replace',
    expected: { measure: 8, staff: 1, voice: 1, offset: '0/32', duration: '8', pitch: 'E4' },
  },
  {
    label: 'm8 RH beat 2 F quarter',
    measure: 8,
    staff: 'treble',
    voice: 1,
    timestamp: '1/4',
    duration: '4',
    pitch: 'F4',
    expected: { measure: 8, staff: 1, voice: 1, offset: '8/32', duration: '8', pitch: 'F4' },
  },
  {
    label: 'm9 LH C half starts reprise line',
    measure: 9,
    staff: 'bass',
    voice: 1,
    timestamp: '0/1',
    duration: '2',
    pitch: 'C3',
    mode: 'replace',
    expected: { measure: 9, staff: 2, voice: 1, offset: '0/32', duration: '16', pitch: 'C3' },
  },
  {
    label: 'm9 RH beat 1 C quarter',
    measure: 9,
    staff: 'treble',
    voice: 1,
    timestamp: '0/1',
    duration: '4',
    pitch: 'C4',
    mode: 'replace',
    expected: { measure: 9, staff: 1, voice: 1, offset: '0/32', duration: '8', pitch: 'C4' },
  },
  {
    label: 'm9 RH beat 2 D eighth',
    measure: 9,
    staff: 'treble',
    voice: 1,
    timestamp: '1/4',
    duration: '8',
    pitch: 'D4',
    expected: { measure: 9, staff: 1, voice: 1, offset: '8/32', duration: '4', pitch: 'D4' },
  },
  {
    label: 'm9 RH final C eighth',
    measure: 9,
    staff: 'treble',
    voice: 1,
    timestamp: '3/8',
    duration: '8',
    pitch: 'C4',
    expected: { measure: 9, staff: 1, voice: 1, offset: '12/32', duration: '4', pitch: 'C4' },
  },
  {
    label: 'm10 LH C half before upper staff input',
    measure: 10,
    staff: 'bass',
    voice: 1,
    timestamp: '0/1',
    duration: '2',
    pitch: 'C3',
    mode: 'replace',
    expected: { measure: 10, staff: 2, voice: 1, offset: '0/32', duration: '16', pitch: 'C3' },
  },
  {
    label: 'm10 RH beat 1 E quarter',
    measure: 10,
    staff: 'treble',
    voice: 1,
    timestamp: '0/1',
    duration: '4',
    pitch: 'E4',
    mode: 'replace',
    expected: { measure: 10, staff: 1, voice: 1, offset: '0/32', duration: '8', pitch: 'E4' },
  },
  {
    label: 'm10 RH beat 2 C quarter',
    measure: 10,
    staff: 'treble',
    voice: 1,
    timestamp: '1/4',
    duration: '4',
    pitch: 'C4',
    expected: { measure: 10, staff: 1, voice: 1, offset: '8/32', duration: '8', pitch: 'C4' },
  },
  {
    label: 'm11 LH C half before upper staff input',
    measure: 11,
    staff: 'bass',
    voice: 1,
    timestamp: '0/1',
    duration: '2',
    pitch: 'C3',
    mode: 'replace',
    expected: { measure: 11, staff: 2, voice: 1, offset: '0/32', duration: '16', pitch: 'C3' },
  },
  {
    label: 'm11 RH beat 1 G quarter',
    measure: 11,
    staff: 'treble',
    voice: 1,
    timestamp: '0/1',
    duration: '4',
    pitch: 'G4',
    mode: 'replace',
    expected: { measure: 11, staff: 1, voice: 1, offset: '0/32', duration: '8', pitch: 'G4' },
  },
  {
    label: 'm11 RH beat 2 E quarter',
    measure: 11,
    staff: 'treble',
    voice: 1,
    timestamp: '1/4',
    duration: '4',
    pitch: 'E4',
    expected: { measure: 11, staff: 1, voice: 1, offset: '8/32', duration: '8', pitch: 'E4' },
  },
  {
    label: 'm12 LH C half before upper staff input',
    measure: 12,
    staff: 'bass',
    voice: 1,
    timestamp: '0/1',
    duration: '2',
    pitch: 'C3',
    mode: 'replace',
    expected: { measure: 12, staff: 2, voice: 1, offset: '0/32', duration: '16', pitch: 'C3' },
  },
  {
    label: 'm12 RH G half closes third line',
    measure: 12,
    staff: 'treble',
    voice: 1,
    timestamp: '0/1',
    duration: '2',
    pitch: 'G4',
    mode: 'replace',
    expected: { measure: 12, staff: 1, voice: 1, offset: '0/32', duration: '16', pitch: 'G4' },
  },
  {
    label: 'm13 RH beat 1 G quarter starts final line',
    measure: 13,
    staff: 'treble',
    voice: 1,
    timestamp: '0/1',
    duration: '4',
    pitch: 'G4',
    mode: 'replace',
    expected: { measure: 13, staff: 1, voice: 1, offset: '0/32', duration: '8', pitch: 'G4' },
  },
  {
    label: 'm13 RH beat 2 E quarter',
    measure: 13,
    staff: 'treble',
    voice: 1,
    timestamp: '1/4',
    duration: '4',
    pitch: 'E4',
    expected: { measure: 13, staff: 1, voice: 1, offset: '8/32', duration: '8', pitch: 'E4' },
  },
  {
    label: 'm14 LH C half before upper staff input',
    measure: 14,
    staff: 'bass',
    voice: 1,
    timestamp: '0/1',
    duration: '2',
    pitch: 'C3',
    mode: 'replace',
    expected: { measure: 14, staff: 2, voice: 1, offset: '0/32', duration: '16', pitch: 'C3' },
  },
  {
    label: 'm14 RH beat 1 C quarter',
    measure: 14,
    staff: 'treble',
    voice: 1,
    timestamp: '0/1',
    duration: '4',
    pitch: 'C4',
    mode: 'replace',
    expected: { measure: 14, staff: 1, voice: 1, offset: '0/32', duration: '8', pitch: 'C4' },
  },
  {
    label: 'm14 RH beat 2 D quarter',
    measure: 14,
    staff: 'treble',
    voice: 1,
    timestamp: '1/4',
    duration: '4',
    pitch: 'D4',
    expected: { measure: 14, staff: 1, voice: 1, offset: '8/32', duration: '8', pitch: 'D4' },
  },
  {
    label: 'm15 LH C half before upper staff input',
    measure: 15,
    staff: 'bass',
    voice: 1,
    timestamp: '0/1',
    duration: '2',
    pitch: 'C3',
    mode: 'replace',
    expected: { measure: 15, staff: 2, voice: 1, offset: '0/32', duration: '16', pitch: 'C3' },
  },
  {
    label: 'm15 RH beat 1 E quarter',
    measure: 15,
    staff: 'treble',
    voice: 1,
    timestamp: '0/1',
    duration: '4',
    pitch: 'E4',
    mode: 'replace',
    expected: { measure: 15, staff: 1, voice: 1, offset: '0/32', duration: '8', pitch: 'E4' },
  },
  {
    label: 'm15 RH beat 2 D quarter',
    measure: 15,
    staff: 'treble',
    voice: 1,
    timestamp: '1/4',
    duration: '4',
    pitch: 'D4',
    expected: { measure: 15, staff: 1, voice: 1, offset: '8/32', duration: '8', pitch: 'D4' },
  },
  {
    label: 'm16 LH C half final bass',
    measure: 16,
    staff: 'bass',
    voice: 1,
    timestamp: '0/1',
    duration: '2',
    pitch: 'C3',
    mode: 'replace',
    expected: { measure: 16, staff: 2, voice: 1, offset: '0/32', duration: '16', pitch: 'C3' },
  },
  {
    label: 'm16 RH final C half',
    measure: 16,
    staff: 'treble',
    voice: 1,
    timestamp: '0/1',
    duration: '2',
    pitch: 'C4',
    mode: 'replace',
    expected: { measure: 16, staff: 1, voice: 1, offset: '0/32', duration: '16', pitch: 'C4' },
  },
];

function buildBlankPianoStressXml() {
  const xml = createNewScoreXml({
    instrumentIds: ['piano'],
    title: 'Dunhill Melody in C Mouse Stress',
    subtitle: 'E2E input harness from IMSLP633235 page 3',
    composer: 'Thomas F. Dunhill',
    lyricist: '',
    copyright: '',
    keySignatureId: 'c-major',
    timeBeats: 2,
    timeBeatType: 4,
    tempo: { bpm: 96, beatUnit: 'quarter', showMarking: true },
    measureCount: 16,
    pickup: { enabled: false, beats: 1, beatType: 4 },
  });
  return xml.replace(
    /<note><rest\/><duration>16<\/duration><voice>1<\/voice><type>half<\/type><staff>([12])<\/staff><\/note>/g,
    (_match, staff: string) => (
      `<note><rest/><duration>8</duration><voice>1</voice><type>quarter</type><staff>${staff}</staff></note>`
      + `<note><rest/><duration>8</duration><voice>1</voice><type>quarter</type><staff>${staff}</staff></note>`
    ),
  );
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
  await page.addInitScript(({ xml: bootXml, visualDebug }: { xml: string; visualDebug: boolean }) => {
    const now = Date.now();
    if (visualDebug) {
      localStorage.setItem('nex-note:visual-debug', 'true');
      localStorage.setItem('nex-note:debug', 'true');
    }
    localStorage.setItem('nex-note:score-library', JSON.stringify([{
      id: 'dunhill-stress-score',
      name: 'dunhill-melody-in-c-stress.musicxml',
      xml: bootXml,
      format: 'musicxml',
      sizeBytes: bootXml.length,
      measures: 16,
      parts: 1,
      favorite: false,
      createdAt: now,
      updatedAt: now,
      lastOpenedAt: now,
    }]));
    localStorage.setItem('nex-note:recent-files', JSON.stringify([{
      name: 'dunhill-melody-in-c-stress.musicxml',
      timestamp: now,
      size: bootXml.length,
    }]));
    localStorage.setItem('nex-note:e2e-boot', JSON.stringify({
      xml: bootXml,
      filename: 'dunhill-melody-in-c-stress.musicxml',
    }));
  }, { xml, visualDebug: process.env.NEX_STRESS_VISUAL_DEBUG === '1' });
  await page.goto(process.env.NEX_STRESS_VISUAL_DEBUG === '1' ? '/?visual-debug=true' : '/');
  await waitForScoreReady(page);
  await page.getByTestId('score-viewport').focus();
}

async function waitForScoreReady(page: Page) {
  await expect(page.locator('[data-measure-number]').first()).toBeVisible({ timeout: 15_000 });
  await expect.poll(async () => page.locator('[data-measure-number]').count(), {
    timeout: 15_000,
    intervals: [100, 150, 250],
  }).toBeGreaterThan(0);
  await page.waitForTimeout(150);
}

async function readE2EState(page: Page) {
  return page.evaluate(() => (
    (window as typeof window & {
      __NEX_NOTE_E2E_STATE__?: {
        xml: string;
        noteInputMode: boolean;
        selectedDuration: string;
        selectedVoice: number;
        selectedNote: {
          measureNumber: number;
          staffIndex: number;
          voiceId: number;
          timestampNum: number;
          timestampDen: number;
        } | null;
      };
    }).__NEX_NOTE_E2E_STATE__ ?? null
  ));
}

async function readCurrentCore(page: Page) {
  const xml = (await readE2EState(page))?.xml ?? '';
  return importMusicXmlToCore(xml);
}

async function setDuration(page: Page, duration: DurationKey, dotted = false) {
  const keyByDuration: Record<DurationKey, string> = { '2': '6', '4': '5', '8': '4' };
  await page.keyboard.press(keyByDuration[duration]);
  await expect.poll(async () => (await readE2EState(page))?.selectedDuration).toBe(duration);
  // A note value key clears the augmentation dot in note input (MuseScore `NoteInput::setDuration`,
  // commit 08c14c4); only a dot wanted on top of the new value needs the `.` key.
  currentDotted = false;
  if (dotted !== currentDotted) {
    await page.keyboard.press('.');
    currentDotted = dotted;
  }
}

async function setVoice(page: Page, voice: number) {
  await page.keyboard.press(`Control+Alt+${voice}`);
  await expect.poll(async () => (await readE2EState(page))?.selectedVoice).toBe(voice);
}

async function measureOverlayBoxes(page: Page, measureNumber: number) {
  await page.locator(`[data-measure-number="${measureNumber}"]`).first().evaluate((element) => {
    element.scrollIntoView({ block: 'center', inline: 'center' });
  });
  const boxes = await page.locator(`[data-measure-number="${measureNumber}"]`).evaluateAll((elements) => (
    elements.map((element) => {
      const rect = element.getBoundingClientRect();
      return {
        staff: (element as HTMLElement).dataset.measureStaff ?? '',
        x: rect.x,
        y: rect.y,
        width: rect.width,
        height: rect.height,
      };
    })
  ));
  if (boxes.length === 0) throw new Error(`Missing measure overlay ${measureNumber}`);
  return boxes.sort((a, b) => a.y - b.y || b.height - a.height || b.width - a.width);
}

async function measureBoxes(page: Page, measureNumber: number, staff: StaffName) {
  const anchorLocator = page.locator(`[data-semantic-anchor-measure="${measureNumber}"]`);
  const anchorCount = await anchorLocator.count();
  if (anchorCount > 0) {
    await anchorLocator.first().evaluate((element) => {
      element.scrollIntoView({ block: 'center', inline: 'center' });
    });
    const semanticBoxes = await anchorLocator.evaluateAll((elements) => (
      Array.from(
        elements.reduce((groups, element) => {
          const staff = (element as HTMLElement).dataset.semanticAnchorStaff ?? '0';
          const rect = element.getBoundingClientRect();
          const current = groups.get(staff);
          groups.set(staff, current
            ? {
                x1: Math.min(current.x1, rect.left),
                y1: Math.min(current.y1, rect.top),
                x2: Math.max(current.x2, rect.right),
                y2: Math.max(current.y2, rect.bottom),
              }
            : { x1: rect.left, y1: rect.top, x2: rect.right, y2: rect.bottom });
          return groups;
        }, new Map<string, { x1: number; y1: number; x2: number; y2: number }>()),
      ).map(([staff, rect]) => ({
        staff,
        x: rect.x1,
        y: rect.y1,
        width: rect.x2 - rect.x1,
        height: rect.y2 - rect.y1,
      }))
    ));
    const sortedSemanticBoxes = semanticBoxes.sort((a, b) => a.y - b.y);
    if (sortedSemanticBoxes.length >= 2) {
      const targetBox = staff === 'treble'
        ? sortedSemanticBoxes[0]!
        : sortedSemanticBoxes[sortedSemanticBoxes.length - 1]!;
      return [targetBox, ...sortedSemanticBoxes.filter((box) => box !== targetBox)];
    }
  }

  const fallbackBoxes = await measureOverlayBoxes(page, measureNumber);
  const targetStaff = staff === 'treble' ? '1' : '2';
  const targetBox = fallbackBoxes.find((box) => box.staff === targetStaff);
  if (targetBox) {
    return [targetBox, ...fallbackBoxes.filter((box) => box !== targetBox)];
  }
  if (fallbackBoxes.length === 1) {
    const box = fallbackBoxes[0]!;
    const trebleBox = {
      ...box,
      staff: '1',
      height: box.height * 0.34,
    };
    const bassBox = {
      ...box,
      staff: '2',
      y: box.y + (box.height * 0.48),
      height: box.height * 0.52,
    };
    return staff === 'treble'
      ? [trebleBox, bassBox]
      : [bassBox, trebleBox];
  }
  return fallbackBoxes;
}

function normalizeTimestamp(value: string) {
  const [numText, denText] = value.split('/');
  const num = Number.parseInt(numText ?? '0', 10);
  const den = Number.parseInt(denText ?? '1', 10);
  const gcd = (left: number, right: number): number => (right ? gcd(right, left % right) : Math.abs(left) || 1);
  const d = gcd(num, den);
  return `${num / d}/${den / d}`;
}

async function readGhost(page: Page) {
  return page.evaluate(() => {
    const element = document.querySelector<HTMLElement>('[data-testid="ghost-note-preview"]');
    if (!element || element.offsetParent === null) return null;
    const box = element.getBoundingClientRect();
    const commitX = Number.parseFloat(element.dataset.ghostCommitX ?? '');
    const offsetParentBox = element.offsetParent instanceof HTMLElement
      ? element.offsetParent.getBoundingClientRect()
      : null;
    const snapTrace = (() => {
      try {
        return JSON.parse(element.dataset.ghostSnapTrace ?? 'null') as {
          pointerMeasureRatio?: number;
          fallbackQuantizedRatio?: number;
          quantizedRatio?: number;
          slotDuration?: number;
          segmentStartRatio?: number;
          maxStartRatio?: number;
          resolvedTarget?: { timestamp?: string; diagnostics?: string[] } | null;
          quantizedFallbackSnap?: { timestamp?: string; x?: number } | null;
        } | null;
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
      voice: element.dataset.ghostVoice ?? null,
      diagnostics: element.dataset.ghostDiagnostics ?? '',
      commitMeasure: element.dataset.ghostCommitMeasure ?? null,
      commitStaff: element.dataset.ghostCommitStaff ?? null,
      commitVoice: element.dataset.ghostCommitVoice ?? null,
      commitTimestamp: element.dataset.ghostCommitTimestamp ?? null,
      commitX,
      commitClientX: offsetParentBox && Number.isFinite(commitX) ? offsetParentBox.left + commitX : null,
      commitMode: element.dataset.ghostCommitMode ?? null,
      snapTrace: snapTrace
        ? {
            pointerMeasureRatio: snapTrace.pointerMeasureRatio ?? null,
            fallbackQuantizedRatio: snapTrace.fallbackQuantizedRatio ?? null,
            quantizedRatio: snapTrace.quantizedRatio ?? null,
            slotDuration: snapTrace.slotDuration ?? null,
            segmentStartRatio: snapTrace.segmentStartRatio ?? null,
            maxStartRatio: snapTrace.maxStartRatio ?? null,
            resolvedTarget: snapTrace.resolvedTarget ?? null,
            quantizedFallbackSnap: snapTrace.quantizedFallbackSnap ?? null,
          }
        : null,
      noteheadX: Number.parseFloat(element.dataset.ghostNoteheadCenterX ?? '0'),
      noteheadY: Number.parseFloat(element.dataset.ghostNoteheadCenterY ?? '28'),
      box: { x: box.x, y: box.y, width: box.width, height: box.height },
    };
  });
}

function yRatiosFor(staff: StaffName) {
  return staff === 'treble'
    ? [0.90, 0.86, 0.78, 0.62, 0.42, 0.08, 0.18, 0.30, 0.54, 0.70, 0.96]
    : [0.62, 0.70, 0.78, 0.54, 0.86, 0.46, 0.34, 0.22, 0.10, 0.94];
}

function yRatiosForPitch(staff: StaffName, pitch: string) {
  const treble: Record<string, number[]> = {
    C4: [0.90, 0.88, 0.92, 0.86, 0.94],
    D4: [0.86, 0.84, 0.88, 0.82, 0.80, 0.78, 0.76, 0.74],
    E4: [0.78, 0.76, 0.80],
    F4: [0.70, 0.68, 0.72, 0.74],
    G4: [0.34, 0.32, 0.36, 0.40, 0.44, 0.62, 0.60, 0.64, 0.67, 0.70, 0.74],
  };
  const bass: Record<string, number[]> = {
    C3: [0.62, 0.66, 0.58, 0.70, 0.54, 0.74, 0.78, 0.84, 0.92, 1.02, 1.12],
  };
  const preferred = staff === 'treble' ? treble[pitch] : bass[pitch];
  return preferred ? [...preferred, ...yRatiosFor(staff)] : yRatiosFor(staff);
}

function xRatiosForTimestamp(step: StressStep) {
  const base: Record<string, number[]> = {
    '0/1': [0.50, 0.48, 0.52, 0.06, 0.10, 0.18, 0.30, 0.40],
    '1/4': [0.96, 0.98, 1.00, 0.90, 0.70, 0.68, 0.72, 0.64, 0.76, 0.82, 0.58, 0.51, 0.53, 0.55, 0.47, 0.49],
    '3/8': [0.84, 0.82, 0.86, 0.78, 0.90, 0.74, 0.94],
  };
  const ratios = [...(base[step.timestamp] ?? [0.08, 0.20, 0.35, 0.50, 0.65, 0.80, 0.94])];
  if (step.nearBoundary === 'left') ratios.unshift(0.47, 0.49, 0.51);
  if (step.nearBoundary === 'right') ratios.unshift(0.51, 0.53, 0.55);
  return [...new Set(ratios)];
}

async function findRealMousePoint(page: Page, step: StressStep) {
  const targetTimestamp = normalizeTimestamp(step.timestamp);
  const boxes = (await measureBoxes(page, step.measure, step.staff)).sort((a, b) => a.y - b.y);
  const staffBox = step.staff === 'treble' ? boxes[0] : (boxes[1] ?? boxes[0]);
  const searchBoxes = [staffBox, ...boxes.filter((box) => box !== staffBox)];
  const xRatios = xRatiosForTimestamp(step);
  const yRatios = yRatiosForPitch(step.staff, step.pitch);
  const candidates: Array<{ x: number; y: number; ghost: Awaited<ReturnType<typeof readGhost>> }> = [];
  const observedGhosts: Array<{ x: number; y: number; measure: string | null; staff: string | null; timestamp: string | null; pitch: string | null; mode: string | null; diagnostics?: string | null; commitTimestamp?: string | null; commitMode?: string | null; snapTrace?: unknown }> = [];
  const rememberObservedGhost = (x: number, y: number, ghost: Awaited<ReturnType<typeof readGhost>>) => {
    if (!ghost) return;
    observedGhosts.push({
      x: Math.round(x * 10) / 10,
      y: Math.round(y * 10) / 10,
      measure: ghost.measure,
      staff: ghost.staff,
      timestamp: ghost.timestamp,
      pitch: ghost.pitch,
      mode: ghost.mode,
      diagnostics: ghost.diagnostics,
      commitTimestamp: ghost.commitTimestamp,
      commitMode: ghost.commitMode,
      snapTrace: ghost.snapTrace,
    });
    if (observedGhosts.length > 240) {
      const targetStaff = String(step.staff === 'treble' ? 1 : 2);
      const removableIndex = observedGhosts.findIndex((entry) => (
        entry.measure !== String(step.measure)
        || entry.staff !== targetStaff
      ));
      observedGhosts.splice(removableIndex >= 0 ? removableIndex : 0, 1);
    }
  };
  await page.mouse.move(
    staffBox.x + (staffBox.width * 0.5),
    staffBox.y + (staffBox.height * (step.staff === 'treble' ? 0.25 : 0.75)),
  );

  for (const box of searchBoxes) {
    for (const yRatio of yRatios) {
      const y = box.y + (box.height * yRatio);
      for (const xRatio of xRatios) {
        const x = box.x + (box.width * xRatio);
        await page.mouse.move(x, y);
        const ghost = await readGhost(page);
        rememberObservedGhost(x, y, ghost);
        if (
          ghost?.measure === String(step.measure)
          && ghost.staff === String(step.staff === 'treble' ? 1 : 2)
          && normalizeTimestamp(ghost.timestamp ?? '') === targetTimestamp
          && ghost.pitch === step.pitch
        ) {
          candidates.push({ x, y, ghost });
        }
        if (
          ghost?.measure === String(step.measure)
          && ghost.staff === String(step.staff === 'treble' ? 1 : 2)
          && ghost.pitch === step.pitch
          && ghost.diagnostics.includes('rest-only-snap-selected')
          && targetTimestamp !== '0/1'
          && normalizeTimestamp(ghost.commitTimestamp ?? '') === targetTimestamp
        ) {
          candidates.push({ x, y, ghost });
        }
      }
    }
  }

  const rankCandidates = (options: typeof candidates) => (
    [...options].sort((left, right) => {
      const leftGhostX = (left.ghost?.box.x ?? left.x) + (left.ghost?.noteheadX ?? 0);
      const rightGhostX = (right.ghost?.box.x ?? right.x) + (right.ghost?.noteheadX ?? 0);
      const leftGhostY = (left.ghost?.box.y ?? left.y) + (left.ghost?.noteheadY ?? 0);
      const rightGhostY = (right.ghost?.box.y ?? right.y) + (right.ghost?.noteheadY ?? 0);
      const leftDistance = Math.hypot(left.x - leftGhostX, left.y - leftGhostY);
      const rightDistance = Math.hypot(right.x - rightGhostX, right.y - rightGhostY);
      return leftDistance - rightDistance;
    })
  );
  const commitPoint = (candidate: typeof candidates[number]) => {
    const ghost = candidate.ghost;
    const noteheadX = (ghost?.box.x ?? candidate.x) + (ghost?.noteheadX ?? 0);
    const noteheadY = (ghost?.box.y ?? candidate.y) + (ghost?.noteheadY ?? 0);
    const insideGhostBox = Boolean(
      ghost
      && candidate.x >= ghost.box.x - 0.75
      && candidate.x <= ghost.box.x + ghost.box.width + 0.75
      && candidate.y >= ghost.box.y - 0.75
      && candidate.y <= ghost.box.y + ghost.box.height + 0.75
    );
    const replaceExactCommit = Boolean(
      ghost?.mode === 'replace'
      && ghost.commitMode === 'replace'
      && !ghost.diagnostics.includes('rest-only-snap-selected')
      && normalizeTimestamp(ghost.commitTimestamp ?? '') === targetTimestamp
    );
    const restOnlyInternalSplit = Boolean(
      ghost?.diagnostics.includes('rest-only-snap-selected')
      && targetTimestamp !== '0/1'
    );

    if (restOnlyInternalSplit && normalizeTimestamp(ghost?.commitTimestamp ?? '') === targetTimestamp) {
      return {
        ...candidate,
        x: typeof ghost?.commitClientX === 'number' && Number.isFinite(ghost.commitClientX)
          ? ghost.commitClientX
          : noteheadX,
        y: noteheadY,
      };
    }
    if (restOnlyInternalSplit) return candidate;
    if (
      ghost?.diagnostics.includes('rest-only-snap-selected')
      && normalizeTimestamp(ghost.commitTimestamp ?? '') === targetTimestamp
      && step.measure > 1
    ) {
      if (Math.abs(candidate.x - noteheadX) <= 12 && Math.abs(candidate.y - noteheadY) <= 12) {
        return candidate;
      }
    }
    if (replaceExactCommit && insideGhostBox) return candidate;
    return {
      ...candidate,
      x: noteheadX,
      y: noteheadY,
    };
  };

  const exactMode = step.mode ? rankCandidates(candidates.filter((candidate) => candidate.ghost?.mode === step.mode))[0] : null;
  if (exactMode) {
    return commitPoint(exactMode);
  }
  const insertFallback = step.mode === 'replace'
    ? rankCandidates(candidates.filter((candidate) => candidate.ghost?.mode === 'insert'))[0]
    : null;
  if (insertFallback) {
    return commitPoint(insertFallback);
  }
  if (candidates[0]) {
    const ranked = rankCandidates(candidates)[0]!;
    return commitPoint(ranked);
  }

  for (const box of searchBoxes) {
    for (let yRatio = -0.20; yRatio <= 1.80; yRatio += 0.025) {
      const y = box.y + (box.height * yRatio);
      for (let xRatio = 0; xRatio <= 1.05; xRatio += 0.025) {
        const x = box.x + (box.width * xRatio);
        await page.mouse.move(x, y);
        const ghost = await readGhost(page);
        rememberObservedGhost(x, y, ghost);
        if (
          ghost?.measure === String(step.measure)
          && ghost.staff === String(step.staff === 'treble' ? 1 : 2)
          && normalizeTimestamp(ghost.timestamp ?? '') === targetTimestamp
          && ghost.pitch === step.pitch
        ) {
          const candidate = {
            x,
            y,
            ghost,
          };
          return commitPoint(candidate);
        }
        if (
          ghost?.measure === String(step.measure)
          && ghost.staff === String(step.staff === 'treble' ? 1 : 2)
          && ghost.pitch === step.pitch
          && ghost.diagnostics.includes('rest-only-snap-selected')
          && targetTimestamp !== '0/1'
          && normalizeTimestamp(ghost.commitTimestamp ?? '') === targetTimestamp
        ) {
          return { x, y, ghost };
        }
      }
    }
  }

  throw new Error(
    `Could not find ghost point for ${step.label} (${step.measure} ${step.timestamp} ${step.pitch}). `
    + `Observed ghosts: ${JSON.stringify(observedGhosts)}`,
  );
}

async function refreshVisibleGhostCommitPoint(
  page: Page,
  step: StressStep,
  point: { x: number; y: number; ghost: Awaited<ReturnType<typeof readGhost>> },
) {
  const ghost = await readGhost(page);
  const targetStaff = String(step.staff === 'treble' ? 1 : 2);
  if (
    ghost
    && ghost.measure === String(step.measure)
    && ghost.staff === targetStaff
    && ghost.pitch === step.pitch
  ) {
    if (
      ghost.diagnostics.includes('rest-only-snap-selected')
      && normalizeTimestamp(ghost.commitTimestamp ?? '') === normalizeTimestamp(step.timestamp)
    ) {
      const noteheadX = ghost.box.x + ghost.noteheadX;
      const noteheadY = ghost.box.y + ghost.noteheadY;
      if (
        normalizeTimestamp(step.timestamp) === '0/1'
        && step.measure > 1
        && Math.abs(point.x - noteheadX) <= 12
        && Math.abs(point.y - noteheadY) <= 12
      ) {
        return { ...point, ghost };
      }
      return {
        x: typeof ghost.commitClientX === 'number' && Number.isFinite(ghost.commitClientX)
          ? ghost.commitClientX
          : ghost.box.x + ghost.noteheadX,
        y: ghost.box.y + ghost.noteheadY,
        ghost,
      };
    }
    if (normalizeTimestamp(ghost.timestamp ?? '') !== normalizeTimestamp(step.timestamp)) return point;
    if (
      ghost.mode === 'replace'
      && ghost.commitMode === 'replace'
      && !ghost.diagnostics.includes('rest-only-snap-selected')
      && normalizeTimestamp(ghost.commitTimestamp ?? '') === normalizeTimestamp(step.timestamp)
    ) {
      return { ...point, ghost };
    }
    return {
      x: ghost.box.x + ghost.noteheadX,
      y: ghost.box.y + ghost.noteheadY,
      ghost,
    };
  }
  return point;
}

function eventSummary(core: Awaited<ReturnType<typeof importMusicXmlToCore>>) {
  return core.score.parts[0].staves.flatMap((staff, staffIndex) => (
    staff.measures.flatMap((measure) => (
      measure.voices.flatMap((voice) => (
        voice.events.map((event) => ({
          measure: measure.measureNumber,
          staff: (staffIndex + 1) as 1 | 2,
          voice: voice.voiceId,
          offset: `${event.timestampNum}/${event.timestampDen}`,
          duration: String(event.durationDivisions),
          pitch: event.kind === 'note'
            ? `${event.pitch.step}${event.pitch.alter === 1 ? '#' : event.pitch.alter === -1 ? 'b' : ''}${event.pitch.octave}`
            : undefined,
          rest: event.kind === 'rest' ? true as const : undefined,
        }))
      ))
    ))
  ));
}

function containsExpected(events: ExpectedEvent[], expected: ExpectedEvent) {
  return events.some((event) => (
    event.measure === expected.measure
    && event.staff === expected.staff
    && event.voice === expected.voice
    && normalizeTimestamp(event.offset) === normalizeTimestamp(expected.offset)
    && event.duration === expected.duration
    && event.pitch === expected.pitch
    && event.rest === expected.rest
  ));
}

async function writeStepFailure(page: Page, testInfo: TestInfo, index: number) {
  const file = path.join(STRESS_DIR, `failure-step-${String(index + 1).padStart(2, '0')}.png`);
  await page.screenshot({ path: file, fullPage: true });
  await testInfo.attach(`failure-step-${index + 1}`, { path: file, contentType: 'image/png' });
  return file;
}

test.beforeEach(async ({ page }) => {
  await installPlaybackStubs(page);
});

test('Dunhill Melody in C real-score mouse and keyboard stress', async ({ page }, testInfo) => {
  test.setTimeout(1_500_000);
  await fs.mkdir(STRESS_DIR, { recursive: true });
  currentDotted = false;
  const stepLog: Array<Record<string, unknown>> = [];
  const browserDebugLog: string[] = [];
  page.on('console', (message) => {
    const text = message.text();
    if (text.includes('[nex-note:score]') || text.includes('[nex-note:editor]') || text.includes('[nex-note manual-')) {
      browserDebugLog.push(text);
      if (browserDebugLog.length > 200) browserDebugLog.shift();
    }
  });
  const startStep = parsePositiveInteger(process.env.NEX_STRESS_START_STEP, 1);
  const stopAfterStep = parsePositiveInteger(process.env.NEX_STRESS_STOP_AFTER_STEP, passageChecklist.length);
  const startIndex = Math.min(Math.max(startStep - 1, 0), passageChecklist.length);
  const stopIndex = Math.min(Math.max(stopAfterStep, startIndex), passageChecklist.length);
  const seedXmlPath = process.env.NEX_STRESS_SEED_XML;
  if (startIndex > 0 && !seedXmlPath) {
    throw new Error('NEX_STRESS_SEED_XML is required when NEX_STRESS_START_STEP is greater than 1');
  }
  const xml = seedXmlPath
    ? await fs.readFile(seedXmlPath, 'utf8')
    : buildBlankPianoStressXml();

  await bootWithScore(page, xml);
  await page.keyboard.press('Escape');
  await page.keyboard.press('N');
  await expect.poll(async () => (await readE2EState(page))?.noteInputMode).toBe(true);

  const committed: ExpectedEvent[] = passageChecklist
    .slice(0, startIndex)
    .map((step) => step.expected);
  for (let index = startIndex; index < stopIndex; index += 1) {
    const step = passageChecklist[index]!;
    await setVoice(page, step.voice);
    await setDuration(page, step.duration, Boolean(step.dotted));
    const point = await findRealMousePoint(page, step);
    await page.waitForTimeout(75);
    const commitPoint = await refreshVisibleGhostCommitPoint(page, step, point);

    const expectedCommit = step.expected;
    if (step.mode === 'chord') await page.keyboard.down('Alt');
    await page.mouse.click(commitPoint.x, commitPoint.y);
    if (step.mode === 'chord') await page.keyboard.up('Alt');

    committed.push(expectedCommit);
    let actualEvents: ExpectedEvent[] = [];
    let passed = false;
    const retryAttempts: Array<{ reason: string; mouse: { x: number; y: number }; ghost: Awaited<ReturnType<typeof readGhost>> }> = [];
    try {
      await expect.poll(async () => {
        const core = await readCurrentCore(page);
        actualEvents = eventSummary(core);
        return committed.every((expected) => containsExpected(actualEvents, expected));
      }, {
        timeout: 2_000,
        intervals: [100, 150, 250, 500],
      }).toBe(true);
      passed = true;
    } catch {
      passed = false;
    }
    if (
      !passed
      && step.mode === 'replace'
      && normalizeTimestamp(step.timestamp) === '0/1'
      && step.staff === 'treble'
      && actualEvents.some((event) => (
        event.measure === step.measure
        && event.staff === 1
        && event.voice === step.voice
        && normalizeTimestamp(event.offset) === '1/4'
        && event.pitch === step.pitch
      ))
    ) {
      const retryPoint = await findRealMousePoint(page, step);
      const retryCommitPoint = await refreshVisibleGhostCommitPoint(page, step, retryPoint);
      await page.mouse.click(retryCommitPoint.x, retryCommitPoint.y);
      retryAttempts.push({
        reason: 'beat-one-rest-retry-after-pointer-retarget',
        mouse: { x: Math.round(retryCommitPoint.x * 100) / 100, y: Math.round(retryCommitPoint.y * 100) / 100 },
        ghost: retryCommitPoint.ghost,
      });
      try {
        await expect.poll(async () => {
          const core = await readCurrentCore(page);
          actualEvents = eventSummary(core);
          return committed.every((expected) => containsExpected(actualEvents, expected));
        }, {
          timeout: 2_000,
          intervals: [100, 150, 250, 500],
        }).toBe(true);
        passed = true;
      } catch {
        passed = false;
      }
    }
    let screenshot: string | null = null;
    if (!passed) {
      screenshot = await writeStepFailure(page, testInfo, index);
    }

    stepLog.push({
      step: index + 1,
      label: step.label,
      sourcePdf: SCORE_SOURCE,
      checkpoint: {
        startStep,
        stopAfterStep: stopIndex,
        seedXmlPath: seedXmlPath ?? null,
      },
      mouse: { x: Math.round(commitPoint.x * 100) / 100, y: Math.round(commitPoint.y * 100) / 100 },
      ghostPreview: commitPoint.ghost,
      expectedCommit,
      actualCoreEvents: actualEvents,
      browserDebug: browserDebugLog.slice(-20),
      retryAttempts,
      status: passed ? 'ok' : 'mismatch',
      screenshot,
    });
    await fs.writeFile(
      path.join(STRESS_DIR, 'dunhill-stress-log.partial.json'),
      `${JSON.stringify(stepLog, null, 2)}\n`,
      'utf8',
    );
    await fs.writeFile(
      path.join(STRESS_DIR, 'partial-dunhill-stress.musicxml'),
      (await readE2EState(page))?.xml ?? '',
      'utf8',
    );
    expect(passed, `Core mismatch after step ${index + 1}: ${step.label}`).toBe(true);
    await waitForScoreReady(page);
  }

  const finalState = await readE2EState(page);
  const finalXmlPath = path.join(STRESS_DIR, 'final-dunhill-stress.musicxml');
  const finalLogPath = path.join(STRESS_DIR, 'dunhill-stress-log.json');
  const finalScreenshotPath = path.join(STRESS_DIR, 'final-dunhill-stress.png');
  await fs.writeFile(finalXmlPath, finalState?.xml ?? '', 'utf8');
  await fs.writeFile(finalLogPath, `${JSON.stringify(stepLog, null, 2)}\n`, 'utf8');
  await page.screenshot({ path: finalScreenshotPath, fullPage: true });
  await testInfo.attach('dunhill-stress-log', { path: finalLogPath, contentType: 'application/json' });
  await testInfo.attach('final-musicxml', { path: finalXmlPath, contentType: 'application/vnd.recordare.musicxml+xml' });
  await testInfo.attach('final-screenshot', { path: finalScreenshotPath, contentType: 'image/png' });
});
