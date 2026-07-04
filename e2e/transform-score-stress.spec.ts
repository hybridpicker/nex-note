import fs from 'node:fs/promises';
import path from 'node:path';

import { expect, test } from '@playwright/test';
import type { Page, TestInfo } from '@playwright/test';
import { DOMParser, XMLSerializer } from '@xmldom/xmldom';

import { importMusicXmlToCore } from '../src/musicxml-adapter/import/import-musicxml.ts';

type StaffName = 'treble' | 'bass';

type ExpectedEvent = {
  measure: number;
  staff: 1 | 2;
  voice: number;
  offset: string;
  duration?: string;
  pitch?: string;
  absentPitch?: string;
};

type ExactEvent = {
  pitch?: string;
  rest?: boolean;
  offset: string;
  duration: string;
  chord?: boolean;
};

type TransformStep = {
  label: string;
  run: (page: Page) => Promise<Record<string, unknown> | void>;
  expected?: ExpectedEvent[];
  exactMeasures?: Array<{
    measure: number;
    staff: 1 | 2;
    events: ExactEvent[];
  }>;
  expectedAttributes?: {
    fifths?: number;
    beats?: number;
    beatType?: number;
  };
};

const DEFAULT_SEED_XML = path.join(process.cwd(), 'test-results', 'real-score-stress', 'final-dunhill-stress.musicxml');
const FALLBACK_SEED_XML = path.join(process.cwd(), 'test-results', 'real-score-stress', 'partial-dunhill-stress.musicxml');
const STRESS_DIR = path.join(process.cwd(), 'test-results', 'transform-score-stress');

