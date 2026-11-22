import Anthropic from '@anthropic-ai/sdk';
import { GoogleGenerativeAI } from '@google/generative-ai';
import OpenAI from 'openai';
import type { ProviderName } from '@/lib/ai-provider-config';
import type { AiProviderRequestSettings } from '@/lib/ai-model-settings';
import { redactSecrets } from '@/lib/redact-secrets';

export type { ProviderName } from '@/lib/ai-provider-config';

export interface AIResponse {
  provider: ProviderName;
  model: string;
  text: string;
  latencyMs: number;
  error?: string;
}

/**
 * A key from the server environment, unless the public AI gate forbade it for this request
 * (`serverKeyFallback: false`): Browser Preview requests only ever use their Session Key.
 */
function serverEnvKey(settings: AiProviderRequestSettings | undefined, name: string) {
  if (settings?.serverKeyFallback === false) return '';
  return process.env[name]?.trim() || '';
}

function formatProviderError(providerLabel: string, err: unknown, timeoutMs?: number) {
  const message = err instanceof Error ? err.message : String(err);
  const name = err instanceof Error ? err.name : '';
  if (name === 'TimeoutError' || /timeout|aborted due to timeout/i.test(message)) {
    const seconds = timeoutMs ? Math.round(timeoutMs / 1000) : null;
    return `${providerLabel} did not respond${seconds ? ` within ${seconds}s` : ''}. Try a smaller/faster model, check the provider connection, or retry when the model is loaded.`;
  }
  // SDK errors can echo request details; never let a key reach a log or a response.
  return redactSecrets(String(err)).slice(0, 1000);
}

function formatOpenAiError(err: unknown, timeoutMs: number) {
  const status = typeof err === 'object' && err !== null && 'status' in err
    ? Number((err as { status?: unknown }).status)
    : null;
  const name = err instanceof Error ? err.name : '';
  const message = err instanceof Error ? err.message : String(err);
  if (name === 'AbortError' || name === 'APIConnectionTimeoutError' || /timeout|timed out|aborted/i.test(message)) {
    return `OpenAI did not respond within ${Math.round(timeoutMs / 1000)}s. Retry or choose a faster model.`;
  }
  if (status === 401 || status === 403) return 'OpenAI authentication failed. Check the API key and project access.';
  if (status === 429) return 'OpenAI rate limit reached. Wait briefly and retry, or check project usage limits.';
  if (status === 404 || /model.*(not found|does not exist|unavailable)/i.test(message)) {
    return 'The selected OpenAI model is unavailable to this project. Check the model ID or choose another model.';
  }
  return 'OpenAI could not complete the request. Check the model, project access, and provider status, then retry.';
}

const OPENAI_INTENT_SCHEMA = {
  type: 'object',
  properties: {
    commands: {
      type: 'array',
      items: { type: 'object', additionalProperties: true },
    },
    explanation: { type: 'string' },
    confidence: { type: 'string', enum: ['high', 'medium', 'low'] },
    ambiguities: { type: 'array', items: { type: 'string' } },
    plan: { type: 'array', items: { type: 'string' } },
  },
  required: ['commands', 'explanation', 'confidence', 'ambiguities', 'plan'],
  additionalProperties: true,
} as const;

function resolveOllamaConnection(settings?: AiProviderRequestSettings) {
  const apiKey = settings?.apiKeys?.ollama?.trim() || serverEnvKey(settings, 'OLLAMA_API_KEY');
  const baseUrl = settings?.ollamaBaseUrl?.trim()
    || (apiKey ? 'https://ollama.com' : 'http://localhost:11434');
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (apiKey) headers.Authorization = `Bearer ${apiKey}`;
  return {
    baseUrl: baseUrl.replace(/\/+$/, ''),
    apiKey,
    isCloud: Boolean(apiKey) && !settings?.ollamaBaseUrl,
    headers,
  };
}

export async function askOllama(
  prompt: string,
  model: string = 'gemma4:31b',
  settings?: AiProviderRequestSettings,
): Promise<AIResponse> {
  const start = Date.now();
  const connection = resolveOllamaConnection(settings);
  const timeoutMs = 120000;
  try {
    if (connection.isCloud) {
      // Cloud uses /api/chat with messages format
      const res = await fetch(`${connection.baseUrl}/api/chat`, {
        method: 'POST',
        headers: connection.headers,
        body: JSON.stringify({
          model,
          messages: [{ role: 'user', content: prompt }],
          stream: false,
          options: { temperature: 0.1 },
        }),
        signal: AbortSignal.timeout(timeoutMs),
      });
      if (!res.ok) throw new Error(`Ollama HTTP ${res.status}`);
      const data = await res.json();
      const text = data.message?.content ?? data.choices?.[0]?.message?.content ?? '';
      return { provider: 'ollama', model, text, latencyMs: Date.now() - start };
    } else {
      // Local uses /api/generate
      const res = await fetch(`${connection.baseUrl}/api/generate`, {
        method: 'POST',
        headers: connection.headers,
        body: JSON.stringify({
          model,
          prompt,
          stream: false,
          options: { temperature: 0.1, num_predict: 8192 },
        }),
        signal: AbortSignal.timeout(timeoutMs),
      });
      if (!res.ok) throw new Error(`Ollama HTTP ${res.status}`);
      const data = await res.json();
      return { provider: 'ollama', model, text: data.response ?? '', latencyMs: Date.now() - start };
    }
  } catch (err) {
    return { provider: 'ollama', model, text: '', latencyMs: Date.now() - start, error: formatProviderError('Ollama', err, timeoutMs) };
  }
}

