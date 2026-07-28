'use client';

import { useRef, useState, useCallback, useEffect, type RefObject } from 'react';
import { dbg } from '@/lib/debug';
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
import type { ScoreDocumentModel, TimedEvent } from '@/src/score-core/model/types';

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
  startTimeMs: number;
  startTimeSeconds: number;
  isPaused: boolean;
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
}

interface MeasureBeatRange {
  measureNumber: number;
  startBeat: number;
  endBeat: number;
}

const LOOKAHEAD_S = 1.5;   // schedule 1.5s ahead — handles main-thread blocks up to ~1s
const LATE_TOLERANCE_S = 0.20; // still play notes up to 200ms past their scheduled time
const SOUND_FONT_LOAD_TIMEOUT_MS = 5000;
const PLAYHEAD_END_EPSILON_S = 0.02;
const PLAYHEAD_RENDER_LEAD_S = 0;
const PLAYHEAD_UI_UPDATE_INTERVAL_MS = 64;
const PLAYBACK_SCHEDULER_INTERVAL_S = 0.05;
const PLAYHEAD_PROGRESS_EPSILON = 0.002;

const NOTE_NAMES = ['C','C#','D','D#','E','F','F#','G','G#','A','A#','B'];
const MIDI_TIME_EPSILON_S = 0.001;

export async function activatePlaybackAudioContext(
  audioContext: Pick<AudioContext, 'resume' | 'state'>,
) {
  if (audioContext.state === 'closed') {
    throw new Error('The audio output is closed. Tap Play again.');
  }
  if (audioContext.state === 'suspended') {
    await audioContext.resume();
  }
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
  return resolveMidiInstrumentSound(resolvePartInstrumentId(part)).soundfont;
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
  const fallbackInstrumentId = resolvePartInstrumentId(part);

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
  const playableTrackParts = parts.flatMap((part) => (
    part.staves
      .filter((staff) => staff.measures.some((measure) => (
        measure.voices.some((voice) => voice.events.some((event) => event.kind === 'note' && !event.hidden))
      )))
      .map(() => part)
  ));
  const playablePositionalPart = trackCount === playableTrackParts.length
    ? playableTrackParts[trackIndex]
    : null;
  const trackName = normalizeTrackName(track.name);
  const namedPart = trackName
    ? parts.find((part) => [part.instrumentName, part.name].some((name) => {
        const normalizedName = normalizeTrackName(name);
        return normalizedName && (trackName.includes(normalizedName) || normalizedName.includes(trackName));
      }))
    : null;
  const positionalPart = trackCount === parts.length ? parts[trackIndex] : null;
  const onlyPart = parts.length === 1 ? parts[0] : null;
  return playablePositionalPart ?? namedPart ?? positionalPart ?? onlyPart ?? null;
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

function createOscillatorFallbackPlayer(ac: AudioContext): PlaybackPlayer {
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
    const gainValue = Math.max(0.02, Math.min(1, options?.gain ?? 0.5));
    const attack = Math.max(0.001, Math.min(0.02, options?.attack ?? 0.005));

    const oscillator = ac.createOscillator();
    const gainNode = ac.createGain();
    oscillator.type = 'triangle';
    oscillator.frequency.setValueAtTime(midiToFrequency(midi), startAt);
    gainNode.gain.setValueAtTime(0.0001, startAt);
    gainNode.gain.exponentialRampToValueAtTime(gainValue, startAt + attack);
    gainNode.gain.exponentialRampToValueAtTime(0.0001, startAt + duration + release);
    oscillator.connect(gainNode);
    gainNode.connect(ac.destination);
    oscillator.start(startAt);
    oscillator.stop(startAt + duration + release);

    const handle = {
      oscillator,
      gain: gainNode,
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
): PlaybackNoteHandle {
  const startAt = Math.max(ac.currentTime, when);
  const source = ac.createBufferSource();
  const gain = ac.createGain();
  source.buffer = buffer;
  gain.gain.setValueAtTime(Math.max(0.01, Math.min(1.5, gainValue)), startAt);
  source.connect(gain);
  gain.connect(ac.destination);

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
  const clampedSeconds = Math.max(0, seconds);
  const { tempos } = parsed;
  let remainingSeconds = clampedSeconds;
  let beatCount = 0;

  for (let i = 0; i < tempos.length; i++) {
    const bpm = tempos[i].bpm;
    const currentStart = tempos[i].time;
    const nextStart = tempos[i + 1]?.time ?? Number.POSITIVE_INFINITY;
    const segmentDuration = Math.max(0, nextStart - currentStart);

    if (remainingSeconds <= segmentDuration) {
      return beatCount + (remainingSeconds / (60 / bpm));
    }

    beatCount += segmentDuration / (60 / bpm);
    remainingSeconds -= segmentDuration;
  }

  const lastBpm = tempos[tempos.length - 1]?.bpm ?? 120;
  return beatCount + (remainingSeconds / (60 / lastBpm));
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

function noteToMidiNumber(note: SelectedNote) {
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
    };
  });
}

