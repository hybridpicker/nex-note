import type { MidiImportAnalysis } from '@/src/nex-note/midi/analyze-midi';
import type { ParsedIntentJson } from '@/src/nex-note/intent/parse-intent-json';
import type { ScoreDocumentModel } from '@/src/score-core/model/types';
import type { ScoreCommand } from '@/src/shared/schemas/score-command';

export interface MidiReconstructionIntent extends ParsedIntentJson {
  commands: ScoreCommand[];
}

function titleFromFilename(filename?: string | null) {
  if (!filename) return null;
  const stem = filename.replace(/\.[^.]+$/, '').replace(/\s*\(\d+\)\s*$/, '').trim();
  return stem || null;
}

function primaryPartId(document: ScoreDocumentModel) {
  return document.score.parts[0]?.sourcePartId ?? document.score.parts[0]?.id ?? null;
}

function buildProfileCommands(document: ScoreDocumentModel, analysis?: MidiImportAnalysis | null, filename?: string | null): ScoreCommand[] {
  const commands: ScoreCommand[] = [];
  const title = titleFromFilename(filename);
  if (title && !document.metadata.title) commands.push({ type: 'setTitle', title });
  if (analysis?.tempoBpm) commands.push({ type: 'setTempo', bpm: analysis.tempoBpm });
  if (analysis?.timeSignature) {
    const firstMeasure = document.score.parts[0]?.staves[0]?.measures[0];
    const current = firstMeasure?.attributes.find((attribute) => attribute.time)?.time;
    if (!current || current.beats !== analysis.timeSignature.beats || current.beatType !== analysis.timeSignature.beatType) {
      commands.push({
        type: 'setTimeSignature',
        beats: analysis.timeSignature.beats,
        beatType: analysis.timeSignature.beatType,
        measureNumber: firstMeasure?.measureNumber ?? 1,
      });
    }
  }

  const partId = primaryPartId(document);
  if (partId && analysis?.profile === 'piano' && document.score.parts.length === 1) {
    commands.push({ type: 'setPartName', partId, name: 'Piano' });
    commands.push({ type: 'setInstrumentName', partId, instrumentName: 'Piano' });
  }
  if (partId && analysis?.profile === 'lead-sheet' && document.score.parts.length === 1) {
    commands.push({ type: 'setPartName', partId, name: 'Lead' });
  }

  return commands;
}

function buildReadabilityCommands(document: ScoreDocumentModel, analysis?: MidiImportAnalysis | null): ScoreCommand[] {
  const commands: ScoreCommand[] = [];
  const measureNumbers = Array.from(new Set(
    document.score.parts.flatMap((part) => part.staves.flatMap((staff) => staff.measures.map((measure) => measure.measureNumber))),
  )).sort((a, b) => a - b);
  const isLargeMidi = (analysis?.noteCount ?? 0) > 4000;
  const interval = analysis?.profile === 'ensemble' ? 4 : 6;
  if (measureNumbers[0] != null && (analysis?.profile === 'piano' || analysis?.profile === 'ensemble')) {
    commands.push({
      type: 'setMeasureLayoutHint',
      measureNumber: measureNumbers[0],
      hint: 'staffSpacing',
      value: analysis.profile === 'piano' ? 108 : 104,
    });
  }
  measureNumbers.forEach((measureNumber) => {
    if (measureNumber > 1 && (measureNumber - 1) % interval === 0) {
      commands.push({ type: 'setSystemBreak', measureNumber, value: true });
    }
  });

  const denseMeasures = new Set<number>();
  document.score.parts.forEach((part) => {
    part.staves.forEach((staff) => {
      staff.measures.forEach((measure) => {
        const eventCount = measure.voices.reduce((sum, voice) => sum + voice.events.length, 0);
        const voiceCount = measure.voices.filter((voice) => voice.events.length > 0).length;
        if (eventCount >= 16 || voiceCount >= 3) denseMeasures.add(measure.measureNumber);
      });
    });
  });
  Array.from(denseMeasures).slice(0, isLargeMidi ? 96 : 240).forEach((measureNumber) => {
    commands.push({
      type: 'setMeasureLayoutHint',
      measureNumber,
      hint: 'staffSpacing',
      value: analysis?.profile === 'piano' ? 112 : 104,
    });
  });

  return commands;
}

function dedupeCommands(commands: ScoreCommand[]) {
  const seen = new Set<string>();
  return commands.filter((command) => {
    const key = JSON.stringify(command);
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

export function generateMidiReconstructionIntent(
  document: ScoreDocumentModel,
  params?: { analysis?: MidiImportAnalysis | null; filename?: string | null; locale?: string | null },
): MidiReconstructionIntent {
  const analysis = params?.analysis ?? null;
  const commands = dedupeCommands([
    ...buildProfileCommands(document, analysis, params?.filename),
    ...buildReadabilityCommands(document, analysis),
  ]);
  const german = params?.locale === 'de';
  const summary = analysis?.summary ?? 'MIDI import analyzed after conversion.';
  return {
    commands,
    explanation: german
      ? `MIDI-Rekonstruktion vorbereitet: ${summary}`
      : `MIDI reconstruction prepared: ${summary}`,
    confidence: 'high',
    ambiguities: analysis?.warnings ?? [],
    plan: [
      'Analyze MIDI tracks and timing',
      `Apply ${analysis?.quantization ?? 'auto'} readability target`,
      'Normalize metadata, tempo, and layout',
      'Keep the converted notes editable',
    ],
  };
}
