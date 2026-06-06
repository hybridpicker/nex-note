'use client';

import { useState, useRef, useEffect } from 'react';
import type { ProviderName } from '@/lib/ai-provider-config';
import { dbg } from '@/lib/debug';
import type { ScoreCommand } from '@/lib/score-commands';
import type { EditorSelection } from '@/hooks/useNoteEditor';
import { serializeEditorSelection } from '@/lib/chat-selection';
import {
  readChatTaskState,
  writeChatTaskState,
  type PersistedChatTaskState,
} from '@/lib/chat-task-state';
import { useI18n } from '@/lib/i18n';

interface Message {
  role: 'user' | 'assistant';
  text: string;
  provider?: string;
  model?: string;
  latencyMs?: number;
}

interface ChatSessionState {
  mode: string | null;
  pinnedScope: string | null;
  recentUserRequests: string[];
  taskState: PersistedChatTaskState;
}

interface PendingConfirmation {
  requestLabel: string;
  commands: ScoreCommand[];
  explanation: string;
  workflowLabel?: string;
  affectedMeasures: number[];
  ambiguities: string[];
  plan: string[];
  riskReasons: string[];
  validatorFindings: string[];
  provider?: string;
  model?: string;
  latencyMs?: number;
}

interface Props {
  xml: string;
  provider: ProviderName;
  ollamaModel: string;
  scoreKey?: string;
  scoreRevision?: number;
  scoreSessionReady?: boolean;
  selection?: EditorSelection;
  onXmlUpdate: (xml: string, meta?: { label?: string; commands?: ScoreCommand[] }) => void;
  onApplyCommands: (commands: ScoreCommand[], label?: string) => void;
  onUndo?: () => void;
  onRedo?: () => void;
  onBenchmark: (message: string) => void;
  isBenchmark: boolean;
  onOperationsApplied?: (ops: unknown[]) => void;
  onTranscriptChange?: (messages: Message[]) => void;
}

function getLocalAction(message: string): 'undo' | 'redo' | null {
  const normalized = message.trim().toLowerCase();
  if (['undo', 'make that undo', 'undo that', 'revert that', 'go back'].includes(normalized)) return 'undo';
  if (['redo', 'redo that', 'do that again'].includes(normalized)) return 'redo';
  return null;
}

function getConfirmationAction(message: string): 'confirm' | 'cancel' | null {
  const normalized = message.trim().toLowerCase();
  if (['apply', 'confirm', 'yes', 'go ahead', 'weiter', 'anwenden', 'bestätigen', 'ja'].includes(normalized)) return 'confirm';
  if (['cancel', 'stop', 'no', 'nein', 'abbrechen', 'verwerfen'].includes(normalized)) return 'cancel';
  return null;
}

function buildPreviewText(preview: PendingConfirmation, t: ReturnType<typeof useI18n>['t']) {
  const lines = [
    preview.workflowLabel ? `${preview.workflowLabel}.` : '',
    `${preview.explanation || t('chat.previewWaiting')}`,
    t('chat.previewOnly'),
  ].filter(Boolean);
  if (preview.affectedMeasures.length) {
    lines.push(`${t('chat.affectedMeasures')}: ${preview.affectedMeasures.join(', ')}`);
  }
  if (preview.riskReasons.length) {
    lines.push(`${t('chat.confirmationReason')}: ${preview.riskReasons.join('; ')}`);
  }
  if (preview.plan.length) {
    lines.push(`${t('chat.plan')}: ${preview.plan.join(' -> ')}`);
  }
  if (preview.ambiguities.length) {
    lines.push(`${t('chat.openQuestions')}: ${preview.ambiguities.join('; ')}`);
  }
  if (preview.validatorFindings.length) {
    lines.push(`${t('chat.validatorFindings')}: ${preview.validatorFindings.join('; ')}`);
  }
  return lines.join('\n');
}

function formatChatTranscript(messages: Message[]) {
  return messages.map((message) => {
    const meta = message.model ? ` (${message.model}${typeof message.latencyMs === 'number' ? ` · ${message.latencyMs}ms` : ''})` : '';
    return `[${message.role}${meta}]\n${message.text}`;
  }).join('\n\n');
}

async function copyTextToClipboard(text: string) {
  if (typeof navigator !== 'undefined' && navigator.clipboard?.writeText) {
    await navigator.clipboard.writeText(text);
    return true;
  }

  if (typeof document === 'undefined') return false;

  const textarea = document.createElement('textarea');
  textarea.value = text;
  textarea.setAttribute('readonly', 'true');
  textarea.style.position = 'fixed';
  textarea.style.left = '-9999px';
  textarea.style.top = '0';
  document.body.appendChild(textarea);
  textarea.select();
  try {
    return document.execCommand('copy');
  } finally {
    textarea.remove();
  }
}

