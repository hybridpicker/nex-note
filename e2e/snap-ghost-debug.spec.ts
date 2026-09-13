import { expect, test } from '@playwright/test';
import type { Page, TestInfo } from '@playwright/test';

import { createDefaultNewScoreDraft, createNewScoreXml } from '../lib/new-score.ts';
import { importMusicXmlToCore } from '../src/musicxml-adapter/import/import-musicxml.ts';
import { writeFailureArtifacts } from './support/failure-artifacts';

type Rect = { x: number; y: number; width: number; height: number };

type SnapPoint = {
  id: string;
  measureId: string;
  measure: number;
  part: string | null;
  staff: number;
  voice: number;
  timestamp: string;
  ratio: number;
  x: number;
  y: number;
  isRest: boolean;
  synthetic: boolean;
  sourceCount: number;
  distinctXCount: number;
  suppressedSyntheticCount: number;
  rawXs: number[];
  issue: string | null;
};

type AnchorBox = {
  measure: number;
  part: string | null;
  staff: number;
  voice: number;
  x: number;
  y: number;
  width: number;
  height: number;
};

type SemanticGridReport = {
  issueCount: number;
  snapIssueCount: number;
  snapMultiXIssueCount: number;
  snaps: SnapPoint[];
  snapIssues: Array<{ code: string; level: string; message: string }>;
  measures: Array<{
    measureIndex: number;
    staffCount: number;
    measureLeft: number;
    measureXStart: number;
    measureXEnd: number;
  }>;
  protectedRegions: Array<{
    measure: number;
    staff: number;
    left: number;
    right: number;
    top: number;
    bottom: number;
    reason: string;
  }>;
};

type SemanticGridSummary = {
  issueCount: number;
  debugLayer: {
    snapCount: number;
    rawSnapSourceCount: number;
    snapIssueCount: number;
    snapMultiXIssueCount: number;
    semanticGridIssueCount: number;
    scoreDiagnosticCount: number;
  };
  scoreDiagnostics: Array<{ code: string; message: string }>;
  issues: string[];
  activeGhostSnapTrace?: {
    resolver?: string;
    measureNumber?: number | null;
    staffIndex?: number | null;
    voiceId?: number | null;
    timestamp?: string | null;
    rawPointerX?: number | null;
    safePointerX?: number | null;
    effectiveSnap?: { x?: number | null; timestamp?: string | null } | null;
    nearestMatchingSnap?: { x?: number | null; timestamp?: string | null } | null;
    resolvedTarget?: { domX?: number | null; timestamp?: string | null } | null;
    deltas?: {
      ghostToSnap?: number | null;
      visibleNoteheadToSnap?: number | null;
      commitToSnap?: number | null;
    };
  } | null;
  ghostSnapTraceHistory?: NonNullable<SemanticGridSummary['activeGhostSnapTrace']>[];
};

type GhostSnapshot = {
  part: string | null;
  measure: string | null;
  staff: string | null;
  voice: string | null;
  timestamp: string | null;
  pitch: string | null;
  mode: string | null;
  commitMeasure: string | null;
  commitPart: string | null;
  commitStaff: string | null;
  commitVoice: string | null;
  commitTimestamp: string | null;
  commitX: number | null;
  snapTrace: unknown | null;
  noteheadCenterX: number;
  noteheadCenterY: number;
  box: Rect;
};

const FORBIDDEN_GHOST_DIAGNOSTIC_CODES = [
  'ghost_position_mismatch',
  'ghost_commit_target_mismatch',
  'ghost_x_not_on_snap_grid',
  'ghost_preview_x_not_on_snap_grid',
  'ghost_commit_x_not_on_snap_grid',
];

function durationType(duration: number) {
  if (duration === 16) return 'whole';
  if (duration === 8) return 'half';
  if (duration === 4) return 'quarter';
  if (duration === 2) return 'eighth';
  return '16th';
}

function noteXml(input: {
  duration: number;
  staff: 1 | 2;
  step?: string;
  octave?: number;
  rest?: boolean;
  wholeRest?: boolean;
}) {
  const pitch = input.rest
    ? input.wholeRest
      ? '<rest measure="yes"/>'
      : '<rest/>'
    : `<pitch><step>${input.step}</step><octave>${input.octave}</octave></pitch>`;

  return [
    '      <note>',
    `        ${pitch}`,
    `        <duration>${input.duration}</duration>`,
    '        <voice>1</voice>',
    `        <type>${durationType(input.duration)}</type>`,
    `        <staff>${input.staff}</staff>`,
    '      </note>',
  ].join('\n');
}

function buildPianoScore(measureBodies: string[], title: string) {
  const measures = measureBodies.map((body, index) => {
    const measureNumber = index + 1;
    const attributes = measureNumber === 1
      ? [
          '      <attributes>',
          '        <divisions>4</divisions>',
          '        <key><fifths>0</fifths></key>',
          '        <time><beats>4</beats><beat-type>4</beat-type></time>',
          '        <staves>2</staves>',
          '        <clef number="1"><sign>G</sign><line>2</line></clef>',
          '        <clef number="2"><sign>F</sign><line>4</line></clef>',
          '      </attributes>',
        ].join('\n')
      : '';
    return [
      `    <measure number="${measureNumber}">`,
      attributes,
      body,
      '    </measure>',
    ].filter(Boolean).join('\n');
  }).join('\n');

  return `<?xml version="1.0" encoding="UTF-8"?>
<score-partwise version="3.1">
  <work><work-title>${title}</work-title></work>
  <part-list>
    <score-part id="P1"><part-name>Piano</part-name></score-part>
  </part-list>
  <part id="P1">
${measures}
  </part>
</score-partwise>
`;
}

function buildFullRestScore(measureCount = 5) {
  const body = [
    noteXml({ duration: 16, staff: 1, rest: true, wholeRest: true }),
    '      <backup><duration>16</duration></backup>',
    noteXml({ duration: 16, staff: 2, rest: true, wholeRest: true }),
  ].join('\n');
  return buildPianoScore(Array.from({ length: measureCount }, () => body), 'Snap Full Rests');
}

function buildQuarterNoteScore() {
  const staffOne = [
    noteXml({ duration: 4, staff: 1, step: 'C', octave: 4 }),
    noteXml({ duration: 4, staff: 1, step: 'D', octave: 4 }),
    noteXml({ duration: 4, staff: 1, step: 'E', octave: 4 }),
    noteXml({ duration: 4, staff: 1, step: 'F', octave: 4 }),
  ].join('\n');
  const body = [
    staffOne,
    '      <backup><duration>16</duration></backup>',
    noteXml({ duration: 16, staff: 2, rest: true, wholeRest: true }),
  ].join('\n');
  return buildPianoScore([body], 'Snap Four Quarters');
}

function buildLeadingRestScore() {
  const staffOne = [
    noteXml({ duration: 4, staff: 1, rest: true }),
    noteXml({ duration: 4, staff: 1, step: 'C', octave: 4 }),
    noteXml({ duration: 4, staff: 1, step: 'D', octave: 4 }),
    noteXml({ duration: 4, staff: 1, step: 'E', octave: 4 }),
  ].join('\n');
  const body = [
    staffOne,
    '      <backup><duration>16</duration></backup>',
    noteXml({ duration: 16, staff: 2, rest: true, wholeRest: true }),
  ].join('\n');
  return buildPianoScore([body], 'Snap Leading Rest');
}

