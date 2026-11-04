import type { DocumentDiagnostic } from '@/src/score-core/commands/apply-document-commands';
import { isRepresentableDuration } from '@/src/score-core/duration-utils';
import type { NoteEvent, ScoreDocumentModel } from '@/src/score-core/model/types';
import type { ScoreCommand } from '@/src/shared/schemas/score-command';
import { timestampsEqual } from '@/src/shared/music/timestamp-match';
import { buildRhythmSpellingProjection } from '@/src/layout/rhythm-speller';
import type { RhythmSpellingProjection, RhythmSpellingVoiceProjection } from '@/src/layout/types';
import { DOCUMENT_DIAGNOSTIC_RULE_BY_CODE, getDoctorRule, summarizeDoctorRules } from '@/src/debug/doctor/rulebook';
import type {
  DoctorDomain,
  DoctorIssue,
  DoctorReport,
  DoctorSettings,
  DoctorSeverity,
  DoctorTrigger,
} from '@/src/debug/doctor/types';

interface BuildDocumentDoctorReportInput {
  trigger: DoctorTrigger;
  settings: DoctorSettings;
  hasDocument?: boolean;
  coreDocument: ScoreDocumentModel | null;
  diagnostics: DocumentDiagnostic[];
  projection?: RhythmSpellingProjection | null;
  previousDiagnostics?: DocumentDiagnostic[];
  commands?: ScoreCommand[];
  previousRevision?: number | null;
  revision?: number | null;
}

const DIAGNOSTIC_LOCATION_RE = /Measure\s+(\d+)(?:\s+staff\s+(\d+))?(?:\s+voice\s+(\d+))?/i;
const TIMESTAMP_RE = /@(\d+\/\d+)/;
const SPELL_FRAGMENT_RE = /:spell:(\d+)$/;
const STEP_TO_SEMITONE: Record<string, number> = {
  C: 0,
  D: 2,
  E: 4,
  F: 5,
  G: 7,
  A: 9,
  B: 11,
};

function toSeverity(level: DocumentDiagnostic['level'], fallback: DoctorSeverity): DoctorSeverity {
  if (level === 'error') return 'error';
  if (level === 'warning') return fallback === 'error' || fallback === 'fatal' ? fallback : 'warning';
  return 'info';
}

function elevateForStrictMode(severity: DoctorSeverity, domain: DoctorDomain, strict: boolean): DoctorSeverity {
  if (!strict) return severity;
  if (severity === 'warning' && (domain === 'input' || domain === 'rhythm' || domain === 'layout')) return 'error';
  return severity;
}

function diagnosticKey(diagnostic: DocumentDiagnostic) {
  return `${diagnostic.level}:${diagnostic.code}:${diagnostic.message}`;
}

function extractLocation(message: string) {
  const match = message.match(DIAGNOSTIC_LOCATION_RE);
  const timestamp = message.match(TIMESTAMP_RE)?.[1];
  return {
    measureNumber: match?.[1] ? Number(match[1]) : undefined,
    staffIndex: match?.[2] ? Number(match[2]) : undefined,
    voiceId: match?.[3] ? Number(match[3]) : undefined,
    timestamp,
  };
}

function issueFromDiagnostic(input: {
  diagnostic: DocumentDiagnostic;
  newSincePrevious: boolean;
  strict: boolean;
}): DoctorIssue {
  const ruleId = DOCUMENT_DIAGNOSTIC_RULE_BY_CODE[input.diagnostic.code] ?? 'document.attributes-valid';
  const rule = getDoctorRule(ruleId) ?? getDoctorRule('document.attributes-valid')!;
  const location = extractLocation(input.diagnostic.message);
  const severity = elevateForStrictMode(
    toSeverity(input.diagnostic.level, rule.severity),
    rule.domain,
    input.strict,
  );

  return {
    id: `${rule.id}:${input.diagnostic.code}:${input.diagnostic.message}`,
    ruleId: rule.id,
    domain: rule.domain,
    severity,
    title: rule.title,
    message: input.diagnostic.message,
    newSincePrevious: input.newSincePrevious,
    measureNumber: location.measureNumber,
    staffIndex: location.staffIndex,
    voiceId: location.voiceId,
    timestamp: location.timestamp,
    data: {
      diagnosticCode: input.diagnostic.code,
      diagnosticLevel: input.diagnostic.level,
      ruleDescription: rule.description,
    },
  };
}

