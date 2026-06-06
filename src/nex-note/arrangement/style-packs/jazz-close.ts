import { buildWrittenPitch } from '@/src/nex-note/arrangement/pitch';
import type { ArrangementStylePack } from '@/src/nex-note/arrangement/spec';

export const JAZZ_CLOSE_STYLE_PACK: ArrangementStylePack = {
  id: 'jazz-close',
  label: 'Jazz Close',
  description: 'Top-down melody-led close voicings with shell-tone priorities and lighter parallel policing.',
  defaults: {
    texture: 'homophonic-block',
    harmonicMode: 'reharm-light',
    harmonicRhythm: '2-per-bar',
    melodyPlacement: 'top',
    constraints: {
      avoidParallelFifthsOctaves: false,
      avoidHiddenParallels: false,
      preferStepwiseInnerVoices: true,
      spacing: 'close',
      maxIntervalBetweenTopVoices: 10,
      omissionPriority: ['root', '5th', '7th', '3rd'],
      bassPolicy: 'external',
      parallelPerfectPolicy: 'warning',
      instrumentRanges: {
        voice1: { min: buildWrittenPitch('B', 3), max: buildWrittenPitch('D', 6) },
        voice2: { min: buildWrittenPitch('G', 3), max: buildWrittenPitch('B', 5) },
        voice3: { min: buildWrittenPitch('D', 3), max: buildWrittenPitch('G', 5) },
      },
    },
  },
};
