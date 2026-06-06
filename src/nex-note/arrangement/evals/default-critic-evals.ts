import { buildWrittenPitch } from '@/src/nex-note/arrangement/pitch';
import type { CriticEvalCase } from '@/src/nex-note/arrangement/evals/critic-eval-core';
import type { ArrangementVoiceEvent, VoicingPlan, VoicingSlice } from '@/src/nex-note/arrangement/spec';

function voice(voiceIndex: number, step: Parameters<typeof buildWrittenPitch>[0], octave: number, alter = 0): ArrangementVoiceEvent {
  return {
    voiceIndex,
    pitch: buildWrittenPitch(step, octave, alter),
  };
}

function rest(voiceIndex: number): ArrangementVoiceEvent {
  return { voiceIndex, pitch: null };
}

function slice(measure: number, beatNum: number, beatDen: number, voices: ArrangementVoiceEvent[]): VoicingSlice {
  return { measure, beatNum, beatDen, voices };
}

function plan(...slices: VoicingSlice[]): VoicingPlan {
  return {
    texture: 'homophonic-block',
    slices,
  };
}

export const DEFAULT_CRITIC_EVAL_CASES: CriticEvalCase[] = [
  {
    name: 'classical flags ascending parallel fifths',
    stylePack: 'classical-basic',
    voicingPlan: plan(
      slice(1, 1, 4, [voice(1, 'D', 5), voice(2, 'A', 4), voice(3, 'D', 4)]),
      slice(1, 2, 4, [voice(1, 'E', 5), voice(2, 'B', 4), voice(3, 'E', 4)]),
    ),
    expectedIssueCodes: ['parallel-perfect-fifth', 'parallel-perfect-octave'],
    expectedErrorCount: 2,
    expectedWarningCount: 0,
  },
  {
    name: 'classical flags descending parallel octaves',
    stylePack: 'classical-basic',
    voicingPlan: plan(
      slice(2, 1, 4, [voice(1, 'C', 5), voice(2, 'G', 4), voice(3, 'C', 4)]),
      slice(2, 2, 4, [voice(1, 'B', 4), voice(2, 'F', 4), voice(3, 'B', 3)]),
    ),
    expectedIssueCodes: ['parallel-perfect-octave'],
    expectedErrorCount: 1,
    expectedWarningCount: 0,
  },
  {
    name: 'generalbass flags outer-voice parallel fifths',
    stylePack: 'generalbass',
    voicingPlan: plan(
      slice(3, 1, 4, [voice(1, 'G', 5), voice(2, 'D', 5), voice(3, 'C', 4)]),
      slice(3, 2, 4, [voice(1, 'A', 5), voice(2, 'E', 5), voice(3, 'D', 4)]),
    ),
    expectedIssueCodes: ['parallel-perfect-fifth'],
    expectedErrorCount: 1,
    expectedWarningCount: 0,
  },
  {
    name: 'jazz-close downgrades parallel fifths to warnings',
    stylePack: 'jazz-close',
    voicingPlan: plan(
      slice(1, 1, 4, [voice(1, 'D', 5), voice(2, 'G', 4), voice(3, 'E', 4)]),
      slice(1, 2, 4, [voice(1, 'E', 5), voice(2, 'A', 4), voice(3, 'F', 4)]),
    ),
    expectedIssueCodes: ['parallel-perfect-fifth'],
    expectedErrorCount: 0,
    expectedWarningCount: 1,
  },
  {
    name: 'contrary motion avoids perfect-parallel issue',
    stylePack: 'classical-basic',
    voicingPlan: plan(
      slice(1, 1, 4, [voice(1, 'D', 5), voice(2, 'A', 4), voice(3, 'F', 4)]),
      slice(1, 2, 4, [voice(1, 'E', 5), voice(2, 'G', 4), voice(3, 'E', 4)]),
    ),
    expectedIssueCodes: [],
    expectedErrorCount: 0,
    expectedWarningCount: 0,
  },
  {
    name: 'oblique motion avoids perfect-parallel issue',
    stylePack: 'classical-basic',
    voicingPlan: plan(
      slice(1, 1, 4, [voice(1, 'D', 5), voice(2, 'A', 4), voice(3, 'D', 4)]),
      slice(1, 2, 4, [voice(1, 'E', 5), voice(2, 'A', 4), voice(3, 'D', 4)]),
    ),
    expectedIssueCodes: [],
    expectedErrorCount: 0,
    expectedWarningCount: 0,
  },
  {
    name: 'non-perfect target interval stays clean',
    stylePack: 'classical-basic',
    voicingPlan: plan(
      slice(4, 1, 4, [voice(1, 'D', 5), voice(2, 'A', 4), voice(3, 'F', 4)]),
      slice(4, 2, 4, [voice(1, 'E', 5), voice(2, 'C', 5), voice(3, 'G', 4)]),
    ),
    expectedIssueCodes: [],
    expectedErrorCount: 0,
    expectedWarningCount: 0,
  },
  {
    name: 'rests in one slice suppress perfect-parallel check',
    stylePack: 'classical-basic',
    voicingPlan: plan(
      slice(5, 1, 4, [voice(1, 'D', 5), rest(2), voice(3, 'D', 4)]),
      slice(5, 2, 4, [voice(1, 'E', 5), voice(2, 'B', 4), voice(3, 'F', 4)]),
    ),
    expectedIssueCodes: [],
    expectedErrorCount: 0,
    expectedWarningCount: 0,
  },
  {
    name: 'compound octaves still count as octaves',
    stylePack: 'classical-basic',
    voicingPlan: plan(
      slice(6, 1, 4, [voice(1, 'C', 5), voice(2, 'G', 4), voice(3, 'C', 4)]),
      slice(6, 2, 4, [voice(1, 'D', 5), voice(2, 'A', 4), voice(3, 'D', 4)]),
    ),
    expectedIssueCodes: ['parallel-perfect-fifth', 'parallel-perfect-octave'],
    expectedErrorCount: 2,
    expectedWarningCount: 0,
  },
  {
    name: 'same pair can trigger only one issue type at a time',
    stylePack: 'classical-basic',
    voicingPlan: plan(
      slice(7, 1, 4, [voice(1, 'G', 5), voice(2, 'C', 5), voice(3, 'B', 4)]),
      slice(7, 2, 4, [voice(1, 'A', 5), voice(2, 'D', 5), voice(3, 'C', 5)]),
    ),
    expectedIssueCodes: ['parallel-perfect-fifth'],
    expectedErrorCount: 1,
    expectedWarningCount: 0,
  },
  {
    name: 'descending fifths are still flagged in classical',
    stylePack: 'classical-basic',
    voicingPlan: plan(
      slice(8, 1, 4, [voice(1, 'A', 5), voice(2, 'D', 5), voice(3, 'C', 5)]),
      slice(8, 2, 4, [voice(1, 'G', 5), voice(2, 'C', 5), voice(3, 'B', 4)]),
    ),
    expectedIssueCodes: ['parallel-perfect-fifth'],
    expectedErrorCount: 1,
    expectedWarningCount: 0,
  },
  {
    name: 'jazz-close can be overridden to ignore parallels entirely',
    stylePack: 'jazz-close',
    specOverrides: {
      constraints: {
        parallelPerfectPolicy: 'ignore',
      },
    },
    voicingPlan: plan(
      slice(9, 1, 4, [voice(1, 'D', 5), voice(2, 'G', 4), voice(3, 'E', 4)]),
      slice(9, 2, 4, [voice(1, 'E', 5), voice(2, 'A', 4), voice(3, 'F', 4)]),
    ),
    expectedIssueCodes: [],
    expectedErrorCount: 0,
    expectedWarningCount: 0,
  },
  {
    name: 'voice re-ordering is not required for detection',
    stylePack: 'generalbass',
    voicingPlan: plan(
      slice(10, 1, 4, [voice(3, 'C', 4), voice(1, 'G', 5), voice(2, 'D', 5)]),
      slice(10, 2, 4, [voice(3, 'D', 4), voice(1, 'A', 5), voice(2, 'E', 5)]),
    ),
    expectedIssueCodes: ['parallel-perfect-fifth'],
    expectedErrorCount: 1,
    expectedWarningCount: 0,
  },
  {
    name: 'unisons are treated as octave-class perfect intervals',
    stylePack: 'classical-basic',
    voicingPlan: plan(
      slice(11, 1, 4, [voice(1, 'C', 5), voice(2, 'C', 5), voice(3, 'G', 4)]),
      slice(11, 2, 4, [voice(1, 'D', 5), voice(2, 'D', 5), voice(3, 'A', 4)]),
    ),
    expectedIssueCodes: ['parallel-perfect-octave'],
    expectedErrorCount: 1,
    expectedWarningCount: 0,
  },
  {
    name: 'three slices can produce repeated warnings across transitions',
    stylePack: 'jazz-close',
    voicingPlan: plan(
      slice(12, 1, 4, [voice(1, 'D', 5), voice(2, 'G', 4), voice(3, 'E', 4)]),
      slice(12, 2, 4, [voice(1, 'E', 5), voice(2, 'A', 4), voice(3, 'F', 4)]),
      slice(12, 3, 4, [voice(1, 'F', 5, 1), voice(2, 'B', 4), voice(3, 'F', 4, 1)]),
    ),
    expectedIssueCodes: ['parallel-perfect-fifth', 'parallel-perfect-fifth'],
    expectedErrorCount: 0,
    expectedWarningCount: 2,
  },
  {
    name: 'mixed perfect and imperfect transitions only flag true parallel perfects',
    stylePack: 'classical-basic',
    voicingPlan: plan(
      slice(13, 1, 4, [voice(1, 'D', 5), voice(2, 'G', 4), voice(3, 'E', 4)]),
      slice(13, 2, 4, [voice(1, 'E', 5), voice(2, 'A', 4), voice(3, 'F', 4)]),
      slice(13, 3, 4, [voice(1, 'F', 5), voice(2, 'B', 4), voice(3, 'G', 4)]),
    ),
    expectedIssueCodes: ['parallel-perfect-fifth'],
    expectedErrorCount: 1,
    expectedWarningCount: 0,
  },
  {
    name: 'classical flags a voice outside its configured range',
    stylePack: 'classical-basic',
    voicingPlan: plan(
      { ...slice(14, 1, 4, [voice(1, 'D', 6), voice(2, 'G', 5), voice(3, 'C', 5)]), harmony: 'C', functionLabel: 'tonic' },
    ),
    expectedIssueCodes: ['voice-range'],
    expectedErrorCount: 1,
    expectedWarningCount: 0,
  },
  {
    name: 'classical flags voice crossing and wide spacing together',
    stylePack: 'classical-basic',
    voicingPlan: plan(
      { ...slice(15, 1, 4, [voice(1, 'C', 5), voice(2, 'A', 3), voice(3, 'B', 3)]), harmony: 'C', functionLabel: 'tonic' },
    ),
    expectedIssueCodes: ['voice-crossing', 'voice-spacing'],
    expectedErrorCount: 2,
    expectedWarningCount: 0,
  },
  {
    name: 'classical flags a doubled leading tone in a dominant slice',
    stylePack: 'classical-basic',
    specOverrides: {
      tonalCenter: { tonic: { step: 'C', alter: 0 }, mode: 'major' },
    },
    voicingPlan: plan(
      {
        ...slice(16, 1, 4, [
          { ...voice(1, 'B', 4), role: 'melody' },
          { ...voice(2, 'G', 4), role: 'inner' },
          { ...voice(3, 'B', 3), role: 'bass' },
        ]),
        harmony: 'G',
        functionLabel: 'dominant',
      },
    ),
    expectedIssueCodes: ['doubled-leading-tone'],
    expectedErrorCount: 1,
    expectedWarningCount: 0,
  },
  {
    name: 'classical flags an unresolved leading tone after dominant function',
    stylePack: 'classical-basic',
    specOverrides: {
      tonalCenter: { tonic: { step: 'C', alter: 0 }, mode: 'major' },
    },
    voicingPlan: plan(
      { ...slice(17, 1, 4, [voice(1, 'B', 4), voice(2, 'G', 4), voice(3, 'D', 4)]), harmony: 'G', functionLabel: 'dominant' },
      { ...slice(17, 2, 4, [voice(1, 'D', 5), voice(2, 'G', 4), voice(3, 'C', 4)]), harmony: 'C', functionLabel: 'tonic' },
    ),
    expectedIssueCodes: ['unresolved-leading-tone'],
    expectedErrorCount: 1,
    expectedWarningCount: 0,
  },
];