function parseEndingNumbers(numberString: string | null | undefined): string[] {
  return String(numberString ?? '').split(',').map((entry) => entry.trim()).filter(Boolean);
}

function buildEndingNumberMap(referenceStaff: ScoreDocumentModel['score']['parts'][number]['staves'][number]) {
  const activeEndings = new Set<string>();
  return referenceStaff.measures.map((measure) => {
    const numbers = new Set<string>();
    const leftNumbers = parseEndingNumbers(measure.leftEnding?.number);
    const rightNumbers = parseEndingNumbers(measure.rightEnding?.number);

    if (measure.leftEnding?.type === 'start') {
      leftNumbers.forEach((number) => activeEndings.add(number));
    }
    activeEndings.forEach((number) => numbers.add(number));
    leftNumbers.forEach((number) => numbers.add(number));
    rightNumbers.forEach((number) => numbers.add(number));

    if (measure.rightEnding?.type === 'stop' || measure.rightEnding?.type === 'discontinue') {
      rightNumbers.forEach((number) => activeEndings.delete(number));
    }

    return numbers;
  });
}

function shouldIncludeMeasureForPass(endingNumbers: Set<string>, passNumber: number) {
  return endingNumbers.size === 0 || endingNumbers.has(String(passNumber));
}

function hasRepeatPlaybackStructure(coreDocument: ScoreDocumentModel | null | undefined) {
  const referenceStaff = coreDocument?.score.parts[0]?.staves[0];
  return Boolean(referenceStaff?.measures.some((measure) => (
    measure.leftBarline === 'repeat-start'
    || measure.rightBarline === 'repeat-end'
    || measure.leftEnding
    || measure.rightEnding
  )));
}

export function buildPlaybackMeasureBeatRanges(
  coreDocument: ScoreDocumentModel | null | undefined,
  parsed: ParsedMidi,
): MeasureBeatRange[] {
  const writtenRanges = buildMeasureBeatRanges(coreDocument, parsed);
  const referenceStaff = coreDocument?.score.parts[0]?.staves[0];
  if (!referenceStaff?.measures?.length || !hasRepeatPlaybackStructure(coreDocument)) {
    return writtenRanges;
  }

  const endingNumbersByMeasure = buildEndingNumberMap(referenceStaff);
  const playbackRanges: MeasureBeatRange[] = [];
  let beatCursor = 0;
  let repeatStartIndex = 0;
  let postRepeatPass: number | null = null;

  const appendMeasure = (measureIndex: number) => {
    const writtenRange = writtenRanges[measureIndex];
    if (!writtenRange) return;
    const beatsInMeasure = Math.max(writtenRange.endBeat - writtenRange.startBeat, 0);
    const startBeat = beatCursor;
    beatCursor += beatsInMeasure;
    playbackRanges.push({
      measureNumber: writtenRange.measureNumber,
      startBeat,
      endBeat: beatCursor,
    });
  };

  referenceStaff.measures.forEach((measure, measureIndex) => {
    const endingNumbers = endingNumbersByMeasure[measureIndex] ?? new Set<string>();
    if (postRepeatPass != null && endingNumbers.size === 0) {
      postRepeatPass = null;
    }
    if (measure.leftBarline === 'repeat-start') {
      repeatStartIndex = measureIndex;
    }

    const currentPass = postRepeatPass ?? 1;
    if (shouldIncludeMeasureForPass(endingNumbers, currentPass)) {
      appendMeasure(measureIndex);
    }

    if (measure.rightBarline === 'repeat-end') {
      for (let repeatedIndex = repeatStartIndex; repeatedIndex <= measureIndex; repeatedIndex += 1) {
        const repeatedEndingNumbers = endingNumbersByMeasure[repeatedIndex] ?? new Set<string>();
        if (shouldIncludeMeasureForPass(repeatedEndingNumbers, 2)) {
          appendMeasure(repeatedIndex);
        }
      }
      repeatStartIndex = measureIndex + 1;
      postRepeatPass = 2;
    }
  });

  return playbackRanges.length ? playbackRanges : writtenRanges;
}

export function resolveFullPlaybackDurationSeconds(
  coreDocument: ScoreDocumentModel | null | undefined,
  parsed: ParsedMidi,
  audibleDurationSeconds = parsed.durationSeconds,
) {
  const measureBeatRanges = buildPlaybackMeasureBeatRanges(coreDocument, parsed);
  const fullScoreDurationSeconds = measureBeatRanges.length
    ? beatsToSeconds(measureBeatRanges[measureBeatRanges.length - 1].endBeat, parsed)
    : 0;
  return Math.max(audibleDurationSeconds, fullScoreDurationSeconds);
}

