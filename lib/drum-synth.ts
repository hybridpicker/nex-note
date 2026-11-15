// Synthesized General MIDI drum kit and metronome click (Web Audio nodes only, no samples).
// soundfont-player has no GM drum kit, so percussion tracks (MIDI channel 10) are played here.

export type DrumFilter = { type: BiquadFilterType; frequency: number; Q?: number };

export type DrumLayer =
  | {
    kind: 'tone';
    wave: OscillatorType;
    /** One oscillator per frequency, all through the layer's filters (metallic cymbal sounds). */
    frequencies: number[];
    /** Pitch sweep: every frequency glides by this factor over `sweepSeconds`. */
    sweepRatio?: number;
    sweepSeconds?: number;
    level: number;
    attack?: number;
    /** Time from the peak to -60 dB. */
    decay: number;
    delay?: number;
    filters?: DrumFilter[];
  }
  | {
    kind: 'noise';
    level: number;
    attack?: number;
    decay: number;
    delay?: number;
    filters: DrumFilter[];
  };

export interface DrumVoice {
  name: string;
  layers: DrumLayer[];
  /** A voice with `chokes` stops the ringing voice of that group (closed hi-hat stops open hi-hat). */
  chokeGroup?: 'hihat';
  chokes?: 'hihat';
}

/** Overall kit level: a kick at full gain peaks near -16 dBFS before the master gain. */
export const DRUM_KIT_GAIN = 0.15;
/** Upper bound of the nodes one drum hit creates (checked by the tests). */
export const MAX_DRUM_NODES_PER_HIT = 16;

// Six square waves at inharmonic ratios, the classic analogue cymbal and hi-hat source.
const METALLIC = [205.3, 304.4, 369.6, 522.7, 540, 800];
const HAT_FILTERS: DrumFilter[] = [{ type: 'bandpass', frequency: 10000, Q: 1 }, { type: 'highpass', frequency: 7000 }];

function kick(level: number): DrumVoice {
  return {
    name: 'kick',
    layers: [
      { kind: 'tone', wave: 'sine', frequencies: [120], sweepRatio: 45 / 120, sweepSeconds: 0.06, level, attack: 0.001, decay: 0.3 },
      { kind: 'noise', level: level * 0.5, attack: 0.0005, decay: 0.002, filters: [{ type: 'highpass', frequency: 3000 }] },
    ],
  };
}

function snare(bright: boolean): DrumVoice {
  return {
    name: 'snare',
    layers: [
      { kind: 'noise', level: 1.3, attack: 0.001, decay: 0.18, filters: [{ type: 'bandpass', frequency: bright ? 2400 : 1800, Q: 0.8 }] },
      { kind: 'tone', wave: 'triangle', frequencies: [185, 330], level: 0.35, attack: 0.001, decay: 0.08 },
    ],
  };
}

function tom(frequency: number): DrumVoice {
  return {
    name: 'tom',
    layers: [
      { kind: 'tone', wave: 'sine', frequencies: [frequency * 1.5], sweepRatio: 1 / 1.5, sweepSeconds: 0.09, level: 0.9, attack: 0.001, decay: 0.38 },
      { kind: 'noise', level: 0.25, attack: 0.001, decay: 0.03, filters: [{ type: 'bandpass', frequency: frequency * 6, Q: 1 }] },
    ],
  };
}

function hat(decay: number, level: number, open: boolean): DrumVoice {
  return {
    name: open ? 'open hi-hat' : 'closed hi-hat',
    layers: [
      { kind: 'tone', wave: 'square', frequencies: METALLIC, level, attack: 0.0005, decay, filters: HAT_FILTERS },
    ],
    ...(open ? { chokeGroup: 'hihat' as const } : { chokes: 'hihat' as const }),
  };
}

