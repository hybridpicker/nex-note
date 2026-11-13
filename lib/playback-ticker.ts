// The audio scheduler's heartbeat. It must not depend on painting: requestAnimationFrame stops in
// hidden tabs, minimised or occluded Electron windows and backgrounded WKWebViews, and stalls
// whenever a frame is slow. A timer inside a dedicated worker keeps ticking in all of these; its
// message still needs the main thread, so the scheduler's look-ahead covers short main-thread
// blocks. Where workers are unavailable (tests, locked-down embeds) a main-thread interval is used.

export interface PlaybackTicker {
  readonly kind: 'worker' | 'interval';
  start(): void;
  stop(): void;
  dispose(): void;
}

const WORKER_SOURCE = `
let timer = null;
onmessage = (event) => {
  const message = event.data || {};
  if (timer !== null) { clearInterval(timer); timer = null; }
  if (message.type === 'start') timer = setInterval(() => postMessage(0), message.intervalMs);
};
`;

export function createPlaybackTicker(onTick: () => void, intervalMs = 25): PlaybackTicker {
  let worker: Worker | null = null;
  let workerUrl: string | null = null;
  let interval: ReturnType<typeof setInterval> | null = null;
  let running = false;

  try {
    if (typeof Worker === 'function' && typeof Blob === 'function' && typeof URL?.createObjectURL === 'function') {
      workerUrl = URL.createObjectURL(new Blob([WORKER_SOURCE], { type: 'text/javascript' }));
      worker = new Worker(workerUrl);
      worker.onmessage = () => {
        if (running) onTick();
      };
      worker.onerror = () => {
        // Fall back to a main-thread interval if the worker dies.
        worker?.terminate();
        worker = null;
        if (running) {
          interval = setInterval(() => { if (running) onTick(); }, intervalMs);
        }
      };
    }
  } catch {
    worker = null;
    if (workerUrl) URL.revokeObjectURL(workerUrl);
    workerUrl = null;
  }

  return {
    get kind() {
      return worker ? 'worker' as const : 'interval' as const;
    },
    start() {
      if (running) return;
      running = true;
      if (worker) {
        worker.postMessage({ type: 'start', intervalMs });
      } else {
        interval = setInterval(() => { if (running) onTick(); }, intervalMs);
      }
    },
    stop() {
      running = false;
      worker?.postMessage({ type: 'stop' });
      if (interval !== null) clearInterval(interval);
      interval = null;
    },
    dispose() {
      running = false;
      if (interval !== null) clearInterval(interval);
      interval = null;
      worker?.terminate();
      worker = null;
      if (workerUrl) URL.revokeObjectURL(workerUrl);
      workerUrl = null;
    },
  };
}
