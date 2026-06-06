import type { ArrangementSpec, CriticReport, VoicingPlan } from '@/src/nex-note/arrangement/spec';
import { getArrangementStylePack } from '@/src/nex-note/arrangement/style-packs';
import { checkParallelPerfectIntervals } from '@/src/nex-note/arrangement/critic/check-parallel-perfect-intervals';
import { checkVoiceGeometry } from '@/src/nex-note/arrangement/critic/check-voice-geometry';
import { checkHarmonicDoubling } from '@/src/nex-note/arrangement/critic/check-harmonic-doubling';
import { checkLeadingToneResolution } from '@/src/nex-note/arrangement/critic/check-leading-tone-resolution';

export function runArrangementCritic(params: {
  spec: ArrangementSpec;
  voicingPlan: VoicingPlan;
}): CriticReport {
  const { spec, voicingPlan } = params;
  const stylePack = getArrangementStylePack(spec.stylePack);
  const issues = [
    ...checkParallelPerfectIntervals({
      voicingPlan,
      stylePack,
      constraints: spec.constraints,
    }),
    ...checkVoiceGeometry({
      voicingPlan,
      stylePack,
      constraints: spec.constraints,
    }),
    ...checkHarmonicDoubling({
      spec,
      voicingPlan,
      stylePack,
    }),
    ...checkLeadingToneResolution({
      spec,
      voicingPlan,
      stylePack,
    }),
  ].sort((left, right) => (
    left.location.measure - right.location.measure
    || left.location.sliceIndex - right.location.sliceIndex
    || left.location.beatNum * right.location.beatDen - right.location.beatNum * left.location.beatDen
    || left.location.voices[0]! - right.location.voices[0]!
    || left.code.localeCompare(right.code)
  ));

  const errorCount = issues.filter((issue) => issue.severity === 'error').length;
  const warningCount = issues.length - errorCount;
  return {
    stylePack: spec.stylePack,
    valid: errorCount === 0,
    inspectedSlices: voicingPlan.slices.length,
    issues,
    errorCount,
    warningCount,
  };
}
