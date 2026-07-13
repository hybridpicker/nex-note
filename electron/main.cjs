const { app, BrowserWindow, Menu, dialog, ipcMain, shell } = require('electron');
const { execFile, fork, spawn } = require('node:child_process');
const fs = require('node:fs/promises');
const http = require('node:http');
const net = require('node:net');
const path = require('node:path');
const {
  buildChildProcessEnv,
  decidePackagedBuildFreshness,
  isAllowedRendererPermission,
  pathExists,
  resolveExecutable,
} = require('./launch-helpers.cjs');

const APP_NAME = 'Nex Note';

app.setName(APP_NAME);
app.commandLine.appendSwitch('force-renderer-accessibility');

let mainWindow = null;
let nextProcess = null;
let rendererReady = false;
let applicationMenu = null;
let develUpdateStarted = false;
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

function menuCommand(commandId, options = {}) {
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
  const isMac = process.platform === 'darwin';
  const isDev = isElectronDevRuntime();
  const redoAccelerator = isMac ? 'Shift+CommandOrControl+Z' : 'CommandOrControl+Y';
  const activeViewMode = menuState.activeViewMode || 'continuous-vertical';

  const fileMenu = {
    label: 'File',
    submenu: [
      menuCommand('file:new', { label: 'New Score', accelerator: 'CommandOrControl+N' }),
      {
        label: 'Open...',
        accelerator: 'CommandOrControl+O',
        click: () => {
          sendMenuCommand('file:open');
        },
      },
      { type: 'separator' },
      scoreMenuCommand('file:save', { label: 'Save', accelerator: 'CommandOrControl+S' }),
      scoreMenuCommand('file:saveAs', { label: 'Save As...', accelerator: 'Shift+CommandOrControl+S' }),
      coreScoreMenuCommand('file:saveProject', { label: 'Save Project (.nxn)' }),
      { type: 'separator' },
      scoreMenuCommand('file:exportMxl', { label: 'Export MusicXML / .mxl' }),
      scoreMenuCommand('file:exportAbc', { label: 'Export ABC' }),
      scoreMenuCommand('file:exportPracticePack', { label: 'Export Practice Pack' }),
      { type: 'separator' },
      scoreMenuCommand('file:closeScore', { label: 'Close Score' }),
      { role: 'close', label: 'Close Window' },
      ...(isMac ? [] : [{ type: 'separator' }, { role: 'quit', label: 'Quit' }]),
    ],
  };

  const editMenu = {
    label: 'Edit',
    submenu: [
      menuCommand('edit:undo', { label: 'Undo', accelerator: 'CommandOrControl+Z', enabled: menuState.hasScore && menuState.canUndo }),
      menuCommand('edit:redo', { label: 'Redo', accelerator: redoAccelerator, enabled: menuState.hasScore && menuState.canRedo }),
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
            { role: 'quit', label: `Quit ${APP_NAME}` },
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

async function execFileText(command, args, options = {}) {
  const env = buildChildProcessEnv({}, options.env || process.env);
  const resolvedCommand = await resolveExecutable(command, env);
  if (!resolvedCommand) {
    throw new Error(`Could not find executable "${command}" on PATH`);
  }

  return new Promise((resolve, reject) => {
    execFile(resolvedCommand, args, {
      encoding: 'utf8',
      timeout: 15000,
      maxBuffer: 1024 * 1024,
      ...options,
      env,
    }, (error, stdout, stderr) => {
      if (error) {
        error.stderr = stderr;
        reject(error);
        return;
      }
      resolve(String(stdout).trim());
    });
  });
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

async function updateToLatestDevelInBackground() {
  if (develUpdateStarted || isElectronDevRuntime()) return;

  try {
    const repoRoot = await findRepoRootForPackagedApp();
    if (!repoRoot) return;

    const [dirty, buildInfo] = await Promise.all([
      execFileText('git', ['-C', repoRoot, 'status', '--porcelain']),
      readBuildInfo(),
    ]);
    if (dirty) {
      console.log('[electron] Skipping devel update because the repository has local changes.');
      return;
    }

    await execFileText('git', ['-C', repoRoot, 'fetch', 'origin', 'devel:refs/remotes/origin/devel']);
    const latestDevelCommit = await execFileText('git', ['-C', repoRoot, 'rev-parse', 'origin/devel']);
    const freshness = decidePackagedBuildFreshness({
      buildCommit: typeof buildInfo?.gitCommit === 'string' ? buildInfo.gitCommit : null,
      buildDirty: Boolean(buildInfo?.dirty),
      latestDevelCommit,
    });
    if (freshness.action === 'run') return;

    const updaterEnv = buildChildProcessEnv({ NEX_NOTE_BACKGROUND_DEVEL_UPDATE: '1' });
    const npmCommand = await resolveExecutable(process.platform === 'win32' ? 'npm.cmd' : 'npm', updaterEnv);
    if (!npmCommand) {
      console.error('[electron] Cannot update to origin/devel: npm was not found.');
      return;
    }

    develUpdateStarted = true;
    const updater = spawn(npmCommand, ['run', 'electron:latest'], {
      cwd: repoRoot,
      detached: true,
      stdio: 'ignore',
      env: updaterEnv,
    });
    updater.once('error', (error) => {
      console.error('[electron] Could not start the origin/devel updater:', error);
      develUpdateStarted = false;
    });
    updater.unref();
    console.log('[electron] Updating to the latest origin/devel build in the background.');
  } catch (error) {
    // A Dock/Finder launch must remain usable when offline or when developer
    // tooling is unavailable. The next launch retries the background update.
    console.error('[electron] Could not check origin/devel for updates:', error);
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

async function startPackagedServer() {
  const port = await findOpenPort();
  const appPath = app.getAppPath();
  const standaloneDir = path.join(appPath, '.next', 'standalone');
  const serverPath = path.join(standaloneDir, 'server.js');
  const url = `http://127.0.0.1:${port}`;

  console.log(`[electron] Starting packaged Next server from ${standaloneDir}`);
  nextProcess = fork(serverPath, [], {
    cwd: standaloneDir,
    env: {
      ...process.env,
      HOSTNAME: '127.0.0.1',
      PORT: String(port),
      NODE_ENV: 'production',
    },
    stdio: 'ignore',
  });

  await waitForServer(url);
  return url;
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
    minWidth: 1120,
    minHeight: 760,
    title: APP_NAME,
    icon,
    backgroundColor: '#0f172a',
    show: false,
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      preload: path.join(__dirname, 'preload.cjs'),
      sandbox: true,
    },
  });

  const rendererSession = mainWindow.webContents.session;
  rendererSession.setPermissionCheckHandler((_webContents, permission, requestingOrigin, details) => (
    isAllowedRendererPermission(permission, details?.requestingUrl || requestingOrigin, url)
  ));
  rendererSession.setPermissionRequestHandler((webContents, permission, callback, details) => {
    callback(isAllowedRendererPermission(permission, details?.requestingUrl || webContents.getURL(), url));
  });

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
  rendererReady = true;
  await flushPendingOpenFiles();
}

ipcMain.handle('nex-note:open-file-dialog', async () => {
  await openFilesWithNativeDialog();
});

ipcMain.handle('nex-note:native-edit-command', (_event, command) => {
  if (!['cut', 'copy', 'paste'].includes(command)) return;
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
    createApplicationMenu();
    queueCommandLineFiles(process.argv.slice(1));
    await createWindow();
    void updateToLatestDevelInBackground();

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
  if (nextProcess && !nextProcess.killed) {
    nextProcess.kill();
  }
});
