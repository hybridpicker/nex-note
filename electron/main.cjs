const { app, BrowserWindow, Menu, dialog, ipcMain, shell, utilityProcess } = require('electron');
const { spawn } = require('node:child_process');
const fs = require('node:fs/promises');
const http = require('node:http');
const net = require('node:net');
const path = require('node:path');
const {
  buildChildProcessEnv,
  decideLocalBuildFreshness,
  acceleratorMatchesInput,
  isAllowedRendererPermission,
  parseAccelerator,
  pathExists,
  resolveExecutable,
} = require('./launch-helpers.cjs');
const { describeBuildState, getLocalBuildState } = require('./build-state.cjs');

const APP_NAME = 'Nex Note';

const IS_LINUX = process.platform === 'linux';
// Omarchy/Hyprland is a tiling Wayland compositor: the window manager owns the
// frame, so use native Wayland and skip Chromium's client-side title bar and
// native menu bar unless NEX_NOTE_LINUX_FRAME=1 asks for them.
const LINUX_USE_FRAME = IS_LINUX && process.env.NEX_NOTE_LINUX_FRAME === '1';

app.setName(APP_NAME);
app.commandLine.appendSwitch('force-renderer-accessibility');
if (IS_LINUX) {
  app.commandLine.appendSwitch('ozone-platform-hint', 'auto');
  app.commandLine.appendSwitch('enable-features', 'WaylandWindowDecorations,UseOzonePlatform');
  app.commandLine.appendSwitch('enable-wayland-ime');
  app.setDesktopName('nex-note.desktop');
}

let mainWindow = null;
let nextProcess = null;
let rendererReady = false;
let applicationMenu = null;
let localRefreshStarted = false;
let packagedServerUrl = null;
let packagedServerRestartTimer = null;
let quitting = false;
const pendingOpenFilePaths = [];
const menuState = {
  hasScore: false,
  hasCoreDocument: false,
  canUndo: false,
  canRedo: false,
  hasSelection: false,
  activeViewMode: 'continuous-vertical',
  printView: false,
};

const SUPPORTED_OPEN_EXTENSIONS = new Set([
  '.nxn',
  '.pdf',
  '.png',
  '.jpg',
  '.jpeg',
  '.tif',
  '.tiff',
  '.webp',
  '.bmp',
  '.heic',
  '.heif',
  '.mxl',
  '.xml',
  '.musicxml',
  '.mscz',
  '.mid',
  '.midi',
  '.gp',
  '.gp4',
  '.gp5',
  '.gp6',
  '.gpx',
]);

const MIME_BY_EXTENSION = new Map([
  ['.nxn', 'application/vnd.nex-note.project+json'],
  ['.pdf', 'application/pdf'],
  ['.png', 'image/png'],
  ['.jpg', 'image/jpeg'],
  ['.jpeg', 'image/jpeg'],
  ['.tif', 'image/tiff'],
  ['.tiff', 'image/tiff'],
  ['.webp', 'image/webp'],
  ['.bmp', 'image/bmp'],
  ['.heic', 'image/heic'],
  ['.heif', 'image/heif'],
  ['.mxl', 'application/vnd.recordare.musicxml'],
  ['.xml', 'application/xml'],
  ['.musicxml', 'application/vnd.recordare.musicxml+xml'],
  ['.mscz', 'application/vnd.musescore'],
  ['.mid', 'audio/midi'],
  ['.midi', 'audio/midi'],
  ['.gp', 'application/octet-stream'],
  ['.gp4', 'application/octet-stream'],
  ['.gp5', 'application/octet-stream'],
  ['.gp6', 'application/octet-stream'],
  ['.gpx', 'application/octet-stream'],
]);

const TEMPLATE_EXTENSIONS = new Set(['.musicxml', '.nxn']);
const TEMPLATE_SAMPLE_EXTENSIONS = new Set(['.wav', '.aif', '.aiff', '.mp3', '.m4a', '.ogg', '.flac']);

function isSupportedOpenPath(filePath) {
  return SUPPORTED_OPEN_EXTENSIONS.has(path.extname(filePath).toLowerCase());
}

function isSupportedImageOpenPath(filePath) {
  return ['.png', '.jpg', '.jpeg', '.tif', '.tiff', '.webp', '.bmp', '.heic', '.heif']
    .includes(path.extname(filePath).toLowerCase());
}

function getUserTemplateDirectories() {
  const appData = app.getPath('appData');
  return [
    path.join(appData, 'Nex Note', 'Templates'),
    path.join(appData, 'nex-note', 'Templates'),
  ];
}

function isSafeTemplatePathSegment(value) {
  return typeof value === 'string'
    && value.length > 0
    && value !== '.'
    && value !== '..'
    && path.basename(value) === value;
}

