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
import { chatAiAccessDeniedResponse, resolveChatAiAccess } from '@/lib/public-ai-access';
import { redactSecrets } from '@/lib/redact-secrets';

function summarizeText(text: string, max = 280) {
  const compact = text.replace(/\s+/g, ' ').trim();
  if (compact.length <= max) return compact;
  return `${compact.slice(0, max - 1)}…`;
}

function requestKeys(settings: { apiKeys?: Partial<Record<ProviderName, string>> }) {
  return Object.values(settings.apiKeys ?? {});
}

// Logging rule for this route: never the API key, never the score, never the user's message
// text — only sizes, ids and outcome fields. Errors are redacted before they leave the server.
export async function POST(req: NextRequest) {
  let secrets: Array<string | undefined> = [];
  try {
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
    const access = resolveChatAiAccess(req, {
      provider,
      providerSettings: normalizeAiProviderRequestSettings(aiSettings),
    });
    if (!access.ok) return chatAiAccessDeniedResponse(access);
    const providerSettings = access.providerSettings;
    secrets = requestKeys(providerSettings);
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
      dbg.warn('chat', 'score session unavailable', { scoreRevision: scoreRevision ?? null });
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
      access: access.mode,
      ollamaModel: ollamaModel ?? null,
      selectionCount: selection?.selectionCount ?? 0,
      messageLength: message.length,
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
        error: summarizeText(redactSecrets(result.error, secrets)),
      });
      return NextResponse.json({
        error: redactSecrets(result.error, secrets),
        rawResponse: typeof result.rawResponse === 'string' ? redactSecrets(result.rawResponse, secrets) : result.rawResponse,
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
      dbg.warn('chat', 'validation error', summarizeText(redactSecrets(err.message, secrets)));
      return NextResponse.json(formatValidationError(err), { status: 400 });
    }
    // The message may quote request details (a JSON parse error echoes the body, an SDK error
    // the request); only the error type is logged and returned.
    const errorType = err instanceof Error ? err.name : typeof err;
    dbg.error('chat', 'unhandled route error', { errorType });
    return NextResponse.json({ error: `The AI request failed on the server (${errorType}).` }, { status: 500 });
  }
}
