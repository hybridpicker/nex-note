'use client';

import {
  Capacitor,
  SystemBars,
  SystemBarsStyle,
  SystemBarType,
} from '@capacitor/core';
import { useLayoutEffect } from 'react';

export function NativePlatformBootstrap() {
  useLayoutEffect(() => {
    if (!Capacitor.isNativePlatform()) return;

    const platform = Capacitor.getPlatform();
    document.documentElement.classList.add('nex-note-native', `nex-note-${platform}`);
    document.documentElement.dataset.nexNotePlatform = platform;

    if (platform === 'ios') {
      void Promise.all([
        SystemBars.show({ bar: SystemBarType.StatusBar, animation: 'NONE' }),
        SystemBars.setStyle({
          bar: SystemBarType.StatusBar,
          style: SystemBarsStyle.Light,
        }),
        SystemBars.setAnimation({ animation: 'NONE' }),
      ]).catch((error: unknown) => {
        console.warn('[nex-note] Could not configure the native status bar.', error);
      });
    }

    return () => {
      document.documentElement.classList.remove('nex-note-native', `nex-note-${platform}`);
      delete document.documentElement.dataset.nexNotePlatform;
    };
  }, []);

  return null;
}
