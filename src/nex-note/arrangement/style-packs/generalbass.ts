import { buildWrittenPitch } from '@/src/nex-note/arrangement/pitch';
import type { ArrangementStylePack } from '@/src/nex-note/arrangement/spec';

export const GENERALBASS_STYLE_PACK: ArrangementStylePack = {
  id: 'generalbass',
  label: 'Generalbass',
  description: 'Outer-voice-led realization with explicit bass support and strict consonance control.',
  defaults: {
    texture: 'mixed-melody-accompanied',
    harmonicMode: 'conservative',
    harmonicRhythm: 'follow-melody-accents',
    melodyPlacement: 'top',
    constraints: {
      avoidParallelFifthsOctaves: true,
      avoidHiddenParallels: true,
      preferStepwiseInnerVoices: true,
      spacing: 'open',
      maxIntervalBetweenTopVoices: 14,
      omissionPriority: ['5th', '7th', 'root', '3rd'],
      bassPolicy: 'explicit',
      parallelPerfectPolicy: 'error',
      instrumentRanges: {
        voice1: { min: buildWrittenPitch('C', 4), max: buildWrittenPitch('A', 5) },
        voice2: { min: buildWrittenPitch('F', 3), max: buildWrittenPitch('E', 5) },
        voice3: { min: buildWrittenPitch('C', 2), max: buildWrittenPitch('D', 4) },
      },
    },
  },
};
