'use strict';

// Desktop store for AI provider keys. Each key is encrypted with Electron safeStorage (the macOS
// Keychain, libsecret/kwallet on Linux, DPAPI on Windows) and only the encrypted bytes are written,
// base64-encoded, to <userData>/ai-provider-keys.json with mode 0600. When the OS offers no
// encryption the store refuses to save instead of writing plaintext.
//
// IPC (all via ipcMain.handle, renderer side in electron/preload.cjs as window.nexNoteSecureKeys):
//   nex-note:secure-keys:available            -> { ok, available }
//   nex-note:secure-keys:list                 -> { ok, providers }   (names only, never keys)
//   nex-note:secure-keys:get     { provider } -> { ok, key? }
//   nex-note:secure-keys:set     { provider, key } -> { ok, error? }
//   nex-note:secure-keys:delete  { provider } -> { ok }
// Keys are never logged and never included in an error message.

const fs = require('node:fs/promises');
const path = require('node:path');

const SECURE_KEY_PROVIDERS = Object.freeze(['ollama', 'openai', 'claude', 'gemini']);
const SECURE_KEYS_FILENAME = 'ai-provider-keys.json';
const MAX_KEY_LENGTH = 4096;
const CHANNELS = Object.freeze({
  available: 'nex-note:secure-keys:available',
  list: 'nex-note:secure-keys:list',
  get: 'nex-note:secure-keys:get',
  set: 'nex-note:secure-keys:set',
  delete: 'nex-note:secure-keys:delete',
});

const ENCRYPTION_UNAVAILABLE_ERROR = 'This computer offers no secure key storage (OS keychain), so the key was not saved. Use it for this session instead.';

function isProvider(value) {
  return typeof value === 'string' && SECURE_KEY_PROVIDERS.includes(value);
}

function createSecureKeyStore({ app, safeStorage, fsImpl = fs, platform = process.platform }) {
  if (!app || typeof app.getPath !== 'function') throw new TypeError('createSecureKeyStore needs Electron app');
  if (!safeStorage) throw new TypeError('createSecureKeyStore needs Electron safeStorage');

  const filePath = () => path.join(app.getPath('userData'), SECURE_KEYS_FILENAME);
  let queue = Promise.resolve();

  // Serialise read-modify-write cycles so two quick saves cannot drop each other.
  function exclusive(task) {
    const run = queue.then(task, task);
    queue = run.catch(() => {});
    return run;
  }

  function encryptionAvailable() {
    try {
      if (!safeStorage.isEncryptionAvailable()) return false;
      // On Linux without a secret service, safeStorage falls back to a hard-coded password
      // ("basic_text"); that is not keychain protection, so refuse it.
      if (platform === 'linux' && typeof safeStorage.getSelectedStorageBackend === 'function'
        && safeStorage.getSelectedStorageBackend() === 'basic_text') return false;
      return true;
    } catch {
      return false;
    }
  }

  async function readEntries() {
    let raw;
    try {
      raw = await fsImpl.readFile(filePath(), 'utf8');
    } catch (error) {
      if (error && error.code === 'ENOENT') return {};
      throw new Error('The saved AI keys could not be read.');
    }
    try {
      const parsed = JSON.parse(raw);
      const entries = parsed && typeof parsed === 'object' && parsed.keys && typeof parsed.keys === 'object' ? parsed.keys : {};
      const result = {};
      for (const provider of SECURE_KEY_PROVIDERS) {
        if (typeof entries[provider] === 'string' && entries[provider]) result[provider] = entries[provider];
      }
      return result;
    } catch {
      return {};
    }
  }

  async function writeEntries(entries) {
    const target = filePath();
    await fsImpl.mkdir(path.dirname(target), { recursive: true });
    const temp = `${target}.${process.pid}.tmp`;
    await fsImpl.writeFile(temp, JSON.stringify({ version: 1, keys: entries }), { encoding: 'utf8', mode: 0o600 });
    await fsImpl.rename(temp, target);
  }

  return {
    filePath,
    async available() {
      return { ok: true, available: encryptionAvailable() };
    },
    async list() {
      try {
        const entries = await readEntries();
        return { ok: true, providers: SECURE_KEY_PROVIDERS.filter((provider) => Boolean(entries[provider])) };
      } catch (error) {
        return { ok: false, providers: [], error: error.message };
      }
    },
    async get(provider) {
      if (!isProvider(provider)) return { ok: false, error: 'Unknown AI provider.' };
      if (!encryptionAvailable()) return { ok: false, error: ENCRYPTION_UNAVAILABLE_ERROR };
      try {
        const entries = await readEntries();
        if (!entries[provider]) return { ok: true };
        const key = safeStorage.decryptString(Buffer.from(entries[provider], 'base64'));
        return { ok: true, key };
      } catch {
        return { ok: false, error: 'The saved key could not be decrypted. Save it again.' };
      }
    },
    set(provider, key) {
      return exclusive(async () => {
        if (!isProvider(provider)) return { ok: false, error: 'Unknown AI provider.' };
        const value = typeof key === 'string' ? key.trim() : '';
        if (!value) return { ok: false, error: 'The key is empty.' };
        if (value.length > MAX_KEY_LENGTH) return { ok: false, error: 'The key is too long.' };
        if (!encryptionAvailable()) return { ok: false, error: ENCRYPTION_UNAVAILABLE_ERROR };
        try {
          const encrypted = safeStorage.encryptString(value);
          const entries = await readEntries();
          entries[provider] = Buffer.from(encrypted).toString('base64');
          await writeEntries(entries);
          return { ok: true };
        } catch {
          return { ok: false, error: 'The key could not be saved to the keychain.' };
        }
      });
    },
    delete(provider) {
      return exclusive(async () => {
        if (!isProvider(provider)) return { ok: false, error: 'Unknown AI provider.' };
        try {
          const entries = await readEntries();
          if (!entries[provider]) return { ok: true };
          delete entries[provider];
          await writeEntries(entries);
          return { ok: true };
        } catch {
          return { ok: false, error: 'The saved key could not be removed.' };
        }
      });
    },
  };
}

