// Post-processing of the decoded soundfont samples so long notes do not stop with a hard cut.
// Every FluidR3 sample is about 3.1 s long and has no loop points. Sustaining instruments get a
// baked equal-power crossfade loop; every sample gets a short cosine fade at its end.

import type { MidiInstrumentId } from '@/lib/midi-instruments';

export const SAMPLE_LOOP = {
  loopStart: 1.0,
  loopEnd: 3.0,
  crossfade: 0.3,
} as const;

/** Notes longer than this (seconds, at the playing tempo) loop instead of running out. */
export const LOOP_MIN_NOTE_SECONDS = 2.8;
export const SAMPLE_END_FADE_SECONDS = 0.05;

// Soundfont-player instrument names of instruments that hold their level while the note lasts.
const SUSTAINING_PATTERN = /(violin|viola|cello|contrabass|string|tremolo|flute|piccolo|recorder|pan_flute|whistle|ocarina|oboe|english_horn|clarinet|bassoon|sax|trumpet|french_horn|trombone|tuba|brass|organ|accordion|harmonica|bandoneon|choir|voice|synth_voice|pad|lead|bagpipe|shanai|fiddle)/;
// Plucked, struck and percussive sounds (they decay on their own) even when a name matches above.
const DECAYING_PATTERN = /(pizzicato|piano|guitar|bass_(finger|pick)|fretless|slap|harp|harpsichord|clavinet|celesta|glockenspiel|music_box|vibraphone|marimba|xylophone|bells|dulcimer|banjo|shamisen|koto|kalimba|drum|steel_drums|timpani|woodblock|taiko|cymbal|agogo|tinkle)/;

export function isSustainingSoundfont(name: string | null | undefined) {
  const normalized = (name ?? '').toLowerCase();
  if (!normalized || DECAYING_PATTERN.test(normalized)) return false;
  return SUSTAINING_PATTERN.test(normalized);
}

/**
 * How every Nex Note instrument sounds: held at its level while the note lasts, or decaying on its
 * own. Loops are baked per soundfont set, so an instrument's class must match the class of the set
 * it plays (test/audio-instrument-coverage.test.ts checks both, so no instrument is forgotten).
 */
export const INSTRUMENT_ENVELOPES = {
  piano: 'decaying', 'electric-piano': 'decaying', harpsichord: 'decaying', organ: 'sustaining', accordion: 'sustaining',
  harp: 'decaying', celesta: 'decaying', glockenspiel: 'decaying', vibraphone: 'decaying', marimba: 'decaying', xylophone: 'decaying', timpani: 'decaying',
  violin: 'sustaining', viola: 'sustaining', cello: 'sustaining', 'double-bass': 'sustaining', strings: 'sustaining',
  flute: 'sustaining', piccolo: 'sustaining', recorder: 'sustaining', oboe: 'sustaining', 'english-horn': 'sustaining',
  'clarinet-bb': 'sustaining', bassoon: 'sustaining', contrabassoon: 'sustaining',
  'sax-soprano': 'sustaining', 'sax-alto-eb': 'sustaining', 'sax-tenor': 'sustaining', 'sax-baritone': 'sustaining',
  'trumpet-bb': 'sustaining', cornet: 'sustaining', flugelhorn: 'sustaining', 'horn-f': 'sustaining', trombone: 'sustaining', euphonium: 'sustaining', tuba: 'sustaining',
  soprano: 'sustaining', alto: 'sustaining', tenor: 'sustaining', bass: 'sustaining',
  guitar: 'decaying', 'guitar-tab': 'decaying', 'acoustic-guitar': 'decaying', 'acoustic-guitar-tab': 'decaying',
  'classical-guitar': 'decaying', 'classical-guitar-tab': 'decaying', 'electric-guitar': 'decaying', 'electric-guitar-tab': 'decaying',
  'distortion-guitar': 'decaying',
  'electric-bass': 'decaying', 'electric-bass-tab': 'decaying', 'acoustic-bass': 'decaying', 'fretless-bass': 'decaying',
  'five-string-electric-bass': 'decaying', 'five-string-electric-bass-tab': 'decaying',
  ukulele: 'decaying', 'ukulele-tab': 'decaying', mandolin: 'decaying', banjo: 'decaying', 'drum-set': 'decaying',
} as const satisfies Readonly<Record<MidiInstrumentId, 'sustaining' | 'decaying'>>;

