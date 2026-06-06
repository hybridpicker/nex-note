import test from 'node:test';
import assert from 'node:assert/strict';

import {
  readClientVisualDebugEnabled,
  readDebugParam,
  readVisualDebugFromParams,
  readVisualDebugParam,
} from '@/lib/debug-flags';
import { readDoctorSettings } from '@/src/debug/doctor/flags';

function withWindowSearch<T>(search: string, run: () => T): T {
  return withWindowContext(search, () => null, run);
}

function withWindowContext<T>(search: string, getItem: (key: string) => string | null, run: () => T): T {
  const originalWindow = globalThis.window;
  const originalLocalStorage = globalThis.localStorage;
  Object.defineProperty(globalThis, 'window', {
    configurable: true,
    value: {
      location: { search },
    },
  });
  Object.defineProperty(globalThis, 'localStorage', {
    configurable: true,
    value: {
      getItem,
    },
  });

  try {
    return run();
  } finally {
    Object.defineProperty(globalThis, 'window', {
      configurable: true,
      value: originalWindow,
    });
    Object.defineProperty(globalThis, 'localStorage', {
      configurable: true,
      value: originalLocalStorage,
    });
  }
}

test('debug=true is the canonical visual debug flag', () => {
  const params = new URLSearchParams('?debug=true');

  assert.equal(readDebugParam(params), true);
  assert.equal(readVisualDebugParam(params), null);
  assert.equal(readVisualDebugFromParams(params), true);
});

test('legacy visual-debug=true remains supported', () => {
  const params = new URLSearchParams('?visual-debug=true');

  assert.equal(readVisualDebugParam(params), true);
  assert.equal(readVisualDebugFromParams(params), true);
});

test('explicit visual-debug=false can opt out while debug=true stays enabled', () => {
  const params = new URLSearchParams('?debug=true&visual-debug=false');

  assert.equal(readDebugParam(params), true);
  assert.equal(readVisualDebugFromParams(params), false);
});

test('doctor mode inherits visual debug from debug=true', () => {
  const settings = withWindowSearch('?debug=true', () => readDoctorSettings());

  assert.equal(settings.enabled, true);
  assert.equal(settings.mode, 'live');
  assert.equal(settings.visual, true);
  assert.equal(settings.source, 'url');
});

test('client visual debug ignores persisted debug values without a URL flag', () => {
  const enabled = withWindowContext('', (key) => (
    key === 'nex-note:debug' || key === 'nex-note:visual-debug' ? 'true' : null
  ), () => readClientVisualDebugEnabled());

  assert.equal(enabled, false);
});

test('client visual debug ignores NEXT_PUBLIC_DEBUG without a URL flag', () => {
  const originalDebug = process.env.NEXT_PUBLIC_DEBUG;
  const originalVisualDebug = process.env.NEXT_PUBLIC_VISUAL_DEBUG;
  process.env.NEXT_PUBLIC_DEBUG = 'true';
  process.env.NEXT_PUBLIC_VISUAL_DEBUG = 'true';

  try {
    const enabled = withWindowSearch('', () => readClientVisualDebugEnabled());
    assert.equal(enabled, false);
  } finally {
    process.env.NEXT_PUBLIC_DEBUG = originalDebug;
    process.env.NEXT_PUBLIC_VISUAL_DEBUG = originalVisualDebug;
  }
});
