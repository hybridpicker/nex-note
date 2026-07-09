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

function decidePackagedBuildFreshness({ buildCommit, buildDirty, latestDevelCommit }) {
  if (buildDirty) {
    return {
      action: 'run',
      reason: 'dirty-local-build',
    };
  }

  if (!buildCommit || buildCommit !== latestDevelCommit) {
    return {
      action: 'rebuild',
      reason: !buildCommit ? 'missing-build-commit' : 'stale-build-commit',
    };
  }

  return {
    action: 'run',
    reason: 'fresh-build',
  };
}

function isAllowedRendererPermission(permission, requestingUrl, rendererUrl) {
  // Chromium performs both MIDI permission checks even when the renderer asks
  // for non-SysEx access. The renderer still requests `sysex: false`, so the
  // Web MIDI API does not expose system-exclusive access to the app.
  if (!['midi', 'midiSysex', 'clipboard-sanitized-write', 'fullscreen'].includes(permission)) return false;
  try {
    const requesting = new URL(requestingUrl);
    const renderer = new URL(rendererUrl);
    return requesting.origin === renderer.origin
      && ['127.0.0.1', 'localhost', '[::1]'].includes(requesting.hostname);
  } catch {
    return false;
  }
}

module.exports = {
  buildChildProcessEnv,
  buildExecutablePath,
  decidePackagedBuildFreshness,
  isAllowedRendererPermission,
  pathExists,
  resolveExecutable,
  uniquePathDirectories,
};
