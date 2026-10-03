import fs from 'node:fs';
import { test, expect, type Page } from '@playwright/test';
import { syntheticScore } from '../scripts/benchmark-note-entry';
import { buildDocumentState, applyDocumentCommands } from '../src/score-core/commands/apply-document-commands';
import { importMusicXmlToCore } from '../src/musicxml-adapter/import/import-musicxml';
const artifactDirectory = process.env.NEX_QUALITY_OUTPUT ?? '.nex/note-entry-quality/finalization';

async function xml(page: Page) { return page.evaluate(() => (window as any).__NEX_NOTE_E2E_STATE__?.xml ?? ''); }
async function boot(page: Page, source = syntheticScore(3)) {
  await page.addInitScript(source => {
    localStorage.setItem('nex-note:e2e-boot', JSON.stringify({ xml: source, filename: 'synthetic-quality.musicxml' }));
    (window as any).__NEX_NOTE_MEASURE_INPUT__ = true;
  }, source);
  await page.goto('/nex-note-app/');
  await expect(page.locator('[data-testid="score-canvas"] .vf-notehead').first()).toBeVisible({ timeout: 30000 });
  await page.locator('[data-testid="score-canvas"] .vf-notehead').first().click();
  await page.getByTestId('advanced-note-input').locator('summary').click();
}
async function undo(page: Page) { await page.locator('button[title^="Undo ("]:visible').first().click(); }
async function redo(page: Page) { await page.locator('button[title^="Redo ("]:visible').first().click(); }

test('custom nested tuplet UI renders both levels and restores one transaction at a time', async ({ page }) => {
  await boot(page);
  const before = await xml(page);
  await page.getByLabel('Tuplet actual', { exact: true }).fill('5');
  await page.getByRole('button', { name: 'Divide selected unit', exact: true }).click();
  await expect.poll(async () => importMusicXmlToCore(await xml(page)).tuplets.length).toBe(1);
  const outer = await xml(page);
  await page.getByLabel('Tuplet actual', { exact: true }).fill('3');
  await page.getByRole('button', { name: 'Divide selected unit', exact: true }).click();
  await expect.poll(async () => importMusicXmlToCore(await xml(page)).tuplets.length).toBe(2);
  await expect(page.locator('[data-testid="score-canvas"] svg').first()).toBeVisible();
  await expect(page.getByText(/Preview error:/)).toHaveCount(0);
  await expect(page.locator('[data-nex-tuplet] text')).toHaveText(['5:2', '3:2']);
  const nested = await xml(page);
  await undo(page); await expect.poll(() => xml(page)).toBe(outer);
  await undo(page); await expect.poll(() => xml(page)).toBe(before);
  await redo(page); await redo(page); await expect.poll(() => xml(page)).toBe(nested);
  await page.getByLabel('Tuplet unit pitch', { exact: true }).selectOption('D');
  await page.getByRole('button', { name: 'Set unit pitch', exact: true }).click();
  await page.getByLabel('Tuplet unit pitch', { exact: true }).selectOption('F');
  await page.getByRole('button', { name: 'Add unit chord tone', exact: true }).click();
  await expect.poll(async () => importMusicXmlToCore(await xml(page)).tuplets.map(t => t.eventIds.length)).toEqual([8,4]);
  fs.mkdirSync(artifactDirectory, { recursive: true });
  await expect(page.locator('[data-nex-tuplet] text')).toHaveText(['5:2', '3:2']);
  for (const label of await page.locator('[data-nex-tuplet] text').all()) {
    const box = await label.boundingBox(); const canvas = await page.getByTestId('score-canvas').boundingBox();
    expect(box).not.toBeNull(); expect(box!.y).toBeGreaterThanOrEqual(canvas!.y); expect(box!.x).toBeGreaterThan(canvas!.x);
  }
  fs.writeFileSync(`${artifactDirectory}/nested-render.svg`, await page.locator('[data-testid=score-canvas] svg').first().evaluate(e => e.outerHTML));
  await page.screenshot({ path: `${artifactDirectory}/advanced-desktop.png` });
  await page.getByRole('button', { name: 'Make unit rest', exact: true }).click();
  await expect.poll(async () => importMusicXmlToCore(await xml(page)).tuplets.map(t => t.eventIds.length)).toEqual([7,3]);
  await undo(page);
  await expect.poll(async () => importMusicXmlToCore(await xml(page)).tuplets.map(t => t.eventIds.length)).toEqual([8,4]);
});

