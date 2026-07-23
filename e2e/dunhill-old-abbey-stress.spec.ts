import fs from 'node:fs/promises';
import path from 'node:path';

import { expect, test } from '@playwright/test';
import type { Page, TestInfo } from '@playwright/test';

import { createNewScoreXml } from '../lib/new-score.ts';
import { importMusicXmlToCore } from '../src/musicxml-adapter/import/import-musicxml.ts';

type DurationKey = '1' | '4';
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

type ActualEvent = ExpectedEvent & {
  tieStart?: boolean;
  tieStop?: boolean;
};

type StressStep = {
  label: string;
  measure: number;
  staff: StaffName;
  voice: number;
  timestamp: string;
  duration: DurationKey;
  pitch: string;
  mode?: 'insert' | 'replace' | 'chord';
  expected: ExpectedEvent[];
};

const SCORE_SOURCE = process.env.NEX_STRESS_SOURCE_PDF ?? 'external-score.pdf';
const STRESS_DIR = path.join(process.cwd(), 'test-results', 'old-abbey-stress');

const passageChecklist: StressStep[] = [
  {
    label: 'm1 LH whole-note C/E chord foundation, root first',
    measure: 1,
    staff: 'bass',
    voice: 1,
    timestamp: '0/1',
    duration: '1',
    pitch: 'C3',
    mode: 'replace',
    expected: [{ measure: 1, staff: 2, voice: 1, offset: '0/32', duration: '32', pitch: 'C3' }],
  },
  {
    label: 'm1 LH add E to whole-note chord with Alt on same onset',
    measure: 1,
    staff: 'bass',
    voice: 1,
    timestamp: '0/1',
    duration: '1',
    pitch: 'E3',
    mode: 'chord',
    expected: [
      { measure: 1, staff: 2, voice: 1, offset: '0/32', duration: '32', pitch: 'C3' },
      { measure: 1, staff: 2, voice: 1, offset: '0/32', duration: '32', pitch: 'E3' },
    ],
  },
  {
    label: 'm1 RH beat 1 B quarter over sustained lower chord',
    measure: 1,
    staff: 'treble',
    voice: 1,
    timestamp: '0/1',
    duration: '4',
    pitch: 'B4',
    mode: 'replace',
    expected: [{ measure: 1, staff: 1, voice: 1, offset: '0/32', duration: '8', pitch: 'B4' }],
  },
  {
    label: 'm1 RH beat 2 C quarter',
    measure: 1,
    staff: 'treble',
    voice: 1,
    timestamp: '1/4',
    duration: '4',
    pitch: 'C5',
    expected: [{ measure: 1, staff: 1, voice: 1, offset: '8/32', duration: '8', pitch: 'C5' }],
  },
  {
    label: 'm1 RH beat 3 returns to B quarter',
    measure: 1,
    staff: 'treble',
    voice: 1,
    timestamp: '1/2',
    duration: '4',
    pitch: 'B4',
    expected: [{ measure: 1, staff: 1, voice: 1, offset: '16/32', duration: '8', pitch: 'B4' }],
  },
  {
    label: 'm2 LH whole-note G/B/D chord root first',
    measure: 2,
    staff: 'bass',
    voice: 1,
    timestamp: '0/1',
    duration: '1',
    pitch: 'G2',
    mode: 'replace',
    expected: [{ measure: 2, staff: 2, voice: 1, offset: '0/32', duration: '32', pitch: 'G2' }],
  },
  {
    label: 'm2 LH add B to same whole-note chord',
    measure: 2,
    staff: 'bass',
    voice: 1,
    timestamp: '0/1',
    duration: '1',
    pitch: 'B2',
    mode: 'chord',
    expected: [
      { measure: 2, staff: 2, voice: 1, offset: '0/32', duration: '32', pitch: 'G2' },
      { measure: 2, staff: 2, voice: 1, offset: '0/32', duration: '32', pitch: 'B2' },
    ],
  },
  {
    label: 'm2 LH add D to complete triad, close lower-staff hitbox stack',
    measure: 2,
    staff: 'bass',
    voice: 1,
    timestamp: '0/1',
    duration: '1',
    pitch: 'D3',
    mode: 'chord',
    expected: [
      { measure: 2, staff: 2, voice: 1, offset: '0/32', duration: '32', pitch: 'G2' },
      { measure: 2, staff: 2, voice: 1, offset: '0/32', duration: '32', pitch: 'B2' },
      { measure: 2, staff: 2, voice: 1, offset: '0/32', duration: '32', pitch: 'D3' },
    ],
  },
  {
    label: 'm2 RH beat 1 D quarter after lower chord',
    measure: 2,
    staff: 'treble',
    voice: 1,
    timestamp: '0/1',
    duration: '4',
    pitch: 'D5',
    mode: 'replace',
    expected: [{ measure: 2, staff: 1, voice: 1, offset: '0/32', duration: '8', pitch: 'D5' }],
  },
  {
    label: 'm2 RH beat 2 C quarter near upper-staff chord onset below',
    measure: 2,
    staff: 'treble',
    voice: 1,
    timestamp: '1/4',
    duration: '4',
    pitch: 'C5',
    expected: [{ measure: 2, staff: 1, voice: 1, offset: '8/32', duration: '8', pitch: 'C5' }],
  },
  {
    label: 'm2 RH beat 3 B quarter resolves before rest',
    measure: 2,
    staff: 'treble',
    voice: 1,
    timestamp: '1/2',
    duration: '4',
    pitch: 'B4',
    expected: [{ measure: 2, staff: 1, voice: 1, offset: '16/32', duration: '8', pitch: 'B4' }],
  },
  {
    label: 'm3 LH whole-note C/E/G triad root first',
    measure: 3,
    staff: 'bass',
    voice: 1,
    timestamp: '0/1',
    duration: '1',
    pitch: 'C3',
    mode: 'replace',
    expected: [{ measure: 3, staff: 2, voice: 1, offset: '0/32', duration: '32', pitch: 'C3' }],
  },
  {
    label: 'm3 LH add E to C triad',
    measure: 3,
    staff: 'bass',
    voice: 1,
    timestamp: '0/1',
    duration: '1',
    pitch: 'E3',
    mode: 'chord',
    expected: [
      { measure: 3, staff: 2, voice: 1, offset: '0/32', duration: '32', pitch: 'C3' },
      { measure: 3, staff: 2, voice: 1, offset: '0/32', duration: '32', pitch: 'E3' },
    ],
  },
  {
    label: 'm3 LH add G to complete close-position triad',
    measure: 3,
    staff: 'bass',
    voice: 1,
    timestamp: '0/1',
    duration: '1',
    pitch: 'G3',
    mode: 'chord',
    expected: [
      { measure: 3, staff: 2, voice: 1, offset: '0/32', duration: '32', pitch: 'C3' },
      { measure: 3, staff: 2, voice: 1, offset: '0/32', duration: '32', pitch: 'E3' },
      { measure: 3, staff: 2, voice: 1, offset: '0/32', duration: '32', pitch: 'G3' },
    ],
  },
  {
    label: 'm3 RH beat 1 E quarter above C triad',
    measure: 3,
    staff: 'treble',
    voice: 1,
    timestamp: '0/1',
    duration: '4',
    pitch: 'E5',
    mode: 'replace',
    expected: [{ measure: 3, staff: 1, voice: 1, offset: '0/32', duration: '8', pitch: 'E5' }],
  },
  {
    label: 'm3 RH beat 2 repeated E quarter, same pitch adjacent beat',
    measure: 3,
    staff: 'treble',
    voice: 1,
    timestamp: '1/4',
    duration: '4',
    pitch: 'E5',
    expected: [{ measure: 3, staff: 1, voice: 1, offset: '8/32', duration: '8', pitch: 'E5' }],
  },
  {
    label: 'm3 RH beat 3 D quarter after repeated pitch',
    measure: 3,
    staff: 'treble',
    voice: 1,
    timestamp: '1/2',
    duration: '4',
    pitch: 'D5',
    expected: [{ measure: 3, staff: 1, voice: 1, offset: '16/32', duration: '8', pitch: 'D5' }],
  },
  {
    label: 'm3 RH beat 4 C quarter, no snap into lower staff',
    measure: 3,
    staff: 'treble',
    voice: 1,
    timestamp: '3/4',
    duration: '4',
    pitch: 'C5',
    expected: [{ measure: 3, staff: 1, voice: 1, offset: '24/32', duration: '8', pitch: 'C5' }],
  },
];

