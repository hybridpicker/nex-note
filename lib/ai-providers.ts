import Anthropic from '@anthropic-ai/sdk';
import { GoogleGenerativeAI } from '@google/generative-ai';
import type { ProviderName } from '@/lib/ai-provider-config';
import type { AiProviderRequestSettings } from '@/lib/ai-model-settings';

export type { ProviderName } from '@/lib/ai-provider-config';

export interface AIResponse {
  provider: ProviderName;
  model: string;
  text: string;
  latencyMs: number;
  error?: string;
}

function formatProviderError(providerLabel: string, err: unknown, timeoutMs?: number) {
  const message = err instanceof Error ? err.message : String(err);
  const name = err instanceof Error ? err.name : '';
  if (name === 'TimeoutError' || /timeout|aborted due to timeout/i.test(message)) {
    const seconds = timeoutMs ? Math.round(timeoutMs / 1000) : null;
    return `${providerLabel} did not respond${seconds ? ` within ${seconds}s` : ''}. Try a smaller/faster model, check the provider connection, or retry when the model is loaded.`;
  }
  return String(err);
}

function resolveOllamaConnection(settings?: AiProviderRequestSettings) {
  const apiKey = settings?.apiKeys?.ollama?.trim() || process.env.OLLAMA_API_KEY || '';
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
  const apiKey = settings?.apiKeys?.claude || process.env.ANTHROPIC_API_KEY || '';
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

export async function askGemini(prompt: string, settings?: AiProviderRequestSettings): Promise<AIResponse> {
  const start = Date.now();
  const model = settings?.models?.gemini || 'gemini-2.5-flash';
  const apiKey = settings?.apiKeys?.gemini || process.env.GEMINI_API_KEY || '';
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
    case 'claude': return askClaude(prompt, settings);
    case 'gemini': return askGemini(prompt, settings);
  }
}

export async function askAllProviders(prompt: string, ollamaModel?: string, settings?: AiProviderRequestSettings): Promise<AIResponse[]> {
  const results = await Promise.allSettled([
    askOllama(prompt, settings?.models?.ollama ?? ollamaModel ?? 'gemma4:31b', settings),
    askClaude(prompt, settings),
    askGemini(prompt, settings),
  ]);
  return results.map((r) => (r.status === 'fulfilled' ? r.value : {
    provider: 'ollama' as ProviderName,
    model: '?',
    text: '',
    latencyMs: 0,
    error: String((r as PromiseRejectedResult).reason),
  }));
}