export function isSustainingInstrument(id: string | null | undefined) {
  return (INSTRUMENT_ENVELOPES as Readonly<Record<string, string>>)[id ?? ''] === 'sustaining';
}

export function shouldLoopNote(durationSeconds: number) {
  return Number.isFinite(durationSeconds) && durationSeconds > LOOP_MIN_NOTE_SECONDS;
}

export interface LoopPoints {
  loopStart: number;
  loopEnd: number;
  crossfade: number;
}

/** Whether a sample of this length can carry the loop (the loop needs material before loopStart). */
export function canBakeLoop(lengthFrames: number, sampleRate: number, loop: LoopPoints = SAMPLE_LOOP) {
  const start = Math.round(loop.loopStart * sampleRate);
  const end = Math.round(loop.loopEnd * sampleRate);
  const fade = Math.round(loop.crossfade * sampleRate);
  return fade > 0 && start - fade >= 0 && start < end - fade && end <= lengthFrames;
}

const fadeTables = new Map<number, { fadeOut: Float32Array; fadeIn: Float32Array }>();
/** Equal-power gains over `frames` frames (cached: every sample of a soundfont shares them). */
function equalPowerTables(frames: number) {
  const cached = fadeTables.get(frames);
  if (cached) return cached;
  const fadeOut = new Float32Array(frames);
  const fadeIn = new Float32Array(frames);
  for (let index = 0; index < frames; index += 1) {
    const angle = (Math.PI / 2) * ((index + 1) / frames);
    fadeOut[index] = Math.cos(angle);
    fadeIn[index] = Math.sin(angle);
  }
  const tables = { fadeOut, fadeIn };
  fadeTables.set(frames, tables);
  return tables;
}

/** loopStart may move this far from SAMPLE_LOOP.loopStart to meet the waveform in phase. */
export const LOOP_START_SEARCH_SECONDS = 0.012;
const ALIGN_WINDOW_SECONDS = 0.02;

/** Normalised correlation of `length` frames at `a` and at `b`, summed over the channels. */
function correlation(channels: readonly Float32Array[], a: number, b: number, length: number, step = 1) {
  let ab = 0; let aa = 0; let bb = 0;
  for (const data of channels) {
    for (let index = 0; index < length; index += step) {
      const x = data[a + index]!;
      const y = data[b + index]!;
      ab += x * y; aa += x * x; bb += y * y;
    }
  }
  return aa > 0 && bb > 0 ? ab / Math.sqrt(aa * bb) : 0;
}

/**
 * loopStart (seconds) near the nominal one where the waveform before it best matches the waveform
 * before loopEnd, so a tonal sample is crossfaded in phase instead of partly cancelling.
 */
export function findAlignedLoopStart(channels: readonly Float32Array[], sampleRate: number, loop: LoopPoints = SAMPLE_LOOP) {
  const length = Math.min(...channels.map((data) => data.length));
  const nominal = Math.round(loop.loopStart * sampleRate);
  const end = Math.round(loop.loopEnd * sampleRate);
  const fade = Math.round(loop.crossfade * sampleRate);
  const window = Math.max(1, Math.round(ALIGN_WINDOW_SECONDS * sampleRate));
  const reach = Math.round(LOOP_START_SEARCH_SECONDS * sampleRate);
  const valid = (start: number) => start - Math.max(fade, window) >= 0 && start < end - fade && end <= length;
  if (!valid(nominal)) return loop.loopStart;
  let best = nominal;
  let bestScore = Number.NEGATIVE_INFINITY;
  const consider = (start: number, step: number, searched: readonly Float32Array[]) => {
    if (!valid(start)) return;
    const score = correlation(searched, start - window, end - window, window, step);
    if (score > bestScore) { bestScore = score; best = start; }
  };
  // Coarse search on the first channel every fourth frame (cheap enough to run on the main thread
  // for a whole instrument), then refine on all channels around the best match.
  const stride = Math.max(1, Math.round(sampleRate / 11025));
  const first = channels.slice(0, 1);
  for (let shift = -reach; shift <= reach; shift += stride) consider(nominal + shift, stride, first);
  const coarse = best;
  bestScore = Number.NEGATIVE_INFINITY;
  for (let shift = -stride; shift <= stride; shift += 1) consider(coarse + shift, 1, channels);
  return best / sampleRate;
}

