export interface DetectedAudioPitch {
  midi: number;
  frequency: number;
  levelDb: number;
  salience: number;
}

export interface AudioPitchDetectionOptions {
  sampleRate: number;
  fftSize: number;
  minMidi?: number;
  maxMidi?: number;
  maxPitches?: number;
  minimumLevelDb?: number;
  minimumSignalAboveNoiseDb?: number;
}

export interface TimeDomainPitchDetectionOptions {
  sampleRate: number;
  minMidi?: number;
  maxMidi?: number;
  minimumLevelDb?: number;
  yinThreshold?: number;
}

function midiToFrequency(midi: number) {
  return 440 * (2 ** ((midi - 69) / 12));
}

function frequencyToMidi(frequency: number) {
  return 69 + 12 * Math.log2(frequency / 440);
}

function finiteDb(value: number) {
  return Number.isFinite(value) ? value : -120;
}

/**
 * Detects one fundamental with the YIN cumulative mean normalized difference
 * method. This is the reliable path for melodic guitar and other monophonic
 * entry because it follows the waveform period instead of its loud overtones.
 */
export function detectPitchFromTimeDomain(
  samples: ArrayLike<number>,
  options: TimeDomainPitchDetectionOptions,
): DetectedAudioPitch | null {
  const {
    sampleRate,
    minMidi = 36,
    maxMidi = 96,
    minimumLevelDb = -75,
    yinThreshold = 0.2,
  } = options;
  if (
    samples.length < 512
    || !Number.isFinite(sampleRate)
    || sampleRate <= 0
  ) return null;

  const sampleCount = Math.min(samples.length, 4096);
  let mean = 0;
  for (let index = 0; index < sampleCount; index += 1) {
    mean += Number(samples[index]) || 0;
  }
  mean /= sampleCount;

  let squareSum = 0;
  const centered = new Float32Array(sampleCount);
  for (let index = 0; index < sampleCount; index += 1) {
    const sample = (Number(samples[index]) || 0) - mean;
    centered[index] = sample;
    squareSum += sample * sample;
  }
  const rms = Math.sqrt(squareSum / sampleCount);
  const levelDb = rms > 0 ? 20 * Math.log10(rms) : -120;
  if (levelDb < minimumLevelDb) return null;

  const minimumFrequency = midiToFrequency(minMidi);
  const maximumFrequency = midiToFrequency(maxMidi);
  const minimumLag = Math.max(2, Math.floor(sampleRate / maximumFrequency));
  const maximumLag = Math.min(
    sampleCount - 2,
    Math.ceil(sampleRate / minimumFrequency),
  );
  if (maximumLag <= minimumLag) return null;

  const difference = new Float32Array(maximumLag + 1);
  const normalized = new Float32Array(maximumLag + 1);
  let cumulativeDifference = 0;
  normalized[0] = 1;
  for (let lag = 1; lag <= maximumLag; lag += 1) {
    let sum = 0;
    const limit = sampleCount - lag;
    for (let index = 0; index < limit; index += 1) {
      const delta = centered[index]! - centered[index + lag]!;
      sum += delta * delta;
    }
    difference[lag] = sum;
    cumulativeDifference += sum;
    normalized[lag] = cumulativeDifference > 0
      ? (sum * lag) / cumulativeDifference
      : 1;
  }

  let selectedLag = -1;
  for (let lag = minimumLag; lag < maximumLag; lag += 1) {
    if (normalized[lag]! >= yinThreshold) continue;
    while (
      lag + 1 <= maximumLag
      && normalized[lag + 1]! < normalized[lag]!
    ) lag += 1;
    selectedLag = lag;
    break;
  }
  if (selectedLag < 0) {
    let bestValue = 1;
    for (let lag = minimumLag; lag <= maximumLag; lag += 1) {
      if (normalized[lag]! < bestValue) {
        bestValue = normalized[lag]!;
        selectedLag = lag;
      }
    }
    if (selectedLag < 0 || bestValue > 0.35) return null;
  }

  const left = normalized[Math.max(minimumLag, selectedLag - 1)]!;
  const center = normalized[selectedLag]!;
  const right = normalized[Math.min(maximumLag, selectedLag + 1)]!;
  const denominator = left - (2 * center) + right;
  const interpolatedLag = Math.abs(denominator) > 1e-9
    ? selectedLag + (0.5 * (left - right)) / denominator
    : selectedLag;
  const frequency = sampleRate / interpolatedLag;
  const exactMidi = frequencyToMidi(frequency);
  const midi = Math.round(exactMidi);
  if (
    midi < minMidi
    || midi > maxMidi
    || Math.abs(exactMidi - midi) > 0.48
  ) return null;

  return {
    midi,
    frequency,
    levelDb,
    salience: Math.max(0, 1 - center),
  };
}

function percentile(values: number[], ratio: number) {
  if (values.length === 0) return -100;
  values.sort((left, right) => left - right);
  return values[Math.min(values.length - 1, Math.max(0, Math.floor(values.length * ratio)))]!;
}