export async function askClaude(prompt: string, settings?: AiProviderRequestSettings): Promise<AIResponse> {
  const start = Date.now();
  const model = settings?.models?.claude || process.env.CLAUDE_MODEL || 'claude-sonnet-4-6';
  const apiKey = settings?.apiKeys?.claude?.trim() || serverEnvKey(settings, 'ANTHROPIC_API_KEY');
  if (!apiKey) {
    return { provider: 'claude', model, text: '', latencyMs: 0, error: 'ANTHROPIC_API_KEY not set' };
  }
  try {
    const client = new Anthropic({ apiKey });
    const msg = await client.messages.create({
      model,
      max_tokens: 8192,
      messages: [{ role: 'user', content: prompt }],
    });
    const text = msg.content[0].type === 'text' ? msg.content[0].text : '';
    return { provider: 'claude', model, text, latencyMs: Date.now() - start };
  } catch (err) {
    return { provider: 'claude', model, text: '', latencyMs: Date.now() - start, error: formatProviderError('Claude', err) };
  }
}

export async function askOpenAI(prompt: string, settings?: AiProviderRequestSettings): Promise<AIResponse> {
  const start = Date.now();
  const model = process.env.OPENAI_MODEL?.trim() || settings?.models?.openai?.trim() || 'gpt-5.6-sol';
  const apiKey = settings?.apiKeys?.openai?.trim() || serverEnvKey(settings, 'OPENAI_API_KEY');
  const timeoutMs = 120000;
  if (!apiKey) {
    return {
      provider: 'openai',
      model,
      text: '',
      latencyMs: 0,
      error: 'OPENAI_API_KEY not set. Add it in AI settings or the server environment.',
    };
  }
  try {
    const client = new OpenAI({ apiKey, timeout: timeoutMs });
    const response = await client.responses.create({
      model,
      input: prompt,
      store: false,
      text: {
        format: {
          type: 'json_schema',
          name: 'nex_note_score_intent',
          strict: false,
          schema: OPENAI_INTENT_SCHEMA,
        },
      },
    });
    const actualModel = typeof response.model === 'string' && response.model ? response.model : model;
    return {
      provider: 'openai',
      model: actualModel,
      text: response.output_text ?? '',
      latencyMs: Date.now() - start,
    };
  } catch (err) {
    return {
      provider: 'openai',
      model,
      text: '',
      latencyMs: Date.now() - start,
      error: formatOpenAiError(err, timeoutMs),
    };
  }
}

export async function askGemini(prompt: string, settings?: AiProviderRequestSettings): Promise<AIResponse> {
  const start = Date.now();
  const model = settings?.models?.gemini || 'gemini-2.5-flash';
  const apiKey = settings?.apiKeys?.gemini?.trim() || serverEnvKey(settings, 'GEMINI_API_KEY');
  if (!apiKey) {
    return { provider: 'gemini', model, text: '', latencyMs: 0, error: 'GEMINI_API_KEY not set' };
  }
  try {
    const genAI = new GoogleGenerativeAI(apiKey);
    const genModel = genAI.getGenerativeModel({ model });
    const result = await genModel.generateContent(prompt);
    const text = result.response.text();
    return { provider: 'gemini', model, text, latencyMs: Date.now() - start };
  } catch (err) {
    return { provider: 'gemini', model, text: '', latencyMs: Date.now() - start, error: formatProviderError('Gemini', err) };
  }
}

export async function askProvider(
  prompt: string,
  provider: ProviderName,
  ollamaModel?: string,
  settings?: AiProviderRequestSettings,
): Promise<AIResponse> {
  switch (provider) {
    case 'ollama': return askOllama(prompt, settings?.models?.ollama ?? ollamaModel ?? 'gemma4:31b', settings);
    case 'openai': return askOpenAI(prompt, settings);
    case 'claude': return askClaude(prompt, settings);
    case 'gemini': return askGemini(prompt, settings);
  }
  throw new Error(`Unsupported AI provider: ${String(provider)}`);
}

export async function askAllProviders(prompt: string, ollamaModel?: string, settings?: AiProviderRequestSettings): Promise<AIResponse[]> {
  const providers: ProviderName[] = ['ollama', 'openai', 'claude', 'gemini'];
  const results = await Promise.allSettled([
    askOllama(prompt, settings?.models?.ollama ?? ollamaModel ?? 'gemma4:31b', settings),
    askOpenAI(prompt, settings),
    askClaude(prompt, settings),
    askGemini(prompt, settings),
  ]);
  return results.map((r, index) => (r.status === 'fulfilled' ? r.value : {
    provider: providers[index],
    model: '?',
    text: '',
    latencyMs: 0,
    error: String((r as PromiseRejectedResult).reason),
  }));
}
