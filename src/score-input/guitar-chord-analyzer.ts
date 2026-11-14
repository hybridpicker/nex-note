/**
 * Finds the notes of a strummed guitar chord in a short block of a mono line
 * signal (a USB amp), for notation entry.
 *
 * A period estimate, which the single-note tracker uses, describes one string.
 * Several strings are told apart by their partials instead: the block is
 * turned into a spectrum, and its peaks are read from the lowest upwards. A
 * peak that no lower note explains is the fundamental of a string. A peak that
 * sits on an overtone of a lower note (the octave, the twelfth, …) is a played
 * string only when it and its own overtones stand clearly above the lower
 * note's neighbouring overtones; otherwise it is that overtone and nothing is
 * written for it.
 *
 * That last decision is a judgement, not a measurement: a doubled octave and a
 * strong second harmonic of one string differ only in how the whole overtone
 * series is shaped. The rule here prefers to leave a doubling out over writing
 * an overtone as a note.
 *
 * Pure logic: it takes samples, so tests feed it synthetic signals.
 */

export interface GuitarChordAnalyzerSettings {
  minMidi: number;
  maxMidi: number;
  /** A guitar has six strings. */
  maxNotes: number;
  /** A fundamental must come this close to the strongest partial in the note range, in dB. */
  relativeFloorDb: number;
  /** Below this level (dBFS, as the amplitude of the strongest partial) the block holds no chord. */
  absoluteFloorDb: number;
  /** How far a partial may lie from an exact multiple and still belong to that note. */
  harmonicToleranceCents: number;
  /**
   * A peak within a whole tone of a peak this much stronger (dB) is taken for its skirt: a string
   * whose level still changes inside the block spreads into the neighbouring notes.
   */
  skirtDb: number;
  /** How far a note on an overtone of a lower note must stand above that note's neighbouring overtones (power ratio). */
  overtoneEvidence: number;
  /**
   * Where no neighbouring overtone is left to compare with: how far the note
   * must stand above overtones that fall off as 1/m in amplitude (power ratio).
   */
  overtoneLoudness: number;
  /**
   * A note found on an overtone is dropped when it lies further than this above the lowest
   * note: two octaves between the outer strings, a hand's reach of frets and a few more.
   */
  maxSpanSemitones: number;
  highestPartialHz: number;
}

export const DEFAULT_GUITAR_CHORD_ANALYZER_SETTINGS: GuitarChordAnalyzerSettings = {
  minMidi: 35,
  maxMidi: 88,
  maxNotes: 6,
  relativeFloorDb: -26,
  absoluteFloorDb: -66,
  harmonicToleranceCents: 35,
  skirtDb: 12,
  overtoneEvidence: 2,
  overtoneLoudness: 1.5,
  maxSpanSemitones: 31,
  highestPartialHz: 5000,
};

export interface ChordNote {
  midi: number;
  frequency: number;
  /** Amplitude of the fundamental, in dBFS. */
  levelDb: number;
}

interface SpectralPeak {
  frequency: number;
  power: number;
}

function midiToFrequency(midi: number) {
  return 440 * (2 ** ((midi - 69) / 12));
}

function frequencyToMidi(frequency: number) {
  return 69 + 12 * Math.log2(frequency / 440);
}

/** An in-place radix-2 FFT of a real block, kept as power per bin. */
class PowerSpectrum {
  readonly size: number;
  private readonly re: Float64Array;
  private readonly im: Float64Array;
  private readonly cos: Float64Array;
  private readonly sin: Float64Array;
  private readonly reversed: Uint32Array;

  constructor(minimumSize: number) {
    let size = 2;
    while (size < minimumSize) size <<= 1;
    this.size = size;
    this.re = new Float64Array(size);
    this.im = new Float64Array(size);
    this.cos = new Float64Array(size / 2);
    this.sin = new Float64Array(size / 2);
    for (let index = 0; index < size / 2; index += 1) {
      this.cos[index] = Math.cos((2 * Math.PI * index) / size);
      this.sin[index] = -Math.sin((2 * Math.PI * index) / size);
    }
    this.reversed = new Uint32Array(size);
    const bits = Math.log2(size);
    for (let index = 0; index < size; index += 1) {
      let value = 0;
      for (let bit = 0; bit < bits; bit += 1) value = (value << 1) | ((index >> bit) & 1);
      this.reversed[index] = value;
    }
  }

