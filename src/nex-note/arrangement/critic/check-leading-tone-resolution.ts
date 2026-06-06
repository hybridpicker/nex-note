import {
  buildLeadingToneSpelling,
  isDominantFunction,
  matchesPitchClassSpelling,
  tonicPitchClassMatches,
} from '@/src/nex-note/arrangement/harmony';
import type { ArrangementSpec, ArrangementStylePack, CriticIssue, VoicingPlan } from '@/src/nex-note/arrangement/spec';

export function checkLeadingToneResolution(params: {
  spec: ArrangementSpec;
  voicingPlan: VoicingPlan;
  stylePack: ArrangementStylePack;
}): CriticIssue[] {
  const { spec, voicingPlan, stylePack } = params;
  if (stylePack.id !== 'classical-basic' || !spec.tonalCenter) return [];

  const leadingTone = buildLeadingToneSpelling(spec.tonalCenter);
  const issues: CriticIssue[] = [];
  for (let sliceIndex = 0; sliceIndex < voicingPlan.slices.length - 1; sliceIndex += 1) {
    const currentSlice = voicingPlan.slices[sliceIndex];
    const nextSlice = voicingPlan.slices[sliceIndex + 1];
    if (!isDominantFunction(currentSlice.functionLabel)) continue;

    currentSlice.voices.forEach((voice) => {
      if (!voice.pitch || !matchesPitchClassSpelling(voice.pitch, leadingTone)) return;
      const nextVoice = nextSlice.voices.find((candidate) => candidate.voiceIndex === voice.voiceIndex);
      if (nextVoice?.pitch && tonicPitchClassMatches(nextVoice.pitch, spec.tonalCenter)) return;
      issues.push({
        code: 'unresolved-leading-tone',
        severity: 'error',
        ruleId: 'leading-tone-resolution',
        location: {
          measure: nextSlice.measure,
          beatNum: nextSlice.beatNum,
          beatDen: nextSlice.beatDen,
          sliceIndex: sliceIndex + 1,
          voices: [voice.voiceIndex],
        },
        message: `Leading tone in voice ${voice.voiceIndex} does not resolve to the tonic in the following slice.`,
      });
    });
  }

  return issues;
}
