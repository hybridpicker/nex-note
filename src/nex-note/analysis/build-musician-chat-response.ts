import type { EditorSelection } from '@/hooks/useNoteEditor';
import type { AiSessionContext } from '@/lib/prompts';
import type { DocumentState } from '@/src/score-core/commands/apply-document-commands';
import type { MeasureNode, NoteEvent } from '@/src/score-core/model/types';
import type { ParsedIntentJson } from '@/src/nex-note/intent/parse-intent-json';
import type { AiWorkflowKind } from '@/src/nex-note/workflows/ai-workflows';

type InstrumentKey = 'voice' | 'flute' | 'violin' | 'clarinet-bb' | 'trumpet-bb' | 'alto-sax-eb' | 'cello';

type InstrumentProfile = {
  labelEn: string;
  labelDe: string;
  minMidi: number;
  maxMidi: number;
};

const INSTRUMENT_PROFILES: Record<InstrumentKey, InstrumentProfile> = {
  voice: { labelEn: 'voice', labelDe: 'Gesangsstimme', minMidi: 55, maxMidi: 79 },
  flute: { labelEn: 'flute', labelDe: 'Flöte', minMidi: 60, maxMidi: 96 },
  violin: { labelEn: 'violin', labelDe: 'Violine', minMidi: 55, maxMidi: 103 },
  'clarinet-bb': { labelEn: 'Bb clarinet', labelDe: 'B-Klarinette', minMidi: 50, maxMidi: 91 },
  'trumpet-bb': { labelEn: 'Bb trumpet', labelDe: 'B-Trompete', minMidi: 54, maxMidi: 82 },
  'alto-sax-eb': { labelEn: 'Eb alto sax', labelDe: 'Es-Altsaxophon', minMidi: 49, maxMidi: 81 },
  cello: { labelEn: 'cello', labelDe: 'Cello', minMidi: 36, maxMidi: 76 },
};

function isLikelyGerman(message: string) {
  return /\b(der|die|das|ein|eine|takt|umfang|analyse|probe|üb|uebe|singbar|spielbar|schwer|melodie|notier|quelle|lizenz)\b/i.test(message);
}

function noteToMidi(note: NoteEvent) {
  const stepToSemitone: Record<string, number> = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 };
  return (stepToSemitone[note.pitch.step] ?? 0) + note.pitch.alter + (note.pitch.octave + 1) * 12;
}

function writtenPitchToMidi(pitch: { step: string; alter: number; octave: number }) {
  const stepToSemitone: Record<string, number> = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 };
  return (stepToSemitone[pitch.step] ?? 0) + pitch.alter + (pitch.octave + 1) * 12;
}

function noteLabel(note: NoteEvent) {
  const accidental = note.pitch.alter === 1 ? '#' : note.pitch.alter === -1 ? 'b' : '';
  return `${note.pitch.step}${accidental}${note.pitch.octave}`;
}

interface ScopedNoteInfo {
  partId: string;
  partName: string;
  note: NoteEvent;
  measure: MeasureNode;
}

interface VoiceCandidate {
  partId: string;
  partName: string;
  staffIndex: number;
  voiceId: number;
  notes: ScopedNoteInfo[];
}

function inferInstrument(message: string, sessionContext?: AiSessionContext): InstrumentKey | null {
  const preferred = sessionContext?.taskState?.preferredInstrument;
  if (preferred && preferred in INSTRUMENT_PROFILES) return preferred as InstrumentKey;
  const normalized = message.toLowerCase();
  if (/\b(voice|vocal|sing|singer|gesang|stimme)\b/.test(normalized)) return 'voice';
  if (/\bflute|flöte|floete\b/.test(normalized)) return 'flute';
  if (/\bviolin|geige\b/.test(normalized)) return 'violin';
  if (/\bclarinet|klarinette\b/.test(normalized)) return 'clarinet-bb';
  if (/\btrumpet|trompete\b/.test(normalized)) return 'trumpet-bb';
  if (/\balto sax|altsax|alto-sax|saxophon\b/.test(normalized)) return 'alto-sax-eb';
  if (/\bcello\b/.test(normalized)) return 'cello';
  return null;
}

function collectScopedNotes(documentState: DocumentState, selection?: EditorSelection): ScopedNoteInfo[] {
  const core = documentState.coreDocument;
  if (!core) return [];
  const anchor = selection?.anchor;

  return core.score.parts.flatMap((part) => part.staves.flatMap((staff) => staff.measures.flatMap((measure) => (
    measure.voices.flatMap((voice) => voice.events.flatMap((event) => {
      if (event.kind !== 'note') return [];
      if (anchor && (event.staffIndex !== anchor.staffIndex || event.voiceId !== anchor.voiceId)) return [];
      return [{ partId: part.sourcePartId, partName: part.name, note: event, measure }];
    }))
  ))));
}

function collectVoiceCandidates(documentState: DocumentState): VoiceCandidate[] {
  const core = documentState.coreDocument;
  if (!core) return [];

  const candidates: VoiceCandidate[] = [];
  core.score.parts.forEach((part) => {
    part.staves.forEach((staff) => {
      const byVoice = new Map<number, ScopedNoteInfo[]>();
      staff.measures.forEach((measure) => {
        measure.voices.forEach((voice) => {
          const existing = byVoice.get(voice.voiceId) ?? [];
          voice.events.forEach((event) => {
            if (event.kind !== 'note') return;
            existing.push({ partId: part.sourcePartId, partName: part.name, note: event, measure });
          });
          byVoice.set(voice.voiceId, existing);
        });
      });
      byVoice.forEach((notes, voiceId) => {
        if (notes.length === 0) return;
        candidates.push({
          partId: part.sourcePartId,
          partName: part.name,
          staffIndex: staff.staffIndex,
          voiceId,
          notes: notes.sort((a, b) => a.note.measureNumber - b.note.measureNumber || a.note.timestampNum - b.note.timestampNum),
        });
      });
    });
  });
  return candidates;
}

function detectPrimaryVoiceNotes(documentState: DocumentState) {
  const candidates = collectVoiceCandidates(documentState)
    .map((candidate) => {
      const averageMidi = candidate.notes.reduce((sum, entry) => sum + noteToMidi(entry.note), 0) / candidate.notes.length;
      return {
        ...candidate,
        averageMidi,
      };
    })
    .sort((a, b) => b.notes.length - a.notes.length || b.averageMidi - a.averageMidi || a.staffIndex - b.staffIndex || a.voiceId - b.voiceId);

  return candidates[0]?.notes ?? [];
}

function collectArrangementSourceNotes(documentState: DocumentState, selection?: EditorSelection) {
  const core = documentState.coreDocument;
  if (!core) return [];

  if (selection?.entityIds?.length) {
    const selectedIds = new Set(selection.entityIds);
    const selected = core.score.parts.flatMap((part) => part.staves.flatMap((staff) => staff.measures.flatMap((measure) => (
      measure.voices.flatMap((voice) => voice.events.flatMap((event) => (
        event.kind === 'note' && selectedIds.has(event.id) ? [{ partId: part.sourcePartId, partName: part.name, note: event, measure }] : []
      )))
    ))));
    if (selected.length > 0) {
      return selected.sort((a, b) => a.note.measureNumber - b.note.measureNumber || a.note.timestampNum - b.note.timestampNum);
    }
  }

  const anchor = selection?.anchor;
  if (anchor) {
    const anchored = core.score.parts.flatMap((part) => part.staves.flatMap((staff) => staff.measures.flatMap((measure) => (
      measure.voices.flatMap((voice) => voice.events.flatMap((event) => {
        if (event.kind !== 'note') return [];
        if ((selection.partId && selection.partId !== part.sourcePartId && selection.partId !== `part:${part.sourcePartId}`)) return [];
        if (event.staffIndex !== anchor.staffIndex || event.voiceId !== anchor.voiceId) return [];
        return [{ partId: part.sourcePartId, partName: part.name, note: event, measure }];
      }))
    ))));
    if (anchored.length > 0) {
      return anchored.sort((a, b) => a.note.measureNumber - b.note.measureNumber || a.note.timestampNum - b.note.timestampNum);
    }
  }

  return detectPrimaryVoiceNotes(documentState);
}

function detectExpressionText(message: string, german: boolean) {
  const normalized = message.toLowerCase();
  if (/\b(dolce|zart|tender|lyrical|lyrisch)\b/.test(normalized)) return 'dolce';
  if (/\b(leggiero|leicht|light)\b/.test(normalized)) return 'leggiero';
  if (/\b(espressivo|expressive|ausdrucksvoll)\b/.test(normalized)) return 'espressivo';
  if (/\b(cantabile|gesanglich|singable|singbar|melodie)\b/.test(normalized)) return 'cantabile';
  return german ? 'cantabile' : 'cantabile';
}

function detectArrangementTempo(message: string) {
  const normalized = message.toLowerCase();
  if (/\b(slow|ruhig|calm|ballad|adagio|langsam)\b/.test(normalized)) return 72;
  if (/\b(bright|lebhaft|upbeat|animato|quick|schnell)\b/.test(normalized)) return 116;
  if (/\b(moderate|moderat|moderato)\b/.test(normalized)) return 96;
  return null;
}

