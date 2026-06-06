'use client';

import { useEffect, useState } from 'react';

interface BugReportFormValue {
  title: string;
  whatHappened: string;
  expected: string;
  stepsTried: string;
  includeXml: boolean;
  includeChatTranscript: boolean;
  includeStorageSnapshot: boolean;
}

interface Props {
  open: boolean;
  filename: string;
  directorySupported: boolean;
  directoryLabel: string;
  onChooseDirectory: () => Promise<void> | void;
  onClose: () => void;
  onExport: (value: BugReportFormValue) => Promise<void> | void;
}

const DEFAULT_FORM: BugReportFormValue = {
  title: '',
  whatHappened: '',
  expected: '',
  stepsTried: '',
  includeXml: true,
  includeChatTranscript: true,
  includeStorageSnapshot: true,
};

export default function BugReportDialog({ open, filename, directorySupported, directoryLabel, onChooseDirectory, onClose, onExport }: Props) {
  const [form, setForm] = useState(DEFAULT_FORM);
  const [exporting, setExporting] = useState(false);
  const [choosingDirectory, setChoosingDirectory] = useState(false);

  useEffect(() => {
    if (!open) {
      setForm(DEFAULT_FORM);
      setExporting(false);
    }
  }, [open]);

  if (!open) return null;

  const canExport = form.whatHappened.trim().length > 0 && form.expected.trim().length > 0;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-stone-950/45 px-4 py-8">
      <div className="w-full max-w-2xl rounded-[1.75rem] border border-stone-200 bg-white shadow-[0_28px_90px_-40px_rgba(15,23,42,0.45)]">
        <div className="border-b border-stone-200 px-6 py-5">
          <p className="text-[11px] font-semibold uppercase tracking-[0.24em] text-rose-700">Debug export</p>
          <h2 className="mt-2 text-xl font-semibold tracking-tight text-stone-950">Report bug</h2>
          <p className="mt-2 text-sm text-stone-600">
            Export a Codex/Claude-ready bug bundle for <span className="font-medium text-stone-900">{filename || 'current score'}</span>.
          </p>
        </div>

        <div className="space-y-5 px-6 py-5">
          <label className="block">
            <span className="mb-2 block text-sm font-medium text-stone-800">Short title</span>
            <input
              value={form.title}
              onChange={(e) => setForm((current) => ({ ...current, title: e.target.value }))}
              placeholder="Selection jumped after transpose"
              className="w-full rounded-2xl border border-stone-300 px-4 py-3 text-sm text-stone-900 outline-none transition focus:border-rose-400 focus:ring-2 focus:ring-rose-200"
            />
          </label>

          <label className="block">
            <span className="mb-2 block text-sm font-medium text-stone-800">What did not work?</span>
            <textarea
              value={form.whatHappened}
              onChange={(e) => setForm((current) => ({ ...current, whatHappened: e.target.value }))}
              placeholder="I clicked the first note, used Inspector transpose +2, and the selection jumped to the wrong note."
              rows={4}
              className="w-full rounded-2xl border border-stone-300 px-4 py-3 text-sm text-stone-900 outline-none transition focus:border-rose-400 focus:ring-2 focus:ring-rose-200"
            />
          </label>

          <label className="block">
            <span className="mb-2 block text-sm font-medium text-stone-800">What did you expect instead?</span>
            <textarea
              value={form.expected}
              onChange={(e) => setForm((current) => ({ ...current, expected: e.target.value }))}
              placeholder="The same selected note should stay targeted and transpose up by 2 semitones."
              rows={3}
              className="w-full rounded-2xl border border-stone-300 px-4 py-3 text-sm text-stone-900 outline-none transition focus:border-rose-400 focus:ring-2 focus:ring-rose-200"
            />
          </label>

          <label className="block">
            <span className="mb-2 block text-sm font-medium text-stone-800">Steps tried</span>
            <textarea
              value={form.stepsTried}
              onChange={(e) => setForm((current) => ({ ...current, stepsTried: e.target.value }))}
              placeholder="1. Open leadsheet-repeat.musicxml&#10;2. Click note in measure 1&#10;3. Open Inspector&#10;4. Click Transpose +2"
              rows={4}
              className="w-full rounded-2xl border border-stone-300 px-4 py-3 text-sm text-stone-900 outline-none transition focus:border-rose-400 focus:ring-2 focus:ring-rose-200"
            />
          </label>

          <div className="rounded-2xl bg-stone-100 p-4">
            <p className="text-sm font-medium text-stone-900">Include in export</p>
            <div className="mt-3 grid gap-2 text-sm text-stone-700 sm:grid-cols-3">
              <label className="flex items-center gap-2">
                <input
                  type="checkbox"
                  checked={form.includeXml}
                  onChange={(e) => setForm((current) => ({ ...current, includeXml: e.target.checked }))}
                />
                Current score XML
              </label>
              <label className="flex items-center gap-2">
                <input
                  type="checkbox"
                  checked={form.includeChatTranscript}
                  onChange={(e) => setForm((current) => ({ ...current, includeChatTranscript: e.target.checked }))}
                />
                Chat transcript
              </label>
              <label className="flex items-center gap-2">
                <input
                  type="checkbox"
                  checked={form.includeStorageSnapshot}
                  onChange={(e) => setForm((current) => ({ ...current, includeStorageSnapshot: e.target.checked }))}
                />
                Local storage snapshot
              </label>
            </div>
          </div>

          <div className="rounded-2xl border border-stone-200 bg-white p-4">
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="text-sm font-medium text-stone-900">Export target</p>
                <p className="mt-1 text-sm text-stone-600">
                  {directorySupported
                    ? `Saved bug folder: ${directoryLabel}. Recommended: choose ~/Coding so nex-note uses ~/Coding/nex-note-bugs.`
                    : 'This browser falls back to the normal download flow.'}
                </p>
              </div>
              {directorySupported && (
                <button
                  onClick={async () => {
                    setChoosingDirectory(true);
                    try {
                      await onChooseDirectory();
                    } finally {
                      setChoosingDirectory(false);
                    }
                  }}
                  className="shrink-0 rounded-2xl border border-stone-300 px-3 py-2 text-sm font-medium text-stone-700 transition hover:bg-stone-100"
                >
                  {choosingDirectory ? 'Choosing…' : 'Change folder'}
                </button>
              )}
            </div>
          </div>
        </div>

        <div className="flex items-center justify-end gap-3 border-t border-stone-200 px-6 py-4">
          <button
            onClick={onClose}
            className="rounded-2xl px-4 py-2 text-sm font-medium text-stone-600 transition hover:bg-stone-100 hover:text-stone-900"
          >
            Cancel
          </button>
          <button
            disabled={!canExport || exporting}
            onClick={async () => {
              setExporting(true);
              try {
                await onExport(form);
              } finally {
                setExporting(false);
              }
            }}
            className={`rounded-2xl px-4 py-2 text-sm font-medium transition ${
              !canExport || exporting
                ? 'cursor-not-allowed bg-stone-200 text-stone-400'
                : 'bg-rose-600 text-white hover:bg-rose-500'
            }`}
          >
            {exporting ? 'Exporting…' : 'Export bug bundle'}
          </button>
        </div>
      </div>
    </div>
  );
}