/**
 * Bakes a constant-power crossfade loop into one channel, in place. Playing past loopEnd jumps to
 * loopStart; the frames before loopEnd are blended into the frames before loopStart, so the frame
 * at the seam continues the one after it. The fade is equal-power for uncorrelated material and
 * equal-gain for material in phase (gains normalised by the measured correlation), so the level
 * stays constant through the fade. Frames after loopEnd are replaced with the continuation of the
 * loop, so a note that plays through without looping hears no seam either.
 */
export function bakeCrossfadeLoop(data: Float32Array, sampleRate: number, loop: LoopPoints = SAMPLE_LOOP) {
  if (!canBakeLoop(data.length, sampleRate, loop)) return false;
  const start = Math.round(loop.loopStart * sampleRate);
  const end = Math.round(loop.loopEnd * sampleRate);
  const fade = Math.round(loop.crossfade * sampleRate);
  const r = Math.max(-0.6, Math.min(1, correlation([data], start - fade, end - fade, fade)));
  const { fadeOut, fadeIn } = equalPowerTables(fade);
  // Read regions [start - fade, start + tail) lie before end - fade and are never written.
  for (let index = 0; index < fade; index += 1) {
    const out = fadeOut[index]!;
    const into = fadeIn[index]!;
    const normalise = 1 / Math.sqrt(1 + (2 * r * into * out));
    const target = end - fade + index;
    data[target] = ((data[target]! * out) + (data[start - fade + index]! * into)) * normalise;
  }
  for (let index = end; index < data.length; index += 1) {
    data[index] = data[start + (index - end)]!;
  }
  return true;
}

/** Cosine fade over the last `seconds` of a channel, in place, so a sample never ends with a step. */
export function applyEndFade(data: Float32Array, sampleRate: number, seconds = SAMPLE_END_FADE_SECONDS) {
  const frames = Math.min(data.length, Math.round(seconds * sampleRate));
  if (frames <= 0) return;
  const first = data.length - frames;
  for (let index = 0; index < frames; index += 1) {
    // 1 at the first faded frame, 0 at the last frame.
    const weight = 0.5 * (1 + Math.cos((Math.PI * (index + 1)) / frames));
    data[first + index] *= weight;
  }
}

export interface ProcessableBuffer {
  numberOfChannels: number;
  sampleRate: number;
  length: number;
  getChannelData(channel: number): Float32Array;
}

export interface SampleLoopPoints {
  loopStart: number;
  loopEnd: number;
}

/**
 * Prepares one decoded sample: a loop for sustaining instruments, an end fade for all. Returns
 * the loop points when a loop was baked (only then may a note ask the source to loop).
 */
export function prepareSampleBuffer(buffer: ProcessableBuffer, sustaining: boolean): SampleLoopPoints | null {
  const channels = Array.from({ length: buffer.numberOfChannels }, (_, channel) => buffer.getChannelData(channel));
  let loop: SampleLoopPoints | null = null;
  if (sustaining && canBakeLoop(buffer.length, buffer.sampleRate)) {
    loop = { loopStart: findAlignedLoopStart(channels, buffer.sampleRate), loopEnd: SAMPLE_LOOP.loopEnd };
  }
  channels.forEach((data) => {
    if (loop) bakeCrossfadeLoop(data, buffer.sampleRate, { ...SAMPLE_LOOP, ...loop });
    applyEndFade(data, buffer.sampleRate);
  });
  return loop;
}

function isProcessableBuffer(value: unknown): value is ProcessableBuffer {
  return value != null
    && typeof value === 'object'
    && typeof (value as ProcessableBuffer).getChannelData === 'function'
    && Number.isFinite((value as ProcessableBuffer).sampleRate)
    && Number.isFinite((value as ProcessableBuffer).length);
}

/**
 * Prepares every sample of a loaded soundfont player (`player.buffers`, keyed by MIDI number), in
 * place. Returns the loop points of the MIDI numbers whose sample carries a loop.
 */
export function prepareSoundfontBuffers(buffers: unknown, soundfont: string): Map<number, SampleLoopPoints> {
  const looped = new Map<number, SampleLoopPoints>();
  if (!buffers || typeof buffers !== 'object') return looped;
  const sustaining = isSustainingSoundfont(soundfont);
  Object.entries(buffers as Record<string, unknown>).forEach(([key, buffer]) => {
    if (!isProcessableBuffer(buffer)) return;
    const loop = prepareSampleBuffer(buffer, sustaining);
    if (loop) looped.set(Number(key), loop);
  });
  return looped;
}
