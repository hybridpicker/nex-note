import type { DocumentState } from '@/src/score-core/commands/apply-document-commands';
import { summarizeXmlScoreDocument } from '@/src/score-core/commands/legacy-xml-executor';
import { buildAiCapabilityContext, type AiCapabilityContext } from '@/src/nex-note/context/build-ai-capability-context';
import type { TimedEvent } from '@/src/score-core/model/types';

export interface AiScoreContext {
  summary: {
    title?: string;
    subtitle?: string;
    composer?: string;
    arranger?: string;
    parts: Array<{
      id: string;
      name: string;
      instrumentName?: string;
      staffCount: number;
      measureCount: number;
    }>;
    totalMeasures: number;
  };
  melodicContext?: {
    primaryVoice?: {
      partId: string;
      partName: string;
      staffIndex: number;
      voiceId: number;
      noteCount: number;
      preview: string;
      abcSnippet?: string;
      detectionReason: string;
    };
    selectedMelody?: {
      scope: 'selection' | 'anchored-voice';
      partId: string;
      partName: string;
      staffIndex: number;
      voiceId: number;
      measureRange: {
        start: number;
        end: number;
      };
      noteCount: number;
      preview: string;
      abcSnippet?: string;
    };
    voicePreviews: Array<{
      partId: string;
      partName: string;
      staffIndex: number;
      voiceId: number;
      totalEvents: number;
      noteCount: number;
      preview: string;
      abcSnippet?: string;
    }>;
  };
  diagnostics: Array<{
    level: 'info' | 'warning' | 'error';
    code: string;
    message: string;
  }>;
  capabilities: AiCapabilityContext;
  attributeHints?: {
    clefChanges: Array<{
      partId: string;
      staffIndex: number;
      measureNumber: number;
      sign?: string;
      line?: number;
      redundantWithPrevious: boolean;
      mayRenderAtEndOfPreviousMeasure: boolean;
    }>;
  };
  selection?: {
    partId?: string | null;
    entityIds?: string[];
    anchorEntityId?: string | null;
    measureNumber?: number;
    staffIndex?: number;
    voiceId?: number;
    measureRange?: {
      start: number;
      end: number;
    };
    selectionCount?: number;
  };
}

function buildClefChangeHints(documentState: DocumentState): AiScoreContext['attributeHints'] {
  const coreDocument = documentState.coreDocument;
  if (!coreDocument) return undefined;

  const clefChanges: NonNullable<AiScoreContext['attributeHints']>['clefChanges'] = [];
  coreDocument.score.parts.forEach((part) => {
    part.staves.forEach((staff) => {
      let previousClef: { sign?: string; line?: number } | null = null;
      staff.measures.forEach((measure) => {
        const clefs = measure.attributes[0]?.clefs.filter((entry) => entry.staffIndex === staff.staffIndex) ?? [];
        clefs.forEach((clef) => {
          clefChanges.push({
            partId: part.sourcePartId,
            staffIndex: staff.staffIndex,
            measureNumber: measure.measureNumber,
            sign: clef.sign,
            line: clef.line,
            redundantWithPrevious: Boolean(previousClef && previousClef.sign === clef.sign && previousClef.line === clef.line),
            mayRenderAtEndOfPreviousMeasure: measure.measureNumber > 1,
          });
          previousClef = { sign: clef.sign, line: clef.line };
        });
      });
    });
  });

  return clefChanges.length > 0 ? { clefChanges } : undefined;
}

const MAX_PREVIEW_VOICES = 6;
const MAX_PREVIEW_EVENTS = 96;
const ABC_SNIPPET_MAX_EVENTS = 64;

function eventDurationLabel(event: TimedEvent) {
  if (event.durationType) return `${event.durationType}${event.isDotted ? '.' : ''}`;
  return `${event.durationDivisions}${event.isDotted ? '.' : ''}`;
}

function noteLabel(event: TimedEvent) {
  if (event.kind === 'rest') return `R/${eventDurationLabel(event)}`;
  const accidental = event.pitch.alter === 1 ? '#' : event.pitch.alter === -1 ? 'b' : '';
  return `${event.pitch.step}${accidental}${event.pitch.octave}/${eventDurationLabel(event)}`;
}

function noteToMidi(event: TimedEvent) {
  if (event.kind !== 'note') return null;
  const stepToSemitone: Record<string, number> = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 };
  return (stepToSemitone[event.pitch.step] ?? 0) + event.pitch.alter + (event.pitch.octave + 1) * 12;
}

