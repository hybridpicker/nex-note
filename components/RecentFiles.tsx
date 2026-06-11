'use client';

import type { ReactNode } from 'react';
import { useEffect, useState, useRef } from 'react';
import { addRecentFile, getRecentFiles, clearRecentFiles, type RecentFile } from '@/lib/recent-files';
import { getLibraryScores, type LibraryScore } from '@/lib/score-library';

interface Props {
  onFileSelected: (file: File) => Promise<void> | void;
  onOpenSavedScore?: (score: LibraryScore) => Promise<void> | void;
  emptyFallback?: ReactNode;
  className?: string;
}

const IMPORT_FILE_ACCEPT = '.nxn,.pdf,.png,.jpg,.jpeg,.tif,.tiff,.webp,.bmp,.heic,.heif,.mxl,.xml,.musicxml,.mscz,.mid,.midi,.gp,.gp4,.gp5,.gp6,.gpx';

function formatRelTime(ts: number): string {
  const diff = Date.now() - ts;
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return `${Math.floor(hrs / 24)}d ago`;
}

function formatSize(bytes?: number): string {
  if (!bytes) return '';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

function basenameWithoutExtension(name: string) {
  return name.replace(/\.[^.]+$/, '').toLowerCase();
}

function waitForUiPaint() {
  return new Promise<void>((resolve) => {
    if (typeof window === 'undefined' || typeof window.requestAnimationFrame !== 'function') {
      resolve();
      return;
    }
    window.requestAnimationFrame(() => window.setTimeout(resolve, 0));
  });
}

export default function RecentFiles({ onFileSelected, onOpenSavedScore, emptyFallback = null, className = '' }: Props) {
  const [files, setFiles] = useState<RecentFile[]>([]);
  const [loadingIndex, setLoadingIndex] = useState<number | null>(null);
  const [error, setError] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);
  const pendingIndex = useRef<number | null>(null);

  useEffect(() => {
    setFiles(getRecentFiles());
  }, []);

  if (files.length === 0) return emptyFallback;

  async function handleUploadForIndex(file: File) {
    setError('');
    try {
      await onFileSelected(file);
    } catch (err) {
      setError(String(err));
    } finally {
      setLoadingIndex(null);
      pendingIndex.current = null;
    }
  }

  function findSavedScore(file: RecentFile) {
    const library = getLibraryScores();
    const recentBaseName = basenameWithoutExtension(file.importedName ?? file.name);
    return (file.libraryScoreId ? library.find((score) => score.id === file.libraryScoreId) : null)
      ?? (file.importedName ? library.find((score) => score.name === file.importedName) : null)
      ?? library.find((score) => score.name === file.name)
      ?? library.find((score) => basenameWithoutExtension(score.name) === recentBaseName)
      ?? null;
  }

  async function openRecentFile(file: RecentFile, index: number) {
    const savedScore = findSavedScore(file);
    if (savedScore && onOpenSavedScore) {
      setError('');
      setLoadingIndex(index);
      try {
        await waitForUiPaint();
        await onOpenSavedScore(savedScore);
        addRecentFile(file.name, file.size, {
          libraryScoreId: savedScore.id,
          importedName: savedScore.name,
        });
        setFiles(getRecentFiles());
      } catch (err) {
        setError(String(err));
      } finally {
        setLoadingIndex(null);
      }
      return;
    }

    pendingIndex.current = index;
    setLoadingIndex(index);
    inputRef.current?.click();
  }

  function onInputChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) {
      setLoadingIndex(null);
      pendingIndex.current = null;
      return;
    }
    handleUploadForIndex(file);
  }

  return (
    <div className={`mt-6 ${className}`}>
      <input
        ref={inputRef}
        type="file"
        accept={IMPORT_FILE_ACCEPT}
        className="hidden"
        style={{ caretColor: 'transparent' }}
        suppressHydrationWarning
        onChange={onInputChange}
      />
      <div className="flex items-center justify-between mb-2">
        <span className="text-xs font-medium text-gray-400 uppercase tracking-wide">Recent</span>
        <button
          onClick={() => { clearRecentFiles(); setFiles([]); }}
          className="text-xs text-gray-300 hover:text-gray-500 transition-colors"
        >
          Clear
        </button>
      </div>
      <div className="space-y-1">
        {files.map((f, i) => (
          <button
            key={i}
            onClick={() => openRecentFile(f, i)}
            disabled={loadingIndex !== null}
            className="w-full flex items-center justify-between px-3 py-2 rounded-lg text-left hover:bg-gray-50 transition-colors group disabled:opacity-50"
          >
            <div className="flex items-center gap-2 min-w-0">
              <svg className="w-3.5 h-3.5 text-gray-300 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5} aria-hidden>
                <path strokeLinecap="round" strokeLinejoin="round" d="M7 3.5h6l4 4V20a1 1 0 0 1-1 1H7a1 1 0 0 1-1-1V4.5a1 1 0 0 1 1-1Z" />
                <path strokeLinecap="round" strokeLinejoin="round" d="M13 3.5V8h4" />
              </svg>
              <span className="text-sm text-gray-600 truncate">{f.name}</span>
              {f.size && <span className="text-xs text-gray-300 shrink-0">{formatSize(f.size)}</span>}
            </div>
            <div className="flex items-center gap-2 shrink-0 ml-2">
              {loadingIndex === i ? (
                <div className="flex items-center gap-2 text-xs text-gray-500">
                  <div className="w-3 h-3 border border-gray-300 border-t-gray-600 rounded-full animate-spin" />
                  <span>Opening</span>
                </div>
              ) : (
                <>
                  <span className="text-xs text-gray-300">{formatRelTime(f.timestamp)}</span>
                  <span className="text-xs text-gray-400 opacity-0 group-hover:opacity-100 transition-opacity">Open</span>
                </>
              )}
            </div>
          </button>
        ))}
      </div>
      {error && <p className="mt-2 text-red-500 text-xs">{error}</p>}
    </div>
  );
}
