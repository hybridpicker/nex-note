import { NextRequest, NextResponse } from 'next/server';
import type { ProviderName } from '@/lib/ai-provider-config';
import { askClaude, askGemini, askOllama, type AIResponse } from '@/lib/ai-providers';
import { normalizeAiProviderRequestSettings } from '@/lib/ai-model-settings';
import { INTENT_SYSTEM_PROMPT } from '@/lib/prompts';
import { applyDocumentCommands, buildDocumentState } from '@/src/score-core/commands/apply-document-commands';
import type { ScoreCommand } from '@/lib/score-commands';
import { resolveScoreRequestXml } from '@/src/nex-note/server/resolve-score-request-xml';
import { isAiEnabledForRequest, publicAiDisabledResponse } from '@/lib/public-ai-access';

function parseIntentJSON(text: string): { commands: unknown[]; explanation: string } | null {
  try {
    const match = text.match(/\{[\s\S]*\}/);
    if (!match) return null;
    const parsed = JSON.parse(match[0]);
    const commands = Array.isArray(parsed.commands)
      ? parsed.commands
      : Array.isArray(parsed.operations)
        ? parsed.operations
        : null;
    if (!commands) return null;
    return {
      commands,
      explanation: typeof parsed.explanation === 'string' ? parsed.explanation : '',
    };
  } catch {
    return null;
  }
}

export async function POST(req: NextRequest) {
  try {
    if (!isAiEnabledForRequest(req)) return publicAiDisabledResponse();

    const { message, xml, scoreKey, scoreRevision, ollamaModel, providers, aiSettings } = await req.json() as {
      message: string;
      xml?: string;
      scoreKey?: string;
      scoreRevision?: number;
      ollamaModel?: string;
      providers?: ProviderName[];
      aiSettings?: unknown;
    };
    const providerSettings = normalizeAiProviderRequestSettings(aiSettings);
    const effectiveXml = resolveScoreRequestXml({ xml, scoreKey, scoreRevision });
    if (!message || !effectiveXml) return NextResponse.json({ error: 'message and score xml required' }, { status: 400 });

    const prompt = `${INTENT_SYSTEM_PROMPT}\n\nUser instruction: ${message}`;
    const selectedProviders = (providers?.length ? providers : ['ollama', 'claude', 'gemini'])
      .filter((provider): provider is ProviderName => ['ollama', 'claude', 'gemini'].includes(provider))
      .filter((provider) => !providerSettings.enabledProviders || providerSettings.enabledProviders.includes(provider));

    const raw = await Promise.allSettled(selectedProviders.map((provider) => {
      switch (provider) {
        case 'ollama': return askOllama(prompt, providerSettings.models?.ollama ?? ollamaModel, providerSettings);
        case 'claude': return askClaude(prompt, providerSettings);
        case 'gemini': return askGemini(prompt, providerSettings);
      }
    }));

    const results: AIResponse[] = raw.map((result, index) => (
      result.status === 'fulfilled'
        ? result.value
        : {
            provider: selectedProviders[index],
            model: '?',
            text: '',
            latencyMs: 0,
            error: String(result.reason),
          }
    ));

    return NextResponse.json({
      results: results.map((r) => {
        const parsed = parseIntentJSON(r.text);
        let editedXml: string | null = null;
        if (parsed) {
          try {
            editedXml = applyDocumentCommands(buildDocumentState(effectiveXml), parsed.commands as ScoreCommand[]).xml;
          } catch {
            editedXml = null;
          }
        }
        return {
          ...r,
          commands: parsed?.commands ?? null,
          operations: parsed?.commands ?? null,
          explanation: parsed?.explanation ?? '',
          editedXml,
          xmlValid: !!editedXml,
        };
      }),
    });
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