async function readUserTemplateSample(payload) {
  const sourceLabel = payload?.sourceLabel;
  const directory = payload?.directory;
  const filename = payload?.filename;
  if (!isSafeTemplatePathSegment(sourceLabel)
    || !isSafeTemplatePathSegment(directory)
    || !isSafeTemplatePathSegment(filename)
    || !TEMPLATE_SAMPLE_EXTENSIONS.has(path.extname(filename).toLowerCase())) {
    throw new TypeError('Invalid local template sample path.');
  }

  const templateDirectory = getUserTemplateDirectories().find((candidate) => (
    path.basename(path.dirname(candidate)) === sourceLabel
  ));
  if (!templateDirectory) throw new Error('Local template source is unavailable.');

  const realTemplateDirectory = await fs.realpath(templateDirectory);
  const samplePath = await fs.realpath(path.join(realTemplateDirectory, directory, filename));
  if (!samplePath.startsWith(`${realTemplateDirectory}${path.sep}`)) {
    throw new Error('Local template sample resolved outside the template directory.');
  }
  const data = await fs.readFile(samplePath);
  return data.buffer.slice(data.byteOffset, data.byteOffset + data.byteLength);
}

async function readUserTemplateFolder(directoryPath) {
  let entries = [];
  try {
    entries = await fs.readdir(directoryPath, { withFileTypes: true });
  } catch (error) {
    if (error?.code === 'ENOENT') {
      return {
        sourceLabel: path.basename(path.dirname(directoryPath)),
        files: [],
      };
    }
    throw error;
  }

  const sourceLabel = path.basename(path.dirname(directoryPath));
  const files = [];
  let indexText;

  for (const entry of entries) {
    if (!entry.isFile()) continue;
    if (entry.name === 'template-index.json') {
      indexText = await fs.readFile(path.join(directoryPath, entry.name), 'utf8');
      continue;
    }
    if (!TEMPLATE_EXTENSIONS.has(path.extname(entry.name).toLowerCase())) continue;
    const content = await fs.readFile(path.join(directoryPath, entry.name), 'utf8');
    files.push({
      filename: entry.name,
      sourceLabel,
      content,
    });
  }

  return {
    sourceLabel,
    files,
    indexText,
  };
}

function queueOpenFile(filePath) {
  if (!filePath || !isSupportedOpenPath(filePath)) return;
  const resolved = path.resolve(filePath);
  if (!pendingOpenFilePaths.includes(resolved)) {
    pendingOpenFilePaths.push(resolved);
  }
  if (rendererReady) {
    void flushPendingOpenFiles();
  }
}

function queueCommandLineFiles(argv) {
  for (const arg of argv) {
    if (!arg || arg.startsWith('-')) continue;
    queueOpenFile(arg);
  }
}

async function sendOpenFileToRenderer(filePath) {
  if (!mainWindow || mainWindow.isDestroyed()) {
    queueOpenFile(filePath);
    return;
  }

  const ext = path.extname(filePath).toLowerCase();
  const data = await fs.readFile(filePath);
  const payload = {
    name: path.basename(filePath),
    type: MIME_BY_EXTENSION.get(ext) || 'application/octet-stream',
    base64: data.toString('base64'),
  };
  mainWindow.webContents.send('nex-note:open-file', payload);
}

async function sendOpenFileBatchToRenderer(filePaths) {
  if (!mainWindow || mainWindow.isDestroyed()) {
    for (const filePath of filePaths) {
      queueOpenFile(filePath);
    }
    return;
  }

  const files = await Promise.all(filePaths.map(async (filePath) => {
    const ext = path.extname(filePath).toLowerCase();
    const data = await fs.readFile(filePath);
    return {
      name: path.basename(filePath),
      type: MIME_BY_EXTENSION.get(ext) || 'application/octet-stream',
      base64: data.toString('base64'),
    };
  }));

  const parentDirectories = [...new Set(filePaths.map((filePath) => path.dirname(filePath)))];
  const batchName = parentDirectories.length === 1
    ? path.basename(parentDirectories[0])
    : `${path.basename(filePaths[0], path.extname(filePaths[0]))}-${filePaths.length}-pages`;

  mainWindow.webContents.send('nex-note:open-file', {
    name: batchName,
    files,
  });
}

async function flushPendingOpenFiles() {
  if (!rendererReady || !mainWindow || mainWindow.isDestroyed()) return;
  while (pendingOpenFilePaths.length > 0) {
    const filePath = pendingOpenFilePaths.shift();
    try {
      await sendOpenFileToRenderer(filePath);
    } catch (error) {
      console.error(`Could not open ${filePath} in Nex Note:`, error);
    }
  }
}

function sendMenuCommand(commandId) {
  if (!mainWindow || mainWindow.isDestroyed()) return;
  mainWindow.webContents.send('nex-note:menu-command', commandId);
}

