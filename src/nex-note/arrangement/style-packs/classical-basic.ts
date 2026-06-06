import { buildWrittenPitch } from '@/src/nex-note/arrangement/pitch';
import type { ArrangementStylePack } from '@/src/nex-note/arrangement/spec';

export const CLASSICAL_BASIC_STYLE_PACK: ArrangementStylePack = {
  id: 'classical-basic',
  label: 'Classical Basic',
  description: 'Conservative tonal three-part writing with strict perfect-consonance handling.',
  defaults: {
    texture: 'homophonic-block',
    harmonicMode: 'conservative',
    harmonicRhythm: '1-per-bar',
    melodyPlacement: 'top',
    constraints: {
      avoidParallelFifthsOctaves: true,
      avoidHiddenParallels: true,
      preferStepwiseInnerVoices: true,
      spacing: 'close',
      maxIntervalBetweenTopVoices: 12,
      omissionPriority: ['5th', 'root', '7th', '3rd'],
      bassPolicy: 'explicit',
      parallelPerfectPolicy: 'error',
      instrumentRanges: {
        voice1: { min: buildWrittenPitch('C', 4), max: buildWrittenPitch('C', 6) },
        voice2: { min: buildWrittenPitch('G', 3), max: buildWrittenPitch('G', 5) },
        voice3: { min: buildWrittenPitch('C', 3), max: buildWrittenPitch('C', 5) },
      },
    },
  },
};