function buildBlankInputScore() {
  return createNewScoreXml({
    instrumentIds: ['piano'],
    title: 'Snap Ghost Empty',
    subtitle: 'E2E empty hover and input',
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

function buildBrassQuartetTemplateScore(measureCount = 8) {
  const draft = createDefaultNewScoreDraft();
  draft.instrumentIds = ['trumpet-bb', 'trumpet-bb', 'horn-f', 'trombone'];
  draft.title = 'Snap Brass Quartet';
  draft.measureCount = measureCount;
  return createNewScoreXml(draft);
}

function multiPartRestMeasureXml(input: { measureNumber: number; staves: 1 | 2 }) {
  const attributes = input.measureNumber === 1
    ? [
        '      <attributes>',
        '        <divisions>4</divisions>',
        '        <key><fifths>0</fifths></key>',
        '        <time><beats>4</beats><beat-type>4</beat-type></time>',
        input.staves === 2 ? '        <staves>2</staves>' : '',
        '        <clef number="1"><sign>G</sign><line>2</line></clef>',
        input.staves === 2 ? '        <clef number="2"><sign>F</sign><line>4</line></clef>' : '',
        '      </attributes>',
      ].filter(Boolean).join('\n')
    : '';
  const staffOneRest = noteXml({ duration: 16, staff: 1, rest: true, wholeRest: true });
  const staffTwoRest = input.staves === 2
    ? [
        '      <backup><duration>16</duration></backup>',
        noteXml({ duration: 16, staff: 2, rest: true, wholeRest: true }),
      ].join('\n')
    : '';
  return [
    `    <measure number="${input.measureNumber}">`,
    attributes,
    staffOneRest,
    staffTwoRest,
    '    </measure>',
  ].filter(Boolean).join('\n');
}

function buildMultiInstrumentRestGridScore(measureCount = 6) {
  const parts = [
    { id: 'P1', name: 'Piano', staves: 2 as const },
    { id: 'P2', name: 'Organ', staves: 2 as const },
    { id: 'P3', name: 'Violin', staves: 1 as const },
    { id: 'P4', name: 'Cello', staves: 1 as const },
  ];
  const partList = parts
    .map((part) => `    <score-part id="${part.id}"><part-name>${part.name}</part-name></score-part>`)
    .join('\n');
  const partBodies = parts.map((part) => [
    `  <part id="${part.id}">`,
    Array.from({ length: measureCount }, (_, index) => multiPartRestMeasureXml({
      measureNumber: index + 1,
      staves: part.staves,
    })).join('\n'),
    '  </part>',
  ].join('\n')).join('\n');

  return `<?xml version="1.0" encoding="UTF-8"?>
<score-partwise version="3.1">
  <work><work-title>Snap Multi Instrument Grid</work-title></work>
  <part-list>
${partList}
  </part-list>
${partBodies}
</score-partwise>
`;
}

function buildDifferentRhythmInstrumentScore() {
  const upperMeasure = [
    noteXml({ duration: 4, staff: 1, step: 'C', octave: 4 }),
    noteXml({ duration: 4, staff: 1, rest: true }),
    noteXml({ duration: 8, staff: 1, rest: true }),
  ].join('\n');
  const lowerMeasure = noteXml({ duration: 16, staff: 1, rest: true, wholeRest: true });
  const buildPart = (partId: string, body: string, clef: { sign: 'G' | 'F'; line: 2 | 4 }) => `  <part id="${partId}">
    <measure number="1">
      <attributes>
        <divisions>4</divisions>
        <key><fifths>0</fifths></key>
        <time><beats>4</beats><beat-type>4</beat-type></time>
        <clef><sign>${clef.sign}</sign><line>${clef.line}</line></clef>
      </attributes>
${body}
    </measure>
  </part>`;

  return `<?xml version="1.0" encoding="UTF-8"?>
<score-partwise version="3.1">
  <work><work-title>Different Rhythm Instruments</work-title></work>
  <part-list>
    <score-part id="P1"><part-name>Upper</part-name></score-part>
    <score-part id="P2"><part-name>Lower</part-name></score-part>
  </part-list>
${buildPart('P1', upperMeasure, { sign: 'G', line: 2 })}
${buildPart('P2', lowerMeasure, { sign: 'F', line: 4 })}
</score-partwise>
`;
}

function durationTypeForDivisions(duration: number) {
  if (duration >= 32) return 'whole';
  if (duration >= 16) return 'half';
  if (duration >= 8) return 'quarter';
  if (duration >= 4) return 'eighth';
  return '16th';
}

function variableNoteXml(input: {
  duration: number;
  staff: 1 | 2;
  step?: string;
  octave?: number;
  rest?: boolean;
  wholeRest?: boolean;
}) {
  const pitch = input.rest
    ? input.wholeRest
      ? '<rest measure="yes"/>'
      : '<rest/>'
    : `<pitch><step>${input.step}</step><octave>${input.octave}</octave></pitch>`;
  return [
    '      <note>',
    `        ${pitch}`,
    `        <duration>${input.duration}</duration>`,
    '        <voice>1</voice>',
    `        <type>${durationTypeForDivisions(input.duration)}</type>`,
    `        <staff>${input.staff}</staff>`,
    '      </note>',
  ].join('\n');
}

function timeSignatureForMeasure(measureNumber: number) {
  if (measureNumber >= 21) return { beats: 7, beatType: 8, duration: 28 };
  if (measureNumber >= 17) return { beats: 2, beatType: 4, duration: 16 };
  if (measureNumber >= 13) return { beats: 6, beatType: 8, duration: 24 };
  if (measureNumber >= 9) return { beats: 5, beatType: 8, duration: 20 };
  if (measureNumber >= 5) return { beats: 3, beatType: 4, duration: 24 };
  return { beats: 4, beatType: 4, duration: 32 };
}

function variableMeterMeasureBody(measureNumber: number) {
  const meter = timeSignatureForMeasure(measureNumber);
  const timeChangeMeasures = new Set([1, 5, 9, 13, 17, 21]);
  const attributes = timeChangeMeasures.has(measureNumber)
    ? [
        '      <attributes>',
        measureNumber === 1 ? '        <divisions>8</divisions>' : '',
        measureNumber === 1 ? '        <key><fifths>0</fifths></key>' : '',
        `        <time><beats>${meter.beats}</beats><beat-type>${meter.beatType}</beat-type></time>`,
        measureNumber === 1 ? '        <staves>2</staves>' : '',
        measureNumber === 1 ? '        <clef number="1"><sign>G</sign><line>2</line></clef>' : '',
        measureNumber === 1 ? '        <clef number="2"><sign>F</sign><line>4</line></clef>' : '',
        '      </attributes>',
      ].filter(Boolean).join('\n')
    : '';
  const print = timeChangeMeasures.has(measureNumber) && measureNumber > 1
    ? '      <print new-system="yes"/>'
    : '';

  const eighth = 4;
  const staffOneDurations = (() => {
    if (meter.beatType === 4 && meter.beats === 4) return [8, 8, 8, 8];
    if (meter.beatType === 4 && meter.beats === 3) return [8, 4, 4, 8];
    if (meter.beatType === 4 && meter.beats === 2) return [4, 4, 8];
    if (meter.beatType === 8 && meter.beats === 5) return [4, 4, 4, 8];
    if (meter.beatType === 8 && meter.beats === 6) return [4, 4, 8, 8];
    return [4, 4, 4, 4, 4, 8];
  })();

  const steps = ['C', 'D', 'E', 'F', 'G', 'A', 'B'];
  const staffOne = staffOneDurations.map((duration, index) => {
    const useRest = (measureNumber + index) % 3 === 0;
    return variableNoteXml({
      duration,
      staff: 1,
      rest: useRest,
      step: steps[(measureNumber + index) % steps.length],
      octave: measureNumber % 2 === 0 ? 5 : 4,
    });
  }).join('\n');
  const staffOneTotal = staffOneDurations.reduce((sum, duration) => sum + duration, 0);
  const staffOneTail = meter.duration - staffOneTotal;
  const paddedStaffOne = staffOneTail > 0
    ? `${staffOne}\n${variableNoteXml({ duration: staffOneTail, staff: 1, rest: true })}`
    : staffOne;

  return [
    print,
    attributes,
    paddedStaffOne,
    `      <backup><duration>${meter.duration}</duration></backup>`,
    variableNoteXml({ duration: meter.duration, staff: 2, rest: true, wholeRest: true }),
  ].filter(Boolean).join('\n');
}

function buildVariableMeterStressScore() {
  const measures = Array.from({ length: 24 }, (_, index) => {
    const measureNumber = index + 1;
    return [
      `    <measure number="${measureNumber}">`,
      variableMeterMeasureBody(measureNumber),
      '    </measure>',
    ].join('\n');
  }).join('\n');

  return `<?xml version="1.0" encoding="UTF-8"?>
<score-partwise version="3.1">
  <work><work-title>Snap Variable Meter Stress</work-title></work>
  <part-list>
    <score-part id="P1"><part-name>Piano</part-name></score-part>
  </part-list>
  <part id="P1">
${measures}
  </part>
</score-partwise>
`;
}

function timestampRatio(value: string | null | undefined) {
  if (!value) return null;
  const [numText, denText] = value.split('/');
  const num = Number.parseInt(numText ?? '', 10);
  const den = Number.parseInt(denText ?? '', 10);
  if (!Number.isFinite(num) || !Number.isFinite(den) || den <= 0) return null;
  return num / den;
}

function formatSnap(snap: SnapPoint) {
  return `id=${snap.id} m${snap.measure} part=${snap.part ?? 'partless'} s${snap.staff} v${snap.voice} ts=${snap.timestamp} x=${snap.x} y=${snap.y} rest=${snap.isRest} synthetic=${snap.synthetic} issue=${snap.issue ?? 'none'}`;
}

function visualSnapX(snap: SnapPoint) {
  const match = /:x:(-?\d+(?:\.\d+)?):y:/.exec(snap.id);
  const parsed = match ? Number.parseFloat(match[1]!) : Number.NaN;
  return Number.isFinite(parsed) ? parsed : snap.x;
}

function groupKey(snap: Pick<SnapPoint, 'measure' | 'part' | 'staff' | 'voice' | 'timestamp'>) {
  return `m${snap.measure}:${snap.part ?? 'partless'}:s${snap.staff}:v${snap.voice}@${snap.timestamp}`;
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

async function seedScore(page: Page, xml: string, filename: string) {
  await page.addInitScript(({ bootXml, bootFilename }: { bootXml: string; bootFilename: string }) => {
    const now = Date.now();
    localStorage.clear();
    localStorage.setItem('nex-note:score-library', JSON.stringify([{
      id: `snap-debug-${bootFilename}`,
      name: bootFilename,
      xml: bootXml,
      format: 'musicxml',
      sizeBytes: bootXml.length,
      measures: 4,
      parts: 1,
      favorite: false,
      createdAt: now,
      updatedAt: now,
      lastOpenedAt: now,
    }]));
    localStorage.setItem('nex-note:recent-files', JSON.stringify([{
      name: bootFilename,
      timestamp: now,
      size: bootXml.length,
    }]));
    localStorage.setItem('nex-note:e2e-boot', JSON.stringify({
      xml: bootXml,
      filename: bootFilename,
    }));
  }, { bootXml: xml, bootFilename: filename });
}

async function waitForScore(page: Page) {
  await expect(page.getByTestId('score-viewport')).toBeVisible({ timeout: 15_000 });
  await expect(page.locator('[data-testid="score-canvas"] svg').first()).toBeVisible({ timeout: 15_000 });
  await expect(page.locator('[data-measure-number]').first()).toBeVisible({ timeout: 15_000 });
  await page.getByTestId('score-viewport').focus();
}

async function bootWithScore(page: Page, xml: string, filename: string, url = '/?debug=true') {
  await seedScore(page, xml, filename);
  await page.goto(url);
  await waitForScore(page);
}

async function readReport(page: Page): Promise<SemanticGridReport | null> {
  return page.evaluate(() => (
    (window as typeof window & { __NEX_NOTE_SEMANTIC_GRID__?: SemanticGridReport }).__NEX_NOTE_SEMANTIC_GRID__
      ?? null
  ));
}

async function readSummary(page: Page): Promise<SemanticGridSummary | null> {
  return page.evaluate(() => (
    (window as typeof window & { __NEX_NOTE_SEMANTIC_GRID_ERRORS__?: SemanticGridSummary }).__NEX_NOTE_SEMANTIC_GRID_ERRORS__
      ?? null
  ));
}

async function waitForDebugReport(page: Page) {
  await expect.poll(async () => {
    const report = await readReport(page);
    return report?.snaps?.length ?? 0;
  }, {
    timeout: 15_000,
    intervals: [100, 250, 500],
  }).toBeGreaterThan(0);
  const report = await readReport(page);
  if (!report) throw new Error('window.__NEX_NOTE_SEMANTIC_GRID__ was not published');
  return report;
}

async function waitForCleanDoctor(page: Page, context: string) {
  await expect.poll(async () => {
    const summary = await readSummary(page);
    return summary ? 1 : 0;
  }, { timeout: 10_000 }).toBe(1);

  const summary = await readSummary(page);
  if (!summary) throw new Error(`${context}: missing window.__NEX_NOTE_SEMANTIC_GRID_ERRORS__`);
  expect(
    summary.debugLayer.semanticGridIssueCount,
    `${context}: Doctor summary must expose semanticGridIssueCount.\n${JSON.stringify(summary, null, 2)}`,
  ).toBe(0);
  expect(
    summary.debugLayer.snapIssueCount,
    `${context}: Snap Doctor issues detected.\n${JSON.stringify(summary, null, 2)}`,
  ).toBe(0);
  expect(
    summary.debugLayer.snapMultiXIssueCount,
    `${context}: multi-X snap issues detected.\n${JSON.stringify(summary, null, 2)}`,
  ).toBe(0);
  expect(
    summary.issueCount,
    `${context}: Doctor reported issues.\n${JSON.stringify(summary, null, 2)}`,
  ).toBe(0);
  return summary;
}

async function waitForSnapDoctorClean(page: Page, context: string) {
  await expect.poll(async () => {
    const summary = await readSummary(page);
    return summary ? 1 : 0;
  }, { timeout: 10_000 }).toBe(1);

  const summary = await readSummary(page);
  if (!summary) throw new Error(`${context}: missing window.__NEX_NOTE_SEMANTIC_GRID_ERRORS__`);
  expect(
    summary.debugLayer.snapIssueCount,
    `${context}: Snap Doctor issues detected.\n${JSON.stringify(summary, null, 2)}`,
  ).toBe(0);
  expect(
    summary.debugLayer.snapMultiXIssueCount,
    `${context}: multi-X snap issues detected.\n${JSON.stringify(summary, null, 2)}`,
  ).toBe(0);
  return summary;
}

async function closeDoctorPanelIfOpen(page: Page) {
  const closeButton = page.locator('button:has-text("Close")').first();
  await closeButton.click({ timeout: 2_000 }).catch(() => undefined);
}

async function measureBoxes(page: Page, measureNumber: number, scrollIntoView = true): Promise<Rect[]> {
  const locator = page.locator(`[data-measure-number="${measureNumber}"]`);
  if (scrollIntoView) await locator.first().scrollIntoViewIfNeeded();
  const boxes = await locator.evaluateAll((elements) => elements.map((element) => {
    const rect = element.getBoundingClientRect();
    return { x: rect.x, y: rect.y, width: rect.width, height: rect.height };
  }));
  if (boxes.length === 0) throw new Error(`Missing measure overlay for measure ${measureNumber}`);
  return boxes.sort((a, b) => a.y - b.y || b.height - a.height || b.width - a.width);
}

async function scrollMeasureLaneIntoView(page: Page, input: { measure: number; part?: string; staff?: number }) {
  const partId = input.part?.replace(/^part:/, '');
  const staffId = input.staff ?? 1;
  const selector = partId
    ? `[data-measure-id="measure:${partId}:${staffId}:${input.measure}"][data-measure-staff="${staffId}"]`
    : `[data-measure-number="${input.measure}"]`;
  const locator = page.locator(selector).first();
  await expect(locator, `Missing measure lane ${selector}`).toBeVisible({ timeout: 5_000 });
  await locator.scrollIntoViewIfNeeded();
}

async function waitForDebugReportForLane(page: Page, input: { measure: number; part?: string; staff?: number }) {
  await expect.poll(async () => {
    const report = await readReport(page);
    return report?.snaps.some((snap) => (
      snap.measure === input.measure
      && (input.part == null || snap.part === input.part)
      && (input.staff == null || snap.staff === input.staff)
    )) ? 1 : 0;
  }, {
    timeout: 5_000,
    intervals: [100, 250, 500],
  }).toBe(1);
  const report = await readReport(page);
  if (!report) throw new Error('window.__NEX_NOTE_SEMANTIC_GRID__ was not published');
  return report;
}

async function snapDotCenter(page: Page, snap: SnapPoint, scroll = true) {
  const locator = page.locator(
    [
      `[data-semantic-snap-measure="${snap.measure}"]`,
      `[data-semantic-snap-part="${snap.part ?? 'partless'}"]`,
      `[data-semantic-snap-staff="${snap.staff}"]`,
      `[data-semantic-snap-voice="${snap.voice}"]`,
      `[data-semantic-snap-timestamp="${snap.timestamp}"]`,
    ].join(''),
  ).first();
  await expect(locator, `Missing visible snap dot for ${formatSnap(snap)}`).toBeVisible();
  if (scroll) await locator.evaluate((element) => element.scrollIntoView({ block: 'center', inline: 'center' }));
  const box = await locator.boundingBox();
  if (!box) throw new Error(`Missing snap dot bounding box for ${formatSnap(snap)}`);
  return { x: box.x + (box.width / 2), y: box.y + (box.height / 2), box };
}

async function readGhost(page: Page): Promise<GhostSnapshot | null> {
  return page.evaluate(() => {
    const element = document.querySelector<HTMLElement>('[data-testid="ghost-note-preview"]');
    if (!element || element.offsetParent === null) return null;
    const box = element.getBoundingClientRect();
    const parseNumber = (value: string | undefined) => {
      const parsed = Number.parseFloat(value ?? '');
      return Number.isFinite(parsed) ? parsed : null;
    };
    return {
      part: element.dataset.ghostCorePartId ?? null,
      measure: element.dataset.ghostMeasure ?? null,
      staff: element.dataset.ghostStaff ?? null,
      voice: element.dataset.ghostVoice ?? null,
      timestamp: element.dataset.ghostTimestamp ?? null,
      pitch: element.dataset.ghostPitch ?? null,
      mode: element.dataset.ghostMode ?? null,
      commitMeasure: element.dataset.ghostCommitMeasure ?? null,
      commitPart: element.dataset.ghostCommitCorePartId ?? null,
      commitStaff: element.dataset.ghostCommitStaff ?? null,
      commitVoice: element.dataset.ghostCommitVoice ?? null,
      commitTimestamp: element.dataset.ghostCommitTimestamp ?? null,
      commitX: parseNumber(element.dataset.ghostCommitX),
      snapTrace: (() => {
        try {
          return element.dataset.ghostSnapTrace ? JSON.parse(element.dataset.ghostSnapTrace) : null;
        } catch {
          return null;
        }
      })(),
      noteheadCenterX: Number.parseFloat(element.dataset.ghostNoteheadCenterX ?? '0'),
      noteheadCenterY: Number.parseFloat(element.dataset.ghostNoteheadCenterY ?? '28'),
      box: { x: box.x, y: box.y, width: box.width, height: box.height },
    };
  });
}

async function hoverSnap(page: Page, snap: SnapPoint) {
  const center = await snapDotCenter(page, snap);
  await page.mouse.move(center.x, center.y);
  await expect(page.getByTestId('ghost-note-preview')).toBeVisible({ timeout: 3_000 });
  const ghost = await readGhost(page);
  if (!ghost) throw new Error(`No ghost after hovering ${formatSnap(snap)}`);
  return { center, ghost };
}

async function hoverSnapAtStaffCenter(page: Page, snap: SnapPoint) {
  const center = await snapDotCenter(page, snap);
  const boxes = await measureBoxes(page, snap.measure, false);
  const staffBox = boxes[snap.staff - 1];
  if (!staffBox) throw new Error(`Missing staff ${snap.staff} box for ${formatSnap(snap)}`);
  const yCandidates = [
    staffBox.y + (staffBox.height / 2),
    center.y,
    staffBox.y + (staffBox.height * 0.38),
    staffBox.y + (staffBox.height * 0.62),
  ];
  for (const y of yCandidates) {
    await page.mouse.move(center.x, y);
    await page.waitForTimeout(180);
    const ghost = await readGhost(page);
    if (ghost) return { center, ghost };
  }
  await expect(page.getByTestId('ghost-note-preview'), `No ghost after hovering snap/staff candidates for ${formatSnap(snap)}`).toBeVisible({ timeout: 1_000 });
  const ghost = await readGhost(page);
  if (!ghost) throw new Error(`No ghost after hovering snap/staff candidates for ${formatSnap(snap)}`);
  return { center, ghost };
}

async function hoverNearSnap(page: Page, snap: SnapPoint, offsetX: number) {
  const center = await snapDotCenter(page, snap);
  await page.mouse.move(center.x + offsetX, center.y);
  try {
    await expect(page.getByTestId('ghost-note-preview')).toBeVisible({ timeout: 3_000 });
  } catch (error) {
    const debug = await page.evaluate(() => {
      const state = (window as typeof window & {
        __NEX_NOTE_GHOST_SNAP_TRACE__?: unknown;
        __NEX_NOTE_GHOST_SNAP_TRACE_HISTORY__?: unknown[];
        __NEX_NOTE_SEMANTIC_GRID_ERRORS__?: unknown;
      });
      return {
        active: state.__NEX_NOTE_GHOST_SNAP_TRACE__ ?? null,
        historyTail: state.__NEX_NOTE_GHOST_SNAP_TRACE_HISTORY__?.slice(-3) ?? [],
        summary: state.__NEX_NOTE_SEMANTIC_GRID_ERRORS__ ?? null,
      };
    });
    throw new Error(
      `No ghost after hovering near ${formatSnap(snap)} offsetX=${offsetX} `
      + `point=(${Math.round((center.x + offsetX) * 100) / 100},${Math.round(center.y * 100) / 100})\n`
      + `${JSON.stringify(debug, null, 2)}\n${error instanceof Error ? error.message : String(error)}`,
    );
  }
  const ghost = await readGhost(page);
  if (!ghost) throw new Error(`No ghost after hovering near ${formatSnap(snap)} offsetX=${offsetX}`);
  return { center, ghost };
}

async function expectActiveSnapDot(page: Page, snap: SnapPoint, context: string) {
  const active = page.locator(
    [
      '[data-semantic-snap-debug="active"]',
      `[data-semantic-snap-measure="${snap.measure}"]`,
      `[data-semantic-snap-staff="${snap.staff}"]`,
      `[data-semantic-snap-voice="${snap.voice}"]`,
      `[data-semantic-snap-timestamp="${snap.timestamp}"]`,
    ].join(''),
  );
  await expect(active, `${context}: matching snap dot did not become active/yellow for ${formatSnap(snap)}`).toBeVisible();
}

function expectGhostAndCommitOnSnap(ghost: GhostSnapshot, snap: SnapPoint, snapCenterX: number, context: string) {
  const ghostRatio = timestampRatio(ghost.timestamp);
  const commitRatio = timestampRatio(ghost.commitTimestamp);
  expect(ghost.measure, `${context}: ghost measure mismatch`).toBe(String(snap.measure));
  expect(ghost.staff, `${context}: ghost staff mismatch`).toBe(String(snap.staff));
  expect(ghostRatio, `${context}: ghost timestamp mismatch for ${formatSnap(snap)}`).toBeCloseTo(snap.ratio, 6);
  expect(ghost.commitMeasure, `${context}: commit measure mismatch`).toBe(String(snap.measure));
  expect(ghost.commitStaff, `${context}: commit staff mismatch`).toBe(String(snap.staff));
  expect(commitRatio, `${context}: commit timestamp mismatch for ${formatSnap(snap)}`).toBeCloseTo(snap.ratio, 6);
  expect(ghost.commitX, `${context}: missing commit X`).not.toBeNull();
  expect(ghost.commitX!, `${context}: commit X drifted from snap ${formatSnap(snap)}`).toBeCloseTo(visualSnapX(snap), 0);

  const ghostNoteheadX = ghost.box.x + ghost.noteheadCenterX;
  expect(
    Math.abs(ghostNoteheadX - snapCenterX),
    `${context}: ghost notehead X ${ghostNoteheadX} is not on snap dot X ${snapCenterX} for ${formatSnap(snap)}`,
  ).toBeLessThanOrEqual(2);

  const trace = ghost.snapTrace as {
    resolver?: string;
    effectiveSnap?: { x?: number | null; timestamp?: string | null } | null;
    deltas?: { visibleNoteheadToSnap?: number | null; commitToSnap?: number | null };
  } | null;
  expect(trace, `${context}: ghost preview must expose data-ghost-snap-trace`).toBeTruthy();
  expect(trace?.resolver, `${context}: ghost snap trace must include resolver`).toBeTruthy();
  expect(
    trace?.deltas?.visibleNoteheadToSnap ?? 0,
    `${context}: trace reports visible notehead drift.\n${JSON.stringify(trace, null, 2)}`,
  ).toBeLessThanOrEqual(2);
  if (trace?.deltas?.commitToSnap != null) {
    expect(
      trace.deltas.commitToSnap,
      `${context}: trace reports commit drift.\n${JSON.stringify(trace, null, 2)}`,
    ).toBeLessThanOrEqual(2);
  }
}

function expectGhostAndCommitOnSnapOrQuantizedRest(ghost: GhostSnapshot, snap: SnapPoint, snapCenterX: number, context: string) {
  const ghostRatio = timestampRatio(ghost.timestamp);
  const commitRatio = timestampRatio(ghost.commitTimestamp);
  const trace = ghost.snapTrace as {
    resolver?: string;
    resolvedTarget?: { timestamp?: string | null; domX?: number | null; diagnostics?: string[] | null } | null;
    deltas?: { visibleNoteheadToSnap?: number | null; commitToSnap?: number | null };
  } | null;
  const restOnlyQuantizedHover = Boolean(
    snap.isRest
    && ghostRatio != null
    && Math.abs(ghostRatio - snap.ratio) > 1e-6
    && trace?.resolvedTarget?.diagnostics?.includes('rest-only-snap-selected')
  );

  if (!restOnlyQuantizedHover) {
    expectGhostAndCommitOnSnap(ghost, snap, snapCenterX, context);
    return;
  }

  expect(ghost.measure, `${context}: quantized rest ghost measure mismatch`).toBe(String(snap.measure));
  expect(ghost.staff, `${context}: quantized rest ghost staff mismatch`).toBe(String(snap.staff));
  expect(ghost.commitMeasure, `${context}: quantized rest commit measure mismatch`).toBe(String(snap.measure));
  expect(ghost.commitStaff, `${context}: quantized rest commit staff mismatch`).toBe(String(snap.staff));
  expect(commitRatio, `${context}: quantized rest commit timestamp mismatch`).toBeCloseTo(ghostRatio!, 6);
  expect(trace?.resolver, `${context}: quantized rest ghost snap trace must include resolver`).toBeTruthy();
  expect(timestampRatio(trace?.resolvedTarget?.timestamp ?? null), `${context}: quantized rest trace timestamp mismatch`).toBeCloseTo(ghostRatio!, 6);
  if (trace?.resolvedTarget?.domX != null && ghost.commitX != null) {
    expect(ghost.commitX, `${context}: quantized rest commit X drifted from trace target`).toBeCloseTo(trace.resolvedTarget.domX, 0);
  }
  expect(
    trace?.deltas?.visibleNoteheadToSnap ?? 0,
    `${context}: quantized rest trace reports visible notehead drift.\n${JSON.stringify(trace, null, 2)}`,
  ).toBeLessThanOrEqual(2);
  if (trace?.deltas?.commitToSnap != null) {
    expect(
      trace.deltas.commitToSnap,
      `${context}: quantized rest trace reports commit drift.\n${JSON.stringify(trace, null, 2)}`,
    ).toBeLessThanOrEqual(2);
  }
}

async function expectVisibleGhostOnMatchingSnap(page: Page, ghost: GhostSnapshot | null, report: SemanticGridReport, context: string) {
  if (!ghost) return;
  const ghostRatio = timestampRatio(ghost.timestamp);
  const snap = report.snaps.find((entry) => (
    String(entry.measure) === ghost.measure
    && String(entry.staff) === ghost.staff
    && ghostRatio != null
    && Math.abs(entry.ratio - ghostRatio) < 1e-6
  ));
  if (!snap) throw new Error(`${context}: visible ghost has no matching snap. ghost=${JSON.stringify(ghost)}`);
  const snapCenter = await snapDotCenter(page, snap, false);
  const ghostNoteheadX = ghost.box.x + ghost.noteheadCenterX;
  expect(
    Math.abs(ghostNoteheadX - snapCenter.x),
    `${context}: visible ghost notehead is not on snap. ghostX=${ghostNoteheadX} ${formatSnap(snap)}`,
  ).toBeLessThanOrEqual(2);
}

async function enterQuarterNoteMode(page: Page) {
  await page.keyboard.press('Escape');
  await page.keyboard.press('N');
  await page.keyboard.press('5');
}

async function enterEighthNoteMode(page: Page) {
  await page.keyboard.press('Escape');
  await page.keyboard.press('N');
  await page.keyboard.press('4');
}

function assertNoDuplicateSnaps(report: SemanticGridReport, context: string) {
  const groups = new Map<string, SnapPoint[]>();
  for (const snap of report.snaps) {
    const key = groupKey(snap);
    groups.set(key, [...(groups.get(key) ?? []), snap]);
  }
  const duplicates = [...groups.values()].filter((group) => group.length > 1);
  expect(
    duplicates.map((group) => group.map(formatSnap).join('\n')).join('\n\n'),
    `${context}: duplicate visible snap points for one rhythmic slot`,
  ).toBe('');
  expect(
    report.snapIssues.map((issue) => `${issue.code}: ${issue.message}`).join('\n'),
    `${context}: snap issues should be empty`,
  ).toBe('');
}

async function assertSnapDotsStayOnStaff(page: Page, report: SemanticGridReport, context: string) {
  for (const snap of report.snaps) {
    const staffBox = await page
      .locator(`[data-measure-id="${snap.measureId}"][data-measure-staff="${snap.staff}"]`)
      .first()
      .evaluate((element) => {
        const rect = element.getBoundingClientRect();
        return { x: rect.x, y: rect.y, width: rect.width, height: rect.height };
      })
      .catch(async () => {
        const boxes = await measureBoxes(page, snap.measure);
        return boxes[snap.staff - 1] ?? null;
      });
    if (!staffBox) throw new Error(`${context}: missing staff ${snap.staff} overlay for ${formatSnap(snap)}`);
    const center = await snapDotCenter(page, snap);
    expect(
      center.y,
      `${context}: snap dot jumped outside staff overlay. ${formatSnap(snap)} staffBox=${JSON.stringify(staffBox)}`,
    ).toBeGreaterThanOrEqual(staffBox.y - 24);
    expect(
      center.y,
      `${context}: snap dot jumped outside staff overlay. ${formatSnap(snap)} staffBox=${JSON.stringify(staffBox)}`,
    ).toBeLessThanOrEqual(staffBox.y + staffBox.height + 24);
  }
}

async function readRenderedStaffRows(page: Page): Promise<Rect[]> {
  return page.locator('[data-testid="score-canvas"] svg').first().evaluate((svg) => {
    type BrowserRect = { x: number; y: number; width: number; height: number };
    const lineCandidates = Array.from(svg.querySelectorAll<SVGGraphicsElement>('*'))
      .map((element) => {
        const rect = element.getBoundingClientRect();
        return { x: rect.x, y: rect.y, width: rect.width, height: rect.height };
      })
      .filter((rect) => (
        Number.isFinite(rect.x)
        && Number.isFinite(rect.y)
        && rect.width > 80
        && rect.height <= 3
      ))
      .sort((left, right) => left.y - right.y || left.x - right.x);

    const uniqueLines: BrowserRect[] = [];
    for (const rect of lineCandidates) {
      const existing = uniqueLines.find((line) => Math.abs(line.y - rect.y) <= 1.5);
      if (existing) {
        const x = Math.min(existing.x, rect.x);
        const right = Math.max(existing.x + existing.width, rect.x + rect.width);
        existing.x = x;
        existing.width = right - x;
        existing.height = Math.max(existing.height, rect.height);
      } else {
        uniqueLines.push({ ...rect });
      }
    }

    const groups: BrowserRect[][] = [];
    for (const line of uniqueLines) {
      const previousGroup = groups[groups.length - 1];
      const previousLine = previousGroup?.[previousGroup.length - 1];
      if (previousGroup && previousLine && line.y - previousLine.y <= 24) {
        previousGroup.push(line);
      } else {
        groups.push([line]);
      }
    }

    return groups
      .filter((group) => group.length >= 4)
      .map((group) => {
        const x = Math.min(...group.map((line) => line.x));
        const right = Math.max(...group.map((line) => line.x + line.width));
        const y = Math.min(...group.map((line) => line.y));
        const bottom = Math.max(...group.map((line) => line.y + Math.max(line.height, 1)));
        return { x, y, width: right - x, height: bottom - y };
      })
      .filter((rect) => rect.height >= 12 && rect.height <= 90)
      .sort((left, right) => left.y - right.y || left.x - right.x);
  });
}

async function assertSnapDotsStayOnRenderedStaffRows(page: Page, report: SemanticGridReport, context: string) {
  for (const snap of report.snaps) {
    const center = await snapDotCenter(page, snap);
    const rows = await readRenderedStaffRows(page);
    const matchingRow = rows.find((row) => (
      center.y >= row.y - 14
      && center.y <= row.y + row.height + 14
    ));
    expect(
      matchingRow,
      `${context}: snap dot is not on any rendered staff row. ${formatSnap(snap)} center=${JSON.stringify(center)} rows=${JSON.stringify(rows.slice(0, 12))}`,
    ).toBeTruthy();
  }
}

async function readAnchorBoxes(page: Page): Promise<AnchorBox[]> {
  return page.locator('[data-semantic-anchor-debug]').evaluateAll((elements) => elements.map((element) => {
    const rect = element.getBoundingClientRect();
    return {
      measure: Number.parseInt(element.getAttribute('data-semantic-anchor-measure') ?? '0', 10),
      part: element.getAttribute('data-semantic-anchor-part'),
      staff: Number.parseInt(element.getAttribute('data-semantic-anchor-staff') ?? '0', 10),
      voice: Number.parseInt(element.getAttribute('data-semantic-anchor-voice') ?? '0', 10),
      x: rect.x,
      y: rect.y,
      width: rect.width,
      height: rect.height,
    };
  }));
}

async function assertAnchorGridBoxesForLane(
  page: Page,
  report: SemanticGridReport,
  input: { measure: number; part: string; staff: number; voice: number; context: string },
) {
  const snap = report.snaps.find((candidate) => (
    candidate.measure === input.measure
    && candidate.part === input.part
    && candidate.staff === input.staff
    && candidate.voice === input.voice
  ));
  if (!snap) throw new Error(`${input.context}: missing snap for m${input.measure} ${input.part} staff ${input.staff} voice ${input.voice}`);
  await snapDotCenter(page, snap);

  await expect.poll(async () => {
    const boxes = await readAnchorBoxes(page);
    return boxes.filter((box) => (
      box.measure === input.measure
      && box.part === input.part
      && box.staff === input.staff
      && box.voice === input.voice
    )).length;
  }, {
    timeout: 5_000,
    intervals: [100, 250, 500],
    message: `${input.context}: missing semantic anchor/grid debug box for m${input.measure} ${input.part} staff ${input.staff} voice ${input.voice}`,
  }).toBeGreaterThan(0);

  const boxes = await readAnchorBoxes(page);
  const matchingBoxes = boxes.filter((box) => (
    box.measure === input.measure
    && box.part === input.part
    && box.staff === input.staff
    && box.voice === input.voice
  ));

  const rows = await readRenderedStaffRows(page);
  for (const box of matchingBoxes) {
    const boxCenterY = box.y + (box.height / 2);
    const matchingRow = rows.find((row) => (
      boxCenterY >= row.y - 24
      && boxCenterY <= row.y + row.height + 24
    ));
    expect(
      matchingRow,
      `${input.context}: semantic anchor/grid debug box is not on a rendered staff row. box=${JSON.stringify(box)} rows=${JSON.stringify(rows.slice(0, 12))}`,
    ).toBeTruthy();
  }
}

function assertSingleRestSnapForLane(
  report: SemanticGridReport,
  input: { measure: number; part: string; staff: number; voice: number; context: string },
) {
  const snaps = report.snaps
    .filter((snap) => (
      snap.measure === input.measure
      && snap.part === input.part
      && snap.staff === input.staff
      && snap.voice === input.voice
    ))
    .sort((left, right) => left.ratio - right.ratio || left.x - right.x);
  const ratios = [...new Set(snaps.map((snap) => Math.round(snap.ratio * 1000000) / 1000000))];
  expect(
    ratios,
    `${input.context}: rest-only debug snapshot should expose the rendered rest anchor for m${input.measure} ${input.part} staff ${input.staff} voice ${input.voice}\n${snaps.map(formatSnap).join('\n')}`,
  ).toEqual([0]);
  expect(snaps, `${input.context}: missing rendered rest snap for m${input.measure} ${input.part} staff ${input.staff}`).toHaveLength(1);
  expect(snaps[0]!.isRest, `${input.context}: visible snap should be the rendered rest anchor`).toBe(true);
}

function assertNoForbiddenGhostDiagnostics(summary: SemanticGridSummary, context: string) {
  const forbidden = summary.scoreDiagnostics.filter((diagnostic) => (
    FORBIDDEN_GHOST_DIAGNOSTIC_CODES.includes(diagnostic.code)
  ));
  expect(
    forbidden.map((diagnostic) => `${diagnostic.code}: ${diagnostic.message}`).join('\n'),
    `${context}: forbidden ghost diagnostics`,
  ).toBe('');
}

function assertGhostSnapTracePublished(summary: SemanticGridSummary, context: string) {
  const trace = summary.activeGhostSnapTrace ?? summary.ghostSnapTraceHistory?.at(-1) ?? null;
  expect(trace, `${context}: Doctor did not publish activeGhostSnapTrace or ghostSnapTraceHistory.\n${JSON.stringify(summary, null, 2)}`).toBeTruthy();
  expect(trace?.resolver, `${context}: ghost snap trace must include resolver`).toBeTruthy();
  expect(trace?.timestamp, `${context}: ghost snap trace must include timestamp`).toBeTruthy();
  expect(
    trace?.deltas?.visibleNoteheadToSnap ?? 0,
    `${context}: visible notehead drift in Doctor trace.\n${JSON.stringify(trace, null, 2)}`,
  ).toBeLessThanOrEqual(2);
  if (trace?.deltas?.commitToSnap != null) {
    expect(
      trace.deltas.commitToSnap,
      `${context}: commit drift in Doctor trace.\n${JSON.stringify(trace, null, 2)}`,
    ).toBeLessThanOrEqual(2);
  }
}

async function readCurrentCore(page: Page) {
  const xml = await page.evaluate(() => (
    (window as typeof window & { __NEX_NOTE_E2E_STATE__?: { xml: string } }).__NEX_NOTE_E2E_STATE__?.xml ?? ''
  ));
  return importMusicXmlToCore(xml);
}

test.beforeEach(async ({ page }) => {
  await installPlaybackStubs(page);
});

test.afterEach(async ({ page }, testInfo: TestInfo) => {
  await writeFailureArtifacts(page, testInfo);
});

test('debug layer is hidden normally and exposes snap/Doctor data with debug=true', async ({ page }) => {
  await bootWithScore(page, buildFullRestScore(3), 'snap-debug-layer.musicxml', '/');

  await expect(page.locator('[data-semantic-snap-debug]')).toHaveCount(0);
  await expect(page.locator('[data-semantic-anchor-debug]')).toHaveCount(0);
  await expect(page.locator('[data-semantic-anchor-protected-debug]')).toHaveCount(0);
  await expect(page.locator('[data-semantic-anchor-guard-debug]')).toHaveCount(0);
  await expect(page.locator('[data-semantic-anchor-overlap-debug]')).toHaveCount(0);

  await page.goto('/?debug=true');
  await waitForScore(page);
  const report = await waitForDebugReport(page);
  const summary = await waitForCleanDoctor(page, 'debug=true boot');

  expect(report.snaps.length, 'debug=true should render snap dots').toBeGreaterThan(0);
  await expect(page.locator('[data-semantic-snap-debug]').first()).toBeVisible();
  expect(summary.debugLayer.semanticGridIssueCount, 'Doctor summary must expose Semantic Grid diagnostics').toBe(0);
  expect(summary.debugLayer.snapCount, 'Doctor summary must expose snap count').toBe(report.snaps.length);
});

test('full-measure rests expose one stable snap per measure and staff', async ({ page }) => {
  await bootWithScore(page, buildFullRestScore(5), 'snap-full-rests.musicxml');
  await enterQuarterNoteMode(page);
  const report = await waitForDebugReport(page);
  await waitForCleanDoctor(page, 'full rests');
  assertNoDuplicateSnaps(report, 'full rests');

  for (let measure = 1; measure <= 5; measure += 1) {
    for (const staff of [1, 2]) {
      assertSingleRestSnapForLane(report, {
        measure,
        part: 'part:P1',
        staff,
        voice: 1,
        context: 'full rests',
      });
      const snaps = report.snaps.filter((snap) => (
        snap.measure === measure
        && snap.part === 'part:P1'
        && snap.staff === staff
        && snap.voice === 1
      ));
      const beatOneSnap = snaps.find((snap) => snap.ratio === 0);
      expect(beatOneSnap?.isRest, `m${measure} staff ${staff}: beat-one snap should come from the full rest`).toBe(true);

      const measureSummary = report.measures.find((entry) => entry.measureIndex === measure);
      if (!measureSummary) throw new Error(`Missing semantic measure summary for measure ${measure}`);
      const protectedRegion = report.protectedRegions.find((region) => region.measure === measure && region.staff === staff);
      const protectedRight = protectedRegion?.right ?? measureSummary.measureLeft;
      for (const snap of snaps) {
        const snapX = visualSnapX(snap);
        expect(
          snapX,
          `m${measure} staff ${staff}: snap is inside the left protected/barline region. ${formatSnap(snap)} protected=${JSON.stringify(protectedRegion)} measure=${JSON.stringify(measureSummary)}`,
        ).toBeGreaterThan(protectedRight + 3);
        expect(
          snapX - measureSummary.measureLeft,
          `m${measure} staff ${staff}: snap is too close to the barline. ${formatSnap(snap)} measure=${JSON.stringify(measureSummary)}`,
        ).toBeGreaterThan(12);
        expect(
          snapX,
          `m${measure} staff ${staff}: snap is outside musical content. ${formatSnap(snap)} measure=${JSON.stringify(measureSummary)}`,
        ).toBeLessThan(measureSummary.measureXEnd);
      }
    }
  }

  await assertSnapDotsStayOnStaff(page, report, 'full rests');

  const farHoverSnap = report.snaps.find((snap) => snap.measure === 1 && snap.part === 'part:P1' && snap.staff === 1 && snap.ratio === 0);
  if (!farHoverSnap) throw new Error('Missing full-rest snap for hover assertion');
  const farSnapCenter = await snapDotCenter(page, farHoverSnap);
  await page.mouse.move(farSnapCenter.x, farSnapCenter.y);
  await expect(page.getByTestId('ghost-note-preview')).toBeVisible({ timeout: 3_000 });
  const farGhost = await readGhost(page);
  if (!farGhost) throw new Error('No ghost after far hover in full-rest measure');
  expectGhostAndCommitOnSnapOrQuantizedRest(farGhost, farHoverSnap, farSnapCenter.x, `full-rest hover ${formatSnap(farHoverSnap)}`);
  const farGhostRatio = timestampRatio(farGhost.timestamp);
  if (!farHoverSnap.isRest || farGhostRatio == null || Math.abs(farGhostRatio - farHoverSnap.ratio) <= 1e-6) {
    await expectActiveSnapDot(page, farHoverSnap, 'full-rest hover');
  }

  for (const measure of [2, 3, 5]) {
    for (const staff of [1, 2]) {
      const snap = report.snaps.find((entry) => (
        entry.measure === measure
        && entry.part === 'part:P1'
        && entry.staff === staff
        && entry.voice === 1
        && entry.ratio === 0
      ));
      if (!snap) throw new Error(`Missing full-rest snap for hover m${measure} staff ${staff}`);
      const { center, ghost } = await hoverSnap(page, snap);
      expectGhostAndCommitOnSnap(ghost, snap, center.x, `full-rest snap hover m${measure} staff ${staff}`);
      const trace = ghost.snapTrace as { resolvedTarget?: { diagnostics?: string[] | null; timestamp?: string | null } | null } | null;
      expect(
        trace?.resolvedTarget?.diagnostics?.includes('rest-only-quantized-internal-slot') ?? false,
        `full-rest snap hover must not preserve an internal rest-only target for m${measure} staff ${staff}`,
      ).toBe(false);
      expect(
        timestampRatio(trace?.resolvedTarget?.timestamp ?? null),
        `full-rest resolver must stay on beat one for m${measure} staff ${staff}`,
      ).toBe(0);
      await expectActiveSnapDot(page, snap, `full-rest snap hover m${measure} staff ${staff}`);

      const measureSummary = report.measures.find((entry) => entry.measureIndex === measure);
      if (!measureSummary) throw new Error(`Missing measure summary for full-rest body hover m${measure}`);
      for (const xRatio of [0.35, 0.65, 0.9]) {
        const x = measureSummary.measureXStart + ((measureSummary.measureXEnd - measureSummary.measureXStart) * xRatio);
        await page.mouse.move(x, center.y);
        await page.waitForTimeout(180);
        const bodyGhost = await readGhost(page);
        if (!bodyGhost) continue;
        const bodyTrace = bodyGhost.snapTrace as { rawPointerX?: number | null; safePointerX?: number | null } | null;
        const tracePointerX = typeof bodyTrace?.rawPointerX === 'number'
          ? bodyTrace.rawPointerX
          : typeof bodyTrace?.safePointerX === 'number'
            ? bodyTrace.safePointerX
            : null;
        if (tracePointerX != null && Math.abs(tracePointerX - x) > 2) continue;
        if (bodyGhost.measure !== String(measure) || bodyGhost.staff !== String(staff)) continue;
        expect(bodyGhost.measure, `full-rest body hover must stay in measure ${measure} staff ${staff}`).toBe(String(measure));
        expect(bodyGhost.staff, `full-rest body hover must stay on staff ${staff} measure ${measure}`).toBe(String(staff));
        expect(
          timestampRatio(bodyGhost.timestamp),
          `full-rest body hover must not expose an internal visible timestamp for m${measure} staff ${staff} ratio ${xRatio}`,
        ).toBe(0);
        expect(
          timestampRatio(bodyGhost.commitTimestamp),
          `full-rest body hover must not commit an internal timestamp for m${measure} staff ${staff} ratio ${xRatio}`,
        ).toBe(0);
        expect(
          Math.abs((bodyGhost.box.x + bodyGhost.noteheadCenterX) - center.x),
          `full-rest body hover must keep the visible notehead on the single snap for m${measure} staff ${staff} ratio ${xRatio}`,
        ).toBeLessThanOrEqual(2);
      }
    }
  }
});

test('multi-instrument full-rest score exposes one clean snap on every staff row', async ({ page }) => {
  await bootWithScore(page, buildMultiInstrumentRestGridScore(4), 'snap-multi-instrument-rest-grid.musicxml');
  await enterQuarterNoteMode(page);
  let report = await waitForDebugReport(page);
  await waitForSnapDoctorClean(page, 'multi-instrument rest grid');
  report = await waitForDebugReport(page);
  await closeDoctorPanelIfOpen(page);

  assertNoDuplicateSnaps(report, 'multi-instrument rest grid');
  await assertSnapDotsStayOnRenderedStaffRows(page, report, 'multi-instrument rest grid');

  const expectedLanes = [
    { part: 'part:P1', staff: 1 },
    { part: 'part:P1', staff: 2 },
    { part: 'part:P2', staff: 1 },
    { part: 'part:P2', staff: 2 },
    { part: 'part:P3', staff: 1 },
    { part: 'part:P4', staff: 1 },
  ];
  for (const measure of [1, 2, 3, 4]) {
    for (const lane of expectedLanes) {
      await scrollMeasureLaneIntoView(page, { measure, part: lane.part, staff: lane.staff });
      const laneReport = await waitForDebugReportForLane(page, { measure, part: lane.part, staff: lane.staff });
      assertSingleRestSnapForLane(laneReport, {
        measure,
        part: lane.part,
        staff: lane.staff,
        voice: 1,
        context: 'multi-instrument rest grid',
      });
    }
  }
});

test('different rhythms stay isolated across instruments with the same local staff index', async ({ page }) => {
  await bootWithScore(page, buildDifferentRhythmInstrumentScore(), 'snap-different-rhythm-instruments.musicxml');
  await enterQuarterNoteMode(page);
  const report = await waitForDebugReport(page);
  assertNoDuplicateSnaps(report, 'different rhythm instruments');

  const upperSnaps = report.snaps
    .filter((snap) => snap.measure === 1 && snap.part === 'part:P1' && snap.staff === 1)
    .sort((left, right) => left.ratio - right.ratio);
  const lowerSnaps = report.snaps
    .filter((snap) => snap.measure === 1 && snap.part === 'part:P2' && snap.staff === 1)
    .sort((left, right) => left.ratio - right.ratio);
  expect(upperSnaps.map((snap) => snap.ratio)).toEqual([0, 0.25, 0.5]);
  expect(lowerSnaps.map((snap) => snap.ratio)).toEqual([0]);

  const upperLateSnap = upperSnaps[2]!;
  const lowerRestSnap = lowerSnaps[0]!;
  for (let index = 0; index < 3; index += 1) {
    const upperHover = await hoverSnap(page, upperLateSnap);
    expect(upperHover.ghost.part).toBe('part:P1');
    expect(upperHover.ghost.commitPart).toBe('part:P1');
    expectGhostAndCommitOnSnap(upperHover.ghost, upperLateSnap, upperHover.center.x, 'upper rapid hover');

    const lowerHover = await hoverSnap(page, lowerRestSnap);
    expect(lowerHover.ghost.part).toBe('part:P2');
    expect(lowerHover.ghost.commitPart).toBe('part:P2');
    expectGhostAndCommitOnSnap(lowerHover.ghost, lowerRestSnap, lowerHover.center.x, 'lower rapid hover');
    expect(lowerHover.ghost.pitch, 'lower hover must use the lower instrument bass clef').not.toBe(upperHover.ghost.pitch);
  }

  const before = await readCurrentCore(page);
  const upperEventIds = before.score.parts[0]!.staves[0]!.measures[0]!.voices[0]!.events.map((event) => event.id);
  const lowerHover = await hoverSnap(page, lowerRestSnap);
  await page.mouse.click(
    lowerHover.ghost.box.x + lowerHover.ghost.noteheadCenterX,
    lowerHover.ghost.box.y + lowerHover.ghost.noteheadCenterY,
  );

  await expect.poll(async () => {
    const core = await readCurrentCore(page);
    return core.score.parts[1]!.staves[0]!.measures[0]!.voices[0]!.events[0]?.kind ?? null;
  }, { timeout: 5_000 }).toBe('note');
  const after = await readCurrentCore(page);
  expect(
    after.score.parts[0]!.staves[0]!.measures[0]!.voices[0]!.events.map((event) => event.id),
    'lower-staff insertion must not mutate the upper instrument',
  ).toEqual(upperEventIds);
});

test('brass quartet template exposes one clean rest snap on each single-staff part', async ({ page }) => {
  await bootWithScore(page, buildBrassQuartetTemplateScore(8), 'snap-brass-quartet-template.musicxml');
  await enterQuarterNoteMode(page);
  let report = await waitForDebugReport(page);
  await waitForSnapDoctorClean(page, 'brass quartet template');
  report = await waitForDebugReport(page);
  await closeDoctorPanelIfOpen(page);

  assertNoDuplicateSnaps(report, 'brass quartet template');

  for (const measure of [1, 2, 3, 4, 5, 6, 7, 8]) {
    for (const part of ['part:P1', 'part:P2', 'part:P3', 'part:P4']) {
      await scrollMeasureLaneIntoView(page, { measure, part, staff: 1 });
      report = await waitForDebugReportForLane(page, { measure, part, staff: 1 });
      assertSingleRestSnapForLane(report, {
        measure,
        part,
        staff: 1,
        voice: 1,
        context: 'brass quartet template',
      });
      await assertAnchorGridBoxesForLane(page, report, {
        measure,
        part,
        staff: 1,
        voice: 1,
        context: 'brass quartet template',
      });
    }
  }

  await assertSnapDotsStayOnRenderedStaffRows(page, report, 'brass quartet template');
});

test('four quarter notes expose four ordered snap positions with ghost/commit alignment', async ({ page }) => {
  await bootWithScore(page, buildQuarterNoteScore(), 'snap-four-quarters.musicxml');
  await enterQuarterNoteMode(page);
  const report = await waitForDebugReport(page);
  await waitForCleanDoctor(page, 'four quarters');
  assertNoDuplicateSnaps(report, 'four quarters');

  const staffOneSnaps = report.snaps
    .filter((snap) => snap.measure === 1 && snap.staff === 1)
    .sort((left, right) => left.ratio - right.ratio || left.x - right.x);
  expect(
    staffOneSnaps,
    'measure 1 staff 1 should have exactly four quarter-note snap points',
  ).toHaveLength(4);
  expect(staffOneSnaps.map((snap) => snap.ratio)).toEqual([0, 0.25, 0.5, 0.75]);
  for (let index = 1; index < staffOneSnaps.length; index += 1) {
    expect(
      staffOneSnaps[index]!.x,
      `quarter-note snaps must be strictly increasing:\n${staffOneSnaps.map(formatSnap).join('\n')}`,
    ).toBeGreaterThan(staffOneSnaps[index - 1]!.x);
  }

  for (const snap of staffOneSnaps) {
    const { center, ghost } = await hoverSnap(page, snap);
    expectGhostAndCommitOnSnap(ghost, snap, center.x, `four quarters hover ${formatSnap(snap)}`);
    await expectActiveSnapDot(page, snap, `four quarters hover ${formatSnap(snap)}`);
  }
});

test('beat-one rest with eighth-note mouse entry previews and commits on the rest snap', async ({ page }) => {
  await bootWithScore(page, buildLeadingRestScore(), 'snap-leading-rest-eighth.musicxml');
  await enterEighthNoteMode(page);
  const report = await waitForDebugReport(page);
  await waitForCleanDoctor(page, 'leading rest eighth boot');
  assertNoDuplicateSnaps(report, 'leading rest eighth');

  const beatOneRestSnap = report.snaps.find((snap) => (
    snap.measure === 1
    && snap.part === 'part:P1'
    && snap.staff === 1
    && snap.voice === 1
    && snap.isRest
    && Math.abs(snap.ratio) < 1e-6
  ));
  if (!beatOneRestSnap) {
    throw new Error(`Missing beat-one rest snap:\n${report.snaps.map(formatSnap).join('\n')}`);
  }

  const { center, ghost } = await hoverNearSnap(page, beatOneRestSnap, -6);
  expectGhostAndCommitOnSnap(ghost, beatOneRestSnap, center.x, `leading rest eighth hover ${formatSnap(beatOneRestSnap)}`);
  const ghostNoteheadX = ghost.box.x + ghost.noteheadCenterX;
  const snapX = visualSnapX(beatOneRestSnap);
  expect(Math.abs(ghostNoteheadX - center.x), 'visible ghost notehead must sit on the snap dot').toBeLessThanOrEqual(1);
  expect(ghost.commitX, 'data-ghost-commit-x must be present').not.toBeNull();
  expect(Math.abs((ghost.commitX ?? Number.NaN) - snapX), 'data-ghost-commit-x must equal the snap X').toBeLessThanOrEqual(1);

  const trace = ghost.snapTrace as {
    effectiveSnap?: { x?: number | null; timestamp?: string | null } | null;
    resolvedTarget?: { domX?: number | null; timestamp?: string | null } | null;
    deltas?: { visibleNoteheadToSnap?: number | null; commitToSnap?: number | null };
  } | null;
  expect(trace?.effectiveSnap?.x, `missing effectiveSnap.x\n${JSON.stringify(trace, null, 2)}`).not.toBeNull();
  expect(Math.abs((trace?.effectiveSnap?.x ?? Number.NaN) - snapX), 'effectiveSnap.x must equal snap X').toBeLessThanOrEqual(1);
  expect(trace?.resolvedTarget?.domX, `missing resolvedTarget.domX\n${JSON.stringify(trace, null, 2)}`).not.toBeNull();
  expect(Math.abs((trace?.resolvedTarget?.domX ?? Number.NaN) - snapX), 'resolvedTarget.domX must equal snap X').toBeLessThanOrEqual(1);
  expect(trace?.effectiveSnap?.timestamp, 'effective snap timestamp must match ghost timestamp').toBe(ghost.timestamp);
  expect(trace?.resolvedTarget?.timestamp, 'resolved target timestamp must match commit timestamp').toBe(ghost.commitTimestamp);
  expect(trace?.deltas?.visibleNoteheadToSnap ?? Number.NaN, `visible drift in trace\n${JSON.stringify(trace, null, 2)}`).toBeLessThanOrEqual(1);
  expect(trace?.deltas?.commitToSnap ?? Number.NaN, `commit drift in trace\n${JSON.stringify(trace, null, 2)}`).toBeLessThanOrEqual(1);

  await page.mouse.click(ghostNoteheadX, ghost.box.y + ghost.noteheadCenterY);
  await expect.poll(async () => {
    const core = await readCurrentCore(page);
    const firstVoice = core.score.parts[0]?.staves[0]?.measures[0]?.voices.find((voice) => voice.voiceId === 1);
    const firstEvent = firstVoice?.events.find((event) => (
      event.timestampNum === beatOneRestSnap.ratio * event.timestampDen
      && event.timestampNum === 0
    ));
    return firstEvent?.kind === 'note' ? firstEvent.durationType : null;
  }, { timeout: 5_000 }).toBe('eighth');

  const summary = await readSummary(page);
  if (!summary) throw new Error('Missing Doctor summary after leading rest eighth click');
  assertNoForbiddenGhostDiagnostics(summary, 'leading rest eighth');
});

test('empty score hover creates a grid-aligned ghost without forbidden Doctor diagnostics', async ({ page }) => {
  await bootWithScore(page, buildBlankInputScore(), 'snap-empty-score.musicxml');
  await enterQuarterNoteMode(page);
  const report = await waitForDebugReport(page);
  await waitForCleanDoctor(page, 'empty score boot');

  const firstSnap = report.snaps
    .filter((snap) => snap.measure === 1 && snap.staff === 1)
    .sort((left, right) => left.ratio - right.ratio || left.x - right.x)[0];
  if (!firstSnap) throw new Error(`No first staff snap in empty score:\n${report.snaps.map(formatSnap).join('\n')}`);

  const { center, ghost } = await hoverSnap(page, firstSnap);
  expectGhostAndCommitOnSnapOrQuantizedRest(ghost, firstSnap, center.x, `empty score hover ${formatSnap(firstSnap)}`);

  const [staffOneBox] = await measureBoxes(page, 1);
  if (!staffOneBox) throw new Error('Missing first staff measure box for empty score off-dot hover');
  const offDotX = staffOneBox.x + (staffOneBox.width * 0.78);
  await page.mouse.move(offDotX, staffOneBox.y + (staffOneBox.height / 2));
  await expect(page.getByTestId('ghost-note-preview')).toBeVisible({ timeout: 3_000 });
  const offDotGhost = await readGhost(page);
  if (!offDotGhost) throw new Error('Could not produce an off-dot ghost in the first empty measure');
  const nearestOffDotSnap = report.snaps
    .filter((snap) => snap.measure === 1 && snap.staff === 1)
    .sort((left, right) => Math.abs(visualSnapX(left) - offDotX) - Math.abs(visualSnapX(right) - offDotX))[0];
  if (!nearestOffDotSnap) throw new Error('No snap available for empty-score off-dot hover');
  const nearestOffDotSnapCenter = await snapDotCenter(page, nearestOffDotSnap);
  expectGhostAndCommitOnSnapOrQuantizedRest(
    offDotGhost,
    nearestOffDotSnap,
    nearestOffDotSnapCenter.x,
    `empty score off-dot hover ${formatSnap(nearestOffDotSnap)}`,
  );
  const offDotGhostRatio = timestampRatio(offDotGhost.timestamp);
  if (!nearestOffDotSnap.isRest || offDotGhostRatio == null || Math.abs(offDotGhostRatio - nearestOffDotSnap.ratio) <= 1e-6) {
    await expectActiveSnapDot(page, nearestOffDotSnap, 'empty score off-dot hover');
  }

  await expect.poll(async () => {
    const summary = await readSummary(page);
    return summary?.scoreDiagnostics
      .filter((diagnostic) => FORBIDDEN_GHOST_DIAGNOSTIC_CODES.includes(diagnostic.code))
      .map((diagnostic) => diagnostic.code)
      .join(',') ?? 'missing-summary';
  }, { timeout: 3_000 }).toBe('');
  const summary = await readSummary(page);
  if (!summary) throw new Error('Missing Doctor summary after empty score hover');
  assertNoForbiddenGhostDiagnostics(summary, 'empty score hover');
  assertGhostSnapTracePublished(summary, 'empty score hover');
});

test('snap grid remains stable after note input and avoids title/protected-region drift', async ({ page }) => {
  await bootWithScore(page, buildBlankInputScore(), 'snap-after-input.musicxml');
  await enterQuarterNoteMode(page);
  const before = await waitForDebugReport(page);
  await waitForCleanDoctor(page, 'before note input');

  const firstSnap = before.snaps
    .filter((snap) => snap.measure === 1 && snap.staff === 1)
    .sort((left, right) => left.ratio - right.ratio || left.x - right.x)[0];
  if (!firstSnap) throw new Error(`No first measure/staff snap before input:\n${before.snaps.map(formatSnap).join('\n')}`);
  const stableRestSnaps = before.snaps
    .filter((snap) => snap.measure > 1)
    .map((snap) => {
      const measureSummary = before.measures.find((entry) => entry.measureIndex === snap.measure);
      const width = measureSummary ? Math.max(measureSummary.measureXEnd - measureSummary.measureXStart, 1) : 1;
      const relativeX = measureSummary ? (visualSnapX(snap) - measureSummary.measureXStart) / width : visualSnapX(snap);
      return [groupKey(snap), relativeX] as const;
    });

  const { center, ghost } = await hoverSnap(page, firstSnap);
  expectGhostAndCommitOnSnapOrQuantizedRest(ghost, firstSnap, center.x, `before click ${formatSnap(firstSnap)}`);
  await page.mouse.click(center.x, center.y);

  await expect.poll(async () => {
    const core = await readCurrentCore(page);
    return core.score.parts[0].staves[0].measures[0].voices
      .flatMap((voice) => voice.events)
      .filter((event) => event.kind === 'note').length;
  }, { timeout: 5_000 }).toBeGreaterThan(0);

  const after = await waitForDebugReport(page);
  await waitForCleanDoctor(page, 'after note input');
  assertNoDuplicateSnaps(after, 'after note input');
  await assertSnapDotsStayOnStaff(page, after, 'after note input');
  await expectVisibleGhostOnMatchingSnap(page, await readGhost(page), after, 'after note input');
  const afterInputSummary = await readSummary(page);
  if (!afterInputSummary) throw new Error('Missing Doctor summary after note input');
  assertGhostSnapTracePublished(afterInputSummary, 'after note input');

  const firstMeasureSnaps = after.snaps.filter((snap) => snap.measure === 1 && snap.staff === 1);
  expect(
    firstMeasureSnaps.filter((snap) => snap.synthetic).map(formatSnap).join('\n'),
    'after input: first measure should expose only visible rendered note/rest snaps',
  ).toBe('');
  for (const snap of firstMeasureSnaps) {
    const measureSummary = after.measures.find((entry) => entry.measureIndex === snap.measure);
    if (!measureSummary) continue;
    const protectedRegion = after.protectedRegions.find((region) => region.measure === snap.measure && region.staff === snap.staff);
    const protectedRight = protectedRegion?.right ?? measureSummary.measureLeft;
    const snapX = visualSnapX(snap);
    expect(
      snapX,
      `after input: snap drifted into clef/time/protected area. ${formatSnap(snap)} protected=${JSON.stringify(protectedRegion)} measure=${JSON.stringify(measureSummary)}`,
    ).toBeGreaterThanOrEqual(protectedRight - 0.5);
    expect(
      snapX - measureSummary.measureLeft,
      `after input: snap is still pinned to the left barline. ${formatSnap(snap)} measure=${JSON.stringify(measureSummary)}`,
    ).toBeGreaterThan(12);
  }

  for (const [key, beforeRelativeX] of stableRestSnaps) {
    const snap = after.snaps.find((entry) => groupKey(entry) === key);
    if (!snap) throw new Error(`after input: missing previously stable snap ${key}`);
    const measureSummary = after.measures.find((entry) => entry.measureIndex === snap.measure);
    const width = measureSummary ? Math.max(measureSummary.measureXEnd - measureSummary.measureXStart, 1) : 1;
    const afterRelativeX = measureSummary ? (visualSnapX(snap) - measureSummary.measureXStart) / width : visualSnapX(snap);
    expect(
      Math.abs(afterRelativeX - beforeRelativeX),
      `after input: snap ${key} changed its measure-relative position from ${beforeRelativeX} to ${afterRelativeX}`,
    ).toBeLessThanOrEqual(0.03);
  }
});

test('hover and click use the same snap without cross-measure retargeting', async ({ page }) => {
  await bootWithScore(page, buildBlankInputScore(), 'snap-hover-click.musicxml');
  await enterQuarterNoteMode(page);
  let report = await waitForDebugReport(page);
  await waitForCleanDoctor(page, 'hover/click boot');

  const targets = [
    { measure: 1, staff: 1 },
    { measure: 2, staff: 2 },
    { measure: 3, staff: 1 },
  ];

  for (const target of targets) {
    report = await waitForDebugReport(page);
    const snap = report.snaps
      .filter((entry) => entry.measure === target.measure && entry.staff === target.staff)
      .sort((left, right) => left.ratio - right.ratio || left.x - right.x)[0];
    if (!snap) throw new Error(`No snap for hover/click target ${JSON.stringify(target)}:\n${report.snaps.map(formatSnap).join('\n')}`);

    const { center, ghost } = await hoverSnap(page, snap);
    expectGhostAndCommitOnSnapOrQuantizedRest(ghost, snap, center.x, `hover/click before click ${formatSnap(snap)}`);
    const beforeCounts = await readCurrentCore(page).then((core) => (
      core.score.parts[0].staves[target.staff - 1].measures.map((measure) => ({
        measure: measure.measureNumber,
        noteCount: measure.voices.flatMap((voice) => voice.events).filter((event) => event.kind === 'note').length,
      }))
    ));
    await page.mouse.click(center.x, center.y);

    await expect.poll(async () => {
      const core = await readCurrentCore(page);
      const staff = core.score.parts[0].staves[target.staff - 1];
      const measure = staff.measures.find((entry) => entry.measureNumber === target.measure);
      return measure?.voices.flatMap((voice) => voice.events).some((event) => event.kind === 'note') ?? false;
    }, { timeout: 5_000 }).toBe(true);

    const afterCounts = await readCurrentCore(page).then((core) => (
      core.score.parts[0].staves[target.staff - 1].measures.map((measure) => ({
        measure: measure.measureNumber,
        noteCount: measure.voices.flatMap((voice) => voice.events).filter((event) => event.kind === 'note').length,
      }))
    ));
    for (const beforeEntry of beforeCounts) {
      const afterEntry = afterCounts.find((entry) => entry.measure === beforeEntry.measure);
      if (!afterEntry) throw new Error(`Missing measure ${beforeEntry.measure} after click`);
      if (beforeEntry.measure === target.measure) {
        expect(
          afterEntry.noteCount,
          `click on ${formatSnap(snap)} did not commit into the hovered measure`,
        ).toBeGreaterThan(beforeEntry.noteCount);
      } else {
        expect(
          afterEntry.noteCount,
          `click on ${formatSnap(snap)} changed non-target measure ${beforeEntry.measure}`,
        ).toBe(beforeEntry.noteCount);
      }
    }
  }

  const summary = await readSummary(page);
  if (!summary) throw new Error('Missing Doctor summary after hover/click consistency run');
  assertNoForbiddenGhostDiagnostics(summary, 'hover/click consistency');
  assertGhostSnapTracePublished(summary, 'hover/click consistency');
});

test('variable meter long score keeps visible snaps and ghosts aligned across late measures', async ({ page }) => {
  await bootWithScore(page, buildVariableMeterStressScore(), 'snap-variable-meter-stress.musicxml');
  await enterQuarterNoteMode(page);
  let report = await waitForDebugReport(page);
  await waitForSnapDoctorClean(page, 'variable meter long score');
  report = await waitForDebugReport(page);
  await closeDoctorPanelIfOpen(page);
  await enterQuarterNoteMode(page);
  assertNoDuplicateSnaps(report, 'variable meter long score');

  const targetMeasures = [1, 9, 13, 17, 20, 21, 24];
  const hoverCheckMeasures = new Set([1]);
  for (const measure of targetMeasures) {
    await scrollMeasureLaneIntoView(page, { measure, part: 'part:P1', staff: 1 });
    report = await waitForDebugReportForLane(page, { measure, part: 'part:P1', staff: 1 });
    const staffOneSnaps = report.snaps
      .filter((snap) => snap.measure === measure && snap.staff === 1)
      .sort((left, right) => left.ratio - right.ratio || left.x - right.x);
    expect(
      staffOneSnaps.length,
      `m${measure} staff 1 should expose multiple visible rhythmic snaps.\n${report.snaps.filter((snap) => snap.measure === measure).map(formatSnap).join('\n')}`,
    ).toBeGreaterThanOrEqual(2);

    for (let index = 1; index < staffOneSnaps.length; index += 1) {
      expect(
        staffOneSnaps[index]!.x,
        `m${measure} staff 1 snaps must be strictly increasing.\n${staffOneSnaps.map(formatSnap).join('\n')}`,
      ).toBeGreaterThan(staffOneSnaps[index - 1]!.x + 1);
    }

    if (hoverCheckMeasures.has(measure)) {
      const hoverableStaffOneSnaps = staffOneSnaps.filter((snap) => !snap.isRest);
      expect(
        hoverableStaffOneSnaps.length,
        `m${measure} staff 1 should include hoverable note snaps.\n${staffOneSnaps.map(formatSnap).join('\n')}`,
      ).toBeGreaterThanOrEqual(1);
      const hoverTargets = Array.from(new Set([
        measure === 1 ? hoverableStaffOneSnaps[0]?.id : null,
        hoverableStaffOneSnaps[Math.floor(hoverableStaffOneSnaps.length / 2)]?.id,
        hoverableStaffOneSnaps[hoverableStaffOneSnaps.length - 1]?.id,
      ].filter(Boolean))).map((id) => hoverableStaffOneSnaps.find((snap) => snap.id === id)).filter((snap): snap is SnapPoint => Boolean(snap));
      for (const snap of hoverTargets) {
        const { center, ghost } = await hoverSnapAtStaffCenter(page, snap);
        expectGhostAndCommitOnSnap(ghost, snap, center.x, `variable meter hover ${formatSnap(snap)}`);
        await expectActiveSnapDot(page, snap, `variable meter hover ${formatSnap(snap)}`);
      }
    }

    if (staffOneSnaps.length >= 2) {
      const left = staffOneSnaps[0]!;
      const right = staffOneSnaps[1]!;
      const [staffOneBox] = await measureBoxes(page, measure);
      if (!staffOneBox) throw new Error(`missing staff one box for measure ${measure}`);
      const betweenX = (left.x + right.x) / 2;
      await page.mouse.move(betweenX, staffOneBox.y + (staffOneBox.height / 2));
      await page.waitForTimeout(180);
      const ghost = await readGhost(page);
      await expectVisibleGhostOnMatchingSnap(page, ghost, report, `variable meter between-snaps m${measure}`);
    }
  }

  for (const measure of [5, 13, 20, 24]) {
    await scrollMeasureLaneIntoView(page, { measure, part: 'part:P1', staff: 2 });
    report = await waitForDebugReportForLane(page, { measure, part: 'part:P1', staff: 2 });
    const staffTwoSnaps = report.snaps
      .filter((snap) => snap.measure === measure && snap.staff === 2)
      .sort((left, right) => left.ratio - right.ratio || left.x - right.x);
    expect(
      staffTwoSnaps.length,
      `m${measure} staff 2 should expose visible rest anchors`,
    ).toBeGreaterThanOrEqual(1);
    expect(staffTwoSnaps.every((snap) => snap.isRest), `m${measure} staff 2 snaps must remain rest anchors`).toBe(true);
    expect(staffTwoSnaps.some((snap) => snap.ratio === 0), `m${measure} staff 2 must keep the full-rest anchor`).toBe(true);
  }

  const summary = await readSummary(page);
  if (!summary) throw new Error('Missing Doctor summary after variable meter browser run');
  assertNoForbiddenGhostDiagnostics(summary, 'variable meter long score');
  assertGhostSnapTracePublished(summary, 'variable meter long score');
});
