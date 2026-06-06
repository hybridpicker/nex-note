import { recordBugReportEvent } from '@/lib/bug-report-recorder';
import { readClientDebugOverride } from '@/lib/debug-flags';

type LogLevel = 'log' | 'info' | 'warn' | 'error' | 'debug';

const DEV_DEFAULT_DEBUG = false;

export function isDebugEnabled() {
  const override = readClientDebugOverride();
  if (override === 'true') return true;
  if (override === 'false') return false;
  if (process.env.NEXT_PUBLIC_DEBUG === 'true') return true;
  return DEV_DEFAULT_DEBUG;
}

function formatPrefix(scope: string) {
  const ts = new Date().toISOString().slice(11, 23); // HH:MM:SS.mmm
  return `${ts} [nex-note:${scope}]`;
}

function log(level: LogLevel, scope: string, ...args: unknown[]) {
  if (!isDebugEnabled()) return;
  const prefix = formatPrefix(scope);
  recordBugReportEvent('debug', `${scope}:${level}`, {
    message: args.map((entry) => {
      if (typeof entry === 'string') return entry;
      try {
        return JSON.stringify(entry);
      } catch {
        return String(entry);
      }
    }),
  });

  if (typeof window === 'undefined') {
    // eslint-disable-next-line no-console
    console[level](prefix, ...args);
    return;
  }

  // eslint-disable-next-line no-console
  console[level](`%c${prefix}`, 'color:#2563eb;font-weight:bold', ...args);
}

export const dbg = {
  enabled: () => isDebugEnabled(),
  playback: (...args: unknown[]) => log('log', 'playback', ...args),
  midi:     (...args: unknown[]) => log('log', 'midi',     ...args),
  editor:   (...args: unknown[]) => log('log', 'editor',   ...args),
  score:    (...args: unknown[]) => log('log', 'score',    ...args),
  info:     (scope: string, ...args: unknown[]) => log('info', scope, ...args),
  debug:    (scope: string, ...args: unknown[]) => log('debug', scope, ...args),
  warn:     (scope: string, ...args: unknown[]) => log('warn',  scope, ...args),
  error:    (scope: string, ...args: unknown[]) => log('error', scope, ...args),
};

/** Call in browser console to toggle debug mode without restarting:
 *  enableDebug() / disableDebug() / resetDebug()
 */
if (typeof window !== 'undefined') {
  (window as unknown as Record<string, unknown>).enableDebug = () => {
    localStorage.setItem('nex-note:debug', 'true');
    location.reload();
  };
  (window as unknown as Record<string, unknown>).disableDebug = () => {
    localStorage.setItem('nex-note:debug', 'false');
    location.reload();
  };
  (window as unknown as Record<string, unknown>).resetDebug = () => {
    localStorage.removeItem('nex-note:debug');
    location.reload();
  };
}