function parsePositiveInteger(value: string | undefined, fallback: number) {
  if (!value) return fallback;
  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

function buildBlankOldAbbeyXml() {
  return createNewScoreXml({
    instrumentIds: ['piano'],
    title: 'Dunhill The Old Abbey Mouse Stress',
    subtitle: 'E2E chord input harness from IMSLP633235 page 6',
    composer: 'Thomas F. Dunhill',
    lyricist: '',
    copyright: '',
    keySignatureId: 'c-major',
    timeBeats: 4,
    timeBeatType: 4,
    tempo: { bpm: 76, beatUnit: 'quarter', showMarking: true },
    measureCount: 8,
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
    const now = Date.now();
    localStorage.setItem('nex-note:score-library', JSON.stringify([{
      id: 'old-abbey-stress-score',
      name: 'dunhill-old-abbey-stress.musicxml',
      xml: bootXml,
      format: 'musicxml',
      sizeBytes: bootXml.length,
      measures: 8,
      parts: 1,
      favorite: false,
      createdAt: now,
      updatedAt: now,
      lastOpenedAt: now,
    }]));
    localStorage.setItem('nex-note:recent-files', JSON.stringify([{
      name: 'dunhill-old-abbey-stress.musicxml',
      timestamp: now,
      size: bootXml.length,
    }]));
    localStorage.setItem('nex-note:e2e-boot', JSON.stringify({
      xml: bootXml,
      filename: 'dunhill-old-abbey-stress.musicxml',
    }));
    localStorage.setItem('nex-note:visual-debug', 'true');
  }, { xml });
  await page.goto('/?debug=true');
  await expect(page.locator('[data-semantic-anchor-measure]').first()).toBeVisible({ timeout: 15_000 });
  await page.getByTestId('score-viewport').focus();
}

async function readE2EState(page: Page) {
  return page.evaluate(() => (
    (window as typeof window & {
      __NEX_NOTE_E2E_STATE__?: {
        xml: string;
        noteInputMode: boolean;
        selectedDuration: string;
        selectedVoice: number;
      };
    }).__NEX_NOTE_E2E_STATE__ ?? null
  ));
}

async function readCurrentCore(page: Page) {
  const xml = (await readE2EState(page))?.xml ?? '';
  return importMusicXmlToCore(xml);
}

async function setDuration(page: Page, duration: DurationKey) {
  const keyByDuration: Record<DurationKey, string> = { '1': '7', '4': '5' };
  await page.keyboard.press(keyByDuration[duration]);
  await expect.poll(async () => (await readE2EState(page))?.selectedDuration).toBe(duration);
}

async function setVoice(page: Page, voice: number) {
  await page.keyboard.press(`Control+Alt+${voice}`);
  await expect.poll(async () => (await readE2EState(page))?.selectedVoice).toBe(voice);
}

async function measureBoxes(page: Page, measureNumber: number) {
  await page.locator(`[data-measure-number="${measureNumber}"]`).first().evaluate((element) => {
    element.scrollIntoView({ block: 'center', inline: 'center' });
  });
  const boxes = await page.locator(`[data-measure-number="${measureNumber}"]`).evaluateAll((elements) => (
    elements.map((element) => {
      const rect = element.getBoundingClientRect();
      return {
        staff: element.dataset.measureStaff || '',
        x: rect.x,
        y: rect.y,
        width: rect.width,
        height: rect.height,
      };
    })
  ));
  if (boxes.length === 0) throw new Error(`Missing measure overlay ${measureNumber}`);
  const sorted = boxes.sort((a, b) => a.y - b.y || Number(a.staff || 0) - Number(b.staff || 0));
  if (sorted.length === 1) {
    const treble = { ...sorted[0]!, staff: '1', height: sorted[0]!.height / 2 };
    sorted[0] = treble;
    sorted.push({
      staff: '2',
      x: treble.x,
      y: treble.y + treble.height,
      width: treble.width,
      height: treble.height,
    });
  }
  return sorted;
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
    return {
      measure: element.dataset.ghostMeasure ?? null,
      timestamp: element.dataset.ghostTimestamp ?? null,
      pitch: element.dataset.ghostPitch ?? null,
      staff: element.dataset.ghostStaff ?? null,
      mode: element.dataset.ghostMode ?? null,
      voice: element.dataset.ghostVoice ?? null,
      diagnostics: element.dataset.ghostDiagnostics ?? '',
      noteheadX: Number.parseFloat(element.dataset.ghostNoteheadCenterX ?? '0'),
      noteheadY: Number.parseFloat(element.dataset.ghostNoteheadCenterY ?? '28'),
      box: { x: box.x, y: box.y, width: box.width, height: box.height },
    };
  });
}

