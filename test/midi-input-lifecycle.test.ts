import test from 'node:test';
import assert from 'node:assert/strict';
import React from 'react';
import { act, create } from 'react-test-renderer';
import { useMidiInput } from '../hooks/useMidiInput';

(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;

function deferred<T>() {
  let resolve!: (value: T) => void; let reject!: (error: Error) => void;
  const promise = new Promise<T>((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
}

function setup(request: () => Promise<any>, onReset?: () => void) {
  const saved = Object.fromEntries(['window', 'document', 'navigator'].map(key => [key, Object.getOwnPropertyDescriptor(globalThis, key)]));
  const window = new EventTarget();
  const document = Object.assign(new EventTarget(), { visibilityState: 'visible' });
  Object.defineProperty(globalThis, 'window', { configurable: true, value: window });
  Object.defineProperty(globalThis, 'document', { configurable: true, value: document });
  Object.defineProperty(globalThis, 'navigator', { configurable: true, value: { requestMIDIAccess: request } });
  const chords: number[][] = []; let current!: ReturnType<typeof useMidiInput>;
  function Harness() { current = useMidiInput({ onChord: pitches => chords.push(pitches.map(p => p.midi)), onReset } as Parameters<typeof useMidiInput>[0]); return null; }
  let renderer!: ReturnType<typeof create>;
  act(() => { renderer = create(React.createElement(Harness)); });
  return { window, document, chords, get current() { return current; }, dispose() {
    act(() => renderer.unmount());
    for (const [key, descriptor] of Object.entries(saved)) {
      if (descriptor) Object.defineProperty(globalThis, key, descriptor); else delete (globalThis as any)[key];
    }
  } };
}

function port(id: string) { return { id, state: 'connected', onmidimessage: null as any }; }
function send(port: ReturnType<typeof port>, bytes: number[]) { port.onmidimessage?.({ data: bytes, timeStamp: 0 }); }

test('late MIDI permission after disable closes the obsolete access without binding it', async () => {
  const pending = deferred<any>(); let closed = 0;
  const input = port('first'); const access = { inputs: new Map([[input.id, input]]), onstatechange: null, close: async () => { closed++; } };
  const hook = setup(() => pending.promise);
  try {
    let enable!: Promise<void>;
    act(() => { enable = hook.current.enable(); });
    act(() => hook.current.disable());
    await act(async () => { pending.resolve(access); await enable; });
    assert.equal(hook.current.status, 'idle'); assert.equal(closed, 1); assert.equal(input.onmidimessage, null);
  } finally { hook.dispose(); }
});

test('switching between connected sources invalidates an active recording session', async () => {
  const first = port('first'); const second = port('second'); let resets = 0;
  const hook = setup(async () => ({ inputs: new Map([[first.id, first], [second.id, second]]), onstatechange: null }), () => { resets++; });
  try {
    await act(async () => hook.current.enable());
    const before = resets;
    act(() => hook.current.selectDevice('second'));
    assert.ok(resets > before, 'a transport replacement cancels the previous take');
  } finally { hook.dispose(); }
});

test('MIDI ignores queued handlers after a device switch and while focus is lost', async () => {
  const first = port('first'); const second = port('second');
  const access = { inputs: new Map([[first.id, first], [second.id, second]]), onstatechange: null as any };
  const hook = setup(async () => access);
  try {
    await act(async () => hook.current.enable());
    const obsolete = first.onmidimessage;
    act(() => { send(first, [0x90,60,80]); hook.current.selectDevice('second'); });
    act(() => { obsolete({ data: [0x90,64,80] }); obsolete({ data: [0x80,64,0] }); });
    assert.deepEqual(hook.chords, [], 'queued callback belongs to the previous device');
    act(() => {
      hook.window.dispatchEvent(new Event('blur'));
      send(second, [0x90,67,80]); send(second, [0x80,67,0]);
    });
    assert.deepEqual(hook.chords, [], 'background MIDI must not enter notation');
    act(() => { hook.window.dispatchEvent(new Event('focus')); send(second, [0x90,69,80]); send(second, [0x90,69,0]); });
    assert.deepEqual(hook.chords, [[69]]);
  } finally { hook.dispose(); }
});

test('obsolete asynchronous device-selection failure cannot override the new session', async () => {
  const first = port('first'); const second = port('second'); const failed = deferred<void>();
  const hook = setup(async () => ({ inputs: new Map([[first.id, first], [second.id, second]]), onstatechange: null, select: (id: string) => id === first.id ? failed.promise : Promise.resolve() }));
  try {
    await act(async () => hook.current.enable());
    await act(async () => hook.current.selectDevice(second.id));
    await act(async () => { failed.reject(new Error('old selection failed')); await Promise.resolve(); });
    assert.equal(hook.current.status, 'connected');
    act(() => { send(second, [0x90,60,80]); send(second, [0x80,60,0]); });
    assert.deepEqual(hook.chords, [[60]]);
  } finally { hook.dispose(); }
});
