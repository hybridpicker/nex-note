import fs from 'node:fs';
import { test, expect } from '@playwright/test';
import { syntheticScore } from '../scripts/benchmark-note-entry';
import { importMusicXmlToCore } from '../src/musicxml-adapter/import/import-musicxml';

// Run before and after runtime changes with the same browser, server and fixture.
// The instrument uses a real WebAudio buffer, preloaded locally, with no network.
for (const [size, measures, parts] of [['small', 4, 1], ['medium', 32, 2], ['large', 128, 4]] as const) {
  test(`complete software stages ${size}`, async ({ page }) => {
    test.setTimeout(360000);
    const sampleCount = Number(process.env.NEX_QUALITY_SAMPLES ?? 30);
    await page.addInitScript(source => {
      localStorage.setItem('nex-note:e2e-boot', JSON.stringify({ xml: source, filename: 'synthetic-latency.musicxml' }));
      localStorage.setItem('nex-note:input-audition', 'true');
      const w = window as any;
      w.__NEX_NOTE_MEASURE_INPUT__ = true;
      w.syntheticAudioStarts = [];
      let inputAt = 0;
      window.addEventListener('keydown', event => { if (/^[a-g]$/i.test(event.key)) inputAt = performance.now(); }, true);
      w.__NEX_NOTE_E2E_INSTRUMENT_LOADER__ = async (ac: AudioContext) => {
        const buffer = ac.createBuffer(1, ac.sampleRate / 10, ac.sampleRate);
        const samples = buffer.getChannelData(0);
        for (let i = 0; i < samples.length; i++) samples[i] = Math.sin(2 * Math.PI * 440 * i / ac.sampleRate) * .01;
        const sources = new Set<AudioBufferSourceNode>();
        w.syntheticInstrumentReady = true;
        return {
          start(_note: unknown, when: number) {
            const source = ac.createBufferSource(); source.buffer = buffer; source.connect(ac.destination);
            sources.add(source); source.onended = () => { sources.delete(source); source.disconnect(); };
            source.start(when);
            if (inputAt) w.syntheticAudioStarts.push(performance.now() - inputAt);
            return { stop: () => source.stop() };
          },
          stop() { for (const source of sources) source.stop(); sources.clear(); },
        };
      };
    }, syntheticScore(measures, parts));
    await page.goto('/nex-note-app/');
    const notes = page.locator('[data-testid=score-canvas] .vf-notehead');
    await expect(notes.first()).toBeVisible({ timeout: 60000 });
    await notes.first().click();
    await page.getByTestId('score-viewport').focus(); await page.keyboard.press('N'); await page.keyboard.press('4');
    await page.waitForFunction(() => (window as any).syntheticInstrumentReady);
    const read = () => page.evaluate(() => (window as any).__NEX_NOTE_INPUT_METRICS__.read());
    const reset = () => page.evaluate(() => (window as any).__NEX_NOTE_INPUT_METRICS__.reset());
    const xml = () => page.evaluate(() => (window as any).__NEX_NOTE_E2E_STATE__.xml as string);
    await reset();
    // Pointer preview is a separate non-mutating workload. Move between pitch
    // lanes at one real rendered onset, waiting for the published frame each time.
    const box = (await notes.first().boundingBox())!;
    const beforeHover = await xml();
    for (let i = 0; i < sampleCount + 4; i++) {
      const count = (await read())['input-to-preview-frame']?.length ?? 0;
      await page.mouse.move(box.x + box.width / 2, box.y + (i % 2 ? -16 : 16));
      await expect.poll(async () => (await read())['input-to-preview-frame']?.length ?? 0).toBeGreaterThan(count);
    }
    expect(await xml()).toBe(beforeHover);
    const preview = ((await read())['input-to-preview-frame'] as number[]).slice(4);
    await page.mouse.move(0, 0);
    await reset();
    await page.evaluate(() => { (window as any).syntheticAudioStarts = []; });
    const client = process.env.NEX_QUALITY_PROFILE ? await page.context().newCDPSession(page) : null;
    await client?.send('Profiler.enable'); await client?.send('Profiler.start');
    for (let i = 0; i < sampleCount + 4; i++) {
      const before = await xml();
      await page.keyboard.press('+'); await page.keyboard.press(i % 2 ? 'A' : 'F');
      await expect.poll(xml, { timeout: 30000 }).not.toBe(before);
      await expect.poll(async () => (await read())['input-to-note-frame']?.length ?? 0, { timeout: 30000 }).toBeGreaterThan(i);
    }
    const values = await read();
    const retained = Object.fromEntries(Object.entries(values).map(([stage, samples]) => [stage, (samples as number[]).slice(4)]));
    retained['input-to-preview-frame'] = preview;
    retained['input-to-audio-scheduled'] = await page.evaluate(() => (window as any).syntheticAudioStarts.slice(4));
    const summary = Object.fromEntries(Object.entries(retained).map(([stage, samples]) => {
      const sorted = [...samples].sort((a, b) => a - b);
      return [stage, { count: sorted.length, median: (sorted[Math.floor((sorted.length - 1) / 2)]! + sorted[Math.floor(sorted.length / 2)]!) / 2, p95: sorted[Math.ceil(sorted.length * .95) - 1], max: sorted.at(-1) }];
    }));
    const out = process.env.NEX_QUALITY_OUTPUT ?? '.nex/note-entry-quality/finalization';
    fs.mkdirSync(out, { recursive: true });
    if (client) fs.writeFileSync(`${out}/profile-${size}.json`, JSON.stringify((await client.send('Profiler.stop')).profile));
    fs.writeFileSync(`${out}/stages-${size}.json`, JSON.stringify({ size, measures, parts, instrument: 'preloaded synthetic WebAudio buffer; scheduling only', userAgent: await page.evaluate(() => navigator.userAgent), retained, summary }, null, 2));
    if (process.env.NEX_QUALITY_EXPECT_CACHE) await expect(page.getByTestId('score-canvas')).toHaveAttribute('data-glyph-bounds-cache', 'true');
    for (const stage of ['input-to-preview-frame', 'input-to-note-frame', 'input-to-audio-scheduled', 'layout-projection', 'osmd-load', 'osmd-render']) expect(retained[stage]?.length, stage).toBeGreaterThanOrEqual(sampleCount);
    expect(importMusicXmlToCore(await xml()).score.parts).toHaveLength(parts);
    expect(await notes.count()).toBeGreaterThanOrEqual(measures * parts * 8);
  });
}