  /** Hann-windows the block, zero-pads it and writes the power of bins 0 … out.length − 1. */
  compute(samples: Float64Array, length: number, out: Float64Array) {
    const { re, im, size, reversed } = this;
    re.fill(0);
    im.fill(0);
    const scale = (2 * Math.PI) / Math.max(1, length - 1);
    for (let index = 0; index < length; index += 1) {
      re[index] = samples[index]! * 0.5 * (1 - Math.cos(scale * index));
    }
    for (let index = 0; index < size; index += 1) {
      const target = reversed[index]!;
      if (target > index) {
        const value = re[index]!;
        re[index] = re[target]!;
        re[target] = value;
      }
    }
    for (let span = 2; span <= size; span <<= 1) {
      const half = span >> 1;
      const step = size / span;
      for (let start = 0; start < size; start += span) {
        for (let offset = 0; offset < half; offset += 1) {
          const wr = this.cos[offset * step]!;
          const wi = this.sin[offset * step]!;
          const a = start + offset;
          const b = a + half;
          const br = re[b]! * wr - im[b]! * wi;
          const bi = re[b]! * wi + im[b]! * wr;
          re[b] = re[a]! - br;
          im[b] = im[a]! - bi;
          re[a] = re[a]! + br;
          im[a] = im[a]! + bi;
        }
      }
    }
    const bins = Math.min(out.length, size / 2);
    for (let bin = 0; bin < bins; bin += 1) out[bin] = re[bin]! * re[bin]! + im[bin]! * im[bin]!;
  }
}

export class GuitarChordAnalyzer {
  readonly sampleRate: number;
  readonly settings: GuitarChordAnalyzerSettings;
  /** The longest block `analyze` reads. */
  readonly maxWindow: number;

  private readonly spectrum: PowerSpectrum;
  private readonly power: Float64Array;
  private readonly binHz: number;

  constructor(sampleRate: number, maxWindow: number, settings: Partial<GuitarChordAnalyzerSettings> = {}) {
    if (!Number.isFinite(sampleRate) || sampleRate <= 0) throw new Error('A positive sample rate is required.');
    this.sampleRate = sampleRate;
    this.settings = { ...DEFAULT_GUITAR_CHORD_ANALYZER_SETTINGS, ...settings };
    this.maxWindow = Math.max(256, Math.floor(maxWindow));
    // Zero-padded to at least twice the block, so a peak is sampled finely enough to interpolate.
    this.spectrum = new PowerSpectrum(2 * this.maxWindow);
    this.binHz = sampleRate / this.spectrum.size;
    const highest = Math.min(sampleRate / 2, this.settings.highestPartialHz * 1.05);
    this.power = new Float64Array(Math.min(this.spectrum.size / 2, Math.ceil(highest / this.binHz) + 3));
  }

  /** The notes sounding in the block, lowest first. An empty list means no chord was found. */
  analyze(samples: Float64Array): ChordNote[] {
    const s = this.settings;
    const length = Math.min(samples.length, this.maxWindow);
    if (length < 64) return [];
    this.spectrum.compute(samples, length, this.power);

    const lowest = midiToFrequency(s.minMidi - 0.5);
    const highest = Math.min(midiToFrequency(s.maxMidi + 0.5), (this.power.length - 3) * this.binHz);
    const peaks = this.peaksBetween(lowest, highest);
    if (peaks.length === 0) return [];
    const strongest = peaks.reduce((most, peak) => Math.max(most, peak.power), 0);
    // A Hann-windowed sine of amplitude A peaks at (A · length / 4)².
    const toAmplitudeDb = (power: number) => 10 * Math.log10((16 * power) / (length * length));
    if (toAmplitudeDb(strongest) < s.absoluteFloorDb) return [];
    const floor = strongest * (10 ** (s.relativeFloorDb / 10));

    // First the strings nobody can mistake: peaks that sit on no overtone of
    // a lower string. Then, from the lowest upwards, the peaks that do.
    const accepted: SpectralPeak[] = [];
    const onOvertones: SpectralPeak[] = [];
    const skirt = 10 ** (s.skirtDb / 10);
    const wholeTone = 2 ** (2.5 / 12);
    for (const peak of peaks) {
      if (peak.power < floor) continue;
      const inSkirt = peaks.some((other) => (
        other.power > skirt * peak.power
        && other.frequency < peak.frequency * wholeTone
        && peak.frequency < other.frequency * wholeTone
      ));
      if (inSkirt) continue;
      const onOvertone = accepted.some((note) => this.harmonicNumber(peak.frequency, note.frequency) >= 2);
      (onOvertone ? onOvertones : accepted).push(peak);
    }
    const noise = strongest * 1e-5;
    const sparse = accepted.length <= 2;
    const highestDoubling = accepted.length > 0
      ? accepted[0]!.frequency * (2 ** ((s.maxSpanSemitones + 0.5) / 12))
      : 0;
    for (const peak of onOvertones) {
      if (peak.frequency > highestDoubling) break;
      if (this.isOwnString(peak, accepted, noise, sparse)) accepted.push(peak);
    }

    return accepted
      .sort((left, right) => right.power - left.power)
      .slice(0, Math.max(1, s.maxNotes))
      .map((note) => ({
        midi: Math.round(frequencyToMidi(note.frequency)),
        frequency: note.frequency,
        levelDb: toAmplitudeDb(note.power),
      }))
      .filter((note, index, all) => (
        note.midi >= s.minMidi
        && note.midi <= s.maxMidi
        && all.findIndex((other) => other.midi === note.midi) === index
      ))
      .sort((left, right) => left.midi - right.midi);
  }