test('nested brackets survive print preview, resizing and actual PDF output before printing is released', async ({ page }) => {
  await boot(page);
  await page.getByLabel('Tuplet actual', { exact: true }).fill('5');
  await page.getByRole('button', { name: 'Divide selected unit', exact: true }).click();
  await page.getByLabel('Tuplet actual', { exact: true }).fill('3');
  await page.getByRole('button', { name: 'Divide selected unit', exact: true }).click();
  await expect(page.locator('[data-nex-tuplet] text')).toHaveText(['5:2', '3:2']);
  const before = await xml(page);
  await page.evaluate(() => {
    (window as any).printEvidence = [];
    window.print = () => { (window as any).printEvidence.push({ labels: [...document.querySelectorAll('.nex-print-preview [data-nex-tuplet] text')].map(e => e.textContent), notes: document.querySelectorAll('.nex-print-preview .vf-notehead').length }); };
  });
  await page.locator('button[title="Print score"]:visible').first().click();
  await expect.poll(() => page.evaluate(() => (window as any).printEvidence.length)).toBe(1);
  expect(await page.evaluate(() => (window as any).printEvidence[0].labels)).toEqual(['5:2', '3:2']);
  const labels = page.locator('.nex-print-preview [data-nex-tuplet] text');
  await expect(labels).toHaveText(['5:2', '3:2']);
  await page.setViewportSize({ width: 1024, height: 900 });
  await expect(labels).toHaveText(['5:2', '3:2']);
  const geometry = await labels.evaluateAll(elements => elements.map(element => {
    const box = element.getBoundingClientRect(); const svg = element.closest('svg')!.getBoundingClientRect();
    return { x: box.x - svg.x, y: box.y - svg.y, right: box.right - svg.x, bottom: box.bottom - svg.y, width: svg.width, height: svg.height };
  }));
  for (const box of geometry) { expect(box.x).toBeGreaterThanOrEqual(0); expect(box.y).toBeGreaterThanOrEqual(0); expect(box.right).toBeLessThanOrEqual(box.width); expect(box.bottom).toBeLessThanOrEqual(box.height); }
  expect(geometry[0]!.bottom).toBeLessThan(geometry[1]!.y);
  fs.mkdirSync(artifactDirectory, { recursive: true });
  fs.writeFileSync(`${artifactDirectory}/print-geometry.json`, JSON.stringify(geometry, null, 2));
  await page.screenshot({ path: `${artifactDirectory}/nested-print-preview.png`, fullPage: true });
  await page.emulateMedia({ media: 'print' });
  await expect.poll(() => page.locator('.nex-print-preview svg').evaluateAll(svgs => svgs.every(svg => svg.getBoundingClientRect().width <= svg.parentElement!.parentElement!.getBoundingClientRect().width + 1))).toBe(true);
  await page.pdf({ path: `${artifactDirectory}/nested-print.pdf`, format: 'A4', printBackground: true });
  expect(await xml(page)).toBe(before);
});

test('bounded rhythm edit shifts only the chosen voice and rejects an occupied stop boundary without history', async ({ page }) => {
  const state = buildDocumentState(syntheticScore(3, 2));
  const withRoom = applyDocumentCommands(state, [{ type: 'clearMeasureVoice', measureNumber: 2, staffIndex: 1, voiceId: 1 }]);
  await boot(page, withRoom.xml);
  const before = await xml(page);
  const initial = importMusicXmlToCore(before);
  await page.getByLabel('Rhythm stop bar', { exact: true }).fill('2');
  await page.getByRole('button', { name: 'Insert time', exact: true }).click();
  await expect.poll(() => xml(page)).not.toBe(before);
  const after = importMusicXmlToCore(await xml(page));
  expect(after.score.parts[1]).toEqual(initial.score.parts[1]);
  await undo(page); await expect.poll(() => xml(page)).toBe(before);
  await page.getByLabel('Rhythm stop bar', { exact: true }).fill('1');
  await page.getByRole('button', { name: 'Insert time', exact: true }).click();
  await expect(page.getByTestId('advanced-note-input')).toContainText('Music would pass the stop bar');
  expect(await xml(page)).toBe(before);
});

test('grace sequence UI edits pitches and ordering while the main notes retain duration', async ({ page }) => {
  await boot(page);
  await page.getByRole('button', { name: 'Add grace', exact: true }).click();
  await expect.poll(async () => importMusicXmlToCore(await xml(page)).graceNotes.length).toBe(1);
  await page.getByRole('button', { name: 'Add grace', exact: true }).click();
  await expect.poll(async () => importMusicXmlToCore(await xml(page)).graceNotes.length).toBe(2);
  await page.getByLabel('Grace note', { exact: true }).selectOption({ index: 1 });
  await page.getByLabel('Grace pitch', { exact: true }).selectOption('D');
  await page.getByRole('button', { name: 'later', exact: true }).click();
  const core = importMusicXmlToCore(await xml(page));
  const notes = core.score.parts[0]!.staves[0]!.measures[0]!.voices[0]!.events;
  expect(notes.slice(0,3).map(e => [e.kind === 'note' ? e.pitch.step : '', e.durationDivisions/e.timestampDen])).toEqual([['C',0],['D',0],['C',.125]]);
  await page.getByRole('button', { name: 'Delete grace', exact: true }).click();
  await expect.poll(async () => importMusicXmlToCore(await xml(page)).graceNotes.length).toBe(1);
  await undo(page); await expect.poll(async () => importMusicXmlToCore(await xml(page)).graceNotes.length).toBe(2);
});

