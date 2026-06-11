'use client';

import { useRef, useState } from 'react';

interface Props {
  onFileSelected: (file: File) => Promise<void> | void;
  onFilesSelected?: (files: File[]) => Promise<void> | void;
  loadingMessage?: string;
}

const IMPORT_FILE_ACCEPT = '.nxn,.pdf,.png,.jpg,.jpeg,.tif,.tiff,.webp,.bmp,.heic,.heif,.mxl,.xml,.musicxml,.mscz,.mid,.midi,.gp,.gp4,.gp5,.gp6,.gpx';

export default function UploadZone({ onFileSelected, onFilesSelected, loadingMessage }: Props) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [dragging, setDragging] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  async function handleFiles(files: File[]) {
    if (files.length === 0) return;
    setError('');
    setLoading(true);
    try {
      if (onFilesSelected) {
        await onFilesSelected(files);
      } else {
        await onFileSelected(files[0]);
      }
    } catch (err) {
      setError(String(err));
    } finally {
      setLoading(false);
    }
  }

  function onDrop(e: React.DragEvent) {
    e.preventDefault();
    setDragging(false);
    void handleFiles(Array.from(e.dataTransfer.files));
  }

  return (
    <div
      onDrop={onDrop}
      onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
      onDragLeave={() => setDragging(false)}
      onClick={() => inputRef.current?.click()}
      className={`cursor-pointer rounded-xl border border-dashed px-6 py-7 text-center transition-all ${
        dragging
          ? 'border-nex-accent/40 bg-nex-accent-muted/20'
          : 'border-nex-border bg-white/60 hover:border-slate-300 hover:bg-white/90'
      }`}
    >
      <input
        ref={inputRef}
        type="file"
        accept={IMPORT_FILE_ACCEPT}
        multiple
        className="hidden"
        style={{ caretColor: 'transparent' }}
        suppressHydrationWarning
        onChange={(e) => {
          const files = Array.from(e.target.files ?? []);
          e.target.value = '';
          void handleFiles(files);
        }}
      />
      {loading ? (
        <div className="flex items-center justify-center gap-3">
          <div className="h-4 w-4 animate-spin rounded-full border-2 border-slate-200 border-t-slate-600" />
          <p className="text-sm text-slate-500">{loadingMessage || 'Converting… (OMR may take up to 60s)'}</p>
        </div>
      ) : (
        <div className="flex items-center justify-center gap-4">
          <svg className="h-6 w-6 shrink-0 text-slate-300" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5} aria-hidden>
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 16V4m0 0 4 4m-4-4-4 4M5 16v2a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-2" />
          </svg>
          <div className="text-left">
            <p className="text-sm font-medium text-slate-600">Drop a score file here</p>
            <p className="mt-0.5 text-xs text-slate-400">NXN · PDF · image · MXL · XML · MSCZ · MIDI · GP · click to select</p>
          </div>
        </div>
      )}
      {error && <p className="mt-3 text-xs text-red-500">{error}</p>}
    </div>
  );
}
