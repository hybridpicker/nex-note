'use client';

import { channelGainFactor, type MixerState } from '@/lib/playback-mixer';
import { captureInputMetric, markInputFeedback } from '@/src/score-input/input-metrics';
import { startTransition, useRef, useState, useCallback, useEffect, type RefObject } from 'react';
import { dbg } from '@/lib/debug';
import { probeAudio, probeMark, probeRegisterAudioContext } from '@/lib/playback-sync-probe';
import { createAudibleClock, readPlaybackLatencyCalibrationSeconds, type AudibleClock } from '@/lib/playback-clock';
import { createPlaybackTicker, type PlaybackTicker } from '@/lib/playback-ticker';
import {
  beatsToSeconds as timelineBeatsToSeconds,
  buildPlaybackTimeline,
  secondsToBeats,
  type PlaybackLocation,
  type PlaybackSwing,
  type PlaybackTimeline,
} from '@/lib/playback-timeline';
import {
  resolveMidiInstrumentSound,
  resolveMidiSoundFromToneProgram,
  resolvePartInstrumentId,
  type MidiInstrumentSound,
  type SoundfontInstrumentName,
} from '@/lib/midi-instruments';
import {
  resolvePlaybackSampleFilename,
  type PlaybackSampleBank,
} from '@/lib/playback-sample-bank';
import type { SelectedNote } from '@/hooks/useNoteEditor';
import { getEffectiveMeasureTimingFromStaff } from '@/src/score-core/measure-timing';
import { buildPlaybackMeasureOrder } from '@/lib/playback-measure-order';
import type { ScoreDocumentModel, TimedEvent } from '@/src/score-core/model/types';
import { partTransposition } from '@/src/score-core/query/clipboard';
import { MASTER_GAIN, bufferPeak, velocityToGain } from '@/lib/playback-dynamics';
import {
  applyMixerToPartBuses,
  getPartBus,
  getPlaybackBus,
  resolveAutoPanTable,
  type PlaybackBus,
} from '@/lib/playback-bus';
import { isSustainingSoundfont, prepareSoundfontBuffers, shouldLoopNote, type SampleLoopPoints } from '@/lib/sample-loop';
import { SUSTAIN_PEDAL_CONTROLLER, applySustainPedal } from '@/lib/playback-midi-controllers';
import { METRONOME_CLICK, drumVoicePeak, playDrumHit, renderMetronomeClick, type DrumHitHandle } from '@/lib/drum-synth';
import { allowRemoteSoundfontFallback } from '@/lib/soundfont-source';

const LOCAL_SOUNDFONT_OPTIONS = {
  soundfont: 'FluidR3_GM' as const,
  nameToUrl: (name: string, soundfont?: string, format?: string) => `/soundfonts/${soundfont ?? 'FluidR3_GM'}/${name}-${format === 'ogg' ? 'ogg' : 'mp3'}.js`,
};

export type PlaybackState = 'stopped' | 'playing' | 'paused';

export interface PlaybackCursorTarget {
  measureNumber: number;
  timestampNum: number;
  timestampDen: number;
}

export interface PlaybackPlayheadSnapshot extends PlaybackCursorTarget {
  currentTimeMs: number;
  currentTimeSeconds: number;
  progressWithinMeasure: number;
  /** Position inside the measure in whole notes (the unit of score event timestamps). */
  positionWholes: number;
  /** Index of this pass through the measure in playback order (repeats unrolled). */
  spanIndex: number;
  startTimeMs: number;
  startTimeSeconds: number;
  isPaused: boolean;
}

export interface PlaybackTransportPosition {
  /** True while sound is playing; false shows the stopped/paused position. */
  playing: boolean;
  /** Score seconds the listener hears now (or the stopped/paused position). */
  scoreSeconds: number;
  location: PlaybackLocation;
  timeline: PlaybackTimeline;
  /** Measure that sounds after this one (repeats unrolled), so the playhead can glide into it. */
  nextMeasureNumber: number | null;
  /** Changes whenever playback starts, stops, seeks or restarts. */
  generation: number;
}

/**
 * Read-only view of the playback clock for per-frame drawing. `read(atMs)` answers "what does
 * the listener hear at performance time atMs" from the audio output clock, without React.
 */
export interface PlaybackTransport {
  read(atMs?: number): PlaybackTransportPosition | null;
  audioContext(): AudioContext | null;
  /**
   * Called synchronously when a run starts or ends (play, pause, stop, seek, end of piece), so
   * drawing can start with the sound instead of after React has re-rendered.
   */
  subscribe(listener: () => void): () => void;
}

type PlaybackPlayer = import('soundfont-player').Player;
type PlaybackNoteHandle = {
  stop?: (when?: number) => unknown;
};
type PlaybackPlayerStart = (
  note: string | number,
  when?: number,
  options?: Partial<{
    gain: number;
    attack: number;
    decay: number;
    sustain: number;
    release: number;
    adsr: [number, number, number, number];
    duration: number;
    loop: boolean;
    loopStart: number;
    loopEnd: number;
  }>,
) => unknown;

interface MidiNote {
  time: number;      // seconds from start (score time)
  duration: number;  // seconds
  midi: number;      // MIDI note number 0-127
  velocity: number;  // 0-1
  multiplicity?: number; // simultaneous identical note count
  soundfont?: SoundfontInstrumentName;
  partId?: string;
  /** General MIDI percussion (channel 10): `midi` is a drum key, played by lib/drum-synth.ts. */
  percussion?: boolean;
}

interface TempoEntry {
  bpm: number;
  time: number; // seconds from start
}

interface ParsedMidi {
  rawNotes: MidiNote[];
  notes: MidiNote[];
  tempos: TempoEntry[];
  durationSeconds: number;
  timeSignatureNumerator: number;
  timeSignatureDenominator?: number;
  /** Swing applied to the notes; the timeline removes it again to place the playhead. */
  swing?: PlaybackSwing | null;
}

interface MeasureBeatRange {
  measureNumber: number;
  startBeat: number;
  endBeat: number;
  beats?: number;
  beatType?: number;
}

// Audio is scheduled against the AudioContext clock from a worker timer (lib/playback-ticker.ts),
// SCHEDULER_TICK_MS apart, for the next LOOKAHEAD_S. The look-ahead covers main-thread blocks of
// that length; a longer block moves the whole transport later (sound and picture together)
// instead of playing notes late or dropping them.
const LOOKAHEAD_S = 0.3;
const SCHEDULER_TICK_MS = 25;
// A note must reach the audio graph at least this long before it is due.
const MIN_SCHEDULE_LEAD_S = 0.008;
// Playback starts this long after Play: enough for the first notes to be handed to the audio
// thread before they are due.
const START_LEAD_S = 0.015;
// The master level is committed this far behind the look-ahead edge, so a note entering the
// window can still lower the level a few milliseconds before it starts.
const LEVEL_COMMIT_MARGIN_S = 0.02;
const SOUND_FONT_LOAD_TIMEOUT_MS = 5000;
const PLAYHEAD_END_EPSILON_S = 0.02;
const PLAYHEAD_RENDER_LEAD_S = 0;
const PLAYHEAD_PROGRESS_EPSILON = 0.002;
const CURSOR_TIMESTAMP_DEN = 64;

const NOTE_NAMES = ['C','C#','D','D#','E','F','F#','G','G#','A','A#','B'];
const MIDI_TIME_EPSILON_S = 0.001;

export async function activatePlaybackAudioContext(
  audioContext: Pick<AudioContext, 'resume' | 'state'>,
) {
  if (audioContext.state === 'closed') {
    throw new Error('The audio output is closed. Tap Play again.');
  }
  if (shouldResumePlaybackAudioContext(audioContext.state)) {
    await audioContext.resume();
  }
}

/**
 * Whether a context in this state needs `resume()`: suspended, or WebKit's `interrupted` (iOS
 * after a phone call, Siri or another app taking the audio session).
 */
export function shouldResumePlaybackAudioContext(state: string) {
  return state === 'suspended' || state === 'interrupted';
}

type PlaybackMidiResponse = Pick<Response, 'arrayBuffer' | 'json' | 'ok'>;

export async function loadPlaybackMidiBuffer(
  xml: string,
  fetchImpl: (input: string, init: RequestInit) => Promise<PlaybackMidiResponse> = fetch,
) {
  let serverError: unknown = null;
  try {
    const response = await fetchImpl('/api/midi', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ xml }),
    });
    if (response.ok) {
      return {
        buffer: await response.arrayBuffer(),
        renderer: 'server' as const,
      };
    }
    serverError = await response.json().catch(() => ({ error: 'MIDI export failed.' }));
  } catch (error) {
    serverError = error;
  }

  try {
    const { buildFallbackMidiFromMusicXml } = await import('@/lib/midi-export');
    const fallback = buildFallbackMidiFromMusicXml(xml);
    return {
      buffer: Uint8Array.from(fallback.data).buffer,
      renderer: 'client-fallback' as const,
    };
  } catch (fallbackError) {
    const fallbackMessage = fallbackError instanceof Error
      ? fallbackError.message
      : 'Client MIDI fallback failed.';
    const serverMessage = serverError
      && typeof serverError === 'object'
      && 'error' in serverError
      && typeof serverError.error === 'string'
      ? serverError.error
      : serverError instanceof Error
        ? serverError.message
        : '';
    throw new Error([serverMessage, fallbackMessage].filter(Boolean).join(' '));
  }
}

export function resolvePlaybackSoundfontInstrument(
  coreDocument: ScoreDocumentModel | null | undefined,
  partId?: string | null,
): SoundfontInstrumentName {
  const parts = coreDocument?.score.parts ?? [];
  const part = (partId
    ? parts.find((candidate) => candidate.id === partId || candidate.sourcePartId === partId)
    : null) ?? parts[0];
  // The other parts decide a bare "Bass" (choir voice or bass instrument), as in playback.
  return resolveMidiInstrumentSound(resolvePartInstrumentId(part, { siblings: parts })).soundfont;
}

type MidiTrackInstrument = {
  name?: string;
  channel: number;
  instrument: {
    number: number;
    percussion: boolean;
  };
};