for (const inputByDuration of [false, true]) test(`MIDI device selection and physical release preserve ${inputByDuration ? 'pitch-before-duration' : 'duration-before-pitch'} entry`, async ({ page }) => {
  await page.addInitScript(() => {
    const inputs = new Map(['first','second'].map(id => [id, { id, name: `Synthetic ${id}`, state: 'connected', onmidimessage: null as any }]));
    const access = { inputs, onstatechange: null as any };
    Object.defineProperty(navigator, 'requestMIDIAccess', { configurable: true, value: async () => access });
    (window as any).midiTest = { send: (id: string, bytes: number[]) => inputs.get(id)?.onmidimessage?.({ data: bytes, timeStamp: performance.now() }), access };
  });
  await boot(page);
  await page.getByTestId('score-viewport').focus(); await page.keyboard.press('N');
  await page.getByRole('button', { name: 'Enable MIDI', exact: true }).click();
  await expect(page.getByLabel('MIDI input device', { exact: true })).toBeVisible();
  await page.getByLabel('MIDI input device', { exact: true }).selectOption('second');
  if (inputByDuration) { await page.getByTestId('score-viewport').focus(); await page.keyboard.press('M'); }
  const before = await xml(page);
  await page.evaluate(() => {
    const midi = (window as any).midiTest; const port = midi.access.inputs.get('second');
    midi.send('second', [0x90, 71, 90]); port.state = 'disconnected'; midi.access.onstatechange();
  });
  await expect(page.getByTestId('advanced-note-input')).toContainText('MIDI: waiting');
  await page.evaluate(() => { const midi = (window as any).midiTest; midi.access.inputs.get('second').state = 'connected'; midi.access.onstatechange(); midi.send('second', [0x80, 71, 0]); });
  expect(await xml(page)).toBe(before);
  await page.evaluate(() => { const midi = (window as any).midiTest; midi.send('first', [0x90, 80, 90]); midi.send('first', [0x80, 80, 0]); midi.send('second', [0x90, 60, 90]); midi.send('second', [0x90, 64, 90]); midi.send('second', [0x90, 67, 90]); });
  expect(await xml(page)).toBe(before);
  await page.evaluate(() => { const midi = (window as any).midiTest; midi.send('second', [0x80,60,0]); midi.send('second', [0x80,64,0]); midi.send('second', [0x80,67,0]); });
  if (inputByDuration) {
    expect(await xml(page)).toBe(before);
    await page.getByTestId('score-viewport').focus(); await page.keyboard.press('4');
  }
  await expect.poll(() => xml(page)).not.toBe(before);
  const core = importMusicXmlToCore(await xml(page));
  expect(core.chordGroups.some(group => group.eventIds.length === 3)).toBe(true);
  await undo(page); await expect.poll(() => xml(page)).toBe(before);
});

