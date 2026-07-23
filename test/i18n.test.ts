import test from 'node:test';
import assert from 'node:assert/strict';
import React from 'react';
import { act, create } from 'react-test-renderer';

import LanguageSettings from '../components/LanguageSettings.tsx';
import { I18nProvider, SUPPORTED_LOCALES, TRANSLATION_KEYS, detectLocale, getManualHref, LOCALE_STORAGE_KEY, translate } from '../lib/i18n.tsx';
import WelcomeScreen from '../components/WelcomeScreen.tsx';
import NewScoreDialog from '../components/NewScoreDialog.tsx';
import { DEFAULT_AI_MODEL_SETTINGS } from '../lib/ai-model-settings.ts';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;

class MemoryStorage {
  private data = new Map<string, string>();
  getItem(key: string) { return this.data.has(key) ? this.data.get(key)! : null; }
  setItem(key: string, value: string) { this.data.set(key, value); }
  removeItem(key: string) { this.data.delete(key); }
  clear() { this.data.clear(); }
}

const storage = new MemoryStorage();

function collectText(root: ReturnType<typeof create>['root']) {
  return root.findAll((node) => Array.isArray(node.children) && node.children.some((child) => typeof child === 'string'))
    .map((node) => node.children.filter((child) => typeof child === 'string').join(''))
    .join('\n');
}

function nodeText(node: ReturnType<typeof create>['root']): string {
  return node.children.map((child) => (
    typeof child === 'string' ? child : nodeText(child as unknown as ReturnType<typeof create>['root'])
  )).join('');
}

function buttonWithText(root: ReturnType<typeof create>['root'], text: string) {
  return root.findAll((node) => (
    node.type === 'button'
    && typeof node.props.onClick === 'function'
    && nodeText(node as ReturnType<typeof create>['root']).includes(text)
  ))[0];
}

function welcomeScreenProps(
  overrides: Partial<React.ComponentProps<typeof WelcomeScreen>> = {},
): React.ComponentProps<typeof WelcomeScreen> {
  return {
    onCreateBlankScore() {},
    onChooseTemplate() {},
    onOpenFile() {},
    onFileSelected() {},
    onOpenLibraryScore() {},
    aiModelSettings: DEFAULT_AI_MODEL_SETTINGS,
    aiSettingsHydrated: true,
    aiProvider: 'ollama',
    ollamaModel: 'gemma4:31b',
    ollamaConnectionState: 'connected',
    onOpenAiSettings() {},
    ...overrides,
  };
}

test.beforeEach(() => {
  storage.clear();
  Object.assign(globalThis, {
    localStorage: storage,
    window: {
      localStorage: storage,
      location: {
        search: '',
      },
      navigator: {
        language: 'en-US',
        languages: ['en-US'],
      },
    },
    document: {
      documentElement: {
        lang: '',
      },
    },
  });
});

test('locale detection picks closest supported locale and falls back to English', () => {
  assert.equal(detectLocale(['de-AT', 'en-US']), 'de');
  assert.equal(detectLocale(['fr-CA']), 'fr');
  assert.equal(detectLocale(['pt-BR', 'it-IT']), 'en');
  assert.equal(getManualHref('zh'), '/docs/user-manual.zh.md');
  assert.equal(getManualHref('de'), '/docs/user-manual.md');
});

