import test from 'node:test';
import assert from 'node:assert/strict';

import { buildDocumentDoctorReport, validateProjectionDoctorIssues } from '../src/debug/doctor/document-doctor.ts';
import { DOCTOR_RULES } from '../src/debug/doctor/rulebook.ts';
import { buildRhythmSpellingProjection } from '../src/layout/rhythm-speller.ts';
import { buildDocumentState } from '../src/score-core/commands/apply-document-commands.ts';
import type { DoctorSettings } from '../src/debug/doctor/types.ts';
import type { NoteEvent, ScoreDocumentModel } from '../src/score-core/model/types.ts';

const LIVE_SETTINGS: DoctorSettings = {
  enabled: true,
  mode: 'live',
  domains: ['document', 'input', 'rhythm', 'layout', 'theory', 'playback', 'export'],
  strict: false,
  visual: false,
  source: 'default',
};

function emptyCoreDocument(): ScoreDocumentModel {
  return {
    score: {
      id: 'score:test',
      parts: [],
    },
    metadata: {},
    index: {
      measureIds: {},
      voiceIds: {},
      eventIds: {},
    },
    slurs: [],
    beams: [],
    tuplets: [],
    chordGroups: [],
    graceNotes: [],
    lyricLines: [],
    layoutHints: [],
    tremolos: [],
    glissandos: [],
    arpeggios: [],
    fermataEventIds: new Set(),
    revision: 1,
  };
}

function noteEvent(input: {
  id: string;
  measureNumber?: number;
  staffIndex?: number;
  voiceId?: number;
  timestampNum?: number;
  timestampDen?: number;
  step?: string;
  alter?: number;
  octave?: number;
}): NoteEvent {
  return {
    id: input.id,
    kind: 'note',
    measureNumber: input.measureNumber ?? 1,
    staffIndex: input.staffIndex ?? 1,
    voiceId: input.voiceId ?? 1,
    timestampNum: input.timestampNum ?? 0,
    timestampDen: input.timestampDen ?? 4,
    durationDivisions: 1,
    durationType: 'quarter',
    isDotted: false,
    isChord: false,
    articulations: [],
    lyrics: [],
    pitch: {
      step: input.step ?? 'C',
      alter: input.alter ?? 0,
      octave: input.octave ?? 4,
    },
  };
}

function coreDocumentWithEvents(events: NoteEvent[]): ScoreDocumentModel {
  const voicesById = new Map<number, NoteEvent[]>();
  for (const event of events) {
    voicesById.set(event.voiceId, [...(voicesById.get(event.voiceId) ?? []), event]);
  }

  return {
    score: {
      id: 'score:test',
      parts: [{
        id: 'P1',
        sourcePartId: 'P1',
        name: 'Piano',
        staves: [{
          id: 'staff:P1:1',
          staffIndex: 1,
          measures: [{
            id: 'measure:P1:1:1',
            measureNumber: 1,
            voices: [...voicesById.entries()].map(([voiceId, voiceEvents]) => ({
              id: `voice:P1:1:1:${voiceId}`,
              voiceId,
              events: voiceEvents,
            })),
            directions: [],
            attributes: [{
              id: 'attr:P1:1',
              divisions: 1,
              time: { beats: 4, beatType: 4 },
              clefs: [{ staffIndex: 1, sign: 'G', line: 2 }],
            }],
          }],
        }],
      }],
    },
    metadata: {},
    index: {
      measureIds: { 1: ['measure:P1:1:1'] },
      voiceIds: {},
      eventIds: {},
    },
    slurs: [],
    beams: [],
    tuplets: [],
    chordGroups: [],
    graceNotes: [],
    lyricLines: [],
    layoutHints: [],
    tremolos: [],
    glissandos: [],
    arpeggios: [],
    fermataEventIds: new Set(),
    revision: 1,
  };
}