function isSafeWholeScoreTransposePreview(
  commands: ScoreCommand[] | undefined,
  riskReasons: unknown,
) : commands is ScoreCommand[] {
  if (!Array.isArray(commands) || commands.length !== 2) return false;
  if (!Array.isArray(riskReasons) || riskReasons.length !== 1 || riskReasons[0] !== 'Multiple commands will be applied together') {
    return false;
  }

  let hasTranspose = false;
  let hasSetKey = false;

  for (const command of commands) {
    if (command?.type === 'transposeDocumentChromatic') {
      hasTranspose = true;
      continue;
    }
    if (command?.type === 'setKey') {
      hasSetKey = true;
      continue;
    }
    return false;
  }

  return hasTranspose && hasSetKey;
}

export default function ChatPanel({ xml, provider, ollamaModel, scoreKey, scoreRevision, scoreSessionReady = false, selection, onXmlUpdate, onApplyCommands, onUndo, onRedo, onBenchmark, isBenchmark, onOperationsApplied, onTranscriptChange }: Props) {
  const { locale, t } = useI18n();
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [copyState, setCopyState] = useState<'idle' | 'copied' | 'failed'>('idle');
  const [pendingConfirmation, setPendingConfirmation] = useState<PendingConfirmation | null>(null);
  const [sessionState, setSessionState] = useState<ChatSessionState>({
    mode: null,
    pinnedScope: null,
    recentUserRequests: [],
    taskState: {},
  });
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  useEffect(() => {
    onTranscriptChange?.(messages);
  }, [messages, onTranscriptChange]);

  useEffect(() => {
    if (copyState === 'idle') return;
    const timeout = globalThis.setTimeout(() => setCopyState('idle'), 1600);
    return () => globalThis.clearTimeout(timeout);
  }, [copyState]);

  useEffect(() => {
    const persisted = readChatTaskState(scoreKey);
    setSessionState((state) => ({
      ...state,
      taskState: persisted,
    }));
  }, [scoreKey]);

  async function send() {
    const msg = input.trim();
    if (!msg || (isBenchmark && !xml)) return;
    setInput('');
    setMessages((m) => [...m, { role: 'user', text: msg }]);
    dbg.info('chat', 'user', { provider, ollamaModel, selectionCount: selection?.selectionCount ?? 0, text: msg });

    if (msg.toLowerCase().startsWith('/mode ')) {
      const mode = msg.slice('/mode '.length).trim() || null;
      setSessionState((state) => ({ ...state, mode }));
      setMessages((m) => [...m, { role: 'assistant', text: mode ? t('chat.sessionSet', { mode }) : t('chat.sessionCleared') }]);
      return;
    }

    const confirmationAction = getConfirmationAction(msg);
    if (pendingConfirmation && confirmationAction === 'confirm') {
      onApplyCommands(pendingConfirmation.commands, pendingConfirmation.requestLabel);
      if (pendingConfirmation.commands.length && onOperationsApplied) {
        onOperationsApplied(pendingConfirmation.commands);
      }
      setMessages((m) => [...m, {
        role: 'assistant',
        text: `${pendingConfirmation.workflowLabel ? `${pendingConfirmation.workflowLabel}: ` : ''}${pendingConfirmation.explanation || t('chat.previewApplied')}${pendingConfirmation.affectedMeasures.length ? ` (m.${pendingConfirmation.affectedMeasures.join(', m.')})` : ''}`,
        provider: pendingConfirmation.provider,
        model: pendingConfirmation.model,
        latencyMs: pendingConfirmation.latencyMs,
      }]);
      setPendingConfirmation(null);
      return;
    }
    if (pendingConfirmation && confirmationAction === 'cancel') {
      setPendingConfirmation(null);
      setMessages((m) => [...m, { role: 'assistant', text: t('chat.previewDiscarded') }]);
      return;
    }
    if (pendingConfirmation) {
      setPendingConfirmation(null);
      setMessages((m) => [...m, { role: 'assistant', text: t('chat.discardedNewRequest') }]);
    }

    const localAction = getLocalAction(msg);
    if (localAction === 'undo' && onUndo) {
      onUndo();
      setMessages((m) => [...m, { role: 'assistant', text: t('chat.undid') }]);
      return;
    }
    if (localAction === 'redo' && onRedo) {
      onRedo();
      setMessages((m) => [...m, { role: 'assistant', text: t('chat.redid') }]);
      return;
    }

    if (isBenchmark) {
      onBenchmark(msg);
      return;
    }

    setLoading(true);
    try {
      const serializedSelection = serializeEditorSelection(selection);
      const nextSessionContext = {
        mode: sessionState.mode,
        pinnedScope: selection?.anchor ? `m.${selection.anchor.measureNumber} staff ${selection.anchor.staffIndex} voice ${selection.anchor.voiceId}` : sessionState.pinnedScope,
        recentUserRequests: [...sessionState.recentUserRequests.slice(-2), msg],
        taskState: {
          ...sessionState.taskState,
          scoreKey: scoreKey ?? sessionState.taskState.scoreKey ?? null,
        },
      };
      const res = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          message: msg,
          xml: scoreSessionReady ? undefined : xml,
          scoreKey,
          scoreRevision,
          provider,
          ollamaModel,
          selection: serializedSelection,
          appLocale: locale,
          sessionContext: nextSessionContext,
        }),
      });
      const data = await res.json();
      const nextTaskState = typeof data.taskState === 'object' && data.taskState
        ? data.taskState as PersistedChatTaskState
        : nextSessionContext.taskState;
      setSessionState({
        ...nextSessionContext,
        taskState: nextTaskState,
      });
      writeChatTaskState(scoreKey ?? nextTaskState.scoreKey, nextTaskState);
      if (!res.ok) {
        setMessages((m) => [...m, { role: 'assistant', text: t('chat.error', { error: data.error }) }]);
        dbg.warn('chat', 'assistant error', data.error);
        return;
      }
      const appliedCommands = (data.commands ?? data.operations) as ScoreCommand[] | undefined;
      const hasAppliedCommands = Array.isArray(appliedCommands) && appliedCommands.length > 0;
      if (isSafeWholeScoreTransposePreview(appliedCommands, data.riskReasons)) {
        onApplyCommands(appliedCommands, msg);
        if (onOperationsApplied) onOperationsApplied(appliedCommands);
        setMessages((m) => [...m, {
          role: 'assistant',
          text: `${typeof data.workflowLabel === 'string' ? `${data.workflowLabel}: ` : ''}${data.explanation || t('chat.changesApplied')}${Array.isArray(data.affectedMeasures) && data.affectedMeasures.length ? ` (m.${data.affectedMeasures.join(', m.')})` : ''}`,
          provider: data.provider,
          model: data.model,
          latencyMs: data.latencyMs,
        }]);
        dbg.info('chat', 'assistant auto-applied safe transpose preview', {
          provider: data.provider,
          model: data.model,
          latencyMs: data.latencyMs,
          explanation: data.explanation,
          affectedMeasures: data.affectedMeasures,
        });
        return;
      }
      if (data.requiresConfirmation && hasAppliedCommands) {
        const preview: PendingConfirmation = {
          requestLabel: msg,
          commands: appliedCommands,
          explanation: data.explanation || t('chat.previewPrepared'),
          workflowLabel: typeof data.workflowLabel === 'string' ? data.workflowLabel : undefined,
          affectedMeasures: Array.isArray(data.affectedMeasures) ? data.affectedMeasures : [],
          ambiguities: Array.isArray(data.ambiguities) ? data.ambiguities : [],
          plan: Array.isArray(data.plan) ? data.plan : [],
          riskReasons: Array.isArray(data.riskReasons) ? data.riskReasons : [],
          validatorFindings: Array.isArray(data.validatorFindings) ? data.validatorFindings : [],
          provider: data.provider,
          model: data.model,
          latencyMs: data.latencyMs,
        };
        setPendingConfirmation(preview);
        setMessages((m) => [...m, {
          role: 'assistant',
          text: buildPreviewText(preview, t),
          provider: data.provider,
          model: data.model,
          latencyMs: data.latencyMs,
        }]);
        dbg.info('chat', 'assistant preview', {
          provider: data.provider,
          model: data.model,
          latencyMs: data.latencyMs,
          explanation: preview.explanation,
          affectedMeasures: preview.affectedMeasures,
        });
        return;
      }
      onXmlUpdate(data.xml, {
        label: msg,
        commands: appliedCommands,
      });
      if (hasAppliedCommands && onOperationsApplied) {
        onOperationsApplied(appliedCommands);
      }
      setMessages((m) => [...m, {
        role: 'assistant',
        text: `${typeof data.workflowLabel === 'string' ? `${data.workflowLabel}: ` : ''}${data.explanation || t('chat.changesApplied')}${Array.isArray(data.affectedMeasures) && data.affectedMeasures.length ? ` (m.${data.affectedMeasures.join(', m.')})` : ''}${Array.isArray(data.validatorFindings) && data.validatorFindings.length ? ` [validator: ${data.validatorFindings.join('; ')}]` : ''}`,
        provider: data.provider,
        model: data.model,
        latencyMs: data.latencyMs,
      }]);
      dbg.info('chat', 'assistant', {
        provider: data.provider,
        model: data.model,
        latencyMs: data.latencyMs,
        explanation: data.explanation,
        affectedMeasures: data.affectedMeasures,
        validatorFindings: data.validatorFindings,
      });
    } catch (err) {
      setMessages((m) => [...m, { role: 'assistant', text: t('chat.networkError', { error: String(err) }) }]);
      dbg.error('chat', 'network error', err);
    } finally {
      setLoading(false);
    }
  }

  async function copyTranscript() {
    const transcript = formatChatTranscript(messages);
    if (!transcript) return;
    try {
      const copied = await copyTextToClipboard(transcript);
      setCopyState(copied ? 'copied' : 'failed');
    } catch (error) {
      setCopyState('failed');
      dbg.warn('chat', 'copy transcript failed', error);
    }
  }

  return (
    <div className="flex flex-col h-full" data-chat-panel="true">
      {messages.length > 0 && (
        <div className="flex items-center justify-between gap-2 pb-2">
          <p className="text-[11px] text-slate-400">
            {t('chat.messages', { count: messages.length, plural: messages.length === 1 ? '' : 's' })}
          </p>
          <button
            type="button"
            onClick={copyTranscript}
            className="px-2 py-1 text-[11px] font-medium text-nex-accent hover:text-nex-ink border border-nex-border rounded-md disabled:opacity-40 transition-colors"
            title={t('chat.copyTranscript')}
            aria-label={t('chat.copyTranscript')}
          >
            {copyState === 'copied' ? t('chat.copied') : copyState === 'failed' ? t('chat.copyFailed') : t('chat.copyLog')}
          </button>
        </div>
      )}

      {/* Messages */}
      <div className="flex-1 overflow-y-auto space-y-4 mb-4 min-h-0 pr-1">
        {messages.length === 0 && (
          <div className="mt-10 text-center px-4">
            <p className="text-slate-400 text-sm leading-relaxed">
              {t('chat.empty', { language: t('manual.languageName') })}
            </p>
            <div className="mt-4 space-y-1.5 text-xs text-slate-300">
              <p>&ldquo;{t('chat.example.remove')}&rdquo;</p>
              <p>&ldquo;{t('chat.example.key')}&rdquo;</p>
              <p>&ldquo;{t('chat.example.chords')}&rdquo;</p>
              <p>&ldquo;Arrangiere diese Melodie f&uuml;r Klavier: C4 D4 E4 G4 | E4 D4 C4&rdquo;</p>
              <p>&ldquo;/lyrics add verse 2 to the selected phrase&rdquo;</p>
              <p>&ldquo;/layout add a system break before measure 8&rdquo;</p>
              <p>&ldquo;/layout-cleanup tidy up the score layout&rdquo;</p>
            </div>
          </div>
        )}

        {messages.map((m, i) => (
          <div key={i} className={`flex flex-col gap-0.5 ${m.role === 'user' ? 'items-end' : 'items-start'}`}>
            <div className={`max-w-[85%] px-3 py-2 rounded-xl text-sm leading-relaxed ${
              m.role === 'user'
                ? 'nex-brand-active rounded-br-sm'
                : 'bg-nex-surface text-slate-800 rounded-bl-sm border-l-2 border-nex-accent/20'
            } whitespace-pre-wrap select-text`}>
              {m.text}
            </div>
            {m.model && (
              <p className="text-[11px] text-slate-400 px-1">{m.model} · {m.latencyMs}ms</p>
            )}
          </div>
        ))}

        {loading && (
          <div className="flex items-start">
            <div className="bg-nex-surface px-3 py-2 rounded-xl rounded-bl-sm text-sm text-slate-400 animate-pulse border-l-2 border-nex-accent/20">
              {t('chat.thinking')}
            </div>
          </div>
        )}
        <div ref={bottomRef} />
      </div>

      {/* Input */}
      <div className="flex gap-2 items-end">
        <input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && !e.shiftKey && send()}
          placeholder={pendingConfirmation
            ? t('chat.applyPlaceholder')
            : (xml ? t('chat.editPlaceholder') : t('chat.melodyPlaceholder'))}
          disabled={loading || (isBenchmark && !xml)}
          className="flex-1 border border-nex-border rounded-xl px-3.5 py-2.5 text-sm text-nex-ink focus:outline-none focus:border-nex-accent focus:ring-2 focus:ring-nex-accent/20 disabled:bg-nex-surface disabled:text-slate-400 transition-colors placeholder:text-slate-300"
        />
        <button
          onClick={send}
          disabled={!input.trim() || loading || (isBenchmark && !xml)}
          className="nex-brand-active px-4 py-2.5 rounded-xl text-sm font-medium disabled:opacity-30 transition-colors shrink-0"
        >
          {isBenchmark ? t('chat.test') : t('chat.send')}
        </button>
      </div>
    </div>
  );
}
