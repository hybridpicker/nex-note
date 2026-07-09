import type { ScoreCommand } from '@/lib/score-commands';
import type { MeasureAttributes, PartNode, ScoreDocumentModel, TimedEvent } from '@/src/score-core/model/types';
import type { BarlineKind } from '@/lib/note-editor';
import { timestampsEqual } from '@/src/shared/music/timestamp-match';

export interface InverseDerivationIssue {
  index: number;
  type: string;
  reason: string;
}

export interface InverseDerivationResult {
  inverseCommands: ScoreCommand[];
  supportedCommandCount: number;
  unsupported: InverseDerivationIssue[];
}

function findPart(document: ScoreDocumentModel, partId: string) {
  return document.score.parts.find((part) => part.sourcePartId === partId) ?? null;
}

function findMeasures(document: ScoreDocumentModel, measureNumber: number, partId?: string, staffIndex?: number) {
  return document.score.parts.flatMap((part) => {
    if (partId && part.sourcePartId !== partId) return [];
    return part.staves.flatMap((staff) => {
      if (staffIndex && staff.staffIndex !== staffIndex) return [];
      const measure = staff.measures.find((entry) => entry.measureNumber === measureNumber);
      return measure ? [{ part, staffIndex: staff.staffIndex, measure }] : [];
    });
  });
}

function findEvent(
	  document: ScoreDocumentModel,
	  locator: {
	    coreEntityId?: string | null;
	    coreMeasureId?: string | null;
	    corePartId?: string | null;
	    measureNumber: number;
	    staffIndex: number;
	    voiceId: number;
    timestampNum: number;
    timestampDen: number;
  },
): TimedEvent | null {
  for (const part of document.score.parts) {
    if (locator.corePartId && part.id !== locator.corePartId && part.sourcePartId !== locator.corePartId) continue;
    const staff = part.staves.find((entry) => entry.staffIndex === locator.staffIndex);
    const measure = staff?.measures.find((entry) => (
      locator.coreMeasureId
        ? entry.id === locator.coreMeasureId
        : entry.measureNumber === locator.measureNumber
    ));
    const voice = measure?.voices.find((entry) => entry.voiceId === locator.voiceId);
    const timestampMatches = (entry: TimedEvent) => (
      timestampsEqual(entry.timestampNum, entry.timestampDen, locator.timestampNum, locator.timestampDen)
    );
    const event = locator.coreEntityId
      ? voice?.events.find((entry) => entry.id === locator.coreEntityId && timestampMatches(entry))
        ?? voice?.events.find(timestampMatches)
      : voice?.events.find(timestampMatches);
    if (event) return event;
  }
  return null;
}

function getEffectiveAttributes(part: PartNode, staffIndex: number, measureNumber: number): MeasureAttributes | null {
  const staff = part.staves.find((entry) => entry.staffIndex === staffIndex);
  if (!staff) return null;
  const index = staff.measures.findIndex((entry) => entry.measureNumber === measureNumber);
  if (index < 0) return null;
  for (let current = index; current >= 0; current -= 1) {
    const attributes = staff.measures[current].attributes[0];
    if (attributes) return attributes;
  }
  return null;
}

function hasUniformValue<T>(values: T[]) {
  if (values.length === 0) return false;
  return values.every((value) => JSON.stringify(value) === JSON.stringify(values[0]));
}

function stripEnvelopeMeta<T extends ScoreCommand>(command: T): T {
  const { schemaVersion: _schemaVersion, category: _category, target: _target, payload: _payload, ...plain } = command;
  return plain as T;
}

function normalizeBarlineKind(value: string | undefined): BarlineKind {
  if (value === 'double' || value === 'final' || value === 'repeat-start' || value === 'repeat-end') return value;
  return 'regular';
}

