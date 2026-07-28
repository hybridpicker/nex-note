import { createRandomId } from '@/lib/random-id';

export interface EditPreset {
  id: string;
  name: string;
  operations: unknown[];
  createdAt: number;
}

export const BUILT_IN_PRESETS: EditPreset[] = [
  { id: 'builtin-clean', name: 'Clean score', operations: [{ type: 'removeArticulations' }], createdAt: 0 },
  { id: 'builtin-slow', name: 'Rehearsal tempo (♩=80)', operations: [{ type: 'setTempo', bpm: 80 }], createdAt: 0 },
  {
    id: 'builtin-practice-pack',
    name: 'Practice version',
    operations: [
      { type: 'setTempo', bpm: 80 },
      { type: 'addRehearsalMarksEvery', interval: 4, style: 'letters' },
      { type: 'applyPracticeProfile', profile: 'rehearsal' },
    ],
    createdAt: 0,
  },
  {
    id: 'builtin-roomy-layout',
    name: 'Roomy layout',
    operations: [{ type: 'applyPracticeProfile', profile: 'roomy' }],
    createdAt: 0,
  },
  { id: 'builtin-fast', name: 'Performance tempo (♩=120)', operations: [{ type: 'setTempo', bpm: 120 }], createdAt: 0 },
  { id: 'builtin-repeat', name: 'Add start repeat', operations: [{ type: 'addStartRepeat' }], createdAt: 0 },
  { id: 'builtin-cmaj', name: 'Key: C major', operations: [{ type: 'setKey', fifths: 0 }], createdAt: 0 },
  { id: 'builtin-gmaj', name: 'Key: G major', operations: [{ type: 'setKey', fifths: 1 }], createdAt: 0 },
  { id: 'builtin-dmaj', name: 'Key: D major', operations: [{ type: 'setKey', fifths: 2 }], createdAt: 0 },
  { id: 'builtin-amaj', name: 'Key: A major', operations: [{ type: 'setKey', fifths: 3 }], createdAt: 0 },
  { id: 'builtin-fmaj', name: 'Key: F major', operations: [{ type: 'setKey', fifths: -1 }], createdAt: 0 },
  { id: 'builtin-bbmaj', name: 'Key: Bb major', operations: [{ type: 'setKey', fifths: -2 }], createdAt: 0 },
];

const KEY = 'nex-note:presets';

export function getUserPresets(): EditPreset[] {
  if (typeof localStorage === 'undefined') return [];
  try {
    return JSON.parse(localStorage.getItem(KEY) ?? '[]');
  } catch {
    return [];
  }
}

export function saveUserPreset(name: string, operations: unknown[]): EditPreset {
  const presets = getUserPresets();
  const preset: EditPreset = {
    id: createRandomId(),
    name,
    operations,
    createdAt: Date.now(),
  };
  presets.push(preset);
  localStorage.setItem(KEY, JSON.stringify(presets));
  return preset;
}

export function deleteUserPreset(id: string): void {
  const presets = getUserPresets().filter(p => p.id !== id);
  localStorage.setItem(KEY, JSON.stringify(presets));
}
