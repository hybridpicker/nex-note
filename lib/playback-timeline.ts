// The authoritative playback timeline. Audio scheduling, the metronome, the playhead, the
// played-note highlight and start-from-selection all map between score seconds and score
// positions through this one module, so they cannot disagree.
//
// Units:
// - score seconds: time from the start of the piece at the written tempo (the MIDI timeline,
//   after swing). The tempo override scales score seconds to AudioContext seconds.
// - beats: quarter notes from the start of the piece, following the MIDI tempo map.
// - wholes: a position inside a measure in whole notes, the unit of score event timestamps
//   (`timestampNum / timestampDen`) and of OSMD source timestamps.

export interface TempoEntry {
  bpm: number;
  /** Score seconds at which this tempo starts. */
  time: number;
}

export interface TimelineMeasureRange {
  measureNumber: number;
  startBeat: number;
  endBeat: number;
  /** Time signature of the measure, when known. */
  beats?: number;
  beatType?: number;
}

export interface TimelineSpan extends TimelineMeasureRange {
  /** Position of this pass through the measure in playback order (repeats unrolled). */
  index: number;
  startSeconds: number;
  endSeconds: number;
  lengthWholes: number;
}

export interface PlaybackLocation {
  spanIndex: number;
  measureNumber: number;
  /** Position inside the measure in whole notes. */
  positionWholes: number;
  /** Fraction of the measure, 0..1. */
  progress: number;
  /** Quarter beats from the start of the piece (straight, swing removed). */
  beats: number;
  seconds: number;
}

export interface MetronomeClick {
  seconds: number;
  downbeat: boolean;
}

export interface PlaybackSwing {
  ratio: number;
  unit: 'eighth' | '16th';
}

export interface PlaybackTimeline {
  spans: TimelineSpan[];
  durationSeconds: number;
  clicks: MetronomeClick[];
  locate(seconds: number): PlaybackLocation;
  /**
   * Score seconds of a position. A measure that sounds more than once (repeats) resolves to the
   * pass nearest to `nearSeconds`, or to the first pass.
   */
  secondsAt(measureNumber: number, positionWholes: number, nearSeconds?: number): number | null;
}

const DEFAULT_BPM = 120;

function validTempos(tempos: TempoEntry[]) {
  const usable = tempos.filter((tempo) => Number.isFinite(tempo.bpm) && tempo.bpm > 0 && Number.isFinite(tempo.time));
  return usable.length ? usable : [{ bpm: DEFAULT_BPM, time: 0 }];
}

/** Quarter beats elapsed at `seconds`, following the tempo map. Not clamped to the piece. */
export function secondsToBeats(seconds: number, tempos: TempoEntry[]): number {
  const map = validTempos(tempos);
  let remaining = Math.max(0, seconds);
  let beats = 0;
  for (let index = 0; index < map.length; index += 1) {
    const { bpm, time } = map[index]!;
    const next = map[index + 1]?.time ?? Number.POSITIVE_INFINITY;
    const segment = Math.max(0, next - time);
    if (remaining <= segment) return beats + remaining / (60 / bpm);
    beats += segment / (60 / bpm);
    remaining -= segment;
  }
  return beats + remaining / (60 / (map[map.length - 1]?.bpm ?? DEFAULT_BPM));
}

/** Score seconds at which `beats` quarter beats have elapsed. */
export function beatsToSeconds(beats: number, tempos: TempoEntry[]): number {
  const map = validTempos(tempos);
  let remaining = Math.max(0, beats);
  let cursor = 0;
  for (let index = 0; index < map.length; index += 1) {
    const { bpm } = map[index]!;
    const segmentEnd = map[index + 1]?.time ?? Number.POSITIVE_INFINITY;
    const segmentBeats = Number.isFinite(segmentEnd) ? (segmentEnd - cursor) / (60 / bpm) : Number.POSITIVE_INFINITY;
    if (remaining <= segmentBeats) return cursor + remaining * (60 / bpm);
    remaining -= segmentBeats;
    cursor = segmentEnd;
  }
  return cursor + remaining * (60 / (map[map.length - 1]?.bpm ?? DEFAULT_BPM));
}

function swingUnitBeats(unit: PlaybackSwing['unit']) {
  return unit === '16th' ? 0.25 : 0.5;
}

export function swingActive(swing: PlaybackSwing | null | undefined): swing is PlaybackSwing {
  return Boolean(swing && Number.isFinite(swing.ratio) && Math.abs(swing.ratio - 0.5) >= 0.001);
}

/**
 * Inverse of the swing applied to note onsets: maps the beat position of a swung sound back to
 * the straight position it is written at, piecewise linearly within each swing pair. With it the
 * highlight changes when a swung offbeat sounds, not when its straight position passes.
 */
export function unswingBeats(beats: number, swing: PlaybackSwing | null | undefined) {
  if (!swingActive(swing)) return beats;
  const unit = swingUnitBeats(swing.unit);
  const pair = unit * 2;
  const ratio = Math.max(0.01, Math.min(0.99, swing.ratio));
  const swungOffbeat = pair * ratio;
  const pairStart = Math.floor(beats / pair) * pair;
  const within = beats - pairStart;
  if (within < swungOffbeat) return pairStart + within * (unit / swungOffbeat);
  return pairStart + unit + (within - swungOffbeat) * ((pair - unit) / (pair - swungOffbeat));
}

