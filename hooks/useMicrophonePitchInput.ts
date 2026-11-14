'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import {
  detectPitchFromTimeDomain,
  MicrophoneNoteGate,
} from '@/src/score-input/audio-pitch-input';
import { GuitarNoteTracker } from '@/src/score-input/guitar-note-tracker';
import {
  audioConstraintsForProfile,
  classifyLineSignalLevel,
  HeldLevelMeter,
  midiRangeForProfile,
  pickAmpInputDevice,
  readInputProfile,
  readRememberedAmpInput,
  writeInputProfile,
  writeRememberedAmpInput,
  type AmpInputChoiceReason,
  type InstrumentInputProfile,
} from '@/src/score-input/instrument-input-profile';
import { normalizeMidiChord, type MidiPitch } from '@/src/score-input/midi-input';
import {
  notationMidisForInstrument,
  type InstrumentNotationMode,
  simultaneousNoteOns,
} from '@/src/score-input/sounding-note';
import { createSampleTap, type SampleTap } from '@/lib/audio-sample-tap';

export { notationMidisForInstrument };
export type { InstrumentInputProfile, AmpInputChoiceReason };

export type MicrophoneInputStatus =
  | 'idle'
  | 'requesting'
  | 'listening'
  | 'unsupported'
  | 'denied'
  | 'error';

export interface MicrophoneInputDevice {
  deviceId: string;
  label: string;
}

/**
 * `single` writes one note per attack and moves on, `chord` (Build chord)
 * stacks notes played one by one at the same position, and `strum` writes
 * every string of a strummed chord at once and moves on. `strum` needs the
 * line signal of the guitar amp profile; on the microphone it acts as `single`.
 */
export type MicrophoneDetectionMode = 'single' | 'chord' | 'strum';
export type MicrophoneInstrumentMode = InstrumentNotationMode;

/** The mode `Alt/Option+C` switches to. Strummed chords are offered with the amp profile only. */
export function nextMicrophoneDetectionMode(
  mode: MicrophoneDetectionMode,
  profile: InstrumentInputProfile,
): MicrophoneDetectionMode {
  if (mode === 'single') return 'chord';
  if (mode === 'chord' && profile === 'guitar-amp') return 'strum';
  return 'single';
}
export type MicrophoneSignalQuality = 'silent' | 'too-low' | 'good' | 'too-high';
export const MICROPHONE_DETECTION_MINIMUM_LEVEL_DB = -82;

export function classifyMicrophoneSignalLevel(levelDb: number): MicrophoneSignalQuality {
  if (!Number.isFinite(levelDb) || levelDb <= -90) return 'silent';
  if (levelDb < -64) return 'too-low';
  if (levelDb > -6) return 'too-high';
  return 'good';
}

interface UseMicrophonePitchInputOptions {
  onChord: (pitches: MidiPitch[], mode: MicrophoneDetectionMode) => void;
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
  const [detectedSoundingPitchLabel, setDetectedSoundingPitchLabel] = useState('');
  const [signalLevelDb, setSignalLevelDb] = useState(-120);
  const [lineSignalPeakDb, setLineSignalPeakDb] = useState(-140);
  const [inputDevices, setInputDevices] = useState<MicrophoneInputDevice[]>([]);
  const [selectedDeviceId, setSelectedDeviceId] = useState('');
  const [detectionMode, setDetectionMode] = useState<MicrophoneDetectionMode>('single');
  const [instrumentMode, setInstrumentMode] = useState<MicrophoneInstrumentMode>('concert');
  const [inputProfile, setInputProfile] = useState<InstrumentInputProfile>('microphone');
  const [ampInputChoice, setAmpInputChoice] = useState<AmpInputChoiceReason | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const sampleTapRef = useRef<SampleTap | null>(null);
  const sessionRef = useRef(0);
  const animationFrameRef = useRef<number | null>(null);
  const lastAnalysisAtRef = useRef(0);
  const lastLevelUpdateAtRef = useRef(0);
  const lastDisplaySignatureRef = useRef('');
  const selectedDeviceIdRef = useRef('');
  const inputDevicesRef = useRef<MicrophoneInputDevice[]>([]);
  const detectionModeRef = useRef<MicrophoneDetectionMode>('single');
  const instrumentModeRef = useRef<MicrophoneInstrumentMode>('concert');
  const inputProfileRef = useRef<InstrumentInputProfile>('microphone');
  const instrumentModeBeforeAmpRef = useRef<MicrophoneInstrumentMode>('concert');
  const gateRef = useRef(new MicrophoneNoteGate({
    settleMs: 100,
    transitionSettleMs: 70,
    releaseMs: 120,
  }));
  const trackerRef = useRef<GuitarNoteTracker | null>(null);
  const levelMeterRef = useRef(new HeldLevelMeter());
  const onChordRef = useRef(onChord);
  const preferFlatsRef = useRef(preferFlats);

