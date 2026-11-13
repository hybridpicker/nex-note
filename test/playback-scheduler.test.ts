import assert from 'node:assert/strict';
import test from 'node:test';
import React from 'react';
import { act, create } from 'react-test-renderer';

import { usePlayback } from '../hooks/usePlayback.ts';
import { createPlaybackTicker } from '../lib/playback-ticker.ts';
import type { SelectedNote } from '../hooks/useNoteEditor.ts';

// Eight quarter notes at 120 bpm (0.5 s apart) in two 4/4 measures.
const SCORE_XML = `<?xml version="1.0" encoding="UTF-8"?>
<score-partwise version="4.0"><part-list><score-part id="P1"><part-name>Piano</part-name></score-part></part-list>
<part id="P1">${[0, 1].map((measure) => `
  <measure number="${measure + 1}">
    ${measure === 0 ? '<attributes><divisions>1</divisions><time><beats>4</beats><beat-type>4</beat-type></time><clef><sign>G</sign><line>2</line></clef></attributes><direction><direction-type><metronome><beat-unit>quarter</beat-unit><per-minute>120</per-minute></metronome></direction-type><sound tempo="120"/></direction>' : ''}
    ${['C', 'D', 'E', 'F'].map((step) => `<note><pitch><step>${step}</step><octave>${4 + measure}</octave></pitch><duration>1</duration><voice>1</voice><type>quarter</type></note>`).join('')}
  </measure>`).join('')}
</part></score-partwise>`;

const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

function installFakes() {
  const starts: Array<{ note: number; when: number }> = [];
  const contexts: Array<{ closed: number }> = [];
  class FakeAudioContext {
    state = 'running';
    currentTime = 100;
    baseLatency = 0;
    outputLatency = 0;
    destination = {};
    record = { closed: 0 };
    constructor() { contexts.push(this.record); }
    async resume() {}
    async close() { this.state = 'closed'; this.record.closed += 1; }
    createOscillator() {
      return { connect() {}, start() {}, stop() {}, frequency: { value: 0 } };
    }
    createGain() {
      return { connect() {}, gain: { setValueAtTime() {}, linearRampToValueAtTime() {}, exponentialRampToValueAtTime() {} } };
    }
  }
  let lastContext: FakeAudioContext | null = null;
  const replacements: Record<string, unknown> = {
    IS_REACT_ACT_ENVIRONMENT: true,
    AudioContext: class extends FakeAudioContext {
      constructor() { super(); lastContext = this; }
    },
    __NEX_NOTE_E2E_INSTRUMENT_LOADER__: async () => ({
      start(note: number, when: number) { starts.push({ note, when }); return { stop() {} }; },
      stop() {},
    }),
  };
  const original = Object.fromEntries(Object.keys(replacements).map((key) => [key, Object.getOwnPropertyDescriptor(globalThis, key)]));
  for (const [key, value] of Object.entries(replacements)) Object.defineProperty(globalThis, key, { value, configurable: true, writable: true });
  return {
    starts,
    contexts,
    context: () => lastContext!,
    restore() {
      for (const key of Object.keys(replacements)) {
        const descriptor = original[key];
        if (descriptor) Object.defineProperty(globalThis, key, descriptor);
        else Reflect.deleteProperty(globalThis, key);
      }
    },
  };
}

test('notes start exactly at their timeline time; a blocked main thread moves the transport instead of shifting notes', async () => {
  const fakes = installFakes();
  let api!: ReturnType<typeof usePlayback>;
  function Harness() { api = usePlayback(); return null; }
  let root!: ReturnType<typeof create>;
  try {
    act(() => { root = create(React.createElement(Harness)); });
    await act(async () => { assert.equal(await api.loadMidi(SCORE_XML), true); });
    await act(async () => { assert.equal(await api.play(), true); });
    const context = fakes.context();
    // The opening window is scheduled synchronously: notes in the next 0.3 s.
    assert.deepEqual(fakes.starts.map((start) => start.note), [60]);
    const origin = fakes.starts[0]!.when;
    assert.ok(origin > 100 && origin <= 100.02, `first note ${origin}`);

    // The audio clock runs on, but the main thread is blocked for 1.2 s: the next notes are due.
    context.currentTime = 101.2;
    await act(async () => { await wait(60); });
    // The overdue note is not dropped and not squeezed in late: the transport moves later.
    assert.deepEqual(fakes.starts.map((start) => start.note), [60, 62]);
    assert.ok(fakes.starts[1]!.when >= 101.2, `rescheduled after the block: ${fakes.starts[1]!.when}`);
    context.currentTime = 101.45;
    await act(async () => { await wait(60); });
    const whens = fakes.starts.map((start) => start.when);
    // From there every note keeps its 0.5 s spacing again.
    assert.deepEqual(fakes.starts.map((start) => start.note), [60, 62, 64]);
    assert.ok(Math.abs((whens[2]! - whens[1]!) - 0.5) < 1e-9);
    // The transport the playhead reads moved with the sound.
    const position = api.transport.read();
    assert.equal(position?.playing, true);
    // Without the shift the clock would say 1.45 s; with it the second note (0.5 s) was heard
    // about 0.25 s ago.
    assert.ok(position!.scoreSeconds > 0.6 && position!.scoreSeconds < 1, `heard position ${position?.scoreSeconds}`);
  } finally {
    if (root) act(() => root.unmount());
    fakes.restore();
  }
});

test('starting from a note keeps the AudioContext and loaded instruments', async () => {
  const fakes = installFakes();
  let api!: ReturnType<typeof usePlayback>;
  function Harness() { api = usePlayback(); return null; }
  let root!: ReturnType<typeof create>;
  try {
    act(() => { root = create(React.createElement(Harness)); });
    await act(async () => { await api.loadMidi(SCORE_XML); });
    await act(async () => { await api.play(); });
    const note = { measureNumber: 2, staffIndex: 1, voiceId: 1, timestampNum: 2, timestampDen: 4, step: 'E', octave: 5, alter: 0, isRest: false } as SelectedNote;
    fakes.starts.length = 0;
    await act(async () => { await api.startFromNote(note); });
    assert.equal(fakes.contexts.length, 1, 'no new AudioContext');
    assert.equal(fakes.contexts[0]!.closed, 0, 'the AudioContext stays open');
    // Measure 2, half a whole note in: E5 (76) at 3 s of score time.
    assert.equal(fakes.starts[0]?.note, 76);
    assert.ok(Math.abs((api.transport.read()?.scoreSeconds ?? 0) - 3) < 1e-6);
  } finally {
    if (root) act(() => root.unmount());
    fakes.restore();
  }
});

test('the scheduler ticker falls back to a main-thread interval without workers', async () => {
  let ticks = 0;
  const ticker = createPlaybackTicker(() => { ticks += 1; }, 5);
  assert.equal(ticker.kind, typeof Worker === 'function' ? 'worker' : 'interval');
  ticker.start();
  await wait(40);
  ticker.stop();
  const afterStop = ticks;
  await wait(20);
  ticker.dispose();
  assert.ok(afterStop >= 3, `ticked ${afterStop} times`);
  assert.equal(ticks, afterStop);
});
