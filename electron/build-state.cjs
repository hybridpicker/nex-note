const { createHash } = require('node:crypto');
const { execFileSync } = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');

const FINGERPRINT_VERSION = 1;
const LOCAL_ENV_FILES = [
  '.env',
  '.env.local',
  '.env.development',
  '.env.development.local',
  '.env.production',
  '.env.production.local',
  '.env.test',
  '.env.test.local',
];

function git(root, args, options = {}) {
  return execFileSync('git', args, {
    cwd: root,
    encoding: options.encoding === 'buffer' ? null : (options.encoding ?? 'utf8'),
    stdio: ['ignore', 'pipe', 'pipe'],
    maxBuffer: 64 * 1024 * 1024,
  });
}

function hashFile(hash, root, relativePath) {
  const absolutePath = path.join(root, relativePath);
  if (!fs.existsSync(absolutePath)) return;
  const stats = fs.lstatSync(absolutePath);
  hash.update(`file\0${relativePath}\0`);
  if (stats.isSymbolicLink()) {
    hash.update(`symlink\0${fs.readlinkSync(absolutePath)}\0`);
  } else if (stats.isFile()) {
    hash.update(fs.readFileSync(absolutePath));
  } else {
    hash.update(`unsupported\0${stats.mode}\0`);
  }
  hash.update('\0');
}

function getLocalBuildState(root) {
  const gitCommit = git(root, ['rev-parse', 'HEAD']).trim();
  const gitBranch = git(root, ['branch', '--show-current']).trim();
  const status = git(root, ['status', '--porcelain=v1', '--untracked-files=all']);
  const diff = git(root, ['diff', '--binary', '--no-ext-diff', 'HEAD', '--'], { encoding: 'buffer' });
  const untracked = git(root, ['ls-files', '--others', '--exclude-standard', '-z'])
    .split('\0')
    .filter(Boolean)
    .sort();
  const hash = createHash('sha256');

  hash.update(`nex-note-local-build-state-v${FINGERPRINT_VERSION}\0`);
  hash.update(`commit\0${gitCommit}\0`);
  hash.update('diff\0');
  hash.update(diff);
  hash.update('\0');
  for (const relativePath of untracked) hashFile(hash, root, relativePath);
  for (const relativePath of LOCAL_ENV_FILES) hashFile(hash, root, relativePath);

  return {
    fingerprintVersion: FINGERPRINT_VERSION,
    sourceFingerprint: hash.digest('hex'),
    gitCommit,
    gitBranch,
    dirty: Boolean(status.trim()),
  };
}

function describeBuildState(state) {
  const shortCommit = state.gitCommit ? state.gitCommit.slice(0, 8) : 'unknown';
  const localSuffix = state.dirty ? '+local' : '';
  return `${state.gitBranch || 'detached'}@${shortCommit}${localSuffix}`;
}

module.exports = {
  describeBuildState,
  getLocalBuildState,
};
