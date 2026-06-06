'use client';

import React, { useEffect, useRef, useState } from 'react';
import type { SelectedNote, ArticulationKind, DynamicKind, BarlineKind } from '@/hooks/useNoteEditor';
import { BarlineGlyph } from '@/components/NotationGlyphs';
import { useI18n, type TranslationKey } from '@/lib/i18n';
import { formatShortcutHint } from '@/lib/shortcut-hints';

interface Props {
  selectedNote: SelectedNote | null;
  selectedNotes: SelectedNote[];
  selectedBarlineMeasureNumber?: number | null;
  onToggleArticulation: (a: ArticulationKind) => void;
  onClearArticulations: () => void;
  onAddDynamic: (d: DynamicKind) => void;
  onToggleTie: () => void;
  onToggleSlur: () => void;
  onTransposeSemitones: (n: number) => void;
  onSetBarline: (b: BarlineKind) => void;
  onDuplicateSelection: () => void;
  onDeleteSelection: () => void;
  onClearSelection: () => void;
  onCopySelection: () => void;
  onCutSelection: () => void;
  onPasteClipboard: () => void;
  clipboardCount: number;
  iconMode?: boolean;
}

export type EditPaletteSectionId = 'selection' | 'transpose' | 'articulations' | 'dynamics' | 'ties' | 'barlines';

type SectionId = EditPaletteSectionId;

const DEFAULT_OPEN: Record<SectionId, boolean> = {
  selection: true,
  transpose: true,
  articulations: true,
  dynamics: false,
  ties: false,
  barlines: false,
};

const ARTICULATIONS: { kind: ArticulationKind; label: string; title: string }[] = [
  { kind: 'staccato',      label: '·',  title: 'Staccato' },
  { kind: 'staccatissimo', label: '▾',  title: 'Staccatissimo' },
  { kind: 'accent',        label: '>',  title: 'Accent' },
  { kind: 'strong-accent', label: '^',  title: 'Marcato' },
  { kind: 'tenuto',        label: '‒',  title: 'Tenuto' },
  { kind: 'fermata',       label: '𝄐',  title: 'Fermata' },
];

const DYNAMICS: { kind: DynamicKind; label: string }[] = [
  { kind: 'pp',  label: 'pp'  },
  { kind: 'p',   label: 'p'   },
  { kind: 'mp',  label: 'mp'  },
  { kind: 'mf',  label: 'mf'  },
  { kind: 'f',   label: 'f'   },
  { kind: 'ff',  label: 'ff'  },
  { kind: 'fff', label: 'fff' },
  { kind: 'sfz', label: 'sfz' },
];

const BARLINES: { kind: BarlineKind; label: React.ReactNode; title: string }[] = [
  { kind: 'regular',      label: <BarlineGlyph barline="regular" />,      title: 'Regular barline' },
  { kind: 'double',       label: <BarlineGlyph barline="double" />,       title: 'Double barline' },
  { kind: 'final',        label: <BarlineGlyph barline="final" />,        title: 'Final barline' },
  { kind: 'repeat-start', label: <BarlineGlyph barline="repeat-start" />, title: 'Start repeat' },
  { kind: 'repeat-end',   label: <BarlineGlyph barline="repeat-end" />,   title: 'End repeat' },
];

// Icons for each section in the rail
const SECTION_ICONS: { id: SectionId; titleKey: TranslationKey; icon: React.ReactNode }[] = [
  {
    id: 'selection',
    titleKey: 'palette.selection',
    icon: (
      <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.75}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M15 15l-2 5L9 9l11 4-5 2zm0 0l5 5" />
      </svg>
    ),
  },
  {
    id: 'transpose',
    titleKey: 'palette.transpose',
    icon: (
      <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.75}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M7 16V4m0 0L3 8m4-4l4 4m6 0v12m0 0l4-4m-4 4l-4-4" />
      </svg>
    ),
  },
  {
    id: 'articulations',
    titleKey: 'palette.articulations',
    icon: (
      <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.75}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M9 19V6l12-3v13M9 19c0 1.105-1.343 2-3 2s-3-.895-3-2 1.343-2 3-2 3 .895 3 2zm12-3c0 1.105-1.343 2-3 2s-3-.895-3-2 1.343-2 3-2 3 .895 3 2zM9 10l12-3" />
      </svg>
    ),
  },
  {
    id: 'dynamics',
    titleKey: 'palette.dynamics',
    icon: (
      <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.75}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M15.536 8.464a5 5 0 010 7.072M12 6a7 7 0 010 12M8.464 8.464a5 5 0 000 7.072" />
      </svg>
    ),
  },
  {
    id: 'ties',
    titleKey: 'palette.ties',
    icon: (
      <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.75}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M4 16c0-4 3.6-7 8-7s8 3 8 7" />
      </svg>
    ),
  },
  {
    id: 'barlines',
    titleKey: 'palette.barlines',
    icon: <BarlineGlyph barline="repeat-end" className="h-5 w-5" />,
  },
];

