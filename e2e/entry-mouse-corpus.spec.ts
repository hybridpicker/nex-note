import { expect, test } from '@playwright/test';
import type { Page } from '@playwright/test';

import { MOUSE_CORPUS, type MouseCorpusFixture } from '../test/support/mouse-corpus-fixtures';
import { EntrySession, type EntryGhost } from './support/entry-session';

/*
 * Gate 2 of docs/note-entry-mastery-ledger.md (row M7): preview equals commit over a corpus of ten
 * textures, in page and continuous view, at 50, 100 and 200 % zoom. For every click: the document does
 * not change on hover, the click adds what the ghost showed (pitch, onset, bar, staff, voice, armed
 * value), nothing is added twice, and the score keeps its place in the scrolled content.
 */

type Line = { key: string; part: number; staff: number; measure: number; voice: number; onset: number; pitch: string; type: string; dotted: boolean; chord: boolean; tie: boolean };

async function noteLines(session: EntrySession): Promise<Line[]> {
  const core = await session.core();
  const out: Line[] = [];
  core.score.parts.forEach((part, partIndex) => {
    for (const staff of part.staves) {
      for (const measure of staff.measures) {
        for (const voice of measure.voices) {
          for (const event of voice.events) {
            if (event.kind !== 'note') continue;
            if (core.graceNotes.some((grace) => grace.eventId === event.id)) continue;
            const alter = event.pitch.alter ?? 0;
            const pitch = `${event.pitch.step}${alter > 0 ? '#'.repeat(alter) : alter < 0 ? 'b'.repeat(-alter) : ''}${event.pitch.octave}`;
            const onset = event.timestampNum / Math.max(event.timestampDen, 1);
            const inputVoice = ((Math.max(1, voice.voiceId) - 1) % 4) + 1;
            out.push({
              key: `${partIndex}:${staff.staffIndex}:${measure.measureNumber}:${voice.voiceId}:${onset.toFixed(5)}:${pitch}:${event.durationType}:${event.isDotted ? 1 : 0}`,
              part: partIndex, staff: staff.staffIndex, measure: measure.measureNumber, voice: inputVoice, onset, pitch,
              type: String(event.durationType), dotted: Boolean(event.isDotted), chord: Boolean(event.isChord), tie: Boolean(event.tieStart),
            });
          }
        }
      }
    }
  });
  return out;
}

/** The ghost names the stored voice (5 on the second staff of an imported piano part); entry voices are 1 to 4. */
const inputVoice = (voice: number | null) => (((Math.max(1, voice ?? 1) - 1) % 4) + 1);
const ghostPitch = (pitch: string | null) => (pitch ?? '').replace(/♯/g, '#').replace(/♭/g, 'b');
const ghostOnset = (timestamp: string | null) => {
  const [num, den] = String(timestamp).split('/').map(Number);
  return den ? num! / den : Number.NaN;
};

async function setZoom(page: Page, percent: number) {
  const field = page.getByRole('spinbutton').first();
  await field.fill(String(percent));
  await field.press('Enter');
  await page.getByTestId('score-viewport').focus();
}

async function waitRendered(page: Page) {
  await expect.poll(() => page.getByTestId('score-canvas').evaluate((element) => (
    (element as HTMLElement).dataset.documentRevision === (element as HTMLElement).dataset.renderedRevision
  )), { timeout: 15_000 }).toBe(true);
}

/** Position of the canvas inside the scrolled content: scrolling moves the box, layout shifts move this. */
async function canvasInContent(page: Page) {
  return page.evaluate(() => {
    const canvas = document.querySelector('[data-testid="score-canvas"]')!.getBoundingClientRect();
    const viewport = document.querySelector<HTMLElement>('[data-testid="score-viewport"]')!;
    const view = viewport.getBoundingClientRect();
    return { x: Math.round(canvas.x - view.x + viewport.scrollLeft), y: Math.round(canvas.y - view.y + viewport.scrollTop) };
  });
}

