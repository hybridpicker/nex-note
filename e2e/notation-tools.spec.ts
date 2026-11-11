import { expect, test } from '@playwright/test';
import type { Page, Route } from '@playwright/test';
import { Midi } from '@tonejs/midi';

import { writeFailureArtifacts } from './support/failure-artifacts';
import { importMusicXmlToCore } from '../src/musicxml-adapter/import/import-musicxml.ts';
import { formatShortcutHint } from '../lib/shortcut-hints.ts';
import { PASSAGE_1, PASSAGE_1_EXPECTED, summarize } from '../test/support/keyboard-passage.ts';

// Tooltips name the host platform's modifiers; headless Chrome runs on the host OS.
const hostShortcutHint = (shortcut: string) => formatShortcutHint(
  shortcut,
  process.platform === 'darwin' ? 'MacIntel' : process.platform === 'win32' ? 'Win32' : 'Linux x86_64',
);

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
  // Tools now start closed; this suite explicitly opens the controls it tests.
  await openNotationTools(page);
  await page.getByTestId('score-viewport').focus();
}

async function clickRenderedNotehead(page: Page, index: number) {
  await page.locator('[data-testid="score-canvas"] .vf-notehead').nth(index).click();
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

test('notation toolbar states active voice and entry intent in plain language', async ({ page }) => {
  await bootWithScore(page);

  const summary = page.getByTestId('note-input-state-summary');
  await expect(summary).toHaveText('Navigation · Voice 1 · Standard · Single note');
  await expect(summary).toHaveAttribute('aria-live', 'off');

  await page.getByTitle('Toggle note input (N)').click();
  // The note-input bar has a voice button of the same title; this test means the notation tools.
  await page.getByTestId('left-notation-sidebar').getByTitle(hostShortcutHint('Voice 3 (Cmd/Ctrl+Alt/Option+3)'), { exact: true }).click();
  await page.getByTitle(hostShortcutHint('Entry mode: Standard (I, Cmd/Ctrl+I, Cmd/Ctrl+Shift+I)'), { exact: true }).click();
  await page.getByTitle(hostShortcutHint('Chord input off (Cmd/Ctrl+Shift+H)'), { exact: true }).click();

  await expect(summary).toHaveText('Note Input · Voice 3 · Replace · Chord');
  await expect(summary).toHaveAttribute('data-active-voice', '3');
  await expect(summary).toHaveAttribute('data-entry-mode', 'replace');
  await expect(summary).toHaveAttribute('data-chord-input', 'chord');
  await expect(summary).toHaveAttribute(
    'aria-label',
    'Notation input state: Note Input, Voice 3, Replace, Chord',
  );
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

  // MuseScore: Shift chord tones go to the note just entered (A3), above its highest tone; the
  // input cursor stays on the next slot (E4).
  await page.keyboard.press('Shift+B');
  await page.keyboard.press('Shift+C');
  const notesAt = async (timestampNum: number) => {
    const measure = (await readCurrentCore(page)).score.parts[0].staves[0].measures[0];
    return (measure.voices[0]?.events ?? [])
      .filter((event) => event.kind === 'note' && event.timestampNum === timestampNum)
      .map((event) => event.kind === 'note' ? `${event.pitch.step}${event.pitch.octave}` : null);
  };
  await expect.poll(() => notesAt(1)).toEqual(['A3', 'B3', 'C4']);
  expect(await notesAt(2)).toEqual(['E4']);
  await expect.poll(async () => {
    const selected = (await readE2EState(page))?.selectedNote;
    return selected ? `${selected.step}${selected.octave}@${selected.timestampNum}` : null;
  }).toBe('E4@2');
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
  await expect(durationMode).toContainText('Pitch first C4+E4+G4');
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

  await expect(page.locator('button[title^="Input by duration (M)"]:visible').first()).toContainText('Pitch first C4+E4+G4');
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
  await expect(page.locator('button[title^="Input by duration (M)"]:visible').first()).toContainText('Pitch first REST');
  expect(await readCurrentXml(page)).toBe(chordXml);

  await page.locator('button[title^="Eighth note: 4"]:visible').first().click();
  await expect.poll(async () => {
    const measure = (await readCurrentCore(page)).score.parts[0].staves[0].measures[0];
    const event = (measure.voices[0]?.events ?? []).find((candidate) => (
      candidate.timestampNum * 4 === candidate.timestampDen
    ));
    return event ? `${event.kind}:${event.durationType}` : null;
  }).toBe('rest:eighth');

  const undo = page.locator('button[title^="Undo ("]:visible').first();
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

async function dispatchLayoutKey(
  page: Page,
  init: { key: string; code: string; shiftKey?: boolean; ctrlKey?: boolean; metaKey?: boolean; repeat?: boolean },
) {
  // Playwright types through a US layout; QWERTZ presses are dispatched with their real key/code pair.
  await page.evaluate((eventInit) => {
    const target = document.activeElement instanceof HTMLElement ? document.activeElement : document.body;
    target.dispatchEvent(new KeyboardEvent('keydown', { bubbles: true, cancelable: true, ...eventInit }));
  }, init);
}

test('QWERTZ keys enter a sharp, ignore a held note key and redo with the printed Y', async ({ page }) => {
  await bootWithScore(page);
  const initialXml = await readCurrentXml(page);

  await clickRenderedNotehead(page, 0);
  await expectSingleNoteSelection(page, 0);
  await page.keyboard.press('N');
  await dispatchLayoutKey(page, { key: '+', code: 'BracketRight' });
  await expect.poll(async () => (await readE2EState(page))?.selectedAccidental).toBe('sharp');
  await dispatchLayoutKey(page, { key: 'c', code: 'KeyC' });
  await expect.poll(async () => readCurrentXml(page)).not.toBe(initialXml);
  const editedXml = await readCurrentXml(page);

  await dispatchLayoutKey(page, { key: 'c', code: 'KeyC', repeat: true });
  await dispatchLayoutKey(page, { key: 'c', code: 'KeyC', repeat: true });
  await page.waitForTimeout(250);
  expect(await readCurrentXml(page)).toBe(editedXml);

  // Printed Z on QWERTZ is the physical KeyY; printed Y is the physical KeyZ.
  await dispatchLayoutKey(page, { key: 'z', code: 'KeyY', ctrlKey: true });
  await expect.poll(async () => readCurrentXml(page)).toBe(initialXml);
  await dispatchLayoutKey(page, { key: 'y', code: 'KeyZ', ctrlKey: true });
  await expect.poll(async () => readCurrentXml(page)).toBe(editedXml);
  expect((editedXml.match(/<alter>1<\/alter>/g) ?? []).length).toBeGreaterThan(0);
  await expectNoDoctorIssues(page, 'after QWERTZ entry, undo and redo');
});

test('editing a right-hand note keeps left-hand dynamics and pedal marks in the document', async ({ page }) => {
  const lowerStaffDirection = (body: string) => `<direction placement="below"><direction-type>${body}</direction-type><staff>2</staff></direction>`;
  const pianoXml = `<?xml version="1.0" encoding="UTF-8"?>
<score-partwise version="4.0"><part-list><score-part id="P1"><part-name>Piano</part-name></score-part></part-list><part id="P1">
<measure number="1"><attributes><divisions>2</divisions><key><fifths>0</fifths></key><time><beats>4</beats><beat-type>4</beat-type></time><staves>2</staves><clef number="1"><sign>G</sign><line>2</line></clef><clef number="2"><sign>F</sign><line>4</line></clef></attributes>
<note><pitch><step>C</step><octave>5</octave></pitch><duration>4</duration><voice>1</voice><type>half</type><staff>1</staff></note>
<note><pitch><step>D</step><octave>5</octave></pitch><duration>4</duration><voice>1</voice><type>half</type><staff>1</staff></note>
<backup><duration>8</duration></backup>
${lowerStaffDirection('<pedal type="start" line="yes"/>')}${lowerStaffDirection('<dynamics><mf/></dynamics>')}
<note><pitch><step>C</step><octave>3</octave></pitch><duration>4</duration><voice>5</voice><type>half</type><staff>2</staff></note>
${lowerStaffDirection('<pedal type="stop" line="yes"/>')}
<note><pitch><step>G</step><octave>2</octave></pitch><duration>4</duration><voice>5</voice><type>half</type><staff>2</staff></note>
</measure></part></score-partwise>`;
  await bootWithScore(page, pianoXml);
  const initialXml = await readCurrentXml(page);

  await clickRenderedNotehead(page, 0);
  await expect.poll(async () => {
    const selected = (await readE2EState(page))?.selectedNote;
    return selected ? `${selected.staffIndex}:${selected.step}${selected.octave}` : null;
  }).toBe('1:C5');
  await page.keyboard.press('ArrowUp');
  await expect.poll(async () => readCurrentXml(page)).not.toBe(initialXml);

  const editedXml = await readCurrentXml(page);
  expect(editedXml).toMatch(/<dynamics>\s*<mf\/>\s*<\/dynamics>/);
  expect((editedXml.match(/<pedal\b[^>]*type="start"/g) ?? []).length).toBe(1);
  expect((editedXml.match(/<pedal\b[^>]*type="stop"/g) ?? []).length).toBe(1);
  const lowerStaff = (await readCurrentCore(page)).score.parts[0].staves[1].measures[0].directions;
  const pedalStop = lowerStaff.find((entry) => entry.kind === 'pedal' && entry.value === 'stop');
  expect(pedalStop && (pedalStop.timestampNum ?? 0) / (pedalStop.timestampDen ?? 1)).toBe(0.5);
});

test('MuseScore-numbered piano left hand (voice 5) receives keyboard and mouse entry in that voice', async ({ page }) => {
  // MuseScore and Finale export the lower piano staff as MusicXML voice 5.
  const upper = ['C', 'D', 'E', 'F'].map((step) => `<note><pitch><step>${step}</step><octave>5</octave></pitch><duration>2</duration><voice>1</voice><type>quarter</type><staff>1</staff></note>`).join('');
  const pianoXml = `<?xml version="1.0" encoding="UTF-8"?>
<score-partwise version="4.0"><part-list><score-part id="P1"><part-name>Piano</part-name></score-part></part-list><part id="P1">
<measure number="1"><attributes><divisions>2</divisions><key><fifths>0</fifths></key><time><beats>4</beats><beat-type>4</beat-type></time><staves>2</staves><clef number="1"><sign>G</sign><line>2</line></clef><clef number="2"><sign>F</sign><line>4</line></clef></attributes>
${upper}<backup><duration>8</duration></backup>
<note><rest/><duration>4</duration><voice>5</voice><type>half</type><staff>2</staff></note>
<note><rest/><duration>4</duration><voice>5</voice><type>half</type><staff>2</staff></note>
</measure></part></score-partwise>`;
  await bootWithScore(page, pianoXml);
  const lowerStaffVoices = async () => {
    const staff = (await readCurrentCore(page)).score.parts[0].staves[1];
    return staff.measures[0].voices
      .filter((voice) => voice.events.length > 0)
      .map((voice) => `${voice.voiceId}:${voice.events.map((event) => event.kind === 'note' ? `${event.pitch.step}@${event.timestampNum}/${event.timestampDen}` : 'r').join(',')}`);
  };

  // Keyboard: select the right-hand C, move down to the left-hand rest, enter an eighth.
  await clickRenderedNotehead(page, 0);
  await page.keyboard.press('Alt+ArrowDown');
  await expect.poll(async () => {
    const selected = (await readE2EState(page))?.selectedNote;
    return selected ? `${selected.staffIndex}:${selected.voiceId}` : null;
  }).toBe('2:5');
  await page.keyboard.press('N');
  await page.keyboard.press('4');
  await page.keyboard.press('c');
  await expect.poll(lowerStaffVoices).toEqual([expect.stringMatching(/^5:C@0\//)]);

  // Mouse: hover the lower staff in the second half of the bar and click the ghost.
  const boxes = await page.locator('[data-measure-number="1"]').evaluateAll((elements) => elements.map((element) => {
    const rect = element.getBoundingClientRect();
    return { x: rect.x, y: rect.y, width: rect.width, height: rect.height };
  }));
  let committed: { voice: string | null; timestamp: string | null } | null = null;
  outer: for (const box of boxes) {
    for (let yStep = 0; yStep <= 24; yStep += 1) {
      const y = box.y + (box.height * yStep) / 24;
      for (const xRatio of [0.72, 0.78, 0.84]) {
        await page.mouse.move(box.x + box.width * xRatio, y);
        const ghost = await page.evaluate(() => {
          const element = document.querySelector<HTMLElement>('[data-testid="ghost-note-preview"]');
          if (!element || element.offsetParent === null) return null;
          return { staff: element.dataset.ghostCommitStaff ?? element.dataset.ghostStaff ?? null, voice: element.dataset.ghostCommitVoice ?? element.dataset.ghostVoice ?? null, timestamp: element.dataset.ghostCommitTimestamp ?? null };
        });
        if (ghost?.staff === '2') {
          expect(ghost.voice).toBe('5');
          committed = ghost;
          await page.mouse.click(box.x + box.width * xRatio, y);
          break outer;
        }
      }
    }
  }
  expect(committed, 'a lower-staff ghost was found').not.toBeNull();
  await expect.poll(async () => (await lowerStaffVoices()).length).toBe(1);
  await expect.poll(async () => (await lowerStaffVoices())[0]).toMatch(/^5:C@0\/\d+,.*[A-G]@/);
});

test('a quarter and Cmd/Ctrl+3 during note input create an eighth triplet that typed pitches fill', async ({ page }) => {
  await bootWithScore(page);
  await clickRenderedNotehead(page, 0);
  await expectSingleNoteSelection(page, 0);
  await page.keyboard.press('N');
  await page.keyboard.press('5');
  await page.keyboard.press('Control+3');
  for (const key of ['c', 'd', 'e']) await page.keyboard.press(key);
  const tripletNotes = async () => {
    const measure = (await readCurrentCore(page)).score.parts[0].staves[0].measures[0];
    return (measure.voices[0]?.events ?? [])
      .filter((event) => event.kind === 'note' && event.timestampNum / event.timestampDen < 0.25)
      .map((event) => `${event.kind === 'note' ? event.pitch.step : ''}:${event.durationType}`);
  };
  await expect.poll(tripletNotes).toEqual(['C:eighth', 'D:eighth', 'E:eighth']);
  const xml = await readCurrentXml(page);
  expect((xml.match(/<time-modification>\s*<actual-notes>3<\/actual-notes>\s*<normal-notes>2<\/normal-notes>/g) ?? []).length).toBe(3);
  await expectNoDoctorIssues(page, 'after triplet entry at the cursor');
});

test('a keyboard quarter on the last eighth of a bar is split at the barline and tied in one Undo step', async ({ page }) => {
  const eighthBars = `<?xml version="1.0" encoding="UTF-8"?>
<score-partwise version="4.0"><part-list><score-part id="P1"><part-name>Flute</part-name></score-part></part-list><part id="P1">
<measure number="1"><attributes><divisions>2</divisions><key><fifths>0</fifths></key><time><beats>4</beats><beat-type>4</beat-type></time><clef><sign>G</sign><line>2</line></clef></attributes>
${'<note><pitch><step>G</step><octave>4</octave></pitch><duration>1</duration><voice>1</voice><type>eighth</type></note>'.repeat(8)}</measure>
<measure number="2">${'<note><pitch><step>A</step><octave>4</octave></pitch><duration>2</duration><voice>1</voice><type>quarter</type></note>'.repeat(4)}</measure>
</part></score-partwise>`;
  await bootWithScore(page, eighthBars);
  await expectNoDoctorIssues(page, 'fixture load');
  await clickRenderedNotehead(page, 0);
  await expect.poll(async () => (await readE2EState(page))?.selectedNote?.measureNumber ?? null).toBe(1);
  await page.keyboard.press('N');
  await page.keyboard.press('4');
  for (const key of ['c', 'd', 'e', 'f', 'g', 'a', 'b']) await page.keyboard.press(key);
  const beforeSplit = await readCurrentXml(page);
  await page.keyboard.press('5');
  await page.keyboard.press('c');
  const tiedPair = async () => {
    const measures = (await readCurrentCore(page)).score.parts[0].staves[0].measures;
    const last = measures[0].voices[0].events.at(-1)!;
    const first = measures[1].voices[0].events[0]!;
    return [last, first].map((event) => (event.kind === 'note'
      ? `${event.pitch.step}${event.pitch.octave}:${event.durationType}${event.tieStart ? '~' : ''}`
      : `rest:${event.durationType}`));
  };
  await expect.poll(tiedPair).toEqual(['C6:eighth~', 'C6:eighth']);
  await expectNoDoctorIssues(page, 'after the barline split');
  await page.keyboard.press('Control+z');
  await expect.poll(async () => readCurrentXml(page)).toBe(beforeSplit);
});

test('a palette dynamic on the second instrument stays in that instrument', async ({ page }) => {
  const quarters = (octave: number) => ['C', 'D', 'E', 'F'].map((step) => `<note><pitch><step>${step}</step><octave>${octave}</octave></pitch><duration>2</duration><voice>1</voice><type>quarter</type></note>`).join('');
  const duoXml = `<?xml version="1.0" encoding="UTF-8"?>
<score-partwise version="4.0"><part-list><score-part id="P1"><part-name>Flute</part-name></score-part><score-part id="P2"><part-name>Cello</part-name></score-part></part-list>
<part id="P1"><measure number="1"><attributes><divisions>2</divisions><key><fifths>0</fifths></key><time><beats>4</beats><beat-type>4</beat-type></time><clef><sign>G</sign><line>2</line></clef></attributes>${quarters(5)}</measure></part>
<part id="P2"><measure number="1"><attributes><divisions>2</divisions><key><fifths>0</fifths></key><time><beats>4</beats><beat-type>4</beat-type></time><clef><sign>F</sign><line>4</line></clef></attributes>${quarters(3)}</measure></part>
</score-partwise>`;
  await bootWithScore(page, duoXml);
  await clickRenderedNotehead(page, 4);
  await expect.poll(async () => (await readE2EState(page))?.selectedNote?.octave ?? null).toBe(3);
  const dynamicsPanel = await openPaletteSection(page, 'Dynamics');
  await dynamicsPanel.getByRole('button', { name: 'F', exact: true }).click();
  const dynamicsByPart = async () => (await readCurrentCore(page)).score.parts.map((part) => (
    part.staves[0].measures[0].directions.filter((direction) => direction.kind === 'dynamics').map((direction) => direction.value)
  ));
  await expect.poll(dynamicsByPart).toEqual([[], ['f']]);
});

test('double-dotted notes and rests keep both dots when a neighbouring note is edited', async ({ page }) => {
  const doubleDotted = `<?xml version="1.0" encoding="UTF-8"?>
<score-partwise version="4.0"><part-list><score-part id="P1"><part-name>Flute</part-name></score-part></part-list><part id="P1">
<measure number="1"><attributes><divisions>8</divisions><key><fifths>0</fifths></key><time><beats>4</beats><beat-type>4</beat-type></time><clef><sign>G</sign><line>2</line></clef></attributes>
<note><pitch><step>C</step><octave>5</octave></pitch><duration>14</duration><voice>1</voice><type>quarter</type><dot/><dot/></note>
<note><pitch><step>D</step><octave>5</octave></pitch><duration>2</duration><voice>1</voice><type>16th</type></note>
<note><pitch><step>G</step><octave>4</octave></pitch><duration>14</duration><voice>1</voice><type>quarter</type><dot/><dot/></note>
<note><pitch><step>E</step><octave>5</octave></pitch><duration>2</duration><voice>1</voice><type>16th</type></note>
</measure></part></score-partwise>`;
  await bootWithScore(page, doubleDotted);
  await expectNoDoctorIssues(page, 'double-dotted fixture load');
  const initialXml = await readCurrentXml(page);
  expect((initialXml.match(/<dot\/>/g) ?? []).length).toBe(4);
  await clickRenderedNotehead(page, 1);
  await expect.poll(async () => (await readE2EState(page))?.selectedNote?.step ?? null).toBe('D');
  await page.keyboard.press('ArrowUp');
  await expect.poll(async () => readCurrentXml(page)).not.toBe(initialXml);
  expect(((await readCurrentXml(page)).match(/<dot\/>/g) ?? []).length).toBe(4);
  await expectNoDoctorIssues(page, 'after editing next to double-dotted notes');
});

test('inline chord entry writes N.C. and 6/9 as valid MusicXML harmonies', async ({ page }) => {
  await bootWithScore(page);
  for (const [noteIndex, symbol] of [[0, 'N.C.'], [1, 'C6/9']] as const) {
    await clickRenderedNotehead(page, noteIndex);
    await page.keyboard.press('Control+k');
    const inlineChord = page.getByLabel('Inline chord symbol');
    await expect(inlineChord).toBeFocused();
    await inlineChord.fill(symbol);
    await page.keyboard.press('Enter');
  }
  await expect.poll(async () => readCurrentXml(page)).toMatch(/<kind text="N\.C\.">none<\/kind>/);
  const xml = await readCurrentXml(page);
  expect(xml).toMatch(/<kind text="6\/9">major-sixth<\/kind>/);
  expect(xml).not.toMatch(/<root-step>N<\/root-step>/);
  const harmonies = (await readCurrentCore(page)).score.parts[0].staves[0].measures
    .flatMap((measure) => measure.directions)
    .filter((direction) => direction.kind === 'harmony')
    .map((direction) => direction.value);
  expect(harmonies).toEqual(expect.arrayContaining(['N.C.', 'C6/9']));
});

test('entry in voice 2 starts at the input cursor, not at the last entered note', async ({ page }) => {
  const quarters = ['C', 'D', 'E', 'F'].map((step) => `<note><pitch><step>${step}</step><octave>5</octave></pitch><duration>2</duration><voice>1</voice><type>quarter</type></note>`).join('');
  const voiceXml = `<?xml version="1.0" encoding="UTF-8"?>
<score-partwise version="4.0"><part-list><score-part id="P1"><part-name>Flute</part-name></score-part></part-list>
<part id="P1"><measure number="1"><attributes><divisions>2</divisions><key><fifths>0</fifths></key><time><beats>4</beats><beat-type>4</beat-type></time><clef><sign>G</sign><line>2</line></clef></attributes>${quarters}</measure></part>
</score-partwise>`;
  await bootWithScore(page, voiceXml);
  await clickRenderedNotehead(page, 0);
  await expect.poll(async () => (await readE2EState(page))?.selectedNote?.step ?? null).toBe('C');
  await page.keyboard.press('N');
  await page.keyboard.press('Control+Alt+2');
  await page.keyboard.press('5');
  await page.keyboard.press('0');
  await page.keyboard.press('a');
  const voiceTwo = async () => {
    const measure = (await readCurrentCore(page)).score.parts[0].staves[0].measures[0];
    return (measure.voices.find((voice) => voice.voiceId === 2)?.events ?? [])
      .map((event) => `${event.kind === 'note' ? event.pitch.step : 'r'}@${(event.timestampNum / event.timestampDen) * 4}:${event.durationType}`);
  };
  await expect.poll(voiceTwo).toEqual(['r@0:quarter', 'A@1:quarter', 'r@2:half']);
  const voiceOne = (await readCurrentCore(page)).score.parts[0].staves[0].measures[0].voices.find((voice) => voice.voiceId === 1)!.events
    .map((event) => (event.kind === 'note' ? `${event.pitch.step}${event.pitch.octave}` : 'r'));
  expect(voiceOne).toEqual(['C5', 'D5', 'E5', 'F5']);
});

test('voice 2 entry continues into the next bar instead of overwriting the last eighth', async ({ page }) => {
  const quarters = ['C', 'D', 'E', 'F'].map((step) => `<note><pitch><step>${step}</step><octave>5</octave></pitch><duration>2</duration><voice>1</voice><type>quarter</type></note>`).join('');
  const twoBars = `<?xml version="1.0" encoding="UTF-8"?>
<score-partwise version="4.0"><part-list><score-part id="P1"><part-name>Flute</part-name></score-part></part-list>
<part id="P1"><measure number="1"><attributes><divisions>2</divisions><key><fifths>0</fifths></key><time><beats>4</beats><beat-type>4</beat-type></time><clef><sign>G</sign><line>2</line></clef></attributes>${quarters}</measure><measure number="2">${quarters}</measure></part>
</score-partwise>`;
  await bootWithScore(page, twoBars);
  await clickRenderedNotehead(page, 0);
  await expect.poll(async () => (await readE2EState(page))?.selectedNote?.step ?? null).toBe('C');
  await page.keyboard.press('N');
  await page.keyboard.press('Control+Alt+2');
  await page.keyboard.press('4');
  for (const key of ['c', 'd', 'e', 'f', 'g', 'a', 'b', 'c', 'd', 'e']) await page.keyboard.press(key);
  const voiceTwoNotes = async () => (await readCurrentCore(page)).score.parts[0].staves[0].measures.flatMap((measure) => (
    (measure.voices.find((voice) => voice.voiceId === 2)?.events ?? [])
      .filter((event) => event.kind === 'note')
      .map((event) => `m${measure.measureNumber}:${event.kind === 'note' ? `${event.pitch.step}${event.pitch.octave}` : ''}`)
  ));
  await expect.poll(voiceTwoNotes).toEqual(['m1:C5', 'm1:D5', 'm1:E5', 'm1:F5', 'm1:G5', 'm1:A5', 'm1:B5', 'm1:C6', 'm2:D6', 'm2:E6']);
});

test('lyric extenders and elisions survive an edit in the score', async ({ page }) => {
  const lyricXml = `<?xml version="1.0" encoding="UTF-8"?>
<score-partwise version="4.0"><part-list><score-part id="P1"><part-name>Voice</part-name></score-part></part-list><part id="P1">
<measure number="1"><attributes><divisions>1</divisions><key><fifths>0</fifths></key><time><beats>4</beats><beat-type>4</beat-type></time><clef><sign>G</sign><line>2</line></clef></attributes>
<note><pitch><step>C</step><octave>5</octave></pitch><duration>1</duration><voice>1</voice><type>quarter</type><lyric number="1"><syllabic>single</syllabic><text>Ah</text><extend type="start"/></lyric></note>
<note><pitch><step>D</step><octave>5</octave></pitch><duration>1</duration><voice>1</voice><type>quarter</type><lyric number="1"><extend type="stop"/></lyric></note>
<note><pitch><step>E</step><octave>5</octave></pitch><duration>1</duration><voice>1</voice><type>quarter</type><lyric number="1"><syllabic>end</syllabic><text>ri</text><elision>‿</elision><syllabic>single</syllabic><text>a</text></lyric></note>
<note><pitch><step>F</step><octave>5</octave></pitch><duration>1</duration><voice>1</voice><type>quarter</type></note>
</measure></part></score-partwise>`;
  await bootWithScore(page, lyricXml);
  const initialXml = await readCurrentXml(page);
  await clickRenderedNotehead(page, 3);
  await expect.poll(async () => (await readE2EState(page))?.selectedNote?.step ?? null).toBe('F');
  await page.keyboard.press('ArrowUp');
  await expect.poll(async () => readCurrentXml(page)).not.toBe(initialXml);
  const xml = await readCurrentXml(page);
  expect(xml).toMatch(/<extend type="start"\/>/);
  expect(xml).toMatch(/<lyric>\s*<extend type="stop"\/>\s*<\/lyric>/);
  expect(xml).toMatch(/<text>ri<\/text>\s*<elision>‿<\/elision>\s*<syllabic>single<\/syllabic>\s*<text>a<\/text>/);
});

test('whole-bar rests do not block editing in strict Doctor mode', async ({ page }) => {
  const restBars = `<?xml version="1.0" encoding="UTF-8"?>
<score-partwise version="4.0"><part-list><score-part id="P1"><part-name>Flute</part-name></score-part></part-list><part id="P1">
<measure number="1"><attributes><divisions>2</divisions><key><fifths>0</fifths></key><time><beats>4</beats><beat-type>4</beat-type></time><clef><sign>G</sign><line>2</line></clef></attributes>
${'<note><pitch><step>G</step><octave>4</octave></pitch><duration>2</duration><voice>1</voice><type>quarter</type></note>'.repeat(4)}</measure>
<measure number="2"><note><rest measure="yes"/><duration>8</duration><voice>1</voice><type>whole</type></note></measure>
</part></score-partwise>`;
  await bootWithScore(page, restBars);
  await expectNoDoctorIssues(page, 'whole-bar rest fixture load');
  const initialXml = await readCurrentXml(page);
  await clickRenderedNotehead(page, 0);
  await page.keyboard.press('ArrowUp');
  await expect.poll(async () => readCurrentXml(page)).not.toBe(initialXml);
  await expectNoDoctorIssues(page, 'after editing next to a whole-bar rest');
});

test('the first note in an empty bass staff is resolved from the clef, as in MuseScore', async ({ page }) => {
  const celloXml = `<?xml version="1.0" encoding="UTF-8"?>
<score-partwise version="4.0"><part-list><score-part id="P1"><part-name>Cello</part-name></score-part></part-list><part id="P1">
<measure number="1"><attributes><divisions>2</divisions><key><fifths>0</fifths></key><time><beats>4</beats><beat-type>4</beat-type></time><clef><sign>F</sign><line>4</line></clef></attributes>
<note><rest measure="yes"/><duration>8</duration><voice>1</voice><type>whole</type></note></measure>
</part></score-partwise>`;
  await bootWithScore(page, celloXml);
  await page.keyboard.press('Control+Home');
  await page.keyboard.press('N');
  await page.keyboard.press('5');
  for (const key of ['c', 'd', 'e']) await page.keyboard.press(key);
  const pitches = async () => ((await readCurrentCore(page)).score.parts[0].staves[0].measures[0].voices[0]?.events ?? [])
    .filter((event) => event.kind === 'note')
    .map((event) => (event.kind === 'note' ? `${event.pitch.step}${event.pitch.octave}` : ''));
  await expect.poll(pitches).toEqual(['C3', 'D3', 'E3']);
});

test('off-beat values keep their tied tail and the next entry follows them', async ({ page }) => {
  const fluteXml = `<?xml version="1.0" encoding="UTF-8"?>
<score-partwise version="4.0"><part-list><score-part id="P1"><part-name>Flute</part-name></score-part></part-list><part id="P1">
<measure number="1"><attributes><divisions>4</divisions><key><fifths>0</fifths></key><time><beats>4</beats><beat-type>4</beat-type></time><clef><sign>G</sign><line>2</line></clef></attributes>
<note><rest measure="yes"/><duration>16</duration><voice>1</voice><type>whole</type></note></measure>
</part></score-partwise>`;
  await bootWithScore(page, fluteXml, { strictDoctor: true });
  await page.keyboard.press('Control+Home');
  await page.keyboard.press('N');
  // An eighth, an off-beat quarter, then a quarter rest that is also off the beat.
  for (const key of ['4', 'c', '5', 'd', '0', 'e']) await page.keyboard.press(key);
  const summary = async () => ((await readCurrentCore(page)).score.parts[0].staves[0].measures[0].voices[0]?.events ?? [])
    .map((event) => {
      const onset = (event.timestampNum / event.timestampDen) * 4;
      return event.kind === 'note'
        ? `${onset}:${event.pitch.step}${event.pitch.octave}:${event.durationType}${event.tieStart ? '~' : ''}`
        : `${onset}:r:${event.durationType}`;
    });
  await expect.poll(summary).toEqual([
    '0:C5:eighth',
    '0.5:D5:eighth~',
    '1:D5:eighth',
    '1.5:r:eighth',
    '2:r:eighth',
    '2.5:E5:eighth~',
    '3:E5:eighth',
    '3.5:r:eighth',
  ]);
  await expectNoDoctorIssues(page, 'after off-beat entry');
});

test('switching voices keeps each voice register and enters inside a longer rest', async ({ page }) => {
  const fluteXml = `<?xml version="1.0" encoding="UTF-8"?>
<score-partwise version="4.0"><part-list><score-part id="P1"><part-name>Flute</part-name></score-part></part-list><part id="P1">
<measure number="1"><attributes><divisions>4</divisions><key><fifths>0</fifths></key><time><beats>4</beats><beat-type>4</beat-type></time><clef><sign>G</sign><line>2</line></clef></attributes>
<note><rest measure="yes"/><duration>16</duration><voice>1</voice><type>whole</type></note></measure>
</part></score-partwise>`;
  await bootWithScore(page, fluteXml, { strictDoctor: true });
  await page.keyboard.press('Control+Home');
  await page.keyboard.press('N');
  for (const key of ['5', 'c', 'd', 'Control+Alt+2', 'e', 'Control+Alt+1', 'f']) await page.keyboard.press(key);
  const summary = async (voiceId: number) => {
    const measure = (await readCurrentCore(page)).score.parts[0].staves[0].measures[0];
    return (measure.voices.find((voice) => voice.voiceId === voiceId)?.events ?? []).map((event) => {
      const onset = (event.timestampNum / event.timestampDen) * 4;
      return event.kind === 'note' ? `${onset}:${event.pitch.step}${event.pitch.octave}` : `${onset}:r`;
    });
  };
  await expect.poll(() => summary(1)).toEqual(['0:C5', '1:D5', '2:r', '3:F5']);
  expect(await summary(2)).toEqual(['0:r', '2:E5', '3:r']);
  await expectNoDoctorIssues(page, 'after voice switches');
});

test('Delete and articulations on a second instrument leave the first instrument alone', async ({ page }) => {
  const quarters = ['C', 'D', 'E', 'F']
    .map((step) => `<note><pitch><step>${step}</step><octave>5</octave></pitch><duration>4</duration><voice>1</voice><type>quarter</type></note>`)
    .join('');
  const head = '<attributes><divisions>4</divisions><key><fifths>0</fifths></key><time><beats>4</beats><beat-type>4</beat-type></time><clef><sign>G</sign><line>2</line></clef></attributes>';
  const duet = `<?xml version="1.0" encoding="UTF-8"?>
<score-partwise version="4.0"><part-list><score-part id="P1"><part-name>Flute</part-name></score-part><score-part id="P2"><part-name>Oboe</part-name></score-part></part-list>
<part id="P1"><measure number="1">${head}${quarters}</measure></part>
<part id="P2"><measure number="1">${head}${quarters}</measure></part>
</score-partwise>`;
  await bootWithScore(page, duet, { strictDoctor: true });
  const part = async (partIndex: number) => ((await readCurrentCore(page)).score.parts[partIndex].staves[0].measures[0].voices[0]?.events ?? [])
    .map((event) => (event.kind === 'note' ? `${event.pitch.step}${(event.articulations ?? []).join('+')}` : 'r'));
  // Noteheads render part by part: 0 to 3 are the flute, 4 to 7 the oboe.
  await clickRenderedNotehead(page, 5);
  await page.keyboard.press('Shift+S');
  await expect.poll(() => part(1)).toEqual(['C', 'Dstaccato', 'E', 'F']);
  expect(await part(0)).toEqual(['C', 'D', 'E', 'F']);
  await clickRenderedNotehead(page, 6);
  await page.keyboard.press('Delete');
  await expect.poll(() => part(1)).toEqual(['C', 'Dstaccato', 'r', 'F']);
  expect(await part(0)).toEqual(['C', 'D', 'E', 'F']);
  await expectNoDoctorIssues(page, 'after edits in the second instrument');
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
  expect(initialNotehead).not.toBeNull();
  // The document changes before the score is drawn again: wait until the canvas shows this revision,
  // then read the notehead. Read during the re-render, its node is detached and has no box (F37).
  await expect.poll(() => page.getByTestId('score-canvas').evaluate((element) => (
    (element as HTMLElement).dataset.documentRevision === (element as HTMLElement).dataset.renderedRevision
  ))).toBe(true);
  let respelledNotehead: { x: number; y: number; width: number; height: number } | null = null;
  await expect.poll(async () => {
    respelledNotehead = await page.locator('[data-testid="score-canvas"] .vf-notehead').first()
      .boundingBox({ timeout: 1_000 }).catch(() => null);
    return respelledNotehead ? Math.abs(respelledNotehead.y - initialNotehead!.y) : -1;
  }, { message: 'the respelled notehead is drawn on another staff position' }).toBeGreaterThan(3);
  expect(respelledNotehead).not.toBeNull();
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


test('typing spaces in editable text preserves text and transport', async ({ page }) => {
  await bootWithScore(page);
  const initialXml = await readCurrentXml(page);
  for (const tag of ['input', 'textarea', 'div']) {
    await page.evaluate((tag) => {
      const field = document.createElement(tag);
      field.id = 'space-focus-probe';
      if (tag === 'div') field.contentEditable = 'true';
      document.body.append(field);
      field.focus();
    }, tag);
    await page.keyboard.type('first second');
    const field = page.locator('#space-focus-probe');
    if (tag === 'div') await expect(field).toHaveText('first second');
    else await expect(field).toHaveValue('first second');
    expect((await readE2EState(page))?.playbackState).toBe('stopped');
    expect(await readCurrentXml(page)).toBe(initialXml);
    await field.evaluate((element) => element.remove());
  }
  expect(await playbackStarts(page)).toHaveLength(0);
  await page.getByTestId('score-viewport').focus();
  await page.keyboard.press('Space');
  await expect.poll(async () => (await readE2EState(page))?.playbackState).toBe('playing');
  await page.keyboard.press('Space');
  await expect.poll(async () => (await readE2EState(page))?.playbackState).toBe('paused');
});

test('text-field Undo and Redo preserve score history', async ({ page }) => {
  await bootWithScore(page);
  const initialXml = await readCurrentXml(page);
  await clickRenderedNotehead(page, 0);
  await page.keyboard.press('ArrowUp');
  await expect.poll(() => readCurrentXml(page)).not.toBe(initialXml);
  const editedXml = await readCurrentXml(page);
  // Exercise native editing targets without relying on a particular panel layout.
  for (const tag of ['input', 'textarea', 'div']) {
    await page.evaluate((tag) => {
      const field = document.createElement(tag);
      field.id = 'history-focus-probe';
      if (tag === 'div') field.contentEditable = 'true';
      document.body.append(field);
      field.focus();
    }, tag);
    await page.keyboard.type('draft');
    await page.keyboard.press('Control+z');
    expect(await readCurrentXml(page)).toBe(editedXml);
    await page.keyboard.press('Control+Shift+z');
    expect(await readCurrentXml(page)).toBe(editedXml);
    await page.locator('#history-focus-probe').evaluate((field) => field.remove());
  }
  await page.keyboard.press('Control+z');
  await expect.poll(() => readCurrentXml(page)).toBe(initialXml);
  await page.keyboard.press('Control+Shift+z');
  await expect.poll(() => readCurrentXml(page)).toBe(editedXml);
});


test('Electron menu history routes to focused text before score history', async ({ page }) => {
  await page.addInitScript(() => {
    const listeners = new Set<(command: string) => void>();
    window.nexNoteElectron = {
      isElectron: true,
      onMenuCommand: (callback) => { listeners.add(callback); return () => { listeners.delete(callback); }; },
      onOpenFile: () => () => {},
      openFileDialog: async () => {},
      listUserTemplates: async () => [],
      readUserTemplateSample: async () => new ArrayBuffer(0),
      updateMenuState: () => {},
      performNativeEditCommand: async (command) => { document.execCommand(command); },
    };
    window.addEventListener('test-menu-history', (event) => {
      for (const callback of listeners) callback((event as CustomEvent<string>).detail);
    });
  });
  await bootWithScore(page);
  const initialXml = await readCurrentXml(page);
  await clickRenderedNotehead(page, 0);
  await page.keyboard.press('ArrowUp');
  await expect.poll(() => readCurrentXml(page)).not.toBe(initialXml);
  const editedXml = await readCurrentXml(page);
  const menu = async (command: string) => page.evaluate((command) => {
    window.dispatchEvent(new CustomEvent('test-menu-history', { detail: command }));
  }, command);
  await page.evaluate(() => {
    const field = document.createElement('textarea');
    field.id = 'history-focus-probe';
    document.body.append(field);
    field.focus();
  });
  await page.keyboard.type('draft');
  await menu('edit:undo');
  await expect(page.locator('#history-focus-probe')).toHaveValue('');
  expect(await readCurrentXml(page)).toBe(editedXml);
  await menu('edit:redo');
  await expect(page.locator('#history-focus-probe')).toHaveValue('draft');
  expect(await readCurrentXml(page)).toBe(editedXml);
  await page.locator('#history-focus-probe').evaluate((field) => field.remove());
  await menu('edit:undo');
  await expect.poll(() => readCurrentXml(page)).toBe(initialXml);
  await menu('edit:redo');
  await expect.poll(() => readCurrentXml(page)).toBe(editedXml);
});

for (const change of ['replace score', 'edit score', 'selection only'] as const) {
  test(`delayed layout cleanup respects ${change}`, async ({ page }) => {
    await bootWithScore(page);
    let held: Route | undefined;
    await page.route('**/api/chat', (route) => { held = route; });
    const dialogs: string[] = [];
    page.on('dialog', async (dialog) => { dialogs.push(dialog.type()); await dialog.accept(); });
    const layout = page.getByRole('button', { name: 'Tidy up score layout with AI', exact: true });
    await layout.click();
    await expect.poll(() => Boolean(held)).toBe(true);
    if (change === 'replace score') {
      await page.evaluate((xml) => {
        (window as typeof window & { __NEX_NOTE_E2E_LOAD_XML__: (xml: string, name: string) => void })
          .__NEX_NOTE_E2E_LOAD_XML__(xml, 'replacement.musicxml');
      }, buildFourMeasurePlaybackFixtureXml());
      await expect.poll(async () => (await readCurrentCore(page)).score.parts[0].staves[0].measures.length).toBe(4);
    } else {
      await clickRenderedNotehead(page, 0);
      if (change === 'edit score') await page.keyboard.press('ArrowUp');
    }
    const current = await readCurrentXml(page);
    await held!.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        commands: [{ type: 'setPageBreak', measureNumber: 2 }],
        requiresConfirmation: true,
        explanation: 'Page break prepared for the original score',
        affectedMeasures: [2],
        plan: ['Add page break'],
      }),
    });
    await expect(layout).toBeEnabled();
    if (change !== 'selection only') {
      expect(await readCurrentXml(page)).toBe(current);
      expect(dialogs).not.toContain('confirm');
    } else {
      await expect.poll(async () => (await readCurrentCore(page)).score.parts[0].staves[0].measures[1].print?.newPage).toBe(true);
      const formatted = await readCurrentXml(page);
      expect(dialogs).toEqual(['confirm']);
      await page.keyboard.press('Control+z');
      await expect.poll(() => readCurrentXml(page)).toBe(current);
      await page.keyboard.press('Control+Shift+z');
      await expect.poll(() => readCurrentXml(page)).toBe(formatted);
    }
  });
}


test('closing the score cancels a pending note audition', async ({ page }) => {
  await bootWithScore(page);
  await page.evaluate(() => {
    const probe = window as typeof window & {
      __NEX_NOTE_E2E_INSTRUMENT_LOADER__?: (...args: unknown[]) => unknown;
      __releaseAudition?: () => void;
      __auditionWaiting?: boolean;
      __auditionStarts?: number;
    };
    probe.__auditionStarts = 0;
    probe.__NEX_NOTE_E2E_INSTRUMENT_LOADER__ = () => new Promise((resolve) => {
      probe.__auditionWaiting = true;
      probe.__releaseAudition = () => resolve({
        start: () => { probe.__auditionStarts! += 1; return { stop() {} }; },
        stop() {},
      });
    });
  });
  await clickRenderedNotehead(page, 0);
  await expect.poll(() => page.evaluate(() => (window as typeof window & { __auditionWaiting?: boolean }).__auditionWaiting)).toBe(true);
  await page.keyboard.press('Control+w');
  await expect.poll(async () => (await readE2EState(page))?.xml).toBe('');
  await page.evaluate(async () => {
    (window as typeof window & { __releaseAudition?: () => void }).__releaseAudition?.();
    await new Promise((resolve) => setTimeout(resolve, 100));
  });
  expect(await page.evaluate(() => (window as typeof window & { __auditionStarts?: number }).__auditionStarts)).toBe(0);
});


test('closing the score cancels an audition waiting for MIDI', async ({ page }) => {
  let held: Route | undefined;
  await page.route('**/api/midi', (route) => { held = route; });
  await bootWithScore(page);
  await clickRenderedNotehead(page, 0);
  await expect.poll(() => Boolean(held)).toBe(true);
  await page.keyboard.press('Control+w');
  await expect.poll(async () => (await readE2EState(page))?.xml).toBe('');
  await held!.fulfill({ status: 200, contentType: 'audio/midi', body: buildMidiBody() });
  await page.evaluate(() => new Promise((resolve) => setTimeout(resolve, 100)));
  expect(await playbackStarts(page)).toHaveLength(0);
});

test('eight-bar keyboard replacement preserves correction and MusicXML reopen', async ({ page }, testInfo) => {
  test.setTimeout(120_000);
  const base = buildNotationToolsFixtureXml();
  const firstMeasure = /<measure number="1">([\s\S]*?)<\/measure>/.exec(base)![1];
  const fixture = base.replace(/<measure number="1">[\s\S]*<\/measure>/, Array.from({ length: 8 }, (_, i) =>
    `<measure number="${i + 1}">${i ? firstMeasure.replace(/<attributes>[\s\S]*?<\/attributes>/, '') : firstMeasure}</measure>`
  ).join(''));
  await bootWithScore(page, fixture);
  await page.keyboard.press('Control+Home');
  await page.keyboard.press('N');
  const keys = ['C', 'D', 'E', 'F', 'G', '0', 'A', 'B', 'C', 'B', 'A', 'G', 'F', 'G', 'A', 'B', 'C', 'D', 'E', 'F', 'G', 'G', 'A', 'B', 'C', 'D', 'E', 'F', 'G', 'F', 'E', 'D'];
  for (const key of keys) await page.keyboard.press(key);
  const readPassage = async () => (await readCurrentCore(page)).score.parts[0].staves[0].measures
    .map(m => m.voices[0].events.map(e => e.kind === 'note' ? e.pitch.step : '0'));
  await expect.poll(readPassage).toEqual(Array.from({ length: 8 }, (_, i) => keys.slice(i * 4, i * 4 + 4)));
  await expect.poll(() => readMainVoiceMidi(page)).toEqual([60,62,64,65,67,null,69,71,72,71,69,67,65,67,69,71,72,74,76,77,79,79,81,83,84,86,88,89,91,89,88,86]);
  const beforeCorrection = await readCurrentXml(page);
  await page.keyboard.press('ArrowUp');
  await expect.poll(() => readCurrentXml(page)).not.toBe(beforeCorrection);
  const corrected = await readCurrentXml(page);
  await page.keyboard.press('Control+z');
  await expect.poll(() => readCurrentXml(page)).toBe(beforeCorrection);
  await page.keyboard.press('Control+Shift+z');
  await expect.poll(() => readCurrentXml(page)).toBe(corrected);
  const expected = await readPassage();
  const expectedMidi = await readMainVoiceMidi(page);
  expect(expectedMidi.at(-1)).toBe(87);
  const downloadPromise = page.waitForEvent('download');
  await page.getByTitle('Download .mxl', { exact: true }).focus();
  await page.keyboard.press('Enter');
  const download = await downloadPromise;
  const exported = testInfo.outputPath('eight-bars.mxl');
  await download.saveAs(exported);
  await page.keyboard.press('Control+w');
  await expect.poll(async () => (await readE2EState(page))?.xml).toBe('');
  await page.locator('input[type="file"]').first().setInputFiles(exported);
  // Reopening .mxl runs convert, layout-cleanup and apply-operations routes in
  // sequence; on a cold dev server their first compile alone can exceed 5s.
  await expect.poll(async () => (await readE2EState(page))?.xml ?? '', { timeout: 30_000 }).not.toBe('');
  await expect.poll(readPassage).toEqual(expected);
  await expect.poll(() => readMainVoiceMidi(page)).toEqual(expectedMidi);
  await expectNoDoctorIssues(page, 'eight-bar keyboard passage reopen');
});

test('keyboard passage 1 (mixed values, accidentals, tie, triplet, chord, grace, dynamic, slur, accent) enters in the browser with no corrections', async ({ page }) => {
  const measures = Array.from({ length: 8 }, (_, index) => `<measure number="${index + 1}">${index === 0 ? '<attributes><divisions>4</divisions><key><fifths>0</fifths></key><time><beats>4</beats><beat-type>4</beat-type></time><clef><sign>G</sign><line>2</line></clef></attributes>' : ''}<note><rest measure="yes"/><duration>16</duration><voice>1</voice><type>whole</type></note></measure>`).join('');
  const fluteXml = `<?xml version="1.0" encoding="UTF-8"?>
<score-partwise version="4.0"><part-list><score-part id="P1"><part-name>Flute</part-name></score-part></part-list><part id="P1">${measures}</part></score-partwise>`;
  await bootWithScore(page, fluteXml, { strictDoctor: true });
  await page.keyboard.press('Control+Home');
  // The browser sends the US layout's key and code values; Playwright names keys by physical code.
  const playwrightKey: Record<string, string> = {
    '+': 'Shift+Equal', '-': 'Minus', '/': 'Slash', '.': 'Period', 'Shift+v': 'Shift+v',
    'Alt+.': 'Alt+Period', 'Cmd+3': 'Control+3', 'Shift+e': 'Shift+e', 'Shift+g': 'Shift+g',
  };
  for (const token of PASSAGE_1.split(/\s+/)) await page.keyboard.press(playwrightKey[token] ?? token);
  await expect.poll(async () => summarize(await readCurrentXml(page)), { timeout: 15_000 }).toEqual(PASSAGE_1_EXPECTED);
  await expectNoDoctorIssues(page, 'keyboard passage 1');
});