function cymbal(name: string, decay: number, level: number, highpass: number): DrumVoice {
  return {
    name,
    layers: [
      { kind: 'tone', wave: 'square', frequencies: METALLIC.map((frequency) => frequency * 1.47), level, attack: 0.001, decay, filters: [{ type: 'highpass', frequency: highpass }] },
      { kind: 'noise', level: level * 0.6, attack: 0.001, decay: decay * 0.8, filters: [{ type: 'highpass', frequency: highpass + 1000 }] },
    ],
  };
}

function ride(bell: boolean): DrumVoice {
  return {
    name: bell ? 'ride bell' : 'ride',
    layers: [
      { kind: 'tone', wave: 'square', frequencies: METALLIC.map((frequency) => frequency * 1.9), level: 0.5, attack: 0.001, decay: 0.9, filters: [{ type: 'highpass', frequency: 5500 }] },
      { kind: 'tone', wave: 'sine', frequencies: [740, 1110], level: bell ? 0.45 : 0.12, attack: 0.001, decay: bell ? 0.8 : 0.4 },
    ],
  };
}

function pitched(name: string, wave: OscillatorType, frequencies: number[], decay: number, level = 0.6, sweepRatio?: number): DrumVoice {
  return {
    name,
    layers: [{ kind: 'tone', wave, frequencies, level, attack: 0.001, decay, ...(sweepRatio ? { sweepRatio, sweepSeconds: decay * 0.6 } : {}) }],
  };
}

function shaker(name: string, decay: number, frequency: number, level = 0.9): DrumVoice {
  return {
    name,
    layers: [{ kind: 'noise', level, attack: 0.004, decay, filters: [{ type: 'highpass', frequency }] }],
  };
}

function clap(): DrumVoice {
  const filters: DrumFilter[] = [{ type: 'bandpass', frequency: 1200, Q: 1.2 }];
  return {
    name: 'clap',
    layers: [
      { kind: 'noise', level: 1.2, attack: 0.0005, decay: 0.01, delay: 0, filters },
      { kind: 'noise', level: 1.2, attack: 0.0005, decay: 0.01, delay: 0.011, filters },
      { kind: 'noise', level: 1.2, attack: 0.0005, decay: 0.01, delay: 0.022, filters },
      { kind: 'noise', level: 1.1, attack: 0.001, decay: 0.13, delay: 0.031, filters },
    ],
  };
}

/** Played for keys outside the General MIDI kit (35-81). */
const DEFAULT_VOICE: DrumVoice = {
  name: 'percussion',
  layers: [{ kind: 'noise', level: 0.9, attack: 0.001, decay: 0.08, filters: [{ type: 'bandpass', frequency: 2000, Q: 1 }] }],
};