function pitchClassName(pc: number, preferFlats: boolean) {
  const sharp = ['C', 'C#', 'D', 'Eb', 'E', 'F', 'F#', 'G', 'Ab', 'A', 'Bb', 'B'];
  const flat = ['C', 'Db', 'D', 'Eb', 'E', 'F', 'Gb', 'G', 'Ab', 'A', 'Bb', 'B'];
  return (preferFlats ? flat : sharp)[((pc % 12) + 12) % 12] ?? 'C';
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

function inferChordForMeasure(notes: NoteEvent[], preferFlats: boolean) {
  if (notes.length === 0) return null;
  const weightedPitchClasses = notes.map((note) => noteToMidi(note) % 12);
  const firstPc = weightedPitchClasses[0] ?? 0;
  const lastPc = weightedPitchClasses[weightedPitchClasses.length - 1] ?? firstPc;

  const candidates = Array.from({ length: 12 }, (_, root) => ([
    { symbol: pitchClassName(root, preferFlats), tones: [root, root + 4, root + 7] },
    { symbol: `${pitchClassName(root, preferFlats)}m`, tones: [root, root + 3, root + 7] },
    { symbol: `${pitchClassName(root, preferFlats)}dim`, tones: [root, root + 3, root + 6] },
  ])).flat();

  const scored = candidates.map((candidate) => {
    const normalizedTones = candidate.tones.map((tone) => ((tone % 12) + 12) % 12);
    let score = 0;
    weightedPitchClasses.forEach((pc, index) => {
      if (normalizedTones.includes(pc)) score += index === weightedPitchClasses.length - 1 ? 3 : 2;
      if (pc === ((candidate.tones[0] % 12) + 12) % 12) score += 2;
    });
    if (normalizedTones.includes(lastPc)) score += 2;
    if (((candidate.tones[0] % 12) + 12) % 12 === lastPc) score += 3;
    if (((candidate.tones[0] % 12) + 12) % 12 === firstPc) score += 1;
    return { symbol: candidate.symbol, score };
  })
    .sort((a, b) => b.score - a.score || a.symbol.length - b.symbol.length);

  return scored[0]?.symbol ?? null;
}

function buildChordPlan(scoped: ScopedNoteInfo[], preferFlats: boolean) {
  const byMeasure = new Map<number, NoteEvent[]>();
  scoped.forEach(({ note, measure }) => {
    const existing = byMeasure.get(measure.measureNumber) ?? [];
    existing.push(note);
    byMeasure.set(measure.measureNumber, existing);
  });

  const entries = [...byMeasure.entries()]
    .sort((a, b) => a[0] - b[0])
    .map(([measureNumber, notes]) => {
      const chord = inferChordForMeasure(notes, preferFlats);
      return chord ? `${measureNumber}:${chord}` : null;
    })
    .filter((entry): entry is string => Boolean(entry));

  return entries.length > 0 ? entries.join(',') : null;
}

const DIATONIC_STEPS = ['C', 'D', 'E', 'F', 'G', 'A', 'B'] as const;
const STEP_TO_PC: Record<string, number> = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 };
const DIATONIC_VARIATION_PATTERN = [0, 1, 2, 3, 2, 1, 0, 2, 3, 1, 2, 0] as const;

