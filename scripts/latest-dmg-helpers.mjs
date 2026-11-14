// Pure helpers for `npm run dmg:latest` (scripts/build-latest-dmg.mjs).
// Kept free of side effects so they can be unit-tested.

export const LATEST_DMG_NAME = 'Nex Note-latest.dmg';
export const MANIFEST_NAME = 'latest.json';
export const DEFAULT_KEEP = 3;

export function parseLatestDmgArgs(argv) {
  const options = {
    ref: 'HEAD',
    force: false,
    background: false,
    keep: DEFAULT_KEEP,
    keepWorktree: false,
  };

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === '--force') options.force = true;
    else if (arg === '--background') options.background = true;
    else if (arg === '--keep-worktree') options.keepWorktree = true;
    else if (arg === '--ref') {
      const value = argv[index + 1];
      if (!value || value.startsWith('--')) throw new Error('--ref needs a commit, branch or tag');
      options.ref = value;
      index += 1;
    } else if (arg === '--keep') {
      const value = Number(argv[index + 1]);
      if (!Number.isInteger(value) || value < 1) throw new Error('--keep needs a whole number of at least 1');
      options.keep = value;
      index += 1;
    } else {
      throw new Error(`unknown option: ${arg}`);
    }
  }

  return options;
}

// Branch names may contain slashes and other characters that do not belong in a file name.
export function sanitizeLabel(label) {
  const cleaned = String(label ?? '')
    .replace(/[^A-Za-z0-9._-]+/g, '-')
    .replace(/^-+|-+$/g, '');
  return cleaned || 'detached';
}

export function dmgFileName({ version, branch, commit, arch }) {
  return `Nex Note-${version}-${sanitizeLabel(branch)}-${commit.slice(0, 8)}-${arch}.dmg`;
}

export function isManifestCurrent(manifest, { commit, existingFiles }) {
  if (!manifest || manifest.commit !== commit) return false;
  if (typeof manifest.dmg !== 'string') return false;
  const files = new Set(existingFiles);
  return files.has(manifest.dmg) && files.has(LATEST_DMG_NAME);
}

// `builds` is the manifest history, newest first. Returns the file names that fall out of the
// retention window and are no longer referenced by a build that stays.
export function selectDmgsToPrune(builds, keep) {
  const kept = new Set(builds.slice(0, keep).map((build) => build.dmg));
  return [...new Set(builds.slice(keep).map((build) => build.dmg))]
    .filter((name) => typeof name === 'string' && !kept.has(name));
}

export function updateBuildHistory(previousBuilds, build, keep) {
  const rest = (Array.isArray(previousBuilds) ? previousBuilds : [])
    .filter((entry) => entry && entry.commit !== build.commit);
  const all = [build, ...rest];
  return {
    builds: all.slice(0, keep),
    pruned: selectDmgsToPrune(all, keep),
  };
}
