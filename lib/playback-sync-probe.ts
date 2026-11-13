// Playback sync probe: measures how far the playhead and the played-note highlight are from the
// sound the listener hears. Dormant unless installed (`?syncProbe=1`, the localStorage key
// `nex-note:sync-probe` = `1`, or `window.__NEX_NOTE_SYNC_PROBE_REQUEST__ = true` before boot).
//
// What it records:
// - every note the scheduler starts: its ideal AudioContext time and the time it was actually
//   given to the audio graph (a later time means the note was shifted late);
// - every change of the highlighted onset (measure, position in whole notes, written pitches);
// - the engraved geometry of every rendered note when playback starts;
// - one sample per animation frame, taken after the frame painted: the playhead rect and a
//   snapshot of the AudioContext output clock (`getOutputTimestamp`).
//
// `analyzePlaybackSync` turns a recording plus the expected onset sequence into offset
// statistics. Conventions (documented in docs/playback-sync.md):
// - A frame that begins at rAF time `t` is on screen at `t + frameInterval`.
// - A DOM change made at time `c` is shown by the first frame whose post-paint sample is at or
//   after `c`. Sampling after paint can credit a change to one frame early, never late, so the
//   resolution is one frame (about 16.7 ms at 60 Hz).
// - A note is audible when the output clock reaches its start time.
// Offsets are visual minus audible, in milliseconds: positive means the picture is late.

export interface SyncProbeAudioEvent {
  midi: number;
  partId?: string | null;
  scoreSeconds: number;
  /** AudioContext time the timeline asked for. */
  idealAc: number;
  /** AudioContext time the note was given to the audio graph. */
  startAc: number;
  /** AudioContext time when the scheduler handled the note. */
  nowAc: number;
  skipped?: boolean;
  at: number;
}

export interface SyncProbeVisualEvent {
  at: number;
  measureNumber: number;
  positionWholes: number;
  pitches: number[];
}

export interface SyncProbeGeometryNote {
  measureNumber: number;
  positionWholes: number;
  midi: number | null;
  x: number;
  y: number;
}

export interface SyncProbeOutputClock {
  contextTime: number;
  performanceTime: number;
  currentTime: number;
  baseLatency: number;
  outputLatency: number;
}

export interface SyncProbeFrame {
  /** rAF timestamp of the frame. */
  t: number;
  /** performance.now() of the post-paint sample. */
  sampledAt: number;
  playhead: { x: number; y: number; height: number; measureNumber: number | null } | null;
  clock: SyncProbeOutputClock | null;
}

export interface SyncProbeMark {
  at: number;
  kind: string;
  detail?: unknown;
}

export interface SyncProbeRecording {
  audio: SyncProbeAudioEvent[];
  visual: SyncProbeVisualEvent[];
  geometry: SyncProbeGeometryNote[];
  frames: SyncProbeFrame[];
  marks: SyncProbeMark[];
}

export interface SyncProbeRecorder {
  enabled: boolean;
  recording: SyncProbeRecording;
  reset(): void;
  mark(kind: string, detail?: unknown): void;
  stopSampling(): void;
  report(expected?: ExpectedOnset[]): PlaybackSyncReport;
}

type ProbeGlobal = typeof globalThis & {
  __NEX_NOTE_SYNC_PROBE__?: SyncProbeRecorder;
  __NEX_NOTE_SYNC_PROBE_REQUEST__?: boolean;
  __NEX_NOTE_SYNC_PROBE_AC__?: AudioContext | null;
};

function probeGlobal() {
  return globalThis as ProbeGlobal;
}

export function syncProbe(): SyncProbeRecorder | null {
  const probe = probeGlobal().__NEX_NOTE_SYNC_PROBE__;
  return probe?.enabled ? probe : null;
}

export function probeRegisterAudioContext(ac: AudioContext) {
  if (!syncProbe()) return;
  probeGlobal().__NEX_NOTE_SYNC_PROBE_AC__ = ac;
}

export function probeAudio(event: Omit<SyncProbeAudioEvent, 'at'>) {
  const probe = syncProbe();
  if (!probe) return;
  probe.recording.audio.push({ ...event, at: performance.now() });
}