function projectionDiagnosticToIssue(input: {
  diagnostic: DocumentDiagnostic;
  strict: boolean;
}): DoctorIssue {
  return issueFromDiagnostic({
    diagnostic: input.diagnostic,
    newSincePrevious: true,
    strict: input.strict,
  });
}

function strongProjectionSplitPoints(voice: RhythmSpellingVoiceProjection) {
  // Skeleton meter map: the first hard Projection Gate rule protects the 4/4
  // half-bar. This mirrors the initial Rhythm Speller implementation.
  return voice.measureDurationDivisions === voice.divisions * 4
    ? [voice.divisions * 2]
    : [];
}

function projectionSpellIndex(fragmentId: string) {
  const match = fragmentId.match(SPELL_FRAGMENT_RE);
  if (!match?.[1]) return null;
  const index = Number(match[1]);
  return Number.isInteger(index) ? index : null;
}

function orderedProjectionSplitFragments(group: RhythmSpellingVoiceProjection['fragments']) {
  const indexed = group.map((fragment) => ({
    fragment,
    spellIndex: projectionSpellIndex(fragment.fragmentId),
  }));

  if (indexed.some((entry) => entry.spellIndex == null)) return [];
  const uniqueSpellIndices = new Set(indexed.map((entry) => entry.spellIndex));
  if (uniqueSpellIndices.size <= 1 || uniqueSpellIndices.size !== indexed.length) return [];

  const ordered = indexed.sort((left, right) => (
    (left.spellIndex ?? 0) - (right.spellIndex ?? 0)
    || left.fragment.startDivisions - right.fragment.startDivisions
    || left.fragment.fragmentId.localeCompare(right.fragment.fragmentId)
  ));

  for (let index = 0; index < ordered.length; index += 1) {
    if (ordered[index]!.spellIndex !== index) return [];
  }

  return ordered.map((entry) => entry.fragment);
}

function buildTupletEventIdSet(coreDocument: ScoreDocumentModel | null | undefined) {
  return new Set(coreDocument?.tuplets.flatMap((tuplet) => tuplet.eventIds) ?? []);
}

