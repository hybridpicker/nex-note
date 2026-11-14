import { GuitarChordAnalyzer } from './guitar-chord-analyzer';
import type { SoundingNoteEvent } from './sounding-note';

/**
 * Follows the notes of a guitar from a mono line signal (a USB amp) and turns
 * them into note events for notation entry.
 *
 * The ideas come from AmpBench's tuner tracker (attack detection from the
 * level, a period estimate with the McLeod method, an octave lock while a note
 * sounds, and estimates that only count once the window has seen the octave
 * below). Everything that serves tuning accuracy is left out: no smoothing, no
 * hold, no phase measurement. Notation only needs to know which note starts
 * and when.
 *
 * With chord detection switched on, an attack is not answered by the period
 * estimate alone. The tracker waits for a block of the sound after the strum
 * and asks `GuitarChordAnalyzer` which strings it holds; all of them are
 * written at once, as note-ons with the same time. A single note still comes
 * from the period estimate, only later, once the block is complete.
 *
 * Pure logic: it takes samples, so tests feed it synthetic signals and no
 * audio hardware is needed.
 */

export interface GuitarNoteTrackerSettings {
  /** Lowest written result, as a MIDI number (B1 = 35 covers drop tunings and a seven-string). */
  minMidi: number;
  /** Highest result (E6 = 88, the 24th fret of the high E string). */
  maxMidi: number;
  /** The period search reaches this low, below `minMidi`, so a low note is seen as a whole period. */
  searchLowestHz: number;
  searchHighestHz: number;
  /** dBFS RMS over about 20 ms, with hysteresis. */
  gateOnDb: number;
  gateOffDb: number;
  /** An attack is a rise of at least this factor over the level 25 to 80 ms earlier. */
  attackRatio: number;
  /** What is left out after an attack, so the pick noise does not become a pitch. */
  attackBlankMs: number;
  /** Two attacks closer than this are one. */
  attackSpacingMs: number;
  hopMs: number;
  /** The least clarity of an estimate that locks a note, and that keeps a locked note. */
  lockClarity: number;
  keepClarity: number;
  /** Estimates that must agree within `agreementCents` before a note is locked. */
  lockEstimates: number;
  /** Estimates of a different, non-harmonic pitch that must agree before a legato change is written. */
  legatoEstimates: number;
  agreementCents: number;
  /** Closer than this to the locked note is the same note (vibrato, a slight bend). */
  sameNoteCents: number;
  /** Estimates in a row without a pitch after which a locked note is let go. */
  missesToRelease: number;
  /** Chord detection: the block read after a strum. Longer tells low strings apart better and writes later. */
  chordWindowMs: number;
  /** The least block that is still read as a chord when the next attack or the end of the sound cuts it short. */
  chordMinWindowMs: number;
  /** Attacks this soon after the first one are further strings of the same strum. */
  strumSpreadMs: number;
  /**
   * The block starts this long after the first attack at the earliest. The later strings of a
   * strum raise the level too little to be seen as attacks, and a string that starts inside the
   * block smears its partials over the neighbouring notes.
   */
  strumSettleMs: number;
  maxChordNotes: number;
}

export const DEFAULT_GUITAR_NOTE_TRACKER_SETTINGS: GuitarNoteTrackerSettings = {
  minMidi: 35,
  maxMidi: 88,
  searchLowestHz: 55,
  searchHighestHz: 1500,
  gateOnDb: -60,
  gateOffDb: -66,
  attackRatio: 2,
  attackBlankMs: 20,
  attackSpacingMs: 50,
  hopMs: 5,
  lockClarity: 0.8,
  keepClarity: 0.5,
  lockEstimates: 3,
  legatoEstimates: 4,
  agreementCents: 30,
  sameNoteCents: 70,
  missesToRelease: 4,
  chordWindowMs: 180,
  chordMinWindowMs: 120,
  strumSpreadMs: 120,
  strumSettleMs: 80,
  maxChordNotes: 6,
};

export type GuitarNoteTrigger = 'attack' | 'legato';

export type TrackedNoteEvent =
  | (Extract<SoundingNoteEvent, { type: 'note-on' }> & { frequency: number; trigger: GuitarNoteTrigger })
  | Extract<SoundingNoteEvent, { type: 'note-off' }>;

