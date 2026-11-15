// Impulse response of the shared playback reverb, generated at run time (no sample asset):
// decorrelated stereo noise under an exponential decay, a short pre-delay, and high frequencies
// that decay faster than low ones (a one-pole low-pass whose cut-off falls over the tail).

export const REVERB_RT60_SECONDS = 1.6;
export const REVERB_PRE_DELAY_SECONDS = 0.012;
/** Send level of every part into the reverb. */
export const REVERB_SEND_LEVEL = 0.18;

export interface ReverbImpulseOptions {
  sampleRate: number;
  rt60?: number;
  preDelaySeconds?: number;
  /** The tail ends where the decay reaches this level (dB below the start). */
  tailDb?: number;
  /** Low-pass cut-off at the start and at the end of the tail, in Hz. */
  brightHz?: number;
  darkHz?: number;
  seed?: number;
}

/** Small deterministic PRNG (mulberry32), so every build of the reverb sounds the same. */
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

/**
 * Stereo impulse response; each channel has unit energy, so a send of level s returns about s²
 * of the dry power (use it with `ConvolverNode.normalize = false`).
 */
export function generateReverbImpulse(options: ReverbImpulseOptions): [Float32Array<ArrayBuffer>, Float32Array<ArrayBuffer>] {
  const sampleRate = options.sampleRate;
  const rt60 = options.rt60 ?? REVERB_RT60_SECONDS;
  const preDelay = options.preDelaySeconds ?? REVERB_PRE_DELAY_SECONDS;
  const tailDb = options.tailDb ?? 70;
  const brightHz = Math.min(options.brightHz ?? 9000, sampleRate * 0.45);
  const darkHz = Math.min(options.darkHz ?? 2200, brightHz);
  const preDelayFrames = Math.round(preDelay * sampleRate);
  const tailFrames = Math.ceil(rt60 * (tailDb / 60) * sampleRate);
  const length = preDelayFrames + tailFrames;
  // Amplitude falls by 60 dB (a factor of 1000) over rt60 seconds.
  const decayPerSecond = Math.log(1000) / rt60;

  const channels = [new Float32Array(length), new Float32Array(length)] as [Float32Array<ArrayBuffer>, Float32Array<ArrayBuffer>];
  const random = createRandom(options.seed ?? 0x5EED);
  channels.forEach((data) => {
    let lowPassed = 0;
    for (let frame = 0; frame < tailFrames; frame += 1) {
      const progress = frame / tailFrames;
      const cutoff = brightHz * ((darkHz / brightHz) ** progress);
      const a = Math.exp((-2 * Math.PI * cutoff) / sampleRate);
      const white = (random() * 2) - 1;
      lowPassed = ((1 - a) * white) + (a * lowPassed);
      // A one-pole low-pass passes (1 - a) / (1 + a) of white-noise power: compensate, so the
      // broadband decay keeps the requested RT60 while the tail darkens.
      const compensation = Math.sqrt((1 + a) / (1 - a));
      const envelope = Math.exp((-decayPerSecond * frame) / sampleRate);
      data[preDelayFrames + frame] = lowPassed * compensation * envelope;
    }
    // A 5 ms fade-in avoids a click at the end of the pre-delay.
    const fadeInFrames = Math.min(tailFrames, Math.round(0.005 * sampleRate));
    for (let frame = 0; frame < fadeInFrames; frame += 1) {
      data[preDelayFrames + frame] *= frame / fadeInFrames;
    }
    let energy = 0;
    for (let index = 0; index < length; index += 1) energy += data[index]! * data[index]!;
    const scale = energy > 0 ? 1 / Math.sqrt(energy) : 0;
    for (let index = 0; index < length; index += 1) data[index] *= scale;
  });
  return channels;
}