function peakNear(
  spectrumDb: ArrayLike<number>,
  expectedFrequency: number,
  sampleRate: number,
  fftSize: number,
) {
  const binWidth = sampleRate / fftSize;
  const expectedBin = expectedFrequency / binWidth;
  const radius = Math.max(2, Math.ceil(expectedBin * 0.018));
  const firstBin = Math.max(1, Math.floor(expectedBin - radius));
  const lastBin = Math.min(spectrumDb.length - 2, Math.ceil(expectedBin + radius));
  let peakBin = firstBin;
  let peakDb = finiteDb(Number(spectrumDb[firstBin]));
  for (let bin = firstBin + 1; bin <= lastBin; bin += 1) {
    const value = finiteDb(Number(spectrumDb[bin]));
    if (value > peakDb) {
      peakBin = bin;
      peakDb = value;
    }
  }
  const left = finiteDb(Number(spectrumDb[Math.max(0, peakBin - 3)]));
  const right = finiteDb(Number(spectrumDb[Math.min(spectrumDb.length - 1, peakBin + 3)]));
  return {
    frequency: peakBin * binWidth,
    levelDb: peakDb,
    localContrastDb: peakDb - ((left + right) / 2),
  };
}

/**
 * Extracts a conservative set of musical fundamentals from an analyser FFT.
 *
 * This is intentionally optimized for notation entry rather than transcription:
 * it prefers missing a weak tone over writing every audible overtone as a note.
 */
export function detectPitchesFromSpectrum(
  spectrumDb: ArrayLike<number>,
  options: AudioPitchDetectionOptions,
): DetectedAudioPitch[] {
  const {
    sampleRate,
    fftSize,
    minMidi = 36,
    maxMidi = 96,
    maxPitches = 4,
    minimumLevelDb = -92,
    minimumSignalAboveNoiseDb = 9,
  } = options;
  if (
    spectrumDb.length === 0
    || !Number.isFinite(sampleRate)
    || sampleRate <= 0
    || !Number.isFinite(fftSize)
    || fftSize <= 0
  ) return [];

  const minFrequency = midiToFrequency(minMidi);
  const maxRelevantFrequency = Math.min(sampleRate / 2, midiToFrequency(maxMidi) * 4);
  const binWidth = sampleRate / fftSize;
  const firstRelevantBin = Math.max(1, Math.floor(minFrequency / binWidth));
  const lastRelevantBin = Math.min(spectrumDb.length - 1, Math.ceil(maxRelevantFrequency / binWidth));
  const noiseSamples: number[] = [];
  for (let bin = firstRelevantBin; bin <= lastRelevantBin; bin += 4) {
    noiseSamples.push(finiteDb(Number(spectrumDb[bin])));
  }
  const noiseFloorDb = percentile(noiseSamples, 0.55);

  const candidates: Array<DetectedAudioPitch & { fundamentalStrength: number }> = [];
  for (let midi = Math.ceil(minMidi); midi <= Math.floor(maxMidi); midi += 1) {
    const expectedFrequency = midiToFrequency(midi);
    const fundamental = peakNear(spectrumDb, expectedFrequency, sampleRate, fftSize);
    if (Math.round(frequencyToMidi(fundamental.frequency)) !== midi) continue;
    const fundamentalStrength = fundamental.levelDb - noiseFloorDb;
    if (
      fundamental.levelDb < minimumLevelDb
      || fundamentalStrength < minimumSignalAboveNoiseDb
      || fundamental.localContrastDb < 3
    ) continue;

    let salience = fundamentalStrength * 1.5;
    const harmonicWeights = [0, 0.58, 0.38, 0.27, 0.2];
    for (let harmonic = 2; harmonic < harmonicWeights.length; harmonic += 1) {
      const harmonicFrequency = expectedFrequency * harmonic;
      if (harmonicFrequency >= sampleRate / 2) break;
      const harmonicPeak = peakNear(spectrumDb, harmonicFrequency, sampleRate, fftSize);
      const harmonicStrength = Math.max(0, harmonicPeak.levelDb - noiseFloorDb - 3);
      salience += harmonicStrength * harmonicWeights[harmonic]!;
    }
    candidates.push({
      midi,
      frequency: fundamental.frequency,
      levelDb: fundamental.levelDb,
      salience,
      fundamentalStrength,
    });
  }

  // Remove likely overtones when a credible lower fundamental explains them.
  const fundamentals: typeof candidates = [];
  for (const candidate of candidates.sort((left, right) => left.midi - right.midi)) {
    const explainedByLowerFundamental = fundamentals.some((lower) => {
      const ratio = candidate.frequency / lower.frequency;
      const harmonic = Math.round(ratio);
      if (harmonic < 2 || harmonic > 6) return false;
      const centsFromHarmonic = Math.abs(1200 * Math.log2(ratio / harmonic));
      return centsFromHarmonic < 38
        && candidate.fundamentalStrength < lower.fundamentalStrength * 0.95
        && candidate.salience < lower.salience * 1.15;
    });
    if (!explainedByLowerFundamental) fundamentals.push(candidate);
  }

  const strongestSalience = Math.max(0, ...fundamentals.map((candidate) => candidate.salience));
  const relativeThreshold = strongestSalience * 0.42;
  return fundamentals
    .filter((candidate) => candidate.salience >= relativeThreshold)
    .sort((left, right) => right.salience - left.salience)
    .slice(0, Math.max(1, maxPitches))
    .sort((left, right) => left.midi - right.midi)
    .map(({ fundamentalStrength: _fundamentalStrength, ...pitch }) => pitch);
}