export function probeVisual(event: Omit<SyncProbeVisualEvent, 'at'>) {
  const probe = syncProbe();
  if (!probe) return;
  const last = probe.recording.visual[probe.recording.visual.length - 1];
  if (last
    && last.measureNumber === event.measureNumber
    && Math.abs(last.positionWholes - event.positionWholes) < 1e-6
    && last.pitches.join(',') === event.pitches.join(',')) return;
  probe.recording.visual.push({ ...event, at: performance.now() });
}

export function probeGeometry(notes: SyncProbeGeometryNote[]) {
  const probe = syncProbe();
  if (!probe) return;
  probe.recording.geometry = notes;
}

const STEP_SEMITONES: Record<string, number> = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 };

/** Written MIDI pitch of a selected/rendered note; null for rests. */
export function selectedNoteMidi(note: { isRest?: boolean; step?: string; octave?: number; alter?: number }) {
  if (note.isRest || !note.step || typeof note.octave !== 'number') return null;
  const semitone = STEP_SEMITONES[note.step.toUpperCase()];
  if (semitone == null) return null;
  return (note.octave + 1) * 12 + semitone + (note.alter ?? 0);
}

export function probeMark(kind: string, detail?: unknown) {
  syncProbe()?.mark(kind, detail);
}

export function syncProbeRequested(win: Window | null | undefined = typeof window === 'undefined' ? null : window) {
  if (!win) return false;
  try {
    if ((win as unknown as ProbeGlobal).__NEX_NOTE_SYNC_PROBE_REQUEST__) return true;
    const value = new URLSearchParams(win.location.search).get('syncProbe');
    if (value === '1' || value === 'true') return true;
    return win.localStorage?.getItem('nex-note:sync-probe') === '1';
  } catch {
    return false;
  }
}

function readOutputClock(ac: AudioContext | null | undefined): SyncProbeOutputClock | null {
  if (!ac || ac.state === 'closed') return null;
  const baseLatency = Number.isFinite(ac.baseLatency) ? ac.baseLatency : 0;
  const outputLatency = Number.isFinite((ac as AudioContext & { outputLatency?: number }).outputLatency)
    ? (ac as AudioContext & { outputLatency?: number }).outputLatency ?? 0
    : 0;
  let contextTime = Number.NaN;
  let performanceTime = Number.NaN;
  try {
    const timestamp = ac.getOutputTimestamp?.();
    contextTime = timestamp?.contextTime ?? Number.NaN;
    performanceTime = timestamp?.performanceTime ?? Number.NaN;
  } catch {
    // Older WebKit has no output timestamp.
  }
  if (!Number.isFinite(contextTime) || !Number.isFinite(performanceTime) || performanceTime <= 0) {
    // Without an output timestamp, the audible time is the render clock minus the declared latency.
    contextTime = ac.currentTime - baseLatency - outputLatency;
    performanceTime = performance.now();
  }
  return {
    contextTime,
    performanceTime,
    currentTime: ac.currentTime,
    baseLatency,
    outputLatency,
  };
}

