'use client';

import { type ChangeEvent, useEffect, useMemo, useRef, useState } from 'react';
import {
  createDefaultNewScoreDraft,
  INSTRUMENT_DEFINITIONS,
  KEY_SIGNATURE_OPTIONS,
  NEW_SCORE_FAMILIES,
  NEW_SCORE_TEMPLATES,
  type NewScoreDraft,
} from '@/lib/new-score';
import {
  buildTemplateCategories,
  type UserScoreTemplate,
} from '@/lib/score-templates';
import { useI18n } from '@/lib/i18n';

export type DialogTab = 'instruments' | 'templates' | 'info';

interface Props {
  open: boolean;
  initialTab?: DialogTab;
  onClose: () => void;
  onCreate: (draft: NewScoreDraft) => void;
  userTemplates?: UserScoreTemplate[];
  userTemplateStatus?: string;
  onChooseUserTemplate?: (template: UserScoreTemplate) => void;
  onImportTemplateFile?: (file: File) => void;
}

const BEAT_UNIT_OPTIONS = [
  { value: 'whole', label: 'Whole note' },
  { value: 'half', label: 'Half note' },
  { value: 'quarter', label: 'Quarter note' },
  { value: 'eighth', label: 'Eighth note' },
] as const;

const EMPTY_USER_TEMPLATES: UserScoreTemplate[] = [];

function SectionTitle({ eyebrow, title, description }: { eyebrow: string; title: string; description: string }) {
  return (
    <div>
      <p className="text-[11px] font-semibold uppercase tracking-[0.24em] text-stone-400">{eyebrow}</p>
      <h3 className="mt-2 text-xl font-semibold tracking-tight text-stone-950">{title}</h3>
      <p className="mt-2 text-sm leading-6 text-stone-600">{description}</p>
    </div>
  );
}

