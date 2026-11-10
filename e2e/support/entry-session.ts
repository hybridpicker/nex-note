import fs from 'node:fs/promises';
import path from 'node:path';

import { expect } from '@playwright/test';
import { Midi } from '@tonejs/midi';
import type { Page, Route, TestInfo } from '@playwright/test';

import { pinKeyboardLayout, type PinnedKeyboardLayout } from './keyboard-layout';
import { importMusicXmlToCore } from '../../src/musicxml-adapter/import/import-musicxml';

/*
 * Browser session driver for note entry (T2, docs/note-entry-mastery-ledger.md).
 *
 * Boots a synthetic score in the real app, sends keys and pointer actions, and reads back what a
 * musician sees and what the document holds: the stored MusicXML, the selection and input cursor, the
 * mouse ghost, the keyboard caret, the armed note-input state and the position of the score canvas.
 * Every step can save a screenshot, so a play-through leaves a picture per action.
 *
 * Key scripts use the same tokens as `test/support/app-harness.ts`: space-separated keys, `Cmd+`
 * for the platform modifier (`Cmd+z`, `Cmd+Alt+2`), `Shift+e`, `ArrowLeft`.
 */

export const MOD = 'Control';

export interface EntryGhost {
  pitch: string | null;
  measure: number | null;
  staff: number | null;
  voice: number | null;
  timestamp: string | null;
  mode: string | null;
  /** Centre of the drawn ghost notehead in page coordinates. */
  x: number | null;
  y: number | null;
}

export interface EntryCaret {
  /** Bounding box in viewport coordinates. */
  x: number;
  y: number;
  width: number;
  height: number;
  measure: number | null;
  staff: number | null;
  voice: number | null;
  timestamp: string | null;
  /** True when the caret lies fully inside the visible score viewport. */
  inViewport: boolean;
}

export interface EntryArmedState {
  /** Text of every armed-state field that is on screen, keyed by field name. */
  fields: Record<string, string>;
  visible: boolean;
}

export interface EntryCursor {
  measureNumber: number;
  staffIndex: number;
  voiceId: number;
  timestampNum: number;
  timestampDen: number;
  step?: string;
  octave?: number;
  alter?: number;
  isRest?: boolean;
}

export interface EntryState {
  xml: string;
  noteInputMode: boolean;
  chordInputMode: boolean;
  selectedDuration: string;
  selectedVoice: number;
  selectionCount: number;
  canUndo: boolean;
  canRedo: boolean;
  historyDepth: number;
  selectedNote: EntryCursor | null;
  noteInputAnchor: EntryCursor | null;
}

export interface EntryStep {
  index: number;
  action: string;
  screenshot: string | null;
}

export interface EntrySessionOptions {
  xml: string;
  name?: string;
  url?: string;
  /** Save a screenshot after every step (default true). */
  screenshots?: boolean;
  /** Keyboard layout the page reports (default `us`), so layout-dependent keys are deterministic. */
  layout?: PinnedKeyboardLayout;
  /** Milliseconds to wait for the app to settle after a step (default: until the render is idle). */
  settleTimeout?: number;
}

function toPlaywrightKey(token: string) {
  // `+` alone is the plus key; `Cmd++` is the modifier with the plus key.
  if (token === '+') return '+';
  const plusKey = token.endsWith('++');
  const parts = (plusKey ? token.slice(0, -2) : token).split('+').map((part) => (part === 'Cmd' ? MOD : part));
  return plusKey ? [...parts, '+'].join('+') : parts.join('+');
}

async function installPlaybackStubs(page: Page) {
  await page.addInitScript(() => {
    const target = window as typeof window & {
      __NEX_NOTE_E2E_PREVIEW_STARTS__?: Array<{ note: string | number }>;
      __NEX_NOTE_E2E_LOADED_INSTRUMENTS__?: string[];
      __NEX_NOTE_E2E_INSTRUMENT_LOADER__?: (_ac: AudioContext, instrument: string) => Promise<{ start: (note: string | number) => void; stop: () => void }>;
    };
    target.__NEX_NOTE_E2E_PREVIEW_STARTS__ = [];
    target.__NEX_NOTE_E2E_LOADED_INSTRUMENTS__ = [];
    target.__NEX_NOTE_E2E_INSTRUMENT_LOADER__ = async (_ac, instrument) => {
      target.__NEX_NOTE_E2E_LOADED_INSTRUMENTS__?.push(instrument);
      return {
        start(note) { target.__NEX_NOTE_E2E_PREVIEW_STARTS__?.push({ note }); },
        stop() {},
      };
    };
  });
}