export function swingBeats(beats: number, swing: PlaybackSwing | null | undefined) {
  if (!swingActive(swing)) return beats;
  const unit = swingUnitBeats(swing.unit);
  const pair = unit * 2;
  const ratio = Math.max(0.01, Math.min(0.99, swing.ratio));
  const swungOffbeat = pair * ratio;
  const pairStart = Math.floor(beats / pair) * pair;
  const within = beats - pairStart;
  if (within < unit) return pairStart + within * (swungOffbeat / unit);
  return pairStart + swungOffbeat + (within - unit) * ((pair - swungOffbeat) / (pair - unit));
}

function isCompoundMeter(beats: number, beatType: number) {
  return beatType >= 8 && beats > 3 && beats % 3 === 0;
}

/** Metronome clicks of one span: the beats of its time signature, compound meters in dotted beats. */
function spanClickBeats(span: TimelineSpan, fallback: { beats: number; beatType: number }) {
  const beats = span.beats && span.beats > 0 ? span.beats : fallback.beats;
  const beatType = span.beatType && span.beatType > 0 ? span.beatType : fallback.beatType;
  const beatLength = (4 / beatType) * (isCompoundMeter(beats, beatType) ? 3 : 1);
  const spanBeats = span.endBeat - span.startBeat;
  const nominal = (beats * 4) / beatType;
  const positions: Array<{ beats: number; downbeat: boolean }> = [];
  if (spanBeats < nominal - 1e-6) {
    // A pickup (or shortened) measure: its beats are the last beats of a full measure.
    for (let offset = nominal - beatLength; offset >= -1e-6; offset -= beatLength) {
      const position = offset - (nominal - spanBeats);
      if (position >= -1e-6) positions.unshift({ beats: span.startBeat + Math.max(0, position), downbeat: false });
    }
    return positions;
  }
  for (let offset = 0; offset < spanBeats - 1e-6; offset += beatLength) {
    positions.push({ beats: span.startBeat + offset, downbeat: offset === 0 });
  }
  return positions;
}

export function buildPlaybackTimeline(input: {
  ranges: TimelineMeasureRange[];
  tempos: TempoEntry[];
  durationSeconds: number;
  swing?: PlaybackSwing | null;
  fallbackTimeSignature?: { beats: number; beatType: number };
}): PlaybackTimeline {
  const tempos = validTempos(input.tempos);
  const swing = swingActive(input.swing) ? input.swing : null;
  const spans: TimelineSpan[] = input.ranges.map((range, index) => ({
    ...range,
    index,
    startSeconds: beatsToSeconds(range.startBeat, tempos),
    endSeconds: beatsToSeconds(range.endBeat, tempos),
    lengthWholes: Math.max(0, range.endBeat - range.startBeat) / 4,
  }));
  const durationSeconds = Math.max(0, input.durationSeconds);
  const fallbackTimeSignature = input.fallbackTimeSignature ?? { beats: 4, beatType: 4 };

  const clicks: MetronomeClick[] = spans.flatMap((span) => (
    spanClickBeats(span, fallbackTimeSignature).map((click) => ({
      seconds: beatsToSeconds(swingBeats(click.beats, swing), tempos),
      downbeat: click.downbeat,
    }))
  )).filter((click) => click.seconds <= durationSeconds + 1e-6);

  const spanIndexForBeats = (beats: number) => {
    let low = 0;
    let high = spans.length - 1;
    let found = 0;
    while (low <= high) {
      const middle = (low + high) >> 1;
      if (spans[middle]!.startBeat <= beats + 1e-9) {
        found = middle;
        low = middle + 1;
      } else {
        high = middle - 1;
      }
    }
    return found;
  };

  const locate = (seconds: number): PlaybackLocation => {
    const clamped = Math.max(0, Math.min(seconds, durationSeconds));
    const beats = unswingBeats(secondsToBeats(clamped, tempos), swing);
    if (!spans.length) {
      const measureBeats = (fallbackTimeSignature.beats * 4) / fallbackTimeSignature.beatType;
      const measureIndex = Math.floor(beats / measureBeats);
      const within = beats - measureIndex * measureBeats;
      return {
        spanIndex: measureIndex,
        measureNumber: measureIndex + 1,
        positionWholes: within / 4,
        progress: measureBeats > 0 ? within / measureBeats : 0,
        beats,
        seconds: clamped,
      };
    }
    const spanIndex = spanIndexForBeats(beats);
    const span = spans[spanIndex]!;
    const spanBeats = Math.max(span.endBeat - span.startBeat, 1e-9);
    const within = Math.max(0, Math.min(beats - span.startBeat, spanBeats));
    return {
      spanIndex,
      measureNumber: span.measureNumber,
      positionWholes: within / 4,
      progress: within / spanBeats,
      beats,
      seconds: clamped,
    };
  };

  const secondsAt = (measureNumber: number, positionWholes: number, nearSeconds?: number) => {
    const candidates = spans.filter((span) => span.measureNumber === measureNumber);
    if (!candidates.length) return null;
    const toSeconds = (span: TimelineSpan) => {
      const within = Math.max(0, Math.min(positionWholes * 4, span.endBeat - span.startBeat));
      return beatsToSeconds(swingBeats(span.startBeat + within, swing), tempos);
    };
    if (nearSeconds == null || !Number.isFinite(nearSeconds)) return Math.min(toSeconds(candidates[0]!), durationSeconds);
    let best = candidates[0]!;
    for (const span of candidates) {
      if (Math.abs(toSeconds(span) - nearSeconds) < Math.abs(toSeconds(best) - nearSeconds)) best = span;
    }
    return Math.min(toSeconds(best), durationSeconds);
  };

  return { spans, durationSeconds, clicks, locate, secondsAt };
}
