const TRUTHY_DEBUG_VALUES = new Set(['1', 'true', 'yes', 'on', 'live', 'strict']);
const FALSY_DEBUG_VALUES = new Set(['0', 'false', 'no', 'off']);

const DEBUG_QUERY_KEYS = ['debug', 'nexDebug'];
const VISUAL_DEBUG_QUERY_KEYS = ['visual-debug', 'visualDebug', 'debugMatrix'];

export function isTruthyDebugValue(value: string | null | undefined) {
  return typeof value === 'string' && TRUTHY_DEBUG_VALUES.has(value);
}

export function isFalsyDebugValue(value: string | null | undefined) {
  return typeof value === 'string' && FALSY_DEBUG_VALUES.has(value);
}

export function readBooleanDebugValue(value: string | null | undefined): boolean | null {
  if (isTruthyDebugValue(value)) return true;
  if (isFalsyDebugValue(value)) return false;
  return null;
}

export function readDebugParam(params: URLSearchParams): boolean | null {
  for (const key of DEBUG_QUERY_KEYS) {
    const value = readBooleanDebugValue(params.get(key));
    if (value !== null) return value;
  }
  return null;
}

export function readVisualDebugParam(params: URLSearchParams): boolean | null {
  for (const key of VISUAL_DEBUG_QUERY_KEYS) {
    const value = readBooleanDebugValue(params.get(key));
    if (value !== null) return value;
  }
  return null;
}

export function readVisualDebugFromParams(params: URLSearchParams): boolean | null {
  return readVisualDebugParam(params) ?? readDebugParam(params);
}

export function readClientDebugOverride() {
  if (typeof window === 'undefined') return null;
  try {
    const params = new URLSearchParams(window.location.search);
    const urlValue = readDebugParam(params);
    if (urlValue !== null) return urlValue ? 'true' : 'false';
    return localStorage.getItem('nex-note:debug');
  } catch {
    return null;
  }
}

export function readClientVisualDebugEnabled() {
  if (typeof window === 'undefined') return false;
  try {
    const params = new URLSearchParams(window.location.search);
    const urlValue = readVisualDebugFromParams(params);
    if (urlValue !== null) return urlValue;
  } catch {
    return false;
  }

  return false;
}
