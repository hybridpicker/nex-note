import type { EditorSelection } from '@/hooks/useNoteEditor';
import {
  buildArrangementHarmonyPrompt,
  buildArrangementVoicingPrompt,
  buildArrangementVoicingRepairPrompt,
  type AiSessionContext,
} from '@/lib/prompts';
import type { ProviderName } from '@/lib/ai-provider-config';
import type { AIResponse } from '@/lib/ai-providers';
import { runArrangementCritic } from '@/src/nex-note/arrangement/critic/run-arrangement-critic';
import { realizeArrangement } from '@/src/nex-note/arrangement/realizer/realize-arrangement';
import type { RealizerIssue } from '@/src/nex-note/arrangement/realizer/spec';
import { tonalCenterFromKeyFifths } from '@/src/nex-note/arrangement/harmony';
import type {
  ArrangementSpec,
  ArrangementStylePackId,
  CriticIssue,
  HarmonicPlanCandidate,
  PlannerResponse,
  VoicingCandidate,
} from '@/src/nex-note/arrangement/spec';
import { getArrangementStylePack } from '@/src/nex-note/arrangement/style-packs';
import type { ParsedIntentJson } from '@/src/nex-note/intent/parse-intent-json';
import type { DocumentState } from '@/src/score-core/commands/apply-document-commands';
import type { ScoreCommand } from '@/src/shared/schemas/score-command';
import { isLocalResponseGerman } from '@/src/nex-note/language/local-response-language';

type ArrangementAsk = (prompt: string, provider: ProviderName, ollamaModel?: string) => Promise<AIResponse>;

type InstrumentKey = 'voice' | 'flute' | 'violin' | 'clarinet-bb' | 'trumpet-bb' | 'alto-sax-eb' | 'cello';

const MAX_VOICING_RETRIES = 3;

function inferStylePack(message: string): ArrangementStylePackId {
  const normalized = message.toLowerCase();
  if (/\b(generalbass|figured bass|bezifferter bass)\b/.test(normalized)) return 'generalbass';
  if (/\b(jazz|swing|bebop|close voicing|close-voicing|drop-2|ii-v-i)\b/.test(normalized)) return 'jazz-close';
  return 'classical-basic';
}

function inferInstrument(message: string, sessionContext?: AiSessionContext): InstrumentKey | null {
  const preferred = sessionContext?.taskState?.preferredInstrument;
  if (preferred === 'voice' || preferred === 'flute' || preferred === 'violin' || preferred === 'clarinet-bb'
    || preferred === 'trumpet-bb' || preferred === 'alto-sax-eb' || preferred === 'cello') {
    return preferred;
  }
  const normalized = message.toLowerCase();
  if (/\b(voice|vocal|gesang|stimme)\b/.test(normalized)) return 'voice';
  if (/\bflute|flöte|floete\b/.test(normalized)) return 'flute';
  if (/\bviolin|geige\b/.test(normalized)) return 'violin';
  if (/\bclarinet|klarinette\b/.test(normalized)) return 'clarinet-bb';
  if (/\btrumpet|trompete\b/.test(normalized)) return 'trumpet-bb';
  if (/\balto sax|altsax|alto-sax|saxophon\b/.test(normalized)) return 'alto-sax-eb';
  if (/\bcello\b/.test(normalized)) return 'cello';
  return null;
}

function detectArrangementTempo(message: string) {
  const normalized = message.toLowerCase();
  if (/\b(slow|ruhig|calm|ballad|adagio|langsam)\b/.test(normalized)) return 72;
  if (/\b(bright|lebhaft|upbeat|animato|quick|schnell)\b/.test(normalized)) return 116;
  if (/\b(moderate|moderat|moderato)\b/.test(normalized)) return 96;
  return null;
}

function detectExpressionText(message: string, german: boolean) {
  const normalized = message.toLowerCase();
  if (/\b(dolce|zart|tender|lyrical|lyrisch)\b/.test(normalized)) return 'dolce';
  if (/\b(leggiero|leicht|light)\b/.test(normalized)) return 'leggiero';
  if (/\b(espressivo|expressive|ausdrucksvoll)\b/.test(normalized)) return 'espressivo';
  if (/\b(cantabile|gesanglich|singable|singbar|melodie)\b/.test(normalized)) return 'cantabile';
  return german ? 'cantabile' : 'cantabile';
}

function getDocumentKeyFifths(documentState: DocumentState) {
  const core = documentState.coreDocument;
  if (!core) return 0;
  for (const part of core.score.parts) {
    for (const staff of part.staves) {
      const sortedMeasures = [...staff.measures].sort((a, b) => a.measureNumber - b.measureNumber);
      for (const measure of sortedMeasures) {
        const fifths = measure.attributes.find((attribute) => typeof attribute.keyFifths === 'number')?.keyFifths;
        if (typeof fifths === 'number') return fifths;
      }
    }
  }
  return 0;
}

