import test from 'node:test';
import assert from 'node:assert/strict';

import { runArrangementCritic } from '../src/nex-note/arrangement/critic/run-arrangement-critic.ts';
import { PLANNER_RESPONSE_FIXTURES } from '../src/nex-note/arrangement/fixtures/planner-response-fixtures.ts';

test('planner response fixtures keep harmonic and voicing candidate links consistent', () => {
  PLANNER_RESPONSE_FIXTURES.forEach((fixture) => {
    const harmonicIds = new Set(fixture.response.harmonicPlanCandidates.map((candidate) => candidate.candidateId));
    assert.ok(fixture.response.harmonicPlanCandidates.length >= 1, fixture.name);
    assert.ok(fixture.response.voicingCandidates.length >= 1, fixture.name);
    fixture.response.voicingCandidates.forEach((candidate) => {
      assert.ok(candidate.slices.length >= 1, fixture.name);
      if (candidate.basedOnHarmonicCandidateId) {
        assert.ok(harmonicIds.has(candidate.basedOnHarmonicCandidateId), `${fixture.name}: missing harmonic candidate link`);
      }
      candidate.slices.forEach((slice) => {
        slice.voices.forEach((voice) => {
          if (!voice.pitch) return;
          assert.equal(typeof voice.pitch.step, 'string');
          assert.equal(typeof voice.pitch.alter, 'number');
          assert.equal(typeof voice.pitch.octave, 'number');
        });
      });
    });
  });
});

test('planner response fixtures produce the expected critic signatures', () => {
  PLANNER_RESPONSE_FIXTURES.forEach((fixture) => {
    const voicingCandidate = fixture.response.voicingCandidates[0];
    assert.ok(voicingCandidate, fixture.name);
    if (!voicingCandidate) return;
    const report = runArrangementCritic({
      spec: fixture.response.spec,
      voicingPlan: {
        texture: fixture.response.spec.texture,
        slices: voicingCandidate.slices,
      },
    });
    assert.deepEqual(report.issues.map((issue) => issue.code).sort(), [...fixture.expectedIssueCodes].sort(), fixture.name);
  });
});