/** A short MIDI file for `/api/midi`, so the transport has a length as it has in the running app. */
function buildMidiBody() {
  const midi = new Midi();
  midi.header.setTempo(96);
  const track = midi.addTrack();
  [60, 62, 64, 65].forEach((pitch, index) => track.addNote({ midi: pitch, time: index * 0.5, duration: 0.5, velocity: 0.8 }));
  return Buffer.from(midi.toArray());
}

async function mockStableRoutes(page: Page) {
  const midiBody = buildMidiBody();
  await page.route('**/api/midi', async (route: Route) => {
    await route.fulfill({ status: 200, contentType: 'audio/midi', body: midiBody });
  });
  await page.route('**/api/ollama-models', async (route: Route) => {
    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ models: [] }) });
  });
}

export class EntrySession {
  readonly steps: EntryStep[] = [];

  private constructor(
    readonly page: Page,
    private readonly testInfo: TestInfo,
    private readonly options: Required<Pick<EntrySessionOptions, 'screenshots'>> & EntrySessionOptions,
  ) {}

  /**
   * Boot the app with a synthetic score. `stubAudio: false` leaves the real instrument loader in
   * place, for cases that are about audio never blocking entry.
   */
  static async boot(page: Page, testInfo: TestInfo, options: EntrySessionOptions & { stubAudio?: boolean }) {
    await pinKeyboardLayout(page, options.layout ?? 'us');
    if (options.stubAudio !== false) await installPlaybackStubs(page);
    await mockStableRoutes(page);
    const fileName = options.name ?? 'entry-session.musicxml';
    await page.addInitScript(({ xml, name }: { xml: string; name: string }) => {
      if (window.top !== window) return;
      if (localStorage.getItem('nex-note:e2e-boot')) return;
      const now = Date.now();
      localStorage.setItem('nex-note:score-library', JSON.stringify([{
        id: 'seeded-score', name, xml, format: 'musicxml', sizeBytes: xml.length, measures: 1, parts: 1,
        favorite: false, createdAt: now, updatedAt: now, lastOpenedAt: now,
      }]));
      localStorage.setItem('nex-note:recent-files', JSON.stringify([{ name, timestamp: now, size: xml.length }]));
      localStorage.setItem('nex-note:e2e-boot', JSON.stringify({ xml, filename: name }));
    }, { xml: options.xml, name: fileName });
    // A separate script: the document element may not exist yet when init scripts run, and a throw
    // in the seeding script above would leave the app on its start screen.
    await page.addInitScript(() => {
      if (document.documentElement) document.documentElement.style.scrollBehavior = 'auto';
    });
    await page.goto(options.url ?? '/');
    await expect(page.getByTitle('Save as')).toBeVisible({ timeout: 15_000 });
    const session = new EntrySession(page, testInfo, { screenshots: true, ...options });
    await session.waitForScore();
    await session.record('boot');
    return session;
  }

  async waitForScore() {
    await expect(this.page.locator('[data-testid="score-canvas"] [data-measure-number], [data-measure-number]').first()).toBeVisible({ timeout: 15_000 });
    await expect(this.page.getByTestId('score-canvas')).toHaveAttribute('data-edit-map-measure-count', /^[1-9]\d*$/, { timeout: 15_000 });
    await this.page.getByTestId('score-viewport').focus();
  }

  // -------------------------------------------------------------------------------------------
  // Reading

  async state(): Promise<EntryState> {
    const state = await this.page.evaluate(() => (
      (window as typeof window & { __NEX_NOTE_E2E_STATE__?: unknown }).__NEX_NOTE_E2E_STATE__ ?? null
    ));
    if (!state) throw new Error('The app did not publish its E2E state');
    return state as EntryState;
  }

  async xml() {
    return (await this.state()).xml;
  }

  async core() {
    return importMusicXmlToCore(await this.xml());
  }

