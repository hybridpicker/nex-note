import { NextRequest, NextResponse } from 'next/server';
import { OLLAMA_MODELS } from '@/lib/ai-provider-config';
import { askOllama } from '@/lib/ai-providers';
import { normalizeAiProviderRequestSettings } from '@/lib/ai-model-settings';
import { resolveScoreRequestXml } from '@/src/nex-note/server/resolve-score-request-xml';
import { runAiCommandPipeline } from '@/src/nex-note/pipeline/run-ai-command-pipeline';
import type { TestCase } from '@/lib/benchmark-suite';
import { commandTypes, scoreBenchmarkResult } from '@/lib/benchmark-scoring';
import { isAiEnabledForRequest, publicAiDisabledResponse } from '@/lib/public-ai-access';

type BenchmarkModel = { id: string; label?: string };

export async function POST(req: NextRequest) {
  try {
    if (!isAiEnabledForRequest(req)) return publicAiDisabledResponse();

    const { message, xml, scoreKey, scoreRevision, models, testCase, aiSettings } = await req.json() as {
      message: string;
      xml?: string;
      scoreKey?: string;
      scoreRevision?: number;
      models?: BenchmarkModel[];
      testCase?: TestCase;
      aiSettings?: unknown;
    };
    const providerSettings = normalizeAiProviderRequestSettings(aiSettings);
    if (providerSettings.enabledProviders && !providerSettings.enabledProviders.includes('ollama')) {
      return NextResponse.json({ results: [] });
    }
    const effectiveXml = resolveScoreRequestXml({ xml, scoreKey, scoreRevision });
    if (!message || !effectiveXml) return NextResponse.json({ error: 'message and score xml required' }, { status: 400 });

    const modelList = (models?.length ? models : OLLAMA_MODELS)
      .filter((model) => model.id)
      .slice(0, 12);

    const raw = await Promise.allSettled(
      modelList.map((model) => runAiCommandPipeline({
        message,
        xml: effectiveXml,
        provider: 'ollama',
        ollamaModel: model.id,
        providerSettings,
        ask: (_prompt, _provider, selectedOllamaModel) => askOllama(_prompt, selectedOllamaModel, providerSettings),
      }))
    );

    const results = raw.map((entry, i) => {
      const model = modelList[i];
      if (entry.status === 'rejected') {
        return {
          provider: 'ollama',
          model: model.id,
          modelLabel: model.label ?? model.id,
          text: '',
          latencyMs: 0,
          error: String(entry.reason),
          commands: null,
          operations: null,
          explanation: '',
          editedXml: null,
          xmlValid: false,
          workflow: null,
          score: 0,
          passed: false,
          reasons: [String(entry.reason)],
        };
      }

      const result = entry.value;
      const scored = scoreBenchmarkResult(testCase, result);
      if ('error' in result) {
        return {
          provider: 'ollama',
          model: model.id,
          modelLabel: model.label ?? model.id,
          text: '',
          latencyMs: 0,
          error: result.error,
          commands: null,
          operations: null,
          explanation: '',
          editedXml: null,
          xmlValid: false,
          workflow: null,
          ...scored,
        };
      }

      return {
        provider: result.provider,
        model: result.model,
        modelLabel: model.label ?? model.id,
        text: result.explanation,
        latencyMs: result.latencyMs,
        commands: result.commands,
        operations: result.commands,
        explanation: result.explanation,
        editedXml: result.requiresConfirmation ? null : result.xml,
        xmlValid: scored.passed,
        workflow: result.workflow,
        workflowLabel: result.workflowLabel,
        requiresConfirmation: result.requiresConfirmation,
        validatorFindings: result.validatorFindings,
        commandTypes: commandTypes(result.commands),
        ...scored,
      };
    });

    return NextResponse.json({ results });
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
