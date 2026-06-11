import { NextRequest, NextResponse } from 'next/server';
import type { ProviderName } from '@/lib/ai-provider-config';
import { dbg } from '@/lib/debug';
import type { AiSessionContext } from '@/lib/prompts';
import type { Locale } from '@/lib/i18n';
import { normalizeAiProviderRequestSettings } from '@/lib/ai-model-settings';
import type { EditorSelection } from '@/hooks/useNoteEditor';
import { runAiCommandPipeline } from '@/src/nex-note/pipeline/run-ai-command-pipeline';
import { mergeServerChatTaskState } from '@/src/nex-note/state/chat-task-state';
import { formatValidationError } from '@/src/shared/errors/command-errors';
import { resolveChatScoreXml } from '@/src/nex-note/server/resolve-chat-score-xml';
import { isAiEnabledForRequest, publicAiDisabledResponse } from '@/lib/public-ai-access';

function summarizeText(text: string, max = 280) {
  const compact = text.replace(/\s+/g, ' ').trim();
  if (compact.length <= max) return compact;
  return `${compact.slice(0, max - 1)}…`;
}

export async function POST(req: NextRequest) {
  try {
    if (!isAiEnabledForRequest(req)) return publicAiDisabledResponse();

    const { message, xml, scoreKey, scoreRevision, provider = 'ollama', ollamaModel, selection, sessionContext, appLocale, aiSettings } = await req.json() as {
      message: string;
      xml?: string;
      scoreKey?: string;
      scoreRevision?: number;
      provider: ProviderName;
      ollamaModel?: string;
      selection?: EditorSelection;
      sessionContext?: AiSessionContext;
      appLocale?: Locale;
      aiSettings?: unknown;
    };
    const providerSettings = normalizeAiProviderRequestSettings(aiSettings);
    if (providerSettings.enabledProviders && !providerSettings.enabledProviders.includes(provider)) {
      return NextResponse.json({ error: `${provider} is disabled in AI model settings` }, { status: 400 });
    }
    const effectiveSessionContext: AiSessionContext | undefined = sessionContext || appLocale
      ? { ...sessionContext, appLocale: appLocale ?? sessionContext?.appLocale ?? null }
      : undefined;

    const effectiveXml = resolveChatScoreXml({ message, xml, scoreKey, scoreRevision });

    if (message && !effectiveXml && scoreKey && !xml?.trim()) {
      // The client relied on a previously synced score session, but the
      // in-memory cache no longer holds it (server restart, worker change,
      // or eviction). Tell the client to retry with the full score payload.
      dbg.warn('chat', 'score session unavailable', { scoreKey, scoreRevision: scoreRevision ?? null });
      return NextResponse.json({
        error: 'The synced score session is no longer available on the server. Retry the request with the full score xml.',
        code: 'score_session_unavailable',
      }, { status: 409 });
    }

    if (!message || !effectiveXml) {
      return NextResponse.json({
        error: 'message and score xml required unless the chat message contains an inline melody to seed a new score',
      }, { status: 400 });
    }

    dbg.info('chat', 'request', {
      provider,
      ollamaModel: ollamaModel ?? null,
      selectionCount: selection?.selectionCount ?? 0,
      message: summarizeText(message),
    });

    const result = await runAiCommandPipeline({
      message,
      xml: effectiveXml,
      provider,
      ollamaModel,
      providerSettings,
      selection,
      sessionContext: effectiveSessionContext,
    });

    if ('error' in result) {
      dbg.warn('chat', 'response error', {
        provider,
        ollamaModel: ollamaModel ?? null,
        status: result.status,
        error: summarizeText(result.error),
      });
      return NextResponse.json({
        error: result.error,
        rawResponse: result.rawResponse,
      }, { status: result.status });
    }

    dbg.info('chat', 'response', {
      provider: result.provider,
      model: result.model,
      latencyMs: result.latencyMs,
      workflow: result.workflow,
      requiresConfirmation: result.requiresConfirmation,
      affectedMeasures: result.affectedMeasures,
      validatorFindings: result.validatorFindings.length,
      explanation: summarizeText(result.explanation),
    });

    const taskState = mergeServerChatTaskState({
      scoreKey: effectiveSessionContext?.taskState?.scoreKey,
      incoming: effectiveSessionContext?.taskState,
      message,
      workflow: result.workflow,
      explanation: result.explanation,
    });

    return NextResponse.json({
      ...result,
      taskState,
    });
  } catch (err) {
    if (err instanceof Error && err.name === 'CommandValidationError') {
      dbg.warn('chat', 'validation error', summarizeText(err.message));
      return NextResponse.json(formatValidationError(err), { status: 400 });
    }
    dbg.error('chat', 'unhandled route error', err);
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
