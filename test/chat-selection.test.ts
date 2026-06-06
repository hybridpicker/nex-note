import test from 'node:test';
import assert from 'node:assert/strict';

import { serializeEditorSelection } from '@/lib/chat-selection';
import type { EditorSelection } from '@/hooks/useNoteEditor';

test('serializeEditorSelection strips circular graphicalNote references', () => {
  const graphicalNote: Record<string, unknown> = {};
  const voiceEntry = { notes: [graphicalNote] };
  graphicalNote.voiceEntry = voiceEntry;

  const selection: EditorSelection = {
    entityIds: ['event-1'],
    anchorEntityId: 'event-1',
    anchor: {
      coreEntityId: 'event-1',
      coreVoiceId: 'voice-1',
      coreMeasureId: 'measure-10',
      corePartId: 'part-1',
      measureNumber: 10,
      staffIndex: 1,
      voiceId: 1,
      timestampNum: 0,
      timestampDen: 1,
      step: 'C',
      octave: 4,
      alter: 0,
      isRest: false,
      graphicalNote,
    },
    selectionCount: 1,
    partId: 'part-1',
    staffIndex: 1,
    voiceId: 1,
  };

  const serialized = serializeEditorSelection(selection);

  assert.doesNotThrow(() => JSON.stringify(serialized));
  assert.equal(serialized?.anchor?.measureNumber, 10);
  assert.ok(serialized?.anchor);
  assert.equal('graphicalNote' in serialized.anchor, false);
});
