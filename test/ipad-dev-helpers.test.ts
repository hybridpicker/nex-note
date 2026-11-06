import assert from 'node:assert/strict';
import { networkInterfaces } from 'node:os';
import test from 'node:test';
import {
  buildIpadAppUrl,
  buildIpadServerHealthUrl,
  buildIpadServerOrigin,
  earliestDate,
  injectIpadServerUrl,
  isNexNoteServerHealthPayload,
  parseLocalSigningTeam,
  parseProvisioningProfile,
  probeNexNoteServer,
  resolveIpadPort,
  resolveLanAddress,
  selectConnectedIpad,
} from '../scripts/ipad-dev-helpers.mjs';

test('resolveLanAddress prefers Wi-Fi en0 over other private interfaces', () => {
  const interfaces = {
    bridge100: [{
      address: '192.168.64.1',
      family: 'IPv4',
      internal: false,
      netmask: '255.255.255.0',
      cidr: '192.168.64.1/24',
      mac: '00:00:00:00:00:00',
    }],
    en0: [{
      address: '192.168.1.20',
      family: 'IPv4',
      internal: false,
      netmask: '255.255.255.0',
      cidr: '192.168.1.20/24',
      mac: '00:00:00:00:00:00',
    }],
  } as ReturnType<typeof networkInterfaces>;
  const address = resolveLanAddress(interfaces, '');

  assert.equal(address, '192.168.1.20');
});

test('resolveLanAddress rejects loopback overrides', () => {
  assert.throws(() => resolveLanAddress({}, '127.0.0.1'), /reachable from the iPad/);
});

test('iPad server origin uses a validated port', () => {
  assert.equal(resolveIpadPort('3100'), 3100);
  assert.equal(buildIpadServerOrigin('192.168.1.8', 3100), 'http://192.168.1.8:3100');
  assert.throws(() => resolveIpadPort('70000'), /valid TCP port/);
});

test('iPad URLs target the native app and an identity-bearing health endpoint', () => {
  const origin = 'http://192.168.1.8:3100';
  assert.equal(buildIpadAppUrl(origin), 'http://192.168.1.8:3100/nex-note-app/');
  assert.equal(buildIpadServerHealthUrl(origin), 'http://192.168.1.8:3100/api/native-health');
  assert.equal(isNexNoteServerHealthPayload({
    ok: true,
    service: 'nex-note-native-server',
  }), true);
  assert.equal(isNexNoteServerHealthPayload({ ok: true, service: 'another-app' }), false);
});

test('probeNexNoteServer rejects an unrelated process that happens to answer on the port', async () => {
  const unrelatedFetch = async () => ({
    ok: true,
    async json() {
      return { ok: true, service: 'another-app' };
    },
  });
  const nexNoteFetch = async () => ({
    ok: true,
    async json() {
      return { ok: true, service: 'nex-note-native-server' };
    },
  });

  assert.equal(await probeNexNoteServer('http://192.168.1.8:3100', {
    fetchImpl: unrelatedFetch,
  }), false);
  assert.equal(await probeNexNoteServer('http://192.168.1.8:3100', {
    fetchImpl: nexNoteFetch,
  }), true);
});

test('generated connection-error page reconnects to the configured Mac server URL', () => {
  const template = 'const configuredServerUrl = __NEX_NOTE_IPAD_SERVER_URL_JSON__;';
  assert.equal(
    injectIpadServerUrl(template, 'http://192.168.1.8:3100/nex-note-app/'),
    'const configuredServerUrl = "http://192.168.1.8:3100/nex-note-app/";',
  );
  assert.throws(
    () => injectIpadServerUrl('<html></html>', 'http://192.168.1.8:3100/nex-note-app/'),
    /missing its server URL marker/,
  );
});

test('parseLocalSigningTeam reads a real team and ignores placeholders and comments', () => {
  assert.equal(parseLocalSigningTeam('// note\nDEVELOPMENT_TEAM = ABCDE12345\n'), 'ABCDE12345');
  assert.equal(parseLocalSigningTeam('// DEVELOPMENT_TEAM = ABCDE12345\n'), null);
  assert.equal(parseLocalSigningTeam('DEVELOPMENT_TEAM = YOUR_TEAM\n'), null);
});

function profileXml(creation: string, expiration: string) {
  return `<plist><dict><key>CreationDate</key><date>${creation}</date>`
    + `<key>ExpirationDate</key>\n\t<date>${expiration}</date></dict></plist>`;
}

test('parseProvisioningProfile flags the seven-day profile of a free team', () => {
  const profile = parseProvisioningProfile(profileXml('2026-11-04T14:51:24Z', '2026-11-11T14:51:24Z'));
  assert.equal(profile.lifetimeDays, 7);
  assert.equal(profile.isShortLived, true);
});

test('parseProvisioningProfile accepts the one-year profile of a paid team', () => {
  const profile = parseProvisioningProfile(profileXml('2026-11-06T14:12:10Z', '2027-11-06T14:12:10Z'));
  assert.equal(profile.lifetimeDays, 365);
  assert.equal(profile.isShortLived, false);
  assert.equal(profile.expiration.toISOString().slice(0, 10), '2027-11-06');
});

test('parseProvisioningProfile rejects a profile without dates', () => {
  assert.throws(() => parseProvisioningProfile('<plist><dict></dict></plist>'), /CreationDate/);
});

function fakeDevice(name: string, deviceType: string, tunnelState: string) {
  return {
    identifier: `id-${name}`,
    deviceProperties: { name },
    hardwareProperties: { deviceType, udid: `udid-${name}` },
    connectionProperties: { pairingState: 'paired', tunnelState },
  };
}

test('selectConnectedIpad ignores iPhones and disconnected iPads', () => {
  const selected = selectConnectedIpad({ result: { devices: [
    fakeDevice('phone', 'iPhone', 'connected'),
    fakeDevice('old', 'iPad', 'unavailable'),
    fakeDevice('main', 'iPad', 'connected'),
  ] } });
  assert.deepEqual(selected, { identifier: 'id-main', name: 'main', udid: 'udid-main' });
});

test('selectConnectedIpad requires a choice among several iPads and honors it', () => {
  const output = { result: { devices: [
    fakeDevice('a', 'iPad', 'connected'),
    fakeDevice('b', 'iPad', 'connected'),
  ] } };
  assert.throws(() => selectConnectedIpad(output), /NEX_NOTE_IPAD_DEVICE/);
  assert.equal(selectConnectedIpad(output, 'udid-b').name, 'b');
  assert.throws(() => selectConnectedIpad(output, 'udid-c'), /not connected/);
});

test('selectConnectedIpad explains when no iPad is connected', () => {
  assert.throws(() => selectConnectedIpad({ result: { devices: [] } }), /No connected iPad/);
});

test('earliestDate reports the certificate when it expires before the profile', () => {
  const certificate = new Date('2027-10-23T21:11:41Z');
  const profile = new Date('2027-11-06T14:12:10Z');
  assert.equal(earliestDate(profile, certificate).getTime(), certificate.getTime());
});

test('selectConnectedIpad accepts a paired iPad on Wi-Fi whose tunnel opens on demand', () => {
  const selected = selectConnectedIpad({ result: { devices: [
    fakeDevice('wifi', 'iPad', 'disconnected'),
  ] } });
  assert.equal(selected.name, 'wifi');
});

test('selectConnectedIpad ignores an iPad that is not paired', () => {
  const device = fakeDevice('new', 'iPad', 'disconnected');
  device.connectionProperties.pairingState = 'unsupported';
  assert.throws(() => selectConnectedIpad({ result: { devices: [device] } }), /No connected iPad/);
});
