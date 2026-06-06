import { expect, test, type Page, type TestInfo } from '@playwright/test';
import fs from 'node:fs/promises';

import { writeFailureArtifacts } from './support/failure-artifacts';

type SemanticGridSummary = {
  issueCount: number;
  issues?: string[];
  invariantChecks?: Record<string, number>;
};

type NoteEvent = {
  duration: 2 | 4 | 8 | 16 | 32;
  rest: boolean;
  step?: 'A' | 'B' | 'C' | 'D' | 'E' | 'F' | 'G';
  octave?: number;
};

const FUZZ_ENABLED = process.env.NEX_SEMANTIC_GRID_FUZZ === '1';
const SEED_COUNT = Number(process.env.NEX_SEMANTIC_GRID_FUZZ_SEEDS ?? 4);
const MEASURE_COUNT = Number(process.env.NEX_SEMANTIC_GRID_FUZZ_MEASURES ?? 8);

test.skip(!FUZZ_ENABLED, 'Set NEX_SEMANTIC_GRID_FUZZ=1 to run semantic grid fuzz tests.');

function mulberry32(seed: number) {
  return () => {
    let t = seed += 0x6d2b79f5;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function choice<T>(rng: () => number, values: readonly T[]): T {
  return values[Math.floor(rng() * values.length)]!;
}

function durationType(duration: NoteEvent['duration']) {
  switch (duration) {
    case 32: return 'whole';
    case 16: return 'half';
    case 8: return 'quarter';
    case 4: return 'eighth';
    case 2: return '16th';
  }
}

function buildEvents(rng: () => number, staff: 1 | 2, measure: number): NoteEvent[] {
  const patterns: Array<NoteEvent['duration'][]> = [
    [32],
    [16, 16],
    [8, 8, 8, 8],
    [4, 4, 8, 8, 8],
    [8, 4, 4, 4, 4, 8],
    [2, 2, 4, 8, 8, 8],
    [4, 8, 4, 4, 4, 4, 4],
  ];
  const steps: Array<NonNullable<NoteEvent['step']>> = staff === 1
    ? ['C', 'D', 'E', 'F', 'G', 'A', 'B']
    : ['C', 'D', 'E', 'F', 'G', 'A', 'B'];
  const durations = choice(rng, patterns);

  return durations.map((duration, index) => {
    const forceNote = measure === 1 && staff === 1 && index === 0;
    const rest = !forceNote && rng() < 0.38;
    const octave = staff === 1
      ? choice(rng, [4, 4, 5, 5])
      : choice(rng, [2, 3, 3, 4]);
    return {
      duration,
      rest,
      step: rest ? undefined : choice(rng, steps),
      octave: rest ? undefined : octave,
    };
  });
}

function eventXml(event: NoteEvent, staff: 1 | 2) {
  const rest = event.rest
    ? event.duration === 32
      ? '<rest measure="yes"/>'
      : '<rest/>'
    : `<pitch><step>${event.step}</step><octave>${event.octave}</octave></pitch>`;

  return [
    '      <note>',
    `        ${rest}`,
    `        <duration>${event.duration}</duration>`,
    '        <voice>1</voice>',
    `        <type>${durationType(event.duration)}</type>`,
    `        <staff>${staff}</staff>`,
    '      </note>',
  ].join('\n');
}

function buildScoreXml(seed: number, measures: number) {
  const rng = mulberry32(seed);
  const measureXml: string[] = [];

  for (let measure = 1; measure <= measures; measure += 1) {
    const staff1 = buildEvents(rng, 1, measure);
    const staff2 = buildEvents(rng, 2, measure);
    const attributes = measure === 1
      ? [
          '      <attributes>',
          '        <divisions>8</divisions>',
          '        <key><fifths>0</fifths></key>',
          '        <time><beats>4</beats><beat-type>4</beat-type></time>',
          '        <staves>2</staves>',
          '        <clef number="1"><sign>G</sign><line>2</line></clef>',
          '        <clef number="2"><sign>F</sign><line>4</line></clef>',
          '      </attributes>',
        ].join('\n')
      : '';
    measureXml.push([
      `    <measure number="${measure}">`,
      attributes,
      ...staff1.map((event) => eventXml(event, 1)),
      '      <backup><duration>32</duration></backup>',
      ...staff2.map((event) => eventXml(event, 2)),
      '    </measure>',
    ].filter(Boolean).join('\n'));
  }

  return `<?xml version="1.0" encoding="UTF-8"?>
<score-partwise version="3.1">
  <part-list>
    <score-part id="P1">
      <part-name>Piano</part-name>
    </score-part>
  </part-list>
  <part id="P1">
${measureXml.join('\n')}
  </part>
</score-partwise>
`;
}

async function installPlaybackStubs(page: Page) {
  await page.addInitScript(() => {
    const w = window as typeof window & {
      AudioContext?: typeof AudioContext;
      webkitAudioContext?: typeof AudioContext;
    };
    class MockAudioContext {
      currentTime = 0;
      destination = {};
      state = 'running';
      createGain() {
        return {
          gain: {
            value: 1,
            setValueAtTime() {},
            linearRampToValueAtTime() {},
            exponentialRampToValueAtTime() {},
          },
          connect() {},
          disconnect() {},
        };
      }
      resume() { return Promise.resolve(); }
      suspend() { return Promise.resolve(); }
      close() { return Promise.resolve(); }
    }
    w.AudioContext = MockAudioContext as unknown as typeof AudioContext;
    w.webkitAudioContext = MockAudioContext as unknown as typeof AudioContext;
  });
}

async function bootWithScore(page: Page, xml: string, filename: string, measures: number) {
  await page.addInitScript(({ bootXml, bootFilename, bootMeasures }) => {
    const now = Date.now();
    localStorage.setItem('nex-note:score-library', JSON.stringify([{
      id: 'semantic-grid-fuzz-score',
      name: bootFilename,
      xml: bootXml,
      format: 'musicxml',
      sizeBytes: bootXml.length,
      measures: bootMeasures,
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
  }, { bootXml: xml, bootFilename: filename, bootMeasures: measures });

  await page.goto('/?visual-debug=true');
  await expect(page.getByTestId('score-viewport')).toBeVisible({ timeout: 15_000 });
  await expect(page.locator('[data-testid="score-canvas"] svg').first()).toBeVisible({ timeout: 15_000 });
  await page.getByTestId('score-viewport').focus();
}

async function readSemanticGridSummary(page: Page): Promise<SemanticGridSummary | null> {
  return page.evaluate(() => (
    (window as typeof window & {
      __NEX_NOTE_SEMANTIC_GRID_ERRORS__?: SemanticGridSummary;
    }).__NEX_NOTE_SEMANTIC_GRID_ERRORS__ ?? null
  ));
}

async function attachFailureDebug(page: Page, testInfo: TestInfo, xml: string, summary: SemanticGridSummary | null) {
  const fullReport = await page.evaluate(() => (
    (window as typeof window & {
      __NEX_NOTE_SEMANTIC_GRID__?: unknown;
    }).__NEX_NOTE_SEMANTIC_GRID__ ?? null
  ));
  await fs.writeFile(testInfo.outputPath('semantic-grid-summary.json'), `${JSON.stringify(summary, null, 2)}\n`, 'utf8');
  await fs.writeFile(testInfo.outputPath('semantic-grid-score.musicxml'), xml, 'utf8');
  await fs.writeFile(testInfo.outputPath('semantic-grid-full-report.json'), `${JSON.stringify(fullReport, null, 2)}\n`, 'utf8');
  await testInfo.attach('semantic-grid-summary.json', {
    body: `${JSON.stringify(summary, null, 2)}\n`,
    contentType: 'application/json',
  });
  await testInfo.attach('semantic-grid-score.musicxml', {
    body: xml,
    contentType: 'application/vnd.recordare.musicxml+xml',
  });
  await testInfo.attach('semantic-grid-full-report.json', {
    body: `${JSON.stringify(fullReport, null, 2)}\n`,
    contentType: 'application/json',
  });
}

for (let index = 0; index < SEED_COUNT; index += 1) {
  const seed = 1000 + index;

  test(`semantic grid stays clean for generated score seed ${seed} @semantic-grid-fuzz`, async ({ page }, testInfo) => {
    test.setTimeout(90_000);
    const xml = buildScoreXml(seed, MEASURE_COUNT);
    const filename = `semantic-grid-fuzz-${seed}.musicxml`;

    await installPlaybackStubs(page);
    await bootWithScore(page, xml, filename, MEASURE_COUNT);

    try {
      await expect.poll(async () => {
        const summary = await readSemanticGridSummary(page);
        return summary ? 1 : 0;
      }, { timeout: 15_000 }).toBe(1);

      const summary = await readSemanticGridSummary(page);
      if (!summary || summary.issueCount > 0) {
        await attachFailureDebug(page, testInfo, xml, summary);
        const firstIssues = summary?.issues?.slice(0, 12).join('\n') ?? 'No semantic grid summary was published.';
        throw new Error(`Semantic grid fuzz failed for seed ${seed} with ${summary?.issueCount ?? 'unknown'} issues:\n${firstIssues}`);
      }
    } finally {
      await writeFailureArtifacts(page, testInfo);
    }
  });
}