async function staffBox(page: Page, measure: number, staff: number) {
  for (let attempt = 0; attempt < 30; attempt += 1) {
    const locator = page.locator(`[data-measure-number="${measure}"][data-measure-staff="${staff}"]`).first();
    try {
      // Centre the bar: at 200 % a point low in the bar can lie under the footer otherwise.
      const centred = await locator.evaluate((element) => {
        const viewport = document.querySelector<HTMLElement>('[data-testid="score-viewport"]');
        if (!viewport) return false;
        const view = viewport.getBoundingClientRect();
        const rect = element.getBoundingClientRect();
        // The footer lies over the lower edge of the viewport: keep clear of it. Only the viewport is
        // scrolled; `scrollIntoView` would also scroll the page behind it.
        const top = view.top + 24;
        const bottom = view.bottom - 96;
        const inside = rect.top >= top && rect.bottom <= bottom && rect.left >= view.left + 8 && rect.right <= view.right - 8;
        if (!inside) {
          viewport.scrollBy({
            top: (rect.top + rect.height / 2) - (top + (bottom - top) / 2),
            left: rect.left < view.left + 8 || rect.right > view.right - 8 ? (rect.left + rect.width / 2) - (view.left + view.width / 2) : 0,
            behavior: 'instant',
          });
        }
        return inside;
      }, undefined, { timeout: 1_000 });
      if (!centred) {
        // The view has to stand still before a point in it is read and clicked.
        await page.evaluate(() => new Promise<void>((resolve) => {
          const viewport = document.querySelector<HTMLElement>('[data-testid="score-viewport"]');
          let last = `${viewport?.scrollLeft}:${viewport?.scrollTop}`;
          let still = 0;
          const tick = () => {
            const now = `${viewport?.scrollLeft}:${viewport?.scrollTop}`;
            still = now === last ? still + 1 : 0;
            last = now;
            if (still >= 4) resolve(); else requestAnimationFrame(tick);
          };
          requestAnimationFrame(tick);
        }));
      }
      const box = await locator.boundingBox({ timeout: 1_000 });
      if (box && box.width > 0) return box;
    } catch { /* re-rendered meanwhile */ }
    await page.waitForTimeout(50);
  }
  throw new Error(`bar ${measure} of staff ${staff} is not rendered`);
}

async function ghostAt(session: EntrySession, x: number, y: number, patience = 25): Promise<EntryGhost | null> {
  await session.page.mouse.move(x, y, { steps: 3 });
  let ghost: EntryGhost | null = null;
  let previous = '';
  // The preview of this pointer position: stable over two reads.
  for (let attempt = 0; attempt < patience; attempt += 1) {
    await session.page.waitForTimeout(40);
    ghost = await session.ghost();
    const now = JSON.stringify(ghost);
    if (ghost && now === previous) return ghost;
    previous = now;
  }
  return ghost;
}