  /** One line per event of a voice: `m1@0 C5 quarter`, onsets in quarter notes, ties as `~`. */
  async voice(where: { partIndex?: number; staff?: number; voice?: number } = {}) {
    const core = await this.core();
    const part = core.score.parts[where.partIndex ?? 0];
    const staff = part?.staves.find((entry) => entry.staffIndex === (where.staff ?? 1));
    const out: string[] = [];
    for (const measure of staff?.measures ?? []) {
      const voice = measure.voices.find((entry) => entry.voiceId === (where.voice ?? 1));
      for (const event of voice?.events ?? []) {
        const onset = Math.round((event.timestampNum / Math.max(event.timestampDen, 1)) * 4 * 1000) / 1000;
        const value = `${event.durationType ?? '?'}${event.isDotted ? '.' : ''}`;
        if (event.kind === 'rest') {
          out.push(`m${measure.measureNumber}@${onset} r ${value}`);
          continue;
        }
        const pitch = (event as { pitch?: { step: string; octave: number; alter?: number } }).pitch;
        const alter = pitch?.alter ?? 0;
        const accidental = alter > 0 ? '#'.repeat(alter) : alter < 0 ? 'b'.repeat(-alter) : '';
        const tie = (event as { tieStart?: boolean }).tieStart ? '~' : '';
        out.push(`m${measure.measureNumber}@${onset} ${event.isChord ? '+' : ''}${pitch?.step ?? '?'}${accidental}${pitch?.octave ?? ''} ${value}${tie}`);
      }
    }
    return out;
  }

  /** The mouse ghost as drawn, or null when none is visible. */
  async ghost(): Promise<EntryGhost | null> {
    const ghost = this.page.getByTestId('ghost-note-preview');
    if (!(await ghost.count()) || !(await ghost.first().isVisible())) return null;
    return ghost.first().evaluate((element) => {
      const number = (name: string) => {
        const value = element.getAttribute(name);
        return value == null || value === '' ? null : Number(value);
      };
      return {
        pitch: element.getAttribute('data-ghost-pitch'),
        measure: number('data-ghost-measure'),
        staff: number('data-ghost-staff'),
        voice: number('data-ghost-voice'),
        timestamp: element.getAttribute('data-ghost-timestamp'),
        mode: element.getAttribute('data-ghost-mode'),
        x: number('data-ghost-notehead-center-x'),
        y: number('data-ghost-notehead-center-y'),
      };
    });
  }

  /** The note-input caret (`data-testid="note-input-caret"`), or null when none is drawn. */
  async caret(): Promise<EntryCaret | null> {
    const caret = this.page.getByTestId('note-input-caret');
    if (!(await caret.count()) || !(await caret.first().isVisible())) return null;
    const viewport = await this.page.getByTestId('score-viewport').boundingBox();
    const box = await caret.first().boundingBox();
    if (!box) return null;
    const attributes = await caret.first().evaluate((element) => ({
      measure: element.getAttribute('data-caret-measure'),
      staff: element.getAttribute('data-caret-staff'),
      voice: element.getAttribute('data-caret-voice'),
      timestamp: element.getAttribute('data-caret-timestamp'),
    }));
    const toNumber = (value: string | null) => (value == null || value === '' ? null : Number(value));
    const inViewport = Boolean(viewport)
      && box.x >= viewport!.x - 0.5
      && box.y >= viewport!.y - 0.5
      && box.x + box.width <= viewport!.x + viewport!.width + 0.5
      && box.y + box.height <= viewport!.y + viewport!.height + 0.5;
    return {
      ...box,
      measure: toNumber(attributes.measure),
      staff: toNumber(attributes.staff),
      voice: toNumber(attributes.voice),
      timestamp: attributes.timestamp,
      inViewport,
    };
  }

  /**
   * The armed note-input state as shown on screen (`data-testid="note-input-bar"`, one
   * `data-armed-field` per field: value, dot, accidental, voice, mode, tuplet).
   */
  async armed(): Promise<EntryArmedState> {
    const bar = this.page.getByTestId('note-input-bar');
    if (!(await bar.count()) || !(await bar.first().isVisible())) return { fields: {}, visible: false };
    const fields = await bar.first().evaluate((element) => {
      const out: Record<string, string> = {};
      element.querySelectorAll<HTMLElement>('[data-armed-field]').forEach((field) => {
        const rect = field.getBoundingClientRect();
        if (rect.width === 0 || rect.height === 0) return;
        out[field.dataset.armedField ?? ''] = field.dataset.armedValue ?? field.textContent?.trim() ?? '';
      });
      return out;
    });
    return { fields, visible: true };
  }

  /** Position of the score canvas in the page; it must not move under a resting pointer (F2). */
  async canvasBox() {
    const box = await this.page.getByTestId('score-canvas').boundingBox();
    if (!box) throw new Error('The score canvas has no box');
    return box;
  }

  /** Union box of a rendered measure of one staff (1-based), in page coordinates. */
  async measureBox(measureNumber: number, staffIndex = 1) {
    const selector = `[data-measure-number="${measureNumber}"][data-staff-index="${staffIndex}"], [data-measure-number="${measureNumber}"]`;
    // The score is re-rendered after an edit; a box read in between belongs to a detached node.
    for (let attempt = 0; attempt < 20; attempt += 1) {
      const locator = this.page.locator(selector).first();
      try {
        await locator.scrollIntoViewIfNeeded({ timeout: 1_000 });
        const box = await locator.boundingBox({ timeout: 1_000 });
        if (box && box.width > 0) return box;
      } catch {
        // Re-rendered meanwhile: read again.
      }
      await this.page.waitForTimeout(50);
    }
    throw new Error(`Measure ${measureNumber} is not rendered`);
  }

