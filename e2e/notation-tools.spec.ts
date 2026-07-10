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