function performNativeEditCommand(command) {
  if (!mainWindow || mainWindow.isDestroyed()) return;
  if (command === 'undo' || command === 'redo') {
    mainWindow.webContents[command]();
    return;
  }
  if (command === 'cut') {
    mainWindow.webContents.cut();
    return;
  }
  if (command === 'copy') {
    mainWindow.webContents.copy();
    return;
  }
  if (command === 'paste') {
    mainWindow.webContents.paste();
  }
}

async function openFilesWithNativeDialog() {
  if (!mainWindow || mainWindow.isDestroyed()) return;

  const result = await dialog.showOpenDialog(mainWindow, {
    title: 'Open Score',
    properties: ['openFile', 'multiSelections'],
    filters: [
      { name: 'Supported score and project files', extensions: [...SUPPORTED_OPEN_EXTENSIONS].map((ext) => ext.slice(1)) },
      { name: 'Nex Note projects', extensions: ['nxn'] },
      { name: 'MusicXML', extensions: ['mxl', 'xml', 'musicxml'] },
      { name: 'Images and PDFs', extensions: ['pdf', 'png', 'jpg', 'jpeg', 'tif', 'tiff', 'webp', 'bmp', 'heic', 'heif'] },
      { name: 'MIDI and notation imports', extensions: ['mscz', 'mid', 'midi', 'gp', 'gp4', 'gp5', 'gp6', 'gpx'] },
      { name: 'All files', extensions: ['*'] },
    ],
  });

  if (result.canceled) return;
  const supportedPaths = result.filePaths.filter(isSupportedOpenPath);
  if (supportedPaths.length > 1 && supportedPaths.every(isSupportedImageOpenPath)) {
    await sendOpenFileBatchToRenderer(supportedPaths);
    return;
  }

  for (const filePath of supportedPaths) {
    queueOpenFile(filePath);
  }
  await flushPendingOpenFiles();
}

// Linux hides the native menu bar, which disables menu accelerators. Commands matching this pattern also
// get a key handler in the main process; editing keys (undo/copy/paste/delete) stay with the page.
const LINUX_SHORTCUT_COMMANDS = /^(file:(new|open|save|saveAs|exportPdf)|view:(zoomIn|zoomOut|resetZoom)|help:commandCenter|edit:find)$/;
let linuxShortcuts = [];

function menuCommand(commandId, options = {}) {
  if (IS_LINUX && options.accelerator && LINUX_SHORTCUT_COMMANDS.test(commandId)) {
    const parsed = parseAccelerator(options.accelerator);
    if (parsed) linuxShortcuts.push({ parsed, commandId, enabled: options.enabled !== false });
  }
  return {
    ...options,
    click: () => {
      sendMenuCommand(commandId);
    },
  };
}

function scoreMenuCommand(commandId, options = {}) {
  return menuCommand(commandId, {
    enabled: menuState.hasScore,
    ...options,
  });
}

function coreScoreMenuCommand(commandId, options = {}) {
  return menuCommand(commandId, {
    enabled: menuState.hasCoreDocument,
    ...options,
  });
}

