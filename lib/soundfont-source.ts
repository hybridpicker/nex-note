/**
 * Where playback samples may come from.
 *
 * Every surface first loads the bundled FluidR3_GM samples from `/soundfonts/FluidR3_GM`
 * (Releases ship them). Only when those are missing does `soundfont-player` fall back to its
 * remote default, the MusyngKite set on https://gleitz.github.io/midi-js-soundfonts/ (GitHub
 * Pages). The desktop app never makes that third-party request: without local samples it plays
 * the built-in oscillator instead. The Browser Preview keeps the remote fallback.
 */

export const REMOTE_SOUNDFONT_HOST = 'gleitz.github.io';

export function allowRemoteSoundfontFallback(scope: unknown = typeof window === 'undefined' ? undefined : window) {
  if (!scope || typeof scope !== 'object') return true;
  const bridge = (scope as { nexNoteElectron?: { isElectron?: unknown } }).nexNoteElectron;
  return !(bridge && bridge.isElectron === true);
}