async function expectValidHitboxGeometry(page: Page) {
  const boxes = await page.evaluate(() => (
    Array.from(document.querySelectorAll<HTMLElement>('[data-semantic-anchor-debug]'))
      .map((element) => {
        const rect = element.getBoundingClientRect();
        return {
          label: element.dataset.semanticAnchorLabel ?? '',
          measure: element.dataset.semanticAnchorMeasure ?? '',
          staff: element.dataset.semanticAnchorStaff ?? '',
          left: rect.left,
          right: rect.right,
          top: rect.top,
          bottom: rect.bottom,
          width: rect.width,
          height: rect.height,
        };
      })
      .filter((box) => box.width > 0 && box.height > 0)
  ));

  expect(boxes.length, 'semantic hitbox debug boxes should be rendered').toBeGreaterThan(0);

  const byStaff = new Map<string, typeof boxes>();
  for (const box of boxes) {
    expect(box.width, `hitbox too narrow: ${box.measure}/s${box.staff} ${box.label}`).toBeGreaterThan(10);
    const key = `${box.measure}:${box.staff}`;
    const group = byStaff.get(key) ?? [];
    group.push(box);
    byStaff.set(key, group);
  }

  for (const [key, group] of byStaff.entries()) {
    const uniqueZones = new Map<string, typeof group[number]>();
    for (const box of group) {
      const zoneKey = [
        Math.round(box.left * 2) / 2,
        Math.round(box.right * 2) / 2,
        Math.round(box.top * 2) / 2,
        Math.round(box.bottom * 2) / 2,
      ].join(':');
      uniqueZones.set(zoneKey, box);
    }
    const sorted = [...uniqueZones.values()].sort((left, right) => left.left - right.left);
    for (let index = 1; index < sorted.length; index += 1) {
      const previous = sorted[index - 1]!;
      const current = sorted[index]!;
      expect(
        previous.right,
        `horizontal overlap in semantic hitboxes for ${key}: ${previous.label} ${previous.left.toFixed(1)}-${previous.right.toFixed(1)} vs ${current.label} ${current.left.toFixed(1)}-${current.right.toFixed(1)}`,
      ).toBeLessThanOrEqual(current.left + 0.75);
    }
  }

  const measures = new Map<string, typeof boxes>();
  for (const box of boxes) {
    const group = measures.get(box.measure) ?? [];
    group.push(box);
    measures.set(box.measure, group);
  }

  for (const [measure, group] of measures.entries()) {
    const treble = group.filter((box) => box.staff === '1');
    const bass = group.filter((box) => box.staff === '2');
    for (const upper of treble) {
      for (const lower of bass) {
        const verticalOverlap = Math.min(upper.bottom, lower.bottom) - Math.max(upper.top, lower.top);
        expect(
          verticalOverlap,
          `vertical overlap between staff hitboxes in measure ${measure}: ${upper.label} and ${lower.label}`,
        ).toBeLessThanOrEqual(0.75);
      }
    }
  }
}

