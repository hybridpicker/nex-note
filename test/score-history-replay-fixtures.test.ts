import test from 'node:test';
import assert from 'node:assert/strict';
import React from 'react';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { act, create } from 'react-test-renderer';
import { useScoreDocument } from '../hooks/useScoreDocument.ts';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;

type HookValue = ReturnType<typeof useScoreDocument>;

function loadFixture(name: string) {
  return readFileSync(path.join(process.cwd(), 'test', 'fixtures', name), 'utf8');
}

function renderHook(initialXml: string) {
  const ref: { current: HookValue | null } = { current: null };

  function Harness() {
    ref.current = useScoreDocument(initialXml);
    return null;
  }

  let renderer: ReturnType<typeof create> | null = null;
  act(() => {
    renderer = create(React.createElement(Harness));
  });

  return {
    get current() {
      return ref.current!;
    },
    unmount() {
      act(() => {
        renderer?.unmount();
      });
    },
  };
}

test('history replay stays stable across a realistic repeat and layout edit chain', () => {
  const hook = renderHook(loadFixture('repeat-ending-sequence.musicxml'));

  act(() => {
    hook.current.applyCommands([{ type: 'setTitle', title: 'Replay Repeat Study' }], { label: 'Set title' });
  });
  act(() => {
    hook.current.applyCommands([{ type: 'setPageBreak', measureNumber: 3, value: true }], { label: 'Page break' });
  });
  act(() => {
    hook.current.applyCommands([{ type: 'setSystemBreak', measureNumber: 2, value: true }], { label: 'System break' });
  });
  act(() => {
    hook.current.applyCommands([{ type: 'addRehearsalMark', measureNumber: 2, text: 'B' }], { label: 'Rehearsal' });
  });

  assert.equal(hook.current.coreDocument?.metadata.title, 'Replay Repeat Study');
  assert.ok(hook.current.coreDocument?.score.parts[0].staves[0].measures[2].print?.newPage);
  assert.ok(hook.current.coreDocument?.score.parts[0].staves[0].measures[1].print?.newSystem);
  assert.ok(hook.current.xml.includes('<rehearsal>B</rehearsal>'));

  act(() => {
    hook.current.undo();
    hook.current.undo();
  });

  assert.ok(hook.current.coreDocument?.score.parts[0].staves[0].measures[2].print?.newPage);
  assert.ok(!hook.current.coreDocument?.score.parts[0].staves[0].measures[1].print?.newSystem);
  assert.ok(!hook.current.xml.includes('<rehearsal>B</rehearsal>'));

  act(() => {
    hook.current.redo();
    hook.current.redo();
  });

  assert.ok(hook.current.coreDocument?.score.parts[0].staves[0].measures[1].print?.newSystem);
  assert.ok(hook.current.xml.includes('<rehearsal>B</rehearsal>'));
  assert.equal(hook.current.historyDepth, 4);
  hook.unmount();
});

test('history replay preserves cross-measure tie semantics through undo and redo', () => {
  const hook = renderHook(loadFixture('cross-measure-tie.musicxml'));

  act(() => {
    hook.current.applyCommands([
      { type: 'changeNotePitch', measureNumber: 2, staffIndex: 1, voiceId: 1, timestampNum: 2, timestampDen: 4, step: 'B', octave: 4, alter: 0 },
    ], { label: 'Change trailing note' });
  });
  act(() => {
    hook.current.applyCommands([
      { type: 'setLyricLine', measureNumber: 2, staffIndex: 1, voiceId: 1, timestampNum: 0, timestampDen: 4, verseNumber: 1, text: 'la', syllabic: 'single' },
    ], { label: 'Add lyric' });
  });

  assert.ok(!hook.current.diagnostics.some((entry) => entry.code === 'tie_continuity'));
  assert.ok(hook.current.xml.includes('<text>la</text>'));

  act(() => {
    hook.current.undo();
    hook.current.undo();
  });

  assert.ok(!hook.current.xml.includes('<text>la</text>'));
  assert.ok(!hook.current.diagnostics.some((entry) => entry.code === 'tie_continuity'));

  act(() => {
    hook.current.redo();
    hook.current.redo();
  });

  assert.ok(hook.current.xml.includes('<text>la</text>'));
  assert.ok(!hook.current.diagnostics.some((entry) => entry.code === 'tie_continuity'));
  hook.unmount();
});
