'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import {
  detectPitchesFromSpectrum,
  MicrophoneNoteGate,
} from '@/src/score-input/audio-pitch-input';
import { normalizeMidiChord, type MidiPitch } from '@/src/score-input/midi-input';

export type MicrophoneInputStatus =
  | 'idle'
  | 'requesting'
  | 'listening'
  | 'unsupported'
  | 'denied'
  | 'error';

interface UseMicrophonePitchInputOptions {
  onChord: (pitches: MidiPitch[]) => void;
  preferFlats?: boolean;
  analysisIntervalMs?: number;
}

type AudioWindow = Window & typeof globalThis & {
  webkitAudioContext?: typeof AudioContext;
};

function formatPitchLabel(pitches: MidiPitch[]) {
  return pitches.map((pitch) => {
    const accidental = pitch.alter === 1 ? '♯' : pitch.alter === -1 ? '♭' : '';
    return `${pitch.step}${accidental}${pitch.octave}`;
  }).join('+');
}

export function useMicrophonePitchInput({
  onChord,
  preferFlats = false,
  analysisIntervalMs = 46,
}: UseMicrophonePitchInputOptions) {
  const [enabled, setEnabled] = useState(false);
  const [status, setStatus] = useState<MicrophoneInputStatus>('idle');
  const [detectedPitchLabel, setDetectedPitchLabel] = useState('');
  const [signalLevelDb, setSignalLevelDb] = useState(-120);
  const streamRef = useRef<MediaStream | null>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const animationFrameRef = useRef<number | null>(null);
  const lastAnalysisAtRef = useRef(0);
  const lastDisplaySignatureRef = useRef('');
  const gateRef = useRef(new MicrophoneNoteGate());
  const onChordRef = useRef(onChord);
  const preferFlatsRef = useRef(preferFlats);

  useEffect(() => { onChordRef.current = onChord; }, [onChord]);
  useEffect(() => { preferFlatsRef.current = preferFlats; }, [preferFlats]);

  const stopAudio = useCallback(() => {
    if (animationFrameRef.current != null) cancelAnimationFrame(animationFrameRef.current);
    animationFrameRef.current = null;
    streamRef.current?.getTracks().forEach((track) => track.stop());
    streamRef.current = null;
    analyserRef.current?.disconnect();
    analyserRef.current = null;
    const audioContext = audioContextRef.current;
    audioContextRef.current = null;
    if (audioContext && audioContext.state !== 'closed') void audioContext.close();
    gateRef.current.reset();
    lastDisplaySignatureRef.current = '';
    setDetectedPitchLabel('');
    setSignalLevelDb(-120);
  }, []);

  const disable = useCallback(() => {
    stopAudio();
    setEnabled(false);
    setStatus('idle');
  }, [stopAudio]);

  const enable = useCallback(async () => {
    if (
      typeof navigator === 'undefined'
      || typeof navigator.mediaDevices?.getUserMedia !== 'function'
      || typeof window === 'undefined'
    ) {
      setEnabled(false);
      setStatus('unsupported');
      return;
    }
    const AudioContextConstructor = window.AudioContext
      ?? (window as AudioWindow).webkitAudioContext;
    if (!AudioContextConstructor) {
      setEnabled(false);
      setStatus('unsupported');
      return;
    }

    setEnabled(true);
    setStatus('requesting');
    let audioContext: AudioContext | null = null;
    try {
      // Start the audio context while the REC click is still the active user
      // gesture. Creating it after the asynchronous permission prompt can
      // leave resume() pending indefinitely in Chromium/Electron.
      const activeAudioContext = new AudioContextConstructor();
      audioContext = activeAudioContext;
      await activeAudioContext.resume();
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          autoGainControl: false,
          echoCancellation: false,
          noiseSuppression: false,
          channelCount: 1,
        },
        video: false,
      });
      const analyser = activeAudioContext.createAnalyser();
      analyser.fftSize = 16384;
      analyser.minDecibels = -110;
      analyser.maxDecibels = -10;
      analyser.smoothingTimeConstant = 0.46;
      activeAudioContext.createMediaStreamSource(stream).connect(analyser);
      await activeAudioContext.resume();

      streamRef.current = stream;
      audioContextRef.current = activeAudioContext;
      analyserRef.current = analyser;
      gateRef.current.reset();
      const spectrum = new Float32Array(analyser.frequencyBinCount);

      const analyze = (nowMs: number) => {
        if (analyserRef.current !== analyser) return;
        animationFrameRef.current = requestAnimationFrame(analyze);
        if (nowMs - lastAnalysisAtRef.current < analysisIntervalMs) return;
        lastAnalysisAtRef.current = nowMs;
        analyser.getFloatFrequencyData(spectrum);
        const detected = detectPitchesFromSpectrum(spectrum, {
          sampleRate: activeAudioContext.sampleRate,
          fftSize: analyser.fftSize,
        });
        const midis = detected.map((pitch) => pitch.midi);
        const displayPitches = normalizeMidiChord(midis, preferFlatsRef.current);
        const displaySignature = midis.join(',');
        if (displaySignature !== lastDisplaySignatureRef.current) {
          lastDisplaySignatureRef.current = displaySignature;
          setDetectedPitchLabel(formatPitchLabel(displayPitches));
          setSignalLevelDb(detected.length > 0
            ? Math.max(...detected.map((pitch) => pitch.levelDb))
            : -120);
        }
        const emitted = gateRef.current.push(midis, nowMs);
        if (emitted) {
          onChordRef.current(normalizeMidiChord(emitted, preferFlatsRef.current));
        }
      };

      setStatus('listening');
      animationFrameRef.current = requestAnimationFrame(analyze);
    } catch (error) {
      if (audioContext && audioContext.state !== 'closed') void audioContext.close();
      stopAudio();
      setEnabled(false);
      setStatus(
        error instanceof DOMException && ['NotAllowedError', 'SecurityError'].includes(error.name)
          ? 'denied'
          : 'error',
      );
    }
  }, [analysisIntervalMs, stopAudio]);

  const toggle = useCallback(async () => {
    if (enabled) {
      disable();
      return;
    }
    await enable();
  }, [disable, enable, enabled]);

  useEffect(() => () => stopAudio(), [stopAudio]);

  return {
    enabled,
    status,
    detectedPitchLabel,
    signalLevelDb,
    enable,
    disable,
    toggle,
  };
}
