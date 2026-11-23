import { expect, test } from '@playwright/test';

// The AI settings button sits beside the logo; its popover used to open right-aligned and ran
// off the left edge of the window (and below the bottom without scrolling).
for (const viewport of [{ width: 1440, height: 900 }, { width: 1000, height: 800 }, { width: 390, height: 844 }]) {
  test(`AI settings popover stays inside a ${viewport.width} px window @smoke`, async ({ page }) => {
    await page.setViewportSize(viewport);
    await page.goto('/');
    // Below 1200 px the AI settings sit in the header overflow menu.
    if (viewport.width < 1200) {
      const overflow = page.getByTestId('header-overflow-trigger');
      await expect(overflow).toBeVisible({ timeout: 20_000 });
      await overflow.click();
    }
    const trigger = page.getByRole('button', { name: 'AI model settings' });
    await expect(trigger).toBeVisible({ timeout: 20_000 });
    await trigger.click();
    const panel = page.getByTestId('ai-model-settings-panel');
    await expect(panel).toBeVisible();
    const box = await panel.boundingBox();
    expect(box).not.toBeNull();
    expect(box!.x).toBeGreaterThanOrEqual(0);
    expect(box!.x + box!.width).toBeLessThanOrEqual(viewport.width);
    expect(box!.y + box!.height).toBeLessThanOrEqual(viewport.height);
    const scrolls = await panel.evaluate((el) => el.scrollHeight <= el.clientHeight || getComputedStyle(el).overflowY === 'auto');
    expect(scrolls).toBe(true);
  });
}