interface PeriodEstimate {
  lag: number;
  clarity: number;
  searchedUpTo: number;
}

/** Linear autocorrelation through a radix-2 FFT, zero-padded so it does not wrap. */
class Autocorrelator {
  readonly size: number;
  private readonly re: Float64Array;
  private readonly im: Float64Array;
  private readonly cos: Float64Array;
  private readonly sin: Float64Array;
  private readonly reversed: Uint32Array;

  constructor(minimumSize: number) {
    let size = 1;
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

  private transform() {
    const { re, im, size, reversed } = this;
    for (let index = 0; index < size; index += 1) {
      const target = reversed[index]!;
      if (target > index) {
        const r = re[index]!; re[index] = re[target]!; re[target] = r;
        const i = im[index]!; im[index] = im[target]!; im[target] = i;
      }
    }
    for (let length = 2; length <= size; length <<= 1) {
      const half = length >> 1;
      const step = size / length;
      for (let start = 0; start < size; start += length) {
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
  }

  /** Writes r(τ) = Σ x[i]·x[i+τ] for τ = 0 … maxLag into `out`. */
  autocorrelate(samples: Float64Array, length: number, maxLag: number, out: Float64Array) {
    const { re, im, size } = this;
    re.fill(0);
    im.fill(0);
    re.set(samples.subarray(0, length));
    this.transform();
    for (let index = 0; index < size; index += 1) {
      re[index] = re[index]! * re[index]! + im[index]! * im[index]!;
      im[index] = 0;
    }
    // The power spectrum is real and even, so a forward transform equals the
    // inverse one times the size.
    this.transform();
    for (let lag = 0; lag <= maxLag; lag += 1) out[lag] = re[lag]! / size;
  }
}

/**
 * The McLeod pitch method: the normalized square difference function of a
 * block, and the first of its key maxima that comes close to the highest one.
 */
class PeriodDetector {
  private readonly maxWindow: number;
  private readonly correlator: Autocorrelator;
  private readonly correlation: Float64Array;
  private readonly nsdf: Float64Array;
  private readonly keyThreshold = 0.9;

  constructor(maxWindow: number, maxLag: number) {
    this.maxWindow = Math.max(64, maxWindow);
    this.correlator = new Autocorrelator(2 * this.maxWindow);
    this.correlation = new Float64Array(maxLag + 2);
    this.nsdf = new Float64Array(maxLag + 2);
  }

  estimate(samples: Float64Array, minLag: number, maxLag: number): PeriodEstimate | null {
    const window = Math.min(samples.length, this.maxWindow);
    const upper = Math.min(maxLag, Math.floor(window / 2));
    if (window < 8 || upper <= minLag + 2) return null;
    let energy = 0;
    for (let index = 0; index < window; index += 1) energy += samples[index]! * samples[index]!;
    if (energy <= 1e-12) return null;
    const { correlation, nsdf } = this;
    this.correlator.autocorrelate(samples, window, upper, correlation);
    if (correlation[0]! <= 0) return null;

    // n(τ) = 2 r(τ) / m(τ), with m(τ) the energy of both overlapping parts.
    nsdf[0] = 1;
    let remaining = 2 * energy;
    for (let lag = 1; lag <= upper; lag += 1) {
      const early = samples[lag - 1]!;
      const late = samples[window - lag]!;
      remaining -= early * early + late * late;
      nsdf[lag] = remaining > 1e-12 ? (2 * correlation[lag]!) / remaining : 0;
    }

    let first = -1;
    for (let lag = 1; lag <= upper; lag += 1) {
      if (nsdf[lag]! <= 0) {
        first = lag;
        break;
      }
    }
    if (first < 0) return null;

    // Key maxima: the highest point of each positive lobe after the first negative stretch.
    const keys: Array<{ lag: number; value: number }> = [];
    let best = 0;
    let lobePeak = -1;
    for (let lag = first; lag <= upper; lag += 1) {
      const value = nsdf[lag]!;
      if (value > 0) {
        if (lobePeak < 0 || value > nsdf[lobePeak]!) lobePeak = lag;
      }
      if ((value <= 0 || lag === upper) && lobePeak >= 0) {
        if (lobePeak > minLag && lobePeak < upper) {
          keys.push({ lag: lobePeak, value: nsdf[lobePeak]! });
          best = Math.max(best, nsdf[lobePeak]!);
        }
        lobePeak = -1;
      }
    }
    if (best <= 0) return null;
    const chosen = keys.find((key) => key.value >= this.keyThreshold * best);
    if (!chosen) return null;
    const index = chosen.lag;
    const left = nsdf[index - 1]!;
    const middle = nsdf[index]!;
    const right = nsdf[index + 1]!;
    const denominator = left - 2 * middle + right;
    const offset = Math.abs(denominator) > 1e-12
      ? Math.max(-0.5, Math.min(0.5, (0.5 * (left - right)) / denominator))
      : 0;
    const height = middle - 0.25 * (left - right) * offset;
    return { lag: index + offset, clarity: Math.min(height, 1), searchedUpTo: upper };
  }
}

function centsBetween(frequency: number, reference: number) {
  return 1200 * Math.log2(frequency / reference);
}

function frequencyToMidi(frequency: number) {
  return 69 + 12 * Math.log2(frequency / 440);
}

/** Octaves up and down, the twelfth and the fifth: what overtones and undertones of a string are mistaken for. */
export function isHarmonicInterval(cents: number) {
  const ratios = [2, 3, 4, 1.5, 0.5, 1 / 3, 0.25, 2 / 3];
  return ratios.some((ratio) => Math.abs(cents - 1200 * Math.log2(ratio)) < 50);
}

function agreeingMedian(values: number[], withinCents: number) {
  const sorted = [...values].sort((left, right) => left - right);
  const median = sorted[Math.floor(sorted.length / 2)]!;
  return values.every((value) => Math.abs(centsBetween(value, median)) <= withinCents) ? median : null;
}

export class GuitarNoteTracker {
  readonly sampleRate: number;
  readonly settings: GuitarNoteTrackerSettings;
  /** Samples of the coarse window: two periods of the lowest searched frequency. */
  readonly coarseWindow: number;
  readonly minLag: number;
  readonly maxLag: number;

  private readonly hop: number;
  private readonly history: Float64Array;
  private readonly mask: number;
  private readonly detector: PeriodDetector;
  private readonly scratch: Float64Array;
  private readonly pole: number;
  private readonly chordWindow: number;
  private readonly chordMinWindow: number;
  private readonly strumSpread: number;
  private readonly strumSettle: number;
  private readonly chordAnalyzer: GuitarChordAnalyzer;
  private readonly chordScratch: Float64Array;

  private time = 0;
  private nextHop = 0;
  private hopIndex = 0;
  private hopPeak = 0;
  private levels: number[] = [];
  private hasSignal = false;
  private analysisStart = 0;
  private lastAttack = Number.NEGATIVE_INFINITY;
  private pendingAttack = false;
  private lockedFrequency: number | null = null;
  private lockedMidiValue: number | null = null;
  private candidates: number[] = [];
  private foreign: number[] = [];
  private missed = 0;
  private sounding: number[] = [];
  private chordDetection = false;
  private chordPending = false;
  private strumStart = 0;
  private chordStart = 0;
  private fallback: { midi: number; frequency: number } | null = null;
  private blockerIn = 0;
  private blockerOut = 0;
  private events: TrackedNoteEvent[] = [];

  /** Level of the last hop, in dBFS RMS. */
  levelDb = -140;
  /** The largest absolute input sample of the last hop, in dBFS. */
  peakDb = -140;
  attackCount = 0;

  constructor(sampleRate: number, settings: Partial<GuitarNoteTrackerSettings> = {}) {
    if (!Number.isFinite(sampleRate) || sampleRate <= 0) throw new Error('A positive sample rate is required.');
    this.sampleRate = sampleRate;
    this.settings = { ...DEFAULT_GUITAR_NOTE_TRACKER_SETTINGS, ...settings };
    const s = this.settings;
    this.hop = Math.max(16, Math.round((s.hopMs / 1000) * sampleRate));
    this.nextHop = this.hop;
    this.minLag = Math.max(2, Math.floor(sampleRate / s.searchHighestHz));
    this.maxLag = Math.ceil(sampleRate / s.searchLowestHz);
    // Two periods of the lowest searched frequency, so its octave below has
    // been searched for every note above twice that frequency.
    this.coarseWindow = 2 * this.maxLag + 4;
    this.chordWindow = Math.round((s.chordWindowMs / 1000) * sampleRate);
    this.chordMinWindow = Math.round((s.chordMinWindowMs / 1000) * sampleRate);
    this.strumSpread = Math.round((s.strumSpreadMs / 1000) * sampleRate);
    this.strumSettle = Math.round((s.strumSettleMs / 1000) * sampleRate);
    let size = 1;
    while (
      size < Math.max(this.coarseWindow, this.chordWindow) + Math.ceil(0.1 * sampleRate) + 4 * this.hop
    ) size <<= 1;
    this.history = new Float64Array(size);
    this.mask = size - 1;
    this.detector = new PeriodDetector(this.coarseWindow, this.maxLag);
    this.scratch = new Float64Array(this.coarseWindow);
    this.chordAnalyzer = new GuitarChordAnalyzer(sampleRate, this.chordWindow, {
      minMidi: s.minMidi,
      maxMidi: s.maxMidi,
      maxNotes: s.maxChordNotes,
    });
    this.chordScratch = new Float64Array(this.chordWindow);
    // A first-order high-pass at about 10 Hz: a DC offset would keep the NSDF from ever turning negative.
    this.pole = 1 - (2 * Math.PI * 10) / sampleRate;
  }

  /** The lowest note that was last written and still sounds, as sounding MIDI. */
  get soundingMidi() {
    return this.sounding.length > 0 ? this.sounding[0]! : null;
  }

  /** Every note that was last written and still sounds, lowest first. */
  get soundingMidis(): readonly number[] {
    return this.sounding;
  }

  get detectsChords() {
    return this.chordDetection;
  }

  /** Switches between one note per attack and every string of a strum. Takes effect with the next attack. */
  setChordDetection(on: boolean) {
    this.chordDetection = on;
    if (!on) {
      this.chordPending = false;
      this.fallback = null;
    }
  }

  get lockedMidi() {
    return this.lockedMidiValue;
  }

  get seconds() {
    return this.time / this.sampleRate;
  }

  reset() {
    this.time = 0;
    this.nextHop = this.hop;
    this.hopIndex = 0;
    this.hopPeak = 0;
    this.levels = [];
    this.hasSignal = false;
    this.analysisStart = 0;
    this.lastAttack = Number.NEGATIVE_INFINITY;
    this.pendingAttack = false;
    this.sounding = [];
    this.chordPending = false;
    this.fallback = null;
    this.blockerIn = 0;
    this.blockerOut = 0;
    this.levelDb = -140;
    this.peakDb = -140;
    this.history.fill(0);
    this.unlock();
  }

  /** Feeds samples and returns the note events they completed. */
  process(samples: ArrayLike<number>): TrackedNoteEvent[] {
    this.events = [];
    for (let index = 0; index < samples.length; index += 1) {
      const raw = Number(samples[index]) || 0;
      const filtered = raw - this.blockerIn + this.pole * this.blockerOut;
      this.blockerIn = raw;
      this.blockerOut = filtered;
      this.history[this.time & this.mask] = filtered;
      const magnitude = Math.abs(raw);
      if (magnitude > this.hopPeak) this.hopPeak = magnitude;
      this.time += 1;
      if (this.time >= this.nextHop) {
        this.analyze(this.nextHop);
        this.nextHop += this.hop;
      }
    }
    return this.events;
  }

  private timeMs(end: number) {
    return (end / this.sampleRate) * 1000;
  }

  private analyze(end: number) {
    const s = this.settings;
    this.hopIndex += 1;
    this.peakDb = this.hopPeak > 0 ? 20 * Math.log10(this.hopPeak) : -140;
    this.hopPeak = 0;
    const period = this.lockedFrequency ? this.sampleRate / this.lockedFrequency : 0;
    const levelLength = Math.min(
      Math.max(Math.floor(0.02 * this.sampleRate), Math.floor(2 * period)),
      Math.floor(0.1 * this.sampleRate),
    );
    const meanSquare = this.sumOfSquares(end, levelLength) / levelLength;
    this.levelDb = meanSquare > 1e-14 ? 10 * Math.log10(meanSquare) : -140;
    const rms = Math.sqrt(meanSquare);
    this.levels.push(rms);
    if (this.levels.length > 17) this.levels.splice(0, this.levels.length - 17);

    if (!this.hasSignal) {
      if (this.levelDb <= s.gateOnDb) return;
      this.hasSignal = true;
      // Only an abrupt rise is a played note. A hum that is there from the
      // start, or a level that creeps up, opens the gate without an attack.
      if (this.isAbruptRise(rms)) this.attack(end);
    } else if (this.levelDb < s.gateOffDb) {
      this.close(end);
      return;
    } else if (
      end - this.lastAttack > (s.attackSpacingMs / 1000) * this.sampleRate
      && this.isAbruptRise(rms)
    ) {
      this.attack(end);
    }

    if (this.chordPending && end - this.chordStart >= this.chordWindow) this.finishChord(end, end);

    const available = end - this.analysisStart;
    if (available <= 0) return;
    const interval = this.lockedFrequency == null ? 2 : 4;
    if (this.hopIndex % interval === 0) this.coarse(end, available);
  }

  private isAbruptRise(rms: number) {
    // With a hop of 5 ms, levels[0 … 11] are the levels 80 to 25 ms ago,
    // whose windows do not overlap the current one.
    if (this.levels.length < 17) return false;
    let before = 0;
    for (let index = 0; index < 12; index += 1) before = Math.max(before, this.levels[index]!);
    return rms > this.settings.attackRatio * before;
  }

  private attack(end: number) {
    this.attackCount += 1;
    this.lastAttack = end;
    const start = end - this.hop + Math.round((this.settings.attackBlankMs / 1000) * this.sampleRate);
    if (this.chordDetection) {
      if (this.chordPending && end - this.strumStart <= this.strumSpread) {
        // A further string of the same strum: the block starts after it.
        this.chordStart = Math.max(this.chordStart, start);
      } else {
        // A new attack before the block was complete: read what there is.
        if (this.chordPending) this.finishChord(end - this.rise, end);
        this.chordPending = true;
        this.strumStart = end;
        this.chordStart = Math.max(start, end + this.strumSettle);
      }
      this.fallback = null;
    }
    this.pendingAttack = true;
    this.analysisStart = start;
    this.unlock();
  }

  /** The level is measured over 20 ms, so an attack is seen up to this long after it began. */
  private get rise() {
    return Math.round(0.025 * this.sampleRate);
  }

  private close(end: number) {
    if (this.chordPending) this.finishChord(end - this.rise, end);
    this.hasSignal = false;
    this.pendingAttack = false;
    this.unlock();
    if (this.sounding.length > 0) {
      const timeMs = this.timeMs(end);
      for (const midi of this.sounding) this.events.push({ type: 'note-off', midi, timeMs });
      this.sounding = [];
    }
  }

  /**
   * Reads the block after a strum, up to `blockEnd`, and writes what it holds.
   * One string or none in the block leaves the answer to the period estimate,
   * which is the better judge of a single note.
   */
  private finishChord(blockEnd: number, end: number) {
    this.chordPending = false;
    const length = Math.min(blockEnd - this.chordStart, this.chordWindow);
    let notes: Array<{ midi: number; frequency: number }> = [];
    if (length >= this.chordMinWindow) {
      notes = this.chordAnalyzer.analyze(this.copy(blockEnd, length, this.chordScratch));
    }
    if (notes.length < 2 && this.fallback) notes = [this.fallback];
    this.fallback = null;
    this.pendingAttack = false;
    if (notes.length > 0) this.write(notes, end, 'attack');
  }

  private write(notes: Array<{ midi: number; frequency: number }>, end: number, trigger: GuitarNoteTrigger) {
    const timeMs = this.timeMs(end);
    for (const midi of this.sounding) this.events.push({ type: 'note-off', midi, timeMs });
    this.sounding = notes.map((note) => note.midi);
    for (const note of notes) {
      this.events.push({ type: 'note-on', midi: note.midi, frequency: note.frequency, timeMs, trigger });
    }
  }

  private unlock() {
    this.lockedFrequency = null;
    this.lockedMidiValue = null;
    this.candidates = [];
    this.foreign = [];
    this.missed = 0;
  }

  private coarse(end: number, available: number) {
    const s = this.settings;
    const length = Math.min(available, this.coarseWindow);
    if (length < 4 * this.minLag) return;
    const estimate = this.detector.estimate(this.copy(end, length), this.minLag, this.maxLag);
    if (!estimate) {
      this.miss(length >= this.coarseWindow);
      return;
    }
    // Not yet: the block has not seen the octave below, so this could be an overtone.
    if (!(2 * estimate.lag <= estimate.searchedUpTo || estimate.searchedUpTo >= this.maxLag)) return;
    const needed = this.lockedFrequency == null ? s.lockClarity : s.keepClarity;
    if (estimate.clarity < needed || estimate.lag >= this.maxLag - 1) {
      this.miss(true);
      return;
    }
    const frequency = this.sampleRate / estimate.lag;
    this.missed = 0;
    if (this.lockedFrequency == null) {
      this.candidates.push(frequency);
      if (this.candidates.length > s.lockEstimates) this.candidates.shift();
      if (this.candidates.length === s.lockEstimates) {
        const median = agreeingMedian(this.candidates, s.agreementCents);
        if (median != null) this.lock(median, end, this.pendingAttack ? 'attack' : 'legato');
      }
      return;
    }
    const distance = centsBetween(frequency, this.lockedFrequency);
    if (Math.abs(distance) < s.sameNoteCents || isHarmonicInterval(distance)) {
      // The locked note, or an overtone or undertone of it, such as the octave
      // while a low string rings out. Ignored until the next attack.
      this.foreign = [];
      return;
    }
    this.foreign.push(frequency);
    if (this.foreign.length > s.legatoEstimates) this.foreign.shift();
    if (this.foreign.length === s.legatoEstimates) {
      const median = agreeingMedian(this.foreign, s.agreementCents);
      if (median != null) this.lock(median, end, this.pendingAttack ? 'attack' : 'legato');
    }
  }

  private miss(certain: boolean) {
    if (!certain) return;
    if (this.lockedFrequency == null) {
      this.candidates = [];
      return;
    }
    this.missed += 1;
    if (this.missed >= this.settings.missesToRelease) this.unlock();
  }

  private lock(frequency: number, end: number, trigger: GuitarNoteTrigger) {
    const s = this.settings;
    const midi = Math.round(frequencyToMidi(frequency));
    this.candidates = [];
    this.foreign = [];
    this.missed = 0;
    if (midi < s.minMidi || midi > s.maxMidi) return;
    this.lockedFrequency = frequency;
    this.lockedMidiValue = midi;
    if (this.chordPending) {
      // The strum is still being collected; this is the answer if it turns out to be one string.
      this.fallback = { midi, frequency };
      return;
    }
    // A note is written after an attack, or when the pitch changes to a
    // different note while one sounds (hammer-on, pull-off, slide). A lock
    // without either, such as a hum or the same string found again after a
    // weak stretch, writes nothing. While a chord sounds the period estimate
    // describes no single string, so it writes nothing either.
    const write = this.pendingAttack
      || (this.sounding.length === 1 && this.sounding[0] !== midi);
    if (!write) return;
    this.pendingAttack = false;
    this.write([{ midi, frequency }], end, trigger);
  }

  private sumOfSquares(end: number, count: number) {
    let sum = 0;
    for (let index = end - count; index < end; index += 1) {
      const value = this.history[index & this.mask]!;
      sum += value * value;
    }
    return sum;
  }

  /** The `count` filtered samples before `end`. */
  private copy(end: number, count: number, into: Float64Array = this.scratch) {
    const out = into.subarray(0, count);
    const start = end - count;
    for (let index = 0; index < count; index += 1) out[index] = this.history[(start + index) & this.mask]!;
    return out;
  }
}
