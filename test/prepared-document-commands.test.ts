import test from 'node:test';
import assert from 'node:assert/strict';
import { syntheticScore } from '../scripts/benchmark-note-entry';
import { buildDocumentState, prepareDocumentCommands, commitPreparedDocumentCommands } from '../src/score-core/commands/apply-document-commands';
import type { ScoreCommand } from '../src/shared/schemas/score-command';

test('verified proposals reuse the exact semantic result and retain the source document', () => {
  const state = buildDocumentState(syntheticScore(2));
  const commands: ScoreCommand[] = [{ type: 'setTitle', title: 'Edited synthetic score' }];
  const proposal = prepareDocumentCommands(state, commands);
  const committed = commitPreparedDocumentCommands({ ...state, sourceMusicXml: 'original source' }, commands, proposal);
  assert.equal(committed.coreDocument, proposal.result.coreDocument);
  assert.equal(committed.xml, proposal.result.xml);
  assert.equal(committed.sourceMusicXml, 'original source');
  assert.notEqual(committed.coreDocument, state.coreDocument);
});

test('a stale or changed proposal is recomputed against the current document', () => {
  const state = buildDocumentState(syntheticScore(2));
  const commands: ScoreCommand[] = [{ type: 'setTitle', title: 'First' }];
  const proposal = prepareDocumentCommands(state, commands);
  commands[0] = { type: 'setTitle', title: 'Second' };
  const changed = commitPreparedDocumentCommands(state, commands, proposal);
  assert.match(changed.xml, /Second/);
  const latest = commitPreparedDocumentCommands(changed, [{ type: 'setComposer', composer: 'Synthetic' }]);
  const rebased = commitPreparedDocumentCommands(latest, [{ type: 'setTitle', title: 'First' }], proposal);
  assert.match(rebased.xml, /Synthetic/);
  assert.match(rebased.xml, /First/);
  assert.notEqual(rebased.coreDocument, proposal.result.coreDocument);
});