/** Installs the recorder and its per-frame sampler. Safe to call more than once. */
export function installPlaybackSyncProbe(win: Window = window): SyncProbeRecorder {
  const global = win as unknown as ProbeGlobal;
  if (global.__NEX_NOTE_SYNC_PROBE__) return global.__NEX_NOTE_SYNC_PROBE__;

  const emptyRecording = (): SyncProbeRecording => ({ audio: [], visual: [], geometry: [], frames: [], marks: [] });
  let sampling = true;
  const recorder: SyncProbeRecorder = {
    enabled: true,
    recording: emptyRecording(),
    reset() {
      const geometry = recorder.recording.geometry;
      recorder.recording = { ...emptyRecording(), geometry };
    },
    mark(kind, detail) {
      recorder.recording.marks.push({ at: win.performance.now(), kind, detail });
    },
    stopSampling() {
      sampling = false;
    },
    report(expected) {
      return analyzePlaybackSync(recorder.recording, expected ?? null);
    },
  };
  global.__NEX_NOTE_SYNC_PROBE__ = recorder;

  const sample = (frameTime: number) => {
    const ac = global.__NEX_NOTE_SYNC_PROBE_AC__ ?? null;
    const canvas = win.document.querySelector('[data-testid="score-canvas"]');
    const playhead = win.document.querySelector('[data-testid="score-playhead"]');
    let playheadSample: SyncProbeFrame['playhead'] = null;
    const playheadShown = playhead instanceof HTMLElement
      ? playhead.style.visibility !== 'hidden' && playhead.style.display !== 'none'
      : Boolean(playhead);
    if (canvas && playhead && playheadShown) {
      const canvasRect = canvas.getBoundingClientRect();
      const rect = playhead.getBoundingClientRect();
      const measure = Number.parseInt(playhead.getAttribute('data-playhead-measure') ?? '', 10);
      playheadSample = {
        x: rect.left - canvasRect.left,
        y: rect.top - canvasRect.top,
        height: rect.height,
        measureNumber: Number.isFinite(measure) ? measure : null,
      };
    }
    // Idle frames carry no information; keep the recording small.
    if (!playheadSample && !ac) return;
    recorder.recording.frames.push({
      t: frameTime,
      sampledAt: win.performance.now(),
      playhead: playheadSample,
      clock: readOutputClock(ac),
    });
  };

  const tick = (frameTime: number) => {
    if (!sampling) return;
    // Read after the frame has painted so the sample shows what this frame put on screen.
    win.setTimeout(() => sample(frameTime), 0);
    win.requestAnimationFrame(tick);
  };
  win.requestAnimationFrame(tick);
  return recorder;
}

// ── Analysis ────────────────────────────────────────────────────────────────────────────────

export interface ExpectedOnset {
  measureNumber: number;
  positionWholes: number;
  /** Sounding MIDI pitches of the onset. */
  pitches: number[];
}

export interface OffsetStats {
  count: number;
  median: number | null;
  p95Abs: number | null;
  maxAbs: number | null;
  mean: number | null;
  /** Least-squares slope of offset over playback time, in ms per minute. */
  driftMsPerMinute: number | null;
}

export interface PlaybackSyncReport {
  frameIntervalMs: number;
  frames: number;
  /**
   * Gaps between painted frames while the playhead is shown. Offsets interpolate between frames,
   * so a stalled main thread shows up here: the picture froze for that long.
   */
  frameGaps: { p95Ms: number | null; maxMs: number | null };
  audio: {
    notes: number;
    onsets: number;
    skipped: number;
    shiftedLate: number;
    maxLateMs: number;
    /** Expected onsets whose pitches never sounded in order. */
    missingOnsets: number;
  };
  highlight: OffsetStats & { missing: number };
  playhead: OffsetStats & {
    missing: number;
    /** Frames where the line moved backward on the same system: a visible jump. */
    backwardJumps: number;
  };
  start: {
    pressToFirstSoundMs: number | null;
    /** First playhead movement minus first sound; negative means it moved before the sound. */
    playheadMoveMinusSoundMs: number | null;
  } | null;
  outputLatencyMs: { base: number; output: number } | null;
  perOnset: Array<{
    index: number;
    measureNumber: number;
    positionWholes: number;
    audibleAt: number | null;
    highlightOffsetMs: number | null;
    playheadOffsetMs: number | null;
  }>;
}

const ONSET_GROUP_TOLERANCE_S = 0.003;
const LATE_SHIFT_TOLERANCE_S = 0.0005;
const POSITION_EPSILON = 1 / 1024;

function median(values: number[]) {
  if (!values.length) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[middle]! : (sorted[middle - 1]! + sorted[middle]!) / 2;
}

function percentile(values: number[], fraction: number) {
  if (!values.length) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const index = Math.min(sorted.length - 1, Math.max(0, Math.ceil(fraction * sorted.length) - 1));
  return sorted[index]!;
}

function round(value: number | null, digits = 1) {
  if (value == null || !Number.isFinite(value)) return null;
  const factor = 10 ** digits;
  return Math.round(value * factor) / factor;
}