const GM_KIT: Record<number, DrumVoice> = {
  35: kick(1.0),
  36: kick(1.0),
  37: {
    name: 'side stick',
    layers: [
      { kind: 'noise', level: 0.9, attack: 0.0005, decay: 0.04, filters: [{ type: 'bandpass', frequency: 2500, Q: 1.5 }] },
      { kind: 'tone', wave: 'triangle', frequencies: [400], level: 0.4, attack: 0.0005, decay: 0.03 },
    ],
  },
  38: snare(false),
  39: clap(),
  40: snare(true),
  41: tom(82),
  42: hat(0.05, 2.2, false),
  43: tom(98),
  44: hat(0.04, 1.6, false),
  45: tom(110),
  46: hat(0.3, 2.0, true),
  47: tom(131),
  48: tom(147),
  49: cymbal('crash', 1.5, 0.55, 4500),
  50: tom(175),
  51: ride(false),
  52: cymbal('china', 1.0, 0.6, 3000),
  53: ride(true),
  54: {
    name: 'tambourine',
    layers: [
      { kind: 'noise', level: 1.0, attack: 0.002, decay: 0.16, filters: [{ type: 'bandpass', frequency: 9000, Q: 1.5 }, { type: 'highpass', frequency: 6000 }] },
      { kind: 'tone', wave: 'square', frequencies: [5300, 6800], level: 0.06, attack: 0.001, decay: 0.12 },
    ],
  },
  55: cymbal('splash', 0.5, 0.5, 5000),
  56: {
    name: 'cowbell',
    layers: [
      { kind: 'tone', wave: 'square', frequencies: [540, 800], level: 0.35, attack: 0.001, decay: 0.25, filters: [{ type: 'bandpass', frequency: 800, Q: 1.5 }] },
    ],
  },
  57: cymbal('crash', 1.4, 0.55, 4200),
  58: { name: 'vibraslap', layers: [{ kind: 'noise', level: 0.8, attack: 0.002, decay: 0.6, filters: [{ type: 'bandpass', frequency: 3000, Q: 4 }] }] },
  59: ride(false),
  60: pitched('high bongo', 'sine', [400], 0.12, 0.7, 0.85),
  61: pitched('low bongo', 'sine', [300], 0.15, 0.7, 0.85),
  62: pitched('muted conga', 'sine', [330], 0.08, 0.7, 0.9),
  63: pitched('open conga', 'sine', [330], 0.25, 0.7, 0.9),
  64: pitched('low conga', 'sine', [220], 0.3, 0.7, 0.9),
  65: {
    name: 'high timbale',
    layers: [
      { kind: 'tone', wave: 'triangle', frequencies: [500], level: 0.6, attack: 0.001, decay: 0.3 },
      { kind: 'noise', level: 0.4, attack: 0.001, decay: 0.05, filters: [{ type: 'bandpass', frequency: 4000, Q: 1 }] },
    ],
  },
  66: {
    name: 'low timbale',
    layers: [
      { kind: 'tone', wave: 'triangle', frequencies: [380], level: 0.6, attack: 0.001, decay: 0.35 },
      { kind: 'noise', level: 0.4, attack: 0.001, decay: 0.05, filters: [{ type: 'bandpass', frequency: 3500, Q: 1 }] },
    ],
  },
  67: pitched('high agogo', 'sine', [900, 1350], 0.3, 0.4),
  68: pitched('low agogo', 'sine', [650, 975], 0.3, 0.4),
  69: shaker('cabasa', 0.06, 5000),
  70: shaker('maracas', 0.05, 6000),
  71: pitched('short whistle', 'sine', [2500], 0.12, 0.3),
  72: { name: 'long whistle', layers: [{ kind: 'tone', wave: 'sine', frequencies: [2500], level: 0.3, attack: 0.02, decay: 0.45 }] },
  73: { name: 'short guiro', layers: [{ kind: 'noise', level: 0.9, attack: 0.01, decay: 0.1, filters: [{ type: 'bandpass', frequency: 3000, Q: 3 }] }] },
  74: { name: 'long guiro', layers: [{ kind: 'noise', level: 0.9, attack: 0.05, decay: 0.3, filters: [{ type: 'bandpass', frequency: 3000, Q: 3 }] }] },
  75: pitched('claves', 'sine', [2500], 0.05, 0.6),
  76: pitched('high wood block', 'triangle', [1700], 0.06, 0.6),
  77: pitched('low wood block', 'triangle', [1200], 0.07, 0.6),
  78: pitched('muted cuica', 'sine', [700], 0.15, 0.5, 0.7),
  79: pitched('open cuica', 'sine', [700], 0.3, 0.5, 0.7),
  80: pitched('muted triangle', 'sine', [4500, 6600], 0.15, 0.25),
  81: pitched('open triangle', 'sine', [4500, 6600], 1.2, 0.25),
};

export const GM_DRUM_KEY_RANGE = { first: 35, last: 81 } as const;

export function resolveDrumVoice(key: number): DrumVoice {
  return GM_KIT[Math.round(key)] ?? DEFAULT_VOICE;
}

export function isGeneralMidiDrumKey(key: number) {
  return Object.hasOwn(GM_KIT, Math.round(key));
}

