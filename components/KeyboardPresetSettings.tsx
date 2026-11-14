'use client';

import { useEffect, useState } from 'react';

import { useI18n } from '@/lib/i18n';
import {
  DEFAULT_KEYBOARD_PRESET,
  KEYBOARD_PRESETS,
  KEYBOARD_PRESET_LABELS,
  describeKeyboardPreset,
  getActiveKeyboardPreset,
  isKeyboardPreset,
  setActiveKeyboardPreset,
  type KeyboardPresetId,
} from '@/src/score-input/keyboard-preset';

export default function KeyboardPresetSettings() {
  const { t } = useI18n();
  const [preset, setPreset] = useState<KeyboardPresetId>(DEFAULT_KEYBOARD_PRESET);

  // The stored choice is read after mount so the server-rendered markup matches.
  useEffect(() => {
    setPreset(getActiveKeyboardPreset());
  }, []);

  return (
    <div className="hidden items-center md:flex">
      <label className="sr-only" htmlFor="nex-note-keyboard-preset">{t('app.keyboardPreset')}</label>
      <select
        id="nex-note-keyboard-preset"
        aria-label={t('app.keyboardPreset')}
        value={preset}
        onChange={(event) => {
          if (!isKeyboardPreset(event.target.value)) return;
          setActiveKeyboardPreset(event.target.value);
          setPreset(event.target.value);
          // Hand the focus back so the next key goes to the score, not to this menu.
          event.target.blur();
        }}
        className="h-8 max-w-[11rem] rounded-md border border-nex-border bg-white px-2 text-xs font-medium text-slate-600 outline-none transition-colors hover:border-slate-300 focus:border-nex-accent"
        title={`${t('app.keyboardPreset')}\n${describeKeyboardPreset(preset)}`}
      >
        {KEYBOARD_PRESETS.map((id) => (
          <option key={id} value={id}>{`⌨ ${KEYBOARD_PRESET_LABELS[id]}`}</option>
        ))}
      </select>
    </div>
  );
}