  /** Local maxima of the spectrum, with frequency and height interpolated on the log power. */
  private peaksBetween(lowestHz: number, highestHz: number): SpectralPeak[] {
    const { power } = this;
    const first = Math.max(2, Math.floor(lowestHz / this.binHz));
    const last = Math.min(power.length - 2, Math.ceil(highestHz / this.binHz));
    const peaks: SpectralPeak[] = [];
    for (let bin = first; bin <= last; bin += 1) {
      const middle = power[bin]!;
      if (!(middle > power[bin - 1]! && middle >= power[bin + 1]!) || middle <= 0) continue;
      const a = Math.log(Math.max(power[bin - 1]!, 1e-300));
      const b = Math.log(middle);
      const c = Math.log(Math.max(power[bin + 1]!, 1e-300));
      const curvature = a - 2 * b + c;
      const offset = curvature < -1e-12 ? Math.max(-0.5, Math.min(0.5, (0.5 * (a - c)) / curvature)) : 0;
      const frequency = (bin + offset) * this.binHz;
      if (frequency < lowestHz || frequency > highestHz) continue;
      peaks.push({ frequency, power: Math.exp(b - 0.25 * (a - c) * offset) });
    }
    return peaks;
  }

  /** The harmonic of `fundamental` that `frequency` sits on, or 0 when it sits on none. */
  private harmonicNumber(frequency: number, fundamental: number) {
    const harmonic = Math.round(frequency / fundamental);
    if (harmonic < 1) return 0;
    const cents = Math.abs(1200 * Math.log2(frequency / (harmonic * fundamental)));
    return cents < this.settings.harmonicToleranceCents ? harmonic : 0;
  }

  /** The strongest bin within the harmonic tolerance around a frequency. */
  private powerNear(frequency: number) {
    const spread = 2 ** (this.settings.harmonicToleranceCents / 1200);
    const first = Math.max(1, Math.floor(frequency / spread / this.binHz));
    const last = Math.min(this.power.length - 1, Math.ceil((frequency * spread) / this.binHz));
    let most = 0;
    for (let bin = first; bin <= last; bin += 1) most = Math.max(most, this.power[bin]!);
    return most;
  }

  /**
   * Whether a peak on an overtone of lower notes is a string of its own.
   *
   * Partial k of the candidate lies on overtone m of a lower note. What that
   * note alone would show there is read from its overtones m − 1 and m + 1,
   * which the candidate cannot reach; a played string lifts its partials
   * clearly above that. A neighbour that another accepted note also feeds
   * says nothing about the lower note alone and is left out. Only partials 2
   * and 3 are judged this way: at the candidate's fundamental a doubled
   * octave and a string with a weak fundamental look alike, and two strings
   * an octave apart may cancel there.
   *
   * In a full chord nearly every neighbour is shared. Then the candidate's
   * first three partials are compared with overtones falling off as 1/m in
   * amplitude from the lower fundamentals, which a real string follows only
   * roughly, so in a full chord a loud overtone can be written as a doubling.
   */
  private isOwnString(candidate: SpectralPeak, accepted: SpectralPeak[], noise: number, sparse: boolean) {
    const s = this.settings;
    const limit = (this.power.length - 2) * this.binHz;
    const measured: number[] = [];
    const modelled: number[] = [];
    for (let k = 1; k <= 3; k += 1) {
      const partial = k * candidate.frequency;
      if (partial > limit) break;
      const observed = this.powerNear(partial) + noise;
      let fromNeighbours = 0;
      let fromModel = 0;
      let usable = k > 1;
      for (const note of accepted) {
        if (note === candidate) continue;
        const harmonic = this.harmonicNumber(partial, note.frequency);
        if (harmonic < 2) continue;
        fromModel += note.power / (harmonic * harmonic);
        if (!usable) continue;
        const neighbours: number[] = [];
        for (const index of [harmonic - 1, harmonic + 1]) {
          const frequency = index * note.frequency;
          if (frequency > limit) continue;
          const shared = accepted.some((other) => (
            other !== note && this.harmonicNumber(frequency, other.frequency) >= 1
          ));
          // Brought to overtone `harmonic` along the 1/m fall of a plucked string.
          if (!shared) neighbours.push(this.powerNear(frequency) * ((index / harmonic) ** 2));
        }
        if (neighbours.length === 0) usable = false;
        else fromNeighbours += Math.max(...neighbours);
      }
      if (usable) measured.push(observed / (fromNeighbours + noise));
      modelled.push(observed / (fromModel + noise));
    }
    if (sparse && measured.length > 0) {
      const mean = Math.exp(measured.reduce((sum, ratio) => (
        sum + Math.log(Math.max(0.1, Math.min(10, ratio)))
      ), 0) / measured.length);
      return mean >= s.overtoneEvidence;
    }
    if (modelled.length === 0) return false;
    // The middle value: two strings on one frequency may cancel at any single partial.
    const median = [...modelled].sort((left, right) => left - right)[Math.floor(modelled.length / 2)]!;
    return median >= s.overtoneLoudness;
  }
}