test('Notation Doctor maps document diagnostics to rule-backed issues', () => {
  const report = buildDocumentDoctorReport({
    trigger: 'apply',
    settings: LIVE_SETTINGS,
    coreDocument: emptyCoreDocument(),
    diagnostics: [{
      level: 'warning',
      code: 'voice_rhythm_sum_mismatch',
      message: 'Measure 3 staff 2 voice 1 has rhythmic value sum 3/4 divisions, but 4/4 requires 4.',
    }],
    previousDiagnostics: [],
    commands: [{ type: 'insertNoteAt', measureNumber: 3, staffIndex: 2, voiceId: 1, timestampNum: 0, timestampDen: 4, step: 'C', octave: 3, alter: 0, durationType: 'quarter' }],
    previousRevision: 7,
    revision: 8,
  });

  assert.equal(report.kind, 'nex-note-doctor-report');
  assert.equal(report.issueCount, 1);
  assert.equal(report.warningCount, 1);
  assert.equal(report.errorCount, 0);
  assert.equal(report.commandTypes[0], 'insertNoteAt');
  assert.equal(report.issues[0]?.ruleId, 'rhythm.voice-sum-matches-meter');
  assert.equal(report.issues[0]?.domain, 'rhythm');
  assert.equal(report.issues[0]?.newSincePrevious, true);
  assert.deepEqual(report.summary.affectedMeasures, [3]);
  assert.deepEqual(report.summary.affectedStaves, [2]);
  assert.deepEqual(report.summary.affectedVoices, [1]);
});

test('Notation Doctor keeps info diagnostics out of actionable issue counts', () => {
  const report = buildDocumentDoctorReport({
    trigger: 'manual',
    settings: LIVE_SETTINGS,
    coreDocument: emptyCoreDocument(),
    diagnostics: [{
      level: 'info',
      code: 'core_execution',
      message: 'Executed 1 command(s) through the core-model path.',
    }],
    previousDiagnostics: [],
    commands: [{ type: 'insertNoteAt', measureNumber: 1, staffIndex: 1, voiceId: 1, timestampNum: 0, timestampDen: 1, step: 'C', octave: 4, alter: 0, durationType: 'quarter' }],
    previousRevision: 5,
    revision: 6,
  });

  assert.equal(report.issueCount, 0);
  assert.equal(report.warningCount, 0);
  assert.equal(report.errorCount, 0);
  assert.equal(report.issues.length, 0);
  assert.equal(report.summary.clean, true);
  assert.equal(report.summary.newIssueCount, 0);
  assert.equal(report.diagnostics.length, 1);
});

test('Notation Doctor verifies multi-voice note commands land in the requested voice', () => {
  const command = {
    type: 'insertNoteAt' as const,
    measureNumber: 1,
    staffIndex: 1,
    voiceId: 2,
    timestampNum: 0,
    timestampDen: 4,
    step: 'A',
    octave: 4,
    alter: 0,
    durationType: 'quarter',
  };

  const cleanReport = buildDocumentDoctorReport({
    trigger: 'input',
    settings: LIVE_SETTINGS,
    coreDocument: coreDocumentWithEvents([noteEvent({ id: 'n-v2', voiceId: 2, step: 'A', octave: 4 })]),
    diagnostics: [],
    commands: [command],
  });
  assert.equal(cleanReport.issues.some((issue) => issue.ruleId === 'input.multi-voice-command-realized'), false);

  const brokenReport = buildDocumentDoctorReport({
    trigger: 'input',
    settings: LIVE_SETTINGS,
    coreDocument: coreDocumentWithEvents([noteEvent({ id: 'n-v1', voiceId: 1, step: 'A', octave: 4 })]),
    diagnostics: [],
    commands: [command],
  });

  const issue = brokenReport.issues.find((entry) => entry.ruleId === 'input.multi-voice-command-realized');
  assert.ok(issue);
  assert.equal(issue.domain, 'input');
  assert.equal(issue.severity, 'error');
  assert.equal(issue.voiceId, 2);
  assert.match(issue.message, /voice 2/);
  const nearbySameSlotNotes = (issue.data as {
    nearbySameSlotNotes?: Array<{ voiceId: number; frequency?: { pitch: string; midi: number; frequencyHz: number } }>;
  }).nearbySameSlotNotes ?? [];
  assert.deepEqual(nearbySameSlotNotes.map((entry) => entry.voiceId), [1]);
  assert.deepEqual(nearbySameSlotNotes.map((entry) => entry.frequency), [{
    pitch: 'A4',
    midi: 69,
    frequencyHz: 440,
  }]);
});

