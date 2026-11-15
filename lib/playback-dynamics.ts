// Loudness and dynamics of playback, as pure functions (no Web Audio), so they can be tested and
// tuned by computation. See docs/playback-sync.md, section "Sound".
//
// Why there is no DynamicsCompressorNode: Chromium's and WebKit's compressor delays its output by
// a fixed 6 ms look-ahead that no latency API reports, so every compressor in the chain would make
// the sound later than the playhead. Playback instead uses a feed-forward compressor driven by the
// scheduler: every note is known before it sounds, so its contribution to the mix is estimated
// when it is scheduled and the master level is lowered before the note starts. A static soft
// clipper (WaveShaperNode, no latency) catches what the estimate misses.

/**
 * Gain of a note of MIDI velocity `velocity` (0..1). Square law: pp (33) about -23 dB, mf (80)
 * about -8 dB, ff (112) about -2 dB relative to full velocity.
 */
export function velocityToGain(velocity: number): number {
  if (!Number.isFinite(velocity) || velocity <= 0) return 0;
  const clamped = Math.min(1, velocity);
  return clamped * clamped;
}

/** Master gain before the compressor (+14 dB): the soundfont samples peak at -13 to -21 dBFS. */
export const MASTER_GAIN = 5;

/** Static curve and time constants of the feed-forward compressor (Web Audio semantics). */
export const PLAYBACK_COMPRESSOR = {
  thresholdDb: -14,
  kneeDb: 10,
  ratio: 3,
  attackSeconds: 0.003,
  releaseSeconds: 0.25,
} as const;

/** The estimated mix peak never exceeds this level after the compressor. */
export const PLAYBACK_LIMITER = {
  thresholdDb: -2,
  attackSeconds: 0.001,
  releaseSeconds: 0.05,
} as const;

/** Safety soft clipper after the level control: linear up to -3 dBFS, never above -0.3 dBFS. */
export const SOFT_CLIP = {
  linearUntil: 10 ** (-3 / 20),
  ceiling: 10 ** (-0.3 / 20),
  /** The clipper's curve covers input amplitudes up to this value (+12 dBFS). */
  inputRange: 4,
  points: 8193,
} as const;

/** Grid of the level automation, and how early a note's level reduction is in place. */
export const LEVEL_STEP_SECONDS = 0.005;
export const LEVEL_ATTACK_LEAD_SECONDS = 0.005;
/** Decaying instruments (piano, guitar, harp) are estimated with this envelope time constant. */
export const DECAYING_VOICE_TIME_CONSTANT_S = 1.0;

export function gainToDb(gain: number) {
  return 20 * Math.log10(Math.max(gain, 1e-9));
}

export function dbToGain(db: number) {
  return 10 ** (db / 20);
}

/** Output level of the compressor's static curve (soft knee from threshold to threshold + knee). */
export function compressorOutputDb(inputDb: number, params: {
  thresholdDb: number;
  kneeDb: number;
  ratio: number;
} = PLAYBACK_COMPRESSOR): number {
  const { thresholdDb: t, kneeDb: k, ratio: r } = params;
  if (inputDb <= t) return inputDb;
  if (k > 0 && inputDb < t + k) {
    return inputDb + ((1 / r) - 1) * ((inputDb - t) ** 2) / (2 * k);
  }
  const kneeCentre = t + (k / 2);
  return kneeCentre + ((inputDb - kneeCentre) / r);
}

/** Level gain (linear) that compresses and limits a mix whose estimated peak is `estimatePeak`. */
export function levelGainForEstimate(estimatePeak: number): number {
  if (!(estimatePeak > 0)) return 1;
  const inputDb = gainToDb(estimatePeak);
  const outputDb = Math.min(compressorOutputDb(inputDb), PLAYBACK_LIMITER.thresholdDb);
  return Math.min(1, dbToGain(outputDb - inputDb));
}

export interface LevelVoice {
  /** AudioContext seconds at which the note starts and stops sounding (release included). */
  start: number;
  end: number;
  /** Estimated peak amplitude of the note at the output of the master gain. */
  amplitude: number;
  /** Piano-like notes fade after their attack. */
  decaying?: boolean;
}

function voiceAmplitudeAt(voice: LevelVoice, time: number) {
  if (time < voice.start - LEVEL_ATTACK_LEAD_SECONDS || time > voice.end) return 0;
  if (!voice.decaying || time <= voice.start) return voice.amplitude;
  return voice.amplitude * Math.exp(-(time - voice.start) / DECAYING_VOICE_TIME_CONSTANT_S);
}

/**
 * Estimated peak of the mix at `time`: the power sum of the sounding voices. Rendered offline with
 * the FluidR3 samples, the densest audited case (4 parts x 6-note chord) peaked within 0.3 dB of
 * this estimate; for one note it is the sample's own peak.
 */
export function estimateMixPeak(voices: Iterable<LevelVoice>, time: number) {
  let power = 0;
  for (const voice of voices) {
    const amplitude = voiceAmplitudeAt(voice, time);
    power += amplitude * amplitude;
  }
  return Math.sqrt(power);
}

