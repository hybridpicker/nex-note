// The playback signal chain, created once per AudioContext. See docs/playback-sync.md, "Sound".
//
//   part input (mixer volume/mute) ─► StereoPanner ─► master input (×5) ─► level ─► clip in (¼) ─► soft clipper ─► destination
//              └─► reverb send (0.18, shared) ─► Convolver ─► reverb return ─► master input
//   metronome, audition ─► dry input (×5) ─► clip in
//
// Every node here is latency free (gain, panner, wave shaper); the convolver only carries the wet
// signal. The level is automated ahead of time by the scheduler (lib/playback-dynamics.ts).

import {
  LevelPlanner,
  MASTER_GAIN,
  SOFT_CLIP,
  buildSoftClipCurve,
} from '@/lib/playback-dynamics';
import { REVERB_SEND_LEVEL, generateReverbImpulse } from '@/lib/reverb-ir';
import type { MidiInstrumentId } from '@/lib/midi-instruments';

export const MIXER_RAMP_SECONDS = 0.02;

export interface PartBus {
  partId: string;
  input: GainNode;
  panner: StereoPannerNode | null;
  pan: number;
}

export interface PlaybackBus {
  context: BaseAudioContext;
  /** Music: soundfont players, template samples, drums, the oscillator fallback. */
  input: GainNode;
  /** Metronome and audition: after the level control, so loud passages do not duck them. */
  dryInput: GainNode;
  level: GainNode;
  planner: LevelPlanner;
  reverbSend: GainNode | null;
  parts: Map<string, PartBus>;
}

type BusAudioContext = Pick<BaseAudioContext, 'createGain' | 'destination' | 'currentTime'>
  & Partial<Pick<BaseAudioContext, 'createWaveShaper' | 'createStereoPanner' | 'createConvolver' | 'createBuffer' | 'sampleRate'>>;

const buses = new WeakMap<object, PlaybackBus | null>();

function safeConnect(from: AudioNode, to: AudioNode) {
  from.connect(to);
}

function createReverb(ac: BusAudioContext, returnTo: AudioNode): GainNode | null {
  if (typeof ac.createConvolver !== 'function' || typeof ac.createBuffer !== 'function') return null;
  try {
    const sampleRate = ac.sampleRate || 44100;
    const [left, right] = generateReverbImpulse({ sampleRate });
    const impulse = ac.createBuffer(2, left.length, sampleRate);
    impulse.getChannelData(0).set(left);
    impulse.getChannelData(1).set(right);
    const convolver = ac.createConvolver();
    convolver.normalize = false;
    convolver.buffer = impulse;
    const send = ac.createGain();
    send.gain.value = REVERB_SEND_LEVEL;
    const reverbReturn = ac.createGain();
    reverbReturn.gain.value = 1;
    safeConnect(send, convolver);
    safeConnect(convolver, reverbReturn);
    safeConnect(reverbReturn, returnTo);
    return send;
  } catch {
    return null;
  }
}

/**
 * The bus of an AudioContext, created on first use. Null when the context cannot build it (test
 * fakes, very old engines): callers then connect to `ac.destination` as before.
 */
export function getPlaybackBus(ac: BusAudioContext): PlaybackBus | null {
  if (buses.has(ac)) return buses.get(ac) ?? null;
  let bus: PlaybackBus | null = null;
  try {
    if (typeof ac.createGain === 'function' && typeof ac.createWaveShaper === 'function') {
      const input = ac.createGain();
      input.gain.value = MASTER_GAIN;
      const dryInput = ac.createGain();
      dryInput.gain.value = MASTER_GAIN;
      const level = ac.createGain();
      level.gain.value = 1;
      const clipIn = ac.createGain();
      clipIn.gain.value = 1 / SOFT_CLIP.inputRange;
      const clipper = ac.createWaveShaper();
      clipper.curve = buildSoftClipCurve();
      clipper.oversample = 'none';
      safeConnect(input, level);
      safeConnect(level, clipIn);
      safeConnect(dryInput, clipIn);
      safeConnect(clipIn, clipper);
      safeConnect(clipper, ac.destination);
      const planner = new LevelPlanner();
      planner.reset(ac.currentTime, 1);
      bus = {
        context: ac as BaseAudioContext,
        input,
        dryInput,
        level,
        planner,
        reverbSend: createReverb(ac, input),
        parts: new Map(),
      };
    }
  } catch {
    bus = null;
  }
  buses.set(ac, bus);
  return bus;
}

/** Moves a gain to `target` over `seconds` from `now`, without a step (mute, volume). */
export function rampGain(param: AudioParam, target: number, now: number, seconds = MIXER_RAMP_SECONDS) {
  const from = Number.isFinite(param.value) ? param.value : target;
  if (typeof param.cancelScheduledValues === 'function') param.cancelScheduledValues(now);
  param.setValueAtTime(from, now);
  param.linearRampToValueAtTime(target, now + seconds);
}

/**
 * The bus of one part (created on first use): its gain is the mixer volume (0 when muted), then
 * its pan. Without StereoPannerNode the part stays centred; without ConvolverNode it stays dry.
 */
