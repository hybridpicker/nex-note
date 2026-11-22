import type { ProviderName } from '@/lib/ai-provider-config';

/**
 * Client-safe rules for where AI may run. The server enforces the same rules in
 * `lib/public-ai-access.ts`; this module only lets the UI show the right choices.
 */

export const LOCAL_AI_HOSTNAMES = new Set(['localhost', '127.0.0.1', '::1', '[::1]']);

/** `NexNoteNative/<version>`: the native iPad / Xcode shells reaching local AI routes over a LAN. */
export const NATIVE_AI_USER_AGENT_PATTERN = /\bNexNoteNative\/\d+(?:\.\d+){1,3}\b/;

/** Providers a Session Key may be used for in the Browser Preview. Ollama stays desktop-only. */
export const SESSION_KEY_PROVIDERS: ProviderName[] = ['claude', 'openai', 'gemini'];

export function isSessionKeyProvider(provider: unknown): provider is ProviderName {
  return typeof provider === 'string' && (SESSION_KEY_PROVIDERS as string[]).includes(provider);
}

export function isLocalAiHostname(hostname: string | null | undefined) {
  return LOCAL_AI_HOSTNAMES.has((hostname ?? '').toLowerCase());
}

export function isNativeAiUserAgent(userAgent: string | null | undefined) {
  return NATIVE_AI_USER_AGENT_PATTERN.test(userAgent ?? '');
}

/**
 * First guess, before the server answered, whether this page is the Browser Preview
 * (the editor on a public host). Desktop and native shells and local builds are not.
 */
export function guessBrowserPreview(input: {
  hostname?: string | null;
  userAgent?: string | null;
  hasDesktopBridge?: boolean;
}) {
  if (input.hasDesktopBridge) return false;
  if (isNativeAiUserAgent(input.userAgent)) return false;
  return !isLocalAiHostname(input.hostname);
}

export function guessBrowserPreviewFromWindow() {
  if (typeof window === 'undefined') return false;
  const bridge = (window as unknown as { nexNoteElectron?: { isElectron?: boolean } }).nexNoteElectron;
  return guessBrowserPreview({
    hostname: window.location?.hostname,
    userAgent: typeof navigator !== 'undefined' ? navigator.userAgent : '',
    hasDesktopBridge: Boolean(bridge?.isElectron),
  });
}