test('Notation Doctor treats rationally equivalent timestamps as the same realized slot', () => {
  const command = {
    type: 'insertNoteAt' as const,
    corePartId: 'P1',
    coreMeasureId: 'measure:P1:1:1',
    measureNumber: 1,
    staffIndex: 1,
    voiceId: 2,
    timestampNum: 1,
    timestampDen: 4,
    step: 'A',
    octave: 4,
    alter: 0,
    durationType: 'quarter',
  };

  const report = buildDocumentDoctorReport({
    trigger: 'input',
    settings: LIVE_SETTINGS,
    coreDocument: coreDocumentWithEvents([noteEvent({
      id: 'n-v2',
      voiceId: 2,
      timestampNum: 2,
      timestampDen: 8,
      step: 'A',
      octave: 4,
    })]),
    diagnostics: [],
    commands: [command],
  });

  assert.equal(report.issues.some((issue) => issue.ruleId === 'input.multi-voice-command-realized'), false);
});

test('Notation Doctor keeps part-aware command checks from being satisfied by a parallel part', () => {
  const command = {
    type: 'insertNoteAt' as const,
    corePartId: 'P1',
    coreMeasureId: 'measure:P1:1:1',
    measureNumber: 1,
    staffIndex: 1,
    voiceId: 2,
    timestampNum: 0,
    timestampDen: 4,
    step: 'A',
    octave: 4,
    alter: 0,
    durationType: 'quarter',
  };

  const report = buildDocumentDoctorReport({
    trigger: 'input',
    settings: LIVE_SETTINGS,
    coreDocument: {
      ...coreDocumentWithEvents([]),
      score: {
        id: 'score:test',
        parts: [
          {
            id: 'P1',
            sourcePartId: 'P1',
            name: 'Upper',
            staves: [{
              id: 'staff:P1:1',
              staffIndex: 1,
              measures: [{
                id: 'measure:P1:1:1',
                measureNumber: 1,
                voices: [{ id: 'voice:P1:1:1:2', voiceId: 2, events: [] }],
                directions: [],
                attributes: [{
                  id: 'attr:P1:1',
                  divisions: 1,
                  time: { beats: 4, beatType: 4 },
                  clefs: [{ staffIndex: 1, sign: 'G', line: 2 }],
                }],
              }],
            }],
          },
          {
            id: 'P2',
            sourcePartId: 'P2',
            name: 'Lower',
            staves: [{
              id: 'staff:P2:1',
              staffIndex: 1,
              measures: [{
                id: 'measure:P2:1:1',
                measureNumber: 1,
                voices: [{
                  id: 'voice:P2:1:1:2',
                  voiceId: 2,
                  events: [noteEvent({ id: 'n-p2', voiceId: 2, step: 'A', octave: 4 })],
                }],
                directions: [],
                attributes: [{
                  id: 'attr:P2:1',
                  divisions: 1,
                  time: { beats: 4, beatType: 4 },
                  clefs: [{ staffIndex: 1, sign: 'G', line: 2 }],
                }],
              }],
            }],
          },
        ],
      },
      index: {
        measureIds: { 1: ['measure:P1:1:1', 'measure:P2:1:1'] },
        voiceIds: {},
        eventIds: {},
      },
    },
    diagnostics: [],
    commands: [command],
  });

  const issue = report.issues.find((entry) => entry.ruleId === 'input.multi-voice-command-realized');
  assert.ok(issue);
});

test('Notation Doctor reports notes that cannot map to a valid playback frequency', () => {
  const report = buildDocumentDoctorReport({
    trigger: 'manual',
    settings: LIVE_SETTINGS,
    coreDocument: coreDocumentWithEvents([noteEvent({ id: 'bad-frequency', octave: 99 })]),
    diagnostics: [],
    commands: [],
  });

  const issue = report.issues.find((entry) => entry.ruleId === 'playback.note-frequency-valid');
  assert.ok(issue);
  assert.equal(issue.domain, 'playback');
  assert.equal(issue.severity, 'error');
  assert.equal(issue.measureNumber, 1);
  assert.equal(issue.voiceId, 1);
  assert.match(issue.message, /invalid playback pitch C99/);
});

test('Notation Doctor treats an empty workspace as no loaded document, not failed hydration', () => {
  const emptyState = buildDocumentState('');
  assert.equal(emptyState.coreDocument, null);
  assert.deepEqual(emptyState.diagnostics.map((diagnostic) => diagnostic.code), ['missing_core_document']);

  const directProjection = buildRhythmSpellingProjection(emptyState.coreDocument);
  assert.deepEqual(directProjection.diagnostics.map((diagnostic) => diagnostic.code), ['projection_missing_core_document']);

  const report = buildDocumentDoctorReport({
    trigger: 'manual',
    settings: LIVE_SETTINGS,
    hasDocument: false,
    coreDocument: emptyState.coreDocument,
    diagnostics: emptyState.diagnostics,
    commands: [],
    previousRevision: null,
    revision: emptyState.revision,
  });

  assert.equal(report.revision, 0);
  assert.equal(report.commandCount, 0);
  assert.equal(report.issueCount, 0);
  assert.equal(report.warningCount, 0);
  assert.equal(report.errorCount, 0);
  assert.deepEqual(report.diagnostics, []);
  assert.equal(report.summary.clean, true);
});