export function validateProjectionDoctorIssues(input: {
  projection: RhythmSpellingProjection;
  coreDocument?: ScoreDocumentModel | null;
  strict: boolean;
}): DoctorIssue[] {
  const diagnostics: DocumentDiagnostic[] = [...input.projection.diagnostics];
  const tupletEventIds = buildTupletEventIdSet(input.coreDocument);
  // Imported values with two or more dots (MusicXML <dot/><dot/>) are exportable as written.
  const multiDottedDurations = new Map<string, number>();
  for (const part of input.coreDocument?.score.parts ?? []) {
    for (const staff of part.staves) {
      for (const measure of staff.measures) {
        for (const voice of measure.voices) {
          for (const event of voice.events) {
            if ((event.dotCount ?? 0) > 1) multiDottedDurations.set(event.id, event.durationDivisions);
          }
        }
      }
    }
  }

  for (const voice of input.projection.voices) {
    const fragments = [...voice.fragments].sort((left, right) => (
      left.startDivisions - right.startDivisions
      || left.durationDivisions - right.durationDivisions
      || left.fragmentId.localeCompare(right.fragmentId)
    ));

    for (const fragment of fragments) {
      if (
        !tupletEventIds.has(fragment.sourceEventId)
        && multiDottedDurations.get(fragment.sourceEventId) !== fragment.durationDivisions
        && !isRepresentableDuration(fragment.durationDivisions, voice.divisions)
      ) {
        diagnostics.push({
          level: 'error',
          code: 'projection_unexportable_duration',
          message: `Measure ${voice.measureNumber} staff ${voice.staffIndex} voice ${voice.voiceId} projection fragment ${fragment.fragmentId} has unexportable duration ${fragment.durationDivisions}.`,
        });
      }
    }

    const fragmentsBySource = new Map<string, typeof fragments>();
    for (const fragment of fragments) {
      const group = fragmentsBySource.get(fragment.sourceEventId) ?? [];
      group.push(fragment);
      fragmentsBySource.set(fragment.sourceEventId, group);
    }

    for (const [sourceEventId, group] of fragmentsBySource.entries()) {
      if (group.length <= 1) continue;
      const ordered = orderedProjectionSplitFragments(group);
      if (ordered.length <= 1) continue;
      for (let index = 0; index < ordered.length; index += 1) {
        const fragment = ordered[index]!;
        const expectedTieStart = index < ordered.length - 1 || Boolean(fragment.event.tieStart);
        const expectedTieStop = index > 0;
        if (fragment.event.kind === 'note' && Boolean(fragment.tieStart) !== expectedTieStart) {
          diagnostics.push({
            level: 'error',
            code: 'projection_unbalanced_tie',
            message: `Measure ${voice.measureNumber} staff ${voice.staffIndex} voice ${voice.voiceId} projection fragment ${fragment.fragmentId} has invalid tieStart for source ${sourceEventId}.`,
          });
        }
        if (fragment.event.kind === 'note' && Boolean(fragment.tieStop) !== expectedTieStop) {
          diagnostics.push({
            level: 'error',
            code: 'projection_unbalanced_tie',
            message: `Measure ${voice.measureNumber} staff ${voice.staffIndex} voice ${voice.voiceId} projection fragment ${fragment.fragmentId} has invalid tieStop for source ${sourceEventId}.`,
          });
        }
      }
    }

    for (const strongPoint of strongProjectionSplitPoints(voice)) {
      // A value filling the whole bar (whole rest, whole note) is correct notation; the rhythm
      // speller leaves it unsplit (spansFullMeasure), so it does not hide the half-bar.
      const hiddenByFragment = fragments.find((fragment) => (
        fragment.startDivisions < strongPoint
        && fragment.startDivisions + fragment.durationDivisions > strongPoint
        && !(fragment.startDivisions === 0 && fragment.durationDivisions === voice.measureDurationDivisions)
      ));
      if (hiddenByFragment) {
        diagnostics.push({
          level: 'error',
          code: 'projection_hidden_strong_beat',
          message: `Measure ${voice.measureNumber} staff ${voice.staffIndex} voice ${voice.voiceId} projection fragment ${hiddenByFragment.fragmentId} crosses strong beat ${strongPoint}.`,
        });
      }
    }
  }

  return diagnostics.map((diagnostic) => projectionDiagnosticToIssue({
    diagnostic,
    strict: input.strict,
  }));
}

export function validateCoreDoctorIssues(input: {
  diagnostics: DocumentDiagnostic[];
  previousDiagnostics?: DocumentDiagnostic[];
  strict: boolean;
}) {
  const previousKeys = new Set((input.previousDiagnostics ?? []).map(diagnosticKey));
  return input.diagnostics.map((diagnostic) => issueFromDiagnostic({
    diagnostic,
    newSincePrevious: !previousKeys.has(diagnosticKey(diagnostic)),
    strict: input.strict,
  }));
}

function pitchLabel(note: NoteEvent) {
  const alter = note.pitch.alter === 2
    ? 'x'
    : note.pitch.alter === 1
      ? '#'
      : note.pitch.alter === -1
        ? 'b'
        : note.pitch.alter === -2
          ? 'bb'
          : note.pitch.alter === 0
            ? ''
            : `${note.pitch.alter >= 0 ? '+' : ''}${note.pitch.alter}`;
  return `${note.pitch.step}${alter}${note.pitch.octave}`;
}

function noteMidi(note: NoteEvent) {
  const step = String(note.pitch.step ?? '').toUpperCase();
  const semitone = STEP_TO_SEMITONE[step];
  if (semitone == null) return null;
  if (!Number.isFinite(note.pitch.alter) || !Number.isFinite(note.pitch.octave)) return null;
  return semitone + Math.trunc(note.pitch.alter) + ((Math.trunc(note.pitch.octave) + 1) * 12);
}

function midiFrequency(midi: number) {
  return 440 * (2 ** ((midi - 69) / 12));
}

function roundFrequency(value: number) {
  return Math.round(value * 1000) / 1000;
}

