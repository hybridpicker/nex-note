import { NextRequest, NextResponse } from 'next/server';
import type { ProviderName } from '@/lib/ai-provider-config';
import { dbg } from '@/lib/debug';
import type { AiSessionContext } from '@/lib/prompts';
import type { Locale } from '@/lib/i18n';
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

    const { message, xml, scoreKey, scoreRevision, provider = 'ollama', ollamaModel, selection, sessionContext, appLocale } = await req.json() as {
      message: string;
      xml?: string;
      scoreKey?: string;
      scoreRevision?: number;
      provider: ProviderName;
      ollamaModel?: string;
      selection?: EditorSelection;
      sessionContext?: AiSessionContext;
      appLocale?: Locale;
    };
    const effectiveSessionContext: AiSessionContext | undefined = sessionContext || appLocale
      ? { ...sessionContext, appLocale: appLocale ?? sessionContext?.appLocale ?? null }
      : undefined;

    const effectiveXml = resolveChatScoreXml({ message, xml, scoreKey, scoreRevision });

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