export interface MicrophoneNoteGateOptions {
  settleMs?: number;
  transitionSettleMs?: number;
  releaseMs?: number;
}

/**
 * Converts continuous pitch frames into discrete notation events.
 * Sustained tones are emitted once, chord attacks get a short collection
 * window, and releasing chord members cannot accidentally write new notes.
 */
export class MicrophoneNoteGate {
  private readonly settleMs: number;
  private readonly transitionSettleMs: number;
  private readonly releaseMs: number;
  private readonly frameGapMs: number;
  private attackSinceMs: number | null = null;
  private firstSeenByNote = new Map<number, number>();
  private lastSeenByNote = new Map<number, number>();
  private emittedNotes = new Set<number>();
  private silenceSinceMs: number | null = null;
  private transitionSinceMs: number | null = null;
  private transitionSignature = '';

  constructor(options: MicrophoneNoteGateOptions = {}) {
    this.settleMs = Math.max(40, options.settleMs ?? 140);
    this.transitionSettleMs = Math.max(40, options.transitionSettleMs ?? 75);
    this.releaseMs = Math.max(80, options.releaseMs ?? 180);
    this.frameGapMs = Math.max(140, this.settleMs);
  }

  reset() {
    this.attackSinceMs = null;
    this.firstSeenByNote.clear();
    this.lastSeenByNote.clear();
    this.emittedNotes.clear();
    this.silenceSinceMs = null;
    this.transitionSinceMs = null;
    this.transitionSignature = '';
  }

  push(inputNotes: Iterable<number>, nowMs: number): number[] | null {
    const notes = [...new Set([...inputNotes]
      .filter((note) => Number.isFinite(note) && note >= 0 && note <= 127)
      .map((note) => Math.trunc(note)))]
      .sort((left, right) => left - right);

    if (notes.length === 0) {
      if (this.silenceSinceMs == null) this.silenceSinceMs = nowMs;
      if (nowMs - this.silenceSinceMs >= this.releaseMs) this.reset();
      return null;
    }
    this.silenceSinceMs = null;

    // A chord release is not a new musical attack.
    if (
      this.emittedNotes.size > 0
      && notes.every((note) => this.emittedNotes.has(note))
    ) {
      this.transitionSinceMs = null;
      this.transitionSignature = '';
      return null;
    }

    if (this.emittedNotes.size > 0) {
      const newNotes = notes.filter((note) => !this.emittedNotes.has(note));
      const transitionSignature = newNotes.join(',');
      if (transitionSignature !== this.transitionSignature) {
        this.transitionSignature = transitionSignature;
        this.transitionSinceMs = nowMs;
        return null;
      }
      if (
        this.transitionSinceMs == null
        || nowMs - this.transitionSinceMs < this.transitionSettleMs
      ) return null;

      // A stable new pitch is itself the next musical attack. Requiring a
      // silent gap here makes melodic instrument entry unnecessarily stilted.
      this.emittedNotes = new Set(notes);
      this.transitionSinceMs = null;
      this.transitionSignature = '';
      return newNotes;
    }
    if (this.attackSinceMs == null) this.attackSinceMs = nowMs;

    for (const note of notes) {
      const previousSeenMs = this.lastSeenByNote.get(note);
      if (previousSeenMs == null || nowMs - previousSeenMs > this.frameGapMs) {
        this.firstSeenByNote.set(note, nowMs);
      }
      this.lastSeenByNote.set(note, nowMs);
    }
    for (const [note, lastSeenMs] of this.lastSeenByNote) {
      if (nowMs - lastSeenMs > this.frameGapMs) {
        this.lastSeenByNote.delete(note);
        this.firstSeenByNote.delete(note);
      }
    }

    if (nowMs - this.attackSinceMs < this.settleMs) return null;
    const minimumPresenceMs = Math.max(40, this.settleMs * 0.55);
    const emitted = notes.filter((note) => (
      nowMs - (this.firstSeenByNote.get(note) ?? nowMs) >= minimumPresenceMs
      && nowMs - (this.lastSeenByNote.get(note) ?? 0) <= this.frameGapMs
    ));
    if (emitted.length === 0) return null;

    this.emittedNotes = new Set(emitted);
    this.attackSinceMs = null;
    this.firstSeenByNote.clear();
    this.lastSeenByNote.clear();
    return emitted;
  }
}