function noteFrequencyInfo(note: NoteEvent) {
  const midi = noteMidi(note);
  if (midi == null || midi < 0 || midi > 127) return null;
  const frequencyHz = midiFrequency(midi);
  if (!Number.isFinite(frequencyHz) || frequencyHz <= 0) return null;
  return {
    pitch: pitchLabel(note),
    midi,
    frequencyHz: roundFrequency(frequencyHz),
  };
}

function eventLocator(input: {
  partId: string;
  measureNumber: number;
  staffIndex: number;
  voiceId: number;
  timestampNum: number;
  timestampDen: number;
}) {
  return `part ${input.partId} measure ${input.measureNumber} staff ${input.staffIndex} voice ${input.voiceId} @${input.timestampNum}/${input.timestampDen}`;
}

interface TrackedNote {
  note: NoteEvent;
  partId: string;
  measureId: string;
}

function commandMatchesTrackedNoteLane(
  trackedNote: TrackedNote,
  command: Extract<ScoreCommand, { type: 'insertNoteAt' | 'changeNotePitch' }>,
) {
  return (!command.corePartId || trackedNote.partId === command.corePartId)
    && (!command.coreMeasureId || trackedNote.measureId === command.coreMeasureId)
    && trackedNote.note.measureNumber === command.measureNumber
    && trackedNote.note.staffIndex === command.staffIndex
    && trackedNote.note.voiceId === command.voiceId
    && timestampsEqual(
      trackedNote.note.timestampNum,
      trackedNote.note.timestampDen,
      command.timestampNum,
      command.timestampDen,
    );
}

function noteMatchesCommand(
  trackedNote: TrackedNote,
  command: Extract<ScoreCommand, { type: 'insertNoteAt' | 'changeNotePitch' }>,
) {
  return commandMatchesTrackedNoteLane(trackedNote, command)
    && trackedNote.note.pitch.step === command.step
    && trackedNote.note.pitch.alter === command.alter
    && trackedNote.note.pitch.octave === command.octave;
}

function commandPitchLabel(command: Extract<ScoreCommand, { type: 'insertNoteAt' | 'changeNotePitch' }>) {
  const note = {
    pitch: {
      step: command.step,
      alter: command.alter,
      octave: command.octave,
    },
  } as NoteEvent;
  return pitchLabel(note);
}

function pitchCommands(commands: ScoreCommand[] | undefined) {
  return (commands ?? []).filter((command): command is Extract<ScoreCommand, { type: 'insertNoteAt' | 'changeNotePitch' }> => (
    command.type === 'insertNoteAt' || command.type === 'changeNotePitch'
  ));
}

