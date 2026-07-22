import { expect, test } from '@playwright/test';
import type { Page, Route } from '@playwright/test';
import { Midi } from '@tonejs/midi';

import { writeFailureArtifacts } from './support/failure-artifacts';
import { importMusicXmlToCore } from '../src/musicxml-adapter/import/import-musicxml.ts';

const DYNAMICS = ['pp', 'p', 'mp', 'mf', 'f', 'ff', 'fff', 'sfz'] as const;
const ARTICULATIONS = ['staccato', 'staccatissimo', 'accent', 'strong-accent', 'tenuto', 'fermata'] as const;

function buildNotationToolsFixtureXml() {
  return `<?xml version="1.0" encoding="UTF-8"?>
<score-partwise version="3.1">
  <work><work-title>Notation Tools Fixture</work-title></work>
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
    <measure number="2">
      <note><pitch><step>G</step><octave>4</octave></pitch><duration>1</duration><voice>1</voice><type>quarter</type><staff>1</staff></note>
      <note><pitch><step>A</step><octave>4</octave></pitch><duration>1</duration><voice>1</voice><type>quarter</type><staff>1</staff></note>
      <note><pitch><step>B</step><octave>4</octave></pitch><duration>1</duration><voice>1</voice><type>quarter</type><staff>1</staff></note>
      <note><pitch><step>C</step><octave>5</octave></pitch><duration>1</duration><voice>1</voice><type>quarter</type><staff>1</staff></note>
    </measure>
  </part>
</score-partwise>`;
}

function buildFourMeasurePlaybackFixtureXml() {
  const pitches = [
    ['C', 4], ['D', 4], ['E', 4], ['F', 4],
    ['G', 4], ['A', 4], ['B', 4], ['C', 5],
    ['D', 5], ['E', 5], ['F', 5], ['G', 5],
    ['A', 5], ['B', 5], ['C', 6], ['D', 6],
  ] as const;
  const measures = [0, 1, 2, 3].map((measureIndex) => {
    const attributes = measureIndex === 0
      ? `<attributes>
        <divisions>1</divisions>
        <key><fifths>0</fifths></key>
        <time><beats>4</beats><beat-type>4</beat-type></time>
        <clef><sign>G</sign><line>2</line></clef>
      </attributes>`
      : '';
    const notes = pitches.slice(measureIndex * 4, measureIndex * 4 + 4)
      .map(([step, octave]) => `<note><pitch><step>${step}</step><octave>${octave}</octave></pitch><duration>1</duration><voice>1</voice><type>quarter</type><staff>1</staff></note>`)
      .join('\n      ');
    return `<measure number="${measureIndex + 1}">
      ${attributes}
      ${notes}
    </measure>`;
  }).join('\n    ');

  return `<?xml version="1.0" encoding="UTF-8"?>
<score-partwise version="3.1">
  <work><work-title>Playback Jump Fixture</work-title></work>
  <part-list>
    <score-part id="P1"><part-name>Piano</part-name></score-part>
  </part-list>
  <part id="P1">
    ${measures}
  </part>
</score-partwise>`;
}

function buildMidiBody(midiNotes = [60, 62, 64, 65, 67, 69, 71, 72]) {
  const midi = new Midi();
  midi.header.setTempo(120);
  const track = midi.addTrack();
  midiNotes.forEach((midiNote, index) => {
    track.addNote({ midi: midiNote, time: index * 0.5, duration: 0.45, velocity: 0.8 });
  });
  return Buffer.from(midi.toArray());
}

async function installPlaybackStubs(page: Page) {
  await page.addInitScript(() => {
    (window as typeof window & {
      __NEX_NOTE_E2E_PLAYBACK_STARTS__?: Array<{
        note: string | number;
        gain: number | null;
        duration: number | null;
      }>;
      __NEX_NOTE_E2E_PLAYBACK_SOUNDED__?: Array<{ note: string | number }>;
      __NEX_NOTE_E2E_INSTRUMENT_LOADER__?: () => Promise<{
        start: (note: string | number, when?: number, options?: { gain?: number; duration?: number }) => { stop: () => void };
        stop: () => void;
      }>;
    }).__NEX_NOTE_E2E_PLAYBACK_STARTS__ = [];
    (window as typeof window & {
      __NEX_NOTE_E2E_PLAYBACK_SOUNDED__?: Array<{ note: string | number }>;
    }).__NEX_NOTE_E2E_PLAYBACK_SOUNDED__ = [];
    (window as typeof window & {
      __NEX_NOTE_E2E_PLAYBACK_STARTS__?: Array<{
        note: string | number;
        gain: number | null;
        duration: number | null;
      }>;
      __NEX_NOTE_E2E_PLAYBACK_SOUNDED__?: Array<{ note: string | number }>;
      __NEX_NOTE_E2E_INSTRUMENT_LOADER__?: (ac: AudioContext) => Promise<{
        start: (note: string | number, when?: number, options?: { gain?: number; duration?: number }) => { stop: () => void };
        stop: () => void;
      }>;
      __NEX_NOTE_E2E_STOP_PLAYBACK_HANDLES__?: () => void;
    }).__NEX_NOTE_E2E_INSTRUMENT_LOADER__ = async (ac) => {
      const handles = new Set<{ stop: () => void }>();
      const stopHandle = (handle: { stop: () => void }) => {
        handle.stop();
        handles.delete(handle);
      };
      (window as typeof window & {
        __NEX_NOTE_E2E_STOP_PLAYBACK_HANDLES__?: () => void;
      }).__NEX_NOTE_E2E_STOP_PLAYBACK_HANDLES__ = () => {
        Array.from(handles).forEach(stopHandle);
      };
      return {
      start(note, _when, options) {
        (window as typeof window & {
          __NEX_NOTE_E2E_PLAYBACK_STARTS__?: Array<{
            note: string | number;
            gain: number | null;
            duration: number | null;
          }>;
        }).__NEX_NOTE_E2E_PLAYBACK_STARTS__?.push({
          note,
          gain: typeof options?.gain === 'number' ? options.gain : null,
          duration: typeof options?.duration === 'number' ? options.duration : null,
        });
        const delayMs = Math.max(0, ((_when ?? ac.currentTime) - ac.currentTime) * 1000);
        const timeout = window.setTimeout(() => {
          handles.delete(handle);
          (window as typeof window & {
            __NEX_NOTE_E2E_PLAYBACK_SOUNDED__?: Array<{ note: string | number }>;
          }).__NEX_NOTE_E2E_PLAYBACK_SOUNDED__?.push({ note });
        }, delayMs);
        const handle = {
          stop() {
            window.clearTimeout(timeout);
          },
        };
        handles.add(handle);
        return handle;
      },
      stop() {
        Array.from(handles).forEach(stopHandle);
      },
    };
    };
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
      body: JSON.stringify({ models: [] }),
    });
  });
}

async function bootWithScore(page: Page, xml = buildNotationToolsFixtureXml(), options?: { strictDoctor?: boolean }) {
  await page.addInitScript(({ xml }: { xml: string }) => {
    const now = Date.now();
    localStorage.setItem('nex-note:score-library', JSON.stringify([{
      id: 'notation-tools-score',
      name: 'notation-tools.musicxml',
      xml,
      format: 'musicxml',
      sizeBytes: xml.length,
      measures: 2,
      parts: 1,
      favorite: false,
      createdAt: now,
      updatedAt: now,
      lastOpenedAt: now,
    }]));
    localStorage.setItem('nex-note:e2e-boot', JSON.stringify({ xml, filename: 'notation-tools.musicxml' }));
  }, { xml });
  await page.goto(options?.strictDoctor === false ? '/' : '/?debug=true&doctor=strict');
  await expect(page.getByTitle('Save as')).toBeVisible({ timeout: 15_000 });
  await expect(page.locator('[data-testid="score-canvas"] .vf-notehead').first()).toBeVisible({ timeout: 15_000 });
  await page.getByTestId('score-viewport').focus();
}