function buildApplicationMenuTemplate() {
  linuxShortcuts = [];
  const isMac = process.platform === 'darwin';
  const isDev = isElectronDevRuntime();
  const redoAccelerator = isMac ? 'Shift+CommandOrControl+Z' : 'CommandOrControl+Y';
  const activeViewMode = menuState.activeViewMode || 'continuous-vertical';

  const fileMenu = {
    label: 'File',
    submenu: [
      menuCommand('file:new', { label: 'New Score', accelerator: 'CommandOrControl+N' }),
      menuCommand('file:open', { label: 'Open...', accelerator: 'CommandOrControl+O' }),
      { type: 'separator' },
      scoreMenuCommand('file:save', { label: 'Save', accelerator: 'CommandOrControl+S' }),
      scoreMenuCommand('file:saveAs', { label: 'Save As...', accelerator: 'Shift+CommandOrControl+S' }),
      coreScoreMenuCommand('file:saveProject', { label: 'Save Project (.nxn)' }),
      { type: 'separator' },
      scoreMenuCommand('file:exportMxl', { label: 'Export MusicXML / .mxl' }),
      scoreMenuCommand('file:exportAbc', { label: 'Export ABC' }),
      scoreMenuCommand('file:exportParts', { label: 'Export All Parts (ZIP)' }),
      scoreMenuCommand('file:exportPdf', { label: 'Export PDF...', accelerator: 'Shift+CommandOrControl+E' }),
      scoreMenuCommand('file:exportPracticePack', { label: 'Export Practice Pack' }),
      { type: 'separator' },
      scoreMenuCommand('file:closeScore', { label: 'Close Score' }),
      { role: 'close', label: 'Close Window' },
      ...(isMac ? [] : [{ type: 'separator' }, {
        role: 'quit',
        label: 'Quit',
        accelerator: 'CommandOrControl+Q',
      }]),
    ],
  };

  const editMenu = {
    label: 'Edit',
    submenu: [
      // Native text history can exist even when score history is empty.
      // The renderer routes these commands using the current focus.
      menuCommand('edit:undo', { label: 'Undo', accelerator: 'CommandOrControl+Z', enabled: true }),
      menuCommand('edit:redo', { label: 'Redo', accelerator: redoAccelerator, enabled: true }),
      { type: 'separator' },
      menuCommand('edit:cut', { label: 'Cut', accelerator: 'CommandOrControl+X', enabled: menuState.hasSelection }),
      menuCommand('edit:copy', { label: 'Copy', accelerator: 'CommandOrControl+C', enabled: menuState.hasSelection }),
      menuCommand('edit:paste', { label: 'Paste', accelerator: 'CommandOrControl+V', enabled: menuState.hasScore }),
      menuCommand('edit:duplicateSelection', { label: 'Duplicate Selection', accelerator: 'CommandOrControl+D', enabled: menuState.hasSelection }),
      menuCommand('edit:deleteSelectedNote', { label: 'Delete Selected Note', accelerator: 'Delete', enabled: menuState.hasSelection }),
      { type: 'separator' },
      { role: 'selectAll', label: 'Select All', accelerator: 'CommandOrControl+A' },
      scoreMenuCommand('edit:find', { label: 'Find / Go To', accelerator: 'CommandOrControl+F' }),
    ],
  };

  const viewMenu = {
    label: 'View',
    submenu: [
      scoreMenuCommand('view:toggleNavigator', { label: 'Toggle Navigator' }),
      scoreMenuCommand('view:toggleInspector', { label: 'Toggle Inspector' }),
      scoreMenuCommand('view:toggleAssistant', { label: 'Toggle Assistant' }),
      { type: 'separator' },
      scoreMenuCommand('view:zoomIn', { label: 'Zoom In', accelerator: 'CommandOrControl+Plus' }),
      scoreMenuCommand('view:zoomOut', { label: 'Zoom Out', accelerator: 'CommandOrControl+-' }),
      scoreMenuCommand('view:resetZoom', { label: 'Reset Zoom', accelerator: 'CommandOrControl+0' }),
      { type: 'separator' },
      scoreMenuCommand('view:page', { label: 'Page View', type: 'checkbox', checked: activeViewMode === 'page' }),
      scoreMenuCommand('view:continuousVertical', { label: 'Continuous Vertical View', type: 'checkbox', checked: activeViewMode === 'continuous-vertical' }),
      scoreMenuCommand('view:continuousHorizontal', { label: 'Continuous Horizontal View', type: 'checkbox', checked: activeViewMode === 'continuous-horizontal' }),
      scoreMenuCommand('view:togglePrintView', { label: menuState.printView ? 'Edit View' : 'Print View' }),
      {
        label: 'Notation Font',
        submenu: [
          { label: 'Bravura (default)', value: 'bravura' },
          { label: 'Petaluma (handwritten)', value: 'petaluma' },
          { label: 'Gonville', value: 'gonville' },
        ].map(({ label, value }) => ({ label, click: () => { void setNotationFont(value); } })),
      },
      ...(isDev
        ? [
            { type: 'separator' },
            { role: 'reload', label: 'Reload' },
            { role: 'forceReload', label: 'Force Reload' },
            { role: 'toggleDevTools', label: 'Toggle Developer Tools' },
          ]
        : []),
      { type: 'separator' },
      { role: 'togglefullscreen', label: 'Toggle Full Screen' },
    ],
  };

  const windowMenu = {
    label: 'Window',
    submenu: [
      { role: 'minimize', label: 'Minimize' },
      { role: 'zoom', label: 'Zoom' },
      { role: 'close', label: 'Close' },
      ...(isMac ? [{ type: 'separator' }, { role: 'front', label: 'Bring All to Front' }] : []),
    ],
  };

  const helpMenu = {
    label: 'Help',
    submenu: [
      menuCommand('help:commandCenter', { label: 'Search Commands', accelerator: 'CommandOrControl+K' }),
      ...(isMac ? [] : [{ type: 'separator' }, { role: 'about', label: `About ${APP_NAME}` }]),
    ],
  };

  return [
    ...(isMac
      ? [{
          label: APP_NAME,
          submenu: [
            { role: 'about', label: `About ${APP_NAME}` },
            { type: 'separator' },
            { role: 'services', label: 'Services' },
            { type: 'separator' },
            { role: 'hide', label: `Hide ${APP_NAME}` },
            { role: 'hideOthers', label: 'Hide Others' },
            { role: 'unhide', label: 'Show All' },
            { type: 'separator' },
            {
              role: 'quit',
              label: `Quit ${APP_NAME}`,
              accelerator: 'CommandOrControl+Q',
            },
          ],
        }]
      : []),
    fileMenu,
    editMenu,
    viewMenu,
    windowMenu,
    helpMenu,
  ];
}

function isElectronDevRuntime() {
  return process.env.NEX_NOTE_ELECTRON_DEV === '1' || !app.isPackaged;
}

