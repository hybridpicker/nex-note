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

export const IPAD_LOCAL_SIGNING_PATH = 'ios/signing.local.xcconfig';
const FREE_TEAM_PROFILE_MAX_DAYS = 7;

export function parseLocalSigningTeam(source) {
  const match = source.match(/^\s*DEVELOPMENT_TEAM\s*=\s*([A-Z0-9]{10})\s*$/m);
  return match ? match[1] : null;
}

function readProfileDate(plistXml, key) {
  const match = plistXml.match(new RegExp(`<key>${key}</key>\\s*<date>([^<]+)</date>`));
  if (!match) throw new Error(`The provisioning profile has no ${key}.`);
  return new Date(match[1]);
}

export function parseProvisioningProfile(plistXml) {
  const creation = readProfileDate(plistXml, 'CreationDate');
  const expiration = readProfileDate(plistXml, 'ExpirationDate');
  const lifetimeDays = Math.round((expiration.getTime() - creation.getTime()) / 86_400_000);
  return {
    creation,
    expiration,
    lifetimeDays,
    isShortLived: lifetimeDays <= FREE_TEAM_PROFILE_MAX_DAYS,
  };
}

export function selectConnectedIpad(devicectlOutput, requestedIdentifier) {
  const ipads = (devicectlOutput?.result?.devices ?? [])
    .filter((device) => device.hardwareProperties?.deviceType === 'iPad')
    // A paired iPad on Wi-Fi reports a disconnected tunnel until devicectl opens it on demand.
    .filter((device) => device.connectionProperties?.pairingState === 'paired')
    .filter((device) => device.connectionProperties?.tunnelState !== 'unavailable')
    .map((device) => ({
      identifier: device.identifier,
      name: device.deviceProperties?.name ?? 'iPad',
      udid: device.hardwareProperties?.udid,
    }));

  if (requestedIdentifier) {
    const requested = ipads.find((device) => (
      device.identifier === requestedIdentifier || device.udid === requestedIdentifier
    ));
    if (!requested) throw new Error(`The iPad ${requestedIdentifier} is not connected.`);
    return requested;
  }
  if (ipads.length === 0) {
    throw new Error('No connected iPad was found. Pair it with this Mac, unlock it, and connect it by USB or Wi-Fi.');
  }
  if (ipads.length > 1) {
    throw new Error('Several iPads are connected. Set NEX_NOTE_IPAD_DEVICE to choose one.');
  }
  return ipads[0];
}

export function earliestDate(...dates) {
  return new Date(Math.min(...dates.map((date) => date.getTime())));
}
