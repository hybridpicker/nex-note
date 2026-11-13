// The audible clock: the AudioContext time the listener hears at a given moment.
//
// `AudioContext.currentTime` is the time the audio graph is rendering, which reaches the ear
// `baseLatency + outputLatency` later (tens of milliseconds on built-in speakers, 150-300 ms on
// Bluetooth). It also advances in render-callback steps. The playhead must follow what is heard,
// smoothly, so it reads this clock instead:
// 1. `getOutputTimestamp()` when the engine provides a usable one: it pairs a context time with
//    the performance.now() time at which that sample leaves the output device, and extrapolates
//    smoothly between audio callbacks.
// 2. Otherwise `currentTime`, extrapolated between its steps, minus the declared latencies.
// A user calibration (for example a Bluetooth headset that under-reports its delay) is added on
// top. It is an addition for unusual outputs, not the mechanism that aligns picture and sound.

export interface AudibleClockSource {
  currentTime: number;
  state?: string;
  baseLatency?: number;
  outputLatency?: number;
  getOutputTimestamp?: () => { contextTime?: number; performanceTime?: number };
}

export interface AudibleClock {
  /** Context time heard at performance time `atMs` (defaults to now). */
  audibleTime(atMs?: number): number;
  /** Seconds between rendering and hearing, as last estimated. */
  latencySeconds(): number;
  /** Which source the last estimate used. */
  source(): 'output-timestamp' | 'declared-latency';
}

// The output timestamp may lag the render clock by at most this much before it is distrusted.
const MAX_PLAUSIBLE_LATENCY_S = 1.0;
// Between render callbacks currentTime is extrapolated for at most this long.
const MAX_EXTRAPOLATION_S = 0.1;

function finite(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value);
}

export function declaredOutputLatencySeconds(source: Pick<AudibleClockSource, 'baseLatency' | 'outputLatency'>) {
  const base = finite(source.baseLatency) && source.baseLatency > 0 ? source.baseLatency : 0;
  const output = finite(source.outputLatency) && source.outputLatency > 0 ? source.outputLatency : 0;
  return base + output;
}

export function createAudibleClock(
  ac: AudibleClockSource,
  options?: {
    now?: () => number;
    /** Extra delay of the output in seconds (user calibration). */
    calibrationSeconds?: () => number;
  },
): AudibleClock {
  const now = options?.now ?? (() => performance.now());
  let anchor: { contextTime: number; perfMs: number } | null = null;
  let lastLatency = declaredOutputLatencySeconds(ac);
  let lastSource: ReturnType<AudibleClock['source']> = 'declared-latency';

  const renderTimeAt = (perfMs: number, nowMs: number) => {
    const current = ac.currentTime;
    if (!anchor || current !== anchor.contextTime) anchor = { contextTime: current, perfMs: nowMs };
    const elapsed = Math.min(Math.max(0, (nowMs - anchor.perfMs) / 1000), MAX_EXTRAPOLATION_S);
    return anchor.contextTime + elapsed + (perfMs - nowMs) / 1000;
  };

  const audibleTime = (atMs?: number) => {
    const nowMs = now();
    const perfMs = atMs ?? nowMs;
    const calibration = options?.calibrationSeconds?.() ?? 0;
    const renderTime = renderTimeAt(perfMs, nowMs);
    let timestamp: { contextTime?: number; performanceTime?: number } | undefined;
    try {
      timestamp = ac.getOutputTimestamp?.();
    } catch {
      timestamp = undefined;
    }
    if (timestamp && finite(timestamp.contextTime) && finite(timestamp.performanceTime)
      && timestamp.performanceTime > 0 && timestamp.contextTime > 0) {
      const audible = timestamp.contextTime + (perfMs - timestamp.performanceTime) / 1000;
      const latency = renderTime - audible;
      if (latency > -0.005 && latency < MAX_PLAUSIBLE_LATENCY_S) {
        lastLatency = Math.max(0, latency);
        lastSource = 'output-timestamp';
        return audible - calibration;
      }
    }
    lastLatency = declaredOutputLatencySeconds(ac);
    lastSource = 'declared-latency';
    return renderTime - lastLatency - calibration;
  };

  return {
    audibleTime,
    latencySeconds: () => lastLatency + (options?.calibrationSeconds?.() ?? 0),
    source: () => lastSource,
  };
}

// ── User latency calibration ─────────────────────────────────────────────────────────────
// Extra output delay the engine does not report (some Bluetooth headsets). Positive values
// move the picture later. Stored per device; 0 by default.

export const PLAYBACK_LATENCY_CALIBRATION_KEY = 'nex-note:playback-latency-ms';
export const MAX_PLAYBACK_LATENCY_CALIBRATION_MS = 500;
let cachedCalibrationMs: number | null = null;

function clampCalibrationMs(value: number) {
  if (!Number.isFinite(value)) return 0;
  return Math.max(-MAX_PLAYBACK_LATENCY_CALIBRATION_MS, Math.min(MAX_PLAYBACK_LATENCY_CALIBRATION_MS, Math.round(value)));
}

export function readPlaybackLatencyCalibrationMs() {
  if (cachedCalibrationMs != null) return cachedCalibrationMs;
  let value = 0;
  try {
    value = clampCalibrationMs(Number.parseFloat(globalThis.localStorage?.getItem(PLAYBACK_LATENCY_CALIBRATION_KEY) ?? '0'));
  } catch {
    value = 0;
  }
  cachedCalibrationMs = value;
  return value;
}

export function readPlaybackLatencyCalibrationSeconds() {
  return readPlaybackLatencyCalibrationMs() / 1000;
}

export function writePlaybackLatencyCalibrationMs(value: number) {
  cachedCalibrationMs = clampCalibrationMs(value);
  try {
    globalThis.localStorage?.setItem(PLAYBACK_LATENCY_CALIBRATION_KEY, String(cachedCalibrationMs));
  } catch {
    // Private mode: keep the value for this session.
  }
  return cachedCalibrationMs;
}
