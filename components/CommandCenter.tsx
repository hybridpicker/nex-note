'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { useI18n } from '@/lib/i18n';
import { formatShortcutHint } from '@/lib/shortcut-hints';

export interface CommandCenterAction {
  id: string;
  title: string;
  description?: string;
  group: string;
  keywords?: string[];
  shortcut?: string;
  disabled?: boolean;
  disabledReason?: string;
  onRun: () => void;
}

interface Props {
  open: boolean;
  actions: CommandCenterAction[];
  onClose: () => void;
  onSubmitQuery?: (query: string) => boolean;
}

const INERTED_ATTR = 'data-command-center-inerted';
const PREV_ARIA_HIDDEN_ATTR = 'data-command-center-prev-aria-hidden';
const PREV_INERT_ATTR = 'data-command-center-prev-inert';
const ABSENT_ATTR_VALUE = '__absent__';

function restoreCommandCenterInertedElements(root?: ParentNode) {
  const searchRoot = root ?? (typeof document === 'undefined' ? null : document);
  if (!searchRoot) return;
  searchRoot.querySelectorAll<HTMLElement>(`[${INERTED_ATTR}="true"]`).forEach((element) => {
    const previousAriaHidden = element.getAttribute(PREV_ARIA_HIDDEN_ATTR);
    const previousInert = element.getAttribute(PREV_INERT_ATTR);

    if (previousAriaHidden === ABSENT_ATTR_VALUE || previousAriaHidden === null) {
      element.removeAttribute('aria-hidden');
    } else {
      element.setAttribute('aria-hidden', previousAriaHidden);
    }
    element.inert = previousInert === 'true';
    element.removeAttribute(INERTED_ATTR);
    element.removeAttribute(PREV_ARIA_HIDDEN_ATTR);
    element.removeAttribute(PREV_INERT_ATTR);
  });
}

function normalize(value: string) {
  return value.trim().toLowerCase();
}

function matchesQuery(action: CommandCenterAction, query: string) {
  const tokens = normalize(query).split(/\s+/).filter(Boolean);
  if (tokens.length === 0) return true;

  const haystack = normalize([
    action.title,
    action.description ?? '',
    action.disabledReason ?? '',
    action.group,
    action.keywords?.join(' ') ?? '',
    action.shortcut ?? '',
  ].join(' '));

  return tokens.every((token) => haystack.includes(token));
}

function keepGroupsContiguous(actions: CommandCenterAction[]) {
  const groups: Array<{ group: string; actions: CommandCenterAction[] }> = [];
  const groupsByName = new Map<string, CommandCenterAction[]>();

  for (const action of actions) {
    let groupActions = groupsByName.get(action.group);
    if (!groupActions) {
      groupActions = [];
      groupsByName.set(action.group, groupActions);
      groups.push({ group: action.group, actions: groupActions });
    }
    groupActions.push(action);
  }

  return groups.flatMap((group) => [
    ...group.actions.filter((action) => !action.disabled),
    ...group.actions.filter((action) => action.disabled),
  ]);
}

function firstRunnableIndex(actions: CommandCenterAction[]) {
  const index = actions.findIndex((action) => !action.disabled);
  return index >= 0 ? index : 0;
}

function lastRunnableIndex(actions: CommandCenterAction[]) {
  for (let index = actions.length - 1; index >= 0; index -= 1) {
    if (!actions[index].disabled) return index;
  }
  return Math.max(actions.length - 1, 0);
}

function moveRunnableIndex(actions: CommandCenterAction[], currentIndex: number, direction: 1 | -1) {
  if (actions.length === 0) return 0;
  const clampedIndex = Math.min(Math.max(currentIndex, 0), actions.length - 1);
  const hasRunnableAction = actions.some((action) => !action.disabled);

  if (!hasRunnableAction) {
    return Math.min(Math.max(clampedIndex + direction, 0), actions.length - 1);
  }

  for (
    let index = clampedIndex + direction;
    index >= 0 && index < actions.length;
    index += direction
  ) {
    if (!actions[index].disabled) return index;
  }

  return clampedIndex;
}