function yRatiosFor(staff: StaffName) {
  return staff === 'treble'
    ? [0.20, 0.26, 0.32, 0.38, 0.44, 0.50, 0.56, 0.62, 0.68, 0.74, 0.80]
    : [0.22, 0.30, 0.38, 0.46, 0.54, 0.62, 0.70, 0.78, 0.86, 0.94];
}

function yRatiosForPitch(staff: StaffName, pitch: string) {
  const treble: Record<string, number[]> = {
    B4: [0.50, 0.48, 0.52, 0.46, 0.54],
    C5: [0.34, 0.36, 0.38, 0.40, 0.42, 0.44],
    D5: [0.24, 0.26, 0.28, 0.30, 0.32, 0.34],
    E5: [0.14, 0.16, 0.18, 0.20, 0.22, 0.24],
  };
  const bass: Record<string, number[]> = {
    G2: [0.78, 0.80, 0.76, 0.82],
    B2: [0.66, 0.64, 0.68, 0.70],
    C3: [0.62, 0.60, 0.64, 0.66],
    D3: [0.56, 0.54, 0.58, 0.60],
    E3: [0.50, 0.48, 0.52, 0.54],
    G3: [0.22, 0.26, 0.30, 0.34, 0.38, 0.42],
  };
  const preferred = staff === 'treble' ? treble[pitch] : bass[pitch];
  return preferred ? [...preferred, ...yRatiosFor(staff)] : yRatiosFor(staff);
}