const PALETTE_SHORTCUTS = {
  copy: formatShortcutHint('Cmd/Ctrl+C'),
  cut: formatShortcutHint('Cmd/Ctrl+X'),
  paste: formatShortcutHint('Cmd/Ctrl+V'),
  duplicate: formatShortcutHint('Cmd/Ctrl+D'),
  delete: 'Delete / Backspace',
  clearSelection: 'Escape',
  tie: formatShortcutHint('T'),
  slur: formatShortcutHint('S'),
} as const;

function withShortcut(label: string, shortcut: string) {
  return `${label} (${shortcut})`;
}

export default function EditPalette({
  selectedNote,
  selectedNotes,
  selectedBarlineMeasureNumber = null,
  onToggleArticulation,
  onClearArticulations,
  onAddDynamic,
  onToggleTie,
  onToggleSlur,
  onTransposeSemitones,
  onSetBarline,
  onDuplicateSelection,
  onDeleteSelection,
  onClearSelection,
  onCopySelection,
  onCutSelection,
  onPasteClipboard,
  clipboardCount,
  iconMode = false,
}: Props) {
  const { t } = useI18n();
  const [collapsed, setCollapsed] = useState(false);
  const [openSections, setOpenSections] = useState<Record<SectionId, boolean>>(DEFAULT_OPEN);
  const [activeSection, setActiveSection] = useState<SectionId | null>(null);
  const sectionButtonRefs = useRef<Partial<Record<SectionId, HTMLButtonElement | null>>>({});
  const activePanelContentRef = useRef<HTMLDivElement | null>(null);

  const focusSectionButton = (section: SectionId) => {
    window.setTimeout(() => sectionButtonRefs.current[section]?.focus(), 0);
  };

  const focusPanelFirstControl = () => {
    window.setTimeout(() => {
      const firstControl = activePanelContentRef.current?.querySelector<HTMLElement>(
        'button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])',
      );
      firstControl?.focus();
    }, 0);
  };

  const toggleActiveSection = (section: SectionId, focusPanel = false) => {
    setActiveSection((current) => current === section ? null : section);
    if (focusPanel) {
      focusPanelFirstControl();
    }
  };

  const toggleSection = (id: SectionId) =>
    setOpenSections(prev => ({ ...prev, [id]: !prev[id] }));

  const disabled = !selectedNote;
  const barlineDisabled = !selectedNote && !selectedBarlineMeasureNumber;
  const isRest = selectedNote?.isRest ?? false;
  const selectionCount = selectedNotes.length || (selectedNote ? 1 : 0);
  const noteRequiredReason = t('command.disabled.noteRequired');
  const clipboardEmptyReason = t('command.disabled.clipboardEmpty');
  const pitchedNoteRequiredReason = t('command.disabled.pitchedNoteRequired');
  const pasteDisabledReason = !selectedNote
    ? noteRequiredReason
    : clipboardCount === 0
      ? clipboardEmptyReason
      : undefined;
  const pitchedActionDisabledReason = !selectedNote
    ? noteRequiredReason
    : isRest
      ? pitchedNoteRequiredReason
      : undefined;

  const activeSectionLabel = activeSection
    ? t(SECTION_ICONS.find(section => section.id === activeSection)?.titleKey ?? 'palette.selection')
    : '';
  const closeActiveSection = (restoreFocus = false) => {
    const sectionToFocus = activeSection;
    setActiveSection(null);
    if (restoreFocus && sectionToFocus) {
      focusSectionButton(sectionToFocus);
    }
  };

  useEffect(() => {
    if (typeof window === 'undefined' || typeof window.addEventListener !== 'function') return undefined;

    const focusTarget = (event: Event) => {
      const detail = event instanceof CustomEvent ? event.detail as { section?: SectionId } | null : null;
      const section = detail?.section;
      if (!section) return;
      setActiveSection(section);
      focusPanelFirstControl();
    };

    window.addEventListener('nex-note:focus-edit-palette-section', focusTarget);
    return () => window.removeEventListener('nex-note:focus-edit-palette-section', focusTarget);
  }, []);

  useEffect(() => {
    if (!activeSection || typeof window === 'undefined' || typeof window.addEventListener !== 'function') return undefined;
    const handleEscape = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return;
      event.preventDefault();
      event.stopPropagation();
      event.stopImmediatePropagation();
      closeActiveSection(true);
    };
    window.addEventListener('keydown', handleEscape, true);
    return () => window.removeEventListener('keydown', handleEscape, true);
  }, [activeSection]);

  // ── Icon rail mode ──────────────────────────────────────────────────────────
  if (iconMode) {
    return (
      <div
        className="w-10 bg-white border-r border-nex-border flex flex-col items-center py-2 gap-1 shrink-0 relative overflow-visible z-10"
        onKeyDown={(event) => {
          const activeButton = typeof document !== 'undefined' ? document.activeElement as HTMLButtonElement | null : null;
          const focusedSection = (activeButton?.dataset.paletteSection as SectionId | undefined) ?? activeSection ?? SECTION_ICONS[0]?.id;
          const currentIndex = SECTION_ICONS.findIndex(({ id }) => id === focusedSection);
          const moveFocus = (nextIndex: number) => {
            const section = SECTION_ICONS[nextIndex]?.id;
            if (section) focusSectionButton(section);
          };

          if (event.key === 'Escape' && activeSection) {
            event.preventDefault();
            closeActiveSection(true);
            return;
          }
          if (event.key === 'ArrowDown') {
            event.preventDefault();
            moveFocus(Math.min(currentIndex + 1, SECTION_ICONS.length - 1));
            return;
          }
          if (event.key === 'ArrowUp') {
            event.preventDefault();
            moveFocus(Math.max(currentIndex - 1, 0));
            return;
          }
          if (event.key === 'Home') {
            event.preventDefault();
            moveFocus(0);
            return;
          }
          if (event.key === 'End') {
            event.preventDefault();
            moveFocus(SECTION_ICONS.length - 1);
            return;
          }
          if (event.key === 'ArrowRight' && focusedSection) {
            event.preventDefault();
            setActiveSection(focusedSection);
            focusPanelFirstControl();
          }
        }}
      >
        {/* Section icon buttons */}
        {SECTION_ICONS.map(({ id, titleKey, icon }) => (
          <button
            key={id}
            ref={(element) => {
              sectionButtonRefs.current[id] = element;
            }}
            data-palette-section={id}
            onClick={() => toggleActiveSection(id)}
            onKeyDown={(event) => {
              if (event.key === 'Enter' || event.key === ' ') {
                event.preventDefault();
                toggleActiveSection(id, true);
              }
            }}
            title={t(titleKey)}
            aria-label={t(titleKey)}
            aria-expanded={activeSection === id}
            aria-controls={`edit-palette-panel-${id}`}
            aria-haspopup="dialog"
            className={`w-8 h-8 flex items-center justify-center rounded-md transition-colors ${
              activeSection === id
                ? 'nex-brand-active'
                : 'nex-brand-button'
            }`}
          >
            {icon}
          </button>
        ))}

        {/* Floating panel */}
        {activeSection && (
          <div
            id={`edit-palette-panel-${activeSection}`}
            role="dialog"
            aria-label={activeSectionLabel}
            onKeyDown={(event) => {
              if (event.key !== 'Escape') return;
              event.preventDefault();
              event.stopPropagation();
              closeActiveSection(true);
            }}
            className="absolute left-10 top-0 z-50 w-60 bg-white border border-nex-border rounded-lg shadow-lg overflow-y-auto max-h-[80vh]"
          >
            {/* Panel header */}
            <div className="flex items-center justify-between px-3 py-2 border-b border-nex-border">
              <span className="text-[11px] font-semibold text-slate-700 tracking-tight">
                {activeSectionLabel}
              </span>
              <button
                onClick={() => closeActiveSection(true)}
                aria-label={`${t('palette.closePanel')}: ${activeSectionLabel}`}
                className="w-5 h-5 flex items-center justify-center text-slate-400 hover:text-slate-700 rounded transition-colors"
              >
                <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>

            {/* Selected note indicator */}
            {selectedNote && (
              <div className="px-3 py-1.5 text-[11px] border-b border-nex-border text-slate-700 flex items-center gap-1.5">
                <span className="inline-block w-1.5 h-1.5 rounded-full bg-nex-accent" />
                <span className="font-medium">{isRest ? t('note.rest') : `${selectedNote.step}${selectedNote.alter === 1 ? '♯' : selectedNote.alter === -1 ? '♭' : ''}${selectedNote.octave}`}</span>
                <span className="text-slate-400">m.{selectedNote.measureNumber}</span>
                {selectionCount > 1 && (
                  <span className="ml-auto rounded bg-nex-surface px-1.5 py-0.5 text-[9px] font-semibold text-slate-600">
                    {selectionCount}
                  </span>
                )}
              </div>
            )}

            {/* Section content */}
            <div ref={activePanelContentRef} className="px-3 py-3">
              <PanelSectionContent
                section={activeSection}
                disabled={disabled}
                isRest={isRest}
                clipboardCount={clipboardCount}
                selectionCount={selectionCount}
                onCopySelection={onCopySelection}
                onCutSelection={onCutSelection}
                onPasteClipboard={onPasteClipboard}
                onDuplicateSelection={onDuplicateSelection}
                onDeleteSelection={onDeleteSelection}
                onClearSelection={onClearSelection}
                onTransposeSemitones={onTransposeSemitones}
                onToggleArticulation={onToggleArticulation}
                onClearArticulations={onClearArticulations}
                onAddDynamic={onAddDynamic}
                onToggleTie={onToggleTie}
                onToggleSlur={onToggleSlur}
                onSetBarline={onSetBarline}
                barlineDisabled={barlineDisabled}
              />
            </div>
          </div>
        )}
      </div>
    );
  }

  // ── Collapsed strip ─────────────────────────────────────────────────────────
  if (collapsed) {
    return (
      <div className="w-9 border-r border-nex-border bg-nex-surface flex flex-col items-center py-2 gap-1 shrink-0">
        <button
          onClick={() => setCollapsed(false)}
          title={t('palette.expand')}
          className="w-7 h-7 flex items-center justify-center rounded nex-brand-button transition-colors"
        >
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
          </svg>
        </button>
        <div className="w-6 h-px bg-nex-border my-1" />
        <span className="text-[9px] text-slate-400 rotate-180 mt-1" style={{ writingMode: 'vertical-rl' }}>
          {t('palette.title')}
        </span>
      </div>
    );
  }

  // ── Expanded sidebar (classic mode) ─────────────────────────────────────────
  return (
    <div className="w-56 border-r border-nex-border bg-nex-surface flex flex-col overflow-hidden shrink-0">
      <div className="flex items-center justify-between px-3 py-2 border-b border-nex-border bg-white">
        <span className="text-[11px] font-semibold text-slate-600 uppercase tracking-wide">{t('palette.title')}</span>
        <button
          onClick={() => setCollapsed(true)}
          title={t('palette.collapse')}
          className="w-6 h-6 flex items-center justify-center rounded text-slate-400 hover:text-nex-ink hover:bg-nex-surface transition-colors"
        >
          <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
          </svg>
        </button>
      </div>

      {!selectedNote && (
        <div className="px-3 py-2 text-[10px] text-slate-400 border-b border-nex-border">
          {t('palette.clickNote')}
        </div>
      )}
      {selectedNote && (
        <div className="px-3 py-1.5 text-[10px] border-b border-nex-border bg-nex-accent-muted text-nex-accent flex items-center gap-1.5 font-medium">
          <span className="inline-block w-1.5 h-1.5 rounded-full bg-nex-accent" />
          {isRest ? 'Rest' : `${selectedNote.step}${selectedNote.alter === 1 ? '♯' : selectedNote.alter === -1 ? '♭' : ''}${selectedNote.octave}`}
          <span className="text-nex-accent/60">· m.{selectedNote.measureNumber}</span>
          {selectionCount > 1 && (
            <span className="ml-auto rounded-full bg-white/70 px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wide text-nex-accent">
                    {selectionCount} {t('palette.selected')}
            </span>
          )}
        </div>
      )}

      <div className="flex-1 overflow-y-auto">
        <PaletteSection id="selection" title={t('palette.selection')} open={openSections.selection} onToggle={toggleSection}>
          <div className="grid grid-cols-2 gap-1">
            <PaletteButton title={withShortcut(t('command.copy.title'), PALETTE_SHORTCUTS.copy)} disabled={disabled} disabledReason={disabled ? noteRequiredReason : undefined} onClick={onCopySelection}>{t('palette.copy')}</PaletteButton>
            <PaletteButton title={withShortcut(t('command.cut.title'), PALETTE_SHORTCUTS.cut)} disabled={disabled} disabledReason={disabled ? noteRequiredReason : undefined} onClick={onCutSelection}>{t('palette.cut')}</PaletteButton>
            <PaletteButton title={withShortcut(t('command.paste.title'), PALETTE_SHORTCUTS.paste)} disabled={disabled || clipboardCount === 0} disabledReason={pasteDisabledReason} onClick={onPasteClipboard}>{t('palette.paste')}</PaletteButton>
            <PaletteButton title={withShortcut(t('palette.duplicate'), PALETTE_SHORTCUTS.duplicate)} disabled={disabled} disabledReason={disabled ? noteRequiredReason : undefined} onClick={onDuplicateSelection}>{t('palette.duplicate')}</PaletteButton>
            <PaletteButton title={withShortcut(t('palette.delete'), PALETTE_SHORTCUTS.delete)} disabled={disabled} disabledReason={disabled ? noteRequiredReason : undefined} onClick={onDeleteSelection}>{t('palette.delete')}</PaletteButton>
          </div>
          <button
            disabled={disabled}
            title={disabled ? `${withShortcut(t('palette.clearSelection'), PALETTE_SHORTCUTS.clearSelection)} - ${noteRequiredReason}` : withShortcut(t('palette.clearSelection'), PALETTE_SHORTCUTS.clearSelection)}
            aria-label={disabled ? `${withShortcut(t('palette.clearSelection'), PALETTE_SHORTCUTS.clearSelection)} - ${noteRequiredReason}` : withShortcut(t('palette.clearSelection'), PALETTE_SHORTCUTS.clearSelection)}
            onClick={onClearSelection}
            className="mt-1 w-full text-[10px] text-slate-400 hover:text-nex-ink disabled:text-slate-200 transition-colors text-left px-1"
          >
            {t('palette.clearSelection')}
          </button>
          <p className="mt-1 px-1 text-[10px] text-slate-400">{t('palette.clipboard')}: {clipboardCount}</p>
        </PaletteSection>

        <PaletteSection id="transpose" title={t('palette.transpose')} open={openSections.transpose} onToggle={toggleSection}>
          <div className="grid grid-cols-4 gap-1">
            <PaletteButton title="−1 octave" disabled={disabled || isRest} disabledReason={pitchedActionDisabledReason} onClick={() => onTransposeSemitones(-12)}>⤓8</PaletteButton>
            <PaletteButton title="−1 semitone" disabled={disabled || isRest} disabledReason={pitchedActionDisabledReason} onClick={() => onTransposeSemitones(-1)}>♭</PaletteButton>
            <PaletteButton title="+1 semitone" disabled={disabled || isRest} disabledReason={pitchedActionDisabledReason} onClick={() => onTransposeSemitones(1)}>♯</PaletteButton>
            <PaletteButton title="+1 octave" disabled={disabled || isRest} disabledReason={pitchedActionDisabledReason} onClick={() => onTransposeSemitones(12)}>⤒8</PaletteButton>
          </div>
          <div className="mt-1 grid grid-cols-2 gap-1">
            <PaletteButton title="−1 whole step" disabled={disabled || isRest} disabledReason={pitchedActionDisabledReason} onClick={() => onTransposeSemitones(-2)}>−M2</PaletteButton>
            <PaletteButton title="+1 whole step" disabled={disabled || isRest} disabledReason={pitchedActionDisabledReason} onClick={() => onTransposeSemitones(2)}>+M2</PaletteButton>
            <PaletteButton title="−perfect fifth" disabled={disabled || isRest} disabledReason={pitchedActionDisabledReason} onClick={() => onTransposeSemitones(-7)}>−P5</PaletteButton>
            <PaletteButton title="+perfect fifth" disabled={disabled || isRest} disabledReason={pitchedActionDisabledReason} onClick={() => onTransposeSemitones(7)}>+P5</PaletteButton>
          </div>
        </PaletteSection>

        <PaletteSection id="articulations" title={t('palette.articulations')} open={openSections.articulations} onToggle={toggleSection}>
          <div className="grid grid-cols-3 gap-1">
            {ARTICULATIONS.map(a => (
              <PaletteButton key={a.kind} title={a.title} disabled={disabled || isRest} disabledReason={pitchedActionDisabledReason} onClick={() => onToggleArticulation(a.kind)}>
                <span className="text-base leading-none">{a.label}</span>
              </PaletteButton>
            ))}
          </div>
          <button
            disabled={disabled}
            title={disabled ? `${t('palette.clearArticulations')} - ${noteRequiredReason}` : t('palette.clearArticulations')}
            aria-label={disabled ? `${t('palette.clearArticulations')} - ${noteRequiredReason}` : t('palette.clearArticulations')}
            onClick={onClearArticulations}
            className="mt-1 w-full text-[10px] text-slate-400 hover:text-rose-500 disabled:text-slate-200 transition-colors text-left px-1"
          >
            {t('palette.clearArticulations')}
          </button>
        </PaletteSection>

        <PaletteSection id="dynamics" title={t('palette.dynamics')} open={openSections.dynamics} onToggle={toggleSection}>
          <div className="grid grid-cols-4 gap-1">
            {DYNAMICS.map(d => (
            <PaletteButton key={d.kind} title={d.kind.toUpperCase()} disabled={disabled} disabledReason={disabled ? noteRequiredReason : undefined} focusableWhenDisabled onClick={() => onAddDynamic(d.kind)}>
                <span className="italic font-serif text-xs">{d.label}</span>
              </PaletteButton>
            ))}
          </div>
        </PaletteSection>

        <PaletteSection id="ties" title={t('palette.ties')} open={openSections.ties} onToggle={toggleSection}>
          <div className="grid grid-cols-2 gap-1">
            <PaletteButton title={withShortcut('Toggle tie start', PALETTE_SHORTCUTS.tie)} disabled={disabled || isRest} disabledReason={pitchedActionDisabledReason} onClick={onToggleTie}>
              <span className="tracking-tight">⌣ {t('palette.tie')}</span>
            </PaletteButton>
            <PaletteButton title={withShortcut('Toggle slur', PALETTE_SHORTCUTS.slur)} disabled={disabled || isRest} disabledReason={pitchedActionDisabledReason} onClick={onToggleSlur}>
              <span className="tracking-tight">︵ {t('palette.slur')}</span>
            </PaletteButton>
          </div>
          <p className="mt-1 text-[10px] text-slate-400 leading-snug">
            {t('palette.tieHelp')}
          </p>
        </PaletteSection>

        <PaletteSection id="barlines" title={t('palette.barlines')} open={openSections.barlines} onToggle={toggleSection}>
          <div className="grid grid-cols-5 gap-1">
            {BARLINES.map(b => (
              <PaletteButton key={b.kind} title={b.title} disabled={barlineDisabled} disabledReason={barlineDisabled ? noteRequiredReason : undefined} onClick={() => onSetBarline(b.kind)}>
                {b.label}
              </PaletteButton>
            ))}
          </div>
          <p className="mt-1 text-[10px] text-slate-400 leading-snug">{t('palette.barlinesHelp')}</p>
        </PaletteSection>
      </div>
    </div>
  );
}

