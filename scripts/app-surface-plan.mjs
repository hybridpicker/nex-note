#!/usr/bin/env node

import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { pathToFileURL } from 'node:url';

const SHARED_RUNTIME_PREFIXES = [
  'app/',
  'components/',
  'hooks/',
  'lib/',
  'public/',
  'src/',
];

const SHARED_RUNTIME_FILES = new Set([
  'capacitor.config.ts',
  'next.config.ts',
  'package-lock.json',
  'package.json',
  'postcss.config.mjs',
  'tsconfig.json',
]);

const ELECTRON_PREFIXES = ['electron/'];
const IPAD_PREFIXES = ['ios/', 'native-shell/'];
const MACOS_XCODE_PREFIXES = ['macos/', 'scripts/macos-'];

function normalizedPath(value) {
  return value.replaceAll('\\', '/').replace(/^\.\//, '');
}

function matchesPrefix(filePath, prefixes) {
  return prefixes.some((prefix) => filePath.startsWith(prefix));
}

function isDocumentationPath(filePath) {
  return filePath === 'AGENTS.md'
    || filePath === 'CONTRIBUTING.md'
    || filePath === 'README.md'
    || filePath === 'CHANGELOG.md'
    || filePath.startsWith('docs/')
    || filePath.endsWith('.md');
}

export function classifyAppSurfaces(paths, options = {}) {
  const files = [...new Set(paths.map(normalizedPath).filter(Boolean))].sort();
  const docsOnly = files.length > 0 && files.every(isDocumentationPath);
  const shared = files.some((filePath) => (
    matchesPrefix(filePath, SHARED_RUNTIME_PREFIXES)
    || SHARED_RUNTIME_FILES.has(filePath)
  ));
  const electron = shared || files.some((filePath) => (
    matchesPrefix(filePath, ELECTRON_PREFIXES)
    || filePath.startsWith('scripts/electron')
    || filePath === 'scripts/refresh-local-electron-app.mjs'
    || filePath === 'scripts/build-latest-dmg.mjs'
    || filePath === 'scripts/latest-dmg-helpers.mjs'
    || filePath === 'scripts/prepare-electron-package.mjs'
    || filePath === 'scripts/verify-electron-package.mjs'
  ));
  const ipad = shared || files.some((filePath) => (
    matchesPrefix(filePath, IPAD_PREFIXES)
    || filePath.startsWith('scripts/ipad-')
    || filePath === 'scripts/configure-ipad-project.mjs'
  ));
  const macosXcode = shared || files.some((filePath) => matchesPrefix(filePath, MACOS_XCODE_PREFIXES));

  return {
    files,
    docsOnly,
    shared,
    web: shared || files.some((filePath) => filePath.startsWith('e2e/') || filePath.startsWith('test/')),
    electron,
    ipad,
    macosXcode,
    macosXcodeAvailable: Boolean(options.macosXcodeAvailable),
  };
}

export function buildAppSurfacePlan(classification) {
  if (classification.files.length === 0) {
    return ['No changed or untracked files were detected.'];
  }

  if (classification.docsOnly) {
    return [
      'Documentation-only change detected.',
      'Required: review rendered Markdown, links, and repository-state claims.',
      'Application rebuilds are not required unless the documentation changes executable workflow files.',
    ];
  }

  const lines = [];
  if (classification.web || classification.shared) {
    lines.push('Shared/web: run focused tests, then `npm test` and `npm run build` before handoff.');
  }
  if (classification.electron) {
    lines.push('Electron macOS: run `npm run electron:refresh` for visible/package/runtime changes.');
  }
  if (classification.ipad) {
    lines.push('Native iPad: run `npm run ipad:sync` and `npm run ipad:doctor`; smoke-test the paired device for user-visible/native changes.');
  }
  if (classification.macosXcode) {
    lines.push(classification.macosXcodeAvailable
      ? 'Xcode macOS: run the macos sync/doctor/build/smoke workflow.'
      : 'Xcode macOS: planned but not implemented; keep `docs/macos-xcode-private-testing-prompt.md` compatible with this change.');
  }
  lines.push('Final hygiene: run `git diff --check` and report every affected surface not executed.');
  return lines;
}

function gitPaths(root, args) {
  try {
    const output = execFileSync('git', args, {
      cwd: root,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
    });
    return output.split('\0').filter(Boolean);
  } catch {
    return [];
  }
}

export function changedWorktreePaths(root) {
  return [...new Set([
    ...gitPaths(root, ['diff', '--name-only', '-z', 'HEAD']),
    ...gitPaths(root, ['ls-files', '--others', '--exclude-standard', '-z']),
  ])].sort();
}

function hasMacosXcodeWorkflow(root) {
  if (!existsSync(path.join(root, 'macos'))) return false;
  try {
    const packageJson = JSON.parse(readFileSync(path.join(root, 'package.json'), 'utf8'));
    return Boolean(packageJson.scripts?.['macos:doctor'] && packageJson.scripts?.['macos:sync']);
  } catch {
    return false;
  }
}

function main() {
  const root = process.cwd();
  const paths = changedWorktreePaths(root);
  const classification = classifyAppSurfaces(paths, {
    macosXcodeAvailable: hasMacosXcodeWorkflow(root),
  });

  console.log('Nex Note application surface plan');
  console.log('');
  console.log(`Changed paths: ${classification.files.length}`);
  for (const line of buildAppSurfacePlan(classification)) {
    console.log(`- ${line}`);
  }
}

const entryPath = process.argv[1] ? pathToFileURL(path.resolve(process.argv[1])).href : '';
if (entryPath === import.meta.url) main();