test('Notation Doctor still reports a missing core document when a document is present', () => {
  const report = buildDocumentDoctorReport({
    trigger: 'manual',
    settings: LIVE_SETTINGS,
    hasDocument: true,
    coreDocument: null,
    diagnostics: [{
      level: 'warning',
      code: 'missing_core_document',
      message: 'No core score document is available.',
    }],
    commands: [],
    previousRevision: null,
    revision: 0,
  });

  assert.equal(report.issueCount, 2);
  assert.equal(report.warningCount, 1);
  assert.equal(report.errorCount, 1);
  assert.deepEqual(
    report.issues.map((issue) => (issue.data as { diagnosticCode?: string } | undefined)?.diagnosticCode),
    ['missing_core_document', 'projection_missing_core_document'],
  );
});

test('Notation Doctor tie gate ignores duplicate spell-zero fragments that are not projection splits', () => {
  const sourceEventId = 'measure:P1:2:1:event:1:8:overflow:0';
  const baseEvent = {
    id: sourceEventId,
    kind: 'note' as const,
    measureNumber: 1,
    staffIndex: 2,
    voiceId: 1,
    timestampNum: 8,
    timestampDen: 16,
    durationDivisions: 4,
    durationType: 'quarter',
    isChord: false,
    pitch: {
      step: 'C' as const,
      alter: 0,
      octave: 3,
    },
  };

  const issues = validateProjectionDoctorIssues({
    strict: false,
    projection: {
      schemaVersion: 1,
      kind: 'nex-note-rhythm-spelling-projection',
      generatedAt: '2026-04-29T00:00:00.000Z',
      diagnostics: [],
      voices: [{
        partId: 'P1',
        staffIndex: 2,
        measureNumber: 1,
        voiceId: 1,
        divisions: 4,
        measureDurationDivisions: 16,
        fragments: [
          {
            sourceEventId,
            fragmentId: `${sourceEventId}:spell:0`,
            startDivisions: 8,
            durationDivisions: 4,
            durationType: 'quarter',
            event: baseEvent,
          },
          {
            sourceEventId,
            fragmentId: `${sourceEventId}:spell:0`,
            startDivisions: 8,
            durationDivisions: 4,
            durationType: 'quarter',
            event: {
              ...baseEvent,
              isChord: true,
              pitch: {
                step: 'E',
                alter: 0,
                octave: 3,
              },
            },
          },
        ],
      }],
    },
  });

  assert.equal(issues.some((issue) => issue.ruleId === 'projection.tie-fragments-valid'), false);
});

