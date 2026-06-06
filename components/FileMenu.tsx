'use client';

import { useEffect, useRef, useState } from 'react';
import { formatShortcutHint } from '@/lib/shortcut-hints';

export interface FileMenuItem {
  id: string;
  label: string;
  shortcut?: string;
  disabled?: boolean;
  disabledReason?: string;
  danger?: boolean;
  separatorBefore?: boolean;
  onRun: () => void | Promise<void>;
}

interface Props {
  menuId: string;
  label: string;
  items: FileMenuItem[];
}

function getMenubarTriggers(currentMenuId?: string) {
  if (typeof document === 'undefined') return [];
  return Array.from(document.querySelectorAll<HTMLButtonElement>('[data-menubar-trigger="true"]'))
    .filter((button) => !currentMenuId || button.dataset.menuId !== currentMenuId);
}

export default function FileMenu({ menuId, label, items }: Props) {
  const [open, setOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(0);
  const [pendingFocusIndex, setPendingFocusIndex] = useState<number | null>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const itemRefs = useRef<Array<HTMLButtonElement | null>>([]);

  const firstEnabledIndex = () => {
    const index = items.findIndex((item) => !item.disabled);
    return index >= 0 ? index : 0;
  };

  const lastEnabledIndex = () => {
    for (let index = items.length - 1; index >= 0; index -= 1) {
      if (!items[index].disabled) return index;
    }
    return Math.max(items.length - 1, 0);
  };

  const moveEnabledIndex = (currentIndex: number, direction: 1 | -1) => {
    if (items.length === 0) return 0;
    if (!items.some((item) => !item.disabled)) return currentIndex;

    let index = currentIndex;
    for (let step = 0; step < items.length; step += 1) {
      index = (index + direction + items.length) % items.length;
      if (!items[index].disabled) return index;
    }

    return currentIndex;
  };

  useEffect(() => {
    if (!open) return;
    if (
      typeof window === 'undefined'
      || typeof window.addEventListener !== 'function'
      || typeof window.removeEventListener !== 'function'
    ) {
      return;
    }

    const onPointerDown = (event: PointerEvent) => {
      if (!menuRef.current?.contains(event.target as Node)) {
        setOpen(false);
      }
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setOpen(false);
        triggerRef.current?.focus();
      }
    };

    window.addEventListener('pointerdown', onPointerDown);
    window.addEventListener('keydown', onKeyDown);
    return () => {
      window.removeEventListener('pointerdown', onPointerDown);
      window.removeEventListener('keydown', onKeyDown);
    };
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const index = pendingFocusIndex ?? firstEnabledIndex();
    setActiveIndex(index);
    setPendingFocusIndex(null);
    window.setTimeout(() => itemRefs.current[index]?.focus(), 0);
  }, [items, open, pendingFocusIndex]);

  useEffect(() => {
    if (!open) return;
    itemRefs.current[activeIndex]?.focus();
  }, [activeIndex, open]);

  const runItem = (item: FileMenuItem) => {
    if (item.disabled) return;
    setOpen(false);
    void item.onRun();
  };

  const focusAdjacentTrigger = (direction: 1 | -1, openTarget = false) => {
    if (typeof document === 'undefined') return;
    const triggers = Array.from(document.querySelectorAll<HTMLButtonElement>('[data-menubar-trigger="true"]'));
    const currentIndex = triggers.findIndex((button) => button.dataset.menuId === menuId);
    if (currentIndex < 0 || triggers.length === 0) return;
    const nextIndex = (currentIndex + direction + triggers.length) % triggers.length;
    const nextTrigger = triggers[nextIndex];
    if (!nextTrigger) return;
    nextTrigger.focus();
    if (openTarget) {
      nextTrigger.click();
    }
  };

  const focusEdgeTrigger = (edge: 'first' | 'last') => {
    const triggers = getMenubarTriggers();
    if (triggers.length === 0) return;
    const target = edge === 'first' ? triggers[0] : triggers[triggers.length - 1];
    target?.focus();
  };

  const openMenuAt = (index: number) => {
    setPendingFocusIndex(index);
    setOpen(true);
  };

  return (
    <div ref={menuRef} className="relative">
      <button
        ref={triggerRef}
        type="button"
        data-menubar-trigger="true"
        data-menu-id={menuId}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-controls={open ? `file-menu-${menuId}` : undefined}
        onClick={() => setOpen((value) => !value)}
        onKeyDown={(event) => {
          if (event.key === 'ArrowDown') {
            event.preventDefault();
            openMenuAt(firstEnabledIndex());
            return;
          }
          if (event.key === 'ArrowUp') {
            event.preventDefault();
            openMenuAt(lastEnabledIndex());
            return;
          }
          if (event.key === 'ArrowRight') {
            event.preventDefault();
            if (open) {
              setOpen(false);
              focusAdjacentTrigger(1, true);
            } else {
              focusAdjacentTrigger(1);
            }
            return;
          }
          if (event.key === 'ArrowLeft') {
            event.preventDefault();
            if (open) {
              setOpen(false);
              focusAdjacentTrigger(-1, true);
            } else {
              focusAdjacentTrigger(-1);
            }
            return;
          }
          if (event.key === 'Home') {
            event.preventDefault();
            focusEdgeTrigger('first');
            return;
          }
          if (event.key === 'End') {
            event.preventDefault();
            focusEdgeTrigger('last');
            return;
          }
          if (event.key === 'Enter' || event.key === ' ') {
            event.preventDefault();
            if (open) {
              setOpen(false);
            } else {
              openMenuAt(firstEnabledIndex());
            }
          }
        }}
        className={`h-8 rounded-md border px-3 text-xs font-semibold transition-colors ${
          open
            ? 'border-nex-accent bg-nex-accent text-white'
            : 'border-nex-border bg-nex-surface text-slate-600 hover:border-slate-300 hover:bg-white hover:text-nex-ink'
        }`}
      >
        <span className="inline-flex items-center gap-1.5">
          {label}
          <svg className="h-3 w-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2} aria-hidden>
            <path strokeLinecap="round" strokeLinejoin="round" d="m6 9 6 6 6-6" />
          </svg>
        </span>
      </button>

      {open && (
        <div
          id={`file-menu-${menuId}`}
          role="menu"
          onKeyDown={(event) => {
            if (event.key === 'ArrowDown') {
              event.preventDefault();
              setActiveIndex((index) => moveEnabledIndex(index, 1));
              return;
            }
            if (event.key === 'ArrowUp') {
              event.preventDefault();
              setActiveIndex((index) => moveEnabledIndex(index, -1));
              return;
            }
            if (event.key === 'Home') {
              event.preventDefault();
              setActiveIndex(firstEnabledIndex());
              return;
            }
            if (event.key === 'End') {
              event.preventDefault();
              setActiveIndex(lastEnabledIndex());
              return;
            }
            if (event.key === 'ArrowRight') {
              event.preventDefault();
              setOpen(false);
              focusAdjacentTrigger(1, true);
              return;
            }
            if (event.key === 'ArrowLeft') {
              event.preventDefault();
              setOpen(false);
              focusAdjacentTrigger(-1, true);
              return;
            }
            if (event.key === 'Tab') {
              setOpen(false);
            }
          }}
          className="absolute right-0 top-9 z-40 w-64 overflow-hidden rounded-xl border border-slate-200 bg-white py-1.5 shadow-[0_18px_60px_-24px_rgba(15,23,42,0.65)]"
        >
          {items.map((item, index) => {
            const title = item.disabled && item.disabledReason
              ? `${item.label} - ${item.disabledReason}`
              : item.label;

            return (
              <div key={item.id}>
                {item.separatorBefore && <div className="my-1 border-t border-slate-100" />}
                <button
                  ref={(element) => {
                    itemRefs.current[index] = element;
                  }}
                  type="button"
                  role="menuitem"
                  aria-disabled={item.disabled || undefined}
                  aria-label={title}
                  title={title}
                  onClick={() => runItem(item)}
                  onMouseEnter={() => {
                    setActiveIndex(index);
                  }}
                  tabIndex={index === activeIndex ? 0 : -1}
                  className={`flex min-h-9 w-full items-center justify-between gap-3 px-3 py-1.5 text-left text-sm transition-colors ${
                    item.disabled
                      ? 'cursor-not-allowed text-slate-300'
                      : index === activeIndex
                        ? item.danger
                          ? 'bg-rose-50 text-rose-800'
                          : 'bg-slate-100 text-slate-950'
                      : item.danger
                        ? 'text-rose-700 hover:bg-rose-50'
                        : 'text-slate-700 hover:bg-slate-50 hover:text-slate-950'
                  }`}
                >
                  <span className="min-w-0">
                    <span className="block truncate">{item.label}</span>
                    {item.disabled && item.disabledReason && (
                      <span className="block truncate text-[10px] font-medium text-slate-400">
                        {item.disabledReason}
                      </span>
                    )}
                  </span>
                  {item.shortcut && (
                    <kbd className="shrink-0 rounded border border-slate-200 bg-slate-50 px-1.5 py-0.5 text-[10px] font-semibold text-slate-400">
                      {formatShortcutHint(item.shortcut)}
                    </kbd>
                  )}
                </button>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