function deriveMeasureLayoutHintInverse(
  document: ScoreDocumentModel,
  command: Extract<ScoreCommand, { type: 'setMeasureLayoutHint' }>,
): ScoreCommand | null {
  const matches = findMeasures(document, command.measureNumber, command.partId, command.staffIndex);
  if (matches.length === 0) return null;

  const values = matches.map(({ part, staffIndex, measure }) => {
    const hint = document.layoutHints.find((entry) => (
      entry.measureNumber === measure.measureNumber
      && entry.kind === command.hint
      && (entry.partId == null || entry.partId === part.sourcePartId)
      && (entry.staffIndex == null || entry.staffIndex === staffIndex)
    ));
    if (hint) return hint.value;
    if (command.hint === 'newSystem') return Boolean(measure.print?.newSystem);
    if (command.hint === 'newPage') return Boolean(measure.print?.newPage);
    return null;
  });

  if (!hasUniformValue(values)) return null;
  if (
    values[0] == null
    && (command.hint === 'staffSpacing' || command.hint === 'collisionPolicy')
  ) return null;

  return stripEnvelopeMeta({
    type: 'setMeasureLayoutHint',
    measureNumber: command.measureNumber,
    hint: command.hint,
    value: values[0] ?? false,
    staffIndex: command.staffIndex,
    partId: command.partId,
  });
}

