import test from 'node:test';
import assert from 'node:assert/strict';

import { detectDownloadOs, readOsSignals } from '../lib/site/os-detection.ts';

const UA = {
  macSafari: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Safari/605.1.15',
  linuxFirefox: 'Mozilla/5.0 (X11; Linux x86_64; rv:132.0) Gecko/20100101 Firefox/132.0',
  windowsChrome: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0 Safari/537.36',
  android: 'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0 Mobile Safari/537.36',
  iphone: 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1',
  chromeOs: 'Mozilla/5.0 (X11; CrOS x86_64 14541.0.0) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0 Safari/537.36',
};

test('detects macOS and Linux desktops from the user agent', () => {
  assert.equal(detectDownloadOs({ userAgent: UA.macSafari, platform: 'MacIntel', maxTouchPoints: 0 }), 'mac');
  assert.equal(detectDownloadOs({ userAgent: UA.linuxFirefox, platform: 'Linux x86_64' }), 'linux');
});

test('treats Windows, mobile, ChromeOS and unknown clients as other', () => {
  assert.equal(detectDownloadOs({ userAgent: UA.windowsChrome, platform: 'Win32' }), 'other');
  assert.equal(detectDownloadOs({ userAgent: UA.android, platform: 'Linux armv8l' }), 'other');
  assert.equal(detectDownloadOs({ userAgent: UA.iphone, platform: 'iPhone' }), 'other');
  assert.equal(detectDownloadOs({ userAgent: UA.chromeOs }), 'other');
  assert.equal(detectDownloadOs({}), 'other');
});

test('an iPad with a desktop user agent is not offered the Mac download', () => {
  assert.equal(detectDownloadOs({ userAgent: UA.macSafari, platform: 'MacIntel', maxTouchPoints: 5 }), 'other');
});

test('prefers userAgentData.platform when the browser provides it', () => {
  assert.equal(detectDownloadOs({ uaDataPlatform: 'macOS', userAgent: UA.windowsChrome }), 'mac');
  assert.equal(detectDownloadOs({ uaDataPlatform: 'Linux', userAgent: UA.linuxFirefox }), 'linux');
  assert.equal(detectDownloadOs({ uaDataPlatform: 'Windows', userAgent: UA.macSafari }), 'other');
  assert.equal(detectDownloadOs({ uaDataPlatform: 'Android', userAgent: UA.android }), 'other');
});

test('readOsSignals copies navigator fields without throwing on missing data', () => {
  assert.deepEqual(readOsSignals(undefined), {});
  assert.deepEqual(
    readOsSignals({ userAgent: UA.macSafari, platform: 'MacIntel', maxTouchPoints: 0, userAgentData: { platform: 'macOS' } }),
    { userAgent: UA.macSafari, platform: 'MacIntel', uaDataPlatform: 'macOS', maxTouchPoints: 0 },
  );
});
