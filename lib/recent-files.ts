export interface RecentFile {
  name: string;
  timestamp: number;
  size?: number;
  libraryScoreId?: string;
  importedName?: string;
}

const KEY = 'nex-note:recent-files';
const MAX = 8;

export function addRecentFile(name: string, size?: number, details: Pick<RecentFile, 'libraryScoreId' | 'importedName'> = {}): void {
  if (typeof localStorage === 'undefined') return;
  const files = getRecentFiles().filter(f => f.name !== name);
  files.unshift({ name, timestamp: Date.now(), size, ...details });
  localStorage.setItem(KEY, JSON.stringify(files.slice(0, MAX)));
}

export function getRecentFiles(): RecentFile[] {
  if (typeof localStorage === 'undefined') return [];
  try {
    return JSON.parse(localStorage.getItem(KEY) ?? '[]');
  } catch {
    return [];
  }
}

export function clearRecentFiles(): void {
  if (typeof localStorage === 'undefined') return;
  localStorage.removeItem(KEY);
}