function buildVoicePreview(events: TimedEvent[]) {
  const previewEvents = events.slice(0, MAX_PREVIEW_EVENTS);
  const chunks: string[] = [];
  let currentMeasureNumber: number | null = null;
  let currentTokens: string[] = [];

  for (const event of previewEvents) {
    const measureNumber = event.measureNumber;
    if (currentMeasureNumber == null) {
      currentMeasureNumber = measureNumber;
    }
    if (measureNumber !== currentMeasureNumber) {
      chunks.push(`m${currentMeasureNumber}:${currentTokens.join(' ')}`);
      currentMeasureNumber = measureNumber;
      currentTokens = [];
    }
    currentTokens.push(noteLabel(event));
  }

  if (currentMeasureNumber != null && currentTokens.length > 0) {
    chunks.push(`m${currentMeasureNumber}:${currentTokens.join(' ')}`);
  }

  if (events.length > previewEvents.length) chunks.push('...');
  return chunks.join(' | ');
}

function abcPitchToken(event: TimedEvent) {
  if (event.kind === 'rest') return 'z';
  const accidental = event.pitch.alter === 2 ? '^^' : event.pitch.alter === 1 ? '^' : event.pitch.alter === -1 ? '_' : event.pitch.alter === -2 ? '__' : '';
  const base = event.pitch.step.toUpperCase();
  const octave = event.pitch.octave;
  const pitch = octave > 4
    ? base.toLowerCase() + "'".repeat(Math.max(0, octave - 5))
    : octave < 4
      ? base + ','.repeat(Math.max(0, 4 - octave))
      : base;
  return `${accidental}${pitch}`;
}

function abcDurationToken(event: TimedEvent) {
  const durationType = event.durationType;
  if (durationType === 'whole') return '8';
  if (durationType === 'half') return event.isDotted ? '6' : '4';
  if (durationType === 'quarter') return event.isDotted ? '3' : '2';
  if (durationType === 'eighth') return event.isDotted ? '3/2' : '';
  if (durationType === '16th') return event.isDotted ? '3/4' : '/2';
  if (durationType === '32nd') return '/4';
  return '';
}

function buildAbcSnippet(events: TimedEvent[]) {
  const snippetEvents = events.slice(0, ABC_SNIPPET_MAX_EVENTS);
  if (snippetEvents.length === 0) return undefined;

  const body: string[] = [];
  let currentMeasure: number | null = null;
  let currentTokens: string[] = [];

  for (const event of snippetEvents) {
    if (currentMeasure == null) currentMeasure = event.measureNumber;
    if (event.measureNumber !== currentMeasure) {
      body.push(`${currentTokens.join(' ')} |`);
      currentMeasure = event.measureNumber;
      currentTokens = [];
    }
    currentTokens.push(`${abcPitchToken(event)}${abcDurationToken(event)}`);
  }

  if (currentTokens.length > 0) body.push(`${currentTokens.join(' ')} |`);
  if (events.length > snippetEvents.length) body.push('%% ...');

  return [
    'X:1',
    'M:4/4',
    'L:1/8',
    'K:C',
    ...body,
  ].join('\n');
}

interface VoiceContextCandidate {
  partId: string;
  partName: string;
  staffIndex: number;
  voiceId: number;
  events: TimedEvent[];
}

function collectVoiceCandidates(documentState: DocumentState): VoiceContextCandidate[] {
  const coreDocument = documentState.coreDocument;
  if (!coreDocument) return [];

  const voiceMap = new Map<string, VoiceContextCandidate>();
  coreDocument.score.parts.forEach((part) => {
    part.staves.forEach((staff) => {
      staff.measures.forEach((measure) => {
        measure.voices.forEach((voice) => {
          const key = `${part.sourcePartId}:${staff.staffIndex}:${voice.voiceId}`;
          const existing = voiceMap.get(key) ?? {
            partId: part.sourcePartId,
            partName: part.name,
            staffIndex: staff.staffIndex,
            voiceId: voice.voiceId,
            events: [],
          };
          existing.events.push(...voice.events);
          voiceMap.set(key, existing);
        });
      });
    });
  });

  return [...voiceMap.values()];
}

function measureRangeForEvents(events: TimedEvent[]) {
  const measures = events.map((event) => event.measureNumber);
  return {
    start: Math.min(...measures),
    end: Math.max(...measures),
  };
}

function detectPrimaryVoice(candidates: VoiceContextCandidate[]) {
  const ranked = candidates
    .map((candidate) => {
      const noteEvents = candidate.events.filter((event) => event.kind === 'note');
      const averageMidi = noteEvents.length > 0
        ? noteEvents.reduce((sum, event) => sum + (noteToMidi(event) ?? 0), 0) / noteEvents.length
        : 0;
      return {
        ...candidate,
        noteCount: noteEvents.length,
        averageMidi,
      };
    })
    .filter((candidate) => candidate.noteCount > 0)
    .sort((a, b) => (
      b.noteCount - a.noteCount
      || b.averageMidi - a.averageMidi
      || a.staffIndex - b.staffIndex
      || a.voiceId - b.voiceId
    ));

  const best = ranked[0];
  if (!best) return undefined;

  return {
    partId: best.partId,
    partName: best.partName,
    staffIndex: best.staffIndex,
    voiceId: best.voiceId,
    noteCount: best.noteCount,
    preview: buildVoicePreview(best.events),
    abcSnippet: buildAbcSnippet(best.events),
    detectionReason: 'Chosen as the clearest existing melodic line by note density, register, and upper-voice preference.',
  };
}