function selectMelodyProjection(context: {
  melodicContext?: {
    selectedMelody?: { preview: string; abcSnippet?: string };
    primaryVoice?: { preview: string; abcSnippet?: string };
    voicePreviews: Array<{ preview: string; abcSnippet?: string }>;
  };
}) {
  const selected = context.melodicContext?.selectedMelody;
  if (selected) return { preview: selected.preview, abcSnippet: selected.abcSnippet };
  const primary = context.melodicContext?.primaryVoice;
  if (primary) return { preview: primary.preview, abcSnippet: primary.abcSnippet };
  const first = context.melodicContext?.voicePreviews?.[0];
  return { preview: first?.preview, abcSnippet: first?.abcSnippet };
}

function hasUsableMelodySource(context: {
  melodicContext?: {
    selectedMelody?: { preview: string; abcSnippet?: string };
    primaryVoice?: { preview: string; abcSnippet?: string };
    voicePreviews: Array<{ preview: string; abcSnippet?: string }>;
  };
}) {
  const source = selectMelodyProjection(context);
  return Boolean(source.preview?.trim() || source.abcSnippet?.trim());
}

function buildArrangementSpec(params: {
  message: string;
  documentState: DocumentState;
  context: {
    melodicContext?: {
      selectedMelody?: {
        partId: string;
        voiceId: number;
        measureRange: { start: number; end: number };
      };
      primaryVoice?: {
        partId: string;
        voiceId: number;
      };
    };
  };
}) {
  const { message, documentState, context } = params;
  const stylePackId = inferStylePack(message);
  const stylePack = getArrangementStylePack(stylePackId);
  const selectedMelody = context.melodicContext?.selectedMelody;
  const primaryVoice = context.melodicContext?.primaryVoice;
  const harmonicMode = /\b(reharmoni[sz]e|reharmonisiere|reharmonize|substitution|tritone)\b/i.test(message)
    ? 'reharm-light'
    : stylePack.defaults.harmonicMode;
  const sourceMelody = selectedMelody
    ? {
      source: 'score-selection' as const,
      partId: selectedMelody.partId,
      voiceId: selectedMelody.voiceId,
      measureRange: selectedMelody.measureRange,
      description: 'selected melody',
    }
    : {
      source: 'primary-voice' as const,
      partId: primaryVoice?.partId,
      voiceId: primaryVoice?.voiceId,
      description: 'primary detected melody',
    };

  const spec: ArrangementSpec = {
    sourceMelody,
    stylePack: stylePackId,
    tonalCenter: tonalCenterFromKeyFifths(getDocumentKeyFifths(documentState)),
    ...stylePack.defaults,
    harmonicMode,
    texture: /\b(polyphon|polyphonic|linear)\b/i.test(message)
      ? 'polyphonic-linear'
      : /\b(accompanied|begleit|melody with accompaniment)\b/i.test(message)
        ? 'mixed-melody-accompanied'
        : stylePack.defaults.texture,
  };

  return spec;
}

function extractJsonObject(text: string) {
  const match = text.match(/\{[\s\S]*\}/);
  if (!match) return null;
  try {
    return JSON.parse(match[0]) as Record<string, unknown>;
  } catch {
    return null;
  }
}

function parseHarmonicCandidates(text: string) {
  const parsed = extractJsonObject(text);
  if (!parsed || !Array.isArray(parsed.harmonicPlanCandidates)) return null;
  return {
    harmonicPlanCandidates: parsed.harmonicPlanCandidates as HarmonicPlanCandidate[],
    notes: Array.isArray(parsed.notes) ? parsed.notes.filter((entry): entry is string => typeof entry === 'string') : [],
  };
}

function parseVoicingCandidates(text: string) {
  const parsed = extractJsonObject(text);
  if (!parsed || !Array.isArray(parsed.voicingCandidates)) return null;
  return {
    voicingCandidates: parsed.voicingCandidates as VoicingCandidate[],
    notes: Array.isArray(parsed.notes) ? parsed.notes.filter((entry): entry is string => typeof entry === 'string') : [],
  };
}

function collapseChordPlan(segments: HarmonicPlanCandidate['segments']) {
  const byMeasure = new Map<number, string>();
  [...segments]
    .sort((a, b) => a.measure - b.measure || a.beatNum * b.beatDen - b.beatNum * a.beatDen)
    .forEach((segment) => {
      if (!byMeasure.has(segment.measure)) byMeasure.set(segment.measure, segment.chosen);
    });
  const entries = [...byMeasure.entries()].map(([measure, chosen]) => `${measure}:${chosen}`);
  return entries.length > 0 ? entries.join(',') : null;
}