  useEffect(() => { onChordRef.current = onChord; }, [onChord]);
  useEffect(() => { preferFlatsRef.current = preferFlats; }, [preferFlats]);

  useEffect(() => {
    // Restore a remembered amp profile after hydration; the server render and
    // the first client render stay on the microphone default.
    if (readInputProfile() !== 'guitar-amp') return;
    inputProfileRef.current = 'guitar-amp';
    setInputProfile('guitar-amp');
    instrumentModeBeforeAmpRef.current = instrumentModeRef.current;
    instrumentModeRef.current = 'guitar';
    setInstrumentMode('guitar');
  }, []);

  const clearDetectedPitch = useCallback(() => {
    lastDisplaySignatureRef.current = '';
    setDetectedPitchLabel('');
    setDetectedSoundingPitchLabel('');
  }, []);

  const stopAudio = useCallback(() => {
    sessionRef.current += 1;
    if (animationFrameRef.current != null) cancelAnimationFrame(animationFrameRef.current);
    animationFrameRef.current = null;
    sampleTapRef.current?.disconnect();
    sampleTapRef.current = null;
    trackerRef.current = null;
    levelMeterRef.current.reset();
    streamRef.current?.getTracks().forEach((track) => track.stop());
    streamRef.current = null;
    analyserRef.current?.disconnect();
    analyserRef.current = null;
    const audioContext = audioContextRef.current;
    audioContextRef.current = null;
    if (audioContext && audioContext.state !== 'closed') void audioContext.close();
    gateRef.current.reset();
    clearDetectedPitch();
    setSignalLevelDb(-120);
    setLineSignalPeakDb(-140);
  }, [clearDetectedPitch]);

  const disable = useCallback(() => {
    stopAudio();
    setEnabled(false);
    setStatus('idle');
  }, [stopAudio]);

  /** Writes source-neutral sounding notes into the score: one note, or the strings of one chord. */
  const writeSoundingNotes = useCallback((soundingMidis: number[]) => {
    if (soundingMidis.length === 0) return;
    const written = notationMidisForInstrument(soundingMidis, instrumentModeRef.current);
    onChordRef.current(
      normalizeMidiChord(written, preferFlatsRef.current),
      detectionModeRef.current,
    );
  }, []);

  const showSoundingMidis = useCallback((soundingMidis: number[]) => {
    const writtenMidis = notationMidisForInstrument(soundingMidis, instrumentModeRef.current);
    const displaySignature = `${instrumentModeRef.current}:${writtenMidis.join(',')}`;
    if (displaySignature === lastDisplaySignatureRef.current) return;
    lastDisplaySignatureRef.current = displaySignature;
    setDetectedSoundingPitchLabel(formatPitchLabel(normalizeMidiChord(soundingMidis, preferFlatsRef.current)));
    setDetectedPitchLabel(formatPitchLabel(normalizeMidiChord(writtenMidis, preferFlatsRef.current)));
  }, []);