function normalizeChordSymbol(raw: string) {
  const compact = raw.replace(/\s+/g, '');
  const match = compact.match(/^([A-Ga-g])([#b]?)(.*)$/);
  if (!match) return null;
  const [, step, accidental, quality] = match;
  const normalizedQuality = quality
    .replace(/^min/i, 'm')
    .replace(/^Maj/i, 'maj');
  return `${step.toUpperCase()}${accidental}${normalizedQuality}`;
}

function extractExplicitChordSymbols(message: string) {
  const symbols: Array<{ symbol: string; index: number }> = [];
  const chordPattern = /(?<![A-Za-z])([A-Ga-g](?:#|b)?\s*(?:maj|min|m|dim|aug|sus)?\s*(?:6|7|9|11|13)?)(?![A-Za-z])/g;
  for (const match of message.matchAll(chordPattern)) {
    const raw = match[1] ?? '';
    const compact = raw.replace(/\s+/g, '');
    if (!/[#b0-9]|maj|min|dim|aug|sus|m/.test(compact)) continue;
    if (/^[a-g]$/.test(compact)) continue;
    const symbol = normalizeChordSymbol(compact);
    if (!symbol) continue;
    symbols.push({ symbol, index: match.index ?? 0 });
  }

  if (symbols.length > 1) {
    const firstPrefix = message.slice(Math.max(0, symbols[0]!.index - 12), symbols[0]!.index).toLowerCase();
    if (/\b(for|over)\s*$/.test(firstPrefix)) return symbols.slice(1).map((entry) => entry.symbol);
  }
  return symbols.map((entry) => entry.symbol);
}

function shouldBuildMaterializedArrangement(message: string, explicitChordCount: number) {
  const normalized = message.toLowerCase();
  const asksForArrangement = /\b(arrang(?:e|ement|ing|ed|iere|ieren|iert)|reharmoni[sz]e|reharmon(?:is(?:e|ing)|isieren)|harmonis(?:e|ing|iere|ieren|iert)|accompan(?:iment|y)|begleit(?:e|en|et|ung)?|voic(?:e|ing)|satz)\b/.test(normalized);
  const asksForConcreteLine = /\b(lick|riff|melody|melodie|line|phrase|version|variation|variant|alternate|alternative|other|another|variante|andere|anderen)\b/.test(normalized);
  const asksOnlyForSurfaceAnnotation = /\b(chord symbols?|akkordsymbole?|tempo|expression|marking|layout|spacing)\b/.test(normalized);
  return asksForArrangement && (explicitChordCount > 0 || asksForConcreteLine || !asksOnlyForSurfaceAnnotation);
}

function parseChordRoot(symbol: string) {
  const match = symbol.match(/^([A-G])([#b]?)/);
  if (!match) return null;
  const step = match[1]!;
  const alter = match[2] === '#' ? 1 : match[2] === 'b' ? -1 : 0;
  return { step, alter, pc: (STEP_TO_PC[step] + alter + 12) % 12 };
}

function chordIntervals(symbol: string) {
  const quality = symbol.replace(/^[A-G][#b]?/, '').toLowerCase();
  if (quality.startsWith('dim')) return [0, 3, 6, 9];
  if (quality.startsWith('sus')) return [0, 5, 7, 10];
  if (quality.startsWith('m') && !quality.startsWith('maj')) return [0, 3, 7, 10];
  if (quality.startsWith('maj')) return [0, 4, 7, 11];
  if (quality.includes('7')) return [0, 4, 7, 10];
  return [0, 4, 7, 11];
}

function spelledChordTones(symbol: string) {
  const root = parseChordRoot(symbol);
  if (!root) return [];
  const rootStepIndex = DIATONIC_STEPS.indexOf(root.step as (typeof DIATONIC_STEPS)[number]);
  if (rootStepIndex < 0) return [];

  return chordIntervals(symbol).map((interval, toneIndex) => {
    const step = DIATONIC_STEPS[(rootStepIndex + toneIndex * 2) % DIATONIC_STEPS.length]!;
    const targetPc = (root.pc + interval) % 12;
    const naturalPc = STEP_TO_PC[step];
    let alter = targetPc - naturalPc;
    if (alter > 6) alter -= 12;
    if (alter < -6) alter += 12;
    return { step, alter };
  });
}

function fitChordToneNearSource(tone: { step: string; alter: number }, sourceMidi: number, lift: number) {
  let best = { step: tone.step, alter: tone.alter, octave: 4 };
  let bestDistance = Number.POSITIVE_INFINITY;
  for (let octave = 1; octave <= 8; octave += 1) {
    const candidate = { step: tone.step, alter: tone.alter, octave };
    const distance = Math.abs(writtenPitchToMidi(candidate) - sourceMidi - lift);
    if (distance < bestDistance) {
      best = candidate;
      bestDistance = distance;
    }
  }
  return best;
}

function extractChordSymbolsFromPlan(chordPlan: string | null) {
  if (!chordPlan) return [];
  return chordPlan
    .split(',')
    .map((entry) => normalizeChordSymbol(entry.trim().split(':')[1] ?? ''))
    .filter((entry): entry is string => Boolean(entry));
}

function chooseMaterializedPitch(input: {
  tones: Array<{ step: string; alter: number }>;
  source: NoteEvent;
  noteIndex: number;
}) {
  const { tones, source, noteIndex } = input;
  const sourceMidi = noteToMidi(source);
  const firstTone = tones[DIATONIC_VARIATION_PATTERN[noteIndex % DIATONIC_VARIATION_PATTERN.length] % Math.max(1, tones.length)];
  if (!firstTone) return null;
  let pitch = fitChordToneNearSource(firstTone, sourceMidi, noteIndex % 4 === 3 ? 3 : 0);
  if (
    pitch.step === source.pitch.step
    && pitch.alter === source.pitch.alter
    && pitch.octave === source.pitch.octave
    && tones.length > 1
  ) {
    const nextTone = tones[(DIATONIC_VARIATION_PATTERN[noteIndex % DIATONIC_VARIATION_PATTERN.length] + 1) % tones.length]!;
    pitch = fitChordToneNearSource(nextTone, sourceMidi, 0);
  }
  return pitch;
}

function buildMaterializedArrangementResponse(
  message: string,
  scoped: ScopedNoteInfo[],
  expression: string,
  tempo: number | null,
  chordPlan: string | null,
  instrument: InstrumentKey | null,
  targetPartId?: string,
): ParsedIntentJson | null {
  const explicitChords = extractExplicitChordSymbols(message);
  if (!shouldBuildMaterializedArrangement(message, explicitChords.length)) return null;
  const targetChords = explicitChords.length > 0 ? explicitChords : extractChordSymbolsFromPlan(chordPlan);
  if (targetChords.length === 0) return null;

  const first = scoped[0];
  if (!first) return null;
  const commands: ParsedIntentJson['commands'] = [];
  const touchedVoices = new Set<string>();
  const measureNumbers = [...new Set(scoped.map((entry) => entry.measure.measureNumber))].sort((a, b) => a - b);
  const targetChordPlan = measureNumbers
    .map((measureNumber, index) => `${measureNumber}:${targetChords[index % targetChords.length]}`)
    .join(',');

  commands.push({ type: 'addChords', chords: targetChordPlan });
  commands.push({ type: 'addExpressionText', measureNumber: first.measure.measureNumber, text: expression, placement: 'above' });
  if (tempo) commands.push({ type: 'setTempo', bpm: tempo });
  if (instrument) commands.push({ type: 'fitPartToInstrument', instrument, ...(targetPartId ? { partId: targetPartId } : {}) });

  scoped.forEach((entry, noteIndex) => {
    const voiceKey = `${entry.measure.measureNumber}:${entry.note.staffIndex}:${entry.note.voiceId}`;
    if (!touchedVoices.has(voiceKey)) {
      touchedVoices.add(voiceKey);
      commands.push({
        type: 'clearMeasureVoice',
        measureNumber: entry.measure.measureNumber,
        staffIndex: entry.note.staffIndex,
        voiceId: entry.note.voiceId,
      });
    }

    const measureIndex = Math.max(0, measureNumbers.indexOf(entry.measure.measureNumber));
    const chord = targetChords[measureIndex % targetChords.length]!;
    const tones = spelledChordTones(chord);
    const pitch = chooseMaterializedPitch({ tones, source: entry.note, noteIndex });
    if (!pitch) return;
    commands.push({
      type: 'insertNoteAt',
      measureNumber: entry.measure.measureNumber,
      staffIndex: entry.note.staffIndex,
      voiceId: entry.note.voiceId,
      timestampNum: entry.note.timestampNum,
      timestampDen: entry.note.timestampDen,
      step: pitch.step,
      octave: pitch.octave,
      alter: pitch.alter,
      durationType: entry.note.durationType ?? 'quarter',
      ...(entry.note.isDotted ? { isDotted: true } : {}),
      preserveOverflow: false,
    });
  });

  return {
    commands,
    explanation: explicitChords.length > 0
      ? `I am preparing a notated alternate version over ${targetChords.join(', ')} while preserving the original rhythm.`
      : `I am preparing a notated arrangement from the detected harmony while preserving the original rhythm.`,
    confidence: 'high',
    ambiguities: [],
    plan: [
      'Read the source lick rhythm',
      `Map the arrangement to ${targetChords.join(', ')}`,
      'Replace the selected melody voice with concrete chord-tone motion',
    ],
  };
}

function keyNameFromFifths(fifths: number, german: boolean) {
  const names: Record<number, string> = german
    ? {
        '-7': 'Ces-Dur / as-Moll',
        '-6': 'Ges-Dur / es-Moll',
        '-5': 'Des-Dur / b-Moll',
        '-4': 'As-Dur / f-Moll',
        '-3': 'Es-Dur / c-Moll',
        '-2': 'B-Dur / g-Moll',
        '-1': 'F-Dur / d-Moll',
        0: 'C-Dur / a-Moll',
        1: 'G-Dur / e-Moll',
        2: 'D-Dur / h-Moll',
        3: 'A-Dur / fis-Moll',
        4: 'E-Dur / cis-Moll',
        5: 'H-Dur / gis-Moll',
        6: 'Fis-Dur / dis-Moll',
        7: 'Cis-Dur / ais-Moll',
      }
    : {
        '-7': 'Cb major / Ab minor',
        '-6': 'Gb major / Eb minor',
        '-5': 'Db major / Bb minor',
        '-4': 'Ab major / F minor',
        '-3': 'Eb major / C minor',
        '-2': 'Bb major / G minor',
        '-1': 'F major / D minor',
        0: 'C major / A minor',
        1: 'G major / E minor',
        2: 'D major / B minor',
        3: 'A major / F# minor',
        4: 'E major / C# minor',
        5: 'B major / G# minor',
        6: 'F# major / D# minor',
        7: 'C# major / A# minor',
      };
  return names[fifths] ?? String(fifths);
}

function getFirstTimeSignature(documentState: DocumentState) {
  const core = documentState.coreDocument;
  if (!core) return null;
  for (const part of core.score.parts) {
    for (const staff of part.staves) {
      const sortedMeasures = [...staff.measures].sort((a, b) => a.measureNumber - b.measureNumber);
      for (const measure of sortedMeasures) {
        const time = measure.attributes.find((attribute) => attribute.time)?.time;
        if (time) return time;
      }
    }
  }
  return null;
}

function describePhraseShape(measureCount: number, german: boolean) {
  if (measureCount === 8) return german ? '8 Takte, naheliegend als 4+4-Periode lesbar' : '8 measures, naturally readable as a 4+4 period';
  if (measureCount === 4) return german ? '4 Takte, kurze Vordersatz-/Motivgestalt' : '4 measures, a compact phrase or motive';
  if (measureCount > 8) return german ? `${measureCount} Takte, mehrere Phrasen wahrscheinlich` : `${measureCount} measures, likely multiple phrases`;
  return german ? `${measureCount} Takte, kurze Skizze` : `${measureCount} measures, short sketch`;
}

function buildArrangementResponse(
  message: string,
  documentState: DocumentState,
  selection?: EditorSelection,
  sessionContext?: AiSessionContext,
): ParsedIntentJson | null {
  const scoped = collectArrangementSourceNotes(documentState, selection);
  if (scoped.length === 0) return null;

  const german = isLikelyGerman(message);
  const preferFlats = getDocumentKeyFifths(documentState) < 0;
  const instrument = inferInstrument(message, sessionContext);
  const expression = detectExpressionText(message, german);
  const tempo = detectArrangementTempo(message);
  const chordPlan = buildChordPlan(scoped, preferFlats);
  const commands: ParsedIntentJson['commands'] = [];
  const targetPartId = scoped[0]?.partId;
  const materializedArrangement = buildMaterializedArrangementResponse(message, scoped, expression, tempo, chordPlan, instrument, targetPartId);
  if (materializedArrangement) return materializedArrangement;

  if (chordPlan) commands.push({ type: 'addChords', chords: chordPlan });
  commands.push({ type: 'addExpressionText', measureNumber: scoped[0]!.measure.measureNumber, text: expression, placement: 'above' });
  if (tempo) commands.push({ type: 'setTempo', bpm: tempo });
  if (instrument) commands.push({ type: 'fitPartToInstrument', instrument, ...(targetPartId ? { partId: targetPartId } : {}) });

  const measureCount = new Set(scoped.map((entry) => entry.measure.measureNumber)).size;
  const explanation = german
    ? `Ich bereite ein spielbares Arrangement mit ${chordPlan ? 'passenden Akkordsymbolen' : 'klarer Melodieführung'}, ${expression} und ${tempo ? `einem Tempo von ♩=${tempo}` : 'einem musikantischen Standardtempo'} vor${instrument ? ` und richte die Linie auf ${INSTRUMENT_PROFILES[instrument].labelDe} aus` : ''}.`
    : `I am preparing a playable arrangement with ${chordPlan ? 'supporting chord symbols' : 'a clear melodic lead'}, ${expression}, and ${tempo ? `a tempo of quarter=${tempo}` : 'a musician-friendly default tempo'}${instrument ? ` while fitting the line for ${INSTRUMENT_PROFILES[instrument].labelEn}` : ''}.`;

  return {
    commands,
    explanation,
    confidence: chordPlan ? 'high' : 'medium',
    ambiguities: [],
    plan: german
      ? [
        'Ermittle die melodische Hauptlinie',
        chordPlan ? `Leite Akkorde für ${measureCount} Takte ab` : 'Belasse die Harmonik konservativ',
        'Füge spielpraktische Ausdrucksangaben hinzu',
      ]
      : [
        'Identify the main melodic line',
        chordPlan ? `Derive chords for ${measureCount} measures` : 'Keep harmony conservative',
        'Add practical expression guidance',
      ],
  };
}

function extractExplicitChordTarget(message: string) {
  const includeMatch = message.match(/\binclude\s+([^,.;]+?)(?:\s+(?:as|before|after|for|with)\b|[,.;]|$)/i);
  const raw = includeMatch?.[1]?.trim();
  if (!raw) return null;
  const compact = raw.replace(/\s+/g, '');
  if (/^(?:Ger\+6|[A-G][b#]?(?:m|maj|min|dim|aug|sus)?(?:\d+)?(?:alt)?(?:\/[A-G][b#]?)?)$/i.test(compact)) {
    return compact.replace(/^ger\+6$/i, 'Ger+6');
  }
  return null;
}

function buildHarmonyResponse(message: string, documentState: DocumentState): ParsedIntentJson | null {
  if (/\badd chords?\s*:\s*measure\s+\d+/i.test(message)) return null;
  if (/\badd chord symbols?\s+to\s+measures?\b/i.test(message)) return null;
  if (/\bchord(?:\s+symbols?)?\b/i.test(message) && /\bmeasures?\s+\d/i.test(message)) return null;
  const tokens = tokenizeIntentText(message);
  if (!isHarmonyEditLike(tokens)) return null;

  const targetChord = extractExplicitChordTarget(message);
  const german = isLikelyGerman(message);
  const sourceNotes = detectPrimaryVoiceNotes(documentState);
  const preferFlats = getDocumentKeyFifths(documentState) < 0 || Boolean(targetChord && /b|♭/.test(targetChord));
  const inferredPlan = buildChordPlan(sourceNotes, preferFlats);
  const chords = targetChord && inferredPlan
    ? `${inferredPlan},4:${targetChord}`
    : targetChord
      ? `1:C,2:${targetChord},3:G7,4:${targetChord}`
      : inferredPlan ?? '1:C,2:G,3:Am,4:F';

  return {
    commands: [{ type: 'addChords', chords }],
    explanation: german
      ? targetChord
        ? `Ich bereite Akkordsymbole vor und setze ${targetChord} als ausdrücklich gewünschtes Ziel ein.`
        : 'Ich bereite einen strukturellen Akkordplan als stärkstes lokal verfügbares Harmony-Kommando vor.'
      : targetChord
        ? `I am preparing chord symbols and using ${targetChord} as the requested target chord.`
        : 'I am preparing a structural chord-symbol plan as the strongest locally available harmony command.',
    confidence: 'high',
    ambiguities: [],
    plan: german
      ? ['Leite Akkordsymbole aus der Linie ab', targetChord ? `Setze ${targetChord} als Zielakkord` : 'Dokumentiere die harmonische Idee als strukturellen Plan', 'Halte die Harmonik previewbar']
      : ['Derive chord symbols from the line', targetChord ? `Use ${targetChord} as the target chord` : 'Document the harmonic idea as a structural plan', 'Keep the harmony previewable'],
  };
}

function buildCatalogNotationCleanupResponse(message: string): ParsedIntentJson | null {
  if (!/\b(clean up|normalize|repair|clarify|preserve)\b/i.test(message)) return null;
  if (!/\b(notation|articulations|microtonal|quarter-tone|bow pressure|air sounds|key clicks|extended techniques|performability|musical identity)\b/i.test(message)) return null;
  const german = isLikelyGerman(message);
  return {
    commands: [],
    explanation: german
      ? 'Ich sehe keinen konkreten lokalen Reparaturbefehl, der ohne Modell sicherer wäre; ich belasse die Notation unverändert und beschreibe die konservative Cleanup-Prüfung.'
      : 'I do not see a concrete local repair command that would be safer without a model, so I am leaving the notation unchanged and reporting a conservative cleanup pass.',
    confidence: 'high',
    ambiguities: [],
    plan: german
      ? ['Prüfe Notationsdichte', 'Belasse musikalische Identität unverändert', 'Keine unsichere automatische Reparatur anwenden']
      : ['Inspect notation density', 'Preserve musical identity', 'Apply no uncertain automatic repair'],
  };
}

function summarizeHotspots(notes: ScopedNoteInfo[]) {
  const byMeasure = new Map<number, { notes: NoteEvent[]; leaps: number[] }>();
  notes.forEach(({ note, measure }) => {
    const bucket = byMeasure.get(measure.measureNumber) ?? { notes: [], leaps: [] };
    bucket.notes.push(note);
    byMeasure.set(measure.measureNumber, bucket);
  });
  for (const bucket of byMeasure.values()) {
    const sorted = [...bucket.notes].sort((a, b) => a.timestampNum - b.timestampNum);
    for (let index = 1; index < sorted.length; index += 1) {
      bucket.leaps.push(Math.abs(noteToMidi(sorted[index]) - noteToMidi(sorted[index - 1])));
    }
  }

  return [...byMeasure.entries()]
    .map(([measureNumber, bucket]) => ({
      measureNumber,
      noteCount: bucket.notes.length,
      largestLeap: bucket.leaps.length > 0 ? Math.max(...bucket.leaps) : 0,
      score: bucket.notes.length + (bucket.leaps.length > 0 ? Math.max(...bucket.leaps) / 2 : 0),
    }))
    .sort((a, b) => b.score - a.score)
    .slice(0, 4);
}

function percentile(values: number[], q: number) {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const index = Math.min(sorted.length - 1, Math.max(0, Math.round((sorted.length - 1) * q)));
  return sorted[index];
}

function buildAnalysisSummary(
  message: string,
  documentState: DocumentState,
  selection?: EditorSelection,
  sessionContext?: AiSessionContext,
): ParsedIntentJson | null {
  const scoped = collectScopedNotes(documentState, selection)
    .sort((a, b) => a.note.measureNumber - b.note.measureNumber || a.note.timestampNum - b.note.timestampNum);
  if (scoped.length === 0) return null;

  const german = isLikelyGerman(message);
  const preferFlats = getDocumentKeyFifths(documentState) < 0;
  const keyName = keyNameFromFifths(getDocumentKeyFifths(documentState), german);
  const time = getFirstTimeSignature(documentState);
  const measureNumbers = [...new Set(scoped.map((entry) => entry.measure.measureNumber))].sort((a, b) => a - b);
  const phraseShape = describePhraseShape(measureNumbers.length, german);
  const chordPlan = buildChordPlan(scoped, preferFlats);
  const notes = scoped.map((entry) => entry.note);
  const rhythmTypes = [...new Set(notes.map((note) => durationLabel(note)))].slice(0, 5).join(', ');
  const midiValues = notes.map(noteToMidi);
  const sortedByPitch = [...notes].sort((a, b) => noteToMidi(a) - noteToMidi(b));
  const lowest = sortedByPitch[0];
  const highest = sortedByPitch[sortedByPitch.length - 1];
  const span = noteToMidi(highest) - noteToMidi(lowest);
  const tessituraLow = percentile(midiValues, 0.1);
  const tessituraHigh = percentile(midiValues, 0.9);
  let totalLeap = 0;
  let leapCount = 0;
  for (let index = 1; index < notes.length; index += 1) {
    totalLeap += Math.abs(noteToMidi(notes[index]) - noteToMidi(notes[index - 1]));
    leapCount += 1;
  }
  const averageLeap = leapCount > 0 ? totalLeap / leapCount : 0;
  const hotspots = summarizeHotspots(scoped);
  const breathingCandidates = hotspots
    .filter((entry) => entry.noteCount <= 4 && entry.largestLeap <= 5)
    .slice(-2)
    .map((entry) => entry.measureNumber);

  const warnings: string[] = [];
  const suggestions: string[] = [];
  const instrument = inferInstrument(message, sessionContext);
  const profile = instrument ? INSTRUMENT_PROFILES[instrument] : null;
  if (span > 24) warnings.push(german ? 'Der Umfang ist weiter als zwei Oktaven.' : 'The range spans more than two octaves.');
  if (averageLeap > 5) warnings.push(german ? 'Die mittlere Sprungweite ist relativ groß.' : 'The average melodic leap is relatively large.');
  if (hotspots[0]?.noteCount >= 6) warnings.push(german ? `Takt ${hotspots[0].measureNumber} ist rhythmisch dicht.` : `Measure ${hotspots[0].measureNumber} is rhythmically dense.`);
  if (hotspots[0]?.largestLeap >= 9) warnings.push(german ? `Takt ${hotspots[0].measureNumber} enthält einen großen Sprung.` : `Measure ${hotspots[0].measureNumber} contains a large leap.`);
  if (profile) {
    if (noteToMidi(lowest) < profile.minMidi || noteToMidi(highest) > profile.maxMidi) {
      warnings.push(german
        ? `${profile.labelDe} liegt teilweise außerhalb der bequemen Lage.`
        : `The line partly sits outside the comfortable ${profile.labelEn} range.`);
      suggestions.push(german
        ? `Passe die Stimme an ${profile.labelDe} an oder oktaviere einzelne Passagen um.`
        : `Fit the part for ${profile.labelEn} or octave-shift the exposed passages.`);
    }
  }
  if (breathingCandidates.length > 0 && instrument === 'voice') {
    suggestions.push(german
      ? `Mögliche Atemstellen liegen nach Takt ${breathingCandidates.join(' und ')}.`
      : `Likely breathing points appear after measures ${breathingCandidates.join(' and ')}.`);
  }
  if (hotspots.some((entry) => entry.noteCount >= 6 || entry.largestLeap >= 9)) {
    suggestions.push(german
      ? 'Für eine einfachere Fassung sollten die dichtesten Takte rhythmisch ausgedünnt oder große Sprünge oktaviert werden.'
      : 'For an easier version, thin out the densest measures or octave-shift the largest leaps.');
  }

  const hotspotSummary = hotspots.length > 0
    ? (german
      ? `Hotspots: ${hotspots.map((entry) => `T.${entry.measureNumber} (${entry.noteCount} Noten, größter Sprung ${entry.largestLeap})`).join(', ')}.`
      : `Hotspots: ${hotspots.map((entry) => `m.${entry.measureNumber} (${entry.noteCount} notes, largest leap ${entry.largestLeap})`).join(', ')}.`)
    : '';

  const tessituraSummary = german
    ? `Tessitura etwa ${tessituraLow} bis ${tessituraHigh} MIDI.`
    : `Tessitura is roughly MIDI ${tessituraLow} to ${tessituraHigh}.`;
  const suggestionSummary = suggestions.length > 0 ? ` ${suggestions.join(' ')}` : '';
  const explanation = german
    ? [
        `Analyse: Tonart ${keyName}; Taktart ${time ? `${time.beats}/${time.beatType}` : 'nicht eindeutig'}; Form/Phrasen: ${phraseShape}.`,
        `Melodie: ${notes.length} Noten, Umfang ${noteLabel(lowest)} bis ${noteLabel(highest)} (${span} Halbtöne), mittlere Sprungweite ${averageLeap.toFixed(1)} Halbtöne. ${tessituraSummary}`,
        `Harmonie: ${chordPlan ? `naheliegende Akkorde ${chordPlan}` : 'aus der Linie nur vorsichtig ableitbar'}. Rhythmus: vor allem ${rhythmTypes || 'gleichmäßige Werte'}; Spannungsbogen entsteht durch Register und Zielnoten.`,
        `${hotspotSummary}${warnings.length ? ` ${warnings.join(' ')}` : ''}${suggestionSummary}`,
        'Feedback: Der melodische Kern ist klar, sollte aber durch eine bewusstere Kadenz, leichte dynamische Kurve und eine einfache Bass- oder Akkordstütze präzisiert werden. Nächste Schritte: 1. schlichte Kadenzbegleitung, 2. melodische Variation in T.5-8, 3. kontrastierender Mittelteil mit neuer Lage.',
      ].filter((entry) => entry.trim().length > 0).join(' ')
    : [
        `Analysis: key ${keyName}; meter ${time ? `${time.beats}/${time.beatType}` : 'unclear'}; form/phrasing: ${phraseShape}.`,
        `Melody: ${notes.length} notes, range ${noteLabel(lowest)} to ${noteLabel(highest)} (${span} semitones), average leap ${averageLeap.toFixed(1)} semitones. ${tessituraSummary}`,
        `Harmony: ${chordPlan ? `likely chords ${chordPlan}` : 'only cautiously inferable from the line'}. Rhythm: mainly ${rhythmTypes || 'even values'}; the tension curve comes from register and goal notes.`,
        `${hotspotSummary}${warnings.length ? ` ${warnings.join(' ')}` : ''}${suggestionSummary}`,
        'Feedback: The melodic core is clear, but it needs a more intentional cadence, a light dynamic shape, and a simple bass or chord support. Next steps: 1. plain cadential accompaniment, 2. melodic variation in the second phrase, 3. contrasting middle section in a new register.',
      ].filter((entry) => entry.trim().length > 0).join(' ');

  return {
    commands: [],
    explanation,
    confidence: 'high',
    ambiguities: [],
    plan: german
      ? ['Analysiere Umfang, Tessitura und Sprungweite', 'Markiere spielpraktische Hotspots', 'Leite konkrete Übe- oder Vereinfachungshinweise ab']
      : ['Inspect range, tessitura, and leap profile', 'Identify practical hotspots', 'Derive concrete practice or simplification guidance'],
  };
}

function parseRequestedMeasureRange(message: string) {
  const normalized = message.toLowerCase();
  const rangeMatch = normalized.match(/\b(?:m\.?|measure|measures|t\.?|takt|takte)\s*(\d+)\s*(?:-|–|—|bis|to)\s*(\d+)\b/);
  if (rangeMatch) {
    const start = Number.parseInt(rangeMatch[1], 10);
    const end = Number.parseInt(rangeMatch[2], 10);
    if (Number.isFinite(start) && Number.isFinite(end)) {
      return { start: Math.min(start, end), end: Math.max(start, end) };
    }
  }

  const singleMatch = normalized.match(/\b(?:m\.?|measure|t\.?|takt)\s*(\d+)\b/);
  if (singleMatch) {
    const measureNumber = Number.parseInt(singleMatch[1], 10);
    if (Number.isFinite(measureNumber)) return { start: measureNumber, end: measureNumber };
  }

  return null;
}

function durationLabel(note: NoteEvent) {
  if (note.durationType) return `${note.durationType}${note.isDotted ? '.' : ''}`;
  return `${note.durationDivisions}${note.isDotted ? '.' : ''}`;
}

function buildScoreReadingSummary(
  message: string,
  documentState: DocumentState,
  selection?: EditorSelection,
): ParsedIntentJson | null {
  const scoped = collectScopedNotes(documentState, selection)
    .sort((a, b) => (
      a.measure.measureNumber - b.measure.measureNumber
      || a.note.staffIndex - b.note.staffIndex
      || a.note.voiceId - b.note.voiceId
      || a.note.timestampNum / a.note.timestampDen - b.note.timestampNum / b.note.timestampDen
    ));
  if (scoped.length === 0) return null;

  const german = isLikelyGerman(message);
  const requestedRange = parseRequestedMeasureRange(message);
  const minMeasure = requestedRange?.start ?? Math.min(...scoped.map((entry) => entry.measure.measureNumber));
  const maxMeasure = requestedRange?.end ?? Math.max(...scoped.map((entry) => entry.measure.measureNumber));
  const scopedRange = scoped.filter((entry) => (
    entry.measure.measureNumber >= minMeasure && entry.measure.measureNumber <= maxMeasure
  ));
  if (scopedRange.length === 0) return null;

  const grouped = new Map<number, ScopedNoteInfo[]>();
  scopedRange.forEach((entry) => {
    const bucket = grouped.get(entry.measure.measureNumber) ?? [];
    bucket.push(entry);
    grouped.set(entry.measure.measureNumber, bucket);
  });

  const lines: string[] = [];
  for (let measureNumber = minMeasure; measureNumber <= maxMeasure; measureNumber += 1) {
    const notes = grouped.get(measureNumber) ?? [];
    if (notes.length === 0) {
      lines.push(german ? `T.${measureNumber}: keine Noten im gelesenen Bereich` : `m.${measureNumber}: no notes in the readable scope`);
      continue;
    }
    const byLane = new Map<string, ScopedNoteInfo[]>();
    notes.forEach((entry) => {
      const key = `${entry.partName} staff ${entry.note.staffIndex} voice ${entry.note.voiceId}`;
      const bucket = byLane.get(key) ?? [];
      bucket.push(entry);
      byLane.set(key, bucket);
    });
    const laneText = [...byLane.entries()].map(([lane, entries]) => {
      const noteText = entries.map(({ note }) => `${noteLabel(note)}/${durationLabel(note)}`).join(' ');
      return `${lane}: ${noteText}`;
    }).join('; ');
    lines.push(german ? `T.${measureNumber}: ${laneText}` : `m.${measureNumber}: ${laneText}`);
  }

  const explanation = german
    ? `Gelesener Partiturinhalt Takt ${minMeasure}-${maxMeasure}: ${lines.join(' | ')}`
    : `Readable score content measures ${minMeasure}-${maxMeasure}: ${lines.join(' | ')}`;

  return {
    commands: [],
    explanation,
    confidence: 'high',
    ambiguities: [],
    plan: german
      ? ['Lese vorhandene Noten aus der Partitur', 'Gruppiere nach Takt, System und Stimme']
      : ['Read existing notes from the score', 'Group by measure, staff, and voice'],
  };
}

function buildPracticeResponse(
  message: string,
  documentState: DocumentState,
  sessionContext?: AiSessionContext,
): ParsedIntentJson | null {
  const core = documentState.coreDocument;
  if (!core) return null;
  const german = isLikelyGerman(message);
  const highestMeasure = Math.max(...core.score.parts.flatMap((part) => part.staves.flatMap((staff) => staff.measures.map((measure) => measure.measureNumber))), 1);
  const instrument = inferInstrument(message, sessionContext);
  const practiceProfile = sessionContext?.taskState?.practiceProfile ?? 'rehearsal';
  const commands: ParsedIntentJson['commands'] = [
    { type: 'setTempo', bpm: 80 },
    { type: 'addRehearsalMarksEvery', interval: 4, startMeasureNumber: 1, endMeasureNumber: highestMeasure, style: 'letters' },
    { type: 'applyPracticeProfile', profile: practiceProfile, startMeasureNumber: 1, endMeasureNumber: highestMeasure },
  ];
  if (instrument) {
    commands.push({ type: 'fitPartToInstrument', instrument });
  }
  if (/\b(cantabile|gesanglich|singable|singbar)\b/i.test(message)) {
    commands.push({ type: 'addExpressionText', measureNumber: 1, text: german ? 'cantabile' : 'cantabile', placement: 'above' });
  }

  return {
    commands,
    explanation: german
      ? `Ich bereite eine Probeversion mit langsamem Tempo, Probezeichen alle vier Takte und ${practiceProfile === 'roomy' ? 'luftigerem' : 'probenfreundlichem'} Layout vor${instrument ? ` und richte die Stimme auf ${INSTRUMENT_PROFILES[instrument].labelDe} aus` : ''}.`
      : `I am preparing a practice version with a slower tempo, rehearsal marks every four measures, and a ${practiceProfile === 'roomy' ? 'roomier' : 'rehearsal-friendly'} layout${instrument ? ` while fitting the part for ${INSTRUMENT_PROFILES[instrument].labelEn}` : ''}.`,
    confidence: 'high',
    ambiguities: [],
    plan: german
      ? ['Setze Probentempo', 'Füge regelmäßige Probezeichen hinzu', 'Wende ein practice-freundliches Profil an']
      : ['Set rehearsal tempo', 'Add regular rehearsal marks', 'Apply a practice-friendly profile'],
  };
}

function foldText(value: string) {
  let folded = '';
  for (const char of value.toLocaleLowerCase('de-AT').normalize('NFD')) {
    const code = char.charCodeAt(0);
    if (code >= 0x0300 && code <= 0x036f) continue;
    folded += char;
  }
  return folded;
}

function isWordChar(char: string) {
  const folded = foldText(char);
  return (folded >= 'a' && folded <= 'z') || (folded >= '0' && folded <= '9');
}

function tokenizeIntentText(value: string) {
  const tokens: string[] = [];
  let current = '';
  for (const char of value) {
    const folded = foldText(char);
    if (isWordChar(folded)) {
      current += folded;
      continue;
    }
    if (current) {
      tokens.push(current);
      current = '';
    }
  }
  if (current) tokens.push(current);
  return tokens;
}

function hasTokenWithStem(tokens: string[], stems: string[]) {
  return tokens.some((token) => stems.some((stem) => token.startsWith(stem)));
}

function editDistanceWithin(left: string, right: string, maxDistance: number) {
  if (Math.abs(left.length - right.length) > maxDistance) return false;
  const previous = Array.from({ length: right.length + 1 }, (_, index) => index);
  const current = Array.from({ length: right.length + 1 }, () => 0);

  for (let leftIndex = 1; leftIndex <= left.length; leftIndex += 1) {
    current[0] = leftIndex;
    let rowMin = current[0];
    for (let rightIndex = 1; rightIndex <= right.length; rightIndex += 1) {
      const substitutionCost = left[leftIndex - 1] === right[rightIndex - 1] ? 0 : 1;
      current[rightIndex] = Math.min(
        previous[rightIndex] + 1,
        current[rightIndex - 1] + 1,
        previous[rightIndex - 1] + substitutionCost,
      );
      rowMin = Math.min(rowMin, current[rightIndex]);
    }
    if (rowMin > maxDistance) return false;
    for (let index = 0; index <= right.length; index += 1) previous[index] = current[index];
  }

  return previous[right.length] <= maxDistance;
}

function mentionsMelody(tokens: string[]) {
  if (hasTokenWithStem(tokens, ['melodie', 'melody', 'tune', 'thema', 'motiv'])) return true;
  return tokens.some((token) => (
    token.length >= 5
    && (editDistanceWithin(token, 'melodie', 2) || editDistanceWithin(token, 'melody', 2))
  ));
}

function isAnalysisLike(tokens: string[]) {
  return hasTokenWithStem(tokens, ['analys', 'lies', 'lese', 'zeige', 'liste', 'inhalt', 'wieder', 'read', 'show', 'list', 'summar']);
}

function isHarmonyEditLike(tokens: string[]) {
  return hasTokenWithStem(tokens, [
    'chord', 'harmony', 'harmon', 'reharmon', 'progression',
    'akkord', 'kadenz',
  ]);
}

function hasMelodyCreationVerb(tokens: string[]) {
  return hasTokenWithStem(tokens, ['create', 'writ', 'compos', 'insert', 'add', 'generat', 'make', 'draft'])
    || hasTokenWithStem(tokens, ['erstell', 'schreib', 'komponier', 'fug', 'mach', 'setz', 'notier', 'generier']);
}

function hasCompositionCreationVerb(tokens: string[]) {
  return hasTokenWithStem(tokens, ['create', 'writ', 'compos', 'generat', 'draft', 'design'])
    || hasTokenWithStem(tokens, ['erstell', 'schreib', 'komponier', 'notier', 'generier']);
}

function wantsSimpleDefaultMelody(tokens: string[]) {
  return hasTokenWithStem(tokens, ['simple', 'easy', 'basic', 'default', 'quick', 'draft', 'sketch'])
    || hasTokenWithStem(tokens, ['einfach', 'leicht', 'standard', 'schnell', 'skizz']);
}

function hasCreativeBrief(tokens: string[]) {
  return hasTokenWithStem(tokens, [
    'jazz', 'swing', 'blues', 'rock', 'pop', 'folk', 'klass', 'barock', 'romant',
    'modern', 'modal', 'minor', 'major', 'dur', 'moll', 'lyrisch', 'lyrical',
    'ruhig', 'langsam', 'schnell', 'lebhaft', 'cantabile', 'dolce', 'dramatisch',
    'traurig', 'frohlich', 'fröhlich', 'tanz', 'walzer', 'march', 'marsch',
    'piano', 'klavier', 'violin', 'geige', 'flute', 'flote', 'floete', 'gesang',
    'voice', 'guitar', 'gitarre',
  ]) || tokens.some((token) => /^[0-9]{2,3}bpm$/.test(token));
}

function shouldAskForMelodyBrief(message: string) {
  const tokens = tokenizeIntentText(message);
  if (!hasCompositionSubject(tokens) || isAnalysisLike(tokens)) return false;
  if (isHarmonyEditLike(tokens)) return false;
  if (!hasCompositionCreationVerb(tokens)) return false;
  return !wantsSimpleDefaultMelody(tokens) && !hasCreativeBrief(tokens) && !hasSufficientCompositionBrief(tokens);
}

function hasCompositionSubject(tokens: string[]) {
  return mentionsMelody(tokens)
    || hasTokenWithStem(tokens, ['period', 'response', 'variation', 'transform', 'theme', 'phrase', 'motive', 'motiv', 'composition', 'capstone', 'fugato', 'miniature', 'modulation', 'study', 'counterpoint', 'cue', 'groove', 'layer', 'arc', 'leitmotif', 'klangfarbenmelodie']);
}

function hasSufficientCompositionBrief(tokens: string[]) {
  return hasTokenWithStem(tokens, ['bar', 'measure', 'takt', 'cadence', 'contour', 'rhythm', 'motive', 'motiv', 'modal', 'period', 'variation', 'register', 'registr', 'contrast', 'high', 'strict', 'sync', 'pulse', 'bass', 'form']);
}

function shouldCreateSimpleMelody(message: string) {
  const tokens = tokenizeIntentText(message);
  if (!hasCompositionSubject(tokens) || isAnalysisLike(tokens)) return false;
  if (!hasCompositionCreationVerb(tokens)) return false;
  if (isHarmonyEditLike(tokens) && !hasSufficientCompositionBrief(tokens)) return false;
  return wantsSimpleDefaultMelody(tokens) || hasCreativeBrief(tokens) || hasSufficientCompositionBrief(tokens);
}

function containsInlineNoteSource(message: string) {
  const noteTokens = message.match(/\b[A-Ga-g](?:[#b])?(?:-?\d)?\b/g) ?? [];
  return noteTokens.length >= 4 || (noteTokens.length >= 3 && /[\n|]/.test(message));
}

function isKnownSongTitleCandidate(candidate: string) {
  return ![
    'auswahl', 'chat', 'der', 'diese', 'dieser', 'dieses', 'hier', 'measure',
    'mir', 'oben', 'partitur', 'score', 'selection', 'staff', 'stimme', 'system',
    'takt', 'the', 'this', 'unten', 'voice',
  ].includes(candidate);
}

function hasCandidateMatch(folded: string, pattern: RegExp, options?: { skipStylePrefix?: boolean }) {
  pattern.lastIndex = 0;
  let match = pattern.exec(folded);
  while (match) {
    const candidate = match[1] ?? '';
    const prefix = folded.slice(0, match.index);
    if (
      (!options?.skipStylePrefix || !/(?:\bstil|\bstyle)\s+$/.test(prefix))
      && isKnownSongTitleCandidate(candidate)
    ) {
      return true;
    }
    match = pattern.exec(folded);
  }
  return false;
}

function hasKnownSongTitleCue(message: string) {
  const folded = foldText(message);
  return hasCandidateMatch(folded, /\b(?:von|zu)\s+["']?([a-z0-9][a-z0-9'-]*)/gi, { skipStylePrefix: true });
}

function hasKnownSongTransformCue(tokens: string[]) {
  return hasTokenWithStem(tokens, [
    'adapt', 'adaption', 'arrang', 'bearbeit', 'paraphras', 'reharmon',
    'transform', 'variat', 'variation', 'variier',
  ]);
}

function hasKnownSongTransformTitleCue(message: string) {
  const folded = foldText(message);
  return hasCandidateMatch(folded, /\b(?:uber|ueber|about|over|nach)\s+["']?([a-z0-9][a-z0-9'-]*)/gi)
    || hasCandidateMatch(folded, /\b(?:based on|basierend auf|auf basis von)\s+["']?([a-z0-9][a-z0-9'-]*)/gi)
    || hasCandidateMatch(folded, /\bvariations?\s+(?:on|about|over)\s+["']?([a-z0-9][a-z0-9'-]*)/gi)
    || hasCandidateMatch(folded, /\bvariationen?\s+(?:uber|ueber|nach)\s+["']?([a-z0-9][a-z0-9'-]*)/gi);
}

function isKnownSongNotationRequest(message: string) {
  if (containsInlineNoteSource(message)) return false;
  const folded = foldText(message);
  const tokens = tokenizeIntentText(message);
  const hasCreationCue = hasMelodyCreationVerb(tokens);
  const hasMelodyOrSongCue = mentionsMelody(tokens) || hasTokenWithStem(tokens, ['lied', 'song', 'stuck', 'stueck']);
  const hasNamedSourceCue = hasKnownSongTitleCue(message);
  const hasTransformCue = hasKnownSongTransformCue(tokens);
  const hasTransformTitleCue = hasKnownSongTransformTitleCue(message);
  const hasRightsSafeCue = /\b(public domain|creative commons|cc0|cc by|lizenz|license|quelle|source|erlaubt|allowed)\b/i.test(folded);
  return hasCreationCue && (
    (hasMelodyOrSongCue && (hasNamedSourceCue || hasRightsSafeCue))
    || (hasTransformCue && (hasNamedSourceCue || hasTransformTitleCue || hasRightsSafeCue))
  );
}

function buildKnownSongSourceRequiredResponse(message: string): ParsedIntentJson | null {
  if (!isKnownSongNotationRequest(message)) return null;
  const german = isLikelyGerman(message);
  return {
    commands: [],
    explanation: german
      ? 'Um Urheberrechte zu wahren und eine exakte Notation zu garantieren, benötige ich eine Quelldatei oder geprüfte Quelle, z. B. MusicXML, MIDI oder PDF. Der Katalogimport ist noch nicht aktiv; lade bitte eine erlaubte Datei hoch oder gib die Noten als Text ein.'
      : 'To respect copyright and guarantee exact notation, I need a source file or verified source, such as MusicXML, MIDI, or PDF. Catalog import is not active yet; upload an allowed file or provide the notes as text.',
    confidence: 'low',
    ambiguities: german
      ? ['Quelldatei oder geprüfte Quelle fehlt', 'Katalogimport noch nicht aktiv']
      : ['No verified source selected', 'Catalog import is not active yet'],
    plan: german
      ? ['Quelle prüfen', 'Erlaubte Datei oder Noteneingabe importieren', 'Danach über den Core-Import notieren']
      : ['Verify the source', 'Import an allowed file or note input', 'Then notate through core import'],
  };
}

function documentMeasureBounds(documentState: DocumentState) {
  const measures = documentState.coreDocument?.score.parts.flatMap((part) => (
    part.staves.flatMap((staff) => staff.measures.map((measure) => measure.measureNumber))
  )) ?? [];
  if (measures.length === 0) return { start: 1, end: 1 };
  return { start: Math.min(...measures), end: Math.max(...measures) };
}

function primaryPartTarget(documentState: DocumentState) {
  const part = documentState.coreDocument?.score.parts[0];
  return part ? { partId: part.sourcePartId, partName: part.name } : {};
}

function inferTechniqueInstrument(message: string) {
  const normalized = message.toLowerCase();
  if (/\bviolin|geige|sul ponticello|bow pressure|scratch tone\b/.test(normalized)) return 'violin';
  if (/\bcello\b/.test(normalized)) return 'cello';
  if (/\bflute|air sound|flöte|floete\b/.test(normalized)) return 'flute';
  if (/\bclarinet|key click|klarinette\b/.test(normalized)) return 'clarinet';
  if (/\btrumpet|trompete\b/.test(normalized)) return 'trumpet';
  if (/\bvoice|vocal|gesang|stimme\b/.test(normalized)) return 'voice';
  return 'ensemble';
}

function semanticRangeFromMessage(message: string, documentState: DocumentState) {
  const explicit = parseRequestedMeasureRange(message);
  if (explicit) return explicit;
  const bounds = documentMeasureBounds(documentState);
  return { start: bounds.start, end: Math.min(bounds.end, bounds.start + 3) };
}

type SemanticAnalysisType = 'schenkerian' | 'romanNumeral' | 'forteSet' | 'chordScale' | 'neoRiemannian' | 'form' | 'motivic' | 'other';

function analysisTypeFromMessage(message: string): SemanticAnalysisType {
  const normalized = message.toLowerCase();
  if (/\bschenker|urlinie|ursatz|bassbrechung\b/.test(normalized)) return 'schenkerian';
  if (/\broman numeral|stufe|stufen|funktion\b/.test(normalized)) return 'romanNumeral';
  if (/\bforte|set[- ]class|prime form|interval vector\b/.test(normalized)) return 'forteSet';
  if (/\bchord[- ]scale|available tension|avoid note|modal color\b/.test(normalized)) return 'chordScale';
  if (/\bneo[- ]riemannian|\bplr\b|hexatonic|parsimonious\b/.test(normalized)) return 'neoRiemannian';
  if (/\bmotiv|motive|motivic\b/.test(normalized)) return 'motivic';
  if (/\bform|phrase|process|cadence\b/.test(normalized)) return 'form';
  return 'other';
}

function analysisAnnotationText(type: ReturnType<typeof analysisTypeFromMessage>, message: string) {
  const normalized = message.toLowerCase();
  if (type === 'schenkerian') return 'Urlinie candidate, Bassbrechung, prolongation, middleground diminutions, and structural cadence require analyst confirmation.';
  if (type === 'romanNumeral') return 'Roman-numeral layer: mark local function and cadence goal without changing pitches.';
  if (type === 'forteSet') return 'Forte set-class layer: prime form, Forte number, interval vector, invariance, and registral partitioning.';
  if (type === 'chordScale') return 'Chord-scale layer: available tensions, avoid notes, modal color, and melodic fit.';
  if (type === 'neoRiemannian') return 'Neo-Riemannian layer: PLR chain, parsimonious voice leading, hexatonic region, and tonal ambiguity.';
  if (type === 'motivic') return 'Motivic layer: identify cell, transformations, saturation, and formal role.';
  if (type === 'form') return 'Form layer: phrase function, cadence weight, process, and weak structural point.';
  if (/\bforte\s*\d+-\d+\b/i.test(message)) return message.match(/\bforte\s*\d+-\d+\b/i)?.[0] ?? 'Forte set-class annotation';
  return 'Analytical annotation; verify exact labels against the score before publication.';
}

function buildSemanticCommandResponse(
  message: string,
  workflow: AiWorkflowKind,
  documentState: DocumentState,
): ParsedIntentJson | null {
  const normalized = message.toLowerCase();
  const range = semanticRangeFromMessage(message, documentState);
  const target = primaryPartTarget(documentState);
  const german = isLikelyGerman(message);

  if (
    (workflow === 'analysis' || workflow === 'arrangement-assist')
    && /\b(sync point|sync points|hit point|hit points|timecode|tempo map|cue point|cue points|dialogue|dialog|underscoring|streamer|punch)\b/.test(normalized)
  ) {
    const timecodeMatch = message.match(/\b\d{1,2}:\d{2}:\d{2}(?::\d{2})?\b/);
    return {
      commands: [{
        type: 'addSyncPoint',
        measureNumber: range.start,
        timestampNum: 0,
        timestampDen: 4,
        ...(timecodeMatch ? { timecode: timecodeMatch[0] } : {}),
        label: /\bdialogue|dialog\b/.test(normalized) ? 'dialogue-safe cue' : 'primary sync point',
        scoringIntent: /\bdialogue|dialog\b/.test(normalized)
          ? 'leave speech-frequency space and keep harmonic motion psychologically active'
          : 'anchor the cue timing while preserving musical phrasing',
      }],
      explanation: 'I am adding a visible sync point as the strongest concrete scoring command.',
      confidence: 'high',
      ambiguities: [],
      plan: ['Mark sync position', 'Keep scoring intent visible'],
    };
  }

  if (/\b(lachenmann|extended technique|aleatoric|contemporary notation|bow pressure|air sound|key click|scratch tone|sul ponticello|multiphonic|noise component)\b/.test(normalized)) {
    return {
      commands: [{
        type: 'addTechniqueInstruction',
        instrument: inferTechniqueInstrument(message),
        startMeasureNumber: range.start,
        endMeasureNumber: range.end,
        text: /\bbow pressure|scratch tone|sul ponticello\b/.test(normalized)
          ? 'extended string technique: specify contact point, bow pressure, noise component, and duration'
          : 'contemporary technique instruction: preserve performer agency and notation clarity',
      }],
      explanation: 'I am adding the extended technique as visible performance text; the exact part remains review-gated.',
      confidence: 'medium',
      ambiguities: target.partName ? [`Confirm target part: ${target.partName}`] : ['Confirm target instrument/part'],
      plan: ['Identify technique span', 'Add visible performance instruction'],
    };
  }

  const orchestrationLike = /\b(reduce|revoice|orchestrat|design|create|diagnose)\b/.test(normalized)
    && /\b(orchestrat|reduction|mahler|strauss|hybrid orchestra|hybrid orchestral|timbral blend|klangfarben|spatial audio|spatial production|panning|mix space)\b/.test(normalized);
  if (orchestrationLike && (workflow === 'arrangement-assist' || workflow === 'analysis')) {
    return {
      commands: [{
        type: 'addOrchestrationNote',
        ...target,
        startMeasureNumber: range.start,
        endMeasureNumber: range.end,
        instruction: /\bspatial|panning|mix space\b/.test(normalized)
          ? 'define foreground hierarchy, depth, motion arc, and mono-compatibility risk before changing voicing'
          : 'document hierarchy, timbral blend, register balance, and reduction/voicing intent before material rewrite',
      }],
      explanation: 'I am capturing the orchestration intent as a visible, previewable note.',
      confidence: 'high',
      ambiguities: [],
      plan: ['Identify orchestration span', 'Add visible orchestration note', 'Keep large voicing changes previewable'],
    };
  }

  if (workflow === 'analysis' && /\b(schenker\w*|roman numeral|forte|set[- ]class|prime form|interval vector|chord[- ]scale|neo[- ]riemannian|\bplr\b|form|motivic|motive)\b/.test(normalized)) {
    const type = analysisTypeFromMessage(message);
    return {
      commands: [{
        type: 'addAnalysisAnnotation',
        analysisType: type,
        startMeasureNumber: range.start,
        endMeasureNumber: range.end,
        text: analysisAnnotationText(type, message),
      }],
      explanation: 'I am adding the analysis as a visible annotation instead of inventing notes.',
      confidence: 'high',
      ambiguities: [],
      plan: ['Identify analytical scope', 'Add visible analysis annotation'],
    };
  }

  return null;
}

function requestedMeasureCount(message: string) {
  const tokens = tokenizeIntentText(message);
  const wordCounts: Record<string, number> = {
    ein: 1,
    eine: 1,
    zwei: 2,
    drei: 3,
    vier: 4,
    'fünf': 5,
    fuenf: 5,
    sechs: 6,
    sieben: 7,
    acht: 8,
    neun: 9,
    zehn: 10,
    elf: 11,
    'zwölf': 12,
    zwoelf: 12,
  };
  const unitStems = ['bar', 'measure', 'takt'];
  for (let index = 0; index < tokens.length; index += 1) {
    const token = tokens[index] ?? '';
    const next = tokens[index + 1] ?? '';
    const nextIsUnit = unitStems.some((stem) => next.startsWith(stem));
    const isDigits = token.length > 0 && [...token].every((char) => char >= '0' && char <= '9');
    if (isDigits && nextIsUnit) {
      const count = Number.parseInt(token, 10);
      if (Number.isFinite(count)) return Math.min(16, Math.max(1, count));
    }
    const wordEntry = Object.entries(wordCounts).find(([word]) => token === word || token.startsWith(`${word}takt`));
    if (wordEntry && (nextIsUnit || token.includes('takt'))) {
      return Math.min(16, Math.max(1, wordEntry[1]));
    }
  }
  return 8;
}

function detectMelodyTargetStaff(documentState: DocumentState, message: string) {
  const folded = foldText(message);
  if (folded.includes('left hand') || folded.includes('linke hand') || folded.includes('bass')) return 2;
  if (folded.includes('right hand') || folded.includes('rechte hand') || folded.includes('upper staff') || folded.includes('oberes system')) return 1;
  const firstPart = documentState.coreDocument?.score.parts[0];
  const staffCount = firstPart?.staves.length ?? 1;
  return staffCount >= 2 ? 1 : 1;
}

function buildMelodyBriefQuestion(message: string): ParsedIntentJson | null {
  if (!shouldAskForMelodyBrief(message)) return null;
  const german = isLikelyGerman(message);
  const measureCount = requestedMeasureCount(message);
  return {
    commands: [],
    explanation: german
      ? `Gern. Welchen Stil, welches Tempo und welchen Charakter soll die ${measureCount}-taktige Melodie haben?`
      : `Sure. What style, tempo, and character should the ${measureCount}-bar melody have?`,
    confidence: 'low',
    ambiguities: german
      ? ['Stil fehlt', 'Tempo fehlt', 'Charakter oder Zielinstrument fehlt']
      : ['Style is missing', 'Tempo is missing', 'Character or target instrument is missing'],
    plan: german
      ? ['Kläre Stil und Tempo', 'Lege Tonart und Charakter fest', 'Schreibe danach eine passende Melodie']
      : ['Clarify style and tempo', 'Set key and character', 'Then write a fitting melody'],
  };
}

const SIMPLE_MELODY_PITCH_PATTERN = [
  ['C', 5], ['D', 5], ['E', 5], ['G', 5], ['A', 5],
  ['G', 5], ['E', 5], ['D', 5], ['C', 5], ['E', 5],
  ['G', 5], ['E', 5], ['D', 5], ['F', 5], ['A', 5],
  ['G', 5], ['E', 5], ['G', 5], ['C', 6], ['B', 5],
  ['A', 5], ['G', 5], ['F', 5], ['E', 5], ['D', 5],
  ['E', 5], ['F', 5], ['G', 5], ['C', 5], ['G', 4],
  ['C', 5], ['D', 5], ['E', 5], ['D', 5], ['C', 5],
] as const;

const SIMPLE_MELODY_RHYTHM_PATTERN = [
  [
    { timestampNum: 0, timestampDen: 4, durationType: 'quarter' },
    { timestampNum: 2, timestampDen: 8, durationType: 'eighth' },
    { timestampNum: 3, timestampDen: 8, durationType: 'eighth' },
    { timestampNum: 2, timestampDen: 4, durationType: 'quarter' },
    { timestampNum: 3, timestampDen: 4, durationType: 'quarter' },
  ],
  [
    { timestampNum: 0, timestampDen: 8, durationType: 'quarter', isDotted: true },
    { timestampNum: 3, timestampDen: 8, durationType: 'eighth' },
    { timestampNum: 2, timestampDen: 4, durationType: 'quarter' },
    { timestampNum: 3, timestampDen: 4, durationType: 'quarter' },
  ],
  [
    { timestampNum: 0, timestampDen: 4, durationType: 'half' },
    { timestampNum: 2, timestampDen: 4, durationType: 'quarter' },
    { timestampNum: 3, timestampDen: 4, durationType: 'quarter' },
  ],
  [
    { timestampNum: 0, timestampDen: 8, durationType: 'eighth' },
    { timestampNum: 1, timestampDen: 8, durationType: 'eighth' },
    { timestampNum: 1, timestampDen: 4, durationType: 'quarter' },
    { timestampNum: 4, timestampDen: 8, durationType: 'eighth' },
    { timestampNum: 5, timestampDen: 8, durationType: 'eighth' },
    { timestampNum: 3, timestampDen: 4, durationType: 'quarter' },
  ],
  [
    { timestampNum: 0, timestampDen: 4, durationType: 'quarter' },
    { timestampNum: 1, timestampDen: 4, durationType: 'quarter' },
    { timestampNum: 4, timestampDen: 8, durationType: 'eighth' },
    { timestampNum: 5, timestampDen: 8, durationType: 'eighth' },
    { timestampNum: 3, timestampDen: 4, durationType: 'quarter' },
  ],
  [
    { timestampNum: 0, timestampDen: 8, durationType: 'quarter', isDotted: true },
    { timestampNum: 3, timestampDen: 8, durationType: 'eighth' },
    { timestampNum: 2, timestampDen: 4, durationType: 'quarter' },
    { timestampNum: 3, timestampDen: 4, durationType: 'quarter' },
  ],
  [
    { timestampNum: 0, timestampDen: 8, durationType: 'eighth' },
    { timestampNum: 1, timestampDen: 8, durationType: 'eighth' },
    { timestampNum: 1, timestampDen: 4, durationType: 'quarter' },
    { timestampNum: 4, timestampDen: 8, durationType: 'eighth' },
    { timestampNum: 5, timestampDen: 8, durationType: 'eighth' },
    { timestampNum: 3, timestampDen: 4, durationType: 'quarter' },
  ],
  [
    { timestampNum: 0, timestampDen: 4, durationType: 'half' },
    { timestampNum: 2, timestampDen: 4, durationType: 'half' },
  ],
] as const;

export function buildSimpleMelodyDraftResponse(message: string, documentState: DocumentState): ParsedIntentJson | null {
  if (!shouldCreateSimpleMelody(message) || !documentState.coreDocument) return null;
  const german = isLikelyGerman(message);
  const measureCount = requestedMeasureCount(message);
  const staffIndex = detectMelodyTargetStaff(documentState, message);
  const commands: ParsedIntentJson['commands'] = [
    { type: 'setKey', fifths: 0 },
    { type: 'setTimeSignature', beats: 4, beatType: 4, measureNumber: 1 },
  ];

  let pitchIndex = 0;
  for (let measure = 1; measure <= measureCount; measure += 1) {
    const rhythm = SIMPLE_MELODY_RHYTHM_PATTERN[(measure - 1) % SIMPLE_MELODY_RHYTHM_PATTERN.length];
    for (const event of rhythm) {
      const [step, octave] = SIMPLE_MELODY_PITCH_PATTERN[pitchIndex % SIMPLE_MELODY_PITCH_PATTERN.length];
      pitchIndex += 1;
      commands.push({
        type: 'insertNoteAt',
        measureNumber: measure,
        staffIndex,
        voiceId: 1,
        timestampNum: event.timestampNum,
        timestampDen: event.timestampDen,
        step,
        octave,
        alter: 0,
        durationType: event.durationType,
        ...('isDotted' in event && event.isDotted ? { isDotted: true } : {}),
      });
    }
  }

  return {
    commands,
    explanation: german
      ? `Ich bereite eine einfache ${measureCount}-taktige Melodie in C-Dur mit abwechslungsreicher Rhythmik für die ${staffIndex === 1 ? 'rechte Hand' : 'linke Hand'} vor.`
      : `I am preparing a simple ${measureCount}-bar melody in C major with varied rhythm for the ${staffIndex === 1 ? 'right hand' : 'left hand'}.`,
    confidence: 'high',
    ambiguities: [],
    plan: german
      ? ['Setze C-Dur und 4/4', `Fülle ${measureCount} Takte mit einer einfachen Melodie aus Achteln, Vierteln und Halben`, 'Platziere die Melodie im Zielsystem']
      : ['Set C major and 4/4', `Fill ${measureCount} measures with a simple melody using eighth, quarter, and half notes`, 'Place the melody in the target staff'],
  };
}

export function buildMusicianChatResponse(params: {
  message: string;
  workflow: AiWorkflowKind;
  documentState: DocumentState;
  selection?: EditorSelection;
  sessionContext?: AiSessionContext;
}) {
  const { message, workflow, documentState, selection, sessionContext } = params;
  const normalized = message.toLowerCase();

  const knownSongSourceRequired = buildKnownSongSourceRequiredResponse(message);
  if (knownSongSourceRequired) return knownSongSourceRequired;

  const semanticResponse = buildSemanticCommandResponse(message, workflow, documentState);
  if (semanticResponse) return semanticResponse;

  if (workflow === 'notation-repair') {
    const notationCleanup = buildCatalogNotationCleanupResponse(message);
    if (notationCleanup) return notationCleanup;
  }

  if (workflow === 'practice-assist' || /\b(practice version|probeversion|rehearsal version|übefassung|uebefassung|practice pack)\b/i.test(normalized)) {
    return buildPracticeResponse(message, documentState, sessionContext);
  }

  if (workflow === 'arrangement-assist') {
    return buildArrangementResponse(message, documentState, selection, sessionContext);
  }

  const melodyBriefQuestion = buildMelodyBriefQuestion(message);
  if (melodyBriefQuestion) return melodyBriefQuestion;

  const melodyDraft = buildSimpleMelodyDraftResponse(message, documentState);
  if (melodyDraft) return melodyDraft;

  const harmonyResponse = buildHarmonyResponse(message, documentState);
  if (harmonyResponse) return harmonyResponse;

  const shouldAnalyze = workflow === 'analysis'
    || /\b(analy[sz]e|analyse|umfang|range|tessitura|playable|spielbar|singable|singbar|difficulty|schwer|hotspot|breath|atem)\b/i.test(normalized);

  const shouldReadScore = /\b(read|list|show|summari[sz]e|content|contents|lies|liste|zeige|inhalt|wieder)\b/i.test(normalized)
    && /\b(score|partitur|measure|measures|takt|takte|m\.|t\.)\b/i.test(normalized);

  if (shouldReadScore) {
    const reading = buildScoreReadingSummary(message, documentState, selection);
    if (reading) return reading;
  }

  if (!shouldAnalyze) return null;
  return buildAnalysisSummary(message, documentState, selection, sessionContext);
}
