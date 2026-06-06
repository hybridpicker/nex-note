import fs from 'node:fs/promises';
import path from 'node:path';

import type { Page, TestInfo } from '@playwright/test';

type E2EState = {
  xml?: string;
  filename?: string;
  noteInputMode?: boolean;
  chordInputMode?: boolean;
  selectedDuration?: string;
  selectedVoice?: number;
  selectionCount?: number;
  canUndo?: boolean;
  canRedo?: boolean;
  historyDepth?: number;
  playbackState?: string;
  currentMeasure?: number | null;
  currentBeat?: number | null;
  totalBeats?: number | null;
  playbackError?: string | null;
  scoreStats?: {
    measures: number;
    parts: number;
    notes: number;
    hasSelection: boolean;
  };
  selectedNote?: {
    measureNumber: number;
    staffIndex: number;
    voiceId: number;
    timestampNum: number;
    timestampDen: number;
  } | null;
  ghostPreview?: {
    measure: string | null;
    timestamp: string | null;
    pitch: string | null;
    stem: string | null;
  } | null;
} | null;

async function readE2EState(page: Page): Promise<E2EState> {
  try {
    return await page.evaluate(() => (
      (() => {
        const state = (
          window as typeof window & {
            __NEX_NOTE_E2E_STATE__?: E2EState;
          }
        ).__NEX_NOTE_E2E_STATE__ ?? null;
        const ghost = document.querySelector<HTMLElement>('[data-testid="ghost-note-preview"]');
        if (!state) return null;
        return {
          ...state,
          ghostPreview: ghost ? {
            measure: ghost.getAttribute('data-ghost-measure'),
            timestamp: ghost.getAttribute('data-ghost-timestamp'),
            pitch: ghost.getAttribute('data-ghost-pitch'),
            stem: ghost.getAttribute('data-ghost-stem'),
          } : null,
        };
      })()
    ));
  } catch {
    return null;
  }
}

export async function writeFailureArtifacts(page: Page, testInfo: TestInfo) {
  if (testInfo.status === testInfo.expectedStatus) return;

  const artifactDir = path.join(testInfo.outputDir, 'nex-note-failure-artifacts');
  await fs.mkdir(artifactDir, { recursive: true });

  const state = await readE2EState(page);
  await fs.writeFile(
    path.join(artifactDir, 'e2e-state.json'),
    `${JSON.stringify({
      title: testInfo.title,
      file: testInfo.file,
      project: testInfo.project.name,
      retry: testInfo.retry,
      status: testInfo.status,
      expectedStatus: testInfo.expectedStatus,
      browserUrl: page.url(),
      capturedAt: new Date().toISOString(),
      state,
    }, null, 2)}\n`,
    'utf8',
  );

  if (state?.xml) {
    const filename = (state.filename?.replace(/[^a-z0-9._-]+/gi, '-') || 'current-score.musicxml');
    await fs.writeFile(path.join(artifactDir, filename), state.xml, 'utf8');
  }
}