export function summarizeOffsets(samples: Array<{ at: number; offset: number }>): OffsetStats {
  const offsets = samples.map((sample) => sample.offset);
  const abs = offsets.map((value) => Math.abs(value));
  let drift: number | null = null;
  if (samples.length >= 3) {
    const meanT = samples.reduce((sum, sample) => sum + sample.at, 0) / samples.length;
    const meanO = offsets.reduce((sum, value) => sum + value, 0) / offsets.length;
    let numerator = 0;
    let denominator = 0;
    for (const sample of samples) {
      numerator += (sample.at - meanT) * (sample.offset - meanO);
      denominator += (sample.at - meanT) ** 2;
    }
    drift = denominator > 0 ? (numerator / denominator) * 60_000 : null;
  }
  return {
    count: samples.length,
    median: round(median(offsets)),
    p95Abs: round(percentile(abs, 0.95)),
    maxAbs: round(abs.length ? Math.max(...abs) : null),
    mean: round(offsets.length ? offsets.reduce((sum, value) => sum + value, 0) / offsets.length : null),
    driftMsPerMinute: round(drift, 2),
  };
}

function estimateFrameInterval(frames: SyncProbeFrame[]) {
  const deltas: number[] = [];
  for (let index = 1; index < frames.length; index += 1) {
    const delta = frames[index]!.t - frames[index - 1]!.t;
    if (delta > 4 && delta < 100) deltas.push(delta);
  }
  return median(deltas) ?? 1000 / 60;
}

/** Converts an AudioContext time to the performance.now() time at which it is heard. */
function makeAudibleClock(frames: SyncProbeFrame[]) {
  const clocks = frames
    .map((frame) => frame.clock)
    .filter((clock): clock is SyncProbeOutputClock => Boolean(clock));
  return (contextTime: number) => {
    if (!clocks.length) return null;
    // Use the snapshot whose context time is nearest: the clocks drift against each other slowly.
    let best = clocks[0]!;
    let bestDistance = Math.abs(best.contextTime - contextTime);
    for (const clock of clocks) {
      const distance = Math.abs(clock.contextTime - contextTime);
      if (distance < bestDistance) {
        best = clock;
        bestDistance = distance;
      }
    }
    return best.performanceTime + (contextTime - best.contextTime) * 1000;
  };
}

function presentedAt(changeAt: number, frames: SyncProbeFrame[], frameInterval: number) {
  // Frames are in order; the first post-paint sample at or after the change shows it.
  let low = 0;
  let high = frames.length - 1;
  let found = -1;
  while (low <= high) {
    const middle = (low + high) >> 1;
    if (frames[middle]!.sampledAt >= changeAt) {
      found = middle;
      high = middle - 1;
    } else {
      low = middle + 1;
    }
  }
  if (found < 0) return null;
  return frames[found]!.t + frameInterval;
}

function samePitchSet(left: number[], right: number[]) {
  // Unisons of two parts sound as two notes but show as one pitch: compare distinct pitches.
  const a = [...new Set(left)].sort((x, y) => x - y);
  const b = [...new Set(right)].sort((x, y) => x - y);
  return a.length === b.length && a.every((value, index) => value === b[index]);
}

function positionsEqual(left: number, right: number) {
  return Math.abs(left - right) < POSITION_EPSILON;
}

interface AudioOnsetGroup {
  idealAc: number;
  startAc: number;
  pitches: number[];
}

function groupAudioOnsets(events: SyncProbeAudioEvent[]): AudioOnsetGroup[] {
  const played = events.filter((event) => !event.skipped).sort((a, b) => a.idealAc - b.idealAc);
  const groups: AudioOnsetGroup[] = [];
  for (const event of played) {
    const last = groups[groups.length - 1];
    if (last && Math.abs(event.idealAc - last.idealAc) <= ONSET_GROUP_TOLERANCE_S) {
      last.pitches.push(event.midi);
      last.startAc = Math.min(last.startAc, event.startAc);
      continue;
    }
    groups.push({ idealAc: event.idealAc, startAc: event.startAc, pitches: [event.midi] });
  }
  return groups;
}

/** Engraved x of an onset: the median notehead centre of the onset's notes in that measure. */
function onsetX(geometry: SyncProbeGeometryNote[], onset: ExpectedOnset) {
  const xs = geometry
    .filter((note) => note.measureNumber === onset.measureNumber && positionsEqual(note.positionWholes, onset.positionWholes))
    .map((note) => note.x);
  return median(xs);
}