function buildPlannerIntent(params: {
  message: string;
  spec: ArrangementSpec;
  harmonicCandidate: HarmonicPlanCandidate;
  voicingCandidate: VoicingCandidate;
  retriesUsed: number;
  unresolvedIssues: CriticIssue[];
  realizedCommands: ScoreCommand[];
  sessionContext?: AiSessionContext;
}) {
  const { message, spec, harmonicCandidate, voicingCandidate, retriesUsed, unresolvedIssues, realizedCommands, sessionContext } = params;
  const german = isLocalResponseGerman(message, sessionContext?.appLocale);
  const materialized = realizedCommands.length > 0;
  const commands: ParsedIntentJson['commands'] = [...realizedCommands];
  const chordPlan = collapseChordPlan(harmonicCandidate.segments);
  if (chordPlan) commands.push({ type: 'addChords', chords: chordPlan });
  commands.push({ type: 'addExpressionText', measureNumber: voicingCandidate.slices[0]?.measure ?? 1, text: detectExpressionText(message, german), placement: 'above' });
  const tempo = detectArrangementTempo(message);
  if (tempo) commands.push({ type: 'setTempo', bpm: tempo });
  const instrument = inferInstrument(message, sessionContext);
  const partId = spec.sourceMelody.partId;
  if (instrument) commands.push({ type: 'fitPartToInstrument', instrument, ...(partId ? { partId } : {}) });

  const unresolvedIssueCodes = unresolvedIssues.map((issue) => issue.code);
  const styleLabelDe = spec.stylePack === 'jazz-close' ? 'jazznahes' : spec.stylePack === 'generalbass' ? 'generalbassnahes' : 'dreistimmiges';
  const styleLabelEn = spec.stylePack === 'jazz-close' ? 'jazz-leaning' : spec.stylePack === 'generalbass' ? 'figured-bass-informed' : 'three-part';
  const explanation = german
    ? `Ich bereite ein ${styleLabelDe} Arrangement mit geplantem Harmonieverlauf und geprüfter Stimmführung vor${materialized ? ' und notiere die geprüften Stimmen direkt aus' : ', notiere die Stimmen aber noch nicht aus'}${unresolvedIssues.length > 0 ? '; es bleiben noch einzelne Satzwarnungen im Entwurf' : ''}.`
    : `I am preparing a ${styleLabelEn} arrangement with a planned harmonic route and critic-checked voicing${materialized ? ', materialized as written-out voices' : ', without written-out voices yet'}${unresolvedIssues.length > 0 ? '; a few drafting warnings remain' : ''}.`;
  const plan = german
    ? [
      'Plane den harmonischen Verlauf getrennt von der Stimmführung',
      'Erzeuge ein Voicing passend zum Style-Pack',
      materialized ? 'Notiere das geprüfte Voicing als Stimmen aus' : 'Übernehme die stärksten unterstützten Arrangement-Kommandos',
      ...(unresolvedIssues.length > 0 ? ['Markiere verbleibende Satzprobleme zur Nachprüfung'] : []),
    ]
    : [
      'Plan harmony separately from voicing',
      'Generate a style-aware voicing candidate',
      materialized ? 'Materialize the critic-checked voicing as written-out voices' : 'Apply the strongest supported arrangement commands',
      ...(unresolvedIssues.length > 0 ? ['Flag remaining drafting issues for review'] : []),
    ];

  return {
    commands,
    explanation,
    confidence: unresolvedIssues.some((issue) => issue.severity === 'error') ? 'medium' : 'high',
    ambiguities: [],
    plan,
    planner: {
      stage: 'two-step-arrangement',
      stylePack: spec.stylePack,
      harmonicCandidateId: harmonicCandidate.candidateId,
      voicingCandidateId: voicingCandidate.candidateId,
      retriesUsed,
      unresolvedIssueCodes,
    },
  } satisfies ParsedIntentJson;
}

export interface ArrangementPlannerResult {
  intent: ParsedIntentJson;
  provider: ProviderName;
  model: string;
  latencyMs: number;
  criticIssues: CriticIssue[];
  realizerIssues: RealizerIssue[];
  repairAttempts: number;
  plannerResponse: PlannerResponse;
}

