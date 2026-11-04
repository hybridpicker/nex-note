import test from 'node:test';
import assert from 'node:assert/strict';

import { validateProjectionDoctorIssues } from '../src/debug/doctor/document-doctor.ts';
import { buildRhythmSpellingProjection } from '../src/layout/rhythm-speller.ts';
import { buildDocumentState } from '../src/score-core/commands/apply-document-commands.ts';

/*
 * A value that fills the whole 4/4 bar (whole rest, whole note) is correct notation and is never
 * split by the rhythm speller; the strong-beat rule must not report it (iteration 20). A value
 * that crosses the half-bar inside the bar is still reported.
 */

const xml = `<?xml version="1.0" encoding="UTF-8"?>
<score-partwise version="4.0"><part-list><score-part id="P1"><part-name>Flute</part-name></score-part></part-list><part id="P1">
<measure number="1"><attributes><divisions>2</divisions><time><beats>4</beats><beat-type>4</beat-type></time><clef><sign>G</sign><line>2</line></clef></attributes>
<note><pitch><step>C</step><octave>5</octave></pitch><duration>8</duration><voice>1</voice><type>whole</type></note></measure>
<measure number="2"><note><rest measure="yes"/><duration>8</duration><voice>1</voice><type>whole</type></note></measure>
<measure number="3"><note><rest/><duration>8</duration><voice>1</voice><type>whole</type></note></measure>
</part></score-partwise>`;

const STRONG_BEAT_RULE = 'projection.strong-beat-visible';

test('whole-bar notes and rests in 4/4 are not reported as hiding the half-bar', () => {
  const state = buildDocumentState(xml);
  const issues = validateProjectionDoctorIssues({
    strict: true,
    projection: buildRhythmSpellingProjection(state.coreDocument),
    coreDocument: state.coreDocument,
  });
  assert.deepEqual(issues.filter((issue) => issue.ruleId === STRONG_BEAT_RULE).map((issue) => issue.message), []);
});

test('a fragment crossing the half-bar inside the bar is still reported', () => {
  const state = buildDocumentState(xml);
  const event = state.coreDocument!.score.parts[0]!.staves[0]!.measures[0]!.voices[0]!.events[0]!;
  const issues = validateProjectionDoctorIssues({
    strict: true,
    projection: {
      schemaVersion: 1,
      kind: 'nex-note-rhythm-spelling-projection',
      generatedAt: '2026-11-04T00:00:00.000Z',
      diagnostics: [],
      voices: [{
        partId: 'P1',
        staffIndex: 1,
        measureNumber: 1,
        voiceId: 1,
        divisions: 2,
        measureDurationDivisions: 8,
        fragments: [{
          sourceEventId: event.id,
          fragmentId: `${event.id}:spell:0`,
          startDivisions: 2,
          durationDivisions: 4,
          durationType: 'half',
          event: { ...event, timestampNum: 2, durationDivisions: 4, durationType: 'half' },
        }],
      }],
    } as never,
    coreDocument: state.coreDocument,
  });
  assert.equal(issues.filter((issue) => issue.ruleId === STRONG_BEAT_RULE).length, 1);
});