const TRUSTED_SENDER_HOSTS = new Set(['127.0.0.1', 'localhost', '[::1]']);

// Only the app's own local page may read or write keys; a page the window navigated to elsewhere
// gets nothing.
function isLocalAppSender(event) {
  const url = event && event.senderFrame && typeof event.senderFrame.url === 'string'
    ? event.senderFrame.url
    : '';
  try {
    const parsed = new URL(url);
    return (parsed.protocol === 'http:' || parsed.protocol === 'https:') && TRUSTED_SENDER_HOSTS.has(parsed.hostname);
  } catch {
    return false;
  }
}

const UNTRUSTED_SENDER_RESULT = Object.freeze({ ok: false, error: 'Not allowed from this page.' });

function payloadProvider(payload) {
  return payload && typeof payload === 'object' ? payload.provider : undefined;
}

/**
 * Registers the secure key IPC handlers. Call once from electron/main.cjs, e.g.
 *   registerSecureKeyIpc(ipcMain, { app, safeStorage });
 * Returns the store (useful for tests).
 */
function registerSecureKeyIpc(ipcMain, { app, safeStorage, fsImpl, platform, isTrustedSender = isLocalAppSender } = {}) {
  if (!ipcMain || typeof ipcMain.handle !== 'function') throw new TypeError('registerSecureKeyIpc needs ipcMain');
  const store = createSecureKeyStore({ app, safeStorage, fsImpl, platform });
  const guarded = (handler) => (event, payload) => (
    isTrustedSender(event) ? handler(payload) : { ...UNTRUSTED_SENDER_RESULT }
  );
  ipcMain.handle(CHANNELS.available, guarded(() => store.available()));
  ipcMain.handle(CHANNELS.list, guarded(() => store.list()));
  ipcMain.handle(CHANNELS.get, guarded((payload) => store.get(payloadProvider(payload))));
  ipcMain.handle(CHANNELS.set, guarded((payload) => store.set(
    payloadProvider(payload),
    payload && typeof payload === 'object' ? payload.key : undefined,
  )));
  ipcMain.handle(CHANNELS.delete, guarded((payload) => store.delete(payloadProvider(payload))));
  return store;
}

module.exports = {
  CHANNELS,
  ENCRYPTION_UNAVAILABLE_ERROR,
  SECURE_KEYS_FILENAME,
  SECURE_KEY_PROVIDERS,
  createSecureKeyStore,
  isLocalAppSender,
  registerSecureKeyIpc,
};
