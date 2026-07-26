import { execFile, spawn } from 'node:child_process';
import fs from 'node:fs/promises';
import path from 'node:path';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);
const APP_NAME = 'Nex Note';
const APP_BUNDLE_ID = 'app.nex-note.desktop.dev';
const ELECTRON_EXECUTABLE_NAME = 'Electron';

async function pathExists(filePath) {
  try {
    await fs.access(filePath);
    return true;
  } catch {
    return false;
  }
}

async function setPlistValue(plistPath, key, value) {
  await execFileAsync('/usr/libexec/PlistBuddy', ['-c', `Set :${key} ${value}`, plistPath]);
}

async function setPlistString(plistPath, key, value) {
  try {
    await setPlistValue(plistPath, key, value);
  } catch {
    await execFileAsync('/usr/libexec/PlistBuddy', ['-c', `Add :${key} string ${value}`, plistPath]);
  }
}

async function prepareMacDevElectronApp() {
  const sourceApp = path.resolve('node_modules/electron/dist/Electron.app');
  const targetRoot = path.resolve('.nex/electron-dev');
  const targetApp = path.join(targetRoot, `${APP_NAME}.app`);
  const targetExecutable = path.join(targetApp, 'Contents/MacOS', APP_NAME);
  const targetPlist = path.join(targetApp, 'Contents/Info.plist');
  const stampPath = path.join(targetRoot, 'electron-dev-app.json');
  const electronVersion = (await fs.readFile(path.resolve('node_modules/electron/dist/version'), 'utf8')).trim();
  const stamp = JSON.stringify({
    sourceApp,
    appName: APP_NAME,
    bundleId: APP_BUNDLE_ID,
    electronVersion,
    copyMode: 'verbatim-symlinks-microphone',
    executableName: APP_NAME,
  }, null, 2);

  const existingStamp = await fs.readFile(stampPath, 'utf8').catch(() => null);
  if (existingStamp !== stamp || !(await pathExists(targetExecutable))) {
    await fs.rm(targetApp, { recursive: true, force: true });
    await fs.mkdir(targetRoot, { recursive: true });
    await fs.cp(sourceApp, targetApp, { recursive: true, preserveTimestamps: true, verbatimSymlinks: true });
    await fs.rename(path.join(targetApp, 'Contents/MacOS', ELECTRON_EXECUTABLE_NAME), targetExecutable);
    await setPlistValue(targetPlist, 'CFBundleName', APP_NAME);
    await setPlistValue(targetPlist, 'CFBundleDisplayName', APP_NAME);
    await setPlistValue(targetPlist, 'CFBundleExecutable', APP_NAME);
    await setPlistValue(targetPlist, 'CFBundleIdentifier', APP_BUNDLE_ID);
    await setPlistValue(targetPlist, 'LSApplicationCategoryType', 'public.app-category.music');
    await setPlistString(
      targetPlist,
      'NSMicrophoneUsageDescription',
      'Nex Note uses the microphone to detect played pitches and enter notes into your score.',
    );
    await fs.writeFile(stampPath, stamp);
  }

  return targetExecutable;
}

const electronCommand = process.platform === 'darwin'
  ? await prepareMacDevElectronApp()
  : process.platform === 'win32'
    ? 'node_modules\\.bin\\electron.cmd'
    : './node_modules/.bin/electron';

const child = spawn(electronCommand, ['.'], {
  cwd: process.cwd(),
  env: {
    ...process.env,
    NEX_NOTE_ELECTRON_DEV: '1',
  },
  stdio: 'inherit',
});

child.on('exit', (code, signal) => {
  if (signal) {
    process.kill(process.pid, signal);
    return;
  }

  process.exit(code ?? 0);
});
