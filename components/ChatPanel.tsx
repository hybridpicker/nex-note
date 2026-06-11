'use client';

import { useState, useRef, useEffect } from 'react';
import type { ProviderName } from '@/lib/ai-provider-config';
import type { AiProviderRequestSettings } from '@/lib/ai-model-settings';
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

// Recent conversation turns sent to the model so follow-up requests
// ("make it minor", "same for the bass") can be resolved server-side.
const CHAT_HISTORY_TURNS = 8;
const CHAT_HISTORY_TEXT_LIMIT = 400;

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

interface ApplyCommandsResult {
  applied: boolean;
  reason?: string;
  commandCount?: number;
  appliedCommandCount?: number;
  commandTypes?: string[];
  diagnosticCount?: number;
}

interface Props {
  xml: string;
  provider: ProviderName;
  ollamaModel: string;
  aiSettings?: AiProviderRequestSettings;
  scoreKey?: string;
  scoreRevision?: number;
  scoreSessionReady?: boolean;
  selection?: EditorSelection;
  onXmlUpdate: (xml: string, meta?: { label?: string; commands?: ScoreCommand[] }) => void;
  onApplyCommands: (commands: ScoreCommand[], label?: string) => void | ApplyCommandsResult;
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
  const commandSummary = summarizeCommandTypes(preview.commands);
  const lines = [
    preview.workflowLabel ? `${preview.workflowLabel}.` : '',
    `${preview.explanation || t('chat.previewWaiting')}`,
    `Prepared ${preview.commands.length} score operation${preview.commands.length === 1 ? '' : 's'}${commandSummary ? `: ${commandSummary}` : ''}.`,
    'No score changes have been applied yet.',
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

function summarizeCommandTypes(commands: ScoreCommand[] | undefined) {
  if (!Array.isArray(commands) || commands.length === 0) return '';
  const counts = new Map<string, number>();
  commands.forEach((command) => counts.set(command.type, (counts.get(command.type) ?? 0) + 1));
  return [...counts.entries()]
    .map(([type, count]) => (count === 1 ? type : `${type} x${count}`))
    .join(', ');
}

function buildApplyFailureText(preview: PendingConfirmation, result: ApplyCommandsResult | void, t: ReturnType<typeof useI18n>['t']) {
  const reason = result && 'reason' in result && result.reason ? result.reason : 'unknown';
  const commandSummary = summarizeCommandTypes(preview.commands);
  const appliedCount = result && 'appliedCommandCount' in result && typeof result.appliedCommandCount === 'number'
    ? ` Applied commands before rejection: ${result.appliedCommandCount}.`
    : '';
  const diagnosticCount = result && 'diagnosticCount' in result && typeof result.diagnosticCount === 'number'
    ? ` Blocking diagnostics: ${result.diagnosticCount}.`
    : '';
  return [
    `${preview.workflowLabel ? `${preview.workflowLabel}: ` : ''}I could not apply that preview because the score did not change (${reason}).`,
    commandSummary ? `Command batch: ${commandSummary}.` : '',
    appliedCount.trim(),
    diagnosticCount.trim(),
    t('chat.previewOnly'),
  ].filter(Boolean).join('\n');
}

function formatCommandDebug(commands: ScoreCommand[], maxCommands = 8) {
  const visible = commands.slice(0, maxCommands).map((command, index) => {
    try {
      return `  ${index + 1}. ${JSON.stringify(command)}`;
    } catch {
      return `  ${index + 1}. ${command.type}`;
    }
  });
  const hidden = commands.length - visible.length;
  return `${visible.join('\n')}${hidden > 0 ? `\n  ... ${hidden} more command${hidden === 1 ? '' : 's'}` : ''}`;
}

function formatPendingPreviewTranscript(preview: PendingConfirmation | null) {
  if (!preview) return '';
  return [
    '[pending-preview]',
    'status: NOT APPLIED',
    `request: ${preview.requestLabel}`,
    preview.workflowLabel ? `workflow: ${preview.workflowLabel}` : '',
    `commands: ${preview.commands.length}${summarizeCommandTypes(preview.commands) ? ` (${summarizeCommandTypes(preview.commands)})` : ''}`,
    preview.affectedMeasures.length ? `affectedMeasures: ${preview.affectedMeasures.join(', ')}` : 'affectedMeasures: none',
    preview.riskReasons.length ? `confirmationReasons: ${preview.riskReasons.join('; ')}` : '',
    preview.plan.length ? `plan: ${preview.plan.join(' -> ')}` : '',
    'commandPayload:',
    formatCommandDebug(preview.commands),
    'nextAction: click Apply or type "apply" to change the score; click Cancel or type "cancel" to discard.',
  ].filter(Boolean).join('\n');
}

function formatChatTranscript(messages: Message[], pendingPreview: PendingConfirmation | null = null) {
  const transcript = messages.map((message) => {
    const meta = message.model ? ` (${message.model}${typeof message.latencyMs === 'number' ? ` · ${message.latencyMs}ms` : ''})` : '';
    return `[${message.role}${meta}]\n${message.text}`;
  }).join('\n\n');
  const pending = formatPendingPreviewTranscript(pendingPreview);
  return [transcript, pending].filter(Boolean).join('\n\n');
}

function buildTranscriptMessages(messages: Message[], pendingPreview: PendingConfirmation | null) {
  if (!pendingPreview) return messages;
  const pendingText = formatPendingPreviewTranscript(pendingPreview);
  if (!pendingText) return messages;
  return [...messages, {
    role: 'assistant' as const,
    text: pendingText,
    provider: pendingPreview.provider,
    model: pendingPreview.model,
    latencyMs: pendingPreview.latencyMs,
  }];
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

export default function ChatPanel({ xml, provider, ollamaModel, aiSettings, scoreKey, scoreRevision, scoreSessionReady = false, selection, onXmlUpdate, onApplyCommands, onUndo, onRedo, onBenchmark, isBenchmark, onOperationsApplied, onTranscriptChange }: Props) {
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

  function applyPendingPreview(preview: PendingConfirmation) {
    const result = onApplyCommands(preview.commands, preview.requestLabel);
    const commandSummary = summarizeCommandTypes(preview.commands);
    dbg.info('chat', 'assistant preview apply requested', {
      provider: preview.provider,
      model: preview.model,
      requestLabel: preview.requestLabel,
      commandCount: preview.commands.length,
      commandTypes: preview.commands.map((command) => command.type),
      result,
    });
    if (result && result.applied === false) {
      setMessages((m) => [...m, {
        role: 'assistant',
        text: buildApplyFailureText(preview, result, t),
        provider: preview.provider,
        model: preview.model,
        latencyMs: preview.latencyMs,
      }]);
      return false;
    }
    if (preview.commands.length && onOperationsApplied) {
      onOperationsApplied(preview.commands);
    }
    setMessages((m) => [...m, {
      role: 'assistant',
      text: `${preview.workflowLabel ? `${preview.workflowLabel}: ` : ''}${preview.explanation || t('chat.previewApplied')}${preview.affectedMeasures.length ? ` (m.${preview.affectedMeasures.join(', m.')})` : ''}${commandSummary ? `\nApplied operations: ${commandSummary}.` : ''}`,
      provider: preview.provider,
      model: preview.model,
      latencyMs: preview.latencyMs,
    }]);
    setPendingConfirmation(null);
    return true;
  }

  function cancelPendingPreview() {
    setPendingConfirmation(null);
    setMessages((m) => [...m, { role: 'assistant', text: t('chat.previewDiscarded') }]);
  }

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  useEffect(() => {
    onTranscriptChange?.(buildTranscriptMessages(messages, pendingConfirmation));
  }, [messages, pendingConfirmation, onTranscriptChange]);

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
      applyPendingPreview(pendingConfirmation);
      return;
    }
    if (pendingConfirmation && confirmationAction === 'cancel') {
      cancelPendingPreview();
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
      const chatHistory = [...messages, { role: 'user' as const, text: msg }]
        .slice(-CHAT_HISTORY_TURNS)
        .map((entry) => ({
          role: entry.role,
          text: entry.text.length > CHAT_HISTORY_TEXT_LIMIT
            ? `${entry.text.slice(0, CHAT_HISTORY_TEXT_LIMIT - 3)}...`
            : entry.text,
        }));
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
          aiSettings,
          selection: serializedSelection,
          appLocale: locale,
          sessionContext: { ...nextSessionContext, chatHistory },
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
        const applyResult = onApplyCommands(appliedCommands, msg);
        if (applyResult && applyResult.applied === false) {
          const failedPreview: PendingConfirmation = {
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
          setMessages((m) => [...m, {
            role: 'assistant',
            text: buildApplyFailureText(failedPreview, applyResult, t),
            provider: data.provider,
            model: data.model,
            latencyMs: data.latencyMs,
          }]);
          return;
        }
        if (onOperationsApplied) onOperationsApplied(appliedCommands);
        setMessages((m) => [...m, {
          role: 'assistant',
          text: `${typeof data.workflowLabel === 'string' ? `${data.workflowLabel}: ` : ''}${data.explanation || t('chat.changesApplied')}${Array.isArray(data.affectedMeasures) && data.affectedMeasures.length ? ` (m.${data.affectedMeasures.join(', m.')})` : ''}${summarizeCommandTypes(appliedCommands) ? `\nApplied operations: ${summarizeCommandTypes(appliedCommands)}.` : ''}`,
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
          commandCount: preview.commands.length,
          commandTypes: preview.commands.map((command) => command.type),
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
    const transcript = formatChatTranscript(messages, pendingConfirmation);
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
        <textarea
          id="nex-note-ai-message"
          name="nex-note-ai-message"
          aria-label="AI assistant message"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
              e.preventDefault();
              void send();
            }
          }}
          placeholder={pendingConfirmation
            ? t('chat.applyPlaceholder')
            : (xml ? t('chat.editPlaceholder') : t('chat.melodyPlaceholder'))}
          disabled={loading || (isBenchmark && !xml)}
          rows={2}
          spellCheck
          autoCapitalize="sentences"
          autoCorrect="on"
          className="min-h-[44px] max-h-32 flex-1 resize-y border border-nex-border rounded-xl px-3.5 py-2.5 text-sm leading-relaxed text-nex-ink focus:outline-none focus:border-nex-accent focus:ring-2 focus:ring-nex-accent/20 disabled:bg-nex-surface disabled:text-slate-400 transition-colors placeholder:text-slate-300"
        />
        <button
          type="button"
          onClick={copyTranscript}
          disabled={loading || (!messages.length && !pendingConfirmation)}
          className="px-3 py-2.5 rounded-xl text-sm font-medium border border-nex-border text-slate-500 hover:bg-nex-surface disabled:opacity-30 transition-colors shrink-0"
          title={t('chat.copyTranscript')}
          aria-label={t('chat.copyTranscript')}
        >
          {copyState === 'copied' ? t('chat.copied') : copyState === 'failed' ? t('chat.copyFailed') : t('chat.copyLog')}
        </button>
        <button
          onClick={send}
          disabled={!input.trim() || loading || (isBenchmark && !xml)}
          className="nex-brand-active px-4 py-2.5 rounded-xl text-sm font-medium disabled:opacity-30 transition-colors shrink-0"
        >
          {isBenchmark ? t('chat.test') : t('chat.send')}
        </button>
        {pendingConfirmation && (
          <>
            <button
              type="button"
              onClick={() => applyPendingPreview(pendingConfirmation)}
              disabled={loading}
              className="px-3 py-2.5 rounded-xl text-sm font-medium border border-nex-accent text-nex-accent hover:bg-nex-accent/10 disabled:opacity-30 transition-colors shrink-0"
            >
              Apply
            </button>
            <button
              type="button"
              onClick={cancelPendingPreview}
              disabled={loading}
              className="px-3 py-2.5 rounded-xl text-sm font-medium border border-nex-border text-slate-500 hover:bg-nex-surface disabled:opacity-30 transition-colors shrink-0"
            >
              Cancel
            </button>
          </>
        )}
      </div>
    </div>
  );
}
