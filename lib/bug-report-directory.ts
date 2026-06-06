const DB_NAME = 'nex-note-debug-exports';
const STORE_NAME = 'handles';
const HANDLE_KEY = 'bug-report-directory';
const BUG_DIR_NAME = 'nex-note-bugs';

type PermissionAwareDirectoryHandle = FileSystemDirectoryHandle & {
  queryPermission?: (descriptor?: { mode?: 'read' | 'readwrite' }) => Promise<PermissionState>;
  requestPermission?: (descriptor?: { mode?: 'read' | 'readwrite' }) => Promise<PermissionState>;
};

type DirectoryPickerWindow = Window & typeof globalThis & {
  showDirectoryPicker?: (options?: {
    id?: string;
    mode?: 'read' | 'readwrite';
    startIn?: 'desktop' | 'documents' | 'downloads' | 'music' | 'pictures' | 'videos';
  }) => Promise<FileSystemDirectoryHandle>;
};

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, 1);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME);
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

async function withStore<T>(
  mode: IDBTransactionMode,
  run: (store: IDBObjectStore, resolve: (value: T) => void, reject: (error?: unknown) => void) => void,
): Promise<T> {
  const db = await openDb();
  return new Promise<T>((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, mode);
    const store = tx.objectStore(STORE_NAME);
    run(store, resolve, reject);
    tx.oncomplete = () => db.close();
    tx.onerror = () => reject(tx.error);
  });
}

export function supportsBugReportDirectoryExport() {
  const directoryWindow = typeof window !== 'undefined' ? window as DirectoryPickerWindow : null;
  return typeof window !== 'undefined'
    && typeof indexedDB !== 'undefined'
    && typeof directoryWindow?.showDirectoryPicker === 'function';
}

async function normalizeBugReportDirectory(handle: FileSystemDirectoryHandle) {
  if (handle.name === BUG_DIR_NAME) return handle;
  return handle.getDirectoryHandle(BUG_DIR_NAME, { create: true });
}

export async function getSavedBugReportDirectoryHandle() {
  if (!supportsBugReportDirectoryExport()) return null;
  return withStore<FileSystemDirectoryHandle | null>('readonly', (store, resolve, reject) => {
    const request = store.get(HANDLE_KEY);
    request.onsuccess = async () => {
      try {
        const value = request.result as FileSystemDirectoryHandle | undefined;
        if (!value) {
          resolve(null);
          return;
        }
        resolve(await normalizeBugReportDirectory(value));
      } catch (error) {
        reject(error);
      }
    };
    request.onerror = () => reject(request.error);
  });
}

export async function setSavedBugReportDirectoryHandle(handle: FileSystemDirectoryHandle) {
  if (!supportsBugReportDirectoryExport()) return;
  const normalized = await normalizeBugReportDirectory(handle);
  await withStore<void>('readwrite', (store, resolve, reject) => {
    const request = store.put(normalized, HANDLE_KEY);
    request.onsuccess = () => resolve();
    request.onerror = () => reject(request.error);
  });
}

export async function clearSavedBugReportDirectoryHandle() {
  if (!supportsBugReportDirectoryExport()) return;
  await withStore<void>('readwrite', (store, resolve, reject) => {
    const request = store.delete(HANDLE_KEY);
    request.onsuccess = () => resolve();
    request.onerror = () => reject(request.error);
  });
}

export async function ensureBugReportDirectoryPermission(handle: FileSystemDirectoryHandle) {
  const permissionHandle = handle as PermissionAwareDirectoryHandle;
  const options = { mode: 'readwrite' as const };
  if (typeof permissionHandle.queryPermission === 'function') {
    const current = await permissionHandle.queryPermission(options);
    if (current === 'granted') return true;
  }
  if (typeof permissionHandle.requestPermission === 'function') {
    const next = await permissionHandle.requestPermission(options);
    return next === 'granted';
  }
  return true;
}

export async function chooseBugReportDirectoryHandle() {
  if (!supportsBugReportDirectoryExport()) return null;
  const directoryWindow = window as DirectoryPickerWindow;
  const picked = await directoryWindow.showDirectoryPicker?.({
    id: 'nex-note-bug-reports',
    mode: 'readwrite',
    startIn: 'downloads',
  });
  if (!picked) return null;
  const normalized = await normalizeBugReportDirectory(picked);
  await setSavedBugReportDirectoryHandle(normalized);
  return normalized;
}

export async function writeBlobToBugReportDirectory(handle: FileSystemDirectoryHandle, filename: string, blob: Blob) {
  const fileHandle = await handle.getFileHandle(filename, { create: true });
  const writable = await fileHandle.createWritable();
  await writable.write(blob);
  await writable.close();
}

export function formatBugReportDirectoryLabel(handle: FileSystemDirectoryHandle | null) {
  if (!handle) return 'Browser download fallback';
  return handle.name === BUG_DIR_NAME ? handle.name : `${handle.name}/${BUG_DIR_NAME}`;
}
