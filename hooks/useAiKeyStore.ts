'use client';

import { useCallback, useEffect, useState, type Dispatch, type SetStateAction } from 'react';
import type { ProviderName } from '@/lib/ai-provider-config';
import {
  loadSavedAiKeys,
  migrateStoredAiKeys,
  normalizeAiModelSettings,
  readSecureKeyBridge,
  withApiKeys,
  type AiModelSettings,
} from '@/lib/ai-model-settings';
import { guessBrowserPreviewFromWindow, isSessionKeyProvider } from '@/lib/ai-access-surface';

/**
 * Where AI keys live for the running app:
 * - in memory (the `apiKey` fields of the settings React state) for the session — a Session Key
 *   in the Browser Preview, or any key the user chose "Use for this session" for;
 * - on the desktop, additionally encrypted in the OS keychain (window.nexNoteSecureKeys).
 * Nothing here writes a key to localStorage, sessionStorage or IndexedDB.
 */
export function useAiKeyStore(options: {
  hydrated: boolean;
  setAiModelSettings: Dispatch<SetStateAction<AiModelSettings>>;
}) {
  const { hydrated, setAiModelSettings } = options;
  const [browserPreview, setBrowserPreview] = useState(false);
  const [secureKeysAvailable, setSecureKeysAvailable] = useState(false);
  const [savedKeyProviders, setSavedKeyProviders] = useState<ProviderName[]>([]);

  useEffect(() => {
    setBrowserPreview(guessBrowserPreviewFromWindow());
  }, []);

  useEffect(() => {
    if (!hydrated) return;
    let cancelled = false;
    const bridge = readSecureKeyBridge();
    void (async () => {
      const availability = bridge ? await bridge.isAvailable().catch(() => null) : null;
      const usableBridge = availability?.ok && availability.available ? bridge : null;
      // Move keys an older version kept in localStorage into the keychain, or drop them.
      const migration = await migrateStoredAiKeys(usableBridge).catch(() => null);
      const saved = await loadSavedAiKeys(usableBridge).catch(() => ({}));
      if (cancelled) return;
      setSecureKeysAvailable(Boolean(usableBridge));
      setSavedKeyProviders(Object.keys(saved) as ProviderName[]);
      const keys = { ...(migration?.retainedKeys ?? {}), ...saved };
      if (Object.keys(keys).length > 0) {
        setAiModelSettings((current) => withApiKeys(current, keys));
      }
    })();
    return () => { cancelled = true; };
  }, [hydrated, setAiModelSettings]);

  /** The server's answer to an AI route: `false` means this is the Browser Preview. */
  const noteServerAiAccess = useCallback((trusted: boolean) => {
    setBrowserPreview(!trusted);
  }, []);

  const applySessionKey = useCallback((provider: ProviderName, key: string) => {
    if (browserPreview && !isSessionKeyProvider(provider)) return;
    setAiModelSettings((current) => {
      const next = withApiKeys(current, key ? { [provider]: key } : {});
      return normalizeAiModelSettings({
        ...next,
        providers: { ...next.providers, [provider]: { ...next.providers[provider], enabled: true } },
      });
    });
  }, [browserPreview, setAiModelSettings]);

  const saveKey = useCallback(async (provider: ProviderName, key: string) => {
    const bridge = readSecureKeyBridge();
    if (browserPreview || !bridge || !secureKeysAvailable) {
      return { ok: false, error: 'No secure key storage on this surface.' };
    }
    const result = await bridge.set(provider, key).catch(() => ({ ok: false, error: 'The key could not be saved.' }));
    if (result.ok) {
      setSavedKeyProviders((current) => (current.includes(provider) ? current : [...current, provider]));
      applySessionKey(provider, key);
    }
    return result;
  }, [browserPreview, secureKeysAvailable, applySessionKey]);

  const deleteSavedKey = useCallback(async (provider: ProviderName) => {
    const bridge = readSecureKeyBridge();
    if (!bridge) return { ok: false, error: 'No secure key storage on this surface.' };
    const result = await bridge.delete(provider).catch(() => ({ ok: false, error: 'The key could not be removed.' }));
    if (result.ok) {
      setSavedKeyProviders((current) => current.filter((entry) => entry !== provider));
      setAiModelSettings((current) => withApiKeys(current, { [provider]: '' }));
    }
    return result;
  }, [setAiModelSettings]);

  return {
    browserPreview,
    secureKeysAvailable,
    savedKeyProviders,
    noteServerAiAccess,
    applySessionKey,
    saveKey,
    deleteSavedKey,
  };
}
