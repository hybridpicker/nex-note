import { Capacitor, registerPlugin, type PluginListenerHandle } from '@capacitor/core';

export interface NativeMidi {
  start(): Promise<{ devices: Array<{ id: string; name: string }> }>;
  select(options: { id: string }): Promise<void>;
  stop(): Promise<void>;
  addListener(name: 'message', callback: (event: { id: string; data: number[]; ageMs: number }) => void): Promise<PluginListenerHandle>;
  addListener(name: 'devices', callback: (event: { devices: Array<{ id: string; name: string }> }) => void): Promise<PluginListenerHandle>;
}
export function hasNativeMidi() { return Capacitor.isNativePlatform() && Capacitor.isPluginAvailable('NexNoteMidi'); }

let nativeOwner: object | null = null;
let nativeOperations: Promise<unknown> = Promise.resolve();
function serialized<T>(operation: () => Promise<T>): Promise<T> {
  const result = nativeOperations.then(operation);
  nativeOperations = result.catch(() => undefined);
  return result;
}

export async function requestNativeMidiAccess(bridge = registerPlugin<NativeMidi>('NexNoteMidi')) {
  const owner = {};
  nativeOwner = owner;
  let closed = false;
  type Port = { id: string; name: string; state: string; onmidimessage: ((event: { data: ArrayLike<number>; timeStamp?: number }) => void) | null };
  const inputs = new Map<string, Port>();
  const handles: PluginListenerHandle[] = [];
  const access = {
    inputs, onstatechange: null as (() => void) | null,
    select: (id: string) => serialized(async () => { if (!closed && nativeOwner === owner) await bridge.select({ id }); }),
    close: async () => {
      if (closed) return;
      closed = true;
      inputs.clear();
      access.onstatechange = null;
      await Promise.allSettled(handles.map(handle => handle.remove()));
      await serialized(async () => {
        // An obsolete permission/start result must never stop a newer session.
        if (nativeOwner !== owner) return;
        nativeOwner = null;
        await bridge.stop();
      });
    },
  };
  const refresh = (devices: Array<{ id: string; name: string }>) => {
    if (closed || nativeOwner !== owner) return;
    // A native source can reconnect with the same unique ID and a new endpoint.
    // Fresh port objects force the shared hook to rebind and discard held keys.
    inputs.clear();
    for (const device of devices) {
      inputs.set(device.id, { ...device, state: 'connected', onmidimessage: null });
    }
    access.onstatechange?.();
  };
  try {
    handles.push(await bridge.addListener('message', event => {
      if (!closed && nativeOwner === owner && Number.isFinite(event.ageMs)) inputs.get(event.id)?.onmidimessage?.({ data: event.data, timeStamp: performance.now() - Math.max(0, event.ageMs) });
    }));
    handles.push(await bridge.addListener('devices', event => refresh(event.devices)));
    refresh((await serialized(() => bridge.start())).devices);
    return access;
  } catch (error) { await access.close(); throw error; }
}
