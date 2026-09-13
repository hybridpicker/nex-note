import test from 'node:test';
import assert from 'node:assert/strict';
import { requestNativeMidiAccess, type NativeMidi } from '../src/score-input/native-midi';

test('closing obsolete native access cannot stop a replacement, and listeners are released once', async () => {
  let starts = 0; let stops = 0; let removals = 0;
  const callbacks: Array<{ name: string; callback: (event: any) => void }> = [];
  const bridge = {
    start: async () => { starts++; return { devices: [{ id: 'synthetic', name: 'Synthetic transport' }] }; },
    select: async () => {}, stop: async () => { stops++; },
    addListener: async (name: string, callback: (event: any) => void) => { callbacks.push({ name, callback }); return { remove: async () => { removals++; } }; },
  } as NativeMidi;
  const first = await requestNativeMidiAccess(bridge);
  let oldMessages = 0; first.inputs.get('synthetic')!.onmidimessage = () => { oldMessages++; };
  const second = await requestNativeMidiAccess(bridge);
  let newMessages = 0; second.inputs.get('synthetic')!.onmidimessage = () => { newMessages++; };
  for (const listener of callbacks.filter(listener => listener.name === 'message')) listener.callback({ id: 'synthetic', data: [0x90, 60, 80], ageMs: 1 });
  assert.equal(oldMessages, 0); assert.equal(newMessages, 1);
  await first.close(); await first.close();
  assert.equal(stops, 0); assert.equal(removals, 2);
  await second.close(); await second.close();
  assert.equal(starts, 2); assert.equal(stops, 1); assert.equal(removals, 4);
});
