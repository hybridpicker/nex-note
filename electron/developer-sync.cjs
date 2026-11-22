// Developer App (GLOSSARY.md): keeps the local `devel` checkout current with origin/devel, then the
// existing fingerprint check in main.cjs rebuilds the app. It only ever fast-forwards a clean
// working tree on `devel`; anything else is left alone and reported.

const { execFile } = require('node:child_process');

const DEVELOPER_SYNC_INTERVAL_MS = 60 * 60 * 1000;

function runGit(repoRoot, args, { timeoutMs = 60_000 } = {}) {
  return new Promise((resolve, reject) => {
    execFile('git', args, { cwd: repoRoot, timeout: timeoutMs, encoding: 'utf8', env: { ...process.env, GIT_TERMINAL_PROMPT: '0' } }, (error, stdout) => {
      if (error) reject(error);
      else resolve(String(stdout).trim());
    });
  });
}

function decideDeveloperSync({ branch, dirty, behind, ahead }) {
  if (branch !== 'devel') return { action: 'skip', reason: 'not-devel' };
  if (behind === 0) return { action: 'skip', reason: 'up-to-date' };
  if (dirty) return { action: 'skip', reason: 'dirty-working-tree' };
  if (ahead > 0) return { action: 'skip', reason: 'diverged' };
  return { action: 'fast-forward', reason: 'behind-origin' };
}

// Returns { changed, reason }. Network or git failures are reported, never thrown: the app must
// start even offline.
async function syncDeveloperCheckout(repoRoot, git = runGit) {
  try {
    const branch = await git(repoRoot, ['branch', '--show-current']);
    if (branch !== 'devel') return { changed: false, reason: 'not-devel' };
    await git(repoRoot, ['fetch', '--quiet', 'origin', 'devel']);
    const status = await git(repoRoot, ['status', '--porcelain=v1', '--untracked-files=no']);
    const counts = await git(repoRoot, ['rev-list', '--left-right', '--count', 'HEAD...origin/devel']);
    const [ahead, behind] = counts.split(/\s+/).map((value) => Number(value) || 0);
    const decision = decideDeveloperSync({ branch, dirty: Boolean(status), behind, ahead });
    if (decision.action !== 'fast-forward') return { changed: false, reason: decision.reason };
    await git(repoRoot, ['merge', '--ff-only', '--quiet', 'origin/devel']);
    return { changed: true, reason: decision.reason, commits: behind };
  } catch {
    return { changed: false, reason: 'git-failed' };
  }
}

// The command that rebuilds and reinstalls the Developer App on this platform.
function developerRefreshCommand(platform) {
  if (platform === 'linux') return { command: 'bash', args: ['linux/install.sh'] };
  return { command: 'npm', args: ['run', 'electron:refresh'] };
}

module.exports = {
  DEVELOPER_SYNC_INTERVAL_MS,
  decideDeveloperSync,
  developerRefreshCommand,
  syncDeveloperCheckout,
};
