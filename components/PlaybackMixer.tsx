'use client';

import { useEffect, useMemo, useState } from 'react';
import type { PartNode } from '@/src/score-core/model/types';
import {
  MAX_CHANNEL_VOLUME,
  getChannel,
  updateChannel,
  type MixerChannel,
  type MixerState,
} from '@/lib/playback-mixer';

interface PlaybackMixerProps {
  parts: readonly Pick<PartNode, 'id' | 'name'>[];
  onChange: (state: MixerState) => void;
}

/** Compact per-part mixer (volume, mute, solo) shown as a popover next to the playback controls. */
export default function PlaybackMixer({ parts, onChange }: PlaybackMixerProps) {
  const [state, setState] = useState<MixerState>({});

  useEffect(() => { onChange(state); }, [onChange, state]);

  const anyActive = useMemo(
    () => Object.values(state).some((channel) => channel.mute || channel.solo || channel.volume !== 1),
    [state],
  );

  if (parts.length === 0) return null;

  const patch = (partId: string, change: Partial<MixerChannel>) => {
    setState((current) => updateChannel(current, partId, change));
  };

  return (
    <details className="relative hidden shrink-0 sm:block" data-testid="playback-mixer">
      <summary
        className={`flex h-8 cursor-pointer list-none items-center rounded-md px-2 text-[11px] font-semibold ${anyActive ? 'text-nex-accent' : 'text-slate-600'}`}
        title="Playback mixer: volume, mute and solo per part"
      >
        Mixer
      </summary>
      <div className="absolute left-0 top-9 z-50 w-72 rounded-lg border border-slate-200 bg-white p-2 shadow-lg">
        {parts.map((part) => {
          const channel = getChannel(state, part.id);
          return (
            <div key={part.id} className="flex items-center gap-2 py-1">
              <span className="w-24 truncate text-[11px] text-slate-700" title={part.name}>{part.name || part.id}</span>
              <input
                type="range"
                min={0}
                max={MAX_CHANNEL_VOLUME}
                step={0.05}
                value={channel.volume}
                onChange={(event) => patch(part.id, { volume: Number(event.target.value) })}
                className="h-1 w-20 cursor-pointer accent-nex-accent"
                aria-label={`${part.name} volume`}
              />
              <button
                type="button"
                aria-pressed={channel.mute}
                onClick={() => patch(part.id, { mute: !channel.mute })}
                className={`h-6 w-6 rounded text-[11px] font-bold ${channel.mute ? 'bg-red-100 text-red-700' : 'text-slate-500 hover:bg-slate-100'}`}
                title="Mute"
              >
                M
              </button>
              <button
                type="button"
                aria-pressed={channel.solo}
                onClick={() => patch(part.id, { solo: !channel.solo })}
                className={`h-6 w-6 rounded text-[11px] font-bold ${channel.solo ? 'bg-amber-100 text-amber-700' : 'text-slate-500 hover:bg-slate-100'}`}
                title="Solo"
              >
                S
              </button>
            </div>
          );
        })}
      </div>
    </details>
  );
}
