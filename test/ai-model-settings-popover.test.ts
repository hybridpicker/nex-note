import test from 'node:test';
import assert from 'node:assert/strict';

import { popoverOffset } from '../components/AiModelSettings.tsx';

const place = (trigger: { left: number; right: number }, width: number, viewport: number) => {
  const left = trigger.left + popoverOffset(trigger, width, viewport);
  return { left, right: left + width };
};

test('the AI settings popover stays inside the window for a trigger beside the logo', () => {
  // Trigger at x 200–232 in a 1000 px window: right-aligning a 520 px panel would start at -288.
  const { left, right } = place({ left: 200, right: 232 }, 520, 1000);
  assert.ok(left >= 8 && right <= 992, `${left}..${right}`);
});

test('the AI settings popover keeps right alignment when it fits', () => {
  assert.equal(popoverOffset({ left: 1400, right: 1432 }, 520, 1440), 32 - 520);
});

test('on a narrow phone the popover fits the window with a margin on both sides', () => {
  for (const trigger of [{ left: 60, right: 92 }, { left: 300, right: 332 }, { left: 8, right: 40 }]) {
    const { left, right } = place(trigger, 359, 390);
    assert.ok(left >= 8 && right <= 382, `${trigger.left}: ${left}..${right}`);
  }
});