function playheadReachedAt(
  frames: SyncProbeFrame[],
  fromIndex: number,
  measureNumber: number,
  x: number,
  frameInterval: number,
) {
  for (let index = Math.max(fromIndex, 0); index < frames.length; index += 1) {
    const frame = frames[index]!;
    const playhead = frame.playhead;
    if (!playhead || playhead.measureNumber == null) continue;
    const reached = playhead.measureNumber === measureNumber
      ? playhead.x >= x - 0.5
      : false;
    if (!reached) continue;
    const previous = frames[index - 1];
    const previousPlayhead = previous?.playhead;
    const presentedNow = frame.t + frameInterval;
    if (previous && previousPlayhead
      && previousPlayhead.measureNumber === measureNumber
      && previousPlayhead.x < x - 0.5
      && Math.abs(previousPlayhead.y - playhead.y) < 1
      && playhead.x > previousPlayhead.x) {
      // Between two frames the line moved continuously; credit the crossing proportionally.
      const fraction = (x - previousPlayhead.x) / (playhead.x - previousPlayhead.x);
      const presentedBefore = previous.t + frameInterval;
      return { at: presentedBefore + fraction * (presentedNow - presentedBefore), index };
    }
    return { at: presentedNow, index };
  }
  return null;
}

export function analyzePlaybackSync(
  recording: SyncProbeRecording,
  expected: ExpectedOnset[] | null,
): PlaybackSyncReport {
  const frames = [...recording.frames].sort((a, b) => a.t - b.t);
  const frameInterval = estimateFrameInterval(frames);
  const audible = makeAudibleClock(frames);
  const played = recording.audio.filter((event) => !event.skipped);
  const skipped = recording.audio.length - played.length;
  const lateShifts = played.map((event) => event.startAc - event.idealAc);
  const shiftedLate = lateShifts.filter((shift) => shift > LATE_SHIFT_TOLERANCE_S).length;
  const groups = groupAudioOnsets(recording.audio);

  const sequence: ExpectedOnset[] = expected ?? groups.map(() => ({ measureNumber: Number.NaN, positionWholes: Number.NaN, pitches: [] }));
  // Align expected onsets with sounding groups in order, matching pitch sets.
  const matchedGroups: Array<AudioOnsetGroup | null> = [];
  let groupCursor = 0;
  for (const onset of sequence) {
    if (!expected) {
      matchedGroups.push(groups[groupCursor] ?? null);
      groupCursor += 1;
      continue;
    }
    let match: AudioOnsetGroup | null = null;
    for (let look = groupCursor; look < Math.min(groups.length, groupCursor + 4); look += 1) {
      if (samePitchSet(groups[look]!.pitches, onset.pitches)) {
        match = groups[look]!;
        groupCursor = look + 1;
        break;
      }
    }
    matchedGroups.push(match);
  }

  const highlightSamples: Array<{ at: number; offset: number }> = [];
  const playheadSamples: Array<{ at: number; offset: number }> = [];
  const perOnset: PlaybackSyncReport['perOnset'] = [];
  let highlightMissing = 0;
  let playheadMissing = 0;
  let visualCursor = 0;
  let frameCursor = 0;
  const visual = [...recording.visual].sort((a, b) => a.at - b.at);
  const firstAudible = matchedGroups.find(Boolean);
  const timeOrigin = firstAudible ? audible(firstAudible.startAc) ?? 0 : 0;

  // Onsets scheduled ahead but cut off by Stop never reach the screen; they are not "missing".
  const lastShownFrame = [...frames].reverse().find((frame) => frame.playhead);
  const observedUntil = lastShownFrame ? lastShownFrame.t + frameInterval : Number.POSITIVE_INFINITY;

  sequence.forEach((onset, index) => {
    const group = matchedGroups[index];
    const audibleAt = group ? audible(group.startAc) : null;
    if (audibleAt != null && audibleAt > observedUntil) return;
    let highlightOffset: number | null = null;
    let playheadOffset: number | null = null;
    if (expected && audibleAt != null) {
      // Highlight: the first change, after the previous onset's, that shows this onset.
      for (let look = visualCursor; look < visual.length; look += 1) {
        const event = visual[look]!;
        if (event.measureNumber === onset.measureNumber && positionsEqual(event.positionWholes, onset.positionWholes)) {
          const shownAt = presentedAt(event.at, frames, frameInterval);
          if (shownAt != null && Math.abs(shownAt - audibleAt) < 2000) {
            highlightOffset = shownAt - audibleAt;
            visualCursor = look + 1;
          }
          break;
        }
        // Never search far past this onset's own time.
        if (event.at > audibleAt + 2000) break;
      }
      const x = onsetX(recording.geometry, onset);
      if (x != null) {
        const startFrame = frames.findIndex((frame) => frame.t + frameInterval >= audibleAt - 2000);
        const reached = playheadReachedAt(frames, Math.max(frameCursor, startFrame), onset.measureNumber, x, frameInterval);
        if (reached && Math.abs(reached.at - audibleAt) < 2000) {
          playheadOffset = reached.at - audibleAt;
          frameCursor = Math.max(0, reached.index - 1);
        }
      }
    }
    if (highlightOffset == null) highlightMissing += expected ? 1 : 0;
    else highlightSamples.push({ at: (audibleAt ?? 0) - timeOrigin, offset: highlightOffset });
    if (playheadOffset == null) playheadMissing += expected ? 1 : 0;
    else playheadSamples.push({ at: (audibleAt ?? 0) - timeOrigin, offset: playheadOffset });
    perOnset.push({
      index,
      measureNumber: onset.measureNumber,
      positionWholes: onset.positionWholes,
      audibleAt: round(audibleAt != null ? audibleAt - timeOrigin : null),
      highlightOffsetMs: round(highlightOffset),
      playheadOffsetMs: round(playheadOffset),
    });
  });

  const press = [...recording.marks].reverse().find((mark) => mark.kind === 'press');
  const firstSoundAt = firstAudible ? audible(firstAudible.startAc) : null;
  let start: PlaybackSyncReport['start'] = null;
  if (press && firstSoundAt != null) {
    const initial = frames.find((frame) => frame.t >= press.at && frame.playhead);
    const moved = initial
      ? frames.find((frame) => frame.t > initial.t && frame.playhead && initial.playhead
        && (Math.abs(frame.playhead.x - initial.playhead.x) > 0.5 || frame.playhead.measureNumber !== initial.playhead.measureNumber))
      : null;
    start = {
      pressToFirstSoundMs: round(firstSoundAt - press.at),
      playheadMoveMinusSoundMs: moved ? round(moved.t + frameInterval - firstSoundAt) : null,
    };
  }

  let backwardJumps = 0;
  for (let index = 1; index < frames.length; index += 1) {
    const previous = frames[index - 1]!.playhead;
    const current = frames[index]!.playhead;
    // A jump back into an earlier measure is a repeat, not a glitch.
    const sameOrLaterMeasure = previous?.measureNumber == null || current?.measureNumber == null
      || current.measureNumber >= previous.measureNumber;
    if (previous && current && sameOrLaterMeasure && Math.abs(previous.y - current.y) < 1 && current.x < previous.x - 2) backwardJumps += 1;
  }

  const shownFrames = frames.filter((frame) => frame.playhead);
  const gaps: number[] = [];
  for (let index = 1; index < shownFrames.length; index += 1) {
    const gap = shownFrames[index]!.t - shownFrames[index - 1]!.t;
    if (gap < 1000) gaps.push(gap);
  }

  const clock = frames.find((frame) => frame.clock)?.clock ?? null;
  return {
    frameIntervalMs: round(frameInterval, 2) ?? 0,
    frames: frames.length,
    frameGaps: { p95Ms: round(percentile(gaps, 0.95)), maxMs: round(gaps.length ? Math.max(...gaps) : null) },
    audio: {
      notes: played.length,
      onsets: groups.length,
      skipped,
      shiftedLate,
      maxLateMs: round(lateShifts.length ? Math.max(0, ...lateShifts) * 1000 : 0) ?? 0,
      missingOnsets: expected ? matchedGroups.filter((group) => !group).length : 0,
    },
    highlight: { ...summarizeOffsets(highlightSamples), missing: highlightMissing },
    playhead: { ...summarizeOffsets(playheadSamples), missing: playheadMissing, backwardJumps },
    start,
    outputLatencyMs: clock ? { base: round(clock.baseLatency * 1000, 2) ?? 0, output: round(clock.outputLatency * 1000, 2) ?? 0 } : null,
    perOnset,
  };
}