function xRatiosForTimestamp(timestamp: string) {
  const base: Record<string, number[]> = {
    '0/1': [0.20, 0.16, 0.24, 0.12, 0.28, 0.08, 0.34, 0.42],
    '1/4': [0.38, 0.36, 0.40, 0.34, 0.42, 0.46, 0.50],
    '1/2': [0.60, 0.58, 0.62, 0.56, 0.64, 0.68, 0.72],
    '3/4': [0.78, 0.76, 0.80, 0.74, 0.82, 0.86, 0.90],
  };
  return base[timestamp] ?? [0.12, 0.25, 0.38, 0.50, 0.62, 0.75, 0.88];
}

async function findRealMousePoint(page: Page, step: StressStep) {
  const targetTimestamp = normalizeTimestamp(step.timestamp);
  const boxes = await measureBoxes(page, step.measure);
  const staffBox = step.staff === 'treble' ? boxes[0] : (boxes[1] ?? boxes[0]);
  const searchBoxes = [staffBox, ...boxes.filter((box) => box !== staffBox)];
  const candidates: Array<{ x: number; y: number; ghost: Awaited<ReturnType<typeof readGhost>> }> = [];
  const timestampCandidates: Array<{ x: number; y: number; ghost: Awaited<ReturnType<typeof readGhost>> }> = [];
  const observedGhosts: Array<{ x: number; y: number; measure: string | null; staff: string | null; timestamp: string | null; pitch: string | null; mode: string | null }> = [];
  const altDuringSearch = step.mode === 'chord';
  const expectedStaff = String(step.staff === 'treble' ? 1 : 2);

  const rememberCandidate = (x: number, y: number, ghost: Awaited<ReturnType<typeof readGhost>>) => {
    if (
      ghost?.measure === String(step.measure)
      && ghost.staff === expectedStaff
      && normalizeTimestamp(ghost.timestamp ?? '') === targetTimestamp
    ) {
      timestampCandidates.push({ x, y, ghost });
      if (ghost.pitch === step.pitch) candidates.push({ x, y, ghost });
    }
    if (ghost) {
      observedGhosts.push({
        x: Math.round(x * 10) / 10,
        y: Math.round(y * 10) / 10,
        measure: ghost.measure,
        staff: ghost.staff,
        timestamp: ghost.timestamp,
        pitch: ghost.pitch,
        mode: ghost.mode,
      });
      if (observedGhosts.length > 40) observedGhosts.shift();
    }
  };

  const rankByGhostDistance = (left: { x: number; y: number; ghost: Awaited<ReturnType<typeof readGhost>> }, right: { x: number; y: number; ghost: Awaited<ReturnType<typeof readGhost>> }) => {
    const leftGhostX = (left.ghost?.box.x ?? left.x) + (left.ghost?.noteheadX ?? 0);
    const rightGhostX = (right.ghost?.box.x ?? right.x) + (right.ghost?.noteheadX ?? 0);
    const leftGhostY = (left.ghost?.box.y ?? left.y) + (left.ghost?.noteheadY ?? 0);
    const rightGhostY = (right.ghost?.box.y ?? right.y) + (right.ghost?.noteheadY ?? 0);
    return Math.hypot(left.x - leftGhostX, left.y - leftGhostY) - Math.hypot(right.x - rightGhostX, right.y - rightGhostY);
  };
  const clickAtGhost = (candidate: { x: number; y: number; ghost: Awaited<ReturnType<typeof readGhost>> }) => ({
    ...candidate,
    x: (candidate.ghost?.box.x ?? candidate.x) + (candidate.ghost?.noteheadX ?? 0),
    y: (candidate.ghost?.box.y ?? candidate.y) + (candidate.ghost?.noteheadY ?? 0),
  });
  const clickPoint = (candidate: { x: number; y: number; ghost: Awaited<ReturnType<typeof readGhost>> }) => (
    step.mode === 'chord' ? candidate : clickAtGhost(candidate)
  );
  const stabilizeCandidate = async (candidate: { x: number; y: number; ghost: Awaited<ReturnType<typeof readGhost>> }) => {
    await page.mouse.move(candidate.x, candidate.y);
    await page.waitForTimeout(50);
    const ghost = await readGhost(page);
    rememberCandidate(candidate.x, candidate.y, ghost);
    if (
      ghost?.measure === String(step.measure)
      && ghost.staff === expectedStaff
      && normalizeTimestamp(ghost.timestamp ?? '') === targetTimestamp
      && ghost.pitch === step.pitch
      && (!step.mode || ghost.mode === step.mode)
    ) {
      return clickPoint({ ...candidate, ghost });
    }
    return null;
  };

  let altReleasedDuringSearch = false;
  if (altDuringSearch) await page.keyboard.down('Alt');
  try {
    for (const box of searchBoxes) {
      for (const yRatio of yRatiosForPitch(step.staff, step.pitch)) {
        const y = box.y + (box.height * yRatio);
        for (const xRatio of xRatiosForTimestamp(step.timestamp)) {
          const x = box.x + (box.width * xRatio);
          await page.mouse.move(x, y);
          const ghost = await readGhost(page);
          rememberCandidate(x, y, ghost);
        }
      }
    }

    const ranked = candidates.sort(rankByGhostDistance);
    const exactMode = step.mode ? ranked.filter((candidate) => candidate.ghost?.mode === step.mode) : [];
    for (const candidate of exactMode) {
      const stable = await stabilizeCandidate(candidate);
      if (stable) return stable;
    }
    for (const candidate of ranked) {
      const stable = await stabilizeCandidate(candidate);
      if (stable) return stable;
    }

    for (const box of searchBoxes) {
      for (let yRatio = 0.08; yRatio <= 1.05; yRatio += 0.03) {
        const y = box.y + (box.height * yRatio);
        for (let xRatio = 0.04; xRatio <= 0.96; xRatio += 0.02) {
          const x = box.x + (box.width * xRatio);
          await page.mouse.move(x, y);
          const ghost = await readGhost(page);
          rememberCandidate(x, y, ghost);
          if (candidates[0]) {
            const stable = await stabilizeCandidate(candidates.sort(rankByGhostDistance)[0]!);
            if (stable) return stable;
          }
        }
      }
    }

    if (step.mode === 'chord' && timestampCandidates[0]) {
      const rankedTimestampCandidates = timestampCandidates.sort(rankByGhostDistance);
      const exactModeTimestamp = rankedTimestampCandidates.find((candidate) => candidate.ghost?.mode === step.mode);
      return clickPoint(exactModeTimestamp ?? rankedTimestampCandidates[0]!);
    }

    if (altDuringSearch) {
      await page.keyboard.up('Alt');
      altReleasedDuringSearch = true;
      for (const box of searchBoxes) {
        for (let yRatio = 0.08; yRatio <= 1.05; yRatio += 0.03) {
          const y = box.y + (box.height * yRatio);
          for (let xRatio = 0.04; xRatio <= 0.96; xRatio += 0.02) {
            const x = box.x + (box.width * xRatio);
            await page.mouse.move(x, y);
            const ghost = await readGhost(page);
            rememberCandidate(x, y, ghost);
            if (candidates[0]) {
              const stable = await stabilizeCandidate(candidates.sort(rankByGhostDistance)[0]!);
              if (stable) return stable;
            }
          }
        }
      }

      if (timestampCandidates[0]) {
        return clickPoint(timestampCandidates.sort(rankByGhostDistance)[0]!);
      }

      const fallbackBox = searchBoxes[0] ?? staffBox;
      return {
        x: fallbackBox.x + (fallbackBox.width * (xRatiosForTimestamp(step.timestamp)[0] ?? 0.2)),
        y: fallbackBox.y + (fallbackBox.height * (yRatiosForPitch(step.staff, step.pitch)[0] ?? 0.5)),
        ghost: null,
      };
    }
  } finally {
    if (altDuringSearch && !altReleasedDuringSearch) await page.keyboard.up('Alt');
  }

  throw new Error(
    `Could not find ghost point for ${step.label} (${step.measure} ${step.timestamp} ${step.pitch}). `
    + `Observed ghosts: ${JSON.stringify(observedGhosts)}`,
  );
}

