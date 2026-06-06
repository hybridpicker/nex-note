'use client';

import type { ReactNode } from 'react';

type Props = {
  collapsed: boolean;
  onToggleCollapsed: () => void;
  labels: {
    show: string;
    hide: string;
    title: string;
  };
  collapsedActions?: ReactNode;
  children?: ReactNode;
};

export default function LeftNotationSidebar({ collapsed, onToggleCollapsed, labels, collapsedActions, children }: Props) {
  const buttonLabel = collapsed ? labels.show : labels.hide;

  return (
    <aside
      className={`nex-left-tools-shell ${collapsed ? 'nex-left-tools-shell--collapsed' : 'nex-left-tools-shell--expanded'}`}
      aria-label={labels.title}
      data-testid="left-notation-sidebar"
    >
      {collapsed ? (
        <div className="nex-left-tools-rail" data-testid="left-notation-sidebar-collapsed-rail">
          <button
            type="button"
            onClick={onToggleCollapsed}
            className="nex-left-tools-toggle"
            aria-label={buttonLabel}
            aria-expanded={false}
            aria-controls="nex-left-notation-tools-panel"
            title={buttonLabel}
          >
            <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2} aria-hidden>
              <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
            </svg>
          </button>
          {collapsedActions && (
            <div className="mt-2 flex flex-col items-center gap-1">
              {collapsedActions}
            </div>
          )}
          <span className="nex-left-tools-rail-label">{labels.title}</span>
        </div>
      ) : (
        <div id="nex-left-notation-tools-panel" className="nex-left-tools-panel">
          <div className="nex-left-tools-header">
            <span className="text-[11px] font-semibold uppercase tracking-wide text-slate-600">{labels.title}</span>
            <button
              type="button"
              onClick={onToggleCollapsed}
              className="nex-left-tools-toggle"
              aria-label={buttonLabel}
              aria-expanded={true}
              aria-controls="nex-left-notation-tools-panel"
              title={buttonLabel}
            >
              <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2} aria-hidden>
                <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
              </svg>
            </button>
          </div>
          <div className="nex-left-tools-content">
            {children}
          </div>
        </div>
      )}
    </aside>
  );
}
