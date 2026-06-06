import { buildLeadingToneSpelling, isDominantFunction, matchesPitchClassSpelling } from '@/src/nex-note/arrangement/harmony';
import type { ArrangementSpec, ArrangementStylePack, CriticIssue, VoicingPlan } from '@/src/nex-note/arrangement/spec';

export function checkHarmonicDoubling(params: {
  spec: ArrangementSpec;
  voicingPlan: VoicingPlan;
  stylePack: ArrangementStylePack;
}): CriticIssue[] {
  const { spec, voicingPlan, stylePack } = params;
  if (stylePack.id !== 'classical-basic' || !spec.tonalCenter) return [];

  const leadingTone = buildLeadingToneSpelling(spec.tonalCenter);
  const issues: CriticIssue[] = [];

  voicingPlan.slices.forEach((slice, sliceIndex) => {
    if (!isDominantFunction(slice.functionLabel)) return;
    const doubledLeadingToneVoices = slice.voices
      .filter((voice) => voice.pitch && matchesPitchClassSpelling(voice.pitch, leadingTone))
      .map((voice) => voice.voiceIndex);
    if (doubledLeadingToneVoices.length < 2) return;

    issues.push({
      code: 'doubled-leading-tone',
      severity: 'error',
      ruleId: 'harmonic-doubling',
      location: {
        measure: slice.measure,
        beatNum: slice.beatNum,
        beatDen: slice.beatDen,
        sliceIndex,
        voices: doubledLeadingToneVoices,
      },
      message: `Dominant sonority doubles the leading tone in voices ${doubledLeadingToneVoices.join(', ')}.`,
    });
  });

  return issues;
}