  const enable = useCallback(async (requestedDeviceId?: string) => {
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

    const profile = inputProfileRef.current;
    const session = sessionRef.current + 1;
    sessionRef.current = session;
    setEnabled(true);
    setStatus('requesting');
    let audioContext: AudioContext | null = null;
    let stream: MediaStream | null = null;
    try {
      // Start the audio context while the REC click is still the active user
      // gesture. Creating it after the asynchronous permission prompt can
      // leave resume() pending indefinitely in Chromium/Electron.
      const activeAudioContext = new AudioContextConstructor();
      audioContext = activeAudioContext;
      await activeAudioContext.resume();
      stream = await navigator.mediaDevices.getUserMedia({
        audio: audioConstraintsForProfile(profile, requestedDeviceId),
        video: false,
      });
      // Device labels are only known once the permission is granted, so the
      // list is read after the stream has been opened.
      const availableDevices = (await navigator.mediaDevices.enumerateDevices())
        .filter((device) => device.kind === 'audioinput')
        .map((device, index) => ({
          deviceId: device.deviceId,
          label: device.label || `Microphone ${index + 1}`,
        }));
      let activeDeviceId = stream.getAudioTracks()[0]?.getSettings().deviceId
        ?? requestedDeviceId
        ?? '';
      if (profile === 'guitar-amp') {
        const choice = requestedDeviceId
          ? null
          : pickAmpInputDevice(availableDevices, readRememberedAmpInput());
        setAmpInputChoice(choice?.reason ?? 'remembered');
        if (choice?.deviceId && choice.deviceId !== activeDeviceId) {
          stream.getTracks().forEach((track) => track.stop());
          stream = await navigator.mediaDevices.getUserMedia({
            audio: audioConstraintsForProfile(profile, choice.deviceId),
            video: false,
          });
          activeDeviceId = stream.getAudioTracks()[0]?.getSettings().deviceId ?? choice.deviceId;
        }
      } else {
        setAmpInputChoice(null);
      }
      if (sessionRef.current !== session) {
        stream.getTracks().forEach((track) => track.stop());
        if (activeAudioContext.state !== 'closed') void activeAudioContext.close();
        return;
      }
      selectedDeviceIdRef.current = activeDeviceId;
      setSelectedDeviceId(activeDeviceId);
      inputDevicesRef.current = availableDevices;
      setInputDevices(availableDevices);
      const source = activeAudioContext.createMediaStreamSource(stream);
      streamRef.current = stream;
      audioContextRef.current = activeAudioContext;
      gateRef.current.reset();

      if (profile === 'guitar-amp') {
        // Every sample reaches the tracker, also while the window is hidden.
        const tracker = new GuitarNoteTracker(activeAudioContext.sampleRate, midiRangeForProfile(profile));
        tracker.setChordDetection(detectionModeRef.current === 'strum');
        trackerRef.current = tracker;
        levelMeterRef.current.reset();
        let displayed = '';
        const tap = await createSampleTap(activeAudioContext, source, (samples) => {
          if (trackerRef.current !== tracker) return;
          const events = tracker.process(samples);
          const nowMs = tracker.seconds * 1000;
          levelMeterRef.current.push(nowMs, tracker.levelDb, tracker.peakDb);
          for (const midis of simultaneousNoteOns(events)) writeSoundingNotes(midis);
          const sounding = tracker.soundingMidis.join(',');
          if (sounding !== displayed) {
            displayed = sounding;
            showSoundingMidis([...tracker.soundingMidis]);
          }
          if (nowMs - lastLevelUpdateAtRef.current >= 220 || nowMs < lastLevelUpdateAtRef.current) {
            lastLevelUpdateAtRef.current = nowMs;
            setSignalLevelDb(Math.max(-120, levelMeterRef.current.rmsDb));
            setLineSignalPeakDb(levelMeterRef.current.peakDb);
          }
        });
        if (sessionRef.current !== session) {
          tap.disconnect();
          return;
        }
        sampleTapRef.current = tap;
        await activeAudioContext.resume();
        setStatus('listening');
        return;
      }

      const analyser = activeAudioContext.createAnalyser();
      analyser.fftSize = 8192;
      analyser.minDecibels = -110;
      analyser.maxDecibels = -10;
      analyser.smoothingTimeConstant = 0.46;
      source.connect(analyser);
      await activeAudioContext.resume();
      analyserRef.current = analyser;
      const timeDomain = new Float32Array(analyser.fftSize);
      const { minMidi, maxMidi } = midiRangeForProfile(profile);

      const analyze = (nowMs: number) => {
        if (analyserRef.current !== analyser) return;
        animationFrameRef.current = requestAnimationFrame(analyze);
        if (nowMs - lastAnalysisAtRef.current < analysisIntervalMs) return;
        lastAnalysisAtRef.current = nowMs;
        analyser.getFloatTimeDomainData(timeDomain);
        let squareSum = 0;
        for (const sample of timeDomain) squareSum += sample * sample;
        const rms = Math.sqrt(squareSum / timeDomain.length);
        const rawSignalLevelDb = rms > 0 ? 20 * Math.log10(rms) : -120;
        const monophonicPitch = detectPitchFromTimeDomain(timeDomain, {
          sampleRate: activeAudioContext.sampleRate,
          minMidi,
          maxMidi,
          minimumLevelDb: MICROPHONE_DETECTION_MINIMUM_LEVEL_DB,
        });
        const soundingMidis = monophonicPitch ? [monophonicPitch.midi] : [];
        showSoundingMidis(soundingMidis);
        if (nowMs - lastLevelUpdateAtRef.current >= 220) {
          lastLevelUpdateAtRef.current = nowMs;
          setSignalLevelDb(Math.max(-120, rawSignalLevelDb));
        }
        const emitted = gateRef.current.push(soundingMidis, nowMs);
        if (emitted) {
          const written = notationMidisForInstrument(emitted, instrumentModeRef.current);
          onChordRef.current(
            normalizeMidiChord(written, preferFlatsRef.current),
            detectionModeRef.current,
          );
        }
      };

      setStatus('listening');
      animationFrameRef.current = requestAnimationFrame(analyze);
    } catch (error) {
      stream?.getTracks().forEach((track) => track.stop());
      if (audioContext && audioContext.state !== 'closed') void audioContext.close();
      if (sessionRef.current !== session) return;
      stopAudio();
      setEnabled(false);
      setStatus(
        error instanceof DOMException && ['NotAllowedError', 'SecurityError'].includes(error.name)
          ? 'denied'
          : 'error',
      );
    }
  }, [analysisIntervalMs, showSoundingMidis, stopAudio, writeSoundingNotes]);