export default function NewScoreDialog({
  open,
  initialTab = 'instruments',
  onClose,
  onCreate,
  userTemplates = EMPTY_USER_TEMPLATES,
  userTemplateStatus = '',
  onChooseUserTemplate,
  onImportTemplateFile,
}: Props) {
  const { t } = useI18n();
  const importTemplateInputRef = useRef<HTMLInputElement | null>(null);
  const [tab, setTab] = useState<DialogTab>('instruments');
  const [draft, setDraft] = useState<NewScoreDraft>(createDefaultNewScoreDraft);
  const [family, setFamily] = useState('All');
  const [search, setSearch] = useState('');
  const [selectedInstrumentIndex, setSelectedInstrumentIndex] = useState(0);
  const allTemplates = useMemo(
    () => [
      ...NEW_SCORE_TEMPLATES.map((template) => ({ ...template, source: 'built-in' as const })),
      ...userTemplates,
    ],
    [userTemplates],
  );
  const templateCategories = useMemo(() => buildTemplateCategories(allTemplates), [allTemplates]);
  const [templateCategory, setTemplateCategory] = useState(templateCategories[0] ?? 'Solo');

  useEffect(() => {
    if (!open) return;
    setTab(initialTab);
    setDraft(createDefaultNewScoreDraft());
    setFamily('All');
    setSearch('');
    setSelectedInstrumentIndex(0);
    setTemplateCategory(templateCategories[0] ?? 'Solo');
  }, [initialTab, open, templateCategories]);

  useEffect(() => {
    if (!templateCategories.includes(templateCategory)) {
      setTemplateCategory(templateCategories[0] ?? 'Solo');
    }
  }, [templateCategories, templateCategory]);

  const visibleInstruments = useMemo(() => {
    const normalized = search.trim().toLowerCase();
    return INSTRUMENT_DEFINITIONS.filter((instrument) => {
      if (family !== 'All' && instrument.family !== family) return false;
      if (!normalized) return true;
      return instrument.name.toLowerCase().includes(normalized);
    });
  }, [family, search]);

  const selectedInstruments = useMemo(
    () => draft.instrumentIds.map((id, index) => ({
      id: `${id}-${index}`,
      definition: INSTRUMENT_DEFINITIONS.find((instrument) => instrument.id === id),
    })).filter((entry): entry is { id: string; definition: typeof INSTRUMENT_DEFINITIONS[number] } => Boolean(entry.definition)),
    [draft.instrumentIds],
  );

  const visibleTemplates = useMemo(
    () => templateCategory === 'All'
      ? allTemplates
      : allTemplates.filter((template) => template.category === templateCategory),
    [allTemplates, templateCategory],
  );

  if (!open) return null;

  const canCreate = selectedInstruments.length > 0;
  const selectedInstrument = selectedInstruments[selectedInstrumentIndex] ?? null;

  function updateDraft(patch: Partial<NewScoreDraft>) {
    setDraft((current) => ({ ...current, ...patch }));
  }

  function addInstrument(id: string) {
    setDraft((current) => ({ ...current, instrumentIds: [...current.instrumentIds, id] }));
    setSelectedInstrumentIndex(draft.instrumentIds.length);
  }

  function moveSelectedInstrument(direction: -1 | 1) {
    setDraft((current) => {
      const nextIndex = selectedInstrumentIndex + direction;
      if (selectedInstrumentIndex < 0 || selectedInstrumentIndex >= current.instrumentIds.length) return current;
      if (nextIndex < 0 || nextIndex >= current.instrumentIds.length) return current;
      const nextInstrumentIds = [...current.instrumentIds];
      const [moved] = nextInstrumentIds.splice(selectedInstrumentIndex, 1);
      nextInstrumentIds.splice(nextIndex, 0, moved);
      return { ...current, instrumentIds: nextInstrumentIds };
    });
    setSelectedInstrumentIndex((current) => Math.max(0, current + direction));
  }

  function removeSelectedInstrument() {
    setDraft((current) => {
      if (selectedInstrumentIndex < 0 || selectedInstrumentIndex >= current.instrumentIds.length) return current;
      const nextInstrumentIds = current.instrumentIds.filter((_, index) => index !== selectedInstrumentIndex);
      return { ...current, instrumentIds: nextInstrumentIds };
    });
    setSelectedInstrumentIndex((current) => Math.max(0, current - 1));
  }

  function applyTemplate(instrumentIds: string[]) {
    setDraft((current) => ({ ...current, instrumentIds }));
    setSelectedInstrumentIndex(0);
    setTab('info');
  }

  function handleTemplateImportChange(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (file) onImportTemplateFile?.(file);
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-stone-950/45 px-4 py-8">
      <div className="flex max-h-[92vh] w-full max-w-6xl flex-col overflow-hidden rounded-[2rem] border border-stone-200 bg-[#fcfbf7] shadow-[0_30px_120px_-40px_rgba(24,24,27,0.55)]">
        <div className="flex items-center justify-between border-b border-stone-200 px-6 py-4">
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-[0.24em] text-amber-700">{t('newScore.eyebrow')}</p>
            <h2 className="mt-1 text-2xl font-semibold tracking-tight text-stone-950">{t('newScore.title')}</h2>
          </div>
          <button
            onClick={onClose}
            className="rounded-2xl border border-stone-200 px-3 py-2 text-sm text-stone-600 transition-colors hover:bg-stone-100 hover:text-stone-900"
          >
            {t('newScore.cancel')}
          </button>
        </div>

        <div className="border-b border-stone-200 px-6 py-3">
          <div className="flex flex-wrap gap-2">
            {[
              { id: 'instruments', label: t('newScore.tabs.instruments') },
              { id: 'templates', label: t('newScore.tabs.templates') },
              { id: 'info', label: t('newScore.tabs.info') },
            ].map((item) => (
              <button
                key={item.id}
                onClick={() => setTab(item.id as DialogTab)}
                className={`rounded-full px-4 py-2 text-sm transition-colors ${
                  tab === item.id ? 'bg-stone-950 text-white' : 'bg-stone-100 text-stone-600 hover:bg-stone-200'
                }`}
              >
                {item.label}
              </button>
            ))}
          </div>
        </div>

        <div className="flex-1 overflow-auto p-6">
          {tab === 'instruments' && (
            <div className="grid gap-6 lg:grid-cols-[minmax(0,1.1fr)_minmax(320px,0.9fr)]">
              <div className="space-y-5">
                <SectionTitle
                  eyebrow={t('newScore.instruments.eyebrow')}
                  title={t('newScore.instruments.title')}
                  description={t('newScore.instruments.description')}
                />

                <div className="grid gap-3 md:grid-cols-[180px_minmax(0,1fr)]">
                  <div className="rounded-3xl border border-stone-200 bg-white p-3">
                    <p className="text-xs font-semibold uppercase tracking-wide text-stone-400">{t('newScore.family')}</p>
                    <div className="mt-3 space-y-1">
                      {NEW_SCORE_FAMILIES.map((familyOption) => (
                        <button
                          key={familyOption}
                          onClick={() => setFamily(familyOption)}
                          className={`flex w-full items-center justify-between rounded-2xl px-3 py-2 text-sm transition-colors ${
                            family === familyOption ? 'bg-amber-100 text-amber-950' : 'text-stone-600 hover:bg-stone-100'
                          }`}
                        >
                          {familyOption}
                        </button>
                      ))}
                    </div>
                  </div>

                  <div className="rounded-3xl border border-stone-200 bg-white p-4">
                    <label className="text-xs font-semibold uppercase tracking-wide text-stone-400" htmlFor="instrument-search">
                      {t('newScore.search')}
                    </label>
                    <input
                      id="instrument-search"
                      value={search}
                      onChange={(event) => setSearch(event.target.value)}
                      placeholder={t('newScore.searchPlaceholder')}
                      className="mt-2 w-full rounded-2xl border border-stone-200 px-3 py-2 text-sm outline-none transition-colors focus:border-stone-400"
                    />
                    <div className="mt-4 grid gap-2 sm:grid-cols-2">
                      {visibleInstruments.map((instrument) => (
                        <button
                          key={instrument.id}
                          onClick={() => addInstrument(instrument.id)}
                          className="rounded-2xl border border-stone-200 bg-stone-50 px-4 py-3 text-left transition-colors hover:border-amber-300 hover:bg-amber-50"
                        >
                          <div className="flex items-center justify-between gap-3">
                            <div>
                              <p className="text-sm font-semibold text-stone-900">{instrument.name}</p>
                              <p className="mt-1 text-xs text-stone-500">{instrument.family} · {instrument.staves} {instrument.staves === 1 ? 'staff' : 'staves'}</p>
                            </div>
                            <span className="rounded-full bg-stone-900 px-2 py-1 text-[11px] font-semibold uppercase tracking-wide text-white">{t('newScore.add')}</span>
                          </div>
                        </button>
                      ))}
                    </div>
                  </div>
                </div>
              </div>

              <div className="rounded-[2rem] border border-stone-200 bg-white p-5">
                <SectionTitle
                  eyebrow={t('newScore.yourScore')}
                  title={t('newScore.instrumentOrder')}
                  description={t('newScore.instrumentOrderDescription')}
                />
                <div className="mt-5 space-y-2">
                  {selectedInstruments.length === 0 ? (
                    <div className="rounded-3xl border border-dashed border-stone-200 bg-stone-50 p-6 text-sm text-stone-500">
                      {t('newScore.addInstrumentHint')}
                    </div>
                  ) : (
                    selectedInstruments.map((instrument, index) => (
                      <button
                        key={instrument.id}
                        onClick={() => setSelectedInstrumentIndex(index)}
                        className={`flex w-full items-center justify-between rounded-2xl border px-4 py-3 text-left transition-colors ${
                          selectedInstrumentIndex === index
                            ? 'border-amber-300 bg-amber-50'
                            : 'border-stone-200 hover:border-stone-300 hover:bg-stone-50'
                        }`}
                      >
                        <div>
                          <p className="text-sm font-semibold text-stone-900">{instrument.definition.name}</p>
                          <p className="mt-1 text-xs text-stone-500">{instrument.definition.family}</p>
                        </div>
                        <span className="text-xs font-semibold text-stone-400">{index + 1}</span>
                      </button>
                    ))
                  )}
                </div>

                <div className="mt-5 flex flex-wrap gap-2">
                  <button
                    onClick={() => moveSelectedInstrument(-1)}
                    disabled={!selectedInstrument || selectedInstrumentIndex === 0}
                    className="rounded-2xl bg-stone-100 px-3 py-2 text-sm text-stone-700 transition-colors hover:bg-stone-200 disabled:cursor-not-allowed disabled:opacity-40"
                  >
                    {t('newScore.moveUp')}
                  </button>
                  <button
                    onClick={() => moveSelectedInstrument(1)}
                    disabled={!selectedInstrument || selectedInstrumentIndex >= selectedInstruments.length - 1}
                    className="rounded-2xl bg-stone-100 px-3 py-2 text-sm text-stone-700 transition-colors hover:bg-stone-200 disabled:cursor-not-allowed disabled:opacity-40"
                  >
                    {t('newScore.moveDown')}
                  </button>
                  <button
                    onClick={removeSelectedInstrument}
                    disabled={!selectedInstrument}
                    className="rounded-2xl bg-red-50 px-3 py-2 text-sm text-red-700 transition-colors hover:bg-red-100 disabled:cursor-not-allowed disabled:opacity-40"
                  >
                    {t('newScore.remove')}
                  </button>
                </div>
              </div>
            </div>
          )}

          {tab === 'templates' && (
            <div className="grid gap-6 lg:grid-cols-[240px_minmax(0,1fr)]">
              <div className="rounded-[2rem] border border-stone-200 bg-white p-5">
                <SectionTitle
                  eyebrow={t('newScore.templates')}
                  title={t('newScore.tabs.templates')}
                  description={t('newScore.templatesDescription')}
                />
                <div className="mt-5 space-y-2">
                  {templateCategories.map((category) => (
                    <button
                      key={category}
                      onClick={() => setTemplateCategory(category)}
                      className={`flex w-full items-center justify-between rounded-2xl px-3 py-2 text-left text-sm transition-colors ${
                        templateCategory === category ? 'bg-sky-100 text-sky-950' : 'text-stone-600 hover:bg-stone-100'
                      }`}
                    >
                      {category}
                    </button>
                  ))}
                </div>
                {userTemplateStatus && (
                  <p className="mt-5 text-xs leading-5 text-stone-500">{userTemplateStatus}</p>
                )}
                <input
                  ref={importTemplateInputRef}
                  type="file"
                  accept=".musicxml,.nxn"
                  className="hidden"
                  onChange={handleTemplateImportChange}
                />
                <button
                  type="button"
                  onClick={() => importTemplateInputRef.current?.click()}
                  className="mt-4 w-full rounded-2xl border border-stone-200 bg-stone-50 px-3 py-2 text-left text-sm text-stone-700 transition-colors hover:border-sky-300 hover:bg-sky-50"
                >
                  Import user template file
                </button>
              </div>

              <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
                {visibleTemplates.map((template) => (
                  <button
                    key={template.id}
                    onClick={() => template.source === 'local' ? onChooseUserTemplate?.(template) : applyTemplate(template.instrumentIds)}
                    className="rounded-[2rem] border border-stone-200 bg-white p-5 text-left transition-transform hover:-translate-y-0.5 hover:border-sky-300 hover:shadow-[0_20px_60px_-36px_rgba(14,116,144,0.45)]"
                  >
                    <p className="text-[11px] font-semibold uppercase tracking-[0.24em] text-sky-700">{template.category}</p>
                    <h3 className="mt-3 text-lg font-semibold text-stone-950">{template.name}</h3>
                    <p className="mt-2 text-sm leading-6 text-stone-600">{template.description}</p>
                    <p className="mt-4 text-xs font-medium text-stone-400">
                      {template.source === 'local'
                        ? `${template.private ? 'Private local' : 'Local'} ${template.format.toUpperCase()} template`
                        : `${template.instrumentIds.length} ${template.instrumentIds.length === 1 ? 'instrument' : 'instruments'}`}
                    </p>
                  </button>
                ))}
              </div>
            </div>
          )}

          {tab === 'info' && (
            <div className="grid gap-6 lg:grid-cols-[minmax(0,1.1fr)_minmax(320px,0.9fr)]">
              <div className="rounded-[2rem] border border-stone-200 bg-white p-5">
                <SectionTitle
                  eyebrow={t('newScore.info.eyebrow')}
                  title={t('newScore.info.title')}
                  description={t('newScore.info.description')}
                />

                <div className="mt-6 grid gap-4 md:grid-cols-2">
                  <label className="text-sm text-stone-700">
                    {t('newScore.field.title')}
                    <input
                      aria-label="Title"
                      value={draft.title}
                      onChange={(event) => updateDraft({ title: event.target.value })}
                      className="mt-2 w-full rounded-2xl border border-stone-200 px-3 py-2 text-sm outline-none transition-colors focus:border-stone-400"
                    />
                  </label>
                  <label className="text-sm text-stone-700">
                    {t('newScore.field.composer')}
                    <input
                      aria-label="Composer"
                      value={draft.composer}
                      onChange={(event) => updateDraft({ composer: event.target.value })}
                      className="mt-2 w-full rounded-2xl border border-stone-200 px-3 py-2 text-sm outline-none transition-colors focus:border-stone-400"
                    />
                  </label>
                  <label className="text-sm text-stone-700">
                    {t('newScore.field.subtitle')}
                    <input
                      aria-label="Subtitle"
                      value={draft.subtitle}
                      onChange={(event) => updateDraft({ subtitle: event.target.value })}
                      className="mt-2 w-full rounded-2xl border border-stone-200 px-3 py-2 text-sm outline-none transition-colors focus:border-stone-400"
                    />
                  </label>
                  <label className="text-sm text-stone-700">
                    {t('newScore.field.lyricist')}
                    <input
                      aria-label="Lyricist"
                      value={draft.lyricist}
                      onChange={(event) => updateDraft({ lyricist: event.target.value })}
                      className="mt-2 w-full rounded-2xl border border-stone-200 px-3 py-2 text-sm outline-none transition-colors focus:border-stone-400"
                    />
                  </label>
                </div>

                <label className="mt-4 block text-sm text-stone-700">
                  {t('newScore.field.copyright')}
                  <input
                    aria-label="Copyright"
                    value={draft.copyright}
                    onChange={(event) => updateDraft({ copyright: event.target.value })}
                    className="mt-2 w-full rounded-2xl border border-stone-200 px-3 py-2 text-sm outline-none transition-colors focus:border-stone-400"
                  />
                </label>

                <div className="mt-6 grid gap-4 md:grid-cols-2">
                  <label className="text-sm text-stone-700">
                    {t('newScore.field.key')}
                    <select
                      aria-label="Key signature"
                      value={draft.keySignatureId}
                      onChange={(event) => updateDraft({ keySignatureId: event.target.value })}
                      className="mt-2 w-full rounded-2xl border border-stone-200 bg-white px-3 py-2 text-sm outline-none transition-colors focus:border-stone-400"
                    >
                      {KEY_SIGNATURE_OPTIONS.map((option) => (
                        <option key={option.id} value={option.id}>{option.label}</option>
                      ))}
                    </select>
                  </label>
                  <div className="grid grid-cols-2 gap-3">
                    <label className="text-sm text-stone-700">
                      {t('newScore.field.beats')}
                      <input
                        aria-label="Time beats"
                        type="number"
                        min={1}
                        max={32}
                        value={draft.timeBeats}
                        onChange={(event) => updateDraft({ timeBeats: Number(event.target.value) || 1 })}
                        className="mt-2 w-full rounded-2xl border border-stone-200 px-3 py-2 text-sm outline-none transition-colors focus:border-stone-400"
                      />
                    </label>
                    <label className="text-sm text-stone-700">
                      {t('newScore.field.beatValue')}
                      <select
                        aria-label="Time beat type"
                        value={draft.timeBeatType}
                        onChange={(event) => updateDraft({ timeBeatType: Number(event.target.value) })}
                        className="mt-2 w-full rounded-2xl border border-stone-200 bg-white px-3 py-2 text-sm outline-none transition-colors focus:border-stone-400"
                      >
                        {[1, 2, 4, 8, 16].map((value) => (
                          <option key={value} value={value}>{value}</option>
                        ))}
                      </select>
                    </label>
                  </div>
                </div>

                <div className="mt-6 rounded-3xl bg-stone-50 p-4">
                  <p className="text-sm font-semibold text-stone-900">{t('newScore.tempo')}</p>
                  <div className="mt-3 grid gap-3 md:grid-cols-[minmax(0,1fr)_180px]">
                    <label className="text-sm text-stone-700">
                      {t('newScore.startingTempo')}
                      <input
                        aria-label="Tempo bpm"
                        type="number"
                        min={20}
                        max={320}
                        value={draft.tempo.bpm}
                        onChange={(event) => setDraft((current) => ({
                          ...current,
                          tempo: { ...current.tempo, bpm: Number(event.target.value) || 20 },
                        }))}
                        className="mt-2 w-full rounded-2xl border border-stone-200 px-3 py-2 text-sm outline-none transition-colors focus:border-stone-400"
                      />
                    </label>
                    <label className="text-sm text-stone-700">
                      {t('newScore.beatUnit')}
                      <select
                        aria-label="Tempo beat unit"
                        value={draft.tempo.beatUnit}
                        onChange={(event) => setDraft((current) => ({
                          ...current,
                          tempo: { ...current.tempo, beatUnit: event.target.value as NewScoreDraft['tempo']['beatUnit'] },
                        }))}
                        className="mt-2 w-full rounded-2xl border border-stone-200 bg-white px-3 py-2 text-sm outline-none transition-colors focus:border-stone-400"
                      >
                        {BEAT_UNIT_OPTIONS.map((option) => (
                          <option key={option.value} value={option.value}>{option.label}</option>
                        ))}
                      </select>
                    </label>
                  </div>
                  <label className="mt-4 flex items-center gap-3 text-sm text-stone-700">
                    <input
                      aria-label="Show tempo marking"
                      type="checkbox"
                      checked={draft.tempo.showMarking}
                      onChange={(event) => setDraft((current) => ({
                        ...current,
                        tempo: { ...current.tempo, showMarking: event.target.checked },
                      }))}
                      className="h-4 w-4 rounded border-stone-300 text-stone-900"
                    />
                    {t('newScore.showTempo')}
                  </label>
                </div>

                <div className="mt-6 rounded-3xl bg-stone-50 p-4">
                  <p className="text-sm font-semibold text-stone-900">{t('newScore.measures')}</p>
                  <div className="mt-3 grid gap-3 md:grid-cols-2">
                    <label className="text-sm text-stone-700">
                      {t('newScore.initialMeasures')}
                      <input
                        aria-label="Initial number of measures"
                        type="number"
                        min={1}
                        max={256}
                        value={draft.measureCount}
                        onChange={(event) => updateDraft({ measureCount: Number(event.target.value) || 1 })}
                        className="mt-2 w-full rounded-2xl border border-stone-200 px-3 py-2 text-sm outline-none transition-colors focus:border-stone-400"
                      />
                    </label>
                    <div className="rounded-2xl border border-stone-200 bg-white px-4 py-3 text-sm text-stone-600">
                      {selectedInstruments.length} {selectedInstruments.length === 1 ? 'instrument' : 'instruments'} selected
                    </div>
                  </div>
                  <label className="mt-4 flex items-center gap-3 text-sm text-stone-700">
                    <input
                      aria-label="Create pickup measure"
                      type="checkbox"
                      checked={draft.pickup.enabled}
                      onChange={(event) => setDraft((current) => ({
                        ...current,
                        pickup: { ...current.pickup, enabled: event.target.checked },
                      }))}
                      className="h-4 w-4 rounded border-stone-300 text-stone-900"
                    />
                    {t('newScore.createPickup')}
                  </label>
                  {draft.pickup.enabled && (
                    <div className="mt-4 grid gap-3 md:grid-cols-2">
                      <label className="text-sm text-stone-700">
                        {t('newScore.pickupBeats')}
                        <input
                          aria-label="Pickup beats"
                          type="number"
                          min={1}
                          max={32}
                          value={draft.pickup.beats}
                          onChange={(event) => setDraft((current) => ({
                            ...current,
                            pickup: { ...current.pickup, beats: Number(event.target.value) || 1 },
                          }))}
                          className="mt-2 w-full rounded-2xl border border-stone-200 px-3 py-2 text-sm outline-none transition-colors focus:border-stone-400"
                        />
                      </label>
                      <label className="text-sm text-stone-700">
                        {t('newScore.pickupBeatValue')}
                        <select
                          aria-label="Pickup beat type"
                          value={draft.pickup.beatType}
                          onChange={(event) => setDraft((current) => ({
                            ...current,
                            pickup: { ...current.pickup, beatType: Number(event.target.value) },
                          }))}
                          className="mt-2 w-full rounded-2xl border border-stone-200 bg-white px-3 py-2 text-sm outline-none transition-colors focus:border-stone-400"
                        >
                          {[1, 2, 4, 8, 16].map((value) => (
                            <option key={value} value={value}>{value}</option>
                          ))}
                        </select>
                      </label>
                    </div>
                  )}
                </div>
              </div>

              <div className="space-y-4">
                <div className="rounded-[2rem] border border-stone-200 bg-white p-5">
                  <SectionTitle
                    eyebrow={t('newScore.summary')}
                    title={draft.title.trim() || t('newScore.untitled')}
                    description={t('newScore.summaryDescription')}
                  />
                  <div className="mt-5 grid gap-3">
                    <div className="rounded-2xl bg-stone-100 px-4 py-3 text-sm text-stone-700">
                      {selectedInstruments.map((instrument) => instrument.definition.name).join(' · ') || t('newScore.noInstruments')}
                    </div>
                    <div className="grid grid-cols-2 gap-3">
                      <div className="rounded-2xl bg-amber-50 px-4 py-3">
                        <p className="text-[11px] font-semibold uppercase tracking-wide text-amber-700">{t('newScore.time')}</p>
                        <p className="mt-1 text-sm font-semibold text-amber-950">{draft.timeBeats}/{draft.timeBeatType}</p>
                      </div>
                      <div className="rounded-2xl bg-sky-50 px-4 py-3">
                        <p className="text-[11px] font-semibold uppercase tracking-wide text-sky-700">{t('newScore.tempo')}</p>
                        <p className="mt-1 text-sm font-semibold text-sky-950">{draft.tempo.bpm} bpm</p>
                      </div>
                    </div>
                    <div className="grid grid-cols-2 gap-3">
                      <div className="rounded-2xl bg-emerald-50 px-4 py-3">
                        <p className="text-[11px] font-semibold uppercase tracking-wide text-emerald-700">{t('newScore.measures')}</p>
                        <p className="mt-1 text-sm font-semibold text-emerald-950">{draft.measureCount + (draft.pickup.enabled ? 1 : 0)}</p>
                      </div>
                      <div className="rounded-2xl bg-rose-50 px-4 py-3">
                        <p className="text-[11px] font-semibold uppercase tracking-wide text-rose-700">{t('newScore.pickup')}</p>
                        <p className="mt-1 text-sm font-semibold text-rose-950">{draft.pickup.enabled ? `${draft.pickup.beats}/${draft.pickup.beatType}` : t('newScore.none')}</p>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>

        <div className="flex items-center justify-between border-t border-stone-200 px-6 py-4">
          <p className="text-sm text-stone-500">
            {canCreate ? `${selectedInstruments.length} instrument${selectedInstruments.length === 1 ? '' : 's'} selected` : t('newScore.selectToContinue')}
          </p>
          <div className="flex items-center gap-3">
            {tab !== 'info' && (
              <button
                onClick={() => setTab(tab === 'instruments' ? 'templates' : 'info')}
                className="rounded-2xl bg-stone-100 px-4 py-2.5 text-sm font-medium text-stone-700 transition-colors hover:bg-stone-200"
              >
                {t('newScore.next')}
              </button>
            )}
            <button
              onClick={() => onCreate(draft)}
              disabled={!canCreate}
              className="rounded-2xl bg-stone-950 px-4 py-2.5 text-sm font-medium text-white transition-colors hover:bg-stone-800 disabled:cursor-not-allowed disabled:bg-stone-300"
            >
              {t('newScore.createScore')}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