function secondsToScoreBeats(seconds: number, parsed: ParsedMidi): number {
  const clampedSeconds = Math.max(0, Math.min(seconds, parsed.durationSeconds));
  const { tempos } = parsed;
  let remainingSeconds = clampedSeconds;
  let beatCount = 0;

  for (let i = 0; i < tempos.length; i++) {
    const bpm = tempos[i].bpm;
    const currentStart = tempos[i].time;
    const nextStart = tempos[i + 1]?.time ?? Number.POSITIVE_INFINITY;
    const segmentDuration = Math.max(0, nextStart - currentStart);

    if (remainingSeconds <= segmentDuration) {
      return beatCount + (remainingSeconds / (60 / bpm));
    }

    beatCount += segmentDuration / (60 / bpm);
    remainingSeconds -= segmentDuration;
  }

  const lastBpm = tempos[tempos.length - 1]?.bpm ?? 120;
  return beatCount + (remainingSeconds / (60 / lastBpm));
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

function scoreSecondsToCursorTargetWithMeasures(
  seconds: number,
  parsed: ParsedMidi,
  measureBeatRanges: MeasureBeatRange[],
): PlaybackCursorTarget {
  const scoreBeats = secondsToScoreBeats(seconds, parsed);
  const targetIndex = measureBeatRanges.findIndex((range, index) => (
    scoreBeats < range.endBeat
    || index === measureBeatRanges.length - 1
  ));
  const targetMeasure = measureBeatRanges[targetIndex] ?? measureBeatRanges[0] ?? { measureNumber: 1, startBeat: 0, endBeat: quarterBeatsPerMeasure(parsed) };
  const beatsInMeasure = Math.max(targetMeasure.endBeat - targetMeasure.startBeat, 0.0001);
  const beatWithinMeasure = Math.max(0, Math.min(scoreBeats - targetMeasure.startBeat, beatsInMeasure));
  const timestampDen = 64;
  const rawTimestampNum = Math.max(0, Math.round((beatWithinMeasure / beatsInMeasure) * timestampDen));
  const overflowMeasure = rawTimestampNum >= timestampDen && beatWithinMeasure > 0 ? 1 : 0;
  const nextMeasure = measureBeatRanges[targetIndex + 1] ?? measureBeatRanges.find((range) => range.startBeat >= targetMeasure.endBeat);

  return {
    measureNumber: overflowMeasure ? (nextMeasure?.measureNumber ?? targetMeasure.measureNumber + 1) : targetMeasure.measureNumber,
    timestampNum: overflowMeasure ? 0 : rawTimestampNum,
    timestampDen,
  };
}

function cursorTargetToScoreBeats(
  target: PlaybackCursorTarget,
  measureBeatRanges: MeasureBeatRange[],
  parsed: Pick<ParsedMidi, 'timeSignatureNumerator' | 'timeSignatureDenominator'>,
) {
  const range = measureBeatRanges.find((entry) => entry.measureNumber === target.measureNumber);
  if (!range) {
    const fallbackBeatsPerMeasure = quarterBeatsPerMeasure(parsed);
    return Math.max(0, (target.measureNumber - 1) * fallbackBeatsPerMeasure) + (target.timestampNum / Math.max(target.timestampDen, 1)) * fallbackBeatsPerMeasure;
  }
  return range.startBeat + (target.timestampNum / Math.max(target.timestampDen, 1)) * (range.endBeat - range.startBeat);
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
  if (!params.hasPublishedPlayhead || !params.isPlaying || params.measureChanged) return true;
  return Math.abs(params.nextTimeMs - params.previousTimeMs) >= PLAYHEAD_UI_UPDATE_INTERVAL_MS;
}

function buildPlayheadSnapshot(
  scoreSeconds: number,
  startSeconds: number,
  parsed: ParsedMidi,
  measureBeatRanges: MeasureBeatRange[],
  isPaused: boolean,
): PlaybackPlayheadSnapshot {
  const clampedScoreSeconds = clampScoreSeconds(scoreSeconds, parsed);
  const scoreBeats = secondsToScoreBeats(clampedScoreSeconds, parsed);
  const cursorTarget = scoreSecondsToCursorTargetWithMeasures(clampedScoreSeconds, parsed, measureBeatRanges);
  const activeRange = measureBeatRanges.find((range, index) => (
    scoreBeats < range.endBeat
    || index === measureBeatRanges.length - 1
  ));
  const progressWithinMeasure = activeRange
    ? Math.max(0, Math.min(
      (scoreBeats - activeRange.startBeat) / Math.max(activeRange.endBeat - activeRange.startBeat, 0.0001),
      1,
    ))
    : cursorTarget.timestampNum / Math.max(cursorTarget.timestampDen, 1);

  return {
    ...cursorTarget,
    currentTimeMs: Math.round(clampedScoreSeconds * 1000),
    currentTimeSeconds: clampedScoreSeconds,
    progressWithinMeasure,
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

  const measureBeatRanges = buildPlaybackMeasureBeatRanges(coreDocument, parsed);
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
  const { tempos } = parsed;
  let remainingBeats = Math.max(0, beats);
  let cursorSeconds = 0;

  for (let i = 0; i < tempos.length; i++) {
    const bpm = tempos[i].bpm;
    const segEndSeconds = tempos[i + 1]?.time ?? Number.POSITIVE_INFINITY;
    const segDurationSeconds = segEndSeconds - cursorSeconds;
    const segBeats = Number.isFinite(segDurationSeconds)
      ? segDurationSeconds / (60 / bpm)
      : Number.POSITIVE_INFINITY;

    if (remainingBeats <= segBeats) {
      return cursorSeconds + remainingBeats * (60 / bpm);
    }

    remainingBeats -= segBeats;
    cursorSeconds = segEndSeconds;
  }

  const lastBpm = tempos[tempos.length - 1]?.bpm ?? 120;
  return cursorSeconds + remainingBeats * (60 / lastBpm);
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
  const measureBeatRanges = buildPlaybackMeasureBeatRanges(coreDocument, parsed);
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

export function usePlayback(options?: {
  coreDocument?: ScoreDocumentModel | null;
  selectedNote?: SelectedNote | null;
  selectedNoteRef?: RefObject<SelectedNote | null>;
  selectedMeasureNumbers?: number[];
  sampleBank?: PlaybackSampleBank | null;
}) {
  const [playbackState, setPlaybackState] = useState<PlaybackState>('stopped');
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
  const nextMetroIdxRef     = useRef<number>(0);   // index into metro beat list
  const rafRef              = useRef<number>(0);
  const lastSchedulerAcTimeRef = useRef(Number.NEGATIVE_INFINITY);
  const playbackGenerationRef = useRef(0);
  const playRequestIdRef = useRef(0);
  const scheduledPlaybackHandlesRef = useRef<Set<PlaybackNoteHandle>>(new Set());
  const previewSampleHandlesRef = useRef<Set<PlaybackNoteHandle>>(new Set());
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
    cancelAnimationFrame(rafRef.current);
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
    const ranges = buildPlaybackMeasureBeatRanges(coreDocument, parsed);
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
    const currentMeasureChanged = currentMeasureRef.current !== snapshot.measureNumber;
    currentMeasureRef.current = snapshot.measureNumber;
    currentBeatRef.current = nextBeat;

    const shouldPublishPosition = !playbackPlayheadsEqual(playheadRef.current, snapshot)
      && shouldPublishPlaybackPosition({
        isPlaying: playbackStateRef.current === 'playing',
        previousTimeMs: currentTimeMsRef.current,
        nextTimeMs: snapshot.currentTimeMs,
        measureChanged: currentMeasureChanged,
        hasPublishedPlayhead: playheadRef.current != null,
      });
    if (!shouldPublishPosition) return;

    playbackCursorTargetRef.current = nextCursorTarget;
    playheadRef.current = snapshot;
    currentTimeMsRef.current = snapshot.currentTimeMs;
    setPlaybackPosition((current) => {
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
    });
  }, [getPlaybackMeasureBeatRanges]);

  function getAc(): AudioContext {
    if (!audioCtxRef.current || audioCtxRef.current.state === 'closed') {
      audioCtxRef.current = new AudioContext();
    }
    return audioCtxRef.current;
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
    const ac = audioCtxRef.current;
    stopHandleSet(scheduledPlaybackHandlesRef.current);
    stopHandleSet(previewSampleHandlesRef.current);
    playersRef.current.forEach((player) => {
      try {
        player.stop();
      } catch {
        // Some instrument implementations throw when there is nothing active.
      }
    });
    if (options?.resetAudioContext) {
      playerCacheGenerationRef.current += 1;
      if (ac && ac.state !== 'closed') void ac.close().catch(() => undefined);
      audioCtxRef.current = null;
      playersRef.current.clear();
      playerLoadsRef.current.clear();
      sampleBuffersRef.current.clear();
      sampleLoadsRef.current.clear();
    }
  }

  function stopScheduledPlaybackHandles() {
    stopHandleSet(scheduledPlaybackHandlesRef.current);
  }

  async function ensurePlayer(soundfont: SoundfontInstrumentName): Promise<PlaybackPlayer> {
    const cachedPlayer = playersRef.current.get(soundfont);
    if (cachedPlayer) return cachedPlayer;
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
      if (typeof e2eLoader === 'function') {
        player = await e2eLoader(ac, soundfont);
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
          player = await Promise.race([
            instrument(ac, soundfont as import('soundfont-player').InstrumentName),
            soundfontTimeout,
          ]);
        } catch (err) {
          dbg.warn('playback', `soundfont ${soundfont} unavailable, falling back to oscillator playback:`, err);
          player = createOscillatorFallbackPlayer(ac);
        } finally {
          if (timeoutId) clearTimeout(timeoutId);
        }
      }

      if (cacheGeneration !== playerCacheGenerationRef.current || ac !== audioCtxRef.current) {
        try { player.stop(); } catch { /* Ignore cleanup failures for stale loads. */ }
        throw new Error(`Discarded stale ${soundfont} soundfont load`);
      }
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
    const soundfonts = new Set(parsed.notes.map((note) => (
      note.soundfont ?? resolvePlaybackSoundfontInstrument(coreDocumentRef.current)
    )));
    await Promise.all([...soundfonts].map((soundfont) => ensurePlayer(soundfont)));
  }

  // ── Look-ahead scheduler ────────────────────────────────────────────────────
  // Runs every SCHEDULER_INTERVAL_MS. Schedules notes that fall within the
  // next LOOKAHEAD_S window. This avoids creating all AudioBufferSourceNodes
  // at once (which crashes the AudioContext on long pieces).
  function runSchedulerTick() {
    const ac       = audioCtxRef.current;
    const parsed   = parsedMidiRef.current;
    if (!ac || !parsed || !isPlayingRef.current) return;

    const scale = resolvePlaybackTempoScale(parsed, tempoOverrideRef.current);

    const nowAc            = ac.currentTime;
    const scheduleUntilAc  = nowAc + LOOKAHEAD_S;
    let i = nextNoteIdxRef.current;

    while (i < parsed.notes.length) {
      const note        = parsed.notes[i];
      const noteAcTime  = originAcTimeRef.current + note.time / scale;

      if (noteAcTime > scheduleUntilAc) break;

      if (noteAcTime >= nowAc - LATE_TOLERANCE_S) {
        // Play at scheduled time, or immediately if slightly late
        const startAt = Math.max(noteAcTime, nowAc);
        const multiplicity = Math.max(1, note.multiplicity ?? 1);
        const gainBoost = Math.sqrt(multiplicity);
        const gain = Math.max(0.05, Math.min(1.5, note.velocity * 0.9 * gainBoost));
        const sampleBank = sampleBankRef.current;
        let handle: unknown;
        let handleDuration = note.duration / scale;
        if (sampleBank) {
          const filename = resolvePlaybackSampleFilename(sampleBank, coreDocumentRef.current, note.partId, note.midi);
          if (!filename) {
            i++;
            continue;
          }
          const buffer = sampleBuffersRef.current.get(filename);
          if (!buffer) {
            dbg.warn('playback', `skip local template sample ${filename} because it is not loaded`);
            i++;
            continue;
          }
          handle = startAudioSample(ac, buffer, startAt, gain);
          handleDuration = buffer.duration;
        } else {
          const soundfont = note.soundfont ?? resolvePlaybackSoundfontInstrument(coreDocumentRef.current);
          const player = playersRef.current.get(soundfont);
          if (!player) {
            dbg.warn('playback', `skip note ${midiName(note.midi)} because ${soundfont} is not loaded`);
            i++;
            continue;
          }
          handle = startPlaybackNote(player, note.midi, startAt, {
            duration: note.duration / scale,
            gain,
          });
        }
        if (isStoppablePlaybackHandle(handle)) {
          scheduledPlaybackHandlesRef.current.add(handle);
          window.setTimeout(() => {
            scheduledPlaybackHandlesRef.current.delete(handle);
          }, Math.max(1000, (handleDuration + LOOKAHEAD_S + 0.25) * 1000));
        }
      } else {
        dbg.warn('playback', `skip late note ${midiName(note.midi)} at ${note.time.toFixed(3)}s`);
      }
      i++;
    }

    nextNoteIdxRef.current = i;
  }

  // ── Metronome click via Web Audio oscillator ───────────────────────────────
  function scheduleClick(ac: AudioContext, time: number, isDownbeat: boolean) {
    const osc  = ac.createOscillator();
    const gain = ac.createGain();
    osc.connect(gain);
    gain.connect(ac.destination);
    osc.frequency.value = isDownbeat ? 1200 : 900;
    gain.gain.setValueAtTime(0, time);
    gain.gain.linearRampToValueAtTime(0.6, time + 0.003);   // 3ms attack
    gain.gain.exponentialRampToValueAtTime(0.001, time + 0.04); // 40ms decay
    osc.start(time);
    osc.stop(time + 0.04);

  }

  // Schedule metronome beats in the look-ahead window
  function runMetronomeTick(ac: AudioContext, parsed: ParsedMidi, scale: number) {
    if (!metronomeEnabledRef.current) return;

    const spBeat     = resolvePlaybackQuarterBeatSeconds(parsed, tempoOverrideRef.current);
    const beatsPerM  = parsed.timeSignatureNumerator;
    const duration   = parsed.durationSeconds / scale;
    const until      = ac.currentTime + LOOKAHEAD_S;

    // Advance nextMetroIdxRef to stay ahead of ac.currentTime
    while (true) {
      const beatTime = originAcTimeRef.current + nextMetroIdxRef.current * spBeat;
      if (beatTime >= ac.currentTime - 0.005) break; // found first future (or almost-now) beat
      nextMetroIdxRef.current++;
      if (nextMetroIdxRef.current * spBeat > duration + 1) return;
    }

    let idx = nextMetroIdxRef.current;
    while (true) {
      const beatTime = originAcTimeRef.current + idx * spBeat;
      if (beatTime > until) break;
      if (beatTime > originAcTimeRef.current + duration) break;

      const isDownbeat = idx % beatsPerM === 0;
      scheduleClick(ac, beatTime, isDownbeat);
      idx++;
    }
    nextMetroIdxRef.current = idx;
  }

  // ── RAF loop — scheduling + UI updates ─────────────────────────────────────
  // Runs at ~60fps (~16ms). Much more reliable than setInterval for Web Audio.
  function startRaf(parsed: ParsedMidi) {
    const generation = playbackGenerationRef.current;
    function tick() {
      if (generation !== playbackGenerationRef.current) return;
      if (!isPlayingRef.current) return;
      const ac = audioCtxRef.current;
      if (!ac) return;

      const scale = resolvePlaybackTempoScale(parsed, tempoOverrideRef.current);
      const nowAc = ac.currentTime;

      // Audio is scheduled against the AudioContext clock, not the paint
      // cadence. A 50 ms scheduler pass with a 1.5 s look-ahead is both more
      // precise under rendering load and substantially cheaper than doing the
      // same work on every animation frame.
      if (nowAc - lastSchedulerAcTimeRef.current >= PLAYBACK_SCHEDULER_INTERVAL_S) {
        lastSchedulerAcTimeRef.current = nowAc;
        runSchedulerTick();
        runMetronomeTick(ac, parsed, scale);
      }

      const scoreTime = (nowAc - originAcTimeRef.current) * scale;
      const clamped = resolveVisiblePlayheadSeconds(scoreTime, parsed, true);
      syncPlaybackPositionState(clamped, parsed);

      if (scoreTime >= parsed.durationSeconds) {
        isPlayingRef.current = false;
        playbackStateRef.current = 'stopped';
        setPlaybackState('stopped');
        setIsPaused(false);
        resumeScoreTimeRef.current = parsed.durationSeconds;
        nextNoteIdxRef.current     = 0;
        scheduledPlaybackHandlesRef.current.clear();
        syncPlaybackPositionState(parsed.durationSeconds, parsed);
        return;
      }
      rafRef.current = requestAnimationFrame(tick);
    }
    rafRef.current = requestAnimationFrame(tick);
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
        noteToMidiNumber(selectedNote),
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
      setPlaybackError(null);
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

        const straightRawNotes: MidiNote[] = midi.tracks
          .flatMap((track, trackIndex) => {
            const sound = resolvePlaybackTrackSound(track, options?.coreDocument, trackIndex, midi.tracks.length);
            const part = resolvePlaybackTrackPart(track, options?.coreDocument, trackIndex, midi.tracks.length);
            return track.notes.map((note) => ({
              time: note.time,
              duration: note.duration,
              midi: note.midi,
              velocity: note.velocity,
              soundfont: sound.soundfont,
              partId: part?.id ?? part?.sourcePartId,
            }));
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
        const avgBpm = tempos[0]?.bpm ?? 120;
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
        const durationSeconds = resolveFullPlaybackDurationSeconds(options?.coreDocument ?? null, preliminaryParsed, audibleDurationSeconds);

        if (requestId !== latestMidiRequestIdRef.current) {
          return false;
        }

        const parsed: ParsedMidi = { rawNotes, notes, tempos, durationSeconds, timeSignatureNumerator, timeSignatureDenominator };
        playbackGeometryCacheRef.current = {
          parsed,
          coreDocument: coreDocumentRef.current,
          ranges: buildPlaybackMeasureBeatRanges(coreDocumentRef.current, parsed),
        };
        setTotalBeats(Math.ceil(secondsToScoreBeats(durationSeconds, parsed)));
        parsedMidiRef.current = parsed;
        playbackStartScoreTimeRef.current = 0;
        const initialSnapshot = buildPlayheadSnapshot(0, 0, parsed, buildPlaybackMeasureBeatRanges(options?.coreDocument ?? null, parsed), false);
        const initialCursorTarget = {
          measureNumber: initialSnapshot.measureNumber,
          timestampNum: initialSnapshot.timestampNum,
          timestampDen: initialSnapshot.timestampDen,
        };
        playbackCursorTargetRef.current = initialCursorTarget;
        playheadRef.current = initialSnapshot;
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

      // Load every track's own soundfont before starting the scheduler.
      await ensurePlaybackPlayers(parsed);
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

      // originAcTimeRef: the ac.currentTime at which score-time 0 would occur
      originAcTimeRef.current = ac.currentTime - fromScore / scale;

      // Find the first note index at or after fromScore
      nextNoteIdxRef.current = parsed.notes.findIndex(n => n.time >= fromScore - 0.01);
      if (nextNoteIdxRef.current === -1) nextNoteIdxRef.current = parsed.notes.length;

      // Reset metronome beat index to the first beat at or after fromScore
      nextMetroIdxRef.current = Math.max(0, Math.floor(secondsToScoreBeats(fromScore, parsed)) - 1);

      cancelAnimationFrame(rafRef.current);
      playbackGenerationRef.current += 1;
      lastSchedulerAcTimeRef.current = Number.NEGATIVE_INFINITY;
      isPlayingRef.current = true;
      playbackStateRef.current = 'playing';
      setPlaybackState('playing');
      setIsPaused(false);
      setPlaybackError(null);
      justOpenedRef.current = false;
      syncPlaybackPositionState(fromScore, parsed);

      // Schedule the opening window synchronously. The first animation frame can
      // be throttled while the packaged app finishes an initial MIDI/sample load,
      // which would otherwise make the first note look late and skip it.
      runSchedulerTick();

      // RAF handles subsequent scheduling and UI — no setInterval needed
      startRaf(parsed);
      return true;
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Playback could not start.';
      setPlaybackError(message);
      dbg.error('playback', 'play() failed:', err);
      return false;
    }
  }, [options?.coreDocument, options?.selectedMeasureNumbers, options?.selectedNote, options?.selectedNoteRef, playbackState, syncPlaybackPositionState]);

  const pause = useCallback(() => {
    if (!isPlayingRef.current) return;
    playRequestIdRef.current += 1;
    const ac = audioCtxRef.current;
    const parsed = parsedMidiRef.current;

    if (ac && parsed) {
      const scale = resolvePlaybackTempoScale(parsed, tempoOverrideRef.current);
      resumeScoreTimeRef.current = (ac.currentTime - originAcTimeRef.current) * scale;
    }

    stopScheduledPlayback();
    isPlayingRef.current = false;
    cancelAnimationFrame(rafRef.current);
    playbackStateRef.current = 'paused';
    setPlaybackState('paused');
    setIsPaused(true);
    if (parsed) {
      syncPlaybackPositionState(resumeScoreTimeRef.current, parsed);
    }
  }, [syncPlaybackPositionState]);

  const stop = useCallback(() => {
    playRequestIdRef.current += 1;
    stopScheduledPlayback();
    isPlayingRef.current = false;
    cancelAnimationFrame(rafRef.current);
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
      setPlaybackPosition({
        currentMeasure: 1,
        currentBeat: 0,
        playbackCursorTarget: null,
        playhead: null,
        currentTimeMs: 0,
      });
    }
  }, [syncPlaybackPositionState]);

  const seek = useCallback(async (beatPosition: number) => {
    const parsed = parsedMidiRef.current;
    if (!parsed) return;
    resumeScoreTimeRef.current = beatsToSeconds(beatPosition, parsed);
    justOpenedRef.current = false;
    syncPlaybackPositionState(resumeScoreTimeRef.current, parsed);
    if (isPlayingRef.current) {
      stopScheduledPlayback({ resetAudioContext: true });
      cancelAnimationFrame(rafRef.current);
      isPlayingRef.current = false;
      await play(resumeScoreTimeRef.current);
    }
  }, [play, syncPlaybackPositionState]);

  const seekToCursorTarget = useCallback(async (target: PlaybackCursorTarget) => {
    const parsed = parsedMidiRef.current;
    if (!parsed) return;
    const measureBeatRanges = buildPlaybackMeasureBeatRanges(options?.coreDocument ?? null, parsed);
    resumeScoreTimeRef.current = clampScoreSeconds(cursorTargetToScoreSeconds(target, parsed, measureBeatRanges), parsed);
    playbackStartScoreTimeRef.current = resumeScoreTimeRef.current;
    justOpenedRef.current = false;
    playbackStateRef.current = 'stopped';
    setPlaybackState('stopped');
    setIsPaused(false);
    syncPlaybackPositionState(resumeScoreTimeRef.current, parsed);
  }, [options?.coreDocument, syncPlaybackPositionState]);

  const setTempo = useCallback((bpm: number) => {
    if (!Number.isFinite(bpm) || bpm <= 0) return;

    const parsed = parsedMidiRef.current;
    const ac = audioCtxRef.current;
    if (parsed && ac && isPlayingRef.current) {
      const tempoChange = resolvePlaybackTempoChangeOrigin({
        parsed,
        currentAcSeconds: ac.currentTime,
        originAcSeconds: originAcTimeRef.current,
        currentTempoOverride: tempoOverrideRef.current,
        nextTempoOverride: bpm,
      });
      const currentScoreSeconds = tempoChange.currentScoreSeconds;

      originAcTimeRef.current = tempoChange.originAcSeconds;
      resumeScoreTimeRef.current = currentScoreSeconds;
      nextNoteIdxRef.current = parsed.notes.findIndex((note) => note.time >= currentScoreSeconds - 0.01);
      if (nextNoteIdxRef.current === -1) nextNoteIdxRef.current = parsed.notes.length;
      nextMetroIdxRef.current = Math.max(0, Math.floor(secondsToScoreBeats(currentScoreSeconds, parsed)) - 1);
      stopScheduledPlaybackHandles();
      syncPlaybackPositionState(currentScoreSeconds, parsed);
    }

    tempoOverrideRef.current = bpm;
    setTempoOverride(bpm);
  }, [syncPlaybackPositionState]);

  const startFromNote = useCallback(async (note: SelectedNote | null) => {
    const parsed = parsedMidiRef.current;
    if (!parsed || !note) return;

    const measureBeatRanges = buildPlaybackMeasureBeatRanges(options?.coreDocument ?? null, parsed);
    resumeScoreTimeRef.current = Math.max(0, Math.min(noteToScoreSeconds(note, parsed, measureBeatRanges), parsed.durationSeconds));
    playbackStartScoreTimeRef.current = resumeScoreTimeRef.current;
    justOpenedRef.current = false;
    syncPlaybackPositionState(resumeScoreTimeRef.current, parsed);
    dbg.playback(`startFromNote m.${note.measureNumber} ts=${note.timestampNum}/${note.timestampDen} score=${resumeScoreTimeRef.current.toFixed(2)}s`);
    if (dbg.enabled()) {
      dbg.midi(formatDebugJson('start compare', buildPlaybackCompare(note, parsed, options?.coreDocument ?? null)));
    }

    stopScheduledPlayback({ resetAudioContext: true });
    cancelAnimationFrame(rafRef.current);
    isPlayingRef.current = false;

    await play(resumeScoreTimeRef.current);
  }, [options?.coreDocument, play, syncPlaybackPositionState]);

  const previewNote = useCallback(async (note: SelectedNote | null) => {
    if (!note || note.isRest) return;

    const previewGeneration = ++previewGenerationRef.current;
    stopHandleSet(previewSampleHandlesRef.current);
    const midi = noteToMidiNumber(note);
    const sampleBank = sampleBankRef.current;
    try {
      const ac = getAc();
      await activatePlaybackAudioContext(ac);
      if (sampleBank) {
        const filename = resolvePlaybackSampleFilename(sampleBank, coreDocumentRef.current, note.corePartId, midi);
        if (!filename) return;
        const buffer = await ensureSampleBuffer(filename);
        if (previewGeneration !== previewGenerationRef.current) return;
        const handle = startAudioSample(ac, buffer, ac.currentTime + 0.01, 0.75);
        previewSampleHandlesRef.current.add(handle);
        window.setTimeout(() => previewSampleHandlesRef.current.delete(handle), (buffer.duration + 0.25) * 1000);
        return;
      }
      const soundfont = resolvePlaybackSoundfontInstrument(options?.coreDocument, note.corePartId);
      const player = await ensurePlayer(soundfont);
      if (previewGeneration !== previewGenerationRef.current) return;
      const when = ac.currentTime + 0.01;
      player.stop();
      startPlaybackNote(player, midi, when, {
        duration: 0.45,
        gain: 0.75,
      });
    } catch (err) {
      dbg.warn('playback', 'preview note failed:', err);
    }
  }, [options?.coreDocument]); // eslint-disable-line react-hooks/exhaustive-deps

  const previewNotes = useCallback(async (notes: SelectedNote[]) => {
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
            noteToMidiNumber(note),
          ),
        })).filter((entry): entry is { note: SelectedNote; filename: string } => Boolean(entry.filename));
        if (sampleNotes.length === 0) return;
        const buffers = await Promise.all(sampleNotes.map(async (entry) => ({
          ...entry,
          buffer: await ensureSampleBuffer(entry.filename),
        })));
        if (previewGeneration !== previewGenerationRef.current) return;
        const when = ac.currentTime + 0.01;
        const gain = Math.max(0.35, Math.min(0.75, 0.75 / Math.sqrt(sampleNotes.length)));
        buffers.forEach(({ buffer }) => {
          const handle = startAudioSample(ac, buffer, when, gain);
          previewSampleHandlesRef.current.add(handle);
          window.setTimeout(() => previewSampleHandlesRef.current.delete(handle), (buffer.duration + 0.25) * 1000);
        });
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
          startPlaybackNote(player, noteToMidiNumber(note), when, {
            duration: 0.45,
            gain: Math.max(0.35, Math.min(0.75, 0.75 / Math.sqrt(playableNotes.length))),
          });
        });
      });
    } catch (err) {
      dbg.warn('playback', 'preview notes failed:', err);
    }
  }, [options?.coreDocument]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => () => {
    cancelAnimationFrame(rafRef.current);
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
    setTempo,
  };
}