function getRootDir() {
  return isElectronDevRuntime() ? path.resolve(__dirname, '..') : app.getAppPath();
}

async function findRepoRootForPackagedApp() {
  if (isElectronDevRuntime()) return null;

  let current = app.getAppPath();
  for (let depth = 0; depth < 10; depth += 1) {
    const packageJsonPath = path.join(current, 'package.json');
    if (await pathExists(path.join(current, '.git')) && await pathExists(packageJsonPath)) {
      try {
        const packageJson = JSON.parse(await fs.readFile(packageJsonPath, 'utf8'));
        if (packageJson?.name === 'nex-note') return current;
      } catch {
        return null;
      }
    }

    const parent = path.dirname(current);
    if (parent === current) break;
    current = parent;
  }

  return null;
}

async function readBuildInfo() {
  const buildInfoPath = path.join(app.getAppPath(), '.next', 'standalone', 'nex-note-build.json');
  try {
    return JSON.parse(await fs.readFile(buildInfoPath, 'utf8'));
  } catch {
    return null;
  }
}

function createLocalRefreshWindow(buildInfo, localBuildState) {
  const icon = getAssetPath(process.platform === 'darwin' ? 'Icon-nexnote.icns' : 'app-icon.png');
  mainWindow = new BrowserWindow({
    width: 580,
    height: 320,
    resizable: false,
    maximizable: false,
    title: `${APP_NAME} — Refreshing`,
    icon,
    backgroundColor: '#f8fafc',
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });
  const packagedState = buildInfo?.gitCommit
    ? `${String(buildInfo.gitBranch || 'unknown')}@${String(buildInfo.gitCommit).slice(0, 8)}`
    : 'legacy build';
  const localState = describeBuildState(localBuildState);
  const html = `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8">
    <meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'">
    <title>Nex Note — Refreshing</title>
    <style>
      body { margin: 0; font-family: -apple-system, BlinkMacSystemFont, sans-serif; background: #f8fafc; color: #0f172a; }
      main { min-height: 100vh; display: grid; place-content: center; gap: 14px; padding: 36px; box-sizing: border-box; text-align: center; }
      h1 { margin: 0; font-size: 24px; }
      p { margin: 0; color: #475569; line-height: 1.5; }
      code { font-family: ui-monospace, SFMono-Regular, monospace; font-size: 12px; }
      .bar { width: 380px; height: 6px; overflow: hidden; border-radius: 999px; background: #dbeafe; }
      .bar::after { content: ''; display: block; width: 45%; height: 100%; border-radius: inherit; background: #2563eb; animation: move 1.2s ease-in-out infinite alternate; }
      @keyframes move { from { transform: translateX(-15%); } to { transform: translateX(135%); } }
    </style>
  </head>
  <body><main>
    <h1>Refreshing the local devel app…</h1>
    <p>Tests and a production build are running before Nex Note restarts.</p>
    <div class="bar" aria-label="Refresh in progress"></div>
    <p><code>${packagedState} → ${localState}</code></p>
  </main></body>
</html>`;
  void mainWindow.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(html)}`);
}

async function ensurePackagedBuildMatchesLocalDevel() {
  if (localRefreshStarted || isElectronDevRuntime()) return false;

  try {
    const repoRoot = await findRepoRootForPackagedApp();
    if (!repoRoot) return false;

    const [buildInfo, localBuildState] = await Promise.all([
      readBuildInfo(),
      Promise.resolve().then(() => getLocalBuildState(repoRoot)),
    ]);
    if (localBuildState.gitBranch !== 'devel') {
      console.log(`[electron] Local app auto-refresh is disabled on ${localBuildState.gitBranch || 'detached HEAD'}.`);
      return false;
    }

    const freshness = decideLocalBuildFreshness({
      buildFingerprint: typeof buildInfo?.sourceFingerprint === 'string'
        ? buildInfo.sourceFingerprint
        : null,
      localFingerprint: localBuildState.sourceFingerprint,
    });
    if (freshness.action === 'run') return false;

    const updaterEnv = buildChildProcessEnv({ NEX_NOTE_STARTUP_LOCAL_REFRESH: '1' });
    const npmCommand = await resolveExecutable(process.platform === 'win32' ? 'npm.cmd' : 'npm', updaterEnv);
    if (!npmCommand) {
      dialog.showErrorBox(
        'Nex Note could not refresh',
        'npm was not found. Run npm run app from the nex-note repository.',
      );
      return false;
    }

    const logDirectory = path.join(repoRoot, '.nex');
    const logPath = path.join(logDirectory, 'electron-local-refresh.log');
    await fs.mkdir(logDirectory, { recursive: true });
    const logHandle = await fs.open(logPath, 'a');
    localRefreshStarted = true;
    createLocalRefreshWindow(buildInfo, localBuildState);
    const updater = spawn(npmCommand, ['run', 'electron:refresh'], {
      cwd: repoRoot,
      stdio: ['ignore', logHandle.fd, logHandle.fd],
      env: updaterEnv,
    });
    let updaterFinished = false;
    updater.once('error', async (error) => {
      if (updaterFinished) return;
      updaterFinished = true;
      await logHandle.close();
      localRefreshStarted = false;
      console.error('[electron] Could not start the local devel refresh:', error);
      dialog.showErrorBox('Nex Note could not refresh', `${String(error?.message || error)}\n\nLog: ${logPath}`);
      if (mainWindow && !mainWindow.isDestroyed()) mainWindow.close();
      createApplicationMenu();
      queueCommandLineFiles(process.argv.slice(1));
      await createWindow();
    });
    updater.once('exit', async (code) => {
      if (updaterFinished) return;
      updaterFinished = true;
      await logHandle.close();
      if (code === 0) {
        app.relaunch();
        app.exit(0);
        return;
      }

      localRefreshStarted = false;
      dialog.showErrorBox(
        'Local devel refresh failed',
        `Nex Note will open the last packaged build. Fix the reported test or build error, then run npm run app.\n\nLog: ${logPath}`,
      );
      if (mainWindow && !mainWindow.isDestroyed()) mainWindow.close();
      createApplicationMenu();
      queueCommandLineFiles(process.argv.slice(1));
      await createWindow();
    });
    return true;
  } catch (error) {
    console.error('[electron] Could not compare the packaged app with local devel:', error);
    return false;
  }
}

function getAssetPath(...segments) {
  return path.join(getRootDir(), 'assets', ...segments);
}

function findOpenPort() {
  return new Promise((resolve, reject) => {
    const server = net.createServer();
    server.on('error', reject);
    server.listen(0, '127.0.0.1', () => {
      const address = server.address();
      server.close(() => {
        if (address && typeof address === 'object') {
          resolve(address.port);
        } else {
          reject(new Error('Could not allocate a local port.'));
        }
      });
    });
  });
}

function waitForServer(url, timeoutMs = 60000) {
  const startedAt = Date.now();

  return new Promise((resolve, reject) => {
    const check = () => {
      const request = http.get(url, (response) => {
        response.resume();
        resolve();
      });

      request.on('error', () => {
        if (Date.now() - startedAt > timeoutMs) {
          reject(new Error(`Timed out waiting for ${url}`));
          return;
        }

        setTimeout(check, 500);
      });

      request.setTimeout(2000, () => {
        request.destroy();
      });
    };

    check();
  });
}

function isProcessAlive(pid) {
  if (!Number.isInteger(pid) || pid <= 0) return false;

  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

async function readActiveDevServer(rootDir) {
  const lockPath = path.join(rootDir, '.next', 'dev', 'lock');

  try {
    const raw = await fs.readFile(lockPath, 'utf8');
    const data = JSON.parse(raw);
    if (!isProcessAlive(data.pid)) return null;

    return typeof data.appUrl === 'string'
      ? data.appUrl
      : `http://${data.hostname ?? '127.0.0.1'}:${data.port ?? 3000}`;
  } catch {
    return null;
  }
}

