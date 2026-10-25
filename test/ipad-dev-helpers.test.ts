import assert from 'node:assert/strict';
import { networkInterfaces } from 'node:os';
import test from 'node:test';
import {
  buildIpadAppUrl,
  buildIpadServerHealthUrl,
  buildIpadServerOrigin,
  injectIpadServerUrl,
  isNexNoteServerHealthPayload,
  probeNexNoteServer,
  resolveIpadPort,
  resolveLanAddress,
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