/** Number of audio nodes a hit of this voice creates (sources, filters, envelopes, output). */
export function drumVoiceNodeCount(voice: DrumVoice) {
  return 1 + voice.layers.reduce((count, layer) => (
    count + (layer.kind === 'tone' ? layer.frequencies.length : 1) + (layer.filters?.length ?? 0) + 1
  ), 0);
}

/** How long the hit sounds after it starts, in seconds. */
export function drumVoiceDuration(voice: DrumVoice) {
  return voice.layers.reduce((longest, layer) => Math.max(longest, (layer.delay ?? 0) + (layer.attack ?? 0) + layer.decay), 0);
}

/** Estimated peak of a hit at gain 1, before the master gain (used by the level planner). */
export function drumVoicePeak(voice: DrumVoice) {
  return DRUM_KIT_GAIN * Math.max(...voice.layers.map((layer) => layer.level), 0);
}

type DrumAudioContext = Pick<BaseAudioContext, 'createGain' | 'createOscillator' | 'createBiquadFilter' | 'createBufferSource' | 'createBuffer' | 'sampleRate' | 'currentTime'>;

const noiseBuffers = new WeakMap<object, AudioBuffer>();

function createRandom(seed: number) {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6D2B79F5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return (((t ^ (t >>> 14)) >>> 0) / 4294967296);
  };
}

function noiseBuffer(ac: DrumAudioContext) {
  const cached = noiseBuffers.get(ac);
  if (cached) return cached;
  const sampleRate = ac.sampleRate || 44100;
  const buffer = ac.createBuffer(1, Math.round(sampleRate * 2), sampleRate);
  const data = buffer.getChannelData(0);
  const random = createRandom(0xD2C5);
  for (let index = 0; index < data.length; index += 1) data[index] = (random() * 2) - 1;
  noiseBuffers.set(ac, buffer);
  return buffer;
}

export interface DrumHitHandle {
  stop(when?: number): void;
  /** AudioContext time at which the hit has died away. */
  endTime: number;
  voice: DrumVoice;
}

const SILENT = 0.0001;

/**
 * Plays one hit of GM drum `key` at AudioContext time `when` into `destination`. Every source
 * starts exactly at `when` (plus the layer's own delay, for the clap's bursts).
 */
export function playDrumHit(
  ac: DrumAudioContext,
  key: number,
  when: number,
  gain: number,
  destination: AudioNode,
): DrumHitHandle {
  const voice = resolveDrumVoice(key);
  const output = ac.createGain();
  output.gain.value = Math.max(0, gain) * DRUM_KIT_GAIN;
  output.connect(destination);
  const sources: AudioScheduledSourceNode[] = [];
  const envelopes: GainNode[] = [];
  let endTime = when;

  voice.layers.forEach((layer, layerIndex) => {
    const start = when + (layer.delay ?? 0);
    const attack = Math.max(0.0005, layer.attack ?? 0.001);
    const end = start + attack + layer.decay;
    endTime = Math.max(endTime, end);
    const envelope = ac.createGain();
    envelope.gain.setValueAtTime(0, start);
    envelope.gain.linearRampToValueAtTime(layer.level, start + attack);
    envelope.gain.exponentialRampToValueAtTime(Math.max(SILENT, layer.level * 0.001), end);
    envelope.gain.linearRampToValueAtTime(0, end + 0.005);
    envelope.connect(output);
    envelopes.push(envelope);

    let input: AudioNode = envelope;
    [...(layer.filters ?? [])].reverse().forEach((spec) => {
      const filter = ac.createBiquadFilter();
      filter.type = spec.type;
      filter.frequency.value = spec.frequency;
      if (spec.Q != null) filter.Q.value = spec.Q;
      filter.connect(input);
      input = filter;
    });

    if (layer.kind === 'noise') {
      const source = ac.createBufferSource();
      source.buffer = noiseBuffer(ac);
      source.connect(input);
      // Different hits read different parts of the noise, so repeated hits do not sound identical.
      const offset = ((key * 0.137) + (layerIndex * 0.31) + (when * 7.3)) % 1.5;
      source.start(start, Math.max(0, offset));
      source.stop(end + 0.01);
      sources.push(source);
      return;
    }
    layer.frequencies.forEach((frequency) => {
      const oscillator = ac.createOscillator();
      oscillator.type = layer.wave;
      oscillator.frequency.setValueAtTime(frequency, start);
      if (layer.sweepRatio && layer.sweepSeconds) {
        oscillator.frequency.exponentialRampToValueAtTime(frequency * layer.sweepRatio, start + layer.sweepSeconds);
      }
      oscillator.connect(input);
      oscillator.start(start);
      oscillator.stop(end + 0.01);
      sources.push(oscillator);
    });
  });

  let stopped = false;
  const disconnect = () => {
    try { output.disconnect(); } catch { /* already disconnected */ }
  };
  if (sources[0]) sources[0].onended = disconnect;
  return {
    voice,
    endTime: endTime + 0.01,
    stop(stopWhen) {
      if (stopped) return;
      stopped = true;
      const at = Math.max(ac.currentTime, stopWhen ?? ac.currentTime);
      try {
        output.gain.cancelScheduledValues(at);
        output.gain.setValueAtTime(output.gain.value, at);
        output.gain.linearRampToValueAtTime(0, at + 0.01);
        sources.forEach((source) => {
          try { source.stop(at + 0.012); } catch { /* already stopped */ }
        });
      } catch {
        disconnect();
      }
    },
  };
}