function forwardPackagedServerOutput(stream, level) {
  stream?.setEncoding('utf8');
  stream?.on('data', (chunk) => {
    const message = String(chunk).trim();
    if (message) console[level](`[electron:next] ${message}`);
  });
}

async function launchPackagedServer(port) {
  const appPath = app.getAppPath();
  const standaloneDir = path.join(appPath, '.next', 'standalone');
  const serverPath = path.join(standaloneDir, 'server.js');
  const url = `http://127.0.0.1:${port}`;

  console.log(`[electron] Starting packaged Next server from ${standaloneDir}`);
  // Running process.execPath in Node mode starts another copy of the app
  // executable, which macOS can expose as a generic "exec" Dock item.
  // A utility process provides the same Node.js runtime without creating a
  // second visible application.
  const child = utilityProcess.fork(serverPath, [], {
    cwd: standaloneDir,
    env: {
      ...process.env,
      HOSTNAME: '127.0.0.1',
      PORT: String(port),
      NODE_ENV: 'production',
    },
    stdio: ['ignore', 'pipe', 'pipe'],
    serviceName: 'Nex Note Server',
  });
  nextProcess = child;
  packagedServerUrl = url;
  forwardPackagedServerOutput(child.stdout, 'log');
  forwardPackagedServerOutput(child.stderr, 'error');

  child.once('exit', (code, signal) => {
    if (nextProcess === child) nextProcess = null;
    if (quitting || isElectronDevRuntime()) return;
    console.error(`[electron] Packaged Next server exited (${signal ?? code ?? 'unknown'}); restarting.`);
    if (packagedServerRestartTimer) clearTimeout(packagedServerRestartTimer);
    packagedServerRestartTimer = setTimeout(() => {
      packagedServerRestartTimer = null;
      void launchPackagedServer(port).catch((error) => {
        console.error('[electron] Could not restart packaged Next server:', error);
      });
    }, 250);
  });

  child.once('error', (type, location, report) => {
    console.error('[electron] Packaged Next server process failed:', type, location, report);
  });

  await waitForServer(url);
  return url;
}