// ─── Floating panel section content ──────────────────────────────────────────

function PanelSectionContent({
  section,
  disabled,
  isRest,
  clipboardCount,
  onCopySelection,
  onCutSelection,
  onPasteClipboard,
  onDuplicateSelection,
  onDeleteSelection,
  onClearSelection,
  onTransposeSemitones,
  onToggleArticulation,
  onClearArticulations,
  onAddDynamic,
  onToggleTie,
  onToggleSlur,
  onSetBarline,
  barlineDisabled = disabled,
}: {
  section: SectionId;
  disabled: boolean;
  isRest: boolean;
  clipboardCount: number;
  selectionCount: number;
  onCopySelection: () => void;
  onCutSelection: () => void;
  onPasteClipboard: () => void;
  onDuplicateSelection: () => void;
  onDeleteSelection: () => void;
  onClearSelection: () => void;
  onTransposeSemitones: (n: number) => void;
  onToggleArticulation: (a: ArticulationKind) => void;
  onClearArticulations: () => void;
  onAddDynamic: (d: DynamicKind) => void;
  onToggleTie: () => void;
  onToggleSlur: () => void;
  onSetBarline: (b: BarlineKind) => void;
  barlineDisabled?: boolean;
}) {
  const { t } = useI18n();
  const noteRequiredReason = t('command.disabled.noteRequired');
  const clipboardEmptyReason = t('command.disabled.clipboardEmpty');
  const pitchedNoteRequiredReason = t('command.disabled.pitchedNoteRequired');
  const pasteDisabledReason = disabled
    ? noteRequiredReason
    : clipboardCount === 0
      ? clipboardEmptyReason
      : undefined;
  const pitchedActionDisabledReason = disabled
    ? noteRequiredReason
    : isRest
      ? pitchedNoteRequiredReason
      : undefined;

  if (section === 'selection') {
    return (
      <div>
        {!disabled ? null : <p className="text-[10px] text-slate-400 mb-2">{t('palette.clickNote')}</p>}
        <div className="grid grid-cols-2 gap-1">
          <PaletteButton title={withShortcut(t('command.copy.title'), PALETTE_SHORTCUTS.copy)} disabled={disabled} disabledReason={disabled ? noteRequiredReason : undefined} onClick={onCopySelection}>{t('palette.copy')}</PaletteButton>
          <PaletteButton title={withShortcut(t('command.cut.title'), PALETTE_SHORTCUTS.cut)} disabled={disabled} disabledReason={disabled ? noteRequiredReason : undefined} onClick={onCutSelection}>{t('palette.cut')}</PaletteButton>
          <PaletteButton title={withShortcut(t('command.paste.title'), PALETTE_SHORTCUTS.paste)} disabled={disabled || clipboardCount === 0} disabledReason={pasteDisabledReason} onClick={onPasteClipboard}>{t('palette.paste')}</PaletteButton>
          <PaletteButton title={withShortcut(t('palette.duplicate'), PALETTE_SHORTCUTS.duplicate)} disabled={disabled} disabledReason={disabled ? noteRequiredReason : undefined} onClick={onDuplicateSelection}>{t('palette.duplicate')}</PaletteButton>
          <PaletteButton title={withShortcut(t('palette.delete'), PALETTE_SHORTCUTS.delete)} disabled={disabled} disabledReason={disabled ? noteRequiredReason : undefined} onClick={onDeleteSelection}>{t('palette.delete')}</PaletteButton>
        </div>
        <button
          disabled={disabled}
          title={disabled ? `${withShortcut(t('palette.clearSelection'), PALETTE_SHORTCUTS.clearSelection)} - ${noteRequiredReason}` : withShortcut(t('palette.clearSelection'), PALETTE_SHORTCUTS.clearSelection)}
          aria-label={disabled ? `${withShortcut(t('palette.clearSelection'), PALETTE_SHORTCUTS.clearSelection)} - ${noteRequiredReason}` : withShortcut(t('palette.clearSelection'), PALETTE_SHORTCUTS.clearSelection)}
          onClick={onClearSelection}
          className="mt-2 w-full text-[10px] text-slate-400 hover:text-slate-700 disabled:text-slate-200 transition-colors text-left px-1"
        >
          {t('palette.clearSelection')}
        </button>
        <p className="mt-1 px-1 text-[10px] text-slate-400">{t('palette.clipboard')}: {clipboardCount}</p>
      </div>
    );
  }

  if (section === 'transpose') {
    return (
      <div>
        <div className="grid grid-cols-4 gap-1">
          <PaletteButton title="−1 octave" disabled={disabled || isRest} disabledReason={pitchedActionDisabledReason} onClick={() => onTransposeSemitones(-12)}>⤓8</PaletteButton>
          <PaletteButton title="−1 semitone" disabled={disabled || isRest} disabledReason={pitchedActionDisabledReason} onClick={() => onTransposeSemitones(-1)}>♭</PaletteButton>
          <PaletteButton title="+1 semitone" disabled={disabled || isRest} disabledReason={pitchedActionDisabledReason} onClick={() => onTransposeSemitones(1)}>♯</PaletteButton>
          <PaletteButton title="+1 octave" disabled={disabled || isRest} disabledReason={pitchedActionDisabledReason} onClick={() => onTransposeSemitones(12)}>⤒8</PaletteButton>
        </div>
        <div className="mt-1 grid grid-cols-2 gap-1">
          <PaletteButton title="−1 whole step" disabled={disabled || isRest} disabledReason={pitchedActionDisabledReason} onClick={() => onTransposeSemitones(-2)}>−M2</PaletteButton>
          <PaletteButton title="+1 whole step" disabled={disabled || isRest} disabledReason={pitchedActionDisabledReason} onClick={() => onTransposeSemitones(2)}>+M2</PaletteButton>
          <PaletteButton title="−perfect fifth" disabled={disabled || isRest} disabledReason={pitchedActionDisabledReason} onClick={() => onTransposeSemitones(-7)}>−P5</PaletteButton>
          <PaletteButton title="+perfect fifth" disabled={disabled || isRest} disabledReason={pitchedActionDisabledReason} onClick={() => onTransposeSemitones(7)}>+P5</PaletteButton>
        </div>
      </div>
    );
  }

  if (section === 'articulations') {
    return (
      <div>
        <div className="grid grid-cols-3 gap-1">
          {ARTICULATIONS.map(a => (
            <PaletteButton key={a.kind} title={a.title} disabled={disabled || isRest} disabledReason={pitchedActionDisabledReason} onClick={() => onToggleArticulation(a.kind)}>
              <span className="text-base leading-none">{a.label}</span>
            </PaletteButton>
          ))}
        </div>
        <button
          disabled={disabled}
          title={disabled ? `${t('palette.clearArticulations')} - ${noteRequiredReason}` : t('palette.clearArticulations')}
          aria-label={disabled ? `${t('palette.clearArticulations')} - ${noteRequiredReason}` : t('palette.clearArticulations')}
          onClick={onClearArticulations}
          className="mt-2 w-full text-[10px] text-slate-400 hover:text-red-500 disabled:text-slate-200 transition-colors text-left px-1"
        >
          {t('palette.clearArticulations')}
        </button>
      </div>
    );
  }

  if (section === 'dynamics') {
    return (
      <div className="grid grid-cols-4 gap-1">
        {DYNAMICS.map(d => (
          <PaletteButton key={d.kind} title={d.kind.toUpperCase()} disabled={disabled} disabledReason={disabled ? noteRequiredReason : undefined} focusableWhenDisabled onClick={() => onAddDynamic(d.kind)}>
            <span className="italic font-serif text-xs">{d.label}</span>
          </PaletteButton>
        ))}
      </div>
    );
  }

  if (section === 'ties') {
    return (
      <div>
        <div className="grid grid-cols-2 gap-1">
          <PaletteButton title={withShortcut(t('command.tie.title'), PALETTE_SHORTCUTS.tie)} disabled={disabled || isRest} disabledReason={pitchedActionDisabledReason} onClick={onToggleTie}>
            <span className="tracking-tight">⌣ {t('palette.tie')}</span>
          </PaletteButton>
          <PaletteButton title={withShortcut(t('command.slur.title'), PALETTE_SHORTCUTS.slur)} disabled={disabled || isRest} disabledReason={pitchedActionDisabledReason} onClick={onToggleSlur}>
            <span className="tracking-tight">︵ {t('palette.slur')}</span>
          </PaletteButton>
        </div>
        <p className="mt-2 text-[10px] text-slate-400 leading-snug">
          {t('palette.tieHelp')}
        </p>
      </div>
    );
  }

  if (section === 'barlines') {
    return (
      <div>
        <div className="grid grid-cols-5 gap-1">
          {BARLINES.map(b => (
            <PaletteButton key={b.kind} title={b.title} disabled={barlineDisabled} disabledReason={barlineDisabled ? noteRequiredReason : undefined} onClick={() => onSetBarline(b.kind)}>
              {b.label}
            </PaletteButton>
          ))}
        </div>
        <p className="mt-2 text-[10px] text-slate-400 leading-snug">{t('palette.barlinesHelp')}</p>
      </div>
    );
  }

  return null;
}

