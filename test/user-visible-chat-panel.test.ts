import test from 'node:test';
import assert from 'node:assert/strict';
import React from 'react';
import { act, create } from 'react-test-renderer';

import ChatPanel from '../components/ChatPanel.tsx';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;

class MemoryStorage {
  private data = new Map<string, string>();
  getItem(key: string) { return this.data.has(key) ? this.data.get(key)! : null; }
  setItem(key: string, value: string) { this.data.set(key, value); }
  removeItem(key: string) { this.data.delete(key); }
  clear() { this.data.clear(); }
}

const storage = new MemoryStorage();
const SAMPLE_XML = `<?xml version="1.0" encoding="UTF-8"?><score-partwise version="3.1"><part-list><score-part id="P1"><part-name>Piano</part-name></score-part></part-list><part id="P1"><measure number="1"><attributes><divisions>1</divisions></attributes><note><pitch><step>C</step><octave>4</octave></pitch><duration>1</duration><voice>1</voice><type>quarter</type><staff>1</staff></note></measure></part></score-partwise>`;

type Renderer = ReturnType<typeof create>;

function createFetchResponse(body: unknown, ok = true) {
  return {
    ok,
    async json() {
      return body;
    },
  };
}

function collectText(root: Renderer['root']) {
  return root.findAll((node) => Array.isArray(node.children) && node.children.some((child) => typeof child === 'string'))
    .map((node) => node.children.filter((child) => typeof child === 'string').join(''))
    .join('\n');
}

function getComposer(root: Renderer['root']) {
  return root.findByType('textarea');
}

function getSendButton(root: Renderer['root']) {
  return root.findAllByType('button').find((button) => button.children.join('') === 'Send');
}

function getCopyLogButton(root: Renderer['root']) {
  return root.findAllByType('button').find((button) => button.props['aria-label'] === 'Copy full chat transcript');
}

function getCopyLogButtons(root: Renderer['root']) {
  return root.findAllByType('button').filter((button) => button.props['aria-label'] === 'Copy full chat transcript');
}

function getButtonByText(root: Renderer['root'], text: string) {
  return root.findAllByType('button').find((button) => button.children.join('') === text);
}

async function sendMessage(root: Renderer['root'], message: string) {
  const input = getComposer(root);
  const button = getSendButton(root);
  assert.ok(button, 'Send button should exist');

  await act(async () => {
    input.props.onChange({ target: { value: message } });
  });
  await act(async () => {
    await button.props.onClick();
  });
}

function buildChatPanelProps(overrides: Partial<React.ComponentProps<typeof ChatPanel>> = {}): React.ComponentProps<typeof ChatPanel> {
  return {
    xml: SAMPLE_XML,
    provider: 'ollama',
    ollamaModel: 'gemma4:31b',
    scoreKey: 'score:test',
    scoreRevision: 1,
    scoreSessionReady: false,
    onXmlUpdate() {},
    onApplyCommands() {},
    onUndo() {},
    onRedo() {},
    onBenchmark() {},
    isBenchmark: false,
    onOperationsApplied() {},
    onTranscriptChange() {},
    ...overrides,
  };
}

test.beforeEach(() => {
  storage.clear();
  Object.assign(globalThis, {
    localStorage: storage,
    window: {
      __NEX_NOTE_BUG_REPORT_STATE__: undefined,
    },
    fetch: undefined,
  });
  Object.defineProperty(globalThis, 'navigator', {
    configurable: true,
    value: undefined,
  });
});

test('ChatPanel handles local mode, undo, and redo without touching the network', async () => {
  const calls = {
    undo: 0,
    redo: 0,
  };

  let renderer: Renderer | null = null;
  await act(async () => {
    renderer = create(React.createElement(ChatPanel, buildChatPanelProps({
      onUndo() { calls.undo += 1; },
      onRedo() { calls.redo += 1; },
    })));
  });

  const root = renderer!.root;
  const composer = getComposer(root);
  assert.equal(composer.props['aria-label'], 'AI assistant message');
  assert.equal(composer.props.name, 'nex-note-ai-message');
  const initialCopyButton = getCopyLogButton(root);
  assert.ok(initialCopyButton, 'Copy log button should stay visible in the input row');
  assert.equal(initialCopyButton.props.disabled, true);

  await sendMessage(root, '/mode rehearsal');
  assert.ok(getCopyLogButtons(root).length >= 1);
  assert.ok(getCopyLogButtons(root).some((button) => button.props.disabled === false));
  await sendMessage(root, 'undo');
  await sendMessage(root, 'redo');

  const text = collectText(root);
  assert.match(text, /Session mode set to "rehearsal"\./);
  assert.match(text, /Undid the last change\./);
  assert.match(text, /Redid the last change\./);
  assert.equal(calls.undo, 1);
  assert.equal(calls.redo, 1);

  await act(async () => {
    renderer?.unmount();
  });
});