function parsePositiveInteger(value: string | undefined, fallback: number) {
  if (!value) return fallback;
  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

function normalizeTimestamp(value: string) {
  const [numText, denText] = value.split('/');
  const num = Number.parseInt(numText ?? '0', 10);
  const den = Number.parseInt(denText ?? '1', 10);
  const gcd = (left: number, right: number): number => (right ? gcd(right, left % right) : Math.abs(left) || 1);
  const d = gcd(num, den);
  return `${num / d}/${den / d}`;
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

async function resolveSeedXmlPath(requestedPath: string) {
  try {
    await fs.access(requestedPath);
    return requestedPath;
  } catch {
    if (requestedPath === DEFAULT_SEED_XML) {
      await fs.access(FALLBACK_SEED_XML);
      return FALLBACK_SEED_XML;
    }
    throw new Error(`Missing transform stress seed XML: ${requestedPath}`);
  }
}

async function bootWithScore(page: Page, xml: string) {
  await page.addInitScript(({ xml: bootXml }: { xml: string }) => {
    const now = Date.now();
    localStorage.setItem('nex-note:score-library', JSON.stringify([{
      id: 'transform-score-stress',
      name: 'transform-melody-in-c-to-sheep-on-downs.musicxml',
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
      name: 'transform-melody-in-c-to-sheep-on-downs.musicxml',
      timestamp: now,
      size: bootXml.length,
    }]));
    localStorage.setItem('nex-note:e2e-boot', JSON.stringify({
      xml: bootXml,
      filename: 'transform-melody-in-c-to-sheep-on-downs.musicxml',
    }));
  }, { xml });
  await page.goto('/');
  await expect(page.locator('[data-testid="score-canvas"] .vf-notehead').first()).toBeVisible({ timeout: 15_000 });
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

function containsExpected(events: ReturnType<typeof eventSummary>, expected: ExpectedEvent) {
  if (expected.absentPitch) {
    return !events.some((event) => (
      event.measure === expected.measure
      && event.staff === expected.staff
      && event.voice === expected.voice
      && normalizeTimestamp(event.offset) === normalizeTimestamp(expected.offset)
      && event.pitch === expected.absentPitch
    ));
  }
  return events.some((event) => (
    event.measure === expected.measure
    && event.staff === expected.staff
    && event.voice === expected.voice
    && normalizeTimestamp(event.offset) === normalizeTimestamp(expected.offset)
    && (expected.duration == null || event.duration === expected.duration)
    && (expected.pitch == null || event.pitch === expected.pitch)
  ));
}

function exactMeasureMatches(events: ReturnType<typeof eventSummary>, expected: NonNullable<TransformStep['exactMeasures']>[number]) {
  const actual = events
    .filter((event) => event.measure === expected.measure && event.staff === expected.staff && event.voice === 1)
    .map((event) => ({
      pitch: event.pitch,
      rest: event.rest,
      offset: normalizeTimestamp(event.offset),
      duration: event.duration,
    }));
  const target = expected.events.map((event) => ({
    pitch: event.pitch,
    rest: event.rest ? true as const : undefined,
    offset: normalizeTimestamp(event.offset),
    duration: event.duration,
  }));
  return JSON.stringify(actual) === JSON.stringify(target);
}

function xmlContainsAttributes(xml: string, expected: TransformStep['expectedAttributes']) {
  if (!expected) return true;
  return (
    (expected.fifths == null || xml.includes(`<fifths>${expected.fifths}</fifths>`))
    && (expected.beats == null || xml.includes(`<beats>${expected.beats}</beats>`))
    && (expected.beatType == null || xml.includes(`<beat-type>${expected.beatType}</beat-type>`))
  );
}

async function selectSemanticNote(page: Page, locator: {
  measureNumber: number;
  staffIndex: 1 | 2;
  voiceId?: number;
  timestampNum: number;
  timestampDen: number;
  step?: string;
  octave?: number;
}) {
  const selected = await page.evaluate((input) => {
    const target = window as typeof window & {
      __NEX_NOTE_E2E_SELECT_NOTE__?: (locator: typeof input) => boolean;
    };
    if (typeof target.__NEX_NOTE_E2E_SELECT_NOTE__ !== 'function') return false;
    return target.__NEX_NOTE_E2E_SELECT_NOTE__(input);
  }, locator);
  if (!selected) throw new Error(`Could not select semantic note ${JSON.stringify(locator)}`);
  await expect.poll(async () => {
    const note = (await readE2EState(page))?.selectedNote;
    return note
      && note.measureNumber === locator.measureNumber
      && note.staffIndex === locator.staffIndex
      && note.timestampNum * locator.timestampDen === locator.timestampNum * note.timestampDen;
  }, { timeout: 5_000 }).toBe(true);
  await page.getByTestId('score-viewport').focus();
}

async function openInspector(page: Page) {
  const inspector = page.getByRole('button', { name: 'Inspector' });
  await inspector.click();
  await expect(page.getByText('Score Commands')).toBeVisible();
}

async function openInspectorSection(page: Page, sectionName: string) {
  await openInspector(page);
  const sectionId = sectionName.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
  const sectionButton = page.locator(`button[aria-controls="score-inspector-section-${sectionId}"]`);
  if (await sectionButton.getAttribute('aria-expanded') !== 'true') {
    await sectionButton.click();
  }
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
        return JSON.parse(element.dataset.ghostSnapTrace ?? 'null') as unknown;
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
      diagnostics: element.dataset.ghostDiagnostics ?? '',
      commitTimestamp: element.dataset.ghostCommitTimestamp ?? null,
      commitMode: element.dataset.ghostCommitMode ?? null,
      commitX,
      commitClientX: offsetParentBox && Number.isFinite(commitX) ? offsetParentBox.left + commitX : null,
      snapTrace,
      noteheadX: Number.parseFloat(element.dataset.ghostNoteheadCenterX ?? '0'),
      noteheadY: Number.parseFloat(element.dataset.ghostNoteheadCenterY ?? '28'),
      box: { x: box.x, y: box.y, width: box.width, height: box.height },
    };
  });
}

async function measureBoxes(page: Page, measureNumber: number) {
  await page.locator(`[data-measure-number="${measureNumber}"]`).first().evaluate((element) => {
    element.scrollIntoView({ block: 'center', inline: 'center' });
  });
  const boxes = await page.locator(`[data-measure-number="${measureNumber}"]`).evaluateAll((elements) => (
    elements.map((element) => {
      const rect = element.getBoundingClientRect();
      return { x: rect.x, y: rect.y, width: rect.width, height: rect.height };
    })
  ));
  if (boxes.length === 0) throw new Error(`Missing measure overlay ${measureNumber}`);
  return boxes.sort((a, b) => a.y - b.y || b.height - a.height || b.width - a.width);
}

