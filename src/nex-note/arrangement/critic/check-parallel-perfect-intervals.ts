import {
  isPerfectFifth,
  isPerfectOctaveOrUnison,
  motionDirection,
  pitchLabel,
} from '@/src/nex-note/arrangement/pitch';
import type { ArrangementConstraints, ArrangementStylePack, CriticIssue, VoicingPlan } from '@/src/nex-note/arrangement/spec';

function resolveParallelPerfectPolicy(stylePack: ArrangementStylePack, constraints?: Partial<ArrangementConstraints>) {
  return constraints?.parallelPerfectPolicy
    ?? stylePack.defaults.constraints.parallelPerfectPolicy
    ?? 'ignore';
}

function buildIssueMessage(code: CriticIssue['code'], previousLeft: string, previousRight: string, nextLeft: string, nextRight: string) {
  if (code === 'parallel-perfect-fifth') {
    return `Parallel fifth between voices: ${previousLeft}/${previousRight} -> ${nextLeft}/${nextRight}.`;
  }
  return `Parallel octave between voices: ${previousLeft}/${previousRight} -> ${nextLeft}/${nextRight}.`;
}

export function checkParallelPerfectIntervals(params: {
  voicingPlan: VoicingPlan;
  stylePack: ArrangementStylePack;
  constraints?: Partial<ArrangementConstraints>;
}): CriticIssue[] {
  const { voicingPlan, stylePack, constraints } = params;
  const policy = resolveParallelPerfectPolicy(stylePack, constraints);
  if (policy === 'ignore') return [];

  const issues: CriticIssue[] = [];
  for (let sliceIndex = 1; sliceIndex < voicingPlan.slices.length; sliceIndex += 1) {
    const previousSlice = voicingPlan.slices[sliceIndex - 1];
    const nextSlice = voicingPlan.slices[sliceIndex];
    const previousVoiceMap = new Map(previousSlice.voices.map((voice) => [voice.voiceIndex, voice]));
    const nextVoiceMap = new Map(nextSlice.voices.map((voice) => [voice.voiceIndex, voice]));
    const sharedVoiceIndexes = [...previousVoiceMap.keys()].filter((voiceIndex) => nextVoiceMap.has(voiceIndex)).sort((a, b) => a - b);

    for (let leftIndex = 0; leftIndex < sharedVoiceIndexes.length; leftIndex += 1) {
      for (let rightIndex = leftIndex + 1; rightIndex < sharedVoiceIndexes.length; rightIndex += 1) {
        const leftVoiceIndex = sharedVoiceIndexes[leftIndex]!;
        const rightVoiceIndex = sharedVoiceIndexes[rightIndex]!;
        const previousLeft = previousVoiceMap.get(leftVoiceIndex)?.pitch ?? null;
        const previousRight = previousVoiceMap.get(rightVoiceIndex)?.pitch ?? null;
        const nextLeft = nextVoiceMap.get(leftVoiceIndex)?.pitch ?? null;
        const nextRight = nextVoiceMap.get(rightVoiceIndex)?.pitch ?? null;
        if (!previousLeft || !previousRight || !nextLeft || !nextRight) continue;

        const leftMotion = motionDirection(previousLeft, nextLeft);
        const rightMotion = motionDirection(previousRight, nextRight);
        if (leftMotion === 0 || rightMotion === 0 || leftMotion !== rightMotion) continue;

        const issueCode = isPerfectFifth(previousLeft, previousRight) && isPerfectFifth(nextLeft, nextRight)
          ? 'parallel-perfect-fifth'
          : isPerfectOctaveOrUnison(previousLeft, previousRight) && isPerfectOctaveOrUnison(nextLeft, nextRight)
            ? 'parallel-perfect-octave'
            : null;
        if (!issueCode) continue;

        issues.push({
          code: issueCode,
          severity: policy,
          ruleId: 'parallel-perfect-intervals',
          location: {
            measure: nextSlice.measure,
            beatNum: nextSlice.beatNum,
            beatDen: nextSlice.beatDen,
            sliceIndex,
            voices: [leftVoiceIndex, rightVoiceIndex],
          },
          message: buildIssueMessage(
            issueCode,
            pitchLabel(previousLeft),
            pitchLabel(previousRight),
            pitchLabel(nextLeft),
            pitchLabel(nextRight),
          ),
        });
      }
    }
  }
  return issues;
}