test('ChatPanel copies the full chat transcript for debugging', async () => {
  let copiedText = '';
  Object.defineProperty(globalThis, 'navigator', {
    configurable: true,
    value: {
      clipboard: {
        async writeText(text: string) {
          copiedText = text;
        },
      },
    },
  });

  let renderer: Renderer | null = null;
  await act(async () => {
    renderer = create(React.createElement(ChatPanel, buildChatPanelProps()));
  });

  const root = renderer!.root;
  await sendMessage(root, '/mode debug');
  const copyButton = getCopyLogButton(root);
  assert.ok(copyButton, 'Copy log button should exist after messages are present');

  await act(async () => {
    await copyButton.props.onClick();
  });

  assert.match(copiedText, /\[user\]\n\/mode debug/);
  assert.match(copiedText, /\[assistant\]\nSession mode set to "debug"\./);
  assert.match(collectText(root), /Copied/);

  await act(async () => {
    renderer?.unmount();
  });
});

test('ChatPanel sends recent chat history with follow-up requests', async () => {
  const payloads: Array<{
    message?: string;
    sessionContext?: {
      chatHistory?: Array<{ role: 'user' | 'assistant'; text: string }>;
    };
  }> = [];

  Object.assign(globalThis, {
    fetch: async (_url: string, init?: { body?: string }) => {
      const payload = init?.body ? JSON.parse(init.body) : {};
      payloads.push(payload);
      const firstResponse = payloads.length === 1;
      return createFetchResponse({
        requiresConfirmation: false,
        explanation: firstResponse ? 'Prepared C and G.' : 'Changed the second chord to minor.',
        workflowLabel: 'Harmony',
        commands: [],
        affectedMeasures: [],
        validatorFindings: [],
        provider: 'ollama',
        model: 'gemma4:31b',
        latencyMs: 8,
        xml: SAMPLE_XML,
        taskState: { scoreKey: 'score:test', lastWorkflow: 'harmony' },
      });
    },
  });

  let renderer: Renderer | null = null;
  await act(async () => {
    renderer = create(React.createElement(ChatPanel, buildChatPanelProps()));
  });

  const root = renderer!.root;
  await sendMessage(root, 'add chords C and G');
  await sendMessage(root, 'make the second chord minor');

  assert.equal(payloads.length, 2);
  assert.deepEqual(payloads[0]?.sessionContext?.chatHistory, [
    { role: 'user', text: 'add chords C and G' },
  ]);
  assert.deepEqual(payloads[1]?.sessionContext?.chatHistory, [
    { role: 'user', text: 'add chords C and G' },
    { role: 'assistant', text: 'Harmony: Prepared C and G.' },
    { role: 'user', text: 'make the second chord minor' },
  ]);

  await act(async () => {
    renderer?.unmount();
  });
});

