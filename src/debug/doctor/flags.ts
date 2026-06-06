import {
  isFalsyDebugValue,
  isTruthyDebugValue,
  readBooleanDebugValue,
  readVisualDebugFromParams,
} from '@/lib/debug-flags';
import type { DoctorDomain, DoctorMode, DoctorSettings } from '@/src/debug/doctor/types';

const ALL_DOMAINS: DoctorDomain[] = [
  'document',
  'input',
  'rhythm',
  'layout',
  'theory',
  'playback',
  'export',
];

function normalizeMode(value: string | null | undefined): DoctorMode | null {
  if (!value) return null;
  if (value === 'strict') return 'strict';
  if (value === 'manual') return 'manual';
  if (isTruthyDebugValue(value)) return 'live';
  if (isFalsyDebugValue(value)) return 'off';
  return 'live';
}

function parseDomains(value: string | null | undefined) {
  if (!value) return ALL_DOMAINS;
  const requested = value
    .split(',')
    .map((entry) => entry.trim())
    .filter(Boolean) as DoctorDomain[];
  const allowed = requested.filter((entry) => ALL_DOMAINS.includes(entry));
  return allowed.length > 0 ? allowed : ALL_DOMAINS;
}

export function readDoctorSettings(): DoctorSettings {
  if (typeof window !== 'undefined') {
    try {
      const params = new URLSearchParams(window.location.search);
      const doctorValue = params.get('doctor') ?? params.get('notation-doctor') ?? params.get('doctorMode');
      const debugValue = params.get('debug');
      const visualValue = readVisualDebugFromParams(params);
      const urlMode = normalizeMode(doctorValue) ?? (isTruthyDebugValue(debugValue) ? 'live' : null);
      if (urlMode) {
        return {
          enabled: urlMode !== 'off',
          mode: urlMode,
          domains: parseDomains(params.get('doctor-rules') ?? params.get('doctorRules') ?? doctorValue),
          strict: urlMode === 'strict',
          visual: visualValue ?? false,
          source: 'url',
        };
      }
    } catch {
      // Ignore URL parsing failures and keep falling through.
    }

    try {
      const storedMode = localStorage.getItem('nex-note:doctor');
      const mode = normalizeMode(storedMode);
      if (mode) {
        return {
          enabled: mode !== 'off',
          mode,
          domains: parseDomains(localStorage.getItem('nex-note:doctor-rules')),
          strict: mode === 'strict',
          visual: readBooleanDebugValue(localStorage.getItem('nex-note:visual-debug'))
            ?? readBooleanDebugValue(localStorage.getItem('nex-note:debug'))
            ?? false,
          source: 'local-storage',
        };
      }
    } catch {
      // Ignore localStorage failures.
    }
  }

  const envMode = normalizeMode(process.env.NEXT_PUBLIC_DOCTOR);
  if (envMode) {
    return {
      enabled: envMode !== 'off',
      mode: envMode,
      domains: parseDomains(process.env.NEXT_PUBLIC_DOCTOR_RULES),
      strict: envMode === 'strict',
      visual: process.env.NEXT_PUBLIC_VISUAL_DEBUG === 'true' || process.env.NEXT_PUBLIC_DEBUG === 'true',
      source: 'env',
    };
  }

  return {
    enabled: false,
    mode: 'off',
    domains: ALL_DOMAINS,
    strict: false,
    visual: false,
    source: 'default',
  };
}

export function isDoctorEnabled() {
  return readDoctorSettings().enabled;
}
