/**
 * Synthetic guitar signals for the amp input tests: plucked strings with a
 * pick transient and overtones that die away faster than the fundamental.
 */

export function midiToFrequency(midi: number) {
  return 440 * (2 ** ((midi - 69) / 12));
}

/** A deterministic noise source, so a failing test fails the same way every time. */
export function noise(seed: number) {
  let state = seed >>> 0;
  return () => {
    state = (state * 1664525 + 1013904223) >>> 0;
    return (state / 0xffffffff) * 2 - 1;
  };
}

export interface Pluck {
  midi: number;
  at: number;
  /** Seconds; the note is cut (damped) at this time. */
  until: number;
  amplitude?: number;
  /** Relative amplitude of harmonics 1, 2, 3, … */
  harmonics?: number[];
  /** Decay time constant per harmonic, in seconds; the last value repeats. */
  decays?: number[];
  /** A pick transient on top of the decay: 1 + transient · e^(−t/8 ms). */
  transient?: number;
}

export function render(sampleRate: number, seconds: number, plucks: Pluck[], extras: Array<(t: number) => number> = []) {
  const samples = new Float32Array(Math.round(seconds * sampleRate));
  for (const pluck of plucks) {
    const {
      midi, at, until, amplitude = 0.3, harmonics = [1, 0.5, 0.33, 0.25, 0.2],
      // Upper harmonics of a string die away faster than the fundamental.
      decays = [0.9, 0.5, 0.3, 0.2, 0.15], transient = 3,
    } = pluck;
    const fundamental = midiToFrequency(midi);
    const first = Math.round(at * sampleRate);
    const last = Math.min(samples.length, Math.round(until * sampleRate));
    for (let index = first; index < last; index += 1) {
      const t = (index - first) / sampleRate;
      const attack = Math.min(1, t / 0.002);
      const release = Math.min(1, (last - index) / (0.004 * sampleRate));
      const envelope = amplitude * attack * release * (1 + transient * Math.exp(-t / 0.008));
      let value = 0;
      harmonics.forEach((weight, harmonic) => {
        const frequency = fundamental * (harmonic + 1);
        if (frequency >= sampleRate / 2) return;
        const decay = decays[Math.min(harmonic, decays.length - 1)]!;
        value += weight * Math.exp(-t / decay) * Math.sin(2 * Math.PI * frequency * t);
      });
      samples[index] += envelope * value;
    }
  }
  if (extras.length > 0) {
    for (let index = 0; index < samples.length; index += 1) {
      const t = index / sampleRate;
      for (const extra of extras) samples[index] += extra(t);
    }
  }
  return samples;
}