test('ChatPanel copy log includes pending preview apply state and command payload', async () => {
  let copiedText = '';
  let latestTranscript: Array<{ text: string }> = [];
  Object.defineProperty(globalThis, 'navigator', {
    configurable: true,
    value: {
      clipboard: {
        async writeText(text: string) {
          copiedText = text;
        },
      },
    },
  });
  Object.assign(globalThis, {
    fetch: async () => createFetchResponse({
      requiresConfirmation: true,
      explanation: 'Prepared alternate lick.',
      workflowLabel: 'Arrangement assistant',
      commands: [
        { type: 'addChords', chords: '1:Gmaj7,2:F#m7' },
        { type: 'clearMeasureVoice', measureNumber: 1, staffIndex: 1, voiceId: 1 },
        { type: 'insertNoteAt', measureNumber: 1, staffIndex: 1, voiceId: 1, timestampNum: 0, timestampDen: 4, step: 'G', octave: 4, alter: 0, durationType: 'quarter' },
      ],
      affectedMeasures: [1, 2],
      ambiguities: [],
      plan: ['Replace the selected melody voice with concrete chord-tone motion'],
      riskReasons: ['Arrangement suggestions should stay previewable before apply'],
      validatorFindings: [],
      provider: 'local-layout',
      model: 'musician-arrangement-engine',
      latencyMs: 0,
      taskState: { scoreKey: 'score:test', lastWorkflow: 'arrangement-assist' },
    }),
  });

  let renderer: Renderer | null = null;
  await act(async () => {
    renderer = create(React.createElement(ChatPanel, buildChatPanelProps({
      onTranscriptChange(messages) {
        latestTranscript = messages;
      },
    })));
  });

  const root = renderer!.root;
  await sendMessage(root, 'arrange other version');
  const copyButton = getCopyLogButton(root);
  assert.ok(copyButton);

  await act(async () => {
    await copyButton.props.onClick();
  });

  assert.match(copiedText, /\[pending-preview\]/);
  assert.match(copiedText, /status: NOT APPLIED/);
  assert.match(copiedText, /commands: 3 \(addChords, clearMeasureVoice, insertNoteAt\)/);
  assert.match(copiedText, /affectedMeasures: 1, 2/);
  assert.match(copiedText, /"type":"insertNoteAt"/);
  assert.match(copiedText, /nextAction: click Apply or type "apply" to change the score/);
  assert.ok(latestTranscript.some((message) => message.text.includes('[pending-preview]') && message.text.includes('status: NOT APPLIED')));

  await act(async () => {
    renderer?.unmount();
  });
});

test('ChatPanel discards a pending preview when a new request arrives and applies the fresh response', async () => {
  const fetchCalls: string[] = [];
  const xmlUpdates: Array<{ xml: string; label?: string }> = [];

  const previewResponse = {
    requiresConfirmation: true,
    explanation: 'Prepared title update.',
    workflowLabel: 'Content edit',
    commands: [{ type: 'setTitle', title: 'Preview Title' }],
    affectedMeasures: [],
    ambiguities: [],
    plan: ['Set title'],
    riskReasons: ['Preview required'],
    validatorFindings: [],
    provider: 'ollama',
    model: 'gemma4:31b',
    latencyMs: 12,
    taskState: { scoreKey: 'score:test', lastWorkflow: 'preview' },
  };

  const appliedResponse = {
    requiresConfirmation: false,
    explanation: 'Applied composer update.',
    workflowLabel: 'Content edit',
    commands: [{ type: 'setComposer', composer: 'Codex' }],
    affectedMeasures: [],
    validatorFindings: [],
    provider: 'ollama',
    model: 'gemma4:31b',
    latencyMs: 10,
    xml: SAMPLE_XML.replace('Piano', 'Codex Piano'),
    taskState: { scoreKey: 'score:test', lastWorkflow: 'apply' },
  };

  let responseIndex = 0;
  Object.assign(globalThis, {
    fetch: async (_url: string, init?: { body?: string }) => {
      const payload = init?.body ? JSON.parse(init.body) : null;
      fetchCalls.push(String(payload?.message ?? ''));
      const body = responseIndex === 0 ? previewResponse : appliedResponse;
      responseIndex += 1;
      return createFetchResponse(body);
    },
  });

  let renderer: Renderer | null = null;
  await act(async () => {
    renderer = create(React.createElement(ChatPanel, buildChatPanelProps({
      onXmlUpdate(xml, meta) {
        xmlUpdates.push({ xml, label: meta?.label });
      },
    })));
  });

  const root = renderer!.root;

  await sendMessage(root, 'set the title');
  assert.match(collectText(root), /Preview only\. Type "apply" to confirm or "cancel" to discard\./);
  assert.match(collectText(root), /Prepared 1 score operation: setTitle\./);
  assert.match(collectText(root), /No score changes have been applied yet\./);
  assert.equal(getComposer(root).props.placeholder, 'Type apply to confirm or cancel to discard…');

  await sendMessage(root, 'change the composer');

  const text = collectText(root);
  assert.match(text, /Discarded the pending preview and started a new request\./);
  assert.match(text, /Applied composer update\./);
  assert.equal(getComposer(root).props.placeholder, 'Describe your edit…');
  assert.deepEqual(fetchCalls, ['set the title', 'change the composer']);
  assert.equal(xmlUpdates.length, 1);
  assert.equal(xmlUpdates[0]?.label, 'change the composer');
  assert.match(xmlUpdates[0]?.xml ?? '', /Codex Piano/);

  await act(async () => {
    renderer?.unmount();
  });
});

