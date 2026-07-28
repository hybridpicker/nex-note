import type { CapacitorConfig } from '@capacitor/cli';
import { readFileSync } from 'node:fs';

const liveReloadOrigin = process.env.NEX_NOTE_IPAD_SERVER_URL?.trim();
const liveReloadUrl = liveReloadOrigin
  ? new URL('/nex-note-app/', liveReloadOrigin)
  : undefined;
const liveReloadHost = liveReloadUrl?.hostname;
const packageVersion = JSON.parse(
  readFileSync('package.json', 'utf8'),
).version as string;

const config: CapacitorConfig = {
  appId: 'app.nexnote.ipad',
  appName: 'Nex Note',
  webDir: '.native-ipad',
  appendUserAgent: ` NexNoteNative/${packageVersion}`,
  backgroundColor: '#f7f8fa',
  loggingBehavior: 'debug',
  ios: {
    contentInset: 'never',
    preferredContentMode: 'desktop',
    allowsLinkPreview: false,
    webContentsDebuggingEnabled: true,
  },
  plugins: {
    SystemBars: {
      style: 'LIGHT',
      hidden: false,
      animation: 'NONE',
    },
  },
  server: liveReloadUrl
    ? {
        url: liveReloadUrl.toString(),
        cleartext: liveReloadUrl.protocol === 'http:',
        allowNavigation: liveReloadHost ? [liveReloadHost] : [],
        errorPath: 'connection-error.html',
      }
    : undefined,
};

export default config;