async function clickRenderedNotehead(page: Page, index: number) {
  await page.locator('[data-testid="score-canvas"] .vf-notehead').nth(index).click({ force: true });
}

async function readE2EState(page: Page) {
  return page.evaluate(() => (
    (window as typeof window & {
      __NEX_NOTE_E2E_STATE__?: {
        xml: string;
        selectionCount: number;
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
        selectedAccidental?: 'double-sharp' | 'sharp' | 'natural' | 'flat' | 'double-flat' | null;
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
        playbackState: string;
        canUndo?: boolean;
        currentMeasure?: number | null;
        currentBeat?: number;
        totalBeats?: number;
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
  return importMusicXmlToCore(await readCurrentXml(page));
}

async function expectNoDoctorIssues(page: Page, context: string, expectedCodes: string[] = []) {
  const report = await page.evaluate(async () => {
    const debugApi = (window as typeof window & {
      nexDebug?: { runAll?: () => Promise<unknown> };
      __NEX_NOTE_DOCTOR__?: { lastReport?: unknown };
    }).nexDebug;
    if (debugApi?.runAll) return debugApi.runAll();
    return (window as typeof window & {
      __NEX_NOTE_DOCTOR__?: { lastReport?: unknown };
    }).__NEX_NOTE_DOCTOR__?.lastReport ?? null;
  }) as null | {
    issueCount?: number;
    warningCount?: number;
    errorCount?: number;
    issues?: Array<{ code?: string; data?: { diagnosticCode?: string }; severity?: string; message?: string }>;
  };
  const issues = report?.issues ?? [];
  const issueCode = (issue: { code?: string; data?: { diagnosticCode?: string } }) => (
    issue.code ?? issue.data?.diagnosticCode ?? ''
  );
  const unexpected = issues.filter((issue) => !expectedCodes.includes(issueCode(issue)));
  expect(report, `${context}: Doctor did not publish a report`).toBeTruthy();
  expect(unexpected, `${context}: unexpected Doctor issues\n${JSON.stringify(report, null, 2)}`).toEqual([]);
  expect(
    issues.length - unexpected.length,
    `${context}: expected Doctor warnings must be explicitly scoped by code`,
  ).toBe(issues.length);
  if (expectedCodes.length === 0) {
    expect(report?.issueCount ?? issues.length, `${context}: Doctor reported issues\n${JSON.stringify(report, null, 2)}`).toBe(0);
  }
}

async function playbackStarts(page: Page) {
  return page.evaluate(() => (
    (window as typeof window & {
      __NEX_NOTE_E2E_PLAYBACK_STARTS__?: Array<{ note: string | number; gain: number | null; duration: number | null }>;
    }).__NEX_NOTE_E2E_PLAYBACK_STARTS__ ?? []
  ));
}

async function playbackSounded(page: Page) {
  return page.evaluate(() => (
    (window as typeof window & {
      __NEX_NOTE_E2E_PLAYBACK_SOUNDED__?: Array<{ note: string | number }>;
    }).__NEX_NOTE_E2E_PLAYBACK_SOUNDED__ ?? []
  ));
}

async function resetPlaybackStarts(page: Page) {
  await page.evaluate(() => {
    (window as typeof window & {
      __NEX_NOTE_E2E_STOP_PLAYBACK_HANDLES__?: () => void;
    }).__NEX_NOTE_E2E_STOP_PLAYBACK_HANDLES__?.();
    (window as typeof window & {
      __NEX_NOTE_E2E_PLAYBACK_STARTS__?: Array<{ note: string | number; gain: number | null; duration: number | null }>;
    }).__NEX_NOTE_E2E_PLAYBACK_STARTS__ = [];
    (window as typeof window & {
      __NEX_NOTE_E2E_PLAYBACK_SOUNDED__?: Array<{ note: string | number }>;
    }).__NEX_NOTE_E2E_PLAYBACK_SOUNDED__ = [];
  });
}

async function expectNoMeasureSelectionOverlay(page: Page) {
  await expect(page.locator('[data-selected-measure="true"]')).toHaveCount(0);
}

async function expectSingleNoteSelection(page: Page, index: number) {
  const expectedMeasure = index < 4 ? 1 : 2;
  const expectedTimestamp = index % 4;
  await expect.poll(async () => {
    const state = await readE2EState(page);
    return {
      count: state?.selectionCount,
      measure: state?.selectedNote?.measureNumber,
      timestampNum: state?.selectedNote?.timestampNum,
      timestampDen: state?.selectedNote?.timestampDen,
    };
  }).toEqual({
    count: 1,
    measure: expectedMeasure,
    timestampNum: expectedTimestamp,
    timestampDen: 4,
  });
  await expectNoMeasureSelectionOverlay(page);
}

function pitchMidi(event: Awaited<ReturnType<typeof readCurrentCore>>['score']['parts'][number]['staves'][number]['measures'][number]['voices'][number]['events'][number]) {
  if (event?.kind !== 'note') return null;
  const semitoneByStep: Record<string, number> = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 };
  return ((event.pitch.octave + 1) * 12) + semitoneByStep[event.pitch.step] + event.pitch.alter;
}

async function readMainVoiceMidi(page: Page) {
  const core = await readCurrentCore(page);
  return core.score.parts[0].staves[0].measures
    .flatMap((measure) => measure.voices[0]?.events ?? [])
    .map(pitchMidi);
}

async function openNotationTools(page: Page) {
  const panel = page.locator('#nex-left-notation-tools-panel');
  if (await panel.isVisible().catch(() => false)) return;
  await page.getByRole('button', { name: 'Show notation tools', exact: true }).click();
  await expect(panel).toBeVisible();
}

async function openPaletteSection(page: Page, name: 'Selection' | 'Transpose' | 'Articulations' | 'Dynamics' | 'Ties' | 'Barlines') {
  await openNotationTools(page);
  const dialog = page.getByRole('dialog', { name });
  if (await dialog.isVisible().catch(() => false)) return dialog;
  await page.locator(`[data-palette-section="${name.toLowerCase()}"]`).click();
  await expect(dialog).toBeVisible();
  return dialog;
}

async function clickPlay(page: Page) {
  await page.getByRole('button', { name: 'Play (Space)', exact: true }).click();
}

test.beforeEach(async ({ page }) => {
  await installPlaybackStubs(page);
  await mockStableRoutes(page);
});

test.afterEach(async ({ page }, testInfo) => {
  await writeFailureArtifacts(page, testInfo);
});

test('arrow-key transpose applies to every active selected note', async ({ page }) => {
  await bootWithScore(page);

  await clickRenderedNotehead(page, 4);
  await expectSingleNoteSelection(page, 4);
  await page.keyboard.press('Shift+ArrowRight');
  await page.keyboard.press('Shift+ArrowRight');
  await page.keyboard.press('Shift+ArrowRight');

  await expect.poll(async () => (await readE2EState(page))?.selectionCount).toBe(4);
  const before = await readMainVoiceMidi(page);

  await page.keyboard.press('ArrowDown');

  await expect.poll(async () => readMainVoiceMidi(page)).toEqual([
    ...before.slice(0, 4),
    ...before.slice(4, 8).map((midi) => midi == null ? null : midi - 1),
  ]);
  await expect.poll(async () => (await readE2EState(page))?.selectionCount).toBe(4);
  await expectNoDoctorIssues(page, 'after arrow-key transpose');
});

test('step keyboard repitches existing notes and advances through the passage', async ({ page }) => {
  await bootWithScore(page);

  await clickRenderedNotehead(page, 4);
  await expectSingleNoteSelection(page, 4);
  await page.keyboard.press('P');
  await openNotationTools(page);
  await expect(page.getByTestId('step-input-panel')).toBeVisible();

  await page.keyboard.press('Z');
  await page.keyboard.press('X');
  await page.keyboard.press('C');
  await page.keyboard.press('V');

  await expect.poll(async () => readMainVoiceMidi(page)).toEqual([
    60, 62, 64, 65,
    60, 62, 64, 65,
  ]);
  await expect.poll(async () => {
    const state = await readE2EState(page);
    return {
      count: state?.selectionCount,
      measure: state?.selectedNote?.measureNumber,
      timestampNum: state?.selectedNote?.timestampNum,
    };
  }).toEqual({
    count: 1,
    measure: 2,
    timestampNum: 3,
  });
  await expectNoDoctorIssues(page, 'after step-keyboard repitch passage');
});

test('Alt/Option interval entry builds a chord on the selected rhythmic onset', async ({ page }) => {
  await bootWithScore(page);

  await clickRenderedNotehead(page, 0);
  await expectSingleNoteSelection(page, 0);
  await page.keyboard.press('Alt+Digit3');

  await expect.poll(async () => {
    const measure = (await readCurrentCore(page)).score.parts[0].staves[0].measures[0];
    return (measure.voices[0]?.events ?? [])
      .filter((event) => event.kind === 'note' && event.timestampNum === 0)
      .map((event) => event.kind === 'note' ? event.pitch.step : null);
  }).toEqual(['C', 'E']);
  await expect.poll(async () => (await readE2EState(page))?.selectedNote?.step).toBe('E');

  await page.keyboard.press('Alt+Digit3');
  await expect.poll(async () => {
    const measure = (await readCurrentCore(page)).score.parts[0].staves[0].measures[0];
    return (measure.voices[0]?.events ?? [])
      .filter((event) => event.kind === 'note' && event.timestampNum === 0)
      .map((event) => event.kind === 'note' ? event.pitch.step : null);
  }).toEqual(['C', 'E', 'G']);
  await expect.poll(async () => (await readE2EState(page))?.selectedNote?.step).toBe('G');
  await expect(page.locator('[data-testid="score-canvas"] .vf-notehead')).toHaveCount(10);
  await expectNoDoctorIssues(page, 'after interval chord entry');
});

test('T creates a complete tied chord, advances once, and undoes atomically', async ({ page }) => {
  await bootWithScore(page);

  await clickRenderedNotehead(page, 0);
  await expectSingleNoteSelection(page, 0);
  await page.keyboard.press('N');
  await page.keyboard.press('Shift+E');
  await expect(page.locator('[data-testid="score-canvas"] .vf-notehead')).toHaveCount(9);

  await page.keyboard.press('T');
  await expect.poll(async () => {
    const measure = (await readCurrentCore(page)).score.parts[0].staves[0].measures[0];
    const source = (measure.voices[0]?.events ?? []).filter((event) => event.kind === 'note' && event.timestampNum === 0);
    const target = (measure.voices[0]?.events ?? []).filter((event) => event.kind === 'note' && event.timestampNum === 1);
    return {
      sourcePitches: source.map((event) => event.kind === 'note' ? event.pitch.step : null),
      sourceTies: source.map((event) => Boolean(event.tieStart)),
      targetPitches: target.map((event) => event.kind === 'note' ? event.pitch.step : null),
    };
  }).toEqual({
    sourcePitches: ['C', 'E'],
    sourceTies: [true, true],
    targetPitches: ['C', 'E'],
  });
  await expect.poll(async () => (await readE2EState(page))?.selectedNote?.timestampNum).toBe(2);
  await expect(page.locator('[data-testid="score-canvas"] .vf-notehead')).toHaveCount(10);
  await expectNoDoctorIssues(page, 'after tied chord entry');

  await page.keyboard.press('Control+z');
  await expect.poll(async () => {
    const measure = (await readCurrentCore(page)).score.parts[0].staves[0].measures[0];
    const source = (measure.voices[0]?.events ?? []).filter((event) => event.kind === 'note' && event.timestampNum === 0);
    const target = (measure.voices[0]?.events ?? []).filter((event) => event.kind === 'note' && event.timestampNum === 1);
    return {
      sourcePitches: source.map((event) => event.kind === 'note' ? event.pitch.step : null),
      sourceTies: source.map((event) => Boolean(event.tieStart)),
      targetPitches: target.map((event) => event.kind === 'note' ? event.pitch.step : null),
    };
  }).toEqual({
    sourcePitches: ['C', 'E'],
    sourceTies: [false, false],
    targetPitches: ['D'],
  });
  await expect(page.locator('[data-testid="score-canvas"] .vf-notehead')).toHaveCount(9);
  await expectNoDoctorIssues(page, 'after undoing tied chord entry');
});

test('letter-name input chooses the closest octave and stacks Shift pitches above the chord', async ({ page }) => {
  await bootWithScore(page);

  await clickRenderedNotehead(page, 0);
  await expectSingleNoteSelection(page, 0);
  await page.keyboard.press('N');
  await page.keyboard.press('B');
  await page.keyboard.press('A');

  await expect.poll(async () => {
    const measure = (await readCurrentCore(page)).score.parts[0].staves[0].measures[0];
    return (measure.voices[0]?.events ?? [])
      .filter((event) => event.kind === 'note' && (event.timestampNum === 0 || event.timestampNum === 1))
      .map((event) => event.kind === 'note' ? `${event.pitch.step}${event.pitch.octave}` : null);
  }).toEqual(['B3', 'A3']);

  await page.keyboard.press('Shift+B');
  await page.keyboard.press('Shift+C');
  await expect.poll(async () => {
    const measure = (await readCurrentCore(page)).score.parts[0].staves[0].measures[0];
    return (measure.voices[0]?.events ?? [])
      .filter((event) => event.kind === 'note' && event.timestampNum === 2)
      .map((event) => event.kind === 'note' ? `${event.pitch.step}${event.pitch.octave}` : null);
  }).toEqual(['E4', 'B4', 'C5']);
  await expect.poll(async () => {
    const selected = (await readE2EState(page))?.selectedNote;
    return selected ? `${selected.step}${selected.octave}@${selected.timestampNum}` : null;
  }).toBe('C5@2');
  await expect(page.locator('[data-testid="score-canvas"] .vf-notehead')).toHaveCount(10);
  await expectNoDoctorIssues(page, 'after closest-octave letter and chord entry');
});

test('N duration-first editing previews and commits a three-note chord atomically', async ({ page }) => {
  await bootWithScore(page);
  const initialXml = await readCurrentXml(page);

  await clickRenderedNotehead(page, 0);
  await expectSingleNoteSelection(page, 0);
  await page.keyboard.press('N');
  await page.keyboard.press('M');
  await page.keyboard.press('C');
  await page.keyboard.press('Shift+E');
  await page.keyboard.press('Shift+G');

  const durationMode = page.locator('button[title^="Input by duration (M)"]:visible').first();
  await expect(durationMode).toHaveAttribute('aria-pressed', 'true');
  await expect(durationMode).toContainText('DUR C4+E4+G4');
  await expect(page.getByTestId('duration-input-pitch-cursor')).toHaveAttribute('data-ghost-pitch', 'G4');
  expect(await readCurrentXml(page)).toBe(initialXml);

  const firstNoteBox = await page.locator('[data-testid="score-canvas"] .vf-notehead').nth(0).boundingBox();
  const secondNoteBox = await page.locator('[data-testid="score-canvas"] .vf-notehead').nth(1).boundingBox();
  expect(firstNoteBox).not.toBeNull();
  expect(secondNoteBox).not.toBeNull();
  await page.mouse.click(
    ((firstNoteBox?.x ?? 0) + (firstNoteBox?.width ?? 0) + (secondNoteBox?.x ?? 0)) / 2,
    (firstNoteBox?.y ?? 0) + ((firstNoteBox?.height ?? 0) / 2),
  );
  expect(await readCurrentXml(page)).toBe(initialXml);
  await clickRenderedNotehead(page, 0);
  expect(await readCurrentXml(page)).toBe(initialXml);

  await page.keyboard.press('5');
  await expect.poll(async () => {
    const measure = (await readCurrentCore(page)).score.parts[0].staves[0].measures[0];
    return (measure.voices[0]?.events ?? [])
      .filter((event) => event.kind === 'note' && event.timestampNum === 0)
      .map((event) => event.kind === 'note'
        ? `${event.pitch.step}${event.pitch.octave}:${event.durationType}`
        : null);
  }).toEqual(['C4:quarter', 'E4:quarter', 'G4:quarter']);
  await expect.poll(async () => (await readE2EState(page))?.canUndo).toBe(true);

  await page.keyboard.press('Control+z');
  await expect.poll(async () => readCurrentXml(page)).toBe(initialXml);
  await expectNoDoctorIssues(page, 'after duration-first chord entry and atomic undo');
});

test('N duration-first mouse controls prepare chords and rests before an atomic commit', async ({ page }) => {
  await bootWithScore(page);
  const initialXml = await readCurrentXml(page);

  await clickRenderedNotehead(page, 0);
  await page.locator('button[title="Toggle note input (N)"]:visible').first().click();
  await page.locator('button[title^="Input by duration (M)"]:visible').first().click();
  await page.locator('button[title^="Set active note to C"]:visible').first().click();
  await page.locator('button[title^="Set active note to E"]:visible').first().click({ modifiers: ['Shift'] });
  await page.locator('button[title^="Set active note to G"]:visible').first().click({ modifiers: ['Shift'] });

  await expect(page.locator('button[title^="Input by duration (M)"]:visible').first()).toContainText('DUR C4+E4+G4');
  expect(await readCurrentXml(page)).toBe(initialXml);

  await page.locator('button[title^="Quarter note: 5"]:visible').first().click();
  await expect.poll(async () => {
    const measure = (await readCurrentCore(page)).score.parts[0].staves[0].measures[0];
    return (measure.voices[0]?.events ?? [])
      .filter((event) => event.kind === 'note' && event.timestampNum === 0)
      .map((event) => event.kind === 'note' ? `${event.pitch.step}${event.pitch.octave}:${event.durationType}` : null);
  }).toEqual(['C4:quarter', 'E4:quarter', 'G4:quarter']);
  const chordXml = await readCurrentXml(page);

  await page.locator('button[title="Insert rest (R or 0)"]:visible').first().click();
  await expect(page.locator('button[title^="Input by duration (M)"]:visible').first()).toContainText('DUR REST');
  expect(await readCurrentXml(page)).toBe(chordXml);

  await page.locator('button[title^="Eighth note: 4"]:visible').first().click();
  await expect.poll(async () => {
    const measure = (await readCurrentCore(page)).score.parts[0].staves[0].measures[0];
    const event = (measure.voices[0]?.events ?? []).find((candidate) => (
      candidate.timestampNum * 4 === candidate.timestampDen
    ));
    return event ? `${event.kind}:${event.durationType}` : null;
  }).toBe('rest:eighth');

  const undo = page.locator('button[title="Undo (Cmd/Ctrl+Z)"]:visible').first();
  await undo.click();
  await expect.poll(async () => readCurrentXml(page)).toBe(chordXml);
  await undo.click();
  await expect.poll(async () => readCurrentXml(page)).toBe(initialXml);
  await expectNoDoctorIssues(page, 'after mouse-only duration-first chord and rest undo');
});

test('A-G letter entry keeps a nearest-octave passage continuous across measures', async ({ page }) => {
  await bootWithScore(page);

  await clickRenderedNotehead(page, 0);
  await expectSingleNoteSelection(page, 0);
  await page.keyboard.press('N');
  for (const pitchName of ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'A']) {
    await page.keyboard.press(pitchName);
  }

  await expect.poll(async () => readMainVoiceMidi(page)).toEqual([
    57, 59, 60, 62,
    64, 65, 67, 69,
  ]);
  await expect.poll(async () => {
    const selected = (await readE2EState(page))?.selectedNote;
    return selected ? `${selected.step}${selected.octave}@${selected.measureNumber}:${selected.timestampNum}` : null;
  }).toBe('A4@2:3');
  await expectNoDoctorIssues(page, 'after A-G closest-octave passage');
});

test('one-shot accidental entry carries within the measure and preserves atomic undo/redo', async ({ page }) => {
  await bootWithScore(page);
  const initialXml = await readCurrentXml(page);

  await clickRenderedNotehead(page, 0);
  await expectSingleNoteSelection(page, 0);
  await page.keyboard.press('N');
  const sharpButton = page.locator('button[title="Sharp (+)"]:visible').first();
  await sharpButton.click();
  await expect(sharpButton).toHaveClass(/bg-nex-accent-muted/);
  await expect.poll(async () => (await readE2EState(page))?.selectedAccidental).toBe('sharp');

  await page.keyboard.press('B');
  await expect.poll(async () => (await readE2EState(page))?.selectedAccidental).toBe(null);
  await expect(sharpButton).not.toHaveClass(/bg-nex-accent-muted/);
  await page.keyboard.press('B');

  const readEntered = async () => {
    const measure = (await readCurrentCore(page)).score.parts[0].staves[0].measures[0];
    return (measure.voices[0]?.events ?? []).slice(0, 2).map((event) => event.kind === 'note' ? {
      pitch: `${event.pitch.step}:${event.pitch.alter}:${event.pitch.octave}`,
      writtenAccidental: event.writtenAccidental ?? null,
    } : null);
  };
  await expect.poll(readEntered).toEqual([{
    pitch: 'B:1:3',
    writtenAccidental: 'sharp',
  }, {
    pitch: 'B:1:3',
    writtenAccidental: null,
  }]);
  const editedXml = await readCurrentXml(page);
  expect((editedXml.match(/<accidental>sharp<\/accidental>/g) ?? []).length).toBe(1);
  expect((await readMainVoiceMidi(page)).slice(0, 2)).toEqual([60, 60]);
  await expect(page.locator('[data-testid="score-canvas"] .vf-notehead')).toHaveCount(8);

  await page.keyboard.press('Control+z');
  await expect.poll(readEntered).toEqual([{
    pitch: 'B:1:3',
    writtenAccidental: 'sharp',
  }, {
    pitch: 'D:0:4',
    writtenAccidental: null,
  }]);
  await page.keyboard.press('Control+z');
  await expect.poll(async () => readCurrentXml(page)).toBe(initialXml);

  await page.keyboard.press('Control+Shift+z');
  await page.keyboard.press('Control+Shift+z');
  await expect.poll(async () => readCurrentXml(page)).toBe(editedXml);
  await expect.poll(readEntered).toEqual([{
    pitch: 'B:1:3',
    writtenAccidental: 'sharp',
  }, {
    pitch: 'B:1:3',
    writtenAccidental: null,
  }]);
  await expectNoDoctorIssues(page, 'after one-shot accidental undo and redo');
});

test('courtesy accidental palette is pitch-neutral, rendered, accessible, and atomically undoable', async ({ page }) => {
  const xml = buildNotationToolsFixtureXml().replace(
    '<pitch><step>C</step><octave>4</octave></pitch><duration>1</duration>',
    '<pitch><step>C</step><alter>1</alter><octave>4</octave></pitch><duration>1</duration>',
  ).replace(
    '<type>quarter</type><staff>1</staff></note>',
    '<type>quarter</type><accidental>sharp</accidental><staff>1</staff></note>',
  );
  await bootWithScore(page, xml);
  const initialXml = await readCurrentXml(page);
  const initialEvent = (await readCurrentCore(page)).score.parts[0].staves[0].measures[0].voices[0].events[0];
  const initialRendered = await page.locator('[data-testid="score-canvas"]').innerHTML();

  await clickRenderedNotehead(page, 0);
  await expectSingleNoteSelection(page, 0);
  await page.locator('button[title="Accidentals"]:visible').click();
  const courtesy = page.locator('button[title="Courtesy / cautionary accidental"]:visible');
  const round = page.locator('button[title="Round parentheses"]:visible');
  await expect(courtesy).toHaveAttribute('aria-pressed', 'false');
  await expect(round).toHaveAttribute('aria-pressed', 'false');
  await courtesy.click();
  await round.click();
  await expect(courtesy).toHaveAttribute('aria-pressed', 'true');
  await expect(round).toHaveAttribute('aria-pressed', 'true');

  const readDisplay = async () => {
    const event = (await readCurrentCore(page)).score.parts[0].staves[0].measures[0].voices[0].events[0];
    return event.kind === 'note' ? {
      id: event.id,
      pitch: `${event.pitch.step}:${event.pitch.alter}:${event.pitch.octave}`,
      cautionary: Boolean(event.accidentalCautionary),
      enclosure: event.accidentalEnclosure ?? 'none',
    } : null;
  };
  await expect.poll(readDisplay).toEqual({
    id: initialEvent.id,
    pitch: 'C:1:4',
    cautionary: true,
    enclosure: 'round',
  });
  const editedXml = await readCurrentXml(page);
  expect(editedXml).toMatch(/<accidental cautionary="yes" parentheses="yes">sharp<\/accidental>/);
  await expect.poll(async () => page.locator('[data-testid="score-canvas"]').innerHTML()).not.toBe(initialRendered);

  await page.keyboard.press('Control+z');
  await expect.poll(readDisplay).toEqual({
    id: initialEvent.id,
    pitch: 'C:1:4',
    cautionary: true,
    enclosure: 'none',
  });
  await page.keyboard.press('Control+z');
  await expect.poll(async () => readCurrentXml(page)).toBe(initialXml);
  await page.keyboard.press('Control+Shift+z');
  await page.keyboard.press('Control+Shift+z');
  await expect.poll(async () => readCurrentXml(page)).toBe(editedXml);
  await expectNoDoctorIssues(page, 'after courtesy accidental undo and redo');
});

test('grace entry at a barline inserts a rendered zero-time entity and preserves the anchor atomically', async ({ page }) => {
  await bootWithScore(page);
  const initialXml = await readCurrentXml(page);
  const initialCore = await readCurrentCore(page);
  const anchor = initialCore.score.parts[0].staves[0].measures[1].voices[0].events[0];

  await clickRenderedNotehead(page, 4);
  await expectSingleNoteSelection(page, 4);
  await page.keyboard.press('/');

  const readBoundary = async () => {
    const core = await readCurrentCore(page);
    const events = core.score.parts[0].staves[0].measures[1].voices[0].events;
    const graceIds = new Set(core.graceNotes.map((entry) => entry.eventId));
    return {
      anchorPreserved: events.some((event) => (
        !graceIds.has(event.id)
        && event.kind === 'note'
        && event.pitch.step === anchor.pitch.step
        && event.pitch.alter === anchor.pitch.alter
        && event.pitch.octave === anchor.pitch.octave
        && event.durationDivisions === anchor.durationDivisions
        && event.timestampNum === 0
      )),
      grace: events.filter((event) => graceIds.has(event.id)).map((event) => ({
        duration: event.durationDivisions,
        timestamp: `${event.timestampNum}/${event.timestampDen}`,
      })),
    };
  };
  await expect.poll(readBoundary).toEqual({
    anchorPreserved: true,
    grace: [{ duration: 0, timestamp: '0/4' }],
  });
  await expect(page.locator('[data-testid="score-canvas"] .vf-notehead')).toHaveCount(9);
  const editedXml = await readCurrentXml(page);
  expect(editedXml).toMatch(/<grace slash="yes"\/>[\s\S]*?<step>G<\/step>[\s\S]*?<note>[\s\S]*?<step>G<\/step>/);

  await page.keyboard.press('Control+z');
  await expect.poll(async () => readCurrentXml(page)).toBe(initialXml);
  await expect(page.locator('[data-testid="score-canvas"] .vf-notehead')).toHaveCount(8);
  await page.keyboard.press('Control+Shift+z');
  await expect.poll(async () => readCurrentXml(page)).toBe(editedXml);
  await expectNoDoctorIssues(page, 'after grace insertion undo and redo at a barline');
});

test('tuplet shortcut at a barline divides one anchor into balanced editable units atomically', async ({ page }) => {
  await bootWithScore(page);
  const initialXml = await readCurrentXml(page);

  await clickRenderedNotehead(page, 4);
  await expectSingleNoteSelection(page, 4);
  await page.keyboard.press('Control+3');

  const readTupletBoundary = async () => {
    const core = await readCurrentCore(page);
    const measure = core.score.parts[0].staves[0].measures[1];
    const tuplet = core.tuplets.find((entry) => entry.eventIds.some((eventId) => (
      measure.voices[0].events.some((event) => event.id === eventId)
    )));
    const events = measure.voices[0].events.filter((event) => tuplet?.eventIds.includes(event.id));
    return {
      ratio: tuplet ? `${tuplet.actualNotes}:${tuplet.normalNotes}` : null,
      units: events.filter((event) => !event.isChord).map((event) => ({
        kind: event.kind,
        duration: event.durationDivisions,
        type: event.durationType,
      })),
    };
  };
  await expect.poll(readTupletBoundary).toEqual({
    ratio: '3:2',
    units: [
      { kind: 'note', duration: 2, type: 'eighth' },
      { kind: 'rest', duration: 2, type: 'eighth' },
      { kind: 'rest', duration: 2, type: 'eighth' },
    ],
  });
  const editedXml = await readCurrentXml(page);
  expect(editedXml).toContain('<actual-notes>3</actual-notes>');
  expect(editedXml).toContain('<normal-notes>2</normal-notes>');

  await page.keyboard.press('Control+z');
  await expect.poll(async () => readCurrentXml(page)).toBe(initialXml);
  await page.keyboard.press('Control+Shift+z');
  await expect.poll(async () => readCurrentXml(page)).toBe(editedXml);
  await expectNoDoctorIssues(page, 'after tuplet division undo and redo at a barline');
});

test('J cycles rendered enharmonic spelling with stable pitch, identity, and atomic history', async ({ page }) => {
  await bootWithScore(page);
  const initialXml = await readCurrentXml(page);
  const initialEvent = (await readCurrentCore(page)).score.parts[0].staves[0].measures[0]!.voices[0]!.events[0]!;
  const initialNotehead = await page.locator('[data-testid="score-canvas"] .vf-notehead').first().boundingBox();

  await clickRenderedNotehead(page, 0);
  await expectSingleNoteSelection(page, 0);
  await page.keyboard.press('J');

  const readFirstPitch = async () => {
    const event = (await readCurrentCore(page)).score.parts[0].staves[0].measures[0]!.voices[0]!.events[0]!;
    return event.kind === 'note' ? {
      id: event.id,
      spelling: `${event.pitch.step}:${event.pitch.alter}:${event.pitch.octave}`,
      midi: pitchMidi(event),
    } : null;
  };
  await expect.poll(readFirstPitch).toEqual({
    id: initialEvent.id,
    spelling: 'D:-2:4',
    midi: 60,
  });
  const editedXml = await readCurrentXml(page);
  expect(editedXml).toMatch(/<step>D<\/step><alter>-2<\/alter><octave>4<\/octave>/);
  const respelledNotehead = await page.locator('[data-testid="score-canvas"] .vf-notehead').first().boundingBox();
  expect(initialNotehead).not.toBeNull();
  expect(respelledNotehead).not.toBeNull();
  expect(Math.abs(respelledNotehead!.y - initialNotehead!.y)).toBeGreaterThan(3);
  await expectNoDoctorIssues(page, 'after rendered enharmonic respelling');

  await page.keyboard.press('Control+z');
  await expect.poll(async () => readCurrentXml(page)).toBe(initialXml);
  await page.keyboard.press('Control+Shift+z');
  await expect.poll(async () => readCurrentXml(page)).toBe(editedXml);

  await page.keyboard.press('J');
  await expect.poll(readFirstPitch).toEqual({
    id: initialEvent.id,
    spelling: 'B:1:3',
    midi: 60,
  });
  await page.keyboard.press('J');
  await expect.poll(readFirstPitch).toEqual({
    id: initialEvent.id,
    spelling: 'C:0:4',
    midi: 60,
  });
  await expectNoDoctorIssues(page, 'after complete enharmonic cycle');
});

test('same-pitch note input advances across the score without dirtying history', async ({ page }) => {
  await bootWithScore(page);
  const initialXml = await readCurrentXml(page);
  await expect.poll(async () => (await readE2EState(page))?.canUndo).toBe(false);

  await clickRenderedNotehead(page, 0);
  await expectSingleNoteSelection(page, 0);
  await page.keyboard.press('N');
  const passage = [
    { key: 'C', measureNumber: 1, timestampNum: 1 },
    { key: 'D', measureNumber: 1, timestampNum: 2 },
    { key: 'E', measureNumber: 1, timestampNum: 3 },
    { key: 'F', measureNumber: 2, timestampNum: 0 },
    { key: 'G', measureNumber: 2, timestampNum: 1 },
    { key: 'A', measureNumber: 2, timestampNum: 2 },
    { key: 'B', measureNumber: 2, timestampNum: 3 },
    { key: 'C', measureNumber: 2, timestampNum: 3 },
  ];

  for (const step of passage) {
    await page.keyboard.press(step.key);
    await expect.poll(async () => {
      const selected = (await readE2EState(page))?.selectedNote;
      return selected ? `${selected.measureNumber}:${selected.timestampNum}` : null;
    }).toBe(`${step.measureNumber}:${step.timestampNum}`);
  }

  expect(await readCurrentXml(page)).toBe(initialXml);
  await expect.poll(async () => (await readE2EState(page))?.canUndo).toBe(false);
  await expectNoDoctorIssues(page, 'after no-change repeated-note passage');
});

test('rest input replaces notes and advances over an existing matching rest without dirtying history', async ({ page }) => {
  const fixture = buildNotationToolsFixtureXml().replace(
    '<note><pitch><step>D</step><octave>4</octave></pitch><duration>1</duration><voice>1</voice><type>quarter</type><staff>1</staff></note>',
    '<note><rest/><duration>1</duration><voice>1</voice><type>quarter</type><staff>1</staff></note>',
  );
  await bootWithScore(page, fixture);

  await clickRenderedNotehead(page, 0);
  await expectSingleNoteSelection(page, 0);
  await page.keyboard.press('N');
  await page.keyboard.press('0');

  await expect.poll(async () => {
    const selected = (await readE2EState(page))?.selectedNote;
    return selected ? `${selected.measureNumber}:${selected.timestampNum}:${selected.isRest}` : null;
  }).toBe('1:1:true');
  const afterFirstRest = await readCurrentXml(page);
  await expect.poll(async () => (await readE2EState(page))?.canUndo).toBe(true);

  await page.keyboard.press('0');
  await expect.poll(async () => {
    const selected = (await readE2EState(page))?.selectedNote;
    return selected ? `${selected.measureNumber}:${selected.timestampNum}` : null;
  }).toBe('1:2');
  expect(await readCurrentXml(page)).toBe(afterFirstRest);

  await page.keyboard.press('Control+z');
  await expect.poll(async () => {
    const measure = (await readCurrentCore(page)).score.parts[0].staves[0].measures[0];
    return (measure.voices[0]?.events ?? []).slice(0, 2).map((event) => event.kind);
  }).toEqual(['note', 'rest']);
  await expect.poll(async () => (await readE2EState(page))?.canUndo).toBe(false);
  await expectNoDoctorIssues(page, 'after duration-aware repeated rest input');
});

test('notation palette tools update clicked notes visually, semantically, and during playback', async ({ page }, testInfo) => {
  testInfo.setTimeout(90_000);
  await bootWithScore(page);

  const clickOrder = [5, 1, 6, 2, 4, 0, 7, 3];
  for (const [dynamicIndex, noteIndex] of clickOrder.entries()) {
    await clickRenderedNotehead(page, noteIndex);
    await expectSingleNoteSelection(page, noteIndex);

    const dynamicsPanel = await openPaletteSection(page, 'Dynamics');
    await dynamicsPanel.getByRole('button', {
      name: DYNAMICS[dynamicIndex].toUpperCase(),
      exact: true,
    }).click();

    await expectSingleNoteSelection(page, noteIndex);
    await expectNoDoctorIssues(page, `after dynamic edit ${DYNAMICS[dynamicIndex]}`);
    await expect.poll(async () => {
      const measure = (await readCurrentCore(page)).score.parts[0].staves[0].measures[noteIndex < 4 ? 0 : 1];
      return measure?.directions.find((direction) => (
        direction.kind === 'dynamics'
        && direction.timestampNum === noteIndex % 4
        && direction.timestampDen === 4
      ))?.value ?? null;
    }).toBe(DYNAMICS[dynamicIndex]);
  }

  await expect.poll(async () => {
    const directions = (await readCurrentCore(page)).score.parts[0].staves[0].measures
      .flatMap((measure) => measure.directions)
      .filter((direction) => direction.kind === 'dynamics')
      .map((direction) => direction.value)
      .sort();
    return directions;
  }).toEqual([...DYNAMICS].sort());

  await clickRenderedNotehead(page, 0);
  await expectSingleNoteSelection(page, 0);
  const articulationsPanel = await openPaletteSection(page, 'Articulations');
  for (const articulation of ['Staccato', 'Staccatissimo', 'Accent', 'Marcato', 'Tenuto', 'Fermata']) {
    await articulationsPanel.getByRole('button', { name: articulation }).click();
    await expectSingleNoteSelection(page, 0);
    await expectNoDoctorIssues(page, `after articulation ${articulation}`);
  }
  await expect.poll(async () => {
    const core = await readCurrentCore(page);
    const event = core.score.parts[0].staves[0].measures[0]?.voices[0]?.events[0];
    return {
      articulations: event?.articulations?.sort() ?? [],
      fermata: event?.id ? core.fermataEventIds.has(event.id) : false,
    };
  }).toEqual({
    articulations: ARTICULATIONS.filter((entry) => entry !== 'fermata').sort(),
    fermata: true,
  });

  await articulationsPanel.getByRole('button', { name: 'Clear articulations' }).click();
  await expectNoDoctorIssues(page, 'after clearing articulations');
  await expect.poll(async () => {
    const event = (await readCurrentCore(page)).score.parts[0].staves[0].measures[0]?.voices[0]?.events[0];
    return event?.articulations ?? [];
  }).toEqual([]);

  await clickRenderedNotehead(page, 2);
  await page.keyboard.press('ArrowDown');
  await page.keyboard.press('ArrowDown');
  await expectNoDoctorIssues(page, 'after preparing valid same-pitch tie target');

  await clickRenderedNotehead(page, 1);
  const tiesPanel = await openPaletteSection(page, 'Ties');
  await tiesPanel.getByRole('button', { name: /Toggle tie/ }).click();
  await tiesPanel.getByRole('button', { name: /Toggle slur/ }).click();
  await expectSingleNoteSelection(page, 1);
  await expectNoDoctorIssues(page, 'after valid tie and slur edit');
  await expect.poll(async () => {
    const xml = await readCurrentXml(page);
    return xml.includes('<tie type="start"/>') && /<slur\b[^>]*type="start"/.test(xml);
  }).toBeTruthy();

  await clickRenderedNotehead(page, 2);
  const transposePanel = await openPaletteSection(page, 'Transpose');
  const beforePitch = await readCurrentCore(page).then((core) => {
    const event = core.score.parts[0].staves[0].measures[0]?.voices[0]?.events[2];
    return event?.kind === 'note' ? `${event.pitch.step}${event.pitch.alter ?? 0}${event.pitch.octave}` : null;
  });
  await transposePanel.getByRole('button', { name: '+1 semitone' }).click();
  await expectSingleNoteSelection(page, 2);
  await expectNoDoctorIssues(page, 'after palette transpose');
  await expect.poll(async () => {
    const event = (await readCurrentCore(page)).score.parts[0].staves[0].measures[0]?.voices[0]?.events[2];
    return event?.kind === 'note' ? `${event.pitch.step}${event.pitch.alter ?? 0}${event.pitch.octave}` : null;
  }).not.toBe(beforePitch);

  const barlinesPanel = await openPaletteSection(page, 'Barlines');
  const barlineCases: Array<readonly [string, 'left' | 'right', string | undefined]> = [
    ['Regular barline', 'right', undefined],
    ['Double barline', 'right', 'double'],
    ['Final barline', 'right', 'final'],
    ['Start repeat', 'right', 'repeat-start'],
    ['End repeat', 'right', 'repeat-end'],
  ];
  for (const [name, expectedSide, expected] of barlineCases) {
    await barlinesPanel.getByRole('button', { name }).click();
    await expectSingleNoteSelection(page, 2);
    await expect.poll(async () => {
      const measure = (await readCurrentCore(page)).score.parts[0].staves[0].measures[0];
      return expectedSide === 'left' ? measure?.leftBarline : measure?.rightBarline;
    }).toBe(expected);
    if (expected !== 'repeat-end') {
      await expectNoDoctorIssues(page, `after barline ${name}`);
    }
  }
  await bootWithScore(page);

  await clickRenderedNotehead(page, 3);
  const selectionPanel = await openPaletteSection(page, 'Selection');
  const notesBeforeDuplicate = (await readCurrentCore(page)).score.parts[0].staves[0].measures
    .flatMap((measure) => measure.voices)
    .flatMap((voice) => voice.events).length;
  await selectionPanel.getByRole('button', { name: /Duplicate/ }).click();
  await expect.poll(async () => (
    (await readCurrentCore(page)).score.parts[0].staves[0].measures
      .flatMap((measure) => measure.voices)
      .flatMap((voice) => voice.events).length
  )).toBeGreaterThan(notesBeforeDuplicate);
  await expectNoDoctorIssues(page, 'after duplicate selection');

  await selectionPanel.getByRole('button', { name: /^Clear selection/ }).click();
  await expect.poll(async () => (await readE2EState(page))?.selectionCount).toBe(0);
  await expectNoDoctorIssues(page, 'after clear selection');

  await clickRenderedNotehead(page, 0);
  const playbackBefore = (await playbackStarts(page)).length;
  await clickPlay(page);
  await expect.poll(async () => (await playbackStarts(page)).length).toBeGreaterThan(playbackBefore);
  await expect(page.getByTestId('score-playhead')).toBeVisible();
});

test('single-note dynamic edits never promote the note selection to a measure selection', async ({ page }) => {
  await bootWithScore(page);

  await clickRenderedNotehead(page, 0);
  await expectSingleNoteSelection(page, 0);
  const dynamicsPanel = await openPaletteSection(page, 'Dynamics');
  await dynamicsPanel.getByRole('button', { name: 'MF', exact: true }).click();

  await expectSingleNoteSelection(page, 0);
  await expectNoDoctorIssues(page, 'after single-note dynamic edit');
  await expect(page.locator('[data-selected-measure="true"]')).toHaveCount(0);
  await expect.poll(async () => (await readE2EState(page))?.selectedNote?.measureNumber).toBe(1);
  await expect.poll(async () => {
    const dynamics = (await readCurrentCore(page)).score.parts[0].staves[0].measures[0]?.directions
      .filter((direction) => direction.kind === 'dynamics');
    return dynamics?.map((direction) => `${direction.value}@${direction.timestampNum}/${direction.timestampDen}`);
  }).toEqual(['mf@0/4']);

  const before = (await playbackStarts(page)).length;
  await clickPlay(page);
  await expect.poll(async () => (await playbackStarts(page)).length).toBeGreaterThan(before);
  await expect.poll(async () => (await readE2EState(page))?.playbackState).toBe('playing');
  await expect(page.getByTestId('score-playhead')).toBeVisible();
});

test('play resumes from the active selected note instead of a stale paused position', async ({ page }) => {
  const longMidi = buildMidiBody([60, 62, 64, 65, 67, 69, 71, 72, 74, 76, 77, 79, 81, 83, 84, 86]);
  await page.unroute('**/api/midi');
  await page.route('**/api/midi', async (route: Route) => {
    await route.fulfill({
      status: 200,
      contentType: 'audio/midi',
      body: longMidi,
    });
  });
  await bootWithScore(page, buildFourMeasurePlaybackFixtureXml(), { strictDoctor: false });

  await clickPlay(page);
  await expect.poll(async () => (await readE2EState(page))?.playbackState).toBe('playing');
  await page.getByRole('button', { name: 'Pause (Space)', exact: true }).click();
  await expect.poll(async () => (await readE2EState(page))?.playbackState).toBe('paused');

  await clickRenderedNotehead(page, 5);
  await expectSingleNoteSelection(page, 5);
  await resetPlaybackStarts(page);

  await clickPlay(page);
  await expect.poll(async () => (await playbackStarts(page))[0]?.note).toBe(69);
  await expect.poll(async () => {
    const state = await readE2EState(page);
    return {
      playbackState: state?.playbackState,
      measure: state?.selectedNote?.measureNumber,
      timestampNum: state?.selectedNote?.timestampNum,
    };
  }).toEqual({
    playbackState: 'playing',
    measure: 2,
    timestampNum: 1,
  });
});

test('play starts from the note input anchor instead of the advanced selection', async ({ page }) => {
  await bootWithScore(page);

  await page.keyboard.press('Escape');
  await page.keyboard.press('N');
  await page.keyboard.press('B');

  await expect.poll(async () => {
    const state = await readE2EState(page);
    return {
      selectedTimestamp: state?.selectedNote?.timestampNum,
      anchorTimestamp: state?.noteInputAnchor?.timestampNum,
      anchorStep: state?.noteInputAnchor?.step,
    };
  }).toEqual({
    selectedTimestamp: 1,
    anchorTimestamp: 0,
    anchorStep: 'B',
  });
  await expectNoDoctorIssues(page, 'after note-input playback anchor edit');

  await resetPlaybackStarts(page);
  await clickPlay(page);

  await expect.poll(async () => (await playbackStarts(page))[0]?.note).toBe(60);
  await expect.poll(async () => (await readE2EState(page))?.playbackState).toBe('playing');
});

test('clicking a note moves the playback progress bar to that note', async ({ page }) => {
  await bootWithScore(page, buildNotationToolsFixtureXml(), { strictDoctor: false });

  await expect(page.getByTestId('playback-progress-bar')).toHaveCount(0);
  await clickRenderedNotehead(page, 5);
  await expectSingleNoteSelection(page, 5);

  await expect(page.getByTestId('playback-progress-bar')).toBeVisible();
  await expect.poll(async () => {
    const state = await readE2EState(page);
    return state?.currentBeat != null ? Math.round(state.currentBeat * 10) / 10 : null;
  }).toBeGreaterThan(4.5);
  await expect.poll(async () => {
    const width = await page.getByTestId('playback-progress-fill').evaluate((node) => (
      node instanceof HTMLElement ? Number.parseFloat(node.style.width) : 0
    ));
    return Math.round(width);
  }).toBeGreaterThan(50);
});

test('clicking an earlier note while playback is running jumps playback back to that active note', async ({ page }) => {
  const longMidi = buildMidiBody([60, 62, 64, 65, 67, 69, 71, 72, 74, 76, 77, 79, 81, 83, 84, 86]);
  await page.unroute('**/api/midi');
  await page.route('**/api/midi', async (route: Route) => {
    await route.fulfill({
      status: 200,
      contentType: 'audio/midi',
      body: longMidi,
    });
  });
  await bootWithScore(page, buildFourMeasurePlaybackFixtureXml(), { strictDoctor: false });

  await clickPlay(page);
  await expect.poll(async () => page.evaluate(() => (
    (window as typeof window & {
      __NEX_NOTE_E2E_STATE__?: { currentMeasure?: number };
    }).__NEX_NOTE_E2E_STATE__?.currentMeasure ?? 0
  )), { timeout: 8_000 }).toBeGreaterThanOrEqual(3);

  await resetPlaybackStarts(page);
  await clickRenderedNotehead(page, 5);
  await expectSingleNoteSelection(page, 5);

  await expect.poll(async () => (await playbackStarts(page)).some((entry) => entry.note === 69)).toBe(true);
  await expect.poll(async () => (await readE2EState(page))?.currentMeasure).toBe(2);
  await resetPlaybackStarts(page);
  await page.waitForTimeout(450);
  expect((await playbackSounded(page)).map((entry) => entry.note)).not.toEqual(expect.arrayContaining([74, 76, 77, 79, 81, 83, 84, 86]));
  await expect.poll(async () => (await readE2EState(page))?.playbackState).toBe('playing');
});

test('play control restarts running playback from the active selected note', async ({ page }) => {
  const longMidi = buildMidiBody([60, 62, 64, 65, 67, 69, 71, 72, 74, 76, 77, 79, 81, 83, 84, 86]);
  await page.unroute('**/api/midi');
  await page.route('**/api/midi', async (route: Route) => {
    await route.fulfill({
      status: 200,
      contentType: 'audio/midi',
      body: longMidi,
    });
  });
  await bootWithScore(page, buildFourMeasurePlaybackFixtureXml(), { strictDoctor: false });

  await clickRenderedNotehead(page, 5);
  await expectSingleNoteSelection(page, 5);
  await resetPlaybackStarts(page);
  await clickPlay(page);
  await expect.poll(async () => page.evaluate(() => (
    (window as typeof window & {
      __NEX_NOTE_E2E_STATE__?: { currentMeasure?: number };
    }).__NEX_NOTE_E2E_STATE__?.currentMeasure ?? 0
  )), { timeout: 8_000 }).toBeGreaterThanOrEqual(3);

  await resetPlaybackStarts(page);
  await clickPlay(page);

  await expect.poll(async () => (await playbackStarts(page)).some((entry) => entry.note === 69)).toBe(true);
  await expect.poll(async () => (await readE2EState(page))?.currentMeasure).toBe(2);
  await page.waitForTimeout(450);
  expect((await playbackSounded(page)).map((entry) => entry.note)).not.toEqual(expect.arrayContaining([74, 76, 77, 79, 81, 83, 84, 86]));
  await expect.poll(async () => (await readE2EState(page))?.playbackState).toBe('playing');
});

test('space pauses running playback even when a note is selected', async ({ page }) => {
  await bootWithScore(page, buildNotationToolsFixtureXml(), { strictDoctor: false });

  await clickRenderedNotehead(page, 5);
  await expectSingleNoteSelection(page, 5);
  await resetPlaybackStarts(page);
  await clickPlay(page);
  await expect.poll(async () => (await readE2EState(page))?.playbackState).toBe('playing');
  await expect.poll(async () => (await playbackStarts(page)).some((entry) => entry.note === 69)).toBe(true);

  await resetPlaybackStarts(page);
  await page.keyboard.press('Space');

  await expect.poll(async () => (await readE2EState(page))?.playbackState).toBe('paused');
  await page.waitForTimeout(700);
  await expect.poll(async () => (await readE2EState(page))?.playbackState).toBe('paused');
  expect(await playbackSounded(page)).toEqual([]);
});

test('held space does not restart playback through key repeat', async ({ page }) => {
  await bootWithScore(page, buildNotationToolsFixtureXml(), { strictDoctor: false });

  await clickRenderedNotehead(page, 5);
  await expectSingleNoteSelection(page, 5);
  await clickPlay(page);
  await expect.poll(async () => (await readE2EState(page))?.playbackState).toBe('playing');
  await expect.poll(async () => (await playbackStarts(page)).some((entry) => entry.note === 69)).toBe(true);

  await resetPlaybackStarts(page);
  await page.keyboard.down('Space');
  await expect.poll(async () => (await readE2EState(page))?.playbackState).toBe('paused');
  await page.keyboard.down('Space');
  await page.waitForTimeout(700);
  await page.keyboard.up('Space');

  await expect.poll(async () => (await readE2EState(page))?.playbackState).toBe('paused');
  expect(await playbackStarts(page)).toEqual([]);
  expect(await playbackSounded(page)).toEqual([]);
});
