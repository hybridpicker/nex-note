import test from 'node:test';
import assert from 'node:assert/strict';
import React from 'react';
import { act, create } from 'react-test-renderer';

import ChatPanel from '../components/ChatPanel.tsx';
import { ARRANGER_PRESETS } from '../lib/arranger-presets.ts';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;

const SAMPLE_XML = `<?xml version="1.0" encoding="UTF-8"?><score-partwise version="3.1"><part-list><score-part id="P1"><part-name>Flute</part-name></score-part></part-list><part id="P1"><measure number="1"><attributes><divisions>1</divisions></attributes><note><pitch><step>C</step><octave>5</octave></pitch><duration>1</duration><voice>1</voice><type>quarter</type></note></measure></part></score-partwise>`;

function props(overrides: Partial<React.ComponentProps<typeof ChatPanel>> = {}): React.ComponentProps<typeof ChatPanel> {
  return {
    xml: SAMPLE_XML,
    provider: 'ollama',
    ollamaModel: 'test-model',
    scoreKey: 'score:arranger',
    scoreRevision: 1,
    scoreSessionReady: false,
    onXmlUpdate() {},
    onApplyCommands() {},
    onBenchmark() {},
    isBenchmark: false,
    ...overrides,
  };
}

test.beforeEach(() => {
  const data = new Map<string, string>();
  Object.assign(globalThis, {
    localStorage: {
      getItem: (key: string) => data.get(key) ?? null,
      setItem: (key: string, value: string) => { data.set(key, value); },
      removeItem: (key: string) => { data.delete(key); },
    },
    window: { __NEX_NOTE_BUG_REPORT_STATE__: undefined },
    fetch: undefined,
  });
  Object.defineProperty(globalThis, 'navigator', { configurable: true, value: undefined });
});

function chips(root: ReturnType<typeof create>['root']) {
  return root.findAllByType('button').filter((button) => button.props['data-arranger-preset']);
}

test('the arranger quick actions appear once a score is open, and not without one', async () => {
  let withScore: ReturnType<typeof create> | null = null;
  let withoutScore: ReturnType<typeof create> | null = null;
  await act(async () => { withScore = create(React.createElement(ChatPanel, props())); });
  await act(async () => { withoutScore = create(React.createElement(ChatPanel, props({ xml: '' }))); });

  assert.deepEqual(chips(withScore!.root).map((chip) => chip.props['data-arranger-preset']), ARRANGER_PRESETS.map((preset) => preset.id));
  assert.equal(chips(withoutScore!.root).length, 0);
  await act(async () => { withScore?.unmount(); withoutScore?.unmount(); });
});

test('a click sends the preset through the chat route; Alt+click puts it into the input instead', async () => {
  const bodies: Array<{ message?: string }> = [];
  Object.assign(globalThis, {
    fetch: async (_url: string, init: { body: string }) => {
      bodies.push(JSON.parse(init.body));
      return { ok: true, status: 200, async json() { return { explanation: 'Planned the setting.', commands: [] }; } };
    },
  });

  let renderer: ReturnType<typeof create> | null = null;
  await act(async () => { renderer = create(React.createElement(ChatPanel, props())); });
  const root = renderer!.root;
  const preset = ARRANGER_PRESETS[0]!;

  await act(async () => { await chips(root)[1]!.props.onClick({ altKey: true }); });
  assert.equal(root.findByType('textarea').props.value, ARRANGER_PRESETS[1]!.prompt);
  assert.equal(bodies.length, 0, 'Alt+click sends nothing');

  await act(async () => { await chips(root)[0]!.props.onClick({ altKey: false }); });
  assert.ok(bodies.length >= 1, 'the click reached the chat route');
  assert.equal(bodies.at(-1)!.message, preset.prompt);

  await act(async () => { renderer?.unmount(); });
});