// ─── Subcomponents ───────────────────────────────────────────────────────────

function PaletteSection({
  id, title, open, onToggle, children,
}: {
  id: SectionId;
  title: string;
  open: boolean;
  onToggle: (id: SectionId) => void;
  children: React.ReactNode;
}) {
  return (
    <div className="border-b border-nex-border">
      <button
        onClick={() => onToggle(id)}
        aria-expanded={open}
        className="w-full flex items-center gap-1.5 px-3 py-1.5 text-[10px] font-semibold uppercase tracking-wide text-slate-500 hover:text-nex-ink hover:bg-white transition-colors"
      >
        <svg className={`w-3 h-3 transition-transform ${open ? 'rotate-90' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
        </svg>
        {title}
      </button>
      {open && <div className="px-3 pb-2 pt-0.5">{children}</div>}
    </div>
  );
}

function PaletteButton({
  children, onClick, disabled, title, full, disabledReason, focusableWhenDisabled,
}: {
  children: React.ReactNode;
  onClick: () => void;
  disabled?: boolean;
  title?: string;
  full?: boolean;
  disabledReason?: string;
  focusableWhenDisabled?: boolean;
}) {
  const resolvedTitle = title && disabled && disabledReason ? `${title} - ${disabledReason}` : title;
  const nativeDisabled = Boolean(disabled && !focusableWhenDisabled);
  return (
    <button
      onClick={() => {
        if (disabled) return;
        onClick();
      }}
      disabled={nativeDisabled}
      aria-disabled={disabled || undefined}
      title={resolvedTitle}
      aria-label={resolvedTitle}
      className={`${full ? 'w-full' : ''} h-8 flex items-center justify-center rounded-md text-xs font-medium transition-colors ${
        disabled
          ? 'text-slate-300 cursor-not-allowed'
          : 'text-slate-700 hover:bg-nex-surface hover:text-nex-accent'
      }`}
    >
      {children}
    </button>
  );
}