export async function planArrangementWithLlm(params: {
  message: string;
  provider: ProviderName;
  ollamaModel?: string;
  ask: ArrangementAsk;
  documentState: DocumentState;
  context: {
    melodicContext?: {
      selectedMelody?: { preview: string; abcSnippet?: string; partId: string; voiceId: number; measureRange: { start: number; end: number } };
      primaryVoice?: { preview: string; abcSnippet?: string; partId: string; voiceId: number };
      voicePreviews: Array<{ preview: string; abcSnippet?: string }>;
    };
  };
  selection?: EditorSelection;
  sessionContext?: AiSessionContext;
}) {
  const { message, provider, ollamaModel, ask, documentState, context, sessionContext } = params;
  if (!hasUsableMelodySource(context)) return null;

  const spec = buildArrangementSpec({ message, documentState, context });
  const melodyProjection = selectMelodyProjection(context);
  const harmonyPrompt = buildArrangementHarmonyPrompt({
    message,
    spec,
    context,
    melodyPreview: melodyProjection.preview,
    abcSnippet: melodyProjection.abcSnippet,
  });
  const harmonyResponse = await ask(harmonyPrompt, provider, ollamaModel);
  if (harmonyResponse.error) return null;
  const harmonicDraft = parseHarmonicCandidates(harmonyResponse.text);
  if (!harmonicDraft?.harmonicPlanCandidates?.[0]) return null;
  const harmonicCandidate = harmonicDraft.harmonicPlanCandidates[0]!;

  const voicingPrompt = buildArrangementVoicingPrompt({
    message,
    spec,
    context,
    harmonicCandidate,
    melodyPreview: melodyProjection.preview,
    abcSnippet: melodyProjection.abcSnippet,
  });
  let voicingResponse = await ask(voicingPrompt, provider, ollamaModel);
  if (voicingResponse.error) return null;
  let voicingDraft = parseVoicingCandidates(voicingResponse.text);
  if (!voicingDraft?.voicingCandidates?.[0]) return null;
  let voicingCandidate = voicingDraft.voicingCandidates[0]!;
  let criticReport = runArrangementCritic({
    spec,
    voicingPlan: {
      texture: spec.texture,
      slices: voicingCandidate.slices,
    },
  });
  let repairAttempts = 0;
  let totalLatencyMs = harmonyResponse.latencyMs + voicingResponse.latencyMs;
  let finalResponseModel = voicingResponse.model;
  while (criticReport.errorCount > 0 && repairAttempts < MAX_VOICING_RETRIES) {
    repairAttempts += 1;
    const repairPrompt = buildArrangementVoicingRepairPrompt({
      message,
      spec,
      context,
      harmonicCandidate,
      attemptedVoicing: voicingCandidate,
      criticIssues: criticReport.issues.filter((issue) => issue.severity === 'error'),
    });
    voicingResponse = await ask(repairPrompt, provider, ollamaModel);
    totalLatencyMs += voicingResponse.latencyMs;
    finalResponseModel = voicingResponse.model;
    if (voicingResponse.error) break;
    voicingDraft = parseVoicingCandidates(voicingResponse.text);
    if (!voicingDraft?.voicingCandidates?.[0]) break;
    voicingCandidate = voicingDraft.voicingCandidates[0]!;
    criticReport = runArrangementCritic({
      spec,
      voicingPlan: {
        texture: spec.texture,
        slices: voicingCandidate.slices,
      },
    });
  }

  // Materialize the critic-checked voicing as concrete note commands. When the
  // realizer cannot produce a valid note batch (multi-part score, unsupported
  // slice durations, ...), fall back to chord symbols only and surface why.
  const realization = realizeArrangement({
    documentState,
    spec,
    voicingCandidate,
    harmonicCandidate,
  });
  const realizedCommands = realization.valid ? realization.commands : [];
  const surfacedRealizerIssues = realization.issues.filter((issue) => (
    issue.severity === 'error' || issue.code !== 'post-realization-validation'
  ));

  const intent = buildPlannerIntent({
    message,
    spec,
    harmonicCandidate,
    voicingCandidate,
    retriesUsed: repairAttempts,
    unresolvedIssues: criticReport.issues,
    realizedCommands,
    sessionContext,
  });

  return {
    intent,
    provider,
    model: finalResponseModel,
    latencyMs: totalLatencyMs,
    criticIssues: criticReport.issues,
    realizerIssues: surfacedRealizerIssues,
    repairAttempts,
    plannerResponse: {
      plannerVersion: '0.1.0-two-step',
      spec,
      harmonicPlanCandidates: [harmonicCandidate],
      voicingCandidates: [voicingCandidate],
      notes: [
        ...harmonicDraft.notes,
        ...(voicingDraft?.notes ?? []),
      ],
    },
  } satisfies ArrangementPlannerResult;
}
