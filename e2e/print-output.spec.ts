import { expect, test } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { createNewScoreXml } from '../lib/new-score';

test('blank page canvas retains available width before note entry', async ({ page }) => {
  const xml = createNewScoreXml({
    instrumentIds: ['piano'], title: 'Page width', subtitle: '', composer: '', lyricist: '', copyright: '',
    keySignatureId: 'c-major', timeBeats: 4, timeBeatType: 4,
    tempo: { bpm: 120, beatUnit: 'quarter', showMarking: true }, measureCount: 4,
    pickup: { enabled: false, beats: 1, beatType: 4 },
  });
  await page.addInitScript(xml => localStorage.setItem('nex-note:e2e-boot', JSON.stringify({ xml, filename: 'blank-page.musicxml' })), xml);
  await page.goto('/');
  await page.getByLabel('Score view mode', { exact: true }).selectOption('page');
  await page.getByTestId('score-viewport').focus();
  await page.keyboard.press('N');
  await expect.poll(async () => {
    const canvas = await page.getByTestId('score-canvas').boundingBox();
    const viewport = await page.getByTestId('score-viewport').boundingBox();
    return (canvas?.width ?? 0) / Math.max(viewport?.width ?? 1, 1);
  }).toBeGreaterThan(0.7);
});

for (const name of ['piano-semantics', 'choir-lyrics', 'leadsheet-repeat']) {
  test(`print media retains the rendered ${name} notation`, async ({ page }, testInfo) => {
    const xml = readFileSync(`test/fixtures/${name}.musicxml`, 'utf8');
    await page.addInitScript((xml) => {
      localStorage.setItem('nex-note:e2e-boot', JSON.stringify({ xml, filename: 'print-review.musicxml' }));
    }, xml);
    await page.goto('/');
    await expect(page.locator('[data-testid="score-canvas"] .vf-notehead').first()).toBeVisible();
    await page.getByTitle('Open print view', { exact: true }).click();
    const glyph = page.locator('.nex-print-preview .vf-notehead').first();
    await expect(glyph).toBeVisible();
    await expect(page.getByText('Rendering score...', { exact: true })).toHaveCount(0);
    await page.emulateMedia({ media: 'print' });
    await expect(glyph).toBeVisible();
    await expect(page.locator('.nex-app-shell > header')).toBeHidden();
    await page.pdf({ path: testInfo.outputPath(`${name}.pdf`), format: 'A4', printBackground: true });
    await testInfo.attach('printed-score', { path: testInfo.outputPath(`${name}.pdf`), contentType: 'application/pdf' });
  });
}