export interface LevelPoint {
  time: number;
  gain: number;
}

/**
 * Plans the master level automation from the notes the scheduler has handed to the audio graph.
 * `plan(untilTime, nowTime)` returns new grid points after the last planned one: the level drops
 * to the required value by each note's start (attack) and rises back with the release time
 * constant, so there is never a step in the gain.
 */
export class LevelPlanner {
  private voices: LevelVoice[] = [];
  private lastTime = Number.NEGATIVE_INFINITY;
  private lastGain = 1;

  addVoice(voice: LevelVoice) {
    if (!(voice.amplitude > 0) || !(voice.end > voice.start)) return;
    this.voices.push(voice);
  }

  get voiceCount() {
    return this.voices.length;
  }

  get plannedUntil() {
    return this.lastTime;
  }

  get gain() {
    return this.lastGain;
  }

  /** Forgets every voice (stop, seek, tempo change) and continues from `gain` at `time`. */
  reset(time: number, gain = 1) {
    this.voices = [];
    this.lastTime = time;
    this.lastGain = Math.min(1, Math.max(0, gain));
    this.emittedGain = this.lastGain;
  }

  plan(untilTime: number, nowTime: number): LevelPoint[] {
    this.voices = this.voices.filter((voice) => voice.end >= nowTime);
    const points: LevelPoint[] = [];
    let time = Number.isFinite(this.lastTime)
      ? Math.max(this.lastTime + LEVEL_STEP_SECONDS, nowTime)
      : nowTime;
    const releaseFactor = 1 - Math.exp(-LEVEL_STEP_SECONDS / PLAYBACK_COMPRESSOR.releaseSeconds);
    while (time <= untilTime + 1e-9) {
      const required = levelGainForEstimate(estimateMixPeak(this.voices, time + LEVEL_ATTACK_LEAD_SECONDS));
      const gain = required < this.lastGain
        ? required
        : this.lastGain + ((required - this.lastGain) * releaseFactor);
      points.push({ time, gain });
      this.lastGain = gain;
      this.lastTime = time;
      time += LEVEL_STEP_SECONDS;
    }
    return points;
  }

  /**
   * `plan` reduced to the points an AudioParam needs (linear ramps between them): flat stretches
   * are skipped, and the last point of a flat stretch is kept so the next ramp starts on time.
   */
  planAutomation(untilTime: number, nowTime: number): LevelPoint[] {
    const startGain = this.lastGain;
    const points = this.plan(untilTime, nowTime);
    const automation: LevelPoint[] = [];
    let emittedGain = this.emittedGain ?? startGain;
    let pending: LevelPoint | null = null;
    points.forEach((point) => {
      if (Math.abs(point.gain - emittedGain) <= AUTOMATION_TOLERANCE) {
        pending = point;
        return;
      }
      if (pending) automation.push(pending);
      pending = null;
      automation.push(point);
      emittedGain = point.gain;
    });
    // Close a stretch at its end, so the param is exact when planning resumes.
    if (pending && automation.length > 0) automation.push(pending);
    this.emittedGain = emittedGain;
    return automation;
  }

  private emittedGain: number | null = null;
}

const AUTOMATION_TOLERANCE = 0.002;

/**
 * WaveShaper curve of the safety clipper. The curve spans input amplitudes
 * [-inputRange, inputRange], so the shaper is fed through a gain of 1 / inputRange: linear below
 * `linearUntil`, then a tanh knee that approaches `ceiling`.
 */
export function buildSoftClipCurve(options: Partial<typeof SOFT_CLIP> = {}): Float32Array<ArrayBuffer> {
  const { linearUntil, ceiling, inputRange, points } = { ...SOFT_CLIP, ...options };
  const curve = new Float32Array(points);
  const headroom = ceiling - linearUntil;
  for (let index = 0; index < points; index += 1) {
    const input = (((index / (points - 1)) * 2) - 1) * inputRange;
    curve[index] = softClipSample(input, linearUntil, headroom);
  }
  return curve;
}

export function softClipSample(input: number, linearUntil = SOFT_CLIP.linearUntil, headroom = SOFT_CLIP.ceiling - SOFT_CLIP.linearUntil) {
  const magnitude = Math.abs(input);
  if (magnitude <= linearUntil) return input;
  return Math.sign(input) * (linearUntil + (headroom * Math.tanh((magnitude - linearUntil) / headroom)));
}

/** Peak absolute sample value of an audio buffer (all channels, the first `maxFrames` frames). */
export function bufferPeak(
  buffer: { numberOfChannels: number; getChannelData(channel: number): Float32Array },
  maxFrames = Number.POSITIVE_INFINITY,
) {
  let peak = 0;
  for (let channel = 0; channel < buffer.numberOfChannels; channel += 1) {
    const data = buffer.getChannelData(channel);
    const frames = Math.min(data.length, maxFrames);
    for (let index = 0; index < frames; index += 1) {
      const value = Math.abs(data[index]!);
      if (value > peak) peak = value;
    }
  }
  return peak;
}