/** Click a point and compare what was added with the ghost shown there. Returns a mismatch or null. */
async function clickAndCompare(session: EntrySession, fixture: MouseCorpusFixture, x: number, y: number, label: string, wantPitch?: string): Promise<string | null> {
  const page = session.page;
  const xmlBefore = await session.xml();
  const before = await noteLines(session);
  const ghost = await ghostAt(session, x, y);
  if (!ghost) return `${label}: no ghost`;
  // The ghost is drawn in the bar it names: a preview in the neighbouring bar is a wrong preview (F39).
  const drawn = await page.getByTestId('ghost-note-preview').first().evaluate((element) => {
    const rect = element.getBoundingClientRect();
    return rect.x + Number(element.getAttribute('data-ghost-notehead-center-x') ?? 0);
  });
  // Read without scrolling: the view must not move between the preview and the click.
  const named = await page.locator(`[data-measure-number="${ghost.measure ?? 0}"][data-measure-staff="${ghost.staff ?? 1}"]`).first().boundingBox();
  if (!named) return `${label}: bar ${ghost.measure} of the ghost is not rendered`;
  if (drawn < named.x - 6 || drawn > named.x + named.width + 6) {
    return `${label}: the ghost for bar ${ghost.measure} is drawn at x ${Math.round(drawn)}, outside that bar (${Math.round(named.x)} to ${Math.round(named.x + named.width)})`;
  }
  if (wantPitch && ghostPitch(ghost.pitch) !== wantPitch) return `${label}: ghost ${ghostPitch(ghost.pitch)}, wanted ${wantPitch}`;
  if ((await session.xml()) !== xmlBefore) return `${label}: the document changed on hover`;
  const place = await canvasInContent(page);

  // MuseScore `NoteInput::putNote`: a click on a pitch that the chord at this onset already has takes
  // that tone out of a chord of several notes and does nothing to a single note (M4a).
  const chordThere = before.filter((line) => (
    line.measure === ghost.measure && line.staff === ghost.staff
    && line.voice === inputVoice(ghost.voice) && Math.abs(line.onset - ghostOnset(ghost.timestamp)) < 1e-6
  ));
  const pitchStandsThere = ghost.mode === 'chord' && chordThere.some((line) => line.pitch === ghostPitch(ghost.pitch));
  await page.mouse.click(x, y);
  if (pitchStandsThere) {
    await session.settle();
    const xmlAfter = await session.xml();
    if (chordThere.length === 1) return xmlAfter === xmlBefore ? null : `${label}: a click on the only note of a chord changed the document`;
    const afterKeys = (await noteLines(session)).map((line) => line.key).sort();
    const expectedKeys = before.filter((line) => !(chordThere.includes(line) && line.pitch === ghostPitch(ghost.pitch))).map((line) => line.key.replace(/^(\d+:\d+:\d+:\d+:[\d.]+:)/, '$1')).sort();
    await page.keyboard.press('Control+z');
    await expect.poll(() => session.xml(), { timeout: 8_000, message: `${label}: Undo restores the fixture` }).toBe(xmlBefore);
    await waitRendered(page);
    return afterKeys.length === expectedKeys.length ? null : `${label}: a click on a tone the chord has should remove that tone only (${before.length} notes before, ${afterKeys.length} after)`;
  }
  const committed = await expect.poll(async () => (await session.xml()) !== xmlBefore, { timeout: 5_000 }).toBe(true).then(() => true, () => false);
  if (!committed) {
    const status = await page.evaluate(() => {
      const shown = Array.from(document.querySelectorAll('[role="status"], [role="alert"]')).map((element) => element.textContent?.trim()).filter(Boolean).join(' | ');
      const target = window as typeof window & { __NEX_NOTE_BUG_REPORT_STATE__?: { events?: Array<{ action?: string; detail?: unknown }> }; __NEX_NOTE_E2E_STATE__?: { noteInputMode?: boolean; selectedDuration?: string; historyDepth?: number } };
      const events = (target.__NEX_NOTE_BUG_REPORT_STATE__?.events ?? []).slice(-3).map((event) => `${event.action}:${JSON.stringify(event.detail ?? {}).slice(0, 140)}`).join(' ; ');
      const state = target.__NEX_NOTE_E2E_STATE__;
      return `${shown} || input=${state?.noteInputMode} value=${state?.selectedDuration} history=${state?.historyDepth} || ${events}`;
    });
    return `${label}: ghost ${ghostPitch(ghost.pitch)} bar ${ghost.measure} staff ${ghost.staff} voice ${ghost.voice} at ${ghost.timestamp} (${ghost.mode}), the click committed nothing${status ? ` [${status.slice(0, 700)}]` : ''}`;
  }
  await waitRendered(page);
  await session.settle();
  const after = await noteLines(session);
  const had = new Map<string, number>();
  for (const line of before) had.set(line.key, (had.get(line.key) ?? 0) + 1);
  const added: Line[] = [];
  for (const line of after) {
    const count = had.get(line.key) ?? 0;
    if (count > 0) had.set(line.key, count - 1);
    else added.push(line);
  }
  const moved = await canvasInContent(page);

  let mismatch: string | null = null;
  const pitch = ghostPitch(ghost.pitch);
  const describe = `ghost ${pitch} bar ${ghost.measure} staff ${ghost.staff} voice ${ghost.voice} at ${ghost.timestamp} (${ghost.mode})`;
  const mine = added.filter((line) => line.pitch === pitch).sort((left, right) => left.measure - right.measure || left.onset - right.onset);
  const first = mine[0];
  if (added.length === 0) mismatch = `${label}: ${describe}, nothing added`;
  else if (mine.length !== added.length) mismatch = `${label}: ${describe}, added ${JSON.stringify(added.map((line) => line.key))}`;
  else if (new Set(mine.map((line) => `${line.measure}:${line.onset}`)).size !== mine.length) mismatch = `${label}: ${describe}, duplicate ${JSON.stringify(mine.map((line) => line.key))}`;
  else if (first!.measure !== ghost.measure || first!.staff !== ghost.staff || first!.voice !== inputVoice(ghost.voice) || Math.abs(first!.onset - ghostOnset(ghost.timestamp)) > 1e-6) {
    mismatch = `${label}: ${describe}, committed ${first!.key}`;
  } else if (ghost.mode === 'chord' && !first!.chord) {
    mismatch = `${label}: ${describe}, committed as a note of its own ${first!.key}`;
  } else if (ghost.mode === 'chord' && mine.length === 1 && !after.some((line) => !line.chord && line.measure === first!.measure && line.staff === first!.staff && line.voice === first!.voice && Math.abs(line.onset - first!.onset) < 1e-6 && line.type === first!.type && line.dotted === first!.dotted)) {
    // A tone added to a chord takes the chord's value (ledger, behaviour change of iteration 10).
    mismatch = `${label}: ${describe}, chord tone ${first!.key} does not have the value of its chord`;
  } else if (ghost.mode !== 'chord' && mine.length === 1 && (first!.type !== (fixture.value ?? 'quarter') || first!.dotted)) {
    mismatch = `${label}: ${describe}, value ${first!.type}${first!.dotted ? '.' : ''}`;
  } else if (mine.length > 1 && mine.slice(0, -1).some((line) => !line.tie)) {
    mismatch = `${label}: ${describe}, ${mine.length} notes that are not one tied value`;
  } else if (moved.x !== place.x || moved.y !== place.y) {
    mismatch = `${label}: the canvas moved from ${place.x},${place.y} to ${moved.x},${moved.y}`;
  }

  // Leave the fixture as it was for the next click.
  await page.keyboard.press('Control+z');
  await expect.poll(() => session.xml(), { timeout: 8_000, message: `${label}: Undo restores the fixture` }).toBe(xmlBefore);
  await waitRendered(page);
  return mismatch;
}

