/** Opt-in, bounded, memory-only software timings. No score content or identifiers are collected. */
export type InputMetricStage = 'input-to-preview-frame' | 'input-to-note-frame' | 'input-to-audio-scheduled' | 'semantic-command' | 'layout-projection' | 'osmd-load' | 'osmd-render';
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
if (typeof window !== 'undefined') {
  (window as MetricWindow).__NEX_NOTE_INPUT_METRICS__ = {
    read: () => Object.fromEntries(Object.entries(samples).map(([key, values]) => [key, [...values]])),
    reset: () => { generation++; for (const key of Object.keys(samples)) delete samples[key as InputMetricStage]; latestInputAt = null; },
  };
}
