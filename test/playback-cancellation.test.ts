import test from 'node:test';
import assert from 'node:assert/strict';
import React from 'react';
import { act, create } from 'react-test-renderer';
import { usePlayback } from '../hooks/usePlayback.ts';
import type { SelectedNote } from '../hooks/useNoteEditor.ts';

for (const chord of [false, true]) {
  test(`Stop cancels a loading ${chord ? 'chord' : 'note'} audition and permits a new audition`, async () => {
    let starts = 0;
    let release!: () => void;
    let announceLoad!: () => void;
    const started = new Promise<void>((resolve) => { announceLoad = resolve; });
    const player = { start() { starts += 1; return { stop() {} }; }, stop() {} };
    const loading = new Promise<typeof player>((resolve) => { release = () => resolve(player); });
    const replacements = {
      IS_REACT_ACT_ENVIRONMENT: true,
      cancelAnimationFrame() {},
      AudioContext: class {
        state = 'running';
        currentTime = 0;
        async resume() {}
        async close() { this.state = 'closed'; }
      },
      __NEX_NOTE_E2E_INSTRUMENT_LOADER__: () => { announceLoad(); return loading; },
    };
    const original = Object.fromEntries(Object.keys(replacements).map((key) => [key, Object.getOwnPropertyDescriptor(globalThis, key)]));
    for (const [key, value] of Object.entries(replacements)) Object.defineProperty(globalThis, key, { value, configurable: true, writable: true });
    let api!: ReturnType<typeof usePlayback>;
    function Harness() { api = usePlayback(); return null; }
    let root!: ReturnType<typeof create>;
    const note = { step: 'C', octave: 4, alter: 0, isRest: false, measureNumber: 1, staffIndex: 1, voiceId: 1, timestampNum: 0, timestampDen: 1 } as SelectedNote;
    const audition = () => chord ? api.previewNotes([note, { ...note, step: 'E' }]) : api.previewNote(note);
    try {
      act(() => { root = create(React.createElement(Harness)); });
      let pending!: Promise<void>;
      await act(async () => { pending = audition(); await started; });
      act(() => api.stop());
      await act(async () => { release(); await pending; });
      assert.equal(starts, 0, 'a completed load must not sound the cancelled audition');
      await act(async () => { await audition(); });
      assert.equal(starts, chord ? 2 : 1, 'a new audition can reuse the loaded instrument');
    } finally {
      if (root) act(() => root.unmount());
      for (const key of Object.keys(replacements)) {
        const descriptor = original[key];
        if (descriptor) Object.defineProperty(globalThis, key, descriptor);
        else Reflect.deleteProperty(globalThis, key);
      }
    }
  });
}