test('Notation Doctor accepts MuseScore-style tuplet durations as exportable', () => {
  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<score-partwise version="3.1">
  <part-list>
    <score-part id="P1"><part-name>Glockenspiel</part-name></score-part>
  </part-list>
  <part id="P1">
    <measure number="1">
      <attributes>
        <divisions>12</divisions>
        <time><beats>4</beats><beat-type>4</beat-type></time>
        <clef><sign>G</sign><line>2</line></clef>
      </attributes>
      <note>
        <pitch><step>D</step><octave>4</octave></pitch>
        <duration>8</duration><voice>1</voice><type>quarter</type>
        <time-modification><actual-notes>3</actual-notes><normal-notes>2</normal-notes></time-modification>
        <notations><tuplet type="start" number="1" bracket="yes"/></notations>
        <staff>1</staff>
      </note>
      <note>
        <chord/><pitch><step>G</step><octave>4</octave></pitch>
        <duration>8</duration><voice>1</voice><type>quarter</type>
        <time-modification><actual-notes>3</actual-notes><normal-notes>2</normal-notes></time-modification>
        <staff>1</staff>
      </note>
      <note>
        <pitch><step>A</step><octave>4</octave></pitch>
        <duration>8</duration><voice>1</voice><type>quarter</type>
        <time-modification><actual-notes>3</actual-notes><normal-notes>2</normal-notes></time-modification>
        <staff>1</staff>
      </note>
      <note>
        <pitch><step>B</step><octave>4</octave></pitch>
        <duration>8</duration><voice>1</voice><type>quarter</type>
        <time-modification><actual-notes>3</actual-notes><normal-notes>2</normal-notes></time-modification>
        <notations><tuplet type="stop" number="1"/></notations>
        <staff>1</staff>
      </note>
      <note><rest/><duration>24</duration><voice>1</voice><type>half</type><staff>1</staff></note>
    </measure>
  </part>
</score-partwise>`;
  const state = buildDocumentState(xml);
  const issues = validateProjectionDoctorIssues({
    strict: false,
    projection: buildRhythmSpellingProjection(state.coreDocument),
    coreDocument: state.coreDocument,
  });

  assert.deepEqual(
    issues.filter((issue) => issue.ruleId === 'projection.exportable-duration').map((issue) => issue.message),
    [],
  );
});

test('Notation Doctor strict mode elevates rhythm warnings to errors', () => {
  const report = buildDocumentDoctorReport({
    trigger: 'apply',
    settings: { ...LIVE_SETTINGS, mode: 'strict', strict: true },
    coreDocument: emptyCoreDocument(),
    diagnostics: [{
      level: 'warning',
      code: 'voice_timeline_gap',
      message: 'Measure 2 staff 1 voice 1 contains an uncovered rhythmic gap from 2 to 4.',
    }],
    previousDiagnostics: [{
      level: 'warning',
      code: 'voice_timeline_gap',
      message: 'Measure 2 staff 1 voice 1 contains an uncovered rhythmic gap from 2 to 4.',
    }],
    commands: [],
    previousRevision: 1,
    revision: 1,
  });

  assert.equal(report.errorCount, 1);
  assert.equal(report.summary.blocked, false);
  assert.equal(report.summary.newBlockingIssueCount, 0);
  assert.equal(report.issues[0]?.severity, 'error');
  assert.equal(report.issues[0]?.newSincePrevious, false);
});

test('Notation Doctor strict mode marks new blocking rhythm issues', () => {
  const report = buildDocumentDoctorReport({
    trigger: 'apply',
    settings: { ...LIVE_SETTINGS, mode: 'strict', strict: true },
    coreDocument: emptyCoreDocument(),
    diagnostics: [{
      level: 'warning',
      code: 'voice_rhythm_sum_mismatch',
      message: 'Measure 4 staff 1 voice 1 has rhythmic value sum 5/4 divisions, but 4/4 requires 4.',
    }],
    previousDiagnostics: [],
    commands: [{ type: 'insertRestAt', measureNumber: 4, staffIndex: 1, voiceId: 1, timestampNum: 3, timestampDen: 4, durationType: 'half' }],
    previousRevision: 3,
    revision: 4,
  });

  assert.equal(report.summary.blocked, true);
  assert.equal(report.summary.newBlockingIssueCount, 1);
  assert.equal(report.issues[0]?.ruleId, 'rhythm.voice-sum-matches-meter');
});

test('Notation Doctor treats legacy XML fallback as a blocking pipeline bypass', () => {
  const report = buildDocumentDoctorReport({
    trigger: 'apply',
    settings: { ...LIVE_SETTINGS, mode: 'strict', strict: true },
    coreDocument: emptyCoreDocument(),
    diagnostics: [{
      level: 'warning',
      code: 'legacy_fallback',
      message: 'Executed 1 command(s) through the legacy XML fallback path (unsupported_command:unknown).',
    }],
    previousDiagnostics: [],
    commands: [{ type: 'setTempo', bpm: 120 }],
    previousRevision: 1,
    revision: 2,
  });

  assert.equal(report.summary.blocked, true);
  assert.equal(report.issues[0]?.ruleId, 'pipeline.no-xml-bypass');
  assert.equal(report.issues[0]?.severity, 'error');
});

test('Notation Doctor rulebook includes active and planned professional domains', () => {
  const activeDomains = new Set(DOCTOR_RULES.filter((rule) => rule.status === 'active').map((rule) => rule.domain));
  const plannedDomains = new Set(DOCTOR_RULES.filter((rule) => rule.status === 'planned').map((rule) => rule.domain));

  assert(activeDomains.has('rhythm'));
  assert(activeDomains.has('document'));
  assert(plannedDomains.has('input'));
  assert(plannedDomains.has('layout'));
  assert(plannedDomains.has('theory'));
  assert(plannedDomains.has('playback'));
  assert(plannedDomains.has('export'));
});
