import test from 'node:test';
import assert from 'node:assert/strict';
import React from 'react';
import { act, create } from 'react-test-renderer';
import { useMidiRecording } from '../hooks/useMidiRecording';
import type { SelectedNote } from '../hooks/useNoteEditor';
import { buildDocumentState } from '../src/score-core/commands/apply-document-commands';
import { syntheticScore } from '../scripts/benchmark-note-entry';
(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;

test('MIDI cannot fall through to step input while the recording audio context is starting', async () => {
  const saved = Object.fromEntries(['window', 'document', 'AudioContext'].map(key => [key, Object.getOwnPropertyDescriptor(globalThis, key)]));
  let resume!: () => void;
  class Context {
    state = 'suspended';
    resume() { return new Promise<void>(resolve => { resume = () => { this.state = 'running'; resolve(); }; }); }
    async close() { this.state = 'closed'; }
  }
  Object.defineProperty(globalThis, 'window', { configurable: true, value: new EventTarget() });
  Object.defineProperty(globalThis, 'document', { configurable: true, value: Object.assign(new EventTarget(), { visibilityState: 'visible' }) });
  Object.defineProperty(globalThis, 'AudioContext', { configurable: true, value: Context });
  const document = buildDocumentState(syntheticScore(1)).coreDocument;
  const selected = { corePartId: 'P1', measureNumber: 1, staffIndex: 1, voiceId: 1, timestampNum: 0, timestampDen: 1 } as SelectedNote;
  let hook!: ReturnType<typeof useMidiRecording>; let renderer!: ReturnType<typeof create>;
  function Harness() { hook = useMidiRecording(true, selected, document); return null; }
  try {
    act(() => { renderer = create(React.createElement(Harness)); });
    let start!: Promise<void>;
    act(() => { start = hook.start(); });
    assert.equal(hook.onMessage([0x90, 60, 80], performance.now()), true, 'arming owns incoming MIDI before recording timestamps are available');
    act(() => hook.cancel());
    await act(async () => { resume(); await start; });
    assert.equal(hook.phase, 'idle'); assert.equal(hook.noteCount, 0);
  } finally {
    act(() => renderer?.unmount());
    for (const [key, descriptor] of Object.entries(saved)) {
      if (descriptor) Object.defineProperty(globalThis, key, descriptor); else delete (globalThis as any)[key];
    }
  }
});