  async noteheadCenter(index: number) {
    const box = await this.page.locator('[data-testid="score-canvas"] .vf-notehead').nth(index).boundingBox();
    if (!box) throw new Error(`Notehead ${index} is not rendered`);
    return { x: box.x + box.width / 2, y: box.y + box.height / 2 };
  }

  // -------------------------------------------------------------------------------------------
  // Acting

  /** Press the keys of a script one by one. Each key is a recorded step. */
  async keys(script: string) {
    for (const token of script.trim().split(/\s+/).filter(Boolean)) {
      await this.page.keyboard.press(toPlaywrightKey(token));
      await this.settle();
      await this.record(`key ${token}`);
    }
  }

  /** Type keys at a fixed rate without waiting for the app between them (burst entry). */
  async burst(script: string, keysPerSecond: number) {
    const delay = 1000 / keysPerSecond;
    for (const token of script.trim().split(/\s+/).filter(Boolean)) {
      await this.page.keyboard.press(toPlaywrightKey(token));
      await this.page.waitForTimeout(delay);
    }
    await this.settle();
    await this.record(`burst ${keysPerSecond}/s`);
  }

  async move(x: number, y: number, label = 'move') {
    await this.page.mouse.move(x, y, { steps: 4 });
    await this.settle();
    await this.record(`${label} ${Math.round(x)},${Math.round(y)}`);
  }

  async click(x: number, y: number, options: { modifiers?: Array<'Shift' | 'Alt' | 'Control' | 'Meta'>; button?: 'left' | 'right'; label?: string } = {}) {
    for (const modifier of options.modifiers ?? []) await this.page.keyboard.down(modifier);
    await this.page.mouse.click(x, y, { button: options.button ?? 'left' });
    for (const modifier of [...(options.modifiers ?? [])].reverse()) await this.page.keyboard.up(modifier);
    await this.settle();
    await this.record(`${options.label ?? 'click'} ${Math.round(x)},${Math.round(y)}`);
  }

  async clickNotehead(index: number) {
    const centre = await this.noteheadCenter(index);
    await this.click(centre.x, centre.y, { label: `notehead ${index}` });
  }

  /** Wait until the document and the rendering have stopped changing. */
  async settle() {
    const timeout = this.options.settleTimeout ?? 4_000;
    const read = () => this.page.evaluate(() => {
      const state = (window as typeof window & { __NEX_NOTE_E2E_STATE__?: { xml?: string; historyDepth?: number } }).__NEX_NOTE_E2E_STATE__;
      const canvas = document.querySelector('[data-testid="score-canvas"]');
      return `${state?.xml?.length ?? 0}:${state?.historyDepth ?? 0}:${canvas?.getAttribute('data-render-revision') ?? ''}:${canvas?.querySelectorAll('.vf-notehead').length ?? 0}:${canvas?.getAttribute('aria-busy') ?? ''}`;
    });
    const deadline = Date.now() + timeout;
    let previous = await read();
    let stableSince = Date.now();
    while (Date.now() < deadline) {
      await this.page.waitForTimeout(40);
      const current = await read();
      if (current !== previous) {
        previous = current;
        stableSince = Date.now();
      } else if (Date.now() - stableSince >= 160) {
        return;
      }
    }
  }

  // -------------------------------------------------------------------------------------------
  // Evidence

  private async record(action: string) {
    const index = this.steps.length;
    let screenshot: string | null = null;
    if (this.options.screenshots) {
      const safe = action.replace(/[^a-zA-Z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 40);
      screenshot = this.testInfo.outputPath('steps', `${String(index).padStart(3, '0')}-${safe}.png`);
      await fs.mkdir(path.dirname(screenshot), { recursive: true });
      await this.page.screenshot({ path: screenshot });
    }
    this.steps.push({ index, action, screenshot });
  }

  /** Save a named screenshot outside the step sequence and return its path. */
  async shot(label: string) {
    const file = this.testInfo.outputPath('steps', `${label.replace(/[^a-zA-Z0-9]+/g, '-')}.png`);
    await fs.mkdir(path.dirname(file), { recursive: true });
    await this.page.screenshot({ path: file });
    return file;
  }
}