function buildSelectedMelody(
  candidates: VoiceContextCandidate[],
  selection?: AiScoreContext['selection'],
): NonNullable<AiScoreContext['melodicContext']>['selectedMelody'] {
  if (!selection) return undefined;

  const matchesPartId = (candidatePartId: string) => (
    !selection.partId
    || selection.partId === candidatePartId
    || selection.partId === `part:${candidatePartId}`
  );

  const matchingVoice = candidates.find((candidate) => (
    matchesPartId(candidate.partId)
    && (typeof selection.staffIndex === 'number' ? candidate.staffIndex === selection.staffIndex : true)
    && (typeof selection.voiceId === 'number' ? candidate.voiceId === selection.voiceId : true)
  ));
  if (!matchingVoice) return undefined;

  const scopedEvents = matchingVoice.events.filter((event) => {
    if (!selection.measureRange) return true;
    return event.measureNumber >= selection.measureRange.start && event.measureNumber <= selection.measureRange.end;
  });
  if (scopedEvents.length === 0) return undefined;

  const range = measureRangeForEvents(scopedEvents);
  return {
    scope: selection.measureRange ? 'selection' : 'anchored-voice',
    partId: matchingVoice.partId,
    partName: matchingVoice.partName,
    staffIndex: matchingVoice.staffIndex,
    voiceId: matchingVoice.voiceId,
    measureRange: range,
    noteCount: scopedEvents.filter((event) => event.kind === 'note').length,
    preview: buildVoicePreview(scopedEvents),
    abcSnippet: buildAbcSnippet(scopedEvents),
  };
}

function buildMelodicContext(candidates: VoiceContextCandidate[]): AiScoreContext['melodicContext'] {
  const voicePreviews = candidates
    .map((entry) => {
      const orderedEvents = [...entry.events].sort((a, b) => (
        a.measureNumber - b.measureNumber
        || a.timestampNum / a.timestampDen - b.timestampNum / b.timestampDen
      ));
      const noteCount = orderedEvents.filter((event) => event.kind === 'note').length;
      return {
        partId: entry.partId,
        partName: entry.partName,
        staffIndex: entry.staffIndex,
        voiceId: entry.voiceId,
        totalEvents: orderedEvents.length,
        noteCount,
        preview: buildVoicePreview(orderedEvents),
        abcSnippet: buildAbcSnippet(orderedEvents),
      };
    })
    .filter((entry) => entry.totalEvents > 0)
    .sort((a, b) => b.noteCount - a.noteCount || a.staffIndex - b.staffIndex || a.voiceId - b.voiceId)
    .slice(0, MAX_PREVIEW_VOICES);

  return voicePreviews.length > 0 ? {
    primaryVoice: detectPrimaryVoice(candidates),
    selectedMelody: undefined,
    voicePreviews,
  } : undefined;
}

export function buildAiScoreContext(documentState: DocumentState, selection?: AiScoreContext['selection']): AiScoreContext {
  const fallbackSummary = summarizeXmlScoreDocument(documentState.xml);
  const parts = documentState.coreDocument?.score.parts.map((part) => ({
    id: part.sourcePartId,
    name: part.name,
    instrumentName: part.instrumentName,
    staffCount: part.staves.length,
    measureCount: Math.max(...part.staves.map((staff) => staff.measures.length), 0),
  })) ?? fallbackSummary.parts.map((part) => ({
    id: part.id,
    name: part.name,
    instrumentName: part.instrumentName,
    staffCount: 1,
    measureCount: 0,
  }));

  const voiceCandidates = collectVoiceCandidates(documentState);
  const melodicContext = buildMelodicContext(voiceCandidates);
  if (melodicContext) {
    melodicContext.selectedMelody = buildSelectedMelody(voiceCandidates, selection);
  }

  return {
    summary: {
      title: documentState.coreDocument?.metadata.title ?? fallbackSummary.title,
      subtitle: documentState.coreDocument?.metadata.subtitle ?? fallbackSummary.subtitle,
      composer: documentState.coreDocument?.metadata.composer ?? fallbackSummary.composer,
      arranger: documentState.coreDocument?.metadata.arranger ?? fallbackSummary.arranger,
      parts,
      totalMeasures: documentState.coreDocument
        ? Math.max(0, ...parts.map((part) => part.measureCount))
        : (documentState.xml.match(/<measure\b/g) ?? []).length,
    },
    melodicContext,
    diagnostics: documentState.diagnostics.map((diagnostic) => ({
      level: diagnostic.level,
      code: diagnostic.code,
      message: diagnostic.message,
    })),
    capabilities: buildAiCapabilityContext(),
    attributeHints: buildClefChangeHints(documentState),
    selection,
  };
}