function buildActionAssistiveLabel(action: CommandCenterAction, disabledLabel: string) {
  const parts = [action.title];
  if (action.shortcut) {
    parts.push(formatShortcutHint(action.shortcut));
  }
  if (action.disabled && action.disabledReason) {
    parts.push(`${disabledLabel}: ${action.disabledReason}`);
  } else if (action.description) {
    parts.push(action.description);
  }
  return parts.join(' - ');
}

export default function CommandCenter({ open, actions, onClose, onSubmitQuery }: Props) {
  const { t } = useI18n();
  const [query, setQuery] = useState('');
  const [activeIndex, setActiveIndex] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const dialogRef = useRef<HTMLDivElement>(null);
  const returnFocusRef = useRef<HTMLElement | null>(null);

  const filteredActions = useMemo(() => {
    const visible = actions.filter((action) => matchesQuery(action, query));
    return keepGroupsContiguous(visible);
  }, [actions, query]);

  useEffect(() => {
    if (!open) return;
    returnFocusRef.current = typeof document !== 'undefined' && document.activeElement instanceof HTMLElement
      ? document.activeElement
      : null;
    setQuery('');
    setActiveIndex(0);
    window.setTimeout(() => inputRef.current?.focus(), 0);
  }, [open]);

  useEffect(() => {
    restoreCommandCenterInertedElements();
    if (!open) return;
    const dialog = dialogRef.current;
    const parent = dialog?.parentElement;
    if (!dialog || !parent) return;

    const changedSiblings = Array.from(parent.children)
      .filter((element): element is HTMLElement => element instanceof HTMLElement && element !== dialog)
      .map((element) => ({ element }));

    for (const { element } of changedSiblings) {
      element.setAttribute(PREV_ARIA_HIDDEN_ATTR, element.getAttribute('aria-hidden') ?? ABSENT_ATTR_VALUE);
      element.setAttribute(PREV_INERT_ATTR, String(element.inert));
      element.setAttribute(INERTED_ATTR, 'true');
      element.setAttribute('aria-hidden', 'true');
      element.inert = true;
    }

    return () => {
      restoreCommandCenterInertedElements(parent);
    };
  }, [open]);

  useEffect(() => {
    if (!open) return;
    setActiveIndex((index) => {
      if (filteredActions.length === 0) return 0;
      const clampedIndex = Math.min(index, filteredActions.length - 1);
      return filteredActions[clampedIndex]?.disabled ? firstRunnableIndex(filteredActions) : clampedIndex;
    });
  }, [filteredActions, open]);

  useEffect(() => {
    if (!open || typeof document === 'undefined') return;
    const element = document.getElementById(`command-center-action-${activeIndex}`);
    if (element && typeof element.scrollIntoView === 'function') {
      element.scrollIntoView({ block: 'nearest' });
    }
  }, [activeIndex, open]);

  if (!open) return null;

  const closeAndRestoreFocus = () => {
    const returnTarget = returnFocusRef.current;
    onClose();
    window.setTimeout(() => {
      if (returnTarget && typeof document !== 'undefined' && document.contains(returnTarget)) {
        returnTarget.focus();
      }
    }, 0);
  };

  const runAction = (action: CommandCenterAction | undefined) => {
    if (!action || action.disabled) return;
    action.onRun();
    onClose();
  };

  const groupedActions = filteredActions.reduce<Array<{ group: string; actions: CommandCenterAction[] }>>((groups, action) => {
    const current = groups[groups.length - 1];
    if (current?.group === action.group) {
      current.actions.push(action);
      return groups;
    }
    groups.push({ group: action.group, actions: [action] });
    return groups;
  }, []);

  let actionOffset = 0;

  return (
    <div ref={dialogRef} className="fixed inset-0 z-50 flex items-start justify-center bg-slate-950/25 px-4 pt-[10vh]" role="dialog" aria-modal="true">
      <div className="w-full max-w-2xl overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-[0_24px_90px_-24px_rgba(15,23,42,0.45)]">
        <div className="border-b border-slate-200 p-3">
          <div className="flex items-center gap-3 rounded-xl border border-slate-200 bg-slate-50 px-3">
            <svg className="h-4 w-4 shrink-0 text-slate-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8} aria-hidden>
              <path strokeLinecap="round" strokeLinejoin="round" d="m21 21-4.35-4.35M11 18a7 7 0 1 1 0-14 7 7 0 0 1 0 14z" />
            </svg>
            <input
              ref={inputRef}
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === 'Escape') {
                  event.preventDefault();
                  closeAndRestoreFocus();
                  return;
                }
                if (event.key === 'ArrowDown') {
                  event.preventDefault();
                  setActiveIndex((index) => moveRunnableIndex(filteredActions, index, 1));
                  return;
                }
                if (event.key === 'ArrowUp') {
                  event.preventDefault();
                  setActiveIndex((index) => moveRunnableIndex(filteredActions, index, -1));
                  return;
                }
                if (event.key === 'Home') {
                  event.preventDefault();
                  setActiveIndex(firstRunnableIndex(filteredActions));
                  return;
                }
                if (event.key === 'End') {
                  event.preventDefault();
                  setActiveIndex(lastRunnableIndex(filteredActions));
                  return;
                }
                if (event.key === 'Enter') {
                  event.preventDefault();
                  if (onSubmitQuery?.(query)) {
                    onClose();
                    return;
                  }
                  runAction(filteredActions[activeIndex]);
                }
              }}
              placeholder={t('command.placeholder')}
              className="h-12 min-w-0 flex-1 bg-transparent text-sm text-slate-900 outline-none placeholder:text-slate-400"
            />
            <kbd className="rounded-md border border-slate-200 bg-white px-1.5 py-0.5 text-[10px] font-semibold text-slate-400">Esc</kbd>
          </div>
        </div>

        <div className="max-h-[58vh] overflow-auto p-2">
          {filteredActions.length === 0 ? (
            <div className="px-4 py-10 text-center text-sm text-slate-500">{t('command.noMatches')}</div>
          ) : groupedActions.map((group) => {
            const start = actionOffset;
            actionOffset += group.actions.length;
            return (
              <section key={group.group} className="py-1">
                <p className="px-3 pb-1 pt-2 text-[10px] font-semibold uppercase tracking-[0.18em] text-slate-400">{group.group}</p>
                <div className="space-y-1">
                  {group.actions.map((action, index) => {
                    const absoluteIndex = start + index;
                    const active = absoluteIndex === activeIndex;
                    const assistiveLabel = buildActionAssistiveLabel(action, t('command.disabledLabel'));
                    const detail = action.disabled && action.disabledReason
                      ? `${t('command.disabledLabel')}: ${action.disabledReason}`
                      : action.description;
                    return (
                      <button
                        key={action.id}
                        id={`command-center-action-${absoluteIndex}`}
                        type="button"
                        disabled={action.disabled}
                        aria-disabled={action.disabled || undefined}
                        aria-label={assistiveLabel}
                        title={assistiveLabel}
                        onPointerMove={() => {
                          if (activeIndex !== absoluteIndex && !action.disabled) setActiveIndex(absoluteIndex);
                        }}
                        onClick={() => runAction(action)}
                        className={`flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left transition-colors ${
                          action.disabled
                            ? 'cursor-not-allowed opacity-40'
                            : active
                              ? 'bg-nex-accent text-white'
                              : 'text-slate-700 hover:bg-slate-100'
                        }`}
                      >
                        <span className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-xs font-semibold ${
                          active && !action.disabled ? 'bg-white/20 text-white' : 'bg-slate-100 text-slate-500'
                        }`}>
                          {action.title.slice(0, 1)}
                        </span>
                        <span className="min-w-0 flex-1">
                          <span className="block truncate text-sm font-semibold">{action.title}</span>
                          {detail && (
                            <span className={`block truncate text-xs ${active && !action.disabled ? 'text-white/75' : 'text-slate-500'}`}>
                              {detail}
                            </span>
                          )}
                        </span>
                        {action.disabled && action.disabledReason && (
                          <span className="shrink-0 rounded-full border border-slate-200 bg-white px-2 py-0.5 text-[10px] font-semibold text-slate-400">
                            {t('command.disabledPill')}
                          </span>
                        )}
                        {action.shortcut && (
                          <kbd className={`shrink-0 rounded-md px-1.5 py-0.5 text-[10px] font-semibold ${
                            active && !action.disabled ? 'bg-white/20 text-white' : 'border border-slate-200 bg-white text-slate-400'
                          }`}>
                            {formatShortcutHint(action.shortcut)}
                          </kbd>
                        )}
                      </button>
                    );
                  })}
                </div>
              </section>
            );
          })}
        </div>
      </div>
    </div>
  );
}
