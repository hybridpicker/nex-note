import { chmod, copyFile, mkdir } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(scriptDir, '..');
const sourceDir = path.join(scriptDir, 'git-hooks');
const targetDir = path.join(rootDir, '.git', 'hooks');

const hooks = ['pre-commit', 'post-commit'];

await mkdir(targetDir, { recursive: true });

for (const hook of hooks) {
  const source = path.join(sourceDir, hook);
  const target = path.join(targetDir, hook);
  await copyFile(source, target);
  await chmod(target, 0o755);
  console.log(`Installed .git/hooks/${hook}`);
}