function validateMultiVoiceAndPlaybackDoctorIssues(input: {
  coreDocument: ScoreDocumentModel | null;
  commands?: ScoreCommand[];
  strict: boolean;
}): DoctorIssue[] {
  if (!input.coreDocument) return [];
  if (input.coreDocument.score.parts.length === 0) return [];

  const issues: DoctorIssue[] = [];
  const allNotes: TrackedNote[] = [];

  for (const part of input.coreDocument.score.parts) {
    for (const staff of part.staves) {
      for (const measure of staff.measures) {
        for (const voice of measure.voices) {
          for (const event of voice.events) {
            const location = {
              partId: part.id,
              measureNumber: measure.measureNumber,
              staffIndex: staff.staffIndex,
              voiceId: voice.voiceId,
              timestampNum: event.timestampNum,
              timestampDen: event.timestampDen,
            };
            const metadataMismatches = [
              event.measureNumber !== measure.measureNumber ? `event.measureNumber=${event.measureNumber}` : null,
              event.staffIndex !== staff.staffIndex ? `event.staffIndex=${event.staffIndex}` : null,
              event.voiceId !== voice.voiceId ? `event.voiceId=${event.voiceId}` : null,
            ].filter(Boolean);

            if (metadataMismatches.length > 0) {
              issues.push({
                id: `input.multi-voice-event-routing:${event.id}`,
                ruleId: 'input.multi-voice-event-routing',
                domain: 'input',
                severity: 'error',
                title: 'Events stay in their owning voice',
                message: `Event ${event.id} is stored in ${eventLocator(location)} but carries ${metadataMismatches.join(', ')}.`,
                newSincePrevious: true,
                measureNumber: measure.measureNumber,
                staffIndex: staff.staffIndex,
                voiceId: voice.voiceId,
                timestamp: `${event.timestampNum}/${event.timestampDen}`,
                data: {
                  eventId: event.id,
                  eventKind: event.kind,
                  expected: location,
                  actual: {
                    measureNumber: event.measureNumber,
                    staffIndex: event.staffIndex,
                    voiceId: event.voiceId,
                  },
                },
              });
            }

            if (event.kind !== 'note') continue;
            allNotes.push({
              note: event,
              partId: part.id,
              measureId: measure.id,
            });

            const frequencyInfo = noteFrequencyInfo(event);
            if (!frequencyInfo) {
              issues.push({
                id: `playback.note-frequency-valid:${event.id}`,
                ruleId: 'playback.note-frequency-valid',
                domain: 'playback',
                severity: 'error',
                title: 'Notes map to valid playback frequencies',
                message: `Note ${event.id} at ${eventLocator(location)} has invalid playback pitch ${pitchLabel(event)}.`,
                newSincePrevious: true,
                measureNumber: measure.measureNumber,
                staffIndex: staff.staffIndex,
                voiceId: voice.voiceId,
                timestamp: `${event.timestampNum}/${event.timestampDen}`,
                data: {
                  eventId: event.id,
                  pitch: event.pitch,
                },
              });
            }
          }
        }
      }
    }
  }

  for (const command of pitchCommands(input.commands)) {
    const commandKey = [
      command.corePartId ?? '',
      command.coreMeasureId ?? '',
      command.measureNumber,
      command.staffIndex,
      command.voiceId,
      command.timestampNum,
      command.timestampDen,
      command.step,
      command.alter,
      command.octave,
    ].join(':');
    if (allNotes.some((note) => noteMatchesCommand(note, command))) continue;

    const sameSlotNotes = allNotes.filter((note) => (
      (!command.corePartId || note.partId === command.corePartId)
      && (!command.coreMeasureId || note.measureId === command.coreMeasureId)
      && note.note.measureNumber === command.measureNumber
      && note.note.staffIndex === command.staffIndex
      && timestampsEqual(
        note.note.timestampNum,
        note.note.timestampDen,
        command.timestampNum,
        command.timestampDen,
      )
    ));

    issues.push({
      id: `input.multi-voice-command-realized:${command.type}:${commandKey}`,
      ruleId: 'input.multi-voice-command-realized',
      domain: 'input',
      severity: 'error',
      title: 'Multi-voice commands realize in the requested lane',
      message: `${command.type} expected ${commandPitchLabel(command)} in measure ${command.measureNumber} staff ${command.staffIndex} voice ${command.voiceId} @${command.timestampNum}/${command.timestampDen}, but no matching note exists.`,
      newSincePrevious: true,
      measureNumber: command.measureNumber,
      staffIndex: command.staffIndex,
      voiceId: command.voiceId,
      timestamp: `${command.timestampNum}/${command.timestampDen}`,
      data: {
        command,
        nearbySameSlotNotes: sameSlotNotes.map((note) => ({
          eventId: note.note.id,
          partId: note.partId,
          voiceId: note.note.voiceId,
          pitch: pitchLabel(note.note),
          frequency: noteFrequencyInfo(note.note),
        })),
      },
    });
  }

  return issues;
}

function summarizeIssues(issues: DoctorIssue[]) {
  const affectedMeasures = new Set<number>();
  const affectedStaves = new Set<number>();
  const affectedVoices = new Set<number>();
  for (const issue of issues) {
    if (typeof issue.measureNumber === 'number') affectedMeasures.add(issue.measureNumber);
    if (typeof issue.staffIndex === 'number') affectedStaves.add(issue.staffIndex);
    if (typeof issue.voiceId === 'number') affectedVoices.add(issue.voiceId);
  }
  const newBlockingIssueCount = issues.filter((issue) => (
    issue.newSincePrevious
    && (issue.severity === 'error' || issue.severity === 'fatal')
  )).length;
  return {
    clean: issues.length === 0,
    blocked: false,
    newIssueCount: issues.filter((issue) => issue.newSincePrevious).length,
    newBlockingIssueCount,
    affectedMeasures: [...affectedMeasures].sort((left, right) => left - right),
    affectedStaves: [...affectedStaves].sort((left, right) => left - right),
    affectedVoices: [...affectedVoices].sort((left, right) => left - right),
  };
}