test('ChatPanel reports failed preview apply instead of claiming a no-op changed the score', async () => {
  Object.assign(globalThis, {
    fetch: async () => createFetchResponse({
      requiresConfirmation: true,
      explanation: 'Prepared alternate lick.',
      workflowLabel: 'Arrangement assistant',
      commands: [
        { type: 'clearMeasureVoice', measureNumber: 1, staffIndex: 1, voiceId: 1 },
        { type: 'insertNoteAt', measureNumber: 1, staffIndex: 1, voiceId: 1, timestampNum: 0, timestampDen: 4, step: 'G', octave: 4, alter: 0, durationType: 'quarter' },
      ],
      affectedMeasures: [1],
      ambiguities: [],
      plan: ['Replace the selected melody voice with concrete chord-tone motion'],
      riskReasons: ['Arrangement suggestions should stay previewable before apply'],
      validatorFindings: [],
      provider: 'local-layout',
      model: 'musician-arrangement-engine',
      latencyMs: 0,
      taskState: { scoreKey: 'score:test', lastWorkflow: 'arrangement-assist' },
    }),
  });

  let renderer: Renderer | null = null;
  await act(async () => {
    renderer = create(React.createElement(ChatPanel, buildChatPanelProps({
      onApplyCommands() {
        return {
          applied: false,
          reason: 'no-xml-change',
          commandCount: 2,
          appliedCommandCount: 0,
          commandTypes: ['clearMeasureVoice', 'insertNoteAt'],
        };
      },
    })));
  });

  const root = renderer!.root;
  await sendMessage(root, 'arrange other version');
  assert.match(collectText(root), /Prepared 2 score operations: clearMeasureVoice, insertNoteAt\./);
  const applyButton = getButtonByText(root, 'Apply');
  assert.ok(applyButton);

  await act(async () => {
    applyButton.props.onClick();
  });

  const text = collectText(root);
  assert.match(text, /I could not apply that preview because the score did not change \(no-xml-change\)\./);
  assert.match(text, /Command batch: clearMeasureVoice, insertNoteAt\./);
  assert.doesNotMatch(text, /Arrangement assistant: Prepared alternate lick\. \(m\.1\)/);
  assert.equal(getComposer(root).props.placeholder, 'Type apply to confirm or cancel to discard…');

  await act(async () => {
    renderer?.unmount();
  });
});

test('ChatPanel can send an inline melody request before any score is loaded', async () => {
  const fetchCalls: string[] = [];
  const xmlUpdates: Array<{ xml: string; label?: string }> = [];

  Object.assign(globalThis, {
    fetch: async (_url: string, init?: { body?: string }) => {
      const payload = init?.body ? JSON.parse(init.body) : null;
      fetchCalls.push(String(payload?.message ?? ''));
      return createFetchResponse({
        requiresConfirmation: false,
        explanation: 'Arrangement applied.',
        workflowLabel: 'General edit',
        commands: [{ type: 'setTitle', title: 'Chat Arrangement Sketch' }],
        affectedMeasures: [1],
        validatorFindings: [],
        provider: 'ollama',
        model: 'gemma4:31b',
        latencyMs: 9,
        xml: SAMPLE_XML,
        taskState: { scoreKey: 'score:test', lastWorkflow: 'general' },
      });
    },
  });

  let renderer: Renderer | null = null;
  await act(async () => {
    renderer = create(React.createElement(ChatPanel, buildChatPanelProps({
      xml: '',
      scoreKey: undefined,
      scoreRevision: undefined,
      onXmlUpdate(xml, meta) {
        xmlUpdates.push({ xml, label: meta?.label });
      },
    })));
  });

  const root = renderer!.root;
  const input = getComposer(root);
  assert.equal(input.props.disabled, false);
  assert.match(String(input.props.placeholder), /paste a melody/i);

  await sendMessage(root, 'Arrangiere diese Melodie: C4 D4 E4 G4 | E4 D4 C4');

  assert.deepEqual(fetchCalls, ['Arrangiere diese Melodie: C4 D4 E4 G4 | E4 D4 C4']);
  assert.equal(xmlUpdates.length, 1);
  assert.equal(xmlUpdates[0]?.label, 'Arrangiere diese Melodie: C4 D4 E4 G4 | E4 D4 C4');
  assert.match(collectText(root), /Arrangement applied\./);

  await act(async () => {
    renderer?.unmount();
  });
});