// ── Metronome click ─────────────────────────────────────────────────────────

export const METRONOME_CLICK = {
  /** Peak of the rendered click buffer. */
  peak: 0.25,
  durationSeconds: 0.04,
  releaseSeconds: 0.005,
  accentHz: 2200,
  beatHz: 1600,
  /** Gain of the click into the master bus (which adds MASTER_GAIN). */
  accentGain: 0.2,
  beatGain: 0.13,
} as const;

/**
 * A woodblock-like click: a short decaying tone with an inharmonic partial and a band-limited
 * noise transient, normalised to METRONOME_CLICK.peak and faded out over the last 5 ms.
 */
export function renderMetronomeClick(sampleRate: number, accent: boolean): Float32Array<ArrayBuffer> {
  const length = Math.max(1, Math.round(METRONOME_CLICK.durationSeconds * sampleRate));
  const data = new Float32Array(length);
  const frequency = accent ? METRONOME_CLICK.accentHz : METRONOME_CLICK.beatHz;
  const random = createRandom(accent ? 0xACC : 0xBEA);
  let noiseState = 0;
  for (let index = 0; index < length; index += 1) {
    const t = index / sampleRate;
    const attack = Math.min(1, t / 0.0005);
    const body = Math.sin(2 * Math.PI * frequency * t) * Math.exp(-t / 0.009);
    const partial = 0.35 * Math.sin(2 * Math.PI * frequency * 2.71 * t) * Math.exp(-t / 0.004);
    // Differenced noise (a gentle high-pass) for the stick transient.
    const white = (random() * 2) - 1;
    const transient = 0.6 * (white - noiseState) * Math.exp(-t / 0.0012);
    noiseState = white;
    data[index] = attack * (body + partial + transient);
  }
  let peak = 0;
  for (let index = 0; index < length; index += 1) peak = Math.max(peak, Math.abs(data[index]!));
  const scale = peak > 0 ? METRONOME_CLICK.peak / peak : 0;
  const releaseFrames = Math.min(length, Math.round(METRONOME_CLICK.releaseSeconds * sampleRate));
  for (let index = 0; index < length; index += 1) {
    const fromEnd = length - 1 - index;
    const release = fromEnd < releaseFrames ? 0.5 * (1 - Math.cos((Math.PI * fromEnd) / releaseFrames)) : 1;
    data[index] *= scale * release;
  }
  return data;
}
