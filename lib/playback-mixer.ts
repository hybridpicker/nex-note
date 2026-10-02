// Per-part playback mixer state: volume, mute and solo. Pure functions so the scheduler and the UI
// share one definition of "audible" (DAW semantics: any solo silences every non-soloed part).
export interface MixerChannel {
  volume: number; // 0..MAX_CHANNEL_VOLUME, 1 = unity
  mute: boolean;
  solo: boolean;
}

export type MixerState = Record<string, MixerChannel>;

export const MAX_CHANNEL_VOLUME = 1.5;
export const DEFAULT_CHANNEL: MixerChannel = { volume: 1, mute: false, solo: false };

function clampVolume(volume: number) {
  if (!Number.isFinite(volume)) return 1;
  return Math.min(MAX_CHANNEL_VOLUME, Math.max(0, volume));
}

export function getChannel(state: MixerState, partId: string): MixerChannel {
  return state[partId] ?? DEFAULT_CHANNEL;
}

export function updateChannel(state: MixerState, partId: string, patch: Partial<MixerChannel>): MixerState {
  const next = { ...getChannel(state, partId), ...patch };
  next.volume = clampVolume(next.volume);
  return { ...state, [partId]: next };
}

export function hasSolo(state: MixerState) {
  return Object.values(state).some((channel) => channel.solo);
}

/** Gain multiplier for notes of a part; 0 means the note must not be scheduled at all. */
export function channelGainFactor(state: MixerState, partId: string | null | undefined): number {
  if (!partId) return hasSolo(state) ? 0 : 1;
  const channel = getChannel(state, partId);
  if (channel.mute) return 0;
  if (hasSolo(state) && !channel.solo) return 0;
  return clampVolume(channel.volume);
}
