/** Opt-in, bounded, memory-only software timings. No score content or identifiers are collected. */
export type InputMetricStage = 'input-to-preview-frame' | 'input-to-note-frame' | 'input-to-pending-commit' | 'input-to-pending-frame' | 'input-to-audio-scheduled' | 'semantic-command' | 'layout-projection' | 'osmd-load' | 'osmd-render';
type MetricWindow = Window & { __NEX_NOTE_MEASURE_INPUT__?: boolean; __NEX_NOTE_INPUT_METRICS__?: { read: () => Record<string, number[]>; reset: () => void } };
const samples: Partial<Record<InputMetricStage, number[]>> = {};
let latestInputAt: number | null = null;
let generation = 0;
export type InputMetricToken = { began: number; generation: number } | null;
export function captureInputMetric(): InputMetricToken {
  return inputMetricsEnabled() && latestInputAt != null ? { began: latestInputAt, generation } : null;
}
export function inputMetricsEnabled() { return typeof window !== 'undefined' && Boolean((window as MetricWindow).__NEX_NOTE_MEASURE_INPUT__); }
export function recordInputMetric(stage: InputMetricStage, durationMs: number) {
  if (!inputMetricsEnabled() || !Number.isFinite(durationMs) || durationMs < 0) return;
  const values = samples[stage] ?? (samples[stage] = []);
  values.push(durationMs);
  if (values.length > 256) values.shift();
}
export function markInputStart() {
  if (inputMetricsEnabled()) latestInputAt = performance.now();
}
export function markInputFeedback(stage: 'input-to-preview-frame' | 'input-to-note-frame' | 'input-to-audio-scheduled', token = captureInputMetric()) {
  if (!inputMetricsEnabled() || !token || token.generation !== generation) return;
  const record = () => { if (token.generation === generation) recordInputMetric(stage, performance.now() - token.began); };
  if (stage === 'input-to-audio-scheduled') record();
  else requestAnimationFrame(() => requestAnimationFrame(record));
}
/**
 * Resolves once the next frame has been produced: an animation frame, then the first task after it.
 * Without animation frames (a hidden window) it resolves after `fallbackMs`.
 */
export function afterNextPaint(fallbackMs = 120): Promise<void> {
  return new Promise((resolve) => {
    if (typeof window === 'undefined' || typeof requestAnimationFrame !== 'function') { resolve(); return; }
    let done = false;
    const finish = () => { if (!done) { done = true; resolve(); } };
    const timer = window.setTimeout(finish, fallbackMs);
    requestAnimationFrame(() => {
      const channel = new MessageChannel();
      channel.port1.onmessage = () => { window.clearTimeout(timer); channel.port1.close(); finish(); };
      channel.port2.postMessage(0);
    });
  });
}
/** Time from the input to now, for a change that has just been written to the page. */
export function markInputCommitted(stage: 'input-to-pending-commit', token = captureInputMetric()) {
  if (!inputMetricsEnabled() || !token || token.generation !== generation) return;
  recordInputMetric(stage, performance.now() - token.began);
}
/**
 * Time from the input to the frame that shows a change made in this very task (the pending note):
 * recorded in the first task after the next animation frame. `markInputFeedback` waits for a second
 * animation frame instead, which a long task right after the first one would delay.
 */
export function markInputPainted(stage: 'input-to-pending-frame', token = captureInputMetric()) {
  if (!inputMetricsEnabled() || !token || token.generation !== generation) return;
  void afterNextPaint().then(() => { if (token.generation === generation) recordInputMetric(stage, performance.now() - token.began); });
}
if (typeof window !== 'undefined') {
  (window as MetricWindow).__NEX_NOTE_INPUT_METRICS__ = {
    read: () => Object.fromEntries(Object.entries(samples).map(([key, values]) => [key, [...values]])),
    reset: () => { generation++; for (const key of Object.keys(samples)) delete samples[key as InputMetricStage]; latestInputAt = null; },
  };
}