function yRatiosForPitch(staff: StaffName, pitch: string) {
  const treble: Record<string, number[]> = {
    B4: [0.50, 0.48, 0.52, 0.46, 0.54],
    D5: [-0.28, -0.20, -0.12, -0.04, 0.04, 0.12, 0.20, 0.22, 0.24, 0.28, 0.32, 0.36],
    G4: [0.62, 0.60, 0.64, 0.66],
  };
  const bass: Record<string, number[]> = {
    G2: [0.78, 0.80, 0.76, 0.82],
    B2: [0.66, 0.64, 0.68, 0.70],
    D3: [0.50, 0.54, 0.58, 0.62],
  };
  return [...(staff === 'treble' ? treble[pitch] ?? [] : bass[pitch] ?? []), 0.18, 0.26, 0.34, 0.42, 0.50, 0.58, 0.66, 0.74, 0.82];
}

function xRatiosForTimestamp(timestamp: string) {
  const base: Record<string, number[]> = {
    '0/1': [0.16, 0.20, 0.24, 0.28, 0.34],
    '1/4': [0.36, 0.40, 0.44, 0.48],
    '1/2': [0.58, 0.62, 0.66, 0.70],
    '2/3': [0.72, 0.76, 0.80, 0.84],
  };
  return base[timestamp] ?? [0.14, 0.28, 0.42, 0.56, 0.70, 0.84];
}

async function findMousePoint(page: Page, input: {
  measure: number;
  staff: StaffName;
  timestamp: string;
  pitch: string;
  chord?: boolean;
}) {
  const targetTimestamp = normalizeTimestamp(input.timestamp);
  const boxes = await measureBoxes(page, input.measure);
  const staffBox = input.staff === 'treble' ? boxes[0] : (boxes[1] ?? boxes[0]);
  const searchBoxes = [staffBox, ...boxes.filter((box) => box !== staffBox)];
  const observedGhosts: Array<{
    x: number;
    y: number;
    measure: string | null;
    staff: string | null;
    timestamp: string | null;
    commitTimestamp: string | null;
    pitch: string | null;
    mode: string | null;
    diagnostics: string;
  }> = [];
  const targetObservedGhosts: typeof observedGhosts = [];
  const rememberObservedGhost = (x: number, y: number, ghost: Awaited<ReturnType<typeof readGhost>>) => {
    if (!ghost) return;
    const observed = {
      x: Math.round(x * 10) / 10,
      y: Math.round(y * 10) / 10,
      measure: ghost.measure,
      staff: ghost.staff,
      timestamp: ghost.timestamp,
      commitTimestamp: ghost.commitTimestamp,
      pitch: ghost.pitch,
      mode: ghost.mode,
      diagnostics: ghost.diagnostics,
    };
    observedGhosts.push(observed);
    if (ghost.measure === String(input.measure) && ghost.staff === String(input.staff === 'treble' ? 1 : 2)) {
      targetObservedGhosts.push(observed);
      if (targetObservedGhosts.length > 180) targetObservedGhosts.shift();
    }
    if (observedGhosts.length > 320) observedGhosts.shift();
  };
  const ghostMatches = (ghost: Awaited<ReturnType<typeof readGhost>>) => Boolean(
    ghost?.measure === String(input.measure)
    && ghost.staff === String(input.staff === 'treble' ? 1 : 2)
    && (
      normalizeTimestamp(ghost.timestamp ?? '') === targetTimestamp
      || normalizeTimestamp(ghost.commitTimestamp ?? '') === targetTimestamp
    )
    && ghost.pitch === input.pitch
  );
  const clickPointFor = (
    x: number,
    y: number,
    ghost: NonNullable<Awaited<ReturnType<typeof readGhost>>>,
  ) => {
    if (
      normalizeTimestamp(ghost.commitTimestamp ?? '') === targetTimestamp
      && typeof ghost.commitClientX === 'number'
      && Number.isFinite(ghost.commitClientX)
    ) {
      return { x: ghost.commitClientX, y: ghost.box.y + ghost.noteheadY, ghost };
    }
    return { x: ghost.box.x + ghost.noteheadX, y: ghost.box.y + ghost.noteheadY, ghost };
  };
  if (input.chord) await page.keyboard.down('Alt');
  try {
    for (const box of searchBoxes) {
      for (const yRatio of yRatiosForPitch(input.staff, input.pitch)) {
        const y = box.y + (box.height * yRatio);
        for (const xRatio of xRatiosForTimestamp(input.timestamp)) {
          const x = box.x + (box.width * xRatio);
          await page.mouse.move(x, y);
          const ghost = await readGhost(page);
          rememberObservedGhost(x, y, ghost);
          if (ghostMatches(ghost)) return clickPointFor(x, y, ghost!);
        }
      }
    }
    for (const box of searchBoxes) {
      for (let yRatio = -0.80; yRatio <= 1.80; yRatio += 0.025) {
        const y = box.y + (box.height * yRatio);
        for (let xRatio = 0; xRatio <= 1.05; xRatio += 0.025) {
          const x = box.x + (box.width * xRatio);
          await page.mouse.move(x, y);
          const ghost = await readGhost(page);
          rememberObservedGhost(x, y, ghost);
          if (ghostMatches(ghost)) return clickPointFor(x, y, ghost!);
        }
      }
    }
  } finally {
    if (input.chord) await page.keyboard.up('Alt');
  }
  throw new Error(
    `Could not find mouse point for m${input.measure} ${input.staff} ${input.timestamp} ${input.pitch}. `
    + `Target observed ghosts: ${JSON.stringify(targetObservedGhosts)}. `
    + `Observed ghosts: ${JSON.stringify(observedGhosts)}`,
  );
}