for (const fixture of MOUSE_CORPUS) {
  for (const view of ['continuous-vertical', 'page'] as const) {
    test(`M7: ${fixture.name}, ${view === 'page' ? 'page view' : 'continuous view'}: the click commits the preview at 50, 100 and 200 %`, async ({ page }, testInfo) => {
      test.setTimeout(240_000);
      const session = await EntrySession.boot(page, testInfo, { xml: fixture.xml, screenshots: false });
      if (view === 'page') {
        await page.getByLabel('Score view mode').selectOption('page');
        await session.waitForScore();
      }
      const mismatches: string[] = [];
      let clicks = 0;
      for (const zoom of [100, 50, 200]) {
        await setZoom(page, zoom);
        await session.waitForScore();
        await waitRendered(page);
        await session.settle();
        await page.keyboard.press('Escape');
        await page.keyboard.press('N');
        for (const key of (fixture.arm ?? '5').split(' ')) await page.keyboard.press(key);

        const staves = fixture.staves ?? [1];
        for (const [barIndex, bar] of fixture.bars.entries()) {
          for (const [staffIndex, staff] of staves.entries()) {
            // Find where this bar offers a preview: the clef, key and time signature at its start do not.
            const box = await staffBox(page, bar, staff);
            const offers: Array<{ ratio: number; timestamp: string }> = [];
            for (let ratio = 0.1; ratio <= 0.94; ratio += 0.105) {
              const x = box.x + box.width * ratio;
              const ghost = await ghostAt(session, x, box.y + box.height * 0.5, 6);
              if (ghost && ghost.measure === bar && ghost.staff === staff && !offers.some((offer) => offer.timestamp === ghost.timestamp)) {
                offers.push({ ratio, timestamp: String(ghost.timestamp) });
              }
            }
            if (offers.length === 0) { mismatches.push(`${zoom} % bar ${bar} staff ${staff}: no preview anywhere in the bar`); clicks += 1; continue; }
            // The first and the last onset the bar offers, on and between the lines, above and below the middle.
            const picks = offers.length > 1 ? [offers[0]!, offers[offers.length - 1]!] : [offers[0]!, offers[0]!];
            for (const [pickIndex, pick] of picks.entries()) {
              const ratioY = pickIndex === 0 ? 0.2 + 0.15 * ((barIndex + staffIndex) % 3) : 0.85 - 0.2 * ((barIndex + staffIndex) % 3);
              // The view follows the caret after an entry and its Undo: read the bar again.
              const now = await staffBox(page, bar, staff);
              const mismatch = await clickAndCompare(session, fixture, now.x + now.width * pick.ratio, now.y + now.height * ratioY, `${zoom} % bar ${bar} staff ${staff} onset ${pick.timestamp} at y ${ratioY.toFixed(2)}`);
              clicks += 1;
              if (mismatch) mismatches.push(mismatch);
            }
          }
        }

        for (const ledger of fixture.ledgerPitches ?? []) {
          const box = await staffBox(page, 1, ledger.staff);
          const x = box.x + box.width * 0.5;
          // Walk away from the staff until the ghost names the pitch on the third ledger line.
          let found: number | null = null;
          const step = Math.max(2, box.height / 40);
          for (let index = 0; index < 60 && found == null; index += 1) {
            const y = ledger.direction === 'above' ? box.y + box.height * 0.3 - index * step : box.y + box.height * 0.7 + index * step;
            const ghost = await ghostAt(session, x, y);
            if (ghost && ghostPitch(ghost.pitch) === ledger.pitch && ghost.staff === ledger.staff) found = y;
          }
          const label = `${zoom} % ${ledger.pitch} on three ledger lines ${ledger.direction} staff ${ledger.staff}`;
          clicks += 1;
          if (found == null) { mismatches.push(`${label}: no ghost reaches it`); continue; }
          const mismatch = await clickAndCompare(session, fixture, x, found, label, ledger.pitch);
          if (mismatch) mismatches.push(mismatch);
        }
      }
      expect(mismatches, `${clicks} clicks`).toEqual([]);
      expect(clicks).toBeGreaterThanOrEqual(12);
    });
  }
}
