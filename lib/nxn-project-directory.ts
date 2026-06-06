import { buildNxnFilename, createNxnBlob, readNxnFile, type CreateNxnFileInput } from '@/lib/nxn-file';

const DB_NAME = 'nex-note-project-storage';
const STORE_NAME = 'handles';
const HANDLE_KEY = 'nxn-project-directory';
const PROJECT_DIR_NAME = 'nex-note-projects';

type PermissionAwareDirectoryHandle = FileSystemDirectoryHandle & {
  queryPermission?: (descriptor?: { mode?: 'readwrite' }) => Promise<PermissionState>;
  requestPermission?: (descriptor?: { mode?: 'readwrite' }) => Promise<PermissionState>;
};

type DirectoryPickerWindow = Window & typeof globalThis & {
  showDirectoryPicker?: (options?: {
    id?: string;
    mode?: 'readwrite';
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

async function normalizeProjectDirectory(handle: FileSystemDirectoryHandle) {
  if (handle.name === PROJECT_DIR_NAME) return handle;
  return handle.getDirectoryHandle(PROJECT_DIR_NAME, { create: true });
}

export function supportsNxnProjectDirectoryStorage() {
  const directoryWindow = typeof window !== 'undefined' ? window as DirectoryPickerWindow : null;
  return typeof window !== 'undefined'
    && typeof indexedDB !== 'undefined'
    && typeof directoryWindow?.showDirectoryPicker === 'function';
}

export async function getSavedNxnProjectDirectoryHandle() {
  if (!supportsNxnProjectDirectoryStorage()) return null;
  return withStore<FileSystemDirectoryHandle | null>('readonly', (store, resolve, reject) => {
    const request = store.get(HANDLE_KEY);
    request.onsuccess = async () => {
      try {
        const value = request.result as FileSystemDirectoryHandle | undefined;
        if (!value) {
          resolve(null);
          return;
        }
        resolve(await normalizeProjectDirectory(value));
      } catch (error) {
        reject(error);
      }
    };
    request.onerror = () => reject(request.error);
  });
}

export async function setSavedNxnProjectDirectoryHandle(handle: FileSystemDirectoryHandle) {
  if (!supportsNxnProjectDirectoryStorage()) return;
  const normalized = await normalizeProjectDirectory(handle);
  await withStore<void>('readwrite', (store, resolve, reject) => {
    const request = store.put(normalized, HANDLE_KEY);
    request.onsuccess = () => resolve();
    request.onerror = () => reject(request.error);
  });
}

export async function ensureNxnProjectDirectoryPermission(handle: FileSystemDirectoryHandle) {
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

export async function hasNxnProjectDirectoryPermission(handle: FileSystemDirectoryHandle) {
  const permissionHandle = handle as PermissionAwareDirectoryHandle;
  if (typeof permissionHandle.queryPermission === 'function') {
    const current = await permissionHandle.queryPermission({ mode: 'readwrite' });
    return current === 'granted';
  }
  return true;
}

export async function chooseNxnProjectDirectoryHandle() {
  if (!supportsNxnProjectDirectoryStorage()) return null;
  const directoryWindow = window as DirectoryPickerWindow;
  const picked = await directoryWindow.showDirectoryPicker?.({
    id: 'nex-note-projects',
    mode: 'readwrite',
    startIn: 'documents',
  });
  if (!picked) return null;
  const normalized = await normalizeProjectDirectory(picked);
  await setSavedNxnProjectDirectoryHandle(normalized);
  return normalized;
}

export async function writeNxnProjectFile(
  handle: FileSystemDirectoryHandle,
  filename: string,
  input: CreateNxnFileInput,
) {
  const fileHandle = await handle.getFileHandle(buildNxnFilename(filename), { create: true });
  const writable = await fileHandle.createWritable();
  await writable.write(createNxnBlob(input));
  await writable.close();
}

export async function readNxnProjectFile(handle: FileSystemDirectoryHandle, filename: string) {
  const fileHandle = await handle.getFileHandle(buildNxnFilename(filename));
  return readNxnFile(await fileHandle.getFile());
}

export function formatNxnProjectDirectoryLabel(handle: FileSystemDirectoryHandle | null) {
  if (!handle) return '';
  return handle.name === PROJECT_DIR_NAME ? handle.name : `${handle.name}/${PROJECT_DIR_NAME}`;
}
