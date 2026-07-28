import os from 'node:os';

export const IPAD_SERVER_HEALTH_PATH = '/api/native-health';
export const IPAD_SERVER_ID = 'nex-note-native-server';
export const IPAD_SERVER_URL_JSON_MARKER = '__NEX_NOTE_IPAD_SERVER_URL_JSON__';

function isPrivateIpv4(address) {
  const octets = address.split('.').map(Number);
  if (octets.length !== 4 || octets.some((octet) => !Number.isInteger(octet) || octet < 0 || octet > 255)) {
    return false;
  }

  return octets[0] === 10
    || (octets[0] === 172 && octets[1] >= 16 && octets[1] <= 31)
    || (octets[0] === 192 && octets[1] === 168);
}

export function resolveLanAddress(interfaces = os.networkInterfaces(), override = process.env.NEX_NOTE_IPAD_HOST) {
  if (override?.trim()) {
    const host = override.trim();
    if (host === 'localhost' || host === '127.0.0.1' || host === '0.0.0.0') {
      throw new Error('NEX_NOTE_IPAD_HOST must be an address reachable from the iPad, not localhost.');
    }
    return host;
  }

  const candidates = [];
  for (const [name, entries] of Object.entries(interfaces)) {
    for (const entry of entries ?? []) {
      if (entry.family !== 'IPv4' || entry.internal) continue;
      candidates.push({
        address: entry.address,
        priority: name === 'en0' ? 0 : isPrivateIpv4(entry.address) ? 1 : 2,
      });
    }
  }

  candidates.sort((left, right) => left.priority - right.priority);
  if (!candidates[0]) {
    throw new Error('No LAN IPv4 address was found. Connect the Mac to the same Wi-Fi as the iPad.');
  }
  return candidates[0].address;
}

export function resolveIpadPort(rawPort = process.env.NEX_NOTE_IPAD_PORT) {
  const port = Number(rawPort ?? 3000);
  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    throw new Error('NEX_NOTE_IPAD_PORT must be a valid TCP port.');
  }
  return port;
}

export function buildIpadServerOrigin(host, port) {
  return `http://${host}:${port}`;
}

export function buildIpadAppUrl(origin) {
  return new URL('/nex-note-app/', origin).toString();
}

export function buildIpadServerHealthUrl(origin) {
  return new URL(IPAD_SERVER_HEALTH_PATH, origin).toString();
}

export function isNexNoteServerHealthPayload(value) {
  return Boolean(
    value
    && typeof value === 'object'
    && value.service === IPAD_SERVER_ID
    && value.ok === true,
  );
}

export async function probeNexNoteServer(origin, options = {}) {
  const fetchImpl = options.fetchImpl ?? fetch;
  const timeoutMs = options.timeoutMs ?? 2_000;

  try {
    const response = await fetchImpl(buildIpadServerHealthUrl(origin), {
      cache: 'no-store',
      signal: AbortSignal.timeout(timeoutMs),
    });
    if (!response.ok) return false;
    return isNexNoteServerHealthPayload(await response.json());
  } catch {
    return false;
  }
}

export function injectIpadServerUrl(template, serverUrl) {
  if (!template.includes(IPAD_SERVER_URL_JSON_MARKER)) {
    throw new Error('The native connection-error page is missing its server URL marker.');
  }
  return template.replaceAll(IPAD_SERVER_URL_JSON_MARKER, JSON.stringify(serverUrl));
}