function isActionableIssue(issue: DoctorIssue) {
  return issue.severity === 'warning' || issue.severity === 'error' || issue.severity === 'fatal';
}

function commandTypes(commands: ScoreCommand[] | undefined) {
  return (commands ?? []).map((command) => (
    typeof command === 'object' && command && 'type' in command
      ? String(command.type)
      : 'unknown'
  ));
}

function emptyRhythmSpellingProjection(): RhythmSpellingProjection {
  return {
    schemaVersion: 1,
    kind: 'nex-note-rhythm-spelling-projection',
    generatedAt: new Date().toISOString(),
    voices: [],
    diagnostics: [],
  };
}

export function buildDocumentDoctorReport(input: BuildDocumentDoctorReportInput): DoctorReport {
  const domainSet = new Set(input.settings.domains);
  const hasDocument = input.hasDocument ?? true;
  const diagnostics = hasDocument
    ? input.diagnostics
    : input.diagnostics.filter((diagnostic) => diagnostic.code !== 'missing_core_document');
  const previousDiagnostics = hasDocument
    ? input.previousDiagnostics
    : input.previousDiagnostics?.filter((diagnostic) => diagnostic.code !== 'missing_core_document');
  const coreIssues = validateCoreDoctorIssues({
    diagnostics,
    previousDiagnostics,
    strict: input.settings.strict,
  })
    .filter((issue) => domainSet.has(issue.domain));
  const projection = input.projection ?? (hasDocument
    ? buildRhythmSpellingProjection(input.coreDocument)
    : emptyRhythmSpellingProjection());
  const projectionIssues = validateProjectionDoctorIssues({
    projection,
    coreDocument: input.coreDocument,
    strict: input.settings.strict,
  }).filter((issue) => domainSet.has(issue.domain));
  const multiVoiceAndPlaybackIssues = validateMultiVoiceAndPlaybackDoctorIssues({
    coreDocument: input.coreDocument,
    commands: input.commands,
    strict: input.settings.strict,
  }).filter((issue) => domainSet.has(issue.domain));
  const hasMissingCoreDiagnostic = diagnostics.some((diagnostic) => diagnostic.code === 'missing_core_document')
    || projection.diagnostics.some((diagnostic) => diagnostic.code === 'projection_missing_core_document');
  const missingCoreIssue: DoctorIssue[] = hasDocument && !input.coreDocument && !hasMissingCoreDiagnostic && domainSet.has('document')
    ? [{
        id: 'document.missing-core-document:runtime',
        ruleId: 'document.missing-core-document',
        domain: 'document',
        severity: input.settings.strict ? 'error' : 'warning',
        title: 'Core document exists',
        message: 'No core score document is available for Doctor inspection.',
        newSincePrevious: true,
        data: { trigger: input.trigger },
      }]
    : [];
  const issues = [
    ...missingCoreIssue,
    ...coreIssues,
    ...projectionIssues,
    ...multiVoiceAndPlaybackIssues,
  ].filter(isActionableIssue);
  const errors = issues.filter((issue) => issue.severity === 'error' || issue.severity === 'fatal');
  const warnings = issues.filter((issue) => issue.severity === 'warning');

  const summary = summarizeIssues(issues);
  return {
    schemaVersion: 1,
    kind: 'nex-note-doctor-report',
    generatedAt: new Date().toISOString(),
    mode: input.settings.mode,
    trigger: input.trigger,
    enabledDomains: input.settings.domains,
    revision: input.revision ?? input.coreDocument?.revision ?? null,
    previousRevision: input.previousRevision ?? null,
    commandCount: input.commands?.length ?? 0,
    commandTypes: commandTypes(input.commands),
    rules: summarizeDoctorRules(input.settings.domains),
    issueCount: issues.length,
    warningCount: warnings.length,
    errorCount: errors.length,
    issues,
    diagnostics,
    summary: {
      ...summary,
      blocked: input.settings.strict && summary.newBlockingIssueCount > 0,
    },
  };
}

export function doctorReportBlocksTransaction(report: DoctorReport) {
  return report.mode === 'strict' && report.summary.newBlockingIssueCount > 0;
}