async function startPackagedServer() {
  if (nextProcess && isProcessAlive(nextProcess.pid) && packagedServerUrl) {
    return packagedServerUrl;
  }
  return launchPackagedServer(await findOpenPort());
}

async function startDevServer() {
  if (process.env.NEX_NOTE_ELECTRON_DEV_URL) {
    return process.env.NEX_NOTE_ELECTRON_DEV_URL;
  }

  const rootDir = getRootDir();
  const activeServerUrl = await readActiveDevServer(rootDir);
  if (activeServerUrl) {
    console.log(`[electron] Reusing active Next dev server at ${activeServerUrl}`);
    return activeServerUrl;
  }

  const port = await findOpenPort();
  const url = `http://localhost:${port}`;
  const nextCommand = path.join(rootDir, 'node_modules', '.bin', process.platform === 'win32' ? 'next.cmd' : 'next');

  console.log(`[electron] Starting Next dev server from ${rootDir} at ${url}`);
  nextProcess = spawn(nextCommand, ['dev', '--webpack', '--hostname', 'localhost', '--port', String(port)], {
    cwd: rootDir,
    env: buildChildProcessEnv(),
    stdio: 'inherit',
  });

  await waitForServer(url);
  return url;
}

function resolveRendererUrl(serverUrl) {
  const url = new URL(serverUrl);
  const isRootPath = url.pathname === '' || url.pathname === '/';

  if (isRootPath) {
    url.pathname = '/nex-note-app';
  }

  if (url.pathname === '/nex-note-app' && !url.searchParams.has('locale')) {
    url.searchParams.set('locale', 'en');
  }

  return url.toString();
}

async function setNotationFont(value) {
  if (!mainWindow || mainWindow.isDestroyed()) return;
  if (!['bravura', 'petaluma', 'gonville'].includes(value)) return;
  await mainWindow.webContents.executeJavaScript(
    `localStorage.setItem('nex-note.notationFont', ${JSON.stringify(value)})`,
  );
  await dialog.showMessageBox(mainWindow, {
    type: 'info',
    message: 'Notation font saved',
    detail: 'Restart Nex Note to apply the new notation font. Unsaved scores are not affected until then.',
  });
}

function createApplicationMenu() {
  applicationMenu = Menu.buildFromTemplate(buildApplicationMenuTemplate());
  Menu.setApplicationMenu(applicationMenu);
}

function updateApplicationMenuState(nextState) {
  Object.assign(menuState, {
    hasScore: Boolean(nextState?.hasScore),
    hasCoreDocument: Boolean(nextState?.hasCoreDocument),
    canUndo: Boolean(nextState?.canUndo),
    canRedo: Boolean(nextState?.canRedo),
    hasSelection: Boolean(nextState?.hasSelection),
    activeViewMode: typeof nextState?.activeViewMode === 'string' ? nextState.activeViewMode : menuState.activeViewMode,
    printView: Boolean(nextState?.printView),
  });
  createApplicationMenu();
}

async function createWindow() {
  const serverUrl = isElectronDevRuntime() ? await startDevServer() : await startPackagedServer();
  const url = resolveRendererUrl(serverUrl);
  const icon = getAssetPath(process.platform === 'darwin' ? 'Icon-nexnote.icns' : 'app-icon.png');
  rendererReady = false;

  mainWindow = new BrowserWindow({
    width: 1440,
    height: 980,
    // Tiled windows get arbitrary sizes; keep the minimum small on Linux.
    minWidth: IS_LINUX ? 640 : 1120,
    minHeight: IS_LINUX ? 480 : 760,
    title: APP_NAME,
    icon,
    backgroundColor: '#0f172a',
    show: false,
    ...(IS_LINUX ? { frame: LINUX_USE_FRAME, autoHideMenuBar: true } : {}),
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      preload: path.join(__dirname, 'preload.cjs'),
      sandbox: true,
    },
  });

  const rendererSession = mainWindow.webContents.session;
  rendererSession.setPermissionCheckHandler((_webContents, permission, requestingOrigin, details) => (
    isAllowedRendererPermission(permission, details?.requestingUrl || requestingOrigin, url, details)
  ));
  rendererSession.setPermissionRequestHandler((webContents, permission, callback, details) => {
    callback(isAllowedRendererPermission(permission, details?.requestingUrl || webContents.getURL(), url, details));
  });

  if (IS_LINUX) mainWindow.setMenuBarVisibility(false);

  if (IS_LINUX) {
    const quitShortcut = parseAccelerator('CommandOrControl+Q');
    mainWindow.webContents.on('before-input-event', (event, input) => {
      if (input.type !== 'keyDown') return;
      if (acceleratorMatchesInput(quitShortcut, input)) {
        event.preventDefault();
        app.quit();
        return;
      }
      const shortcut = linuxShortcuts.find((entry) => acceleratorMatchesInput(entry.parsed, input));
      if (!shortcut) return;
      event.preventDefault();
      if (shortcut.enabled) sendMenuCommand(shortcut.commandId);
    });
  }

  mainWindow.on('page-title-updated', (event) => {
    event.preventDefault();
    mainWindow.setTitle(APP_NAME);
  });

  mainWindow.once('ready-to-show', () => {
    mainWindow.setTitle(APP_NAME);
    mainWindow.show();
  });

  mainWindow.webContents.setWindowOpenHandler(({ url: targetUrl }) => {
    shell.openExternal(targetUrl);
    return { action: 'deny' };
  });

  await mainWindow.loadURL(url);
  // Files are flushed once the renderer reports that its open-file listener exists
  // (`nex-note:open-file-ready`); sending right after loadURL can beat React's hydration.
}

