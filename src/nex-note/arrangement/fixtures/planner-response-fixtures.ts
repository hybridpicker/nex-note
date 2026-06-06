import { buildWrittenPitch } from '@/src/nex-note/arrangement/pitch';
import type { PlannerResponse, CriticIssue } from '@/src/nex-note/arrangement/spec';
import { getArrangementStylePack } from '@/src/nex-note/arrangement/style-packs';

export interface PlannerResponseFixture {
  name: string;
  response: PlannerResponse;
  expectedIssueCodes: CriticIssue['code'][];
}

const CLASSICAL_DEFAULTS = getArrangementStylePack('classical-basic').defaults;
const GENERALBASS_DEFAULTS = getArrangementStylePack('generalbass').defaults;
const JAZZ_DEFAULTS = getArrangementStylePack('jazz-close').defaults;

export const PLANNER_RESPONSE_FIXTURES: PlannerResponseFixture[] = [
  {
    name: 'classical-authentic-cadence-valid',
    expectedIssueCodes: [],
    response: {
      plannerVersion: '0.1.0-fixture',
      spec: {
        sourceMelody: { source: 'chat-inline', description: 'C major cadence' },
        stylePack: 'classical-basic',
        tonalCenter: { tonic: { step: 'C', alter: 0 }, mode: 'major' },
        ...CLASSICAL_DEFAULTS,
      },
      harmonicPlanCandidates: [
        {
          candidateId: 'harm-classical-1',
          summary: 'Simple authentic cadence in C major',
          confidence: 'high',
          segments: [
            { segmentId: 'seg-i', measure: 1, beatNum: 1, beatDen: 4, chosen: 'I', functionLabel: 'tonic', durationBeats: 2 },
            { segmentId: 'seg-v', measure: 1, beatNum: 3, beatDen: 4, chosen: 'G', functionLabel: 'dominant', durationBeats: 1 },
            { segmentId: 'seg-i-2', measure: 1, beatNum: 4, beatDen: 4, chosen: 'I', functionLabel: 'tonic', durationBeats: 1 },
          ],
        },
      ],
      voicingCandidates: [
        {
          candidateId: 'voice-classical-1',
          basedOnHarmonicCandidateId: 'harm-classical-1',
          summary: 'Three-part cadence with resolved leading tone',
          confidence: 'high',
          slices: [
            {
              measure: 1,
              beatNum: 1,
              beatDen: 4,
              harmony: 'C',
              functionLabel: 'tonic',
              harmonicSegmentId: 'seg-i',
              voices: [
                { voiceIndex: 1, role: 'melody', pitch: buildWrittenPitch('E', 5) },
                { voiceIndex: 2, role: 'inner', pitch: buildWrittenPitch('C', 5) },
                { voiceIndex: 3, role: 'bass', pitch: buildWrittenPitch('G', 4) },
              ],
            },
            {
              measure: 1,
              beatNum: 3,
              beatDen: 4,
              harmony: 'G',
              functionLabel: 'dominant',
              harmonicSegmentId: 'seg-v',
              voices: [
                { voiceIndex: 1, role: 'melody', pitch: buildWrittenPitch('B', 4) },
                { voiceIndex: 2, role: 'inner', pitch: buildWrittenPitch('G', 4) },
                { voiceIndex: 3, role: 'bass', pitch: buildWrittenPitch('D', 4) },
              ],
            },
            {
              measure: 1,
              beatNum: 4,
              beatDen: 4,
              harmony: 'C',
              functionLabel: 'tonic',
              harmonicSegmentId: 'seg-i-2',
              voices: [
                { voiceIndex: 1, role: 'melody', pitch: buildWrittenPitch('C', 5) },
                { voiceIndex: 2, role: 'inner', pitch: buildWrittenPitch('G', 4) },
                { voiceIndex: 3, role: 'bass', pitch: buildWrittenPitch('E', 4) },
              ],
            },
          ],
        },
      ],
      notes: ['Fixture for planner-contract validation and tonic resolution.'],
    },
  },
  {
    name: 'classical-dominant-errors-invalid',
    expectedIssueCodes: ['doubled-leading-tone', 'unresolved-leading-tone', 'unresolved-leading-tone'],
    response: {
      plannerVersion: '0.1.0-fixture',
      spec: {
        sourceMelody: { source: 'chat-inline', description: 'Dominant tension without proper resolution' },
        stylePack: 'classical-basic',
        tonalCenter: { tonic: { step: 'C', alter: 0 }, mode: 'major' },
        ...CLASSICAL_DEFAULTS,
      },
      harmonicPlanCandidates: [
        {
          candidateId: 'harm-classical-2',
          summary: 'Dominant to tonic with intentional errors',
          confidence: 'medium',
          segments: [
            { segmentId: 'seg-v-bad', measure: 2, beatNum: 1, beatDen: 4, chosen: 'G', functionLabel: 'dominant', durationBeats: 2 },
            { segmentId: 'seg-i-bad', measure: 2, beatNum: 3, beatDen: 4, chosen: 'I', functionLabel: 'tonic', durationBeats: 2 },
          ],
        },
      ],
      voicingCandidates: [
        {
          candidateId: 'voice-classical-2',
          basedOnHarmonicCandidateId: 'harm-classical-2',
          summary: 'Intentional doubled leading tone and failed resolution',
          confidence: 'medium',
          slices: [
            {
              measure: 2,
              beatNum: 1,
              beatDen: 4,
              harmony: 'G',
              functionLabel: 'dominant',
              harmonicSegmentId: 'seg-v-bad',
              voices: [
                { voiceIndex: 1, role: 'melody', pitch: buildWrittenPitch('B', 4) },
                { voiceIndex: 2, role: 'inner', pitch: buildWrittenPitch('G', 4) },
                { voiceIndex: 3, role: 'bass', pitch: buildWrittenPitch('B', 3) },
              ],
            },
            {
              measure: 2,
              beatNum: 3,
              beatDen: 4,
              harmony: 'C',
              functionLabel: 'tonic',
              harmonicSegmentId: 'seg-i-bad',
              voices: [
                { voiceIndex: 1, role: 'melody', pitch: buildWrittenPitch('D', 5) },
                { voiceIndex: 2, role: 'inner', pitch: buildWrittenPitch('G', 4) },
                { voiceIndex: 3, role: 'bass', pitch: buildWrittenPitch('E', 4) },
              ],
            },
          ],
        },
      ],
      notes: ['Fixture intentionally violates classical leading-tone rules.'],
    },
  },
  {
    name: 'jazz-ii-v-i-close-valid',
    expectedIssueCodes: [],
    response: {
      plannerVersion: '0.1.0-fixture',
      spec: {
        sourceMelody: { source: 'chat-inline', description: 'ii-V-I in C major' },
        stylePack: 'jazz-close',
        tonalCenter: { tonic: { step: 'C', alter: 0 }, mode: 'major' },
        ...JAZZ_DEFAULTS,
      },
      harmonicPlanCandidates: [
        {
          candidateId: 'harm-jazz-1',
          summary: 'Compact ii-V-I turnaround',
          confidence: 'high',
          segments: [
            { segmentId: 'seg-ii', measure: 1, beatNum: 1, beatDen: 4, chosen: 'Dm7', functionLabel: 'predominant', durationBeats: 2 },
            { segmentId: 'seg-v7', measure: 1, beatNum: 3, beatDen: 4, chosen: 'G7', functionLabel: 'dominant', durationBeats: 2 },
            { segmentId: 'seg-i6', measure: 2, beatNum: 1, beatDen: 4, chosen: 'Cmaj6', functionLabel: 'tonic', durationBeats: 4 },
          ],
        },
      ],
      voicingCandidates: [
        {
          candidateId: 'voice-jazz-1',
          basedOnHarmonicCandidateId: 'harm-jazz-1',
          summary: 'Melody-led close voicing with external bass assumption',
          confidence: 'high',
          slices: [
            {
              measure: 1,
              beatNum: 1,
              beatDen: 4,
              harmony: 'Dm7',
              functionLabel: 'predominant',
              harmonicSegmentId: 'seg-ii',
              voices: [
                { voiceIndex: 1, role: 'melody', pitch: buildWrittenPitch('F', 5) },
                { voiceIndex: 2, role: 'inner', pitch: buildWrittenPitch('C', 5) },
                { voiceIndex: 3, role: 'bass', pitch: buildWrittenPitch('A', 4) },
              ],
            },
            {
              measure: 1,
              beatNum: 3,
              beatDen: 4,
              harmony: 'G7',
              functionLabel: 'dominant',
              harmonicSegmentId: 'seg-v7',
              voices: [
                { voiceIndex: 1, role: 'melody', pitch: buildWrittenPitch('F', 5) },
                { voiceIndex: 2, role: 'inner', pitch: buildWrittenPitch('B', 4) },
                { voiceIndex: 3, role: 'bass', pitch: buildWrittenPitch('D', 4) },
              ],
            },
            {
              measure: 2,
              beatNum: 1,
              beatDen: 4,
              harmony: 'Cmaj6',
              functionLabel: 'tonic',
              harmonicSegmentId: 'seg-i6',
              voices: [
                { voiceIndex: 1, role: 'melody', pitch: buildWrittenPitch('E', 5) },
                { voiceIndex: 2, role: 'inner', pitch: buildWrittenPitch('A', 4) },
                { voiceIndex: 3, role: 'bass', pitch: buildWrittenPitch('C', 4) },
              ],
            },
          ],
        },
      ],
      notes: ['Fixture mirrors the future planner JSON shape without live LLM calls.'],
    },
  },
  {
    name: 'generalbass-outer-voice-valid',
    expectedIssueCodes: [],
    response: {
      plannerVersion: '0.1.0-fixture',
      spec: {
        sourceMelody: { source: 'chat-inline', description: 'Simple outer-voice motion' },
        stylePack: 'generalbass',
        tonalCenter: { tonic: { step: 'G', alter: 0 }, mode: 'major' },
        ...GENERALBASS_DEFAULTS,
      },
      harmonicPlanCandidates: [
        {
          candidateId: 'harm-gb-1',
          summary: 'I-IV-V-I bass framework in G major',
          confidence: 'high',
          segments: [
            { segmentId: 'seg-g-i', measure: 1, beatNum: 1, beatDen: 4, chosen: 'G', functionLabel: 'tonic', durationBeats: 1 },
            { segmentId: 'seg-g-iv', measure: 1, beatNum: 2, beatDen: 4, chosen: 'C', functionLabel: 'predominant', durationBeats: 1 },
            { segmentId: 'seg-g-v', measure: 1, beatNum: 3, beatDen: 4, chosen: 'D', functionLabel: 'dominant', durationBeats: 1 },
            { segmentId: 'seg-g-i2', measure: 1, beatNum: 4, beatDen: 4, chosen: 'G', functionLabel: 'tonic', durationBeats: 1 },
          ],
        },
      ],
      voicingCandidates: [
        {
          candidateId: 'voice-gb-1',
          basedOnHarmonicCandidateId: 'harm-gb-1',
          summary: 'Outer voices lead, middle fills conservatively',
          confidence: 'high',
          slices: [
            {
              measure: 1,
              beatNum: 1,
              beatDen: 4,
              harmony: 'G',
              functionLabel: 'tonic',
              harmonicSegmentId: 'seg-g-i',
              voices: [
                { voiceIndex: 1, role: 'melody', pitch: buildWrittenPitch('D', 5) },
                { voiceIndex: 2, role: 'inner', pitch: buildWrittenPitch('B', 4) },
                { voiceIndex: 3, role: 'bass', pitch: buildWrittenPitch('G', 3) },
              ],
            },
            {
              measure: 1,
              beatNum: 2,
              beatDen: 4,
              harmony: 'C',
              functionLabel: 'predominant',
              harmonicSegmentId: 'seg-g-iv',
              voices: [
                { voiceIndex: 1, role: 'melody', pitch: buildWrittenPitch('E', 5) },
                { voiceIndex: 2, role: 'inner', pitch: buildWrittenPitch('C', 5) },
                { voiceIndex: 3, role: 'bass', pitch: buildWrittenPitch('G', 3) },
              ],
            },
            {
              measure: 1,
              beatNum: 3,
              beatDen: 4,
              harmony: 'D',
              functionLabel: 'dominant',
              harmonicSegmentId: 'seg-g-v',
              voices: [
                { voiceIndex: 1, role: 'melody', pitch: buildWrittenPitch('F', 5, 1) },
                { voiceIndex: 2, role: 'inner', pitch: buildWrittenPitch('A', 4) },
                { voiceIndex: 3, role: 'bass', pitch: buildWrittenPitch('D', 3) },
              ],
            },
            {
              measure: 1,
              beatNum: 4,
              beatDen: 4,
              harmony: 'G',
              functionLabel: 'tonic',
              harmonicSegmentId: 'seg-g-i2',
              voices: [
                { voiceIndex: 1, role: 'melody', pitch: buildWrittenPitch('G', 5) },
                { voiceIndex: 2, role: 'inner', pitch: buildWrittenPitch('B', 4) },
                { voiceIndex: 3, role: 'bass', pitch: buildWrittenPitch('G', 3) },
              ],
            },
          ],
        },
      ],
      notes: ['Generalbass fixture keeps the outer voices explicit for later bass-policy tests.'],
    },
  },
];
