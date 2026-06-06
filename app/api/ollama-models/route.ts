import { NextResponse } from 'next/server';

const OLLAMA_BASE = process.env.OLLAMA_API_KEY
  ? 'https://ollama.com'
  : 'http://localhost:11434';

const OLLAMA_HEADERS: Record<string, string> = process.env.OLLAMA_API_KEY
  ? { Authorization: `Bearer ${process.env.OLLAMA_API_KEY}` }
  : {};

const isCloud = !!process.env.OLLAMA_API_KEY;
const LOCAL_OLLAMA_BASE = 'http://localhost:11434';

// Curated list for Ollama Cloud — update as new models release
const CLOUD_MODELS = [
  { id: 'gemma4:31b',                 label: 'Gemma 4 31B' },
  { id: 'gemma4:31b-cloud',           label: 'Gemma 4 31B Cloud' },
  { id: 'gemma4:26b',                 label: 'Gemma 4 26B' },
  { id: 'qwen3.5:cloud',              label: 'Qwen 3.5 Cloud' },
  { id: 'qwen3.5:397b-cloud',         label: 'Qwen 3.5 397B Cloud' },
  { id: 'qwen3-coder:480b',           label: 'Qwen3 Coder 480B' },
  { id: 'qwen3-coder:480b-cloud',     label: 'Qwen3 Coder 480B Cloud' },
  { id: 'gpt-oss:120b-cloud',         label: 'GPT-OSS 120B Cloud' },
  { id: 'gpt-oss:20b-cloud',          label: 'GPT-OSS 20B Cloud' },
  { id: 'nemotron-3-super',           label: 'Nemotron 3 Super' },
  { id: 'nemotron-3-super:cloud',     label: 'Nemotron 3 Super Cloud' },
  { id: 'ministral-3:14b',            label: 'Ministral 3 14B' },
  { id: 'ministral-3:14b-cloud',      label: 'Ministral 3 14B Cloud' },
  { id: 'mistral-large-3:675b-cloud', label: 'Mistral Large 3 675B Cloud' },
  { id: 'glm-4.6',                    label: 'GLM 4.6' },
  { id: 'glm-4.6:cloud',              label: 'GLM 4.6 Cloud' },
  { id: 'glm-5.1',                    label: 'GLM 5.1' },
  { id: 'deepseek-v3.2',              label: 'DeepSeek V3.2' },
  { id: 'deepseek-v3.1:671b-cloud',   label: 'DeepSeek V3.1 671B Cloud' },
  { id: 'deepseek-v4-flash',          label: 'DeepSeek V4 Flash' },
  { id: 'deepseek-v4-pro:cloud',      label: 'DeepSeek V4 Pro Cloud' },
  { id: 'kimi-k2.6',                  label: 'Kimi K2.6' },
  { id: 'kimi-k2-thinking',           label: 'Kimi K2 Thinking' },
  { id: 'minimax-m2.7',               label: 'MiniMax M2.7' },
];

function mergeModels(...groups: Array<Array<{ id: string; label: string }>>) {
  const seen = new Set<string>();
  return groups.flat().filter((model) => {
    if (seen.has(model.id)) return false;
    seen.add(model.id);
    return true;
  });
}

export async function GET() {
  let localModels: Array<{ id: string; label: string }> = [];

  // Prefer the concrete models exposed by the local Ollama daemon. This also
  // captures cloud-backed tags such as "deepseek-v4-flash:cloud".
  try {
    const res = await fetch(`${LOCAL_OLLAMA_BASE}/api/tags`, {
      signal: AbortSignal.timeout(3000),
    });
    if (res.ok) {
      const data = await res.json() as { models: { name: string }[] };
      localModels = (data.models ?? []).map(m => ({ id: m.name, label: m.name }));
    }
  } catch {
    // Fall through to cloud/fallback list.
  }

  if (isCloud) {
    return NextResponse.json({
      models: mergeModels(localModels, CLOUD_MODELS),
      source: localModels.length > 0 ? 'live+cloud' : 'cloud',
    });
  }

  if (localModels.length > 0) return NextResponse.json({ models: localModels, source: 'live' });

  try {
    const res = await fetch(`${OLLAMA_BASE}/api/tags`, {
      signal: AbortSignal.timeout(3000),
    });
    if (!res.ok) return NextResponse.json({ models: CLOUD_MODELS, source: 'fallback' });

    const data = await res.json() as { models: { name: string }[] };
    const models = (data.models ?? []).map(m => ({ id: m.name, label: m.name }));

    if (models.length === 0) return NextResponse.json({ models: CLOUD_MODELS, source: 'fallback' });
    return NextResponse.json({ models, source: 'live' });
  } catch {
    return NextResponse.json({ models: CLOUD_MODELS, source: 'fallback' });
  }
}