export function getPartBus(bus: PlaybackBus, partId: string, pan: number, gain: number): PartBus {
  const existing = bus.parts.get(partId);
  const ac = bus.context;
  if (existing) {
    if (existing.panner && Math.abs(existing.pan - pan) > 1e-6) {
      existing.panner.pan.setValueAtTime(pan, ac.currentTime);
      existing.pan = pan;
    }
    return existing;
  }
  const input = ac.createGain();
  input.gain.value = gain;
  let panner: StereoPannerNode | null = null;
  if (typeof ac.createStereoPanner === 'function') {
    try {
      panner = ac.createStereoPanner();
      panner.pan.value = pan;
    } catch {
      panner = null;
    }
  }
  if (panner) {
    safeConnect(input, panner);
    safeConnect(panner, bus.input);
  } else {
    safeConnect(input, bus.input);
  }
  if (bus.reverbSend) safeConnect(input, bus.reverbSend);
  const partBus: PartBus = { partId, input, panner, pan: panner ? pan : 0 };
  bus.parts.set(partId, partBus);
  return partBus;
}

/** Applies mixer gains to every part bus with a 20 ms ramp, so ringing notes follow mute at once. */
export function applyMixerToPartBuses(bus: PlaybackBus, gainForPart: (partId: string) => number) {
  const now = bus.context.currentTime;
  bus.parts.forEach((part) => {
    const target = gainForPart(part.partId);
    if (Math.abs(part.input.gain.value - target) < 1e-6) return;
    rampGain(part.input.gain, target, now);
  });
}

// ── Seating ─────────────────────────────────────────────────────────────────

/**
 * Orchestral seating seen from the audience (-1 left, +1 right), for every Nex Note instrument
 * id: strings left to right, woodwinds in the centre, horns left, trumpets and low brass right,
 * mallets and timpani at the back right. Keyboards, guitars, basses and drums stay in the centre.
 */
export const AUTO_PAN_TABLE = {
  piano: 0, 'electric-piano': 0, harpsichord: 0, organ: 0, accordion: 0,
  harp: -0.4, celesta: -0.3, glockenspiel: 0.25, vibraphone: 0.2, marimba: 0.3, xylophone: 0.25, timpani: 0.15,
  violin: -0.35, viola: 0.1, cello: 0.3, 'double-bass': 0.4, strings: -0.1,
  flute: -0.1, piccolo: -0.15, recorder: -0.1, oboe: 0.1, 'english-horn': 0.15,
  'clarinet-bb': -0.15, bassoon: 0.15, contrabassoon: 0.2,
  'sax-soprano': -0.15, 'sax-alto-eb': -0.05, 'sax-tenor': 0.05, 'sax-baritone': 0.15,
  'trumpet-bb': 0.2, cornet: 0.15, flugelhorn: 0.25, 'horn-f': -0.25, trombone: 0.3, euphonium: 0.3, tuba: 0.35,
  soprano: -0.2, alto: -0.07, tenor: 0.07, bass: 0.2,
  guitar: 0, 'guitar-tab': 0, 'acoustic-guitar': 0, 'acoustic-guitar-tab': 0, 'classical-guitar': 0, 'classical-guitar-tab': 0,
  'electric-guitar': 0, 'electric-guitar-tab': 0, 'distortion-guitar': 0,
  'electric-bass': 0, 'electric-bass-tab': 0, 'acoustic-bass': 0, 'fretless-bass': 0,
  'five-string-electric-bass': 0, 'five-string-electric-bass-tab': 0,
  ukulele: 0, 'ukulele-tab': 0, mandolin: 0, banjo: 0, 'drum-set': 0,
} as const satisfies Readonly<Record<MidiInstrumentId, number>>;
const DUPLICATE_SPREAD = 0.15;
const MAX_AUTO_PAN = 0.8;

/**
 * Pan of every part. A single part stays centred; several parts are seated by instrument, and
 * parts of the same instrument (Violin I and II) spread around its seat.
 */
export function resolveAutoPanTable(parts: ReadonlyArray<{ id: string; instrumentId: string | null | undefined }>): Map<string, number> {
  const pans = new Map<string, number>();
  if (parts.length <= 1) {
    parts.forEach((part) => pans.set(part.id, 0));
    return pans;
  }
  const groups = new Map<string, string[]>();
  parts.forEach((part) => {
    const key = part.instrumentId ?? '';
    groups.set(key, [...(groups.get(key) ?? []), part.id]);
  });
  groups.forEach((ids, instrumentId) => {
    const seat = (AUTO_PAN_TABLE as Readonly<Record<string, number>>)[instrumentId] ?? 0;
    ids.forEach((id, index) => {
      const offset = (index - ((ids.length - 1) / 2)) * DUPLICATE_SPREAD;
      pans.set(id, Math.max(-MAX_AUTO_PAN, Math.min(MAX_AUTO_PAN, seat + offset)));
    });
  });
  return pans;
}