test('MIDI recording applies and requantizes the same captured take with independent Undo actions', async ({ page }) => {
  await page.addInitScript(() => {
    const port = { id: 'recording', name: 'Synthetic recording', state: 'connected', onmidimessage: null as any };
    Object.defineProperty(navigator, 'requestMIDIAccess', { configurable: true, value: async () => ({ inputs: new Map([[port.id, port]]), onstatechange: null }) });
    (window as any).recordingPort = port;
  });
  await boot(page, syntheticScore(3).replaceAll('<duration>2</duration>', '<duration>1</duration>').replaceAll('<type>eighth</type>', '<type>16th</type>'));
  await page.getByTestId('score-viewport').focus(); await page.keyboard.press('N');
  await page.getByRole('button', { name: 'Enable MIDI', exact: true }).click();
  await page.getByLabel('Recording count-in', { exact: true }).fill('0');
  await page.getByLabel('Recording tempo', { exact: true }).fill('120');
  const before = await xml(page);
  await page.getByRole('button', { name: 'Record MIDI', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Stop take', exact: true })).toBeVisible();
  await page.evaluate(() => {
    const at = performance.now(); const port = (window as any).recordingPort;
    port.onmidimessage({ data: [0x90, 72, 90], timeStamp: at });
    port.onmidimessage({ data: [0x80, 72, 0], timeStamp: at + 320 });
  });
  await page.getByRole('button', { name: 'Stop take', exact: true }).click();
  expect(await xml(page)).toBe(before);
  await page.getByRole('button', { name: 'Apply / requantize take', exact: true }).click();
  await expect.poll(() => xml(page)).not.toBe(before);
  const applied = await xml(page);
  await page.getByLabel('Recording quantization', { exact: true }).selectOption('1');
  await page.getByRole('button', { name: 'Apply / requantize take', exact: true }).click();
  await expect.poll(() => xml(page)).not.toBe(applied);
  const corrected = await xml(page);
  await undo(page); await expect.poll(() => xml(page)).toBe(applied);
  await undo(page); await expect.poll(() => xml(page)).toBe(before);
  await redo(page); await redo(page); await expect.poll(() => xml(page)).toBe(corrected);
  // Undo and make a different edit: the numeric revision can be reused, but
  // the previous take must not be allowed to replace this independent branch.
  await undo(page);
  await page.getByLabel('Automatic cautionaries', { exact: true }).selectOption('always');
  const independent = await xml(page);
  expect(independent).not.toBe(applied);
  await page.getByRole('button', { name: 'Apply / requantize take', exact: true }).click();
  await expect(page.getByTestId('advanced-note-input')).toContainText('The score changed after this take');
  expect(await xml(page)).toBe(independent);
});

test('rapid MIDI arrivals retain every pitch in arrival order before a renderer catches up', async ({ page }) => {
  test.setTimeout(120000);
  await page.addInitScript(() => {
    const port = { id: 'burst', name: 'Synthetic burst', state: 'connected', onmidimessage: null as any };
    Object.defineProperty(navigator, 'requestMIDIAccess', { configurable: true, value: async () => ({ inputs: new Map([[port.id, port]]), onstatechange: null }) });
    (window as any).burstPort = port;
  });
  await boot(page, syntheticScore(128, 4));
  await page.getByTestId('score-viewport').focus(); await page.keyboard.press('N'); await page.keyboard.press('4');
  await page.getByRole('button', { name: 'Enable MIDI', exact: true }).click();
  const before = importMusicXmlToCore(await xml(page));
  const sequence = Array.from({ length: 24 }, (_, i) => 60 + i % 12);
  await page.evaluate(sequence => {
    for (const midi of sequence) {
      const port = (window as any).burstPort;
      port.onmidimessage({ data: [0x90, midi, 80], timeStamp: performance.now() });
      port.onmidimessage({ data: [0x80, midi, 0], timeStamp: performance.now() });
    }
  }, sequence);
  const after = importMusicXmlToCore(await xml(page));
  const pitches = after.score.parts[0]!.staves[0]!.measures.flatMap(m => m.voices[0]!.events).filter(e => e.kind === 'note');
  const midi = (e: typeof pitches[number]) => 12 * (e.pitch.octave + 1) + ({ C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 }[e.pitch.step as 'C'] ?? 0) + e.pitch.alter;
  expect(pitches.slice(0, 24).map(midi)).toEqual(sequence);
  expect(after.score.parts.slice(1)).toEqual(before.score.parts.slice(1));
  expect(await page.locator('[data-testid=score-canvas] .vf-notehead').count()).toBeGreaterThanOrEqual(4096);
});

for (const [size, measures, parts] of [['small',4,1],['medium',32,2],['large',128,4]] as const) {
  test(`software latency corpus ${size}`, async ({ page }) => {
    test.setTimeout(180000);
    await boot(page, syntheticScore(measures, parts));
    await page.getByTestId('advanced-note-input').locator('summary').click();
    await page.getByTestId('score-viewport').focus(); await page.keyboard.press('N'); await page.keyboard.press('4');
    await page.evaluate(() => (window as any).__NEX_NOTE_INPUT_METRICS__?.reset());
    for (let index = 0; index < 20; index++) {
      const before = await xml(page);
      await page.keyboard.press('+');
      await page.keyboard.press('A');
      await expect.poll(() => xml(page), { timeout: 30000 }).not.toBe(before);
      await expect(page.locator('[data-testid="score-canvas"] .vf-notehead').first()).toBeVisible({ timeout: 30000 });
      await expect.poll(() => page.evaluate(() => (window as any).__NEX_NOTE_INPUT_METRICS__?.read()['input-to-note-frame']?.length ?? 0), { timeout: 30000 }).toBeGreaterThan(index);
    }
    const metrics = await page.evaluate(() => ({ userAgent: navigator.userAgent, values: (window as any).__NEX_NOTE_INPUT_METRICS__?.read() }));
    fs.mkdirSync('.nex/note-entry-quality', { recursive: true });
    fs.mkdirSync(process.env.NEX_QUALITY_OUTPUT ?? '.nex/note-entry-quality', { recursive: true });
    fs.writeFileSync(`${process.env.NEX_QUALITY_OUTPUT ?? '.nex/note-entry-quality'}/browser-${size}.json`, JSON.stringify({ size, measures, parts, ...metrics }, null, 2));
    expect(metrics.values?.['semantic-command']?.length).toBeGreaterThan(0);
  });
}