test('all supported locales resolve every translation key without missing markers', () => {
  for (const locale of SUPPORTED_LOCALES) {
    for (const key of TRANSLATION_KEYS) {
      const value = translate(locale, key, { count: 2, plural: 's', language: 'test', mode: 'test', error: 'test' });
      assert.ok(value.trim(), `${locale}:${key} resolved to an empty translation`);
      assert.doesNotMatch(value, /^\[missing /, `${locale}:${key} fell back through a visible missing marker`);
    }
  }
});

test('language setting persists, updates html lang, and changes visible labels', async () => {
  storage.setItem(LOCALE_STORAGE_KEY, 'de');
  let renderer: ReturnType<typeof create> | null = null;

  await act(async () => {
    renderer = create(
      React.createElement(I18nProvider, null,
        React.createElement(React.Fragment, null,
          React.createElement(LanguageSettings),
          React.createElement(WelcomeScreen, welcomeScreenProps()),
        ),
      ),
    );
  });

  assert.match(collectText(renderer!.root), /Starte eine Partitur/);
  assert.equal((globalThis.document as { documentElement: { lang: string } }).documentElement.lang, 'de');

  const select = renderer!.root.findAllByProps({ id: 'nex-note-language' })[0];
  await act(async () => {
    select.props.onChange({ target: { value: 'es' } });
  });

  assert.equal(storage.getItem(LOCALE_STORAGE_KEY), 'es');
  assert.equal((globalThis.document as { documentElement: { lang: string } }).documentElement.lang, 'es');
  assert.match(collectText(renderer!.root), /Crea una partitura/);
  assert.equal(renderer!.root.findAllByType('a')[0].props.href, '/docs/user-manual.es.md');

  await act(async () => {
    renderer?.unmount();
  });
});

test('i18n provider starts in English when no saved language exists', async () => {
  Object.assign(globalThis, {
    window: {
      localStorage: storage,
      navigator: {
        language: 'de-AT',
        languages: ['de-AT', 'de', 'en-US'],
      },
    },
  });
  let renderer: ReturnType<typeof create> | null = null;

  await act(async () => {
    renderer = create(
      React.createElement(I18nProvider, null,
        React.createElement(WelcomeScreen, welcomeScreenProps()),
      ),
    );
  });

  assert.match(collectText(renderer!.root), /Start a score/);
  assert.equal((globalThis.document as { documentElement: { lang: string } }).documentElement.lang, 'en');
  assert.equal(storage.getItem(LOCALE_STORAGE_KEY), 'en');

  await act(async () => {
    renderer?.unmount();
  });
});

test('locale query parameter overrides saved language for preview links', async () => {
  storage.setItem(LOCALE_STORAGE_KEY, 'de');
  Object.assign(globalThis, {
    window: {
      localStorage: storage,
      location: {
        search: '?locale=en',
      },
      navigator: {
        language: 'de-AT',
        languages: ['de-AT', 'de', 'en-US'],
      },
    },
  });
  let renderer: ReturnType<typeof create> | null = null;

  await act(async () => {
    renderer = create(
      React.createElement(I18nProvider, null,
        React.createElement(WelcomeScreen, welcomeScreenProps()),
      ),
    );
  });

  assert.match(collectText(renderer!.root), /Start a score/);
  assert.equal((globalThis.document as { documentElement: { lang: string } }).documentElement.lang, 'en');
  assert.equal(storage.getItem(LOCALE_STORAGE_KEY), 'en');

  await act(async () => {
    renderer?.unmount();
  });
});

test('welcome screen buttons trigger concrete start actions', async () => {
  const calls: string[] = [];
  let renderer: ReturnType<typeof create> | null = null;

  await act(async () => {
    renderer = create(
      React.createElement(I18nProvider, null,
        React.createElement(WelcomeScreen, welcomeScreenProps({
          onCreateBlankScore() { calls.push('blank'); },
          onChooseTemplate() { calls.push('template'); },
          onOpenFile() { calls.push('open'); },
        })),
      ),
    );
  });

  await act(async () => {
    buttonWithText(renderer!.root, 'New score').props.onClick();
    buttonWithText(renderer!.root, 'Choose template').props.onClick();
    buttonWithText(renderer!.root, 'Open file').props.onClick();
  });

  assert.deepEqual(calls, ['blank', 'template', 'open']);

  await act(async () => {
    renderer?.unmount();
  });
});

test('new score dialog can open directly on templates', async () => {
  let renderer: ReturnType<typeof create> | null = null;

  await act(async () => {
    renderer = create(
      React.createElement(I18nProvider, null,
        React.createElement(NewScoreDialog, {
          open: true,
          initialTab: 'templates',
          onClose() {},
          onCreate() {},
        }),
      ),
    );
  });

  assert.match(collectText(renderer!.root), /Grand staff piano score\./);

  await act(async () => {
    renderer?.unmount();
  });
});

test('new score dialog selects a local user template', async () => {
  const selected: string[] = [];
  let renderer: ReturnType<typeof create> | null = null;

  await act(async () => {
    renderer = create(
      React.createElement(I18nProvider, null,
        React.createElement(NewScoreDialog, {
          open: true,
          initialTab: 'templates',
          onClose() {},
          onCreate() {},
          userTemplates: [{
            id: 'local-template',
            source: 'local',
            name: 'Local Template',
            category: 'Private',
            description: 'Private local template.',
            filename: 'Local_Template.musicxml',
            format: 'musicxml',
            private: true,
            sourceLabel: 'Nex Note',
          }],
          onChooseUserTemplate(template) {
            selected.push(template.filename);
          },
        }),
      ),
    );
  });

  assert.match(collectText(renderer!.root), /Local Template/);

  await act(async () => {
    buttonWithText(renderer!.root, 'Local Template').props.onClick();
  });

  assert.deepEqual(selected, ['Local_Template.musicxml']);

  await act(async () => {
    renderer?.unmount();
  });
});
