const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');

const COMMON_EXECUTABLE_DIRECTORIES = process.platform === 'darwin'
  ? [
      '/opt/homebrew/bin',
      '/usr/local/bin',
      '/usr/bin',
      '/bin',
      '/usr/sbin',
      '/sbin',
    ]
  : process.platform === 'win32'
    ? []
    : [
        '/usr/local/bin',
        '/usr/bin',
        '/bin',
        '/usr/local/sbin',
        '/usr/sbin',
        '/sbin',
      ];

function uniquePathDirectories(directories) {
  const seen = new Set();
  return directories.filter((directory) => {
    if (!directory || seen.has(directory)) return false;
    seen.add(directory);
    return true;
  });
}

function getEnvPath(env = process.env) {
  return env.PATH || env.Path || '';
}

function getHomebrewPrefixDirectories(env = process.env) {
  if (process.platform !== 'darwin') return [];
  const home = env.HOME || os.homedir();
  return [
    home ? path.join(home, '.homebrew', 'bin') : '',
    '/opt/homebrew/bin',
    '/usr/local/bin',
  ];
}

function buildExecutablePath(env = process.env) {
  return uniquePathDirectories([
    ...getHomebrewPrefixDirectories(env),
    ...getEnvPath(env).split(path.delimiter),
    ...COMMON_EXECUTABLE_DIRECTORIES,
  ]).join(path.delimiter);
}

function buildChildProcessEnv(extra = {}, baseEnv = process.env) {
  const env = {
    ...baseEnv,
    ...extra,
  };
  const executablePath = buildExecutablePath(env);
  env.PATH = executablePath;
  if (process.platform === 'win32') {
    env.Path = executablePath;
  }
  return env;
}

function getCommandExtensions() {
  if (process.platform !== 'win32') return [''];
  return (process.env.PATHEXT || '.COM;.EXE;.BAT;.CMD')
    .split(';')
    .filter(Boolean)
    .map((extension) => extension.toLowerCase());
}

async function pathExists(filePath) {
  try {
    await fs.access(filePath);
    return true;
  } catch {
    return false;
  }
}

async function resolveExecutable(command, env = process.env) {
  if (command.includes(path.sep) || (path.posix.sep !== path.sep && command.includes(path.posix.sep))) {
    return (await pathExists(command)) ? command : null;
  }

  const extensions = getCommandExtensions();
  for (const directory of buildExecutablePath(env).split(path.delimiter)) {
    if (!directory) continue;
    for (const extension of extensions) {
      const candidate = path.join(directory, command.endsWith(extension) ? command : `${command}${extension}`);
      if (await pathExists(candidate)) return candidate;
    }
  }

  return null;
}

function decideLocalBuildFreshness({ buildFingerprint, localFingerprint }) {
  if (!buildFingerprint) return { action: 'refresh', reason: 'missing-build-fingerprint' };
  if (!localFingerprint) return { action: 'run', reason: 'unavailable-local-fingerprint' };
  if (buildFingerprint !== localFingerprint) return { action: 'refresh', reason: 'stale-local-build' };
  return { action: 'run', reason: 'fresh-local-build' };
}

function isAllowedRendererPermission(permission, requestingUrl, rendererUrl, details = {}) {
  // Chromium performs both MIDI permission checks even when the renderer asks
  // for non-SysEx access. The renderer still requests `sysex: false`, so the
  // Web MIDI API does not expose system-exclusive access to the app.
  if (!['midi', 'midiSysex', 'media', 'clipboard-sanitized-write', 'fullscreen'].includes(permission)) return false;
  if (
    permission === 'media'
    && Array.isArray(details.mediaTypes)
    && details.mediaTypes.some((mediaType) => mediaType !== 'audio')
  ) return false;
  try {
    const requesting = new URL(requestingUrl);
    const renderer = new URL(rendererUrl);
    return requesting.origin === renderer.origin
      && ['127.0.0.1', 'localhost', '[::1]'].includes(requesting.hostname);
  } catch {
    return false;
  }
}

// Linux hides the native menu bar, which also disables menu accelerators. These helpers let the main
// process match key events against menu accelerators itself.
function parseAccelerator(accelerator) {
  if (typeof accelerator !== 'string' || !accelerator) return null;
  const parsed = { key: '', ctrl: false, shift: false, alt: false };
  for (const token of accelerator.split('+')) {
    const lower = token.toLowerCase();
    if (lower === 'commandorcontrol' || lower === 'cmdorctrl' || lower === 'ctrl' || lower === 'control') parsed.ctrl = true;
    else if (lower === 'shift') parsed.shift = true;
    else if (lower === 'alt' || lower === 'option') parsed.alt = true;
    else parsed.key = lower === 'plus' ? '+' : lower;
  }
  // "Ctrl++" splits into empty tokens: treat a trailing empty token as the plus key.
  if (!parsed.key && accelerator.endsWith('+')) parsed.key = '+';
  return parsed.key ? parsed : null;
}

function acceleratorMatchesInput(parsed, input) {
  if (!parsed || !input || input.type !== 'keyDown') return false;
  if (Boolean(input.control) !== parsed.ctrl || Boolean(input.alt) !== parsed.alt || input.meta) return false;
  const key = String(input.key || '').toLowerCase();
  const symbolKey = ['+', '-', '='].includes(parsed.key);
  if (!symbolKey && Boolean(input.shift) !== parsed.shift) return false;
  if (parsed.key === '+') return key === '+' || key === '=';
  return key === parsed.key;
}

module.exports = {
  acceleratorMatchesInput,
  parseAccelerator,
  buildChildProcessEnv,
  buildExecutablePath,
  decideLocalBuildFreshness,
  isAllowedRendererPermission,
  pathExists,
  resolveExecutable,
  uniquePathDirectories,
};
