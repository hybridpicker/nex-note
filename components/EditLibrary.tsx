'use client';

import { useState, useEffect } from 'react';
import { BUILT_IN_PRESETS, getUserPresets, saveUserPreset, deleteUserPreset, type EditPreset } from '@/lib/edit-presets';
import type { ScoreCommand } from '@/lib/score-commands';

interface Props {
  xml: string;
  lastOperations?: unknown[];
  onXmlUpdate: (xml: string, meta?: { label?: string; commands?: ScoreCommand[] }) => void;
}

export default function EditLibrary({ xml, lastOperations, onXmlUpdate }: Props) {
  const [open, setOpen] = useState(false);
  const [userPresets, setUserPresets] = useState<EditPreset[]>([]);
  const [saveName, setSaveName] = useState('');
  const [saving, setSaving] = useState(false);
  const [applying, setApplying] = useState<string | null>(null);

  useEffect(() => {
    if (open) setUserPresets(getUserPresets());
  }, [open]);

  async function applyPreset(preset: EditPreset) {
    if (!xml) return;
    setApplying(preset.id);
    try {
      const res = await fetch('/api/apply-operations', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ xml, operations: preset.operations }),
      });
      const data = await res.json();
      if (res.ok) onXmlUpdate(data.xml, { label: preset.name, commands: data.commands ?? data.operations });
    } finally {
      setApplying(null);
    }
  }

  function handleSave() {
    if (!saveName.trim() || !lastOperations?.length) return;
    setSaving(true);
    saveUserPreset(saveName.trim(), lastOperations);
    setUserPresets(getUserPresets());
    setSaveName('');
    setSaving(false);
  }

  function handleDelete(id: string) {
    deleteUserPreset(id);
    setUserPresets(getUserPresets());
  }

  return (
    <div className="border-t border-gray-100 pt-2 mt-2">
      <button
        onClick={() => setOpen(o => !o)}
        className="flex items-center gap-1.5 text-xs text-gray-400 hover:text-gray-600 transition-colors w-full"
      >
        <svg className={`w-3 h-3 transition-transform ${open ? 'rotate-90' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
        </svg>
        Library
        <span className="ml-auto text-gray-300">{BUILT_IN_PRESETS.length + userPresets.length}</span>
      </button>

      {open && (
        <div className="mt-2 space-y-3">
          {/* Built-in presets */}
          <div>
            <p className="text-[10px] font-medium text-gray-300 uppercase tracking-wide mb-1.5">Built-in</p>
            <div className="flex flex-wrap gap-1.5">
              {BUILT_IN_PRESETS.map(p => (
                <button
                  key={p.id}
                  onClick={() => applyPreset(p)}
                  disabled={!xml || applying !== null}
                  className="px-2.5 py-1 bg-gray-100 hover:bg-gray-200 text-gray-700 text-xs rounded-lg transition-colors disabled:opacity-40 flex items-center gap-1"
                >
                  {applying === p.id && (
                    <div className="w-2.5 h-2.5 border border-gray-400 border-t-gray-700 rounded-full animate-spin" />
                  )}
                  {p.name}
                </button>
              ))}
            </div>
          </div>

          {/* User presets */}
          {userPresets.length > 0 && (
            <div>
              <p className="text-[10px] font-medium text-gray-300 uppercase tracking-wide mb-1.5">Saved</p>
              <div className="space-y-1">
                {userPresets.map(p => (
                  <div key={p.id} className="flex items-center gap-1">
                    <button
                      onClick={() => applyPreset(p)}
                      disabled={!xml || applying !== null}
                      className="flex-1 text-left px-2.5 py-1 bg-gray-50 hover:bg-gray-100 text-gray-700 text-xs rounded-lg transition-colors disabled:opacity-40 flex items-center gap-1 min-w-0"
                    >
                      {applying === p.id && (
                        <div className="w-2.5 h-2.5 border border-gray-400 border-t-gray-700 rounded-full animate-spin shrink-0" />
                      )}
                      <span className="truncate">{p.name}</span>
                    </button>
                    <button
                      onClick={() => handleDelete(p.id)}
                      className="p-1 text-gray-300 hover:text-red-400 transition-colors shrink-0"
                      title="Delete preset"
                    >
                      <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                      </svg>
                    </button>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Save last operations */}
          {lastOperations && lastOperations.length > 0 && (
            <div>
              <p className="text-[10px] font-medium text-gray-300 uppercase tracking-wide mb-1.5">Save last edit as preset</p>
              <div className="flex gap-1.5">
                <input
                  value={saveName}
                  onChange={e => setSaveName(e.target.value)}
                  onKeyDown={e => e.key === 'Enter' && handleSave()}
                  placeholder="Preset name…"
                  className="flex-1 border border-gray-200 rounded-lg px-2.5 py-1 text-xs focus:outline-none focus:border-gray-400 placeholder:text-gray-300"
                />
                <button
                  onClick={handleSave}
                  disabled={!saveName.trim() || saving}
                  className="px-2.5 py-1 bg-gray-900 text-white text-xs rounded-lg hover:bg-gray-700 disabled:opacity-30 transition-colors"
                >
                  Save
                </button>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