function eventSummary(core: Awaited<ReturnType<typeof importMusicXmlToCore>>): ActualEvent[] {
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
          tieStart: event.kind === 'note' ? event.tieStart : undefined,
          tieStop: event.kind === 'note' ? event.tieStop : undefined,
        }))
      ))
    ))
  ));
}

function containsExpected(events: ActualEvent[], expected: ExpectedEvent) {
  const exactMatch = events.some((event) => (
    event.measure === expected.measure
    && event.staff === expected.staff
    && event.voice === expected.voice
    && normalizeTimestamp(event.offset) === normalizeTimestamp(expected.offset)
    && event.duration === expected.duration
    && event.pitch === expected.pitch
    && event.rest === expected.rest
  ));
  if (exactMatch || !expected.pitch) return exactMatch;

  const [expectedOffsetNum, expectedOffsetDen] = expected.offset.split('/').map(Number);
  const expectedStart = expectedOffsetNum! / expectedOffsetDen!;
  const expectedDuration = Number(expected.duration);
  const tiedFragments = events
    .filter((event) => (
      event.measure === expected.measure
      && event.staff === expected.staff
      && event.voice === expected.voice
      && event.pitch === expected.pitch
    ))
    .sort((left, right) => {
      const [leftNum, leftDen] = left.offset.split('/').map(Number);
      const [rightNum, rightDen] = right.offset.split('/').map(Number);
      return (leftNum! / leftDen!) - (rightNum! / rightDen!);
    });
  const firstIndex = tiedFragments.findIndex((event) => (
    normalizeTimestamp(event.offset) === normalizeTimestamp(expected.offset)
  ));
  if (firstIndex < 0 || !tiedFragments[firstIndex]?.tieStart) return false;

  let duration = 0;
  let nextOffset = expectedStart;
  for (let index = firstIndex; index < tiedFragments.length; index += 1) {
    const fragment = tiedFragments[index]!;
    const [offsetNum, offsetDen] = fragment.offset.split('/').map(Number);
    if (Math.abs((offsetNum! / offsetDen!) - nextOffset) > 1e-9) break;
    duration += Number(fragment.duration);
    nextOffset += Number(fragment.duration) / expectedOffsetDen!;
    if (duration === expectedDuration) return true;
    if (duration > expectedDuration || !fragment.tieStart) break;
  }
  return false;
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

test('Dunhill The Old Abbey chord mouse and keyboard stress', async ({ page }, testInfo) => {
  test.setTimeout(900_000);
  await fs.mkdir(STRESS_DIR, { recursive: true });
  const stepLog: Array<Record<string, unknown>> = [];
  const browserDebugLog: string[] = [];
  page.on('console', (message) => {
    const text = message.text();
    if (text.includes('[nex-note:score]') || text.includes('[nex-note:editor]')) {
      browserDebugLog.push(text);
      if (browserDebugLog.length > 1000) browserDebugLog.shift();
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
    : buildBlankOldAbbeyXml();

  await bootWithScore(page, xml);
  await page.keyboard.press('Escape');
  await page.keyboard.press('N');
  await expect.poll(async () => (await readE2EState(page))?.noteInputMode).toBe(true);

  const committed: ExpectedEvent[] = passageChecklist
    .slice(0, startIndex)
    .flatMap((step) => step.expected);
  for (let index = startIndex; index < stopIndex; index += 1) {
    const step = passageChecklist[index]!;
    const previous = passageChecklist[index - 1];
    if (previous && previous.staff !== step.staff) {
      await page.keyboard.press('Escape');
      await page.keyboard.press('N');
      await expect.poll(async () => (await readE2EState(page))?.noteInputMode).toBe(true);
    }
    await setVoice(page, step.voice);
    await setDuration(page, step.duration);
    const point = await findRealMousePoint(page, step);

    if (step.mode === 'chord') await page.keyboard.down('Alt');
    await page.mouse.click(point.x, point.y);
    if (step.mode === 'chord') await page.keyboard.up('Alt');

    committed.push(...step.expected);
    let actualEvents: ActualEvent[] = [];
    let passed = false;
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
    if (passed) await expectValidHitboxGeometry(page);

    let screenshot: string | null = null;
    if (!passed) screenshot = await writeStepFailure(page, testInfo, index);

    const currentXml = (await readE2EState(page))?.xml ?? '';
    stepLog.push({
      step: index + 1,
      label: step.label,
      sourcePdf: SCORE_SOURCE,
      checkpoint: {
        startStep,
        stopAfterStep: stopIndex,
        seedXmlPath: seedXmlPath ?? null,
      },
      mouse: { x: Math.round(point.x * 100) / 100, y: Math.round(point.y * 100) / 100 },
      ghostPreview: point.ghost,
      expectedCommit: step.expected,
      actualCoreEvents: actualEvents,
      browserDebug: browserDebugLog.slice(-200),
      status: passed ? 'ok' : 'mismatch',
      screenshot,
    });
    await fs.writeFile(
      path.join(STRESS_DIR, 'old-abbey-stress-log.partial.json'),
      `${JSON.stringify(stepLog, null, 2)}\n`,
      'utf8',
    );
    await fs.writeFile(path.join(STRESS_DIR, 'partial.musicxml'), currentXml, 'utf8');
    expect(passed, `Core mismatch after step ${index + 1}: ${step.label}`).toBe(true);
  }

  const finalState = await readE2EState(page);
  const finalXmlPath = path.join(STRESS_DIR, 'final-old-abbey-stress.musicxml');
  const finalLogPath = path.join(STRESS_DIR, 'old-abbey-stress-log.json');
  const finalScreenshotPath = path.join(STRESS_DIR, 'final-old-abbey-stress.png');
  await fs.writeFile(finalXmlPath, finalState?.xml ?? '', 'utf8');
  await fs.writeFile(finalLogPath, `${JSON.stringify(stepLog, null, 2)}\n`, 'utf8');
  await page.screenshot({ path: finalScreenshotPath, fullPage: true });
  await testInfo.attach('old-abbey-stress-log', { path: finalLogPath, contentType: 'application/json' });
  await testInfo.attach('partial-musicxml', { path: path.join(STRESS_DIR, 'partial.musicxml'), contentType: 'application/vnd.recordare.musicxml+xml' });
  await testInfo.attach('final-musicxml', { path: finalXmlPath, contentType: 'application/vnd.recordare.musicxml+xml' });
  await testInfo.attach('final-screenshot', { path: finalScreenshotPath, contentType: 'image/png' });
});
