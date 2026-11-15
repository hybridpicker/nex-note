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

function SectionTitle({ eyebrow, title, description, tone = 'light' }: { eyebrow: string; title: string; description: string; tone?: 'light' | 'dark' }) {
  return (
    <div>
      <p className={`text-[11px] font-bold uppercase tracking-[0.26em] ${tone === 'dark' ? 'text-nex-cyan' : 'text-nex-accent'}`}>{eyebrow}</p>
      <h3 className={`mt-2 text-2xl font-semibold tracking-[-0.025em] ${tone === 'dark' ? 'text-white' : 'text-nex-ink'}`}>{title}</h3>
      <p className={`mt-2 max-w-xl text-sm leading-6 ${tone === 'dark' ? 'text-white/70' : 'text-slate-500'}`}>{description}</p>
    </div>
  );
}

function InstrumentMark({ name, family }: { name: string; family: string }) {
  const initials = name.split(/\s+/).map((part) => part[0]).join('').slice(0, 2);
  return (
    <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border border-slate-200 bg-white text-[11px] font-bold tracking-wide text-slate-700 shadow-sm" aria-hidden="true">
      {initials || family.slice(0, 2)}
    </span>
  );
}

function MiniatureStaff({ parts }: { parts: number }) {
  return (
    <div className="relative h-16 overflow-hidden rounded-xl border border-slate-200 bg-[#fffefb]" aria-hidden="true">
      {[15, 23, 31, 39, 47].map((top) => <span key={top} className="absolute left-3 right-3 h-px bg-slate-200" style={{ top }} />)}
      {Array.from({ length: Math.min(parts, 5) }).map((_, index) => (
        <span key={index} className="absolute h-2.5 w-3 -rotate-12 rounded-[50%] bg-slate-700" style={{ left: `${18 + index * 15}%`, top: 25 + (index % 3) * 5 }} />
      ))}
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

  const tabItems: Array<{ id: DialogTab; number: string; kicker: string; label: string }> = [
    { id: 'instruments', number: '01', kicker: 'Build', label: t('newScore.tabs.instruments') },
    { id: 'templates', number: '02', kicker: 'Explore', label: t('newScore.tabs.templates') },
    { id: 'info', number: '03', kicker: 'Refine', label: t('newScore.tabs.info') },
  ];

  return (
    <div className="nex-score-studio-backdrop fixed inset-0 z-50 flex items-center justify-center px-3 py-3 sm:px-5 sm:py-5">
      <div className="nex-score-studio flex max-h-[96vh] w-full max-w-[1380px] flex-col overflow-hidden rounded-[1.75rem] border border-white/20 shadow-[0_38px_140px_-30px_rgba(0,0,0,0.72)]">
        <div className="flex items-center justify-between border-b border-slate-200/80 bg-white/75 px-5 py-4 backdrop-blur-md sm:px-7">
          <div className="flex items-center gap-4">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-nex-ink text-lg font-light text-white">♩</div>
            <div>
              <p className="text-[11px] font-bold uppercase tracking-[0.26em] text-nex-accent">Score studio</p>
              <h2 className="mt-0.5 text-xl font-semibold tracking-tight text-nex-ink">{t('newScore.title')}</h2>
            </div>
          </div>
          <button
            onClick={onClose}
            className="flex h-10 items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 text-sm font-medium text-slate-500 transition hover:border-slate-300 hover:text-nex-ink"
          >
            <span>{t('newScore.cancel')}</span><span aria-hidden="true">×</span>
          </button>
        </div>

        <div className="border-b border-slate-200/80 bg-white/55 px-5 sm:px-7">
          <div className="grid max-w-3xl grid-cols-3">
            {tabItems.map((item) => (
              <button
                key={item.id}
                onClick={() => setTab(item.id)}
                className={`relative flex items-center gap-3 border-b-2 px-1 py-3 text-left transition ${
                  tab === item.id ? 'border-nex-accent' : 'border-transparent hover:border-slate-300'
                }`}
              >
                <span className={`text-[11px] font-bold ${tab === item.id ? 'text-nex-accent' : 'text-slate-500'}`}>{item.number}</span>
                <span className="min-w-0">
                  <span className="hidden text-[11px] font-bold uppercase tracking-[0.2em] text-slate-500 sm:block">{item.kicker}</span>
                  <span className={`block truncate text-xs font-semibold sm:text-sm ${tab === item.id ? 'text-nex-ink' : 'text-slate-500'}`}>{item.label}</span>
                </span>
              </button>
            ))}
          </div>
        </div>

        <div className="flex-1 overflow-auto p-4 sm:p-7">
          {tab === 'instruments' && (
            <div className="grid gap-7 lg:grid-cols-[minmax(0,1.25fr)_minmax(340px,0.75fr)]">
              <div className="space-y-5">
                <SectionTitle
                  eyebrow={t('newScore.instruments.eyebrow')}
                  title={t('newScore.instruments.title')}
                  description={t('newScore.instruments.description')}
                />

                <div className="grid gap-3 md:grid-cols-[170px_minmax(0,1fr)]">
                  <div className="rounded-2xl border border-slate-200 bg-white/75 p-3 shadow-[0_14px_45px_-38px_rgba(15,23,42,0.45)]">
                    <p className="px-2 text-[11px] font-bold uppercase tracking-[0.2em] text-slate-500">{t('newScore.family')}</p>
                    <div className="mt-3 space-y-1">
                      {NEW_SCORE_FAMILIES.map((familyOption) => (
                        <button
                          key={familyOption}
                          onClick={() => setFamily(familyOption)}
                          className={`flex w-full items-center justify-between rounded-xl px-3 py-2 text-sm transition-colors ${
                            family === familyOption ? 'bg-nex-ink text-white shadow-sm' : 'text-slate-600 hover:bg-slate-100'
                          }`}
                        >
                          {familyOption}
                          {family === familyOption && <span className="text-[11px] text-white/50">●</span>}
                        </button>
                      ))}
                    </div>
                  </div>

                  <div className="rounded-2xl border border-slate-200 bg-white/90 p-4 shadow-[0_18px_60px_-46px_rgba(15,23,42,0.55)]">
                    <label className="text-[11px] font-bold uppercase tracking-[0.2em] text-slate-500" htmlFor="instrument-search">
                      {t('newScore.search')}
                    </label>
                    <input
                      id="instrument-search"
                      value={search}
                      onChange={(event) => setSearch(event.target.value)}
                      placeholder={t('newScore.searchPlaceholder')}
                      className="mt-2 w-full rounded-xl border border-slate-200 bg-slate-50/70 px-3 py-2.5 text-sm outline-none transition focus:border-nex-accent focus:bg-white focus:ring-2 focus:ring-nex-accent/10"
                    />
                    <div className="mt-4 grid gap-2 sm:grid-cols-2">
                      {visibleInstruments.map((instrument) => (
                        <button
                          key={instrument.id}
                          onClick={() => addInstrument(instrument.id)}
                          className="group rounded-2xl border border-slate-200 bg-white px-3 py-3 text-left transition hover:-translate-y-0.5 hover:border-nex-accent/35 hover:shadow-[0_14px_32px_-24px_rgba(79,70,255,0.55)]"
                        >
                          <div className="flex items-center justify-between gap-3">
                            <InstrumentMark name={instrument.name} family={instrument.family} />
                            <div className="min-w-0 flex-1">
                              <p className="text-sm font-semibold text-slate-900">{instrument.name}</p>
                              <p className="mt-1 text-xs text-slate-500">{instrument.family} · {instrument.staves} {instrument.staves === 1 ? 'staff' : 'staves'}</p>
                            </div>
                            <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-slate-100 text-base text-slate-500 transition group-hover:bg-nex-accent group-hover:text-white" aria-label={t('newScore.add')}>+</span>
                          </div>
                        </button>
                      ))}
                    </div>
                  </div>
                </div>
              </div>

              <div className="self-start rounded-2xl border border-slate-200 bg-[#111522] p-5 text-white shadow-[0_28px_70px_-42px_rgba(11,15,20,0.9)] lg:sticky lg:top-0">
                <SectionTitle
                  eyebrow={t('newScore.yourScore')}
                  title={t('newScore.instrumentOrder')}
                  description={t('newScore.instrumentOrderDescription')}
                  tone="dark"
                />
                <div className="mt-5 space-y-2">
                  {selectedInstruments.length === 0 ? (
                    <div className="rounded-2xl border border-dashed border-white/20 bg-white/5 p-6 text-sm leading-6 text-white/70">
                      {t('newScore.addInstrumentHint')}
                    </div>
                  ) : (
                    selectedInstruments.map((instrument, index) => (
                      <button
                        key={instrument.id}
                        onClick={() => setSelectedInstrumentIndex(index)}
                        className={`flex w-full items-center justify-between rounded-xl border px-3 py-3 text-left transition ${
                          selectedInstrumentIndex === index
                            ? 'border-nex-cyan/50 bg-white/12'
                            : 'border-white/10 bg-white/[0.04] hover:border-white/25 hover:bg-white/[0.08]'
                        }`}
                      >
                        <div className="flex items-center gap-3">
                          <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-white/10 text-[11px] font-bold text-white/70">{index + 1}</span>
                          <div>
                            <p className="text-sm font-semibold text-white">{instrument.definition.name}</p>
                            <p className="mt-1 text-xs text-white/70">{instrument.definition.family}</p>
                          </div>
                        </div>
                        <span className="text-white/25">⠿</span>
                      </button>
                    ))
                  )}
                </div>

                <div className="mt-5 flex flex-wrap gap-2">
                  <button
                    onClick={() => moveSelectedInstrument(-1)}
                    disabled={!selectedInstrument || selectedInstrumentIndex === 0}
                    className="rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-xs font-semibold text-white/80 transition hover:bg-white/10 disabled:cursor-not-allowed disabled:opacity-30"
                  >
                    {t('newScore.moveUp')}
                  </button>
                  <button
                    onClick={() => moveSelectedInstrument(1)}
                    disabled={!selectedInstrument || selectedInstrumentIndex >= selectedInstruments.length - 1}
                    className="rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-xs font-semibold text-white/80 transition hover:bg-white/10 disabled:cursor-not-allowed disabled:opacity-30"
                  >
                    {t('newScore.moveDown')}
                  </button>
                  <button
                    onClick={removeSelectedInstrument}
                    disabled={!selectedInstrument}
                    className="rounded-xl border border-rose-400/15 bg-rose-400/10 px-3 py-2 text-xs font-semibold text-rose-200 transition hover:bg-rose-400/20 disabled:cursor-not-allowed disabled:opacity-30"
                  >
                    {t('newScore.remove')}
                  </button>
                </div>
              </div>
            </div>
          )}

          {tab === 'templates' && (
            <div className="grid gap-6 lg:grid-cols-[230px_minmax(0,1fr)]">
              <div className="self-start rounded-2xl border border-slate-200 bg-white/80 p-5 lg:sticky lg:top-0">
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
                      className={`flex w-full items-center justify-between rounded-xl px-3 py-2 text-left text-sm transition-colors ${
                        templateCategory === category ? 'bg-nex-ink text-white' : 'text-slate-600 hover:bg-slate-100'
                      }`}
                    >
                      {category}
                    </button>
                  ))}
                </div>
                {userTemplateStatus && (
                  <p className="mt-5 text-xs leading-5 text-slate-500">{userTemplateStatus}</p>
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
                  className="mt-4 w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 text-left text-xs font-semibold text-slate-700 transition hover:border-nex-accent/30 hover:bg-nex-accent-muted"
                >
                  Import user template file
                </button>
              </div>

              <div className="grid content-start gap-3 md:grid-cols-2 xl:grid-cols-3">
                {visibleTemplates.map((template) => (
                  <button
                    key={template.id}
                    onClick={() => template.source === 'local' ? onChooseUserTemplate?.(template) : applyTemplate(template.instrumentIds)}
                    className="group flex min-h-[250px] flex-col rounded-2xl border border-slate-200 bg-white p-4 text-left transition hover:-translate-y-1 hover:border-nex-accent/35 hover:shadow-[0_22px_55px_-34px_rgba(79,70,255,0.55)]"
                  >
                    <MiniatureStaff parts={template.source === 'built-in' ? template.instrumentIds.length : 1} />
                    <p className="mt-4 text-[11px] font-bold uppercase tracking-[0.22em] text-nex-accent">{template.category}</p>
                    <h3 className="mt-2 text-lg font-semibold tracking-tight text-slate-950">{template.name}</h3>
                    <p className="mt-1 text-xs leading-5 text-slate-500">{template.description}</p>
                    <p className="mt-auto pt-4 text-xs font-semibold text-slate-500 transition group-hover:text-nex-accent">
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
            <div className="grid gap-6 lg:grid-cols-[minmax(0,1.12fr)_minmax(340px,0.88fr)]">
              <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-[0_18px_60px_-48px_rgba(15,23,42,0.55)] sm:p-6">
                <SectionTitle
                  eyebrow={t('newScore.info.eyebrow')}
                  title={t('newScore.info.title')}
                  description={t('newScore.info.description')}
                />

                <div className="mt-6 grid gap-4 md:grid-cols-2">
                  <label className="text-sm text-slate-700">
                    {t('newScore.field.title')}
                    <input
                      aria-label="Title"
                      value={draft.title}
                      onChange={(event) => updateDraft({ title: event.target.value })}
                      className="mt-2 w-full rounded-xl border border-slate-200 bg-slate-50/60 px-3 py-2.5 text-sm outline-none transition focus:border-nex-accent focus:bg-white focus:ring-2 focus:ring-nex-accent/10"
                    />
                  </label>
                  <label className="text-sm text-slate-700">
                    {t('newScore.field.composer')}
                    <input
                      aria-label="Composer"
                      value={draft.composer}
                      onChange={(event) => updateDraft({ composer: event.target.value })}
                      className="mt-2 w-full rounded-xl border border-slate-200 bg-slate-50/60 px-3 py-2.5 text-sm outline-none transition focus:border-nex-accent focus:bg-white focus:ring-2 focus:ring-nex-accent/10"
                    />
                  </label>
                  <label className="text-sm text-slate-700">
                    {t('newScore.field.subtitle')}
                    <input
                      aria-label="Subtitle"
                      value={draft.subtitle}
                      onChange={(event) => updateDraft({ subtitle: event.target.value })}
                      className="mt-2 w-full rounded-xl border border-slate-200 bg-slate-50/60 px-3 py-2.5 text-sm outline-none transition focus:border-nex-accent focus:bg-white focus:ring-2 focus:ring-nex-accent/10"
                    />
                  </label>
                  <label className="text-sm text-slate-700">
                    {t('newScore.field.lyricist')}
                    <input
                      aria-label="Lyricist"
                      value={draft.lyricist}
                      onChange={(event) => updateDraft({ lyricist: event.target.value })}
                      className="mt-2 w-full rounded-xl border border-slate-200 bg-slate-50/60 px-3 py-2.5 text-sm outline-none transition focus:border-nex-accent focus:bg-white focus:ring-2 focus:ring-nex-accent/10"
                    />
                  </label>
                </div>

                <label className="mt-4 block text-sm text-slate-700">
                  {t('newScore.field.copyright')}
                  <input
                    aria-label="Copyright"
                    value={draft.copyright}
                    onChange={(event) => updateDraft({ copyright: event.target.value })}
                    className="mt-2 w-full rounded-xl border border-slate-200 bg-slate-50/60 px-3 py-2.5 text-sm outline-none transition focus:border-nex-accent focus:bg-white focus:ring-2 focus:ring-nex-accent/10"
                  />
                </label>

                <div className="mt-6 grid gap-4 md:grid-cols-2">
                  <label className="text-sm text-slate-700">
                    {t('newScore.field.key')}
                    <select
                      aria-label="Key signature"
                      value={draft.keySignatureId}
                      onChange={(event) => updateDraft({ keySignatureId: event.target.value })}
                      className="mt-2 w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm outline-none transition focus:border-nex-accent focus:ring-2 focus:ring-nex-accent/10"
                    >
                      {KEY_SIGNATURE_OPTIONS.map((option) => (
                        <option key={option.id} value={option.id}>{option.label}</option>
                      ))}
                    </select>
                  </label>
                  <div className="grid grid-cols-2 gap-3">
                    <label className="text-sm text-slate-700">
                      {t('newScore.field.beats')}
                      <input
                        aria-label="Time beats"
                        type="number"
                        min={1}
                        max={32}
                        value={draft.timeBeats}
                        onChange={(event) => updateDraft({ timeBeats: Number(event.target.value) || 1 })}
                        className="mt-2 w-full rounded-xl border border-slate-200 bg-slate-50/60 px-3 py-2.5 text-sm outline-none transition focus:border-nex-accent focus:bg-white focus:ring-2 focus:ring-nex-accent/10"
                      />
                    </label>
                    <label className="text-sm text-slate-700">
                      {t('newScore.field.beatValue')}
                      <select
                        aria-label="Time beat type"
                        value={draft.timeBeatType}
                        onChange={(event) => updateDraft({ timeBeatType: Number(event.target.value) })}
                        className="mt-2 w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm outline-none transition focus:border-nex-accent focus:ring-2 focus:ring-nex-accent/10"
                      >
                        {[1, 2, 4, 8, 16].map((value) => (
                          <option key={value} value={value}>{value}</option>
                        ))}
                      </select>
                    </label>
                  </div>
                </div>

                <div className="mt-6 rounded-2xl border border-slate-200/70 bg-slate-50/70 p-4">
                  <p className="text-sm font-semibold text-slate-900">{t('newScore.tempo')}</p>
                  <div className="mt-3 grid gap-3 md:grid-cols-[minmax(0,1fr)_180px]">
                    <label className="text-sm text-slate-700">
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
                        className="mt-2 w-full rounded-xl border border-slate-200 bg-slate-50/60 px-3 py-2.5 text-sm outline-none transition focus:border-nex-accent focus:bg-white focus:ring-2 focus:ring-nex-accent/10"
                      />
                    </label>
                    <label className="text-sm text-slate-700">
                      {t('newScore.beatUnit')}
                      <select
                        aria-label="Tempo beat unit"
                        value={draft.tempo.beatUnit}
                        onChange={(event) => setDraft((current) => ({
                          ...current,
                          tempo: { ...current.tempo, beatUnit: event.target.value as NewScoreDraft['tempo']['beatUnit'] },
                        }))}
                        className="mt-2 w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm outline-none transition focus:border-nex-accent focus:ring-2 focus:ring-nex-accent/10"
                      >
                        {BEAT_UNIT_OPTIONS.map((option) => (
                          <option key={option.value} value={option.value}>{option.label}</option>
                        ))}
                      </select>
                    </label>
                  </div>
                  <label className="mt-4 flex items-center gap-3 text-sm text-slate-700">
                    <input
                      aria-label="Show tempo marking"
                      type="checkbox"
                      checked={draft.tempo.showMarking}
                      onChange={(event) => setDraft((current) => ({
                        ...current,
                        tempo: { ...current.tempo, showMarking: event.target.checked },
                      }))}
                      className="h-4 w-4 rounded border-slate-300 text-slate-900"
                    />
                    {t('newScore.showTempo')}
                  </label>
                </div>

                <div className="mt-6 rounded-2xl border border-slate-200/70 bg-slate-50/70 p-4">
                  <p className="text-sm font-semibold text-slate-900">{t('newScore.measures')}</p>
                  <div className="mt-3 grid gap-3 md:grid-cols-2">
                    <label className="text-sm text-slate-700">
                      {t('newScore.initialMeasures')}
                      <input
                        aria-label="Initial number of measures"
                        type="number"
                        min={1}
                        max={256}
                        value={draft.measureCount}
                        onChange={(event) => updateDraft({ measureCount: Number(event.target.value) || 1 })}
                        className="mt-2 w-full rounded-xl border border-slate-200 bg-slate-50/60 px-3 py-2.5 text-sm outline-none transition focus:border-nex-accent focus:bg-white focus:ring-2 focus:ring-nex-accent/10"
                      />
                    </label>
                    <div className="rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-600">
                      {selectedInstruments.length} {selectedInstruments.length === 1 ? 'instrument' : 'instruments'} selected
                    </div>
                  </div>
                  <label className="mt-4 flex items-center gap-3 text-sm text-slate-700">
                    <input
                      aria-label="Create pickup measure"
                      type="checkbox"
                      checked={draft.pickup.enabled}
                      onChange={(event) => setDraft((current) => ({
                        ...current,
                        pickup: { ...current.pickup, enabled: event.target.checked },
                      }))}
                      className="h-4 w-4 rounded border-slate-300 text-slate-900"
                    />
                    {t('newScore.createPickup')}
                  </label>
                  {draft.pickup.enabled && (
                    <div className="mt-4 grid gap-3 md:grid-cols-2">
                      <label className="text-sm text-slate-700">
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
                          className="mt-2 w-full rounded-xl border border-slate-200 bg-slate-50/60 px-3 py-2.5 text-sm outline-none transition focus:border-nex-accent focus:bg-white focus:ring-2 focus:ring-nex-accent/10"
                        />
                      </label>
                      <label className="text-sm text-slate-700">
                        {t('newScore.pickupBeatValue')}
                        <select
                          aria-label="Pickup beat type"
                          value={draft.pickup.beatType}
                          onChange={(event) => setDraft((current) => ({
                            ...current,
                            pickup: { ...current.pickup, beatType: Number(event.target.value) },
                          }))}
                          className="mt-2 w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm outline-none transition focus:border-nex-accent focus:ring-2 focus:ring-nex-accent/10"
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

              <div className="space-y-4 lg:sticky lg:top-0 lg:self-start">
                <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-[0_24px_65px_-46px_rgba(15,23,42,0.55)]">
                  <SectionTitle
                    eyebrow={t('newScore.summary')}
                    title={draft.title.trim() || t('newScore.untitled')}
                    description={t('newScore.summaryDescription')}
                  />
                  <div className="mt-5 grid gap-3">
                    <MiniatureStaff parts={selectedInstruments.length} />
                    <div className="rounded-2xl bg-slate-100 px-4 py-3 text-sm text-slate-700">
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

        <div className="flex items-center justify-between border-t border-slate-200 bg-white/80 px-5 py-4 backdrop-blur sm:px-7">
          <p className="text-xs font-medium text-slate-500 sm:text-sm">
            {canCreate ? `${selectedInstruments.length} instrument${selectedInstruments.length === 1 ? '' : 's'} selected` : t('newScore.selectToContinue')}
          </p>
          <div className="flex items-center gap-3">
            {tab !== 'info' && (
              <button
                onClick={() => setTab('info')}
                disabled={!canCreate}
                className="rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-semibold text-slate-700 transition hover:border-slate-300 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-40"
              >
                {t('newScore.next')}
              </button>
            )}
            <button
              onClick={() => onCreate(draft)}
              disabled={!canCreate}
              className="group flex items-center gap-5 rounded-xl bg-nex-ink px-5 py-2.5 text-sm font-semibold text-white shadow-[0_14px_30px_-18px_rgba(11,15,20,0.8)] transition hover:bg-nex-accent disabled:cursor-not-allowed disabled:bg-slate-300 disabled:shadow-none"
            >
              {t('newScore.createScore')} <span className="transition-transform group-hover:translate-x-0.5">→</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
