export interface ParsedIntentJson {
  commands?: unknown[];
  operations?: unknown[];
  explanation: string;
  confidence?: 'high' | 'medium' | 'low';
  ambiguities?: string[];
  plan?: string[];
  planner?: {
    stage?: 'two-step-arrangement';
    stylePack?: string;
    harmonicCandidateId?: string;
    voicingCandidateId?: string;
    retriesUsed?: number;
    unresolvedIssueCodes?: string[];
  };
}

export function parseIntentJSON(text: string): ParsedIntentJson | null {
  const candidates: string[] = [];
  const fenced = text.matchAll(/```(?:json)?\s*([\s\S]*?)```/gi);
  for (const match of fenced) {
    const candidate = match[1]?.trim();
    if (candidate?.startsWith('{')) candidates.push(candidate);
  }

  const start = text.indexOf('{');
  if (start >= 0) {
    let depth = 0;
    let inString = false;
    let escaped = false;
    for (let index = start; index < text.length; index += 1) {
      const char = text[index];
      if (escaped) {
        escaped = false;
        continue;
      }
      if (char === '\\') {
        escaped = inString;
        continue;
      }
      if (char === '"') {
        inString = !inString;
        continue;
      }
      if (inString) continue;
      if (char === '{') depth += 1;
      if (char === '}') {
        depth -= 1;
        if (depth === 0) {
          candidates.push(text.slice(start, index + 1));
          break;
        }
      }
    }
  }

  for (const candidate of candidates) {
    try {
      const parsed = JSON.parse(candidate);
      if (!Array.isArray(parsed.commands) && !Array.isArray(parsed.operations)) continue;
      return parsed;
    } catch {
      // Try the next candidate.
    }
  }

  return null;
}