ipcMain.on('nex-note:open-file-ready', (event) => {
  if (!mainWindow || mainWindow.isDestroyed() || event.sender !== mainWindow.webContents) return;
  rendererReady = true;
  void flushPendingOpenFiles();
});

ipcMain.handle('nex-note:open-file-dialog', async () => {
  await openFilesWithNativeDialog();
});

ipcMain.handle('nex-note:export-pdf', async (_event, payload) => {
  if (!mainWindow || mainWindow.isDestroyed()) return { ok: false, reason: 'no-window' };
  const rawName = typeof payload?.suggestedName === 'string' ? payload.suggestedName : 'score';
  const safeName = path.basename(rawName).replace(/\.[^.]*$/, '').replace(/[^\p{L}\p{N} _.-]+/gu, '_').slice(0, 120) || 'score';
  const result = await dialog.showSaveDialog(mainWindow, {
    title: 'Export PDF',
    defaultPath: path.join(app.getPath('documents'), `${safeName}.pdf`),
    filters: [{ name: 'PDF', extensions: ['pdf'] }],
  });
  if (result.canceled || !result.filePath) return { ok: false, reason: 'canceled' };
  try {
    // Vector output: the score is SVG, fonts are embedded by Chromium; page size comes from the print CSS.
    const pdf = await mainWindow.webContents.printToPDF({
      preferCSSPageSize: true,
      printBackground: true,
      generateTaggedPDF: true,
    });
    await fs.writeFile(result.filePath, pdf);
    return { ok: true };
  } catch (error) {
    console.error('PDF export failed:', error);
    return { ok: false, reason: 'failed' };
  }
});

ipcMain.handle('nex-note:native-edit-command', (_event, command) => {
  if (!['cut', 'copy', 'paste', 'undo', 'redo'].includes(command)) return;
  performNativeEditCommand(command);
});

ipcMain.handle('nex-note:list-user-templates', async () => {
  return Promise.all(getUserTemplateDirectories().map(readUserTemplateFolder));
});

ipcMain.handle('nex-note:read-user-template-sample', async (_event, payload) => {
  return readUserTemplateSample(payload);
});

ipcMain.on('nex-note:update-menu-state', (_event, state) => {
  updateApplicationMenuState(state);
});

const singleInstanceLock = app.requestSingleInstanceLock();

if (!singleInstanceLock) {
  app.quit();
} else {
  app.on('second-instance', (_event, commandLine) => {
    queueCommandLineFiles(commandLine);
    if (mainWindow && !mainWindow.isDestroyed()) {
      if (mainWindow.isMinimized()) mainWindow.restore();
      mainWindow.focus();
      void flushPendingOpenFiles();
    }
  });

  app.on('open-file', (event, filePath) => {
    event.preventDefault();
    queueOpenFile(filePath);
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.focus();
    }
  });

  app.whenReady().then(async () => {
    app.setName(APP_NAME);
    if (typeof app.setAccessibilitySupportEnabled === 'function') {
      app.setAccessibilitySupportEnabled(true);
    }
    app.setAboutPanelOptions({
      applicationName: APP_NAME,
      applicationVersion: app.getVersion(),
    });
    if (process.platform === 'darwin' && app.dock) {
      app.dock.setIcon(getAssetPath('app-icon.png'));
    }
    if (await ensurePackagedBuildMatchesLocalDevel()) return;
    createApplicationMenu();
    queueCommandLineFiles(process.argv.slice(1));
    await createWindow();

    app.on('activate', async () => {
      if (BrowserWindow.getAllWindows().length === 0) {
        await createWindow();
      }
    });
  });
}

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

app.on('before-quit', () => {
  quitting = true;
  if (packagedServerRestartTimer) {
    clearTimeout(packagedServerRestartTimer);
    packagedServerRestartTimer = null;
  }
  if (nextProcess) {
    nextProcess.kill();
  }
});
