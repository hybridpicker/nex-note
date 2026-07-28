#!/usr/bin/env node

import { copyFile, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';
import { injectIpadServerUrl } from './ipad-dev-helpers.mjs';

const root = process.cwd();
const infoPlistPath = path.join(root, 'ios', 'App', 'App', 'Info.plist');
const projectPath = path.join(root, 'ios', 'App', 'App.xcodeproj', 'project.pbxproj');
const appIconPath = path.join(
  root,
  'ios',
  'App',
  'App',
  'Assets.xcassets',
  'AppIcon.appiconset',
  'AppIcon-512@2x.png',
);
const sourceIconPath = path.join(root, 'assets', 'app-icon.png');
const capacitorConfigPath = path.join(root, 'ios', 'App', 'App', 'capacitor.config.json');
const connectionErrorPath = path.join(root, 'ios', 'App', 'App', 'public', 'connection-error.html');

function insertPlistEntries(source) {
  const entries = [];
  if (!source.includes('<key>NSAppTransportSecurity</key>')) {
    entries.push(
      '\t<key>NSAppTransportSecurity</key>',
      '\t<dict>',
      '\t\t<key>NSAllowsLocalNetworking</key>',
      '\t\t<true/>',
      '\t</dict>',
    );
  }
  if (!source.includes('<key>NSLocalNetworkUsageDescription</key>')) {
    entries.push(
      '\t<key>NSLocalNetworkUsageDescription</key>',
      '\t<string>Nex Note connects to the development server on this Mac during private iPad testing.</string>',
    );
  }
  if (!source.includes('<key>NSMicrophoneUsageDescription</key>')) {
    entries.push(
      '\t<key>NSMicrophoneUsageDescription</key>',
      '\t<string>Nex Note uses the microphone to detect played pitches and enter notes into your score.</string>',
    );
  }
  if (entries.length === 0) return source;
  return source.replace('</dict>', `${entries.join('\n')}\n</dict>`);
}

async function main() {
  const originalPlist = await readFile(infoPlistPath, 'utf8');
  const configuredPlist = insertPlistEntries(originalPlist);
  if (configuredPlist !== originalPlist) {
    await writeFile(infoPlistPath, configuredPlist);
  }

  const originalProject = await readFile(projectPath, 'utf8');
  const packageJson = JSON.parse(await readFile(path.join(root, 'package.json'), 'utf8'));
  const configuredProject = originalProject
    .replace(/TARGETED_DEVICE_FAMILY = "?1,2"?;/g, 'TARGETED_DEVICE_FAMILY = 2;')
    .replace(/MARKETING_VERSION = [^;]+;/g, `MARKETING_VERSION = ${packageJson.version};`);
  if (configuredProject !== originalProject) {
    await writeFile(projectPath, configuredProject);
  }

  const nativeConfig = JSON.parse(await readFile(capacitorConfigPath, 'utf8'));
  const serverUrl = nativeConfig.server?.url;
  if (typeof serverUrl === 'string' && serverUrl.trim()) {
    const connectionErrorTemplate = await readFile(connectionErrorPath, 'utf8');
    await writeFile(
      connectionErrorPath,
      injectIpadServerUrl(connectionErrorTemplate, serverUrl),
    );
  }

  await copyFile(sourceIconPath, appIconPath);
  console.log('Configured the generated iOS project for iPad-only private testing.');
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
