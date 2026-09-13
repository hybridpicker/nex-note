'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { hasNativeMidi, requestNativeMidiAccess } from '@/src/score-input/native-midi';
import { MidiStepAccumulator, normalizeMidiChord, type MidiPitch } from '@/src/score-input/midi-input';

export type MidiInputStatus = 'idle' | 'requesting' | 'connected' | 'waiting' | 'unsupported' | 'denied' | 'error';
interface MidiMessageEventLike { data: ArrayLike<number>; timeStamp?: number }
export interface MidiInputPortLike {
  id: string;
  name?: string | null;
  manufacturer?: string | null;
  state?: string;
  onmidimessage: ((event: MidiMessageEventLike) => void) | null;
}
interface MidiAccessLike {
  inputs: Map<string, MidiInputPortLike>;
  select?: (id: string) => Promise<void>;
  close?: () => Promise<void>;
  onstatechange: (() => void) | null;
}
type MidiNavigator = Navigator & {
  requestMIDIAccess?: (options?: { sysex?: boolean; software?: boolean }) => Promise<MidiAccessLike>;
};
interface UseMidiInputOptions {
  onChord: (pitches: MidiPitch[]) => void;
  preferFlats?: boolean;
  active?: boolean;
  onMessage?: (data: ArrayLike<number>, timeStamp: number) => boolean;
  onReset?: () => void;
}

export function useMidiInput({ onChord, preferFlats = false, active = true, onMessage, onReset }: UseMidiInputOptions) {
  const [enabled, setEnabled] = useState(false);
  const [status, setStatus] = useState<MidiInputStatus>('idle');
  const [devices, setDevices] = useState<Array<{ id: string; name: string }>>([]);
  const [selectedDeviceId, setSelectedDeviceId] = useState('');
  const selectedRef = useRef('');
  const boundPortRef = useRef<MidiInputPortLike | null>(null);
  const accessRef = useRef<MidiAccessLike | null>(null);
  const generationRef = useRef(0);
  const bindingGenerationRef = useRef(0);
  const focusedRef = useRef(true);
  const accumulatorRef = useRef(new MidiStepAccumulator());
  const optionsRef = useRef({ onChord, preferFlats, active, onMessage, onReset });
  optionsRef.current = { onChord, preferFlats, active, onMessage, onReset };

  const discard = useCallback(() => accumulatorRef.current.reset(), []);
  const detachPorts = useCallback(() => {
    bindingGenerationRef.current++;
    if (boundPortRef.current) boundPortRef.current.onmidimessage = null;
    boundPortRef.current = null;
    optionsRef.current.onReset?.();
    if (accessRef.current) accessRef.current.onstatechange = null;
    discard();
  }, [discard]);
  const refreshPorts = useCallback(() => {
    const access = accessRef.current;
    if (!access) return;
    const ports = [...access.inputs.values()].filter(port => port.state !== 'disconnected');
    setDevices(ports.map(port => ({ id: port.id, name: [port.manufacturer, port.name].filter(Boolean).join(' ').trim() || 'MIDI input' })));
    if (!selectedRef.current && ports[0]) {
      selectedRef.current = ports[0].id;
      setSelectedDeviceId(ports[0].id);
    }
    const selected = ports.find(port => port.id === selectedRef.current) ?? null;
    if (boundPortRef.current !== selected) {
      const binding = ++bindingGenerationRef.current;
      if (boundPortRef.current) boundPortRef.current.onmidimessage = null;
      discard();
      optionsRef.current.onReset?.();
      boundPortRef.current = selected;
      if (selected) void access.select?.(selected.id).catch(() => {
        if (accessRef.current !== access || bindingGenerationRef.current !== binding) return;
        selected.onmidimessage = null;
        optionsRef.current.onReset?.();
        discard(); setStatus('error');
      });
    }
    const binding = bindingGenerationRef.current;
    if (selected) selected.onmidimessage = event => {
      if (accessRef.current !== access || boundPortRef.current !== selected || bindingGenerationRef.current !== binding) return;
      const options = optionsRef.current;
      if (!options.active || !focusedRef.current || document.visibilityState === 'hidden') { discard(); return; }
      if (options.onMessage?.(event.data, event.timeStamp ?? performance.now())) { discard(); return; }
      for (const chord of accumulatorRef.current.accept(event.data)) {
        optionsRef.current.onChord(normalizeMidiChord(chord, optionsRef.current.preferFlats));
      }
    };
    setStatus(selected ? 'connected' : 'waiting');
  }, [discard]);
  const selectDevice = useCallback((id: string) => {
    selectedRef.current = id;
    setSelectedDeviceId(id);
    discard();
    refreshPorts();
  }, [discard, refreshPorts]);
  const disable = useCallback(() => {
    generationRef.current++;
    detachPorts();
    void accessRef.current?.close?.();
    accessRef.current = null;
    setEnabled(false);
    setDevices([]);
    setStatus('idle');
  }, [detachPorts]);
  const enable = useCallback(async () => {
    if (typeof navigator === 'undefined') return;
    const request = (navigator as MidiNavigator).requestMIDIAccess;
    const native = hasNativeMidi();
    if (!request && !native) { setStatus('unsupported'); return; }
    const generation = ++generationRef.current;
    detachPorts();
    const previousAccess = accessRef.current;
    accessRef.current = null;
    setEnabled(true);
    setStatus('requesting');
    try {
      if (previousAccess?.close) await previousAccess.close();
      if (generation !== generationRef.current) return;
      const access: MidiAccessLike = native ? await requestNativeMidiAccess() : await request!.call(navigator, { sysex: false, software: true });
      if (generation !== generationRef.current) { await access.close?.(); return; }
      detachPorts();
      accessRef.current = access;
      access.onstatechange = refreshPorts;
      refreshPorts();
    } catch (error) {
      if (generation !== generationRef.current) return;
      setEnabled(false);
      setStatus(error instanceof DOMException && error.name === 'NotAllowedError' ? 'denied' : 'error');
    }
  }, [detachPorts, refreshPorts]);
  const toggle = useCallback(async () => { if (enabled) disable(); else await enable(); }, [disable, enable, enabled]);
  useEffect(() => { discard(); }, [active, discard]);
  useEffect(() => {
    const blur = () => { focusedRef.current = false; discard(); };
    const focus = () => { focusedRef.current = true; discard(); };
    const hidden = () => { if (document.visibilityState === 'hidden') blur(); };
    window.addEventListener('blur', blur);
    window.addEventListener('focus', focus);
    document.addEventListener('visibilitychange', hidden);
    return () => {
      generationRef.current++;
      detachPorts();
      void accessRef.current?.close?.();
      window.removeEventListener('blur', blur);
      window.removeEventListener('focus', focus);
      document.removeEventListener('visibilitychange', hidden);
    };
  }, [detachPorts, discard]);
  return { enabled, status, devices, deviceNames: devices.map(device => device.name), selectedDeviceId, selectDevice, enable, disable, toggle, discard };
}
