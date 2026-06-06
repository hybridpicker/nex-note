import Anthropic from '@anthropic-ai/sdk';
import { GoogleGenerativeAI } from '@google/generative-ai';
import { OLLAMA_MODELS, type ProviderName } from '@/lib/ai-provider-config';

export type { ProviderName } from '@/lib/ai-provider-config';

const OLLAMA_BASE = process.env.OLLAMA_API_KEY
  ? 'https://ollama.com'
  : 'http://localhost:11434';

const OLLAMA_HEADERS: Record<string, string> = process.env.OLLAMA_API_KEY
  ? { Authorization: `Bearer ${process.env.OLLAMA_API_KEY}`, 'Content-Type': 'application/json' }
  : { 'Content-Type': 'application/json' };

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

export async function askOllama(prompt: string, model: string = 'gemma4:31b'): Promise<AIResponse> {
  const start = Date.now();
  const isCloud = !!process.env.OLLAMA_API_KEY;
  const timeoutMs = 120000;
  try {
    if (isCloud) {
      // Cloud uses /api/chat with messages format
      const res = await fetch(`${OLLAMA_BASE}/api/chat`, {
        method: 'POST',
        headers: OLLAMA_HEADERS,
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
      const res = await fetch(`${OLLAMA_BASE}/api/generate`, {
        method: 'POST',
        headers: OLLAMA_HEADERS,
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

export async function askClaude(prompt: string): Promise<AIResponse> {
  const start = Date.now();
  const model = process.env.CLAUDE_MODEL || 'claude-sonnet-4-6';
  if (!process.env.ANTHROPIC_API_KEY) {
    return { provider: 'claude', model, text: '', latencyMs: 0, error: 'ANTHROPIC_API_KEY not set' };
  }
  try {
    const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
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

export async function askGemini(prompt: string): Promise<AIResponse> {
  const start = Date.now();
  const model = 'gemini-2.5-flash';
  if (!process.env.GEMINI_API_KEY) {
    return { provider: 'gemini', model, text: '', latencyMs: 0, error: 'GEMINI_API_KEY not set' };
  }
  try {
    const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
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
  ollamaModel?: string
): Promise<AIResponse> {
  switch (provider) {
    case 'ollama': return askOllama(prompt, ollamaModel ?? 'gemma4:31b');
    case 'claude': return askClaude(prompt);
    case 'gemini': return askGemini(prompt);
  }
}

export async function askAllProviders(prompt: string, ollamaModel?: string): Promise<AIResponse[]> {
  const results = await Promise.allSettled([
    askOllama(prompt, ollamaModel ?? 'gemma4:31b'),
    askClaude(prompt),
    askGemini(prompt),
  ]);
  return results.map((r) => (r.status === 'fulfilled' ? r.value : {
    provider: 'ollama' as ProviderName,
    model: '?',
    text: '',
    latencyMs: 0,
    error: String((r as PromiseRejectedResult).reason),
  }));
}