  const toggle = useCallback(async () => {
    if (enabled) {
      disable();
      return;
    }
    await enable(selectedDeviceIdRef.current || undefined);
  }, [disable, enable, enabled]);

  const selectDevice = useCallback(async (deviceId: string) => {
    selectedDeviceIdRef.current = deviceId;
    setSelectedDeviceId(deviceId);
    if (inputProfileRef.current === 'guitar-amp') {
      const device = inputDevicesRef.current.find((candidate) => candidate.deviceId === deviceId);
      writeRememberedAmpInput({ deviceId, label: device?.label ?? '' });
      setAmpInputChoice('remembered');
    }
    if (!enabled) return;
    stopAudio();
    await enable(deviceId);
  }, [enable, enabled, stopAudio]);

  const selectDetectionMode = useCallback((mode: MicrophoneDetectionMode) => {
    detectionModeRef.current = mode;
    setDetectionMode(mode);
    trackerRef.current?.setChordDetection(mode === 'strum');
    gateRef.current.reset();
    clearDetectedPitch();
  }, [clearDetectedPitch]);

  const selectInstrumentMode = useCallback((mode: MicrophoneInstrumentMode) => {
    instrumentModeRef.current = mode;
    setInstrumentMode(mode);
    gateRef.current.reset();
    clearDetectedPitch();
  }, [clearDetectedPitch]);

  const selectInputProfile = useCallback(async (profile: InstrumentInputProfile) => {
    if (profile === inputProfileRef.current) return;
    if (profile === 'guitar-amp') {
      instrumentModeBeforeAmpRef.current = instrumentModeRef.current;
      selectInstrumentMode('guitar');
    } else {
      selectInstrumentMode(instrumentModeBeforeAmpRef.current);
    }
    inputProfileRef.current = profile;
    setInputProfile(profile);
    writeInputProfile(profile);
    if (profile === 'microphone') {
      setAmpInputChoice(null);
      // Strummed chords are read from the line signal only.
      if (detectionModeRef.current === 'strum') selectDetectionMode('single');
    }
    if (!enabled) return;
    stopAudio();
    // The amp profile chooses its own input (remembered or Spark); the
    // microphone profile keeps the device that was in use.
    await enable(profile === 'guitar-amp' ? undefined : selectedDeviceIdRef.current || undefined);
  }, [enable, enabled, selectDetectionMode, selectInstrumentMode, stopAudio]);

  useEffect(() => () => stopAudio(), [stopAudio]);

  return {
    enabled,
    status,
    detectedPitchLabel,
    detectedSoundingPitchLabel,
    signalLevelDb,
    signalQuality: inputProfile === 'guitar-amp'
      ? classifyLineSignalLevel(signalLevelDb, lineSignalPeakDb)
      : classifyMicrophoneSignalLevel(signalLevelDb),
    inputDevices,
    selectedDeviceId,
    detectionMode,
    instrumentMode,
    inputProfile,
    ampInputChoice,
    enable,
    disable,
    toggle,
    selectDevice,
    selectDetectionMode,
    selectInstrumentMode,
    selectInputProfile,
  };
}
