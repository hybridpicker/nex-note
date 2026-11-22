import { createHash, randomBytes } from 'crypto';

/**
 * In-memory, per-client rate limit for Session Key requests on public hosts.
 *
 * Client IPs are hashed with a per-process random salt before they are used as map keys, kept
 * only in memory, never logged, and dropped once their window has passed. A restart forgets
 * everything. Behind the reverse proxy the client is identified by X-Real-IP (set by nginx), falling
 * back to the last X-Forwarded-For entry, never the client-controlled first one.
 */

export const DEFAULT_PUBLIC_AI_RATE_LIMIT = 20;
export const DEFAULT_PUBLIC_AI_RATE_WINDOW_MS = 10 * 60 * 1000;
const MAX_TRACKED_CLIENTS = 10_000;

export interface RateLimitDecision {
  allowed: boolean;
  remaining: number;
  retryAfterSeconds: number;
}

export interface RateLimiter {
  check(clientKey: string): RateLimitDecision;
  size(): number;
  reset(): void;
}

export function createRateLimiter(options: {
  limit: number;
  windowMs: number;
  now?: () => number;
  maxClients?: number;
}): RateLimiter {
  const now = options.now ?? Date.now;
  const maxClients = options.maxClients ?? MAX_TRACKED_CLIENTS;
  const hits = new Map<string, number[]>();

  function prune(at: number) {
    for (const [key, stamps] of hits) {
      const fresh = stamps.filter((stamp) => at - stamp < options.windowMs);
      if (fresh.length === 0) hits.delete(key);
      else hits.set(key, fresh);
    }
  }

  return {
    check(clientKey: string) {
      const at = now();
      const stamps = (hits.get(clientKey) ?? []).filter((stamp) => at - stamp < options.windowMs);
      if (stamps.length >= options.limit) {
        hits.set(clientKey, stamps);
        const oldest = stamps[0] ?? at;
        return {
          allowed: false,
          remaining: 0,
          retryAfterSeconds: Math.max(1, Math.ceil((oldest + options.windowMs - at) / 1000)),
        };
      }
      if (!hits.has(clientKey) && hits.size >= maxClients) {
        prune(at);
        // Still full: refuse rather than grow without bound.
        if (hits.size >= maxClients) {
          return { allowed: false, remaining: 0, retryAfterSeconds: Math.ceil(options.windowMs / 1000) };
        }
      }
      stamps.push(at);
      hits.set(clientKey, stamps);
      return { allowed: true, remaining: Math.max(0, options.limit - stamps.length), retryAfterSeconds: 0 };
    },
    size: () => hits.size,
    reset: () => hits.clear(),
  };
}

function positiveIntegerFromEnv(value: string | undefined, fallback: number) {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed >= 1 ? Math.floor(parsed) : fallback;
}

export function publicAiRateLimitConfig(env: NodeJS.ProcessEnv = process.env) {
  return {
    limit: positiveIntegerFromEnv(env.NEX_NOTE_PUBLIC_AI_RATE_LIMIT, DEFAULT_PUBLIC_AI_RATE_LIMIT),
    windowMs: positiveIntegerFromEnv(env.NEX_NOTE_PUBLIC_AI_RATE_WINDOW_MS, DEFAULT_PUBLIC_AI_RATE_WINDOW_MS),
  };
}

const IP_HASH_SALT = randomBytes(16);

/** One-way, salted hash of the client address; the raw address is never stored. */
export function hashClientAddress(address: string) {
  return createHash('sha256').update(IP_HASH_SALT).update(address).digest('base64url').slice(0, 22);
}

export function clientAddressFromHeaders(headers: Headers) {
  // nginx sets X-Real-IP to the connecting address. X-Forwarded-For's first entry is whatever the
  // client sent (nginx appends with $proxy_add_x_forwarded_for), so only its last entry is used.
  const realIp = headers.get('x-real-ip')?.trim();
  if (realIp) return realIp;
  const forwarded = headers.get('x-forwarded-for')?.split(',').map((part) => part.trim()).filter(Boolean);
  return forwarded?.at(-1) || 'unknown';
}

let sharedLimiter: { limiter: RateLimiter; limit: number; windowMs: number } | null = null;

/** Process-wide limiter for `/api/chat`; rebuilt when the env configuration changes. */
export function publicAiRateLimiter() {
  const config = publicAiRateLimitConfig();
  if (!sharedLimiter || sharedLimiter.limit !== config.limit || sharedLimiter.windowMs !== config.windowMs) {
    sharedLimiter = { limiter: createRateLimiter(config), ...config };
  }
  return sharedLimiter.limiter;
}