type RewriteEvent = {
  kind?: 'note' | 'rest';
  step?: string;
  octave?: number;
  alter?: number;
  duration: number;
  type: 'quarter' | 'half';
  dotted?: boolean;
};

function pitchFromText(pitch: string) {
  const match = /^([A-G])([#b]?)(\d)$/.exec(pitch);
  if (!match) throw new Error(`Invalid pitch ${pitch}`);
  return {
    step: match[1]!,
    alter: match[2] === '#' ? 1 : match[2] === 'b' ? -1 : 0,
    octave: Number.parseInt(match[3]!, 10),
  };
}

function noteEvent(pitch: string, duration: number, type: RewriteEvent['type'], dotted = false): RewriteEvent {
  return { ...pitchFromText(pitch), duration, type, dotted };
}

function appendTextElement(doc: Document, parent: Element, name: string, text: string) {
  const element = doc.createElement(name);
  element.appendChild(doc.createTextNode(text));
  parent.appendChild(element);
  return element;
}

function appendRewriteNote(doc: Document, measure: Element, event: RewriteEvent, staffIndex: 1 | 2) {
  const note = doc.createElement('note');
  if (event.kind === 'rest') {
    note.appendChild(doc.createElement('rest'));
  } else {
    const pitch = doc.createElement('pitch');
    appendTextElement(doc, pitch, 'step', event.step ?? 'C');
    if (event.alter) appendTextElement(doc, pitch, 'alter', String(event.alter));
    appendTextElement(doc, pitch, 'octave', String(event.octave ?? 4));
    note.appendChild(pitch);
  }
  appendTextElement(doc, note, 'duration', String(event.duration));
  appendTextElement(doc, note, 'voice', '1');
  appendTextElement(doc, note, 'type', event.type);
  if (event.dotted) note.appendChild(doc.createElement('dot'));
  appendTextElement(doc, note, 'staff', String(staffIndex));
  measure.appendChild(note);
}

function rewriteMeasureXml(xml: string, input: {
  measureNumber: number;
  treble: RewriteEvent[];
  bass: RewriteEvent[];
}) {
  const doc = new DOMParser().parseFromString(xml, 'application/xml');
  const part = Array.from(doc.getElementsByTagName('part')).find((entry) => entry.getAttribute('id') === 'P1')
    ?? doc.getElementsByTagName('part')[0];
  if (!part) throw new Error('Missing MusicXML part');
  const measure = Array.from(part.getElementsByTagName('measure')).find((entry) => entry.getAttribute('number') === String(input.measureNumber));
  if (!measure) throw new Error(`Missing measure ${input.measureNumber}`);

  const removable = Array.from(measure.childNodes).filter((node) => (
    node.nodeType === 1
    && ['note', 'backup', 'forward'].includes((node as unknown as Element).tagName)
  ));
  for (const node of removable) measure.removeChild(node);

  for (const event of input.treble) appendRewriteNote(doc as unknown as Document, measure as unknown as Element, event, 1);
  const backup = doc.createElement('backup');
  appendTextElement(doc as unknown as Document, backup as unknown as Element, 'duration', '24');
  measure.appendChild(backup);
  for (const event of input.bass) appendRewriteNote(doc as unknown as Document, measure as unknown as Element, event, 2);

  return new XMLSerializer().serializeToString(doc);
}

async function rewriteMeasuresInVisibleEditor(page: Page, rewrites: Array<Parameters<typeof rewriteMeasureXml>[1]>) {
  const state = await readE2EState(page);
  let xml = state?.xml ?? '';
  for (const rewrite of rewrites) {
    xml = rewriteMeasureXml(xml, rewrite);
  }
  await page.evaluate(({ nextXml }: { nextXml: string }) => {
    const target = window as typeof window & {
      __NEX_NOTE_E2E_LOAD_XML__?: (xml: string, filename?: string) => void;
    };
    if (typeof target.__NEX_NOTE_E2E_LOAD_XML__ !== 'function') {
      throw new Error('Missing E2E XML loader');
    }
    target.__NEX_NOTE_E2E_LOAD_XML__(nextXml, 'transform-melody-in-c-to-sheep-on-downs.musicxml');
  }, { nextXml: xml });
  await expect.poll(async () => {
    const nextState = await readE2EState(page);
    return nextState?.xml ?? '';
  }, { timeout: 15_000 }).toContain('<measure number="1"');
  await page.getByTestId('score-viewport').focus();
  return { rewrittenMeasures: rewrites.map((rewrite) => rewrite.measureNumber) };
}

async function writeStepFailure(page: Page, testInfo: TestInfo, index: number) {
  const file = path.join(STRESS_DIR, `failure-step-${String(index + 1).padStart(2, '0')}.png`);
  await page.screenshot({ path: file, fullPage: true });
  await testInfo.attach(`failure-step-${index + 1}`, { path: file, contentType: 'image/png' });
  return file;
}

const transformSteps: TransformStep[] = [
  {
    label: 'set target key signature to G major through Inspector',
    async run(page) {
      await openInspectorSection(page, 'Key');
      await page.getByRole('button', { name: 'G major' }).click();
    },
    expectedAttributes: { fifths: 1 },
  },
  {
    label: 'set target meter to 3/4 through Inspector',
    async run(page) {
      await openInspectorSection(page, 'Time & Clef');
      await page.getByRole('button', { name: '3/4' }).click();
    },
    expectedAttributes: { beats: 3, beatType: 4 },
  },
  {
    label: 'select m1 RH first existing note and change pitch by keyboard to G',
    async run(page) {
      await selectSemanticNote(page, {
        measureNumber: 1,
        staffIndex: 1,
        voiceId: 1,
        timestampNum: 0,
        timestampDen: 32,
        step: 'C',
        octave: 4,
      });
      await page.keyboard.press('G');
    },
    expected: [{ measure: 1, staff: 1, voice: 1, offset: '0/32', pitch: 'G4' }],
  },
  {
    label: 'navigate to next RH note with ArrowRight and change it to B',
    async run(page) {
      await page.keyboard.press('ArrowRight');
      await page.keyboard.press('B');
    },
    expected: [{ measure: 1, staff: 1, voice: 1, offset: '8/32', pitch: 'B4' }],
  },
  {
    label: 'delete the third RH note to open a 3/4-style phrase gap',
    async run(page) {
      await page.keyboard.press('ArrowRight');
      await page.keyboard.press('Backspace');
    },
    expected: [{ measure: 1, staff: 1, voice: 1, offset: '12/32', absentPitch: 'C4' }],
  },
  {
    label: 'mouse-insert a D5 quarter into the opened upper-staff slot',
    async run(page) {
      await page.keyboard.press('N');
      await page.keyboard.press('5');
      const point = await findMousePoint(page, { measure: 1, staff: 'treble', timestamp: '3/8', pitch: 'D5' });
      await page.mouse.click(point.x, point.y);
      return { mouse: point };
    },
    expected: [{ measure: 1, staff: 1, voice: 1, offset: '12/32', duration: '8', pitch: 'D5' }],
  },
  {
    label: 'add a lower-staff B2 chord tone by Alt-mouse on the existing bass onset',
    async run(page) {
      await page.keyboard.press('6');
      const point = await findMousePoint(page, { measure: 1, staff: 'bass', timestamp: '0/1', pitch: 'B2', chord: true });
      await page.keyboard.down('Alt');
      await page.mouse.click(point.x, point.y);
      await page.keyboard.up('Alt');
      return { mouse: point };
    },
    expected: [{ measure: 1, staff: 2, voice: 1, offset: '0/32', duration: '16', pitch: 'B2' }],
  },
  {
    label: 'normalize m1 to Sheep opening sonority and three-quarter barline',
    async run(page) {
      return rewriteMeasuresInVisibleEditor(page, [{
        measureNumber: 1,
        treble: [
          noteEvent('G4', 8, 'quarter'),
          noteEvent('B4', 8, 'quarter'),
          noteEvent('D5', 8, 'quarter'),
        ],
        bass: [
          noteEvent('G2', 8, 'quarter'),
          noteEvent('B2', 8, 'quarter'),
          noteEvent('D3', 8, 'quarter'),
        ],
      }]);
    },
    exactMeasures: [
      { measure: 1, staff: 1, events: [
        { pitch: 'G4', offset: '0/32', duration: '8' },
        { pitch: 'B4', offset: '8/32', duration: '8' },
        { pitch: 'D5', offset: '16/32', duration: '8' },
      ] },
      { measure: 1, staff: 2, events: [
        { pitch: 'G2', offset: '0/32', duration: '8' },
        { pitch: 'B2', offset: '8/32', duration: '8' },
        { pitch: 'D3', offset: '16/32', duration: '8' },
      ] },
    ],
  },
  {
    label: 'rewrite m2 to dotted-half treble and bass support',
    async run(page) {
      return rewriteMeasuresInVisibleEditor(page, [{
        measureNumber: 2,
        treble: [noteEvent('D5', 24, 'half', true)],
        bass: [noteEvent('G2', 24, 'half', true)],
      }]);
    },
    exactMeasures: [
      { measure: 2, staff: 1, events: [{ pitch: 'D5', offset: '0/32', duration: '24' }] },
      { measure: 2, staff: 2, events: [{ pitch: 'G2', offset: '0/32', duration: '24' }] },
    ],
  },
  {
    label: 'rewrite m3 to rising treble and descending bass quarters',
    async run(page) {
      return rewriteMeasuresInVisibleEditor(page, [{
        measureNumber: 3,
        treble: [
          noteEvent('A4', 8, 'quarter'),
          noteEvent('B4', 8, 'quarter'),
          noteEvent('C5', 8, 'quarter'),
        ],
        bass: [
          noteEvent('E3', 8, 'quarter'),
          noteEvent('D3', 8, 'quarter'),
          noteEvent('C3', 8, 'quarter'),
        ],
      }]);
    },
    exactMeasures: [
      { measure: 3, staff: 1, events: [
        { pitch: 'A4', offset: '0/32', duration: '8' },
        { pitch: 'B4', offset: '8/32', duration: '8' },
        { pitch: 'C5', offset: '16/32', duration: '8' },
      ] },
      { measure: 3, staff: 2, events: [
        { pitch: 'E3', offset: '0/32', duration: '8' },
        { pitch: 'D3', offset: '8/32', duration: '8' },
        { pitch: 'C3', offset: '16/32', duration: '8' },
      ] },
    ],
  },
  {
    label: 'rewrite m4 cadence to D5 half plus G4 quarter',
    async run(page) {
      return rewriteMeasuresInVisibleEditor(page, [{
        measureNumber: 4,
        treble: [
          noteEvent('D5', 16, 'half'),
          noteEvent('G4', 8, 'quarter'),
        ],
        bass: [noteEvent('G2', 24, 'half', true)],
      }]);
    },
    exactMeasures: [
      { measure: 4, staff: 1, events: [
        { pitch: 'D5', offset: '0/32', duration: '16' },
        { pitch: 'G4', offset: '16/32', duration: '8' },
      ] },
      { measure: 4, staff: 2, events: [{ pitch: 'G2', offset: '0/32', duration: '24' }] },
    ],
  },
];

test.beforeEach(async ({ page }) => {
  await installPlaybackStubs(page);
});

test('transform Melody in C toward The Sheep on the Downs with mixed input', async ({ page }, testInfo) => {
  test.setTimeout(900_000);
  await fs.mkdir(STRESS_DIR, { recursive: true });
  const stepLog: Array<Record<string, unknown>> = [];
  const startStep = parsePositiveInteger(process.env.NEX_STRESS_START_STEP, 1);
  const stopAfterStep = parsePositiveInteger(process.env.NEX_STRESS_STOP_AFTER_STEP, transformSteps.length);
  const startIndex = Math.min(Math.max(startStep - 1, 0), transformSteps.length);
  const stopIndex = Math.min(Math.max(stopAfterStep, startIndex), transformSteps.length);
  const seedXmlPath = await resolveSeedXmlPath(process.env.NEX_STRESS_SEED_XML ?? DEFAULT_SEED_XML);
  if (startIndex > 0 && !process.env.NEX_STRESS_SEED_XML) {
    throw new Error('NEX_STRESS_SEED_XML is required when NEX_STRESS_START_STEP is greater than 1');
  }

  await bootWithScore(page, await fs.readFile(seedXmlPath, 'utf8'));
  for (let index = startIndex; index < stopIndex; index += 1) {
    const step = transformSteps[index]!;
    const details = await step.run(page);
    let actualEvents: ReturnType<typeof eventSummary> = [];
    let passed = false;
    try {
      await expect.poll(async () => {
        const state = await readE2EState(page);
        const core = importMusicXmlToCore(state?.xml ?? '');
        actualEvents = eventSummary(core);
        const attributesOk = xmlContainsAttributes(state?.xml ?? '', step.expectedAttributes);
        const eventsOk = !step.expected || step.expected.every((expected) => containsExpected(actualEvents, expected));
        const exactMeasuresOk = !step.exactMeasures || step.exactMeasures.every((expected) => exactMeasureMatches(actualEvents, expected));
        return attributesOk && eventsOk && exactMeasuresOk;
      }, {
        timeout: 2_500,
        intervals: [100, 150, 250, 500],
      }).toBe(true);
      passed = true;
    } catch {
      passed = false;
    }

    let screenshot: string | null = null;
    if (!passed) screenshot = await writeStepFailure(page, testInfo, index);
    const currentXml = (await readE2EState(page))?.xml ?? '';
    stepLog.push({
      step: index + 1,
      label: step.label,
      seedXmlPath,
      checkpoint: { startStep, stopAfterStep: stopIndex },
      details: details ?? null,
      expectedAttributes: step.expectedAttributes ?? null,
      expectedEvents: step.expected ?? null,
      exactMeasures: step.exactMeasures ?? null,
      actualCoreEvents: actualEvents,
      status: passed ? 'ok' : 'mismatch',
      screenshot,
    });
    await fs.writeFile(path.join(STRESS_DIR, 'transform-score-stress-log.partial.json'), `${JSON.stringify(stepLog, null, 2)}\n`, 'utf8');
    await fs.writeFile(path.join(STRESS_DIR, 'partial.musicxml'), currentXml, 'utf8');
    expect(passed, `Transform mismatch after step ${index + 1}: ${step.label}`).toBe(true);
  }

  const finalState = await readE2EState(page);
  const finalXmlPath = path.join(STRESS_DIR, 'final-transform-score-stress.musicxml');
  const finalLogPath = path.join(STRESS_DIR, 'transform-score-stress-log.json');
  const finalScreenshotPath = path.join(STRESS_DIR, 'final-transform-score-stress.png');
  await fs.writeFile(finalXmlPath, finalState?.xml ?? '', 'utf8');
  await fs.writeFile(finalLogPath, `${JSON.stringify(stepLog, null, 2)}\n`, 'utf8');
  await page.screenshot({ path: finalScreenshotPath, fullPage: true });
  await testInfo.attach('transform-score-stress-log', { path: finalLogPath, contentType: 'application/json' });
  await testInfo.attach('partial-musicxml', { path: path.join(STRESS_DIR, 'partial.musicxml'), contentType: 'application/vnd.recordare.musicxml+xml' });
  await testInfo.attach('final-musicxml', { path: finalXmlPath, contentType: 'application/vnd.recordare.musicxml+xml' });
  await testInfo.attach('final-screenshot', { path: finalScreenshotPath, contentType: 'image/png' });
});
