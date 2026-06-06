import { pitchLabel, pitchToMidi, semitoneDistance } from '@/src/nex-note/arrangement/pitch';
import { isPitchWithinRange } from '@/src/nex-note/arrangement/harmony';
import type { ArrangementConstraints, ArrangementStylePack, CriticIssue, VoicingPlan } from '@/src/nex-note/arrangement/spec';

function resolveRangeSeverity(stylePack: ArrangementStylePack) {
  return stylePack.id === 'jazz-close' ? 'warning' : 'error';
}

function resolveSpacingSeverity(stylePack: ArrangementStylePack) {
  return stylePack.id === 'jazz-close' ? 'warning' : 'error';
}

function getRangeForVoice(
  instrumentRanges: NonNullable<ArrangementConstraints['instrumentRanges']> | undefined,
  voiceIndex: number,
) {
  if (voiceIndex === 1) return instrumentRanges?.voice1;
  if (voiceIndex === 2) return instrumentRanges?.voice2;
  if (voiceIndex === 3) return instrumentRanges?.voice3;
  if (voiceIndex === 4) return instrumentRanges?.voice4;
  return undefined;
}

export function checkVoiceGeometry(params: {
  voicingPlan: VoicingPlan;
  stylePack: ArrangementStylePack;
  constraints?: Partial<ArrangementConstraints>;
}): CriticIssue[] {
  const { voicingPlan, stylePack, constraints } = params;
  const issues: CriticIssue[] = [];
  const maxSpacing = constraints?.maxIntervalBetweenTopVoices ?? stylePack.defaults.constraints.maxIntervalBetweenTopVoices;
  const instrumentRanges = constraints?.instrumentRanges ?? stylePack.defaults.constraints.instrumentRanges;
  const spacingMode = constraints?.spacing ?? stylePack.defaults.constraints.spacing;

  voicingPlan.slices.forEach((slice, sliceIndex) => {
    const orderedVoices = [...slice.voices].sort((a, b) => a.voiceIndex - b.voiceIndex);
    orderedVoices.forEach((voice) => {
      if (!voice.pitch) return;
      const range = getRangeForVoice(instrumentRanges, voice.voiceIndex);
      if (!range || isPitchWithinRange(voice.pitch, range)) return;
      issues.push({
        code: 'voice-range',
        severity: resolveRangeSeverity(stylePack),
        ruleId: 'voice-range',
        location: {
          measure: slice.measure,
          beatNum: slice.beatNum,
          beatDen: slice.beatDen,
          sliceIndex,
          voices: [voice.voiceIndex],
        },
        message: `Voice ${voice.voiceIndex} exceeds its configured range with ${pitchLabel(voice.pitch)}.`,
      });
    });

    for (let index = 0; index < orderedVoices.length - 1; index += 1) {
      const upper = orderedVoices[index];
      const lower = orderedVoices[index + 1];
      if (!upper?.pitch || !lower?.pitch) continue;

      const upperMidi = pitchToMidi(upper.pitch);
      const lowerMidi = pitchToMidi(lower.pitch);
      if (upperMidi < lowerMidi) {
        issues.push({
          code: 'voice-crossing',
          severity: 'error',
          ruleId: 'voice-geometry',
          location: {
            measure: slice.measure,
            beatNum: slice.beatNum,
            beatDen: slice.beatDen,
            sliceIndex,
            voices: [upper.voiceIndex, lower.voiceIndex],
          },
          message: `Voice crossing between voices ${upper.voiceIndex} and ${lower.voiceIndex}: ${pitchLabel(upper.pitch)} below ${pitchLabel(lower.pitch)}.`,
        });
        continue;
      }

      const shouldCheckSpacing = spacingMode === 'close' || index === 0;
      if (shouldCheckSpacing && typeof maxSpacing === 'number' && semitoneDistance(lower.pitch, upper.pitch) > maxSpacing) {
        issues.push({
          code: 'voice-spacing',
          severity: resolveSpacingSeverity(stylePack),
          ruleId: 'voice-geometry',
          location: {
            measure: slice.measure,
            beatNum: slice.beatNum,
            beatDen: slice.beatDen,
            sliceIndex,
            voices: [upper.voiceIndex, lower.voiceIndex],
          },
          message: `Voices ${upper.voiceIndex} and ${lower.voiceIndex} exceed the configured spacing with ${semitoneDistance(lower.pitch, upper.pitch)} semitones.`,
        });
      }
    }
  });

  return issues;
}