function normalizeTrackName(value: string | null | undefined) {
  return (value ?? '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
}

export function resolvePlaybackTrackSound(
  track: MidiTrackInstrument,
  coreDocument: ScoreDocumentModel | null | undefined,
  trackIndex = 0,
  trackCount = 1,
): MidiInstrumentSound & { usedFallback: boolean } {
  const part = resolvePlaybackTrackPart(track, coreDocument, trackIndex, trackCount);
  const fallbackInstrumentId = resolvePartInstrumentId(part, { siblings: coreDocument?.score.parts ?? [] });

  return resolveMidiSoundFromToneProgram(track.instrument.number, {
    percussion: track.instrument.percussion || track.channel === 9,
    fallbackInstrumentId,
  });
}

export function resolvePlaybackTrackPart(
  track: MidiTrackInstrument,
  coreDocument: ScoreDocumentModel | null | undefined,
  trackIndex = 0,
  trackCount = 1,
) {
  const parts = coreDocument?.score.parts ?? [];
  const staffHas = (staff: (typeof parts)[number]['staves'][number], test: (event: TimedEvent) => boolean) => (
    staff.measures.some((measure) => measure.voices.some((voice) => voice.events.some((event) => !event.hidden && test(event))))
  );
  const isPitched = (event: TimedEvent) => event.kind === 'note';
  const isUnpitched = (event: TimedEvent) => event.kind === 'rest' && Boolean(event.unpitched);
  // Both renderers write one track per staff with notes; the fallback renderer (and MuseScore for
  // a drum staff) writes unpitched notes on a percussion track of their own, after the pitched one.
  const lanes = parts.flatMap((part) => part.staves.flatMap((staff) => [
    ...(staffHas(staff, isPitched) ? [part] : []),
    ...(staffHas(staff, isUnpitched) ? [part] : []),
  ]));
  if (trackCount === lanes.length && lanes[trackIndex]) return lanes[trackIndex]!;
  const pitchedLanes = parts.flatMap((part) => part.staves.filter((staff) => staffHas(staff, isPitched)).map(() => part));
  if (trackCount === pitchedLanes.length && pitchedLanes[trackIndex]) return pitchedLanes[trackIndex]!;

  // By name: an exact name ("Violin II", "Piano staff 2") first, else the longest name the track
  // name contains, so "Violin II" is not taken for "Violin I".
  const trackName = normalizeTrackName(track.name);
  if (trackName) {
    const candidates = parts.flatMap((part) => [part.name, part.instrumentName]
      .map((name) => normalizeTrackName(name))
      .filter(Boolean)
      .map((name) => ({ part, name })));
    const exact = candidates.find(({ name }) => trackName === name || trackName.replace(/ staff \d+$/, '') === name);
    if (exact) return exact.part;
    const contained = candidates
      .filter(({ name }) => trackName.includes(name) || name.includes(trackName))
      .sort((left, right) => right.name.length - left.name.length)[0];
    if (contained) return contained.part;
  }
  const percussionTrack = track.instrument.percussion || track.channel === 9;
  const drumParts = parts.filter((part) => part.staves.some((staff) => staffHas(staff, isUnpitched)));
  if (percussionTrack && drumParts.length === 1) return drumParts[0]!;
  const positionalPart = trackCount === parts.length ? parts[trackIndex] : null;
  const onlyPart = parts.length === 1 ? parts[0] : null;
  return positionalPart ?? onlyPart ?? null;
}

function firstTempoBpm(parsed: Pick<ParsedMidi, 'tempos'>) {
  const bpm = parsed.tempos[0]?.bpm ?? 120;
  return Number.isFinite(bpm) && bpm > 0 ? bpm : 120;
}

export function resolvePlaybackTempoScale(parsed: Pick<ParsedMidi, 'tempos'>, tempoOverride: number | null | undefined) {
  if (!Number.isFinite(tempoOverride) || tempoOverride == null || tempoOverride <= 0) return 1;
  return tempoOverride / firstTempoBpm(parsed);
}

export function resolvePlaybackQuarterBeatSeconds(parsed: Pick<ParsedMidi, 'tempos'>, tempoOverride: number | null | undefined) {
  return (60 / firstTempoBpm(parsed)) / resolvePlaybackTempoScale(parsed, tempoOverride);
}

export function resolvePlaybackTempoChangeOrigin(params: {
  parsed: Pick<ParsedMidi, 'tempos' | 'durationSeconds'>;
  currentAcSeconds: number;
  originAcSeconds: number;
  currentTempoOverride: number | null | undefined;
  nextTempoOverride: number | null | undefined;
}) {
  const currentScale = resolvePlaybackTempoScale(params.parsed, params.currentTempoOverride);
  const currentScoreSeconds = Math.max(
    0,
    Math.min((params.currentAcSeconds - params.originAcSeconds) * currentScale, params.parsed.durationSeconds),
  );
  const nextScale = resolvePlaybackTempoScale(params.parsed, params.nextTempoOverride);
  return {
    currentScoreSeconds,
    originAcSeconds: params.currentAcSeconds - currentScoreSeconds / nextScale,
  };
}

function midiName(midi: number) {
  return NOTE_NAMES[midi % 12] + String(Math.floor(midi / 12) - 1);
}

function midiToFrequency(midi: number) {
  return 440 * (2 ** ((midi - 69) / 12));
}

function startPlaybackNote(
  player: PlaybackPlayer,
  note: number,
  when?: number,
  options?: Parameters<PlaybackPlayerStart>[2],
) {
  return (player.start as PlaybackPlayerStart)(note, when, options);
}

function isStoppablePlaybackHandle(handle: unknown): handle is PlaybackNoteHandle {
  return handle != null
    && typeof handle === 'object'
    && 'stop' in handle
    && typeof (handle as PlaybackNoteHandle).stop === 'function';
}

// The triangle fallback is far louder than a soundfont sample at the same gain; this brings its
// peak to that of a typical sample (about -16 dBFS at gain 1).
const OSCILLATOR_FALLBACK_LEVEL = 0.15;
// Peak assumed for a sample whose buffer could not be measured (an injected test loader).
const NOMINAL_SAMPLE_PEAK = 0.12;
// sample-player's default release; a stopped note sounds this much longer.
const PLAYER_RELEASE_S = 0.3;
const AUDITION_GAIN = velocityToGain(90 / 127);
const AUDITION_DECAYING_SECONDS = 1.0;
const AUDITION_SUSTAINED_MAX_SECONDS = 0.8;
const AUDITION_SUSTAINED_MIN_SECONDS = 0.2;

const bufferPeakCache = new WeakMap<object, number>();
function cachedBufferPeak(buffer: AudioBuffer | null | undefined) {
  if (!buffer || typeof buffer.getChannelData !== 'function') return NOMINAL_SAMPLE_PEAK;
  const cached = bufferPeakCache.get(buffer);
  if (cached != null) return cached;
  // Samples peak in their attack; scanning the first second keeps this cheap for long samples.
  const peak = bufferPeak(buffer, Math.round((buffer.sampleRate || 44100) * 1.0)) || NOMINAL_SAMPLE_PEAK;
  bufferPeakCache.set(buffer, peak);
  return peak;
}

function clampNoteGain(gain: number) {
  return Math.max(0.001, Math.min(1.5, gain));
}

/** Sends a started note to `destination` instead of its player's output (per-part bus). */
function routeHandleTo(handle: unknown, destination: AudioNode) {
  const node = handle as { connect?: (target: AudioNode) => unknown; disconnect?: () => unknown } | null;
  if (!node || typeof node.connect !== 'function' || typeof node.disconnect !== 'function') return false;
  try {
    node.disconnect();
    node.connect(destination);
    return true;
  } catch {
    return false;
  }
}

/** Written pitch to sounding MIDI number: a B flat clarinet's written D5 sounds C5. */
export function resolveAuditionMidi(
  note: Pick<SelectedNote, 'step' | 'octave' | 'alter' | 'corePartId'>,
  coreDocument: ScoreDocumentModel | null | undefined,
) {
  const parts = coreDocument?.score.parts ?? [];
  const part = note.corePartId
    ? parts.find((candidate) => candidate.id === note.corePartId || candidate.sourcePartId === note.corePartId)
    : (parts.length === 1 ? parts[0] : undefined);
  return noteToMidiNumber(note) + (part ? partTransposition(part).chromatic : 0);
}

const DURATION_TYPE_QUARTERS: Record<string, number> = {
  maxima: 32, long: 16, breve: 8, whole: 4, half: 2, quarter: 1, eighth: 0.5,
  '16th': 0.25, '32nd': 0.125, '64th': 0.0625, '128th': 0.03125, '256th': 0.015625,
};

/**
 * How long an audition sounds: decaying instruments ring about a second; sustained ones last the
 * note's length at the tempo, at most 0.8 s (and at least 0.2 s, so short notes are heard).
 */
export function resolveAuditionDurationSeconds(params: {
  soundfont: string;
  durationType?: string | null;
  isDotted?: boolean;
  quarterSeconds?: number | null;
}) {
  if (!isSustainingSoundfont(params.soundfont)) return AUDITION_DECAYING_SECONDS;
  const quarters = (DURATION_TYPE_QUARTERS[params.durationType ?? ''] ?? 1) * (params.isDotted ? 1.5 : 1);
  const quarterSeconds = params.quarterSeconds != null && Number.isFinite(params.quarterSeconds) && params.quarterSeconds > 0
    ? params.quarterSeconds
    : 0.5;
  return Math.max(AUDITION_SUSTAINED_MIN_SECONDS, Math.min(AUDITION_SUSTAINED_MAX_SECONDS, quarters * quarterSeconds));
}

/** Gain of each note of an auditioned chord: quieter per note, so the chord is about as loud. */
function auditionChordGain(noteCount: number) {
  return Math.max(AUDITION_GAIN * 0.45, Math.min(AUDITION_GAIN, AUDITION_GAIN / Math.sqrt(Math.max(1, noteCount))));
}

/** Parts that carry notes, with their instrument, for the automatic seating. */
const documentPanCache = new WeakMap<ScoreDocumentModel, Map<string, number>>();
export function resolveDocumentPartPans(coreDocument: ScoreDocumentModel | null | undefined): Map<string, number> {
  if (!coreDocument) return new Map();
  const cached = documentPanCache.get(coreDocument);
  if (cached) return cached;
  const playableParts = coreDocument.score.parts.filter((part) => part.staves.some((staff) => (
    staff.measures.some((measure) => measure.voices.some((voice) => voice.events.some((event) => event.kind === 'note' && !event.hidden)))
  )));
  const byId = resolveAutoPanTable(playableParts.map((part) => ({ id: part.id, instrumentId: resolvePartInstrumentId(part, { siblings: coreDocument.score.parts }) })));
  const pans = new Map<string, number>();
  playableParts.forEach((part) => {
    const pan = byId.get(part.id) ?? 0;
    pans.set(part.id, pan);
    if (part.sourcePartId) pans.set(part.sourcePartId, pan);
  });
  documentPanCache.set(coreDocument, pans);
  return pans;
}

const clickBufferCache = new WeakMap<object, { accent: AudioBuffer; beat: AudioBuffer } | null>();
function metronomeClickBuffers(ac: AudioContext) {
  if (clickBufferCache.has(ac)) return clickBufferCache.get(ac) ?? null;
  let buffers: { accent: AudioBuffer; beat: AudioBuffer } | null = null;
  try {
    if (typeof ac.createBuffer === 'function' && typeof ac.createBufferSource === 'function') {
      const sampleRate = ac.sampleRate || 44100;
      const make = (accent: boolean) => {
        const data = renderMetronomeClick(sampleRate, accent);
        const buffer = ac.createBuffer(1, data.length, sampleRate);
        buffer.getChannelData(0).set(data);
        return buffer;
      };
      buffers = { accent: make(true), beat: make(false) };
    }
  } catch {
    buffers = null;
  }
  clickBufferCache.set(ac, buffers);
  return buffers;
}

function canSynthesizeDrums(ac: AudioContext) {
  return typeof ac.createBiquadFilter === 'function'
    && typeof ac.createBufferSource === 'function'
    && typeof ac.createBuffer === 'function'
    && typeof ac.createOscillator === 'function';
}

function hasE2eInstrumentLoader() {
  return typeof (globalThis as { __NEX_NOTE_E2E_INSTRUMENT_LOADER__?: unknown }).__NEX_NOTE_E2E_INSTRUMENT_LOADER__ === 'function';
}

function createOscillatorFallbackPlayer(ac: AudioContext, destination: AudioNode = ac.destination): PlaybackPlayer {
  const activeNodes = new Set<{
    oscillator: OscillatorNode;
    gain: GainNode;
    stop: (when?: number) => void;
  }>();

  const stopAll = (when = ac.currentTime) => {
    activeNodes.forEach((node) => node.stop(when));
    return [];
  };

  const start = (
    note: string | number,
    when = ac.currentTime,
    options?: Parameters<PlaybackPlayerStart>[2],
  ) => {
    const midi = Number(note);
    if (!Number.isFinite(midi)) return undefined;

    const startAt = Math.max(ac.currentTime, when);
    const duration = Math.max(0.05, options?.duration ?? 0.4);
    const release = Math.max(0.02, options?.release ?? 0.08);
    const gainValue = Math.max(0.001, Math.min(1.5, options?.gain ?? 0.5)) * OSCILLATOR_FALLBACK_LEVEL;
    const attack = Math.max(0.001, Math.min(0.02, options?.attack ?? 0.005));

    const oscillator = ac.createOscillator();
    const gainNode = ac.createGain();
    oscillator.type = 'triangle';
    oscillator.frequency.setValueAtTime(midiToFrequency(midi), startAt);
    gainNode.gain.setValueAtTime(0.0001, startAt);
    gainNode.gain.exponentialRampToValueAtTime(gainValue, startAt + attack);
    gainNode.gain.exponentialRampToValueAtTime(0.0001, startAt + duration + release);
    oscillator.connect(gainNode);
    gainNode.connect(destination);
    oscillator.start(startAt);
    oscillator.stop(startAt + duration + release);

    const handle = {
      oscillator,
      gain: gainNode,
      // Lets the scheduler move the note to its part's bus.
      connect(target: AudioNode) { gainNode.connect(target); },
      disconnect() { gainNode.disconnect(); },
      stop(stopWhen = ac.currentTime) {
        const safeStopAt = Math.max(ac.currentTime, stopWhen);
        try {
          gainNode.gain.cancelScheduledValues(safeStopAt);
          gainNode.gain.setValueAtTime(Math.max(gainNode.gain.value, 0.0001), safeStopAt);
          gainNode.gain.exponentialRampToValueAtTime(0.0001, safeStopAt + release);
          oscillator.stop(safeStopAt + release);
        } catch {
          // Ignore duplicate-stop races from overlapping playback state changes.
        }
      },
    };

    oscillator.onended = () => {
      activeNodes.delete(handle);
      oscillator.disconnect();
      gainNode.disconnect();
    };

    activeNodes.add(handle);
    return handle as unknown;
  };

  const player = {
    start: start as PlaybackPlayer['start'],
    play: start as PlaybackPlayer['play'],
    stop: stopAll as PlaybackPlayer['stop'],
    on: () => player,
    connect: () => player,
    schedule: () => player,
    listenToMidi: () => player,
  };

  return player as PlaybackPlayer;
}

function startAudioSample(
  ac: AudioContext,
  buffer: AudioBuffer,
  when: number,
  gainValue: number,
  destination: AudioNode = ac.destination,
): PlaybackNoteHandle {
  const startAt = Math.max(ac.currentTime, when);
  const source = ac.createBufferSource();
  const gain = ac.createGain();
  source.buffer = buffer;
  gain.gain.setValueAtTime(clampNoteGain(gainValue), startAt);
  source.connect(gain);
  gain.connect(destination);

  let stopped = false;
  const disconnect = () => {
    try { source.disconnect(); } catch { /* Already disconnected. */ }
    try { gain.disconnect(); } catch { /* Already disconnected. */ }
  };
  const handle: PlaybackNoteHandle = {
    stop(stopWhen = ac.currentTime) {
      if (stopped) return;
      stopped = true;
      const releaseAt = Math.max(ac.currentTime, stopWhen);
      try {
        gain.gain.cancelScheduledValues(releaseAt);
        gain.gain.setValueAtTime(Math.max(gain.gain.value, 0.0001), releaseAt);
        gain.gain.exponentialRampToValueAtTime(0.0001, releaseAt + 0.03);
        source.stop(releaseAt + 0.03);
      } catch {
        disconnect();
      }
    },
  };
  source.onended = disconnect;
  source.start(startAt);
  return handle;
}

export function normalizeMidiNotes(notes: MidiNote[]): MidiNote[] {
  const sorted = [...notes].sort((a, b) => (
    a.time - b.time
    || a.midi - b.midi
    || b.duration - a.duration
    || b.velocity - a.velocity
  ));

  const normalized: MidiNote[] = [];
  for (const note of sorted) {
    const previous = normalized[normalized.length - 1];
    if (
      previous
      && previous.midi === note.midi
      && previous.soundfont === note.soundfont
      && previous.partId === note.partId
      && Math.abs(previous.time - note.time) <= MIDI_TIME_EPSILON_S
    ) {
      previous.duration = Math.max(previous.duration, note.duration);
      previous.velocity = Math.max(previous.velocity, note.velocity);
      previous.multiplicity = (previous.multiplicity ?? 1) + (note.multiplicity ?? 1);
      continue;
    }
    normalized.push({
      ...note,
      multiplicity: note.multiplicity ?? 1,
    });
  }

  return normalized.filter((note) => note.duration > 0);
}

function secondsToScoreBeatsUnclamped(seconds: number, parsed: Pick<ParsedMidi, 'tempos'>): number {
  return secondsToBeats(seconds, parsed.tempos);
}

function positiveModulo(value: number, divisor: number) {
  return ((value % divisor) + divisor) % divisor;
}

export function applySwingToMidiNotes(
  notes: MidiNote[],
  parsed: Pick<ParsedMidi, 'tempos'>,
  swingRatio?: number,
  swingUnit: ScoreDocumentModel['swingUnit'] = 'eighth',
): MidiNote[] {
  if (!Number.isFinite(swingRatio) || swingRatio == null || Math.abs(swingRatio - 0.5) < 0.001) {
    return notes;
  }

  const clampedRatio = Math.max(0.01, Math.min(0.99, swingRatio));
  const unitBeats = swingUnit === '16th' ? 0.25 : 0.5;
  const pairBeats = unitBeats * 2;
  const toleranceBeats = Math.max(0.015, unitBeats * 0.08);

  return notes.map((note) => {
    const onsetBeats = secondsToScoreBeatsUnclamped(note.time, parsed);
    const positionInPair = positiveModulo(onsetBeats, pairBeats);
    if (Math.abs(positionInPair - unitBeats) > toleranceBeats) return note;

    const pairStartBeats = onsetBeats - positionInPair;
    const swungOnsetBeats = pairStartBeats + (pairBeats * clampedRatio);
    const originalEndBeats = secondsToScoreBeatsUnclamped(note.time + note.duration, parsed);
    const pairEndBeats = pairStartBeats + pairBeats;
    const deltaBeats = swungOnsetBeats - onsetBeats;
    const swungEndBeats = Math.abs(originalEndBeats - pairEndBeats) <= toleranceBeats
      ? pairEndBeats
      : originalEndBeats + deltaBeats;
    const swungTime = beatsToSeconds(swungOnsetBeats, parsed);
    const swungEnd = beatsToSeconds(Math.max(swungOnsetBeats + 0.01, swungEndBeats), parsed);

    return {
      ...note,
      time: swungTime,
      duration: Math.max(0.01, swungEnd - swungTime),
    };
  }).sort((a, b) => a.time - b.time || a.midi - b.midi);
}

function summarizeSimultaneousDuplicates(notes: MidiNote[]) {
  const groups = new Map<string, { midi: number; time: number; count: number; maxDuration: number }>();
  for (const note of notes) {
    const quantizedTime = Math.round(note.time / MIDI_TIME_EPSILON_S) * MIDI_TIME_EPSILON_S;
    const key = `${note.midi}:${quantizedTime.toFixed(3)}`;
    const existing = groups.get(key);
    if (existing) {
      existing.count += 1;
      existing.maxDuration = Math.max(existing.maxDuration, note.duration);
      continue;
    }
    groups.set(key, {
      midi: note.midi,
      time: quantizedTime,
      count: 1,
      maxDuration: note.duration,
    });
  }

  const collisions = [...groups.values()]
    .filter((entry) => entry.count > 1)
    .sort((a, b) => a.time - b.time || a.midi - b.midi);

  return {
    duplicateGroupCount: collisions.length,
    duplicateNoteCount: collisions.reduce((sum, entry) => sum + entry.count, 0),
    sample: collisions.slice(0, 8),
  };
}

function summarizeMidiWindow(notes: MidiNote[], limit = 12) {
  return notes.slice(0, limit).map((note) => ({
    pitch: midiName(note.midi),
    midi: note.midi,
    time: Number(note.time.toFixed(3)),
    duration: Number(note.duration.toFixed(3)),
    velocity: Number(note.velocity.toFixed(3)),
    multiplicity: note.multiplicity ?? 1,
  }));
}

function formatDebugJson(label: string, value: unknown) {
  return `${label}\n${JSON.stringify(value, null, 2)}`;
}

function noteToMidiNumber(note: Pick<SelectedNote, 'step' | 'octave' | 'alter'>) {
  const STEP_TO_SEMITONE: Record<string, number> = {
    C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11,
  };
  return ((note.octave + 1) * 12) + (STEP_TO_SEMITONE[note.step] ?? 0) + note.alter;
}

function quarterBeatsPerMeasure(parsed: Pick<ParsedMidi, 'timeSignatureNumerator' | 'timeSignatureDenominator'>): number {
  const numerator = Math.max(parsed.timeSignatureNumerator, 1);
  const denominator = Math.max(parsed.timeSignatureDenominator ?? 4, 1);
  return numerator * (4 / denominator);
}

export function buildMeasureBeatRanges(
  coreDocument: ScoreDocumentModel | null | undefined,
  parsed: ParsedMidi,
): MeasureBeatRange[] {
  const referenceStaff = coreDocument?.score.parts[0]?.staves[0];
  if (!referenceStaff?.measures?.length) {
    const fallbackBeatsPerMeasure = quarterBeatsPerMeasure(parsed);
    const totalBeats = Math.max(fallbackBeatsPerMeasure, secondsToScoreBeats(parsed.durationSeconds, parsed));
    const measureCount = Math.max(1, Math.ceil(totalBeats / fallbackBeatsPerMeasure));
    return Array.from({ length: measureCount }, (_, index) => ({
      measureNumber: index + 1,
      startBeat: index * fallbackBeatsPerMeasure,
      endBeat: (index + 1) * fallbackBeatsPerMeasure,
      beats: Math.max(parsed.timeSignatureNumerator, 1),
      beatType: Math.max(parsed.timeSignatureDenominator ?? 4, 1),
    }));
  }

  let beatCursor = 0;
  return referenceStaff.measures.map((measure) => {
    const timing = getEffectiveMeasureTimingFromStaff(referenceStaff, { measureId: measure.id, measureNumber: measure.measureNumber });
    const beatsInMeasure = timing
      ? timing.durationDivisions / Math.max(timing.divisions, 1)
      : quarterBeatsPerMeasure(parsed);
    const startBeat = beatCursor;
    beatCursor += beatsInMeasure;
    return {
      measureNumber: measure.measureNumber,
      startBeat,
      endBeat: beatCursor,
      ...(timing?.timeSignature ? { beats: timing.timeSignature.beats, beatType: timing.timeSignature.beatType } : {}),
    };
  });
}

export function buildPlaybackMeasureBeatRanges(
  coreDocument: ScoreDocumentModel | null | undefined,
  parsed: ParsedMidi,
): MeasureBeatRange[] {
  const writtenRanges = buildMeasureBeatRanges(coreDocument, parsed);
  const order = buildPlaybackMeasureOrder(coreDocument?.score.parts[0]?.staves[0]?.measures);
  if (!order) return writtenRanges;

  const playbackRanges: MeasureBeatRange[] = [];
  let beatCursor = 0;
  for (const measureIndex of order) {
    const writtenRange = writtenRanges[measureIndex];
    if (!writtenRange) continue;
    const startBeat = beatCursor;
    beatCursor += Math.max(writtenRange.endBeat - writtenRange.startBeat, 0);
    playbackRanges.push({ ...writtenRange, startBeat, endBeat: beatCursor });
  }
  return playbackRanges.length ? playbackRanges : writtenRanges;
}

/**
 * Measure ranges that agree with the MIDI rendering. The server renderer (MuseScore) and the
 * built-in renderer both unroll repeats; if a rendering did not (its last note ends inside the
 * written length although the unrolled score is longer), the written order is used so the
 * playhead does not jump ahead of the sound after the first repeat.
 */
export function resolveRenderedMeasureBeatRanges(
  coreDocument: ScoreDocumentModel | null | undefined,
  parsed: ParsedMidi,
): MeasureBeatRange[] {
  const playbackRanges = buildPlaybackMeasureBeatRanges(coreDocument, parsed);
  const writtenRanges = buildMeasureBeatRanges(coreDocument, parsed);
  const unrolledEnd = playbackRanges[playbackRanges.length - 1]?.endBeat ?? 0;
  const writtenEnd = writtenRanges[writtenRanges.length - 1]?.endBeat ?? 0;
  if (unrolledEnd <= writtenEnd + 1e-6 || !parsed.notes.length) return playbackRanges;
  const lastNoteEndBeats = Math.max(...parsed.notes.map((note) => secondsToBeats(note.time + note.duration, parsed.tempos)));
  if (lastNoteEndBeats <= writtenEnd + 0.25) {
    dbg.warn('playback', 'MIDI rendering did not unroll repeats; the playhead follows the written order');
    return writtenRanges;
  }
  if (lastNoteEndBeats > unrolledEnd + 0.25) {
    dbg.warn('playback', `MIDI rendering is longer than the unrolled score (${lastNoteEndBeats.toFixed(2)} > ${unrolledEnd.toFixed(2)} beats): jumps such as D.C./D.S. are not followed by the playhead`);
  }
  return playbackRanges;
}

export function resolveFullPlaybackDurationSeconds(
  coreDocument: ScoreDocumentModel | null | undefined,
  parsed: ParsedMidi,
  audibleDurationSeconds = parsed.durationSeconds,
) {
  const measureBeatRanges = resolveRenderedMeasureBeatRanges(coreDocument, parsed);
  const fullScoreDurationSeconds = measureBeatRanges.length
    ? beatsToSeconds(measureBeatRanges[measureBeatRanges.length - 1].endBeat, parsed)
    : 0;
  return Math.max(audibleDurationSeconds, fullScoreDurationSeconds);
}

function secondsToScoreBeats(seconds: number, parsed: ParsedMidi): number {
  return secondsToBeats(Math.max(0, Math.min(seconds, parsed.durationSeconds)), parsed.tempos);
}

export function scoreSecondsToCursorTarget(seconds: number, parsed: ParsedMidi): PlaybackCursorTarget {
  return scoreSecondsToCursorTargetWithMeasures(seconds, parsed, buildMeasureBeatRanges(null, parsed));
}

export function scoreSecondsToCursorTargetForDocument(
  seconds: number,
  parsed: ParsedMidi,
  coreDocument: ScoreDocumentModel | null | undefined,
): PlaybackCursorTarget {
  return scoreSecondsToCursorTargetWithMeasures(seconds, parsed, buildPlaybackMeasureBeatRanges(coreDocument, parsed));
}

const timelineCache = new WeakMap<MeasureBeatRange[], { parsed: ParsedMidi; timeline: PlaybackTimeline }>();

/** The playback timeline of a MIDI rendering and its measure ranges (cached per ranges array). */
export function playbackTimelineFor(parsed: ParsedMidi, measureBeatRanges: MeasureBeatRange[]): PlaybackTimeline {
  const cached = timelineCache.get(measureBeatRanges);
  if (cached?.parsed === parsed) return cached.timeline;
  const timeline = buildPlaybackTimeline({
    ranges: measureBeatRanges,
    tempos: parsed.tempos,
    durationSeconds: parsed.durationSeconds,
    swing: parsed.swing ?? null,
    fallbackTimeSignature: {
      beats: Math.max(parsed.timeSignatureNumerator, 1),
      beatType: Math.max(parsed.timeSignatureDenominator ?? 4, 1),
    },
  });
  timelineCache.set(measureBeatRanges, { parsed, timeline });
  return timeline;
}

/** Cursor target of a location: the position inside the measure in whole notes. */
function locationToCursorTarget(location: PlaybackLocation): PlaybackCursorTarget {
  return {
    measureNumber: location.measureNumber,
    timestampNum: Math.max(0, Math.round(location.positionWholes * CURSOR_TIMESTAMP_DEN)),
    timestampDen: CURSOR_TIMESTAMP_DEN,
  };
}

function scoreSecondsToCursorTargetWithMeasures(
  seconds: number,
  parsed: ParsedMidi,
  measureBeatRanges: MeasureBeatRange[],
): PlaybackCursorTarget {
  return locationToCursorTarget(playbackTimelineFor(parsed, measureBeatRanges).locate(seconds));
}

/**
 * Score beats of a cursor target. Cursor targets, like score events, give the position inside
 * the measure in whole notes.
 */
function cursorTargetToScoreBeats(
  target: PlaybackCursorTarget,
  measureBeatRanges: MeasureBeatRange[],
  parsed: Pick<ParsedMidi, 'timeSignatureNumerator' | 'timeSignatureDenominator'>,
) {
  const wholes = target.timestampNum / Math.max(target.timestampDen, 1);
  const range = measureBeatRanges.find((entry) => entry.measureNumber === target.measureNumber);
  if (!range) {
    const fallbackBeatsPerMeasure = quarterBeatsPerMeasure(parsed);
    return Math.max(0, (target.measureNumber - 1) * fallbackBeatsPerMeasure) + Math.min(wholes * 4, fallbackBeatsPerMeasure);
  }
  return range.startBeat + Math.max(0, Math.min(wholes * 4, range.endBeat - range.startBeat));
}

function cursorTargetToScoreSeconds(
  target: PlaybackCursorTarget,
  parsed: ParsedMidi,
  measureBeatRanges: MeasureBeatRange[],
) {
  return beatsToSeconds(cursorTargetToScoreBeats(target, measureBeatRanges, parsed), parsed);
}

function clampScoreSeconds(scoreSeconds: number, parsed: ParsedMidi) {
  return Math.max(0, Math.min(scoreSeconds, parsed.durationSeconds));
}

export function resolveVisiblePlayheadSeconds(scoreSeconds: number, parsed: ParsedMidi, isPlaying: boolean) {
  return clampScoreSeconds(scoreSeconds + (isPlaying ? PLAYHEAD_RENDER_LEAD_S : 0), parsed);
}

function playbackCursorTargetsEqual(left: PlaybackCursorTarget | null, right: PlaybackCursorTarget | null) {
  return left === right || Boolean(left && right
    && left.measureNumber === right.measureNumber
    && left.timestampNum === right.timestampNum
    && left.timestampDen === right.timestampDen);
}

function playbackPlayheadsEqual(left: PlaybackPlayheadSnapshot | null, right: PlaybackPlayheadSnapshot | null) {
  if (left === right) return true;
  if (!left || !right) return false;
  return playbackCursorTargetsEqual(left, right)
    && left.currentTimeMs === right.currentTimeMs
    && left.startTimeMs === right.startTimeMs
    && left.isPaused === right.isPaused
    && Math.abs(left.progressWithinMeasure - right.progressWithinMeasure) < PLAYHEAD_PROGRESS_EPSILON;
}

export function shouldPublishPlaybackPosition(params: {
  isPlaying: boolean;
  previousTimeMs: number;
  nextTimeMs: number;
  measureChanged: boolean;
  hasPublishedPlayhead: boolean;
}) {
  // During playback only structural changes reach React state; per-frame motion is imperative.
  return !params.hasPublishedPlayhead || !params.isPlaying || params.measureChanged;
}

function buildPlayheadSnapshot(
  scoreSeconds: number,
  startSeconds: number,
  parsed: ParsedMidi,
  measureBeatRanges: MeasureBeatRange[],
  isPaused: boolean,
): PlaybackPlayheadSnapshot {
  const clampedScoreSeconds = clampScoreSeconds(scoreSeconds, parsed);
  // Measure, position and progress come from one location, so they always agree (the measure
  // can no longer roll over while the progress still belongs to the previous measure).
  const location = playbackTimelineFor(parsed, measureBeatRanges).locate(clampedScoreSeconds);
  return {
    ...locationToCursorTarget(location),
    currentTimeMs: Math.round(clampedScoreSeconds * 1000),
    currentTimeSeconds: clampedScoreSeconds,
    progressWithinMeasure: location.progress,
    positionWholes: location.positionWholes,
    spanIndex: location.spanIndex,
    startTimeMs: Math.round(clampScoreSeconds(startSeconds, parsed) * 1000),
    startTimeSeconds: clampScoreSeconds(startSeconds, parsed),
    isPaused,
  };
}

export function resolveStartScoreSeconds(params: {
  parsed: ParsedMidi;
  selectedNote: SelectedNote | null | undefined;
  selectedMeasureNumbers?: number[] | null;
  currentScoreSeconds: number;
  coreDocument?: ScoreDocumentModel | null;
  justOpened: boolean;
}): number {
  const {
    parsed,
    selectedNote,
    selectedMeasureNumbers,
    currentScoreSeconds,
    coreDocument,
    justOpened,
  } = params;

  const measureBeatRanges = resolveRenderedMeasureBeatRanges(coreDocument, parsed);
  if (selectedNote) {
    return clampScoreSeconds(noteToScoreSeconds(selectedNote, parsed, measureBeatRanges), parsed);
  }

  const selectedMeasureNumber = [...(selectedMeasureNumbers ?? [])]
    .filter((measureNumber) => Number.isFinite(measureNumber))
    .sort((left, right) => left - right)[0];
  if (selectedMeasureNumber != null) {
    const range = measureBeatRanges.find((entry) => entry.measureNumber === selectedMeasureNumber);
    if (range) {
      return clampScoreSeconds(beatsToSeconds(range.startBeat, parsed), parsed);
    }
  }

  const atEnd = currentScoreSeconds >= Math.max(parsed.durationSeconds - PLAYHEAD_END_EPSILON_S, 0);
  if (justOpened || atEnd) return 0;
  return clampScoreSeconds(currentScoreSeconds, parsed);
}

function beatsToSeconds(beats: number, parsed: Pick<ParsedMidi, 'tempos'>): number {
  return timelineBeatsToSeconds(beats, parsed.tempos);
}

function noteToScoreSeconds(note: SelectedNote, parsed: ParsedMidi, measureBeatRanges: MeasureBeatRange[]): number {
  return cursorTargetToScoreSeconds({
    measureNumber: note.measureNumber,
    timestampNum: note.timestampNum,
    timestampDen: note.timestampDen,
  }, parsed, measureBeatRanges);
}

function formatSelectedPitch(note: SelectedNote) {
  if (note.isRest) return 'rest';
  return `${note.step}${note.alter === 1 ? '#' : note.alter === -1 ? 'b' : ''}${note.octave}`;
}

function formatCorePitch(event: TimedEvent) {
  if (event.kind === 'rest') return 'rest';
  return `${event.pitch.step}${event.pitch.alter === 1 ? '#' : event.pitch.alter === -1 ? 'b' : ''}${event.pitch.octave}`;
}

function coreEventToScoreSeconds(event: TimedEvent, parsed: ParsedMidi, measureBeatRanges: MeasureBeatRange[]) {
  return cursorTargetToScoreSeconds({
    measureNumber: event.measureNumber,
    timestampNum: event.timestampNum,
    timestampDen: event.timestampDen,
  }, parsed, measureBeatRanges);
}

function buildPlaybackCompare(
  note: SelectedNote,
  parsed: ParsedMidi,
  coreDocument: ScoreDocumentModel | null,
) {
  const measureBeatRanges = resolveRenderedMeasureBeatRanges(coreDocument, parsed);
  const anchorSeconds = noteToScoreSeconds(note, parsed, measureBeatRanges);
  const midiWindowStart = Math.max(0, anchorSeconds - 0.75);
  const midiWindowEnd = Math.min(parsed.durationSeconds, anchorSeconds + 3.0);
  const matchingPart = coreDocument?.score.parts.find((part) => (
    note.corePartId ? part.id === note.corePartId || part.sourcePartId === note.corePartId : true
  )) ?? coreDocument?.score.parts[0];
  const matchingStaff = matchingPart?.staves.find((staff) => staff.staffIndex === note.staffIndex);
  const matchingMeasure = matchingStaff?.measures.find((measure) => measure.measureNumber === note.measureNumber);
  const measureDirections = (matchingMeasure?.directions ?? [])
    .sort((a, b) => (a.timestampNum ?? 0) - (b.timestampNum ?? 0))
    .map((direction) => ({
      kind: direction.kind,
      value: direction.value ?? null,
      timestamp: direction.timestampNum != null ? `${direction.timestampNum}/${direction.timestampDen ?? 1}` : null,
      staffIndex: direction.staffIndex ?? null,
      placement: direction.placement ?? null,
      number: direction.number ?? null,
    }));

  const coreEvents = (matchingMeasure?.voices ?? [])
    .flatMap((voice) => voice.events)
    .sort((a, b) => a.timestampNum - b.timestampNum || a.voiceId - b.voiceId || Number(a.isChord) - Number(b.isChord))
    .map((event) => ({
      voiceId: event.voiceId,
      kind: event.kind,
      pitch: formatCorePitch(event),
      timestamp: `${event.timestampNum}/${event.timestampDen}`,
      score: Number(coreEventToScoreSeconds(event, parsed, measureBeatRanges).toFixed(3)),
      durationDivisions: event.durationDivisions,
      type: event.durationType ?? null,
      chord: event.isChord,
      tieStart: Boolean(event.tieStart),
    }));

  const rawMidi = parsed.rawNotes
    .filter((entry) => entry.time >= midiWindowStart && entry.time <= midiWindowEnd)
    .map((entry) => ({
      pitch: midiName(entry.midi),
      midi: entry.midi,
      time: Number(entry.time.toFixed(3)),
      duration: Number(entry.duration.toFixed(3)),
      velocity: Number(entry.velocity.toFixed(3)),
    }));

  const normalizedMidi = parsed.notes
    .filter((entry) => entry.time >= midiWindowStart && entry.time <= midiWindowEnd)
    .map((entry) => ({
      pitch: midiName(entry.midi),
      midi: entry.midi,
      time: Number(entry.time.toFixed(3)),
      duration: Number(entry.duration.toFixed(3)),
      velocity: Number(entry.velocity.toFixed(3)),
      multiplicity: entry.multiplicity ?? 1,
    }));

  return {
    selected: {
      measure: note.measureNumber,
      staff: note.staffIndex,
      voice: note.voiceId,
      timestamp: `${note.timestampNum}/${note.timestampDen}`,
      pitch: formatSelectedPitch(note),
      score: Number(anchorSeconds.toFixed(3)),
    },
    part: {
      id: matchingPart?.id ?? null,
      sourcePartId: matchingPart?.sourcePartId ?? null,
      name: matchingPart?.name ?? null,
      instrumentName: matchingPart?.instrumentName ?? null,
      chromaticTranspose: matchingPart?.chromaticTranspose ?? null,
      diatonicTranspose: matchingPart?.diatonicTranspose ?? null,
    },
    measureDirections,
    coreMeasureEvents: coreEvents,
    rawMidiWindow: rawMidi,
    normalizedMidiWindow: normalizedMidi,
  };
}

/**
 * The playback notes, tempo map and time signature of a rendered MIDI file: each track mapped to
 * its score part and instrument, percussion tracks flagged, the sustain pedal applied, swing
 * applied. Pure, so the mapping can be tested without audio.
 */
export function parsePlaybackMidi(
  midi: Pick<import('@tonejs/midi').Midi, 'tracks' | 'header'>,
  coreDocument: ScoreDocumentModel | null | undefined,
  swingRatio?: number,
  swingUnit: ScoreDocumentModel['swingUnit'] = 'eighth',
): { parsed: ParsedMidi; duplicateSummary: ReturnType<typeof summarizeSimultaneousDuplicates> } {
  const straightRawNotes: MidiNote[] = midi.tracks
    .flatMap((track, trackIndex) => {
      const sound = resolvePlaybackTrackSound(track, coreDocument, trackIndex, midi.tracks.length);
      const part = resolvePlaybackTrackPart(track, coreDocument, trackIndex, midi.tracks.length);
      const percussion = Boolean(track.instrument.percussion) || track.channel === 9;
      const trackNotes: MidiNote[] = track.notes.map((note) => ({
        time: note.time,
        duration: note.duration,
        midi: note.midi,
        velocity: note.velocity,
        soundfont: sound.soundfont,
        partId: part?.id ?? part?.sourcePartId,
        ...(percussion ? { percussion: true } : {}),
      }));
      // The sustain pedal (CC64) holds released notes until it lifts; drums ignore it.
      const pedal = percussion ? [] : (track.controlChanges?.[SUSTAIN_PEDAL_CONTROLLER] ?? []);
      return pedal.length > 0
        ? applySustainPedal(trackNotes, pedal.map((event) => ({ time: event.time, value: event.value })))
        : trackNotes;
    })
    .sort((a, b) => a.time - b.time);

  const tempos: TempoEntry[] = midi.header.tempos.length > 0
    ? midi.header.tempos.map(t => ({ bpm: t.bpm, time: t.time ?? 0 }))
    : [{ bpm: 120, time: 0 }];

  const rawNotes = applySwingToMidiNotes(straightRawNotes, { tempos }, swingRatio, swingUnit);
  const duplicateSummary = summarizeSimultaneousDuplicates(rawNotes);
  const notes = normalizeMidiNotes(rawNotes);

  const timeSig = midi.header.timeSignatures[0];
  const timeSignatureNumerator = timeSig?.timeSignature[0] ?? 4;
  const timeSignatureDenominator = timeSig?.timeSignature[1] ?? 4;
  const last = notes[notes.length - 1];
  const audibleDurationSeconds = last ? last.time + last.duration + 0.5 : 0;
  const preliminaryParsed: ParsedMidi = {
    rawNotes,
    notes,
    tempos,
    durationSeconds: audibleDurationSeconds,
    timeSignatureNumerator,
    timeSignatureDenominator,
  };
  const durationSeconds = resolveFullPlaybackDurationSeconds(coreDocument, preliminaryParsed, audibleDurationSeconds);

  const swing = Number.isFinite(swingRatio) && swingRatio != null && Math.abs(swingRatio - 0.5) >= 0.001
    ? { ratio: swingRatio, unit: swingUnit === '16th' ? '16th' as const : 'eighth' as const }
    : null;
  const parsed: ParsedMidi = { rawNotes, notes, tempos, durationSeconds, timeSignatureNumerator, timeSignatureDenominator, swing };
  return { parsed, duplicateSummary };
}

export function usePlayback(options?: {
  coreDocument?: ScoreDocumentModel | null;
  selectedNote?: SelectedNote | null;
  selectedNoteRef?: RefObject<SelectedNote | null>;
  selectedMeasureNumbers?: number[];
  sampleBank?: PlaybackSampleBank | null;
}) {
  const [playbackState, setPlaybackState] = useState<PlaybackState>('stopped');
  const mixerRef = useRef<MixerState>({});
  const setMixer = useCallback((state: MixerState) => {
    mixerRef.current = state;
    // Part buses follow at once (20 ms ramp), so a mute also silences notes already ringing.
    const ac = audioCtxRef.current;
    const bus = ac && ac.state !== 'closed' ? getPlaybackBus(ac) : null;
    if (bus) applyMixerToPartBuses(bus, (partId) => channelGainFactor(state, partId));
  }, []);
  const [totalBeats, setTotalBeats]           = useState(0);
  const [playbackPosition, setPlaybackPosition] = useState<{
    currentMeasure: number;
    currentBeat: number;
    playbackCursorTarget: PlaybackCursorTarget | null;
    playhead: PlaybackPlayheadSnapshot | null;
    currentTimeMs: number;
  }>({
    currentMeasure: 1,
    currentBeat: 0,
    playbackCursorTarget: null,
    playhead: null,
    currentTimeMs: 0,
  });
  const {
    currentMeasure,
    currentBeat,
    playbackCursorTarget,
    playhead,
    currentTimeMs,
  } = playbackPosition;
  const [midiLoading, setMidiLoading]         = useState(false);
  const [hasMidi, setHasMidi]                 = useState(false);
  const [playbackError, setPlaybackError]     = useState<string | null>(null);
  const playbackErrorRef = useRef<string | null>(null);
  playbackErrorRef.current = playbackError;
  const [tempoOverride, setTempoOverride]     = useState<number | null>(null);
  const [metronomeEnabled, setMetronomeEnabled] = useState(false);
  const [isPaused, setIsPaused] = useState(false);

  const coreDocumentRef      = useRef(options?.coreDocument ?? null);
  coreDocumentRef.current = options?.coreDocument ?? null;
  const sampleBankRef = useRef(options?.sampleBank ?? null);
  sampleBankRef.current = options?.sampleBank ?? null;
  const audioCtxRef         = useRef<AudioContext | null>(null);
  const playersRef          = useRef<Map<SoundfontInstrumentName, PlaybackPlayer>>(new Map());
  const playerLoadsRef      = useRef<Map<SoundfontInstrumentName, Promise<PlaybackPlayer>>>(new Map());
  const playerPreloadsRef   = useRef<Map<SoundfontInstrumentName, Promise<void>>>(new Map());
  const sampleBuffersRef = useRef<Map<string, AudioBuffer>>(new Map());
  const sampleLoadsRef = useRef<Map<string, Promise<AudioBuffer>>>(new Map());
  const playerCacheGenerationRef = useRef(0);
  const previewGenerationRef = useRef(0);
  const parsedMidiRef       = useRef<ParsedMidi | null>(null);
  const loadedXmlRef        = useRef<string | null>(null);
  const midiLoadRef         = useRef<{ xml: string; promise: Promise<boolean>; silent: boolean } | null>(null);
  const latestMidiRequestIdRef = useRef(0);
  // ac.currentTime when score-time 0 would play (adjusted for fromSeconds)
  const originAcTimeRef     = useRef<number>(0);
  const resumeScoreTimeRef  = useRef<number>(0);   // score-seconds to resume from
  const playbackStartScoreTimeRef = useRef<number>(0);
  const nextNoteIdxRef      = useRef<number>(0);
  const nextClickIdxRef     = useRef<number>(0);   // index into the timeline's metronome clicks
  // Score seconds where the current run starts; the playhead waits there until it is heard.
  const runStartScoreRef    = useRef<number>(0);
  const tickerRef           = useRef<PlaybackTicker | null>(null);
  const audibleClockRef     = useRef<{ ac: AudioContext; clock: AudibleClock } | null>(null);
  const scheduledHandleEndsRef = useRef<Map<PlaybackNoteHandle, number>>(new Map());
  const lastPublishedSpanRef = useRef<number>(-1);
  const transportShiftCountRef = useRef(0);
  const playbackGenerationRef = useRef(0);
  const playRequestIdRef = useRef(0);
  const scheduledPlaybackHandlesRef = useRef<Set<PlaybackNoteHandle>>(new Set());
  const previewSampleHandlesRef = useRef<Set<PlaybackNoteHandle>>(new Set());
  // Players from the e2e loader keep their own routing; players whose samples carry a loop.
  const e2ePlayersRef = useRef<WeakSet<object>>(new WeakSet());
  const loopedSamplesRef = useRef<WeakMap<object, Map<number, SampleLoopPoints>>>(new WeakMap());
  const openHiHatRef = useRef<DrumHitHandle | null>(null);
  const isPlayingRef        = useRef(false);
  const tempoOverrideRef    = useRef<number | null>(null);
  const metronomeEnabledRef = useRef(false);
  const justOpenedRef       = useRef(true);
  const playbackStateRef = useRef<PlaybackState>('stopped');
  const playbackCursorTargetRef = useRef<PlaybackCursorTarget | null>(null);
  const playheadRef = useRef<PlaybackPlayheadSnapshot | null>(null);
  const currentMeasureRef = useRef(1);
  const currentBeatRef = useRef(0);
  const currentTimeMsRef = useRef(0);
  const playbackGeometryCacheRef = useRef<{
    parsed: ParsedMidi | null;
    coreDocument: ScoreDocumentModel | null;
    ranges: MeasureBeatRange[];
  }>({
    parsed: null,
    coreDocument: null,
    ranges: [],
  });
  const sampleBankId = options?.sampleBank?.id ?? null;

  useEffect(() => { tempoOverrideRef.current    = tempoOverride;    }, [tempoOverride]);
  useEffect(() => { metronomeEnabledRef.current = metronomeEnabled; }, [metronomeEnabled]);
  useEffect(() => { playbackStateRef.current = playbackState; }, [playbackState]);
  useEffect(() => {
    previewGenerationRef.current += 1;
    stopScheduledPlayback({ resetAudioContext: true });
    tickerRef.current?.stop();
    isPlayingRef.current = false;
    playbackStateRef.current = 'stopped';
    setPlaybackState('stopped');
    setIsPaused(false);
  }, [sampleBankId]); // eslint-disable-line react-hooks/exhaustive-deps

  const getPlaybackMeasureBeatRanges = useCallback((parsed: ParsedMidi) => {
    const coreDocument = coreDocumentRef.current;
    const cache = playbackGeometryCacheRef.current;
    if (cache.parsed === parsed && cache.coreDocument === coreDocument && cache.ranges.length > 0) {
      return cache.ranges;
    }
    const ranges = resolveRenderedMeasureBeatRanges(coreDocument, parsed);
    playbackGeometryCacheRef.current = { parsed, coreDocument, ranges };
    return ranges;
  }, []);

  const syncPlaybackPositionState = useCallback((scoreSeconds: number, parsed: ParsedMidi) => {
    const clampedScoreSeconds = Math.max(0, Math.min(scoreSeconds, parsed.durationSeconds));
    const measureBeatRanges = getPlaybackMeasureBeatRanges(parsed);
    const snapshot = buildPlayheadSnapshot(
      clampedScoreSeconds,
      playbackStartScoreTimeRef.current,
      parsed,
      measureBeatRanges,
      playbackStateRef.current === 'paused',
    );
    const nextBeat = secondsToScoreBeats(clampedScoreSeconds, parsed);
    const nextCursorTarget = {
      measureNumber: snapshot.measureNumber,
      timestampNum: snapshot.timestampNum,
      timestampDen: snapshot.timestampDen,
    };
    currentMeasureRef.current = snapshot.measureNumber;
    currentBeatRef.current = nextBeat;

    // While playing, React only hears about measure changes. The playhead, the highlight and
    // follow-scrolling are drawn every frame by the score itself from `transport` (see
    // components/ScoreEditor.tsx); re-rendering the app per frame is what made them late.
    const shouldPublishPosition = !playbackPlayheadsEqual(playheadRef.current, snapshot)
      && shouldPublishPlaybackPosition({
        isPlaying: playbackStateRef.current === 'playing' && isPlayingRef.current,
        previousTimeMs: currentTimeMsRef.current,
        nextTimeMs: snapshot.currentTimeMs,
        measureChanged: lastPublishedSpanRef.current !== snapshot.spanIndex,
        hasPublishedPlayhead: playheadRef.current != null,
      });
    if (!shouldPublishPosition) return;

    lastPublishedSpanRef.current = snapshot.spanIndex;
    playbackCursorTargetRef.current = nextCursorTarget;
    playheadRef.current = snapshot;
    currentTimeMsRef.current = snapshot.currentTimeMs;
    // During playback the measure display may lag a frame or two; a non-urgent render must not
    // block the frames that draw the playhead.
    const publish = playbackStateRef.current === 'playing' && isPlayingRef.current
      ? startTransition
      : (update: () => void) => update();
    publish(() => setPlaybackPosition((current) => {
      if (
        current.currentMeasure === snapshot.measureNumber
        && Math.abs(current.currentBeat - nextBeat) < 0.0001
        && playbackCursorTargetsEqual(current.playbackCursorTarget, nextCursorTarget)
        && playbackPlayheadsEqual(current.playhead, snapshot)
        && current.currentTimeMs === snapshot.currentTimeMs
      ) return current;
      return {
        currentMeasure: snapshot.measureNumber,
        currentBeat: nextBeat,
        playbackCursorTarget: nextCursorTarget,
        playhead: snapshot,
        currentTimeMs: snapshot.currentTimeMs,
      };
    }));
  }, [getPlaybackMeasureBeatRanges]);

  function getAc(): AudioContext {
    if (!audioCtxRef.current || audioCtxRef.current.state === 'closed') {
      const ac = new AudioContext();
      audioCtxRef.current = ac;
      probeRegisterAudioContext(ac);
      // iOS interrupts the context (call, Siri, another app); resume it when playback is active.
      if (typeof ac.addEventListener === 'function') {
        ac.addEventListener('statechange', () => {
          if (audioCtxRef.current !== ac || !isPlayingRef.current) return;
          if (shouldResumePlaybackAudioContext(ac.state)) void ac.resume().catch(() => undefined);
        });
      }
    }
    return audioCtxRef.current;
  }

  function musicDestination(ac: AudioContext): AudioNode {
    return getPlaybackBus(ac)?.input ?? ac.destination;
  }

  function dryDestination(ac: AudioContext): AudioNode {
    return getPlaybackBus(ac)?.dryInput ?? ac.destination;
  }

  function partBusFor(bus: PlaybackBus, partId: string | undefined) {
    const id = partId ?? '';
    const pan = resolveDocumentPartPans(coreDocumentRef.current).get(id) ?? 0;
    return getPartBus(bus, id, pan, channelGainFactor(mixerRef.current, partId));
  }

  /**
   * Drops the planned level automation (stop, seek, tempo change). A continuing run holds the
   * current level and plans on from it; otherwise the level returns to unity over 0.25 s.
   */
  function resetMasterLevel(continuing: boolean) {
    const ac = audioCtxRef.current;
    if (!ac || ac.state === 'closed') return;
    const bus = getPlaybackBus(ac);
    if (!bus) return;
    const now = ac.currentTime;
    const param = bus.level.gain;
    const current = Number.isFinite(param.value) ? param.value : 1;
    try {
      param.cancelScheduledValues(now);
      param.setValueAtTime(current, now);
      if (continuing) {
        bus.planner.reset(now, current);
      } else {
        param.linearRampToValueAtTime(1, now + 0.25);
        bus.planner.reset(now + 0.25, 1);
      }
    } catch {
      bus.planner.reset(now, 1);
    }
  }

  /** Hands the level automation for the scheduled window to the audio graph. */
  function commitMasterLevel(ac: AudioContext, nowAc: number, untilAc: number) {
    const bus = getPlaybackBus(ac);
    if (!bus) return;
    const points = bus.planner.planAutomation(untilAc - LEVEL_COMMIT_MARGIN_S, nowAc + 0.001);
    points.forEach((point) => {
      try { bus.level.gain.linearRampToValueAtTime(point.gain, point.time); } catch { /* closed context */ }
    });
  }

  /** Post-processes a freshly loaded soundfont: loops for sustaining instruments, end fades. */
  function prepareLoadedPlayer(player: PlaybackPlayer, soundfont: SoundfontInstrumentName) {
    const buffers = (player as { buffers?: unknown }).buffers;
    if (!buffers) return;
    try {
      loopedSamplesRef.current.set(player, prepareSoundfontBuffers(buffers, soundfont));
      Object.values(buffers as Record<string, AudioBuffer>).forEach((buffer) => { cachedBufferPeak(buffer); });
    } catch (err) {
      dbg.warn('playback', `could not prepare the ${soundfont} samples:`, err);
    }
  }

  function getAudibleClock(ac: AudioContext) {
    if (audibleClockRef.current?.ac !== ac) {
      audibleClockRef.current = { ac, clock: createAudibleClock(ac, { calibrationSeconds: readPlaybackLatencyCalibrationSeconds }) };
    }
    return audibleClockRef.current.clock;
  }

  function stopHandleSet(handles: Set<PlaybackNoteHandle>) {
    const stopAt = audioCtxRef.current?.currentTime;
    handles.forEach((handle) => {
      try {
        handle.stop?.(stopAt);
      } catch {
        // Ignore duplicate-stop races from already-ended samples.
      }
    });
    handles.clear();
  }

  function stopScheduledPlayback(options?: { resetAudioContext?: boolean }) {
    playbackGenerationRef.current += 1;
    // A stopped audition must stay silent even if its instrument/sample load
    // finishes later. Keep loaded assets reusable by a subsequent audition.
    previewGenerationRef.current += 1;
    const ac = audioCtxRef.current;
    stopHandleSet(scheduledPlaybackHandlesRef.current);
    scheduledHandleEndsRef.current.clear();
    stopHandleSet(previewSampleHandlesRef.current);
    playersRef.current.forEach((player) => {
      try {
        player.stop();
      } catch {
        // Some instrument implementations throw when there is nothing active.
      }
    });
    openHiHatRef.current = null;
    if (!options?.resetAudioContext) resetMasterLevel(false);
    if (options?.resetAudioContext) {
      playerCacheGenerationRef.current += 1;
      if (ac && ac.state !== 'closed') void ac.close().catch(() => undefined);
      audioCtxRef.current = null;
      playersRef.current.clear();
      playerLoadsRef.current.clear();
      playerPreloadsRef.current.clear();
      sampleBuffersRef.current.clear();
      sampleLoadsRef.current.clear();
    }
  }

  /** Stops the scheduled notes; a run continues right after (play, tempo change). */
  function stopScheduledPlaybackHandles() {
    stopHandleSet(scheduledPlaybackHandlesRef.current);
    scheduledHandleEndsRef.current.clear();
    openHiHatRef.current = null;
    resetMasterLevel(true);
  }

  /**
   * Loads an instrument in the background from the locally served soundfonts only (never the
   * remote fallback host, never the oscillator fallback), so the first Play does not wait for
   * downloading and decoding. Failures are silent; Play then loads the instrument as usual.
   */
  function preloadPlayer(soundfont: SoundfontInstrumentName) {
    if (playersRef.current.has(soundfont) || playerLoadsRef.current.has(soundfont) || playerPreloadsRef.current.has(soundfont)) return;
    if (typeof (globalThis as { __NEX_NOTE_E2E_INSTRUMENT_LOADER__?: unknown }).__NEX_NOTE_E2E_INSTRUMENT_LOADER__ === 'function') return;
    const cacheGeneration = playerCacheGenerationRef.current;
    const ac = getAc();
    const preload = (async () => {
      const soundfontModule = await import('soundfont-player');
      const instrument = soundfontModule.instrument ?? soundfontModule.default?.instrument;
      if (typeof instrument !== 'function') return;
      let timeoutId: ReturnType<typeof setTimeout> | undefined;
      try {
        const player = await Promise.race([
          instrument(ac, soundfont as import('soundfont-player').InstrumentName, { ...LOCAL_SOUNDFONT_OPTIONS, destination: musicDestination(ac) }),
          new Promise<never>((_, reject) => {
            timeoutId = setTimeout(() => reject(new Error('soundfont preload timed out')), SOUND_FONT_LOAD_TIMEOUT_MS);
          }),
        ]);
        if (cacheGeneration !== playerCacheGenerationRef.current || ac !== audioCtxRef.current || playersRef.current.has(soundfont)) {
          try { player.stop(); } catch { /* stale preload */ }
          return;
        }
        prepareLoadedPlayer(player, soundfont);
        playersRef.current.set(soundfont, player);
      } finally {
        if (timeoutId) clearTimeout(timeoutId);
      }
    })().catch((err) => {
      dbg.info('playback', `background preload of ${soundfont} skipped:`, err);
    }).finally(() => {
      if (playerPreloadsRef.current.get(soundfont) === preload) playerPreloadsRef.current.delete(soundfont);
    });
    playerPreloadsRef.current.set(soundfont, preload);
  }

  function preloadPlaybackInstruments(parsed: ParsedMidi) {
    const sampleBank = sampleBankRef.current;
    if (sampleBank) {
      const filenames = new Set(parsed.notes.map((note) => (
        resolvePlaybackSampleFilename(sampleBank, coreDocumentRef.current, note.partId, note.midi)
      )).filter((filename): filename is string => Boolean(filename)));
      filenames.forEach((filename) => {
        void ensureSampleBuffer(filename).catch(() => undefined);
      });
      return;
    }
    soundfontsToLoad(parsed).forEach((soundfont) => preloadPlayer(soundfont));
  }

  /** Percussion plays on the synthesized kit, except under the e2e loader (which records it). */
  function playsOnDrumSynth(note: MidiNote, ac: AudioContext | null) {
    if (!note.percussion || hasE2eInstrumentLoader()) return false;
    // Before a context exists (idle preload), ask the engine's prototype instead of creating one.
    const target = ac ?? (globalThis as { AudioContext?: { prototype: AudioContext } }).AudioContext?.prototype;
    return Boolean(target) && canSynthesizeDrums(target as AudioContext);
  }

  function soundfontsToLoad(parsed: ParsedMidi) {
    const ac = audioCtxRef.current;
    return new Set(parsed.notes
      .filter((note) => !playsOnDrumSynth(note, ac))
      .map((note) => note.soundfont ?? resolvePlaybackSoundfontInstrument(coreDocumentRef.current)));
  }

  async function ensurePlayer(soundfont: SoundfontInstrumentName): Promise<PlaybackPlayer> {
    const cachedPlayer = playersRef.current.get(soundfont);
    if (cachedPlayer) return cachedPlayer;
    const inFlightPreload = playerPreloadsRef.current.get(soundfont);
    if (inFlightPreload) {
      await inFlightPreload;
      const preloaded = playersRef.current.get(soundfont);
      if (preloaded) return preloaded;
    }
    const existingLoad = playerLoadsRef.current.get(soundfont);
    if (existingLoad) return existingLoad;

    const cacheGeneration = playerCacheGenerationRef.current;
    const ac = getAc();
    const e2eLoader = (globalThis as typeof globalThis & {
      __NEX_NOTE_E2E_INSTRUMENT_LOADER__?: (
        ac: AudioContext,
        instrument: SoundfontInstrumentName,
      ) => Promise<import('soundfont-player').Player> | import('soundfont-player').Player;
    }).__NEX_NOTE_E2E_INSTRUMENT_LOADER__;
    const load = (async () => {
      let player: PlaybackPlayer;
      let fromE2eLoader = false;
      if (typeof e2eLoader === 'function') {
        player = await e2eLoader(ac, soundfont);
        fromE2eLoader = true;
      } else {
        const soundfontModule = await import('soundfont-player');
        const instrument = soundfontModule.instrument ?? soundfontModule.default?.instrument;
        if (typeof instrument !== 'function') {
          throw new TypeError('soundfont-player instrument loader is unavailable');
        }

        let timeoutId: ReturnType<typeof setTimeout> | undefined;
        const soundfontTimeout = new Promise<never>((_, reject) => {
          timeoutId = setTimeout(() => reject(new Error(`soundfont load timed out after ${SOUND_FONT_LOAD_TIMEOUT_MS}ms`)), SOUND_FONT_LOAD_TIMEOUT_MS);
        });
        try {
          // Offline-first: samples fetched by `npm run soundfonts:fetch` are served from /soundfonts;
          // only when they are missing does soundfont-player fall back to its remote default host,
          // and never in the desktop app (lib/soundfont-source.ts) — there the oscillator answers.
          const destination = musicDestination(ac);
          const loadInstrument = async () => {
            try {
              return await instrument(ac, soundfont as import('soundfont-player').InstrumentName, { ...LOCAL_SOUNDFONT_OPTIONS, destination });
            } catch (localError) {
              if (!allowRemoteSoundfontFallback()) throw localError;
              return instrument(ac, soundfont as import('soundfont-player').InstrumentName, { destination });
            }
          };
          player = await Promise.race([loadInstrument(), soundfontTimeout]);
        } catch (err) {
          dbg.warn('playback', `soundfont ${soundfont} unavailable, falling back to oscillator playback:`, err);
          player = createOscillatorFallbackPlayer(ac, musicDestination(ac));
        } finally {
          if (timeoutId) clearTimeout(timeoutId);
        }
      }

      if (cacheGeneration !== playerCacheGenerationRef.current || ac !== audioCtxRef.current) {
        try { player.stop(); } catch { /* Ignore cleanup failures for stale loads. */ }
        throw new Error(`Discarded stale ${soundfont} soundfont load`);
      }
      if (fromE2eLoader) e2ePlayersRef.current.add(player);
      else prepareLoadedPlayer(player, soundfont);
      playersRef.current.set(soundfont, player);
      return player;
    })().finally(() => {
      if (playerLoadsRef.current.get(soundfont) === load) {
        playerLoadsRef.current.delete(soundfont);
      }
    });

    playerLoadsRef.current.set(soundfont, load);
    return load;
  }

  async function ensureSampleBuffer(filename: string): Promise<AudioBuffer> {
    const cachedBuffer = sampleBuffersRef.current.get(filename);
    if (cachedBuffer) return cachedBuffer;
    const existingLoad = sampleLoadsRef.current.get(filename);
    if (existingLoad) return existingLoad;

    const sampleBank = sampleBankRef.current;
    if (!sampleBank) throw new Error('No local template sample bank is active.');
    const sampleBankId = sampleBank.id;
    const cacheGeneration = playerCacheGenerationRef.current;
    const ac = getAc();
    const load = (async () => {
      const encodedAudio = await sampleBank.loadSample(filename);
      const buffer = await ac.decodeAudioData(encodedAudio.slice(0));
      if (cacheGeneration !== playerCacheGenerationRef.current
        || sampleBankRef.current?.id !== sampleBankId
        || ac !== audioCtxRef.current) {
        throw new Error(`Discarded stale local template sample load for ${filename}`);
      }
      sampleBuffersRef.current.set(filename, buffer);
      return buffer;
    })().finally(() => {
      if (sampleLoadsRef.current.get(filename) === load) {
        sampleLoadsRef.current.delete(filename);
      }
    });

    sampleLoadsRef.current.set(filename, load);
    return load;
  }

  async function ensurePlaybackPlayers(parsed: ParsedMidi) {
    const sampleBank = sampleBankRef.current;
    if (sampleBank) {
      const sampleFilenames = new Set(parsed.notes.map((note) => (
        resolvePlaybackSampleFilename(sampleBank, coreDocumentRef.current, note.partId, note.midi)
      )).filter((filename): filename is string => Boolean(filename)));
      await Promise.all([...sampleFilenames].map((filename) => ensureSampleBuffer(filename)));
      return;
    }
    await Promise.all([...soundfontsToLoad(parsed)].map((soundfont) => ensurePlayer(soundfont)));
  }

  // ── Timeline and transport ──────────────────────────────────────────────────
  function getTimeline(parsed: ParsedMidi) {
    return playbackTimelineFor(parsed, getPlaybackMeasureBeatRanges(parsed));
  }

  /** Score seconds the listener hears at performance time `atMs`, or null when not playing. */
  function audibleScoreSeconds(atMs?: number) {
    const ac = audioCtxRef.current;
    const parsed = parsedMidiRef.current;
    if (!ac || !parsed || !isPlayingRef.current) return null;
    const scale = resolvePlaybackTempoScale(parsed, tempoOverrideRef.current);
    const heard = (getAudibleClock(ac).audibleTime(atMs) - originAcTimeRef.current) * scale;
    // Before the first note is heard the playhead waits at the start of the run.
    return Math.max(runStartScoreRef.current, Math.min(heard, parsed.durationSeconds));
  }

  const transportListenersRef = useRef<Set<() => void>>(new Set());
  function notifyTransport() {
    transportListenersRef.current.forEach((listener) => {
      try {
        listener();
      } catch (err) {
        dbg.warn('playback', 'transport listener failed:', err);
      }
    });
  }

  const transportRef = useRef<PlaybackTransport | null>(null);
  if (!transportRef.current) {
    transportRef.current = {
      subscribe(listener) {
        transportListenersRef.current.add(listener);
        return () => { transportListenersRef.current.delete(listener); };
      },
      read(atMs) {
        const parsed = parsedMidiRef.current;
        if (!parsed) return null;
        const timeline = getTimeline(parsed);
        const heard = audibleScoreSeconds(atMs);
        const playing = heard != null;
        const scoreSeconds = heard ?? clampScoreSeconds(resumeScoreTimeRef.current, parsed);
        const location = timeline.locate(scoreSeconds);
        return {
          playing,
          scoreSeconds,
          location,
          timeline,
          nextMeasureNumber: timeline.spans[location.spanIndex + 1]?.measureNumber ?? null,
          generation: playbackGenerationRef.current,
        };
      },
      audioContext: () => audioCtxRef.current,
    };
  }

  // ── Look-ahead scheduler ────────────────────────────────────────────────────
  // Every SCHEDULER_TICK_MS (worker timer) hand the notes and clicks of the next LOOKAHEAD_S to
  // the audio graph at their exact AudioContext time. Creating all nodes at once crashes the
  // AudioContext on long pieces, so only the window is scheduled.
  function startNoteAt(note: MidiNote, startAt: number, scale: number, ac: AudioContext) {
    const multiplicity = Math.max(1, note.multiplicity ?? 1);
    const mixFactor = channelGainFactor(mixerRef.current, note.partId);
    if (mixFactor <= 0) return;
    const velocityGain = velocityToGain(note.velocity) * Math.sqrt(multiplicity);
    const sampleBank = sampleBankRef.current;
    const bus = getPlaybackBus(ac);
    const noteSeconds = note.duration / scale;
    let handle: unknown;
    let handleDuration = noteSeconds;
    // Estimated peak of the note at gain 1, and whether it fades by itself (level planner).
    let samplePeak = NOMINAL_SAMPLE_PEAK;
    let decaying = true;
    // Mixer volume is applied by the part's bus when the note is routed there, else per note.
    let partBus: ReturnType<typeof partBusFor> | null = null;
    if (sampleBank) {
      const filename = resolvePlaybackSampleFilename(sampleBank, coreDocumentRef.current, note.partId, note.midi);
      if (!filename) return;
      const buffer = sampleBuffersRef.current.get(filename);
      if (!buffer) {
        dbg.warn('playback', `skip local template sample ${filename} because it is not loaded`);
        probeAudio({ midi: note.midi, partId: note.partId ?? null, scoreSeconds: note.time, idealAc: startAt, startAc: startAt, nowAc: ac.currentTime, skipped: true });
        return;
      }
      partBus = bus ? partBusFor(bus, note.partId) : null;
      handle = startAudioSample(ac, buffer, startAt, clampNoteGain(velocityGain * (partBus ? 1 : mixFactor)), partBus?.input ?? ac.destination);
      handleDuration = buffer.duration;
      samplePeak = cachedBufferPeak(buffer);
    } else if (playsOnDrumSynth(note, ac)) {
      partBus = bus ? partBusFor(bus, note.partId) : null;
      const hit = playDrumHit(ac, note.midi, startAt, clampNoteGain(velocityGain * (partBus ? 1 : mixFactor)), partBus?.input ?? ac.destination);
      // A closed or pedal hi-hat chokes the ringing open hi-hat.
      if (hit.voice.chokes === 'hihat') openHiHatRef.current?.stop(startAt);
      if (hit.voice.chokeGroup === 'hihat') openHiHatRef.current = hit;
      handle = hit;
      handleDuration = hit.endTime - startAt;
      samplePeak = drumVoicePeak(hit.voice);
    } else {
      const soundfont = note.soundfont ?? resolvePlaybackSoundfontInstrument(coreDocumentRef.current);
      const player = playersRef.current.get(soundfont);
      if (!player) {
        dbg.warn('playback', `skip note ${midiName(note.midi)} because ${soundfont} is not loaded`);
        probeAudio({ midi: note.midi, partId: note.partId ?? null, scoreSeconds: note.time, idealAc: startAt, startAc: startAt, nowAc: ac.currentTime, skipped: true });
        return;
      }
      partBus = bus && !e2ePlayersRef.current.has(player) ? partBusFor(bus, note.partId) : null;
      // Long notes of sustaining instruments loop inside the baked crossfade instead of running out.
      const loop = shouldLoopNote(noteSeconds) ? loopedSamplesRef.current.get(player)?.get(note.midi) : undefined;
      handle = startPlaybackNote(player, note.midi, startAt, {
        duration: noteSeconds,
        gain: clampNoteGain(velocityGain * (partBus ? 1 : mixFactor)),
        ...(loop ? { loop: true, loopStart: loop.loopStart, loopEnd: loop.loopEnd } : {}),
      });
      if (partBus && !routeHandleTo(handle, partBus.input)) partBus = null;
      const buffers = (player as { buffers?: Record<number, AudioBuffer> }).buffers;
      samplePeak = buffers?.[note.midi] ? cachedBufferPeak(buffers[note.midi]) : NOMINAL_SAMPLE_PEAK;
      decaying = !isSustainingSoundfont(soundfont);
    }
    if (bus && handle) {
      const panFactor = 1 + (0.5 * Math.sin((Math.abs(partBus?.pan ?? 0) * Math.PI) / 2));
      bus.planner.addVoice({
        start: startAt,
        // Soundfont notes stop after their length and release; samples and drum hits ring out.
        end: startAt + (sampleBank || handleDuration !== noteSeconds ? handleDuration : noteSeconds + PLAYER_RELEASE_S),
        amplitude: clampNoteGain(velocityGain * mixFactor) * samplePeak * panFactor * MASTER_GAIN,
        decaying,
      });
    }
    probeAudio({
      midi: note.midi,
      partId: note.partId ?? null,
      scoreSeconds: note.time,
      idealAc: startAt,
      startAc: Math.max(startAt, ac.currentTime),
      nowAc: ac.currentTime,
    });
    if (isStoppablePlaybackHandle(handle)) {
      scheduledPlaybackHandlesRef.current.add(handle);
      scheduledHandleEndsRef.current.set(handle, startAt + handleDuration + 0.5);
    }
  }

  function pruneFinishedHandles(nowAc: number) {
    scheduledHandleEndsRef.current.forEach((endAc, handle) => {
      if (endAc >= nowAc) return;
      scheduledHandleEndsRef.current.delete(handle);
      scheduledPlaybackHandlesRef.current.delete(handle);
    });
  }

  function runSchedulerTick() {
    const ac       = audioCtxRef.current;
    const parsed   = parsedMidiRef.current;
    if (!ac || !parsed || !isPlayingRef.current) return;

    const scale = resolvePlaybackTempoScale(parsed, tempoOverrideRef.current);
    const timeline = getTimeline(parsed);
    const clicks = timeline.clicks;
    const metronomeOn = metronomeEnabledRef.current;
    const nowAc = ac.currentTime;
    const earliestAc = nowAc + MIN_SCHEDULE_LEAD_S;
    const scheduleUntilAc = nowAc + LOOKAHEAD_S;

    // The main thread was blocked longer than the look-ahead: the next sound is already due.
    // Move the whole transport later instead of playing it late or dropping it, so every note
    // keeps its rhythm and the playhead (which reads the same origin) stays on the sound.
    const nextNote = parsed.notes[nextNoteIdxRef.current];
    const nextClick = metronomeOn ? clicks[nextClickIdxRef.current] : undefined;
    const nextDueAc = Math.min(
      nextNote ? originAcTimeRef.current + nextNote.time / scale : Number.POSITIVE_INFINITY,
      nextClick ? originAcTimeRef.current + nextClick.seconds / scale : Number.POSITIVE_INFINITY,
    );
    if (nextDueAc < earliestAc) {
      const shift = earliestAc - nextDueAc;
      originAcTimeRef.current += shift;
      transportShiftCountRef.current += 1;
      probeMark('transport-shift', { shiftMs: shift * 1000 });
      dbg.warn('playback', `scheduler was ${(shift * 1000).toFixed(0)} ms late; transport moved later to keep sound and playhead together`);
    }

    let i = nextNoteIdxRef.current;
    while (i < parsed.notes.length) {
      const note = parsed.notes[i]!;
      const noteAcTime = originAcTimeRef.current + note.time / scale;
      if (noteAcTime > scheduleUntilAc) break;
      startNoteAt(note, noteAcTime, scale, ac);
      i++;
    }
    nextNoteIdxRef.current = i;

    let c = nextClickIdxRef.current;
    while (c < clicks.length) {
      const click = clicks[c]!;
      const clickAcTime = originAcTimeRef.current + click.seconds / scale;
      if (clickAcTime > scheduleUntilAc) break;
      // Keep advancing while the metronome is off so switching it on clicks from here.
      if (metronomeOn && clickAcTime >= earliestAc) scheduleClick(ac, clickAcTime, click.downbeat);
      c++;
    }
    nextClickIdxRef.current = c;
    commitMasterLevel(ac, nowAc, scheduleUntilAc);
    pruneFinishedHandles(nowAc);
  }

  // ── Metronome click ─────────────────────────────────────────────────────────
  // A rendered woodblock-like click (lib/drum-synth.ts) with its own gain node into the dry
  // master input; beat 1 is higher and louder. Engines without buffer sources get a quiet sine.
  function scheduleClick(ac: AudioContext, time: number, isDownbeat: boolean) {
    const clickBuffers = metronomeClickBuffers(ac);
    if (clickBuffers) {
      const source = ac.createBufferSource();
      const gain = ac.createGain();
      const level = isDownbeat ? METRONOME_CLICK.accentGain : METRONOME_CLICK.beatGain;
      const end = time + METRONOME_CLICK.durationSeconds;
      source.buffer = isDownbeat ? clickBuffers.accent : clickBuffers.beat;
      gain.gain.setValueAtTime(level, time);
      gain.gain.setValueAtTime(level, end - METRONOME_CLICK.releaseSeconds);
      gain.gain.linearRampToValueAtTime(0, end);
      source.connect(gain);
      gain.connect(dryDestination(ac));
      source.onended = () => {
        try { source.disconnect(); } catch { /* already disconnected */ }
        try { gain.disconnect(); } catch { /* already disconnected */ }
      };
      source.start(time);
      source.stop(end + 0.005);
      let stopped = false;
      const clickHandle: PlaybackNoteHandle = {
        stop(when?: number) {
          if (stopped) return;
          stopped = true;
          const at = Math.max(ac.currentTime, when ?? ac.currentTime);
          try {
            gain.gain.cancelScheduledValues(at);
            gain.gain.setValueAtTime(gain.gain.value, at);
            gain.gain.linearRampToValueAtTime(0, at + METRONOME_CLICK.releaseSeconds);
            source.stop(at + METRONOME_CLICK.releaseSeconds + 0.001);
          } catch { /* already stopped */ }
        },
      };
      scheduledPlaybackHandlesRef.current.add(clickHandle);
      scheduledHandleEndsRef.current.set(clickHandle, time + 0.1);
      return;
    }
    const osc  = ac.createOscillator();
    const gain = ac.createGain();
    osc.connect(gain);
    gain.connect(dryDestination(ac));
    osc.frequency.value = isDownbeat ? 1200 : 900;
    gain.gain.setValueAtTime(0, time);
    gain.gain.linearRampToValueAtTime(isDownbeat ? 0.15 : 0.1, time + 0.003);   // 3ms attack
    gain.gain.exponentialRampToValueAtTime(0.001, time + 0.035); // decay
    gain.gain.linearRampToValueAtTime(0, time + 0.04); // 5 ms release
    osc.start(time);
    osc.stop(time + 0.04);
    const handle: PlaybackNoteHandle = {
      stop(when?: number) {
        try { osc.stop(Math.max(ac.currentTime, when ?? ac.currentTime)); } catch { /* already stopped */ }
      },
    };
    scheduledPlaybackHandlesRef.current.add(handle);
    scheduledHandleEndsRef.current.set(handle, time + 0.1);
  }

  function firstClickIndexAtOrAfter(parsed: ParsedMidi, scoreSeconds: number) {
    const clicks = getTimeline(parsed).clicks;
    const index = clicks.findIndex((click) => click.seconds >= scoreSeconds - 1e-4);
    return index === -1 ? clicks.length : index;
  }

  function firstNoteIndexAtOrAfter(parsed: ParsedMidi, scoreSeconds: number) {
    const index = parsed.notes.findIndex((note) => note.time >= scoreSeconds - 0.01);
    return index === -1 ? parsed.notes.length : index;
  }

  function finishPlayback(parsed: ParsedMidi) {
    tickerRef.current?.stop();
    isPlayingRef.current = false;
    playbackGenerationRef.current += 1;
    playbackStateRef.current = 'stopped';
    setPlaybackState('stopped');
    setIsPaused(false);
    resumeScoreTimeRef.current = parsed.durationSeconds;
    nextNoteIdxRef.current     = 0;
    scheduledPlaybackHandlesRef.current.clear();
    scheduledHandleEndsRef.current.clear();
    resetMasterLevel(false);
    notifyTransport();
    syncPlaybackPositionState(parsed.durationSeconds, parsed);
  }

  function onSchedulerTick() {
    const parsed = parsedMidiRef.current;
    if (!parsed || !isPlayingRef.current) return;
    runSchedulerTick();
    const heard = audibleScoreSeconds();
    if (heard == null) return;
    if (heard >= parsed.durationSeconds - 1e-3) {
      finishPlayback(parsed);
      return;
    }
    syncPlaybackPositionState(heard, parsed);
  }
  const onSchedulerTickRef = useRef(onSchedulerTick);
  onSchedulerTickRef.current = onSchedulerTick;

  function ensureTicker() {
    if (!tickerRef.current) {
      tickerRef.current = createPlaybackTicker(() => onSchedulerTickRef.current(), SCHEDULER_TICK_MS);
    }
    return tickerRef.current;
  }

  // ── Public API ──────────────────────────────────────────────────────────────

  // Pre-warm the active sample or soundfont so it is ready before playback.
  // Must be called from a user-gesture context (click/keydown) to satisfy AudioContext policy.
  const prewarm = useCallback(async () => {
    const ac = getAc();
    await activatePlaybackAudioContext(ac);
    const selectedNote = options?.selectedNoteRef?.current ?? options?.selectedNote;
    const sampleBank = sampleBankRef.current;
    if (sampleBank) {
      if (!selectedNote || selectedNote.isRest) return;
      const filename = resolvePlaybackSampleFilename(
        sampleBank,
        coreDocumentRef.current,
        selectedNote.corePartId,
        resolveAuditionMidi(selectedNote, coreDocumentRef.current),
      );
      if (!filename || sampleBuffersRef.current.has(filename)) return;
      try {
        await ensureSampleBuffer(filename);
      } catch (err) {
        dbg.warn('playback', 'local template sample prewarm failed (non-fatal):', err);
      }
      return;
    }
    const soundfont = resolvePlaybackSoundfontInstrument(
      coreDocumentRef.current,
      selectedNote?.corePartId,
    );
    if (playersRef.current.has(soundfont)) return;
    try {
      await ensurePlayer(soundfont);
    } catch (err) {
      dbg.warn('playback', 'prewarm failed (non-fatal):', err);
    }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const loadMidi = useCallback(async (xml: string, loadOptions?: { silent?: boolean }) => {
    if (!xml) return false;
    const swingRatio = options?.coreDocument?.swingRatio;
    const swingUnit = options?.coreDocument?.swingUnit ?? 'eighth';
    const playbackCacheKey = `${xml}\n<!-- nex-note-playback swing=${swingRatio ?? 'none'} unit=${swingUnit} -->`;
    if (loadedXmlRef.current === playbackCacheKey && parsedMidiRef.current) {
      // Only touch state when there is an error to clear: inside a click handler React re-renders
      // the whole app synchronously before playback can start.
      if (playbackErrorRef.current) setPlaybackError(null);
      return true;
    }
    const existingLoad = midiLoadRef.current;
    if (existingLoad?.xml === playbackCacheKey) {
      if (!loadOptions?.silent) {
        setMidiLoading(true);
        try {
          const ready = await existingLoad.promise;
          if (!ready && existingLoad.silent) {
            return await loadMidi(xml, loadOptions);
          }
          return ready;
        } finally {
          setMidiLoading(false);
        }
      }
      return existingLoad.promise;
    }

    const requestId = ++latestMidiRequestIdRef.current;
    const shouldShowLoading = !loadOptions?.silent;

    let currentPromise: Promise<boolean> | null = null;
    const promise = (async () => {
      if (!loadOptions?.silent) setPlaybackError(null);
      try {
        const midiPayload = await loadPlaybackMidiBuffer(xml);
        const buf = midiPayload.buffer;
        if (midiPayload.renderer === 'client-fallback') {
          dbg.info('playback', 'Using client-side MIDI fallback because the Mac server is unavailable.');
        }
        const { Midi } = await import('@tonejs/midi');
        const midi = new Midi(buf);

        const { parsed, duplicateSummary } = parsePlaybackMidi(midi, options?.coreDocument ?? null, swingRatio, swingUnit);
        const { rawNotes, notes, durationSeconds, timeSignatureNumerator, timeSignatureDenominator } = parsed;
        const avgBpm = parsed.tempos[0]?.bpm ?? 120;

        if (requestId !== latestMidiRequestIdRef.current) {
          return false;
        }

        playbackGeometryCacheRef.current = {
          parsed,
          coreDocument: coreDocumentRef.current,
          ranges: resolveRenderedMeasureBeatRanges(coreDocumentRef.current, parsed),
        };
        setTotalBeats(Math.ceil(secondsToScoreBeats(durationSeconds, parsed)));
        parsedMidiRef.current = parsed;
        playbackStartScoreTimeRef.current = 0;
        const initialSnapshot = buildPlayheadSnapshot(0, 0, parsed, resolveRenderedMeasureBeatRanges(options?.coreDocument ?? null, parsed), false);
        const initialCursorTarget = {
          measureNumber: initialSnapshot.measureNumber,
          timestampNum: initialSnapshot.timestampNum,
          timestampDen: initialSnapshot.timestampDen,
        };
        playbackCursorTargetRef.current = initialCursorTarget;
        playheadRef.current = initialSnapshot;
        lastPublishedSpanRef.current = initialSnapshot.spanIndex;
        currentMeasureRef.current = initialSnapshot.measureNumber;
        currentBeatRef.current = 0;
        currentTimeMsRef.current = 0;
        setPlaybackPosition({
          currentMeasure: initialSnapshot.measureNumber,
          currentBeat: 0,
          playbackCursorTarget: initialCursorTarget,
          playhead: initialSnapshot,
          currentTimeMs: 0,
        });
        setIsPaused(false);
        justOpenedRef.current = true;
        loadedXmlRef.current = playbackCacheKey;
        setHasMidi(true);
        setPlaybackError(null);
        if (loadOptions?.silent) {
          // The score is idle and its MIDI is ready: get its instruments ready for the first Play.
          const idle = (globalThis as { requestIdleCallback?: (callback: () => void, options?: { timeout: number }) => number }).requestIdleCallback;
          const preload = () => { if (parsedMidiRef.current === parsed) preloadPlaybackInstruments(parsed); };
          if (typeof idle === 'function') idle(preload, { timeout: 2_000 });
          else setTimeout(preload, 0);
        }
        dbg.playback(`OK — ${notes.length} normalized notes from ${rawNotes.length} raw MIDI notes, ${midi.tracks.length} tracks, ${durationSeconds.toFixed(1)}s, ${avgBpm}bpm, timeSig=${timeSignatureNumerator}/${timeSignatureDenominator}`);
        if (duplicateSummary.duplicateGroupCount > 0) {
          dbg.info(
            'playback',
            `detected ${duplicateSummary.duplicateGroupCount} simultaneous duplicate MIDI groups (${duplicateSummary.duplicateNoteCount} raw notes). sample: `
            + duplicateSummary.sample.map((entry) => (
              `${midiName(entry.midi)}@${entry.time.toFixed(3)}s x${entry.count} maxDur=${entry.maxDuration.toFixed(3)}s`
            )).join(', ')
          );
        }
        return true;
      } catch (err) {
        if (!loadOptions?.silent && requestId === latestMidiRequestIdRef.current) {
          parsedMidiRef.current = null;
          setHasMidi(false);
          setPlaybackError(err instanceof Error ? err.message : 'Failed to load MIDI.');
        }
        if (loadOptions?.silent) {
          dbg.warn('playback', 'Silent MIDI preload failed:', err);
        } else {
          dbg.error('playback', 'Failed to load MIDI:', err);
          console.error('Failed to load MIDI:', err);
        }
        return false;
      } finally {
        if (currentPromise && midiLoadRef.current?.promise === currentPromise) {
          midiLoadRef.current = null;
        }
      }
    })();
    currentPromise = promise;

    midiLoadRef.current = { xml: playbackCacheKey, promise, silent: Boolean(loadOptions?.silent) };

    if (!shouldShowLoading) return promise;

    setMidiLoading(true);
    try {
      return await promise;
    } finally {
      setMidiLoading(false);
    }
  }, [options?.coreDocument]);

  const ensureMidiLoaded = useCallback(async (xml: string) => {
    return loadMidi(xml);
  }, [loadMidi]);

  const preloadMidi = useCallback(async (xml: string) => {
    return loadMidi(xml, { silent: true });
  }, [loadMidi]);

  const play = useCallback(async (startScoreSeconds?: number) => {
    const parsed = parsedMidiRef.current;
    if (!parsed) {
      setPlaybackError('No MIDI loaded for playback.');
      dbg.warn('playback', 'play(): no MIDI loaded');
      return false;
    }
    if (isPlayingRef.current && !Number.isFinite(startScoreSeconds)) return true;

    const playRequestId = ++playRequestIdRef.current;
    try {
      const ac = getAc();
      await activatePlaybackAudioContext(ac);

      probeMark('play-context');
      // Load every track's own soundfont before starting the scheduler.
      await ensurePlaybackPlayers(parsed);
      probeMark('play-players');
      if (playRequestId !== playRequestIdRef.current) return false;

      const fromScore = Number.isFinite(startScoreSeconds)
        ? clampScoreSeconds(startScoreSeconds ?? 0, parsed)
        : playbackState === 'paused'
        ? resumeScoreTimeRef.current
        : resolveStartScoreSeconds({
          parsed,
          selectedNote: options?.selectedNoteRef?.current ?? options?.selectedNote,
          selectedMeasureNumbers: options?.selectedMeasureNumbers,
          currentScoreSeconds: resumeScoreTimeRef.current,
          coreDocument: options?.coreDocument ?? null,
          justOpened: justOpenedRef.current,
        });
      resumeScoreTimeRef.current = fromScore;
      if (playbackState !== 'paused' || Number.isFinite(startScoreSeconds)) {
        playbackStartScoreTimeRef.current = fromScore;
      }
      const scale = resolvePlaybackTempoScale(parsed, tempoOverrideRef.current);

      // Stop whatever an earlier run left scheduled; the context and loaded sounds stay.
      stopScheduledPlaybackHandles();
      playersRef.current.forEach((player) => {
        try { player.stop(); } catch { /* nothing active */ }
      });

      // originAcTimeRef: the AudioContext time at which score-time 0 would sound. The first note
      // is due START_LEAD_S from now, so it reaches the audio thread before it is needed.
      originAcTimeRef.current = ac.currentTime + START_LEAD_S - fromScore / scale;
      runStartScoreRef.current = fromScore;
      nextNoteIdxRef.current = firstNoteIndexAtOrAfter(parsed, fromScore);
      nextClickIdxRef.current = firstClickIndexAtOrAfter(parsed, fromScore);
      getAudibleClock(ac);

      playbackGenerationRef.current += 1;
      isPlayingRef.current = true;
      playbackStateRef.current = 'playing';
      lastPublishedSpanRef.current = -1;
      // Schedule the opening window synchronously, before React re-renders for the new state.
      runSchedulerTick();
      ensureTicker().start();
      notifyTransport();

      justOpenedRef.current = false;
      // Sound is already scheduled and the score draws from the transport; the app's re-render
      // for the new state is non-urgent so it cannot hold up the first frames of the playhead.
      startTransition(() => {
        setPlaybackState('playing');
        setIsPaused(false);
        if (playbackErrorRef.current) setPlaybackError(null);
      });
      syncPlaybackPositionState(fromScore, parsed);
      return true;
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Playback could not start.';
      setPlaybackError(message);
      dbg.error('playback', 'play() failed:', err);
      return false;
    }
  }, [options?.coreDocument, options?.selectedMeasureNumbers, options?.selectedNote, options?.selectedNoteRef, playbackState, syncPlaybackPositionState]);

  /** Ends the current run without changing React state. */
  function haltRun() {
    tickerRef.current?.stop();
    stopScheduledPlayback();
    const wasPlaying = isPlayingRef.current;
    isPlayingRef.current = false;
    playbackGenerationRef.current += 1;
    if (wasPlaying) notifyTransport();
  }

  const pause = useCallback(() => {
    if (!isPlayingRef.current) return;
    playRequestIdRef.current += 1;
    const parsed = parsedMidiRef.current;
    // Resume from what was heard, not from what the audio graph had already rendered.
    const heard = audibleScoreSeconds();
    if (heard != null) resumeScoreTimeRef.current = heard;

    haltRun();
    playbackStateRef.current = 'paused';
    setPlaybackState('paused');
    setIsPaused(true);
    if (parsed) {
      syncPlaybackPositionState(resumeScoreTimeRef.current, parsed);
    }
  }, [syncPlaybackPositionState]); // eslint-disable-line react-hooks/exhaustive-deps

  const stop = useCallback(() => {
    playRequestIdRef.current += 1;
    haltRun();
    const parsed = parsedMidiRef.current;
    resumeScoreTimeRef.current = playbackStartScoreTimeRef.current;
    nextNoteIdxRef.current     = 0;
    playbackStateRef.current = 'stopped';
    setPlaybackState('stopped');
    setIsPaused(false);
    if (parsed) {
      syncPlaybackPositionState(playbackStartScoreTimeRef.current, parsed);
    } else {
      currentMeasureRef.current = 1;
      currentBeatRef.current = 0;
      playbackCursorTargetRef.current = null;
      playheadRef.current = null;
      currentTimeMsRef.current = 0;
      lastPublishedSpanRef.current = -1;
      setPlaybackPosition({
        currentMeasure: 1,
        currentBeat: 0,
        playbackCursorTarget: null,
        playhead: null,
        currentTimeMs: 0,
      });
    }
  }, [syncPlaybackPositionState]); // eslint-disable-line react-hooks/exhaustive-deps

  const seek = useCallback(async (beatPosition: number) => {
    const parsed = parsedMidiRef.current;
    if (!parsed) return;
    const wasPlaying = isPlayingRef.current;
    if (wasPlaying) haltRun();
    resumeScoreTimeRef.current = clampScoreSeconds(beatsToSeconds(beatPosition, parsed), parsed);
    justOpenedRef.current = false;
    syncPlaybackPositionState(resumeScoreTimeRef.current, parsed);
    if (wasPlaying) await play(resumeScoreTimeRef.current);
  }, [play, syncPlaybackPositionState]); // eslint-disable-line react-hooks/exhaustive-deps

  const seekToCursorTarget = useCallback(async (target: PlaybackCursorTarget) => {
    const parsed = parsedMidiRef.current;
    if (!parsed) return;
    const measureBeatRanges = getPlaybackMeasureBeatRanges(parsed);
    resumeScoreTimeRef.current = clampScoreSeconds(cursorTargetToScoreSeconds(target, parsed, measureBeatRanges), parsed);
    playbackStartScoreTimeRef.current = resumeScoreTimeRef.current;
    justOpenedRef.current = false;
    playbackStateRef.current = 'stopped';
    setPlaybackState('stopped');
    setIsPaused(false);
    syncPlaybackPositionState(resumeScoreTimeRef.current, parsed);
  }, [getPlaybackMeasureBeatRanges, syncPlaybackPositionState]);

  const setTempo = useCallback((bpm: number) => {
    if (!Number.isFinite(bpm) || bpm <= 0) return;

    const parsed = parsedMidiRef.current;
    const ac = audioCtxRef.current;
    if (parsed && ac && isPlayingRef.current) {
      // Re-anchor at the render clock: notes already handed to the output keep their time, the
      // rest is rescheduled at the new tempo from the same score position.
      const tempoChange = resolvePlaybackTempoChangeOrigin({
        parsed,
        currentAcSeconds: ac.currentTime + MIN_SCHEDULE_LEAD_S,
        originAcSeconds: originAcTimeRef.current,
        currentTempoOverride: tempoOverrideRef.current,
        nextTempoOverride: bpm,
      });
      const currentScoreSeconds = tempoChange.currentScoreSeconds;
      originAcTimeRef.current = tempoChange.originAcSeconds;
      nextNoteIdxRef.current = firstNoteIndexAtOrAfter(parsed, currentScoreSeconds + 0.01);
      nextClickIdxRef.current = firstClickIndexAtOrAfter(parsed, currentScoreSeconds);
      stopScheduledPlaybackHandles();
      tempoOverrideRef.current = bpm;
      runSchedulerTick();
      const heard = audibleScoreSeconds();
      resumeScoreTimeRef.current = heard ?? currentScoreSeconds;
      syncPlaybackPositionState(resumeScoreTimeRef.current, parsed);
    }

    tempoOverrideRef.current = bpm;
    setTempoOverride(bpm);
  }, [syncPlaybackPositionState]); // eslint-disable-line react-hooks/exhaustive-deps

  const startFromNote = useCallback(async (note: SelectedNote | null) => {
    const parsed = parsedMidiRef.current;
    if (!parsed || !note) return;

    const measureBeatRanges = getPlaybackMeasureBeatRanges(parsed);
    // In a repeated passage, a click while playing restarts from the pass being heard.
    const heard = audibleScoreSeconds();
    const wholes = note.timestampNum / Math.max(note.timestampDen, 1);
    const fromTimeline = playbackTimelineFor(parsed, measureBeatRanges).secondsAt(note.measureNumber, wholes, heard ?? undefined);
    resumeScoreTimeRef.current = clampScoreSeconds(fromTimeline ?? noteToScoreSeconds(note, parsed, measureBeatRanges), parsed);
    playbackStartScoreTimeRef.current = resumeScoreTimeRef.current;
    justOpenedRef.current = false;
    dbg.playback(`startFromNote m.${note.measureNumber} ts=${note.timestampNum}/${note.timestampDen} score=${resumeScoreTimeRef.current.toFixed(2)}s`);
    if (dbg.enabled()) {
      dbg.midi(formatDebugJson('start compare', buildPlaybackCompare(note, parsed, options?.coreDocument ?? null)));
    }

    // Keep the AudioContext and the loaded instruments: restarting must not reload sounds.
    haltRun();
    await play(resumeScoreTimeRef.current);
  }, [getPlaybackMeasureBeatRanges, options?.coreDocument, play]); // eslint-disable-line react-hooks/exhaustive-deps

  function auditionDuration(soundfont: SoundfontInstrumentName, note: SelectedNote) {
    const parsed = parsedMidiRef.current;
    return resolveAuditionDurationSeconds({
      soundfont,
      durationType: note.durationType,
      isDotted: note.isDotted,
      quarterSeconds: parsed ? resolvePlaybackQuarterBeatSeconds(parsed, tempoOverrideRef.current) : null,
    });
  }

  const previewNote = useCallback(async (note: SelectedNote | null) => {
    if (!note || note.isRest) return;
    const metric = captureInputMetric();

    const previewGeneration = ++previewGenerationRef.current;
    stopHandleSet(previewSampleHandlesRef.current);
    // Sounding pitch: transposing parts (B flat clarinet, guitar an octave down) sound as written.
    const midi = resolveAuditionMidi(note, coreDocumentRef.current);
    const sampleBank = sampleBankRef.current;
    try {
      const ac = getAc();
      await activatePlaybackAudioContext(ac);
      if (sampleBank) {
        const filename = resolvePlaybackSampleFilename(sampleBank, coreDocumentRef.current, note.corePartId, midi);
        if (!filename) return;
        const buffer = await ensureSampleBuffer(filename);
        if (previewGeneration !== previewGenerationRef.current) return;
        const handle = startAudioSample(ac, buffer, ac.currentTime + 0.01, AUDITION_GAIN, musicDestination(ac));
        previewSampleHandlesRef.current.add(handle);
        markInputFeedback('input-to-audio-scheduled', metric);
        window.setTimeout(() => previewSampleHandlesRef.current.delete(handle), (buffer.duration + 0.25) * 1000);
        return;
      }
      const soundfont = resolvePlaybackSoundfontInstrument(options?.coreDocument, note.corePartId);
      const player = await ensurePlayer(soundfont);
      if (previewGeneration !== previewGenerationRef.current) return;
      const when = ac.currentTime + 0.01;
      player.stop();
      startPlaybackNote(player, midi, when, {
        duration: auditionDuration(soundfont, note),
        gain: AUDITION_GAIN,
      });
      markInputFeedback('input-to-audio-scheduled', metric);
    } catch (err) {
      dbg.warn('playback', 'preview note failed:', err);
    }
  }, [options?.coreDocument]); // eslint-disable-line react-hooks/exhaustive-deps

  const previewNotes = useCallback(async (notes: SelectedNote[]) => {
    const metric = captureInputMetric();
    const playableNotes = notes.filter((note) => note && !note.isRest);
    if (playableNotes.length === 0) return;

    const previewGeneration = ++previewGenerationRef.current;
    stopHandleSet(previewSampleHandlesRef.current);
    try {
      const ac = getAc();
      await activatePlaybackAudioContext(ac);
      const sampleBank = sampleBankRef.current;
      if (sampleBank) {
        const sampleNotes = playableNotes.map((note) => ({
          note,
          filename: resolvePlaybackSampleFilename(
            sampleBank,
            coreDocumentRef.current,
            note.corePartId,
            resolveAuditionMidi(note, coreDocumentRef.current),
          ),
        })).filter((entry): entry is { note: SelectedNote; filename: string } => Boolean(entry.filename));
        if (sampleNotes.length === 0) return;
        const buffers = await Promise.all(sampleNotes.map(async (entry) => ({
          ...entry,
          buffer: await ensureSampleBuffer(entry.filename),
        })));
        if (previewGeneration !== previewGenerationRef.current) return;
        const when = ac.currentTime + 0.01;
        const gain = auditionChordGain(sampleNotes.length);
        buffers.forEach(({ buffer }) => {
          const handle = startAudioSample(ac, buffer, when, gain, musicDestination(ac));
          previewSampleHandlesRef.current.add(handle);
          window.setTimeout(() => previewSampleHandlesRef.current.delete(handle), (buffer.duration + 0.25) * 1000);
        });
        markInputFeedback('input-to-audio-scheduled', metric);
        return;
      }
      const notesBySoundfont = new Map<SoundfontInstrumentName, SelectedNote[]>();
      playableNotes.forEach((note) => {
        const soundfont = resolvePlaybackSoundfontInstrument(options?.coreDocument, note.corePartId);
        const group = notesBySoundfont.get(soundfont) ?? [];
        group.push(note);
        notesBySoundfont.set(soundfont, group);
      });
      const loadedPlayers = await Promise.all([...notesBySoundfont.keys()].map(async (soundfont) => ({
        soundfont,
        player: await ensurePlayer(soundfont),
      })));
      if (previewGeneration !== previewGenerationRef.current) return;
      const when = ac.currentTime + 0.01;
      loadedPlayers.forEach(({ soundfont, player }) => {
        player.stop();
        (notesBySoundfont.get(soundfont) ?? []).forEach((note) => {
          startPlaybackNote(player, resolveAuditionMidi(note, coreDocumentRef.current), when, {
            duration: auditionDuration(soundfont, note),
            gain: auditionChordGain(playableNotes.length),
          });
        });
      });
      markInputFeedback('input-to-audio-scheduled', metric);
    } catch (err) {
      dbg.warn('playback', 'preview notes failed:', err);
    }
  }, [options?.coreDocument]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => () => {
    tickerRef.current?.dispose();
    tickerRef.current = null;
    isPlayingRef.current = false;
    playerCacheGenerationRef.current += 1;
    playersRef.current.forEach((player) => {
      try { player.stop(); } catch { /* Ignore cleanup failures during unmount. */ }
    });
    playersRef.current.clear();
    playerLoadsRef.current.clear();
    stopHandleSet(previewSampleHandlesRef.current);
    stopHandleSet(scheduledPlaybackHandlesRef.current);
    sampleBuffersRef.current.clear();
    sampleLoadsRef.current.clear();
    audioCtxRef.current?.close();
  }, []);

  return {
    playbackState, currentMeasure, currentBeat, totalBeats,
    midiLoading, hasMidi, playbackError, tempoOverride, playbackCursorTarget, playhead, currentTimeMs, isPaused,
    metronomeEnabled, setMetronomeEnabled,
    loadMidi, ensureMidiLoaded, preloadMidi, prewarm, play, pause, stop, seek, seekToCursorTarget, startFromNote, previewNote, previewNotes,
    setTempo, setMixer,
    transport: transportRef.current,
  };
}