function deriveInverseCommand(document: ScoreDocumentModel, command: ScoreCommand): ScoreCommand | null {
  switch (command.type) {
    case 'setTitle':
      return stripEnvelopeMeta({ type: 'setTitle', title: document.metadata.title ?? '' });
    case 'setSubtitle':
      return stripEnvelopeMeta({ type: 'setSubtitle', subtitle: document.metadata.subtitle ?? '' });
    case 'setComposer':
      return stripEnvelopeMeta({ type: 'setComposer', composer: document.metadata.composer ?? '' });
    case 'setArranger':
      return stripEnvelopeMeta({ type: 'setArranger', arranger: document.metadata.arranger ?? '' });
    case 'setPartName': {
      const part = findPart(document, command.partId);
      return part ? stripEnvelopeMeta({ type: 'setPartName', partId: command.partId, name: part.name ?? '' }) : null;
    }
    case 'setPartAbbreviation': {
      const part = findPart(document, command.partId);
      return part ? stripEnvelopeMeta({ type: 'setPartAbbreviation', partId: command.partId, abbreviation: part.abbreviation ?? '' }) : null;
    }
    case 'setInstrumentName': {
      const part = findPart(document, command.partId);
      return part ? stripEnvelopeMeta({ type: 'setInstrumentName', partId: command.partId, instrumentName: part.instrumentName ?? '' }) : null;
    }
    case 'setPartTranspose': {
      const part = findPart(document, command.partId);
      return part ? stripEnvelopeMeta({
        type: 'setPartTranspose',
        partId: command.partId,
        chromatic: part.chromaticTranspose ?? 0,
        diatonic: part.diatonicTranspose,
      }) : null;
    }
    case 'setKey': {
      const matches = findMeasures(document, 1);
      const values = matches.map(({ part, staffIndex, measure }) => getEffectiveAttributes(part, staffIndex, measure.measureNumber)?.keyFifths ?? 0);
      if (!hasUniformValue(values)) return null;
      return stripEnvelopeMeta({ type: 'setKey', fifths: values[0] ?? 0 });
    }
    case 'setTimeSignature': {
      const targetMeasure = command.measureNumber ?? 1;
      const matches = findMeasures(document, targetMeasure);
      const values = matches.map(({ part, staffIndex }) => getEffectiveAttributes(part, staffIndex, targetMeasure)?.time ?? null);
      if (!hasUniformValue(values) || !values[0]) return null;
      return stripEnvelopeMeta({
        type: 'setTimeSignature',
        beats: values[0].beats,
        beatType: values[0].beatType,
        measureNumber: targetMeasure,
      });
    }
    case 'setClef': {
      const targetMeasure = command.measureNumber ?? 1;
      const targetStaffIndex = command.staffIndex ?? 1;
      const matches = findMeasures(document, targetMeasure, undefined, targetStaffIndex);
      const values = matches.map(({ part }) => {
        const effective = getEffectiveAttributes(part, targetStaffIndex, targetMeasure);
        return effective?.clefs.find((entry) => entry.staffIndex === targetStaffIndex) ?? null;
      });
      if (!hasUniformValue(values) || !values[0]?.sign || values[0]?.line == null) return null;
      return stripEnvelopeMeta({
        type: 'setClef',
        sign: values[0].sign as 'G' | 'F' | 'C',
        line: values[0].line as 1 | 2 | 3 | 4 | 5,
        measureNumber: targetMeasure,
        staffIndex: targetStaffIndex,
      });
    }
    case 'removeClefChange': {
      const targetStaffIndex = command.staffIndex ?? 1;
      const matches = findMeasures(document, command.measureNumber, undefined, targetStaffIndex);
      const values = matches.map(({ measure }) => (
        measure.attributes[0]?.clefs.find((entry) => entry.staffIndex === targetStaffIndex) ?? null
      ));
      if (!hasUniformValue(values) || !values[0]?.sign || values[0]?.line == null) return null;
      return stripEnvelopeMeta({
        type: 'setClef',
        sign: values[0].sign as 'G' | 'F' | 'C',
        line: values[0].line as 1 | 2 | 3 | 4 | 5,
        measureNumber: command.measureNumber,
        staffIndex: targetStaffIndex,
      });
    }
    case 'setSystemBreak': {
      const matches = findMeasures(document, command.measureNumber);
      const values = matches.map(({ measure }) => Boolean(measure.print?.newSystem));
      if (!hasUniformValue(values)) return null;
      return stripEnvelopeMeta({ type: 'setSystemBreak', measureNumber: command.measureNumber, value: values[0] ?? false });
    }
    case 'setPageBreak': {
      const matches = findMeasures(document, command.measureNumber);
      const values = matches.map(({ measure }) => Boolean(measure.print?.newPage));
      if (!hasUniformValue(values)) return null;
      return stripEnvelopeMeta({ type: 'setPageBreak', measureNumber: command.measureNumber, value: values[0] ?? false });
    }
    case 'setMeasureLayoutHint':
      return deriveMeasureLayoutHintInverse(document, command);
    case 'setTempo': {
      const values = findMeasures(document, 1, undefined, 1)
        .map(({ measure }) => measure.directions.find((entry) => entry.kind === 'metronome')?.value ?? null);
      if (!hasUniformValue(values) || values[0] == null) return null;
      const bpm = Number(values[0]);
      if (!Number.isFinite(bpm) || bpm <= 0) return null;
      return stripEnvelopeMeta({ type: 'setTempo', bpm });
    }
    case 'setBarline': {
      const matches = findMeasures(document, command.measureNumber);
      const values = matches.map(({ measure }) => normalizeBarlineKind(measure.rightBarline));
      if (!hasUniformValue(values)) return null;
      return stripEnvelopeMeta({ type: 'setBarline', measureNumber: command.measureNumber, barline: values[0] ?? 'regular' });
    }
    case 'changeNotePitch': {
      const previous = findEvent(document, command);
      if (!previous) return null;
      if (previous.kind === 'note') {
        return stripEnvelopeMeta({
          type: 'changeNotePitch',
          measureNumber: command.measureNumber,
          staffIndex: command.staffIndex,
          voiceId: command.voiceId,
          timestampNum: command.timestampNum,
          timestampDen: command.timestampDen,
          step: previous.pitch.step,
          octave: previous.pitch.octave,
          alter: previous.pitch.alter,
        });
      }
      return stripEnvelopeMeta({
        type: 'deleteNote',
        measureNumber: command.measureNumber,
        staffIndex: command.staffIndex,
        voiceId: command.voiceId,
        timestampNum: command.timestampNum,
        timestampDen: command.timestampDen,
      });
    }
    case 'changeNoteDuration': {
      const previous = findEvent(document, command);
      if (!previous) return null;
      return stripEnvelopeMeta({
        type: 'changeNoteDuration',
        measureNumber: command.measureNumber,
        staffIndex: command.staffIndex,
        voiceId: command.voiceId,
        timestampNum: command.timestampNum,
        timestampDen: command.timestampDen,
        durationType: previous.durationType ?? 'quarter',
        isDotted: previous.isDotted,
      });
    }
    case 'deleteNote': {
      const previous = findEvent(document, command);
      if (!previous || previous.kind !== 'note') return null;
      return stripEnvelopeMeta({
        type: 'changeNotePitch',
        measureNumber: command.measureNumber,
        staffIndex: command.staffIndex,
        voiceId: command.voiceId,
        timestampNum: command.timestampNum,
        timestampDen: command.timestampDen,
        step: previous.pitch.step,
        octave: previous.pitch.octave,
        alter: previous.pitch.alter,
      });
    }
    case 'toggleTie':
      return stripEnvelopeMeta({
        type: 'toggleTie',
        measureNumber: command.measureNumber,
        staffIndex: command.staffIndex,
        voiceId: command.voiceId,
        timestampNum: command.timestampNum,
        timestampDen: command.timestampDen,
      });
    case 'setTiePlacement': {
      const previous = findEvent(document, command);
      if (!previous?.tieStart) return null;
      return stripEnvelopeMeta({
        type: 'setTiePlacement',
        measureNumber: command.measureNumber,
        staffIndex: command.staffIndex,
        voiceId: command.voiceId,
        timestampNum: command.timestampNum,
        timestampDen: command.timestampDen,
        placement: previous.tiePlacement === 'below' ? 'below' : 'above',
      });
    }
    case 'toggleArticulation':
      return stripEnvelopeMeta({
        type: 'toggleArticulation',
        measureNumber: command.measureNumber,
        staffIndex: command.staffIndex,
        voiceId: command.voiceId,
        timestampNum: command.timestampNum,
        timestampDen: command.timestampDen,
        articulation: command.articulation,
      });
    case 'setArticulationPlacement': {
      const previous = findEvent(document, command);
      if (!previous) return null;
      const hasArticulation = command.articulation === 'fermata'
        ? document.fermataEventIds.has(previous.id)
        : (previous.articulations ?? []).includes(command.articulation);
      if (!hasArticulation) return null;
      return stripEnvelopeMeta({
        type: 'setArticulationPlacement',
        measureNumber: command.measureNumber,
        staffIndex: command.staffIndex,
        voiceId: command.voiceId,
        timestampNum: command.timestampNum,
        timestampDen: command.timestampDen,
        articulation: command.articulation,
        placement: previous.articulationPlacements?.[command.articulation],
      });
    }
    case 'transposeDocumentChromatic':
      return stripEnvelopeMeta({ type: 'transposeDocumentChromatic', semitones: -command.semitones });
    case 'transposeChromatic':
      return stripEnvelopeMeta({
        type: 'transposeChromatic',
        measureNumber: command.measureNumber,
        staffIndex: command.staffIndex,
        voiceId: command.voiceId,
        timestampNum: command.timestampNum,
        timestampDen: command.timestampDen,
        semitones: -command.semitones,
      });
    case 'transposeRangeChromatic':
      return stripEnvelopeMeta({
        type: 'transposeRangeChromatic',
        semitones: -command.semitones,
        range: command.range,
      });
    default:
      return null;
  }
}

export function deriveInverseCommands(document: ScoreDocumentModel | null, commands: ScoreCommand[]): InverseDerivationResult {
  if (!document) {
    return {
      inverseCommands: [],
      supportedCommandCount: 0,
      unsupported: commands.map((command, index) => ({
        index,
        type: command.type,
        reason: 'missing_core_document',
      })),
    };
  }

  const inverseCommands: ScoreCommand[] = [];
  const unsupported: InverseDerivationIssue[] = [];

  commands.forEach((command, index) => {
    const inverse = deriveInverseCommand(document, command);
    if (!inverse) {
      unsupported.push({
        index,
        type: command.type,
        reason: 'unsupported_or_ambiguous_inverse',
      });
      return;
    }
    inverseCommands.unshift(inverse);
  });

  return {
    inverseCommands,
    supportedCommandCount: inverseCommands.length,
    unsupported,
  };
}
