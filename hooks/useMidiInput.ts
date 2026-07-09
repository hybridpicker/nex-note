'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { normalizeMidiChord, parseMidiNoteOn, type MidiPitch } from '@/src/score-input/midi-input';

export type MidiInputStatus = 'idle' | 'requesting' | 'connected' | 'waiting' | 'unsupported' | 'denied' | 'error';

interface MidiMessageEventLike {
  data: ArrayLike<number>;
}

interface MidiInputPortLike {
  id: string;
  name?: string | null;
  manufacturer?: string | null;
  state?: string;
  onmidimessage: ((event: MidiMessageEventLike) => void) | null;
}

interface MidiAccessLike {
  inputs: Map<string, MidiInputPortLike>;
  onstatechange: (() => void) | null;
}

type MidiNavigator = Navigator & {
  requestMIDIAccess?: (options?: { sysex?: boolean; software?: boolean }) => Promise<MidiAccessLike>;
};

interface UseMidiInputOptions {
  onChord: (pitches: MidiPitch[]) => void;
  preferFlats?: boolean;
  chordWindowMs?: number;
}

function portLabel(port: MidiInputPortLike) {
  return [port.manufacturer, port.name].filter(Boolean).join(' ').trim() || 'MIDI input';
}

export function useMidiInput({ onChord, preferFlats = false, chordWindowMs = 35 }: UseMidiInputOptions) {
  const [enabled, setEnabled] = useState(false);
  const [status, setStatus] = useState<MidiInputStatus>('idle');
  const [deviceNames, setDeviceNames] = useState<string[]>([]);
  const accessRef = useRef<MidiAccessLike | null>(null);
  const pendingNotesRef = useRef(new Set<number>());
  const chordTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const onChordRef = useRef(onChord);
  const preferFlatsRef = useRef(preferFlats);

  useEffect(() => { onChordRef.current = onChord; }, [onChord]);
  useEffect(() => { preferFlatsRef.current = preferFlats; }, [preferFlats]);

  const flushPendingChord = useCallback(() => {
    if (chordTimerRef.current) clearTimeout(chordTimerRef.current);
    chordTimerRef.current = null;
    const pitches = normalizeMidiChord(pendingNotesRef.current, preferFlatsRef.current);
    pendingNotesRef.current.clear();
    if (pitches.length > 0) onChordRef.current(pitches);
  }, []);

  const handleMidiMessage = useCallback((event: MidiMessageEventLike) => {
    const noteOn = parseMidiNoteOn(event.data);
    if (!noteOn) return;
    pendingNotesRef.current.add(noteOn.note);
    if (chordTimerRef.current) clearTimeout(chordTimerRef.current);
    chordTimerRef.current = setTimeout(flushPendingChord, chordWindowMs);
  }, [chordWindowMs, flushPendingChord]);

  const detachPorts = useCallback(() => {
    const access = accessRef.current;
    if (!access) return;
    for (const input of access.inputs.values()) input.onmidimessage = null;
    access.onstatechange = null;
  }, []);

  const refreshPorts = useCallback(() => {
    const access = accessRef.current;
    if (!access) return;
    const ports = [...access.inputs.values()].filter((port) => port.state !== 'disconnected');
    for (const input of access.inputs.values()) input.onmidimessage = null;
    for (const input of ports) input.onmidimessage = handleMidiMessage;
    setDeviceNames(ports.map(portLabel));
    setStatus(ports.length > 0 ? 'connected' : 'waiting');
  }, [handleMidiMessage]);

  const disable = useCallback(() => {
    detachPorts();
    if (chordTimerRef.current) clearTimeout(chordTimerRef.current);
    chordTimerRef.current = null;
    pendingNotesRef.current.clear();
    accessRef.current = null;
    setEnabled(false);
    setDeviceNames([]);
    setStatus('idle');
  }, [detachPorts]);

  const enable = useCallback(async () => {
    if (typeof navigator === 'undefined') return;
    const requestMIDIAccess = (navigator as MidiNavigator).requestMIDIAccess;
    if (typeof requestMIDIAccess !== 'function') {
      setEnabled(false);
      setStatus('unsupported');
      return;
    }

    setEnabled(true);
    setStatus('requesting');
    try {
      const access = await requestMIDIAccess.call(navigator, { sysex: false, software: true });
      accessRef.current = access;
      access.onstatechange = refreshPorts;
      refreshPorts();
    } catch (error) {
      setEnabled(false);
      setDeviceNames([]);
      setStatus(error instanceof DOMException && error.name === 'NotAllowedError' ? 'denied' : 'error');
    }
  }, [refreshPorts]);

  const toggle = useCallback(async () => {
    if (enabled) {
      disable();
      return;
    }
    await enable();
  }, [disable, enable, enabled]);

  useEffect(() => () => {
    detachPorts();
    if (chordTimerRef.current) clearTimeout(chordTimerRef.current);
  }, [detachPorts]);

  return { enabled, status, deviceNames, enable, disable, toggle };
}
