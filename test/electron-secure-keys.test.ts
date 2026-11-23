import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { mkdtempSync, readFileSync, rmSync, statSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const require = createRequire(import.meta.url);
const {
  CHANNELS,
  ENCRYPTION_UNAVAILABLE_ERROR,
  SECURE_KEYS_FILENAME,
  isLocalAppSender,
  registerSecureKeyIpc,
} = require('../electron/secure-keys.cjs');

const KEY = 'sk-test-desktop-keychain-0000000001';

/** Stand-in for Electron safeStorage: reversible, but never stores the plaintext as-is. */
function fakeSafeStorage(available = true) {
  return {
    isEncryptionAvailable: () => available,
    encryptString: (value: string) => Buffer.from(`enc:${Buffer.from(value).toString('hex')}`),
    decryptString: (buffer: Buffer) => {
      const text = buffer.toString();
      assert.ok(text.startsWith('enc:'));
      return Buffer.from(text.slice(4), 'hex').toString();
    },
  };
}

function fakeIpcMain() {
  const handlers = new Map<string, (event: unknown, payload?: unknown) => unknown>();
  return {
    handle(channel: string, handler: (event: unknown, payload?: unknown) => unknown) { handlers.set(channel, handler); },
    invoke(channel: string, payload?: unknown, url = 'http://127.0.0.1:43123/') {
      return Promise.resolve(handlers.get(channel)!({ senderFrame: { url } }, payload));
    },
    handlers,
  };
}

function setup(available = true) {
  const dir = mkdtempSync(join(tmpdir(), 'nex-note-secure-keys-'));
  const ipcMain = fakeIpcMain();
  const app = { getPath: (name: string) => { assert.equal(name, 'userData'); return dir; } };
  registerSecureKeyIpc(ipcMain, { app, safeStorage: fakeSafeStorage(available) });
  return { dir, ipcMain, cleanup: () => rmSync(dir, { recursive: true, force: true }) };
}

test('secure keys: set, list, get and delete per provider; file holds encrypted bytes only', async () => {
  const { dir, ipcMain, cleanup } = setup();
  try {
    assert.deepEqual(await ipcMain.invoke(CHANNELS.available), { ok: true, available: true });
    assert.deepEqual(await ipcMain.invoke(CHANNELS.list), { ok: true, providers: [] });

    assert.deepEqual(await ipcMain.invoke(CHANNELS.set, { provider: 'openai', key: `  ${KEY}  ` }), { ok: true });
    assert.deepEqual(await ipcMain.invoke(CHANNELS.list), { ok: true, providers: ['openai'] });
    assert.deepEqual(await ipcMain.invoke(CHANNELS.get, { provider: 'openai' }), { ok: true, key: KEY });
    assert.deepEqual(await ipcMain.invoke(CHANNELS.get, { provider: 'claude' }), { ok: true });

    const file = join(dir, SECURE_KEYS_FILENAME);
    const raw = readFileSync(file, 'utf8');
    assert.doesNotMatch(raw, /sk-test-desktop/, 'plaintext key never written');
    if (process.platform !== 'win32') assert.equal(statSync(file).mode & 0o777, 0o600);

    assert.deepEqual(await ipcMain.invoke(CHANNELS.delete, { provider: 'openai' }), { ok: true });
    assert.deepEqual(await ipcMain.invoke(CHANNELS.list), { ok: true, providers: [] });
  } finally {
    cleanup();
  }
});

test('secure keys: refuse to store without OS encryption and say why', async () => {
  const { dir, ipcMain, cleanup } = setup(false);
  try {
    assert.deepEqual(await ipcMain.invoke(CHANNELS.available), { ok: true, available: false });
    const result = await ipcMain.invoke(CHANNELS.set, { provider: 'gemini', key: KEY }) as { ok: boolean; error: string };
    assert.equal(result.ok, false);
    assert.equal(result.error, ENCRYPTION_UNAVAILABLE_ERROR);
    assert.doesNotMatch(result.error, /sk-test/);
    assert.throws(() => statSync(join(dir, SECURE_KEYS_FILENAME)), /ENOENT/);
  } finally {
    cleanup();
  }
});

test('secure keys: reject unknown providers, empty keys and pages that are not the local app', async () => {
  const { ipcMain, cleanup } = setup();
  try {
    assert.equal((await ipcMain.invoke(CHANNELS.set, { provider: 'evil', key: KEY }) as { ok: boolean }).ok, false);
    assert.equal((await ipcMain.invoke(CHANNELS.set, { provider: 'openai', key: '   ' }) as { ok: boolean }).ok, false);
    await ipcMain.invoke(CHANNELS.set, { provider: 'openai', key: KEY });
    const remote = await ipcMain.invoke(CHANNELS.get, { provider: 'openai' }, 'https://example.com/') as { ok: boolean; key?: string };
    assert.equal(remote.ok, false);
    assert.equal(remote.key, undefined);
    assert.equal(isLocalAppSender({ senderFrame: { url: 'http://localhost:3000/' } }), true);
    assert.equal(isLocalAppSender({ senderFrame: { url: 'file:///tmp/x.html' } }), false);
    assert.equal(isLocalAppSender({}), false);
  } finally {
    cleanup();
  }
});

test('secure keys: concurrent saves for different providers both persist', async () => {
  const { ipcMain, cleanup } = setup();
  try {
    await Promise.all([
      ipcMain.invoke(CHANNELS.set, { provider: 'openai', key: `${KEY}-a` }),
      ipcMain.invoke(CHANNELS.set, { provider: 'claude', key: `${KEY}-b` }),
    ]);
    assert.deepEqual(await ipcMain.invoke(CHANNELS.list), { ok: true, providers: ['openai', 'claude'] });
  } finally {
    cleanup();
  }
});

test('secure keys: the Linux basic_text fallback does not count as a keychain', async () => {
  const { createSecureKeyStore } = require('../electron/secure-keys.cjs');
  const dir = mkdtempSync(join(tmpdir(), 'nex-note-secure-keys-'));
  try {
    const store = createSecureKeyStore({
      app: { getPath: () => dir },
      safeStorage: { ...fakeSafeStorage(true), getSelectedStorageBackend: () => 'basic_text' },
      platform: 'linux',
    });
    assert.deepEqual(await store.available(), { ok: true, available: false });
    assert.equal((await store.set('openai', KEY)).ok, false);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

/** Electron 45+ safeStorage: async calls only; the deprecated sync ones throw if touched. */
function fakeAsyncSafeStorage({ rotateOnFirstRead = false } = {}) {
  const sync = fakeSafeStorage(true);
  let rotated = !rotateOnFirstRead;
  const calls: string[] = [];
  return {
    calls,
    isEncryptionAvailable: () => { throw new Error('sync API used'); },
    encryptString: () => { throw new Error('sync API used'); },
    decryptString: () => { throw new Error('sync API used'); },
    isAsyncEncryptionAvailable: async () => true,
    encryptStringAsync: async (value: string) => { calls.push('encrypt'); return sync.encryptString(value); },
    decryptStringAsync: async (buffer: Buffer) => {
      calls.push('decrypt');
      const shouldReEncrypt = !rotated;
      rotated = true;
      return { shouldReEncrypt, result: sync.decryptString(buffer) };
    },
  };
}

test('secure keys: use the async safeStorage API when Electron offers it', async () => {
  const { createSecureKeyStore } = require('../electron/secure-keys.cjs');
  const dir = mkdtempSync(join(tmpdir(), 'nex-note-secure-keys-'));
  try {
    const safeStorage = fakeAsyncSafeStorage();
    const store = createSecureKeyStore({ app: { getPath: () => dir }, safeStorage, platform: 'darwin' });
    assert.deepEqual(await store.available(), { ok: true, available: true });
    assert.deepEqual(await store.set('openai', KEY), { ok: true });
    assert.deepEqual(await store.get('openai'), { ok: true, key: KEY });
    assert.deepEqual(safeStorage.calls, ['encrypt', 'decrypt']);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('secure keys: keys saved with the sync API stay readable and are re-encrypted when asked', async () => {
  const { createSecureKeyStore } = require('../electron/secure-keys.cjs');
  const dir = mkdtempSync(join(tmpdir(), 'nex-note-secure-keys-'));
  try {
    const legacy = createSecureKeyStore({ app: { getPath: () => dir }, safeStorage: fakeSafeStorage(true), platform: 'darwin' });
    assert.deepEqual(await legacy.set('claude', KEY), { ok: true });

    const safeStorage = fakeAsyncSafeStorage({ rotateOnFirstRead: true });
    const store = createSecureKeyStore({ app: { getPath: () => dir }, safeStorage, platform: 'darwin' });
    assert.deepEqual(await store.get('claude'), { ok: true, key: KEY });
    assert.deepEqual(safeStorage.calls, ['decrypt', 'encrypt'], 're-encrypted after shouldReEncrypt');
    assert.deepEqual(await store.get('claude'), { ok: true, key: KEY });
    assert.doesNotMatch(readFileSync(join(dir, SECURE_KEYS_FILENAME), 'utf8'), /sk-test-desktop/);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
