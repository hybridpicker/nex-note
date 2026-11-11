import { expect, test } from '@playwright/test';

import { REFERENCE_TASKS } from '../test/support/reference-tasks';
import { summarizeScore } from '../test/support/score-summary';
import { EntrySession } from './support/entry-session';
import { LayoutKeyboard } from './support/layout-keys';

/*
 * Gates 4 and 5 of docs/note-entry-mastery-ledger.md. Every keyboard reference task is typed into the
 * real app with keys alone, on a US, a UK and a German keyboard, and must give its fixture exactly.
 * After every key the user can see where they are: in note input a caret inside the viewport and the
 * armed value, dot, accidental, voice and mode; with an entry field open, the field; otherwise the
 * selection, named by the status line.
 */

const LAYOUTS = ['us', 'uk', 'de'] as const;

for (const task of REFERENCE_TASKS.filter((entry) => entry.nex.length > 0)) {
  for (const layout of LAYOUTS) {
    test(`${task.id} on a ${layout.toUpperCase()} keyboard: keys alone give the fixture, and every step shows where the input is`, async ({ page }, testInfo) => {
      test.setTimeout(600_000);
      const session = await EntrySession.boot(page, testInfo, { xml: task.start(), layout, screenshots: false });
      const keyboard = new LayoutKeyboard(page, layout);
      const lost: string[] = [];

      for (const [index, token] of task.nex.entries()) {
        await keyboard.press(token);
        const seen = await page.evaluate(() => {
          const viewport = document.querySelector('[data-testid="score-viewport"]')?.getBoundingClientRect();
          const inView = (element: Element | null) => {
            if (!element || !viewport) return false;
            const rect = element.getBoundingClientRect();
            return rect.width > 0 && rect.height > 0 && rect.left >= viewport.left - 1 && rect.right <= viewport.right + 1
              && rect.top >= viewport.top - 1 && rect.bottom <= viewport.bottom + 1;
          };
          const state = (window as typeof window & { __NEX_NOTE_E2E_STATE__?: { noteInputMode?: boolean; selectionCount?: number } }).__NEX_NOTE_E2E_STATE__;
          const bar = document.querySelector('[data-testid="note-input-bar"]');
          const fields = bar ? Array.from(bar.querySelectorAll<HTMLElement>('[data-armed-field]')).map((field) => field.dataset.armedField).sort().join(',') : '';
          return {
            noteInput: Boolean(state?.noteInputMode),
            selection: state?.selectionCount ?? 0,
            caret: inView(document.querySelector('[data-testid="note-input-caret"]')),
            popover: inView(document.querySelector('[data-testid="inline-entry-popover"]')),
            fields,
            status: document.querySelector<HTMLElement>('[data-testid="selection-status"]')?.dataset.statusBar ?? '',
          };
        });
        const where = `key ${index + 1} "${token}"`;
        if (seen.noteInput) {
          if (!seen.caret) lost.push(`${where}: no caret in view`);
          if (seen.fields !== 'accidental,dot,mode,tuplet,value,voice') lost.push(`${where}: armed state shows "${seen.fields}"`);
        } else if (!seen.popover && seen.selection > 0 && !seen.status) {
          lost.push(`${where}: the selection is not named`);
        }
      }

      await session.settle();
      expect(summarizeScore(await session.xml()).sort(), `${task.id} result`).toEqual([...task.expected!].sort());
      expect(lost.slice(0, 12), `${lost.length} steps without orientation`).toEqual([]);
    });
  }
}
